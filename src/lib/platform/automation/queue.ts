/**
 * Automation job queue — delayed advance / retries / timeout checks.
 * Processed by `/api/flows/cron` alongside the abandoned-run sweep.
 */

import { supabaseAdmin } from "@/lib/flows/admin-client";

export type AutomationJobType = "advance" | "retry_node" | "timeout_check";

export interface EnqueueJobInput {
  accountId: string;
  flowId?: string | null;
  flowRunId?: string | null;
  jobType: AutomationJobType;
  payload?: Record<string, unknown>;
  runAfter?: Date;
  maxAttempts?: number;
}

export async function enqueueAutomationJob(
  input: EnqueueJobInput,
): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("automation_job_queue")
    .insert({
      account_id: input.accountId,
      flow_id: input.flowId ?? null,
      flow_run_id: input.flowRunId ?? null,
      job_type: input.jobType,
      payload: input.payload ?? {},
      run_after: (input.runAfter ?? new Date()).toISOString(),
      max_attempts: input.maxAttempts ?? 5,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[automation-queue] enqueue failed:", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * Claim and process due jobs. Keep handlers thin — heavy work stays
 * in the flow engine / future node runners.
 */
export async function processDueAutomationJobs(
  limit = 50,
): Promise<{ processed: number; failed: number }> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: jobs, error } = await db
    .from("automation_job_queue")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("run_after", { ascending: true })
    .limit(limit);

  if (error || !jobs?.length) {
    if (error) console.error("[automation-queue] claim failed:", error.message);
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const raw of jobs) {
    const job = raw as {
      id: string;
      job_type: AutomationJobType;
      attempts: number;
      max_attempts: number;
      payload: Record<string, unknown>;
      flow_run_id: string | null;
      account_id: string;
    };

    const { data: claimed } = await db
      .from("automation_job_queue")
      .update({
        status: "processing",
        attempts: job.attempts + 1,
        updated_at: now,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    try {
      await handleJob(job);
      await db
        .from("automation_job_queue")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempts = job.attempts + 1;
      const terminal = nextAttempts >= job.max_attempts;
      await db
        .from("automation_job_queue")
        .update({
          status: terminal ? "failed" : "pending",
          last_error: message,
          run_after: terminal
            ? now
            : new Date(Date.now() + nextAttempts * 30_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
      console.error("[automation-queue] job failed:", job.id, message);
    }
  }

  return { processed, failed };
}

async function handleJob(job: {
  job_type: AutomationJobType;
  payload: Record<string, unknown>;
  flow_run_id: string | null;
  account_id: string;
}): Promise<void> {
  switch (job.job_type) {
    case "timeout_check":
      // Abandoned-run sweep already lives in flows cron; this job type
      // is reserved for per-run scheduled checks.
      return;
    case "advance":
    case "retry_node": {
      // Placeholder for async node resume (http_fetch retries, delays).
      // Sync WhatsApp path does not enqueue yet; handlers no-op safely.
      if (job.flow_run_id && job.payload?.mark_waiting === true) {
        const db = supabaseAdmin();
        await db
          .from("flow_runs")
          .update({
            status: "active",
            last_advanced_at: new Date().toISOString(),
          })
          .eq("id", job.flow_run_id)
          .eq("account_id", job.account_id)
          .eq("status", "waiting");
      }
      return;
    }
    default:
      return;
  }
}

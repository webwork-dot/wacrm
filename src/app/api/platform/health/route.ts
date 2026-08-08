import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { query } from "@/lib/db/pool";
import { getPool } from "@/lib/db/pool";

/**
 * GET /api/platform/health — platform dashboard health cards.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();

    const checks: Array<{
      component: string;
      status: "healthy" | "warning" | "critical" | "unknown";
      message: string;
      metrics?: Record<string, unknown>;
    }> = [];

    // Database
    try {
      const t0 = Date.now();
      await getPool().query("SELECT 1");
      checks.push({
        component: "database",
        status: "healthy",
        message: "Connected",
        metrics: { latencyMs: Date.now() - t0 },
      });
    } catch (e) {
      checks.push({
        component: "database",
        status: "critical",
        message: e instanceof Error ? e.message : "DB error",
      });
    }

    // Queue depth
    const { rows: jobs } = await query<{ c: string; status: string }>(
      `SELECT status, count(*)::text AS c FROM jobs
       WHERE status IN ('pending','retrying','running','failed')
       GROUP BY status`,
    ).catch(() => ({ rows: [] as { c: string; status: string }[] }));
    const pending = Number(jobs.find((j) => j.status === "pending")?.c ?? 0);
    const failed = Number(jobs.find((j) => j.status === "failed")?.c ?? 0);
    checks.push({
      component: "queue",
      status: failed > 50 ? "critical" : pending > 500 ? "warning" : "healthy",
      message: `pending=${pending} failed=${failed}`,
      metrics: { pending, failed },
    });

    // Storage provider
    const { rows: storage } = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM storage_providers WHERE is_active = true`,
    ).catch(() => ({ rows: [{ c: "0" }] }));
    checks.push({
      component: "storage",
      status: Number(storage[0]?.c ?? 0) > 0 ? "healthy" : "warning",
      message:
        Number(storage[0]?.c ?? 0) > 0
          ? "Provider configured"
          : "No active storage provider",
    });

    // pgvector
    const { rows: vec } = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`,
    );
    checks.push({
      component: "ai_vector",
      status: vec[0]?.exists ? "healthy" : "warning",
      message: vec[0]?.exists
        ? "pgvector available"
        : "Vector extension not installed — semantic search disabled",
    });

    // Persist snapshot
    for (const c of checks) {
      await query(
        `INSERT INTO system_health (component, status, message, metrics)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [c.component, c.status, c.message, JSON.stringify(c.metrics ?? {})],
      ).catch(() => undefined);
    }

    const overall = checks.some((c) => c.status === "critical")
      ? "critical"
      : checks.some((c) => c.status === "warning")
        ? "warning"
        : "healthy";

    return NextResponse.json({ overall, checks });
  } catch (err) {
    return toErrorResponse(err);
  }
}

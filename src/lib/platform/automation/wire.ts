/**
 * Wire Trigger Engine → Automation Runtime.
 *
 * WhatsApp inbound stays synchronous in the webhook (needs `consumed`
 * for automation gating). Other triggers enqueue / log until dedicated
 * starters exist.
 */

import { registerTriggerHandler } from "@/lib/platform/triggers/engine";
import { enqueueAutomationJob } from "./queue";

let wired = false;

export function wireAutomationRuntime(): void {
  if (wired) return;
  wired = true;

  registerTriggerHandler("whatsapp", async () => {
    // Sync path: webhook → dispatchInboundToFlows (IR-backed).
    // Avoid double-start here.
  });

  registerTriggerHandler("manual", async (payload) => {
    const flowId =
      typeof payload.data.flow_id === "string" ? payload.data.flow_id : null;
    const flowRunId =
      typeof payload.data.flow_run_id === "string"
        ? payload.data.flow_run_id
        : null;
    await enqueueAutomationJob({
      accountId: payload.accountId,
      flowId,
      flowRunId,
      jobType: "advance",
      payload: payload.data,
    });
  });

  registerTriggerHandler("api", async (payload) => {
    await enqueueAutomationJob({
      accountId: payload.accountId,
      flowId:
        typeof payload.data.flow_id === "string" ? payload.data.flow_id : null,
      jobType: "advance",
      payload: payload.data,
    });
  });
}

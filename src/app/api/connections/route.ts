import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  ensureLlmConnectionFromConfig,
  ensureMetaConnectionFromConfig,
  listConnections,
  upsertConnection,
  type ConnectionType,
} from "@/lib/platform/connections";

/**
 * GET  /api/connections — list account connections (+ ensure Meta/AI adapters)
 * POST /api/connections — create/upsert a connection (admin+)
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    // Best-effort sync from legacy tables so the Connections Manager
    // surfaces existing WhatsApp / AI credentials.
    await ensureMetaConnectionFromConfig(ctx.supabase, ctx.accountId).catch(
      () => null,
    );
    await ensureLlmConnectionFromConfig(ctx.supabase, ctx.accountId).catch(
      () => null,
    );
    const connections = await listConnections(ctx.supabase, ctx.accountId);
    return NextResponse.json({ connections });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as {
      type?: ConnectionType | string;
      name?: string;
      config?: Record<string, unknown>;
      secrets?: Record<string, string>;
      status?: "healthy" | "degraded" | "error" | "unknown" | "disconnected";
    } | null;

    if (!body?.type || !body?.name?.trim()) {
      return NextResponse.json(
        { error: "type and name are required" },
        { status: 400 },
      );
    }

    const connection = await upsertConnection(ctx.supabase, {
      accountId: ctx.accountId,
      type: body.type,
      name: body.name.trim(),
      config: body.config,
      secrets: body.secrets,
      status: body.status,
    });
    return NextResponse.json({ connection });
  } catch (err) {
    return toErrorResponse(err);
  }
}

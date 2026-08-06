/**
 * Connections Manager — single place for external integration credentials.
 * Features store `connection_id`; never raw secrets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";

export type ConnectionType =
  | "meta_whatsapp"
  | "llm_openai"
  | "llm_anthropic"
  | "llm_gemini"
  | "smtp"
  | "rest"
  | "erp"
  | "payments";

export type ConnectionStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "unknown"
  | "disconnected";

export type ProviderMode = "client_owned" | "platform_managed";

export interface ConnectionRow {
  id: string;
  account_id: string;
  type: ConnectionType | string;
  name: string;
  status: ConnectionStatus;
  config: Record<string, unknown>;
  secrets_encrypted: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  latency_ms: number | null;
  expires_at: string | null;
  provider_mode: ProviderMode;
  created_at: string;
  updated_at: string;
}

export interface ConnectionPublic extends Omit<ConnectionRow, "secrets_encrypted"> {
  has_secrets: boolean;
}

function toPublic(row: ConnectionRow): ConnectionPublic {
  const { secrets_encrypted, ...rest } = row;
  return { ...rest, has_secrets: !!secrets_encrypted };
}

export function encryptSecrets(secrets: Record<string, string>): string {
  return encrypt(JSON.stringify(secrets));
}

export function decryptSecrets(
  secretsEncrypted: string | null | undefined,
): Record<string, string> {
  if (!secretsEncrypted) return {};
  try {
    const raw = decrypt(secretsEncrypted);
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function listConnections(
  db: SupabaseClient,
  accountId: string,
): Promise<ConnectionPublic[]> {
  const { data, error } = await db
    .from("connections")
    .select("*")
    .eq("account_id", accountId)
    .order("type")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as ConnectionRow[]).map(toPublic);
}

export async function getConnection(
  db: SupabaseClient,
  accountId: string,
  connectionId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from("connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConnectionRow) ?? null;
}

export async function getConnectionSecrets(
  db: SupabaseClient,
  accountId: string,
  connectionId: string,
): Promise<Record<string, string>> {
  const row = await getConnection(db, accountId, connectionId);
  return decryptSecrets(row?.secrets_encrypted);
}

export async function upsertConnection(
  db: SupabaseClient,
  input: {
    accountId: string;
    type: ConnectionType | string;
    name: string;
    config?: Record<string, unknown>;
    secrets?: Record<string, string>;
    status?: ConnectionStatus;
    providerMode?: ProviderMode;
  },
): Promise<ConnectionPublic> {
  const patch: Record<string, unknown> = {
    account_id: input.accountId,
    type: input.type,
    name: input.name,
    config: input.config ?? {},
    status: input.status ?? "unknown",
    provider_mode: input.providerMode ?? "client_owned",
    updated_at: new Date().toISOString(),
  };
  if (input.secrets) {
    patch.secrets_encrypted = encryptSecrets(input.secrets);
  }

  const { data, error } = await db
    .from("connections")
    .upsert(patch, { onConflict: "account_id,type,name" })
    .select("*")
    .single();
  if (error) throw error;
  return toPublic(data as ConnectionRow);
}

export async function markConnectionHealth(
  db: SupabaseClient,
  accountId: string,
  connectionId: string,
  health: {
    status: ConnectionStatus;
    latencyMs?: number | null;
    lastError?: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from("connections")
    .update({
      status: health.status,
      latency_ms: health.latencyMs ?? null,
      last_error: health.lastError ?? null,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("account_id", accountId);
  if (error) throw error;
}

/**
 * Ensure a Meta WhatsApp connection row exists for the account,
 * mirroring whatsapp_config (compatibility adapter).
 */
export async function ensureMetaConnectionFromConfig(
  db: SupabaseClient,
  accountId: string,
): Promise<ConnectionPublic | null> {
  const { data: cfg } = await db
    .from("whatsapp_config")
    .select(
      "id, phone_number_id, waba_id, access_token, status, connection_id",
    )
    .eq("account_id", accountId)
    .maybeSingle();
  if (!cfg) return null;

  if (cfg.connection_id) {
    const existing = await getConnection(db, accountId, cfg.connection_id as string);
    if (existing) return toPublic(existing);
  }

  const secrets: Record<string, string> = {};
  if (cfg.access_token) {
    // Stored already encrypted in whatsapp_config — keep as opaque blob
    // under a dedicated key so Connections Manager owns the reference.
    secrets.access_token_encrypted = cfg.access_token as string;
  }

  const conn = await upsertConnection(db, {
    accountId,
    type: "meta_whatsapp",
    name: "WhatsApp Cloud API",
    config: {
      phone_number_id: cfg.phone_number_id,
      waba_id: cfg.waba_id,
      whatsapp_config_id: cfg.id,
    },
    secrets,
    status: cfg.status === "connected" ? "healthy" : "unknown",
  });

  await db
    .from("whatsapp_config")
    .update({ connection_id: conn.id })
    .eq("id", cfg.id)
    .eq("account_id", accountId);

  return conn;
}

/**
 * Ensure an LLM connection row exists from ai_configs.
 */
export async function ensureLlmConnectionFromConfig(
  db: SupabaseClient,
  accountId: string,
): Promise<ConnectionPublic | null> {
  const { data: cfg } = await db
    .from("ai_configs")
    .select("id, provider, model, api_key, connection_id, is_active")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!cfg) return null;

  if (cfg.connection_id) {
    const existing = await getConnection(db, accountId, cfg.connection_id as string);
    if (existing) return toPublic(existing);
  }

  const type =
    cfg.provider === "anthropic"
      ? "llm_anthropic"
      : cfg.provider === "openai"
        ? "llm_openai"
        : `llm_${cfg.provider}`;

  const conn = await upsertConnection(db, {
    accountId,
    type,
    name: `AI · ${cfg.provider}`,
    config: {
      provider: cfg.provider,
      model: cfg.model,
      ai_config_id: cfg.id,
      is_active: cfg.is_active,
    },
    secrets: cfg.api_key
      ? { api_key_encrypted: cfg.api_key as string }
      : undefined,
    status: cfg.is_active ? "healthy" : "disconnected",
  });

  await db
    .from("ai_configs")
    .update({ connection_id: conn.id })
    .eq("id", cfg.id)
    .eq("account_id", accountId);

  return conn;
}

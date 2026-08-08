# Connections

Account-scoped integrations live in `connections` (type, credentials encrypted, status).

## WhatsApp Cloud API

Primary messaging connection. Configured under Settings → WhatsApp (`whatsapp_config`).

- Writes require **admin** role
- Tokens encrypted with `ENCRYPTION_KEY`
- Webhook: `POST /api/whatsapp/webhook` (HMAC via `META_APP_SECRET`)

## AI providers

Stored on `ai_configs` / connection rows depending on surface. Never log raw keys.

## Webhooks (outbound)

Account `webhook_endpoints` receive signed event payloads (`lib/webhooks/deliver.ts`). Failures increment via `record_webhook_failure` and auto-disable after threshold.

## Public API keys

`api_keys` — scoped bearer tokens for `/api/v1/*`. Create/revoke in Settings.

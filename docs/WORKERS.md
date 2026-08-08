# Workers, queues, and cron

Convexa runs background work **inside the Next.js process** (route handlers + `after()`), backed by PostgreSQL tables — no separate Redis/Bull requirement for the default install.

## Queues

| Table | Purpose |
|-------|---------|
| `automation_job_queue` | Legacy/automation step jobs |
| `jobs` | Generic enterprise job queue (migration 010) |
| `scheduled_jobs` | Timed / cron-like work |

Workers poll or are invoked by cron HTTP endpoints protected with `AUTOMATION_CRON_SECRET` (or equivalent shared secret headers).

## Cron routes (examples)

- `/api/automations/cron`
- `/api/flows/cron`

Call from system cron / systemd timer (GET + shared secret header):

```bash
curl -fsS -X GET "https://app.example.com/api/automations/cron" \
  -H "x-cron-secret: $AUTOMATION_CRON_SECRET"

curl -fsS -X GET "https://app.example.com/api/flows/cron" \
  -H "x-cron-secret: $AUTOMATION_CRON_SECRET"
```

Schedule every minute. Missed ticks should be safe (idempotent claims).

## Execution history

- Automations: `automation_logs` (+ per-step rows)
- Flows: `flow_runs`, `flow_run_events`
- Audit: `audit_logs`, `activity_logs`

## Recovery

- Failed jobs stay claimable with retry counters
- Webhook deliveries use atomic failure RPC (`record_webhook_failure`)
- AI auto-reply uses `claim_ai_reply_slot` to avoid double-sends

## Ops tips

- Keep Node `maxDuration` high enough for webhook fan-out (see WhatsApp webhook route).
- Monitor `jobs` / `automation_job_queue` depth and oldest `available_at`.
- For multi-instance deploys, rely on row-level `FOR UPDATE SKIP LOCKED` claim patterns (do not run duplicate naive pollers without locking).

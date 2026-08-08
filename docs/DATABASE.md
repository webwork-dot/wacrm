# Convexa Database Reference

Plain PostgreSQL. No Supabase schemas (`auth`, `storage`, `realtime`, `vault`).

## Commands

```bash
npm run db:migrate   # apply database/migrations/*
npm run db:seed      # platform catalog + Platform Owner
npm run db:verify    # installation checks
npm run db:fresh     # DROP public → migrate → seed (dev only)
```

Requires `DATABASE_URL`.

## Core tenancy

| Table | Purpose |
|-------|---------|
| `users` | Auth source (bcrypt `encrypted_password`, lockout fields) |
| `user_sessions` | Opaque refresh tokens / multi-device sessions |
| `login_history` | Success/failure audit of logins |
| `password_reset_tokens` | One-time reset tokens |
| `accounts` | Client workspaces |
| `profiles` | Membership: `user_id` → `account_id` + `account_role` |
| `platform_users` | Platform operators (`owner` / `admin`) |
| `permissions` / `role_permissions` | RBAC catalog |
| `feature_flags` | Global + per-account module gates |

## CRM / Inbox

`contacts`, `tags`, `contact_tags`, `custom_fields`, `conversations`, `messages`, `message_reactions`, `whatsapp_config`, `message_templates`, `quick_replies`, `inbox_settings`, `conversation_watchers`, `conversation_notes`, `conversation_events`

## Sales / Broadcast

`pipelines`, `pipeline_stages`, `deals`, `broadcasts`, `broadcast_recipients`

## Automation / Flows

`automations`, `automation_steps`, `automation_logs`, `automation_pending_executions`, `flows`, `flow_nodes`, `flow_runs`, `flow_run_events`, `flow_compiled_versions`, `automation_job_queue` (kept for compatibility)

## AI / Knowledge

`ai_configs`, `ai_knowledge_documents` (+ `embedding_status`), `ai_knowledge_chunks` (+ optional `vector` embedding), `ai_usage_log`, `ai_execution_traces`

## Enterprise (migration 010)

| Table | Purpose |
|-------|---------|
| `storage_providers` / `files` / `file_versions` | Provider-independent file storage |
| `audit_logs` | Immutable security/compliance log |
| `activity_logs` | Product activity feed |
| `scheduled_jobs` | Cron / delayed schedules |
| `jobs` | Generic async queue (do not rename `automation_job_queue`) |
| `workspace_branding` | White-label branding |
| `client_onboarding` | Setup checklist + % |
| `system_health` | Component health snapshots |

## Soft delete

Additive `deleted_at` / `deleted_by` on key tenant tables. **`audit_logs` is never soft-deleted.**

## Indexes

Hot paths: `account_id`, `created_at`, `status`, `user_id`, queue poll indexes on `jobs`, session indexes on `user_sessions`.

## Seeders

- `001_initial_seed.sql` — permissions, roles, flags, plans, settings catalogs  
- `002_super_admin.ts` — one Platform Owner (bcrypt)  
- **Never** seeds clients, contacts, messages, broadcasts, knowledge, or automations

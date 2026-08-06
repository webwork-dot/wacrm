# Convexa Enterprise Readiness Report

**Date:** 2026-08-06  
**Scope:** Phase 3 SaaS readiness (Waves A → D)  
**Business model:** Software only — clients BYO Meta Cloud API + AI keys. Not a BSP, reseller, white-label product, or marketplace.

Plan SSOT: `.cursor/plans/phase_3_saas_readiness_b46720a0.plan.md`

---

## Headline scores

| Metric | Target (plan) | Actual | Verdict |
|--------|---------------|--------|---------|
| DIY client readiness | ~8/10 after C2 | **8.0 / 10** | Met |
| Multi-client ops | ~7/10 after D | **7.0 / 10** | Met |
| Dimension average | — | **7.5 / 10** | Solid foundation |

---

## Dimension scores

| Dimension | Score | Notes |
|-----------|------:|-------|
| Tenancy & security | 8.5 | `account_id` defense-in-depth; suspended gate; service-role pins |
| Inbox enterprise UX | 8.0 | Presence, watchers, notes, timeline, SLA helpers, bulk |
| Platform core (C0) | 7.5 | Connections, bus, tools, triggers, variables — dual adapters remain |
| Automation Runtime (C1) | 8.0 | Compiler → IR → queue; runtime prefers IR; async resume thin |
| AI Studio + Knowledge (C2) | 7.5 | Wizard, sandbox traces, hub metadata; PDF/website sync incomplete |
| Onboarding & Starter Kits | 7.5 | Checklist + industry packs; tags/fields/templates not fully seeded |
| Multi-client ops (Admin) | 7.0 | Hidden `/admin`; manual plans; usage ledger; soft quotas |
| Observability | 6.5 | Run events, AI traces, usage_events; no SLO dashboards |
| Extensibility hooks | 7.0 | `provider_mode`, entitlements JSON; BSP/WL unused by design |

---

## Wave delivery

| Wave | Status | Primary artifacts |
|------|--------|-------------------|
| A — Security | Done | Flows / automations / webhook / dashboard `account_id` pins |
| B — Inbox | Done | Migrations 037–040; presence, watchers, insights |
| C0 — Platform core | Done | `041_platform_core.sql`; connections, event-bus, tools, triggers, variables |
| C1 — Automation IR | Done | `042_automation_runtime.sql`; compiler, runtime, queue, history pin |
| C2 — AI / Knowledge / Kits | Done | `043_ai_studio_knowledge_hub.sql`; Studio, Sandbox, Hub, onboarding, kits |
| D — Admin + plans | Done | `044_software_plans_admin.sql`; `/admin`, plans, usage, soft quotas |

---

## Canonical modules (closed set)

1. Connections Manager  
2. Event Bus  
3. Tool Registry  
4. Trigger Engine  
5. Variables Engine  
6. Automation Runtime  
7. AI Studio  
8. Knowledge Hub  
9. Starter Kits *(not Marketplace)*  
10. Convexa Admin  

No 11th module was added.

---

## Extensibility hooks (not productized)

| Hook | State | Notes |
|------|-------|-------|
| `connections.provider_mode` | Reserved | `client_owned` \| `platform_managed` — DIY default |
| `software_plans.entitlements` | Shipped | JSON flags; UI entitlement gates still partial |
| `PLATFORM_ADMIN_EMAILS` | Shipped | Hidden operator allowlist for `/admin` |
| BSP / number resale | Not built | Forbidden by business model |
| White-label | Not built | Entitlement flag later only |
| Public marketplace | Not built | Starter Kits only |

---

## Next 10

1. **P0** — Apply migrations **041–044** in all environments; re-activate flows to pin IR  
2. **P0** — Set `PLATFORM_ADMIN_EMAILS` and verify `/admin` allowlist  
3. **P1** — Migrate all Meta/LLM call sites to `connection_id` only (drop dual adapters)  
4. **P1** — Wire remaining hot paths to `usage_events` (broadcasts, API v1, flow starts)  
5. **P1** — Automation queue: real delay/retry node resume (not placeholder)  
6. **P1** — Knowledge Hub: PDF upload + website crawl sync workers  
7. **P2** — Entitlement gates in UI (`api_keys`, `advanced_analytics`) from plan JSON  
8. **P2** — Starter Kits: tags, custom fields, quick replies, message templates  
9. **P2** — Admin: support notes, audit log viewer, feature-flag console UX  
10. **Guardrail** — Keep BSP / white-label / marketplace as hooks only — do not productize  

---

## Ops apply checklist

1. Supabase: run migrations `041`, `042`, `043`, `044`  
2. Env: `PLATFORM_ADMIN_EMAILS=<ops emails>`  
3. Re-activate active flows (compile IR) or rely on runtime backfill  
4. Smoke: `/onboarding` → Connections → AI Studio Sandbox → `/admin`  

---

## Verdict

Convexa is **ready for DIY pilot customers** and **basic multi-tenant software ops**. Architecture matches the locked plan: account-scoped, IR-backed automations, BYO credentials, hidden admin, soft software quotas. Do not expand into BSP/reseller/marketplace without an explicit architecture change.

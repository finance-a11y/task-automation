# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-18)

**Core value:** Convertir un mensaje libre en Slack en una tarea de ClickUp correcta y completa (cliente + asignado + fechas) sin llenar formularios a mano.
**Current focus:** Phase 2 complete — next up Phase 3 (Confirm + Create)

## Current Position

Phase: 2 of 5 (NL Parser + Resolver)
Plan: 3 of 3 in current phase
Status: Phase 2 complete (offline-verified); live OpenAI accuracy deferred (no key in env)
Last activity: 2026-06-18 — Executed plans 02-01, 02-02, 02-03; 82/82 tests green (1 live test skipped), tsc clean

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: ~12 min
- Total execution time: ~1.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Serverless Foundation | 3 | ~36 min | ~12 min |
| 2. NL Parser + Resolver | 3 | ~34 min | ~11 min |

**Recent Trend:**
- Last 5 plans: 01-03, 02-01, 02-02, 02-03 (all green offline)
- Trend: steady; deviations were required-field test-fixture backfills + OpenAILike real-client typing

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Foundation: ACK-first + idempotency on event_id/message_ts is the single most important rule (prevents duplicate ClickUp tasks)
- Architecture: resolve-then-confirm — deterministic resolver maps strings → real ClickUp IDs before the human preview
- Store: Upstash Redis (Vercel KV sunset) for pending task, event dedup, and task↔thread map
- Phase 2: AI provider switched Claude → OpenAI (structured outputs); model gpt-4o-mini default, gpt-4.1-mini fallback
- Phase 2: SDK syntax confirmed — zodResponseFormat(schema,"parse_task") + chat.completions.parse works with openai@6 + zod@4
- Phase 2: dates resolved to epoch ms via luxon in TEAM_TIMEZONE with injected `now` (off-by-one guard test)

### Pending Todos

None yet.

### Blockers/Concerns

Carried from research (verify before the relevant phase):
- Phase 4: ClickUp X-Signature exact format — verify against a live webhook-create response
- ~~Phase 2: OpenAI structured outputs SDK syntax + model~~ RESOLVED in 02-03 (zodResponseFormat + chat.completions.parse, gpt-4o-mini default; verified with openai@6/zod@4)
- ~~Phase 2: Cliente option UUIDs~~ RESOLVED — 7 name→UUID map hardcoded from 02-CONTEXT.md and test-locked in src/config/clients.ts
- REQUIREMENTS.md states "21" v1 requirements but the listed items total 23 — all 23 are mapped

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Live verification | Phase 1 live deploy: Vercel deploy + Fluid Compute on, Slack URL-verification handshake, real-event ACK<3s + single in-thread receipt, live filter/dedup (Task 01-03 Task 3) | Pending (no live Slack/Vercel/Upstash in this env) | 2026-06-18 |
| Live verification | Phase 2 live OpenAI accuracy: real parse round-trip + prompt/accuracy tuning (parse.live.test gated on OPENAI_API_KEY) | Pending (no live OpenAI key in this env) | 2026-06-18 |

## Session Continuity

Last session: 2026-06-18
Stopped at: Phase 2 executed (02-01/02/03) — 82/82 tests green (1 live test skipped), tsc clean; live OpenAI accuracy deferred
Resume file: .planning/phases/02-nl-parser-resolver/02-03-SUMMARY.md (parser + parseAndResolve public surface)

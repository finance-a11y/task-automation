# Walking Skeleton — Slack → ClickUp Task Bot

**Phase:** 1
**Generated:** 2026-06-18

## Capability Proven End-to-End

A human posts a root message in the dedicated Slack channel; the deployed Vercel function verifies Slack's HMAC signature over the raw body, acknowledges within 3 seconds, deduplicates Slack's retries on `event_id` using Upstash Redis, ignores bot/own/non-root/other-channel messages, and posts a receipt back in that message's thread — exercising the full ingress → verify → store → reply stack with no ClickUp or LLM logic yet.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node 20 (TypeScript, ESM) | Locked in CONTEXT.md (research suggested Node 22; CONTEXT decision wins). Vercel `nodejs20.x` runtime, not Edge (Bolt + `crypto` are Node-targeted). |
| Slack framework | `@slack/bolt@^4` + `@vercel/slack-bolt@^1.5` | Official adapter that solves Slack's 3s-ack on serverless via Fluid Compute `waitUntil`; handles raw-body signature verification internally — no hand-rolled HMAC. |
| Background work | `@vercel/functions` `waitUntil` | Keeps heavy work running after the fast ACK; bounded by `maxDuration`. |
| State store | Upstash Redis (`@upstash/redis`, REST client) | Serverless-safe HTTP client; survives cold starts. **Vercel KV is sunset — not used.** Provisioned via Vercel Marketplace. |
| Validation | `zod` | Env schema (fail-fast at startup) + reused as runtime guard in later phases. |
| Deployment target | Vercel serverless, **Fluid Compute enabled** | No server to maintain; `waitUntil` requires Fluid Compute toggled on in project settings (human step, verified at deploy checkpoint). |
| Directory layout | `api/` thin ingress handlers; `src/` framework-free domain (`src/config`, `src/store`, `src/slack`); tests colocated as `*.test.ts` run by Vitest | Keeps signature/dedup/filter logic offline-testable without live Slack. |
| Test runner | Vitest | Fast TS-native runner; integration tests build signed requests + inject fake Redis/Slack clients — no live services. |

## Stack Touched in Phase 1

- [x] Project scaffold (package.json ESM, tsconfig strict, vercel.json Fluid, vitest)
- [x] Routing — real route `api/slack/events.ts` (Slack Events endpoint)
- [x] Store — real write AND read against Upstash Redis (`SET event:{id} 1 NX EX 600`, existence check on retry)
- [x] Interactive element — bot posts an in-thread receipt via Slack Web API on a captured message
- [x] Deployment — documented Vercel deploy + Fluid Compute enablement; live ACK<3s verified at human checkpoint

## Out of Scope (Deferred to Later Slices)

- LLM / OpenAI parsing of message text (Phase 2)
- Deterministic resolver (cliente UUID, member IDs, date→epoch ms) (Phase 2)
- Block Kit preview + Confirm/Edit/Cancel + pending-task state (Phase 3)
- ClickUp task creation and task↔thread mapping (Phase 3)
- ClickUp reverse webhook + `X-Signature` verification (Phase 4)
- Error-in-thread reporting, 429 backoff, per-channel kill switch (Phase 5)

The Phase 1 receipt ("👀 Recibido — procesando…") is an intentional placeholder that later phases replace with the parsed preview — it is NOT a reduced version of any locked decision, it is the entire scope of this slice.

## Subsequent Slice Plan

- Phase 2: A raw message string yields a ClickUp-ready structured payload (offline-testable).
- Phase 3: Threaded Block Kit preview with Confirm/Edit/Cancel that creates the ClickUp task and posts its link back.
- Phase 4: ClickUp webhook posts status/assignee changes back into the originating thread.
- Phase 5: Production hardening (in-thread errors, rate-limit/redelivery handling, kill switch).

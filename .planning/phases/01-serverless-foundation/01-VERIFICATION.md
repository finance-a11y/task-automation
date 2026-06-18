---
phase: 01-serverless-foundation
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (logic); 3 live-deploy confirmations pending
overrides_applied: 0
re_verification:
  previous_status: none
human_verification:
  - test: "Deploy to Vercel (vercel deploy --prod), set Slack Event Subscriptions Request URL to <deploy-url>/api/slack/events, subscribe to message.channels, and confirm the URL-verification handshake turns green."
    expected: "Slack shows the Request URL as Verified; message.channels events are delivered."
    why_human: "Requires a live Slack app, Vercel deploy, and the URL-verification handshake — no live services exist in this environment. (SC1/SC2 live confirmation; INGEST-01/02)"
  - test: "Enable Fluid Compute (Vercel → Settings → Functions), set all SLACK_*/UPSTASH_*/TEAM_TIMEZONE env vars, provision Upstash Redis via the Vercel Marketplace, then post a root human message in SLACK_TASK_CHANNEL_ID."
    expected: "A single '👀 Recibido — procesando…' in-thread reply within ~3s; no X-Slack-Retry-Num http_timeout retries in the Vercel logs (proves ACK<3s + background waitUntil)."
    why_human: "ACK<3s timing and waitUntil background execution can only be observed against a live deploy with Fluid Compute. (SC1/SC2; INGEST-01/02)"
  - test: "Live filter + idempotency spot-check: post a thread reply and a message in another channel; observe the bot's own receipt; trigger a Slack retry of the same event."
    expected: "Thread replies / other-channel messages get no receipt; the bot does not react to its own receipt (no echo loop); duplicate event_id produces exactly one receipt."
    why_human: "Confirms the filter and dedup behave correctly against real Slack event payloads and retry semantics. (SC3/SC4 live confirmation)"
  - test: "Redis cold-start persistence check: after a captured message sets an evt:<event_id> key, force a new cold start (redeploy or wait out the instance) and re-deliver the same event_id."
    expected: "The previously-written key is still present in Upstash and the re-delivered event is dropped — proving state survives a cold start and is readable on the next invocation."
    why_human: "Cold-start durability of external Redis state can only be confirmed against a live Upstash instance across invocations. (SC5; INGEST-03)"
---

# Phase 1: Serverless Foundation Verification Report

**Phase Goal:** Walking-skeleton Slack ingress on Vercel serverless — receive a dedicated-channel human message, verify Slack's HMAC over the raw body, ACK within 3s and process in background, deduplicate retries on event_id, filter out own/bot/non-root messages, and persist dedup state in Upstash Redis.
**Verified:** 2026-06-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A human message in the dedicated channel is received and the bot posts a receipt in that message's thread | ✓ VERIFIED (logic) / ? live pending | `src/slack/process.ts:65-69` posts `RECEIPT_TEXT` with `thread_ts: message.thread_ts ?? message.ts`; `process.test.ts:46-57` asserts exactly one in-thread receipt with `thread_ts === ts`. End-to-end live delivery pending (human item 1-2). |
| 2 | Requests with invalid/stale Slack signature are rejected; valid ones accepted | ✓ VERIFIED | `events.integration.test.ts` builds real signed `Request`s with `node:crypto`: valid `url_verification` → 200 + echoes challenge; invalid sig, wrong secret, and 6-min-stale ts all → ≥400. HMAC handled by `VercelReceiver` over raw body (`app.ts:55-57`), no hand-rolled crypto. Live handshake confirmation pending (human item 1). |
| 3 | Slack's retry of the same event does not produce a second reaction (idempotent on event_id) | ✓ VERIFIED | `markEventOnce` uses `SET evt:<id> 1 {nx:true, ex:600}` (`redis.ts:63-67`); `process.ts:49-50` returns early when not first. `process.test.ts:59-65` asserts a duplicate event_id posts exactly one receipt; `redis.test.ts:31-40` proves true-then-false. |
| 4 | Bot ignores its own posts, other bots' messages, and non-root messages (no echo loop) | ✓ VERIFIED | `isProcessableMessage` (`filter.ts:25-35`) rejects wrong channel, any subtype, any bot_id, own user id, and non-root (thread_ts present & ≠ ts). `filter.test.ts` covers all 9 cases; `process.test.ts:67-85` confirms no postMessage for filtered/own messages. |
| 5 | State written to Upstash Redis survives a cold start and is readable on next invocation | ✓ VERIFIED (logic) / ? live pending | Dedup state held in external Upstash REST store, not in-memory: `createRedis` (`redis.ts:30-46`) + `markEventOnce` `SET ... EX 600`. Durability is inherent to the external store; live cold-start re-read confirmation pending (human item 4). |

**Score:** 5/5 truths implemented and unit/integration-tested. 3 truths (1, 2, 5) have a live-deploy confirmation component routed to human verification per phase context.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/slack/filter.ts` | Pure echo-loop/noise predicate | ✓ VERIFIED | 35 lines, no I/O, all guard clauses present; imported by `process.ts`. |
| `src/slack/process.ts` | dedup → filter → in-thread receipt; never throws into ACK path | ✓ VERIFIED | try/catch wraps all side effects (`process.ts:46,70-75`); ordering correct. |
| `src/slack/app.ts` | Bolt App on VercelReceiver (raw-body HMAC + ACK-then-waitUntil) | ✓ VERIFIED | `authorize` + `deferInitialization:true` for network-free init; delegates to `processMessageEvent`; bot user id resolved lazily/cached. |
| `api/slack/events.ts` | Vercel endpoint exporting adapter handler | ✓ VERIFIED | Constructs app once at module scope from `loadEnv()`; exports `POST` and default handler. |
| `src/store/redis.ts` | Upstash factory + `markEventOnce` (SET NX EX) | ✓ VERIFIED | Lazy client, fail-fast on missing creds, namespaced key, 600s TTL. |
| `src/config/env.ts` | zod fail-fast typed env | ✓ VERIFIED | Required vars non-empty; URL validated; TEAM_TIMEZONE default; no module-load `process.env` read. |
| `tsconfig.json` | strict + noUncheckedIndexedAccess | ✓ VERIFIED | both flags true. |
| `vercel.json` | Node 20 + maxDuration for waitUntil | ✓ VERIFIED | `nodejs20.x`, `maxDuration: 60`. |
| `package.json` | locked deps, no KV/openai/anthropic | ✓ VERIFIED | Only the 5 locked runtime deps; forbidden packages absent. |
| `.env.example` / `.gitignore` | env contract + secret hygiene | ✓ VERIFIED | All 6 vars documented; `.env*` ignored. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `api/slack/events.ts` | `createSlackApp`/`loadEnv` | module import + `createHandler` | ✓ WIRED | Handler exported as POST + default. |
| `app.ts` `app.message` | `processMessageEvent` | delegation w/ eventId + message | ✓ WIRED | Passes redis, client, env, botUserId. |
| `process.ts` | `markEventOnce` → `chat.postMessage` | dedup-then-filter-then-post | ✓ WIRED | Early returns on dup/filter before post. |
| `app.ts` | `VercelReceiver` | `signingSecret` from env | ✓ WIRED | Raw-body HMAC verification delegated to adapter (proven by integration tests). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite green | `npm test` | 5 files, 31/31 passed (rejection-path stderr is expected logging) | ✓ PASS |
| Typecheck clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Signature accept/reject | integration test (signed Requests) | valid→200+challenge; invalid/wrong-secret/stale→≥400 | ✓ PASS |
| Live ACK<3s / waitUntil / cold-start | — | requires live deploy | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| INGEST-01 | 01-03 | Receive dedicated-channel events + verify HMAC over raw body | ✓ SATISFIED (live handshake pending) | VercelReceiver verify; integration tests. |
| INGEST-02 | 01-01/03 | ACK<3s + background waitUntil | ✓ SATISFIED (live timing pending) | `createHandler` adapter ACK-then-waitUntil; vercel.json maxDuration. |
| INGEST-03 | 01-02 | Dedup retries on event_id | ✓ SATISFIED | markEventOnce SET NX EX + tests. |
| INGEST-04 | 01-03 | Only root human messages of designated channel | ✓ SATISFIED | isProcessableMessage + 9 filter tests. |

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/placeholder markers in `src/` or `api/`. No stub returns, no hardcoded empty data flowing to output. The `RECEIPT_TEXT` placeholder is an intentional, documented Phase 1 receipt (not an unimplemented stub).

### Human Verification Required

See frontmatter `human_verification`. Summary:
1. Vercel deploy + Slack Request-URL handshake green (SC1/SC2, INGEST-01/02).
2. Enable Fluid Compute, set env + Upstash, post a root message → single in-thread receipt within ~3s, no http_timeout retries (SC1/SC2).
3. Live filter + dedup spot-check: thread replies/other channels ignored, no self-echo, duplicate event_id → one receipt (SC3/SC4).
4. Cold-start Redis persistence: evt key survives a new cold start and drops the re-delivered event (SC5, INGEST-03).

### Gaps Summary

No gaps. All five success criteria have their logic implemented and covered by unit/integration tests (31/31 green, tsc clean). The only outstanding items are live-environment confirmations (deploy, real Slack handshake, ACK timing, cold-start Redis read) which cannot be exercised without live Slack/Vercel/Upstash — these are expected-pending per the phase context and are routed to human verification, not counted as gaps.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_

---
phase: 04-reverse-notifications
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 3/3 must-haves verified (offline)
overrides_applied: 0
human_verification:
  - test: "Run scripts/register-clickup-webhook.mjs against the deployed /api/clickup/webhook URL with the live CLICKUP_API_TOKEN, store the returned webhook.secret as CLICKUP_WEBHOOK_SECRET in Vercel, redeploy."
    expected: "ClickUp returns a webhook id + secret; the script prints both; the secret is captured into env so the X-Signature verifier authenticates real deliveries."
    why_human: "Requires the deployed public URL + live ClickUp token + the secret that only exists after live registration — cannot be produced offline."
  - test: "Move a bot-created ClickUp task to a new status, and add/remove an assignee on it."
    expected: "A '🔄 ... cambió de estado: old → new' and a '👤 ... asignados actualizados: +X / -Y' message land in the originating Slack thread; an unrelated (non-bot) task's change produces nothing."
    why_human: "End-to-end live behavior across ClickUp webhook delivery → Vercel → Slack post; needs a real status/assignee change and a live Slack workspace."
  - test: "POST a real ClickUp delivery (valid X-Signature) and a forged one (bad/missing signature) to the deployed endpoint."
    expected: "Valid signature → 200 (processed in background); invalid/missing → 401, nothing posted."
    why_human: "Confirms the exact ClickUp X-Signature wire format (flagged research gap) against the live secret; the format assumption can only be confirmed live."
---

# Phase 4: Reverse Notifications (Flow B) Verification Report

**Phase Goal:** An independent ClickUp → Slack path: a webhook endpoint verifies ClickUp's X-Signature over the raw body, listens for status and assignee changes, and posts the relevant ones into the originating thread using the stored task↔thread map.
**Verified:** 2026-06-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Endpoint accepts valid X-Signature, rejects invalid/missing | ✓ VERIFIED (offline) | `api/clickup/webhook.ts:67-85` reads raw body FIRST (`req.text()`), then `getClickUpSignatureHeader` + `verifyClickUpSignature` → `401` on missing/mismatch, `200` otherwise. `verifyClickUpSignature` (`signature.ts:19-49`) computes HMAC-SHA256 over raw bytes, strips optional `sha256=`, 64-hex length-guards, then `timingSafeEqual`; never throws. Proven by self-computed HMAC test (`signature.test.ts:12` computes expected sig itself; tampered/wrong-secret/missing/wrong-length/non-hex all reject). Header lookup case-insensitive across X-Signature/x-signature/X-SIGNATURE. |
| 2 | Bot registered for + receives taskStatusUpdated and taskAssigneeUpdated | ✓ VERIFIED (offline) | `scripts/register-clickup-webhook.mjs:24` `EVENTS = ["taskStatusUpdated","taskAssigneeUpdated"]`, POSTs `/team/{teamId}/webhook` with raw `Authorization` token; node --check passes. Handler `HANDLED_EVENTS` set (`webhook.ts:22`) accepts exactly those two; unknown events ignored (tested). README documents one-time registration + secret capture. Live registration itself is human-deferred. |
| 3 | Relevant status/assignee change posts to correct thread via task↔thread map, filtering noise | ✓ VERIFIED (offline) | `processClickUpWebhook` (`webhook.ts:183-263`): event allow-list → meaningful-transition filter (status old≠new; assignee ≥1 add/remove) → `getThreadForTask` gate (unmapped task_id = silent drop) → `markWebhookDeliveryOnce` dedup → name resolution (payload → getTask fallback → task_id) → member id→name via MEMBERS reverse map → Spanish `slack.chat.postMessage` to `{channel, thread_ts}`. 19 webhook.test.ts cases cover every path: correct messages, unmapped drop, old===new drop, no-add/no-remove drop, redelivery posts once, unknown event ignored, getTaskName/Slack failures never throw. |

**Score:** 3/3 truths verified offline. Live endpoint/registration/real-change behavior routed to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/clickup/signature.ts` | Raw-body HMAC verifier + case-insensitive header lookup | ✓ VERIFIED | Both exports present, substantive, imported by `api/clickup/webhook.ts`. |
| `src/store/redis.ts` (`markWebhookDeliveryOnce`) | SET-NX-EX dedup on `whk:` namespace, 24h TTL | ✓ VERIFIED | `redis.ts:94-104`; distinct from `evt:`; used in `webhook.ts:230`. |
| `src/config/env.ts` | CLICKUP_WEBHOOK_SECRET required + CLICKUP_TEAM_ID default | ✓ VERIFIED | `env.ts:33-34`; `nonEmpty` (fail-fast) + default `90131720021`. |
| `src/clickup/webhook.ts` | parse + filter + lookup + Spanish build + post | ✓ VERIFIED | 263 lines; all 4 exports present; fully wired. |
| `src/clickup/client.ts` (`getTask`) | Task-name fallback | ✓ VERIFIED | `client.ts:98-137`; raw token, no token in errors, tolerates status-object shape. |
| `api/clickup/webhook.ts` | Plain Vercel fn: raw verify → 401/200 → waitUntil | ✓ VERIFIED | POST + default exported; raw-body-first; `waitUntil(processClickUpWebhook(...))`. |
| `scripts/register-clickup-webhook.mjs` | One-time registration helper | ✓ VERIFIED | node --check passes; both events; team 90131720021. |
| `README.md` | Registration + secret capture docs | ✓ VERIFIED | "register-clickup-webhook" + both events + CLICKUP_WEBHOOK_SECRET documented. |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| `api/clickup/webhook.ts` | `signature.ts verifyClickUpSignature` | raw-body HMAC gate → 401 | ✓ WIRED |
| `api/clickup/webhook.ts` | `webhook.ts processClickUpWebhook` | `waitUntil` background | ✓ WIRED |
| `webhook.ts` | `redis.ts getThreadForTask` | task2thread gate | ✓ WIRED |
| `webhook.ts` | `redis.ts markWebhookDeliveryOnce` | redelivery dedup | ✓ WIRED |
| `webhook.ts` | `config/members.ts MEMBERS` | id→name reverse map | ✓ WIRED |
| `signature.test.ts` | `signature.ts` | self-computed HMAC proves logic | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full suite | `npx vitest run` | 182 passed, 1 skipped (live OpenAI) | ✓ PASS |
| Registration script parses | `node --check scripts/register-clickup-webhook.mjs` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| NOTIFY-01 | Endpoint verifies X-Signature over raw body | ✓ SATISFIED (offline; live pending) | signature.ts + api ingress; self-signed test |
| NOTIFY-02 | Register + listen for taskStatusUpdated/taskAssigneeUpdated | ✓ SATISFIED (offline; live registration pending) | registration script + HANDLED_EVENTS |
| NOTIFY-03 | Post status/assignee changes to correct thread, filtering noise | ✓ SATISFIED | processClickUpWebhook, 19 e2e cases |

### Anti-Patterns Found

None. No TBD/FIXME/XXX/HACK/PLACEHOLDER markers in any phase-modified file. No stub returns; all data flows through real Redis/Slack/ClickUp wiring (dependency-injected, tested with in-memory mocks).

### Human Verification Required

Per the phase's explicit live-deferred posture (consistent with Phases 1-3), the following cannot be proven offline:

1. **Live webhook registration** — run `scripts/register-clickup-webhook.mjs` post-deploy, capture `webhook.secret` → `CLICKUP_WEBHOOK_SECRET`.
2. **Real status/assignee change → thread notification** — confirm the Spanish message lands in the originating Slack thread for a bot-created task.
3. **Live signature accept/reject** — confirm ClickUp's actual X-Signature wire format (flagged research gap) verifies against the live secret; forged → 401.

### Gaps Summary

No offline gaps. All security/idempotency/filtering/messaging logic and HTTP wiring are implemented, substantive, wired, and exercised by 182 passing tests with a clean typecheck. The only outstanding items are live integration checks that inherently require a deploy + live ClickUp/Slack credentials, which the phase intentionally deferred. Status is `human_needed` (not `passed`) solely because of these non-empty live verification items.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_

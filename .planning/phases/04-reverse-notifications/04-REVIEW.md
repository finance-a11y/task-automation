---
phase: 04-reverse-notifications
reviewed: 2026-06-19T01:21:39Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/clickup/signature.ts
  - src/clickup/webhook.ts
  - api/clickup/webhook.ts
  - src/store/redis.ts
  - src/clickup/client.ts
  - scripts/register-clickup-webhook.mjs
  - src/config/env.ts
  - src/clickup/types.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-19T01:21:39Z
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Flow B reverse-notification pipeline reviewed end-to-end: HMAC signature gate,
ACK-fast/waitUntil ingress, redelivery dedup, task2thread scoping, payload
parsing, and Slack message building.

The core security surface is solid: the HMAC is computed over the **raw** request
body (`req.text()` is read before any JSON parse), the hex comparison is
length-guarded and timing-safe, the header lookup is case-insensitive, and
missing/empty/malformed signatures all fail closed to 401 — no bypass found. ACK
discipline is correct: 200 returns fast, all heavy work runs in `waitUntil`, and
`processClickUpWebhook` swallows every error so a processing failure never
becomes a non-2xx ClickUp-retry trigger. Unmapped tasks are a true silent drop
with no crash. API token is never logged in client or registration script.

Two real defects warrant fixing before ship: (1) unescaped task names/status
labels are injected into Slack mrkdwn text, allowing `<!channel>`/`<!here>`/fake
links to be triggered by anyone who can name a ClickUp task; (2) the dedup key
collapses to a constant when a history item lacks an `id`, which can suppress
legitimate distinct events for 24h. Neither is a crash or auth bypass, hence
WARNING not BLOCKER.

## Warnings

### WR-01: Unescaped task name / status label injected into Slack mrkdwn

**File:** `src/clickup/webhook.ts:72-90` (consumed at `258-262`)
**Issue:** `buildStatusMessage` and `buildAssigneeMessage` interpolate the
task `name`, `oldStatus`, and `newStatus` directly into Slack message text with
no escaping. `chat.postMessage` renders mrkdwn by default, so a ClickUp task
named `<!channel>`, `<!here>`, `<@U…>`, or `<http://evil|click me>` will trigger
channel-wide pings or render a spoofed link in the originating thread. Task names
and status labels are user-controlled (any ClickUp workspace member can set
them), making this a notification-spam / social-engineering injection vector.
**Fix:** Escape Slack control characters before interpolation:
```ts
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// apply esc(name), esc(oldStatus), esc(newStatus), esc(each member name)
```

### WR-02: Dedup key collapses to a constant when history item has no `id`

**File:** `src/clickup/webhook.ts:229`
**Issue:** `const deliveryKey = \`${payload.event}:${taskId}:${items[0]?.id ?? "noitem"}\``.
`ClickUpHistoryItem.id` is optional (flagged research gap), so when ClickUp omits
it the key degrades to `event:task:noitem`. Combined with the 24h
`DEFAULT_WEBHOOK_TTL_SECONDS`, the **second and later genuinely-distinct**
status/assignee changes on the same task within 24h are treated as redeliveries
and silently dropped — legitimate notifications are lost, not just duplicates
suppressed. Also note dedup keys only on `items[0]`, ignoring later items.
**Fix:** When no stable per-delivery id exists, derive the dedup key from
delivery-distinguishing content (e.g. hash of the relevant before/after values)
or shorten the TTL for the `noitem` fallback so distinct events aren't collapsed
for a full day. At minimum, fold all relevant history-item ids into the key.

## Info

### IN-01: Assignee reassignment (before AND after set) produces no notification

**File:** `src/clickup/webhook.ts:157-162`
**Issue:** In the generic `assignee`/`assignees` branch, a transition with both
`before` and `after` present (a direct reassignment A→B) matches neither the
"added" nor "removed" condition, so it is dropped and yields `null` → no message.
Only the `assignee_add`/`assignee_rem` field shapes are captured for such cases.
**Fix:** Handle the both-present case by emitting `removed: [beforeId]` and
`added: [afterId]` when `afterId !== beforeId`.

### IN-02: No `Array.isArray` guard on `history_items`

**File:** `src/clickup/webhook.ts:208`
**Issue:** `parseWebhookPayload` does not validate that `history_items` is an
array. A malformed payload with `history_items` as a string/object reaches
`items.find(...)` / `for (const it of items)` and throws a TypeError. It is
caught by `processClickUpWebhook`'s try/catch (no unhandled rejection, ACK still
200), so behavior is safe but noisy.
**Fix:** `const items = Array.isArray(payload.history_items) ? payload.history_items : [];`

### IN-03: `getDeps()` evaluated synchronously inside the POST handler

**File:** `api/clickup/webhook.ts:84`
**Issue:** `waitUntil(processClickUpWebhook(getDeps(), payload))` evaluates
`getDeps()` synchronously before the 200 is returned. If client construction ever
threw (e.g. a future Redis/WebClient validation), the handler would reject → 500 →
ClickUp infinite-retry, defeating the ACK-fast contract. Low risk today since env
is pre-validated at module load and the constructors don't throw.
**Fix:** Build/lazy-init deps before the verify step, or wrap `getDeps()` so any
failure is logged and still returns 200.

### IN-04: Registration script prints the signing secret to stdout

**File:** `scripts/register-clickup-webhook.mjs:84`
**Issue:** The webhook signing secret is `console.log`-ed (by design, so the human
can store it). The API token is correctly never printed. The secret on stdout can
land in shell history, terminal scrollback, or CI logs if the one-time script is
ever run non-interactively.
**Fix:** Acceptable for interactive human use; consider noting "run interactively,
do not log" in the usage block, or write the secret to a file with 0600 perms.

---

_Reviewed: 2026-06-19T01:21:39Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

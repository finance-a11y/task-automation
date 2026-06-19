# Phase 4: Reverse Notifications (Flow B) - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart-discuss)

<domain>
## Phase Boundary

An independent ClickUp → Slack path. A new webhook endpoint verifies ClickUp's `X-Signature` (HMAC-SHA256 over the raw body), listens for task status and assignee changes, and posts the relevant ones into the originating Slack thread using the `task2thread` map stored in Phase 3.

In scope: `/api/clickup/webhook` Vercel function (NOT Bolt — plain function), raw-body X-Signature verification, parsing the ClickUp webhook payload for `taskStatusUpdated` / `taskAssigneeUpdated`, resolving the task→thread mapping, building a Spanish notification message, posting it to the thread, webhook-redelivery dedup, and event filtering (only meaningful transitions). Plus a small one-time helper/doc for registering the webhook with ClickUp.

Out of scope: error UX polish, rate-limit/backoff, kill switch (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Endpoint
- `/api/clickup/webhook` — a plain Vercel serverless function, separate from the Slack Bolt endpoints. Read the RAW request body first (before any JSON parse) to compute/verify the HMAC.
- **Signature:** ClickUp sends `X-Signature` = HMAC-SHA256 of the raw body using the webhook secret (returned when the webhook is created). Verify with Node `crypto` + timing-safe compare. Reject (401) on mismatch/missing. Env: `CLICKUP_WEBHOOK_SECRET`.
- ACK fast (200) then process; ClickUp retries on non-2xx, so dedup is required.

### Events + filtering
- Subscribe to `taskStatusUpdated` and `taskAssigneeUpdated`. The webhook payload includes `event`, `task_id`, and a `history_items` array with before/after values.
- **Filter:** only notify on meaningful transitions — for status: any status change (post old → new); for assignee: added/removed assignees. Ignore events for tasks not in our `task2thread` map (i.e. tasks the bot didn't create) — look up `task2thread:<taskId>`; if absent, drop silently (it's not one of our tasks).
- **Dedup:** ClickUp may redeliver; dedup on the webhook delivery id / a hash of (event + task_id + history_item id) in Redis with TTL, same SET-NX-EX pattern as Phase 1.

### Notification message (Spanish, threaded)
- Look up `task2thread:<taskId>` → {channel, thread_ts}. Post to that thread:
  - status: `🔄 *<task name or id>* cambió de estado: <old> → <new>`
  - assignee: `👤 *<task>* asignados actualizados: +<added> / -<removed>` (resolve member ids → names via the Phase 2 members map when possible).
- If the task isn't in the map, no-op. Keep messages compact.
- Resolve the actor/new status names from `history_items` fields. Task name may need a light fetch from ClickUp (`GET /task/{id}`) OR be taken from the payload if present — prefer payload fields; only fetch if necessary (reuse the Phase 3 ClickUp client, extend with a `getTask` if needed).

### Webhook registration (one-time, documented)
- Provide a small script/README section to register the webhook via `POST /team/{teamId}/webhook` with `endpoint`, `events: ["taskStatusUpdated","taskAssigneeUpdated"]`, capturing the returned secret into `CLICKUP_WEBHOOK_SECRET`. teamId/workspace `90131720021`. This is run once by the user after deploy (live-deferred).

### Testing
- Offline: build real HMAC-signed payloads with node:crypto → valid passes, invalid/missing/tampered rejected; status-change and assignee-change payloads post the right Spanish message to the mapped thread; unmapped task_id → no post; redelivery (same id) → posts once.
- Live (human-deferred): real ClickUp webhook registration + real status/assignee change in the Task-Seo Team list posting into a real thread.

### Claude's Discretion
Exact X-Signature header casing (verify against ClickUp docs — flagged research gap; the verifier should be tolerant of header-name casing), history_items field extraction, whether getTask is needed for the task name, message wording, dedup key scheme.
</decisions>

<code_context>
## Existing Code Insights

Reuse: `src/store/redis.ts` (task2thread map from Phase 3, plus SET-NX-EX dedup from Phase 1), `src/clickup/client.ts` (extend with getTask if needed), `src/config/members.ts` (member id → name), `src/config/env.ts` (add CLICKUP_WEBHOOK_SECRET, and CLICKUP_TEAM_ID default 90131720021). The Slack posting can reuse a WebClient (chat.postMessage) — inject it like Phase 3. The signature-over-raw-body discipline mirrors Phase 1 but uses ClickUp's scheme, not Slack's.
</code_context>

<specifics>
## Specific Ideas

- ClickUp X-Signature exact format is a known research gap — implement the HMAC-SHA256-over-raw-body verifier defensively and make the header lookup case-insensitive; the verifier should be unit-tested against a self-computed signature so the logic is proven even before the live secret is known.
- Only tasks the bot created (present in task2thread) generate notifications — this naturally scopes Flow B to bot-managed tasks and avoids noise from unrelated ClickUp activity.
</specifics>

<deferred>
## Deferred Ideas

- Richer notifications (comments, due-date changes) are out of v1 scope; only status + assignee per requirements.
</deferred>

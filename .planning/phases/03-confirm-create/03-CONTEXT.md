# Phase 3: Confirm + Create (Flow A complete) - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart-discuss)

<domain>
## Phase Boundary

The complete, shippable Slack → ClickUp slice. On a captured message (Phase 1) the bot runs parseAndResolve (Phase 2), posts a Block Kit **preview** in the thread showing resolved values, a human clicks **Confirmar / Editar / Cancelar**, and on Confirm the task is created in the Task-Seo Team list with all fields set and its link posted back — validating Core Value end to end.

In scope: replacing Phase 1's placeholder receipt with the real parse→preview flow; the Block Kit preview message; a Slack interactions endpoint (`/api/slack/interactions`) handling button actions + the Edit modal submission; pending-task persistence in Redis keyed by `pendingId`; the ClickUp REST client (create task + set custom fields + assignees + dates); posting the created task link back to the thread; and storing the task↔thread map for Phase 4.

Out of scope: reverse webhook notifications (Phase 4), production hardening/kill-switch (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Flow
1. Phase 1 capture → instead of the "👀 Recibido" placeholder, call `parseAndResolve(text, now)`.
2. Persist the `ResolvedTask` (+ original channel, message ts/thread_ts, raw text) in Redis under `pending:<pendingId>` with a TTL (e.g. 1 hour). `pendingId` = a short random id (nanoid or crypto.randomUUID slice).
3. Post a threaded Block Kit **preview**: section showing Título, Descripción, Cliente (resolved name or ⚠️ "sin resolver"), Asignados (resolved names; flag unresolved), Start/Due (formatted human dates in TEAM_TIMEZONE or ⚠️), Links. Actions block with three buttons: `Confirmar` (primary, value=pendingId), `Editar` (value=pendingId), `Cancelar` (danger, value=pendingId).
4. **Confirmar:** load pending from Redis → create ClickUp task → on success update the preview message (`chat.update`) to a "✅ Tarea creada" state with the task link, disable buttons, also post link in thread; delete pending; write task↔thread map (`task2thread:<taskId>` → {channel, thread_ts}). Idempotency: guard so a double-click doesn't create twice (mark pending as "creating"/delete-on-claim).
5. **Editar:** open a Slack modal (`views.open`) prefilled from pending — Título/Descripción text inputs, **Cliente** static_select (7 options), **Asignados** multi_static_select (9 members), Start/Due date pickers. On submit, update the pending in Redis and re-render the preview.
6. **Cancelar:** delete pending, `chat.update` the message to a "❌ Cancelado" state, disable buttons.

### Interactions endpoint
- `/api/slack/interactions` — separate Vercel function. Verify Slack signature over raw body (same discipline as Phase 1; reuse the @vercel/slack-bolt receiver / Bolt action+view handlers). ACK fast (Slack needs <3s for interactions too; modal open must be within 3s — open the modal in the ack, do ClickUp create in waitUntil and update the message after).
- Wire button `action_id`s and the modal `callback_id` through Bolt handlers.

### ClickUp client (`src/clickup/`)
- Plain `fetch` against ClickUp REST v2. `CLICKUP_API_TOKEN` env (personal token or OAuth). `CLICKUP_LIST_ID` env (default `901327239630` Task- Seo Team).
- `createTask({name, description, assignees, start_date, due_date})` → POST `/list/{listId}/task` with `start_date`/`due_date` as epoch **ms**, `assignees` as member id array.
- Set the **Cliente** custom field: either inline via `custom_fields` array on create, or POST `/task/{id}/field/{fieldId}` with `{value: optionUUID}`. Field id `05ebdc8a-4736-404d-9132-3ab32875e1f1`. Set **Link/Loom** url field (`5a03e7cb-0af0-4179-9f05-d0620334fc08`) when a link is present.
- Return `{id, url}` for the thread reply.
- Inject the fetch/client for offline testing.

### State / keys (Redis, reuse Phase 1 store)
- `pending:<pendingId>` → JSON ResolvedTask + context, TTL 3600s.
- `task2thread:<taskId>` → JSON {channel, thread_ts}, longer TTL (e.g. 30 days) for Phase 4.

### Testing
- Offline unit/integration with mocked Slack client + mocked ClickUp fetch + in-memory Redis fake: preview block structure; confirm → createTask called with correct epoch-ms dates, assignee ids, cliente UUID, Link/Loom; double-confirm creates once; cancel deletes pending; edit-modal submit updates pending and re-renders; unresolved fields flagged in preview.
- Live (human-deferred): real Slack interactivity + real ClickUp task creation need a deployed app + tokens.

### Claude's Discretion
Block Kit layout details, modal field wiring, pendingId scheme, exact TTLs, ClickUp custom-field-on-create vs separate call (pick whichever ClickUp API supports cleanly — verify the create-with-custom_fields shape).
</decisions>

<code_context>
## Existing Code Insights

Reuse: `src/parseAndResolve.ts` (Phase 2), `src/store/redis.ts` (extend with pending/task2thread helpers), `src/slack/app.ts` + `src/config/env.ts` (add CLICKUP_API_TOKEN, CLICKUP_LIST_ID; the receiver pattern for the new interactions endpoint). Match the dependency-injection style. The Phase 1 `process.ts` placeholder receipt is replaced by the parse→preview path.
</code_context>

<specifics>
## Specific Ideas

- This phase makes the product actually usable. Keep the preview compact and Spanish, with clear ⚠️ markers on any field the resolver returned null for, so the human knows to Edit before confirming.
- Verify the ClickUp create-task custom_fields payload shape against ClickUp REST docs during planning (create-with-custom_fields vs set-field-value endpoint) — flagged in research gaps.
</specifics>

<deferred>
## Deferred Ideas

- 1-click high-confidence confirm and reaction-based confirm are v2 (REQUIREMENTS v2). Phase 3 always shows the full preview gate.
</deferred>

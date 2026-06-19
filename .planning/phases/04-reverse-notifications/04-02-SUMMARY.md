---
phase: 04-reverse-notifications
plan: 02
subsystem: clickup-webhook-core
tags: [flow-b, notifications, parsing, spanish]
requires:
  - "src/store/redis.ts getThreadForTask + markWebhookDeliveryOnce (Phase 3 + 04-01)"
  - "src/config/members.ts MEMBERS (Phase 2)"
  - "src/clickup/client.ts getTask (this plan)"
provides:
  - "processClickUpWebhook(deps, payload): Promise<void>"
  - "parseWebhookPayload(raw): ClickUpWebhookPayload | null"
  - "buildStatusMessage / buildAssigneeMessage (pure)"
  - "ClickUpClient.getTask(id): GetTaskResult"
  - "ClickUpWebhookPayload / ClickUpHistoryItem / GetTaskResult types"
affects:
  - "04-03 (HTTP ingress wires processClickUpWebhook into waitUntil)"
tech-stack:
  added: []
  patterns: ["dependency-injected side-effects", "defensive payload shape-guarding"]
key-files:
  created:
    - src/clickup/webhook.ts
    - src/clickup/webhook.test.ts
  modified:
    - src/clickup/types.ts
    - src/clickup/client.ts
    - src/clickup/client.test.ts
    - src/slack/interactions.test.ts
decisions:
  - "history_items extraction tolerates both assignee_add/assignee_rem and a generic assignee field; status before/after may be a string or { status } object"
  - "Delivery dedup key = event:task_id:first-history-item-id"
  - "Task name resolved payload-first, then getTaskName fallback, then task_id; getTaskName failure degrades silently"
  - "All side-effects wrapped so processClickUpWebhook never rejects (runs in waitUntil)"
metrics:
  duration: ~12m
  completed: 2026-06-18
---

# Phase 4 Plan 02: Flow B Core Summary

The full ClickUp → Slack vertical slice proven offline: parse a webhook payload for `taskStatusUpdated` / `taskAssigneeUpdated`, filter to meaningful transitions, look up the originating thread via `task2thread`, build a compact Spanish message, and post it — with redelivery dedup and a silent drop for tasks the bot did not create.

## What Was Built

- **`src/clickup/webhook.ts`** — `processClickUpWebhook(deps, payload)` orchestrating: event allow-list → meaningful-transition filter → `getThreadForTask` scoping → `markWebhookDeliveryOnce` dedup → name resolution → `slack.chat.postMessage`. Plus pure exported `parseWebhookPayload`, `buildStatusMessage`, `buildAssigneeMessage`. Member ids resolve to names via a `MEMBERS` reverse map (raw-id fallback). Side-effects are wrapped so the function never rejects into the `waitUntil` caller.
- **`src/clickup/client.ts`** — `getTask(id)` for the task-name fallback (GET /task/{id}, raw token, tolerates ClickUp's status-object shape; non-2xx throws status+body, never the token).
- **`src/clickup/types.ts`** — `GetTaskResult`, `ClickUpHistoryItem`, `ClickUpWebhookPayload` (all loosely typed — wire shape is a research gap).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ClickUpClient mocks missing getTask broke typecheck**
- **Found during:** Task 2 (full typecheck after adding getTask to the ClickUpClient type)
- **Issue:** `src/slack/interactions.test.ts` builds two `ClickUpClient` mocks; adding `getTask` to the interface made the literals incomplete.
- **Fix:** Added a `getTask` mock to both. No behavior change.
- **Files modified:** src/slack/interactions.test.ts
- **Commit:** `fix(04-02): add getTask to ClickUpClient mocks`

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- `npx vitest run` — 182 passed, 1 skipped (live parse), 0 failed.
- Offline e2e (webhook.test.ts, 19 cases): status & assignee payloads → correct Spanish thread message; unmapped task_id dropped; old===new and no-add/no-remove dropped; redelivery posts once; unknown event ignored; getTaskName/Slack failures never throw.

## Requirements

- NOTIFY-02 (event handling) + NOTIFY-03 (filtered thread posting) — proven offline.

## Self-Check: PASSED

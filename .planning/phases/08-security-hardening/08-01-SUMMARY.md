---
phase: 08-security-hardening
plan: 01
subsystem: ops-endpoints
tags: [security, ops, auth, vercel]
requires: [src/config/env.ts]
provides: [src/ops/auth.ts, "Bearer-gated diag + refresh-config"]
affects: [api/slack/diag.ts, api/admin/refresh-config.ts]
tech-stack:
  added: []
  patterns: ["fail-closed ops gate", "timing-safe Bearer compare"]
key-files:
  created: [src/ops/auth.ts, src/ops/auth.test.ts]
  modified: [src/config/env.ts, src/config/env.test.ts, api/slack/diag.ts, api/admin/refresh-config.ts, README.md, DEPLOY.md]
decisions:
  - "OPS_API_TOKEN is optional (no min-length) so unset never trips fail-fast boot"
  - "Endpoints fail-closed: 404 when token unset, 401 on missing/wrong Bearer"
  - "Mutations require POST; diag self-join hardwired to SLACK_TASK_CHANNEL_ID"
metrics:
  duration: ~12m
  completed: 2026-06-19
requirements: [SEC-04, SEC-05, SEC-06]
---

# Phase 8 Plan 01: Ops-Endpoint Hardening Summary

Replaced the `?secret=<SLACK_SIGNING_SECRET>` query gate on both ops endpoints with a dedicated, optional `OPS_API_TOKEN` checked via `Authorization: Bearer` (timing-safe), fail-closed to 404 when unset.

## What Was Built

- **src/ops/auth.ts** — pure `evaluateOpsAuth(opsToken, authHeader)` returning `disabled` / `unauthorized` / `ok`. Trims the token (empty/whitespace = disabled), parses a case-insensitive `Bearer ` scheme, and compares with a length-guarded `crypto.timingSafeEqual` that never throws. 10 unit tests.
- **src/config/env.ts** — added `OPS_API_TOKEN: z.string().trim().optional()`. No min-length, so a missing or empty value never trips the fail-fast Zod validation. 3 new env tests confirm unset/empty/explicit behavior.
- **api/admin/refresh-config.ts** — now `POST`-only behind the Bearer gate. GET returns 405 `{ allow: "POST" }`. Response is `{ clearedCount }` instead of the cleared key names. The `:lastgood` safety-net copies are still preserved.
- **api/slack/diag.ts** — `GET` returns a reduced report (`redisUrlScheme`, `redisOk`, `botUserId`, `botName`, `team`, `channelCount`, `taskChannelJoined`) — no full channel list, no Redis host, no cache key names. `POST` performs the bot self-join hardwired to `SLACK_TASK_CHANNEL_ID` (the arbitrary `?join=` param was removed entirely), then returns the same report. Auth is checked first, before any Slack/Redis call.
- **README.md / DEPLOY.md** — replaced the `?secret=` instructions with the `OPS_API_TOKEN` + `Authorization: Bearer` model, documented the 404-when-unset fail-closed behavior, POST-only mutations, and the restricted self-join.

## Findings Closed

- **FIND-01 (High)** — secret-in-URL credential overload: closed. Bearer token, signing secret no longer reused as the ops gate.
- **FIND-02 (High)** — state change over GET + arbitrary self-join: closed. POST-only mutations, join hardwired to the configured channel, fail-closed 404.
- **FIND-03 (Medium)** — topology disclosure: closed. Counts/booleans only.

## Tests

- Offline only (no live env). Full suite: **304 passed, 2 skipped** (was 291 passed / 2 skipped → +13 new ops/env tests). `tsc --noEmit` clean.

## Deviations from Plan

None - plan executed exactly as written.

## Live Re-verify (human-deferred)

- `curl` against the deploy with no `OPS_API_TOKEN` set → expect 404 on both endpoints.
- With the token set: missing/wrong Bearer → 401; correct Bearer GET diag → reduced report; POST refresh-config → `{ clearedCount }`; GET refresh-config → 405.

## Commits

- f629758 feat(08-01): add optional OPS_API_TOKEN + timing-safe ops-auth gate
- 5f405b5 feat(08-01): gate diag + refresh-config on OPS_API_TOKEN Bearer
- 596f83d docs(08-01): document OPS_API_TOKEN + Bearer ops auth model

## Self-Check: PASSED

- src/ops/auth.ts, src/ops/auth.test.ts created and committed.
- Both endpoints reference evaluateOpsAuth, neither references SLACK_SIGNING_SECRET.
- All three commit hashes present in git log.

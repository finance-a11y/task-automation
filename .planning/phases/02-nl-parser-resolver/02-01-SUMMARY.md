---
phase: 02-nl-parser-resolver
plan: 01
subsystem: config
tags: [env, config-as-code, openai, luxon, clients, members]
requires: [01-* env contract]
provides:
  - "OPENAI_API_KEY (required) + OPENAI_MODEL (default gpt-4o-mini) in loadEnv"
  - "CLIENTS / CLIENTE_FIELD_ID / CLIENT_ALIASES typed config (7 option UUIDs)"
  - "MEMBERS / MEMBER_ALIASES / SLACK_TO_MEMBER typed config (9 member ids)"
affects: [src/config/env.ts, package.json, .env.example]
tech-stack:
  added: [openai@^6.44.0, luxon@^3.7.2, "@types/luxon@^3.7.1"]
  patterns: ["as const satisfies for typed config maps", "fail-fast zod env"]
key-files:
  created: [src/config/clients.ts, src/config/clients.test.ts, src/config/members.ts, src/config/members.test.ts]
  modified: [src/config/env.ts, src/config/env.test.ts, .env.example, package.json, src/slack/events.integration.test.ts]
decisions:
  - "luxon chosen over date-fns-tz for IANA-TZ-correct date math (Claude's Discretion)"
  - "OPENAI_API_KEY required (production fail-fast); offline tests inject mocks"
metrics:
  duration: ~8 min
  completed: 2026-06-18
requirements: [PARSE-01, PARSE-02, PARSE-03]
---

# Phase 2 Plan 01: Config + Env Foundation Summary

Extended the fail-fast env contract with the OpenAI vars, installed the OpenAI SDK + luxon for TZ-correct dates, and encoded the 7 real Cliente option UUIDs and 9 real ClickUp member ids as test-locked, typed config-as-code maps with alias tables.

## What Was Built

- **Env (`src/config/env.ts`)**: added `OPENAI_API_KEY: nonEmpty` (required) and `OPENAI_MODEL: nonEmpty.default("gpt-4o-mini")`. TEAM_TIMEZONE untouched (reused by plan 02's date resolver). No OpenAI client factory here (deferred to plan 03).
- **`src/config/clients.ts`**: `CLIENTE_FIELD_ID`, `CLIENTS` (7 name→UUID, `as const satisfies`), `ClientName` union, `CLIENT_ALIASES` (feli/delta/nicmafia/...).
- **`src/config/members.ts`**: `MEMBERS` (9 name→id), `MemberName` union, `MEMBER_ALIASES` (vero/jc/ari/...), empty typed `SLACK_TO_MEMBER` override scaffold.
- **`.env.example`**: documented both OpenAI vars.

## Tests

- env.test.ts: 9 tests (added OPENAI_MODEL default, override, missing-key throw).
- clients.test.ts: 3 tests (field id, all 7 UUIDs verbatim, aliases→canonical).
- members.test.ts: 3 tests (all 9 ids verbatim, aliases, SLACK_TO_MEMBER scaffold).
- Full suite: 44/44 passing, `tsc --noEmit` clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Backfilled OPENAI vars in integration test fixture**
- **Found during:** Task 2 (typecheck after adding required env fields)
- **Issue:** `src/slack/events.integration.test.ts` declares a literal `Env` fixture; the two new required fields broke its type.
- **Fix:** Added `OPENAI_API_KEY` + `OPENAI_MODEL` to that fixture.
- **Files modified:** src/slack/events.integration.test.ts
- **Commit:** cde4651

## Dependency Provenance

Package legitimacy gate was pre-approved (autonomous authority). Installed `openai@^6.44.0` (official OpenAI SDK), `luxon@^3.7.2`, `@types/luxon@^3.7.1` from npm with network available. `npm audit` reports pre-existing transitive vulnerabilities inherited from the Phase 1 toolchain (vercel/vitest) — out of scope, logged not fixed.

## Self-Check: PASSED

- src/config/clients.ts, src/config/members.ts exist.
- Commits cde4651, 2c2a434 present.

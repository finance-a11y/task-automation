---
phase: 06-dynamic-config-from-clickup
plan: 03
subsystem: slack-capture + admin
tags: [dynamic-config, slack-email, refresh-endpoint, wiring, DYN-04, DYN-06]
requires: [06-01, 06-02]
provides:
  - "resolveSlackMentionsToMembers — email-based Slack→ClickUp member resolution + cfg:slackmap cache"
  - "GET /api/admin/refresh-config — secret-gated cfg:* cache clear (keeps last-good)"
  - "live capture path: provider + email resolver injected into parse → preview"
affects: [src/slack/slackEmail.ts, api/admin/refresh-config.ts, src/slack/process.ts, src/slack/app.ts, src/parseAndResolve.ts, README.md]
tech-stack:
  added: []
  patterns: [email-identity-match, secret-gated-admin-endpoint, degrade-to-static, per-warm-instance-provider]
key-files:
  created:
    - src/slack/slackEmail.ts
    - src/slack/slackEmail.test.ts
    - api/admin/refresh-config.ts
  modified:
    - src/slack/process.ts
    - src/slack/process.test.ts
    - src/slack/app.ts
    - src/parseAndResolve.ts
    - README.md
decisions:
  - "cfg:slackmap:<id> caches the RESOLVED member id (not the raw email) with a 24h TTL — PII never persisted or logged"
  - "Email resolution degrades to static SLACK_TO_MEMBER then omission; capture flow never blocks (DYN-05)"
  - "Refresh endpoint lists cfg:* via redis.keys, filters OUT :lastgood, dels the rest"
metrics:
  duration: "~25m"
  completed: 2026-06-19
---

# Phase 6 Plan 03: Slack email resolution + refresh endpoint + live wiring Summary

Closed the phase: @-mentions resolve to ClickUp members by email (DYN-04), a secret-gated endpoint clears the cache on demand (DYN-06), and the live capture path now resolves cliente/assignees from the provider end to end with the static maps as the safety net.

## What was built

- **src/slack/slackEmail.ts** — `resolveSlackMentionsToMembers(ids, deps)`: per id, `cfg:slackmap:<id>` cache → `users.info` email → `membersConfig.byEmail` match → cache (24h). Degrades to the static `SLACK_TO_MEMBER` overlay on `missing_scope`/no-email/no-match, else omits the id; never throws. `extractSlackMentionIds(text)` pulls `U/W` ids from `<@..>` tokens (deduped).
- **api/admin/refresh-config.ts** — `GET /api/admin/refresh-config?secret=<SLACK_SIGNING_SECRET>`, timing-safe gate copied from diag.ts. Lists `cfg:*`, filters out `:lastgood`, dels the hot keys, returns `{ cleared: [...] }`. Secret never logged.
- **src/parseAndResolve.ts** — `ParseAndResolveDeps` forwards optional `clientesConfig`/`membersConfig` into `resolveTask`.
- **src/slack/process.ts** — before parsing, awaits `provider.getClientes()`/`getMembers()` and `resolveSlackToMember(extractSlackMentionIds(text))`, merging both into the per-call parse deps. Each step wrapped to degrade to static (DYN-05); dedup/kill-switch/failure ordering unchanged.
- **src/slack/app.ts** — one `createConfigProvider` per warm instance (passes `env.CLICKUP_TEAM_ID` into the client), plus a `resolveSlackToMember` closure using the per-event Slack client's `users.info`.
- **README.md** — "Dynamic config (v1.1)" section: refresh URL + secret gate, ~10min TTL, and the one-time `users:read.email` scope + reinstall step (degrades gracefully if skipped).

## Tests

- slackEmail.test.ts: 9 tests (email match + cache, cache hit skips users.info, missing_scope→overlay/omit, no-match→overlay/omit, dedup, Redis-throw degrade, case-insensitive email).
- process.test.ts: +2 tests (live provider + email resolver surface in preview; provider failure → static fallback). All prior process/parse tests pass unchanged.
- Full suite: 287 passing / 2 skipped (up from 235). Typecheck clean.

## Deviations from Plan

None — plan executed as written.

## Live-deferred items (no tokens/scope in this environment)

- Add the `users:read.email` Slack bot scope + reinstall the app (documented in README + user_setup). Until then, assignee resolution falls back to name/alias + static SLACK_TO_MEMBER.
- Real ClickUp field/member fetch and the refresh endpoint's live Redis path are exercised only against mocks/in-memory fakes here; verify against the live workspace post-deploy.

## Known Stubs

None. All wired paths resolve real data (or degrade to the static maps); no placeholder/empty-data UI stubs introduced.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: admin-endpoint | api/admin/refresh-config.ts | New unauthenticated-internet route mutating cache state; mitigated by the timing-safe SLACK_SIGNING_SECRET gate (T-06-06). Phase 8 hardens further. |
| threat_flag: pii-read | src/slack/slackEmail.ts | Reads teammate emails via users.info; used only in-memory for matching, cached as the resolved member id (not the email), never logged (T-06-07). |

## Self-Check: PASSED
- src/slack/slackEmail.ts, api/admin/refresh-config.ts present.
- grep timingSafeEqual api/admin/refresh-config.ts == 1; process provider gate ≥ 2.
- Commits 845402f, c2cf478, 11c109d exist on phase-06-dynamic-config.

---
phase: 04-reverse-notifications
plan: 01
subsystem: clickup-webhook-security
tags: [hmac, idempotency, env, security]
requires:
  - "src/store/redis.ts RedisLike + markEventOnce pattern (Phase 1/3)"
  - "src/config/env.ts loadEnv contract (Phase 1)"
provides:
  - "verifyClickUpSignature(rawBody, signature, secret): boolean"
  - "getClickUpSignatureHeader(headers): string | null"
  - "markWebhookDeliveryOnce(redis, deliveryKey, ttl?): boolean"
  - "Env.CLICKUP_WEBHOOK_SECRET (required) + Env.CLICKUP_TEAM_ID (default 90131720021)"
affects:
  - "04-02 (consumes markWebhookDeliveryOnce), 04-03 (consumes verifier + env)"
tech-stack:
  added: []
  patterns: ["node:crypto HMAC over raw body", "SET-NX-EX idempotency"]
key-files:
  created:
    - src/clickup/signature.ts
    - src/clickup/signature.test.ts
  modified:
    - src/config/env.ts
    - src/config/env.test.ts
    - src/store/redis.ts
    - src/store/redis.test.ts
    - src/slack/events.integration.test.ts
decisions:
  - "X-Signature hex normalized to lowercase, optional 'sha256=' prefix stripped, 64-char hex guard before timingSafeEqual (format is a research gap — defensive)"
  - "Webhook dedup uses a distinct 'whk:' namespace; 24h TTL for ClickUp's redelivery window"
metrics:
  duration: ~10m
  completed: 2026-06-18
---

# Phase 4 Plan 01: Webhook Security + Idempotency Primitives Summary

Raw-body `X-Signature` HMAC-SHA256 verifier (case-insensitive header lookup, timing-safe, never throws), a `whk:`-namespaced SET-NX-EX webhook-redelivery dedup helper, and the two new env vars — all proven offline with self-computed HMACs.

## What Was Built

- **`src/clickup/signature.ts`** — `verifyClickUpSignature(rawBody, signature, secret)` computes `createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")`, strips an optional `sha256=` prefix, lowercases, guards a 64-char hex shape, and `timingSafeEqual`s. Never throws. `getClickUpSignatureHeader` does case-insensitive lookup from a `Headers` object or a plain record. Proven offline: the test computes the expected HMAC itself (valid passes; tampered body / wrong secret / missing / wrong-length / non-hex all rejected).
- **`src/store/redis.ts`** — `markWebhookDeliveryOnce` + `DEFAULT_WEBHOOK_TTL_SECONDS = 86400`, mirroring `markEventOnce` but on a `whk:` namespace isolated from Slack `evt:` keys.
- **`src/config/env.ts`** — `CLICKUP_WEBHOOK_SECRET` required (fail-fast); `CLICKUP_TEAM_ID` defaults to `90131720021`, overridable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Integration-test Env fixture missing new required vars**
- **Found during:** Task 1 (full typecheck after env change)
- **Issue:** `src/slack/events.integration.test.ts` builds an `Env` object literal; the two new required fields broke `npx tsc --noEmit`.
- **Fix:** Added `CLICKUP_WEBHOOK_SECRET` + `CLICKUP_TEAM_ID` to the literal. No behavior change.
- **Files modified:** src/slack/events.integration.test.ts
- **Commit:** see git log `fix(04-01): extend integration-test Env fixture`

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- `npx vitest run` — 159 passed, 1 skipped (live parse test), 0 failed.
- Self-computed HMAC verifies true; tampered/missing/wrong-secret rejected (signature.test.ts, 15 cases).

## Requirements

- NOTIFY-01 (crypto half) — verifier proven offline; enforced at ingress in 04-03.

## Self-Check: PASSED

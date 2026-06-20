# Phase 8: Security Hardening - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart-discuss)

<domain>
## Phase Boundary

Implement the prioritized fixes from Phase 7's `.planning/phases/07-security-audit/SECURITY.md`. Close the 2 High findings, the actionable Mediums, and the cheap Lows. No feature work — surgical security changes that don't break Flow A/B or the existing 291 passing tests.

In scope: harden the ops endpoints (diag + refresh-config), escape outbound Slack mrkdwn in the preview, validate the ClickUp taskId path segment, document the dev-only dependency advisories, and confirm no secret leaks. Out of scope: rate-limiting infra (accept/note), changing the core signature/idempotency design (already sound).
</domain>

<decisions>
## Implementation Decisions (mapped to SECURITY.md findings)

### FIND-01 (High) + carried Phase-6 WR-02 — secret in URL query
- Replace the `?secret=<SLACK_SIGNING_SECRET>` query gate on BOTH `api/slack/diag.ts` and `api/admin/refresh-config.ts` with a dedicated **`OPS_API_TOKEN`** checked in an `Authorization: Bearer <token>` header, timing-safe compare.
- `OPS_API_TOKEN` is a NEW **optional** env var. Add it to the env schema as optional (do NOT make it required — that would break the running deploy). When `OPS_API_TOKEN` is unset/empty, the ops endpoints are **DISABLED → 404** (fail-closed: no token configured = no ops surface). When set, they require the matching Bearer header.
- Stop reusing the Slack signing secret for anything other than HMAC.

### FIND-02 (High) — state changes over GET + diag self-join to arbitrary channel
- Make mutating ops actions require **POST** (refresh-config; diag's `join`). A read-only diag report may stay GET but still behind the Bearer gate.
- Restrict diag self-join: only allow joining the **configured `SLACK_TASK_CHANNEL_ID`** (ignore/deny an attacker-supplied arbitrary `?join=`). Do not let the endpoint join the bot to any channel.
- Combined with the fail-closed token gate (FIND-01), the ops endpoints are off unless an operator sets `OPS_API_TOKEN`.

### FIND-03 (Medium) — diag topology disclosure
- Reduce what diag returns: counts and the single task-channel-membership boolean instead of the full channel list and internal cache key names. `refresh-config` returns a cleared-count, not the key names (also Phase-6 IN-03).

### FIND-04 (Medium) — ClickUp webhook replay
- If the ClickUp payload/headers carry a timestamp, reject deliveries older than a small window (defense-in-depth on top of the existing 24h dedup). If no timestamp is available, keep the dedup and document the residual risk in a code comment — do not invent a field.

### FIND (Low) — outbound preview mrkdwn injection
- The inbound webhook path escapes Slack mrkdwn (`escapeSlackText`), but the **outbound preview** (`src/slack/blocks.ts`) interpolates the task title/description and resolved names raw. A crafted title like `<!channel>` or `<@U…>` in the preview could ping/spoof. Apply `escapeSlackText` (move/share the helper) to the untrusted fields rendered in the preview blocks. Add a test.

### FIND (Low) — unvalidated taskId path segment
- `getTask(id)` interpolates `id` into the ClickUp URL. Validate the taskId against an allowed pattern (ClickUp ids are alphanumeric) before the fetch; reject/skip otherwise. Defense-in-depth (the id comes from ClickUp's own webhook today, but guard the boundary).

### FIND-05 / FIND-06 (Medium) — dev-only deps + rate limiting
- Deps: `npm audit --omit=dev` is already 0; document that the 21 advisories are dev-only (vercel/vitest toolchain) in SECURITY.md's status and don't ship to runtime. Update critical/high dev deps only if trivially safe; otherwise record as accepted.
- Rate limiting: note as accepted for v1.1 (Vercel platform + the signature gates are the practical limiter); a Redis token-bucket is a future item, not this phase.

### Secrets (SEC-06)
- Re-confirm no token/secret/email is logged or returned in any response or error body (the audit found this clean; keep it clean after the changes — especially the new ops responses).

### Closing the audit
- After fixes, update `SECURITY.md` status: mark each addressed finding as fixed (file:line of the fix), and the accepted ones as accepted-with-rationale.

### Testing
- Unit-test: ops endpoints → 404 when OPS_API_TOKEN unset; 401 on missing/wrong Bearer; 200 on correct Bearer; refresh-config rejects GET (405) and accepts POST; diag join restricted to the configured channel. mrkdwn escape in preview blocks. taskId validation rejects a bad id.
- Keep the full suite green (291 + new) and `tsc --noEmit` clean.

### Claude's Discretion
Exact token header parsing, 404-vs-401 split, how to share `escapeSlackText`, taskId regex.
</decisions>

<code_context>
## Existing Code Insights

Touch points: `api/slack/diag.ts`, `api/admin/refresh-config.ts` (rewrite the gate + method + response), `src/config/env.ts` (add optional OPS_API_TOKEN), `src/slack/blocks.ts` (escape preview fields — reuse the `escapeSlackText` currently in `src/clickup/webhook.ts`; consider moving it to a shared util), `src/clickup/client.ts` (validate taskId in getTask), `.planning/phases/07-security-audit/SECURITY.md` (the findings + update its status). Reuse the timing-safe compare already used by the gates.
</code_context>

<specifics>
## Specific Ideas

- Fail-closed is the key principle: with no `OPS_API_TOKEN` set, diag and refresh-config simply don't exist (404). That removes the live exposure immediately even before an operator configures the token. Document `OPS_API_TOKEN` (generate a random 32+ char value) and the new `Authorization: Bearer` usage in README + DEPLOY.md, replacing the old `?secret=` instructions.
- Keep changes surgical: this phase hardens, it does not refactor the working signature/idempotency/flow code the audit already cleared.
</specifics>

<deferred>
## Deferred Ideas

- Redis token-bucket rate limiting and rotating the ops token are future items.
- Replacing the dev-only vulnerable toolchain deps is out of scope unless trivial (0 runtime impact).
</deferred>

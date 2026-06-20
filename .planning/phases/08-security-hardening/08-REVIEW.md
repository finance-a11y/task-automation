---
phase: 08-security-hardening
reviewed: 2026-06-19T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/ops/auth.ts
  - api/slack/diag.ts
  - api/admin/refresh-config.ts
  - src/config/env.ts
  - src/util/slackMrkdwn.ts
  - src/slack/blocks.ts
  - src/clickup/client.ts
  - src/clickup/webhook.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 8: Code Review Report — Security Hardening

**Reviewed:** 2026-06-19
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found (no blockers)

## Summary

The hardening work is sound. The core security claims hold under adversarial reading:

- **`evaluateOpsAuth` is correct and bypass-free.** `safeEqual` does a length guard *before* `crypto.timingSafeEqual`, so it never throws and never compares unequal-length buffers. There is no path to `"ok"` with a wrong or empty token: an empty/whitespace presented token fails the length guard against a non-empty configured token. Bearer parsing is case-insensitive, trims, and rejects a bare `Bearer` with no token. An unset/empty `OPS_API_TOKEN` returns `"disabled"` first, so the endpoints genuinely 404.
- **Fail-closed is intact.** With `OPS_API_TOKEN` unset, all four handlers (diag GET/POST, refresh GET/POST) hit the gate before any Slack/Redis call and return 404. No code runs before the gate. `env.ts` makes the token optional with no min-length, so a missing value never trips boot validation.
- **diag self-join is hardwired** to `env.SLACK_TASK_CHANNEL_ID`; no request-controlled channel param exists.
- **refresh-config** is POST-gated before the cache clear, returns a count (not key names), and never echoes a secret.
- **Escaping is comprehensive.** `escapeSlackText` neutralizes `&`/`<`/`>` in the correct order, defanging `<!channel>`, `<@U…>`, and `<url|text>`. Every untrusted field in the preview (title, description, links, cliente, assignee names, unresolved names) is escaped. The webhook escaping survived the move to the shared util with a back-compat re-export.
- **taskId validation** runs before the fetch and rejects slashes/dots/spaces (path-traversal/SSRF input).

No critical issues. Findings below are residual-disclosure and robustness items.

## Warnings

### WR-01: refresh-config GET skips the unauthorized check, disclosing endpoint existence

**File:** `api/admin/refresh-config.ts:50-58`
**Issue:** The GET handler evaluates the gate but only branches on `"disabled"`. When a token IS configured, an unauthenticated GET (no/invalid Bearer) returns `405 {"allow":"POST"}` instead of `401`. This is inconsistent with the rest of the surface (diag GET/POST and refresh POST all return 401 on `"unauthorized"`) and discloses the live endpoint to a caller who presents no valid credential.
**Fix:** Treat `"unauthorized"` before falling through to 405:
```ts
const gate = evaluateOpsAuth(env.OPS_API_TOKEN, req.headers.get("authorization"));
if (gate === "disabled") return new Response("not found", { status: 404 });
if (gate === "unauthorized") return new Response("unauthorized", { status: 401 });
return new Response(JSON.stringify({ allow: "POST" }, null, 2), {
  status: 405,
  headers: { "content-type": "application/json", allow: "POST" },
});
```

### WR-02: taskId regex rejects ClickUp custom task IDs (hyphens), silently degrading getTask

**File:** `src/clickup/client.ts:155`
**Issue:** `/^[A-Za-z0-9]+$/` rejects any task id containing a hyphen. ClickUp "Custom Task IDs" (e.g. `PREFIX-123`) and any future use of them would throw `"invalid taskId format"`. The webhook fallback (`src/clickup/webhook.ts:281-289`) swallows the throw and falls back to the raw id, so notifications still post but lose the real task name — a silent correctness regression if custom IDs are ever enabled. Standard numeric/alphanumeric ids in use today are unaffected, so this is robustness, not a current break.
**Fix:** If custom IDs may be used, widen to the documented charset while still blocking traversal: `/^[A-Za-z0-9_-]+$/` (no `/`, `.`, space). Otherwise add a code comment that custom task IDs are intentionally unsupported.

## Info

### IN-01: diag GET performs a Redis write (not strictly read-only)

**File:** `api/slack/diag.ts:54-57`
**Issue:** `buildReport` runs `redis.set("diag:ping", "1", { ex: 30 })` on every GET. The connectivity probe is benign (ephemeral, 30s TTL, no business data) but means GET is not side-effect-free, contrary to the "GET has no mutation" intent.
**Fix:** Acceptable as a probe; if strict read-only GET is desired, make the write-probe POST-only or gate it behind a query flag.

### IN-02: safeEqual leaks token length via early return

**File:** `src/ops/auth.ts:18`
**Issue:** Returning `false` on a length mismatch before `timingSafeEqual` leaks the configured token length through timing. For a high-entropy random Bearer token this is a negligible, industry-standard tradeoff.
**Fix:** No action required. If absolute constant-time is wanted, hash both sides to a fixed width first (e.g. SHA-256) and compare the digests.

### IN-03: buildConfirmedBlocks interpolates taskUrl into a Slack link unescaped

**File:** `src/slack/blocks.ts:131-133`
**Issue:** `<${taskUrl}|Abrir en ClickUp>` does not escape `taskUrl`. The value comes from ClickUp's createTask response (semi-trusted, not end-user input), so risk is low, but a `>` in the URL would break the link markup.
**Fix:** Wrap with `escapeSlackText(taskUrl)` or validate it is an `https://app.clickup.com/...` URL before embedding.

### IN-04: diag report still surfaces workspace/bot identity behind auth

**File:** `api/slack/diag.ts:64-66`
**Issue:** `botUserId`, `botName`, and `team` (workspace name) are returned. This is bounded, authenticated disclosure and consistent with the reduced-disclosure goal (no Redis host, no channel list, no key names, no token), but is mild identity exposure if the ops token leaks.
**Fix:** Acceptable. Drop `team`/`botName` if you want identity-minimal output; keep `botUserId` for the join check.

---

_Reviewed: 2026-06-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

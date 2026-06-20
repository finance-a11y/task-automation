# Phase 6: Dynamic Config from ClickUp - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous smart-discuss)

<domain>
## Phase Boundary

Replace the hardcoded config (clients.ts, members.ts, SLACK_TO_MEMBER) with values read live from ClickUp (and Slack), cached in Redis with a TTL, with resilient fallback to the static maps. Adding a client or a team member in ClickUp must work without a redeploy.

In scope: live fetch of the Cliente dropdown options + ClickUp workspace members, Redis caching with TTL, email-based Slack→ClickUp resolution, resilient fallback, and a manual cache-refresh mechanism. The resolver (cliente/assignees) switches from static maps to the cached dynamic source (static maps become the fallback).

Out of scope: security audit/hardening (Phases 7-8), showing time-of-day in due dates, webhook auto-registration.
</domain>

<decisions>
## Implementation Decisions

### Source of truth (live ClickUp)
- **Cliente options:** `GET /list/{listId}/field` (or `/api/v2/list/{id}/field`) → find the Cliente field (id `05ebdc8a-4736-404d-9132-3ab32875e1f1`) → `type_config.options[]` gives `{id (UUID), name}`. Build a name→UUID map + aliases at runtime. Extend the existing `src/clickup/client.ts` with `getClienteOptions()`.
- **Members:** `GET /team/{teamId}/member` or the workspace members endpoint → `{id, username/email}`. Build name/email→memberId. Extend client with `getMembers()`. teamId `90131720021`.
- **Slack→ClickUp by email:** resolve a Slack user id to a ClickUp member by matching emails. Slack: `users.info` (needs `users:read.email` scope) returns the user's email; match against the ClickUp member email map. Cache the Slack-id→member-id resolution too. NOTE: `users:read.email` is a new Slack scope — flag that it must be added + reinstall (live setup), and fall back gracefully (name/alias resolution still works) if absent.

### Caching (Redis, TTL)
- Cache each fetched dataset under a namespaced key: `cfg:clientes`, `cfg:members`, with a TTL of ~600s (10 min). Store JSON.
- On a parse, the resolver reads from cache; on cache miss it fetches from ClickUp, populates cache, and uses the result. Keep the fetch path off the 3s-ACK critical path where possible (the parse already runs in waitUntil, so a ClickUp fetch there is fine).
- **Slack-id→member cache:** `cfg:slackmap:<slackUserId>` with a longer TTL (emails rarely change), or fold into the members cache.

### Resilient fallback (DYN-05)
- If ClickUp fetch fails AND cache is empty/expired → use a **last-good** cache (store a separate non-expiring `cfg:clientes:lastgood` updated on every successful fetch) → if that's also empty, fall back to the **static maps** (current clients.ts/members.ts), which stay in the repo as the safety net. The flow never breaks because config is momentarily unavailable.
- Log (not user-facing) when falling back.

### Manual refresh (DYN-06)
- Add a tiny secret-gated endpoint or extend `/api/slack/diag` style: e.g. `GET /api/admin/refresh-config?secret=<...>` that deletes `cfg:*` keys so the next parse re-fetches. Reuse the SLACK_SIGNING_SECRET gate pattern from diag (timing-safe). Document it.
- (Phase 8 will harden/gate this and diag.)

### Resolver changes
- `resolveCliente` / `resolveAssignees` take an injected "config provider" (the cached dynamic maps) instead of importing the static constants directly. The provider exposes `getClientes()` and `getMembers()` returning the same shape the resolver already uses (name→id, aliases). Static maps move behind the provider as the fallback. Keep the resolver pure given the provider's data (the provider does the async fetch/cache; the resolver stays sync over the resolved maps).
- The aliases we hand-curated (vero, feli, aprendoseo→Interno, etc.) should be MERGED on top of the dynamic names so curated shortcuts survive. Keep a small static alias overlay.

### Testing
- Unit-test the provider: cache hit (no fetch), cache miss (fetch + populate), fetch failure → last-good → static fallback, TTL expiry. Mock the ClickUp client + an in-memory Redis fake.
- Unit-test email-based Slack→member resolution with mocked Slack users.info + ClickUp members.
- Resolver tests adapt to the provider injection (existing behavior preserved when the provider returns the same data).
- Live (deferred): real ClickUp field/member fetch + Slack users.info needs tokens + the new scope.

### Claude's Discretion
Exact cache key names/TTLs, provider interface shape, whether Slack-map is a separate cache or folded into members, file layout (e.g. `src/config/provider.ts`).
</decisions>

<code_context>
## Existing Code Insights

Touch points: `src/clickup/client.ts` (add getClienteOptions/getMembers using the same fetch+retry wrapper), `src/config/clients.ts` + `src/config/members.ts` (become the static fallback + alias overlay), `src/resolve/cliente.ts` + `src/resolve/assignees.ts` (switch to provider injection), `src/store/redis.ts` (cache get/set helpers with TTL + last-good), `src/slack/app.ts` (wire the provider into parseDeps), and a new admin refresh endpoint under `api/`. Reuse the diag secret-gate pattern. Slack `users.info` needs the `@slack/web-api` WebClient (already used in webhook.ts).
</code_context>

<specifics>
## Specific Ideas

- Keep the static maps as the safety net — do NOT delete clients.ts/members.ts. They are the fallback when ClickUp/Redis are unavailable, so the bot degrades gracefully instead of failing to resolve anything.
- The curated aliases (aprendoseo→Interno, vero, feli, juan, etc.) are product knowledge not present in ClickUp; keep them as an overlay merged on top of the live names.
- Flag the new Slack scope `users:read.email` as a live-setup step (add scope + reinstall) needed for DYN-04; degrade to name-based resolution if absent.
</specifics>

<deferred>
## Deferred Ideas

- Time-of-day in due dates and webhook auto-registration are out of this phase (future requirements).
</deferred>

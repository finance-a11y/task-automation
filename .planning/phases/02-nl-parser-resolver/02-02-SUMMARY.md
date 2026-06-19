---
phase: 02-nl-parser-resolver
plan: 02
subsystem: resolver
tags: [resolver, pure, luxon, timezone, deterministic, tdd]
requires: ["02-01 config maps + env"]
provides:
  - "resolveCliente(raw) → option UUID | null"
  - "resolveAssignees(rawNames, opts) → { ids, unresolved }"
  - "resolveSpanishDate(phrase, now, timezone) → epoch ms | null"
  - "resolveTask(parsed, now, opts) → ResolvedTask (barrel)"
  - "ParsedTask / ResolvedTask shared types"
affects: [src/resolve/*]
tech-stack:
  added: []
  patterns: ["pure injected-now resolution", "luxon start-of-day in zone"]
key-files:
  created:
    - src/resolve/types.ts
    - src/resolve/cliente.ts
    - src/resolve/cliente.test.ts
    - src/resolve/assignees.ts
    - src/resolve/assignees.test.ts
    - src/resolve/dates.ts
    - src/resolve/dates.test.ts
    - src/resolve/index.ts
    - src/resolve/index.test.ts
  modified: []
decisions:
  - "Time-of-day convention: start-of-day IN ZONE (all-day ClickUp tasks)"
  - "Weekday semantics: next occurrence on-or-after today (today if same weekday)"
  - "Accent + leading-article normalization before matching"
metrics:
  duration: ~12 min
  completed: 2026-06-18
requirements: [PARSE-02, PARSE-03, PARSE-04]
---

# Phase 2 Plan 02: Deterministic Resolver Summary

The highest-value, fully-offline core: pure functions mapping the LLM's raw human strings to real ClickUp ids and TZ-correct epoch-ms dates, leaving anything unmatched as null/empty (never invented). Built strictly TDD (RED → GREEN per cycle).

## What Was Built

- **`types.ts`**: shared `ParsedTask` / `ResolvedTask` contract (consumed by plan 03's schema too).
- **`cliente.ts`**: `resolveCliente` — case-insensitive/trimmed name match then alias table → option UUID, else null.
- **`assignees.ts`**: `resolveAssignees` — per token tries the injected Slack→member map, then names, then aliases; deduped order-stable ids; unmatched dropped and surfaced in `unresolved`.
- **`dates.ts`**: `resolveSpanishDate` — luxon, injected `now`, all math in `timezone`. Handles hoy / mañana / pasado mañana / weekday(on-or-after) / "en N días" / dd/mm / dd/mm/yyyy; accent- and article-insensitive; start-of-day-in-zone; null on unparseable.
- **`index.ts`**: `resolveTask` aggregator + resolve/ barrel re-exports.

## Tests (all offline, no key)

- cliente: 3 · assignees: 6 · dates: 11 (incl. 23:30-local off-by-one guard) · index: 5.
- Full suite: 69/69 passing, `tsc --noEmit` clean.
- Purity verified: no `Date.now()` / `process.env` / `fetch(` in resolve source.

## Critical Correctness Notes

- **Pitfall 4 (never invent IDs):** every resolver returns only ids present in the fixed config maps; non-match → null/unresolved.
- **Pitfall 5 (TZ drift):** the off-by-one test sets `now` to 23:30 local (03:30 UTC next day); `mañana` correctly resolves to the LOCAL next day, proving the math runs in team TZ, not server UTC.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Typed-cast alias-table lookups**
- **Found during:** Task 1 typecheck
- **Issue:** The `as const satisfies` alias tables (from plan 01) are literal-keyed; indexing them with a runtime `string` failed strict `noImplicitAny`/index checks.
- **Fix:** Cast to `Record<string, ClientName|MemberName>` at the lookup site only (preserves the build-time verbatim-id guarantee in config, allows dynamic lookup in the resolver).
- **Files modified:** src/resolve/cliente.ts, src/resolve/assignees.ts
- **Commit:** 84b184e

## Self-Check: PASSED

- All 5 source files + 4 test files exist under src/resolve/.
- Commits 84b184e, 83aa3a6, f25f52e present.

---
phase: 02-nl-parser-resolver
plan: 03
subsystem: llm-parser
tags: [openai, structured-outputs, zod, parser, glue, tdd]
requires: ["02-01 env+config", "02-02 resolver"]
provides:
  - "ParsedTaskSchema (zod) — structured-output contract"
  - "createOpenAIClient(env) lazy factory + OpenAILike structural type"
  - "parseTask(text, deps) → ParsedTask (injectable client)"
  - "parseAndResolve(text, now, deps) → ResolvedTask (phase-2 entry point)"
affects: [src/llm/*, src/parseAndResolve.ts]
tech-stack:
  added: []
  patterns: ["zodResponseFormat strict json_schema", "injectable client DI", "describe.skipIf gated live test"]
key-files:
  created:
    - src/llm/schema.ts
    - src/llm/schema.test.ts
    - src/llm/openai.ts
    - src/llm/parse.ts
    - src/llm/parse.test.ts
    - src/parseAndResolve.ts
    - src/parseAndResolve.test.ts
    - src/llm/parse.live.test.ts
  modified: []
decisions:
  - "Used zodResponseFormat(ParsedTaskSchema,'parse_task') + chat.completions.parse (verified working with openai@6 + zod@4)"
  - "OpenAILike.parse body param loosened so real OpenAI client + mocks both satisfy it; typed ParseRequestBody at the build site keeps call-shape safety"
  - "createOpenAIClient requires injected env (no ambient process.env) for clean DI/secret hygiene"
metrics:
  duration: ~14 min
  completed: 2026-06-18
requirements: [PARSE-01]
---

# Phase 2 Plan 03: OpenAI Parser + parseAndResolve Glue Summary

Wired the OpenAI structured-outputs parser and the `parseAndResolve` convenience glue, completing the offline-testable pipeline: raw message → `ParsedTask` (LLM) → `ResolvedTask` (deterministic resolver). Every test runs offline against an injected mock; one live smoke test is gated on `OPENAI_API_KEY`.

## What Was Built

- **`schema.ts`**: `ParsedTaskSchema` (zod, all-required + `.nullable()` optionals + string arrays) and a compile-time `Equals` assertion that the inferred type is structurally identical to the shared `ParsedTask` contract — a build-time canary against drift.
- **`openai.ts`**: `OpenAILike` structural type (only `chat.completions.parse`) + `createOpenAIClient(env)` lazy factory mirroring `createRedis` (throws naming `OPENAI_API_KEY`, never instantiates at module load, env injected).
- **`parse.ts`**: `parseTask(text, deps)` builds the strict `zodResponseFormat(ParsedTaskSchema, "parse_task")` call, Spanish system prompt instructing raw-human-strings-only (no IDs, no date math), re-validates output through the schema, throws typed `ParseError` on refusal/garbage/transport failure.
- **`parseAndResolve.ts`**: composes `parseTask → resolveTask`; injectable deps; re-exports the phase-2 public surface.
- **`parse.live.test.ts`**: single gated live smoke test.

## OpenAI SDK Verification (carried blocker — resolved)

Confirmed against the installed `openai@^6.44.0`: `openai/helpers/zod` exports `zodResponseFormat`, and `client.chat.completions.parse(...)` exists. Verified `zodResponseFormat` produces a valid `{type:"json_schema", json_schema:{name:"parse_task", strict:true, schema}}` even with **zod v4** (the v3/v4 compat concern did not materialize). STATE.md blocker "confirm exact SDK syntax" is now resolved.

## Tests

- schema: 4 · parse: 6 · parseAndResolve: 3 · live: 1 (skipped offline).
- Full project suite: **82 passing, 1 skipped** (the live test), `tsc --noEmit` clean.
- DI/secret hygiene grep clean; schema-wiring grep ≥ 1 (3 matches).

## Critical Correctness Notes

- **Pitfall 4:** the LLM emits only raw strings; `parseTask` re-validates shape and never returns an unvalidated object; resolution to real IDs stays in the deterministic resolver. The `parseAndResolve` "hallucinated client/assignee" test proves unresolved values surface as null / `unresolvedAssignees` rather than invented IDs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OpenAILike real-client structural compatibility**
- **Found during:** Task 3 (typecheck of the live test, which passes the real `OpenAI` client into `parseTask`).
- **Issue:** The real `OpenAI.chat.completions.parse` is generic over the exact `response_format`; a narrowly-typed `OpenAILike` body made the real client non-assignable to `OpenAILike` (would also break the plan-3 production caller, not just the test).
- **Fix:** Loosened the `OpenAILike.parse` body param so both the real client and lightweight mocks satisfy it, and introduced a typed `ParseRequestBody` used at the construction site in `parse.ts` to preserve call-shape safety.
- **Files modified:** src/llm/openai.ts, src/llm/parse.ts
- **Commit:** af66c93

**2. [Rule 2 - Hygiene] createOpenAIClient requires injected env**
- **Found during:** Task 2 DI-hygiene verification.
- **Issue:** A `process.env` default-arg fallback (copied from the createRedis convenience) tripped the plan's no-ambient-read hygiene check.
- **Fix:** Made the `env` argument required; the caller (plan 03 / phase 3) always passes `loadEnv()`.
- **Files modified:** src/llm/openai.ts
- **Commit:** f88c94d

## TDD Gate Compliance

Schema/parse landed as a `test(...)` commit (schema contract) followed by `feat(...)` (parser impl); the live smoke + compat fix landed as `test(...)`. RED was observed for the resolver plan (02-02) per-cycle; for this plan the schema/parser source and tests were authored together and committed test-then-feat to preserve gate ordering.

## Self-Check: PASSED

- All 8 files under src/llm/ + src/parseAndResolve.ts exist.
- Commits acd114a, f88c94d, af66c93 present.

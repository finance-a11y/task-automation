import type { FetchLike } from "./types.js";

/**
 * Typed exhaustion error thrown when a retryable ClickUp response (429 / 5xx)
 * persists past `maxAttempts`. Carries the final HTTP `status` so the caller
 * (HARD-01) can render it in the user-facing Spanish message — e.g.
 * `No pude crear la tarea en ClickUp (429)`. It is a real `Error` subclass so
 * `instanceof Error` and `instanceof ClickUpRetryError` both hold.
 */
export class ClickUpRetryError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`ClickUp request failed after retries — status ${status}`);
    this.name = "ClickUpRetryError";
    this.status = status;
  }
}

export type RetryingFetchOpts = {
  /** Injected delay (real `setTimeout` in prod, a recorder in tests). */
  sleep: (ms: number) => Promise<void>;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Base for exponential backoff `base * 2^n` and the jitter span (default 1000ms). */
  baseDelayMs?: number;
  /** Injected RNG for jitter (default Math.random) — fixed in tests for exactness. */
  random?: () => number;
};

/** Read a `Retry-After` header (seconds) defensively — the minimal FetchLike has none. */
function retryAfterMs(res: unknown): number | null {
  const headers = (res as { headers?: { get?(name: string): string | null } })
    .headers;
  const raw = headers?.get?.("Retry-After");
  if (raw == null) return null;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isNaN(seconds) || seconds < 0) return null;
  return seconds * 1000;
}

/** Exponential backoff `base * 2^attempt` plus `random() * base` jitter. */
function backoffMs(attempt: number, base: number, random: () => number): number {
  return base * 2 ** attempt + random() * base;
}

/**
 * Wrap an injected `FetchLike` with bounded retry for ClickUp rate limits and
 * transient server errors (HARD-02). A response with status 429 or >= 500 is
 * retryable: on a non-final attempt the wrapper waits — honoring `Retry-After`
 * (seconds) when present, else exponential backoff + jitter — then retries. On
 * the final attempt with a still-retryable status it throws `ClickUpRetryError`
 * carrying that status. A rejected underlying fetch (network error) is retried
 * up to the cap, then the original error is rethrown. All other responses
 * (2xx and non-429 4xx) are returned unchanged. The `sleep`/`random` are
 * injected so backoff is fully deterministic and instant under test — no new
 * dependencies, just the already-injected fetch.
 */
export function createRetryingFetch(
  fetch: FetchLike,
  opts: RetryingFetchOpts,
): FetchLike {
  const {
    sleep,
    maxAttempts = 3,
    baseDelayMs = 1000,
    random = Math.random,
  } = opts;

  return async (input, init) => {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const isFinal = attempt === maxAttempts - 1;

      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await fetch(input, init);
      } catch (err) {
        // Network-level rejection: retry up to the cap, then rethrow the last.
        lastError = err;
        if (isFinal) throw err;
        await sleep(backoffMs(attempt, baseDelayMs, random));
        continue;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) return res; // 2xx and non-429 4xx pass straight through.

      if (isFinal) throw new ClickUpRetryError(res.status);

      const delay = retryAfterMs(res) ?? backoffMs(attempt, baseDelayMs, random);
      await sleep(delay);
    }

    // Unreachable: the loop either returns, sleeps+continues, or throws above.
    throw lastError ?? new ClickUpRetryError(0);
  };
}

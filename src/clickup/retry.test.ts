import { describe, it, expect, vi } from "vitest";
import { createRetryingFetch, ClickUpRetryError } from "./retry.js";
import type { FetchLike } from "./types.js";

type FakeRes = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
};

/** Build a FetchLike-shaped fake response, optionally with a headers.get view. */
function res(
  status: number,
  body: unknown = { id: "t1", url: "u1" },
  headers?: Record<string, string>,
): FakeRes {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: headers
      ? {
          get: (name: string) =>
            headers[name] ?? headers[name.toLowerCase()] ?? null,
        }
      : undefined,
  };
}

/** A vi.fn fetch returning queued responses (or throwing queued Errors). */
function queuedFetch(items: (FakeRes | Error)[]) {
  const q = [...items];
  return vi.fn(async (_input: string, _init?: unknown) => {
    const next = q.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("fetch queue exhausted");
    return next;
  });
}

/** A fake sleep that records every delay it is asked to wait, instantly. */
function fakeSleep() {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { sleep, delays };
}

describe("createRetryingFetch", () => {
  it("retries a 429 once and returns the subsequent 200; sleep called exactly once", async () => {
    const fetch = queuedFetch([res(429, {}), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    const out = await wrapped("https://api/x");
    expect(out.status).toBe(200);
    expect(out.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(delays).toHaveLength(1);
  });

  it("honors a Retry-After header (seconds → ms) for the backoff delay", async () => {
    const fetch = queuedFetch([res(429, {}, { "Retry-After": "2" }), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    await wrapped("https://api/x");
    expect(delays).toEqual([2000]);
  });

  it("uses exponential backoff base*2^n when no Retry-After header is present", async () => {
    const fetch = queuedFetch([res(429), res(429), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      baseDelayMs: 1000,
      random: () => 0, // no jitter
    });

    const out = await wrapped("https://api/x");
    expect(out.status).toBe(200);
    expect(delays).toEqual([1000, 2000]);
  });

  it("adds jitter driven by the injected random (random()*baseDelayMs)", async () => {
    const fetch = queuedFetch([res(429), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      baseDelayMs: 1000,
      random: () => 0.5, // fixed jitter → exact, asserted
    });

    await wrapped("https://api/x");
    expect(delays).toEqual([1000 + 500]);
  });

  it("retries a 5xx (503) the same way", async () => {
    const fetch = queuedFetch([res(503), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    const out = await wrapped("https://api/x");
    expect(out.status).toBe(200);
    expect(delays).toHaveLength(1);
  });

  it("does NOT retry a non-429 4xx (400) — returns it immediately", async () => {
    const fetch = queuedFetch([res(400)]);
    const { sleep } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    const out = await wrapped("https://api/x");
    expect(out.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a rejected underlying fetch and can then succeed", async () => {
    const fetch = queuedFetch([new Error("ECONNRESET"), res(200)]);
    const { sleep, delays } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    const out = await wrapped("https://api/x");
    expect(out.status).toBe(200);
    expect(delays).toHaveLength(1);
  });

  it("rethrows the last error after network rejects exhaust the cap", async () => {
    const fetch = queuedFetch([
      new Error("net1"),
      new Error("net2"),
      new Error("net3"),
    ]);
    const { sleep } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      maxAttempts: 3,
      random: () => 0,
    });

    await expect(wrapped("https://api/x")).rejects.toThrow("net3");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("throws a typed ClickUpRetryError carrying the final status on exhaustion", async () => {
    const fetch = queuedFetch([res(429), res(429), res(429)]);
    const { sleep } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      maxAttempts: 3,
      random: () => 0,
    });

    const err = await wrapped("https://api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ClickUpRetryError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ClickUpRetryError).status).toBe(429);
  });

  it("never calls sleep more than maxAttempts-1 times", async () => {
    const fetch = queuedFetch([res(429), res(429), res(429)]);
    const { sleep } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      maxAttempts: 3,
      random: () => 0,
    });

    await wrapped("https://api/x").catch(() => undefined);
    expect(sleep.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("passes a successful response through unchanged (ok/status/json/text)", async () => {
    const fetch = queuedFetch([res(200, { id: "abc", url: "uuu" })]);
    const { sleep } = fakeSleep();
    const wrapped = createRetryingFetch(fetch as unknown as FetchLike, {
      sleep,
      random: () => 0,
    });

    const out = await wrapped("https://api/x");
    expect(out.ok).toBe(true);
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ id: "abc", url: "uuu" });
    expect(sleep).not.toHaveBeenCalled();
  });
});

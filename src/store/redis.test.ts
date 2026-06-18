import { describe, it, expect, vi } from "vitest";
import { markEventOnce, createRedis, type RedisLike } from "./redis.js";

function fakeRedis(setImpl: RedisLike["set"]): RedisLike {
  return { set: setImpl };
}

describe("markEventOnce", () => {
  it("returns true when set(...) resolves OK (key was new)", async () => {
    const redis = fakeRedis(vi.fn().mockResolvedValue("OK"));
    await expect(markEventOnce(redis, "E1")).resolves.toBe(true);
  });

  it("returns false when set(...) resolves null (key already existed → retry)", async () => {
    const redis = fakeRedis(vi.fn().mockResolvedValue(null));
    await expect(markEventOnce(redis, "E1")).resolves.toBe(false);
  });

  it("calls set with namespaced key, value 1, and { nx: true, ex: 600 } default", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    await markEventOnce(fakeRedis(set), "abc");
    expect(set).toHaveBeenCalledWith("evt:abc", 1, { nx: true, ex: 600 });
  });

  it("honors a custom ttl", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    await markEventOnce(fakeRedis(set), "abc", 30);
    expect(set).toHaveBeenCalledWith("evt:abc", 1, { nx: true, ex: 30 });
  });

  it("is idempotent across a retry: true then false for the same event_id", async () => {
    const store = new Set<string>();
    const redis = fakeRedis(async (key) => {
      if (store.has(key)) return null;
      store.add(key);
      return "OK";
    });
    expect(await markEventOnce(redis, "dup")).toBe(true);
    expect(await markEventOnce(redis, "dup")).toBe(false);
  });
});

describe("createRedis", () => {
  it("throws clearly when URL or token is absent", () => {
    expect(() =>
      createRedis({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" }),
    ).toThrow(/UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN/);
  });

  it("builds a client with set(...) when given url + token", () => {
    const client = createRedis({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token-abc",
    });
    expect(typeof client.set).toBe("function");
  });
});

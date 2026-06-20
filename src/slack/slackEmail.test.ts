import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveSlackMentionsToMembers,
  extractSlackMentionIds,
  type SlackUserInfoClient,
} from "./slackEmail.js";
import type { MembersConfig } from "../config/provider.js";
import type { RedisLike } from "../store/redis.js";

function memRedis(): RedisLike & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async set(key, value, opts) {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async getdel(key) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      store.delete(key);
      return v;
    },
    async del(...keys) {
      let removed = 0;
      for (const k of keys) if (store.delete(k)) removed += 1;
      return removed;
    },
  };
}

const membersConfig: MembersConfig = {
  byName: {},
  aliases: {},
  byEmail: { "vero@arianna.com": 111, "juan@arianna.com": 222 },
};

/** A Slack stub whose users.info returns the given email (or throws). */
function slackStub(
  emailByUser: Record<string, string | null>,
  opts: { throwScope?: string[] } = {},
): SlackUserInfoClient & { info: ReturnType<typeof vi.fn> } {
  const info = vi.fn(async ({ user }: { user: string }) => {
    if (opts.throwScope?.includes(user)) {
      const e = new Error("missing_scope") as Error & { data: { error: string } };
      e.data = { error: "missing_scope" };
      throw e;
    }
    return { user: { profile: { email: emailByUser[user] ?? null } } };
  });
  return { users: { info }, info };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractSlackMentionIds", () => {
  it("pulls ids from <@U123> and <@U123|name> tokens, deduped, ignoring noise", () => {
    const text = "hola <@U111> y <@U222|juan> revisen, cc <@U111> y email a@b.com";
    expect(extractSlackMentionIds(text)).toEqual(["U111", "U222"]);
  });

  it("returns [] when there are no mentions", () => {
    expect(extractSlackMentionIds("sin menciones aqui")).toEqual([]);
    expect(extractSlackMentionIds("")).toEqual([]);
  });
});

describe("resolveSlackMentionsToMembers", () => {
  it("matches email → member id and caches the result", async () => {
    const redis = memRedis();
    const slack = slackStub({ U111: "vero@arianna.com" });
    const out = await resolveSlackMentionsToMembers(["U111"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: {},
    });
    expect(out).toEqual({ U111: 111 });
    expect(redis.store.get("cfg:slackmap:U111")).toBe(111);
  });

  it("cache HIT skips the users.info call", async () => {
    const redis = memRedis();
    redis.store.set("cfg:slackmap:U111", 111);
    const slack = slackStub({ U111: "vero@arianna.com" });
    const out = await resolveSlackMentionsToMembers(["U111"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: {},
    });
    expect(out).toEqual({ U111: 111 });
    expect(slack.info).not.toHaveBeenCalled();
  });

  it("missing_scope error → uses static overlay if present, else omits; never throws", async () => {
    const redis = memRedis();
    const slack = slackStub({}, { throwScope: ["U111", "U999"] });
    const out = await resolveSlackMentionsToMembers(["U111", "U999"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: { U111: 555 },
    });
    expect(out).toEqual({ U111: 555 }); // U999 omitted
  });

  it("email not in byEmail → falls back to static overlay, else omitted", async () => {
    const redis = memRedis();
    const slack = slackStub({ U111: "unknown@x.com", U222: "also@x.com" });
    const out = await resolveSlackMentionsToMembers(["U111", "U222"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: { U111: 333 },
    });
    expect(out).toEqual({ U111: 333 }); // U222 omitted (no email match, no overlay)
  });

  it("dedups the same id requested twice (resolves once)", async () => {
    const redis = memRedis();
    const slack = slackStub({ U111: "vero@arianna.com" });
    await resolveSlackMentionsToMembers(["U111", "U111"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: {},
    });
    expect(slack.info).toHaveBeenCalledTimes(1);
  });

  it("a Redis read failure degrades to the live lookup, never throws", async () => {
    const redis: RedisLike = {
      get: vi.fn(async () => {
        throw new Error("redis down");
      }),
      set: vi.fn(async () => "OK"),
      getdel: vi.fn(),
      del: vi.fn(),
    };
    const slack = slackStub({ U111: "vero@arianna.com" });
    const out = await resolveSlackMentionsToMembers(["U111"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: {},
    });
    expect(out).toEqual({ U111: 111 });
  });

  it("matches email case-insensitively", async () => {
    const redis = memRedis();
    const slack = slackStub({ U111: "VERO@Arianna.com" });
    const out = await resolveSlackMentionsToMembers(["U111"], {
      slack,
      membersConfig,
      redis,
      staticOverlay: {},
    });
    expect(out).toEqual({ U111: 111 });
  });
});

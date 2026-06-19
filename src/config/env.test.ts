import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

const valid = (): Record<string, string | undefined> => ({
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_SIGNING_SECRET: "signing-secret",
  SLACK_TASK_CHANNEL_ID: "C123",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token-abc",
  TEAM_TIMEZONE: "America/Caracas",
  OPENAI_API_KEY: "sk-test",
});

describe("loadEnv", () => {
  it("returns a fully typed Env when all required vars are present", () => {
    const env = loadEnv(valid());
    expect(env.SLACK_BOT_TOKEN).toBe("xoxb-test");
    expect(env.SLACK_SIGNING_SECRET).toBe("signing-secret");
    expect(env.SLACK_TASK_CHANNEL_ID).toBe("C123");
    expect(env.UPSTASH_REDIS_REST_URL).toBe("https://example.upstash.io");
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token-abc");
    expect(env.TEAM_TIMEZONE).toBe("America/Caracas");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
  });

  it("defaults OPENAI_MODEL to gpt-4o-mini when absent", () => {
    const src = valid();
    delete src.OPENAI_MODEL;
    expect(loadEnv(src).OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("respects an explicit OPENAI_MODEL override", () => {
    const src = valid();
    src.OPENAI_MODEL = "gpt-4.1-mini";
    expect(loadEnv(src).OPENAI_MODEL).toBe("gpt-4.1-mini");
  });

  it("throws an Error naming OPENAI_API_KEY when it is absent", () => {
    const src = valid();
    delete src.OPENAI_API_KEY;
    expect(() => loadEnv(src)).toThrow(/OPENAI_API_KEY/);
  });

  it("throws an Error naming the missing key when a required var is absent", () => {
    const src = valid();
    delete src.SLACK_SIGNING_SECRET;
    expect(() => loadEnv(src)).toThrow(/SLACK_SIGNING_SECRET/);
  });

  it("treats an empty-string required var as missing and throws naming it", () => {
    const src = valid();
    src.UPSTASH_REDIS_REST_TOKEN = "";
    expect(() => loadEnv(src)).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });

  it("rejects a malformed UPSTASH_REDIS_REST_URL (not a url) naming the key", () => {
    const src = valid();
    src.UPSTASH_REDIS_REST_URL = "not-a-url";
    expect(() => loadEnv(src)).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it("defaults TEAM_TIMEZONE to America/Caracas when absent", () => {
    const src = valid();
    delete src.TEAM_TIMEZONE;
    expect(loadEnv(src).TEAM_TIMEZONE).toBe("America/Caracas");
  });

  it("does NOT default required vars (only TEAM_TIMEZONE has a default)", () => {
    const src = valid();
    delete src.SLACK_BOT_TOKEN;
    delete src.SLACK_TASK_CHANNEL_ID;
    expect(() => loadEnv(src)).toThrow(/SLACK_BOT_TOKEN|SLACK_TASK_CHANNEL_ID/);
  });
});

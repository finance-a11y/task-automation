import { WebClient } from "@slack/web-api";
import crypto from "node:crypto";
import { loadEnv } from "../../src/config/env.js";
import { createRedis } from "../../src/store/redis.js";

/**
 * Diagnostic + self-join endpoint (internal ops, NOT part of the bot flow).
 *
 *   GET /api/slack/diag?secret=<SLACK_SIGNING_SECRET>
 *     → bot identity + the channels it is a member of + whether it is in the
 *       configured SLACK_TASK_CHANNEL_ID.
 *   GET /api/slack/diag?secret=<...>&join=<CHANNEL_ID>
 *     → makes the bot join that channel itself (needs the channels:join scope),
 *       then returns the report.
 *
 * Gated by the Slack signing secret in the query (timing-safe) so it is not
 * world-callable. Each Slack call is wrapped so a missing-scope error is
 * reported (telling you exactly which scope to add) instead of failing the page.
 *
 * Required bot scopes for full output: channels:read (list/membership),
 * channels:join (self-join). auth.test works with any valid bot token.
 */
const env = loadEnv();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function slackError(e: unknown): string {
  const data = (e as { data?: { error?: string } })?.data;
  if (data?.error) return data.error;
  return e instanceof Error ? e.message : String(e);
}

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  if (!safeEqual(secret, env.SLACK_SIGNING_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  const web = new WebClient(env.SLACK_BOT_TOKEN);
  const report: Record<string, unknown> = {
    expectedTaskChannel: env.SLACK_TASK_CHANNEL_ID,
  };

  // Redis (Upstash) connectivity probe — the #1 runtime failure ("fetch failed"
  // means the REST URL is wrong, e.g. a rediss:// URL instead of the https one).
  try {
    const u = new URL(env.UPSTASH_REDIS_REST_URL);
    report.redisUrlScheme = u.protocol; // must be "https:"
    report.redisUrlHost = u.host; // e.g. xxxx.upstash.io (no token shown)
  } catch {
    report.redisUrlScheme = "INVALID URL — check UPSTASH_REDIS_REST_URL";
  }
  try {
    const redis = createRedis(env);
    await redis.set("diag:ping", "1", { ex: 30 });
    const v = await redis.get("diag:ping");
    report.redisOk = v === "1" || v === 1;
  } catch (e) {
    report.redisError = e instanceof Error ? e.message : String(e);
  }

  try {
    const auth = await web.auth.test();
    report.botUserId = auth.user_id;
    report.botName = auth.user;
    report.team = auth.team;
  } catch (e) {
    report.authError = slackError(e);
  }

  const join = url.searchParams.get("join");
  if (join) {
    try {
      const r = await web.conversations.join({ channel: join });
      report.joinResult = r.ok ? `joined ${join}` : (r.error ?? "unknown");
    } catch (e) {
      report.joinError = slackError(e); // e.g. "missing_scope" → add channels:join
    }
  }

  try {
    const convos = await web.users.conversations({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    });
    const chans = (convos.channels ?? []).map((c) => ({ id: c.id, name: c.name }));
    report.inChannels = chans;
    report.taskChannelJoined = chans.some((c) => c.id === env.SLACK_TASK_CHANNEL_ID);
  } catch (e) {
    report.listError = slackError(e); // e.g. "missing_scope" → add channels:read
  }

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

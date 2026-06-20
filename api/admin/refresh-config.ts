import crypto from "node:crypto";
import { loadEnv } from "../../src/config/env.js";
import { createRedis } from "../../src/store/redis.js";

/**
 * Manual dynamic-config cache refresh (DYN-06).
 *
 *   GET /api/admin/refresh-config?secret=<SLACK_SIGNING_SECRET>
 *     → deletes the hot cfg:* TTL cache keys (cfg:clientes, cfg:members,
 *       cfg:slackmap:*) so the next parse re-fetches live config from ClickUp.
 *       The cfg:*:lastgood keys are LEFT intact (the DYN-05 safety net), exactly
 *       like clearConfigCache in src/store/redis.ts.
 *
 * Gated by the Slack signing secret in the query (timing-safe), reusing the
 * exact safeEqual pattern from api/slack/diag.ts so it is not world-callable.
 * (Phase 8 will harden/gate this and diag further.) The secret is never logged.
 */
const env = loadEnv();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  if (!safeEqual(secret, env.SLACK_SIGNING_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  const redis = createRedis(env);

  // List every dynamic-config key, then keep only the hot TTL keys (drop the
  // :lastgood safety-net copies). Guard the empty-list case so del() isn't
  // called with no args.
  const allKeys = (await redis.keys("cfg:*")) as string[];
  const toClear = allKeys.filter((k) => !k.endsWith(":lastgood"));

  if (toClear.length > 0) {
    await redis.del(...toClear);
  }

  return new Response(JSON.stringify({ cleared: toClear }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

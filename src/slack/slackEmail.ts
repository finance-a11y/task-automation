/**
 * Email-based Slack → ClickUp member resolution (DYN-04).
 *
 * For each @-mentioned Slack user id we resolve a ClickUp member id by matching
 * the Slack profile email (via users.info) against the live members' byEmail
 * map. Resolved ids are cached under cfg:slackmap:<id> with a long TTL (emails
 * rarely change). Resolution degrades gracefully (DYN-05): if the new
 * `users:read.email` scope is missing, the email is absent, or the email isn't
 * in byEmail, we fall back to the static SLACK_TO_MEMBER overlay; if that also
 * misses, the id is simply omitted (the name/alias tier in resolveAssignees
 * still works). NEVER throws — a Slack or Redis failure for one id is logged and
 * skipped so the capture flow is never blocked.
 */
import { SLACK_TO_MEMBER } from "../config/members.js";
import type { MembersConfig } from "../config/provider.js";
import type { RedisLike } from "../store/redis.js";

/** Slack-map cache TTL: 24h. Emails rarely change, so cache aggressively. */
export const SLACKMAP_TTL_SECONDS = 86400;

const SLACKMAP_PREFIX = "cfg:slackmap:";

/**
 * Minimal structural slice of the Slack WebClient we need. The real Bolt
 * WebClient satisfies this; tests inject a stub.
 */
export type SlackUserInfoClient = {
  users: {
    info(args: { user: string }): Promise<{
      user?: { profile?: { email?: string | null } | null } | null;
    }>;
  };
};

export type ResolveSlackMentionsDeps = {
  slack: SlackUserInfoClient;
  membersConfig: MembersConfig;
  redis: RedisLike;
  /** Static Slack-id → member-id overlay fallback (defaults to SLACK_TO_MEMBER). */
  staticOverlay?: Record<string, number>;
};

/**
 * Pull Slack user ids from `<@U123>` / `<@U123|name>` mention tokens in raw text.
 * Mirrors the mention-regex shape used by resolveAssignees. Deduped, order-stable.
 */
export function extractSlackMentionIds(text: string): string[] {
  if (!text) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Is this a Slack "missing_scope" error (users:read.email not granted)? */
function isMissingScope(e: unknown): boolean {
  return (e as { data?: { error?: string } })?.data?.error === "missing_scope";
}

/**
 * Resolve a deduped set of Slack user ids to ClickUp member ids. Returns a
 * partial `{ [slackUserId]: memberId }` map — unresolved ids are omitted. Never
 * throws.
 */
export async function resolveSlackMentionsToMembers(
  slackUserIds: string[],
  deps: ResolveSlackMentionsDeps,
): Promise<Record<string, number>> {
  const overlay = deps.staticOverlay ?? SLACK_TO_MEMBER;
  const out: Record<string, number> = {};

  // Dedup so the same id is resolved once.
  const ids = Array.from(new Set(slackUserIds));

  for (const id of ids) {
    // 1) cfg:slackmap:<id> cache hit → use it, skip users.info entirely.
    try {
      const cached = await deps.redis.get(`${SLACKMAP_PREFIX}${id}`);
      const cachedId =
        typeof cached === "number"
          ? cached
          : typeof cached === "string" && cached.length > 0
            ? Number(cached)
            : NaN;
      if (Number.isFinite(cachedId)) {
        out[id] = cachedId;
        continue;
      }
    } catch (err) {
      console.error(
        `[slackEmail] cache read failed for ${id} — continuing to live lookup:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // 2) users.info → email → byEmail match.
    let memberId: number | undefined;
    try {
      const info = await deps.slack.users.info({ user: id });
      const email = info?.user?.profile?.email;
      if (typeof email === "string" && email.length > 0) {
        const hit = deps.membersConfig.byEmail[email.toLowerCase()];
        if (typeof hit === "number") memberId = hit;
      }
    } catch (err) {
      if (isMissingScope(err)) {
        console.error(
          `[slackEmail] users.info missing_scope (add users:read.email) — degrading to static overlay for ${id}`,
        );
      } else {
        console.error(
          `[slackEmail] users.info failed for ${id} — degrading to static overlay:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // 3) Static overlay fallback when email resolution missed.
    if (memberId === undefined && Object.hasOwn(overlay, id)) {
      const fallback = overlay[id];
      if (typeof fallback === "number") memberId = fallback;
    }

    if (memberId === undefined) continue; // omit — name/alias tier still works

    out[id] = memberId;

    // Cache the resolved id (best-effort; a Redis failure must not break resolution).
    try {
      await deps.redis.set(`${SLACKMAP_PREFIX}${id}`, memberId, {
        ex: SLACKMAP_TTL_SECONDS,
      });
    } catch (err) {
      console.error(
        `[slackEmail] cache write failed for ${id} (continuing):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return out;
}

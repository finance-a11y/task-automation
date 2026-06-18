import { isProcessableMessage, type IncomingMessage } from "./filter.js";
import { markEventOnce, type RedisLike } from "../store/redis.js";
import type { Env } from "../config/env.js";

/** The Phase 1 in-thread receipt — an intentional placeholder later phases replace. */
export const RECEIPT_TEXT = "👀 Recibido — procesando…";

/** Minimal structural type for the bit of the Slack Web client we use. */
export type SlackClientLike = {
  chat: {
    postMessage(args: {
      channel: string;
      thread_ts?: string;
      text: string;
    }): Promise<unknown>;
  };
};

export type ProcessDeps = {
  redis: RedisLike;
  client: SlackClientLike;
  env: Pick<Env, "SLACK_TASK_CHANNEL_ID">;
  botUserId?: string;
};

export type ProcessEvent = {
  eventId: string;
  message: IncomingMessage;
};

/**
 * Core ingress side-effect: dedup on event_id → filter → post in-thread receipt.
 *
 * Ordering matters (INGEST-03/04, Pitfalls 1 & 3):
 *  1. markEventOnce — drop Slack retries before doing anything observable.
 *  2. isProcessableMessage — ignore other channels/bots/own/non-root messages.
 *  3. chat.postMessage — receipt in the message's own thread.
 *
 * Never throws into the ack path: all work is wrapped so a downstream failure is
 * logged (without secrets) but the function still resolves.
 */
export async function processMessageEvent(
  deps: ProcessDeps,
  event: ProcessEvent,
): Promise<void> {
  try {
    if (!event.eventId) return;

    const first = await markEventOnce(deps.redis, event.eventId);
    if (!first) return; // duplicate / Slack retry — already handled

    const { message } = event;
    if (
      !isProcessableMessage(message, {
        taskChannelId: deps.env.SLACK_TASK_CHANNEL_ID,
        botUserId: deps.botUserId,
      })
    ) {
      return;
    }

    const channel = message.channel;
    if (!channel) return;

    await deps.client.chat.postMessage({
      channel,
      thread_ts: message.thread_ts ?? message.ts,
      text: RECEIPT_TEXT,
    });
  } catch (err) {
    console.error(
      "[slack] processMessageEvent failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

import {
  claimPending,
  deletePending,
  getPending,
  putPending,
  mapTaskToThread,
  type RedisLike,
} from "../store/redis.js";
import {
  buildPreviewBlocks,
  buildConfirmedBlocks,
  buildCanceledBlocks,
  type Block,
} from "./blocks.js";
import {
  buildEditModal,
  parseEditSubmission,
  type EditModalView,
} from "./modal.js";
import type { ClickUpClient } from "../clickup/client.js";

/**
 * Structural Slack client for the interaction handlers — only the methods we
 * call. Injected so the handlers are fully offline-testable.
 */
export type SlackInteractionClient = {
  chat: {
    update(args: {
      channel: string;
      ts: string;
      text: string;
      blocks?: Block[];
    }): Promise<unknown>;
    postMessage(args: {
      channel: string;
      thread_ts?: string;
      text: string;
      blocks?: Block[];
    }): Promise<unknown>;
  };
  views: {
    open(args: { trigger_id: string; view: EditModalView }): Promise<unknown>;
  };
};

export type InteractionDeps = {
  redis: RedisLike;
  clickup: ClickUpClient;
  slack: SlackInteractionClient;
  timezone: string;
};

export type ActionRef = {
  pendingId: string;
  channel: string;
  messageTs: string;
};

/**
 * Confirmar: idempotently create the ClickUp task and finalize the preview.
 *
 * claimPending (GETDEL) is the idempotency guard — the first click claims the
 * pending and creates exactly one task; a double-click / Slack redelivery gets
 * null and is a no-op (CREATE-01). On success: write the task↔thread map
 * (CREATE-04), update the preview message to the confirmed state (CONFIRM-05),
 * and post the task link back into the thread (CREATE-03).
 *
 * If createTask throws AFTER the claim, the pending is re-put so the human can
 * retry, and nothing destructive is updated (minimal recovery; full error UX is
 * Phase 5).
 */
export async function handleConfirm(
  deps: InteractionDeps,
  ref: ActionRef,
): Promise<void> {
  const pending = await claimPending(deps.redis, ref.pendingId);
  if (!pending) return; // already claimed (double-click) → exactly-once

  const { resolved } = pending;
  try {
    const result = await deps.clickup.createTask({
      name: resolved.title,
      description: resolved.description,
      assigneeIds: resolved.assigneeIds,
      startDateMs: resolved.startDateMs,
      dueDateMs: resolved.dueDateMs,
      clienteOptionId: resolved.clienteOptionId,
      link: resolved.links[0] ?? null,
    });

    await mapTaskToThread(deps.redis, result.id, {
      channel: pending.channel,
      thread_ts: pending.threadTs,
    });

    await deps.slack.chat.update({
      channel: ref.channel,
      ts: ref.messageTs,
      text: "✅ Tarea creada",
      blocks: buildConfirmedBlocks(result.url),
    });

    await deps.slack.chat.postMessage({
      channel: pending.channel,
      thread_ts: pending.threadTs,
      text: `✅ Tarea creada: ${result.url}`,
    });
  } catch (err) {
    // Create failed after the claim — re-arm the pending so the human can retry.
    console.error(
      "[slack] handleConfirm createTask failed (pending restored):",
      err instanceof Error ? err.message : String(err),
    );
    await putPending(deps.redis, ref.pendingId, pending);
  }
}

/**
 * Cancelar: discard the pending and update the preview to the canceled state,
 * removing the buttons (CONFIRM-05).
 */
export async function handleCancel(
  deps: InteractionDeps,
  ref: ActionRef,
): Promise<void> {
  await deletePending(deps.redis, ref.pendingId);
  await deps.slack.chat.update({
    channel: ref.channel,
    ts: ref.messageTs,
    text: "❌ Cancelado",
    blocks: buildCanceledBlocks(),
  });
}

/**
 * Editar (open): load the pending and open a prefilled modal within Slack's ~3s
 * trigger window (CONFIRM-04). If the pending expired, no-op (the human re-sends
 * the message — low impact within the 1h TTL).
 */
export async function handleEditOpen(
  deps: InteractionDeps,
  ref: ActionRef & { triggerId: string },
): Promise<void> {
  const pending = await getPending(deps.redis, ref.pendingId);
  if (!pending) return; // expired — nothing to edit

  await deps.slack.views.open({
    trigger_id: ref.triggerId,
    view: buildEditModal(pending.resolved, {
      pendingId: ref.pendingId,
      channel: ref.channel,
      messageTs: ref.messageTs,
      timezone: deps.timezone,
    }),
  });
}

/**
 * Editar (submit): merge the parsed patch over the stored ResolvedTask, persist
 * the corrected pending, and re-render the threaded preview so it reflects the
 * fixes (still showing Confirmar/Editar/Cancelar). No-op if the pending expired
 * between open and submit.
 */
export async function handleEditSubmit(
  deps: InteractionDeps,
  view: Parameters<typeof parseEditSubmission>[0],
): Promise<void> {
  const { meta, patch } = parseEditSubmission(view, { timezone: deps.timezone });

  const pending = await getPending(deps.redis, meta.pendingId);
  if (!pending) return; // expired between open and submit

  const updatedResolved = { ...pending.resolved, ...patch };
  await putPending(deps.redis, meta.pendingId, {
    ...pending,
    resolved: updatedResolved,
  });

  await deps.slack.chat.update({
    channel: meta.channel,
    ts: meta.messageTs,
    text: "🆕 Nueva tarea — revisá el preview",
    blocks: buildPreviewBlocks(meta.pendingId, updatedResolved, {
      timezone: deps.timezone,
    }),
  });
}

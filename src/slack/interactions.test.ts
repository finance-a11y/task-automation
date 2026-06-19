import { describe, it, expect, vi } from "vitest";
import {
  handleConfirm,
  handleCancel,
  handleEditOpen,
  handleEditSubmit,
  type InteractionDeps,
} from "./interactions.js";
import {
  TITLE_BLOCK,
  TITLE_ACTION,
  DESC_BLOCK,
  DESC_ACTION,
  CLIENTE_BLOCK,
  CLIENTE_ACTION,
  ASIGNADOS_BLOCK,
  ASIGNADOS_ACTION,
  INICIO_BLOCK,
  INICIO_ACTION,
  ENTREGA_BLOCK,
  ENTREGA_ACTION,
} from "./modal.js";
import { putPending, getPending, type RedisLike, type PendingTask } from "../store/redis.js";
import type { ClickUpClient } from "../clickup/client.js";
import type { ResolvedTask } from "../resolve/types.js";

function memRedis(): RedisLike {
  const store = new Map<string, unknown>();
  return {
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
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return n;
    },
  };
}

function fakeClickup(
  result = { id: "task1", url: "https://app.clickup.com/t/task1" },
): ClickUpClient & { createTask: ReturnType<typeof vi.fn> } {
  return { createTask: vi.fn(async () => result) };
}

type UpdateArgs = { channel: string; ts: string; text: string; blocks?: unknown };
type PostArgs = { channel: string; thread_ts?: string; text: string; blocks?: unknown };
type OpenArgs = { trigger_id: string; view: Record<string, unknown> };

function fakeSlack() {
  return {
    chat: {
      update: vi.fn(async (_a: UpdateArgs) => ({ ok: true })),
      postMessage: vi.fn(async (_a: PostArgs) => ({ ok: true })),
    },
    views: {
      open: vi.fn(async (_a: OpenArgs) => ({ ok: true })),
    },
  };
}

const resolved: ResolvedTask = {
  title: "Diseñar landing",
  description: "landing de campaña",
  clienteOptionId: "63d9626f-9b80-4a19-8638-93b8042d2e9c",
  assigneeIds: [216158839, 118065209],
  unresolvedAssignees: [],
  startDateMs: 1718000000000,
  dueDateMs: 1718600000000,
  links: ["https://loom.com/x", "https://second.example"],
};

const pending: PendingTask = {
  resolved,
  channel: "C_TASK",
  messageTs: "1700000000.000100",
  threadTs: "1700000000.000100",
  rawText: "diseñar landing",
};

async function seeded() {
  const redis = memRedis();
  await putPending(redis, "PID", pending);
  const clickup = fakeClickup();
  const slack = fakeSlack();
  const deps: InteractionDeps = { redis, clickup, slack, timezone: "America/Caracas" };
  return { redis, clickup, slack, deps };
}

const ref = { pendingId: "PID", channel: "C_TASK", messageTs: "1700000000.000100" };

describe("handleConfirm", () => {
  it("creates exactly one task with epoch-ms dates, assignee ids, cliente UUID and link", async () => {
    const s = await seeded();
    await handleConfirm(s.deps, ref);

    expect(s.clickup.createTask).toHaveBeenCalledTimes(1);
    expect(s.clickup.createTask).toHaveBeenCalledWith({
      name: "Diseñar landing",
      description: "landing de campaña",
      assigneeIds: [216158839, 118065209],
      startDateMs: 1718000000000,
      dueDateMs: 1718600000000,
      clienteOptionId: "63d9626f-9b80-4a19-8638-93b8042d2e9c",
      link: "https://loom.com/x", // first link
    });
  });

  it("writes the task↔thread map, updates to confirmed blocks, and posts the link in-thread", async () => {
    const s = await seeded();
    await handleConfirm(s.deps, ref);

    // task2thread map written for the created task id.
    expect(await getThread(s.redis, "task1")).toEqual({
      channel: "C_TASK",
      thread_ts: "1700000000.000100",
    });

    expect(s.slack.chat.update).toHaveBeenCalledTimes(1);
    const upd = s.slack.chat.update.mock.calls[0]![0];
    expect(upd.channel).toBe("C_TASK");
    expect(upd.ts).toBe("1700000000.000100");
    expect(JSON.stringify(upd.blocks)).toContain("https://app.clickup.com/t/task1");

    expect(s.slack.chat.postMessage).toHaveBeenCalledTimes(1);
    const post = s.slack.chat.postMessage.mock.calls[0]![0];
    expect(post.thread_ts).toBe("1700000000.000100");
    expect(post.text).toContain("https://app.clickup.com/t/task1");
  });

  it("is exactly-once: a second confirm with the same pendingId does not create again", async () => {
    const s = await seeded();
    await handleConfirm(s.deps, ref);
    await handleConfirm(s.deps, ref);
    expect(s.clickup.createTask).toHaveBeenCalledTimes(1);
  });

  it("restores the pending if createTask throws after the claim", async () => {
    const redis = memRedis();
    await putPending(redis, "PID", pending);
    const clickup = { createTask: vi.fn(async () => { throw new Error("ClickUp 500"); }) };
    const slack = fakeSlack();
    const deps: InteractionDeps = { redis, clickup, slack, timezone: "America/Caracas" };

    await handleConfirm(deps, ref);
    // Pending is back so the human can retry.
    expect(await getPending(redis, "PID")).toEqual(pending);
    expect(slack.chat.update).not.toHaveBeenCalled();
  });
});

describe("handleCancel", () => {
  it("deletes the pending and updates the message to canceled blocks", async () => {
    const s = await seeded();
    await handleCancel(s.deps, ref);
    expect(await getPending(s.redis, "PID")).toBeNull();
    expect(s.slack.chat.update).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s.slack.chat.update.mock.calls[0]![0].blocks)).toContain("Cancelado");
  });
});

describe("handleEditOpen", () => {
  it("opens a modal whose private_metadata carries the ids when the pending exists", async () => {
    const s = await seeded();
    await handleEditOpen(s.deps, { ...ref, triggerId: "TRIG-1" });

    expect(s.slack.views.open).toHaveBeenCalledTimes(1);
    const arg = s.slack.views.open.mock.calls[0]![0];
    expect(arg.trigger_id).toBe("TRIG-1");
    const meta = JSON.parse((arg.view as { private_metadata: string }).private_metadata);
    expect(meta).toEqual({ pendingId: "PID", channel: "C_TASK", messageTs: "1700000000.000100" });
  });

  it("is a no-op when the pending has expired", async () => {
    const redis = memRedis();
    const slack = fakeSlack();
    const deps: InteractionDeps = { redis, clickup: fakeClickup(), slack, timezone: "America/Caracas" };
    await handleEditOpen(deps, { ...ref, triggerId: "TRIG-1" });
    expect(slack.views.open).not.toHaveBeenCalled();
  });
});

describe("handleEditSubmit", () => {
  function editView(over: { cliente?: string | null; entrega?: string | null }) {
    return {
      private_metadata: JSON.stringify({ pendingId: "PID", channel: "C_TASK", messageTs: "1700000000.000100" }),
      state: {
        values: {
          [TITLE_BLOCK]: { [TITLE_ACTION]: { value: "Diseñar landing" } },
          [DESC_BLOCK]: { [DESC_ACTION]: { value: "landing de campaña" } },
          [CLIENTE_BLOCK]: { [CLIENTE_ACTION]: { selected_option: over.cliente ? { value: over.cliente } : null } },
          [ASIGNADOS_BLOCK]: { [ASIGNADOS_ACTION]: { selected_options: [{ value: "216158839" }] } },
          [INICIO_BLOCK]: { [INICIO_ACTION]: { selected_date: null } },
          [ENTREGA_BLOCK]: { [ENTREGA_ACTION]: { selected_date: over.entrega ?? null } },
        },
      },
    };
  }

  it("merges the patch onto the stored pending and re-renders the preview", async () => {
    const redis = memRedis();
    // Seed a pending whose cliente is unresolved and due date is null.
    await putPending(redis, "PID", {
      ...pending,
      resolved: { ...resolved, clienteOptionId: null, dueDateMs: null },
    });
    const slack = fakeSlack();
    const deps: InteractionDeps = { redis, clickup: fakeClickup(), slack, timezone: "America/Caracas" };

    await handleEditSubmit(
      deps,
      editView({ cliente: "57123824-86d1-4fb8-a3a3-03fb1a8d8704", entrega: "2026-06-25" }),
    );

    // Pending updated with the corrected cliente + due date.
    const stored = await getPending(redis, "PID");
    expect(stored?.resolved.clienteOptionId).toBe("57123824-86d1-4fb8-a3a3-03fb1a8d8704");
    expect(stored?.resolved.dueDateMs).toBe(Date.UTC(2026, 5, 25, 4, 0, 0));

    // Preview re-rendered with the new values (Children Chic name shows).
    expect(slack.chat.update).toHaveBeenCalledTimes(1);
    const upd = slack.chat.update.mock.calls[0]![0];
    expect(upd.ts).toBe("1700000000.000100");
    expect(JSON.stringify(upd.blocks)).toContain("Children Chic");
  });

  it("is a no-op when the pending expired between open and submit", async () => {
    const redis = memRedis();
    const slack = fakeSlack();
    const deps: InteractionDeps = { redis, clickup: fakeClickup(), slack, timezone: "America/Caracas" };
    await handleEditSubmit(deps, editView({ cliente: null }));
    expect(slack.chat.update).not.toHaveBeenCalled();
  });
});

// Local helper to read the task2thread map without importing the prefix.
async function getThread(redis: RedisLike, taskId: string) {
  const v = await redis.get(`task2thread:${taskId}`);
  if (typeof v === "string") return JSON.parse(v);
  return v;
}

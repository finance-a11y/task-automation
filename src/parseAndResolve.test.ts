import { describe, it, expect, vi } from "vitest";
import { DateTime } from "luxon";
import { parseAndResolve, ParseError } from "./parseAndResolve.js";
import type { OpenAILike } from "./llm/openai.js";

const ZONE = "America/Caracas";
const FHCA = "dce8df41-786e-40f4-9427-e833daf2d6a0";
const VERO = 118065209;

function dayMs(y: number, m: number, d: number): number {
  return DateTime.fromObject({ year: y, month: m, day: d }, { zone: ZONE })
    .startOf("day")
    .toMillis();
}

// Thursday 2026-06-18 10:00 local.
const NOW = DateTime.fromObject(
  { year: 2026, month: 6, day: 18, hour: 10 },
  { zone: ZONE },
).toMillis();

function clientReturning(parsed: unknown): OpenAILike {
  return {
    chat: {
      completions: {
        parse: vi.fn(async () => ({ choices: [{ message: { parsed } }] })),
      },
    },
  };
}

describe("parseAndResolve (offline, real resolver)", () => {
  it("composes parse → resolve into a ClickUp-ready ResolvedTask", async () => {
    const client = clientReturning({
      title: "Banner FHCA",
      description: null,
      clienteRaw: "FHCA",
      assigneesRaw: ["vero"],
      startDatePhrase: null,
      dueDatePhrase: "viernes",
      links: ["https://loom.com/x"],
    });
    const r = await parseAndResolve("mensaje", NOW, {
      client,
      model: "gpt-4o-mini",
      timezone: ZONE,
    });
    expect(r.clienteOptionId).toBe(FHCA);
    expect(r.assigneeIds).toEqual([VERO]);
    expect(r.dueDateMs).toBe(dayMs(2026, 6, 19));
    expect(r.startDateMs).toBeNull();
    expect(r.links).toEqual(["https://loom.com/x"]);
  });

  it("flows unresolved values through safely (hallucinated client/assignee)", async () => {
    const client = clientReturning({
      title: "Tarea",
      description: null,
      clienteRaw: "Cliente Inventado",
      assigneesRaw: ["Fulano"],
      startDatePhrase: null,
      dueDatePhrase: null,
      links: [],
    });
    const r = await parseAndResolve("mensaje", NOW, {
      client,
      model: "gpt-4o-mini",
      timezone: ZONE,
    });
    expect(r.clienteOptionId).toBeNull();
    expect(r.assigneeIds).toEqual([]);
    expect(r.unresolvedAssignees).toEqual(["Fulano"]);
  });

  it("propagates a ParseError from a malformed model response (does not swallow)", async () => {
    const client = clientReturning({ title: 42 });
    await expect(
      parseAndResolve("mensaje", NOW, { client, model: "gpt-4o-mini", timezone: ZONE }),
    ).rejects.toBeInstanceOf(ParseError);
  });
});

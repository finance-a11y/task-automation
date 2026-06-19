import { describe, it, expect, vi } from "vitest";
import { parseTask, ParseError } from "./parse.js";
import type { OpenAILike } from "./openai.js";

const validPayload = {
  title: "Diseñar banner",
  description: null,
  clienteRaw: "FHCA",
  assigneesRaw: ["vero"],
  startDatePhrase: "hoy",
  dueDatePhrase: "viernes",
  links: [],
};

/** Build a mock OpenAILike whose parse() returns a canned message. */
function fakeClient(message: { parsed: unknown; refusal?: string | null }): {
  client: OpenAILike;
  parse: ReturnType<typeof vi.fn>;
} {
  const parse = vi.fn(async () => ({ choices: [{ message }] }));
  return { client: { chat: { completions: { parse } } }, parse };
}

describe("parseTask (offline, injected client)", () => {
  it("returns the ParsedTask and calls the client with the configured model", async () => {
    const { client, parse } = fakeClient({ parsed: validPayload });
    const result = await parseTask("haz un banner para FHCA", {
      client,
      model: "gpt-4o-mini",
    });
    expect(result).toEqual(validPayload);
    expect(parse).toHaveBeenCalledTimes(1);
    const body = parse.mock.calls[0]![0];
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("wires the strict json_schema response_format for 'parse_task'", async () => {
    const { client, parse } = fakeClient({ parsed: validPayload });
    await parseTask("x", { client, model: "gpt-4o-mini" });
    const body = parse.mock.calls[0]![0];
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "parse_task", strict: true },
    });
  });

  it("throws ParseError on a schema-violating model object (no unvalidated return)", async () => {
    const { client } = fakeClient({ parsed: { title: 123, links: "nope" } });
    await expect(
      parseTask("x", { client, model: "gpt-4o-mini" }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("throws ParseError on a null/garbage payload", async () => {
    const { client } = fakeClient({ parsed: null });
    await expect(
      parseTask("x", { client, model: "gpt-4o-mini" }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("throws ParseError on a model refusal", async () => {
    const { client } = fakeClient({ parsed: null, refusal: "no puedo" });
    await expect(
      parseTask("x", { client, model: "gpt-4o-mini" }),
    ).rejects.toThrow(/refused/i);
  });

  it("wraps an API transport error as ParseError", async () => {
    const parse = vi.fn(async () => {
      throw new Error("network down");
    });
    const client: OpenAILike = { chat: { completions: { parse } } };
    await expect(
      parseTask("x", { client, model: "gpt-4o-mini" }),
    ).rejects.toBeInstanceOf(ParseError);
  });
});

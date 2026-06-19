/**
 * Live simulation harness — runs the REAL bot modules (parseAndResolve →
 * createTask) against real OpenAI + real ClickUp, without Slack. This is the
 * "camino B" smoke test: it proves the bot's brain (LLM parse + deterministic
 * resolve) and its ClickUp create path work end-to-end before Slack is wired.
 *
 * It is GATED on real credentials so the normal offline suite never touches the
 * network or creates tasks. Run it explicitly:
 *
 *   OPENAI_API_KEY=sk-... CLICKUP_API_TOKEN=pk_... npx vitest run simulate.live
 *
 * Options (env vars):
 *   SIM_MESSAGE   override the message to parse (default: the Felipe sample).
 *   SIM_DRY=1     parse + resolve only — do NOT create the ClickUp task.
 *   CLICKUP_LIST_ID   destination list (default 901327239630 — Task-Seo Team).
 *   TEAM_TIMEZONE     date resolution zone (default America/Caracas).
 *   OPENAI_MODEL      model (default gpt-4o-mini).
 *
 * The created task is REAL and team-visible — delete it afterwards if it was
 * only a test.
 */
import { describe, it, expect } from "vitest";
import { parseAndResolve, createOpenAIClient } from "./parseAndResolve.js";
import { createClickUpClient } from "./clickup/client.js";
import type { CreateTaskParams } from "./clickup/types.js";

const hasKeys = Boolean(process.env.OPENAI_API_KEY);

const DEFAULT_MESSAGE =
  "Hola Juan, necesito para el miercoles que me envies los avances que tienes de la web de felipe. gracias";

describe.skipIf(!hasKeys)("live simulation (real OpenAI + ClickUp)", () => {
  it(
    "parses, resolves, and (unless SIM_DRY) creates the ClickUp task",
    { timeout: 60_000 },
    async () => {
      const message = process.env.SIM_MESSAGE ?? DEFAULT_MESSAGE;
      const timezone = process.env.TEAM_TIMEZONE ?? "America/Caracas";
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

      const openai = createOpenAIClient({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY as string,
      });

      // eslint-disable-next-line no-console
      console.log("\n── Mensaje ──\n" + message);

      const resolved = await parseAndResolve(message, Date.now(), {
        client: openai,
        model,
        timezone,
      });

      // eslint-disable-next-line no-console
      console.log("\n── ResolvedTask ──\n" + JSON.stringify(resolved, null, 2));
      expect(resolved.title.length).toBeGreaterThan(0);

      if (process.env.SIM_DRY === "1") {
        // eslint-disable-next-line no-console
        console.log("\nSIM_DRY=1 → no se crea la tarea (solo parse+resolve).");
        return;
      }

      const token = process.env.CLICKUP_API_TOKEN;
      if (!token) {
        // eslint-disable-next-line no-console
        console.log("\nNo CLICKUP_API_TOKEN → skip create. (Set it to create the task.)");
        return;
      }

      const clickup = createClickUpClient({
        token,
        listId: process.env.CLICKUP_LIST_ID ?? "901327239630",
        fetch: globalThis.fetch,
      });

      const params: CreateTaskParams = {
        name: resolved.title,
        description: resolved.description,
        assigneeIds: resolved.assigneeIds,
        startDateMs: resolved.startDateMs,
        dueDateMs: resolved.dueDateMs,
        clienteOptionId: resolved.clienteOptionId,
        link: resolved.links[0] ?? null,
      };

      const result = await clickup.createTask(params);
      // eslint-disable-next-line no-console
      console.log("\n── Tarea creada en ClickUp ──\n" + result.url + "\n");
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.url).toContain("clickup.com");
    },
  );
});

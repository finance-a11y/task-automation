import { parseTask } from "./llm/parse.js";
import { resolveTask } from "./resolve/index.js";
import type { OpenAILike } from "./llm/openai.js";
import type { ResolvedTask } from "./resolve/types.js";
import type { ClientesConfig, MembersConfig } from "./resolve/index.js";

export type ParseAndResolveDeps = {
  client: OpenAILike;
  model: string;
  timezone?: string;
  slackToMember?: Record<string, number>;
  /**
   * Injected live config from the provider (plan 02/03). When absent the
   * resolver defaults to the static maps, so behavior is unchanged.
   */
  clientesConfig?: ClientesConfig;
  membersConfig?: MembersConfig;
  /** Optional system-prompt override forwarded to parseTask (injectable seam). */
  systemPrompt?: string;
};

/**
 * The phase-2 public entry point: turn a free-form Spanish message into a
 * ClickUp-ready ResolvedTask by composing the LLM parser (parseTask) with the
 * deterministic resolver (resolveTask). `now` is injected for deterministic
 * date math; deps are explicit/injectable so phase 3 can build them from
 * loadEnv + createOpenAIClient. A ParseError from the parser propagates
 * unchanged (the glue never swallows it).
 */
export async function parseAndResolve(
  text: string,
  now: number,
  deps: ParseAndResolveDeps,
): Promise<ResolvedTask> {
  const parsed = await parseTask(text, {
    client: deps.client,
    model: deps.model,
    systemPrompt: deps.systemPrompt,
  });
  return resolveTask(parsed, now, {
    timezone: deps.timezone,
    slackToMember: deps.slackToMember,
    ...(deps.clientesConfig ? { clientesConfig: deps.clientesConfig } : {}),
    ...(deps.membersConfig ? { membersConfig: deps.membersConfig } : {}),
  });
}

// Phase-2 public surface re-exports.
export { parseTask, ParseError } from "./llm/parse.js";
export { createOpenAIClient, type OpenAILike } from "./llm/openai.js";
export { ParsedTaskSchema } from "./llm/schema.js";
export { resolveTask } from "./resolve/index.js";
export type { ParsedTask, ResolvedTask } from "./resolve/types.js";

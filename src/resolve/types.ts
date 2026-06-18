/**
 * Shared contract between the parser (plan 03) and the resolver (this plan).
 * `ParsedTask` is the LLM's raw extraction — deliberately human strings only
 * (no IDs, no date math). `ResolvedTask` is the deterministic, ClickUp-ready
 * result after the resolver maps those strings to real ids / epoch-ms dates.
 */

/** Raw, human-string extraction from the LLM. Validity is the resolver's job. */
export type ParsedTask = {
  title: string;
  description: string | null;
  clienteRaw: string | null;
  assigneesRaw: string[];
  startDatePhrase: string | null;
  dueDatePhrase: string | null;
  links: string[];
};

/** Deterministic, ClickUp-ready result. Unmatched values are null/empty/listed. */
export type ResolvedTask = {
  title: string;
  description: string | null;
  clienteOptionId: string | null;
  assigneeIds: number[];
  unresolvedAssignees: string[];
  startDateMs: number | null;
  dueDateMs: number | null;
  links: string[];
};

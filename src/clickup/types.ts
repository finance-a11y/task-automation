/**
 * Types and field-id constants for the ClickUp REST v2 client (Phase 3 Flow A).
 * Pure declarations — no I/O, no process.env. The Cliente field id lives in
 * src/config/clients.ts (config-as-code); the Link/Loom url field id is defined
 * here next to the client that consumes it.
 */

/**
 * Structural subset of the global `fetch` we depend on. Injecting this (rather
 * than calling global fetch directly) keeps the client fully offline-testable
 * with a mock.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * Inputs to createTask. All ClickUp-shaped already: assigneeIds are numeric
 * member ids, dates are epoch MILLISECONDS, clienteOptionId is a dropdown option
 * UUID, link is a plain url string. Nullable fields are omitted from the request
 * body when absent.
 */
export type CreateTaskParams = {
  name: string;
  description?: string | null;
  assigneeIds?: number[];
  startDateMs?: number | null;
  dueDateMs?: number | null;
  clienteOptionId?: string | null;
  link?: string | null;
};

/** The minimal slice of the ClickUp create-task response we surface. */
export type ClickUpTaskResult = {
  id: string;
  url: string;
};

/** The ClickUp custom-field id of the "Link/Loom" url field. */
export const LINK_LOOM_FIELD_ID = "5a03e7cb-0af0-4179-9f05-d0620334fc08";

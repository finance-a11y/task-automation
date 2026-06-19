import { CLIENTE_FIELD_ID } from "../config/clients.js";
import {
  LINK_LOOM_FIELD_ID,
  type ClickUpTaskResult,
  type CreateTaskParams,
  type FetchLike,
} from "./types.js";

const BASE_URL = "https://api.clickup.com/api/v2";

export type ClickUpClient = {
  createTask(params: CreateTaskParams): Promise<ClickUpTaskResult>;
};

type CreateTaskBody = {
  name: string;
  description?: string;
  assignees?: number[];
  start_date?: number;
  start_date_time?: boolean;
  due_date?: number;
  due_date_time?: boolean;
  custom_fields?: { id: string; value: string }[];
};

/**
 * Build an injectable ClickUp REST v2 client. `fetch` is injected so all callers
 * (and tests) supply their own — the client never reaches for a global. The
 * token is read once from the caller's env and used as the raw Authorization
 * header (ClickUp personal/OAuth tokens are NOT "Bearer " prefixed).
 *
 * createTask POSTs to /list/{listId}/task. Nullable fields are omitted from the
 * body entirely; dates are sent as epoch-ms integers paired with
 * *_date_time=false (the resolver emits day-granularity midnight-in-TZ ms).
 * Cliente + Link/Loom are set inline via the custom_fields array (no separate
 * field-value call). A non-2xx response throws an Error carrying the status and
 * the response body text — but never the Authorization token.
 */
export function createClickUpClient(deps: {
  token: string;
  listId: string;
  fetch: FetchLike;
}): ClickUpClient {
  const { token, listId, fetch } = deps;

  return {
    async createTask(params: CreateTaskParams): Promise<ClickUpTaskResult> {
      const body: CreateTaskBody = { name: params.name };

      if (params.description != null) body.description = params.description;
      if (params.assigneeIds && params.assigneeIds.length > 0) {
        body.assignees = params.assigneeIds;
      }
      if (params.startDateMs != null) {
        body.start_date = params.startDateMs;
        body.start_date_time = false;
      }
      if (params.dueDateMs != null) {
        body.due_date = params.dueDateMs;
        body.due_date_time = false;
      }

      const customFields: { id: string; value: string }[] = [];
      if (params.clienteOptionId != null) {
        customFields.push({ id: CLIENTE_FIELD_ID, value: params.clienteOptionId });
      }
      if (params.link != null) {
        customFields.push({ id: LINK_LOOM_FIELD_ID, value: params.link });
      }
      if (customFields.length > 0) body.custom_fields = customFields;

      const res = await fetch(`${BASE_URL}/list/${listId}/task`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Surface status + body for diagnosis; the token is never included.
        const text = await res.text().catch(() => "");
        throw new Error(
          `ClickUp createTask failed — status ${res.status}: ${text}`,
        );
      }

      const json = (await res.json()) as { id?: unknown; url?: unknown };
      if (typeof json.id !== "string" || typeof json.url !== "string") {
        throw new Error("ClickUp createTask: response missing id/url");
      }
      return { id: json.id, url: json.url };
    },
  };
}

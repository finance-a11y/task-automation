/**
 * Config-as-code: the 7 ClickUp "Cliente" dropdown options, encoded as a typed
 * name → option-UUID map plus a fuzzy-text alias table. These UUIDs are the only
 * source of truth for what the resolver writes to the Cliente custom field, so
 * they are copied verbatim from 02-CONTEXT.md and locked by unit tests (a
 * mistyped id fails the build rather than silently mis-tasking — Pitfall 6).
 *
 * Pure data only: no I/O, no process.env. The resolver (plan 02) consumes this.
 */

/** The ClickUp custom-field id of the "Cliente" dropdown. */
export const CLIENTE_FIELD_ID = "05ebdc8a-4736-404d-9132-3ab32875e1f1";

/** Canonical Cliente option names → their ClickUp dropdown option UUIDs. */
export const CLIENTS = {
  "Felipe Vergara": "63d9626f-9b80-4a19-8638-93b8042d2e9c",
  "Children Chic": "57123824-86d1-4fb8-a3a3-03fb1a8d8704",
  Ultra1plus: "b48a4350-8c92-434f-88d4-00527f2eb157",
  FHCA: "dce8df41-786e-40f4-9427-e833daf2d6a0",
  "Delta/Nicmafia": "bf842969-d5c2-4eb8-a1fb-5d87d804eb0d",
  Apturio: "cde11ae3-2d92-4ca4-b9d7-ab4157af67ff",
  Interno: "c95d4707-50a8-4833-9046-9c153a4f7592",
} as const satisfies Record<string, string>;

/** Union of the canonical Cliente names (keys of CLIENTS). */
export type ClientName = keyof typeof CLIENTS;

/**
 * Lowercase fuzzy aliases → canonical CLIENTS key. The resolver lowercases the
 * LLM's raw cliente string and looks it up here when it isn't an exact name
 * match. Every value MUST be a real CLIENTS key (test-enforced).
 */
export const CLIENT_ALIASES = {
  feli: "Felipe Vergara",
  felipe: "Felipe Vergara",
  vergara: "Felipe Vergara",
  children: "Children Chic",
  "children chic": "Children Chic",
  chic: "Children Chic",
  ultra: "Ultra1plus",
  ultra1plus: "Ultra1plus",
  "ultra 1 plus": "Ultra1plus",
  fhca: "FHCA",
  delta: "Delta/Nicmafia",
  nicmafia: "Delta/Nicmafia",
  "delta/nicmafia": "Delta/Nicmafia",
  apturio: "Apturio",
  interno: "Interno",
  internal: "Interno",
  // Aprendoseo / Aprendo Club is the team's own brand, not a client → Interno.
  aprendoseo: "Interno",
  "aprendo seo": "Interno",
  aprendoclub: "Interno",
  "aprendo club": "Interno",
  aprendo: "Interno",
} as const satisfies Record<string, ClientName>;

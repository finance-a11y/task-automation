/**
 * Config-as-code: the 9 ClickUp team members, encoded as a typed name → numeric
 * member-id map plus a fuzzy-text alias table and a Slack-userID → member-id
 * override scaffold. The ids are the only source of truth for task assignees,
 * copied verbatim from 02-CONTEXT.md and locked by unit tests (Pitfall 6).
 *
 * Pure data only: no I/O, no process.env. The resolver (plan 02) consumes this.
 */

/** Canonical member names → their ClickUp numeric member ids. */
export const MEMBERS = {
  "Miguel Pacheco": 216158839,
  "Juan Carlos Angulo": 216178477,
  "Veronica Romero": 118065209,
  "Amira El Sahli": 112092886,
  "Oriana Reyes": 106163644,
  "Fernando Perez": 162145488,
  "Natalia Olivares": 105901293,
  "Cammila Hernandez": 100128182,
  "Arianna Lupi": 150028631,
} as const satisfies Record<string, number>;

/** Union of the canonical member names (keys of MEMBERS). */
export type MemberName = keyof typeof MEMBERS;

/**
 * Lowercase fuzzy aliases → canonical MEMBERS key. The resolver lowercases each
 * raw assignee token and looks it up here when it isn't an exact name match.
 * Every value MUST be a real MEMBERS key (test-enforced).
 */
export const MEMBER_ALIASES = {
  miguel: "Miguel Pacheco",
  pacheco: "Miguel Pacheco",
  juancarlos: "Juan Carlos Angulo",
  "juan carlos": "Juan Carlos Angulo",
  jc: "Juan Carlos Angulo",
  vero: "Veronica Romero",
  veronica: "Veronica Romero",
  amira: "Amira El Sahli",
  oriana: "Oriana Reyes",
  ori: "Oriana Reyes",
  fernando: "Fernando Perez",
  fer: "Fernando Perez",
  natalia: "Natalia Olivares",
  nat: "Natalia Olivares",
  cammila: "Cammila Hernandez",
  cammi: "Cammila Hernandez",
  cami: "Cammila Hernandez",
  arianna: "Arianna Lupi",
  ari: "Arianna Lupi",
} as const satisfies Record<string, MemberName>;

/**
 * Slack user-id → ClickUp member-id override map. Empty by default because the
 * Slack workspace isn't wired yet (Slack ids are unknown until then). It exists
 * so real ids can be slotted in later — via env override or by populating this
 * constant — without any resolver code changes (per CONTEXT specifics). The
 * resolver checks this map first, before name/alias resolution.
 */
export const SLACK_TO_MEMBER: Record<string, number> = {};

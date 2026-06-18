import { describe, it, expect } from "vitest";
import {
  MEMBERS,
  MEMBER_ALIASES,
  SLACK_TO_MEMBER,
  type MemberName,
} from "./members.js";

describe("members config-as-code", () => {
  it("encodes exactly the 9 ClickUp members with verbatim numeric ids", () => {
    const expected: Record<MemberName, number> = {
      "Miguel Pacheco": 216158839,
      "Juan Carlos Angulo": 216178477,
      "Veronica Romero": 118065209,
      "Amira El Sahli": 112092886,
      "Oriana Reyes": 106163644,
      "Fernando Perez": 162145488,
      "Natalia Olivares": 105901293,
      "Cammila Hernandez": 100128182,
      "Arianna Lupi": 150028631,
    };
    expect(MEMBERS).toEqual(expected);
    expect(Object.keys(MEMBERS)).toHaveLength(9);
  });

  it("maps aliases to canonical MEMBERS keys", () => {
    expect(MEMBER_ALIASES.vero).toBe("Veronica Romero");
    for (const canonical of Object.values(MEMBER_ALIASES)) {
      expect(MEMBERS).toHaveProperty(canonical);
    }
  });

  it("exports an empty, typed Slack→member override map", () => {
    expect(SLACK_TO_MEMBER).toEqual({});
    // typed as Record<string, number> — assignment compiles
    const probe: Record<string, number> = SLACK_TO_MEMBER;
    expect(probe).toBeDefined();
  });
});

import { describe, it, expect } from "vitest";
import { resolveAssignees } from "./assignees.js";

const VERO = 118065209;
const MIGUEL = 216158839;

describe("resolveAssignees (PARSE-03)", () => {
  it("matches member names case-insensitively", () => {
    expect(resolveAssignees(["Veronica Romero"])).toEqual({
      ids: [VERO],
      unresolved: [],
    });
    expect(resolveAssignees(["veronica romero"])).toEqual({
      ids: [VERO],
      unresolved: [],
    });
  });

  it("matches via the alias table", () => {
    expect(resolveAssignees(["vero"])).toEqual({ ids: [VERO], unresolved: [] });
  });

  it("resolves a Slack user id via the injected SLACK_TO_MEMBER override", () => {
    const slackToMember = { U123ABC: MIGUEL };
    expect(resolveAssignees(["U123ABC"], { slackToMember })).toEqual({
      ids: [MIGUEL],
      unresolved: [],
    });
  });

  it("drops unmatched names and surfaces them in unresolved", () => {
    expect(resolveAssignees(["Veronica Romero", "Pepe"])).toEqual({
      ids: [VERO],
      unresolved: ["Pepe"],
    });
  });

  it("dedups a member referenced twice (by name and alias)", () => {
    expect(resolveAssignees(["Veronica Romero", "vero"])).toEqual({
      ids: [VERO],
      unresolved: [],
    });
  });

  it("returns empty results for an empty input list", () => {
    expect(resolveAssignees([])).toEqual({ ids: [], unresolved: [] });
  });

  it("never resolves Object.prototype keys (prototype-pollution guard)", () => {
    // "constructor"/"toString"/etc. are inherited prototype members, NOT real
    // members — they must invent NO ids and surface as unresolved (Pitfall 4).
    const tokens = ["constructor", "toString", "valueOf", "hasOwnProperty"];
    const result = resolveAssignees(tokens);
    expect(result.ids).toEqual([]);
    expect(result.unresolved).toEqual(tokens);
  });

  it("does not let a prototype key in the Slack override map invent an id", () => {
    // A user-supplied token that collides with an Object.prototype key must
    // not resolve via the injected slackToMember map either.
    const slackToMember = { U123ABC: MIGUEL };
    expect(resolveAssignees(["constructor"], { slackToMember })).toEqual({
      ids: [],
      unresolved: ["constructor"],
    });
  });
});

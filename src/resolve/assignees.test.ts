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
});

import { describe, it, expect } from "vitest";
import { resolveCliente } from "./cliente.js";

const FHCA = "dce8df41-786e-40f4-9427-e833daf2d6a0";
const FELIPE = "63d9626f-9b80-4a19-8638-93b8042d2e9c";
const DELTA = "bf842969-d5c2-4eb8-a1fb-5d87d804eb0d";

describe("resolveCliente (PARSE-02)", () => {
  it("matches a canonical name case-insensitively and trimmed", () => {
    expect(resolveCliente("FHCA")).toBe(FHCA);
    expect(resolveCliente("fhca")).toBe(FHCA);
    expect(resolveCliente(" Fhca ")).toBe(FHCA);
  });

  it("matches via the alias table", () => {
    expect(resolveCliente("feli")).toBe(FELIPE);
    expect(resolveCliente("nicmafia")).toBe(DELTA);
    expect(resolveCliente("delta")).toBe(DELTA);
  });

  it("returns null when there is no confident match (never invents)", () => {
    expect(resolveCliente("Cliente X")).toBeNull();
    expect(resolveCliente("")).toBeNull();
    expect(resolveCliente(null)).toBeNull();
    expect(resolveCliente("   ")).toBeNull();
  });

  it("returns null for Object.prototype keys (prototype-pollution guard)", () => {
    // Inherited prototype members must never resolve to a UUID nor leak
    // `undefined` through the `string | null` contract (Pitfall 4).
    expect(resolveCliente("constructor")).toBeNull();
    expect(resolveCliente("toString")).toBeNull();
    expect(resolveCliente("hasOwnProperty")).toBeNull();
    expect(resolveCliente("valueOf")).toBeNull();
  });
});

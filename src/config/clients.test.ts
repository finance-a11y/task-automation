import { describe, it, expect } from "vitest";
import {
  CLIENTE_FIELD_ID,
  CLIENTS,
  CLIENT_ALIASES,
  type ClientName,
} from "./clients.js";

describe("clients config-as-code", () => {
  it("exposes the exact Cliente dropdown field id", () => {
    expect(CLIENTE_FIELD_ID).toBe("05ebdc8a-4736-404d-9132-3ab32875e1f1");
  });

  it("encodes exactly the 7 Cliente options with verbatim option UUIDs", () => {
    const expected: Record<ClientName, string> = {
      "Felipe Vergara": "63d9626f-9b80-4a19-8638-93b8042d2e9c",
      "Children Chic": "57123824-86d1-4fb8-a3a3-03fb1a8d8704",
      Ultra1plus: "b48a4350-8c92-434f-88d4-00527f2eb157",
      FHCA: "dce8df41-786e-40f4-9427-e833daf2d6a0",
      "Delta/Nicmafia": "bf842969-d5c2-4eb8-a1fb-5d87d804eb0d",
      Apturio: "cde11ae3-2d92-4ca4-b9d7-ab4157af67ff",
      Interno: "c95d4707-50a8-4833-9046-9c153a4f7592",
    };
    expect(CLIENTS).toEqual(expected);
    expect(Object.keys(CLIENTS)).toHaveLength(7);
  });

  it("maps aliases to canonical CLIENTS keys", () => {
    expect(CLIENT_ALIASES.feli).toBe("Felipe Vergara");
    expect(CLIENT_ALIASES.delta).toBe("Delta/Nicmafia");
    expect(CLIENT_ALIASES.nicmafia).toBe("Delta/Nicmafia");
    // every alias value must be a real CLIENTS key
    for (const canonical of Object.values(CLIENT_ALIASES)) {
      expect(CLIENTS).toHaveProperty(canonical);
    }
  });
});

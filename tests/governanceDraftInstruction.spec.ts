import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeGovernanceDraftPayloadHex,
  normalizeGovernanceDraftWireId,
} from "../electron/governanceDraftInstruction";

describe("governance draft instruction boundary", () => {
  it("admits only canonical wire identifiers and framed lowercase bytes", () => {
    expect(normalizeGovernanceDraftWireId("iroha::CurrentInstruction")).toBe(
      "iroha::CurrentInstruction",
    );
    expect(normalizeGovernanceDraftPayloadHex("00ff")).toBe("00ff");
  });

  it.each([
    [
      "leading wire-id whitespace",
      () => normalizeGovernanceDraftWireId(" wire"),
    ],
    [
      "trailing wire-id whitespace",
      () => normalizeGovernanceDraftWireId("wire "),
    ],
    ["uppercase payload hex", () => normalizeGovernanceDraftPayloadHex("AA")],
    [
      "leading payload whitespace",
      () => normalizeGovernanceDraftPayloadHex(" 00"),
    ],
    [
      "trailing payload whitespace",
      () => normalizeGovernanceDraftPayloadHex("00 "),
    ],
  ])("rejects %s before native decode", (_label, decode) => {
    expect(decode).toThrow(/canonical non-empty text|lowercase hexadecimal/u);
  });

  it("does not bundle the retired wallet ballot and enact workflows", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const bridge = readFileSync(
      resolve(process.cwd(), "src/types/iroha.d.ts"),
      "utf8",
    );
    const service = readFileSync(
      resolve(process.cwd(), "src/services/iroha.ts"),
      "utf8",
    );

    for (const source of [preload, bridge, service]) {
      expect(source).not.toMatch(
        /prepareGovernance(?:PlainBallot|ParliamentBallot|Enact)|getGovernancePlainReferendumContract/u,
      );
    }
  });
});

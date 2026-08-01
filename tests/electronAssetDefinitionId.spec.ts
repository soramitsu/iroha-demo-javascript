import { describe, expect, it } from "vitest";
import { normalizeFirstReleaseAssetDefinitionId } from "../electron/assetDefinitionId";

describe("first-release asset definition identity", () => {
  it.each([
    "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    "norito:abcdef0123456789abcdef0123456789",
  ])("accepts the exact canonical literal %s", (literal) => {
    expect(normalizeFirstReleaseAssetDefinitionId(` ${literal} `)).toBe(
      literal,
    );
  });

  it.each([
    "xor",
    "universal",
    "xor#universal",
    "6TEAJqbb8oEPmLncoNiMRbLEK6tw#sorauAccount",
    "6TEAJqbb8oEPmLncoNiMRbLEK6tw##sorauAccount",
    "norito:ABCDEF0123456789ABCDEF0123456789",
  ])("rejects non-canonical identity %s", (literal) => {
    expect(() => normalizeFirstReleaseAssetDefinitionId(literal)).toThrow(
      "must be an exact first-release asset definition literal",
    );
  });

  it("rejects a missing asset definition", () => {
    expect(() => normalizeFirstReleaseAssetDefinitionId(" ")).toThrow(
      "assetDefinitionId is required.",
    );
  });
});

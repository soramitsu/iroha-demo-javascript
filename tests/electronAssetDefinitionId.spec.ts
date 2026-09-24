import { describe, expect, it } from "vitest";
import { normalizeFirstReleaseAssetDefinitionId } from "../electron/assetDefinitionId";

describe("first-release asset definition identity", () => {
  it("accepts an exact checksum-valid UUIDv4-backed Base58 literal", () => {
    const literal = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
    expect(normalizeFirstReleaseAssetDefinitionId(literal)).toBe(literal);
  });

  it.each([
    "xor",
    "universal",
    "xor#universal",
    "6TEAJqbb8oEPmLncoNiMRbLEK6tw#sorauAccount",
    "6TEAJqbb8oEPmLncoNiMRbLEK6tw##sorauAccount",
    " 6TEAJqbb8oEPmLncoNiMRbLEK6tw ",
    "4Zust3cNxsgov3757wxRW7DtR8n6",
    "norito:abcdef0123456789abcdef0123456789",
    "norito:ABCDEF0123456789ABCDEF0123456789",
  ])("rejects non-canonical identity %s", (literal) => {
    expect(() => normalizeFirstReleaseAssetDefinitionId(literal)).toThrow(
      "must be an exact canonical Base58 asset definition ID",
    );
  });

  it("rejects a missing asset definition", () => {
    expect(() => normalizeFirstReleaseAssetDefinitionId("")).toThrow(
      "assetDefinitionId is required.",
    );
  });
});

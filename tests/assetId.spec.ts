import { describe, expect, it } from "vitest";
import {
  areAssetDefinitionIdsEquivalent,
  buildAssetHoldingIdLiteral,
  deriveAssetSymbol,
  extractAssetHoldingDataspaceSuffix,
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  isCanonicalAssetDefinitionId,
  resolveToriiXorAsset,
  shouldReplaceConfiguredAssetDefinitionId,
  splitAssetReference,
} from "@/utils/assetId";

const XOR = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const OTHER = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const ACCOUNT =
  "testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";

describe("asset ID helpers", () => {
  it("accepts only checksum-valid UUIDv4-backed Base58 definition IDs", () => {
    expect(isCanonicalAssetDefinitionId(XOR)).toBe(true);
    expect(isCanonicalAssetDefinitionId(OTHER)).toBe(true);
    expect(isCanonicalAssetDefinitionId(` ${XOR}`)).toBe(false);
    expect(isCanonicalAssetDefinitionId("4Zust3cNxsgov3757wxRW7DtR8n6")).toBe(
      false,
    );
    expect(
      isCanonicalAssetDefinitionId("norito:00112233445566778899aabbccddeeff"),
    ).toBe(false);
    expect(isCanonicalAssetDefinitionId("xor#universal")).toBe(false);
  });

  it("parses only current definition and holding literals", () => {
    expect(splitAssetReference(XOR)).toEqual({
      definitionId: XOR,
      accountId: "",
    });
    expect(splitAssetReference(`${XOR}#${ACCOUNT}`)).toEqual({
      definitionId: XOR,
      accountId: ACCOUNT,
    });
    expect(splitAssetReference(`${XOR}#${ACCOUNT}#dataspace:2`)).toEqual({
      definitionId: XOR,
      accountId: `${ACCOUNT}#dataspace:2`,
    });
    expect(extractAssetHoldingDataspaceSuffix(`${XOR}#${ACCOUNT}`)).toBe("");
    expect(
      extractAssetHoldingDataspaceSuffix(`${XOR}#${ACCOUNT}#dataspace:2`),
    ).toBe("#dataspace:2");
  });

  it.each([
    "xor#wonderland##alice@wonderland",
    "xor#wonderland#alice@wonderland",
    `${XOR}##${ACCOUNT}`,
    `${XOR}#${ACCOUNT}#dataspace:02`,
    `${XOR}#${ACCOUNT}#dataspace:18446744073709551616`,
    ` ${XOR}`,
  ])("rejects retired or non-canonical references: %s", (literal) => {
    expect(splitAssetReference(literal)).toEqual({
      definitionId: "",
      accountId: "",
    });
    expect(extractAssetDefinitionId(literal)).toBe("");
  });

  it("builds exact global and dataspace holding IDs", () => {
    expect(
      buildAssetHoldingIdLiteral({
        assetDefinitionId: XOR,
        accountId: ACCOUNT,
      }),
    ).toBe(`${XOR}#${ACCOUNT}`);
    expect(
      buildAssetHoldingIdLiteral({
        assetDefinitionId: `${XOR}#${ACCOUNT}#dataspace:2`,
        accountId: ACCOUNT,
      }),
    ).toBe(`${XOR}#${ACCOUNT}#dataspace:2`);
    expect(() =>
      buildAssetHoldingIdLiteral({
        assetDefinitionId: "xor#universal",
        accountId: ACCOUNT,
      }),
    ).toThrow("exact Base58 asset definition");
    expect(() =>
      buildAssetHoldingIdLiteral({
        assetDefinitionId: XOR,
        accountId: ACCOUNT,
        dataspaceSuffix: "#dataspace:02",
      }),
    ).toThrow("must be canonical");
  });

  it("uses exact identity comparisons without encoding adapters", () => {
    expect(areAssetDefinitionIdsEquivalent(XOR, `${XOR}#${ACCOUNT}`)).toBe(
      true,
    );
    expect(areAssetDefinitionIdsEquivalent(XOR, OTHER)).toBe(false);
    expect(
      areAssetDefinitionIdsEquivalent(
        XOR,
        "norito:00112233445566778899aabbccddeeff",
      ),
    ).toBe(false);
  });

  it("labels the pinned XOR asset without guessing symbols from IDs", () => {
    expect(deriveAssetSymbol(XOR)).toBe("XOR");
    expect(deriveAssetSymbol(OTHER)).toBe("ASSET");
    expect(deriveAssetSymbol(OTHER, "units")).toBe("units");
    expect(formatAssetDefinitionLabel(`${XOR}#${ACCOUNT}`)).toBe(XOR);
    expect(formatAssetDefinitionLabel("xor#universal")).toBe("—");
    expect(formatAssetReferenceLabel(`${XOR}#${ACCOUNT}`)).toBe(
      `${XOR}#${ACCOUNT}`,
    );
    expect(formatAssetReferenceLabel("xor#universal")).toBe("—");
  });

  it("resolves only explicitly preferred current asset IDs", () => {
    const assets = [
      { asset_id: `${OTHER}#${ACCOUNT}`, quantity: "5" },
      { asset_id: `${XOR}#${ACCOUNT}`, quantity: "25" },
    ];
    expect(resolveToriiXorAsset(assets, [XOR])).toEqual(assets[1]);
    expect(resolveToriiXorAsset(assets, [])).toBeNull();
    expect(resolveToriiXorAsset(assets, ["xor#universal"])).toBeNull();
  });

  it("updates configuration only from exact live holding evidence", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "",
        detectedAssetDefinitionId: OTHER,
        knownAssetIds: [`${OTHER}#${ACCOUNT}`],
      }),
    ).toBe(true);
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: XOR,
        detectedAssetDefinitionId: OTHER,
        knownAssetIds: [`${OTHER}#${ACCOUNT}`],
      }),
    ).toBe(true);
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: XOR,
        detectedAssetDefinitionId: OTHER,
        knownAssetIds: [`${XOR}#${ACCOUNT}`],
      }),
    ).toBe(false);
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "xor#universal",
        detectedAssetDefinitionId: OTHER,
      }),
    ).toBe(false);
  });
});

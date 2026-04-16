import { describe, expect, it } from "vitest";
import {
  areAssetDefinitionIdsEquivalent,
  decodeNoritoAssetDefinitionId,
  deriveAssetSymbol,
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  formatOpaqueAssetLiteralsInText,
  resolveToriiXorAsset,
  shouldReplaceConfiguredAssetDefinitionId,
  splitAssetReference,
} from "@/utils/assetId";

describe("asset ID helpers", () => {
  it("splits legacy asset references into definition and account", () => {
    expect(splitAssetReference("xor#wonderland##alice@wonderland")).toEqual({
      definitionId: "xor#wonderland",
      accountId: "alice@wonderland",
    });
    expect(splitAssetReference("xor#wonderland#alice@wonderland")).toEqual({
      definitionId: "xor#wonderland",
      accountId: "alice@wonderland",
    });
  });

  it("keeps canonical encoded IDs intact", () => {
    expect(splitAssetReference("norito:abcdef0123456789")).toEqual({
      definitionId: "norito:abcdef0123456789",
      accountId: "",
    });
    expect(extractAssetDefinitionId("norito:abcdef0123456789##n42u...")).toBe(
      "norito:abcdef0123456789",
    );
  });

  it("splits TAIRA base58 asset references that append an I105 account id", () => {
    expect(
      splitAssetReference(
        "6TEAJqbb8oEPmLncoNiMRbLEK6tw#testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY",
      ),
    ).toEqual({
      definitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      accountId:
        "testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY",
    });
    expect(
      extractAssetDefinitionId(
        "6TEAJqbb8oEPmLncoNiMRbLEK6tw#testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY",
      ),
    ).toBe("6TEAJqbb8oEPmLncoNiMRbLEK6tw");
  });

  it("derives readable symbols for legacy IDs and XOR-like IDs", () => {
    expect(deriveAssetSymbol("token#wonderland")).toBe("TOKEN");
    expect(deriveAssetSymbol("XOR#wonderland##alice@wonderland")).toBe("XOR");
    expect(deriveAssetSymbol("norito:abcdefxorfeed")).toBe("XOR");
  });

  it("uses fallback labels for opaque encoded IDs", () => {
    expect(deriveAssetSymbol("norito:abcdef0123456789", "units")).toBe("units");
    expect(deriveAssetSymbol("", "units")).toBe("units");
  });

  it("decodes canonical norito asset IDs into standard base58 literals", () => {
    expect(
      decodeNoritoAssetDefinitionId("norito:00112233445566778899aabbccddeeff"),
    ).toBe("4Zust3cNxsgov3757wxRW7DtR8n6");
    expect(
      formatAssetDefinitionLabel("norito:00112233445566778899aabbccddeeff"),
    ).toBe("4Zust3cNxsgov3757wxRW7DtR8n6");
    expect(
      formatAssetReferenceLabel(
        "norito:00112233445566778899aabbccddeeff##alice@wonderland",
      ),
    ).toBe("4Zust3cNxsgov3757wxRW7DtR8n6 | alice@wonderland");
  });

  it("falls back to shortened labels when norito literals are not decodable", () => {
    expect(formatAssetDefinitionLabel("norito:abcdef0123456789")).toBe(
      "abcdef01...23456789",
    );
    expect(
      formatAssetDefinitionLabel("norito:abcdefghijklmnopqrstuvwxyz012345"),
    ).toBe("abcdefgh...yz012345");
    expect(
      formatAssetReferenceLabel(
        "norito:abcdefghijklmnopqrstuvwxyz012345##alice@wonderland",
      ),
    ).toBe("abcdefgh...yz012345 | alice@wonderland");
  });

  it("replaces opaque norito literals inside user-facing text", () => {
    expect(
      formatOpaqueAssetLiteralsInText(
        'shield policy mismatch for "norito:00112233445566778899aabbccddeeff"',
      ),
    ).toBe('shield policy mismatch for "4Zust3cNxsgov3757wxRW7DtR8n6"');
  });

  it("prefers the live Torii XOR asset over unrelated cached asset buckets", () => {
    expect(
      resolveToriiXorAsset([
        {
          asset_id: "norito:cachedbucket",
          quantity: "25000",
        },
        {
          asset_id: "xor#universal##alice@wonderland",
          quantity: "75000",
        },
      ]),
    ).toEqual({
      asset_id: "xor#universal##alice@wonderland",
      quantity: "75000",
    });
  });

  it("uses a Torii-resolved preferred XOR asset id when the live asset is opaque", () => {
    expect(
      resolveToriiXorAsset(
        [
          {
            asset_id: "norito:resolvedxorasset##alice@wonderland",
            quantity: "40",
          },
          {
            asset_id: "xor#universal##alice@wonderland",
            quantity: "5",
          },
        ],
        ["norito:resolvedxorasset"],
      ),
    ).toEqual({
      asset_id: "norito:resolvedxorasset##alice@wonderland",
      quantity: "40",
    });
  });

  it("falls back to the first positive Torii asset when no XOR marker exists", () => {
    expect(
      resolveToriiXorAsset([
        {
          asset_id: "norito:firstasset",
          quantity: "25",
        },
        {
          asset_id: "norito:secondasset",
          quantity: "0",
        },
      ]),
    ).toEqual({
      asset_id: "norito:firstasset",
      quantity: "25",
    });
  });

  it("replaces stale legacy asset aliases with a detected live asset bucket", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "xor#universal",
        detectedAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      }),
    ).toBe(true);
  });

  it("replaces stale alias-style assets when live balances expose a detected bucket", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "xor#wonderland",
        detectedAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        knownAssetIds: ["61CtjvNd9T3THAR65GsMVHr82Bjc##alice@wonderland"],
      }),
    ).toBe(true);
  });

  it("keeps canonical configured assets even when live balances use another encoding", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "4Zust3cNxsgov3757wxRW7DtR8n6",
        detectedAssetDefinitionId: "norito:00112233445566778899aabbccddeeff",
        knownAssetIds: ["norito:00112233445566778899aabbccddeeff"],
      }),
    ).toBe(false);
  });

  it("treats semantically equivalent base58 and norito asset ids as the same asset", () => {
    expect(
      areAssetDefinitionIdsEquivalent(
        "4Zust3cNxsgov3757wxRW7DtR8n6",
        "norito:00112233445566778899aabbccddeeff",
      ),
    ).toBe(true);
  });

  it("replaces stale canonical asset buckets when live balances expose a different bucket", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "5OldBucket1111111111111111111",
        detectedAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        knownAssetIds: ["61CtjvNd9T3THAR65GsMVHr82Bjc##alice@wonderland"],
      }),
    ).toBe(true);
  });

  it("avoids churn when live evidence only changes the asset encoding", () => {
    expect(
      shouldReplaceConfiguredAssetDefinitionId({
        configuredAssetDefinitionId: "4Zust3cNxsgov3757wxRW7DtR8n6",
        detectedAssetDefinitionId: "norito:00112233445566778899aabbccddeeff",
        knownAssetIds: ["norito:00112233445566778899aabbccddeeff"],
      }),
    ).toBe(false);
  });
});

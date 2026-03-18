import { describe, expect, it } from "vitest";
import {
  deriveAssetSymbol,
  extractAssetDefinitionId,
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

  it("derives readable symbols for legacy IDs and XOR-like IDs", () => {
    expect(deriveAssetSymbol("token#wonderland")).toBe("TOKEN");
    expect(deriveAssetSymbol("XOR#wonderland##alice@wonderland")).toBe("XOR");
    expect(deriveAssetSymbol("norito:abcdefxorfeed")).toBe("XOR");
  });

  it("uses fallback labels for opaque encoded IDs", () => {
    expect(deriveAssetSymbol("norito:abcdef0123456789", "units")).toBe("units");
    expect(deriveAssetSymbol("", "units")).toBe("units");
  });
});

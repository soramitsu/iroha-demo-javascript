import { describe, expect, it } from "vitest";
import {
  normalizeChainMetadata,
  normalizeNetworkPrefixValue,
  parseFirstReleaseChainMetadataPayload,
} from "@/utils/chainMetadata";

describe("chain metadata utilities", () => {
  it("normalizes complete chain metadata", () => {
    expect(
      normalizeChainMetadata({
        chainId: " chain-alpha ",
        networkPrefix: "42",
      }),
    ).toEqual({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });
  });

  it("rejects missing chain IDs and invalid network prefixes", () => {
    expect(() => normalizeChainMetadata({ networkPrefix: 42 })).toThrow(
      "Torii endpoint did not expose a chain ID.",
    );
    expect(() =>
      normalizeChainMetadata({ chainId: "chain-alpha", networkPrefix: 16384 }),
    ).toThrow("Torii endpoint did not expose a valid network prefix.");
  });

  it("parses the exact first-release endpoint payload", () => {
    expect(
      parseFirstReleaseChainMetadataPayload({
        chain_id: "chain-alpha",
        network_prefix: 369,
      }),
    ).toEqual({
      chainId: "chain-alpha",
      networkPrefix: 369,
    });
  });

  it("rejects nested values, aliases, string prefixes, and unknown fields", () => {
    expect(() =>
      parseFirstReleaseChainMetadataPayload({
        network: { chain_id: "chain-alpha", network_prefix: 369 },
      }),
    ).toThrow(/missing or unknown fields/u);
    expect(() =>
      parseFirstReleaseChainMetadataPayload({
        chainId: "chain-alpha",
        networkPrefix: 369,
      }),
    ).toThrow(/missing or unknown fields/u);
    expect(() =>
      parseFirstReleaseChainMetadataPayload({
        chain_id: "chain-alpha",
        network_prefix: "369",
      }),
    ).toThrow(/network_prefix/u);
    expect(() =>
      parseFirstReleaseChainMetadataPayload({
        chain_id: "chain-alpha",
        network_prefix: 369,
        account_id: "testuCoincidental",
      }),
    ).toThrow(/missing or unknown fields/u);
  });

  it("normalizes only valid network prefix values", () => {
    expect(normalizeNetworkPrefixValue("369")).toBe(369);
    expect(normalizeNetworkPrefixValue("")).toBeNull();
    expect(normalizeNetworkPrefixValue("   ")).toBeNull();
    expect(normalizeNetworkPrefixValue(16_384)).toBeNull();
  });
});

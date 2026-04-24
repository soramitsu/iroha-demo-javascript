import { describe, expect, it } from "vitest";
import {
  extractChainMetadataFromPayload,
  normalizeChainMetadata,
  normalizeNetworkPrefixValue,
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

  it("extracts chain metadata from nested endpoint payloads", () => {
    expect(
      extractChainMetadataFromPayload({
        network: {
          chain_id: "chain-alpha",
        },
        items: [
          {
            account_id: "testuAlice",
            network_prefix: 369,
          },
        ],
      }),
    ).toEqual({
      chainId: "chain-alpha",
      networkPrefix: 369,
    });
  });

  it("normalizes only valid network prefix values", () => {
    expect(normalizeNetworkPrefixValue("369")).toBe(369);
    expect(normalizeNetworkPrefixValue("")).toBeNull();
    expect(normalizeNetworkPrefixValue("   ")).toBeNull();
    expect(normalizeNetworkPrefixValue(16_384)).toBeNull();
  });
});

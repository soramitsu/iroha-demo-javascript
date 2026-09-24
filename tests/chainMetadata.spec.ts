import { describe, expect, it } from "vitest";
import {
  normalizeChainMetadata,
  normalizeNetworkPrefixValue,
  parseFirstReleaseChainMetadataPayload,
} from "@/utils/chainMetadata";

describe("chain metadata utilities", () => {
  it("accepts exact canonical chain metadata", () => {
    expect(
      normalizeChainMetadata({
        chainId: "chain-alpha",
        networkPrefix: 42,
      }),
    ).toEqual({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });
  });

  it("rejects missing chain IDs and invalid network prefixes", () => {
    expect(() => normalizeChainMetadata({ networkPrefix: 42 })).toThrow(
      "missing or unknown fields",
    );
    expect(() =>
      normalizeChainMetadata({ chainId: "chain-alpha", networkPrefix: 16384 }),
    ).toThrow("integer network prefix");
    expect(() =>
      normalizeChainMetadata({
        chainId: " chain-alpha ",
        networkPrefix: 42,
      }),
    ).toThrow("exact canonical chain ID");
    expect(() =>
      normalizeChainMetadata({
        chainId: "chain-alpha",
        networkPrefix: "42",
      }),
    ).toThrow("integer network prefix");
  });

  it("rejects extra fields, exotic prototypes, accessors, and symbols", () => {
    expect(() =>
      normalizeChainMetadata({
        chainId: "chain-alpha",
        networkPrefix: 42,
        fallback: true,
      } as never),
    ).toThrow("missing or unknown fields");
    expect(() =>
      normalizeChainMetadata(
        Object.assign(Object.create({ inherited: true }), {
          chainId: "chain-alpha",
          networkPrefix: 42,
        }),
      ),
    ).toThrow("missing or unknown fields");
    const accessor = { networkPrefix: 42 } as Record<string, unknown>;
    Object.defineProperty(accessor, "chainId", {
      enumerable: true,
      get: () => "chain-alpha",
    });
    expect(() => normalizeChainMetadata(accessor)).toThrow(
      "enumerable data fields",
    );
    expect(() =>
      normalizeChainMetadata({
        chainId: "chain-alpha",
        networkPrefix: 42,
        [Symbol("hidden")]: true,
      } as never),
    ).toThrow("missing or unknown fields");
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
    expect(() =>
      parseFirstReleaseChainMetadataPayload({
        chain_id: "chain-\u202ealpha",
        network_prefix: 369,
      }),
    ).toThrow(/chain_id/u);
  });

  it("accepts only integer network-prefix values", () => {
    expect(normalizeNetworkPrefixValue(369)).toBe(369);
    expect(normalizeNetworkPrefixValue("369")).toBeNull();
    expect(normalizeNetworkPrefixValue("")).toBeNull();
    expect(normalizeNetworkPrefixValue("   ")).toBeNull();
    expect(normalizeNetworkPrefixValue(369.5)).toBeNull();
    expect(normalizeNetworkPrefixValue(16_384)).toBeNull();
  });
});

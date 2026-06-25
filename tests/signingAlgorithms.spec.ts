import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNING_ALGORITHM,
  normalizeStoredSigningAlgorithm,
  signingAlgorithmLabel,
} from "@/utils/signingAlgorithms";

describe("signing algorithm metadata helpers", () => {
  it("normalizes stored printable identifiers without requiring Ed25519", () => {
    expect(normalizeStoredSigningAlgorithm("  Secp256K1  ")).toBe("secp256k1");
    expect(
      normalizeStoredSigningAlgorithm("gost3410-2012-512-paramset-b"),
    ).toBe("gost3410-2012-512-paramset-b");
  });

  it("defaults malformed stored values to Ed25519", () => {
    expect(normalizeStoredSigningAlgorithm(undefined)).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
    expect(normalizeStoredSigningAlgorithm(null)).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
    expect(normalizeStoredSigningAlgorithm({ algorithm: "secp256k1" })).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
    expect(normalizeStoredSigningAlgorithm("ed25519\nsecp256k1")).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
    expect(normalizeStoredSigningAlgorithm("x".repeat(129))).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
  });

  it("uses known labels and leaves printable future algorithms readable", () => {
    expect(signingAlgorithmLabel("ml-dsa")).toBe("ML-DSA");
    expect(signingAlgorithmLabel("future-signer")).toBe("future-signer");
    expect(signingAlgorithmLabel({ toString: () => "secp256k1" })).toBe(
      "Ed25519",
    );
  });
});

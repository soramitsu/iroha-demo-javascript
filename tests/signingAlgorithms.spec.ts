import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNING_ALGORITHM,
  normalizeStoredSigningAlgorithm,
  signingAlgorithmLabel,
} from "@/utils/signingAlgorithms";

describe("signing algorithm metadata helpers", () => {
  it("accepts exact currently supported signing algorithms", () => {
    expect(normalizeStoredSigningAlgorithm("secp256k1")).toBe("secp256k1");
    expect(
      normalizeStoredSigningAlgorithm("gost3410-2012-512-paramset-b"),
    ).toBe("gost3410-2012-512-paramset-b");
  });

  it("uses Ed25519 only when the algorithm is omitted", () => {
    expect(normalizeStoredSigningAlgorithm(undefined)).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
    expect(normalizeStoredSigningAlgorithm(null)).toBe(
      DEFAULT_SIGNING_ALGORITHM,
    );
  });

  it.each([
    { algorithm: "secp256k1" },
    "  Secp256K1  ",
    "ed25519\nsecp256k1",
    "future-signer",
    "x".repeat(129),
  ])("rejects a supplied unsupported value: %s", (value) => {
    expect(() => normalizeStoredSigningAlgorithm(value)).toThrow(
      "Unsupported signing algorithm.",
    );
  });

  it("uses labels for exact supported algorithms", () => {
    expect(signingAlgorithmLabel("ml-dsa")).toBe("ML-DSA");
    expect(() => signingAlgorithmLabel("future-signer")).toThrow(
      "Unsupported signing algorithm.",
    );
  });
});

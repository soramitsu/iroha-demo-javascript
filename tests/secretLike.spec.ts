import { describe, expect, it } from "vitest";
import { isSecretLikeTextValue } from "@/utils/secretLike";

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("secret-like text detection", () => {
  it("detects recovery phrases and PEM private key material", () => {
    expect(isSecretLikeTextValue(VALID_MNEMONIC)).toBe(true);
    expect(
      isSecretLikeTextValue(`
        -----BEGIN PRIVATE KEY-----
        MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
        -----END PRIVATE KEY-----
      `),
    ).toBe(true);
  });

  it("allows ordinary bridge identifiers, hashes, and non-mnemonic prose", () => {
    expect(isSecretLikeTextValue("taira_tron_xor")).toBe(false);
    expect(isSecretLikeTextValue("aa".repeat(32))).toBe(false);
    expect(
      isSecretLikeTextValue(
        "bridge route status is visible even when wallet connection is disabled",
      ),
    ).toBe(false);
    expect(isSecretLikeTextValue(null)).toBe(false);
  });
});

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  assertExactReviewedPublicKey,
  decodeCanonicalSignerPublicKey,
  primaryPublicKeyFingerprints,
} from "../scripts/prepare-iroha-release-source.mjs";

const reviewedFingerprint = "9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB";
const reviewedPublicListing = [
  "tru::1:1:0:0:3:1:5",
  "pub:-:255:22:0123456789ABCDEF:0:0:::::scESC:::::ed25519:::0:",
  `fpr:::::::::${reviewedFingerprint}:`,
  "uid:-::::0::hash::Reviewed signer::::::::::0:",
  "sub:-:255:18:FEDCBA9876543210:0:0:::::e:::::cv25519::",
  "fpr:::::::::1111111111111111111111111111111111111111:",
  "",
].join("\n");

describe("Iroha release signer provisioning", () => {
  it("accepts only canonical bounded standard base64", () => {
    const key = Buffer.from("reviewed public key fixture!", "utf8");
    expect(decodeCanonicalSignerPublicKey(key.toString("base64"))).toEqual(key);

    for (const malformed of [
      "",
      key.toString("base64").replace(/=+$/u, ""),
      `${key.toString("base64")}\n`,
      "***=",
      "A".repeat(2 * 1024 * 1024),
    ]) {
      expect(() => decodeCanonicalSignerPublicKey(malformed)).toThrow(
        "canonical unwrapped standard base64",
      );
    }
  });

  it("extracts primary fingerprints without treating subkeys as identities", () => {
    expect(primaryPublicKeyFingerprints(reviewedPublicListing)).toEqual([
      reviewedFingerprint,
    ]);
  });

  it("accepts exactly the reviewed public key and no private key", () => {
    expect(() =>
      assertExactReviewedPublicKey(reviewedPublicListing, "tru::1:1:\n"),
    ).not.toThrow();

    const extraKey = `${reviewedPublicListing}pub:-:255:22:AAAAAAAAAAAAAAAA:0:0:::::scESC:\nfpr:::::::::AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:\n`;
    expect(() => assertExactReviewedPublicKey(extraKey, "")).toThrow(
      "exactly the reviewed public primary key",
    );
    expect(() =>
      assertExactReviewedPublicKey(
        reviewedPublicListing.replace(reviewedFingerprint, "B".repeat(40)),
        "",
      ),
    ).toThrow("exactly the reviewed public primary key");
    expect(() =>
      assertExactReviewedPublicKey(
        reviewedPublicListing,
        "sec:-:255:22:0123456789ABCDEF:0:0:::::scESC:\n",
      ),
    ).toThrow("must not contain a private key");
    expect(() =>
      assertExactReviewedPublicKey(
        reviewedPublicListing,
        "ssb:-:255:18:FEDCBA9876543210:0:0:::::e:::::cv25519::\n",
      ),
    ).toThrow("must not contain a private key");
  });
});

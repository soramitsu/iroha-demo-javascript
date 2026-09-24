import { describe, expect, it } from "vitest";
import {
  decryptKaigiPayloadWithSecret,
  decryptKaigiPayload,
  encryptKaigiPayloadWithSecret,
  encryptKaigiPayload,
  generateKaigiX25519KeyPair,
} from "../electron/kaigiCrypto";

describe("Kaigi crypto helpers", () => {
  it("round-trips encrypted payloads with generated x25519 keys", () => {
    const hostKeys = generateKaigiX25519KeyPair();
    const payload = {
      kind: "answer",
      description: {
        type: "answer",
        sdp: "v=0\r\na=ice-ufrag:test\r\n",
      },
    };

    const encrypted = encryptKaigiPayload(payload, hostKeys.publicKeyBase64Url);

    expect(decryptKaigiPayload<typeof payload>(encrypted, hostKeys)).toEqual(
      payload,
    );
  });

  it("rejects decryption with the wrong key pair", () => {
    const hostKeys = generateKaigiX25519KeyPair();
    const wrongKeys = generateKaigiX25519KeyPair();
    const encrypted = encryptKaigiPayload(
      { value: "secret" },
      hostKeys.publicKeyBase64Url,
    );

    expect(() =>
      decryptKaigiPayload<{ value: string }>(encrypted, wrongKeys),
    ).toThrow();
  });

  it("rejects non-exact sealed boxes before key agreement", () => {
    const hostKeys = generateKaigiX25519KeyPair();
    const encrypted = encryptKaigiPayload(
      { value: "secret" },
      hostKeys.publicKeyBase64Url,
    );

    expect(() =>
      decryptKaigiPayload(
        { ...encrypted, compatibility_hint: true } as typeof encrypted,
        hostKeys,
      ),
    ).toThrow(/missing or unknown fields/u);
    expect(() =>
      decryptKaigiPayload({ ...encrypted, ivBase64Url: "AA" }, hostKeys),
    ).toThrow(/exactly 12 bytes/u);
  });

  it("bounds encrypted plaintext before allocating crypto output", () => {
    const hostKeys = generateKaigiX25519KeyPair();
    expect(() =>
      encryptKaigiPayload(
        { value: "x".repeat(1024 * 1024) },
        hostKeys.publicKeyBase64Url,
      ),
    ).toThrow(/exceeds/u);
  });

  it("rejects oversized encoded ciphertext before attempting decryption", () => {
    const hostKeys = generateKaigiX25519KeyPair();
    const encrypted = encryptKaigiPayload(
      { value: "secret" },
      hostKeys.publicKeyBase64Url,
    );

    expect(() =>
      decryptKaigiPayload(
        {
          ...encrypted,
          ciphertextBase64Url: "A".repeat(Math.ceil((1024 * 1024 * 4) / 3) + 1),
        },
        hostKeys,
      ),
    ).toThrow(/exceeds 1048576 bytes/u);
  });

  it("round-trips payloads encrypted with the invite secret", () => {
    const secret = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";
    const payload = {
      kind: "offer",
      description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:test\r\n",
      },
    };
    const encrypted = encryptKaigiPayloadWithSecret(payload, secret);

    expect(
      decryptKaigiPayloadWithSecret<typeof payload>(encrypted, secret),
    ).toEqual(payload);
  });

  it("rejects invite-secret decryption with the wrong secret", () => {
    const encrypted = encryptKaigiPayloadWithSecret(
      { value: "secret" },
      "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u",
    );

    expect(() =>
      decryptKaigiPayloadWithSecret(
        encrypted,
        "NDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u",
      ),
    ).toThrow();
  });
});

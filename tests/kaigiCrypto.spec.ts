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

  it("round-trips payloads encrypted with the invite secret", () => {
    const secret = "bXktc2VjcmV0";
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
      "bXktc2VjcmV0",
    );

    expect(() =>
      decryptKaigiPayloadWithSecret(encrypted, "d3Jvbmctc2VjcmV0"),
    ).toThrow();
  });
});

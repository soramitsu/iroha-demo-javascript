import { describe, expect, it } from "vitest";
import {
  decryptKaigiPayload,
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
});

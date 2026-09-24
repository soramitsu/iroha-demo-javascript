import { describe, expect, it } from "vitest";
import {
  CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX,
  encodeConfidentialPaymentAddress,
  type ConfidentialPaymentAddressPayload,
} from "@/utils/confidentialPaymentAddress";

const PAYMENT_ADDRESS: ConfidentialPaymentAddressPayload = {
  schema: "iroha-confidential-payment-address/v3",
  receiveKeyId: "AQEBAQEBAQEBAQEBAQEBAQEB",
  receivePublicKeyBase64Url: "A".repeat(43),
  shieldedOwnerTagHex: "11".repeat(32),
  shieldedDiversifierHex: "22".repeat(32),
  recoveryHint: "one-time-receive-key",
};

describe("confidential payment addresses", () => {
  it("encodes an exact compact v3 private address string", () => {
    const encoded = encodeConfidentialPaymentAddress(PAYMENT_ADDRESS);

    expect(encoded.startsWith(CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX)).toBe(true);
    expect(encoded).toBe(
      `${CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX}${btoa(
        JSON.stringify(PAYMENT_ADDRESS),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")}`,
    );
  });

  it("rejects unknown schemas, aliases, and plaintext fields", () => {
    expect(() =>
      encodeConfidentialPaymentAddress({
        ...PAYMENT_ADDRESS,
        schema: "untrusted-private-address/v99",
      } as unknown as ConfidentialPaymentAddressPayload),
    ).toThrow(/invalid/u);
    expect(() =>
      encodeConfidentialPaymentAddress({
        ...PAYMENT_ADDRESS,
        accountId: "mallory@example",
      } as ConfidentialPaymentAddressPayload),
    ).toThrow(/invalid/u);
    expect(() =>
      encodeConfidentialPaymentAddress({
        ...PAYMENT_ADDRESS,
        amount: "999",
      } as ConfidentialPaymentAddressPayload),
    ).toThrow(/invalid/u);
    expect(() =>
      encodeConfidentialPaymentAddress({
        schema: "iroha-confidential-payment-address/v3",
        shieldedReceiveKeyId: PAYMENT_ADDRESS.receiveKeyId,
        shieldedReceivePublicKeyBase64Url:
          PAYMENT_ADDRESS.receivePublicKeyBase64Url,
        ownerTagHex: PAYMENT_ADDRESS.shieldedOwnerTagHex,
        diversifierHex: PAYMENT_ADDRESS.shieldedDiversifierHex,
      } as unknown as ConfidentialPaymentAddressPayload),
    ).toThrow(/invalid/u);
  });

  it("rejects noncanonical key material and omitted fields", () => {
    expect(() =>
      encodeConfidentialPaymentAddress({
        ...PAYMENT_ADDRESS,
        receiveKeyId: "receive-key-1",
      }),
    ).toThrow(/invalid/u);
    expect(() =>
      encodeConfidentialPaymentAddress({
        ...PAYMENT_ADDRESS,
        receivePublicKeyBase64Url: "recipientPublicKey",
      }),
    ).toThrow(/invalid/u);
    const missingHint = { ...PAYMENT_ADDRESS } as Record<string, unknown>;
    Reflect.deleteProperty(missingHint, "recoveryHint");
    expect(() =>
      encodeConfidentialPaymentAddress(
        missingHint as unknown as ConfidentialPaymentAddressPayload,
      ),
    ).toThrow(/invalid/u);
  });
});

import { describe, expect, it } from "vitest";
import {
  CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX,
  encodeConfidentialPaymentAddress,
  parseConfidentialPaymentAddressPayload,
  parseConfidentialPaymentAddressText,
  type ConfidentialPaymentAddressPayload,
} from "@/utils/confidentialPaymentAddress";

const PAYMENT_ADDRESS: ConfidentialPaymentAddressPayload = {
  schema: "iroha-confidential-payment-address/v3",
  receiveKeyId: "receive-key-1",
  receivePublicKeyBase64Url: "recipientPublicKey",
  shieldedOwnerTagHex: "11".repeat(32),
  shieldedDiversifierHex: "22".repeat(32),
  recoveryHint: "one-time-receive-key",
};

describe("confidential payment addresses", () => {
  it("encodes and parses a compact private address string", () => {
    const encoded = encodeConfidentialPaymentAddress(PAYMENT_ADDRESS);

    expect(encoded.startsWith(CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX)).toBe(true);
    expect(parseConfidentialPaymentAddressText(encoded)).toEqual({
      ok: true,
      payload: PAYMENT_ADDRESS,
    });
  });

  it("parses raw v3 JSON payloads for existing receive QR compatibility", () => {
    expect(
      parseConfidentialPaymentAddressText(JSON.stringify(PAYMENT_ADDRESS)),
    ).toEqual({
      ok: true,
      payload: PAYMENT_ADDRESS,
    });
  });

  it("classifies legacy private receive payloads separately from malformed text", () => {
    expect(
      parseConfidentialPaymentAddressPayload({
        schema: "iroha-confidential-payment-address/v2",
        shieldedOwnerTagHex: "11".repeat(32),
        shieldedDiversifierHex: "22".repeat(32),
      }),
    ).toEqual({
      ok: false,
      reason: "legacy",
    });
    expect(parseConfidentialPaymentAddressText("not an address")).toEqual({
      ok: false,
      reason: "none",
    });
    expect(
      parseConfidentialPaymentAddressText(
        `${CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX}not-base64`,
      ),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

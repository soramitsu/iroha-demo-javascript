export const CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX = "iroha:confidential:v3:";

export type ConfidentialPaymentAddressPayload = {
  schema: "iroha-confidential-payment-address/v3";
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
  shieldedOwnerTagHex: string;
  shieldedDiversifierHex: string;
  recoveryHint?: "one-time-receive-key";
  accountId?: string;
  amount?: string;
};

export type ConfidentialPaymentAddressParseResult =
  | {
      ok: true;
      payload: ConfidentialPaymentAddressPayload;
    }
  | {
      ok: false;
      reason: "none" | "invalid" | "legacy";
    };

const trimString = (value: unknown): string => String(value ?? "").trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const encodeBase64Url = (value: string) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(`${normalized}${padding}`);
};

export const encodeConfidentialPaymentAddress = (
  payload: ConfidentialPaymentAddressPayload,
) =>
  `${CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX}${encodeBase64Url(
    JSON.stringify(payload),
  )}`;

export const parseConfidentialPaymentAddressPayload = (
  payload: unknown,
): ConfidentialPaymentAddressParseResult => {
  if (!isRecord(payload)) {
    return { ok: false, reason: "none" };
  }

  const receiveKeyId = trimString(
    payload.receiveKeyId ?? payload.shieldedReceiveKeyId,
  );
  const receivePublicKeyBase64Url = trimString(
    payload.receivePublicKeyBase64Url ??
      payload.shieldedReceivePublicKeyBase64Url,
  );
  const shieldedOwnerTagHex = trimString(
    payload.shieldedOwnerTagHex ?? payload.ownerTagHex,
  ).toLowerCase();
  const shieldedDiversifierHex = trimString(
    payload.shieldedDiversifierHex ?? payload.diversifierHex,
  ).toLowerCase();
  const hasConfidentialFields = Boolean(
    receiveKeyId ||
      receivePublicKeyBase64Url ||
      shieldedOwnerTagHex ||
      shieldedDiversifierHex,
  );

  if (
    payload.schema === "iroha-confidential-payment-address/v2" ||
    ((shieldedOwnerTagHex || shieldedDiversifierHex) &&
      (!receiveKeyId || !receivePublicKeyBase64Url))
  ) {
    return { ok: false, reason: "legacy" };
  }

  if (
    payload.schema !== "iroha-confidential-payment-address/v3" &&
    !hasConfidentialFields
  ) {
    return { ok: false, reason: "none" };
  }

  if (
    !/^[A-Za-z0-9_-]{8,128}$/.test(receiveKeyId) ||
    !/^[A-Za-z0-9_-]+$/.test(receivePublicKeyBase64Url) ||
    !/^[0-9a-f]{64}$/.test(shieldedOwnerTagHex) ||
    !/^[0-9a-f]{64}$/.test(shieldedDiversifierHex)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const accountId = trimString(payload.accountId);
  const amount = trimString(payload.amount);
  return {
    ok: true,
    payload: {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId,
      receivePublicKeyBase64Url,
      shieldedOwnerTagHex,
      shieldedDiversifierHex,
      recoveryHint: "one-time-receive-key",
      ...(accountId ? { accountId } : {}),
      ...(amount ? { amount } : {}),
    },
  };
};

export const parseConfidentialPaymentAddressText = (
  value: string,
): ConfidentialPaymentAddressParseResult => {
  const text = value.trim();
  if (!text) {
    return { ok: false, reason: "none" };
  }

  if (text.startsWith(CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX)) {
    try {
      const encoded = text.slice(CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX.length);
      return parseConfidentialPaymentAddressPayload(
        JSON.parse(decodeBase64Url(encoded)),
      );
    } catch (_error) {
      return { ok: false, reason: "invalid" };
    }
  }

  if (!text.startsWith("{")) {
    return { ok: false, reason: "none" };
  }

  try {
    return parseConfidentialPaymentAddressPayload(JSON.parse(text));
  } catch (_error) {
    return { ok: false, reason: "invalid" };
  }
};

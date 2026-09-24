export const CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX = "iroha:confidential:v3:";
const CONFIDENTIAL_PAYMENT_ADDRESS_SCHEMA =
  "iroha-confidential-payment-address/v3" as const;
const CONFIDENTIAL_PAYMENT_ADDRESS_RECOVERY_HINT =
  "one-time-receive-key" as const;

export type ConfidentialPaymentAddressPayload = {
  schema: "iroha-confidential-payment-address/v3";
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
  shieldedOwnerTagHex: string;
  shieldedDiversifierHex: string;
  recoveryHint: "one-time-receive-key";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const encodeBase64Url = (value: string) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(`${normalized}${padding}`);
};

const hasExactKeys = (
  payload: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(payload).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

const isCanonicalBase64Url = (
  value: unknown,
  byteLength: number,
): value is string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  try {
    const decoded = decodeBase64Url(value);
    return decoded.length === byteLength && encodeBase64Url(decoded) === value;
  } catch {
    return false;
  }
};

export const encodeConfidentialPaymentAddress = (
  payload: ConfidentialPaymentAddressPayload,
) => {
  if (!isValidConfidentialPaymentAddressPayload(payload)) {
    throw new Error("Confidential payment address payload is invalid.");
  }
  return `${CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX}${encodeBase64Url(
    JSON.stringify(payload),
  )}`;
};

const isValidConfidentialPaymentAddressPayload = (
  payload: unknown,
): payload is ConfidentialPaymentAddressPayload => {
  if (!isRecord(payload)) {
    return false;
  }

  if (payload.schema !== CONFIDENTIAL_PAYMENT_ADDRESS_SCHEMA) {
    return false;
  }

  if (
    !hasExactKeys(payload, [
      "schema",
      "receiveKeyId",
      "receivePublicKeyBase64Url",
      "shieldedOwnerTagHex",
      "shieldedDiversifierHex",
      "recoveryHint",
    ])
  ) {
    return false;
  }

  if (
    !isCanonicalBase64Url(payload.receiveKeyId, 18) ||
    !isCanonicalBase64Url(payload.receivePublicKeyBase64Url, 32) ||
    typeof payload.shieldedOwnerTagHex !== "string" ||
    !/^[0-9a-f]{64}$/.test(payload.shieldedOwnerTagHex) ||
    typeof payload.shieldedDiversifierHex !== "string" ||
    !/^[0-9a-f]{64}$/.test(payload.shieldedDiversifierHex) ||
    payload.recoveryHint !== CONFIDENTIAL_PAYMENT_ADDRESS_RECOVERY_HINT
  ) {
    return false;
  }
  return true;
};

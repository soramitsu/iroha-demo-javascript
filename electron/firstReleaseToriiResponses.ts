import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

import type {
  KaigiCallEventPayload,
  KaigiCallSignalsList,
  KaigiCallView,
  ToriiU64,
  ToriiVerifierBackendLabelV1,
  ToriiVerifyingKeyDetail,
  ToriiVerifyingKeyStatus,
} from "@iroha/iroha-js";

import { requireKaigiCallId } from "../src/utils/kaigiInvite";

export type FirstReleaseKaigiCallView = Omit<KaigiCallView, "roster_root_hex">;

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT32 = 0xffff_ffff;
const MAX_KAIGI_PARTICIPANTS = 4_096;
const MAX_KAIGI_NULLIFIERS = MAX_KAIGI_PARTICIPANTS + 2;
const MAX_KAIGI_SIGNAL_ITEMS = 500;
const MAX_KAIGI_CURSOR_BYTES = 1_024;
const MAX_KAIGI_ENCRYPTED_PAYLOAD_BYTES = 1_024 * 1_024;
const MAX_VERIFIER_ID_BYTES = 256;
const MAX_VERIFIER_URI_BYTES = 512;
const MAX_ACCOUNT_ID_BYTES = 1_024;
const MAX_HUMAN_TEXT_BYTES = 16 * 1_024;
const MAX_BASE64_TEXT_BYTES = 16 * 1_024 * 1_024;

const KAIGI_SIGNAL_SCHEMA_V1 = "iroha-demo-kaigi-chain-signal/v1";
const KAIGI_CALL_METADATA_SCHEMA_V2 = "iroha-demo-kaigi-call-metadata/v2";
const KAIGI_SECRET_BOX_SCHEMA_V1 = "iroha-demo-kaigi-secret-box/v1";
const KAIGI_SEALED_BOX_SCHEMA_V1 = "iroha-demo-kaigi-sealed-box/v1";
const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1_000;

const VERIFIER_BACKENDS = new Set<ToriiVerifierBackendLabelV1>([
  "halo2/ipa",
  "halo2/pasta/kaigi-roster-v1",
  "halo2/pasta/kaigi-usage-v1",
  "halo2/pasta/ivm-execution-v1",
  "halo2/pasta/kagemusha-topup-shield-merkle16-axiom-poseidon-v3",
  "halo2/pasta/confidential-transfer-2x2-merkle16-axiom-poseidon-v3",
  "halo2/pasta/confidential-unshield-full-merkle16-axiom-poseidon-v3",
  "halo2/pasta/confidential-unshield-change-merkle16-axiom-poseidon-v4",
  "stark/fri/poseidon-x7-goldilocks-6x64-v1",
]);

const VERIFYING_KEY_STATUSES = new Set<ToriiVerifyingKeyStatus>([
  "Proposed",
  "Active",
  "Withdrawn",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} must be a plain object.`);
  return value;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  const ownKeys = Reflect.ownKeys(value);
  const invalidKey = ownKeys.find(
    (key) => typeof key !== "string" || !allowed.has(key),
  );
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (invalidKey !== undefined || missing.length > 0) {
    throw new Error(
      `${label} fields are not exact; missing=[${missing.join(", ")}] unknown=[${
        invalidKey === undefined ? "" : String(invalidKey)
      }].`,
    );
  }
  for (const key of ownKeys) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} must be an enumerable JSON field.`);
    }
  }
};

const requireDenseArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${label} must be a dense array.`);
    }
  }
  if (Object.keys(value).some((key) => !/^(?:0|[1-9]\d*)$/u.test(key))) {
    throw new Error(`${label} must not contain named properties.`);
  }
  return value;
};

const utf8Length = (value: string): number => Buffer.byteLength(value, "utf8");

const hasUnpairedSurrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
};

const requireCanonicalText = (
  value: unknown,
  label: string,
  options: Readonly<{ maximumBytes: number; allowEmpty?: boolean }>,
): string => {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  if (
    (!options.allowEmpty && value.length === 0) ||
    utf8Length(value) > options.maximumBytes ||
    value.normalize("NFC") !== value ||
    hasUnpairedSurrogate(value) ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) ||
    (value.length > 0 && value.trim() !== value)
  ) {
    throw new Error(`${label} must be bounded canonical NFC text.`);
  }
  return value;
};

const requirePortableVerifierField = (
  value: unknown,
  label: string,
  options: Readonly<{ allowColon: boolean }> = { allowColon: true },
): string => {
  const field = requireCanonicalText(value, label, {
    maximumBytes: MAX_VERIFIER_ID_BYTES,
  });
  const bytes = Buffer.from(field, "utf8");
  const allowedPunctuation = options.allowColon ? "-_/.:" : "-_/.";
  const isAllowed = (byte: number): boolean =>
    (byte >= 0x61 && byte <= 0x7a) ||
    (byte >= 0x30 && byte <= 0x39) ||
    allowedPunctuation.includes(String.fromCharCode(byte));
  if (
    !bytes.every(isAllowed) ||
    !/[a-z0-9]$/u.test(field) ||
    !/^[a-z0-9]/u.test(field) ||
    ["..", "//", ":::", "/:", ":/", "/.", "./", ":.", ".:"].some((separator) =>
      field.includes(separator),
    )
  ) {
    throw new Error(`${label} must use the portable verifier field grammar.`);
  }
  return field;
};

const requireVerifierBackend = (
  value: unknown,
  label: string,
): ToriiVerifierBackendLabelV1 => {
  const backend = requirePortableVerifierField(value, label);
  if (!VERIFIER_BACKENDS.has(backend as ToriiVerifierBackendLabelV1)) {
    throw new Error(
      `${label} is not an admitted first-release verifier backend.`,
    );
  }
  return backend as ToriiVerifierBackendLabelV1;
};

const requireNullablePortableField = (
  value: unknown,
  label: string,
): string | null =>
  value === null ? null : requirePortableVerifierField(value, label);

const requirePortableContentUri = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) return null;
  const uri = requireCanonicalText(value, label, {
    maximumBytes: MAX_VERIFIER_URI_BYTES,
  });
  if (!/^[!-~]+$/u.test(uri) || /[\\?#@]/u.test(uri)) {
    throw new Error(`${label} must be a portable verifier content URI.`);
  }
  const body = uri.startsWith("ipfs://")
    ? uri.slice("ipfs://".length)
    : uri.startsWith("cid:")
      ? uri.slice("cid:".length)
      : uri;
  if (
    !body ||
    body.startsWith("/") ||
    body.endsWith("/") ||
    body.includes("..") ||
    body.includes("//") ||
    body.split("/").some((segment) => !/^[A-Za-z0-9._-]+$/u.test(segment))
  ) {
    throw new Error(`${label} must be a portable verifier content URI.`);
  }
  return uri;
};

const requireSafeInteger = (
  value: unknown,
  label: string,
  options: Readonly<{ minimum: number; maximum: number }>,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < options.minimum ||
    value > options.maximum
  ) {
    throw new Error(`${label} must be an exact bounded JSON integer.`);
  }
  return value;
};

const requireNullableSafeInteger = (
  value: unknown,
  label: string,
): number | null =>
  value === null
    ? null
    : requireSafeInteger(value, label, {
        minimum: 0,
        maximum: Number.MAX_SAFE_INTEGER,
      });

const requireU64 = (value: unknown, label: string): ToriiU64 => {
  let integer: bigint;
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0)
  ) {
    integer = BigInt(value);
  } else if (typeof value === "bigint") {
    integer = value;
  } else {
    throw new Error(`${label} must be a losslessly decoded unsigned integer.`);
  }
  if (integer < 0n || integer > MAX_UINT64) {
    throw new Error(`${label} must fit an unsigned 64-bit integer.`);
  }
  return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : integer;
};

const requireUint32 = (value: unknown, label: string): number =>
  requireSafeInteger(value, label, { minimum: 0, maximum: MAX_UINT32 });

const requireMarkedHash = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{63}[13579bdf]$/u.test(value)) {
    throw new Error(`${label} must be a canonical marked Iroha hash.`);
  }
  return value;
};

const requireLowerHex32 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be canonical lowercase 32-byte hex.`);
  }
  return value;
};

const requireCanonicalBase64 = (
  value: unknown,
  label: string,
): Readonly<{ encoded: string; decoded: Buffer }> => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8Length(value) > MAX_BASE64_TEXT_BYTES ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    throw new Error(`${label} must be non-empty canonical standard Base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new Error(`${label} must be non-empty canonical standard Base64.`);
  }
  return { encoded: value, decoded };
};

const requireCanonicalBase64Url = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8Length(value) > MAX_KAIGI_CURSOR_BYTES ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical bounded unpadded Base64url.`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.length === 0 ||
    decoded.length > MAX_KAIGI_CURSOR_BYTES ||
    decoded.toString("base64url") !== value
  ) {
    throw new Error(`${label} must be canonical bounded unpadded Base64url.`);
  }
  return value;
};

const requireCanonicalBase64UrlBytes = (
  value: unknown,
  label: string,
  options: Readonly<{
    exactBytes?: number;
    maximumBytes?: number;
  }>,
): string => {
  const encodedLengthLimit = Math.ceil(
    ((options.exactBytes ?? options.maximumBytes ?? 0) * 4) / 3,
  );
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    (encodedLengthLimit > 0 && value.length > encodedLengthLimit) ||
    (options.exactBytes !== undefined && value.length !== encodedLengthLimit) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical unpadded Base64url.`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.length === 0 ||
    decoded.toString("base64url") !== value ||
    (options.exactBytes !== undefined &&
      decoded.length !== options.exactBytes) ||
    (options.maximumBytes !== undefined &&
      decoded.length > options.maximumBytes)
  ) {
    throw new Error(`${label} must be canonical bounded unpadded Base64url.`);
  }
  return value;
};

const requireCanonicalAccountText = (value: unknown, label: string): string =>
  requireCanonicalText(value, label, { maximumBytes: MAX_ACCOUNT_ID_BYTES });

const hashInlineVerifyingKey = (backend: string, bytes: Uint8Array): string => {
  const backendBytes = Buffer.from(backend, "utf8");
  const backendLength = Buffer.alloc(8);
  backendLength.writeBigUInt64BE(BigInt(backendBytes.length));
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64BE(BigInt(bytes.length));
  return createHash("sha256")
    .update("iroha:zk:v1:vk", "utf8")
    .update(backendLength)
    .update(backendBytes)
    .update(payloadLength)
    .update(bytes)
    .digest("hex");
};

export type FirstReleaseVerifyingKeyExpectation = Readonly<{
  backend: ToriiVerifierBackendLabelV1;
  name: string;
}>;

export const normalizeFirstReleaseVerifyingKeyDetail = (
  payload: unknown,
  expectation: FirstReleaseVerifyingKeyExpectation,
): ToriiVerifyingKeyDetail => {
  const expectedBackend = requireVerifierBackend(
    expectation.backend,
    "Verifying key expectation.backend",
  );
  const expectedName = requirePortableVerifierField(
    expectation.name,
    "Verifying key expectation.name",
    { allowColon: false },
  );
  const response = requireRecord(payload, "Verifying key response");
  requireExactKeys(
    response,
    ["id", "record", "record_norito_base64"],
    [],
    "Verifying key response",
  );

  const id = requireRecord(response.id, "Verifying key response.id");
  requireExactKeys(id, ["backend", "name"], [], "Verifying key response.id");
  const backend = requireVerifierBackend(
    id.backend,
    "Verifying key response.id.backend",
  );
  const name = requirePortableVerifierField(
    id.name,
    "Verifying key response.id.name",
    { allowColon: false },
  );
  if (backend !== expectedBackend || name !== expectedName) {
    throw new Error(
      "Verifying key response identity does not match its request.",
    );
  }

  const rawRecord = requireRecord(
    response.record,
    "Verifying key response.record",
  );
  const recordFields = [
    "version",
    "circuit_id",
    "owner_manifest_id",
    "namespace",
    "backend",
    "curve",
    "public_inputs_schema_hash",
    "commitment",
    "vk_len",
    "max_proof_bytes",
    "gas_schedule_id",
    "metadata_uri_cid",
    "vk_bytes_cid",
    "activation_height",
    "withdraw_height",
    "status",
    "key",
  ] as const;
  requireExactKeys(
    rawRecord,
    recordFields,
    [],
    "Verifying key response.record",
  );

  const engine = requireCanonicalText(
    rawRecord.backend,
    "Verifying key response.record.backend",
    { maximumBytes: 32 },
  );
  const expectedEngine = backend.startsWith("stark/")
    ? "stark"
    : "halo2-ipa-pasta";
  const expectedCurve = expectedEngine === "stark" ? "goldilocks" : "pallas";
  if (engine !== expectedEngine || rawRecord.curve !== expectedCurve) {
    throw new Error(
      "Verifying key response engine and curve must match the requested backend.",
    );
  }

  const status = requireCanonicalText(
    rawRecord.status,
    "Verifying key response.record.status",
    { maximumBytes: 16 },
  ) as ToriiVerifyingKeyStatus;
  if (!VERIFYING_KEY_STATUSES.has(status)) {
    throw new Error("Verifying key response.record.status is unsupported.");
  }

  const version = requireSafeInteger(
    rawRecord.version,
    "Verifying key response.record.version",
    { minimum: 1, maximum: MAX_UINT32 },
  );
  const vkLength = requireUint32(
    rawRecord.vk_len,
    "Verifying key response.record.vk_len",
  );
  const commitment = requireLowerHex32(
    rawRecord.commitment,
    "Verifying key response.record.commitment",
  );
  const activationHeight = requireNullableSafeInteger(
    rawRecord.activation_height,
    "Verifying key response.record.activation_height",
  );
  const withdrawHeight = requireNullableSafeInteger(
    rawRecord.withdraw_height,
    "Verifying key response.record.withdraw_height",
  );
  if (
    activationHeight !== null &&
    withdrawHeight !== null &&
    withdrawHeight <= activationHeight
  ) {
    throw new Error(
      "Verifying key response withdraw height must exceed activation height.",
    );
  }

  let inlineKey: ToriiVerifyingKeyDetail["record"]["inline_key"] = null;
  if (rawRecord.key !== null) {
    const key = requireRecord(
      rawRecord.key,
      "Verifying key response.record.key",
    );
    requireExactKeys(
      key,
      ["backend", "bytes_b64"],
      [],
      "Verifying key response.record.key",
    );
    const inlineBackend = requireVerifierBackend(
      key.backend,
      "Verifying key response.record.key.backend",
    );
    if (inlineBackend !== backend) {
      throw new Error("Verifying key inline backend does not match its id.");
    }
    const encoded = requireCanonicalBase64(
      key.bytes_b64,
      "Verifying key response.record.key.bytes_b64",
    );
    if (encoded.decoded.length !== vkLength) {
      throw new Error("Verifying key inline bytes do not match vk_len.");
    }
    if (hashInlineVerifyingKey(inlineBackend, encoded.decoded) !== commitment) {
      throw new Error("Verifying key inline bytes do not match commitment.");
    }
    inlineKey = {
      backend: inlineBackend,
      bytes_b64: encoded.encoded,
    };
  }

  return {
    id: { backend, name },
    record: {
      version,
      circuit_id: requirePortableVerifierField(
        rawRecord.circuit_id,
        "Verifying key response.record.circuit_id",
      ),
      owner_manifest_id: requireNullablePortableField(
        rawRecord.owner_manifest_id,
        "Verifying key response.record.owner_manifest_id",
      ),
      namespace: requirePortableVerifierField(
        rawRecord.namespace,
        "Verifying key response.record.namespace",
      ),
      backend: engine as "halo2-ipa-pasta" | "stark",
      curve: expectedCurve,
      public_inputs_schema_hash: requireLowerHex32(
        rawRecord.public_inputs_schema_hash,
        "Verifying key response.record.public_inputs_schema_hash",
      ),
      commitment_hex: commitment,
      vk_len: vkLength,
      max_proof_bytes: requireUint32(
        rawRecord.max_proof_bytes,
        "Verifying key response.record.max_proof_bytes",
      ),
      gas_schedule_id: requireNullablePortableField(
        rawRecord.gas_schedule_id,
        "Verifying key response.record.gas_schedule_id",
      ),
      metadata_uri_cid: requirePortableContentUri(
        rawRecord.metadata_uri_cid,
        "Verifying key response.record.metadata_uri_cid",
      ),
      vk_bytes_cid: requirePortableContentUri(
        rawRecord.vk_bytes_cid,
        "Verifying key response.record.vk_bytes_cid",
      ),
      activation_height: activationHeight,
      withdraw_height: withdrawHeight,
      status,
      inline_key: inlineKey,
    },
    record_norito_base64: requireCanonicalBase64(
      response.record_norito_base64,
      "Verifying key response.record_norito_base64",
    ).encoded,
  };
};

const KAIGI_CALL_REQUIRED_FIELDS = [
  "call_id",
  "domain",
  "call_name",
  "host_account_id",
  "gas_rate_per_minute",
  "metadata",
  "privacy_mode",
  "room_policy",
  "participant_count",
  "commitment_count",
  "nullifier_count",
  "usage_commitment_count",
  "status",
  "created_at_ms",
  "total_duration_ms",
  "total_billed_gas",
  "segments_recorded",
] as const;

const KAIGI_CALL_OPTIONAL_FIELDS = [
  "billing_account_id",
  "title",
  "description",
  "max_participants",
  "scheduled_start_ms",
  "relay_manifest",
  "ended_at_ms",
] as const;

const normalizeKaigiIdentity = (
  value: Record<string, unknown>,
  label: string,
  expectedCallId: string,
): Readonly<{ call_id: string; domain: string; call_name: string }> => {
  const callId = requireKaigiCallId(value.call_id, `${label}.call_id`);
  const domain = requireCanonicalText(value.domain, `${label}.domain`, {
    maximumBytes: 127,
  });
  const callName = requireCanonicalText(value.call_name, `${label}.call_name`, {
    maximumBytes: 255,
  });
  if (callId !== `${domain}:${callName}` || callId !== expectedCallId) {
    throw new Error(`${label} identity does not match the requested call id.`);
  }
  return { call_id: callId, domain, call_name: callName };
};

const optionalOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const normalizeKaigiSecretBox = (
  payload: unknown,
  label: string,
): Record<string, unknown> => {
  const box = requireRecord(payload, label);
  requireExactKeys(
    box,
    [
      "schema",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ],
    [],
    label,
  );
  if (box.schema !== KAIGI_SECRET_BOX_SCHEMA_V1) {
    throw new Error(`${label}.schema is unsupported.`);
  }
  return {
    schema: KAIGI_SECRET_BOX_SCHEMA_V1,
    saltBase64Url: requireCanonicalBase64UrlBytes(
      box.saltBase64Url,
      `${label}.saltBase64Url`,
      { exactBytes: 16 },
    ),
    ivBase64Url: requireCanonicalBase64UrlBytes(
      box.ivBase64Url,
      `${label}.ivBase64Url`,
      { exactBytes: 12 },
    ),
    ciphertextBase64Url: requireCanonicalBase64UrlBytes(
      box.ciphertextBase64Url,
      `${label}.ciphertextBase64Url`,
      { maximumBytes: MAX_KAIGI_ENCRYPTED_PAYLOAD_BYTES },
    ),
    authTagBase64Url: requireCanonicalBase64UrlBytes(
      box.authTagBase64Url,
      `${label}.authTagBase64Url`,
      { exactBytes: 16 },
    ),
  };
};

const normalizeKaigiSealedBox = (
  payload: unknown,
  label: string,
): Record<string, unknown> => {
  const box = requireRecord(payload, label);
  requireExactKeys(
    box,
    [
      "schema",
      "ephemeralPublicKeyBase64Url",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ],
    [],
    label,
  );
  if (box.schema !== KAIGI_SEALED_BOX_SCHEMA_V1) {
    throw new Error(`${label}.schema is unsupported.`);
  }
  return {
    schema: KAIGI_SEALED_BOX_SCHEMA_V1,
    ephemeralPublicKeyBase64Url: requireCanonicalBase64UrlBytes(
      box.ephemeralPublicKeyBase64Url,
      `${label}.ephemeralPublicKeyBase64Url`,
      { exactBytes: 32 },
    ),
    saltBase64Url: requireCanonicalBase64UrlBytes(
      box.saltBase64Url,
      `${label}.saltBase64Url`,
      { exactBytes: 16 },
    ),
    ivBase64Url: requireCanonicalBase64UrlBytes(
      box.ivBase64Url,
      `${label}.ivBase64Url`,
      { exactBytes: 12 },
    ),
    ciphertextBase64Url: requireCanonicalBase64UrlBytes(
      box.ciphertextBase64Url,
      `${label}.ciphertextBase64Url`,
      { maximumBytes: MAX_KAIGI_ENCRYPTED_PAYLOAD_BYTES },
    ),
    authTagBase64Url: requireCanonicalBase64UrlBytes(
      box.authTagBase64Url,
      `${label}.authTagBase64Url`,
      { exactBytes: 16 },
    ),
  };
};

const normalizeKaigiCallMetadata = (
  payload: unknown,
  expectedCallId: string,
  expectedPrivacyMode: "transparent",
  scheduledStartMs: ToriiU64 | undefined,
): Record<string, unknown> => {
  const metadata = requireRecord(payload, "Kaigi call response.metadata");
  requireExactKeys(
    metadata,
    ["kaigi_call"],
    [],
    "Kaigi call response.metadata",
  );
  const callMetadata = requireRecord(
    metadata.kaigi_call,
    "Kaigi call response.metadata.kaigi_call",
  );
  requireExactKeys(
    callMetadata,
    [
      "schema",
      "meetingCode",
      "expiresAtMs",
      "live",
      "privacyMode",
      "encryptedOffer",
    ],
    [],
    "Kaigi call response.metadata.kaigi_call",
  );
  if (callMetadata.schema !== KAIGI_CALL_METADATA_SCHEMA_V2) {
    throw new Error(
      "Kaigi call response metadata schema is not the first-release schema.",
    );
  }
  const callName = expectedCallId.slice(expectedCallId.indexOf(":") + 1);
  const meetingCode = requireCanonicalText(
    callMetadata.meetingCode,
    "Kaigi call response.metadata.kaigi_call.meetingCode",
    { maximumBytes: 255 },
  );
  if (callName !== `kaigi-${meetingCode}`) {
    throw new Error(
      "Kaigi call response meetingCode does not match the requested call id.",
    );
  }
  const expiresAtMs = requireSafeInteger(
    callMetadata.expiresAtMs,
    "Kaigi call response.metadata.kaigi_call.expiresAtMs",
    { minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  );
  if (
    scheduledStartMs === undefined ||
    BigInt(expiresAtMs) !==
      BigInt(scheduledStartMs) + BigInt(KAIGI_MEETING_WINDOW_MS)
  ) {
    throw new Error(
      "Kaigi call response expiresAtMs must match its scheduled meeting window.",
    );
  }
  if (typeof callMetadata.live !== "boolean") {
    throw new Error(
      "Kaigi call response.metadata.kaigi_call.live must be a boolean.",
    );
  }
  if (callMetadata.privacyMode !== expectedPrivacyMode) {
    throw new Error(
      "Kaigi call response metadata privacyMode conflicts with privacy_mode.",
    );
  }
  return {
    kaigi_call: {
      schema: KAIGI_CALL_METADATA_SCHEMA_V2,
      meetingCode,
      expiresAtMs,
      live: callMetadata.live,
      privacyMode: expectedPrivacyMode,
      encryptedOffer: normalizeKaigiSecretBox(
        callMetadata.encryptedOffer,
        "Kaigi call response.metadata.kaigi_call.encryptedOffer",
      ),
    },
  };
};

export const normalizeFirstReleaseKaigiCall = (
  payload: unknown,
  requestedCallId: string,
): FirstReleaseKaigiCallView => {
  const expectedCallId = requireKaigiCallId(
    requestedCallId,
    "Requested Kaigi call id",
  );
  const response = requireRecord(payload, "Kaigi call response");
  requireExactKeys(
    response,
    KAIGI_CALL_REQUIRED_FIELDS,
    KAIGI_CALL_OPTIONAL_FIELDS,
    "Kaigi call response",
  );
  const identity = normalizeKaigiIdentity(
    response,
    "Kaigi call response",
    expectedCallId,
  );
  const privacyMode = response.privacy_mode;
  if (privacyMode !== "transparent") {
    throw new Error(
      "Kaigi call response.privacy_mode must be exactly transparent.",
    );
  }
  if (
    response.room_policy !== "public" &&
    response.room_policy !== "authenticated"
  ) {
    throw new Error("Kaigi call response.room_policy is unsupported.");
  }
  if (response.status !== "active" && response.status !== "ended") {
    throw new Error("Kaigi call response.status is unsupported.");
  }
  const scheduledStart = optionalOwn(response, "scheduled_start_ms")
    ? requireU64(
        response.scheduled_start_ms,
        "Kaigi call response.scheduled_start_ms",
      )
    : undefined;
  const metadata = normalizeKaigiCallMetadata(
    response.metadata,
    expectedCallId,
    privacyMode,
    scheduledStart,
  );

  const hasBilling = optionalOwn(response, "billing_account_id");

  const hasEndedAt = optionalOwn(response, "ended_at_ms");
  if (hasEndedAt !== (response.status === "ended")) {
    throw new Error("Kaigi call response.ended_at_ms conflicts with status.");
  }
  const createdAt = requireU64(
    response.created_at_ms,
    "Kaigi call response.created_at_ms",
  );
  const endedAt = hasEndedAt
    ? requireU64(response.ended_at_ms, "Kaigi call response.ended_at_ms")
    : undefined;
  if (endedAt !== undefined && BigInt(endedAt) < BigInt(createdAt)) {
    throw new Error("Kaigi call response ended_at_ms precedes created_at_ms.");
  }

  const maximumParticipants = optionalOwn(response, "max_participants")
    ? requireSafeInteger(
        response.max_participants,
        "Kaigi call response.max_participants",
        { minimum: 1, maximum: MAX_KAIGI_PARTICIPANTS },
      )
    : undefined;
  const effectiveMaximum = maximumParticipants ?? MAX_KAIGI_PARTICIPANTS;
  const participantCount = requireSafeInteger(
    response.participant_count,
    "Kaigi call response.participant_count",
    { minimum: 0, maximum: effectiveMaximum },
  );
  const commitmentCount = requireSafeInteger(
    response.commitment_count,
    "Kaigi call response.commitment_count",
    { minimum: 0, maximum: MAX_KAIGI_PARTICIPANTS },
  );
  const nullifierCount = requireSafeInteger(
    response.nullifier_count,
    "Kaigi call response.nullifier_count",
    { minimum: 0, maximum: MAX_KAIGI_NULLIFIERS },
  );

  let relayManifest: Record<string, unknown> | undefined;
  if (optionalOwn(response, "relay_manifest")) {
    relayManifest = requireRecord(
      response.relay_manifest,
      "Kaigi call response.relay_manifest",
    );
  }

  return {
    ...identity,
    host_account_id: requireCanonicalAccountText(
      response.host_account_id,
      "Kaigi call response.host_account_id",
    ),
    ...(hasBilling
      ? {
          billing_account_id: requireCanonicalAccountText(
            response.billing_account_id,
            "Kaigi call response.billing_account_id",
          ),
        }
      : {}),
    ...(optionalOwn(response, "title")
      ? {
          title: requireCanonicalText(
            response.title,
            "Kaigi call response.title",
            {
              maximumBytes: MAX_HUMAN_TEXT_BYTES,
              allowEmpty: true,
            },
          ),
        }
      : {}),
    ...(optionalOwn(response, "description")
      ? {
          description: requireCanonicalText(
            response.description,
            "Kaigi call response.description",
            { maximumBytes: MAX_HUMAN_TEXT_BYTES, allowEmpty: true },
          ),
        }
      : {}),
    ...(maximumParticipants === undefined
      ? {}
      : { max_participants: maximumParticipants }),
    gas_rate_per_minute: requireU64(
      response.gas_rate_per_minute,
      "Kaigi call response.gas_rate_per_minute",
    ),
    metadata,
    ...(scheduledStart === undefined
      ? {}
      : { scheduled_start_ms: scheduledStart }),
    privacy_mode: privacyMode,
    room_policy: response.room_policy,
    ...(relayManifest === undefined ? {} : { relay_manifest: relayManifest }),
    participant_count: participantCount,
    commitment_count: commitmentCount,
    nullifier_count: nullifierCount,
    usage_commitment_count: requireSafeInteger(
      response.usage_commitment_count,
      "Kaigi call response.usage_commitment_count",
      { minimum: 0, maximum: MAX_KAIGI_PARTICIPANTS },
    ),
    status: response.status,
    created_at_ms: createdAt,
    ...(endedAt === undefined ? {} : { ended_at_ms: endedAt }),
    total_duration_ms: requireU64(
      response.total_duration_ms,
      "Kaigi call response.total_duration_ms",
    ),
    total_billed_gas: requireU64(
      response.total_billed_gas,
      "Kaigi call response.total_billed_gas",
    ),
    segments_recorded: requireUint32(
      response.segments_recorded,
      "Kaigi call response.segments_recorded",
    ),
  };
};

const normalizeKaigiSignalMetadata = (
  payload: unknown,
  expectedCallId: string,
  expectedCreatedAt: ToriiU64,
  identities: Readonly<{
    authority: string;
    hostAccountId: string;
    participantAccountId: string;
  }>,
  label: string,
): { schema: typeof KAIGI_SIGNAL_SCHEMA_V1 } & Record<string, unknown> => {
  const metadata = requireRecord(payload, label);
  requireExactKeys(
    metadata,
    [
      "schema",
      "callId",
      "signalKind",
      "hostAccountId",
      "participantAccountId",
      "createdAtMs",
      "encryptedSignal",
    ],
    [],
    label,
  );
  if (metadata.schema !== KAIGI_SIGNAL_SCHEMA_V1) {
    throw new Error(`${label}.schema is not the first-release schema.`);
  }
  const callId = requireKaigiCallId(metadata.callId, `${label}.callId`);
  if (callId !== expectedCallId) {
    throw new Error(`${label}.callId is cross-wired.`);
  }
  if (metadata.signalKind !== "answer") {
    throw new Error(`${label}.signalKind must be answer.`);
  }
  const createdAtMs = requireSafeInteger(
    metadata.createdAtMs,
    `${label}.createdAtMs`,
    { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  );
  if (BigInt(createdAtMs) !== BigInt(expectedCreatedAt)) {
    throw new Error(`${label}.createdAtMs conflicts with created_at_ms.`);
  }

  const hostAccountId = requireCanonicalAccountText(
    metadata.hostAccountId,
    `${label}.hostAccountId`,
  );
  const participantAccountId = requireCanonicalAccountText(
    metadata.participantAccountId,
    `${label}.participantAccountId`,
  );
  if (
    hostAccountId !== identities.hostAccountId ||
    participantAccountId !== identities.participantAccountId ||
    participantAccountId !== identities.authority
  ) {
    throw new Error(`${label} identities do not match the signal carrier.`);
  }

  return {
    schema: KAIGI_SIGNAL_SCHEMA_V1,
    callId,
    signalKind: "answer",
    hostAccountId,
    participantAccountId,
    createdAtMs,
    encryptedSignal: normalizeKaigiSealedBox(
      metadata.encryptedSignal,
      `${label}.encryptedSignal`,
    ),
  };
};

const normalizeKaigiSignal = (
  payload: unknown,
  expectedCallId: string,
  label: string,
) => {
  const response = requireRecord(payload, label);
  requireExactKeys(
    response,
    [
      "entrypoint_hash",
      "authority",
      "timestamp_ms",
      "call_id",
      "signal_kind",
      "host_account_id",
      "participant_account_id",
      "created_at_ms",
      "metadata",
    ],
    [],
    label,
  );
  const callId = requireKaigiCallId(response.call_id, `${label}.call_id`);
  if (callId !== expectedCallId) {
    throw new Error(`${label}.call_id does not match the requested call id.`);
  }
  const timestamp = requireU64(response.timestamp_ms, `${label}.timestamp_ms`);
  const createdAt = requireU64(
    response.created_at_ms,
    `${label}.created_at_ms`,
  );
  if (BigInt(createdAt) > BigInt(timestamp)) {
    throw new Error(`${label}.created_at_ms exceeds timestamp_ms.`);
  }
  const signalKind = requireCanonicalText(
    response.signal_kind,
    `${label}.signal_kind`,
    { maximumBytes: 256 },
  );
  if (signalKind !== "answer") {
    throw new Error(`${label}.signal_kind must be answer.`);
  }

  const authority = requireCanonicalAccountText(
    response.authority,
    `${label}.authority`,
  );
  const hostAccountId = requireCanonicalAccountText(
    response.host_account_id,
    `${label}.host_account_id`,
  );
  const participantAccountId = requireCanonicalAccountText(
    response.participant_account_id,
    `${label}.participant_account_id`,
  );
  const metadata = normalizeKaigiSignalMetadata(
    response.metadata,
    expectedCallId,
    createdAt,
    { authority, hostAccountId, participantAccountId },
    `${label}.metadata`,
  );

  return {
    entrypoint_hash: requireMarkedHash(
      response.entrypoint_hash,
      `${label}.entrypoint_hash`,
    ),
    authority,
    timestamp_ms: timestamp,
    call_id: callId,
    signal_kind: signalKind,
    host_account_id: hostAccountId,
    participant_account_id: participantAccountId,
    created_at_ms: createdAt,
    metadata,
  };
};

export const normalizeFirstReleaseKaigiCallSignals = (
  payload: unknown,
  requestedCallId: string,
): KaigiCallSignalsList => {
  const expectedCallId = requireKaigiCallId(
    requestedCallId,
    "Requested Kaigi call id",
  );
  const response = requireRecord(payload, "Kaigi call signals response");
  requireExactKeys(
    response,
    ["has_more", "items"],
    ["next_cursor"],
    "Kaigi call signals response",
  );
  if (typeof response.has_more !== "boolean") {
    throw new Error("Kaigi call signals response.has_more must be a boolean.");
  }
  const hasCursor = optionalOwn(response, "next_cursor");
  if (hasCursor !== response.has_more) {
    throw new Error(
      "Kaigi call signals response.next_cursor presence must match has_more.",
    );
  }
  const rawItems = requireDenseArray(
    response.items,
    "Kaigi call signals response.items",
  );
  if (rawItems.length > MAX_KAIGI_SIGNAL_ITEMS) {
    throw new Error("Kaigi call signals response contains too many items.");
  }
  const items = rawItems.map((item, index) =>
    normalizeKaigiSignal(
      item,
      expectedCallId,
      `Kaigi call signals response.items[${index}]`,
    ),
  );
  if (
    new Set(items.map((item) => item.entrypoint_hash)).size !== items.length
  ) {
    throw new Error(
      "Kaigi call signals response contains duplicate entrypoint hashes.",
    );
  }
  return {
    has_more: response.has_more,
    ...(hasCursor
      ? {
          next_cursor: requireCanonicalBase64Url(
            response.next_cursor,
            "Kaigi call signals response.next_cursor",
          ),
        }
      : {}),
    items,
  };
};

export const normalizeFirstReleaseKaigiCallEvent = (
  payload: unknown,
  requestedCallId: string,
): KaigiCallEventPayload => {
  const expectedCallId = requireKaigiCallId(
    requestedCallId,
    "Requested Kaigi call id",
  );
  const response = requireRecord(payload, "Kaigi call event");
  const kind = response.kind;
  if (kind !== "roster_updated" && kind !== "ended") {
    throw new Error("Kaigi call event.kind is unsupported.");
  }
  const required =
    kind === "ended"
      ? (["kind", "call", "status", "ended_at_ms"] as const)
      : ([
          "kind",
          "call",
          "privacy_mode",
          "participant_count",
          "commitment_count",
          "nullifier_count",
        ] as const);
  const optional = kind === "ended" ? ([] as const) : ([] as const);
  requireExactKeys(response, required, optional, "Kaigi call event");

  const call = requireRecord(response.call, "Kaigi call event.call");
  requireExactKeys(
    call,
    ["call_id", "domain", "call_name"],
    [],
    "Kaigi call event.call",
  );
  const identity = normalizeKaigiIdentity(
    call,
    "Kaigi call event.call",
    expectedCallId,
  );

  if (kind === "ended") {
    if (response.status !== "ended") {
      throw new Error("Kaigi ended event.status must be ended.");
    }
    return {
      kind,
      call: identity,
      status: "ended",
      ended_at_ms: requireU64(
        response.ended_at_ms,
        "Kaigi call event.ended_at_ms",
      ),
    };
  }

  const privacyMode = response.privacy_mode;
  if (privacyMode !== "transparent") {
    throw new Error(
      "Kaigi roster event.privacy_mode must be exactly transparent.",
    );
  }
  return {
    kind,
    call: identity,
    privacy_mode: privacyMode,
    participant_count: requireSafeInteger(
      response.participant_count,
      "Kaigi call event.participant_count",
      { minimum: 0, maximum: MAX_KAIGI_PARTICIPANTS },
    ),
    commitment_count: requireSafeInteger(
      response.commitment_count,
      "Kaigi call event.commitment_count",
      { minimum: 0, maximum: MAX_KAIGI_PARTICIPANTS },
    ),
    nullifier_count: requireSafeInteger(
      response.nullifier_count,
      "Kaigi call event.nullifier_count",
      { minimum: 0, maximum: MAX_KAIGI_NULLIFIERS },
    ),
  };
};

import { Buffer } from "node:buffer";

import { NetworkId } from "@iroha/iroha-js/canonical-request";

import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { nodeFetch } from "./nodeFetch";
import { readBoundedResponseBytes } from "./boundedJsonResponse";
import type { FirstReleaseAuthorityFeeQuoteResponse } from "./firstReleaseFeeQuoteResponse";
import { parseStrictJson } from "./secureBoundedJson";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import { requireFirstReleaseInputArray } from "./firstReleaseReadInput";
import { requireFirstReleaseJsonObject } from "./firstReleaseResourceLimits";

const EMPTY_AUTHORITY_FEE_PAYMENT_JSON =
  '{"payer":"authority","value":{"charge_limits":[],"gas_limit":null}}';
const MAX_PIPELINE_TRANSACTION_BYTES = 16 * 1024 * 1024;
const MAX_PIPELINE_RECEIPT_BYTES = 64 * 1024;
const MAX_TRANSACTION_JSON_BYTES = 16 * 1024 * 1024;
const MAX_TRANSACTION_INSTRUCTIONS = 64;
const issuedAuthorityDrafts = new WeakSet<object>();

type JsonObject = Record<string, unknown>;

type FirstReleaseTransactionNativeBinding = Readonly<{
  buildTransactionPayload(
    networkId: Uint8Array,
    authority: string,
    instructions: readonly string[],
    feePaymentJson: string,
    metadataJson: string | null,
    creationTimeMs: number | null,
    ttlMs: number | null,
    nonce: number | null,
  ): unknown;
  signQuotedTransactionPayload(
    networkId: Uint8Array,
    payloadJson: string,
    quotedFeePaymentJson: string,
    privateKey: Buffer,
    privateKeyAlgorithm: string | null,
  ): unknown;
  encodeSignedTransactionVersioned(payload: Buffer): Uint8Array;
  hashSignedTransaction(payload: Buffer): Uint8Array;
}>;

export type FirstReleaseAuthorityTransactionDraft = Readonly<{
  authority: string;
  payload: JsonObject;
  payloadJson: string;
  payloadBytes: Buffer;
  payloadHash: Buffer;
}>;

export type FirstReleaseSignedTransaction = Readonly<{
  signedTransaction: Buffer;
  hash: Buffer;
}>;

export type FirstReleaseTransactionSubmission = Readonly<{
  status: 200 | 201 | 202 | 204;
  receiptBytes: Buffer | null;
}>;

const isRecord = (value: unknown): value is JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireBoundedJsonObject = (
  serialized: string,
  label: string,
): JsonObject => {
  if (
    serialized.length === 0 ||
    Buffer.byteLength(serialized, "utf8") > MAX_TRANSACTION_JSON_BYTES
  ) {
    throw new TypeError(`${label} exceeds the first-release JSON limit.`);
  }
  const parsed = parseStrictJson(serialized, label);
  if (!isRecord(parsed)) {
    throw new TypeError(`${label} must encode a JSON object.`);
  }
  return parsed;
};

const deepFreezeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    value.forEach(deepFreezeJson);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreezeJson);
    return Object.freeze(value);
  }
  return value;
};

const requireExactNetworkId = (value: unknown, label: string): NetworkId => {
  if (!(value instanceof NetworkId)) {
    throw new TypeError(`${label} must be an exact NetworkId.`);
  }
  const bytes = value.toBytes();
  if (bytes.length !== NetworkId.BYTE_LENGTH || (bytes.at(-1)! & 1) === 0) {
    throw new TypeError(`${label} is not a canonical marked NetworkId.`);
  }
  return value;
};

const requireOptionalSafeInteger = (
  value: unknown,
  label: string,
  options: Readonly<{ positive?: boolean; maximum?: number }> = {},
): number | null => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (options.positive === true ? 1 : 0) ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    throw new TypeError(
      `${label} must be ${options.positive === true ? "a positive" : "a non-negative"} safe integer when provided.`,
    );
  }
  return value;
};

const serializeInstructions = (
  instructions: readonly (object | string)[],
): string[] => {
  const snapshot = requireFirstReleaseInputArray(
    instructions,
    "instructions",
    MAX_TRANSACTION_INSTRUCTIONS,
  );
  if (snapshot.length === 0) {
    throw new TypeError("instructions must be a non-empty array.");
  }
  return snapshot.map((instruction, index) => {
    if (typeof instruction === "string") {
      if (!instruction || instruction.trim() !== instruction) {
        throw new TypeError(
          `instructions[${index}] must be exact non-empty JSON text.`,
        );
      }
      requireBoundedJsonObject(instruction, `instructions[${index}]`);
      return instruction;
    }
    if (!isRecord(instruction)) {
      throw new TypeError(
        `instructions[${index}] must be a plain instruction object or exact JSON text.`,
      );
    }
    const serialized = JSON.stringify(
      requireFirstReleaseJsonObject(
        instruction,
        `instructions[${index}]`,
        MAX_TRANSACTION_JSON_BYTES,
      ),
    );
    if (!serialized) {
      throw new TypeError(`instructions[${index}] is not finite JSON data.`);
    }
    requireBoundedJsonObject(serialized, `instructions[${index}]`);
    return serialized;
  });
};

const serializeMetadata = (
  metadata: Readonly<JsonObject> | string | null | undefined,
): string | null => {
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata === "string") {
    if (!metadata || metadata.trim() !== metadata) {
      throw new TypeError("metadata must be exact non-empty JSON text.");
    }
    requireBoundedJsonObject(metadata, "metadata");
    return metadata;
  }
  if (!isRecord(metadata)) {
    throw new TypeError("metadata must be a plain object or exact JSON text.");
  }
  const serialized = JSON.stringify(
    requireFirstReleaseJsonObject(
      metadata,
      "metadata",
      MAX_TRANSACTION_JSON_BYTES,
    ),
  );
  requireBoundedJsonObject(serialized, "metadata");
  return serialized;
};

const requireNativeBinding = (): FirstReleaseTransactionNativeBinding => {
  const candidate =
    getInstalledIrohaJsNativeBinding() ??
    installGlobalIrohaJsNativeBinding(import.meta.url);
  if (
    !candidate ||
    typeof candidate.buildTransactionPayload !== "function" ||
    typeof candidate.signQuotedTransactionPayload !== "function" ||
    typeof candidate.encodeSignedTransactionVersioned !== "function" ||
    typeof candidate.hashSignedTransaction !== "function"
  ) {
    throw new Error(
      "The reviewed Iroha native binding is missing first-release transaction support.",
    );
  }
  return candidate as FirstReleaseTransactionNativeBinding;
};

const requireNativeBytes = (
  value: unknown,
  label: string,
  options: Readonly<{ exactBytes?: number; maximumBytes?: number }> = {},
): Buffer => {
  const bytes =
    value instanceof ArrayBuffer
      ? Buffer.from(value)
      : Buffer.isBuffer(value) || ArrayBuffer.isView(value)
        ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (bytes === null) throw new Error(`${label} did not return bytes.`);
  if (
    bytes.length === 0 ||
    (options.exactBytes !== undefined && bytes.length !== options.exactBytes) ||
    (options.maximumBytes !== undefined && bytes.length > options.maximumBytes)
  ) {
    throw new Error(`${label} returned bytes outside the first-release limit.`);
  }
  return Buffer.from(bytes);
};

const requireNativeDraft = (
  value: unknown,
  authority: string,
): FirstReleaseAuthorityTransactionDraft => {
  if (!isRecord(value)) {
    throw new Error("Native transaction draft did not return an object.");
  }
  const keys = Object.keys(value).sort();
  const expected = ["payloadBytes", "payloadHash", "payloadJson"];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      "Native transaction draft returned an unexpected response shape.",
    );
  }
  if (typeof value.payloadJson !== "string" || !value.payloadJson) {
    throw new Error("Native transaction draft did not return payload JSON.");
  }
  const payload = requireBoundedJsonObject(
    value.payloadJson,
    "Native transaction draft payload",
  );
  deepFreezeJson(payload);
  const draft: FirstReleaseAuthorityTransactionDraft = Object.freeze({
    authority,
    payload: Object.freeze(payload),
    payloadJson: value.payloadJson,
    payloadBytes: requireNativeBytes(
      value.payloadBytes,
      "Native transaction draft payload",
      { maximumBytes: MAX_PIPELINE_TRANSACTION_BYTES },
    ),
    payloadHash: requireNativeBytes(
      value.payloadHash,
      "Native transaction draft hash",
      { exactBytes: 32 },
    ),
  });
  issuedAuthorityDrafts.add(draft);
  return draft;
};

/**
 * Freeze one exact unsigned, authority-paid transaction through the reviewed
 * native codec. No sponsor or unquoted fee limits can enter this boundary.
 */
export const buildFirstReleaseAuthorityTransactionDraft = (input: {
  networkId: NetworkId;
  networkPrefix: number;
  authority: string;
  instructions: readonly (object | string)[];
  metadata?: Readonly<JsonObject> | string | null;
  creationTimeMs?: number | null;
  ttlMs?: number | null;
  nonce?: number | null;
}): FirstReleaseAuthorityTransactionDraft => {
  const networkId = requireExactNetworkId(input.networkId, "networkId");
  const authority = normalizeCanonicalAccountIdLiteral(
    input.authority,
    "authority",
    input.networkPrefix,
  );
  const result = requireNativeBinding().buildTransactionPayload(
    networkId.toBytes(),
    authority,
    serializeInstructions(input.instructions),
    EMPTY_AUTHORITY_FEE_PAYMENT_JSON,
    serializeMetadata(input.metadata),
    requireOptionalSafeInteger(input.creationTimeMs, "creationTimeMs"),
    requireOptionalSafeInteger(input.ttlMs, "ttlMs", { positive: true }),
    requireOptionalSafeInteger(input.nonce, "nonce", {
      maximum: 0xffff_ffff,
    }),
  );
  return requireNativeDraft(result, authority);
};

/** Sign only the exact native draft with the exact accepted authority quote. */
export const signFirstReleaseAuthorityTransaction = (input: {
  networkId: NetworkId;
  draft: FirstReleaseAuthorityTransactionDraft;
  quote: FirstReleaseAuthorityFeeQuoteResponse;
  privateKey: Buffer | ArrayBuffer | ArrayBufferView;
  privateKeyAlgorithm?: string | null;
}): FirstReleaseSignedTransaction => {
  const networkId = requireExactNetworkId(input.networkId, "networkId");
  if (
    !input.draft ||
    typeof input.draft.payloadJson !== "string" ||
    !issuedAuthorityDrafts.has(input.draft)
  ) {
    throw new TypeError("draft must be a first-release transaction draft.");
  }
  if (
    !input.quote ||
    input.quote.intent?.payer !== "authority" ||
    input.quote.decision?.status !== "accepted"
  ) {
    throw new TypeError(
      "quote must be an accepted first-release authority fee quote.",
    );
  }
  if (
    input.quote.decision.value.program_revision !== null ||
    input.quote.decision.value.debit_source.kind !== "account" ||
    input.quote.decision.value.debit_source.value !== input.draft.authority
  ) {
    throw new TypeError(
      "quote must debit the exact first-release transaction authority.",
    );
  }
  const privateKey = requireNativeBytes(input.privateKey, "privateKey", {
    maximumBytes: 16 * 1024,
  });
  const privateKeyAlgorithm = input.privateKeyAlgorithm ?? null;
  try {
    if (
      privateKeyAlgorithm !== null &&
      (typeof privateKeyAlgorithm !== "string" ||
        !privateKeyAlgorithm ||
        privateKeyAlgorithm.trim() !== privateKeyAlgorithm)
    ) {
      throw new TypeError("privateKeyAlgorithm must be exact non-empty text.");
    }
    const result = requireNativeBinding().signQuotedTransactionPayload(
      networkId.toBytes(),
      input.draft.payloadJson,
      JSON.stringify(input.quote.intent),
      privateKey,
      privateKeyAlgorithm,
    );
    if (!isRecord(result)) {
      throw new Error("Native transaction signer did not return an object.");
    }
    const keys = Object.keys(result).sort();
    const expected = ["hash", "signedTransaction"];
    if (
      keys.length !== expected.length ||
      keys.some((key, index) => key !== expected[index])
    ) {
      throw new Error(
        "Native transaction signer returned an unexpected response shape.",
      );
    }
    const signedTransaction = encodeFirstReleaseVersionedSignedTransaction(
      requireNativeBytes(
        result.signedTransaction,
        "Native signed transaction",
        {
          maximumBytes: MAX_PIPELINE_TRANSACTION_BYTES,
        },
      ),
    );
    const hash = requireNativeBytes(result.hash, "Native transaction hash", {
      exactBytes: 32,
    });
    const recomputedHash = hashFirstReleaseSignedTransaction(signedTransaction);
    if (!hash.equals(recomputedHash)) {
      throw new Error(
        "Native transaction signer returned a hash that does not match the signed transaction.",
      );
    }
    return { signedTransaction, hash };
  } finally {
    // The signer receives an isolated copy so this boundary owns and wipes it
    // on every success and failure path without mutating the caller's buffer.
    privateKey.fill(0);
  }
};

/** Require exact canonical VersionedSignedTransaction V1 bytes. */
export const encodeFirstReleaseVersionedSignedTransaction = (
  input: Buffer | ArrayBuffer | ArrayBufferView,
): Buffer => {
  const transaction = requireNativeBytes(input, "Signed transaction", {
    maximumBytes: MAX_PIPELINE_TRANSACTION_BYTES,
  });
  const encoded = requireNativeBytes(
    requireNativeBinding().encodeSignedTransactionVersioned(transaction),
    "Native VersionedSignedTransaction encoder",
    { maximumBytes: MAX_PIPELINE_TRANSACTION_BYTES },
  );
  if (encoded[0] !== 1 || !encoded.equals(transaction)) {
    throw new Error(
      "Signed transaction is not the exact canonical VersionedSignedTransaction V1 encoding.",
    );
  }
  return encoded;
};

/** Hash only an exact canonical VersionedSignedTransaction V1 wire. */
export const hashFirstReleaseSignedTransaction = (
  input: Buffer | ArrayBuffer | ArrayBufferView,
): Buffer => {
  const transaction = encodeFirstReleaseVersionedSignedTransaction(input);
  return requireNativeBytes(
    requireNativeBinding().hashSignedTransaction(transaction),
    "Native signed transaction hash",
    { exactBytes: 32 },
  );
};

const resolveHttpsToriiOrigin = (value: string): string => {
  const normalized = normalizeEndpointUrl(value);
  const endpoint = new URL(normalized);
  if (endpoint.protocol !== "https:") {
    throw new Error("First-release transaction submission requires HTTPS.");
  }
  if (endpoint.pathname !== "/") {
    throw new Error(
      "First-release transaction submission requires an origin-only Torii URL.",
    );
  }
  return endpoint.origin;
};

/** Submit once to the sole first-release pipeline ingress, without redirects. */
export const submitFirstReleaseTransaction = async (input: {
  toriiUrl: string;
  signedTransaction: Buffer | ArrayBuffer | ArrayBufferView;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<FirstReleaseTransactionSubmission> => {
  const origin = resolveHttpsToriiOrigin(input.toriiUrl);
  const body = encodeFirstReleaseVersionedSignedTransaction(
    input.signedTransaction,
  );
  const response = await (input.fetchImpl ?? nodeFetch)(
    new URL("/v1/pipeline/transactions", `${origin}/`),
    {
      method: "POST",
      headers: {
        Accept: "application/x-norito, application/json",
        "Content-Type": "application/x-norito",
      },
      body: Uint8Array.from(body),
      redirect: "error",
      signal: input.signal,
    },
  );
  if (
    response.status !== 200 &&
    response.status !== 201 &&
    response.status !== 202 &&
    response.status !== 204
  ) {
    const errorBody = await readBoundedResponseBytes(response, {
      label: "Transaction submission error response",
      maximumBytes: MAX_PIPELINE_RECEIPT_BYTES,
      allowEmpty: true,
    });
    const detail = errorBody.length
      ? `: ${errorBody.toString("utf8").slice(0, 512)}`
      : "";
    throw new Error(
      `Transaction submission failed with HTTP ${response.status}${detail}`,
    );
  }
  const receiptBytes = await readBoundedResponseBytes(response, {
    label: "Transaction submission receipt",
    maximumBytes: MAX_PIPELINE_RECEIPT_BYTES,
    allowEmpty: true,
  });
  return {
    status: response.status as 200 | 201 | 202 | 204,
    receiptBytes: receiptBytes.length > 0 ? receiptBytes : null,
  };
};

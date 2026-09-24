import { isDeepStrictEqual, types } from "node:util";
import { performance } from "node:perf_hooks";

const CANONICAL_IROHA_HASH_HEX = /^[0-9a-f]{63}[13579bdf]$/u;
const CANONICAL_HEX_BYTES = /^(?:[0-9a-f]{2})+$/u;
const PIPELINE_STATUS_KINDS = new Set([
  "Queued",
  "Approved",
  "Committed",
  "Applied",
  "Rejected",
  "Expired",
]);
const TERMINAL_FAILURE_KINDS = new Set(["Rejected", "Expired"]);
const TRANSACTION_EXECUTABLE_KINDS = new Set([
  "Instructions",
  "ContractCall",
  "Ivm",
  "IvmProved",
  "Batch",
]);
const MAX_PIPELINE_STATUS_JSON_BYTES = 64 * 1024;
const MAX_EXPLORER_TRANSACTION_JSON_BYTES = 16 * 1024 * 1024;
const MAX_EXPLORER_EVIDENCE_JSON_BYTES = 64 * 1024;
const MAX_TRANSACTION_TEXT_BYTES = 128 * 1024;
const MAX_FINALITY_POLL_ATTEMPTS = 2_048;
const MAX_JSON_NESTING_DEPTH = 64;
const MAX_JSON_CONTAINER_ENTRIES = 65_536;
const MAX_JSON_TOTAL_VALUES = 262_144;

type JsonRecord = Record<string, unknown>;

export type TransactionFinalityProof = {
  status: "finalized";
  transactionHash: string;
  blockHeight: number;
  blockHash: string;
  finalizedBlockHeight: number;
};

export type ParsedPipelineStatus = {
  kind:
    | "Queued"
    | "Approved"
    | "Committed"
    | "Applied"
    | "Rejected"
    | "Expired";
  resolvedFrom: "queue" | "cache" | "state";
  blockHeight: number | null;
  payload: JsonRecord;
};

export type FinalizedTransactionEvidence = {
  proof: TransactionFinalityProof;
  statusPayload: JsonRecord;
  transactionPayload: JsonRecord;
};

export class TransactionFinalityIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionFinalityIntegrityError";
  }
}

export class TransactionFinalityTerminalError extends Error {
  readonly statusKind: string;
  readonly payload: unknown;

  constructor(hashHex: string, statusKind: string, payload: unknown) {
    super(
      `Transaction ${hashHex} reached terminal ${statusKind} before finalized success.`,
    );
    this.name = "TransactionFinalityTerminalError";
    this.statusKind = statusKind;
    this.payload = payload;
  }
}

class TransactionFinalityPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionFinalityPendingError";
  }
}

const requireRecord = (value: unknown, label: string): JsonRecord => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    types.isProxy(value)
  ) {
    throw new TransactionFinalityIntegrityError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a plain JSON object.`,
    );
  }
  return value as JsonRecord;
};

const requireExactFields = (
  value: JsonRecord,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  label: string,
): void => {
  const allowed = new Set([...requiredFields, ...optionalFields]);
  let fieldCount = 0;
  for (const field in value) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      throw new TransactionFinalityIntegrityError(
        `${label} contains missing or unknown fields.`,
      );
    }
    fieldCount += 1;
    if (fieldCount > allowed.size || !allowed.has(field)) {
      throw new TransactionFinalityIntegrityError(
        `${label} contains missing or unknown fields.`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor)) {
      throw new TransactionFinalityIntegrityError(
        `${label} contains missing or unknown fields.`,
      );
    }
  }
  if (
    requiredFields.some((field) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw new TransactionFinalityIntegrityError(
      `${label} contains missing or unknown fields.`,
    );
  }
};

type BoundedJsonState = {
  bytes: number;
  values: number;
  readonly maximumBytes: number;
  readonly label: string;
  readonly ancestors: WeakSet<object>;
};

const throwInvalidJson = (label: string): never => {
  throw new TransactionFinalityIntegrityError(
    `${label} must be finite JSON data.`,
  );
};

const addJsonBytes = (state: BoundedJsonState, bytes: number): void => {
  if (bytes > state.maximumBytes - state.bytes) {
    throw new TransactionFinalityIntegrityError(
      `${state.label} exceeds the ${state.maximumBytes}-byte first-release limit.`,
    );
  }
  state.bytes += bytes;
};

const addJsonStringBytes = (state: BoundedJsonState, value: string): void => {
  addJsonBytes(state, 2);
  if (value.length > state.maximumBytes - state.bytes) {
    throw new TransactionFinalityIntegrityError(
      `${state.label} exceeds the ${state.maximumBytes}-byte first-release limit.`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      addJsonBytes(state, 2);
    } else if (
      codeUnit === 0x08 ||
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0c ||
      codeUnit === 0x0d
    ) {
      addJsonBytes(state, 2);
    } else if (codeUnit < 0x20) {
      addJsonBytes(state, 6);
    } else if (codeUnit < 0x80) {
      addJsonBytes(state, 1);
    } else if (codeUnit < 0x800) {
      addJsonBytes(state, 2);
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        addJsonBytes(state, 4);
        index += 1;
      } else {
        addJsonBytes(state, 6);
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      addJsonBytes(state, 6);
    } else {
      addJsonBytes(state, 3);
    }
  }
};

const requireJsonContainer = (
  value: object,
  state: BoundedJsonState,
  depth: number,
): void => {
  if (
    types.isProxy(value) ||
    depth > MAX_JSON_NESTING_DEPTH ||
    state.ancestors.has(value)
  ) {
    return throwInvalidJson(state.label);
  }
  state.ancestors.add(value);
};

const cloneBoundedJsonValue = (
  value: unknown,
  state: BoundedJsonState,
  depth: number,
): unknown => {
  state.values += 1;
  if (state.values > MAX_JSON_TOTAL_VALUES) {
    throwInvalidJson(state.label);
  }
  if (value === null) {
    addJsonBytes(state, 4);
    return null;
  }
  if (typeof value === "string") {
    addJsonStringBytes(state, value);
    return value;
  }
  if (typeof value === "boolean") {
    addJsonBytes(state, value ? 4 : 5);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      return throwInvalidJson(state.label);
    }
    addJsonBytes(state, String(value).length);
    return value;
  }
  if (value === null || typeof value !== "object") {
    return throwInvalidJson(state.label);
  }

  const container = value as object;
  requireJsonContainer(container, state, depth);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return throwInvalidJson(state.label);
      }
      if (
        value.length > MAX_JSON_CONTAINER_ENTRIES ||
        value.length > state.maximumBytes - state.bytes
      ) {
        return throwInvalidJson(state.label);
      }
      let enumerableCount = 0;
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          return throwInvalidJson(state.label);
        }
        enumerableCount += 1;
        if (enumerableCount > value.length) {
          return throwInvalidJson(state.label);
        }
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= value.length ||
          String(index) !== key
        ) {
          return throwInvalidJson(state.label);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) {
          return throwInvalidJson(state.label);
        }
      }
      if (enumerableCount !== value.length) {
        return throwInvalidJson(state.label);
      }
      addJsonBytes(state, 2);
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          return throwInvalidJson(state.label);
        }
        if (index > 0) {
          addJsonBytes(state, 1);
        }
        clone.push(cloneBoundedJsonValue(descriptor.value, state, depth + 1));
      }
      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return throwInvalidJson(state.label);
    }
    addJsonBytes(state, 2);
    const clone: JsonRecord = {};
    let entryCount = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return throwInvalidJson(state.label);
      }
      entryCount += 1;
      if (entryCount > MAX_JSON_CONTAINER_ENTRIES) {
        return throwInvalidJson(state.label);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return throwInvalidJson(state.label);
      }
      if (entryCount > 1) {
        addJsonBytes(state, 1);
      }
      addJsonStringBytes(state, key);
      addJsonBytes(state, 1);
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: cloneBoundedJsonValue(descriptor.value, state, depth + 1),
        writable: true,
      });
    }
    return Object.freeze(clone);
  } finally {
    state.ancestors.delete(container);
  }
};

const requireBoundedJson = <T>(
  value: T,
  maximumBytes: number,
  label: string,
): T => {
  try {
    return cloneBoundedJsonValue(
      value,
      {
        bytes: 0,
        values: 0,
        maximumBytes,
        label,
        ancestors: new WeakSet<object>(),
      },
      0,
    ) as T;
  } catch (error) {
    if (error instanceof TransactionFinalityIntegrityError) {
      throw error;
    }
    return throwInvalidJson(label);
  }
};

const requireExactBoundedRecord = (
  value: unknown,
  maximumBytes: number,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  label: string,
): JsonRecord => {
  const record = requireRecord(value, label);
  requireExactFields(record, requiredFields, optionalFields, label);
  return requireBoundedJson(record, maximumBytes, label);
};

const requireCanonicalHash = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !CANONICAL_IROHA_HASH_HEX.test(value)) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a canonical lowercase 32-byte Iroha hash with its marker set.`,
    );
  }
  return value;
};

const requireCanonicalText = (
  value: unknown,
  label: string,
  maximumBytes: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be bounded canonical non-empty text.`,
    );
  }
  return value;
};

const requireCanonicalHexBytes = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length > MAX_TRANSACTION_TEXT_BYTES * 2 ||
    !CANONICAL_HEX_BYTES.test(value)
  ) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be bounded canonical lowercase hexadecimal bytes.`,
    );
  }
  return value;
};

const requireCanonicalUtcTimestamp = (
  value: unknown,
  label: string,
): string => {
  const timestamp = requireCanonicalText(value, label, 30);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u.exec(
      timestamp,
    );
  if (!match) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be canonical UTC RFC3339 with at most 9 fractional digits.`,
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth =
    month === 2
      ? leapYear
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : [1, 3, 5, 7, 8, 10, 12].includes(month)
          ? 31
          : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a valid canonical UTC RFC3339 timestamp.`,
    );
  }
  return timestamp;
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a positive safe integer.`,
    );
  }
  return value as number;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a non-negative safe integer.`,
    );
  }
  return value as number;
};

const normalizeExpectedHash = (value: string): string => {
  if (!CANONICAL_IROHA_HASH_HEX.test(value)) {
    throw new TransactionFinalityIntegrityError(
      "Expected transaction hash must be a canonical lowercase 32-byte Iroha hash with its marker set.",
    );
  }
  return value;
};

export const assertTransactionFinalityProof = (
  value: unknown,
  expectedHashHex: string,
): TransactionFinalityProof => {
  const expectedHash = normalizeExpectedHash(expectedHashHex);
  const proof = requireExactBoundedRecord(
    value,
    MAX_EXPLORER_EVIDENCE_JSON_BYTES,
    [
      "status",
      "transactionHash",
      "blockHeight",
      "blockHash",
      "finalizedBlockHeight",
    ],
    [],
    "Transaction finality proof",
  );
  if (proof.status !== "finalized") {
    throw new TransactionFinalityIntegrityError(
      "Transaction finality proof.status must be finalized.",
    );
  }
  const transactionHash = requireCanonicalHash(
    proof.transactionHash,
    "Transaction finality proof.transactionHash",
  );
  if (transactionHash !== expectedHash) {
    throw new TransactionFinalityIntegrityError(
      "Transaction finality proof hash does not match the submitted transaction.",
    );
  }
  const blockHeight = requirePositiveSafeInteger(
    proof.blockHeight,
    "Transaction finality proof.blockHeight",
  );
  const blockHash = requireCanonicalHash(
    proof.blockHash,
    "Transaction finality proof.blockHash",
  );
  const finalizedBlockHeight = requireNonNegativeSafeInteger(
    proof.finalizedBlockHeight,
    "Transaction finality proof.finalizedBlockHeight",
  );
  if (finalizedBlockHeight < blockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Transaction finality proof does not cover its transaction block.",
    );
  }
  return {
    status: "finalized",
    transactionHash,
    blockHeight,
    blockHash,
    finalizedBlockHeight,
  };
};

export const parseGlobalPipelineStatus = (
  payload: unknown,
  expectedHashHex: string,
): ParsedPipelineStatus => {
  const expectedHash = normalizeExpectedHash(expectedHashHex);
  const record = requireExactBoundedRecord(
    payload,
    MAX_PIPELINE_STATUS_JSON_BYTES,
    ["hash", "status", "scope", "resolved_from"],
    [],
    "Global pipeline status",
  );
  const hash = requireCanonicalHash(record.hash, "Global pipeline status.hash");
  if (hash !== expectedHash) {
    throw new TransactionFinalityIntegrityError(
      "Global pipeline status hash does not match the submitted transaction.",
    );
  }
  if (record.scope !== "global") {
    throw new TransactionFinalityIntegrityError(
      "Transaction finality requires an exact global pipeline status response.",
    );
  }
  if (
    record.resolved_from !== "queue" &&
    record.resolved_from !== "cache" &&
    record.resolved_from !== "state"
  ) {
    throw new TransactionFinalityIntegrityError(
      "Global pipeline status.resolved_from is not a first-release source.",
    );
  }
  const status = requireRecord(record.status, "Global pipeline status.status");
  requireExactFields(
    status,
    ["kind"],
    ["block_height"],
    "Global pipeline status.status",
  );
  if (
    typeof status.kind !== "string" ||
    !PIPELINE_STATUS_KINDS.has(status.kind)
  ) {
    throw new TransactionFinalityIntegrityError(
      "Global pipeline status kind is not a first-release status.",
    );
  }
  const blockHeight =
    status.block_height === undefined || status.block_height === null
      ? null
      : requirePositiveSafeInteger(
          status.block_height,
          "Global pipeline status.status.block_height",
        );
  if (status.kind === "Applied") {
    if (record.resolved_from !== "state") {
      throw new TransactionFinalityIntegrityError(
        "Applied transaction status must be resolved from authoritative global state.",
      );
    }
    if (blockHeight === null) {
      throw new TransactionFinalityIntegrityError(
        "Applied transaction status must identify its containing block height.",
      );
    }
  }
  return {
    kind: status.kind as ParsedPipelineStatus["kind"],
    resolvedFrom: record.resolved_from as ParsedPipelineStatus["resolvedFrom"],
    blockHeight,
    payload: record,
  };
};

type ParsedExplorerTransaction = {
  payload: JsonRecord;
  hash: string;
  blockHeight: number;
  authority: string;
  createdAt: string;
  executable: string;
  signature: string;
  nonce: number | null;
  timeToLiveMs: number | null;
};

type ParsedExplorerBlock = {
  payload: JsonRecord;
  hash: string;
  height: number;
  createdAt: string;
  previousHash: string | null;
  transactionsHash: string;
  transactionsRejected: number;
  transactionsTotal: number;
};

type ParsedExplorerMetrics = {
  payload: JsonRecord;
  blockHeight: number;
  finalizedBlockHeight: number;
};

type ParsedFinalitySnapshot = {
  transaction: ParsedExplorerTransaction;
  block: ParsedExplorerBlock;
  metrics: ParsedExplorerMetrics;
};

const parseOptionalDurationMs = (
  value: unknown,
  label: string,
): number | null => {
  if (value === null) {
    return null;
  }
  const duration = requireRecord(value, label);
  requireExactFields(duration, ["ms"], [], label);
  return requireNonNegativeSafeInteger(duration.ms, `${label}.ms`);
};

const parseExplorerTransaction = (
  payload: unknown,
  expectedHash: string,
  expectedBlockHeight: number,
  label: string,
): ParsedExplorerTransaction => {
  const transaction = requireExactBoundedRecord(
    payload,
    MAX_EXPLORER_TRANSACTION_JSON_BYTES,
    [
      "authority",
      "hash",
      "block",
      "created_at",
      "executable",
      "status",
      "rejection_reason",
      "executable_payload",
      "metadata",
      "nonce",
      "signature",
      "time_to_live",
    ],
    [],
    label,
  );
  const hash = requireCanonicalHash(transaction.hash, `${label}.hash`);
  if (hash !== expectedHash) {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction hash does not match the submitted transaction.",
    );
  }
  const blockHeight = requirePositiveSafeInteger(
    transaction.block,
    `${label}.block`,
  );
  if (blockHeight !== expectedBlockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction block does not match authoritative Applied state.",
    );
  }
  if (
    transaction.status !== "Committed" ||
    transaction.rejection_reason !== null
  ) {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction is not an exact successful committed transaction.",
    );
  }
  const authority = requireCanonicalText(
    transaction.authority,
    `${label}.authority`,
    2_048,
  );
  const createdAt = requireCanonicalUtcTimestamp(
    transaction.created_at,
    `${label}.created_at`,
  );
  if (
    typeof transaction.executable !== "string" ||
    !TRANSACTION_EXECUTABLE_KINDS.has(transaction.executable)
  ) {
    throw new TransactionFinalityIntegrityError(
      `${label}.executable is not a first-release executable kind.`,
    );
  }
  requireRecord(transaction.metadata, `${label}.metadata`);
  const nonce =
    transaction.nonce === null
      ? null
      : requirePositiveSafeInteger(transaction.nonce, `${label}.nonce`);
  const signature = requireCanonicalHexBytes(
    transaction.signature,
    `${label}.signature`,
  );
  const timeToLiveMs = parseOptionalDurationMs(
    transaction.time_to_live,
    `${label}.time_to_live`,
  );
  return {
    payload: transaction,
    hash,
    blockHeight,
    authority,
    createdAt,
    executable: transaction.executable,
    signature,
    nonce,
    timeToLiveMs,
  };
};

const parseExplorerBlock = (
  payload: unknown,
  expectedBlockHeight: number,
  label: string,
): ParsedExplorerBlock => {
  const block = requireExactBoundedRecord(
    payload,
    MAX_EXPLORER_EVIDENCE_JSON_BYTES,
    [
      "hash",
      "height",
      "created_at",
      "prev_block_hash",
      "transactions_hash",
      "transactions_rejected",
      "transactions_total",
    ],
    [],
    label,
  );
  const hash = requireCanonicalHash(block.hash, `${label}.hash`);
  const height = requirePositiveSafeInteger(block.height, `${label}.height`);
  if (height !== expectedBlockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer block height does not match the transaction block.",
    );
  }
  const createdAt = requireCanonicalUtcTimestamp(
    block.created_at,
    `${label}.created_at`,
  );
  const previousHash =
    block.prev_block_hash === null
      ? null
      : requireCanonicalHash(block.prev_block_hash, `${label}.prev_block_hash`);
  const transactionsHash = requireCanonicalHash(
    block.transactions_hash,
    `${label}.transactions_hash`,
  );
  const transactionsRejected = requireNonNegativeSafeInteger(
    block.transactions_rejected,
    `${label}.transactions_rejected`,
  );
  const transactionsTotal = requireNonNegativeSafeInteger(
    block.transactions_total,
    `${label}.transactions_total`,
  );
  if (
    transactionsRejected > 0xffff_ffff ||
    transactionsTotal > 0xffff_ffff ||
    transactionsRejected > transactionsTotal
  ) {
    throw new TransactionFinalityIntegrityError(
      `${label} transaction counters are inconsistent with the first-release u32 contract.`,
    );
  }
  if (transactionsTotal < 1) {
    throw new TransactionFinalityIntegrityError(
      "The transaction block reports no external transactions.",
    );
  }
  return {
    payload: block,
    hash,
    height,
    createdAt,
    previousHash,
    transactionsHash,
    transactionsRejected,
    transactionsTotal,
  };
};

const parseExplorerMetrics = (
  payload: unknown,
  expectedBlockHeight: number,
  label: string,
): ParsedExplorerMetrics => {
  const metrics = requireExactBoundedRecord(
    payload,
    MAX_EXPLORER_EVIDENCE_JSON_BYTES,
    [
      "peers",
      "domains",
      "accounts",
      "assets",
      "transactions_accepted",
      "transactions_rejected",
      "block",
      "block_created_at",
      "finalized_block",
      "avg_commit_time",
      "avg_block_time",
    ],
    [],
    label,
  );
  for (const field of [
    "peers",
    "domains",
    "accounts",
    "assets",
    "transactions_accepted",
    "transactions_rejected",
  ]) {
    requireNonNegativeSafeInteger(metrics[field], `${label}.${field}`);
  }
  const blockHeight = requireNonNegativeSafeInteger(
    metrics.block,
    `${label}.block`,
  );
  const finalizedBlockHeight = requireNonNegativeSafeInteger(
    metrics.finalized_block,
    `${label}.finalized_block`,
  );
  if (finalizedBlockHeight > blockHeight) {
    throw new TransactionFinalityIntegrityError(
      `${label}.finalized_block cannot exceed the current block.`,
    );
  }
  if (blockHeight < expectedBlockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer metrics current block is behind the indexed transaction block.",
    );
  }
  if (metrics.block_created_at !== null) {
    requireCanonicalUtcTimestamp(
      metrics.block_created_at,
      `${label}.block_created_at`,
    );
  }
  parseOptionalDurationMs(metrics.avg_commit_time, `${label}.avg_commit_time`);
  parseOptionalDurationMs(metrics.avg_block_time, `${label}.avg_block_time`);
  return { payload: metrics, blockHeight, finalizedBlockHeight };
};

const parseFinalitySnapshot = (input: {
  expectedHash: string;
  blockHeight: number;
  transactionPayload: unknown;
  blockPayload: unknown;
  metricsPayload: unknown;
  labelPrefix: string;
}): ParsedFinalitySnapshot => ({
  transaction: parseExplorerTransaction(
    input.transactionPayload,
    input.expectedHash,
    input.blockHeight,
    `${input.labelPrefix}Explorer transaction`,
  ),
  block: parseExplorerBlock(
    input.blockPayload,
    input.blockHeight,
    `${input.labelPrefix}Explorer block`,
  ),
  metrics: parseExplorerMetrics(
    input.metricsPayload,
    input.blockHeight,
    `${input.labelPrefix}Explorer metrics`,
  ),
});

const assertStableFinalitySnapshots = (
  initial: ParsedFinalitySnapshot,
  confirmation: ParsedFinalitySnapshot,
): void => {
  if (!isDeepStrictEqual(initial.block.payload, confirmation.block.payload)) {
    throw new TransactionFinalityIntegrityError(
      "The transaction block changed across finality evidence reads.",
    );
  }
  if (
    !isDeepStrictEqual(
      initial.transaction.payload,
      confirmation.transaction.payload,
    )
  ) {
    throw new TransactionFinalityIntegrityError(
      "The Explorer transaction changed across finality evidence reads.",
    );
  }
  if (
    confirmation.metrics.blockHeight < initial.metrics.blockHeight ||
    confirmation.metrics.finalizedBlockHeight <
      initial.metrics.finalizedBlockHeight
  ) {
    throw new TransactionFinalityIntegrityError(
      "Explorer finality metrics rolled back across evidence reads.",
    );
  }
};

export const assertFinalizedTransactionEvidence = (input: {
  expectedHashHex: string;
  appliedStatus: ParsedPipelineStatus;
  confirmationStatus: ParsedPipelineStatus;
  transactionPayload: unknown;
  blockPayload: unknown;
  metricsPayload: unknown;
  confirmationTransactionPayload: unknown;
  confirmationBlockPayload: unknown;
  confirmationMetricsPayload: unknown;
}): TransactionFinalityProof => {
  const expectedHash = normalizeExpectedHash(input.expectedHashHex);
  if (
    input.appliedStatus.kind !== "Applied" ||
    input.appliedStatus.resolvedFrom !== "state" ||
    input.appliedStatus.blockHeight === null
  ) {
    throw new TransactionFinalityIntegrityError(
      "Initial status does not prove authoritative Applied state.",
    );
  }
  if (
    input.confirmationStatus.kind !== "Applied" ||
    input.confirmationStatus.resolvedFrom !== "state" ||
    input.confirmationStatus.blockHeight === null
  ) {
    throw new TransactionFinalityIntegrityError(
      "Authoritative Applied state rolled back across the finality evidence read.",
    );
  }
  if (
    input.confirmationStatus.blockHeight !== input.appliedStatus.blockHeight
  ) {
    throw new TransactionFinalityIntegrityError(
      "The transaction block height changed across authoritative status reads.",
    );
  }
  const blockHeight = input.appliedStatus.blockHeight;
  const initialSnapshot = parseFinalitySnapshot({
    expectedHash,
    blockHeight,
    transactionPayload: input.transactionPayload,
    blockPayload: input.blockPayload,
    metricsPayload: input.metricsPayload,
    labelPrefix: "",
  });
  const confirmationSnapshot = parseFinalitySnapshot({
    expectedHash,
    blockHeight,
    transactionPayload: input.confirmationTransactionPayload,
    blockPayload: input.confirmationBlockPayload,
    metricsPayload: input.confirmationMetricsPayload,
    labelPrefix: "Confirmation ",
  });
  assertStableFinalitySnapshots(initialSnapshot, confirmationSnapshot);
  if (initialSnapshot.metrics.finalizedBlockHeight < blockHeight) {
    throw new TransactionFinalityPendingError(
      `Transaction block ${blockHeight} is not finalized yet (finalized height ${initialSnapshot.metrics.finalizedBlockHeight}).`,
    );
  }
  if (confirmationSnapshot.metrics.finalizedBlockHeight < blockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer finalized height rolled back below the transaction block.",
    );
  }
  return {
    status: "finalized",
    transactionHash: expectedHash,
    blockHeight,
    blockHash: confirmationSnapshot.block.hash,
    finalizedBlockHeight: confirmationSnapshot.metrics.finalizedBlockHeight,
  };
};

const isAuthoritativeTerminalStatus = (status: ParsedPipelineStatus): boolean =>
  status.resolvedFrom === "state" && TERMINAL_FAILURE_KINDS.has(status.kind);

const throwTerminalFailure = async (
  input: {
    buildTerminalFailure?: (
      statusKind: string,
      payload: unknown,
    ) => Promise<Error>;
  },
  hashHex: string,
  status: ParsedPipelineStatus,
): Promise<never> => {
  if (input.buildTerminalFailure) {
    const failure = await input.buildTerminalFailure(
      status.kind,
      status.payload,
    );
    if (!(failure instanceof Error)) {
      throw new TransactionFinalityIntegrityError(
        "Transaction terminal-failure builder did not return an Error.",
      );
    }
    throw failure;
  }
  throw new TransactionFinalityTerminalError(
    hashHex,
    status.kind,
    status.payload,
  );
};

export const waitForFinalizedTransaction = async (input: {
  hashHex: string;
  timeoutMs: number;
  intervalMs: number;
  getGlobalStatus: () => Promise<unknown>;
  getExplorerTransaction: () => Promise<unknown>;
  getExplorerBlock: (blockHeight: number) => Promise<unknown>;
  getExplorerMetrics: () => Promise<unknown>;
  wait: (delayMs: number) => Promise<void>;
  now?: () => number;
  buildTerminalFailure?: (
    statusKind: string,
    payload: unknown,
  ) => Promise<Error>;
}): Promise<FinalizedTransactionEvidence> => {
  const hashHex = normalizeExpectedHash(input.hashHex);
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1) {
    throw new Error("Transaction finality timeout must be positive.");
  }
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 0) {
    throw new Error("Transaction finality interval must be non-negative.");
  }
  const now = input.now ?? (() => performance.now());
  let previousClockMs: number | null = null;
  const readClock = (): number => {
    const current = now();
    if (
      typeof current !== "number" ||
      !Number.isFinite(current) ||
      current < 0
    ) {
      throw new Error(
        "Transaction finality clock must return a finite non-negative value.",
      );
    }
    if (previousClockMs !== null && current < previousClockMs) {
      throw new TransactionFinalityIntegrityError(
        "Transaction finality clock rolled back during verification.",
      );
    }
    previousClockMs = current;
    return current;
  };
  const startedAtMs = readClock();
  const maximumAttempts = Math.min(
    MAX_FINALITY_POLL_ATTEMPTS,
    Math.ceil(input.timeoutMs / Math.max(1, input.intervalMs)) + 1,
  );
  let lastStatusKind: string | null = null;
  let lastEvidenceError: unknown = null;
  let appliedBlockHeight: number | null = null;
  let previousSnapshot: ParsedFinalitySnapshot | null = null;
  let attempts = 0;

  while (
    attempts < maximumAttempts &&
    readClock() - startedAtMs <= input.timeoutMs
  ) {
    attempts += 1;
    let status: ParsedPipelineStatus | null = null;
    let statusReadCompleted = false;
    try {
      const statusPayload = await input.getGlobalStatus();
      statusReadCompleted = true;
      if (statusPayload !== null && statusPayload !== undefined) {
        status = parseGlobalPipelineStatus(statusPayload, hashHex);
        lastStatusKind = status.kind;
      }
    } catch (error) {
      if (error instanceof TransactionFinalityIntegrityError) {
        throw error;
      }
      lastEvidenceError = error;
    }

    if (status && isAuthoritativeTerminalStatus(status)) {
      await throwTerminalFailure(input, hashHex, status);
    }
    if (appliedBlockHeight !== null && statusReadCompleted && status === null) {
      throw new TransactionFinalityIntegrityError(
        "Authoritative Applied state disappeared after it was observed.",
      );
    }
    if (
      appliedBlockHeight !== null &&
      status &&
      (status.kind !== "Applied" || status.blockHeight !== appliedBlockHeight)
    ) {
      throw new TransactionFinalityIntegrityError(
        "Authoritative transaction state rolled back after Applied was observed.",
      );
    }

    if (status?.kind === "Applied" && status.blockHeight !== null) {
      if (
        appliedBlockHeight !== null &&
        status.blockHeight !== appliedBlockHeight
      ) {
        throw new TransactionFinalityIntegrityError(
          "The authoritative Applied block changed across polling attempts.",
        );
      }
      appliedBlockHeight = status.blockHeight;
      let initialSnapshot: ParsedFinalitySnapshot | null = null;
      try {
        const [transactionPayload, blockPayload, metricsPayload] =
          await Promise.all([
            input.getExplorerTransaction(),
            input.getExplorerBlock(status.blockHeight),
            input.getExplorerMetrics(),
          ]);
        initialSnapshot = parseFinalitySnapshot({
          expectedHash: hashHex,
          blockHeight: status.blockHeight,
          transactionPayload,
          blockPayload,
          metricsPayload,
          labelPrefix: "",
        });
        if (previousSnapshot) {
          assertStableFinalitySnapshots(previousSnapshot, initialSnapshot);
        }
        previousSnapshot = initialSnapshot;
      } catch (error) {
        if (error instanceof TransactionFinalityIntegrityError) {
          throw error;
        }
        lastEvidenceError = error;
      }

      if (
        initialSnapshot &&
        initialSnapshot.metrics.finalizedBlockHeight < status.blockHeight
      ) {
        lastEvidenceError = new TransactionFinalityPendingError(
          `Transaction block ${status.blockHeight} is not finalized yet (finalized height ${initialSnapshot.metrics.finalizedBlockHeight}).`,
        );
      } else if (initialSnapshot) {
        let confirmationStatus: ParsedPipelineStatus | null = null;
        let confirmationReadCompleted = false;
        try {
          const confirmationPayload = await input.getGlobalStatus();
          confirmationReadCompleted = true;
          if (
            confirmationPayload !== null &&
            confirmationPayload !== undefined
          ) {
            confirmationStatus = parseGlobalPipelineStatus(
              confirmationPayload,
              hashHex,
            );
          }
        } catch (error) {
          if (error instanceof TransactionFinalityIntegrityError) {
            throw error;
          }
          lastEvidenceError = error;
        }
        if (
          confirmationStatus &&
          isAuthoritativeTerminalStatus(confirmationStatus)
        ) {
          await throwTerminalFailure(input, hashHex, confirmationStatus);
        }
        if (confirmationReadCompleted && confirmationStatus === null) {
          throw new TransactionFinalityIntegrityError(
            "Authoritative Applied confirmation disappeared during finality verification.",
          );
        }
        if (
          confirmationStatus &&
          (confirmationStatus.kind !== "Applied" ||
            confirmationStatus.resolvedFrom !== "state" ||
            confirmationStatus.blockHeight !== status.blockHeight)
        ) {
          throw new TransactionFinalityIntegrityError(
            "Authoritative Applied state rolled back across the finality evidence read.",
          );
        }
        if (confirmationStatus) {
          try {
            const [
              confirmationTransactionPayload,
              confirmationBlockPayload,
              confirmationMetricsPayload,
            ] = await Promise.all([
              input.getExplorerTransaction(),
              input.getExplorerBlock(status.blockHeight),
              input.getExplorerMetrics(),
            ]);
            const proof = assertFinalizedTransactionEvidence({
              expectedHashHex: hashHex,
              appliedStatus: status,
              confirmationStatus,
              transactionPayload: initialSnapshot.transaction.payload,
              blockPayload: initialSnapshot.block.payload,
              metricsPayload: initialSnapshot.metrics.payload,
              confirmationTransactionPayload,
              confirmationBlockPayload,
              confirmationMetricsPayload,
            });
            const confirmationSnapshot = parseFinalitySnapshot({
              expectedHash: hashHex,
              blockHeight: status.blockHeight,
              transactionPayload: confirmationTransactionPayload,
              blockPayload: confirmationBlockPayload,
              metricsPayload: confirmationMetricsPayload,
              labelPrefix: "Confirmation ",
            });
            if (previousSnapshot) {
              assertStableFinalitySnapshots(
                previousSnapshot,
                confirmationSnapshot,
              );
            }
            return {
              proof,
              statusPayload: confirmationStatus.payload,
              transactionPayload: confirmationSnapshot.transaction.payload,
            };
          } catch (error) {
            if (error instanceof TransactionFinalityIntegrityError) {
              throw error;
            }
            lastEvidenceError = error;
          }
        }
      }
    }

    const remainingMs = input.timeoutMs - (readClock() - startedAtMs);
    if (remainingMs <= 0) {
      break;
    }
    await input.wait(Math.min(input.intervalMs, remainingMs));
  }

  const seconds = Math.trunc(input.timeoutMs / 1000);
  const evidenceDetail =
    lastEvidenceError instanceof Error && lastEvidenceError.message
      ? ` Last evidence error: ${lastEvidenceError.message}`
      : "";
  const attemptDetail =
    attempts >= maximumAttempts
      ? ` Polling stopped at the ${maximumAttempts}-attempt safety limit.`
      : "";
  throw new Error(
    lastStatusKind
      ? `Transaction ${hashHex} stayed in ${lastStatusKind} and was not proven in a finalized block within ${seconds} seconds.${evidenceDetail}${attemptDetail}`
      : `Transaction ${hashHex} was not proven in a finalized block within ${seconds} seconds.${evidenceDetail}${attemptDetail}`,
  );
};

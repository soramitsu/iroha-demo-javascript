import { createHash, randomBytes } from "node:crypto";
import { blake2b } from "@noble/hashes/blake2b";
import type { NetworkId } from "@iroha/iroha-js/canonical-request";
import { normalizeAssetDefinitionId } from "@iroha/iroha-js/normalizers";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  decodeFaucetPowPuzzle,
  solveFaucetPowPuzzle,
  type FaucetPowPuzzle,
} from "./faucetPow";
import { normalizeBaseUrl, readApiErrorDetail } from "./preload-utils";
import { readBoundedJsonResponse } from "./boundedJsonResponse";
import { parseStrictJson } from "./secureBoundedJson";
import { parseGlobalPipelineStatus } from "./transactionFinality";
import { parseNetworkIdLiteral } from "../src/utils/networkIdentity";

/**
 * TAIRA account faucet, prepared-transaction flow (Torii `routing.rs`):
 *
 * 1. `GET /v1/accounts/faucet/policy` - issuer, asset and amount for the
 *    endpoint's NetworkId.
 * 2. `GET /v1/accounts/faucet/puzzle` - `scrypt-leading-zero-bits-v1` puzzle
 *    under challenge domain `iroha:accounts:faucet:pow:v1`.
 * 3. `POST /v1/accounts/faucet/prepare` - the solved claim bound to a
 *    `iroha.prepared-operation.binding.v1` whose `semantic_hash_hex` is the
 *    domain-separated hash of the compact-Norito claim. Torii returns an
 *    authenticated `iroha.prepared-transaction.v1` envelope.
 * 4. `POST /v1/accounts/faucet` - the envelope, verbatim. Re-posting the same
 *    envelope is idempotent and reports the transaction's current outcome.
 * 5. Wait until the global pipeline status is `Applied`, resolved from state.
 *
 * Iroha produces no empty blocks, so the wallet does not require the chain
 * height to advance before claiming.
 */

export const FAUCET_PREPARE_SCHEMA = "iroha.accounts.faucet.prepare.v1";
export const PREPARED_OPERATION_BINDING_SCHEMA =
  "iroha.prepared-operation.binding.v1";
export const PREPARED_TRANSACTION_SCHEMA = "iroha.prepared-transaction.v1";
export const PREPARED_TRANSACTION_SUBMIT_SCHEMA =
  "iroha.prepared-transaction-submit.v1";
const FAUCET_CLAIM_HASH_DOMAIN = new TextEncoder().encode(
  "iroha:accounts:faucet:claim:v1\0",
);
const AUTHORITY_FEE_PAYMENT = Object.freeze({
  payer: "authority",
  value: Object.freeze({ charge_limits: [], gas_limit: null }),
});

export type FaucetRequestPhase =
  | "requestingPuzzle"
  | "waitingForPuzzleRetry"
  | "solvingPuzzle"
  | "submittingClaim"
  | "waitingForClaimRetry"
  | "waitingForFinality"
  | "claimFinalized";

export type FaucetRequestProgress = {
  phase: FaucetRequestPhase;
  attempt?: number;
  attempts?: number;
  txHashHex?: string;
};

export type FaucetPolicy = {
  networkId: string;
  networkPrefix: number;
  authority: string;
  assetDefinitionId: string;
  amount: string;
};

export type FaucetClaim = {
  account_id: string;
  pow_anchor_height: number;
  pow_nonce_hex: string;
};

export type PreparedOperationBinding = {
  schema: typeof PREPARED_OPERATION_BINDING_SCHEMA;
  semantic_hash_hex: string;
  kind: "faucet";
  request_id: string;
  execution_expires_at_unix_ms: number;
};

export type PreparedFaucetEnvelope = {
  /** Exact response text, re-posted verbatim to submit. */
  raw: string;
  binding: PreparedOperationBinding;
  accountId: string;
  assetDefinitionId: string;
  assetId: string;
  amount: string;
  transactionHashHex: string;
};

export type AccountFaucetResult = {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  /** Global pipeline status resolved from committed state. */
  status: "APPLIED";
  blockHeight: number;
};

type SolvedFaucetPow = Awaited<ReturnType<typeof solveFaucetPowPuzzle>>;

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

export type RequestFaucetFundsInput = {
  baseUrl: string;
  accountId: string;
  chainId: string;
  networkPrefix: number;
  /** Endpoint NetworkId attested by both public identity sources. */
  networkId: NetworkId;
  fetchImpl?: FetchLike;
  /** Global pipeline status for a transaction hash; null when not yet known. */
  getGlobalStatus: (hashHex: string, signal?: AbortSignal) => Promise<unknown>;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  solvePuzzle?: (
    accountId: string,
    puzzle: FaucetPowPuzzle,
    options?: { signal?: AbortSignal },
  ) => Promise<SolvedFaucetPow>;
  randomRequestId?: () => string;
  puzzleRetryAttempts?: number;
  puzzleRetryDelayMs?: number;
  submitAttempts?: number;
  finalityTimeoutMs?: number;
  finalityIntervalMs?: number;
  onStatus?: (progress: FaucetRequestProgress) => void | Promise<void>;
};

const DEFAULT_PUZZLE_RETRY_ATTEMPTS = 4;
const DEFAULT_PUZZLE_RETRY_DELAY_MS = 750;
const DEFAULT_SUBMIT_ATTEMPTS = 3;
const DEFAULT_FINALITY_TIMEOUT_MS = 120_000;
const DEFAULT_FINALITY_INTERVAL_MS = 1_000;
const PREPARED_OPERATION_LIFETIME_MS = 5 * 60_000;
const MAX_FAUCET_JSON_BYTES = 64 * 1024;
const MAX_QUANTITY_SCALE = 28;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/u;
const MINAMOTO_PUBLIC_HOST = "minamoto.sora.org";
const MINAMOTO_CHAIN_ID = "00000000-0000-0000-0000-000000000000";
const MINAMOTO_NETWORK_PREFIX = 753;
const RETRYABLE_PUZZLE_DETAIL = /faucet pow (?:beacon|vrf) seed unavailable/iu;
const STALE_CLAIM_DETAIL =
  /faucet pow anchor is stale|faucet pow anchor height out of range|unknown faucet pow anchor height/iu;

const createAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createAbortError();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

const sleepFor = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(readAbortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(readAbortReason(signal!));
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const emitStatus = async (
  onStatus: RequestFaucetFundsInput["onStatus"],
  progress: FaucetRequestProgress,
) => {
  if (!onStatus) return;
  try {
    await onStatus(progress);
  } catch {
    // Renderer-side status hooks must not break the faucet request itself.
  }
};

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unsupported shape.`);
  }
  return record;
};

const canonicalText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be canonical non-empty text.`);
  }
  return value;
};

const positiveCanonicalQuantity = (value: unknown, label: string): string => {
  const literal = canonicalText(value, label);
  const match = /^(?:([1-9]\d*)|(0|[1-9]\d*)\.(\d*[1-9]))$/u.exec(literal);
  if (!match) {
    throw new Error(`${label} must be a positive canonical Quantity string.`);
  }
  const fraction = match[3] ?? "";
  if (
    fraction.length > MAX_QUANTITY_SCALE ||
    BigInt(literal.replace(".", "")) > MAX_QUANTITY_MANTISSA
  ) {
    throw new Error(`${label} is outside the canonical Quantity range.`);
  }
  return literal;
};

const canonicalAssetDefinitionId = (value: unknown, label: string) => {
  const literal = canonicalText(value, label);
  let normalized: string;
  try {
    normalized = normalizeAssetDefinitionId(literal, label);
  } catch {
    throw new Error(`${label} must be a canonical asset definition ID.`);
  }
  if (normalized !== literal) {
    throw new Error(`${label} must be a canonical asset definition ID.`);
  }
  return literal;
};

const isMinamotoEndpoint = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === MINAMOTO_PUBLIC_HOST;
  } catch {
    return false;
  }
};

const MINAMOTO_FAUCET_MESSAGE =
  "Minamoto mainnet must not expose a faucet. Switch Settings to the TAIRA testnet preset to request starter XOR.";
const FAUCET_DISABLED_MESSAGE =
  "This endpoint does not provide starter funds (its account faucet is disabled). Use the TAIRA testnet endpoint or an already-funded account.";

const isFaucetDisabledDetail = (detail: string) =>
  /account faucet disabled|faucet disabled|does not provide a testnet faucet|account_faucet_disabled/iu.test(
    detail,
  );

const readJson = (response: Response, label: string) =>
  readBoundedJsonResponse(response, {
    label,
    maximumBytes: MAX_FAUCET_JSON_BYTES,
    requireApplicationJson: true,
  });

const requestError = async (response: Response, label: string) => {
  const detail = await readApiErrorDetail(response);
  if (isFaucetDisabledDetail(detail)) {
    return new Error(FAUCET_DISABLED_MESSAGE);
  }
  return Object.assign(
    new Error(
      `${label} failed (${response.status})${detail ? `: ${detail}` : "."}`,
    ),
    { status: response.status, detail },
  );
};

/** `GET /v1/accounts/faucet/policy`, bound to the attested endpoint identity. */
export const decodeFaucetPolicy = (
  value: unknown,
  expected: { networkId: NetworkId; networkPrefix: number },
): FaucetPolicy => {
  const record = exactRecord(
    value,
    [
      "schema_version",
      "network_id",
      "network_prefix",
      "authority",
      "asset_definition_id",
      "amount",
    ],
    "Faucet policy",
  );
  if (record.schema_version !== 1) {
    throw new Error("Faucet policy must use schema_version 1.");
  }
  const networkId = parseNetworkIdLiteral(
    record.network_id,
    "Faucet policy network_id",
  );
  if (networkId !== expected.networkId.toString()) {
    throw new Error(
      "Faucet policy network_id does not match the endpoint's attested NetworkId.",
    );
  }
  if (record.network_prefix !== expected.networkPrefix) {
    throw new Error(
      `Faucet policy network prefix mismatch: expected ${expected.networkPrefix}, got ${String(record.network_prefix)}.`,
    );
  }
  return {
    networkId,
    networkPrefix: expected.networkPrefix,
    authority: normalizeCanonicalAccountIdLiteral(
      canonicalText(record.authority, "Faucet policy authority"),
      "Faucet policy authority",
      expected.networkPrefix,
    ),
    assetDefinitionId: canonicalAssetDefinitionId(
      record.asset_definition_id,
      "Faucet policy asset_definition_id",
    ),
    amount: positiveCanonicalQuantity(record.amount, "Faucet policy amount"),
  };
};

const compactLength = (value: number): Uint8Array => {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  bytes.push(remaining);
  return Uint8Array.from(bytes);
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const compactField = (payload: Uint8Array) =>
  concat(compactLength(payload.length), payload);

const compactString = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return concat(compactLength(bytes.length), bytes);
};

const u64Le = (value: number) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
};

/**
 * Torii `faucet_claim_hash`: Iroha BLAKE2b-256 (low bit set) over
 * `iroha:accounts:faucet:claim:v1\0` followed by the compact-Norito
 * `AccountFaucetRequestDto { account_id, pow_anchor_height, pow_nonce_hex }`.
 */
export const faucetClaimSemanticHashHex = (claim: FaucetClaim): string => {
  const encoded = concat(
    compactField(compactString(claim.account_id)),
    compactField(u64Le(claim.pow_anchor_height)),
    compactField(compactString(claim.pow_nonce_hex)),
  );
  const digest = blake2b(concat(FAUCET_CLAIM_HASH_DOMAIN, encoded), {
    dkLen: 32,
  });
  digest[31] |= 1;
  return Buffer.from(digest).toString("hex");
};

export const buildFaucetPrepareRequest = (input: {
  claim: FaucetClaim;
  requestId: string;
  executionExpiresAtUnixMs: number;
}) => {
  if (!LOWER_HEX_64.test(input.requestId)) {
    throw new Error("Faucet request_id must be 64 lowercase hex characters.");
  }
  if (
    !Number.isSafeInteger(input.executionExpiresAtUnixMs) ||
    input.executionExpiresAtUnixMs <= 0
  ) {
    throw new Error("Faucet execution deadline must be a positive integer.");
  }
  const binding: PreparedOperationBinding = {
    schema: PREPARED_OPERATION_BINDING_SCHEMA,
    semantic_hash_hex: faucetClaimSemanticHashHex(input.claim),
    kind: "faucet",
    request_id: input.requestId,
    execution_expires_at_unix_ms: input.executionExpiresAtUnixMs,
  };
  return {
    schema: FAUCET_PREPARE_SCHEMA,
    binding,
    claim: { ...input.claim },
    fee_payment: AUTHORITY_FEE_PAYMENT,
  };
};

const bindingMatches = (value: unknown, expected: PreparedOperationBinding) => {
  const record = exactRecord(
    value,
    [
      "schema",
      "semantic_hash_hex",
      "kind",
      "request_id",
      "execution_expires_at_unix_ms",
    ],
    "Prepared operation binding",
  );
  return (
    record.schema === expected.schema &&
    record.semantic_hash_hex === expected.semantic_hash_hex &&
    record.kind === expected.kind &&
    record.request_id === expected.request_id &&
    record.execution_expires_at_unix_ms ===
      expected.execution_expires_at_unix_ms
  );
};

/** Validate the authenticated `iroha.prepared-transaction.v1` envelope. */
export const decodePreparedFaucetEnvelope = (
  raw: string,
  expected: {
    binding: PreparedOperationBinding;
    claim: FaucetClaim;
    policy: FaucetPolicy;
  },
): PreparedFaucetEnvelope => {
  const record = exactRecord(
    parseStrictJson(raw, "Prepared faucet transaction"),
    [
      "schema",
      "binding",
      "operation",
      "claim",
      "semantic_hash_hex",
      "account_id",
      "asset_definition_id",
      "asset_id",
      "amount",
      "transaction_hash_hex",
      "signed_transaction_wire_hex",
      "signed_transaction_wire_sha256",
      "fee_payment",
      "server_signature",
    ],
    "Prepared faucet transaction",
  );
  if (
    record.schema !== PREPARED_TRANSACTION_SCHEMA ||
    record.operation !== "faucet"
  ) {
    throw new Error("Prepared faucet transaction schema or operation differs.");
  }
  if (!bindingMatches(record.binding, expected.binding)) {
    throw new Error(
      "Prepared faucet transaction does not echo the requested operation binding.",
    );
  }
  const claim = exactRecord(
    record.claim,
    ["account_id", "pow_anchor_height", "pow_nonce_hex"],
    "Prepared faucet claim",
  );
  if (
    claim.account_id !== expected.claim.account_id ||
    claim.pow_anchor_height !== expected.claim.pow_anchor_height ||
    claim.pow_nonce_hex !== expected.claim.pow_nonce_hex ||
    record.semantic_hash_hex !== expected.binding.semantic_hash_hex
  ) {
    throw new Error("Prepared faucet transaction changed the solved claim.");
  }
  if (record.account_id !== expected.claim.account_id) {
    throw new Error("Prepared faucet transaction funds a different account.");
  }
  const assetDefinitionId = canonicalAssetDefinitionId(
    record.asset_definition_id,
    "Prepared faucet asset_definition_id",
  );
  const amount = positiveCanonicalQuantity(
    record.amount,
    "Prepared faucet amount",
  );
  if (
    assetDefinitionId !== expected.policy.assetDefinitionId ||
    amount !== expected.policy.amount
  ) {
    throw new Error(
      "Prepared faucet transaction differs from the endpoint's advertised faucet policy.",
    );
  }
  const assetId = `${assetDefinitionId}#${expected.claim.account_id}`;
  if (record.asset_id !== assetId) {
    throw new Error(
      "Prepared faucet asset_id does not bind its asset definition to the account.",
    );
  }
  const transactionHashHex = canonicalText(
    record.transaction_hash_hex,
    "Prepared faucet transaction_hash_hex",
  );
  const wireHex = canonicalText(
    record.signed_transaction_wire_hex,
    "Prepared faucet signed_transaction_wire_hex",
  );
  if (
    !LOWER_HEX_64.test(transactionHashHex) ||
    !/^(?:[0-9a-f]{2})+$/u.test(wireHex) ||
    createHash("sha256").update(Buffer.from(wireHex, "hex")).digest("hex") !==
      record.signed_transaction_wire_sha256
  ) {
    throw new Error(
      "Prepared faucet transaction wire is not bound to its SHA-256 digest.",
    );
  }
  return {
    raw,
    binding: expected.binding,
    accountId: expected.claim.account_id,
    assetDefinitionId,
    assetId,
    amount,
    transactionHashHex,
  };
};

/** `iroha.prepared-transaction-submit.v1` outcome for the exact envelope. */
export const decodePreparedSubmitOutcome = (
  value: unknown,
  envelope: PreparedFaucetEnvelope,
): "Applied" | "Pending" | "Rejected" => {
  const record = exactRecord(
    value,
    ["schema", "binding", "operation", "transaction_hash_hex", "outcome"],
    "Faucet submit response",
  );
  if (
    record.schema !== PREPARED_TRANSACTION_SUBMIT_SCHEMA ||
    record.operation !== "faucet" ||
    record.transaction_hash_hex !== envelope.transactionHashHex ||
    !bindingMatches(record.binding, envelope.binding)
  ) {
    throw new Error(
      "Faucet submit response does not bind the prepared transaction.",
    );
  }
  if (
    record.outcome !== "Applied" &&
    record.outcome !== "Pending" &&
    record.outcome !== "Rejected"
  ) {
    throw new Error("Faucet submit response outcome is unsupported.");
  }
  return record.outcome;
};

/** Poll the global pipeline status until it is Applied from committed state. */
export const waitForFaucetClaimApplied = async (input: {
  hashHex: string;
  getGlobalStatus: (hashHex: string, signal?: AbortSignal) => Promise<unknown>;
  sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  intervalMs: number;
  signal?: AbortSignal;
}): Promise<{ blockHeight: number }> => {
  const startedAt = input.now();
  let lastKind = "unknown";
  let appliedHeight: number | null = null;
  for (;;) {
    throwIfAborted(input.signal);
    const payload = await input.getGlobalStatus(input.hashHex, input.signal);
    if (payload !== null && payload !== undefined) {
      const status = parseGlobalPipelineStatus(payload, input.hashHex);
      lastKind = status.kind;
      if (status.kind === "Rejected" || status.kind === "Expired") {
        throw new Error(
          `The faucet transaction ${input.hashHex} was ${status.kind.toLowerCase()} by the network.`,
        );
      }
      if (status.kind === "Applied" && status.blockHeight !== null) {
        if (appliedHeight === status.blockHeight) {
          return { blockHeight: status.blockHeight };
        }
        // Confirm with a second authoritative read before reporting success.
        appliedHeight = status.blockHeight;
        continue;
      }
      appliedHeight = null;
    }
    if (input.now() - startedAt >= input.timeoutMs) {
      throw new Error(
        `The faucet transaction ${input.hashHex} is still ${lastKind} after ${Math.round(input.timeoutMs / 1000)} seconds; check the wallet balance again shortly.`,
      );
    }
    await input.sleep(input.intervalMs, input.signal);
  }
};

const postJson = (
  fetchImpl: FetchLike,
  url: string,
  body: string,
  signal?: AbortSignal,
) =>
  fetchImpl(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });

export const requestFaucetFundsWithPuzzle = async ({
  baseUrl,
  accountId,
  chainId,
  networkPrefix,
  networkId,
  fetchImpl = fetch,
  getGlobalStatus,
  signal,
  sleep = sleepFor,
  now = Date.now,
  solvePuzzle = solveFaucetPowPuzzle,
  randomRequestId = () => randomBytes(32).toString("hex"),
  puzzleRetryAttempts = DEFAULT_PUZZLE_RETRY_ATTEMPTS,
  puzzleRetryDelayMs = DEFAULT_PUZZLE_RETRY_DELAY_MS,
  submitAttempts = DEFAULT_SUBMIT_ATTEMPTS,
  finalityTimeoutMs = DEFAULT_FINALITY_TIMEOUT_MS,
  finalityIntervalMs = DEFAULT_FINALITY_INTERVAL_MS,
  onStatus,
}: RequestFaucetFundsInput): Promise<AccountFaucetResult> => {
  const root = normalizeBaseUrl(baseUrl);
  if (
    isMinamotoEndpoint(root) ||
    chainId === MINAMOTO_CHAIN_ID ||
    networkPrefix === MINAMOTO_NETWORK_PREFIX
  ) {
    throw new Error(MINAMOTO_FAUCET_MESSAGE);
  }
  const account = normalizeCanonicalAccountIdLiteral(
    accountId,
    "accountId",
    networkPrefix,
  );

  throwIfAborted(signal);
  const policyResponse = await fetchImpl(`${root}/v1/accounts/faucet/policy`, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!policyResponse.ok) {
    throw await requestError(policyResponse, "Faucet policy");
  }
  const policy = decodeFaucetPolicy(
    await readJson(policyResponse, "Faucet policy"),
    { networkId, networkPrefix },
  );

  // The caller-owned operation identity persists across puzzle retries.
  const requestId = randomRequestId();
  const attempts = Math.max(1, Math.trunc(puzzleRetryAttempts));
  let envelope: PreparedFaucetEnvelope | null = null;
  for (let attempt = 1; attempt <= attempts && !envelope; attempt += 1) {
    throwIfAborted(signal);
    await emitStatus(onStatus, {
      phase: "requestingPuzzle",
      attempt,
      attempts,
    });
    const puzzleResponse = await fetchImpl(
      `${root}/v1/accounts/faucet/puzzle`,
      { method: "GET", signal, headers: { Accept: "application/json" } },
    );
    if (!puzzleResponse.ok) {
      const error = await requestError(puzzleResponse, "Faucet puzzle");
      const detail = (error as { detail?: string }).detail ?? "";
      if (attempt < attempts && RETRYABLE_PUZZLE_DETAIL.test(detail)) {
        await emitStatus(onStatus, {
          phase: "waitingForPuzzleRetry",
          attempt,
          attempts,
        });
        await sleep(puzzleRetryDelayMs, signal);
        continue;
      }
      throw error;
    }
    const puzzle = decodeFaucetPowPuzzle(
      await readJson(puzzleResponse, "Faucet puzzle"),
      networkId,
      networkPrefix,
    );
    await emitStatus(onStatus, { phase: "solvingPuzzle", attempt, attempts });
    const solved = await solvePuzzle(account, puzzle, { signal });
    throwIfAborted(signal);
    const claim: FaucetClaim = {
      account_id: account,
      pow_anchor_height: solved.anchorHeight,
      pow_nonce_hex: solved.nonceHex,
    };
    const prepareRequest = buildFaucetPrepareRequest({
      claim,
      requestId,
      executionExpiresAtUnixMs: now() + PREPARED_OPERATION_LIFETIME_MS,
    });
    await emitStatus(onStatus, {
      phase: "submittingClaim",
      attempt,
      attempts,
    });
    const prepareResponse = await postJson(
      fetchImpl,
      `${root}/v1/accounts/faucet/prepare`,
      JSON.stringify(prepareRequest),
      signal,
    );
    if (!prepareResponse.ok) {
      const error = await requestError(prepareResponse, "Faucet prepare");
      const detail = (error as { detail?: string }).detail ?? "";
      if (attempt < attempts && STALE_CLAIM_DETAIL.test(detail)) {
        await emitStatus(onStatus, {
          phase: "waitingForPuzzleRetry",
          attempt,
          attempts,
        });
        await sleep(puzzleRetryDelayMs, signal);
        continue;
      }
      throw error;
    }
    const preparedBytes = Buffer.from(await prepareResponse.arrayBuffer());
    if (preparedBytes.length > MAX_FAUCET_JSON_BYTES) {
      throw new Error("Prepared faucet transaction exceeds its size limit.");
    }
    envelope = decodePreparedFaucetEnvelope(preparedBytes.toString("utf8"), {
      binding: prepareRequest.binding,
      claim,
      policy,
    });
  }
  if (!envelope) {
    throw new Error("Faucet claim could not be prepared.");
  }

  let outcome: "Applied" | "Pending" | "Rejected" | null = null;
  const submitLimit = Math.max(1, Math.trunc(submitAttempts));
  for (let attempt = 1; attempt <= submitLimit && !outcome; attempt += 1) {
    throwIfAborted(signal);
    let response: Response;
    try {
      // Re-posting the exact envelope is idempotent, so response loss and
      // transient failures are retried with the same bytes.
      response = await postJson(
        fetchImpl,
        `${root}/v1/accounts/faucet`,
        envelope.raw,
        signal,
      );
    } catch (error) {
      throwIfAborted(signal);
      if (attempt === submitLimit) throw error;
      await emitStatus(onStatus, { phase: "waitingForClaimRetry", attempt });
      await sleep(puzzleRetryDelayMs * attempt, signal);
      continue;
    }
    if (!response.ok) {
      const error = await requestError(response, "Faucet submit");
      if (attempt === submitLimit || response.status < 500) throw error;
      await emitStatus(onStatus, { phase: "waitingForClaimRetry", attempt });
      await sleep(puzzleRetryDelayMs * attempt, signal);
      continue;
    }
    outcome = decodePreparedSubmitOutcome(
      await readJson(response, "Faucet submit response"),
      envelope,
    );
  }
  if (outcome === "Rejected") {
    throw new Error(
      `The network rejected the faucet transaction ${envelope.transactionHashHex}.`,
    );
  }

  await emitStatus(onStatus, {
    phase: "waitingForFinality",
    txHashHex: envelope.transactionHashHex,
  });
  const applied = await waitForFaucetClaimApplied({
    hashHex: envelope.transactionHashHex,
    getGlobalStatus,
    sleep,
    now,
    timeoutMs: finalityTimeoutMs,
    intervalMs: finalityIntervalMs,
    signal,
  });
  await emitStatus(onStatus, {
    phase: "claimFinalized",
    txHashHex: envelope.transactionHashHex,
  });
  return {
    account_id: envelope.accountId,
    asset_definition_id: envelope.assetDefinitionId,
    asset_id: envelope.assetId,
    amount: envelope.amount,
    tx_hash_hex: envelope.transactionHashHex,
    status: "APPLIED",
    blockHeight: applied.blockHeight,
  };
};

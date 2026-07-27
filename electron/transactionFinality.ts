const CANONICAL_HASH_HEX = /^[0-9a-f]{64}$/u;
const PIPELINE_STATUS_KINDS = new Set([
  "Queued",
  "Approved",
  "Committed",
  "Applied",
  "Rejected",
  "Expired",
]);
const TERMINAL_FAILURE_KINDS = new Set(["Rejected", "Expired"]);

type JsonRecord = Record<string, unknown>;

export type TransactionFinalityProof = {
  status: "finalized";
  transactionHash: string;
  blockHeight: number;
  blockHash: string;
  finalizedBlockHeight: number;
};

export type ParsedPipelineStatus = {
  kind: string;
  resolvedFrom: string;
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TransactionFinalityIntegrityError(`${label} must be an object.`);
  }
  return value as JsonRecord;
};

const requireCanonicalHash = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !CANONICAL_HASH_HEX.test(value)) {
    throw new TransactionFinalityIntegrityError(
      `${label} must be a canonical lowercase 32-byte hash.`,
    );
  }
  return value;
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
  const normalized = value.trim();
  if (!CANONICAL_HASH_HEX.test(normalized)) {
    throw new TransactionFinalityIntegrityError(
      "Expected transaction hash must be a canonical lowercase 32-byte hash.",
    );
  }
  return normalized;
};

export const assertTransactionFinalityProof = (
  value: unknown,
  expectedHashHex: string,
): TransactionFinalityProof => {
  const expectedHash = normalizeExpectedHash(expectedHashHex);
  const proof = requireRecord(value, "Transaction finality proof");
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
  const record = requireRecord(payload, "Global pipeline status");
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
    kind: status.kind,
    resolvedFrom: record.resolved_from,
    blockHeight,
    payload: record,
  };
};

export const assertFinalizedTransactionEvidence = (input: {
  expectedHashHex: string;
  appliedStatus: ParsedPipelineStatus;
  confirmationStatus: ParsedPipelineStatus;
  transactionPayload: unknown;
  blockPayload: unknown;
  metricsPayload: unknown;
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
    throw new TransactionFinalityPendingError(
      "Authoritative Applied status was not stable across the finality evidence read.",
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

  const transaction = requireRecord(
    input.transactionPayload,
    "Explorer transaction",
  );
  const transactionHash = requireCanonicalHash(
    transaction.hash,
    "Explorer transaction.hash",
  );
  if (transactionHash !== expectedHash) {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction hash does not match the submitted transaction.",
    );
  }
  const transactionBlockHeight = requirePositiveSafeInteger(
    transaction.block,
    "Explorer transaction.block",
  );
  if (transactionBlockHeight !== blockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction block does not match authoritative Applied state.",
    );
  }
  if (transaction.status !== "Committed") {
    throw new TransactionFinalityIntegrityError(
      "Explorer transaction is not a successful committed transaction.",
    );
  }

  const block = requireRecord(input.blockPayload, "Explorer block");
  const blockHash = requireCanonicalHash(block.hash, "Explorer block.hash");
  const indexedBlockHeight = requirePositiveSafeInteger(
    block.height,
    "Explorer block.height",
  );
  if (indexedBlockHeight !== blockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer block height does not match the transaction block.",
    );
  }
  const transactionsTotal = requireNonNegativeSafeInteger(
    block.transactions_total,
    "Explorer block.transactions_total",
  );
  if (transactionsTotal < 1) {
    throw new TransactionFinalityIntegrityError(
      "The transaction block reports no external transactions.",
    );
  }
  requireCanonicalHash(
    block.transactions_hash,
    "Explorer block.transactions_hash",
  );

  const metrics = requireRecord(input.metricsPayload, "Explorer metrics");
  const currentBlockHeight = requireNonNegativeSafeInteger(
    metrics.block,
    "Explorer metrics.block",
  );
  const finalizedBlockHeight = requireNonNegativeSafeInteger(
    metrics.finalized_block,
    "Explorer metrics.finalized_block",
  );
  if (currentBlockHeight < blockHeight) {
    throw new TransactionFinalityIntegrityError(
      "Explorer metrics current block is behind the indexed transaction block.",
    );
  }
  if (finalizedBlockHeight < blockHeight) {
    throw new TransactionFinalityPendingError(
      `Transaction block ${blockHeight} is not finalized yet (finalized height ${finalizedBlockHeight}).`,
    );
  }

  return {
    status: "finalized",
    transactionHash: expectedHash,
    blockHeight,
    blockHash,
    finalizedBlockHeight,
  };
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
  const now = input.now ?? Date.now;
  const deadline = now() + input.timeoutMs;
  let lastStatusKind: string | null = null;
  let lastEvidenceError: unknown = null;

  while (now() <= deadline) {
    let status: ParsedPipelineStatus | null = null;
    try {
      const statusPayload = await input.getGlobalStatus();
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

    if (status && TERMINAL_FAILURE_KINDS.has(status.kind)) {
      if (input.buildTerminalFailure) {
        throw await input.buildTerminalFailure(status.kind, status.payload);
      }
      throw new TransactionFinalityTerminalError(
        hashHex,
        status.kind,
        status.payload,
      );
    }

    if (status?.kind === "Applied" && status.blockHeight !== null) {
      try {
        const [transactionPayload, blockPayload, metricsPayload] =
          await Promise.all([
            input.getExplorerTransaction(),
            input.getExplorerBlock(status.blockHeight),
            input.getExplorerMetrics(),
          ]);
        const confirmationPayload = await input.getGlobalStatus();
        if (confirmationPayload === null || confirmationPayload === undefined) {
          throw new TransactionFinalityPendingError(
            "Global Applied confirmation temporarily disappeared.",
          );
        }
        const confirmationStatus = parseGlobalPipelineStatus(
          confirmationPayload,
          hashHex,
        );
        if (TERMINAL_FAILURE_KINDS.has(confirmationStatus.kind)) {
          if (input.buildTerminalFailure) {
            throw await input.buildTerminalFailure(
              confirmationStatus.kind,
              confirmationStatus.payload,
            );
          }
          throw new TransactionFinalityTerminalError(
            hashHex,
            confirmationStatus.kind,
            confirmationStatus.payload,
          );
        }
        const proof = assertFinalizedTransactionEvidence({
          expectedHashHex: hashHex,
          appliedStatus: status,
          confirmationStatus,
          transactionPayload,
          blockPayload,
          metricsPayload,
        });
        return {
          proof,
          statusPayload: confirmationStatus.payload,
          transactionPayload: requireRecord(
            transactionPayload,
            "Explorer transaction",
          ),
        };
      } catch (error) {
        if (
          error instanceof TransactionFinalityIntegrityError ||
          error instanceof TransactionFinalityTerminalError
        ) {
          throw error;
        }
        lastEvidenceError = error;
      }
    }

    const remainingMs = deadline - now();
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
  throw new Error(
    lastStatusKind
      ? `Transaction ${hashHex} stayed in ${lastStatusKind} and was not proven in a finalized block within ${seconds} seconds.${evidenceDetail}`
      : `Transaction ${hashHex} was not proven in a finalized block within ${seconds} seconds.${evidenceDetail}`,
  );
};

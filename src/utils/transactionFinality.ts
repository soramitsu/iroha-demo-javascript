import type {
  TransactionFinalityProof,
  TransactionSubmissionResult,
} from "@/types/iroha";

const CANONICAL_HASH_HEX = /^[0-9a-f]{64}$/u;

type FinalityBearingResult = {
  hash?: unknown;
  tx_hash_hex?: unknown;
  finality?: unknown;
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value as number;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
};

/**
 * Renderer-side fail-closed boundary for mutation results.
 *
 * The preload bridge performs the authoritative Torii reads. This second check
 * prevents a queued, accepted, or merely committed receipt from ever being
 * rendered as successful if a bridge contract regresses.
 */
export const assertFinalizedTransactionResult = (
  value: unknown,
  hashField: "hash" | "tx_hash_hex" = "hash",
): {
  hash: string;
  finality: TransactionFinalityProof;
} => {
  const result = requireRecord(
    value,
    "Transaction result",
  ) as FinalityBearingResult;
  const hash = String(result[hashField] ?? "").trim();
  if (!hash) {
    throw new Error(`Transaction result.${hashField} is required.`);
  }
  const finality = requireRecord(result.finality, "Transaction finality proof");
  if (finality.status !== "finalized") {
    throw new Error("Transaction result was not proven in a finalized block.");
  }
  if (finality.transactionHash !== hash) {
    throw new Error(
      "Transaction finality proof does not match the submitted transaction.",
    );
  }
  const blockHeight = requirePositiveSafeInteger(
    finality.blockHeight,
    "Transaction finality block height",
  );
  if (
    typeof finality.blockHash !== "string" ||
    !CANONICAL_HASH_HEX.test(finality.blockHash)
  ) {
    throw new Error(
      "Transaction finality block hash must be a canonical lowercase 32-byte hash.",
    );
  }
  const finalizedBlockHeight = requireNonNegativeSafeInteger(
    finality.finalizedBlockHeight,
    "Finalized ledger height",
  );
  if (finalizedBlockHeight < blockHeight) {
    throw new Error("Transaction block is above the finalized ledger height.");
  }
  return {
    hash,
    finality: {
      status: "finalized",
      transactionHash: hash,
      blockHeight,
      blockHash: finality.blockHash,
      finalizedBlockHeight,
    },
  };
};

export const assertFinalizedSubmissionResult = (
  value: TransactionSubmissionResult,
) => assertFinalizedTransactionResult(value, "hash");

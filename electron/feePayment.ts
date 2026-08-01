import type { BrowserFeePayment } from "@iroha/iroha-js/transaction-codec";

const RETIRED_FEE_METADATA_KEYS = new Set([
  "fee_sponsor",
  "gas_asset_id",
  "gas_limit",
]);

/**
 * Build the default signer-funded intent without inventing a fee asset.
 * Charge limits must come from an endpoint-backed quote flow; an empty list is
 * the only safe local default when no mapped quote is available.
 */
export const buildAuthorityFeePaymentIntent = (
  gasLimit: number | null = null,
): BrowserFeePayment => {
  if (gasLimit !== null && (!Number.isSafeInteger(gasLimit) || gasLimit <= 0)) {
    throw new Error("feePayment.gasLimit must be a positive safe integer.");
  }
  return {
    payer: "authority",
    chargeLimits: [],
    gasLimit,
  };
};

/** Remove retired, unsigned fee-selection hints while preserving app metadata. */
export const stripRetiredFeeMetadata = (
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(metadata ?? {}).filter(
      ([key]) => !RETIRED_FEE_METADATA_KEYS.has(key),
    ),
  );

/**
 * Read the governed IVM gas bound from the old in-process metadata envelope,
 * then remove all retired fee keys before the transaction reaches the wire.
 */
export const extractIvmFeeContext = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  operationLabel: string,
): {
  feePayment: BrowserFeePayment;
  gasLimit: number;
  metadata: Record<string, unknown>;
} => {
  const gasLimit = metadata?.gas_limit;
  if (
    typeof gasLimit !== "number" ||
    !Number.isSafeInteger(gasLimit) ||
    gasLimit <= 0
  ) {
    throw new Error(
      `${operationLabel} requires a positive safe-integer gas_limit from governed material.`,
    );
  }
  return {
    feePayment: buildAuthorityFeePaymentIntent(gasLimit),
    gasLimit,
    metadata: stripRetiredFeeMetadata(metadata),
  };
};

import { deriveAssetSymbol, formatAssetDefinitionLabel } from "@/utils/assetId";

const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export type TransactionFeeLike = {
  amount?: string | number | null;
  quantity?: string | number | null;
  assetId?: string | null;
  asset_id?: string | null;
  asset?: string | null;
  feeAssetId?: string | null;
  fee_asset_id?: string | null;
  fee_amount?: string | number | null;
  feeAmount?: string | number | null;
  gas_asset_id?: string | null;
  gasAssetId?: string | null;
  source?: string | null;
  estimated?: boolean | null;
};

type TransactionFeeContainer = TransactionFeeLike & {
  fee?: TransactionFeeLike | string | number | null;
  fees?: TransactionFeeLike | TransactionFeeLike[] | string | number | null;
  tx_fee?: TransactionFeeLike | string | number | null;
  txFee?: TransactionFeeLike | string | number | null;
  transaction_fee?: TransactionFeeLike | string | number | null;
  transactionFee?: TransactionFeeLike | string | number | null;
  network_fee?: TransactionFeeLike | string | number | null;
  networkFee?: TransactionFeeLike | string | number | null;
  fee_amount?: string | number | null;
  feeAmount?: string | number | null;
};

const trim = (value: unknown) => String(value ?? "").trim();

export const transactionFeeHintForEndpoint = (
  toriiUrl: unknown,
): TransactionFeeLike | null => {
  const literal = trim(toriiUrl);
  if (!literal) {
    return null;
  }
  try {
    new URL(literal);
  } catch {
    return null;
  }
  return {
    fee_amount: "0.01",
    fee_asset_id: SORA_XOR_ASSET_DEFINITION_ID,
    source: "estimated",
  };
};

const readNestedFee = (
  value: TransactionFeeLike | string | number | null | undefined,
): TransactionFeeLike | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    return { amount: value };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
};

const readFeeCollection = (
  value:
    | TransactionFeeLike
    | TransactionFeeLike[]
    | string
    | number
    | null
    | undefined,
): TransactionFeeLike | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const fee = readNestedFee(item);
      if (fee) {
        return fee;
      }
    }
    return null;
  }
  return readNestedFee(value);
};

const readDirectTransactionFee = (
  record: TransactionFeeContainer,
): TransactionFeeLike | null =>
  readNestedFee(record.fee) ??
  readFeeCollection(record.fees) ??
  readNestedFee(record.tx_fee) ??
  readNestedFee(record.txFee) ??
  readNestedFee(record.transaction_fee) ??
  readNestedFee(record.transactionFee) ??
  readNestedFee(record.network_fee) ??
  readNestedFee(record.networkFee) ??
  (trim(record.fee_amount ?? record.feeAmount)
    ? {
        amount: record.fee_amount ?? record.feeAmount,
        assetId:
          record.feeAssetId ??
          record.fee_asset_id ??
          record.gasAssetId ??
          record.gas_asset_id,
        source: record.source,
        estimated: record.estimated,
      }
    : null) ??
  (trim(
    record.feeAssetId ??
      record.fee_asset_id ??
      record.gasAssetId ??
      record.gas_asset_id,
  )
    ? {
        assetId:
          record.feeAssetId ??
          record.fee_asset_id ??
          record.gasAssetId ??
          record.gas_asset_id,
        source: record.source,
        estimated: record.estimated,
      }
    : null);

const FEE_CONTAINER_KEYS = [
  "status",
  "content",
  "result",
  "execution_result",
  "executionResult",
  "receipt",
  "committed",
  "transaction",
] as const;

const readTransactionFeeFromContainer = (
  value: unknown,
  seen: WeakSet<object>,
): TransactionFeeLike | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  const record = value as TransactionFeeContainer & Record<string, unknown>;
  const direct = readDirectTransactionFee(record);
  if (direct) {
    return direct;
  }

  for (const key of FEE_CONTAINER_KEYS) {
    const fee = readTransactionFeeFromContainer(record[key], seen);
    if (fee) {
      return fee;
    }
  }
  return null;
};

export const readTransactionFee = (
  value: unknown,
): TransactionFeeLike | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return readTransactionFeeFromContainer(value, new WeakSet());
};

const formatFeeAsset = (fee: TransactionFeeLike): string => {
  const assetId = trim(
    fee.assetId ??
      fee.asset_id ??
      fee.feeAssetId ??
      fee.fee_asset_id ??
      fee.gasAssetId ??
      fee.gas_asset_id ??
      fee.asset,
  );
  if (!assetId) {
    return "asset";
  }
  if (assetId.toLowerCase() === SORA_XOR_ASSET_DEFINITION_ID.toLowerCase()) {
    return "XOR";
  }
  const symbol = deriveAssetSymbol(assetId, "");
  return symbol || formatAssetDefinitionLabel(assetId, assetId);
};

const isEstimatedFee = (fee: TransactionFeeLike): boolean =>
  Boolean(fee.estimated) || trim(fee.source).toLowerCase() === "estimated";

export const formatTransactionFeeInline = (
  value: unknown,
  t: Translate,
): string => {
  const fee = readTransactionFee(value);
  if (!fee) {
    return t("Charged on-chain");
  }
  const amount = trim(
    fee.amount ?? fee.quantity ?? fee.fee_amount ?? fee.feeAmount,
  );
  if (amount) {
    return `${amount} ${formatFeeAsset(fee)}`;
  }
  return t("Charged on-chain");
};

export const formatTransactionFee = (
  value: unknown,
  t: Translate,
  fallbackFee?: unknown,
): string => {
  const fee = readTransactionFee(value) ?? readTransactionFee(fallbackFee);
  if (!fee) {
    return t("Network fee: charged on-chain (amount unavailable).");
  }
  const amount = trim(
    fee.amount ?? fee.quantity ?? fee.fee_amount ?? fee.feeAmount,
  );
  const asset = formatFeeAsset(fee);
  if (amount) {
    return t(
      isEstimatedFee(fee)
        ? "Network fee: {amount} {asset} (estimated)."
        : "Network fee: {amount} {asset}.",
      { amount, asset },
    );
  }
  return t("Network fee: charged on-chain ({asset}).", { asset });
};

export const appendTransactionFee = (
  message: string,
  transactionResult: unknown,
  t: Translate,
  fallbackFee?: unknown,
): string => {
  const base = trim(message);
  const fee = formatTransactionFee(transactionResult, t, fallbackFee);
  return base ? `${base} ${fee}` : fee;
};

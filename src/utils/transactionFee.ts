import {
  areAssetDefinitionIdsEquivalent,
  deriveAssetSymbol,
  formatAssetDefinitionLabel,
} from "@/utils/assetId";

const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export type TransactionFeeComponentKind = "nexus" | "pipeline_gas";

/**
 * The only transaction-fee DTO exposed to the renderer.
 *
 * Amounts are the signed quote's charge limits, not post-commit debits. Torii's
 * current pipeline and explorer transaction projections do not expose a
 * committed-fee contract, so they must never be adapted into this shape.
 */
export interface TransactionFeeQuoteView {
  payer: "authority" | "sponsor";
  components: Array<{
    kind: TransactionFeeComponentKind;
    assetDefinitionId: string;
    maxAmount: string;
  }>;
  nextBlockHeight: string;
}

const formatFeeAsset = (assetDefinitionId: string): string => {
  if (
    areAssetDefinitionIdsEquivalent(
      assetDefinitionId,
      SORA_XOR_ASSET_DEFINITION_ID,
    )
  ) {
    return "XOR";
  }
  const symbol = deriveAssetSymbol(assetDefinitionId, "");
  return (
    symbol || formatAssetDefinitionLabel(assetDefinitionId, assetDefinitionId)
  );
};

const formatFeeComponents = (
  quote: TransactionFeeQuoteView,
  t: Translate,
): string =>
  quote.components
    .map((component) =>
      t("{amount} {asset} ({kind})", {
        amount: component.maxAmount,
        asset: formatFeeAsset(component.assetDefinitionId),
        kind:
          component.kind === "pipeline_gas" ? t("Pipeline gas") : t("Nexus"),
      }),
    )
    .join(" + ");

export const formatTransactionFeeInline = (
  quote: TransactionFeeQuoteView | null | undefined,
  t: Translate,
): string => {
  if (!quote) {
    return t("Fee quote unavailable");
  }
  if (quote.components.length === 0) {
    return t("Quoted maximum: none");
  }
  return t("Quoted maximum: {components}", {
    components: formatFeeComponents(quote, t),
  });
};

export const formatTransactionFee = (
  quote: TransactionFeeQuoteView | null | undefined,
  t: Translate,
): string => {
  if (!quote) {
    return t("Network fee quote unavailable.");
  }
  if (quote.components.length === 0) {
    return t("Quoted maximum network fee: none.");
  }
  return t("Quoted maximum network fee: {components} (paid by {payer}).", {
    components: formatFeeComponents(quote, t),
    payer: quote.payer === "authority" ? t("wallet") : t("sponsor"),
  });
};

export const appendTransactionFee = (
  message: string,
  quote: TransactionFeeQuoteView | null | undefined,
  t: Translate,
): string => {
  const base = message.trim();
  const fee = formatTransactionFee(quote, t);
  return base ? `${base} ${fee}` : fee;
};

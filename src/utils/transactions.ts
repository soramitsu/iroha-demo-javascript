export type TransferDirection = "Sent" | "Received" | "Other";

export type TransferInsight = {
  direction: TransferDirection;
  amount: string | null;
  counterparty: string | null;
};

export type TransferInstruction = {
  Transfer?: {
    Asset?: {
      source?: string;
      object?: string;
      destination?: string;
    };
  };
};

export type AccountTransactionLike = {
  instructions?: Array<TransferInstruction | null | undefined>;
};

const splitAssetSource = (source: string | undefined) => {
  if (!source) {
    return { definition: "", accountId: "" };
  }
  if (source.includes("##")) {
    const [definition, accountId] = source.split("##");
    return { definition, accountId: accountId ?? "" };
  }
  return { definition: source, accountId: "" };
};

export const extractTransferInsight = (
  tx: AccountTransactionLike | null | undefined,
  accountId: string | null | undefined,
): TransferInsight | null => {
  if (!tx || !accountId) {
    return null;
  }
  for (const instruction of tx.instructions ?? []) {
    const asset = instruction?.Transfer?.Asset;
    if (!asset) {
      continue;
    }
    const { definition, accountId: sourceAccount } = splitAssetSource(
      asset.source,
    );
    const destination = asset.destination ?? "";
    const amount = asset.object ?? null;
    const isOutbound = sourceAccount === accountId;
    const isInbound = destination === accountId;
    const direction: TransferDirection = isOutbound
      ? "Sent"
      : isInbound
        ? "Received"
        : "Other";
    const counterparty = isOutbound
      ? destination || null
      : sourceAccount || definition || destination || null;
    return {
      direction,
      amount,
      counterparty,
    };
  }
  return null;
};

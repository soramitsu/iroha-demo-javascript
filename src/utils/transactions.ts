import { splitAssetReference } from "@/utils/assetId";

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
  authority?: string;
};

const splitAssetSource = (source: string | undefined) => {
  const parsed = splitAssetReference(source);
  return {
    definition: parsed.definitionId,
    accountId: parsed.accountId,
  };
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
    const authority = tx.authority ?? "";
    const amount = asset.object ?? null;
    const isOutbound = sourceAccount === accountId || authority === accountId;
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

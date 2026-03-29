const normalizeConfidentialMode = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const trimString = (value: unknown): string => String(value ?? "").trim();

const stringSetFrom = (values: Array<string | null | undefined>): Set<string> =>
  new Set(
    values.map((value) => trimString(value).toLowerCase()).filter(Boolean),
  );

const normalizeIntegerAmount = (value: unknown): bigint | null => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return null;
    }
    return BigInt(value);
  }
  const normalized = trimString(value);
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  return BigInt(normalized);
};

type ConfidentialInstructionRecord = Record<string, unknown>;

type ConfidentialInstructionLike = Record<string, unknown>;

export type ConfidentialBalanceTransactionLike = {
  result_ok?: boolean;
  authority?: string;
  instructions?: Array<ConfidentialInstructionLike | null | undefined>;
};

export type OnChainShieldedBalanceResult = {
  quantity: string | null;
  exact: boolean;
};

const matchesAssetDefinitionId = (
  value: unknown,
  assetDefinitionIds: Set<string>,
): boolean => assetDefinitionIds.has(trimString(value).toLowerCase());

export const deriveOnChainShieldedBalance = (
  transactions: Array<ConfidentialBalanceTransactionLike | null | undefined>,
  input: {
    assetDefinitionId?: string | null;
    assetDefinitionIds?: Array<string | null | undefined>;
    accountIds: Array<string | null | undefined>;
  },
): OnChainShieldedBalanceResult => {
  const normalizedAssetDefinitionIds = stringSetFrom([
    input.assetDefinitionId,
    ...(input.assetDefinitionIds ?? []),
  ]);
  const normalizedAccountIds = stringSetFrom(input.accountIds);
  if (
    normalizedAssetDefinitionIds.size === 0 ||
    normalizedAccountIds.size === 0
  ) {
    return { quantity: "0", exact: true };
  }

  let total = 0n;

  for (const transaction of transactions) {
    if (!transaction || transaction.result_ok === false) {
      continue;
    }
    const authority = trimString(transaction.authority).toLowerCase();
    const authorityMatches = normalizedAccountIds.has(authority);
    for (const instruction of transaction.instructions ?? []) {
      const zk =
        instruction &&
        typeof instruction === "object" &&
        !Array.isArray(instruction)
          ? (instruction as Record<string, unknown>).zk
          : null;
      if (!zk || typeof zk !== "object" || Array.isArray(zk)) {
        continue;
      }

      const zkRecord = zk as Record<
        string,
        ConfidentialInstructionRecord | null | undefined
      >;

      const shield = zkRecord.Shield;
      if (
        shield &&
        matchesAssetDefinitionId(shield.asset, normalizedAssetDefinitionIds)
      ) {
        const from = trimString(shield.from).toLowerCase();
        const amount = normalizeIntegerAmount(shield.amount);
        if (
          (authorityMatches || normalizedAccountIds.has(from)) &&
          amount !== null
        ) {
          total += amount;
        }
        continue;
      }

      const unshield = zkRecord.Unshield;
      if (
        unshield &&
        matchesAssetDefinitionId(unshield.asset, normalizedAssetDefinitionIds)
      ) {
        const to = trimString(unshield.to).toLowerCase();
        const amount = normalizeIntegerAmount(
          unshield.public_amount ?? unshield.publicAmount,
        );
        if (
          (authorityMatches || (!authority && normalizedAccountIds.has(to))) &&
          amount !== null
        ) {
          total -= amount;
        }
        continue;
      }

      const transfer = zkRecord.ZkTransfer;
      if (
        transfer &&
        matchesAssetDefinitionId(transfer.asset, normalizedAssetDefinitionIds)
      ) {
        return { quantity: null, exact: false };
      }
    }
  }

  return {
    quantity: total > 0n ? total.toString() : "0",
    exact: true,
  };
};

export const confidentialModeSupportsShield = (
  mode: string | null | undefined,
): boolean => {
  const normalized = normalizeConfidentialMode(mode);
  return (
    normalized === "shieldedonly" ||
    normalized === "convertible" ||
    normalized === "hybrid" ||
    normalized === "zknative"
  );
};

export const isPositiveWholeAmount = (
  value: string | number | null | undefined,
): boolean => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) && !/^0+$/.test(normalized);
};

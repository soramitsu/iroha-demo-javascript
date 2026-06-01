import type {
  NexusSumeragiStatus,
  PublicLanePendingRewardView,
  PublicLaneStakeShareView,
  PublicLaneValidatorRecordView,
} from "@/types/iroha";

export type DataspaceLaneOption = {
  dataspaceId: number;
  laneId: number;
  alias: string;
  validatorIds: string[];
};

export type DataspaceOption = {
  dataspaceId: number;
  label: string;
  lanes: DataspaceLaneOption[];
  totalValidators: number;
};

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const toNonNegativeInteger = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
};

const uniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((entry) => String(entry ?? "").trim()).filter(Boolean),
    ),
  ];
};

export const collectDataspaceOptions = (
  status: NexusSumeragiStatus | null | undefined,
): DataspaceOption[] => {
  const governance = Array.isArray(status?.lane_governance)
    ? status.lane_governance
    : [];
  const commitments = Array.isArray(status?.dataspace_commitments)
    ? status.dataspace_commitments
    : [];
  const lanesByDataspace = new Map<number, Map<number, DataspaceLaneOption>>();

  const upsertLane = (input: {
    dataspaceId: number;
    laneId: number;
    alias?: string;
    validatorIds?: string[];
  }) => {
    const byLane = lanesByDataspace.get(input.dataspaceId) ?? new Map();
    const current =
      byLane.get(input.laneId) ??
      ({
        dataspaceId: input.dataspaceId,
        laneId: input.laneId,
        alias: `Lane ${input.laneId}`,
        validatorIds: [],
      } satisfies DataspaceLaneOption);

    const nextAlias = input.alias?.trim() || current.alias;
    const nextValidatorIds = [
      ...new Set([
        ...(current.validatorIds ?? []),
        ...(input.validatorIds ?? []),
      ]),
    ];
    byLane.set(input.laneId, {
      ...current,
      alias: nextAlias,
      validatorIds: nextValidatorIds,
    });
    lanesByDataspace.set(input.dataspaceId, byLane);
  };

  for (const lane of governance) {
    const dataspaceId = toNonNegativeInteger(lane?.dataspace_id);
    const laneId = toNonNegativeInteger(lane?.lane_id);
    if (dataspaceId === null || laneId === null) {
      continue;
    }
    upsertLane({
      dataspaceId,
      laneId,
      alias: String(lane.alias ?? "").trim() || `Lane ${laneId}`,
      validatorIds: uniqueStrings(lane.validator_ids),
    });
  }

  for (const commitment of commitments) {
    const dataspaceId = toNonNegativeInteger(commitment?.dataspace_id);
    const laneId = toNonNegativeInteger(commitment?.lane_id);
    if (dataspaceId === null || laneId === null) {
      continue;
    }
    upsertLane({
      dataspaceId,
      laneId,
    });
  }

  return [...lanesByDataspace.entries()]
    .sort(([left], [right]) => left - right)
    .map(([dataspaceId, lanesById]): DataspaceOption => {
      const orderedLanes = [...lanesById.values()].sort(
        (left, right) => left.laneId - right.laneId,
      );
      const totalValidators = new Set(
        orderedLanes.flatMap((lane) => lane.validatorIds),
      ).size;
      return {
        dataspaceId,
        label: `Dataspace ${dataspaceId}`,
        lanes: orderedLanes,
        totalValidators,
      };
    });
};

export const chooseDefaultDataspaceId = (
  options: DataspaceOption[],
  preferredDataspaceId: number | null,
): number | null => {
  if (
    preferredDataspaceId !== null &&
    options.some((option) => option.dataspaceId === preferredDataspaceId)
  ) {
    return preferredDataspaceId;
  }
  return options[0]?.dataspaceId ?? null;
};

export const resolveLaneForDataspace = (
  options: DataspaceOption[],
  dataspaceId: number | null,
): DataspaceLaneOption | null => {
  if (dataspaceId === null) return null;
  const dataspace = options.find(
    (option) => option.dataspaceId === dataspaceId,
  );
  if (!dataspace) return null;
  return dataspace.lanes[0] ?? null;
};

export const pickDefaultValidator = (
  validators: PublicLaneValidatorRecordView[],
  currentValidator: string,
): string => {
  if (currentValidator) {
    const currentExists = validators.some(
      (validator) => validator.validator === currentValidator,
    );
    if (currentExists) {
      return currentValidator;
    }
  }

  const firstActive = validators.find(
    (validator) => validator.status.type === "Active",
  );
  return firstActive?.validator ?? validators[0]?.validator ?? "";
};

export const computeUnbondReleaseAtMs = (
  unbondingDelayMs: number,
  nowMs: number = Date.now(),
): number => {
  const safeDelay = Math.max(0, Math.floor(unbondingDelayMs));
  const safeNow = Math.max(0, Math.floor(nowMs));
  return safeNow + safeDelay;
};

const normalizeDecimalString = (value: string, label: string) => {
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a decimal numeric string.`);
  }
  const [rawInteger, rawFraction = ""] = normalized.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  return {
    integer: integer || "0",
    fraction,
  };
};

export const compareDecimalStrings = (left: string, right: string): number => {
  const leftValue = normalizeDecimalString(left, "left");
  const rightValue = normalizeDecimalString(right, "right");

  if (leftValue.integer.length !== rightValue.integer.length) {
    return leftValue.integer.length > rightValue.integer.length ? 1 : -1;
  }
  if (leftValue.integer !== rightValue.integer) {
    return leftValue.integer > rightValue.integer ? 1 : -1;
  }

  const scale = Math.max(leftValue.fraction.length, rightValue.fraction.length);
  if (scale === 0) {
    return 0;
  }
  const leftFraction = leftValue.fraction.padEnd(scale, "0");
  const rightFraction = rightValue.fraction.padEnd(scale, "0");
  if (leftFraction === rightFraction) {
    return 0;
  }
  return leftFraction > rightFraction ? 1 : -1;
};

export const hasClaimableRewards = (
  rewards: PublicLanePendingRewardView[] | null | undefined,
): boolean => {
  if (!Array.isArray(rewards) || rewards.length === 0) {
    return false;
  }
  return rewards.some((reward) => {
    try {
      return compareDecimalStrings(String(reward.amount ?? "0"), "0") > 0;
    } catch (_error) {
      return false;
    }
  });
};

export type RewardApyEstimate = {
  rewardAmount: number;
  bondedAmount: number;
  epochSpan: number;
  apyPercent: number;
};

export const parseDecimalAmount = (value: unknown): number | null => {
  const normalized = String(value ?? "").trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

export const sumDecimalAmounts = (
  values: Array<string | number | null | undefined>,
): number =>
  values.reduce<number>((total, value) => {
    const parsed = parseDecimalAmount(value);
    return parsed === null ? total : total + parsed;
  }, 0);

export const sumStakeShares = (
  shares: PublicLaneStakeShareView[] | null | undefined,
): number => {
  if (!Array.isArray(shares)) {
    return 0;
  }
  return sumDecimalAmounts(shares.map((share) => share.bonded));
};

export const sumRewardAmounts = (
  rewards: PublicLanePendingRewardView[] | null | undefined,
): number => {
  if (!Array.isArray(rewards)) {
    return 0;
  }
  return sumDecimalAmounts(rewards.map((reward) => reward.amount));
};

export const resolveRewardEpochSpan = (
  rewards: PublicLanePendingRewardView[] | null | undefined,
): number => {
  if (!Array.isArray(rewards) || rewards.length === 0) {
    return 0;
  }
  const ranges = rewards
    .map((reward) => ({
      last: toNonNegativeInteger(reward.last_claimed_epoch),
      pending: toNonNegativeInteger(reward.pending_through_epoch),
    }))
    .filter(
      (range): range is { last: number; pending: number } =>
        range.last !== null && range.pending !== null,
    );
  if (!ranges.length) {
    return 0;
  }
  const earliestLast = Math.min(...ranges.map((range) => range.last));
  const latestPending = Math.max(...ranges.map((range) => range.pending));
  return Math.max(0, latestPending - earliestLast);
};

export const calculateRewardApyEstimate = (input: {
  rewards: PublicLanePendingRewardView[] | null | undefined;
  bondedAmount: string | number | null | undefined;
  epochDurationHours: number;
}): RewardApyEstimate | null => {
  const bondedAmount = parseDecimalAmount(input.bondedAmount);
  const rewardAmount = sumRewardAmounts(input.rewards);
  const epochSpan = resolveRewardEpochSpan(input.rewards);
  if (
    bondedAmount === null ||
    bondedAmount <= 0 ||
    rewardAmount <= 0 ||
    epochSpan <= 0 ||
    !Number.isFinite(input.epochDurationHours) ||
    input.epochDurationHours <= 0
  ) {
    return null;
  }

  const elapsedHours = epochSpan * input.epochDurationHours;
  const annualization = (365 * 24) / elapsedHours;
  const apyPercent = (rewardAmount / bondedAmount) * annualization * 100;
  if (!Number.isFinite(apyPercent) || apyPercent < 0) {
    return null;
  }
  return {
    rewardAmount,
    bondedAmount,
    epochSpan,
    apyPercent,
  };
};

export const extractValidatorCommissionBps = (
  metadata: Record<string, unknown> | null | undefined,
): number | null => {
  if (!metadata) {
    return null;
  }
  const rawBps = metadata.commission_bps ?? metadata.commissionBps;
  if (rawBps !== undefined && rawBps !== null && rawBps !== "") {
    const parsed = Number(rawBps);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000) {
      return parsed;
    }
  }

  const rawPercent = metadata.commission_percent ?? metadata.commissionPercent;
  if (rawPercent !== undefined && rawPercent !== null && rawPercent !== "") {
    const parsed = Number(rawPercent);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      return Math.round(parsed * 100);
    }
  }
  return null;
};

export const readValidatorEndpoint = (
  metadata: Record<string, unknown> | null | undefined,
): string => {
  if (!metadata) {
    return "";
  }
  for (const key of [
    "endpoint",
    "rpc_url",
    "rpcUrl",
    "p2p_endpoint",
    "p2pEndpoint",
  ]) {
    const value = String(metadata[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const createUnbondRequestId = (entropy?: Uint8Array): string => {
  if (entropy && entropy.length > 0) {
    return toHex(entropy);
  }

  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
};

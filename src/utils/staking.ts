import type {
  NexusSumeragiStatus,
  PublicLanePendingRewardView,
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

import type { ToriiSumeragiStatus } from "@iroha/iroha-js";
import type {
  ExplorerAssetDefinitionEconometricsResponse,
  ExplorerAssetDefinitionSnapshotResponse,
  ExplorerMetricsResponse,
  NetworkGovernanceStats,
  NetworkRuntimeStats,
} from "../src/types/iroha";

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toNonNegativeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed =
    typeof value === "string" && value.trim().length
      ? Number(value)
      : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const toStringOrNull = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const toBooleanOrNull = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const firstNonNull = <T>(...values: Array<T | null | undefined>): T | null => {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};

const firstPositiveNumber = (
  ...values: Array<number | null | undefined>
): number | null => {
  for (const value of values) {
    if (value !== null && value !== undefined && value > 0) {
      return value;
    }
  }
  return firstNonNull(...values);
};

const requireString = (value: unknown, label: string): string => {
  const normalized = toStringOrNull(value);
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return normalized;
};

const requireNumber = (value: unknown, label: string): number => {
  const normalized = toNonNegativeNumber(value);
  if (normalized === null) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return normalized;
};

const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const record = toRecord(value);
  if (!record) {
    throw new Error(`${label} must be an object.`);
  }
  return record;
};

export const normalizeExplorerAssetDefinitionSnapshotPayload = (
  payload: unknown,
): ExplorerAssetDefinitionSnapshotResponse => {
  const record = requireRecord(payload, "Explorer asset definition snapshot");
  const distributionRecord = requireRecord(
    record.distribution,
    "Explorer asset definition distribution",
  );
  const topHolderItems = requireArray(
    record.top_holders,
    "Explorer asset definition top_holders",
  );

  return {
    definitionId: requireString(record.definition_id, "definition_id"),
    computedAtMs: requireNumber(record.computed_at_ms, "computed_at_ms"),
    holdersTotal: requireNumber(record.holders_total, "holders_total"),
    totalSupply: requireString(record.total_supply, "total_supply"),
    topHolders: topHolderItems.map((item, index) => {
      const holderRecord = requireRecord(item, `top_holders[${index}]`);
      return {
        accountId: requireString(holderRecord.account_id, "account_id"),
        balance: requireString(holderRecord.balance, "balance"),
      };
    }),
    distribution: {
      gini: requireNumber(distributionRecord.gini, "distribution.gini"),
      hhi: requireNumber(distributionRecord.hhi, "distribution.hhi"),
      theil: requireNumber(distributionRecord.theil, "distribution.theil"),
      entropy: requireNumber(
        distributionRecord.entropy,
        "distribution.entropy",
      ),
      entropyNormalized: requireNumber(
        distributionRecord.entropy_normalized,
        "distribution.entropy_normalized",
      ),
      nakamoto33: requireNumber(
        distributionRecord.nakamoto_33,
        "distribution.nakamoto_33",
      ),
      nakamoto51: requireNumber(
        distributionRecord.nakamoto_51,
        "distribution.nakamoto_51",
      ),
      nakamoto67: requireNumber(
        distributionRecord.nakamoto_67,
        "distribution.nakamoto_67",
      ),
      top1: requireNumber(distributionRecord.top1, "distribution.top1"),
      top5: requireNumber(distributionRecord.top5, "distribution.top5"),
      top10: requireNumber(distributionRecord.top10, "distribution.top10"),
      median: toStringOrNull(distributionRecord.median),
      p90: toStringOrNull(distributionRecord.p90),
      p99: toStringOrNull(distributionRecord.p99),
      lorenz: requireArray(
        distributionRecord.lorenz,
        "distribution.lorenz",
      ).map((item, index) => {
        const point = requireRecord(item, `distribution.lorenz[${index}]`);
        return {
          population: requireNumber(point.population, "population"),
          share: requireNumber(point.share, "share"),
        };
      }),
    },
  };
};

export const normalizeExplorerAssetDefinitionEconometricsPayload = (
  payload: unknown,
): ExplorerAssetDefinitionEconometricsResponse => {
  const record = requireRecord(
    payload,
    "Explorer asset definition econometrics",
  );

  return {
    definitionId: requireString(record.definition_id, "definition_id"),
    computedAtMs: requireNumber(record.computed_at_ms, "computed_at_ms"),
    velocityWindows: requireArray(
      record.velocity_windows,
      "velocity_windows",
    ).map((item, index) => {
      const windowRecord = requireRecord(item, `velocity_windows[${index}]`);
      return {
        key: requireString(windowRecord.key, "key"),
        startMs: requireNumber(windowRecord.start_ms, "start_ms"),
        endMs: requireNumber(windowRecord.end_ms, "end_ms"),
        transfers: requireNumber(windowRecord.transfers, "transfers"),
        uniqueSenders: requireNumber(
          windowRecord.unique_senders,
          "unique_senders",
        ),
        uniqueReceivers: requireNumber(
          windowRecord.unique_receivers,
          "unique_receivers",
        ),
        amount: requireString(windowRecord.amount, "amount"),
      };
    }),
    issuanceWindows: requireArray(
      record.issuance_windows,
      "issuance_windows",
    ).map((item, index) => {
      const windowRecord = requireRecord(item, `issuance_windows[${index}]`);
      return {
        key: requireString(windowRecord.key, "key"),
        startMs: requireNumber(windowRecord.start_ms, "start_ms"),
        endMs: requireNumber(windowRecord.end_ms, "end_ms"),
        mintCount: requireNumber(windowRecord.mint_count, "mint_count"),
        burnCount: requireNumber(windowRecord.burn_count, "burn_count"),
        minted: requireString(windowRecord.minted, "minted"),
        burned: requireString(windowRecord.burned, "burned"),
        net: requireString(windowRecord.net, "net"),
      };
    }),
    issuanceSeries: requireArray(record.issuance_series, "issuance_series").map(
      (item, index) => {
        const pointRecord = requireRecord(item, `issuance_series[${index}]`);
        return {
          bucketStartMs: requireNumber(
            pointRecord.bucket_start_ms,
            "bucket_start_ms",
          ),
          minted: requireString(pointRecord.minted, "minted"),
          burned: requireString(pointRecord.burned, "burned"),
          net: requireString(pointRecord.net, "net"),
        };
      },
    ),
  };
};

export const extractRuntimeStatsFromStatusSnapshot = (
  snapshot: unknown,
  explorerMetrics: ExplorerMetricsResponse | null,
  sumeragiStatus?: unknown,
): NetworkRuntimeStats => {
  const snapshotRecord = toRecord(snapshot);
  const statusRecord =
    toRecord(snapshotRecord?.status) ??
    snapshotRecord ??
    ({} as Record<string, unknown>);
  const rawRecord = toRecord(statusRecord.raw);
  const rawSumeragiRecord =
    toRecord(rawRecord?.sumeragi) ??
    toRecord(statusRecord.sumeragi) ??
    ({} as Record<string, unknown>);
  const sumeragiRecord = toRecord(sumeragiStatus) ?? {};
  const statusTxQueueRecord = toRecord(rawSumeragiRecord.tx_queue) ?? {};
  const sumeragiTxQueueRecord = toRecord(sumeragiRecord.tx_queue) ?? {};
  const statusHighestQcRecord = toRecord(rawSumeragiRecord.highest_qc) ?? {};
  const sumeragiHighestQcRecord = toRecord(sumeragiRecord.highest_qc) ?? {};
  const statusLockedQcRecord = toRecord(rawSumeragiRecord.locked_qc) ?? {};
  const sumeragiLockedQcRecord = toRecord(sumeragiRecord.locked_qc) ?? {};
  const statusCommitQcRecord = toRecord(rawSumeragiRecord.commit_qc) ?? {};
  const sumeragiCommitQcRecord = toRecord(sumeragiRecord.commit_qc) ?? {};

  const currentBlockHeight =
    explorerMetrics?.blockHeight ??
    firstNonNull(
      toNonNegativeNumber(statusRecord.block_height),
      toNonNegativeNumber(statusRecord.blocks),
      toNonNegativeNumber(rawSumeragiRecord.block_height),
      toNonNegativeNumber(rawSumeragiRecord.blocks),
      toNonNegativeNumber(statusHighestQcRecord.height),
      toNonNegativeNumber(sumeragiHighestQcRecord.height),
      toNonNegativeNumber(statusCommitQcRecord.height),
      toNonNegativeNumber(sumeragiCommitQcRecord.height),
    );
  const finalizedBlockHeight =
    explorerMetrics?.finalizedBlockHeight ??
    firstNonNull(
      toNonNegativeNumber(statusRecord.finalized_block_height),
      toNonNegativeNumber(statusRecord.finalized_blocks),
      toNonNegativeNumber(rawSumeragiRecord.finalized_block_height),
      toNonNegativeNumber(rawSumeragiRecord.highest_qc_height),
      toNonNegativeNumber(statusHighestQcRecord.height),
      toNonNegativeNumber(sumeragiHighestQcRecord.height),
      toNonNegativeNumber(statusCommitQcRecord.height),
      toNonNegativeNumber(sumeragiCommitQcRecord.height),
    );

  return {
    queueSize: firstNonNull(
      toNonNegativeNumber(statusRecord.queue_size),
      toNonNegativeNumber(rawSumeragiRecord.tx_queue_depth),
      toNonNegativeNumber(statusTxQueueRecord.depth),
      toNonNegativeNumber(sumeragiTxQueueRecord.depth),
    ),
    queueCapacity: firstPositiveNumber(
      toNonNegativeNumber(rawSumeragiRecord.tx_queue_capacity),
      toNonNegativeNumber(statusRecord.tx_queue_capacity),
      toNonNegativeNumber(statusTxQueueRecord.capacity),
      toNonNegativeNumber(sumeragiTxQueueRecord.capacity),
    ),
    commitTimeMs:
      toNonNegativeNumber(statusRecord.commit_time_ms) ??
      toNonNegativeNumber(rawSumeragiRecord.commit_time_ms) ??
      toNonNegativeNumber(rawSumeragiRecord.effective_commit_time_ms) ??
      toNonNegativeNumber(sumeragiRecord.effective_commit_time_ms),
    effectiveBlockTimeMs:
      toNonNegativeNumber(rawSumeragiRecord.effective_block_time_ms) ??
      toNonNegativeNumber(statusRecord.effective_block_time_ms) ??
      toNonNegativeNumber(sumeragiRecord.effective_block_time_ms),
    txQueueSaturated:
      toBooleanOrNull(rawSumeragiRecord.tx_queue_saturated) ??
      toBooleanOrNull(statusRecord.tx_queue_saturated) ??
      toBooleanOrNull(statusTxQueueRecord.saturated) ??
      toBooleanOrNull(sumeragiTxQueueRecord.saturated),
    highestQcHeight:
      toNonNegativeNumber(rawSumeragiRecord.highest_qc_height) ??
      toNonNegativeNumber(rawSumeragiRecord.highestQcHeight) ??
      toNonNegativeNumber(statusHighestQcRecord.height) ??
      toNonNegativeNumber(sumeragiHighestQcRecord.height),
    lockedQcHeight:
      toNonNegativeNumber(rawSumeragiRecord.locked_qc_height) ??
      toNonNegativeNumber(rawSumeragiRecord.lockedQcHeight) ??
      toNonNegativeNumber(statusLockedQcRecord.height) ??
      toNonNegativeNumber(sumeragiLockedQcRecord.height),
    currentBlockHeight,
    finalizedBlockHeight,
    finalizationLag:
      currentBlockHeight !== null && finalizedBlockHeight !== null
        ? Math.max(0, currentBlockHeight - finalizedBlockHeight)
        : null,
  };
};

export const extractGovernanceStats = (
  status: ToriiSumeragiStatus | null | undefined,
): NetworkGovernanceStats => {
  const laneIds = new Set<number>();
  const dataspaceIds = new Set<number>();
  const validatorIds = new Set<string>();

  const laneGovernance = Array.isArray(status?.lane_governance)
    ? status.lane_governance
    : [];
  for (const item of laneGovernance) {
    const itemRecord = item as unknown as Record<string, unknown>;
    const laneId = toNonNegativeNumber(itemRecord.lane_id);
    if (laneId !== null) {
      laneIds.add(laneId);
    }
    const dataspaceId = toNonNegativeNumber(itemRecord.dataspace_id);
    if (dataspaceId !== null) {
      dataspaceIds.add(dataspaceId);
    }
    const validatorList = itemRecord.validator_ids;
    if (!Array.isArray(validatorList)) {
      continue;
    }
    for (const validatorId of validatorList) {
      const normalized = toStringOrNull(validatorId);
      if (normalized) {
        validatorIds.add(normalized);
      }
    }
  }

  const dataspaceCommitments = Array.isArray(status?.dataspace_commitments)
    ? status.dataspace_commitments
    : [];
  for (const item of dataspaceCommitments) {
    const itemRecord = item as unknown as Record<string, unknown>;
    const laneId = toNonNegativeNumber(itemRecord.lane_id);
    if (laneId !== null) {
      laneIds.add(laneId);
    }
    const dataspaceId = toNonNegativeNumber(itemRecord.dataspace_id);
    if (dataspaceId !== null) {
      dataspaceIds.add(dataspaceId);
    }
  }

  return {
    laneCount: laneIds.size,
    dataspaceCount: dataspaceIds.size,
    validatorCount: validatorIds.size,
  };
};

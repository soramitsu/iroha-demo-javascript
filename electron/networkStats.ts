import type {
  ExplorerAssetDefinitionEconometricsResponse,
  ExplorerAssetDefinitionSnapshotResponse,
  ExplorerMetricsResponse,
  NexusLifecycleView,
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

const toNonNegativeInteger = (value: unknown): number | null => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value))
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const toStringOrNull = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
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

export interface CurrentSumeragiTelemetry {
  height: number | null;
  lastCommittedHeight: number | null;
  lastCommitQcHeight: number | null;
  lastCommitQcView: number | null;
  validatorCount: number | null;
  ingressQueueDepth: number | null;
  ingressQueueCapacity: number | null;
}

const emptyCurrentSumeragiTelemetry = (): CurrentSumeragiTelemetry => ({
  height: null,
  lastCommittedHeight: null,
  lastCommitQcHeight: null,
  lastCommitQcView: null,
  validatorCount: null,
  ingressQueueDepth: null,
  ingressQueueCapacity: null,
});

const readOptionalCurrentInteger = (
  record: Record<string, unknown>,
  field: string,
  label: string,
): number | null => {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = toNonNegativeInteger(value);
  if (normalized === null) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return normalized;
};

export const normalizeCurrentSumeragiTelemetry = (
  payload: unknown,
): CurrentSumeragiTelemetry => {
  if (payload === null || payload === undefined) {
    return emptyCurrentSumeragiTelemetry();
  }
  const status = requireRecord(payload, "Sumeragi status");
  if (status.protocol_version !== 3) {
    throw new Error("Sumeragi status protocol_version must equal 3.");
  }
  const heightContext = requireRecord(
    status.height_context,
    "Sumeragi status height_context",
  );
  const liveness = requireRecord(status.liveness, "Sumeragi status liveness");
  const queues = requireArray(
    liveness.queues,
    "Sumeragi status liveness.queues",
  );
  let ingressQueue: Record<string, unknown> | null = null;
  queues.forEach((value, index) => {
    const queue = requireRecord(
      value,
      `Sumeragi status liveness.queues[${index}]`,
    );
    const queueKind = requireRecord(
      queue.queue,
      `Sumeragi status liveness.queues[${index}].queue`,
    );
    const kind = requireString(
      queueKind.queue,
      `Sumeragi status liveness.queues[${index}].queue.queue`,
    );
    if (kind === "ingress") {
      if (ingressQueue) {
        throw new Error(
          "Sumeragi status liveness.queues must contain at most one ingress queue.",
        );
      }
      ingressQueue = queue;
    }
  });

  let round: Record<string, unknown> | null = null;
  if (status.last_commit_qc !== undefined && status.last_commit_qc !== null) {
    const lastCommitQc = requireRecord(
      status.last_commit_qc,
      "Sumeragi status last_commit_qc",
    );
    const certificate = requireRecord(
      lastCommitQc.certificate,
      "Sumeragi status last_commit_qc.certificate",
    );
    round = requireRecord(
      certificate.round,
      "Sumeragi status last_commit_qc.certificate.round",
    );
  }

  return {
    height: readOptionalCurrentInteger(
      status,
      "height",
      "Sumeragi status height",
    ),
    lastCommittedHeight: readOptionalCurrentInteger(
      status,
      "last_committed_height",
      "Sumeragi status last_committed_height",
    ),
    lastCommitQcHeight: round
      ? readOptionalCurrentInteger(
          round,
          "height",
          "Sumeragi status last_commit_qc.certificate.round.height",
        )
      : null,
    lastCommitQcView: round
      ? readOptionalCurrentInteger(
          round,
          "view",
          "Sumeragi status last_commit_qc.certificate.round.view",
        )
      : null,
    validatorCount: readOptionalCurrentInteger(
      heightContext,
      "validator_count",
      "Sumeragi status height_context.validator_count",
    ),
    ingressQueueDepth: ingressQueue
      ? readOptionalCurrentInteger(
          ingressQueue,
          "depth",
          "Sumeragi status ingress queue depth",
        )
      : null,
    ingressQueueCapacity: ingressQueue
      ? readOptionalCurrentInteger(
          ingressQueue,
          "capacity",
          "Sumeragi status ingress queue capacity",
        )
      : null,
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
  const sumeragi = normalizeCurrentSumeragiTelemetry(sumeragiStatus);
  const currentBlockHeight =
    sumeragi.height ?? explorerMetrics?.blockHeight ?? null;
  const finalizedBlockHeight =
    sumeragi.lastCommittedHeight ??
    explorerMetrics?.finalizedBlockHeight ??
    null;
  const queueCapacity = sumeragi.ingressQueueCapacity;
  const queueSize = sumeragi.ingressQueueDepth;

  return {
    queueSize,
    queueCapacity,
    commitTimeMs:
      explorerMetrics?.averageCommitTimeMs ??
      toNonNegativeNumber(statusRecord.commit_time_ms),
    effectiveBlockTimeMs:
      explorerMetrics?.averageBlockTimeMs ??
      toNonNegativeNumber(statusRecord.effective_block_time_ms),
    txQueueSaturated:
      queueSize !== null && queueCapacity !== null && queueCapacity > 0
        ? queueSize >= queueCapacity
        : null,
    highestQcHeight: sumeragi.lastCommitQcHeight,
    lockedQcHeight: null,
    currentBlockHeight,
    finalizedBlockHeight,
    finalizationLag:
      currentBlockHeight !== null && finalizedBlockHeight !== null
        ? Math.max(0, currentBlockHeight - finalizedBlockHeight)
        : null,
  };
};

export const extractGovernanceStats = (
  status: unknown,
  lifecycle: NexusLifecycleView | null = null,
): NetworkGovernanceStats => {
  const telemetry = normalizeCurrentSumeragiTelemetry(status);
  const laneIds = lifecycle
    ? new Set(lifecycle.lanes.map((lane) => lane.id))
    : null;
  const dataspaceIds = lifecycle
    ? new Set(lifecycle.lanes.map((lane) => lane.dataspace_id))
    : null;

  return {
    laneCount: laneIds?.size ?? null,
    dataspaceCount: dataspaceIds?.size ?? null,
    validatorCount: telemetry.validatorCount,
  };
};

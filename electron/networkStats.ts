import type {
  ExplorerAssetDefinitionEconometricsResponse,
  ExplorerAssetDefinitionSnapshotResponse,
  ExplorerMetricsResponse,
  NexusLifecycleView,
  NetworkGovernanceStats,
  NetworkRuntimeStats,
} from "../src/types/iroha";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";

const EXPLORER_TOP_HOLDER_MAX_ITEMS = 10;
const EXPLORER_LORENZ_MAX_ITEMS = 33;
const EXPLORER_WINDOW_MAX_ITEMS = 3;
const EXPLORER_ISSUANCE_SERIES_MAX_ITEMS = 30;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;
const MIN_NUMERIC_MANTISSA_MAGNITUDE = 1n << 511n;
const CANONICAL_QUANTITY_RE = /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;
const CANONICAL_NUMERIC_RE = /^-?(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;

type ExplorerProjectionContext = Readonly<{
  expectedDefinitionId: string;
  networkPrefix: number;
}>;

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

const requireString = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.length > 256 ||
    Array.from(value).some((character) => character < " ")
  ) {
    throw new Error(`${label} must be bounded canonical text.`);
  }
  return value;
};

const requireNumber = (value: unknown, label: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
};

const requireRatio = (value: unknown, label: string): number => {
  const ratio = requireNumber(value, label);
  if (ratio > 1) {
    throw new Error(`${label} must be between zero and one.`);
  }
  return ratio;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const requireArray = (
  value: unknown,
  label: string,
  maximumItems: number,
): unknown[] => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error(
      `${label} must be an array with at most ${maximumItems} items.`,
    );
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

const assertExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${details}).`);
  }
};

const requireCanonicalDecimal = (
  value: unknown,
  label: string,
  signed: boolean,
): string => {
  const pattern = signed ? CANONICAL_NUMERIC_RE : CANONICAL_QUANTITY_RE;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(
      `${label} must be a canonical ${signed ? "Numeric" : "Quantity"} string.`,
    );
  }
  const negative = value.startsWith("-");
  const magnitudeText =
    value.replace("-", "").replace(".", "").replace(/^0+/u, "") || "0";
  if (magnitudeText.length > 154) {
    throw new Error(`${label} exceeds the first-release numeric range.`);
  }
  const magnitude = BigInt(magnitudeText);
  if (
    (negative && magnitude === 0n) ||
    magnitude >
      (negative ? MIN_NUMERIC_MANTISSA_MAGNITUDE : MAX_QUANTITY_MANTISSA)
  ) {
    throw new Error(`${label} exceeds the first-release numeric range.`);
  }
  return value;
};

const requireCanonicalQuantity = (value: unknown, label: string): string =>
  requireCanonicalDecimal(value, label, false);

const requireCanonicalNumeric = (value: unknown, label: string): string =>
  requireCanonicalDecimal(value, label, true);

const requireNullableQuantity = (value: unknown, label: string) =>
  value === null ? null : requireCanonicalQuantity(value, label);

const normalizeExpectedDefinitionId = (
  responseValue: unknown,
  context: ExplorerProjectionContext,
  label: string,
): string => {
  const expected = normalizeFirstReleaseAssetDefinitionId(
    context.expectedDefinitionId,
    "expectedDefinitionId",
  );
  const actual = normalizeFirstReleaseAssetDefinitionId(responseValue, label);
  if (actual !== expected) {
    throw new Error(`${label} does not match the requested asset definition.`);
  }
  return actual;
};

export const normalizeExplorerAssetDefinitionSnapshotPayload = (
  payload: unknown,
  context: ExplorerProjectionContext,
): ExplorerAssetDefinitionSnapshotResponse => {
  const record = requireRecord(payload, "Explorer asset definition snapshot");
  assertExactKeys(
    record,
    [
      "definition_id",
      "computed_at_ms",
      "holders_total",
      "total_supply",
      "top_holders",
      "distribution",
    ],
    "Explorer asset definition snapshot",
  );
  const distributionRecord = requireRecord(
    record.distribution,
    "Explorer asset definition distribution",
  );
  assertExactKeys(
    distributionRecord,
    [
      "gini",
      "hhi",
      "theil",
      "entropy",
      "entropy_normalized",
      "nakamoto_33",
      "nakamoto_51",
      "nakamoto_67",
      "top1",
      "top5",
      "top10",
      "median",
      "p90",
      "p99",
      "lorenz",
    ],
    "Explorer asset definition distribution",
  );
  const topHolderItems = requireArray(
    record.top_holders,
    "Explorer asset definition top_holders",
    EXPLORER_TOP_HOLDER_MAX_ITEMS,
  );
  const holdersTotal = requireNonNegativeSafeInteger(
    record.holders_total,
    "holders_total",
  );
  if (holdersTotal < topHolderItems.length) {
    throw new Error("holders_total cannot be less than top_holders.length.");
  }

  return {
    definitionId: normalizeExpectedDefinitionId(
      record.definition_id,
      context,
      "definition_id",
    ),
    computedAtMs: requireNonNegativeSafeInteger(
      record.computed_at_ms,
      "computed_at_ms",
    ),
    holdersTotal,
    totalSupply: requireCanonicalQuantity(record.total_supply, "total_supply"),
    topHolders: topHolderItems.map((item, index) => {
      const holderRecord = requireRecord(item, `top_holders[${index}]`);
      assertExactKeys(
        holderRecord,
        ["account_id", "balance"],
        `top_holders[${index}]`,
      );
      return {
        accountId: normalizeCanonicalAccountIdLiteral(
          requireString(holderRecord.account_id, "account_id"),
          `top_holders[${index}].account_id`,
          context.networkPrefix,
        ),
        balance: requireCanonicalQuantity(holderRecord.balance, "balance"),
      };
    }),
    distribution: {
      gini: requireRatio(distributionRecord.gini, "distribution.gini"),
      hhi: requireRatio(distributionRecord.hhi, "distribution.hhi"),
      theil: requireNumber(distributionRecord.theil, "distribution.theil"),
      entropy: requireNumber(
        distributionRecord.entropy,
        "distribution.entropy",
      ),
      entropyNormalized: requireRatio(
        distributionRecord.entropy_normalized,
        "distribution.entropy_normalized",
      ),
      nakamoto33: requireNonNegativeSafeInteger(
        distributionRecord.nakamoto_33,
        "distribution.nakamoto_33",
      ),
      nakamoto51: requireNonNegativeSafeInteger(
        distributionRecord.nakamoto_51,
        "distribution.nakamoto_51",
      ),
      nakamoto67: requireNonNegativeSafeInteger(
        distributionRecord.nakamoto_67,
        "distribution.nakamoto_67",
      ),
      top1: requireRatio(distributionRecord.top1, "distribution.top1"),
      top5: requireRatio(distributionRecord.top5, "distribution.top5"),
      top10: requireRatio(distributionRecord.top10, "distribution.top10"),
      median: requireNullableQuantity(
        distributionRecord.median,
        "distribution.median",
      ),
      p90: requireNullableQuantity(distributionRecord.p90, "distribution.p90"),
      p99: requireNullableQuantity(distributionRecord.p99, "distribution.p99"),
      lorenz: requireArray(
        distributionRecord.lorenz,
        "distribution.lorenz",
        EXPLORER_LORENZ_MAX_ITEMS,
      ).map((item, index) => {
        const point = requireRecord(item, `distribution.lorenz[${index}]`);
        assertExactKeys(
          point,
          ["population", "share"],
          `distribution.lorenz[${index}]`,
        );
        return {
          population: requireRatio(point.population, "population"),
          share: requireRatio(point.share, "share"),
        };
      }),
    },
  };
};

export const normalizeExplorerAssetDefinitionEconometricsPayload = (
  payload: unknown,
  context: ExplorerProjectionContext,
): ExplorerAssetDefinitionEconometricsResponse => {
  const record = requireRecord(
    payload,
    "Explorer asset definition econometrics",
  );
  assertExactKeys(
    record,
    [
      "definition_id",
      "computed_at_ms",
      "velocity_windows",
      "issuance_windows",
      "issuance_series",
    ],
    "Explorer asset definition econometrics",
  );

  return {
    definitionId: normalizeExpectedDefinitionId(
      record.definition_id,
      context,
      "definition_id",
    ),
    computedAtMs: requireNonNegativeSafeInteger(
      record.computed_at_ms,
      "computed_at_ms",
    ),
    velocityWindows: requireArray(
      record.velocity_windows,
      "velocity_windows",
      EXPLORER_WINDOW_MAX_ITEMS,
    ).map((item, index) => {
      const windowRecord = requireRecord(item, `velocity_windows[${index}]`);
      assertExactKeys(
        windowRecord,
        [
          "key",
          "start_ms",
          "end_ms",
          "transfers",
          "unique_senders",
          "unique_receivers",
          "amount",
        ],
        `velocity_windows[${index}]`,
      );
      return {
        key: requireString(windowRecord.key, "key"),
        startMs: requireNonNegativeSafeInteger(
          windowRecord.start_ms,
          "start_ms",
        ),
        endMs: requireNonNegativeSafeInteger(windowRecord.end_ms, "end_ms"),
        transfers: requireNonNegativeSafeInteger(
          windowRecord.transfers,
          "transfers",
        ),
        uniqueSenders: requireNonNegativeSafeInteger(
          windowRecord.unique_senders,
          "unique_senders",
        ),
        uniqueReceivers: requireNonNegativeSafeInteger(
          windowRecord.unique_receivers,
          "unique_receivers",
        ),
        amount: requireCanonicalQuantity(windowRecord.amount, "amount"),
      };
    }),
    issuanceWindows: requireArray(
      record.issuance_windows,
      "issuance_windows",
      EXPLORER_WINDOW_MAX_ITEMS,
    ).map((item, index) => {
      const windowRecord = requireRecord(item, `issuance_windows[${index}]`);
      assertExactKeys(
        windowRecord,
        [
          "key",
          "start_ms",
          "end_ms",
          "mint_count",
          "burn_count",
          "minted",
          "burned",
          "net",
        ],
        `issuance_windows[${index}]`,
      );
      return {
        key: requireString(windowRecord.key, "key"),
        startMs: requireNonNegativeSafeInteger(
          windowRecord.start_ms,
          "start_ms",
        ),
        endMs: requireNonNegativeSafeInteger(windowRecord.end_ms, "end_ms"),
        mintCount: requireNonNegativeSafeInteger(
          windowRecord.mint_count,
          "mint_count",
        ),
        burnCount: requireNonNegativeSafeInteger(
          windowRecord.burn_count,
          "burn_count",
        ),
        minted: requireCanonicalQuantity(windowRecord.minted, "minted"),
        burned: requireCanonicalQuantity(windowRecord.burned, "burned"),
        net: requireCanonicalNumeric(windowRecord.net, "net"),
      };
    }),
    issuanceSeries: requireArray(
      record.issuance_series,
      "issuance_series",
      EXPLORER_ISSUANCE_SERIES_MAX_ITEMS,
    ).map((item, index) => {
      const pointRecord = requireRecord(item, `issuance_series[${index}]`);
      assertExactKeys(
        pointRecord,
        ["bucket_start_ms", "minted", "burned", "net"],
        `issuance_series[${index}]`,
      );
      return {
        bucketStartMs: requireNonNegativeSafeInteger(
          pointRecord.bucket_start_ms,
          "bucket_start_ms",
        ),
        minted: requireCanonicalQuantity(pointRecord.minted, "minted"),
        burned: requireCanonicalQuantity(pointRecord.burned, "burned"),
        net: requireCanonicalNumeric(pointRecord.net, "net"),
      };
    }),
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
    64,
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

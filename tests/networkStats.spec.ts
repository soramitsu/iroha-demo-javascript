import { describe, expect, it } from "vitest";
import {
  extractGovernanceStats,
  extractRuntimeStatsFromStatusSnapshot,
  normalizeCurrentSumeragiTelemetry,
  normalizeExplorerAssetDefinitionEconometricsPayload,
  normalizeExplorerAssetDefinitionSnapshotPayload,
} from "../electron/networkStats";

const currentSumeragiStatus = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  protocol_version: 3,
  height_context: {},
  liveness: { queues: [] },
  ...overrides,
});

describe("network stats helpers", () => {
  it("normalizes explorer asset definition snapshot payloads", () => {
    const snapshot = normalizeExplorerAssetDefinitionSnapshotPayload({
      definition_id: "xor#universal",
      computed_at_ms: 1710000000000,
      holders_total: 42,
      total_supply: "1234567.89",
      top_holders: [
        {
          account_id: "alice@test",
          balance: "1000000",
        },
      ],
      distribution: {
        gini: 0.73,
        hhi: 0.19,
        theil: 1.4,
        entropy: 0.88,
        entropy_normalized: 0.61,
        nakamoto_33: 1,
        nakamoto_51: 2,
        nakamoto_67: 4,
        top1: 0.42,
        top5: 0.77,
        top10: 0.91,
        median: "7",
        p90: "300",
        p99: "9000",
        lorenz: [
          {
            population: 0.5,
            share: 0.1,
          },
        ],
      },
    });

    expect(snapshot).toEqual({
      definitionId: "xor#universal",
      computedAtMs: 1710000000000,
      holdersTotal: 42,
      totalSupply: "1234567.89",
      topHolders: [
        {
          accountId: "alice@test",
          balance: "1000000",
        },
      ],
      distribution: {
        gini: 0.73,
        hhi: 0.19,
        theil: 1.4,
        entropy: 0.88,
        entropyNormalized: 0.61,
        nakamoto33: 1,
        nakamoto51: 2,
        nakamoto67: 4,
        top1: 0.42,
        top5: 0.77,
        top10: 0.91,
        median: "7",
        p90: "300",
        p99: "9000",
        lorenz: [
          {
            population: 0.5,
            share: 0.1,
          },
        ],
      },
    });
  });

  it("normalizes explorer econometrics payloads", () => {
    const econometrics = normalizeExplorerAssetDefinitionEconometricsPayload({
      definition_id: "xor#universal",
      computed_at_ms: 1710000000000,
      velocity_windows: [
        {
          key: "24h",
          start_ms: 1710000000000,
          end_ms: 1710086400000,
          transfers: 33,
          unique_senders: 9,
          unique_receivers: 12,
          amount: "2048",
        },
      ],
      issuance_windows: [
        {
          key: "24h",
          start_ms: 1710000000000,
          end_ms: 1710086400000,
          mint_count: 2,
          burn_count: 1,
          minted: "12",
          burned: "5",
          net: "7",
        },
      ],
      issuance_series: [
        {
          bucket_start_ms: 1710000000000,
          minted: "3",
          burned: "1",
          net: "2",
        },
      ],
    });

    expect(econometrics).toEqual({
      definitionId: "xor#universal",
      computedAtMs: 1710000000000,
      velocityWindows: [
        {
          key: "24h",
          startMs: 1710000000000,
          endMs: 1710086400000,
          transfers: 33,
          uniqueSenders: 9,
          uniqueReceivers: 12,
          amount: "2048",
        },
      ],
      issuanceWindows: [
        {
          key: "24h",
          startMs: 1710000000000,
          endMs: 1710086400000,
          mintCount: 2,
          burnCount: 1,
          minted: "12",
          burned: "5",
          net: "7",
        },
      ],
      issuanceSeries: [
        {
          bucketStartMs: 1710000000000,
          minted: "3",
          burned: "1",
          net: "2",
        },
      ],
    });
  });

  it("normalizes the current Sumeragi height, QC, validator, and ingress queue shape", () => {
    expect(
      normalizeCurrentSumeragiTelemetry(
        currentSumeragiStatus({
          height: 45_451,
          last_committed_height: 45_450,
          last_commit_qc: {
            certificate: {
              round: {
                height: 45_450,
                view: 2,
              },
            },
          },
          height_context: {
            validator_count: 4,
          },
          liveness: {
            queues: [
              {
                queue: {
                  queue: "deferred_normal",
                  details: null,
                },
                depth: 9,
                capacity: 1024,
              },
              {
                queue: {
                  queue: "ingress",
                  details: null,
                },
                depth: 6,
                capacity: 1028,
              },
            ],
          },
        }),
      ),
    ).toEqual({
      height: 45_451,
      lastCommittedHeight: 45_450,
      lastCommitQcHeight: 45_450,
      lastCommitQcView: 2,
      validatorCount: 4,
      ingressQueueDepth: 6,
      ingressQueueCapacity: 1028,
    });
  });

  it("extracts runtime stats from the current Sumeragi status", () => {
    const runtime = extractRuntimeStatsFromStatusSnapshot(
      {
        status: {
          commit_time_ms: 1800,
          effective_block_time_ms: 2500,
        },
      },
      null,
      currentSumeragiStatus({
        height: 45_451,
        last_committed_height: 45_450,
        last_commit_qc: {
          certificate: {
            round: {
              height: 45_450,
              view: 2,
            },
          },
        },
        height_context: {
          validator_count: 4,
        },
        liveness: {
          queues: [
            {
              queue: {
                queue: "ingress",
                details: null,
              },
              depth: 6,
              capacity: 1028,
            },
          ],
        },
      }),
    );

    expect(runtime).toEqual({
      queueSize: 6,
      queueCapacity: 1028,
      commitTimeMs: 1800,
      effectiveBlockTimeMs: 2500,
      txQueueSaturated: false,
      highestQcHeight: 45_450,
      lockedQcHeight: null,
      currentBlockHeight: 45_451,
      finalizedBlockHeight: 45_450,
      finalizationLag: 1,
    });
  });

  it("uses explorer telemetry when current Sumeragi status is unavailable", () => {
    const runtime = extractRuntimeStatsFromStatusSnapshot(
      {
        commit_time_ms: 9999,
        effective_block_time_ms: 9999,
      },
      {
        peers: 4,
        domains: 3,
        accounts: 20,
        assets: 5,
        transactionsAccepted: 80,
        transactionsRejected: 2,
        blockHeight: 99,
        blockCreatedAt: null,
        finalizedBlockHeight: 94,
        averageCommitTimeMs: 1300,
        averageBlockTimeMs: 1200,
      },
    );

    expect(runtime).toEqual({
      queueSize: null,
      queueCapacity: null,
      commitTimeMs: 1300,
      effectiveBlockTimeMs: 1200,
      txQueueSaturated: null,
      highestQcHeight: null,
      lockedQcHeight: null,
      currentBlockHeight: 99,
      finalizedBlockHeight: 94,
      finalizationLag: 5,
    });
  });

  it("uses the current height-context validator count for governance stats", () => {
    const governance = extractGovernanceStats(
      currentSumeragiStatus({
        height_context: {
          validator_count: 4,
        },
      }),
      {
        version: 1,
        nexus_enabled: true,
        lane_count: 3,
        lanes: [
          {
            id: 7,
            dataspace_id: "2",
            alias: "primary",
            description: "",
            visibility: "public",
            governance: null,
            storage: "on-ledger",
            proof_scheme: "none",
            metadata: {},
          },
          {
            id: 9,
            dataspace_id: "2",
            alias: "secondary",
            description: "",
            visibility: "public",
            governance: null,
            storage: "on-ledger",
            proof_scheme: "none",
            metadata: {},
          },
          {
            id: 11,
            dataspace_id: "5",
            alias: "private",
            description: "",
            visibility: "private",
            governance: null,
            storage: "on-ledger",
            proof_scheme: "none",
            metadata: {},
          },
        ],
      },
    );

    expect(governance).toEqual({
      laneCount: 3,
      dataspaceCount: 2,
      validatorCount: 4,
    });
  });

  it("marks independently unavailable governance telemetry as null", () => {
    expect(
      extractGovernanceStats(
        currentSumeragiStatus({
          height_context: {
            validator_count: 4,
          },
        }),
        null,
      ),
    ).toEqual({
      laneCount: null,
      dataspaceCount: null,
      validatorCount: 4,
    });
    expect(extractGovernanceStats(null, null)).toEqual({
      laneCount: null,
      dataspaceCount: null,
      validatorCount: null,
    });
  });

  it("rejects malformed or legacy Sumeragi payloads instead of treating them as empty telemetry", () => {
    expect(() =>
      normalizeCurrentSumeragiTelemetry(
        currentSumeragiStatus({
          height: 1.5,
          last_committed_height: -1,
          height_context: {
            validator_count: "unknown",
          },
        }),
      ),
    ).toThrow("Sumeragi status height must be a non-negative safe integer.");
    for (const invalid of [
      Number.MAX_SAFE_INTEGER + 1,
      "045451",
      "45451.0",
      "4.5451e4",
      " 45451 ",
    ]) {
      expect(() =>
        normalizeCurrentSumeragiTelemetry(
          currentSumeragiStatus({
            height: invalid,
          }),
        ),
      ).toThrow("Sumeragi status height must be a non-negative safe integer.");
    }
    expect(
      normalizeCurrentSumeragiTelemetry(
        currentSumeragiStatus({
          height: "45451",
        }),
      ).height,
    ).toBe(45_451);
    expect(normalizeCurrentSumeragiTelemetry(currentSumeragiStatus())).toEqual({
      height: null,
      lastCommittedHeight: null,
      lastCommitQcHeight: null,
      lastCommitQcView: null,
      validatorCount: null,
      ingressQueueDepth: null,
      ingressQueueCapacity: null,
    });

    expect(() =>
      extractRuntimeStatsFromStatusSnapshot({}, null, {
        tx_queue: {
          depth: 4,
          capacity: 64,
        },
        highest_qc: {
          height: 88,
        },
      }),
    ).toThrow("Sumeragi status protocol_version must equal 3.");
    expect(() => normalizeCurrentSumeragiTelemetry({})).toThrow(
      "Sumeragi status protocol_version must equal 3.",
    );
  });
});

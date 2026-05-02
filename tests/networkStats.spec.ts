import { describe, expect, it } from "vitest";
import {
  extractGovernanceStats,
  extractRuntimeStatsFromStatusSnapshot,
  normalizeExplorerAssetDefinitionEconometricsPayload,
  normalizeExplorerAssetDefinitionSnapshotPayload,
} from "../electron/networkStats";

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

  it("extracts runtime stats from status snapshot data", () => {
    const runtime = extractRuntimeStatsFromStatusSnapshot(
      {
        status: {
          queue_size: 4,
          commit_time_ms: 1800,
          raw: {
            sumeragi: {
              tx_queue_saturated: true,
              tx_queue_capacity: 64,
              effective_block_time_ms: 2500,
              highest_qc_height: 88,
              locked_qc_height: 87,
            },
          },
        },
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
      queueSize: 4,
      queueCapacity: 64,
      commitTimeMs: 1800,
      effectiveBlockTimeMs: 2500,
      txQueueSaturated: true,
      highestQcHeight: 88,
      lockedQcHeight: 87,
      currentBlockHeight: 99,
      finalizedBlockHeight: 94,
      finalizationLag: 5,
    });
  });

  it("extracts runtime stats from root status with sumeragi enrichment", () => {
    const runtime = extractRuntimeStatsFromStatusSnapshot(
      {
        blocks: 12732,
        commit_time_ms: 1741607,
        queue_size: 0,
        sumeragi: {
          tx_queue_capacity: 0,
          tx_queue_saturated: false,
          highest_qc_height: 12732,
          locked_qc_height: 12731,
          effective_block_time_ms: 3303181,
        },
      },
      null,
      {
        tx_queue: {
          depth: 0,
          capacity: 20000,
          saturated: false,
        },
        highest_qc: {
          height: 12732,
        },
        locked_qc: {
          height: 12731,
        },
      },
    );

    expect(runtime).toEqual({
      queueSize: 0,
      queueCapacity: 20000,
      commitTimeMs: 1741607,
      effectiveBlockTimeMs: 3303181,
      txQueueSaturated: false,
      highestQcHeight: 12732,
      lockedQcHeight: 12731,
      currentBlockHeight: 12732,
      finalizedBlockHeight: 12732,
      finalizationLag: 0,
    });
  });

  it("deduplicates lane, dataspace, and validator counts from governance status", () => {
    const governance = extractGovernanceStats({
      lane_governance: [
        {
          lane_id: 7,
          dataspace_id: 2,
          validator_ids: ["alice", "bob"],
        },
        {
          lane_id: 9,
          dataspace_id: 2,
          validator_ids: ["bob", "carol"],
        },
      ],
      dataspace_commitments: [
        {
          lane_id: 11,
          dataspace_id: 5,
        },
      ],
    } as any);

    expect(governance).toEqual({
      laneCount: 3,
      dataspaceCount: 2,
      validatorCount: 3,
    });
  });
});

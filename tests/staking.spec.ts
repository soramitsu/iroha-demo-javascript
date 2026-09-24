import { describe, expect, it } from "vitest";
import type { NexusLifecycleView } from "@/types/iroha";
import {
  calculateRewardApyEstimate,
  chooseDefaultDataspaceId,
  compareDecimalStrings,
  collectDataspaceOptions,
  computeUnbondReleaseAtMs,
  createUnbondRequestId,
  extractValidatorCommissionBps,
  hasClaimableRewards,
  pickDefaultValidator,
  readValidatorEndpoint,
  resolveLaneForDataspace,
  resolveRewardEpochSpan,
  sumRewardAmounts,
  sumStakeShares,
} from "@/utils/staking";

describe("staking utilities", () => {
  it("collects dataspaces from the current Nexus lifecycle catalog", () => {
    const options = collectDataspaceOptions({
      version: 1,
      nexus_enabled: true,
      lane_count: 3,
      lanes: [
        {
          id: 9,
          dataspace_id: "2",
          alias: "Public Lane B",
          description: "",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
        {
          id: 3,
          dataspace_id: "2",
          alias: "Public Lane A",
          description: "",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
        {
          id: 1,
          dataspace_id: "1",
          alias: "Core",
          description: "",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
      ],
    });

    expect(options.map((option) => option.dataspaceId)).toEqual(["1", "2"]);
    expect(options[1].lanes.map((lane) => lane.laneId)).toEqual([3, 9]);
    expect(options[1].totalValidators).toBe(0);

    const defaultDataspace = chooseDefaultDataspaceId(options, null);
    expect(defaultDataspace).toBe("1");

    const lane = resolveLaneForDataspace(options, "2");
    expect(lane?.laneId).toBe(3);
    expect(lane?.alias).toBe("Public Lane A");
  });

  it("prefers existing validator selection and falls back to active", () => {
    const validators = [
      {
        validator: "validator-1",
        status: { type: "PendingActivation" },
      },
      {
        validator: "validator-2",
        status: { type: "Active" },
      },
    ] as any;

    expect(pickDefaultValidator(validators, "validator-1")).toBe("validator-1");
    expect(pickDefaultValidator(validators, "")).toBe("validator-2");
  });

  it("returns no options when the lifecycle has no lanes", () => {
    const options = collectDataspaceOptions({
      version: 1,
      nexus_enabled: true,
      lane_count: 0,
      lanes: [],
    });

    expect(options).toEqual([]);
  });

  it("keeps large dataspace identifiers exact while sorting and selecting", () => {
    const lane = (
      id: number,
      dataspace_id: string,
    ): NexusLifecycleView["lanes"][number] => ({
      id,
      dataspace_id,
      alias: `Lane ${id}`,
      description: "",
      visibility: "public",
      governance: null,
      storage: "full_replica",
      proof_scheme: "merkle_sha256",
      metadata: {},
    });
    const options = collectDataspaceOptions({
      version: 1,
      nexus_enabled: true,
      lane_count: 3,
      lanes: [lane(3, "6647857470246403404"), lane(2, "10"), lane(1, "2")],
    });

    expect(options.map((option) => option.dataspaceId)).toEqual([
      "2",
      "10",
      "6647857470246403404",
    ]);
    expect(chooseDefaultDataspaceId(options, "6647857470246403404")).toBe(
      "6647857470246403404",
    );
    expect(
      resolveLaneForDataspace(options, "6647857470246403404")?.laneId,
    ).toBe(3);
  });

  it("computes release timestamp and request identifiers", () => {
    expect(computeUnbondReleaseAtMs(60_000, 1_000)).toBe(61_000);

    const deterministic = createUnbondRequestId(
      new Uint8Array([0x01, 0xab, 0xcd, 0xef]),
    );
    expect(deterministic).toBe("01abcdef");

    const generated = createUnbondRequestId();
    expect(generated).toMatch(/^[0-9a-f]{32}$/);
  });

  it("compares decimal strings without floating precision issues", () => {
    expect(compareDecimalStrings("1.200", "1.2")).toBe(0);
    expect(compareDecimalStrings("10", "2.99")).toBe(1);
    expect(compareDecimalStrings("0.099", "0.1")).toBe(-1);
    expect(compareDecimalStrings("0003.000", "3")).toBe(0);

    expect(() => compareDecimalStrings("3e2", "300")).toThrow(
      "decimal numeric string",
    );
  });

  it("detects whether rewards include a positive claimable amount", () => {
    expect(hasClaimableRewards([])).toBe(false);
    expect(
      hasClaimableRewards([
        {
          amount: "0",
        } as any,
        {
          amount: "0.000",
        } as any,
      ]),
    ).toBe(false);
    expect(
      hasClaimableRewards([
        {
          amount: "0",
        } as any,
        {
          amount: "0.0100",
        } as any,
      ]),
    ).toBe(true);
    expect(
      hasClaimableRewards([
        {
          amount: "not-a-number",
        } as any,
      ]),
    ).toBe(false);
  });

  it("summarizes bonded stake, rewards, and epoch spans for APY estimates", () => {
    const shares = [
      { bonded: "10.5" },
      { bonded: "2" },
      { bonded: "not-a-number" },
    ] as any;
    const rewards = [
      {
        amount: "1.5",
        last_claimed_epoch: 4,
        pending_through_epoch: 6,
      },
      {
        amount: "0.5",
        last_claimed_epoch: 5,
        pending_through_epoch: 7,
      },
    ] as any;

    expect(sumStakeShares(shares)).toBe(12.5);
    expect(sumRewardAmounts(rewards)).toBe(2);
    expect(resolveRewardEpochSpan(rewards)).toBe(3);

    expect(
      calculateRewardApyEstimate({
        rewards,
        bondedAmount: "100",
        epochDurationHours: 24,
      })?.apyPercent,
    ).toBeCloseTo(243.333, 3);
  });

  it("returns null APY estimates when observed reward data is incomplete", () => {
    expect(
      calculateRewardApyEstimate({
        rewards: [],
        bondedAmount: "100",
        epochDurationHours: 24,
      }),
    ).toBeNull();
    expect(
      calculateRewardApyEstimate({
        rewards: [
          {
            amount: "1",
            last_claimed_epoch: 1,
            pending_through_epoch: 2,
          } as any,
        ],
        bondedAmount: "0",
        epochDurationHours: 24,
      }),
    ).toBeNull();
    expect(
      calculateRewardApyEstimate({
        rewards: [
          {
            amount: "1",
            last_claimed_epoch: 1,
            pending_through_epoch: 2,
          } as any,
        ],
        bondedAmount: "100",
        epochDurationHours: 0,
      }),
    ).toBeNull();
  });

  it("reads validator operator metadata for fee commission and endpoint", () => {
    expect(
      extractValidatorCommissionBps({
        commission_bps: 250,
      }),
    ).toBe(250);
    expect(
      extractValidatorCommissionBps({
        commission_bps: "250",
      }),
    ).toBeNull();
    expect(
      extractValidatorCommissionBps({
        commission_percent: 3.75,
      }),
    ).toBeNull();
    expect(
      readValidatorEndpoint({
        endpoint: "https://validator.example",
      }),
    ).toBe("https://validator.example");
    expect(
      readValidatorEndpoint({
        p2p_endpoint: "https://validator.example",
      }),
    ).toBe("");
    expect(
      readValidatorEndpoint({
        endpoint: " https://validator.example ",
      }),
    ).toBe("");
    expect(readValidatorEndpoint({ endpoint: 1234 })).toBe("");
  });
});

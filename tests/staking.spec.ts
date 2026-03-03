import { describe, expect, it } from "vitest";
import {
  chooseDefaultDataspaceId,
  compareDecimalStrings,
  collectDataspaceOptions,
  computeUnbondReleaseAtMs,
  createUnbondRequestId,
  hasClaimableRewards,
  pickDefaultValidator,
  resolveLaneForDataspace,
} from "@/utils/staking";

describe("staking utilities", () => {
  it("collects dataspaces from lane governance and resolves default lane", () => {
    const options = collectDataspaceOptions({
      lane_governance: [
        {
          lane_id: 9,
          alias: "Public Lane B",
          dataspace_id: 2,
          validator_ids: ["v2", "v3"],
        },
        {
          lane_id: 3,
          alias: "Public Lane A",
          dataspace_id: 2,
          validator_ids: ["v1", "v2"],
        },
        {
          lane_id: 1,
          alias: "",
          dataspace_id: 1,
          validator_ids: ["v0"],
        },
      ],
    });

    expect(options.map((option) => option.dataspaceId)).toEqual([1, 2]);
    expect(options[1].lanes.map((lane) => lane.laneId)).toEqual([3, 9]);
    expect(options[1].totalValidators).toBe(3);

    const defaultDataspace = chooseDefaultDataspaceId(options, null);
    expect(defaultDataspace).toBe(1);

    const lane = resolveLaneForDataspace(options, 2);
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

  it("falls back to dataspace commitments when lane governance is unavailable", () => {
    const options = collectDataspaceOptions({
      dataspace_commitments: [
        {
          dataspace_id: 6,
          lane_id: 11,
        },
        {
          dataspace_id: 6,
          lane_id: 10,
        },
      ],
    });

    expect(options).toHaveLength(1);
    expect(options[0].dataspaceId).toBe(6);
    expect(options[0].lanes.map((lane) => lane.laneId)).toEqual([10, 11]);
    expect(options[0].lanes[0].alias).toBe("Lane 10");
  });

  it("merges governance and commitments for the same lane without duplicates", () => {
    const options = collectDataspaceOptions({
      lane_governance: [
        {
          dataspace_id: 4,
          lane_id: 2,
          alias: "Public lane",
          validator_ids: ["v1", "v2", "v1"],
        },
      ],
      dataspace_commitments: [
        {
          dataspace_id: 4,
          lane_id: 2,
        },
        {
          dataspace_id: 4,
          lane_id: 3,
        },
      ],
    });

    expect(options).toHaveLength(1);
    expect(options[0].lanes.map((lane) => lane.laneId)).toEqual([2, 3]);
    expect(options[0].lanes[0].alias).toBe("Public lane");
    expect(options[0].lanes[0].validatorIds).toEqual(["v1", "v2"]);
    expect(options[0].totalValidators).toBe(2);
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
});

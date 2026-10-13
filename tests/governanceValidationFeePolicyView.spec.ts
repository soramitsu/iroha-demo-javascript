import { describe, expect, it } from "vitest";
import { parseGovernanceValidationFeePolicyView } from "../electron/governanceValidationFeePolicyView";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  EFFECTIVE_FROM_MS,
  validationFeePolicy,
} from "./helpers/validationFeeFixtures";

const hash = (byte: string) => byte.repeat(64);
const policyHash = `${"ab".repeat(31)}ad`;

const view = () => ({
  observedHeight: "130000",
  observedAtMs: EFFECTIVE_FROM_MS + 86_400_000,
  effective: validationFeePolicy(),
  effectivePolicyHash: policyHash,
  registryHead: { policyVersion: "1" as string | null, policyHash },
  verifiedProof: {
    schema: "cbsi.validation-fee-ledger-projection.v1",
    authorizationModel: "SORA_PARLIAMENT_V1",
    registrySnapshotHash: hash("3"),
    finalizedBlockHash: hash("4"),
    finalizedContextId: hash("5"),
    trustedCheckpointHeight: "129000",
    trustedCheckpointContextId: hash("6"),
  },
});

describe("governance validation-fee main IPC response", () => {
  it("normalizes and freezes the exact current network-bound policy view", () => {
    const parsed = parseGovernanceValidationFeePolicyView(view());

    expect(parsed.effective.network_id).toBe(TAIRA_NETWORK_ID);
    expect(parsed.effective.charging_mode.charging_mode).toBe(
      "RETAIL_MONTHLY_ALLOWANCE",
    );
    expect(parsed.registryHead).toEqual({ policyVersion: "1", policyHash });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.effective)).toBe(true);
    expect(Object.isFrozen(parsed.effective.retail_schedule)).toBe(true);
  });

  it("accepts a scheduled head only without a projected version", () => {
    const pending = view();
    pending.registryHead = { policyVersion: null, policyHash: hash("7") };
    expect(
      parseGovernanceValidationFeePolicyView(pending).registryHead,
    ).toEqual({ policyVersion: null, policyHash: hash("7") });

    const versionedScheduledHead = view();
    versionedScheduledHead.registryHead = {
      policyVersion: "2",
      policyHash: hash("7"),
    };
    expect(() =>
      parseGovernanceValidationFeePolicyView(versionedScheduledHead),
    ).toThrow(/registry head differs/);
  });

  it.each([
    [
      "unknown outer field",
      (input: ReturnType<typeof view>) => Object.assign(input, { extra: true }),
    ],
    [
      "retired latest-enacted alias",
      (input: ReturnType<typeof view>) =>
        Object.assign(input, { latestEnacted: input.effective }),
    ],
    [
      "retired scheduled list",
      (input: ReturnType<typeof view>) =>
        Object.assign(input, { scheduled: [] }),
    ],
    [
      "retired effective height",
      (input: ReturnType<typeof view>) =>
        Object.assign(input.effective, { effective_from_height: "120960" }),
    ],
    [
      "retired payout binding",
      (input: ReturnType<typeof view>) =>
        Object.assign(input.effective, { treasury_payout_binding: null }),
    ],
    [
      "network drift",
      (input: ReturnType<typeof view>) => {
        input.effective.network_id = `hash:${"A".repeat(64)}#0000`;
      },
    ],
    [
      "head drift",
      (input: ReturnType<typeof view>) => {
        input.registryHead.policyVersion = "2";
      },
    ],
    [
      "inactive effective policy",
      (input: ReturnType<typeof view>) => {
        input.observedAtMs = EFFECTIVE_FROM_MS - 1;
      },
    ],
    [
      "uppercase projection hash",
      (input: ReturnType<typeof view>) => {
        input.effectivePolicyHash = policyHash.toUpperCase();
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const input = view();
    mutate(input);
    expect(() => parseGovernanceValidationFeePolicyView(input)).toThrow();
  });
});

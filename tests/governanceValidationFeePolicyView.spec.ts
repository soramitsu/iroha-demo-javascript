import { describe, expect, it } from "vitest";
import { parseGovernanceValidationFeePolicyView } from "../electron/governanceValidationFeePolicyView";
import { TAIRA_NETWORK_ID } from "../src/utils/firstReleaseNetworkIdentity";

const hash = (byte: string) => byte.repeat(64);

const policy = () => ({
  schema_version: 1,
  network_id: TAIRA_NETWORK_ID,
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv",
  ds_scale: 2,
  fee: "0.1",
  treasury_account_id: "treasury",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "120960",
  expires_after_height: null,
  exemption_classes: ["TREASURY_PAYOUT"],
  treasury_payout_binding: {
    contract_address: "contract",
    code_hash: hash("1"),
    entrypoint: "autonomous_validation_fee_tick",
    treasury_account_id: "treasury",
    ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv",
    xor_asset_id: "xor",
    pool_vault_account_id: "vault",
    batch_ds: "10",
    min_xor_out: "4",
    max_xor_out: "100",
    recipients: ["a", "b", "c", "d"].map((account_id) => ({
      account_id,
      share: "0.25",
    })),
  },
});

const view = () => ({
  observedHeight: "130000",
  effective: policy(),
  latestEnacted: policy(),
  scheduled: [],
  registryHead: { policyVersion: "1", policyHash: hash("2") },
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
    expect(parsed.registryHead.policyVersion).toBe(
      parsed.effective.policy_version,
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.effective)).toBe(true);
  });

  it.each([
    [
      "unknown outer field",
      (input: ReturnType<typeof view>) => Object.assign(input, { extra: true }),
    ],
    [
      "retired chain alias",
      (input: ReturnType<typeof view>) =>
        Object.assign(input.effective, { chain_id: "retired" }),
    ],
    [
      "retired genesis alias",
      (input: ReturnType<typeof view>) =>
        Object.assign(input.latestEnacted, { genesis_hash: hash("7") }),
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
      "scheduled compatibility",
      (input: ReturnType<typeof view>) => {
        input.scheduled.push(policy() as never);
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const input = view();
    mutate(input);
    expect(() => parseGovernanceValidationFeePolicyView(input)).toThrow();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import GovernanceProposalDetail from "@/components/governance/GovernanceProposalDetail.vue";
import type { GovernanceProposalDetail as ProposalDetail } from "@/governance/model";
import { TAIRA_NETWORK_ID } from "@/utils/firstReleaseNetworkIdentity";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const payoutBinding = {
  contract_address: "ivm:payout-contract",
  code_hash: "a".repeat(64),
  entrypoint: "autonomous_validation_fee_tick" as const,
  treasury_account_id: "testuTreasury",
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv" as const,
  xor_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  pool_vault_account_id: "testuPoolVault",
  batch_ds: "10" as const,
  min_xor_out: "4" as const,
  max_xor_out: "100" as const,
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `testuValidator${index}`,
    share: "0.25" as const,
  })),
};

const detail: ProposalDetail = {
  summary: {
    proposalId: `0x${"1".repeat(64)}`,
    proposer: "testuOperator",
    createdHeight: 100,
    status: "Proposed",
    kindType: "ValidationFeePolicy",
    kindLabelKey: "Validation fee policy",
  },
  kind: {
    type: "ValidationFeePolicy",
    proposalOperator: "testuOperator",
    payoutLifecycleProposalId: "2".repeat(64),
    policy: {
      schema_version: 1,
      network_id: TAIRA_NETWORK_ID,
      policy_version: "1",
      previous_policy_hash: null,
      ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv",
      ds_scale: 2,
      fee: "0.1",
      treasury_account_id: "testuTreasury",
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: "121560",
      expires_after_height: null,
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: payoutBinding,
    },
    raw: { kind: "ValidationFeePolicy", payload: {} },
  },
  currentHeight: "120",
  governanceCertificate: null,
  raw: {},
};

describe("first-release Parliament view", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders only the typed operator-bound private proposal projection", () => {
    const wrapper = mount(GovernanceProposalDetail, {
      props: { proposal: detail, loading: false, error: "" },
    });

    expect(wrapper.text()).toContain("Mandatory private Parliament");
    expect(wrapper.text()).toContain("testuOperator");
    expect(wrapper.text()).toContain(TAIRA_NETWORK_ID);
    expect(wrapper.text()).toContain("No Parliament certificate yet");
    expect(wrapper.text()).not.toContain("PLAIN");
    expect(wrapper.text()).not.toContain("Referendum");
    expect(wrapper.text()).not.toContain("Seven-body");
  });

  it("keeps every retired public workflow absent from production governance UI", () => {
    const production = [
      "src/views/ParliamentView.vue",
      "src/stores/parliament.ts",
      "src/components/governance/GovernanceComposer.vue",
      "src/components/governance/GovernanceInspector.vue",
      "src/components/governance/GovernanceProposalDetail.vue",
    ]
      .map(source)
      .join("\n");

    for (const retired of [
      "plainReferendum",
      "plainVoteGate",
      "prepareCitizenBallot",
      "prepareStageBallot",
      "prepareEnact",
      "Seven-body Parliament",
      "referendum_window",
      "plain_electorate_rules",
      "validationFeeWindowLower",
      "validationFeeWindowUpper",
      "chain_id",
      "genesis_hash",
    ]) {
      expect(production).not.toContain(retired);
    }
  });

  it("shows the exact current NetworkId and mandatory private protocol copy", () => {
    const composer = source("src/components/governance/GovernanceComposer.vue");
    const inspector = source(
      "src/components/governance/GovernanceInspector.vue",
    );
    expect(composer).toContain("validationFeeComposer.network_id");
    expect(composer).toContain("Mandatory private Parliament");
    expect(composer).toContain(
      "Proposal-backed PLAIN ballots are not supported",
    );
    expect(inspector).toContain("privateBallotProtocol");
    expect(inspector).toContain("targetBodySizes");
  });
});

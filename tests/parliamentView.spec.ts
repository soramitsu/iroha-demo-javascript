import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import GovernanceProposalDetail from "@/components/governance/GovernanceProposalDetail.vue";
import {
  normalizeValidationFeePayoutBinding,
  normalizeValidationFeePolicy,
  type GovernanceProposalDetail as ProposalDetail,
} from "@/governance/model";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  PROPOSAL_OPERATOR,
  REWARD_POOL_ACCOUNT_ID,
  validationFeePayoutBinding,
  validationFeePolicy,
} from "./helpers/validationFeeFixtures";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const detail: ProposalDetail = {
  summary: {
    proposalId: `0x${"1".repeat(64)}`,
    proposer: PROPOSAL_OPERATOR,
    createdHeight: 100,
    status: "Proposed",
    kindType: "ValidationFeePolicy",
    kindLabelKey: "Validation fee policy",
  },
  kind: {
    type: "ValidationFeePolicy",
    proposalOperator: PROPOSAL_OPERATOR,
    policy: normalizeValidationFeePolicy(validationFeePolicy()),
    raw: { kind: "ValidationFeePolicy", payload: {} },
  },
  currentHeight: "120",
  governanceCertificate: null,
  raw: {},
};

const lifecycleDetail: ProposalDetail = {
  summary: {
    ...detail.summary,
    kindType: "ValidationFeePayoutLifecycle",
    kindLabelKey: "Validation fee payout lifecycle",
  },
  kind: {
    type: "ValidationFeePayoutLifecycle",
    proposalOperator: PROPOSAL_OPERATOR,
    payoutBinding: normalizeValidationFeePayoutBinding(
      validationFeePayoutBinding(),
    ),
    raw: { kind: "ValidationFeePayoutLifecycle", payload: {} },
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

    const text = wrapper.text();
    expect(text).toContain("Mandatory private Parliament");
    expect(text).toContain(PROPOSAL_OPERATOR);
    expect(text).toContain(TAIRA_NETWORK_ID);
    expect(text).toContain("0.1 SBD");
    expect(text).toContain("Institutional payment fee");
    expect(text).toContain("2026-11-01 00:00 Honiara time");
    expect(text).toContain("2026-10-02 00:00 Honiara time");
    expect(text).toContain("From 5000000: 1000 per month");
    expect(text).toContain(REWARD_POOL_ACCOUNT_ID);
    expect(text).toContain("No Parliament certificate yet");
    expect(text).not.toContain("Effective height");
    expect(text).not.toContain("Payout lifecycle proposal");
    expect(text).not.toContain("PLAIN");
    expect(text).not.toContain("Referendum");
    expect(text).not.toContain("Seven-body");
  });

  it("renders the typed conversion and reward binding facts", () => {
    const wrapper = mount(GovernanceProposalDetail, {
      props: { proposal: lifecycleDetail, loading: false, error: "" },
    });
    const text = wrapper.text();
    expect(text).toContain("xor_per_sbd");
    expect(text).toContain("Reference providers");
    expect(text).toContain(REWARD_POOL_ACCOUNT_ID);
    expect(text).toContain('"pool_contract_address"');
    expect(text).not.toContain("recipients");
    expect(text).not.toContain("batch_ds");
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
      "effective_from_height",
      "expires_after_height",
      "treasury_payout_binding",
      "payout_lifecycle_proposal_id",
      "payoutLifecycleProposalId",
      "PER_QUALIFYING_TRANSFER_INSTRUCTION",
      "batch_ds",
      "min_xor_out",
      "max_xor_out",
      "120,960",
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

  it("keeps the two-column identity grid and drops retired composer styles", () => {
    const styleRules = (path: string) => {
      const style = source(path).split("<style scoped>")[1] ?? "";
      return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((match) => ({
        selectors: match[1]
          .split(",")
          .map((selector) => selector.trim())
          .filter(Boolean),
        body: match[2],
      }));
    };
    const detailRules = styleRules(
      "src/components/governance/GovernanceProposalDetail.vue",
    );
    const rulesFor = (selector: string) =>
      detailRules
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => rule.body)
        .join("\n");
    for (const grid of [".identity-grid", ".payload-grid"]) {
      expect(rulesFor(grid)).toMatch(
        /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u,
      );
      expect(rulesFor(grid)).toMatch(/gap:\s*16px 24px/u);
    }
    expect(rulesFor(".tier-list")).toMatch(/gap:\s*2px/u);
    expect(rulesFor(".tier-list")).not.toMatch(/grid-template-columns/u);

    const composer = source("src/components/governance/GovernanceComposer.vue");
    expect(composer).not.toMatch(/<textarea|payload-editor|textarea\s*[,{]/u);
    expect(composer).toContain("Institutional payment fee (SBD)");
    expect(composer).not.toContain("Per-payment fee");
  });
});

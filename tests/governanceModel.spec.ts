import { describe, expect, it } from "vitest";
import {
  canonicalGovernanceProposalId,
  isCanonicalUnsignedDecimal,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalKind,
  normalizeGovernanceProposalList,
  normalizeValidationFeePayoutBinding,
  normalizeValidationFeePolicy,
  validateValidationFeePolicy,
  validationFeePolicyEnactmentTargetHeight,
  type GovernanceProposalIdResolver,
} from "@/governance/model";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";

const id = (digit: string) => digit.repeat(64);
const OPERATOR = "testuGovernanceOperator";
const DS_ASSET = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const payoutBinding = () => ({
  contract_address: "ivm:payout-contract",
  code_hash: id("a"),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "testuTreasury",
  ds_asset_id: DS_ASSET,
  xor_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  pool_vault_account_id: "testuPoolVault",
  batch_ds: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `testuValidator${index}`,
    share: "0.25",
  })),
});

const policy = (withPayout = false) => ({
  schema_version: 1,
  network_id: TAIRA_NETWORK_ID,
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: DS_ASSET,
  ds_scale: 2,
  fee: "0.1",
  treasury_account_id: "testuTreasury",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121560",
  expires_after_height: null,
  exemption_classes: withPayout ? ["TREASURY_PAYOUT"] : [],
  treasury_payout_binding: withPayout ? payoutBinding() : null,
});

const lifecycleKind = () => ({
  kind: "ValidationFeePayoutLifecycle",
  payload: {
    proposal_operator: OPERATOR,
    payout_binding: payoutBinding(),
  },
});

const policyKind = (withPayout = false) => ({
  kind: "ValidationFeePolicy",
  payload: {
    proposal_operator: OPERATOR,
    policy: policy(withPayout),
    payout_lifecycle_proposal_id: withPayout ? id("b") : null,
  },
});

const resolver: GovernanceProposalIdResolver = ({ kind }) =>
  kind.type === "ValidationFeePayoutLifecycle" ? id("1") : id("2");

const proposal = (
  kind: ReturnType<typeof lifecycleKind> | ReturnType<typeof policyKind>,
  overrides: Record<string, unknown> = {},
) => ({
  proposer: OPERATOR,
  kind,
  created_height: 100,
  status: "Proposed",
  ...overrides,
});

describe("current governance proposal model", () => {
  it("normalizes the exact operator-bound validation-fee kinds", () => {
    expect(normalizeGovernanceProposalKind(lifecycleKind())).toMatchObject({
      type: "ValidationFeePayoutLifecycle",
      proposalOperator: OPERATOR,
      payoutBinding: { code_hash: id("a"), batch_ds: "10" },
    });
    expect(normalizeGovernanceProposalKind(policyKind(true))).toMatchObject({
      type: "ValidationFeePolicy",
      proposalOperator: OPERATOR,
      payoutLifecycleProposalId: id("b"),
      policy: { network_id: TAIRA_NETWORK_ID },
    });
  });

  it("rejects retired identity, PLAIN electorate, window, and unknown fields", () => {
    for (const retired of [
      { chain_id: "retired" },
      { genesis_hash: id("e") },
      { plain_electorate_rules: {} },
      { referendum_window: { lower: 1, upper: 2 } },
    ]) {
      expect(() =>
        normalizeValidationFeePolicy({ ...policy(), ...retired }),
      ).toThrow(/exactly/);
    }
    expect(() =>
      normalizeGovernanceProposalKind({
        ...policyKind(),
        payload: { ...policyKind().payload, proposal_id: id("1") },
      }),
    ).toThrow(/exactly/);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "DeployContract",
        payload: { proposal_operator: OPERATOR },
      }),
    ).toThrow(/non-validation-fee/);
  });

  it("enforces the exact payout effect plan", () => {
    expect(normalizeValidationFeePayoutBinding(payoutBinding())).toEqual(
      payoutBinding(),
    );
    expect(() =>
      normalizeValidationFeePayoutBinding({
        ...payoutBinding(),
        batch_ds: "9",
      }),
    ).toThrow(/exact first-release DS payout contract/);
    expect(() =>
      normalizeValidationFeePayoutBinding({
        ...payoutBinding(),
        recipients: payoutBinding().recipients.slice(0, 3),
      }),
    ).toThrow(/exactly four/);
  });

  it("accepts only exact network-bound policy invariants", () => {
    expect(normalizeValidationFeePolicy(policy())).toMatchObject({
      network_id: TAIRA_NETWORK_ID,
      fee: "0.1",
      ds_scale: 2,
    });
    expect(() =>
      normalizeValidationFeePolicy({
        ...policy(),
        network_id: `hash:${id("0").toUpperCase()}#0000`,
      }),
    ).toThrow(/canonical NetworkId/);
    expect(() =>
      normalizeValidationFeePolicy({
        ...policy(),
        policy_version: "2",
      }),
    ).toThrow(/previous_policy_hash/);
    expect(() =>
      normalizeValidationFeePolicy({
        ...policy(),
        charging_mode: { charging_mode: "PLAIN", value: null },
      }),
    ).toThrow(/closed native V1 enum/);
  });

  it("normalizes only the exact typed list envelope and native IDs", () => {
    const normalized = normalizeGovernanceProposalList(
      {
        version: 1,
        limit: 2,
        proposals: [
          proposal(lifecycleKind()),
          proposal(policyKind(), { created_height: 101 }),
        ],
        next_cursor: `${Buffer.from("vfprop01").toString("hex")}${"0".repeat(80)}`,
      },
      resolver,
    );
    expect(normalized.items.map(({ proposalId }) => proposalId)).toEqual([
      `0x${id("1")}`,
      `0x${id("2")}`,
    ]);
    expect(normalized.limit).toBe(2);

    expect(() =>
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 1,
          proposals: [{ ...proposal(lifecycleKind()), proposal_id: id("1") }],
          next_cursor: null,
        },
        resolver,
      ),
    ).toThrow(/exactly/);
    expect(() =>
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 2,
          proposals: [
            proposal(policyKind(), { created_height: 101 }),
            proposal(lifecycleKind()),
          ],
          next_cursor: null,
        },
        resolver,
      ),
    ).toThrow(/ordered/);
  });

  it("fails closed on certificates until the public SDK exports its exact validator", () => {
    const proposalId = `0x${id("1")}`;
    expect(() =>
      normalizeGovernanceProposalDetail(
        {
          version: 1,
          proposal: proposal(lifecycleKind(), { status: "Enacted" }),
          current_height: "800",
          governance_certificate: {
            proposal_content_id: id("1"),
          },
        },
        proposalId,
        resolver,
      ),
    ).toThrow(/public Iroha SDK exports its exact GovernanceCertificateV1/u);

    expect(() =>
      normalizeGovernanceProposalDetail(
        {
          version: 1,
          proposal: proposal(lifecycleKind()),
          current_height: "120",
          governance_certificate: null,
        },
        `0x${id("2")}`,
        resolver,
      ),
    ).toThrow(/requested native fingerprint/);
  });

  it("validates canonical IDs, decimals, lifecycle binding, and activation delay", () => {
    expect(canonicalGovernanceProposalId(id("a"))).toBe(`0x${id("a")}`);
    expect(canonicalGovernanceProposalId(id("A"))).toBeNull();
    expect(isCanonicalUnsignedDecimal("0.1")).toBe(true);
    expect(isCanonicalUnsignedDecimal("0")).toBe(false);
    expect(isCanonicalUnsignedDecimal("0", { allowZero: true })).toBe(true);
    expect(validationFeePolicyEnactmentTargetHeight("121560")).toBe("600");
    expect(validationFeePolicyEnactmentTargetHeight("120960")).toBeNull();
    expect(validateValidationFeePolicy(policy() as never, "")).toEqual([]);
    expect(validateValidationFeePolicy(policy(true) as never, id("b"))).toEqual(
      [],
    );
    expect(validateValidationFeePolicy(policy(true) as never, "")).toEqual([
      "A payout lifecycle proposal ID is required exactly when the policy carries a payout binding.",
    ]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertValidationFeePayoutLifecycleDecodedInstruction,
  assertValidationFeePayoutLifecycleDraftResponse,
  assertValidationFeePolicyDecodedInstruction,
  assertValidationFeePolicyDraftResponse,
  buildValidationFeePayoutLifecycleDraftRequest,
  buildValidationFeePolicyDraftRequest,
  VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
  VALIDATION_FEE_POLICY_DRAFT_PATH,
  VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
  type ValidationFeePolicyDraftRequest,
} from "../electron/governanceValidationFeeDraft";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";

const proposalOperator = "testuCanonicalProposalOperator";
const dsAssetDefinitionId = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
const hash = (byte: string): string => byte.repeat(64);
const bytes = (byte: number): number[] => Array(32).fill(byte);

const payoutBinding = () => ({
  contract_address: "irohac1canonicalcontract",
  code_hash: hash("e"),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "testuTreasury",
  ds_asset_id: dsAssetDefinitionId,
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

const policy = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema_version: 1,
  network_id: TAIRA_NETWORK_ID,
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: dsAssetDefinitionId,
  ds_scale: 2,
  fee: "0.1",
  treasury_account_id: "testuTreasury",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121100",
  expires_after_height: null,
  exemption_classes: [],
  treasury_payout_binding: null,
  ...overrides,
});

const policyRequest = (
  input: Record<string, unknown> = {
    policy: policy(),
    payout_lifecycle_proposal_id: null,
  },
) =>
  buildValidationFeePolicyDraftRequest(
    input,
    proposalOperator,
    TAIRA_NETWORK_ID,
  );

const policyResponse = (
  request: ValidationFeePolicyDraftRequest,
  proposalId = hash("a"),
) => ({
  version: 1,
  proposal_operator: request.proposal_operator,
  proposal_id: proposalId,
  proposal_kind: {
    kind: "ValidationFeePolicy",
    payload: {
      proposal_operator: request.proposal_operator,
      policy: request.proposal.payload.policy,
      payout_lifecycle_proposal_id:
        request.proposal.payload.payout_lifecycle_proposal_id,
    },
  },
  tx_instructions: [
    {
      wire_id: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
      payload_hex: "00",
    },
  ],
});

describe("current validation-fee proposal draft boundary", () => {
  it("uses operator-bound canonical authentication before decoding and quoting", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );
    const start = source.indexOf(
      "const prepareGovernanceProposalAction = async",
    );
    const end = source.indexOf(
      "const assertWritableGovernanceProposalKind",
      start,
    );
    const prepare = source.slice(start, end);

    expect(prepare).toContain("proposalOperator");
    expect(prepare).toContain("networkId.toString()");
    expect(prepare).toContain("canonicalToriiJsonRequest");
    expect(prepare).toContain("accountId: proposalOperator");
    expect(prepare).toContain("authentication:");
    expect(prepare).toContain("privateKey.fill(0)");
    expect(prepare).not.toContain("validationFeePlainElectorateRules");
    expect(prepare).not.toContain("referendum_window");
    expect(prepare).not.toContain("governanceRequestJson(input.toriiUrl");
    expect(source).toContain("Reflect.ownKeys(value)");
  });

  it("builds the exact current operator-bound policy request", () => {
    const request = policyRequest();

    expect(VALIDATION_FEE_POLICY_DRAFT_PATH).toBe(
      "/v1/validation-fee/proposals/draft",
    );
    expect(VALIDATION_FEE_POLICY_DRAFT_WIRE_ID).toBe(
      "iroha.instruction.v1::governance::ProposeValidationFeePolicy",
    );
    expect(request).toEqual({
      version: 1,
      proposal_operator: proposalOperator,
      proposal: {
        kind: "POLICY",
        payload: {
          policy: policy(),
          payout_lifecycle_proposal_id: null,
        },
      },
    });
  });

  it("keeps every fixed 32-byte field in canonical Norito JSON hex", () => {
    const request = policyRequest({
      policy: policy({
        policy_version: "2",
        previous_policy_hash: hash("d"),
        exemption_classes: ["TREASURY_PAYOUT"],
        treasury_payout_binding: payoutBinding(),
      }),
      payout_lifecycle_proposal_id: hash("f"),
    });

    expect(request.proposal.payload.policy.previous_policy_hash).toBe(
      hash("d"),
    );
    expect(
      request.proposal.payload.policy.treasury_payout_binding?.code_hash,
    ).toBe(hash("e"));
    expect(request.proposal.payload.payout_lifecycle_proposal_id).toBe(
      hash("f"),
    );
  });

  it("builds only the current payout-lifecycle payload names", () => {
    const request = buildValidationFeePayoutLifecycleDraftRequest(
      { payout_binding: payoutBinding() },
      proposalOperator,
    );

    expect(VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID).toBe(
      "iroha.instruction.v1::governance::ProposeValidationFeePayoutLifecycle",
    );
    expect(request.proposal_operator).toBe(proposalOperator);
    expect(request.proposal.payload.payout_binding).toMatchObject({
      ds_asset_id: dsAssetDefinitionId,
      batch_ds: "10",
      code_hash: hash("e"),
    });
    expect(request).not.toHaveProperty("referendum_window");
    expect(request).not.toHaveProperty("mode");
    expect(request).not.toHaveProperty("plain_electorate_rules");
  });

  it("rejects every retired identity, payout, and referendum field", () => {
    for (const retiredPolicyField of [
      { chain_id: "taira" },
      { genesis_hash: hash("c") },
      { fee_asset_id: dsAssetDefinitionId },
    ]) {
      expect(() =>
        policyRequest({
          policy: policy(retiredPolicyField),
          payout_lifecycle_proposal_id: null,
        }),
      ).toThrow(/must contain exactly/u);
    }

    expect(() =>
      policyRequest({
        policy: policy(),
        payout_lifecycle_proposal_id: null,
        referendum_window: { lower: "1", upper: "2" },
      }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequest(
        {
          payout_binding: {
            ...payoutBinding(),
            sbd_asset_id: dsAssetDefinitionId,
          },
        },
        proposalOperator,
      ),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequest(
        {
          payout_binding: {
            ...payoutBinding(),
            batch_sbd: "10",
          },
        },
        proposalOperator,
      ),
    ).toThrow(/must contain exactly/u);
  });

  it("rejects another network, lossy integers, and payout cross-wiring", () => {
    expect(() =>
      policyRequest({
        policy: policy({ network_id: `hash:${"13".repeat(32)}#0000` }),
        payout_lifecycle_proposal_id: null,
      }),
    ).toThrow(/active exact network/u);
    expect(() =>
      policyRequest({
        policy: policy({ policy_version: 1 }),
        payout_lifecycle_proposal_id: null,
      }),
    ).toThrow(/decimal string/u);
    expect(() =>
      policyRequest({
        policy: policy(),
        payout_lifecycle_proposal_id: hash("f"),
      }),
    ).toThrow(/without a payout binding/u);
    expect(() =>
      policyRequest({
        policy: policy({
          exemption_classes: ["TREASURY_PAYOUT"],
          treasury_payout_binding: payoutBinding(),
        }),
        payout_lifecycle_proposal_id: null,
      }),
    ).toThrow(/requires a lifecycle proposal id/u);
  });

  it("supports the closed native disabled policy variant", () => {
    const request = policyRequest({
      policy: policy({
        fee: "0",
        charging_mode: { charging_mode: "DISABLED", value: null },
      }),
      payout_lifecycle_proposal_id: null,
    });
    expect(request.proposal.payload.policy.fee).toBe("0");
    expect(request.proposal.payload.policy.charging_mode).toEqual({
      charging_mode: "DISABLED",
      value: null,
    });
  });

  it("binds policy responses to operator, proposal, id, and current wire id", () => {
    const request = policyRequest();
    const response = policyResponse(request);

    expect(
      assertValidationFeePolicyDraftResponse(response, request, hash("a")),
    ).toEqual(response.tx_instructions[0]);
    assertValidationFeePolicyDecodedInstruction(
      {
        ProposeValidationFeePolicy: {
          policy: request.proposal.payload.policy,
          payout_lifecycle_proposal_id: null,
        },
      },
      request,
    );

    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...response, proposal_operator: "testuOther" },
        request,
        hash("a"),
      ),
    ).toThrow(/proposal_operator/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...response,
          tx_instructions: [
            {
              ...response.tx_instructions[0],
              wire_id:
                "iroha_data_model::isi::governance::ProposeValidationFeePolicy",
            },
          ],
        },
        request,
        hash("a"),
      ),
    ).toThrow(/exact wire id/u);
  });

  it("binds lifecycle responses and decoded instructions to exact bytes", () => {
    const request = buildValidationFeePayoutLifecycleDraftRequest(
      { payout_binding: payoutBinding() },
      proposalOperator,
    );
    const response = {
      version: 1,
      proposal_operator: proposalOperator,
      proposal_id: hash("b"),
      proposal_kind: {
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          proposal_operator: proposalOperator,
          payout_binding: request.proposal.payload.payout_binding,
        },
      },
      tx_instructions: [
        {
          wire_id: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
          payload_hex: "00",
        },
      ],
    };

    expect(
      assertValidationFeePayoutLifecycleDraftResponse(
        response,
        request,
        hash("b"),
      ),
    ).toEqual(response.tx_instructions[0]);
    assertValidationFeePayoutLifecycleDecodedInstruction(
      {
        ProposeValidationFeePayoutLifecycle: {
          payout_binding: request.proposal.payload.payout_binding,
        },
      },
      request,
    );
    expect(() =>
      assertValidationFeePayoutLifecycleDecodedInstruction(
        {
          ProposeValidationFeePayoutLifecycle: {
            payout_binding: {
              ...request.proposal.payload.payout_binding,
              code_hash: Uint8Array.from(bytes(0xee)),
            },
          },
        },
        request,
      ),
    ).toThrow(/reviewed value/u);
  });

  it("rejects response aliases, unknown fields, and proposal tampering", () => {
    const request = policyRequest();
    const response = policyResponse(request);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...response, proposalOperator },
        request,
        hash("a"),
      ),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...response,
          proposal_kind: {
            ...response.proposal_kind,
            payload: {
              ...response.proposal_kind.payload,
              proposal_operator: "testuOther",
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/exact requested proposal/u);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(
        {
          ProposeValidationFeePolicy: {
            policy: request.proposal.payload.policy,
            payout_lifecycle_proposal_id: null,
            referendum_window: { lower: "1", upper: "2" },
          },
        },
        request,
      ),
    ).toThrow(/must contain exactly/u);
  });

  it("rejects hidden, symbolic, and accessor-backed response fields", () => {
    const request = policyRequest();
    const response = policyResponse(request);
    const hiddenResponse = { ...response };
    Object.defineProperty(hiddenResponse, "shadow", {
      enumerable: false,
      value: "unreviewed",
    });
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        hiddenResponse,
        request,
        hash("a"),
      ),
    ).toThrow(/enumerable JSON data fields/u);

    const symbolicResponse = { ...response, [Symbol("shadow")]: true };
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        symbolicResponse,
        request,
        hash("a"),
      ),
    ).toThrow(/enumerable JSON data fields/u);

    let payloadAccessorRead = false;
    const accessorProposalKind = {
      kind: "ValidationFeePolicy",
      get payload() {
        payloadAccessorRead = true;
        return response.proposal_kind.payload;
      },
    };
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...response, proposal_kind: accessorProposalKind },
        request,
        hash("a"),
      ),
    ).toThrow(/exact requested proposal/u);
    expect(payloadAccessorRead).toBe(false);
  });
});

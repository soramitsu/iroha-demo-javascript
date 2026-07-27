import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertValidationFeePayoutLifecycleDecodedInstruction,
  assertValidationFeePayoutLifecycleDraftResponse,
  assertValidationFeeDraftWindowAgainstCapabilities,
  assertValidationFeePolicyDecodedInstruction,
  assertValidationFeePolicyDraftResponse,
  buildValidationFeePayoutLifecycleDraftRequest as buildValidationFeePayoutLifecycleDraftRequestWithRules,
  buildValidationFeePolicyDraftRequest as buildValidationFeePolicyDraftRequestWithRules,
  VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
  VALIDATION_FEE_POLICY_DRAFT_PATH,
  VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
} from "../electron/governanceValidationFeeDraft";
import {
  TAIRA_GOVERNANCE_XOR_ASSET_ID,
  type GovernanceValidationFeePlainElectorateRulesV1,
} from "../electron/governanceCapabilities";

const hash = (byte: string): string => byte.repeat(64);
const NATIVE_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const plainElectorateRules =
  (): GovernanceValidationFeePlainElectorateRulesV1 => ({
    votingAssetId: TAIRA_GOVERNANCE_XOR_ASSET_ID,
    ballotAmount: "150" as const,
    ballotDurationBlocks: "3600" as const,
    citizenshipAmount: "10000" as const,
    maxMembers: "256" as const,
    convictionStepBlocks: "100" as const,
    maxConviction: "6" as const,
    minTurnout: "1" as const,
    approvalThresholdNumerator: "1" as const,
    approvalThresholdDenominator: "2" as const,
    eligibilityRule: {
      rule: "proposal_operator_at_or_before_gate_others_after_gate" as const,
      value: null,
    },
  });

const plainElectorateRulesWire = () => ({
  voting_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
  ballot_amount: "150",
  ballot_duration_blocks: "3600",
  citizenship_amount: "10000",
  max_members: "256",
  conviction_step_blocks: "100",
  max_conviction: "6",
  min_turnout: "1",
  approval_threshold_numerator: "1",
  approval_threshold_denominator: "2",
  eligibility_rule: {
    rule: "proposal_operator_at_or_before_gate_others_after_gate",
    value: null,
  },
});

const buildValidationFeePolicyDraftRequest = (value: unknown) =>
  buildValidationFeePolicyDraftRequestWithRules(value, plainElectorateRules());

const buildValidationFeePayoutLifecycleDraftRequest = (value: unknown) =>
  buildValidationFeePayoutLifecycleDraftRequestWithRules(
    value,
    plainElectorateRules(),
  );

const payoutBinding = () => ({
  contract_address: "contract:validation-fee",
  code_hash: hash("e"),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "treasury@cbsi",
  sbd_asset_id: "sbd#cbsi",
  xor_asset_id: "xor#sora",
  pool_vault_account_id: "pool@cbsi",
  batch_sbd: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `validator-${index}@cbsi`,
    share: "0.25",
  })),
});

const policy = () => ({
  schema_version: 1,
  chain_id: "taira",
  genesis_hash: hash("c"),
  policy_version: "2",
  previous_policy_hash: hash("d"),
  ds_asset_id: "sbd#cbsi",
  ds_scale: 2,
  fee: "0.10",
  treasury_account_id: "treasury@cbsi",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121262",
  expires_after_height: null,
  exemption_classes: [] as string[],
  treasury_payout_binding: null as Record<string, unknown> | null,
});

const input = () => ({
  policy: policy(),
  referendum_window: { lower: "200", upper: "300" },
  payout_lifecycle_proposal_id: null,
});

const response = (
  request: ReturnType<typeof buildValidationFeePolicyDraftRequest>,
  proposalId = hash("a"),
) => {
  const policy = request.proposal.payload.policy;
  const payoutBinding = policy.treasury_payout_binding as Record<
    string,
    unknown
  > | null;
  return {
    version: 1,
    proposal_id: proposalId,
    proposal_kind: {
      kind: "ValidationFeePolicy",
      payload: {
        policy: {
          ...policy,
          genesis_hash: (policy.genesis_hash as string).toUpperCase(),
          previous_policy_hash:
            policy.previous_policy_hash === null
              ? null
              : (policy.previous_policy_hash as string).toUpperCase(),
          treasury_payout_binding:
            payoutBinding === null
              ? null
              : {
                  ...payoutBinding,
                  code_hash: (payoutBinding.code_hash as string).toUpperCase(),
                },
        },
        payout_lifecycle_proposal_id:
          request.proposal.payload.payout_lifecycle_proposal_id === null
            ? null
            : request.proposal.payload.payout_lifecycle_proposal_id.toUpperCase(),
        plain_electorate_rules: request.plain_electorate_rules,
      },
    },
    tx_instructions: [
      {
        wire_id: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
        payload_hex: "00",
      },
    ],
  };
};

describe("native validation-fee policy draft boundary", () => {
  it("wires the strict builder and validators into the preload signing path", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );
    const start = source.indexOf(
      "const prepareGovernanceProposalAction = async",
    );
    const end = source.indexOf(
      "const prepareGovernancePlainBallotAction = async",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const prepare = source.slice(start, end);

    expect(prepare).toContain("buildValidationFeePolicyDraftRequest");
    expect(prepare).toContain(
      "computeValidationFeePolicyProposalFingerprintV1",
    );
    expect(prepare).toContain(
      "computeValidationFeePayoutLifecycleProposalFingerprintV1",
    );
    expect(prepare).toContain(
      "computeValidationFeePolicyProposalFingerprintV1.length !== 3",
    );
    expect(prepare).toContain(
      "computeValidationFeePayoutLifecycleProposalFingerprintV1.length !== 2",
    );
    expect(prepare).toContain(
      "assertValidationFeeDraftWindowAgainstCapabilities",
    );
    expect(prepare).toContain("capabilities.validationFeePlainElectorateRules");
    expect(prepare).toContain("validationFeeRequest.plain_electorate_rules");
    expect(prepare).toContain(
      "validationFeePayoutLifecycleRequest.plain_electorate_rules",
    );
    expect(prepare).toContain("assertValidationFeePolicyDraftResponse");
    expect(prepare).toContain("assertValidationFeePolicyDecodedInstruction");
    expect(source).toContain("VALIDATION_FEE_POLICY_DRAFT_PATH");
    expect(source).not.toContain('"/v1/gov/proposals/validation-fee-policy"');
  });

  it("builds only the strict V1 PLAIN request for the real Torii route", () => {
    const request = buildValidationFeePolicyDraftRequest(input());

    expect(VALIDATION_FEE_POLICY_DRAFT_PATH).toBe(
      "/v1/validation-fee/proposals/draft",
    );
    expect(VALIDATION_FEE_POLICY_DRAFT_WIRE_ID).toBe(
      "iroha_data_model::isi::governance::ProposeValidationFeePolicy",
    );
    expect(request).toEqual({
      version: 1,
      proposal: {
        kind: "POLICY",
        payload: {
          policy: {
            ...policy(),
            ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
            fee: "0.1",
          },
          payout_lifecycle_proposal_id: null,
        },
      },
      referendum_window: { lower: "200", upper: "300" },
      mode: "Plain",
      plain_electorate_rules: plainElectorateRulesWire(),
    });
  });

  it("requires and canonicalizes the exact capabilities-bound PLAIN electorate rules", () => {
    expect(() =>
      buildValidationFeePolicyDraftRequestWithRules(
        input(),
        undefined as never,
      ),
    ).toThrow(/PLAIN electorate rules must be an object/u);
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequestWithRules(
        {
          payout_binding: payoutBinding(),
          referendum_window: { lower: "400", upper: "3999" },
        },
        {
          ...plainElectorateRules(),
          ballotAmount: "151" as "150",
        },
      ),
    ).toThrow(/exact first-release contract/u);
    expect(() =>
      buildValidationFeePolicyDraftRequestWithRules(input(), {
        ...plainElectorateRules(),
        compatibilityMode: true,
      } as never),
    ).toThrow(/must contain exactly/u);
    expect(
      buildValidationFeePolicyDraftRequestWithRules(
        input(),
        plainElectorateRules(),
      ).plain_electorate_rules,
    ).toEqual(plainElectorateRulesWire());
  });

  it("rejects legacy aliases, unknown fields, and incomplete integers", () => {
    for (const legacy of [
      { network_id: "taira" },
      { fee_asset_id: "sbd#cbsi" },
      { fee_asset_scale: 2 },
      { fee_amount: "0.10" },
      { sbd_asset_id: "sbd#cbsi" },
      { sbd_scale: 2 },
      { fee_minor_units: "0.10" },
    ]) {
      const candidate = input();
      candidate.policy = { ...candidate.policy, ...legacy };
      expect(() => buildValidationFeePolicyDraftRequest(candidate)).toThrow(
        /policy must contain exactly/,
      );
    }

    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        referendum_window: { lower: "200x", upper: "300" },
      }),
    ).toThrow(/complete unsigned integer/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        referendum_window: { lower: "0200", upper: "300" },
      }),
    ).toThrow(/complete unsigned integer/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        extra: true,
      }),
    ).toThrow(/proposal input must contain exactly/);
  });

  it("preserves complete u64 strings without JS Number coercion", () => {
    const maxU64 = (1n << 64n) - 1n;
    const upper = maxU64 - 120_962n;
    const request = buildValidationFeePolicyDraftRequest({
      ...input(),
      policy: {
        ...policy(),
        policy_version: maxU64.toString(),
        effective_from_height: maxU64.toString(),
      },
      referendum_window: {
        lower: upper.toString(),
        upper: upper.toString(),
      },
    });

    expect(request.proposal.payload.policy.policy_version).toBe(
      maxU64.toString(),
    );
    expect(request.proposal.payload.policy.effective_from_height).toBe(
      maxU64.toString(),
    );
    expect(request.referendum_window.upper).toBe(upper.toString());
  });

  it("accepts explicit post-window enactment targets with the exact 120,960-block activation delay", () => {
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        referendum_window: { lower: "301", upper: "300" },
      }),
    ).toThrow(/window is reversed/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        policy: { ...policy(), effective_from_height: "121260" },
      }),
    ).toThrow(/enactment strictly after.*activation exactly 120,960/u);
    expect(
      buildValidationFeePolicyDraftRequest({
        ...input(),
        policy: { ...policy(), effective_from_height: "121261" },
      }),
    ).toMatchObject({
      proposal: {
        payload: { policy: { effective_from_height: "121261" } },
      },
    });
    expect(
      buildValidationFeePolicyDraftRequest({
        ...input(),
        policy: { ...policy(), effective_from_height: "123061" },
      }),
    ).toMatchObject({
      proposal: {
        payload: { policy: { effective_from_height: "123061" } },
      },
    });
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        policy: policy(),
        payout_lifecycle_proposal_id: null,
      }),
    ).toThrow(/proposal input must contain exactly/);
  });

  it("requires the enacted lifecycle proposal selected by an exact payout binding", () => {
    const payoutInput = {
      ...input(),
      policy: {
        ...policy(),
        exemption_classes: ["TREASURY_PAYOUT"],
        treasury_payout_binding: payoutBinding(),
      },
      payout_lifecycle_proposal_id: hash("5"),
    };

    expect(
      buildValidationFeePolicyDraftRequest(payoutInput).proposal.payload
        .payout_lifecycle_proposal_id,
    ).toBe(hash("5"));
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...payoutInput,
        payout_lifecycle_proposal_id: null,
      }),
    ).toThrow(/requires a lifecycle proposal id/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        payout_lifecycle_proposal_id: hash("5"),
      }),
    ).toThrow(/without a payout binding cannot select/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        policy: { ...policy(), ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID },
      }),
    ).toThrow(/must be sbd#cbsi/);
  });

  it("builds and binds the prerequisite payout-lifecycle referendum", () => {
    const request = buildValidationFeePayoutLifecycleDraftRequest({
      payout_binding: payoutBinding(),
      referendum_window: { lower: "400", upper: "3999" },
    });
    expect(request).toEqual({
      version: 1,
      proposal: {
        kind: "PAYOUT_LIFECYCLE",
        payload: {
          payout_binding: {
            ...payoutBinding(),
            sbd_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
          },
        },
      },
      referendum_window: { lower: "400", upper: "3999" },
      mode: "Plain",
      plain_electorate_rules: plainElectorateRulesWire(),
    });

    const draft = {
      version: 1,
      proposal_id: hash("b"),
      proposal_kind: {
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: {
            ...request.proposal.payload.payout_binding,
            code_hash: (
              request.proposal.payload.payout_binding.code_hash as string
            ).toUpperCase(),
          },
          plain_electorate_rules: request.plain_electorate_rules,
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
        draft,
        request,
        hash("b"),
      ),
    ).toMatchObject({
      wire_id: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
      payload_hex: "00",
      proposalId: hash("b"),
    });
    expect(() =>
      assertValidationFeePayoutLifecycleDraftResponse(
        { ...draft, proposal_id: hash("c") },
        request,
        hash("b"),
      ),
    ).toThrow(/differs from the native proposal fingerprint/u);
    expect(() =>
      assertValidationFeePayoutLifecycleDraftResponse(
        { ...draft, proposal_id: hash("b").toUpperCase() },
        request,
        hash("b"),
      ),
    ).toThrow(/lowercase hexadecimal/u);
    expect(() =>
      assertValidationFeePayoutLifecycleDraftResponse(
        {
          ...draft,
          proposal_kind: {
            ...draft.proposal_kind,
            payload: {
              ...draft.proposal_kind.payload,
              payout_binding: {
                ...draft.proposal_kind.payload.payout_binding,
                code_hash: hash("e"),
              },
            },
          },
        },
        request,
        hash("b"),
      ),
    ).toThrow(/proposal_kind.*code_hash differs/u);
    expect(() =>
      assertValidationFeePayoutLifecycleDraftResponse(
        {
          ...draft,
          proposal_kind: {
            ...draft.proposal_kind,
            payload: {
              ...draft.proposal_kind.payload,
              plain_electorate_rules: {
                ...draft.proposal_kind.payload.plain_electorate_rules,
                ballot_amount: "151",
              },
            },
          },
        },
        request,
        hash("b"),
      ),
    ).toThrow(/plain_electorate_rules.*differs/u);
    expect(() =>
      assertValidationFeePayoutLifecycleDecodedInstruction(
        {
          ProposeValidationFeePayoutLifecycle: {
            payout_binding: request.proposal.payload.payout_binding,
            referendum_window: request.referendum_window,
            mode: "Plain",
            plain_electorate_rules: request.plain_electorate_rules,
          },
        },
        request,
      ),
    ).not.toThrow();
    expect(() =>
      assertValidationFeePayoutLifecycleDecodedInstruction(
        {
          ProposeValidationFeePayoutLifecycle: {
            payout_binding: request.proposal.payload.payout_binding,
            referendum_window: request.referendum_window,
            mode: "Plain",
          },
        },
        request,
      ),
    ).toThrow(/must contain exactly/u);
  });

  it("requires the exact f1 capability-relative referendum window", () => {
    const capabilities = {
      currentHeight: 100,
      minEnactmentDelay: 600,
      windowSpan: 3_600,
    };
    expect(() =>
      assertValidationFeeDraftWindowAgainstCapabilities(
        { lower: "701", upper: "4300" },
        capabilities,
      ),
    ).not.toThrow();
    expect(() =>
      assertValidationFeeDraftWindowAgainstCapabilities(
        { lower: "700", upper: "4299" },
        capabilities,
      ),
    ).toThrow(/earlier than current_height/u);
    expect(() =>
      assertValidationFeeDraftWindowAgainstCapabilities(
        { lower: "701", upper: "4299" },
        capabilities,
      ),
    ).toThrow(/exact inclusive capability window_span/u);
    expect(() =>
      assertValidationFeeDraftWindowAgainstCapabilities(
        { lower: "701", upper: "4301" },
        capabilities,
      ),
    ).toThrow(/exact inclusive capability window_span/u);
  });

  it("rejects mutated payout lifecycle recipients, bounds, fields, and mode", () => {
    const base = {
      payout_binding: payoutBinding(),
      referendum_window: { lower: 400, upper: 3999 },
    };
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequest({
        ...base,
        payout_binding: {
          ...payoutBinding(),
          recipients: payoutBinding().recipients.slice(0, 3),
        },
      }),
    ).toThrow(/exactly four recipients/);
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequest({
        ...base,
        payout_binding: { ...payoutBinding(), max_xor_out: "101" },
      }),
    ).toThrow(/exact first-release entrypoint and payout bounds/);
    expect(() =>
      buildValidationFeePayoutLifecycleDraftRequest({
        ...base,
        payout_binding: { ...payoutBinding(), sponsor: "forbidden" },
      }),
    ).toThrow(/must contain exactly/);

    const request = buildValidationFeePayoutLifecycleDraftRequest(base);
    expect(() =>
      assertValidationFeePayoutLifecycleDecodedInstruction(
        {
          ProposeValidationFeePayoutLifecycle: {
            payout_binding: request.proposal.payload.payout_binding,
            referendum_window: request.referendum_window,
            mode: "Zk",
            plain_electorate_rules: request.plain_electorate_rules,
          },
        },
        request,
      ),
    ).toThrow(/mode differs/);
  });

  it("strictly binds the response and locally decoded instruction", () => {
    const request = buildValidationFeePolicyDraftRequest(input());
    const draft = response(request);
    const decoded = {
      ProposeValidationFeePolicy: {
        policy: request.proposal.payload.policy,
        payout_lifecycle_proposal_id: null,
        referendum_window: request.referendum_window,
        mode: "Plain",
        plain_electorate_rules: request.plain_electorate_rules,
      },
    };

    expect(
      assertValidationFeePolicyDraftResponse(draft, request, hash("a")),
    ).toEqual(draft.tx_instructions[0]);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(decoded, request),
    ).not.toThrow();

    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...draft, accepted: true },
        request,
        hash("a"),
      ),
    ).toThrow(/response must contain exactly/);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...draft,
          proposal_kind: {
            ...draft.proposal_kind,
            payload: {
              ...draft.proposal_kind.payload,
              policy: {
                ...draft.proposal_kind.payload.policy,
                fee: "0.11",
              },
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/proposal_kind.*fee differs/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...draft,
          proposal_kind: {
            ...draft.proposal_kind,
            payload: {
              ...draft.proposal_kind.payload,
              plain_electorate_rules: {
                ...draft.proposal_kind.payload.plain_electorate_rules,
                min_turnout: "2",
              },
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/plain_electorate_rules.*differs/u);
    for (const typeDrift of [
      { schema_version: "1" },
      { ds_scale: "2" },
      { effective_from_height: 121262 },
    ]) {
      expect(() =>
        assertValidationFeePolicyDraftResponse(
          {
            ...draft,
            proposal_kind: {
              ...draft.proposal_kind,
              payload: {
                ...draft.proposal_kind.payload,
                policy: {
                  ...draft.proposal_kind.payload.policy,
                  ...typeDrift,
                },
              },
            },
          },
          request,
          hash("a"),
        ),
      ).toThrow(/proposal_kind.*differs/u);
    }
    expect(() =>
      assertValidationFeePolicyDraftResponse(draft, request, hash("c")),
    ).toThrow(/differs from the native proposal fingerprint/);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...draft,
          tx_instructions: [
            {
              ...draft.tx_instructions[0],
              wire_id: "ProposeValidationFeePolicy",
            },
          ],
        },
        request,
        hash("a"),
      ),
    ).toThrow(/must use iroha_data_model::isi::governance/);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...draft,
          proposal_kind: {
            ...draft.proposal_kind,
            payload: {
              ...draft.proposal_kind.payload,
              policy: {
                ...draft.proposal_kind.payload.policy,
                genesis_hash: hash("c"),
              },
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/proposal_kind.*genesis_hash differs/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...draft, proposal_id: hash("a").toUpperCase() },
        request,
        hash("a"),
      ),
    ).toThrow(/lowercase hexadecimal/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...draft, proposal_id: `${"a".repeat(63)}A` },
        request,
        hash("a"),
      ),
    ).toThrow(/lowercase hexadecimal/u);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(
        {
          ProposeValidationFeePolicy: {
            ...decoded.ProposeValidationFeePolicy,
            mode: "Zk",
          },
        },
        request,
      ),
    ).toThrow(/mode differs/);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(
        {
          ProposeValidationFeePolicy: {
            policy: request.proposal.payload.policy,
            payout_lifecycle_proposal_id: null,
            referendum_window: request.referendum_window,
            mode: "Plain",
          },
        },
        request,
      ),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(
        {
          ProposeValidationFeePolicy: {
            ...decoded.ProposeValidationFeePolicy,
            compatibility_signature: "forbidden",
          },
        },
        request,
      ),
    ).toThrow(/must contain exactly/);
  });
});

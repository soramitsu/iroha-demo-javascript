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
} from "../electron/governanceValidationFeeDraft";

const hash = (byte: string): string => byte.repeat(64);

const payoutBinding = () => ({
  contract_address: "contract:validation-fee",
  code_hash: hash("4"),
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
  genesis_hash: hash("1"),
  policy_version: "2",
  previous_policy_hash: hash("2"),
  ds_asset_id: "sbd#cbsi",
  ds_scale: 2,
  fee: "0.10",
  treasury_account_id: "treasury@cbsi",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121260",
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
  proposalId = hash("3"),
) => ({
  version: 1,
  proposal_id: proposalId,
  proposal_kind: {
    kind: "ValidationFeePolicy",
    payload: request.proposal.payload,
  },
  tx_instructions: [
    {
      wire_id: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
      payload_hex: "00",
    },
  ],
});

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
            fee: "0.1",
          },
          payout_lifecycle_proposal_id: null,
        },
      },
      referendum_window: { lower: "200", upper: "300" },
      mode: "Plain",
    });
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
    const upper = maxU64 - 120_960n;
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

  it("requires an explicit ordered window and activation at upper + 120,960", () => {
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        referendum_window: { lower: "301", upper: "300" },
      }),
    ).toThrow(/window is reversed/);
    expect(() =>
      buildValidationFeePolicyDraftRequest({
        ...input(),
        policy: { ...policy(), effective_from_height: "121259" },
      }),
    ).toThrow(/120,960 blocks after the referendum window ends/);
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
        payload: { payout_binding: payoutBinding() },
      },
      referendum_window: { lower: "400", upper: "3999" },
      mode: "Plain",
    });

    const draft = {
      version: 1,
      proposal_id: hash("6"),
      proposal_kind: {
        kind: "ValidationFeePayoutLifecycle",
        payload: request.proposal.payload,
      },
      tx_instructions: [
        {
          wire_id: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
          payload_hex: "00",
        },
      ],
    };
    expect(
      assertValidationFeePayoutLifecycleDraftResponse(draft, request),
    ).toMatchObject({
      wire_id: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
      payload_hex: "00",
      proposalId: hash("6"),
    });
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
    ).not.toThrow();
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
      },
    };

    expect(
      assertValidationFeePolicyDraftResponse(draft, request, hash("3")),
    ).toEqual(draft.tx_instructions[0]);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(decoded, request),
    ).not.toThrow();

    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...draft, accepted: true },
        request,
        hash("3"),
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
        hash("3"),
      ),
    ).toThrow(/proposal_kind.*fee differs/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(draft, request, hash("4")),
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
        hash("3"),
      ),
    ).toThrow(/must use iroha_data_model::isi::governance/);
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
            ...decoded.ProposeValidationFeePolicy,
            compatibility_signature: "forbidden",
          },
        },
        request,
      ),
    ).toThrow(/must contain exactly/);
  });
});

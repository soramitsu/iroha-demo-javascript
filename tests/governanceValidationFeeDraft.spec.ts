import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeFirstReleaseValidationFeePayoutLifecycleFingerprint,
  computeFirstReleaseValidationFeePolicyFingerprint,
} from "../electron/firstReleaseGovernanceFingerprint";
import {
  assertValidationFeePolicyDecodedInstruction,
  assertValidationFeePolicyDraftResponse,
  buildValidationFeePolicyDraftRequest,
  validationFeePolicyDraftInstruction,
  VALIDATION_FEE_POLICY_DRAFT_PATH,
  VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
  type ValidationFeePolicyDraftRequest,
} from "../electron/governanceValidationFeeDraft";
import { decodeReviewedFirstReleaseInstructionDraft } from "../electron/firstReleaseNativeInstruction";
import { getInstalledIrohaJsNativeBinding } from "../electron/irohaJsNativeDir";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  PROPOSAL_OPERATOR as proposalOperator,
  SECOND_PROPOSAL_OPERATOR,
  TREASURY_ACCOUNT_ID,
  validationFeePolicy as policy,
} from "./helpers/validationFeeFixtures";

const TAIRA_PREFIX = 369;
const hash = (byte: string): string => byte.repeat(64);

const policyRequest = (input: Record<string, unknown> = { policy: policy() }) =>
  buildValidationFeePolicyDraftRequest(
    input,
    proposalOperator,
    TAIRA_NETWORK_ID,
    TAIRA_PREFIX,
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
    },
  },
  tx_instructions: [
    {
      wire_id: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
      payload_hex: "00",
    },
  ],
});

/** SDK `retail_fee_native_*_v1.json` fixtures rendered with prefix 369. */
const sdkFixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      resolve(
        process.env.IROHA_JS_SDK_ROOT ??
          resolve(process.cwd(), "node_modules/.cache/iroha-sdk-compat/active"),
        "test/fixtures",
        name,
      ),
      "utf8",
    ).replaceAll("sorau", "testu"),
  ) as Record<string, unknown>;

/**
 * The registered concrete instruction frame Torii returns as `payload_hex`:
 * the trailing `Vec<u8>` field of a public `InstructionBox` frame.
 */
const concreteInstructionFrame = (publicFrame: unknown): Buffer => {
  const bytes = Buffer.from(publicFrame as Uint8Array);
  const start = bytes.indexOf("NRT0", 40, "latin1");
  expect(start).toBeGreaterThan(48);
  expect(Number(bytes.readBigUInt64LE(start - 8))).toBe(bytes.length - start);
  return bytes.subarray(start);
};

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
      "const confirmPreparedGovernanceAction = async",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const prepare = source.slice(start, end);

    // Payout-lifecycle drafts are refused before any endpoint or vault access.
    expect(prepare.indexOf('if (input.kind !== "ValidationFeePolicy")')).toBe(
      prepare.indexOf("if ("),
    );
    expect(
      prepare.indexOf('if (input.kind !== "ValidationFeePolicy")'),
    ).toBeLessThan(prepare.indexOf("resolveSigningMaterial"));
    expect(prepare).not.toMatch(
      /PayoutLifecycleDraft|PAYOUT_LIFECYCLE|payout_binding/u,
    );
    expect(prepare).toContain(
      "expectedInstruction:\n        validationFeePolicyDraftInstruction(validationFeeRequest),",
    );
    expect(prepare).toContain("proposalOperator");
    expect(prepare).toContain("networkId.toString()");
    expect(prepare).toContain("canonicalToriiJsonRequest");
    expect(prepare).toContain("accountId: proposalOperator");
    expect(prepare).toContain("authentication:");
    expect(prepare).toContain("privateKey.fill(0)");
    expect(prepare).not.toContain("payout_lifecycle_proposal_id");
    expect(prepare).not.toContain("payoutLifecycleProposalId");
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
        payload: { policy: policy() },
      },
    });
    expect(Object.keys(request.proposal.payload.policy)).toEqual(
      Object.keys(policy()),
    );
  });

  it("keeps native [u8; 32] fields in uppercase Norito JSON hex", () => {
    const request = policyRequest({
      policy: policy({
        policy_version: "2",
        previous_policy_hash: hash("D"),
      }),
    });
    expect(request.proposal.payload.policy.previous_policy_hash).toBe(
      hash("D"),
    );
    expect(() =>
      policyRequest({
        policy: policy({
          policy_version: "2",
          previous_policy_hash: hash("d"),
        }),
      }),
    ).toThrow(/uppercase hexadecimal/u);
  });

  it("rejects every retired policy, lifecycle-link, and referendum field", () => {
    for (const retiredPolicyField of [
      { chain_id: "taira" },
      { genesis_hash: hash("c") },
      { fee_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv" },
      { effective_from_height: "121100" },
      { expires_after_height: null },
      { treasury_payout_binding: null },
    ]) {
      expect(() =>
        policyRequest({ policy: policy(retiredPolicyField) }),
      ).toThrow(/must contain exactly/u);
    }
    expect(() =>
      policyRequest({ policy: policy(), payout_lifecycle_proposal_id: null }),
    ).toThrow(/must contain exactly policy/u);
    expect(() =>
      policyRequest({
        policy: policy(),
        referendum_window: { lower: "1", upper: "2" },
      }),
    ).toThrow(/must contain exactly/u);
  });

  it("rejects another network, other prefixes, and lossy or retired values", () => {
    expect(() =>
      policyRequest({
        policy: policy({ network_id: `hash:${"13".repeat(32)}#9CE1` }),
      }),
    ).toThrow(/canonical NetworkId|active exact network/u);
    expect(() =>
      policyRequest({ policy: policy({ policy_version: 1 }) }),
    ).toThrow(/decimal string/u);
    expect(() => policyRequest({ policy: policy({ fee: "0.10" }) })).toThrow(
      /no trailing zeros/u,
    );
    expect(() =>
      policyRequest({
        policy: policy({ effective_from_ms: "1793451600000" }),
      }),
    ).toThrow(/JSON integer/u);
    expect(() =>
      policyRequest({
        policy: policy({
          charging_mode: { charging_mode: "DISABLED", value: null },
        }),
      }),
    ).toThrow(/RETAIL_MONTHLY_ALLOWANCE/u);
    const sorauTreasury = TREASURY_ACCOUNT_ID.replace("testu", "sorau");
    expect(() =>
      policyRequest({
        policy: policy({
          treasury_account_id: sorauTreasury,
          reward_custody: {
            ...(policy().reward_custody as Record<string, unknown>),
            treasury_account_id: sorauTreasury,
          },
        }),
      }),
    ).toThrow(/canonical I105 account for the active network/u);
    expect(() =>
      buildValidationFeePolicyDraftRequest(
        { policy: policy() },
        proposalOperator.replace("testu", "sorau"),
        TAIRA_NETWORK_ID,
        TAIRA_PREFIX,
      ),
    ).toThrow(/canonical I105 account for the active network/u);
  });

  it("binds policy responses to operator, proposal, id, and current wire id", () => {
    const request = policyRequest();
    const response = policyResponse(request);

    expect(
      assertValidationFeePolicyDraftResponse(response, request, hash("a")),
    ).toEqual(response.tx_instructions[0]);
    assertValidationFeePolicyDecodedInstruction(
      {
        ProposeValidationFeePolicy: { policy: request.proposal.payload.policy },
      },
      request,
    );

    expect(() =>
      assertValidationFeePolicyDraftResponse(
        { ...response, proposal_operator: SECOND_PROPOSAL_OPERATOR },
        request,
        hash("a"),
      ),
    ).toThrow(/proposal_operator/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(response, request, hash("b")),
    ).toThrow(/native proposal fingerprint/u);
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
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...response,
          proposal_kind: {
            ...response.proposal_kind,
            payload: {
              ...response.proposal_kind.payload,
              payout_lifecycle_proposal_id: null,
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/exact requested proposal/u);
    expect(() =>
      assertValidationFeePolicyDraftResponse(
        {
          ...response,
          proposal_kind: {
            ...response.proposal_kind,
            payload: {
              ...response.proposal_kind.payload,
              policy: {
                ...request.proposal.payload.policy,
                effective_from_ms: String(
                  request.proposal.payload.policy.effective_from_ms,
                ),
              },
            },
          },
        },
        request,
        hash("a"),
      ),
    ).toThrow(/exact requested proposal/u);
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
              proposal_operator: SECOND_PROPOSAL_OPERATOR,
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

describe("validation-fee draft requests against the active native binding", () => {
  it("reproduces the pinned native fingerprint vectors through the wallet fingerprint boundary", () => {
    expect(
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: TAIRA_PREFIX,
        policy: sdkFixture("retail_fee_native_policy_v1.json"),
      }),
    ).toBe("7ea3f657b77099f869d1aae9a47845d66094154e26e664c971434722cb0b31c4");
    expect(
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator: SECOND_PROPOSAL_OPERATOR,
        networkPrefix: TAIRA_PREFIX,
        policy: sdkFixture("retail_fee_native_policy_v1.json"),
      }),
    ).toBe("e6fae2d16761eb221142b5e236ad09d31e1bdd1c4245538f08a932fb8136f7f1");
    expect(
      computeFirstReleaseValidationFeePayoutLifecycleFingerprint({
        proposalOperator,
        networkPrefix: TAIRA_PREFIX,
        payoutBinding: sdkFixture("retail_fee_native_conversion_v1.json"),
      }),
    ).toBe("8e28c5de8ce8928696065b15e09073b9bbebbaa30e690d4c6bd2ca75b9a3c1b4");
  });

  it("admits the Torii concrete policy frame only when it equals the reviewed instruction", () => {
    const request = policyRequest();
    expect(
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: TAIRA_PREFIX,
        policy: request.proposal.payload.policy,
      }),
    ).toMatch(/^[0-9a-f]{64}$/u);
    const native = getInstalledIrohaJsNativeBinding() as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const reviewed = validationFeePolicyDraftInstruction(request);
    // Torii's `framed_instruction_payload`: the registered concrete frame.
    const frame = concreteInstructionFrame(
      native.noritoEncodeInstruction(JSON.stringify(reviewed), TAIRA_PREFIX),
    );
    expect(() => native.noritoDecodeInstruction(frame, TAIRA_PREFIX)).toThrow(
      /schema mismatch/u,
    );

    const decoded = decodeReviewedFirstReleaseInstructionDraft({
      wireId: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
      frame,
      expectedInstruction: reviewed,
      networkPrefix: TAIRA_PREFIX,
    });
    expect(decoded).toEqual(reviewed);
    expect(() =>
      assertValidationFeePolicyDecodedInstruction(decoded, request),
    ).not.toThrow();

    const otherPolicy = policy();
    (otherPolicy.retail_schedule as Record<string, unknown>).included_payments =
      60;
    const otherFrame = concreteInstructionFrame(
      native.noritoEncodeInstruction(
        JSON.stringify(
          validationFeePolicyDraftInstruction(
            policyRequest({ policy: otherPolicy }),
          ),
        ),
        TAIRA_PREFIX,
      ),
    );
    const tampered = Buffer.from(frame);
    tampered[tampered.length - 1] ^= 1;
    for (const [wireId, candidate] of [
      [VALIDATION_FEE_POLICY_DRAFT_WIRE_ID, otherFrame],
      [VALIDATION_FEE_POLICY_DRAFT_WIRE_ID, tampered],
      ["iroha.instruction.v1::governance::RegisterCitizen", frame],
    ] as const) {
      expect(() =>
        decodeReviewedFirstReleaseInstructionDraft({
          wireId,
          frame: candidate,
          expectedInstruction: reviewed,
          networkPrefix: TAIRA_PREFIX,
        }),
      ).toThrow(/differ from the exact reviewed instruction/u);
    }
    expect(() =>
      native.noritoEncodeInstruction(
        JSON.stringify({
          ProposeValidationFeePolicy: {
            policy: request.proposal.payload.policy,
            payout_lifecycle_proposal_id: null,
          },
        }),
        TAIRA_PREFIX,
      ),
    ).toThrow(/must contain exactly \[policy\]/u);
  });

  it("has no reviewable payout-lifecycle instruction codec, so lifecycle writes stay disabled", () => {
    const native = getInstalledIrohaJsNativeBinding() as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    // If this starts passing, the SDK gained a JSON codec for the lifecycle
    // instruction and the inspect-only restriction can be revisited.
    expect(() =>
      native.noritoEncodeInstruction(
        JSON.stringify({
          ProposeValidationFeePayoutLifecycle: {
            payout_binding: sdkFixture("retail_fee_native_conversion_v1.json"),
          },
        }),
        TAIRA_PREFIX,
      ),
    ).toThrow(/unsupported instruction/u);
  });
});

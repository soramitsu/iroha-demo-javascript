import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_KIND_ADAPTERS,
  GOVERNANCE_PARLIAMENT_BODIES,
  GOVERNANCE_PIPELINE_STAGES,
  activeParliamentBody,
  assertPlainGovernanceProposalWrite,
  canonicalGovernanceProposalId,
  isAccountInParliamentRoster,
  isCanonicalUnsignedDecimal,
  isEnactActionable,
  isReferendumPlainVoteOpen,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalKind,
  normalizeGovernanceProposalList,
  normalizeValidationFeePolicy,
  plainBallotLockCoversReferendum,
  rebaseGovernanceReferendumWindow,
  validationFeeMinimumEffectiveHeight,
  validationFeePolicyEffectiveHeight,
  validationFeePolicyEnactmentTiming,
  validateValidationFeePolicy,
  type GovernanceProposalDetail,
  type ValidationFeePolicyPayload,
} from "@/governance/model";

const PROPOSAL_ID = `0x${"ab".repeat(32)}`;
const POLICY_HASH = `0x${"cd".repeat(32)}`;
const NATIVE_POLICY_HASH = "cd".repeat(32);
const ACCOUNT_ID = "sorau-demo-citizen";
const REFERENDUM_WINDOW = { lower: "80", upper: "100" };

const policy = (): ValidationFeePolicyPayload => ({
  schema_version: 1,
  chain_id: "sora-mainnet",
  genesis_hash: "ef".repeat(32),
  policy_version: "2",
  previous_policy_hash: NATIVE_POLICY_HASH,
  ds_asset_id: "sbd#cbsi",
  ds_scale: 2,
  fee: "0.10",
  treasury_account_id: "sorau-treasury",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121060",
  expires_after_height: "242000",
  exemption_classes: [],
  treasury_payout_binding: null,
});

const nativePolicy = () => ({
  ...policy(),
  policy_version: 2,
  effective_from_height: 121060,
  expires_after_height: 242000,
});

const detailFixture = () => ({
  proposal_id: PROPOSAL_ID,
  referendum_id: PROPOSAL_ID.slice(2),
  proposal: {
    proposal: {
      proposer: "sorau-proposer",
      created_height: "70",
      status: "Proposed",
      kind: {
        kind: "ValidationFeePolicy",
        payload: { policy: nativePolicy(), policy_hash: POLICY_HASH },
      },
      pipeline: {
        stages: [
          {
            stage: "Admit",
            started_at: "70",
            completed_at: "71",
          },
          {
            stage: "Rules",
            started_at: "71",
            deadline: "90",
          },
        ],
      },
      parliament_snapshot: {
        rosters: {
          "rules-committee": {
            members: [ACCOUNT_ID],
            alternates: ["sorau-alternate"],
          },
        },
      },
    },
  },
  referendum: {
    referendum: {
      id: PROPOSAL_ID.slice(2),
      h_start: "80",
      h_end: "100",
      status: "Open",
      mode: "Plain",
    },
  },
  tally: { approve: "8", reject: "3", abstain: "1" },
  locks: {
    locks: {
      [ACCOUNT_ID]: {
        amount: "10",
        expiry_height: "130",
        direction: "Aye",
        duration_blocks: "50",
      },
    },
  },
  parliament_outcomes: [
    {
      body: "rules-committee",
      approvals: "1",
      rejections: "0",
      abstentions: "0",
      required: "2",
      current_account_decision: null,
    },
  ],
  current_height: "85",
});

describe("governance proposal model", () => {
  it("canonicalizes only exact 32-byte proposal identifiers", () => {
    expect(canonicalGovernanceProposalId("AB".repeat(32))).toBe(PROPOSAL_ID);
    expect(canonicalGovernanceProposalId(`0x${"AB".repeat(32)}`)).toBe(
      PROPOSAL_ID,
    );
    expect(canonicalGovernanceProposalId("ab")).toBeNull();
    expect(canonicalGovernanceProposalId("z".repeat(64))).toBeNull();
  });

  it("normalizes every supported kind and keeps unknown kinds inspect-only", () => {
    expect(
      normalizeGovernanceProposalKind({
        variant: "DeployContract",
        deploy_contract: {
          contract_address: "contract",
          code_hash_hex: "code",
          abi_hash_hex: "abi",
          abi_version: "1",
        },
      }),
    ).toMatchObject({
      type: "DeployContract",
      contractAddress: "contract",
      codeHash: "code",
      abiHash: "abi",
      abiVersion: "1",
    });
    expect(
      normalizeGovernanceProposalKind({
        RuntimeUpgrade: { manifest: { version: 4 } },
      }),
    ).toMatchObject({
      type: "RuntimeUpgrade",
      manifest: { version: 4 },
    });
    expect(
      normalizeGovernanceProposalKind({
        variant: "SccpRouteGovernance",
        payload: { action: { kind: "Activate" } },
      }),
    ).toMatchObject({
      type: "SccpRouteGovernance",
      action: { kind: "Activate" },
    });
    expect(
      normalizeGovernanceProposalKind({
        variant: "ValidationFeePolicy",
        payload: { policy: nativePolicy(), policy_hash: POLICY_HASH },
      }),
    ).toMatchObject({
      type: "ValidationFeePolicy",
      policy: policy(),
      policyHash: POLICY_HASH,
    });
    expect(
      normalizeGovernanceProposalKind({
        kind: "VALIDATION_FEE_PAYOUT_LIFECYCLE",
        payload: { payout_binding: { contract_address: "contract:payout" } },
      }),
    ).toMatchObject({
      type: "ValidationFeePayoutLifecycle",
      payoutBinding: { contract_address: "contract:payout" },
    });
    expect(
      normalizeGovernanceProposalKind({
        variant: "FutureProposal",
        payload: { value: 1 },
      }),
    ).toMatchObject({
      type: "Unknown",
      variant: "FutureProposal",
    });
    expect(GOVERNANCE_KIND_ADAPTERS.Unknown.readOnly).toBe(true);
    expect(GOVERNANCE_KIND_ADAPTERS.Unknown.composer).toBeNull();
  });

  it("normalizes live detail, lifecycle, rosters, outcomes, tally, and locks", () => {
    const detail = normalizeGovernanceProposalDetail(
      detailFixture(),
      PROPOSAL_ID,
    );
    expect(detail.summary).toMatchObject({
      proposalId: PROPOSAL_ID,
      proposer: "sorau-proposer",
      status: "Proposed",
      referendumStatus: "Open",
      votingMode: "Plain",
      kindType: "ValidationFeePolicy",
      currentStage: "Rules",
    });
    expect(detail.pipeline.map(({ stage }) => stage)).toEqual(
      GOVERNANCE_PIPELINE_STAGES,
    );
    expect(detail.tally).toEqual({
      approve: "8",
      reject: "3",
      abstain: "1",
      turnout: "0",
      minTurnout: "0",
      approvalThresholdNumerator: "0",
      approvalThresholdDenominator: "0",
      approved: null,
    });
    expect(detail.locks).toEqual([
      {
        owner: ACCOUNT_ID,
        amount: "10",
        expiryHeight: "130",
        direction: "Aye",
        durationBlocks: "50",
      },
    ]);
    expect(detail.parliamentRosters[0]).toEqual({
      body: "rules-committee",
      members: [ACCOUNT_ID],
      alternates: ["sorau-alternate"],
    });
    expect(detail.parliamentOutcomes[0]).toMatchObject({
      body: "rules-committee",
      approvals: "1",
      required: "2",
      currentAccountDecision: null,
    });
  });

  it("normalizes paginated list envelopes", () => {
    const result = normalizeGovernanceProposalList({
      items: [detailFixture()],
      next_cursor: "cursor-2",
    });
    expect(result.nextCursor).toBe("cursor-2");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      proposalId: PROPOSAL_ID,
      kindType: "ValidationFeePolicy",
      currentStage: "Rules",
    });
  });

  it("rejects incomplete, fractional, and non-canonical governance integers", () => {
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "85blocks",
      }),
    ).toThrow(/complete canonical decimal integers/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "085",
      }),
    ).toThrow(/complete canonical decimal integers/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: 85.5,
      }),
    ).toThrow(/complete canonical decimal integers/);
  });

  it("normalizes the typed validation-fee proposal catalog returned by Torii", () => {
    const result = normalizeGovernanceProposalList({
      version: 1,
      proposals: [
        {
          proposal_id: PROPOSAL_ID.slice(2),
          proposer: "sorau-proposer",
          proposal_kind: {
            kind: "VALIDATION_FEE_POLICY",
            payload: { policy: nativePolicy() },
          },
          created_height: 70,
          status: "PROPOSED",
          referendum: {
            window: { lower: 80, upper: 100 },
            mode: "Plain",
            opened: true,
            closed: false,
          },
          parliament_snapshot: {
            bodies: {
              "rules-committee": {
                members: [ACCOUNT_ID],
                alternates: [],
              },
            },
          },
          finalization_evidence: null,
          enacted_at_height: null,
        },
      ],
    });

    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      proposalId: PROPOSAL_ID,
      proposer: "sorau-proposer",
      status: "Proposed",
      referendumStatus: "Open",
      votingMode: "Plain",
      kindType: "ValidationFeePolicy",
      createdHeight: "70",
    });

    const detail = normalizeGovernanceProposalDetail(
      {
        version: 1,
        proposal: {
          ...result.items[0],
          proposal_id: PROPOSAL_ID.slice(2),
          proposer: "sorau-proposer",
          proposal_kind: {
            kind: "VALIDATION_FEE_POLICY",
            payload: { policy: nativePolicy() },
          },
          created_height: 70,
          status: "PROPOSED",
          referendum: {
            window: { lower: 80, upper: 100 },
            mode: "Plain",
            opened: true,
            closed: false,
          },
          parliament_snapshot: {
            bodies: {
              "rules-committee": {
                members: [ACCOUNT_ID],
                alternates: [],
              },
            },
          },
        },
      },
      PROPOSAL_ID,
    );
    expect(detail.referendum).toMatchObject({
      id: PROPOSAL_ID.slice(2),
      hStart: "80",
      hEnd: "100",
      status: "Open",
      mode: "Plain",
    });
    expect(detail.kind.type).toBe("ValidationFeePolicy");
  });

  it("derives citizen and Parliament action eligibility from live state", () => {
    const detail = normalizeGovernanceProposalDetail(detailFixture());
    expect(isReferendumPlainVoteOpen(detail)).toBe(true);
    expect(activeParliamentBody(detail)).toBe("rules-committee");
    expect(
      isAccountInParliamentRoster(detail, ACCOUNT_ID, "rules-committee"),
    ).toBe(true);
    expect(
      isAccountInParliamentRoster(detail, "sorau-outsider", "rules-committee"),
    ).toBe(false);
    expect(
      isAccountInParliamentRoster(detail, "sorau-alternate", "rules-committee"),
    ).toBe(false);
    expect(isEnactActionable(detail)).toBe(false);

    const approved = {
      ...detail,
      summary: { ...detail.summary, status: "Approved" as const },
    };
    expect(isEnactActionable(approved)).toBe(true);
    const approvedZk = {
      ...approved,
      referendum: { ...approved.referendum!, mode: "Zk" as const },
    };
    expect(isEnactActionable(approvedZk)).toBe(false);
    expect(() => assertPlainGovernanceProposalWrite(approvedZk)).toThrow(
      /without a PLAIN referendum/,
    );
    expect(() => assertPlainGovernanceProposalWrite(approved)).not.toThrow();
    expect(() =>
      assertPlainGovernanceProposalWrite({
        ...approved,
        referendum: null,
      }),
    ).toThrow(/without a PLAIN referendum/);
  });

  it("normalizes all seven concurrent body outcomes including FMA", () => {
    const bodies = Object.fromEntries(
      GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => [
        body,
        {
          members: [`member-${index}@sora`],
          alternates: [`alternate-${index}@sora`],
        },
      ]),
    );
    const detail = normalizeGovernanceProposalDetail({
      ...detailFixture(),
      proposal: {
        proposal: {
          ...detailFixture().proposal.proposal,
          parliament_snapshot: { bodies },
        },
      },
      body_progress: GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => ({
        body,
        approve: String(index + 1),
        reject: "0",
        abstain: "0",
        required: String(index + 2),
        current_account_decision: index === 6 ? "APPROVE" : null,
      })),
    });

    expect(detail.parliamentRosters.map(({ body }) => body)).toEqual(
      GOVERNANCE_PARLIAMENT_BODIES,
    );
    expect(detail.parliamentOutcomes.map(({ body }) => body)).toEqual(
      GOVERNANCE_PARLIAMENT_BODIES,
    );
    expect(detail.parliamentOutcomes.at(-1)).toMatchObject({
      body: "fma-committee",
      approvals: "7",
      required: "8",
      currentAccountDecision: "approve",
    });
    expect(
      isAccountInParliamentRoster(detail, "alternate-6@sora", "fma-committee"),
    ).toBe(false);
  });

  it("fails closed for ZK, missing heights, and out-of-window referenda", () => {
    const detail = normalizeGovernanceProposalDetail(detailFixture());
    const variants: GovernanceProposalDetail[] = [
      {
        ...detail,
        referendum: { ...detail.referendum!, mode: "Zk" },
      },
      { ...detail, currentHeight: null },
      { ...detail, currentHeight: "101" },
      {
        ...detail,
        referendum: { ...detail.referendum!, status: "Closed" },
      },
    ];
    for (const candidate of variants) {
      expect(isReferendumPlainVoteOpen(candidate)).toBe(false);
    }
  });

  it("requires a citizen ballot lock to cover the inclusive end height", () => {
    const detail = normalizeGovernanceProposalDetail(detailFixture());
    expect(plainBallotLockCoversReferendum(detail, "15")).toBe(true);
    expect(plainBallotLockCoversReferendum(detail, "14")).toBe(false);
    expect(plainBallotLockCoversReferendum(detail, "0")).toBe(false);
    expect(
      plainBallotLockCoversReferendum(
        { ...detail, currentHeight: null },
        "100",
      ),
    ).toBe(false);
  });
});

describe("validation-fee policy model", () => {
  it("rebases exact proposal windows with the documented review margin", () => {
    expect(
      rebaseGovernanceReferendumWindow({
        currentHeight: 100,
        minStagingBlocks: 600,
        windowSpan: 3_600,
      }),
    ).toEqual({ lower: "1000", upper: "4599" });
    expect(validationFeePolicyEffectiveHeight("4599")).toBe("129159");
    expect(validationFeePolicyEffectiveHeight("04")).toBeNull();
    expect(() =>
      rebaseGovernanceReferendumWindow({
        currentHeight: "18446744073709551615",
        minStagingBlocks: 600,
        windowSpan: 3_600,
      }),
    ).toThrow(/uint64 range/);
  });

  it("allows policy enactment only at the exact next committed height", () => {
    const base = normalizeGovernanceProposalDetail(detailFixture());
    if (base.kind.type !== "ValidationFeePolicy" || !base.referendum) {
      throw new Error("validation-fee policy fixture was not normalized");
    }
    const approved: GovernanceProposalDetail = {
      ...base,
      summary: { ...base.summary, status: "Approved" },
      referendum: {
        ...base.referendum,
        status: "Closed",
        hEnd: "100",
      },
      currentHeight: "3697",
      kind: {
        ...base.kind,
        policy: {
          ...base.kind.policy,
          effective_from_height: "124660",
        },
      },
    };

    expect(validationFeePolicyEnactmentTiming(approved)).toEqual({
      status: "not-yet",
      targetHeight: "3700",
      nextHeight: "3698",
      blocksRemaining: "2",
    });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        currentHeight: "3699",
      }),
    ).toEqual({
      status: "ready",
      targetHeight: "3700",
      nextHeight: "3700",
      blocksRemaining: "0",
    });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        currentHeight: "3700",
      }),
    ).toEqual({
      status: "missed",
      targetHeight: "3700",
      nextHeight: "3701",
      blocksRemaining: null,
    });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        kind: {
          ...base.kind,
          policy: {
            ...base.kind.policy,
            effective_from_height: "124659",
          },
        },
      }),
    ).toMatchObject({ status: "unavailable" });
  });

  it("normalizes only the exact native policy fields", () => {
    const normalized = normalizeValidationFeePolicy({
      schema_version: 1,
      chain_id: "sora",
      genesis_hash: "ef".repeat(32),
      policy_version: 1,
      previous_policy_hash: null,
      ds_asset_id: "xor#sora",
      ds_scale: 2,
      fee: "0.10",
      treasury_account_id: "sorau-treasury",
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: 8,
      expires_after_height: null,
      exemption_classes: [],
      treasury_payout_binding: null,
    });
    expect(normalized).toMatchObject({
      chain_id: "sora",
      genesis_hash: "ef".repeat(32),
      policy_version: "1",
      ds_asset_id: "xor#sora",
      ds_scale: 2,
      fee: "0.10",
      previous_policy_hash: null,
    });
    expect(normalized).not.toHaveProperty("governance_keyset_id");
    expect(normalized).not.toHaveProperty("signatures");
  });

  it("rejects legacy validation-fee aliases and unknown native fields", () => {
    const exact = {
      schema_version: 1,
      chain_id: "sora",
      genesis_hash: "ef".repeat(32),
      policy_version: 1,
      previous_policy_hash: null,
      ds_asset_id: "xor#sora",
      ds_scale: 2,
      fee: "0.10",
      treasury_account_id: "sorau-treasury",
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: 8,
      expires_after_height: null,
      exemption_classes: [],
      treasury_payout_binding: null,
    };
    for (const legacy of [
      { network_id: "sora" },
      { fee_asset_id: "xor#sora" },
      { fee_asset_scale: 2 },
      { fee_amount: "0.10" },
      { sbd_asset_id: "xor#sora" },
      { sbd_scale: 2 },
      { fee_minor_units: "0.10" },
    ]) {
      expect(() =>
        normalizeValidationFeePolicy({ ...exact, ...legacy }),
      ).toThrow(/must contain exactly/);
    }
    expect(
      normalizeValidationFeePolicy({ ...exact, policy_version: "1" })
        .policy_version,
    ).toBe("1");
    for (const invalid of ["01", "1version", " 1"]) {
      expect(() =>
        normalizeValidationFeePolicy({
          ...exact,
          policy_version: invalid,
        }),
      ).toThrow(/complete canonical positive decimal integer/);
    }
  });

  it("accepts canonical unsigned decimals and rejects ambiguous forms", () => {
    expect(isCanonicalUnsignedDecimal("1")).toBe(true);
    expect(isCanonicalUnsignedDecimal("0.25")).toBe(true);
    expect(isCanonicalUnsignedDecimal("0")).toBe(false);
    expect(isCanonicalUnsignedDecimal("0", { allowZero: true })).toBe(true);
    for (const value of ["01", ".5", "1.", "-1", "+1", "1e3", " 1"]) {
      expect(isCanonicalUnsignedDecimal(value)).toBe(false);
    }
  });

  it("validates successor continuity and policy invariants", () => {
    expect(
      validateValidationFeePolicy(policy(), REFERENDUM_WINDOW, ""),
    ).toEqual([]);
    const invalid: ValidationFeePolicyPayload = {
      ...policy(),
      schema_version: 2,
      chain_id: "",
      genesis_hash: "bad",
      policy_version: "02",
      previous_policy_hash: null,
      ds_asset_id: "",
      ds_scale: -1,
      fee: "0.11",
      treasury_account_id: "",
      effective_from_height: "0",
      expires_after_height: "0",
      exemption_classes: ["duplicate", "duplicate"],
    };
    expect(
      validateValidationFeePolicy(invalid, { lower: "", upper: "" }, ""),
    ).toEqual(
      expect.arrayContaining([
        "Unsupported schema version.",
        "Chain ID is required.",
        "Genesis hash must be non-zero lowercase 32-byte hex.",
        "Policy version must be a positive integer.",
        "A successor policy must bind the previous policy hash.",
        "Fee asset is required.",
        "Fee asset scale must be exactly 2.",
        "Enabled validation fee must be exactly 0.10 SBD.",
        "Treasury account is required.",
        "Referendum window start and end are required positive integers.",
        "Effective height must be a positive integer.",
        "Expiry height must be after the effective height.",
        "Only the exact TREASURY_PAYOUT exemption is allowed with a payout binding.",
      ]),
    );
  });

  it("anchors the first-release delay to the referendum window upper bound", () => {
    expect(validationFeeMinimumEffectiveHeight("100")).toBe("121060");
    expect(validationFeeMinimumEffectiveHeight("01")).toBeNull();
    expect(
      validationFeeMinimumEffectiveHeight("18446744073709551615"),
    ).toBeNull();

    expect(
      validateValidationFeePolicy(
        { ...policy(), effective_from_height: "121059" },
        REFERENDUM_WINDOW,
        "",
      ),
    ).toContain(
      "Effective height must be at least 120,960 blocks after the referendum window ends.",
    );
    expect(
      validateValidationFeePolicy(
        { ...policy(), effective_from_height: "121060" },
        REFERENDUM_WINDOW,
        "",
      ),
    ).toEqual([]);
  });

  it("requires an exact lifecycle proposal id iff a payout binding exists", () => {
    const payoutPolicy = {
      ...policy(),
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: { binding: true },
    };
    expect(
      validateValidationFeePolicy(payoutPolicy, REFERENDUM_WINDOW, ""),
    ).toContain(
      "A payout-enabled policy requires a non-zero lifecycle proposal ID.",
    );
    expect(
      validateValidationFeePolicy(
        payoutPolicy,
        REFERENDUM_WINDOW,
        "12".repeat(32),
      ),
    ).toEqual([]);
    expect(
      validateValidationFeePolicy(policy(), REFERENDUM_WINDOW, "12".repeat(32)),
    ).toContain(
      "A policy without a payout binding cannot select a lifecycle proposal.",
    );
  });
});

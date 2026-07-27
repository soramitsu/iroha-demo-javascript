import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_KIND_ADAPTERS,
  GOVERNANCE_PARLIAMENT_BODIES,
  GOVERNANCE_PIPELINE_STAGES,
  activeParliamentBody,
  assertPlainGovernanceProposalWrite,
  canonicalGovernanceProposalId,
  governanceCitizenVoteProjection,
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
  validationFeePolicyEnactmentTargetHeight,
  validationFeePolicyEnactmentTiming,
  validateValidationFeePolicy,
  type GovernanceProposalDetail,
  type ValidationFeePlainElectorateRulesPayload,
  type ValidationFeePolicyPayload,
} from "@/governance/model";

const RAW_PROPOSAL_ID = "ab".repeat(32);
const PROPOSAL_ID = `0x${RAW_PROPOSAL_ID}`;
const NATIVE_POLICY_HASH = "cd".repeat(32);
const ACCOUNT_ID = "sorau-demo-citizen";
const REFERENDUM_WINDOW = { lower: "80", upper: "100" };
const CBSI_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const policy = (): ValidationFeePolicyPayload => ({
  schema_version: 1,
  chain_id: "sora-mainnet",
  genesis_hash: "ef".repeat(32),
  policy_version: "2",
  previous_policy_hash: NATIVE_POLICY_HASH,
  ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
  ds_scale: 2,
  fee: "0.10",
  treasury_account_id: "sorau-treasury",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121062",
  expires_after_height: "242000",
  exemption_classes: [],
  treasury_payout_binding: null,
});

const nativePolicy = () => ({
  ...policy(),
  genesis_hash: policy().genesis_hash.toUpperCase(),
  previous_policy_hash: NATIVE_POLICY_HASH.toUpperCase(),
  fee: "0.1",
});

const payoutBinding = () => ({
  contract_address: "contract:validation-fee",
  code_hash: "44".repeat(32).toUpperCase(),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "sorau-treasury",
  sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
  xor_asset_id: "xor#sora",
  pool_vault_account_id: "sorau-pool-vault",
  batch_sbd: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `sorau-validator-${index}`,
    share: "0.25",
  })),
});

const plainElectorateRules = (): ValidationFeePlainElectorateRulesPayload => ({
  voting_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
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

const pipelineFixture = () => ({
  stages: GOVERNANCE_PIPELINE_STAGES.map((stage, index) => ({
    stage,
    started_at: String(70 + index),
    deadline: stage === "Rules" ? "90" : null,
    completed_at: stage === "Admit" ? "70" : null,
    failure: null,
  })),
});

const rosterMembers = (body: string, index: number) =>
  body === "rules-committee" ? [ACCOUNT_ID] : [`sorau-member-${index}`];

const rosterAlternates = (body: string, index: number) =>
  body === "rules-committee"
    ? ["sorau-alternate"]
    : [`sorau-alternate-${index}`];

const parliamentSnapshotFixture = () => ({
  selection_epoch: "1",
  beacon: "11".repeat(32).toUpperCase(),
  roster_root: "22".repeat(32).toUpperCase(),
  bodies: {
    selection_epoch: 1,
    rosters: Object.fromEntries(
      GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => [
        body,
        {
          body,
          epoch: 1,
          members: rosterMembers(body, index),
          alternates: rosterAlternates(body, index),
          verified: 7,
          candidate_count: 14,
          derived_by: "Vrf",
        },
      ]),
    ),
  },
});

const bodyProgressFixture = () =>
  GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => ({
    body,
    members: rosterMembers(body, index),
    alternates: rosterAlternates(body, index),
    required: "1",
    approve: body === "rules-committee" ? "1" : "0",
    reject: "0",
    abstain: "0",
    approval_quorum_met: body === "rules-committee",
    rejection_quorum_met: false,
    current_account_decision: null,
  }));

const proposalRecordFixture = () => ({
  proposal_id: RAW_PROPOSAL_ID,
  proposer: "sorau-proposer",
  proposal_kind: {
    kind: "ValidationFeePolicy",
    payload: {
      policy: nativePolicy(),
      payout_lifecycle_proposal_id: null,
      plain_electorate_rules: plainElectorateRules(),
    },
  },
  created_height: "70",
  status: { status: "PROPOSED", value: null },
  pipeline: pipelineFixture(),
  referendum: {
    window: { lower: "80", upper: "100" },
    mode: "Plain",
    opened: true,
    closed: false,
  },
  parliament_snapshot: parliamentSnapshotFixture(),
  finalization_evidence: null,
  enacted_at_height: null,
});

const detailFixture = () => ({
  version: 1,
  proposal: proposalRecordFixture(),
  current_height: "85",
  body_progress: bodyProgressFixture(),
  tally: {
    approve: "8",
    reject: "3",
    abstain: "1",
    turnout: "12",
    min_turnout: "1",
    approval_threshold_numerator: "1",
    approval_threshold_denominator: "2",
    approved: null,
  },
  locks: {
    locks: {
      [ACCOUNT_ID]: {
        owner: ACCOUNT_ID,
        amount: "10",
        slashed: "0",
        expiry_height: "130",
        direction: "Aye",
        duration_blocks: "50",
      },
    },
  },
});

describe("governance proposal model", () => {
  it("keeps lossy tally and lock SDK diagnostics out of the evidence path", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );
    const detailStart = preload.indexOf(
      "const fetchGovernanceProposalDetail = async",
    );
    const detailEnd = preload.indexOf(
      "const fetchGovernanceValidationFeePolicy = async",
      detailStart,
    );
    expect(detailStart).toBeGreaterThanOrEqual(0);
    expect(detailEnd).toBeGreaterThan(detailStart);
    const evidencePath = preload.slice(detailStart, detailEnd);
    expect(evidencePath).toContain("normalizeGovernanceProposalDetail");
    expect(evidencePath).not.toContain("getGovernanceTallyTyped");
    expect(evidencePath).not.toContain("getGovernanceLocksTyped");

    const store = readFileSync(
      resolve(process.cwd(), "src", "stores", "parliament.ts"),
      "utf8",
    );
    expect(store).toContain("getGovernanceProposalDetail");
    expect(store).not.toContain("getGovernanceTally");
    expect(store).not.toContain("getGovernanceLocks");
  });

  it("canonicalizes only exact 32-byte proposal identifiers", () => {
    expect(canonicalGovernanceProposalId("AB".repeat(32))).toBe(PROPOSAL_ID);
    expect(canonicalGovernanceProposalId(`0x${"AB".repeat(32)}`)).toBe(
      PROPOSAL_ID,
    );
    expect(canonicalGovernanceProposalId("ab")).toBeNull();
    expect(canonicalGovernanceProposalId("z".repeat(64))).toBeNull();
  });

  it("normalizes exact kind envelopes and keeps unknown kinds inspect-only", () => {
    expect(
      normalizeGovernanceProposalKind({
        kind: "DeployContract",
        payload: {
          contract_address: "contract",
          code_hash_hex: "31".repeat(32),
          abi_hash_hex: "32".repeat(32),
          abi_version: 1,
          manifest_provenance: null,
        },
      }),
    ).toMatchObject({
      type: "DeployContract",
      contractAddress: "contract",
      codeHash: "31".repeat(32),
      abiHash: "32".repeat(32),
      abiVersion: "1",
    });
    expect(
      normalizeGovernanceProposalKind({
        kind: "RuntimeUpgrade",
        payload: { manifest: { version: 4 } },
      }),
    ).toMatchObject({
      type: "RuntimeUpgrade",
      manifest: { version: 4 },
    });
    expect(
      normalizeGovernanceProposalKind({
        kind: "SccpRouteGovernance",
        payload: { action: { kind: "Activate" } },
      }),
    ).toMatchObject({
      type: "SccpRouteGovernance",
      action: { kind: "Activate" },
    });
    expect(
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePolicy",
        payload: {
          policy: nativePolicy(),
          payout_lifecycle_proposal_id: null,
          plain_electorate_rules: plainElectorateRules(),
        },
      }),
    ).toMatchObject({
      type: "ValidationFeePolicy",
      policy: nativePolicy(),
      payoutLifecycleProposalId: null,
      plainElectorateRules: plainElectorateRules(),
    });
    expect(
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: payoutBinding(),
          plain_electorate_rules: plainElectorateRules(),
        },
      }),
    ).toMatchObject({
      type: "ValidationFeePayoutLifecycle",
      payoutBinding: payoutBinding(),
      plainElectorateRules: plainElectorateRules(),
    });
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePolicy",
        payload: {
          policy: nativePolicy(),
          payout_lifecycle_proposal_id: null,
          plain_electorate_rules: {
            ...plainElectorateRules(),
            min_turnout: "2",
          },
        },
      }),
    ).toThrow(/exact first-release PLAIN electorate contract/u);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePayoutLifecycle",
        payload: { payout_binding: payoutBinding() },
      }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: {
            ...payoutBinding(),
            max_xor_out: "101",
          },
          plain_electorate_rules: plainElectorateRules(),
        },
      }),
    ).toThrow(/exact first-release entrypoint and payout bounds/);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: {
            ...payoutBinding(),
            sbd_asset_id: "sbd#cbsi",
          },
          plain_electorate_rules: plainElectorateRules(),
        },
      }),
    ).toThrow(/exact CBSI SBD asset definition ID/);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: {
            ...payoutBinding(),
            recipients: [
              payoutBinding().recipients[0],
              ...payoutBinding().recipients.slice(0, 3),
            ],
          },
          plain_electorate_rules: plainElectorateRules(),
        },
      }),
    ).toThrow(/must be distinct/);
    expect(
      normalizeGovernanceProposalKind({
        kind: "FutureProposal",
        payload: { value: 1 },
      }),
    ).toMatchObject({
      type: "Unknown",
      variant: "FutureProposal",
    });
    expect(() =>
      normalizeGovernanceProposalKind({
        variant: "ValidationFeePolicy",
        payload: {
          policy: nativePolicy(),
          payout_lifecycle_proposal_id: null,
        },
      }),
    ).toThrow(/contain exactly kind, payload/);
    expect(
      normalizeGovernanceProposalKind({
        kind: "VALIDATION_FEE_POLICY",
        payload: {
          policy: nativePolicy(),
          payout_lifecycle_proposal_id: null,
        },
      }),
    ).toMatchObject({
      type: "Unknown",
      variant: "VALIDATION_FEE_POLICY",
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
      turnout: "12",
      minTurnout: "1",
      approvalThresholdNumerator: "1",
      approvalThresholdDenominator: "2",
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
      required: "1",
      currentAccountDecision: null,
    });
  });

  it("normalizes the exact unpaginated V1 list envelope", () => {
    const result = normalizeGovernanceProposalList({
      version: 1,
      proposals: [proposalRecordFixture()],
    });
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      proposalId: PROPOSAL_ID,
      kindType: "ValidationFeePolicy",
      currentStage: "Rules",
    });
  });

  it("requires unique proposal IDs in canonical creation-height and ID order", () => {
    const lowerId = {
      ...proposalRecordFixture(),
      proposal_id: "aa".repeat(32),
    };
    const higherId = proposalRecordFixture();
    expect(
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [lowerId, higherId],
      }).items.map(({ proposalId }) => proposalId),
    ).toEqual([`0x${"aa".repeat(32)}`, PROPOSAL_ID]);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [higherId, lowerId],
      }),
    ).toThrow(/canonically ordered by created_height then proposal_id/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [higherId, higherId],
      }),
    ).toThrow(/duplicate ID/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          { ...lowerId, created_height: "71" },
          { ...higherId, created_height: "70" },
        ],
      }),
    ).toThrow(/canonically ordered/);
  });

  it("fully validates every typed list record and refuses non-PLAIN variants", () => {
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            referendum: {
              ...proposalRecordFixture().referendum,
              mode: "Zk",
            },
          },
        ],
      }),
    ).toThrow(/must be Plain in the first-release contract/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            proposal_kind: {
              kind: "DeployContract",
              payload: {
                contract_address: "contract",
                code_hash_hex: "31".repeat(32),
                abi_hash_hex: "32".repeat(32),
                abi_version: 1,
                manifest_provenance: null,
              },
            },
          },
        ],
      }),
    ).toThrow(/exact typed validation-fee proposal/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            status: { status: "APPROVED", value: null },
          },
        ],
      }),
    ).toThrow(/genuine finalized PLAIN evidence/);
  });

  it("rejects incomplete, fractional, and non-canonical governance integers", () => {
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "85blocks",
      }),
    ).toThrow(/complete canonical decimal integer string/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "085",
      }),
    ).toThrow(/complete canonical decimal integer string/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: 85.5,
      }),
    ).toThrow(/complete canonical decimal integer string/);

    const u64Overflow = (1n << 64n).toString();
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          { ...proposalRecordFixture(), created_height: u64Overflow },
        ],
      }),
    ).toThrow(/created_height exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: u64Overflow,
      }),
    ).toThrow(/current_height exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            referendum: {
              ...proposalRecordFixture().referendum,
              window: { lower: "80", upper: u64Overflow },
            },
          },
        ],
      }),
    ).toThrow(/referendum\.window\.upper exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            pipeline: {
              stages: pipelineFixture().stages.map((stage, index) =>
                index === 0 ? { ...stage, started_at: u64Overflow } : stage,
              ),
            },
          },
        ],
      }),
    ).toThrow(/started_at exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            parliament_snapshot: {
              ...parliamentSnapshotFixture(),
              selection_epoch: u64Overflow,
            },
          },
        ],
      }),
    ).toThrow(/selection_epoch exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        locks: {
          locks: {
            [ACCOUNT_ID]: {
              ...detailFixture().locks.locks[ACCOUNT_ID],
              expiry_height: u64Overflow,
            },
          },
        },
      }),
    ).toThrow(/expiry_height exceeds u64/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        body_progress: bodyProgressFixture().map((progress, index) =>
          index === 0 ? { ...progress, approve: "4294967296" } : progress,
        ),
      }),
    ).toThrow(/approve exceeds u32/);
    const snapshot = parliamentSnapshotFixture();
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            parliament_snapshot: {
              ...snapshot,
              bodies: {
                ...snapshot.bodies,
                rosters: {
                  ...snapshot.bodies.rosters,
                  "rules-committee": {
                    ...snapshot.bodies.rosters["rules-committee"],
                    candidate_count: 4_294_967_296,
                  },
                },
              },
            },
          },
        ],
      }),
    ).toThrow(/candidate_count exceeds u32/);
  });

  it("rejects proposal aliases, omitted fields, extra fields, and synthetic pipelines", () => {
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        items: [proposalRecordFixture()],
      }),
    ).toThrow(/contain exactly proposals, version/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [proposalRecordFixture()],
        next_cursor: "legacy",
      }),
    ).toThrow(/contain exactly proposals, version/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            created_height: 70,
          },
        ],
      }),
    ).toThrow(/decimal integer string/);
    expect(() =>
      normalizeGovernanceProposalList({
        version: 1,
        proposals: [
          {
            ...proposalRecordFixture(),
            pipeline: {
              stages: pipelineFixture().stages.slice(0, 2),
            },
          },
        ],
      }),
    ).toThrow(/exact seven V1 stages/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        currentHeight: "85",
      }),
    ).toThrow(/contain exactly/);
    const partialTally = { ...detailFixture().tally };
    delete (partialTally as Partial<typeof partialTally>)
      .approval_threshold_denominator;
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: partialTally,
      }),
    ).toThrow(/tally must contain exactly/);
  });

  it("bounds stored PLAIN tallies while comparing thresholds without truncation", () => {
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: { ...detailFixture().tally, turnout: "13" },
      }),
    ).toThrow(/turnout differs from its checked aggregation/);

    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: { ...detailFixture().tally, min_turnout: "2" },
      }),
    ).toThrow(/exact first-release PLAIN rules/);

    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: {
          ...detailFixture().tally,
          approve: (1n << 128n).toString(),
        },
      }),
    ).toThrow(/approve exceeds u128/);

    const maximumU128 = ((1n << 128n) - 1n).toString();
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: {
          ...detailFixture().tally,
          approve: maximumU128,
          reject: "0",
          abstain: "0",
          turnout: maximumU128,
        },
      }),
    ).not.toThrow();

    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: {
          ...detailFixture().tally,
          approve: maximumU128,
          reject: "1",
          abstain: "0",
          turnout: maximumU128,
        },
      }),
    ).toThrow(/aggregation overflows u128/);

    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "101",
        proposal: {
          ...proposalRecordFixture(),
          status: { status: "APPROVED", value: null },
          referendum: {
            ...proposalRecordFixture().referendum,
            closed: true,
          },
          finalization_evidence: {
            proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
            referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
            finalized_at_height: "100",
            mode: "Plain",
            approve: maximumU128,
            reject: "0",
            abstain: "0",
            min_turnout: "1",
            approval_threshold_numerator: "1",
            approval_threshold_denominator: "2",
            approved: true,
          },
        },
        tally: {
          ...detailFixture().tally,
          approve: maximumU128,
          reject: "0",
          abstain: "0",
          turnout: maximumU128,
          approved: true,
        },
      }),
    ).not.toThrow();
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

    const approvedWithoutEvidence = {
      ...detail,
      summary: { ...detail.summary, status: "Approved" as const },
      kind: {
        type: "ValidationFeePayoutLifecycle" as const,
        raw: {
          kind: "ValidationFeePayoutLifecycle",
          payload: {
            payout_binding: payoutBinding(),
            plain_electorate_rules: plainElectorateRules(),
          },
        },
        payoutBinding: payoutBinding(),
        plainElectorateRules: plainElectorateRules(),
      },
    };
    expect(isEnactActionable(approvedWithoutEvidence)).toBe(false);
    const approved = {
      ...approvedWithoutEvidence,
      referendum: {
        ...approvedWithoutEvidence.referendum!,
        status: "Closed" as const,
      },
      finalizationEvidence: {
        proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
        referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
        finalized_at_height: "100",
        mode: "Plain" as const,
        approve: "8",
        reject: "3",
        abstain: "1",
        min_turnout: "1",
        approval_threshold_numerator: "1",
        approval_threshold_denominator: "2",
        approved: true,
      },
    };
    expect(isEnactActionable(approved)).toBe(true);
    for (const finalizedAtHeight of ["80", "100"]) {
      expect(
        isEnactActionable({
          ...approved,
          finalizationEvidence: {
            ...approved.finalizationEvidence,
            finalized_at_height: finalizedAtHeight,
          },
        }),
      ).toBe(true);
    }
    for (const finalizedAtHeight of ["79", "101"]) {
      expect(
        isEnactActionable({
          ...approved,
          finalizationEvidence: {
            ...approved.finalizationEvidence,
            finalized_at_height: finalizedAtHeight,
          },
        }),
      ).toBe(false);
    }
    expect(
      isEnactActionable({
        ...approved,
        finalizationEvidence: {
          ...approved.finalizationEvidence,
          finalized_at_height: "101junk",
        },
      }),
    ).toBe(false);
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
    const snapshot = parliamentSnapshotFixture();
    const rosters = Object.fromEntries(
      GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => [
        body,
        {
          ...snapshot.bodies.rosters[body],
          members: Array.from(
            { length: index + 2 },
            (_, memberIndex) => `member-${index}-${memberIndex}@sora`,
          ),
          alternates: [`alternate-${index}@sora`],
          candidate_count: index + 3,
          verified: 0,
        },
      ]),
    );
    const detail = normalizeGovernanceProposalDetail({
      ...detailFixture(),
      proposal: {
        ...detailFixture().proposal,
        parliament_snapshot: {
          ...snapshot,
          bodies: {
            ...snapshot.bodies,
            rosters,
          },
        },
      },
      body_progress: GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => ({
        body,
        members: Array.from(
          { length: index + 2 },
          (_, memberIndex) => `member-${index}-${memberIndex}@sora`,
        ),
        alternates: [`alternate-${index}@sora`],
        approve: String(index + 1),
        reject: "0",
        abstain: "0",
        required: String(index + 2),
        approval_quorum_met: index + 1 >= index + 2,
        rejection_quorum_met: false,
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

  it("rejects contradictory roster counts, identities, derivation, and quorum flags", () => {
    const snapshot = parliamentSnapshotFixture();
    const withRulesRoster = (overrides: Record<string, unknown>) => ({
      ...detailFixture(),
      proposal: {
        ...proposalRecordFixture(),
        parliament_snapshot: {
          ...snapshot,
          bodies: {
            ...snapshot.bodies,
            rosters: {
              ...snapshot.bodies.rosters,
              "rules-committee": {
                ...snapshot.bodies.rosters["rules-committee"],
                ...overrides,
              },
            },
          },
        },
      },
    });
    expect(() =>
      normalizeGovernanceProposalDetail(
        withRulesRoster({ members: [ACCOUNT_ID, ACCOUNT_ID] }),
      ),
    ).toThrow(/unique and disjoint/);
    expect(() =>
      normalizeGovernanceProposalDetail(
        withRulesRoster({ alternates: [ACCOUNT_ID] }),
      ),
    ).toThrow(/unique and disjoint/);
    expect(() =>
      normalizeGovernanceProposalDetail(
        withRulesRoster({ candidate_count: 1 }),
      ),
    ).toThrow(/bounded by candidate_count/);
    expect(() =>
      normalizeGovernanceProposalDetail(
        withRulesRoster({ derived_by: "Fallback", verified: 1 }),
      ),
    ).toThrow(/fallback derivation must have zero verified proofs/);

    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        body_progress: bodyProgressFixture().map((progress, index) =>
          index === 0 ? { ...progress, approval_quorum_met: false } : progress,
        ),
      }),
    ).toThrow(/quorum flags differ from exact counts/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        body_progress: bodyProgressFixture().map((progress, index) =>
          index === 0 ? { ...progress, approve: "2" } : progress,
        ),
      }),
    ).toThrow(/vote counts exceed the seated roster/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        body_progress: bodyProgressFixture().map((progress, index) =>
          index === 1
            ? { ...progress, current_account_decision: "APPROVE" }
            : progress,
        ),
      }),
    ).toThrow(/has no matching recorded vote/);
  });

  it("requires tally approval exactly when finalized evidence exists", () => {
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        tally: { ...detailFixture().tally, approved: true },
      }),
    ).toThrow(/present exactly when finalization evidence exists/);

    const finalized = {
      ...proposalRecordFixture(),
      status: { status: "APPROVED", value: null },
      referendum: { ...proposalRecordFixture().referendum, closed: true },
      finalization_evidence: {
        proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
        referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
        finalized_at_height: "100",
        mode: "Plain",
        approve: "8",
        reject: "3",
        abstain: "1",
        min_turnout: "1",
        approval_threshold_numerator: "1",
        approval_threshold_denominator: "2",
        approved: true,
      },
    };
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "101",
        proposal: finalized,
        tally: { ...detailFixture().tally, approved: null },
      }),
    ).toThrow(/present exactly when finalization evidence exists/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...detailFixture(),
        current_height: "99",
        proposal: finalized,
        tally: { ...detailFixture().tally, approved: true },
      }),
    ).toThrow(/finalization height exceeds current_height/);
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

  it("projects explicit public citizen vote states from the exact lock and window", () => {
    const detail = normalizeGovernanceProposalDetail(detailFixture());
    expect(governanceCitizenVoteProjection(detail, ACCOUNT_ID)).toMatchObject({
      state: "recorded",
      lock: {
        owner: ACCOUNT_ID,
        direction: "Aye",
        expiryHeight: "130",
      },
    });
    expect(
      governanceCitizenVoteProjection(detail, "sorau-unrecorded"),
    ).toMatchObject({
      state: "open",
      blocksUntilClose: "15",
    });
    expect(
      governanceCitizenVoteProjection(
        {
          ...detail,
          currentHeight: "75",
          referendum: {
            ...detail.referendum!,
            status: "Proposed",
          },
        },
        "sorau-unrecorded",
      ),
    ).toMatchObject({
      state: "awaiting-window",
      blocksUntilOpen: "5",
    });
    expect(
      governanceCitizenVoteProjection(
        {
          ...detail,
          referendum: {
            ...detail.referendum!,
            mode: "Zk",
          },
        },
        ACCOUNT_ID,
      ),
    ).toMatchObject({
      state: "unavailable",
      lock: null,
    });
  });

  it("accepts direct PLAIN enactment and rejects stale scheduler fields", () => {
    const evidence = {
      proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
      referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
      finalized_at_height: "100",
      mode: "Plain",
      approve: "8",
      reject: "3",
      abstain: "1",
      min_turnout: "1",
      approval_threshold_numerator: "1",
      approval_threshold_denominator: "2",
      approved: true,
    };
    const lifecycleProposal = {
      ...proposalRecordFixture(),
      proposal_kind: {
        kind: "ValidationFeePayoutLifecycle",
        payload: {
          payout_binding: payoutBinding(),
          plain_electorate_rules: plainElectorateRules(),
        },
      },
      status: { status: "ENACTED", value: null },
      referendum: {
        ...proposalRecordFixture().referendum,
        closed: true,
      },
      finalization_evidence: evidence,
      enacted_at_height: "1900",
    };
    const exact = {
      ...detailFixture(),
      current_height: "1900",
      proposal: lifecycleProposal,
      tally: { ...detailFixture().tally, approved: true },
    };

    expect(normalizeGovernanceProposalDetail(exact)).toMatchObject({
      kind: { type: "ValidationFeePayoutLifecycle" },
      summary: { status: "Enacted" },
      enactedAtHeight: "1900",
    });
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...exact,
        proposal: {
          ...lifecycleProposal,
          enactment_schedule: { target_height: "1900" },
        },
      }),
    ).toThrow(/must contain exactly/);
    expect(
      normalizeGovernanceProposalDetail({
        ...exact,
        proposal: { ...lifecycleProposal, enacted_at_height: "1899" },
      }),
    ).toMatchObject({ enactedAtHeight: "1899" });
    expect(
      normalizeGovernanceProposalDetail({
        ...exact,
        proposal: {
          ...lifecycleProposal,
          finalization_evidence: {
            ...evidence,
            finalized_at_height: "87",
          },
          enacted_at_height: "88",
        },
      }),
    ).toMatchObject({ enactedAtHeight: "88" });
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...exact,
        proposal: { ...lifecycleProposal, enacted_at_height: "100" },
      }),
    ).toThrow(/strictly later than finalized_at_height/);
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...exact,
        current_height: "1899",
      }),
    ).toThrow(/enactment height exceeds current_height/);
    for (const status of ["ENACTED", "SUPERSEDED"] as const) {
      expect(() =>
        normalizeGovernanceProposalDetail({
          ...exact,
          proposal: {
            ...lifecycleProposal,
            status: { status, value: null },
            finalization_evidence: {
              ...evidence,
              approve: "3",
              reject: "8",
              approved: false,
            },
            enacted_at_height: status === "ENACTED" ? "1900" : null,
          },
          tally: {
            ...detailFixture().tally,
            approve: "3",
            reject: "8",
            approved: false,
          },
        }),
      ).toThrow(/genuine finalized PLAIN evidence/);
    }
    expect(
      normalizeGovernanceProposalDetail({
        ...exact,
        proposal: {
          ...lifecycleProposal,
          status: { status: "SUPERSEDED", value: null },
          enacted_at_height: null,
        },
      }),
    ).toMatchObject({
      summary: { status: "Superseded" },
      enactedAtHeight: null,
    });
  });

  it("requires an enacted policy to retain the exact 120,960-block delay", () => {
    const finalized = {
      ...detailFixture(),
      current_height: "102",
      proposal: {
        ...proposalRecordFixture(),
        proposal_kind: {
          kind: "ValidationFeePolicy",
          payload: {
            policy: {
              ...nativePolicy(),
              effective_from_height: "121062",
            },
            payout_lifecycle_proposal_id: null,
            plain_electorate_rules: plainElectorateRules(),
          },
        },
        status: { status: "ENACTED", value: null },
        referendum: {
          ...proposalRecordFixture().referendum,
          closed: true,
        },
        finalization_evidence: {
          proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
          referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
          finalized_at_height: "100",
          mode: "Plain",
          approve: "8",
          reject: "3",
          abstain: "1",
          min_turnout: "1",
          approval_threshold_numerator: "1",
          approval_threshold_denominator: "2",
          approved: true,
        },
        enacted_at_height: "102",
      },
      tally: { ...detailFixture().tally, approved: true },
    };
    expect(() => normalizeGovernanceProposalDetail(finalized)).not.toThrow();
    expect(() =>
      normalizeGovernanceProposalDetail({
        ...finalized,
        proposal: {
          ...finalized.proposal,
          proposal_kind: {
            ...finalized.proposal.proposal_kind,
            payload: {
              ...finalized.proposal.proposal_kind.payload,
              policy: {
                ...finalized.proposal.proposal_kind.payload.policy,
                effective_from_height: "121063",
              },
            },
          },
        },
      }),
    ).toThrow(/exactly 120,960 blocks after enactment/);
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
      currentHeight: "101",
      finalizationEvidence: {
        proposal_id: RAW_PROPOSAL_ID.toUpperCase(),
        referendum_id: RAW_PROPOSAL_ID.toUpperCase(),
        finalized_at_height: "87",
        mode: "Plain",
        approve: "8",
        reject: "3",
        abstain: "1",
        min_turnout: "1",
        approval_threshold_numerator: "1",
        approval_threshold_denominator: "2",
        approved: true,
      },
      kind: {
        ...base.kind,
        policy: {
          ...base.kind.policy,
          effective_from_height: "121062",
        },
      },
    };

    expect(validationFeePolicyEnactmentTiming(approved)).toEqual({
      status: "ready",
      targetHeight: "102",
      nextHeight: "102",
      blocksRemaining: "0",
    });
    for (const finalizedAtHeight of ["80", "100"]) {
      expect(
        validationFeePolicyEnactmentTiming({
          ...approved,
          finalizationEvidence: {
            ...approved.finalizationEvidence!,
            finalized_at_height: finalizedAtHeight,
          },
        }),
      ).toMatchObject({ status: "ready", targetHeight: "102" });
    }
    for (const finalizedAtHeight of ["79", "101"]) {
      expect(
        validationFeePolicyEnactmentTiming({
          ...approved,
          finalizationEvidence: {
            ...approved.finalizationEvidence!,
            finalized_at_height: finalizedAtHeight,
          },
        }),
      ).toMatchObject({ status: "unavailable" });
    }
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        kind: {
          ...base.kind,
          policy: {
            ...base.kind.policy,
            effective_from_height: "121061",
          },
        },
      }),
    ).toEqual({
      status: "missed",
      targetHeight: "101",
      nextHeight: "102",
      blocksRemaining: null,
    });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        kind: {
          ...base.kind,
          policy: {
            ...base.kind.policy,
            effective_from_height: "121063",
          },
        },
      }),
    ).toEqual({
      status: "not-yet",
      targetHeight: "103",
      nextHeight: "102",
      blocksRemaining: "1",
    });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        kind: {
          ...base.kind,
          policy: {
            ...base.kind.policy,
            effective_from_height: "121047",
          },
        },
      }),
    ).toMatchObject({ status: "unavailable" });
    expect(
      validationFeePolicyEnactmentTiming({
        ...approved,
        currentHeight: "102",
      }),
    ).toEqual({
      status: "missed",
      targetHeight: "102",
      nextHeight: "103",
      blocksRemaining: null,
    });
    expect(validationFeePolicyEnactmentTargetHeight("121062")).toBe("102");
  });

  it("normalizes only the exact native policy fields", () => {
    const normalized = normalizeValidationFeePolicy({
      schema_version: 1,
      chain_id: "sora",
      genesis_hash: "ef".repeat(32).toUpperCase(),
      policy_version: "1",
      previous_policy_hash: null,
      ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      ds_scale: 2,
      fee: "0.1",
      treasury_account_id: "sorau-treasury",
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: "8",
      expires_after_height: null,
      exemption_classes: [],
      treasury_payout_binding: null,
    });
    expect(normalized).toMatchObject({
      chain_id: "sora",
      genesis_hash: "ef".repeat(32).toUpperCase(),
      policy_version: "1",
      ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      ds_scale: 2,
      fee: "0.1",
      previous_policy_hash: null,
    });
    expect(normalized).not.toHaveProperty("governance_keyset_id");
    expect(normalized).not.toHaveProperty("signatures");
    expect(() =>
      normalizeValidationFeePolicy({
        ...normalized,
        ds_asset_id: "sbd#cbsi",
      }),
    ).toThrow(/exact CBSI SBD asset definition ID/);
  });

  it("fails closed on drifted first-release policy invariants", () => {
    const exact = nativePolicy();
    expect(normalizeValidationFeePolicy(exact)).toMatchObject({
      ds_scale: 2,
      fee: "0.1",
      exemption_classes: [],
      treasury_payout_binding: null,
    });

    for (const drifted of [
      { ...exact, genesis_hash: "0".repeat(64) },
      {
        ...exact,
        policy_version: "1",
        previous_policy_hash: exact.previous_policy_hash,
      },
      { ...exact, previous_policy_hash: null },
      { ...exact, previous_policy_hash: "0".repeat(64) },
      { ...exact, ds_scale: 3 },
      { ...exact, fee: "0.10" },
      { ...exact, fee: "0.11" },
      {
        ...exact,
        expires_after_height: exact.effective_from_height,
      },
      { ...exact, exemption_classes: ["TREASURY_PAYOUT"] },
      {
        ...exact,
        treasury_payout_binding: payoutBinding(),
      },
    ]) {
      expect(() => normalizeValidationFeePolicy(drifted)).toThrow();
    }

    expect(
      normalizeValidationFeePolicy({
        ...exact,
        exemption_classes: ["TREASURY_PAYOUT"],
        treasury_payout_binding: payoutBinding(),
      }),
    ).toMatchObject({
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: payoutBinding(),
    });
  });

  it("rejects drifted policy invariants through the proposal detail boundary", () => {
    const detail = detailFixture();
    const proposalKind = detail.proposal.proposal_kind;
    const proposalPayload = proposalKind.payload;
    const detailWithPolicy = (
      policyOverride: Record<string, unknown>,
      payoutLifecycleProposalId: string | null = null,
    ) => ({
      ...detail,
      proposal: {
        ...detail.proposal,
        proposal_kind: {
          ...proposalKind,
          payload: {
            ...proposalPayload,
            policy: { ...nativePolicy(), ...policyOverride },
            payout_lifecycle_proposal_id: payoutLifecycleProposalId,
          },
        },
      },
    });

    for (const drifted of [
      { fee: "0.11" },
      { ds_scale: 3 },
      { exemption_classes: ["TREASURY_PAYOUT"] },
      { genesis_hash: "0".repeat(64) },
      { expires_after_height: nativePolicy().effective_from_height },
    ]) {
      expect(() =>
        normalizeGovernanceProposalDetail(detailWithPolicy(drifted)),
      ).toThrow();
    }

    expect(() =>
      normalizeGovernanceProposalDetail(
        detailWithPolicy({}, "33".repeat(32).toUpperCase()),
      ),
    ).toThrow(/select a lifecycle proposal exactly when/u);
    expect(() =>
      normalizeGovernanceProposalDetail(
        detailWithPolicy(
          {
            exemption_classes: ["TREASURY_PAYOUT"],
            treasury_payout_binding: payoutBinding(),
          },
          null,
        ),
      ),
    ).toThrow(/select a lifecycle proposal exactly when/u);
    expect(() =>
      normalizeGovernanceProposalDetail(
        detailWithPolicy(
          {
            exemption_classes: ["TREASURY_PAYOUT"],
            treasury_payout_binding: payoutBinding(),
          },
          "0".repeat(64),
        ),
      ),
    ).toThrow(/lifecycle ID must be non-zero/u);
    expect(
      normalizeGovernanceProposalDetail(
        detailWithPolicy(
          {
            exemption_classes: ["TREASURY_PAYOUT"],
            treasury_payout_binding: payoutBinding(),
          },
          "33".repeat(32).toUpperCase(),
        ),
      ).kind.type,
    ).toBe("ValidationFeePolicy");
  });

  it("rejects legacy validation-fee aliases and unknown native fields", () => {
    const exact = {
      schema_version: 1,
      chain_id: "sora",
      genesis_hash: "ef".repeat(32).toUpperCase(),
      policy_version: "1",
      previous_policy_hash: null,
      ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      ds_scale: 2,
      fee: "0.1",
      treasury_account_id: "sorau-treasury",
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: "8",
      expires_after_height: null,
      exemption_classes: [],
      treasury_payout_binding: null,
    };
    for (const legacy of [
      { network_id: "sora" },
      { fee_asset_id: "xor#sora" },
      { fee_asset_scale: 2 },
      { fee_amount: "0.10" },
      { sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID },
      { sbd_scale: 2 },
      { fee_minor_units: "0.10" },
    ]) {
      expect(() =>
        normalizeValidationFeePolicy({ ...exact, ...legacy }),
      ).toThrow(/must contain exactly/);
    }
    expect(normalizeValidationFeePolicy(exact).policy_version).toBe("1");
    for (const invalid of ["01", "1version", " 1"]) {
      expect(() =>
        normalizeValidationFeePolicy({
          ...exact,
          policy_version: invalid,
        }),
      ).toThrow(/canonical.*integer/);
    }
    expect(() =>
      normalizeValidationFeePolicy({ ...exact, policy_version: 1 }),
    ).toThrow(/integer string/);
    const u64Overflow = (1n << 64n).toString();
    expect(() =>
      normalizeValidationFeePolicy({
        ...exact,
        policy_version: u64Overflow,
      }),
    ).toThrow(/policy version exceeds u64/);
    expect(() =>
      normalizeValidationFeePolicy({
        ...exact,
        effective_from_height: u64Overflow,
      }),
    ).toThrow(/effective height exceeds u64/);
    expect(() =>
      normalizeValidationFeePolicy({
        ...exact,
        expires_after_height: u64Overflow,
      }),
    ).toThrow(/expiry height exceeds u64/);
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

  it("accepts explicit post-window enactment targets with the exact activation delay", () => {
    expect(validationFeePolicyEnactmentTargetHeight("121061")).toBe("101");
    expect(validationFeePolicyEnactmentTargetHeight("121062")).toBe("102");
    expect(validationFeePolicyEnactmentTargetHeight("120960")).toBeNull();
    expect(validationFeePolicyEnactmentTargetHeight("01")).toBeNull();
    expect(
      validationFeePolicyEnactmentTargetHeight("18446744073709551616"),
    ).toBeNull();
    expect(
      validateValidationFeePolicy(
        { ...policy(), effective_from_height: "121060" },
        REFERENDUM_WINDOW,
        "",
      ),
    ).toContain(
      "Effective height must encode enactment strictly after the inclusive referendum window and activation exactly 120,960 blocks later.",
    );
    for (const effectiveFromHeight of [
      "121061",
      "121062",
      "121063",
      "123060",
    ]) {
      expect(
        validateValidationFeePolicy(
          { ...policy(), effective_from_height: effectiveFromHeight },
          REFERENDUM_WINDOW,
          "",
        ),
      ).toEqual([]);
    }
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

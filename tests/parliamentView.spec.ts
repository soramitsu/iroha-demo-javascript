import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import ParliamentView from "@/views/ParliamentView.vue";
import {
  GOVERNANCE_PARLIAMENT_BODIES,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalList,
} from "@/governance/model";
import { useEndpointStore } from "@/stores/endpoint";
import { useParliamentStore } from "@/stores/parliament";
import { useSessionStore } from "@/stores/session";
import type { EndpointInspection } from "@/types/endpointInspection";

const HASH = `0x${"ab".repeat(32)}`;
const OTHER_HASH = `0x${"cd".repeat(32)}`;
const ACCOUNT = "alice@wonderland";
const CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const NETWORK_PREFIX = 369;
const GENESIS_HASH =
  "884b61c61f56dcddceee7aa3dc1deb89fb8552576d02b01a1b7af9ae7fd5ff7a";
const XOR_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const APP_SBD_ASSET_ID = "sbd#cbsi";
const SBD_ASSET_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
const payoutBinding = () => ({
  contract_address: "contract:validation-fee",
  code_hash: "44".repeat(32),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: ACCOUNT,
  sbd_asset_id: SBD_ASSET_ID,
  xor_asset_id: XOR_ASSET_ID,
  pool_vault_account_id: "pool@wonderland",
  batch_sbd: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `validator-${index}@wonderland`,
    share: "0.25",
  })),
});
const composerPayoutBinding = () => ({
  ...payoutBinding(),
  sbd_asset_id: APP_SBD_ASSET_ID,
});
const plainElectorateRules = () => ({
  voting_asset_id: XOR_ASSET_ID,
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

const validationFeePolicyKind = (effectiveFromHeight: string) => ({
  kind: "ValidationFeePolicy",
  payload: {
    policy: {
      schema_version: 1,
      chain_id: CHAIN_ID,
      genesis_hash: GENESIS_HASH.toUpperCase(),
      policy_version: "1",
      previous_policy_hash: null,
      ds_asset_id: SBD_ASSET_ID,
      ds_scale: 2,
      fee: "0.1",
      treasury_account_id: ACCOUNT,
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: effectiveFromHeight,
      expires_after_height: null,
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: payoutBinding(),
    },
    payout_lifecycle_proposal_id: OTHER_HASH.slice(2).toUpperCase(),
    plain_electorate_rules: plainElectorateRules(),
  },
});

const listGovernanceProposalsMock = vi.fn();
const getGovernanceProposalDetailMock = vi.fn();
const getGovernanceCapabilitiesMock = vi.fn();
const getGovernanceCitizenCountMock = vi.fn();
const getGovernanceCitizenStatusMock = vi.fn();
const getGovernanceCouncilCurrentMock = vi.fn();
const getGovernanceUnlockStatsMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const prepareGovernanceCitizenRegistrationMock = vi.fn();
const getGovernanceCurrentValidationFeePolicyMock = vi.fn();
const getGovernancePlainReferendumContractMock = vi.fn();
const prepareGovernanceProposalMock = vi.fn();
const prepareGovernancePlainBallotMock = vi.fn();
const prepareGovernanceParliamentBallotMock = vi.fn();
const prepareGovernanceEnactMock = vi.fn();
const confirmGovernanceActionMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  listGovernanceProposals: (input: unknown) =>
    listGovernanceProposalsMock(input),
  getGovernanceProposalDetail: (input: unknown) =>
    getGovernanceProposalDetailMock(input),
  getGovernanceCapabilities: (toriiUrl: string) =>
    getGovernanceCapabilitiesMock(toriiUrl),
  getGovernanceCitizenCount: (toriiUrl: string) =>
    getGovernanceCitizenCountMock(toriiUrl),
  getGovernanceCitizenStatus: (input: unknown) =>
    getGovernanceCitizenStatusMock(input),
  getGovernanceCouncilCurrent: (toriiUrl: string) =>
    getGovernanceCouncilCurrentMock(toriiUrl),
  getGovernanceUnlockStats: (toriiUrl: string) =>
    getGovernanceUnlockStatsMock(toriiUrl),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  prepareGovernanceCitizenRegistration: (input: unknown) =>
    prepareGovernanceCitizenRegistrationMock(input),
  getGovernanceCurrentValidationFeePolicy: (input: unknown) =>
    getGovernanceCurrentValidationFeePolicyMock(input),
  getGovernancePlainReferendumContract: (input: unknown) =>
    getGovernancePlainReferendumContractMock(input),
  prepareGovernanceProposal: (input: unknown) =>
    prepareGovernanceProposalMock(input),
  prepareGovernancePlainBallot: (input: unknown) =>
    prepareGovernancePlainBallotMock(input),
  prepareGovernanceParliamentBallot: (input: unknown) =>
    prepareGovernanceParliamentBallotMock(input),
  prepareGovernanceEnact: (input: unknown) => prepareGovernanceEnactMock(input),
  confirmGovernanceAction: (input: unknown) =>
    confirmGovernanceActionMock(input),
}));

const proposalPipeline = () => ({
  stages: [
    {
      stage: "Admit",
      started_at: "90",
      deadline: null,
      completed_at: "90",
      failure: null,
    },
    {
      stage: "Rules",
      started_at: "91",
      deadline: null,
      completed_at: "91",
      failure: null,
    },
    ...["Agenda", "Study", "Review", "Jury", "Enact"].map((stage, index) => ({
      stage,
      started_at: String(92 + index),
      deadline: null,
      completed_at: null,
      failure: null,
    })),
  ],
});

const proposalRosters = () =>
  Object.fromEntries(
    GOVERNANCE_PARLIAMENT_BODIES.map((body, index) => [
      body,
      {
        body,
        epoch: 1,
        members: body === "agenda-council" ? [ACCOUNT] : [`member-${index}`],
        alternates: [],
        verified: 7,
        candidate_count: 14,
        derived_by: "Vrf",
      },
    ]),
  );

const proposalSnapshot = () => ({
  selection_epoch: "1",
  beacon: "31".repeat(32),
  roster_root: "32".repeat(32),
  bodies: {
    selection_epoch: 1,
    rosters: proposalRosters(),
  },
});

const proposalStatus = (status: "Proposed" | "Approved" | "Enacted") => ({
  status: status.toUpperCase(),
  value: null,
});

const proposalRecord = (input: {
  proposalId: string;
  proposer?: string;
  mode?: "Plain" | "Zk";
  status?: "Proposed" | "Approved" | "Enacted";
  referendumStatus?: "Proposed" | "Open" | "Closed";
  finalizationEvidence?: Record<string, unknown> | null;
  kind?: Record<string, unknown>;
  hStart?: string;
  hEnd?: string;
}) => {
  const rawProposalId = input.proposalId.replace(/^0x/u, "");
  const mode = input.mode ?? "Plain";
  const referendumStatus = input.referendumStatus ?? "Open";
  const referendumEnd = input.hEnd ?? "3689";
  const proposalKind =
    input.kind ??
    ({
      kind: "ValidationFeePayoutLifecycle",
      payload: {
        payout_binding: payoutBinding(),
        plain_electorate_rules: plainElectorateRules(),
      },
    } as Record<string, unknown>);
  const evidenceRequested =
    input.finalizationEvidence !== undefined ||
    input.status === "Approved" ||
    input.status === "Enacted";
  const approved =
    input.finalizationEvidence?.approved === true ||
    (input.finalizationEvidence === undefined &&
      (input.status === "Approved" || input.status === "Enacted"));
  const finalizationEvidence = evidenceRequested
    ? input.finalizationEvidence === null
      ? null
      : {
          proposal_id: rawProposalId.toUpperCase(),
          referendum_id: rawProposalId.toUpperCase(),
          finalized_at_height: referendumEnd,
          mode,
          approve: approved ? "7" : "2",
          reject: approved ? "2" : "7",
          abstain: "1",
          min_turnout: "1",
          approval_threshold_numerator: "1",
          approval_threshold_denominator: "2",
          approved,
        }
    : null;
  return {
    proposal_id: rawProposalId,
    proposer: input.proposer ?? ACCOUNT,
    proposal_kind: proposalKind,
    created_height: "90",
    status: proposalStatus(input.status ?? "Proposed"),
    pipeline: proposalPipeline(),
    referendum: {
      window: {
        lower: input.hStart ?? "90",
        upper: referendumEnd,
      },
      mode,
      opened: referendumStatus !== "Proposed",
      closed: referendumStatus === "Closed",
    },
    parliament_snapshot: proposalSnapshot(),
    finalization_evidence: finalizationEvidence,
    enacted_at_height:
      input.status === "Enacted"
        ? (
            BigInt(referendumEnd) +
            (proposalKind.kind === "ValidationFeePolicy" ? 47n : 13n)
          ).toString()
        : null,
  };
};

const proposalList = () =>
  normalizeGovernanceProposalList({
    version: 1,
    proposals: [
      proposalRecord({ proposalId: HASH }),
      proposalRecord({
        proposalId: OTHER_HASH,
        proposer: "bob@wonderland",
      }),
    ],
  });

const proposalDetail = (options?: {
  proposalId?: string;
  mode?: "Plain" | "Zk";
  status?: "Proposed" | "Approved" | "Enacted";
  referendumStatus?: "Proposed" | "Open" | "Closed";
  finalizationEvidence?: Record<string, unknown> | null;
  kind?: Record<string, unknown>;
  currentHeight?: string;
  hStart?: string;
  hEnd?: string;
}) => {
  const proposalId = options?.proposalId ?? HASH;
  const mode = options?.mode ?? "Plain";
  const record = proposalRecord({
    proposalId,
    mode,
    status: options?.status,
    referendumStatus: options?.referendumStatus,
    finalizationEvidence: options?.finalizationEvidence,
    kind: options?.kind,
    hStart: options?.hStart,
    hEnd: options?.hEnd,
  });
  const tallyEvidence = record.finalization_evidence;
  const approve =
    tallyEvidence && typeof tallyEvidence.approve === "string"
      ? tallyEvidence.approve
      : "7";
  const reject =
    tallyEvidence && typeof tallyEvidence.reject === "string"
      ? tallyEvidence.reject
      : "2";
  const approved =
    tallyEvidence && typeof tallyEvidence.approved === "boolean"
      ? tallyEvidence.approved
      : null;
  const rosters = proposalRosters();
  return normalizeGovernanceProposalDetail(
    {
      version: 1,
      proposal: record,
      current_height: options?.currentHeight ?? "100",
      tally: {
        approve,
        reject,
        abstain: "1",
        turnout: "10",
        min_turnout: "1",
        approval_threshold_numerator: "1",
        approval_threshold_denominator: "2",
        approved,
      },
      locks: { locks: {} },
      body_progress: GOVERNANCE_PARLIAMENT_BODIES.map((body) => {
        const roster = rosters[body];
        return {
          body,
          members: roster.members,
          alternates: roster.alternates,
          approve: "0",
          reject: "0",
          abstain: "0",
          required: "1",
          approval_quorum_met: false,
          rejection_quorum_met: false,
          current_account_decision: null,
        };
      }),
    },
    proposalId,
  );
};

const preparedReview = () => ({
  reviewId: "review-1",
  operation: "plain-ballot" as const,
  title: "Submit citizen ballot",
  proposalId: HASH,
  referendumId: HASH.slice(2),
  decodedInstruction: {
    CastPlainBallot: {
      referendum_id: HASH.slice(2),
      owner: ACCOUNT,
      amount: "150",
    },
  },
  fee: {
    payer: "authority" as const,
    components: [
      {
        kind: "nexus",
        assetDefinitionId: "xor#wonderland",
        maxAmount: "0.01",
      },
    ],
    nextBlockHeight: "101",
  },
  expiresAtMs: Date.now() + 60_000,
});

const preparedCitizenReview = () => ({
  ...preparedReview(),
  operation: "register-citizen" as const,
  title: "Register bonded citizen",
  proposalId: null,
  referendumId: null,
  decodedInstruction: {
    RegisterCitizen: {
      owner: ACCOUNT,
      amount: "10000",
    },
  },
});

const governanceCapabilities = () => ({
  schema: "iroha.governance.capabilities.v1" as const,
  version: 1 as const,
  chainId: CHAIN_ID,
  genesisHash: GENESIS_HASH,
  currentHeight: 100,
  networkPrefix: NETWORK_PREFIX,
  abiVersion: 1,
  dataModelVersion: 3,
  approvalMode: "PARLIAMENT_SORTITION_JIT" as const,
  plainVotingEnabled: true as const,
  autoFinalizePlain: true as const,
  autoFinalizePlainScope: "GENERIC_NON_VALIDATION_FEE_ONLY" as const,
  validationFeePlainRequiresExplicitFinalization: true as const,
  validationFeePlainElectorateRules: {
    votingAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw" as const,
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
  },
  citizenshipAssetId: XOR_ASSET_ID,
  citizenshipBondAmount: "10000",
  citizenshipEscrowAccount: ACCOUNT,
  votingAssetId: XOR_ASSET_ID,
  minBondAmount: "150",
  bondEscrowAccount: ACCOUNT,
  convictionStepBlocks: 100,
  maxConviction: 6,
  minEnactmentDelay: 600,
  windowSpan: 3_600,
  minTurnout: "1",
  approvalThresholdNumerator: 1,
  approvalThresholdDenominator: 2,
  parliamentQuorumBps: 6_667,
  targetBodySizes: {
    rules_committee: 7,
    agenda_council: 9,
    interest_panel: 11,
    review_panel: 13,
    policy_jury: 25,
    oversight_committee: 7,
    fma_committee: 5,
  },
  supportedProposalKinds: [
    "VALIDATION_FEE_PAYOUT_LIFECYCLE",
    "VALIDATION_FEE_POLICY",
  ] as const,
  supportedRoutes: [
    "/v1/gov/capabilities",
    "/v1/gov/citizens",
    "/v1/gov/citizens/{account_id}",
    "/v1/gov/citizens/draft",
    "/v1/validation-fee/proposals",
    "/v1/validation-fee/proposals/{proposal_id}",
    "/v1/validation-fee/proposals/{proposal_id}/enactment-proof",
    "/v1/validation-fee/proposals/draft",
    "/v1/validation-fee/proposals/{proposal_id}/plain-electorate/draft",
    "/v1/validation-fee/proposals/{proposal_id}/plain-ballot/draft",
    "/v1/validation-fee/proposals/{proposal_id}/finalization/draft",
    "/v1/validation-fee/proposals/{proposal_id}/payout-lifecycle-enactment/draft",
    "/v1/gov/parliament/ballots",
    "/v1/gov/ballots/plain",
  ],
});

const plainReferendumContract = (options?: {
  accountId?: string;
  proposalId?: string;
  referendumId?: string;
  hStart?: string;
  hEnd?: string;
}) => ({
  contract: {
    schema: "sora.parliament.plain-referendum.v2" as const,
    chainId: CHAIN_ID,
    genesisHash: GENESIS_HASH,
    inputsSha256: "12".repeat(32),
    proposalId: (options?.proposalId ?? HASH).replace(/^0x/u, ""),
    referendumId:
      options?.referendumId ??
      (options?.proposalId ?? HASH).replace(/^0x/u, ""),
    hStart: options?.hStart ?? "90",
    hEnd: options?.hEnd ?? "3689",
    mode: "Plain" as const,
    postParliamentRegistrationGate: {
      schema: "taira.governance-post-parliament-registration-gate.v1" as const,
      chainId: CHAIN_ID,
      genesisHash: GENESIS_HASH,
      inputsSha256: "12".repeat(32),
      proposalId: (options?.proposalId ?? HASH).replace(/^0x/u, ""),
      referendumId:
        options?.referendumId ??
        (options?.proposalId ?? HASH).replace(/^0x/u, ""),
      hStart: options?.hStart ?? "90",
      hEnd: options?.hEnd ?? "3689",
      mode: "Plain" as const,
      operatorAccountId: ACCOUNT,
      eligibleCitizenRosterSha256: "13".repeat(32),
      gateHeight: "88",
      gateObservationSequence: "6",
      networkCheckpointSha256: "17".repeat(32),
      parliamentSnapshotSha256: "18".repeat(32),
      approvedBodyProgressSha256: "19".repeat(32),
    },
    eligibleCitizenRosterSha256: "13".repeat(32),
    eligibleCitizenCount: "1",
    eligibleCitizens: [
      {
        accountId: options?.accountId ?? ACCOUNT,
        amount: "10000" as const,
        bondedHeight: "1",
      },
    ],
    snapshotFinalizedHeight: "89",
    snapshotObservationSequence: "7",
    networkCheckpointSha256: "14".repeat(32),
    eligibleCitizenSnapshotSha256: "15".repeat(32),
    plainElectorate: {
      rules: governanceCapabilities().validationFeePlainElectorateRules,
      parliamentApprovalGateHeight: "88",
      sealedAtHeight: "89",
      rosterRoot: "20".repeat(32),
      electorateSealHash: "21".repeat(32),
      members: [
        {
          accountId: options?.accountId ?? ACCOUNT,
          amount: "10000" as const,
          bondedHeight: "1",
        },
      ],
    },
    ballot: {
      draftRoute: `/v1/validation-fee/proposals/${(options?.proposalId ?? HASH).replace(/^0x/u, "")}/plain-ballot/draft`,
      requestVersion: 1 as const,
      amount: "150" as const,
      durationBlocks: "3600" as const,
      directions: ["Aye", "Nay", "Abstain"] as ["Aye", "Nay", "Abstain"],
      termsDerivedByCore: true as const,
      oneEffectiveBallotPerAccount: true as const,
    },
  },
  contractFingerprint: "16".repeat(32),
  artifactSha256: "22".repeat(32),
  source: {
    descriptorUrl:
      "https://cbsi-core.soramitsu.io/governance/plain-referendum/current.json",
    artifactUrl:
      "https://cbsi-core.soramitsu.io/governance/plain-referendum/artifacts/22.json",
  },
});

const validationFeePolicyView = () => {
  const effective = {
    schema_version: 1,
    chain_id: CHAIN_ID,
    genesis_hash: GENESIS_HASH,
    policy_version: "1",
    previous_policy_hash: null,
    policy_hash: "22".repeat(32),
    ds_asset_id: SBD_ASSET_ID,
    ds_scale: 2,
    fee: "0.10",
    treasury_account_id: ACCOUNT,
    charging_mode: {
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
      value: null,
    },
    effective_from_height: "100",
    expires_after_height: null,
    exemption_classes: ["TREASURY_PAYOUT"],
    treasury_payout_binding: payoutBinding(),
    parliament_authorization: {},
    payout_lifecycle: null,
  };
  return {
    observedHeight: "200",
    effective,
    latestEnacted: effective,
    scheduled: [],
    registryHead: {
      policyVersion: "1",
      policyHash: "22".repeat(32),
    },
    verifiedProof: {
      schema: "cbsi.validation-fee-ledger-projection.v1" as const,
      authorizationModel: "SORA_PARLIAMENT_V1" as const,
      registrySnapshotHash: "33".repeat(32),
      finalizedBlockHash: "44".repeat(32),
      finalizedContextId: "55".repeat(32),
      trustedCheckpointHeight: "100",
      trustedCheckpointContextId: "66".repeat(32),
    },
  };
};

let wrapper: VueWrapper | null = null;
let router: Router;

const mountView = async (path = "/governance") => {
  document.body.innerHTML = '<div id="route-header-actions"></div>';
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  session.$patch({
    connection: {
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      assetDefinitionId: "xor#wonderland",
      networkPrefix: NETWORK_PREFIX,
    },
    accounts: [
      {
        displayName: "Alice",
        domain: "wonderland",
        accountId: ACCOUNT,
        publicKeyHex: "ed0120public",
        signingAlgorithm: "ed25519",
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: ACCOUNT,
  });
  useEndpointStore().$patch({
    state: "ready",
    error: "",
    inspection: {
      schema: "iroha.wallet.endpoint-inspection.v1",
      toriiUrl: session.connection.toriiUrl,
      expected: {
        chainId: session.connection.chainId,
        networkPrefix: session.connection.networkPrefix,
      },
      observed: {
        chainId: session.connection.chainId,
        networkPrefix: session.connection.networkPrefix,
      },
      identityStatus: "matched",
      accessMode: "read-write",
      checkedAtMs: 1,
      evidence: [],
      features: {
        governanceWrites: {
          supported: true,
          source: "openapi",
          requiredOperations: ["/v1/gov/citizens/draft"],
          missingOperations: [],
        },
      } as unknown as EndpointInspection["features"],
      diagnostic: {
        code: "endpoint_identity_matched",
        message: "Endpoint identity matches the configured network.",
      },
    },
  });
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/governance", component: ParliamentView }],
  });
  await router.push(path);
  await router.isReady();
  wrapper = mount(ParliamentView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  });
  await flushPromises();
  return wrapper;
};

describe("ParliamentView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    getGovernanceCapabilitiesMock.mockResolvedValue(governanceCapabilities());
    listGovernanceProposalsMock.mockResolvedValue(proposalList());
    getGovernanceProposalDetailMock.mockImplementation(({ proposalId }) =>
      Promise.resolve(
        proposalDetail({
          proposalId,
        }),
      ),
    );
    getGovernanceCitizenStatusMock.mockResolvedValue({
      state: "citizen",
      accountId: ACCOUNT,
      amount: "10000",
      bondedHeight: "1",
      seatsInEpoch: "0",
      lastEpochSeen: "1",
      cooldownUntil: null,
    });
    getGovernanceCitizenCountMock.mockResolvedValue({
      total: 21,
      endpointAvailable: true,
    });
    getGovernanceCouncilCurrentMock.mockResolvedValue({
      epoch: 7,
      members: [{ account_id: ACCOUNT }],
      alternates: [],
      candidate_count: 8,
      verified: 1,
      derived_by: "Vrf",
    });
    getGovernanceUnlockStatsMock.mockResolvedValue({
      height_current: 100,
      expired_locks_now: 2,
      referenda_with_expired: 1,
      last_sweep_height: 99,
    });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [{ asset_id: XOR_ASSET_ID, quantity: "12500" }],
      total: 1,
    });
    prepareGovernanceCitizenRegistrationMock.mockResolvedValue(
      preparedCitizenReview(),
    );
    getGovernanceCurrentValidationFeePolicyMock.mockRejectedValue(
      new Error(
        "Validation-fee policy state is unavailable: local consensus-proof verifier missing.",
      ),
    );
    getGovernancePlainReferendumContractMock.mockResolvedValue(
      plainReferendumContract(),
    );
    prepareGovernancePlainBallotMock.mockResolvedValue(preparedReview());
    confirmGovernanceActionMock.mockResolvedValue({
      hash: "ef".repeat(32),
      finality: {
        status: "finalized",
        transactionHash: "ef".repeat(32),
        blockHeight: 17,
        blockHash: "ab".repeat(32),
        finalizedBlockHeight: 19,
      },
      operation: "plain-ballot",
      proposalId: HASH,
      referendumId: HASH.slice(2),
      status: "finalized",
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("loads the live queue and follows a proposal deep link", async () => {
    const view = await mountView(`/governance?proposal=${HASH}`);

    expect(listGovernanceProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "http://localhost:8080",
        status: "Proposed",
      }),
    );
    expect(getGovernanceProposalDetailMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      proposalId: HASH,
      accountId: ACCOUNT,
    });
    expect(getGovernanceCurrentValidationFeePolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      networkPrefix: NETWORK_PREFIX,
    });
    expect(view.get(".proposal-detail").text()).toContain(
      "Validation fee payout lifecycle",
    );
    expect(view.get(".proposal-detail").text()).toContain(HASH);
    expect(view.get(".governance-context").text()).toContain("Policy proof");
    expect(view.get(".governance-context").text()).toContain("Unavailable");
    expect(view.get(".governance-context").text()).toContain(
      "Strict contract verified",
    );
    const contextMetrics = Object.fromEntries(
      view
        .get(".governance-context")
        .findAll("dl > div")
        .map((row) => [row.get("dt").text(), row.get("dd").text()]),
    );
    expect(contextMetrics.Citizens).toBe("21");
    expect(contextMetrics["Council members"]).toBe("1");
    expect(contextMetrics["Expired Locks"]).toBe("2");
    expect(router.currentRoute.value.query.proposal).toBe(HASH);
  });

  it("keeps exact-ID lookup usable when the typed catalog is unavailable", async () => {
    listGovernanceProposalsMock.mockRejectedValueOnce(
      new Error(
        "This Torii endpoint does not expose the typed validation-fee proposal catalog. Load a proposal with its exact 32-byte ID instead.",
      ),
    );
    const view = await mountView();

    expect(view.get(".catalog-message.error").text()).toContain(
      "exact 32-byte ID",
    );
    await view.get(".proposal-lookup input").setValue(HASH.slice(2));
    await view.get(".proposal-lookup").trigger("submit");
    await flushPromises();

    expect(getGovernanceProposalDetailMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      proposalId: HASH,
      accountId: ACCOUNT,
    });
    expect(view.get(".proposal-detail").text()).toContain(HASH);
  });

  it("reviews the exact capability bond before vault signing", async () => {
    getGovernanceCitizenStatusMock
      .mockResolvedValueOnce({
        state: "not-citizen",
        accountId: ACCOUNT,
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      })
      .mockResolvedValue({
        state: "citizen",
        accountId: ACCOUNT,
        amount: "10000",
        bondedHeight: "101",
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      });
    const view = await mountView();
    const bondButton = view.get('[data-testid="governance-bond-citizen"]');

    expect(bondButton.text()).toContain("Bond 10000 XOR");
    expect(bondButton.attributes("disabled")).toBeUndefined();

    await bondButton.trigger("click");
    await flushPromises();

    expect(prepareGovernanceCitizenRegistrationMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      amount: "10000",
    });
    expect(document.body.textContent).toContain("RegisterCitizen");
    expect(document.body.textContent).toContain("Sign and commit");
  });

  it("keeps citizenship bonding disabled below the exact policy balance", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [{ asset_id: XOR_ASSET_ID, quantity: "9999" }],
      total: 1,
    });

    const view = await mountView();
    const bondButton = view.get('[data-testid="governance-bond-citizen"]');
    expect(bondButton.attributes("disabled")).toBeDefined();
    expect(view.get(".identity").text()).toContain(
      "Not enough XOR for the bond.",
    );
    expect(prepareGovernanceCitizenRegistrationMock).not.toHaveBeenCalled();
  });

  it("shows an unavailable bond balance when the live asset read fails", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    fetchAccountAssetsMock.mockRejectedValueOnce(
      new Error("bond balance unavailable"),
    );

    const view = await mountView();
    const identity = view.get(".identity");
    const balanceRow = identity
      .findAll("dl > div")
      .find((row) => row.get("dt").text() === "XOR Balance");

    expect(balanceRow?.get("dd").text()).toBe("Unavailable");
    expect(identity.text()).toContain("bond balance unavailable");
    expect(
      view
        .get('[data-testid="governance-bond-citizen"]')
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("loads every asset page before deciding the exact bond balance", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: Array.from({ length: 200 }, (_, index) => ({
          asset_id: `unrelated-${index}`,
          quantity: "1",
        })),
        total: 201,
      })
      .mockResolvedValueOnce({
        items: [{ asset_id: XOR_ASSET_ID, quantity: "12500" }],
        total: 201,
      });

    const view = await mountView();

    expect(fetchAccountAssetsMock).toHaveBeenNthCalledWith(2, {
      toriiUrl: "http://localhost:8080",
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      assetDefinitionId: XOR_ASSET_ID,
      limit: 200,
      offset: 200,
    });
    expect(
      view
        .get('[data-testid="governance-bond-citizen"]')
        .attributes("disabled"),
    ).toBeUndefined();
  });

  it("requires a current bonded citizen before opening the proposal composer", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });

    await mountView();
    const governance = useParliamentStore();
    const proposalButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="new-governance-proposal"]',
    );

    expect(proposalButton?.disabled).toBe(true);
    expect(proposalButton?.title).toContain("current bonded Taira citizen");
    governance.openComposer();
    expect(governance.composerOpen).toBe(false);
    expect(governance.actionError).toContain("current bonded Taira citizen");
  });

  it("refreshes bonded citizenship before preparing a proposal", async () => {
    await mountView();
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    const governance = useParliamentStore();

    await governance.prepareProposal();

    expect(prepareGovernanceProposalMock).not.toHaveBeenCalled();
    expect(governance.actionError).toContain("current bonded Taira citizen");
  });

  it("fails closed when strict governance capabilities are unavailable", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    getGovernanceCapabilitiesMock.mockRejectedValueOnce(
      new Error("governance capabilities contain unknown fields"),
    );

    const view = await mountView();
    const bondButton = view.get('[data-testid="governance-bond-citizen"]');
    expect(bondButton.attributes("disabled")).toBeDefined();
    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
    });
    expect(fetchAccountAssetsMock).not.toHaveBeenCalled();
    expect(view.get(".identity").text()).toContain("Not a citizen yet");
    expect(view.get(".identity").text()).toContain(
      "governance capabilities contain unknown fields",
    );
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="new-governance-proposal"]',
      )?.disabled,
    ).toBe(true);
    expect(prepareGovernanceCitizenRegistrationMock).not.toHaveBeenCalled();
  });

  it("starts the citizenship read before capabilities finish loading", async () => {
    let resolveCapabilities: (value: unknown) => void = () => {};
    getGovernanceCapabilitiesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapabilities = resolve;
      }),
    );

    const view = await mountView();

    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
    });
    expect(getGovernanceCitizenCountMock).toHaveBeenCalledWith(
      "http://localhost:8080",
    );
    expect(getGovernanceCouncilCurrentMock).toHaveBeenCalledWith(
      "http://localhost:8080",
    );
    expect(getGovernanceUnlockStatsMock).toHaveBeenCalledWith(
      "http://localhost:8080",
    );
    const governance = useParliamentStore();
    expect(governance.governanceCitizenCount?.total).toBe(21);
    expect(governance.currentCouncil?.members).toEqual([
      { account_id: ACCOUNT },
    ]);
    expect(governance.unlockStats?.expired_locks_now).toBe(2);
    expect(view.get(".identity").text()).toContain("Eligible");
    expect(fetchAccountAssetsMock).not.toHaveBeenCalled();

    resolveCapabilities(governanceCapabilities());
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      assetDefinitionId: XOR_ASSET_ID,
      limit: 200,
      offset: 0,
    });
  });

  it.each([
    {
      label: "citizen count",
      reject: () =>
        getGovernanceCitizenCountMock.mockRejectedValueOnce(
          new Error("citizen count unavailable"),
        ),
      error: (governance: ReturnType<typeof useParliamentStore>) =>
        governance.governanceCitizenCountError,
    },
    {
      label: "current council",
      reject: () =>
        getGovernanceCouncilCurrentMock.mockRejectedValueOnce(
          new Error("current council unavailable"),
        ),
      error: (governance: ReturnType<typeof useParliamentStore>) =>
        governance.currentCouncilError,
    },
    {
      label: "unlock stats",
      reject: () =>
        getGovernanceUnlockStatsMock.mockRejectedValueOnce(
          new Error("unlock stats unavailable"),
        ),
      error: (governance: ReturnType<typeof useParliamentStore>) =>
        governance.unlockStatsError,
    },
  ])(
    "keeps $label read failures isolated from capabilities and writes",
    async ({ reject, error }) => {
      reject();
      await mountView();

      const governance = useParliamentStore();
      expect(error(governance)).toContain("unavailable");
      expect(governance.canWrite).toBe(true);
      expect(getGovernanceCitizenCountMock).toHaveBeenCalled();
      expect(getGovernanceCouncilCurrentMock).toHaveBeenCalled();
      expect(getGovernanceUnlockStatsMock).toHaveBeenCalled();
    },
  );

  it("ignores stale citizen-count, council, and unlock-stat responses independently", async () => {
    await mountView();
    const governance = useParliamentStore();
    let resolveStaleCitizenCount: (value: unknown) => void = () => {};
    let resolveStaleCouncil: (value: unknown) => void = () => {};
    let resolveStaleUnlockStats: (value: unknown) => void = () => {};
    getGovernanceCitizenCountMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStaleCitizenCount = resolve;
      }),
    );
    getGovernanceCouncilCurrentMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStaleCouncil = resolve;
      }),
    );
    getGovernanceUnlockStatsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStaleUnlockStats = resolve;
      }),
    );
    const staleReads = Promise.all([
      governance.loadGovernanceCitizenCount(),
      governance.loadCurrentCouncil(),
      governance.loadUnlockStats(),
    ]);
    await flushPromises();
    expect(governance.governanceCitizenCountLoading).toBe(true);
    expect(governance.currentCouncilLoading).toBe(true);
    expect(governance.unlockStatsLoading).toBe(true);

    getGovernanceCitizenCountMock.mockResolvedValueOnce({
      total: 34,
      endpointAvailable: true,
    });
    getGovernanceCouncilCurrentMock.mockResolvedValueOnce({
      epoch: 8,
      members: [{ account_id: "fresh-council@sora" }],
      alternates: [],
      candidate_count: 9,
      verified: 1,
      derived_by: "Vrf",
    });
    getGovernanceUnlockStatsMock.mockResolvedValueOnce({
      height_current: 200,
      expired_locks_now: 5,
      referenda_with_expired: 2,
      last_sweep_height: 199,
    });
    await Promise.all([
      governance.loadGovernanceCitizenCount(),
      governance.loadCurrentCouncil(),
      governance.loadUnlockStats(),
    ]);

    resolveStaleCitizenCount({
      total: 1,
      endpointAvailable: true,
    });
    resolveStaleCouncil({
      epoch: 1,
      members: [{ account_id: "stale-council@sora" }],
      alternates: [],
      candidate_count: 1,
      verified: 1,
      derived_by: "Vrf",
    });
    resolveStaleUnlockStats({
      height_current: 10,
      expired_locks_now: 1,
      referenda_with_expired: 1,
      last_sweep_height: 9,
    });
    await staleReads;

    expect(governance.governanceCitizenCount?.total).toBe(34);
    expect(governance.currentCouncil?.epoch).toBe(8);
    expect(governance.unlockStats?.expired_locks_now).toBe(5);
    expect(governance.governanceCitizenCountLoading).toBe(false);
    expect(governance.currentCouncilLoading).toBe(false);
    expect(governance.unlockStatsLoading).toBe(false);
  });

  it("does not retain a validation-fee proof from a previous endpoint context", async () => {
    let resolveStalePolicy: (value: unknown) => void = () => {};
    const freshPolicy = {
      ...validationFeePolicyView(),
      observedHeight: "300",
    };
    getGovernanceCurrentValidationFeePolicyMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStalePolicy = resolve;
        }),
      )
      .mockResolvedValueOnce(freshPolicy);

    await mountView();
    const governance = useParliamentStore();
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "http://localhost:9090",
      },
    });
    await vi.waitFor(() => {
      expect(getGovernanceCurrentValidationFeePolicyMock).toHaveBeenCalledTimes(
        2,
      );
    });
    await flushPromises();

    expect(governance.validationFeePolicy?.observedHeight).toBe("300");
    expect(
      getGovernanceCurrentValidationFeePolicyMock,
    ).toHaveBeenLastCalledWith({
      toriiUrl: "http://localhost:9090",
      chainId: CHAIN_ID,
      networkPrefix: NETWORK_PREFIX,
    });

    resolveStalePolicy({
      ...validationFeePolicyView(),
      observedHeight: "101",
    });
    await flushPromises();

    expect(governance.validationFeePolicy?.observedHeight).toBe("300");
  });

  it("keeps stale capability success and completion out of a switched endpoint/account context", async () => {
    let resolveStaleCapabilities: (value: unknown) => void = () => {};
    let resolveCurrentCapabilities: (value: unknown) => void = () => {};
    getGovernanceCapabilitiesMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStaleCapabilities = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCurrentCapabilities = resolve;
        }),
      );

    await mountView();
    const governance = useParliamentStore();
    expect(governance.capabilitiesLoading).toBe(true);
    expect(governance.capabilities).toBeNull();

    const session = useSessionStore();
    const switchedToriiUrl = "http://localhost:9090";
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: switchedToriiUrl,
      },
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ed0120bob",
          signingAlgorithm: "ed25519",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    expect(governance.capabilities).toBeNull();
    expect(governance.capabilitiesLoading).toBe(false);
    expect(governance.canWrite).toBe(false);

    const endpoint = useEndpointStore();
    if (!endpoint.inspection) throw new Error("endpoint inspection missing");
    endpoint.$patch({
      inspection: {
        ...endpoint.inspection,
        toriiUrl: switchedToriiUrl,
      },
    });
    await flushPromises();

    expect(getGovernanceCapabilitiesMock).toHaveBeenLastCalledWith(
      switchedToriiUrl,
    );
    expect(governance.capabilities).toBeNull();
    expect(governance.capabilitiesLoading).toBe(true);
    expect(governance.canWrite).toBe(false);

    resolveStaleCapabilities({
      ...governanceCapabilities(),
      minBondAmount: "999",
    });
    await flushPromises();

    expect(governance.capabilities).toBeNull();
    expect(governance.capabilitiesError).toBe("");
    expect(governance.capabilitiesLoading).toBe(true);
    expect(governance.ballotAmount).toBe("150");
    expect(governance.canWrite).toBe(false);

    resolveCurrentCapabilities({
      ...governanceCapabilities(),
      minBondAmount: "250",
    });
    await flushPromises();

    expect(governance.capabilities?.minBondAmount).toBe("250");
    expect(governance.capabilitiesError).toBe("");
    expect(governance.capabilitiesLoading).toBe(false);
    expect(governance.ballotAmount).toBe("150");
    expect(governance.canWrite).toBe(true);
  });

  it("does not let a stale capability failure erase a newer valid context", async () => {
    let rejectStaleCapabilities: (reason?: unknown) => void = () => {};
    getGovernanceCapabilitiesMock
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectStaleCapabilities = reject;
        }),
      )
      .mockResolvedValueOnce({
        ...governanceCapabilities(),
        minBondAmount: "300",
      });

    await mountView();
    const governance = useParliamentStore();
    const session = useSessionStore();
    const switchedToriiUrl = "http://localhost:9091";
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: switchedToriiUrl,
      },
    });
    const endpoint = useEndpointStore();
    if (!endpoint.inspection) throw new Error("endpoint inspection missing");
    endpoint.$patch({
      inspection: {
        ...endpoint.inspection,
        toriiUrl: switchedToriiUrl,
      },
    });
    await flushPromises();

    expect(governance.capabilities?.minBondAmount).toBe("300");
    expect(governance.capabilitiesError).toBe("");
    expect(governance.capabilitiesLoading).toBe(false);
    expect(governance.canWrite).toBe(true);

    rejectStaleCapabilities(new Error("stale endpoint failed"));
    await flushPromises();

    expect(governance.capabilities?.minBondAmount).toBe("300");
    expect(governance.capabilitiesError).toBe("");
    expect(governance.capabilitiesLoading).toBe(false);
    expect(governance.canWrite).toBe(true);
  });

  it("surfaces endpoint identity denial separately from capabilities", async () => {
    const view = await mountView();
    const endpoint = useEndpointStore();
    const inspection = endpoint.inspection;
    if (!inspection) throw new Error("endpoint inspection missing");
    endpoint.$patch({
      inspection: {
        ...inspection,
        accessMode: "read-only",
        identityStatus: "conflicting",
        diagnostic: {
          code: "endpoint_identity_conflict",
          message:
            "Conflicting endpoint identity evidence. Writes are blocked.",
        },
      },
    });
    await flushPromises();

    const governance = useParliamentStore();
    expect(governance.capabilities).not.toBeNull();
    expect(governance.capabilitiesError).toBe("");
    expect(governance.canWrite).toBe(false);
    expect(governance.bondGate.reason).toContain(
      "Conflicting endpoint identity evidence",
    );
    expect(governance.plainVoteGate.reason).toContain(
      "Conflicting endpoint identity evidence",
    );
    expect(governance.parliamentBallotGate.reason).toContain(
      "Conflicting endpoint identity evidence",
    );
    expect(governance.enactGate.reason).toContain(
      "proposal-bound operator workflow",
    );
    governance.openComposer();
    expect(governance.composerOpen).toBe(false);
    expect(governance.actionError).toContain(
      "Conflicting endpoint identity evidence",
    );
    await governance.prepareCitizenBallot();
    expect(prepareGovernancePlainBallotMock).not.toHaveBeenCalled();
    expect(governance.actionError).toContain(
      "Conflicting endpoint identity evidence",
    );
    governance.review = preparedReview();
    await governance.confirmReview();
    expect(confirmGovernanceActionMock).not.toHaveBeenCalled();
    expect(governance.review).not.toBeNull();
    expect(governance.actionError).toContain(
      "Conflicting endpoint identity evidence",
    );
    expect(view.get(".governance-context").text()).toContain(
      "Conflicting endpoint identity evidence",
    );
    expect(view.get(".governance-context").text()).toContain(
      "Strict contract verified",
    );
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="new-governance-proposal"]',
      )?.disabled,
    ).toBe(true);
  });

  it("surfaces a missing governance-write feature separately from capabilities", async () => {
    const view = await mountView();
    const endpoint = useEndpointStore();
    const inspection = endpoint.inspection;
    if (!inspection) throw new Error("endpoint inspection missing");
    endpoint.$patch({
      inspection: {
        ...inspection,
        features: {
          ...inspection.features,
          governanceWrites: {
            ...inspection.features.governanceWrites,
            supported: false,
            missingOperations: ["/v1/gov/citizens/draft"],
          },
        },
      },
    });
    await flushPromises();

    const governance = useParliamentStore();
    expect(governance.capabilities).not.toBeNull();
    expect(governance.capabilitiesError).toBe("");
    expect(governance.canWrite).toBe(false);
    expect(governance.governanceWriteUnavailableReason).toContain(
      "does not advertise governance write operations",
    );
    expect(governance.plainVoteGate.allowed).toBe(false);
    expect(governance.plainVoteGate.reason).toContain(
      "does not advertise governance write operations",
    );
    expect(governance.parliamentBallotGate.reason).toContain(
      "does not advertise governance write operations",
    );
    expect(governance.enactGate.reason).toContain(
      "proposal-bound operator workflow",
    );
    expect(view.get(".governance-context").text()).toContain(
      "does not advertise governance write operations",
    );
    expect(view.get(".governance-context").text()).toContain(
      "Strict contract verified",
    );
  });

  it("starts citizenship first without gating independent governance reads", async () => {
    let resolveCitizenship: (value: unknown) => void = () => {};
    getGovernanceCitizenStatusMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCitizenship = resolve;
      }),
    );

    await mountView();

    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledTimes(1);
    expect(getGovernanceCapabilitiesMock).toHaveBeenCalled();
    expect(getGovernanceCitizenCountMock).toHaveBeenCalled();
    expect(getGovernanceCouncilCurrentMock).toHaveBeenCalled();
    expect(getGovernanceUnlockStatsMock).toHaveBeenCalled();
    const citizenCallOrder =
      getGovernanceCitizenStatusMock.mock.invocationCallOrder[0] ?? 0;
    expect(citizenCallOrder).toBeLessThan(
      getGovernanceCapabilitiesMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(citizenCallOrder).toBeLessThan(
      getGovernanceCitizenCountMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(citizenCallOrder).toBeLessThan(
      getGovernanceCouncilCurrentMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(citizenCallOrder).toBeLessThan(
      getGovernanceUnlockStatsMock.mock.invocationCallOrder[0] ?? 0,
    );

    resolveCitizenship({
      state: "citizen",
      accountId: ACCOUNT,
      amount: "10000",
      bondedHeight: "18457",
      seatsInEpoch: "0",
      lastEpochSeen: "0",
      cooldownUntil: null,
    });
    await flushPromises();

    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable citizenship without exposing the bond action", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "unavailable",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });

    const view = await mountView();

    expect(view.get(".identity").text()).toContain(
      "Citizen status unavailable",
    );
    expect(view.find('[data-testid="governance-bond-citizen"]').exists()).toBe(
      false,
    );
  });

  it("recovers a failed citizenship read on the visible-page poll", async () => {
    vi.useFakeTimers();
    getGovernanceCitizenStatusMock
      .mockRejectedValueOnce(new Error("preauth_temporarily_banned"))
      .mockResolvedValueOnce({
        state: "citizen",
        accountId: ACCOUNT,
        amount: "10000",
        bondedHeight: "18457",
        seatsInEpoch: "0",
        lastEpochSeen: "0",
        cooldownUntil: null,
      });

    const view = await mountView();
    expect(view.get(".identity").text()).toContain(
      "Citizen status unavailable",
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledTimes(2);
    expect(view.get(".identity").text()).toContain("Eligible");
  });

  it("keeps independent poll reads moving when citizenship is still pending", async () => {
    vi.useFakeTimers();
    getGovernanceCitizenStatusMock
      .mockResolvedValueOnce({
        state: "not-citizen",
        accountId: ACCOUNT,
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      })
      .mockReturnValueOnce(new Promise(() => {}));

    await mountView();
    const citizenCountCalls = getGovernanceCitizenCountMock.mock.calls.length;
    const councilCalls = getGovernanceCouncilCurrentMock.mock.calls.length;
    const unlockCalls = getGovernanceUnlockStatsMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();

    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledTimes(2);
    expect(getGovernanceCitizenCountMock).toHaveBeenCalledTimes(
      citizenCountCalls + 1,
    );
    expect(getGovernanceCouncilCurrentMock).toHaveBeenCalledTimes(
      councilCalls + 1,
    );
    expect(getGovernanceUnlockStatsMock).toHaveBeenCalledTimes(unlockCalls + 1);
  });

  it("ignores stale citizenship responses after the active account changes", async () => {
    let resolveAliceCitizenship: (value: unknown) => void = () => {};
    getGovernanceCitizenStatusMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAliceCitizenship = resolve;
        }),
      )
      .mockResolvedValueOnce({
        state: "not-citizen",
        accountId: "bob@wonderland",
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      });

    const view = await mountView();
    expect(view.get(".identity").text()).toContain("Checking citizenship");

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ed0120bob",
          signingAlgorithm: "ed25519",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    await flushPromises();
    expect(useParliamentStore().citizenState).toBe("not-citizen");

    resolveAliceCitizenship({
      state: "citizen",
      accountId: ACCOUNT,
      amount: "10000",
      bondedHeight: "1",
      seatsInEpoch: "0",
      lastEpochSeen: "1",
      cooldownUntil: null,
    });
    await flushPromises();

    expect(useParliamentStore().citizenState).toBe("not-citizen");
    expect(view.get(".identity").text()).toContain("Not a citizen yet");
  });

  it("hides the bond action after citizenship is detected", async () => {
    const view = await mountView();
    expect(view.find('[data-testid="governance-bond-citizen"]').exists()).toBe(
      false,
    );
    expect(view.get(".identity").text()).toContain("Eligible");
  });

  it("rejects unsupported proposal kinds at the typed first-release catalog", async () => {
    listGovernanceProposalsMock.mockRejectedValueOnce(
      new TypeError(
        "Governance proposal list.proposals[0].proposal_kind must be an exact typed validation-fee proposal.",
      ),
    );
    const view = await mountView();

    expect(view.get(".catalog-message.error").text()).toContain(
      "exact typed validation-fee proposal",
    );
    expect(view.find(".unknown-payload").exists()).toBe(false);
  });

  it("rejects ZK proposal details without a first-release fallback", async () => {
    getGovernanceProposalDetailMock.mockRejectedValueOnce(
      new TypeError(
        "Governance proposal referendum.mode must be Plain in the first-release contract.",
      ),
    );
    const view = await mountView(`/governance?proposal=${OTHER_HASH}`);

    expect(view.get(".detail-empty .error").text()).toContain(
      "must be Plain in the first-release contract",
    );
    expect(useParliamentStore().selectedProposal).toBeNull();
  });

  it("offers seven independent body ballots and lets a seated FMA member review once", async () => {
    const detail = proposalDetail({ referendumStatus: "Proposed" });
    detail.parliamentRosters = GOVERNANCE_PARLIAMENT_BODIES.map(
      (body, index) => ({
        body,
        members:
          body === "fma-committee" ? [ACCOUNT] : [`member-${index}@sora`],
        alternates: [],
      }),
    );
    detail.parliamentOutcomes = GOVERNANCE_PARLIAMENT_BODIES.map((body) => ({
      body,
      approvals: "0",
      rejections: "0",
      abstentions: "0",
      required: "1",
      currentAccountDecision: null,
    }));
    getGovernanceProposalDetailMock.mockResolvedValueOnce(detail);
    prepareGovernanceParliamentBallotMock.mockResolvedValueOnce(
      preparedReview(),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const bodyRows = view.findAll(".body-ballot");
    expect(bodyRows).toHaveLength(7);
    const fmaRow = bodyRows.find((row) => row.text().includes("fma-committee"));
    if (!fmaRow) throw new Error("FMA body row not found");
    expect(fmaRow.text()).toContain("Seated member");
    expect(fmaRow.get("button").attributes("disabled")).toBeUndefined();

    await fmaRow.get("button").trigger("click");
    await flushPromises();

    expect(prepareGovernanceParliamentBallotMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      proposalId: HASH,
      body: "fma-committee",
      decision: "approve",
    });
  });

  it("keeps alternates and members who already voted ineligible", async () => {
    const detail = proposalDetail({ referendumStatus: "Proposed" });
    detail.parliamentRosters = GOVERNANCE_PARLIAMENT_BODIES.map((body) => ({
      body,
      members: ["other@sora"],
      alternates: body === "fma-committee" ? [ACCOUNT] : [],
    }));
    detail.parliamentOutcomes = GOVERNANCE_PARLIAMENT_BODIES.map((body) => ({
      body,
      approvals: "1",
      rejections: "0",
      abstentions: "0",
      required: "1",
      currentAccountDecision:
        body === "rules-committee" ? ("approve" as const) : null,
    }));
    detail.parliamentRosters[0].members = [ACCOUNT];
    getGovernanceProposalDetailMock.mockResolvedValueOnce(detail);

    const view = await mountView(`/governance?proposal=${HASH}`);
    const bodyRows = view.findAll(".body-ballot");
    const fmaRow = bodyRows.find((row) => row.text().includes("fma-committee"));
    const rulesRow = bodyRows.find((row) =>
      row.text().includes("rules-committee"),
    );
    if (!fmaRow || !rulesRow) throw new Error("body row not found");
    expect(fmaRow.text()).toContain("Not seated");
    expect(fmaRow.get("button").attributes("disabled")).toBeDefined();
    expect(rulesRow.text()).toContain("Voted: approve");
    expect(rulesRow.get("button").attributes("disabled")).toBeDefined();
  });

  it("never exposes manual finalization or generic lifecycle enactment", async () => {
    const approvedLifecycle = proposalDetail({
      status: "Approved",
      referendumStatus: "Closed",
      finalizationEvidence: { approved: true },
      currentHeight: "4000",
    });
    getGovernanceProposalDetailMock.mockResolvedValue(approvedLifecycle);
    const view = await mountView(`/governance?proposal=${HASH}`);
    expect(
      view.findAll("button").some((button) => /finalize/iu.test(button.text())),
    ).toBe(false);

    expect(
      view
        .findAll("button")
        .some((button) => button.text().includes("Review enact")),
    ).toBe(false);
    expect(
      view.get('[data-testid="governance-enact-gate-reason"]').text(),
    ).toContain("proposal-bound operator workflow");
    expect(prepareGovernanceEnactMock).not.toHaveBeenCalled();
  });

  it("hides and refuses policy enactment even at the exact target height", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Approved",
        referendumStatus: "Closed",
        finalizationEvidence: { approved: true, finalized_height: 250 },
        currentHeight: "3690",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    expect(enactButton).toBeUndefined();
    expect(
      view.get('[data-testid="governance-enact-gate-reason"]').text(),
    ).toContain("proposal-bound operator workflow");
    const governance = useParliamentStore();
    expect(governance.enactGate.allowed).toBe(false);
    await governance.prepareEnact();
    expect(governance.actionError).toContain(
      "proposal-bound operator workflow",
    );
    expect(prepareGovernanceEnactMock).not.toHaveBeenCalled();
  });

  it("keeps PLAIN citizen voting available for validation-fee policy", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeUndefined();
    expect(
      view.get('[data-testid="governance-public-window"]').text(),
    ).toContain("90–3689");
    expect(
      view.get('[data-testid="governance-public-policy"]').text(),
    ).toContain("0.10 SBD");
    expect(view.get('[data-testid="governance-body-count"]').text()).toContain(
      "7 exact bodies",
    );
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("Eligible citizens1");
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("Eligible in frozen snapshot");
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("150 XOR · 3,600 blocks · one ballot");
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("After finalized height 88");
    expect(
      view
        .get('[data-testid="governance-citizen-ballot-status"]')
        .attributes("data-state"),
    ).toBe("open");
    expect(
      view.get('[data-testid="governance-citizen-ballot-status"]').text(),
    ).toContain("Open through inclusive height 3689");
    expect(
      view
        .findAll("button")
        .some((button) => button.text().includes("Review enact")),
    ).toBe(false);
  });

  it("fails PLAIN citizen voting closed when the immutable contract is unavailable", async () => {
    getGovernancePlainReferendumContractMock.mockRejectedValue(
      new Error("Immutable Taira electorate contract is missing"),
    );
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeDefined();
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("Immutable Taira electorate contract is missing");
  });

  it("fails PLAIN citizen voting closed for an account outside the frozen electorate", async () => {
    getGovernancePlainReferendumContractMock.mockResolvedValue(
      plainReferendumContract({ accountId: "bob@wonderland" }),
    );
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeDefined();
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain("outside the immutable eligible-citizen snapshot");
  });

  it("fails PLAIN citizen voting closed when live referendum coordinates differ", async () => {
    getGovernancePlainReferendumContractMock.mockResolvedValue(
      plainReferendumContract({ hEnd: "3690" }),
    );
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeDefined();
    expect(
      view.get('[data-testid="governance-plain-electorate"]').text(),
    ).toContain(
      "selected proposal differs from the immutable PLAIN referendum contract",
    );
  });

  it("shows the active citizen lock as the authoritative recorded vote state", async () => {
    const detail = proposalDetail({
      status: "Proposed",
      referendumStatus: "Open",
      currentHeight: "100",
      hStart: "90",
      hEnd: "3689",
      kind: validationFeePolicyKind("124651"),
    });
    detail.locks = [
      {
        owner: ACCOUNT,
        amount: "150",
        expiryHeight: "3700",
        direction: "Aye",
        durationBlocks: "3600",
      },
    ];
    getGovernanceProposalDetailMock.mockResolvedValue(detail);

    const view = await mountView(`/governance?proposal=${HASH}`);
    const status = view.get('[data-testid="governance-citizen-ballot-status"]');
    expect(status.attributes("data-state")).toBe("recorded");
    expect(status.text()).toContain("Ballot recorded on ledger");
    expect(status.text()).toContain(
      "Aye · 150 XOR · locked through inclusive height 3700",
    );
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeDefined();
  });

  it("keeps a citizen ballot preparation failure visible in the ballot status", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );
    prepareGovernancePlainBallotMock.mockRejectedValueOnce(
      new Error("Taira rejected the reviewed PLAIN ballot draft"),
    );
    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    if (!citizenButton) throw new Error("citizen review button not found");

    await citizenButton.trigger("click");
    await flushPromises();

    const status = view.get('[data-testid="governance-citizen-ballot-status"]');
    expect(status.attributes("data-state")).toBe("error");
    expect(status.text()).toContain("Ballot action failed");
    expect(status.text()).toContain(
      "Taira rejected the reviewed PLAIN ballot draft",
    );
  });

  it("keeps all seven Parliament body ballots available for policy voting", async () => {
    const detail = proposalDetail({
      status: "Proposed",
      referendumStatus: "Proposed",
      kind: validationFeePolicyKind("124651"),
    });
    detail.parliamentRosters = GOVERNANCE_PARLIAMENT_BODIES.map((body) => ({
      body,
      members: [ACCOUNT],
      alternates: [],
    }));
    detail.parliamentOutcomes = GOVERNANCE_PARLIAMENT_BODIES.map((body) => ({
      body,
      approvals: "0",
      rejections: "0",
      abstentions: "0",
      required: "1",
      currentAccountDecision: null,
    }));
    getGovernanceProposalDetailMock.mockResolvedValue(detail);

    const view = await mountView(`/governance?proposal=${HASH}`);
    const bodyButtons = view.findAll(".body-ballot button");
    expect(bodyButtons).toHaveLength(7);
    expect(
      bodyButtons.every(
        (button) => button.attributes("disabled") === undefined,
      ),
    ).toBe(true);
  });

  it("reviews the decoded instruction and ABI21 quote before commit", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );
    const view = await mountView(`/governance?proposal=${HASH}`);
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    if (!citizenButton) throw new Error("citizen review button not found");

    await citizenButton.trigger("click");
    await flushPromises();

    expect(prepareGovernancePlainBallotMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      proposalId: HASH,
      referendumId: HASH.slice(2),
      amount: "150",
      durationBlocks: "3600",
      direction: "Aye",
    });
    expect(document.body.textContent).toContain("Decoded instruction");
    expect(document.body.textContent).toContain("0.01 xor#wonderland");

    const commitButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Sign and commit"),
    );
    if (!commitButton) throw new Error("commit button not found");
    commitButton.click();
    await flushPromises();

    expect(confirmGovernanceActionMock).toHaveBeenCalledWith({
      reviewId: "review-1",
      accountId: ACCOUNT,
    });
  });

  it("enforces whole voting units and the advertised conviction lock", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Proposed",
        referendumStatus: "Open",
        currentHeight: "100",
        hStart: "90",
        hEnd: "3689",
        kind: validationFeePolicyKind("124651"),
      }),
    );
    await mountView(`/governance?proposal=${HASH}`);
    const governance = useParliamentStore();

    governance.ballotAmount = "150.5";
    expect(governance.plainVoteGate.allowed).toBe(false);
    expect(governance.plainVoteGate.reason).toContain(
      "positive whole-number ballot amount",
    );

    governance.ballotAmount = "150";
    governance.ballotDurationBlocks = "3599";
    expect(governance.plainVoteGate.allowed).toBe(false);
    expect(governance.plainVoteGate.reason).toContain(
      "immutable 150 XOR / 3,600-block PLAIN contract",
    );

    governance.ballotAmount = "149";
    governance.ballotDurationBlocks = "3600";
    expect(governance.plainVoteGate.allowed).toBe(false);
    expect(governance.plainVoteGate.reason).toContain(
      "immutable 150 XOR / 3,600-block PLAIN contract",
    );

    governance.ballotAmount = "150";
    governance.ballotDurationBlocks = "3600";
    expect(governance.plainVoteGate.allowed).toBe(true);
  });

  it("blocks validation-fee composition without locally verified proof state", async () => {
    await mountView();
    const newProposalButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="new-governance-proposal"]',
    );
    if (!newProposalButton) throw new Error("new proposal button not found");
    newProposalButton.click();
    await flushPromises();
    const policyKind = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".kind-selector button"),
    ).find((button) => button.textContent?.includes("Validation fee policy"));
    if (!policyKind) throw new Error("validation-fee kind not found");
    policyKind.click();
    await flushPromises();

    expect(document.body.textContent).toContain(
      "local consensus-proof verifier missing",
    );
    const reviewButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Decode and quote"));
    expect(reviewButton).toBeDefined();
    reviewButton?.click();
    await flushPromises();
    expect(prepareGovernanceProposalMock).not.toHaveBeenCalled();
  });

  it("prepares the exact payout lifecycle as step one", async () => {
    getGovernanceCapabilitiesMock
      .mockResolvedValueOnce(governanceCapabilities())
      .mockResolvedValue({
        ...governanceCapabilities(),
        currentHeight: 250,
      });
    prepareGovernanceProposalMock.mockResolvedValueOnce(preparedReview());
    await mountView();

    const governance = useParliamentStore();
    governance.composerKind = "ValidationFeePayoutLifecycle";
    governance.validationFeePayoutBindingJson = JSON.stringify(
      composerPayoutBinding(),
    );
    await governance.prepareProposal();

    expect(prepareGovernanceProposalMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      kind: "ValidationFeePayoutLifecycle",
      payload: {
        payout_binding: composerPayoutBinding(),
        referendum_window: { lower: "1150", upper: "4749" },
      },
    });
    expect(getGovernanceCapabilitiesMock).toHaveBeenCalledTimes(2);
  });

  it("seeds the exact window without inventing an effective height", async () => {
    getGovernanceCurrentValidationFeePolicyMock.mockResolvedValueOnce(
      validationFeePolicyView(),
    );

    await mountView();

    const governance = useParliamentStore();
    expect(governance.validationFeeWindowLower).toBe("1000");
    expect(governance.validationFeeWindowUpper).toBe("4599");
    expect(governance.validationFeeComposer.effective_from_height).toBe("");
    governance.validationFeeComposer.effective_from_height = "130000";
    governance.validationFeeWindowUpper = "4700";
    await flushPromises();
    expect(governance.validationFeeComposer.effective_from_height).toBe(
      "130000",
    );
    expect(document.body.textContent).toContain(
      "300-block submission safety margin above the 600-block minimum",
    );
  });

  it("preserves the explicit effective height while rebasing the window", async () => {
    getGovernanceCapabilitiesMock
      .mockResolvedValueOnce(governanceCapabilities())
      .mockResolvedValue({
        ...governanceCapabilities(),
        currentHeight: 250,
      });
    getGovernanceCurrentValidationFeePolicyMock.mockResolvedValueOnce(
      validationFeePolicyView(),
    );
    prepareGovernanceProposalMock.mockResolvedValueOnce(preparedReview());
    await mountView();

    const governance = useParliamentStore();
    governance.composerKind = "ValidationFeePolicy";
    governance.validationFeeWindowLower = "5000";
    governance.validationFeeWindowUpper = "8599";
    governance.validationFeeComposer.effective_from_height = "129561";
    governance.validationFeePayoutBindingJson = JSON.stringify(
      composerPayoutBinding(),
    );
    governance.validationFeePayoutLifecycleProposalId = OTHER_HASH.slice(2);
    getGovernanceProposalDetailMock.mockResolvedValueOnce(
      proposalDetail({
        proposalId: OTHER_HASH,
        status: "Enacted",
        referendumStatus: "Closed",
        currentHeight: "6000",
      }),
    );
    await governance.prepareProposal();

    expect(prepareGovernanceProposalMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      kind: "ValidationFeePolicy",
      payload: {
        policy: {
          schema_version: 1,
          chain_id: CHAIN_ID,
          genesis_hash: GENESIS_HASH,
          policy_version: "2",
          previous_policy_hash: "22".repeat(32),
          ds_asset_id: APP_SBD_ASSET_ID,
          ds_scale: 2,
          fee: "0.10",
          treasury_account_id: ACCOUNT,
          charging_mode: {
            charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
            value: null,
          },
          effective_from_height: "129561",
          expires_after_height: null,
          exemption_classes: ["TREASURY_PAYOUT"],
          treasury_payout_binding: composerPayoutBinding(),
        },
        referendum_window: { lower: "1150", upper: "4749" },
        payout_lifecycle_proposal_id: OTHER_HASH.slice(2),
      },
    });
    expect(getGovernanceCapabilitiesMock).toHaveBeenCalledTimes(2);
  });

  it("requires the enacted lifecycle height to be at or below the explicit policy target", async () => {
    getGovernanceCurrentValidationFeePolicyMock.mockResolvedValueOnce(
      validationFeePolicyView(),
    );
    prepareGovernanceProposalMock.mockResolvedValue(preparedReview());
    await mountView();

    const governance = useParliamentStore();
    governance.composerKind = "ValidationFeePolicy";
    governance.validationFeeComposer.effective_from_height = "129561";
    governance.validationFeePayoutBindingJson = JSON.stringify(
      composerPayoutBinding(),
    );
    governance.validationFeePayoutLifecycleProposalId = OTHER_HASH.slice(2);
    getGovernanceProposalDetailMock
      .mockResolvedValueOnce(
        proposalDetail({
          proposalId: OTHER_HASH,
          status: "Enacted",
          referendumStatus: "Closed",
          currentHeight: "9000",
          hEnd: "8000",
        }),
      )
      .mockResolvedValueOnce(
        proposalDetail({
          proposalId: OTHER_HASH,
          status: "Enacted",
          referendumStatus: "Closed",
          currentHeight: "9000",
          hEnd: "8588",
        }),
      )
      .mockResolvedValueOnce(
        proposalDetail({
          proposalId: OTHER_HASH,
          status: "Enacted",
          referendumStatus: "Closed",
          currentHeight: "9000",
          hEnd: "8589",
        }),
      );

    await governance.prepareProposal();
    expect(prepareGovernanceProposalMock).toHaveBeenCalledTimes(1);
    governance.cancelReview();
    await governance.prepareProposal();
    expect(prepareGovernanceProposalMock).toHaveBeenCalledTimes(2);
    governance.cancelReview();
    await governance.prepareProposal();

    expect(prepareGovernanceProposalMock).toHaveBeenCalledTimes(2);
    expect(governance.actionError).toContain(
      "must enact no later than the policy enactment target",
    );
  });
});

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
import { useParliamentStore } from "@/stores/parliament";
import { useSessionStore } from "@/stores/session";

const HASH = `0x${"ab".repeat(32)}`;
const OTHER_HASH = `0x${"cd".repeat(32)}`;
const ACCOUNT = "alice@wonderland";
const CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const NETWORK_PREFIX = 369;
const GENESIS_HASH = "11".repeat(32);
const SBD_ASSET_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
const payoutBinding = () => ({
  contract_address: "contract:validation-fee",
  code_hash: "44".repeat(32),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: ACCOUNT,
  sbd_asset_id: SBD_ASSET_ID,
  xor_asset_id: "xor#wonderland",
  pool_vault_account_id: "pool@wonderland",
  batch_sbd: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [1, 2, 3, 4].map((index) => ({
    account_id: `validator-${index}@wonderland`,
    share: "0.25",
  })),
});

const validationFeePolicyKind = (effectiveFromHeight: string) => ({
  kind: "VALIDATION_FEE_POLICY",
  payload: {
    policy: {
      schema_version: 1,
      chain_id: CHAIN_ID,
      genesis_hash: GENESIS_HASH,
      policy_version: 1,
      previous_policy_hash: null,
      ds_asset_id: SBD_ASSET_ID,
      ds_scale: 2,
      fee: "0.10",
      treasury_account_id: ACCOUNT,
      charging_mode: {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
        value: null,
      },
      effective_from_height: effectiveFromHeight,
      expires_after_height: null,
      exemption_classes: [],
      treasury_payout_binding: null,
    },
  },
});

const listGovernanceProposalsMock = vi.fn();
const getGovernanceProposalDetailMock = vi.fn();
const getGovernanceCapabilitiesMock = vi.fn();
const getGovernanceCitizenStatusMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const prepareGovernanceCitizenRegistrationMock = vi.fn();
const getGovernanceCurrentValidationFeePolicyMock = vi.fn();
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
  getGovernanceCitizenStatus: (input: unknown) =>
    getGovernanceCitizenStatusMock(input),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  prepareGovernanceCitizenRegistration: (input: unknown) =>
    prepareGovernanceCitizenRegistrationMock(input),
  getGovernanceCurrentValidationFeePolicy: (toriiUrl: string) =>
    getGovernanceCurrentValidationFeePolicyMock(toriiUrl),
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

const proposalList = () =>
  normalizeGovernanceProposalList({
    items: [
      {
        proposal_id: HASH,
        referendum_id: "referendum-1",
        proposer: ACCOUNT,
        created_height: "90",
        status: "Proposed",
        referendum_status: "Open",
        voting_mode: "Plain",
        kind: {
          kind: "VALIDATION_FEE_PAYOUT_LIFECYCLE",
          payload: { payout_binding: { contract_address: "contract:payout" } },
        },
        pipeline: {
          stages: [
            { stage: "Admit", started_at: "90", completed_at: "90" },
            { stage: "Rules", started_at: "91", completed_at: "91" },
            { stage: "Agenda", started_at: "92" },
          ],
        },
      },
      {
        proposal_id: OTHER_HASH,
        referendum_id: "referendum-2",
        proposer: "bob@wonderland",
        created_height: "80",
        status: "Proposed",
        referendum_status: "Open",
        voting_mode: "Zk",
        kind: { FutureGovernanceKind: { opaque: true } },
      },
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
  return normalizeGovernanceProposalDetail(
    {
      proposal_id: proposalId,
      referendum_id: "referendum-1",
      proposer: ACCOUNT,
      created_height: "90",
      status: options?.status ?? "Proposed",
      referendum_status: options?.referendumStatus ?? "Open",
      voting_mode: mode,
      kind:
        options?.kind ??
        ({
          kind: "VALIDATION_FEE_PAYOUT_LIFECYCLE",
          payload: {
            payout_binding: { contract_address: "contract:payout" },
          },
        } as Record<string, unknown>),
      referendum: {
        referendum_id: "referendum-1",
        h_start: options?.hStart ?? "90",
        h_end: options?.hEnd ?? "200",
        status: options?.referendumStatus ?? "Open",
        mode,
      },
      tally: { approve: "7", reject: "2", abstain: "1" },
      locks: [],
      current_height: options?.currentHeight ?? "100",
      pipeline: {
        stages: [
          { stage: "Admit", started_at: "90", completed_at: "90" },
          { stage: "Rules", started_at: "91", completed_at: "91" },
          { stage: "Agenda", started_at: "92" },
        ],
      },
      parliament_snapshot: {
        bodies: {
          "agenda-council": { members: [ACCOUNT], alternates: [] },
        },
      },
      body_progress: [
        {
          body: "agenda-council",
          approve: "0",
          reject: "0",
          abstain: "0",
          required: "1",
          current_account_decision: null,
        },
      ],
      finalization_evidence: options?.finalizationEvidence ?? null,
    },
    proposalId,
  );
};

const preparedReview = () => ({
  reviewId: "review-1",
  operation: "plain-ballot" as const,
  title: "Submit citizen ballot",
  proposalId: HASH,
  referendumId: "referendum-1",
  decodedInstruction: {
    CastPlainBallot: {
      referendum_id: "referendum-1",
      owner: ACCOUNT,
      amount: "1",
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
  citizenshipAssetId: "xor#wonderland",
  citizenshipBondAmount: "10000",
  votingAssetId: "xor#wonderland",
  minBondAmount: "1",
  convictionStepBlocks: 720,
  maxConviction: 6,
  minEnactmentDelay: 600,
  windowSpan: 3_600,
  minTurnout: "1000",
  approvalThresholdNumerator: 1,
  approvalThresholdDenominator: 2,
  parliamentQuorumBps: 6_700,
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
    "/v1/gov/citizens/draft",
    "/v1/validation-fee/proposals",
    "/v1/validation-fee/proposals/{proposal_id}",
    "/v1/validation-fee/proposals/draft",
    "/v1/gov/ballots/plain",
    "/v1/gov/parliament/ballots",
    "/v1/gov/enact",
  ],
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
          mode: proposalId === OTHER_HASH ? "Zk" : "Plain",
          kind:
            proposalId === OTHER_HASH
              ? { FutureGovernanceKind: { opaque: true } }
              : undefined,
        }),
      ),
    );
    getGovernanceCitizenStatusMock.mockResolvedValue({
      accountId: ACCOUNT,
      isCitizen: true,
      amount: "10000",
      bondedHeight: 1,
      seatsInEpoch: [],
      lastEpochSeen: 1,
      cooldownUntil: null,
      endpointAvailable: true,
    });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [{ asset_id: "xor#wonderland", quantity: "12500" }],
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
    prepareGovernancePlainBallotMock.mockResolvedValue(preparedReview());
    confirmGovernanceActionMock.mockResolvedValue({
      hash: "ef".repeat(32),
      operation: "plain-ballot",
      proposalId: HASH,
      referendumId: "referendum-1",
      status: "committed",
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.replaceChildren();
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
    expect(view.get(".proposal-detail").text()).toContain(
      "Validation fee payout lifecycle",
    );
    expect(view.get(".proposal-detail").text()).toContain(HASH);
    expect(view.get(".governance-context").text()).toContain("Policy proof");
    expect(view.get(".governance-context").text()).toContain("Unavailable");
    expect(view.get(".governance-context").text()).toContain(
      "Strict contract verified",
    );
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
        accountId: ACCOUNT,
        isCitizen: false,
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
        endpointAvailable: true,
      })
      .mockResolvedValue({
        accountId: ACCOUNT,
        isCitizen: true,
        amount: "10000",
        bondedHeight: 101,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
        endpointAvailable: true,
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
      accountId: ACCOUNT,
      isCitizen: false,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
      endpointAvailable: true,
    });
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [{ asset_id: "xor#wonderland", quantity: "9999" }],
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

  it("fails closed when strict governance capabilities are unavailable", async () => {
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      accountId: ACCOUNT,
      isCitizen: false,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
      endpointAvailable: true,
    });
    getGovernanceCapabilitiesMock.mockRejectedValueOnce(
      new Error("governance capabilities contain unknown fields"),
    );

    const view = await mountView();
    const bondButton = view.get('[data-testid="governance-bond-citizen"]');
    expect(bondButton.attributes("disabled")).toBeDefined();
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

  it("hides the bond action after citizenship is detected", async () => {
    const view = await mountView();
    expect(view.find('[data-testid="governance-bond-citizen"]').exists()).toBe(
      false,
    );
    expect(view.get(".identity").text()).toContain("Eligible");
  });

  it("keeps unknown proposal kinds inspect-only", async () => {
    const view = await mountView();
    const unknown = view.get(`[data-proposal-id="${OTHER_HASH}"]`);

    await unknown.trigger("click");
    await flushPromises();

    expect(view.get(".unknown-payload").text()).toContain("inspect-only");
    expect(view.get(".governance-inspector").text()).toContain(
      "Unknown proposal kinds are inspect-only.",
    );
    expect(
      view
        .findAll(".governance-inspector button")
        .filter((button) => button.attributes("disabled") === undefined),
    ).toHaveLength(0);
  });

  it("shows ZK proposals but fails closed without a plain fallback", async () => {
    getGovernanceProposalDetailMock.mockResolvedValueOnce(
      proposalDetail({ proposalId: OTHER_HASH, mode: "Zk" }),
    );
    const view = await mountView(`/governance?proposal=${OTHER_HASH}`);

    expect(view.get(".fail-closed").text()).toContain("ZK voting unavailable");
    expect(view.get(".fail-closed").text()).toContain(
      "No fallback ballot will be submitted.",
    );
    const citizenButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review citizen ballot"));
    expect(citizenButton?.attributes("disabled")).toBeDefined();
    const bodyButtons = view.findAll(".body-ballot button");
    expect(bodyButtons).toHaveLength(7);
    expect(
      bodyButtons.every(
        (button) => button.attributes("disabled") !== undefined,
      ),
    ).toBe(true);
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

  it("refuses to enact an approved ZK proposal", async () => {
    getGovernanceProposalDetailMock.mockResolvedValueOnce(
      proposalDetail({
        proposalId: OTHER_HASH,
        mode: "Zk",
        status: "Approved",
      }),
    );
    const view = await mountView(`/governance?proposal=${OTHER_HASH}`);
    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    expect(enactButton?.attributes("disabled")).toBeDefined();
    expect(view.get(".governance-inspector").text()).toContain(
      "ZK voting is unavailable in this release.",
    );
  });

  it("offers enact only for finalized approved PLAIN evidence and never manual finalize", async () => {
    const approvedLifecycle = proposalDetail({
      status: "Approved",
      referendumStatus: "Closed",
      finalizationEvidence: { approved: true, finalized_height: 250 },
    });
    getGovernanceProposalDetailMock.mockResolvedValue(approvedLifecycle);
    prepareGovernanceEnactMock.mockResolvedValueOnce(preparedReview());
    const view = await mountView(`/governance?proposal=${HASH}`);
    expect(
      view.findAll("button").some((button) => /finalize/iu.test(button.text())),
    ).toBe(false);

    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    if (!enactButton) throw new Error("enact review button not found");
    expect(enactButton.attributes("disabled")).toBeUndefined();
    await enactButton.trigger("click");
    await flushPromises();

    expect(prepareGovernanceEnactMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      proposalId: HASH,
    });
  });

  it("shows a stable countdown until the exact policy enactment target", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Approved",
        referendumStatus: "Closed",
        finalizationEvidence: { approved: true, finalized_height: 250 },
        currentHeight: "3797",
        hEnd: "200",
        kind: validationFeePolicyKind("124760"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    expect(enactButton?.attributes("disabled")).toBeDefined();
    expect(view.get(".governance-inspector").text()).toContain(
      "2 committed blocks remain before exact target 3800",
    );
    expect(prepareGovernanceEnactMock).not.toHaveBeenCalled();
  });

  it("allows policy enactment only when the next committed height is the target", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Approved",
        referendumStatus: "Closed",
        finalizationEvidence: { approved: true, finalized_height: 250 },
        currentHeight: "3799",
        hEnd: "200",
        kind: validationFeePolicyKind("124760"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    expect(enactButton?.attributes("disabled")).toBeUndefined();
  });

  it("fails policy enactment closed after the exact target is missed", async () => {
    getGovernanceProposalDetailMock.mockResolvedValue(
      proposalDetail({
        status: "Approved",
        referendumStatus: "Closed",
        finalizationEvidence: { approved: true, finalized_height: 250 },
        currentHeight: "3800",
        hEnd: "200",
        kind: validationFeePolicyKind("124760"),
      }),
    );

    const view = await mountView(`/governance?proposal=${HASH}`);
    const enactButton = view
      .findAll("button")
      .find((button) => button.text().includes("Review enact"));
    expect(enactButton?.attributes("disabled")).toBeDefined();
    expect(view.get(".governance-inspector").text()).toContain(
      "target 3800 was missed",
    );
    expect(prepareGovernanceEnactMock).not.toHaveBeenCalled();
  });

  it("reviews the decoded instruction and ABI21 quote before commit", async () => {
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
      referendumId: "referendum-1",
      amount: "1",
      durationBlocks: "7200",
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
    governance.validationFeePayoutBindingJson = JSON.stringify(payoutBinding());
    await governance.prepareProposal();

    expect(prepareGovernanceProposalMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: CHAIN_ID,
      accountId: ACCOUNT,
      networkPrefix: NETWORK_PREFIX,
      kind: "ValidationFeePayoutLifecycle",
      payload: {
        payout_binding: payoutBinding(),
        referendum_window: { lower: "1150", upper: "4749" },
      },
    });
    expect(getGovernanceCapabilitiesMock).toHaveBeenCalledTimes(2);
  });

  it("seeds the exact 3,600-block window and buffered activation from capabilities", async () => {
    getGovernanceCurrentValidationFeePolicyMock.mockResolvedValueOnce(
      validationFeePolicyView(),
    );

    await mountView();

    const governance = useParliamentStore();
    expect(governance.validationFeeWindowLower).toBe("1000");
    expect(governance.validationFeeWindowUpper).toBe("4599");
    expect(governance.validationFeeComposer.effective_from_height).toBe(
      "129159",
    );
    expect(document.body.textContent).toContain(
      "300-block submission safety margin above the 600-block minimum",
    );
  });

  it("prepares the exact native validation-fee payload with upper-bound activation", async () => {
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
    governance.validationFeeComposer.effective_from_height = "133159";
    governance.validationFeePayoutBindingJson = JSON.stringify(payoutBinding());
    governance.validationFeePayoutLifecycleProposalId = OTHER_HASH.slice(2);
    getGovernanceProposalDetailMock.mockResolvedValueOnce(
      proposalDetail({
        proposalId: OTHER_HASH,
        status: "Enacted",
        referendumStatus: "Closed",
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
          ds_asset_id: SBD_ASSET_ID,
          ds_scale: 2,
          fee: "0.10",
          treasury_account_id: ACCOUNT,
          charging_mode: {
            charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
            value: null,
          },
          effective_from_height: "129309",
          expires_after_height: null,
          exemption_classes: ["TREASURY_PAYOUT"],
          treasury_payout_binding: payoutBinding(),
        },
        referendum_window: { lower: "1150", upper: "4749" },
        payout_lifecycle_proposal_id: OTHER_HASH.slice(2),
      },
    });
    expect(getGovernanceCapabilitiesMock).toHaveBeenCalledTimes(2);
  });
});

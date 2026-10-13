import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_BODY_KEYS,
  GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
  GOVERNANCE_REQUIRED_ROUTES,
  governanceCapabilitiesContractFingerprintV1,
  parseGovernanceCapabilitiesV1,
  TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS,
  TAIRA_GOVERNANCE_TARGET_BODY_SIZES,
  TAIRA_GOVERNANCE_XOR_ASSET_ID,
} from "../electron/governanceCapabilities";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_NETWORK_ID,
} from "./helpers/networkIdentityFixture";

const capabilities = () => ({
  schema: "iroha.governance.capabilities.v1",
  version: 1,
  network_id: TEST_TAIRA_NETWORK_ID,
  current_height: "42000",
  network_prefix: "369",
  abi_version: "1",
  data_model_version: "4",
  approval_mode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1",
  private_ballot_protocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1",
  mandatory_private_ballots: true,
  proposal_backed_referendum_ballots_supported: false,
  standalone_plain_ballots_supported: true,
  standalone_zk_ballots_supported: true,
  citizenship_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
  citizenship_bond_amount: "10000",
  citizenship_escrow_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  voting_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
  min_bond_amount: "150",
  bond_escrow_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  min_enactment_delay: "600",
  invitation_phase_blocks: "3600",
  registration_phase_blocks: "3600",
  survivor_freeze_phase_blocks: "1000",
  commitment_phase_blocks: "3600",
  release_delay_blocks: "600",
  opening_phase_blocks: "600",
  max_ballot_retries: "3",
  max_corpus_entries: "1000",
  target_body_sizes: Object.fromEntries(
    Object.entries(TAIRA_GOVERNANCE_TARGET_BODY_SIZES).map(([body, size]) => [
      body,
      String(size),
    ]),
  ),
  supported_proposal_kinds: [...GOVERNANCE_REQUIRED_PROPOSAL_KINDS],
  supported_routes: [...GOVERNANCE_REQUIRED_ROUTES],
});

describe("current Taira governance capabilities", () => {
  it("accepts the exact NetworkId, private Parliament protocol, and resource contract", () => {
    expect(
      parseGovernanceCapabilitiesV1(capabilities(), TEST_TAIRA_NETWORK_ID),
    ).toMatchObject({
      networkId: TEST_TAIRA_NETWORK_ID,
      currentHeight: "42000",
      networkPrefix: 369,
      abiVersion: 1,
      dataModelVersion: 4,
      approvalMode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1",
      privateBallotProtocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1",
      mandatoryPrivateBallots: true,
      proposalBackedReferendumBallotsSupported: false,
      standalonePlainBallotsSupported: true,
      standaloneZkBallotsSupported: true,
      ...TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS,
      targetBodySizes: TAIRA_GOVERNANCE_TARGET_BODY_SIZES,
    });
    expect(GOVERNANCE_BODY_KEYS).toHaveLength(10);
  });

  it("rejects unknown fields, aliases, accessors, and non-plain objects", () => {
    expect(() =>
      parseGovernanceCapabilitiesV1(
        {
          ...capabilities(),
          chain_id: "retired",
        },
        TEST_TAIRA_NETWORK_ID,
      ),
    ).toThrow(/missing or unknown fields/);

    const aliased = capabilities() as Record<string, unknown>;
    aliased.networkId = aliased.network_id;
    delete aliased.network_id;
    expect(() =>
      parseGovernanceCapabilitiesV1(aliased, TEST_TAIRA_NETWORK_ID),
    ).toThrow(/missing or unknown fields/);

    const accessor = capabilities();
    Object.defineProperty(accessor, "current_height", {
      enumerable: true,
      get: () => "42000",
    });
    expect(() =>
      parseGovernanceCapabilitiesV1(accessor, TEST_TAIRA_NETWORK_ID),
    ).toThrow(/JSON data fields/);

    expect(() =>
      parseGovernanceCapabilitiesV1(
        Object.assign(Object.create({ inherited: true }), capabilities()),
        TEST_TAIRA_NETWORK_ID,
      ),
    ).toThrow(/plain object/);
  });

  it("rejects retired public validation-fee referendum capability fields", () => {
    for (const field of [
      "chain_id",
      "genesis_hash",
      "plain_voting_enabled",
      "auto_finalize_plain",
      "auto_finalize_plain_scope",
      "validation_fee_plain_requires_explicit_finalization",
      "validation_fee_plain_electorate_rules",
      "window_span",
      "conviction_step_blocks",
      "max_conviction",
      "min_turnout",
      "approval_threshold_numerator",
      "approval_threshold_denominator",
      "parliament_quorum_bps",
    ]) {
      expect(() =>
        parseGovernanceCapabilitiesV1(
          {
            ...capabilities(),
            [field]: null,
          },
          TEST_TAIRA_NETWORK_ID,
        ),
      ).toThrow(/missing or unknown fields/);
    }
  });

  it("fails closed on identity, protocol, flag, resource, route, kind, or body drift", () => {
    const candidates = [
      { ...capabilities(), network_id: "hash:" + "11".repeat(32) + "#0000" },
      { ...capabilities(), network_prefix: "753" },
      { ...capabilities(), abi_version: "2" },
      { ...capabilities(), data_model_version: "3" },
      { ...capabilities(), approval_mode: "PARLIAMENT_SORTITION_JIT" },
      { ...capabilities(), private_ballot_protocol: "PLAIN" },
      { ...capabilities(), mandatory_private_ballots: false },
      {
        ...capabilities(),
        proposal_backed_referendum_ballots_supported: true,
      },
      { ...capabilities(), standalone_plain_ballots_supported: false },
      { ...capabilities(), standalone_zk_ballots_supported: false },
      { ...capabilities(), invitation_phase_blocks: "3599" },
      { ...capabilities(), registration_phase_blocks: "3599" },
      { ...capabilities(), survivor_freeze_phase_blocks: "999" },
      { ...capabilities(), commitment_phase_blocks: "3599" },
      { ...capabilities(), release_delay_blocks: "599" },
      { ...capabilities(), opening_phase_blocks: "599" },
      { ...capabilities(), max_ballot_retries: "4" },
      { ...capabilities(), max_corpus_entries: "999" },
      {
        ...capabilities(),
        supported_proposal_kinds: GOVERNANCE_REQUIRED_PROPOSAL_KINDS.slice(1),
      },
      {
        ...capabilities(),
        supported_routes: GOVERNANCE_REQUIRED_ROUTES.slice(1),
      },
      {
        ...capabilities(),
        supported_routes: [
          ...GOVERNANCE_REQUIRED_ROUTES,
          "/v1/gov/legacy-compatible-route",
        ],
      },
      {
        ...capabilities(),
        target_body_sizes: {
          ...capabilities().target_body_sizes,
          confirmation_jury: "999",
        },
      },
      { ...capabilities(), current_height: "42000blocks" },
      { ...capabilities(), current_height: "042000" },
      { ...capabilities(), current_height: 42_000 },
    ];

    for (const candidate of candidates) {
      expect(() =>
        parseGovernanceCapabilitiesV1(candidate, TEST_TAIRA_NETWORK_ID),
      ).toThrow();
    }
  });

  it("matches the exact current ten-kind and fifteen-route sets", () => {
    expect(GOVERNANCE_REQUIRED_PROPOSAL_KINDS).toEqual([
      "DEPLOY_CONTRACT",
      "RUNTIME_UPGRADE",
      "SCCP_ROUTE_GOVERNANCE",
      "VALIDATION_FEE_POLICY",
      "VALIDATION_FEE_PAYOUT_LIFECYCLE",
      "MUSUBI_REGISTRY_GOVERNANCE",
      "SORAFS_PROVIDER_GOVERNANCE",
      "CONTRACT_LIFECYCLE_GOVERNANCE",
      "CONTRACT_EMERGENCY_HOLD",
      "GLOBAL_DATA_TRIGGER_PERMISSION_GOVERNANCE",
    ]);
    expect(GOVERNANCE_REQUIRED_ROUTES).toEqual([
      "/v1/gov/capabilities",
      "/v1/gov/citizens/draft",
      "/v1/gov/parliament/attempts/draft",
      "/v1/gov/parliament/attempts/{governance_attempt_id}",
      "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context",
      "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof",
      "/v1/gov/parliament/ballots/{ballot_attempt_id}/release-context",
      "/v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release",
      "/v1/gov/parliament/transitions/draft",
      "/v1/gov/ballots/plain",
      "/v1/gov/ballots/zk-v1",
      "/v1/gov/ballots/zk-v1/ballot-proof",
      "/v1/validation-fee/proposals",
      "/v1/validation-fee/proposals/{proposal_id}",
      "/v1/validation-fee/proposals/draft",
    ]);
  });

  it("fingerprints all immutable fields without binding moving height or set order", () => {
    const reviewed = parseGovernanceCapabilitiesV1(
      capabilities(),
      TEST_TAIRA_NETWORK_ID,
    );
    const nextHeight = parseGovernanceCapabilitiesV1(
      {
        ...capabilities(),
        current_height: "42001",
      },
      TEST_TAIRA_NETWORK_ID,
    );
    const reorderedSets = parseGovernanceCapabilitiesV1(
      {
        ...capabilities(),
        supported_proposal_kinds: [
          ...GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
        ].reverse(),
        supported_routes: [...GOVERNANCE_REQUIRED_ROUTES].reverse(),
      },
      TEST_TAIRA_NETWORK_ID,
    );
    const driftedContract = {
      ...reviewed,
      privateBallotProtocol: "DIFFERENT_PRIVATE_PROTOCOL",
    } as unknown as typeof reviewed;
    const driftedBounds = {
      ...reviewed,
      maxCorpusEntries: 999,
    } as unknown as typeof reviewed;

    const fingerprint = governanceCapabilitiesContractFingerprintV1(reviewed);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(governanceCapabilitiesContractFingerprintV1(nextHeight)).toBe(
      fingerprint,
    );
    expect(governanceCapabilitiesContractFingerprintV1(reorderedSets)).toBe(
      fingerprint,
    );
    expect(
      governanceCapabilitiesContractFingerprintV1(driftedContract),
    ).not.toBe(fingerprint);
    expect(governanceCapabilitiesContractFingerprintV1(driftedBounds)).not.toBe(
      fingerprint,
    );
  });
  it("binds capabilities to the endpoint's pinned NetworkId", () => {
    expect(() =>
      parseGovernanceCapabilitiesV1(
        capabilities(),
        TEST_PREVIOUS_TAIRA_NETWORK_ID,
      ),
    ).toThrow("pinned NetworkId");
  });
});

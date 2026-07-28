import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
  GOVERNANCE_REQUIRED_ROUTES,
  governanceCapabilitiesContractFingerprintV1,
  parseGovernanceCapabilitiesV1,
  TAIRA_GOVERNANCE_CHAIN_ID,
  TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  TAIRA_GOVERNANCE_TARGET_BODY_SIZES,
  TAIRA_GOVERNANCE_XOR_ASSET_ID,
} from "../electron/governanceCapabilities";

const ALTERNATE_TAIRA_BOND_ACCOUNT =
  "testuﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";
const ALTERNATE_TAIRA_SLASH_ACCOUNT =
  "testuﾛ1QEnRヰ7Dﾑzmg1ﾊｻ4ﾈAcckｻsafiｳヱufｴｻｻPﾆｴﾖﾁﾉDR1Y5PX";

const capabilities = () => ({
  schema: "iroha.governance.capabilities.v1",
  version: 1,
  chain_id: TAIRA_GOVERNANCE_CHAIN_ID,
  genesis_hash:
    "884b61c61f56dcddceee7aa3dc1deb89fb8552576d02b01a1b7af9ae7fd5ff7a",
  current_height: "42000",
  network_prefix: "369",
  abi_version: "1",
  data_model_version: "3",
  approval_mode: "PARLIAMENT_SORTITION_JIT",
  plain_voting_enabled: true,
  auto_finalize_plain: true,
  auto_finalize_plain_scope: "GENERIC_NON_VALIDATION_FEE_ONLY",
  validation_fee_plain_requires_explicit_finalization: true,
  validation_fee_plain_electorate_rules: {
    voting_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
    bond_escrow_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
    slash_receiver_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
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
  },
  citizenship_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
  citizenship_bond_amount: "10000",
  citizenship_escrow_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  voting_asset_id: TAIRA_GOVERNANCE_XOR_ASSET_ID,
  min_bond_amount: "150",
  bond_escrow_account: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  conviction_step_blocks: "100",
  max_conviction: "6",
  min_enactment_delay: "600",
  window_span: "3600",
  min_turnout: "1",
  approval_threshold_numerator: "1",
  approval_threshold_denominator: "2",
  parliament_quorum_bps: "6667",
  target_body_sizes: Object.fromEntries(
    Object.entries(TAIRA_GOVERNANCE_TARGET_BODY_SIZES).map(([body, size]) => [
      body,
      String(size),
    ]),
  ),
  supported_proposal_kinds: [...GOVERNANCE_REQUIRED_PROPOSAL_KINDS],
  supported_routes: [...GOVERNANCE_REQUIRED_ROUTES],
});

describe("Taira governance capabilities", () => {
  it("accepts only the reviewed fc569, prefix 369, ABI 1 contract", () => {
    expect(parseGovernanceCapabilitiesV1(capabilities())).toMatchObject({
      chainId: TAIRA_GOVERNANCE_CHAIN_ID,
      networkPrefix: 369,
      abiVersion: 1,
      dataModelVersion: 3,
      approvalMode: "PARLIAMENT_SORTITION_JIT",
      plainVotingEnabled: true,
      autoFinalizePlain: true,
      windowSpan: 3_600,
      minEnactmentDelay: 600,
      targetBodySizes: TAIRA_GOVERNANCE_TARGET_BODY_SIZES,
    });
  });

  it("rejects unknown fields and compatibility aliases", () => {
    expect(() =>
      parseGovernanceCapabilitiesV1({
        ...capabilities(),
        legacy_council_epoch: 7,
      }),
    ).toThrow(/missing or unknown fields/);
    const aliased = capabilities() as Record<string, unknown>;
    aliased.chainId = aliased.chain_id;
    delete aliased.chain_id;
    expect(() => parseGovernanceCapabilitiesV1(aliased)).toThrow(
      /missing or unknown fields/,
    );
  });

  it("fails closed on network, ABI, voting, route, kind, or body drift", () => {
    const candidates = [
      { ...capabilities(), chain_id: "minamoto" },
      { ...capabilities(), genesis_hash: "12".repeat(32) },
      { ...capabilities(), network_prefix: "753" },
      { ...capabilities(), abi_version: "2" },
      { ...capabilities(), data_model_version: "1" },
      { ...capabilities(), auto_finalize_plain: false },
      {
        ...capabilities(),
        approval_mode: "LEGACY_COUNCIL_EPOCH",
      },
      {
        ...capabilities(),
        supported_proposal_kinds: ["VALIDATION_FEE_POLICY"],
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
          fma_committee: "4",
        },
      },
      { ...capabilities(), current_height: "42000blocks" },
      { ...capabilities(), current_height: "042000" },
      { ...capabilities(), current_height: 42_000 },
      { ...capabilities(), min_turnout: "2" },
    ];

    for (const candidate of candidates) {
      expect(() => parseGovernanceCapabilitiesV1(candidate)).toThrow();
    }
  });

  it("matches the exact fourteen-route Taira contract with no generic enact path", () => {
    expect(GOVERNANCE_REQUIRED_ROUTES).toEqual([
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
    ]);
  });

  it("requires the exact Taira bond, lock, escrow, and electorate rules", () => {
    for (const drift of [
      { citizenship_bond_amount: "9999" },
      { min_bond_amount: "149" },
      { conviction_step_blocks: "101" },
      {
        bond_escrow_account: ALTERNATE_TAIRA_BOND_ACCOUNT,
        validation_fee_plain_electorate_rules: {
          ...capabilities().validation_fee_plain_electorate_rules,
          bond_escrow_account: ALTERNATE_TAIRA_BOND_ACCOUNT,
        },
      },
      {
        validation_fee_plain_electorate_rules: {
          ...capabilities().validation_fee_plain_electorate_rules,
          ballot_duration_blocks: "3599",
        },
      },
      {
        validation_fee_plain_electorate_rules: {
          ...capabilities().validation_fee_plain_electorate_rules,
          bond_escrow_account: ALTERNATE_TAIRA_BOND_ACCOUNT,
        },
      },
      {
        validation_fee_plain_electorate_rules: {
          ...capabilities().validation_fee_plain_electorate_rules,
          slash_receiver_account: ALTERNATE_TAIRA_SLASH_ACCOUNT,
        },
      },
    ]) {
      expect(() =>
        parseGovernanceCapabilitiesV1({
          ...capabilities(),
          ...drift,
        }),
      ).toThrow();
    }
  });

  it("fingerprints the immutable parsed contract without binding a moving height", () => {
    const reviewed = parseGovernanceCapabilitiesV1(capabilities());
    const nextHeight = parseGovernanceCapabilitiesV1({
      ...capabilities(),
      current_height: "42001",
    });
    const reorderedSets = parseGovernanceCapabilitiesV1({
      ...capabilities(),
      supported_proposal_kinds: [
        ...GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
      ].reverse(),
      supported_routes: [...GOVERNANCE_REQUIRED_ROUTES].reverse(),
    });
    const driftedContract = {
      ...reviewed,
      genesisHash:
        "65003c37b640ad0c993c03131052b24029c933ec501c9e68b16dcb91a2ec9dc8",
    };
    const driftedCustody = {
      ...reviewed,
      validationFeePlainElectorateRules: {
        ...reviewed.validationFeePlainElectorateRules,
        slashReceiverAccount:
          "testuﾛ1QEnRヰ7Dﾑzmg1ﾊｻ4ﾈAcckｻsafiｳヱufｴｻｻPﾆｴﾖﾁﾉDR1Y5PX",
      },
    };

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
    expect(
      governanceCapabilitiesContractFingerprintV1(driftedCustody),
    ).not.toBe(fingerprint);
  });
});

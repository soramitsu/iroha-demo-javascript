import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
  GOVERNANCE_REQUIRED_ROUTES,
  parseGovernanceCapabilitiesV1,
  TAIRA_GOVERNANCE_CHAIN_ID,
  TAIRA_GOVERNANCE_TARGET_BODY_SIZES,
} from "../electron/governanceCapabilities";

const capabilities = () => ({
  schema: "iroha.governance.capabilities.v1",
  version: 1,
  chain_id: TAIRA_GOVERNANCE_CHAIN_ID,
  genesis_hash: "11".repeat(32),
  current_height: "42000",
  network_prefix: "369",
  abi_version: "1",
  data_model_version: "3",
  approval_mode: "PARLIAMENT_SORTITION_JIT",
  plain_voting_enabled: true,
  auto_finalize_plain: true,
  citizenship_asset_id: "xor#sora",
  citizenship_bond_amount: "10000",
  voting_asset_id: "xor#sora",
  min_bond_amount: "1",
  conviction_step_blocks: "720",
  max_conviction: "6",
  min_enactment_delay: "600",
  window_span: "3600",
  min_turnout: "1000",
  approval_threshold_numerator: "1",
  approval_threshold_denominator: "2",
  parliament_quorum_bps: "6700",
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
        target_body_sizes: {
          ...capabilities().target_body_sizes,
          fma_committee: "4",
        },
      },
      { ...capabilities(), current_height: "42000blocks" },
      { ...capabilities(), current_height: "042000" },
      { ...capabilities(), current_height: 42_000 },
    ];

    for (const candidate of candidates) {
      expect(() => parseGovernanceCapabilitiesV1(candidate)).toThrow();
    }
  });
});

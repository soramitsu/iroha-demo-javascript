import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CBSI_SBD_ASSET_DEFINITION_ID,
  clearGovernanceValidationFeeFinalityObservations,
  fetchGovernanceValidationFeePolicy,
  readCbsiCoreApiBaseUrl,
  readGovernanceValidationFeeConfig,
  TAIRA_CHAIN_ID,
} from "../electron/governanceValidationFee";

const irohaHash = (byte: string): string => byte.repeat(32);
const plainHash = (byte: string): string => byte.repeat(32);

const policyId = plainHash("22");
const lifecycleId = plainHash("44");
const policyHash = irohaHash("99");
const genesisHash = irohaHash("11");
const checkpointContext = irohaHash("33");
const lifecycleSeal = irohaHash("ab");
const treasury = "sorau-treasury";
const vault = "sorau-vault";
const recipients = [
  "sorau-validator-1",
  "sorau-validator-2",
  "sorau-validator-3",
  "sorau-validator-4",
];

const finalization = (proposalId: string, height: number) => ({
  proposal_id: proposalId,
  referendum_id: proposalId,
  finalized_at_height: String(height),
  mode: "PLAIN",
  approve: "3",
  reject: "1",
  abstain: "0",
  min_turnout: "4",
  approval_threshold_numerator: "1",
  approval_threshold_denominator: "2",
  approved: true,
});

const proposalConfig = (
  proposal_kind: "ValidationFeePolicyV1" | "ValidationFeePayoutLifecycleV1",
  proposal_id: string,
  opens: number,
  closes: number,
  enacted: number,
  finalized: number,
) => ({
  proposal_kind,
  proposal_id,
  payload_hash: proposal_id,
  parliament_roster_root: plainHash("66"),
  enactment_window: {
    opens_at_height: String(opens),
    closes_at_height: String(closes),
    enacted_at_height: String(enacted),
  },
  finalization: finalization(proposal_id, finalized),
});

const enabledConfigJson = () => ({
  enabled: true,
  ledgerBinding: {
    schema: "cbsi.mobile-validation-fee-ledger-binding.v1",
    chainId: TAIRA_CHAIN_ID,
    genesisHash,
    policyChainGenesisHash: policyHash,
    checkpoint: {
      height: 1_000,
      contextId: checkpointContext,
    },
  },
  expected: {
    activePolicyVersion: "1",
    activePolicyHash: policyHash,
    feeAssetDefinitionId: CBSI_SBD_ASSET_DEFINITION_ID,
    feeScale: 2,
    feeMinorUnits: "10",
    chargingMode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    effectiveFromHeight: "122960",
    expiresAfterHeight: null,
    parliament: {
      validationFeePolicy: proposalConfig(
        "ValidationFeePolicyV1",
        policyId,
        1_100,
        2_100,
        2_000,
        1_500,
      ),
      payoutLifecycle: proposalConfig(
        "ValidationFeePayoutLifecycleV1",
        lifecycleId,
        1_000,
        1_900,
        1_800,
        1_400,
      ),
      payoutLifecycleSealHash: lifecycleSeal,
    },
    payout: {
      contractAddress:
        "tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7",
      codeHash: plainHash("aa"),
      entrypoint: "autonomous_validation_fee_tick",
      sbdAssetDefinitionId: CBSI_SBD_ASSET_DEFINITION_ID,
      xorAssetDefinitionId: "62Fk4FPcMuLvW5QjDGNF2a4jAmjM",
      treasuryAccountId: treasury,
      vaultAccountId: vault,
      batchSbdMinorUnits: "1000",
      sbdScale: 2,
      xorOutputMin: "4",
      xorOutputMax: "100",
      recipients: recipients.map((account_id) => ({
        account_id,
        share_basis_points: 2500,
      })),
    },
  },
});

const projectionProposal = (
  value: ReturnType<typeof proposalConfig>,
  lifecycle = false,
) => ({
  proposal_id_hex: value.proposal_id,
  proposal_fingerprint_hex: value.payload_hash,
  parliament_roster_root_hex: value.parliament_roster_root,
  enactment_window: {
    opens_at_height: Number(value.enactment_window.opens_at_height),
    closes_at_height: Number(value.enactment_window.closes_at_height),
    enacted_at_height: Number(value.enactment_window.enacted_at_height),
  },
  finalization: {
    proposal_id_hex: value.finalization.proposal_id,
    referendum_id_hex: value.finalization.referendum_id,
    finalized_at_height: Number(value.finalization.finalized_at_height),
    mode: "PLAIN",
    approve: value.finalization.approve,
    reject: value.finalization.reject,
    abstain: value.finalization.abstain,
    min_turnout: value.finalization.min_turnout,
    approval_threshold_numerator:
      value.finalization.approval_threshold_numerator,
    approval_threshold_denominator:
      value.finalization.approval_threshold_denominator,
    approved: true,
  },
  ...(lifecycle ? { lifecycle_seal_hex: lifecycleSeal } : {}),
});

const projection = (
  overrides: {
    ledgerFinalisedHeight?: number;
    blockHash?: string;
    contextId?: string;
  } = {},
) => {
  const config = enabledConfigJson();
  return {
    schema: "cbsi.validation-fee-ledger-projection.v1",
    authorization_model: "SORA_PARLIAMENT_V1",
    policy_chain_genesis_hash_hex: policyHash,
    policy: {
      schema_version: 1,
      network_id: TAIRA_CHAIN_ID,
      genesis_hash_hex: genesisHash,
      policy_version: 1,
      previous_policy_hash_hex: null,
      policy_hash_hex: policyHash,
      sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      sbd_scale: 2,
      fee: "0.10",
      fee_minor_units: 10,
      treasury_account_id: treasury,
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
      effective_from_height: 122_960,
      expires_after_height: null,
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: {
        contract_address: config.expected.payout.contractAddress,
        contract_subject_account_id: treasury,
        code_hash_hex: config.expected.payout.codeHash,
        entrypoint: "autonomous_validation_fee_tick",
        treasury_account_id: treasury,
        sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
        xor_asset_id: config.expected.payout.xorAssetDefinitionId,
        pool_vault_account_id: vault,
        batch_sbd: "10",
        min_xor_out: "4",
        max_xor_out: "100",
        recipients: recipients.map((account_id) => ({
          account_id,
          share: "0.25",
        })),
        lifecycle_seal_hex: lifecycleSeal,
      },
    },
    parliament_authorization: {
      policy_proposal: projectionProposal(
        config.expected.parliament.validationFeePolicy,
      ),
      payout_lifecycle_proposal: projectionProposal(
        config.expected.parliament.payoutLifecycle,
        true,
      ),
    },
    ledger_finality: {
      ledger_finalised_height: overrides.ledgerFinalisedHeight ?? 123_000,
      block_hash_hex: overrides.blockHash ?? irohaHash("55"),
      ordinary_writes_root_hex: irohaHash("77"),
      context_id_hex: overrides.contextId ?? irohaHash("bb"),
      registry_parameter_id: "iroha:validation_fee_policy_registry_v1",
      validation_fee_snapshot_commitment_hash_hex: irohaHash("dd"),
      registry_snapshot_hash_hex: irohaHash("ff"),
      head_policy_hash_hex: policyHash,
      scheduled_policy_hash_hex: policyHash,
      effective_policy_hash_hex: policyHash,
      checkpoint_height: 1_000,
      checkpoint_context_id_hex: checkpointContext,
      checkpoint_lineage_verified: true,
      registry_inclusion_verified: true,
    },
  };
};

const status = (activeProjection = projection()) => ({
  schema: "cbsi.validation-fee-status.v1",
  authorization_model: "SORA_PARLIAMENT_V1",
  status: "ACTIVE",
  ledger_finalised_height:
    activeProjection.ledger_finality.ledger_finalised_height,
  active_projection: activeProjection,
});

const response = (value: unknown, responseStatus = 200) => ({
  ok: responseStatus >= 200 && responseStatus < 300,
  status: responseStatus,
  json: vi.fn(async () => structuredClone(value)),
});

const coreFetcher = (
  policyValue: unknown = projection(),
  statusValue: unknown = status(policyValue as ReturnType<typeof projection>),
) =>
  vi.fn(async (url: string) =>
    url.endsWith("/policy") ? response(policyValue) : response(statusValue),
  );

afterEach(() => {
  clearGovernanceValidationFeeFinalityObservations();
  vi.restoreAllMocks();
});

describe("governance validation-fee runtime config", () => {
  it("accepts only the exact enabled Taira config", () => {
    const parsed = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );

    expect(parsed.enabled).toBe(true);
    expect(parsed.ledgerBinding.chainId).toBe(TAIRA_CHAIN_ID);
    expect(parsed.expected.feeMinorUnits).toBe("10");
    expect(parsed.expected.parliament.validationFeePolicy).not.toHaveProperty(
      "finalized",
    );
    expect(parsed.expected.parliament.validationFeePolicy).not.toHaveProperty(
      "enactment_block_height",
    );
  });

  it("rejects disabled, unknown, legacy, and invalid-delay fields", () => {
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify({ enabled: false })),
    ).toThrow(/fields must be exactly/);

    const unknown = enabledConfigJson() as Record<string, unknown>;
    unknown.governanceKeysets = [];
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(unknown)),
    ).toThrow(/fields must be exactly/);

    const nestedUnknown = enabledConfigJson();
    Object.assign(nestedUnknown.expected.parliament.validationFeePolicy, {
      finalized: true,
    });
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(nestedUnknown)),
    ).toThrow(/fields must be exactly/);

    const invalidDelay = enabledConfigJson();
    invalidDelay.expected.effectiveFromHeight = "122959";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(invalidDelay)),
    ).toThrow(/exactly 120,960 blocks/);
  });

  it("requires an explicit credential-free HTTPS Core URL", () => {
    expect(() => readCbsiCoreApiBaseUrl("")).toThrow(
      /CBSI_CORE_API_BASE_URL is required/,
    );
    expect(() => readCbsiCoreApiBaseUrl("http://core.example")).toThrow(
      /credential-free HTTPS/,
    );
    expect(() =>
      readCbsiCoreApiBaseUrl("https://user:pass@core.example"),
    ).toThrow(/credential-free HTTPS/);
    expect(readCbsiCoreApiBaseUrl("https://core.example/")).toBe(
      "https://core.example",
    );
  });
});

describe("governance validation-fee Core projection", () => {
  it("requires matching raw policy and status projections and exposes Core proof coordinates", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const fetcher = coreFetcher();

    const view = await fetchGovernanceValidationFeePolicy({
      config,
      coreApiBaseUrl: "https://cbsi-core-taira.soramitsu.io",
      fetcher,
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://cbsi-core-taira.soramitsu.io/v1/validation-fee/policy",
      "https://cbsi-core-taira.soramitsu.io/v1/validation-fee/status",
    ]);
    expect(view).toMatchObject({
      observedHeight: "123000",
      effective: {
        chain_id: TAIRA_CHAIN_ID,
        policy_version: "1",
        policy_hash: policyHash,
        ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
        fee: "0.10",
      },
      registryHead: {
        policyVersion: "1",
        policyHash,
      },
      verifiedProof: {
        schema: "cbsi.validation-fee-ledger-projection.v1",
        authorizationModel: "SORA_PARLIAMENT_V1",
        registrySnapshotHash: irohaHash("ff"),
        finalizedBlockHash: irohaHash("55"),
        finalizedContextId: irohaHash("bb"),
        trustedCheckpointHeight: "1000",
        trustedCheckpointContextId: checkpointContext,
      },
    });
    expect(view.latestEnacted).toBe(view.effective);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.effective)).toBe(true);
  });

  it("starts both Core reads before either response resolves", async () => {
    let resolvePolicy!: (value: ReturnType<typeof response>) => void;
    let resolveStatus!: (value: ReturnType<typeof response>) => void;
    const fetcher = vi.fn(
      (url: string) =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          if (url.endsWith("/policy")) resolvePolicy = resolve;
          else resolveStatus = resolve;
        }),
    );
    const pending = fetchGovernanceValidationFeePolicy({
      config: readGovernanceValidationFeeConfig(
        JSON.stringify(enabledConfigJson()),
      ),
      coreApiBaseUrl: "https://core.example",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const current = projection();
    resolvePolicy(response(current));
    resolveStatus(response(status(current)));
    await expect(pending).resolves.toMatchObject({
      observedHeight: "123000",
    });
  });

  it("rejects endpoint disagreement, unknown projection fields, and runtime mismatch", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const changedStatusProjection = projection({
      blockHash: irohaHash("57"),
    });
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(projection(), status(changedStatusProjection)),
      }),
    ).rejects.toThrow(/different active projections/);

    const unknownProjection = {
      ...projection(),
      signed_policy: {},
    };
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(
          unknownProjection,
          status(unknownProjection as never),
        ),
      }),
    ).rejects.toThrow(/fields must be exactly/);

    const mismatched = projection();
    mismatched.policy.treasury_account_id = "sorau-other-treasury";
    mismatched.policy.treasury_payout_binding.treasury_account_id =
      "sorau-other-treasury";
    mismatched.policy.treasury_payout_binding.contract_subject_account_id =
      "sorau-other-treasury";
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(mismatched, status(mismatched)),
      }),
    ).rejects.toThrow(/does not exactly match runtime/);
  });

  it("rejects HTTP failure without returning a stale projection", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/policy") ? response({}, 503) : response(status()),
    );

    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher,
      }),
    ).rejects.toThrow(/read failed \(503\)/);
  });

  it("rejects finalized rollback and same-coordinate equivocation", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const first = projection({ ledgerFinalisedHeight: 123_010 });
    await fetchGovernanceValidationFeePolicy({
      config,
      coreApiBaseUrl: "https://core.example",
      fetcher: coreFetcher(first, status(first)),
    });
    const rollback = projection({ ledgerFinalisedHeight: 123_009 });
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(rollback, status(rollback)),
      }),
    ).rejects.toThrow(/regressed behind/);

    clearGovernanceValidationFeeFinalityObservations();
    const stable = projection();
    await fetchGovernanceValidationFeePolicy({
      config,
      coreApiBaseUrl: "https://core.example",
      fetcher: coreFetcher(stable, status(stable)),
    });
    const equivocation = projection({ contextId: irohaHash("bd") });
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(equivocation, status(equivocation)),
      }),
    ).rejects.toThrow(/equivocated/);
  });
});

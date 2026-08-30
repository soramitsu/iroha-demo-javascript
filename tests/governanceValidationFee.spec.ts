import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOVERNANCE_RUNTIME_CONFIG_FILENAME,
  GOVERNANCE_RUNTIME_CONFIG_SCHEMA,
  governanceRuntimeConfigPath,
  loadGovernanceRuntimeConfig,
} from "../electron/governanceRuntimeConfig";
import {
  CBSI_CORE_API_BASE_URL_ENV,
  CBSI_SBD_ASSET_DEFINITION_ID,
  CBSI_XOR_ASSET_DEFINITION_ID,
  fetchGovernanceValidationFeePolicy as fetchGovernanceValidationFeePolicyWithoutDurableGuard,
  GOVERNANCE_VALIDATION_FEE_CONFIG_ENV,
  readCbsiCoreApiBaseUrl,
  readGovernanceValidationFeeConfig,
  TAIRA_CHAIN_ID,
  VALIDATION_FEE_PAYOUT_CONTRACT_ADDRESS,
  VALIDATION_FEE_PAYOUT_CONTRACT_SUBJECT_ACCOUNT_ID,
} from "../electron/governanceValidationFee";
import {
  GovernanceValidationFeeFinalityStore,
  deriveGovernanceValidationFeeImmutableLedgerScope,
  fetchGovernanceValidationFeePolicyInMain,
} from "../electron/governanceValidationFeeFinality";

const irohaHash = (byte: string): string => byte.repeat(32);
const plainHash = (byte: string): string => byte.repeat(32);

const policyId = plainHash("22");
const lifecycleId = plainHash("44");
const policyHash = irohaHash("99");
const genesisHash = irohaHash("11");
const checkpointContext = irohaHash("33");
const lifecycleSeal = irohaHash("ab");
const treasury = VALIDATION_FEE_PAYOUT_CONTRACT_SUBJECT_ACCOUNT_ID;
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
  approve: "72",
  reject: "0",
  abstain: "0",
  min_turnout: "1",
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
    effectiveFromHeight: "123062",
    expiresAfterHeight: null,
    parliament: {
      validationFeePolicy: proposalConfig(
        "ValidationFeePolicyV1",
        policyId,
        2_000,
        2_100,
        2_102,
        2_100,
      ),
      payoutLifecycle: proposalConfig(
        "ValidationFeePayoutLifecycleV1",
        lifecycleId,
        80,
        170,
        1_970,
        170,
      ),
      payoutLifecycleSealHash: lifecycleSeal,
    },
    payout: {
      contractAddress: VALIDATION_FEE_PAYOUT_CONTRACT_ADDRESS,
      codeHash: plainHash("aa"),
      entrypoint: "autonomous_validation_fee_tick",
      sbdAssetDefinitionId: CBSI_SBD_ASSET_DEFINITION_ID,
      xorAssetDefinitionId: CBSI_XOR_ASSET_DEFINITION_ID,
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

const runtimeConfigManifest = () => ({
  schema: GOVERNANCE_RUNTIME_CONFIG_SCHEMA,
  validationFee: enabledConfigJson(),
  cbsiCoreApiBaseUrl: "https://cbsi-core.soramitsu.io",
});

const canonicalTemporaryDirectory = (prefix: string): string =>
  realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));

const withRuntimeConfigDirectory = (
  test: (userDataPath: string) => void,
): void => {
  const userDataPath = canonicalTemporaryDirectory(
    "sora-wallet-governance-runtime-",
  );
  try {
    test(userDataPath);
  } finally {
    rmSync(userDataPath, { recursive: true, force: true });
  }
};

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
      effective_from_height: 123_062,
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
      ledger_finalised_height: overrides.ledgerFinalisedHeight ?? 126_000,
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

const fetchGovernanceValidationFeePolicy = (
  input: Omit<
    Parameters<typeof fetchGovernanceValidationFeePolicyWithoutDurableGuard>[0],
    "promoteFinality"
  >,
) =>
  fetchGovernanceValidationFeePolicyWithoutDurableGuard({
    ...input,
    promoteFinality: () => undefined,
  });

afterEach(() => {
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

    const laterPostWindowEnactment = enabledConfigJson();
    laterPostWindowEnactment.expected.parliament.validationFeePolicy.enactment_window.enacted_at_height =
      "2103";
    laterPostWindowEnactment.expected.effectiveFromHeight = "123063";
    expect(() =>
      readGovernanceValidationFeeConfig(
        JSON.stringify(laterPostWindowEnactment),
      ),
    ).not.toThrow();
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
    invalidDelay.expected.effectiveFromHeight = "123061";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(invalidDelay)),
    ).toThrow(/exactly 120,960 blocks/);

    const excessiveDelay = enabledConfigJson();
    excessiveDelay.expected.effectiveFromHeight = "123063";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(excessiveDelay)),
    ).toThrow(/exactly 120,960 blocks/);

    const enactmentAtFinalization = enabledConfigJson();
    enactmentAtFinalization.expected.parliament.validationFeePolicy.enactment_window.enacted_at_height =
      "2100";
    enactmentAtFinalization.expected.effectiveFromHeight = "123060";
    expect(() =>
      readGovernanceValidationFeeConfig(
        JSON.stringify(enactmentAtFinalization),
      ),
    ).toThrow(/enact strictly later/);

    for (const finalizedAtHeight of ["1999", "2101"]) {
      const outsideReferendum = enabledConfigJson();
      outsideReferendum.expected.parliament.validationFeePolicy.finalization.finalized_at_height =
        finalizedAtHeight;
      expect(() =>
        readGovernanceValidationFeeConfig(JSON.stringify(outsideReferendum)),
      ).toThrow(/inside its inclusive referendum window/);
    }

    const lifecycleAfterPolicy = enabledConfigJson();
    const lifecycle = lifecycleAfterPolicy.expected.parliament.payoutLifecycle;
    lifecycle.enactment_window.opens_at_height = "3101";
    lifecycle.enactment_window.closes_at_height = "3102";
    lifecycle.finalization.finalized_at_height = "3102";
    lifecycle.enactment_window.enacted_at_height = "4902";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(lifecycleAfterPolicy)),
    ).toThrow(/Payout-lifecycle enactment must not follow policy enactment/);

    const wrongPlainRules = enabledConfigJson();
    wrongPlainRules.expected.parliament.validationFeePolicy.finalization.min_turnout =
      "2";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(wrongPlainRules)),
    ).toThrow(/exact first-release PLAIN/);

    const retiredContractAddress = enabledConfigJson();
    retiredContractAddress.expected.payout.contractAddress =
      "tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(retiredContractAddress)),
    ).toThrow(/first-release payout contract/);

    const wrongContractSubject = enabledConfigJson();
    wrongContractSubject.expected.payout.treasuryAccountId = "sorau-treasury";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(wrongContractSubject)),
    ).toThrow(/first-release payout contract/);

    const genericXorFixture = enabledConfigJson();
    genericXorFixture.expected.payout.xorAssetDefinitionId =
      "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(genericXorFixture)),
    ).toThrow(/first-release payout contract/);

    const maximumWidthTally = enabledConfigJson();
    const maximumU128 = ((1n << 128n) - 1n).toString();
    maximumWidthTally.expected.parliament.validationFeePolicy.finalization.approve =
      maximumU128;
    expect(
      readGovernanceValidationFeeConfig(JSON.stringify(maximumWidthTally))
        .expected.parliament.validationFeePolicy.finalization.approve,
    ).toBe(maximumU128);
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

describe("packaged governance runtime config", () => {
  it("loads the strict versioned manifest from the Electron user-data path", () => {
    withRuntimeConfigDirectory((userDataPath) => {
      const path = join(userDataPath, GOVERNANCE_RUNTIME_CONFIG_FILENAME);
      writeFileSync(path, JSON.stringify(runtimeConfigManifest()), "utf8");

      const loaded = loadGovernanceRuntimeConfig({
        userDataPath,
        env: {},
      });

      expect(governanceRuntimeConfigPath(userDataPath)).toBe(path);
      expect(loaded.validationFee.enabled).toBe(true);
      expect(loaded.validationFee.ledgerBinding.chainId).toBe(TAIRA_CHAIN_ID);
      expect(loaded.cbsiCoreApiBaseUrl).toBe("https://cbsi-core.soramitsu.io");
    });
  });

  it("uses only a complete strict environment override and never mixes sources", () => {
    withRuntimeConfigDirectory((userDataPath) => {
      writeFileSync(
        governanceRuntimeConfigPath(userDataPath),
        "invalid file intentionally ignored by a complete override",
        "utf8",
      );
      const loaded = loadGovernanceRuntimeConfig({
        userDataPath,
        env: {
          [GOVERNANCE_VALIDATION_FEE_CONFIG_ENV]:
            JSON.stringify(enabledConfigJson()),
          [CBSI_CORE_API_BASE_URL_ENV]: "https://override-core.soramitsu.io/",
        },
      });
      expect(loaded.cbsiCoreApiBaseUrl).toBe(
        "https://override-core.soramitsu.io",
      );

      expect(() =>
        loadGovernanceRuntimeConfig({
          userDataPath,
          env: {
            [GOVERNANCE_VALIDATION_FEE_CONFIG_ENV]:
              JSON.stringify(enabledConfigJson()),
          },
        }),
      ).toThrow(/must be set together; refusing to mix/);
      expect(() =>
        loadGovernanceRuntimeConfig({
          userDataPath,
          env: {
            [GOVERNANCE_VALIDATION_FEE_CONFIG_ENV]: "",
            [CBSI_CORE_API_BASE_URL_ENV]: "https://override-core.soramitsu.io",
          },
        }),
      ).toThrow(/environment override is invalid/);
    });
  });

  it("rejects unknown wrapper fields and invalid nested trust inputs", () => {
    withRuntimeConfigDirectory((userDataPath) => {
      const path = governanceRuntimeConfigPath(userDataPath);
      writeFileSync(
        path,
        JSON.stringify({ ...runtimeConfigManifest(), legacyPolicy: {} }),
        "utf8",
      );
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(/fields must be exactly/);

      const invalidNested = runtimeConfigManifest();
      Object.assign(invalidNested.validationFee, {
        governanceKeysets: [],
      });
      writeFileSync(path, JSON.stringify(invalidNested), "utf8");
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(/fields must be exactly/);

      const invalidUrl = runtimeConfigManifest();
      invalidUrl.cbsiCoreApiBaseUrl = "http://cbsi-core.soramitsu.io";
      writeFileSync(path, JSON.stringify(invalidUrl), "utf8");
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(/credential-free HTTPS/);
    });
  });

  it("fails closed when missing and reloads the manifest instead of serving stale values", () => {
    withRuntimeConfigDirectory((userDataPath) => {
      const path = governanceRuntimeConfigPath(userDataPath);
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(new RegExp(GOVERNANCE_RUNTIME_CONFIG_FILENAME));

      const first = runtimeConfigManifest();
      writeFileSync(path, JSON.stringify(first), "utf8");
      expect(
        loadGovernanceRuntimeConfig({ userDataPath, env: {} })
          .cbsiCoreApiBaseUrl,
      ).toBe("https://cbsi-core.soramitsu.io");

      const second = runtimeConfigManifest();
      second.cbsiCoreApiBaseUrl = "https://replacement-core.soramitsu.io";
      writeFileSync(path, JSON.stringify(second), "utf8");
      expect(
        loadGovernanceRuntimeConfig({ userDataPath, env: {} })
          .cbsiCoreApiBaseUrl,
      ).toBe("https://replacement-core.soramitsu.io");

      writeFileSync(path, "{", "utf8");
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(/not valid JSON/);
    });
  });
});

describe("governance validation-fee Core projection", () => {
  it("accepts an explicit post-window enactment with the exact activation delay", async () => {
    const configJson = enabledConfigJson();
    configJson.expected.parliament.validationFeePolicy.enactment_window.enacted_at_height =
      "2103";
    configJson.expected.effectiveFromHeight = "123063";
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(configJson),
    );
    const current = projection();
    current.parliament_authorization.policy_proposal.enactment_window.enacted_at_height = 2_103;
    current.policy.effective_from_height = 123_063;

    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(current, status(current)),
      }),
    ).resolves.toMatchObject({ observedHeight: "126000" });
  });

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
      observedHeight: "126000",
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
      observedHeight: "126000",
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

    for (const finalizedAtHeight of [1_999, 2_101]) {
      const outsideReferendum = projection();
      outsideReferendum.parliament_authorization.policy_proposal.finalization.finalized_at_height =
        finalizedAtHeight;
      await expect(
        fetchGovernanceValidationFeePolicy({
          config,
          coreApiBaseUrl: "https://core.example",
          fetcher: coreFetcher(outsideReferendum, status(outsideReferendum)),
        }),
      ).rejects.toThrow(/inside its inclusive referendum window/);
    }

    const enactmentAtFinalization = projection();
    enactmentAtFinalization.parliament_authorization.policy_proposal.enactment_window.enacted_at_height = 2_100;
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(
          enactmentAtFinalization,
          status(enactmentAtFinalization),
        ),
      }),
    ).rejects.toThrow(/enact strictly later/);

    const mismatched = projection();
    mismatched.policy.treasury_payout_binding.pool_vault_account_id =
      "sorau-other-vault";
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

  it("requires and awaits main-process durable promotion before returning policy", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    await expect(
      fetchGovernanceValidationFeePolicyWithoutDurableGuard({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(),
        promoteFinality: undefined as never,
      }),
    ).rejects.toThrow(/main-process durable finality promoter/);

    let releasePromotion!: () => void;
    const promotionGate = new Promise<void>((resolve) => {
      releasePromotion = resolve;
    });
    const promoteFinality = vi.fn(async () => promotionGate);
    let returned = false;
    const pending = fetchGovernanceValidationFeePolicyWithoutDurableGuard({
      config,
      coreApiBaseUrl: "https://core.example",
      fetcher: coreFetcher(),
      promoteFinality,
    }).then((value) => {
      returned = true;
      return value;
    });
    await vi.waitFor(() => expect(promoteFinality).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    expect(promoteFinality).toHaveBeenCalledWith({
      ledgerFinalisedHeight: 126_000,
      contextId: irohaHash("bb"),
      blockHash: irohaHash("55"),
      policyVersion: 1,
      policyHash,
      projectionHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    releasePromotion();
    await expect(pending).resolves.toMatchObject({ observedHeight: "126000" });
  });

  it("preserves one immutable ledger watermark across Core failover", async () => {
    const userDataPath = canonicalTemporaryDirectory(
      "sora-wallet-governance-finality-failover-",
    );
    try {
      const config = readGovernanceValidationFeeConfig(
        JSON.stringify(enabledConfigJson()),
      );
      const store = new GovernanceValidationFeeFinalityStore(userDataPath);
      const first = projection({ ledgerFinalisedHeight: 126_010 });
      await fetchGovernanceValidationFeePolicyInMain({
        runtimeConfig: {
          validationFee: config,
          cbsiCoreApiBaseUrl: "https://core-primary.example",
        },
        finalityStore: store,
        fetcher: coreFetcher(first, status(first)),
      });

      const rollback = projection({ ledgerFinalisedHeight: 126_009 });
      await expect(
        fetchGovernanceValidationFeePolicyInMain({
          runtimeConfig: {
            validationFee: config,
            cbsiCoreApiBaseUrl: "https://core-failover.example/tenant-b",
          },
          finalityStore: store,
          fetcher: coreFetcher(rollback, status(rollback)),
        }),
      ).rejects.toThrow(/regressed behind a previously verified durable state/);
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("derives scope only from immutable ledger identity", () => {
    const first = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const refreshed = structuredClone(first);
    refreshed.ledgerBinding.checkpoint.height = 1_001;
    refreshed.ledgerBinding.checkpoint.contextId = irohaHash("35");
    refreshed.expected.parliament.validationFeePolicy.finalization.approve =
      "73";

    const firstScope = deriveGovernanceValidationFeeImmutableLedgerScope(first);
    const refreshedScope =
      deriveGovernanceValidationFeeImmutableLedgerScope(refreshed);
    expect(refreshedScope).toBe(firstScope);

    const userDataPath = canonicalTemporaryDirectory(
      "sora-wallet-governance-finality-refresh-",
    );
    try {
      const store = new GovernanceValidationFeeFinalityStore(userDataPath);
      store.verifyAndPromote(firstScope, {
        ledgerFinalisedHeight: 126_010,
        contextId: irohaHash("bb"),
        blockHash: irohaHash("55"),
        policyVersion: 1,
        policyHash,
        projectionHash: plainHash("ab"),
      });
      expect(() =>
        store.verifyAndPromote(refreshedScope, {
          ledgerFinalisedHeight: 126_009,
          contextId: irohaHash("bd"),
          blockHash: irohaHash("57"),
          policyVersion: 1,
          policyHash,
          projectionHash: plainHash("ad"),
        }),
      ).toThrow(/regressed behind a previously verified durable state/);
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }

    const otherLedger = structuredClone(first);
    otherLedger.ledgerBinding.genesisHash = irohaHash("13");
    expect(
      deriveGovernanceValidationFeeImmutableLedgerScope(otherLedger),
    ).not.toBe(deriveGovernanceValidationFeeImmutableLedgerScope(first));
  });
});

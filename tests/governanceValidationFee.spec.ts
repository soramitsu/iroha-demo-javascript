import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOVERNANCE_RUNTIME_CONFIG_FILENAME,
  GOVERNANCE_RUNTIME_CONFIG_SCHEMA,
  MAX_RUNTIME_CONFIG_BYTES,
  governanceRuntimeConfigPath,
  loadGovernanceRuntimeConfig,
} from "../electron/governanceRuntimeConfig";
import {
  CBSI_CORE_API_BASE_URL_ENV,
  CBSI_SBD_ASSET_DEFINITION_ID,
  fetchGovernanceValidationFeePolicy as fetchGovernanceValidationFeePolicyWithoutDurableGuard,
  GOVERNANCE_VALIDATION_FEE_CONFIG_ENV,
  MAX_VALIDATION_FEE_CONFIG_BYTES,
  readCbsiCoreApiBaseUrl,
  readGovernanceValidationFeeConfig,
} from "../electron/governanceValidationFee";
import {
  GovernanceValidationFeeFinalityStore,
  deriveGovernanceValidationFeeImmutableLedgerScope,
  fetchGovernanceValidationFeePolicyInMain,
} from "../electron/governanceValidationFeeFinality";
import { parseNetworkIdLiteral } from "../src/utils/networkIdentity";
import {
  CONTRACT_ADDRESS,
  EFFECTIVE_FROM_MS,
  NOTICE_PUBLISHED_AT_MS,
  POOL_CONTRACT_ADDRESS,
  POOL_VAULT_ACCOUNT_ID,
  PROPOSAL_OPERATOR,
  REFERENCE_PROVIDER_ACCOUNT_IDS,
  REWARD_POOL_ACCOUNT_ID,
  TREASURY_ACCOUNT_ID,
  XOR_ASSET_ID,
  retailSchedule,
} from "./helpers/validationFeeFixtures";

const irohaHash = (byte: string): string => byte.repeat(32);
const plainHash = (byte: string): string => byte.repeat(32);

const policyFingerprint = plainHash("22");
const lifecycleFingerprint = plainHash("44");
const policyHash = irohaHash("99");
const genesisHash = irohaHash("11");
const checkpointContext = irohaHash("33");
/** Opaque canonical Base64 stand-in for Core's verified native checkpoint. */
const checkpointBase64 = Buffer.from("native-finality-checkpoint").toString(
  "base64",
);
const lifecycleSeal = irohaHash("ab");
const POLICY_ENACTED_AT_HEIGHT = 2_102;
const LIFECYCLE_ENACTED_AT_HEIGHT = 1_970;
const FINALIZED_AT_MS = EFFECTIVE_FROM_MS + 86_400_000;

const enabledConfigJson = () => ({
  enabled: true,
  ledgerBinding: {
    schema: "cbsi.mobile-validation-fee-ledger-binding.v2",
    networkId: parseNetworkIdLiteral(genesisHash),
    genesisHash,
    policyChainGenesisHash: policyHash,
    checkpoint: {
      height: 1_000,
      contextId: checkpointContext,
      canonicalBase64: checkpointBase64,
    },
  },
  expected: {
    rewardCustody: {
      contractAddress: CONTRACT_ADDRESS,
      treasuryAccountId: TREASURY_ACCOUNT_ID,
      xorAssetDefinitionId: XOR_ASSET_ID,
      rewardPoolAccountId: REWARD_POOL_ACCOUNT_ID,
      validatorLaneId: 0,
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

/** Native `GovernanceCertificateV1` JSON shape (only binding fields matter). */
const certificate = (fingerprint: string, enactedAtHeight: number) => ({
  proposal_content_id: fingerprint,
  governance_attempt_id: plainHash("61"),
  governance_attempt_sequence: 1,
  risk_tier: { tier: "Standard" },
  body_bindings: [],
  policy_version: 1,
  effect_preimage_hash: plainHash("62"),
  expected_head: { present: false },
  certified_at_height: enactedAtHeight - 2,
  enact_at_height: enactedAtHeight,
});

const authority = (fingerprint: string, enactedAtHeight: number) => ({
  proposal_operator: PROPOSAL_OPERATOR,
  proposal_fingerprint_hex: fingerprint,
  governance_certificate_id_hex: plainHash("66"),
  governance_certificate: certificate(fingerprint, enactedAtHeight),
  enacted_at_height: enactedAtHeight,
});

const projection = (
  overrides: {
    ledgerFinalisedHeight?: number;
    blockHash?: string;
    contextId?: string;
  } = {},
) => ({
  schema: "cbsi.validation-fee-ledger-projection.v1",
  authorization_model: "SORA_PARLIAMENT_V1",
  policy_chain_genesis_hash_hex: policyHash,
  policy: {
    schema_version: 1,
    network_id: parseNetworkIdLiteral(genesisHash),
    genesis_hash_hex: genesisHash,
    policy_version: 1,
    previous_policy_hash_hex: null as string | null,
    policy_hash_hex: policyHash,
    sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
    sbd_scale: 2,
    fee: "0.10",
    fee_minor_units: 10,
    treasury_account_id: TREASURY_ACCOUNT_ID,
    charging_mode: "RETAIL_MONTHLY_ALLOWANCE",
    effective_from_height: POLICY_ENACTED_AT_HEIGHT + 1,
    effective_from_ms: EFFECTIVE_FROM_MS,
    notice_published_at_ms: NOTICE_PUBLISHED_AT_MS,
    retail_schedule: retailSchedule(),
    exemption_classes: ["TREASURY_PAYOUT"],
    reward_custody: {
      contract_address: CONTRACT_ADDRESS,
      treasury_account_id: TREASURY_ACCOUNT_ID,
      sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      xor_asset_id: XOR_ASSET_ID,
      reward_pool_account_id: REWARD_POOL_ACCOUNT_ID,
      validator_lane_id: 0,
    },
  },
  parliament_authorization: authority(
    policyFingerprint,
    POLICY_ENACTED_AT_HEIGHT,
  ),
  conversion_policy: {
    revision: 1,
    binding: {
      contract_address: CONTRACT_ADDRESS,
      contract_subject_account_id: TREASURY_ACCOUNT_ID,
      code_hash_hex: plainHash("34"),
      entrypoint: "autonomous_validation_fee_tick",
      treasury_account_id: TREASURY_ACCOUNT_ID,
      sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
      xor_asset_id: XOR_ASSET_ID,
      pool_contract_address: POOL_CONTRACT_ADDRESS,
      pool_code_hash_hex: plainHash("36"),
      pool_vault_account_id: POOL_VAULT_ACCOUNT_ID,
      reward_pool_account_id: REWARD_POOL_ACCOUNT_ID,
      reference_feed_id: "xor_per_sbd",
      reference_feed_config_version: 1,
      reference_provider_accounts: [...REFERENCE_PROVIDER_ACCOUNT_IDS],
      max_sbd_per_attempt_minor: 1_000,
      max_sbd_per_day_minor: 100_000,
      min_interval_ms: 60_000,
      max_source_age_ms: 300_000,
      max_slippage_bps: 100,
      validator_lane_id: 0,
      min_reward_claim_xor_minor: 1,
    },
    authority: {
      ...authority(lifecycleFingerprint, LIFECYCLE_ENACTED_AT_HEIGHT),
      lifecycle_seal_hex: lifecycleSeal,
    },
  },
  ledger_finality: {
    ledger_finalised_height: overrides.ledgerFinalisedHeight ?? 126_000,
    block_timestamp_ms: FINALIZED_AT_MS,
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
});

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
  arrayBuffer: vi.fn(
    async () =>
      Uint8Array.from(Buffer.from(JSON.stringify(value), "utf8")).buffer,
  ),
});

const rawResponse = (serialized: string, responseStatus = 200) => ({
  ok: responseStatus >= 200 && responseStatus < 300,
  status: responseStatus,
  arrayBuffer: vi.fn(
    async () => Uint8Array.from(Buffer.from(serialized, "utf8")).buffer,
  ),
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
    expect(parsed.ledgerBinding).toEqual(enabledConfigJson().ledgerBinding);
    expect(parsed.ledgerBinding.networkId).toBe(
      parseNetworkIdLiteral(genesisHash),
    );
    expect(parsed.expected).toEqual(enabledConfigJson().expected);
  });

  it("accepts only the exact CBSI Core v2 ledger binding", () => {
    const retiredV1 = enabledConfigJson() as {
      ledgerBinding: Record<string, unknown>;
    };
    retiredV1.ledgerBinding = {
      schema: "cbsi.mobile-validation-fee-ledger-binding.v1",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      genesisHash,
      policyChainGenesisHash: policyHash,
      checkpoint: { height: 1_000, contextId: checkpointContext },
    };
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(retiredV1)),
    ).toThrow(/fields must be exactly/);

    const v1Schema = enabledConfigJson();
    v1Schema.ledgerBinding.schema =
      "cbsi.mobile-validation-fee-ledger-binding.v1";
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(v1Schema)),
    ).toThrow(/ledger-binding\.v2/);

    const missingCheckpointBytes = enabledConfigJson() as {
      ledgerBinding: { checkpoint: Record<string, unknown> };
    };
    delete missingCheckpointBytes.ledgerBinding.checkpoint.canonicalBase64;
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(missingCheckpointBytes)),
    ).toThrow(/checkpoint fields must be exactly/);

    for (const networkId of [
      parseNetworkIdLiteral(irohaHash("13")),
      genesisHash,
      `hash:${genesisHash}`,
      `${parseNetworkIdLiteral(genesisHash)} `,
    ]) {
      const mismatched = enabledConfigJson();
      mismatched.ledgerBinding.networkId = networkId;
      expect(() =>
        readGovernanceValidationFeeConfig(JSON.stringify(mismatched)),
      ).toThrow(/networkId must be the canonical NetworkId/);
    }

    for (const canonicalBase64 of [
      "",
      "QQ",
      "QR==",
      "QQ==\n",
      " QQ==",
      "QQ=A",
      "-_8=",
    ]) {
      const invalid = enabledConfigJson();
      invalid.ledgerBinding.checkpoint.canonicalBase64 = canonicalBase64;
      expect(() =>
        readGovernanceValidationFeeConfig(JSON.stringify(invalid)),
      ).toThrow(/canonicalBase64 must be canonical standard Base64/);
    }
  });

  it("bounds the checkpoint by the native 68 MiB checkpoint limit", () => {
    const oversized = enabledConfigJson();
    oversized.ledgerBinding.checkpoint.canonicalBase64 = "A".repeat(
      4 * Math.ceil((68 * 1024 * 1024) / 3) + 4,
    );
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(oversized)),
    ).toThrow(/canonicalBase64 must be canonical standard Base64/);
  }, 120_000);

  it("rejects ambiguous and oversized runtime config JSON", () => {
    const serialized = JSON.stringify(enabledConfigJson());
    expect(() =>
      readGovernanceValidationFeeConfig(
        serialized.replace('"enabled":true', '"enabled":true,"enabled":true'),
      ),
    ).toThrow(/valid JSON/);
    expect(() =>
      readGovernanceValidationFeeConfig(
        `${serialized}${" ".repeat(MAX_VALIDATION_FEE_CONFIG_BYTES)}`,
      ),
    ).toThrow(/exceeds/);
  });

  it("rejects disabled, unknown, retired policy pins, and invalid custody", () => {
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify({ enabled: false })),
    ).toThrow(/fields must be exactly/);

    const unknown = enabledConfigJson() as Record<string, unknown>;
    unknown.governanceKeysets = [];
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(unknown)),
    ).toThrow(/fields must be exactly/);

    for (const retiredPin of [
      { activePolicyVersion: "1" },
      { activePolicyHash: policyHash },
      { feeMinorUnits: "10" },
      { chargingMode: "PER_QUALIFYING_TRANSFER_INSTRUCTION" },
      { effectiveFromHeight: "123062" },
      { expiresAfterHeight: null },
      { parliament: {} },
      { payout: {} },
    ]) {
      const retired = enabledConfigJson();
      Object.assign(retired.expected, retiredPin);
      expect(() =>
        readGovernanceValidationFeeConfig(JSON.stringify(retired)),
      ).toThrow(/fields must be exactly/);
    }

    const nestedUnknown = enabledConfigJson();
    Object.assign(nestedUnknown.expected.rewardCustody, {
      poolVaultAccountId: POOL_VAULT_ACCOUNT_ID,
    });
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(nestedUnknown)),
    ).toThrow(/fields must be exactly/);

    const sharedCustody = enabledConfigJson();
    sharedCustody.expected.rewardCustody.rewardPoolAccountId =
      TREASURY_ACCOUNT_ID;
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(sharedCustody)),
    ).toThrow(/distinct treasury and reward pool/);

    const sbdReward = enabledConfigJson();
    sbdReward.expected.rewardCustody.xorAssetDefinitionId =
      CBSI_SBD_ASSET_DEFINITION_ID;
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(sbdReward)),
    ).toThrow(/distinct SBD and XOR/);

    for (const validatorLaneId of [-1, 0x1_0000_0000, 1.5, "0"]) {
      const invalidLane = enabledConfigJson() as {
        expected: { rewardCustody: Record<string, unknown> };
      };
      invalidLane.expected.rewardCustody.validatorLaneId = validatorLaneId;
      expect(() =>
        readGovernanceValidationFeeConfig(JSON.stringify(invalidLane)),
      ).toThrow(/validatorLaneId/);
    }

    const uppercaseGenesis = enabledConfigJson();
    uppercaseGenesis.ledgerBinding.genesisHash = irohaHash("ab").toUpperCase();
    expect(() =>
      readGovernanceValidationFeeConfig(JSON.stringify(uppercaseGenesis)),
    ).toThrow(/genesisHash/);
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
      expect(loaded.validationFee.ledgerBinding).toEqual(
        enabledConfigJson().ledgerBinding,
      );
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

  it("bounds the descriptor read by the checkpoint-sized manifest limit", () => {
    // The limit leaves room for Core's Base64 native checkpoint (68 MiB).
    expect(MAX_RUNTIME_CONFIG_BYTES).toBeGreaterThan(
      Math.ceil((68 * 1024 * 1024) / 3) * 4,
    );
    withRuntimeConfigDirectory((userDataPath) => {
      const path = governanceRuntimeConfigPath(userDataPath);
      writeFileSync(path, "");
      // Sparse file: the size check rejects it before any byte is read.
      truncateSync(path, MAX_RUNTIME_CONFIG_BYTES + 1);
      expect(() =>
        loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
      ).toThrow(new RegExp(`exceeds ${MAX_RUNTIME_CONFIG_BYTES} bytes`, "u"));
    });
  });

  it.runIf(process.platform !== "win32")(
    "refuses indirect runtime manifests",
    () => {
      withRuntimeConfigDirectory((userDataPath) => {
        const path = governanceRuntimeConfigPath(userDataPath);
        const target = join(userDataPath, "runtime-target.json");
        writeFileSync(target, JSON.stringify(runtimeConfigManifest()), "utf8");
        symlinkSync(target, path);
        expect(() =>
          loadGovernanceRuntimeConfig({ userDataPath, env: {} }),
        ).toThrow(/could not be read|symbolic|link|ELOOP/u);
      });
    },
  );
});

describe("governance validation-fee Core projection", () => {
  it("rejects ambiguous, invalid-UTF8, and oversized Core JSON", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const duplicateProjection = JSON.stringify(projection()).replace(
      '"schema":"cbsi.validation-fee-ledger-projection.v1"',
      '"schema":"cbsi.validation-fee-ledger-projection.v1","schema":"cbsi.validation-fee-ledger-projection.v1"',
    );
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: vi.fn(async (url: string) =>
          url.endsWith("/policy")
            ? rawResponse(duplicateProjection)
            : response(status()),
        ),
      }),
    ).rejects.toThrow(/bounded, strict UTF-8 JSON/);

    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: vi.fn(async (url: string) =>
          url.endsWith("/policy")
            ? {
                ok: true,
                status: 200,
                arrayBuffer: vi.fn(async () => Uint8Array.from([0xff]).buffer),
              }
            : response(status()),
        ),
      }),
    ).rejects.toThrow(/bounded, strict UTF-8 JSON/);

    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: vi.fn(async (url: string) =>
          url.endsWith("/policy")
            ? rawResponse(`{}${" ".repeat(4 * 1024 * 1024)}`)
            : response(status()),
        ),
      }),
    ).rejects.toThrow(/bounded, strict UTF-8 JSON/);
  });

  it("requires matching raw policy and status projections and exposes the native policy", async () => {
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
    expect(view).toEqual({
      observedHeight: "126000",
      observedAtMs: FINALIZED_AT_MS,
      effective: {
        schema_version: 1,
        // The effective policy NetworkId is the bound ledger genesis hash.
        network_id: parseNetworkIdLiteral(genesisHash),
        policy_version: "1",
        previous_policy_hash: null,
        ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
        ds_scale: 2,
        retail_schedule: retailSchedule(),
        effective_from_ms: EFFECTIVE_FROM_MS,
        notice_published_at_ms: NOTICE_PUBLISHED_AT_MS,
        fee: "0.1",
        treasury_account_id: TREASURY_ACCOUNT_ID,
        charging_mode: {
          charging_mode: "RETAIL_MONTHLY_ALLOWANCE",
          value: null,
        },
        exemption_classes: ["TREASURY_PAYOUT"],
        reward_custody: {
          contract_address: CONTRACT_ADDRESS,
          treasury_account_id: TREASURY_ACCOUNT_ID,
          ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
          xor_asset_id: XOR_ASSET_ID,
          reward_pool_account_id: REWARD_POOL_ACCOUNT_ID,
          validator_lane_id: 0,
        },
      },
      effectivePolicyHash: policyHash,
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
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.effective)).toBe(true);
  });

  it("projects a later revision with an uppercase native predecessor hash", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const revised = projection();
    revised.policy.policy_version = 2;
    revised.policy.previous_policy_hash_hex = policyHash;
    revised.policy.policy_hash_hex = irohaHash("97");
    revised.policy.fee = "0.25";
    revised.policy.fee_minor_units = 25;
    revised.ledger_finality.head_policy_hash_hex = irohaHash("97");
    revised.ledger_finality.scheduled_policy_hash_hex = irohaHash("97");
    revised.ledger_finality.effective_policy_hash_hex = irohaHash("97");
    const view = await fetchGovernanceValidationFeePolicy({
      config,
      coreApiBaseUrl: "https://core.example",
      fetcher: coreFetcher(revised, status(revised)),
    });
    expect(view.effective).toMatchObject({
      policy_version: "2",
      previous_policy_hash: policyHash.toUpperCase(),
      fee: "0.25",
    });
    expect(view.registryHead).toEqual({
      policyVersion: "2",
      policyHash: irohaHash("97"),
    });
  });

  it("does not invent a version for a scheduled registry head", async () => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const scheduled = projection();
    scheduled.ledger_finality.head_policy_hash_hex = irohaHash("97");
    const view = await fetchGovernanceValidationFeePolicy({
      config,
      coreApiBaseUrl: "https://core.example",
      fetcher: coreFetcher(scheduled, status(scheduled)),
    });
    expect(view.registryHead).toEqual({
      policyVersion: null,
      policyHash: irohaHash("97"),
    });
    expect(view.effective.policy_version).toBe("1");
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

    const otherCustody = enabledConfigJson();
    otherCustody.expected.rewardCustody.validatorLaneId = 1;
    await expect(
      fetchGovernanceValidationFeePolicy({
        config: readGovernanceValidationFeeConfig(JSON.stringify(otherCustody)),
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(),
      }),
    ).rejects.toThrow(/does not exactly match the runtime release coordinates/);

    const otherCheckpoint = enabledConfigJson();
    otherCheckpoint.ledgerBinding.checkpoint.height = 1_001;
    await expect(
      fetchGovernanceValidationFeePolicy({
        config: readGovernanceValidationFeeConfig(
          JSON.stringify(otherCheckpoint),
        ),
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(),
      }),
    ).rejects.toThrow(/immutable runtime ledger binding/);

    const otherGenesis = enabledConfigJson();
    otherGenesis.ledgerBinding.genesisHash = irohaHash("13");
    otherGenesis.ledgerBinding.networkId = parseNetworkIdLiteral(
      irohaHash("13"),
    );
    await expect(
      fetchGovernanceValidationFeePolicy({
        config: readGovernanceValidationFeeConfig(JSON.stringify(otherGenesis)),
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(),
      }),
    ).rejects.toThrow(/immutable runtime ledger binding/);
  });

  it.each([
    [
      "the retired height-activated policy shape",
      (value: ReturnType<typeof projection>) => {
        const policy = value.policy as Record<string, unknown>;
        delete policy.effective_from_ms;
        delete policy.notice_published_at_ms;
        delete policy.retail_schedule;
        delete policy.reward_custody;
        Object.assign(policy, {
          expires_after_height: null,
          treasury_payout_binding: {},
        });
      },
      /fields must be exactly/,
    ],
    [
      "the retired per-transfer charging mode",
      (value: ReturnType<typeof projection>) => {
        value.policy.charging_mode = "PER_QUALIFYING_TRANSFER_INSTRUCTION";
      },
      /governed monthly-allowance/,
    ],
    [
      "a fee text that is not the minor-unit rendering",
      (value: ReturnType<typeof projection>) => {
        value.policy.fee = "0.1";
      },
      /governed monthly-allowance/,
    ],
    [
      "an invalid retail schedule",
      (value: ReturnType<typeof projection>) => {
        value.policy.retail_schedule.maintenance_tiers[1].monthly_fee_minor = 50;
      },
      /invalid governed retail schedule/,
    ],
    [
      "short public notice",
      (value: ReturnType<typeof projection>) => {
        value.policy.notice_published_at_ms = NOTICE_PUBLISHED_AT_MS + 1;
      },
      /30 calendar days notice/,
    ],
    [
      "an activation off the Honiara month boundary",
      (value: ReturnType<typeof projection>) => {
        value.policy.effective_from_ms = EFFECTIVE_FROM_MS + 3_600_000;
      },
      /Honiara month boundary/,
    ],
    [
      "a network identity other than the genesis hash",
      (value: ReturnType<typeof projection>) => {
        value.policy.network_id = parseNetworkIdLiteral(irohaHash("13"));
      },
      /differs from genesis/,
    ],
    [
      "mutable reward custody",
      (value: ReturnType<typeof projection>) => {
        value.policy.reward_custody.treasury_account_id =
          REWARD_POOL_ACCOUNT_ID;
      },
      /invalid immutable reward custody/,
    ],
    [
      "a pricing authority that does not enact the policy",
      (value: ReturnType<typeof projection>) => {
        value.policy.effective_from_height += 1;
      },
      /enacted Parliament authority/,
    ],
    [
      "a certificate for another proposal",
      (value: ReturnType<typeof projection>) => {
        value.parliament_authorization.governance_certificate.proposal_content_id =
          plainHash("23");
      },
      /certificate does not bind/,
    ],
    [
      "a fabricated PLAIN Parliament summary",
      (value: ReturnType<typeof projection>) => {
        (
          value.parliament_authorization as Record<string, unknown>
        ).governance_certificate = { mode: "PLAIN", approved: true };
      },
      /fields must be exactly/,
    ],
    [
      "a conversion binding outside the reward custody",
      (value: ReturnType<typeof projection>) => {
        value.conversion_policy.binding.validator_lane_id = 1;
      },
      /immutable reward custody/,
    ],
    [
      "a conversion binding with four providers",
      (value: ReturnType<typeof projection>) => {
        value.conversion_policy.binding.reference_provider_accounts.pop();
      },
      /exactly five reference providers/,
    ],
    [
      "a conversion authority enacted at the finalized height",
      (value: ReturnType<typeof projection>) => {
        value.conversion_policy.authority.enacted_at_height = 126_000;
        value.conversion_policy.authority.governance_certificate.enact_at_height = 126_000;
      },
      /finalized authority/,
    ],
    [
      "a policy not yet active at the proved block time",
      (value: ReturnType<typeof projection>) => {
        value.ledger_finality.block_timestamp_ms = EFFECTIVE_FROM_MS - 1;
      },
      /not active at the proved finalized block/,
    ],
    [
      "an effective registry entry for another policy",
      (value: ReturnType<typeof projection>) => {
        value.ledger_finality.effective_policy_hash_hex = irohaHash("97");
      },
      /effective registry entry differs/,
    ],
    [
      "a first policy outside the policy-chain genesis",
      (value: ReturnType<typeof projection>) => {
        value.policy.policy_hash_hex = irohaHash("97");
        value.ledger_finality.effective_policy_hash_hex = irohaHash("97");
      },
      /policy-chain genesis/,
    ],
  ])("rejects %s", async (_label, mutate, pattern) => {
    const config = readGovernanceValidationFeeConfig(
      JSON.stringify(enabledConfigJson()),
    );
    const current = projection();
    mutate(current);
    await expect(
      fetchGovernanceValidationFeePolicy({
        config,
        coreApiBaseUrl: "https://core.example",
        fetcher: coreFetcher(current, status(current)),
      }),
    ).rejects.toThrow(pattern);
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
    refreshed.ledgerBinding.checkpoint.canonicalBase64 = Buffer.from(
      "promoted-native-finality-checkpoint",
    ).toString("base64");
    refreshed.expected.rewardCustody.validatorLaneId = 7;

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
    otherLedger.ledgerBinding.networkId = parseNetworkIdLiteral(
      irohaHash("13"),
    );
    expect(
      deriveGovernanceValidationFeeImmutableLedgerScope(otherLedger),
    ).not.toBe(deriveGovernanceValidationFeeImmutableLedgerScope(first));
  });
});

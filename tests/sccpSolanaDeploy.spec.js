// @vitest-environment node
/* global BigInt */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  linkSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { blake2b } from "@noble/hashes/blake2b";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { AccountAddress } from "@iroha/iroha-js/address";
import { solanaRouteManifestCanonicalSha256 } from "../scripts/e2e/sccp-solana-route-preflight.mjs";
import {
  assertProductionSolanaManifest,
  assertNoRoutePublishReadinessOverrideForMutation,
  assertSolanaTestnetRpcConnection,
  buildSolanaDeploymentVideoRootStatus,
  buildSolanaLiveEvidenceHelperArgs,
  buildSolanaDeploymentVideoMediaVerification,
  buildSolanaPostDeployEvidenceReportBody,
  buildSkippedSolanaPostDeployEvidenceReportBody,
  buildSolanaPostDeployManifestEvidenceReportBody,
  buildSolanaPostDeployFullTomlReportBody,
  buildBlockedSolanaRouteAllowlistHashReportBody,
  buildSolanaProverSubtitleEvidence,
  buildSolanaProverSidecarBody,
  buildSolanaRecipientSubtitleEvidence,
  buildSolanaSourceBurnSubtitleEvidence,
  buildSolanaProductionMaterialInventoryReportBody,
  buildSolanaProductionMaterialTemplateReportBody,
  buildSolanaProductionMaterialValidationReportBody,
  buildSolanaProductionManifestPatchInputsFromInventoryReport,
  buildSolanaProductionManifestPatchReportBody,
  buildSolanaProverReadinessReportBody,
  buildSolanaProductionRequirementsReportBody,
  buildSolanaProgramFinalizationReadinessReportBody,
  buildSolanaGovernedNativeVerifierLiveReadinessReportBody,
  buildSolanaGovernedNativeVerifierPackageValidation,
  buildSolanaProductionGovernanceApprovalValidation,
  buildSolanaGovernanceProgramRolePinValidation,
  buildConfigureNativeVerifierAccountMetas,
  buildSolanaNativeVerifierConfigurationReadinessReportBody,
  configureSolanaNativeVerifierState,
  buildSolanaNativeVerifierDeploymentPolicyReportBody,
  buildUpgradeableSolanaDraftLiveEvidence,
  buildSolanaVerifierLinkageReadinessReportBody,
  buildSkippedSolanaVerifierLinkageReadinessReportBody,
  buildSolanaProofMaterialBundleReportBody,
  buildSolanaProofMaterialCeremonyPackageReportBody,
  buildSolanaProofMaterialRequestReportBody,
  buildSolanaRouteAllowlistHashReportBody,
  buildSolanaRouteManagerAccessRequestReportBody,
  buildSolanaOperatorHandoffReportBody,
  summarizeSolanaPublicationSurface,
  buildSolanaLaneActivationRequestReportBody,
  buildSolanaLaneActivationProposalReportBody,
  buildSolanaActivationPackageReportBody,
  buildSolanaEvidenceRefreshSmokeReadinessOptions,
  buildSolanaProductionGateOptions,
  buildSolanaLiveVideoGateOptions,
  buildSolanaEvidenceRefreshMediaVerification,
  buildSolanaEvidenceRefreshRootStatus,
  buildSolanaBlockerResolution,
  buildSolanaFinishProductionReportBody,
  buildSolanaFinishSubmissionState,
  buildSolanaFinishProgramFinalizationCompletion,
  buildSolanaFinishFinalizationMutationDecision,
  buildSolanaFinishVerifierConfigurationDecision,
  buildSolanaRoutePublicationRequestReportBody,
  buildSolanaRoutePublishReadinessReportBody as buildRawSolanaRoutePublishReadinessReportBody,
  buildSolanaRoutePublishBlockedReport,
  buildSolanaRoutePublishBlockedFromReadiness,
  buildSolanaRouteAbsenceMutationFence,
  loadPinnedSolanaGeneratedReportArtifact,
  writePinnedSolanaGeneratedReport,
  assertSolanaGeneratedReportChainBindings,
  buildSolanaRouteManifestSubmissionReceiptValidation,
  buildSolanaExactPublicationReadbackValidation,
  buildSolanaGovernedNativeVerifierManifestBinding,
  buildRejectedSolanaRouteCanarySubmissionReportBody,
  assertSolanaSettlementProofContextHash,
  buildSolanaSettlementProofContextHash,
  buildSolanaSubmitAccountMetas,
  buildSolanaSourceBurnAccountMetas,
  buildSolanaRouteCanaryEnvelope,
  buildSolanaRouteCanaryInstructionDataHex,
  deriveSolanaMessageReceiptAddress,
  deriveSolanaSourceBurnReceiptAddress,
  buildSolanaRouteManifestIsiArtifact,
  buildSolanaRouteInstructionAccountTemplates,
  buildSolanaSourceMaterialHandoffReportBody,
  buildSolanaSourceMaterialHandoffVerificationReportBody,
  buildSkippedSolanaSourceMaterialHandoffVerificationReportBody,
  buildSolanaSourceBurnInstructionDataHex,
  createSolanaSourceBurnNonce,
  buildBlockedSolanaSourceBurnSubmissionReportBody,
  buildSolanaSourceBurnProofRequestScaffold,
  buildSolanaSourceBurnProofRequestFromSubmission,
  buildSolanaSourceBurnReadinessReportBody,
  buildSkippedSolanaSourceBurnReadinessReportBody,
  buildSolanaSourceBurnSubmissionReportBody,
  fetchTairaMcpTransactionToolStatus,
  buildTairaRouteManagerPermissionStatus,
  buildTairaMcpTransactionToolStatus,
  artifactPaths as solanaDeployArtifactPaths,
  assertNoFileBackedSolanaSignerOptions,
  auditFileBackedSolanaKeyMaterial,
  collectInventoryFiles,
  DEFAULT_SOLANA_RUNTIME_SIGNER_ENV,
  defaultSolanaGovernedMaterialRoots,
  fetchTextWithRetry,
  isGeneratedSolanaInventoryReportPath,
  inspectSolanaStateInitialization,
  inspectExactPublishedSolanaRoute,
  captureSolanaFinalizedReadbackEvidence,
  loadSelectedSolanaDeploymentMaterial,
  loadStableSolanaFinalizedReadbackEvidence,
  loadStableSolanaNativeVerifierConfigReport,
  loadPinnedSolanaProofMaterialGeneration,
  normalizeSolanaDoctorSiblingChecks,
  normalizePackageRelativeModuleUrl,
  normalizeRuntimeSecretEnvName,
  normalizeSolanaSourceBurnNonce,
  normalizeTairaSourceBurnRecipient,
  parseSolanaProgramdataAccountDataForLinkage,
  parseSolanaSccpStateAccountData,
  parseSolanaSplTokenAccountData,
  publishRouteManifest,
  proofMaterialBundleArtifactDefinitions,
  readProofMaterialBundleArtifact,
  sanitizeSolanaAccountsReportForProduction,
  sanitizeSolanaPublicConfig,
  resolveTairaRoutePublishTarget,
  resolveSolanaFinishSubmissionMode,
  resolveSolanaPublicReportInputPaths,
  selectCanonicalSolanaRoutePublishReadiness,
  solanaFinishProductionMaterialValidationArgs,
  solanaProgramDeploymentModeLabel,
  solanaFinalizedReadbackRoleEvidence,
  summarizeSolanaLiveEvidenceForCli,
  summarizeSolanaRouteManifestForCli,
  summarizeSolanaSmokeReadinessForTranscript,
  solanaRpcErrorIsRetryable,
  solanaRoutePublishSkipRpc,
  tairaPublicNodeCandidatesFromDnsRecords,
  withSolanaRpcRetry,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_DESTINATION_VERIFIER_PLAN,
  SOLANA_SOURCE_PROOF_BACKEND,
  SOLANA_VERIFIER_TARGET,
  loadRuntimeSolanaSigner,
  runtimeOnlySolanaDeploymentBlocker,
  readInventoryRecords,
  assertFreshSolanaPostDeployManifestEvidence,
  assertSolanaFinalizedReadbackMatchesSelection,
  validateSolanaFinalizedReadbackEvidence,
  SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
} from "../scripts/sccp-solana-deploy.mjs";

const hex32 = (byte) =>
  `0x${byte.length === 1 ? byte.repeat(64) : byte.repeat(32)}`;

const materialHex32 = (seed) =>
  `0x${createHash("sha256").update(`sccp-solana:${seed}`).digest("hex")}`;

const jsonObjectSha256 = (value) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const fileSha256 = (file) =>
  `0x${createHash("sha256").update(readFileSync(file)).digest("hex")}`;

const routeManifestIsiBindingForTest = (artifact) => {
  const manifest = artifact.instruction?.UpsertSccpRouteManifest?.manifest;
  const manifestArtifactSha256 = materialHex32(
    "reviewed-route-manifest-artifact",
  );
  return {
    args: { "expected-manifest-sha256": manifestArtifactSha256 },
    isiArtifactSha256: jsonObjectSha256(artifact),
    manifestArtifactPath: "/reviewed/taira-solana-xor-route.json",
    manifestArtifactSha256,
    manifestCanonicalSha256: solanaRouteManifestCanonicalSha256(manifest),
  };
};

const buildSolanaRoutePublishReadinessReportBody = (options = {}) => {
  const artifact = options.isiArtifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return buildRawSolanaRoutePublishReadinessReportBody(options);
  }
  const binding = routeManifestIsiBindingForTest(artifact);
  return buildRawSolanaRoutePublishReadinessReportBody({
    ...options,
    args: {
      ...(options.args ?? {}),
      ...binding.args,
    },
    ...Object.fromEntries(
      Object.entries(binding).filter(([key]) => key !== "args"),
    ),
  });
};

const fullLightClientMaterialFields = (prefix = "full-light-client") => ({
  towerReplayVerifierHash: materialHex32(`${prefix}:tower-replay`),
  fullAccountsdbLatticeVerifierHash: materialHex32(
    `${prefix}:accountsdb-lattice`,
  ),
  bankForkChoiceVerifierHash: materialHex32(`${prefix}:bank-fork-choice`),
  expectedSourceVerifierMaterialHash: materialHex32(
    `${prefix}:expected-source-verifier-material`,
  ),
  expectedSourceAdapterEngineDeploymentHash: materialHex32(
    `${prefix}:expected-source-adapter-engine-deployment`,
  ),
  expectedFullLightClientGateHash: materialHex32(
    `${prefix}:expected-full-light-client-gate`,
  ),
});

const blake2bHex32 = (bytes) =>
  `0x${Buffer.from(blake2b(Uint8Array.from(bytes), { dkLen: 32 })).toString(
    "hex",
  )}`;

const packageJson = () => JSON.parse(readFileSync("package.json", "utf8"));

const dryRunFinishSubmissionMode = Object.freeze({
  mode: "dry-run",
  explicitlySelected: true,
  mutationAuthorized: false,
});

describe("Solana testnet RPC identity", () => {
  it("accepts only the canonical Solana testnet genesis hash", async () => {
    await expect(
      assertSolanaTestnetRpcConnection({
        getGenesisHash: async () => SOLANA_TESTNET_GENESIS_HASH,
      }),
    ).resolves.toBe(SOLANA_TESTNET_GENESIS_HASH);

    await expect(
      assertSolanaTestnetRpcConnection({
        getGenesisHash: async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      }),
    ).rejects.toThrow(/not Solana testnet/u);
  });

  it("fails closed if an endpoint changes identity between operations", async () => {
    let requestCount = 0;
    const connection = {
      getGenesisHash: async () => {
        requestCount += 1;
        return requestCount === 1
          ? SOLANA_TESTNET_GENESIS_HASH
          : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
      },
    };

    await expect(assertSolanaTestnetRpcConnection(connection)).resolves.toBe(
      SOLANA_TESTNET_GENESIS_HASH,
    );
    await expect(assertSolanaTestnetRpcConnection(connection)).rejects.toThrow(
      /not Solana testnet/u,
    );
  });

  it("does not echo RPC failures or unexpected identity values", async () => {
    await expect(
      assertSolanaTestnetRpcConnection({
        getGenesisHash: async () => {
          throw new Error("secret-token-from-rpc");
        },
      }),
    ).rejects.not.toThrow(/secret-token-from-rpc/u);
    await expect(
      assertSolanaTestnetRpcConnection({
        getGenesisHash: async () => "secret-token-as-genesis",
      }),
    ).rejects.not.toThrow(/secret-token-as-genesis/u);
  });
});

describe("file-backed Solana key material production boundary", () => {
  it("reports keypair paths without reading, changing, or deleting their bytes", async () => {
    const outputRoot = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-key-audit-"),
    );
    const deploymentRoot = path.join(outputRoot, "sccp-solana-deploy");
    const keyPath = path.join(deploymentRoot, "operator-keypair.json");
    mkdirSync(deploymentRoot, { recursive: true });
    writeFileSync(keyPath, "opaque-operator-material", { mode: 0o600 });
    writeFileSync(path.join(deploymentRoot, "public-evidence.json"), "{}");
    try {
      const report = await auditFileBackedSolanaKeyMaterial({
        outputRoot,
        checkedAt: "2026-07-10T00:00:00.000Z",
      });
      expect(report).toMatchObject({
        ready: false,
        findingCount: 1,
        findings: [
          {
            type: "regular-file",
          },
        ],
        blockerIds: ["file-backed-solana-key-material"],
      });
      expect(path.basename(report.findings[0].path)).toBe(
        "operator-keypair.json",
      );
      expect(readFileSync(keyPath, "utf8")).toBe("opaque-operator-material");
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("passes only when every sccp-solana output subtree is key-free", async () => {
    const outputRoot = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-clean-key-audit-"),
    );
    mkdirSync(path.join(outputRoot, "sccp-solana-program-artifacts"), {
      recursive: true,
    });
    writeFileSync(
      path.join(
        outputRoot,
        "sccp-solana-program-artifacts",
        "sccp_taira_xor.so",
      ),
      "ELF",
    );
    try {
      await expect(
        auditFileBackedSolanaKeyMaterial({ outputRoot }),
      ).resolves.toMatchObject({
        ready: true,
        findingCount: 0,
        findings: [],
        blockers: [],
      });
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("promotes file-backed key findings into canonical root causes and custody actions", () => {
    const productionRequirements = buildSolanaProductionRequirementsReportBody({
      fileBackedKeyMaterialAudit: {
        ready: false,
        findingCount: 22,
        findings: [{ path: "output/sccp-solana/keypair.json" }],
        blockers: [{ id: "file-backed-solana-key-material" }],
      },
    });
    expect(productionRequirements.blockerIds).toContain(
      "file-backed-solana-key-material",
    );
    expect(productionRequirements.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rotate-revoke-remove-file-backed-solana-key-material",
          command: [],
          validationCommands: expect.arrayContaining([
            expect.arrayContaining([
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "production-material-inventory",
            ]),
          ]),
        }),
      ]),
    );

    const finish = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      productionRequirements,
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: { routeAlreadyPublic: false },
      },
    });
    expect(finish.rootCauseBlockerIds).toContain(
      "file-backed-solana-key-material",
    );
    expect(finish.blockerResolution.keyCustodyBlockerIds).toContain(
      "file-backed-solana-key-material",
    );
    expect(finish.blockerResolution.unknownBlockerIds).not.toContain(
      "file-backed-solana-key-material",
    );
    expect(finish.nextActions).toContain(
      "rotate-revoke-remove-file-backed-solana-key-material",
    );
  });
});

describe("Solana program deployment CLI contract", () => {
  it("forbids new stable Program ids while exposing the reviewed existing-program upgrade", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/sccp-solana-deploy.mjs", "--help"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "Creating a new stable Program id remains disabled",
    );
    expect(result.stdout).toMatch(
      /every other deploy\s+invocation fails closed/u,
    );
    expect(result.stdout).toContain(
      "Program-byte deployment is disabled. The only supported form verifies",
    );
    expect(result.stdout).toContain(
      "configure-native-verifier is the preferred command name",
    );
    expect(result.stdout).toContain("upgrade-existing-program-readiness");
    expect(result.stdout).toContain("upgrade-existing-program");
    expect(result.stdout).toContain("recover-existing-program-upgrade-buffer");
    expect(result.stdout).not.toContain(
      "Deploy the compiled Solana SCCP program",
    );
    expect(result.stdout).not.toContain(
      "Deploy the fail-closed native recursive verifier CPI target by default",
    );

    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const optionSetSource = source.slice(
      source.indexOf("const SOLANA_DEPLOY_CLI_OPTION_KEYS"),
      source.indexOf("const parseArgs"),
    );
    const acceptedOptions = [
      ...optionSetSource.matchAll(/^\s+"([a-z0-9-]+)",$/gmu),
    ].map((match) => match[1]);
    expect(acceptedOptions.length).toBeGreaterThan(100);
    for (const option of acceptedOptions) {
      expect(result.stdout, `missing help for --${option}`).toContain(
        `--${option}`,
      );
    }
  });
});

describe("Solana runtime-only signer boundary", () => {
  it("loads only explicit runtime bytes and binds them to the reviewed public address", () => {
    const source = Keypair.generate();
    const encoded = `base64:${Buffer.from(source.secretKey).toString("base64")}`;
    const signer = loadRuntimeSolanaSigner({
      env: { [DEFAULT_SOLANA_RUNTIME_SIGNER_ENV]: encoded },
      expectedAddress: source.publicKey.toBase58(),
      label: "test operation",
    });
    expect(signer.publicKey.toBase58()).toBe(source.publicKey.toBase58());
    signer.secretKey.fill(0);
    source.secretKey.fill(0);
  });

  it("rejects missing, malformed, or mismatched runtime authority without echoing key material", () => {
    const source = Keypair.generate();
    const other = Keypair.generate();
    const secret = `hex:${Buffer.from(source.secretKey).toString("hex")}`;
    const env = { [DEFAULT_SOLANA_RUNTIME_SIGNER_ENV]: secret };

    expect(() =>
      loadRuntimeSolanaSigner({
        env: {},
        label: "test operation",
      }),
    ).toThrow(/runtime-only signer material/u);
    expect(() =>
      loadRuntimeSolanaSigner({
        env: { [DEFAULT_SOLANA_RUNTIME_SIGNER_ENV]: "base64:not-a-key" },
        label: "test operation",
      }),
    ).toThrowError(expect.not.stringContaining("not-a-key"));
    expect(() =>
      loadRuntimeSolanaSigner({
        env,
        label: "test operation",
      }),
    ).toThrow(/requires a reviewed public signer address/u);
    expect(() =>
      loadRuntimeSolanaSigner({
        env,
        expectedAddress: other.publicKey.toBase58(),
        label: "test operation",
      }),
    ).toThrowError(expect.not.stringContaining(secret));
    source.secretKey.fill(0);
    other.secretKey.fill(0);
  });

  it("rejects file-backed signer options and unsafe env names without echoing paths", () => {
    const secretPath = "/tmp/operator-secret-keypair.json";
    expect(() =>
      assertNoFileBackedSolanaSignerOptions({ keypair: secretPath }),
    ).toThrowError(expect.not.stringContaining(secretPath));
    expect(() => normalizeRuntimeSecretEnvName(secretPath)).toThrowError(
      expect.not.stringContaining(secretPath),
    );
  });

  it("keeps keypair paths out of artifact inventories and public config", () => {
    const paths = solanaDeployArtifactPaths({
      "output-dir": "/tmp/public-solana-evidence",
    });
    expect(
      Object.keys(paths).some((key) => /keypair|privateKey/iu.test(key)),
    ).toBe(false);
    const secretPath = "/tmp/operator-secret-keypair.json";
    const publicOnlySource = Keypair.generate();
    const sanitized = sanitizeSolanaPublicConfig({
      deployerAddress: publicOnlySource.publicKey.toBase58(),
      deployerKeypairFile: secretPath,
      nativeVerifierProgramIdKeypairFile: secretPath,
      operator: { privateKey: "hex:deadbeef", publicLabel: "reviewed" },
    });
    expect(JSON.stringify(sanitized)).not.toContain(secretPath);
    expect(JSON.stringify(sanitized)).not.toContain("deadbeef");
    expect(sanitized).not.toHaveProperty("deployerKeypairFile");
    expect(sanitized.operator).toEqual({ publicLabel: "reviewed" });
    publicOnlySource.secretKey.fill(0);
  });

  it("blocks CLI-backed deployment before any signer-file operation", () => {
    const blocker = runtimeOnlySolanaDeploymentBlocker();
    expect(blocker.message).toMatch(/new stable Solana Program id/u);
    expect(blocker.message).toMatch(/upgrade-existing-program-readiness/u);
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    expect(source).not.toContain("const readKeypair");
    expect(source).not.toContain("const createKeypairFile");
    expect(source).not.toContain('"--keypair",');
  });

  it("does not create output or echo a supplied signer path when mutation is attempted", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-runtime-signer-"));
    const secretPath = path.join(outputDir, "operator-secret-keypair.json");
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "fund",
        "--output-dir",
        outputDir,
        "--keypair",
        secretPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain(secretPath);
      expect(existsSync(secretPath)).toBe(false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("does not start a funding mutation when runtime signer authority is absent", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-runtime-missing-"));
    const source = Keypair.generate();
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    writeFileSync(
      paths.publicConfig,
      `${JSON.stringify({
        schema: "iroha-demo-sccp-solana-public-deployment/v1",
        deployerAddress: source.publicKey.toBase58(),
      })}\n`,
    );
    const env = { ...process.env };
    delete env[DEFAULT_SOLANA_RUNTIME_SIGNER_ENV];
    const result = spawnSync(
      process.execPath,
      ["scripts/sccp-solana-deploy.mjs", "fund", "--output-dir", outputDir],
      { cwd: process.cwd(), encoding: "utf8", env },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /requires 64-byte runtime-only signer material/u,
      );
      expect(existsSync(paths.fundingReport)).toBe(false);
    } finally {
      source.secretKey.fill(0);
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("Solana route publication mutation boundary", () => {
  it("accepts only canonical TAIRA validator roots with their exact MCP endpoint", () => {
    const ready = resolveTairaRoutePublishTarget({
      "torii-url": "https://taira-validator-1.sora.org/",
      "mcp-url": "https://taira-validator-1.sora.org/v1/mcp/",
    });
    expect(ready).toMatchObject({
      toriiUrl: "https://taira-validator-1.sora.org",
      mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      canonicalPublicNodeRoot: true,
      mcpMatchesToriiRoot: true,
      canonicalRolloutTargetReady: true,
      targetKind: "explicit-taira-public-node",
    });

    for (const args of [
      {
        "torii-url": "https://taira-public-node.example",
        "mcp-url": "https://taira-public-node.example/v1/mcp",
      },
      {
        "torii-url": "https://taira-validator-1.sora.org",
        "mcp-url": "https://taira-validator-2.sora.org/v1/mcp",
      },
      {
        "torii-url": "http://taira-validator-1.sora.org",
        "mcp-url": "http://taira-validator-1.sora.org/v1/mcp",
      },
      {
        "torii-url": "https://taira-validator-1.sora.org/status",
        "mcp-url": "https://taira-validator-1.sora.org/status/v1/mcp",
      },
      {
        "torii-url": "https://taira-validator-1.sora.org?token=secret",
        "mcp-url": "https://taira-validator-1.sora.org?token=secret/v1/mcp",
      },
    ]) {
      expect(resolveTairaRoutePublishTarget(args)).toMatchObject({
        canonicalRolloutTargetReady: false,
        targetKind: "taira-convenience-root",
      });
    }
  });

  it("requires a healthy explicit validator and positive route absence before irreversible Solana mutation", () => {
    const absentPreflight = {
      checks: [
        { id: "taira-endpoint", status: "pass" },
        { id: "sccp-capabilities-load", status: "pass" },
        { id: "sccp-submit-capabilities", status: "pass" },
        {
          id: "sccp-manifest-load",
          status: "pass",
          evidence: {
            source: "public",
            recordCount: 0,
            cacheBypassRequested: true,
            cacheBypassVerified: true,
            finalityBoundRead: true,
            finalizedHeightBefore: 101,
            finalizedHeightAfter: 101,
            manifestFinalizedHeight: 101,
          },
        },
        { id: "public-route-publication", status: "pass" },
        {
          id: "solana-route-instance-publication",
          status: "fail",
          evidence: {
            routeAbsent: true,
            expectedRouteId: "taira_sol_xor",
            expectedAssetKey: "xor",
          },
        },
      ],
    };
    expect(
      buildSolanaRouteAbsenceMutationFence({
        args: explicitTairaPublicNodeArgs(),
        publicPreflight: absentPreflight,
      }),
    ).toMatchObject({
      ready: true,
      routeAbsent: true,
      blockerIds: [],
    });

    expect(
      buildSolanaRouteAbsenceMutationFence({
        args: {},
        publicPreflight: absentPreflight,
      }),
    ).toMatchObject({
      ready: false,
      blockerIds: ["explicit-canonical-taira-public-node-required"],
    });

    const missingManifestLoad = buildSolanaRouteAbsenceMutationFence({
      args: explicitTairaPublicNodeArgs(),
      publicPreflight: {
        checks: absentPreflight.checks.filter(
          (check) => check.id !== "sccp-manifest-load",
        ),
      },
    });
    expect(missingManifestLoad).toMatchObject({
      ready: false,
      publicManifestEnvelopeReady: false,
      blockerIds: [
        "public-manifest-envelope-readiness-required",
        "authoritative-finality-bound-manifest-read-required",
      ],
    });

    const cachedAbsence = buildSolanaRouteAbsenceMutationFence({
      args: explicitTairaPublicNodeArgs(),
      publicPreflight: {
        ...absentPreflight,
        checks: absentPreflight.checks.map((check) =>
          check.id === "sccp-manifest-load"
            ? {
                ...check,
                evidence: {
                  ...check.evidence,
                  cacheBypassVerified: false,
                },
              }
            : check,
        ),
      },
    });
    expect(cachedAbsence).toMatchObject({
      ready: false,
      authoritativeManifestReadReady: false,
      blockerIds: ["authoritative-finality-bound-manifest-read-required"],
    });

    const published = buildSolanaRouteAbsenceMutationFence({
      args: explicitTairaPublicNodeArgs(),
      publicPreflight: {
        ...absentPreflight,
        checks: absentPreflight.checks.map((check) =>
          check.id === "solana-route-instance-publication"
            ? { ...check, status: "pass", evidence: { routeAbsent: false } }
            : check,
        ),
      },
    });
    expect(published).toMatchObject({
      ready: false,
      routePublished: true,
      blockerIds: ["published-route-mutation-procedure-required"],
    });
  });

  it("blocks CLI-synthesized governed material before reading or writing a manifest", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-cli-governance-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "production-manifest-patch",
        "--output-dir",
        outputDir,
        "--confirm-governed-solana-material",
        "true",
        "--source-verifier-material-hash",
        materialHex32("attacker-source-material"),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /--from-inventory true is required/u,
      );
      expect(existsSync(paths.productionManifestPatch)).toBe(false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects untrusted readiness artifacts instead of treating a true flag as authority", () => {
    for (const key of [
      "route-publish-readiness-report",
      "publish-readiness-report",
      "public-preflight-report",
      "preflight-report",
    ]) {
      expect(() =>
        assertNoRoutePublishReadinessOverrideForMutation({
          [key]: "/tmp/attacker-ready.json",
        }),
      ).toThrow(/must recompute readiness/u);
    }
    expect(() =>
      assertNoRoutePublishReadinessOverrideForMutation({}),
    ).not.toThrow();
    expect(() =>
      assertNoRoutePublishReadinessOverrideForMutation({
        "skip-solana-rpc": "false",
      }),
    ).not.toThrow();
    for (const value of ["true", true, "1", 1]) {
      expect(() =>
        assertNoRoutePublishReadinessOverrideForMutation({
          "skip-solana-rpc": value,
        }),
      ).toThrow(/requires fresh finalized Solana RPC readback/u);
    }
  });

  it("does not echo an override path that may contain credentials", () => {
    expect(() =>
      assertNoRoutePublishReadinessOverrideForMutation({
        "route-publish-readiness-report": "/tmp/secret-token-readiness.json",
      }),
    ).toThrowError(expect.not.stringContaining("secret-token-readiness"));
  });

  it("fails mutating publication before reading artifacts when a public preflight override is supplied", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-preflight-override-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "publish-route-manifest",
        "--submit",
        "true",
        "--output-dir",
        outputDir,
        "--public-preflight-report",
        "/tmp/secret-token-preflight.json",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /must recompute readiness and public preflight/u,
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "secret-token-preflight",
      );
      expect(existsSync(paths.routeManifestIsi)).toBe(false);
      expect(existsSync(paths.routeManifestPublishBlocked)).toBe(false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("fails mutating publication before reading artifacts when Solana RPC is disabled", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-skip-rpc-publish-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "publish-route-manifest",
        "--submit",
        "true",
        "--output-dir",
        outputDir,
        "--skip-solana-rpc",
        "true",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /requires fresh finalized Solana RPC readback/u,
      );
      expect(existsSync(paths.routeManifestIsi)).toBe(false);
      expect(existsSync(paths.routeManifestPublishBlocked)).toBe(false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("writes a fail-closed publication report when direct ISI generation has no independent manifest pin", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-missing-route-manifest-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "route-manifest-isi",
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /requires --expected-manifest-sha256/u,
      );
      expect(existsSync(paths.routeManifestIsi)).toBe(false);
      expect(existsSync(paths.routeManifestPublishBlocked)).toBe(true);
      expect(
        JSON.parse(readFileSync(paths.routeManifestPublishBlocked, "utf8")),
      ).toMatchObject({
        schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
        ready: false,
        stage: "route-manifest-isi",
        routeManifestIsiPath: null,
        error: expect.stringMatching(/requires --expected-manifest-sha256/u),
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps a blocked ISI report consistent with the latest publish-readiness snapshot", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-blocked-isi-consistency-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    writeFileSync(
      paths.routeManifestPublishReadiness,
      `${JSON.stringify({
        schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
        ready: false,
        blockers: [{ id: "production-requirements" }],
        routeManifestIsi: {
          ready: false,
          error:
            "Route-manifest ISI generation is intentionally withheld until Solana production requirements pass.",
        },
      })}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sccp-solana-deploy.mjs",
        "route-manifest-isi",
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(
        JSON.parse(readFileSync(paths.routeManifestPublishBlocked, "utf8")),
      ).toMatchObject({
        ready: false,
        stage: "route-manifest-isi",
        error:
          "Route-manifest ISI generation is intentionally withheld until Solana production requirements pass.",
        blockerIds: ["production-requirements"],
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("recomputes readiness at the finish-production submission boundary", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finishStart = source.indexOf("const finishProduction = async");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const finishBody = source.slice(finishStart, refreshStart);
    expect(finishBody).not.toContain(
      'publishRouteManifest({ ...sharedPreflightArgs, submit: "true" })',
    );
    expect(finishBody).not.toContain(
      'publishRouteManifest({ ...sharedRouteArgs, submit: "true" })',
    );
    expect(finishBody).toContain('"skip-solana-rpc": "false"');
  });

  it("defaults every route-publication preflight to live Solana RPC", () => {
    expect(solanaRoutePublishSkipRpc({})).toBe(false);
    expect(solanaRoutePublishSkipRpc({ "skip-solana-rpc": "false" })).toBe(
      false,
    );
    expect(solanaRoutePublishSkipRpc({ "skip-solana-rpc": "true" })).toBe(true);
  });

  it("pins the exact in-memory route ISI across the signing subprocess boundary", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const publishStart = source.indexOf("const publishRouteManifest = async");
    const nextCommandStart = source.indexOf(
      "const evidenceRefreshReportPath",
      publishStart,
    );
    const publishBody = source.slice(publishStart, nextCommandStart);
    expect(publishBody).toContain('"--expected-isi-sha256"');
    expect(publishBody).toContain("sha256JsonHex(isiResult.artifact)");
    expect(publishBody.indexOf('"--expected-isi-sha256"')).toBeLessThan(
      publishBody.indexOf('"--private-key-env"'),
    );
  });

  it("verifies exact public publication from independently pinned manifest bytes", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-exact-public-inspection-"),
    );
    const manifestPath = path.join(outputDir, "reviewed-route.json");
    const manifest = baseProductionManifest();
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const manifestArtifactSha256 = fileSha256(manifestPath);
    let inspectedArgs = null;
    try {
      const inspection = await inspectExactPublishedSolanaRoute(
        {
          manifest: manifestPath,
          "output-dir": outputDir,
          "expected-manifest-sha256": manifestArtifactSha256,
        },
        {
          runPublicPreflight: async (args) => {
            inspectedArgs = args;
            return {
              reportPath: path.join(outputDir, "live-preflight.json"),
              report: publishedSolanaRoutePreflight(
                solanaRouteManifestCanonicalSha256(manifest),
              ),
            };
          },
        },
      );

      expect(inspectedArgs?.["skip-solana-rpc"]).toBe("false");
      expect(inspection.status).toMatchObject({
        published: true,
        exactManifestMatches: true,
      });
      expect(inspection.selection.manifestArtifact.sha256).toBe(
        manifestArtifactSha256,
      );
      expect(inspection.selection.manifestArtifact.path).toMatch(
        /\/reviewed-route\.json$/u,
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects a wrong exact-byte pin before public publication inspection", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-public-pin-rejection-"),
    );
    const manifestPath = path.join(outputDir, "reviewed-route.json");
    writeFileSync(manifestPath, JSON.stringify(baseProductionManifest()));
    let preflightCalled = false;
    try {
      await expect(
        inspectExactPublishedSolanaRoute(
          {
            manifest: manifestPath,
            "output-dir": outputDir,
            "expected-manifest-sha256": materialHex32("wrong-manifest"),
          },
          {
            runPublicPreflight: async () => {
              preflightCalled = true;
              return { report: {} };
            },
          },
        ),
      ).rejects.toThrow(/changed while it was being read|SHA-256/u);
      expect(preflightCalled).toBe(false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("does not accept a different public canonical manifest as satisfied", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-public-canonical-mismatch-"),
    );
    const manifestPath = path.join(outputDir, "reviewed-route.json");
    writeFileSync(manifestPath, JSON.stringify(baseProductionManifest()));
    try {
      const inspection = await inspectExactPublishedSolanaRoute(
        {
          manifest: manifestPath,
          "output-dir": outputDir,
          "expected-manifest-sha256": fileSha256(manifestPath),
        },
        {
          runPublicPreflight: async () => ({
            report: publishedSolanaRoutePreflight(
              materialHex32("different-public-canonical-manifest"),
            ),
          }),
        },
      );
      expect(inspection.status).toMatchObject({
        published: false,
        exactManifestMatches: false,
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("returns an exact-public no-op before ISI, readiness, or signer inspection", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-publication-no-op-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const manifestArtifactSha256 = materialHex32("already-public-manifest");
    try {
      const result = await publishRouteManifest(
        {
          submit: "true",
          "output-dir": outputDir,
          "authority-env": "invalid env name that must not be inspected",
          "private-key-env": "invalid env name that must not be inspected",
        },
        {
          inspectPublication: async (args) => {
            expect(args["skip-solana-rpc"]).toBe("false");
            return {
              status: { published: true, exactManifestMatches: true },
              preflight: { reportPath: "/live/exact-public-preflight.json" },
              selection: {
                manifestArtifact: {
                  path: "/reviewed/taira-solana-xor-route.json",
                  sha256: manifestArtifactSha256,
                },
                manifestCanonicalSha256: materialHex32(
                  "already-public-canonical-manifest",
                ),
              },
            };
          },
        },
      );

      expect(result).toMatchObject({
        submitted: false,
        alreadyPublished: true,
        publicationSatisfied: true,
        exactManifestVerified: true,
        manifestArtifactSha256,
      });
      for (const artifactPath of [
        paths.routeManifestIsi,
        paths.routeManifestPublishReadiness,
        paths.routeManifestPublishBlocked,
        paths.routeManifestSubmission,
      ]) {
        expect(existsSync(artifactPath)).toBe(false);
      }
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects non-waiting route publication before ISI generation or signing", async () => {
    await expect(
      publishRouteManifest(
        { submit: "true", "wait-for-commit": "false" },
        {
          inspectPublication: async () => ({
            status: { published: false, exactManifestMatches: false },
          }),
        },
      ),
    ).rejects.toThrow(/requires --wait-for-commit true/u);
  });

  it("validates an Applied route receipt against every reviewed boundary", () => {
    const artifact = buildSolanaRouteManifestIsiArtifact({
      manifest: baseProductionManifest(),
    });
    const binding = routeManifestIsiBindingForTest(artifact);
    const isiResult = { artifact, ...binding };
    const submission = {
      submitted: true,
      statusKind: "Applied",
      waitForCommit: true,
      submitVia: "mcp",
      isiObjectSha256: binding.isiArtifactSha256,
      manifestObjectSha256: artifact.manifestSha256,
      instructionManifestObjectSha256: artifact.instructionManifestSha256,
      toriiUrl: "https://taira-validator-1.sora.org",
      mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      authority: TAIRA_RECIPIENT,
      metadata: {
        route_id: "taira_sol_xor",
        asset_key: "xor",
      },
    };
    const validate = (candidate) =>
      buildSolanaRouteManifestSubmissionReceiptValidation({
        submission: candidate,
        isiResult,
        expectedToriiUrl: "https://taira-validator-1.sora.org",
        expectedMcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
        expectedAuthority: TAIRA_RECIPIENT,
      });
    expect(validate(submission)).toMatchObject({ ready: true, blockerIds: [] });
    for (const candidate of [
      { ...submission, submitted: false },
      { ...submission, statusKind: "Rejected" },
      { ...submission, waitForCommit: false },
      { ...submission, submitVia: "torii" },
      { ...submission, isiObjectSha256: materialHex32("wrong-isi") },
      { ...submission, manifestObjectSha256: materialHex32("wrong-manifest") },
      {
        ...submission,
        instructionManifestObjectSha256: materialHex32("wrong-instruction"),
      },
      { ...submission, toriiUrl: "https://taira-validator-2.sora.org" },
      { ...submission, mcpUrl: "https://taira-validator-2.sora.org/v1/mcp" },
      { ...submission, authority: `testu${"z".repeat(48)}` },
      {
        ...submission,
        metadata: { ...submission.metadata, route_id: "other" },
      },
      {
        ...submission,
        metadata: { ...submission.metadata, asset_key: "not-xor" },
      },
    ]) {
      expect(validate(candidate).ready).toBe(false);
    }
  });

  it("accepts public completion only for the exact canonical manifest", () => {
    const expected = materialHex32("expected-public-canonical-manifest");
    expect(
      buildSolanaExactPublicationReadbackValidation({
        publicPreflight: publishedSolanaRoutePreflight(expected),
        expectedManifestCanonicalSha256: expected,
      }),
    ).toMatchObject({ ready: true, blockerIds: [] });
    expect(
      buildSolanaExactPublicationReadbackValidation({
        publicPreflight: publishedSolanaRoutePreflight(
          materialHex32("different-public-canonical-manifest"),
        ),
        expectedManifestCanonicalSha256: expected,
      }),
    ).toMatchObject({
      ready: false,
      blockerIds: ["exact-public-route-manifest-readback-required"],
    });
  });

  it("removes the unguarded legacy governance proposal mutation command", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/sccp-solana-deploy.mjs", "propose"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Unknown command/u);
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    expect(source).not.toContain('"propose-route-manifest"');
  });
});

describe("Solana generated handoff exact-byte chain", () => {
  const reportCases = [
    [
      "routePublicationRequest",
      "iroha-demo-sccp-solana-route-publication-request/v1",
    ],
    [
      "routeManagerAccessRequest",
      "iroha-demo-sccp-solana-route-manager-access-request/v1",
    ],
    [
      "laneActivationRequest",
      "iroha-demo-sccp-solana-lane-activation-request/v1",
    ],
    [
      "laneActivationProposal",
      "iroha-demo-sccp-solana-lane-activation-proposal/v1",
    ],
    ["operatorHandoff", "iroha-demo-sccp-solana-operator-handoff/v1"],
    ["activationPackage", "iroha-demo-sccp-solana-activation-package/v1"],
  ];

  it.each(reportCases)(
    "writes and reloads %s only with the exact canonical byte pin",
    async (kind, schema) => {
      const outputDir = mkdtempSync(
        path.join(tmpdir(), `sccp-solana-${kind}-`),
      );
      const file = path.join(outputDir, "report.json");
      const report = {
        schema,
        routeId: "taira_sol_xor",
        assetKey: "xor",
        ...(kind.startsWith("laneActivation")
          ? {
              chain: "sol",
              networkId: "solana-testnet",
              counterpartyDomain: 3,
            }
          : {}),
      };
      const artifact = await writePinnedSolanaGeneratedReport({
        file,
        report,
        kind,
      });
      expect(artifact.sha256).toBe(fileSha256(file));
      await expect(
        loadPinnedSolanaGeneratedReportArtifact({ file, kind }),
      ).rejects.toThrow(/expected-.+-sha256/u);
      await expect(
        loadPinnedSolanaGeneratedReportArtifact({
          file,
          kind,
          expectedSha256: materialHex32("wrong-generated-report"),
        }),
      ).rejects.toThrow(/SHA-256/u);
      await expect(
        loadPinnedSolanaGeneratedReportArtifact({
          file,
          kind,
          expectedSha256: artifact.sha256,
        }),
      ).resolves.toMatchObject({ value: report, sha256: artifact.sha256 });

      writeFileSync(file, `${JSON.stringify({ ...report, changed: true })}\n`);
      await expect(
        loadPinnedSolanaGeneratedReportArtifact({
          file,
          kind,
          expectedSha256: artifact.sha256,
        }),
      ).rejects.toThrow(/SHA-256/u);
      rmSync(outputDir, { recursive: true, force: true });
    },
  );

  it("rejects mixed proof-bundle, publication, access, lane, operator, and activation generations", () => {
    const bundleA = { bundleManifestSha256: materialHex32("bundle-a") };
    const publicationA = {
      reviewPackageHash: materialHex32("publication-a"),
      proofMaterialBundle: {
        bundleManifestSha256: bundleA.bundleManifestSha256,
      },
    };
    const accessA = {
      requestHash: materialHex32("access-a"),
      routePublicationRequest: {
        reviewPackageHash: publicationA.reviewPackageHash,
      },
      proofMaterialBundle: {
        bundleManifestSha256: bundleA.bundleManifestSha256,
      },
    };
    const laneA = {
      laneActivationRequestHash: materialHex32("lane-a"),
      artifacts: {
        proofMaterialBundle: {
          bundleManifestSha256: bundleA.bundleManifestSha256,
        },
      },
    };
    const proposalA = {
      proposalHash: materialHex32("proposal-a"),
      laneActivationRequest: {
        laneActivationRequestHash: laneA.laneActivationRequestHash,
      },
    };
    const operatorA = {
      handoffHash: materialHex32("operator-a"),
      artifacts: {
        proofMaterialBundle: { stableHash: bundleA.bundleManifestSha256 },
        routePublicationRequest: {
          stableHash: publicationA.reviewPackageHash,
        },
        routeManagerAccessRequest: { stableHash: accessA.requestHash },
        laneActivationRequest: {
          stableHash: laneA.laneActivationRequestHash,
        },
      },
    };
    const activationA = {
      artifacts: {
        proofMaterialBundle: { stableHash: bundleA.bundleManifestSha256 },
        routePublicationRequest: {
          stableHash: publicationA.reviewPackageHash,
        },
        routeManagerAccessRequest: { stableHash: accessA.requestHash },
        laneActivationRequest: {
          stableHash: laneA.laneActivationRequestHash,
        },
        laneActivationProposal: { stableHash: proposalA.proposalHash },
        operatorHandoff: { stableHash: operatorA.handoffHash },
      },
    };
    expect(() =>
      assertSolanaGeneratedReportChainBindings({
        proofMaterialBundle: bundleA,
        routePublicationRequest: publicationA,
        routeManagerAccessRequest: accessA,
        laneActivationRequest: laneA,
        laneActivationProposal: proposalA,
        operatorHandoff: operatorA,
        activationPackage: activationA,
      }),
    ).not.toThrow();
    expect(() =>
      assertSolanaGeneratedReportChainBindings({
        proofMaterialBundle: {
          bundleManifestSha256: materialHex32("bundle-b"),
        },
        routePublicationRequest: publicationA,
      }),
    ).toThrow(/mixed or stale/u);
    expect(() =>
      assertSolanaGeneratedReportChainBindings({
        proofMaterialBundle: bundleA,
        routePublicationRequest: {
          ...publicationA,
          reviewPackageHash: materialHex32("publication-b"),
        },
        routeManagerAccessRequest: accessA,
      }),
    ).toThrow(/mixed or stale/u);
    expect(() =>
      assertSolanaGeneratedReportChainBindings({
        proofMaterialBundle: bundleA,
        routePublicationRequest: publicationA,
        routeManagerAccessRequest: accessA,
        laneActivationRequest: laneA,
        laneActivationProposal: proposalA,
        operatorHandoff: operatorA,
        activationPackage: {
          ...activationA,
          artifacts: {
            ...activationA.artifacts,
            operatorHandoff: { stableHash: materialHex32("operator-b") },
          },
        },
      }),
    ).toThrow(/mixed or stale/u);
  });

  it("rejects symlinked and hard-linked generated handoff inputs even when their bytes are pinned", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-generated-links-"),
    );
    const report = {
      schema: "iroha-demo-sccp-solana-route-publication-request/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
    };
    const source = path.join(outputDir, "source.json");
    const artifact = await writePinnedSolanaGeneratedReport({
      file: source,
      report,
      kind: "routePublicationRequest",
    });
    const symlink = path.join(outputDir, "symlink.json");
    symlinkSync(source, symlink);
    await expect(
      loadPinnedSolanaGeneratedReportArtifact({
        file: symlink,
        expectedSha256: artifact.sha256,
        kind: "routePublicationRequest",
      }),
    ).rejects.toThrow(/symlink|symbolic/u);
    rmSync(symlink);
    const hardlink = path.join(outputDir, "hardlink.json");
    linkSync(source, hardlink);
    await expect(
      loadPinnedSolanaGeneratedReportArtifact({
        file: hardlink,
        expectedSha256: artifact.sha256,
        kind: "routePublicationRequest",
      }),
    ).rejects.toThrow(/hard link|link count|singly-linked/u);
    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe("Solana package-relative prover URL boundary", () => {
  it("accepts canonical package assets", () => {
    expect(
      normalizePackageRelativeModuleUrl(
        "/sccp-solana/taira-solana-xor-source-prover.js",
        "module URL",
      ),
    ).toBe("/sccp-solana/taira-solana-xor-source-prover.js");
  });

  it.each([
    "//evil.example/prover.js",
    "/sccp-solana//prover.js",
    "/%2e%2e/evil.js",
    "/sccp-solana/%2f%2fevil.js",
    "/sccp-solana/%5cevil.js",
    "/sccp-solana/../evil.js",
    "/sccp-solana/./evil.js",
    "/sccp-solana/evil.js?token=secret",
    "/sccp-solana/evil.js#fragment",
    "/sccp-solana/evil\\module.js",
    "/sccp-solana/evil\u0000.js",
    "/sccp-solana/evil\u2028.js",
    " /sccp-solana/evil.js",
  ])("rejects unsafe browser resolution input %j", (value) => {
    expect(() =>
      normalizePackageRelativeModuleUrl(value, "module URL"),
    ).toThrow(/canonical package-relative|package-relative absolute/u);
  });

  it("routes the deploy CLI sidecar writer through the strict validator and byte pin", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const writerStart = source.indexOf(
      "const writeProverSidecarFromManifest = async",
    );
    const writerEnd = source.indexOf(
      "const proverSidecars = async",
      writerStart,
    );
    const writer = source.slice(writerStart, writerEnd);
    expect(writer).toContain("buildSolanaProverSidecarForModule");
    expect(writer).not.toContain("buildSolanaProverSidecarBody({");

    const readerStart = source.indexOf("const proverEntryFromManifest = async");
    const readerEnd = source.indexOf(
      "const writeProverSidecarFromManifest = async",
      readerStart,
    );
    const reader = source.slice(readerStart, readerEnd);
    expect(reader).toContain("sidecarHashMatchesManifest");
    expect(reader).toContain(
      "sidecar bytes do not match the manifest-pinned sidecar hash",
    );
  });
});

const TAIRA_NETWORK_PREFIX = 369;
const SOLANA_GOVERNED_PRODUCTION_INPUT_IDS = [
  "governed-solana-source-verifier-material",
  "governed-solana-source-adapter-engine-deployment",
  "reviewed-final-solana-offline-toml",
  "governed-solana-destination-proof-admission",
  "solana-destination-production-prover-package",
  "solana-source-production-prover-package",
];
const SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH =
  "0xe7bc29d06bf56184183c3fc59a0e934cd1d8e16751f1eda2efaaf88aa350b9d6";

const renderSiblingSolanaSourceEvidenceFixture = () => {
  const helperPath = path.resolve(
    process.cwd(),
    "../iroha/scripts/sccp_solana_source_state_evidence.py",
  );
  const componentHash = (role) =>
    materialHex32(`real-sibling-source-evidence:${role}`);
  const baseArgs = [
    helperPath,
    "--solana-network",
    "testnet",
    "--source-trust-anchor-hash",
    componentHash("source-trust-anchor"),
    "--consensus-verifier-hash",
    componentHash("consensus-verifier"),
    "--message-inclusion-verifier-hash",
    componentHash("message-inclusion-verifier"),
    "--finality-policy-hash",
    componentHash("finality-policy"),
    "--source-state-verifier-hash",
    componentHash("source-state-verifier"),
    "--adapter-verifier-vk-hash",
    SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
    "--deployment-receipt-hash",
    componentHash("deployment-receipt"),
    "--tower-replay-verifier-hash",
    componentHash("tower-replay-verifier"),
    "--full-accountsdb-lattice-verifier-hash",
    componentHash("full-accountsdb-lattice-verifier"),
    "--bank-fork-choice-verifier-hash",
    componentHash("bank-fork-choice-verifier"),
  ];
  const runHelper = (args) => {
    const result = spawnSync("python3", args, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `Sibling Solana source evidence helper failed: ${result.stderr || result.stdout}`,
      );
    }
    return result.stdout;
  };
  const unpinnedSummary = JSON.parse(runHelper(baseArgs));
  const governedArgs = [
    ...baseArgs,
    "--expected-source-verifier-material-hash",
    unpinnedSummary.source_verifier_material_hash,
    "--expected-source-adapter-engine-deployment-hash",
    unpinnedSummary.source_adapter_engine_deployment_hash,
    "--expected-full-light-client-gate-hash",
    unpinnedSummary.full_light_client_gate_hash,
  ];
  return {
    summary: JSON.parse(runHelper(governedArgs)),
    toml: runHelper([...governedArgs, "--toml"]),
  };
};

const reviewedOfflineTomlFixture = ({
  root = "/tmp",
  filename = "taira-solana-xor-route.production-ready.torii.toml",
  sourceDomain = 0,
  targetDomain = 3,
  chain = "sol",
} = {}) => {
  const tomlPath = path.join(root, filename);
  const toml = `
route_id = "taira_sol_xor"
source_domain = ${sourceDomain}
target_domain = ${targetDomain}
chain = "${chain}"
destination_binding_key = "sccp:0:3:sol:solana-program-v1:2"
full_toml_ready = true
`;
  const offlineFullTomlSha256 = `0x${createHash("sha256")
    .update(toml)
    .digest("hex")}`;
  const reportPath = path.join(
    root,
    "taira-solana-xor-post-deploy-full-toml.attestation.json",
  );
  const report = {
    schema: "iroha-demo-sccp-solana-post-deploy-full-toml/v1",
    fullTomlReady: true,
    full_toml_ready: true,
    offlineFullTomlSha256,
    offline_full_toml_sha256: offlineFullTomlSha256,
    tomlPath,
    helper: {
      script: path.resolve(
        process.cwd(),
        "../iroha/scripts/sccp_solana_live_evidence.py",
      ),
      exitStatus: 0,
    },
  };
  return {
    toml,
    tomlPath,
    reportPath,
    offlineFullTomlSha256,
    records: [
      {
        kind: "json",
        path: reportPath,
        pointer: "/",
        rootSchema: report.schema,
        schema: report.schema,
        record: report,
      },
      {
        kind: "toml",
        path: tomlPath,
        pointer: "/",
        schema: "",
        text: toml,
      },
    ],
  };
};

const SOLANA_UPGRADEABLE_LOADER_ID =
  "BPFLoaderUpgradeab1e11111111111111111111111";
const SOLANA_VERIFIER_FAIL_CLOSED_SENTINEL =
  "SCCP Solana native recursive verifier is not linked; rejecting proof envelope";
const SOLANA_NATIVE_VERIFIER_NOT_CONFIGURED_LOG =
  "SCCP Solana native verifier program is not configured";
const SOLANA_NATIVE_VERIFIER_CPI_MARKER =
  "SCCP_SOLANA_NATIVE_RECURSIVE_VERIFIER_CPI_V1";
const SOLANA_VERIFIER_PROGRAM_ID =
  "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf";
const SOLANA_DESTINATION_BRIDGE_PROGRAM_ID =
  "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD";
const SOLANA_SOURCE_BRIDGE_PROGRAM_ID =
  "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2";
const SOLANA_PROGRAMDATA_ADDRESS =
  "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW";
const SOLANA_PROGRAMDATA_SLOT = "420442735";
const SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS =
  "9ey7piM5hZap475XPFyMvfybLjZvA5QydwF6MAvDCRQp";
const SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT = "420442737";
const SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS =
  "2ALmgF4o71uEXBXeQ56h2jeUb1VJrw5zvEo1QKjeZzP2";
const SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT = "420442738";
const SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256 = materialHex32(
  "reviewed-shared-solana-sbf-artifact",
);
const SOLANA_SHARED_PROGRAM_CODE_HASH = materialHex32(
  "reviewed-shared-solana-sbf-code",
);
const SOLANA_VERIFIER_STATE_ADDRESS =
  "3h56ufp3FJWGjaARSEoc6pnAysMCvjhHgf1DA8yvDJZm";
const SOLANA_TOKEN_MINT_ADDRESS =
  "8291HWJXDb4wHWULcA78A43Zk72pHvfa6xKhM9GLGnS4";
const SOLANA_DESTINATION_BINDING_HASH =
  "0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6";
const SOLANA_NATIVE_VERIFIER_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
const SOLANA_NATIVE_PROGRAMDATA_ADDRESS =
  "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA";
const SOLANA_NATIVE_PROGRAMDATA_SLOT = "420442736";
const SOLANA_NATIVE_PROGRAM_BYTES = Buffer.concat([
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from("governed-native-recursive-verifier", "utf8"),
  Buffer.from(SOLANA_NATIVE_VERIFIER_CPI_MARKER, "utf8"),
]);
const SOLANA_NATIVE_VERIFIER_CODE_HASH = blake2bHex32(
  SOLANA_NATIVE_PROGRAM_BYTES,
);
const SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256 = `0x${createHash("sha256").update(SOLANA_NATIVE_PROGRAM_BYTES).digest("hex")}`;
const SOLANA_NATIVE_VERIFIER_KEY_HASH = materialHex32("native-verifier-key");
const SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH = materialHex32(
  "native-verifier-governance-approval",
);
const BASE_GOVERNED_NATIVE_VERIFIER_MATERIAL = {
  schema: "iroha-sccp-solana-native-recursive-verifier-material-public/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  proofSystem: "stark-fri-v1",
  proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
  productionReady: true,
  productionProofMaterial: true,
  nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
  nativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
  nativeVerifierProgramdataSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
  nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
  nativeVerifierCodeHash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
  verifierKeyHash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
  governanceApprovalEvidenceHash: SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
};
const SOLANA_NATIVE_VERIFIER_MATERIAL_HASH = `0x${createHash("sha256")
  .update(JSON.stringify(BASE_GOVERNED_NATIVE_VERIFIER_MATERIAL))
  .digest("hex")}`;
const BASE_GOVERNED_NATIVE_VERIFIER_CONFIG = {
  schema: "iroha-sccp-solana-native-recursive-verifier-config-public/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  proofVerificationMode: "native-recursive-verifier-v1",
  productionReady: true,
  nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
  nativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
  nativeVerifierProgramdataSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
  nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
  nativeVerifierCodeHash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
  verifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
  verifierKeyHash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
  governanceApprovalEvidenceHash: SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
};
const SOLANA_NATIVE_VERIFIER_CONFIG_HASH = `0x${createHash("sha256")
  .update(JSON.stringify(BASE_GOVERNED_NATIVE_VERIFIER_CONFIG))
  .digest("hex")}`;

const tairaRouteManagerAuthorityFromByte = (byte) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from({ length: 32 }, () => byte),
  }).toI105(TAIRA_NETWORK_PREFIX);

const ROUTE_MANAGER_AUTHORITY = tairaRouteManagerAuthorityFromByte(0x47);
const TAIRA_RECIPIENT = tairaRouteManagerAuthorityFromByte(0x51);
const MINAMOTO_RECIPIENT = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x51),
}).toI105(753);
const EXPLICIT_TAIRA_PUBLIC_NODE_URL = "https://taira-validator-1.sora.org";
const EXPLICIT_TAIRA_PUBLIC_NODE_MCP_URL = `${EXPLICIT_TAIRA_PUBLIC_NODE_URL}/v1/mcp`;
const explicitTairaPublicNodeArgs = () => ({
  "torii-url": EXPLICIT_TAIRA_PUBLIC_NODE_URL,
  "mcp-url": EXPLICIT_TAIRA_PUBLIC_NODE_MCP_URL,
});

const readySolanaProverReadiness = () => ({
  readyForProductionProofs: true,
  entries: [
    {
      direction: "destination",
      moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
      sidecarUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
      actualModuleHash: materialHex32("destination-module"),
      expectedModuleHash: materialHex32("destination-module"),
      sidecarHash: materialHex32("destination-sidecar"),
      sidecar: {
        knownAnswerVectorHash: materialHex32("destination-known-answer-vector"),
      },
      exportsOk: true,
      ready: true,
      sidecarReady: true,
      moduleHashMatchesManifest: true,
    },
    {
      direction: "source",
      moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      sidecarUrl: "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
      actualModuleHash: materialHex32("source-module"),
      expectedModuleHash: materialHex32("source-module"),
      sidecarHash: materialHex32("source-sidecar"),
      sidecar: {
        knownAnswerVectorHash: materialHex32("source-known-answer-vector"),
      },
      exportsOk: true,
      ready: true,
      sidecarReady: true,
      moduleHashMatchesManifest: true,
    },
  ],
});

const readyProofBundleBindingArtifacts = () => {
  const destinationModuleHash = materialHex32("bundle-destination-module");
  const sourceModuleHash = materialHex32("bundle-source-module");
  const destinationSidecarHash = materialHex32("bundle-destination-sidecar");
  const sourceSidecarHash = materialHex32("bundle-source-sidecar");
  const destinationModuleUrl =
    "/sccp-solana/taira-solana-xor-destination-prover.js";
  const sourceModuleUrl = "/sccp-solana/taira-solana-xor-source-prover.js";
  const destinationSidecarUrl =
    "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json";
  const sourceSidecarUrl =
    "/sccp-solana/taira-solana-xor-source-prover.sidecar.json";
  const included = (id, fields = {}) => ({
    id,
    status: "included",
    required: true,
    sha256: materialHex32(`bundle:${id}`),
    reviewSha256: materialHex32(`bundle-review:${id}`),
    ...fields,
  });
  return [
    included("route-manifest", {
      binding: {
        destinationProver: {
          moduleUrl: destinationModuleUrl,
          moduleHash: destinationModuleHash,
          sidecarUrl: destinationSidecarUrl,
          sidecarHash: destinationSidecarHash,
        },
        sourceProver: {
          moduleUrl: sourceModuleUrl,
          moduleHash: sourceModuleHash,
          sidecarUrl: sourceSidecarUrl,
          sidecarHash: sourceSidecarHash,
        },
      },
    }),
    included("destination-prover-module", {
      sha256: destinationModuleHash,
      reviewSha256: destinationModuleHash,
      binding: { direction: "destination" },
    }),
    included("source-prover-module", {
      sha256: sourceModuleHash,
      reviewSha256: sourceModuleHash,
      binding: { direction: "source" },
    }),
    included("destination-prover-sidecar", {
      sha256: destinationSidecarHash,
      binding: {
        direction: "destination",
        moduleUrl: destinationModuleUrl,
        moduleHash: destinationModuleHash,
        productionProofsReady: true,
      },
    }),
    included("source-prover-sidecar", {
      sha256: sourceSidecarHash,
      binding: {
        direction: "source",
        moduleUrl: sourceModuleUrl,
        moduleHash: sourceModuleHash,
        productionProofsReady: true,
      },
    }),
    included("prover-readiness", {
      binding: {
        readyForProductionProofs: true,
        entries: [
          {
            direction: "destination",
            moduleUrl: destinationModuleUrl,
            moduleHash: destinationModuleHash,
            expectedModuleHash: destinationModuleHash,
            sidecarUrl: destinationSidecarUrl,
            sidecarHash: destinationSidecarHash,
            expectedSidecarHash: destinationSidecarHash,
            productionProofsReady: true,
          },
          {
            direction: "source",
            moduleUrl: sourceModuleUrl,
            moduleHash: sourceModuleHash,
            expectedModuleHash: sourceModuleHash,
            sidecarUrl: sourceSidecarUrl,
            sidecarHash: sourceSidecarHash,
            expectedSidecarHash: sourceSidecarHash,
            productionProofsReady: true,
          },
        ],
      },
    }),
    included("production-material-inventory", {
      binding: { ready: true, governanceApprovalReady: true },
    }),
    included("production-requirements", {
      binding: { readyToBuildIsi: true },
    }),
  ];
};

const solanaTestnetSourceRecordIdentity = () => ({
  routeId: "taira_sol_xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
  sourceProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
  sourceDomain: 3,
  targetDomain: 0,
  sourceTrustAnchorId: "sccp:sol:source-trust-anchor:solana-testnet-genesis:v1",
  consensusVerifierId:
    "sccp:sol:consensus-verifier:finalized-slot-bankhash-testnet:v1",
  messageInclusionVerifierId:
    "sccp:sol:message-inclusion-verifier:transaction-status-root-branch-testnet:v1",
  sourceStateVerifierId:
    "sccp:sol:accounts-db-verifier:accounts-lt-hash-testnet:v1",
  finalityPolicyId: "sccp:sol:finality-policy:finalized-slot-testnet:v1",
});

const pubkeyBytes = (address) => new PublicKey(address).toBytes();

const writePubkey = (buffer, offset, address) => {
  Buffer.from(pubkeyBytes(address)).copy(buffer, offset);
};

const writeU64 = (buffer, offset, value) => {
  buffer.writeBigUInt64LE(BigInt(value), offset);
};

const buildStateData = ({
  authority = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
  mint = "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
  nativeVerifierProgram = null,
  verifierMaterialHashByte = null,
  verifierConfigHashByte = null,
  verifierConfiguredSlot = 0,
  acceptedCount = 0,
  lastSlot = 419725105,
  totalMinted = 0,
  totalBurned = 0,
  lastBurnHashByte = null,
} = {}) => {
  const buffer = Buffer.alloc(272);
  buffer.write("SCCPSOL1", 0, "ascii");
  buffer[8] = 1;
  writePubkey(buffer, 16, authority);
  writeU64(buffer, 48, acceptedCount);
  writeU64(buffer, 56, lastSlot);
  if (nativeVerifierProgram) {
    writePubkey(buffer, 64, nativeVerifierProgram);
  }
  if (verifierMaterialHashByte !== null) {
    Buffer.alloc(32, verifierMaterialHashByte).copy(buffer, 96);
  }
  if (verifierConfigHashByte !== null) {
    Buffer.alloc(32, verifierConfigHashByte).copy(buffer, 128);
  }
  writeU64(buffer, 160, verifierConfiguredSlot);
  writePubkey(buffer, 192, mint);
  writeU64(buffer, 224, totalMinted);
  writeU64(buffer, 232, totalBurned);
  if (lastBurnHashByte !== null) {
    Buffer.alloc(32, lastBurnHashByte).copy(buffer, 240);
  }
  return buffer;
};

const buildTokenAccountData = ({
  mint = "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
  owner = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
  amount = 0,
} = {}) => {
  const buffer = Buffer.alloc(165);
  writePubkey(buffer, 0, mint);
  writePubkey(buffer, 32, owner);
  writeU64(buffer, 64, amount);
  buffer[108] = 1;
  return buffer;
};

const buildProgramdataData = ({
  slot = SOLANA_PROGRAMDATA_SLOT,
  upgradeAuthority = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
  includeSentinel = false,
  includeCpiMarker = !includeSentinel,
  programBytes = null,
} = {}) => {
  const metadata = Buffer.alloc(45);
  metadata.writeUInt32LE(3, 0);
  metadata.writeBigUInt64LE(BigInt(slot), 4);
  if (upgradeAuthority) {
    metadata[12] = 1;
    Buffer.from(new PublicKey(upgradeAuthority).toBytes()).copy(metadata, 13);
  }
  const executable = programBytes
    ? Buffer.from(programBytes)
    : Buffer.concat([
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
        Buffer.from("sccp-solana-test-verifier", "utf8"),
        includeSentinel
          ? Buffer.from(SOLANA_VERIFIER_FAIL_CLOSED_SENTINEL, "utf8")
          : Buffer.from("native recursive verifier linked", "utf8"),
        includeCpiMarker
          ? Buffer.from(SOLANA_NATIVE_VERIFIER_CPI_MARKER, "utf8")
          : Buffer.alloc(0),
      ]);
  return Buffer.concat([metadata, executable]);
};

const buildSbfProgramBytes = ({
  includeSentinel = false,
  includeCpiMarker = !includeSentinel,
} = {}) =>
  Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    Buffer.from("sccp-solana-test-verifier", "utf8"),
    includeSentinel
      ? Buffer.from(SOLANA_VERIFIER_FAIL_CLOSED_SENTINEL, "utf8")
      : Buffer.from("native recursive verifier linked", "utf8"),
    includeCpiMarker
      ? Buffer.from(SOLANA_NATIVE_VERIFIER_CPI_MARKER, "utf8")
      : Buffer.alloc(0),
  ]);

const buildVerifierLinkageReadback = ({
  parsedProgramdata,
  programdataAddress = SOLANA_PROGRAMDATA_ADDRESS,
  nativeParsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
    buildProgramdataData({
      slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
      upgradeAuthority: null,
      programBytes: SOLANA_NATIVE_PROGRAM_BYTES,
    }),
  ),
  nativeProgramdataAddress = SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
  parsedState = {
    nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    verifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
    verifierConfigHash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
    verifierConfiguredSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
    storedMint: SOLANA_TOKEN_MINT_ADDRESS,
  },
} = {}) => ({
  program: {
    address: SOLANA_VERIFIER_PROGRAM_ID,
    owner: SOLANA_UPGRADEABLE_LOADER_ID,
    executable: true,
    dataLength: 36,
    dataSha256: hex32("31"),
    contextSlot: 420442800,
  },
  parsedProgram: { programdataAddress },
  programdata: {
    address: programdataAddress,
    owner: SOLANA_UPGRADEABLE_LOADER_ID,
    executable: false,
    dataLength: parsedProgramdata.executableLength + 45,
    dataSha256: hex32("32"),
    contextSlot: 420442801,
  },
  parsedProgramdata,
  state: {
    address: SOLANA_VERIFIER_STATE_ADDRESS,
    owner: SOLANA_VERIFIER_PROGRAM_ID,
  },
  parsedState,
  native: {
    program: {
      address: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      owner: SOLANA_UPGRADEABLE_LOADER_ID,
      executable: true,
      dataLength: 36,
      dataSha256: materialHex32("native-program-account"),
      contextSlot: 420442802,
    },
    parsedProgram: { programdataAddress: nativeProgramdataAddress },
    programdata: {
      address: nativeProgramdataAddress,
      owner: SOLANA_UPGRADEABLE_LOADER_ID,
      executable: false,
      dataLength: nativeParsedProgramdata.executableLength + 45,
      dataSha256: materialHex32("native-programdata-account"),
      contextSlot: 420442803,
    },
    parsedProgramdata: nativeParsedProgramdata,
  },
  nativeReadbackError: null,
});

const solanaAccount = ({
  owner = "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
  data,
} = {}) => ({
  owner: new PublicKey(owner),
  data: Buffer.from(data),
});

const observedPostDeploy = () => ({
  finalizedSlot: 419725200,
  expectedMintAuthority: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
  tokenMint: {
    mintAuthority: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
    supply: "0",
    decimals: 9,
    initialized: true,
    freezeAuthority: null,
  },
  verifierState: parseSolanaSccpStateAccountData(buildStateData()),
  sourceState: parseSolanaSccpStateAccountData(
    buildStateData({ totalBurned: 25, lastBurnHashByte: 0x42 }),
  ),
  accounts: {
    tokenMintAccount: {
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    },
    verifierStateAccount: {
      owner: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
    },
    sourceStateAccount: {
      owner: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
    },
  },
  accountDataHashes: {
    tokenMintDataSha256: hex32("1"),
    verifierStateDataSha256: hex32("2"),
    sourceStateDataSha256: hex32("3"),
  },
});

const ATOMIC_READBACK_SOURCE_STATE_ADDRESS =
  "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r";
const ATOMIC_READBACK_TOKEN_ACCOUNT_ADDRESS =
  "Vote111111111111111111111111111111111111111";
const ATOMIC_READBACK_OWNER = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const buildUpgradeableProgramData = (programdataAddress) => {
  const data = Buffer.alloc(36);
  data.writeUInt32LE(2, 0);
  writePubkey(data, 4, programdataAddress);
  return data;
};

const buildMintData = ({
  mintAuthority,
  supply = 10,
  decimals = 9,
  initialized = true,
  freezeAuthority = null,
} = {}) => {
  const data = Buffer.alloc(82);
  if (mintAuthority) {
    data.writeUInt32LE(1, 0);
    writePubkey(data, 4, mintAuthority);
  }
  writeU64(data, 36, supply);
  data[44] = decimals;
  data[45] = initialized ? 1 : 0;
  if (freezeAuthority) {
    data.writeUInt32LE(1, 46);
    writePubkey(data, 50, freezeAuthority);
  }
  return data;
};

const atomicReadbackRpcAccount = ({ owner, executable = false, data }) => ({
  owner: new PublicKey(owner),
  executable,
  lamports: 1_000_000,
  rentEpoch: 0,
  data: Buffer.from(data),
});

const buildAtomicReadbackFixture = ({
  publicConfigOverrides = {},
  omitAddress = null,
  slots = {},
  postTokenSetChanged = false,
  postTokenContentChanged = false,
  programdataSlotOverrides = {},
  nativeVerifierConfigured = true,
  tokenAccountState = 1,
  identityChangesAfterFence = false,
  rpcEndpoint = "https://api.testnet.solana.com",
} = {}) => {
  const publicConfig = {
    verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
    nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    bridgeProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
    sourceBridgeProgramId: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
    verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
    sourceStateAddress: ATOMIC_READBACK_SOURCE_STATE_ADDRESS,
    tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
    deployerAddress: ATOMIC_READBACK_OWNER,
    ...publicConfigOverrides,
  };
  const mintAuthority = new PublicKey(
    "4EREbQqJPkiYXDBwSWgZtPng6zNXFMGbpept5M3JVwxx",
  );
  const programdataByProgram = new Map([
    [SOLANA_VERIFIER_PROGRAM_ID, SOLANA_PROGRAMDATA_ADDRESS],
    [SOLANA_NATIVE_VERIFIER_PROGRAM_ID, SOLANA_NATIVE_PROGRAMDATA_ADDRESS],
    [
      SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
      SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
    ],
    [SOLANA_SOURCE_BRIDGE_PROGRAM_ID, SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS],
  ]);
  const programdataSlots = new Map([
    [SOLANA_PROGRAMDATA_ADDRESS, SOLANA_PROGRAMDATA_SLOT],
    [SOLANA_NATIVE_PROGRAMDATA_ADDRESS, SOLANA_NATIVE_PROGRAMDATA_SLOT],
    [
      SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
      SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT,
    ],
    [
      SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
      SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
    ],
  ]);
  for (const [address, slot] of Object.entries(programdataSlotOverrides)) {
    programdataSlots.set(address, String(slot));
  }
  const accounts = new Map();
  for (const [programId, programdataAddress] of programdataByProgram) {
    accounts.set(
      programId,
      atomicReadbackRpcAccount({
        owner: SOLANA_UPGRADEABLE_LOADER_ID,
        executable: true,
        data: buildUpgradeableProgramData(programdataAddress),
      }),
    );
    accounts.set(
      programdataAddress,
      atomicReadbackRpcAccount({
        owner: SOLANA_UPGRADEABLE_LOADER_ID,
        data: buildProgramdataData({
          slot: programdataSlots.get(programdataAddress),
          includeSentinel: programId === SOLANA_VERIFIER_PROGRAM_ID,
          includeCpiMarker: programId !== SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        }),
      }),
    );
  }
  accounts.set(
    SOLANA_VERIFIER_STATE_ADDRESS,
    atomicReadbackRpcAccount({
      owner: SOLANA_VERIFIER_PROGRAM_ID,
      data: buildStateData({
        authority: ATOMIC_READBACK_OWNER,
        mint: SOLANA_TOKEN_MINT_ADDRESS,
        nativeVerifierProgram: nativeVerifierConfigured
          ? SOLANA_NATIVE_VERIFIER_PROGRAM_ID
          : null,
        verifierMaterialHashByte: nativeVerifierConfigured ? 0x41 : null,
        verifierConfigHashByte: nativeVerifierConfigured ? 0x42 : null,
        verifierConfiguredSlot: nativeVerifierConfigured
          ? SOLANA_NATIVE_PROGRAMDATA_SLOT
          : 0,
        lastSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
      }),
    }),
  );
  accounts.set(
    ATOMIC_READBACK_SOURCE_STATE_ADDRESS,
    atomicReadbackRpcAccount({
      owner: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
      data: buildStateData({
        authority: ATOMIC_READBACK_OWNER,
        mint: SOLANA_TOKEN_MINT_ADDRESS,
        lastSlot: SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
      }),
    }),
  );
  accounts.set(
    SOLANA_TOKEN_MINT_ADDRESS,
    atomicReadbackRpcAccount({
      owner: SPL_TOKEN_PROGRAM_ID,
      data: buildMintData({ mintAuthority: mintAuthority.toBase58() }),
    }),
  );
  const tokenAccount = atomicReadbackRpcAccount({
    owner: SPL_TOKEN_PROGRAM_ID,
    data: buildTokenAccountData({
      mint: SOLANA_TOKEN_MINT_ADDRESS,
      owner: ATOMIC_READBACK_OWNER,
      amount: 5,
    }),
  });
  tokenAccount.data[108] = tokenAccountState;
  accounts.set(ATOMIC_READBACK_TOKEN_ACCOUNT_ADDRESS, tokenAccount);
  if (omitAddress) accounts.delete(omitAddress);

  const resolvedSlots = {
    discovery: 500_000_000,
    preEnumeration: 500_000_001,
    snapshot: 500_000_002,
    postEnumeration: 500_000_003,
    ...slots,
  };
  const calls = [];
  let multipleCall = 0;
  let tokenCall = 0;
  let identityCall = 0;
  const connection = {
    rpcEndpoint,
    getGenesisHash: async () => {
      identityCall += 1;
      return identityChangesAfterFence && identityCall > 1
        ? SystemProgram.programId.toBase58()
        : SOLANA_TESTNET_GENESIS_HASH;
    },
    getMultipleAccountsInfoAndContext: async (keys, config) => {
      const phase = multipleCall === 0 ? "discovery" : "snapshot";
      multipleCall += 1;
      calls.push({ method: "multiple", phase, config, count: keys.length });
      return {
        context: { slot: resolvedSlots[phase] },
        value: keys.map((key) => accounts.get(key.toBase58()) ?? null),
      };
    },
    getTokenAccountsByOwner: async (_owner, _filter, config) => {
      const phase = tokenCall === 0 ? "preEnumeration" : "postEnumeration";
      tokenCall += 1;
      calls.push({ method: "tokens", phase, config });
      const value = [
        {
          pubkey: new PublicKey(ATOMIC_READBACK_TOKEN_ACCOUNT_ADDRESS),
          account:
            phase === "postEnumeration" && postTokenContentChanged
              ? atomicReadbackRpcAccount({
                  owner: SPL_TOKEN_PROGRAM_ID,
                  data: buildTokenAccountData({
                    mint: SOLANA_TOKEN_MINT_ADDRESS,
                    owner: ATOMIC_READBACK_OWNER,
                    amount: 6,
                  }),
                })
              : tokenAccount,
        },
      ];
      if (phase === "postEnumeration" && postTokenSetChanged) {
        value.push({
          pubkey: Keypair.generate().publicKey,
          account: tokenAccount,
        });
      }
      return { context: { slot: resolvedSlots[phase] }, value };
    },
  };
  return {
    connection,
    calls,
    publicConfig,
    publicConfigInput: {
      path: "/reviewed/solana-deploy-public.json",
      sizeBytes: 512,
      sha256: materialHex32("atomic-public-config"),
      stableRead: true,
    },
    nativeVerifierConfigReport: {
      schema: "iroha-demo-sccp-solana-native-verifier-configure/v1",
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    },
    nativeVerifierConfigInput: {
      path: "/reviewed/native-verifier-config.json",
      sizeBytes: 256,
      sha256: materialHex32("atomic-native-config"),
      stableRead: true,
    },
  };
};

const captureAtomicReadbackFixture = async (options = {}, overrides = {}) => {
  const fixture = buildAtomicReadbackFixture(options);
  const report = await captureSolanaFinalizedReadbackEvidence({
    connection: fixture.connection,
    publicConfig: fixture.publicConfig,
    publicConfigInput: fixture.publicConfigInput,
    nativeVerifierConfigReport: fixture.nativeVerifierConfigReport,
    nativeVerifierConfigInput: fixture.nativeVerifierConfigInput,
    capturedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  });
  return { fixture, report };
};

const recomputeAtomicReadbackSnapshotHash = (report) =>
  `0x${createHash("sha256")
    .update(
      JSON.stringify({
        schema: SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
        routeId: report.routeId,
        assetKey: report.assetKey,
        solanaNetwork: report.solanaNetwork,
        solanaGenesisHash: report.solanaGenesisHash,
        snapshot: report.snapshot,
      }),
    )
    .digest("hex")}`;

const canonicalOuterVerifierEvidenceFixture = ({
  programId = SOLANA_VERIFIER_PROGRAM_ID,
  programDataAddress = SOLANA_PROGRAMDATA_ADDRESS,
  programDataSlot = SOLANA_PROGRAMDATA_SLOT,
  executableBlake2b256 = materialHex32("canonical-outer-code"),
  upgradeAuthorityAddress = ATOMIC_READBACK_OWNER,
} = {}) => ({
  schema: SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
  snapshot: {
    roles: {
      outerVerifier: {
        role: "outerVerifier",
        program: { address: programId },
        programdata: { address: programDataAddress },
        loaderV3: {
          deploymentSlot: String(programDataSlot),
          executableBlake2b256,
          immutable: upgradeAuthorityAddress === null,
          upgradeAuthorityAddress,
        },
      },
    },
  },
});

const canonicalLaneDeploymentFixture = async ({
  routeCanarySignature = "route-canary-signature",
  sourceBurnSignature = "source-burn-signature",
} = {}) => {
  const { report: verifierEvidence } = await captureAtomicReadbackFixture();
  const roles = verifierEvidence.snapshot.roles;
  const reviewed = verifierEvidence.snapshot.reviewedAddresses;
  const sourceBridgeConfigHash =
    verifierEvidence.snapshot.sourceBridgeConfig.observedHash;
  const routeCanaryEvidenceHash = materialHex32("lane-route-canary");
  const finalizedReadbackEvidenceArtifactSha256 = materialHex32(
    "lane-finalized-readback-artifact",
  );
  const manifestArtifactSha256 = materialHex32("lane-route-manifest-artifact");
  const proofMaterialRequestArtifactSha256 = materialHex32(
    "lane-proof-material-request-artifact",
  );
  const observedPins = {
    verifierProgramId: roles.outerVerifier.program.address,
    verifierCodeHash: roles.outerVerifier.loaderV3.executableBlake2b256,
    programdataAddress: roles.outerVerifier.programdata.address,
    programdataSlot: roles.outerVerifier.loaderV3.deploymentSlot,
    destinationBindingHash:
      verifierEvidence.snapshot.sourceBridgeConfig.observed
        .destinationBindingHash,
    bridgeProgramId: roles.destinationBridge.program.address,
    sourceBridgeProgramId: roles.sourceBridge.program.address,
    tokenMintAddress: reviewed.tokenMintAddress,
    verifierStateAddress: reviewed.verifierStateAddress,
    sourceStateAddress: reviewed.sourceStateAddress,
    sourceBridgeConfigHash,
    routeCanaryEvidenceHash,
    routeCanarySignature,
    sourceBurnSignature,
  };
  const postDeployEvidence = {
    observedSourceBridgeConfigHash: sourceBridgeConfigHash,
    finalizedReadback: {
      schema: SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
      evidenceArtifactSha256: finalizedReadbackEvidenceArtifactSha256,
      canonicalSnapshotSha256: verifierEvidence.canonicalSnapshotSha256,
      snapshotContextSlot:
        verifierEvidence.snapshot.consistency.snapshotContextSlot,
    },
  };
  const postDeployManifestEvidence = {
    postDeployLiveEvidence: {
      sourceBridgeConfigHash,
      routeCanaryEvidenceHash,
      routeCanaryTransactionSignature: "stale-route-canary-signature",
      sourceEventTransactionSignature: "stale-source-burn-signature",
    },
    manifestConformance: {
      ready: true,
      canonicalSnapshotSha256: verifierEvidence.canonicalSnapshotSha256,
      finalizedReadbackEvidenceArtifactSha256,
      manifestArtifactSha256,
      expectedSourceBridgeConfigHash: sourceBridgeConfigHash,
      observedSourceBridgeConfigHash: sourceBridgeConfigHash,
    },
    sourceArtifacts: {
      canonicalSnapshotSha256: verifierEvidence.canonicalSnapshotSha256,
      finalizedReadbackEvidenceArtifactSha256,
      observedSourceBridgeConfigHash: sourceBridgeConfigHash,
    },
  };
  const proofBundleArtifacts = [
    {
      id: "solana-finalized-readback-evidence",
      status: "included",
      sha256: finalizedReadbackEvidenceArtifactSha256,
    },
    {
      id: "route-manifest",
      status: "included",
      sha256: manifestArtifactSha256,
    },
    {
      id: "proof-material-request",
      status: "included",
      sha256: proofMaterialRequestArtifactSha256,
    },
  ];
  const proofBundleManifestSha256 = `0x${createHash("sha256")
    .update(
      JSON.stringify({
        routeId: "taira_sol_xor",
        assetKey: "xor",
        artifacts: proofBundleArtifacts.map((artifact) => ({
          id: artifact.id,
          relativePath: null,
          schema: null,
          reviewSha256: artifact.sha256,
        })),
      }),
    )
    .digest("hex")}`;
  return {
    verifierEvidence,
    roles,
    reviewed,
    observedPins,
    postDeployEvidence,
    postDeployManifestEvidence,
    sourceBridgeConfigHash,
    routeCanaryEvidenceHash,
    verifierEvidenceArtifactSha256: finalizedReadbackEvidenceArtifactSha256,
    manifestArtifactSha256,
    proofMaterialRequestArtifactSha256,
    proofBundleArtifacts,
    proofBundleManifestSha256,
  };
};

describe("atomic finalized Solana readback evidence", () => {
  it("captures every program, state, mint, and reviewed token account in one monotonic snapshot", async () => {
    const { fixture, report } = await captureAtomicReadbackFixture();

    expect(validateSolanaFinalizedReadbackEvidence(report)).toBe(report);
    expect(report).toMatchObject({
      schema: SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      solanaNetwork: "testnet",
      solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      ready: true,
      blockerIds: [],
      snapshot: {
        commitment: "finalized",
        consistency: {
          discoveryContextSlot: 500_000_000,
          preEnumerationContextSlot: 500_000_001,
          snapshotContextSlot: 500_000_002,
          postEnumerationContextSlot: 500_000_003,
          accountCount: 12,
          sourceTokenAccountCount: 1,
          tokenEnumerationStable: true,
        },
        sourceOwnerTokenAccounts: {
          ownerAddress: ATOMIC_READBACK_OWNER,
          balance: "5",
        },
      },
    });
    expect(Object.keys(report.snapshot.roles).sort()).toEqual([
      "destinationBridge",
      "nativeVerifier",
      "outerVerifier",
      "sourceBridge",
    ]);
    expect(fixture.calls.map((call) => call.phase)).toEqual([
      "discovery",
      "preEnumeration",
      "snapshot",
      "postEnumeration",
    ]);
    expect(
      fixture.calls.every((call) => call.config.commitment === "finalized"),
    ).toBe(true);
    expect(fixture.calls[1].config.minContextSlot).toBe(500_000_000);
    expect(fixture.calls[2].config.minContextSlot).toBe(500_000_001);
    expect(fixture.calls[3].config.minContextSlot).toBe(500_000_002);
    const nativeView = solanaFinalizedReadbackRoleEvidence(
      report,
      "nativeVerifier",
    );
    expect(nativeView).toMatchObject({
      role: "nativeVerifier",
      canonicalSnapshotSha256: report.canonicalSnapshotSha256,
      programId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      programDataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
    });
  });

  it("rejects missing, duplicated, and swapped program roles", async () => {
    await expect(
      captureAtomicReadbackFixture({
        publicConfigOverrides: { nativeVerifierProgramId: undefined },
      }),
    ).rejects.toThrow(/missing the native verifier program id/u);
    await expect(
      captureAtomicReadbackFixture({
        publicConfigOverrides: {
          nativeVerifierProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
        },
      }),
    ).rejects.toThrow(/program roles must be distinct/u);
    await expect(
      captureAtomicReadbackFixture({
        publicConfigOverrides: {
          nativeVerifierProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
          bridgeProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        },
      }),
    ).rejects.toThrow(
      /config report does not match|does not bind the reviewed native verifier role/u,
    );
    await expect(
      captureAtomicReadbackFixture({
        omitAddress: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      }),
    ).rejects.toThrow(/does not exist/u);
  });

  it("rejects backward RPC contexts and future ProgramData slots", async () => {
    await expect(
      captureAtomicReadbackFixture({
        slots: { preEnumeration: 499_999_999 },
      }),
    ).rejects.toThrow(/backward Solana context slot/u);
    await expect(
      captureAtomicReadbackFixture({
        slots: { snapshot: 500_000_000 },
      }),
    ).rejects.toThrow(/backward Solana context slot/u);
    await expect(
      captureAtomicReadbackFixture({
        slots: { postEnumeration: 500_000_001 },
      }),
    ).rejects.toThrow(/backward Solana context slot/u);
    await expect(
      captureAtomicReadbackFixture({
        programdataSlotOverrides: {
          [SOLANA_PROGRAMDATA_ADDRESS]: 500_000_003,
        },
      }),
    ).rejects.toThrow(/deployment slot is from the future/u);
  });

  it("rejects token-account set or content changes around the snapshot", async () => {
    await expect(
      captureAtomicReadbackFixture({ postTokenSetChanged: true }),
    ).rejects.toThrow(/token-account set changed/u);
    await expect(
      captureAtomicReadbackFixture({ postTokenContentChanged: true }),
    ).rejects.toThrow(/token-account content changed/u);
  });

  it("rejects semantic role and config tampering even after the snapshot hash is recomputed", async () => {
    const { report } = await captureAtomicReadbackFixture();
    const swapped = structuredClone(report);
    const nativeRole = swapped.snapshot.roles.nativeVerifier;
    const destinationRole = swapped.snapshot.roles.destinationBridge;
    swapped.snapshot.roles.nativeVerifier = {
      ...destinationRole,
      role: "nativeVerifier",
      label: "native verifier",
    };
    swapped.snapshot.roles.destinationBridge = {
      ...nativeRole,
      role: "destinationBridge",
      label: "destination bridge",
    };
    swapped.canonicalSnapshotSha256 =
      recomputeAtomicReadbackSnapshotHash(swapped);
    expect(() => validateSolanaFinalizedReadbackEvidence(swapped)).toThrow(
      /substituted or role-swapped/u,
    );

    const configTamper = structuredClone(report);
    configTamper.snapshot.sourceBridgeConfig.observed.verifierProgramId =
      SOLANA_DESTINATION_BRIDGE_PROGRAM_ID;
    configTamper.snapshot.sourceBridgeConfig.observedHash = `0x${createHash(
      "sha256",
    )
      .update(JSON.stringify(configTamper.snapshot.sourceBridgeConfig.observed))
      .digest("hex")}`;
    configTamper.canonicalSnapshotSha256 =
      recomputeAtomicReadbackSnapshotHash(configTamper);
    expect(() => validateSolanaFinalizedReadbackEvidence(configTamper)).toThrow(
      /source-bridge config hash is invalid/u,
    );

    const wrongChain = structuredClone(report);
    wrongChain.solanaGenesisHash = SystemProgram.programId.toBase58();
    wrongChain.canonicalSnapshotSha256 =
      recomputeAtomicReadbackSnapshotHash(wrongChain);
    expect(() => validateSolanaFinalizedReadbackEvidence(wrongChain)).toThrow(
      /route or testnet identity is invalid/u,
    );
  });

  it("records a stale source-config pin only in manifestComparison without rewriting canonical chain readiness", async () => {
    const fixture = buildAtomicReadbackFixture();
    const manifest = {
      postDeployLiveEvidence: {
        sourceBridgeConfigHash: hex32("ab"),
      },
    };
    const before = JSON.stringify(manifest);
    const report = await captureSolanaFinalizedReadbackEvidence({
      connection: fixture.connection,
      publicConfig: fixture.publicConfig,
      publicConfigInput: fixture.publicConfigInput,
      manifest,
      manifestInput: {
        path: "/reviewed/route.manifest.json",
        sizeBytes: 128,
        sha256: materialHex32("atomic-manifest"),
        stableRead: true,
      },
      nativeVerifierConfigReport: fixture.nativeVerifierConfigReport,
      nativeVerifierConfigInput: fixture.nativeVerifierConfigInput,
      capturedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.blockerIds).toEqual([]);
    expect(report.snapshot.sourceBridgeConfig).not.toHaveProperty(
      "expectedHash",
    );
    expect(report.manifestComparison).toMatchObject({
      expectedSourceBridgeConfigHash: hex32("ab"),
      matchesExpected: false,
      ready: false,
      blockerIds: ["source-bridge-config-hash-mismatch"],
    });
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it("keeps the canonical snapshot hash independent of manifest bytes and expected pins", async () => {
    const { report: baseline } = await captureAtomicReadbackFixture();
    const observedHash = baseline.snapshot.sourceBridgeConfig.observedHash;
    const captures = await Promise.all([
      captureAtomicReadbackFixture(
        {},
        {
          manifest: {
            postDeployLiveEvidence: { sourceBridgeConfigHash: hex32("ab") },
          },
          manifestInput: {
            path: "/reviewed/route-a.manifest.json",
            sizeBytes: 111,
            sha256: materialHex32("manifest-a"),
            stableRead: true,
          },
        },
      ),
      captureAtomicReadbackFixture(
        {},
        {
          manifest: {
            postDeployLiveEvidence: {
              sourceBridgeConfigHash: observedHash,
            },
          },
          manifestInput: {
            path: "/reviewed/route-b.manifest.json",
            sizeBytes: 222,
            sha256: materialHex32("manifest-b"),
            stableRead: true,
          },
        },
      ),
    ]);

    expect(
      captures.map(({ report }) => report.canonicalSnapshotSha256),
    ).toEqual([
      baseline.canonicalSnapshotSha256,
      baseline.canonicalSnapshotSha256,
    ]);
    expect(captures[0].report.manifestComparison).toMatchObject({
      expectedSourceBridgeConfigHash: hex32("ab"),
      matchesExpected: false,
    });
    expect(captures[1].report.manifestComparison).toMatchObject({
      expectedSourceBridgeConfigHash: observedHash,
      matchesExpected: true,
    });
    expect(captures[0].report.inputs).not.toHaveProperty("manifest");
    expect(captures[1].report.snapshot.publicInputs).not.toHaveProperty(
      "manifestSha256",
    );
  });

  it("keeps canonical finalized-readback evidence out of route-manifest output", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-route-output-"));
    const templatePath = path.join(root, "template.json");
    const evidencePath = path.join(root, "finalized-readback.json");
    const outputPath = path.join(root, "route.manifest.json");
    try {
      const { report } = await captureAtomicReadbackFixture();
      const roles = report.snapshot.roles;
      const destinationBindingHash =
        report.snapshot.sourceBridgeConfig.observed.destinationBindingHash;
      const browserProver = (seed) => ({
        module_url: `https://provers.sora.org/${seed}.mjs`,
        module_hash: materialHex32(`${seed}:module`),
        manifest_hash: materialHex32(`${seed}:manifest`),
        bound_route_hash: destinationBindingHash,
        bound_proof_hash: materialHex32(`${seed}:proof`),
        expected_exports: ["verifySccpProof"],
      });
      writeJsonFixture(templatePath, {
        production_ready: true,
        taira_xor_token_address:
          report.snapshot.reviewedAddresses.tokenMintAddress,
        taira_xor_bridge_address: roles.destinationBridge.program.address,
        sccp_solana_source_bridge_address: roles.sourceBridge.program.address,
        solana_verifier_program_id: roles.outerVerifier.program.address,
        destination_binding_key: "sccp:solana-testnet:taira_sol_xor",
        taira_burn_record_settlement_asset_definition_id: "xor#sora",
        taira_burn_record_contract_artifact_b64: "AQIDBA==",
        taira_burn_record_vk_backend: "groth16",
        taira_burn_record_vk_name: "taira_sol_xor_burn_record_v1",
        verifier_code_hash: roles.outerVerifier.loaderV3.executableBlake2b256,
        verifier_key_hash: materialHex32("route-output-verifier-key"),
        destination_binding_hash: destinationBindingHash,
        taira_burn_record_artifact_sha256: materialHex32(
          "route-output-burn-artifact",
        ),
        taira_burn_record_code_hash: materialHex32("route-output-burn-code"),
        destination_browser_prover: browserProver("destination"),
        source_browser_prover: browserProver("source"),
      });
      writeJsonFixture(evidencePath, report);

      const result = spawnSync(
        process.execPath,
        [
          path.resolve("../iroha/scripts/sccp_solana_taira_xor_deploy.mjs"),
          "route-manifest",
          "--template",
          templatePath,
          "--evidence",
          evidencePath,
          "--output",
          outputPath,
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(output).not.toHaveProperty("canonicalFinalizedReadback");
      expect(output).not.toHaveProperty("canonical_finalized_readback");
      expect(output).not.toHaveProperty("canonicalSnapshotSha256");
      expect(output).not.toHaveProperty("canonical_snapshot_sha256");
      expect(JSON.stringify(output)).not.toContain(
        report.canonicalSnapshotSha256,
      );
      expect(JSON.stringify(output)).not.toContain(
        JSON.stringify(report.snapshot),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds the stable native-verifier report to the native role", async () => {
    const fixture = buildAtomicReadbackFixture();
    await expect(
      captureSolanaFinalizedReadbackEvidence({
        connection: fixture.connection,
        publicConfig: fixture.publicConfig,
        publicConfigInput: fixture.publicConfigInput,
        nativeVerifierConfigReport: {
          ...fixture.nativeVerifierConfigReport,
          nativeVerifierProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
        },
        nativeVerifierConfigInput: fixture.nativeVerifierConfigInput,
      }),
    ).rejects.toThrow(/config report does not match/u);
  });

  it("binds every available native-config pin and configured-state hash", async () => {
    const mismatches = [
      { verifierProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID },
      { verifierStateAddress: ATOMIC_READBACK_SOURCE_STATE_ADDRESS },
      { nativeVerifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS },
      { nativeVerifierProgramdataSlot: "1" },
      { nativeVerifierCodeHash: materialHex32("wrong-native-code") },
      { verifierMaterialHash: materialHex32("wrong-native-material") },
      { verifierConfigHash: materialHex32("wrong-native-config") },
      { configuredState: { dataSha256: materialHex32("wrong-state") } },
    ];
    for (const mismatch of mismatches) {
      const fixture = buildAtomicReadbackFixture();
      await expect(
        captureSolanaFinalizedReadbackEvidence({
          connection: fixture.connection,
          publicConfig: fixture.publicConfig,
          publicConfigInput: fixture.publicConfigInput,
          nativeVerifierConfigReport: {
            ...fixture.nativeVerifierConfigReport,
            ...mismatch,
          },
          nativeVerifierConfigInput: fixture.nativeVerifierConfigInput,
        }),
      ).rejects.toThrow(/native-verifier config report/u);
    }
  });

  it("marks an unlinked verifier state blocked and rejects frozen or uninitialized source tokens", async () => {
    const { report } = await captureAtomicReadbackFixture({
      nativeVerifierConfigured: false,
    });
    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain("native-verifier-state-unconfigured");

    await expect(
      captureAtomicReadbackFixture({ tokenAccountState: 2 }),
    ).rejects.toThrow(/not bound to the reviewed owner and mint/u);
    await expect(
      captureAtomicReadbackFixture({ tokenAccountState: 0 }),
    ).rejects.toThrow(/not bound to the reviewed owner and mint/u);
  });

  it("rechecks testnet identity after the final fence and redacts RPC URL secrets", async () => {
    await expect(
      captureAtomicReadbackFixture({ identityChangesAfterFence: true }),
    ).rejects.toThrow(/identity check failed|not Solana testnet/u);

    const { report } = await captureAtomicReadbackFixture({
      rpcEndpoint:
        "https://operator:secret@api.testnet.solana.com/?api-key=hidden#fragment",
    });
    expect(report.rpcUrl).toBe("https://api.testnet.solana.com/");
    expect(report.rpcUrlRedacted).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("hidden");
  });

  it("matches all stable public-config and manifest identities, not only the outer alias", async () => {
    const { fixture, report } = await captureAtomicReadbackFixture();
    expect(
      assertSolanaFinalizedReadbackMatchesSelection({
        evidence: report,
        publicConfig: fixture.publicConfig,
      }),
    ).toBe(report);
    for (const [key, value] of [
      ["verifierProgramId", SOLANA_DESTINATION_BRIDGE_PROGRAM_ID],
      ["nativeVerifierProgramId", SOLANA_DESTINATION_BRIDGE_PROGRAM_ID],
      ["bridgeProgramId", SOLANA_SOURCE_BRIDGE_PROGRAM_ID],
      ["sourceBridgeProgramId", SOLANA_DESTINATION_BRIDGE_PROGRAM_ID],
      ["verifierStateAddress", ATOMIC_READBACK_SOURCE_STATE_ADDRESS],
      ["sourceStateAddress", SOLANA_VERIFIER_STATE_ADDRESS],
      ["tokenMintAddress", SOLANA_VERIFIER_STATE_ADDRESS],
      ["deployerAddress", SystemProgram.programId.toBase58()],
    ]) {
      expect(() =>
        assertSolanaFinalizedReadbackMatchesSelection({
          evidence: report,
          publicConfig: { ...fixture.publicConfig, [key]: value },
        }),
      ).toThrow(/does not match|conflicting/u);
    }

    const roles = report.snapshot.roles;
    const manifest = {
      solanaVerifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
      solanaProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
      sccpSolanaSourceBridgeAddress: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
      solanaNativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      solanaTokenMint: SOLANA_TOKEN_MINT_ADDRESS,
      solanaVerifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      solanaSourceStateAddress: ATOMIC_READBACK_SOURCE_STATE_ADDRESS,
      solanaProgramdataAddress: roles.outerVerifier.programdata.address,
      solanaProgramdataSlot: roles.outerVerifier.loaderV3.deploymentSlot,
      verifierCodeHash: roles.outerVerifier.loaderV3.executableBlake2b256,
      solanaNativeVerifierProgramdataAddress:
        roles.nativeVerifier.programdata.address,
      solanaNativeVerifierProgramdataSlot:
        roles.nativeVerifier.loaderV3.deploymentSlot,
      solanaNativeVerifierCodeHash:
        roles.nativeVerifier.loaderV3.executableBlake2b256,
      solanaBridgeProgramdataAddress:
        roles.destinationBridge.programdata.address,
      solanaBridgeProgramdataSlot:
        roles.destinationBridge.loaderV3.deploymentSlot,
      solanaBridgeCodeHash:
        roles.destinationBridge.loaderV3.executableBlake2b256,
      solanaSourceBridgeProgramdataAddress:
        roles.sourceBridge.programdata.address,
      solanaSourceBridgeProgramdataSlot:
        roles.sourceBridge.loaderV3.deploymentSlot,
      solanaSourceBridgeCodeHash:
        roles.sourceBridge.loaderV3.executableBlake2b256,
      destinationBindingHash: SOLANA_DESTINATION_BINDING_HASH,
    };
    expect(
      assertSolanaFinalizedReadbackMatchesSelection({
        evidence: report,
        publicConfig: fixture.publicConfig,
        manifest,
      }),
    ).toBe(report);
    for (const mutation of [
      { solanaNativeVerifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS },
      { solanaBridgeProgramdataSlot: "1" },
      { solanaSourceBridgeCodeHash: materialHex32("wrong-source-code") },
      { destinationBindingHash: materialHex32("wrong-binding") },
    ]) {
      expect(() =>
        assertSolanaFinalizedReadbackMatchesSelection({
          evidence: report,
          publicConfig: fixture.publicConfig,
          manifest: { ...manifest, ...mutation },
        }),
      ).toThrow(/does not match|pins do not match|not canonical/u);
    }
  });

  it("stable-loads exact evidence bytes and rejects tamper, symlink, and hardlink substitution", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-readback-"));
    const evidencePath = path.join(root, "finalized-readback.json");
    const symlinkPath = path.join(root, "finalized-readback-link.json");
    const hardlinkPath = path.join(root, "finalized-readback-hardlink.json");
    try {
      const { report } = await captureAtomicReadbackFixture();
      writeJsonFixture(evidencePath, report);
      const expectedSha256 = `0x${createHash("sha256")
        .update(readFileSync(evidencePath))
        .digest("hex")}`;
      await expect(
        loadStableSolanaFinalizedReadbackEvidence({
          file: evidencePath,
          expectedSha256,
        }),
      ).resolves.toMatchObject({
        artifact: { sha256: expectedSha256, stableRead: true },
        evidence: { canonicalSnapshotSha256: report.canonicalSnapshotSha256 },
      });

      symlinkSync(evidencePath, symlinkPath);
      await expect(
        loadStableSolanaFinalizedReadbackEvidence({ file: symlinkPath }),
      ).rejects.toThrow(/non-symlink regular file/u);

      linkSync(evidencePath, hardlinkPath);
      await expect(
        loadStableSolanaFinalizedReadbackEvidence({ file: hardlinkPath }),
      ).rejects.toThrow(/singly-linked regular file/u);
      rmSync(hardlinkPath);

      writeJsonFixture(evidencePath, { ...report, capturedAt: "tampered" });
      await expect(
        loadStableSolanaFinalizedReadbackEvidence({
          file: evidencePath,
          expectedSha256,
        }),
      ).rejects.toThrow(/independent SHA-256 pin/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unpinned existing canonical evidence at the production selection boundary", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-unpinned-"));
    const evidencePath = path.join(root, "finalized-readback.json");
    try {
      const { report } = await captureAtomicReadbackFixture();
      writeJsonFixture(evidencePath, report);

      await expect(
        loadSelectedSolanaDeploymentMaterial({
          args: {
            "output-dir": root,
            evidence: evidencePath,
          },
        }),
      ).rejects.toThrow(/--expected-evidence-sha256/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const baseProductionManifest = () => ({
  route_id: "taira_sol_xor",
  routeId: "taira_sol_xor",
  asset_key: "xor",
  assetKey: "xor",
  counterparty_domain: 3,
  chain: "solana-testnet",
  chain_id_hex: "0x736f6c616e612d746573746e6574",
  counterparty_account_codec: 3,
  counterparty_account_codec_key: "solana_base58",
  verifier_target: "SolanaProgram",
  destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
  solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
  production_ready: true,
  productionReady: true,
  solana_token_mint: "8291HWJXDb4wHWULcA78A43Zk72pHvfa6xKhM9GLGnS4",
  solana_program_id: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
  solanaBridgeProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
  solana_bridge_program_id: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
  sccp_solana_source_bridge_address: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
  solanaSourceBridgeProgramId: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
  solana_source_bridge_program_id: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
  solana_source_state_address: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
  solana_verifier_program_id: SOLANA_VERIFIER_PROGRAM_ID,
  solanaVerifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
  solanaVerifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
  solana_verifier_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
  solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
  solana_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
  solanaVerifierProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
  solana_verifier_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
  solanaProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
  solana_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
  solanaVerifierArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solana_verifier_artifact_sha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  verifierProgramArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  verifier_program_artifact_sha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solanaVerifierCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solana_verifier_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solanaBridgeProgramdataAddress: SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
  solana_bridge_programdata_address:
    SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
  solanaBridgeProgramdataSlot: SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT,
  solana_bridge_programdata_slot: SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT,
  solanaBridgeArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solana_bridge_artifact_sha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solanaBridgeCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solana_bridge_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solanaSourceBridgeProgramdataAddress:
    SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
  solana_source_bridge_programdata_address:
    SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
  solanaSourceBridgeProgramdataSlot: SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
  solana_source_bridge_programdata_slot: SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
  solanaSourceBridgeArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solana_source_bridge_artifact_sha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
  solanaSourceBridgeCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solana_source_bridge_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  solana_native_verifier_program_id: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
  solanaNativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
  solana_native_verifier_programdata_address: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
  solanaNativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
  solana_native_verifier_programdata_slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
  solanaNativeVerifierProgramdataSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
  solana_native_verifier_code_hash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
  solanaNativeVerifierCodeHash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
  solana_native_verifier_artifact_sha256:
    SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
  solanaNativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
  solana_native_verifier_material_hash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
  solanaNativeVerifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
  solana_native_verifier_config_hash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
  solanaNativeVerifierConfigHash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
  solana_native_verifier_key_hash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
  solanaNativeVerifierKeyHash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
  solana_native_verifier_governance_approval_evidence_hash:
    SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
  solanaNativeVerifierGovernanceApprovalEvidenceHash:
    SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
  verifier_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
  verifier_key_hash: hex32("2"),
  destination_binding_hash: hex32("3"),
  destination_binding_key: "sccp:0:3:sol:solana-program-v1:2",
  destination_rollout: {
    proof_verification_mode: "native-recursive-verifier-v1",
    native_verifier_program_id: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    native_verifier_programdata_address: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
    native_verifier_programdata_slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
    native_verifier_code_hash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
    native_verifier_artifact_sha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
    native_verifier_material_hash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
    native_verifier_config_hash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
    native_verifier_key_hash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
    native_verifier_governance_approval_evidence_hash:
      SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
    verifier_enforcement_evidence_hash: hex32("ee"),
    immutable_verifier_ready: true,
    anchors_ready: true,
    blockers: [],
  },
  destinationRollout: {
    proofVerificationMode: "native-recursive-verifier-v1",
    nativeVerifierProgramId: "ComputeBudget111111111111111111111111111111",
    verifierEnforcementEvidenceHash: hex32("ee"),
    immutableVerifierReady: true,
    anchorsReady: true,
    blockers: [],
  },
  destination_proof_admission: {
    admission_mode: "governed-zk-verifier-v1",
    proof_system: "stark-fri-v1",
    entrypoint: "submit_sccp_message_proof",
    native_verifier_program_id: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    native_verifier_programdata_address: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
    native_verifier_programdata_slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
    native_verifier_code_hash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
    native_verifier_artifact_sha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
    native_verifier_material_hash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
    native_verifier_config_hash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
    native_verifier_key_hash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
    native_verifier_governance_approval_evidence_hash:
      SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
    verifier_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
    verifier_key_hash: hex32("2"),
    destination_binding_hash: hex32("3"),
    proof_verification_mode: "native-recursive-verifier-v1",
    verifier_enforcement_evidence_hash: hex32("ee"),
    shape_only: false,
    accepts_unverified_proofs: false,
  },
  destination_browser_prover: {
    module_url: "/sccp-solana/taira-solana-xor-destination-prover.js",
    module_hash: hex32("4"),
    manifest_hash: hex32("5"),
    sidecar_hash: hex32("5"),
    proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
    required_proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
    genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
    destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
    verifier_target: SOLANA_VERIFIER_TARGET,
    production_proofs_ready: true,
  },
  source_browser_prover: {
    module_url: "/sccp-solana/taira-solana-xor-source-prover.js",
    module_hash: hex32("6"),
    manifest_hash: hex32("7"),
    sidecar_hash: hex32("7"),
    proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
    required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
    genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
    production_proofs_ready: true,
  },
  source_verifier_material: {
    source_domain: 3,
    target_domain: 0,
    source_trust_anchor_hash: hex32("8"),
    consensus_verifier_hash: hex32("9"),
    message_inclusion_verifier_hash: hex32("a"),
    finality_policy_hash: hex32("b"),
    source_state_verifier_hash: hex32("c"),
  },
  source_adapter_engine_deployment: {
    source_domain: 3,
    target_domain: 0,
    deployment_receipt_hash: hex32("d"),
  },
  post_deploy_live_evidence: {
    full_toml_ready: true,
    source_bridge_config_hash: hex32("e"),
    route_canary_evidence_hash: hex32("f"),
    offline_full_toml_sha256: hex32("a1"),
    source_event_transaction_signature:
      "4P3VXACDS99p6Yx7Xd6q2fQ8PHe8YdwJRdPyMA7aQRWMe8XbrtoE6hrgXfzn9T7VA1vm5a2MgmXjHD3FTAFDujhq",
    route_canary_transaction_signature:
      "4jVUe2ouFKLYLjreoQAz5KxK4Gaxm6M9ydma2Frv2LSAMmztTShjQZ4kH7CDVYmo8phCrWkEkCqrxfYT39D8yCbT",
  },
});

const finalizationReadyFixture = ({
  programBytes = buildSbfProgramBytes({ includeSentinel: false }),
  liveProgramBytes = programBytes,
  manifestOverrides = {},
  readbackOverrides = {},
} = {}) => {
  const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
    buildProgramdataData({
      upgradeAuthority: null,
      programBytes: liveProgramBytes,
    }),
  );
  const verifierCodeHash = parsedProgramdata.executableBlake2b256;
  const verifierArtifactSha256 = `0x${createHash("sha256")
    .update(programBytes)
    .digest("hex")}`;
  const base = baseProductionManifest();
  const manifest = {
    ...base,
    solana_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
    solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
    solana_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
    solanaProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
    solana_verifier_state_address: SOLANA_VERIFIER_STATE_ADDRESS,
    solanaVerifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
    solana_token_mint: SOLANA_TOKEN_MINT_ADDRESS,
    solanaTokenMint: SOLANA_TOKEN_MINT_ADDRESS,
    verifierCodeHash,
    verifier_code_hash: verifierCodeHash,
    verifierProgramArtifactSha256: verifierArtifactSha256,
    verifier_program_artifact_sha256: verifierArtifactSha256,
    destinationBindingHash: SOLANA_DESTINATION_BINDING_HASH,
    destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
    destinationProofAdmission: {
      admissionMode: "governed-zk-verifier-v1",
      admission_mode: "governed-zk-verifier-v1",
      proofSystem: "stark-fri-v1",
      proof_system: "stark-fri-v1",
      verifierCodeHash,
      verifier_code_hash: verifierCodeHash,
      destinationBindingHash: SOLANA_DESTINATION_BINDING_HASH,
      destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
    },
    destination_proof_admission: {
      ...base.destination_proof_admission,
      verifier_code_hash: verifierCodeHash,
      destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
    },
    verifierEnforcement: {
      proofVerificationMode: "native-recursive-verifier-v1",
      verifierEnforcementEvidenceHash: hex32("ee"),
    },
    verifier_enforcement: {
      proof_verification_mode: "native-recursive-verifier-v1",
      verifier_enforcement_evidence_hash: hex32("ee"),
    },
    ...manifestOverrides,
  };
  return {
    programBytes,
    parsedProgramdata,
    verifierCodeHash,
    verifierArtifactSha256,
    manifest,
    governedNativeVerifierValidation: readyGovernedNativeVerifierValidation(),
    liveReadback: buildVerifierLinkageReadback({
      parsedProgramdata,
      ...readbackOverrides,
    }),
  };
};

const jsonSha256 = (value) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const productionGovernanceApprovalRecord = ({
  pins = {},
  ...overrides
} = {}) => ({
  schema: "iroha-demo-sccp-solana-production-governance-approval/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
  approved: true,
  approvalId: "test-governance-approval",
  pins: {
    sourceVerifierMaterialHash: materialHex32("approved-source-material"),
    sourceAdapterEngineDeploymentHash: materialHex32("approved-source-adapter"),
    offlineFullTomlSha256: materialHex32("approved-offline-toml"),
    destinationProverModuleHash: materialHex32("destination-module"),
    destinationProverSidecarHash: materialHex32("destination-sidecar"),
    destinationProverKnownAnswerVectorHash: materialHex32(
      "destination-known-answer-vector",
    ),
    sourceProverModuleHash: materialHex32("source-module"),
    sourceProverSidecarHash: materialHex32("source-sidecar"),
    sourceProverKnownAnswerVectorHash: materialHex32(
      "source-known-answer-vector",
    ),
    destinationProofAdmissionHash: jsonSha256(
      baseProductionManifest().destination_proof_admission,
    ),
    outerVerifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
    outerVerifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
    outerVerifierProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
    outerVerifierArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
    outerVerifierCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
    destinationBridgeProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
    destinationBridgeProgramdataAddress:
      SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
    destinationBridgeProgramdataSlot:
      SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT,
    destinationBridgeArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
    destinationBridgeCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
    sourceBridgeProgramId: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
    sourceBridgeProgramdataAddress: SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
    sourceBridgeProgramdataSlot: SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
    sourceBridgeArtifactSha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
    sourceBridgeCodeHash: SOLANA_SHARED_PROGRAM_CODE_HASH,
    nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    nativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
    nativeVerifierProgramdataSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
    nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
    nativeVerifierCodeHash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
    nativeVerifierKeyHash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
    ...pins,
  },
  ...overrides,
});

const readyProductionGovernanceApprovalValidation = ({
  pins = {},
  approvalSha256 = SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
  expectedApprovalSha256 = approvalSha256,
  recordOverrides = {},
} = {}) =>
  buildSolanaProductionGovernanceApprovalValidation({
    approvalRecord: productionGovernanceApprovalRecord({
      pins,
      ...recordOverrides,
    }),
    approvalPath: "/public/sccp-solana/production-governance-approval.json",
    approvalSha256,
    expectedApprovalSha256,
    checkedAt: "2026-07-09T00:00:00.000Z",
  });

const readyInventoryGovernanceApproval = ({
  sourceVerifierMaterialHash,
  sourceAdapterEngineDeploymentHash,
  offlineFullTomlSha256,
  manifest = baseProductionManifest(),
  destinationProofAdmissionHash = null,
} = {}) =>
  readyProductionGovernanceApprovalValidation({
    pins: {
      sourceVerifierMaterialHash,
      sourceAdapterEngineDeploymentHash,
      offlineFullTomlSha256,
      destinationProofAdmissionHash:
        destinationProofAdmissionHash ??
        jsonSha256(
          manifest.destinationProofAdmission ??
            manifest.destination_proof_admission,
        ),
    },
  });

const readyGovernanceProgramRoleReadbacks = ({ overrides = {} } = {}) => {
  const approval = productionGovernanceApprovalRecord().pins;
  return Object.fromEntries(
    [
      ["outerVerifier", "outerVerifier"],
      ["destinationBridge", "destinationBridge"],
      ["sourceBridge", "sourceBridge"],
      ["nativeVerifier", "nativeVerifier"],
    ].map(([role, prefix]) => {
      const roleOverride = overrides[role] ?? {};
      return [
        role,
        roleOverride.readback ?? {
          program: {
            address: roleOverride.programId ?? approval[`${prefix}ProgramId`],
          },
          parsedProgram: {
            programdataAddress:
              roleOverride.programdataAddress ??
              approval[`${prefix}ProgramdataAddress`],
          },
          parsedProgramdata: {
            slot:
              roleOverride.programdataSlot ??
              approval[`${prefix}ProgramdataSlot`],
            executableBlake2b256:
              roleOverride.codeHash ?? approval[`${prefix}CodeHash`],
            immutable: roleOverride.immutable ?? true,
          },
        },
      ];
    }),
  );
};

const readyGovernanceProgramRoleArtifactHashes = () => {
  const pins = productionGovernanceApprovalRecord().pins;
  return {
    outerVerifier: pins.outerVerifierArtifactSha256,
    destinationBridge: pins.destinationBridgeArtifactSha256,
    sourceBridge: pins.sourceBridgeArtifactSha256,
    nativeVerifier: pins.nativeVerifierArtifactSha256,
  };
};

const readyGovernanceProgramRolePublicationPins = () => {
  const approval = readyProductionGovernanceApprovalValidation();
  const roles = Object.fromEntries(
    [
      ["outerVerifier", "outerVerifier"],
      ["destinationBridge", "destinationBridge"],
      ["sourceBridge", "sourceBridge"],
      ["nativeVerifier", "nativeVerifier"],
    ].map(([role, prefix]) => [
      role,
      {
        programId: approval.pins[`${prefix}ProgramId`],
        programdataAddress: approval.pins[`${prefix}ProgramdataAddress`],
        programdataSlot: approval.pins[`${prefix}ProgramdataSlot`],
        artifactSha256: approval.pins[`${prefix}ArtifactSha256`],
        codeHash: approval.pins[`${prefix}CodeHash`],
      },
    ]),
  );
  return {
    schema: "iroha-demo-sccp-solana-governance-program-role-pins/v1",
    approvalSha256: approval.approvalSha256,
    expectedApprovalSha256: approval.expectedApprovalSha256,
    roles,
  };
};

const governedNativeVerifierPackage = ({
  materialOverrides = {},
  configOverrides = {},
  packageOverrides = {},
} = {}) => {
  const material = {
    ...BASE_GOVERNED_NATIVE_VERIFIER_MATERIAL,
    ...materialOverrides,
  };
  const config = {
    ...BASE_GOVERNED_NATIVE_VERIFIER_CONFIG,
    nativeVerifierProgramId: material.nativeVerifierProgramId,
    nativeVerifierProgramdataAddress: material.nativeVerifierProgramdataAddress,
    nativeVerifierProgramdataSlot: material.nativeVerifierProgramdataSlot,
    nativeVerifierArtifactSha256: material.nativeVerifierArtifactSha256,
    nativeVerifierCodeHash: material.nativeVerifierCodeHash,
    verifierMaterialHash: jsonSha256(material),
    verifierKeyHash: material.verifierKeyHash,
    governanceApprovalEvidenceHash: material.governanceApprovalEvidenceHash,
    ...configOverrides,
  };
  return {
    schema: "iroha-demo-sccp-solana-governed-native-verifier-package/v1",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    reviewed: true,
    productionReady: true,
    material,
    config,
    ...packageOverrides,
  };
};

const readyGovernedNativeVerifierValidation = () =>
  buildSolanaGovernedNativeVerifierPackageValidation({
    packageRecord: governedNativeVerifierPackage(),
    nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
    governanceApprovalValidation: readyProductionGovernanceApprovalValidation(),
    packagePath: "/public/sccp-solana/governed-native-verifier.json",
    packageSha256: materialHex32("governed-native-package"),
  });

const mcpSignedTransactionTool = (name) => ({
  name,
  inputSchema: {
    additionalProperties: false,
    type: "object",
    required: ["body_base64"],
    properties: {
      body_base64: {
        type: "string",
      },
    },
  },
});

const readyMcpTransactionTools = () =>
  buildTairaMcpTransactionToolStatus({
    mcpUrl: "https://taira.sora.org/v1/mcp",
    toolsPayload: {
      result: {
        tools: [
          { name: "iroha.accounts.get" },
          { name: "iroha.da.manifests.get" },
          mcpSignedTransactionTool("iroha.transactions.submit"),
          mcpSignedTransactionTool("iroha.transactions.submit_and_wait"),
        ],
      },
    },
  });

const readyAuthorityPermission = () =>
  buildTairaRouteManagerPermissionStatus({
    mcpUrl: "https://taira.sora.org/v1/mcp",
    authority: ROUTE_MANAGER_AUTHORITY,
    permissionsPayload: {
      result: {
        structuredContent: {
          body: {
            items: [
              { name: "CanTransferAssetWithDefinition" },
              { name: "CanManageSccpRouteManifests" },
            ],
            total: 2,
          },
        },
      },
    },
  });

const publishedSolanaRoutePreflight = (manifestCanonicalSha256) => ({
  ready: true,
  checks: [
    { id: "taira-endpoint", status: "pass", detail: "ok" },
    { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
    { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
    { id: "public-route-publication", status: "pass", detail: "published" },
    { id: "solana-lane-publication", status: "pass", detail: "published" },
    {
      id: "solana-route-instance-publication",
      status: "pass",
      detail: "published",
    },
    {
      id: "route-manifest-shape",
      status: "pass",
      detail: "published",
      evidence: { manifestCanonicalSha256 },
    },
  ],
});

const expectExactManifestPin = (command, manifestPath, manifestSha256) => {
  for (const [flag, value] of [
    ["--manifest", manifestPath],
    ["--expected-manifest-sha256", manifestSha256],
  ]) {
    const indexes = command.flatMap((entry, index) =>
      entry === flag ? [index] : [],
    );
    expect(indexes).toHaveLength(1);
    expect(command[indexes[0] + 1]).toBe(value);
  }
};

const withProcessEnv = (values, fn) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const writeJsonFixture = (filePath, value) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

describe("Solana reviewed readback input binding", () => {
  it("selects the exact explicit native-verifier report and records its stable byte hash", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-native-input-"));
    const paths = solanaDeployArtifactPaths({ "output-dir": root });
    const fallbackPath = paths.nativeVerifierConfigureReport;
    const explicitPath = path.join(root, "reviewed", "native-config.json");
    const explicit = {
      schema: "iroha-demo-sccp-solana-native-verifier-configure/v1",
      ready: true,
      nativeVerifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
    };
    try {
      writeJsonFixture(fallbackPath, {
        schema: "iroha-demo-sccp-solana-native-verifier-configure/v1",
        ready: false,
        marker: "must-not-be-selected",
      });
      writeJsonFixture(explicitPath, explicit);
      const exactBytes = readFileSync(explicitPath);
      const expectedSha256 = `0x${createHash("sha256")
        .update(exactBytes)
        .digest("hex")}`;
      const selected = await loadStableSolanaNativeVerifierConfigReport(
        {
          "native-verifier-config-report": explicitPath,
          "expected-native-verifier-config-report-sha256": expectedSha256,
        },
        paths,
      );
      expect(selected.report).toEqual(explicit);
      expect(selected.input).toMatchObject({
        selection: "explicit",
        requestedPath: explicitPath,
        present: true,
        stableRead: true,
        sizeBytes: exactBytes.length,
        sha256: expectedSha256,
        expectedSha256,
      });
      expect(selected.input.path).toMatch(/reviewed[/\\]native-config\.json$/u);
      expect(JSON.stringify(selected)).not.toContain("must-not-be-selected");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects absent, substituted, tampered, and symlinked explicit native-verifier reports without fallback", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-native-bad-"));
    const paths = solanaDeployArtifactPaths({ "output-dir": root });
    const fallbackPath = paths.nativeVerifierConfigureReport;
    const explicitPath = path.join(root, "reviewed-native-config.json");
    const symlinkPath = path.join(root, "native-config-link.json");
    const report = {
      schema: "iroha-demo-sccp-solana-native-verifier-configure/v1",
      ready: true,
    };
    try {
      writeJsonFixture(fallbackPath, report);
      await expect(
        loadStableSolanaNativeVerifierConfigReport(
          { "native-verifier-config-report": explicitPath },
          paths,
        ),
      ).rejects.toThrow();

      writeJsonFixture(explicitPath, report);
      const expectedSha256 = `0x${createHash("sha256")
        .update(readFileSync(explicitPath))
        .digest("hex")}`;
      writeJsonFixture(explicitPath, { ...report, ready: false });
      await expect(
        loadStableSolanaNativeVerifierConfigReport(
          {
            "native-verifier-config-report": explicitPath,
            "expected-native-verifier-config-report-sha256": expectedSha256,
          },
          paths,
        ),
      ).rejects.toThrow(/independent SHA-256 pin/u);

      symlinkSync(explicitPath, symlinkPath);
      await expect(
        loadStableSolanaNativeVerifierConfigReport(
          { "native-verifier-config-report": symlinkPath },
          paths,
        ),
      ).rejects.toThrow(/non-symlink regular file/u);

      rmSync(fallbackPath);
      await expect(
        loadStableSolanaNativeVerifierConfigReport(
          {
            "expected-native-verifier-config-report-sha256": expectedSha256,
          },
          paths,
        ),
      ).rejects.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks stale post-deploy manifest evidence without rewriting either hash", () => {
    const canonicalSnapshotSha256 = hex32("44");
    const evidenceArtifactSha256 = materialHex32(
      "current-finalized-readback-artifact",
    );
    const staged = {
      sourceArtifacts: {
        observedSourceBridgeConfigHash: hex32("11"),
        canonicalSnapshotSha256,
      },
      postDeployLiveEvidence: { sourceBridgeConfigHash: hex32("11") },
      manifestConformance: {
        finalizedReadbackEvidenceArtifactSha256: evidenceArtifactSha256,
      },
    };
    const current = {
      observedSourceBridgeConfigHash: hex32("22"),
      finalizedReadback: {
        canonicalSnapshotSha256,
        evidenceArtifactSha256,
      },
    };
    const before = JSON.stringify({ staged, current });
    expect(() =>
      assertFreshSolanaPostDeployManifestEvidence({
        postDeployManifestEvidence: staged,
        postDeployEvidence: current,
      }),
    ).toThrow(/stale/u);
    expect(JSON.stringify({ staged, current })).toBe(before);

    current.observedSourceBridgeConfigHash = hex32("11");
    expect(
      assertFreshSolanaPostDeployManifestEvidence({
        postDeployManifestEvidence: staged,
        postDeployEvidence: current,
      }),
    ).toBe(true);
    staged.postDeployLiveEvidence.sourceBridgeConfigHash = hex32("33");
    expect(() =>
      assertFreshSolanaPostDeployManifestEvidence({
        postDeployManifestEvidence: staged,
        postDeployEvidence: current,
      }),
    ).toThrow(/internally bind/u);
  });
});

describe("Solana SCCP route manifest publication guard", () => {
  it("publishes exact replay-safe destination and source account templates", () => {
    const templates = buildSolanaRouteInstructionAccountTemplates({
      verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      sourceStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
      mintAuthorityAddress: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
    });

    expect(templates.solanaVerifierMintInstructionAccounts).toEqual([
      { pubkey: "$payer", isSigner: true, isWritable: true },
      {
        pubkey: SOLANA_VERIFIER_STATE_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SOLANA_TOKEN_MINT_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: "$destinationToken", isSigner: false, isWritable: true },
      {
        pubkey: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: "$messageReceipt", isSigner: false, isWritable: true },
      { pubkey: "$systemProgram", isSigner: false, isWritable: false },
    ]);
    expect(templates.solanaSourceBurnInstructionAccounts).toEqual([
      { pubkey: "$owner", isSigner: true, isWritable: true },
      {
        pubkey: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        isSigner: false,
        isWritable: true,
      },
      { pubkey: "$sourceToken", isSigner: false, isWritable: true },
      {
        pubkey: SOLANA_TOKEN_MINT_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        isSigner: false,
        isWritable: false,
      },
      { pubkey: "$sourceBurnReceipt", isSigner: false, isWritable: true },
      { pubkey: "$systemProgram", isSigner: false, isWritable: false },
    ]);
  });

  it("keeps the legacy TAIRA route endpoint doctor check informational", () => {
    const checks = normalizeSolanaDoctorSiblingChecks([
      {
        name: "taira-governance-sccp-route-endpoint",
        ok: false,
        httpStatus: 502,
      },
      { name: "solana-testnet-rpc", ok: true },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        name: "taira-governance-sccp-route-endpoint",
        ok: false,
        optional: true,
        legacy: true,
        supersededBy: "taira-mcp-transaction-tools",
      }),
      { name: "solana-testnet-rpc", ok: true },
    ]);
    expect(checks.every((check) => check.ok || check.optional)).toBe(true);
  });

  it("summarizes TAIRA MCP transaction submit tools for publication readiness", () => {
    expect(readyMcpTransactionTools()).toMatchObject({
      ready: true,
      toolCount: 4,
      presentTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      missingTools: [],
      publicationMode: "signed-transaction-body-base64",
      signedTransactionSubmission: {
        ready: true,
        schemas: [
          {
            tool: "iroha.transactions.submit",
            present: true,
            bodyBase64Required: true,
            bodyBase64Type: "string",
          },
          {
            tool: "iroha.transactions.submit_and_wait",
            present: true,
            bodyBase64Required: true,
            bodyBase64Type: "string",
          },
        ],
      },
      dedicatedRouteManifestTools: [],
      readOnlyManifestTools: ["iroha.da.manifests.get"],
    });

    expect(
      buildTairaMcpTransactionToolStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        toolsPayload: {
          result: {
            tools: [mcpSignedTransactionTool("iroha.transactions.submit")],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      presentTools: ["iroha.transactions.submit"],
      missingTools: ["iroha.transactions.submit_and_wait"],
    });
  });

  it("rejects TAIRA MCP transaction tools without body_base64 signed transaction schemas", () => {
    const status = buildTairaMcpTransactionToolStatus({
      mcpUrl: "https://taira.sora.org/v1/mcp",
      toolsPayload: {
        result: {
          tools: [
            {
              name: "iroha.transactions.submit",
              inputSchema: {
                type: "object",
                properties: { body_base64: { type: "string" } },
              },
            },
            {
              name: "iroha.transactions.submit_and_wait",
              inputSchema: {
                type: "object",
                required: ["transaction"],
                properties: { transaction: { type: "string" } },
              },
            },
          ],
        },
      },
    });

    expect(status).toMatchObject({
      ready: false,
      missingTools: [],
      signedTransactionSubmission: {
        ready: false,
        schemas: [
          {
            tool: "iroha.transactions.submit",
            present: true,
            bodyBase64Required: false,
            bodyBase64Type: "string",
          },
          {
            tool: "iroha.transactions.submit_and_wait",
            present: true,
            bodyBase64Required: false,
            bodyBase64Type: null,
          },
        ],
      },
    });
  });

  it("summarizes the TAIRA publication surface for Solana operator and video evidence", () => {
    const surface = summarizeSolanaPublicationSurface({
      publishReadiness: {
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
      },
    });

    expect(surface).toMatchObject({
      toriiUrl: "https://taira.sora.org",
      mcpUrl: "https://taira.sora.org/v1/mcp",
      endpointReady: true,
      mcpTransactionToolsReady: true,
      publicationMode: "signed-transaction-body-base64",
      requiredTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      presentTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      missingTools: [],
      readOnlyManifestTools: ["iroha.da.manifests.get"],
      bodyBase64SubmissionReady: true,
      signedTransactionSubmission: {
        ready: true,
      },
    });
  });

  it("summarizes TAIRA route-manager authority permissions for publication readiness", () => {
    expect(readyAuthorityPermission()).toMatchObject({
      ready: true,
      checked: true,
      authority: ROUTE_MANAGER_AUTHORITY,
      requiredPermission: "CanManageSccpRouteManifests",
      hasRequiredPermission: true,
      permissions: [
        "CanManageSccpRouteManifests",
        "CanTransferAssetWithDefinition",
      ],
    });

    expect(
      buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: ROUTE_MANAGER_AUTHORITY,
        permissionsPayload: {
          result: {
            structuredContent: {
              body: {
                items: [{ name: "CanTransferAssetWithDefinition" }],
              },
            },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      checked: true,
      requiredPermission: "CanManageSccpRouteManifests",
      hasRequiredPermission: false,
      permissions: ["CanTransferAssetWithDefinition"],
    });

    expect(
      buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: "testu-route-manager",
        permissionsPayload: {
          result: {
            structuredContent: {
              body: {
                items: [{ name: "CanManageSccpRouteManifests" }],
              },
            },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      checked: false,
      authority: "testu-route-manager",
      hasRequiredPermission: false,
      permissions: [],
    });
  });

  it("extracts TAIRA route-manager permissions from MCP text bodies", () => {
    expect(
      buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: ROUTE_MANAGER_AUTHORITY,
        permissionsPayload: {
          result: {
            structuredContent: {
              body: JSON.stringify({
                items: [{ permission: "CanManageSccpRouteManifests" }],
              }),
            },
          },
        },
      }),
    ).toMatchObject({
      ready: true,
      checked: true,
      hasRequiredPermission: true,
      permissions: ["CanManageSccpRouteManifests"],
    });

    expect(
      buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: ROUTE_MANAGER_AUTHORITY,
        permissionsPayload: {
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  permissions: [
                    "CanTransferAssetWithDefinition",
                    "CanManageSccpRouteManifests",
                  ],
                }),
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      ready: true,
      checked: true,
      hasRequiredPermission: true,
      permissions: [
        "CanManageSccpRouteManifests",
        "CanTransferAssetWithDefinition",
      ],
    });
  });

  it("builds a TAIRA UpsertSccpRouteManifest ISI artifact for a production Solana manifest", () => {
    const manifest = baseProductionManifest();
    const artifact = buildSolanaRouteManifestIsiArtifact({ manifest });

    expect(artifact.schema).toBe("iroha-sccp-route-manifest-isi/v1");
    expect(artifact.requiredPermission).toBe("CanManageSccpRouteManifests");
    expect(artifact.routeKey).toEqual({
      routeId: "taira_sol_xor",
      assetKey: "xor",
      counterpartyDomain: 3,
      chainIdHex: "0x736f6c616e612d746573746e6574",
    });
    expect(artifact.instruction.UpsertSccpRouteManifest.manifest.route_id).toBe(
      "taira_sol_xor",
    );
  });

  it.each([
    ["missing ISI object hash", { isiArtifactSha256: null }],
    [
      "wrong ISI object hash",
      { isiArtifactSha256: materialHex32("wrong-isi") },
    ],
    ["missing manifest artifact path", { manifestArtifactPath: null }],
    [
      "wrong manifest artifact hash",
      { manifestArtifactSha256: materialHex32("wrong-manifest-bytes") },
    ],
    [
      "wrong canonical manifest hash",
      { manifestCanonicalSha256: materialHex32("wrong-canonical-manifest") },
    ],
  ])("fails publish readiness for %s", (_label, bindingOverride) => {
    const artifact = buildSolanaRouteManifestIsiArtifact({
      manifest: baseProductionManifest(),
    });
    const binding = routeManifestIsiBindingForTest(artifact);
    const report = buildRawSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        ...binding.args,
      },
      productionRequirements: { readyToBuildIsi: true, blockers: [] },
      publicPreflight: {
        checks: [
          { id: "taira-endpoint", status: "pass" },
          { id: "sccp-capabilities-load", status: "pass" },
          { id: "sccp-submit-capabilities", status: "pass" },
        ],
      },
      isiArtifact: artifact,
      isiPath: "/reviewed/taira-solana-xor-route.upsert-isi.json",
      ...Object.fromEntries(
        Object.entries(binding).filter(([key]) => key !== "args"),
      ),
      ...bindingOverride,
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
    });

    expect(report.routeManifestIsi).toMatchObject({
      ready: false,
      artifactReady: true,
      exactByteBindingReady: false,
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route-manifest-isi",
          exactByteBindingReady: false,
        }),
      ]),
    );
  });

  it("treats missing public route publication as non-circular during publish readiness", () => {
    const artifact = buildSolanaRouteManifestIsiArtifact({
      manifest: baseProductionManifest(),
    });
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
          {
            id: "public-route-publication",
            status: "fail",
            detail: "not published yet",
          },
          {
            id: "solana-lane-publication",
            status: "fail",
            detail:
              "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
            evidence: {
              blockerIds: [
                "Solana verifier enforcement mode must be native-recursive-verifier-v1",
                "Solana verifier enforcement evidence hash is missing",
              ],
            },
          },
          {
            id: "solana-route-instance-publication",
            status: "fail",
            detail:
              "Public TAIRA exposes a generic Solana SCCP lane template, but no taira_sol_xor Solana route instance is published.",
          },
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor Solana testnet manifest found.",
          },
        ],
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: false,
          disabledReason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          destinationRollout: {
            immutableVerifierReady: false,
            anchorsReady: false,
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
        },
      },
      isiArtifact: artifact,
      isiPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(true);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(true);
    expect(report.ready).toBe(true);
    expect(report.productionRequirements).toMatchObject({
      ready: true,
      readyToBuildIsi: true,
      blockerIds: [],
      missingProductionInputIds: [],
    });
    expect(
      report.productionRequirements.requiredProductionInputs.map(
        (input) => input.id,
      ),
    ).toEqual(SOLANA_GOVERNED_PRODUCTION_INPUT_IDS);
    expect(report.publicEndpoint.endpointReady).toBe(true);
    expect(report.publicEndpoint.mcpTransactionTools.ready).toBe(true);
    expect(report.publicEndpoint.mcpTransactionTools.presentTools).toEqual([
      "iroha.transactions.submit",
      "iroha.transactions.submit_and_wait",
    ]);
    expect(report.publicEndpoint.routeAlreadyPublic).toBe(false);
    expect(report.publicEndpoint.publicationChecks).toEqual([
      {
        id: "public-route-publication",
        status: "fail",
        detail: "not published yet",
      },
      {
        id: "solana-lane-publication",
        status: "fail",
        detail:
          "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      },
      {
        id: "solana-route-instance-publication",
        status: "fail",
        detail:
          "Public TAIRA exposes a generic Solana SCCP lane template, but no taira_sol_xor Solana route instance is published.",
      },
      {
        id: "route-manifest-shape",
        status: "fail",
        detail: "No taira_sol_xor Solana testnet manifest found.",
      },
    ]);
    expect(report.publicEndpoint.publicSolanaLane).toMatchObject({
      present: true,
      ready: false,
      check: {
        status: "fail",
        detail:
          "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      },
      lane: {
        chain: "sol",
        productionReady: false,
      },
      blockerIds: [
        "solana-verifier-enforcement-mode",
        "solana-verifier-enforcement-evidence-hash",
      ],
      blockerDetails: [
        {
          id: "solana-verifier-enforcement-mode",
          detail:
            "Solana verifier enforcement mode must be native-recursive-verifier-v1",
        },
        {
          id: "solana-verifier-enforcement-evidence-hash",
          detail: "Solana verifier enforcement evidence hash is missing",
        },
      ],
    });
    expect(report.runtimeSigning.authorityReady).toBe(true);
    expect(report.runtimeSigning.permissionAudit.ready).toBe(true);
    expect(report.runtimeSigning.permissionAudit.hasRequiredPermission).toBe(
      true,
    );
    expect(report.runtimeSigning.privateKeyStoredInReport).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.requiredPublicationAction).toMatchObject({
      kind: "UpsertSccpRouteManifest",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      routeManifestIsiReady: true,
      requiredPermission: "CanManageSccpRouteManifests",
      authority: ROUTE_MANAGER_AUTHORITY,
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyStoredInReport: false,
      readyToSubmitWithCurrentRuntime: true,
    });
    expect(report.proposalDraft).toEqual(report.requiredPublicationAction);
    expect(report.nextActions).toEqual([]);
    expect(report.nextActionDetails).toEqual([]);
    for (const commandKey of [
      "refreshPublishReadiness",
      "routeManifestIsi",
      "publishRouteManifest",
    ]) {
      expectExactManifestPin(
        report.commands[commandKey],
        report.routeManifestIsi.manifestArtifactPath,
        report.routeManifestIsi.manifestArtifactSha256,
      );
    }
    expect(report.commands.publishRouteManifest).toEqual([
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY=<runtime-only-private-key-hex>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-route-manifest",
      "--submit",
      "true",
      "--manifest",
      report.routeManifestIsi.manifestArtifactPath,
      "--expected-manifest-sha256",
      report.routeManifestIsi.manifestArtifactSha256,
      "--torii-url",
      EXPLICIT_TAIRA_PUBLIC_NODE_URL,
      "--mcp-url",
      EXPLICIT_TAIRA_PUBLIC_NODE_MCP_URL,
      "--private-key-env",
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      "--authority",
      ROUTE_MANAGER_AUTHORITY,
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("treats the exact canonical route as complete without claiming a submit-ready runtime", () => {
    const manifest = baseProductionManifest();
    const artifact = buildSolanaRouteManifestIsiArtifact({ manifest });
    const manifestCanonicalSha256 =
      solanaRouteManifestCanonicalSha256(manifest);
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: explicitTairaPublicNodeArgs(),
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publicPreflight: publishedSolanaRoutePreflight(manifestCanonicalSha256),
      isiArtifact: artifact,
      mcpTransactionTools: readyMcpTransactionTools(),
      privateKeyEnvPresent: false,
    });

    expect(report.publicEndpoint).toMatchObject({
      routeAlreadyPublic: true,
      exactManifestMatches: true,
    });
    expect(report.publicationSatisfied).toBe(true);
    expect(report.submissionRequired).toBe(false);
    expect(report.ready).toBe(true);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
  });

  it("does not satisfy publication with a generic route at a different canonical hash", () => {
    const manifest = baseProductionManifest();
    const artifact = buildSolanaRouteManifestIsiArtifact({ manifest });
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: ROUTE_MANAGER_AUTHORITY,
      },
      productionRequirements: { readyToBuildIsi: true, blockers: [] },
      publicPreflight: publishedSolanaRoutePreflight(
        materialHex32("different-public-route-manifest"),
      ),
      isiArtifact: artifact,
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
    });

    expect(report.publicEndpoint).toMatchObject({
      routeAlreadyPublic: false,
      exactManifestMatches: false,
    });
    expect(report.publicationSatisfied).toBe(false);
    expect(report.submissionRequired).toBe(true);
  });

  it("rejects a healthy TAIRA preset endpoint while retaining public-node repair diagnostics", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: true,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: readyAuthorityPermission(),
      publicNodeCandidates: {
        schema: "iroha-demo-sccp-solana-taira-public-node-candidates/v1",
        ready: false,
        candidateCount: 4,
        dnsReadyCount: 0,
        tlsReadyCount: 0,
        edgeStatusProbeReadyCount: 0,
        edgeMcpProbeReadyCount: 0,
        mcpReadyCount: 0,
        blockerIds: [
          "taira-public-node-dns",
          "taira-public-node-tls",
          "taira-public-node-edge-routing",
          "taira-public-node-status-routing",
        ],
        candidates: [
          {
            host: "taira-validator-1.sora.org",
            toriiUrl: "https://taira-validator-1.sora.org",
            mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
            expectedAddress: "208.83.1.62",
            dnsReady: false,
            tlsReady: false,
            edgeStatusProbeReady: false,
            edgeStatusProbeHttpStatus: 502,
            edgeMcpProbeReady: false,
            edgeMcpProbeHttpStatus: 502,
            dnsError: "getaddrinfo ENOTFOUND taira-validator-1.sora.org",
            ready: false,
          },
        ],
      },
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.publicEndpoint.endpointReady).toBe(true);
    expect(report.publicEndpoint.publicationTargetReady).toBe(false);
    expect(report.publicEndpoint.defaultPresetPublicationReady).toBe(true);
    expect(report.publicEndpoint.directPublicNodePublicationReady).toBe(false);
    expect(report.publicEndpoint.target).toMatchObject({
      targetKind: "taira-convenience-root",
      canonicalRolloutTargetReady: false,
      canonicalRolloutRequiresExplicitPublicNode: true,
      toriiUrlSource: "default",
      mcpUrlSource: "default",
    });
    expect(report.publicEndpoint.explicitPublicNodeCandidates).toMatchObject({
      ready: false,
      candidateCount: 4,
      dnsReadyCount: 0,
      tlsReadyCount: 0,
      edgeStatusProbeReadyCount: 0,
      edgeMcpProbeReadyCount: 0,
      blockerIds: [
        "taira-public-node-dns",
        "taira-public-node-tls",
        "taira-public-node-edge-routing",
        "taira-public-node-status-routing",
      ],
    });
    expect(report.publicEndpoint.explicitPublicNodeRepairPlan).toMatchObject({
      schema: "iroha-demo-sccp-solana-taira-public-node-repair-plan/v1",
      ready: false,
      primaryCandidate: {
        host: "taira-validator-1.sora.org",
        expectedAddress: "208.83.1.62",
        toriiUrl: "https://taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      },
      requiredDnsRecords: [
        expect.objectContaining({
          name: "taira-validator-1.sora.org",
          value: "208.83.1.62",
          ready: false,
        }),
      ],
      requiredTlsSubjectAlternativeNames: ["taira-validator-1.sora.org"],
      requiredNginxServerNames: ["taira-validator-1.sora.org"],
      operatorSequence: [
        "publish-direct-validator-dns-records",
        "refresh-edge-tls-certificate-san-list",
        "render-and-reload-taira-edge-nginx-config",
        "validate-forced-edge-status-and-mcp-routing",
        "run-mcp-rollout-smoke",
        "rerun-solana-route-publish-readiness-with-explicit-public-node",
      ],
    });
    expect(
      report.publicEndpoint.explicitPublicNodeRepairPlan.commands
        .validatePrimaryStatusForcedEdge,
    ).toEqual([
      "curl",
      "-sS",
      "--resolve",
      "taira-validator-1.sora.org:443:208.83.1.62",
      "https://taira-validator-1.sora.org/status",
    ]);
    expect(
      report.publicEndpoint.explicitPublicNodeRepairPlan.commands
        .smokePrimaryMcpRolloutForcedEdge,
    ).toContain("taira-validator-1.sora.org:443:208.83.1.62");
    expect(report.requiredPublicationAction).toMatchObject({
      routeManifestIsiReady: true,
      authority: ROUTE_MANAGER_AUTHORITY,
      privateKeyEnvPresent: true,
      readyForRuntimeSigner: false,
      readyToSubmitWithCurrentRuntime: false,
    });
    expect(report.blockers).toEqual([
      expect.objectContaining({
        id: "taira-explicit-public-node-target",
        targetKind: "taira-convenience-root",
        requiredArguments: ["--torii-url", "--mcp-url"],
      }),
    ]);
    expect(report.nextActions).toEqual([
      "provide-explicit-taira-public-node-target",
    ]);
    expect(report.nextActionDetails).toEqual([
      expect.objectContaining({
        id: "provide-explicit-taira-public-node-target",
        validationCommands: expect.arrayContaining([
          ["dig", "+short", "taira-validator-1.sora.org"],
        ]),
      }),
    ]);
    expect(report.commands.publishRouteManifest).toEqual([
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY=<runtime-only-private-key-hex>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-route-manifest",
      "--submit",
      "true",
      "--manifest",
      report.routeManifestIsi.manifestArtifactPath,
      "--expected-manifest-sha256",
      report.routeManifestIsi.manifestArtifactSha256,
      "--torii-url",
      "https://<taira-public-node-root>",
      "--mcp-url",
      "https://<taira-public-node-root>/v1/mcp",
      "--private-key-env",
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      "--authority",
      ROUTE_MANAGER_AUTHORITY,
    ]);
    expect(JSON.stringify(report.commands.publishRouteManifest)).toContain(
      "<taira-public-node-root>",
    );
  });

  it("extracts explicit TAIRA validator public-node candidates from DNS records", () => {
    const candidates = tairaPublicNodeCandidatesFromDnsRecords(
      {
        records: [
          {
            name: "taira.sora.org",
            type: "A",
            value: "208.83.1.62",
          },
          {
            name: "taira-validator-1.sora.org",
            type: "A",
            value: "208.83.1.62",
            ttl: 300,
            purpose: "Direct Torii hostname for validator 1",
          },
          {
            name: "taira-validator-2.sora.org",
            type: "AAAA",
            value: "::1",
          },
        ],
      },
      "/repo/iroha/configs/soranexus/taira/dns_records.json",
    );

    expect(candidates).toEqual([
      {
        host: "taira-validator-1.sora.org",
        toriiUrl: "https://taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
        dnsRecordType: "A",
        expectedAddress: "208.83.1.62",
        ttl: 300,
        purpose: "Direct Torii hostname for validator 1",
        sourceFile: "/repo/iroha/configs/soranexus/taira/dns_records.json",
      },
    ]);
  });

  it("fails Solana publish readiness closed when the MCP transaction-tool audit is missing", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.publicEndpoint.mcpTransactionTools).toBeNull();
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "taira-mcp-transaction-tools",
          missingTools: [
            "iroha.transactions.submit",
            "iroha.transactions.submit_and_wait",
          ],
        }),
      ]),
    );
  });

  it("fails Solana publish readiness closed when route-manager permission audit is missing", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: readyMcpTransactionTools(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.runtimeSigning.permissionAudit).toBeNull();
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route-manager-permission",
          requiredPermission: "CanManageSccpRouteManifests",
        }),
      ]),
    );
  });

  it("uses a runtime route-manager authority env var for publish readiness", () => {
    const report = withProcessEnv(
      {
        SCCP_TEST_ROUTE_MANAGER_AUTHORITY: ROUTE_MANAGER_AUTHORITY,
      },
      () =>
        buildSolanaRoutePublishReadinessReportBody({
          args: {
            ...explicitTairaPublicNodeArgs(),
            "authority-env": "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
            "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          },
          productionRequirements: {
            readyToBuildIsi: true,
            blockers: [],
          },
          publicPreflight: {
            ready: false,
            checks: [
              { id: "taira-endpoint", status: "pass", detail: "ok" },
              { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
              { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
            ],
          },
          isiArtifact: buildSolanaRouteManifestIsiArtifact({
            manifest: baseProductionManifest(),
          }),
          mcpTransactionTools: readyMcpTransactionTools(),
          authorityPermission: readyAuthorityPermission(),
          privateKeyEnvPresent: true,
          checkedAt: "2026-07-04T00:00:00.000Z",
        }),
    );

    expect(report.readyToSubmitWithCurrentRuntime).toBe(true);
    expect(report.runtimeSigning).toMatchObject({
      authority: ROUTE_MANAGER_AUTHORITY,
      authorityEnv: "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
      authorityEnvPresent: true,
      authoritySource: "environment",
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyStoredInReport: false,
    });
    expect(report.blockers).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY=",
    );
  });

  it("treats a blank route-manager authority env var as missing", () => {
    const report = withProcessEnv(
      {
        SCCP_TEST_ROUTE_MANAGER_AUTHORITY: "   ",
      },
      () =>
        buildSolanaRoutePublishReadinessReportBody({
          args: {
            "authority-env": "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
            "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          },
          productionRequirements: {
            readyToBuildIsi: true,
            blockers: [],
          },
          publicPreflight: {
            ready: false,
            checks: [
              { id: "taira-endpoint", status: "pass", detail: "ok" },
              { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
              { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
            ],
          },
          isiArtifact: buildSolanaRouteManifestIsiArtifact({
            manifest: baseProductionManifest(),
          }),
          mcpTransactionTools: readyMcpTransactionTools(),
          privateKeyEnvPresent: true,
          checkedAt: "2026-07-04T00:00:00.000Z",
        }),
    );

    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.runtimeSigning).toMatchObject({
      authority: null,
      authorityEnv: "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
      authorityEnvPresent: false,
      authoritySource: "missing",
      authorityReady: false,
      authorityFormatReady: false,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "route-manager-authority",
    );
  });

  it("blocks publish readiness when the route manager authority lacks the route-manifest permission", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: ROUTE_MANAGER_AUTHORITY,
        permissionsPayload: {
          result: {
            structuredContent: {
              body: {
                items: [{ name: "CanTransferAssetWithDefinition" }],
              },
            },
          },
        },
      }),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.runtimeSigning.authorityReady).toBe(true);
    expect(report.runtimeSigning.permissionAudit.hasRequiredPermission).toBe(
      false,
    );
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "route-manager-permission",
    );
  });

  it("blocks publish readiness when a Solana pubkey is used as the TAIRA route-manager authority", () => {
    const solanaPubkey = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf";
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: solanaPubkey,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: readyMcpTransactionTools(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.runtimeSigning).toMatchObject({
      authority: solanaPubkey,
      authorityReady: false,
      authorityFormatReady: false,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manager-authority",
    ]);
    expect(report.blockers[0]).toMatchObject({
      authority: solanaPubkey,
      expectedPrefix: "testu",
    });
  });

  it("blocks publish readiness when a short testu label is used as the TAIRA route-manager authority", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: "testu-route-manager",
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: buildTairaRouteManagerPermissionStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        authority: "testu-route-manager",
        permissionsPayload: {
          result: {
            structuredContent: {
              body: {
                items: [{ name: "CanManageSccpRouteManifests" }],
              },
            },
          },
        },
      }),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.runtimeSigning).toMatchObject({
      authority: "testu-route-manager",
      authorityReady: false,
      authorityFormatReady: false,
      permissionAudit: {
        checked: false,
        hasRequiredPermission: false,
      },
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manager-authority",
    ]);
  });

  it("builds an auditable blocked publish report before unsafe submit attempts", () => {
    const blocked = buildSolanaRoutePublishBlockedReport({
      checkedAt: "2026-07-04T00:00:00.000Z",
      stage: "publish-readiness",
      error:
        "Solana route publish readiness failed: production-requirements, route-manager-permission",
      routeManifestIsiPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
      routePublishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      blockerIds: ["production-requirements", "route-manager-permission"],
      runtimeSigning: {
        authority: ROUTE_MANAGER_AUTHORITY,
        permissionAudit: {
          checked: true,
          ready: false,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: false,
        },
        privateKeyStoredInReport: false,
      },
    });

    expect(blocked).toMatchObject({
      schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
      ready: false,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      requiredPermission: "CanManageSccpRouteManifests",
      stage: "publish-readiness",
      blockerIds: ["production-requirements", "route-manager-permission"],
      runtimeSigning: {
        privateKeyStoredInReport: false,
        permissionAudit: {
          checked: true,
          ready: false,
          hasRequiredPermission: false,
        },
      },
    });
  });

  it("carries readiness diagnostics into ISI-stage publish blocks", () => {
    const readiness = {
      routePublishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      report: {
        publicEndpoint: {
          endpointReady: true,
          routeAlreadyPublic: false,
        },
        routeManifestIsi: {
          ready: false,
          error:
            "Production Solana route manifest must not include manifest.disabledReason.",
        },
        runtimeSigning: {
          authorityReady: false,
          requiredPermission: "CanManageSccpRouteManifests",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
        productionRequirements: {
          readyToBuildIsi: false,
          blockerIds: ["source-verifier-material"],
        },
        blockers: [
          {
            id: "production-requirements",
            detail: "Production requirements are not complete.",
          },
          {
            id: "route-manifest-isi",
            detail: "Route manifest ISI is not ready.",
          },
          {
            id: "route-manager-authority",
            detail: "Route-manager authority is missing.",
          },
          {
            id: "runtime-signing-key",
            detail: "Runtime signing key is missing.",
          },
        ],
      },
    };

    const blocked = buildSolanaRoutePublishBlockedFromReadiness({
      checkedAt: "2026-07-04T00:00:00.000Z",
      stage: "route-manifest-isi",
      error:
        "Production Solana route manifest must not include manifest.disabledReason.",
      routeManifest:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      readiness,
    });

    expect(blocked).toMatchObject({
      schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
      ready: false,
      routeId: "taira_sol_xor",
      stage: "route-manifest-isi",
      routePublishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      blockerIds: [
        "production-requirements",
        "route-manifest-isi",
        "route-manager-authority",
        "runtime-signing-key",
      ],
      blockers: [
        {
          id: "production-requirements",
          detail: "Production requirements are not complete.",
        },
        {
          id: "route-manifest-isi",
          detail: "Route manifest ISI is not ready.",
        },
        {
          id: "route-manager-authority",
          detail: "Route-manager authority is missing.",
        },
        {
          id: "runtime-signing-key",
          detail: "Runtime signing key is missing.",
        },
      ],
      publicEndpoint: {
        endpointReady: true,
        routeAlreadyPublic: false,
      },
      routeManifestIsi: {
        ready: false,
      },
      runtimeSigning: {
        requiredPermission: "CanManageSccpRouteManifests",
        privateKeyStoredInReport: false,
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockerIds: ["source-verifier-material"],
      },
    });
  });

  it("infers publish-blocked stage and error from current readiness", () => {
    const isiBlocked = buildSolanaRoutePublishBlockedFromReadiness({
      checkedAt: "2026-07-04T00:00:00.000Z",
      readiness: {
        routePublishReadinessPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
        report: {
          routeManifestIsi: {
            ready: false,
            error:
              "Production Solana route manifest must not include manifest.disabledReason.",
          },
          blockers: [
            {
              id: "route-manifest-isi",
              detail: "Route manifest ISI is not ready.",
            },
          ],
        },
      },
    });
    expect(isiBlocked).toMatchObject({
      stage: "route-manifest-isi",
      error:
        "Production Solana route manifest must not include manifest.disabledReason.",
      blockerIds: ["route-manifest-isi"],
      blockers: [
        {
          id: "route-manifest-isi",
          detail: "Route manifest ISI is not ready.",
        },
      ],
    });

    const runtimeBlocked = buildSolanaRoutePublishBlockedFromReadiness({
      checkedAt: "2026-07-04T00:00:00.000Z",
      readiness: {
        report: {
          routeManifestIsi: {
            ready: true,
            path: "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
          },
          blockers: [
            {
              id: "route-manager-authority",
              detail: "Route-manager authority is missing.",
            },
            {
              id: "runtime-signing-key",
              detail: "Runtime signing key is missing.",
            },
          ],
        },
      },
    });
    expect(runtimeBlocked).toMatchObject({
      stage: "publish-readiness",
      error:
        "Solana route publish readiness failed: route-manager-authority, runtime-signing-key",
      routeManifestIsiPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
      blockerIds: ["route-manager-authority", "runtime-signing-key"],
      blockers: [
        {
          id: "route-manager-authority",
          detail: "Route-manager authority is missing.",
        },
        {
          id: "runtime-signing-key",
          detail: "Runtime signing key is missing.",
        },
      ],
    });
  });

  it("bounds stalled TAIRA publish-readiness HTTP reads", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      }, 200);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      await expect(
        fetchTextWithRetry(`http://localhost:${port}`, { timeoutMs: 20 }, 1),
      ).rejects.toThrow(/timed out after 20ms/u);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("retries transient public Solana RPC rate limits", async () => {
    let calls = 0;
    const result = await withSolanaRpcRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error(
            '429 : {"jsonrpc":"2.0","error":{"code":429,"message":"Connection rate limits exceeded"}}',
          );
        }
        return { ok: true };
      },
      { label: "test Solana account read", attempts: 3, delayMs: 1 },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(3);
    expect(
      solanaRpcErrorIsRetryable(new Error("Connection rate limits exceeded")),
    ).toBe(true);
  });

  it("does not retry deterministic Solana RPC account failures", async () => {
    let calls = 0;
    await expect(
      withSolanaRpcRetry(
        async () => {
          calls += 1;
          throw new Error("Solana account does not exist on testnet");
        },
        { label: "test Solana account read", attempts: 3, delayMs: 1 },
      ),
    ).rejects.toThrow(/does not exist/u);

    expect(calls).toBe(1);
  });

  it("applies bounded TAIRA MCP audit fetch options", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ result: { tools: [] } }));
      }, 200);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      const status = await fetchTairaMcpTransactionToolStatus(
        `http://localhost:${port}`,
        { attempts: 1, timeoutMs: 20 },
      );

      expect(status.ready).toBe(false);
      expect(status.error).toMatch(/timed out after 20ms/u);
      expect(status.missingTools).toEqual([
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("accepts SSE TAIRA MCP tool-list responses for publish readiness", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        [
          ": keepalive",
          "event: message",
          `data: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              tools: [
                mcpSignedTransactionTool("iroha.transactions.submit"),
                mcpSignedTransactionTool("iroha.transactions.submit_and_wait"),
              ],
            },
          })}`,
          "",
        ].join("\n"),
      );
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      const status = await fetchTairaMcpTransactionToolStatus(
        `http://localhost:${port}`,
        { attempts: 1, timeoutMs: 200 },
      );

      expect(status.ready).toBe(true);
      expect(status.presentTools).toEqual([
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ]);
      expect(status.signedTransactionSubmission.ready).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("records TAIRA MCP capabilities when tool-list fetches time out", async () => {
    const server = createServer((request, response) => {
      if (request.method === "GET") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            protocolVersion: "2025-06-18",
            serverInfo: {
              name: "iroha-torii-mcp",
              version: "0.0.0-dev",
            },
            capabilities: {
              tools: {
                count: 178,
                listChanged: false,
                toolsetVersion: "toolset-hash",
              },
            },
          }),
        );
        return;
      }
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ result: { tools: [] } }));
      }, 200);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      const status = await fetchTairaMcpTransactionToolStatus(
        `http://localhost:${port}`,
        { attempts: 1, timeoutMs: 20 },
      );

      expect(status.ready).toBe(false);
      expect(status.error).toMatch(/timed out after 20ms/u);
      expect(status.capabilities).toMatchObject({
        ready: true,
        protocolVersion: "2025-06-18",
        serverName: "iroha-torii-mcp",
        toolCount: 178,
        toolsetVersion: "toolset-hash",
        listChanged: false,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("blocks publish readiness when endpoint capabilities or runtime signer inputs are missing", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          {
            id: "sccp-capabilities-load",
            status: "fail",
            detail: "HTTP 404",
          },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: buildTairaMcpTransactionToolStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        toolsPayload: { result: { tools: [] } },
      }),
      privateKeyEnvPresent: false,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.runtimeSigning.authorityReady).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "taira-public-endpoint",
        "taira-mcp-transaction-tools",
        "route-manager-authority",
        "runtime-signing-key",
      ]),
    );
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "refresh-taira-route-publish-preflight",
        "grant-taira-route-manager-access",
        "set-runtime-route-manager-private-key",
      ]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "set-runtime-route-manager-private-key",
          command: report.commands.publishRouteManifest,
          requiredInputs: ["SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY"],
        }),
      ]),
    );
    expect(report.requiredPublicationAction).toMatchObject({
      kind: "UpsertSccpRouteManifest",
      routeManifestIsiReady: true,
      privateKeyStoredInReport: false,
      readyToSubmitWithCurrentRuntime: false,
    });
  });

  it("classifies TAIRA 502 publish readiness failures as ingress degradation", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        "torii-url": "https://taira.sora.org",
        "mcp-url": "https://taira.sora.org/v1/mcp",
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      publicPreflight: {
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          {
            id: "sccp-capabilities-load",
            status: "fail",
            detail:
              "HTTP 502: <html><head><title>502 Bad Gateway</title></head></html>",
          },
          {
            id: "sccp-submit-capabilities",
            status: "missing",
            detail: null,
          },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      mcpTransactionTools: buildTairaMcpTransactionToolStatus({
        mcpUrl: "https://taira.sora.org/v1/mcp",
        error: "HTTP 502: <html><body><h1>502 Bad Gateway</h1></body></html>",
      }),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.publicEndpoint.ingressHealth).toMatchObject({
      status: "degraded",
      degraded: true,
      toriiUrl: "https://taira.sora.org",
      mcpUrl: "https://taira.sora.org/v1/mcp",
      detail: expect.stringContaining("HTTP 502/503"),
    });
    expect(
      report.publicEndpoint.ingressHealth.observedErrors.join("\n"),
    ).not.toContain("<html>");
    expect(
      report.publicEndpoint.ingressHealth.diagnosticCommands,
    ).toContainEqual([
      "bash",
      "../iroha/configs/soranexus/taira/check_mcp_rollout.sh",
      "--skip-local",
      "--public-root",
      "https://taira.sora.org",
      "--skip-write-canary",
    ]);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "taira-public-endpoint",
          ingressHealth: "degraded",
          detail: expect.stringContaining("rollout or upstream health"),
        }),
      ]),
    );
  });

  it("preserves delegated Solana production actions in publish readiness", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      publicPreflight: {
        ready: true,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: null,
      mcpTransactionTools: { ready: true },
      privateKeyEnvPresent: false,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.productionRequirements).toMatchObject({
      readyToBuildIsi: false,
      blockerIds: ["source-verifier-material"],
      missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    });
    expect(report.routeManifestIsi).toMatchObject({
      ready: false,
      artifactReady: false,
      blockedByProductionRequirements: true,
      blockedBy: ["production-requirements", "source-verifier-material"],
      error: expect.stringContaining("intentionally withheld"),
    });
    expect(report.nextActions).not.toContain(
      "build-production-route-manifest-isi",
    );
    expect(
      report.productionRequirements.requiredProductionInputs.map(
        (input) => input.id,
      ),
    ).toEqual(SOLANA_GOVERNED_PRODUCTION_INPUT_IDS);
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-production-requirements",
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "publish-governed-solana-source-material",
              command: ["python3", "../iroha/scripts/source-material.py"],
            }),
          ]),
        }),
      ]),
    );
  });

  it("does not treat a stale Solana route-manifest ISI as ready before production requirements pass", () => {
    const report = buildSolanaRoutePublishReadinessReportBody({
      args: {
        ...explicitTairaPublicNodeArgs(),
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "verifier-linkage-readiness" }],
      },
      publicPreflight: {
        ready: true,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
          { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
        ],
      },
      isiArtifact: buildSolanaRouteManifestIsiArtifact({
        manifest: baseProductionManifest(),
      }),
      isiPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
      mcpTransactionTools: readyMcpTransactionTools(),
      authorityPermission: readyAuthorityPermission(),
      privateKeyEnvPresent: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForRuntimeSigner).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.routeManifestIsi).toMatchObject({
      ready: false,
      artifactReady: true,
      blockedByProductionRequirements: true,
      blockedBy: ["production-requirements", "verifier-linkage-readiness"],
      error: expect.stringContaining("intentionally withheld"),
    });
    expect(report.requiredPublicationAction).toMatchObject({
      routeManifestIsiReady: false,
      readyForRuntimeSigner: false,
      readyToSubmitWithCurrentRuntime: false,
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-requirements",
          blockers: ["verifier-linkage-readiness"],
        }),
        expect.objectContaining({
          id: "route-manifest-isi",
          artifactReady: true,
          blockedBy: ["production-requirements", "verifier-linkage-readiness"],
        }),
      ]),
    );
    expect(report.nextActions).toEqual(["complete-production-requirements"]);
  });

  it("rejects fail-closed or placeholder Solana manifests before TAIRA publication", () => {
    const manifest = {
      ...baseProductionManifest(),
      production_ready: false,
      productionReady: false,
    };

    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /not production-ready/u,
    );
  });

  it("rejects Solana production manifests without production-ready browser prover sidecars", () => {
    const manifest = {
      ...baseProductionManifest(),
      destination_browser_prover: {
        module_url: "/sccp-solana/taira-solana-xor-destination-prover.js",
        module_hash: hex32("4"),
        manifest_hash: hex32("4"),
      },
    };

    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /sidecarHash/u,
    );
  });

  it("rejects mixed destination and source Solana proof profiles", () => {
    const destinationUsingSource = baseProductionManifest();
    destinationUsingSource.destination_browser_prover = {
      ...destinationUsingSource.destination_browser_prover,
      proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
    };
    expect(() =>
      assertProductionSolanaManifest(destinationUsingSource),
    ).toThrow(
      `Solana destination browser prover.proofBackend must be ${SOLANA_DESTINATION_PROOF_BACKEND} for the destination direction.`,
    );

    const sourceUsingDestination = baseProductionManifest();
    sourceUsingDestination.source_browser_prover = {
      ...sourceUsingDestination.source_browser_prover,
      proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
      required_proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
    };
    expect(() =>
      assertProductionSolanaManifest(sourceUsingDestination),
    ).toThrow(
      `Solana source browser prover.proofBackend must be ${SOLANA_SOURCE_PROOF_BACKEND} for the source direction.`,
    );

    const hiddenDestinationAlias = baseProductionManifest();
    hiddenDestinationAlias.destination_browser_prover = {
      ...hiddenDestinationAlias.destination_browser_prover,
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
    };
    expect(() =>
      assertProductionSolanaManifest(hiddenDestinationAlias),
    ).toThrow(/destination browser prover\.proofBackend aliases must agree/u);

    const hiddenRouteProfileAlias = baseProductionManifest();
    hiddenRouteProfileAlias.verifierTarget = "EvmContract";
    expect(() =>
      assertProductionSolanaManifest(hiddenRouteProfileAlias),
    ).toThrow(/Solana verifier target aliases must agree/u);
  });

  it("rejects copied TRON manifest field names on Solana route manifests", () => {
    const manifest = {
      ...baseProductionManifest(),
      sccp_tron_source_bridge_address:
        "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
    };

    expect(() => buildSolanaRouteManifestIsiArtifact({ manifest })).toThrow(
      /TRON field/u,
    );
  });

  it("reports the missing governed Solana proof material before publication", () => {
    const routeCanaryEvidenceHash = materialHex32("route-canary");
    const manifest = {
      ...baseProductionManifest(),
      production_ready: false,
      productionReady: false,
      disabledReason: "Solana proof material is not published.",
      source_verifier_material: {
        source_domain: 3,
        target_domain: 0,
        placeholderMaterial: true,
      },
      sourceVerifierMaterial: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
      },
      source_adapter_engine_deployment: {
        source_domain: 3,
        target_domain: 0,
        placeholderMaterial: true,
      },
      sourceAdapterEngineDeployment: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
      },
      destination_proof_admission: {
        admission_mode: "envelope-recorder-v1",
        proof_system: "none",
        entrypoint: "submit_sccp_message_proof",
        verifier_code_hash: hex32("1"),
        verifier_key_hash: hex32("2"),
        destination_binding_hash: hex32("3"),
        shape_only: true,
        accepts_unverified_proofs: true,
      },
    };
    delete manifest.post_deploy_live_evidence;

    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      publicConfig: {
        verifierProgramId: manifest.solana_verifier_program_id,
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: manifest.solana_verifier_program_id,
        programDataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programDataSlot: 419725105,
        executableBlake2b256: manifest.verifier_code_hash,
      }),
      verifierLiveEvidence: {
        verifier_code_hash: manifest.verifier_code_hash,
      },
      postDeployEvidence: {
        observedSourceBridgeConfigHash: materialHex32("source-bridge-config"),
        observedSourceBridgeConfig: {
          verifierProgramId: manifest.solana_verifier_program_id,
          bridgeProgramId: manifest.solana_program_id,
          sourceBridgeProgramId: manifest.sccp_solana_source_bridge_address,
          tokenMintAddress: manifest.solana_token_mint,
          sourceStateAddress: manifest.solana_source_state_address,
        },
        observedSourceState: {
          totalBurned: "0",
          lastBurnHash: null,
        },
        liveReadbackReady: false,
        readyForProductionPostDeploy: false,
        blockers: [{ id: "source-burn-event" }],
      },
      routeCanarySubmission: {
        verifierProgramId: manifest.solana_verifier_program_id,
        tokenMintAddress: manifest.solana_token_mint,
        submitted: false,
        failClosed: true,
        envelope: {
          canaryEvidenceHash: routeCanaryEvidenceHash,
        },
      },
      sourceBurnSubmission: {
        path: "output/sccp-solana-deploy/taira-solana-xor-source-burn.submission.json",
        submitted: true,
        signature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        sourceBridgeProgramId: manifest.sccp_solana_source_bridge_address,
        sourceStateAddress: manifest.solana_source_state_address,
        tokenMintAddress: manifest.solana_token_mint,
        sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
        amountBaseUnits: "1",
        tairaRecipient: TAIRA_RECIPIENT,
        nonce: "burn-1",
        explorerUrl:
          "https://explorer.solana.com/tx/5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm?cluster=testnet",
      },
      productionMaterialInventory: {
        path: "output/sccp-solana-deploy/taira-solana-xor-production-material-inventory.json",
        ready: false,
        readyMaterial: {
          sourceVerifierMaterial: null,
          sourceAdapterEngineDeployment: null,
          offlineFullToml: null,
          browserProvers: false,
          destinationProofAdmission: false,
        },
        blockers: [
          { id: "artifact-root-publication" },
          { id: "source-verifier-material" },
          { id: "browser-prover-readiness" },
        ],
      },
      proverReadiness: {
        path: "output/sccp-solana-deploy/taira-solana-xor-prover-readiness.json",
        readyForProductionProofs: false,
        blockers: [
          { id: "destination-prover-readiness" },
          { id: "source-prover-readiness" },
        ],
        nextActionDetails: [
          {
            id: "publish-destination-solana-production-prover-package",
            requiredInputs: [{ id: "destination-browser-prover-module" }],
          },
          {
            id: "publish-source-solana-production-prover-package",
            requiredInputs: [{ id: "source-browser-prover-module" }],
          },
        ],
      },
      sourceMaterialHandoffVerification: {
        path: "output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.verification.json",
        ready: true,
        statuses: [{ id: "handoff-schema", status: "pass" }],
        blockers: [],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToBuildIsi).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "production-ready-flag",
        "disabled-reason",
        "destination-proof-admission",
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "post-deploy-live-evidence-hashes",
        "post-deploy-live-evidence-signatures",
        "post-deploy-full-toml",
        "browser-prover-readiness",
        "production-material-inventory",
      ]),
    );
    expect(
      report.blockers.find(
        (blocker) => blocker.id === "production-material-inventory",
      ),
    ).toMatchObject({
      blockers: [
        "artifact-root-publication",
        "source-verifier-material",
        "browser-prover-readiness",
      ],
    });
    expect(report.nextActions).toEqual([
      "rotate-revoke-remove-file-backed-solana-key-material",
      "publish-governed-solana-source-material",
      "apply-production-solana-manifest-patch",
      "link-solana-native-recursive-verifier",
      "render-reviewed-solana-post-deploy-full-toml",
      "publish-solana-production-prover-packages",
    ]);
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-governed-solana-source-material",
          command: report.commands.sourceEvidenceToml,
          blockedBy: expect.arrayContaining([
            expect.objectContaining({ id: "source-verifier-material" }),
            expect.objectContaining({
              id: "source-adapter-engine-deployment",
            }),
          ]),
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "sourceTrustAnchorHash" }),
            expect.objectContaining({
              id: "adapterVerifierVkHash",
              value: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
            }),
          ]),
        }),
        expect.objectContaining({
          id: "apply-production-solana-manifest-patch",
          command: report.commands.productionManifestPatch,
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "admissionMode" }),
            expect.objectContaining({
              id: "governed-solana-destination-proof-admission",
            }),
          ]),
        }),
        expect.objectContaining({
          id: "render-reviewed-solana-post-deploy-full-toml",
          command: report.commands.postDeployFullToml,
          validationCommands: [
            report.commands.liveEvidenceToml,
            report.commands.postDeployFullToml,
          ],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "source-verifier-material-hash" }),
            expect.objectContaining({
              id: "source-adapter-engine-deployment-hash",
            }),
            expect.objectContaining({ id: "route-allowlist-hash" }),
            expect.objectContaining({ id: "offlineFullTomlSha256" }),
          ]),
        }),
        expect.objectContaining({
          id: "publish-solana-production-prover-packages",
          command: report.commands.proverReadiness,
          validationCommands: [
            report.commands.proverReadiness,
            report.commands.productionMaterialInventory,
          ],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({
              id: "solana-destination-production-prover-package",
              env: "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL",
            }),
            expect.objectContaining({
              id: "solana-source-production-prover-package",
              env: "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
            }),
          ]),
          delegatedActions: [
            expect.objectContaining({
              id: "publish-destination-solana-production-prover-package",
            }),
            expect.objectContaining({
              id: "publish-source-solana-production-prover-package",
            }),
          ],
        }),
      ]),
    );
    const sourceMaterialAction = report.nextActionDetails.find(
      (action) => action.id === "publish-governed-solana-source-material",
    );
    expect(sourceMaterialAction.requiredInputIds).toEqual([
      "sourceTrustAnchorHash",
      "consensusVerifierHash",
      "messageInclusionVerifierHash",
      "finalityPolicyHash",
      "sourceStateVerifierHash",
      "adapterVerifierVkHash",
      "deploymentReceiptHash",
      "towerReplayVerifierHash",
      "fullAccountsdbLatticeVerifierHash",
      "bankForkChoiceVerifierHash",
      "expectedSourceVerifierMaterialHash",
      "expectedSourceAdapterEngineDeploymentHash",
      "expectedFullLightClientGateHash",
    ]);
    const proverAction = report.nextActionDetails.find(
      (action) => action.id === "publish-solana-production-prover-packages",
    );
    expect(proverAction.requiredInputIds).toEqual([
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(proverAction.delegatedActions[0].requiredInputIds).toEqual([
      "destination-browser-prover-module",
    ]);
    expect(
      report.requirements.destinationProofAdmission.some(
        (entry) => entry.status === "invalid",
      ),
    ).toBe(true);
    expect(
      report.requirements.sourceVerifierMaterial.every(
        (entry) => entry.status === "missing",
      ),
    ).toBe(true);
    expect(report.commands.sourceEvidenceToml).toContain(
      "--tower-replay-verifier-hash",
    );
    expect(report.commands.liveEvidenceToml).toContain(
      manifest.verifier_code_hash,
    );
    expect(report.commands.liveEvidenceToml).toContain(routeCanaryEvidenceHash);
    expect(report.commands.postDeployFullToml).toContain(
      routeCanaryEvidenceHash,
    );
    const fullTomlAction = report.nextActionDetails.find(
      (action) => action.id === "render-reviewed-solana-post-deploy-full-toml",
    );
    expect(fullTomlAction.requiredInputs.map((input) => input.id)).toEqual(
      expect.arrayContaining([
        "sourceBridgeConfigHash",
        "routeCanaryEvidenceHash",
      ]),
    );
    expect(report.commands.publishReadiness).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publish).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.solanaDeployment.observedSourceBurnSubmission).toMatchObject({
      submitted: true,
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "burn-1",
    });
    expect(
      report.solanaDeployment.observedProductionMaterialInventory,
    ).toMatchObject({
      ready: false,
      blockers: [
        "artifact-root-publication",
        "source-verifier-material",
        "browser-prover-readiness",
      ],
      readyMaterial: {
        browserProvers: false,
        destinationProofAdmission: false,
      },
    });
    expect(
      report.solanaDeployment.observedSourceMaterialHandoffVerification,
    ).toMatchObject({
      ready: true,
      statusCount: 1,
      blockers: [],
    });
  });

  it("omits historical Solana account diagnostics from production requirements", () => {
    const manifest = baseProductionManifest();

    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      accounts: {
        schema: "iroha-demo-sccp-solana-failclosed-accounts/v2",
        mint: manifest.solana_token_mint,
        verifierState: "9dM3KqVK7WZLvyRv6t8SV1yV3vo2oovQLk2qHqy9PA9U",
        sourceState: manifest.solana_source_state_address,
        previousMint: "5swsZQBiahbykoGt7Mf9QJhjBTfL6kUHXXzFZXgp849r",
        previousVerifierState: "9cvDUEot3WrYqaSYoRvHE1KxCmJSMMui5aRypU4tbDet",
        path: "output/sccp-solana-deploy/solana-failclosed-accounts.json",
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.solanaDeployment.staleObservedEvidence).toEqual([]);
    expect(report.solanaDeployment.accounts).toMatchObject({
      mint: manifest.solana_token_mint,
      sourceState: manifest.solana_source_state_address,
      path: "output/sccp-solana-deploy/solana-failclosed-accounts.json",
    });
    expect(report.solanaDeployment.accounts).not.toHaveProperty("previousMint");
    expect(report.solanaDeployment.accounts).not.toHaveProperty(
      "previousVerifierState",
    );
  });

  it("rejects manifest post-deploy hashes that do not match current upstream evidence", () => {
    const manifest = baseProductionManifest();
    const observedSourceBridgeConfigHash = materialHex32(
      "different-source-bridge-config",
    );
    const observedRouteCanaryEvidenceHash = materialHex32(
      "different-route-canary",
    );
    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      postDeployEvidence: {
        observedSourceBridgeConfig: {
          verifierProgramId: manifest.solana_verifier_program_id,
          bridgeProgramId: manifest.solana_program_id,
          sourceBridgeProgramId: manifest.sccp_solana_source_bridge_address,
          tokenMintAddress: manifest.solana_token_mint,
          verifierStateAddress: manifest.solana_verifier_state_address ?? null,
          sourceStateAddress: manifest.solana_source_state_address,
        },
        observedSourceBridgeConfigHash,
        liveReadbackReady: true,
        blockers: [],
      },
      routeCanarySubmission: {
        verifierProgramId: manifest.solana_verifier_program_id,
        verifierStateAddress: manifest.solana_verifier_state_address ?? null,
        tokenMintAddress: manifest.solana_token_mint,
        envelope: { canaryEvidenceHash: observedRouteCanaryEvidenceHash },
      },
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(
      report.blockers.find(
        (blocker) => blocker.id === "post-deploy-live-evidence-hashes",
      ),
    ).toMatchObject({
      missingOrInvalid: ["sourceBridgeConfigHash", "routeCanaryEvidenceHash"],
    });
    expect(report.requirements.postDeployLiveEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "sourceBridgeConfigHash",
          status: "invalid",
          upstreamSource: "post-deploy-evidence",
          upstreamValue: observedSourceBridgeConfigHash,
        }),
        expect.objectContaining({
          key: "routeCanaryEvidenceHash",
          status: "invalid",
          upstreamSource: "route-canary-submission",
          upstreamValue: observedRouteCanaryEvidenceHash,
        }),
      ]),
    );
  });

  it("sanitizes rollover-only Solana accounts before public artifact embedding", () => {
    const sanitized = sanitizeSolanaAccountsReportForProduction({
      schema: "iroha-demo-sccp-solana-failclosed-accounts/v2",
      mint: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      verifierState: "2YXm92rKs2qggznsKjQX6DVXa1ymVaYKeXXjHUvbGUVB",
      sourceState: "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
      previousMint: "5swsZQBiahbykoGt7Mf9QJhjBTfL6kUHXXzFZXgp849r",
      previousVerifierState: "9cvDUEot3WrYqaSYoRvHE1KxCmJSMMui5aRypU4tbDet",
      path: "output/sccp-solana-deploy/solana-failclosed-accounts.json",
    });

    expect(sanitized).toMatchObject({
      mint: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      verifierState: "2YXm92rKs2qggznsKjQX6DVXa1ymVaYKeXXjHUvbGUVB",
      sourceState: "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
      path: "output/sccp-solana-deploy/solana-failclosed-accounts.json",
    });
    expect(sanitized).not.toHaveProperty("previousMint");
    expect(sanitized).not.toHaveProperty("previousVerifierState");
  });

  it("pins live Solana evidence collection to manifest and ProgramData evidence", () => {
    const manifest = {
      verifierCodeHash: hex32("1"),
      solanaProgramdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solanaProgramdataSlot: 419725105,
      destinationBindingHash: hex32("3"),
    };
    const helperArgs = buildSolanaLiveEvidenceHelperArgs({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
        commitment: "finalized",
      },
      publicConfig: {
        verifierProgramId: "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf",
        programDataAddress: manifest.solanaProgramdataAddress,
        programDataSlot: manifest.solanaProgramdataSlot,
        executableBlake2b256: manifest.verifierCodeHash,
      }),
      manifest,
    });

    expect(helperArgs).toEqual(
      expect.arrayContaining([
        "--expected-verifier-code-hash",
        manifest.verifierCodeHash,
        "--expected-programdata-address",
        manifest.solanaProgramdataAddress,
        "--expected-programdata-slot",
        String(manifest.solanaProgramdataSlot),
        "--expected-destination-binding-hash",
        manifest.destinationBindingHash,
      ]),
    );
  });

  it("uses live ProgramData pins for live evidence collection over stale CLI evidence", () => {
    const staleProgramdataAddress =
      "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA";
    const liveProgramdataAddress =
      "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW";
    const helperArgs = buildSolanaLiveEvidenceHelperArgs({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
        commitment: "finalized",
      },
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: staleProgramdataAddress,
        programDataSlot: 419893805,
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
        programdata_address: liveProgramdataAddress,
        programdata_slot: "420825759",
      },
      manifest: {
        verifierCodeHash: materialHex32("verifier-code"),
        solanaProgramdataAddress: liveProgramdataAddress,
        solanaProgramdataSlot: "420825759",
      },
    });

    expect(helperArgs).toEqual(
      expect.arrayContaining([
        "--expected-programdata-address",
        liveProgramdataAddress,
        "--expected-programdata-slot",
        "420825759",
      ]),
    );
    expect(helperArgs).not.toContain(staleProgramdataAddress);
    expect(helperArgs).not.toContain("419893805");
  });

  it("can discover the live Solana verifier code hash during rotated deployments", () => {
    const manifest = {
      verifierCodeHash: hex32("1"),
      solanaProgramdataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
      solanaProgramdataSlot: 419893805,
      destinationBindingHash: hex32("3"),
    };
    const helperArgs = buildSolanaLiveEvidenceHelperArgs({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
        "discover-verifier-code-hash": true,
      },
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: manifest.solanaProgramdataAddress,
        programDataSlot: manifest.solanaProgramdataSlot,
        executableBlake2b256: manifest.verifierCodeHash,
      }),
      manifest,
    });

    expect(helperArgs).not.toContain("--expected-verifier-code-hash");
    expect(helperArgs).toEqual(
      expect.arrayContaining([
        "--expected-programdata-address",
        manifest.solanaProgramdataAddress,
        "--expected-programdata-slot",
        String(manifest.solanaProgramdataSlot),
      ]),
    );
  });

  it("keeps Solana live-evidence CLI output compact while preserving audit hashes", () => {
    const summary = summarizeSolanaLiveEvidenceForCli({
      verifier_program_id: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      verifier_code_hash: hex32("1"),
      programdata_address: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
      programdata_slot: "419893805",
      program_account_context_slot: "419939241",
      programdata_account_context_slot: "419939242",
      expected_verifier_code_hash_matches: true,
      expected_programdata_address_matches: true,
      expected_programdata_slot_matches: true,
      expected_destination_binding_hash_matches: true,
      destination_toml_ready: false,
      full_toml_ready: false,
      verifier_program_bytes_present: true,
      verifier_program_bytes_base64: "A".repeat(4096),
      verifier_program_bytes_base64_sha256:
        "761f43dfc5cb39e2579716c28222a96a473e1ce83ea8f87ec9f83981edf56418",
    });

    expect(summary).toMatchObject({
      verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      verifierCodeHash: hex32("1"),
      programdataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
      expectedVerifierCodeHashMatches: true,
      verifierProgramBytesPresent: true,
      verifierProgramBytesBase64Sha256:
        "761f43dfc5cb39e2579716c28222a96a473e1ce83ea8f87ec9f83981edf56418",
    });
    expect(summary).not.toHaveProperty("verifier_program_bytes_base64");
    expect(JSON.stringify(summary)).not.toContain("AAAA");
  });

  it("writes upgradeable Solana ProgramData as fail-closed live evidence", () => {
    const report = buildUpgradeableSolanaDraftLiveEvidence({
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: "419893805",
        upgradeAuthorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      }),
      error:
        "Solana verifier program must be immutable; upgrade authority is still set",
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      schema: "iroha-demo-sccp-solana-upgradeable-draft-live-evidence/v1",
      ready: false,
      verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      programdataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
      immutableVerifierReady: false,
      upgradeable: true,
      productionReady: false,
      blockerIds: ["solana-verifier-programdata-mutable"],
    });
    expect(report.blockers[0].detail).toContain(
      "Link the native recursive verifier first",
    );

    const summary = summarizeSolanaLiveEvidenceForCli(report);
    expect(summary.programdataSlot).toBe("419893805");

    const resolution = buildSolanaBlockerResolution(report.blockerIds);
    expect(resolution.solanaVerifierBlockerIds).toEqual([
      "solana-verifier-programdata-mutable",
    ]);
    expect(resolution.liveEvidenceBlockerIds).toEqual([]);
  });

  it("prefers live ProgramData readback over stale upgradeable evidence pins", () => {
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ slot: "420825759", includeSentinel: false }),
    );
    const report = buildUpgradeableSolanaDraftLiveEvidence({
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: "419893805",
        upgradeAuthorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      }),
      liveReadback: buildVerifierLinkageReadback({
        parsedProgramdata,
        programdataAddress: "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
      }),
      error:
        "Solana verifier program must be immutable; upgrade authority is still set",
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      programdataAddress: "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
      programdataSlot: "420825759",
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
      programdataExecutableBlake2b256: parsedProgramdata.executableBlake2b256,
      programdataExecutableSha256: parsedProgramdata.executableSha256,
    });
    expect(summarizeSolanaLiveEvidenceForCli(report)).toMatchObject({
      programdataSlot: "420825759",
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
    });
  });

  it("keeps Solana draft-manifest CLI output compact but evidence-complete", () => {
    const summary = summarizeSolanaRouteManifestForCli({
      schema: "iroha-sccp-taira-solana-xor-route-manifest-draft/v1",
      route_id: "taira_sol_xor",
      asset_key: "xor",
      production_ready: false,
      disabled_reason: "governed proof material is not published",
      solana_network: "testnet",
      solana_verifier_program_id:
        "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      solana_program_id: "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
      sccp_solana_source_bridge_address:
        "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
      solana_token_mint: "5swsZQBiahbykoGt7Mf9QJhjBTfL6kUHXXzFZXgp849r",
      verifier_code_hash: hex32("2"),
      verifier_key_hash: hex32("3"),
      destination_binding_hash: hex32("4"),
      deploymentEvidence: {
        verifierLive: {
          verifier_program_id: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
          verifier_code_hash: hex32("2"),
          expected_verifier_code_hash_matches: true,
          verifier_program_bytes_base64: "B".repeat(4096),
          verifier_program_bytes_base64_sha256:
            "cc7e1c36c22a5d460ef63a2e86aef47fea3df3a4b090af781d4166a60fa5e775",
        },
      },
      post_deploy_live_evidence: {
        full_toml_ready: false,
        source_bridge_config_hash: hex32("5"),
        route_canary_evidence_hash: hex32("6"),
        source_event_transaction_signature:
          "AvtbACWhxeBnDFzyvRugdmB6NpMLd6VCruJckuFoyJTRkLxkK7ED9mTVW5Vk8WwyJioHNjPFXtEY1A63t4w2UcZ",
        route_canary_transaction_signature:
          "4i1deVAVr6Kra11deJCxfJSvvKtnmnzgeAW5qEakz53BfycznnXtF2d2GRGdK9U977PRPYrd89HiAc1dhkjeQvar",
      },
      source_verifier_material: {
        placeholder_material: true,
      },
      source_adapter_engine_deployment: {
        placeholder_material: true,
      },
    });

    expect(summary).toMatchObject({
      routeId: "taira_sol_xor",
      productionReady: false,
      verifierCodeHash: hex32("2"),
      verifierLiveEvidence: {
        verifierCodeHash: hex32("2"),
        expectedVerifierCodeHashMatches: true,
        verifierProgramBytesBase64Sha256:
          "cc7e1c36c22a5d460ef63a2e86aef47fea3df3a4b090af781d4166a60fa5e775",
      },
      postDeployLiveEvidence: {
        sourceBridgeConfigHash: hex32("5"),
        routeCanaryEvidenceHash: hex32("6"),
      },
      sourceVerifierMaterialReady: false,
      sourceAdapterEngineDeploymentReady: false,
    });
    expect(JSON.stringify(summary)).not.toContain("BBBB");
  });

  it("parses deployed Solana SCCP state account counters and burn hash", () => {
    const state = parseSolanaSccpStateAccountData(
      buildStateData({
        acceptedCount: 7,
        lastSlot: 419725333,
        totalMinted: 11,
        totalBurned: 13,
        lastBurnHashByte: 0x5a,
      }),
    );

    expect(state).toMatchObject({
      magic: "SCCPSOL1",
      version: 1,
      authority: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      storedMint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      acceptedCount: "7",
      lastSlot: "419725333",
      nativeVerifierProgramId: null,
      verifierMaterialHash: null,
      verifierConfigHash: null,
      verifierConfiguredSlot: null,
      totalMinted: "11",
      totalBurned: "13",
      lastBurnHash: `0x${"5a".repeat(32)}`,
    });
  });

  it("parses deployed Solana SCCP state native verifier config", () => {
    const state = parseSolanaSccpStateAccountData(
      buildStateData({
        nativeVerifierProgram: "ComputeBudget111111111111111111111111111111",
        verifierMaterialHashByte: 0x4a,
        verifierConfigHashByte: 0x4b,
        verifierConfiguredSlot: 419725444,
      }),
    );

    expect(state).toMatchObject({
      nativeVerifierProgramId: "ComputeBudget111111111111111111111111111111",
      verifierMaterialHash: `0x${"4a".repeat(32)}`,
      verifierConfigHash: `0x${"4b".repeat(32)}`,
      verifierConfiguredSlot: "419725444",
    });
  });

  it("initializes zero-filled Solana SCCP state accounts during first deploy", () => {
    const inspection = inspectSolanaStateInitialization({
      account: solanaAccount({ data: Buffer.alloc(272) }),
      programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      stateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      authorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      mintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      label: "verifier",
    });

    expect(inspection).toMatchObject({
      shouldInitialize: true,
      alreadyInitialized: false,
      reason: "zero-filled-state",
    });
  });

  it("skips already-initialized Solana SCCP state accounts during redeploy", () => {
    const inspection = inspectSolanaStateInitialization({
      account: solanaAccount({ data: buildStateData() }),
      programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      stateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      authorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      mintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      label: "verifier",
    });

    expect(inspection).toMatchObject({
      shouldInitialize: false,
      alreadyInitialized: true,
      reason: "state-already-initialized",
      parsed: {
        authority: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        storedMint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      },
    });
  });

  it("rejects initialized Solana SCCP state accounts with a mismatched mint", () => {
    expect(() =>
      inspectSolanaStateInitialization({
        account: solanaAccount({ data: buildStateData() }),
        programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        stateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        authorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        mintAddress: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
        label: "verifier",
      }),
    ).toThrow(/state mint .* does not match/u);
  });

  it("rejects dirty Solana SCCP state accounts during redeploy", () => {
    const dirty = Buffer.alloc(272);
    dirty[24] = 1;

    expect(() =>
      inspectSolanaStateInitialization({
        account: solanaAccount({ data: dirty }),
        programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        stateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        authorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        mintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        label: "verifier",
      }),
    ).toThrow(/not clean or initialized/u);
  });

  it("rejects legacy or stale evidence instead of selecting a fail-closed fallback", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "sccp-solana-material-"));
    const current = {
      verifierProgramId: "4VRoFPvWGKcEUoxNLx4z85SPaMgKDQ41kYcHLA8KUT9Z",
      bridgeProgramId: "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
      sourceBridgeProgramId: "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
      tokenMintAddress: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      verifierStateAddress: "2YXm92rKs2qggznsKjQX6DVXa1ymVaYKeXXjHUvbGUVB",
      sourceStateAddress: "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
      programDataAddress: "DWrVUAfHZ4LRFsxzrcUnV8e7domCvQrW5K9iBb7BTyta",
      programDataSlot: 420349518,
    };
    const stale = {
      verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      bridgeProgramId: current.bridgeProgramId,
      sourceBridgeProgramId: current.sourceBridgeProgramId,
      tokenMintAddress: "5swsZQBiahbykoGt7Mf9QJhjBTfL6kUHXXzFZXgp849r",
      verifierStateAddress: "8qdWxZKrbUWCPnjky2RnoF4fMurPwKWttywvrRJBsQxb",
      sourceStateAddress: "Hg1umtvpvtegeuAFAehiMuN6oA4xcqg57HaZpVxQzVyX",
      programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
      programDataSlot: 419893805,
    };
    const manifestPath = path.join(
      tempDir,
      "taira-solana-xor-route.manifest.json",
    );
    try {
      writeJsonFixture(manifestPath, {
        routeId: "taira_sol_xor",
        assetKey: "xor",
        solanaVerifierProgramId: current.verifierProgramId,
        solanaProgramId: current.bridgeProgramId,
        sccpSolanaSourceBridgeAddress: current.sourceBridgeProgramId,
        solanaTokenMint: current.tokenMintAddress,
        solanaVerifierStateAddress: current.verifierStateAddress,
        solanaSourceStateAddress: current.sourceStateAddress,
        solanaProgramdataAddress: current.programDataAddress,
        solanaProgramdataSlot: current.programDataSlot,
      });
      writeJsonFixture(path.join(tempDir, "solana-deploy-public.json"), stale);
      writeJsonFixture(
        path.join(tempDir, "solana-failclosed-deploy-public.json"),
        current,
      );
      writeJsonFixture(path.join(tempDir, "solana-accounts.json"), {
        tokenMint: { address: stale.tokenMintAddress },
        verifierState: { address: stale.verifierStateAddress },
        sourceState: { address: stale.sourceStateAddress },
      });
      writeJsonFixture(path.join(tempDir, "solana-failclosed-accounts.json"), {
        tokenMint: { address: current.tokenMintAddress },
        verifierState: { address: current.verifierStateAddress },
        sourceState: { address: current.sourceStateAddress },
      });
      const legacyEvidencePath = path.join(
        tempDir,
        "solana-program.evidence.json",
      );
      writeJsonFixture(legacyEvidencePath, {
        programId: stale.verifierProgramId,
        programDataAddress: stale.programDataAddress,
        programDataSlot: stale.programDataSlot,
      });
      writeJsonFixture(
        path.join(tempDir, "solana-failclosed-program.evidence.json"),
        {
          programId: current.verifierProgramId,
          programDataAddress: current.programDataAddress,
          programDataSlot: current.programDataSlot,
        },
      );
      writeJsonFixture(
        path.join(tempDir, "solana-live-evidence.summary.json"),
        {
          verifier_program_id: stale.verifierProgramId,
          verifier_code_hash: materialHex32("stale-verifier"),
          programdata_address: stale.programDataAddress,
          programdata_slot: String(stale.programDataSlot),
        },
      );
      writeJsonFixture(
        path.join(tempDir, "solana-failclosed-live-evidence.json"),
        {
          verifier_program_id: current.verifierProgramId,
          verifier_code_hash: materialHex32("current-verifier"),
          programdata_address: current.programDataAddress,
          programdata_slot: String(current.programDataSlot),
        },
      );
      const expectedManifestSha256 = `0x${createHash("sha256")
        .update(readFileSync(manifestPath))
        .digest("hex")}`;

      await expect(
        loadSelectedSolanaDeploymentMaterial({
          args: {
            "output-dir": tempDir,
            manifest: manifestPath,
            "expected-manifest-sha256": expectedManifestSha256,
            "expected-evidence-sha256": `0x${createHash("sha256")
              .update(readFileSync(legacyEvidencePath))
              .digest("hex")}`,
          },
        }),
      ).rejects.toThrow(/finalized readback evidence schema is invalid/u);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("honors explicit public deployment inputs outside a fresh output directory", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "sccp-solana-explicit-"));
    const outputDir = path.join(tempDir, "fresh-output");
    const publicDir = path.join(tempDir, "reviewed-public-inputs");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
    const deployment = {
      verifierProgramId: "4VRoFPvWGKcEUoxNLx4z85SPaMgKDQ41kYcHLA8KUT9Z",
      bridgeProgramId: "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
      sourceBridgeProgramId: "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
      tokenMintAddress: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      verifierStateAddress: "2YXm92rKs2qggznsKjQX6DVXa1ymVaYKeXXjHUvbGUVB",
      sourceStateAddress: "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
      programDataAddress: "DWrVUAfHZ4LRFsxzrcUnV8e7domCvQrW5K9iBb7BTyta",
      programDataSlot: 420349518,
    };
    const manifestPath = path.join(publicDir, "route.manifest.json");
    const publicConfigPath = path.join(publicDir, "deploy-public.json");
    const accountsPath = path.join(publicDir, "accounts.json");
    const liveEvidencePath = path.join(publicDir, "live-evidence.json");
    try {
      writeJsonFixture(manifestPath, {
        routeId: "taira_sol_xor",
        assetKey: "xor",
        solanaVerifierProgramId: deployment.verifierProgramId,
        solanaProgramId: deployment.bridgeProgramId,
        sccpSolanaSourceBridgeAddress: deployment.sourceBridgeProgramId,
        solanaTokenMint: deployment.tokenMintAddress,
        solanaVerifierStateAddress: deployment.verifierStateAddress,
        solanaSourceStateAddress: deployment.sourceStateAddress,
        solanaProgramdataAddress: deployment.programDataAddress,
        solanaProgramdataSlot: deployment.programDataSlot,
      });
      writeJsonFixture(publicConfigPath, deployment);
      writeJsonFixture(accountsPath, {
        tokenMint: { address: deployment.tokenMintAddress },
        verifierState: { address: deployment.verifierStateAddress },
        sourceState: { address: deployment.sourceStateAddress },
      });
      writeJsonFixture(liveEvidencePath, {
        verifier_program_id: deployment.verifierProgramId,
        verifier_code_hash: materialHex32("explicit-verifier"),
        programdata_address: deployment.programDataAddress,
        programdata_slot: String(deployment.programDataSlot),
      });
      const expectedManifestSha256 = `0x${createHash("sha256")
        .update(readFileSync(manifestPath))
        .digest("hex")}`;

      const material = await loadSelectedSolanaDeploymentMaterial({
        args: {
          "output-dir": outputDir,
          manifest: manifestPath,
          "expected-manifest-sha256": expectedManifestSha256,
          "public-config": publicConfigPath,
          accounts: accountsPath,
          "live-evidence": liveEvidencePath,
        },
        requireEvidenceSha256Pin: false,
      });

      expect(material.id).toBe("canonical");
      expect(material.publicConfig?.bridgeProgramId).toBe(
        deployment.bridgeProgramId,
      );
      expect(material.accounts?.tokenMint?.address).toBe(
        deployment.tokenMintAddress,
      );
      expect(material.verifierEvidence).toBeNull();
      expect(material.verifierLiveEvidence?.verifier_program_id).toBe(
        deployment.verifierProgramId,
      );
      expect(material.materialPaths).toEqual({
        publicConfig: publicConfigPath,
        manifest: manifestPath,
        accounts: accountsPath,
        verifierEvidence: path.join(outputDir, "solana-program.evidence.json"),
        verifierLiveEvidence: liveEvidencePath,
      });
      expect(material.materialPaths.publicConfig.startsWith(outputDir)).toBe(
        false,
      );

      const explicitReportOptions = {
        "post-deploy-evidence": path.join(
          publicDir,
          "post-deploy-evidence.json",
        ),
        "post-deploy-manifest-evidence": path.join(
          publicDir,
          "post-deploy-manifest-evidence.json",
        ),
        "route-canary-submission": path.join(
          publicDir,
          "route-canary-submission.json",
        ),
        "source-burn-submission": path.join(
          publicDir,
          "source-burn-submission.json",
        ),
        "source-burn-readiness-report": path.join(
          publicDir,
          "source-burn-readiness.json",
        ),
        "prover-readiness-report": path.join(
          publicDir,
          "prover-readiness.json",
        ),
        "verifier-linkage-readiness-report": path.join(
          publicDir,
          "verifier-linkage-readiness.json",
        ),
        "program-finalization-readiness-report": path.join(
          publicDir,
          "program-finalization-readiness.json",
        ),
        "program-finalization-report": path.join(
          publicDir,
          "program-finalization.json",
        ),
        "production-requirements-report": path.join(
          publicDir,
          "production-requirements.json",
        ),
        "production-material-inventory-report": path.join(
          publicDir,
          "production-material-inventory.json",
        ),
        "route-publish-readiness-report": path.join(
          publicDir,
          "route-publish-readiness.json",
        ),
      };
      const explicitReportPaths = resolveSolanaPublicReportInputPaths(
        {
          "output-dir": outputDir,
          ...explicitReportOptions,
        },
        solanaDeployArtifactPaths({ "output-dir": outputDir }),
      );
      expect(explicitReportPaths).toEqual({
        postDeployEvidence: explicitReportOptions["post-deploy-evidence"],
        postDeployManifestEvidence:
          explicitReportOptions["post-deploy-manifest-evidence"],
        routeCanarySubmission: explicitReportOptions["route-canary-submission"],
        sourceBurnSubmission: explicitReportOptions["source-burn-submission"],
        sourceBurnReadiness:
          explicitReportOptions["source-burn-readiness-report"],
        proverReadiness: explicitReportOptions["prover-readiness-report"],
        verifierLinkageReadiness:
          explicitReportOptions["verifier-linkage-readiness-report"],
        programFinalizationReadiness:
          explicitReportOptions["program-finalization-readiness-report"],
        programFinalization:
          explicitReportOptions["program-finalization-report"],
        productionRequirements:
          explicitReportOptions["production-requirements-report"],
        productionMaterialInventory:
          explicitReportOptions["production-material-inventory-report"],
        routePublishReadiness:
          explicitReportOptions["route-publish-readiness-report"],
      });
      expect(
        Object.values(explicitReportPaths).every(
          (reportPath) => !reportPath.startsWith(`${outputDir}${path.sep}`),
        ),
      ).toBe(true);

      const defaultPaths = solanaDeployArtifactPaths({
        "output-dir": outputDir,
      });
      expect(resolveSolanaPublicReportInputPaths({}, defaultPaths)).toEqual({
        postDeployEvidence: defaultPaths.postDeployEvidence,
        postDeployManifestEvidence: defaultPaths.postDeployManifestEvidence,
        routeCanarySubmission: defaultPaths.routeCanarySubmission,
        sourceBurnSubmission: defaultPaths.sourceBurnSubmission,
        sourceBurnReadiness: defaultPaths.sourceBurnReadiness,
        proverReadiness: defaultPaths.proverReadiness,
        verifierLinkageReadiness: defaultPaths.verifierLinkageReadiness,
        programFinalizationReadiness: defaultPaths.programFinalizationReadiness,
        programFinalization: defaultPaths.programFinalization,
        productionRequirements: defaultPaths.productionRequirements,
        productionMaterialInventory: defaultPaths.productionMaterialInventory,
        routePublishReadiness: defaultPaths.routeManifestPublishReadiness,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps observed Solana post-deploy readback separate from missing governed route evidence", () => {
    const manifest = {
      ...baseProductionManifest(),
      production_ready: false,
      productionReady: false,
      disabledReason: "Route is not published on public TAIRA.",
      solana_program_id: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      solanaProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      taira_xor_solana_program_id:
        "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      tairaXorSolanaProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      sccp_solana_source_bridge_address:
        "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sccpSolanaSourceBridgeAddress:
        "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      solana_source_state_address:
        "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      solanaSourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      solana_verifier_program_id:
        "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      solanaVerifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
    };
    delete manifest.post_deploy_live_evidence;

    const report = buildSolanaPostDeployEvidenceReportBody({
      manifest,
      publicConfig: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
        mintAuthorityAddress: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
      },
      observed: observedPostDeploy(),
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyForProductionPostDeploy).toBe(false);
    expect(report.observedSourceBridgeConfigHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.observedSourceState.totalBurned).toBe("25");
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "manifest-post-deploy-live-evidence",
    );
  });

  it("marks live Solana post-deploy readback ready before final TOML review", () => {
    const manifest = {
      route_id: "taira_sol_xor",
      asset_key: "xor",
      solana_token_mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      solana_program_id: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      sccp_solana_source_bridge_address:
        "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      solana_source_state_address:
        "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      solana_verifier_program_id:
        "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      solana_verifier_state_address:
        "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      solana_mint_authority_address:
        "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
      solana_programdata_address:
        "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solana_programdata_slot: 419725105,
      verifier_code_hash: hex32("aa"),
      postDeployLiveEvidence: {
        fullTomlReady: false,
        sourceBridgeConfigHash: hex32("4"),
        routeCanaryEvidenceHash: hex32("5"),
        sourceEventTransactionSignature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        routeCanaryTransactionSignature:
          "4jVUe2ouFKLYLjreoQAz5KxK4Gaxm6M9ydma2Frv2LSAMmztTShjQZ4kH7CDVYmo8phCrWkEkCqrxfYT39D8yCbT",
      },
    };

    const publicConfig = {
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      mintAuthorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
    };
    const observed = observedPostDeploy();
    const mismatched = buildSolanaPostDeployEvidenceReportBody({
      manifest,
      publicConfig,
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: manifest.solana_verifier_program_id,
        programDataAddress: "3Uc6wefHaPvQZQWZJdtyb7SRpmT4R5XP8wBHExRTadSM",
        programDataSlot: 1,
        executableBlake2b256: manifest.verifier_code_hash,
      }),
      observed,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    expect(mismatched.liveReadbackReady).toBe(false);
    expect(mismatched.sourceBridgeConfigHashMatchesManifest).toBe(false);
    expect(mismatched.liveReadbackBlockerIds).toContain(
      "manifest-source-bridge-config-hash-mismatch",
    );
    expect(
      mismatched.liveReadbackBlockers.find(
        (blocker) =>
          blocker.id === "manifest-source-bridge-config-hash-mismatch",
      ),
    ).toMatchObject({
      expected: manifest.postDeployLiveEvidence.sourceBridgeConfigHash,
      observed: mismatched.observedSourceBridgeConfigHash,
    });
    manifest.postDeployLiveEvidence.sourceBridgeConfigHash =
      mismatched.observedSourceBridgeConfigHash;

    const report = buildSolanaPostDeployEvidenceReportBody({
      manifest,
      publicConfig,
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: manifest.solana_verifier_program_id,
        programDataAddress: "3Uc6wefHaPvQZQWZJdtyb7SRpmT4R5XP8wBHExRTadSM",
        programDataSlot: 1,
        executableBlake2b256: manifest.verifier_code_hash,
      }),
      verifierLiveEvidence: {
        verifier_code_hash: hex32("bb"),
        programdata_address: "3Uc6wefHaPvQZQWZJdtyb7SRpmT4R5XP8wBHExRTadSM",
        programdata_slot: "1",
      },
      observed,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.liveReadbackReady).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.readyForProductionPostDeploy).toBe(false);
    expect(report.liveReadbackBlockers).toEqual([]);
    expect(report.sourceBridgeConfigHashMatchesManifest).toBe(true);
    expect(report.manifestSourceBridgeConfigHash).toBe(
      report.observedSourceBridgeConfigHash,
    );
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "offline-full-toml",
    ]);
    expect(
      report.manifestPostDeployLiveStatuses.every(
        (status) => status.status === "present",
      ),
    ).toBe(true);
    expect(report.expectedMintAuthority).toBe(
      manifest.solana_mint_authority_address,
    );
    expect(report.observedSourceBridgeConfig).toMatchObject({
      expectedMintAuthority: manifest.solana_mint_authority_address,
      verifierProgramdataAddress:
        "3Uc6wefHaPvQZQWZJdtyb7SRpmT4R5XP8wBHExRTadSM",
      verifierProgramdataSlot: "1",
      verifierCodeHash: manifest.verifier_code_hash,
    });
    expect(report.verifierEvidence).toMatchObject({
      programdataAddress: "3Uc6wefHaPvQZQWZJdtyb7SRpmT4R5XP8wBHExRTadSM",
      programdataSlot: "1",
      verifierCodeHash: manifest.verifier_code_hash,
    });
  });

  it("sets generic ready for production Solana post-deploy evidence", () => {
    const manifest = {
      route_id: "taira_sol_xor",
      asset_key: "xor",
      solana_token_mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      solana_program_id: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      sccp_solana_source_bridge_address:
        "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      solana_source_state_address:
        "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      solana_verifier_program_id:
        "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      solana_verifier_state_address:
        "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      solana_mint_authority_address:
        "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
      postDeployLiveEvidence: {
        fullTomlReady: true,
        offlineFullTomlSha256: hex32("7"),
        sourceBridgeConfigHash: hex32("4"),
        routeCanaryEvidenceHash: hex32("5"),
        sourceEventTransactionSignature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        routeCanaryTransactionSignature:
          "4jVUe2ouFKLYLjreoQAz5KxK4Gaxm6M9ydma2Frv2LSAMmztTShjQZ4kH7CDVYmo8phCrWkEkCqrxfYT39D8yCbT",
      },
    };

    const publicConfig = {
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      mintAuthorityAddress: "8PMfHs8gKTZLxGLHXDNiYWnXUGtF2Kd6FpysLk4niyiJ",
    };
    const observed = observedPostDeploy();
    const initial = buildSolanaPostDeployEvidenceReportBody({
      manifest,
      publicConfig,
      observed,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    expect(initial.blockerIds).toContain(
      "manifest-source-bridge-config-hash-mismatch",
    );
    manifest.postDeployLiveEvidence.sourceBridgeConfigHash =
      initial.observedSourceBridgeConfigHash;
    const report = buildSolanaPostDeployEvidenceReportBody({
      manifest,
      publicConfig,
      observed,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.liveReadbackReady).toBe(true);
    expect(report.readyForProductionPostDeploy).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("builds a reviewable post-deploy manifest evidence patch from real Solana submissions", () => {
    const canonicalSnapshotSha256 = materialHex32(
      "post-deploy-canonical-snapshot",
    );
    const finalizedReadbackEvidenceArtifactSha256 = materialHex32(
      "post-deploy-finalized-readback-artifact",
    );
    const manifestArtifactSha256 = materialHex32(
      "post-deploy-route-manifest-artifact",
    );
    const postDeployEvidenceArtifactSha256 = materialHex32(
      "post-deploy-evidence-artifact",
    );
    const routeCanarySubmissionArtifactSha256 = materialHex32(
      "post-deploy-route-canary-artifact",
    );
    const sourceBurnSubmissionArtifactSha256 = materialHex32(
      "post-deploy-source-burn-artifact",
    );
    const manifest = {
      postDeployLiveEvidence: { sourceBridgeConfigHash: hex32("4") },
    };
    const postDeployEvidence = {
      observedSourceBridgeConfigHash: hex32("4"),
      observedSourceState: {
        totalBurned: "1",
        lastBurnHash: hex32("5"),
      },
      finalizedReadback: {
        schema: SOLANA_FINALIZED_READBACK_EVIDENCE_SCHEMA,
        evidenceArtifactSha256: finalizedReadbackEvidenceArtifactSha256,
        canonicalSnapshotSha256,
        snapshotContextSlot: "500000002",
      },
    };
    const routeCanarySubmission = {
      submitted: true,
      diagnosticOnly: false,
      productionProof: true,
      amountBaseUnits: "1",
      signature:
        "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
      signatureStatus: {
        confirmationStatus: "finalized",
        err: null,
      },
      transactionMeta: { err: null },
      productionStateDelta: {
        verifiedFromFinalizedTransaction: true,
        tokenAmountBefore: "10",
        tokenAmountAfter: "11",
        verifierAcceptedCountBefore: "3",
        verifierAcceptedCountAfter: "4",
        verifierTotalMintedBefore: "10",
        verifierTotalMintedAfter: "11",
      },
      replayProtection: {
        attempted: true,
        rejected: true,
        stateUnchanged: true,
        signature:
          "4jVUe2ouFKLYLjreoQAz5KxK4Gaxm6M9ydma2Frv2LSAMmztTShjQZ4kH7CDVYmo8phCrWkEkCqrxfYT39D8yCbT",
      },
      envelope: {
        canaryEvidenceHash: hex32("6"),
      },
    };
    const sourceBurnSubmission = {
      submitted: true,
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
    };

    const partial = buildSolanaPostDeployManifestEvidenceReportBody({
      postDeployEvidence,
      routeCanarySubmission,
      sourceBurnSubmission,
      manifest,
      manifestArtifactSha256,
      postDeployEvidenceArtifactSha256,
      routeCanarySubmissionArtifactSha256,
      sourceBurnSubmissionArtifactSha256,
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(partial.readyForManifestPatch).toBe(true);
    expect(partial.readyForProductionPostDeployEvidence).toBe(false);
    expect(partial.postDeployLiveEvidence).toMatchObject({
      fullTomlReady: false,
      sourceBridgeConfigHash: hex32("4"),
      routeCanaryEvidenceHash: hex32("6"),
      sourceEventTransactionSignature: sourceBurnSubmission.signature,
      routeCanaryTransactionSignature: routeCanarySubmission.signature,
    });
    expect(partial.productionBlockers.map((blocker) => blocker.id)).toContain(
      "offline-full-toml",
    );

    const full = buildSolanaPostDeployManifestEvidenceReportBody({
      postDeployEvidence,
      routeCanarySubmission,
      sourceBurnSubmission,
      manifest,
      manifestArtifactSha256,
      postDeployEvidenceArtifactSha256,
      routeCanarySubmissionArtifactSha256,
      sourceBurnSubmissionArtifactSha256,
      offlineFullTomlSha256: hex32("7"),
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(full.readyForProductionPostDeployEvidence).toBe(true);
    expect(full.manifestConformance).toMatchObject({
      ready: true,
      canonicalSnapshotSha256,
      finalizedReadbackEvidenceArtifactSha256,
      manifestArtifactSha256,
      observedSourceBridgeConfigHash: hex32("4"),
    });
    expect(full.postDeployLiveEvidence.offlineFullTomlSha256).toBe(hex32("7"));
    expect(full.post_deploy_live_evidence.offline_full_toml_sha256).toBe(
      hex32("7"),
    );
    for (const [field, blockerId] of [
      [
        "postDeployEvidenceArtifactSha256",
        "post-deploy-evidence-artifact-sha256",
      ],
      [
        "routeCanarySubmissionArtifactSha256",
        "route-canary-submission-artifact-sha256",
      ],
      [
        "sourceBurnSubmissionArtifactSha256",
        "source-burn-submission-artifact-sha256",
      ],
    ]) {
      const exactArtifactPins = {
        postDeployEvidenceArtifactSha256,
        routeCanarySubmissionArtifactSha256,
        sourceBurnSubmissionArtifactSha256,
      };
      delete exactArtifactPins[field];
      const missingPin = buildSolanaPostDeployManifestEvidenceReportBody({
        postDeployEvidence,
        routeCanarySubmission,
        sourceBurnSubmission,
        manifest,
        manifestArtifactSha256,
        offlineFullTomlSha256: hex32("7"),
        ...exactArtifactPins,
      });
      expect(missingPin.readyForProductionPostDeployEvidence).toBe(false);
      expect(missingPin.manifestConformance.ready).toBe(false);
      expect(missingPin.blockers.map((blocker) => blocker.id)).toContain(
        blockerId,
      );
    }
  });

  it("keeps a ledgered fail-closed route canary out of production post-deploy evidence", () => {
    const postDeployEvidence = {
      observedSourceBridgeConfigHash: hex32("4"),
      observedSourceState: {
        totalBurned: "1",
        lastBurnHash: hex32("5"),
      },
    };
    const routeCanarySubmission = {
      submitted: false,
      broadcastSubmitted: true,
      diagnosticOnly: true,
      productionProof: false,
      runtimeRejected: true,
      failClosed: true,
      signature:
        "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
      signatureStatus: {
        confirmationStatus: "confirmed",
        err: {
          InstructionError: [0, "InvalidInstructionData"],
        },
      },
      envelope: {
        canaryEvidenceHash: hex32("6"),
      },
    };
    const sourceBurnSubmission = {
      submitted: false,
      signature: null,
    };

    const report = buildSolanaPostDeployManifestEvidenceReportBody({
      postDeployEvidence,
      routeCanarySubmission,
      sourceBurnSubmission,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForManifestPatch).toBe(false);
    expect(report.postDeployLiveEvidence).toMatchObject({
      sourceBridgeConfigHash: hex32("4"),
      routeCanaryEvidenceHash: hex32("6"),
      sourceEventTransactionSignature: null,
      routeCanaryTransactionSignature: routeCanarySubmission.signature,
    });
    expect(report.sourceArtifacts).toMatchObject({
      routeCanarySubmitted: false,
      routeCanaryBroadcastSubmitted: true,
      routeCanaryLedgered: true,
      routeCanaryDiagnosticOnly: true,
      routeCanaryProductionProof: false,
      routeCanaryRuntimeRejected: true,
      routeCanaryFailClosed: true,
    });
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "route-canary-ledger-evidence",
    );
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "source-event-transaction-signature",
        "route-canary-production-proof",
        "route-canary-finalized-success",
        "route-canary-state-delta",
        "route-canary-replay-rejection",
        "source-burn-submitted",
      ]),
    );
    expect(report.readyForProductionPostDeployEvidence).toBe(false);
  });

  it("keeps post-deploy full TOML rendering blocked until governed hashes are supplied", () => {
    const report = buildSolanaPostDeployFullTomlReportBody({
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: materialHex32("verifier-code"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
      },
      postDeployManifestEvidence: {
        postDeployLiveEvidence: {
          routeCanaryEvidenceHash: materialHex32("route-canary"),
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToRender).toBe(false);
    expect(report.fullTomlReady).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "source-verifier-material-hash",
        "source-adapter-engine-deployment-hash",
        "route-allowlist-hash",
      ]),
    );
    expect(report.helper.command).toContain(
      "0x<source_verifier_material_hash>",
    );
    expect(report.commands.renderPostDeployFullToml).toContain(
      "0x<route_allowlist_hash>",
    );
    expect(report.commands.applyPostDeployManifestEvidence).toContain(
      "output/sccp-solana-deploy/taira-solana-xor-post-deploy-full.toml",
    );
    expect(report.nextActions).toEqual([
      "provide-source-verifier-material-hash",
      "provide-source-adapter-engine-deployment-hash",
      "provide-route-allowlist-hash",
    ]);
    expect(report.nextActionDetails[0]).toMatchObject({
      id: "provide-source-verifier-material-hash",
      command: report.commands.renderSourceMaterialToml,
      requiredInputs: [
        { id: "sourceTrustAnchorHash" },
        { id: "consensusVerifierHash" },
        { id: "messageInclusionVerifierHash" },
        { id: "finalityPolicyHash" },
        { id: "sourceStateVerifierHash" },
      ],
    });
    expect(report.nextActionDetails[1]).toMatchObject({
      id: "provide-source-adapter-engine-deployment-hash",
      command: report.commands.renderSourceMaterialToml,
    });
    expect(report.nextActionDetails[1].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "adapterVerifierVkHash",
          value: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
        }),
        expect.objectContaining({ id: "deploymentReceiptHash" }),
      ]),
    );
    expect(report.nextActionDetails[2]).toMatchObject({
      id: "provide-route-allowlist-hash",
      command: report.commands.deriveRouteAllowlistHash,
      requiredInputs: [
        {
          id: "source-verifier-material-hash",
          description: expect.any(String),
        },
        {
          id: "source-adapter-engine-deployment-hash",
          description: expect.any(String),
        },
        {
          id: "destinationBindingHash",
          description: expect.any(String),
          value:
            "0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6",
        },
      ],
    });
  });

  it("uses route-canary submission evidence for post-deploy full TOML inputs before manifest evidence exists", () => {
    const routeCanaryEvidenceHash = materialHex32("route-canary");
    const report = buildSolanaPostDeployFullTomlReportBody({
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: materialHex32("verifier-code"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
      },
      routeCanarySubmission: {
        submitted: false,
        failClosed: true,
        envelope: {
          canaryEvidenceHash: routeCanaryEvidenceHash,
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToRender).toBe(false);
    expect(report.normalizedInputs.routeCanaryEvidenceHash).toBe(
      routeCanaryEvidenceHash,
    );
    expect(report.helper.command).toContain(routeCanaryEvidenceHash);
    expect(report.commands.renderPostDeployFullToml).toContain(
      routeCanaryEvidenceHash,
    );
    expect(report.nextActions).toEqual([
      "provide-source-verifier-material-hash",
      "provide-source-adapter-engine-deployment-hash",
      "provide-route-allowlist-hash",
    ]);
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "routeCanaryEvidenceHash",
    );
  });

  it("uses live ProgramData pins for post-deploy full TOML over stale CLI evidence", () => {
    const report = buildSolanaPostDeployFullTomlReportBody({
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: materialHex32("verifier-code"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
        programdata_address: "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
        programdata_slot: "420825759",
      },
      manifest: {
        solanaProgramdataAddress:
          "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
        solanaProgramdataSlot: "420825759",
      },
      postDeployManifestEvidence: {
        postDeployLiveEvidence: {
          routeCanaryEvidenceHash: materialHex32("route-canary"),
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.normalizedInputs).toMatchObject({
      expectedProgramdataAddress:
        "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
      expectedProgramdataSlot: "420825759",
    });
    expect(report.helper.command).toEqual(
      expect.arrayContaining([
        "--expected-programdata-address",
        "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
        "--expected-programdata-slot",
        "420825759",
      ]),
    );
    expect(report.helper.command).not.toContain("419893805");
  });

  it("marks post-deploy full TOML ready only after the live helper renders TOML", () => {
    const sourceVerifierMaterialHash = materialHex32("source-material");
    const sourceAdapterEngineDeploymentHash = materialHex32("source-adapter");
    const routeAllowlistHash = materialHex32("route-allowlist");
    const routeCanaryEvidenceHash = materialHex32("route-canary");
    const offlineFullTomlSha256 = materialHex32("offline-toml");
    const report = buildSolanaPostDeployFullTomlReportBody({
      args: {
        "source-verifier-material-hash": sourceVerifierMaterialHash,
        "source-adapter-engine-deployment-hash":
          sourceAdapterEngineDeploymentHash,
        "route-allowlist-hash": routeAllowlistHash,
      },
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: materialHex32("verifier-code"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
      },
      postDeployManifestEvidence: {
        postDeployLiveEvidence: {
          routeCanaryEvidenceHash,
        },
      },
      helperResult: {
        status: 0,
        stdout:
          'route_id = "taira_sol_xor"\nsource_chain = "solana-testnet"\nfull_toml_ready = true\n',
        stderr: "",
      },
      tomlPath:
        "output/sccp-solana-deploy/taira-solana-xor-post-deploy-full.toml",
      tomlSha256: offlineFullTomlSha256,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToRender).toBe(true);
    expect(report.fullTomlReady).toBe(true);
    expect(report.offlineFullTomlSha256).toBe(offlineFullTomlSha256);
    expect(report.blockers).toEqual([]);
    expect(report.normalizedInputs).toMatchObject({
      sourceVerifierMaterialHash,
      sourceAdapterEngineDeploymentHash,
      routeAllowlistHash,
      routeCanaryEvidenceHash,
    });
    expect(report.helper.command).toContain("--toml");
    expect(report.helper.stdoutBytes).toBeGreaterThan(0);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "apply-post-deploy-manifest-evidence",
        command: report.commands.applyPostDeployManifestEvidence,
      },
    ]);
  });

  it("rejects repeated-byte placeholder hashes for post-deploy full TOML inputs", () => {
    const report = buildSolanaPostDeployFullTomlReportBody({
      args: {
        "source-verifier-material-hash": hex32("1"),
        "source-adapter-engine-deployment-hash":
          materialHex32("source-adapter"),
        "route-allowlist-hash": materialHex32("route-allowlist"),
        "route-canary-evidence-hash": materialHex32("route-canary"),
      },
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: materialHex32("verifier-code"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: materialHex32("verifier-code"),
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToRender).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "source-verifier-material-hash",
    );
    expect(
      report.inputStatuses.find(
        (status) => status.key === "sourceVerifierMaterialHash",
      ),
    ).toMatchObject({
      status: "invalid",
      error: expect.stringContaining("repeated-byte placeholder"),
    });
  });

  it("binds source burns to canonical TAIRA I105 recipients and unpredictable u64 nonces", () => {
    expect(normalizeTairaSourceBurnRecipient(TAIRA_RECIPIENT)).toBe(
      TAIRA_RECIPIENT,
    );
    for (const invalid of [
      MINAMOTO_RECIPIENT,
      "testu4taira:bridge",
      `${TAIRA_RECIPIENT} `,
      "testu\u0000invalid",
      "testuаinvalid",
    ]) {
      expect(() => normalizeTairaSourceBurnRecipient(invalid)).toThrow(
        /canonical TAIRA I105/u,
      );
    }

    for (const valid of ["1", "7", "18446744073709551615"]) {
      expect(normalizeSolanaSourceBurnNonce(valid)).toBe(valid);
    }
    for (const invalid of [
      "0",
      "01",
      "-1",
      "1.0",
      "burn-1",
      "18446744073709551616",
      " 7",
    ]) {
      expect(() => normalizeSolanaSourceBurnNonce(invalid)).toThrow(
        /canonical positive u64/u,
      );
    }

    const generated = new Set(
      Array.from({ length: 32 }, () => createSolanaSourceBurnNonce()),
    );
    expect(generated.size).toBe(32);
    for (const nonce of generated) {
      expect(normalizeSolanaSourceBurnNonce(nonce)).toBe(nonce);
    }
  });

  it("parses SPL token accounts used by the real Solana source burn gate", () => {
    const account = parseSolanaSplTokenAccountData(
      buildTokenAccountData({ amount: 2500 }),
    );

    expect(account).toMatchObject({
      mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amount: "2500",
      isInitialized: true,
      isFrozen: false,
    });
  });

  it("fails source-burn readiness when no real SPL TairaXOR exists", () => {
    const report = buildSolanaSourceBurnReadinessReportBody({
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "1",
      tokenMint: {
        supply: "0",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyToSubmitBurn).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining(["token-mint-supply", "source-token-account"]),
    );
    expect(report.blockerIds).toEqual(
      expect.arrayContaining(["token-mint-supply", "source-token-account"]),
    );
    expect(report.nextActions).toEqual([
      "link-solana-native-recursive-verifier",
      "rerun-solana-destination-canary",
      "rerun-source-burn-readiness",
    ]);
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "link-solana-native-recursive-verifier",
          blockedBy: ["token-mint-supply"],
        }),
      ]),
    );
    expect(report.nextActions).not.toContain(
      "fund-solana-source-token-account",
    );
  });

  it("ties zero Solana source-burn supply to the fail-closed verifier canary", () => {
    const report = buildSolanaSourceBurnReadinessReportBody({
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "1",
      tokenMint: {
        supply: "0",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [],
      routeCanarySubmission: {
        submitted: false,
        broadcastAttempted: true,
        broadcastSubmitted: true,
        failClosed: true,
        reason: "verifier-rejected-diagnostic-canary-on-chain",
        signature:
          "XurRo3hz9J1czZyYAUScChXdqoVeTDTXw73kZEKmKW63PpFzGFhyoQg365e6A4GNiBBtk3ePKHJuAMeo43KUDzG",
        explorerUrl:
          "https://explorer.solana.com/tx/XurRo3hz9J1czZyYAUScChXdqoVeTDTXw73kZEKmKW63PpFzGFhyoQg365e6A4GNiBBtk3ePKHJuAMeo43KUDzG?cluster=testnet",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        destinationTokenAccount: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
        tokenAccountAfter: {
          amount: "0",
          mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
          owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        },
        logs: [
          "Program log: SCCP Solana native recursive verifier is not linked; rejecting proof envelope",
        ],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "token-mint-supply",
        "solana-verifier-fail-closed-canary",
        "source-token-account",
      ]),
    );
    expect(report.routeCanary).toMatchObject({
      failClosed: true,
      reason: "verifier-rejected-diagnostic-canary-on-chain",
      signature:
        "XurRo3hz9J1czZyYAUScChXdqoVeTDTXw73kZEKmKW63PpFzGFhyoQg365e6A4GNiBBtk3ePKHJuAMeo43KUDzG",
      tokenAccountAfter: {
        amount: "0",
      },
    });
    expect(report.nextActions).toEqual([
      "link-solana-native-recursive-verifier",
      "rerun-solana-destination-canary",
      "rerun-source-burn-readiness",
    ]);
  });

  it("asks for a source token account only after real Solana supply exists", () => {
    const report = buildSolanaSourceBurnReadinessReportBody({
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "1",
      tokenMint: {
        supply: "25",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.blockerIds).toContain("source-token-account");
    expect(report.blockerIds).not.toContain("token-mint-supply");
    expect(report.nextActions).toEqual([
      "fund-solana-source-token-account",
      "rerun-source-burn-readiness",
    ]);
  });

  it("builds a real Solana source-burn instruction envelope only for existing balance", () => {
    const report = buildSolanaSourceBurnReadinessReportBody({
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      requireRecipient: true,
      requireNonce: true,
      tokenMint: {
        supply: "25",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [
        {
          address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
          owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
          amount: "25",
          isInitialized: true,
          isFrozen: false,
        },
      ],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const dataHex = buildSolanaSourceBurnInstructionDataHex({
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
    });
    const sourceBurnReceipt = deriveSolanaSourceBurnReceiptAddress({
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      nonce: "7",
    });
    const accountMetas = buildSolanaSourceBurnAccountMetas({
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      sourceTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBurnReceiptAddress: sourceBurnReceipt.address,
    });

    expect(report.ready).toBe(true);
    expect(report.readyToSubmitBurn).toBe(true);
    expect(report.nextActions).toEqual([]);
    expect(report.nextActionDetails).toEqual([]);
    expect(report.blockerIds).toEqual([]);
    expect(report.selectedSourceToken?.address).toBe(
      "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
    );
    expect(dataHex).toContain("0d0000006275726e5f746f5f7461697261");
    expect(dataHex).toContain("080000001900000000000000");
    expect(dataHex).toMatch(/080000000700000000000000$/u);
    expect(sourceBurnReceipt).toMatchObject({
      address: "6aF7sQDS28GPBqzZsmJyXdr5FpkZnw6Y1WehUcsru5wG",
      bump: 255,
      seed: "sccp-source-burn-receipt",
    });
    expect(
      accountMetas.map((account) => ({
        pubkey: account.pubkey.toBase58(),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
    ).toEqual([
      {
        pubkey: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: sourceBurnReceipt.address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId.toBase58(),
        isSigner: false,
        isWritable: false,
      },
    ]);
  });

  it("keeps post-burn readiness pinned to the submitted source token", () => {
    const report = buildSolanaSourceBurnReadinessReportBody({
      args: {
        "source-token-account": "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      },
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "25",
      tokenMint: {
        supply: "25",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [
        {
          address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
          owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
          amount: "0",
          isInitialized: true,
          isFrozen: false,
        },
        {
          address: "6v5a2tB2pa8Bjkc8ggXDiqMXvMQJ3uo4ssMdErA5pEXV",
          owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
          amount: "25",
          isInitialized: true,
          isFrozen: false,
        },
      ],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyToSubmitBurn).toBe(false);
    expect(report.selectedSourceToken).toBeNull();
    expect(report.tokenAccounts.map((account) => account.address)).toContain(
      "6v5a2tB2pa8Bjkc8ggXDiqMXvMQJ3uo4ssMdErA5pEXV",
    );
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "source-token-balance",
    ]);
    expect(report.blockerIds).toEqual(["source-token-balance"]);
  });

  it("builds a blocked Solana source-burn submission from read-only readiness", () => {
    const readiness = buildSolanaSourceBurnReadinessReportBody({
      publicConfig: {
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "1",
      tokenMint: {
        supply: "0",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [
        {
          address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
          owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
          amount: "0",
        },
      ],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    const submission = buildBlockedSolanaSourceBurnSubmissionReportBody({
      checkedAt: "2026-07-04T00:01:00.000Z",
      readinessReport: readiness,
      readinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
    });

    expect(submission).toMatchObject({
      schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
      ready: false,
      submitted: false,
      productionProof: false,
      reason: "source-burn-readiness-failed",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: null,
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceProofRequestReady: false,
      sourceProofRequest: null,
      tairaRecipient: null,
      nonce: null,
    });
    expect(submission.blockers.map((blocker) => blocker.id)).toEqual([
      "token-mint-supply",
      "source-token-balance",
    ]);
    expect(submission.preBurnReadiness.readyToSubmitBurn).toBe(false);
    expect(submission.preBurnReadiness.ready).toBe(false);
  });

  it("records consumed post-burn readiness without losing pre-burn evidence", () => {
    const publicConfig = {
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
    };
    const selectedToken = {
      address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      amount: "25",
      isInitialized: true,
      isFrozen: false,
    };
    const preBurnReadiness = buildSolanaSourceBurnReadinessReportBody({
      publicConfig,
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      requireRecipient: true,
      requireNonce: true,
      tokenMint: {
        supply: "25",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [selectedToken],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const postBurnReadiness = buildSolanaSourceBurnReadinessReportBody({
      publicConfig,
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      requireRecipient: true,
      requireNonce: true,
      tokenMint: {
        supply: "0",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(
        buildStateData({
          totalMinted: 25,
          totalBurned: 25,
          lastBurnHashByte: 0x12,
        }),
      ),
      tokenAccounts: [{ ...selectedToken, amount: "0" }],
      checkedAt: "2026-07-04T00:01:00.000Z",
    });
    const sourceProofRequest = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: selectedToken.address,
      tokenMintAddress: publicConfig.tokenMintAddress,
      sourceBridgeProgramId: publicConfig.sourceBridgeProgramId,
      sourceStateAddress: publicConfig.sourceStateAddress,
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      sourceBurnHash: hex32("12"),
      checkedAt: "2026-07-04T00:02:00.000Z",
    });
    const submission = buildSolanaSourceBurnSubmissionReportBody({
      checkedAt: "2026-07-04T00:03:00.000Z",
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      selectedSourceToken: selectedToken,
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      readinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
      preBurnReadiness,
      postBurnReadiness,
      sourceProofRequest,
    });

    expect(submission.ready).toBe(true);
    expect(submission.sourceProofRequestReady).toBe(true);
    expect(submission.preBurnReadiness).toMatchObject({
      ready: true,
      readyToSubmitBurn: true,
      selectedSourceToken: {
        address: selectedToken.address,
        amount: "25",
      },
    });
    expect(submission.postBurnReadinessRefreshReady).toBe(true);
    expect(submission.postBurnReadiness).toMatchObject({
      ready: false,
      readyToSubmitBurn: false,
      selectedSourceToken: null,
      tokenAccounts: [
        {
          address: selectedToken.address,
          amount: "0",
        },
      ],
      blockers: ["token-mint-supply", "source-token-balance"],
    });
  });

  it("keeps pre-burn evidence visible when post-burn readiness refresh fails", () => {
    const publicConfig = {
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
    };
    const selectedToken = {
      address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      owner: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      mint: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      amount: "25",
      isInitialized: true,
      isFrozen: false,
    };
    const preBurnReadiness = buildSolanaSourceBurnReadinessReportBody({
      publicConfig,
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "25",
      tokenMint: {
        supply: "25",
        decimals: 9,
        initialized: true,
      },
      sourceState: parseSolanaSccpStateAccountData(buildStateData()),
      tokenAccounts: [selectedToken],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const submission = buildSolanaSourceBurnSubmissionReportBody({
      checkedAt: "2026-07-04T00:03:00.000Z",
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      selectedSourceToken: selectedToken,
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      readinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
      preBurnReadiness,
      postBurnReadinessError: "RPC read failed",
      sourceProofRequest: { readyForSourceProof: true },
    });

    expect(submission.ready).toBe(true);
    expect(submission.sourceProofRequestReady).toBe(true);
    expect(submission.preBurnReadiness?.readyToSubmitBurn).toBe(true);
    expect(submission.postBurnReadinessRefreshReady).toBe(false);
    expect(submission.postBurnReadiness).toBeNull();
    expect(submission.postBurnReadinessError).toBe("RPC read failed");
  });

  it("builds a canonical Solana source-burn proof request scaffold for numeric nonces", () => {
    const scaffold = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      sourceBurnHash: hex32("12"),
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(scaffold.readyForSourceProof).toBe(true);
    expect(scaffold.productionProof).toBe(false);
    expect(scaffold.proofPackageIncluded).toBe(false);
    expect(scaffold.canonical?.transferPayload).toMatchObject({
      source_domain: 3,
      dest_domain: 0,
      nonce: "7",
      amount: "25",
      sender: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      recipient: TAIRA_RECIPIENT,
      route_id: "taira_sol_xor",
    });
    expect(scaffold.canonical?.messageBundle).toMatchObject({
      payload: {
        kind: "Transfer",
      },
    });
    expect(scaffold.canonical?.settlement).toEqual({
      entrypoint: "finalize_inbound",
      route: "taira_sol_xor",
      asset: "xor",
    });
    expect(scaffold.canonical?.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(scaffold.canonical?.commitmentRoot).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(scaffold.sourceBurn).toMatchObject({
      sourceBurnReceiptAddress: "6aF7sQDS28GPBqzZsmJyXdr5FpkZnw6Y1WehUcsru5wG",
      sourceBurnReceiptBump: 255,
    });
    expect(scaffold.blockers).toEqual([]);
  });

  it("rejects missing source accounts and substituted burn-receipt PDAs in proof requests", () => {
    const base = {
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "25",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
    };
    const substituted = buildSolanaSourceBurnProofRequestScaffold({
      ...base,
      sourceBurnReceiptAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
    });
    expect(substituted.readyForSourceProof).toBe(false);
    expect(substituted.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-burn-receipt" }),
      ]),
    );

    const missingAccount = buildSolanaSourceBurnProofRequestScaffold({
      ...base,
      sourceTokenAddress: null,
    });
    expect(missingAccount.readyForSourceProof).toBe(false);
    expect(missingAccount.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-burn-accounts" }),
      ]),
    );
  });

  it("builds source-burn proof requests from the selected manifest instead of stale public config", () => {
    const stalePublicConfig = {
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
    };
    const currentManifest = {
      sccpSolanaSourceBridgeAddress:
        "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
      solanaTokenMint: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      sccpSolanaSourceStateAddress:
        "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
    };
    const sourceBurnSubmission = {
      schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
      submitted: true,
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "EbDQS8ccQRBccjd9t6FcKSrv437NpoeXtZxP3LELodpJ",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
    };

    const scaffold = buildSolanaSourceBurnProofRequestFromSubmission({
      sourceBurnSubmission,
      publicConfig: stalePublicConfig,
      manifest: currentManifest,
      postDeployEvidence: {
        observedSourceState: {
          lastBurnHash: hex32("12"),
        },
      },
      checkedAt: "2026-07-07T00:00:00.000Z",
    });

    expect(scaffold.readyForSourceProof).toBe(true);
    expect(scaffold.sourceBurn).toMatchObject({
      tokenMintAddress: currentManifest.solanaTokenMint,
      sourceBridgeProgramId: currentManifest.sccpSolanaSourceBridgeAddress,
      sourceStateAddress: currentManifest.sccpSolanaSourceStateAddress,
      sourceBurnHash: hex32("12"),
    });
    expect(JSON.stringify(scaffold)).not.toContain(
      stalePublicConfig.tokenMintAddress,
    );
    expect(JSON.stringify(scaffold)).not.toContain(
      stalePublicConfig.sourceStateAddress,
    );
  });

  it("keeps legacy text-nonce Solana source burns out of canonical proof requests", () => {
    const scaffold = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "burn-1",
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(scaffold.readyForSourceProof).toBe(false);
    expect(scaffold.canonicalTransferReady).toBe(false);
    expect(scaffold.canonical).toBeNull();
    expect(scaffold.canonicalError).toMatch(/canonical positive u64/u);
    expect(scaffold.blockers.map((blocker) => blocker.id)).toEqual([
      "source-burn-receipt",
      "canonical-transfer-payload",
    ]);
  });

  it("builds a diagnostic Solana route-canary submit envelope with mint amount", () => {
    const input = {
      amountBaseUnits: "7",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      destinationTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      nonce: "1",
    };
    const envelope = buildSolanaRouteCanaryEnvelope(input);
    const dataHex = buildSolanaRouteCanaryInstructionDataHex(input);
    const receipt = deriveSolanaMessageReceiptAddress({
      verifierProgramId: input.verifierProgramId,
      verifierStateAddress: input.verifierStateAddress,
      messageId: envelope.messageId,
    });

    expect(envelope.diagnosticOnly).toBe(true);
    expect(envelope.productionProof).toBe(false);
    expect(envelope.dataHex).toContain(
      Buffer.from("submit_sccp_message_proof", "utf8").toString("hex"),
    );
    expect(envelope.dataHex).toContain("080000000700000000000000");
    expect(envelope.statementHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(envelope.proofContextHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(envelope.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(envelope.messageReceiptAddress).toBe(receipt.address);
    expect(envelope.messageReceiptBump).toBe(receipt.bump);
    expect(
      assertSolanaSettlementProofContextHash({
        ...envelope,
        payerAddress: envelope.ownerAddress,
      }),
    ).toBe(envelope.proofContextHash);
    expect(envelope.canaryEvidenceHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(dataHex).toContain(
      Buffer.from("submit_sccp_message_proof", "utf8").toString("hex"),
    );
  });

  it("binds the Solana settlement context to the canonical message and writable payout accounts", () => {
    const input = {
      statementHash: materialHex32("settlement-statement"),
      destinationBindingHash: materialHex32("settlement-binding"),
      messageId: materialHex32("settlement-message"),
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      destinationTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      payerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "7",
    };
    const amountLe = Buffer.alloc(8);
    amountLe.writeBigUInt64LE(7n);
    const expected = `0x${createHash("sha256")
      .update(Buffer.from("sccp:solana:settlement:v1", "utf8"))
      .update(Buffer.from(input.statementHash.slice(2), "hex"))
      .update(Buffer.from(input.destinationBindingHash.slice(2), "hex"))
      .update(Buffer.from(input.messageId.slice(2), "hex"))
      .update(Buffer.from(new PublicKey(input.tokenMintAddress).toBytes()))
      .update(
        Buffer.from(new PublicKey(input.destinationTokenAddress).toBytes()),
      )
      .update(Buffer.from(new PublicKey(input.payerAddress).toBytes()))
      .update(amountLe)
      .digest("hex")}`;

    expect(buildSolanaSettlementProofContextHash(input)).toBe(expected);
    expect(
      assertSolanaSettlementProofContextHash({
        ...input,
        proofContextHash: expected,
      }),
    ).toBe(expected);
    expect(() =>
      assertSolanaSettlementProofContextHash({
        ...input,
        proofContextHash: materialHex32("wrong-settlement-context"),
      }),
    ).toThrow(/canonical message, mint, destination, payer, and amount/u);
  });

  it("appends the canonical receipt and System Program to submit accounts with a writable payer", () => {
    const payer = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf";
    const state = "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS";
    const program = "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K";
    const messageId = materialHex32("submit-account-message");
    const receipt = deriveSolanaMessageReceiptAddress({
      verifierProgramId: program,
      verifierStateAddress: state,
      messageId,
    });
    const metas = buildSolanaSubmitAccountMetas({
      payerAddress: payer,
      verifierStateAddress: state,
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      destinationTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      mintAuthorityAddress: "4Y7UJXcmVtYxbJN9vfAAuqHbHGxn1qW9gBH44LMrQRkW",
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      messageReceiptAddress: receipt.address,
    });

    expect(metas).toHaveLength(9);
    expect(metas[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(metas[0].pubkey.toBase58()).toBe(payer);
    expect(metas[7]).toMatchObject({ isSigner: false, isWritable: true });
    expect(metas[7].pubkey.toBase58()).toBe(receipt.address);
    expect(metas[8]).toMatchObject({ isSigner: false, isWritable: false });
    expect(metas[8].pubkey.toBase58()).toBe("11111111111111111111111111111111");
  });

  it("rejects tampered diagnostic submit summaries before recording canary evidence", () => {
    const envelope = buildSolanaRouteCanaryEnvelope({
      amountBaseUnits: "1",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      destinationTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      nonce: "3",
    });

    expect(() =>
      buildRejectedSolanaRouteCanarySubmissionReportBody({
        ownerAddress: envelope.ownerAddress,
        amountBaseUnits: envelope.amountBaseUnits,
        envelope: {
          ...envelope,
          proofContextHash: materialHex32("tampered-canary-context"),
        },
      }),
    ).toThrow(/settlement proof context hash/u);
  });

  it("keeps failed on-chain Solana route canaries as diagnostic-only evidence", () => {
    const envelope = buildSolanaRouteCanaryEnvelope({
      amountBaseUnits: "1",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      destinationTokenAddress: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      nonce: "2",
    });
    const signature =
      "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm";

    const report = buildRejectedSolanaRouteCanarySubmissionReportBody({
      checkedAt: "2026-07-04T00:00:00.000Z",
      signature,
      preflightSkipped: true,
      canaryLogs: [
        "Program log: SCCP Solana native recursive verifier is not linked; rejecting proof envelope",
      ],
      signatureStatus: {
        confirmationStatus: "finalized",
        err: { InstructionError: [0, "InvalidInstructionData"] },
      },
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      amountBaseUnits: "1",
      tokenAccount: {
        address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
        created: false,
      },
      tokenAccountAfter: {
        address: "GkSa6kPaHffre7H4WmhvMNL6FvDGPNutYseUk3aHb86Y",
        amount: "0",
      },
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
      mintAuthorityAddress: "4Y7UJXcmVtYxbJN9vfAAuqHbHGxn1qW9gBH44LMrQRkW",
      envelope,
    });

    expect(report.submitted).toBe(false);
    expect(report.broadcastSubmitted).toBe(true);
    expect(report.preflightSkipped).toBe(true);
    expect(report.runtimeRejected).toBe(true);
    expect(report.failClosed).toBe(true);
    expect(report.productionProof).toBe(false);
    expect(report.signature).toBe(signature);
    expect(report.explorerUrl).toContain(signature);
    expect(report.envelope.canaryEvidenceHash).toBe(
      envelope.canaryEvidenceHash,
    );
  });

  it("keeps placeholder Solana prover modules fail-closed in readiness reports", () => {
    const report = buildSolanaProverReadinessReportBody({
      manifest: {
        productionReady: false,
      },
      entries: [
        {
          direction: "destination",
          ready: false,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: true,
          reason: "destination prover package is intentionally fail-closed",
        },
        {
          direction: "source",
          ready: false,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: true,
          reason: "source prover package is intentionally fail-closed",
        },
      ],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForProductionProofs).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.destination).toMatchObject({
      ready: false,
      missing: false,
      productionProofsReady: false,
      exportsOk: true,
      moduleHashMatchesManifest: true,
      sidecarReady: true,
      reason: "destination prover package is intentionally fail-closed",
      blockerIds: ["destination-prover-readiness"],
    });
    expect(report.source).toMatchObject({
      ready: false,
      missing: false,
      productionProofsReady: false,
      exportsOk: true,
      moduleHashMatchesManifest: true,
      sidecarReady: true,
      reason: "source prover package is intentionally fail-closed",
      blockerIds: ["source-prover-readiness"],
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "destination-prover-readiness",
      "source-prover-readiness",
    ]);
    expect(report.nextActions).toEqual([
      "publish-destination-solana-production-prover-package",
      "publish-source-solana-production-prover-package",
    ]);
    expect(report.nextActionDetails[0]).toMatchObject({
      id: "publish-destination-solana-production-prover-package",
      command: report.commands.refresh,
      validationCommands: [
        report.commands.writeSidecars,
        report.commands.refresh,
        report.commands.refreshSmokeReadiness,
      ],
      requiredInputs: [
        expect.objectContaining({
          id: "destination-browser-prover-module",
          env: "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL",
          proveExport: "proveSolanaSccpDestination",
          selfTestExport: "solanaSccpDestinationProverSelfTest",
        }),
        expect.objectContaining({
          id: "destination-prover-sidecar",
          schema: "iroha-demo-sccp-solana-browser-prover-sidecar/v1",
          requiredProductionProofsReady: true,
        }),
        expect.objectContaining({
          id: "destination-self-test-ready",
          expected: { ready: true },
        }),
        expect.objectContaining({
          id: "destination-manifest-hash-binding",
        }),
      ],
    });
    expect(report.nextActionDetails[1]).toMatchObject({
      id: "publish-source-solana-production-prover-package",
      requiredInputs: [
        expect.objectContaining({
          id: "source-browser-prover-module",
          env: "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
          proveExport: "proveSolanaSccpSource",
          selfTestExport: "solanaSccpSourceProverSelfTest",
        }),
        expect.objectContaining({
          id: "source-prover-sidecar",
          requiredProductionProofsReady: true,
        }),
        expect.objectContaining({
          id: "source-self-test-ready",
          expected: { ready: true },
        }),
        expect.objectContaining({
          id: "source-manifest-hash-binding",
        }),
      ],
    });
  });

  it("requires route-bound Solana prover sidecars before production proof readiness", () => {
    const report = buildSolanaProverReadinessReportBody({
      manifest: {
        productionReady: true,
      },
      entries: [
        {
          direction: "destination",
          ready: true,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: true,
        },
        {
          direction: "source",
          ready: true,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: false,
          sidecar: {
            errors: ["moduleHash does not match the prover module bytes."],
          },
        },
      ],
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.readyForProductionProofs).toBe(false);
    expect(report.blockers).toEqual([
      {
        id: "source-prover-sidecar",
        direction: "source",
        detail: "moduleHash does not match the prover module bytes.",
      },
    ]);
  });

  it("accepts Solana prover readiness only when modules, exports, hashes, and sidecars pass", () => {
    const report = buildSolanaProverReadinessReportBody({
      manifest: {
        productionReady: true,
      },
      entries: [
        {
          direction: "destination",
          ready: true,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: true,
        },
        {
          direction: "source",
          ready: true,
          exportsOk: true,
          moduleHashMatchesManifest: true,
          sidecarReady: true,
        },
      ],
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.readyForProductionProofs).toBe(true);
    expect(report.ready).toBe(true);
    expect(report.destination).toMatchObject({
      ready: true,
      missing: false,
      exportsOk: true,
      moduleHashMatchesManifest: true,
      sidecarReady: true,
      blockerIds: [],
    });
    expect(report.source).toMatchObject({
      ready: true,
      missing: false,
      exportsOk: true,
      moduleHashMatchesManifest: true,
      sidecarReady: true,
      blockerIds: [],
    });
    expect(report.blockers).toEqual([]);
    expect(report.nextActions).toEqual([
      "refresh-solana-smoke-readiness",
      "refresh-production-requirements",
    ]);
    expect(report.nextActionDetails).toEqual([
      expect.objectContaining({
        id: "refresh-solana-smoke-readiness",
        command: report.commands.refreshSmokeReadiness,
      }),
      expect.objectContaining({
        id: "refresh-production-requirements",
        command: report.commands.refreshProductionRequirements,
      }),
    ]);
  });

  it("writes fail-closed Solana prover sidecar bodies from unready self-tests", () => {
    const sidecar = buildSolanaProverSidecarBody({
      direction: "source",
      moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      moduleHash: hex32("12"),
      proveExport: "proveSolanaSccpSource",
      selfTestExport: "solanaSccpSourceProverSelfTest",
      selfTest: {
        ready: false,
        reason: "governed source proof package is not published",
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(sidecar).toMatchObject({
      schema: "iroha-demo-sccp-solana-browser-prover-sidecar/v1",
      routeId: "taira_sol_xor",
      route_id: "taira_sol_xor",
      assetKey: "xor",
      asset_key: "xor",
      network: "solana-testnet",
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      direction: "source",
      sourceDomain: 3,
      source_domain: 3,
      targetDomain: 0,
      target_domain: 0,
      moduleHash: hex32("12"),
      module_hash: hex32("12"),
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      requiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      productionProofsReady: false,
      production_proofs_ready: false,
      disabledReason: "governed source proof package is not published",
    });
  });

  it("accepts only complete governed Solana production material inventory", () => {
    const offline = reviewedOfflineTomlFixture({ root: "/tmp/material" });
    const sourceRecord = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceTrustAnchorHash: materialHex32("source-trust-anchor"),
      consensusVerifierHash: materialHex32("consensus-verifier"),
      messageInclusionVerifierHash: materialHex32("message-inclusion-verifier"),
      finalityPolicyHash: materialHex32("finality-policy"),
      sourceStateVerifierHash: materialHex32("source-state-verifier"),
    };
    const adapterRecord = {
      schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceTrustAnchorHash: materialHex32("source-trust-anchor"),
      consensusVerifierHash: materialHex32("consensus-verifier"),
      messageInclusionVerifierHash: materialHex32("message-inclusion-verifier"),
      finalityPolicyHash: materialHex32("finality-policy"),
      sourceStateVerifierHash: materialHex32("source-state-verifier"),
      adapterVerifierVkHash: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
      deploymentReceiptHash: materialHex32("deployment-receipt"),
      ...fullLightClientMaterialFields("inventory"),
    };
    const manifest = baseProductionManifest();
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/material"],
      governedRoots: ["/tmp/material"],
      files: [{ path: "/tmp/material/solana.json", size: 1000 }],
      expectedMaterialRootGroups: [
        {
          id: "sibling-solana-governed-material",
          required: true,
          paths: ["/tmp"],
        },
      ],
      records: [
        {
          kind: "json",
          path: "/tmp/material/solana.json",
          pointer: "/sourceVerifierMaterial",
          schema: sourceRecord.schema,
          record: sourceRecord,
        },
        {
          kind: "json",
          path: "/tmp/material/solana.json",
          pointer: "/sourceAdapterEngineDeployment",
          schema: adapterRecord.schema,
          record: adapterRecord,
        },
        ...offline.records,
      ],
      manifest,
      proverReadiness: readySolanaProverReadiness(),
      governanceApprovalValidation: readyInventoryGovernanceApproval({
        sourceVerifierMaterialHash: jsonSha256(sourceRecord),
        sourceAdapterEngineDeploymentHash: jsonSha256(adapterRecord),
        offlineFullTomlSha256: offline.offlineFullTomlSha256,
        manifest,
      }),
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.blockerIds).toEqual([]);
    expect(report.materialRoots.expectedGroups[0].ready).toBe(true);
    expect(report.materialRoots.expectedGroups[0].paths[0]).toMatchObject({
      status: "present",
      roleReadiness: {
        sourceVerifierMaterial: expect.objectContaining({ ready: true }),
        sourceAdapterEngineDeployment: expect.objectContaining({
          ready: true,
        }),
      },
    });
    expect(report.readyMaterial.sourceVerifierMaterial?.recordHash).toMatch(
      /^0x[0-9a-f]{64}$/u,
    );
    expect(report.readyMaterial.offlineFullToml?.offlineFullTomlSha256).toBe(
      offline.offlineFullTomlSha256,
    );
    expect(report.readyMaterial.destinationProofAdmission).toBe(true);
    expect(report.nextActions).toEqual([]);
    expect(report.nextActionDetails).toEqual([]);

    const incompleteAdapterRecord = { ...adapterRecord };
    delete incompleteAdapterRecord.towerReplayVerifierHash;
    delete incompleteAdapterRecord.fullAccountsdbLatticeVerifierHash;
    delete incompleteAdapterRecord.bankForkChoiceVerifierHash;
    delete incompleteAdapterRecord.expectedSourceVerifierMaterialHash;
    delete incompleteAdapterRecord.expectedSourceAdapterEngineDeploymentHash;
    delete incompleteAdapterRecord.expectedFullLightClientGateHash;
    const incompleteAdapterReport =
      buildSolanaProductionMaterialInventoryReportBody({
        roots: ["/tmp/material"],
        files: [{ path: "/tmp/material/solana.json", size: 1000 }],
        records: [
          {
            kind: "json",
            path: "/tmp/material/solana.json",
            pointer: "/sourceAdapterEngineDeployment",
            schema: incompleteAdapterRecord.schema,
            record: incompleteAdapterRecord,
          },
        ],
        manifest: {
          destinationProofAdmission: {
            admissionMode: "governed-zk-verifier-v1",
            proofSystem: "stark-fri-v1",
            shapeOnly: false,
            acceptsUnverifiedProofs: false,
          },
        },
        proverReadiness: readySolanaProverReadiness(),
        checkedAt: "2026-07-05T00:00:00.000Z",
      });

    expect(
      incompleteAdapterReport.candidates.sourceAdapterEngineDeployment[0].ready,
    ).toBe(false);
    expect(
      incompleteAdapterReport.candidates.sourceAdapterEngineDeployment[0]
        .statuses,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "towerReplayVerifierHash",
          status: "missing",
        }),
        expect.objectContaining({
          key: "expectedFullLightClientGateHash",
          status: "missing",
        }),
      ]),
    );
  });

  it("diagnoses current destination admission without blocking two-phase patch inventory", () => {
    const productionManifest = baseProductionManifest();
    const validAdmission = productionManifest.destination_proof_admission;
    const invalidAdmissions = [
      {
        label: "production mode alone",
        admission: { admissionMode: "governed-zk-verifier-v1" },
      },
      {
        label: "wrong proof system",
        admission: { ...validAdmission, proofSystem: "groth16" },
      },
      {
        label: "wrong entrypoint",
        admission: { ...validAdmission, entrypoint: "record_proof_envelope" },
      },
      {
        label: "mismatched route hash",
        admission: {
          ...validAdmission,
          verifierCodeHash: materialHex32("wrong"),
        },
      },
      {
        label: "shape-only admission",
        admission: { ...validAdmission, shapeOnly: true },
      },
      {
        label: "unverified-proof admission",
        admission: { ...validAdmission, acceptsUnverifiedProofs: true },
      },
    ];

    for (const { label, admission } of invalidAdmissions) {
      const report = buildSolanaProductionMaterialInventoryReportBody({
        manifest: {
          ...productionManifest,
          destinationProofAdmission: admission,
        },
        checkedAt: "2026-07-04T00:00:00.000Z",
      });

      expect(report.readyMaterial.destinationProofAdmission, label).toBe(false);
      expect(report.blockerIds, label).not.toContain(
        "destination-proof-admission",
      );
      expect(
        report.blockers.some(
          (blocker) => blocker.id === "destination-proof-admission",
        ),
        label,
      ).toBe(false);
    }
  });

  it("does not treat unrelated files in sibling Solana roots as governed material publication", () => {
    const artifactRoot = "/tmp";
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: [artifactRoot],
      files: [{ path: `${artifactRoot}/notes.json`, size: 100 }],
      expectedMaterialRootGroups: [
        {
          id: "sibling-solana-governed-material",
          required: true,
          paths: [artifactRoot],
        },
      ],
      records: [
        {
          kind: "json",
          path: `${artifactRoot}/notes.json`,
          pointer: "/",
          schema: "not-sccp-material/v1",
          record: {
            schema: "not-sccp-material/v1",
            routeId: "taira_sol_xor",
          },
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "envelope-recorder-v1",
        },
      },
      proverReadiness: {
        readyForProductionProofs: false,
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.materialRoots.expectedGroups[0]).toMatchObject({
      id: "sibling-solana-governed-material",
      ready: false,
      paths: [
        expect.objectContaining({
          path: artifactRoot,
          fileCount: 1,
          candidateCount: 0,
          status: "no-material-candidates",
        }),
      ],
    });
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "artifact-root-publication",
    );
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "artifact-root-publication",
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "offline-full-toml",
        "browser-prover-readiness",
      ]),
    );
  });

  it("surfaces public TAIRA Solana lane diagnostics without accepting placeholder material", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/public-preflight"],
      files: [
        {
          path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
          size: 1000,
        },
      ],
      records: [
        {
          kind: "json",
          path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
          pointer: "/",
          schema: "iroha-demo-sccp-solana-route-preflight/v1",
          record: {
            schema: "iroha-demo-sccp-solana-route-preflight/v1",
            publicSolanaCapability: {
              domain: 3,
              chain: "sol",
              counterparty_account_codec_key: "solana_base58",
              production_ready: false,
              disabled_reason:
                "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
              destination_rollout: {
                immutable_verifier_ready: false,
                anchors_ready: false,
                blockers: [
                  "immutable Solana verifier program is not deployed for this SCCP lane",
                  "cryptographic trust anchor is not active for this SCCP lane",
                ],
              },
              production_readiness: {
                production_ready: false,
                source_adapter_engine: {
                  source_verifier_material_ready: false,
                  source_trust_anchor_ready: false,
                  external_consensus_verifier_ready: false,
                  external_message_inclusion_verifier_ready: false,
                  production_ready: false,
                  blockers: [
                    "Solana finalized-slot/status verifier and full-light-client audit evidence is not deployed for SCCP source proofs",
                    "Solana transaction status/message inclusion verifier and full-light-client audit evidence is not deployed for SCCP source proofs",
                  ],
                  source_verifier_material: {
                    version: 1,
                    source_domain: 3,
                    source_chain: "sol",
                    source_trust_anchor_hash: materialHex32(
                      "public-source-trust-anchor",
                    ),
                    consensus_verifier_hash: materialHex32("public-consensus"),
                    message_inclusion_verifier_hash:
                      materialHex32("public-message"),
                    finality_policy_hash: materialHex32("public-finality"),
                    source_state_verifier_hash: `0x${"0".repeat(64)}`,
                    placeholder_material: true,
                  },
                },
                blockers: [
                  "source verifier material is not production-ready for this SCCP lane",
                  "production route allowlist is not anchored for this SCCP lane",
                ],
              },
            },
          },
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "envelope-recorder-v1",
        },
      },
      proverReadiness: {
        readyForProductionProofs: false,
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.publicLaneDiagnostics).toEqual([
      expect.objectContaining({
        path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
        ready: false,
        publicationReady: false,
        blockerIds: expect.arrayContaining([
          "public-solana-lane-not-production-ready",
          "public-solana-lane-disabled",
          "public-solana-source-material-not-ready",
          "public-solana-source-material-placeholder",
          "public-solana-source-state-verifier",
          "solana-source-verifier-material",
          "solana-transaction-inclusion-verifier",
        ]),
        sourceVerifierMaterial: expect.objectContaining({
          ready: false,
          statusIds: expect.arrayContaining([
            "placeholderMaterial",
            "sourceStateVerifierHash",
          ]),
        }),
      }),
    ]);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "public-solana-lane-material",
          blockerIds: expect.arrayContaining([
            "public-solana-source-material-placeholder",
            "public-solana-source-state-verifier",
          ]),
        }),
      ]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-governed-solana-source-material",
          blockedBy: expect.arrayContaining([
            expect.objectContaining({ id: "public-solana-lane-material" }),
          ]),
        }),
      ]),
    );
    expect(report.readyMaterial.sourceVerifierMaterial).toBeNull();
  });

  it.each([
    ["lane-ready-capability-blocked", true, false],
    ["lane-blocked-capability-ready", false, true],
  ])(
    "evaluates separate public lane and capability evidence without readiness splicing: %s",
    (_caseName, laneReady, capabilityReady) => {
      const publicLaneRecord = (ready) => ({
        domain: 3,
        chain: "sol",
        counterparty_account_codec_key: "solana_base58",
        production_ready: ready,
        productionReadiness: null,
        sourceAdapterEngine: null,
        routeAllowlist: null,
        ...(ready
          ? {}
          : {
              disabled_reason:
                "disabled until independently reviewed lane evidence is ready",
            }),
        destination_rollout: {
          immutable_verifier_ready: ready,
          anchors_ready: ready,
          proof_verification_mode: ready ? "native-recursive-verifier-v1" : "",
          verifier_enforcement_evidence_hash: ready
            ? materialHex32(`enforcement-${_caseName}`)
            : "",
          blockers: ready ? [] : ["independent lane evidence is blocked"],
        },
      });
      const report = buildSolanaProductionMaterialInventoryReportBody({
        roots: ["/tmp/public-preflight"],
        files: [
          {
            path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
            size: 1000,
          },
        ],
        records: [
          {
            kind: "json",
            path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
            pointer: "/",
            schema: "iroha-demo-sccp-solana-route-preflight/v1",
            record: {
              schema: "iroha-demo-sccp-solana-route-preflight/v1",
              publicSolanaLaneManifest: publicLaneRecord(laneReady),
              publicSolanaCapability: publicLaneRecord(capabilityReady),
            },
          },
        ],
        manifest: {
          destinationProofAdmission: {
            admissionMode: "envelope-recorder-v1",
          },
        },
        proverReadiness: { readyForProductionProofs: false },
        checkedAt: "2026-07-10T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.publicLaneDiagnostics).toEqual([
        expect.objectContaining({
          ready: false,
          publicationReady: false,
          independentEvidence: [
            expect.objectContaining({
              role: "publicSolanaLaneManifest",
              check: expect.objectContaining({
                status: laneReady ? "pass" : "fail",
              }),
            }),
            expect.objectContaining({
              role: "publicSolanaCapability",
              check: expect.objectContaining({
                status: capabilityReady ? "pass" : "fail",
              }),
            }),
          ],
          blockerIds: expect.arrayContaining([
            "public-solana-lane-not-production-ready",
          ]),
        }),
      ]);
    },
  );

  it("turns malformed public lane alias evidence into a blocker instead of aborting inventory", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/public-preflight"],
      files: [
        {
          path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
          size: 1000,
        },
      ],
      records: [
        {
          kind: "json",
          path: "/tmp/public-preflight/sccp-solana-route-preflight.json",
          pointer: "/",
          schema: "iroha-demo-sccp-solana-route-preflight/v1",
          record: {
            publicSolanaLaneManifest: {
              domain: 3,
              chain: "sol",
              counterparty_account_codec_key: "solana_base58",
              production_ready: true,
              productionReadiness: null,
              production_readiness: { production_ready: true },
            },
          },
        },
      ],
      manifest: {
        destinationProofAdmission: { admissionMode: "envelope-recorder-v1" },
      },
      proverReadiness: { readyForProductionProofs: false },
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.publicLaneDiagnostics[0]).toMatchObject({
      ready: false,
      publicationReady: false,
      blockerIds: expect.arrayContaining([
        "public-solana-lane-evidence-invalid",
      ]),
      independentEvidence: [
        expect.objectContaining({
          role: "publicSolanaLaneManifest",
          error: "productionReadiness must be an object.",
          check: expect.objectContaining({ status: "fail" }),
        }),
      ],
    });
  });

  it("builds a canonical Solana route allowlist hash report from governed source records", () => {
    const report = buildSolanaRouteAllowlistHashReportBody({
      sourceVerifierMaterialHash: hex32("1"),
      sourceAdapterEngineDeploymentHash: hex32("2"),
      destinationBindingHash:
        "0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6",
      routeAllowlistHash:
        "0x23a4f6b263c43ff65a031bf9d1bad1b66fda59b95040d3bd5a49a66ea619db43",
      expectedRouteAllowlistHash:
        "0x23a4f6b263c43ff65a031bf9d1bad1b66fda59b95040d3bd5a49a66ea619db43",
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      schema: "iroha-demo-sccp-solana-route-allowlist-hash/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceVerifierMaterialHash: hex32("1"),
      sourceAdapterEngineDeploymentHash: hex32("2"),
      routeAllowlistHash:
        "0x23a4f6b263c43ff65a031bf9d1bad1b66fda59b95040d3bd5a49a66ea619db43",
      expectedRouteAllowlistHashMatches: true,
      productionProofMaterialIncluded: false,
    });
  });

  it("builds a blocked Solana route allowlist hash report when governed hashes are absent", () => {
    const report = buildBlockedSolanaRouteAllowlistHashReportBody({
      destinationBindingHash:
        "0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6",
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      schema: "iroha-demo-sccp-solana-route-allowlist-hash/v1",
      ready: false,
      readyToDerive: false,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      sourceVerifierMaterialHash: null,
      sourceAdapterEngineDeploymentHash: null,
      routeAllowlistHash: null,
      productionProofMaterialIncluded: false,
      blockerIds: [
        "source-verifier-material-hash",
        "source-adapter-engine-deployment-hash",
      ],
    });
  });

  it("builds a production Solana manifest patch from governed proof-material hashes", () => {
    const draftManifest = {
      ...baseProductionManifest(),
      productionReady: false,
      production_ready: false,
      disabledReason: "proof material is still under review",
      disabled_reason: "proof material is still under review",
      destinationProofAdmission: {
        admissionMode: "envelope-recorder-v1",
        proofSystem: "none",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: hex32("1"),
        verifierKeyHash: hex32("2"),
        destinationBindingHash: hex32("3"),
        shapeOnly: true,
        acceptsUnverifiedProofs: true,
      },
      postDeployLiveEvidence: {
        schema: "iroha-sccp-solana-post-deploy-live-evidence/v1",
        fullTomlReady: true,
        sourceBridgeConfigHash: hex32("4"),
        routeCanaryEvidenceHash: hex32("5"),
        offlineFullTomlSha256: hex32("6"),
        sourceEventTransactionSignature:
          "2d1KBhY5pyRuCBiXxoLUKmGEE9oEHRduBJKmjnFqSpEF85r8651FayJRC977ajGdjEvLvmTvTATwu53CSSTZZscR",
        routeCanaryTransactionSignature:
          "2sqsLAxG7ufxpq1nbLT7XV8qYQtjLfpPuHogdVrwkSMwBCNQ83z4NEbXY2wFA2YhyscyjmtnzczDFzpSjv2yuGLS",
      },
    };
    const sourceVerifierMaterial = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceTrustAnchorHash: hex32("a1"),
      consensusVerifierHash: hex32("b2"),
      messageInclusionVerifierHash: hex32("c3"),
      finalityPolicyHash: hex32("d4"),
      sourceStateVerifierHash: hex32("e5"),
    };
    const sourceAdapterEngineDeployment = {
      ...sourceVerifierMaterial,
      schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
      adapterVerifierVkHash: hex32("f6"),
      deploymentReceiptHash: hex32("7a"),
      ...fullLightClientMaterialFields("manifest-patch"),
    };
    const report = buildSolanaProductionManifestPatchReportBody({
      manifest: draftManifest,
      sourceVerifierMaterial,
      sourceAdapterEngineDeployment,
      postDeployLiveEvidence: {
        ...draftManifest.postDeployLiveEvidence,
        full_toml_ready: true,
        source_bridge_config_hash: hex32("4"),
        route_canary_evidence_hash: hex32("5"),
        offline_full_toml_sha256: hex32("6"),
        source_event_transaction_signature:
          draftManifest.postDeployLiveEvidence.sourceEventTransactionSignature,
        route_canary_transaction_signature:
          draftManifest.postDeployLiveEvidence.routeCanaryTransactionSignature,
      },
      routeAllowlistHash: hex32("8b"),
      destinationProverModuleHash: materialHex32("destination-module"),
      destinationProverSidecarHash: materialHex32("destination-sidecar"),
      sourceProverModuleHash: materialHex32("source-module"),
      sourceProverSidecarHash: materialHex32("source-sidecar"),
      governanceProgramRolePins: readyGovernanceProgramRolePublicationPins(),
      applied: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    const productionManifest = { ...draftManifest };
    for (const key of [
      "disabledReason",
      "disabled_reason",
      "productionReady",
      "destinationProofAdmission",
      "destination_proof_admission",
      "verifierEnforcement",
      "verifier_enforcement",
      "destinationRollout",
      "destination_rollout",
      "productionReadiness",
      "production_readiness",
      "postDeployLiveEvidence",
      "post_deploy_live_evidence",
    ]) {
      delete productionManifest[key];
    }
    Object.assign(productionManifest, report.manifestPatch);

    expect(report).toMatchObject({
      schema: "iroha-demo-sccp-solana-production-manifest-patch/v1",
      readyForProductionManifestPatch: true,
      applied: true,
      productionProofMaterialGenerated: false,
      manifestPatch: {
        production_ready: true,
        verifier_target: SOLANA_VERIFIER_TARGET,
        destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
        solana_network: "solana-testnet",
        solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
        solana_verifier_program_id: SOLANA_VERIFIER_PROGRAM_ID,
        solana_verifier_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
        solana_verifier_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
        solana_verifier_artifact_sha256: SOLANA_SHARED_PROGRAM_ARTIFACT_SHA256,
        solana_verifier_code_hash: SOLANA_SHARED_PROGRAM_CODE_HASH,
        solana_bridge_program_id: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
        solana_bridge_programdata_address:
          SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
        solana_bridge_programdata_slot:
          SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_SLOT,
        solana_source_bridge_program_id: SOLANA_SOURCE_BRIDGE_PROGRAM_ID,
        solana_source_bridge_programdata_address:
          SOLANA_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
        solana_source_bridge_programdata_slot:
          SOLANA_SOURCE_BRIDGE_PROGRAMDATA_SLOT,
        solana_native_verifier_program_id: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        solana_native_verifier_programdata_address:
          SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
        solana_native_verifier_programdata_slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
        destination_proof_admission: {
          admission_mode: "governed-zk-verifier-v1",
          proof_system: "stark-fri-v1",
          proof_verification_mode: "native-recursive-verifier-v1",
          verifier_enforcement_evidence_hash: hex32("ee"),
          shape_only: false,
          accepts_unverified_proofs: false,
        },
        production_readiness: {
          source_adapter_ready: true,
          browser_provers_ready: true,
          proof_verification_mode: "native-recursive-verifier-v1",
          verifier_enforcement_evidence_hash: hex32("ee"),
          routes_allowlisted: true,
          production_ready: true,
          browser_provers: {
            destination_module_hash: materialHex32("destination-module"),
            destination_sidecar_hash: materialHex32("destination-sidecar"),
            source_module_hash: materialHex32("source-module"),
            source_sidecar_hash: materialHex32("source-sidecar"),
          },
        },
        destination_browser_prover: {
          module_hash: materialHex32("destination-module"),
          manifest_hash: materialHex32("destination-sidecar"),
          sidecar_hash: materialHex32("destination-sidecar"),
          proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
          required_proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
          genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
          destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
          verifier_target: SOLANA_VERIFIER_TARGET,
          production_proofs_ready: true,
        },
        source_browser_prover: {
          module_hash: materialHex32("source-module"),
          manifest_hash: materialHex32("source-sidecar"),
          sidecar_hash: materialHex32("source-sidecar"),
          proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
          required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
          genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
          production_proofs_ready: true,
        },
      },
    });
    expect(report.manifestPatch).not.toHaveProperty("productionReady");
    expect(report.manifestPatch).not.toHaveProperty(
      "destinationProofAdmission",
    );
    expect(report.manifestPatch).not.toHaveProperty("destinationBrowserProver");
    expect(report.manifestPatch).not.toHaveProperty("sourceBrowserProver");
    expect(report.derived.routeAllowlistHash).toBe(hex32("8b"));
    expect(report.derived.destinationProverModuleHash).toBe(
      materialHex32("destination-module"),
    );
    expect(() =>
      assertProductionSolanaManifest(productionManifest),
    ).not.toThrow();
  });

  it("rejects production Solana manifests backed only by envelope recorder enforcement", () => {
    const manifest = baseProductionManifest();
    manifest.destinationRollout = {
      ...manifest.destinationRollout,
      proofVerificationMode: "envelope-recorder-v1",
    };
    manifest.destination_rollout = {
      ...manifest.destination_rollout,
      proof_verification_mode: "envelope-recorder-v1",
    };
    manifest.destination_proof_admission = {
      ...manifest.destination_proof_admission,
      proof_verification_mode: "envelope-recorder-v1",
    };

    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /verifier enforcement mode must be native-recursive-verifier-v1/,
    );
  });

  it("uses explicit draft Solana verifier enforcement evidence without passing production", () => {
    const manifest = baseProductionManifest();
    manifest.verifierEnforcement = {
      proofVerificationMode: "native-recursive-verifier-unlinked-v1",
      verifierEnforcementEvidenceHash: hex32("ef"),
      nativeRecursiveVerifierLinked: false,
      failClosed: true,
    };
    manifest.verifier_enforcement = {
      proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      verifier_enforcement_evidence_hash: hex32("ef"),
      native_recursive_verifier_linked: false,
      fail_closed: true,
    };

    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const enforcementBlocker = report.blockers.find(
      (blocker) => blocker.id === "destination-verifier-enforcement",
    );

    expect(enforcementBlocker).toMatchObject({
      missingOrInvalid: ["proofVerificationMode"],
    });
    expect(
      report.requirements.destinationVerifierEnforcement.find(
        (status) => status.key === "verifierEnforcementEvidenceHash",
      ),
    ).toMatchObject({
      status: "present",
      value: hex32("ef"),
    });
    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /native-recursive-verifier-unlinked-v1/,
    );
  });

  it("accepts only an explicit reviewed governed native verifier package bound to the deployed artifact", () => {
    const packageRecord = governedNativeVerifierPackage();
    const report = buildSolanaGovernedNativeVerifierPackageValidation({
      packageRecord,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      packagePath: "/public/sccp-solana/governed-native-verifier.json",
      packageSha256: materialHex32("governed-native-package"),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      ready: true,
      productionReady: true,
      blockerIds: [],
      verifierMaterialHash: jsonSha256(packageRecord.material),
      verifierConfigHash: jsonSha256(packageRecord.config),
      expectedNativeVerifier: {
        programId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        programdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
        programdataSlot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
        artifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
        codeHash: SOLANA_NATIVE_VERIFIER_CODE_HASH,
        verifierKeyHash: SOLANA_NATIVE_VERIFIER_KEY_HASH,
        governanceApprovalEvidenceHash: SOLANA_NATIVE_VERIFIER_GOVERNANCE_HASH,
      },
    });
    expect(report.statuses.every((status) => status.status === "present")).toBe(
      true,
    );
  });

  it("binds the governed native-verifier package hashes to the exact route manifest", () => {
    const packageRecord = governedNativeVerifierPackage();
    const packageValidation =
      buildSolanaGovernedNativeVerifierPackageValidation({
        packageRecord,
        nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
        governanceApprovalValidation:
          readyProductionGovernanceApprovalValidation(),
        packagePath: "/public/sccp-solana/governed-native-verifier.json",
        packageSha256: materialHex32("governed-native-package"),
      });
    const manifest = baseProductionManifest();
    expect(
      buildSolanaGovernedNativeVerifierManifestBinding({
        manifest,
        packageValidation,
      }),
    ).toMatchObject({ ready: true, mismatches: [], blockerIds: [] });

    const changed = {
      ...manifest,
      solanaNativeVerifierMaterialHash: materialHex32(
        "different-native-material",
      ),
      solana_native_verifier_material_hash: materialHex32(
        "different-native-material",
      ),
    };
    expect(
      buildSolanaGovernedNativeVerifierManifestBinding({
        manifest: changed,
        packageValidation,
      }),
    ).toMatchObject({
      ready: false,
      mismatches: ["verifierMaterialHash"],
      blockerIds: ["governed-native-verifier-manifest-verifierMaterialHash"],
    });
  });

  it("requires an independent byte hash for the production governance approval", () => {
    const approvalRecord = productionGovernanceApprovalRecord();
    const observed = jsonSha256(approvalRecord);
    const selfAsserted = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord,
      approvalSha256: observed,
    });
    const mismatched = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord,
      approvalSha256: observed,
      expectedApprovalSha256: materialHex32("different-approval"),
    });
    const pinned = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord,
      approvalSha256: observed,
      expectedApprovalSha256: observed,
    });

    expect(selfAsserted.ready).toBe(false);
    expect(selfAsserted.blockerIds).toContain(
      "solana-governance-approval-expectedSha256",
    );
    expect(mismatched.ready).toBe(false);
    expect(mismatched.blockerIds).toContain(
      "solana-governance-approval-sha256Binding",
    );
    expect(pinned).toMatchObject({ ready: true, blockerIds: [] });
  });

  it("requires governance to pin both direction-specific prover KAT vectors", () => {
    const approvalRecord = productionGovernanceApprovalRecord();
    delete approvalRecord.pins.destinationProverKnownAnswerVectorHash;
    delete approvalRecord.pins.sourceProverKnownAnswerVectorHash;
    const observed = jsonSha256(approvalRecord);
    const validation = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord,
      approvalSha256: observed,
      expectedApprovalSha256: observed,
    });

    expect(validation.ready).toBe(false);
    expect(validation.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-governance-approval-pins.destinationProverKnownAnswerVectorHash",
        "solana-governance-approval-pins.sourceProverKnownAnswerVectorHash",
      ]),
    );
  });

  it("binds every Solana program role to independent governance pins while allowing one reviewed SBF artifact", () => {
    const report = buildSolanaGovernanceProgramRolePinValidation({
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      manifest: baseProductionManifest(),
      liveReadbacks: readyGovernanceProgramRoleReadbacks(),
      artifactSha256ByRole: readyGovernanceProgramRoleArtifactHashes(),
      requireManifest: true,
      requireLiveReadback: true,
      requireArtifacts: true,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      ready: true,
      productionReady: true,
      blockerIds: [],
      policy: {
        programIdsDistinct: true,
        programdataAddressesDistinct: true,
        sharedArtifactHashesAllowed: true,
        sharedCodeHashesAllowed: true,
        selfDerivedApprovalPinsAccepted: false,
      },
    });
    expect(
      new Set(
        ["outerVerifier", "destinationBridge", "sourceBridge"].map(
          (role) => report.roles[role].approved.artifactSha256,
        ),
      ).size,
    ).toBe(1);
    expect(report.statuses.every((status) => status.status === "present")).toBe(
      true,
    );
  });

  it.each([
    "outerVerifierProgramId",
    "outerVerifierProgramdataAddress",
    "outerVerifierProgramdataSlot",
    "outerVerifierArtifactSha256",
    "outerVerifierCodeHash",
    "destinationBridgeProgramId",
    "destinationBridgeProgramdataAddress",
    "destinationBridgeProgramdataSlot",
    "destinationBridgeArtifactSha256",
    "destinationBridgeCodeHash",
    "sourceBridgeProgramId",
    "sourceBridgeProgramdataAddress",
    "sourceBridgeProgramdataSlot",
    "sourceBridgeArtifactSha256",
    "sourceBridgeCodeHash",
  ])("rejects governance approval missing role-specific pin %s", (pin) => {
    const record = productionGovernanceApprovalRecord();
    delete record.pins[pin];
    const observed = jsonSha256(record);
    const validation = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord: record,
      approvalSha256: observed,
      expectedApprovalSha256: observed,
    });

    expect(validation.ready).toBe(false);
    expect(validation.blockerIds).toContain(
      `solana-governance-approval-pins.${pin}`,
    );
  });

  it("rejects substituted or swapped selected program roles", () => {
    const manifest = baseProductionManifest();
    for (const key of [
      "solanaVerifierProgramId",
      "solana_verifier_program_id",
    ]) {
      manifest[key] = SOLANA_DESTINATION_BRIDGE_PROGRAM_ID;
    }
    for (const key of [
      "solanaBridgeProgramId",
      "solana_bridge_program_id",
      "solana_program_id",
    ]) {
      manifest[key] = SOLANA_VERIFIER_PROGRAM_ID;
    }
    const report = buildSolanaGovernanceProgramRolePinValidation({
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      manifest,
      requireManifest: true,
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-governance-program-role-outerVerifier-selected-programId",
        "solana-governance-program-role-destinationBridge-selected-programId",
      ]),
    );
  });

  it("rejects stale ProgramData slots, changed code, and shared readback splicing", () => {
    const readbacks = readyGovernanceProgramRoleReadbacks({
      overrides: {
        destinationBridge: { programdataSlot: "420442700" },
        sourceBridge: { codeHash: materialHex32("substituted-source-code") },
      },
    });
    readbacks.nativeVerifier = readbacks.outerVerifier;
    const report = buildSolanaGovernanceProgramRolePinValidation({
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      manifest: baseProductionManifest(),
      liveReadbacks: readbacks,
      artifactSha256ByRole: readyGovernanceProgramRoleArtifactHashes(),
      requireManifest: true,
      requireLiveReadback: true,
      requireArtifacts: true,
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-governance-program-role-destinationBridge-live-programdataSlot",
        "solana-governance-program-role-sourceBridge-live-codeHash",
        "solana-governance-program-role-all-distinct-live-readback-records",
        "solana-governance-program-role-nativeVerifier-live-programId",
      ]),
    );
  });

  it("rejects duplicated approval identities and self-derived approval bytes", () => {
    const duplicate = productionGovernanceApprovalRecord({
      pins: {
        sourceBridgeProgramId: SOLANA_DESTINATION_BRIDGE_PROGRAM_ID,
        sourceBridgeProgramdataAddress:
          SOLANA_DESTINATION_BRIDGE_PROGRAMDATA_ADDRESS,
      },
    });
    const duplicateHash = jsonSha256(duplicate);
    const duplicateValidation =
      buildSolanaProductionGovernanceApprovalValidation({
        approvalRecord: duplicate,
        approvalSha256: duplicateHash,
        expectedApprovalSha256: duplicateHash,
      });
    const selfDerived = buildSolanaProductionGovernanceApprovalValidation({
      approvalRecord: productionGovernanceApprovalRecord(),
      approvalSha256: jsonSha256(productionGovernanceApprovalRecord()),
    });

    expect(duplicateValidation.ready).toBe(false);
    expect(duplicateValidation.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-governance-approval-pins.distinctProgramIds",
        "solana-governance-approval-pins.distinctProgramdataAddresses",
      ]),
    );
    expect(
      buildSolanaGovernanceProgramRolePinValidation({
        governanceApprovalValidation: selfDerived,
        manifest: baseProductionManifest(),
      }).blockerIds,
    ).toContain("solana-governance-program-role-approval");
  });

  it("rejects self-asserted reviewed native verifier material without independent approval", () => {
    const packageRecord = governedNativeVerifierPackage({
      materialOverrides: {
        governanceApprovalEvidenceHash: materialHex32(
          "self-asserted-governance",
        ),
      },
      configOverrides: {
        governanceApprovalEvidenceHash: materialHex32(
          "self-asserted-governance",
        ),
      },
    });
    const report = buildSolanaGovernedNativeVerifierPackageValidation({
      packageRecord,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
      packageSha256: materialHex32("self-asserted-package"),
    });

    expect(packageRecord.reviewed).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "governed-native-verifier-governanceApproval",
        "governed-native-verifier-approvalNativeVerifierProgramId",
      ]),
    );
  });

  it("rejects mismatched, placeholder, or secret-bearing native verifier packages", () => {
    const packageRecord = governedNativeVerifierPackage({
      materialOverrides: {
        nativeVerifierArtifactSha256: hex32("ab"),
      },
      packageOverrides: {
        privateKey: "must-never-be-present",
      },
    });
    const report = buildSolanaGovernedNativeVerifierPackageValidation({
      packageRecord,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "governed-native-verifier-materialNativeVerifierArtifactSha256",
        "governed-native-verifier-publicMaterialOnly",
      ]),
    );
    expect(
      report.statuses.find((status) => status.key === "publicMaterialOnly"),
    ).toMatchObject({
      status: "invalid",
      value: ["package.privateKey"],
    });
  });

  it("rejects conflicting governed native verifier aliases and non-false template markers", () => {
    const packageRecord = governedNativeVerifierPackage({
      materialOverrides: {
        route_id: "another_route",
        solana_network: "mainnet-beta",
        templateOnly: false,
        template_only: true,
      },
      configOverrides: {
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      },
      packageOverrides: {
        production_ready: false,
      },
    });
    const report = buildSolanaGovernedNativeVerifierPackageValidation({
      packageRecord,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "governed-native-verifier-packageProductionReady",
        "governed-native-verifier-materialRouteId",
        "governed-native-verifier-materialSolanaNetwork",
        "governed-native-verifier-materialTemplateOnly",
        "governed-native-verifier-configProofVerificationMode",
      ]),
    );
    expect(
      report.statuses.find((status) => status.key === "materialTemplateOnly"),
    ).toMatchObject({
      status: "invalid",
      value: [false, true],
    });
  });

  it("rejects and strips unknown secret-like governed verifier fields from public reports", () => {
    const packageRecord = governedNativeVerifierPackage({
      materialOverrides: {
        authority: "runtime-only-signing-authority",
        accessToken: "runtime-only-token",
        routeId: { privateKey: "runtime-only-nested-key" },
      },
      configOverrides: {
        wallet: "runtime-only-wallet",
      },
    });
    const report = buildSolanaGovernedNativeVerifierPackageValidation({
      packageRecord,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
      governanceApprovalValidation:
        readyProductionGovernanceApprovalValidation(),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "governed-native-verifier-materialFields",
        "governed-native-verifier-configFields",
        "governed-native-verifier-publicMaterialOnly",
      ]),
    );
    expect(report.materialDescriptor).not.toHaveProperty("authority");
    expect(report.materialDescriptor).not.toHaveProperty("accessToken");
    expect(report.materialDescriptor).not.toHaveProperty("routeId");
    expect(report.configDescriptor).not.toHaveProperty("wallet");
    expect(JSON.stringify(report)).not.toContain("runtime-only-");
  });

  it("refuses combined native-verifier finalization before any deploy/configure mutation", () => {
    const report = buildSolanaNativeVerifierDeploymentPolicyReportBody({
      governedPackagePresent: true,
      finalizeNativeVerifier: true,
      repositoryStagingArtifact: false,
      executableElf: true,
      cpiMarkerPresent: true,
      governedMaterialNotLinkedSentinelPresent: false,
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual([
      "solana-native-verifier-combined-finalization",
    ]);
    expect(report.blockers[0].error).toContain(
      "disabled in the combined deploy/configure command",
    );
  });

  it("builds the hardened one-shot verifier configuration account order", () => {
    const authority = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf";
    const state = "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS";
    const metas = buildConfigureNativeVerifierAccountMetas({
      authorityAddress: authority,
      verifierStateAddress: state,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      nativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
      verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
      verifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
    });

    expect(
      metas.map((meta) => ({
        address: meta.pubkey.toBase58(),
        signer: meta.isSigner,
        writable: meta.isWritable,
      })),
    ).toEqual([
      { address: authority, signer: true, writable: false },
      { address: state, signer: false, writable: true },
      {
        address: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        signer: false,
        writable: false,
      },
      {
        address: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
        signer: false,
        writable: false,
      },
      {
        address: SOLANA_VERIFIER_PROGRAM_ID,
        signer: false,
        writable: false,
      },
      {
        address: SOLANA_PROGRAMDATA_ADDRESS,
        signer: false,
        writable: false,
      },
    ]);
  });

  it("requires both outer and native verifier ProgramData to be immutable before one-shot configuration", () => {
    const outerParsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ upgradeAuthority: null }),
    );
    const live = buildVerifierLinkageReadback({
      parsedProgramdata: outerParsedProgramdata,
    });
    const ready = buildSolanaNativeVerifierConfigurationReadinessReportBody({
      verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      outerLiveReadback: live,
      nativeLiveReadback: live.native,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    const mutableOuter = buildVerifierLinkageReadback({
      parsedProgramdata: parseSolanaProgramdataAccountDataForLinkage(
        buildProgramdataData(),
      ),
    });
    const outerBlocked =
      buildSolanaNativeVerifierConfigurationReadinessReportBody({
        verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
        nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        outerLiveReadback: mutableOuter,
        nativeLiveReadback: mutableOuter.native,
      });
    const mutableNative = buildVerifierLinkageReadback({
      parsedProgramdata: outerParsedProgramdata,
      nativeParsedProgramdata: parseSolanaProgramdataAccountDataForLinkage(
        buildProgramdataData({
          slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
          programBytes: SOLANA_NATIVE_PROGRAM_BYTES,
        }),
      ),
    });
    const nativeBlocked =
      buildSolanaNativeVerifierConfigurationReadinessReportBody({
        verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
        nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        outerLiveReadback: mutableNative,
        nativeLiveReadback: mutableNative.native,
      });

    expect(ready).toMatchObject({
      ready: true,
      oneShotConfiguration: true,
      verifierProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
      nativeVerifierProgramdataAddress: SOLANA_NATIVE_PROGRAMDATA_ADDRESS,
      blockerIds: [],
    });
    expect(outerBlocked.ready).toBe(false);
    expect(outerBlocked.blockerIds).toContain(
      "solana-configure-outerverifier-programdata-mutable",
    );
    expect(nativeBlocked.ready).toBe(false);
    expect(nativeBlocked.blockerIds).toContain(
      "solana-configure-nativeverifier-programdata-mutable",
    );
  });

  it("persists native-verifier configuration intent before no-retry broadcast and binds the configured slot", async () => {
    const deployer = Keypair.generate();
    const immutableProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ upgradeAuthority: null }),
    );
    const linkage = buildVerifierLinkageReadback({
      parsedProgramdata: immutableProgramdata,
    });
    const configuredStateData = (configuredSlot) => {
      const data = buildStateData({
        authority: deployer.publicKey.toBase58(),
        nativeVerifierProgram: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        verifierConfiguredSlot: configuredSlot,
      });
      Buffer.from(SOLANA_NATIVE_VERIFIER_MATERIAL_HASH.slice(2), "hex").copy(
        data,
        96,
      );
      Buffer.from(SOLANA_NATIVE_VERIFIER_CONFIG_HASH.slice(2), "hex").copy(
        data,
        128,
      );
      return data;
    };
    const events = [];
    let expectedSignature = null;
    const nativeRouteFence = {
      schema: "iroha-demo-sccp-solana-route-absence-mutation-fence/v1",
      ready: true,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      routeAbsent: true,
      authoritativeManifestReadReady: true,
      quorumReady: true,
      quorumArtifactSha256: materialHex32("native-route-quorum"),
      target: { canonicalRolloutTargetReady: true },
      manifestReadEvidence: {
        cacheBypassRequested: true,
        cacheBypassVerified: true,
        finalityBoundRead: true,
        finalizedHeightBefore: 101,
        manifestFinalizedHeight: 101,
        finalizedHeightAfter: 101,
      },
      quorumEvidence: {
        schema: "iroha-demo-sccp-solana-route-absence-quorum/v1",
        ready: true,
        requiredValidatorCount: 4,
        observedValidatorCount: 4,
        commonManifestFinalizedHeight: 101,
        commonIrohaStateHash: materialHex32("native-common-state"),
        validators: [1, 2, 3, 4].map((index) => ({
          toriiUrl: `https://taira-validator-${index}.sora.org`,
          mcpUrl: `https://taira-validator-${index}.sora.org/v1/mcp`,
          ready: true,
          routeAbsent: true,
          manifestFinalizedHeight: 101,
          finalizedHeightBefore: 101,
          finalizedHeightAfter: 101,
          cacheBypassVerified: true,
          finalityBoundRead: true,
          nodeIdentity: `taira-peer-${index}`,
          irohaStateHash: materialHex32("native-common-state"),
          preflightArtifactSha256: materialHex32(`native-validator-${index}`),
          blockerIds: [],
        })),
      },
      blockerIds: [],
    };
    const mutationTarget = {
      verifierProgramId: SOLANA_VERIFIER_PROGRAM_ID,
      verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
    };
    const operationBinding = {
      authority: deployer.publicKey.toBase58(),
      nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
      verifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
      verifierConfigHash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
    };
    const result = await configureSolanaNativeVerifierState({
      connection: {},
      deployer,
      verifierProgramId: new PublicKey(SOLANA_VERIFIER_PROGRAM_ID),
      verifierStateAddress: new PublicKey(SOLANA_VERIFIER_STATE_ADDRESS),
      nativeVerifierProgramId: new PublicKey(SOLANA_NATIVE_VERIFIER_PROGRAM_ID),
      verifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
      verifierConfigHash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
      mutationTarget,
      operationBinding,
      beforeBroadcast: async () => nativeRouteFence,
      persistIntent: async ({ intent }) => {
        events.push("intent");
        expectedSignature = intent.expectedSignature;
        expect(
          Transaction.from(Buffer.from(intent.rawTransactionBase64, "base64")),
        ).toBeInstanceOf(Transaction);
        return { sha256: materialHex32("native-intent") };
      },
      persistResolution: async () => {
        events.push("resolution");
        return { sha256: materialHex32("native-resolution") };
      },
      resolveAmbiguousIntent: async () => ({
        status: "finalized",
        finalizedSlot: 150,
      }),
      dependencies: {
        readProgramLinkage: async (programId) =>
          programId === SOLANA_VERIFIER_PROGRAM_ID ? linkage : linkage.native,
        getLatestBlockhash: async () => ({
          blockhash: Keypair.generate().publicKey.toBase58(),
          lastValidBlockHeight: 999,
        }),
        assertRpcIdentity: async () => SOLANA_TESTNET_GENESIS_HASH,
        sendRawTransaction: async (_raw, options) => {
          events.push("broadcast");
          expect(options).toEqual({ skipPreflight: false, maxRetries: 0 });
          return expectedSignature;
        },
        confirmTransaction: async () => ({ value: { err: null } }),
        readStateAccount: async () => ({
          contextSlot: 160,
          info: { data: configuredStateData(150) },
        }),
      },
    });
    expect(events).toEqual(["intent", "broadcast", "resolution"]);
    expect(result).toMatchObject({
      configureSignature: expectedSignature,
      finalizedSlot: 150,
      configuredStateReady: true,
    });

    const rejectedSend = vi.fn();
    const rejectedDeployer = Keypair.generate();
    await expect(
      configureSolanaNativeVerifierState({
        connection: {},
        deployer: rejectedDeployer,
        verifierProgramId: new PublicKey(SOLANA_VERIFIER_PROGRAM_ID),
        verifierStateAddress: new PublicKey(SOLANA_VERIFIER_STATE_ADDRESS),
        nativeVerifierProgramId: new PublicKey(
          SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        ),
        verifierMaterialHash: SOLANA_NATIVE_VERIFIER_MATERIAL_HASH,
        verifierConfigHash: SOLANA_NATIVE_VERIFIER_CONFIG_HASH,
        mutationTarget,
        operationBinding: {
          ...operationBinding,
          authority: rejectedDeployer.publicKey.toBase58(),
        },
        beforeBroadcast: async () => nativeRouteFence,
        persistIntent: async () => {
          throw new Error("injected native intent fsync failure");
        },
        persistResolution: async () => ({}),
        resolveAmbiguousIntent: async () => ({ status: "ambiguous" }),
        dependencies: {
          readProgramLinkage: async (programId) =>
            programId === SOLANA_VERIFIER_PROGRAM_ID ? linkage : linkage.native,
          getLatestBlockhash: async () => ({
            blockhash: Keypair.generate().publicKey.toBase58(),
            lastValidBlockHeight: 999,
          }),
          sendRawTransaction: rejectedSend,
        },
      }),
    ).rejects.toThrow(/native intent fsync failure/u);
    expect(rejectedSend).not.toHaveBeenCalled();
  });

  it("rejects arbitrary ungoverned native-verifier artifacts even when their shape looks valid", () => {
    const report = buildSolanaNativeVerifierDeploymentPolicyReportBody({
      governedPackagePresent: false,
      repositoryStagingArtifact: false,
      executableElf: true,
      cpiMarkerPresent: true,
      governedMaterialNotLinkedSentinelPresent: true,
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual([
      "solana-native-verifier-custom-ungoverned-artifact",
    ]);
    expect(report.blockers[0].error).toContain(
      "only permits the repository staging artifact",
    );
  });

  it("requires immutable matching native ProgramData before governed material is configuration-ready", () => {
    const packageValidation =
      buildSolanaGovernedNativeVerifierPackageValidation({
        packageRecord: governedNativeVerifierPackage(),
        nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
        governanceApprovalValidation:
          readyProductionGovernanceApprovalValidation(),
      });
    const outerProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ upgradeAuthority: null }),
    );
    const mutableNativeProgramdata =
      parseSolanaProgramdataAccountDataForLinkage(
        buildProgramdataData({
          slot: SOLANA_NATIVE_PROGRAMDATA_SLOT,
          programBytes: SOLANA_NATIVE_PROGRAM_BYTES,
        }),
      );
    const readback = buildVerifierLinkageReadback({
      parsedProgramdata: outerProgramdata,
      nativeParsedProgramdata: mutableNativeProgramdata,
    }).native;
    const report = buildSolanaGovernedNativeVerifierLiveReadinessReportBody({
      packageValidation,
      liveReadback: readback,
      artifactBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain(
      "solana-native-verifier-programdata-mutable",
    );
    expect(report.blockerIds).not.toContain("solana-native-verifier-code-hash");
  });

  it("binds governed verifier artifact hashes to exact live ProgramData bytes", () => {
    const packageValidation =
      buildSolanaGovernedNativeVerifierPackageValidation({
        packageRecord: governedNativeVerifierPackage(),
        nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ID,
        nativeVerifierArtifactSha256: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
        governanceApprovalValidation:
          readyProductionGovernanceApprovalValidation(),
      });
    const readback = buildVerifierLinkageReadback({
      parsedProgramdata: parseSolanaProgramdataAccountDataForLinkage(
        buildProgramdataData({ upgradeAuthority: null }),
      ),
    }).native;
    const report = buildSolanaGovernedNativeVerifierLiveReadinessReportBody({
      packageValidation,
      liveReadback: readback,
      artifactBytes: Buffer.concat([
        SOLANA_NATIVE_PROGRAM_BYTES,
        Buffer.from("locally-drifted", "utf8"),
      ]),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain(
      "solana-native-verifier-artifact-sha256",
    );
    expect(
      report.statuses.find(
        (status) => status.key === "nativeVerifierArtifactSha256",
      ),
    ).toMatchObject({
      status: "invalid",
      expected: SOLANA_NATIVE_VERIFIER_ARTIFACT_SHA256,
    });
  });

  it("rejects a production manifest that omits the distinct native verifier ProgramData pins", () => {
    const manifest = baseProductionManifest();
    delete manifest.solanaNativeVerifierProgramdataAddress;
    delete manifest.solana_native_verifier_programdata_address;

    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /native verifier ProgramData is missing/u,
    );
  });

  it("parses mutable Solana ProgramData without treating it as immutable production verifier material", () => {
    const parsed = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ includeSentinel: true }),
    );

    expect(parsed).toMatchObject({
      tag: 3,
      slot: SOLANA_PROGRAMDATA_SLOT,
      immutable: false,
      upgradeAuthorityOption: 1,
      upgradeAuthorityAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      executableElf: true,
      failClosedSentinelPresent: true,
      nativeVerifierCpiMarkerPresent: false,
    });
    expect(parsed.executableBlake2b256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(parsed.executableSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(parsed.executableLength).toBeGreaterThan(
      SOLANA_VERIFIER_FAIL_CLOSED_SENTINEL.length,
    );
  });

  it("blocks Solana verifier linkage while live ProgramData is mutable and fail-closed", () => {
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ includeSentinel: true }),
    );
    const manifest = {
      ...baseProductionManifest(),
      solana_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
      solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
      solana_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
      solanaProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
      verifier_code_hash: parsedProgramdata.executableBlake2b256,
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
      verifierEnforcement: {
        proofVerificationMode: "native-recursive-verifier-unlinked-v1",
        verifierEnforcementEvidenceHash: hex32("ee"),
      },
      verifier_enforcement: {
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
        verifier_enforcement_evidence_hash: hex32("ee"),
      },
    };

    const report = buildSolanaVerifierLinkageReadinessReportBody({
      manifest,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      liveReadback: buildVerifierLinkageReadback({ parsedProgramdata }),
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyForProductionVerifier).toBe(false);
    expect(report.programdataAddress).toBe(SOLANA_PROGRAMDATA_ADDRESS);
    expect(report.liveProgramdata).toMatchObject({
      immutable: false,
      executableBlake2b256: parsedProgramdata.executableBlake2b256,
      failClosedSentinelPresent: true,
      nativeVerifierCpiMarkerPresent: false,
    });
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-verifier-programdata-mutable",
        "solana-verifier-fail-closed-sentinel",
        "solana-verifier-cpi-marker",
        "solana-verifier-enforcement-mode",
      ]),
    );
    expect(report.blockerIds).not.toContain("solana-verifier-code-hash");
    expect(
      report.statuses.find((status) => status.key === "verifierCodeHash"),
    ).toMatchObject({
      status: "present",
      value: parsedProgramdata.executableBlake2b256,
    });
    expect(report.nextActions).toEqual([
      "link-solana-native-recursive-verifier",
    ]);
  });

  it("passes Solana verifier linkage for immutable sentinel-free native recursive verifier material", () => {
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({
        upgradeAuthority: null,
        includeSentinel: false,
      }),
    );
    const manifest = {
      ...baseProductionManifest(),
      solana_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
      solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
      solana_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
      solanaProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
      verifier_code_hash: parsedProgramdata.executableBlake2b256,
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
      verifierEnforcement: {
        proofVerificationMode: "native-recursive-verifier-v1",
        verifierEnforcementEvidenceHash: hex32("ee"),
      },
      verifier_enforcement: {
        proof_verification_mode: "native-recursive-verifier-v1",
        verifier_enforcement_evidence_hash: hex32("ee"),
      },
    };

    const report = buildSolanaVerifierLinkageReadinessReportBody({
      manifest,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      liveReadback: buildVerifierLinkageReadback({ parsedProgramdata }),
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      ready: true,
      readyForProductionVerifier: true,
      blockerIds: [],
      nextActions: [],
      liveProgramdata: {
        immutable: true,
        upgradeAuthorityAddress: null,
        failClosedSentinelPresent: false,
        nativeVerifierCpiMarkerPresent: true,
      },
    });
    expect(report.statuses.every((status) => status.status === "present")).toBe(
      true,
    );
  });

  it("rejects a non-executable outer verifier account even when every ProgramData pin matches", () => {
    const fixture = finalizationReadyFixture();
    const liveReadback = buildVerifierLinkageReadback({
      parsedProgramdata: fixture.parsedProgramdata,
    });
    liveReadback.program.executable = false;

    const report = buildSolanaVerifierLinkageReadinessReportBody({
      manifest: fixture.manifest,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      liveReadback,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain("solana-verifier-program-executable");
    expect(
      report.statuses.find((status) => status.key === "programExecutable"),
    ).toMatchObject({ status: "invalid", value: false, expected: true });
  });

  it("adds Solana verifier linkage readiness as a production route blocker", () => {
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ includeSentinel: true }),
    );
    const manifest = {
      ...baseProductionManifest(),
      solana_programdata_address: SOLANA_PROGRAMDATA_ADDRESS,
      solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
      solana_programdata_slot: SOLANA_PROGRAMDATA_SLOT,
      solanaProgramdataSlot: SOLANA_PROGRAMDATA_SLOT,
      verifier_code_hash: parsedProgramdata.executableBlake2b256,
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
    };
    const verifierLinkageReadiness =
      buildSolanaVerifierLinkageReadinessReportBody({
        manifest,
        nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
        liveReadback: buildVerifierLinkageReadback({ parsedProgramdata }),
        checkedAt: "2026-07-08T00:00:00.000Z",
      });

    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      verifierLinkageReadiness,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.blockers).toContainEqual(
      expect.objectContaining({
        id: "verifier-linkage-readiness",
        missingOrInvalid: [
          "programImmutable",
          "failClosedSentinelAbsent",
          "nativeVerifierCpiMarkerPresent",
        ],
      }),
    );
    expect(report.missingProductionInputIds).toContain(
      "governed-solana-destination-proof-admission",
    );
    expect(report.nextActions).toContain(
      "link-solana-native-recursive-verifier",
    );
    expect(
      report.solanaDeployment.observedVerifierLinkageReadiness,
    ).toMatchObject({
      ready: false,
      executableBlake2b256: parsedProgramdata.executableBlake2b256,
      immutable: false,
      failClosedSentinelPresent: true,
      nativeVerifierCpiMarkerPresent: false,
    });
  });

  it("blocks immutable Solana finalization for the current fail-closed sentinel artifact", () => {
    const programBytes = buildSbfProgramBytes({ includeSentinel: true });
    const manifest = {
      ...baseProductionManifest(),
      productionReady: false,
      production_ready: false,
      verifierCodeHash: blake2bHex32(programBytes),
      verifier_code_hash: blake2bHex32(programBytes),
      destinationProofAdmission: {
        ...(baseProductionManifest().destinationProofAdmission ?? {}),
        admissionMode: "fail-closed-shape-gate-v1",
        admission_mode: "fail-closed-shape-gate-v1",
        proofSystem: "none",
        proof_system: "none",
        proofVerificationMode: "native-recursive-verifier-unlinked-v1",
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      },
      destination_proof_admission: {
        admission_mode: "fail-closed-shape-gate-v1",
        proof_system: "none",
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      },
      verifierEnforcement: {
        proofVerificationMode: "native-recursive-verifier-unlinked-v1",
      },
      verifier_enforcement: {
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      },
    };
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({
        upgradeAuthority: null,
        programBytes,
      }),
    );

    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: {},
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      manifest,
      liveReadback: buildVerifierLinkageReadback({ parsedProgramdata }),
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.programArtifact).toMatchObject({
      executableElf: true,
      executableBlake2b256: blake2bHex32(programBytes),
      failClosedSentinelPresent: true,
      nativeVerifierCpiMarkerPresent: false,
    });
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "program-finalization-fail-closed-sentinel",
        "program-finalization-verifier-cpi",
        "program-finalization-admission-mode",
        "program-finalization-proof-system",
        "program-finalization-enforcement-mode",
        "program-finalization-confirmation",
      ]),
    );
    expect(report.blockerIds).not.toContain("program-finalization-code-hash");
  });

  it("blocks Solana finalization for sentinel-free artifacts without the verifier CPI marker", () => {
    const programBytes = buildSbfProgramBytes({
      includeSentinel: false,
      includeCpiMarker: false,
    });
    const verifierCodeHash = blake2bHex32(programBytes);
    const manifest = {
      ...baseProductionManifest(),
      verifierCodeHash,
      verifier_code_hash: verifierCodeHash,
      destinationProofAdmission: {
        ...(baseProductionManifest().destinationProofAdmission ?? {}),
        verifierCodeHash,
        verifier_code_hash: verifierCodeHash,
      },
      destination_proof_admission: {
        ...baseProductionManifest().destination_proof_admission,
        verifier_code_hash: verifierCodeHash,
      },
    };

    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes,
      manifest,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.programArtifact).toMatchObject({
      failClosedSentinelPresent: false,
      nativeVerifierCpiMarkerPresent: false,
    });
    expect(report.blockerIds).toContain("program-finalization-verifier-cpi");
    expect(report.blockerIds).not.toContain(
      "program-finalization-fail-closed-sentinel",
    );
  });

  it("rejects Solana finalization when only live ProgramData matches but the local artifact is stale", () => {
    const staleProgramBytes = buildSbfProgramBytes({
      includeSentinel: false,
      includeCpiMarker: false,
    });
    const parsedProgramdata = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ includeSentinel: false }),
    );
    const manifest = {
      ...baseProductionManifest(),
      verifierCodeHash: parsedProgramdata.executableBlake2b256,
      verifier_code_hash: parsedProgramdata.executableBlake2b256,
      destinationProofAdmission: {
        ...(baseProductionManifest().destinationProofAdmission ?? {}),
        verifierCodeHash: parsedProgramdata.executableBlake2b256,
        verifier_code_hash: parsedProgramdata.executableBlake2b256,
      },
      destination_proof_admission: {
        ...baseProductionManifest().destination_proof_admission,
        verifier_code_hash: parsedProgramdata.executableBlake2b256,
      },
    };

    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: staleProgramBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      manifest,
      liveReadback: buildVerifierLinkageReadback({ parsedProgramdata }),
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(report.programArtifact?.executableBlake2b256).not.toBe(
      parsedProgramdata.executableBlake2b256,
    );
    expect(report.liveProgramArtifact).toMatchObject({
      programdataSlot: SOLANA_PROGRAMDATA_SLOT,
      executableBlake2b256: parsedProgramdata.executableBlake2b256,
      failClosedSentinelPresent: false,
      nativeVerifierCpiMarkerPresent: true,
    });
    expect(
      report.statuses.find((status) => status.key === "verifierCodeHash"),
    ).toMatchObject({
      status: "invalid",
      value: blake2bHex32(staleProgramBytes),
      expected: parsedProgramdata.executableBlake2b256,
    });
    expect(report.blockerIds).toContain("program-finalization-code-hash");
    expect(report.ready).toBe(false);
  });

  it("accepts Solana finalization when live ProgramData is the local artifact plus zero padding", () => {
    const programBytes = buildSbfProgramBytes({ includeSentinel: false });
    const liveExecutableBytes = Buffer.concat([programBytes, Buffer.alloc(32)]);
    const fixture = finalizationReadyFixture({
      programBytes,
      liveProgramBytes: liveExecutableBytes,
    });
    const verifierCodeHash = fixture.verifierCodeHash;

    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(
      report.ready,
      JSON.stringify(report.nativeVerifierLinkage.allBlockerIds),
    ).toBe(true);
    expect(report.finalizationVerifierCodeHash).toBe(verifierCodeHash);
    expect(report.finalizationVerifierCodeHashSource).toBe(
      "live-programdata-zero-padded-local-artifact",
    );
    expect(report.programArtifact).toMatchObject({
      executableBlake2b256: blake2bHex32(programBytes),
      deploymentNormalizedExecutable: {
        normalized: true,
        executableBlake2b256: verifierCodeHash,
        zeroPaddingBytes: 32,
        prefixMatches: true,
        zeroPaddingOnly: true,
      },
      liveProgramdataComparison: {
        normalized: true,
        reason: "live-programdata-zero-padded-local-artifact",
        artifactExecutableLength: programBytes.length,
        liveExecutableLength: liveExecutableBytes.length,
        zeroPaddingBytes: 32,
      },
    });
    expect(
      report.statuses.find((status) => status.key === "verifierCodeHash"),
    ).toMatchObject({
      status: "present",
      value: verifierCodeHash,
      expected: verifierCodeHash,
      source: "live-programdata-zero-padded-local-artifact",
    });
    expect(report.blockerIds).not.toContain("program-finalization-code-hash");
  });

  it("allows Solana finalization only for a sentinel-free production-hash-bound verifier artifact", () => {
    const fixture = finalizationReadyFixture();
    const programBytes = fixture.programBytes;
    const verifierCodeHash = fixture.verifierCodeHash;

    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });

    expect(
      report,
      JSON.stringify(report.nativeVerifierLinkage.allBlockerIds),
    ).toMatchObject({
      ready: true,
      readyToFinalizeWithCurrentInputs: true,
      blockerIds: [],
      nextActions: ["finalize-solana-programs"],
      programArtifact: {
        executableElf: true,
        executableBlake2b256: verifierCodeHash,
        failClosedSentinelPresent: false,
        nativeVerifierCpiMarkerPresent: true,
      },
      confirmation: {
        confirmFinalizeLinkedVerifier: true,
      },
    });
    expect(report.statuses.every((status) => status.status === "present")).toBe(
      true,
    );
  });

  it("allows outer finalization before the one-shot state configuration while requiring the native verifier to be immutable", () => {
    const fixture = finalizationReadyFixture({
      manifestOverrides: { productionReady: false, production_ready: false },
    });
    for (const key of [
      "destinationProofAdmission",
      "destination_proof_admission",
    ]) {
      fixture.manifest[key] = {
        ...fixture.manifest[key],
        admission_mode: "fail-closed-shape-gate-v1",
        proof_system: "none",
        proof_verification_mode: "native-recursive-verifier-unlinked-v1",
      };
      delete fixture.manifest[key].admissionMode;
      delete fixture.manifest[key].proofSystem;
      delete fixture.manifest[key].proofVerificationMode;
    }
    for (const key of [
      "verifierEnforcement",
      "verifier_enforcement",
      "destinationRollout",
      "destination_rollout",
      "productionReadiness",
      "production_readiness",
    ]) {
      if (fixture.manifest[key]) {
        fixture.manifest[key] = {
          ...fixture.manifest[key],
          proof_verification_mode: "native-recursive-verifier-unlinked-v1",
          verifier_enforcement_mode: "native-recursive-verifier-unlinked-v1",
        };
        delete fixture.manifest[key].proofVerificationMode;
        delete fixture.manifest[key].verifierEnforcementMode;
      }
    }
    const mutableOuter = parseSolanaProgramdataAccountDataForLinkage(
      buildProgramdataData({ programBytes: fixture.programBytes }),
    );
    const liveReadback = buildVerifierLinkageReadback({
      parsedProgramdata: mutableOuter,
      parsedState: {
        nativeVerifierProgramId: null,
        verifierMaterialHash: null,
        verifierConfigHash: null,
        verifierConfiguredSlot: null,
        storedMint: SOLANA_TOKEN_MINT_ADDRESS,
      },
    });
    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: fixture.programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(mutableOuter.immutable).toBe(false);
    expect(report).toMatchObject({
      ready: true,
      manifest: {
        productionReadyObserved: false,
        productionReadyRequiredBeforeFinalization: false,
        admissionMode: "fail-closed-shape-gate-v1",
        proofSystem: "none",
        proofVerificationMode: "native-recursive-verifier-unlinked-v1",
      },
      nativeVerifierLinkage: {
        ready: true,
        nativeOnlyReady: true,
        verifierStateConfigured: false,
      },
    });
    expect(report.nativeVerifierLinkage.postConfigurationBlockerIds).toEqual(
      expect.arrayContaining([
        "solana-verifier-programdata-mutable",
        "solana-native-verifier-state-program-id",
        "solana-native-verifier-state-material-hash",
        "solana-native-verifier-state-config-hash",
      ]),
    );
    expect(report.blockerIds).not.toContain(
      "program-finalization-native-verifier-linkage",
    );
  });

  it("rejects self-asserted preconfiguration intent without strict governed package validation", () => {
    const fixture = finalizationReadyFixture({
      manifestOverrides: {
        productionReady: false,
        production_ready: false,
        governedPreconfigurationIntent: {
          reviewed: true,
          packageSha256: materialHex32("self-asserted-package"),
        },
        verifierProgramArtifactSha256: undefined,
        verifier_program_artifact_sha256: undefined,
        solanaVerifierStateAddress: undefined,
        solana_verifier_state_address: undefined,
        solanaTokenMint: undefined,
        solana_token_mint: undefined,
      },
    });
    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: fixture.programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.governedPreconfigurationIntent).toMatchObject({
      reviewed: false,
      packageSha256: null,
      selfAssertedManifestIntentAccepted: false,
    });
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "program-finalization-governed-preconfiguration-intent",
        "program-finalization-governed-native-verifier-pins",
        "program-finalization-outer-artifact-sha256",
        "program-finalization-verifier-state-pin",
        "program-finalization-token-mint-pin",
      ]),
    );
  });

  it("revalidates native verifier package and approval bytes before finalization readiness", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const start = source.indexOf("const programFinalizationReadiness = async");
    const end = source.indexOf("const deploy = async", start);
    const body = source.slice(start, end);

    expect(body).toContain("loadSolanaProductionGovernanceApprovalValidation");
    expect(body).toContain(
      "buildSolanaGovernedNativeVerifierPackageValidation",
    );
    expect(body).toContain("readStablePublicSolanaJsonArtifact");
    expect(body).toContain("expectedSha256");
    expect(body).not.toContain(
      "governedNativeVerifierValidation:\n      nativeVerifierConfiguration?.governedPackageValidation",
    );
  });

  it("uses explicit public deployment inputs for fresh-directory finalization readiness", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const start = source.indexOf("const programFinalizationReadiness = async");
    const end = source.indexOf("const deploy = async", start);
    const body = source.slice(start, end);

    expect(body).toContain('args["public-config"] || paths.publicConfig');
    expect(body).toContain("args.accounts || paths.accountsReport");
    expect(body).toContain("readOptionalSolanaPublicConfig(publicConfigPath)");
    expect(body).toContain("readOptionalJson(accountsPath)");
    expect(body).not.toContain(
      "readOptionalSolanaPublicConfig(\n        paths.publicConfig",
    );
    expect(body).not.toContain("readOptionalJson(paths.accountsReport)");
  });

  it("uses explicit public deployment inputs for fresh-directory source-burn readiness", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const ownerStart = source.indexOf("const readSourceBurnOwner = async");
    const inputsStart = source.indexOf(
      "const loadSourceBurnReadinessInputs = async",
      ownerStart,
    );
    const reportStart = source.indexOf(
      "const buildSourceBurnReadiness = async",
      inputsStart,
    );
    const ownerBody = source.slice(ownerStart, inputsStart);
    const inputsBody = source.slice(inputsStart, reportStart);
    const commandStart = source.indexOf(
      "const sourceBurnReadiness = async",
      reportStart,
    );
    const commandEnd = source.indexOf(
      "const writeBlockedSourceBurnSubmissionFromReadiness = async",
      commandStart,
    );
    const commandBody = source.slice(commandStart, commandEnd);

    expect(ownerBody).toContain('args["public-config"] || paths.publicConfig');
    expect(inputsBody).toContain('args["public-config"] || paths.publicConfig');
    expect(inputsBody).toContain("args.accounts || paths.accountsReport");
    expect(inputsBody).not.toContain(
      "readSolanaPublicConfig(paths.publicConfig)",
    );
    expect(inputsBody).not.toContain("readOptionalJson(paths.accountsReport)");
    expect(commandBody).toContain(
      'args["public-config"] || paths.publicConfig',
    );
    expect(commandBody).toContain("args.accounts || paths.accountsReport");
  });

  it("uses selected explicit public deployment inputs for deployment video rendering", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const start = source.indexOf("const renderDeploymentVideo = async");
    const end = source.indexOf("const routeManifest = async", start);
    const body = source.slice(start, end);

    expect(body).toContain("loadSelectedSolanaDeploymentMaterial");
    expect(body).toContain("selectedDeployment.publicConfig");
    expect(body).toContain("selectedDeployment.accounts");
    expect(body).toContain("selectedDeployment.verifierEvidence");
    expect(body).toContain("selectedDeployment.verifierLiveEvidence");
    expect(body).toContain("observedPins.routeCanaryEvidenceHash");
    expect(body).toContain('evidenceSource: "source-material-handoff"');
    expect(body).not.toContain("readSolanaPublicConfig(paths.publicConfig)");
  });

  it("does not let a CLI verifier hash override replace the selected manifest pin", () => {
    const fixture = finalizationReadyFixture();
    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: {
        "confirm-finalize-linked-verifier": "true",
        "expected-verifier-code-hash": materialHex32(
          "operator-override-attempt",
        ),
      },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: fixture.programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.finalizationVerifierCodeHash).toBe(fixture.verifierCodeHash);
    expect(report.blockerIds).toContain(
      "program-finalization-code-hash-override",
    );
    expect(
      report.statuses.find(
        (status) => status.key === "verifierCodeHashOverride",
      ),
    ).toMatchObject({
      status: "invalid",
      expected: fixture.verifierCodeHash,
    });
  });

  it("rejects conflicting production-ready aliases during Solana finalization", () => {
    const fixture = finalizationReadyFixture({
      manifestOverrides: { production_ready: false },
    });
    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: fixture.programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain(
      "program-finalization-manifest-aliases",
    );
    expect(
      report.statuses.find(
        (status) => status.key === "manifestAliasConsistency",
      )?.error,
    ).toContain("productionReady aliases disagree");
  });

  it("retains outer verifier linkage blockers during native-verifier finalization checks", () => {
    const fixture = finalizationReadyFixture({
      readbackOverrides: {
        programdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      },
    });
    const report = buildSolanaProgramFinalizationReadinessReportBody({
      args: { "confirm-finalize-linked-verifier": "true" },
      programSo:
        "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
      programBytes: fixture.programBytes,
      nativeVerifierBytes: SOLANA_NATIVE_PROGRAM_BYTES,
      governedNativeVerifierValidation:
        fixture.governedNativeVerifierValidation,
      manifest: fixture.manifest,
      liveReadback: fixture.liveReadback,
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.nativeVerifierLinkage.nativeOnlyReady).toBe(true);
    expect(report.nativeVerifierLinkage.allBlockerIds).toContain(
      "solana-verifier-programdata-pin",
    );
    expect(report.blockerIds).toContain(
      "program-finalization-native-verifier-linkage",
    );
  });

  it("keeps generated Solana deployment reports out of production material scans", () => {
    expect(
      isGeneratedSolanaInventoryReportPath(
        "/tmp/output/taira-solana-xor-route-allowlist-hash.json",
      ),
    ).toBe(true);
    expect(
      isGeneratedSolanaInventoryReportPath(
        "/tmp/output/source-verifier-material.json",
      ),
    ).toBe(false);
  });

  it("refuses symbolic links in governed material roots instead of following them", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-inventory-link-"),
    );
    const governedRoot = path.join(tempDir, "governed");
    const outsideRoot = path.join(tempDir, "outside");
    mkdirSync(governedRoot, { recursive: true });
    mkdirSync(outsideRoot, { recursive: true });
    const outsideMaterial = path.join(outsideRoot, "material.json");
    writeFileSync(outsideMaterial, JSON.stringify({ ready: true }));
    symlinkSync(outsideMaterial, path.join(governedRoot, "material.json"));
    try {
      const inventory = await collectInventoryFiles({
        roots: [governedRoot],
      });
      expect(inventory.files).toEqual([]);
      expect(inventory.skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: path.join(governedRoot, "material.json"),
            reason: "symbolic-link",
          }),
        ]),
      );

      const linkedRoot = path.join(tempDir, "linked-governed-root");
      symlinkSync(outsideRoot, linkedRoot);
      const linkedInventory = await collectInventoryFiles({
        roots: [linkedRoot],
      });
      expect(linkedInventory.files).toEqual([]);
      expect(linkedInventory.skipped).toEqual([
        expect.objectContaining({
          path: linkedRoot,
          reason: "symbolic-link-root",
        }),
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects governed material replaced after discovery", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-inventory-race-"),
    );
    const governedRoot = path.join(tempDir, "governed");
    const outsideRoot = path.join(tempDir, "outside");
    mkdirSync(governedRoot, { recursive: true });
    mkdirSync(outsideRoot, { recursive: true });
    const candidate = path.join(governedRoot, "material.json");
    const outsideMaterial = path.join(outsideRoot, "replacement.json");
    writeFileSync(candidate, JSON.stringify({ governed: true }));
    writeFileSync(outsideMaterial, JSON.stringify({ attacker: true }));
    try {
      const inventory = await collectInventoryFiles({
        roots: [governedRoot],
      });
      expect(inventory.files).toHaveLength(1);

      rmSync(candidate);
      symlinkSync(outsideMaterial, candidate);
      const parsed = await readInventoryRecords(inventory.files);
      expect(parsed.records).toEqual([]);
      expect(parsed.parseErrors).toHaveLength(1);
      expect(parsed.parseErrors[0]).toMatchObject({
        path: inventory.files[0].path,
      });
      expect(parsed.parseErrors[0].error).not.toContain("attacker");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports missing default sibling Solana governed artifact roots", () => {
    const artifactRoot = "/tmp/iroha-demo-missing-sccp-solana-artifacts";
    const outputRoot = "/tmp/iroha-demo-missing-sccp-solana-output";
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/output", artifactRoot, outputRoot],
      skipped: [
        { path: artifactRoot, reason: "missing" },
        { path: outputRoot, reason: "missing" },
      ],
      expectedMaterialRootGroups: [
        {
          id: "sibling-solana-governed-material",
          required: true,
          description:
            "Governed Solana material should be published under sibling roots.",
          paths: [artifactRoot, outputRoot],
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "envelope-recorder-v1",
        },
      },
      proverReadiness: {
        readyForProductionProofs: false,
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.materialRoots.expectedGroups).toEqual([
      expect.objectContaining({
        id: "sibling-solana-governed-material",
        ready: false,
        paths: [
          expect.objectContaining({
            path: artifactRoot,
            status: "missing",
            skippedReason: "missing",
          }),
          expect.objectContaining({
            path: outputRoot,
            status: "missing",
            skippedReason: "missing",
          }),
        ],
      }),
    ]);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining(["artifact-root-publication"]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-governed-solana-source-material",
          blockedBy: expect.arrayContaining([
            expect.objectContaining({ id: "artifact-root-publication" }),
          ]),
        }),
      ]),
    );
  });

  it("discovers adjacent Iroha Solana governed material roots", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "sccp-solana-roots-"));
    try {
      const appRepo = path.join(tempDir, "iroha-demo-javascript");
      mkdirSync(path.join(appRepo, "artifacts/sccp-solana"), {
        recursive: true,
      });
      mkdirSync(path.join(tempDir, "iroha", "artifacts/sccp-solana"), {
        recursive: true,
      });
      mkdirSync(path.join(tempDir, "iroha-attacker", "artifacts/sccp-solana"), {
        recursive: true,
      });
      mkdirSync(
        path.join(
          tempDir,
          "iroha-build-taira-latest-remote",
          "output/sccp-solana",
        ),
        { recursive: true },
      );

      const roots = defaultSolanaGovernedMaterialRoots({
        baseDir: tempDir,
        repoRootOverride: appRepo,
      });

      expect(roots).toContain(
        path.join(tempDir, "iroha", "artifacts/sccp-solana"),
      );
      expect(roots).not.toContain(
        path.join(
          tempDir,
          "iroha-build-taira-latest-remote",
          "output/sccp-solana",
        ),
      );
      expect(roots).not.toContain(path.join(appRepo, "artifacts/sccp-solana"));
      expect(roots).not.toContain(
        path.join(tempDir, "iroha-attacker", "artifacts/sccp-solana"),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not promote an explicit scan root into a governed root", () => {
    const sourceRecord = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceTrustAnchorHash: materialHex32("scan-source-trust-anchor"),
      consensusVerifierHash: materialHex32("scan-consensus-verifier"),
      messageInclusionVerifierHash: materialHex32(
        "scan-message-inclusion-verifier",
      ),
      finalityPolicyHash: materialHex32("scan-finality-policy"),
      sourceStateVerifierHash: materialHex32("scan-source-state-verifier"),
    };
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/untrusted-scan"],
      records: [
        {
          kind: "json",
          path: "/tmp/untrusted-scan/material.json",
          pointer: "/sourceVerifierMaterial",
          schema: sourceRecord.schema,
          record: sourceRecord,
        },
      ],
      manifest: baseProductionManifest(),
      proverReadiness: readySolanaProverReadiness(),
      governanceApprovalValidation: readyInventoryGovernanceApproval({
        sourceVerifierMaterialHash: jsonSha256(sourceRecord),
      }),
    });

    expect(report.governedRoots).toEqual([]);
    expect(report.readyMaterial.sourceVerifierMaterial).toBeNull();
    expect(
      report.candidates.sourceVerifierMaterial[0].statuses.find(
        (status) => status.key === "governedArtifactRoot",
      ),
    ).toMatchObject({ status: "invalid" });
  });

  it("fails closed on conflicting ready material hashes instead of selecting the first file", () => {
    const sourceRecord = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceTrustAnchorHash: materialHex32("conflict-source-trust-anchor"),
      consensusVerifierHash: materialHex32("conflict-consensus-verifier"),
      messageInclusionVerifierHash: materialHex32(
        "conflict-message-inclusion-verifier",
      ),
      finalityPolicyHash: materialHex32("conflict-finality-policy"),
      sourceStateVerifierHash: materialHex32("conflict-source-state-verifier"),
    };
    const conflictingRecord = {
      ...sourceRecord,
      sourceStateVerifierHash: materialHex32(
        "conflicting-source-state-verifier",
      ),
    };
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp/governed"],
      governedRoots: ["/tmp/governed"],
      records: [sourceRecord, conflictingRecord].map((record, index) => ({
        kind: "json",
        path: `/tmp/governed/material-${index}.json`,
        pointer: "/sourceVerifierMaterial",
        schema: record.schema,
        record,
      })),
      manifest: baseProductionManifest(),
      proverReadiness: readySolanaProverReadiness(),
      governanceApprovalValidation: readyInventoryGovernanceApproval({
        sourceVerifierMaterialHash: jsonSha256(sourceRecord),
      }),
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toContain("conflicting-sourceVerifierMaterial");
    expect(
      report.blockers.find(
        (blocker) => blocker.id === "conflicting-sourceVerifierMaterial",
      )?.hashes,
    ).toEqual(
      expect.arrayContaining([
        jsonSha256(sourceRecord),
        jsonSha256(conflictingRecord),
      ]),
    );
  });

  it("keeps placeholder Solana production material inventory blocked", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "json",
          path: "/tmp/manifest.json",
          pointer: "/sourceVerifierMaterial",
          schema: "iroha-sccp-solana-source-verifier-material-public/v1",
          record: {
            schema: "iroha-sccp-solana-source-verifier-material-public/v1",
            ...solanaTestnetSourceRecordIdentity(),
            routeId: "taira_sol_xor",
            sourceDomain: 3,
            targetDomain: 0,
            placeholderMaterial: true,
            disabledReason: "not published",
          },
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "envelope-recorder-v1",
        },
      },
      proverReadiness: {
        readyForProductionProofs: false,
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "offline-full-toml",
        "browser-prover-readiness",
      ]),
    );
    expect(report.nextActions).toEqual([
      "obtain-pinned-solana-governance-approval",
      "publish-governed-solana-source-material",
      "render-reviewed-solana-post-deploy-full-toml",
      "publish-solana-production-prover-packages",
    ]);
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-governed-solana-source-material",
          blockedBy: expect.arrayContaining([
            expect.objectContaining({ id: "source-verifier-material" }),
            expect.objectContaining({
              id: "source-adapter-engine-deployment",
            }),
          ]),
          command: report.commands.renderSourceMaterialToml,
          validationCommands: [report.commands.refreshInventory],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "sourceTrustAnchorHash" }),
            expect.objectContaining({
              id: "adapterVerifierVkHash",
              value: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
            }),
          ]),
        }),
        expect.objectContaining({
          id: "render-reviewed-solana-post-deploy-full-toml",
          command: report.commands.renderPostDeployFullToml,
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "source-verifier-material-hash" }),
            expect.objectContaining({
              id: "source-adapter-engine-deployment-hash",
            }),
            expect.objectContaining({ id: "route-allowlist-hash" }),
          ]),
        }),
      ]),
    );
    expect(report.candidates.sourceVerifierMaterial[0].ready).toBe(false);
  });

  it("rejects explicit mainnet-beta Solana source material for the testnet route", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "json",
          path: "/tmp/mainnet-material.json",
          pointer: "/sourceVerifierMaterial",
          schema: "iroha-sccp-solana-source-verifier-material-public/v1",
          record: {
            schema: "iroha-sccp-solana-source-verifier-material-public/v1",
            ...solanaTestnetSourceRecordIdentity(),
            routeId: "taira_sol_xor",
            sourceDomain: 3,
            targetDomain: 0,
            solanaNetwork: "solana-mainnet-beta",
            sourceStateVerifierId:
              "sccp:sol:accounts-db-verifier:accounts-lt-hash-mainnet-beta:v1",
            sourceTrustAnchorHash: materialHex32("source-trust-anchor"),
            consensusVerifierHash: materialHex32("consensus"),
            messageInclusionVerifierHash: materialHex32("message"),
            finalityPolicyHash: materialHex32("finality"),
            sourceStateVerifierHash: materialHex32("state"),
            placeholderMaterial: false,
          },
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "governed-zk-verifier-v1",
          proofSystem: "stark-fri-v1",
          shapeOnly: false,
          acceptsUnverifiedProofs: false,
        },
      },
      proverReadiness: {
        readyForProductionProofs: false,
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    const sourceMaterial = report.candidates.sourceVerifierMaterial[0];
    expect(sourceMaterial.ready).toBe(false);
    expect(sourceMaterial.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "solanaNetwork",
          status: "invalid",
        }),
        expect.objectContaining({
          key: "sourceStateVerifierId",
          status: "invalid",
        }),
      ]),
    );
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "source-verifier-material",
    );
  });

  it("requires every governed Solana source record identity field explicitly", () => {
    const baseRecord = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      sourceTrustAnchorHash: materialHex32("identity-source-trust-anchor"),
      consensusVerifierHash: materialHex32("identity-consensus"),
      messageInclusionVerifierHash: materialHex32("identity-message"),
      finalityPolicyHash: materialHex32("identity-finality"),
      sourceStateVerifierHash: materialHex32("identity-state"),
      placeholderMaterial: false,
    };
    const adapterRecord = {
      ...baseRecord,
      schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
      adapterVerifierVkHash: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
      deploymentReceiptHash: materialHex32("identity-deployment-receipt"),
      ...fullLightClientMaterialFields("identity-adapter"),
    };
    const candidateFor = (record) => {
      const role = record.schema.includes("adapter-engine-deployment")
        ? "sourceAdapterEngineDeployment"
        : "sourceVerifierMaterial";
      return buildSolanaProductionMaterialInventoryReportBody({
        governedRoots: ["/tmp/governed"],
        records: [
          {
            kind: "json",
            path: "/tmp/governed/source-material.json",
            pointer: `/${role}`,
            schema: record.schema,
            record,
          },
        ],
      }).candidates[role][0];
    };
    const fields = [
      "routeId",
      "solanaNetwork",
      "solanaGenesisHash",
      "sourceProofBackend",
      "sourceDomain",
      "targetDomain",
      "sourceTrustAnchorId",
      "consensusVerifierId",
      "messageInclusionVerifierId",
      "sourceStateVerifierId",
      "finalityPolicyId",
    ];

    for (const governedRecord of [baseRecord, adapterRecord]) {
      const baseline = candidateFor(governedRecord);
      expect(baseline.structurallyReady, governedRecord.schema).toBe(true);
      expect(
        baseline.statuses
          .filter((status) => fields.includes(status.key))
          .every((status) => status.status === "present"),
        governedRecord.schema,
      ).toBe(true);

      for (const field of fields) {
        const record = { ...governedRecord };
        delete record[field];
        const candidate = candidateFor(record);
        expect(
          candidate.structurallyReady,
          `${governedRecord.schema}:${field}`,
        ).toBe(false);
        expect(
          candidate.statuses.find((status) => status.key === field),
          `${governedRecord.schema}:${field}`,
        ).toMatchObject({ status: "missing" });
      }
    }
  });

  it("rejects conflicting identity aliases and cross-profile replay", () => {
    const baseRecord = {
      schema: "iroha-sccp-solana-source-verifier-material-public/v1",
      ...solanaTestnetSourceRecordIdentity(),
      sourceTrustAnchorHash: materialHex32("alias-source-trust-anchor"),
      consensusVerifierHash: materialHex32("alias-consensus"),
      messageInclusionVerifierHash: materialHex32("alias-message"),
      finalityPolicyHash: materialHex32("alias-finality"),
      sourceStateVerifierHash: materialHex32("alias-state"),
      placeholderMaterial: false,
    };
    const adapterRecord = {
      ...baseRecord,
      schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
      adapterVerifierVkHash: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
      deploymentReceiptHash: materialHex32("alias-deployment-receipt"),
      ...fullLightClientMaterialFields("alias-adapter"),
    };
    const candidateFor = (record) => {
      const role = record.schema.includes("adapter-engine-deployment")
        ? "sourceAdapterEngineDeployment"
        : "sourceVerifierMaterial";
      return buildSolanaProductionMaterialInventoryReportBody({
        governedRoots: ["/tmp/governed"],
        records: [
          {
            kind: "json",
            path: "/tmp/governed/source-material.json",
            pointer: `/${role}`,
            schema: record.schema,
            record,
          },
        ],
      }).candidates[role][0];
    };
    const conflicts = [
      ["routeId", "route_id", "another_route"],
      ["solanaNetwork", "solana_network", "solana-mainnet-beta"],
      [
        "solanaGenesisHash",
        "solana_genesis_hash",
        "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      ],
      [
        "sourceProofBackend",
        "proof_backend",
        "sccp-solana-recursive-mainnet-v1",
      ],
      ["sourceDomain", "source_domain", 0],
      ["targetDomain", "target_domain", 3],
      [
        "sourceTrustAnchorId",
        "source_trust_anchor_id",
        "sccp:sol:source-trust-anchor:solana-mainnet-beta-genesis:v1",
      ],
      [
        "consensusVerifierId",
        "consensus_verifier_id",
        "sccp:sol:consensus-verifier:finalized-slot-bankhash-mainnet-beta:v1",
      ],
      [
        "messageInclusionVerifierId",
        "message_inclusion_verifier_id",
        "sccp:sol:message-inclusion-verifier:transaction-status-root-branch:v1",
      ],
      [
        "sourceStateVerifierId",
        "source_state_verifier_id",
        "sccp:sol:accounts-db-verifier:accounts-lt-hash-mainnet-beta:v1",
      ],
      [
        "finalityPolicyId",
        "finality_policy_id",
        "sccp:sol:finality-policy:finalized-slot-mainnet-beta:v1",
      ],
    ];

    for (const governedRecord of [baseRecord, adapterRecord]) {
      for (const [field, alias, wrong] of conflicts) {
        const candidate = candidateFor({ ...governedRecord, [alias]: wrong });
        expect(
          candidate.structurallyReady,
          `${governedRecord.schema}:${field}`,
        ).toBe(false);
        expect(
          candidate.statuses.find((status) => status.key === field),
          `${governedRecord.schema}:${field}`,
        ).toMatchObject({
          status: "invalid",
          error: expect.stringContaining("aliases must agree"),
        });
      }

      const agreeingAliases = {
        ...governedRecord,
        route_id: governedRecord.routeId,
        solana_network: governedRecord.solanaNetwork,
        solana_genesis_hash: governedRecord.solanaGenesisHash,
        proof_backend: governedRecord.sourceProofBackend,
        source_domain: "3",
        target_domain: "0",
        source_trust_anchor_id: governedRecord.sourceTrustAnchorId,
        consensus_verifier_id: governedRecord.consensusVerifierId,
        message_inclusion_verifier_id:
          governedRecord.messageInclusionVerifierId,
        source_state_verifier_id: governedRecord.sourceStateVerifierId,
        finality_policy_id: governedRecord.finalityPolicyId,
      };
      expect(candidateFor(agreeingAliases).structurallyReady).toBe(true);
    }
  });

  it("keeps blocked Solana prover module evidence visible in production material inventory", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      proverReadiness: {
        readyForProductionProofs: false,
        nextActionDetails: [
          {
            id: "publish-destination-solana-production-prover-package",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "prover-readiness",
            ],
            requiredInputs: [
              { id: "solana-destination-production-prover-package" },
            ],
          },
        ],
        entries: [
          {
            direction: "destination",
            moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
            sidecarUrl:
              "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
            actualModuleHash: materialHex32("destination-module"),
            expectedModuleHash: materialHex32("destination-module"),
            sidecarHash: materialHex32("destination-sidecar"),
            exportsOk: true,
            ready: false,
            sidecarReady: false,
            sidecar: {
              errors: ["productionProofsReady must be true."],
            },
            moduleHashMatchesManifest: true,
            reason: "governed destination proof package is not published",
            selfTest: {
              ready: false,
              requiredArtifacts: [
                {
                  id: "governed-solana-source-proof-material",
                  required: true,
                  status: "missing",
                },
                {
                  id: "solana-native-recursive-verifier-linkage",
                  required: true,
                  status: "missing",
                },
              ],
              missingArtifactIds: [
                "governed-solana-source-proof-material",
                "solana-native-recursive-verifier-linkage",
              ],
            },
          },
          {
            direction: "source",
            moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
            sidecarUrl:
              "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
            actualModuleHash: materialHex32("source-module"),
            expectedModuleHash: materialHex32("source-module"),
            sidecarHash: materialHex32("source-sidecar"),
            exportsOk: true,
            ready: false,
            sidecarReady: false,
            sidecar: {
              errors: ["productionProofsReady must be true."],
            },
            moduleHashMatchesManifest: true,
            reason: "governed source proof package is not published",
            selfTest: {
              ready: false,
              requiredArtifacts: [
                {
                  id: "solana-source-adapter-engine-deployment",
                  required: true,
                  status: "missing",
                },
                {
                  id: "taira-finalize-inbound-binding-material",
                  required: true,
                  status: "missing",
                },
              ],
              missingArtifactIds: [
                "solana-source-adapter-engine-deployment",
                "taira-finalize-inbound-binding-material",
              ],
            },
          },
        ],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyMaterial.browserProvers).toBe(false);
    expect(report.readyMaterial.browserProverModules).toEqual([
      expect.objectContaining({
        direction: "destination",
        moduleHash: materialHex32("destination-module"),
        sidecarHash: materialHex32("destination-sidecar"),
        exportsReady: true,
        selfTestReady: false,
        sidecarReady: false,
        productionProofsReady: false,
        reason: "governed destination proof package is not published",
        sidecarErrors: ["productionProofsReady must be true."],
        requiredArtifacts: [
          expect.objectContaining({
            id: "governed-solana-source-proof-material",
          }),
          expect.objectContaining({
            id: "solana-native-recursive-verifier-linkage",
          }),
        ],
        missingArtifactIds: [
          "governed-solana-source-proof-material",
          "solana-native-recursive-verifier-linkage",
        ],
        blockers: [
          "destination-prover-readiness",
          "destination-prover-sidecar",
          "governed-solana-source-proof-material",
          "solana-native-recursive-verifier-linkage",
        ],
      }),
      expect.objectContaining({
        direction: "source",
        moduleHash: materialHex32("source-module"),
        sidecarHash: materialHex32("source-sidecar"),
        exportsReady: true,
        selfTestReady: false,
        sidecarReady: false,
        productionProofsReady: false,
        reason: "governed source proof package is not published",
        sidecarErrors: ["productionProofsReady must be true."],
        requiredArtifacts: [
          expect.objectContaining({
            id: "solana-source-adapter-engine-deployment",
          }),
          expect.objectContaining({
            id: "taira-finalize-inbound-binding-material",
          }),
        ],
        missingArtifactIds: [
          "solana-source-adapter-engine-deployment",
          "taira-finalize-inbound-binding-material",
        ],
        blockers: [
          "source-prover-readiness",
          "source-prover-sidecar",
          "solana-source-adapter-engine-deployment",
          "taira-finalize-inbound-binding-material",
        ],
      }),
    ]);
    expect(report.missingProductionArtifactIds).toEqual(
      expect.arrayContaining([
        "governed-solana-source-verifier-material",
        "governed-solana-source-adapter-engine-deployment",
        "reviewed-final-solana-offline-toml",
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
        "governed-solana-source-proof-material",
        "solana-native-recursive-verifier-linkage",
        "solana-source-adapter-engine-deployment",
        "taira-finalize-inbound-binding-material",
      ]),
    );
    expect(report.missingProductionArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "solana-destination-production-prover-package",
          directions: ["destination"],
          sources: ["destination-browser-prover"],
          upstreamArtifactIds: [
            "browser-destination-prover-package",
            "destination-proof-admission-material",
            "governed-solana-source-proof-material",
            "solana-native-recursive-verifier-linkage",
          ],
        }),
        expect.objectContaining({
          id: "solana-source-production-prover-package",
          directions: ["source"],
          sources: ["source-browser-prover"],
          upstreamArtifactIds: [
            "browser-source-prover-package",
            "governed-solana-source-proof-material",
            "solana-source-adapter-engine-deployment",
            "taira-finalize-inbound-binding-material",
          ],
        }),
        expect.objectContaining({
          id: "solana-native-recursive-verifier-linkage",
          directions: ["destination"],
          sources: ["destination-browser-prover-self-test"],
          statuses: ["missing"],
          upstreamArtifactIds: [
            "governed-solana-source-proof-material",
            "solana-verifier-immutable-programdata",
          ],
        }),
        expect.objectContaining({
          id: "solana-source-adapter-engine-deployment",
          directions: ["source"],
          sources: ["source-browser-prover-self-test"],
          statuses: ["missing"],
          upstreamArtifactIds: [
            "governed-solana-source-adapter-engine-deployment",
          ],
        }),
      ]),
    );
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "browser-prover-readiness",
    );
    expect(report.blockerIds).toContain("browser-prover-readiness");
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-solana-production-prover-packages",
          command: report.commands.proverReadiness,
          validationCommands: [
            report.commands.proverReadiness,
            report.commands.refreshInventory,
          ],
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "publish-destination-solana-production-prover-package",
            }),
          ]),
        }),
      ]),
    );
  });

  it("rejects repeated-byte Solana governed material hashes as placeholders", () => {
    const toml = `
[[zk.sccp_source_verifier_materials]]
version = 1
source_domain = 3
source_chain = "sol"
source_trust_anchor_hash = "${hex32("a1")}"
consensus_verifier_hash = "${materialHex32("consensus-verifier")}"
message_inclusion_verifier_hash = "${materialHex32("message-inclusion-verifier")}"
source_state_verifier_hash = "${materialHex32("source-state-verifier")}"
finality_policy_hash = "${materialHex32("finality-policy")}"
placeholder_material = false

[[zk.sccp_source_adapter_engine_deployments]]
version = 1
source_domain = 3
target_domain = 0
source_chain = "sol"
adapter_proof_family = "stark-fri-v1"
adapter_circuit_id = "sccp-source-adapter-v1"
adapter_verifier_vk_hash = "${hex32("f6")}"
source_trust_anchor_hash = "${materialHex32("source-trust-anchor")}"
consensus_verifier_hash = "${materialHex32("consensus-verifier")}"
message_inclusion_verifier_hash = "${materialHex32("message-inclusion-verifier")}"
source_state_verifier_hash = "${materialHex32("source-state-verifier")}"
finality_policy_hash = "${materialHex32("finality-policy")}"
deployment_receipt_hash = "${materialHex32("deployment-receipt")}"
`;
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "toml",
          path: "/tmp/solana-source-state-evidence.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
      ],
      manifest: baseProductionManifest(),
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "source-verifier-material",
        "source-adapter-engine-deployment",
      ]),
    );
    expect(
      report.candidates.sourceVerifierMaterial[0].statuses.find(
        (status) => status.key === "sourceTrustAnchorHash",
      )?.error,
    ).toContain("repeated-byte placeholder hash");
    expect(
      report.candidates.sourceAdapterEngineDeployment[0].statuses.find(
        (status) => status.key === "adapterVerifierVkHash",
      )?.error,
    ).toContain("repeated-byte placeholder hash");
  });

  it("accepts governed Solana source material rendered by the sibling TOML helper", () => {
    const { summary, toml } = renderSiblingSolanaSourceEvidenceFixture();
    const offline = reviewedOfflineTomlFixture({ root: "/tmp" });
    expect(summary).toMatchObject({
      expected_source_verifier_material_hash_matches: true,
      expected_source_adapter_engine_deployment_hash_matches: true,
      expected_full_light_client_gate_hash_matches: true,
      source_verifier_material_ready: true,
      source_adapter_engine_deployment_ready: true,
      full_light_client_evidence_ready: true,
      source_adapter_gate_ready_with_full_light_client_evidence: true,
      full_toml_ready: true,
      toml_ready: true,
      source_adapter_gate_blockers: [],
      missing_full_light_client_verifier_ids: [],
    });
    expect(toml).toContain("solana_tower_replay_verifier_hash");
    expect(toml).toContain("solana_full_accountsdb_lattice_verifier_hash");
    expect(toml).toContain("solana_bank_fork_choice_verifier_hash");
    const manifest = baseProductionManifest();
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "json",
          path: "/tmp/solana-source-state-evidence.summary.json",
          pointer: "/",
          schema: "",
          record: summary,
        },
        {
          kind: "toml",
          path: "/tmp/solana-source-state-evidence.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
        ...offline.records,
      ],
      roots: ["/tmp"],
      governedRoots: ["/tmp"],
      manifest,
      proverReadiness: readySolanaProverReadiness(),
      governanceApprovalValidation: readyInventoryGovernanceApproval({
        sourceVerifierMaterialHash: summary.source_verifier_material_hash,
        sourceAdapterEngineDeploymentHash:
          summary.source_adapter_engine_deployment_hash,
        offlineFullTomlSha256: offline.offlineFullTomlSha256,
        manifest,
      }),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.readyMaterial.sourceVerifierMaterial).toMatchObject({
      path: "/tmp/solana-source-state-evidence.toml",
      pointer: "/zk.sccp_source_verifier_materials/0",
      recordHash: summary.source_verifier_material_hash,
    });
    expect(report.readyMaterial.sourceAdapterEngineDeployment).toMatchObject({
      path: "/tmp/solana-source-state-evidence.toml",
      pointer: "/zk.sccp_source_adapter_engine_deployments/0",
      recordHash: summary.source_adapter_engine_deployment_hash,
    });
    expect(report.readyMaterial.offlineFullToml).toMatchObject({
      path: offline.tomlPath,
      offlineFullTomlSha256: offline.offlineFullTomlSha256,
    });
    const adapterCandidate =
      report.candidates.sourceAdapterEngineDeployment.find(
        (candidate) =>
          candidate.path === "/tmp/solana-source-state-evidence.toml",
      );
    expect(adapterCandidate).toMatchObject({
      ready: true,
      recordHash: summary.source_adapter_engine_deployment_hash,
      record: {
        solana_tower_replay_verifier_hash:
          summary.full_light_client_verifier_hashes.tower_replay_verifier_hash,
        solana_full_accountsdb_lattice_verifier_hash:
          summary.full_light_client_verifier_hashes
            .full_accountsdb_lattice_verifier_hash,
        solana_bank_fork_choice_verifier_hash:
          summary.full_light_client_verifier_hashes
            .bank_fork_choice_verifier_hash,
        solana_full_light_client_gate_hash: summary.full_light_client_gate_hash,
      },
    });
    expect(
      adapterCandidate.statuses.filter((status) =>
        [
          "expectedSourceVerifierMaterialHash",
          "expectedSourceAdapterEngineDeploymentHash",
          "expectedFullLightClientGateHash",
        ].includes(status.key),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "expectedSourceVerifierMaterialHash",
          status: "present",
          value: summary.source_verifier_material_hash,
        }),
        expect.objectContaining({
          key: "expectedSourceAdapterEngineDeploymentHash",
          status: "present",
          value: summary.source_adapter_engine_deployment_hash,
        }),
        expect.objectContaining({
          key: "expectedFullLightClientGateHash",
          status: "present",
          value: summary.full_light_client_gate_hash,
        }),
      ]),
    );
  });

  it("rejects forged helper-comment TOML without its matching JSON attestation", () => {
    const { toml } = renderSiblingSolanaSourceEvidenceFixture();
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "toml",
          path: "/tmp/comment-only-solana-source-state-evidence.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
        {
          kind: "json",
          path: "/tmp/solana-post-deploy-full-toml.json",
          pointer: "/",
          schema: "iroha-sccp-solana-post-deploy-full-toml/v1",
          record: {
            schema: "iroha-sccp-solana-post-deploy-full-toml/v1",
            routeId: "taira_sol_xor",
            sourceDomain: 3,
            targetDomain: 0,
            sourceChain: "sol",
            fullTomlReady: true,
            offlineFullTomlSha256: hex32("9c"),
          },
        },
      ],
      manifest: baseProductionManifest(),
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "source-verifier-material",
        "source-adapter-engine-deployment",
      ]),
    );
    for (const candidate of [
      report.candidates.sourceVerifierMaterial[0],
      report.candidates.sourceAdapterEngineDeployment[0],
    ]) {
      expect(
        candidate.statuses.filter((status) =>
          [
            "expectedSourceVerifierMaterialHash",
            "expectedSourceAdapterEngineDeploymentHash",
            "expectedFullLightClientGateHash",
          ].includes(status.key),
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "expectedSourceVerifierMaterialHash",
            status: "invalid",
          }),
          expect.objectContaining({
            key: "expectedSourceAdapterEngineDeploymentHash",
            status: "invalid",
          }),
          expect.objectContaining({
            key: "expectedFullLightClientGateHash",
            status: "invalid",
          }),
        ]),
      );
    }
  });

  it("does not pair Solana source TOML with a helper summary from another governed root", () => {
    const { summary, toml } = renderSiblingSolanaSourceEvidenceFixture();
    const report = buildSolanaProductionMaterialInventoryReportBody({
      governedRoots: ["/tmp/governed", "/tmp/other"],
      records: [
        {
          kind: "json",
          path: "/tmp/other/solana-source-state-evidence.summary.json",
          pointer: "/",
          schema: "",
          record: summary,
        },
        {
          kind: "toml",
          path: "/tmp/governed/solana-source-state-evidence.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
      ],
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.readyMaterial.sourceVerifierMaterial).toBeNull();
    expect(report.readyMaterial.sourceAdapterEngineDeployment).toBeNull();
    for (const candidate of [
      report.candidates.sourceVerifierMaterial.find((entry) =>
        entry.path.startsWith("/tmp/governed/"),
      ),
      report.candidates.sourceAdapterEngineDeployment.find((entry) =>
        entry.path.startsWith("/tmp/governed/"),
      ),
    ]) {
      expect(
        candidate.statuses.find(
          (status) => status.key === "helperJsonAttestation",
        ),
      ).toMatchObject({ status: "missing" });
    }
  });

  it("rejects non-Solana full TOML evidence in Solana production material inventory", () => {
    const toml = `
[[zk.sccp_source_verifier_materials]]
version = 1
source_domain = 2
source_chain = "bsc"
source_trust_anchor_hash = "${materialHex32("source-trust-anchor")}"
consensus_verifier_hash = "${materialHex32("consensus-verifier")}"
message_inclusion_verifier_hash = "${materialHex32("message-inclusion-verifier")}"
source_state_verifier_hash = "${materialHex32("source-state-verifier")}"
finality_policy_hash = "${materialHex32("finality-policy")}"
placeholder_material = false

full_toml_ready = true
offline_full_toml_sha256 = "${hex32("9c")}"
`;
    const tomlSha256 = `0x${createHash("sha256").update(toml).digest("hex")}`;
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp"],
      records: [
        {
          kind: "toml",
          path: "/tmp/taira-bsc-xor-route.production-ready.torii.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
      ],
      manifest: {
        destinationProofAdmission: {
          admissionMode: "governed-zk-verifier-v1",
        },
      },
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyMaterial.offlineFullToml).toBeNull();
    expect(report.blockers.map((blocker) => blocker.id)).toContain(
      "offline-full-toml",
    );
    expect(report.candidates.offlineFullToml[0]).toMatchObject({
      ready: false,
      offlineFullTomlSha256: tomlSha256,
    });
    expect(
      report.candidates.offlineFullToml[0].statuses.map((status) => status.key),
    ).toEqual(
      expect.arrayContaining([
        "solanaRouteMarker",
        "sourceDomain",
        "sourceChain",
        "helperJsonAttestation",
      ]),
    );
  });

  it("accepts Solana destination full TOML evidence in production material inventory", () => {
    const offline = reviewedOfflineTomlFixture({ root: "/tmp" });
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp"],
      governedRoots: ["/tmp"],
      records: offline.records,
      manifest: {
        destinationProofAdmission: {
          admissionMode: "governed-zk-verifier-v1",
        },
      },
      proverReadiness: readySolanaProverReadiness(),
      governanceApprovalValidation: readyProductionGovernanceApprovalValidation(
        {
          pins: { offlineFullTomlSha256: offline.offlineFullTomlSha256 },
        },
      ),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyMaterial.offlineFullToml).toMatchObject({
      path: offline.tomlPath,
      offlineFullTomlSha256: offline.offlineFullTomlSha256,
    });
    expect(report.candidates.offlineFullToml[0].ready).toBe(true);
    expect(
      report.candidates.offlineFullToml[0].statuses
        .filter((status) => status.status !== "present")
        .map((status) => status.key),
    ).toEqual([]);
  });

  it("rejects reviewed Solana offline TOML when its bytes do not match the helper report", () => {
    const offline = reviewedOfflineTomlFixture({ root: "/tmp" });
    offline.records[0].record.offlineFullTomlSha256 = hex32("9e");
    offline.records[0].record.offline_full_toml_sha256 = hex32("9e");
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp"],
      governedRoots: ["/tmp"],
      records: offline.records,
      manifest: baseProductionManifest(),
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.readyMaterial.offlineFullToml).toBeNull();
    expect(report.candidates.offlineFullToml[0]).toMatchObject({
      ready: false,
      offlineFullTomlSha256: offline.offlineFullTomlSha256,
    });
    expect(
      report.candidates.offlineFullToml[0].statuses.find(
        (status) => status.key === "offlineFullTomlByteSha256",
      ),
    ).toMatchObject({
      status: "invalid",
      value: offline.offlineFullTomlSha256,
      expected: hex32("9e"),
    });
  });

  it("builds Solana production manifest patch inputs from ready inventory material", () => {
    const { summary, toml } = renderSiblingSolanaSourceEvidenceFixture();
    const offline = reviewedOfflineTomlFixture({ root: "/tmp" });
    const inventoryManifest = baseProductionManifest();
    const inventoryRecords = [
      {
        kind: "json",
        path: "/tmp/solana-source-state-evidence.summary.json",
        pointer: "/",
        schema: "",
        record: summary,
      },
      {
        kind: "toml",
        path: "/tmp/solana-source-state-evidence.toml",
        pointer: "/",
        schema: "",
        text: toml,
      },
      ...offline.records,
    ];
    const buildInventory = (
      destinationProofAdmissionHash = null,
      selectedManifest = inventoryManifest,
    ) =>
      buildSolanaProductionMaterialInventoryReportBody({
        roots: ["/tmp"],
        governedRoots: ["/tmp"],
        records: inventoryRecords,
        manifest: selectedManifest,
        proverReadiness: readySolanaProverReadiness(),
        governanceApprovalValidation: readyInventoryGovernanceApproval({
          sourceVerifierMaterialHash: summary.source_verifier_material_hash,
          sourceAdapterEngineDeploymentHash:
            summary.source_adapter_engine_deployment_hash,
          offlineFullTomlSha256: offline.offlineFullTomlSha256,
          manifest: selectedManifest,
          destinationProofAdmissionHash,
        }),
        checkedAt: "2026-07-05T00:00:00.000Z",
      });
    const preliminaryInventory = buildInventory();
    const preliminaryInputs =
      buildSolanaProductionManifestPatchInputsFromInventoryReport({
        inventory: preliminaryInventory,
        checkedAt: "2026-07-05T00:00:01.000Z",
      });
    const draftManifest = {
      ...baseProductionManifest(),
      productionReady: false,
      production_ready: false,
      disabledReason: "proof material is still under review",
      disabled_reason: "proof material is still under review",
      destinationProofAdmission: {
        admissionMode: "envelope-recorder-v1",
        proofSystem: "none",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: hex32("1"),
        verifierKeyHash: hex32("2"),
        destinationBindingHash: hex32("3"),
        shapeOnly: true,
        acceptsUnverifiedProofs: true,
      },
      postDeployLiveEvidence: {
        schema: "iroha-sccp-solana-post-deploy-live-evidence/v1",
        fullTomlReady: true,
        sourceBridgeConfigHash: hex32("4"),
        routeCanaryEvidenceHash: hex32("5"),
        offlineFullTomlSha256: offline.offlineFullTomlSha256,
        sourceEventTransactionSignature:
          "2d1KBhY5pyRuCBiXxoLUKmGEE9oEHRduBJKmjnFqSpEF85r8651FayJRC977ajGdjEvLvmTvTATwu53CSSTZZscR",
        routeCanaryTransactionSignature:
          "2sqsLAxG7ufxpq1nbLT7XV8qYQtjLfpPuHogdVrwkSMwBCNQ83z4NEbXY2wFA2YhyscyjmtnzczDFzpSjv2yuGLS",
      },
    };
    const buildPatch = (selectedInputs) =>
      buildSolanaProductionManifestPatchReportBody({
        manifest: draftManifest,
        sourceVerifierMaterial: selectedInputs.sourceVerifierMaterial,
        sourceAdapterEngineDeployment:
          selectedInputs.sourceAdapterEngineDeployment,
        sourceVerifierMaterialHash: selectedInputs.sourceVerifierMaterialHash,
        sourceAdapterEngineDeploymentHash:
          selectedInputs.sourceAdapterEngineDeploymentHash,
        postDeployLiveEvidence: {
          ...draftManifest.postDeployLiveEvidence,
          full_toml_ready: true,
          source_bridge_config_hash: hex32("4"),
          route_canary_evidence_hash: hex32("5"),
          offline_full_toml_sha256: selectedInputs.offlineFullTomlSha256,
          source_event_transaction_signature:
            draftManifest.postDeployLiveEvidence
              .sourceEventTransactionSignature,
          route_canary_transaction_signature:
            draftManifest.postDeployLiveEvidence
              .routeCanaryTransactionSignature,
        },
        routeAllowlistHash: hex32("8b"),
        destinationProverModuleHash: selectedInputs.destinationProverModuleHash,
        destinationProverSidecarHash:
          selectedInputs.destinationProverSidecarHash,
        sourceProverModuleHash: selectedInputs.sourceProverModuleHash,
        sourceProverSidecarHash: selectedInputs.sourceProverSidecarHash,
        governanceProgramRolePins: selectedInputs.governanceProgramRolePins,
        checkedAt: "2026-07-05T00:00:02.000Z",
      });
    const preliminaryPatch = buildPatch(preliminaryInputs);
    const generatedDestinationProofAdmissionHash = jsonSha256(
      preliminaryPatch.manifestPatch.destination_proof_admission,
    );
    expect(generatedDestinationProofAdmissionHash).not.toBe(
      preliminaryInputs.governanceApproval.pins.destinationProofAdmissionHash,
    );
    const inventory = buildInventory(generatedDestinationProofAdmissionHash);
    const inputs = buildSolanaProductionManifestPatchInputsFromInventoryReport({
      inventory,
      checkedAt: "2026-07-05T00:00:03.000Z",
    });
    const patch = buildPatch(inputs);
    const appliedManifest = structuredClone(draftManifest);
    for (const key of [
      "disabledReason",
      "disabled_reason",
      "destinationProofAdmission",
      "destination_proof_admission",
      "verifierEnforcement",
      "verifier_enforcement",
      "destinationRollout",
      "destination_rollout",
      "productionReadiness",
      "production_readiness",
      "postDeployLiveEvidence",
      "post_deploy_live_evidence",
    ]) {
      delete appliedManifest[key];
    }
    Object.assign(appliedManifest, patch.manifestPatch);
    const postApplyInventory = buildInventory(
      generatedDestinationProofAdmissionHash,
      appliedManifest,
    );

    expect(inventory.ready).toBe(true);
    expect(postApplyInventory.ready).toBe(true);
    expect(postApplyInventory.readyMaterial.destinationProofAdmission).toBe(
      true,
    );
    expect(inputs.ready).toBe(true);
    expect(inputs.blockers).toEqual([]);
    expect(inputs.offlineFullTomlSha256).toBe(offline.offlineFullTomlSha256);
    expect(inputs.sourceVerifierMaterialHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(inputs.sourceAdapterEngineDeploymentHash).toMatch(
      /^0x[0-9a-f]{64}$/u,
    );
    expect(inputs.destinationProverModuleHash).toBe(
      materialHex32("destination-module"),
    );
    expect(inputs.destinationProverSidecarHash).toBe(
      materialHex32("destination-sidecar"),
    );
    expect(inputs.sourceProverModuleHash).toBe(materialHex32("source-module"));
    expect(inputs.sourceProverSidecarHash).toBe(
      materialHex32("source-sidecar"),
    );
    expect(inventory.readyMaterial.browserProverModules).toEqual([
      expect.objectContaining({
        direction: "destination",
        productionProofsReady: true,
        moduleHash: materialHex32("destination-module"),
        sidecarHash: materialHex32("destination-sidecar"),
      }),
      expect.objectContaining({
        direction: "source",
        productionProofsReady: true,
        moduleHash: materialHex32("source-module"),
        sidecarHash: materialHex32("source-sidecar"),
      }),
    ]);
    expect(patch.readyForProductionManifestPatch).toBe(true);
    expect(patch.derived.sourceVerifierMaterialHash).toBe(
      inputs.sourceVerifierMaterialHash,
    );
    expect(jsonSha256(patch.manifestPatch.destination_proof_admission)).toBe(
      inputs.governanceApproval.pins.destinationProofAdmissionHash,
    );
    const deploySource = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const patchCommandStart = deploySource.indexOf(
      "const productionManifestPatch = async",
    );
    const patchCommandEnd = deploySource.indexOf(
      "const postDeployFullToml = async",
      patchCommandStart,
    );
    const patchCommand = deploySource.slice(patchCommandStart, patchCommandEnd);
    expect(patchCommand).toContain("generatedDestinationProofAdmissionHash");
    expect(patchCommand).toContain("approvedDestinationProofAdmissionHash");
    expect(patchCommand).toContain(
      "Generated Solana destination proof admission does not match the independently approved hash.",
    );
  });

  it("keeps Solana production manifest patch inputs blocked without ready inventory material", () => {
    const inputs = buildSolanaProductionManifestPatchInputsFromInventoryReport({
      inventory: {
        schema: "iroha-demo-sccp-solana-production-material-inventory/v1",
        ready: false,
        readyMaterial: {},
        blockers: [{ id: "source-verifier-material" }],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(inputs.ready).toBe(false);
    expect(inputs.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "production-material-inventory-not-ready",
        "governance-approval",
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "offline-full-toml",
        "destination-browser-prover",
        "source-browser-prover",
      ]),
    );
  });

  it("rejects a production prover sidecar whose KAT vector hash is not governance-approved", () => {
    const { summary, toml } = renderSiblingSolanaSourceEvidenceFixture();
    const offline = reviewedOfflineTomlFixture({ root: "/tmp" });
    const manifest = baseProductionManifest();
    const proverReadiness = readySolanaProverReadiness();
    proverReadiness.entries[0].sidecar.knownAnswerVectorHash = materialHex32(
      "attacker-selected-known-answer-vector",
    );
    const report = buildSolanaProductionMaterialInventoryReportBody({
      roots: ["/tmp"],
      governedRoots: ["/tmp"],
      records: [
        {
          kind: "json",
          path: "/tmp/solana-source-state-evidence.summary.json",
          pointer: "/",
          schema: "",
          record: summary,
        },
        {
          kind: "toml",
          path: "/tmp/solana-source-state-evidence.toml",
          pointer: "/",
          schema: "",
          text: toml,
        },
        ...offline.records,
      ],
      manifest,
      proverReadiness,
      governanceApprovalValidation: readyInventoryGovernanceApproval({
        sourceVerifierMaterialHash: summary.source_verifier_material_hash,
        sourceAdapterEngineDeploymentHash:
          summary.source_adapter_engine_deployment_hash,
        offlineFullTomlSha256: offline.offlineFullTomlSha256,
        manifest,
      }),
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.readyMaterial.browserProvers).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "browser-prover-readiness" }),
      ]),
    );
  });

  it("does not treat generated requirement status rows as Solana production material", () => {
    const report = buildSolanaProductionMaterialInventoryReportBody({
      records: [
        {
          kind: "json",
          path: "/tmp/requirements.json",
          pointer: "/requirements/sourceVerifierMaterial/0",
          schema: "iroha-demo-sccp-solana-production-requirements/v1",
          record: {
            key: "sourceTrustAnchorHash",
            status: "missing",
            routeId: "taira_sol_xor",
          },
        },
        {
          kind: "json",
          path: "/tmp/requirements.json",
          pointer: "/requirements/postDeployLiveEvidence/0",
          schema: "iroha-demo-sccp-solana-production-requirements/v1",
          record: {
            key: "offlineFullTomlSha256",
            status: "missing",
            routeId: "taira_sol_xor",
          },
        },
        {
          kind: "json",
          path: "/tmp/live-evidence.json",
          pointer: "/",
          schema: "iroha-sccp-solana-live-evidence/v1",
          record: {
            schema: "iroha-sccp-solana-live-evidence/v1",
            routeId: "taira_sol_xor",
          },
        },
      ],
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.candidates.sourceVerifierMaterial).toEqual([]);
    expect(report.candidates.sourceAdapterEngineDeployment).toEqual([]);
    expect(report.candidates.offlineFullToml).toEqual([]);
  });

  it("builds a non-secret Solana source material handoff without claiming production proof material", () => {
    const sourceProofRequest = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      sourceBurnHash: hex32("12"),
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const report = buildSolanaSourceMaterialHandoffReportBody({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
      },
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      publicConfig: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        programDataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programDataSlot: 419725105,
        executableBlake2b256: hex32("ab"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: hex32("ab"),
      },
      postDeployEvidence: {
        observedSourceBridgeConfigHash: hex32("11"),
        observedSourceState: {
          lastBurnHash: hex32("12"),
        },
      },
      routeCanarySubmission: {
        signature:
          "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
        envelope: {
          canaryEvidenceHash: hex32("13"),
        },
      },
      sourceBurnSubmission: {
        submitted: true,
        signature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
        amountBaseUnits: "1",
        tairaRecipient: TAIRA_RECIPIENT,
        nonce: "7",
        sourceProofRequest,
      },
      productionMaterialInventory: {
        ready: false,
        readyMaterial: {
          sourceVerifierMaterial: null,
        },
        blockers: [{ id: "source-verifier-material" }],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.readyForProofMaterialCeremony).toBe(true);
    expect(report.productionProofMaterialIncluded).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.currentInventory?.blockers).toEqual([
      "source-verifier-material",
    ]);
    expect(report.commands.renderLiveFullToml).toContain(hex32("13"));
    expect(report.commands.renderSourceMaterialToml).toContain(
      "--source-trust-anchor-hash",
    );
    expect(report.commands.deriveRouteAllowlistHash).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "route-allowlist-hash",
      "--source-verifier-material-hash",
      "0x<source_verifier_material_hash>",
      "--source-adapter-engine-deployment-hash",
      "0x<source_adapter_engine_deployment_hash>",
    ]);
    expect(report.observedPins).toMatchObject({
      sourceBurnProofRequestReady: true,
      sourceBurnCanonicalTransferReady: true,
      sourceBurnMessageId: sourceProofRequest.canonical?.messageId,
      sourceBurnCommitmentRoot: sourceProofRequest.canonical?.commitmentRoot,
      sourceBurnPayloadHash: sourceProofRequest.canonical?.payloadHash,
    });
  });

  it("binds Solana source material handoff pins to the selected manifest over stale config", () => {
    const manifest = {
      solana_verifier_program_id:
        "4VRoFPvWGKcEUoxNLx4z85SPaMgKDQ41kYcHLA8KUT9Z",
      solana_programdata_address:
        "DWrVUAfHZ4LRFsxzrcUnV8e7domCvQrW5K9iBb7BTyta",
      solana_programdata_slot: 420349518,
      verifier_code_hash: hex32("44"),
      solana_program_id: "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
      sccp_solana_source_bridge_address:
        "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
      solana_token_mint: "B6zYanuGL2HLASZAUyj7WDUZLMVib16gAfheV6KHEPhv",
      solana_verifier_state_address:
        "2YXm92rKs2qggznsKjQX6DVXa1ymVaYKeXXjHUvbGUVB",
      solana_source_state_address:
        "5YiGP9N9v5vRuYs7ZvZuaMzCeZzsdpZG5ycfSKD7NPcn",
    };

    const report = buildSolanaSourceMaterialHandoffReportBody({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
      },
      manifest,
      publicConfig: {
        verifierProgramId: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        bridgeProgramId: "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
        sourceBridgeProgramId: "2AqWyAEHP9Td3QQ7gstVurcXnTPqvJnK78qgMBoHumck",
        tokenMintAddress: "5swsZQBiahbykoGt7Mf9QJhjBTfL6kUHXXzFZXgp849r",
        verifierStateAddress: "8qdWxZKrbUWCPnjky2RnoF4fMurPwKWttywvrRJBsQxb",
        sourceStateAddress: "Hg1umtvpvtegeuAFAehiMuN6oA4xcqg57HaZpVxQzVyX",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: manifest.solana_verifier_program_id,
        programDataAddress: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programDataSlot: 419893805,
        executableBlake2b256: hex32("20"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: hex32("20"),
        programdata_address: "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
        programdata_slot: "419893805",
      },
      postDeployEvidence: {
        observedSourceBridgeConfigHash: hex32("11"),
      },
      routeCanarySubmission: {
        signature:
          "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
        envelope: {
          canaryEvidenceHash: hex32("13"),
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.deploymentReady).toBe(true);
    expect(report.readyForProofMaterialCeremony).toBe(false);
    expect(report.deploymentBlockers).toEqual([]);
    expect(report.sourceBurnBlockers.map((blocker) => blocker.id)).toEqual([
      "source-burn-signature",
      "source-burn-hash",
    ]);
    expect(report.observedPins).toMatchObject({
      verifierProgramId: manifest.solana_verifier_program_id,
      verifierCodeHash: manifest.verifier_code_hash,
      programdataAddress: manifest.solana_programdata_address,
      programdataSlot: String(manifest.solana_programdata_slot),
      tokenMintAddress: manifest.solana_token_mint,
      bridgeProgramId: manifest.solana_program_id,
      sourceBridgeProgramId: manifest.sccp_solana_source_bridge_address,
      verifierStateAddress: manifest.solana_verifier_state_address,
      sourceStateAddress: manifest.solana_source_state_address,
    });
    expect(JSON.stringify(report)).not.toContain("G8G81amw");
    expect(JSON.stringify(report)).not.toContain("5swsZQB");
    expect(report.commands.renderLiveFullToml).toContain(
      manifest.solana_verifier_program_id,
    );
    expect(report.commands.renderLiveFullToml).toContain(
      manifest.solana_programdata_address,
    );
  });

  it("builds a non-secret governed Solana proof-material request from live handoff evidence", () => {
    const handoff = buildSolanaSourceMaterialHandoffReportBody({
      args: {
        "solana-rpc-url": "https://api.testnet.solana.com",
      },
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      publicConfig: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      },
      verifierEvidence: canonicalOuterVerifierEvidenceFixture({
        programId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        programDataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programDataSlot: 419725105,
        executableBlake2b256: hex32("ab"),
      }),
      verifierLiveEvidence: {
        verifier_code_hash: hex32("ab"),
      },
      postDeployEvidence: {
        observedSourceBridgeConfigHash: hex32("11"),
        observedSourceState: {
          lastBurnHash: hex32("12"),
        },
      },
      routeCanarySubmission: {
        signature:
          "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
        envelope: {
          canaryEvidenceHash: hex32("13"),
        },
      },
      sourceBurnSubmission: {
        submitted: true,
        signature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
        sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
        amountBaseUnits: "1",
        tairaRecipient: TAIRA_RECIPIENT,
        nonce: "7",
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    const report = buildSolanaProofMaterialRequestReportBody({
      handoff,
      handoffVerification: {
        ready: true,
        blockers: [],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [
          { id: "source-verifier-material" },
          { id: "source-adapter-engine-deployment" },
          { id: "browser-prover-readiness" },
        ],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          routeAlreadyPublic: false,
        },
        blockers: [
          { id: "production-requirements" },
          { id: "runtime-signing-key" },
        ],
      },
      proverReadiness: {
        readyForProductionProofs: false,
        entries: [
          {
            direction: "destination",
            moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
            sidecarUrl:
              "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
            expectedModuleHash: hex32("aa"),
            actualModuleHash: hex32("bb"),
            proveExport: "proveSolanaSccpDestination",
            selfTestExport: "solanaSccpDestinationProverSelfTest",
            exportsOk: true,
            ready: false,
            sidecarReady: false,
            moduleHashMatchesManifest: false,
            selfTest: {
              ready: false,
              requiredArtifacts: [
                {
                  id: "browser-destination-prover-package",
                  required: true,
                  status: "missing",
                },
              ],
              missingArtifactIds: ["browser-destination-prover-package"],
            },
          },
          {
            direction: "source",
            moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
            sidecarUrl:
              "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
            expectedModuleHash: hex32("cc"),
            actualModuleHash: hex32("cc"),
            proveExport: "proveSolanaSccpSource",
            selfTestExport: "solanaSccpSourceProverSelfTest",
            exportsOk: true,
            ready: false,
            sidecarReady: false,
            moduleHashMatchesManifest: true,
            selfTest: {
              ready: false,
              requiredArtifacts: [
                {
                  id: "browser-source-prover-package",
                  required: true,
                  status: "missing",
                },
              ],
              missingArtifactIds: ["browser-source-prover-package"],
            },
          },
        ],
        blockers: [
          { id: "destination-prover-readiness" },
          { id: "destination-prover-sidecar" },
          { id: "destination-prover-hash" },
          { id: "source-prover-readiness" },
          { id: "source-prover-sidecar" },
        ],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-proof-material-request/v1",
    );
    expect(report.ready).toBe(false);
    expect(report.readyForProofMaterialCeremony).toBe(true);
    expect(report.productionRouteReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.productionProofMaterialIncluded).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.readyForProduction).toBe(false);
    expect(report.productionMaterialComplete).toBe(false);
    expect(report.productionBlockerIds).toEqual([
      "production-requirements",
      "governed-proof-material",
      "browser-prover-readiness",
      "missing-production-artifacts",
    ]);
    expect(report.publicRouteAlreadyPublished).toBe(false);
    expect(report.observedPins).toMatchObject({
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      verifierCodeHash: hex32("ab"),
      sourceBridgeConfigHash: hex32("11"),
      routeCanaryEvidenceHash: hex32("13"),
    });
    expect(report.requiredProofMaterial.sourceVerifierMaterial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          helperArg: "--source-trust-anchor-hash",
        }),
        expect.objectContaining({
          helperArg: "--source-state-verifier-hash",
        }),
      ]),
    );
    expect(report.requiredProofMaterial.browserProverModules).toEqual([
      expect.objectContaining({
        direction: "destination",
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        sidecarUrl:
          "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        expectedModuleHash: hex32("aa"),
        actualModuleHash: hex32("bb"),
        exportsReady: true,
        selfTestReady: false,
        sidecarReady: false,
        moduleHashMatchesManifest: false,
        productionProofsReady: false,
        requiredArtifacts: [
          expect.objectContaining({
            id: "browser-destination-prover-package",
          }),
        ],
        missingArtifactIds: ["browser-destination-prover-package"],
        blockerIds: [
          "destination-prover-readiness",
          "destination-prover-sidecar",
          "destination-prover-hash",
        ],
      }),
      expect.objectContaining({
        direction: "source",
        moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        sidecarUrl: "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
        proveExport: "proveSolanaSccpSource",
        selfTestExport: "solanaSccpSourceProverSelfTest",
        expectedModuleHash: hex32("cc"),
        actualModuleHash: hex32("cc"),
        exportsReady: true,
        selfTestReady: false,
        sidecarReady: false,
        moduleHashMatchesManifest: true,
        productionProofsReady: false,
        requiredArtifacts: [
          expect.objectContaining({
            id: "browser-source-prover-package",
          }),
        ],
        missingArtifactIds: ["browser-source-prover-package"],
        blockerIds: ["source-prover-readiness", "source-prover-sidecar"],
      }),
    ]);
    expect(report.missingProductionArtifactIds).toEqual(
      expect.arrayContaining([
        "governed-solana-source-verifier-material",
        "governed-solana-source-adapter-engine-deployment",
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
        "browser-destination-prover-package",
        "browser-source-prover-package",
      ]),
    );
    expect(report.missingProductionArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governed-solana-source-verifier-material",
          upstreamArtifactIds: [
            "governed-solana-consensus-verifier-hash",
            "governed-solana-finality-policy-hash",
            "governed-solana-message-inclusion-verifier-hash",
            "governed-solana-source-state-verifier-hash",
            "governed-solana-source-trust-anchor-hash",
          ],
        }),
        expect.objectContaining({
          id: "governed-solana-source-adapter-engine-deployment",
          upstreamArtifactIds: [
            "governed-solana-adapter-verifier-vk-hash",
            "governed-solana-full-light-client-gate-hash",
            "governed-solana-source-adapter-deployment-receipt-hash",
            "governed-solana-source-verifier-material",
          ],
        }),
        expect.objectContaining({
          id: "browser-destination-prover-package",
          directions: ["destination"],
          sources: ["destination-browser-prover-self-test"],
          blockerIds: [
            "destination-prover-hash",
            "destination-prover-readiness",
            "destination-prover-sidecar",
          ],
          upstreamArtifactIds: [
            "destination-proof-admission-material",
            "governed-solana-source-proof-material",
            "solana-native-recursive-verifier-linkage",
          ],
        }),
        expect.objectContaining({
          id: "browser-source-prover-package",
          directions: ["source"],
          sources: ["source-browser-prover-self-test"],
          blockerIds: ["source-prover-readiness", "source-prover-sidecar"],
          upstreamArtifactIds: [
            "governed-solana-source-proof-material",
            "solana-source-adapter-engine-deployment",
            "taira-finalize-inbound-binding-material",
          ],
        }),
      ]),
    );
    expect(report.requiredInputs).toEqual([
      expect.objectContaining({
        id: "governed-solana-source-proof-material",
        kind: "governed-proof-record",
        commandKey: "renderSourceMaterialToml",
        requiredFields: expect.arrayContaining([
          expect.objectContaining({
            key: "sourceTrustAnchorHash",
            helperArg: "--source-trust-anchor-hash",
          }),
          expect.objectContaining({
            key: "sourceStateVerifierHash",
            helperArg: "--source-state-verifier-hash",
          }),
        ]),
      }),
      expect.objectContaining({
        id: "governed-solana-source-adapter-engine-deployment",
        kind: "governed-proof-record",
        commandKey: "renderSourceMaterialToml",
        requiredFields: expect.arrayContaining([
          expect.objectContaining({
            key: "adapterVerifierVkHash",
            helperArg: "--adapter-verifier-vk-hash",
            value: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
          }),
          expect.objectContaining({
            key: "deploymentReceiptHash",
            helperArg: "--deployment-receipt-hash",
          }),
        ]),
      }),
      expect.objectContaining({
        id: "reviewed-final-solana-offline-toml",
        kind: "reviewed-evidence-file",
        commandKey: "renderLiveFullToml",
        followUpCommandKey: "applyFinalTomlHash",
      }),
      expect.objectContaining({
        id: "production-ready-solana-browser-prover-sidecars",
        kind: "browser-module-package",
        commandKey: "productionManifestPatch",
        modules: [
          expect.objectContaining({
            direction: "destination",
            productionProofsReady: false,
            requiredArtifacts: [
              expect.objectContaining({
                id: "browser-destination-prover-package",
              }),
            ],
            missingArtifactIds: ["browser-destination-prover-package"],
            blockerIds: [
              "destination-prover-readiness",
              "destination-prover-sidecar",
              "destination-prover-hash",
            ],
          }),
          expect.objectContaining({
            direction: "source",
            productionProofsReady: false,
            requiredArtifacts: [
              expect.objectContaining({
                id: "browser-source-prover-package",
              }),
            ],
            missingArtifactIds: ["browser-source-prover-package"],
            blockerIds: ["source-prover-readiness", "source-prover-sidecar"],
          }),
        ],
      }),
      expect.objectContaining({
        id: "governed-solana-destination-proof-admission",
        kind: "route-manifest-material",
        commandKey: "productionManifestPatch",
        requiredFields: expect.arrayContaining([
          expect.objectContaining({ key: "admissionMode" }),
          expect.objectContaining({ key: "proofSystem" }),
          expect.objectContaining({ key: "shapeOnly" }),
          expect.objectContaining({ key: "acceptsUnverifiedProofs" }),
        ]),
      }),
    ]);
    expect(report.commands.renderSourceMaterialToml).toEqual(
      expect.arrayContaining([
        "../iroha/scripts/sccp_solana_source_state_evidence.py",
        "--expected-full-light-client-gate-hash",
        "--toml",
      ]),
    );
    expect(report.commands.writeProductionMaterialTemplate).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "production-material-template",
    ]);
    expect(report.commands.validateProductionMaterial).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "production-material-validate",
      "--material-file",
      "<reviewed-governed-solana-material.json-or-toml>",
    ]);
    expect(report.currentReports.productionRequirementBlockers).toEqual([
      "source-verifier-material",
      "source-adapter-engine-deployment",
      "browser-prover-readiness",
    ]);
    expect(report.currentReports.proverReadinessReady).toBe(false);
    expect(report.currentReports.proverReadinessBlockers).toEqual([
      "destination-prover-readiness",
      "destination-prover-sidecar",
      "destination-prover-hash",
      "source-prover-readiness",
      "source-prover-sidecar",
    ]);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "production-requirements",
      "publish-readiness",
    ]);
  });

  it("carries missing Solana source-burn handoff evidence into proof-material requests", () => {
    const report = buildSolanaProofMaterialRequestReportBody({
      handoff: {
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        readyForProofMaterialCeremony: false,
        productionProofMaterialIncluded: false,
        observedPins: {
          routeCanarySignature: "route-canary-signature",
          sourceBurnSignature: null,
          sourceBurnHash: null,
        },
        blockers: [
          {
            id: "source-burn-signature",
            detail:
              "No submitted Solana source-burn transaction signature is available.",
          },
          {
            id: "source-burn-hash",
            detail: "No live Solana source-state burn hash is available.",
          },
        ],
      },
      handoffVerification: {
        ready: false,
        blockers: [
          {
            id: "route-canary-signature-finalized",
            detail: "Transaction signature is not finalized cleanly on Solana.",
          },
          {
            id: "source-burn-signature-finalized",
            detail: "Transaction signature is missing from handoff pins.",
          },
        ],
      },
      sourceBurnSubmission: {
        schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
        submitted: false,
        reason: "source-burn-readiness-failed",
        blockers: [
          {
            id: "token-mint-supply",
            detail:
              "The Solana SPL TairaXOR mint supply is zero; no real bridged balance can be burned.",
          },
          {
            id: "source-token-balance",
            detail:
              "No selected SPL TairaXOR token account has at least 1 base units.",
          },
        ],
        preBurnReadiness: {
          blockers: [
            {
              id: "token-mint-supply",
              detail:
                "The Solana SPL TairaXOR mint supply is zero; no real bridged balance can be burned.",
            },
          ],
        },
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "runtime-signing-key" }],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual([
      "source-material-handoff",
      "source-material-handoff-verification",
      "production-requirements",
      "publish-readiness",
    ]);
    expect(report.missingProductionArtifactIds).toEqual(
      expect.arrayContaining([
        "solana-source-burn-transaction-signature",
        "solana-source-state-burn-hash",
        "solana-tairaxor-mint-supply",
        "solana-source-token-balance",
        "finalized-solana-route-canary-transaction",
        "finalized-solana-source-burn-transaction",
        "governed-solana-source-verifier-material",
      ]),
    );
    expect(report.missingProductionArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "solana-source-burn-transaction-signature",
          kind: "live-solana-transaction",
          sources: ["source-material-handoff"],
          blockerIds: ["source-burn-signature"],
          statuses: ["missing"],
          upstreamArtifactIds: ["solana-source-token-balance"],
        }),
        expect.objectContaining({
          id: "solana-source-state-burn-hash",
          kind: "live-solana-state-pin",
          sources: ["source-material-handoff"],
          blockerIds: ["source-burn-hash"],
          statuses: ["missing"],
          upstreamArtifactIds: ["solana-source-burn-transaction-signature"],
        }),
        expect.objectContaining({
          id: "solana-tairaxor-mint-supply",
          kind: "live-solana-token-balance",
          sources: ["source-burn-readiness", "source-burn-submission"],
          blockerIds: ["token-mint-supply"],
          statuses: ["missing"],
          upstreamArtifactIds: [
            "browser-destination-prover-package",
            "destination-proof-admission-material",
            "governed-solana-destination-proof-admission",
            "solana-destination-production-prover-package",
            "solana-native-recursive-verifier-linkage",
          ],
        }),
        expect.objectContaining({
          id: "solana-source-token-balance",
          kind: "live-solana-token-balance",
          sources: ["source-burn-submission"],
          blockerIds: ["source-token-balance"],
          statuses: ["missing"],
          upstreamArtifactIds: ["solana-tairaxor-mint-supply"],
        }),
        expect.objectContaining({
          id: "finalized-solana-source-burn-transaction",
          kind: "live-solana-finality-evidence",
          sources: ["source-material-handoff-verification"],
          blockerIds: ["source-burn-signature-finalized"],
          statuses: ["missing"],
          upstreamArtifactIds: [
            "solana-source-burn-transaction-signature",
            "solana-source-state-burn-hash",
          ],
        }),
      ]),
    );
  });

  it("keeps missing Solana source-burn finality out of proof-material handoff verification blockers", () => {
    const report = buildSolanaProofMaterialRequestReportBody({
      handoff: {
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        readyForProofMaterialCeremony: true,
        productionProofMaterialIncluded: false,
        observedPins: {
          routeCanarySignature:
            "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
          sourceBurnSignature: null,
          sourceBurnHash: null,
        },
        blockers: [],
      },
      handoffVerification: {
        ready: false,
        deploymentReady: true,
        deploymentBlockers: [],
        sourceBurnBlockers: [
          {
            id: "source-burn-signature-finalized",
            detail: "Transaction signature is missing from handoff pins.",
          },
        ],
        blockers: [
          {
            id: "source-burn-signature-finalized",
            detail: "Transaction signature is missing from handoff pins.",
          },
        ],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "runtime-signing-key" }],
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyForProofMaterialCeremony).toBe(true);
    expect(report.blockerIds).toEqual([
      "production-requirements",
      "publish-readiness",
    ]);
    expect(report.currentReports.handoffVerificationReady).toBe(true);
    expect(report.currentReports.handoffVerificationSourceBurnBlockers).toEqual(
      ["source-burn-signature-finalized"],
    );
    expect(report.missingProductionArtifactIds).toContain(
      "finalized-solana-source-burn-transaction",
    );
  });

  it("writes a governed Solana production-material template that remains fail-closed", () => {
    const template = buildSolanaProductionMaterialTemplateReportBody({
      handoff: {
        observedPins: {
          verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
          verifierCodeHash: hex32("20"),
        },
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(template).toMatchObject({
      schema: "iroha-demo-sccp-solana-production-material-template/v1",
      ready: false,
      templateOnly: true,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      missingProductionInputIds: [
        "governed-solana-source-verifier-material",
        "governed-solana-source-adapter-engine-deployment",
        "reviewed-final-solana-offline-toml",
        "governed-solana-destination-proof-admission",
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
      ],
      blockerIds: [
        "governed-solana-source-verifier-material",
        "governed-solana-source-adapter-engine-deployment",
        "reviewed-final-solana-offline-toml",
        "governed-solana-destination-proof-admission",
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
      ],
      observedPins: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
      },
      sourceVerifierMaterial: {
        schema: "iroha-sccp-solana-source-verifier-material-public/v1",
        templateOnly: true,
        placeholderMaterial: true,
        proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
        proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
        sourceTrustAnchorHash: "0x<source_trust_anchor_hash>",
        sourceStateVerifierHash: "0x<source_state_verifier_hash>",
      },
      sourceAdapterEngineDeployment: {
        schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
        proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
        proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
        adapterVerifierVkHash: SOLANA_SOURCE_ADAPTER_VERIFIER_VK_HASH,
        deploymentReceiptHash: "0x<deployment_receipt_hash>",
        towerReplayVerifierHash: "0x<tower_replay_verifier_hash>",
        fullAccountsdbLatticeVerifierHash:
          "0x<full_accountsdb_lattice_verifier_hash>",
        bankForkChoiceVerifierHash: "0x<bank_fork_choice_verifier_hash>",
        expectedSourceVerifierMaterialHash:
          "0x<expected_source_verifier_material_hash>",
        expectedSourceAdapterEngineDeploymentHash:
          "0x<expected_source_adapter_engine_deployment_hash>",
        expectedFullLightClientGateHash:
          "0x<expected_full_light_client_gate_hash>",
      },
      offlineFullTomlEvidence: {
        fullTomlReady: false,
        offlineFullTomlSha256: "0x<offline_full_toml_sha256>",
      },
      destinationProofAdmission: {
        admissionMode: "governed-zk-verifier-v1",
        proofSystem: "stark-fri-v1",
        shapeOnly: false,
        acceptsUnverifiedProofs: false,
      },
    });
    expect(template.blockers.map((blocker) => blocker.id)).toEqual(
      template.missingProductionInputIds,
    );
    expect(template.requiredProductionInputs).toEqual([
      expect.objectContaining({
        id: "governed-solana-source-verifier-material",
        kind: "reviewed-public-record",
      }),
      expect.objectContaining({
        id: "governed-solana-source-adapter-engine-deployment",
        kind: "reviewed-public-record",
      }),
      expect.objectContaining({
        id: "reviewed-final-solana-offline-toml",
        kind: "reviewed-offline-evidence",
      }),
      expect.objectContaining({
        id: "governed-solana-destination-proof-admission",
        kind: "reviewed-proof-admission",
      }),
      expect.objectContaining({
        id: "solana-destination-production-prover-package",
        kind: "browser-module-package",
      }),
      expect.objectContaining({
        id: "solana-source-production-prover-package",
        kind: "browser-module-package",
      }),
    ]);
    expect(template.commands.writeProductionMaterialTemplate).toBeUndefined();
    expect(template.commands.renderSourceMaterialToml).toEqual(
      expect.arrayContaining(["--solana-network", "solana-testnet"]),
    );
    expect(template.browserProverSidecars).toEqual([
      expect.objectContaining({
        direction: "destination",
        requiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
        destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
        verifierTarget: SOLANA_VERIFIER_TARGET,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        requiredProductionProofsReady: true,
      }),
      expect.objectContaining({
        direction: "source",
        requiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        requiredProductionProofsReady: true,
      }),
    ]);
    expect(template.commands.productionManifestPatch).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "production-manifest-patch",
      "--confirm-governed-solana-material",
      "true",
      "--from-inventory",
      "true",
      "--apply",
      "true",
    ]);

    const inventory = buildSolanaProductionMaterialInventoryReportBody({
      manifest: {
        destinationProofAdmission: template.destinationProofAdmission,
      },
      records: [
        {
          kind: "json",
          path: "/tmp/taira-solana-xor-production-material-template.json",
          pointer: "/sourceVerifierMaterial",
          rootSchema: template.schema,
          schema: template.sourceVerifierMaterial.schema,
          record: template.sourceVerifierMaterial,
        },
        {
          kind: "json",
          path: "/tmp/taira-solana-xor-production-material-template.json",
          pointer: "/sourceAdapterEngineDeployment",
          rootSchema: template.schema,
          schema: template.sourceAdapterEngineDeployment.schema,
          record: template.sourceAdapterEngineDeployment,
        },
        {
          kind: "json",
          path: "/tmp/taira-solana-xor-production-material-template.json",
          pointer: "/offlineFullTomlEvidence",
          rootSchema: template.schema,
          schema: template.offlineFullTomlEvidence.schema,
          record: template.offlineFullTomlEvidence,
        },
      ],
      proverReadiness: {
        readyForProductionProofs: false,
        entries: [],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(inventory.ready).toBe(false);
    expect(inventory.readyMaterial.sourceVerifierMaterial).toBeNull();
    expect(inventory.readyMaterial.sourceAdapterEngineDeployment).toBeNull();
    expect(inventory.readyMaterial.offlineFullToml).toBeNull();
    expect(inventory.candidates.sourceVerifierMaterial).toEqual([]);
    expect(inventory.candidates.sourceAdapterEngineDeployment).toEqual([]);
    expect(inventory.candidates.offlineFullToml).toEqual([]);

    const validation = buildSolanaProductionMaterialValidationReportBody({
      inventory,
      roots: ["/tmp/taira-solana-xor-production-material-template.json"],
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    expect(validation).toMatchObject({
      schema: "iroha-demo-sccp-solana-production-material-validation/v1",
      ready: false,
      materialRoots: [
        "/tmp/taira-solana-xor-production-material-template.json",
      ],
      blockers: [
        {
          id: "production-material-inventory",
          blockers: [
            "governance-approval",
            "governance-program-role-pins",
            "source-verifier-material",
            "source-adapter-engine-deployment",
            "offline-full-toml",
            "browser-prover-readiness",
          ],
        },
      ],
      nextActions: [
        "replace-template-placeholders-with-reviewed-governed-material",
      ],
    });
    expect(validation.inventory.candidates.sourceVerifierMaterial).toEqual([]);
    expect(validation.commands.applyProductionManifestPatch).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "production-manifest-patch",
      "--confirm-governed-solana-material",
      "true",
      "--from-inventory",
      "true",
      "--material-roots",
      "/tmp/taira-solana-xor-production-material-template.json",
      "--apply",
      "true",
    ]);
  });

  it("builds a deterministic non-secret Solana proof-material bundle manifest", () => {
    const baseArtifacts = [
      {
        id: "source-material-handoff",
        status: "included",
        required: true,
        relativePath:
          "output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.json",
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        sizeBytes: 1024,
        sha256: hex32("1"),
        reviewSha256: materialHex32("source-material-handoff"),
      },
      {
        id: "proof-material-request",
        status: "included",
        required: true,
        relativePath:
          "output/sccp-solana-deploy/taira-solana-xor-proof-material-request.json",
        schema: "iroha-demo-sccp-solana-proof-material-request/v1",
        sizeBytes: 2048,
        sha256: hex32("2"),
        reviewSha256: materialHex32("proof-material-request"),
      },
      {
        id: "destination-prover-sidecar",
        status: "included",
        required: true,
        relativePath:
          "public/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
        schema: "iroha-demo-sccp-solana-browser-prover-sidecar/v1",
        sizeBytes: 4096,
        sha256: hex32("3"),
        reviewSha256: materialHex32("destination-prover-sidecar"),
      },
      {
        id: "source-prover-sidecar",
        status: "included",
        required: true,
        relativePath:
          "public/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
        schema: "iroha-demo-sccp-solana-browser-prover-sidecar/v1",
        sizeBytes: 4096,
        sha256: hex32("4"),
        reviewSha256: materialHex32("source-prover-sidecar"),
      },
    ];
    const report = buildSolanaProofMaterialBundleReportBody({
      proofMaterialRequest: {
        schema: "iroha-demo-sccp-solana-proof-material-request/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        publicRouteAlreadyPublished: false,
        productionProofMaterialIncluded: false,
        observedPins: {
          verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        },
        missingProductionArtifacts: [
          {
            id: "solana-source-burn-transaction-signature",
            kind: "live-solana-transaction",
            sources: ["source-material-handoff"],
            blockerIds: ["source-burn-signature"],
            directions: [],
            statuses: ["missing"],
          },
        ],
        missingProductionArtifactIds: [
          "solana-source-burn-transaction-signature",
        ],
        requiredProofMaterial: {
          browserProverModules: [
            {
              direction: "destination",
              moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
              sidecarUrl:
                "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
              expectedModuleHash: hex32("aa"),
              actualModuleHash: hex32("aa"),
              proveExport: "proveSolanaSccpDestination",
              selfTestExport: "solanaSccpDestinationProverSelfTest",
              exportsReady: true,
              selfTestReady: false,
              sidecarReady: false,
              moduleHashMatchesManifest: true,
              productionProofsReady: false,
              blockerIds: [
                "destination-prover-readiness",
                "destination-prover-sidecar",
              ],
              requiredArtifacts: [
                {
                  id: "browser-destination-prover-package",
                  required: true,
                  status: "missing",
                },
              ],
              missingArtifactIds: ["browser-destination-prover-package"],
            },
          ],
        },
        blockers: [{ id: "production-requirements" }],
      },
      artifacts: baseArtifacts,
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    const refreshedRawReport = buildSolanaProofMaterialBundleReportBody({
      proofMaterialRequest: {
        readyForProofMaterialCeremony: true,
        blockers: [{ id: "production-requirements" }],
      },
      artifacts: baseArtifacts.map((artifact, index) => ({
        ...artifact,
        sha256: materialHex32(`raw-refresh-${index}`),
      })),
      checkedAt: "2026-07-05T01:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-proof-material-bundle/v1",
    );
    expect(report.ready).toBe(false);
    expect(report.readyForProofMaterialCeremony).toBe(false);
    expect(report.productionRouteReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.productionProofMaterialIncluded).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.readyForProduction).toBe(false);
    expect(report.productionMaterialComplete).toBe(false);
    expect(report.productionBlockerIds).toEqual([
      "governed-proof-material",
      "production-route-material",
      "missing-production-artifacts",
    ]);
    expect(report.bundleManifestSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(refreshedRawReport.bundleManifestSha256).toBe(
      report.bundleManifestSha256,
    );
    expect(report.digestPolicy).toMatchObject({
      artifactHashField: "reviewSha256",
      rawArtifactHashField: "sha256",
    });
    expect(report.includedArtifactCount).toBe(4);
    expect(report.artifacts[0]).toMatchObject({
      sha256: hex32("1"),
      reviewSha256: materialHex32("source-material-handoff"),
    });
    expect(report.artifacts.map((artifact) => artifact.id)).toEqual([
      "source-material-handoff",
      "proof-material-request",
      "destination-prover-sidecar",
      "source-prover-sidecar",
    ]);
    expect(report.blockers).toEqual([
      expect.objectContaining({ id: "artifact-binding-mismatch" }),
    ]);
    expect(report.upstreamBlockerIds).toEqual(["production-requirements"]);
    expect(report.proofMaterialRequest?.observedPins).toMatchObject({
      verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
    });
    expect(report.missingProductionArtifactIds).toEqual([
      "solana-source-burn-transaction-signature",
    ]);
    expect(report.missingProductionArtifacts).toEqual([
      expect.objectContaining({
        id: "solana-source-burn-transaction-signature",
        kind: "live-solana-transaction",
        sources: ["source-material-handoff"],
      }),
    ]);
    expect(report.proofMaterialRequest?.missingProductionArtifactIds).toEqual([
      "solana-source-burn-transaction-signature",
    ]);
    expect(report.proofMaterialRequest).toMatchObject({
      productionReady: false,
      readyForProduction: false,
      productionMaterialComplete: false,
      productionBlockerIds: [],
    });
    expect(report.proofMaterialRequest?.browserProverModules).toEqual([
      expect.objectContaining({
        direction: "destination",
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        sidecarUrl:
          "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
        expectedModuleHash: hex32("aa"),
        actualModuleHash: hex32("aa"),
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        exportsReady: true,
        selfTestReady: false,
        sidecarReady: false,
        moduleHashMatchesManifest: true,
        productionProofsReady: false,
        blockerIds: [
          "destination-prover-readiness",
          "destination-prover-sidecar",
        ],
        requiredArtifacts: [
          expect.objectContaining({
            id: "browser-destination-prover-package",
          }),
        ],
        missingArtifactIds: ["browser-destination-prover-package"],
      }),
    ]);
  });

  it("pins one exact proof-material request and bundle generation", async () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-pinned-proof-generation-"),
    );
    const paths = solanaDeployArtifactPaths({ "output-dir": outputDir });
    const request = {
      schema: "iroha-demo-sccp-solana-proof-material-request/v1",
      checkedAt: "2026-07-11T00:00:00.000Z",
      routeId: "taira_sol_xor",
      assetKey: "xor",
    };
    const requirements = {
      schema: "iroha-demo-sccp-solana-production-requirements/v1",
      checkedAt: "2026-07-11T00:00:00.500Z",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      ready: true,
    };
    const writeJson = (file, value) =>
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    try {
      writeJson(paths.proofMaterialRequest, request);
      writeJson(paths.productionRequirements, requirements);
      const requestEntry = await readProofMaterialBundleArtifact({
        id: "proof-material-request",
        path: paths.proofMaterialRequest,
        required: true,
      });
      const requirementsEntry = await readProofMaterialBundleArtifact({
        id: "production-requirements",
        path: paths.productionRequirements,
        required: true,
      });
      const bundle = buildSolanaProofMaterialBundleReportBody({
        proofMaterialRequest: request,
        artifacts: [requestEntry, requirementsEntry],
        checkedAt: "2026-07-11T00:00:01.000Z",
      });
      writeJson(paths.proofMaterialBundle, bundle);
      const expectedBundleSha256 = fileSha256(paths.proofMaterialBundle);

      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": expectedBundleSha256,
          },
          paths,
        }),
      ).resolves.toMatchObject({
        proofMaterialBundleArtifactSha256: expectedBundleSha256,
        proofMaterialRequestArtifactSha256: requestEntry.sha256,
      });
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": expectedBundleSha256,
          },
          paths,
          requireComplete: true,
        }),
      ).rejects.toThrow(/omits required artifacts/u);

      const unknownArtifactBundle = buildSolanaProofMaterialBundleReportBody({
        proofMaterialRequest: request,
        artifacts: [
          requestEntry,
          requirementsEntry,
          {
            id: "unknown-proof-artifact",
            status: "missing",
            required: false,
          },
        ],
        checkedAt: "2026-07-11T00:00:01.000Z",
      });
      writeJson(paths.proofMaterialBundle, unknownArtifactBundle);
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": fileSha256(
              paths.proofMaterialBundle,
            ),
          },
          paths,
        }),
      ).rejects.toThrow(/unknown artifact id/u);
      writeJson(paths.proofMaterialBundle, bundle);
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256":
              materialHex32("wrong-bundle-pin"),
          },
          paths,
        }),
      ).rejects.toThrow(/independent SHA-256 pin/u);

      writeJson(paths.productionRequirements, {
        ...requirements,
        ready: false,
      });
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": expectedBundleSha256,
          },
          paths,
        }),
      ).rejects.toThrow(/independent SHA-256 pin/u);
      writeJson(paths.productionRequirements, requirements);

      writeJson(paths.proofMaterialRequest, { ...request, swapped: true });
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": expectedBundleSha256,
          },
          paths,
        }),
      ).rejects.toThrow(/mixes different request or bundle generations/u);

      writeJson(paths.proofMaterialRequest, request);
      writeJson(paths.proofMaterialBundle, {
        ...bundle,
        bundleManifestSha256: materialHex32("tampered-bundle-digest"),
      });
      await expect(
        loadPinnedSolanaProofMaterialGeneration({
          args: {
            "expected-proof-material-bundle-sha256": fileSha256(
              paths.proofMaterialBundle,
            ),
          },
          paths,
        }),
      ).rejects.toThrow(/mixes different request or bundle generations/u);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("treats exact public publication as complete without claiming proof submission readiness", () => {
    const report = buildSolanaProofMaterialRequestReportBody({
      handoff: null,
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publishReadiness: {
        publicationSatisfied: true,
        submissionRequired: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "runtime-signing-key" }],
      },
    });

    expect(report).toMatchObject({
      ready: true,
      publicationSatisfied: true,
      submissionRequired: false,
      publicationComplete: true,
      readyToSubmitWithCurrentRuntime: false,
      productionMaterialComplete: false,
      blockers: [],
    });
    expect(report.diagnosticBlockerIds).toEqual(
      expect.arrayContaining([
        "source-material-handoff",
        "production-requirements",
      ]),
    );
    expect(report.productionBlockerIds).toEqual(
      expect.arrayContaining([
        "production-requirements",
        "governed-proof-material",
      ]),
    );
  });

  it("sets top-level proof-material readiness only after production and runtime blockers are cleared", () => {
    const request = buildSolanaProofMaterialRequestReportBody({
      handoff: {
        readyForProofMaterialCeremony: true,
        deploymentReady: true,
        productionProofMaterialIncluded: false,
        governedProductionMaterialValidated: true,
        blockers: [],
      },
      handoffVerification: {
        ready: true,
        deploymentReady: true,
        deploymentBlockers: [],
        blockers: [],
      },
      productionRequirements: { readyToBuildIsi: true, blockers: [] },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: true },
        blockers: [],
      },
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(request).toMatchObject({
      ready: true,
      readyForProofMaterialCeremony: true,
      productionReady: true,
      readyForProduction: true,
      productionMaterialComplete: true,
      productionProofMaterialIncluded: false,
      governedProductionMaterialValidated: true,
      productionRouteReady: true,
      readyToSubmitWithCurrentRuntime: true,
      blockers: [],
      productionBlockers: [],
    });

    const bundle = buildSolanaProofMaterialBundleReportBody({
      proofMaterialRequest: request,
      artifacts: [
        {
          id: "source-material-handoff",
          status: "included",
          required: true,
          relativePath: "output/source-material-handoff.json",
          schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
          reviewSha256: materialHex32("production-handoff"),
        },
        ...readyProofBundleBindingArtifacts(),
      ],
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(bundle).toMatchObject({
      ready: true,
      readyForProofMaterialCeremony: true,
      productionReady: true,
      readyForProduction: true,
      productionMaterialComplete: true,
      productionProofMaterialIncluded: false,
      governedProductionMaterialValidated: true,
      productionRouteReady: true,
      readyToSubmitWithCurrentRuntime: true,
      blockers: [],
      productionBlockers: [],
    });

    const sourceProofRequest = {
      readyForSourceProof: true,
      canonicalTransferReady: true,
      productionProof: true,
      proofPackageIncluded: true,
      canonical: {
        messageId: materialHex32("production-source-message"),
        commitmentRoot: materialHex32("production-source-commitment"),
        payloadHash: materialHex32("production-source-payload"),
        publicInputs: {
          txId: "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
          solanaSender: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          tairaRecipient: TAIRA_RECIPIENT,
          amountBaseUnits: "1",
        },
      },
      sourceBurn: {
        sourceBurnHash: materialHex32("production-source-burn"),
        tairaRecipient: TAIRA_RECIPIENT,
        amountBaseUnits: "1",
      },
      blockers: [],
    };
    const ceremony = buildSolanaProofMaterialCeremonyPackageReportBody({
      proofMaterialRequest: request,
      proofMaterialBundle: bundle,
      sourceMaterialHandoff: {
        readyForProofMaterialCeremony: true,
        deploymentReady: true,
        productionProofMaterialIncluded: false,
        governedProductionMaterialValidated: true,
        blockers: [],
      },
      sourceMaterialHandoffVerification: {
        ready: true,
        deploymentReady: true,
        deploymentBlockers: [],
        blockers: [],
      },
      sourceBurnSubmission: {
        submitted: true,
        signature: sourceProofRequest.canonical.publicInputs.txId,
        sourceProofRequestReady: true,
        sourceProofRequest,
        blockers: [],
      },
      productionRequirements: { readyToBuildIsi: true, blockers: [] },
      productionMaterialInventory: {
        ready: true,
        governanceApproval: { ready: true },
        blockers: [],
      },
      proverReadiness: readySolanaProverReadiness(),
      checkedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(ceremony).toMatchObject({
      ready: true,
      readyForCeremonyReview: true,
      readyForProofMaterialCeremony: true,
      productionReady: true,
      readyForProduction: true,
      productionMaterialComplete: true,
      productionProofMaterialIncluded: false,
      governedProductionMaterialValidated: true,
      productionRouteReady: true,
      readyToSubmitWithCurrentRuntime: true,
      blockers: [],
      productionBlockers: [],
    });
  });

  it("uses only the selected route manifest and canonical readback in proof-material bundle artifacts", () => {
    const definitions = proofMaterialBundleArtifactDefinitions(
      {
        routeManifest:
          "/repo/output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      },
      {
        routeManifestPath:
          "/repo/output/sccp-solana-deploy/taira-solana-xor-failclosed-route.manifest.json",
        verifierEvidencePath: "/reviewed/solana-program.evidence.json",
        routePublishReadinessPath: "/reviewed/route-publish-readiness.json",
      },
    );

    expect(
      definitions.find((definition) => definition.id === "route-manifest"),
    ).toMatchObject({
      path: "/repo/output/sccp-solana-deploy/taira-solana-xor-failclosed-route.manifest.json",
      required: true,
    });
    expect(
      definitions.find(
        (definition) => definition.id === "solana-finalized-readback-evidence",
      ),
    ).toMatchObject({
      path: "/reviewed/solana-program.evidence.json",
      required: true,
    });
    expect(
      definitions.some(
        (definition) => definition.id === "solana-live-evidence",
      ),
    ).toBe(false);
    expect(
      definitions.find(
        (definition) => definition.id === "route-publish-readiness",
      ),
    ).toMatchObject({
      path: "/reviewed/route-publish-readiness.json",
      required: true,
    });
  });

  it("builds a non-secret governed Solana proof-material ceremony package", () => {
    const sourceProofRequest = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      sourceBurnHash: hex32("12"),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    const report = buildSolanaProofMaterialCeremonyPackageReportBody({
      sourceMaterialHandoff: {
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        readyForProofMaterialCeremony: true,
        productionProofMaterialIncluded: false,
        observedPins: {
          verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
          verifierCodeHash: hex32("20"),
          sourceBurnProofRequestReady: true,
          sourceBurnCanonicalTransferReady: true,
          sourceBurnMessageId: sourceProofRequest.canonical?.messageId,
          sourceBurnCommitmentRoot:
            sourceProofRequest.canonical?.commitmentRoot,
          sourceBurnPayloadHash: sourceProofRequest.canonical?.payloadHash,
        },
        blockers: [],
      },
      sourceMaterialHandoffPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.json",
      sourceMaterialHandoffVerification: {
        schema:
          "iroha-demo-sccp-solana-source-material-handoff-verification/v1",
        ready: true,
        statuses: [{ id: "verifier-program", status: "pass" }],
        blockers: [],
      },
      sourceMaterialHandoffVerificationPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.verification.json",
      proofMaterialRequest: {
        schema: "iroha-demo-sccp-solana-proof-material-request/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        publicRouteAlreadyPublished: false,
        productionProofMaterialIncluded: false,
        requiredProofMaterial: {
          browserProverModules: [
            {
              direction: "source",
              moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
              productionProofsReady: false,
            },
          ],
        },
        blockers: [{ id: "production-requirements" }],
      },
      proofMaterialRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-request.json",
      proofMaterialBundle: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: materialHex32("proof-material-bundle"),
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      sourceBurnSubmission: {
        schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
        submitted: true,
        sourceProofRequestReady: true,
        sourceProofRequest,
        blockers: [],
      },
      sourceBurnSubmissionPath:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn.submission.json",
      productionRequirements: {
        schema: "iroha-demo-sccp-solana-production-requirements/v1",
        readyToBuildIsi: false,
        blockers: [
          { id: "source-verifier-material" },
          { id: "browser-prover-readiness" },
        ],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      productionMaterialInventory: {
        schema: "iroha-demo-sccp-solana-production-material-inventory/v1",
        ready: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      productionMaterialTemplate: {
        schema: "iroha-demo-sccp-solana-production-material-template/v1",
        missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
        requiredProductionInputs: [
          {
            id: "governed-solana-source-verifier-material",
            kind: "reviewed-public-record",
            description: "Source verifier material.",
          },
          {
            id: "governed-solana-source-adapter-engine-deployment",
            kind: "reviewed-public-record",
            description: "Source adapter deployment.",
          },
          {
            id: "reviewed-final-solana-offline-toml",
            kind: "reviewed-offline-evidence",
            description: "Final offline TOML.",
          },
          {
            id: "governed-solana-destination-proof-admission",
            kind: "reviewed-proof-admission",
            description: "Destination proof admission.",
          },
          {
            id: "solana-destination-production-prover-package",
            kind: "browser-module-package",
            description: "Destination prover package.",
          },
          {
            id: "solana-source-production-prover-package",
            kind: "browser-module-package",
            description: "Source prover package.",
          },
        ],
      },
      productionMaterialTemplatePath:
        "output/sccp-solana-deploy/taira-solana-xor-production-material-template.json",
      proverReadiness: {
        schema: "iroha-demo-sccp-solana-prover-readiness/v1",
        readyForProductionProofs: false,
        blockers: [{ id: "destination-prover-readiness" }],
        nextActionDetails: [
          {
            id: "publish-destination-solana-production-prover-package",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "prover-readiness",
            ],
            requiredInputs: [
              { id: "solana-destination-production-prover-package" },
            ],
          },
        ],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-proof-material-ceremony-package/v1",
    );
    expect(report.readyForCeremonyReview).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.readyForProduction).toBe(false);
    expect(report.productionMaterialComplete).toBe(false);
    expect(report.productionRouteReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.productionProofMaterialIncluded).toBe(false);
    expect(report.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.ceremonyPackageHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.stableHash).toBe(report.ceremonyPackageHash);
    expect(report.reviewBlockers).toEqual([]);
    expect(report.productionBlockers.map((blocker) => blocker.id)).toEqual([
      "production-requirements",
      "production-material-inventory",
      "browser-prover-readiness",
      "governed-proof-material",
    ]);
    expect(report.sourceBurnProofRequest).toMatchObject({
      readyForSourceProof: true,
      canonicalTransferReady: true,
      messageId: sourceProofRequest.canonical?.messageId,
      commitmentRoot: sourceProofRequest.canonical?.commitmentRoot,
      payloadHash: sourceProofRequest.canonical?.payloadHash,
    });
    expect(report.artifacts.proofMaterialBundle).toMatchObject({
      ready: true,
      stableHash: materialHex32("proof-material-bundle"),
    });
    expect(report.artifacts.sourceBurnSubmission).toMatchObject({
      ready: true,
      stableHash: sourceProofRequest.canonical?.messageId,
    });
    expect(report.artifacts.productionMaterialTemplate).toMatchObject({
      present: true,
      missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    });
    expect(report.nextActions).toEqual([
      "publish-governed-solana-proof-material",
    ]);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "publish-governed-solana-proof-material",
        command: report.commands.productionManifestPatch,
        validationCommands: [
          report.commands.refreshProductionRequirements,
          report.commands.refreshProductionMaterialInventory,
          report.commands.refreshProverReadiness,
        ],
        requiredInputs: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
        delegatedActions: expect.arrayContaining([
          expect.objectContaining({
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
          }),
          expect.objectContaining({
            id: "publish-destination-solana-production-prover-package",
          }),
        ]),
      },
    ]);
    expect(report.commands.refreshPackage).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "proof-material-ceremony-package",
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("does not accept stale source-burn proof pins without a submitted burn", () => {
    const staleSourceProofRequest = buildSolanaSourceBurnProofRequestScaffold({
      signature:
        "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
      tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
      sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
      sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
      amountBaseUnits: "1",
      tairaRecipient: TAIRA_RECIPIENT,
      nonce: "7",
      sourceBurnHash: hex32("12"),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    const report = buildSolanaProofMaterialCeremonyPackageReportBody({
      sourceMaterialHandoff: {
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        readyForProofMaterialCeremony: true,
        observedPins: {
          sourceBurnProofRequestReady: true,
          sourceBurnCanonicalTransferReady: true,
          sourceBurnMessageId: staleSourceProofRequest.canonical?.messageId,
          sourceBurnCommitmentRoot:
            staleSourceProofRequest.canonical?.commitmentRoot,
          sourceBurnPayloadHash: staleSourceProofRequest.canonical?.payloadHash,
        },
        blockers: [],
      },
      sourceMaterialHandoffVerification: {
        schema:
          "iroha-demo-sccp-solana-source-material-handoff-verification/v1",
        ready: true,
        blockers: [],
      },
      proofMaterialRequest: {
        schema: "iroha-demo-sccp-solana-proof-material-request/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        blockers: [],
      },
      proofMaterialBundle: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        blockers: [],
        upstreamBlockerIds: [],
      },
      sourceBurnSubmission: {
        schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
        submitted: false,
        reason: "source-burn-readiness-failed",
        sourceProofRequestReady: true,
        sourceProofRequest: staleSourceProofRequest,
        blockers: [{ id: "source-token-balance" }],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.readyForCeremonyReview).toBe(false);
    expect(report.sourceBurnProofRequest).toMatchObject({
      present: false,
      readyForSourceProof: false,
      canonicalTransferReady: false,
      messageId: null,
      blockerIds: ["source-burn-submission", "source-token-balance"],
    });
    expect(report.reviewBlockers).toEqual([
      expect.objectContaining({
        id: "source-burn-proof-request",
        blockers: ["source-burn-submission", "source-token-balance"],
      }),
    ]);
    expect(report.artifacts.sourceBurnSubmission).toMatchObject({
      ready: false,
      blockerIds: ["source-burn-submission", "source-token-balance"],
    });
    expect(report.nextActions).toContain("refresh-source-burn-proof-request");
  });

  it("fails the Solana proof-material bundle when required public artifacts are missing or secret-like", () => {
    const report = buildSolanaProofMaterialBundleReportBody({
      proofMaterialRequest: {
        schema: "iroha-demo-sccp-solana-proof-material-request/v1",
        readyForProofMaterialCeremony: true,
        blockers: [],
      },
      artifacts: [
        {
          id: "source-material-handoff",
          status: "missing",
          required: true,
          error: "Artifact file is missing.",
          relativePath:
            "output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.json",
        },
        {
          id: "solana-deployer-keypair",
          status: "skipped",
          required: true,
          reason: "secret-like-path",
          relativePath:
            "output/sccp-solana-deploy/solana-deployer-keypair.json",
        },
      ],
    });

    expect(report.ready).toBe(false);
    expect(report.readyForProofMaterialCeremony).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "required-artifact-missing",
          artifactId: "source-material-handoff",
        }),
        expect.objectContaining({
          id: "secret-like-artifact",
          artifactId: "solana-deployer-keypair",
        }),
      ]),
    );
  });

  it("does not follow symbolic links while assembling the proof-material bundle", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-proof-bundle-link-"),
    );
    const outsideArtifact = path.join(tempDir, "outside.json");
    const linkedArtifact = path.join(tempDir, "public-artifact.json");
    writeFileSync(
      outsideArtifact,
      JSON.stringify({
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        ready: true,
      }),
    );
    symlinkSync(outsideArtifact, linkedArtifact);
    try {
      await expect(
        readProofMaterialBundleArtifact({
          id: "solana-finalized-readback-evidence",
          path: linkedArtifact,
          required: true,
        }),
      ).resolves.toMatchObject({
        status: "skipped",
        required: true,
        reason: "symbolic-link",
        path: linkedArtifact,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects hardlinked artifacts while assembling the proof-material bundle", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-proof-bundle-hardlink-"),
    );
    const originalArtifact = path.join(tempDir, "original.json");
    const linkedArtifact = path.join(tempDir, "public-artifact.json");
    writeJsonFixture(originalArtifact, {
      schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
      ready: true,
    });
    linkSync(originalArtifact, linkedArtifact);
    try {
      await expect(
        readProofMaterialBundleArtifact({
          id: "solana-finalized-readback-evidence",
          path: linkedArtifact,
          required: true,
        }),
      ).resolves.toMatchObject({
        status: "invalid",
        required: true,
        error: "Artifact must be a singly-linked regular file.",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects cross-artifact canonical snapshot, evidence-byte, and manifest-byte mismatches", () => {
    const canonicalSnapshotSha256 = materialHex32("bundle-snapshot");
    const canonicalEvidenceArtifactSha256 = materialHex32("bundle-evidence");
    const publicConfigSha256 = materialHex32("bundle-public-config");
    const nativeConfigSha256 = materialHex32("bundle-native-config");
    const manifestArtifactSha256 = materialHex32("bundle-manifest");
    const sourceBridgeConfigHash = materialHex32("bundle-source-config");
    const report = buildSolanaProofMaterialBundleReportBody({
      proofMaterialRequest: {
        readyForProofMaterialCeremony: true,
        observedPins: {},
      },
      artifacts: [
        {
          id: "solana-finalized-readback-evidence",
          status: "included",
          required: true,
          sha256: canonicalEvidenceArtifactSha256,
          binding: {
            canonicalSnapshotSha256,
            publicConfigSha256,
            nativeVerifierConfigSha256: nativeConfigSha256,
            sourceBridgeConfigHash,
            observedPins: {},
          },
        },
        {
          id: "solana-public-config",
          status: "included",
          required: true,
          sha256: publicConfigSha256,
        },
        {
          id: "solana-native-verifier-config",
          status: "included",
          required: true,
          sha256: nativeConfigSha256,
        },
        {
          id: "post-deploy-evidence",
          status: "included",
          required: true,
          binding: {
            canonicalSnapshotSha256: materialHex32("wrong-snapshot"),
            finalizedReadbackEvidenceArtifactSha256:
              materialHex32("wrong-evidence"),
            sourceBridgeConfigHash,
          },
        },
        {
          id: "post-deploy-manifest-evidence",
          status: "included",
          required: true,
          binding: {
            ready: true,
            canonicalSnapshotSha256,
            finalizedReadbackEvidenceArtifactSha256:
              canonicalEvidenceArtifactSha256,
            manifestArtifactSha256: materialHex32("wrong-manifest"),
            sourceBridgeConfigHash,
          },
        },
        {
          id: "route-manifest",
          status: "included",
          required: true,
          sha256: manifestArtifactSha256,
          binding: { sourceBridgeConfigHash },
        },
      ],
      checkedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(report.readyForProofMaterialCeremony).toBe(false);
    expect(report.governedProductionMaterialValidated).toBe(false);
    expect(report.productionMaterialComplete).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.blockers).toContainEqual(
      expect.objectContaining({
        id: "artifact-binding-mismatch",
        missingOrInvalid: expect.arrayContaining([
          "post-deploy-canonical-snapshot",
          "post-deploy-finalized-readback-bytes",
          "manifest-conformance-route-manifest-bytes",
        ]),
      }),
    );
  });

  it("does not echo malformed proof-material artifact contents", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-proof-bundle-invalid-"),
    );
    const artifact = path.join(tempDir, "public-artifact.json");
    writeFileSync(artifact, '{"opaque-token":"do-not-echo"');
    try {
      const result = await readProofMaterialBundleArtifact({
        id: "source-material-handoff",
        path: artifact,
        required: true,
      });
      expect(result).toMatchObject({
        status: "invalid",
        required: true,
        error: "Artifact JSON is invalid.",
        sizeBytes: expect.any(Number),
        sha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      });
      expect(JSON.stringify(result)).not.toContain("do-not-echo");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds a non-secret Solana route publication request for route-manager review", () => {
    const report = buildSolanaRoutePublicationRequestReportBody({
      args: {
        authority: "<taira-route-manager-account-id>",
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      manifest: baseProductionManifest(),
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      productionRequirements: {
        checkedAt: "2026-07-05T00:00:00.000Z",
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      productionRequirementsPath:
        "output/sccp-solana-deploy/taira-solana-xor-production-requirements.json",
      publishReadiness: {
        schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
        checkedAt: "2026-07-05T00:00:00.000Z",
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          routeAlreadyPublic: false,
          mcpTransactionTools: {
            ready: true,
            presentTools: [
              "iroha.transactions.submit",
              "iroha.transactions.submit_and_wait",
            ],
          },
        },
        routeManifestIsi: {
          path: "output/sccp-solana-deploy/taira-solana-xor-route.upsert-isi.json",
          ready: false,
          error:
            "Production Solana route manifest must not include manifest.disabledReason.",
        },
        runtimeSigning: {
          authority: null,
          authorityReady: false,
          requiredPermission: "CanManageSccpRouteManifests",
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
        blockers: [
          { id: "production-requirements" },
          { id: "route-manager-authority" },
          { id: "runtime-signing-key" },
        ],
      },
      publishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      proofMaterialBundle: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: hex32("99"),
        includedArtifactCount: 16,
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-route-publication-request/v1",
    );
    expect(report.readyForRouteManagerReview).toBe(true);
    expect(report.productionRouteReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.reviewPackageHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.manifest).toMatchObject({
      present: true,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      routeIdentityReady: true,
      productionReadyForIsi: true,
    });
    expect(report.proofMaterialBundle).toMatchObject({
      readyForProofMaterialCeremony: true,
      bundleManifestSha256: hex32("99"),
      includedArtifactCount: 16,
    });
    expect(report.requiredRuntimeInputs).toMatchObject({
      requiredPermission: "CanManageSccpRouteManifests",
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyEnvPresent: false,
      privateKeyStoredInReport: false,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "production-requirements",
      "publish-readiness",
      "route-manifest-isi",
    ]);
    expect(
      report.blockers.find((blocker) => blocker.id === "route-manifest-isi"),
    ).toMatchObject({
      detail: expect.stringContaining("intentionally withheld"),
      blockedBy: ["production-requirements", "source-verifier-material"],
      artifactReady: false,
    });
    expect(report.upstreamBlockerIds).toEqual([
      "source-verifier-material",
      "production-requirements",
      "route-manager-authority",
      "runtime-signing-key",
    ]);
    expect(report.requiredPublicationAction).toMatchObject({
      kind: "UpsertSccpRouteManifest",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      reviewPackageHash: report.reviewPackageHash,
      routeManifestIsiReady: false,
      requiredPermission: "CanManageSccpRouteManifests",
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyStoredInReport: false,
    });
    expect(report.proposalDraft).toEqual(report.requiredPublicationAction);
    expect(report.nextActions).toEqual([
      "complete-governed-proof-material-and-production-manifest",
      "refresh-publish-readiness",
      "grant-taira-route-manager-access",
      "set-runtime-route-manager-private-key",
    ]);
    expect(report.nextActions).not.toContain(
      "build-production-route-manifest-isi",
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-governed-proof-material-and-production-manifest",
          command: report.commands.proofMaterialCeremonyPackage,
          requiredInputs: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
          validationCommands: [
            report.commands.proofMaterialCeremonyPackage,
            report.commands.publishReadiness,
          ],
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "publish-governed-solana-source-material",
            }),
          ]),
        }),
        expect.objectContaining({
          id: "set-runtime-route-manager-private-key",
          command: report.commands.publishRouteManifest,
          requiredInputs: ["SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY"],
        }),
      ]),
    );
    expect(report.commands.refresh).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publishReadiness).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publishRouteManifest).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
  });

  it("completes an exact-public route request without signer or ISI actions", () => {
    const manifestArtifactPath =
      "/reviewed/taira-solana-xor-route.manifest.json";
    const manifestArtifactSha256 = materialHex32(
      "already-published-route-request",
    );
    const report = buildSolanaRoutePublicationRequestReportBody({
      manifest: baseProductionManifest(),
      manifestPath: manifestArtifactPath,
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publishReadiness: {
        publicationSatisfied: true,
        submissionRequired: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: false,
          mcpTransactionTools: { ready: false },
        },
        routeManifestIsi: {
          ready: false,
          manifestArtifactPath,
          manifestArtifactSha256,
        },
        blockers: [],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "governed-proof-material" }],
        upstreamBlockerIds: ["production-requirements"],
      },
    });

    expect(report).toMatchObject({
      ready: true,
      readyForRouteManagerReview: true,
      productionRouteReady: true,
      publicationSatisfied: true,
      submissionRequired: false,
      readyToSubmitWithCurrentRuntime: false,
      blockers: [],
      upstreamBlockerIds: [],
      nextActions: [],
    });
    expect(report.diagnosticBlockerIds).toEqual(
      expect.arrayContaining([
        "proof-material-bundle",
        "taira-public-endpoint",
        "taira-mcp-transaction-tools",
        "production-requirements",
      ]),
    );
    expect(report.diagnosticUpstreamBlockerIds).toEqual(
      expect.arrayContaining([
        "source-verifier-material",
        "governed-proof-material",
      ]),
    );
    expect(report.requiredPublicationAction).toMatchObject({
      publicationSatisfied: true,
      submissionRequired: false,
      runtimeSigningRequired: false,
    });
  });

  it("preserves the reviewed manifest pin with custom route-manager env names", () => {
    const manifestArtifactPath = "/reviewed/custom-solana-route.json";
    const manifestArtifactSha256 = materialHex32(
      "custom-reviewed-route-manifest",
    );
    const report = buildSolanaRoutePublicationRequestReportBody({
      args: {
        "authority-env": "SCCP_CUSTOM_ROUTE_MANAGER_AUTHORITY",
        "private-key-env": "SCCP_CUSTOM_ROUTE_MANAGER_PRIVATE_KEY",
      },
      manifest: baseProductionManifest(),
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      publishReadiness: {
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: {
          ready: false,
          manifestArtifactPath,
          manifestArtifactSha256,
        },
        runtimeSigning: {
          authority: null,
          authorityEnv: "SCCP_CUSTOM_ROUTE_MANAGER_AUTHORITY",
          authorityEnvPresent: false,
          authoritySource: "missing",
          authorityReady: false,
          authorityFormatReady: false,
          requiredPermission: "CanManageSccpRouteManifests",
          privateKeyEnv: "SCCP_CUSTOM_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
        blockers: [
          { id: "route-manager-authority" },
          { id: "runtime-signing-key" },
        ],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: hex32("99"),
        includedArtifactCount: 16,
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.commands.publishRouteManifest).toEqual([
      "SCCP_CUSTOM_ROUTE_MANAGER_PRIVATE_KEY=<runtime-only-private-key-hex>",
      "SCCP_CUSTOM_ROUTE_MANAGER_AUTHORITY=<taira-route-manager-account-id>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-route-manifest",
      "--submit",
      "true",
      "--manifest",
      manifestArtifactPath,
      "--expected-manifest-sha256",
      manifestArtifactSha256,
      "--private-key-env",
      "SCCP_CUSTOM_ROUTE_MANAGER_PRIVATE_KEY",
      "--authority-env",
      "SCCP_CUSTOM_ROUTE_MANAGER_AUTHORITY",
    ]);
    expectExactManifestPin(
      report.commands.publishRouteManifest,
      manifestArtifactPath,
      manifestArtifactSha256,
    );
  });

  it("carries explicit public-node repair commands into route publication requests", () => {
    const report = buildSolanaRoutePublicationRequestReportBody({
      args: {
        authority: "<taira-route-manager-account-id>",
      },
      manifest: baseProductionManifest(),
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [],
      },
      publishReadiness: {
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          publicationTargetReady: false,
          target: {
            targetKind: "taira-convenience-root",
            canonicalRolloutTargetReady: false,
          },
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: { ready: false },
        runtimeSigning: {
          authorityReady: false,
          privateKeyEnv: "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
          privateKeyStoredInReport: false,
        },
        blockers: [{ id: "taira-explicit-public-node-target" }],
        nextActionDetails: [
          {
            id: "provide-explicit-taira-public-node-target",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "publish-readiness",
              "--torii-url",
              "https://<taira-public-node-root>",
              "--mcp-url",
              "https://<taira-public-node-root>/v1/mcp",
            ],
            delegatedActions: [
              {
                id: "publish-direct-validator-dns-records",
                command: ["dig", "+short", "taira-validator-1.sora.org"],
              },
            ],
          },
        ],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: hex32("99"),
        blockers: [],
        upstreamBlockerIds: ["publish-readiness"],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.nextActions).toContain(
      "provide-explicit-taira-public-node-target",
    );
    expect(report.nextActions).not.toContain(
      "taira-explicit-public-node-target",
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "provide-explicit-taira-public-node-target",
          command: [
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "publish-readiness",
            "--torii-url",
            "https://<taira-public-node-root>",
            "--mcp-url",
            "https://<taira-public-node-root>/v1/mcp",
          ],
          delegatedActions: [
            expect.objectContaining({
              id: "publish-direct-validator-dns-records",
              command: ["dig", "+short", "taira-validator-1.sora.org"],
            }),
          ],
          requiredInputIds: [
            "taira-public-node-root-url",
            "taira-public-node-mcp-url",
          ],
        }),
      ]),
    );
  });

  it("keeps Solana route-publication review hashes stable across timestamp-only report refreshes", () => {
    const buildReport = (checkedAt) =>
      buildSolanaRoutePublicationRequestReportBody({
        manifest: baseProductionManifest(),
        manifestPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
        productionRequirements: {
          checkedAt,
          readyToBuildIsi: false,
          blockers: [{ id: "source-verifier-material" }],
        },
        publishReadiness: {
          checkedAt,
          readyForRuntimeSigner: false,
          readyToSubmitWithCurrentRuntime: false,
          publicEndpoint: {
            endpointReady: true,
            mcpTransactionTools: { ready: true },
          },
          routeManifestIsi: { ready: false },
          blockers: [
            { id: "production-requirements" },
            { id: "runtime-signing-key" },
          ],
        },
        proofMaterialBundle: {
          readyForProofMaterialCeremony: true,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          bundleManifestSha256: materialHex32("proof-bundle"),
          blockers: [],
          upstreamBlockerIds: ["production-requirements"],
        },
        checkedAt,
      });

    const first = buildReport("2026-07-05T00:00:00.000Z");
    const second = buildReport("2026-07-05T01:00:00.000Z");

    expect(second.reviewPackageHash).toBe(first.reviewPackageHash);
    expect(first.reviewHashPolicy).toMatchObject({
      volatileJsonFieldsIgnored: ["checkedAt", "checked_at"],
    });
  });

  it("summarizes Solana smoke-readiness for deployment video transcripts", () => {
    const summary = summarizeSolanaSmokeReadinessForTranscript({
      smokeReadinessPath: "output/sccp-solana-smoke-readiness/latest.json",
      smokeReadiness: {
        schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
        ready: false,
        routeId: "taira_sol_xor",
        assetKey: "xor",
        checks: [
          {
            id: "route-preflight",
            status: "fail",
            detail: "Public TAIRA Solana route preflight is not ready.",
          },
          {
            id: "walletconnect-project-id",
            status: "fail",
            detail: "WalletConnect missing",
            evidence: {
              configured: false,
              projectId: "project-123",
              valueStoredInReport: false,
            },
          },
          {
            id: "destination-prover-module-url",
            status: "pass",
            detail: "configured",
          },
          {
            id: "source-prover-module-url",
            status: "fail",
            detail: "productionProofsReady must be true",
          },
        ],
        nextActions: [
          { id: "refresh-solana-route-preflight" },
          { id: "configure-solana-walletconnect" },
          { id: "publish-solana-prover-modules" },
        ],
        missingProductionInputs: [
          { id: "solana-public-route-report" },
          { id: "walletconnect-project-id" },
          { id: "solana-source-browser-prover-module" },
        ],
      },
    });

    expect(summary).toEqual({
      present: true,
      path: "output/sccp-solana-smoke-readiness/latest.json",
      checkedAt: null,
      ready: false,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      failedChecks: [
        {
          id: "route-preflight",
          status: "fail",
          detail: "Public TAIRA Solana route preflight is not ready.",
          configuredSource: null,
        },
        {
          id: "walletconnect-project-id",
          status: "fail",
          detail: "WalletConnect missing",
          configuredSource: null,
        },
        {
          id: "source-prover-module-url",
          status: "fail",
          detail: "productionProofsReady must be true",
          configuredSource: null,
        },
      ],
      blockerIds: [
        "solana-public-route-report",
        "walletconnect-project-id",
        "solana-source-browser-prover-module",
      ],
      nextActionIds: [
        "refresh-solana-route-preflight",
        "configure-solana-walletconnect",
        "publish-solana-prover-modules",
      ],
      missingProductionInputIds: [
        "solana-public-route-report",
        "walletconnect-project-id",
        "solana-source-browser-prover-module",
      ],
      walletConnectConfigured: false,
      destinationProverReady: true,
      sourceProverReady: false,
    });
    expect(JSON.stringify(summary)).not.toContain("project-123");
  });

  it("summarizes Solana prover hashes for deployment video subtitles", () => {
    const destinationModule = materialHex32("destination-module");
    const destinationSidecar = materialHex32("destination-sidecar");
    const sourceModule = materialHex32("source-module");
    const sourceSidecar = materialHex32("source-sidecar");
    const summary = buildSolanaProverSubtitleEvidence({
      destination: {
        actualModuleHash: destinationModule,
        sidecarHash: destinationSidecar,
      },
      source: {
        moduleHash: sourceModule,
        sidecarHash: sourceSidecar,
      },
    });

    expect(summary).toBe(
      `Destination module ${destinationModule.slice(0, 10)}...${destinationModule.slice(-8)}, sidecar ${destinationSidecar.slice(0, 10)}...${destinationSidecar.slice(-8)}; source module ${sourceModule.slice(0, 10)}...${sourceModule.slice(-8)}, sidecar ${sourceSidecar.slice(0, 10)}...${sourceSidecar.slice(-8)}`,
    );
  });

  it("keeps Solana deployment video recipient subtitles readable", () => {
    const asciiRecipient = "testu7cPg4xDummyReadableRecipient";
    const i105Recipient = `testu${String.fromCharCode(0xff9b)}1PC${String.fromCharCode(0xff94)}`;

    expect(buildSolanaRecipientSubtitleEvidence(asciiRecipient)).toBe(
      asciiRecipient,
    );
    const summary = buildSolanaRecipientSubtitleEvidence(i105Recipient);
    expect(summary).toMatch(
      /^testu I105 recipient fingerprint 0x[0-9a-f]{8}\.\.\.[0-9a-f]{8}$/u,
    );
    expect(summary).not.toContain(String.fromCharCode(0xff9b));
    expect(summary).not.toContain(String.fromCharCode(0xff94));
  });

  it("keeps blocked Solana source-burn video subtitles honest", () => {
    expect(
      buildSolanaSourceBurnSubtitleEvidence({
        submitted: false,
        sourceTokenAddress: null,
        amountBaseUnits: "1",
        blockerIds: ["token-mint-supply", "source-token-balance"],
      }),
    ).toBe(
      "Source burn not submitted; token unavailable; amount 1 base units. Blockers: token-mint-supply, source-token-balance.",
    );

    expect(
      buildSolanaSourceBurnSubtitleEvidence({
        submitted: true,
        signature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
        sourceTokenAddress: "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad",
        amountBaseUnits: "25",
      }),
    ).toBe(
      "Submitted real Solana source burn 5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm from token BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad for 25 base units.",
    );
  });

  it("labels Solana deployment video program mutability from canonical role evidence", async () => {
    const { report } = await captureAtomicReadbackFixture();
    const upgradeableRole = solanaFinalizedReadbackRoleEvidence(
      report,
      "outerVerifier",
    );
    const immutableRole = {
      ...upgradeableRole,
      authority: "none",
      raw: {
        ...upgradeableRole.raw,
        authority: "none",
        immutable: true,
      },
    };

    expect(solanaProgramDeploymentModeLabel(immutableRole)).toBe("immutable");
    expect(solanaProgramDeploymentModeLabel(upgradeableRole)).toBe(
      "upgradeable staging",
    );
    expect(solanaProgramDeploymentModeLabel(null)).toBe("unverified");
  });

  it("verifies Solana deployment MP4 media streams for transcript evidence", () => {
    const report = buildSolanaDeploymentVideoMediaVerification({
      ffprobe: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "subtitle", codec_name: "mov_text" },
        ],
        format: { duration: "149.994000" },
      },
      subtitleSummary: {
        cueCount: 25,
        numberedStepCount: 24,
        includesBlockedStatus: true,
      },
    });

    expect(report).toMatchObject({
      ready: true,
      durationSeconds: 149.994,
      streams: {
        video: { present: true, codec: "h264", width: 1280, height: 720 },
        audio: { present: true, codec: "aac" },
        subtitle: { present: true, codec: "mov_text" },
      },
      subtitleCueCount: 25,
      numberedStepCount: 24,
      includesBlockedStatus: true,
      blockers: [],
    });
  });

  it("exposes root blocker IDs for Solana deployment video reports", () => {
    const status = buildSolanaDeploymentVideoRootStatus({
      smokeReadinessSummary: {
        failedChecks: [
          { id: "route-preflight" },
          { id: "walletconnect-project-id" },
          { id: "destination-prover-module-url" },
          { id: "source-prover-module-url" },
        ],
        blockerIds: [
          "solana-public-route-report",
          "walletconnect-project-id",
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
      },
      reports: [
        {
          blockers: [{ id: "production-requirements" }],
          upstreamBlockerIds: ["browser-prover-readiness"],
        },
        {
          blockerIds: ["route-manager-authority"],
          productionBlockers: [{ id: "governed-proof-material" }],
        },
        {
          blockers: [
            { id: "program-finalization-fail-closed-sentinel" },
            { id: "program-finalization-code-hash" },
          ],
        },
      ],
      extraBlockerIds: ["destination-prover-readiness"],
    });

    expect(status.failedCheckIds).toEqual(["walletconnect-project-id"]);
    expect(status.blockerIds).toEqual([
      "walletconnect-project-id",
      "solana-public-route-report",
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
      "production-requirements",
      "browser-prover-readiness",
      "route-manager-authority",
      "governed-proof-material",
      "program-finalization-fail-closed-sentinel",
      "program-finalization-code-hash",
      "destination-prover-readiness",
    ]);
    expect(status.failedCheckIds).not.toContain("route-preflight");
    expect(status.failedCheckIds).not.toContain(
      "destination-prover-module-url",
    );
    expect(status.failedCheckIds).not.toContain("source-prover-module-url");
    expect(status.blockerIds).not.toContain("route-preflight");
    expect(status.blockerIds).not.toContain("destination-prover-module-url");
    expect(status.blockerIds).not.toContain("source-prover-module-url");
  });

  it("falls back to raw smoke blockers when root causes are not present", () => {
    const status = buildSolanaDeploymentVideoRootStatus({
      smokeReadinessSummary: {
        failedChecks: [{ id: "walletconnect-project-id" }],
        blockerIds: ["route-preflight"],
      },
      reports: [
        {
          blockers: [{ id: "production-requirements" }],
        },
      ],
    });

    expect(status.failedCheckIds).toEqual(["walletconnect-project-id"]);
    expect(status.blockerIds).toEqual([
      "walletconnect-project-id",
      "route-preflight",
      "production-requirements",
    ]);
  });

  it("fails Solana deployment MP4 media verification without subtitle evidence", () => {
    const report = buildSolanaDeploymentVideoMediaVerification({
      ffprobe: {
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "149.994000" },
      },
      subtitleSummary: {
        cueCount: 0,
        numberedStepCount: 0,
        includesBlockedStatus: false,
      },
    });

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([
      "subtitle-stream",
      "subtitle-cues",
      "numbered-steps",
      "blocked-status-cue",
    ]);
  });

  it("summarizes Solana evidence refresh MP4 embedded subtitle tracks", () => {
    const mediaVerification = buildSolanaEvidenceRefreshMediaVerification({
      deploymentVideo: {
        videoPath: "output/sccp-solana-deploy/sccp-solana-deployment-video.mp4",
        transcriptPath:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.json",
        subtitlesPath:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.vtt",
      },
      deploymentVideoTranscript: {
        mediaVerification: {
          ready: true,
          durationSeconds: 149.994,
          streams: {
            video: {
              present: true,
              codec: "h264",
              width: 1280,
              height: 720,
            },
            audio: { present: true, codec: "aac" },
            subtitle: { present: true, codec: "mov_text" },
          },
          subtitleCueCount: 25,
          numberedStepCount: 24,
          includesBlockedStatus: true,
          blockers: [],
        },
      },
      liveVideo: {
        ready: false,
        videoPath:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
        transcriptPath:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
        subtitlesPath:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
      },
      liveVideoTranscript: {
        diagnosticVideoOnly: true,
        notLiveTransferEvidence: true,
        mediaVerification: {
          ready: true,
          durationSeconds: 80,
          streams: {
            video: {
              present: true,
              codec: "h264",
              width: 1280,
              height: 720,
            },
            audio: { present: true, codec: "aac" },
            subtitle: { present: true, codec: "mov_text" },
          },
          subtitleCueCount: 14,
          numberedStepCount: 14,
          blockers: [],
        },
      },
    });

    expect(mediaVerification).toMatchObject({
      deploymentVideo: {
        ready: true,
        mp4SubtitleTrackReady: true,
        streams: {
          video: { present: true, codec: "h264", width: 1280, height: 720 },
          audio: { present: true, codec: "aac" },
          subtitle: { present: true, codec: "mov_text" },
        },
        subtitleCueCount: 25,
        numberedStepCount: 24,
        includesBlockedStatus: true,
        blockers: [],
      },
      liveVideo: {
        ready: true,
        mp4SubtitleTrackReady: true,
        diagnosticVideoOnly: true,
        notLiveTransferEvidence: true,
        streams: {
          video: { present: true, codec: "h264", width: 1280, height: 720 },
          audio: { present: true, codec: "aac" },
          subtitle: { present: true, codec: "mov_text" },
        },
        subtitleCueCount: 14,
        numberedStepCount: 14,
        blockers: [],
      },
    });
  });

  it("does not mark a draft Solana route manifest ready for route-manager review", () => {
    const report = buildSolanaRoutePublicationRequestReportBody({
      manifest: {
        ...baseProductionManifest(),
        production_ready: false,
        productionReady: false,
        disabledReason: "governed proof material is still pending",
      },
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: {
          ready: false,
          error:
            "Production Solana route manifest must not include manifest.disabledReason.",
        },
        blockers: [{ id: "production-requirements" }],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
    });

    expect(report.readyForRouteManagerReview).toBe(false);
    expect(report.manifest).toMatchObject({
      routeIdentityReady: true,
      productionReady: false,
      productionReadyForIsi: false,
      error:
        "Production Solana route manifest must not include manifest.disabledReason.",
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining(["route-manifest-production-shape"]),
    );
    expect(report.blockerIds).toEqual(
      expect.arrayContaining(["route-manifest-production-shape"]),
    );
  });

  it("routes route-publication upstream production blockers to governed material completion", () => {
    const rawProductionBlockers = [
      "post-deploy-live-evidence-hashes",
      "destination-verifier-enforcement",
      "verifier-linkage-readiness",
      "program-finalization-readiness",
      "observed-post-deploy-evidence",
      "production-material-inventory",
      "proof-material-request",
      "source-material-handoff",
      "source-material-handoff-verification",
    ];
    const bundleProductionBlockers = [
      "governed-proof-material",
      "missing-production-artifacts",
    ];
    const report = buildSolanaRoutePublicationRequestReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
      },
      manifest: baseProductionManifest(),
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: rawProductionBlockers.map((id) => ({ id })),
        nextActionDetails: [
          {
            id: "render-reviewed-solana-post-deploy-full-toml",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "post-deploy-full-toml",
            ],
          },
          {
            id: "link-solana-native-recursive-verifier",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "verifier-linkage-readiness",
            ],
          },
        ],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: { ready: false },
        blockers: [{ id: "production-requirements" }],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        bundleManifestSha256: materialHex32("proof-bundle"),
        upstreamBlockerIds: rawProductionBlockers,
        productionBlockers: bundleProductionBlockers.map((id) => ({ id })),
      },
    });

    expect(report.nextActions).toContain(
      "complete-governed-proof-material-and-production-manifest",
    );
    for (const id of [...rawProductionBlockers, ...bundleProductionBlockers]) {
      expect(report.nextActions).not.toContain(id);
    }
    expect(report.upstreamBlockerIds).toEqual(
      expect.arrayContaining(bundleProductionBlockers),
    );
    expect(report.proofMaterialBundle?.productionBlockerIds).toEqual(
      bundleProductionBlockers,
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-governed-proof-material-and-production-manifest",
          command: report.commands.proofMaterialCeremonyPackage,
          blockedBy: expect.arrayContaining(
            [...rawProductionBlockers, ...bundleProductionBlockers].map((id) =>
              expect.objectContaining({ id }),
            ),
          ),
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "render-reviewed-solana-post-deploy-full-toml",
            }),
            expect.objectContaining({
              id: "link-solana-native-recursive-verifier",
            }),
          ]),
        }),
      ]),
    );
  });

  it("builds a non-secret Solana route-manager access request from publish readiness", () => {
    const routePublicationRequest =
      buildSolanaRoutePublicationRequestReportBody({
        args: {
          authority: ROUTE_MANAGER_AUTHORITY,
          "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        },
        manifest: baseProductionManifest(),
        manifestPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
        productionRequirements: {
          checkedAt: "2026-07-05T00:00:00.000Z",
          readyToBuildIsi: false,
          blockers: [{ id: "source-verifier-material" }],
        },
        productionRequirementsPath:
          "output/sccp-solana-deploy/taira-solana-xor-production-requirements.json",
        publishReadiness: {
          checkedAt: "2026-07-05T00:00:00.000Z",
          readyForRuntimeSigner: false,
          readyToSubmitWithCurrentRuntime: false,
          publicEndpoint: {
            endpointReady: true,
            mcpTransactionTools: {
              ready: true,
              publicationMode: "signed-transaction-body-base64",
            },
          },
          routeManifestIsi: { ready: false },
          runtimeSigning: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            requiredPermission: "CanManageSccpRouteManifests",
            permissionAudit: {
              checked: true,
              ready: false,
              hasRequiredPermission: false,
              permissions: [],
              error: null,
            },
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: false,
            privateKeyStoredInReport: false,
          },
          blockers: [
            { id: "production-requirements" },
            { id: "route-manager-permission" },
            { id: "runtime-signing-key" },
          ],
        },
        publishReadinessPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
        proofMaterialBundle: {
          readyForProofMaterialCeremony: true,
          productionRouteReady: false,
          bundleManifestSha256: hex32("77"),
          upstreamBlockerIds: ["production-requirements"],
        },
        proofMaterialBundlePath:
          "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
        checkedAt: "2026-07-05T00:00:00.000Z",
      });
    const report = buildSolanaRouteManagerAccessRequestReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      routePublicationRequest,
      routePublicationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route-publication-request.json",
      publishReadiness: routePublicationRequest.publishReadiness,
      publishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      productionRequirementsPath:
        "output/sccp-solana-deploy/taira-solana-xor-production-requirements.json",
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        bundleManifestSha256: hex32("77"),
        upstreamBlockerIds: ["production-requirements"],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-route-manager-access-request/v1",
    );
    expect(report.readyForOperatorReview).toBe(true);
    expect(report.accessReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.requestHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.requiredRouteManager).toMatchObject({
      authority: ROUTE_MANAGER_AUTHORITY,
      requiredPermission: "CanManageSccpRouteManifests",
      hasRequiredPermission: false,
    });
    expect(report.runtimeSigning).toEqual({
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyEnvPresent: false,
      privateKeyStoredInReport: false,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manager-permission",
      "runtime-signing-key",
      "production-route-material",
    ]);
    expect(report.blockerIds).toEqual([
      "route-manager-permission",
      "runtime-signing-key",
      "production-route-material",
    ]);
    expect(report.requiredAccessAction).toMatchObject({
      kind: "GrantRouteManagerAccess",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      requestHash: report.requestHash,
      authority: ROUTE_MANAGER_AUTHORITY,
      requiredPermission: "CanManageSccpRouteManifests",
      hasRequiredPermission: false,
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyStoredInReport: false,
    });
    expect(report.proposalDraft).toEqual(report.requiredAccessAction);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "complete-governed-proof-material-and-production-manifest",
        "grant-taira-route-manager-access",
        "set-runtime-route-manager-private-key",
        "refresh-publish-readiness",
        "refresh-route-publication-request",
      ]),
    );
    expect(report.nextActions).not.toContain("route-manifest-production-shape");
    expect(report.nextActions).not.toContain("source-verifier-material");
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-governed-proof-material-and-production-manifest",
          command: report.commands.proofMaterialCeremonyPackage,
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "publish-governed-solana-source-material",
            }),
          ]),
        }),
        expect.objectContaining({
          id: "grant-taira-route-manager-access",
          command: report.commands.verifyAccess,
          requiredInputs: [
            "taira-route-manager-i105-account",
            "CanManageSccpRouteManifests",
          ],
        }),
        expect.objectContaining({
          id: "set-runtime-route-manager-private-key",
          command: report.commands.publishRouteManifest,
          requiredInputs: ["SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY"],
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("routes route-manager proof-material bundle blockers to governed material completion", () => {
    const report = buildSolanaRouteManagerAccessRequestReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [],
        upstreamBlockerIds: ["proof-material-bundle"],
      },
      publishReadiness: {
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          permissionAudit: {
            checked: true,
            hasRequiredPermission: true,
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
        blockers: [],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [],
      },
      proofMaterialBundle: {
        productionRouteReady: false,
        bundleManifestSha256: materialHex32("proof-bundle"),
        upstreamBlockerIds: ["proof-material-bundle"],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.nextActions).toContain(
      "complete-governed-proof-material-and-production-manifest",
    );
    expect(report.nextActions).not.toContain("proof-material-bundle");
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-governed-proof-material-and-production-manifest",
          command: report.commands.proofMaterialCeremonyPackage,
          blockedBy: expect.arrayContaining([
            expect.objectContaining({ id: "proof-material-bundle" }),
            expect.objectContaining({ id: "production-route-material" }),
          ]),
        }),
      ]),
    );
  });

  it("keeps Solana route-manager access hashes stable across timestamp-only report refreshes", () => {
    const buildReport = (checkedAt) =>
      buildSolanaRouteManagerAccessRequestReportBody({
        args: {
          authority: ROUTE_MANAGER_AUTHORITY,
          "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        },
        routePublicationRequest: {
          checkedAt,
          readyForRouteManagerReview: true,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          reviewPackageHash: materialHex32("route-publication"),
          blockers: [{ id: "production-requirements" }],
          upstreamBlockerIds: ["source-verifier-material"],
        },
        publishReadiness: {
          checkedAt,
          readyForRuntimeSigner: false,
          readyToSubmitWithCurrentRuntime: false,
          publicEndpoint: {
            endpointReady: true,
            mcpTransactionTools: { ready: true },
          },
          runtimeSigning: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            authorityFormatReady: true,
            permissionAudit: {
              ready: false,
              hasRequiredPermission: false,
              permissions: [],
            },
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: false,
          },
          blockers: [
            { id: "production-requirements" },
            { id: "runtime-signing-key" },
          ],
        },
        productionRequirements: {
          checkedAt,
          readyToBuildIsi: false,
          blockers: [{ id: "source-verifier-material" }],
        },
        proofMaterialBundle: {
          checkedAt,
          readyForProofMaterialCeremony: true,
          productionRouteReady: false,
          bundleManifestSha256: materialHex32("proof-bundle"),
          upstreamBlockerIds: ["production-requirements"],
        },
        checkedAt,
      });

    const first = buildReport("2026-07-05T00:00:00.000Z");
    const second = buildReport("2026-07-05T01:00:00.000Z");

    expect(second.requestHash).toBe(first.requestHash);
    expect(first.requestHashPolicy).toMatchObject({
      volatileJsonFieldsIgnored: ["checkedAt", "checked_at"],
    });
  });

  it("passes refresh-evidence runtime inputs through to Solana smoke-readiness only", () => {
    const options = buildSolanaEvidenceRefreshSmokeReadinessOptions({
      args: {
        "manifest-file": "/tmp/taira-solana-xor-route.manifest.json",
        "walletconnect-project-id": "0123456789abcdef0123456789abcdef",
        "destination-prover-module-url":
          "/sccp-solana/taira-solana-xor-destination-prover.js",
        "source-prover-module-url":
          "/sccp-solana/taira-solana-xor-source-prover.js",
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      paths: {
        smokeReadiness: "/tmp/sccp-solana-smoke-readiness/latest.json",
      },
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: false,
    });

    expect(options).toEqual({
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      outputDir: "/tmp/sccp-solana-smoke-readiness",
      manifestFile: "/tmp/taira-solana-xor-route.manifest.json",
      skipSolanaRpc: false,
      walletConnectProjectId: "0123456789abcdef0123456789abcdef",
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
    });
    expect(JSON.stringify(options)).not.toContain(
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    );
  });

  it("omits absent Solana smoke-readiness runtime inputs so bundled defaults can load", () => {
    const options = buildSolanaEvidenceRefreshSmokeReadinessOptions({
      args: {
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      paths: {
        smokeReadiness: "/tmp/sccp-solana-smoke-readiness/latest.json",
      },
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: true,
    });

    expect(options).toEqual({
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      outputDir: "/tmp/sccp-solana-smoke-readiness",
      skipSolanaRpc: true,
    });
    expect(options).not.toHaveProperty("walletConnectProjectId");
    expect(options).not.toHaveProperty("destinationProverModuleUrl");
    expect(options).not.toHaveProperty("sourceProverModuleUrl");
    expect(JSON.stringify(options)).not.toContain(
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    );
  });

  it("keeps Solana RPC skipped refresh reports fail-closed", () => {
    const manifest = baseProductionManifest();
    const args = { "solana-rpc-url": "https://api.testnet.solana.com" };
    const postDeploy = buildSkippedSolanaPostDeployEvidenceReportBody({
      args,
      manifest,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });
    const verifier = buildSkippedSolanaVerifierLinkageReadinessReportBody({
      args,
      manifest,
      checkedAt: "2026-07-08T00:00:00.000Z",
    });
    const sourceBurn = buildSkippedSolanaSourceBurnReadinessReportBody({
      args,
      manifest,
      ownerAddress: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
      checkedAt: "2026-07-08T00:00:00.000Z",
    });
    const handoffVerification =
      buildSkippedSolanaSourceMaterialHandoffVerificationReportBody({
        handoff: {
          schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
          productionProofMaterialIncluded: false,
          observedPins: {
            verifierProgramId: manifest.solana_verifier_program_id,
            bridgeProgramId: manifest.solana_program_id,
            sourceBridgeProgramId: manifest.sccp_solana_source_bridge_address,
            tokenMintAddress: manifest.solana_token_mint,
            verifierStateAddress: manifest.solana_verifier_state_address,
            sourceStateAddress: manifest.solana_source_state_address,
          },
        },
        solanaRpcUrl: args["solana-rpc-url"],
        checkedAt: "2026-07-08T00:00:00.000Z",
      });

    expect(postDeploy).toMatchObject({
      solanaRpcSkipped: true,
      liveReadbackReady: false,
    });
    expect(postDeploy.blockerIds).toContain("token-mint-readback");
    expect(verifier).toMatchObject({
      solanaRpcSkipped: true,
      ready: false,
    });
    expect(verifier.blockerIds).toContain("solana-verifier-live-readback");
    expect(sourceBurn).toMatchObject({
      solanaRpcSkipped: true,
      readyToSubmitBurn: false,
    });
    expect(sourceBurn.blockerIds).toEqual(
      expect.arrayContaining([
        "token-mint-readback",
        "source-state-readback",
        "source-token-account",
      ]),
    );
    expect(handoffVerification).toMatchObject({
      solanaRpcSkipped: true,
      ready: false,
    });
    expect(handoffVerification.blockerIds).toContain(
      "verifier-program-account",
    );
    const resolution = buildSolanaBlockerResolution([
      ...postDeploy.blockerIds,
      ...sourceBurn.blockerIds,
      ...handoffVerification.blockerIds,
      "source-material-handoff-artifact-consistency",
      "production-gate:source-material-handoff-artifact-consistency",
    ]);
    expect(resolution.unknownBlockerIds).toEqual([]);
    expect(resolution.liveEvidenceBlockerIds).toEqual(
      expect.arrayContaining([
        "token-mint-readback",
        "source-state-readback",
        "source-token-account",
        "verifier-program-account",
        "source-material-handoff-artifact-consistency",
        "production-gate:source-material-handoff-artifact-consistency",
      ]),
    );
  });

  it("defaults Solana smoke-readiness under the active deployment output directory", () => {
    const paths = solanaDeployArtifactPaths({
      "output-dir": "/tmp/sccp-solana-mintpath-deploy",
    });
    const overridden = solanaDeployArtifactPaths({
      "output-dir": "/tmp/sccp-solana-mintpath-deploy",
      "smoke-readiness": "/tmp/shared-solana-smoke/latest.json",
    });

    expect(paths.smokeReadiness).toBe(
      "/tmp/sccp-solana-mintpath-deploy/smoke-readiness/latest.json",
    );
    expect(overridden.smokeReadiness).toBe(
      "/tmp/shared-solana-smoke/latest.json",
    );
  });

  it("routes Solana finish gates to the active deployment output artifacts", () => {
    const paths = {
      outputDir: "/tmp/sccp-solana-mintpath-deploy",
      productionRequirements:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-production-requirements.json",
      postDeployEvidence:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-post-deploy-evidence.json",
      proverReadiness:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-prover-readiness.json",
      productionMaterialInventory:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-production-material-inventory.json",
      routeManifest:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-route.manifest.json",
      routeManifestPublishReadiness:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-route.publish-readiness.json",
      routeManifestPublishBlocked:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-route.publish-blocked.json",
      routePublicationRequest:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-route-publication-request.json",
      routeManagerAccessRequest:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-route-manager-access-request.json",
      operatorHandoff:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-operator-handoff.json",
      activationPackage:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-activation-package.json",
      laneActivationRequest:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-lane-activation-request.json",
      laneActivationProposal:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-lane-activation-proposal.json",
      sourceMaterialHandoff:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-source-material-handoff.json",
      sourceMaterialHandoffVerification:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-source-material-handoff.verification.json",
      sourceBurnReadiness:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-source-burn-readiness.json",
      sourceBurnSubmission:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-source-burn.submission.json",
      proofMaterialRequest:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-proof-material-request.json",
      proofMaterialBundle:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-proof-material-bundle.json",
      proofMaterialCeremonyPackage:
        "/tmp/sccp-solana-mintpath-deploy/taira-solana-xor-proof-material-ceremony-package.json",
      smokeReadiness:
        "/tmp/sccp-solana-mintpath-deploy/smoke-readiness/latest.json",
      deploymentVideoTranscript:
        "/tmp/sccp-solana-mintpath-deploy/sccp-solana-deployment-video.json",
      deploymentVideoMp4:
        "/tmp/sccp-solana-mintpath-deploy/sccp-solana-deployment-video.mp4",
      deploymentVideoSubtitles:
        "/tmp/sccp-solana-mintpath-deploy/sccp-solana-deployment-video.vtt",
      liveVideoTranscript:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video.json",
      liveVideoMp4:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video.mp4",
      liveVideoSubtitles:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video.vtt",
      blockedLiveVideoTranscript:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video-blocked.json",
      blockedLiveVideoMp4:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video-blocked.mp4",
      blockedLiveVideoSubtitles:
        "/tmp/sccp-solana-mintpath-deploy/live-video/sccp-solana-live-video-blocked.vtt",
    };
    const args = {
      "fetch-timeout-ms": "1000",
      "fetch-attempts": "1",
      manifest: "/tmp/reviewed-solana-route.manifest.json",
      "expected-route-publication-request-sha256":
        materialHex32("gate-publication"),
      "expected-route-manager-access-request-sha256":
        materialHex32("gate-access"),
      "expected-lane-activation-request-sha256":
        materialHex32("gate-lane-request"),
      "expected-lane-activation-proposal-sha256":
        materialHex32("gate-lane-proposal"),
      "expected-operator-handoff-sha256": materialHex32("gate-operator"),
      "expected-activation-package-sha256": materialHex32("gate-activation"),
    };

    const productionGateOptions = buildSolanaProductionGateOptions({
      args,
      paths,
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: true,
    });
    const liveVideoOptions = buildSolanaLiveVideoGateOptions({
      args,
      paths,
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: true,
      productionGatePath:
        "/tmp/sccp-solana-mintpath-deploy/production-gate/sccp-solana-production-gate.json",
    });

    expect(productionGateOptions).toMatchObject({
      outputDir: "/tmp/sccp-solana-mintpath-deploy/production-gate",
      deployDir: "/tmp/sccp-solana-mintpath-deploy",
      fetchTimeoutMs: "1000",
      fetchAttempts: "1",
      requirements: paths.productionRequirements,
      routeManifest: "/tmp/reviewed-solana-route.manifest.json",
      publishReadiness: paths.routeManifestPublishReadiness,
      routePublishBlocked: paths.routeManifestPublishBlocked,
      routePublicationRequest: paths.routePublicationRequest,
      routePublicationRequestSha256:
        args["expected-route-publication-request-sha256"],
      routeManagerAccess: paths.routeManagerAccessRequest,
      routeManagerAccessSha256:
        args["expected-route-manager-access-request-sha256"],
      laneActivationRequestSha256:
        args["expected-lane-activation-request-sha256"],
      laneActivationProposalSha256:
        args["expected-lane-activation-proposal-sha256"],
      operatorHandoffSha256: args["expected-operator-handoff-sha256"],
      activationPackage: paths.activationPackage,
      activationPackageSha256: args["expected-activation-package-sha256"],
      smokeReadiness: paths.smokeReadiness,
      deploymentVideoMp4: paths.deploymentVideoMp4,
      liveVideoTranscript: paths.liveVideoTranscript,
      liveVideoMp4: paths.liveVideoMp4,
      liveVideoVtt: paths.liveVideoSubtitles,
      blockedLiveVideoTranscript: paths.blockedLiveVideoTranscript,
      blockedLiveVideoMp4: paths.blockedLiveVideoMp4,
      blockedLiveVideoVtt: paths.blockedLiveVideoSubtitles,
    });
    expect(liveVideoOptions).toMatchObject({
      outputDir: "/tmp/sccp-solana-mintpath-deploy/live-video",
      fetchTimeoutMs: "1000",
      fetchAttempts: "1",
      productionRequirements: paths.productionRequirements,
      publishReadiness: paths.routeManifestPublishReadiness,
      routePublicationRequest: paths.routePublicationRequest,
      smokeReadiness: paths.smokeReadiness,
      activationPackage: paths.activationPackage,
      operatorHandoff: paths.operatorHandoff,
      productionGate:
        "/tmp/sccp-solana-mintpath-deploy/production-gate/sccp-solana-production-gate.json",
    });
    expect(JSON.stringify(productionGateOptions)).not.toContain(
      "output/sccp-solana-deploy",
    );
    expect(JSON.stringify(liveVideoOptions)).not.toContain(
      "output/sccp-solana-deploy",
    );

    const successLiveVideoOptions = buildSolanaLiveVideoGateOptions({
      args: {
        ...args,
        "live-evidence": "/tmp/live-bidirectional-evidence.json",
      },
      paths,
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: false,
      productionGatePath: "/tmp/attacker-production-gate.json",
      productionGateArtifactSha256: materialHex32("pre-live-gate"),
      preflightReport: "/tmp/attacker-preflight.json",
    });
    expect(successLiveVideoOptions).toEqual({
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      outputDir: "/tmp/sccp-solana-mintpath-deploy/live-video",
      fetchTimeoutMs: "1000",
      fetchAttempts: "1",
      productionGateSnapshot: "/tmp/attacker-production-gate.json",
      productionGateSnapshotSha256: materialHex32("pre-live-gate"),
      liveEvidence: "/tmp/live-bidirectional-evidence.json",
      skipSolanaRpc: false,
    });
    expect(successLiveVideoOptions).not.toHaveProperty("preflightReport");
    expect(successLiveVideoOptions).not.toHaveProperty("productionGate");
    expect(successLiveVideoOptions).not.toHaveProperty(
      "productionRequirements",
    );

    const diagnosticWithEvidence = buildSolanaLiveVideoGateOptions({
      args: {
        ...args,
        "live-evidence": "/tmp/untrusted-diagnostic-evidence.json",
      },
      paths,
      toriiUrl: "https://taira.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: false,
      productionGatePath: "/tmp/diagnostic-production-gate.json",
      preflightReport: "/tmp/diagnostic-preflight.json",
    });
    expect(diagnosticWithEvidence).toMatchObject({
      liveEvidence: "/tmp/untrusted-diagnostic-evidence.json",
      preflightReport: "/tmp/diagnostic-preflight.json",
      productionGate: "/tmp/diagnostic-production-gate.json",
    });
    expect(diagnosticWithEvidence).toHaveProperty("productionRequirements");
    expect(() =>
      buildSolanaLiveVideoGateOptions({
        args: {
          ...args,
          "live-evidence": "/tmp/live-bidirectional-evidence.json",
        },
        paths,
        toriiUrl: "https://taira.sora.org",
        solanaRpcUrl: "https://api.testnet.solana.com",
        skipSolanaRpc: false,
        successMode: true,
      }),
    ).toThrow(/canonical TAIRA validator root/u);
  });

  it("summarizes Solana evidence refresh root blockers from production gate and steps", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      productionGateReport: {
        failedCheckIds: ["public-preflight-ready", "live-bidirectional-video"],
        blockerIds: ["public-preflight-ready", "live-bidirectional-video"],
        completionAudit: [
          {
            id: "solana-testnet-deployment",
            status: "proven",
            unresolvedIds: [],
          },
          {
            id: "public-taira-route-publication",
            status: "incomplete",
            unresolvedIds: ["public-preflight-ready"],
          },
        ],
      },
      steps: [
        {
          name: "smoke-readiness",
          failedCheckIds: ["route-preflight"],
          blockerIds: ["route-preflight", "walletconnect-project-id"],
        },
        {
          name: "operator-handoff",
          failedCheckIds: [],
          blockerIds: [
            "route-manager-authority",
            "runtime-signing-key",
            "sourceVerifierMaterialHash",
            "sourceAdapterEngineDeploymentHash",
            "routeAllowlistHash",
          ],
        },
      ],
      reports: [
        {
          source: "production-gate",
          report: {
            nextActionDetails: [
              {
                id: "publish-public-taira-solana-route",
                title: "Publish public route",
                detail: "Submit the production Solana route manifest.",
                blockedBy: [{ id: "public-preflight-ready" }],
                command: ["npm", "run", "e2e:sccp:solana-production-gate"],
                requiredInputs: ["taira-route-manager-i105-account"],
              },
            ],
          },
        },
        {
          source: "smoke-readiness",
          report: {
            nextActions: [
              {
                id: "configure-solana-walletconnect",
                title: "Configure Solana WalletConnect",
                detail: "Provide a WalletConnect project id.",
                commands: [
                  "VITE_WALLETCONNECT_PROJECT_ID=<walletconnect-project-id> npm run e2e:sccp:solana-smoke-readiness",
                ],
                requiredInputs: ["walletconnect-project-id"],
              },
              "publish-public-taira-solana-route",
            ],
          },
        },
        {
          source: "production-requirements",
          report: {
            nextActionDetails: [
              {
                id: "publish-governed-solana-source-material",
                title: "Publish governed Solana source material",
                detail:
                  "Render or provide governed Solana source verifier and source adapter deployment records.",
                blockedBy: [{ id: "source-verifier-material" }],
                command: [
                  "python3",
                  "../iroha/scripts/sccp_solana_source_state_evidence.py",
                  "--toml",
                ],
                requiredInputs: ["sourceTrustAnchorHash"],
              },
            ],
          },
        },
        {
          source: "post-deploy-full-toml",
          report: {
            nextActionDetails: [
              {
                id: "provide-sourceVerifierMaterialHash",
                title: "Provide source verifier material hash",
                detail: "Provide the governed source verifier material hash.",
                blockedBy: [
                  {
                    id: "sourceVerifierMaterialHash",
                    detail: "sourceVerifierMaterialHash is required.",
                  },
                ],
                command: [
                  "npm",
                  "run",
                  "sccp:solana:deploy",
                  "--",
                  "post-deploy-full-toml",
                ],
                requiredInputs: ["sourceVerifierMaterialHash"],
              },
            ],
          },
        },
      ],
    });

    expect(status.failedCheckIds).toEqual([
      "public-preflight-ready",
      "live-bidirectional-video",
    ]);
    expect(status.blockerIds).toEqual([
      "public-preflight-ready",
      "live-bidirectional-video",
      "route-preflight",
      "walletconnect-project-id",
      "route-manager-authority",
      "runtime-signing-key",
      "source-verifier-material-hash",
      "source-adapter-engine-deployment-hash",
      "route-allowlist-hash",
    ]);
    expect(status.rootCauseBlockerIds).toEqual([]);
    expect(status.missingProductionInputIds).toEqual([]);
    expect(status.requiredProductionInputs).toEqual([]);
    expect(status.blockerResolution.runtimeInputBlockerIds).toEqual([
      "walletconnect-project-id",
      "route-manager-authority",
      "runtime-signing-key",
    ]);
    expect(status.blockerResolution.tairaGovernanceBlockerIds).toEqual([
      "public-preflight-ready",
      "route-preflight",
    ]);
    expect(status.blockerResolution.liveEvidenceBlockerIds).toEqual([
      "live-bidirectional-video",
    ]);
    expect(status.blockerResolution.manifestMaterialBlockerIds).toEqual([
      "source-verifier-material-hash",
      "source-adapter-engine-deployment-hash",
      "route-allowlist-hash",
    ]);
    expect(status.nextActions).toEqual([
      "publish-taira-solana-route-manifest",
      "configure-solana-walletconnect",
      "publish-governed-solana-source-material",
      "provide-source-verifier-material-hash",
    ]);
    expect(status.nextActionDetails).toMatchObject([
      {
        id: "publish-taira-solana-route-manifest",
        source: "production-gate",
        blockedBy: [{ id: "public-preflight-ready" }],
        command: ["npm", "run", "e2e:sccp:solana-production-gate"],
        requiredInputs: ["taira-route-manager-i105-account"],
      },
      {
        id: "configure-solana-walletconnect",
        source: "smoke-readiness",
        command: [
          "VITE_WALLETCONNECT_PROJECT_ID=<walletconnect-project-id> npm run e2e:sccp:solana-smoke-readiness",
        ],
        requiredInputs: ["walletconnect-project-id"],
      },
      {
        id: "publish-governed-solana-source-material",
        source: "production-requirements",
        blockedBy: [{ id: "source-verifier-material" }],
        command: [
          "python3",
          "../iroha/scripts/sccp_solana_source_state_evidence.py",
          "--toml",
        ],
        requiredInputs: ["sourceTrustAnchorHash"],
      },
      {
        id: "provide-source-verifier-material-hash",
        source: "post-deploy-full-toml",
        blockedBy: [
          {
            id: "source-verifier-material-hash",
            detail: "source-verifier-material-hash is required.",
          },
        ],
        command: [
          "npm",
          "run",
          "sccp:solana:deploy",
          "--",
          "post-deploy-full-toml",
        ],
        requiredInputs: ["source-verifier-material-hash"],
        requiredInputIds: ["source-verifier-material-hash"],
      },
    ]);
    expect(status.completionAuditReady).toBe(false);
    expect(status.completionAudit).toMatchObject([
      {
        id: "solana-testnet-deployment",
        status: "proven",
        unresolvedIds: [],
      },
      {
        id: "public-taira-route-publication",
        status: "incomplete",
        unresolvedIds: ["public-preflight-ready"],
      },
    ]);
  });

  it("preserves delegated public-node repair actions in Solana evidence refresh root status", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      reports: [
        {
          source: "route-publish-readiness",
          report: {
            nextActionDetails: [
              {
                id: "provide-explicit-taira-public-node-target",
                title: "Provide explicit TAIRA public node",
                detail:
                  "Repair and use the exact TAIRA public-node root and matching /v1/mcp endpoint.",
                blockedBy: [
                  {
                    id: "taira-explicit-public-node-target",
                    detail: "Direct validator endpoint is not ready.",
                  },
                ],
                command: [
                  "npm",
                  "run",
                  "sccp:solana:deploy",
                  "--",
                  "publish-readiness",
                ],
                validationCommands: [
                  ["dig", "+short", "taira-validator-1.sora.org"],
                ],
                delegatedActions: [
                  {
                    id: "publish-direct-validator-dns-records",
                    title: "Publish direct validator DNS records",
                    detail:
                      "Create the direct validator A records on the TAIRA DNS zone.",
                    command: ["dig", "+short", "taira-validator-1.sora.org"],
                    requiredInputs: ["taira-edge-dns-zone-access"],
                  },
                ],
                requiredInputs: [
                  {
                    id: "taira-public-node-root-url",
                    kind: "url",
                    argument: "--torii-url",
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(status.nextActionDetails).toMatchObject([
      {
        id: "provide-explicit-taira-public-node-target",
        source: "route-publish-readiness",
        validationCommands: [["dig", "+short", "taira-validator-1.sora.org"]],
        delegatedActions: [
          expect.objectContaining({
            id: "publish-direct-validator-dns-records",
            command: ["dig", "+short", "taira-validator-1.sora.org"],
            requiredInputs: ["taira-edge-dns-zone-access"],
            requiredInputIds: ["taira-edge-dns-zone-access"],
          }),
        ],
        requiredInputIds: ["taira-public-node-root-url"],
      },
    ]);
  });

  it("classifies Solana manifest post-deploy evidence as live evidence", () => {
    const resolution = buildSolanaBlockerResolution([
      "manifest-post-deploy-live-evidence",
    ]);

    expect(resolution.liveEvidenceBlockerIds).toEqual([
      "manifest-post-deploy-live-evidence",
    ]);
    expect(resolution.unknownBlockerIds).toEqual([]);
  });

  it("classifies Solana public preflight capability blockers", () => {
    const resolution = buildSolanaBlockerResolution([
      "sccp-capabilities-load",
      "sccp-manifest-load",
      "solana-capability-publication",
      "preflight:sccp-capabilities-load",
      "preflight:sccp-manifest-load",
      "preflight:solana-capability-publication",
    ]);

    expect(resolution.publicEndpointBlockerIds).toEqual([
      "sccp-capabilities-load",
      "sccp-manifest-load",
      "preflight:sccp-capabilities-load",
      "preflight:sccp-manifest-load",
    ]);
    expect(resolution.tairaGovernanceBlockerIds).toEqual([
      "solana-capability-publication",
      "preflight:solana-capability-publication",
    ]);
    expect(resolution.unknownBlockerIds).toEqual([]);
  });

  it("classifies explicit TAIRA public-node rollout blockers as endpoint work", () => {
    const resolution = buildSolanaBlockerResolution([
      "taira-explicit-public-node-target",
      "taira-public-node-dns",
      "taira-public-node-tls",
      "finish-production:taira-public-node-mcp",
    ]);

    expect(resolution.publicEndpointBlockerIds).toEqual([
      "taira-explicit-public-node-target",
      "taira-public-node-dns",
      "taira-public-node-tls",
      "finish-production:taira-public-node-mcp",
    ]);
    expect(resolution.repoActionableBlockerIds).toEqual([]);
    expect(resolution.unknownBlockerIds).toEqual([]);
  });

  it("suppresses resolved TAIRA endpoint blockers in Solana evidence refresh reports", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      steps: [
        {
          name: "route-publish-readiness",
          blockerIds: [
            "production-requirements",
            "taira-public-endpoint",
            "taira-mcp-transaction-tools",
          ],
        },
      ],
      reports: [
        {
          source: "route-publish-readiness",
          report: {
            publicEndpoint: {
              endpointReady: true,
              mcpTransactionTools: { ready: true },
            },
          },
        },
      ],
    });

    expect(status.blockerIds).toEqual(["production-requirements"]);
    expect(status.blockerResolution.publicEndpointBlockerIds).toEqual([]);
  });

  it("falls back to production gate checks for Solana evidence refresh failed ids", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      productionGateReport: {
        checks: [
          { id: "public-preflight-ready", status: "fail" },
          { id: "deployment-video-present", status: "pass" },
          { id: "live-bidirectional-video", status: "fail" },
        ],
      },
      steps: [
        {
          name: "deployment-video",
          failedCheckIds: [],
          blockerIds: [],
        },
      ],
    });

    expect(status.failedCheckIds).toEqual([
      "public-preflight-ready",
      "live-bidirectional-video",
    ]);
    expect(status.blockerIds).toEqual([
      "public-preflight-ready",
      "live-bidirectional-video",
    ]);
  });

  it("uses Solana smoke root-cause prover package blockers in evidence refresh reports", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      productionGateReport: {
        failedCheckIds: [
          "route-preflight",
          "smoke-readiness-ready",
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
        blockerIds: [
          "route-preflight",
          "smoke-readiness-ready",
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
      },
      steps: [
        {
          name: "smoke-readiness",
          failedCheckIds: [
            "destination-prover-module-url",
            "source-prover-module-url",
          ],
          blockerIds: [
            "destination-prover-module-url",
            "source-prover-module-url",
          ],
        },
      ],
      reports: [
        {
          source: "smoke-readiness",
          report: {
            rootCauseBlockerIds: [
              "solana-public-route-report",
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
          },
        },
      ],
    });

    expect(status.failedCheckIds).toEqual(["smoke-readiness-ready"]);
    expect(status.blockerIds).toEqual([
      "smoke-readiness-ready",
      "solana-public-route-report",
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(status.rootCauseBlockerIds).toEqual([
      "solana-public-route-report",
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(status.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(status.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(status.blockerResolution.governedProofMaterialBlockerIds).toEqual([
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(status.blockerIds).not.toContain("destination-prover-module-url");
    expect(status.blockerIds).not.toContain("source-prover-module-url");
    expect(status.blockerIds).not.toContain("route-preflight");
  });

  it("promotes explicit missing Solana production inputs into evidence refresh root causes", () => {
    const missingProductionInputIds = [
      ...SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
      "solana-public-route-report",
      "walletconnect-project-id",
    ];
    const status = buildSolanaEvidenceRefreshRootStatus({
      productionGateReport: {
        failedCheckIds: ["production-requirements-ready"],
        blockerIds: ["production-requirements-ready"],
      },
      reports: [
        {
          source: "operator-handoff",
          report: {
            rootCauseBlockerIds: ["solana-public-route-report"],
            missingProductionInputIds,
          },
        },
      ],
    });

    expect(status.rootCauseBlockerIds).toEqual([
      "solana-public-route-report",
      ...SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
      "walletconnect-project-id",
    ]);
    expect(status.blockerIds).toEqual(
      expect.arrayContaining(status.rootCauseBlockerIds),
    );
    expect(status.missingProductionInputIds).toEqual(missingProductionInputIds);
  });

  it("keeps Solana evidence refresh root blockers empty when every step is ready", () => {
    const status = buildSolanaEvidenceRefreshRootStatus({
      productionGateReport: {
        failedCheckIds: [],
        blockerIds: [],
        completionAudit: [
          {
            id: "solana-testnet-deployment",
            status: "proven",
            unresolvedIds: [],
          },
          {
            id: "deployment-walkthrough-video",
            status: "proven",
            unresolvedIds: [],
          },
        ],
      },
      steps: [
        {
          name: "production-gate",
          failedCheckIds: [],
          blockerIds: [],
        },
      ],
    });

    expect(status).toEqual({
      failedCheckIds: [],
      blockerIds: [],
      rootCauseBlockerIds: [],
      missingProductionInputIds: [],
      requiredProductionInputs: [],
      blockerResolution: buildSolanaBlockerResolution([]),
      nextActions: [],
      nextActionDetails: [],
      completionAudit: [
        {
          id: "solana-testnet-deployment",
          status: "proven",
          unresolvedIds: [],
        },
        {
          id: "deployment-walkthrough-video",
          status: "proven",
          unresolvedIds: [],
        },
      ],
      completionAuditReady: true,
    });
  });

  it("exposes a direct npm script for refreshing Solana evidence", () => {
    expect(packageJson().scripts["sccp:solana:refresh-evidence"]).toBe(
      "node scripts/sccp-solana-deploy.mjs refresh-evidence",
    );
    expect(packageJson().scripts["sccp:solana:refresh-live-evidence"]).toBe(
      "node scripts/sccp-solana-deploy.mjs refresh-evidence --skip-solana-rpc false",
    );
    expect(packageJson().scripts["sccp:solana:finish-production"]).toBe(
      "node scripts/sccp-solana-deploy.mjs finish-production",
    );
  });

  it("requires an exact explicit finish-production submission mode", () => {
    expect(() => resolveSolanaFinishSubmissionMode({})).toThrow(
      /explicit --submit true or --submit false/u,
    );
    for (const submit of ["TRUE", "False", "1", "yes", "", null]) {
      expect(() => resolveSolanaFinishSubmissionMode({ submit })).toThrow(
        /must be exactly true or false/u,
      );
    }
    expect(resolveSolanaFinishSubmissionMode({ submit: "false" })).toEqual({
      mode: "dry-run",
      explicitlySelected: true,
      mutationAuthorized: false,
    });
    expect(resolveSolanaFinishSubmissionMode({ submit: "true" })).toEqual({
      mode: "submit",
      explicitlySelected: true,
      mutationAuthorized: true,
    });

    expect(() => buildSolanaFinishSubmissionState()).toThrow(
      /requires an exact explicitly selected/u,
    );
    expect(() =>
      buildSolanaFinishSubmissionState({
        submissionMode: {
          mode: "dry-run",
          explicitlySelected: true,
          mutationAuthorized: true,
        },
      }),
    ).toThrow(/requires an exact explicitly selected/u);
    expect(() =>
      buildSolanaFinishSubmissionState({
        submissionMode: dryRunFinishSubmissionMode,
        mutationAttempted: true,
      }),
    ).toThrow(/dry-run finish report cannot claim/u);
  });

  it("rejects missing or malformed finish submission mode before dependency access", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-finish-mode-"));
    const dependencyPath = path.join(root, "must-not-be-read.json");
    writeFileSync(dependencyPath, "not-json-and-secret-marker");
    try {
      for (const submitArgs of [
        [],
        ["--submit", "TRUE"],
        ["--submit", "yes"],
        ["--submit", "1"],
        ["--submit"],
      ]) {
        const outputDir = path.join(
          root,
          `absent-${submitArgs.join("-") || "missing"}`,
        );
        const result = spawnSync(
          process.execPath,
          [
            "scripts/sccp-solana-deploy.mjs",
            "finish-production",
            ...submitArgs,
            "--output-dir",
            outputDir,
            "--public-preflight-report",
            dependencyPath,
            "--torii-url",
            "http://127.0.0.1:1",
          ],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY:
                "runtime-secret-must-not-be-read-or-echoed",
            },
          },
        );
        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).not.toBe(0);
        expect(output).toMatch(
          /explicit --submit true or --submit false|must be exactly true or false|requires an explicit following value/u,
        );
        expect(output).not.toContain(dependencyPath);
        expect(output).not.toContain("not-json-and-secret-marker");
        expect(output).not.toContain(
          "runtime-secret-must-not-be-read-or-echoed",
        );
        expect(existsSync(outputDir)).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never authorizes finish-production finalization in dry-run or before fresh readiness", () => {
    expect(
      buildSolanaFinishFinalizationMutationDecision({
        submitEnabled: true,
        readiness: { ready: true, blockerIds: [] },
      }),
    ).toMatchObject({
      submitEnabled: true,
      readinessReady: true,
      shouldSubmit: true,
      blockerIds: [],
    });
    expect(
      buildSolanaFinishFinalizationMutationDecision({
        submitEnabled: false,
        readiness: { ready: true, blockerIds: [] },
      }),
    ).toMatchObject({
      shouldSubmit: false,
      mutationAuthorized: false,
      mutationRequired: true,
      blockerIds: ["program-finalization-required"],
      executionBlockerIds: ["finish-production-submit-disabled"],
    });
    expect(
      buildSolanaFinishFinalizationMutationDecision({
        submitEnabled: true,
        readiness: {
          ready: false,
          blockers: [{ id: "program-finalization-native-verifier-linkage" }],
          blockerIds: ["program-finalization-code-hash"],
        },
      }),
    ).toMatchObject({
      shouldSubmit: false,
      blockerIds: [
        "program-finalization-native-verifier-linkage",
        "program-finalization-code-hash",
      ],
    });
    expect(
      buildSolanaFinishFinalizationMutationDecision({
        submitEnabled: true,
        readiness: { ready: "true", blockerIds: [] },
      }),
    ).toMatchObject({
      shouldSubmit: false,
      blockerIds: ["program-finalization-readiness"],
    });

    const completion = buildSolanaFinishProgramFinalizationCompletion({
      report: {
        ready: true,
        productionReady: true,
        mode: "atomic-set-authority-none",
      },
      validation: { ready: true },
    });
    expect(
      buildSolanaFinishFinalizationMutationDecision({
        submitEnabled: false,
        readiness: { ready: false, blockerIds: ["operator-confirmation"] },
        completion,
      }),
    ).toMatchObject({
      alreadyFinalized: true,
      mutationRequired: false,
      satisfied: true,
      shouldSubmit: false,
      blockerIds: [],
      executionBlockerIds: [],
    });
  });

  it("configures the governed verifier only after finalization and treats exact existing linkage as idempotent", () => {
    expect(
      buildSolanaFinishVerifierConfigurationDecision({
        submitEnabled: true,
        programFinalization: { ready: true },
        verifierLinkage: { ready: false },
        governedPackagePresent: true,
        governedConfirmationPresent: true,
      }),
    ).toMatchObject({
      alreadyConfigured: false,
      finalizationReady: true,
      shouldSubmit: true,
      blockerIds: [],
    });
    expect(
      buildSolanaFinishVerifierConfigurationDecision({
        submitEnabled: false,
        programFinalization: { ready: true },
        verifierLinkage: { ready: false },
        governedPackagePresent: true,
        governedConfirmationPresent: true,
      }),
    ).toMatchObject({
      shouldSubmit: false,
      mutationRequired: true,
      blockerIds: ["native-verifier-configuration-required"],
      executionBlockerIds: ["finish-production-submit-disabled"],
    });
    expect(
      buildSolanaFinishVerifierConfigurationDecision({
        submitEnabled: true,
        programFinalization: { ready: false },
        verifierLinkage: { ready: false },
        governedPackagePresent: false,
        governedConfirmationPresent: false,
      }),
    ).toMatchObject({
      shouldSubmit: false,
      blockerIds: [
        "program-finalization",
        "governed-native-verifier-package",
        "confirm-governed-native-verifier",
      ],
    });
    expect(
      buildSolanaFinishVerifierConfigurationDecision({
        submitEnabled: false,
        programFinalization: { ready: false },
        verifierLinkage: { ready: true },
        governedPackagePresent: false,
        governedConfirmationPresent: false,
      }),
    ).toMatchObject({
      alreadyConfigured: true,
      satisfied: true,
      shouldSubmit: false,
      blockerIds: [],
    });
  });

  it("orders finish-production as readiness, finalization, immutable configuration, then linkage", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finishStart = source.indexOf("const finishProduction = async");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const body = source.slice(finishStart, refreshStart);
    const readinessPreflight = body.indexOf(
      '"program-finalization-readiness-preflight"',
    );
    const finalization = body.indexOf('record("program-finalization"');
    const linkagePreconfiguration = body.indexOf(
      '"verifier-linkage-readiness-preconfiguration"',
    );
    const configuration = body.indexOf('record("configure-native-verifier"');
    const finalLinkage = body.indexOf('record("verifier-linkage-readiness",');
    const finalReadiness = body.indexOf(
      'record("program-finalization-readiness",',
    );

    expect(readinessPreflight).toBeGreaterThanOrEqual(0);
    expect(finalization).toBeGreaterThan(readinessPreflight);
    expect(linkagePreconfiguration).toBeGreaterThan(finalization);
    expect(configuration).toBeGreaterThan(linkagePreconfiguration);
    expect(finalLinkage).toBeGreaterThan(configuration);
    expect(finalReadiness).toBeGreaterThan(finalLinkage);
    expect(body).toContain("submitEnabled: finishSubmit");
    expect(body).toContain(
      'deployNativeVerifier({ ...args, "configure-only": "true" })',
    );
  });

  it("refreshes Solana finalization readiness before finish-production rebuilds requirements", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finishStart = source.indexOf("const finishProduction = async");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const body = source.slice(finishStart, refreshStart);

    expect(finishStart).toBeGreaterThanOrEqual(0);
    expect(refreshStart).toBeGreaterThan(finishStart);
    expect(body.indexOf('record("verifier-linkage-readiness"')).toBeLessThan(
      body.indexOf('record("program-finalization-readiness"'),
    );
    expect(
      body.indexOf('record("program-finalization-readiness"'),
    ).toBeLessThan(body.indexOf('record(\n    "production-requirements"'));
  });

  it("refreshes the Solana draft manifest before prover readiness", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const commandsStart = source.indexOf("const commands = {", refreshStart);
    const body = source.slice(refreshStart, commandsStart);

    const postDeployIndex = body.indexOf('record("post-deploy-evidence"');
    const draftManifestIndex = body.indexOf('record("draft-manifest"');
    const proverReadinessIndex = body.indexOf('record("prover-readiness"');

    expect(refreshStart).toBeGreaterThanOrEqual(0);
    expect(commandsStart).toBeGreaterThan(refreshStart);
    expect(postDeployIndex).toBeGreaterThanOrEqual(0);
    expect(draftManifestIndex).toBeGreaterThan(postDeployIndex);
    expect(proverReadinessIndex).toBeGreaterThan(draftManifestIndex);
    expect(body).toContain(
      "routeManifest: draftManifestResult.routeManifestPath",
    );
    expect(body).toContain("finishProduction: paths.finishProduction");
  });

  it("uses explicit public preflight reports during finish-production", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finishStart = source.indexOf("const finishProduction = async");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const body = source.slice(finishStart, refreshStart);
    const overrideIndex = body.indexOf(
      "loadPublicPreflightReportOverride(args)",
    );
    const livePreflightIndex = body.indexOf(
      "runSccpSolanaRoutePreflight",
      overrideIndex,
    );

    expect(finishStart).toBeGreaterThanOrEqual(0);
    expect(refreshStart).toBeGreaterThan(finishStart);
    expect(overrideIndex).toBeGreaterThanOrEqual(0);
    expect(livePreflightIndex).toBeGreaterThan(overrideIndex);
  });

  it("validates Solana finish-production material against inventory roots by default", () => {
    const args = { "output-dir": "/tmp/sccp-solana-finish" };
    const paths = solanaDeployArtifactPaths(args);
    const resolved = solanaFinishProductionMaterialValidationArgs(args, paths);
    const roots = resolved["material-roots"].split(",");

    expect(args).not.toHaveProperty("material-roots");
    expect(roots).toContain(path.resolve("/tmp/sccp-solana-finish"));
    expect(roots).toContain(path.resolve("public/sccp-solana"));
    expect(roots).not.toContain(paths.productionMaterialTemplate);
  });

  it("preserves explicit Solana production-material validation input", () => {
    const args = {
      "output-dir": "/tmp/sccp-solana-finish",
      "material-file": "/tmp/reviewed-solana-material.json",
    };
    const paths = solanaDeployArtifactPaths(args);

    expect(solanaFinishProductionMaterialValidationArgs(args, paths)).toBe(
      args,
    );
  });

  it("uses the final blocked-publish readiness snapshot for Solana finish reports", () => {
    const initialReadiness = {
      routePublishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      report: {
        checkedAt: "2026-07-07T00:00:00.000Z",
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        blockerIds: ["runtime-signing-key"],
      },
    };
    const finalReadinessReport = {
      checkedAt: "2026-07-07T00:01:00.000Z",
      readyToSubmitWithCurrentRuntime: false,
      publicEndpoint: {
        endpointReady: false,
        mcpTransactionTools: {
          ready: false,
          error:
            "HTTP request timed out after 1000ms: https://taira.sora.org/v1/mcp",
        },
      },
      blockerIds: ["taira-mcp-transaction-tools", "runtime-signing-key"],
    };

    const selected = selectCanonicalSolanaRoutePublishReadiness({
      initialReadiness,
      blockedSnapshot: {
        routePublishReadinessPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
        routePublishReadiness: finalReadinessReport,
      },
    });

    expect(selected.routePublishReadinessPath).toBe(
      "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
    );
    expect(selected.report).toBe(finalReadinessReport);
    expect(selected.report.publicEndpoint.endpointReady).toBe(false);
    expect(selected.report.blockerIds).toEqual([
      "taira-mcp-transaction-tools",
      "runtime-signing-key",
    ]);
  });

  it("refreshes Solana route-publication handoffs after proof bundles during finish-production", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finishStart = source.indexOf("const finishProduction = async");
    const refreshStart = source.indexOf("const refreshEvidence = async");
    const body = source.slice(finishStart, refreshStart);

    const proofBundleIndex = body.indexOf('record("proof-material-bundle"');
    const routePublicationIndex = body.indexOf(
      'record("route-publication-request-final"',
    );
    const routeManagerIndex = body.indexOf(
      'record(\n    "route-manager-access-request-final"',
    );
    const laneActivationIndex = body.indexOf(
      'record("lane-activation-proposal-final"',
    );
    const operatorIndex = body.indexOf('record("operator-handoff-final"');
    const activationIndex = body.indexOf('record("activation-package"');
    const deploymentVideoIndex = body.indexOf('record("deployment-video"');
    const productionGateIndex = body.indexOf('record("production-gate"');

    expect(proofBundleIndex).toBeGreaterThanOrEqual(0);
    expect(routePublicationIndex).toBeGreaterThan(proofBundleIndex);
    expect(routeManagerIndex).toBeGreaterThan(routePublicationIndex);
    expect(laneActivationIndex).toBeGreaterThan(routeManagerIndex);
    expect(operatorIndex).toBeGreaterThan(laneActivationIndex);
    expect(activationIndex).toBeGreaterThan(operatorIndex);
    expect(deploymentVideoIndex).toBeGreaterThan(activationIndex);
    expect(productionGateIndex).toBeGreaterThan(deploymentVideoIndex);
    expect(body).toMatch(
      /withoutReportOverrideArgs\(\s*finalSharedRouteArgs,\s*\[/u,
    );
    expect(body).toContain('"route-publication-request-report"');
  });

  it("pins the reviewed manifest in definition and fallback finish commands", () => {
    const manifestArtifactPath =
      "/reviewed/taira-solana-xor-route.manifest.json";
    const manifestArtifactSha256 = materialHex32(
      "finish-reviewed-route-manifest",
    );
    for (const nextActions of [["publish-taira-solana-route-manifest"], []]) {
      const report = buildSolanaFinishProductionReportBody({
        submissionMode: dryRunFinishSubmissionMode,
        routePublishReadiness: {
          publicationSatisfied: false,
          submissionRequired: true,
          readyToSubmitWithCurrentRuntime: false,
          publicEndpoint: { routeAlreadyPublic: false },
          routeManifestIsi: {
            manifestArtifactPath,
            manifestArtifactSha256,
          },
          nextActions,
          blockers: [{ id: "runtime-signing-key" }],
        },
      });
      const action = report.nextActionDetails.find(
        (entry) => entry.id === "publish-taira-solana-route-manifest",
      );
      expect(action).toBeDefined();
      expect(action.command).toContain("sccp:solana:finish-production");
      expectExactManifestPin(
        action.command,
        manifestArtifactPath,
        manifestArtifactSha256,
      );
    }
  });

  it("builds a fail-closed Solana production finish report without persisting runtime secrets", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      steps: [
        {
          name: "production-material-validation",
          ok: true,
          ready: false,
          schema: "iroha-demo-sccp-solana-production-material-validation/v1",
          failedCheckIds: [],
          blockerIds: ["production-material-inventory"],
          paths: {
            productionMaterialValidationPath:
              "output/sccp-solana-deploy/taira-solana-xor-production-material.validation.json",
          },
        },
        {
          name: "publish-route-manifest",
          ok: null,
          skipped: true,
          ready: false,
          schema: null,
          failedCheckIds: [],
          blockerIds: [
            "taira-public-endpoint",
            "taira-mcp-transaction-tools",
            "runtime-signing-key",
          ],
          paths: {},
        },
      ],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          preflightReady: false,
          preflightPath:
            "output/sccp-solana-deploy/route-publish-preflight/sccp-solana-route-preflight.json",
          mcpTransactionTools: {
            ready: true,
            presentTools: [
              "iroha.transactions.submit",
              "iroha.transactions.submit_and_wait",
            ],
          },
          routeAlreadyPublic: false,
          publicationChecks: [
            { id: "public-route-publication", status: "pass" },
            {
              id: "solana-lane-publication",
              status: "fail",
              detail: "Solana lane is disabled.",
            },
            {
              id: "solana-route-instance-publication",
              status: "fail",
              detail: "No taira_sol_xor Solana route instance is published.",
            },
          ],
          publicSolanaLane: {
            present: true,
            ready: false,
            blockerIds: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
        },
        blockers: [{ id: "runtime-signing-key" }],
        nextActionDetails: [
          {
            id: "set-runtime-route-manager-private-key",
            requiredInputs: ["SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY"],
          },
        ],
      },
      smokeReadiness: {
        ready: false,
        checks: [{ id: "walletconnect-project-id", status: "fail" }],
        blockerIds: ["walletconnect-project-id"],
        nextActions: ["configure-solana-walletconnect"],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            blockedBy: [{ id: "source-verifier-material" }],
            command: [
              "python3",
              "../iroha/scripts/sccp_solana_source_state_evidence.py",
              "--toml",
            ],
            requiredInputs: ["sourceTrustAnchorHash"],
          },
        ],
      },
      productionMaterialInventory: {
        ready: false,
        roots: ["/tmp/sccp-solana-deploy", "/tmp/iroha/artifacts/sccp-solana"],
        scanned: {
          fileCount: 3,
          skipped: [
            { path: "/tmp/iroha/artifacts/sccp-solana", reason: "missing" },
          ],
        },
        materialRoots: {
          defaultRootAuditEnabled: true,
          expectedGroups: [
            {
              id: "sibling-solana-governed-material",
              required: true,
              description:
                "Governed Solana material should be published under sibling roots.",
              ready: false,
              paths: [
                {
                  path: "/tmp/iroha/artifacts/sccp-solana",
                  exists: false,
                  fileCount: 0,
                  candidateCount: 0,
                  readyCandidateCount: 0,
                  status: "missing",
                  skippedReason: "missing",
                  roleReadiness: {
                    sourceVerifierMaterial: {
                      candidateCount: 0,
                      readyCount: 0,
                      ready: false,
                    },
                    sourceAdapterEngineDeployment: {
                      candidateCount: 0,
                      readyCount: 0,
                      ready: false,
                    },
                  },
                },
              ],
            },
          ],
        },
        candidates: {
          sourceVerifierMaterial: [{ ready: false }],
          sourceAdapterEngineDeployment: [],
          offlineFullToml: [],
        },
        readyMaterial: {
          sourceVerifierMaterial: null,
          sourceAdapterEngineDeployment: null,
          offlineFullToml: null,
          browserProvers: false,
          browserProverModules: [
            {
              direction: "destination",
              moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
              sidecarUrl:
                "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
              moduleHash: hex32("d1"),
              sidecarHash: hex32("d2"),
              productionProofsReady: false,
              ready: false,
            },
          ],
          destinationProofAdmission: false,
        },
        missingProductionArtifactIds: [
          "sibling-solana-governed-material-root",
          "governed-solana-source-verifier-material",
          "solana-destination-production-prover-package",
        ],
        blockers: [
          {
            id: "public-solana-lane-material",
            blockerIds: [
              "public-solana-source-material-placeholder",
              "public-solana-source-state-verifier",
            ],
          },
        ],
        publicLaneDiagnostics: [
          {
            path: "output/sccp-solana-deploy/route-publish-preflight/sccp-solana-route-preflight.json",
            pointer: "/",
            ready: false,
            publicationReady: false,
            blockerIds: [
              "public-solana-lane-not-production-ready",
              "public-solana-source-material-placeholder",
              "public-solana-source-state-verifier",
            ],
            sourceVerifierMaterial: {
              ready: false,
              statusIds: ["placeholderMaterial", "sourceStateVerifierHash"],
              recordHash: hex32("91"),
            },
          },
        ],
      },
      productionGate: {
        ready: false,
        failedCheckIds: ["public-preflight-ready"],
        blockerIds: ["production-requirements-ready"],
      },
      deploymentVideo: {
        mediaVerification: {
          ready: true,
          mp4SubtitleTrackReady: true,
        },
      },
      liveVideo: {
        schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
        ready: false,
        diagnosticVideoOnly: true,
        notLiveTransferEvidence: true,
        blockerIds: ["live-bidirectional-video"],
        mediaVerification: {
          ready: true,
          diagnosticVideoOnly: true,
        },
      },
      activationPackage: {
        productionActivationReady: false,
        blockers: [{ id: "public-route-publication" }],
      },
      operatorHandoff: {
        readyToPublish: false,
        blockers: [{ id: "governed-proof-material" }],
      },
      artifacts: {
        finishProduction:
          "output/sccp-solana-deploy/taira-solana-xor-finish-production.json",
        deploymentVideoMp4:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.mp4",
        deploymentVideoSubtitles:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.vtt",
        deploymentVideoTranscript:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.json",
        sourceBurnReadiness:
          "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
        sourceBurnSubmission:
          "output/sccp-solana-deploy/taira-solana-xor-source-burn.submission.json",
        proverReadiness:
          "output/sccp-solana-deploy/taira-solana-xor-prover-readiness.json",
        liveVideoTranscript:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
        liveVideoSubtitles:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
      },
      runtimeInputs: {
        routeManagerAuthorityConfigured: true,
        routeManagerAuthorityEnv: "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
        routeManagerPrivateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        routeManagerPrivateKeyEnvPresent: true,
        walletConnectProjectIdConfigured: true,
        destinationProverModuleUrlConfigured: false,
        sourceProverModuleUrlConfigured: false,
      },
    });

    expect(report.schema).toBe("iroha-demo-sccp-solana-finish-production/v1");
    expect(report).toMatchObject({
      submissionMode: "dry-run",
      mutationAuthorized: false,
      submission: {
        mode: "dry-run",
        explicitlySelected: true,
        mutationAuthorized: false,
        mutationAttempted: false,
        mutationSubmitted: false,
      },
    });
    expect(report.ready).toBe(false);
    expect(report.routePublishedOrSubmitted).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "production-material-inventory",
        "source-verifier-material",
        "runtime-signing-key",
        "walletconnect-project-id",
        "public-preflight-ready",
        "production-requirements-ready",
        "live-bidirectional-video",
        "solana-lane-publication",
        "solana-route-instance-publication",
        "immutable Solana verifier program is not deployed for this SCCP lane",
        "cryptographic trust anchor is not active for this SCCP lane",
        "governed-proof-material",
        "public-solana-lane-material",
        "public-solana-lane-not-production-ready",
        "public-solana-source-material-placeholder",
        "public-solana-source-state-verifier",
      ]),
    );
    expect(report.blockerIds).not.toContain("taira-public-endpoint");
    expect(report.blockerIds).not.toContain("taira-mcp-transaction-tools");
    expect(report.blockerIds).not.toContain("public-route-publication");
    expect(report.rootCauseBlockerIds).toEqual(
      expect.arrayContaining([
        "solana-public-route-report",
        "walletconnect-project-id",
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
        "governed-solana-source-verifier-material",
      ]),
    );
    expect(report.routePublishReadiness).toMatchObject({
      readyToSubmitWithCurrentRuntime: false,
      readyForRuntimeSigner: false,
      blockerIds: ["runtime-signing-key"],
      publicEndpointReady: true,
      mcpTransactionToolsReady: true,
      authorityReady: false,
      privateKeyEnvPresent: false,
      privateKeyStoredInReport: false,
    });
    expect(report.blockerResolution).toMatchObject({
      schema: "iroha-demo-sccp-solana-blocker-resolution/v1",
      currentRuntimeCanSubmitRoute: false,
      repoOnlyCompletionPossible: false,
      categoryCounts: expect.objectContaining({
        "runtime-input": expect.any(Number),
        "taira-governance": expect.any(Number),
        "governed-proof-material": expect.any(Number),
        "live-evidence": expect.any(Number),
      }),
      runtimeInputBlockerIds: expect.arrayContaining([
        "runtime-signing-key",
        "walletconnect-project-id",
      ]),
      tairaGovernanceBlockerIds: expect.arrayContaining([
        "solana-lane-publication",
        "solana-route-instance-publication",
      ]),
      governedProofMaterialBlockerIds: expect.arrayContaining([
        "production-material-inventory",
        "source-verifier-material",
        "governed-solana-source-verifier-material",
        "solana-destination-production-prover-package",
      ]),
      liveEvidenceBlockerIds: expect.arrayContaining([
        "live-bidirectional-video",
      ]),
      operatorActionableBlockerIds: expect.arrayContaining([
        "runtime-signing-key",
        "solana-lane-publication",
        "source-verifier-material",
        "live-bidirectional-video",
      ]),
    });
    expect(report.publicTaira).toMatchObject({
      routeAlreadyPublic: false,
      routePublicationSubmitted: false,
      routePublishedOrSubmitted: false,
      endpointReady: true,
      preflightReady: false,
      mcpTransactionTools: {
        ready: true,
        presentTools: [
          "iroha.transactions.submit",
          "iroha.transactions.submit_and_wait",
        ],
      },
      publicationChecks: [
        { id: "public-route-publication", status: "pass" },
        { id: "solana-lane-publication", status: "fail" },
        { id: "solana-route-instance-publication", status: "fail" },
      ],
      publicSolanaLane: {
        present: true,
        ready: false,
      },
      blockerIds: [
        "solana-lane-publication",
        "solana-route-instance-publication",
        "immutable Solana verifier program is not deployed for this SCCP lane",
        "cryptographic trust anchor is not active for this SCCP lane",
      ],
    });
    expect(report.publicationSurface).toMatchObject({
      endpointReady: true,
      mcpTransactionToolsReady: true,
      publicationMode: "signed-transaction-body-base64",
      requiredTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      presentTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      missingTools: [],
      bodyBase64SubmissionReady: true,
    });
    expect(report.publicTaira.publicationSurface).toEqual(
      report.publicationSurface,
    );
    expect(report.productionMaterialInventory).toMatchObject({
      ready: false,
      blockerIds: ["public-solana-lane-material"],
      missingProductionArtifactIds: [
        "sibling-solana-governed-material-root",
        "governed-solana-source-verifier-material",
        "solana-destination-production-prover-package",
      ],
      materialLocator: {
        schema: "iroha-demo-sccp-solana-production-material-locator/v1",
        ready: false,
        roots: ["/tmp/sccp-solana-deploy", "/tmp/iroha/artifacts/sccp-solana"],
        defaultRootAuditEnabled: true,
        scanned: {
          fileCount: 3,
          skipped: {
            count: 1,
            byReason: { missing: 1 },
            sample: [
              {
                path: "/tmp/iroha/artifacts/sccp-solana",
                reason: "missing",
                size: null,
              },
            ],
          },
          candidateCounts: {
            sourceVerifierMaterial: 1,
            sourceAdapterEngineDeployment: 0,
            offlineFullToml: 0,
          },
          readyCandidateCounts: {
            sourceVerifierMaterial: 0,
            sourceAdapterEngineDeployment: 0,
            offlineFullToml: 0,
          },
        },
        expectedRootGroups: [
          {
            id: "sibling-solana-governed-material",
            required: true,
            ready: false,
            paths: [
              {
                path: "/tmp/iroha/artifacts/sccp-solana",
                exists: false,
                status: "missing",
                skippedReason: "missing",
                fileCount: 0,
                candidateCount: 0,
                readyCandidateCount: 0,
                roleReadiness: {
                  sourceVerifierMaterial: {
                    candidateCount: 0,
                    readyCount: 0,
                    ready: false,
                  },
                  sourceAdapterEngineDeployment: {
                    candidateCount: 0,
                    readyCount: 0,
                    ready: false,
                  },
                },
              },
            ],
          },
        ],
        missingProductionArtifactIds: [
          "sibling-solana-governed-material-root",
          "governed-solana-source-verifier-material",
          "solana-destination-production-prover-package",
        ],
        readyMaterial: {
          sourceVerifierMaterial: null,
          sourceAdapterEngineDeployment: null,
          offlineFullToml: null,
          browserProvers: false,
          browserProverModules: [
            {
              direction: "destination",
              moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
              sidecarUrl:
                "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
              moduleHash: hex32("d1"),
              sidecarHash: hex32("d2"),
              productionProofsReady: false,
              ready: false,
            },
          ],
          destinationProofAdmission: false,
        },
      },
      publicLaneDiagnostics: [
        {
          ready: false,
          publicationReady: false,
          blockerIds: expect.arrayContaining([
            "public-solana-source-material-placeholder",
            "public-solana-source-state-verifier",
          ]),
          sourceVerifierMaterial: {
            ready: false,
            statusIds: ["placeholderMaterial", "sourceStateVerifierHash"],
            recordHash: hex32("91"),
          },
        },
      ],
    });
    expect(report.materialLocator).toEqual(
      report.productionMaterialInventory.materialLocator,
    );
    expect(report.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.artifacts).toMatchObject({
      deploymentVideoMp4:
        "output/sccp-solana-deploy/sccp-solana-deployment-video.mp4",
      deploymentVideoSubtitles:
        "output/sccp-solana-deploy/sccp-solana-deployment-video.vtt",
      deploymentVideoTranscript:
        "output/sccp-solana-deploy/sccp-solana-deployment-video.json",
      sourceBurnReadiness:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
      sourceBurnSubmission:
        "output/sccp-solana-deploy/taira-solana-xor-source-burn.submission.json",
      proverReadiness:
        "output/sccp-solana-deploy/taira-solana-xor-prover-readiness.json",
      liveVideoTranscript: null,
      liveVideoSubtitles: null,
      liveVideoMp4: null,
      blockedLiveVideoTranscript:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
      blockedLiveVideoSubtitles:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
      blockedLiveVideoMp4:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
    });
    expect(report.liveVideoArtifactPolicy).toEqual({
      liveVideoMp4RequiresReadyBidirectionalEvidence: true,
      diagnosticVideoOnly: true,
      blockedDiagnosticAvailable: true,
    });
    expect(report.mediaVerification).toEqual({
      deploymentVideo: {
        ready: true,
        mp4SubtitleTrackReady: true,
      },
      liveVideo: {
        ready: true,
        diagnosticVideoOnly: true,
      },
    });
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "set-runtime-route-manager-private-key",
        "configure-solana-walletconnect",
        "publish-governed-solana-source-material",
        "publish-taira-solana-route-manifest",
        "complete-solana-smoke-readiness",
        "record-solana-live-bidirectional-video",
      ]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-governed-solana-source-material",
          source: "production-requirements",
          blockedBy: [{ id: "source-verifier-material" }],
          command: [
            "python3",
            "../iroha/scripts/sccp_solana_source_state_evidence.py",
            "--toml",
          ],
          requiredInputs: ["sourceTrustAnchorHash"],
        }),
        expect.objectContaining({
          id: "complete-solana-smoke-readiness",
          title: "Complete Solana smoke readiness",
          command: ["npm", "run", "e2e:sccp:solana-smoke-readiness"],
        }),
        expect.objectContaining({
          id: "record-solana-live-bidirectional-video",
          title: "Record Solana live bidirectional video",
          command: ["npm", "run", "e2e:sccp:solana-video"],
        }),
      ]),
    );
    expect(report.runtimeInputs).toEqual({
      routeManagerAuthorityConfigured: true,
      routeManagerAuthorityEnv: "SCCP_TEST_ROUTE_MANAGER_AUTHORITY",
      routeManagerPrivateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      routeManagerPrivateKeyEnvPresent: true,
      routeManagerPrivateKeyStoredInReport: false,
      walletConnectProjectIdConfigured: true,
      walletConnectProjectIdSource: null,
      walletConnectProjectIdStoredInReport: false,
      destinationProverModuleUrlConfigured: false,
      destinationProverModuleUrlSource: null,
      sourceProverModuleUrlConfigured: false,
      sourceProverModuleUrlSource: null,
    });
    expect(JSON.stringify(report)).not.toContain("runtime-only-private-key");
    expect(JSON.stringify(report)).not.toContain("walletconnect-project-123");
  });

  it("classifies prefixed Solana finish blockers by resolution path", () => {
    const resolution = buildSolanaBlockerResolution([
      "preflight:browser-proof-modules",
      "production-gate:live-bidirectional-video",
      "route-manager-authority",
      "solana-verifier-fail-closed-canary",
      "route-manifest-production-shape",
      "unexpected-new-blocker",
    ]);

    expect(resolution).toMatchObject({
      schema: "iroha-demo-sccp-solana-blocker-resolution/v1",
      blockerCount: 6,
      currentRuntimeCanSubmitRoute: false,
      repoOnlyCompletionPossible: false,
      runtimeInputBlockerIds: ["route-manager-authority"],
      governedProofMaterialBlockerIds: ["preflight:browser-proof-modules"],
      liveEvidenceBlockerIds: ["production-gate:live-bidirectional-video"],
      solanaVerifierBlockerIds: ["solana-verifier-fail-closed-canary"],
      manifestMaterialBlockerIds: ["route-manifest-production-shape"],
      unknownBlockerIds: ["unexpected-new-blocker"],
      unsafeToAutoFixBlockerIds: expect.arrayContaining([
        "production-gate:live-bidirectional-video",
        "solana-verifier-fail-closed-canary",
        "unexpected-new-blocker",
      ]),
    });
    expect(resolution.categories.map((entry) => entry.id)).toEqual([
      "runtime-input",
      "governed-proof-material",
      "solana-verifier",
      "live-evidence",
      "manifest-material",
      "unknown",
    ]);
  });

  it("promotes hard Solana finish blockers into root causes", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: { routeAlreadyPublic: false },
        blockerIds: ["route-manager-authority", "runtime-signing-key"],
      },
      smokeReadiness: {
        ready: false,
        blockerIds: ["destination-prover-module-url"],
        rootCauseBlockerIds: ["solana-destination-production-prover-package"],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockerIds: [
          "source-verifier-material",
          "destination-proof-admission",
          "production-gate:browser-proof-modules",
        ],
      },
      productionGate: {
        ready: false,
        blockerIds: [
          "production-gate:solana-verifier-fail-closed-canary",
          "production-gate:program-finalization-fail-closed-sentinel",
          "production-gate:token-mint-supply",
        ],
      },
      liveVideo: {
        ready: false,
        blockerIds: ["source-token-balance", "live-bidirectional-video"],
      },
    });

    expect(report.rootCauseBlockerIds).toEqual(
      expect.arrayContaining([
        "solana-public-route-report",
        "route-manager-authority",
        "runtime-signing-key",
        "solana-destination-production-prover-package",
        "source-verifier-material",
        "destination-proof-admission",
        "browser-proof-modules",
        "solana-verifier-fail-closed-canary",
        "program-finalization-fail-closed-sentinel",
        "token-mint-supply",
        "source-token-balance",
        "live-bidirectional-video",
      ]),
    );
    expect(report.rootCauseBlockerIds).not.toContain(
      "production-gate:program-finalization-fail-closed-sentinel",
    );
    expect(report.blockerResolution.solanaVerifierBlockerIds).toEqual(
      expect.arrayContaining([
        "production-gate:solana-verifier-fail-closed-canary",
        "production-gate:program-finalization-fail-closed-sentinel",
      ]),
    );
  });

  it("keeps Solana finish root causes concise when missing production inputs are explicit", () => {
    const missingProductionInputIds = [
      "governed-solana-source-verifier-material",
      "governed-solana-source-adapter-engine-deployment",
      "reviewed-final-solana-offline-toml",
      "governed-solana-destination-proof-admission",
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
      "solana-public-route-report",
      "walletconnect-project-id",
    ];
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      smokeReadiness: {
        ready: false,
        blockerIds: [
          "walletconnect-project-id",
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
        rootCauseBlockerIds: [
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
        missingProductionInputIds: [
          "walletconnect-project-id",
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockerIds: [
          "production-ready-flag",
          "browser-proof-modules",
          "source-verifier-material",
          "source-adapter-engine-deployment",
          "destination-proof-admission",
          "solana-verifier-programdata-mutable",
          "program-finalization-enforcement-mode",
          "post-deploy-full-toml",
        ],
      },
      productionGate: {
        ready: false,
        blockerIds: [
          "production-gate:token-mint-supply",
          "production-gate:source-token-balance",
          "production-gate:live-bidirectional-video",
        ],
      },
      operatorHandoff: {
        readyToPublish: false,
        missingProductionInputIds,
        blockers: [{ id: "governed-proof-material" }],
      },
    });

    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "production-ready-flag",
        "browser-proof-modules",
        "source-verifier-material",
        "program-finalization-enforcement-mode",
        "production-gate:token-mint-supply",
        "production-gate:live-bidirectional-video",
      ]),
    );
    expect(report.rootCauseBlockerIds).toEqual(
      expect.arrayContaining(missingProductionInputIds),
    );
    expect(report.rootCauseBlockerIds).not.toEqual(
      expect.arrayContaining([
        "production-ready-flag",
        "browser-proof-modules",
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "destination-proof-admission",
        "solana-verifier-programdata-mutable",
        "program-finalization-enforcement-mode",
        "post-deploy-full-toml",
        "token-mint-supply",
        "source-token-balance",
        "live-bidirectional-video",
      ]),
    );
  });

  it("uses Solana smoke root-cause blockers instead of superseded prover URL blockers in finish reports", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: { routeAlreadyPublic: false },
      },
      smokeReadiness: {
        ready: false,
        checks: [
          { id: "destination-prover-module-url", status: "fail" },
          { id: "source-prover-module-url", status: "fail" },
        ],
        blockerIds: [
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
        rootCauseBlockerIds: [
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
      },
      productionGate: { ready: false },
      liveVideo: { ready: false },
    });

    expect(report.failedCheckIds).toEqual([]);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
      ]),
    );
    expect(report.failedCheckIds).not.toContain(
      "destination-prover-module-url",
    );
    expect(report.failedCheckIds).not.toContain("source-prover-module-url");
    expect(report.blockerIds).not.toContain("destination-prover-module-url");
    expect(report.blockerIds).not.toContain("source-prover-module-url");
    expect(report.blockerResolution).toMatchObject({
      runtimeInputBlockerIds: [],
      governedProofMaterialBlockerIds: expect.arrayContaining([
        "solana-destination-production-prover-package",
        "solana-source-production-prover-package",
      ]),
    });
  });

  it("preserves delegated public-node repair actions in Solana finish reports", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: false,
          mcpTransactionTools: { ready: false },
          routeAlreadyPublic: false,
          publicationChecks: [],
        },
        blockers: [{ id: "taira-explicit-public-node-target" }],
        nextActionDetails: [
          {
            id: "provide-explicit-taira-public-node-target",
            title: "Provide explicit TAIRA public node",
            detail:
              "Repair and use the exact TAIRA public-node root and matching /v1/mcp endpoint.",
            blockedBy: [
              {
                id: "taira-explicit-public-node-target",
                detail: "Direct validator endpoint is not ready.",
              },
            ],
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "publish-readiness",
            ],
            validationCommands: [
              ["dig", "+short", "taira-validator-1.sora.org"],
            ],
            delegatedActions: [
              {
                id: "publish-direct-validator-dns-records",
                title: "Publish direct validator DNS records",
                command: ["dig", "+short", "taira-validator-1.sora.org"],
                requiredInputs: ["taira-edge-dns-zone-access"],
              },
            ],
            requiredInputs: [
              {
                id: "taira-public-node-root-url",
                kind: "url",
                argument: "--torii-url",
              },
            ],
          },
        ],
      },
      smokeReadiness: { ready: true },
      productionGate: { ready: false },
      liveVideo: { ready: false },
    });

    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "provide-explicit-taira-public-node-target",
          validationCommands: [["dig", "+short", "taira-validator-1.sora.org"]],
          delegatedActions: [
            expect.objectContaining({
              id: "publish-direct-validator-dns-records",
              command: ["dig", "+short", "taira-validator-1.sora.org"],
              requiredInputIds: ["taira-edge-dns-zone-access"],
            }),
          ],
          requiredInputIds: ["taira-public-node-root-url"],
        }),
      ]),
    );
  });

  it("normalizes Solana finish proof-material blocker actions into executable governed-material steps", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
          routeAlreadyPublic: false,
          publicationChecks: [],
        },
        blockers: [{ id: "proof-material-bundle" }],
      },
      smokeReadiness: { ready: true },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "proof-material-bundle" }],
      },
      productionGate: { ready: false },
      liveVideo: {
        ready: false,
        diagnosticVideoOnly: true,
        nextActionDetails: [
          {
            id: "operator:proof-material-bundle",
            title: "proof-material-bundle",
            blockedBy: [{ id: "proof-material-bundle" }],
          },
        ],
      },
      activationPackage: {
        productionActivationReady: false,
      },
      operatorHandoff: {
        readyToPublish: false,
        blockers: [{ id: "proof-material-bundle" }],
        nextActions: ["proof-material-bundle"],
      },
    });

    expect(report.nextActions).not.toEqual(
      expect.arrayContaining([
        "proof-material-bundle",
        "operator:proof-material-bundle",
      ]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "operator:complete-governed-proof-material-and-production-manifest",
          title: "Complete governed proof material",
          command: [
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "proof-material-ceremony-package",
          ],
        }),
        expect.objectContaining({
          id: "complete-governed-proof-material-and-production-manifest",
          title: "Complete governed proof material",
          command: [
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "proof-material-ceremony-package",
          ],
        }),
      ]),
    );
    expect(
      report.nextActionDetails
        .filter((action) =>
          action.id.includes("complete-governed-proof-material"),
        )
        .every((action) => action.command.length > 0),
    ).toBe(true);
  });

  it("carries post-deploy full TOML hash actions into Solana finish reports", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
          routeAlreadyPublic: false,
          publicationChecks: [],
        },
      },
      smokeReadiness: { ready: true },
      productionRequirements: { readyToBuildIsi: false },
      postDeployFullToml: {
        ready: false,
        blockerIds: [
          "sourceVerifierMaterialHash",
          "sourceAdapterEngineDeploymentHash",
          "routeAllowlistHash",
        ],
        nextActionDetails: [
          {
            id: "provide-sourceVerifierMaterialHash",
            blockedBy: [{ id: "sourceVerifierMaterialHash" }],
            command: [
              "python3",
              "../iroha/scripts/sccp_solana_source_state_evidence.py",
              "--toml",
            ],
            requiredInputs: ["sourceTrustAnchorHash"],
          },
          {
            id: "provide-sourceAdapterEngineDeploymentHash",
            blockedBy: [{ id: "sourceAdapterEngineDeploymentHash" }],
            command: [
              "python3",
              "../iroha/scripts/sccp_solana_source_state_evidence.py",
              "--toml",
            ],
            requiredInputs: ["deploymentReceiptHash"],
          },
          {
            id: "provide-routeAllowlistHash",
            blockedBy: [{ id: "routeAllowlistHash" }],
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "route-allowlist-hash",
            ],
            requiredInputs: ["sourceVerifierMaterialHash"],
          },
        ],
      },
      productionGate: { ready: false },
      liveVideo: { ready: false },
      activationPackage: { productionActivationReady: false },
      operatorHandoff: { readyToPublish: false },
    });

    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "source-verifier-material-hash",
        "source-adapter-engine-deployment-hash",
        "route-allowlist-hash",
      ]),
    );
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        "provide-source-verifier-material-hash",
        "provide-source-adapter-engine-deployment-hash",
        "provide-route-allowlist-hash",
      ]),
    );
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "provide-source-verifier-material-hash",
          source: "post-deploy-full-toml",
          blockedBy: [{ id: "source-verifier-material-hash" }],
          command: [
            "python3",
            "../iroha/scripts/sccp_solana_source_state_evidence.py",
            "--toml",
          ],
          requiredInputs: expect.arrayContaining(["sourceTrustAnchorHash"]),
        }),
        expect.objectContaining({
          id: "provide-source-adapter-engine-deployment-hash",
          source: "post-deploy-full-toml",
          blockedBy: [{ id: "source-adapter-engine-deployment-hash" }],
          command: [
            "python3",
            "../iroha/scripts/sccp_solana_source_state_evidence.py",
            "--toml",
          ],
          requiredInputs: expect.arrayContaining(["deploymentReceiptHash"]),
        }),
        expect.objectContaining({
          id: "provide-route-allowlist-hash",
          source: "post-deploy-full-toml",
          blockedBy: [{ id: "route-allowlist-hash" }],
          command: [
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "route-allowlist-hash",
          ],
          requiredInputs: expect.arrayContaining([
            "source-verifier-material-hash",
          ]),
        }),
      ]),
    );
  });

  it("normalizes legacy blocked Solana live-video paths away from live evidence artifacts", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: { routeAlreadyPublic: false },
      },
      smokeReadiness: { ready: false },
      productionGate: { ready: false },
      liveVideo: { ready: false },
      artifacts: {
        liveVideoTranscript:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
        liveVideoSubtitles:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
      },
    });

    expect(report.liveVideoReady).toBe(false);
    expect(report.artifacts).toMatchObject({
      liveVideoTranscript: null,
      liveVideoSubtitles: null,
      liveVideoMp4: null,
      blockedLiveVideoTranscript:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
      blockedLiveVideoSubtitles:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
      blockedLiveVideoMp4:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
    });
    expect(report.liveVideoArtifactPolicy).toEqual({
      liveVideoMp4RequiresReadyBidirectionalEvidence: true,
      diagnosticVideoOnly: true,
      blockedDiagnosticAvailable: true,
    });

    const preclassified = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-06T00:00:00.000Z",
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: { routeAlreadyPublic: false },
      },
      smokeReadiness: { ready: false },
      productionGate: { ready: false },
      artifacts: {
        blockedLiveVideoTranscript:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
        blockedLiveVideoSubtitles:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
        blockedLiveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
      },
    });

    expect(preclassified.artifacts).toMatchObject({
      liveVideoTranscript: null,
      liveVideoSubtitles: null,
      liveVideoMp4: null,
      blockedLiveVideoTranscript:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.json",
      blockedLiveVideoSubtitles:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.vtt",
      blockedLiveVideoMp4:
        "output/sccp-solana-live-video/sccp-solana-live-video-blocked.mp4",
    });
    expect(preclassified.liveVideoArtifactPolicy).toEqual({
      liveVideoMp4RequiresReadyBidirectionalEvidence: true,
      diagnosticVideoOnly: true,
      blockedDiagnosticAvailable: true,
    });
  });

  it("marks Solana production finish ready only after route publication, smoke, production, and live video gates pass", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: {
        mode: "submit",
        explicitlySelected: true,
        mutationAuthorized: true,
      },
      mutationAttempted: true,
      mutationSubmitted: true,
      checkedAt: "2026-07-06T00:00:00.000Z",
      steps: [
        {
          name: "publish-route-manifest",
          ok: true,
          ready: true,
          schema: null,
          failedCheckIds: [],
          blockerIds: [],
          paths: {
            submissionPath:
              "output/sccp-solana-deploy/taira-solana-xor-route.submission.json",
          },
        },
      ],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: false },
        blockers: [],
      },
      publishResult: {
        submitted: true,
        submissionPath:
          "output/sccp-solana-deploy/taira-solana-xor-route.submission.json",
      },
      smokeReadiness: { ready: true, checks: [], blockerIds: [] },
      productionGate: { ready: true, failedCheckIds: [], blockerIds: [] },
      liveVideo: { ready: true },
      activationPackage: { productionActivationReady: true, blockers: [] },
      operatorHandoff: { readyToPublish: true, blockers: [] },
      artifacts: {
        deploymentVideoMp4:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.mp4",
        deploymentVideoSubtitles:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.vtt",
        deploymentVideoTranscript:
          "output/sccp-solana-deploy/sccp-solana-deployment-video.json",
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video.mp4",
      },
      runtimeInputs: {
        routeManagerAuthorityConfigured: true,
        routeManagerPrivateKeyEnvPresent: true,
        walletConnectProjectIdConfigured: true,
        walletConnectProjectIdSource: "VITE_WALLETCONNECT_PROJECT_ID",
        destinationProverModuleUrlConfigured: true,
        destinationProverModuleUrlSource:
          "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL",
        sourceProverModuleUrlConfigured: true,
        sourceProverModuleUrlSource:
          "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
      },
    });

    expect(report.ready).toBe(true);
    expect(report).toMatchObject({
      submissionMode: "submit",
      mutationAuthorized: true,
      submission: {
        mode: "submit",
        mutationAuthorized: true,
        mutationAttempted: true,
        mutationSubmitted: true,
      },
    });
    expect(report.routePublishedOrSubmitted).toBe(true);
    expect(report.routePublicationSubmitted).toBe(true);
    expect(report.smokeReadinessReady).toBe(true);
    expect(report.productionGateReady).toBe(true);
    expect(report.liveVideoReady).toBe(true);
    expect(report.liveVideoArtifactPolicy).toEqual({
      liveVideoMp4RequiresReadyBidirectionalEvidence: true,
      diagnosticVideoOnly: false,
      blockedDiagnosticAvailable: false,
    });
    expect(report.runtimeInputs).toMatchObject({
      walletConnectProjectIdSource: "VITE_WALLETCONNECT_PROJECT_ID",
      destinationProverModuleUrlSource:
        "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL",
      sourceProverModuleUrlSource: "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
    });
    expect(report.blockerIds).toEqual([]);
    expect(report.nextActions).toEqual([]);
    expect(report.artifacts.deploymentVideoMp4).toBe(
      "output/sccp-solana-deploy/sccp-solana-deployment-video.mp4",
    );
  });

  it("allows a dry-run to attest an already-complete no-op deployment", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      requiredMutationIds: [],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: true },
        blockers: [],
      },
      smokeReadiness: { ready: true, checks: [], blockerIds: [] },
      productionGate: { ready: true, failedCheckIds: [], blockerIds: [] },
      liveVideo: { ready: true },
      activationPackage: { productionActivationReady: true, blockers: [] },
      operatorHandoff: { readyToPublish: true, blockers: [] },
      artifacts: {
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video.mp4",
      },
    });

    expect(report).toMatchObject({
      ready: true,
      submissionMode: "dry-run",
      mutationAuthorized: false,
      mutationRequired: false,
      submission: {
        mode: "dry-run",
        mutationAuthorized: false,
        mutationRequired: false,
        noOp: true,
        executionDecisionBlockerIds: [],
      },
    });
    expect(report.blockerIds).not.toContain(
      "finish-production-submit-disabled",
    );
  });

  it("keeps required mutations as production blockers without treating dry-run authorization as readiness", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      requiredMutationIds: [
        "program-finalization-required",
        "native-verifier-configuration-required",
        "taira-route-manifest-publication-required",
      ],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: true },
        blockers: [],
      },
      smokeReadiness: { ready: true, checks: [], blockerIds: [] },
      productionGate: { ready: true, failedCheckIds: [], blockerIds: [] },
      liveVideo: { ready: true },
      activationPackage: { productionActivationReady: true, blockers: [] },
      operatorHandoff: { readyToPublish: true, blockers: [] },
      artifacts: {
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video.mp4",
      },
    });

    expect(report.ready).toBe(false);
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "program-finalization-required",
        "native-verifier-configuration-required",
        "taira-route-manifest-publication-required",
      ]),
    );
    expect(report.blockerIds).not.toContain(
      "finish-production-submit-disabled",
    );
    expect(report.submission).toMatchObject({
      mutationAuthorized: false,
      mutationRequired: true,
      executionDecisionBlockerIds: ["finish-production-submit-disabled"],
    });
  });

  it("never reports a successful production finish when any workflow step failed", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-10T00:00:00.000Z",
      steps: [
        {
          name: "program-finalization",
          ok: false,
          ready: false,
          failedCheckIds: [],
          blockerIds: [],
        },
      ],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: true },
        blockers: [],
      },
      smokeReadiness: { ready: true, checks: [], blockerIds: [] },
      productionGate: { ready: true, failedCheckIds: [], blockerIds: [] },
      liveVideo: { ready: true },
      activationPackage: { productionActivationReady: true, blockers: [] },
      operatorHandoff: { readyToPublish: true, blockers: [] },
      artifacts: {
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video.mp4",
      },
    });

    expect(report).toMatchObject({
      ready: false,
      routePublishedOrSubmitted: true,
      smokeReadinessReady: true,
      productionGateReady: true,
      liveVideoReady: true,
      failedStepIds: ["program-finalization"],
    });
    expect(report.blockerIds).toContain("program-finalization");
  });

  it("never reports a successful production finish with unresolved checks or blockers", () => {
    const report = buildSolanaFinishProductionReportBody({
      submissionMode: dryRunFinishSubmissionMode,
      checkedAt: "2026-07-10T00:00:00.000Z",
      steps: [
        {
          name: "program-finalization",
          ok: true,
          ready: true,
          failedCheckIds: ["immutable-programdata-readback"],
          blockerIds: ["governance-program-role-pins"],
        },
      ],
      routePublishReadiness: {
        readyToSubmitWithCurrentRuntime: true,
        publicEndpoint: { routeAlreadyPublic: true },
        blockers: [],
      },
      smokeReadiness: { ready: true, checks: [], blockerIds: [] },
      productionGate: { ready: true, failedCheckIds: [], blockerIds: [] },
      liveVideo: { ready: true },
      activationPackage: { productionActivationReady: true, blockers: [] },
      operatorHandoff: { readyToPublish: true, blockers: [] },
      artifacts: {
        liveVideoMp4:
          "output/sccp-solana-live-video/sccp-solana-live-video.mp4",
      },
    });

    expect(report.ready).toBe(false);
    expect(report.failedCheckIds).toContain("immutable-programdata-readback");
    expect(report.blockerIds).toEqual(
      expect.arrayContaining([
        "immutable-programdata-readback",
        "governance-program-role-pins",
      ]),
    );
  });

  it("builds a consolidated non-secret Solana operator handoff", () => {
    const report = buildSolanaOperatorHandoffReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      manifest: baseProductionManifest(),
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      proofMaterialBundle: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        bundleManifestSha256: materialHex32("proof-bundle"),
        includedArtifactCount: 8,
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      routePublicationRequest: {
        schema: "iroha-demo-sccp-solana-route-publication-request/v1",
        readyForRouteManagerReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        publicRouteAlreadyPublished: false,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [{ id: "production-requirements" }],
        upstreamBlockerIds: ["source-verifier-material"],
        requiredRuntimeInputs: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
      },
      routePublicationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route-publication-request.json",
      routeManagerAccessRequest: {
        schema: "iroha-demo-sccp-solana-route-manager-access-request/v1",
        readyForOperatorReview: true,
        accessReady: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        requestHash: materialHex32("route-access"),
        blockers: [
          { id: "route-manager-permission" },
          { id: "runtime-signing-key" },
          { id: "production-route-material" },
        ],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: false,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
      },
      routeManagerAccessRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route-manager-access-request.json",
      laneActivationRequest: {
        readyForLaneGovernanceReview: true,
        publicLaneReady: false,
        productionProofMaterialReady: true,
        productionLaneReady: false,
        laneActivationRequestHash: materialHex32("lane-activation"),
        blockers: [
          { id: "public-solana-lane" },
          { id: "governed-proof-material" },
        ],
      },
      laneActivationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-lane-activation-request.json",
      publishReadiness: {
        schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: { ready: false },
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          permissionAudit: {
            hasRequiredPermission: false,
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: false,
        },
        blockers: [
          { id: "production-requirements" },
          { id: "route-manager-permission" },
          { id: "runtime-signing-key" },
        ],
      },
      publishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      productionRequirementsPath:
        "output/sccp-solana-deploy/taira-solana-xor-production-requirements.json",
      smokeReadiness: {
        schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
        checkedAt: "2026-07-05T00:00:00.000Z",
        ready: false,
        checks: [
          { id: "route-preflight", status: "fail" },
          { id: "walletconnect-project-id", status: "fail" },
        ],
        missingProductionInputs: [
          { id: "solana-public-route-report" },
          { id: "walletconnect-project-id" },
        ],
      },
      smokeReadinessPath: "output/sccp-solana-smoke-readiness/latest.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe("iroha-demo-sccp-solana-operator-handoff/v1");
    expect(report.readyForOperatorReview).toBe(true);
    expect(report.productionRouteReady).toBe(false);
    expect(report.readyToPublish).toBe(false);
    expect(report.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.handoffHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.handoffHashPolicy.inputs).toContain("publicationSurface");
    expect(report.publicationSurface).toMatchObject({
      toriiUrl: "https://taira.sora.org",
      mcpUrl: "https://taira.sora.org/v1/mcp",
      endpointReady: true,
      mcpTransactionToolsReady: true,
      publicationMode: "signed-transaction-body-base64",
      requiredTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      presentTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      missingTools: [],
      readOnlyManifestTools: ["iroha.da.manifests.get"],
      bodyBase64SubmissionReady: true,
      signedTransactionSubmission: {
        ready: true,
      },
    });
    expect(report.artifacts.proofMaterialBundle).toMatchObject({
      present: true,
      stableHash: materialHex32("proof-bundle"),
      readyForProofMaterialCeremony: true,
      includedArtifactCount: 8,
    });
    expect(report.artifacts.routePublicationRequest).toMatchObject({
      stableHash: materialHex32("route-publication"),
      readyForRouteManagerReview: true,
    });
    expect(report.artifacts.proofMaterialCeremonyPackage).toMatchObject({
      missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    });
    expect(report.artifacts.routeManagerAccessRequest).toMatchObject({
      stableHash: materialHex32("route-access"),
      readyForOperatorReview: true,
      accessReady: false,
    });
    expect(report.artifacts.laneActivationRequest).toMatchObject({
      stableHash: materialHex32("lane-activation"),
      readyForLaneGovernanceReview: true,
      publicLaneReady: false,
      productionProofMaterialReady: true,
      productionLaneReady: false,
      blockerIds: ["public-solana-lane", "governed-proof-material"],
    });
    expect(report.artifacts.smokeReadiness).toMatchObject({
      present: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      ready: false,
      blockerIds: ["route-preflight", "walletconnect-project-id"],
      failedCheckIds: ["route-preflight", "walletconnect-project-id"],
      missingProductionInputIds: [
        "solana-public-route-report",
        "walletconnect-project-id",
      ],
    });
    expect(report.artifacts.publishReadiness).toMatchObject({
      endpointReady: true,
      mcpTransactionToolsReady: true,
      publicationMode: "signed-transaction-body-base64",
      mcpUrl: "https://taira.sora.org/v1/mcp",
      requiredTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      presentTools: [
        "iroha.transactions.submit",
        "iroha.transactions.submit_and_wait",
      ],
      missingTools: [],
      bodyBase64SubmissionReady: true,
    });
    expect(report.requiredRouteManager).toMatchObject({
      authority: ROUTE_MANAGER_AUTHORITY,
      requiredPermission: "CanManageSccpRouteManifests",
      hasRequiredPermission: false,
    });
    expect(report.runtimeSigning).toEqual({
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyEnvPresent: false,
      privateKeyStoredInReport: false,
    });
    expect(report.commands.publishRouteManifest).toEqual([
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY=<runtime-only-private-key-hex>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-route-manifest",
      "--submit",
      "true",
      "--manifest",
      "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      "--expected-manifest-sha256",
      "0x<independently-reviewed-exact-manifest-byte-sha256>",
      "--private-key-env",
      "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      "--authority",
      ROUTE_MANAGER_AUTHORITY,
    ]);
    expect(report.commands.refreshPreflight).toEqual([
      "npm",
      "run",
      "e2e:sccp:solana-preflight",
      "--",
      "--allow-incomplete",
      "true",
    ]);
    expect(report.commands.refreshSmokeReadiness).toEqual([
      "npm",
      "run",
      "e2e:sccp:solana-smoke-readiness",
      "--",
      "--allow-incomplete",
      "true",
    ]);
    expect(report.commands.productionGate).toEqual([
      "npm",
      "run",
      "e2e:sccp:solana-production-gate",
    ]);
    expect(report.commands.liveVideo).toEqual([
      "npm",
      "run",
      "e2e:sccp:solana-video",
    ]);
    expect(report.nextActions).toEqual([
      "complete-governed-proof-material-and-production-manifest",
      "grant-taira-route-manager-access",
      "set-runtime-route-manager-private-key",
    ]);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "complete-governed-proof-material-and-production-manifest",
        blockedBy: [{ id: "production-route-material" }],
        command: report.commands.refreshProofMaterialCeremonyPackage,
        requiredInputs: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
        delegatedActions: expect.arrayContaining([
          expect.objectContaining({
            id: "publish-governed-solana-source-material",
          }),
        ]),
      },
      {
        id: "grant-taira-route-manager-access",
        blockedBy: [{ id: "route-manager-permission" }],
        command: report.commands.refreshAccessRequest,
        requiredInputs: [
          "taira-route-manager-i105-account",
          "CanManageSccpRouteManifests",
        ],
      },
      {
        id: "set-runtime-route-manager-private-key",
        blockedBy: [{ id: "runtime-signing-key" }],
        command: report.commands.publishRouteManifest,
        requiredInputs: ["SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY"],
      },
    ]);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "production-route-material",
      "route-manager-permission",
      "runtime-signing-key",
    ]);
    expect(report.blockerIds).toEqual([
      "production-route-material",
      "route-manager-permission",
      "runtime-signing-key",
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("promotes explicit TAIRA public-node blockers into the Solana operator handoff", () => {
    const publicNodeCommand = [
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-readiness",
      "--torii-url",
      "https://<taira-public-node-root>",
      "--mcp-url",
      "https://<taira-public-node-root>/v1/mcp",
    ];
    const report = buildSolanaOperatorHandoffReportBody({
      args: {},
      manifest: baseProductionManifest(),
      publishReadiness: {
        schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          publicationTargetReady: false,
          target: {
            targetKind: "taira-convenience-root",
            canonicalRolloutTargetReady: false,
          },
          defaultPresetPublicationReady: true,
          directPublicNodePublicationReady: false,
          explicitPublicNodeCandidates: {
            blockerIds: ["taira-public-node-dns"],
          },
          explicitPublicNodeRepairPlan: {
            blockerIds: ["taira-public-node-tls"],
          },
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: { ready: false },
        runtimeSigning: {
          authority: "",
          authorityReady: false,
          privateKeyEnv: "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
          privateKeyEnvPresent: false,
        },
        blockers: [{ id: "taira-explicit-public-node-target" }],
        nextActionDetails: [
          {
            id: "provide-explicit-taira-public-node-target",
            command: publicNodeCommand,
            delegatedActions: [
              {
                id: "publish-direct-validator-dns-records",
                command: ["dig", "+short", "taira-validator-1.sora.org"],
                requiredInputs: ["taira-edge-dns-zone-access"],
              },
            ],
          },
        ],
      },
      routePublicationRequest: {
        readyForRouteManagerReview: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "publish-readiness" }],
        upstreamBlockerIds: ["taira-explicit-public-node-target"],
      },
      routeManagerAccessRequest: {
        readyForOperatorReview: false,
        accessReady: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "route-publication-request" }],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [],
      },
      checkedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(report.publicationSurface).toMatchObject({
      publicationTargetReady: false,
      targetKind: "taira-convenience-root",
      defaultPresetPublicationReady: true,
      directPublicNodePublicationReady: false,
    });
    expect(report.nextActions).toContain(
      "provide-explicit-taira-public-node-target",
    );
    const publicNodeAction = report.nextActionDetails.find(
      (action) => action.id === "provide-explicit-taira-public-node-target",
    );
    expect(publicNodeAction).toMatchObject({
      command: publicNodeCommand,
      blockedBy: expect.arrayContaining([
        expect.objectContaining({ id: "taira-explicit-public-node-target" }),
        expect.objectContaining({ id: "taira-public-node-dns" }),
        expect.objectContaining({ id: "taira-public-node-tls" }),
      ]),
      delegatedActions: [
        expect.objectContaining({
          id: "publish-direct-validator-dns-records",
          requiredInputIds: ["taira-edge-dns-zone-access"],
        }),
      ],
      requiredInputIds: [
        "taira-public-node-root-url",
        "taira-public-node-mcp-url",
      ],
    });
  });

  it("routes unready proof-material bundle blockers to the governed-material handoff", () => {
    const report = buildSolanaOperatorHandoffReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      manifest: baseProductionManifest(),
      proofMaterialBundle: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        bundleManifestSha256: materialHex32("proof-bundle"),
        blockers: [{ id: "proof-material-request" }],
        upstreamBlockerIds: ["source-material-handoff"],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      proofMaterialCeremonyPackage: {
        schema: "iroha-demo-sccp-solana-proof-material-ceremony-package/v1",
        readyForCeremonyReview: false,
        productionRouteReady: false,
        blockers: [{ id: "proof-material-bundle" }],
      },
      routePublicationRequest: {
        schema: "iroha-demo-sccp-solana-route-publication-request/v1",
        readyForRouteManagerReview: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        publicRouteAlreadyPublished: false,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [{ id: "proof-material-bundle" }],
        upstreamBlockerIds: ["source-verifier-material"],
      },
      routeManagerAccessRequest: {
        schema: "iroha-demo-sccp-solana-route-manager-access-request/v1",
        readyForOperatorReview: false,
        accessReady: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "route-publication-request" }],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: readyMcpTransactionTools(),
        },
        routeManifestIsi: { ready: false },
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          permissionAudit: {
            hasRequiredPermission: true,
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
        },
        blockers: [{ id: "production-requirements" }],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            requiredInputs: [
              { id: "sourceTrustAnchorHash" },
              { id: "sourceTrustAnchorHash" },
              { id: "consensusVerifierHash" },
            ],
          },
        ],
      },
    });

    expect(report.nextActions).toContain(
      "complete-governed-proof-material-and-production-manifest",
    );
    expect(report.nextActions).not.toContain("proof-material-bundle");

    const materialAction = report.nextActionDetails.find(
      (action) =>
        action.id ===
        "complete-governed-proof-material-and-production-manifest",
    );
    expect(materialAction).toMatchObject({
      command: report.commands.refreshProofMaterialCeremonyPackage,
      blockedBy: expect.arrayContaining([
        expect.objectContaining({ id: "proof-material-bundle" }),
        expect.objectContaining({ id: "proof-material-ceremony-package" }),
        expect.objectContaining({ id: "production-route-material" }),
      ]),
    });

    const sourceMaterialAction = materialAction.delegatedActions.find(
      (action) => action.id === "publish-governed-solana-source-material",
    );
    expect(
      sourceMaterialAction.requiredInputs.map((input) => input.id),
    ).toEqual(["sourceTrustAnchorHash", "consensusVerifierHash"]);
    expect(sourceMaterialAction.requiredInputIds).toEqual([
      "sourceTrustAnchorHash",
      "consensusVerifierHash",
    ]);
  });

  it("completes an exact-public operator handoff without signer or access actions", () => {
    const report = buildSolanaOperatorHandoffReportBody({
      manifest: baseProductionManifest(),
      proofMaterialBundle: {
        readyForProofMaterialCeremony: false,
        productionRouteReady: false,
        blockers: [{ id: "governed-proof-material" }],
      },
      routePublicationRequest: {
        publicationSatisfied: true,
        readyForRouteManagerReview: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "publish-readiness" }],
      },
      routeManagerAccessRequest: {
        readyForOperatorReview: false,
        accessReady: false,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [
          { id: "route-manager-permission" },
          { id: "runtime-signing-key" },
        ],
        requiredRouteManager: {
          authorityReady: false,
          hasRequiredPermission: false,
        },
        runtimeSigning: {
          privateKeyEnvPresent: false,
        },
      },
      publishReadiness: {
        publicationSatisfied: true,
        submissionRequired: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [],
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
    });

    expect(report).toMatchObject({
      ready: true,
      productionRouteReady: true,
      readyToPublish: false,
      publicationSatisfied: true,
      submissionRequired: false,
      blockers: [],
      nextActions: [],
    });
    expect(report.diagnosticBlockerIds).toEqual(
      expect.arrayContaining([
        "proof-material-bundle",
        "production-route-material",
        "route-manager-authority",
        "runtime-signing-key",
      ]),
    );
    expect(report.artifacts.routeManagerAccessRequest).toMatchObject({
      readyForOperatorReview: false,
      accessReady: false,
      readyToSubmitWithCurrentRuntime: false,
    });
  });

  it("keeps Solana operator handoff hashes stable across timestamp-only report refreshes", () => {
    const buildReport = (checkedAt) =>
      buildSolanaOperatorHandoffReportBody({
        args: {
          authority: ROUTE_MANAGER_AUTHORITY,
          "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        },
        manifest: baseProductionManifest(),
        proofMaterialBundle: {
          checkedAt,
          readyForProofMaterialCeremony: true,
          productionRouteReady: false,
          bundleManifestSha256: materialHex32("proof-bundle"),
          blockers: [],
          upstreamBlockerIds: ["production-requirements"],
        },
        routePublicationRequest: {
          checkedAt,
          readyForRouteManagerReview: true,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          reviewPackageHash: materialHex32("route-publication"),
          blockers: [{ id: "production-requirements" }],
          upstreamBlockerIds: ["source-verifier-material"],
        },
        routeManagerAccessRequest: {
          checkedAt,
          readyForOperatorReview: true,
          accessReady: false,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          requestHash: materialHex32("route-access"),
          blockers: [
            { id: "route-manager-permission" },
            { id: "runtime-signing-key" },
          ],
          requiredRouteManager: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            authorityFormatReady: true,
            hasRequiredPermission: false,
          },
          runtimeSigning: {
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: false,
          },
        },
        publishReadiness: {
          checkedAt,
          readyToSubmitWithCurrentRuntime: false,
          publicEndpoint: {
            endpointReady: true,
            mcpTransactionTools: { ready: true },
          },
          runtimeSigning: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            permissionAudit: {
              hasRequiredPermission: false,
            },
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: false,
          },
          blockers: [
            { id: "production-requirements" },
            { id: "runtime-signing-key" },
          ],
        },
        productionRequirements: {
          checkedAt,
          readyToBuildIsi: false,
          blockers: [{ id: "source-verifier-material" }],
        },
        checkedAt,
      });

    const first = buildReport("2026-07-05T00:00:00.000Z");
    const second = buildReport("2026-07-05T01:00:00.000Z");

    expect(second.handoffHash).toBe(first.handoffHash);
    expect(first.handoffHashPolicy).toMatchObject({
      volatileJsonFieldsIgnored: ["checkedAt", "checked_at"],
      inputs: expect.arrayContaining(["smokeReadinessBlockerIds"]),
    });
  });

  it("builds a non-secret Solana public-lane activation request from real deployment pins", async () => {
    const lane = await canonicalLaneDeploymentFixture();
    const manifestArtifactPath =
      "/reviewed/taira-solana-xor-route.manifest.json";
    const report = buildSolanaLaneActivationRequestReportBody({
      publicPreflight: {
        ready: false,
        manifestSource: "public",
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: false,
          disabledReason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          destinationRollout: {
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
        },
        checks: [
          {
            id: "solana-lane-publication",
            status: "fail",
            detail:
              "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          },
        ],
      },
      verifierEvidence: lane.verifierEvidence,
      verifierEvidenceArtifactSha256: lane.verifierEvidenceArtifactSha256,
      manifestArtifactPath,
      manifestArtifactSha256: lane.manifestArtifactSha256,
      postDeployEvidence: lane.postDeployEvidence,
      postDeployManifestEvidence: lane.postDeployManifestEvidence,
      proofMaterialRequestArtifactSha256:
        lane.proofMaterialRequestArtifactSha256,
      proofMaterialRequest: {
        readyForProofMaterialCeremony: true,
        observedPins: lane.observedPins,
        requiredProofMaterial: {
          sourceVerifierMaterial: [{ key: "sourceTrustAnchorHash" }],
        },
        blockers: [{ id: "production-requirements" }],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: lane.proofBundleManifestSha256,
        artifacts: lane.proofBundleArtifacts,
        upstreamBlockerIds: ["production-requirements"],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-lane-activation-request/v1",
    );
    expect(
      report.readyForLaneGovernanceReview,
      JSON.stringify(report.blockers, null, 2),
    ).toBe(true);
    expect(report.publicLaneReady).toBe(false);
    expect(report.productionLaneReady).toBe(false);
    expect(report.requestedLane.destinationRollout).toMatchObject({
      verifierTarget: "SolanaProgram",
      verifierProgramId: lane.roles.outerVerifier.program.address,
      verifierCodeHash: lane.roles.outerVerifier.loaderV3.executableBlake2b256,
      programdataAddress: lane.roles.outerVerifier.programdata.address,
      destinationBridgeAddress: lane.roles.destinationBridge.program.address,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "public-solana-lane",
      "governed-proof-material",
    ]);
    expect(report.blockerIds).toEqual([
      "public-solana-lane",
      "governed-proof-material",
    ]);
    expect(report.nextActions).toEqual([
      "activate-public-solana-lane",
      "complete-governed-proof-material",
    ]);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "activate-public-solana-lane",
        blockedBy: [{ id: "public-solana-lane" }],
        command: report.commands.activationProposal,
        requiredInputs: [
          "public-solana-lane-activation",
          "immutable-solana-verifier-evidence",
          "active-solana-trust-anchor",
        ],
      },
      {
        id: "complete-governed-proof-material",
        blockedBy: [{ id: "governed-proof-material" }],
        command: report.commands.refreshProofMaterialCeremonyPackage,
      },
    ]);
    expect(report.laneActivationRequestHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.stableHash).toBe(report.laneActivationRequestHash);
    expect(report.routeManifestSelection).toEqual({
      manifestArtifactPath,
      manifestArtifactSha256: lane.manifestArtifactSha256,
    });
    expectExactManifestPin(
      report.commands.refreshActivationPackage,
      manifestArtifactPath,
      lane.manifestArtifactSha256,
    );
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("does not use stale post-deploy signatures for Solana lane activation", async () => {
    const lane = await canonicalLaneDeploymentFixture({
      routeCanarySignature: null,
      sourceBurnSignature: null,
    });
    const report = buildSolanaLaneActivationRequestReportBody({
      publicPreflight: {
        ready: false,
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: false,
          disabledReason: "disabled",
          destinationRollout: { blockers: ["not active"] },
        },
      },
      verifierEvidence: lane.verifierEvidence,
      verifierEvidenceArtifactSha256: lane.verifierEvidenceArtifactSha256,
      manifestArtifactSha256: lane.manifestArtifactSha256,
      postDeployEvidence: lane.postDeployEvidence,
      postDeployManifestEvidence: lane.postDeployManifestEvidence,
      proofMaterialRequestArtifactSha256:
        lane.proofMaterialRequestArtifactSha256,
      proofMaterialRequest: {
        readyForProofMaterialCeremony: true,
        observedPins: lane.observedPins,
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: lane.proofBundleManifestSha256,
        artifacts: lane.proofBundleArtifacts,
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.requestedLane.sourceAdapter).toMatchObject({
      routeCanarySignature: "",
      sourceBurnSignature: "",
    });
    expect(JSON.stringify(report)).not.toContain(
      "stale-route-canary-signature",
    );
    expect(JSON.stringify(report)).not.toContain("stale-source-burn-signature");
    expect(report.readyForLaneGovernanceReview).toBe(true);
    expect(report.deploymentPins).toMatchObject({
      verifierProgramId: lane.roles.outerVerifier.program.address,
      routeCanaryEvidenceHash: lane.routeCanaryEvidenceHash,
    });
    expect(report.liveTransferEvidence).toEqual({
      routeCanarySignature: "",
      sourceBurnSignature: "",
    });
    expect(report.blockers).toContainEqual(
      expect.objectContaining({
        id: "live-transfer-evidence",
        missingOrInvalid: ["routeCanarySignature", "sourceBurnSignature"],
      }),
    );
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "deployment-pins",
    );
  });

  it("builds a non-secret Solana public-lane activation proposal from the activation request", async () => {
    const lane = await canonicalLaneDeploymentFixture();
    const manifestArtifactPath =
      "/reviewed/taira-solana-xor-route.manifest.json";
    const laneActivationRequest = buildSolanaLaneActivationRequestReportBody({
      publicPreflight: {
        ready: false,
        manifestSource: "public",
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: false,
          disabledReason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          destinationRollout: {
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
        },
      },
      verifierEvidence: lane.verifierEvidence,
      verifierEvidenceArtifactSha256: lane.verifierEvidenceArtifactSha256,
      manifestArtifactPath,
      manifestArtifactSha256: lane.manifestArtifactSha256,
      postDeployEvidence: lane.postDeployEvidence,
      postDeployManifestEvidence: lane.postDeployManifestEvidence,
      proofMaterialRequestArtifactSha256:
        lane.proofMaterialRequestArtifactSha256,
      proofMaterialRequest: {
        readyForProofMaterialCeremony: true,
        observedPins: lane.observedPins,
        requiredProofMaterial: {
          sourceVerifierMaterial: [{ key: "sourceTrustAnchorHash" }],
          browserProverModules: [{ direction: "destination" }],
        },
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: lane.proofBundleManifestSha256,
        artifacts: lane.proofBundleArtifacts,
        upstreamBlockerIds: ["production-requirements"],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    const report = buildSolanaLaneActivationProposalReportBody({
      laneActivationRequest,
      laneActivationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-lane-activation-request.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe(
      "iroha-demo-sccp-solana-lane-activation-proposal/v1",
    );
    expect(report.readyForGovernanceReview).toBe(true);
    expect(report.productionLaneReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.proposalHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.laneActivationRequest).toMatchObject({
      readyForLaneGovernanceReview: true,
      laneActivationRequestHash:
        laneActivationRequest.laneActivationRequestHash,
    });
    expect(report.requestedLane).toMatchObject({
      destinationRollout: {
        verifierProgramId: lane.roles.outerVerifier.program.address,
        verifierCodeHash:
          lane.roles.outerVerifier.loaderV3.executableBlake2b256,
        destinationBindingHash: lane.observedPins.destinationBindingHash,
      },
      sourceAdapter: {
        sourceBridgeProgramId: lane.roles.sourceBridge.program.address,
        sourceBridgeConfigHash: lane.sourceBridgeConfigHash,
      },
      assets: {
        tokenMintAddress: lane.reviewed.tokenMintAddress,
      },
    });
    expect(report.requiredGovernanceAction).toMatchObject({
      kind: "ActivateSccpLane",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      chain: "sol",
      laneActivationRequestHash:
        laneActivationRequest.laneActivationRequestHash,
      requestedLane: report.requestedLane,
      publicLaneReady: false,
      productionProofMaterialReady: false,
      productionLaneReady: false,
      approvalPath: "TAIRA governance or route-manager authority",
    });
    expect(report.proposalDraft).toMatchObject({
      kind: "ActivateSccpLane",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      chain: "sol",
      networkId: "solana-testnet",
      laneActivationRequestHash:
        laneActivationRequest.laneActivationRequestHash,
      destinationRollout: {
        verifierProgramId: lane.roles.outerVerifier.program.address,
      },
    });
    expect(report.reviewBlockers).toEqual([]);
    expect(report.productionBlockers.map((blocker) => blocker.id)).toEqual([
      "public-solana-lane",
      "governed-proof-material",
    ]);
    expect(report.nextActions).toEqual([
      "activate-public-solana-lane",
      "complete-governed-proof-material",
    ]);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "activate-public-solana-lane",
        command: report.commands.refreshProposal,
        requiredInputs: [
          "public-solana-lane-activation",
          "immutable-solana-verifier-evidence",
          "active-solana-trust-anchor",
        ],
      },
      {
        id: "complete-governed-proof-material",
        command: report.commands.refreshProofMaterialCeremonyPackage,
      },
    ]);
    expect(report.commands.refreshProposal).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "lane-activation-proposal",
    ]);
    expect(report.routeManifestSelection).toEqual({
      manifestArtifactPath,
      manifestArtifactSha256: lane.manifestArtifactSha256,
    });
    expectExactManifestPin(
      report.commands.refreshActivationPackage,
      manifestArtifactPath,
      lane.manifestArtifactSha256,
    );
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
    expect(JSON.stringify(report)).not.toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
    );
  });

  it("builds a non-secret Solana activation package that surfaces disabled public lane blockers", () => {
    const report = buildSolanaActivationPackageReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      publicPreflight: {
        routeId: "taira_sol_xor",
        ready: false,
        manifestSource: "public",
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: false,
          disabledReason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          destinationRollout: {
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
        },
        checks: [
          {
            id: "solana-lane-publication",
            status: "fail",
            detail:
              "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          },
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor Solana testnet manifest found.",
          },
        ],
      },
      publicPreflightPath:
        "output/sccp-solana-deploy/activation-package-preflight/sccp-solana-route-preflight.json",
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: true,
        governedProductionMaterialValidated: true,
        productionMaterialComplete: true,
        readyToSubmitWithCurrentRuntime: true,
        bundleManifestSha256: materialHex32("proof-bundle"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      proofMaterialBundlePath:
        "output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json",
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      routePublicationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route-publication-request.json",
      routeManagerAccessRequest: {
        readyForOperatorReview: true,
        accessReady: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        requestHash: materialHex32("route-access"),
        blockers: [],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      routeManagerAccessRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route-manager-access-request.json",
      laneActivationRequest: {
        readyForLaneGovernanceReview: true,
        publicLaneReady: false,
        productionProofMaterialReady: true,
        productionLaneReady: false,
        laneActivationRequestHash: materialHex32("lane-activation"),
        blockers: [{ id: "public-solana-lane" }],
      },
      laneActivationRequestPath:
        "output/sccp-solana-deploy/taira-solana-xor-lane-activation-request.json",
      laneActivationProposal: {
        readyForGovernanceReview: true,
        productionLaneReady: false,
        readyToSubmitWithCurrentRuntime: false,
        proposalHash: materialHex32("lane-activation-proposal"),
        blockers: [{ id: "public-solana-lane" }],
      },
      laneActivationProposalPath:
        "output/sccp-solana-deploy/taira-solana-xor-lane-activation-proposal.json",
      publishReadiness: {
        readyForRuntimeSigner: true,
        readyToSubmitWithCurrentRuntime: true,
        blockers: [],
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          permissionAudit: {
            hasRequiredPermission: true,
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      publishReadinessPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json",
      productionRequirements: {
        readyToBuildIsi: true,
        readyToSubmitWithCurrentRuntime: true,
        blockers: [],
      },
      productionRequirementsPath:
        "output/sccp-solana-deploy/taira-solana-xor-production-requirements.json",
      operatorHandoff: {
        readyForOperatorReview: true,
        productionRouteReady: true,
        readyToPublish: true,
        handoffHash: materialHex32("operator-handoff"),
        blockers: [],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      operatorHandoffPath:
        "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
      smokeReadiness: {
        schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
        checkedAt: "2026-07-05T00:00:00.000Z",
        ready: false,
        checks: [
          {
            id: "route-preflight",
            status: "fail",
            detail: "Public route is not ready.",
          },
          {
            id: "walletconnect-project-id",
            status: "fail",
            detail: "WalletConnect project id is missing.",
          },
        ],
        missingProductionInputs: [
          { id: "solana-public-route-report" },
          { id: "walletconnect-project-id" },
        ],
        nextActions: [
          "refresh-solana-route-preflight",
          "configure-solana-walletconnect",
        ],
      },
      smokeReadinessPath: "output/sccp-solana-smoke-readiness/latest.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.schema).toBe("iroha-demo-sccp-solana-activation-package/v1");
    expect(report.readyForActivationReview).toBe(true);
    expect(report.productionActivationReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.publicTaira.publicSolanaLane).toMatchObject({
      present: true,
      ready: false,
      blockerIds: [
        "immutable-solana-verifier-program",
        "active-solana-trust-anchor",
      ],
      blockerDetails: [
        {
          id: "immutable-solana-verifier-program",
          detail:
            "immutable Solana verifier program is not deployed for this SCCP lane",
        },
        {
          id: "active-solana-trust-anchor",
          detail: "cryptographic trust anchor is not active for this SCCP lane",
        },
      ],
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "public-preflight",
      "public-solana-lane",
      "lane-activation-request",
      "public-route-publication",
    ]);
    expect(report.blockerIds).toEqual([
      "public-preflight",
      "public-solana-lane",
      "lane-activation-request",
      "public-route-publication",
    ]);
    expect(report.nextActions).toEqual([
      "public-preflight",
      "activate-public-solana-lane",
      "refresh-lane-activation-request",
      "publish-taira-solana-route-manifest",
    ]);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "public-preflight",
        blockedBy: [{ id: "public-preflight" }],
        command: report.commands.refreshPreflight,
      },
      {
        id: "activate-public-solana-lane",
        blockedBy: [{ id: "public-solana-lane" }],
        command: report.commands.refreshLaneActivationProposal,
      },
      {
        id: "refresh-lane-activation-request",
        blockedBy: [{ id: "lane-activation-request" }],
        command: report.commands.refreshLaneActivationRequest,
      },
      {
        id: "publish-taira-solana-route-manifest",
        blockedBy: [{ id: "public-route-publication" }],
        command: report.commands.publishRouteManifest,
        requiredInputs: [
          "taira-route-manager-i105-account",
          "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          "CanManageSccpRouteManifests",
        ],
      },
    ]);
    expect(report.commands.refreshSmokeReadiness).toEqual([
      "npm",
      "run",
      "e2e:sccp:solana-smoke-readiness",
      "--",
      "--allow-incomplete",
      "true",
    ]);
    expect(report.commands.refreshProofMaterialCeremonyPackage).toEqual([
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "proof-material-ceremony-package",
    ]);
    expect(report.artifacts.laneActivationProposal).toMatchObject({
      stableHash: materialHex32("lane-activation-proposal"),
      ready: true,
      productionReady: false,
      submitReady: false,
      blockerIds: ["public-solana-lane"],
    });
    expect(report.artifacts.smokeReadiness).toMatchObject({
      present: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      ready: false,
      productionReady: false,
      submitReady: false,
      blockerIds: ["route-preflight", "walletconnect-project-id"],
      failedCheckIds: ["route-preflight", "walletconnect-project-id"],
      missingProductionInputIds: [
        "solana-public-route-report",
        "walletconnect-project-id",
      ],
      nextActionIds: [
        "refresh-solana-route-preflight",
        "configure-solana-walletconnect",
      ],
    });
    expect(report.missingProductionInputIds).toEqual([
      "solana-public-route-report",
      "walletconnect-project-id",
    ]);
    expect(report.activationPackageHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(JSON.stringify(report)).not.toContain("do-not-leak");
  });

  it("surfaces explicit TAIRA public-node repair in Solana activation packages", () => {
    const publicNodeCommand = [
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
      "npm",
      "run",
      "sccp:solana:deploy",
      "--",
      "publish-readiness",
      "--torii-url",
      "https://<taira-public-node-root>",
      "--mcp-url",
      "https://<taira-public-node-root>/v1/mcp",
    ];
    const report = buildSolanaActivationPackageReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      publicPreflight: {
        routeId: "taira_sol_xor",
        ready: true,
        manifestSource: "public",
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: true,
        },
        checks: [
          { id: "public-route-publication", status: "pass" },
          { id: "solana-lane-publication", status: "pass" },
          { id: "solana-route-instance-publication", status: "pass" },
          { id: "route-manifest-shape", status: "pass" },
        ],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        bundleManifestSha256: materialHex32("proof-bundle"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      proofMaterialCeremonyPackage: {
        readyForCeremonyReview: true,
        productionRouteReady: true,
        productionProofMaterialIncluded: false,
        governedProductionMaterialValidated: true,
        productionMaterialComplete: true,
        blockers: [],
      },
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      routeManagerAccessRequest: {
        readyForOperatorReview: true,
        accessReady: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        requestHash: materialHex32("route-access"),
        blockers: [],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      laneActivationRequest: {
        readyForLaneGovernanceReview: true,
        publicLaneReady: true,
        productionProofMaterialReady: true,
        productionLaneReady: true,
        laneActivationRequestHash: materialHex32("lane-activation"),
        blockers: [],
      },
      laneActivationProposal: {
        readyForGovernanceReview: true,
        productionLaneReady: true,
        readyToSubmitWithCurrentRuntime: false,
        proposalHash: materialHex32("lane-activation-proposal"),
        blockers: [],
      },
      publishReadiness: {
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [{ id: "taira-explicit-public-node-target" }],
        publicEndpoint: {
          explicitPublicNodeCandidates: {
            blockerIds: ["taira-public-node-dns"],
          },
          explicitPublicNodeRepairPlan: {
            blockerIds: ["taira-public-node-tls"],
          },
        },
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          permissionAudit: { hasRequiredPermission: true },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
        },
        nextActionDetails: [
          {
            id: "provide-explicit-taira-public-node-target",
            command: publicNodeCommand,
            delegatedActions: [
              {
                id: "publish-direct-validator-dns-records",
                command: ["dig", "+short", "taira-validator-1.sora.org"],
                requiredInputs: ["taira-edge-dns-zone-access"],
              },
            ],
          },
        ],
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      operatorHandoff: {
        readyForOperatorReview: true,
        productionRouteReady: true,
        readyToPublish: true,
        handoffHash: materialHex32("operator-handoff"),
        blockers: [],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      smokeReadiness: {
        ready: true,
        checks: [],
        missingProductionInputs: [],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.nextActions).toContain("refresh-publish-readiness");
    expect(report.nextActions).toContain(
      "provide-explicit-taira-public-node-target",
    );
    const publicNodeAction = report.nextActionDetails.find(
      (action) => action.id === "provide-explicit-taira-public-node-target",
    );
    expect(publicNodeAction).toMatchObject({
      blockedBy: expect.arrayContaining([
        expect.objectContaining({ id: "taira-explicit-public-node-target" }),
        expect.objectContaining({ id: "taira-public-node-dns" }),
        expect.objectContaining({ id: "taira-public-node-tls" }),
      ]),
      command: publicNodeCommand,
      delegatedActions: [
        expect.objectContaining({
          id: "publish-direct-validator-dns-records",
          requiredInputIds: ["taira-edge-dns-zone-access"],
        }),
      ],
      requiredInputIds: [
        "taira-public-node-root-url",
        "taira-public-node-mcp-url",
      ],
    });
  });

  it("surfaces governed Solana production input ids from activation proof-material blockers", () => {
    const requiredProductionInputs = SOLANA_GOVERNED_PRODUCTION_INPUT_IDS.map(
      (id) => ({
        id,
        kind: "reviewed-public-record",
        description: id,
      }),
    );
    const report = buildSolanaActivationPackageReportBody({
      args: {
        authority: ROUTE_MANAGER_AUTHORITY,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      publicPreflight: {
        routeId: "taira_sol_xor",
        ready: true,
        manifestSource: "public",
        publicSolanaLane: {
          chain: "sol",
          counterpartyDomain: 3,
          productionReady: true,
        },
        checks: [
          { id: "public-route-publication", status: "pass" },
          { id: "solana-lane-publication", status: "pass" },
          { id: "route-manifest-shape", status: "pass" },
        ],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        bundleManifestSha256: materialHex32("proof-bundle"),
        blockers: [],
        upstreamBlockerIds: ["production-requirements"],
      },
      proofMaterialCeremonyPackage: {
        readyForCeremonyReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        ceremonyPackageHash: materialHex32("ceremony"),
        blockers: [{ id: "governed-proof-material" }],
        requiredProductionInputs,
        missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
        nextActionDetails: [
          {
            id: "publish-governed-solana-proof-material",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "production-manifest-patch",
            ],
            requiredInputs: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
          },
        ],
      },
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        reviewPackageHash: materialHex32("route-publication"),
        blockers: [{ id: "production-requirements" }],
        upstreamBlockerIds: ["source-verifier-material"],
      },
      routeManagerAccessRequest: {
        readyForOperatorReview: true,
        accessReady: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        requestHash: materialHex32("route-access"),
        blockers: [],
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
      },
      laneActivationRequest: {
        readyForLaneGovernanceReview: true,
        publicLaneReady: true,
        productionProofMaterialReady: false,
        productionLaneReady: true,
        laneActivationRequestHash: materialHex32("lane-activation"),
        blockers: [],
      },
      publishReadiness: {
        readyForRuntimeSigner: true,
        readyToSubmitWithCurrentRuntime: true,
        blockers: [],
        runtimeSigning: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          permissionAudit: { hasRequiredPermission: true },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
        },
      },
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
        nextActionDetails: [
          {
            id: "publish-governed-solana-source-material",
            command: ["python3", "../iroha/scripts/source-material.py"],
            requiredInputs: [{ id: "sourceTrustAnchorHash" }],
          },
        ],
      },
      operatorHandoff: {
        readyForOperatorReview: true,
        productionRouteReady: false,
        readyToPublish: false,
        handoffHash: materialHex32("operator-handoff"),
        blockers: [{ id: "production-route-material" }],
        requiredProductionInputs,
        missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
        requiredRouteManager: {
          authority: ROUTE_MANAGER_AUTHORITY,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: true,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
        },
      },
      smokeReadiness: {
        ready: true,
        checks: [],
        missingProductionInputs: [],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.productionActivationReady).toBe(false);
    expect(report.missingProductionInputIds).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.requiredProductionInputs.map((input) => input.id)).toEqual(
      SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    );
    expect(report.artifacts.proofMaterialCeremonyPackage).toMatchObject({
      missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    });
    expect(report.artifacts.operatorHandoff).toMatchObject({
      missingProductionInputIds: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
    });
    expect(report.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "complete-governed-proof-material",
          requiredInputs: SOLANA_GOVERNED_PRODUCTION_INPUT_IDS,
          delegatedActions: expect.arrayContaining([
            expect.objectContaining({
              id: "publish-governed-solana-proof-material",
            }),
            expect.objectContaining({
              id: "publish-governed-solana-source-material",
            }),
          ]),
        }),
      ]),
    );
  });

  it("marks activation submit-ready only for the exact public manifest canonical hash", () => {
    const manifestCanonicalSha256 = materialHex32(
      "activation-public-manifest-canonical",
    );
    const buildReport = (
      checkedAt,
      observedManifestCanonicalSha256 = manifestCanonicalSha256,
    ) =>
      buildSolanaActivationPackageReportBody({
        args: {
          authority: ROUTE_MANAGER_AUTHORITY,
          "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
        },
        publicPreflight: {
          routeId: "taira_sol_xor",
          ready: true,
          manifestSource: "public",
          publicSolanaLane: {
            chain: "sol",
            counterpartyDomain: 3,
            productionReady: true,
          },
          checks: [
            {
              id: "public-route-publication",
              status: "pass",
              detail: "Public route is published.",
            },
            {
              id: "solana-lane-publication",
              status: "pass",
              detail:
                "Public TAIRA Solana SCCP lane manifest is production-ready.",
            },
            {
              id: "solana-route-instance-publication",
              status: "pass",
              detail:
                "Public TAIRA exposes the taira_sol_xor Solana route manifest.",
            },
            {
              id: "route-manifest-shape",
              status: "pass",
              detail: "Route manifest is production-ready.",
              evidence: {
                manifestCanonicalSha256: observedManifestCanonicalSha256,
              },
            },
          ],
        },
        manifestCanonicalSha256,
        publicPreflightPath:
          "output/sccp-solana-deploy/activation-package-preflight/sccp-solana-route-preflight.json",
        proofMaterialBundle: {
          checkedAt,
          readyForProofMaterialCeremony: true,
          productionRouteReady: true,
          governedProductionMaterialValidated: true,
          productionMaterialComplete: true,
          readyToSubmitWithCurrentRuntime: true,
          bundleManifestSha256: materialHex32("proof-bundle"),
          blockers: [],
          upstreamBlockerIds: [],
        },
        routePublicationRequest: {
          checkedAt,
          readyForRouteManagerReview: true,
          productionRouteReady: true,
          readyToSubmitWithCurrentRuntime: true,
          reviewPackageHash: materialHex32("route-publication"),
          blockers: [],
          upstreamBlockerIds: [],
        },
        routeManagerAccessRequest: {
          checkedAt,
          readyForOperatorReview: true,
          accessReady: true,
          productionRouteReady: true,
          readyToSubmitWithCurrentRuntime: true,
          requestHash: materialHex32("route-access"),
          blockers: [],
          requiredRouteManager: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            authorityFormatReady: true,
            requiredPermission: "CanManageSccpRouteManifests",
            hasRequiredPermission: true,
          },
          runtimeSigning: {
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: true,
            privateKeyStoredInReport: false,
          },
        },
        laneActivationRequest: {
          checkedAt,
          readyForLaneGovernanceReview: true,
          publicLaneReady: true,
          productionProofMaterialReady: true,
          productionLaneReady: true,
          laneActivationRequestHash: materialHex32("lane-activation"),
          blockers: [],
        },
        publishReadiness: {
          checkedAt,
          readyForRuntimeSigner: true,
          readyToSubmitWithCurrentRuntime: true,
          blockers: [],
          runtimeSigning: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            authorityFormatReady: true,
            permissionAudit: {
              hasRequiredPermission: true,
            },
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: true,
            privateKeyStoredInReport: false,
          },
        },
        productionRequirements: {
          checkedAt,
          readyToBuildIsi: true,
          readyToSubmitWithCurrentRuntime: true,
          blockers: [],
        },
        operatorHandoff: {
          checkedAt,
          readyForOperatorReview: true,
          productionRouteReady: true,
          readyToPublish: true,
          handoffHash: materialHex32("operator-handoff"),
          blockers: [],
          requiredRouteManager: {
            authority: ROUTE_MANAGER_AUTHORITY,
            authorityReady: true,
            authorityFormatReady: true,
            requiredPermission: "CanManageSccpRouteManifests",
            hasRequiredPermission: true,
          },
          runtimeSigning: {
            privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
            privateKeyEnvPresent: true,
            privateKeyStoredInReport: false,
          },
        },
        checkedAt,
      });

    const first = buildReport("2026-07-05T00:00:00.000Z");
    const second = buildReport("2026-07-05T01:00:00.000Z");
    const mismatched = buildReport(
      "2026-07-05T02:00:00.000Z",
      materialHex32("different-public-manifest-canonical"),
    );

    expect(first.readyForActivationReview).toBe(true);
    expect(first.productionActivationReady).toBe(true);
    expect(first.readyToSubmitWithCurrentRuntime).toBe(true);
    expect(first.publicRouteAlreadyPublished).toBe(true);
    expect(first.blockers).toEqual([]);
    expect(mismatched.publicRouteAlreadyPublished).toBe(false);
    expect(mismatched.productionActivationReady).toBe(false);
    expect(mismatched.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(mismatched.blockers).toContainEqual(
      expect.objectContaining({ id: "public-route-publication" }),
    );
    expect(second.activationPackageHash).toBe(first.activationPackageHash);
    expect(first.activationHashPolicy).toMatchObject({
      volatileJsonFieldsIgnored: ["checkedAt", "checked_at"],
      inputs: expect.arrayContaining(["smokeReadinessBlockerIds"]),
    });
  });

  it("completes exact-public activation without re-requiring route-manager signing", () => {
    const manifestCanonicalSha256 = materialHex32(
      "already-public-activation-manifest",
    );
    const buildReport = (observedManifestCanonicalSha256) =>
      buildSolanaActivationPackageReportBody({
        publicPreflight: {
          ...publishedSolanaRoutePreflight(observedManifestCanonicalSha256),
          publicSolanaLane: {
            chain: "sol",
            counterpartyDomain: 3,
            productionReady: true,
          },
        },
        manifestCanonicalSha256,
        proofMaterialBundle: {
          readyForProofMaterialCeremony: true,
          productionRouteReady: true,
          governedProductionMaterialValidated: true,
          productionMaterialComplete: true,
          bundleManifestSha256: materialHex32("activation-proof-bundle"),
          blockers: [],
          upstreamBlockerIds: [],
        },
        routePublicationRequest: {
          readyForRouteManagerReview: false,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          blockers: [{ id: "runtime-signing-key" }],
        },
        routeManagerAccessRequest: {
          readyForOperatorReview: false,
          accessReady: false,
          productionRouteReady: false,
          readyToSubmitWithCurrentRuntime: false,
          blockers: [
            { id: "route-manager-permission" },
            { id: "runtime-signing-key" },
          ],
          requiredRouteManager: {
            authorityReady: false,
            hasRequiredPermission: false,
          },
          runtimeSigning: { privateKeyEnvPresent: false },
        },
        laneActivationRequest: {
          readyForLaneGovernanceReview: true,
          publicLaneReady: true,
          productionProofMaterialReady: true,
          productionLaneReady: true,
          blockers: [],
        },
        publishReadiness: {
          publicationSatisfied: true,
          submissionRequired: false,
          readyForRuntimeSigner: false,
          readyToSubmitWithCurrentRuntime: false,
          blockers: [],
          runtimeSigning: { privateKeyEnvPresent: false },
        },
        productionRequirements: {
          readyToBuildIsi: true,
          blockers: [],
        },
        operatorHandoff: {
          readyForOperatorReview: false,
          productionRouteReady: false,
          readyToPublish: false,
          blockers: [
            { id: "route-manager-permission" },
            { id: "runtime-signing-key" },
          ],
        },
      });

    const exact = buildReport(manifestCanonicalSha256);
    expect(exact).toMatchObject({
      ready: true,
      readyForActivationReview: true,
      productionActivationReady: true,
      publicationSatisfied: true,
      submissionRequired: false,
      readyToSubmitWithCurrentRuntime: false,
      blockers: [],
      nextActions: [],
    });

    const mismatch = buildReport(
      materialHex32("different-activation-public-manifest"),
    );
    expect(mismatch.publicationSatisfied).toBe(false);
    expect(mismatch.ready).toBe(false);
    expect(mismatch.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(mismatch.blockerIds).toEqual(
      expect.arrayContaining([
        "public-route-publication",
        "route-manager-access",
        "publish-readiness",
        "runtime-route-manager",
      ]),
    );
  });

  it("does not treat a Solana pubkey as a TAIRA route-manager access authority", () => {
    const solanaPubkey = "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf";
    const report = buildSolanaRouteManagerAccessRequestReportBody({
      args: {
        authority: solanaPubkey,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        reviewPackageHash: hex32("88"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      publishReadiness: {
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: {
            ready: true,
            publicationMode: "signed-transaction-body-base64",
          },
        },
        runtimeSigning: {
          authority: solanaPubkey,
          authorityReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          permissionAudit: {
            checked: true,
            ready: true,
            hasRequiredPermission: true,
            permissions: ["CanManageSccpRouteManifests"],
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
        blockers: [],
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      proofMaterialBundle: {
        productionRouteReady: true,
        governedProductionMaterialValidated: true,
        productionMaterialComplete: true,
        bundleManifestSha256: hex32("77"),
        upstreamBlockerIds: [],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.readyForOperatorReview).toBe(false);
    expect(report.accessReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.requiredRouteManager).toMatchObject({
      authority: solanaPubkey,
      authorityReady: false,
      authorityFormatReady: false,
      hasRequiredPermission: true,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manager-authority",
    ]);
    expect(report.blockers[0]).toMatchObject({
      authority: solanaPubkey,
      expectedPrefix: "testu",
    });
    expect(report.commands.verifyAccess).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publishReadiness).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publishRouteManifest).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.verifyAccess).not.toContain(solanaPubkey);
    expect(report.commands.publishRouteManifest).not.toContain(solanaPubkey);
  });

  it("does not treat a short testu label as a TAIRA route-manager access authority", () => {
    const fakeAuthority = "testu-route-manager";
    const report = buildSolanaRouteManagerAccessRequestReportBody({
      args: {
        authority: fakeAuthority,
        "private-key-env": "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      },
      routePublicationRequest: {
        readyForRouteManagerReview: true,
        productionRouteReady: true,
        readyToSubmitWithCurrentRuntime: true,
        reviewPackageHash: hex32("88"),
        blockers: [],
        upstreamBlockerIds: [],
      },
      publishReadiness: {
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: {
            ready: true,
            publicationMode: "signed-transaction-body-base64",
          },
        },
        runtimeSigning: {
          authority: fakeAuthority,
          authorityReady: true,
          authorityFormatReady: true,
          requiredPermission: "CanManageSccpRouteManifests",
          permissionAudit: {
            checked: true,
            ready: true,
            hasRequiredPermission: true,
            permissions: ["CanManageSccpRouteManifests"],
          },
          privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
          privateKeyEnvPresent: true,
          privateKeyStoredInReport: false,
        },
        blockers: [],
      },
      productionRequirements: {
        readyToBuildIsi: true,
        blockers: [],
      },
      proofMaterialBundle: {
        productionRouteReady: true,
        governedProductionMaterialValidated: true,
        productionMaterialComplete: true,
        bundleManifestSha256: hex32("77"),
        upstreamBlockerIds: [],
      },
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.readyForOperatorReview).toBe(false);
    expect(report.accessReady).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.requiredRouteManager).toMatchObject({
      authority: fakeAuthority,
      authorityReady: false,
      authorityFormatReady: false,
      hasRequiredPermission: true,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manager-authority",
    ]);
    expect(report.commands.verifyAccess).toContain(
      "SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY=<taira-route-manager-account-id>",
    );
    expect(report.commands.publishRouteManifest).not.toContain(fakeAuthority);
  });

  it("fails the Solana route publication request when review evidence is incomplete", () => {
    const report = buildSolanaRoutePublicationRequestReportBody({
      manifest: {
        route_id: "wrong_route",
        asset_key: "xor",
        disabledReason: "draft route",
      },
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      productionRequirements: {
        readyToBuildIsi: false,
        blockers: [{ id: "source-verifier-material" }],
      },
      publishReadiness: {
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: false,
          endpointChecks: [{ id: "taira-endpoint", status: "fail" }],
          mcpTransactionTools: {
            ready: false,
            missingTools: ["iroha.transactions.submit"],
          },
        },
        routeManifestIsi: {
          ready: false,
          error: "A production UpsertSccpRouteManifest ISI is not available.",
        },
        blockers: [{ id: "taira-public-endpoint" }],
      },
      proofMaterialBundle: {
        readyForProofMaterialCeremony: false,
        blockers: [{ id: "required-artifact-missing" }],
        upstreamBlockerIds: ["production-requirements"],
      },
    });

    expect(report.readyForRouteManagerReview).toBe(false);
    expect(report.readyToSubmitWithCurrentRuntime).toBe(false);
    expect(report.manifest.error).toContain("manifest.disabledReason");
    expect(report.blockers.map((blocker) => blocker.id)).toEqual([
      "route-manifest-identity",
      "route-manifest-production-shape",
      "proof-material-bundle",
      "taira-public-endpoint",
      "taira-mcp-transaction-tools",
      "production-requirements",
      "publish-readiness",
      "route-manifest-isi",
    ]);
  });

  it("verifies Solana source material handoff pins without treating it as production proof material", () => {
    const handoff = {
      schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
      readyForProofMaterialCeremony: true,
      productionProofMaterialIncluded: false,
      observedPins: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        verifierCodeHash: hex32("ab"),
        programdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programdataSlot: "419725105",
        destinationBindingHash: hex32("db"),
        bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
        sourceBridgeConfigHash: hex32("11"),
        routeCanaryEvidenceHash: hex32("13"),
        sourceBurnAmountBaseUnits: "1",
        sourceBurnHash: hex32("12"),
        routeCanarySignature:
          "5f2DrmLWtY7MUaYeswU7r9Yup5fJvMksZhGK3u98AgpNTCnpHPuyVbYHaU523Y1u6ReMvRDV21v2kTcQaiG32Bn2",
        sourceBurnSignature:
          "5Hfd2BBsUdDoVVKEUdcqMWMyE6aZ4ctNSA6AprqC8tkqhzMikMXRGLajHStsc9SgFs4j2QJU7VtYsezCqG6KYmgm",
      },
    };
    const executableAccount = (address) => ({
      address,
      summary: { address, executable: true },
    });
    const report = buildSolanaSourceMaterialHandoffVerificationReportBody({
      handoff,
      accounts: {
        verifierProgram: executableAccount(
          handoff.observedPins.verifierProgramId,
        ),
        bridgeProgram: executableAccount(handoff.observedPins.bridgeProgramId),
        sourceBridgeProgram: executableAccount(
          handoff.observedPins.sourceBridgeProgramId,
        ),
        tokenMint: {
          address: handoff.observedPins.tokenMintAddress,
          summary: {
            address: handoff.observedPins.tokenMintAddress,
            executable: false,
          },
          parsed: { initialized: true, decimals: 9 },
        },
        verifierState: {
          address: handoff.observedPins.verifierStateAddress,
          summary: {
            address: handoff.observedPins.verifierStateAddress,
            executable: false,
          },
          parsed: { storedMint: handoff.observedPins.tokenMintAddress },
        },
        sourceState: {
          address: handoff.observedPins.sourceStateAddress,
          summary: {
            address: handoff.observedPins.sourceStateAddress,
            executable: false,
          },
          parsed: {
            storedMint: handoff.observedPins.tokenMintAddress,
            totalBurned: "1",
            lastBurnHash: hex32("12"),
          },
        },
      },
      signatureStatuses: {
        routeCanary: {
          slot: 1,
          confirmations: null,
          confirmationStatus: "finalized",
          err: null,
        },
        sourceBurn: {
          slot: 2,
          confirmations: null,
          confirmationStatus: "finalized",
          err: null,
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.deploymentReady).toBe(true);
    expect(report.productionProofMaterialIncluded).toBe(false);
    expect(report.deploymentBlockers).toEqual([]);
    expect(report.sourceBurnBlockers).toEqual([]);
    expect(report.blockers).toEqual([]);
    expect(report.statuses.every((status) => status.status === "pass")).toBe(
      true,
    );

    const failClosedCanaryReport =
      buildSolanaSourceMaterialHandoffVerificationReportBody({
        handoff,
        accounts: {
          verifierProgram: executableAccount(
            handoff.observedPins.verifierProgramId,
          ),
          bridgeProgram: executableAccount(
            handoff.observedPins.bridgeProgramId,
          ),
          sourceBridgeProgram: executableAccount(
            handoff.observedPins.sourceBridgeProgramId,
          ),
          tokenMint: {
            address: handoff.observedPins.tokenMintAddress,
            summary: {
              address: handoff.observedPins.tokenMintAddress,
              executable: false,
            },
            parsed: { initialized: true, decimals: 9 },
          },
          verifierState: {
            address: handoff.observedPins.verifierStateAddress,
            summary: {
              address: handoff.observedPins.verifierStateAddress,
              executable: false,
            },
            parsed: { storedMint: handoff.observedPins.tokenMintAddress },
          },
          sourceState: {
            address: handoff.observedPins.sourceStateAddress,
            summary: {
              address: handoff.observedPins.sourceStateAddress,
              executable: false,
            },
            parsed: {
              storedMint: handoff.observedPins.tokenMintAddress,
              totalBurned: "1",
              lastBurnHash: hex32("12"),
            },
          },
        },
        signatureStatuses: {
          routeCanary: {
            slot: 1,
            confirmations: null,
            confirmationStatus: "finalized",
            err: {
              InstructionError: [0, "InvalidInstructionData"],
            },
          },
          sourceBurn: {
            slot: 2,
            confirmations: null,
            confirmationStatus: "finalized",
            err: null,
          },
        },
        routeCanarySubmission: {
          signature: handoff.observedPins.routeCanarySignature,
          diagnosticOnly: true,
          failClosed: true,
          runtimeRejected: true,
          confirmation: {
            err: {
              InstructionError: [0, "InvalidInstructionData"],
            },
          },
          logs: [`Program log: ${SOLANA_NATIVE_VERIFIER_NOT_CONFIGURED_LOG}`],
        },
        checkedAt: "2026-07-04T00:00:00.000Z",
      });

    expect(failClosedCanaryReport.ready).toBe(true);
    expect(failClosedCanaryReport.deploymentReady).toBe(true);
    expect(
      failClosedCanaryReport.statuses.find(
        (status) => status.id === "route-canary-signature-finalized",
      ),
    ).toMatchObject({
      status: "pass",
      detail:
        "Diagnostic route canary is finalized on Solana with the expected fail-closed verifier error.",
    });

    const drifted = buildSolanaSourceMaterialHandoffVerificationReportBody({
      handoff,
      accounts: {
        verifierProgram: executableAccount(
          handoff.observedPins.verifierProgramId,
        ),
        bridgeProgram: executableAccount(handoff.observedPins.bridgeProgramId),
        sourceBridgeProgram: executableAccount(
          handoff.observedPins.sourceBridgeProgramId,
        ),
        tokenMint: {
          address: handoff.observedPins.tokenMintAddress,
          summary: { executable: false },
          parsed: { initialized: true, decimals: 9 },
        },
        verifierState: {
          address: handoff.observedPins.verifierStateAddress,
          summary: { executable: false },
          parsed: { storedMint: handoff.observedPins.tokenMintAddress },
        },
        sourceState: {
          address: handoff.observedPins.sourceStateAddress,
          summary: { executable: false },
          parsed: {
            storedMint: handoff.observedPins.tokenMintAddress,
            totalBurned: "1",
            lastBurnHash: hex32("34"),
          },
        },
      },
      signatureStatuses: {
        routeCanary: { confirmationStatus: "finalized", err: null },
        sourceBurn: { confirmationStatus: "finalized", err: null },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    expect(drifted.ready).toBe(false);
    expect(drifted.deploymentReady).toBe(true);
    expect(drifted.blockers.map((blocker) => blocker.id)).toContain(
      "source-state-account",
    );
    expect(drifted.deploymentBlockers).toEqual([]);
    expect(drifted.sourceBurnBlockers.map((blocker) => blocker.id)).toEqual([
      "source-state-account",
    ]);
  });

  it("does not report a source-state mismatch before source-burn evidence exists", () => {
    const handoff = {
      schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
      readyForProofMaterialCeremony: false,
      productionProofMaterialIncluded: false,
      observedPins: {
        verifierProgramId: "6Q3jF6UmEH5sYBYF3iU43rfFroJjZVXiejvVG88fUZ7K",
        verifierCodeHash: hex32("ab"),
        programdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programdataSlot: "419725105",
        destinationBindingHash: hex32("db"),
        bridgeProgramId: "H8iFVbmr2Yk85AuMDFcKaRv5rRPPMZaTEpj4QPntiNgf",
        sourceBridgeProgramId: "CmGQYvNgCS9yycdp5tsKmGoDhJrwmEPg6oQrNwj64WQe",
        tokenMintAddress: "7x76GchSm2spUY8koAFMaFwx5x7FjoMUDJa2vSfTDmre",
        verifierStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
        sourceStateAddress: "433bWoeHHuaK2fLJWDJyk1EBxVhrQtp8Eie6YKkCiD6r",
        sourceBridgeConfigHash: hex32("11"),
        routeCanaryEvidenceHash: hex32("13"),
        sourceBurnAmountBaseUnits: "1",
        sourceBurnHash: null,
      },
    };
    const executableAccount = (address) => ({
      address,
      summary: { address, executable: true },
    });
    const report = buildSolanaSourceMaterialHandoffVerificationReportBody({
      handoff,
      accounts: {
        verifierProgram: executableAccount(
          handoff.observedPins.verifierProgramId,
        ),
        bridgeProgram: executableAccount(handoff.observedPins.bridgeProgramId),
        sourceBridgeProgram: executableAccount(
          handoff.observedPins.sourceBridgeProgramId,
        ),
        tokenMint: {
          address: handoff.observedPins.tokenMintAddress,
          summary: { executable: false },
          parsed: { initialized: true, decimals: 9 },
        },
        verifierState: {
          address: handoff.observedPins.verifierStateAddress,
          summary: { executable: false },
          parsed: { storedMint: handoff.observedPins.tokenMintAddress },
        },
        sourceState: {
          address: handoff.observedPins.sourceStateAddress,
          summary: { executable: false },
          parsed: {
            storedMint: handoff.observedPins.tokenMintAddress,
            totalBurned: "0",
            lastBurnHash: null,
          },
        },
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(
      report.statuses.find((status) => status.id === "source-state-account"),
    ).toMatchObject({
      status: "pass",
    });
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "source-state-account",
    );
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "handoff-ready-for-proof-material-ceremony",
    );
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "route-canary-signature-finalized",
        "source-burn-signature-finalized",
      ]),
    );
  });

  it("reports missing Solana source handoff pins without positive blocker text", () => {
    const report = buildSolanaSourceMaterialHandoffVerificationReportBody({
      handoff: {
        schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
        readyForProofMaterialCeremony: false,
        productionProofMaterialIncluded: false,
        observedPins: {},
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });
    const readinessStatus = report.statuses.find(
      (status) => status.id === "handoff-ready-for-proof-material-ceremony",
    );

    expect(report.ready).toBe(false);
    expect(readinessStatus).toMatchObject({
      status: "fail",
      detail:
        "Handoff is missing live deployment or route-canary pins required by the proof-material ceremony.",
    });
    expect(report.blockers).toContainEqual(
      expect.objectContaining({
        id: "handoff-ready-for-proof-material-ceremony",
        detail:
          "Handoff is missing live deployment or route-canary pins required by the proof-material ceremony.",
      }),
    );
  });

  it("exposes root blockerIds for blocked Solana SCCP deployment reports", () => {
    const blockedReports = [
      buildSolanaPostDeployFullTomlReportBody(),
      buildSolanaProductionMaterialValidationReportBody({
        inventory: { ready: false, blockers: [{ id: "inventory-material" }] },
      }),
      buildSolanaSourceMaterialHandoffReportBody(),
      buildSolanaProofMaterialRequestReportBody(),
      buildSolanaProofMaterialBundleReportBody(),
      buildSolanaProofMaterialCeremonyPackageReportBody(),
      buildSolanaSourceMaterialHandoffVerificationReportBody(),
      buildBlockedSolanaSourceBurnSubmissionReportBody({
        readinessReport: {
          blockers: [{ id: "token-mint-supply" }],
        },
      }),
      buildSolanaProverReadinessReportBody(),
      buildSolanaPostDeployEvidenceReportBody(),
      buildSolanaProductionRequirementsReportBody(),
    ];

    for (const report of blockedReports) {
      expect(report.blockers.length).toBeGreaterThan(0);
      expect(report.blockerIds).toEqual(
        report.blockers.map((blocker) => blocker.id).filter(Boolean),
      );
    }
  });
});

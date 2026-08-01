import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
  DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
  SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
  SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV,
  SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV,
  SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
  evaluateSolanaSccpLiveSmokeReadiness,
  loadSolanaExactProverApprovalForSmoke,
  loadSolanaSccpSmokeEnvFiles,
  runLocalProverSelfTest,
  runSolanaSccpLiveSmokeReadiness,
  solanaSccpLiveSmokeReadinessRunbookProblems,
  validateSolanaSccpProverSidecar,
} from "../scripts/e2e/sccp-solana-live-smoke-readiness.mjs";
import { WALLETCONNECT_PROJECT_ID_ENV } from "../scripts/e2e/sccp-live-smoke-readiness.mjs";
import {
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_DESTINATION_VERIFIER_PLAN,
  SOLANA_TESTNET_CAIP_CHAIN_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
  SOLANA_VERIFIER_TARGET,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";
import {
  buildSolanaProverKnownAnswerVectorCandidate,
  solanaProverKnownAnswerVectorHash,
  validateSolanaProverKnownAnswerResult,
} from "../scripts/sccp-solana-prover-known-answer.mjs";
import {
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
} from "../scripts/e2e/sccp-solana-exact-prover-governance.mjs";

const DESTINATION_MODULE_HASH = `0x${"11".repeat(32)}`;
const SOURCE_MODULE_HASH = `0x${"22".repeat(32)}`;
const WALLETCONNECT_PROJECT_ID = "0123456789abcdef0123456789abcdef";
const APPROVAL_HASH = `0x${createHash("sha256")
  .update("independent-governance-approval")
  .digest("hex")}`;
const GOVERNANCE_PLAN_HASH = `0x${"55".repeat(32)}`;
const ORDERED_INITIALIZATION_HASH = `0x${"66".repeat(32)}`;
const CAPTURE_REVIEW_POLICY_HASH = `0x${createHash("sha256")
  .update("capture-review-policy")
  .digest("hex")}`;

const readyRoutePreflight = () => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v2",
  protocolSource: "typed-sccp-registry-v1",
  ready: true,
  routeId: "taira_sol_xor",
  assetKey: "xor",
  routeRevision: 1,
  manifestSource: "public-registry",
  solana: {
    network: "solana-testnet",
    caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  },
  checks: [
    { id: "taira-endpoint", status: "pass", detail: "ok" },
    { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
    { id: "sccp-registry-load", status: "pass", detail: "ok" },
    { id: "route-registry-shape", status: "pass", detail: "ok" },
  ],
});

const readyKnownAnswer = (direction) => {
  const result =
    direction === "destination"
      ? {
          request: { routeId: "taira_sol_xor" },
          submission: { proofBytes: `0x${"aa".repeat(64)}` },
        }
      : {
          messageBundle: { finality_proof: `0x${"bb".repeat(64)}` },
          settlement: { routeId: "taira_sol_xor" },
        };
  const artifactEvidence = {
    verifierKeyHash: `0x${createHash("sha256").update(`${direction}:verifier-key`).digest("hex")}`,
    verifierArtifactHash: `0x${createHash("sha256").update(`${direction}:verifier-artifact`).digest("hex")}`,
    verificationReceiptHash: `0x${createHash("sha256").update(`${direction}:verification-receipt`).digest("hex")}`,
  };
  const vector = buildSolanaProverKnownAnswerVectorCandidate({
    direction,
    result,
    artifactEvidence,
  });
  return validateSolanaProverKnownAnswerResult({
    direction,
    result,
    vector,
    artifactEvidence,
    governance: {
      approvalHash: APPROVAL_HASH,
      expectedApprovalHash: APPROVAL_HASH,
      vectorHashPin: solanaProverKnownAnswerVectorHash(vector),
    },
  });
};

const readyGovernanceBinding = ({ direction, moduleHash, knownAnswer }) => ({
  schema: "iroha-sccp-solana-prover-sidecar-governance-binding/v1",
  ready: true,
  direction,
  approvalId: "parliament-solana-prover-approval-1",
  approvalSha256: APPROVAL_HASH,
  expectedApprovalSha256: APPROVAL_HASH,
  governancePlanCanonicalSha256: GOVERNANCE_PLAN_HASH,
  orderedInitializationEvidenceSha256: ORDERED_INITIALIZATION_HASH,
  approvedModuleHash: moduleHash,
  approvedVectorHash: knownAnswer.vectorHash,
  moduleHash,
  vectorHash: knownAnswer.vectorHash,
  errors: [],
});

const readyApprovalRecord = ({
  destinationModuleHash = DESTINATION_MODULE_HASH,
  sourceModuleHash = SOURCE_MODULE_HASH,
} = {}) => ({
  schema: "iroha-sccp-solana-production-prover-approval/v2",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
  approved: true,
  approvalId: "parliament-solana-prover-approval-1",
  pins: {
    captureReviewPolicySha256: CAPTURE_REVIEW_POLICY_HASH,
    governancePlanCanonicalSha256: GOVERNANCE_PLAN_HASH,
    orderedInitializationEvidenceSha256: ORDERED_INITIALIZATION_HASH,
    destinationProverModuleHash: destinationModuleHash,
    destinationProverKnownAnswerVectorHash:
      readyKnownAnswer("destination").vectorHash,
    sourceProverModuleHash: sourceModuleHash,
    sourceProverKnownAnswerVectorHash: readyKnownAnswer("source").vectorHash,
  },
});

const readyApprovalValidation = (overrides = {}) =>
  buildExactSolanaProductionProverApprovalValidation({
    approvalRecord: readyApprovalRecord(overrides),
    approvalSha256: APPROVAL_HASH,
    expectedApprovalSha256: APPROVAL_HASH,
  });

const readyApprovalSummary = (validation = readyApprovalValidation()) => ({
  schema: validation.schema,
  ready: validation.ready,
  approvalId: validation.approvalId,
  approvalSha256: validation.approvalSha256,
  expectedApprovalSha256: validation.expectedApprovalSha256,
  blockerIds: validation.blockerIds,
});

const readyProverInspection = (
  moduleHash = DESTINATION_MODULE_HASH,
  sidecarHash = `0x${"33".repeat(32)}`,
) => {
  const direction =
    moduleHash === SOURCE_MODULE_HASH ? "source" : "destination";
  const proofProbe = readyKnownAnswer(direction);
  return {
    inspected: true,
    exists: true,
    exportsOk: true,
    ready: true,
    moduleHash,
    sidecarHash,
    sidecarReady: true,
    sidecarErrors: [],
    selfTest: { ready: true },
    proofProbe,
    governanceApprovalBinding: readyGovernanceBinding({
      direction,
      moduleHash,
      knownAnswer: proofProbe,
    }),
    governanceApproval: readyApprovalSummary(),
  };
};

const readyDestinationSidecar = () => {
  const knownAnswer = readyKnownAnswer("destination");
  return {
    schema: "iroha-demo-sccp-solana-browser-prover-sidecar/v1",
    routeId: "taira_sol_xor",
    route_id: "taira_sol_xor",
    assetKey: "xor",
    asset_key: "xor",
    network: "solana-testnet",
    solanaNetwork: "solana-testnet",
    solana_network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
    direction: "destination",
    sourceDomain: 0,
    source_domain: 0,
    targetDomain: 3,
    target_domain: 3,
    moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    module_url: "/sccp-solana/taira-solana-xor-destination-prover.js",
    moduleHash: DESTINATION_MODULE_HASH,
    module_hash: DESTINATION_MODULE_HASH,
    proveExport: "proveSolanaSccpDestination",
    prove_export: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
    self_test_export: "solanaSccpDestinationProverSelfTest",
    proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
    proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
    requiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
    required_proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
    destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
    destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
    verifierTarget: SOLANA_VERIFIER_TARGET,
    verifier_target: SOLANA_VERIFIER_TARGET,
    productionProofsReady: true,
    production_proofs_ready: true,
    knownAnswer,
    governanceApprovalBinding: readyGovernanceBinding({
      direction: "destination",
      moduleHash: DESTINATION_MODULE_HASH,
      knownAnswer,
    }),
  };
};

const validateDestinationSidecar = (sidecar) =>
  validateSolanaSccpProverSidecar({
    sidecar,
    direction: "destination",
    moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    moduleHash: DESTINATION_MODULE_HASH,
    proveExport: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
    expectedApprovalSha256: APPROVAL_HASH,
    approvalValidation: readyApprovalValidation(),
  });

describe("Solana SCCP live smoke-readiness", () => {
  it("accepts clean Solana prover sidecar aliases", () => {
    expect(validateDestinationSidecar(readyDestinationSidecar())).toEqual([]);
  });

  it("loads canonical approval bytes and rejects absent, reformatted, or drifted descriptors", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-approval-"));
    const approvalFile = path.join(root, "exact-prover-approval.json");
    try {
      const approval = readyApprovalRecord();
      const canonicalBytes = Buffer.from(
        `${canonicalSolanaExactProverApprovalJson(approval)}\n`,
      );
      const canonicalHash = `0x${createHash("sha256")
        .update(canonicalBytes)
        .digest("hex")}`;
      writeFileSync(approvalFile, canonicalBytes);
      await expect(
        loadSolanaExactProverApprovalForSmoke({
          file: approvalFile,
          expectedApprovalSha256: canonicalHash,
        }),
      ).resolves.toMatchObject({
        validation: { ready: true, approvalSha256: canonicalHash },
        publicSummary: { ready: true, approvalSha256: canonicalHash },
        errors: [],
      });

      writeFileSync(approvalFile, `${JSON.stringify(approval, null, 2)}\n`);
      const reformattedBytes = Buffer.from(
        `${JSON.stringify(approval, null, 2)}\n`,
      );
      const reformattedHash = `0x${createHash("sha256")
        .update(reformattedBytes)
        .digest("hex")}`;
      await expect(
        loadSolanaExactProverApprovalForSmoke({
          file: approvalFile,
          expectedApprovalSha256: reformattedHash,
        }),
      ).resolves.toMatchObject({
        validation: { ready: false },
        publicSummary: { ready: false },
        errors: expect.arrayContaining([
          expect.stringMatching(/must be canonical UTF-8 JSON/u),
        ]),
      });

      writeFileSync(approvalFile, canonicalBytes);
      await expect(
        loadSolanaExactProverApprovalForSmoke({
          file: approvalFile,
          expectedApprovalSha256: `0x${"99".repeat(32)}`,
        }),
      ).resolves.toMatchObject({ validation: { ready: false } });
      await expect(
        loadSolanaExactProverApprovalForSmoke({
          file: path.join(root, "missing.json"),
          expectedApprovalSha256: canonicalHash,
        }),
      ).resolves.toMatchObject({
        validation: { ready: false },
        publicSummary: { ready: false },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires governance-pinned KAT evidence and rejects legacy self-attestation", () => {
    const missing = readyDestinationSidecar();
    delete missing.knownAnswer;
    expect(validateDestinationSidecar(missing)).toContain(
      "Solana prover governance-pinned known-answer summary is missing.",
    );

    const legacy = readyDestinationSidecar();
    legacy.knownAnswerProbe = legacy.knownAnswer;
    legacy.known_answer_probe = legacy.knownAnswer;
    expect(validateDestinationSidecar(legacy)).toContain(
      "Legacy prover-returned known-answer metadata is forbidden.",
    );

    const forgedVector = readyDestinationSidecar();
    forgedVector.knownAnswer.vector.packageHash = `0x${"99".repeat(32)}`;
    expect(validateDestinationSidecar(forgedVector)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Known-answer vector does not match the governance-approved vector hash pin",
        ),
        expect.stringContaining("Known-answer summary packageHash"),
      ]),
    );

    const forgedReceipt = readyDestinationSidecar();
    forgedReceipt.knownAnswer.artifactEvidence.verificationReceiptHash = `0x${"98".repeat(32)}`;
    expect(validateDestinationSidecar(forgedReceipt)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "verificationReceiptHash does not match the governance-pinned vector",
        ),
      ]),
    );
  });

  it("requires an independently pinned exact prover approval binding", () => {
    const missing = readyDestinationSidecar();
    delete missing.governanceApprovalBinding;
    expect(validateDestinationSidecar(missing)).toContain(
      "Exact prover governance approval binding is missing.",
    );

    const selfPinned = readyDestinationSidecar();
    selfPinned.governanceApprovalBinding.approvalSha256 = `0x${"77".repeat(32)}`;
    selfPinned.governanceApprovalBinding.expectedApprovalSha256 =
      selfPinned.governanceApprovalBinding.approvalSha256;
    expect(validateDestinationSidecar(selfPinned)).toContain(
      "Exact prover sidecar does not match the independently supplied governance approval hash.",
    );

    const wrongModule = readyDestinationSidecar();
    wrongModule.governanceApprovalBinding.approvedModuleHash =
      SOURCE_MODULE_HASH;
    expect(validateDestinationSidecar(wrongModule)).toContain(
      "Exact prover sidecar module bytes do not match the governance-approved module hash.",
    );

    const secretBearing = readyDestinationSidecar();
    secretBearing.governanceApprovalBinding.privateKey = "must-not-serialize";
    expect(validateDestinationSidecar(secretBearing)).toEqual(
      expect.arrayContaining([
        "Solana prover sidecar contains secret-bearing fields.",
        "Exact prover governance approval binding contains unknown or missing fields.",
      ]),
    );
  });

  it("reports the canonical approval file and independent hash as the sole root cause when packages are otherwise valid", () => {
    const withoutApproval = (moduleHash, sidecarHash) => {
      const inspection = readyProverInspection(moduleHash, sidecarHash);
      inspection.ready = false;
      inspection.sidecarReady = false;
      inspection.sidecarErrors = [
        "Canonical exact prover governance approval validation is not ready.",
      ];
      inspection.governanceApproval.ready = false;
      inspection.governanceApproval.blockerIds = [
        "solana-exact-prover-approval-descriptor",
      ];
      return inspection;
    };
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: withoutApproval(
        DESTINATION_MODULE_HASH,
        `0x${"33".repeat(32)}`,
      ),
      sourceProverInspection: withoutApproval(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });
    expect(report.ready).toBe(false);
    expect(report.rootCauseBlockerIds).toEqual([
      "solana-exact-prover-governance-approval",
    ]);
    expect(report.nextActionIds).toEqual([
      "provide-solana-exact-prover-approval",
    ]);
    expect(report.missingProductionInputIds).toEqual([
      "solana-exact-prover-approval-file",
      "solana-exact-prover-approval-sha256",
    ]);
  });

  it("rejects conflicting Solana prover sidecar aliases", () => {
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        module_hash: SOURCE_MODULE_HASH,
      }),
    ).toContain("moduleHash aliases must agree.");
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        proof_backend: "legacy-stark-fri-backend",
      }),
    ).toContain("destination proofBackend aliases must agree.");
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        required_proof_backend: "legacy-stark-fri-backend",
      }),
    ).toContain("destination requiredProofBackend aliases must agree.");
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        production_proofs_ready: false,
      }),
    ).toContain("productionProofsReady aliases must agree.");
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        source_domain: 3,
      }),
    ).toContain("sourceDomain aliases must agree.");
  });

  it("rejects Solana prover sidecars that omit the canonical recursive backend", () => {
    const missingProofBackend = readyDestinationSidecar();
    delete missingProofBackend.proofBackend;
    delete missingProofBackend.proof_backend;
    expect(validateDestinationSidecar(missingProofBackend)).toContain(
      `destination proofBackend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
    );

    const missingRequiredProofBackend = readyDestinationSidecar();
    delete missingRequiredProofBackend.requiredProofBackend;
    delete missingRequiredProofBackend.required_proof_backend;
    expect(validateDestinationSidecar(missingRequiredProofBackend)).toContain(
      `destination requiredProofBackend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
    );
  });

  it("loads Vite-style env files for Solana smoke without overriding runtime env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-env-"));
    try {
      writeFileSync(
        path.join(root, ".env"),
        [
          `${WALLETCONNECT_PROJECT_ID_ENV}=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
          `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV}=/sccp-solana/base.js`,
          `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV}=/tmp/self-pinned-approval.json`,
          `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV}=0x${"77".repeat(32)}`,
          "SCCP_TAIRA_GOVERNANCE_PRIVATE_KEY=must-never-load",
        ].join("\n"),
      );
      writeFileSync(
        path.join(root, ".env.test.local"),
        [
          `${WALLETCONNECT_PROJECT_ID_ENV}=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
          `${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV}='/sccp-solana/source.js'`,
        ].join("\n"),
      );
      const env = {
        [SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV]:
          "/runtime/destination.js",
      };

      const loaded = loadSolanaSccpSmokeEnvFiles({
        root,
        mode: "test",
        env,
      });

      expect(loaded.files.map((entry) => path.basename(entry.file))).toEqual([
        ".env",
        ".env.test.local",
      ]);
      expect(env).toMatchObject({
        [WALLETCONNECT_PROJECT_ID_ENV]: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        [SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV]:
          "/runtime/destination.js",
        [SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV]: "/sccp-solana/source.js",
      });
      expect(loaded.files.flatMap((entry) => entry.keys)).not.toContain(
        SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
      );
      expect(env).not.toHaveProperty(
        SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV,
      );
      expect(env).not.toHaveProperty(
        SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV,
      );
      expect(env).not.toHaveProperty("SCCP_TAIRA_GOVERNANCE_PRIVATE_KEY");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses Vite env files when running Solana smoke-readiness without serializing the project id", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-env-run-"));
    const outputDir = path.join(root, "out");
    try {
      writeFileSync(
        path.join(root, ".env.test.local"),
        [
          `${WALLETCONNECT_PROJECT_ID_ENV}=${WALLETCONNECT_PROJECT_ID}`,
          `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV}=/sccp-solana/taira-solana-xor-destination-prover.js`,
          `${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV}=/sccp-solana/taira-solana-xor-source-prover.js`,
        ].join("\n"),
      );

      try {
        const { report } = await runSolanaSccpLiveSmokeReadiness({
          outputDir,
          envRoot: root,
          routePreflight: readyRoutePreflight(),
          skipSolanaRpc: true,
          envMode: "test",
        });

        expect(
          report.checks.find(
            (check) => check.id === "walletconnect-project-id",
          ),
        ).toMatchObject({
          status: "pass",
          evidence: {
            configured: true,
            valueStoredInReport: false,
          },
        });
        expect(
          report.checks.find(
            (check) => check.id === "destination-prover-module-url",
          )?.evidence,
        ).toMatchObject({
          env: SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
          envAliases: [],
          configuredEnv: SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
        });
        expect(JSON.stringify(report)).not.toContain(WALLETCONNECT_PROJECT_ID);
      } finally {
        delete process.env[WALLETCONNECT_PROJECT_ID_ENV];
        delete process.env[SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV];
        delete process.env[SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV];
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts public route preflight plus Solana wallet and prover prerequisites", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      routePreflightPath: "/tmp/sccp-solana-route-preflight.json",
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
      ready: true,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      solana: {
        network: "solana-testnet",
        caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
      },
      failedCheckIds: [],
      blockerIds: [],
      nextActionIds: [],
      missingProductionInputs: [],
      missingProductionInputIds: [],
      nextActions: [],
    });
    expect(report.checks.map((check) => check.id)).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
      "smoke-readiness-runbook-contract",
    ]);
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    expect(
      report.checks.find((check) => check.id === "walletconnect-project-id")
        ?.evidence.valueStoredInReport,
    ).toBe(false);
  });

  it("uses separately validated bundled Solana prover packages when runtime URLs are absent", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: undefined,
      sourceProverModuleUrl: undefined,
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.blockerIds).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "pass",
      evidence: {
        usingDefault: true,
        configuredSource: "bundled-default",
        moduleUrl: DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
      },
    });
    expect(
      report.checks.find((check) => check.id === "source-prover-module-url"),
    ).toMatchObject({
      status: "pass",
      evidence: {
        usingDefault: true,
        configuredSource: "bundled-default",
        moduleUrl: DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
      },
    });
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
  });

  it("keeps smoke-readiness blocked when public route or runtime app prerequisites are missing", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: {
        ...readyRoutePreflight(),
        ready: false,
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor Solana testnet manifest found.",
          },
        ],
      },
      walletConnectProjectId: "",
      destinationProverModuleUrl: "",
      sourceProverModuleUrl: "",
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.id),
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(report.blockerIds).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(report.failedCheckIds).toEqual(report.blockerIds);
    expect(report.rootCauseBlockerIds).toEqual([
      "solana-public-route-report",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "refresh-solana-route-preflight",
      "configure-solana-walletconnect",
      "publish-solana-prover-modules",
    ]);
    expect(report.nextActionIds).toEqual([
      "refresh-solana-route-preflight",
      "configure-solana-walletconnect",
      "publish-solana-prover-modules",
    ]);
    expect(report.missingProductionInputs.map((input) => input.id)).toEqual([
      "solana-public-route-report",
      "walletconnect-project-id",
      "solana-destination-browser-prover-module",
      "solana-source-browser-prover-module",
    ]);
    expect(report.missingProductionInputIds).toEqual([
      "solana-public-route-report",
      "walletconnect-project-id",
      "solana-destination-browser-prover-module",
      "solana-source-browser-prover-module",
    ]);
  });

  it("rejects placeholder WalletConnect project ids for Solana live smoke", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: "project-123",
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "walletconnect-project-id"),
    ).toMatchObject({
      status: "fail",
      detail:
        "VITE_WALLETCONNECT_PROJECT_ID must be a 32-character hex WalletConnect Cloud project ID for Solana live smoke.",
      evidence: {
        configured: true,
        valueStoredInReport: false,
      },
    });
    expect(JSON.stringify(report)).not.toContain("project-123");
  });

  it("accepts an exact v2 typed-registry preflight without retired prover fields", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(true);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "pass",
      evidence: {
        schema: "iroha-demo-sccp-solana-route-preflight/v2",
        protocolSource: "typed-sccp-registry-v1",
        manifestSource: "public-registry",
        routeRevision: 1,
      },
    });
    expect(
      report.checks.find((check) => check.id === "route-preflight")?.evidence,
    ).not.toHaveProperty("browserProofModules");
    expect(report.nextActions).toEqual([]);
  });

  it.each([
    [
      "legacy v1 schema",
      {
        schema: "iroha-demo-sccp-solana-route-preflight/v1",
        protocolSource: undefined,
        manifestSource: "public",
      },
    ],
    ["legacy public-manifest source", { manifestSource: "public" }],
    ["missing typed-registry protocol source", { protocolSource: undefined }],
    ["wrong protocol source", { protocolSource: "legacy-sccp-manifests-v1" }],
  ])("rejects an otherwise-ready %s preflight", (_label, overrides) => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: { ...readyRoutePreflight(), ...overrides },
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Public TAIRA Solana route preflight is not an exact v2 typed-registry report.",
    });
  });

  it("fails otherwise-ready public preflight reports bound to the wrong Solana network", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: {
        ...readyRoutePreflight(),
        solana: {
          network: "solana-mainnet",
          caipChainId: "solana:mainnet",
        },
      },
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Public TAIRA Solana route preflight is not bound to Solana testnet.",
      evidence: {
        solana: {
          network: null,
          caipChainId: null,
          expectedNetwork: SOLANA_TESTNET_NETWORK_ID,
          expectedCaipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
          networkReady: false,
          caipChainReady: false,
        },
      },
    });
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "refresh-solana-route-preflight",
    ]);
  });

  it("fails otherwise-ready public preflight reports bound to a different Solana genesis", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: {
        ...readyRoutePreflight(),
        solana: {
          network: SOLANA_TESTNET_NETWORK_ID,
          caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
          genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        },
      },
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Public TAIRA Solana route preflight is not bound to Solana testnet.",
      evidence: {
        solana: {
          genesisHash: null,
          expectedGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
          genesisReady: false,
        },
      },
    });
  });

  it("categorizes malformed public preflight evidence without echoing it", () => {
    const secretMarker = "malformed-preflight-secret-marker";
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: {
        schema: secretMarker,
        protocolSource: secretMarker,
        manifestSource: secretMarker,
        ready: false,
        routeId: secretMarker,
        assetKey: secretMarker,
        routeRevision: secretMarker,
        checkedAt: secretMarker,
        solana: {
          network: secretMarker,
          caipChainId: secretMarker,
          genesisHash: secretMarker,
        },
        checks: [{ id: secretMarker, status: "fail", detail: secretMarker }],
      },
      routePreflightPath: `/tmp/${secretMarker}.json`,
      routePreflightError: secretMarker,
    });

    expect(report.ready).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secretMarker);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "fail",
      evidence: {
        routePreflightPath: "[public-report-supplied]",
        failedCheckCount: 1,
        schema: null,
        routeId: null,
      },
    });
  });

  it("uses bundled Solana prover modules but fails closed until self-tests pass", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: undefined,
      sourceProverModuleUrl: undefined,
      destinationProverInspection: {
        inspected: true,
        exists: true,
        exportsOk: true,
        ready: false,
        moduleHash: DESTINATION_MODULE_HASH,
        sidecarHash: `0x${"33".repeat(32)}`,
        selfTest: {
          ready: false,
          reason:
            "Solana SCCP destination prover package is intentionally fail-closed until governed proof artifacts are published.",
        },
      },
      sourceProverInspection: {
        inspected: true,
        exists: true,
        exportsOk: true,
        ready: false,
        moduleHash: SOURCE_MODULE_HASH,
        sidecarHash: `0x${"44".repeat(32)}`,
        selfTest: {
          ready: false,
          reason:
            "Solana SCCP source prover package is intentionally fail-closed until governed proof artifacts are published.",
        },
      },
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana destination prover module URL is using the bundled fail-closed default but not ready: Solana SCCP destination prover package is intentionally fail-closed until governed proof artifacts are published.",
      evidence: {
        usingDefault: true,
        configuredSource: "bundled-default",
        moduleUrl: DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
        inspection: {
          exists: true,
          exportsOk: true,
          ready: false,
        },
      },
    });
    expect(
      report.checks.find((check) => check.id === "source-prover-module-url"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana source prover module URL is using the bundled fail-closed default but not ready: Solana SCCP source prover package is intentionally fail-closed until governed proof artifacts are published.",
      evidence: {
        usingDefault: true,
        configuredSource: "bundled-default",
        moduleUrl: DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
        inspection: {
          exists: true,
          exportsOk: true,
          ready: false,
        },
      },
    });
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "publish-solana-production-prover-packages",
    ]);
    expect(report.missingProductionInputs.map((input) => input.id)).toEqual([
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(report.rootCauseBlockerIds).toEqual([
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ]);
    expect(report.nextActions[0]).toMatchObject({
      title: "Publish governed Solana prover packages",
      detail:
        "Replace fail-closed placeholder Solana destination/source prover modules with governed browser-safe packages whose sidecars set productionProofsReady=true and whose self-tests pass.",
    });
  });

  it("keeps smoke-readiness blocked when Solana prover sidecars are missing", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: {
        ...readyProverInspection(),
        sidecarReady: false,
        sidecarErrors: ["Solana prover sidecar file is missing."],
      },
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      )?.detail,
    ).toBe(
      "Solana destination prover module URL is configured but not ready: Solana prover sidecar file is missing.",
    );
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      )?.evidence.configuredSource,
    ).toBe("runtime");
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "publish-solana-prover-modules",
    ]);
  });

  it("fails closed when configured prover URLs have no inspected package or sidecar", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "https://provers.example/destination-prover.js",
      sourceProverModuleUrl: "https://provers.example/source-prover.js",
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana destination prover module URL is configured but not ready: module package and sidecar were not inspected.",
      evidence: {
        configuredSource: "runtime",
        inspection: null,
      },
    });
    expect(
      report.checks.find((check) => check.id === "source-prover-module-url"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana source prover module URL is configured but not ready: module package and sidecar were not inspected.",
    });
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "publish-solana-prover-modules",
    ]);
  });

  it("rejects metadata-only self-tests that never invoke the prove export", () => {
    const metadataOnlyInspection = readyProverInspection();
    delete metadataOnlyInspection.proofProbe;
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: metadataOnlyInspection,
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana destination prover module URL is configured but not ready: known-answer prove export was not invoked.",
    });
  });

  it("executes the local prove export even when its sidecar and self-test claim readiness", () => {
    const root = mkdtempSync(
      path.join(process.cwd(), "public/sccp-solana/kat-test-"),
    );
    try {
      const moduleFile = path.join(root, "metadata-only.js");
      const sidecarFile = path.join(root, "metadata-only.sidecar.json");
      const moduleUrl = `/sccp-solana/${path.basename(root)}/metadata-only.js`;
      const moduleSource = [
        "export const solanaSccpDestinationProverSelfTest = async () => ({ ready: true });",
        "export const proveSolanaSccpDestination = async () => ({ request: {}, submission: {} });",
      ].join("\n");
      const moduleHash = `0x${createHash("sha256")
        .update(moduleSource)
        .digest("hex")}`;
      writeFileSync(moduleFile, moduleSource);
      writeFileSync(
        sidecarFile,
        JSON.stringify(
          (() => {
            const sidecar = readyDestinationSidecar();
            return {
              ...sidecar,
              moduleUrl,
              module_url: moduleUrl,
              moduleHash,
              module_hash: moduleHash,
              governanceApprovalBinding: readyGovernanceBinding({
                direction: "destination",
                moduleHash,
                knownAnswer: sidecar.knownAnswer,
              }),
            };
          })(),
        ),
      );

      const inspection = runLocalProverSelfTest({
        moduleUrl,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        expectedApprovalSha256: APPROVAL_HASH,
        approvalValidation: readyApprovalValidation({
          destinationModuleHash: moduleHash,
        }),
        approvalErrors: [],
        approvalSummary: readyApprovalSummary(
          readyApprovalValidation({ destinationModuleHash: moduleHash }),
        ),
      });

      expect(inspection).toMatchObject({
        exportsOk: true,
        sidecarReady: true,
        ready: false,
        selfTest: { ready: true },
        proofProbe: {
          ready: false,
          invoked: true,
          errors: expect.arrayContaining([
            "Solana prover known-answer probe failed.",
          ]),
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not execute an unapproved module or echo hostile sidecar validation text", () => {
    const secretMarker = "hostile-sidecar-secret-marker";
    const root = mkdtempSync(
      path.join(process.cwd(), "public/sccp-solana/unapproved-test-"),
    );
    const executionMarker = path.join(
      tmpdir(),
      `sccp-solana-unapproved-executed-${process.pid}`,
    );
    try {
      const moduleFile = path.join(root, "unapproved.js");
      const sidecarFile = path.join(root, "unapproved.sidecar.json");
      const moduleUrl = `/sccp-solana/${path.basename(root)}/unapproved.js`;
      writeFileSync(
        moduleFile,
        [
          'import { writeFileSync } from "node:fs";',
          `writeFileSync(${JSON.stringify(executionMarker)}, "executed");`,
          "export const solanaSccpDestinationProverSelfTest = async () => ({ ready: true });",
          "export const proveSolanaSccpDestination = async () => ({ request: {}, submission: {} });",
        ].join("\n"),
      );
      writeFileSync(
        sidecarFile,
        JSON.stringify({
          ...readyDestinationSidecar(),
          knownAnswer: { [secretMarker]: true },
        }),
      );

      const inspection = runLocalProverSelfTest({
        moduleUrl,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        expectedApprovalSha256: APPROVAL_HASH,
        approvalValidation: null,
        approvalErrors: [`${secretMarker}-approval-error`],
      });

      expect(inspection).toMatchObject({
        executionSkipped: true,
        ready: false,
        sidecarReady: false,
      });
      expect(existsSync(executionMarker)).toBe(false);
      expect(JSON.stringify(inspection)).not.toContain(secretMarker);
    } finally {
      rmSync(executionMarker, { force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("categorizes approved prover execution failures without echoing thrown text", () => {
    const secretMarker = "approved-prover-thrown-secret-marker";
    const root = mkdtempSync(
      path.join(process.cwd(), "public/sccp-solana/throw-test-"),
    );
    try {
      const moduleFile = path.join(root, "throwing.js");
      const sidecarFile = path.join(root, "throwing.sidecar.json");
      const moduleUrl = `/sccp-solana/${path.basename(root)}/throwing.js`;
      const moduleSource = [
        `export const solanaSccpDestinationProverSelfTest = async () => { throw new Error(${JSON.stringify(secretMarker)}); };`,
        "export const proveSolanaSccpDestination = async () => ({ request: {}, submission: {} });",
      ].join("\n");
      const moduleHash = `0x${createHash("sha256")
        .update(moduleSource)
        .digest("hex")}`;
      writeFileSync(moduleFile, moduleSource);
      const sidecar = readyDestinationSidecar();
      writeFileSync(
        sidecarFile,
        JSON.stringify({
          ...sidecar,
          moduleUrl,
          module_url: moduleUrl,
          moduleHash,
          module_hash: moduleHash,
          governanceApprovalBinding: readyGovernanceBinding({
            direction: "destination",
            moduleHash,
            knownAnswer: sidecar.knownAnswer,
          }),
        }),
      );
      const approvalValidation = readyApprovalValidation({
        destinationModuleHash: moduleHash,
      });
      const inspection = runLocalProverSelfTest({
        moduleUrl,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        expectedApprovalSha256: APPROVAL_HASH,
        approvalValidation,
        approvalErrors: [],
        approvalSummary: readyApprovalSummary(approvalValidation),
      });

      expect(inspection).toMatchObject({
        sidecarReady: true,
        ready: false,
        error: "Solana prover self-test execution failed.",
      });
      expect(JSON.stringify(inspection)).not.toContain(secretMarker);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores hostile legacy prover refs embedded in an exact registry preflight", () => {
    const routePreflight = readyRoutePreflight();
    routePreflight.checks.push({
      id: "browser-proof-modules",
      status: "pass",
      detail: "retired legacy evidence",
      evidence: {
        destinationModuleUrl: "https://attacker.invalid/destination.js",
        destinationModuleHash: `0x${"91".repeat(32)}`,
        destinationSidecarHash: `0x${"92".repeat(32)}`,
        sourceModuleUrl: "https://attacker.invalid/source.js",
        sourceModuleHash: `0x${"93".repeat(32)}`,
        sourceSidecarHash: `0x${"94".repeat(32)}`,
      },
    });
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight,
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(true);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "pass",
      evidence: {
        configuredSource: "runtime",
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
      },
    });
    expect(JSON.stringify(report)).not.toContain("attacker.invalid");
    expect(report.nextActions).toEqual([]);
  });

  it("rejects unsafe Solana smoke-readiness runtime values without serializing secrets", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: "https://walletconnect.example/project",
      destinationProverModuleUrl:
        "https://example.invalid/prover.js?token=secret",
      sourceProverModuleUrl: "../unsafe-source-prover.js",
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "walletconnect-project-id"),
    ).toMatchObject({
      status: "fail",
      evidence: {
        env: WALLETCONNECT_PROJECT_ID_ENV,
        configured: true,
        valueStoredInReport: false,
      },
    });
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "fail",
      evidence: {
        env: SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
        envAliases: [],
        configured: true,
        moduleUrl: null,
      },
    });
    expect(
      report.checks.find((check) => check.id === "source-prover-module-url"),
    ).toMatchObject({
      status: "fail",
      evidence: {
        env: SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
        configured: true,
        moduleUrl: null,
      },
    });
  });

  it("fails the runbook contract when a failed Solana check has no complete next action", () => {
    expect(
      solanaSccpLiveSmokeReadinessRunbookProblems({
        failedCheckIds: new Set([
          "route-preflight",
          "walletconnect-project-id",
        ]),
        nextActions: [
          {
            id: "refresh-solana-route-preflight",
            blockedByChecks: ["route-preflight"],
            requiredInputs: [
              {
                id: "solana-public-route-report",
              },
            ],
          },
          {
            id: "configure-solana-walletconnect",
            blockedByChecks: ["walletconnect-project-id"],
            requiredInputs: [
              {
                id: "walletconnect-project-id",
              },
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "solana-public-route-report",
            blockedByActions: ["refresh-solana-route-preflight"],
          },
        ],
      }),
    ).toEqual([
      "Solana live smoke-readiness action configure-solana-walletconnect requires input walletconnect-project-id, but missingProductionInputs does not include it.",
    ]);
  });
});

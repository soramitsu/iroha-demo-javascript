import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
  DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
  SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
  SCCP_SOLANA_PROVER_MODULE_URL_ENV,
  SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
  evaluateSolanaSccpLiveSmokeReadiness,
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
  SOLANA_SOURCE_PROOF_BACKEND,
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

const DESTINATION_MODULE_HASH = `0x${"11".repeat(32)}`;
const SOURCE_MODULE_HASH = `0x${"22".repeat(32)}`;
const WALLETCONNECT_PROJECT_ID = "0123456789abcdef0123456789abcdef";

const readyRoutePreflight = ({
  destinationModuleUrl = "/sccp-solana/taira-solana-xor-destination-prover.js",
  destinationModuleHash = DESTINATION_MODULE_HASH,
  destinationSidecarHash = `0x${"33".repeat(32)}`,
  sourceModuleUrl = "/sccp-solana/taira-solana-xor-source-prover.js",
  sourceModuleHash = SOURCE_MODULE_HASH,
  sourceSidecarHash = `0x${"44".repeat(32)}`,
} = {}) => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v1",
  ready: true,
  routeId: "taira_sol_xor",
  assetKey: "xor",
  manifestSource: "public",
  solana: {
    network: "solana-testnet",
    caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  },
  checks: [
    { id: "taira-endpoint", status: "pass", detail: "ok" },
    { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
    { id: "route-manifest-shape", status: "pass", detail: "ok" },
    {
      id: "browser-proof-modules",
      status: "pass",
      detail: "ok",
      evidence: {
        destinationModuleUrl,
        destinationModuleHash,
        destinationSidecarHash,
        sourceModuleUrl,
        sourceModuleHash,
        sourceSidecarHash,
      },
    },
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
  const approvalHash = `0x${createHash("sha256").update("independent-governance-approval").digest("hex")}`;
  return validateSolanaProverKnownAnswerResult({
    direction,
    result,
    vector,
    artifactEvidence,
    governance: {
      approvalHash,
      expectedApprovalHash: approvalHash,
      vectorHashPin: solanaProverKnownAnswerVectorHash(vector),
    },
  });
};

const readyProverInspection = (
  moduleHash = DESTINATION_MODULE_HASH,
  sidecarHash = `0x${"33".repeat(32)}`,
) => ({
  inspected: true,
  exists: true,
  exportsOk: true,
  ready: true,
  moduleHash,
  sidecarHash,
  sidecarReady: true,
  sidecarErrors: [],
  selfTest: { ready: true },
  proofProbe: readyKnownAnswer(
    moduleHash === SOURCE_MODULE_HASH ? "source" : "destination",
  ),
});

const readyDestinationSidecar = () => ({
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
  knownAnswer: readyKnownAnswer("destination"),
});

const validateDestinationSidecar = (sidecar) =>
  validateSolanaSccpProverSidecar({
    sidecar,
    direction: "destination",
    moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    moduleHash: DESTINATION_MODULE_HASH,
    proveExport: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
  });

describe("Solana SCCP live smoke-readiness", () => {
  it("accepts clean Solana prover sidecar aliases", () => {
    expect(validateDestinationSidecar(readyDestinationSidecar())).toEqual([]);
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
        proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      }),
    ).toContain("destination proofBackend aliases must agree.");
    expect(
      validateDestinationSidecar({
        ...readyDestinationSidecar(),
        required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
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
        [SCCP_SOLANA_PROVER_MODULE_URL_ENV]: "/runtime/legacy.js",
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
        [SCCP_SOLANA_PROVER_MODULE_URL_ENV]: "/runtime/legacy.js",
        [SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV]: "/sccp-solana/source.js",
      });
      expect(loaded.files.flatMap((entry) => entry.keys)).not.toContain(
        SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
      );
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
          envAliases: [SCCP_SOLANA_PROVER_MODULE_URL_ENV],
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

  it("keeps the legacy Solana destination prover env as a smoke-readiness alias", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-legacy-env-"));
    const outputDir = path.join(root, "out");
    try {
      writeFileSync(
        path.join(root, ".env.test.local"),
        [
          `${WALLETCONNECT_PROJECT_ID_ENV}=${WALLETCONNECT_PROJECT_ID}`,
          `${SCCP_SOLANA_PROVER_MODULE_URL_ENV}=/sccp-solana/taira-solana-xor-destination-prover.js`,
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
            (check) => check.id === "destination-prover-module-url",
          )?.evidence,
        ).toMatchObject({
          env: SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
          envAliases: [SCCP_SOLANA_PROVER_MODULE_URL_ENV],
          configuredEnv: SCCP_SOLANA_PROVER_MODULE_URL_ENV,
        });
      } finally {
        delete process.env[WALLETCONNECT_PROJECT_ID_ENV];
        delete process.env[SCCP_SOLANA_PROVER_MODULE_URL_ENV];
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

  it("uses public route-published Solana prover refs when runtime URLs are absent", () => {
    const destinationModuleUrl = "/sccp-solana/route-destination-prover.js";
    const sourceModuleUrl = "/sccp-solana/route-source-prover.js";
    const routePreflight = readyRoutePreflight({
      destinationModuleUrl,
      sourceModuleUrl,
    });
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight,
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
        configuredSource: "public-route",
        moduleUrl: destinationModuleUrl,
        expectedModuleUrl: destinationModuleUrl,
      },
    });
    expect(
      report.checks.find((check) => check.id === "source-prover-module-url"),
    ).toMatchObject({
      status: "pass",
      evidence: {
        usingDefault: true,
        configuredSource: "public-route",
        moduleUrl: sourceModuleUrl,
        expectedModuleUrl: sourceModuleUrl,
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
        manifestSource: "public",
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

  it("fails otherwise-ready public preflight reports that omit prover hash evidence", () => {
    const routePreflight = {
      ...readyRoutePreflight(),
      checks: readyRoutePreflight().checks.filter(
        (check) => check.id !== "browser-proof-modules",
      ),
    };
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

    expect(report.ready).toBe(false);
    expect(
      report.checks.find((check) => check.id === "route-preflight"),
    ).toMatchObject({
      status: "fail",
      detail:
        "Public TAIRA Solana route preflight is missing browser proof module or sidecar hash evidence.",
    });
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "refresh-solana-route-preflight",
    ]);
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
          network: "solana-mainnet",
          caipChainId: "solana:mainnet",
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
          genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          expectedGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
          genesisReady: false,
        },
      },
    });
  });

  it("uses route-published Solana prover modules but fails closed until self-tests pass", () => {
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
        "Solana destination prover module URL is using the public route-published module but not ready: Solana SCCP destination prover package is intentionally fail-closed until governed proof artifacts are published.",
      evidence: {
        usingDefault: true,
        configuredSource: "public-route",
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
        "Solana source prover module URL is using the public route-published module but not ready: Solana SCCP source prover package is intentionally fail-closed until governed proof artifacts are published.",
      evidence: {
        usingDefault: true,
        configuredSource: "public-route",
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
        JSON.stringify({
          ...readyDestinationSidecar(),
          moduleUrl,
          module_url: moduleUrl,
          moduleHash,
          module_hash: moduleHash,
        }),
      );

      const inspection = runLocalProverSelfTest({
        moduleUrl,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
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
            "Known-answer submission contains no non-empty proof material.",
          ]),
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails smoke-readiness when prover module bytes do not match the public route hashes", () => {
    const report = evaluateSolanaSccpLiveSmokeReadiness({
      routePreflight: readyRoutePreflight(),
      walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      sourceProverModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      destinationProverInspection: readyProverInspection(
        `0x${"33".repeat(32)}`,
      ),
      sourceProverInspection: readyProverInspection(
        SOURCE_MODULE_HASH,
        `0x${"44".repeat(32)}`,
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find(
        (check) => check.id === "destination-prover-module-url",
      ),
    ).toMatchObject({
      status: "fail",
      detail:
        "Solana destination prover module URL is configured but not ready: module hash does not match public route preflight.",
      evidence: {
        expectedModuleHash: DESTINATION_MODULE_HASH,
        moduleHashMatchesRoute: false,
      },
    });
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "publish-solana-prover-modules",
    ]);
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
        envAliases: [SCCP_SOLANA_PROVER_MODULE_URL_ENV],
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

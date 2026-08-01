// @vitest-environment node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SOLANA_PRODUCTION_NEXT_ACTION_ORDER,
  SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS,
  assertSolanaProductionGateOutputIsDisjoint,
  buildSolanaProductionGatePreLiveInputSnapshot,
  buildSolanaProductionGateReport,
  buildSolanaProductionGateSuccessExecutionPolicy,
  buildSolanaProductionNextActionDag,
  buildSolanaLiveCaptureContentAnalysis,
  collectArtifactFacts,
  checkSolanaLiveCaptureWitnessArtifactPin,
  checkDeploymentVideoPresent,
  checkSolanaProductionGatePreLiveInputSnapshot,
  checkSolanaLiveVideoMediaArtifactPins,
  checkLiveBidirectionalVideo,
  checkPublicExactProgramdataReady,
  checkSolanaProductionGateRequiredReportsLoaded,
  checkSmokeReadinessArtifactConsistency,
  checkSmokeReadinessReady,
  parseArgs,
  reinspectSolanaSmokeProverArtifacts,
  runSccpSolanaProductionGate,
  validateSolanaProductionGatePreLiveInputSnapshot,
} from "../scripts/e2e/sccp-solana-production-gate.mjs";
import {
  SOLANA_TESTNET_CAIP_CHAIN_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";
import {
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
} from "../scripts/e2e/sccp-solana-exact-prover-governance.mjs";
import { canonicalSccpJson } from "../scripts/e2e/sccp-solana-exact-registry.mjs";

const hash = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;

const normalizedFreshDeployFixture = (reportSha256) => ({
  reportSha256,
  report: {
    programs: ["nativeVerifier", "destination", "source"].map(
      (role, index) => ({
        role,
        programId: `${role}-program`,
        programdataAddress: `${role}-programdata`,
        artifactSha256: hash(`${role}-artifact`),
        codeHash: hash(`${role}-code`),
        buffer: {
          writes: [{ offset: 0, length: index + 1 }],
        },
        deploy: { finalizedSlot: 101 + index },
      }),
    ),
  },
  immutableFinalization: {
    signature: "fresh-finalization-signature",
    finalizedSlot: 110,
  },
});

const snapshotFixture = ({ present = true } = {}) => {
  const inputs = Object.fromEntries(
    Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS).map(
      (id, index) => [
        id,
        {
          id,
          path: path.resolve(tmpdir(), `solana-gate-${id}`),
          present,
          size: present ? index + 1 : 0,
          sha256: present ? hash(Buffer.from(id)) : null,
        },
      ],
    ),
  );
  return buildSolanaProductionGatePreLiveInputSnapshot(inputs);
};

const canonicalPreflight = () => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v2",
  protocolSource: "typed-sccp-registry-v1",
  manifestSource: "public-registry",
  taira: { toriiUrl: "https://taira-validator-1.sora.org" },
  solana: { rpcUrl: "https://api.testnet.solana.com" },
});

const exactReadyPreflight = () => ({
  ...canonicalPreflight(),
  checkedAt: "2026-07-15T00:00:00.000Z",
  ready: true,
  routeId: "taira_sol_xor",
  assetKey: "xor",
  routeRevision: 1,
  solana: {
    rpcUrl: "https://api.testnet.solana.com",
    network: SOLANA_TESTNET_NETWORK_ID,
    caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  },
  checks: [],
});

const GOVERNANCE_PLAN_SHA256 = hash("exact-governance-plan");
const ORDERED_INITIALIZATION_SHA256 = hash("exact-ordered-initialization");
const DESTINATION_MODULE_SHA256 = hash("destination-module");
const SOURCE_MODULE_SHA256 = hash("source-module");
const DESTINATION_VECTOR_SHA256 = hash("destination-vector");
const SOURCE_VECTOR_SHA256 = hash("source-vector");
const GOVERNANCE_APPROVAL_RECORD = {
  schema: "iroha-sccp-solana-production-prover-approval/v2",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
  approved: true,
  approvalId: "exact-prover-approval-2026-07-15",
  pins: {
    captureReviewPolicySha256: hash("capture-review-policy"),
    governancePlanCanonicalSha256: GOVERNANCE_PLAN_SHA256,
    orderedInitializationEvidenceSha256: ORDERED_INITIALIZATION_SHA256,
    destinationProverModuleHash: DESTINATION_MODULE_SHA256,
    destinationProverKnownAnswerVectorHash: DESTINATION_VECTOR_SHA256,
    sourceProverModuleHash: SOURCE_MODULE_SHA256,
    sourceProverKnownAnswerVectorHash: SOURCE_VECTOR_SHA256,
  },
};
const GOVERNANCE_APPROVAL_SHA256 = hash(
  `${canonicalSolanaExactProverApprovalJson(GOVERNANCE_APPROVAL_RECORD)}\n`,
);
const GOVERNANCE_APPROVAL_VALIDATION =
  buildExactSolanaProductionProverApprovalValidation({
    approvalRecord: GOVERNANCE_APPROVAL_RECORD,
    approvalSha256: GOVERNANCE_APPROVAL_SHA256,
    expectedApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
  });

const readyProverSmokeCheck = ({
  direction,
  moduleHash,
  sidecarHash,
  vectorHash,
  governancePlanSha256 = GOVERNANCE_PLAN_SHA256,
  orderedInitializationSha256 = ORDERED_INITIALIZATION_SHA256,
}) => ({
  id: `${direction}-prover-module-url`,
  status: "pass",
  detail: "ready",
  evidence: {
    configured: true,
    moduleUrl: `/sccp-solana/taira-solana-xor-${direction}-prover.js`,
    inspection: {
      inspected: true,
      exists: true,
      exportsOk: true,
      ready: true,
      sidecarReady: true,
      sidecarErrors: [],
      sidecarUrl: `/sccp-solana/taira-solana-xor-${direction}-prover.sidecar.json`,
      moduleHash,
      sidecarHash,
      selfTest: {
        ready: true,
        linked: true,
        productionProofsReady: true,
      },
      proofProbe: {
        ready: true,
        invoked: true,
        vectorHash,
        packageHash: hash(`${direction}-known-answer-package`),
      },
      governanceApprovalBinding: {
        schema: "iroha-sccp-solana-prover-sidecar-governance-binding/v1",
        ready: true,
        direction,
        approvalId: "exact-prover-approval-2026-07-15",
        approvalSha256: GOVERNANCE_APPROVAL_SHA256,
        expectedApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        governancePlanCanonicalSha256: governancePlanSha256,
        orderedInitializationEvidenceSha256: orderedInitializationSha256,
        approvedModuleHash: moduleHash,
        approvedVectorHash: vectorHash,
        moduleHash,
        vectorHash,
        errors: [],
      },
    },
  },
});

const readySmokeReadinessReport = ({
  preflight = exactReadyPreflight(),
  governancePlanSha256 = GOVERNANCE_PLAN_SHA256,
  orderedInitializationSha256 = ORDERED_INITIALIZATION_SHA256,
} = {}) => {
  const routeSolana = preflight.solana;
  return {
    schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
    checkedAt: "2026-07-15T00:00:01.000Z",
    ready: true,
    routeId: "taira_sol_xor",
    assetKey: "xor",
    solana: {
      network: SOLANA_TESTNET_NETWORK_ID,
      caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    },
    checks: [
      {
        id: "route-preflight",
        status: "pass",
        detail: "ready",
        evidence: {
          checkedAt: preflight.checkedAt,
          ready: true,
          schema: preflight.schema,
          protocolSource: preflight.protocolSource,
          manifestSource: preflight.manifestSource,
          routeId: preflight.routeId,
          assetKey: preflight.assetKey,
          routeRevision: preflight.routeRevision,
          solana: {
            network: routeSolana.network,
            caipChainId: routeSolana.caipChainId,
            genesisHash: routeSolana.genesisHash,
            networkReady: true,
            caipChainReady: true,
            genesisReady: true,
          },
          failedChecks: [],
        },
      },
      {
        id: "walletconnect-project-id",
        status: "pass",
        detail: "ready",
        evidence: { configured: true, valueStoredInReport: false },
      },
      readyProverSmokeCheck({
        direction: "destination",
        moduleHash: DESTINATION_MODULE_SHA256,
        sidecarHash: hash("destination-sidecar"),
        vectorHash: DESTINATION_VECTOR_SHA256,
        governancePlanSha256,
        orderedInitializationSha256,
      }),
      readyProverSmokeCheck({
        direction: "source",
        moduleHash: SOURCE_MODULE_SHA256,
        sidecarHash: hash("source-sidecar"),
        vectorHash: SOURCE_VECTOR_SHA256,
        governancePlanSha256,
        orderedInitializationSha256,
      }),
      {
        id: "smoke-readiness-runbook-contract",
        status: "pass",
        detail: "ready",
        evidence: { problems: [] },
      },
    ],
    failedCheckIds: [],
    blockerIds: [],
    rootCauseBlockerIds: [],
    nextActions: [],
    nextActionIds: [],
    missingProductionInputs: [],
    missingProductionInputIds: [],
    requiredLiveSmokeSteps: [
      "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
      "Connect a Solana testnet wallet through WalletConnect/AppKit.",
      "Run one tiny TAIRA -> Solana transfer and verify the Solana finalize transaction link.",
      "Run one tiny Solana -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
    ],
  };
};

const readyRuntimeReinspection = (
  smokeReadinessReport = readySmokeReadinessReport(),
) => ({
  schema: "iroha-sccp-solana-production-gate-prover-reinspection/v1",
  expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
  directions: Object.fromEntries(
    [
      ["destination", 2],
      ["source", 3],
    ].map(([direction, index]) => {
      const smokeCheck = smokeReadinessReport.checks[index];
      return [
        direction,
        {
          direction,
          checkId: `${direction}-prover-module-url`,
          moduleUrl: smokeCheck.evidence.moduleUrl,
          inspection: structuredClone(smokeCheck.evidence.inspection),
        },
      ];
    }),
  ),
});

describe("Solana SCCP production gate governance pipeline", () => {
  it("keeps the retired deployment-video diagnostic callable without capture-review state", () => {
    expect(checkDeploymentVideoPresent()).toMatchObject({
      id: "deployment-video-present",
      status: "fail",
    });
  });
  it("accepts only the complete exact-v2 governed smoke-readiness contract", () => {
    const preflight = exactReadyPreflight();
    const smoke = readySmokeReadinessReport({ preflight });
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(smoke),
      }),
    ).toMatchObject({ status: "pass", evidence: { problems: [] } });
    expect(
      checkSmokeReadinessArtifactConsistency({
        smokeReadinessReport: smoke,
        preflightReport: preflight,
        governancePlanReport: {
          plan_sha256: GOVERNANCE_PLAN_SHA256,
          ordered_initialization_evidence_sha256: ORDERED_INITIALIZATION_SHA256,
        },
        orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
        orderedInitializationEvidenceArtifactSha256:
          ORDERED_INITIALIZATION_SHA256,
      }),
    ).toMatchObject({ status: "pass", evidence: { mismatches: [] } });
  });

  it("rejects an otherwise-ready smoke report with an empty checks array", () => {
    const smoke = readySmokeReadinessReport();
    smoke.checks = [];
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(),
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(/exactly the five canonical unique checks/u),
        ]),
      },
    });
  });

  it("does not echo malformed smoke-report fields into gate evidence", () => {
    const secretMarker = "malformed-smoke-secret-marker";
    const smoke = readySmokeReadinessReport();
    smoke.checks = [
      {
        id: "route-preflight",
        status: "fail",
        detail: secretMarker,
        evidence: {
          ready: false,
          schema: secretMarker,
          protocolSource: secretMarker,
          routeId: secretMarker,
          assetKey: secretMarker,
          manifestSource: secretMarker,
          routeRevision: secretMarker,
          solana: { network: secretMarker },
          failedChecks: [
            { id: secretMarker, status: "fail", detail: secretMarker },
          ],
        },
      },
      {
        id: secretMarker,
        status: "fail",
        detail: secretMarker,
        password: secretMarker,
      },
    ];
    smoke.blockerIds = [secretMarker];
    smoke.missingProductionInputs = [
      { id: secretMarker, password: secretMarker },
    ];
    smoke.nextActions = [
      { id: secretMarker, title: secretMarker, password: secretMarker },
    ];
    smoke[`${secretMarker}-actions`] = [secretMarker];

    const check = checkSmokeReadinessReady({
      smokeReadinessReport: smoke,
      smokeReadinessPath: `/tmp/${secretMarker}.json`,
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
      proverRuntimeReinspection: readyRuntimeReinspection(),
    });

    expect(check.status).toBe("fail");
    expect(JSON.stringify(check)).not.toContain(secretMarker);
    expect(check.evidence).toMatchObject({
      observedCheckCount: 2,
      observedCheckIdsCanonical: false,
      blockerCount: 1,
      missingProductionInputCount: 1,
      nextActionCount: 1,
    });
    const consistency = checkSmokeReadinessArtifactConsistency({
      smokeReadinessReport: smoke,
      smokeReadinessPath: `/tmp/${secretMarker}.json`,
      preflightReport: exactReadyPreflight(),
      preflightReportPath: `/tmp/${secretMarker}-preflight.json`,
      governancePlanReport: {
        plan_sha256: GOVERNANCE_PLAN_SHA256,
        ordered_initialization_evidence_sha256: ORDERED_INITIALIZATION_SHA256,
      },
      governancePlanPath: `/tmp/${secretMarker}-plan.json`,
      orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
      orderedInitializationEvidencePath: `/tmp/${secretMarker}-ordered.json`,
      orderedInitializationEvidenceArtifactSha256:
        ORDERED_INITIALIZATION_SHA256,
    });
    expect(consistency.status).toBe("fail");
    expect(JSON.stringify(consistency)).not.toContain(secretMarker);

    const report = buildSolanaProductionGateReport({
      preflightReport: exactReadyPreflight(),
      governancePlanReport: {
        plan_sha256: GOVERNANCE_PLAN_SHA256,
        ordered_initialization_evidence_sha256: ORDERED_INITIALIZATION_SHA256,
      },
      orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
      smokeReadinessReport: smoke,
      preLiveInputSnapshot: snapshotFixture(),
      governanceEvidence: { ready: false, checks: [] },
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
    });
    expect(JSON.stringify(report)).not.toContain(secretMarker);

    const hostilePreflight = {
      schema: secretMarker,
      protocolSource: secretMarker,
      manifestSource: secretMarker,
      ready: false,
      routeId: secretMarker,
      assetKey: secretMarker,
      routeRevision: secretMarker,
      taira: {
        chainId: secretMarker,
        networkPrefix: secretMarker,
        registryPath: secretMarker,
      },
      solana: {
        network: secretMarker,
        caipChainId: secretMarker,
        genesisHash: secretMarker,
      },
      registrySummary: {
        routeId: secretMarker,
        assetKey: secretMarker,
        registrySha256: secretMarker,
        password: secretMarker,
      },
      registryState: { detail: secretMarker, password: secretMarker },
      checks: [
        {
          id: secretMarker,
          status: "fail",
          detail: secretMarker,
          evidence: { password: secretMarker },
        },
      ],
      failedCheckIds: [secretMarker],
      blockerIds: [secretMarker],
    };
    const hostilePreflightReport = buildSolanaProductionGateReport({
      preflightReport: hostilePreflight,
      preflightReportPath: `/tmp/${secretMarker}-public-preflight.json`,
      governancePlanReport: {
        plan_sha256: GOVERNANCE_PLAN_SHA256,
        ordered_initialization_evidence_sha256: ORDERED_INITIALIZATION_SHA256,
      },
      orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
      smokeReadinessReport: null,
      preLiveInputSnapshot: snapshotFixture(),
      governanceEvidence: { ready: false, checks: [] },
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
    });
    expect(JSON.stringify(hostilePreflightReport)).not.toContain(secretMarker);
  });

  it("does not echo malformed blocked live-video transcript evidence", () => {
    const secretMarker = "malformed-blocked-video-secret-marker";
    const mp4Path = path.resolve(tmpdir(), `${secretMarker}.mp4`);
    const vttPath = path.resolve(tmpdir(), `${secretMarker}.vtt`);
    const check = checkLiveBidirectionalVideo({
      liveVideoTranscriptPath: secretMarker,
      blockedLiveVideoTranscriptPath: secretMarker,
      blockedLiveVideoMp4Path: mp4Path,
      blockedLiveVideoVttPath: vttPath,
      blockedLiveVideoTranscript: {
        schema: secretMarker,
        routeId: secretMarker,
        checkedAt: secretMarker,
        reason: secretMarker,
        nextActionIds: [secretMarker],
        nextActionDetails: [
          {
            id: secretMarker,
            title: secretMarker,
            detail: secretMarker,
            command: [secretMarker],
          },
        ],
        diagnostics: {
          password: secretMarker,
          productionGate: { password: secretMarker },
        },
        publicSolanaCapability: { password: secretMarker },
        publicSolanaLane: { password: secretMarker },
        videoArtifacts: [
          {
            path: mp4Path,
            mediaType: secretMarker,
            diagnosticOnly: true,
            notLiveTransferEvidence: true,
          },
        ],
      },
      artifactFacts: {
        [mp4Path]: {
          path: secretMarker,
          exists: true,
          size: 1,
          sha256: secretMarker,
          error: secretMarker,
          media: {
            error: secretMarker,
            streams: [{ codecType: secretMarker, codecName: secretMarker }],
            embeddedSubtitle: {
              error: secretMarker,
              cueTextSha256: secretMarker,
            },
          },
        },
        [vttPath]: {
          path: secretMarker,
          exists: true,
          size: 1,
          sha256: secretMarker,
          error: secretMarker,
          vtt: {
            webvtt: false,
            cueCount: 1,
            cueTextSha256: secretMarker,
            firstCue: secretMarker,
            lastCue: secretMarker,
            cueTexts: [secretMarker],
          },
        },
      },
    });

    expect(check.status).toBe("fail");
    expect(JSON.stringify(check)).not.toContain(secretMarker);
    expect(check.evidence).toMatchObject({
      transcriptPath: "[public-report-supplied]",
      blockedTranscriptPath: "[public-report-supplied]",
      blockedTranscript: {
        path: "[public-report-supplied]",
        present: true,
        schemaOk: false,
        routeOk: false,
        reasonPresent: true,
        nextActionIdCount: 1,
        nextActionDetailCount: 1,
      },
      blockedDiagnosticsPresent: true,
      blockedPublicSolanaCapability: { present: true, ready: false },
      blockedPublicSolanaLane: { present: true, ready: false },
    });
  });

  it("does not echo malformed successful live-video transcript evidence", () => {
    const secretMarker = "malformed-success-video-secret-marker";
    const mp4Path = path.resolve(tmpdir(), `${secretMarker}.mp4`);
    const vttPath = path.resolve(tmpdir(), `${secretMarker}.vtt`);
    const validMessageId = hash("valid-live-message-id");
    const validSolanaSignature = "1".repeat(64);
    const check = checkLiveBidirectionalVideo({
      liveVideoTranscriptPath: secretMarker,
      liveVideoMp4Path: mp4Path,
      liveVideoVttPath: vttPath,
      liveVideoTranscript: {
        schema: secretMarker,
        routeId: secretMarker,
        ready: false,
        preflightReady: false,
        password: secretMarker,
        videoArtifacts: [
          { path: mp4Path, mediaType: secretMarker, password: secretMarker },
          { path: vttPath, mediaType: secretMarker, password: secretMarker },
        ],
        liveEvidence: {
          governancePlanSha256: validMessageId,
          governanceRegistrationSha256: secretMarker,
          governanceActivationSha256: secretMarker,
          publicRegistrySha256: secretMarker,
          tairaToSolana: {
            messageId: validMessageId,
            tairaSourceTx: secretMarker,
            solanaTxId: validSolanaSignature,
            password: secretMarker,
          },
          solanaToTaira: {
            solanaSourceTx: secretMarker,
            tairaSettlementTx: secretMarker,
            password: secretMarker,
          },
        },
        successEvidencePolicy: {
          schema: secretMarker,
          mode: secretMarker,
          problems: [secretMarker],
          preflight: {
            toriiUrl: secretMarker,
            solanaRpcUrl: secretMarker,
            password: secretMarker,
          },
          productionGate: {
            failedCheckIds: [secretMarker],
            preLiveInputSnapshotSha256: secretMarker,
            password: secretMarker,
          },
        },
        authoritativeReadback: { password: secretMarker },
        mediaArtifacts: {
          mp4: {
            path: secretMarker,
            mediaType: secretMarker,
            sha256: secretMarker,
            password: secretMarker,
          },
          vtt: {
            path: secretMarker,
            mediaType: secretMarker,
            sha256: secretMarker,
            password: secretMarker,
          },
        },
        mediaVerification: {
          password: secretMarker,
          streams: { video: { codec: secretMarker } },
        },
        subtitleCues: [{ text: secretMarker }],
      },
      preLiveInputSnapshot: {
        preLiveInputSnapshotSha256: secretMarker,
        password: secretMarker,
      },
      successExecutionPolicy: {
        toriiUrl: secretMarker,
        solanaRpcUrl: secretMarker,
        problems: [secretMarker],
        password: secretMarker,
      },
      authoritativeRevalidation: { password: secretMarker },
      expectedLiveEvidencePackageHashes: {
        governancePlanSha256: secretMarker,
        password: secretMarker,
      },
      artifactFacts: {
        [mp4Path]: {
          path: secretMarker,
          exists: true,
          size: 1,
          sha256: secretMarker,
          error: secretMarker,
          media: {
            error: secretMarker,
            streams: [{ codecType: secretMarker, codecName: secretMarker }],
            embeddedSubtitle: {
              error: secretMarker,
              cueTextSha256: secretMarker,
            },
          },
        },
        [vttPath]: {
          path: secretMarker,
          exists: true,
          size: 1,
          sha256: secretMarker,
          error: secretMarker,
          vtt: {
            webvtt: false,
            cueCount: 1,
            cueTextSha256: secretMarker,
            cueTexts: [secretMarker],
          },
        },
      },
    });

    expect(check.status).toBe("fail");
    expect(JSON.stringify(check)).not.toContain(secretMarker);
    expect(check.evidence).toMatchObject({
      transcriptPath: "[public-report-supplied]",
      liveEvidenceStatus: {
        fields: {
          forwardMessageId: validMessageId,
          forwardTairaSourceTx: null,
          forwardSolanaTxId: validSolanaSignature,
          reverseSolanaSourceTx: null,
          reverseTairaSettlementTx: null,
        },
      },
      packageHashes: {
        governancePlanSha256: validMessageId,
        expectedGovernancePlanSha256: null,
      },
      transcriptPreLiveInputSnapshotSha256: null,
      currentPreLiveInputSnapshotSha256: null,
      trustedFreshRevalidationOk: false,
    });
  });

  it("rejects a self-pinned prover approval without the independent hash", () => {
    const smoke = readySmokeReadinessReport();
    expect(
      checkSmokeReadinessReady({ smokeReadinessReport: smoke }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(
            /independent SCCP_SOLANA_.*_APPROVAL_SHA256 pin is required/iu,
          ),
        ]),
      },
    });
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: hash("different-approval"),
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(),
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(/do not match the independently supplied/iu),
        ]),
      },
    });
  });

  it.each([
    [
      "duplicate",
      (smoke) => {
        smoke.checks[3] = structuredClone(smoke.checks[2]);
      },
    ],
    [
      "missing",
      (smoke) => {
        smoke.checks.splice(3, 1);
      },
    ],
  ])("rejects %s canonical smoke checks", (_label, mutate) => {
    const smoke = readySmokeReadinessReport();
    mutate(smoke);
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(),
      }).status,
    ).toBe("fail");
  });

  it("rejects forged prover inspection and missing governance binding evidence", () => {
    const notInvoked = readySmokeReadinessReport();
    notInvoked.checks[2].evidence.inspection.proofProbe.invoked = false;
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: notInvoked,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(),
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(/known-answer export was not invoked/u),
        ]),
      },
    });

    const ungoverned = readySmokeReadinessReport();
    delete ungoverned.checks[3].evidence.inspection.governanceApprovalBinding;
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: ungoverned,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: readyRuntimeReinspection(),
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(/governance binding is missing/u),
        ]),
      },
    });
  });

  it("rejects a structurally perfect smoke report without independent byte reinspection", () => {
    const smoke = readySmokeReadinessReport();
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(
            /independent prover module\/sidecar reinspection/iu,
          ),
        ]),
      },
    });
  });

  it("rejects smoke evidence when the reopened sidecar bytes changed", () => {
    const smoke = readySmokeReadinessReport();
    const reinspection = readyRuntimeReinspection(smoke);
    reinspection.directions.destination.inspection.sidecarHash = hash(
      "mutated-installed-sidecar",
    );
    const check = checkSmokeReadinessReady({
      smokeReadinessReport: smoke,
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
      proverRuntimeReinspection: reinspection,
    });
    expect(check).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          expect.stringMatching(
            /does not match independently reopened module\/sidecar bytes/u,
          ),
        ]),
      },
    });
  });

  it("reopens configured files and rejects forged ready claims when packages are absent", () => {
    const smoke = readySmokeReadinessReport();
    smoke.checks[2].evidence.moduleUrl =
      "/sccp-solana/definitely-missing-destination-prover.js";
    smoke.checks[3].evidence.moduleUrl =
      "/sccp-solana/definitely-missing-source-prover.js";
    const reinspection = reinspectSolanaSmokeProverArtifacts({
      smokeReadinessReport: smoke,
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
    });
    expect(reinspection.directions.destination.inspection).toMatchObject({
      inspected: true,
      exists: false,
      ready: false,
    });
    expect(reinspection.directions.source.inspection).toMatchObject({
      inspected: true,
      exists: false,
      ready: false,
    });
    expect(
      checkSmokeReadinessReady({
        smokeReadinessReport: smoke,
        expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
        proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
        proverRuntimeReinspection: reinspection,
      }).status,
    ).toBe("fail");
  });

  it("rejects an exact-v2 smoke report whose embedded public preflight drifted", () => {
    const preflight = exactReadyPreflight();
    const smoke = readySmokeReadinessReport({ preflight });
    smoke.checks[0].evidence.routeRevision = 2;
    const check = checkSmokeReadinessArtifactConsistency({
      smokeReadinessReport: smoke,
      preflightReport: preflight,
      governancePlanReport: {
        plan_sha256: GOVERNANCE_PLAN_SHA256,
        ordered_initialization_evidence_sha256: ORDERED_INITIALIZATION_SHA256,
      },
      orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
      orderedInitializationEvidenceArtifactSha256:
        ORDERED_INITIALIZATION_SHA256,
    });
    expect(check).toMatchObject({
      status: "fail",
      evidence: {
        mismatches: expect.arrayContaining([
          expect.objectContaining({
            id: "route-preflight",
            field: "routeRevision",
          }),
        ]),
      },
    });
  });

  it("includes governed prover plan/evidence consistency in the production report", () => {
    const preflight = exactReadyPreflight();
    const snapshot = snapshotFixture();
    const actualOrderedHash =
      snapshot.inputs.orderedInitializationEvidence.sha256;
    const smoke = readySmokeReadinessReport({
      preflight,
      governancePlanSha256: hash("forged-plan"),
      orderedInitializationSha256: actualOrderedHash,
    });
    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      governancePlanReport: {
        plan_sha256: GOVERNANCE_PLAN_SHA256,
        ordered_initialization_evidence_sha256: actualOrderedHash,
      },
      orderedInitializationEvidenceReport: { schema: "ordered-evidence" },
      smokeReadinessReport: smoke,
      preLiveInputSnapshot: snapshot,
      governanceEvidence: { ready: true, checks: [] },
      expectedProverGovernanceApprovalSha256: GOVERNANCE_APPROVAL_SHA256,
      proverGovernanceApprovalReport: GOVERNANCE_APPROVAL_RECORD,
      proverGovernanceApprovalValidation: GOVERNANCE_APPROVAL_VALIDATION,
    });
    expect(
      report.checks.find(
        (check) => check.id === "smoke-readiness-artifact-consistency",
      ),
    ).toMatchObject({
      status: "fail",
      evidence: {
        mismatches: expect.arrayContaining([
          expect.objectContaining({
            id: "destination-prover",
            field: "governancePlanCanonicalSha256",
          }),
          expect.objectContaining({
            id: "source-prover",
            field: "governancePlanCanonicalSha256",
          }),
        ]),
      },
    });
  });

  it("requires exact SBPF V3 on every live governed ProgramData role", () => {
    const roleEvidence = (role, programAddress, programdataAddress, slot) => ({
      role,
      programAddress,
      programdataAddress,
      immutable: true,
      upgradeAuthority: null,
      programdataSlot: String(slot),
      programCodeHash: hash(`${role}:code`),
      programdataMetadataHash: hash(`${role}:metadata`),
      executableLength: 64,
      sbpfVersion: "V3",
      programContextSlot: 500,
      programdataContextSlot: 500,
    });
    const summary = {
      programs: {
        destination: "destination-program",
        source: "source-program",
        nativeVerifier: "native-program",
      },
      accounts: {
        destinationProgramData: "destination-programdata",
        sourceProgramData: "source-programdata",
        nativeVerifierProgramData: "native-programdata",
      },
      programDataSlots: { destination: 101, source: 102, nativeVerifier: 103 },
      codeHashes: {
        destination: hash("destination:code"),
        source: hash("source:code"),
        nativeVerifier: hash("nativeVerifier:code"),
      },
    };
    const preflightReport = {
      registrySummary: summary,
      checks: [
        {
          id: "solana-live-exact-programdata-evidence",
          status: "pass",
          evidence: {
            destination: roleEvidence(
              "destination",
              summary.programs.destination,
              summary.accounts.destinationProgramData,
              summary.programDataSlots.destination,
            ),
            source: roleEvidence(
              "source",
              summary.programs.source,
              summary.accounts.sourceProgramData,
              summary.programDataSlots.source,
            ),
            nativeVerifier: roleEvidence(
              "nativeVerifier",
              summary.programs.nativeVerifier,
              summary.accounts.nativeVerifierProgramData,
              summary.programDataSlots.nativeVerifier,
            ),
          },
        },
      ],
    };
    expect(checkPublicExactProgramdataReady({ preflightReport }).status).toBe(
      "pass",
    );
    preflightReport.checks[0].evidence.source.sbpfVersion = "V2";
    expect(checkPublicExactProgramdataReady({ preflightReport })).toMatchObject(
      {
        status: "fail",
        evidence: {
          problems: expect.arrayContaining([expect.stringMatching(/SBPF V3/u)]),
        },
      },
    );
  });

  it("snapshots only the exact success-critical pre-live inputs", () => {
    const ids = Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS);
    expect(ids).toEqual([
      "captureReviewPolicy",
      "freshDeployReport",
      "proverGovernanceApproval",
      "governancePlan",
      "governanceRegistration",
      "governanceActivation",
      "orderedInitializationEvidence",
      "smokeReadiness",
    ]);
    expect(
      ids.some((id) =>
        /routePublication|routeManager|publishReadiness|operatorHandoff|activationPackage/iu.test(
          id,
        ),
      ),
    ).toBe(false);
  });

  it("canonicalizes, validates, and path-binds a complete pre-live snapshot", () => {
    const snapshot = snapshotFixture();
    expect(validateSolanaProductionGatePreLiveInputSnapshot(snapshot)).toBe(
      snapshot,
    );
    const expectedPaths = Object.fromEntries(
      Object.entries(snapshot.inputs).map(([id, entry]) => [id, entry.path]),
    );
    expect(
      checkSolanaProductionGatePreLiveInputSnapshot({
        snapshot,
        expectedPaths,
      }),
    ).toMatchObject({ id: "pre-live-input-snapshot-valid", status: "pass" });
  });

  it("rejects a tampered or incomplete pre-live snapshot", () => {
    const tampered = structuredClone(snapshotFixture());
    tampered.inputs.governancePlan.sha256 = hash(Buffer.from("substituted"));
    expect(() =>
      validateSolanaProductionGatePreLiveInputSnapshot(tampered),
    ).toThrow(/hash is invalid/u);

    const incomplete = snapshotFixture({ present: false });
    const expectedPaths = Object.fromEntries(
      Object.entries(incomplete.inputs).map(([id, entry]) => [id, entry.path]),
    );
    expect(
      checkSolanaProductionGatePreLiveInputSnapshot({
        snapshot: incomplete,
        expectedPaths,
      }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        missingRequiredInputIds: expect.arrayContaining([
          "governancePlan",
          "governanceRegistration",
          "governanceActivation",
          "orderedInitializationEvidence",
        ]),
      },
    });
  });

  it("rejects swapped, stale, and hash-mismatched final MP4/VTT artifacts", () => {
    const mp4Path = path.resolve(tmpdir(), "final.mp4");
    const vttPath = path.resolve(tmpdir(), "final.vtt");
    const mp4Fact = { size: 101, sha256: hash("mp4") };
    const vttFact = { size: 202, sha256: hash("vtt") };
    const mediaArtifacts = {
      mp4: {
        path: mp4Path,
        mediaType: "video/mp4",
        ...mp4Fact,
      },
      vtt: {
        path: vttPath,
        mediaType: "text/vtt",
        ...vttFact,
      },
    };
    const check = (pins = mediaArtifacts, mp4 = mp4Fact, vtt = vttFact) =>
      checkSolanaLiveVideoMediaArtifactPins({
        mediaArtifacts: pins,
        mp4Fact: mp4,
        vttFact: vtt,
        mp4Path,
        vttPath,
      });
    expect(check()).toMatchObject({ status: "pass" });
    expect(
      check({ mp4: mediaArtifacts.vtt, vtt: mediaArtifacts.mp4 }),
    ).toMatchObject({ status: "fail" });
    expect(check(mediaArtifacts, { ...mp4Fact, size: 100 })).toMatchObject({
      status: "fail",
    });
    expect(
      check(mediaArtifacts, { ...mp4Fact, sha256: hash("substituted") }),
    ).toMatchObject({ status: "fail" });
  });

  it("rejects an embedded capture witness that differs from its pinned artifact", () => {
    const witness = {
      schema: "iroha-demo-sccp-solana-live-capture-witness/v2",
      reviewPolicySha256: hash("capture-review-policy"),
      preLiveInputSnapshotSha256: hash("pre-live-snapshot"),
      captureSha256: hash("capture"),
      evidenceBindingSha256: hash("evidence-binding"),
      independentReview: {
        captureBytesIndependentlyPinned: true,
        continuousBidirectionalUiFlowReviewed: true,
        publicRegistryRevisionVisible: true,
        tairaToSolanaReceiptsVisible: true,
        solanaToTairaReceiptsVisible: true,
        unrelatedMediaAbsent: true,
        qrOverlayOnly: false,
      },
      markers: [],
    };
    const bytes = Buffer.from(`${canonicalSccpJson(witness)}\n`, "utf8");
    const sha256 = hash(bytes);
    const artifact = { size: bytes.length, sha256 };
    const successPolicy = {
      liveCaptureWitnessPinned: true,
      liveCaptureWitnessSha256: sha256,
    };

    expect(
      checkSolanaLiveCaptureWitnessArtifactPin({
        witness,
        artifact,
        successPolicy,
        externalArtifact: {
          value: witness,
          size: bytes.length,
          sha256,
          error: null,
        },
      }),
    ).toMatchObject({ status: "pass" });

    const tamperedWitness = structuredClone(witness);
    tamperedWitness.independentReview.continuousBidirectionalUiFlowReviewed = false;
    expect(
      checkSolanaLiveCaptureWitnessArtifactPin({
        witness: tamperedWitness,
        artifact,
        successPolicy,
      }),
    ).toMatchObject({
      status: "fail",
      evidence: { embeddedWitnessBytesMatch: false },
    });
  });

  it("independently qualifies changing, audible final live-video content", () => {
    const analysis = buildSolanaLiveCaptureContentAnalysis({
      parsed: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41" },
      },
      frameHashes: Array.from({ length: 41 }, (_, index) =>
        `${index % 5}`.repeat(32),
      ),
      audioFrameHashes: Array.from({ length: 41 }, (_, index) =>
        `${index % 7}`.repeat(32),
      ),
      audioMaxVolumeDb: -8,
      videoEssenceSha256: hash("video-essence"),
      audioEssenceSha256: hash("audio-essence"),
    });

    expect(analysis).toMatchObject({
      ready: true,
      verifiedRealCapture: true,
      sampledFrameCount: 41,
      uniqueFrameCount: 5,
      audioMaxVolumeDb: -8,
      blockers: [],
    });
  });

  it("rejects extra video or audio playback streams", () => {
    const base = {
      format: { duration: "41" },
    };
    const analyze = (streams) =>
      buildSolanaLiveCaptureContentAnalysis({
        parsed: { ...base, streams },
        frameHashes: Array.from({ length: 41 }, (_, index) =>
          `${index % 5}`.repeat(32),
        ),
        audioFrameHashes: Array.from({ length: 41 }, (_, index) =>
          `${index % 7}`.repeat(32),
        ),
        audioMaxVolumeDb: -8,
        videoEssenceSha256: hash("video-essence"),
        audioEssenceSha256: hash("audio-essence"),
      });
    const video = {
      codec_type: "video",
      codec_name: "h264",
      width: 1280,
      height: 720,
    };
    const audio = { codec_type: "audio", codec_name: "aac" };

    expect(analyze([video, { ...video }, audio]).blockers).toContain(
      "capture-video-stream-shape",
    );
    expect(analyze([video, audio, { ...audio }]).blockers).toContain(
      "capture-audio-stream-shape",
    );
  });

  it("detects a full-frame substitution between one-second media samples", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solana-essence-"));
    const source = path.join(dir, "source.mp4");
    const substituted = path.join(dir, "substituted.mp4");
    const encode = (output, filter) => {
      const result = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=10:duration=4",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=1000:sample_rate=48000:duration=4",
          "-vf",
          filter,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-crf",
          "0",
          "-g",
          "1",
          "-keyint_min",
          "1",
          "-sc_threshold",
          "0",
          "-c:a",
          "aac",
          "-shortest",
          output,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(result.status, result.stderr).toBe(0);
    };
    try {
      encode(source, "null");
      encode(
        substituted,
        "drawbox=x=0:y=0:w=120:h=120:color=red:t=fill:enable=between(t\\,1.1\\,1.2)",
      );
      const facts = await collectArtifactFacts([source, substituted]);
      const sourceAnalysis = facts[source].media.contentAnalysis;
      const substitutedAnalysis = facts[substituted].media.contentAnalysis;

      expect(substitutedAnalysis.sampledFrameSha256).toBe(
        sourceAnalysis.sampledFrameSha256,
      );
      expect(substitutedAnalysis.videoEssenceSha256).not.toBe(
        sourceAnalysis.videoEssenceSha256,
      );
      expect(substitutedAnalysis.audioEssenceSha256).toBe(
        sourceAnalysis.audioEssenceSha256,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("independently rejects blank and silent final live-video content", () => {
    const analysis = buildSolanaLiveCaptureContentAnalysis({
      parsed: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41" },
      },
      frameHashes: Array(41).fill("a".repeat(32)),
      audioFrameHashes: Array(41).fill("b".repeat(32)),
      audioMaxVolumeDb: null,
    });

    expect(analysis.ready).toBe(false);
    expect(analysis.blockers).toEqual(
      expect.arrayContaining([
        "capture-frame-variation",
        "capture-non-silent-audio",
      ]),
    );
  });

  it("rejects a structurally valid final MP4 when semantic witness re-decode is absent or fails", () => {
    const base = {
      parsed: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41" },
      },
      frameHashes: Array.from({ length: 41 }, (_, index) =>
        `${index % 5}`.repeat(32),
      ),
      audioFrameHashes: Array.from({ length: 41 }, (_, index) =>
        `${index % 7}`.repeat(32),
      ),
      audioMaxVolumeDb: -8,
      requireSemanticWitness: true,
    };

    expect(buildSolanaLiveCaptureContentAnalysis(base)).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(["capture-semantic-witness"]),
    });
    expect(
      buildSolanaLiveCaptureContentAnalysis({
        ...base,
        semanticWitnessAnalysis: {
          ready: false,
          semanticallyBound: false,
          blockers: ["capture-semantic-witness-public-registry-dwell"],
        },
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(["capture-semantic-witness"]),
    });
  });

  it("requires every governance-era JSON report to load", () => {
    const reports = Object.fromEntries(
      Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS)
        .filter(
          (id) => id !== "deploymentVideoMp4" && id !== "deploymentVideoVtt",
        )
        .map((id) => [id, {}]),
    );
    expect(
      checkSolanaProductionGateRequiredReportsLoaded({ reports }),
    ).toMatchObject({ status: "pass" });
    reports.orderedInitializationEvidence = null;
    expect(
      checkSolanaProductionGateRequiredReportsLoaded({ reports }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        missingReportIds: ["orderedInitializationEvidence"],
      },
    });
  });

  it("accepts the governance and chronology CLI inputs and rejects retired aliases", () => {
    expect(
      parseArgs([
        "--governance-plan",
        "plan.json",
        "--governance-plan-sha256",
        `0x${"11".repeat(32)}`,
        "--fresh-deploy-report",
        "fresh-deploy.json",
        "--fresh-deploy-report-sha256",
        `0x${"33".repeat(32)}`,
        "--ordered-initialization-evidence",
        "ordered.json",
        "--ordered-initialization-evidence-sha256",
        `0x${"22".repeat(32)}`,
      ]),
    ).toMatchObject({
      "fresh-deploy-report": "fresh-deploy.json",
      "governance-plan": "plan.json",
      "ordered-initialization-evidence": "ordered.json",
    });
    expect(() =>
      parseArgs(["--route-manager-access-request", "retired.json"]),
    ).toThrow(/Unknown option/u);
    expect(() => parseArgs(["--activation-package", "retired.json"])).toThrow(
      /Unknown option/u,
    );
    for (const option of [
      "route-manifest",
      "requirements",
      "post-deploy-evidence",
      "proof-material-bundle",
      "source-material-handoff",
      "deployment-video-transcript",
      "deployment-video-mp4",
      "deployment-video-vtt",
    ]) {
      expect(() => parseArgs([`--${option}`, "retired.json"])).toThrow(
        /Unknown option/u,
      );
    }
  });

  it("requires exact pinned fresh-deploy bytes and finalized lifecycle replay", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-fresh-deploy-"),
    );
    try {
      const preflightPath = path.join(directory, "preflight.json");
      const freshDeployPath = path.join(directory, "fresh-deploy.json");
      const freshDeployBytes = Buffer.from('{"canonical":"fixture"}');
      const freshDeploySha256 = hash(freshDeployBytes);
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await writeFile(freshDeployPath, freshDeployBytes);

      let runIndex = 0;
      const run = (overrides = {}) => {
        runIndex += 1;
        return runSccpSolanaProductionGate({
          outputDir: path.join(directory, `gate-${runIndex}`),
          deployDir: directory,
          preflightReport: preflightPath,
          freshDeployReport: freshDeployPath,
          freshDeployReportSha256: freshDeploySha256,
          liveVideoTranscript: path.join(directory, "absent-live.json"),
          liveVideoMp4: path.join(directory, "absent-live.mp4"),
          liveVideoVtt: path.join(directory, "absent-live.vtt"),
          blockedLiveVideoTranscript: path.join(
            directory,
            "absent-blocked-live.json",
          ),
          blockedLiveVideoMp4: path.join(directory, "absent-blocked-live.mp4"),
          blockedLiveVideoVtt: path.join(directory, "absent-blocked-live.vtt"),
          ...overrides,
        });
      };
      const check = (result) =>
        result.report.checks.find(
          ({ id }) => id === "fresh-loader-v3-deployment-evidence",
        );
      const validator = ({ reportBytes, expectedReportSha256 }) => {
        expect(hash(reportBytes)).toBe(expectedReportSha256);
        return normalizedFreshDeployFixture(expectedReportSha256);
      };
      const verifiedTransactions = Array.from({ length: 10 }, (_, index) => ({
        stage: `stage-${index}`,
      }));

      const exact = await run({
        freshDeployReportValidator: validator,
        freshDeployTransactionVerifier: async (_connection, normalized) => ({
          ready: true,
          reportSha256: normalized.reportSha256,
          transactionCount: verifiedTransactions.length,
          transactions: verifiedTransactions,
        }),
        solanaConnection: {},
      });
      expect(check(exact)).toMatchObject({
        status: "pass",
        evidence: {
          canonicalReportValidated: true,
          liveFinalizedRpcReplay: true,
          expectedTransactionCount: 10,
          verifiedTransactionCount: 10,
          problems: [],
        },
      });
      expect(exact.report.nextActionIds).not.toContain(
        "deploy-fresh-exact-solana-programs",
      );

      const divergentGovernancePlanPath = path.join(
        directory,
        "divergent-governance-plan.json",
      );
      await writeFile(
        divergentGovernancePlanPath,
        JSON.stringify({
          fresh_deploy_report_sha256: hash("different-fresh-deploy-report"),
        }),
      );
      const crossBindingDrift = await run({
        governancePlan: divergentGovernancePlanPath,
        freshDeployReportValidator: validator,
        freshDeployTransactionVerifier: async (_connection, normalized) => ({
          ready: true,
          reportSha256: normalized.reportSha256,
          transactionCount: verifiedTransactions.length,
          transactions: verifiedTransactions,
        }),
        solanaConnection: {},
      });
      expect(check(crossBindingDrift)).toMatchObject({
        status: "fail",
        evidence: {
          freshDeployReady: false,
          problems: expect.arrayContaining([
            expect.objectContaining({ id: "governance-report-binding" }),
          ]),
        },
      });
      expect(crossBindingDrift.report.nextActionDetails[0]).toMatchObject({
        id: "deploy-fresh-exact-solana-programs",
        blockedBy: [],
      });

      const drift = await run({
        freshDeployReportValidator: validator,
        freshDeployTransactionVerifier: async () => {
          throw new Error("finalized transaction drift");
        },
        solanaConnection: {},
      });
      expect(check(drift)).toMatchObject({
        status: "fail",
        evidence: {
          problems: expect.arrayContaining([
            expect.objectContaining({ id: "finalized-transaction-replay" }),
          ]),
        },
      });

      const skipped = await run({
        freshDeployReportValidator: validator,
        skipSolanaRpc: true,
      });
      expect(check(skipped)).toMatchObject({
        status: "fail",
        evidence: {
          liveFinalizedRpcReplay: false,
          problems: expect.arrayContaining([
            expect.objectContaining({ id: "finalized-rpc-skipped" }),
          ]),
        },
      });

      const missing = await run({
        freshDeployReport: path.join(directory, "missing-fresh-deploy.json"),
      });
      expect(check(missing)).toMatchObject({
        status: "fail",
        evidence: { canonicalReportValidated: false },
      });
      expect(
        missing.report.preLiveInputSnapshot.inputs.freshDeployReport,
      ).toMatchObject({ present: false, sha256: null, size: 0 });

      const malformedPath = path.join(directory, "malformed-fresh-deploy.json");
      const malformedBytes = Buffer.from("not-json");
      await writeFile(malformedPath, malformedBytes);
      const malformed = await run({
        freshDeployReport: malformedPath,
        freshDeployReportSha256: hash(malformedBytes),
      });
      expect(check(malformed)).toMatchObject({
        status: "fail",
        evidence: { canonicalReportValidated: false },
      });

      const staleHash = await run({
        freshDeployReportSha256: hash("stale-reviewed-report"),
      });
      expect(check(staleHash)).toMatchObject({
        status: "fail",
        evidence: {
          canonicalReportValidated: false,
          problems: expect.arrayContaining([
            expect.objectContaining({ id: "exact-report-byte-binding" }),
          ]),
        },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires a fresh canonical governance-pinned network pass", () => {
    const ready = buildSolanaProductionGateSuccessExecutionPolicy({
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      freshPreflightCompleted: true,
      preflightReport: canonicalPreflight(),
      governancePlan: { schema: "iroha-sccp-solana-route-governance-plan/v1" },
      governanceRegistration: {
        torii_url: "https://taira-validator-1.sora.org",
      },
      governanceActivation: {
        torii_url: "https://taira-validator-1.sora.org",
      },
      governanceEvidenceReady: true,
    });
    expect(ready).toMatchObject({
      ready: true,
      governancePinReady: true,
      freshPreflightCompleted: true,
      preflightEndpointIdentityReady: true,
      problems: [],
    });

    const divergent = buildSolanaProductionGateSuccessExecutionPolicy({
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      freshPreflightCompleted: true,
      preflightReport: canonicalPreflight(),
      governancePlan: {},
      governanceRegistration: {
        torii_url: "https://taira-validator-1.sora.org",
      },
      governanceActivation: {
        torii_url: "https://taira-validator-2.sora.org",
      },
      governanceEvidenceReady: true,
    });
    expect(divergent.ready).toBe(false);
    expect(divergent.problems.map(({ id }) => id)).toContain(
      "governance-pinned-taira-validator-root",
    );
  });

  it("reports the exact governance checks without legacy publication checks", () => {
    const report = buildSolanaProductionGateReport({
      governanceEvidence: {
        ready: false,
        checks: [
          {
            id: "governance-plan-reviewed",
            status: "fail",
            detail: "missing",
          },
          {
            id: "governance-ordered-initialization-evidence",
            status: "fail",
            detail: "missing",
          },
          {
            id: "governance-register-evidence",
            status: "fail",
            detail: "missing",
          },
          {
            id: "governance-activate-evidence",
            status: "fail",
            detail: "missing",
          },
          {
            id: "governance-phases-distinct",
            status: "fail",
            detail: "missing",
          },
          {
            id: "governance-enactment-readback",
            status: "fail",
            detail: "missing",
          },
        ],
      },
    });
    const ids = report.checks.map(({ id }) => id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "governance-plan-reviewed",
        "governance-ordered-initialization-evidence",
        "governance-register-evidence",
        "governance-activate-evidence",
        "governance-phases-distinct",
        "governance-enactment-readback",
      ]),
    );
    expect(
      ids.some((id) =>
        /route-manager|publication-request|operator-handoff|activation-package|publish-readiness|governance-program-role-pins/iu.test(
          id,
        ),
      ),
    ).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/outerVerifier|four Solana/iu);
    expect(report.nextActions).toEqual(SOLANA_PRODUCTION_NEXT_ACTION_ORDER);
    expect(report.nextActionDetails[0]).toMatchObject({
      id: "deploy-fresh-exact-solana-programs",
      executable: true,
      blockedBy: [],
    });
    expect(report.nextActionDetails[0].command.slice(0, 3)).toEqual([
      "npm",
      "run",
      "sccp:solana:fresh-deploy",
    ]);
    const freshReportIndex =
      report.nextActionDetails[0].command.indexOf("--report");
    expect(freshReportIndex).toBeGreaterThan(0);
    expect(report.nextActionDetails[0].command[freshReportIndex + 1]).toContain(
      "taira-solana-xor-fresh-deploy-report.json",
    );
    expect(report.nextActionDetails[1]).toMatchObject({
      id: "capture-and-pin-solana-ordered-initialization-evidence",
      executable: false,
      command: [],
      blockedBy: ["deploy-fresh-exact-solana-programs"],
    });
  });

  it("orders the exact first-release action DAG and exposes only a runnable frontier", () => {
    const readinessKeys = [
      "freshDeployReady",
      "exactInitializationReady",
      "routeCandidateReady",
      "governancePlanReady",
      "registrationProposalReady",
      "registrationReadbackReady",
      "activationProposalReady",
      "activationReadbackReady",
      "smokeReady",
      "liveCaptureReady",
    ];
    const allMissing = buildSolanaProductionNextActionDag();
    expect(allMissing.map(({ id }) => id)).toEqual(
      SOLANA_PRODUCTION_NEXT_ACTION_ORDER,
    );
    expect(allMissing[0]).toMatchObject({ executable: true, blockedBy: [] });
    expect(allMissing[0].command.slice(0, 3)).toEqual([
      "npm",
      "run",
      "sccp:solana:fresh-deploy",
    ]);
    expect(
      allMissing.slice(1).every(({ command }) => command.length === 0),
    ).toBe(true);
    expect(allMissing.slice(1).map(({ blockedBy }) => blockedBy)).toEqual(
      SOLANA_PRODUCTION_NEXT_ACTION_ORDER.slice(0, -1).map((id) => [id]),
    );

    const expectedRunnable = new Map([
      [
        "deploy-fresh-exact-solana-programs",
        {
          script: "sccp:solana:fresh-deploy",
          outputFlag: "--report",
          output: "taira-solana-xor-fresh-deploy-report.json",
        },
      ],
      [
        "capture-and-pin-solana-ordered-initialization-evidence",
        {
          script: "sccp:solana:exact-initialize",
          outputFlag: "--evidence",
          output: "taira-solana-xor-ordered-initialization-evidence.json",
        },
      ],
      [
        "build-reviewed-solana-governance-plan",
        {
          script: "sccp:solana:governance-plan",
          outputFlag: "--out",
          output: "taira-solana-xor-governance-plan.json",
        },
      ],
      [
        "submit-solana-route-registration-proposal",
        {
          script: "sccp:solana:governance",
          outputFlag: "--out",
          output: "taira-solana-xor-governance-register.json",
          phase: "register",
        },
      ],
      [
        "submit-solana-route-activation-proposal",
        {
          script: "sccp:solana:governance",
          outputFlag: "--out",
          output: "taira-solana-xor-governance-activate.json",
          phase: "activate",
        },
      ],
      [
        "complete-solana-smoke-readiness",
        {
          script: "e2e:sccp:solana-smoke-readiness",
          outputFlag: "--output-dir",
          output: "smoke-readiness",
        },
      ],
      [
        "record-solana-live-bidirectional-video",
        {
          script: "e2e:sccp:solana-video",
          outputFlag: "--output-dir",
          output: "sccp-solana-live-video",
        },
      ],
    ]);

    for (let index = 0; index < readinessKeys.length; index += 1) {
      const state = Object.fromEntries(
        readinessKeys.map((key, stageIndex) => [key, stageIndex < index]),
      );
      const actions = buildSolanaProductionNextActionDag(state);
      const frontier = actions[0];
      expect(frontier.id).toBe(SOLANA_PRODUCTION_NEXT_ACTION_ORDER[index]);
      expect(frontier.blockedBy).toEqual([]);
      const expected = expectedRunnable.get(frontier.id);
      if (!expected) {
        expect(frontier).toMatchObject({ executable: false, command: [] });
      } else {
        expect(frontier.executable).toBe(true);
        expect(frontier.command.slice(0, 3)).toEqual([
          "npm",
          "run",
          expected.script,
        ]);
        const outputIndex = frontier.command.indexOf(expected.outputFlag);
        expect(outputIndex).toBeGreaterThan(0);
        expect(frontier.command[outputIndex + 1]).toContain(expected.output);
        if (expected.phase) {
          const phaseIndex = frontier.command.indexOf("--phase");
          expect(frontier.command[phaseIndex + 1]).toBe(expected.phase);
        }
      }
      expect(
        actions
          .slice(1)
          .every(
            ({ executable, command }) =>
              executable === false && command.length === 0,
          ),
      ).toBe(true);
    }

    const liveCaptureFrontier = buildSolanaProductionNextActionDag(
      Object.fromEntries(
        readinessKeys.map((key, index) => [
          key,
          index < readinessKeys.length - 1,
        ]),
      ),
    )[0];
    expect(liveCaptureFrontier.command).toEqual(
      expect.arrayContaining([
        "--live-capture-witness",
        "<reviewed-live-capture-witness.json>",
        "--live-capture-witness-sha256",
        "<reviewed-live-capture-witness-sha256>",
        "--live-capture-review-attestation",
        "<reviewed-live-capture-review-attestation.json>",
        "--live-capture-review-attestation-sha256",
        "<reviewed-live-capture-review-attestation-sha256>",
      ]),
    );
    expect(liveCaptureFrontier.requiredInputs).toContain(
      "independently-reviewed-live-capture-witness",
    );
    expect(liveCaptureFrontier.requiredInputs).toEqual(
      expect.arrayContaining([
        "detached-threshold-ed25519-capture-review-attestation",
        "approval-pinned-capture-review-policy",
      ]),
    );

    expect(
      buildSolanaProductionNextActionDag(
        Object.fromEntries(readinessKeys.map((key) => [key, true])),
      ),
    ).toEqual([]);
  });

  it("snapshots canonical approval bytes and rejects later byte drift from the independent pin", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-approval-"),
    );
    try {
      const preflightPath = path.join(directory, "preflight.json");
      const approvalPath = path.join(directory, "exact-prover-approval.json");
      const canonicalBytes = Buffer.from(
        `${canonicalSolanaExactProverApprovalJson(GOVERNANCE_APPROVAL_RECORD)}\n`,
      );
      const canonicalHash = hash(canonicalBytes);
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await writeFile(approvalPath, canonicalBytes);
      const first = await runSccpSolanaProductionGate({
        outputDir: path.join(directory, "gate-first"),
        deployDir: directory,
        preflightReport: preflightPath,
        proverGovernanceApproval: approvalPath,
        proverGovernanceApprovalSha256: canonicalHash,
        skipSolanaRpc: true,
      });
      expect(
        first.report.preLiveInputSnapshot.inputs.proverGovernanceApproval,
      ).toMatchObject({
        present: true,
        path: approvalPath,
        size: canonicalBytes.length,
        sha256: canonicalHash,
      });
      expect(JSON.stringify(first.report)).not.toContain(
        canonicalSolanaExactProverApprovalJson(GOVERNANCE_APPROVAL_RECORD),
      );

      await writeFile(
        approvalPath,
        Buffer.concat([canonicalBytes.subarray(0, -1), Buffer.from(" \n")]),
      );
      await expect(
        runSccpSolanaProductionGate({
          outputDir: path.join(directory, "gate-drift"),
          deployDir: directory,
          preflightReport: preflightPath,
          proverGovernanceApproval: approvalPath,
          proverGovernanceApprovalSha256: canonicalHash,
          skipSolanaRpc: true,
        }),
      ).rejects.toThrow(/SHA-256 mismatch/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects pre-live input drift against the just-reviewed snapshot hash", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-pre-live-drift-"),
    );
    try {
      const preflightPath = path.join(directory, "preflight.json");
      const governancePlanPath = path.join(directory, "governance-plan.json");
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await writeFile(governancePlanPath, JSON.stringify({ revision: 1 }));
      const first = await runSccpSolanaProductionGate({
        outputDir: path.join(directory, "gate-first"),
        deployDir: directory,
        preflightReport: preflightPath,
        governancePlan: governancePlanPath,
        skipSolanaRpc: true,
      });
      const reviewedSnapshotSha256 = first.report.preLiveInputSnapshotSha256;
      expect(reviewedSnapshotSha256).toMatch(/^0x[0-9a-f]{64}$/u);

      await writeFile(governancePlanPath, JSON.stringify({ revision: 2 }));
      await expect(
        runSccpSolanaProductionGate({
          outputDir: path.join(directory, "gate-drift"),
          deployDir: directory,
          preflightReport: preflightPath,
          governancePlan: governancePlanPath,
          expectedPreLiveInputSnapshotSha256: reviewedSnapshotSha256,
          skipSolanaRpc: true,
        }),
      ).rejects.toThrow(/pre-live input snapshot changed/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not serialize values from a canonical but invalid approval descriptor", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-approval-redaction-"),
    );
    try {
      const secret = "approval-password-must-not-leak";
      const preflightPath = path.join(directory, "preflight.json");
      const approvalPath = path.join(directory, "invalid-approval.json");
      const invalidApproval = structuredClone(GOVERNANCE_APPROVAL_RECORD);
      invalidApproval.schema = secret;
      invalidApproval.approvalId = secret;
      invalidApproval.pins.destinationProverModuleHash = secret;
      invalidApproval[secret] = { password: secret };
      const bytes = Buffer.from(
        `${canonicalSolanaExactProverApprovalJson(invalidApproval)}\n`,
      );
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await writeFile(approvalPath, bytes);
      const { report } = await runSccpSolanaProductionGate({
        outputDir: path.join(directory, "gate"),
        deployDir: directory,
        preflightReport: preflightPath,
        proverGovernanceApproval: approvalPath,
        proverGovernanceApprovalSha256: hash(bytes),
        skipSolanaRpc: true,
      });
      expect(report.ready).toBe(false);
      expect(JSON.stringify(report)).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails immediately when pinned ordered-init evidence is missing", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-pin-"),
    );
    try {
      const preflightPath = path.join(directory, "preflight.json");
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await expect(
        runSccpSolanaProductionGate({
          outputDir: path.join(directory, "gate"),
          deployDir: directory,
          preflightReport: preflightPath,
          orderedInitializationEvidence: path.join(
            directory,
            "missing-ordered.json",
          ),
          orderedInitializationEvidenceSha256: `0x${"ab".repeat(32)}`,
          skipSolanaRpc: true,
        }),
      ).rejects.toThrow(/Pinned .* input is missing/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails immediately when ordered-init bytes drift from their pin", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-drift-"),
    );
    try {
      const preflightPath = path.join(directory, "preflight.json");
      const orderedPath = path.join(directory, "ordered.json");
      await writeFile(preflightPath, JSON.stringify(canonicalPreflight()));
      await writeFile(orderedPath, "{}");
      await expect(
        runSccpSolanaProductionGate({
          outputDir: path.join(directory, "gate"),
          deployDir: directory,
          preflightReport: preflightPath,
          orderedInitializationEvidence: orderedPath,
          orderedInitializationEvidenceSha256: `0x${"cd".repeat(32)}`,
          skipSolanaRpc: true,
        }),
      ).rejects.toThrow(/SHA-256 mismatch/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an output path or inode that aliases any gate input", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-gate-alias-"),
    );
    try {
      const input = path.join(directory, "input.json");
      await writeFile(input, "{}");
      await expect(
        assertSolanaProductionGateOutputIsDisjoint({
          outputPath: input,
          inputPaths: [input],
        }),
      ).rejects.toThrow(/collides/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

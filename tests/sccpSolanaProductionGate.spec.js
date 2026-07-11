import path from "node:path";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  buildSolanaProductionGateReport as buildSolanaProductionGateReportImpl,
  buildSolanaProductionGatePreLiveInputSnapshot,
  buildSolanaProductionGateSuccessExecutionPolicy,
  checkGovernanceProgramRolePinsFresh,
  checkPublicBridgeSourceProgramdataReady,
  checkPublicVerifierProgramdataReady,
  checkProductionRequirementsArtifactConsistency,
  checkSmokeReadinessArtifactConsistency,
  checkSourceMaterialHandoffArtifactConsistency,
  checkSourceBurnArtifactConsistency,
  checkSourceBurnProofRequestReady,
  collectArtifactFacts,
  SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS,
  runSccpSolanaProductionGate,
  validateSolanaProductionGatePreLiveInputSnapshot,
} from "../scripts/e2e/sccp-solana-production-gate.mjs";
import { buildBlockedSolanaLiveVideoTranscript } from "../scripts/e2e/sccp-solana-live-video.mjs";

const cueTextHash = (cueTexts) =>
  `0x${createHash("sha256").update(cueTexts.join("\n")).digest("hex")}`;

const stripVolatileReviewFields = (value) => {
  if (Array.isArray(value)) {
    return value.map(stripVolatileReviewFields);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "checkedAt" && key !== "checked_at")
      .map(([key, entry]) => [key, stripVolatileReviewFields(entry)]),
  );
};

const reviewSha256ForJson = (json) =>
  `0x${createHash("sha256")
    .update(JSON.stringify(stripVolatileReviewFields(json)))
    .digest("hex")}`;

const sha256ForJson = (json) =>
  `0x${createHash("sha256").update(JSON.stringify(json)).digest("hex")}`;

const artifactFacts = (...files) =>
  Object.fromEntries(
    files.map((file) => {
      const resolved = path.resolve(file);
      const fact = { path: resolved, exists: true, size: 1024 };
      if (resolved.endsWith(".mp4")) {
        const embeddedCueTexts = resolved.endsWith(
          "sccp-solana-deployment-video.mp4",
        )
          ? deploymentSubtitleCues().map((cue) => cue.text)
          : resolved.endsWith("sccp-solana-live-video-blocked.mp4")
            ? blockedLiveSubtitleCues().map((cue) => cue.text)
            : liveSubtitleCues().map((cue) => cue.text);
        fact.media = {
          probed: true,
          formatName: "mov,mp4,m4a,3gp,3g2,mj2",
          formatOk: true,
          hasVideo: true,
          hasAudio: true,
          hasEmbeddedSubtitle: true,
          embeddedSubtitle: {
            extracted: true,
            cueCount: embeddedCueTexts.length,
            cueTextSha256: cueTextHash(embeddedCueTexts),
            firstCue: embeddedCueTexts[0],
            lastCue: embeddedCueTexts.at(-1),
            error: null,
          },
          streams: [
            { index: 0, codecType: "video", codecName: "h264" },
            { index: 1, codecType: "audio", codecName: "aac" },
            { index: 2, codecType: "subtitle", codecName: "mov_text" },
          ],
        };
      }
      if (resolved.endsWith(".vtt")) {
        fact.vtt = { webvtt: true };
        if (resolved.endsWith("sccp-solana-deployment-video.vtt")) {
          const cueTexts = deploymentSubtitleCues().map((cue) => cue.text);
          fact.vtt = {
            webvtt: true,
            cueCount: cueTexts.length,
            cueTextSha256: cueTextHash(cueTexts),
            firstCue: cueTexts[0],
            lastCue: cueTexts.at(-1),
            cueTexts,
          };
        }
        if (resolved.endsWith("sccp-solana-live-video.vtt")) {
          const cueTexts = liveSubtitleCues().map((cue) => cue.text);
          fact.vtt = {
            webvtt: true,
            cueCount: cueTexts.length,
            cueTextSha256: cueTextHash(cueTexts),
            firstCue: cueTexts[0],
            lastCue: cueTexts.at(-1),
            cueTexts,
          };
        }
        if (resolved.endsWith("sccp-solana-live-video-blocked.vtt")) {
          const cueTexts = blockedLiveSubtitleCues().map((cue) => cue.text);
          fact.vtt = {
            webvtt: true,
            cueCount: cueTexts.length,
            cueTextSha256: cueTextHash(cueTexts),
            firstCue: cueTexts[0],
            lastCue: cueTexts.at(-1),
            cueTexts,
          };
        }
      }
      return [resolved, fact];
    }),
  );

const FIXTURE_VERIFIER_PROGRAM_ID =
  "Verifier1111111111111111111111111111111111";
const FIXTURE_NATIVE_VERIFIER_PROGRAM_ID =
  "NativeVerifier11111111111111111111111111111";
const FIXTURE_BRIDGE_PROGRAM_ID = "Bridge1111111111111111111111111111111111111";
const FIXTURE_SOURCE_BRIDGE_PROGRAM_ID =
  "SourceBridge11111111111111111111111111111111";
const FIXTURE_BRIDGE_PROGRAMDATA_ADDRESS =
  "BridgeProgramData111111111111111111111111111";
const FIXTURE_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS =
  "SourceProgramData111111111111111111111111111";
const FIXTURE_TOKEN_MINT_ADDRESS = "Mint11111111111111111111111111111111111111";
const FIXTURE_VERIFIER_CODE_HASH = `0x${"de".repeat(32)}`;
const FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS =
  "ProgramData1111111111111111111111111111111";
const FIXTURE_NATIVE_VERIFIER_PROGRAMDATA_ADDRESS =
  "NativeProgramData11111111111111111111111111";
const FIXTURE_VERIFIER_PROGRAMDATA_SLOT = "419893805";
const FIXTURE_DESTINATION_BINDING_HASH = `0x${"db".repeat(32)}`;
const FIXTURE_SOURCE_BRIDGE_CONFIG_HASH = `0x${"11".repeat(32)}`;
const FIXTURE_VERIFIER_STATE_ADDRESS =
  "VerifierState111111111111111111111111111111";
const FIXTURE_ROUTE_CANARY_SIGNATURE =
  "canary111111111111111111111111111111111111111111111111111111111111111111";
const FIXTURE_ROUTE_CANARY_EVIDENCE_HASH = `0x${"16".repeat(32)}`;
const FIXTURE_SOURCE_BURN_SIGNATURE =
  "burn1111111111111111111111111111111111111111111111111111111111111111111";
const FIXTURE_SOURCE_BURN_OWNER = "Owner1111111111111111111111111111111111111";
const FIXTURE_SOURCE_BURN_TOKEN =
  "SourceToken1111111111111111111111111111111111";
const FIXTURE_SOURCE_STATE_ADDRESS =
  "SourceState111111111111111111111111111111111";
const FIXTURE_SOURCE_BURN_AMOUNT = "1";
const FIXTURE_SOURCE_BURN_HASH = `0x${"15".repeat(32)}`;
const FIXTURE_SOURCE_BURN_MESSAGE_ID = `0x${"12".repeat(32)}`;
const FIXTURE_SOURCE_BURN_COMMITMENT_ROOT = `0x${"13".repeat(32)}`;
const FIXTURE_SOURCE_BURN_PAYLOAD_HASH = `0x${"14".repeat(32)}`;
const FIXTURE_SOURCE_BURN_RECIPIENT =
  "testuﾛ1PCﾔｲﾋfnBKojヰﾚhFﾍﾙWQ4ｹﾛwｵYFﾍWVﾆ3BmcヱzｳﾓｶJ1YPLN";
const FIXTURE_SOURCE_BURN_NONCE = "1783245112628";
const FIXTURE_ACTIVATION_PACKAGE_HASH = `0x${"ac".repeat(32)}`;
const FIXTURE_OPERATOR_HANDOFF_HASH = `0x${"ab".repeat(32)}`;
const FIXTURE_DESTINATION_PROVER_MODULE_HASH = `0x${"66".repeat(32)}`;
const FIXTURE_SOURCE_PROVER_MODULE_HASH = `0x${"67".repeat(32)}`;
const FIXTURE_DESTINATION_PROVER_SIDECAR_HASH = `0x${"68".repeat(32)}`;
const FIXTURE_SOURCE_PROVER_SIDECAR_HASH = `0x${"69".repeat(32)}`;
const FIXTURE_LIVE_FORWARD_MESSAGE_ID = `0x${"11".repeat(32)}`;
const FIXTURE_LIVE_TAIRA_SOURCE_TX = `0x${"12".repeat(32)}`;
const FIXTURE_LIVE_SOLANA_FINALIZE_TX = "5".repeat(64);
const FIXTURE_LIVE_SOLANA_SOURCE_TX = "6".repeat(64);
const FIXTURE_LIVE_TAIRA_SETTLEMENT_TX = `0x${"22".repeat(32)}`;
const TAIRA_NETWORK_PREFIX = 369;
const ROUTE_MANAGER_AUTHORITY = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x47),
}).toI105(TAIRA_NETWORK_PREFIX);

const readySuccessExecutionPolicy = () => ({
  schema: "iroha-demo-sccp-solana-production-gate-success-policy/v1",
  mode: "canonical-fresh-read-only-v1",
  ready: true,
  readOnly: true,
  freshPreflightRequired: true,
  freshPreflightCompleted: true,
  preflightEndpointIdentityReady: true,
  nativeNetworkClientsRequired: true,
  skipSolanaRpc: false,
  preflightReportOverride: false,
  prerequisiteReportOverrideIds: [],
  injectedReadbackOverride: false,
  toriiUrl: "https://taira-validator-1.sora.org",
  solanaRpcUrl: "https://api.testnet.solana.com",
  canonicalTairaValidatorRoot: true,
  canonicalSolanaTestnetRpc: true,
  governancePinRequired: true,
  governancePinnedToriiUrl: "https://taira-validator-1.sora.org",
  governancePinReady: true,
  problems: [],
});

const readyAuthoritativeRevalidation = () => ({
  ready: true,
  readOnly: true,
  nativeNetworkClientsUsed: true,
  packageHashesReady: true,
});

const buildSolanaProductionGateReport = (options = {}) =>
  buildSolanaProductionGateReportImpl({
    successExecutionPolicy: readySuccessExecutionPolicy(),
    liveVideoAuthoritativeRevalidation: readyAuthoritativeRevalidation(),
    expectedLiveEvidencePackageHashes: {
      activationPackageHash: FIXTURE_ACTIVATION_PACKAGE_HASH,
      operatorHandoffHash: FIXTURE_OPERATOR_HANDOFF_HASH,
    },
    ...options,
  });

const deploymentSubtitleCues = ({ ready = false } = {}) =>
  [
    "Step 1: Built the Solana SBF program for taira_sol_xor.",
    "Step 2: Verified deployer on Solana testnet.",
    `Step 3: Deployed immutable verifier ${FIXTURE_VERIFIER_PROGRAM_ID}.`,
    `Step 4: Deployed immutable bridge ${FIXTURE_BRIDGE_PROGRAM_ID} and source bridge ${FIXTURE_SOURCE_BRIDGE_PROGRAM_ID}.`,
    `Step 5: Created SPL TairaXOR mint ${FIXTURE_TOKEN_MINT_ADDRESS}.`,
    "Step 6: Initialized verifier and source burn state accounts.",
    `Step 7: Captured finalized ProgramData evidence with verifier hash ${FIXTURE_VERIFIER_CODE_HASH}.`,
    "Step 8: Read finalized Solana mint and state accounts.",
    `Step 9: Submitted diagnostic route canary ${FIXTURE_ROUTE_CANARY_SIGNATURE}.`,
    `Step 10: Submitted real Solana source burn ${FIXTURE_SOURCE_BURN_SIGNATURE}.`,
    "Step 11: Burn targeted the selected TAIRA recipient.",
    "Step 12: Refreshed source-proof pins.",
    "Step 13: Bound post-deploy manifest evidence.",
    "Step 14: Checked source-burn readiness after burn.",
    "Step 15: Validated Solana browser prover modules and sidecars.",
    "Step 16: Wrote proof-material handoff and production patch command.",
    "Step 17: Wrote proof-material request package.",
    "Step 18: Hashed the non-secret proof-material bundle.",
    "Step 19: Wrote the governed proof-material ceremony package.",
    "Step 20: Verified handoff against live Solana RPC.",
    "Step 21: Checked TAIRA publish readiness, route-manager handoff, and app smoke.",
    "Step 22: Wrote the public Solana lane activation request.",
    `Step 23: Packaged activation evidence for TAIRA operators. Package hash ${FIXTURE_ACTIVATION_PACKAGE_HASH}.`,
    "Step 24: Operator handoff status.",
    ...(ready
      ? []
      : [
          "Blocked: public TAIRA has no production taira_sol_xor manifest and no governed bidirectional transfer evidence exists.",
        ]),
  ].map((text, index) => ({
    index: index + 1,
    start: "00:00.000",
    end: "00:01.000",
    text,
    step: Number(text.match(/^Step\s+(\d+):/u)?.[1] ?? 0) || null,
  }));

const deploymentVideoTranscript = ({ ready = false } = {}) => ({
  schema: "iroha-demo-sccp-solana-deployment-video/v1",
  routeId: "taira_sol_xor",
  ready,
  deployment: {
    verifierProgramId: FIXTURE_VERIFIER_PROGRAM_ID,
    bridgeProgramId: FIXTURE_BRIDGE_PROGRAM_ID,
    sourceBridgeProgramId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
    tokenMintAddress: FIXTURE_TOKEN_MINT_ADDRESS,
    verifierCodeHash: FIXTURE_VERIFIER_CODE_HASH,
    verifierProgramdataAddress: FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS,
    verifierProgramdataSlot: Number(FIXTURE_VERIFIER_PROGRAMDATA_SLOT),
    verifierStateAddress: FIXTURE_VERIFIER_STATE_ADDRESS,
    sourceStateAddress: FIXTURE_SOURCE_STATE_ADDRESS,
    routeCanary: {
      signature: FIXTURE_ROUTE_CANARY_SIGNATURE,
      canaryEvidenceHash: FIXTURE_ROUTE_CANARY_EVIDENCE_HASH,
    },
    sourceBurnSubmission: {
      submitted: true,
      signature: FIXTURE_SOURCE_BURN_SIGNATURE,
      sourceTokenAddress: FIXTURE_SOURCE_BURN_TOKEN,
      amountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
      tairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
      nonce: FIXTURE_SOURCE_BURN_NONCE,
      sourceProofRequestReady: true,
      sourceBurnCanonicalTransferReady: true,
      sourceBurnMessageId: FIXTURE_SOURCE_BURN_MESSAGE_ID,
      sourceBurnCommitmentRoot: FIXTURE_SOURCE_BURN_COMMITMENT_ROOT,
      sourceBurnPayloadHash: FIXTURE_SOURCE_BURN_PAYLOAD_HASH,
    },
    sourceMaterialHandoff: {
      readyForProofMaterialCeremony: true,
      productionProofMaterialIncluded: false,
      observedPins: readySourceMaterialHandoffObservedPins(),
      blockers: [],
    },
    sourceMaterialHandoffVerification: {
      ready: true,
      statuses: readyHandoffVerificationReport().statuses.map((status) => ({
        id: status.id,
        status: status.status,
      })),
      blockers: [],
    },
    sourceBurnReadiness: {
      readyToSubmitBurn: true,
      ownerAddress: FIXTURE_SOURCE_BURN_OWNER,
      selectedSourceToken: {
        address: FIXTURE_SOURCE_BURN_TOKEN,
      },
      blockers: [],
    },
    activationPackage: {
      readyForActivationReview: true,
      productionActivationReady: true,
      readyToSubmitWithCurrentRuntime: true,
      publicRouteAlreadyPublished: false,
      activationPackageHash: FIXTURE_ACTIVATION_PACKAGE_HASH,
      laneActivationRequestHash: `0x${"ad".repeat(32)}`,
      smokeReadiness: {
        present: true,
        ready: true,
        checkedAt: "2026-07-05T00:00:00.000Z",
        failedCheckIds: [],
        failedChecks: [],
        blockerIds: [],
        missingProductionInputIds: [],
        nextActionIds: [],
      },
      blockerIds: [],
      nextActions: [],
    },
  },
  videoArtifacts: [
    { path: "/tmp/sccp-solana-deployment-video.mp4", mediaType: "video/mp4" },
    { path: "/tmp/sccp-solana-deployment-video.vtt", mediaType: "text/vtt" },
  ],
  mediaVerification: {
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
  },
  subtitleCues: deploymentSubtitleCues({ ready }),
});

const liveVideoTranscript = () => ({
  schema: "iroha-demo-sccp-solana-live-video/v1",
  routeId: "taira_sol_xor",
  ready: true,
  preflightReady: true,
  diagnosticVideoOnly: false,
  notLiveTransferEvidence: false,
  authoritativeReadbackVerified: true,
  authoritativeReadback: {
    ready: true,
    readOnly: true,
  },
  successEvidencePolicy: {
    schema: "iroha-demo-sccp-solana-live-video-success-policy/v1",
    mode: "canonical-fresh-read-only-v1",
    ready: true,
    diagnosticOnly: false,
    readOnly: true,
    freshPreflightCompleted: true,
    freshProductionGateCompleted: true,
    nativeNetworkClientsUsed: true,
    canonicalTairaValidatorRoot: true,
    canonicalSolanaTestnetRpc: true,
    governancePinReady: true,
    preflightReportOverride: false,
    skipSolanaRpc: false,
    prerequisiteReportOverrideIds: [],
    problems: [],
    preflight: {
      freshlyComputed: true,
      suppliedReportUsed: false,
      skipSolanaRpc: false,
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
    },
    productionGate: {
      freshlyComputed: true,
      suppliedReportUsed: false,
      ready: false,
      failedCheckIds: ["live-bidirectional-video"],
    },
    activationPackageHash: FIXTURE_ACTIVATION_PACKAGE_HASH,
    operatorHandoffHash: FIXTURE_OPERATOR_HANDOFF_HASH,
  },
  liveEvidence: {
    activationPackageHash: FIXTURE_ACTIVATION_PACKAGE_HASH,
    operatorHandoffHash: FIXTURE_OPERATOR_HANDOFF_HASH,
    tairaToSolana: {
      messageId: FIXTURE_LIVE_FORWARD_MESSAGE_ID,
      tairaSourceTx: FIXTURE_LIVE_TAIRA_SOURCE_TX,
      solanaTxId: FIXTURE_LIVE_SOLANA_FINALIZE_TX,
    },
    solanaToTaira: {
      solanaSourceTx: FIXTURE_LIVE_SOLANA_SOURCE_TX,
      tairaSettlementTx: FIXTURE_LIVE_TAIRA_SETTLEMENT_TX,
    },
  },
  videoArtifacts: [
    { path: "/tmp/sccp-solana-live-video.mp4", mediaType: "video/mp4" },
    { path: "/tmp/sccp-solana-live-video.vtt", mediaType: "text/vtt" },
  ],
  mediaVerification: {
    ready: true,
    durationSeconds: 25,
    streams: {
      video: { present: true, codec: "h264", width: 1280, height: 720 },
      audio: { present: true, codec: "aac" },
      subtitle: { present: true, codec: "mov_text" },
    },
    subtitleCueCount: 5,
    numberedStepCount: 5,
    blockers: [],
  },
  subtitleCues: liveSubtitleCues(),
});

const liveSubtitleCues = () =>
  [
    "Step 1: Public TAIRA published a production-ready taira_sol_xor manifest and the route preflight passed.",
    `Step 2: The TAIRA wallet submitted source transaction ${FIXTURE_LIVE_TAIRA_SOURCE_TX} and burn-record SCCP message ${FIXTURE_LIVE_FORWARD_MESSAGE_ID}.`,
    `Step 3: The connected Solana wallet approved finalize on testnet transaction ${FIXTURE_LIVE_SOLANA_FINALIZE_TX}.`,
    `Step 4: The Solana wallet submitted the return burn transaction ${FIXTURE_LIVE_SOLANA_SOURCE_TX}.`,
    `Step 5: TAIRA accepted the bound Solana source proof in settlement transaction ${FIXTURE_LIVE_TAIRA_SETTLEMENT_TX}.`,
  ].map((text, index) => ({
    index: index + 1,
    start: "00:00.000",
    end: "00:01.000",
    text,
    step: index + 1,
  }));

const blockedLiveSubtitleCues = () =>
  [
    "Step 1: Solana SCCP live video blocked before recording.",
    "Step 2: TAIRA preflight did not prove a production-ready taira_sol_xor Solana testnet route.",
    "Step 3: This MP4 is a blocked diagnostic only and is not live transfer evidence.",
    "Step 4: Live Solana handoff verification passed 11 checks.",
    `Step 5: Proof-material bundle is hash-indexed with 18 files; ${`0x${"33".repeat(32)}`}.`,
    "Step 6: Production requirements still block: destination-proof-admission.",
    "Step 7: Route publish readiness still blocks: route-manager-authority, runtime-signing-key.",
    "Step 8: Route-publication request is missing or not ready for route-manager review.",
    "Step 9: Solana app smoke-readiness still blocks: route-preflight, walletconnect-project-id, destination-prover-module-url, source-prover-module-url. Runbook self-check passed.",
    `Step 10: TAIRA activation package is not submit-ready; ${FIXTURE_ACTIVATION_PACKAGE_HASH}.`,
    "Step 11: Deployment walkthrough MP4 evidence is present.",
    "Step 12: Operator handoff is not publish-ready; lane activation production ready is false, smoke readiness is false.",
    "Step 13: Solana production gate still fails: public-preflight-ready, live-bidirectional-video.",
    "Step 14: Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.",
  ].map((text, index) => ({
    index: index + 1,
    start: "00:00.000",
    end: "00:01.000",
    text,
    step: index + 1,
  }));

const readyPreflightReport = () => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  checkedAt: "2026-07-05T00:00:00.000Z",
  ready: true,
  manifestSource: "public",
  taira: {
    toriiUrl: "https://taira-validator-1.sora.org",
    chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
    networkPrefix: 369,
  },
  solana: {
    rpcUrl: "https://api.testnet.solana.com",
    network: "solana-testnet",
    caipChainId: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
  },
  publicSolanaLane: {
    chain: "sol",
    counterpartyDomain: 3,
    productionReady: true,
    disabledReason: null,
  },
  deployment: {
    bridgeProgramAddress: FIXTURE_BRIDGE_PROGRAM_ID,
    sourceBridgeProgramAddress: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
    verifierProgramAddress: FIXTURE_VERIFIER_PROGRAM_ID,
    nativeVerifierProgramAddress: FIXTURE_NATIVE_VERIFIER_PROGRAM_ID,
  },
  checks: [
    { id: "sccp-capabilities-load", status: "pass", detail: "ok" },
    { id: "sccp-submit-capabilities", status: "pass", detail: "ok" },
    { id: "sccp-manifest-load", status: "pass", detail: "ok" },
    { id: "solana-capability-publication", status: "pass", detail: "ok" },
    { id: "public-route-publication", status: "pass", detail: "ok" },
    {
      id: "solana-lane-publication",
      status: "pass",
      detail: "Public TAIRA Solana SCCP lane manifest is production-ready.",
      evidence: {
        chain: "sol",
        counterpartyDomain: 3,
        productionReady: true,
        blockerIds: [],
      },
    },
    {
      id: "solana-route-instance-publication",
      status: "pass",
      detail: "Public TAIRA taira_sol_xor Solana route instance is published.",
    },
    { id: "route-manifest-shape", status: "pass", detail: "ok" },
    { id: "production-ready-flag", status: "pass", detail: "ok" },
    {
      id: "browser-proof-modules",
      status: "pass",
      detail: "ok",
      evidence: {
        destinationModuleUrl:
          "/sccp-solana/taira-solana-xor-destination-prover.js",
        destinationModuleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
        sourceModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        sourceModuleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
      },
    },
    {
      id: "solana-live-programdata-evidence",
      status: "pass",
      detail: "ok",
      evidence: {
        verifier: {
          role: "verifier",
          programAddress: FIXTURE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS,
          immutable: true,
          upgradeAuthority: null,
          programdataSlot: FIXTURE_VERIFIER_PROGRAMDATA_SLOT,
          programCodeHash: FIXTURE_VERIFIER_CODE_HASH,
          programdataMetadataHash: `0x${"79".repeat(32)}`,
          executableLength: 4096,
          programContextSlot: 419893900,
          programdataContextSlot: 419893900,
        },
        nativeVerifier: {
          role: "nativeVerifier",
          programAddress: FIXTURE_NATIVE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_NATIVE_VERIFIER_PROGRAMDATA_ADDRESS,
          immutable: true,
          upgradeAuthority: null,
          programdataSlot: "419893808",
          programCodeHash: `0x${"7a".repeat(32)}`,
          programdataMetadataHash: `0x${"7b".repeat(32)}`,
          executableLength: 4096,
          programContextSlot: 419893900,
          programdataContextSlot: 419893900,
        },
      },
    },
    {
      id: "solana-live-bridge-source-evidence",
      status: "pass",
      detail: "ok",
      evidence: {
        bridge: {
          role: "bridge",
          programAddress: FIXTURE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_BRIDGE_PROGRAMDATA_ADDRESS,
          immutable: true,
          upgradeAuthority: null,
          programdataSlot: "419893806",
          programCodeHash: `0x${"81".repeat(32)}`,
          programdataMetadataHash: `0x${"82".repeat(32)}`,
          executableLength: 4096,
          programContextSlot: 419893900,
          programdataContextSlot: 419893900,
        },
        sourceBridge: {
          role: "sourceBridge",
          programAddress: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
          immutable: true,
          upgradeAuthority: null,
          programdataSlot: "419893807",
          programCodeHash: `0x${"83".repeat(32)}`,
          programdataMetadataHash: `0x${"84".repeat(32)}`,
          executableLength: 4096,
          programContextSlot: 419893900,
          programdataContextSlot: 419893900,
        },
      },
    },
  ],
});

const readyRequirementsReport = () => ({
  schema: "iroha-demo-sccp-solana-production-requirements/v1",
  routeId: "taira_sol_xor",
  readyToBuildIsi: true,
  readyToSubmitWithCurrentRuntime: false,
  blockers: [],
  solanaDeployment: {
    observedPostDeployEvidence: {
      path: "/tmp/taira-solana-xor-post-deploy-evidence.json",
      liveReadbackReady: true,
      readyForProductionPostDeploy: true,
      liveReadbackBlockers: [],
      productionBlockers: [],
      observedSourceBridgeConfigHash: `0x${"66".repeat(32)}`,
      observedSourceStateTotalBurned: "1",
      observedSourceStateLastBurnHash: `0x${"77".repeat(32)}`,
    },
    observedProverReadiness: {
      path: "/tmp/taira-solana-xor-prover-readiness.json",
      readyForProductionProofs: true,
      entries: [
        {
          direction: "destination",
          ready: true,
          moduleHashMatchesManifest: true,
          exportsOk: true,
          reason: null,
        },
        {
          direction: "source",
          ready: true,
          moduleHashMatchesManifest: true,
          exportsOk: true,
          reason: null,
        },
      ],
      blockers: [],
    },
    observedProductionMaterialInventory: {
      path: "/tmp/taira-solana-xor-production-material-inventory.json",
      ready: true,
      readyMaterial: {
        browserProvers: true,
        destinationProofAdmission: true,
      },
      missingProductionArtifactIds: [],
      roots: ["/tmp/solana-material"],
      materialRoots: {
        expectedGroups: [
          {
            id: "sibling-solana-governed-material",
            ready: true,
            paths: [
              {
                path: "/tmp/solana-material",
                status: "present",
                candidateCount: 3,
                readyCandidateCount: 3,
              },
            ],
          },
        ],
      },
      scanned: {
        fileCount: 2,
        skipped: [],
      },
      blockers: [],
    },
  },
  requirements: {
    destinationProofAdmission: [
      { key: "admissionMode", status: "present" },
      { key: "proofSystem", status: "present" },
      { key: "entrypoint", status: "present" },
      { key: "verifierCodeHash", status: "present" },
      { key: "verifierKeyHash", status: "present" },
      { key: "destinationBindingHash", status: "present" },
      { key: "shapeOnly", status: "present", value: false },
      { key: "acceptsUnverifiedProofs", status: "present", value: false },
    ],
  },
});

const readyPostDeployEvidenceReport = () => ({
  schema: "iroha-demo-sccp-solana-post-deploy-evidence/v1",
  liveReadbackReady: true,
  readyForProductionPostDeploy: true,
  liveReadbackBlockers: [],
  blockers: [],
  observedSourceBridgeConfigHash: `0x${"66".repeat(32)}`,
  observedSourceState: {
    totalBurned: "1",
    lastBurnHash: `0x${"77".repeat(32)}`,
  },
});

const readyProverReadinessReport = () => ({
  schema: "iroha-demo-sccp-solana-prover-readiness/v1",
  readyForProductionProofs: true,
  entries: [
    {
      direction: "destination",
      ready: true,
      moduleHashMatchesManifest: true,
      exportsOk: true,
      reason: null,
    },
    {
      direction: "source",
      ready: true,
      moduleHashMatchesManifest: true,
      exportsOk: true,
      reason: null,
    },
  ],
  blockers: [],
});

const readyProductionMaterialInventoryReport = () => ({
  schema: "iroha-demo-sccp-solana-production-material-inventory/v1",
  ready: true,
  governanceApproval: {
    ready: true,
    approvalSha256: `0x${"aa".repeat(32)}`,
    expectedApprovalSha256: `0x${"aa".repeat(32)}`,
  },
  governanceProgramRolePins: {
    schema: "iroha-demo-sccp-solana-governance-program-role-pins/v1",
    ready: true,
    independentApprovalReady: true,
    approvalSha256: `0x${"aa".repeat(32)}`,
    expectedApprovalSha256: `0x${"aa".repeat(32)}`,
    statuses: [{ key: "all", status: "present" }],
    roles: {
      outerVerifier: {
        approved: {
          programId: FIXTURE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS,
          programdataSlot: FIXTURE_VERIFIER_PROGRAMDATA_SLOT,
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: FIXTURE_VERIFIER_CODE_HASH,
        },
        selected: {
          programId: FIXTURE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS,
          programdataSlot: FIXTURE_VERIFIER_PROGRAMDATA_SLOT,
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: FIXTURE_VERIFIER_CODE_HASH,
        },
      },
      destinationBridge: {
        approved: {
          programId: FIXTURE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_BRIDGE_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893806",
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: `0x${"81".repeat(32)}`,
        },
        selected: {
          programId: FIXTURE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_BRIDGE_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893806",
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: `0x${"81".repeat(32)}`,
        },
      },
      sourceBridge: {
        approved: {
          programId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893807",
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: `0x${"83".repeat(32)}`,
        },
        selected: {
          programId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
          programdataAddress: FIXTURE_SOURCE_BRIDGE_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893807",
          artifactSha256: `0x${"90".repeat(32)}`,
          codeHash: `0x${"83".repeat(32)}`,
        },
      },
      nativeVerifier: {
        approved: {
          programId: FIXTURE_NATIVE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_NATIVE_VERIFIER_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893808",
          artifactSha256: `0x${"91".repeat(32)}`,
          codeHash: `0x${"7a".repeat(32)}`,
        },
        selected: {
          programId: FIXTURE_NATIVE_VERIFIER_PROGRAM_ID,
          programdataAddress: FIXTURE_NATIVE_VERIFIER_PROGRAMDATA_ADDRESS,
          programdataSlot: "419893808",
          artifactSha256: `0x${"91".repeat(32)}`,
          codeHash: `0x${"7a".repeat(32)}`,
        },
      },
    },
  },
  readyMaterial: {
    browserProvers: true,
    destinationProofAdmission: true,
  },
  missingProductionArtifactIds: [],
  roots: ["/tmp/solana-material"],
  materialRoots: {
    expectedGroups: [
      {
        id: "sibling-solana-governed-material",
        ready: true,
        paths: [
          {
            path: "/tmp/solana-material",
            status: "present",
            candidateCount: 3,
            readyCandidateCount: 3,
          },
        ],
      },
    ],
  },
  scanned: {
    fileCount: 2,
    skipped: [],
  },
  blockers: [],
});

const readyPublishReadinessReport = () => ({
  schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
  routeId: "taira_sol_xor",
  readyForRuntimeSigner: true,
  readyToSubmitWithCurrentRuntime: true,
  publicEndpoint: {
    toriiUrl: "https://taira-validator-1.sora.org",
    mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
    publicationTargetReady: true,
    directPublicNodePublicationReady: true,
    target: {
      toriiUrl: "https://taira-validator-1.sora.org",
      mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      targetKind: "explicit-taira-public-node",
      canonicalPublicNodeRoot: true,
      canonicalRolloutTargetReady: true,
      mcpMatchesToriiRoot: true,
    },
    endpointReady: true,
    mcpTransactionTools: {
      ready: true,
      publicationMode: "signed-transaction-body-base64",
    },
  },
  routeManifestIsi: {
    ready: true,
    manifestSha256: sha256ForJson(readyRouteManifestReport()),
    instructionManifestSha256: `0x${"44".repeat(32)}`,
    error: null,
  },
  runtimeSigning: {
    authority: ROUTE_MANAGER_AUTHORITY,
    authorityReady: true,
    authorityFormatReady: true,
    requiredPermission: "CanManageSccpRouteManifests",
    privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    privateKeyEnvPresent: true,
    privateKeyStoredInReport: false,
  },
  blockers: [],
});

const readySmokeReadinessReport = () => ({
  schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
  routeId: "taira_sol_xor",
  checkedAt: "2026-07-05T00:00:00.000Z",
  ready: true,
  checks: [
    {
      id: "route-preflight",
      status: "pass",
      detail: "ok",
      evidence: {
        checkedAt: "2026-07-05T00:00:00.000Z",
        ready: true,
        routeId: "taira_sol_xor",
        assetKey: "xor",
        manifestSource: "public",
        solana: {
          network: "solana-testnet",
          caipChainId: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
        },
        failedChecks: [],
        browserProofModules: {
          destinationModuleUrl:
            "/sccp-solana/taira-solana-xor-destination-prover.js",
          destinationModuleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
          sourceModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
          sourceModuleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
        },
      },
    },
    { id: "walletconnect-project-id", status: "pass", detail: "ok" },
    {
      id: "destination-prover-module-url",
      status: "pass",
      detail: "ok",
      evidence: {
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        inspection: {
          moduleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
          sidecarUrl:
            "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
          sidecarHash: FIXTURE_DESTINATION_PROVER_SIDECAR_HASH,
        },
      },
    },
    {
      id: "source-prover-module-url",
      status: "pass",
      detail: "ok",
      evidence: {
        moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        inspection: {
          moduleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
          sidecarUrl:
            "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
          sidecarHash: FIXTURE_SOURCE_PROVER_SIDECAR_HASH,
        },
      },
    },
    {
      id: "smoke-readiness-runbook-contract",
      status: "pass",
      detail: "ok",
    },
  ],
  blockerIds: [],
  nextActions: [],
  missingProductionInputs: [],
});

const readySourceMaterialHandoffObservedPins = () => ({
  verifierProgramId: FIXTURE_VERIFIER_PROGRAM_ID,
  verifierCodeHash: FIXTURE_VERIFIER_CODE_HASH,
  programdataAddress: FIXTURE_VERIFIER_PROGRAMDATA_ADDRESS,
  programdataSlot: FIXTURE_VERIFIER_PROGRAMDATA_SLOT,
  destinationBindingHash: FIXTURE_DESTINATION_BINDING_HASH,
  tokenMintAddress: FIXTURE_TOKEN_MINT_ADDRESS,
  bridgeProgramId: FIXTURE_BRIDGE_PROGRAM_ID,
  sourceBridgeProgramId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
  verifierStateAddress: FIXTURE_VERIFIER_STATE_ADDRESS,
  sourceStateAddress: FIXTURE_SOURCE_STATE_ADDRESS,
  sourceBridgeConfigHash: FIXTURE_SOURCE_BRIDGE_CONFIG_HASH,
  routeCanaryEvidenceHash: FIXTURE_ROUTE_CANARY_EVIDENCE_HASH,
  routeCanarySignature: FIXTURE_ROUTE_CANARY_SIGNATURE,
  sourceBurnSignature: FIXTURE_SOURCE_BURN_SIGNATURE,
  sourceBurnHash: FIXTURE_SOURCE_BURN_HASH,
  sourceBurnAmountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
  sourceBurnTairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
  sourceBurnProofRequestReady: true,
  sourceBurnCanonicalTransferReady: true,
  sourceBurnMessageId: FIXTURE_SOURCE_BURN_MESSAGE_ID,
  sourceBurnCommitmentRoot: FIXTURE_SOURCE_BURN_COMMITMENT_ROOT,
  sourceBurnPayloadHash: FIXTURE_SOURCE_BURN_PAYLOAD_HASH,
});

const readySourceMaterialHandoffReport = () => ({
  schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
  routeId: "taira_sol_xor",
  readyForProofMaterialCeremony: true,
  productionProofMaterialIncluded: false,
  observedPins: readySourceMaterialHandoffObservedPins(),
  blockers: [],
});

const readyHandoffVerificationReport = () => ({
  schema: "iroha-demo-sccp-solana-source-material-handoff-verification/v1",
  routeId: "taira_sol_xor",
  ready: true,
  productionProofMaterialIncluded: false,
  statuses: [
    {
      id: "handoff-schema",
      status: "pass",
      expected: "iroha-demo-sccp-solana-source-material-handoff/v1",
      observed: "iroha-demo-sccp-solana-source-material-handoff/v1",
    },
    {
      id: "handoff-ready-for-proof-material-ceremony",
      status: "pass",
      expected: {
        requiredPins: [
          "verifierProgramId",
          "verifierCodeHash",
          "programdataAddress",
          "programdataSlot",
          "destinationBindingHash",
          "tokenMintAddress",
          "bridgeProgramId",
          "sourceBridgeProgramId",
          "verifierStateAddress",
          "sourceStateAddress",
          "sourceBridgeConfigHash",
          "routeCanaryEvidenceHash",
        ],
        missingPins: [],
      },
      observed: {
        requiredPins: [
          "verifierProgramId",
          "verifierCodeHash",
          "programdataAddress",
          "programdataSlot",
          "destinationBindingHash",
          "tokenMintAddress",
          "bridgeProgramId",
          "sourceBridgeProgramId",
          "verifierStateAddress",
          "sourceStateAddress",
          "sourceBridgeConfigHash",
          "routeCanaryEvidenceHash",
        ],
        missingPins: [],
      },
    },
    {
      id: "handoff-not-production-proof-material",
      status: "pass",
      expected: false,
      observed: false,
    },
    {
      id: "verifier-program-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().verifierProgramId,
    },
    {
      id: "bridge-program-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().bridgeProgramId,
    },
    {
      id: "source-bridge-program-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().sourceBridgeProgramId,
    },
    {
      id: "token-mint-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().tokenMintAddress,
    },
    {
      id: "verifier-state-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().verifierStateAddress,
    },
    {
      id: "source-state-account",
      status: "pass",
      expected: readySourceMaterialHandoffObservedPins().sourceStateAddress,
    },
    {
      id: "route-canary-signature-finalized",
      status: "pass",
      expected: {
        signature:
          readySourceMaterialHandoffObservedPins().routeCanarySignature,
      },
    },
    {
      id: "source-burn-signature-finalized",
      status: "pass",
      expected: {
        signature: readySourceMaterialHandoffObservedPins().sourceBurnSignature,
      },
    },
  ],
  observedPins: readySourceMaterialHandoffObservedPins(),
  blockers: [],
});

const readySourceBurnReadinessReport = () => ({
  schema: "iroha-demo-sccp-solana-source-burn-readiness/v1",
  readyToSubmitBurn: true,
  routeId: "taira_sol_xor",
  assetKey: "xor",
  ownerAddress: FIXTURE_SOURCE_BURN_OWNER,
  amountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
  tairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
  nonce: FIXTURE_SOURCE_BURN_NONCE,
  deployment: {
    sourceBridgeProgramId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
    sourceStateAddress: FIXTURE_SOURCE_STATE_ADDRESS,
    tokenMintAddress: FIXTURE_TOKEN_MINT_ADDRESS,
  },
  selectedSourceToken: {
    address: FIXTURE_SOURCE_BURN_TOKEN,
    owner: FIXTURE_SOURCE_BURN_OWNER,
    mint: FIXTURE_TOKEN_MINT_ADDRESS,
    amount: FIXTURE_SOURCE_BURN_AMOUNT,
  },
  blockers: [],
});

const readySourceBurnSubmissionReport = () => ({
  schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
  submitted: true,
  signature: FIXTURE_SOURCE_BURN_SIGNATURE,
  ownerAddress: FIXTURE_SOURCE_BURN_OWNER,
  sourceTokenAddress: FIXTURE_SOURCE_BURN_TOKEN,
  amountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
  tairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
  nonce: FIXTURE_SOURCE_BURN_NONCE,
  productionProof: false,
  sourceProofRequestReady: true,
  sourceProofRequest: {
    schema: "iroha-demo-sccp-solana-source-burn-proof-request/v1",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    readyForSourceProof: true,
    canonicalTransferReady: true,
    productionProof: false,
    proofPackageIncluded: false,
    sourceBurn: {
      signature: FIXTURE_SOURCE_BURN_SIGNATURE,
      ownerAddress: FIXTURE_SOURCE_BURN_OWNER,
      sourceTokenAddress: FIXTURE_SOURCE_BURN_TOKEN,
      tokenMintAddress: FIXTURE_TOKEN_MINT_ADDRESS,
      sourceBridgeProgramId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
      sourceStateAddress: FIXTURE_SOURCE_STATE_ADDRESS,
      amountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
      tairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
      nonce: FIXTURE_SOURCE_BURN_NONCE,
      sourceBurnHash: `0x${"15".repeat(32)}`,
    },
    canonical: {
      messageId: `0x${"12".repeat(32)}`,
      commitmentRoot: `0x${"13".repeat(32)}`,
      payloadHash: `0x${"14".repeat(32)}`,
      transferPayload: {
        route_id: "taira_sol_xor",
        asset_id: "xor",
        sender: FIXTURE_SOURCE_BURN_OWNER,
        recipient: FIXTURE_SOURCE_BURN_RECIPIENT,
        amount: FIXTURE_SOURCE_BURN_AMOUNT,
        nonce: FIXTURE_SOURCE_BURN_NONCE,
      },
      messageBundle: {
        version: 1,
        commitmentRoot: `0x${"13".repeat(32)}`,
        finalityProof: null,
      },
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_sol_xor",
        asset: "xor",
      },
      publicInputs: {
        routeId: "taira_sol_xor",
        asset: "xor",
        txId: FIXTURE_SOURCE_BURN_SIGNATURE,
        solanaSender: FIXTURE_SOURCE_BURN_OWNER,
        tairaRecipient: FIXTURE_SOURCE_BURN_RECIPIENT,
        amountBaseUnits: FIXTURE_SOURCE_BURN_AMOUNT,
        messageId: `0x${"12".repeat(32)}`,
        commitmentRoot: `0x${"13".repeat(32)}`,
      },
    },
    blockers: [],
  },
});

const sourceBurnBlockedByZeroSupplyBlockers = () => [
  {
    id: "token-mint-supply",
    detail:
      "The Solana SPL TairaXOR mint supply is zero; no real bridged balance can be burned.",
  },
  {
    id: "source-token-balance",
    detail: "No selected SPL TairaXOR token account has at least 1 base units.",
  },
];

const blockedPreBurnReadinessReport = () => {
  const report = readySourceBurnReadinessReport();
  report.readyToSubmitBurn = false;
  report.selectedSourceToken = null;
  report.blockers = sourceBurnBlockedByZeroSupplyBlockers();
  return report;
};

const blockedPreBurnSubmissionReport = () => {
  const readiness = blockedPreBurnReadinessReport();
  return {
    schema: "iroha-demo-sccp-solana-source-burn-submission/v1",
    submitted: false,
    reason: "source-burn-readiness-failed",
    readinessPath:
      "output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json",
    ownerAddress: readiness.ownerAddress,
    sourceTokenAddress: null,
    tokenMintAddress: readiness.deployment.tokenMintAddress,
    sourceBridgeProgramId: readiness.deployment.sourceBridgeProgramId,
    sourceStateAddress: readiness.deployment.sourceStateAddress,
    amountBaseUnits: readiness.amountBaseUnits,
    tairaRecipient: readiness.tairaRecipient,
    nonce: readiness.nonce,
    selectedSourceToken: null,
    sourceProofRequestReady: false,
    sourceProofRequest: null,
    preBurnReadiness: readiness,
    blockers: sourceBurnBlockedByZeroSupplyBlockers(),
  };
};

const readyProofMaterialBrowserProverModules = () => [
  {
    direction: "destination",
    moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    sidecarUrl: "/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
    expectedModuleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
    actualModuleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
    proveExport: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
    exportsReady: true,
    selfTestReady: true,
    sidecarReady: true,
    moduleHashMatchesManifest: true,
    productionProofsReady: true,
    blockerIds: [],
  },
  {
    direction: "source",
    moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
    sidecarUrl: "/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
    expectedModuleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
    actualModuleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
    proveExport: "proveSolanaSccpSource",
    selfTestExport: "solanaSccpSourceProverSelfTest",
    exportsReady: true,
    selfTestReady: true,
    sidecarReady: true,
    moduleHashMatchesManifest: true,
    productionProofsReady: true,
    blockerIds: [],
  },
];

const readyProofMaterialRequestReport = () => ({
  schema: "iroha-demo-sccp-solana-proof-material-request/v1",
  routeId: "taira_sol_xor",
  readyForProofMaterialCeremony: true,
  productionRouteReady: false,
  readyToSubmitWithCurrentRuntime: false,
  publicRouteAlreadyPublished: false,
  productionProofMaterialIncluded: false,
  observedPins: {
    sourceBurnMessageId: `0x${"12".repeat(32)}`,
  },
  requiredProofMaterial: {
    browserProverModules: readyProofMaterialBrowserProverModules(),
  },
  blockers: [{ id: "production-requirements" }, { id: "publish-readiness" }],
});

const readyProofMaterialBundleReport = () => ({
  schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
  routeId: "taira_sol_xor",
  readyForProofMaterialCeremony: true,
  productionRouteReady: false,
  readyToSubmitWithCurrentRuntime: false,
  productionProofMaterialIncluded: false,
  bundleManifestSha256: `0x${"33".repeat(32)}`,
  includedArtifactCount: 4,
  artifacts: [
    {
      id: "source-material-handoff",
      status: "included",
      required: true,
      sha256: `0x${"44".repeat(32)}`,
    },
    {
      id: "source-material-handoff-verification",
      status: "included",
      required: true,
      sha256: `0x${"55".repeat(32)}`,
    },
    {
      id: "destination-prover-sidecar",
      status: "included",
      required: true,
      sha256: FIXTURE_DESTINATION_PROVER_SIDECAR_HASH,
    },
    {
      id: "source-prover-sidecar",
      status: "included",
      required: true,
      sha256: FIXTURE_SOURCE_PROVER_SIDECAR_HASH,
    },
  ],
  blockers: [],
  upstreamBlockerIds: ["production-requirements", "publish-readiness"],
  proofMaterialRequest: {
    schema: "iroha-demo-sccp-solana-proof-material-request/v1",
    readyForProofMaterialCeremony: true,
    productionRouteReady: false,
    readyToSubmitWithCurrentRuntime: false,
    publicRouteAlreadyPublished: false,
    productionProofMaterialIncluded: false,
    observedPins: {
      sourceBurnMessageId: `0x${"12".repeat(32)}`,
    },
    browserProverModules: readyProofMaterialBrowserProverModules(),
    blockerIds: ["production-requirements", "publish-readiness"],
  },
});

const readyProofMaterialCeremonyPackageReport = () => ({
  schema: "iroha-demo-sccp-solana-proof-material-ceremony-package/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  readyForCeremonyReview: true,
  readyForProofMaterialCeremony: true,
  productionRouteReady: false,
  readyToSubmitWithCurrentRuntime: false,
  productionProofMaterialIncluded: false,
  ceremonyPackageHash: `0x${"34".repeat(32)}`,
  stableHash: `0x${"34".repeat(32)}`,
  sourceBurnProofRequest: {
    readyForSourceProof: true,
    canonicalTransferReady: true,
    productionProof: false,
    proofPackageIncluded: false,
    messageId: `0x${"12".repeat(32)}`,
    commitmentRoot: `0x${"13".repeat(32)}`,
    payloadHash: `0x${"14".repeat(32)}`,
  },
  artifacts: {
    sourceMaterialHandoff: {
      present: true,
      ready: true,
      productionReady: false,
      schema: "iroha-demo-sccp-solana-source-material-handoff/v1",
      stableHash: reviewSha256ForJson(readySourceMaterialHandoffReport()),
      blockerIds: [],
    },
    sourceMaterialHandoffVerification: {
      present: true,
      ready: true,
      productionReady: false,
      schema: "iroha-demo-sccp-solana-source-material-handoff-verification/v1",
      stableHash: reviewSha256ForJson(readyHandoffVerificationReport()),
      blockerIds: [],
    },
    proofMaterialBundle: {
      present: true,
      ready: true,
      stableHash: `0x${"33".repeat(32)}`,
      blockerIds: ["production-requirements"],
    },
    sourceBurnSubmission: {
      present: true,
      ready: true,
      stableHash: `0x${"12".repeat(32)}`,
      blockerIds: [],
    },
  },
  reviewBlockers: [],
  productionBlockers: [{ id: "production-requirements" }],
  blockers: [{ id: "production-requirements" }],
});

const readyRouteManifestReport = () => ({
  schema: "iroha-sccp-taira-solana-xor-route-manifest/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  productionReady: true,
  counterpartyDomain: 3,
  solanaNetwork: "testnet",
  destination: {
    verifierProgramId: FIXTURE_VERIFIER_PROGRAM_ID,
    bridgeProgramId: FIXTURE_BRIDGE_PROGRAM_ID,
    tokenMintAddress: FIXTURE_TOKEN_MINT_ADDRESS,
  },
  source: {
    sourceBridgeProgramId: FIXTURE_SOURCE_BRIDGE_PROGRAM_ID,
    sourceStateAddress: FIXTURE_SOURCE_STATE_ADDRESS,
  },
  proofMaterial: {
    destinationProverModuleHash: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
    sourceProverModuleHash: FIXTURE_SOURCE_PROVER_MODULE_HASH,
  },
});

const readyRoutePublicationRequestReport = () => ({
  schema: "iroha-demo-sccp-solana-route-publication-request/v1",
  routeId: "taira_sol_xor",
  readyForRouteManagerReview: true,
  productionRouteReady: false,
  readyToSubmitWithCurrentRuntime: false,
  publicRouteAlreadyPublished: false,
  reviewPackageHash: `0x${"88".repeat(32)}`,
  manifest: {
    present: true,
    routeId: "taira_sol_xor",
    assetKey: "xor",
    routeIdentityReady: true,
    productionReadyForIsi: true,
    manifestSha256: sha256ForJson(readyRouteManifestReport()),
  },
  proofMaterialBundle: {
    readyForProofMaterialCeremony: true,
    bundleManifestSha256: `0x${"33".repeat(32)}`,
    includedArtifactCount: 16,
  },
  publishReadiness: {
    readyForRuntimeSigner: true,
    readyToSubmitWithCurrentRuntime: true,
    publicEndpoint: {
      endpointReady: true,
      mcpTransactionTools: {
        ready: true,
        publicationMode: "signed-transaction-body-base64",
      },
    },
    routeManifestIsi: {
      ready: true,
      manifestSha256: sha256ForJson(readyRouteManifestReport()),
      instructionManifestSha256: `0x${"44".repeat(32)}`,
      error: null,
    },
    runtimeSigning: {
      authority: ROUTE_MANAGER_AUTHORITY,
      authorityReady: true,
      authorityFormatReady: true,
      requiredPermission: "CanManageSccpRouteManifests",
      privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
      privateKeyEnvPresent: true,
      privateKeyStoredInReport: false,
    },
    blockerIds: [],
  },
  blockers: [{ id: "production-requirements" }],
  upstreamBlockerIds: ["production-requirements", "publish-readiness"],
});

const publishReadinessBlockerIds = (publishReadiness) =>
  [
    ...new Set([
      ...(publishReadiness.blockers ?? []).map((blocker) =>
        typeof blocker === "string" ? blocker : blocker.id,
      ),
      ...(publishReadiness.blockerIds ?? []),
    ]),
  ]
    .filter(Boolean)
    .sort();

const matchingRoutePublishBlockedReport = ({
  publishReadiness = readyPublishReadinessReport(),
  requirements = readyRequirementsReport(),
  stage = "publish-readiness",
} = {}) => {
  const blockerIds = publishReadinessBlockerIds(publishReadiness);
  return {
    schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
    ready: false,
    routeId: "taira_sol_xor",
    assetKey: "xor",
    requiredPermission: "CanManageSccpRouteManifests",
    stage,
    error:
      stage === "route-manifest-isi"
        ? publishReadiness.routeManifestIsi?.error
        : `Solana route publish readiness failed: ${blockerIds.join(", ")}`,
    routeManifest: "/tmp/taira-solana-xor-route.manifest.json",
    routePublishReadinessPath:
      "/tmp/taira-solana-xor-route.publish-readiness.json",
    blockerIds,
    publicEndpoint: publishReadiness.publicEndpoint,
    routeManifestIsi: publishReadiness.routeManifestIsi,
    runtimeSigning: publishReadiness.runtimeSigning,
    productionRequirements: {
      path: "/tmp/taira-solana-xor-production-requirements.json",
      readyToBuildIsi: requirements.readyToBuildIsi === true,
      blockerIds: (requirements.blockers ?? [])
        .map((blocker) => (typeof blocker === "string" ? blocker : blocker.id))
        .filter(Boolean)
        .sort(),
    },
  };
};

const readyRouteManagerAccessReport = () => ({
  schema: "iroha-demo-sccp-solana-route-manager-access-request/v1",
  routeId: "taira_sol_xor",
  readyForOperatorReview: true,
  accessReady: true,
  productionRouteReady: true,
  readyToSubmitWithCurrentRuntime: true,
  requestHash: `0x${"aa".repeat(32)}`,
  routePublicationRequest: {
    readyForRouteManagerReview: true,
    reviewPackageHash: `0x${"88".repeat(32)}`,
  },
  publishReadiness: {
    readyForRuntimeSigner: true,
    readyToSubmitWithCurrentRuntime: true,
    endpointReady: true,
    mcpTransactionToolsReady: true,
    publicationMode: "signed-transaction-body-base64",
    blockerIds: [],
  },
  productionRequirements: {
    blockerIds: [],
  },
  proofMaterialBundle: {
    readyForProofMaterialCeremony: true,
    productionRouteReady: true,
    bundleManifestSha256: `0x${"33".repeat(32)}`,
    upstreamBlockerIds: [],
  },
  requiredRouteManager: {
    authority: ROUTE_MANAGER_AUTHORITY,
    authorityReady: true,
    authorityFormatReady: true,
    requiredPermission: "CanManageSccpRouteManifests",
    hasRequiredPermission: true,
    permissionAudit: {
      checked: true,
      ready: true,
      permissions: ["CanManageSccpRouteManifests"],
      error: null,
    },
  },
  runtimeSigning: {
    privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    privateKeyEnvPresent: true,
    privateKeyStoredInReport: false,
  },
  blockers: [],
});

const readyOperatorHandoffReport = () => ({
  schema: "iroha-demo-sccp-solana-operator-handoff/v1",
  routeId: "taira_sol_xor",
  readyForOperatorReview: true,
  productionRouteReady: true,
  readyToPublish: true,
  publicRouteAlreadyPublished: true,
  handoffHash: FIXTURE_OPERATOR_HANDOFF_HASH,
  artifacts: {
    proofMaterialBundle: {
      readyForProofMaterialCeremony: true,
      stableHash: `0x${"33".repeat(32)}`,
    },
    proofMaterialCeremonyPackage: {
      readyForCeremonyReview: true,
      stableHash: `0x${"34".repeat(32)}`,
    },
    routePublicationRequest: {
      readyForRouteManagerReview: true,
      stableHash: `0x${"88".repeat(32)}`,
    },
    routeManagerAccessRequest: {
      readyForOperatorReview: true,
      accessReady: true,
      stableHash: `0x${"aa".repeat(32)}`,
    },
    laneActivationRequest: {
      readyForLaneGovernanceReview: true,
      publicLaneReady: true,
      productionProofMaterialReady: true,
      productionLaneReady: true,
      stableHash: `0x${"ad".repeat(32)}`,
    },
    smokeReadiness: {
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      failedCheckIds: [],
      missingProductionInputIds: [],
    },
  },
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
  blockers: [],
  nextActions: [],
});

const readyLaneActivationRequestReport = () => ({
  schema: "iroha-demo-sccp-solana-lane-activation-request/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  chain: "sol",
  readyForLaneGovernanceReview: true,
  publicLaneReady: false,
  productionProofMaterialReady: false,
  productionLaneReady: false,
  laneActivationRequestHash: `0x${"ad".repeat(32)}`,
  stableHash: `0x${"ad".repeat(32)}`,
  blockers: [{ id: "public-solana-lane" }, { id: "governed-proof-material" }],
});

const readyActivationPackageReport = () => ({
  schema: "iroha-demo-sccp-solana-activation-package/v1",
  routeId: "taira_sol_xor",
  readyForActivationReview: true,
  productionActivationReady: true,
  readyToSubmitWithCurrentRuntime: true,
  publicRouteAlreadyPublished: false,
  activationPackageHash: `0x${"ac".repeat(32)}`,
  publicTaira: {
    publicSolanaLane: {
      present: true,
      ready: true,
      blockerIds: [],
    },
  },
  artifacts: {
    proofMaterialBundle: {
      ready: true,
      stableHash: `0x${"33".repeat(32)}`,
      blockerIds: [],
    },
    proofMaterialCeremonyPackage: {
      ready: true,
      stableHash: `0x${"34".repeat(32)}`,
      blockerIds: [],
    },
    routePublicationRequest: {
      ready: true,
      stableHash: `0x${"88".repeat(32)}`,
      blockerIds: [],
    },
    routeManagerAccessRequest: {
      ready: true,
      stableHash: `0x${"aa".repeat(32)}`,
      blockerIds: [],
    },
    laneActivationProposal: {
      ready: true,
      stableHash: `0x${"af".repeat(32)}`,
      blockerIds: [],
    },
    laneActivationRequest: {
      ready: true,
      stableHash: `0x${"ad".repeat(32)}`,
      blockerIds: [],
    },
    operatorHandoff: {
      ready: true,
      stableHash: `0x${"ab".repeat(32)}`,
      blockerIds: [],
    },
    smokeReadiness: {
      present: true,
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      failedCheckIds: [],
      missingProductionInputIds: [],
    },
  },
  requiredRouteManager: {
    authority: ROUTE_MANAGER_AUTHORITY,
    authorityReady: true,
    authorityFormatReady: true,
    requiredPermission: "CanManageSccpRouteManifests",
    hasRequiredPermission: true,
  },
  blockers: [],
});

const readyLaneActivationProposalReport = () => ({
  schema: "iroha-demo-sccp-solana-lane-activation-proposal/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  chain: "sol",
  readyForGovernanceReview: true,
  productionLaneReady: false,
  readyToSubmitWithCurrentRuntime: false,
  proposalHash: `0x${"af".repeat(32)}`,
  laneActivationRequest: {
    readyForLaneGovernanceReview: true,
    publicLaneReady: false,
    productionProofMaterialReady: false,
    productionLaneReady: false,
    laneActivationRequestHash: `0x${"ad".repeat(32)}`,
    blockerIds: ["public-solana-lane", "governed-proof-material"],
  },
  proposalDraft: {
    kind: "ActivateSccpLane",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    chain: "sol",
    laneActivationRequestHash: `0x${"ad".repeat(32)}`,
    requiredPolicies: [
      "activate only through TAIRA governance or route-manager authority",
    ],
  },
  reviewBlockers: [],
  productionBlockers: [{ id: "public-solana-lane" }],
  blockers: [{ id: "public-solana-lane" }],
});

const blockedRouteManagerAccessReport = ({
  publishReadinessBlockerIds = [],
  publishReadinessSnapshot = {
    readyForRuntimeSigner: false,
    readyToSubmitWithCurrentRuntime: false,
  },
  productionRequirementBlockerIds = [],
  requiredRouteManagerSnapshot = {},
} = {}) => ({
  ...readyRouteManagerAccessReport(),
  accessReady: false,
  productionRouteReady: false,
  readyToSubmitWithCurrentRuntime: false,
  publishReadiness: {
    ...readyRouteManagerAccessReport().publishReadiness,
    ...publishReadinessSnapshot,
    blockerIds: publishReadinessBlockerIds,
  },
  productionRequirements: {
    ...readyRouteManagerAccessReport().productionRequirements,
    blockerIds: productionRequirementBlockerIds,
  },
  requiredRouteManager: {
    ...readyRouteManagerAccessReport().requiredRouteManager,
    authorityFormatReady: true,
    hasRequiredPermission: false,
    ...requiredRouteManagerSnapshot,
    permissionAudit: {
      checked: true,
      ready: false,
      permissions: [],
      error: null,
    },
  },
  runtimeSigning: {
    privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    privateKeyEnvPresent: false,
    privateKeyStoredInReport: false,
  },
  blockers: [
    { id: "route-manager-permission" },
    { id: "runtime-signing-key" },
    { id: "production-route-material" },
  ],
});

const blockedOperatorHandoffReport = ({
  smokeReadiness = readyOperatorHandoffReport().artifacts.smokeReadiness,
} = {}) => ({
  ...readyOperatorHandoffReport(),
  readyForOperatorReview: false,
  productionRouteReady: false,
  readyToPublish: false,
  publicRouteAlreadyPublished: false,
  requiredRouteManager: {
    ...readyOperatorHandoffReport().requiredRouteManager,
    hasRequiredPermission: false,
  },
  runtimeSigning: {
    privateKeyEnv: "SCCP_TEST_ROUTE_MANAGER_PRIVATE_KEY",
    privateKeyEnvPresent: false,
    privateKeyStoredInReport: false,
  },
  artifacts: {
    ...readyOperatorHandoffReport().artifacts,
    smokeReadiness,
    routeManagerAccessRequest: {
      readyForOperatorReview: false,
      accessReady: false,
      stableHash: `0x${"aa".repeat(32)}`,
    },
  },
  blockers: [
    { id: "route-manager-access-request" },
    { id: "route-manager-permission" },
    { id: "runtime-signing-key" },
  ],
  nextActions: [
    "refresh-route-manager-access-request",
    "grant-taira-route-manager-access",
    "set-runtime-route-manager-private-key",
  ],
});

const blockedSmokeReadinessReport = () => ({
  schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
  routeId: "taira_sol_xor",
  ready: false,
  checks: [
    {
      id: "route-preflight",
      status: "fail",
      detail: "Public TAIRA Solana route preflight is not ready.",
    },
    {
      id: "walletconnect-project-id",
      status: "fail",
      detail:
        "VITE_WALLETCONNECT_PROJECT_ID is required for Solana WalletConnect signing.",
    },
    {
      id: "destination-prover-module-url",
      status: "fail",
      detail:
        "Solana destination prover module URL is using the bundled fail-closed default but not ready: productionProofsReady must be true.",
      evidence: {
        configuredSource: "bundled-default",
      },
    },
    {
      id: "source-prover-module-url",
      status: "fail",
      detail:
        "Solana source prover module URL is using the bundled fail-closed default but not ready: productionProofsReady must be true.",
      evidence: {
        configuredSource: "bundled-default",
      },
    },
  ],
  blockerIds: [
    "route-preflight",
    "walletconnect-project-id",
    "destination-prover-module-url",
    "source-prover-module-url",
  ],
  nextActions: [
    "configure-solana-walletconnect",
    "publish-solana-production-prover-packages",
  ],
  missingProductionInputs: [
    {
      id: "walletconnect-project-id",
      kind: "operator-environment",
      blockedByActions: ["configure-solana-walletconnect"],
    },
    {
      id: "solana-destination-production-prover-package",
      kind: "browser-module-package",
      blockedByActions: ["publish-solana-production-prover-packages"],
    },
    {
      id: "solana-source-production-prover-package",
      kind: "browser-module-package",
      blockedByActions: ["publish-solana-production-prover-packages"],
    },
  ],
});

const failedIds = (report) =>
  report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.id);

describe("Solana SCCP production gate", () => {
  it("hashes one complete canonical pre-live input snapshot and rejects tampering", () => {
    const inputs = Object.fromEntries(
      Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS).map(
        (id) => [
          id,
          {
            id,
            path: path.resolve(`/tmp/solana-pre-live-${id}`),
            present: false,
            size: 0,
            sha256: null,
          },
        ],
      ),
    );
    const snapshot = buildSolanaProductionGatePreLiveInputSnapshot(inputs);
    expect(() =>
      validateSolanaProductionGatePreLiveInputSnapshot(snapshot),
    ).not.toThrow();
    expect(snapshot.preLiveInputSnapshotSha256).toMatch(/^0x[0-9a-f]{64}$/u);

    const tampered = structuredClone(snapshot);
    tampered.inputs.routeManifest.path = path.resolve(
      "/tmp/substituted-route-manifest.json",
    );
    expect(() =>
      validateSolanaProductionGatePreLiveInputSnapshot(tampered),
    ).toThrow(/snapshot hash is invalid/u);
  });

  it("requires a fresh canonical governance-pinned network pass for production success", () => {
    const policy = buildSolanaProductionGateSuccessExecutionPolicy({
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      skipSolanaRpc: false,
      preflightReportOverride: false,
      freshPreflightCompleted: true,
      preflightReport: readyPreflightReport(),
      publishReadinessReport: readyPublishReadinessReport(),
    });

    expect(policy).toMatchObject({
      ready: true,
      freshPreflightCompleted: true,
      preflightEndpointIdentityReady: true,
      canonicalTairaValidatorRoot: true,
      canonicalSolanaTestnetRpc: true,
      governancePinReady: true,
      problems: [],
    });
  });

  it.each([
    {
      name: "coherent forged preflight override",
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      preflightReportOverride: true,
      skipSolanaRpc: false,
      expected: "fresh-public-preflight",
    },
    {
      name: "skipped Solana RPC",
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      preflightReportOverride: false,
      skipSolanaRpc: true,
      expected: "solana-rpc-not-skipped",
    },
    {
      name: "stringly typed RPC skip bypass",
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://api.testnet.solana.com",
      preflightReportOverride: false,
      skipSolanaRpc: "false",
      expected: "solana-rpc-skip-option-invalid",
    },
    {
      name: "loopback TAIRA",
      toriiUrl: "https://localhost",
      solanaRpcUrl: "https://api.testnet.solana.com",
      preflightReportOverride: false,
      skipSolanaRpc: false,
      expected: "canonical-taira-validator-root",
    },
    {
      name: "arbitrary Solana RPC",
      toriiUrl: "https://taira-validator-1.sora.org",
      solanaRpcUrl: "https://rpc.example",
      preflightReportOverride: false,
      skipSolanaRpc: false,
      expected: "canonical-solana-testnet-rpc",
    },
  ])(
    "rejects $name even when every supplied report claims ready",
    (fixture) => {
      const forgedPreflight = readyPreflightReport();
      forgedPreflight.taira.toriiUrl = fixture.toriiUrl;
      forgedPreflight.solana.rpcUrl = fixture.solanaRpcUrl;
      const forgedPublishReadiness = readyPublishReadinessReport();
      forgedPublishReadiness.publicEndpoint.toriiUrl = fixture.toriiUrl;
      forgedPublishReadiness.publicEndpoint.target.toriiUrl = fixture.toriiUrl;
      const policy = buildSolanaProductionGateSuccessExecutionPolicy({
        ...fixture,
        freshPreflightCompleted: true,
        preflightReport: forgedPreflight,
        publishReadinessReport: forgedPublishReadiness,
      });

      expect(policy.ready).toBe(false);
      expect(policy.problems.map((problem) => problem.id)).toContain(
        fixture.expected,
      );
    },
  );

  it("uses an output directory containing Solana deployment artifacts as the default artifact root", async () => {
    const deployDir = mkdtempSync(path.join(tmpdir(), "sccp-solana-gate-"));
    const writeJson = (relativePath, value) => {
      const target = path.join(deployDir, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
      return target;
    };
    try {
      const preflightPath = writeJson("preflight.json", readyPreflightReport());
      writeJson(
        "taira-solana-xor-production-requirements.json",
        readyRequirementsReport(),
      );
      writeJson(
        "taira-solana-xor-source-material-handoff.verification.json",
        readyHandoffVerificationReport(),
      );
      writeJson(
        "taira-solana-xor-source-burn.submission.json",
        readySourceBurnSubmissionReport(),
      );
      writeJson(
        path.join("smoke-readiness", "latest.json"),
        readySmokeReadinessReport(),
      );
      writeJson(
        "sccp-solana-deployment-video.json",
        deploymentVideoTranscript({ ready: true }),
      );

      const { report, reportPath } = await runSccpSolanaProductionGate({
        outputDir: deployDir,
        preflightReport: preflightPath,
      });

      expect(reportPath).toBe(
        path.join(deployDir, "sccp-solana-production-gate.json"),
      );
      expect(report.successExecutionPolicy).toMatchObject({
        ready: false,
        preflightReportOverride: true,
        freshPreflightCompleted: false,
      });
      expect(() =>
        validateSolanaProductionGatePreLiveInputSnapshot(
          report.preLiveInputSnapshot,
        ),
      ).not.toThrow();
      expect(report.preLiveInputSnapshotSha256).toBe(
        report.preLiveInputSnapshot.preLiveInputSnapshotSha256,
      );
      expect(Object.keys(report.preLiveInputSnapshot.inputs).sort()).toEqual(
        Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS).sort(),
      );
      expect(report.preLiveInputSnapshot.inputs.requirements).toMatchObject({
        path: path.join(
          deployDir,
          "taira-solana-xor-production-requirements.json",
        ),
        present: true,
      });
      expect(
        report.successExecutionPolicy.problems.map((problem) => problem.id),
      ).toContain("fresh-public-preflight");
      expect(report.artifacts).toMatchObject({
        deployDir,
        requirementsPath: path.join(
          deployDir,
          "taira-solana-xor-production-requirements.json",
        ),
        handoffVerificationPath: path.join(
          deployDir,
          "taira-solana-xor-source-material-handoff.verification.json",
        ),
        sourceBurnSubmissionPath: path.join(
          deployDir,
          "taira-solana-xor-source-burn.submission.json",
        ),
        smokeReadinessPath: path.join(
          deployDir,
          "smoke-readiness",
          "latest.json",
        ),
        deploymentVideoTranscriptPath: path.join(
          deployDir,
          "sccp-solana-deployment-video.json",
        ),
      });
      expect(report.artifacts.requirementsPath).not.toContain(
        "output/sccp-solana-deploy",
      );
    } finally {
      rmSync(deployDir, { recursive: true, force: true });
    }
  });

  it("rejects a generated handoff whose stable bytes do not match the propagated gate pin", async () => {
    const deployDir = mkdtempSync(path.join(tmpdir(), "sccp-solana-gate-pin-"));
    try {
      const preflightPath = path.join(deployDir, "preflight.json");
      writeFileSync(
        preflightPath,
        `${JSON.stringify(readyPreflightReport(), null, 2)}\n`,
      );
      const publicationPath = path.join(deployDir, "publication.json");
      writeFileSync(
        publicationPath,
        `${JSON.stringify({
          schema: "iroha-demo-sccp-solana-route-publication-request/v1",
          routeId: "taira_sol_xor",
          assetKey: "xor",
        })}\n`,
      );
      await expect(
        runSccpSolanaProductionGate({
          outputDir: deployDir,
          preflightReport: preflightPath,
          routePublicationRequest: publicationPath,
          routePublicationRequestSha256: `0x${"ff".repeat(32)}`,
        }),
      ).rejects.toThrow(/SHA-256 mismatch/u);
    } finally {
      rmSync(deployDir, { recursive: true, force: true });
    }
  });

  it("fails closed with the current incomplete public rollout evidence", () => {
    const blockedSmoke = blockedSmokeReadinessReport();
    const report = buildSolanaProductionGateReport({
      preflightReport: {
        routeId: "taira_sol_xor",
        ready: false,
        manifestSource: "public",
        publicSolanaCapability: {
          chain: "sol",
          productionReady: false,
          productionReadiness: {
            blockers: [
              "source verifier material is not production-ready for this SCCP lane",
            ],
          },
          routeAllowlist: {
            routesAllowlisted: false,
            blockers: ["governance has not activated this SCCP route profile"],
          },
        },
        publicSolanaLane: {
          chain: "sol",
          productionReady: false,
          destinationRollout: {
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
            ],
          },
        },
        checks: [
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor manifest.",
          },
        ],
      },
      requirementsReport: {
        readyToBuildIsi: false,
        blockers: [{ id: "destination-proof-admission" }],
        solanaDeployment: {
          observedPostDeployEvidence: {
            path: "/tmp/taira-solana-xor-post-deploy-evidence.json",
            liveReadbackReady: true,
            readyForProductionPostDeploy: false,
            liveReadbackBlockers: [],
            productionBlockers: ["offline-full-toml"],
            observedSourceBridgeConfigHash: `0x${"66".repeat(32)}`,
            observedSourceStateTotalBurned: "1",
            observedSourceStateLastBurnHash: `0x${"77".repeat(32)}`,
          },
        },
        requirements: {
          destinationProofAdmission: [
            { key: "admissionMode", status: "invalid" },
            { key: "shapeOnly", status: "invalid", value: true },
          ],
        },
      },
      publishReadinessReport: {
        schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
        routeId: "taira_sol_xor",
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          mcpTransactionTools: {
            ready: true,
            publicationMode: "signed-transaction-body-base64",
            presentTools: [
              "iroha.transactions.submit",
              "iroha.transactions.submit_and_wait",
            ],
            missingTools: [],
          },
        },
        runtimeSigning: {
          authorityReady: false,
          permissionAudit: {
            authority: null,
            checked: false,
            ready: false,
            requiredPermission: "CanManageSccpRouteManifests",
            hasRequiredPermission: false,
          },
          privateKeyEnvPresent: false,
        },
        blockers: [{ id: "runtime-signing-key" }],
      },
      routeManagerAccessReport: blockedRouteManagerAccessReport({
        publishReadinessBlockerIds: ["runtime-signing-key"],
        productionRequirementBlockerIds: ["destination-proof-admission"],
        requiredRouteManagerSnapshot: {
          authority: null,
          authorityReady: false,
          authorityFormatReady: false,
        },
      }),
      operatorHandoffReport: blockedOperatorHandoffReport({
        smokeReadiness: {
          ready: false,
          blockerIds: blockedSmoke.blockerIds,
          failedChecks: blockedSmoke.checks
            .filter((check) => check.status !== "pass")
            .map((check) => ({
              id: check.id,
              detail: check.detail,
              configuredSource: check.evidence?.configuredSource ?? null,
            })),
          failedCheckIds: blockedSmoke.checks
            .filter((check) => check.status !== "pass")
            .map((check) => check.id),
          missingProductionInputIds: blockedSmoke.missingProductionInputs.map(
            (input) => input.id,
          ),
          nextActionIds: blockedSmoke.nextActions,
        },
      }),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: blockedSmoke,
      liveVideoTranscript: null,
      blockedLiveVideoTranscript: {
        schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
        routeId: "taira_sol_xor",
        ready: false,
        diagnosticVideoOnly: true,
        notLiveTransferEvidence: true,
        checkedAt: "2026-07-05T00:01:00.000Z",
        reason: "Solana SCCP live video blocked for test.",
        preflightReady: false,
        publicSolanaCapability: {
          chain: "sol",
          productionReady: false,
          productionReadiness: {
            blockers: [
              "source verifier material is not production-ready for this SCCP lane",
            ],
          },
        },
        diagnostics: {
          sourceMaterialHandoffVerification: {
            ready: true,
            statusCount: 11,
          },
          activationPackage: {
            artifacts: {
              smokeReadiness: {
                ready: false,
                productionReady: null,
                submitReady: null,
                readyForLaneGovernanceReview: null,
                publicLaneReady: null,
                productionProofMaterialReady: null,
                productionLaneReady: null,
              },
            },
          },
          deploymentVideo: {
            activationSmokeReadiness: {
              ready: false,
              productionReady: null,
              submitReady: null,
              readyForLaneGovernanceReview: null,
              publicLaneReady: null,
              productionProofMaterialReady: null,
              productionLaneReady: null,
            },
          },
          operatorHandoff: {
            artifacts: {
              laneActivationRequest: {
                ready: false,
                productionReady: null,
                submitReady: null,
                readyForLaneGovernanceReview: true,
                publicLaneReady: false,
                productionProofMaterialReady: null,
                productionLaneReady: false,
              },
            },
          },
          productionRequirements: {
            readyToBuildIsi: false,
            blockerIds: ["destination-proof-admission"],
          },
          publishReadiness: {
            readyToSubmitWithCurrentRuntime: false,
            blockerIds: ["runtime-signing-key"],
          },
          productionGate: {
            ready: false,
            checkedAt: "2026-07-05T00:00:00.000Z",
            failedChecks: [{ id: "stale-production-gate" }],
          },
        },
        nextActionIds: [
          "smoke:configure-solana-walletconnect",
          "smoke:publish-solana-production-prover-packages",
          "production-gate:Publish a production-ready public TAIRA taira_sol_xor manifest.",
        ],
        nextActionDetails: [
          {
            id: "production-gate:record-bidirectional-live-video",
            title: "Record bidirectional live-transfer MP4",
            blockedBy: [{ id: "live-bidirectional-video" }],
            command: [
              "npm",
              "run",
              "e2e:sccp:solana-video",
              "--",
              "--live-evidence",
              "<completed-solana-bidirectional-live-evidence.json>",
              "--production-gate",
              "output/sccp-solana-production-gate/sccp-solana-production-gate.json",
              "--smoke-readiness",
              "output/sccp-solana-smoke-readiness/latest.json",
              "--activation-package",
              "output/sccp-solana-deploy/taira-solana-xor-activation-package.json",
              "--operator-handoff",
              "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
              "--skip-solana-rpc",
              "false",
            ],
            requiredInputs: [
              "public-solana-route-preflight-ready",
              "walletconnect-project-id",
              "production-solana-prover-packages",
              "funded-taira-and-solana-test-wallets",
              "completed-solana-bidirectional-live-evidence",
            ],
          },
        ],
        videoArtifacts: [
          {
            path: "/tmp/sccp-solana-live-video-blocked.mp4",
            mediaType: "video/mp4",
            diagnosticOnly: true,
            notLiveTransferEvidence: true,
          },
          {
            path: "/tmp/sccp-solana-live-video-blocked.vtt",
            mediaType: "text/vtt",
          },
        ],
      },
      blockedLiveVideoTranscriptPath:
        "/tmp/sccp-solana-live-video-blocked.json",
      blockedLiveVideoMp4Path: "/tmp/sccp-solana-live-video-blocked.mp4",
      blockedLiveVideoVttPath: "/tmp/sccp-solana-live-video-blocked.vtt",
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video-blocked.mp4",
        "/tmp/sccp-solana-live-video-blocked.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "public-preflight-ready",
      "public-solana-lane-ready",
      "public-verifier-programdata-immutable",
      "public-bridge-source-programdata-immutable",
      "production-requirements-ready",
      "destination-proof-admission",
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
      "smoke-readiness-ready",
      "smoke-readiness-artifact-consistency",
      "live-bidirectional-video",
    ]);
    expect(report.failedCheckIds).toEqual(failedIds(report));
    expect(report.blockerIds).toEqual(failedIds(report));
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedTranscript,
    ).toMatchObject({
      path: "/tmp/sccp-solana-live-video-blocked.json",
      present: true,
      schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
      routeId: "taira_sol_xor",
      checkedAt: "2026-07-05T00:01:00.000Z",
      ready: false,
      reason: "Solana SCCP live video blocked for test.",
      nextActionIdCount: 3,
      nextActionDetailCount: 1,
    });
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedDiagnosticMp4,
    ).toMatchObject({
      exists: true,
      ready: true,
      diagnosticFlagsReady: true,
      media: {
        hasVideo: true,
        hasAudio: true,
        hasEmbeddedSubtitle: true,
      },
    });
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedDiagnostics.sourceMaterialHandoffVerification.ready,
    ).toBe(true);
    const blockedDiagnostics = report.checks.find(
      (check) => check.id === "live-bidirectional-video",
    )?.evidence.blockedDiagnostics;
    expect(JSON.stringify(blockedDiagnostics)).not.toMatch(
      /"(?:productionReady|submitReady|readyForLaneGovernanceReview|publicLaneReady|productionProofMaterialReady|productionLaneReady)"\s*:\s*null/u,
    );
    expect(
      blockedDiagnostics.activationPackage.artifacts.smokeReadiness,
    ).toMatchObject({
      productionReady: false,
      submitReady: false,
      readyForLaneGovernanceReview: false,
      publicLaneReady: false,
      productionProofMaterialReady: false,
      productionLaneReady: false,
    });
    expect(
      blockedDiagnostics.operatorHandoff.artifacts.laneActivationRequest,
    ).toMatchObject({
      productionReady: false,
      submitReady: false,
      readyForLaneGovernanceReview: true,
      publicLaneReady: false,
      productionProofMaterialReady: false,
      productionLaneReady: false,
    });
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedDiagnostics.productionGate,
    ).toBeUndefined();
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedSubtitle,
    ).toMatchObject({
      exists: true,
      webvtt: true,
      ready: true,
      cueCount: 14,
      missingRequiredFragments: [],
    });
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedProductionGateSnapshotOmitted,
    ).toBe(true);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedNextActionIds,
    ).toEqual([
      "smoke:configure-solana-walletconnect",
      "smoke:publish-solana-production-prover-packages",
      "production-gate:Publish a production-ready public TAIRA taira_sol_xor manifest.",
    ]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedNextActionDetails,
    ).toEqual([
      expect.objectContaining({
        id: "production-gate:record-bidirectional-live-video",
        command: [
          "npm",
          "run",
          "e2e:sccp:solana-video",
          "--",
          "--live-evidence",
          "<completed-solana-bidirectional-live-evidence.json>",
          "--production-gate",
          "output/sccp-solana-production-gate/sccp-solana-production-gate.json",
          "--smoke-readiness",
          "output/sccp-solana-smoke-readiness/latest.json",
          "--activation-package",
          "output/sccp-solana-deploy/taira-solana-xor-activation-package.json",
          "--operator-handoff",
          "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
          "--skip-solana-rpc",
          "false",
        ],
        requiredInputs: [
          "public-solana-route-preflight-ready",
          "walletconnect-project-id",
          "production-solana-prover-packages",
          "funded-taira-and-solana-test-wallets",
          "completed-solana-bidirectional-live-evidence",
        ],
      }),
    ]);
    expect(
      report.checks.find((check) => check.id === "public-preflight-ready")
        ?.evidence.publicSolanaCapability.productionReadiness.blockers,
    ).toEqual([
      "source verifier material is not production-ready for this SCCP lane",
    ]);
    expect(report.publicSolanaCapability.productionReadiness.blockers).toEqual([
      "source verifier material is not production-ready for this SCCP lane",
    ]);
    expect(
      report.checks.find((check) => check.id === "public-solana-lane-ready")
        ?.evidence,
    ).toMatchObject({
      present: true,
      chain: "sol",
      productionReady: false,
      blockerIds: [
        "immutable Solana verifier program is not deployed for this SCCP lane",
      ],
    });
    expect(report.publicSolanaLane).toMatchObject({
      present: true,
      chain: "sol",
      productionReady: false,
      blockerIds: [
        "immutable Solana verifier program is not deployed for this SCCP lane",
      ],
    });
    expect(report.routePublication).toMatchObject({
      ready: false,
      manifestSource: "public",
      blockerIds: [
        "public-route-publication",
        "solana-lane-publication",
        "route-manifest-shape",
        "production-ready-flag",
      ],
      publicationChecks: [
        { id: "public-route-publication", status: "missing" },
        { id: "solana-lane-publication", status: "missing" },
        { id: "route-manifest-shape", status: "fail" },
        { id: "production-ready-flag", status: "missing" },
      ],
    });
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedPublicSolanaCapability.productionReadiness.blockers,
    ).toEqual([
      "source verifier material is not production-ready for this SCCP lane",
    ]);
    expect(
      report.checks.find((check) => check.id === "publish-readiness-ready")
        ?.evidence.mcpTransactionToolsReady,
    ).toBe(true);
    expect(
      report.checks.find((check) => check.id === "publish-readiness-ready")
        ?.evidence.authorityPermissionReady,
    ).toBe(false);
    expect(
      report.checks.find((check) => check.id === "publish-readiness-ready")
        ?.evidence.permissionAudit.requiredPermission,
    ).toBe("CanManageSccpRouteManifests");
    expect(
      report.checks.find(
        (check) => check.id === "production-requirements-ready",
      )?.evidence.observedPostDeployEvidence,
    ).toMatchObject({
      liveReadbackReady: true,
      readyForProductionPostDeploy: false,
      liveReadbackBlockers: [],
      productionBlockers: ["offline-full-toml"],
      observedSourceStateTotalBurned: "1",
    });
    expect(
      report.checks.find((check) => check.id === "smoke-readiness-ready")
        ?.evidence.missingProductionInputs[0].id,
    ).toBe("walletconnect-project-id");
    expect(
      report.checks.find((check) => check.id === "smoke-readiness-ready")
        ?.evidence.blockerIds,
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(
      report.checks.find((check) => check.id === "smoke-readiness-ready")
        ?.evidence.nextActions,
    ).toEqual([
      { id: "configure-solana-walletconnect", title: "" },
      { id: "publish-solana-production-prover-packages", title: "" },
    ]);
    expect(report.nextRequiredActions).toContain(
      "Run Solana smoke-readiness with a WalletConnect project ID and governed Solana production prover packages.",
    );
    expect(report.nextRequiredActions).not.toContain(
      "Run Solana smoke-readiness with WalletConnect and browser-safe prover module URLs.",
    );
    expect(report.nextActionDetails.map((action) => action.id)).toEqual([
      "activate-public-solana-lane",
      "publish-taira-solana-route-manifest",
      "replace-destination-proof-admission",
      "publish-governed-solana-proof-material",
      "configure-route-manager-runtime",
      "run-solana-smoke-readiness",
      "refresh-solana-smoke-readiness",
      "record-bidirectional-live-video",
    ]);
    expect(report.nextActions).toEqual(
      report.nextActionDetails.map((action) => action.id),
    );
    expect(report.nextActionIds).toEqual(report.nextActions);
    expect(report.completionAuditReady).toBe(false);
    expect(report.nextActionDetails).toMatchObject([
      {
        id: "activate-public-solana-lane",
        blockedBy: [
          { id: "public-preflight-ready" },
          { id: "public-solana-lane-ready" },
          { id: "public-verifier-programdata-immutable" },
          { id: "public-bridge-source-programdata-immutable" },
        ],
        command: [
          "npm",
          "run",
          "sccp:solana:deploy",
          "--",
          "lane-activation-proposal",
        ],
        requiredInputs: [
          "public-solana-lane-activation",
          "immutable-solana-verifier-evidence",
          "active-solana-trust-anchor",
        ],
      },
      {
        id: "publish-taira-solana-route-manifest",
        command: [
          "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY=<runtime-only-private-key-hex>",
          "npm",
          "run",
          "sccp:solana:deploy",
          "--",
          "publish-route-manifest",
          "--submit",
          "true",
          "--authority",
          "<taira-route-manager-account-id>",
        ],
      },
      {
        id: "replace-destination-proof-admission",
        blockedBy: [{ id: "destination-proof-admission" }],
        requiredInputs: ["governed-solana-destination-proof-admission"],
      },
      {
        id: "publish-governed-solana-proof-material",
        requiredInputs: [
          "governed-solana-source-proof-material",
          "reviewed-final-solana-offline-toml",
          "production-ready-solana-browser-prover-sidecars",
        ],
      },
      {
        id: "configure-route-manager-runtime",
        blockedBy: [
          { id: "publish-readiness-ready" },
          { id: "route-manager-access-ready" },
          { id: "operator-handoff-ready" },
        ],
      },
      {
        id: "run-solana-smoke-readiness",
        command: [
          "npm",
          "run",
          "e2e:sccp:solana-smoke-readiness",
          "--",
          "--walletconnect-project-id",
          "<32-hex-walletconnect-project-id>",
          "--destination-prover-module-url",
          "<https-or-package-relative-solana-destination-prover-module>",
          "--source-prover-module-url",
          "<https-or-package-relative-solana-source-prover-module>",
          "--skip-solana-rpc",
          "false",
        ],
        requiredInputs: [
          "walletconnect-project-id",
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
      },
      {
        id: "refresh-solana-smoke-readiness",
        blockedBy: [{ id: "smoke-readiness-artifact-consistency" }],
        requiredInputs: [
          "current-public-solana-route-preflight",
          "current-solana-prover-modules-and-sidecars",
        ],
      },
      {
        id: "record-bidirectional-live-video",
        command: [
          "npm",
          "run",
          "e2e:sccp:solana-video",
          "--",
          "--live-evidence",
          "<completed-solana-bidirectional-live-evidence.json>",
          "--production-gate",
          "output/sccp-solana-production-gate/sccp-solana-production-gate.json",
          "--smoke-readiness",
          "output/sccp-solana-smoke-readiness/latest.json",
          "--activation-package",
          "output/sccp-solana-deploy/taira-solana-xor-activation-package.json",
          "--operator-handoff",
          "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
          "--skip-solana-rpc",
          "false",
        ],
        requiredInputs: [
          "public-solana-route-preflight-ready",
          "walletconnect-project-id",
          "production-solana-prover-packages",
          "funded-taira-and-solana-test-wallets",
          "completed-solana-bidirectional-live-evidence",
        ],
      },
    ]);
    expect(JSON.stringify(report.nextActionDetails)).not.toContain(
      "do-not-leak",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.status,
    ).toBe("proven");
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.status,
    ).toBe("incomplete");
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual([
      "public-preflight-ready",
      "public-solana-lane-ready",
      "public-verifier-programdata-immutable",
      "public-bridge-source-programdata-immutable",
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
    ]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.unresolvedIds,
    ).toEqual(["production-requirements-ready", "destination-proof-admission"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "bidirectional-live-transfer-video",
      )?.unresolvedIds,
    ).toEqual(["live-bidirectional-video"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "no-fake-completion-claims",
      )?.evidence.deploymentVideoReady,
    ).toBe(true);
  });

  it("normalizes blocked Solana live-video artifact summaries to fail-closed booleans", () => {
    const transcript = buildBlockedSolanaLiveVideoTranscript({
      checkedAt: "2026-07-05T00:01:00.000Z",
      reason: "Solana SCCP live video blocked for test.",
      preflightReport: {
        ready: false,
        checks: [{ id: "public-preflight-ready", status: "fail" }],
      },
      diagnostics: {
        activationPackage: {
          artifacts: {
            smokeReadiness: {
              ready: false,
              productionReady: null,
              submitReady: null,
              readyForLaneGovernanceReview: null,
              publicLaneReady: null,
              productionProofMaterialReady: null,
              productionLaneReady: null,
              nextActionIds: ["configure-solana-walletconnect"],
            },
          },
        },
        deploymentVideo: {
          activationSmokeReadiness: {
            ready: false,
            productionReady: null,
            submitReady: null,
            readyForLaneGovernanceReview: null,
            publicLaneReady: null,
            productionProofMaterialReady: null,
            productionLaneReady: null,
          },
        },
        operatorHandoff: {
          artifacts: {
            laneActivationRequest: {
              ready: false,
              productionReady: null,
              submitReady: null,
              readyForLaneGovernanceReview: true,
              publicLaneReady: false,
              productionProofMaterialReady: null,
              productionLaneReady: false,
            },
          },
        },
      },
    });

    expect(JSON.stringify(transcript)).not.toMatch(
      /"(?:productionReady|submitReady|readyForLaneGovernanceReview|publicLaneReady|productionProofMaterialReady|productionLaneReady)"\s*:\s*null/u,
    );
    expect(transcript.failedCheckIds).toEqual(["public-preflight-ready"]);
    expect(transcript.blockerIds).toEqual(
      expect.arrayContaining(["preflight:public-preflight-ready"]),
    );
    expect(transcript.activationPackage.artifacts.smokeReadiness).toMatchObject(
      {
        productionReady: false,
        submitReady: false,
        readyForLaneGovernanceReview: false,
        publicLaneReady: false,
        productionProofMaterialReady: false,
        productionLaneReady: false,
      },
    );
    expect(
      transcript.operatorHandoff.artifacts.laneActivationRequest,
    ).toMatchObject({
      productionReady: false,
      submitReady: false,
      readyForLaneGovernanceReview: true,
      publicLaneReady: false,
      productionProofMaterialReady: false,
      productionLaneReady: false,
    });
    expect(transcript.nextActionIds).toContain(
      "activation-smoke:configure-solana-walletconnect",
    );
  });

  it("passes only when public preflight, production material, publish readiness, smoke readiness, deployment video, and live video are all ready", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(true);
    expect(failedIds(report)).toEqual([]);
    expect(report.failedCheckIds).toEqual([]);
    expect(report.blockerIds).toEqual([]);
    expect(report.nextActionDetails).toEqual([]);
    expect(report.nextActions).toEqual([]);
    expect(report.nextActionIds).toEqual([]);
    expect(report.completionAuditReady).toBe(true);
    expect(report.publicSolanaLane).toMatchObject({
      present: true,
      chain: "sol",
      counterpartyDomain: 3,
      productionReady: true,
      blockerIds: [],
    });
    expect(report.routePublication).toMatchObject({
      ready: true,
      manifestSource: "public",
      blockerIds: [],
      publicationChecks: [
        { id: "public-route-publication", status: "pass" },
        { id: "solana-lane-publication", status: "pass" },
        { id: "route-manifest-shape", status: "pass" },
        { id: "production-ready-flag", status: "pass" },
      ],
    });
    expect(
      report.checks.find(
        (check) => check.id === "source-burn-artifact-consistency",
      )?.status,
    ).toBe("pass");
    expect(
      report.checks.find(
        (check) => check.id === "production-requirements-ready",
      )?.evidence.observedPostDeployEvidence,
    ).toMatchObject({
      liveReadbackReady: true,
      readyForProductionPostDeploy: true,
      productionBlockers: [],
    });
    expect(
      report.checks.find((check) => check.id === "proof-material-bundle-ready")
        ?.evidence.browserProverModules,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "destination",
          moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
          productionProofsReady: true,
          blockerIds: [],
        }),
        expect.objectContaining({
          direction: "source",
          moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
          productionProofsReady: true,
          blockerIds: [],
        }),
      ]),
    );
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-ceremony-package-ready",
      )?.evidence.sourceBurnProofRequest,
    ).toMatchObject({
      readyForSourceProof: true,
      canonicalTransferReady: true,
      messageId: `0x${"12".repeat(32)}`,
    });
    expect(
      report.checks.find(
        (check) => check.id === "lane-activation-proposal-ready",
      )?.evidence.proposalHash,
    ).toBe(`0x${"af".repeat(32)}`);
    expect(
      report.checks.find(
        (check) => check.id === "activation-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "operator-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "route-manager-access-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "lane-activation-proposal-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-ceremony-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-bundle-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "smoke-readiness-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.evidence.laneActivationProposal,
    ).toMatchObject({
      proposalHash: `0x${"af".repeat(32)}`,
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.evidence.laneActivationProposalArtifactConsistency,
    ).toMatchObject({
      laneActivationRequestHash: `0x${"ad".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.evidence.activationArtifactConsistency,
    ).toMatchObject({
      activationPackageHash: `0x${"ac".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.evidence.operatorHandoffArtifactConsistency,
    ).toMatchObject({
      handoffHash: `0x${"ab".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.evidence.routeManagerAccessArtifactConsistency,
    ).toMatchObject({
      requestHash: `0x${"aa".repeat(32)}`,
      routePublicationReviewHash: `0x${"88".repeat(32)}`,
      proofMaterialBundleHash: `0x${"33".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.evidence.proofMaterialCeremonyPackage,
    ).toMatchObject({
      ceremonyPackageHash: `0x${"34".repeat(32)}`,
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.evidence.proofMaterialCeremonyArtifactConsistency,
    ).toMatchObject({
      proofMaterialBundleHash: `0x${"33".repeat(32)}`,
      sourceBurnMessageId: `0x${"12".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.evidence.proofMaterialBundleArtifactConsistency,
    ).toMatchObject({
      bundleManifestSha256: `0x${"33".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "wallet-and-prover-smoke-readiness",
      )?.evidence.smokeReadinessArtifactConsistency,
    ).toMatchObject({
      mismatches: [],
    });
    expect(
      report.checks.find(
        (check) => check.id === "deployment-video-artifact-consistency",
      )?.status,
    ).toBe("pass");
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.evidence.sourceMaterialHandoffArtifactConsistency,
    ).toMatchObject({
      mismatches: [],
    });
    expect(
      report.completionAudit.every((item) => item.status === "proven"),
    ).toBe(true);
  });

  it("rejects public Solana preflight artifacts with conflicting route aliases", () => {
    const preflight = readyPreflightReport();
    preflight.route_id = "taira_fake_sol_xor";
    preflight.manifest_source = "local-file";

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const preflightCheck = report.checks.find(
      (check) => check.id === "public-preflight-ready",
    );
    expect(report.ready).toBe(false);
    expect(preflightCheck.status).toBe("fail");
    expect(preflightCheck.evidence.aliasProblems).toEqual([
      "routeId aliases must agree: routeId=taira_sol_xor but route_id=taira_fake_sol_xor.",
      "manifestSource aliases must agree: manifestSource=public but manifest_source=local-file.",
    ]);
  });

  it("requires explicit immutable bridge and source-bridge ProgramData evidence", () => {
    const missing = readyPreflightReport();
    missing.checks = missing.checks.filter(
      (check) => check.id !== "solana-live-bridge-source-evidence",
    );
    expect(
      checkPublicBridgeSourceProgramdataReady({ preflightReport: missing }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          "Immutable bridge/source-bridge ProgramData evidence is missing.",
        ]),
      },
    });

    const mutable = readyPreflightReport();
    const mutableEvidence = mutable.checks.find(
      (check) => check.id === "solana-live-bridge-source-evidence",
    ).evidence.bridge;
    mutableEvidence.immutable = false;
    mutableEvidence.upgradeAuthority =
      "MutableAuthority111111111111111111111111111";
    expect(
      checkPublicBridgeSourceProgramdataReady({ preflightReport: mutable }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          "bridge ProgramData is not explicitly immutable.",
          "bridge ProgramData still has an upgrade authority.",
        ]),
      },
    });

    const unbound = readyPreflightReport();
    delete unbound.deployment;
    expect(
      checkPublicBridgeSourceProgramdataReady({ preflightReport: unbound }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          "Published deployment bridge program address is missing.",
          "Published deployment source-bridge program address is missing.",
        ]),
      },
    });
  });

  it("requires immutable outer and native verifier ProgramData evidence", () => {
    const preflight = readyPreflightReport();
    const evidence = preflight.checks.find(
      (check) => check.id === "solana-live-programdata-evidence",
    ).evidence;
    evidence.nativeVerifier.immutable = false;
    evidence.nativeVerifier.upgradeAuthority =
      "MutableNativeAuthority11111111111111111111111";

    expect(
      checkPublicVerifierProgramdataReady({ preflightReport: preflight }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          "nativeVerifier ProgramData is not explicitly immutable.",
          "nativeVerifier ProgramData still has an upgrade authority.",
        ]),
      },
    });
  });

  it("binds fresh all-program RPC evidence to independent governance role pins", () => {
    const ready = checkGovernanceProgramRolePinsFresh({
      preflightReport: readyPreflightReport(),
      productionMaterialInventoryReport:
        readyProductionMaterialInventoryReport(),
    });
    expect(ready).toMatchObject({ status: "pass", evidence: { problems: [] } });

    const stalePreflight = readyPreflightReport();
    const bridgeEvidence = stalePreflight.checks.find(
      (check) => check.id === "solana-live-bridge-source-evidence",
    ).evidence;
    bridgeEvidence.bridge.programdataSlot = "419893700";
    bridgeEvidence.sourceBridge.programCodeHash = `0x${"ff".repeat(32)}`;
    const stale = checkGovernanceProgramRolePinsFresh({
      preflightReport: stalePreflight,
      productionMaterialInventoryReport:
        readyProductionMaterialInventoryReport(),
    });
    expect(stale).toMatchObject({ status: "fail" });
    expect(stale.evidence.problems).toEqual(
      expect.arrayContaining([
        "destinationBridge fresh programdataSlot does not match its independent governance pin.",
        "sourceBridge fresh code hash does not match its independent governance pin.",
      ]),
    );

    const splicedInventory = readyProductionMaterialInventoryReport();
    splicedInventory.governanceProgramRolePins.roles.sourceBridge.selected = {
      ...splicedInventory.governanceProgramRolePins.roles.destinationBridge
        .selected,
    };
    const spliced = checkGovernanceProgramRolePinsFresh({
      preflightReport: readyPreflightReport(),
      productionMaterialInventoryReport: splicedInventory,
    });
    expect(spliced.status).toBe("fail");
    expect(spliced.evidence.problems).toContain(
      "sourceBridge selected programId does not match its independent governance pin.",
    );
  });

  it("rejects adversarial bridge/source-bridge ProgramData evidence reuse", () => {
    const preflight = readyPreflightReport();
    const evidence = preflight.checks.find(
      (check) => check.id === "solana-live-bridge-source-evidence",
    ).evidence;
    evidence.sourceBridge.programAddress = evidence.bridge.programAddress;
    evidence.sourceBridge.programdataAddress =
      evidence.bridge.programdataAddress;

    expect(
      checkPublicBridgeSourceProgramdataReady({ preflightReport: preflight }),
    ).toMatchObject({
      status: "fail",
      evidence: {
        problems: expect.arrayContaining([
          "sourceBridge program address does not match the published deployment.",
          "Bridge and source-bridge program addresses must differ.",
          "Bridge and source-bridge ProgramData addresses must differ.",
        ]),
      },
    });
  });

  it("rejects public Solana preflight artifacts with the wrong schema or asset", () => {
    const preflight = readyPreflightReport();
    preflight.schema = "iroha-demo-sccp-route-preflight/v1";
    preflight.assetKey = "other";

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const preflightCheck = report.checks.find(
      (check) => check.id === "public-preflight-ready",
    );
    expect(report.ready).toBe(false);
    expect(preflightCheck.status).toBe("fail");
    expect(preflightCheck.evidence).toMatchObject({
      schema: "iroha-demo-sccp-route-preflight/v1",
      assetKey: "other",
    });
    expect(preflightCheck.evidence.aliasProblems).toEqual([
      "schema must be iroha-demo-sccp-solana-route-preflight/v1.",
      "assetKey must be xor.",
    ]);
  });

  it("rejects public Solana preflight artifacts missing required checks", () => {
    const preflight = readyPreflightReport();
    preflight.checks = preflight.checks.filter((check) =>
      ["public-route-publication", "solana-lane-publication"].includes(
        check.id,
      ),
    );

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const preflightCheck = report.checks.find(
      (check) => check.id === "public-preflight-ready",
    );
    expect(report.ready).toBe(false);
    expect(preflightCheck.status).toBe("fail");
    expect(preflightCheck.evidence.missingRequiredCheckIds).toEqual([
      "sccp-capabilities-load",
      "sccp-submit-capabilities",
      "sccp-manifest-load",
      "solana-capability-publication",
      "solana-route-instance-publication",
      "route-manifest-shape",
      "production-ready-flag",
      "browser-proof-modules",
      "solana-live-programdata-evidence",
      "solana-live-bridge-source-evidence",
    ]);
    expect(preflightCheck.evidence.aliasProblems).toEqual([
      "public Solana preflight missing required checks: sccp-capabilities-load, sccp-submit-capabilities, sccp-manifest-load, solana-capability-publication, solana-route-instance-publication, route-manifest-shape, production-ready-flag, browser-proof-modules, solana-live-programdata-evidence, solana-live-bridge-source-evidence.",
    ]);
  });

  it("rejects a ready-looking public preflight missing the route instance publication check", () => {
    const preflight = readyPreflightReport();
    preflight.checks = preflight.checks.filter(
      (check) => check.id !== "solana-route-instance-publication",
    );

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const preflightCheck = report.checks.find(
      (check) => check.id === "public-preflight-ready",
    );
    expect(report.ready).toBe(false);
    expect(preflightCheck).toMatchObject({
      status: "fail",
      evidence: {
        ready: true,
        missingRequiredCheckIds: ["solana-route-instance-publication"],
        aliasProblems: [
          "public Solana preflight missing required checks: solana-route-instance-publication.",
        ],
      },
    });
  });

  it("rejects public Solana preflight artifacts with the wrong Solana network binding", () => {
    const preflight = readyPreflightReport();
    preflight.solana.network = "solana-mainnet";
    preflight.solana.caipChainId = "solana:mainnet";

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const preflightCheck = report.checks.find(
      (check) => check.id === "public-preflight-ready",
    );
    expect(report.ready).toBe(false);
    expect(preflightCheck.status).toBe("fail");
    expect(preflightCheck.evidence.solana).toEqual({
      network: "solana-mainnet",
      caipChainId: "solana:mainnet",
    });
    expect(preflightCheck.evidence.aliasProblems).toEqual([
      "solana.network must be solana-testnet.",
      "solana.caipChainId must be solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z.",
    ]);
  });

  it("rejects public Solana lane artifacts with conflicting readiness aliases", () => {
    const preflight = readyPreflightReport();
    preflight.publicSolanaLane.production_ready = false;
    preflight.publicSolanaLane.counterparty_domain = 0;
    preflight.checks.find(
      (check) => check.id === "solana-lane-publication",
    ).evidence.production_ready = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const laneCheck = report.checks.find(
      (check) => check.id === "public-solana-lane-ready",
    );
    expect(report.ready).toBe(false);
    expect(laneCheck.status).toBe("fail");
    expect(laneCheck.evidence.aliasProblems).toEqual([
      "publicSolanaLane.counterpartyDomain aliases must agree: counterpartyDomain=3 but counterparty_domain=0.",
      "publicSolanaLane.productionReady aliases must agree: productionReady=true but production_ready=false.",
      "solana-lane-publication.productionReady aliases must agree: productionReady=true but production_ready=false.",
    ]);
  });

  it("rejects public Solana lane artifacts whose check evidence contradicts the lane snapshot", () => {
    const preflight = readyPreflightReport();
    const laneEvidence = preflight.checks.find(
      (check) => check.id === "solana-lane-publication",
    ).evidence;
    laneEvidence.chain = "mainnet-beta";
    laneEvidence.counterpartyDomain = 0;
    laneEvidence.productionReady = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const laneCheck = report.checks.find(
      (check) => check.id === "public-solana-lane-ready",
    );
    expect(report.ready).toBe(false);
    expect(laneCheck.status).toBe("fail");
    expect(laneCheck.evidence.aliasProblems).toEqual(
      expect.arrayContaining([
        "publicSolanaLane.chain must agree with solana-lane-publication.chain: publicSolanaLane.chain=sol but solana-lane-publication.chain=mainnet-beta.",
        "publicSolanaLane.counterpartyDomain must agree with solana-lane-publication.counterpartyDomain: publicSolanaLane.counterpartyDomain=3 but solana-lane-publication.counterpartyDomain=0.",
        "publicSolanaLane.productionReady must agree with solana-lane-publication.productionReady: publicSolanaLane.productionReady=true but solana-lane-publication.productionReady=false.",
        "solana-lane-publication.chain must identify the Solana testnet lane.",
        "solana-lane-publication.counterpartyDomain must be Solana domain 3.",
      ]),
    );
  });

  it("rejects public lane artifacts that are internally consistent but not Solana testnet domain 3", () => {
    const preflight = readyPreflightReport();
    preflight.publicSolanaLane.chain = "mainnet-beta";
    preflight.publicSolanaLane.counterpartyDomain = 0;
    const laneEvidence = preflight.checks.find(
      (check) => check.id === "solana-lane-publication",
    ).evidence;
    laneEvidence.chain = "mainnet-beta";
    laneEvidence.counterpartyDomain = 0;

    const report = buildSolanaProductionGateReport({
      preflightReport: preflight,
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const laneCheck = report.checks.find(
      (check) => check.id === "public-solana-lane-ready",
    );
    expect(report.ready).toBe(false);
    expect(laneCheck.status).toBe("fail");
    expect(laneCheck.evidence.aliasProblems).toEqual([
      "publicSolanaLane.chain must identify the Solana testnet lane.",
      "solana-lane-publication.chain must identify the Solana testnet lane.",
      "publicSolanaLane.counterpartyDomain must be Solana domain 3.",
      "solana-lane-publication.counterpartyDomain must be Solana domain 3.",
    ]);
  });

  it("rejects deployment videos whose activation snapshot is stale", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.activationPackageHash = `0x${"fe".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: activationPackage,
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: readySourceBurnReadinessReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "deployment-video-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "deployment-video-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "activation-package",
        field: "activationPackageHash",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-deployment-video",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "deployment-walkthrough-video",
      )?.unresolvedIds,
    ).toEqual(["deployment-video-artifact-consistency"]);
  });

  it("reports stale blocked live-video subtitle diagnostics without treating them as live evidence", () => {
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video-blocked.vtt",
    );
    const blockedVttPath = path.resolve(
      "/tmp/sccp-solana-live-video-blocked.vtt",
    );
    facts[blockedVttPath].vtt = {
      webvtt: true,
      cueCount: 1,
      cueTextSha256: `0x${"00".repeat(32)}`,
      firstCue: "Stale blocked subtitle.",
      lastCue: "Stale blocked subtitle.",
      cueTexts: ["Stale blocked subtitle."],
    };

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: null,
      blockedLiveVideoTranscript: {
        schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
        routeId: "taira_sol_xor",
        ready: false,
        reason:
          "Solana SCCP live video blocked: public TAIRA Solana route preflight is not ready.",
        preflightReady: false,
        diagnostics: {},
        nextActionIds: ["refresh-solana-route-preflight"],
      },
      blockedLiveVideoTranscriptPath:
        "/tmp/sccp-solana-live-video-blocked.json",
      blockedLiveVideoVttPath: "/tmp/sccp-solana-live-video-blocked.vtt",
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.blockedSubtitle,
    ).toMatchObject({
      exists: true,
      webvtt: true,
      ready: false,
      cueCount: 1,
      missingRequiredFragments: [
        "Solana SCCP live video blocked before recording.",
        "This MP4 is a blocked diagnostic only and is not live transfer evidence.",
        "Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.",
      ],
      reasonExplained: false,
    });
  });

  it("rejects stale Solana proof-material ceremony packages when supplied", () => {
    const ceremonyPackage = readyProofMaterialCeremonyPackageReport();
    ceremonyPackage.readyForCeremonyReview = false;
    ceremonyPackage.reviewBlockers = [{ id: "source-burn-proof-request" }];
    ceremonyPackage.sourceBurnProofRequest.readyForSourceProof = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport: ceremonyPackage,
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(failedIds(report)).toEqual([
      "proof-material-ceremony-package-ready",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-ceremony-package-ready",
      )?.evidence.reviewBlockerIds,
    ).toEqual(["source-burn-proof-request"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.unresolvedIds,
    ).toEqual(["proof-material-ceremony-package-ready"]);
  });

  it("rejects Solana source-material handoff verification reports that reference stale handoff pins", () => {
    const verification = readyHandoffVerificationReport();
    verification.observedPins.bridgeProgramId =
      "StaleBridge11111111111111111111111111111111";
    verification.statuses.find(
      (status) => status.id === "bridge-program-account",
    ).expected = "StaleBridge11111111111111111111111111111111";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      sourceMaterialHandoffPath:
        "/tmp/taira-solana-xor-source-material-handoff.json",
      handoffVerificationReport: verification,
      handoffVerificationPath:
        "/tmp/taira-solana-xor-source-material-handoff.verification.json",
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "source-material-handoff-artifact-consistency",
      "proof-material-ceremony-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "source-material-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "observed-pins",
        field: "observedPins",
        sourcePath: "/tmp/taira-solana-xor-source-material-handoff.json",
      }),
      expect.objectContaining({
        id: "bridge-program-account",
        field: "expected",
        sourcePath: "/tmp/taira-solana-xor-source-material-handoff.json",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-source-material-handoff-verification",
    );
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-proof-material-ceremony-package",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.unresolvedIds,
    ).toEqual(["source-material-handoff-artifact-consistency"]);
  });

  it("does not treat aligned non-ready Solana source-material handoff blockers as stale", () => {
    const handoff = readySourceMaterialHandoffReport();
    handoff.readyForProofMaterialCeremony = false;
    handoff.observedPins = {
      ...handoff.observedPins,
      routeCanarySignature: null,
      sourceBurnSignature: null,
      sourceBurnHash: null,
    };
    handoff.blockers = [
      { id: "route-canary-signature" },
      { id: "source-burn-hash" },
      { id: "source-burn-signature" },
    ];
    const verification = readyHandoffVerificationReport();
    verification.ready = false;
    verification.observedPins = handoff.observedPins;
    verification.statuses = verification.statuses.map((status) => {
      if (status.id === "handoff-ready-for-proof-material-ceremony") {
        return {
          ...status,
          status: "pass",
          observed: {
            requiredPins: Object.keys(handoff.observedPins).filter(
              (key) =>
                ![
                  "routeCanarySignature",
                  "sourceBurnSignature",
                  "sourceBurnHash",
                ].includes(key),
            ),
            missingPins: [],
          },
        };
      }
      if (status.id === "route-canary-signature-finalized") {
        return {
          ...status,
          status: "fail",
          expected: { signature: null },
          observed: null,
        };
      }
      if (status.id === "source-burn-signature-finalized") {
        return {
          ...status,
          status: "fail",
          expected: { signature: null },
          observed: null,
        };
      }
      return status;
    });
    verification.blockers = verification.statuses
      .filter((status) => status.status !== "pass")
      .map((status) => ({ id: status.id }));

    const check = checkSourceMaterialHandoffArtifactConsistency({
      sourceMaterialHandoffReport: handoff,
      sourceMaterialHandoffPath:
        "/tmp/taira-solana-xor-source-material-handoff.json",
      handoffVerificationReport: verification,
      handoffVerificationPath:
        "/tmp/taira-solana-xor-source-material-handoff.verification.json",
    });

    expect(check).toMatchObject({
      id: "source-material-handoff-artifact-consistency",
      status: "pass",
    });
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("canonicalizes blank and null missing handoff pins without hiding non-empty mismatches", () => {
    const handoff = readySourceMaterialHandoffReport();
    handoff.readyForProofMaterialCeremony = false;
    handoff.observedPins.verifierProgramId = "";
    handoff.blockers = [{ id: "verifier-program-id" }];
    const verification = readyHandoffVerificationReport();
    verification.ready = false;
    verification.observedPins.verifierProgramId = "";
    const readinessStatus = verification.statuses.find(
      (status) => status.id === "handoff-ready-for-proof-material-ceremony",
    );
    readinessStatus.status = "fail";
    readinessStatus.observed.missingPins = ["verifierProgramId"];
    const verifierStatus = verification.statuses.find(
      (status) => status.id === "verifier-program-account",
    );
    verifierStatus.status = "fail";
    verifierStatus.expected = null;
    verification.blockers = [
      { id: "handoff-ready-for-proof-material-ceremony" },
      { id: "verifier-program-account" },
    ];

    const check = checkSourceMaterialHandoffArtifactConsistency({
      sourceMaterialHandoffReport: handoff,
      sourceMaterialHandoffPath:
        "/tmp/taira-solana-xor-source-material-handoff.json",
      handoffVerificationReport: verification,
      handoffVerificationPath:
        "/tmp/taira-solana-xor-source-material-handoff.verification.json",
    });

    expect(check).toMatchObject({
      id: "source-material-handoff-artifact-consistency",
      status: "pass",
    });
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("rejects Solana proof-material ceremony packages that reference stale bundle or source-burn artifacts", () => {
    const ceremonyPackage = readyProofMaterialCeremonyPackageReport();
    ceremonyPackage.artifacts.sourceBurnSubmission.stableHash = `0x${"ff".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport: ceremonyPackage,
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "proof-material-ceremony-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-ceremony-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "source-burn-submission",
        expected: `0x${"12".repeat(32)}`,
        observed: `0x${"ff".repeat(32)}`,
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-proof-material-ceremony-package",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.unresolvedIds,
    ).toEqual(["proof-material-ceremony-artifact-consistency"]);
  });

  it("rejects Solana proof-material ceremony packages that reference stale source-material handoff artifacts", () => {
    const ceremonyPackage = readyProofMaterialCeremonyPackageReport();
    ceremonyPackage.artifacts.sourceMaterialHandoff.stableHash = `0x${"ee".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      sourceMaterialHandoffPath:
        "/tmp/taira-solana-xor-source-material-handoff.json",
      handoffVerificationReport: readyHandoffVerificationReport(),
      handoffVerificationPath:
        "/tmp/taira-solana-xor-source-material-handoff.verification.json",
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport: ceremonyPackage,
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "proof-material-ceremony-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-ceremony-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "source-material-handoff",
        observed: `0x${"ee".repeat(32)}`,
        sourcePath: "/tmp/taira-solana-xor-source-material-handoff.json",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-proof-material-ceremony-package",
    );
  });

  it("rejects Solana proof-material bundles that reference stale proof-material request snapshots", () => {
    const proofMaterialBundle = readyProofMaterialBundleReport();
    proofMaterialBundle.proofMaterialRequest.observedPins.sourceBurnMessageId = `0x${"ef".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialRequestPath:
        "/tmp/taira-solana-xor-proof-material-request.json",
      proofMaterialBundleReport: proofMaterialBundle,
      proofMaterialBundlePath:
        "/tmp/taira-solana-xor-proof-material-bundle.json",
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "proof-material-bundle-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "proof-material-bundle-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "proof-material-request",
        field: "observedPins",
        sourcePath: "/tmp/taira-solana-xor-proof-material-request.json",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-proof-material-bundle",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.unresolvedIds,
    ).toEqual(["proof-material-bundle-artifact-consistency"]);
  });

  it("rejects stale Solana lane activation proposals when supplied", () => {
    const proposal = readyLaneActivationProposalReport();
    proposal.readyForGovernanceReview = false;
    proposal.reviewBlockers = [{ id: "lane-activation-request" }];
    proposal.laneActivationRequest.readyForLaneGovernanceReview = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      laneActivationProposalReport: proposal,
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(failedIds(report)).toEqual(["lane-activation-proposal-ready"]);
    expect(
      report.checks.find(
        (check) => check.id === "lane-activation-proposal-ready",
      )?.evidence.reviewBlockerIds,
    ).toEqual(["lane-activation-request"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["lane-activation-proposal-ready"]);
  });

  it("rejects Solana lane activation proposals that reference stale lane request artifacts", () => {
    const proposal = readyLaneActivationProposalReport();
    proposal.laneActivationRequest.laneActivationRequestHash = `0x${"ee".repeat(32)}`;
    proposal.proposalDraft.laneActivationRequestHash = `0x${"ee".repeat(32)}`;
    const operatorHandoff = readyOperatorHandoffReport();
    operatorHandoff.artifacts.laneActivationRequest.stableHash = `0x${"ee".repeat(32)}`;
    const activationPackage = readyActivationPackageReport();
    activationPackage.artifacts.laneActivationRequest.stableHash = `0x${"ee".repeat(32)}`;
    const transcript = deploymentVideoTranscript();
    transcript.deployment.activationPackage.laneActivationRequestHash = `0x${"ee".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: operatorHandoff,
      activationPackageReport: activationPackage,
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationRequestPath:
        "/tmp/taira-solana-xor-lane-activation-request.json",
      laneActivationProposalReport: proposal,
      laneActivationProposalPath:
        "/tmp/taira-solana-xor-lane-activation-proposal.json",
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "lane-activation-proposal-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "lane-activation-proposal-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "lane-activation-request",
        field: "laneActivationRequestHash",
        expected: `0x${"ad".repeat(32)}`,
        observed: `0x${"ee".repeat(32)}`,
        sourcePath: "/tmp/taira-solana-xor-lane-activation-request.json",
      }),
      expect.objectContaining({
        id: "proposal-draft",
        field: "laneActivationRequestHash",
        expected: `0x${"ad".repeat(32)}`,
        observed: `0x${"ee".repeat(32)}`,
        sourcePath: "/tmp/taira-solana-xor-lane-activation-request.json",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-lane-activation-proposal",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["lane-activation-proposal-artifact-consistency"]);
  });

  it("rejects completed live-video transcripts missing canonical transfer identifiers", () => {
    const transcript = liveVideoTranscript();
    delete transcript.liveEvidence.tairaToSolana.solanaTxId;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: transcript,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence,
    ).toMatchObject({
      evidenceOk: false,
      liveEvidenceStatus: {
        ok: false,
        missingFieldIds: ["forward-solana-tx"],
        invalidFieldIds: [],
        distinctOk: true,
      },
      subtitleExplanation: {
        missingEvidenceFieldIds: ["forward-solana-tx"],
        missingEvidenceMarkerIds: expect.arrayContaining(["forward-solana-tx"]),
      },
    });
  });

  it("rejects a coherent forged transcript when fresh native revalidation did not pass", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      liveVideoAuthoritativeRevalidation: {
        ready: false,
        readOnly: true,
        nativeNetworkClientsUsed: true,
        packageHashesReady: false,
        reason:
          "Fresh canonical transaction reads disagreed with the transcript.",
      },
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence,
    ).toMatchObject({
      trustedFreshRevalidationOk: false,
      authoritativeRevalidation: {
        ready: false,
        reason:
          "Fresh canonical transaction reads disagreed with the transcript.",
      },
    });
  });

  it("rejects self-attested success from an overridden or non-canonical production run", () => {
    const forgedPolicy = readySuccessExecutionPolicy();
    forgedPolicy.ready = false;
    forgedPolicy.preflightReportOverride = true;
    forgedPolicy.problems = [
      {
        id: "fresh-public-preflight",
        detail: "A supplied report is diagnostic only.",
      },
    ];
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      successExecutionPolicy: forgedPolicy,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.successExecutionPolicyOk,
    ).toBe(false);
  });

  it("rejects self-attested live evidence missing activation or operator hashes", () => {
    const transcript = liveVideoTranscript();
    delete transcript.liveEvidence.operatorHandoffHash;
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: transcript,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.packageHashesOk,
    ).toBe(false);
  });

  it("rejects completed live-video transcripts without media verification evidence", () => {
    const transcript = liveVideoTranscript();
    delete transcript.mediaVerification;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: transcript,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.mediaVerificationOk,
    ).toBe(false);
  });

  it("rejects completed live-video transcripts marked as diagnostic or pointing at blocked artifacts", () => {
    const transcript = liveVideoTranscript();
    transcript.diagnosticVideoOnly = true;
    transcript.notLiveTransferEvidence = true;
    transcript.videoArtifacts = [
      {
        path: "/tmp/sccp-solana-live-video-blocked.mp4",
        mediaType: "video/mp4",
        diagnosticOnly: true,
        notLiveTransferEvidence: true,
      },
      { path: "/tmp/sccp-solana-live-video.vtt", mediaType: "text/vtt" },
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: transcript,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video-blocked.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence,
    ).toMatchObject({
      evidenceOk: true,
      mediaVerificationOk: true,
      vttCueTextMatchesTranscript: true,
      diagnosticFlags: {
        ready: false,
        transcriptDiagnosticVideoOnly: true,
        transcriptNotLiveTransferEvidence: true,
        blockedArtifactPaths: [
          path.resolve("/tmp/sccp-solana-live-video-blocked.mp4"),
        ],
        diagnosticArtifacts: [
          expect.objectContaining({
            path: path.resolve("/tmp/sccp-solana-live-video-blocked.mp4"),
            mediaType: "video/mp4",
            blockedDiagnosticPath: true,
            diagnosticOnly: true,
            notLiveTransferEvidence: true,
          }),
        ],
      },
    });
  });

  it("rejects completed live-video transcripts with malformed Solana transaction signatures", () => {
    const invalidSignature = "0".repeat(64);
    const transcript = liveVideoTranscript();
    transcript.liveEvidence.solanaToTaira.solanaSourceTx = invalidSignature;
    transcript.subtitleCues = liveSubtitleCues().map((cue) =>
      cue.step === 4
        ? {
            ...cue,
            text: `Step 4: The Solana wallet submitted the return burn transaction ${invalidSignature}.`,
          }
        : cue,
    );
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video.mp4",
      "/tmp/sccp-solana-live-video.vtt",
    );
    const cueTexts = transcript.subtitleCues.map((cue) => cue.text);
    facts[path.resolve("/tmp/sccp-solana-live-video.vtt")].vtt = {
      webvtt: true,
      cueCount: cueTexts.length,
      cueTextSha256: cueTextHash(cueTexts),
      firstCue: cueTexts[0],
      lastCue: cueTexts.at(-1),
    };

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: transcript,
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence,
    ).toMatchObject({
      evidenceOk: false,
      vttCueTextMatchesTranscript: true,
      liveEvidenceStatus: {
        ok: false,
        missingFieldIds: [],
        invalidFieldIds: ["reverse-solana-source-tx"],
        distinctOk: true,
      },
      subtitleExplanation: {
        missingEvidenceMarkerIds: [],
        invalidEvidenceFieldIds: ["reverse-solana-source-tx"],
      },
    });
  });

  it("rejects completed live-video VTT artifacts whose cues drift from the transcript", () => {
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video.mp4",
      "/tmp/sccp-solana-live-video.vtt",
    );
    facts[path.resolve("/tmp/sccp-solana-live-video.vtt")].vtt = {
      webvtt: true,
      cueCount: 1,
      cueTextSha256: `0x${"00".repeat(32)}`,
      firstCue: "Step 1: stale placeholder.",
      lastCue: "Step 1: stale placeholder.",
    };

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence,
    ).toMatchObject({
      vttCueTextMatchesTranscript: false,
      vtt: {
        vtt: {
          cueCount: 1,
          cueTextSha256: `0x${"00".repeat(32)}`,
        },
      },
      subtitleExplanation: {
        cueCount: 5,
        numberedStepCount: 5,
        missingRequiredSteps: [],
        missingEvidenceMarkerIds: [],
      },
    });
  });

  it("includes Solana activation-package readiness when the report is supplied", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      activationPackagePath: "/tmp/taira-solana-xor-activation-package.json",
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(true);
    expect(
      report.checks.find((check) => check.id === "activation-package-ready")
        ?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "activation-package-ready")
        ?.evidence.smokeReadiness,
    ).toMatchObject({
      present: true,
      ready: true,
      failedCheckIds: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.checkIds,
    ).toContain("activation-package-ready");
  });

  it("rejects operator handoffs that omit lane activation or smoke-readiness evidence", () => {
    const staleHandoff = readyOperatorHandoffReport();
    delete staleHandoff.artifacts.laneActivationRequest;
    delete staleHandoff.artifacts.smokeReadiness;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: staleHandoff,
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const operatorCheck = report.checks.find(
      (check) => check.id === "operator-handoff-ready",
    );

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["operator-handoff-ready"]);
    expect(operatorCheck?.evidence).toMatchObject({
      laneActivationRequestReady: false,
      laneActivationProductionReady: false,
      smokeReadinessReady: false,
    });
  });

  it("rejects operator handoffs that reference stale publication or access artifacts", () => {
    const staleHandoff = readyOperatorHandoffReport();
    staleHandoff.artifacts.routeManagerAccessRequest.stableHash = `0x${"ee".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: staleHandoff,
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "operator-handoff-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "operator-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "route-manager-access-request",
        expected: `0x${"aa".repeat(32)}`,
        observed: `0x${"ee".repeat(32)}`,
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-operator-handoff",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["operator-handoff-artifact-consistency"]);
  });

  it("rejects operator handoffs that reference stale smoke-readiness snapshots", () => {
    const staleHandoff = readyOperatorHandoffReport();
    staleHandoff.artifacts.smokeReadiness.missingProductionInputIds = [
      "walletconnect-project-id",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: staleHandoff,
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "operator-handoff-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "operator-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "smoke-readiness",
        field: "missingProductionInputIds",
        expected: "[]",
        observed: JSON.stringify(["walletconnect-project-id"]),
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-operator-handoff",
    );
  });

  it("accepts operator handoffs that only embed stale smoke-readiness timestamps", () => {
    const staleHandoff = readyOperatorHandoffReport();
    staleHandoff.artifacts.smokeReadiness.checkedAt =
      "2026-07-04T23:00:00.000Z";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: staleHandoff,
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(true);
    expect(failedIds(report)).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "operator-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
  });

  it("rejects operator handoffs with stale smoke-readiness failed-check details", () => {
    const blockedSmoke = blockedSmokeReadinessReport();
    const staleFailedChecks = blockedSmoke.checks
      .filter((check) => check.status !== "pass")
      .map((check) => ({
        id: check.id,
        detail: check.detail,
        configuredSource: check.evidence?.configuredSource ?? null,
      }));
    staleFailedChecks.find(
      (check) => check.id === "destination-prover-module-url",
    ).detail =
      "Solana destination prover module URL is configured but not ready: productionProofsReady must be true.";

    const staleHandoff = blockedOperatorHandoffReport({
      smokeReadiness: {
        ready: false,
        blockerIds: blockedSmoke.blockerIds,
        failedChecks: staleFailedChecks,
        failedCheckIds: staleFailedChecks.map((check) => check.id),
        missingProductionInputIds: blockedSmoke.missingProductionInputs.map(
          (input) => input.id,
        ),
        nextActionIds: blockedSmoke.nextActions,
      },
    });

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: staleHandoff,
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: blockedSmoke,
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(
      expect.arrayContaining([
        "operator-handoff-ready",
        "operator-handoff-artifact-consistency",
        "smoke-readiness-ready",
      ]),
    );
    expect(
      report.checks.find(
        (check) => check.id === "operator-handoff-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "smoke-readiness",
        field: "failedChecks",
      }),
    ]);
  });

  it("rejects smoke-readiness reports that reference stale preflight or prover artifacts", () => {
    const staleSmoke = readySmokeReadinessReport();
    staleSmoke.checks.find(
      (check) => check.id === "destination-prover-module-url",
    ).evidence.inspection.moduleHash = `0x${"fe".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: staleSmoke,
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["smoke-readiness-artifact-consistency"]);
    expect(
      report.checks.find(
        (check) => check.id === "smoke-readiness-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "destination-prover",
        field: "moduleHash",
        expected: FIXTURE_DESTINATION_PROVER_MODULE_HASH,
        observed: `0x${"fe".repeat(32)}`,
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-smoke-readiness",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "wallet-and-prover-smoke-readiness",
      )?.unresolvedIds,
    ).toEqual(["smoke-readiness-artifact-consistency"]);
  });

  it("does not call observed fail-closed prover hashes stale when a blocked bundle has no hash claim", () => {
    const bundle = readyProofMaterialBundleReport();
    for (const entry of bundle.proofMaterialRequest.browserProverModules) {
      entry.actualModuleHash = null;
      entry.expectedModuleHash = null;
    }
    const smoke = readySmokeReadinessReport();
    smoke.ready = false;
    smoke.blockerIds = [
      "destination-prover-module-url",
      "source-prover-module-url",
    ];
    smoke.failedCheckIds = [...smoke.blockerIds];
    for (const check of smoke.checks.filter((entry) =>
      smoke.blockerIds.includes(entry.id),
    )) {
      check.status = "fail";
    }

    const check = checkSmokeReadinessArtifactConsistency({
      smokeReadinessReport: smoke,
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      proofMaterialBundleReport: bundle,
      proofMaterialBundlePath:
        "/tmp/taira-solana-xor-proof-material-bundle.json",
    });

    expect(check).toMatchObject({
      id: "smoke-readiness-artifact-consistency",
      status: "pass",
    });
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("ignores transient Solana preflight fetch failures when stable route blockers match", () => {
    const blockedPreflight = {
      ...readyPreflightReport(),
      ready: false,
      publicSolanaLane: {
        chain: "sol",
        counterpartyDomain: 3,
        productionReady: false,
        disabledReason:
          "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
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
    };
    const smoke = readySmokeReadinessReport();
    smoke.ready = false;
    smoke.blockerIds = ["route-preflight"];
    const routePreflightCheck = smoke.checks.find(
      (check) => check.id === "route-preflight",
    );
    routePreflightCheck.status = "fail";
    routePreflightCheck.detail =
      "Public TAIRA Solana route preflight is not ready.";
    routePreflightCheck.evidence.ready = false;
    routePreflightCheck.evidence.failedChecks = [
      { id: "sccp-capabilities-load", detail: "fetch failed" },
      {
        id: "solana-capability-publication",
        detail: "No Solana SCCP capability lane found.",
      },
      {
        id: "solana-lane-publication",
        detail:
          "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      },
      {
        id: "route-manifest-shape",
        detail: "No taira_sol_xor Solana testnet manifest found.",
      },
    ];
    routePreflightCheck.evidence.browserProofModules = null;

    const report = buildSolanaProductionGateReport({
      preflightReport: blockedPreflight,
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: smoke,
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const consistency = report.checks.find(
      (check) => check.id === "smoke-readiness-artifact-consistency",
    );
    expect(consistency.status).toBe("pass");
    expect(consistency.evidence.mismatches).toEqual([]);
    expect(failedIds(report)).not.toContain(
      "smoke-readiness-artifact-consistency",
    );
  });

  it("rejects smoke-readiness reports that embed stale preflight timestamps", () => {
    const staleSmoke = readySmokeReadinessReport();
    staleSmoke.checks.find(
      (check) => check.id === "route-preflight",
    ).evidence.checkedAt = "2026-07-04T23:00:00.000Z";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: staleSmoke,
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["smoke-readiness-artifact-consistency"]);
    expect(
      report.checks.find(
        (check) => check.id === "smoke-readiness-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "route-preflight",
        field: "checkedAt",
        expected: '"2026-07-05T00:00:00.000Z"',
        observed: '"2026-07-04T23:00:00.000Z"',
      }),
    ]);
  });

  it("rejects stale or blocked Solana activation packages when supplied", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.productionActivationReady = false;
    activationPackage.readyToSubmitWithCurrentRuntime = false;
    activationPackage.blockers = [
      { id: "public-solana-lane" },
      { id: "runtime-route-manager" },
    ];
    const transcript = deploymentVideoTranscript();
    transcript.deployment.activationPackage.productionActivationReady = false;
    transcript.deployment.activationPackage.readyToSubmitWithCurrentRuntime = false;
    transcript.deployment.activationPackage.blockerIds = [
      "public-solana-lane",
      "runtime-route-manager",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: activationPackage,
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["activation-package-ready"]);
    expect(
      report.checks.find((check) => check.id === "activation-package-ready")
        ?.evidence.blockerIds,
    ).toEqual(["public-solana-lane", "runtime-route-manager"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["activation-package-ready"]);
  });

  it("rejects activation packages that reference stale proof or lane artifacts", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.artifacts.proofMaterialCeremonyPackage.stableHash = `0x${"ff".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: activationPackage,
      activationPackagePath: "/tmp/taira-solana-xor-activation-package.json",
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      laneActivationProposalPath:
        "/tmp/taira-solana-xor-lane-activation-proposal.json",
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialBundlePath: "/tmp/taira-solana-xor-proof-material.json",
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      proofMaterialCeremonyPackagePath:
        "/tmp/taira-solana-xor-proof-material-ceremony-package.json",
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["activation-artifact-consistency"]);
    expect(
      report.checks.find(
        (check) => check.id === "activation-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "proof-material-ceremony-package",
        expected: `0x${"34".repeat(32)}`,
        observed: `0x${"ff".repeat(32)}`,
      }),
    ]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["activation-artifact-consistency"]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-activation-package",
    );
  });

  it("rejects activation packages that reference stale publication, access, or handoff artifacts", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.artifacts.routeManagerAccessRequest.stableHash = `0x${"ee".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routePublicationRequestPath:
        "/tmp/taira-solana-xor-route-publication-request.json",
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      routeManagerAccessPath:
        "/tmp/taira-solana-xor-route-manager-access-request.json",
      operatorHandoffReport: readyOperatorHandoffReport(),
      operatorHandoffPath: "/tmp/taira-solana-xor-operator-handoff.json",
      activationPackageReport: activationPackage,
      activationPackagePath: "/tmp/taira-solana-xor-activation-package.json",
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["activation-artifact-consistency"]);
    expect(
      report.checks.find(
        (check) => check.id === "activation-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "route-manager-access-request",
        expected: `0x${"aa".repeat(32)}`,
        observed: `0x${"ee".repeat(32)}`,
        sourcePath: "/tmp/taira-solana-xor-route-manager-access-request.json",
      }),
    ]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["activation-artifact-consistency"]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-activation-package",
    );
  });

  it("rejects activation packages that reference stale smoke-readiness snapshots", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.artifacts.smokeReadiness.failedCheckIds = [
      "route-preflight",
    ];
    const transcript = deploymentVideoTranscript();
    transcript.deployment.activationPackage.smokeReadiness.failedCheckIds = [
      "route-preflight",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: activationPackage,
      activationPackagePath: "/tmp/taira-solana-xor-activation-package.json",
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["activation-artifact-consistency"]);
    expect(
      report.checks.find(
        (check) => check.id === "activation-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "smoke-readiness",
        field: "failedCheckIds",
        expected: "[]",
        observed: JSON.stringify(["route-preflight"]),
      }),
      expect.objectContaining({
        id: "smoke-readiness",
        field: "failedChecks",
        expected: "[]",
        observed: JSON.stringify([
          {
            id: "route-preflight",
            detail: null,
            configuredSource: null,
          },
        ]),
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-activation-package",
    );
  });

  it("accepts activation packages that only embed stale smoke-readiness timestamps", () => {
    const activationPackage = readyActivationPackageReport();
    activationPackage.artifacts.smokeReadiness.checkedAt =
      "2026-07-04T23:00:00.000Z";
    const transcript = deploymentVideoTranscript();
    transcript.deployment.activationPackage.smokeReadiness.checkedAt =
      "2026-07-04T23:00:00.000Z";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: activationPackage,
      activationPackagePath: "/tmp/taira-solana-xor-activation-package.json",
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      smokeReadinessPath: "/tmp/sccp-solana-smoke-readiness.json",
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(true);
    expect(failedIds(report)).toEqual([]);
    expect(
      report.checks.find(
        (check) => check.id === "activation-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
  });

  it("keeps missing Solana source-burn evidence out of deployment handoff verification", () => {
    const handoffVerification = readyHandoffVerificationReport();
    handoffVerification.ready = false;
    handoffVerification.statuses = handoffVerification.statuses.map((status) =>
      status.id === "source-burn-signature-finalized"
        ? {
            ...status,
            status: "fail",
            expected: { signature: null },
            observed: null,
            detail: "Transaction signature is missing from handoff pins.",
          }
        : status,
    );
    handoffVerification.blockers = [
      {
        id: "source-burn-signature-finalized",
        detail: "Transaction signature is missing from handoff pins.",
      },
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: handoffVerification,
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(failedIds(report)).toEqual(["source-burn-proof-request-ready"]);
    expect(
      report.checks.find(
        (check) => check.id === "source-material-handoff-verified",
      ),
    ).toMatchObject({
      status: "pass",
      evidence: {
        ready: false,
        deploymentReady: true,
        sourceBurnStatuses: [
          expect.objectContaining({
            id: "source-burn-signature-finalized",
            status: "fail",
          }),
        ],
      },
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.unresolvedIds,
    ).toEqual(["source-burn-proof-request-ready"]);
  });

  it("rejects missing canonical Solana source-burn proof request scaffolds", () => {
    const sourceBurnSubmission = readySourceBurnSubmissionReport();
    sourceBurnSubmission.sourceProofRequest.canonical.messageBundle.finalityProof =
      { kind: "fixture-proof" };
    sourceBurnSubmission.sourceProofRequest.productionProof = true;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: sourceBurnSubmission,
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["source-burn-proof-request-ready"]);
    expect(
      report.checks.find(
        (check) => check.id === "source-burn-proof-request-ready",
      )?.evidence,
    ).toMatchObject({
      productionProof: true,
      finalityProofIncluded: true,
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.unresolvedIds,
    ).toEqual(["source-burn-proof-request-ready"]);
  });

  it("accepts post-burn readiness that shows the submitted token was consumed", () => {
    const postBurnReadiness = readySourceBurnReadinessReport();
    postBurnReadiness.readyToSubmitBurn = false;
    postBurnReadiness.selectedSourceToken = null;
    postBurnReadiness.tairaRecipient = null;
    postBurnReadiness.nonce = null;
    postBurnReadiness.tokenAccounts = [
      {
        address: FIXTURE_SOURCE_BURN_TOKEN,
        owner: FIXTURE_SOURCE_BURN_OWNER,
        mint: FIXTURE_TOKEN_MINT_ADDRESS,
        amount: "0",
      },
    ];
    postBurnReadiness.blockers = [
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
    ];

    const check = checkSourceBurnArtifactConsistency({
      sourceBurnReadinessReport: postBurnReadiness,
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
    });

    expect(check.status).toBe("pass");
    expect(check.evidence.postBurnConsumedReadiness).toBe(true);
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("accepts pre-burn readiness blocked by zero supply as consistent blocked evidence", () => {
    const check = checkSourceBurnArtifactConsistency({
      sourceBurnReadinessReport: blockedPreBurnReadinessReport(),
      sourceBurnSubmissionReport: blockedPreBurnSubmissionReport(),
    });

    expect(check.status).toBe("pass");
    expect(check.evidence.blockedPreBurnReadiness).toBe(true);
    expect(check.evidence.postBurnConsumedReadiness).toBe(false);
    expect(check.evidence.blockerIds).toEqual([
      "token-mint-supply",
      "source-token-balance",
    ]);
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("accepts read-only blocked source-burn evidence before recipient and nonce are selected", () => {
    const readiness = blockedPreBurnReadinessReport();
    readiness.tairaRecipient = null;
    readiness.nonce = null;
    const submission = blockedPreBurnSubmissionReport();
    submission.tairaRecipient = null;
    submission.nonce = null;

    const check = checkSourceBurnArtifactConsistency({
      sourceBurnReadinessReport: readiness,
      sourceBurnSubmissionReport: submission,
    });

    expect(check.status).toBe("pass");
    expect(check.evidence.blockedPreBurnReadiness).toBe(true);
    expect(check.evidence.comparedFields).toMatchObject({
      tairaRecipient: "",
      nonce: "",
    });
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("propagates blocked source-burn submission blockers into proof-request readiness", () => {
    const check = checkSourceBurnProofRequestReady({
      sourceBurnSubmissionReport: blockedPreBurnSubmissionReport(),
    });

    expect(check.status).toBe("fail");
    expect(check.evidence.submitted).toBe(false);
    expect(check.evidence.sourceProofRequestReady).toBe(false);
    expect(check.evidence.finalityProofIncluded).toBe(false);
    expect(check.evidence.blockerIds).toEqual([
      "source-burn-submission",
      "token-mint-supply",
      "source-token-balance",
    ]);
  });

  it("rejects blocked source-burn submissions that drift from readiness evidence", () => {
    const blockedSubmission = blockedPreBurnSubmissionReport();
    blockedSubmission.tokenMintAddress =
      "StaleMint1111111111111111111111111111111111";
    blockedSubmission.blockers = [
      {
        id: "source-token-balance",
        detail:
          "No selected SPL TairaXOR token account has at least 1 base units.",
      },
    ];

    const check = checkSourceBurnArtifactConsistency({
      sourceBurnReadinessReport: blockedPreBurnReadinessReport(),
      sourceBurnSubmissionReport: blockedSubmission,
    });

    expect(check.status).toBe("fail");
    expect(check.evidence.blockedPreBurnReadiness).toBe(true);
    expect(check.evidence.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "token-mint" }),
        expect.objectContaining({ id: "blocked-source-burn-blockers" }),
      ]),
    );
  });

  it("rejects post-burn readiness that does not include the submitted consumed token", () => {
    const postBurnReadiness = readySourceBurnReadinessReport();
    postBurnReadiness.readyToSubmitBurn = false;
    postBurnReadiness.selectedSourceToken = null;
    postBurnReadiness.tairaRecipient = null;
    postBurnReadiness.nonce = null;
    postBurnReadiness.tokenAccounts = [
      {
        address: "DifferentToken111111111111111111111111111111",
        owner: FIXTURE_SOURCE_BURN_OWNER,
        mint: FIXTURE_TOKEN_MINT_ADDRESS,
        amount: "0",
      },
    ];
    postBurnReadiness.blockers = [
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
    ];

    const check = checkSourceBurnArtifactConsistency({
      sourceBurnReadinessReport: postBurnReadiness,
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
    });

    expect(check.status).toBe("fail");
    expect(check.evidence.postBurnConsumedReadiness).toBe(true);
    expect(check.evidence.mismatches).toEqual([
      expect.objectContaining({
        id: "post-burn-consumed-token-account",
      }),
    ]);
  });

  it("rejects stale Solana source-burn readiness evidence that points at a different burn", () => {
    const staleReadiness = readySourceBurnReadinessReport();
    staleReadiness.selectedSourceToken.address =
      "StaleToken111111111111111111111111111111111";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      activationPackageReport: readyActivationPackageReport(),
      laneActivationRequestReport: readyLaneActivationRequestReport(),
      laneActivationProposalReport: readyLaneActivationProposalReport(),
      sourceMaterialHandoffReport: readySourceMaterialHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnReadinessReport: staleReadiness,
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialRequestReport: readyProofMaterialRequestReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      proofMaterialCeremonyPackageReport:
        readyProofMaterialCeremonyPackageReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "source-burn-artifact-consistency",
      "deployment-video-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "source-burn-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-token-address" }),
      ]),
    );
    expect(
      report.checks.find(
        (check) => check.id === "deployment-video-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-burn-readiness" }),
      ]),
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "solana-testnet-deployment",
      )?.unresolvedIds,
    ).toEqual(["source-burn-artifact-consistency"]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-source-burn-proof-scaffold",
    );
  });

  it("rejects a deployment transcript that claims readiness before live proof is complete", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript({ ready: true }),
      liveVideoTranscript: null,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toContain("deployment-video-honest-status");
    expect(failedIds(report)).toContain("live-bidirectional-video");
  });

  it("rejects deployment MP4 artifacts without embedded subtitle streams", () => {
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video.mp4",
      "/tmp/sccp-solana-live-video.vtt",
    );
    facts[
      path.resolve("/tmp/sccp-solana-deployment-video.mp4")
    ].media.hasEmbeddedSubtitle = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["deployment-video-present"]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.evidence.mp4.media.hasEmbeddedSubtitle,
    ).toBe(false);
  });

  it("rejects completed Solana live MP4 artifacts without audio streams", () => {
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video.mp4",
      "/tmp/sccp-solana-live-video.vtt",
    );
    facts[path.resolve("/tmp/sccp-solana-live-video.mp4")].media.hasAudio =
      false;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["live-bidirectional-video"]);
    expect(
      report.checks.find((check) => check.id === "live-bidirectional-video")
        ?.evidence.mp4.media.hasAudio,
    ).toBe(false);
  });

  it("rejects a blocked diagnostic MP4 renamed as successful live evidence", () => {
    const liveMp4 = path.resolve("/tmp/sccp-solana-live-video.mp4");
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      liveMp4,
      "/tmp/sccp-solana-live-video.vtt",
    );
    const blockedCueTexts = blockedLiveSubtitleCues().map((cue) => cue.text);
    facts[liveMp4].media.embeddedSubtitle = {
      extracted: true,
      cueCount: blockedCueTexts.length,
      cueTextSha256: cueTextHash(blockedCueTexts),
      firstCue: blockedCueTexts[0],
      lastCue: blockedCueTexts.at(-1),
      error: null,
    };

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    const check = report.checks.find(
      (entry) => entry.id === "live-bidirectional-video",
    );
    expect(check?.status).toBe("fail");
    expect(check?.evidence.embeddedSubtitleMatchesVtt).toBe(false);
  });

  it("does not follow a symbolic link presented as a successful MP4", async () => {
    const tempDir = mkdtempSync(
      path.join(tmpdir(), "sccp-solana-gate-media-link-"),
    );
    const diagnostic = path.join(tempDir, "sccp-solana-live-video-blocked.mp4");
    const claimedSuccess = path.join(tempDir, "sccp-solana-live-video.mp4");
    writeFileSync(diagnostic, "diagnostic-placeholder");
    symlinkSync(diagnostic, claimedSuccess);
    try {
      const facts = await collectArtifactFacts([claimedSuccess]);
      expect(facts[path.resolve(claimedSuccess)]).toMatchObject({
        exists: false,
        symbolicLink: true,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects deployment transcripts without explanatory subtitle cues", () => {
    const transcript = deploymentVideoTranscript();
    delete transcript.subtitleCues;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["deployment-video-present"]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.evidence.subtitleExplanation,
    ).toMatchObject({
      cueCount: 0,
      numberedStepCount: 0,
      missingRequiredSteps: [1, 3, 4, 5, 10, 15, 21, 22],
      blockedStatusOk: false,
    });
  });

  it("rejects deployment transcripts without media verification evidence", () => {
    const transcript = deploymentVideoTranscript();
    delete transcript.mediaVerification;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["deployment-video-present"]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.evidence.mediaVerificationOk,
    ).toBe(false);
  });

  it("rejects deployment VTT artifacts whose cues drift from the transcript", () => {
    const facts = artifactFacts(
      "/tmp/sccp-solana-deployment-video.mp4",
      "/tmp/sccp-solana-deployment-video.vtt",
      "/tmp/sccp-solana-live-video.mp4",
      "/tmp/sccp-solana-live-video.vtt",
    );
    facts[path.resolve("/tmp/sccp-solana-deployment-video.vtt")].vtt = {
      webvtt: true,
      cueCount: 1,
      cueTextSha256: `0x${"00".repeat(32)}`,
      firstCue: "Step 1: stale placeholder.",
      lastCue: "Step 1: stale placeholder.",
    };

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: facts,
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["deployment-video-present"]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.evidence,
    ).toMatchObject({
      vttCueTextMatchesTranscript: false,
      vtt: {
        vtt: {
          cueCount: 1,
          cueTextSha256: `0x${"00".repeat(32)}`,
        },
      },
      subtitleExplanation: {
        cueCount: 25,
        numberedStepCount: 24,
      },
    });
  });

  it("rejects stale deployment transcripts without activation package smoke evidence", () => {
    const transcript = deploymentVideoTranscript();
    delete transcript.deployment.activationPackage.smokeReadiness;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: transcript,
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(failedIds(report)).toEqual(["deployment-video-present"]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.evidence.activationPackage.activationEvidenceOk,
    ).toBe(false);
  });

  it("does not trust a requirements report with invalid destination proof admission statuses", () => {
    const requirements = readyRequirementsReport();
    requirements.requirements.destinationProofAdmission = [
      {
        key: "admissionMode",
        status: "invalid",
        value: "envelope-recorder-v1",
      },
      { key: "shapeOnly", status: "invalid", value: true },
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: requirements,
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["destination-proof-admission"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "governed-proof-material",
      )?.status,
    ).toBe("incomplete");
  });

  it("rejects stale Solana production requirements summaries when upstream artifacts change", () => {
    const staleRequirements = readyRequirementsReport();
    staleRequirements.solanaDeployment.observedProverReadiness.entries[0].ready = false;
    staleRequirements.solanaDeployment.observedProductionMaterialInventory.ready = false;
    staleRequirements.solanaDeployment.observedProductionMaterialInventory.missingProductionArtifactIds =
      ["stale-solana-material"];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: staleRequirements,
      requirementsPath: "/tmp/taira-solana-xor-production-requirements.json",
      postDeployEvidenceReport: readyPostDeployEvidenceReport(),
      postDeployEvidencePath: "/tmp/taira-solana-xor-post-deploy-evidence.json",
      proverReadinessReport: readyProverReadinessReport(),
      proverReadinessPath: "/tmp/taira-solana-xor-prover-readiness.json",
      productionMaterialInventoryReport:
        readyProductionMaterialInventoryReport(),
      productionMaterialInventoryPath:
        "/tmp/taira-solana-xor-production-material-inventory.json",
      publishReadinessReport: readyPublishReadinessReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "production-requirements-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "production-requirements-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "prover-readiness",
        field: "snapshot",
      }),
      expect.objectContaining({
        id: "production-material-inventory",
        field: "snapshot",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-production-requirements",
    );
  });

  it("does not treat derived-report scan-count churn as stale production material", () => {
    const requirements = readyRequirementsReport();
    const inventory = readyProductionMaterialInventoryReport();
    inventory.scanned.fileCount = 999;
    inventory.scanned.skipped = [
      {
        path: "/tmp/solana-material/derived-report.json",
        reason: "derived-report",
      },
    ];
    inventory.materialRoots.expectedGroups[0].paths[0].fileCount = 999;
    inventory.materialRoots.expectedGroups[0].paths[0].candidateCount = 999;
    inventory.materialRoots.expectedGroups[0].paths[0].readyCandidateCount = 999;
    requirements.solanaDeployment.observedProductionMaterialInventory.readyMaterial.governanceProgramRolePins =
      {
        checkedAt: "2026-07-10T00:00:00.000Z",
        ready: false,
        blockerIds: ["governance-approval"],
      };
    inventory.readyMaterial.governanceProgramRolePins = {
      checkedAt: "2026-07-10T00:00:01.000Z",
      ready: false,
      blockerIds: ["governance-approval"],
    };

    const check = checkProductionRequirementsArtifactConsistency({
      requirementsReport: requirements,
      requirementsPath: "/tmp/taira-solana-xor-production-requirements.json",
      productionMaterialInventoryReport: inventory,
      productionMaterialInventoryPath:
        "/tmp/taira-solana-xor-production-material-inventory.json",
    });

    expect(check).toMatchObject({
      id: "production-requirements-artifact-consistency",
      status: "pass",
    });
    expect(check.evidence.mismatches).toEqual([]);
  });

  it("rejects stale reports that omit TAIRA route-manager authority format evidence", () => {
    const publishReadiness = readyPublishReadinessReport();
    publishReadiness.runtimeSigning.authorityFormatReady = false;
    const accessReport = readyRouteManagerAccessReport();
    accessReport.requiredRouteManager.authorityFormatReady = false;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: publishReadiness,
      routeManagerAccessReport: accessReport,
      operatorHandoffReport: {
        ...readyOperatorHandoffReport(),
        readyForOperatorReview: false,
        readyToPublish: false,
        requiredRouteManager: {
          ...readyOperatorHandoffReport().requiredRouteManager,
          authorityFormatReady: false,
        },
        blockers: [{ id: "route-manager-authority" }],
      },
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
    ]);
    expect(
      report.checks.find((check) => check.id === "publish-readiness-ready")
        ?.evidence.authorityFormatReady,
    ).toBe(false);
    expect(
      report.checks.find((check) => check.id === "route-manager-access-ready")
        ?.evidence.authorityFormatReady,
    ).toBe(false);
  });

  it("surfaces explicit TAIRA public-node repair in Solana production gate actions", () => {
    const explicitPublicNodeCommand = [
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
    const publishReadiness = readyPublishReadinessReport();
    publishReadiness.readyForRuntimeSigner = false;
    publishReadiness.readyToSubmitWithCurrentRuntime = false;
    publishReadiness.publicEndpoint.publicationTargetReady = false;
    publishReadiness.publicEndpoint.defaultPresetPublicationReady = true;
    publishReadiness.publicEndpoint.directPublicNodePublicationReady = false;
    publishReadiness.blockers = [
      { id: "taira-explicit-public-node-target" },
      { id: "taira-public-node-dns" },
      { id: "taira-public-node-tls" },
    ];
    const operatorHandoff = {
      ...readyOperatorHandoffReport(),
      nextActionDetails: [
        {
          id: "provide-explicit-taira-public-node-target",
          title: "Provide explicit TAIRA public node",
          detail:
            "Repair and use the exact TAIRA public-node root and matching /v1/mcp endpoint.",
          blockedBy: [
            { id: "taira-explicit-public-node-target" },
            { id: "taira-public-node-dns" },
            { id: "taira-public-node-tls" },
          ],
          command: explicitPublicNodeCommand,
          validationCommands: [["dig", "+short", "taira-validator-1.sora.org"]],
          delegatedActions: [
            {
              id: "publish-direct-validator-dns-records",
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
            {
              id: "taira-public-node-mcp-url",
              kind: "url",
              argument: "--mcp-url",
            },
          ],
        },
      ],
    };
    const routeManagerAccess = readyRouteManagerAccessReport();
    routeManagerAccess.publishReadiness.readyForRuntimeSigner = false;
    routeManagerAccess.publishReadiness.readyToSubmitWithCurrentRuntime = false;
    routeManagerAccess.publishReadiness.blockerIds = [
      "taira-explicit-public-node-target",
      "taira-public-node-dns",
      "taira-public-node-tls",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: publishReadiness,
      routePublishBlockedReport: matchingRoutePublishBlockedReport({
        publishReadiness,
      }),
      routeManagerAccessReport: routeManagerAccess,
      operatorHandoffReport: operatorHandoff,
      activationPackageReport: readyActivationPackageReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(failedIds(report)).toEqual(["publish-readiness-ready"]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "provide-explicit-taira-public-node-target",
    );
    const publicNodeAction = report.nextActionDetails.find(
      (action) => action.id === "provide-explicit-taira-public-node-target",
    );
    expect(publicNodeAction).toMatchObject({
      source: "operator-handoff",
      blockedBy: [{ id: "publish-readiness-ready" }],
      upstreamBlockedBy: [
        { id: "taira-explicit-public-node-target" },
        { id: "taira-public-node-dns" },
        { id: "taira-public-node-tls" },
      ],
      command: explicitPublicNodeCommand,
      validationCommands: [["dig", "+short", "taira-validator-1.sora.org"]],
      delegatedActions: [
        expect.objectContaining({
          id: "publish-direct-validator-dns-records",
          requiredInputs: ["taira-edge-dns-zone-access"],
        }),
      ],
      requiredInputs: [
        "taira-public-node-root-url",
        "taira-public-node-mcp-url",
      ],
    });
  });

  it("rejects forged reports that mark a non-canonical TAIRA route-manager authority ready", () => {
    const fakeAuthority = "testu-route-manager";
    const publishReadiness = readyPublishReadinessReport();
    publishReadiness.runtimeSigning.authority = fakeAuthority;
    publishReadiness.runtimeSigning.authorityReady = true;
    publishReadiness.runtimeSigning.authorityFormatReady = true;

    const accessReport = readyRouteManagerAccessReport();
    accessReport.requiredRouteManager.authority = fakeAuthority;
    accessReport.requiredRouteManager.authorityReady = true;
    accessReport.requiredRouteManager.authorityFormatReady = true;

    const operatorHandoff = readyOperatorHandoffReport();
    operatorHandoff.requiredRouteManager.authority = fakeAuthority;
    operatorHandoff.requiredRouteManager.authorityReady = true;
    operatorHandoff.requiredRouteManager.authorityFormatReady = true;

    const activationPackage = readyActivationPackageReport();
    activationPackage.requiredRouteManager.authority = fakeAuthority;
    activationPackage.requiredRouteManager.authorityReady = true;
    activationPackage.requiredRouteManager.authorityFormatReady = true;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: publishReadiness,
      routeManagerAccessReport: accessReport,
      operatorHandoffReport: operatorHandoff,
      activationPackageReport: activationPackage,
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
      "activation-package-ready",
    ]);
    expect(
      report.checks.find((check) => check.id === "publish-readiness-ready")
        ?.evidence.canonicalAuthority,
    ).toMatchObject({
      authority: fakeAuthority,
      canonical: false,
    });
    expect(
      report.checks.find((check) => check.id === "activation-package-ready")
        ?.evidence.canonicalAuthority,
    ).toMatchObject({
      authority: fakeAuthority,
      canonical: false,
    });
  });

  it("rejects missing runtime signer evidence even when every other production artifact is ready", () => {
    const publishReadiness = readyPublishReadinessReport();
    publishReadiness.readyToSubmitWithCurrentRuntime = false;
    publishReadiness.runtimeSigning.privateKeyEnvPresent = false;
    publishReadiness.blockers = [{ id: "runtime-signing-key" }];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: publishReadiness,
      routeManagerAccessReport: blockedRouteManagerAccessReport({
        publishReadinessBlockerIds: ["runtime-signing-key"],
        publishReadinessSnapshot: {
          readyForRuntimeSigner: true,
          readyToSubmitWithCurrentRuntime: false,
        },
      }),
      operatorHandoffReport: blockedOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
    ]);
  });

  it("tracks a route-publication request handoff without treating it as public route publication", () => {
    const publishReadiness = readyPublishReadinessReport();
    publishReadiness.readyForRuntimeSigner = false;
    publishReadiness.readyToSubmitWithCurrentRuntime = false;
    publishReadiness.runtimeSigning.privateKeyEnvPresent = false;
    publishReadiness.blockers = [{ id: "runtime-signing-key" }];
    const routePublicationRequest = readyRoutePublicationRequestReport();
    routePublicationRequest.publishReadiness.readyForRuntimeSigner = false;
    routePublicationRequest.publishReadiness.readyToSubmitWithCurrentRuntime = false;
    routePublicationRequest.publishReadiness.runtimeSigning.privateKeyEnvPresent = false;
    routePublicationRequest.publishReadiness.blockerIds = [
      "runtime-signing-key",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: publishReadiness,
      routePublishBlockedReport: matchingRoutePublishBlockedReport({
        publishReadiness,
      }),
      routePublicationRequestReport: routePublicationRequest,
      routeManagerAccessReport: blockedRouteManagerAccessReport({
        publishReadinessBlockerIds: ["runtime-signing-key"],
      }),
      operatorHandoffReport: blockedOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(
      report.checks.find(
        (check) => check.id === "route-publication-request-ready",
      )?.status,
    ).toBe("pass");
    expect(
      report.checks.find(
        (check) =>
          check.id === "route-publication-request-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([]);
    expect(failedIds(report)).toEqual([
      "publish-readiness-ready",
      "route-manager-access-ready",
      "operator-handoff-ready",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "route-publish-blocked-artifact-consistency",
      )?.status,
    ).toBe("pass");
    expect(
      report.completionAudit.find(
        (item) => item.id === "route-manager-publication-handoff",
      )?.status,
    ).toBe("proven");
    expect(
      report.completionAudit.find(
        (item) => item.id === "route-manager-publication-handoff",
      )?.evidence.routePublicationArtifactConsistency,
    ).toMatchObject({
      proofMaterialBundleHash: `0x${"33".repeat(32)}`,
      expectedProofMaterialBundleHash: `0x${"33".repeat(32)}`,
      mismatches: [],
    });
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.status,
    ).toBe("incomplete");
  });

  it("rejects stale Solana route-publication requests that wrap old proof bundles", () => {
    const stalePublicationRequest = readyRoutePublicationRequestReport();
    stalePublicationRequest.proofMaterialBundle.bundleManifestSha256 = `0x${"fe".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: stalePublicationRequest,
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-publication-request-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) =>
          check.id === "route-publication-request-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "proof-material-bundle",
        field: "bundleManifestSha256",
        expected: `0x${"33".repeat(32)}`,
        observed: `0x${"fe".repeat(32)}`,
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-publication-request",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "route-manager-publication-handoff",
      )?.unresolvedIds,
    ).toEqual(["route-publication-request-artifact-consistency"]);
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["route-publication-request-artifact-consistency"]);
  });

  it("rejects Solana route-publication requests with stale publish-readiness snapshots", () => {
    const stalePublicationRequest = readyRoutePublicationRequestReport();
    stalePublicationRequest.publishReadiness.readyToSubmitWithCurrentRuntime = false;
    stalePublicationRequest.publishReadiness.publicEndpoint.mcpTransactionTools.publicationMode =
      "dedicated-route-manifest-tool";
    stalePublicationRequest.publishReadiness.blockerIds = [
      "runtime-signing-key",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: stalePublicationRequest,
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-publication-request-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) =>
          check.id === "route-publication-request-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "publish-readiness",
        field: "readyToSubmitWithCurrentRuntime",
        expected: "true",
        observed: "false",
      }),
      expect.objectContaining({
        id: "publish-readiness",
        field: "publicationMode",
        expected: '"signed-transaction-body-base64"',
        observed: '"dedicated-route-manifest-tool"',
      }),
      expect.objectContaining({
        id: "publish-readiness",
        field: "blockerIds",
        expected: "[]",
        observed: '["runtime-signing-key"]',
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-publication-request",
    );
  });

  it("rejects stale Solana route publish-blocked reports after publish-readiness changes", () => {
    const stalePublishBlocked = matchingRoutePublishBlockedReport();
    stalePublishBlocked.runtimeSigning.privateKeyEnvPresent = false;
    stalePublishBlocked.blockerIds = ["runtime-signing-key"];
    stalePublishBlocked.productionRequirements.blockerIds = [
      "destination-proof-admission",
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      routeManifestPath: "/tmp/taira-solana-xor-route.manifest.json",
      publishReadinessReport: readyPublishReadinessReport(),
      publishReadinessPath:
        "/tmp/taira-solana-xor-route.publish-readiness.json",
      routePublishBlockedReport: stalePublishBlocked,
      routePublishBlockedPath:
        "/tmp/taira-solana-xor-route.publish-blocked.json",
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-publish-blocked-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "route-publish-blocked-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "publish-readiness",
        field: "runtimeSigning",
      }),
      expect.objectContaining({
        id: "publish-readiness",
        field: "blockerIds",
        expected: "[]",
        observed: '["runtime-signing-key"]',
      }),
      expect.objectContaining({
        id: "production-requirements",
        field: "blockerIds",
        expected: "[]",
        observed: '["destination-proof-admission"]',
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-publish-blocked",
    );
  });

  it("rejects Solana route-manager access requests with stale publish-readiness snapshots", () => {
    const staleAccessRequest = readyRouteManagerAccessReport();
    staleAccessRequest.publishReadiness.readyToSubmitWithCurrentRuntime = false;
    staleAccessRequest.publishReadiness.mcpTransactionToolsReady = false;
    staleAccessRequest.publishReadiness.publicationMode =
      "dedicated-route-manifest-tool";

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: staleAccessRequest,
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-manager-access-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "route-manager-access-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "publish-readiness",
        field: "readyToSubmitWithCurrentRuntime",
        expected: "true",
        observed: "false",
      }),
      expect.objectContaining({
        id: "publish-readiness",
        field: "mcpTransactionToolsReady",
        expected: "true",
        observed: "false",
      }),
      expect.objectContaining({
        id: "publish-readiness",
        field: "publicationMode",
        expected: '"signed-transaction-body-base64"',
        observed: '"dedicated-route-manifest-tool"',
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-manager-access-request",
    );
  });

  it("rejects stale Solana route-publication requests that wrap old route manifests", () => {
    const stalePublicationRequest = readyRoutePublicationRequestReport();
    stalePublicationRequest.manifest.manifestSha256 = `0x${"ef".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      routeManifestReport: readyRouteManifestReport(),
      routeManifestPath: "/tmp/taira-solana-xor-route.manifest.json",
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: stalePublicationRequest,
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-publication-request-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) =>
          check.id === "route-publication-request-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "route-manifest",
        field: "manifestSha256",
        expected: sha256ForJson(readyRouteManifestReport()),
        observed: `0x${"ef".repeat(32)}`,
        sourcePath: "/tmp/taira-solana-xor-route.manifest.json",
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-publication-request",
    );
  });

  it("rejects stale Solana route-manager access requests that wrap old publication artifacts", () => {
    const staleAccess = readyRouteManagerAccessReport();
    staleAccess.routePublicationRequest.reviewPackageHash = `0x${"ef".repeat(32)}`;

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: readyRoutePublicationRequestReport(),
      routeManagerAccessReport: staleAccess,
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "route-manager-access-artifact-consistency",
    ]);
    expect(
      report.checks.find(
        (check) => check.id === "route-manager-access-artifact-consistency",
      )?.evidence.mismatches,
    ).toEqual([
      expect.objectContaining({
        id: "route-publication-request",
        field: "reviewPackageHash",
        expected: `0x${"88".repeat(32)}`,
        observed: `0x${"ef".repeat(32)}`,
      }),
    ]);
    expect(report.nextActionDetails.map((action) => action.id)).toContain(
      "refresh-solana-route-manager-access-request",
    );
    expect(
      report.completionAudit.find(
        (item) => item.id === "public-taira-route-publication",
      )?.unresolvedIds,
    ).toEqual(["route-manager-access-artifact-consistency"]);
  });

  it("rejects stale Solana route-publication requests that wrap draft manifests", () => {
    const stalePublicationRequest = readyRoutePublicationRequestReport();
    stalePublicationRequest.manifest.productionReadyForIsi = false;
    stalePublicationRequest.manifest.error =
      "Production Solana route manifest must not include manifest.disabledReason.";
    stalePublicationRequest.blockers = [
      { id: "route-manifest-production-shape" },
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      publishReadinessReport: readyPublishReadinessReport(),
      routePublicationRequestReport: stalePublicationRequest,
      routeManagerAccessReport: readyRouteManagerAccessReport(),
      operatorHandoffReport: readyOperatorHandoffReport(),
      handoffVerificationReport: readyHandoffVerificationReport(),
      sourceBurnSubmissionReport: readySourceBurnSubmissionReport(),
      proofMaterialBundleReport: readyProofMaterialBundleReport(),
      smokeReadinessReport: readySmokeReadinessReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    const publicationCheck = report.checks.find(
      (check) => check.id === "route-publication-request-ready",
    );

    expect(report.ready).toBe(false);
    expect(publicationCheck?.status).toBe("fail");
    expect(publicationCheck?.evidence.manifest).toMatchObject({
      readyForPublication: false,
      productionReadyForIsi: false,
      error:
        "Production Solana route manifest must not include manifest.disabledReason.",
    });
    expect(failedIds(report)).toEqual(["route-publication-request-ready"]);
  });
});

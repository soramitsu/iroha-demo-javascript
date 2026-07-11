#!/usr/bin/env node
/* global BigInt, globalThis */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DEFAULT_SOLANA_TESTNET_RPC_URL,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_XOR_ASSET_KEY,
  runSccpSolanaRoutePreflight,
} from "./sccp-solana-route-preflight.mjs";
import {
  buildSccpSolanaSuccessNetworkPolicy,
  CANONICAL_SOLANA_TESTNET_RPC_URL,
} from "./sccp-solana-success-evidence-policy.mjs";
import {
  assertSafeOutputDestination,
  commitGeneratedFileSync,
  DEFAULT_SOLANA_TEXT_MAX_BYTES,
  ensureSafeOutputDirectory,
  parseStrictCliArgs,
  readStableJsonFile,
  readStableJsonFileIfExists,
  readStableRegularFile,
  removeGeneratedFileSync,
  writeAtomicFile,
  writeAtomicJsonFile,
} from "./sccp-solana-report-io.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-solana-live-video");
const DEFAULT_DEPLOY_DIR = path.join(repoRoot, "output/sccp-solana-deploy");
const DEFAULT_PRODUCTION_REQUIREMENTS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-production-requirements.json",
);
const DEFAULT_SMOKE_READINESS_PATH = path.join(
  repoRoot,
  "output/sccp-solana-smoke-readiness",
  "latest.json",
);
const DEFAULT_PUBLISH_READINESS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route.publish-readiness.json",
);
const DEFAULT_ROUTE_PUBLICATION_REQUEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route-publication-request.json",
);
const DEFAULT_HANDOFF_VERIFICATION_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-source-material-handoff.verification.json",
);
const DEFAULT_PROOF_MATERIAL_BUNDLE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-proof-material-bundle.json",
);
const DEFAULT_ACTIVATION_PACKAGE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-activation-package.json",
);
const DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.json",
);
const DEFAULT_OPERATOR_HANDOFF_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-operator-handoff.json",
);
const DEFAULT_PRODUCTION_GATE_PATH = path.join(
  repoRoot,
  "output/sccp-solana-production-gate",
  "sccp-solana-production-gate.json",
);
const SOLANA_EXPLORER_HOST = "explorer.solana.com";
const TAIRA_EXPLORER_HOST = "taira-explorer.sora.org";
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
const SOLANA_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const HEX32 = /^(?:0x)?[0-9a-f]{64}$/iu;
export const SOLANA_TESTNET_GENESIS_HASH =
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
const SOLANA_TESTNET_NETWORK_ID = "solana-testnet";
const SOLANA_TESTNET_CAIP_CHAIN_ID = "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";
const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const TAIRA_NETWORK_PREFIX = 369;
const SCCP_SORA_DOMAIN = 0;
const SCCP_SOLANA_DOMAIN = 3;
const SCCP_SOLANA_TOKEN_DECIMALS = 9;
const SCCP_SOLANA_SUBMIT_ENTRYPOINT = "submit_sccp_message_proof";
const SCCP_SOLANA_BURN_ENTRYPOINT = "burn_to_taira";
const SOLANA_SPL_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOLANA_SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();
const SCCP_SOLANA_MESSAGE_RECEIPT_SEED = "sccp-message-receipt";
const SCCP_SOLANA_SOURCE_BURN_RECEIPT_SEED = "sccp-source-burn-receipt";
const SCCP_SOLANA_SOURCE_BURN_EVENT_PREFIX = "sccp:solana:source-burn:v1";

const SUCCESS_PREREQUISITE_OVERRIDE_OPTIONS = Object.freeze([
  ["productionRequirements", "production-requirements"],
  ["publishReadiness", "publish-readiness"],
  ["routePublicationRequest", "route-publication-request"],
  ["smokeReadiness", "smoke-readiness"],
  ["handoffVerification", "handoff-verification"],
  ["proofMaterialBundle", "proof-material-bundle"],
  ["activationPackage", "activation-package"],
  ["deploymentVideoTranscript", "deployment-video-transcript"],
  ["operatorHandoff", "operator-handoff"],
  ["productionGate", "production-gate"],
]);

const commandExists = (command) =>
  spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  }).status === 0;

export const buildSolanaLiveVideoMediaVerification = ({
  ffprobe = null,
  subtitleSummary = null,
  error = null,
} = {}) => {
  const streams = Array.isArray(ffprobe?.streams) ? ffprobe.streams : [];
  const findStream = (type) =>
    streams.find((stream) => stream?.codec_type === type) ?? null;
  const video = findStream("video");
  const audio = findStream("audio");
  const subtitle = findStream("subtitle");
  const durationSeconds = Number(ffprobe?.format?.duration);
  const cueCount = Number(subtitleSummary?.cueCount ?? 0);
  const numberedStepCount = Number(subtitleSummary?.numberedStepCount ?? 0);
  const blockers = [];
  if (!video) {
    blockers.push("video-stream");
  }
  if (!audio) {
    blockers.push("audio-stream");
  }
  if (!subtitle) {
    blockers.push("subtitle-stream");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    blockers.push("duration");
  }
  if (!Number.isSafeInteger(cueCount) || cueCount <= 0) {
    blockers.push("subtitle-cues");
  }
  if (!Number.isSafeInteger(numberedStepCount) || numberedStepCount <= 0) {
    blockers.push("numbered-steps");
  }
  if (error) {
    blockers.push("ffprobe");
  }
  return {
    ready: blockers.length === 0,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    streams: {
      video: video
        ? {
            present: true,
            codec: video.codec_name ?? null,
            width: Number.isFinite(Number(video.width))
              ? Number(video.width)
              : null,
            height: Number.isFinite(Number(video.height))
              ? Number(video.height)
              : null,
          }
        : { present: false },
      audio: audio
        ? {
            present: true,
            codec: audio.codec_name ?? null,
          }
        : { present: false },
      subtitle: subtitle
        ? {
            present: true,
            codec: subtitle.codec_name ?? null,
          }
        : { present: false },
    },
    subtitleCueCount: Number.isSafeInteger(cueCount) ? cueCount : 0,
    numberedStepCount: Number.isSafeInteger(numberedStepCount)
      ? numberedStepCount
      : 0,
    blockers,
    error: error ? String(error) : null,
  };
};

const parseBooleanArg = (value, key) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  throw new Error(`--${key} must be true or false when a value is provided.`);
};

export const parseArgs = (argv) => {
  const args = parseStrictCliArgs(argv, {
    booleanFlags: ["help", "allow-incomplete"],
    optionalBooleanFlags: ["skip-solana-rpc"],
    valueFlags: [
      "torii-url",
      "solana-rpc-url",
      "fetch-timeout-ms",
      "fetch-attempts",
      "live-evidence",
      "write-live-evidence-template",
      "production-requirements",
      "preflight-report",
      "publish-readiness",
      "route-publication-request",
      "smoke-readiness",
      "handoff-verification",
      "proof-material-bundle",
      "activation-package",
      "deployment-video-transcript",
      "operator-handoff",
      "production-gate",
      "production-gate-snapshot",
      "production-gate-snapshot-sha256",
      "output-dir",
    ],
  });
  if (typeof args["skip-solana-rpc"] === "string") {
    args["skip-solana-rpc"] = parseBooleanArg(
      args["skip-solana-rpc"],
      "skip-solana-rpc",
    );
  }
  return args;
};

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-live-video.mjs [options]

Strict live-video gate for TAIRA <-> Solana testnet SCCP.

This command refuses to record an MP4 unless a real public TAIRA Solana
testnet route is preflight-ready and Solana wallet/proof execution is available
in the app. It never creates a fake success video.

Options:
  --torii-url URL        Canonical https://taira-validator-N.sora.org root required for success
  --solana-rpc-url URL   Canonical https://api.testnet.solana.com root required for success
  --fetch-timeout-ms MS  Per-request fetch timeout for fresh public reads
  --fetch-attempts N     Per-request retry attempts for fresh public reads
  --live-evidence PATH   JSON evidence from completed real bidirectional transfers
  --write-live-evidence-template PATH
                         Write a non-secret JSON template for --live-evidence
  --production-requirements PATH
                         Production-requirements report for blocked diagnostics
  --preflight-report PATH
                         Diagnostic-only preflight override; can never produce success
  --publish-readiness PATH
                         Route publish-readiness report for blocked diagnostics
  --route-publication-request PATH
                         Route-manager publication request for blocked diagnostics
  --smoke-readiness PATH
                         Solana app smoke-readiness report for blocked diagnostics
  --handoff-verification PATH
                         Source-material handoff verification report for blocked diagnostics
  --proof-material-bundle PATH
                         Proof-material bundle manifest for blocked diagnostics
  --activation-package PATH
                         TAIRA activation package for blocked diagnostics
  --deployment-video-transcript PATH
                         Deployment walkthrough transcript for blocked diagnostics
  --operator-handoff PATH
                         Consolidated operator handoff for blocked diagnostics
  --production-gate PATH
                         Production-gate snapshot for blocked diagnostics only
  --production-gate-snapshot PATH
                         Exact pre-live production-gate report required for success
  --production-gate-snapshot-sha256 HASH
                         Exact SHA-256 of --production-gate-snapshot
  --output-dir PATH      Output directory (default: output/sccp-solana-live-video)
  --allow-incomplete     Write blocked transcript/subtitles/diagnostic MP4 and exit 0
  --skip-solana-rpc      Diagnostic-only; skipped RPC checks can never produce success
  --help                 Show this help
`);
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ownDataValue = (record, key) => {
  if (!record || (typeof record !== "object" && typeof record !== "function")) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
};

const hasSuppliedPathOption = (options, key) => {
  const value = ownDataValue(options, key);
  return typeof value === "string" && value.trim().length > 0;
};

const successPrerequisiteOverrideIds = (options) =>
  SUCCESS_PREREQUISITE_OVERRIDE_OPTIONS.filter(([key]) =>
    hasSuppliedPathOption(options, key),
  ).map(([, id]) => id);

const readJsonIfExists = async (file) => {
  if (!file) {
    return null;
  }
  return readStableJsonFileIfExists(path.resolve(file), {
    label: "Solana live-video JSON input",
  });
};

const readPinnedProductionGateSnapshot = async ({ file, expectedSha256 }) => {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(String(expectedSha256 ?? "").toLowerCase())
  ) {
    throw new Error(
      "Solana live-video success requires a production-gate snapshot path and exact canonical SHA-256.",
    );
  }
  const resolved = path.resolve(file);
  const bytes = await readStableRegularFile(resolved, {
    label: "Pinned pre-live Solana production-gate report",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== String(expectedSha256).toLowerCase()) {
    throw new Error(
      `Pinned pre-live Solana production-gate report SHA-256 mismatch: expected ${expectedSha256}, got ${actual}.`,
    );
  }
  let report;
  try {
    report = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(
      "Pinned pre-live Solana production-gate report is invalid JSON.",
    );
  }
  return { path: resolved, sha256: actual, report };
};

const readPinnedPreLiveSnapshotJson = async (snapshot, id) => {
  const entry = snapshot?.inputs?.[id];
  if (!entry?.present) return null;
  const bytes = await readStableRegularFile(entry.path, {
    label: `Pinned Solana live-video prerequisite ${id}`,
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (bytes.length !== entry.size || actual !== entry.sha256) {
    throw new Error(
      `Pinned Solana live-video prerequisite ${id} changed after the production gate snapshot.`,
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(
      `Pinned Solana live-video prerequisite ${id} is invalid JSON.`,
    );
  }
};

const productionGateOptionsFromPreLiveSnapshot = ({ snapshot, outputDir }) => {
  const pathFor = (id) => snapshot.inputs[id].path;
  return {
    requirements: pathFor("requirements"),
    postDeployEvidence: pathFor("postDeployEvidence"),
    proverReadiness: pathFor("proverReadiness"),
    productionMaterialInventory: pathFor("productionMaterialInventory"),
    routeManifest: pathFor("routeManifest"),
    publishReadiness: pathFor("publishReadiness"),
    routePublishBlocked: pathFor("routePublishBlocked"),
    routePublicationRequest: pathFor("routePublicationRequest"),
    routePublicationRequestSha256:
      snapshot.inputs.routePublicationRequest.sha256,
    routeManagerAccess: pathFor("routeManagerAccess"),
    routeManagerAccessSha256: snapshot.inputs.routeManagerAccess.sha256,
    operatorHandoff: pathFor("operatorHandoff"),
    operatorHandoffSha256: snapshot.inputs.operatorHandoff.sha256,
    activationPackage: pathFor("activationPackage"),
    activationPackageSha256: snapshot.inputs.activationPackage.sha256,
    laneActivationRequest: pathFor("laneActivationRequest"),
    laneActivationRequestSha256: snapshot.inputs.laneActivationRequest.sha256,
    laneActivationProposal: pathFor("laneActivationProposal"),
    laneActivationProposalSha256: snapshot.inputs.laneActivationProposal.sha256,
    sourceMaterialHandoff: pathFor("sourceMaterialHandoff"),
    handoffVerification: pathFor("handoffVerification"),
    sourceBurnReadiness: pathFor("sourceBurnReadiness"),
    sourceBurnSubmission: pathFor("sourceBurnSubmission"),
    proofMaterialRequest: pathFor("proofMaterialRequest"),
    proofMaterialBundle: pathFor("proofMaterialBundle"),
    proofMaterialCeremonyPackage: pathFor("proofMaterialCeremonyPackage"),
    smokeReadiness: pathFor("smokeReadiness"),
    deploymentVideoTranscript: pathFor("deploymentVideoTranscript"),
    deploymentVideoMp4: pathFor("deploymentVideoMp4"),
    deploymentVideoVtt: pathFor("deploymentVideoVtt"),
    liveVideoTranscript: path.join(outputDir, "sccp-solana-live-video.json"),
    liveVideoMp4: path.join(outputDir, "sccp-solana-live-video.mp4"),
    liveVideoVtt: path.join(outputDir, "sccp-solana-live-video.vtt"),
    expectedPreLiveInputSnapshotSha256: snapshot.preLiveInputSnapshotSha256,
  };
};

const readArray = (record, key) =>
  isRecord(record) && Array.isArray(record[key]) ? record[key] : [];

const readBoolean = (record, key) =>
  isRecord(record) && typeof record[key] === "boolean" ? record[key] : null;

const readStringValue = (record, key) =>
  isRecord(record) && typeof record[key] === "string" && record[key].trim()
    ? record[key].trim()
    : null;

const readNestedRecord = (record, key) =>
  isRecord(record) && isRecord(record[key]) ? record[key] : null;

const blockerIds = (report) =>
  readArray(report, "blockers")
    .map((blocker) => readStringValue(blocker, "id"))
    .filter(Boolean);

const mixedBlockerIds = (record, key = "blockers") =>
  readArray(record, key)
    .map((blocker) => {
      if (typeof blocker === "string" && blocker.trim()) {
        return blocker.trim();
      }
      return readStringValue(blocker, "id");
    })
    .filter(Boolean);

const stringIds = (record, key) =>
  readArray(record, key)
    .map((value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    )
    .filter(Boolean);

const actionIds = (record, key) =>
  readArray(record, key)
    .map((action) => {
      if (typeof action === "string" && action.trim()) {
        return action.trim();
      }
      return readStringValue(action, "id");
    })
    .filter(Boolean);

const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

const normalizeActionDetail = (action, source, prefix = "") => {
  if (!isRecord(action)) {
    return null;
  }
  const id = readStringValue(action, "id");
  if (!id) {
    return null;
  }
  const command = readArray(action, "command");
  const commands = readArray(action, "commands");
  return {
    id: prefix ? `${prefix}:${id}` : id,
    originalId: id,
    title: readStringValue(action, "title") || id,
    detail: readStringValue(action, "detail"),
    source: readStringValue(action, "source") || source,
    blockedBy: readArray(action, "blockedBy")
      .map((blocker) => {
        if (typeof blocker === "string" && blocker.trim()) {
          return { id: blocker.trim(), detail: null };
        }
        return {
          id: readStringValue(blocker, "id"),
          detail: readStringValue(blocker, "detail"),
        };
      })
      .filter((blocker) => blocker.id),
    command: command.length > 0 ? command : commands,
    requiredInputs: readArray(action, "requiredInputs")
      .map((input) => {
        if (typeof input === "string" && input.trim()) {
          return input.trim();
        }
        return readStringValue(input, "id");
      })
      .filter(Boolean),
  };
};

const actionDetails = (record, source, prefix = "") => [
  ...readArray(record, "nextActionDetails")
    .map((action) => normalizeActionDetail(action, source, prefix))
    .filter(Boolean),
  ...readArray(record, "nextActions")
    .map((action) => normalizeActionDetail(action, source, prefix))
    .filter(Boolean),
];

const uniqueActionDetails = (actions) => {
  const byId = new Map();
  for (const action of actions.filter(Boolean)) {
    if (!byId.has(action.id)) {
      byId.set(action.id, action);
    }
  }
  return [...byId.values()];
};

const sha256Hex = (value) =>
  `0x${createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")}`;

const cueTextHash = (cueTexts) => sha256Hex(cueTexts.join("\n"));

const parseWebVttCues = (webvtt) => {
  const blocks = String(webvtt ?? "")
    .trim()
    .split(/\n\s*\n/u)
    .filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }
    const [start, end] = timingLine
      .split(/\s+-->\s+/u)
      .map((part) => part.trim());
    const text = lines.slice(lines.indexOf(timingLine) + 1).join(" ");
    cues.push({
      index: cues.length + 1,
      start,
      end,
      text,
      step: Number(text.match(/^Step\s+(\d+):/u)?.[1] ?? 0) || null,
    });
  }
  return cues;
};

const summarizeSubtitleCues = (subtitleCues) => {
  const cueTexts = subtitleCues.map((cue) => cue.text);
  return {
    cueCount: subtitleCues.length,
    numberedStepCount: new Set(
      subtitleCues
        .map((cue) => cue.step)
        .filter((step) => Number.isSafeInteger(step) && step > 0),
    ).size,
    cueTextSha256: cueTextHash(cueTexts),
  };
};

const renderSolanaLiveVideoMp4 = ({
  subtitlesPath,
  videoPath,
  durationSeconds,
  subtitleSummary,
}) => {
  if (!commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required to render the Solana SCCP MP4.");
  }
  const temporaryVideoPath = path.join(
    path.dirname(videoPath),
    `.${path.basename(videoPath)}.${process.pid}.${randomUUID()}.tmp.mp4`,
  );
  try {
    const ffmpeg = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x111827:s=1280x720:r=30:d=${durationSeconds}`,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-i",
        subtitlesPath,
        "-shortest",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map",
        "2:s:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-c:s",
        "mov_text",
        temporaryVideoPath,
      ],
      { encoding: "utf8" },
    );
    if (ffmpeg.status !== 0) {
      throw new Error(
        `ffmpeg failed to render Solana SCCP MP4: ${ffmpeg.stderr || ffmpeg.stdout}`,
      );
    }
    if (!commandExists("ffprobe")) {
      throw new Error("ffprobe is required to verify the Solana SCCP MP4.");
    }
    const ffprobe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_name,codec_type,width,height",
        "-of",
        "json",
        temporaryVideoPath,
      ],
      { encoding: "utf8" },
    );
    if (ffprobe.status !== 0) {
      throw new Error(
        `ffprobe failed to verify Solana SCCP MP4: ${ffprobe.stderr || ffprobe.stdout}`,
      );
    }
    let mediaProbe = null;
    try {
      mediaProbe = JSON.parse(ffprobe.stdout);
    } catch (error) {
      throw new Error(
        `ffprobe returned invalid Solana SCCP MP4 JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const mediaVerification = buildSolanaLiveVideoMediaVerification({
      ffprobe: mediaProbe,
      subtitleSummary,
    });
    if (mediaVerification.ready !== true) {
      throw new Error(
        `Solana SCCP MP4 verification failed: ${mediaVerification.blockers.join(", ")}`,
      );
    }
    commitGeneratedFileSync(temporaryVideoPath, videoPath);
    return mediaVerification;
  } catch (error) {
    removeGeneratedFileSync(temporaryVideoPath);
    throw error;
  }
};

const failedCheckSummaries = (report) =>
  readArray(report, "checks")
    .filter((check) => check?.status !== "pass")
    .map((check) => ({
      id: readStringValue(check, "id"),
      status: readStringValue(check, "status"),
      detail: readStringValue(check, "detail"),
    }))
    .filter((check) => check.id);

const failedStatusSummaries = (report) =>
  readArray(report, "statuses")
    .filter((status) => status?.status !== "pass")
    .map((status) => ({
      id: readStringValue(status, "id"),
      status: readStringValue(status, "status"),
      detail: readStringValue(status, "detail"),
    }))
    .filter((status) => status.id);

const checkById = (report, id) =>
  readArray(report, "checks").find(
    (check) => readStringValue(check, "id") === id,
  ) ?? null;

const buildReportReference = (report, reportPath) => ({
  path: reportPath ? path.resolve(reportPath) : null,
  present: isRecord(report),
});

const firstBoolean = (...values) =>
  values.find((value) => typeof value === "boolean");

const summarizeArtifactReady = (artifact) =>
  firstBoolean(
    readBoolean(artifact, "ready"),
    readBoolean(artifact, "readyForRouteManagerReview"),
    readBoolean(artifact, "readyForOperatorReview"),
    readBoolean(artifact, "readyForLaneGovernanceReview"),
    readBoolean(artifact, "readyForProofMaterialCeremony"),
    readBoolean(artifact, "readyForActivationReview"),
    readBoolean(artifact, "readyToBuildIsi"),
    readBoolean(artifact, "readyToPublish"),
    readBoolean(artifact, "accessReady"),
    readBoolean(artifact, "readyToSubmitWithCurrentRuntime"),
    readBoolean(artifact, "productionActivationReady"),
    readBoolean(artifact, "productionRouteReady"),
    readBoolean(artifact, "productionLaneReady"),
    readBoolean(artifact, "productionProofMaterialReady"),
    readBoolean(artifact, "publicLaneReady"),
  ) ?? false;

const booleanStatus = (value) => value === true;

const normalizeReadinessArtifactStatus = (artifact) => {
  if (!isRecord(artifact)) {
    return artifact;
  }
  return {
    ...artifact,
    ready: summarizeArtifactReady(artifact),
    productionReady: booleanStatus(
      readBoolean(artifact, "productionReady") ??
        readBoolean(artifact, "productionRouteReady"),
    ),
    submitReady: booleanStatus(
      readBoolean(artifact, "submitReady") ??
        readBoolean(artifact, "readyToSubmitWithCurrentRuntime"),
    ),
    readyForLaneGovernanceReview:
      readBoolean(artifact, "readyForLaneGovernanceReview") === true,
    publicLaneReady: readBoolean(artifact, "publicLaneReady") === true,
    productionProofMaterialReady:
      readBoolean(artifact, "productionProofMaterialReady") === true,
    productionLaneReady: readBoolean(artifact, "productionLaneReady") === true,
  };
};

const summarizeReadinessArtifact = (artifact) =>
  isRecord(artifact)
    ? (() => {
        const status = normalizeReadinessArtifactStatus(artifact);
        const rootCauseBlockerIds = stringIds(artifact, "rootCauseBlockerIds");
        const missingProductionInputIds = stringIds(
          artifact,
          "missingProductionInputIds",
        );
        return {
          present: readBoolean(artifact, "present") ?? true,
          schema: readStringValue(artifact, "schema"),
          stableHash: readStringValue(artifact, "stableHash"),
          blockerIds:
            rootCauseBlockerIds.length > 0
              ? rootCauseBlockerIds
              : missingProductionInputIds.length > 0
                ? missingProductionInputIds
                : mixedBlockerIds(artifact, "blockerIds"),
          rootCauseBlockerIds,
          ready: status.ready,
          productionReady: status.productionReady,
          submitReady: status.submitReady,
          readyForLaneGovernanceReview: status.readyForLaneGovernanceReview,
          publicLaneReady: status.publicLaneReady,
          productionProofMaterialReady: status.productionProofMaterialReady,
          productionLaneReady: status.productionLaneReady,
          failedCheckIds: stringIds(artifact, "failedCheckIds"),
          missingProductionInputIds,
          nextActionIds: uniqueStrings([
            ...actionIds(artifact, "nextActionIds"),
            ...actionIds(artifact, "nextActions"),
          ]),
          nextActionDetails: actionDetails(artifact, "artifact"),
        };
      })()
    : null;

const normalizeDiagnosticArtifactGroup = (diagnostic) => {
  if (!isRecord(diagnostic)) {
    return diagnostic;
  }
  const artifacts = readNestedRecord(diagnostic, "artifacts");
  if (!isRecord(artifacts)) {
    return diagnostic;
  }
  return {
    ...diagnostic,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([key, artifact]) => [
        key,
        normalizeReadinessArtifactStatus(artifact),
      ]),
    ),
  };
};

const normalizeBlockedLiveVideoDiagnostics = (diagnostics = {}) => {
  if (!isRecord(diagnostics)) {
    return {};
  }
  const normalized = {
    ...diagnostics,
    activationPackage: normalizeDiagnosticArtifactGroup(
      diagnostics.activationPackage,
    ),
    operatorHandoff: normalizeDiagnosticArtifactGroup(
      diagnostics.operatorHandoff,
    ),
  };
  const activationSmokeReadiness =
    diagnostics.deploymentVideo?.activationSmokeReadiness;
  if (isRecord(diagnostics.deploymentVideo)) {
    normalized.deploymentVideo = {
      ...diagnostics.deploymentVideo,
      ...(isRecord(activationSmokeReadiness)
        ? {
            activationSmokeReadiness: normalizeReadinessArtifactStatus(
              activationSmokeReadiness,
            ),
          }
        : {}),
    };
  }
  return normalized;
};

const summarizeRequiredRouteManager = (record) =>
  isRecord(record)
    ? {
        authority: readStringValue(record, "authority"),
        authorityReady: readBoolean(record, "authorityReady"),
        authorityFormatReady: readBoolean(record, "authorityFormatReady"),
        requiredPermission: readStringValue(record, "requiredPermission"),
        hasRequiredPermission: readBoolean(record, "hasRequiredPermission"),
      }
    : null;

const summarizeRuntimeSigning = (record) =>
  isRecord(record)
    ? {
        privateKeyEnv: readStringValue(record, "privateKeyEnv"),
        privateKeyEnvPresent: readBoolean(record, "privateKeyEnvPresent"),
        privateKeyStoredInReport: readBoolean(
          record,
          "privateKeyStoredInReport",
        ),
      }
    : null;

export const buildSolanaLiveVideoBlockedDiagnostics = ({
  productionRequirementsReport = null,
  productionRequirementsPath = null,
  publishReadinessReport = null,
  publishReadinessPath = null,
  routePublicationRequestReport = null,
  routePublicationRequestPath = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  activationPackageReport = null,
  activationPackagePath = null,
  deploymentVideoTranscriptReport = null,
  deploymentVideoTranscriptPath = null,
  operatorHandoffReport = null,
  operatorHandoffPath = null,
  productionGateReport = null,
  productionGatePath = null,
} = {}) => {
  const publishEndpoint = readNestedRecord(
    publishReadinessReport,
    "publicEndpoint",
  );
  const publishTarget = readNestedRecord(publishEndpoint, "target");
  const publishRuntimeSigning = readNestedRecord(
    publishReadinessReport,
    "runtimeSigning",
  );
  const routePublicationManifest = readNestedRecord(
    routePublicationRequestReport,
    "manifest",
  );
  const routePublicationProofBundle = readNestedRecord(
    routePublicationRequestReport,
    "proofMaterialBundle",
  );
  const activationPublicTaira = readNestedRecord(
    activationPackageReport,
    "publicTaira",
  );
  const activationPublicSolanaLane = readNestedRecord(
    activationPublicTaira,
    "publicSolanaLane",
  );
  const activationArtifacts = readNestedRecord(
    activationPackageReport,
    "artifacts",
  );
  const deploymentVideoDeployment = readNestedRecord(
    deploymentVideoTranscriptReport,
    "deployment",
  );
  const deploymentVideoActivationPackage = readNestedRecord(
    deploymentVideoDeployment,
    "activationPackage",
  );
  const operatorArtifacts = readNestedRecord(
    operatorHandoffReport,
    "artifacts",
  );
  const smokeFailedChecks = failedCheckSummaries(smokeReadinessReport);
  const smokeReportBlockerIds = mixedBlockerIds(
    smokeReadinessReport,
    "blockerIds",
  );
  const smokeRootCauseBlockerIds = stringIds(
    smokeReadinessReport,
    "rootCauseBlockerIds",
  );
  const smokeMissingProductionInputIds = mixedBlockerIds(
    smokeReadinessReport,
    "missingProductionInputs",
  );
  const smokeRunbookCheck = checkById(
    smokeReadinessReport,
    "smoke-readiness-runbook-contract",
  );
  return {
    productionRequirements: {
      ...buildReportReference(
        productionRequirementsReport,
        productionRequirementsPath,
      ),
      readyToBuildIsi: readBoolean(
        productionRequirementsReport,
        "readyToBuildIsi",
      ),
      readyToSubmitWithCurrentRuntime: readBoolean(
        productionRequirementsReport,
        "readyToSubmitWithCurrentRuntime",
      ),
      blockerIds: blockerIds(productionRequirementsReport),
    },
    publishReadiness: {
      ...buildReportReference(publishReadinessReport, publishReadinessPath),
      toriiUrl: readStringValue(publishEndpoint, "toriiUrl"),
      mcpUrl: readStringValue(publishEndpoint, "mcpUrl"),
      publicationTargetReady: readBoolean(
        publishEndpoint,
        "publicationTargetReady",
      ),
      directPublicNodePublicationReady: readBoolean(
        publishEndpoint,
        "directPublicNodePublicationReady",
      ),
      target: publishTarget
        ? {
            toriiUrl: readStringValue(publishTarget, "toriiUrl"),
            mcpUrl: readStringValue(publishTarget, "mcpUrl"),
            targetKind: readStringValue(publishTarget, "targetKind"),
            canonicalPublicNodeRoot: readBoolean(
              publishTarget,
              "canonicalPublicNodeRoot",
            ),
            canonicalRolloutTargetReady: readBoolean(
              publishTarget,
              "canonicalRolloutTargetReady",
            ),
            mcpMatchesToriiRoot: readBoolean(
              publishTarget,
              "mcpMatchesToriiRoot",
            ),
          }
        : null,
      readyForRuntimeSigner: readBoolean(
        publishReadinessReport,
        "readyForRuntimeSigner",
      ),
      readyToSubmitWithCurrentRuntime: readBoolean(
        publishReadinessReport,
        "readyToSubmitWithCurrentRuntime",
      ),
      endpointReady: readBoolean(publishEndpoint, "endpointReady"),
      preflightReady: readBoolean(publishEndpoint, "preflightReady"),
      mcpTransactionToolsReady: readBoolean(
        readNestedRecord(publishEndpoint, "mcpTransactionTools"),
        "ready",
      ),
      mcpTransactionTools: readNestedRecord(
        publishEndpoint,
        "mcpTransactionTools",
      ),
      authorityReady: readBoolean(publishRuntimeSigning, "authorityReady"),
      authorityPermissionReady: readBoolean(
        readNestedRecord(publishRuntimeSigning, "permissionAudit"),
        "ready",
      ),
      permissionAudit: readNestedRecord(
        publishRuntimeSigning,
        "permissionAudit",
      ),
      privateKeyEnvPresent: readBoolean(
        publishRuntimeSigning,
        "privateKeyEnvPresent",
      ),
      blockerIds: blockerIds(publishReadinessReport),
    },
    routePublicationRequest: {
      ...buildReportReference(
        routePublicationRequestReport,
        routePublicationRequestPath,
      ),
      readyForRouteManagerReview: readBoolean(
        routePublicationRequestReport,
        "readyForRouteManagerReview",
      ),
      productionRouteReady: readBoolean(
        routePublicationRequestReport,
        "productionRouteReady",
      ),
      readyToSubmitWithCurrentRuntime: readBoolean(
        routePublicationRequestReport,
        "readyToSubmitWithCurrentRuntime",
      ),
      reviewPackageHash: readStringValue(
        routePublicationRequestReport,
        "reviewPackageHash",
      ),
      manifest: routePublicationManifest
        ? {
            routeIdentityReady: readBoolean(
              routePublicationManifest,
              "routeIdentityReady",
            ),
            productionReadyForIsi: readBoolean(
              routePublicationManifest,
              "productionReadyForIsi",
            ),
            manifestSha256: readStringValue(
              routePublicationManifest,
              "manifestSha256",
            ),
            error: readStringValue(routePublicationManifest, "error"),
          }
        : null,
      proofMaterialBundle: routePublicationProofBundle
        ? {
            readyForProofMaterialCeremony: readBoolean(
              routePublicationProofBundle,
              "readyForProofMaterialCeremony",
            ),
            bundleManifestSha256: readStringValue(
              routePublicationProofBundle,
              "bundleManifestSha256",
            ),
            includedArtifactCount:
              routePublicationProofBundle.includedArtifactCount ?? null,
          }
        : null,
      blockerIds: blockerIds(routePublicationRequestReport),
      upstreamBlockerIds: stringIds(
        routePublicationRequestReport,
        "upstreamBlockerIds",
      ),
    },
    smokeReadiness: {
      ...buildReportReference(smokeReadinessReport, smokeReadinessPath),
      ready: readBoolean(smokeReadinessReport, "ready"),
      blockerIds: uniqueStrings(
        smokeRootCauseBlockerIds.length > 0
          ? smokeRootCauseBlockerIds
          : smokeMissingProductionInputIds.length > 0
            ? smokeMissingProductionInputIds
            : smokeReportBlockerIds.length > 0
              ? smokeReportBlockerIds
              : smokeFailedChecks.map((check) => check.id),
      ),
      rootCauseBlockerIds: smokeRootCauseBlockerIds,
      failedChecks: smokeFailedChecks,
      runbookReady: smokeRunbookCheck?.status === "pass",
      runbookDetail: readStringValue(smokeRunbookCheck, "detail"),
      runbookProblems: readArray(
        readNestedRecord(smokeRunbookCheck, "evidence"),
        "problems",
      ).filter((problem) => typeof problem === "string" && problem.trim()),
      nextActionIds: actionIds(smokeReadinessReport, "nextActions"),
      nextActionDetails: actionDetails(smokeReadinessReport, "smoke-readiness"),
      missingProductionInputIds: smokeMissingProductionInputIds,
    },
    sourceMaterialHandoffVerification: {
      ...buildReportReference(
        handoffVerificationReport,
        handoffVerificationPath,
      ),
      ready: readBoolean(handoffVerificationReport, "ready"),
      statusCount: readArray(handoffVerificationReport, "statuses").length,
      failedStatuses: failedStatusSummaries(handoffVerificationReport),
      blockerIds: blockerIds(handoffVerificationReport),
    },
    proofMaterialBundle: {
      ...buildReportReference(
        proofMaterialBundleReport,
        proofMaterialBundlePath,
      ),
      readyForProofMaterialCeremony: readBoolean(
        proofMaterialBundleReport,
        "readyForProofMaterialCeremony",
      ),
      productionRouteReady: readBoolean(
        proofMaterialBundleReport,
        "productionRouteReady",
      ),
      readyToSubmitWithCurrentRuntime: readBoolean(
        proofMaterialBundleReport,
        "readyToSubmitWithCurrentRuntime",
      ),
      productionProofMaterialIncluded: readBoolean(
        proofMaterialBundleReport,
        "productionProofMaterialIncluded",
      ),
      bundleManifestSha256: readStringValue(
        proofMaterialBundleReport,
        "bundleManifestSha256",
      ),
      includedArtifactCount: isRecord(proofMaterialBundleReport)
        ? (proofMaterialBundleReport.includedArtifactCount ?? null)
        : null,
      blockerIds: blockerIds(proofMaterialBundleReport),
      upstreamBlockerIds: stringIds(
        proofMaterialBundleReport,
        "upstreamBlockerIds",
      ),
    },
    activationPackage: {
      ...buildReportReference(activationPackageReport, activationPackagePath),
      readyForActivationReview: readBoolean(
        activationPackageReport,
        "readyForActivationReview",
      ),
      productionActivationReady: readBoolean(
        activationPackageReport,
        "productionActivationReady",
      ),
      readyToSubmitWithCurrentRuntime: readBoolean(
        activationPackageReport,
        "readyToSubmitWithCurrentRuntime",
      ),
      publicRouteAlreadyPublished: readBoolean(
        activationPackageReport,
        "publicRouteAlreadyPublished",
      ),
      activationPackageHash: readStringValue(
        activationPackageReport,
        "activationPackageHash",
      ),
      requiredRouteManager: summarizeRequiredRouteManager(
        readNestedRecord(activationPackageReport, "requiredRouteManager"),
      ),
      runtimeSigning: summarizeRuntimeSigning(
        readNestedRecord(activationPackageReport, "runtimeSigning"),
      ),
      publicTairaReady: readBoolean(activationPublicTaira, "ready"),
      publicSolanaLane: isRecord(activationPublicSolanaLane)
        ? {
            present: readBoolean(activationPublicSolanaLane, "present"),
            ready: readBoolean(activationPublicSolanaLane, "ready"),
            check: readNestedRecord(activationPublicSolanaLane, "check"),
            blockerIds: mixedBlockerIds(
              activationPublicSolanaLane,
              "blockerIds",
            ),
          }
        : null,
      artifacts: {
        proofMaterialBundle: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "proofMaterialBundle"),
        ),
        routePublicationRequest: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "routePublicationRequest"),
        ),
        routeManagerAccessRequest: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "routeManagerAccessRequest"),
        ),
        laneActivationRequest: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "laneActivationRequest"),
        ),
        publishReadiness: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "publishReadiness"),
        ),
        productionRequirements: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "productionRequirements"),
        ),
        operatorHandoff: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "operatorHandoff"),
        ),
        smokeReadiness: summarizeReadinessArtifact(
          readNestedRecord(activationArtifacts, "smokeReadiness"),
        ),
      },
      blockerIds: blockerIds(activationPackageReport),
      nextActionIds: actionIds(activationPackageReport, "nextActions"),
      nextActionDetails: actionDetails(
        activationPackageReport,
        "activation-package",
      ),
    },
    deploymentVideo: {
      ...buildReportReference(
        deploymentVideoTranscriptReport,
        deploymentVideoTranscriptPath,
      ),
      ready: readBoolean(deploymentVideoTranscriptReport, "ready"),
      checkedAt: readStringValue(deploymentVideoTranscriptReport, "checkedAt"),
      routeId: readStringValue(deploymentVideoTranscriptReport, "routeId"),
      activationPackageHash: readStringValue(
        deploymentVideoActivationPackage,
        "activationPackageHash",
      ),
      activationSmokeReadiness: summarizeReadinessArtifact(
        readNestedRecord(deploymentVideoActivationPackage, "smokeReadiness"),
      ),
      videoArtifacts: readArray(
        deploymentVideoTranscriptReport,
        "videoArtifacts",
      )
        .map((artifact) => ({
          path: readStringValue(artifact, "path"),
          mediaType: readStringValue(artifact, "mediaType"),
        }))
        .filter((artifact) => artifact.path && artifact.mediaType),
    },
    operatorHandoff: {
      ...buildReportReference(operatorHandoffReport, operatorHandoffPath),
      readyForOperatorReview: readBoolean(
        operatorHandoffReport,
        "readyForOperatorReview",
      ),
      productionRouteReady: readBoolean(
        operatorHandoffReport,
        "productionRouteReady",
      ),
      readyToPublish: readBoolean(operatorHandoffReport, "readyToPublish"),
      publicRouteAlreadyPublished: readBoolean(
        operatorHandoffReport,
        "publicRouteAlreadyPublished",
      ),
      handoffHash: readStringValue(operatorHandoffReport, "handoffHash"),
      requiredRouteManager: summarizeRequiredRouteManager(
        readNestedRecord(operatorHandoffReport, "requiredRouteManager"),
      ),
      runtimeSigning: summarizeRuntimeSigning(
        readNestedRecord(operatorHandoffReport, "runtimeSigning"),
      ),
      artifacts: {
        proofMaterialBundle: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "proofMaterialBundle"),
        ),
        routePublicationRequest: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "routePublicationRequest"),
        ),
        routeManagerAccessRequest: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "routeManagerAccessRequest"),
        ),
        laneActivationRequest: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "laneActivationRequest"),
        ),
        publishReadiness: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "publishReadiness"),
        ),
        productionRequirements: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "productionRequirements"),
        ),
        smokeReadiness: summarizeReadinessArtifact(
          readNestedRecord(operatorArtifacts, "smokeReadiness"),
        ),
      },
      blockerIds: blockerIds(operatorHandoffReport),
      nextActionIds: actionIds(operatorHandoffReport, "nextActions"),
      nextActionDetails: actionDetails(
        operatorHandoffReport,
        "operator-handoff",
      ),
    },
    productionGate: {
      ...buildReportReference(productionGateReport, productionGatePath),
      ready: readBoolean(productionGateReport, "ready"),
      checkedAt: readStringValue(productionGateReport, "checkedAt"),
      failedChecks: failedCheckSummaries(productionGateReport),
      nextRequiredActions: stringIds(
        productionGateReport,
        "nextRequiredActions",
      ),
      nextActionIds: actionIds(productionGateReport, "nextActionDetails"),
      nextActionDetails: actionDetails(productionGateReport, "production-gate"),
    },
  };
};

const successProblem = (id, detail) => ({ id, detail });

export const buildSolanaLiveVideoSuccessEvidencePolicy = ({
  options = {},
  diagnostics = {},
  freshPreflightCompleted = false,
  freshProductionGateCompleted = false,
} = {}) => {
  const publicationTarget = diagnostics.publishReadiness?.target;
  const governancePinnedToriiUrl =
    publicationTarget?.toriiUrl ?? diagnostics.publishReadiness?.toriiUrl;
  const normalizedGovernanceToriiUrl = String(
    governancePinnedToriiUrl ?? "",
  ).replace(/\/+$/u, "");
  const governancePinReady =
    diagnostics.publishReadiness?.publicationTargetReady === true &&
    diagnostics.publishReadiness?.directPublicNodePublicationReady === true &&
    String(diagnostics.publishReadiness?.toriiUrl ?? "").replace(
      /\/+$/u,
      "",
    ) === normalizedGovernanceToriiUrl &&
    publicationTarget?.targetKind === "explicit-taira-public-node" &&
    String(publicationTarget?.mcpUrl ?? "").replace(/\/+$/u, "") ===
      `${normalizedGovernanceToriiUrl}/v1/mcp` &&
    String(diagnostics.publishReadiness?.mcpUrl ?? "").replace(/\/+$/u, "") ===
      `${normalizedGovernanceToriiUrl}/v1/mcp` &&
    publicationTarget?.canonicalPublicNodeRoot === true &&
    publicationTarget?.canonicalRolloutTargetReady === true &&
    publicationTarget?.mcpMatchesToriiRoot === true;
  const injectedReadbackOverride =
    ownDataValue(options, "readbacks") !== undefined ||
    ownDataValue(options, "fetchImpl") !== undefined;
  const callerTrustedChainOverride =
    ownDataValue(options, "trustedGeneratedChain") !== undefined;
  const callerProductionGateOptionsOverride =
    ownDataValue(options, "productionGateOptions") !== undefined;
  const productionGateSnapshotReady =
    hasSuppliedPathOption(options, "productionGateSnapshot") &&
    /^0x[0-9a-f]{64}$/u.test(
      String(
        ownDataValue(options, "productionGateSnapshotSha256") ?? "",
      ).toLowerCase(),
    );
  const base = buildSccpSolanaSuccessNetworkPolicy({
    toriiUrl: ownDataValue(options, "toriiUrl"),
    solanaRpcUrl:
      ownDataValue(options, "solanaRpcUrl") || DEFAULT_SOLANA_TESTNET_RPC_URL,
    skipSolanaRpc: ownDataValue(options, "skipSolanaRpc"),
    preflightReportOverride: hasSuppliedPathOption(options, "preflightReport"),
    prerequisiteReportOverrideIds: successPrerequisiteOverrideIds(options),
    injectedReadbackOverride,
    requireGovernancePin: true,
    governancePinnedToriiUrl,
    governancePinReady,
  });
  const problems = [...base.problems];
  if (callerTrustedChainOverride) {
    problems.push(
      successProblem(
        "caller-trusted-generated-chain",
        "Success evidence cannot accept a caller-declared trusted generated-report chain.",
      ),
    );
  }
  if (callerProductionGateOptionsOverride) {
    problems.push(
      successProblem(
        "caller-production-gate-options",
        "Success evidence cannot accept caller-supplied production-gate path options.",
      ),
    );
  }
  if (!productionGateSnapshotReady) {
    problems.push(
      successProblem(
        "pinned-production-gate-snapshot",
        "Success evidence requires one exact-byte-pinned pre-live production-gate snapshot.",
      ),
    );
  }
  if (!freshPreflightCompleted) {
    problems.push(
      successProblem(
        "fresh-public-preflight-completed",
        "Success evidence requires a newly executed public route preflight in this process.",
      ),
    );
  }
  if (!freshProductionGateCompleted) {
    problems.push(
      successProblem(
        "fresh-production-gate-completed",
        "Success evidence requires a newly recomputed production gate in this process.",
      ),
    );
  }
  return {
    ...base,
    schema: "iroha-demo-sccp-solana-live-video-success-policy/v1",
    mode: "canonical-fresh-read-only-v1",
    ready: problems.length === 0,
    diagnosticOnly: problems.length > 0,
    freshPreflightCompleted,
    freshProductionGateCompleted,
    nativeNetworkClientsUsed: !injectedReadbackOverride,
    productionGateSnapshotReady,
    problems,
  };
};

export const solanaLiveVideoSuccessPrerequisiteProblems = ({
  diagnostics = {},
} = {}) => {
  const problems = [];
  const requireReady = (id, ready, detail) => {
    if (ready !== true) {
      problems.push(successProblem(id, detail));
    }
  };

  requireReady(
    "production-requirements-ready",
    diagnostics.productionRequirements?.readyToBuildIsi,
    "Production requirements must be ready before recording the live bidirectional video.",
  );
  requireReady(
    "publish-readiness-submit-ready",
    diagnostics.publishReadiness?.readyToSubmitWithCurrentRuntime,
    "Route publish-readiness must be submit-ready before recording the live bidirectional video.",
  );
  requireReady(
    "route-publication-request-submit-ready",
    diagnostics.routePublicationRequest?.readyToSubmitWithCurrentRuntime,
    "The route-publication request must be submit-ready before recording the live bidirectional video.",
  );
  requireReady(
    "route-publication-request-production-ready",
    diagnostics.routePublicationRequest?.productionRouteReady,
    "The route-publication request must be production-ready before recording the live bidirectional video.",
  );
  requireReady(
    "source-material-handoff-verified",
    diagnostics.sourceMaterialHandoffVerification?.ready,
    "Source-material handoff verification must pass before recording the live bidirectional video.",
  );
  requireReady(
    "proof-material-bundle-production-ready",
    diagnostics.proofMaterialBundle?.productionRouteReady,
    "The proof-material bundle must be production-ready before recording the live bidirectional video.",
  );
  requireReady(
    "proof-material-bundle-submit-ready",
    diagnostics.proofMaterialBundle?.readyToSubmitWithCurrentRuntime,
    "The proof-material bundle must be submit-ready before recording the live bidirectional video.",
  );
  requireReady(
    "proof-material-included",
    diagnostics.proofMaterialBundle?.productionProofMaterialIncluded,
    "Governed production proof material must be included before recording the live bidirectional video.",
  );
  requireReady(
    "activation-package-submit-ready",
    diagnostics.activationPackage?.readyToSubmitWithCurrentRuntime,
    "The TAIRA activation package must be runtime-submit-ready before recording the live bidirectional video.",
  );
  requireReady(
    "activation-public-solana-lane-ready",
    diagnostics.activationPackage?.publicSolanaLane?.ready,
    "The activation package must prove the public Solana lane is ready before recording the live bidirectional video.",
  );
  requireReady(
    "operator-handoff-publish-ready",
    diagnostics.operatorHandoff?.readyToPublish,
    "The operator handoff must be publish-ready before recording the live bidirectional video.",
  );
  requireReady(
    "smoke-readiness-ready",
    diagnostics.smokeReadiness?.ready,
    "Solana app smoke-readiness must pass before recording the live bidirectional video.",
  );
  requireReady(
    "smoke-readiness-runbook-contract",
    diagnostics.smokeReadiness?.runbookReady,
    "Solana smoke-readiness must expose a passing runbook contract before recording the live bidirectional video.",
  );

  const gate = diagnostics.productionGate;
  if (gate?.present !== true) {
    problems.push(
      successProblem(
        "production-gate-present",
        "A production-gate report is required before recording the live bidirectional video.",
      ),
    );
  } else {
    const nonVideoFailures = Array.isArray(gate.failedChecks)
      ? gate.failedChecks
          .map((check) => readStringValue(check, "id"))
          .filter((id) => id && id !== "live-bidirectional-video")
      : [];
    if (gate.ready !== true && nonVideoFailures.length > 0) {
      problems.push(
        successProblem(
          "production-gate-non-video-checks",
          `Production gate must have no non-video failures before recording the live bidirectional video: ${nonVideoFailures.join(", ")}.`,
        ),
      );
    }
    if (gate.ready !== true && nonVideoFailures.length === 0) {
      const failedIds = Array.isArray(gate.failedChecks)
        ? gate.failedChecks.map((check) => readStringValue(check, "id"))
        : [];
      if (!failedIds.includes("live-bidirectional-video")) {
        problems.push(
          successProblem(
            "production-gate-live-video-pending",
            "Production gate must either be ready or be blocked only by live-bidirectional-video.",
          ),
        );
      }
    }
  }

  return problems;
};

export const buildBlockedSolanaLiveVideoTranscript = ({
  preflightReport,
  reason,
  diagnostics = {},
  successPrerequisiteProblems = [],
  checkedAt = new Date().toISOString(),
}) => {
  const failedPreflightChecks = failedCheckSummaries(preflightReport);
  const normalizedDiagnostics =
    normalizeBlockedLiveVideoDiagnostics(diagnostics);
  const diagnosticBlockerIds = [
    ...(normalizedDiagnostics.productionRequirements?.blockerIds ?? []),
    ...(normalizedDiagnostics.publishReadiness?.blockerIds ?? []),
    ...(normalizedDiagnostics.routePublicationRequest?.blockerIds ?? []),
    ...(normalizedDiagnostics.smokeReadiness?.blockerIds ?? []),
    ...(normalizedDiagnostics.sourceMaterialHandoffVerification?.blockerIds ??
      []),
    ...(normalizedDiagnostics.proofMaterialBundle?.blockerIds ?? []),
    ...(normalizedDiagnostics.activationPackage?.blockerIds ?? []),
    ...(normalizedDiagnostics.operatorHandoff?.blockerIds ?? []),
    ...(normalizedDiagnostics.productionGate?.failedChecks ?? []).map(
      (check) => `production-gate:${check.id}`,
    ),
    ...successPrerequisiteProblems.map(
      (problem) => `success-prerequisite:${problem.id}`,
    ),
  ].filter(Boolean);
  const blockerIds = uniqueStrings([
    ...failedPreflightChecks.map((check) => `preflight:${check.id}`),
    ...diagnosticBlockerIds,
  ]);
  const prefixedDetails = (details, prefix, source) =>
    Array.isArray(details)
      ? details
          .map((action) => normalizeActionDetail(action, source, prefix))
          .filter(Boolean)
      : [];
  const nextActionDetails = uniqueActionDetails([
    ...prefixedDetails(
      normalizedDiagnostics.smokeReadiness?.nextActionDetails,
      "smoke",
      "smoke-readiness",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.smokeReadiness?.nextActionIds,
      "smoke",
      "smoke-readiness",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.activationPackage?.artifacts?.smokeReadiness
        ?.nextActionDetails,
      "activation-smoke",
      "activation-package-smoke-readiness",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.activationPackage?.artifacts?.smokeReadiness
        ?.nextActionIds,
      "activation-smoke",
      "activation-package-smoke-readiness",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.activationPackage?.nextActionDetails,
      "activation",
      "activation-package",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.operatorHandoff?.nextActionDetails,
      "operator",
      "operator-handoff",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.operatorHandoff?.nextActionIds,
      "operator",
      "operator-handoff",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.productionGate?.nextActionDetails,
      "production-gate",
      "production-gate",
    ),
    ...prefixedDetails(
      normalizedDiagnostics.productionGate?.nextActionIds,
      "production-gate",
      "production-gate",
    ),
  ]);
  const nextActionIds = uniqueStrings([
    ...(normalizedDiagnostics.smokeReadiness?.nextActionIds ?? []).map(
      (id) => `smoke:${id}`,
    ),
    ...(
      normalizedDiagnostics.activationPackage?.artifacts?.smokeReadiness
        ?.nextActionIds ?? []
    ).map((id) => `activation-smoke:${id}`),
    ...(normalizedDiagnostics.operatorHandoff?.nextActionIds ?? []).map(
      (id) => `operator:${id}`,
    ),
    ...(normalizedDiagnostics.productionGate?.nextActionIds ?? []).map(
      (id) => `production-gate:${id}`,
    ),
    ...nextActionDetails.map((action) => action.id),
  ]);
  const failedCheckIds = uniqueStrings(
    failedPreflightChecks.map((check) => check.id),
  );
  return {
    schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
    ready: false,
    routeId: "taira_sol_xor",
    checkedAt,
    reason,
    preflightReady: preflightReport?.ready === true,
    failedCheckIds,
    failedChecks: failedPreflightChecks,
    checks: failedPreflightChecks,
    blockerIds,
    blockers: blockerIds.map((id) => ({
      id,
      detail:
        "See failedChecks and diagnostics for the live-video blocker evidence.",
    })),
    nextActionIds,
    nextActionDetails,
    publicSolanaCapability: isRecord(preflightReport?.publicSolanaCapability)
      ? preflightReport.publicSolanaCapability
      : null,
    publicSolanaLane: isRecord(preflightReport?.publicSolanaLane)
      ? preflightReport.publicSolanaLane
      : null,
    activationPackage: normalizedDiagnostics.activationPackage ?? null,
    deploymentVideo: normalizedDiagnostics.deploymentVideo ?? null,
    operatorHandoff: normalizedDiagnostics.operatorHandoff ?? null,
    productionGate: normalizedDiagnostics.productionGate ?? null,
    successPrerequisiteProblems,
    diagnostics: normalizedDiagnostics,
    requiredRealSteps: [
      "TAIRA public endpoint publishes a production-ready taira_sol_xor Solana testnet manifest.",
      "Solana testnet bridge/token/source/verifier programs and TAIRA burn-record material pass preflight.",
      "A connected Solana testnet wallet approves the destination finalize transaction.",
      "A real TAIRA -> Solana transfer and a real Solana -> TAIRA transfer complete with validated transaction links.",
    ],
    videoArtifacts: [],
  };
};

const diagnosticSubtitleLines = (diagnostics = {}) => {
  const handoff = diagnostics.sourceMaterialHandoffVerification;
  const proofBundle = diagnostics.proofMaterialBundle;
  const requirements = diagnostics.productionRequirements;
  const publishReadiness = diagnostics.publishReadiness;
  const routePublicationRequest = diagnostics.routePublicationRequest;
  const smokeReadiness = diagnostics.smokeReadiness;
  const activationPackage = diagnostics.activationPackage;
  const deploymentVideo = diagnostics.deploymentVideo;
  const operatorHandoff = diagnostics.operatorHandoff;
  const productionGate = diagnostics.productionGate;
  const handoffLine =
    handoff?.ready === true
      ? `Live Solana handoff verification passed ${handoff.statusCount} checks.`
      : "Live Solana handoff verification has not passed.";
  const proofBundleLine =
    proofBundle?.readyForProofMaterialCeremony === true
      ? `Proof-material bundle is hash-indexed with ${proofBundle.includedArtifactCount ?? "unknown"} files; ${proofBundle.bundleManifestSha256 ?? "hash unavailable"}.`
      : "Proof-material bundle is missing or not ready for the governed ceremony.";
  const requirementBlockers = Array.isArray(requirements?.blockerIds)
    ? requirements.blockerIds
    : [];
  const publishBlockers = Array.isArray(publishReadiness?.blockerIds)
    ? publishReadiness.blockerIds
    : [];
  const requirementLine = requirementBlockers.length
    ? `Production requirements still block: ${requirementBlockers.join(", ")}.`
    : "Production requirements report has no remaining blockers.";
  const publishLine = publishBlockers.length
    ? `Route publish readiness still blocks: ${publishBlockers.join(", ")}.`
    : "Route publish readiness has no remaining blockers.";
  const routePublicationLine =
    routePublicationRequest?.readyForRouteManagerReview === true
      ? `Route-publication request is ready for route-manager review; ${routePublicationRequest.reviewPackageHash ?? "hash unavailable"}.`
      : "Route-publication request is missing or not ready for route-manager review.";
  const smokeFailedChecks = Array.isArray(smokeReadiness?.failedChecks)
    ? smokeReadiness.failedChecks
    : [];
  const smokeBlockers = Array.isArray(smokeReadiness?.blockerIds)
    ? smokeReadiness.blockerIds
    : [];
  const smokeRunbookSuffix =
    smokeReadiness?.runbookReady === true
      ? "Runbook self-check passed."
      : "Runbook self-check has not passed.";
  const smokeLine =
    smokeReadiness?.ready === true
      ? "Solana app smoke-readiness has all WalletConnect and prover module prerequisites."
      : smokeBlockers.length
        ? `Solana app smoke-readiness still blocks: ${smokeBlockers.join(", ")}. ${smokeRunbookSuffix}`
        : smokeFailedChecks.length
          ? `Solana app smoke-readiness still blocks: ${smokeFailedChecks.map((check) => check.id).join(", ")}.`
          : "Solana app smoke-readiness has not passed.";
  const activationLine =
    activationPackage?.readyToSubmitWithCurrentRuntime === true
      ? `TAIRA activation package is runtime-submit-ready; ${activationPackage.activationPackageHash ?? "hash unavailable"}.`
      : activationPackage?.activationPackageHash
        ? `TAIRA activation package is not submit-ready; ${activationPackage.activationPackageHash}.`
        : "TAIRA activation package is missing or not submit-ready.";
  const deploymentVideoLine =
    deploymentVideo?.present === true
      ? `Deployment walkthrough MP4 evidence is present; activation package ${deploymentVideo.activationPackageHash ?? "hash unavailable"}.`
      : "Deployment walkthrough MP4 evidence is missing from blocked diagnostics.";
  const laneActivation =
    operatorHandoff?.artifacts?.laneActivationRequest ?? null;
  const handoffSmoke = operatorHandoff?.artifacts?.smokeReadiness ?? null;
  const operatorLine =
    operatorHandoff?.readyToPublish === true
      ? `Operator handoff is publish-ready; ${operatorHandoff.handoffHash ?? "hash unavailable"}.`
      : operatorHandoff?.handoffHash
        ? `Operator handoff is not publish-ready; lane activation production ready is ${laneActivation?.productionLaneReady === true}, smoke readiness is ${handoffSmoke?.ready === true}.`
        : "Operator handoff is missing or not publish-ready.";
  const gateFailedChecks = Array.isArray(productionGate?.failedChecks)
    ? productionGate.failedChecks
    : [];
  const productionGateLine =
    productionGate?.ready === true
      ? "Solana production gate passed."
      : gateFailedChecks.length
        ? `Solana production gate still fails: ${gateFailedChecks.map((check) => check.id).join(", ")}.`
        : "Solana production gate has not passed.";
  return {
    handoffLine,
    proofBundleLine,
    requirementLine,
    publishLine,
    routePublicationLine,
    smokeLine,
    activationLine,
    deploymentVideoLine,
    operatorLine,
    productionGateLine,
  };
};

const writeBlockedArtifacts = async ({
  outputDir,
  preflightReport,
  reason,
  diagnostics = {},
  successPrerequisiteProblems = [],
}) => {
  await ensureSafeOutputDirectory(outputDir);
  const transcript = buildBlockedSolanaLiveVideoTranscript({
    preflightReport,
    reason,
    diagnostics,
    successPrerequisiteProblems,
  });
  const {
    handoffLine,
    proofBundleLine,
    requirementLine,
    publishLine,
    routePublicationLine,
    smokeLine,
    activationLine,
    deploymentVideoLine,
    operatorLine,
    productionGateLine,
  } = diagnosticSubtitleLines(diagnostics);
  const subtitleText = `WEBVTT

00:00.000 --> 00:05.000
Step 1: Solana SCCP live video blocked before recording.

00:05.000 --> 00:10.000
Step 2: TAIRA preflight did not prove a production-ready taira_sol_xor Solana testnet route.

00:10.000 --> 00:16.000
Step 3: This MP4 is a blocked diagnostic only and is not live transfer evidence.

00:16.000 --> 00:22.000
Step 4: ${handoffLine}

00:22.000 --> 00:27.000
Step 5: ${proofBundleLine}

00:27.000 --> 00:32.000
Step 6: ${requirementLine}

00:32.000 --> 00:38.000
Step 7: ${publishLine}

00:38.000 --> 00:44.000
Step 8: ${routePublicationLine}

00:44.000 --> 00:50.000
Step 9: ${smokeLine}

00:50.000 --> 00:56.000
Step 10: ${activationLine}

00:56.000 --> 01:02.000
Step 11: ${deploymentVideoLine}

01:02.000 --> 01:08.000
Step 12: ${operatorLine}

01:08.000 --> 01:14.000
Step 13: ${productionGateLine}

01:14.000 --> 01:20.000
Step 14: Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.
`;
  const subtitleCues = parseWebVttCues(subtitleText);
  transcript.subtitleCues = subtitleCues;
  transcript.subtitleSummary = summarizeSubtitleCues(subtitleCues);
  transcript.diagnosticVideoOnly = true;
  transcript.notLiveTransferEvidence = true;
  const transcriptPath = path.join(
    outputDir,
    "sccp-solana-live-video-blocked.json",
  );
  const subtitlesPath = path.join(
    outputDir,
    "sccp-solana-live-video-blocked.vtt",
  );
  const videoPath = path.join(outputDir, "sccp-solana-live-video-blocked.mp4");
  await Promise.all(
    [transcriptPath, subtitlesPath, videoPath].map((file) =>
      assertSafeOutputDestination(file),
    ),
  );
  await writeAtomicFile(subtitlesPath, subtitleText);
  try {
    transcript.mediaVerification = renderSolanaLiveVideoMp4({
      subtitlesPath,
      videoPath,
      durationSeconds: 81,
      subtitleSummary: transcript.subtitleSummary,
    });
  } catch (error) {
    await rm(subtitlesPath, { force: true }).catch(() => {});
    throw error;
  }
  transcript.videoArtifacts = [
    {
      path: videoPath,
      mediaType: "video/mp4",
      diagnosticOnly: true,
      notLiveTransferEvidence: true,
    },
    { path: subtitlesPath, mediaType: "text/vtt" },
  ];
  await writeAtomicJsonFile(transcriptPath, transcript);
  return { transcriptPath, subtitlesPath, videoPath, report: transcript };
};

const readString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
};

const normalizeHex32 = (value, label) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^0x/iu, "")
    .toLowerCase();
  if (!HEX32.test(normalized)) {
    throw new Error(`${label} must be a 32-byte transaction/message hash.`);
  }
  return normalized;
};

const normalizeOptionalHash32 = (value, label) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  return `0x${normalizeHex32(raw, label)}`;
};

const normalizeRequiredHash32 = (value, label) => {
  const normalized = normalizeOptionalHash32(value, label);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const normalizeSolanaSignature = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!SOLANA_SIGNATURE.test(normalized)) {
    throw new Error(`${label} must be a Solana transaction signature.`);
  }
  const bytes = decodeBase58(normalized, label);
  if (bytes.length !== 64) {
    throw new Error(`${label} must decode to a 64-byte Solana signature.`);
  }
  return normalized;
};

const parseStrictHttpsUrl = (value, label) => {
  const normalized = String(value ?? "").trim();
  const url = new URL(normalized);
  if (url.protocol !== "https:") {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials.`);
  }
  if (url.hash) {
    throw new Error(`${label} must not include a URL fragment.`);
  }
  return url;
};

const normalizeSolanaExplorerUrl = (value, expectedSignature, label) => {
  const url = parseStrictHttpsUrl(value, label);
  if (url.hostname !== SOLANA_EXPLORER_HOST) {
    throw new Error(`${label} must use ${SOLANA_EXPLORER_HOST}.`);
  }
  if (url.pathname.replace(/\/+$/u, "") !== `/tx/${expectedSignature}`) {
    throw new Error(`${label} must use the /tx/${expectedSignature} path.`);
  }
  if (url.searchParams.get("cluster") !== "testnet") {
    throw new Error(`${label} must include cluster=testnet.`);
  }
  const allowedParams = [...url.searchParams.keys()].filter(
    (key) => key !== "cluster",
  );
  if (allowedParams.length > 0) {
    throw new Error(`${label} must not include extra query parameters.`);
  }
  return `https://${SOLANA_EXPLORER_HOST}/tx/${expectedSignature}?cluster=testnet`;
};

const normalizeTairaExplorerUrl = (value, expectedHash, label) => {
  const url = parseStrictHttpsUrl(value, label);
  if (url.hostname !== TAIRA_EXPLORER_HOST) {
    throw new Error(`${label} must use ${TAIRA_EXPLORER_HOST}.`);
  }
  if (url.search) {
    throw new Error(`${label} must not include query parameters.`);
  }
  const match = url.pathname
    .replace(/\/+$/u, "")
    .match(/^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu);
  if (!match || match[1].toLowerCase() !== expectedHash) {
    throw new Error(
      `${label} must use the /transactions/${expectedHash} path.`,
    );
  }
  return `https://${TAIRA_EXPLORER_HOST}/transactions/${expectedHash}`;
};

const normalizePositiveAmount = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(normalized)) {
    throw new Error(`${label} must be a positive decimal amount.`);
  }
  if (!/[1-9]/u.test(normalized.replace(".", ""))) {
    throw new Error(`${label} must be greater than zero.`);
  }
  const [, fraction = ""] = normalized.split(".");
  if (fraction.length > SCCP_SOLANA_TOKEN_DECIMALS) {
    throw new Error(
      `${label} must use at most ${SCCP_SOLANA_TOKEN_DECIMALS} decimal places.`,
    );
  }
  return normalized;
};

const decimalAmountToBaseUnits = (value, label) => {
  const normalized = normalizePositiveAmount(value, label);
  const [whole, fraction = ""] = normalized.split(".");
  const baseUnits = BigInt(
    `${whole}${fraction.padEnd(SCCP_SOLANA_TOKEN_DECIMALS, "0")}`,
  );
  if (baseUnits <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  if (baseUnits > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds the Solana u64 amount range.`);
  }
  return { amount: normalized, amountBaseUnits: baseUnits.toString() };
};

const normalizeLiveEvidenceAssetKey = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized !== SCCP_XOR_ASSET_KEY) {
    throw new Error(`live evidence assetKey must be ${SCCP_XOR_ASSET_KEY}.`);
  }
  return SCCP_XOR_ASSET_KEY;
};

export const buildSolanaLiveTransferEvidenceTemplate = ({
  checkedAt = new Date().toISOString(),
} = {}) => ({
  schema: "iroha-demo-sccp-solana-live-transfer-evidence-template/v1",
  templateOnly: true,
  routeId: SCCP_SOLANA_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  checkedAt,
  activationPackageHash:
    "<required 0x-prefixed hash from taira-solana-xor-activation-package.json>",
  operatorHandoffHash:
    "<required 0x-prefixed hash from taira-solana-xor-operator-handoff.json>",
  tairaToSolana: {
    amount: "<positive XOR amount finalized on Solana>",
    messageId: "<32-byte SCCP message id hex>",
    tairaSourceTx: "<32-byte TAIRA source transaction hash>",
    solanaTxId: "<Solana testnet finalize transaction signature>",
    solanaExplorerUrl:
      "https://explorer.solana.com/tx/<Solana testnet finalize transaction signature>?cluster=testnet",
  },
  solanaToTaira: {
    amount: "<positive XOR amount settled back on TAIRA>",
    messageId: "<32-byte SCCP message id hex>",
    solanaSourceTx: "<Solana testnet source burn transaction signature>",
    tairaSettlementTx: "<32-byte TAIRA settlement transaction hash>",
    tairaExplorerUrl:
      "https://taira-explorer.sora.org/transactions/<32-byte TAIRA settlement transaction hash>",
  },
  completionRequirements: [
    "replace every angle-bracket placeholder with live transaction evidence",
    "remove templateOnly or set it to false before using the file as --live-evidence",
    "change schema to iroha-demo-sccp-solana-live-transfer-evidence/v1",
    "keep TAIRA hashes and Solana signatures distinct across both directions",
    "use only explorer.solana.com testnet and taira-explorer.sora.org transaction URLs",
    "bind activationPackageHash and operatorHandoffHash to the exact reviewed production packages",
  ],
});

export const writeSolanaLiveTransferEvidenceTemplate = async (
  file,
  options = {},
) => {
  if (!file) {
    throw new Error("--write-live-evidence-template requires a path.");
  }
  const templatePath = path.resolve(file);
  await writeAtomicJsonFile(
    templatePath,
    buildSolanaLiveTransferEvidenceTemplate(options),
  );
  return templatePath;
};

const assertDistinctLiveEvidenceValues = (entries, label) => {
  const seen = new Map();
  for (const [entryLabel, value] of entries) {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    const previous = seen.get(normalized);
    if (previous) {
      throw new Error(
        `${label} must be distinct: ${previous} and ${entryLabel} match.`,
      );
    }
    seen.set(normalized, entryLabel);
  }
};

export const normalizeSolanaLiveTransferEvidence = (
  evidence,
  { evidencePath = null, checkedAt = new Date().toISOString() } = {},
) => {
  const schema = readString(evidence, "schema");
  if (
    schema === "iroha-demo-sccp-solana-live-transfer-evidence-template/v1" ||
    evidence?.templateOnly === true
  ) {
    throw new Error(
      "live evidence template files cannot be used as completed transfer evidence.",
    );
  }
  if (schema !== "iroha-demo-sccp-solana-live-transfer-evidence/v1") {
    throw new Error(
      "live evidence schema must be iroha-demo-sccp-solana-live-transfer-evidence/v1.",
    );
  }
  if (
    readString(evidence, "routeId", "route_id", "route") !==
    SCCP_SOLANA_XOR_ROUTE_ID
  ) {
    throw new Error(
      `live evidence routeId must be ${SCCP_SOLANA_XOR_ROUTE_ID}.`,
    );
  }
  const assetKey = normalizeLiveEvidenceAssetKey(
    readString(evidence, "assetKey", "asset_key", "asset"),
  );
  const activationPackageHash = normalizeRequiredHash32(
    readString(evidence, "activationPackageHash", "activation_package_hash"),
    "live evidence activationPackageHash",
  );
  const operatorHandoffHash = normalizeRequiredHash32(
    readString(
      evidence,
      "operatorHandoffHash",
      "operator_handoff_hash",
      "handoffHash",
      "handoff_hash",
    ),
    "live evidence operatorHandoffHash",
  );
  const forward = readRecord(evidence, "tairaToSolana", "taira_to_solana");
  const reverse = readRecord(evidence, "solanaToTaira", "solana_to_taira");
  if (!forward || !reverse) {
    throw new Error(
      "live evidence must include both tairaToSolana and solanaToTaira records.",
    );
  }
  const forwardAmount = decimalAmountToBaseUnits(
    readString(forward, "amount", "amountXor", "amount_xor"),
    "tairaToSolana.amount",
  );
  const reverseAmount = decimalAmountToBaseUnits(
    readString(reverse, "amount", "amountXor", "amount_xor"),
    "solanaToTaira.amount",
  );
  const normalized = {
    schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey,
    activationPackageHash,
    operatorHandoffHash,
    evidencePath,
    checkedAt,
    tairaToSolana: {
      ...forwardAmount,
      messageId: normalizeNonZeroHex32(
        readString(forward, "messageId", "message_id"),
        "tairaToSolana.messageId",
      ),
      tairaSourceTx: normalizeNonZeroHex32(
        readString(forward, "tairaSourceTx", "taira_source_tx", "sourceTx"),
        "tairaToSolana.tairaSourceTx",
      ),
      solanaTxId: normalizeSolanaSignature(
        readString(forward, "solanaTxId", "solana_tx_id", "signature", "txId"),
        "tairaToSolana.solanaTxId",
      ),
    },
    solanaToTaira: {
      ...reverseAmount,
      messageId: normalizeNonZeroHex32(
        readString(reverse, "messageId", "message_id"),
        "solanaToTaira.messageId",
      ),
      solanaSourceTx: normalizeSolanaSignature(
        readString(
          reverse,
          "solanaSourceTx",
          "solana_source_tx",
          "signature",
          "txId",
        ),
        "solanaToTaira.solanaSourceTx",
      ),
      tairaSettlementTx: normalizeNonZeroHex32(
        readString(
          reverse,
          "tairaSettlementTx",
          "taira_settlement_tx",
          "settlementTx",
        ),
        "solanaToTaira.tairaSettlementTx",
      ),
    },
  };
  normalized.tairaToSolana.solanaExplorerUrl = normalizeSolanaExplorerUrl(
    readString(forward, "solanaExplorerUrl", "solana_explorer_url"),
    normalized.tairaToSolana.solanaTxId,
    "tairaToSolana.solanaExplorerUrl",
  );
  normalized.solanaToTaira.tairaExplorerUrl = normalizeTairaExplorerUrl(
    readString(reverse, "tairaExplorerUrl", "taira_explorer_url"),
    normalized.solanaToTaira.tairaSettlementTx,
    "solanaToTaira.tairaExplorerUrl",
  );
  assertDistinctLiveEvidenceValues(
    [
      ["tairaToSolana.tairaSourceTx", normalized.tairaToSolana.tairaSourceTx],
      [
        "solanaToTaira.tairaSettlementTx",
        normalized.solanaToTaira.tairaSettlementTx,
      ],
    ],
    "TAIRA live evidence transaction hashes",
  );
  assertDistinctLiveEvidenceValues(
    [
      ["tairaToSolana.solanaTxId", normalized.tairaToSolana.solanaTxId],
      ["solanaToTaira.solanaSourceTx", normalized.solanaToTaira.solanaSourceTx],
    ],
    "Solana live evidence transaction signatures",
  );
  return normalized;
};

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  Array.from(BASE58_ALPHABET, (character, index) => [character, index]),
);

const decodeBase58 = (value, label) => {
  const input = String(value ?? "").trim();
  if (!input) {
    throw new Error(`${label} is missing.`);
  }
  let number = 0n;
  for (const character of input) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) {
      throw new Error(`${label} is not valid Base58.`);
    }
    number = number * 58n + BigInt(digit);
  }
  let hex = number === 0n ? "" : number.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  const decoded = hex ? Buffer.from(hex, "hex") : Buffer.alloc(0);
  const leadingZeroes = input.match(/^1*/u)?.[0].length ?? 0;
  return Buffer.concat([Buffer.alloc(leadingZeroes), decoded]);
};

const normalizeSolanaPublicKey = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!SOLANA_PUBLIC_KEY.test(normalized)) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  const bytes = decodeBase58(normalized, label);
  if (bytes.length !== 32 || bytes.every((byte) => byte === 0)) {
    throw new Error(`${label} must decode to a non-zero 32-byte public key.`);
  }
  return normalized;
};

const deriveSolanaProgramAddress = (seeds, programAddress) => {
  if (seeds.some((seed) => seed.length > 32)) {
    throw new Error(
      "Solana program-derived-address seeds must not exceed 32 bytes.",
    );
  }
  const programBytes = new PublicKey(programAddress).toBytes();
  const marker = Buffer.from("ProgramDerivedAddress", "utf8");
  for (let bump = 255; bump >= 0; bump -= 1) {
    const digest = createHash("sha256")
      .update(
        Buffer.concat([
          ...seeds.map((seed) => Buffer.from(seed)),
          Buffer.from([bump]),
          Buffer.from(programBytes),
          marker,
        ]),
      )
      .digest();
    if (!PublicKey.isOnCurve(digest)) {
      return new PublicKey(digest).toBase58();
    }
  }
  throw new Error("Unable to derive the canonical Solana program address.");
};

const normalizeNonZeroHex32 = (value, label) => {
  const normalized = normalizeHex32(value, label);
  if (/^0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const passedPreflightCheckEvidence = (report, id) => {
  const matching = readArray(report, "checks").filter(
    (check) => readStringValue(check, "id") === id,
  );
  if (matching.length !== 1 || matching[0]?.status !== "pass") {
    throw new Error(
      `Solana live evidence requires one passing ${id} preflight check.`,
    );
  }
  const evidence = readRecord(matching[0], "evidence");
  if (!evidence) {
    throw new Error(`${id} preflight evidence is missing.`);
  }
  return evidence;
};

const readPinHash = (record, label, ...keys) =>
  normalizeNonZeroHex32(readString(record, ...keys), label);

export const extractSolanaLiveManifestPins = (preflightReport) => {
  if (!isRecord(preflightReport) || preflightReport.ready !== true) {
    throw new Error("Solana route preflight must be ready for live evidence.");
  }
  if (readString(preflightReport, "manifestSource") !== "public") {
    throw new Error(
      "Solana live evidence requires a manifest loaded from public TAIRA.",
    );
  }
  if (
    readString(preflightReport, "routeId") !== SCCP_SOLANA_XOR_ROUTE_ID ||
    readString(preflightReport, "assetKey") !== SCCP_XOR_ASSET_KEY
  ) {
    throw new Error(
      "Solana live evidence preflight route identity is invalid.",
    );
  }
  const taira = readRecord(preflightReport, "taira");
  const solana = readRecord(preflightReport, "solana");
  if (
    readString(taira, "chainId") !== TAIRA_CHAIN_ID ||
    Number(taira?.networkPrefix) !== TAIRA_NETWORK_PREFIX
  ) {
    throw new Error("Solana live evidence preflight does not target TAIRA.");
  }
  if (
    readString(solana, "network") !== SOLANA_TESTNET_NETWORK_ID ||
    readString(solana, "caipChainId") !== SOLANA_TESTNET_CAIP_CHAIN_ID
  ) {
    throw new Error(
      "Solana live evidence preflight does not target canonical Solana testnet.",
    );
  }

  const addresses = passedPreflightCheckEvidence(
    preflightReport,
    "solana-deployment-addresses",
  );
  const rollout = passedPreflightCheckEvidence(
    preflightReport,
    "solana-rollout-material",
  );
  const tokenState = passedPreflightCheckEvidence(
    preflightReport,
    "solana-live-token-state-evidence",
  );
  const sourceLane = passedPreflightCheckEvidence(
    preflightReport,
    "source-lane-material",
  );
  const burnRecord = passedPreflightCheckEvidence(
    preflightReport,
    "taira-burn-record-material",
  );
  const verifier = readRecord(sourceLane, "verifier");
  const adapter = readRecord(sourceLane, "adapter");
  if (!verifier || !adapter) {
    throw new Error("Solana source-lane manifest pins are missing.");
  }
  const pins = {
    bridgeProgramAddress: normalizeSolanaPublicKey(
      readString(addresses, "bridgeProgramAddress"),
      "manifest bridge program",
    ),
    tokenMintAddress: normalizeSolanaPublicKey(
      readString(addresses, "tokenMintAddress"),
      "manifest token mint",
    ),
    sourceBridgeProgramAddress: normalizeSolanaPublicKey(
      readString(addresses, "sourceBridgeProgramAddress"),
      "manifest source bridge program",
    ),
    verifierProgramAddress: normalizeSolanaPublicKey(
      readString(addresses, "verifierProgramAddress"),
      "manifest verifier program",
    ),
    nativeVerifierProgramAddress: normalizeSolanaPublicKey(
      readString(addresses, "nativeVerifierProgramAddress"),
      "manifest native verifier program",
    ),
    verifierStateAddress: normalizeSolanaPublicKey(
      readString(addresses, "verifierStateAddress"),
      "manifest verifier state",
    ),
    sourceStateAddress: normalizeSolanaPublicKey(
      readString(addresses, "sourceStateAddress"),
      "manifest source state",
    ),
    mintAuthorityAddress: normalizeSolanaPublicKey(
      readString(tokenState, "expectedMintAuthority", "mintAuthority"),
      "manifest mint authority",
    ),
    verifierCodeHash: readPinHash(
      rollout,
      "manifest verifier code hash",
      "verifierCodeHash",
    ),
    verifierKeyHash: readPinHash(
      rollout,
      "manifest verifier key hash",
      "verifierKeyHash",
    ),
    destinationBindingHash: readPinHash(
      rollout,
      "manifest destination binding hash",
      "destinationBindingHash",
    ),
    sourceTrustAnchorHash: readPinHash(
      verifier,
      "manifest source trust anchor hash",
      "sourceTrustAnchorHash",
      "source_trust_anchor_hash",
    ),
    consensusVerifierHash: readPinHash(
      verifier,
      "manifest consensus verifier hash",
      "consensusVerifierHash",
      "consensus_verifier_hash",
    ),
    messageInclusionVerifierHash: readPinHash(
      verifier,
      "manifest message inclusion verifier hash",
      "messageInclusionVerifierHash",
      "message_inclusion_verifier_hash",
    ),
    finalityPolicyHash: readPinHash(
      verifier,
      "manifest finality policy hash",
      "finalityPolicyHash",
      "finality_policy_hash",
    ),
    sourceStateVerifierHash: readPinHash(
      verifier,
      "manifest source state verifier hash",
      "sourceStateVerifierHash",
      "source_state_verifier_hash",
    ),
    adapterVerifierVkHash: readPinHash(
      adapter,
      "manifest adapter verifier VK hash",
      "adapterVerifierVkHash",
      "adapter_verifier_vk_hash",
    ),
    adapterDeploymentReceiptHash: readPinHash(
      adapter,
      "manifest adapter deployment receipt hash",
      "deploymentReceiptHash",
      "deployment_receipt_hash",
    ),
    settlementAssetDefinitionId: readString(
      burnRecord,
      "settlementAssetDefinitionId",
    ),
  };
  if (!pins.settlementAssetDefinitionId) {
    throw new Error("Manifest settlement asset definition id is missing.");
  }
  const addressesToCompare = [
    pins.bridgeProgramAddress,
    pins.tokenMintAddress,
    pins.sourceBridgeProgramAddress,
    pins.verifierProgramAddress,
    pins.nativeVerifierProgramAddress,
    pins.verifierStateAddress,
    pins.sourceStateAddress,
    pins.mintAuthorityAddress,
  ];
  if (new Set(addressesToCompare).size !== addressesToCompare.length) {
    throw new Error(
      "Solana live manifest program, state, and mint pins collide.",
    );
  }
  return pins;
};

const decodeInstructionData = (instruction, label) => {
  const data = instruction?.data;
  if (typeof data === "string") {
    return decodeBase58(data, `${label} data`);
  }
  if (
    Array.isArray(data) &&
    typeof data[0] === "string" &&
    data[1] === "base64"
  ) {
    const bytes = Buffer.from(data[0], "base64");
    if (bytes.length === 0) {
      throw new Error(`${label} data is empty.`);
    }
    return bytes;
  }
  throw new Error(`${label} does not carry canonical instruction data.`);
};

const decodeLengthPrefixedVectors = (bytes, label) => {
  const vectors = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) {
      throw new Error(`${label} has a truncated vector length.`);
    }
    const length = bytes.readUInt32LE(offset);
    offset += 4;
    if (length > bytes.length - offset) {
      throw new Error(`${label} has a truncated vector value.`);
    }
    vectors.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  if (vectors.length === 0) {
    throw new Error(`${label} is empty.`);
  }
  return vectors;
};

const readU64LeDecimal = (bytes, label) => {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 8) {
    throw new Error(`${label} must be an eight-byte little-endian u64.`);
  }
  return bytes.readBigUInt64LE().toString();
};

const readPositiveU64LeDecimal = (bytes, label) => {
  const value = readU64LeDecimal(bytes, label);
  if (value === "0") {
    throw new Error(`${label} must be greater than zero.`);
  }
  return value;
};

const decodeTransparentPublicInputs = (bytes, label) => {
  const expectedLength = 1 + 32 + 32 + 4 + 32 + 8 + 32;
  if (!Buffer.isBuffer(bytes) || bytes.length !== expectedLength) {
    throw new Error(`${label} has a non-canonical byte length.`);
  }
  const version = bytes[0];
  const targetDomain = bytes.readUInt32LE(65);
  if (version !== 1 || targetDomain !== SCCP_SOLANA_DOMAIN) {
    throw new Error(
      `${label} must be version 1 and target Solana domain ${SCCP_SOLANA_DOMAIN}.`,
    );
  }
  return {
    version,
    messageId: bytes.subarray(1, 33).toString("hex"),
    payloadHash: bytes.subarray(33, 65).toString("hex"),
    targetDomain,
  };
};

const solanaAccountKeyText = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (isRecord(value)) {
    return readString(value, "pubkey", "address");
  }
  return "";
};

const solanaTransactionAccountKeys = (transaction) => {
  const message = transaction?.transaction?.message;
  if (!isRecord(message)) {
    throw new Error("Solana transaction message is missing.");
  }
  const rawStatic = Array.isArray(message.accountKeys)
    ? message.accountKeys
    : Array.isArray(message.staticAccountKeys)
      ? message.staticAccountKeys
      : [];
  const staticKeys = rawStatic.map(solanaAccountKeyText);
  const loaded = readRecord(transaction?.meta, "loadedAddresses") ?? {};
  const loadedKeys = [
    ...readArray(loaded, "writable"),
    ...readArray(loaded, "readonly"),
  ].map(solanaAccountKeyText);
  const keys = [...staticKeys, ...loadedKeys];
  if (keys.length === 0 || keys.some((key) => !key)) {
    throw new Error("Solana transaction account keys are incomplete.");
  }
  return keys;
};

const resolveSolanaInstruction = (instruction, accountKeys, label) => {
  const programId =
    readString(instruction, "programId", "program_id") ||
    (Number.isSafeInteger(instruction?.programIdIndex)
      ? accountKeys[instruction.programIdIndex]
      : "");
  const rawAccounts = Array.isArray(instruction?.accounts)
    ? instruction.accounts
    : [];
  const accounts = rawAccounts.map((account) => {
    if (Number.isSafeInteger(account)) {
      return accountKeys[account] ?? "";
    }
    return solanaAccountKeyText(account);
  });
  if (!programId || accounts.some((account) => !account)) {
    throw new Error(`${label} account resolution failed.`);
  }
  return {
    programId,
    accounts,
    data: decodeInstructionData(instruction, label),
  };
};

const findSolanaBridgeInstruction = (transaction, expectedProgram, label) => {
  const accountKeys = solanaTransactionAccountKeys(transaction);
  const instructions = transaction?.transaction?.message?.instructions;
  if (!Array.isArray(instructions)) {
    throw new Error(`${label} instruction list is missing.`);
  }
  const matches = instructions
    .map((instruction, index) => ({ instruction, index }))
    .filter(({ instruction }) => {
      const programId =
        readString(instruction, "programId", "program_id") ||
        (Number.isSafeInteger(instruction?.programIdIndex)
          ? accountKeys[instruction.programIdIndex]
          : "");
      return programId === expectedProgram;
    });
  if (matches.length !== 1) {
    throw new Error(`${label} must invoke the pinned SCCP program once.`);
  }
  return {
    ...resolveSolanaInstruction(
      matches[0].instruction,
      accountKeys,
      `${label} bridge instruction`,
    ),
    index: matches[0].index,
    accountKeys,
  };
};

const unwrapSolanaRpcResult = (value) =>
  isRecord(value) && Object.prototype.hasOwnProperty.call(value, "result")
    ? value.result
    : value;

const normalizeSolanaSignatureStatus = (raw, label) => {
  let value = unwrapSolanaRpcResult(raw);
  if (isRecord(value) && Array.isArray(value.value)) {
    [value] = value.value;
  } else if (Array.isArray(value)) {
    [value] = value;
  }
  if (!isRecord(value)) {
    throw new Error(`${label} is missing or pruned.`);
  }
  if (value.err !== null || value.confirmationStatus !== "finalized") {
    throw new Error(`${label} is not a successful finalized transaction.`);
  }
  return value;
};

const normalizeSolanaTransactionReadback = (raw, signature, label) => {
  const transaction = unwrapSolanaRpcResult(raw);
  if (!isRecord(transaction)) {
    throw new Error(`${label} is missing or pruned.`);
  }
  if (!isRecord(transaction.meta) || transaction.meta.err !== null) {
    throw new Error(`${label} failed on Solana.`);
  }
  if (!Number.isSafeInteger(transaction.slot) || transaction.slot <= 0) {
    throw new Error(`${label} finalized slot is missing.`);
  }
  const signatures = transaction?.transaction?.signatures;
  if (!Array.isArray(signatures) || signatures[0] !== signature) {
    throw new Error(`${label} signature does not match RPC readback.`);
  }
  return transaction;
};

const tokenBalanceAmount = (entry, label) => {
  const amount = readString(readRecord(entry, "uiTokenAmount") ?? {}, "amount");
  if (!/^(?:0|[1-9][0-9]*)$/u.test(amount)) {
    throw new Error(`${label} token amount is invalid.`);
  }
  return BigInt(amount);
};

const assertTokenBalanceDelta = ({
  transaction,
  accountKeys,
  tokenAccount,
  mint,
  amountBaseUnits,
  direction,
  label,
}) => {
  const accountIndex = accountKeys.indexOf(tokenAccount);
  if (accountIndex < 0) {
    throw new Error(`${label} token account is absent from the transaction.`);
  }
  const findBalance = (key) =>
    readArray(transaction.meta, key).filter(
      (entry) =>
        entry?.accountIndex === accountIndex &&
        readString(entry, "mint") === mint,
    );
  const pre = findBalance("preTokenBalances");
  const post = findBalance("postTokenBalances");
  if (pre.length !== 1 || post.length !== 1) {
    throw new Error(`${label} token balance readback is incomplete.`);
  }
  const delta =
    tokenBalanceAmount(post[0], label) - tokenBalanceAmount(pre[0], label);
  const expected =
    BigInt(amountBaseUnits) * (direction === "credit" ? 1n : -1n);
  if (delta !== expected) {
    throw new Error(
      `${label} token balance delta does not match the transfer amount.`,
    );
  }
};

const assertInnerSplTokenMutation = ({
  transaction,
  outerInstructionIndex,
  type,
  mint,
  tokenAccount,
  amountBaseUnits,
  label,
}) => {
  const relevant = readArray(transaction.meta, "innerInstructions")
    .flatMap((group) =>
      readArray(group, "instructions").map((instruction) => ({
        groupIndex: group?.index,
        instruction,
      })),
    )
    .filter(({ instruction }) => {
      const parsed = readRecord(instruction, "parsed");
      const info = readRecord(parsed, "info");
      const account = readString(info, "account", "destination", "source");
      return (
        readString(instruction, "programId", "program_id") ===
          SOLANA_SPL_TOKEN_PROGRAM_ID &&
        readString(info, "mint") === mint &&
        account === tokenAccount
      );
    });
  const matches = relevant.filter(({ groupIndex, instruction }) => {
    const parsed = readRecord(instruction, "parsed");
    const info = readRecord(parsed, "info");
    return (
      groupIndex === outerInstructionIndex &&
      readString(parsed, "type").toLowerCase() === type.toLowerCase() &&
      readString(info, "amount") === amountBaseUnits
    );
  });
  const topLevelTokenInstructions = readArray(
    transaction?.transaction?.message,
    "instructions",
  ).filter((instruction) => {
    if (
      readString(instruction, "programId", "program_id") !==
      SOLANA_SPL_TOKEN_PROGRAM_ID
    ) {
      return false;
    }
    const parsed = readRecord(instruction, "parsed");
    const info = readRecord(parsed, "info");
    if (!info) {
      return true;
    }
    return (
      readString(info, "mint") === mint ||
      readString(info, "account", "destination", "source") === tokenAccount
    );
  });
  if (
    relevant.length !== 1 ||
    matches.length !== 1 ||
    topLevelTokenInstructions.length !== 0
  ) {
    throw new Error(
      `${label} is missing the exact successful SPL ${type} CPI.`,
    );
  }
};

const assertExactInstructionAccounts = (actual, expected, label) => {
  if (
    actual.length !== expected.length ||
    actual.some((account, index) => account !== expected[index])
  ) {
    throw new Error(`${label} does not match the pinned account order.`);
  }
};

const verifyTairaToSolanaTransaction = ({
  transaction,
  liveEvidence,
  pins,
}) => {
  const label = "TAIRA-to-Solana finalize transaction";
  const bridge = findSolanaBridgeInstruction(
    transaction,
    pins.verifierProgramAddress,
    label,
  );
  const vectors = decodeLengthPrefixedVectors(bridge.data, `${label} envelope`);
  if (
    vectors.length !== 8 ||
    vectors[0].toString("utf8") !== SCCP_SOLANA_SUBMIT_ENTRYPOINT
  ) {
    throw new Error(`${label} does not call ${SCCP_SOLANA_SUBMIT_ENTRYPOINT}.`);
  }
  const publicInputs = decodeTransparentPublicInputs(
    vectors[2],
    `${label} public inputs`,
  );
  if (publicInputs.messageId !== liveEvidence.messageId) {
    throw new Error(`${label} message id does not match live evidence.`);
  }
  if (vectors[5].toString("hex") !== pins.destinationBindingHash) {
    throw new Error(
      `${label} destination binding hash does not match the manifest.`,
    );
  }
  const amountBaseUnits = readU64LeDecimal(vectors[7], `${label} amount`);
  if (amountBaseUnits !== liveEvidence.amountBaseUnits) {
    throw new Error(`${label} amount does not match live evidence.`);
  }
  if (bridge.accounts.length !== 9) {
    throw new Error(`${label} account list is not canonical.`);
  }
  const destinationTokenAccount = normalizeSolanaPublicKey(
    bridge.accounts[3],
    `${label} destination token account`,
  );
  const messageReceiptAddress = deriveSolanaProgramAddress(
    [
      Buffer.from(SCCP_SOLANA_MESSAGE_RECEIPT_SEED, "utf8"),
      new PublicKey(pins.verifierStateAddress).toBuffer(),
      Buffer.from(publicInputs.messageId, "hex"),
    ],
    pins.verifierProgramAddress,
  );
  assertExactInstructionAccounts(
    bridge.accounts,
    [
      bridge.accounts[0],
      pins.verifierStateAddress,
      pins.tokenMintAddress,
      destinationTokenAccount,
      pins.mintAuthorityAddress,
      SOLANA_SPL_TOKEN_PROGRAM_ID,
      pins.nativeVerifierProgramAddress,
      messageReceiptAddress,
      SOLANA_SYSTEM_PROGRAM_ID,
    ],
    `${label} accounts`,
  );
  assertTokenBalanceDelta({
    transaction,
    accountKeys: bridge.accountKeys,
    tokenAccount: destinationTokenAccount,
    mint: pins.tokenMintAddress,
    amountBaseUnits,
    direction: "credit",
    label,
  });
  assertInnerSplTokenMutation({
    transaction,
    outerInstructionIndex: bridge.index,
    type: "mintTo",
    mint: pins.tokenMintAddress,
    tokenAccount: destinationTokenAccount,
    amountBaseUnits,
    label,
  });
  return {
    slot: transaction.slot,
    messageId: publicInputs.messageId,
    payloadHash: publicInputs.payloadHash,
    amountBaseUnits,
    destinationTokenAccount,
    messageReceiptAddress,
    bridgeProgramAddress: bridge.programId,
    mint: pins.tokenMintAddress,
  };
};

const verifySolanaToTairaTransaction = ({
  transaction,
  liveEvidence,
  pins,
}) => {
  const label = "Solana-to-TAIRA source burn transaction";
  const bridge = findSolanaBridgeInstruction(
    transaction,
    pins.sourceBridgeProgramAddress,
    label,
  );
  const vectors = decodeLengthPrefixedVectors(bridge.data, `${label} envelope`);
  if (
    vectors.length !== 4 ||
    vectors[0].toString("utf8") !== SCCP_SOLANA_BURN_ENTRYPOINT
  ) {
    throw new Error(`${label} does not call ${SCCP_SOLANA_BURN_ENTRYPOINT}.`);
  }
  const amountBaseUnits = readU64LeDecimal(vectors[1], `${label} amount`);
  if (amountBaseUnits !== liveEvidence.amountBaseUnits) {
    throw new Error(`${label} amount does not match live evidence.`);
  }
  const tairaRecipient = vectors[2].toString("utf8");
  if (
    !tairaRecipient ||
    Buffer.from(tairaRecipient, "utf8").compare(vectors[2]) !== 0
  ) {
    throw new Error(`${label} recipient is not canonical UTF-8.`);
  }
  const nonce = readPositiveU64LeDecimal(vectors[3], `${label} nonce`);
  if (bridge.accounts.length !== 7) {
    throw new Error(`${label} account list is not canonical.`);
  }
  const owner = normalizeSolanaPublicKey(bridge.accounts[0], `${label} owner`);
  const sourceTokenAccount = normalizeSolanaPublicKey(
    bridge.accounts[2],
    `${label} source token account`,
  );
  const sourceBurnReceiptAddress = deriveSolanaProgramAddress(
    [
      Buffer.from(SCCP_SOLANA_SOURCE_BURN_RECEIPT_SEED, "utf8"),
      new PublicKey(pins.sourceStateAddress).toBuffer(),
      new PublicKey(owner).toBuffer(),
      vectors[3],
    ],
    pins.sourceBridgeProgramAddress,
  );
  assertExactInstructionAccounts(
    bridge.accounts,
    [
      owner,
      pins.sourceStateAddress,
      sourceTokenAccount,
      pins.tokenMintAddress,
      SOLANA_SPL_TOKEN_PROGRAM_ID,
      sourceBurnReceiptAddress,
      SOLANA_SYSTEM_PROGRAM_ID,
    ],
    `${label} accounts`,
  );
  assertTokenBalanceDelta({
    transaction,
    accountKeys: bridge.accountKeys,
    tokenAccount: sourceTokenAccount,
    mint: pins.tokenMintAddress,
    amountBaseUnits,
    direction: "debit",
    label,
  });
  assertInnerSplTokenMutation({
    transaction,
    outerInstructionIndex: bridge.index,
    type: "burn",
    mint: pins.tokenMintAddress,
    tokenAccount: sourceTokenAccount,
    amountBaseUnits,
    label,
  });
  const recipientLength = Buffer.alloc(2);
  recipientLength.writeUInt16LE(vectors[2].length);
  const slotBytes = Buffer.alloc(8);
  slotBytes.writeBigUInt64LE(BigInt(transaction.slot));
  const sourceEventHash = createHash("sha256")
    .update(Buffer.from(SCCP_SOLANA_SOURCE_BURN_EVENT_PREFIX, "utf8"))
    .update(
      decodeBase58(
        pins.sourceBridgeProgramAddress,
        `${label} source bridge program`,
      ),
    )
    .update(decodeBase58(pins.sourceStateAddress, `${label} source state`))
    .update(decodeBase58(pins.tokenMintAddress, `${label} mint`))
    .update(decodeBase58(owner, `${label} owner`))
    .update(decodeBase58(sourceTokenAccount, `${label} source token`))
    .update(recipientLength)
    .update(vectors[2])
    .update(vectors[1])
    .update(vectors[3])
    .update(slotBytes)
    .digest("hex");
  return {
    slot: transaction.slot,
    amountBaseUnits,
    owner,
    sourceTokenAccount,
    sourceBurnReceiptAddress,
    tairaRecipient,
    nonce,
    sourceEventHash,
    sourceBridgeProgramAddress: bridge.programId,
    mint: pins.tokenMintAddress,
  };
};

const normalizeTairaStatus = (record) => {
  const raw = record?.status;
  if (typeof raw === "string") {
    return raw.trim().toLowerCase();
  }
  if (isRecord(raw)) {
    return readString(raw, "kind", "status").toLowerCase();
  }
  return "";
};

const requireExactManifestPins = (record, expectedPins, label) => {
  const actual = readRecord(record, "manifestPins", "manifest_pins");
  if (!actual) {
    throw new Error(`${label} manifest pins are missing.`);
  }
  const snakeCase = (key) =>
    key.replace(/[A-Z]/gu, (match) => `_${match.toLowerCase()}`);
  for (const [key, expected] of Object.entries(expectedPins)) {
    const actualValue = readString(actual, key, snakeCase(key));
    const normalizedActual = HEX32.test(expected)
      ? normalizeHex32(actualValue, `${label} ${key}`)
      : actualValue;
    if (normalizedActual !== expected) {
      throw new Error(`${label} ${key} does not match the public manifest.`);
    }
  }
};

const requireTairaStateDelta = ({
  record,
  direction,
  amountBaseUnits,
  accountId,
  label,
}) => {
  const rawDeltas = [
    ...readArray(record, "stateDeltas"),
    ...readArray(record, "state_deltas"),
    ...readArray(record, "effects"),
  ];
  const expectedDelta = `${direction === "credit" ? "" : "-"}${amountBaseUnits}`;
  const relevant = rawDeltas.filter(
    (delta) =>
      readString(delta, "assetKey", "asset_key") === SCCP_XOR_ASSET_KEY &&
      readString(delta, "role") === "sccp_principal",
  );
  const matches = relevant.filter((delta) => {
    const kind = readString(delta, "kind", "direction").toLowerCase();
    const deltaText = readString(
      delta,
      "deltaBaseUnits",
      "delta_base_units",
      "delta",
    );
    return (
      readString(delta, "amountBaseUnits", "amount_base_units", "amount") ===
        amountBaseUnits &&
      deltaText === expectedDelta &&
      kind === direction &&
      readString(delta, "accountId", "account_id", "account") === accountId &&
      delta?.applied === true
    );
  });
  if (relevant.length !== 1 || matches.length !== 1) {
    throw new Error(
      `${label} does not prove the exact successful XOR state delta.`,
    );
  }
};

const verifyTairaTransactionRecord = ({
  record: raw,
  transactionHash,
  messageId,
  amountBaseUnits,
  direction,
  pins,
  sourceTransactionId = "",
  tairaRecipient = "",
  payloadHash = "",
  sourceEventHash = "",
}) => {
  const label =
    direction === "taira_to_solana"
      ? "TAIRA source transaction"
      : "TAIRA settlement transaction";
  const record = unwrapSolanaRpcResult(raw);
  if (!isRecord(record)) {
    throw new Error(`${label} is missing or pruned.`);
  }
  const hash = normalizeHex32(
    readString(record, "hash", "transactionHash", "transaction_hash"),
    `${label} hash`,
  );
  if (hash !== transactionHash) {
    throw new Error(`${label} hash does not match live evidence.`);
  }
  if (normalizeTairaStatus(record) !== "committed") {
    throw new Error(`${label} is not committed.`);
  }
  if (
    readString(record, "routeId", "route_id", "route") !==
      SCCP_SOLANA_XOR_ROUTE_ID ||
    readString(record, "assetKey", "asset_key") !== SCCP_XOR_ASSET_KEY ||
    readString(record, "direction") !== direction ||
    normalizeHex32(
      readString(record, "messageId", "message_id"),
      `${label} message id`,
    ) !== messageId ||
    readString(record, "amountBaseUnits", "amount_base_units", "amount") !==
      amountBaseUnits
  ) {
    throw new Error(
      `${label} SCCP route, message, asset, or amount binding is invalid.`,
    );
  }
  if (direction === "taira_to_solana") {
    const sender = readString(
      record,
      "sender",
      "senderAccountId",
      "sender_account_id",
    );
    if (!sender) {
      throw new Error(`${label} sender account is missing.`);
    }
    if (
      normalizeNonZeroHex32(
        readString(record, "payloadHash", "payload_hash"),
        `${label} payload hash`,
      ) !== payloadHash
    ) {
      throw new Error(`${label} payload hash does not match the Solana proof.`);
    }
    if (
      record.sccpMessageRecorded !== true &&
      record.sccp_message_recorded !== true
    ) {
      throw new Error(`${label} does not prove SCCP message recording.`);
    }
    requireTairaStateDelta({
      record,
      direction: "debit",
      amountBaseUnits,
      accountId: sender,
      label,
    });
  } else {
    const recordedSourceTransaction = readString(
      record,
      "sourceTransactionId",
      "source_transaction_id",
      "sourceTx",
      "source_tx",
    );
    if (recordedSourceTransaction !== sourceTransactionId) {
      throw new Error(
        `${label} source transaction does not match the Solana burn.`,
      );
    }
    if (
      normalizeNonZeroHex32(
        readString(record, "sourceEventHash", "source_event_hash"),
        `${label} source event hash`,
      ) !== sourceEventHash
    ) {
      throw new Error(
        `${label} source event hash does not match the Solana burn.`,
      );
    }
    if (
      !tairaRecipient ||
      readString(
        record,
        "recipient",
        "recipientAccountId",
        "recipient_account_id",
      ) !== tairaRecipient
    ) {
      throw new Error(`${label} recipient does not match the Solana burn.`);
    }
    if (
      record.sccpSettlementApplied !== true &&
      record.sccp_settlement_applied !== true
    ) {
      throw new Error(`${label} does not prove SCCP settlement application.`);
    }
    requireTairaStateDelta({
      record,
      direction: "credit",
      amountBaseUnits,
      accountId: tairaRecipient,
      label,
    });
  }
  requireExactManifestPins(record, pins, label);
  return { hash, status: "committed", direction, messageId, amountBaseUnits };
};

const verifyTairaSccpMessageRecord = ({
  raw,
  messageId,
  amountBaseUnits,
  direction,
  sourceTransactionId,
  destinationTransactionId,
  accountBindings,
  payloadHash = "",
  sourceEventHash = "",
  pins,
}) => {
  const label = `${direction} SCCP message`;
  const record = unwrapSolanaRpcResult(raw);
  if (!isRecord(record)) {
    throw new Error(`${label} is missing or pruned.`);
  }
  const status = normalizeTairaStatus(record);
  if (!new Set(["settled", "finalized"]).has(status)) {
    throw new Error(`${label} is not finalized and settled.`);
  }
  if (
    normalizeHex32(
      readString(record, "messageId", "message_id"),
      `${label} id`,
    ) !== messageId ||
    readString(record, "routeId", "route_id", "route") !==
      SCCP_SOLANA_XOR_ROUTE_ID ||
    readString(record, "assetKey", "asset_key") !== SCCP_XOR_ASSET_KEY ||
    readString(record, "direction") !== direction ||
    readString(record, "amountBaseUnits", "amount_base_units", "amount") !==
      amountBaseUnits ||
    readString(
      record,
      "sourceTransactionId",
      "source_transaction_id",
      "sourceTx",
      "source_tx",
    ) !== sourceTransactionId ||
    readString(
      record,
      "destinationTransactionId",
      "destination_transaction_id",
      "settlementTransactionId",
      "settlement_transaction_id",
    ) !== destinationTransactionId
  ) {
    throw new Error(
      `${label} route, transaction, message, or amount binding is invalid.`,
    );
  }
  if (
    direction === "taira_to_solana" &&
    normalizeNonZeroHex32(
      readString(record, "payloadHash", "payload_hash"),
      `${label} payload hash`,
    ) !== payloadHash
  ) {
    throw new Error(`${label} payload hash does not match the Solana proof.`);
  }
  if (
    direction === "solana_to_taira" &&
    normalizeNonZeroHex32(
      readString(record, "sourceEventHash", "source_event_hash"),
      `${label} source event hash`,
    ) !== sourceEventHash
  ) {
    throw new Error(
      `${label} source event hash does not match the Solana burn.`,
    );
  }
  const bindings = readRecord(record, "accountBindings", "account_bindings");
  if (!bindings) {
    throw new Error(`${label} account bindings are missing.`);
  }
  for (const [key, expected] of Object.entries(accountBindings)) {
    if (readString(bindings, key) !== expected) {
      throw new Error(`${label} ${key} account binding is invalid.`);
    }
  }
  const sourceDomain = Number(record.sourceDomain ?? record.source_domain);
  const targetDomain = Number(record.targetDomain ?? record.target_domain);
  const expectedDomains =
    direction === "taira_to_solana"
      ? [SCCP_SORA_DOMAIN, SCCP_SOLANA_DOMAIN]
      : [SCCP_SOLANA_DOMAIN, SCCP_SORA_DOMAIN];
  if (
    sourceDomain !== expectedDomains[0] ||
    targetDomain !== expectedDomains[1]
  ) {
    throw new Error(`${label} domain pair is invalid.`);
  }
  requireExactManifestPins(record, pins, label);
  return {
    messageId,
    status,
    direction,
    sourceTransactionId,
    destinationTransactionId,
  };
};

const recursiveMetadataField = (value, keys, depth = 0) => {
  if (!isRecord(value) || depth > 5) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  for (const child of Object.values(value)) {
    const match = recursiveMetadataField(child, keys, depth + 1);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
};

const verifyTairaChainMetadata = (metadata) => {
  const chainId = String(
    recursiveMetadataField(metadata, ["chainId", "chain_id", "chain_id_hex"]) ??
      "",
  ).trim();
  const prefix = Number(
    recursiveMetadataField(metadata, [
      "networkPrefix",
      "network_prefix",
      "address_prefix",
    ]),
  );
  if (chainId !== TAIRA_CHAIN_ID || prefix !== TAIRA_NETWORK_PREFIX) {
    throw new Error("TAIRA readback endpoint chain identity is invalid.");
  }
  return { chainId, networkPrefix: prefix };
};

const publicManifestRecords = (value) => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  if (readString(value, "routeId", "route_id", "route", "id")) {
    return [value];
  }
  return [
    ...readArray(value, "manifests"),
    ...readArray(value, "routes"),
    ...readArray(value, "items"),
    ...readArray(value, "data"),
  ].filter(isRecord);
};

const recursiveStringValues = (value, keys, depth = 0) => {
  if (!isRecord(value) || depth > 8) {
    return [];
  }
  const values = [];
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === "string" && child.trim()) {
      values.push(child.trim());
    }
    if (isRecord(child)) {
      values.push(...recursiveStringValues(child, keys, depth + 1));
    }
  }
  return values;
};

const PUBLIC_MANIFEST_PIN_ALIASES = Object.freeze({
  bridgeProgramAddress: [
    "bridgeProgramAddress",
    "bridge_program_address",
    "tairaXorSolanaProgramId",
    "taira_xor_solana_program_id",
    "solanaProgramId",
    "solana_program_id",
  ],
  tokenMintAddress: [
    "tokenMintAddress",
    "token_mint_address",
    "tairaXorTokenMint",
    "taira_xor_token_mint",
    "solanaTokenMint",
    "solana_token_mint",
    "tairaXorTokenAddress",
    "taira_xor_token_address",
    "tokenMint",
    "token_mint",
  ],
  sourceBridgeProgramAddress: [
    "sourceBridgeProgramAddress",
    "source_bridge_program_address",
    "sccpSolanaSourceBridgeAddress",
    "sccp_solana_source_bridge_address",
    "solanaSourceBridgeAddress",
    "solana_source_bridge_address",
    "sourceBridgeProgramId",
    "source_bridge_program_id",
  ],
  verifierProgramAddress: [
    "verifierProgramAddress",
    "verifier_program_address",
    "solanaVerifierProgramId",
    "solana_verifier_program_id",
    "destinationVerifierProgramId",
    "destination_verifier_program_id",
  ],
  nativeVerifierProgramAddress: [
    "nativeVerifierProgramAddress",
    "native_verifier_program_address",
    "nativeVerifierProgramId",
    "native_verifier_program_id",
    "solanaNativeVerifierProgramId",
    "solana_native_verifier_program_id",
  ],
  verifierStateAddress: [
    "verifierStateAddress",
    "verifier_state_address",
    "solanaVerifierStateAddress",
    "solana_verifier_state_address",
  ],
  sourceStateAddress: [
    "sourceStateAddress",
    "source_state_address",
    "solanaSourceStateAddress",
    "solana_source_state_address",
    "sourceBridgeStateAddress",
    "source_bridge_state_address",
    "sccpSolanaSourceStateAddress",
    "sccp_solana_source_state_address",
  ],
  mintAuthorityAddress: [
    "mintAuthorityAddress",
    "mint_authority_address",
    "solanaMintAuthorityAddress",
    "solana_mint_authority_address",
  ],
  verifierCodeHash: ["verifierCodeHash", "verifier_code_hash"],
  verifierKeyHash: ["verifierKeyHash", "verifier_key_hash"],
  destinationBindingHash: [
    "destinationBindingHash",
    "destination_binding_hash",
    "expectedDestinationBindingHashHex",
    "expected_destination_binding_hash_hex",
  ],
  sourceTrustAnchorHash: ["sourceTrustAnchorHash", "source_trust_anchor_hash"],
  consensusVerifierHash: ["consensusVerifierHash", "consensus_verifier_hash"],
  messageInclusionVerifierHash: [
    "messageInclusionVerifierHash",
    "message_inclusion_verifier_hash",
  ],
  finalityPolicyHash: ["finalityPolicyHash", "finality_policy_hash"],
  sourceStateVerifierHash: [
    "sourceStateVerifierHash",
    "source_state_verifier_hash",
  ],
  adapterVerifierVkHash: ["adapterVerifierVkHash", "adapter_verifier_vk_hash"],
  adapterDeploymentReceiptHash: [
    "adapterDeploymentReceiptHash",
    "adapter_deployment_receipt_hash",
    "deploymentReceiptHash",
    "deployment_receipt_hash",
  ],
  settlementAssetDefinitionId: [
    "settlementAssetDefinitionId",
    "settlement_asset_definition_id",
    "taira_burn_record_settlement_asset_definition_id",
  ],
});

const publicManifestPinScope = (manifest, key) => {
  if (
    [
      "sourceTrustAnchorHash",
      "consensusVerifierHash",
      "messageInclusionVerifierHash",
      "finalityPolicyHash",
      "sourceStateVerifierHash",
    ].includes(key)
  ) {
    return (
      readRecord(
        manifest,
        "sourceVerifierMaterial",
        "source_verifier_material",
      ) ?? manifest
    );
  }
  if (["adapterVerifierVkHash", "adapterDeploymentReceiptHash"].includes(key)) {
    return (
      readRecord(
        manifest,
        "sourceAdapterEngineDeployment",
        "source_adapter_engine_deployment",
      ) ?? manifest
    );
  }
  return manifest;
};

const verifyPublicRouteManifestPins = (manifestSet, expectedPins) => {
  const matches = publicManifestRecords(manifestSet).filter(
    (manifest) =>
      readString(manifest, "routeId", "route_id", "route", "id") ===
        SCCP_SOLANA_XOR_ROUTE_ID &&
      readString(manifest, "assetKey", "asset_key", "asset") ===
        SCCP_XOR_ASSET_KEY,
  );
  if (matches.length !== 1) {
    throw new Error(
      "Public TAIRA must expose exactly one taira_sol_xor route manifest.",
    );
  }
  const manifest = matches[0];
  const network = readString(
    manifest,
    "solanaNetwork",
    "solana_network",
    "network",
  ).toLowerCase();
  if (!["solana-testnet", "testnet"].includes(network)) {
    throw new Error("Public taira_sol_xor manifest is not Solana testnet.");
  }
  for (const [key, expected] of Object.entries(expectedPins)) {
    const aliases = PUBLIC_MANIFEST_PIN_ALIASES[key];
    const rawValues = recursiveStringValues(
      publicManifestPinScope(manifest, key),
      aliases,
    );
    const values = new Set(
      rawValues.map((value) =>
        HEX32.test(expected)
          ? normalizeHex32(value, `public manifest ${key}`)
          : value,
      ),
    );
    if (values.size !== 1 || !values.has(expected)) {
      throw new Error(`Public taira_sol_xor manifest ${key} pin is invalid.`);
    }
  }
  return { routeId: SCCP_SOLANA_XOR_ROUTE_ID, assetKey: SCCP_XOR_ASSET_KEY };
};

const jsonResponse = async (
  response,
  label,
  { allowNotFound = false } = {},
) => {
  if (allowNotFound && [404, 405].includes(response.status)) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${label} readback failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (_error) {
    throw new Error(`${label} readback returned invalid JSON.`);
  }
};

const buildReadOnlyLiveEvidenceClients = ({
  solanaRpcUrl,
  toriiUrl,
  fetchImpl = globalThis.fetch,
}) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("Live evidence readback requires fetch.");
  }
  const parseEndpoint = (value, label) => {
    const endpoint = new URL(String(value ?? "").trim());
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    ) {
      throw new Error(`${label} is not a safe HTTP endpoint.`);
    }
    return endpoint;
  };
  const solanaEndpoint = parseEndpoint(solanaRpcUrl, "Solana RPC endpoint");
  const tairaEndpoint = parseEndpoint(toriiUrl, "TAIRA Torii endpoint");
  let rpcId = 0;
  const solanaRpc = async (method, params) => {
    const response = await fetchImpl(solanaEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method,
        params,
      }),
    });
    const payload = await jsonResponse(response, `Solana ${method}`);
    if (!isRecord(payload) || payload.error) {
      throw new Error(`Solana ${method} RPC returned an error.`);
    }
    return payload;
  };
  const tairaUrl = (pathName, query = {}) => {
    const url = new URL(pathName.replace(/^\/+/, ""), `${tairaEndpoint}/`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
    return url;
  };
  const tairaGet = async (pathName, label, options) =>
    jsonResponse(
      await fetchImpl(tairaUrl(pathName), {
        method: "GET",
        headers: { accept: "application/json" },
      }),
      label,
      options,
    );
  return {
    readSolanaGenesisHash: async () => {
      const payload = await solanaRpc("getGenesisHash", []);
      return payload.result;
    },
    readSolanaSignatureStatus: (signature) =>
      solanaRpc("getSignatureStatuses", [
        [signature],
        { searchTransactionHistory: true },
      ]),
    readSolanaTransaction: (signature) =>
      solanaRpc("getTransaction", [
        signature,
        {
          commitment: "finalized",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ]),
    readTairaChainMetadata: async () => {
      const paths = [
        "/v1/chain/metadata",
        "/chain/metadata",
        "/v1/network/metadata",
        "/network/metadata",
        "/v1/network",
        "/network",
        "/v1/explorer/network",
        "/explorer/network",
        "/v1/explorer/chain",
        "/explorer/chain",
      ];
      for (const pathName of paths) {
        const response = await fetchImpl(tairaUrl(pathName), {
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          return jsonResponse(response, "TAIRA chain metadata");
        }
        if (response.status !== 404 && response.status !== 405) {
          throw new Error(
            `TAIRA chain metadata readback failed with HTTP ${response.status}.`,
          );
        }
      }
      if (
        tairaEndpoint.protocol !== "https:" ||
        tairaEndpoint.hostname !== "taira.sora.org"
      ) {
        throw new Error("TAIRA chain metadata readback is unavailable.");
      }
      const capabilities = await tairaGet(
        "/v1/sccp/capabilities",
        "TAIRA SCCP capabilities",
      );
      if (
        Number(capabilities?.local_domain) !== SCCP_SORA_DOMAIN ||
        readString(capabilities, "local_chain") !== "sora"
      ) {
        throw new Error(
          "Canonical TAIRA endpoint capability identity is invalid.",
        );
      }
      return {
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: TAIRA_NETWORK_PREFIX,
        identity_source: "canonical-taira-endpoint-and-sccp-capabilities",
      };
    },
    readTairaTransaction: async (hash) => {
      const transaction = await tairaGet(
        `/v1/transactions/${encodeURIComponent(hash)}`,
        "TAIRA transaction",
        { allowNotFound: true },
      );
      return (
        transaction ??
        tairaGet(
          `/v1/explorer/transactions/${encodeURIComponent(hash)}`,
          "TAIRA explorer transaction",
          { allowNotFound: true },
        )
      );
    },
    readTairaRouteManifest: () =>
      tairaGet("/v1/sccp/manifests", "TAIRA SCCP route manifests"),
    readTairaSccpMessage: async (messageId) => {
      const direct = await tairaGet(
        `/v1/sccp/messages/${encodeURIComponent(messageId)}`,
        "TAIRA SCCP message",
        { allowNotFound: true },
      );
      if (direct) {
        return direct;
      }
      const response = await fetchImpl(
        tairaUrl("/v1/sccp/messages/recent", {
          route_id: SCCP_SOLANA_XOR_ROUTE_ID,
          limit: 100,
        }),
        { method: "GET", headers: { accept: "application/json" } },
      );
      const payload = await jsonResponse(
        response,
        "TAIRA SCCP recent messages",
      );
      const items = Array.isArray(payload)
        ? payload
        : [...readArray(payload, "items"), ...readArray(payload, "messages")];
      return (
        items.find((item) => {
          try {
            return (
              normalizeHex32(
                readString(item, "messageId", "message_id"),
                "TAIRA SCCP message id",
              ) === messageId
            );
          } catch (_error) {
            return false;
          }
        }) ?? null
      );
    },
  };
};

const priorTransactionIds = (preflightReport) => {
  const check = readArray(preflightReport, "checks").find(
    (entry) =>
      readStringValue(entry, "id") === "post-deploy-live-evidence" &&
      entry?.status === "pass",
  );
  const evidence = readRecord(check, "evidence");
  return new Set(
    [
      readString(
        evidence,
        "sourceEventSignature",
        "sourceEventTransactionSignature",
        "sourceEventTransactionId",
      ),
      readString(
        evidence,
        "routeCanarySignature",
        "routeCanaryTransactionSignature",
        "routeCanaryTransactionId",
      ),
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  );
};

const assertNoTransactionReuse = (liveEvidence, preflightReport) => {
  const entries = [
    ["tairaToSolana.tairaSourceTx", liveEvidence.tairaToSolana.tairaSourceTx],
    ["tairaToSolana.solanaTxId", liveEvidence.tairaToSolana.solanaTxId],
    ["solanaToTaira.solanaSourceTx", liveEvidence.solanaToTaira.solanaSourceTx],
    [
      "solanaToTaira.tairaSettlementTx",
      liveEvidence.solanaToTaira.tairaSettlementTx,
    ],
  ];
  const prior = priorTransactionIds(preflightReport);
  const seen = new Map();
  for (const [label, value] of entries) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(
        `Live evidence reuses one transaction for ${seen.get(normalized)} and ${label}.`,
      );
    }
    if (prior.has(normalized)) {
      throw new Error(
        `${label} reuses a deployment or route-canary transaction.`,
      );
    }
    seen.set(normalized, label);
  }
};

export const verifySolanaLiveTransferReadbacks = async ({
  liveEvidence,
  preflightReport,
  solanaRpcUrl,
  toriiUrl,
  readbacks,
  fetchImpl,
} = {}) => {
  if (!isRecord(liveEvidence)) {
    throw new Error("Normalized Solana live evidence is required.");
  }
  const pins = extractSolanaLiveManifestPins(preflightReport);
  assertNoTransactionReuse(liveEvidence, preflightReport);
  const clients =
    readbacks ??
    buildReadOnlyLiveEvidenceClients({
      solanaRpcUrl:
        solanaRpcUrl || readString(preflightReport?.solana, "rpcUrl"),
      toriiUrl: toriiUrl || readString(preflightReport?.taira, "toriiUrl"),
      fetchImpl,
    });
  for (const method of [
    "readSolanaGenesisHash",
    "readSolanaSignatureStatus",
    "readSolanaTransaction",
    "readTairaChainMetadata",
    "readTairaTransaction",
    "readTairaRouteManifest",
    "readTairaSccpMessage",
  ]) {
    if (typeof clients?.[method] !== "function") {
      throw new Error(
        `Live evidence readback dependency ${method} is missing.`,
      );
    }
  }

  const firstGenesis = await clients.readSolanaGenesisHash();
  if (firstGenesis !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error("Solana RPC is not canonical testnet.");
  }
  const firstTairaIdentity = verifyTairaChainMetadata(
    await clients.readTairaChainMetadata(),
  );
  const firstManifestIdentity = verifyPublicRouteManifestPins(
    await clients.readTairaRouteManifest(),
    pins,
  );
  const [
    finalizeStatusRaw,
    finalizeTransactionRaw,
    sourceStatusRaw,
    sourceTransactionRaw,
    tairaSourceRaw,
    tairaSettlementRaw,
    forwardMessageRaw,
    reverseMessageRaw,
  ] = await Promise.all([
    clients.readSolanaSignatureStatus(liveEvidence.tairaToSolana.solanaTxId),
    clients.readSolanaTransaction(liveEvidence.tairaToSolana.solanaTxId),
    clients.readSolanaSignatureStatus(
      liveEvidence.solanaToTaira.solanaSourceTx,
    ),
    clients.readSolanaTransaction(liveEvidence.solanaToTaira.solanaSourceTx),
    clients.readTairaTransaction(liveEvidence.tairaToSolana.tairaSourceTx),
    clients.readTairaTransaction(liveEvidence.solanaToTaira.tairaSettlementTx),
    clients.readTairaSccpMessage(liveEvidence.tairaToSolana.messageId),
    clients.readTairaSccpMessage(liveEvidence.solanaToTaira.messageId),
  ]);
  normalizeSolanaSignatureStatus(
    finalizeStatusRaw,
    "TAIRA-to-Solana finalize signature status",
  );
  normalizeSolanaSignatureStatus(
    sourceStatusRaw,
    "Solana-to-TAIRA source signature status",
  );
  const finalizeTransaction = normalizeSolanaTransactionReadback(
    finalizeTransactionRaw,
    liveEvidence.tairaToSolana.solanaTxId,
    "TAIRA-to-Solana finalize transaction",
  );
  const sourceTransaction = normalizeSolanaTransactionReadback(
    sourceTransactionRaw,
    liveEvidence.solanaToTaira.solanaSourceTx,
    "Solana-to-TAIRA source transaction",
  );
  const forwardSolana = verifyTairaToSolanaTransaction({
    transaction: finalizeTransaction,
    liveEvidence: liveEvidence.tairaToSolana,
    pins,
  });
  const reverseSolana = verifySolanaToTairaTransaction({
    transaction: sourceTransaction,
    liveEvidence: liveEvidence.solanaToTaira,
    pins,
  });
  const tairaSource = verifyTairaTransactionRecord({
    record: tairaSourceRaw,
    transactionHash: liveEvidence.tairaToSolana.tairaSourceTx,
    messageId: liveEvidence.tairaToSolana.messageId,
    amountBaseUnits: liveEvidence.tairaToSolana.amountBaseUnits,
    direction: "taira_to_solana",
    payloadHash: forwardSolana.payloadHash,
    pins,
  });
  const tairaSettlement = verifyTairaTransactionRecord({
    record: tairaSettlementRaw,
    transactionHash: liveEvidence.solanaToTaira.tairaSettlementTx,
    messageId: liveEvidence.solanaToTaira.messageId,
    amountBaseUnits: liveEvidence.solanaToTaira.amountBaseUnits,
    direction: "solana_to_taira",
    sourceTransactionId: liveEvidence.solanaToTaira.solanaSourceTx,
    tairaRecipient: reverseSolana.tairaRecipient,
    sourceEventHash: reverseSolana.sourceEventHash,
    pins,
  });
  const forwardMessage = verifyTairaSccpMessageRecord({
    raw: forwardMessageRaw,
    messageId: liveEvidence.tairaToSolana.messageId,
    amountBaseUnits: liveEvidence.tairaToSolana.amountBaseUnits,
    direction: "taira_to_solana",
    sourceTransactionId: liveEvidence.tairaToSolana.tairaSourceTx,
    destinationTransactionId: liveEvidence.tairaToSolana.solanaTxId,
    accountBindings: {
      destinationTokenAccount: forwardSolana.destinationTokenAccount,
    },
    payloadHash: forwardSolana.payloadHash,
    pins,
  });
  const reverseMessage = verifyTairaSccpMessageRecord({
    raw: reverseMessageRaw,
    messageId: liveEvidence.solanaToTaira.messageId,
    amountBaseUnits: liveEvidence.solanaToTaira.amountBaseUnits,
    direction: "solana_to_taira",
    sourceTransactionId: liveEvidence.solanaToTaira.solanaSourceTx,
    destinationTransactionId: liveEvidence.solanaToTaira.tairaSettlementTx,
    accountBindings: {
      solanaOwner: reverseSolana.owner,
      sourceTokenAccount: reverseSolana.sourceTokenAccount,
      tairaRecipient: reverseSolana.tairaRecipient,
    },
    sourceEventHash: reverseSolana.sourceEventHash,
    pins,
  });
  const [secondGenesis, secondTairaMetadata, secondManifestSet] =
    await Promise.all([
      clients.readSolanaGenesisHash(),
      clients.readTairaChainMetadata(),
      clients.readTairaRouteManifest(),
    ]);
  if (secondGenesis !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error("Solana RPC cluster identity changed during readback.");
  }
  const secondTairaIdentity = verifyTairaChainMetadata(secondTairaMetadata);
  const secondManifestIdentity = verifyPublicRouteManifestPins(
    secondManifestSet,
    pins,
  );
  if (
    JSON.stringify(firstTairaIdentity) !==
      JSON.stringify(secondTairaIdentity) ||
    JSON.stringify(firstManifestIdentity) !==
      JSON.stringify(secondManifestIdentity)
  ) {
    throw new Error(
      "TAIRA endpoint or public route identity changed during readback.",
    );
  }
  return {
    ready: true,
    readOnly: true,
    solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    taira: firstTairaIdentity,
    manifestPins: pins,
    tairaToSolana: {
      tairaSource,
      solanaFinalize: forwardSolana,
      message: forwardMessage,
    },
    solanaToTaira: {
      solanaSource: reverseSolana,
      tairaSettlement,
      message: reverseMessage,
    },
  };
};

const compareRequiredLiveEvidenceHash = ({ actual, expected, id, label }) => {
  if (!actual) {
    return {
      id,
      detail: `${label} is required in live evidence.`,
    };
  }
  let expectedHash = "";
  try {
    expectedHash = normalizeOptionalHash32(expected, `${label} expected hash`);
  } catch (error) {
    return {
      id,
      detail: `${label} expected hash is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!expectedHash) {
    return {
      id,
      detail: `${label} is missing from the freshly loaded production package.`,
    };
  }
  if (actual !== expectedHash) {
    return {
      id,
      detail: `${label} ${actual} does not match diagnostics value ${expectedHash}.`,
    };
  }
  return null;
};

export const solanaLiveEvidencePackageHashProblems = ({
  liveEvidence,
  diagnostics,
} = {}) =>
  [
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.activationPackageHash,
      expected: diagnostics?.activationPackage?.activationPackageHash,
      id: "live-evidence-activation-package-hash",
      label: "activationPackageHash",
    }),
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.operatorHandoffHash,
      expected: diagnostics?.operatorHandoff?.handoffHash,
      id: "live-evidence-operator-handoff-hash",
      label: "operatorHandoffHash",
    }),
  ].filter(Boolean);

const loadLiveEvidence = async (file) => {
  if (!file) {
    throw new Error(
      "--live-evidence is required after route preflight passes.",
    );
  }
  const liveEvidencePath = path.resolve(file);
  const evidence = await readStableJsonFile(liveEvidencePath, {
    label: "Solana live transfer evidence",
  });
  return normalizeSolanaLiveTransferEvidence(evidence, {
    evidencePath: liveEvidencePath,
  });
};

const writeSuccessfulArtifacts = async ({
  outputDir,
  preflightReport,
  preflightReportPath,
  liveEvidence,
  authoritativeReadback,
  successEvidencePolicy,
  freshProductionGateReport,
  freshProductionGatePath,
}) => {
  await ensureSafeOutputDirectory(outputDir);
  const transcript = {
    schema: "iroha-demo-sccp-solana-live-video/v1",
    ready: true,
    routeId: "taira_sol_xor",
    checkedAt: new Date().toISOString(),
    preflightReady: preflightReport.ready,
    diagnosticVideoOnly: false,
    notLiveTransferEvidence: false,
    successEvidencePolicy: {
      ...successEvidencePolicy,
      preflight: {
        freshlyComputed: true,
        suppliedReportUsed: false,
        skipSolanaRpc: false,
        reportPath: preflightReportPath,
        checkedAt: preflightReport.checkedAt ?? null,
        toriiUrl: preflightReport.taira?.toriiUrl ?? null,
        solanaRpcUrl: preflightReport.solana?.rpcUrl ?? null,
      },
      productionGate: {
        freshlyComputed: true,
        suppliedReportUsed: false,
        reportPath: freshProductionGatePath,
        checkedAt: freshProductionGateReport?.checkedAt ?? null,
        ready: freshProductionGateReport?.ready === true,
        failedCheckIds: readArray(freshProductionGateReport, "checks")
          .filter((check) => check?.status !== "pass")
          .map((check) => readStringValue(check, "id"))
          .filter(Boolean),
      },
      activationPackageHash: liveEvidence.activationPackageHash,
      operatorHandoffHash: liveEvidence.operatorHandoffHash,
    },
    authoritativeReadbackVerified: authoritativeReadback?.ready === true,
    authoritativeReadback,
    liveEvidence,
  };
  const subtitleText = `WEBVTT

00:00.000 --> 00:05.000
Step 1: Public TAIRA published a production-ready ${SCCP_SOLANA_XOR_ROUTE_ID} manifest and the route preflight passed.

00:05.000 --> 00:10.000
Step 2: The TAIRA wallet submitted source transaction ${liveEvidence.tairaToSolana.tairaSourceTx} and burn-record SCCP message ${liveEvidence.tairaToSolana.messageId}.

00:10.000 --> 00:15.000
Step 3: The connected Solana wallet approved finalize on testnet transaction ${liveEvidence.tairaToSolana.solanaTxId}.

00:15.000 --> 00:20.000
Step 4: The Solana wallet submitted the return burn transaction ${liveEvidence.solanaToTaira.solanaSourceTx}.

00:20.000 --> 00:25.000
Step 5: TAIRA accepted the bound Solana source proof in settlement transaction ${liveEvidence.solanaToTaira.tairaSettlementTx}.

00:25.000 --> 00:30.000
Step 6: Canonical testnet and TAIRA readbacks proved both finalized transactions, exact manifest pins, SCCP message bindings, and successful XOR state deltas.
`;
  const subtitleCues = parseWebVttCues(subtitleText);
  transcript.subtitleCues = subtitleCues;
  transcript.subtitleSummary = summarizeSubtitleCues(subtitleCues);
  const transcriptPath = path.join(outputDir, "sccp-solana-live-video.json");
  const subtitlesPath = path.join(outputDir, "sccp-solana-live-video.vtt");
  const videoPath = path.join(outputDir, "sccp-solana-live-video.mp4");
  const stagingSuffix = `.next-${randomUUID()}`;
  const stagingSubtitlesPath = `${subtitlesPath}${stagingSuffix}`;
  const stagingVideoPath = `${videoPath}${stagingSuffix}`;
  await Promise.all(
    [
      transcriptPath,
      subtitlesPath,
      videoPath,
      stagingSubtitlesPath,
      stagingVideoPath,
    ].map((file) => assertSafeOutputDestination(file)),
  );
  transcript.videoArtifacts = [
    { path: videoPath, mediaType: "video/mp4" },
    { path: subtitlesPath, mediaType: "text/vtt" },
  ];
  try {
    await writeAtomicFile(stagingSubtitlesPath, subtitleText);
    transcript.mediaVerification = renderSolanaLiveVideoMp4({
      subtitlesPath: stagingSubtitlesPath,
      videoPath: stagingVideoPath,
      durationSeconds: 31,
      subtitleSummary: transcript.subtitleSummary,
    });
    commitGeneratedFileSync(stagingVideoPath, videoPath);
    await rename(stagingSubtitlesPath, subtitlesPath);
  } catch (error) {
    await Promise.all([
      rm(stagingSubtitlesPath, { force: true }).catch(() => {}),
      rm(stagingVideoPath, { force: true }).catch(() => {}),
    ]);
    throw error;
  }
  await writeAtomicJsonFile(transcriptPath, transcript);
  return { transcriptPath, subtitlesPath, videoPath, report: transcript };
};

export const removeStaleSuccessfulArtifacts = async (outputDir) => {
  await ensureSafeOutputDirectory(outputDir);
  await Promise.all(
    [
      "sccp-solana-live-video.json",
      "sccp-solana-live-video.vtt",
      "sccp-solana-live-video.mp4",
    ].map((file) => rm(path.join(outputDir, file), { force: true })),
  );
};

export const runSccpSolanaLiveVideoGate = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  let pinnedProductionGateSnapshot = null;
  let pinnedPreLiveInputSnapshot = null;
  if (
    options.productionGateSnapshot !== undefined ||
    options.productionGateSnapshotSha256 !== undefined
  ) {
    try {
      pinnedProductionGateSnapshot = await readPinnedProductionGateSnapshot({
        file: options.productionGateSnapshot,
        expectedSha256: options.productionGateSnapshotSha256,
      });
      const { validateSolanaProductionGatePreLiveInputSnapshot } = await import(
        "./sccp-solana-production-gate.mjs"
      );
      const report = pinnedProductionGateSnapshot.report;
      pinnedPreLiveInputSnapshot =
        validateSolanaProductionGatePreLiveInputSnapshot(
          report?.preLiveInputSnapshot,
        );
      const nonVideoFailures = readArray(report, "failedCheckIds").filter(
        (id) => id !== "live-bidirectional-video",
      );
      if (
        report?.schema !== "iroha-demo-sccp-solana-production-gate/v1" ||
        report?.routeId !== SCCP_SOLANA_XOR_ROUTE_ID ||
        report?.preLiveInputSnapshotSha256 !==
          pinnedPreLiveInputSnapshot.preLiveInputSnapshotSha256 ||
        report?.successExecutionPolicy?.ready !== true ||
        nonVideoFailures.length > 0
      ) {
        throw new Error(
          `Pinned pre-live production gate is not success-eligible: ${
            nonVideoFailures.join(", ") || "success-execution-policy"
          }.`,
        );
      }
    } catch (error) {
      const reason = `Solana SCCP live video blocked: pinned production-gate snapshot validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      const preflightReport = {
        schema: "iroha-demo-sccp-solana-route-preflight/v1",
        ready: false,
        routeId: SCCP_SOLANA_XOR_ROUTE_ID,
        checks: [
          {
            id: "pinned-production-gate-snapshot",
            status: "fail",
            detail: reason,
          },
        ],
      };
      const blocked = await writeBlockedArtifacts({
        outputDir,
        preflightReport,
        reason,
        diagnostics: buildSolanaLiveVideoBlockedDiagnostics({}),
        successPrerequisiteProblems: [
          { id: "pinned-production-gate-snapshot", detail: reason },
        ],
      });
      return {
        ready: false,
        reason,
        successEvidencePolicy: null,
        preflightReportPath: null,
        ...blocked,
      };
    }
  }
  const snapshotPath = (id, fallback) =>
    pinnedPreLiveInputSnapshot?.inputs?.[id]?.path ?? fallback;
  const productionRequirementsPath = path.resolve(
    options.productionRequirements ||
      snapshotPath("requirements", DEFAULT_PRODUCTION_REQUIREMENTS_PATH),
  );
  const publishReadinessPath = path.resolve(
    options.publishReadiness ||
      snapshotPath("publishReadiness", DEFAULT_PUBLISH_READINESS_PATH),
  );
  const routePublicationRequestPath = path.resolve(
    options.routePublicationRequest ||
      snapshotPath(
        "routePublicationRequest",
        DEFAULT_ROUTE_PUBLICATION_REQUEST_PATH,
      ),
  );
  const smokeReadinessPath = path.resolve(
    options.smokeReadiness ||
      snapshotPath("smokeReadiness", DEFAULT_SMOKE_READINESS_PATH),
  );
  const handoffVerificationPath = path.resolve(
    options.handoffVerification ||
      snapshotPath("handoffVerification", DEFAULT_HANDOFF_VERIFICATION_PATH),
  );
  const proofMaterialBundlePath = path.resolve(
    options.proofMaterialBundle ||
      snapshotPath("proofMaterialBundle", DEFAULT_PROOF_MATERIAL_BUNDLE_PATH),
  );
  const activationPackagePath = path.resolve(
    options.activationPackage ||
      snapshotPath("activationPackage", DEFAULT_ACTIVATION_PACKAGE_PATH),
  );
  const deploymentVideoTranscriptPath = path.resolve(
    options.deploymentVideoTranscript ||
      snapshotPath(
        "deploymentVideoTranscript",
        DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH,
      ),
  );
  const operatorHandoffPath = path.resolve(
    options.operatorHandoff ||
      snapshotPath("operatorHandoff", DEFAULT_OPERATOR_HANDOFF_PATH),
  );
  let productionGatePath = path.resolve(
    options.productionGate ||
      pinnedProductionGateSnapshot?.path ||
      DEFAULT_PRODUCTION_GATE_PATH,
  );
  const suppliedPreflightReportPath =
    typeof options.preflightReport === "string" &&
    options.preflightReport.trim()
      ? path.resolve(options.preflightReport)
      : null;
  const readPrerequisite = (id, file) =>
    pinnedPreLiveInputSnapshot
      ? readPinnedPreLiveSnapshotJson(pinnedPreLiveInputSnapshot, id)
      : readJsonIfExists(file);
  let [
    productionRequirementsReport,
    publishReadinessReport,
    routePublicationRequestReport,
    smokeReadinessReport,
    handoffVerificationReport,
    proofMaterialBundleReport,
    activationPackageReport,
    deploymentVideoTranscriptReport,
    operatorHandoffReport,
    productionGateReport,
  ] = await Promise.all([
    readPrerequisite("requirements", productionRequirementsPath),
    readPrerequisite("publishReadiness", publishReadinessPath),
    readPrerequisite("routePublicationRequest", routePublicationRequestPath),
    readPrerequisite("smokeReadiness", smokeReadinessPath),
    readPrerequisite("handoffVerification", handoffVerificationPath),
    readPrerequisite("proofMaterialBundle", proofMaterialBundlePath),
    readPrerequisite("activationPackage", activationPackagePath),
    readPrerequisite(
      "deploymentVideoTranscript",
      deploymentVideoTranscriptPath,
    ),
    readPrerequisite("operatorHandoff", operatorHandoffPath),
    pinnedProductionGateSnapshot
      ? pinnedProductionGateSnapshot.report
      : readJsonIfExists(productionGatePath),
  ]);
  let diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
    productionRequirementsReport,
    productionRequirementsPath,
    publishReadinessReport,
    publishReadinessPath,
    routePublicationRequestReport,
    routePublicationRequestPath,
    smokeReadinessReport,
    smokeReadinessPath,
    handoffVerificationReport,
    handoffVerificationPath,
    proofMaterialBundleReport,
    proofMaterialBundlePath,
    activationPackageReport,
    activationPackagePath,
    deploymentVideoTranscriptReport,
    deploymentVideoTranscriptPath,
    operatorHandoffReport,
    operatorHandoffPath,
    productionGateReport,
    productionGatePath,
  });
  const staticallyEligiblePolicy = buildSolanaLiveVideoSuccessEvidencePolicy({
    options,
    diagnostics,
    freshPreflightCompleted: true,
    freshProductionGateCompleted: true,
  });
  const suppliedPreflightReport = suppliedPreflightReportPath
    ? await readJsonIfExists(suppliedPreflightReportPath)
    : null;
  let preflightResult;
  let freshPreflightCompleted = false;
  if (staticallyEligiblePolicy.ready) {
    try {
      preflightResult = await runSccpSolanaRoutePreflight({
        toriiUrl: options.toriiUrl,
        solanaRpcUrl: options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
        outputDir: path.join(outputDir, "preflight"),
        fetchTimeoutMs: options.fetchTimeoutMs,
        fetchAttempts: options.fetchAttempts,
        skipSolanaRpc: false,
      });
      freshPreflightCompleted = true;
    } catch (error) {
      preflightResult = {
        report: {
          schema: "iroha-demo-sccp-solana-route-preflight/v1",
          ready: false,
          routeId: SCCP_SOLANA_XOR_ROUTE_ID,
          assetKey: SCCP_XOR_ASSET_KEY,
          checks: [
            {
              id: "fresh-public-preflight",
              status: "fail",
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
        },
        reportPath: null,
      };
    }
  } else if (suppliedPreflightReport) {
    preflightResult = {
      report: suppliedPreflightReport,
      reportPath: suppliedPreflightReportPath,
    };
  } else {
    try {
      preflightResult = await runSccpSolanaRoutePreflight({
        toriiUrl: options.toriiUrl,
        solanaRpcUrl: options.solanaRpcUrl || DEFAULT_SOLANA_TESTNET_RPC_URL,
        outputDir: path.join(outputDir, "preflight"),
        fetchTimeoutMs: options.fetchTimeoutMs,
        fetchAttempts: options.fetchAttempts,
        skipSolanaRpc: options.skipSolanaRpc,
      });
    } catch (error) {
      preflightResult = {
        report: {
          schema: "iroha-demo-sccp-solana-route-preflight/v1",
          ready: false,
          routeId: SCCP_SOLANA_XOR_ROUTE_ID,
          assetKey: SCCP_XOR_ASSET_KEY,
          checks: [
            {
              id: "diagnostic-preflight",
              status: "fail",
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
        },
        reportPath: null,
      };
    }
  }
  const { report: preflightReport, reportPath } = preflightResult;

  let freshProductionGateCompleted = false;
  let freshProductionGateReport = null;
  let freshProductionGatePath = null;
  if (staticallyEligiblePolicy.ready && freshPreflightCompleted) {
    try {
      const { runSccpSolanaProductionGate } = await import(
        "./sccp-solana-production-gate.mjs"
      );
      const freshGate = await runSccpSolanaProductionGate({
        ...productionGateOptionsFromPreLiveSnapshot({
          snapshot: pinnedPreLiveInputSnapshot,
          outputDir,
        }),
        toriiUrl: options.toriiUrl,
        solanaRpcUrl: options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
        outputDir: path.join(outputDir, "fresh-production-gate"),
        fetchTimeoutMs: options.fetchTimeoutMs,
        fetchAttempts: options.fetchAttempts,
        skipSolanaRpc: false,
      });
      const nonVideoFailures = readArray(
        freshGate.report,
        "failedCheckIds",
      ).filter((id) => id !== "live-bidirectional-video");
      if (
        freshGate.report?.preLiveInputSnapshotSha256 !==
          pinnedPreLiveInputSnapshot?.preLiveInputSnapshotSha256 ||
        freshGate.report?.successExecutionPolicy?.ready !== true ||
        nonVideoFailures.length > 0
      ) {
        throw new Error(
          `Fresh production gate did not reproduce the pinned success-eligible input snapshot: ${
            nonVideoFailures.join(", ") || "snapshot-or-success-policy"
          }.`,
        );
      }
      freshProductionGateCompleted = true;
      freshProductionGateReport = freshGate.report;
      freshProductionGatePath = freshGate.reportPath;
      productionGateReport = freshGate.report;
      productionGatePath = freshGate.reportPath;
      diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
        productionRequirementsReport,
        productionRequirementsPath,
        publishReadinessReport,
        publishReadinessPath,
        routePublicationRequestReport,
        routePublicationRequestPath,
        smokeReadinessReport,
        smokeReadinessPath,
        handoffVerificationReport,
        handoffVerificationPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
        activationPackageReport,
        activationPackagePath,
        deploymentVideoTranscriptReport,
        deploymentVideoTranscriptPath,
        operatorHandoffReport,
        operatorHandoffPath,
        productionGateReport,
        productionGatePath,
      });
    } catch (error) {
      freshProductionGateReport = {
        ready: false,
        checks: [
          {
            id: "fresh-production-gate",
            status: "fail",
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
  const successEvidencePolicy = buildSolanaLiveVideoSuccessEvidencePolicy({
    options,
    diagnostics,
    freshPreflightCompleted,
    freshProductionGateCompleted,
  });
  if (!successEvidencePolicy.ready) {
    const reason = `Solana SCCP live video blocked: success evidence policy failed (${successEvidencePolicy.problems
      .map((problem) => problem.id)
      .join(", ")}).`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems: successEvidencePolicy.problems,
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  if (!preflightReport.ready) {
    const reason =
      "Solana SCCP live video blocked: public TAIRA Solana route preflight is not ready.";
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  const successPrerequisiteProblems =
    solanaLiveVideoSuccessPrerequisiteProblems({ diagnostics });
  if (successPrerequisiteProblems.length > 0) {
    const reason = `Solana SCCP live video blocked: production prerequisites are not ready (${successPrerequisiteProblems
      .map((problem) => problem.id)
      .join(", ")}).`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems,
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  let liveEvidence;
  try {
    liveEvidence = await loadLiveEvidence(options.liveEvidence);
  } catch (error) {
    const reason = `Solana SCCP live video blocked: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  const packageHashProblems = solanaLiveEvidencePackageHashProblems({
    liveEvidence,
    diagnostics,
  });
  if (packageHashProblems.length > 0) {
    const reason = `Solana SCCP live video blocked: live evidence package hashes do not match (${packageHashProblems
      .map((problem) => problem.id)
      .join(", ")}).`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems: packageHashProblems,
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  let authoritativeReadback;
  try {
    authoritativeReadback = await verifySolanaLiveTransferReadbacks({
      liveEvidence,
      preflightReport,
      solanaRpcUrl: options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
      toriiUrl: options.toriiUrl,
    });
  } catch (error) {
    const reason = `Solana SCCP live video blocked: authoritative live readback failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems: [
        { id: "authoritative-live-transfer-readback", detail: reason },
      ],
    });
    return {
      ready: false,
      reason,
      successEvidencePolicy,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  const artifacts = await writeSuccessfulArtifacts({
    outputDir,
    preflightReport,
    preflightReportPath: reportPath,
    liveEvidence,
    authoritativeReadback,
    successEvidencePolicy,
    freshProductionGateReport,
    freshProductionGatePath,
  });
  return {
    ready: true,
    reason: "Solana SCCP live video generated from validated live evidence.",
    successEvidencePolicy,
    preflightReportPath: reportPath,
    ...artifacts,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (args["write-live-evidence-template"]) {
    const templatePath = await writeSolanaLiveTransferEvidenceTemplate(
      args["write-live-evidence-template"],
    );
    console.log(`Solana SCCP live evidence template: ${templatePath}`);
    return;
  }
  const result = await runSccpSolanaLiveVideoGate({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    fetchTimeoutMs: args["fetch-timeout-ms"],
    fetchAttempts: args["fetch-attempts"],
    liveEvidence: args["live-evidence"],
    preflightReport: args["preflight-report"],
    productionRequirements: args["production-requirements"],
    publishReadiness: args["publish-readiness"],
    routePublicationRequest: args["route-publication-request"],
    smokeReadiness: args["smoke-readiness"],
    handoffVerification: args["handoff-verification"],
    proofMaterialBundle: args["proof-material-bundle"],
    activationPackage: args["activation-package"],
    deploymentVideoTranscript: args["deployment-video-transcript"],
    operatorHandoff: args["operator-handoff"],
    productionGate: args["production-gate"],
    productionGateSnapshot: args["production-gate-snapshot"],
    productionGateSnapshotSha256: args["production-gate-snapshot-sha256"],
    outputDir: args["output-dir"],
    skipSolanaRpc: args["skip-solana-rpc"],
  });
  console.log(`Solana SCCP video gate report: ${result.transcriptPath}`);
  console.log(`Solana SCCP video subtitles: ${result.subtitlesPath}`);
  if (result.videoPath) {
    console.log(`Solana SCCP MP4: ${result.videoPath}`);
  }
  console.log(`Solana SCCP preflight report: ${result.preflightReportPath}`);
  if (!result.ready) {
    console.error(result.reason);
    if (!args["allow-incomplete"]) {
      process.exitCode = 1;
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      if (process.exitCode && process.exitCode !== 0) {
        process.exit(process.exitCode);
      }
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.stack || error.message : error,
      );
      process.exit(1);
    });
}

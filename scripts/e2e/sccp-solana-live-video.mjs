#!/usr/bin/env node
/* global BigInt, globalThis */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fstatSync, readSync } from "node:fs";
import { lstat, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import QRCode from "qrcode";
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
  SOLANA_SCCP_REGISTRY_PATH,
  canonicalSccpJson,
  canonicalSccpObjectSha256,
  selectExactSolanaRegistryRoute,
  summarizeExactSolanaRegistryRoute,
} from "./sccp-solana-exact-registry.mjs";
import {
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV,
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
} from "./sccp-solana-exact-prover-governance.mjs";
import {
  parseSolanaGovernanceCanonicalJsonBytes,
  parseSolanaGovernanceDuplicateFreeJsonText,
} from "./sccp-solana-governance-json.mjs";
import {
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH,
  SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS,
  SOLANA_LIVE_CAPTURE_WITNESS_IDS,
  SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN,
  analyzeSolanaLiveCaptureWitnessFrames,
  buildSolanaLiveCaptureReviewSigningPackage,
  buildSolanaLiveCaptureWitnessPayloads,
  buildUnreviewedSolanaLiveCaptureReview,
  decodeSolanaLiveCaptureWitnessQr,
  normalizeSolanaLiveCaptureReviewPolicy,
  normalizeSolanaLiveCaptureWitness,
  verifySolanaLiveCaptureReviewAttestation,
} from "./sccp-solana-live-capture-witness.mjs";
import {
  assertSafeOutputDestination,
  commitGeneratedFileSync,
  DEFAULT_SOLANA_TEXT_MAX_BYTES,
  ensureSafeOutputDirectory,
  parseStrictCliArgs,
  readStableJsonFileIfExists,
  readStableRegularFile,
  removeGeneratedFileSync,
  withStableRegularFileDescriptorsSync,
  writeAtomicFile,
  writeAtomicJsonFile,
} from "./sccp-solana-report-io.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-solana-live-video");
const DEFAULT_DEPLOY_DIR = path.join(repoRoot, "output/sccp-solana-deploy");
const DEFAULT_SMOKE_READINESS_PATH = path.join(
  repoRoot,
  "output/sccp-solana-smoke-readiness",
  "latest.json",
);
const DEFAULT_GOVERNANCE_PLAN_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-governance-plan.json",
);
const DEFAULT_GOVERNANCE_REGISTER_RESULT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-governance-register.json",
);
const DEFAULT_GOVERNANCE_ACTIVATE_RESULT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-governance-activate.json",
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
const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
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
const SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED = "sccp-mint-authority-v1";
const MAX_SOLANA_LIVE_CAPTURE_BYTES = 2 * 1024 * 1024 * 1024;
const SOLANA_LIVE_CAPTURE_MIN_DURATION_SECONDS = 40;
const SOLANA_LIVE_CAPTURE_MAX_DURATION_SECONDS = 60 * 60;
const SOLANA_LIVE_CAPTURE_MIN_WIDTH = 640;
const SOLANA_LIVE_CAPTURE_MIN_HEIGHT = 360;
const SOLANA_LIVE_CAPTURE_MIN_SAMPLED_FRAMES = 10;
const SOLANA_LIVE_CAPTURE_MIN_UNIQUE_FRAMES = 4;
const SOLANA_LIVE_CAPTURE_MIN_AUDIO_MAX_VOLUME_DB = -45;
const SOLANA_LIVE_CAPTURE_PROBE_TIMEOUT_MS = 120_000;
const SOLANA_LIVE_CAPTURE_ESSENCE_TIMEOUT_MS = 5 * 60_000;
const SOLANA_LIVE_CAPTURE_PROBE_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const SUCCESS_PREREQUISITE_OVERRIDE_OPTIONS = Object.freeze([
  ["governancePlan", "governance-plan"],
  ["governanceRegistration", "governance-registration"],
  ["governanceActivation", "governance-activation"],
  ["smokeReadiness", "smoke-readiness"],
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
  } else if (video.codec_name !== "h264") {
    blockers.push("video-codec-h264");
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
      "write-live-capture-witness-kit",
      "write-live-capture-witness-review-request",
      "write-live-capture-review-signing-package",
      "live-capture-marker-times-ms",
      "preflight-report",
      "governance-plan",
      "governance-register-result",
      "governance-activate-result",
      "smoke-readiness",
      "production-gate",
      "production-gate-snapshot",
      "production-gate-snapshot-sha256",
      "prover-governance-approval-sha256",
      "live-capture-video",
      "live-capture-video-sha256",
      "live-capture-witness",
      "live-capture-witness-sha256",
      "live-capture-review-attestation",
      "live-capture-review-attestation-sha256",
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
  --write-live-capture-witness-kit DIR
                         Write four exact QR cards after live evidence exists; never edits video
  --write-live-capture-witness-review-request PATH
                         Scan four supplied marker times in a pinned capture and write a human-review request
  --write-live-capture-review-signing-package PATH
                         Validate a pinned reviewed witness and emit exact domain-separated bytes/hash for external signing; accepts no private key
  --live-capture-marker-times-ms CSV
                         Four ordered center times for the review request (milliseconds)
  --preflight-report PATH
                         Diagnostic-only preflight override; can never produce success
  --governance-plan PATH
                         Reviewed exact Solana governance plan for diagnostics
  --governance-register-result PATH
                         Staged-registration governance result for diagnostics
  --governance-activate-result PATH
                         Bidirectional-activation governance result for diagnostics
  --smoke-readiness PATH
                         Solana app smoke-readiness report for blocked diagnostics
  --production-gate PATH
                         Production-gate snapshot for blocked diagnostics only
  --production-gate-snapshot PATH
                         Exact pre-live production-gate report required for success
  --production-gate-snapshot-sha256 HASH
                         Exact SHA-256 of --production-gate-snapshot
  --live-capture-video PATH
                         Real H.264/AAC screen capture of the completed bidirectional transfer
  --live-capture-video-sha256 HASH
                         Independently pinned SHA-256 of --live-capture-video
  --live-capture-witness PATH
                         Independently reviewed semantic frame-witness JSON
  --live-capture-witness-sha256 HASH
                         Independently pinned SHA-256 of --live-capture-witness
  --live-capture-review-attestation PATH
                         Detached threshold-Ed25519 review attestation JSON
  --live-capture-review-attestation-sha256 HASH
                         Independently pinned SHA-256 of the detached attestation
  --prover-governance-approval-sha256 HASH
                         Independent exact prover-approval artifact hash
                         (env: ${SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV})
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

export const parseSolanaLiveVideoPinnedJsonBytes = (bytes, label) => {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} must be supplied as stable bytes.`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error(`${label} must contain valid UTF-8.`);
  }
  return parseSolanaGovernanceDuplicateFreeJsonText(text, label);
};

export const parseSolanaLiveCaptureCanonicalArtifactBytes = (bytes, label) => {
  const value = parseSolanaLiveVideoPinnedJsonBytes(bytes, label);
  if (!isRecord(value)) {
    throw new Error(`${label} must contain one JSON object.`);
  }
  const canonicalBytes = Buffer.from(`${canonicalSccpJson(value)}\n`, "utf8");
  if (!canonicalBytes.equals(bytes)) {
    throw new Error(
      `${label} must use exact compact canonical SCCP JSON plus one LF.`,
    );
  }
  return value;
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
  const report = parseSolanaLiveVideoPinnedJsonBytes(
    bytes,
    "Pinned pre-live Solana production-gate report",
  );
  return { path: resolved, sha256: actual, report };
};

const readPinnedLiveCaptureWitness = async ({ file, expectedSha256 }) => {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(String(expectedSha256 ?? "").toLowerCase())
  ) {
    throw new Error(
      "Solana live-video success requires a semantic capture witness path and exact canonical SHA-256.",
    );
  }
  const resolved = path.resolve(file);
  const bytes = await readStableRegularFile(resolved, {
    label: "Pinned Solana live capture semantic witness",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== String(expectedSha256).toLowerCase()) {
    throw new Error(
      `Pinned Solana live capture witness SHA-256 mismatch: expected ${expectedSha256}, got ${actual}.`,
    );
  }
  const witness = parseSolanaLiveCaptureCanonicalArtifactBytes(
    bytes,
    "Pinned Solana live capture semantic witness",
  );
  return {
    path: resolved,
    size: bytes.length,
    sha256: actual,
    witness,
  };
};

const readPinnedLiveCaptureReviewAttestation = async ({
  file,
  expectedSha256,
}) => {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(String(expectedSha256 ?? "").toLowerCase())
  ) {
    throw new Error(
      "Solana live-video success requires a detached capture-review attestation path and exact canonical SHA-256.",
    );
  }
  const resolved = path.resolve(file);
  const bytes = await readStableRegularFile(resolved, {
    label: "Pinned Solana live capture review attestation",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== String(expectedSha256).toLowerCase()) {
    throw new Error(
      `Pinned Solana live capture review attestation SHA-256 mismatch: expected ${expectedSha256}, got ${actual}.`,
    );
  }
  const attestation = parseSolanaLiveCaptureCanonicalArtifactBytes(
    bytes,
    "Pinned Solana live capture review attestation",
  );
  return {
    path: resolved,
    size: bytes.length,
    sha256: actual,
    attestation,
  };
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
  return parseSolanaLiveVideoPinnedJsonBytes(
    bytes,
    `Pinned Solana live-video prerequisite ${id}`,
  );
};

const readPinnedCaptureReviewTrust = async ({
  snapshot,
  expectedProverGovernanceApprovalSha256,
}) => {
  const approvalEntry = snapshot?.inputs?.proverGovernanceApproval;
  const policyEntry = snapshot?.inputs?.captureReviewPolicy;
  if (!approvalEntry?.present || !policyEntry?.present) {
    throw new Error(
      "Pinned pre-live snapshot is missing the prover approval or capture-review policy.",
    );
  }
  const readExact = async (entry, label) => {
    const bytes = await readStableRegularFile(entry.path, {
      label,
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    });
    const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.length !== entry.size || sha256 !== entry.sha256) {
      throw new Error(`${label} changed after the pre-live snapshot.`);
    }
    const value = parseSolanaGovernanceCanonicalJsonBytes(bytes, label);
    if (!isRecord(value)) {
      throw new Error(`${label} must contain one canonical JSON object.`);
    }
    return { bytes, sha256, value };
  };
  const approval = await readExact(
    approvalEntry,
    "Pinned exact Solana prover-governance approval",
  );
  const canonicalApprovalBytes = Buffer.from(
    `${canonicalSolanaExactProverApprovalJson(approval.value)}\n`,
    "utf8",
  );
  if (!canonicalApprovalBytes.equals(approval.bytes)) {
    throw new Error(
      "Pinned exact Solana prover-governance approval is not compact canonical JSON.",
    );
  }
  const approvalValidation = buildExactSolanaProductionProverApprovalValidation(
    {
      approvalRecord: approval.value,
      approvalPath: approvalEntry.path,
      approvalSha256: approval.sha256,
      expectedApprovalSha256: expectedProverGovernanceApprovalSha256,
    },
  );
  if (!approvalValidation.ready) {
    throw new Error(
      "Pinned exact Solana prover-governance approval v2 failed fresh validation.",
    );
  }
  const policy = await readExact(
    policyEntry,
    "Pinned Solana live capture review policy",
  );
  const canonicalPolicyBytes = Buffer.from(
    `${canonicalSccpJson(policy.value)}\n`,
    "utf8",
  );
  if (!canonicalPolicyBytes.equals(policy.bytes)) {
    throw new Error(
      "Pinned Solana live capture review policy is not compact canonical SCCP JSON.",
    );
  }
  const normalizedPolicy = normalizeSolanaLiveCaptureReviewPolicy(
    policy.value,
    {
      actualPolicySha256: policy.sha256,
      expectedPolicySha256: approvalValidation.pins.captureReviewPolicySha256,
    },
  );
  return {
    approvalValidation,
    policy: normalizedPolicy,
    policyPath: policyEntry.path,
    policySha256: policy.sha256,
  };
};

export const productionGateOptionsFromPreLiveSnapshot = ({
  snapshot,
  productionGateReport,
  outputDir,
  proverGovernanceApprovalSha256,
}) => {
  const pathFor = (id) => snapshot.inputs[id].path;
  return {
    captureReviewPolicy: pathFor("captureReviewPolicy"),
    captureReviewPolicySha256: snapshot.inputs.captureReviewPolicy.sha256,
    proverGovernanceApproval: pathFor("proverGovernanceApproval"),
    governancePlan: pathFor("governancePlan"),
    governancePlanSha256: productionGateReport?.governanceEvidence?.planSha256,
    governanceRegistration: pathFor("governanceRegistration"),
    governanceRegistrationSha256: snapshot.inputs.governanceRegistration.sha256,
    governanceActivation: pathFor("governanceActivation"),
    governanceActivationSha256: snapshot.inputs.governanceActivation.sha256,
    orderedInitializationEvidence: pathFor("orderedInitializationEvidence"),
    orderedInitializationEvidenceSha256:
      snapshot.inputs.orderedInitializationEvidence.sha256,
    smokeReadiness: pathFor("smokeReadiness"),
    liveVideoTranscript: path.join(outputDir, "sccp-solana-live-video.json"),
    liveVideoMp4: path.join(outputDir, "sccp-solana-live-video.mp4"),
    liveVideoVtt: path.join(outputDir, "sccp-solana-live-video.vtt"),
    expectedPreLiveInputSnapshotSha256: snapshot.preLiveInputSnapshotSha256,
    proverGovernanceApprovalSha256,
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

const webVttTimestampMilliseconds = (value) => {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/u.exec(
    String(value ?? ""),
  );
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  if (
    !Number.isSafeInteger(hours) ||
    minutes >= 60 ||
    seconds >= 60 ||
    milliseconds >= 1000
  ) {
    return null;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
};

const canonicalSubtitleCueTimeline = (subtitleCues) => {
  if (!Array.isArray(subtitleCues)) return null;
  const normalized = subtitleCues.map((cue, index) => {
    const startMilliseconds = webVttTimestampMilliseconds(cue?.start);
    const endMilliseconds = webVttTimestampMilliseconds(cue?.end);
    const text = typeof cue?.text === "string" ? cue.text : null;
    if (
      startMilliseconds === null ||
      endMilliseconds === null ||
      endMilliseconds <= startMilliseconds ||
      text === null
    ) {
      return null;
    }
    const parsedStep = Number(text.match(/^Step\s+(\d+):/u)?.[1] ?? 0);
    return {
      index: index + 1,
      startMilliseconds,
      endMilliseconds,
      text,
      step:
        Number.isSafeInteger(parsedStep) && parsedStep > 0 ? parsedStep : null,
    };
  });
  return normalized.every(Boolean) ? normalized : null;
};

export const summarizeSolanaLiveVideoSubtitleCues = (subtitleCues) => {
  const cueTexts = subtitleCues.map((cue) => cue.text);
  const cueTimeline = canonicalSubtitleCueTimeline(subtitleCues);
  return {
    cueCount: subtitleCues.length,
    numberedStepCount: new Set(
      subtitleCues
        .map((cue) => cue.step)
        .filter((step) => Number.isSafeInteger(step) && step > 0),
    ).size,
    cueTextSha256: cueTextHash(cueTexts),
    cueTimelineSha256: cueTimeline
      ? sha256Hex(canonicalSccpJson(cueTimeline))
      : null,
  };
};

const hashStableMediaDescriptor = (fd) => {
  const info = fstatSync(fd);
  const digest = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  while (offset < info.size) {
    const bytesRead = readSync(
      fd,
      chunk,
      0,
      Math.min(chunk.length, info.size - offset),
      offset,
    );
    if (bytesRead <= 0) {
      throw new Error("Solana live capture ended while it was being hashed.");
    }
    digest.update(chunk.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return {
    size: info.size,
    sha256: `0x${digest.digest("hex")}`,
  };
};

const parseFrameMd5Hashes = (output) =>
  String(output ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").at(-1)?.trim().toLowerCase() ?? "")
    .filter((value) => /^[0-9a-f]{32,64}$/u.test(value));

const parseAudioMaxVolumeDb = (output) => {
  const matches = [
    ...String(output ?? "").matchAll(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/giu),
  ];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? value : null;
};

const parseDecodedEssenceSha256 = (output, streamType) => {
  const match = new RegExp(`^0,${streamType},SHA256=([0-9a-f]{64})$`, "u").exec(
    String(output ?? "").trim(),
  );
  return match ? `0x${match[1]}` : null;
};

const hashDecodedMediaEssence = ({ descriptorFd, streamType }) => {
  if (!Number.isInteger(descriptorFd) || !["v", "a"].includes(streamType)) {
    throw new Error("Stable decoded-essence descriptor is invalid.");
  }
  const streamArgs =
    streamType === "v"
      ? [
          "-map",
          "0:v:0",
          "-c:v",
          "rawvideo",
          "-fps_mode:v",
          "passthrough",
          "-an",
        ]
      : ["-map", "0:a:0", "-c:a", "pcm_f32le", "-vn"];
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-bitexact",
      "-xerror",
      "-max_error_rate",
      "0",
      "-abort_on",
      "empty_output_stream",
      "-err_detect",
      "explode",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      "/dev/fd/3",
      ...streamArgs,
      "-f",
      "streamhash",
      "-hash",
      "sha256",
      "pipe:1",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe", descriptorFd],
      timeout: SOLANA_LIVE_CAPTURE_ESSENCE_TIMEOUT_MS,
      maxBuffer: 1024,
    },
  );
  const sha256 =
    result.status === 0
      ? parseDecodedEssenceSha256(result.stdout, streamType)
      : null;
  if (!sha256) {
    throw new Error(
      `ffmpeg failed strict full decoded ${streamType === "v" ? "video" : "audio"} essence hashing: ${String(result.stderr ?? "")}`,
    );
  }
  return sha256;
};

const sampleHashSequenceSha256 = (hashes) =>
  Array.isArray(hashes) && hashes.length > 0
    ? `0x${createHash("sha256").update(hashes.join("\n"), "utf8").digest("hex")}`
    : null;

const normalizedStreamTimeline = (stream) => {
  const timeBase = String(stream?.time_base ?? "");
  const startTime = String(stream?.start_time ?? "");
  const duration = String(stream?.duration ?? "");
  const frameCountText = String(
    stream?.nb_read_frames ?? stream?.nb_frames ?? "",
  );
  const frameCount = Number(frameCountText);
  const ready =
    /^\d+\/[1-9]\d*$/u.test(timeBase) &&
    /^-?\d+(?:\.\d+)?$/u.test(startTime) &&
    /^\d+(?:\.\d+)?$/u.test(duration) &&
    Number.isSafeInteger(frameCount) &&
    frameCount > 0;
  return {
    ready,
    timeBase: ready ? timeBase : null,
    startTime: ready ? startTime : null,
    duration: ready ? duration : null,
    frameCount: ready ? frameCount : null,
  };
};

export const buildSolanaLiveCaptureInspection = ({
  ffprobe = null,
  frameHashes = [],
  audioFrameHashes = [],
  audioMaxVolumeDb = null,
  size = null,
  sha256 = null,
  videoEssenceSha256 = null,
  audioEssenceSha256 = null,
  semanticWitnessAnalysis = null,
  expectedSubtitleCount = null,
} = {}) => {
  const streams = Array.isArray(ffprobe?.streams) ? ffprobe.streams : [];
  const videoStreams = streams.filter(
    (stream) => stream?.codec_type === "video",
  );
  const audioStreams = streams.filter(
    (stream) => stream?.codec_type === "audio",
  );
  const subtitleStreams = streams.filter(
    (stream) => stream?.codec_type === "subtitle",
  );
  const unexpectedStreams = streams.filter(
    (stream) => !["video", "audio", "subtitle"].includes(stream?.codec_type),
  );
  const video = videoStreams[0] ?? null;
  const audio = audioStreams[0] ?? null;
  const videoTimeline = normalizedStreamTimeline(video);
  const audioTimeline = normalizedStreamTimeline(audio);
  const durationSeconds = Number(ffprobe?.format?.duration);
  const width = Number(video?.width);
  const height = Number(video?.height);
  const normalizedFrameHashes = Array.isArray(frameHashes)
    ? frameHashes.filter((value) => /^[0-9a-f]{32,64}$/u.test(String(value)))
    : [];
  const uniqueFrameCount = new Set(normalizedFrameHashes).size;
  const normalizedAudioFrameHashes = Array.isArray(audioFrameHashes)
    ? audioFrameHashes.filter((value) =>
        /^[0-9a-f]{32,64}$/u.test(String(value)),
      )
    : [];
  const formatName = String(ffprobe?.format?.format_name ?? "");
  const blockers = [];
  if (!Number.isSafeInteger(size) || size <= 0) blockers.push("capture-bytes");
  if (!/^0x[0-9a-f]{64}$/u.test(String(sha256 ?? ""))) {
    blockers.push("capture-sha256");
  }
  if (!video) {
    blockers.push("capture-video-stream");
  } else if (video.codec_name !== "h264") {
    blockers.push("capture-video-codec-h264");
  } else if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < SOLANA_LIVE_CAPTURE_MIN_WIDTH ||
    height < SOLANA_LIVE_CAPTURE_MIN_HEIGHT
  ) {
    blockers.push("capture-video-resolution");
  }
  if (videoStreams.length !== 1) {
    blockers.push("capture-video-stream-shape");
  }
  if (!audio) {
    blockers.push("capture-audio-stream");
  } else if (audio.codec_name !== "aac") {
    blockers.push("capture-audio-codec-aac");
  }
  if (audioStreams.length !== 1) {
    blockers.push("capture-audio-stream-shape");
  }
  if (
    Number.isSafeInteger(expectedSubtitleCount) &&
    (subtitleStreams.length !== expectedSubtitleCount ||
      (expectedSubtitleCount === 1 &&
        subtitleStreams[0]?.codec_name !== "mov_text"))
  ) {
    blockers.push("capture-subtitle-stream-shape");
  }
  if (unexpectedStreams.length > 0) {
    blockers.push("capture-unexpected-streams");
  }
  if (
    Number.isSafeInteger(expectedSubtitleCount) &&
    (!videoTimeline.ready || !audioTimeline.ready)
  ) {
    blockers.push("capture-stream-timeline");
  }
  if (!/(^|,)mov|mp4|m4a|3gp|3g2|mj2(,|$)/u.test(formatName)) {
    blockers.push("capture-container-mp4");
  }
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < SOLANA_LIVE_CAPTURE_MIN_DURATION_SECONDS ||
    durationSeconds > SOLANA_LIVE_CAPTURE_MAX_DURATION_SECONDS
  ) {
    blockers.push("capture-duration");
  }
  if (normalizedFrameHashes.length < SOLANA_LIVE_CAPTURE_MIN_SAMPLED_FRAMES) {
    blockers.push("capture-frame-samples");
  }
  if (uniqueFrameCount < SOLANA_LIVE_CAPTURE_MIN_UNIQUE_FRAMES) {
    blockers.push("capture-frame-variation");
  }
  if (normalizedAudioFrameHashes.length === 0) {
    blockers.push("capture-audio-samples");
  }
  if (
    !Number.isFinite(audioMaxVolumeDb) ||
    audioMaxVolumeDb < SOLANA_LIVE_CAPTURE_MIN_AUDIO_MAX_VOLUME_DB
  ) {
    blockers.push("capture-non-silent-audio");
  }
  if (!/^0x[0-9a-f]{64}$/u.test(String(videoEssenceSha256 ?? ""))) {
    blockers.push("capture-full-video-essence");
  }
  if (!/^0x[0-9a-f]{64}$/u.test(String(audioEssenceSha256 ?? ""))) {
    blockers.push("capture-full-audio-essence");
  }
  if (
    semanticWitnessAnalysis?.ready !== true ||
    semanticWitnessAnalysis?.semanticallyBound !== true
  ) {
    blockers.push("capture-semantic-witness");
  }
  if (
    semanticWitnessAnalysis?.reviewAuthentication?.ready !== true ||
    semanticWitnessAnalysis?.reviewAuthentication?.authenticated !== true
  ) {
    blockers.push("capture-review-authentication");
  }
  return {
    ready: blockers.length === 0,
    verifiedRealCapture: blockers.length === 0,
    size: Number.isSafeInteger(size) ? size : null,
    sha256: /^0x[0-9a-f]{64}$/u.test(String(sha256 ?? "")) ? sha256 : null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    streams: {
      video: video
        ? {
            present: true,
            codec: video.codec_name ?? null,
            width: Number.isFinite(width) ? width : null,
            height: Number.isFinite(height) ? height : null,
          }
        : { present: false },
      audio: audio
        ? { present: true, codec: audio.codec_name ?? null }
        : { present: false },
    },
    sampledFrameCount: normalizedFrameHashes.length,
    uniqueFrameCount,
    sampledFrameSha256: sampleHashSequenceSha256(normalizedFrameHashes),
    audioSampleCount: normalizedAudioFrameHashes.length,
    audioSampleSha256: sampleHashSequenceSha256(normalizedAudioFrameHashes),
    videoEssenceSha256: /^0x[0-9a-f]{64}$/u.test(
      String(videoEssenceSha256 ?? ""),
    )
      ? videoEssenceSha256
      : null,
    audioEssenceSha256: /^0x[0-9a-f]{64}$/u.test(
      String(audioEssenceSha256 ?? ""),
    )
      ? audioEssenceSha256
      : null,
    audioMaxVolumeDb: Number.isFinite(audioMaxVolumeDb)
      ? audioMaxVolumeDb
      : null,
    semanticWitnessAnalysis,
    streamShape: {
      videoCount: videoStreams.length,
      audioCount: audioStreams.length,
      subtitleCount: subtitleStreams.length,
      expectedSubtitleCount: Number.isSafeInteger(expectedSubtitleCount)
        ? expectedSubtitleCount
        : null,
      subtitleCodec: subtitleStreams[0]?.codec_name ?? null,
      unexpectedCount: unexpectedStreams.length,
    },
    streamTimeline: {
      video: videoTimeline,
      audio: audioTimeline,
    },
    thresholds: {
      minimumDurationSeconds: SOLANA_LIVE_CAPTURE_MIN_DURATION_SECONDS,
      maximumDurationSeconds: SOLANA_LIVE_CAPTURE_MAX_DURATION_SECONDS,
      minimumWidth: SOLANA_LIVE_CAPTURE_MIN_WIDTH,
      minimumHeight: SOLANA_LIVE_CAPTURE_MIN_HEIGHT,
      minimumSampledFrames: SOLANA_LIVE_CAPTURE_MIN_SAMPLED_FRAMES,
      minimumUniqueFrames: SOLANA_LIVE_CAPTURE_MIN_UNIQUE_FRAMES,
      minimumAudioMaxVolumeDb: SOLANA_LIVE_CAPTURE_MIN_AUDIO_MAX_VOLUME_DB,
    },
    blockers,
  };
};

const extractNormalizedSemanticWitnessFrame = ({
  descriptorFd,
  atMilliseconds,
  timeoutMs = SOLANA_LIVE_CAPTURE_PROBE_TIMEOUT_MS,
}) => {
  if (!Number.isInteger(descriptorFd)) {
    throw new Error("Stable semantic witness frame descriptor is missing.");
  }
  const frame = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      (atMilliseconds / 1000).toFixed(3),
      "-i",
      "/dev/fd/3",
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      `scale=${SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH}:${SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH}:${SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=gray`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    {
      encoding: null,
      stdio: ["ignore", "pipe", "pipe", descriptorFd],
      timeout: timeoutMs,
      maxBuffer:
        SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH *
        SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT *
        2,
    },
  );
  if (frame.status !== 0) {
    throw new Error(
      `ffmpeg failed to extract a semantic witness frame: ${String(frame.stderr ?? "")}`,
    );
  }
  const grayscaleBytes = new Uint8Array(
    frame.stdout.buffer,
    frame.stdout.byteOffset,
    frame.stdout.byteLength,
  );
  return {
    normalizedFrameSha256: `0x${createHash("sha256")
      .update(grayscaleBytes)
      .digest("hex")}`,
    decodedPayload: decodeSolanaLiveCaptureWitnessQr({ grayscaleBytes }),
  };
};

const extractSemanticWitnessSamples = ({ normalizedWitness, descriptorFd }) =>
  normalizedWitness.markers.map((marker) => ({
    id: marker.id,
    atMilliseconds: marker.atMilliseconds,
    dwellFrames: SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS.map(
      (offsetMilliseconds) => ({
        offsetMilliseconds,
        ...extractNormalizedSemanticWitnessFrame({
          descriptorFd,
          atMilliseconds: marker.atMilliseconds + offsetMilliseconds,
        }),
      }),
    ),
  }));

export const buildSolanaGeneratedLiveVideoBinding = ({
  inspection,
  sourceCapture,
  embeddedSubtitleSummary,
  subtitleSummary,
}) => {
  const subtitleMatches =
    embeddedSubtitleSummary?.cueCount === subtitleSummary?.cueCount &&
    embeddedSubtitleSummary?.numberedStepCount ===
      subtitleSummary?.numberedStepCount &&
    embeddedSubtitleSummary?.cueTextSha256 === subtitleSummary?.cueTextSha256 &&
    /^0x[0-9a-f]{64}$/u.test(
      String(embeddedSubtitleSummary?.cueTimelineSha256 ?? ""),
    ) &&
    embeddedSubtitleSummary?.cueTimelineSha256 ===
      subtitleSummary?.cueTimelineSha256;
  const durationMatches =
    Number.isFinite(Number(inspection?.durationSeconds)) &&
    Number.isFinite(Number(sourceCapture?.durationSeconds)) &&
    Math.abs(
      Number(inspection.durationSeconds) -
        Number(sourceCapture.durationSeconds),
    ) <= 0.05;
  const streamShapeMatches =
    inspection?.streams?.video?.codec === "h264" &&
    sourceCapture?.streams?.video?.codec === "h264" &&
    inspection?.streams?.audio?.codec === "aac" &&
    sourceCapture?.streams?.audio?.codec === "aac" &&
    inspection?.streams?.video?.width ===
      sourceCapture?.streams?.video?.width &&
    inspection?.streams?.video?.height ===
      sourceCapture?.streams?.video?.height &&
    inspection?.streamShape?.videoCount === 1 &&
    inspection?.streamShape?.audioCount === 1 &&
    inspection?.streamShape?.subtitleCount === 1 &&
    inspection?.streamShape?.subtitleCodec === "mov_text" &&
    inspection?.streamShape?.unexpectedCount === 0 &&
    sourceCapture?.streamShape?.videoCount === 1 &&
    sourceCapture?.streamShape?.audioCount === 1 &&
    sourceCapture?.streamShape?.subtitleCount === 0 &&
    sourceCapture?.streamShape?.unexpectedCount === 0;
  const streamTimelineMatches =
    inspection?.streamTimeline?.video?.ready === true &&
    inspection?.streamTimeline?.audio?.ready === true &&
    sourceCapture?.streamTimeline?.video?.ready === true &&
    sourceCapture?.streamTimeline?.audio?.ready === true &&
    canonicalSccpJson(inspection.streamTimeline.video) ===
      canonicalSccpJson(sourceCapture.streamTimeline.video) &&
    canonicalSccpJson(inspection.streamTimeline.audio) ===
      canonicalSccpJson(sourceCapture.streamTimeline.audio);
  const sourceContentMatches =
    durationMatches &&
    streamShapeMatches &&
    streamTimelineMatches &&
    inspection?.sampledFrameSha256 === sourceCapture?.sampledFrameSha256 &&
    inspection?.audioSampleSha256 === sourceCapture?.audioSampleSha256 &&
    inspection?.videoEssenceSha256 === sourceCapture?.videoEssenceSha256 &&
    inspection?.audioEssenceSha256 === sourceCapture?.audioEssenceSha256 &&
    canonicalSccpJson(inspection?.semanticWitnessAnalysis?.markers ?? []) ===
      canonicalSccpJson(sourceCapture?.semanticWitnessAnalysis?.markers ?? []);
  const blockers = Array.isArray(inspection?.blockers)
    ? [...inspection.blockers]
    : ["generated-media-inspection"];
  if (!subtitleMatches) blockers.push("generated-embedded-vtt-binding");
  if (!sourceContentMatches) {
    blockers.push("generated-source-capture-content-binding");
  }
  return {
    ...inspection,
    ready: blockers.length === 0,
    verifiedGeneratedMedia: blockers.length === 0,
    embeddedSubtitleSummary,
    subtitleMatches,
    durationMatches,
    streamShapeMatches,
    streamTimelineMatches,
    sourceContentMatches,
    blockers,
  };
};

const renderPinnedSolanaLiveCapture = ({
  captureVideoPath,
  expectedCaptureSha256,
  captureWitness,
  captureReviewAttestation,
  captureWitnessArtifactSha256,
  captureReviewPolicy,
  liveEvidence,
  preLiveInputSnapshotSha256,
  subtitlesPath,
  temporaryVideoPath,
}) => {
  if (process.platform === "win32") {
    throw new Error(
      "Stable descriptor-bound Solana live capture verification is unavailable on Windows.",
    );
  }
  const expected = String(expectedCaptureSha256 ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(expected)) {
    throw new Error(
      "Solana live capture requires an independently supplied lowercase 0x SHA-256.",
    );
  }
  return withStableRegularFileDescriptorsSync(
    captureVideoPath,
    (
      [
        probeFd,
        frameFd,
        audioFd,
        videoEssenceFd,
        audioEssenceFd,
        muxFd,
        hashFd,
        ...semanticFrameFds
      ],
      resolved,
    ) => {
      const descriptorPath = "/dev/fd/3";
      const childOptions = (fd) => ({
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe", fd],
        timeout: SOLANA_LIVE_CAPTURE_PROBE_TIMEOUT_MS,
        maxBuffer: SOLANA_LIVE_CAPTURE_PROBE_MAX_BUFFER_BYTES,
      });
      const artifact = hashStableMediaDescriptor(hashFd);
      if (artifact.sha256 !== expected) {
        throw new Error(
          `Solana live capture SHA-256 mismatch: expected ${expected}, got ${artifact.sha256}.`,
        );
      }
      const ffprobe = spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_entries",
          "format=duration,format_name:stream=index,codec_name,codec_type,width,height,time_base,start_time,duration,nb_frames,nb_read_frames",
          "-of",
          "json",
          descriptorPath,
        ],
        childOptions(probeFd),
      );
      if (ffprobe.status !== 0) {
        throw new Error(
          `ffprobe failed to inspect the Solana live capture: ${ffprobe.stderr || ffprobe.stdout}`,
        );
      }
      let mediaProbe;
      try {
        mediaProbe = JSON.parse(ffprobe.stdout || "{}");
      } catch {
        throw new Error("ffprobe returned invalid Solana live capture JSON.");
      }
      const normalizedWitness = normalizeSolanaLiveCaptureWitness(
        captureWitness,
        {
          liveEvidence,
          preLiveInputSnapshotSha256,
          expectedCaptureSha256: artifact.sha256,
          reviewPolicySha256: captureReviewPolicy.policySha256,
          durationSeconds: Number(mediaProbe?.format?.duration),
        },
      );
      const captureReviewAuthentication =
        verifySolanaLiveCaptureReviewAttestation({
          attestation: captureReviewAttestation,
          witness: normalizedWitness,
          witnessArtifactSha256: captureWitnessArtifactSha256,
          reviewPolicy: captureReviewPolicy,
        });
      const semanticSamples = extractSemanticWitnessSamples({
        normalizedWitness,
        descriptorFd: semanticFrameFds[0],
      });
      const semanticWitnessAnalysis = analyzeSolanaLiveCaptureWitnessFrames({
        witness: normalizedWitness,
        samples: semanticSamples,
      });
      semanticWitnessAnalysis.reviewAuthentication =
        captureReviewAuthentication;
      const frames = spawnSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          descriptorPath,
          "-an",
          "-vf",
          "fps=1,scale=160:-2",
          "-f",
          "framemd5",
          "pipe:1",
        ],
        childOptions(frameFd),
      );
      if (frames.status !== 0) {
        throw new Error(
          `ffmpeg failed to sample the Solana live capture: ${frames.stderr || frames.stdout}`,
        );
      }
      const audio = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-nostats",
          "-i",
          descriptorPath,
          "-map",
          "0:a:0",
          "-af",
          "volumedetect",
          "-f",
          "framemd5",
          "pipe:1",
        ],
        childOptions(audioFd),
      );
      if (audio.status !== 0) {
        throw new Error(
          `ffmpeg failed to analyze Solana live capture audio: ${audio.stderr || audio.stdout}`,
        );
      }
      const inspection = buildSolanaLiveCaptureInspection({
        ffprobe: mediaProbe,
        frameHashes: parseFrameMd5Hashes(frames.stdout),
        audioFrameHashes: parseFrameMd5Hashes(audio.stdout),
        audioMaxVolumeDb: parseAudioMaxVolumeDb(audio.stderr),
        videoEssenceSha256: hashDecodedMediaEssence({
          descriptorFd: videoEssenceFd,
          streamType: "v",
        }),
        audioEssenceSha256: hashDecodedMediaEssence({
          descriptorFd: audioEssenceFd,
          streamType: "a",
        }),
        semanticWitnessAnalysis,
        expectedSubtitleCount: 0,
        ...artifact,
      });
      if (!inspection.ready) {
        throw new Error(
          `Solana live capture is blank, silent, too short, or otherwise invalid: ${inspection.blockers.join(", ")}.`,
        );
      }
      const mux = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          descriptorPath,
          "-i",
          subtitlesPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0",
          "-map",
          "1:s:0",
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-c:s",
          "mov_text",
          "-movflags",
          "+faststart",
          temporaryVideoPath,
        ],
        childOptions(muxFd),
      );
      if (mux.status !== 0) {
        throw new Error(
          `ffmpeg failed to mux the Solana live capture: ${mux.stderr || mux.stdout}`,
        );
      }
      return {
        path: resolved,
        mediaType: "video/mp4",
        semanticWitness: normalizedWitness,
        ...inspection,
      };
    },
    {
      label: "Pinned real Solana bidirectional live capture",
      maxBytes: MAX_SOLANA_LIVE_CAPTURE_BYTES,
      descriptorCount: 8,
    },
  );
};

const inspectGeneratedSolanaLiveVideoMp4 = ({
  file,
  sourceCapture,
  captureWitness,
  captureReviewAttestation,
  captureWitnessArtifactSha256,
  captureReviewPolicy,
  liveEvidence,
  preLiveInputSnapshotSha256,
  subtitleSummary,
}) =>
  withStableRegularFileDescriptorsSync(
    file,
    ([
      probeFd,
      frameFd,
      audioFd,
      subtitleFd,
      videoEssenceFd,
      audioEssenceFd,
      hashFd,
      semanticFd,
    ]) => {
      const descriptorPath = "/dev/fd/3";
      const run = (command, args, fd, encoding = "utf8") =>
        spawnSync(command, args, {
          encoding,
          stdio: ["ignore", "pipe", "pipe", fd],
          timeout: SOLANA_LIVE_CAPTURE_PROBE_TIMEOUT_MS,
          maxBuffer: SOLANA_LIVE_CAPTURE_PROBE_MAX_BUFFER_BYTES,
        });
      const artifact = hashStableMediaDescriptor(hashFd);
      const probe = run(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_entries",
          "format=duration,format_name:stream=index,codec_name,codec_type,width,height,time_base,start_time,duration,nb_frames,nb_read_frames",
          "-of",
          "json",
          descriptorPath,
        ],
        probeFd,
      );
      if (probe.status !== 0) {
        throw new Error("Final Solana MP4 ffprobe verification failed.");
      }
      let parsed;
      try {
        parsed = JSON.parse(probe.stdout || "{}");
      } catch {
        throw new Error("Final Solana MP4 ffprobe JSON is invalid.");
      }
      const normalizedWitness = normalizeSolanaLiveCaptureWitness(
        captureWitness,
        {
          liveEvidence,
          preLiveInputSnapshotSha256,
          expectedCaptureSha256: sourceCapture.sha256,
          reviewPolicySha256: captureReviewPolicy.policySha256,
          durationSeconds: Number(parsed?.format?.duration),
        },
      );
      const captureReviewAuthentication =
        verifySolanaLiveCaptureReviewAttestation({
          attestation: captureReviewAttestation,
          witness: normalizedWitness,
          witnessArtifactSha256: captureWitnessArtifactSha256,
          reviewPolicy: captureReviewPolicy,
        });
      const semanticWitnessAnalysis = analyzeSolanaLiveCaptureWitnessFrames({
        witness: normalizedWitness,
        samples: extractSemanticWitnessSamples({
          normalizedWitness,
          descriptorFd: semanticFd,
        }),
      });
      semanticWitnessAnalysis.reviewAuthentication =
        captureReviewAuthentication;
      const frames = run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          descriptorPath,
          "-an",
          "-vf",
          "fps=1,scale=160:-2",
          "-f",
          "framemd5",
          "pipe:1",
        ],
        frameFd,
      );
      const audio = run(
        "ffmpeg",
        [
          "-hide_banner",
          "-nostats",
          "-i",
          descriptorPath,
          "-map",
          "0:a:0",
          "-af",
          "volumedetect",
          "-f",
          "framemd5",
          "pipe:1",
        ],
        audioFd,
      );
      const subtitles = run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          descriptorPath,
          "-map",
          "0:s:0",
          "-f",
          "webvtt",
          "pipe:1",
        ],
        subtitleFd,
      );
      if (frames.status !== 0 || audio.status !== 0 || subtitles.status !== 0) {
        throw new Error(
          "Final Solana MP4 frame, audio, or embedded-subtitle verification failed.",
        );
      }
      const inspection = buildSolanaLiveCaptureInspection({
        ffprobe: parsed,
        frameHashes: parseFrameMd5Hashes(frames.stdout),
        audioFrameHashes: parseFrameMd5Hashes(audio.stdout),
        audioMaxVolumeDb: parseAudioMaxVolumeDb(audio.stderr),
        videoEssenceSha256: hashDecodedMediaEssence({
          descriptorFd: videoEssenceFd,
          streamType: "v",
        }),
        audioEssenceSha256: hashDecodedMediaEssence({
          descriptorFd: audioEssenceFd,
          streamType: "a",
        }),
        semanticWitnessAnalysis,
        expectedSubtitleCount: 1,
        ...artifact,
      });
      const embeddedSubtitleSummary = summarizeSolanaLiveVideoSubtitleCues(
        parseWebVttCues(subtitles.stdout),
      );
      return buildSolanaGeneratedLiveVideoBinding({
        inspection,
        sourceCapture,
        embeddedSubtitleSummary,
        subtitleSummary,
      });
    },
    {
      label: "Generated Solana SCCP live MP4",
      maxBytes: MAX_SOLANA_LIVE_CAPTURE_BYTES,
      descriptorCount: 8,
    },
  );

export const renderSolanaLiveVideoMp4 = ({
  subtitlesPath,
  videoPath,
  durationSeconds,
  subtitleSummary,
  liveCaptureVideo = null,
  liveCaptureVideoSha256 = null,
  liveCaptureWitness = null,
  liveCaptureReviewAttestation = null,
  liveCaptureWitnessArtifactSha256 = null,
  captureReviewPolicy = null,
  liveEvidence = null,
  preLiveInputSnapshotSha256 = null,
}) => {
  if (!commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required to render the Solana SCCP MP4.");
  }
  if (
    liveCaptureVideo &&
    path.resolve(liveCaptureVideo) === path.resolve(videoPath)
  ) {
    throw new Error(
      "The real Solana live capture cannot be overwritten by the generated MP4.",
    );
  }
  const temporaryVideoPath = path.join(
    path.dirname(videoPath),
    `.${path.basename(videoPath)}.${process.pid}.${randomUUID()}.tmp.mp4`,
  );
  try {
    let sourceCapture = null;
    if (liveCaptureVideo) {
      sourceCapture = renderPinnedSolanaLiveCapture({
        captureVideoPath: liveCaptureVideo,
        expectedCaptureSha256: liveCaptureVideoSha256,
        captureWitness: liveCaptureWitness,
        captureReviewAttestation: liveCaptureReviewAttestation,
        captureWitnessArtifactSha256: liveCaptureWitnessArtifactSha256,
        captureReviewPolicy,
        liveEvidence,
        preLiveInputSnapshotSha256,
        subtitlesPath,
        temporaryVideoPath,
      });
    } else {
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
          `ffmpeg failed to render Solana SCCP diagnostic MP4: ${ffmpeg.stderr || ffmpeg.stdout}`,
        );
      }
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
    } catch {
      throw new Error("ffprobe returned invalid Solana SCCP MP4 JSON.");
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
    if (sourceCapture) {
      mediaVerification.outputVerification = inspectGeneratedSolanaLiveVideoMp4(
        {
          file: temporaryVideoPath,
          sourceCapture,
          captureWitness: liveCaptureWitness,
          captureReviewAttestation: liveCaptureReviewAttestation,
          captureWitnessArtifactSha256: liveCaptureWitnessArtifactSha256,
          captureReviewPolicy,
          liveEvidence,
          preLiveInputSnapshotSha256,
          subtitleSummary,
        },
      );
      if (mediaVerification.outputVerification.ready !== true) {
        throw new Error(
          `Generated Solana SCCP MP4 failed immediate semantic/content verification: ${mediaVerification.outputVerification.blockers.join(", ")}.`,
        );
      }
    }
    commitGeneratedFileSync(temporaryVideoPath, videoPath);
    return sourceCapture
      ? { ...mediaVerification, sourceCapture }
      : mediaVerification;
  } catch (error) {
    removeGeneratedFileSync(temporaryVideoPath);
    throw error;
  }
};

export const solanaLiveVideoMediaArtifactMaxBytes = (mediaType) => {
  if (mediaType === "video/mp4") return MAX_SOLANA_LIVE_CAPTURE_BYTES;
  if (mediaType === "text/vtt") return DEFAULT_SOLANA_TEXT_MAX_BYTES;
  throw new Error(`Unsupported Solana live-video media type: ${mediaType}.`);
};

export const solanaLiveVideoMediaArtifactSizeAllowed = ({
  mediaType,
  size,
} = {}) =>
  Number.isSafeInteger(size) &&
  size > 0 &&
  size <= solanaLiveVideoMediaArtifactMaxBytes(mediaType);

const hashSuccessfulMediaArtifact = async (file, mediaType) => {
  const label = `Solana live-video ${mediaType} artifact`;
  const maxBytes = solanaLiveVideoMediaArtifactMaxBytes(mediaType);
  if (mediaType === "video/mp4") {
    return withStableRegularFileDescriptorsSync(
      file,
      ([hashFd], resolved) => {
        const artifact = hashStableMediaDescriptor(hashFd);
        if (
          !solanaLiveVideoMediaArtifactSizeAllowed({ mediaType, ...artifact })
        ) {
          throw new Error(`${label} is empty or exceeds its byte limit.`);
        }
        return { path: resolved, mediaType, ...artifact };
      },
      { label, maxBytes, descriptorCount: 1 },
    );
  }
  const bytes = await readStableRegularFile(file, { label, maxBytes });
  if (
    !solanaLiveVideoMediaArtifactSizeAllowed({
      mediaType,
      size: bytes.length,
    })
  ) {
    throw new Error(`${label} is empty or exceeds its byte limit.`);
  }
  return {
    path: path.resolve(file),
    mediaType,
    size: bytes.length,
    sha256: `0x${createHash("sha256").update(bytes).digest("hex")}`,
  };
};

const SAFE_DIAGNOSTIC_IDS = new Set([
  "route-preflight",
  "walletconnect-project-id",
  "destination-prover-module-url",
  "source-prover-module-url",
  "smoke-readiness-runbook-contract",
  "solana-public-route-report",
  "solana-exact-prover-governance-approval",
  "solana-destination-production-prover-package",
  "solana-source-production-prover-package",
  "destination-proof-admission",
  "pre-live-input-snapshot-valid",
  "pre-live-input-reports-loaded",
  "public-preflight-ready",
  "public-solana-lane-ready",
  "public-exact-programdata-immutable",
  "public-exact-runtime-state",
  "governance-plan-reviewed",
  "governance-ordered-initialization-evidence",
  "governance-register-evidence",
  "governance-activate-evidence",
  "governance-phases-distinct",
  "governance-enactment-readback",
  "smoke-readiness-ready",
  "smoke-readiness-artifact-consistency",
  "live-bidirectional-video",
  "sccp-capabilities-load",
  "sccp-submit-capabilities",
  "sccp-registry-load",
  "solana-lane-publication",
  "solana-route-instance-publication",
  "route-registry-shape",
  "production-ready-flag",
  "solana-live-exact-programdata-evidence",
  "solana-live-exact-runtime-state",
  "taira-chain-metadata",
  "sccp-registry-stability",
  "solana-testnet-rpc-health",
]);

const safeDiagnosticId = (value, fallback) =>
  typeof value === "string" && SAFE_DIAGNOSTIC_IDS.has(value)
    ? value
    : fallback;

const safeDiagnosticIds = (values, fallback) => {
  if (!Array.isArray(values) || values.length === 0) return [];
  return uniqueStrings(
    values.map((value) =>
      safeDiagnosticId(
        typeof value === "string" ? value : readStringValue(value, "id"),
        fallback,
      ),
    ),
  );
};

const safeHash = (value) =>
  typeof value === "string" && HEX32.test(value) ? value : null;

const safeGovernanceToriiUrl = (value) =>
  typeof value === "string" &&
  /^https:\/\/taira-validator-[1-4]\.sora\.org$/u.test(value)
    ? value
    : null;

const failedCheckSummaries = (report) =>
  readArray(report, "checks")
    .filter((check) => check?.status !== "pass")
    .map((check) => ({
      id: safeDiagnosticId(
        readStringValue(check, "id"),
        "invalid-report-check",
      ),
      status: "fail",
      detail: "Referenced report contains a failed or invalid check.",
    }))
    .filter((check) => check.id);

const failedStatusSummaries = (report) =>
  readArray(report, "statuses")
    .filter((status) => status?.status !== "pass")
    .map((status) => ({
      id: safeDiagnosticId(
        readStringValue(status, "id"),
        "invalid-report-status",
      ),
      status: "fail",
      detail: "Referenced report contains a failed or invalid status.",
    }))
    .filter((status) => status.id);

const checkById = (report, id) =>
  readArray(report, "checks").find(
    (check) => readStringValue(check, "id") === id,
  ) ?? null;

const buildReportReference = (report, reportPath) => ({
  path: reportPath ? "[public-report-supplied]" : null,
  present: isRecord(report),
});

const normalizeBlockedLiveVideoDiagnostics = (diagnostics = {}) => {
  return isRecord(diagnostics) ? { ...diagnostics } : {};
};

export const buildSolanaLiveVideoBlockedDiagnostics = ({
  productionRequirementsReport = null,
  productionRequirementsPath = null,
  governancePlanReport = null,
  governancePlanPath = null,
  governanceRegistrationReport = null,
  governanceRegistrationPath = null,
  governanceActivationReport = null,
  governanceActivationPath = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  deploymentVideoTranscriptReport = null,
  deploymentVideoTranscriptPath = null,
  productionGateReport = null,
  productionGatePath = null,
} = {}) => {
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
  const governanceEvidence = isRecord(productionGateReport?.governanceEvidence)
    ? productionGateReport.governanceEvidence
    : null;
  const safeGovernanceEvidence = governanceEvidence
    ? {
        ready: governanceEvidence.ready === true,
        planSha256: safeHash(governanceEvidence.planSha256),
        registrationArtifactSha256: safeHash(
          governanceEvidence.registrationArtifactSha256,
        ),
        activationArtifactSha256: safeHash(
          governanceEvidence.activationArtifactSha256,
        ),
        publicRegistrySha256: safeHash(governanceEvidence.publicRegistrySha256),
      }
    : null;
  return {
    governance: {
      plan: {
        ...buildReportReference(governancePlanReport, governancePlanPath),
        planSha256: safeHash(
          readStringValue(governancePlanReport, "plan_sha256"),
        ),
      },
      registration: {
        ...buildReportReference(
          governanceRegistrationReport,
          governanceRegistrationPath,
        ),
        phase:
          readStringValue(governanceRegistrationReport, "phase") === "register"
            ? "register"
            : null,
        planSha256: safeHash(
          readStringValue(governanceRegistrationReport, "plan_sha256"),
        ),
        toriiUrl: safeGovernanceToriiUrl(
          readStringValue(governanceRegistrationReport, "torii_url"),
        ),
        submitted: readBoolean(governanceRegistrationReport, "submitted"),
        alreadyEnacted: readBoolean(
          governanceRegistrationReport,
          "already_enacted",
        ),
      },
      activation: {
        ...buildReportReference(
          governanceActivationReport,
          governanceActivationPath,
        ),
        phase:
          readStringValue(governanceActivationReport, "phase") === "activate"
            ? "activate"
            : null,
        planSha256: safeHash(
          readStringValue(governanceActivationReport, "plan_sha256"),
        ),
        toriiUrl: safeGovernanceToriiUrl(
          readStringValue(governanceActivationReport, "torii_url"),
        ),
        submitted: readBoolean(governanceActivationReport, "submitted"),
        alreadyEnacted: readBoolean(
          governanceActivationReport,
          "already_enacted",
        ),
      },
      evidence: safeGovernanceEvidence,
    },
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
      blockerIds: safeDiagnosticIds(
        blockerIds(productionRequirementsReport),
        "production-requirements-not-ready",
      ),
    },
    smokeReadiness: {
      ...buildReportReference(smokeReadinessReport, smokeReadinessPath),
      ready: readBoolean(smokeReadinessReport, "ready"),
      blockerIds: safeDiagnosticIds(
        smokeRootCauseBlockerIds.length > 0
          ? smokeRootCauseBlockerIds
          : smokeMissingProductionInputIds.length > 0
            ? smokeMissingProductionInputIds
            : smokeReportBlockerIds.length > 0
              ? smokeReportBlockerIds
              : smokeFailedChecks.map((check) => check.id),
        "smoke-readiness-not-ready",
      ),
      rootCauseBlockerIds: safeDiagnosticIds(
        smokeRootCauseBlockerIds,
        "smoke-readiness-not-ready",
      ),
      failedChecks: smokeFailedChecks,
      runbookReady: smokeRunbookCheck?.status === "pass",
      runbookProblemCount: readArray(
        readNestedRecord(smokeRunbookCheck, "evidence"),
        "problems",
      ).length,
      nextActionIds:
        actionIds(smokeReadinessReport, "nextActions").length > 0
          ? ["review-smoke-readiness"]
          : [],
      nextActionDetails: [],
      missingProductionInputIds: safeDiagnosticIds(
        smokeMissingProductionInputIds,
        "smoke-readiness-input-missing",
      ),
    },
    sourceMaterialHandoffVerification: {
      ...buildReportReference(
        handoffVerificationReport,
        handoffVerificationPath,
      ),
      ready: readBoolean(handoffVerificationReport, "ready"),
      statusCount: readArray(handoffVerificationReport, "statuses").length,
      failedStatuses: failedStatusSummaries(handoffVerificationReport),
      blockerIds:
        blockerIds(handoffVerificationReport).length > 0
          ? ["source-material-handoff-not-ready"]
          : [],
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
      bundleManifestSha256: safeHash(
        readStringValue(proofMaterialBundleReport, "bundleManifestSha256"),
      ),
      includedArtifactCount: isRecord(proofMaterialBundleReport)
        ? typeof proofMaterialBundleReport.includedArtifactCount === "number" &&
          Number.isSafeInteger(
            proofMaterialBundleReport.includedArtifactCount,
          ) &&
          proofMaterialBundleReport.includedArtifactCount >= 0
          ? proofMaterialBundleReport.includedArtifactCount
          : null
        : null,
      blockerIds:
        blockerIds(proofMaterialBundleReport).length > 0
          ? ["proof-material-bundle-not-ready"]
          : [],
      upstreamBlockerIds:
        stringIds(proofMaterialBundleReport, "upstreamBlockerIds").length > 0
          ? ["proof-material-upstream-not-ready"]
          : [],
    },
    deploymentVideo: {
      ...buildReportReference(
        deploymentVideoTranscriptReport,
        deploymentVideoTranscriptPath,
      ),
      ready: readBoolean(deploymentVideoTranscriptReport, "ready"),
      routeId:
        readStringValue(deploymentVideoTranscriptReport, "routeId") ===
        SCCP_SOLANA_XOR_ROUTE_ID
          ? SCCP_SOLANA_XOR_ROUTE_ID
          : null,
      videoArtifactCount: readArray(
        deploymentVideoTranscriptReport,
        "videoArtifacts",
      ).length,
    },
    productionGate: {
      ...buildReportReference(productionGateReport, productionGatePath),
      ready: readBoolean(productionGateReport, "ready"),
      failedChecks: failedCheckSummaries(productionGateReport),
      nextRequiredActions:
        stringIds(productionGateReport, "nextRequiredActions").length > 0
          ? ["review-production-gate"]
          : [],
      nextActionIds:
        actionIds(productionGateReport, "nextActionDetails").length > 0
          ? ["review-production-gate"]
          : [],
      nextActionDetails: [],
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
  const governancePinnedToriiUrl =
    diagnostics.governance?.registration?.toriiUrl ?? null;
  const governancePinReady =
    diagnostics.governance?.evidence?.ready === true &&
    typeof governancePinnedToriiUrl === "string" &&
    governancePinnedToriiUrl.length > 0 &&
    diagnostics.governance?.activation?.toriiUrl === governancePinnedToriiUrl;
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
  const liveCapturePinned =
    hasSuppliedPathOption(options, "liveCaptureVideo") &&
    /^0x[0-9a-f]{64}$/u.test(
      String(
        ownDataValue(options, "liveCaptureVideoSha256") ?? "",
      ).toLowerCase(),
    );
  const liveCaptureWitnessPinned =
    hasSuppliedPathOption(options, "liveCaptureWitness") &&
    /^0x[0-9a-f]{64}$/u.test(
      String(
        ownDataValue(options, "liveCaptureWitnessSha256") ?? "",
      ).toLowerCase(),
    );
  const liveCaptureReviewAttestationPinned =
    hasSuppliedPathOption(options, "liveCaptureReviewAttestation") &&
    /^0x[0-9a-f]{64}$/u.test(
      String(
        ownDataValue(options, "liveCaptureReviewAttestationSha256") ?? "",
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
  if (!liveCapturePinned) {
    problems.push(
      successProblem(
        "pinned-real-live-capture",
        "Success evidence requires an exact-byte-pinned real screen capture of the completed bidirectional transfer.",
      ),
    );
  }
  if (!liveCaptureWitnessPinned) {
    problems.push(
      successProblem(
        "pinned-live-capture-semantic-witness",
        "Success evidence requires an independently reviewed, exact-byte-pinned semantic witness for ordered registry and bidirectional receipt frames.",
      ),
    );
  }
  if (!liveCaptureReviewAttestationPinned) {
    problems.push(
      successProblem(
        "pinned-live-capture-review-attestation",
        "Success evidence requires a detached threshold-Ed25519 attestation from reviewers authorized before capture.",
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
    liveCapturePinned,
    liveCaptureWitnessPinned,
    liveCaptureReviewAttestationPinned,
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
    "governance-evidence-ready",
    diagnostics.governance?.evidence?.ready,
    "Reviewed registration and activation evidence plus exact public typed-registry readback must pass before recording the live bidirectional video.",
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
    ...(normalizedDiagnostics.governance?.evidence?.ready === true
      ? []
      : ["governance-evidence"]),
    ...(normalizedDiagnostics.smokeReadiness?.blockerIds ?? []),
    ...(normalizedDiagnostics.sourceMaterialHandoffVerification?.blockerIds ??
      []),
    ...(normalizedDiagnostics.proofMaterialBundle?.blockerIds ?? []),
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
    diagnosticVideoOnly: true,
    notLiveTransferEvidence: true,
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
      ? {
          present: true,
          ready: preflightReport.publicSolanaCapability.ready === true,
        }
      : null,
    publicSolanaLane: isRecord(preflightReport?.publicSolanaLane)
      ? {
          present: true,
          ready: preflightReport.publicSolanaLane.ready === true,
        }
      : null,
    governance: normalizedDiagnostics.governance ?? null,
    deploymentVideo: normalizedDiagnostics.deploymentVideo ?? null,
    productionGate: normalizedDiagnostics.productionGate ?? null,
    successPrerequisiteProblems,
    diagnostics: normalizedDiagnostics,
    requiredRealSteps: [
      "Parliament enacts the reviewed staged registration and separate bidirectional activation, and fresh typed-registry readback matches both.",
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
  const governance = diagnostics.governance;
  const smokeReadiness = diagnostics.smokeReadiness;
  const deploymentVideo = diagnostics.deploymentVideo;
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
  const requirementLine = requirementBlockers.length
    ? `Production requirements still block: ${requirementBlockers.join(", ")}.`
    : "Production requirements report has no remaining blockers.";
  const governancePlanLine = governance?.plan?.planSha256
    ? `Reviewed governance plan ${governance.plan.planSha256} is present.`
    : "Reviewed exact Solana governance plan is missing.";
  const governanceEnactmentLine =
    governance?.evidence?.ready === true
      ? `Registration, activation, and public registry evidence match; ${governance.evidence.publicRegistrySha256 ?? "registry hash unavailable"}.`
      : "Pinned registration/activation evidence or matching public registry readback is missing.";
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
  const deploymentVideoLine =
    deploymentVideo?.present === true
      ? "Deployment walkthrough MP4 evidence is present."
      : "Deployment walkthrough MP4 evidence is missing from blocked diagnostics.";
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
    governancePlanLine,
    governanceEnactmentLine,
    smokeLine,
    deploymentVideoLine,
    productionGateLine,
  };
};

const writeBlockedArtifacts = async ({
  outputDir,
  preflightReport,
  reason,
  diagnostics = {},
  successPrerequisiteProblems = [],
  protectedInputPaths = [],
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
    governancePlanLine,
    governanceEnactmentLine,
    smokeLine,
    deploymentVideoLine,
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
Step 7: ${governancePlanLine}

00:38.000 --> 00:44.000
Step 8: ${governanceEnactmentLine}

00:44.000 --> 00:50.000
Step 9: ${smokeLine}

00:50.000 --> 00:56.000
Step 10: Parliament evidence is never replaced by a route-manager signer or generic manifest upsert.

00:56.000 --> 01:02.000
Step 11: ${deploymentVideoLine}

01:02.000 --> 01:08.000
Step 12: Fresh typed-registry readback is the only route-enactment authority.

01:08.000 --> 01:14.000
Step 13: ${productionGateLine}

01:14.000 --> 01:20.000
Step 14: Finish governed proof material and wallet execution prerequisites, then rerun this command.
`;
  const subtitleCues = parseWebVttCues(subtitleText);
  transcript.subtitleCues = subtitleCues;
  transcript.subtitleSummary =
    summarizeSolanaLiveVideoSubtitleCues(subtitleCues);
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
  await assertSolanaLiveCaptureOutputsDisjoint({
    outputPaths: [transcriptPath, subtitlesPath, videoPath],
    protectedInputPaths,
  });
  await writeAtomicFile(subtitlesPath, subtitleText);
  try {
    const encodingVerification = renderSolanaLiveVideoMp4({
      subtitlesPath,
      videoPath,
      durationSeconds: 81,
      subtitleSummary: transcript.subtitleSummary,
    });
    transcript.mediaVerification = {
      ...encodingVerification,
      ready: false,
      encodingReady: encodingVerification.ready === true,
      productionReady: false,
      diagnosticOnly: true,
      notLiveTransferEvidence: true,
    };
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
  governancePlanSha256:
    "<required canonical hash from taira-solana-xor-governance-plan.json>",
  governanceRegistrationSha256:
    "<required exact file hash of taira-solana-xor-governance-register.json>",
  governanceActivationSha256:
    "<required exact file hash of taira-solana-xor-governance-activate.json>",
  publicRegistrySha256:
    "<required canonical hash from fresh public typed-registry readback>",
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
    "bind all four governance and public-registry hashes to the exact reviewed production gate",
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
  const governancePlanSha256 = normalizeRequiredHash32(
    readString(evidence, "governancePlanSha256"),
    "live evidence governancePlanSha256",
  );
  const governanceRegistrationSha256 = normalizeRequiredHash32(
    readString(evidence, "governanceRegistrationSha256"),
    "live evidence governanceRegistrationSha256",
  );
  const governanceActivationSha256 = normalizeRequiredHash32(
    readString(evidence, "governanceActivationSha256"),
    "live evidence governanceActivationSha256",
  );
  const publicRegistrySha256 = normalizeRequiredHash32(
    readString(evidence, "publicRegistrySha256"),
    "live evidence publicRegistrySha256",
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
    governancePlanSha256,
    governanceRegistrationSha256,
    governanceActivationSha256,
    publicRegistrySha256,
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

const requireExactKeys = (record, expectedKeys, label) => {
  if (!isRecord(record)) {
    throw new Error(`${label} is missing.`);
  }
  const actualKeys = Object.keys(record).sort();
  const canonicalKeys = [...expectedKeys].sort();
  if (canonicalSccpJson(actualKeys) !== canonicalSccpJson(canonicalKeys)) {
    throw new Error(
      `${label} must contain exactly ${canonicalKeys.join(", ")}.`,
    );
  }
  return record;
};

const exactPositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};

const buildExactSolanaRegistryPins = (summary) => {
  if (!isRecord(summary)) {
    throw new Error("Exact Solana typed-registry summary is missing.");
  }
  if (
    summary.routeId !== SCCP_SOLANA_XOR_ROUTE_ID ||
    summary.assetKey !== SCCP_XOR_ASSET_KEY ||
    summary.revision !== 1 ||
    summary.activation !== "bidirectional"
  ) {
    throw new Error(
      "Exact Solana typed-registry route must be bidirectional taira_sol_xor revision 1.",
    );
  }
  const programs = requireExactKeys(
    summary.programs,
    ["destination", "source", "nativeVerifier"],
    "Exact Solana typed-registry program roles",
  );
  const accounts = requireExactKeys(
    summary.accounts,
    [
      "tokenMint",
      "destinationProgram",
      "destinationProgramData",
      "destinationState",
      "nativeVerifierProgram",
      "nativeVerifierProgramData",
      "nativeVerifierMaterial",
      "sourceProgram",
      "sourceProgramData",
      "sourceState",
    ],
    "Exact Solana typed-registry account roles",
  );
  const programDataSlots = requireExactKeys(
    summary.programDataSlots,
    ["destination", "source", "nativeVerifier"],
    "Exact Solana typed-registry ProgramData slots",
  );
  const codeHashes = requireExactKeys(
    summary.codeHashes,
    ["destination", "source", "nativeVerifier"],
    "Exact Solana typed-registry code hashes",
  );
  for (const [role, accountRole] of [
    ["destination", "destinationProgram"],
    ["source", "sourceProgram"],
    ["nativeVerifier", "nativeVerifierProgram"],
  ]) {
    if (programs[role] !== accounts[accountRole]) {
      throw new Error(
        `Exact Solana typed-registry ${role} program role is inconsistent.`,
      );
    }
  }
  const normalizedAccounts = Object.fromEntries(
    Object.entries(accounts).map(([role, value]) => [
      role,
      normalizeSolanaPublicKey(value, `typed-registry ${role}`),
    ]),
  );
  if (
    new Set(Object.values(normalizedAccounts)).size !==
    Object.keys(normalizedAccounts).length
  ) {
    throw new Error(
      "Exact Solana typed-registry program, ProgramData, state, mint, and material roles must be distinct.",
    );
  }
  const mintAuthorityAddress = deriveSolanaProgramAddress(
    [
      Buffer.from(SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED, "utf8"),
      new PublicKey(normalizedAccounts.destinationState).toBuffer(),
    ],
    normalizedAccounts.destinationProgram,
  );
  const requiredString = (value, label) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} is missing.`);
    }
    return value;
  };
  if (summary.payloadAmountScale !== SCCP_SOLANA_TOKEN_DECIMALS) {
    throw new Error(
      "Exact Solana typed-registry settlement must use the nine-decimal XOR scale.",
    );
  }
  return Object.freeze({
    registrySha256: normalizeNonZeroHex32(
      summary.registrySha256,
      "typed-registry hash",
    ),
    routeId: summary.routeId,
    assetKey: summary.assetKey,
    routeRevision: summary.revision,
    activation: summary.activation,
    destinationProgramAddress: normalizedAccounts.destinationProgram,
    sourceProgramAddress: normalizedAccounts.sourceProgram,
    nativeVerifierProgramAddress: normalizedAccounts.nativeVerifierProgram,
    destinationProgramDataAddress: normalizedAccounts.destinationProgramData,
    sourceProgramDataAddress: normalizedAccounts.sourceProgramData,
    nativeVerifierProgramDataAddress:
      normalizedAccounts.nativeVerifierProgramData,
    destinationProgramDataSlot: String(
      exactPositiveInteger(
        programDataSlots.destination,
        "typed-registry destination ProgramData slot",
      ),
    ),
    sourceProgramDataSlot: String(
      exactPositiveInteger(
        programDataSlots.source,
        "typed-registry source ProgramData slot",
      ),
    ),
    nativeVerifierProgramDataSlot: String(
      exactPositiveInteger(
        programDataSlots.nativeVerifier,
        "typed-registry native-verifier ProgramData slot",
      ),
    ),
    destinationProgramCodeHash: normalizeNonZeroHex32(
      codeHashes.destination,
      "typed-registry destination code hash",
    ),
    sourceProgramCodeHash: normalizeNonZeroHex32(
      codeHashes.source,
      "typed-registry source code hash",
    ),
    nativeVerifierProgramCodeHash: normalizeNonZeroHex32(
      codeHashes.nativeVerifier,
      "typed-registry native-verifier code hash",
    ),
    tokenMintAddress: normalizedAccounts.tokenMint,
    destinationStateAddress: normalizedAccounts.destinationState,
    sourceStateAddress: normalizedAccounts.sourceState,
    nativeVerifierMaterialAddress: normalizedAccounts.nativeVerifierMaterial,
    mintAuthorityAddress,
    destinationBindingHash: normalizeNonZeroHex32(
      summary.destinationBindingHash,
      "typed-registry destination binding hash",
    ),
    deploymentConfigHash: normalizeNonZeroHex32(
      summary.deploymentConfigHash,
      "typed-registry deployment config hash",
    ),
    routeConfigurationHash: normalizeNonZeroHex32(
      summary.routeConfigurationHash,
      "typed-registry route configuration hash",
    ),
    sourceEmitterIdentityHash: normalizeNonZeroHex32(
      summary.sourceEmitterIdentityHash,
      "typed-registry source emitter identity hash",
    ),
    sourceIdentityHash: normalizeNonZeroHex32(
      summary.sourceIdentityHash,
      "typed-registry source identity hash",
    ),
    verifierKeyHash: normalizeNonZeroHex32(
      summary.verifierKeyHash,
      "typed-registry verifier key hash",
    ),
    nativeVerifierConfigHash: normalizeNonZeroHex32(
      summary.nativeVerifierConfigHash,
      "typed-registry native-verifier config hash",
    ),
    proofPolicySha256: normalizeNonZeroHex32(
      canonicalSccpObjectSha256(summary.proofPolicy),
      "typed-registry proof-policy hash",
    ),
    currentNativeTrustAnchorHash: normalizeNonZeroHex32(
      summary.currentNativeTrustAnchorHash,
      "typed-registry native trust-anchor hash",
    ),
    settlementAssetDefinitionId: requiredString(
      summary.settlementAssetDefinitionId,
      "typed-registry settlement asset definition id",
    ),
    custodyAccountId: requiredString(
      summary.custodyAccountId,
      "typed-registry custody account id",
    ),
    payloadAmountScale: summary.payloadAmountScale,
  });
};

const requireExactProgramdataEvidence = (preflightReport, pins) => {
  const evidence = passedPreflightCheckEvidence(
    preflightReport,
    "solana-live-exact-programdata-evidence",
  );
  requireExactKeys(
    evidence,
    ["destination", "source", "nativeVerifier"],
    "Exact Solana immutable-program evidence roles",
  );
  for (const [role, expected] of [
    [
      "destination",
      {
        programAddress: pins.destinationProgramAddress,
        programdataAddress: pins.destinationProgramDataAddress,
        programdataSlot: pins.destinationProgramDataSlot,
        programCodeHash: pins.destinationProgramCodeHash,
      },
    ],
    [
      "source",
      {
        programAddress: pins.sourceProgramAddress,
        programdataAddress: pins.sourceProgramDataAddress,
        programdataSlot: pins.sourceProgramDataSlot,
        programCodeHash: pins.sourceProgramCodeHash,
      },
    ],
    [
      "nativeVerifier",
      {
        programAddress: pins.nativeVerifierProgramAddress,
        programdataAddress: pins.nativeVerifierProgramDataAddress,
        programdataSlot: pins.nativeVerifierProgramDataSlot,
        programCodeHash: pins.nativeVerifierProgramCodeHash,
      },
    ],
  ]) {
    const live = readRecord(evidence, role);
    if (
      !live ||
      readString(live, "role") !== role ||
      live.immutable !== true ||
      live.upgradeAuthority !== null ||
      readString(live, "programAddress") !== expected.programAddress ||
      readString(live, "programdataAddress") !== expected.programdataAddress ||
      String(live.programdataSlot ?? "") !== expected.programdataSlot ||
      normalizeNonZeroHex32(
        readString(live, "programCodeHash"),
        `${role} live program code hash`,
      ) !== expected.programCodeHash
    ) {
      throw new Error(
        `Exact Solana ${role} immutable-program evidence differs from the typed registry.`,
      );
    }
  }
};

const requireExactRuntimeEvidence = (preflightReport, pins) => {
  const evidence = passedPreflightCheckEvidence(
    preflightReport,
    "solana-live-exact-runtime-state",
  );
  for (const [key, address] of [
    ["destinationState", pins.destinationStateAddress],
    ["sourceState", pins.sourceStateAddress],
    ["mint", pins.tokenMintAddress],
    ["material", pins.nativeVerifierMaterialAddress],
  ]) {
    if (readString(readRecord(evidence, key), "address") !== address) {
      throw new Error(
        `Exact Solana ${key} runtime evidence differs from the typed registry.`,
      );
    }
  }
  const observedMintAuthority = readString(
    evidence,
    "mintAuthority",
    "mint_authority",
  );
  const embeddedMintAuthority = readString(
    readRecord(evidence, "mint"),
    "mintAuthority",
    "mint_authority",
  );
  if (
    observedMintAuthority !== pins.mintAuthorityAddress ||
    (embeddedMintAuthority &&
      embeddedMintAuthority !== pins.mintAuthorityAddress)
  ) {
    throw new Error(
      "Exact Solana live mint authority differs from the destination-state PDA.",
    );
  }
};

export const extractSolanaLiveRegistryPins = (preflightReport) => {
  if (!isRecord(preflightReport) || preflightReport.ready !== true) {
    throw new Error("Solana route preflight must be ready for live evidence.");
  }
  if (
    readString(preflightReport, "schema") !==
      "iroha-demo-sccp-solana-route-preflight/v2" ||
    readString(preflightReport, "protocolSource") !==
      "typed-sccp-registry-v1" ||
    readString(preflightReport, "manifestSource") !== "public-registry"
  ) {
    throw new Error(
      "Solana live evidence requires the exact v2 public typed-registry preflight.",
    );
  }
  if (
    readString(preflightReport, "routeId") !== SCCP_SOLANA_XOR_ROUTE_ID ||
    readString(preflightReport, "assetKey") !== SCCP_XOR_ASSET_KEY ||
    Number(preflightReport.routeRevision) !== 1
  ) {
    throw new Error(
      "Solana live evidence preflight route identity is invalid.",
    );
  }
  const taira = readRecord(preflightReport, "taira");
  const solana = readRecord(preflightReport, "solana");
  if (
    readString(taira, "chainId") !== TAIRA_CHAIN_ID ||
    Number(taira?.networkPrefix) !== TAIRA_NETWORK_PREFIX ||
    readString(taira, "registryPath") !== SOLANA_SCCP_REGISTRY_PATH
  ) {
    throw new Error("Solana live evidence preflight does not target TAIRA.");
  }
  if (
    readString(solana, "network") !== SOLANA_TESTNET_NETWORK_ID ||
    readString(solana, "caipChainId") !== SOLANA_TESTNET_CAIP_CHAIN_ID ||
    readString(solana, "genesisHash") !== SOLANA_TESTNET_GENESIS_HASH
  ) {
    throw new Error(
      "Solana live evidence preflight does not target canonical Solana testnet.",
    );
  }

  const registryState = readRecord(preflightReport, "registryState");
  const pins = buildExactSolanaRegistryPins(
    readRecord(preflightReport, "registrySummary"),
  );
  if (
    registryState?.lanePresent !== true ||
    registryState?.routePresent !== true ||
    readString(registryState, "activation") !== "bidirectional" ||
    normalizeNonZeroHex32(
      readString(registryState, "currentNativeTrustAnchorHash"),
      "preflight current native trust-anchor hash",
    ) !== pins.currentNativeTrustAnchorHash
  ) {
    throw new Error(
      "Solana live evidence preflight does not prove the exact active typed-registry route.",
    );
  }
  requireExactProgramdataEvidence(preflightReport, pins);
  requireExactRuntimeEvidence(preflightReport, pins);
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
    pins.destinationProgramAddress,
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
      new PublicKey(pins.destinationStateAddress).toBuffer(),
      Buffer.from(publicInputs.messageId, "hex"),
    ],
    pins.destinationProgramAddress,
  );
  assertExactInstructionAccounts(
    bridge.accounts,
    [
      bridge.accounts[0],
      pins.destinationStateAddress,
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
    destinationProgramAddress: bridge.programId,
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
    pins.sourceProgramAddress,
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
    pins.sourceProgramAddress,
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
      decodeBase58(pins.sourceProgramAddress, `${label} source bridge program`),
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
    sourceProgramAddress: bridge.programId,
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

const requireExactRegistryPins = (record, expectedPins, label) => {
  if (
    Object.prototype.hasOwnProperty.call(record, "manifestPins") ||
    Object.prototype.hasOwnProperty.call(record, "manifest_pins")
  ) {
    throw new Error(`${label} uses retired manifest pins.`);
  }
  const actual = readRecord(record, "registryPins", "registry_pins");
  if (!actual) {
    throw new Error(`${label} exact typed-registry pins are missing.`);
  }
  if (canonicalSccpJson(actual) !== canonicalSccpJson(expectedPins)) {
    throw new Error(
      `${label} exact pins do not match the public typed registry.`,
    );
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
  requireExactRegistryPins(record, pins, label);
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
  requireExactRegistryPins(record, pins, label);
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

const verifyPublicTypedRegistryPins = (registryValue, expectedPins) => {
  selectExactSolanaRegistryRoute(registryValue, {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  });
  const summary = summarizeExactSolanaRegistryRoute(registryValue, {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  });
  const observedPins = buildExactSolanaRegistryPins(summary);
  if (canonicalSccpJson(observedPins) !== canonicalSccpJson(expectedPins)) {
    throw new Error(
      "Public TAIRA typed-registry route differs from the exact preflight pins.",
    );
  }
  return Object.freeze({
    routeId: summary.routeId,
    assetKey: summary.assetKey,
    routeRevision: summary.revision,
    activation: summary.activation,
    registrySha256: observedPins.registrySha256,
  });
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
      throw new Error("TAIRA chain metadata readback is unavailable.");
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
    readTairaRegistry: async () =>
      jsonResponse(
        await fetchImpl(
          tairaUrl(SOLANA_SCCP_REGISTRY_PATH, {
            readback_nonce: randomUUID(),
          }),
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "cache-control": "no-cache, no-store",
              pragma: "no-cache",
            },
          },
        ),
        "TAIRA typed SCCP registry",
      ),
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
  const pins = extractSolanaLiveRegistryPins(preflightReport);
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
    "readTairaRegistry",
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
  const firstRegistryIdentity = verifyPublicTypedRegistryPins(
    await clients.readTairaRegistry(),
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
  const [secondGenesis, secondTairaMetadata, secondRegistry] =
    await Promise.all([
      clients.readSolanaGenesisHash(),
      clients.readTairaChainMetadata(),
      clients.readTairaRegistry(),
    ]);
  if (secondGenesis !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error("Solana RPC cluster identity changed during readback.");
  }
  const secondTairaIdentity = verifyTairaChainMetadata(secondTairaMetadata);
  const secondRegistryIdentity = verifyPublicTypedRegistryPins(
    secondRegistry,
    pins,
  );
  if (
    JSON.stringify(firstTairaIdentity) !==
      JSON.stringify(secondTairaIdentity) ||
    canonicalSccpJson(firstRegistryIdentity) !==
      canonicalSccpJson(secondRegistryIdentity)
  ) {
    throw new Error(
      "TAIRA endpoint or public typed-registry identity changed during readback.",
    );
  }
  return {
    ready: true,
    readOnly: true,
    solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    taira: firstTairaIdentity,
    registryPins: pins,
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
} = {}) => {
  const governanceEvidence =
    diagnostics?.governanceEvidence ?? diagnostics?.governance?.evidence;
  return [
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.governancePlanSha256,
      expected: governanceEvidence?.planSha256,
      id: "live-evidence-governance-plan-hash",
      label: "governancePlanSha256",
    }),
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.governanceRegistrationSha256,
      expected: governanceEvidence?.registrationArtifactSha256,
      id: "live-evidence-governance-registration-hash",
      label: "governanceRegistrationSha256",
    }),
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.governanceActivationSha256,
      expected: governanceEvidence?.activationArtifactSha256,
      id: "live-evidence-governance-activation-hash",
      label: "governanceActivationSha256",
    }),
    compareRequiredLiveEvidenceHash({
      actual: liveEvidence?.publicRegistrySha256,
      expected: governanceEvidence?.publicRegistrySha256,
      id: "live-evidence-public-registry-hash",
      label: "publicRegistrySha256",
    }),
  ].filter(Boolean);
};

const loadLiveEvidence = async (file) => {
  if (!file) {
    throw new Error(
      "--live-evidence is required after route preflight passes.",
    );
  }
  const liveEvidencePath = path.resolve(file);
  const bytes = await readStableRegularFile(liveEvidencePath, {
    label: "Solana live transfer evidence",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  const evidence = parseSolanaLiveVideoPinnedJsonBytes(
    bytes,
    "Solana live transfer evidence",
  );
  return normalizeSolanaLiveTransferEvidence(evidence, {
    evidencePath: liveEvidencePath,
  });
};

const sha256Bytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const assertSolanaLiveCaptureOutputsDisjoint = async ({
  outputPaths,
  protectedInputPaths,
}) => {
  const outputs = (Array.isArray(outputPaths) ? outputPaths : [])
    .filter((file) => typeof file === "string" && file.trim())
    .map((file) => path.resolve(file));
  const inputs = (Array.isArray(protectedInputPaths) ? protectedInputPaths : [])
    .filter((file) => typeof file === "string" && file.trim())
    .map((file) => path.resolve(file));
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("Solana live capture outputs must use distinct paths.");
  }
  const existingOutputIdentities = new Set();
  for (const output of outputs) {
    await assertSafeOutputDestination(output);
    if (inputs.includes(output)) {
      throw new Error(
        "Solana live capture output must be disjoint from every pinned input.",
      );
    }
    let outputInfo = null;
    try {
      outputInfo = await lstat(output);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!outputInfo) continue;
    const outputIdentity = `${outputInfo.dev}:${outputInfo.ino}`;
    if (existingOutputIdentities.has(outputIdentity)) {
      throw new Error(
        "Solana live capture outputs must not alias the same inode.",
      );
    }
    existingOutputIdentities.add(outputIdentity);
    for (const input of inputs) {
      let inputInfo;
      try {
        inputInfo = await lstat(input);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      if (
        outputInfo.dev === inputInfo.dev &&
        outputInfo.ino === inputInfo.ino
      ) {
        throw new Error(
          "Solana live capture output aliases a pinned input inode.",
        );
      }
    }
  }
};

export const writeSolanaLiveCaptureWitnessKit = async ({
  outputDir,
  liveEvidence,
  preLiveInputSnapshotSha256,
  protectedInputPaths = [],
}) => {
  const resolvedOutputDir = path.resolve(outputDir);
  await ensureSafeOutputDirectory(resolvedOutputDir);
  const built = buildSolanaLiveCaptureWitnessPayloads({
    liveEvidence,
    preLiveInputSnapshotSha256,
  });
  const kitOutputPaths = [
    ...SOLANA_LIVE_CAPTURE_WITNESS_IDS.map((id, index) =>
      path.join(resolvedOutputDir, `${index + 1}-${id}.png`),
    ),
    path.join(resolvedOutputDir, "index.html"),
    path.join(resolvedOutputDir, "manifest.json"),
  ];
  await assertSolanaLiveCaptureOutputsDisjoint({
    outputPaths: kitOutputPaths,
    protectedInputPaths,
  });
  const cards = [];
  for (const [index, id] of SOLANA_LIVE_CAPTURE_WITNESS_IDS.entries()) {
    const filename = `${index + 1}-${id}.png`;
    const png = await QRCode.toBuffer(built.payloads[id], {
      type: "png",
      errorCorrectionLevel: "H",
      margin: 4,
      width: 512,
    });
    const file = path.join(resolvedOutputDir, filename);
    await writeAtomicFile(file, png);
    cards.push({
      id,
      order: index + 1,
      filename,
      payload: built.payloads[id],
      payloadSha256: built.stageHashes[id],
      pngSha256: sha256Bytes(png),
    });
  }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>taira_sol_xor live capture witnesses</title>
<style>body{margin:0;background:#0b1020;color:#fff;font:18px system-ui}main{display:grid;gap:48px;padding:48px}.card{min-height:90vh;display:grid;place-items:center;text-align:center;border:2px solid #6ee7b7;border-radius:24px;background:#111827}.card img{width:min(60vw,512px);image-rendering:auto}.hash{max-width:90vw;overflow-wrap:anywhere;font:14px ui-monospace,monospace}</style></head>
<body><main>${cards
    .map(
      (card) =>
        `<section class="card" id="${escapeHtml(card.id)}"><div><h1>${card.order}. ${escapeHtml(card.id)}</h1><img alt="${escapeHtml(card.id)} exact SCCP witness QR" src="${escapeHtml(card.filename)}"><p>Route: taira_sol_xor · revision 1</p><p class="hash">${escapeHtml(card.payload)}</p></div></section>`,
    )
    .join("")}</main></body></html>\n`;
  await writeAtomicFile(path.join(resolvedOutputDir, "index.html"), html);
  const manifest = {
    schema: "iroha-demo-sccp-solana-live-capture-witness-kit/v1",
    productionReady: false,
    diagnosticOnly: true,
    modifiesCapture: false,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    evidenceBindingSha256: built.evidenceBindingSha256,
    binding: built.binding,
    cards,
    instructions: [
      "Record the genuine completed bidirectional UI flow before showing these cards in order.",
      "Keep each card visibly on screen for at least one second so center-minus/plus-250ms samples decode.",
      "Do not composite these cards over unrelated footage; an independent reviewer must reject overlay-only media.",
      "This kit is signer-free and never opens, overlays, or modifies the capture file.",
    ],
  };
  const manifestPath = path.join(resolvedOutputDir, "manifest.json");
  await writeAtomicJsonFile(manifestPath, manifest);
  return { outputDir: resolvedOutputDir, manifestPath, report: manifest };
};

const parseLiveCaptureMarkerTimes = (value) => {
  const times = String(value ?? "")
    .split(",")
    .map((entry) => Number(entry.trim()));
  if (
    times.length !== 4 ||
    times.some((time) => !Number.isSafeInteger(time) || time < 500)
  ) {
    throw new Error(
      "--live-capture-marker-times-ms must contain four positive integer millisecond centers.",
    );
  }
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] - times[index - 1] < 1_500) {
      throw new Error(
        "Live capture marker centers must be ordered at least 1500ms apart.",
      );
    }
  }
  return times;
};

export const writeSolanaLiveCaptureWitnessReviewRequest = async ({
  outputPath,
  captureVideoPath,
  expectedCaptureSha256,
  markerTimesMilliseconds,
  liveEvidence,
  preLiveInputSnapshotSha256,
  reviewPolicy,
  reviewPolicySha256,
  protectedInputPaths = [],
}) => {
  if (process.platform === "win32") {
    throw new Error(
      "Stable descriptor-bound capture witness scanning is unavailable on Windows.",
    );
  }
  const expectedCapture = String(expectedCaptureSha256 ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(expectedCapture)) {
    throw new Error(
      "Capture witness scanning requires an independently supplied lowercase 0x SHA-256.",
    );
  }
  const resolvedCaptureVideoPath = path.resolve(captureVideoPath);
  const resolvedOutputPath = path.resolve(outputPath);
  await assertSolanaLiveCaptureOutputsDisjoint({
    outputPaths: [resolvedOutputPath],
    protectedInputPaths: [resolvedCaptureVideoPath, ...protectedInputPaths],
  });
  const times = Array.isArray(markerTimesMilliseconds)
    ? parseLiveCaptureMarkerTimes(markerTimesMilliseconds.join(","))
    : parseLiveCaptureMarkerTimes(markerTimesMilliseconds);
  const built = buildSolanaLiveCaptureWitnessPayloads({
    liveEvidence,
    preLiveInputSnapshotSha256,
  });
  const scan = withStableRegularFileDescriptorsSync(
    resolvedCaptureVideoPath,
    ([hashFd, frameFd], resolved) => {
      const captureArtifact = hashStableMediaDescriptor(hashFd);
      if (captureArtifact.sha256 !== expectedCapture) {
        throw new Error(
          `Capture witness scan SHA-256 mismatch: expected ${expectedCapture}, got ${captureArtifact.sha256}.`,
        );
      }
      const samples = SOLANA_LIVE_CAPTURE_WITNESS_IDS.map((id, index) => ({
        id,
        atMilliseconds: times[index],
        dwellFrames: SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS.map(
          (offsetMilliseconds) => ({
            offsetMilliseconds,
            ...extractNormalizedSemanticWitnessFrame({
              descriptorFd: frameFd,
              atMilliseconds: times[index] + offsetMilliseconds,
            }),
          }),
        ),
      }));
      for (const [index, sample] of samples.entries()) {
        const expectedPayload = built.payloads[sample.id];
        if (
          sample.dwellFrames.some(
            (frame) => frame.decodedPayload !== expectedPayload,
          )
        ) {
          throw new Error(
            `Capture witness ${sample.id} did not decode through its full ±250ms dwell window.`,
          );
        }
        if (sample.atMilliseconds !== times[index]) {
          throw new Error("Capture witness scan order changed unexpectedly.");
        }
      }
      return { resolved, captureArtifact, samples };
    },
    {
      label: "Pinned Solana live capture witness scan input",
      maxBytes: MAX_SOLANA_LIVE_CAPTURE_BYTES,
      descriptorCount: 2,
    },
  );
  const markers = scan.samples.map((sample) => ({
    id: sample.id,
    atMilliseconds: sample.atMilliseconds,
    normalizedFrameSha256: sample.dwellFrames.find(
      (frame) => frame.offsetMilliseconds === 0,
    ).normalizedFrameSha256,
  }));
  if (
    new Set(markers.map((marker) => marker.normalizedFrameSha256)).size !== 4
  ) {
    throw new Error(
      "Capture witness review request requires four distinct center frames.",
    );
  }
  const candidateWitness = {
    schema: "iroha-demo-sccp-solana-live-capture-witness/v2",
    reviewPolicySha256,
    preLiveInputSnapshotSha256,
    captureSha256: scan.captureArtifact.sha256,
    evidenceBindingSha256: built.evidenceBindingSha256,
    independentReview: buildUnreviewedSolanaLiveCaptureReview(),
    markers,
  };
  const request = {
    schema: "iroha-demo-sccp-solana-live-capture-witness-review-request/v1",
    productionReady: false,
    captureSha256Verified: true,
    capturePath: "[independently-pinned-capture]",
    captureSha256: scan.captureArtifact.sha256,
    evidenceBindingSha256: built.evidenceBindingSha256,
    candidateWitness,
    detachedReviewAttestation: {
      required: true,
      schema: "iroha-demo-sccp-solana-live-capture-review-attestation/v1",
      signatureAlgorithm: "ed25519",
      threshold: reviewPolicy.threshold,
      authorizedReviewerIds: reviewPolicy.reviewers.map(
        (reviewer) => reviewer.reviewerId,
      ),
      reviewPolicySha256,
      preLiveInputSnapshotSha256,
      privateKeyInputsAccepted: false,
    },
    deterministicSigningRecipe: {
      validationOnlyHelper:
        "buildSolanaLiveCaptureReviewSigningPackage in scripts/e2e/sccp-solana-live-capture-witness.mjs",
      privateKeyInputsAccepted: false,
      witnessArtifactSha256:
        "SHA-256 of the exact saved reviewed-witness artifact bytes, including its final LF when present",
      signedPayloadSchema:
        "iroha-demo-sccp-solana-live-capture-review-signed-payload/v1",
      signedPayloadFieldsInCanonicalOrder: [
        "schema",
        "routeId",
        "assetKey",
        "routeRevision",
        "witnessArtifactSha256",
        "reviewPolicySha256",
        "preLiveInputSnapshotSha256",
        "captureSha256",
        "evidenceBindingSha256",
        "reviewClaims",
        "markers",
      ],
      canonicalPayloadEncoding:
        "UTF-8 bytes of canonicalSccpJson(signedPayload), with no trailing LF",
      signatureDomainUtf8: SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN,
      signatureDomainHex: Buffer.from(
        SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN,
        "utf8",
      ).toString("hex"),
      signaturePayloadConstruction:
        "domain UTF-8 bytes concatenated with canonical signed-payload UTF-8 bytes",
      signedPayloadSha256:
        "SHA-256 of the full domain-separated signature payload bytes",
      signatureAlgorithm: "ed25519",
      attestationShape: {
        schema: "iroha-demo-sccp-solana-live-capture-review-attestation/v1",
        signedPayload: "the exact constructed signed payload object",
        signatures:
          "reviewerId-sorted detached signatures carrying algorithm, signedPayloadSha256, and canonical 64-byte signatureBase64",
      },
    },
    decodedDwellWindows: scan.samples.map((sample) => ({
      id: sample.id,
      atMilliseconds: sample.atMilliseconds,
      offsetsMilliseconds: sample.dwellFrames.map(
        (frame) => frame.offsetMilliseconds,
      ),
      payloadSha256: built.stageHashes[sample.id],
    })),
    independentReviewRequired: [
      "Confirm the recording continuously shows the genuine bidirectional SCCP UI flow.",
      "Confirm exact public registry, TAIRA-to-Solana receipts, and Solana-to-TAIRA receipts are human-visible.",
      "Confirm unrelated footage is absent and the QR cards were not composited as an overlay over unrelated media.",
      "Only after review, update the six review booleans to true and qrOverlayOnly to false, save candidateWitness as canonical JSON, and independently pin its SHA-256.",
      "Construct the exact domain-separated signed payload from the reviewed witness and obtain the policy threshold of detached Ed25519 signatures externally; this repository never accepts reviewer private keys or signs review claims.",
      "Use the signer-free buildSolanaLiveCaptureReviewSigningPackage helper to emit and verify the exact canonical payload bytes/hash before external signing.",
    ],
  };
  await writeAtomicJsonFile(resolvedOutputPath, request);
  return { reportPath: resolvedOutputPath, report: request };
};

export const writeSolanaLiveCaptureReviewSigningPackage = async ({
  outputPath,
  witnessArtifact,
} = {}) => {
  if (!isRecord(witnessArtifact)) {
    throw new Error("Pinned reviewed witness artifact is required.");
  }
  const resolvedOutputPath = path.resolve(outputPath);
  await assertSolanaLiveCaptureOutputsDisjoint({
    outputPaths: [resolvedOutputPath],
    protectedInputPaths: [witnessArtifact.path],
  });
  const signingPackage = buildSolanaLiveCaptureReviewSigningPackage({
    witness: witnessArtifact.witness,
    witnessArtifactSha256: witnessArtifact.sha256,
  });
  await writeAtomicJsonFile(resolvedOutputPath, signingPackage);
  return { reportPath: resolvedOutputPath, report: signingPackage };
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
  liveCaptureVideo,
  liveCaptureVideoSha256,
  liveCaptureWitness,
  liveCaptureWitnessArtifact,
  liveCaptureReviewAttestation,
  liveCaptureReviewAttestationArtifact,
  authenticatedCaptureReview,
  captureReviewPolicy,
  protectedInputPaths = [],
}) => {
  await ensureSafeOutputDirectory(outputDir);
  const normalizedLiveCaptureSha256 = String(
    liveCaptureVideoSha256 ?? "",
  ).toLowerCase();
  if (
    typeof liveCaptureVideo !== "string" ||
    !liveCaptureVideo.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(normalizedLiveCaptureSha256)
  ) {
    throw new Error(
      "A real live capture path and independent lowercase 0x SHA-256 are required for a successful Solana SCCP video.",
    );
  }
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
        preLiveInputSnapshotSha256:
          freshProductionGateReport?.preLiveInputSnapshotSha256 ?? null,
        failedCheckIds: readArray(freshProductionGateReport, "checks")
          .filter((check) => check?.status !== "pass")
          .map((check) => readStringValue(check, "id"))
          .filter(Boolean),
      },
      governancePlanSha256: liveEvidence.governancePlanSha256,
      governanceRegistrationSha256: liveEvidence.governanceRegistrationSha256,
      governanceActivationSha256: liveEvidence.governanceActivationSha256,
      publicRegistrySha256: liveEvidence.publicRegistrySha256,
      liveCaptureSha256: normalizedLiveCaptureSha256,
      liveCaptureWitnessPinned: true,
      liveCaptureWitnessSha256: liveCaptureWitnessArtifact.sha256,
      liveCaptureReviewAttestationPinned: true,
      liveCaptureReviewAttestationSha256:
        liveCaptureReviewAttestationArtifact.sha256,
    },
    authoritativeReadbackVerified: authoritativeReadback?.ready === true,
    authoritativeReadback,
    liveEvidence,
    captureSemanticWitness: liveCaptureWitness,
    captureSemanticWitnessArtifact: {
      path: "[independently-reviewed-capture-witness]",
      size: liveCaptureWitnessArtifact.size,
      sha256: liveCaptureWitnessArtifact.sha256,
    },
    captureReviewAttestation: liveCaptureReviewAttestation,
    captureReviewAttestationArtifact: {
      path: "[detached-ed25519-review-attestation]",
      size: liveCaptureReviewAttestationArtifact.size,
      sha256: liveCaptureReviewAttestationArtifact.sha256,
    },
    captureReviewAuthentication: authenticatedCaptureReview,
  };
  const preLiveInputSnapshotSha256 =
    freshProductionGateReport?.preLiveInputSnapshotSha256;
  if (!/^0x[0-9a-f]{64}$/u.test(preLiveInputSnapshotSha256 ?? "")) {
    throw new Error(
      "Fresh Solana production gate did not provide a canonical pre-live input snapshot hash.",
    );
  }
  const subtitleText = `WEBVTT

00:00.000 --> 00:05.000
Step 1: Public TAIRA typed-registry revision 1 for ${SCCP_SOLANA_XOR_ROUTE_ID} is bidirectional. Exact pre-live input snapshot ${preLiveInputSnapshotSha256}.

00:05.000 --> 00:10.000
Step 2: Fresh Solana readback proved distinct destination, source, and native verifier Loader-v3 programs, exact SBPF V3, immutable ProgramData, and initialized SCCPMAT1 and route PDAs.

00:10.000 --> 00:15.000
Step 3: Separate enacted Parliament registration and activation artifacts are pinned to the same reviewed route and typed-registry hash.

00:15.000 --> 00:20.000
Step 4: The TAIRA wallet submitted source transaction ${liveEvidence.tairaToSolana.tairaSourceTx} and SCCP message ${liveEvidence.tairaToSolana.messageId}.

00:20.000 --> 00:25.000
Step 5: The connected Solana wallet approved the destination finalize transaction ${liveEvidence.tairaToSolana.solanaTxId}.

00:25.000 --> 00:30.000
Step 6: The Solana wallet submitted the return source-burn transaction ${liveEvidence.solanaToTaira.solanaSourceTx}.

00:30.000 --> 00:35.000
Step 7: TAIRA accepted the bound Solana source proof in settlement transaction ${liveEvidence.solanaToTaira.tairaSettlementTx}.

00:35.000 --> 00:40.000
Step 8: Fresh canonical Solana and TAIRA readbacks proved both finalized directions, exact SCCP bindings, replay protection, and successful XOR state deltas. This real screen capture is pinned by ${normalizedLiveCaptureSha256}.
`;
  const subtitleCues = parseWebVttCues(subtitleText);
  transcript.subtitleCues = subtitleCues;
  transcript.subtitleSummary =
    summarizeSolanaLiveVideoSubtitleCues(subtitleCues);
  const transcriptPath = path.join(outputDir, "sccp-solana-live-video.json");
  const subtitlesPath = path.join(outputDir, "sccp-solana-live-video.vtt");
  const videoPath = path.join(outputDir, "sccp-solana-live-video.mp4");
  const stagingSuffix = `.next-${randomUUID()}`;
  const stagingSubtitlesPath = `${subtitlesPath}${stagingSuffix}`;
  const stagingVideoPath = `${videoPath}${stagingSuffix}`;
  const resolvedLiveCaptureVideo = path.resolve(liveCaptureVideo);
  await assertSolanaLiveCaptureOutputsDisjoint({
    outputPaths: [
      transcriptPath,
      subtitlesPath,
      videoPath,
      stagingSubtitlesPath,
      stagingVideoPath,
    ],
    protectedInputPaths: [
      resolvedLiveCaptureVideo,
      liveEvidence.evidencePath,
      liveCaptureWitnessArtifact.path,
      liveCaptureReviewAttestationArtifact.path,
      ...protectedInputPaths,
    ],
  });
  transcript.videoArtifacts = [
    { path: videoPath, mediaType: "video/mp4" },
    { path: subtitlesPath, mediaType: "text/vtt" },
  ];
  try {
    await writeAtomicFile(stagingSubtitlesPath, subtitleText);
    transcript.mediaVerification = renderSolanaLiveVideoMp4({
      subtitlesPath: stagingSubtitlesPath,
      videoPath: stagingVideoPath,
      durationSeconds: 41,
      subtitleSummary: transcript.subtitleSummary,
      liveCaptureVideo: resolvedLiveCaptureVideo,
      liveCaptureVideoSha256: normalizedLiveCaptureSha256,
      liveCaptureWitness,
      liveCaptureReviewAttestation,
      liveCaptureWitnessArtifactSha256: liveCaptureWitnessArtifact.sha256,
      captureReviewPolicy,
      liveEvidence,
      preLiveInputSnapshotSha256,
    });
    transcript.sourceCapture = transcript.mediaVerification.sourceCapture;
    if (transcript.sourceCapture?.verifiedRealCapture !== true) {
      throw new Error(
        "The successful Solana SCCP MP4 was not derived from a verified real capture.",
      );
    }
    commitGeneratedFileSync(stagingVideoPath, videoPath);
    await rename(stagingSubtitlesPath, subtitlesPath);
  } catch (error) {
    await Promise.all([
      rm(stagingSubtitlesPath, { force: true }).catch(() => {}),
      rm(stagingVideoPath, { force: true }).catch(() => {}),
    ]);
    throw error;
  }
  transcript.mediaArtifacts = {
    mp4: await hashSuccessfulMediaArtifact(videoPath, "video/mp4"),
    vtt: await hashSuccessfulMediaArtifact(subtitlesPath, "text/vtt"),
  };
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
  const blockedArtifactProtectedInputPaths = [
    options.governancePlan,
    options.governanceRegistration,
    options.governanceActivation,
    options.smokeReadiness,
    options.productionGate,
    options.productionGateSnapshot,
    options.preflightReport,
    options.liveEvidence,
    options.liveCaptureVideo,
    options.liveCaptureWitness,
    options.liveCaptureReviewAttestation,
  ];
  const writeBlocked = (args) =>
    writeBlockedArtifacts({
      ...args,
      protectedInputPaths: blockedArtifactProtectedInputPaths,
    });
  let pinnedProductionGateSnapshot = null;
  let pinnedPreLiveInputSnapshot = null;
  let pinnedCaptureReviewTrust = null;
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
      pinnedCaptureReviewTrust = await readPinnedCaptureReviewTrust({
        snapshot: pinnedPreLiveInputSnapshot,
        expectedProverGovernanceApprovalSha256:
          options.proverGovernanceApprovalSha256 ??
          process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
      });
      blockedArtifactProtectedInputPaths.push(
        ...Object.values(pinnedPreLiveInputSnapshot?.inputs ?? {}).map(
          (input) => input.path,
        ),
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
          "Pinned pre-live production gate is not success-eligible.",
        );
      }
    } catch {
      const reason =
        "Solana SCCP live video blocked: pinned production-gate snapshot validation failed.";
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
      const blocked = await writeBlocked({
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
  const governancePlanPath = path.resolve(
    options.governancePlan ||
      snapshotPath("governancePlan", DEFAULT_GOVERNANCE_PLAN_PATH),
  );
  const governanceRegistrationPath = path.resolve(
    options.governanceRegistration ||
      snapshotPath(
        "governanceRegistration",
        DEFAULT_GOVERNANCE_REGISTER_RESULT_PATH,
      ),
  );
  const governanceActivationPath = path.resolve(
    options.governanceActivation ||
      snapshotPath(
        "governanceActivation",
        DEFAULT_GOVERNANCE_ACTIVATE_RESULT_PATH,
      ),
  );
  const smokeReadinessPath = path.resolve(
    options.smokeReadiness ||
      snapshotPath("smokeReadiness", DEFAULT_SMOKE_READINESS_PATH),
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
  blockedArtifactProtectedInputPaths.push(
    governancePlanPath,
    governanceRegistrationPath,
    governanceActivationPath,
    smokeReadinessPath,
    productionGatePath,
    suppliedPreflightReportPath,
  );
  const readPrerequisite = (id, file) =>
    pinnedPreLiveInputSnapshot
      ? readPinnedPreLiveSnapshotJson(pinnedPreLiveInputSnapshot, id)
      : readJsonIfExists(file);
  let [
    governancePlanReport,
    governanceRegistrationReport,
    governanceActivationReport,
    smokeReadinessReport,
    productionGateReport,
  ] = await Promise.all([
    readPrerequisite("governancePlan", governancePlanPath),
    readPrerequisite("governanceRegistration", governanceRegistrationPath),
    readPrerequisite("governanceActivation", governanceActivationPath),
    readPrerequisite("smokeReadiness", smokeReadinessPath),
    pinnedProductionGateSnapshot
      ? pinnedProductionGateSnapshot.report
      : readJsonIfExists(productionGatePath),
  ]);
  const productionRequirementsReport = null;
  const productionRequirementsPath = null;
  const handoffVerificationReport = null;
  const handoffVerificationPath = null;
  const proofMaterialBundleReport = null;
  const proofMaterialBundlePath = null;
  const deploymentVideoTranscriptReport = null;
  const deploymentVideoTranscriptPath = null;
  let diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
    productionRequirementsReport,
    productionRequirementsPath,
    governancePlanReport,
    governancePlanPath,
    governanceRegistrationReport,
    governanceRegistrationPath,
    governanceActivationReport,
    governanceActivationPath,
    smokeReadinessReport,
    smokeReadinessPath,
    handoffVerificationReport,
    handoffVerificationPath,
    proofMaterialBundleReport,
    proofMaterialBundlePath,
    deploymentVideoTranscriptReport,
    deploymentVideoTranscriptPath,
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
  blockedArtifactProtectedInputPaths.push(reportPath);

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
          productionGateReport: pinnedProductionGateSnapshot?.report,
          outputDir,
          proverGovernanceApprovalSha256:
            options.proverGovernanceApprovalSha256 ??
            process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
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
      blockedArtifactProtectedInputPaths.push(freshProductionGatePath);
      productionGateReport = freshGate.report;
      productionGatePath = freshGate.reportPath;
      diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
        productionRequirementsReport,
        productionRequirementsPath,
        governancePlanReport,
        governancePlanPath,
        governanceRegistrationReport,
        governanceRegistrationPath,
        governanceActivationReport,
        governanceActivationPath,
        smokeReadinessReport,
        smokeReadinessPath,
        handoffVerificationReport,
        handoffVerificationPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
        deploymentVideoTranscriptReport,
        deploymentVideoTranscriptPath,
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
    const blocked = await writeBlocked({
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
    const blocked = await writeBlocked({
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
    const blocked = await writeBlocked({
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
  } catch {
    const reason =
      "Solana SCCP live video blocked: live evidence artifact is missing or invalid.";
    const blocked = await writeBlocked({
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
    const blocked = await writeBlocked({
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
  let pinnedCaptureWitness;
  let pinnedCaptureReviewAttestation;
  let authenticatedCaptureReview;
  try {
    pinnedCaptureReviewTrust = await readPinnedCaptureReviewTrust({
      snapshot: pinnedPreLiveInputSnapshot,
      expectedProverGovernanceApprovalSha256:
        options.proverGovernanceApprovalSha256 ??
        process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
    });
    pinnedCaptureWitness = await readPinnedLiveCaptureWitness({
      file: options.liveCaptureWitness,
      expectedSha256: options.liveCaptureWitnessSha256,
    });
    pinnedCaptureReviewAttestation =
      await readPinnedLiveCaptureReviewAttestation({
        file: options.liveCaptureReviewAttestation,
        expectedSha256: options.liveCaptureReviewAttestationSha256,
      });
    const normalizedWitness = normalizeSolanaLiveCaptureWitness(
      pinnedCaptureWitness.witness,
      {
        liveEvidence,
        preLiveInputSnapshotSha256:
          freshProductionGateReport?.preLiveInputSnapshotSha256,
        expectedCaptureSha256: options.liveCaptureVideoSha256,
        reviewPolicySha256: pinnedCaptureReviewTrust.policySha256,
      },
    );
    authenticatedCaptureReview = verifySolanaLiveCaptureReviewAttestation({
      attestation: pinnedCaptureReviewAttestation.attestation,
      witness: normalizedWitness,
      witnessArtifactSha256: pinnedCaptureWitness.sha256,
      reviewPolicy: pinnedCaptureReviewTrust.policy,
    });
  } catch (error) {
    const reason = `Solana SCCP live video blocked: semantic capture witness validation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const blocked = await writeBlocked({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems: [
        { id: "semantic-live-capture-witness", detail: reason },
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
    const blocked = await writeBlocked({
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
  let artifacts;
  try {
    artifacts = await writeSuccessfulArtifacts({
      outputDir,
      preflightReport,
      preflightReportPath: reportPath,
      liveEvidence,
      authoritativeReadback,
      successEvidencePolicy,
      freshProductionGateReport,
      freshProductionGatePath,
      liveCaptureVideo: options.liveCaptureVideo,
      liveCaptureVideoSha256: options.liveCaptureVideoSha256,
      liveCaptureWitness: pinnedCaptureWitness.witness,
      liveCaptureWitnessArtifact: pinnedCaptureWitness,
      liveCaptureReviewAttestation: pinnedCaptureReviewAttestation.attestation,
      liveCaptureReviewAttestationArtifact: pinnedCaptureReviewAttestation,
      authenticatedCaptureReview,
      captureReviewPolicy: pinnedCaptureReviewTrust.policy,
      protectedInputPaths: [
        options.productionGateSnapshot,
        reportPath,
        freshProductionGatePath,
        pinnedCaptureReviewAttestation.path,
        ...Object.values(pinnedPreLiveInputSnapshot?.inputs ?? {}).map(
          (input) => input.path,
        ),
      ],
    });
  } catch (error) {
    const reason = `Solana SCCP live video blocked: real live capture verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const blocked = await writeBlocked({
      outputDir,
      preflightReport,
      reason,
      diagnostics,
      successPrerequisiteProblems: [
        { id: "verified-real-live-capture", detail: reason },
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
  if (args["write-live-capture-review-signing-package"]) {
    const witnessArtifact = await readPinnedLiveCaptureWitness({
      file: args["live-capture-witness"],
      expectedSha256: args["live-capture-witness-sha256"],
    });
    const signingPackage = await writeSolanaLiveCaptureReviewSigningPackage({
      outputPath: args["write-live-capture-review-signing-package"],
      witnessArtifact,
    });
    console.log(
      `Solana SCCP live capture review signing package: ${signingPackage.reportPath}`,
    );
    return;
  }
  if (
    args["write-live-capture-witness-kit"] ||
    args["write-live-capture-witness-review-request"]
  ) {
    const pinnedGate = await readPinnedProductionGateSnapshot({
      file: args["production-gate-snapshot"],
      expectedSha256: args["production-gate-snapshot-sha256"],
    });
    const { validateSolanaProductionGatePreLiveInputSnapshot } = await import(
      "./sccp-solana-production-gate.mjs"
    );
    const snapshot = validateSolanaProductionGatePreLiveInputSnapshot(
      pinnedGate.report?.preLiveInputSnapshot,
    );
    const captureReviewTrust = await readPinnedCaptureReviewTrust({
      snapshot,
      expectedProverGovernanceApprovalSha256:
        args["prover-governance-approval-sha256"] ||
        process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
    });
    const nonVideoFailures = readArray(
      pinnedGate.report,
      "failedCheckIds",
    ).filter((id) => id !== "live-bidirectional-video");
    if (
      pinnedGate.report?.schema !==
        "iroha-demo-sccp-solana-production-gate/v1" ||
      pinnedGate.report?.routeId !== SCCP_SOLANA_XOR_ROUTE_ID ||
      pinnedGate.report?.successExecutionPolicy?.ready !== true ||
      nonVideoFailures.length > 0
    ) {
      throw new Error(
        "Live capture witness tooling requires a pinned, success-eligible pre-live production gate.",
      );
    }
    const liveEvidence = await loadLiveEvidence(args["live-evidence"]);
    if (args["write-live-capture-witness-kit"]) {
      const kit = await writeSolanaLiveCaptureWitnessKit({
        outputDir: args["write-live-capture-witness-kit"],
        liveEvidence,
        preLiveInputSnapshotSha256: snapshot.preLiveInputSnapshotSha256,
        protectedInputPaths: [
          pinnedGate.path,
          liveEvidence.evidencePath,
          captureReviewTrust.policyPath,
        ],
      });
      console.log(`Solana SCCP live capture witness kit: ${kit.manifestPath}`);
      return;
    }
    if (
      typeof args["live-capture-video"] !== "string" ||
      typeof args["live-capture-video-sha256"] !== "string"
    ) {
      throw new Error(
        "Capture witness review requests require --live-capture-video and --live-capture-video-sha256.",
      );
    }
    const reviewRequest = await writeSolanaLiveCaptureWitnessReviewRequest({
      outputPath: args["write-live-capture-witness-review-request"],
      captureVideoPath: args["live-capture-video"],
      expectedCaptureSha256: args["live-capture-video-sha256"],
      markerTimesMilliseconds: args["live-capture-marker-times-ms"],
      liveEvidence,
      preLiveInputSnapshotSha256: snapshot.preLiveInputSnapshotSha256,
      reviewPolicy: captureReviewTrust.policy,
      reviewPolicySha256: captureReviewTrust.policySha256,
      protectedInputPaths: [
        pinnedGate.path,
        liveEvidence.evidencePath,
        captureReviewTrust.policyPath,
      ],
    });
    console.log(
      `Solana SCCP live capture witness review request: ${reviewRequest.reportPath}`,
    );
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
    governancePlan: args["governance-plan"],
    governanceRegistration: args["governance-register-result"],
    governanceActivation: args["governance-activate-result"],
    smokeReadiness: args["smoke-readiness"],
    handoffVerification: args["handoff-verification"],
    proofMaterialBundle: args["proof-material-bundle"],
    deploymentVideoTranscript: args["deployment-video-transcript"],
    productionGate: args["production-gate"],
    productionGateSnapshot: args["production-gate-snapshot"],
    productionGateSnapshotSha256: args["production-gate-snapshot-sha256"],
    liveCaptureVideo: args["live-capture-video"],
    liveCaptureVideoSha256: args["live-capture-video-sha256"],
    liveCaptureWitness: args["live-capture-witness"],
    liveCaptureWitnessSha256: args["live-capture-witness-sha256"],
    liveCaptureReviewAttestation: args["live-capture-review-attestation"],
    liveCaptureReviewAttestationSha256:
      args["live-capture-review-attestation-sha256"],
    proverGovernanceApprovalSha256:
      args["prover-governance-approval-sha256"] ||
      process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
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

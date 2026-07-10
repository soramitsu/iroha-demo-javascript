#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  DEFAULT_SOLANA_TESTNET_RPC_URL,
  DEFAULT_TAIRA_TORII_URL,
  SCCP_SOLANA_DOMAIN,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_XOR_ASSET_KEY,
  SOLANA_TESTNET_CAIP_CHAIN_ID,
  SOLANA_TESTNET_NETWORK_ID,
  runSccpSolanaRoutePreflight,
} from "./sccp-solana-route-preflight.mjs";
import {
  buildSccpSolanaSuccessNetworkPolicy,
  CANONICAL_SOLANA_TESTNET_RPC_URL,
} from "./sccp-solana-success-evidence-policy.mjs";
import {
  DEFAULT_SOLANA_TEXT_MAX_BYTES,
  parseStrictCliArgs,
  readStableJsonFileIfExists,
  readStableRegularFile,
  withStableRegularFileDescriptorsSync,
  writeAtomicJsonFile,
} from "./sccp-solana-report-io.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TAIRA_NETWORK_PREFIX = 369;
const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-solana-production-gate",
);
const DEFAULT_DEPLOY_DIR = path.join(repoRoot, "output/sccp-solana-deploy");
const DEFAULT_LIVE_VIDEO_DIR = path.join(
  repoRoot,
  "output/sccp-solana-live-video",
);
const DEFAULT_SMOKE_READINESS_DIR = path.join(
  repoRoot,
  "output/sccp-solana-smoke-readiness",
);
const DEFAULT_REQUIREMENTS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-production-requirements.json",
);
const DEFAULT_POST_DEPLOY_EVIDENCE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-post-deploy-evidence.json",
);
const DEFAULT_PROVER_READINESS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-prover-readiness.json",
);
const DEFAULT_PRODUCTION_MATERIAL_INVENTORY_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-production-material-inventory.json",
);
const DEFAULT_ROUTE_MANIFEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route.manifest.json",
);
const DEFAULT_PUBLISH_READINESS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route.publish-readiness.json",
);
const DEFAULT_ROUTE_PUBLISH_BLOCKED_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route.publish-blocked.json",
);
const DEFAULT_ROUTE_PUBLICATION_REQUEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route-publication-request.json",
);
const DEFAULT_ROUTE_MANAGER_ACCESS_REQUEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-route-manager-access-request.json",
);
const DEFAULT_OPERATOR_HANDOFF_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-operator-handoff.json",
);
const DEFAULT_ACTIVATION_PACKAGE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-activation-package.json",
);
const DEFAULT_LANE_ACTIVATION_PROPOSAL_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-lane-activation-proposal.json",
);
const DEFAULT_LANE_ACTIVATION_REQUEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-lane-activation-request.json",
);
const DEFAULT_SOURCE_MATERIAL_HANDOFF_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-source-material-handoff.json",
);
const DEFAULT_HANDOFF_VERIFICATION_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-source-material-handoff.verification.json",
);
const DEFAULT_SOURCE_BURN_READINESS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-source-burn-readiness.json",
);
const DEFAULT_SOURCE_BURN_SUBMISSION_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-source-burn.submission.json",
);
const DEFAULT_PROOF_MATERIAL_REQUEST_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-proof-material-request.json",
);
const DEFAULT_PROOF_MATERIAL_BUNDLE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-proof-material-bundle.json",
);
const DEFAULT_PROOF_MATERIAL_CEREMONY_PACKAGE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-proof-material-ceremony-package.json",
);
const DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.json",
);
const DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.mp4",
);
const DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.vtt",
);
const DEFAULT_LIVE_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.json",
);
const DEFAULT_LIVE_VIDEO_MP4_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.mp4",
);
const DEFAULT_LIVE_VIDEO_VTT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.vtt",
);
const DEFAULT_BLOCKED_LIVE_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video-blocked.json",
);
const DEFAULT_BLOCKED_LIVE_VIDEO_MP4_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video-blocked.mp4",
);
const DEFAULT_BLOCKED_LIVE_VIDEO_VTT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video-blocked.vtt",
);
const DEFAULT_SMOKE_READINESS_PATH = path.join(
  DEFAULT_SMOKE_READINESS_DIR,
  "latest.json",
);
const REPORT_FILE = "sccp-solana-production-gate.json";
const SMOKE_READINESS_SUBPATH = path.join("smoke-readiness", "latest.json");
const DEPLOY_ARTIFACT_SENTINELS = Object.freeze([
  "taira-solana-xor-production-requirements.json",
  "taira-solana-xor-source-material-handoff.verification.json",
  "sccp-solana-deployment-video.json",
]);
const SOLANA_ROUTE_PREFLIGHT_SCHEMA =
  "iroha-demo-sccp-solana-route-preflight/v1";
const SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS = Object.freeze([
  "sccp-capabilities-load",
  "sccp-submit-capabilities",
  "sccp-manifest-load",
  "solana-capability-publication",
  "public-route-publication",
  "solana-lane-publication",
  "solana-route-instance-publication",
  "route-manifest-shape",
  "production-ready-flag",
  "browser-proof-modules",
  "solana-live-programdata-evidence",
  "solana-live-bridge-source-evidence",
]);

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimString = (value) => String(value ?? "").trim();

const HEX32 = /^0x[0-9a-f]{64}$/u;
const LIVE_HEX32 = /^(?:0x)?[0-9a-f]{64}$/iu;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;

const isHex32 = (value) => HEX32.test(trimString(value));
const isLiveHex32 = (value) => LIVE_HEX32.test(trimString(value));
const isSolanaSignature = (value) => SOLANA_SIGNATURE.test(trimString(value));

const sha256Hex = (value) =>
  `0x${createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")}`;

const cueTextHash = (cueTexts) => sha256Hex(cueTexts.join("\n"));

const canonicalTairaRouteAuthorityStatus = (authority) => {
  const normalizedAuthority = typeof authority === "string" ? authority : "";
  if (!normalizedAuthority) {
    return {
      authority: null,
      canonical: false,
      error: "missing route-manager authority",
    };
  }
  if (normalizedAuthority !== normalizedAuthority.trim()) {
    return {
      authority: normalizedAuthority,
      canonical: false,
      error: "authority must use canonical text form",
    };
  }
  try {
    const canonical = AccountAddress.fromAccountId(
      normalizedAuthority,
      TAIRA_NETWORK_PREFIX,
    ).toI105(TAIRA_NETWORK_PREFIX);
    if (canonical !== normalizedAuthority || !canonical.startsWith("testu")) {
      return {
        authority: normalizedAuthority,
        canonical: false,
        error: "authority must be a canonical TAIRA testnet I105 account id",
      };
    }
    return {
      authority: normalizedAuthority,
      canonical: true,
      error: null,
    };
  } catch (error) {
    return {
      authority: normalizedAuthority,
      canonical: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const readBoolArg = (value) => value === true || value === "true";

const SOLANA_LANE_CHAIN_IDS = new Set(["sol", SOLANA_TESTNET_NETWORK_ID]);

const isExpectedSolanaLaneChain = (value) =>
  SOLANA_LANE_CHAIN_IDS.has(trimString(value).toLowerCase());

const makeCheck = (id, ok, detail, evidence = undefined) => {
  const check = {
    id,
    status: ok ? "pass" : "fail",
    detail,
  };
  if (evidence !== undefined) {
    check.evidence = evidence;
  }
  return check;
};

const failedChecks = (checks) =>
  checks.filter((check) => check.status !== "pass");

const readFirstRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
};

const readFirstArray = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const readFirstString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readFirstStringLike = (record, ...keys) => {
  const stringValue = readFirstString(record, ...keys);
  if (stringValue) {
    return stringValue;
  }
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
};

const readAliasEntries = (record, keys) =>
  keys
    .filter((key) => Object.prototype.hasOwnProperty.call(record ?? {}, key))
    .map((key) => ({ key, value: record[key] }));

const formatAliasValue = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
};

const readConsistentStringAlias = (record, label, keys) => {
  const entries = readAliasEntries(record, keys).map(({ key, value }) => ({
    key,
    value: formatAliasValue(value),
  }));
  const present = entries.filter(({ value }) => value);
  if (present.length === 0) {
    return { value: "", problems: [] };
  }
  const [{ key: firstKey, value: firstValue }] = present;
  const problems = [];
  for (const { key, value } of present.slice(1)) {
    if (value !== firstValue) {
      problems.push(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return { value: firstValue, problems };
};

const readConsistentNumberAlias = (record, label, keys) => {
  const entries = readAliasEntries(record, keys);
  if (entries.length === 0) {
    return { value: null, problems: [] };
  }
  const normalized = entries.map(({ key, value }) => {
    const numberValue = typeof value === "number" ? value : Number(value);
    return { key, value: numberValue };
  });
  const invalid = normalized.filter(({ value }) => !Number.isFinite(value));
  if (invalid.length > 0) {
    return {
      value: null,
      problems: invalid.map(({ key }) => `${label}.${key} must be a number.`),
    };
  }
  const [{ key: firstKey, value: firstValue }] = normalized;
  const problems = [];
  for (const { key, value } of normalized.slice(1)) {
    if (value !== firstValue) {
      problems.push(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return { value: firstValue, problems };
};

const readConsistentBooleanAlias = (record, label, keys) => {
  const entries = readAliasEntries(record, keys);
  if (entries.length === 0) {
    return { value: null, problems: [] };
  }
  const normalized = entries.map(({ key, value }) => {
    if (typeof value === "boolean") {
      return { key, value };
    }
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true") {
        return { key, value: true };
      }
      if (lowered === "false") {
        return { key, value: false };
      }
    }
    return { key, value: null };
  });
  const invalid = normalized.filter(({ value }) => value === null);
  if (invalid.length > 0) {
    return {
      value: null,
      problems: invalid.map(({ key }) => `${label}.${key} must be boolean.`),
    };
  }
  const [{ key: firstKey, value: firstValue }] = normalized;
  const problems = [];
  for (const { key, value } of normalized.slice(1)) {
    if (value !== firstValue) {
      problems.push(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return { value: firstValue, problems };
};

const hasComparableValue = (value) => value !== null && value !== "";

const pushCrossSourceValueProblem = ({
  problems,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}) => {
  if (!hasComparableValue(leftValue) || !hasComparableValue(rightValue)) {
    return;
  }
  if (leftValue === rightValue) {
    return;
  }
  problems.push(
    `${leftLabel} must agree with ${rightLabel}: ${leftLabel}=${leftValue} but ${rightLabel}=${rightValue}.`,
  );
};

const normalizedLiveHexIdentity = (value) =>
  trimString(value).replace(/^0x/iu, "").toLowerCase();

const liveBidirectionalEvidenceStatus = (forward, reverse) => {
  const fields = {
    forwardMessageId: readFirstString(forward, "messageId", "message_id"),
    forwardTairaSourceTx: readFirstString(
      forward,
      "tairaSourceTx",
      "taira_source_tx",
      "sourceTx",
      "source_tx",
    ),
    forwardSolanaTxId: readFirstString(
      forward,
      "solanaTxId",
      "solana_tx_id",
      "signature",
      "txId",
      "tx_id",
      "transactionSignature",
      "transaction_signature",
    ),
    reverseSolanaSourceTx: readFirstString(
      reverse,
      "solanaSourceTx",
      "solana_source_tx",
      "sourceTx",
      "source_tx",
      "signature",
      "txId",
      "tx_id",
      "transactionSignature",
      "transaction_signature",
    ),
    reverseTairaSettlementTx: readFirstString(
      reverse,
      "tairaSettlementTx",
      "taira_settlement_tx",
      "settlementTx",
      "settlement_tx",
      "transactionHash",
      "transaction_hash",
    ),
  };
  const fieldSpecs = [
    {
      id: "forward-message-id",
      value: fields.forwardMessageId,
      valid: isLiveHex32,
    },
    {
      id: "forward-taira-source-tx",
      value: fields.forwardTairaSourceTx,
      valid: isLiveHex32,
    },
    {
      id: "forward-solana-tx",
      value: fields.forwardSolanaTxId,
      valid: isSolanaSignature,
    },
    {
      id: "reverse-solana-source-tx",
      value: fields.reverseSolanaSourceTx,
      valid: isSolanaSignature,
    },
    {
      id: "reverse-taira-settlement-tx",
      value: fields.reverseTairaSettlementTx,
      valid: isLiveHex32,
    },
  ];
  const missingFieldIds = fieldSpecs
    .filter((field) => !field.value)
    .map((field) => field.id);
  const invalidFieldIds = fieldSpecs
    .filter((field) => field.value && !field.valid(field.value))
    .map((field) => field.id);
  const duplicateFieldIdPairs = [];
  if (
    fields.forwardTairaSourceTx &&
    fields.reverseTairaSettlementTx &&
    normalizedLiveHexIdentity(fields.forwardTairaSourceTx) ===
      normalizedLiveHexIdentity(fields.reverseTairaSettlementTx)
  ) {
    duplicateFieldIdPairs.push([
      "forward-taira-source-tx",
      "reverse-taira-settlement-tx",
    ]);
  }
  if (
    fields.forwardSolanaTxId &&
    fields.reverseSolanaSourceTx &&
    trimString(fields.forwardSolanaTxId) ===
      trimString(fields.reverseSolanaSourceTx)
  ) {
    duplicateFieldIdPairs.push([
      "forward-solana-tx",
      "reverse-solana-source-tx",
    ]);
  }
  const distinctOk = duplicateFieldIdPairs.length === 0;
  return {
    ok:
      missingFieldIds.length === 0 &&
      invalidFieldIds.length === 0 &&
      distinctOk,
    fields,
    requiredFieldIds: fieldSpecs.map((field) => field.id),
    missingFieldIds,
    invalidFieldIds,
    distinctOk,
    duplicateFieldIdPairs,
  };
};

const actionSummaries = (actions) =>
  Array.isArray(actions)
    ? actions
        .map((action) => {
          if (typeof action === "string" && action.trim()) {
            return { id: action.trim(), title: "" };
          }
          return {
            id: readFirstString(action, "id"),
            title: readFirstString(action, "title"),
          };
        })
        .filter((action) => action.id)
    : [];

const normalizeActionRequiredInputs = (inputs) =>
  inputs
    .map((input) => {
      if (typeof input === "string" && input.trim()) {
        return input.trim();
      }
      return readFirstString(input, "id");
    })
    .filter(Boolean);

const normalizeActionDetail = (action, source, depth = 0) => {
  if (!isRecord(action)) {
    return null;
  }
  const id = readFirstString(action, "id");
  if (!id) {
    return null;
  }
  const normalized = {
    id,
    title: readFirstString(action, "title") || id,
    detail: readFirstString(action, "detail") || null,
    source,
    blockedBy: readFirstArray(action, "blockedBy", "blocked_by")
      .map((blocker) => {
        if (typeof blocker === "string" && blocker.trim()) {
          return { id: blocker.trim(), detail: null };
        }
        return {
          id: readFirstString(blocker, "id"),
          detail: readFirstString(blocker, "detail") || null,
        };
      })
      .filter((blocker) => blocker.id),
    command: readFirstArray(action, "command"),
    requiredInputs: normalizeActionRequiredInputs(
      readFirstArray(action, "requiredInputs", "required_inputs"),
    ),
  };
  const validationCommands = readFirstArray(
    action,
    "validationCommands",
    "validation_commands",
  );
  if (validationCommands.length > 0) {
    normalized.validationCommands = validationCommands;
  }
  if (depth < 1) {
    const delegatedActions = readFirstArray(
      action,
      "delegatedActions",
      "delegated_actions",
    )
      .map((delegatedAction) =>
        normalizeActionDetail(delegatedAction, source, depth + 1),
      )
      .filter(Boolean);
    if (delegatedActions.length > 0) {
      normalized.delegatedActions = delegatedActions;
    }
  }
  return normalized;
};

const findActionDetail = (reports, ids) => {
  const wanted = new Set(ids);
  for (const { report, source } of reports) {
    for (const action of readFirstArray(
      report,
      "nextActionDetails",
      "next_action_details",
    )) {
      const normalized = normalizeActionDetail(action, source);
      if (normalized && wanted.has(normalized.id)) {
        return normalized;
      }
    }
  }
  return null;
};

const productionGateAction = ({
  id,
  title,
  detail,
  source = "production-gate",
  checkIds,
  checks,
  artifactDetail = null,
  command = [],
  requiredInputs = [],
}) => {
  const failed = failedChecks(checks);
  const failedById = new Map(failed.map((check) => [check.id, check]));
  const blockedBy = checkIds
    .map((checkId) => failedById.get(checkId))
    .filter(Boolean)
    .map((check) => ({
      id: check.id,
      detail: check.detail ?? null,
    }));
  if (blockedBy.length === 0) {
    return null;
  }
  return {
    id,
    title: artifactDetail?.title || title,
    detail: artifactDetail?.detail || detail,
    source: artifactDetail?.source || source,
    blockedBy,
    upstreamBlockedBy: artifactDetail?.blockedBy ?? [],
    command:
      Array.isArray(artifactDetail?.command) &&
      artifactDetail.command.length > 0
        ? artifactDetail.command
        : command,
    requiredInputs:
      Array.isArray(artifactDetail?.requiredInputs) &&
      artifactDetail.requiredInputs.length > 0
        ? artifactDetail.requiredInputs
        : requiredInputs,
    ...(Array.isArray(artifactDetail?.validationCommands) &&
    artifactDetail.validationCommands.length > 0
      ? { validationCommands: artifactDetail.validationCommands }
      : {}),
    ...(Array.isArray(artifactDetail?.delegatedActions) &&
    artifactDetail.delegatedActions.length > 0
      ? { delegatedActions: artifactDetail.delegatedActions }
      : {}),
  };
};

const normalizePath = (file) => path.resolve(trimString(file));

const isSolanaDeploymentArtifactDir = (dir) =>
  DEPLOY_ARTIFACT_SENTINELS.some((file) => existsSync(path.join(dir, file)));

const resolveDeployArtifactDir = ({ deployDir, outputDir }) => {
  if (deployDir) {
    return path.resolve(deployDir);
  }
  const resolvedOutputDir = outputDir ? path.resolve(outputDir) : null;
  if (resolvedOutputDir && isSolanaDeploymentArtifactDir(resolvedOutputDir)) {
    return resolvedOutputDir;
  }
  return DEFAULT_DEPLOY_DIR;
};

const deployArtifactPath = ({
  explicit,
  deployDir,
  defaultPath,
  filename = null,
  subpath = null,
}) => {
  if (explicit) {
    return path.resolve(explicit);
  }
  if (deployDir) {
    return path.join(
      deployDir,
      subpath || filename || path.basename(defaultPath),
    );
  }
  return defaultPath;
};

const artifactFact = (artifactFacts, file) => {
  const normalized = normalizePath(file);
  return (
    artifactFacts[normalized] ?? {
      path: normalized,
      exists: false,
      size: 0,
    }
  );
};

const mp4StreamEvidenceReady = (artifactFacts, file) => {
  const fact = artifactFact(artifactFacts, file);
  const media = fact.media;
  return Boolean(
    fact.exists === true &&
      Number(fact.size) > 0 &&
      media?.formatOk === true &&
      media?.hasVideo === true &&
      media?.hasAudio === true &&
      media?.hasEmbeddedSubtitle === true &&
      media?.embeddedSubtitle?.extracted === true &&
      Number(media?.embeddedSubtitle?.cueCount) > 0,
  );
};

const vttEvidenceReady = (artifactFacts, file) => {
  const fact = artifactFact(artifactFacts, file);
  return Boolean(
    fact.exists === true &&
      Number(fact.size) > 0 &&
      (fact.vtt?.webvtt === true || fact.vtt === undefined),
  );
};

const videoArtifactPaths = ({
  transcript,
  fallbackMp4Path,
  fallbackVttPath,
}) => {
  const artifacts = readFirstArray(
    transcript,
    "videoArtifacts",
    "video_artifacts",
  );
  const mp4 =
    artifacts
      .map((artifact) =>
        readFirstString(artifact, "path", "file", "filePath", "file_path"),
      )
      .find((file) => file.endsWith(".mp4")) || fallbackMp4Path;
  const vtt =
    artifacts
      .map((artifact) =>
        readFirstString(artifact, "path", "file", "filePath", "file_path"),
      )
      .find((file) => file.endsWith(".vtt")) || fallbackVttPath;
  return { mp4: normalizePath(mp4), vtt: normalizePath(vtt) };
};

const parseWebVttCueTexts = (webvtt) =>
  String(webvtt ?? "")
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => {
      const lines = block
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      return timingIndex >= 0 ? lines.slice(timingIndex + 1).join(" ") : "";
    })
    .filter(Boolean);

const deploymentTranscriptCueTexts = (deploymentVideoTranscript) => {
  const cues = readFirstArray(
    deploymentVideoTranscript,
    "subtitleCues",
    "subtitle_cues",
    "captions",
  );
  return cues
    .map((cue) => readFirstString(cue, "text", "caption", "body"))
    .filter(Boolean);
};

const deploymentVideoSubtitleExplanation = (deploymentVideoTranscript) => {
  const cueTexts = deploymentTranscriptCueTexts(deploymentVideoTranscript);
  const combinedText = cueTexts.join("\n");
  const numberedSteps = new Set(
    [...combinedText.matchAll(/\bStep\s+(\d+):/gu)]
      .map((match) => Number(match[1]))
      .filter((step) => Number.isSafeInteger(step) && step > 0),
  );
  const requiredSteps = [1, 3, 4, 5, 10, 15, 21, 22];
  const missingRequiredSteps = requiredSteps.filter(
    (step) => !numberedSteps.has(step),
  );
  const deployment =
    readFirstRecord(deploymentVideoTranscript, "deployment") ?? {};
  const sourceBurn = readFirstRecord(
    deployment,
    "sourceBurnSubmission",
    "source_burn_submission",
  );
  const routeCanary = readFirstRecord(
    deployment,
    "routeCanary",
    "route_canary",
  );
  const activationPackage = readFirstRecord(
    deployment,
    "activationPackage",
    "activation_package",
  );
  const evidenceMarkers = [
    ["route-id", SCCP_SOLANA_XOR_ROUTE_ID],
    ["verifier-program", deployment.verifierProgramId],
    ["bridge-program", deployment.bridgeProgramId],
    ["source-bridge-program", deployment.sourceBridgeProgramId],
    ["token-mint", deployment.tokenMintAddress],
    ["verifier-code-hash", deployment.verifierCodeHash],
    ["route-canary-signature", routeCanary?.signature],
    ["source-burn-signature", sourceBurn?.signature],
    ["activation-package-hash", activationPackage?.activationPackageHash],
  ]
    .map(([id, value]) => [id, trimString(value)])
    .filter(([, value]) => value);
  const missingEvidenceMarkerIds = evidenceMarkers
    .filter(([, value]) => !combinedText.includes(value))
    .map(([id]) => id);
  const blockedStatusOk =
    deploymentVideoTranscript?.ready === true ||
    /\bBlocked:/u.test(combinedText);
  return {
    ok:
      cueTexts.length >= 20 &&
      numberedSteps.size >= 20 &&
      missingRequiredSteps.length === 0 &&
      missingEvidenceMarkerIds.length === 0 &&
      blockedStatusOk,
    cueCount: cueTexts.length,
    numberedStepCount: numberedSteps.size,
    cueTextSha256: cueTextHash(cueTexts),
    requiredSteps,
    missingRequiredSteps,
    requiredEvidenceMarkerIds: evidenceMarkers.map(([id]) => id),
    missingEvidenceMarkerIds,
    blockedStatusOk,
  };
};

const liveVideoSubtitleExplanation = (
  liveVideoTranscript,
  evidenceStatus = null,
) => {
  const cueTexts = deploymentTranscriptCueTexts(liveVideoTranscript);
  const combinedText = cueTexts.join("\n");
  const numberedSteps = new Set(
    [...combinedText.matchAll(/\bStep\s+(\d+):/gu)]
      .map((match) => Number(match[1]))
      .filter((step) => Number.isSafeInteger(step) && step > 0),
  );
  const requiredSteps = [1, 2, 3, 4, 5];
  const missingRequiredSteps = requiredSteps.filter(
    (step) => !numberedSteps.has(step),
  );
  const liveEvidence = readFirstRecord(liveVideoTranscript, "liveEvidence");
  const forward = readFirstRecord(
    liveEvidence,
    "tairaToSolana",
    "taira_to_solana",
  );
  const reverse = readFirstRecord(
    liveEvidence,
    "solanaToTaira",
    "solana_to_taira",
  );
  const normalizedEvidenceStatus =
    evidenceStatus ?? liveBidirectionalEvidenceStatus(forward, reverse);
  const evidenceMarkers = [
    ["route-id", SCCP_SOLANA_XOR_ROUTE_ID],
    ["forward-message-id", normalizedEvidenceStatus.fields.forwardMessageId],
    [
      "forward-taira-source-tx",
      normalizedEvidenceStatus.fields.forwardTairaSourceTx,
    ],
    ["forward-solana-tx", normalizedEvidenceStatus.fields.forwardSolanaTxId],
    [
      "reverse-solana-source-tx",
      normalizedEvidenceStatus.fields.reverseSolanaSourceTx,
    ],
    [
      "reverse-taira-settlement-tx",
      normalizedEvidenceStatus.fields.reverseTairaSettlementTx,
    ],
  ].map(([id, value]) => [id, trimString(value)]);
  const missingEvidenceMarkerIds = evidenceMarkers
    .filter(([, value]) => !value || !combinedText.includes(value))
    .map(([id]) => id);
  return {
    ok:
      cueTexts.length >= 5 &&
      numberedSteps.size >= 5 &&
      missingRequiredSteps.length === 0 &&
      missingEvidenceMarkerIds.length === 0 &&
      normalizedEvidenceStatus.ok,
    cueCount: cueTexts.length,
    numberedStepCount: numberedSteps.size,
    cueTextSha256: cueTextHash(cueTexts),
    requiredSteps,
    missingRequiredSteps,
    requiredEvidenceMarkerIds: evidenceMarkers.map(([id]) => id),
    missingEvidenceMarkerIds,
    missingEvidenceFieldIds: normalizedEvidenceStatus.missingFieldIds,
    invalidEvidenceFieldIds: normalizedEvidenceStatus.invalidFieldIds,
    duplicateEvidenceFieldIdPairs:
      normalizedEvidenceStatus.duplicateFieldIdPairs,
  };
};

const destinationAdmissionStatuses = (requirementsReport) =>
  readFirstArray(
    readFirstRecord(requirementsReport, "requirements") ?? {},
    "destinationProofAdmission",
    "destination_proof_admission",
  );

const statusIsPresent = (status) => status?.status === "present";

export const checkPublicPreflightReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  if (!isRecord(preflightReport)) {
    return makeCheck(
      "public-preflight-ready",
      false,
      "No public Solana route preflight report is available.",
      { reportPath: preflightReportPath },
    );
  }
  const schema = readConsistentStringAlias(preflightReport, "schema", [
    "schema",
  ]);
  const routeId = readConsistentStringAlias(preflightReport, "routeId", [
    "routeId",
    "route_id",
  ]);
  const assetKey = readConsistentStringAlias(preflightReport, "assetKey", [
    "assetKey",
    "asset_key",
  ]);
  const manifestSource = readConsistentStringAlias(
    preflightReport,
    "manifestSource",
    ["manifestSource", "manifest_source"],
  );
  const solanaBinding = readFirstRecord(preflightReport, "solana") ?? {};
  const solanaNetwork = readConsistentStringAlias(
    solanaBinding,
    "solana.network",
    ["network", "solanaNetwork", "solana_network"],
  );
  const solanaCaipChainId = readConsistentStringAlias(
    solanaBinding,
    "solana.caipChainId",
    ["caipChainId", "caip_chain_id"],
  );
  const aliasProblems = [
    ...schema.problems,
    ...routeId.problems,
    ...assetKey.problems,
    ...manifestSource.problems,
    ...solanaNetwork.problems,
    ...solanaCaipChainId.problems,
  ];
  if (schema.value !== SOLANA_ROUTE_PREFLIGHT_SCHEMA) {
    aliasProblems.push(`schema must be ${SOLANA_ROUTE_PREFLIGHT_SCHEMA}.`);
  }
  if (assetKey.value !== SCCP_XOR_ASSET_KEY) {
    aliasProblems.push(`assetKey must be ${SCCP_XOR_ASSET_KEY}.`);
  }
  if (solanaNetwork.value !== SOLANA_TESTNET_NETWORK_ID) {
    aliasProblems.push(`solana.network must be ${SOLANA_TESTNET_NETWORK_ID}.`);
  }
  if (solanaCaipChainId.value !== SOLANA_TESTNET_CAIP_CHAIN_ID) {
    aliasProblems.push(
      `solana.caipChainId must be ${SOLANA_TESTNET_CAIP_CHAIN_ID}.`,
    );
  }
  const checks = readFirstArray(preflightReport, "checks");
  const checkIds = new Set(
    checks.map((check) => readFirstString(check, "id")).filter(Boolean),
  );
  const missingRequiredCheckIds =
    SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS.filter(
      (checkId) => !checkIds.has(checkId),
    );
  if (missingRequiredCheckIds.length > 0) {
    aliasProblems.push(
      `public Solana preflight missing required checks: ${missingRequiredCheckIds.join(", ")}.`,
    );
  }
  const failed = failedChecks(checks);
  const ready =
    aliasProblems.length === 0 &&
    preflightReport.ready === true &&
    routeId.value === SCCP_SOLANA_XOR_ROUTE_ID &&
    manifestSource.value === "public" &&
    failed.length === 0;
  return makeCheck(
    "public-preflight-ready",
    ready,
    ready
      ? "Public TAIRA Solana route preflight is ready."
      : "Public TAIRA Solana route preflight is not ready.",
    {
      reportPath: preflightReportPath,
      schema: schema.value || null,
      ready: preflightReport.ready === true,
      routeId: routeId.value || null,
      assetKey: assetKey.value || null,
      manifestSource: manifestSource.value || null,
      solana: {
        network: solanaNetwork.value || null,
        caipChainId: solanaCaipChainId.value || null,
      },
      requiredCheckIds: SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS,
      missingRequiredCheckIds,
      aliasProblems,
      publicSolanaCapability: isRecord(preflightReport.publicSolanaCapability)
        ? preflightReport.publicSolanaCapability
        : null,
      publicSolanaLane: isRecord(preflightReport.publicSolanaLane)
        ? preflightReport.publicSolanaLane
        : null,
      failedChecks: failed.map((check) => ({
        id: check.id,
        detail: check.detail,
      })),
    },
  );
};

const positiveIntegerString = (value) => {
  const normalized = trimString(value);
  return /^[1-9][0-9]*$/u.test(normalized);
};

const immutableProgramdataEvidenceProblems = ({
  evidence,
  expectedRole,
  expectedProgramAddress,
}) => {
  const problems = [];
  if (!isRecord(evidence)) {
    return [`${expectedRole} immutable ProgramData evidence is missing.`];
  }
  const programAddress = trimString(evidence.programAddress);
  const programdataAddress = trimString(evidence.programdataAddress);
  if (evidence.role !== expectedRole) {
    problems.push(`${expectedRole} evidence role is invalid.`);
  }
  if (!programAddress) {
    problems.push(`${expectedRole} program address is missing.`);
  } else if (
    expectedProgramAddress &&
    programAddress !== expectedProgramAddress
  ) {
    problems.push(
      `${expectedRole} program address does not match the published deployment.`,
    );
  }
  if (!programdataAddress) {
    problems.push(`${expectedRole} ProgramData address is missing.`);
  } else if (programdataAddress === programAddress) {
    problems.push(
      `${expectedRole} ProgramData address must differ from its program address.`,
    );
  }
  if (evidence.immutable !== true) {
    problems.push(`${expectedRole} ProgramData is not explicitly immutable.`);
  }
  if (evidence.upgradeAuthority !== null) {
    problems.push(
      `${expectedRole} ProgramData still has an upgrade authority.`,
    );
  }
  if (!positiveIntegerString(evidence.programdataSlot)) {
    problems.push(`${expectedRole} ProgramData slot must be positive.`);
  }
  if (!isHex32(evidence.programCodeHash)) {
    problems.push(`${expectedRole} program code hash is invalid.`);
  }
  if (!isHex32(evidence.programdataMetadataHash)) {
    problems.push(`${expectedRole} ProgramData metadata hash is invalid.`);
  }
  if (
    !Number.isSafeInteger(evidence.executableLength) ||
    evidence.executableLength < 4
  ) {
    problems.push(`${expectedRole} executable length is invalid.`);
  }
  for (const [field, label] of [
    ["programContextSlot", "program account context slot"],
    ["programdataContextSlot", "ProgramData context slot"],
  ]) {
    if (!Number.isSafeInteger(evidence[field]) || evidence[field] <= 0) {
      problems.push(`${expectedRole} ${label} must be positive.`);
    }
  }
  return problems;
};

export const checkPublicBridgeSourceProgramdataReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  const checks = readFirstArray(preflightReport, "checks");
  const evidenceChecks = checks.filter(
    (check) => check?.id === "solana-live-bridge-source-evidence",
  );
  const deployment = readFirstRecord(preflightReport, "deployment") ?? {};
  const evidenceCheck = evidenceChecks[0];
  const evidence = isRecord(evidenceCheck?.evidence)
    ? evidenceCheck.evidence
    : {};
  const bridge = isRecord(evidence.bridge) ? evidence.bridge : null;
  const sourceBridge = isRecord(evidence.sourceBridge)
    ? evidence.sourceBridge
    : null;
  const expectedBridgeAddress = trimString(deployment.bridgeProgramAddress);
  const expectedSourceBridgeAddress = trimString(
    deployment.sourceBridgeProgramAddress,
  );
  const problems = [];
  if (!isRecord(preflightReport)) {
    problems.push("Public Solana route preflight report is missing.");
  }
  if (evidenceChecks.length !== 1) {
    problems.push(
      evidenceChecks.length === 0
        ? "Immutable bridge/source-bridge ProgramData evidence is missing."
        : "Immutable bridge/source-bridge ProgramData evidence is ambiguous.",
    );
  }
  if (evidenceCheck?.status !== "pass") {
    problems.push(
      "Immutable bridge/source-bridge ProgramData preflight did not pass.",
    );
  }
  if (!expectedBridgeAddress) {
    problems.push("Published deployment bridge program address is missing.");
  }
  if (!expectedSourceBridgeAddress) {
    problems.push(
      "Published deployment source-bridge program address is missing.",
    );
  }
  problems.push(
    ...immutableProgramdataEvidenceProblems({
      evidence: bridge,
      expectedRole: "bridge",
      expectedProgramAddress: expectedBridgeAddress,
    }),
    ...immutableProgramdataEvidenceProblems({
      evidence: sourceBridge,
      expectedRole: "sourceBridge",
      expectedProgramAddress: expectedSourceBridgeAddress,
    }),
  );
  if (
    bridge &&
    sourceBridge &&
    trimString(bridge.programAddress) ===
      trimString(sourceBridge.programAddress)
  ) {
    problems.push("Bridge and source-bridge program addresses must differ.");
  }
  if (
    bridge &&
    sourceBridge &&
    trimString(bridge.programdataAddress) ===
      trimString(sourceBridge.programdataAddress)
  ) {
    problems.push(
      "Bridge and source-bridge ProgramData addresses must differ.",
    );
  }
  const ready = problems.length === 0;
  return makeCheck(
    "public-bridge-source-programdata-immutable",
    ready,
    ready
      ? "Public Solana bridge and source-bridge programs have immutable finalized ProgramData evidence."
      : "Public Solana bridge/source-bridge immutable ProgramData evidence is missing, mutable, or inconsistent.",
    {
      reportPath: preflightReportPath,
      problems,
      bridge,
      sourceBridge,
    },
  );
};

export const checkPublicVerifierProgramdataReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  const evidenceChecks = readFirstArray(preflightReport, "checks").filter(
    (check) => check?.id === "solana-live-programdata-evidence",
  );
  const deployment = readFirstRecord(preflightReport, "deployment") ?? {};
  const evidenceCheck = evidenceChecks[0];
  const evidence = isRecord(evidenceCheck?.evidence)
    ? evidenceCheck.evidence
    : {};
  const verifier = isRecord(evidence.verifier) ? evidence.verifier : null;
  const nativeVerifier = isRecord(evidence.nativeVerifier)
    ? evidence.nativeVerifier
    : null;
  const expectedVerifierAddress = trimString(deployment.verifierProgramAddress);
  const expectedNativeVerifierAddress = trimString(
    deployment.nativeVerifierProgramAddress,
  );
  const problems = [];
  if (!isRecord(preflightReport)) {
    problems.push("Public Solana route preflight report is missing.");
  }
  if (evidenceChecks.length !== 1) {
    problems.push(
      evidenceChecks.length === 0
        ? "Immutable verifier/native-verifier ProgramData evidence is missing."
        : "Immutable verifier/native-verifier ProgramData evidence is ambiguous.",
    );
  }
  if (evidenceCheck?.status !== "pass") {
    problems.push(
      "Immutable verifier/native-verifier ProgramData preflight did not pass.",
    );
  }
  if (!expectedVerifierAddress) {
    problems.push("Published deployment verifier program address is missing.");
  }
  if (!expectedNativeVerifierAddress) {
    problems.push(
      "Published deployment native-verifier program address is missing.",
    );
  }
  problems.push(
    ...immutableProgramdataEvidenceProblems({
      evidence: verifier,
      expectedRole: "verifier",
      expectedProgramAddress: expectedVerifierAddress,
    }),
    ...immutableProgramdataEvidenceProblems({
      evidence: nativeVerifier,
      expectedRole: "nativeVerifier",
      expectedProgramAddress: expectedNativeVerifierAddress,
    }),
  );
  if (
    verifier &&
    nativeVerifier &&
    trimString(verifier.programAddress) ===
      trimString(nativeVerifier.programAddress)
  ) {
    problems.push(
      "Verifier and native-verifier program addresses must differ.",
    );
  }
  if (
    verifier &&
    nativeVerifier &&
    trimString(verifier.programdataAddress) ===
      trimString(nativeVerifier.programdataAddress)
  ) {
    problems.push(
      "Verifier and native-verifier ProgramData addresses must differ.",
    );
  }
  const ready = problems.length === 0;
  return makeCheck(
    "public-verifier-programdata-immutable",
    ready,
    ready
      ? "Public Solana verifier and native-verifier programs have immutable finalized ProgramData evidence."
      : "Public Solana verifier/native-verifier immutable ProgramData evidence is missing, mutable, or inconsistent.",
    {
      reportPath: preflightReportPath,
      problems,
      verifier,
      nativeVerifier,
    },
  );
};

export const checkGovernanceProgramRolePinsFresh = ({
  preflightReport,
  preflightReportPath = null,
  productionMaterialInventoryReport,
  productionMaterialInventoryPath = null,
} = {}) => {
  const rolePins = readFirstRecord(
    productionMaterialInventoryReport,
    "governanceProgramRolePins",
    "governance_program_role_pins",
  );
  const governanceApproval = readFirstRecord(
    productionMaterialInventoryReport,
    "governanceApproval",
    "governance_approval",
  );
  const checks = readFirstArray(preflightReport, "checks");
  const verifierChecks = checks.filter(
    (check) => check?.id === "solana-live-programdata-evidence",
  );
  const bridgeChecks = checks.filter(
    (check) => check?.id === "solana-live-bridge-source-evidence",
  );
  const verifierEvidence = isRecord(verifierChecks[0]?.evidence)
    ? verifierChecks[0].evidence
    : {};
  const bridgeEvidence = isRecord(bridgeChecks[0]?.evidence)
    ? bridgeChecks[0].evidence
    : {};
  const liveRoles = {
    outerVerifier: verifierEvidence.verifier,
    nativeVerifier: verifierEvidence.nativeVerifier,
    destinationBridge: bridgeEvidence.bridge,
    sourceBridge: bridgeEvidence.sourceBridge,
  };
  const problems = [];
  if (
    rolePins?.schema !==
      "iroha-demo-sccp-solana-governance-program-role-pins/v1" ||
    rolePins?.ready !== true ||
    rolePins?.independentApprovalReady !== true ||
    !Array.isArray(rolePins?.statuses) ||
    rolePins.statuses.length === 0 ||
    rolePins.statuses.some((status) => status?.status !== "present")
  ) {
    problems.push(
      "Production inventory lacks complete independently approved program-role pins.",
    );
  }
  if (
    !isHex32(rolePins?.approvalSha256) ||
    rolePins?.approvalSha256 !== rolePins?.expectedApprovalSha256 ||
    rolePins?.approvalSha256 !== governanceApproval?.approvalSha256 ||
    rolePins?.expectedApprovalSha256 !==
      governanceApproval?.expectedApprovalSha256
  ) {
    problems.push(
      "Program-role pins are not bound to the inventory's independently expected governance approval bytes.",
    );
  }
  if (verifierChecks.length !== 1 || verifierChecks[0]?.status !== "pass") {
    problems.push(
      "Fresh outer/native verifier ProgramData evidence is missing or ambiguous.",
    );
  }
  if (bridgeChecks.length !== 1 || bridgeChecks[0]?.status !== "pass") {
    problems.push(
      "Fresh destination/source bridge ProgramData evidence is missing or ambiguous.",
    );
  }
  for (const [role, live] of Object.entries(liveRoles)) {
    const pinned = rolePins?.roles?.[role];
    const approved = pinned?.approved;
    const selected = pinned?.selected;
    if (!isRecord(approved) || !isRecord(selected) || !isRecord(live)) {
      problems.push(`${role} approved, selected, or live pins are missing.`);
      continue;
    }
    for (const field of [
      "programId",
      "programdataAddress",
      "programdataSlot",
      "artifactSha256",
      "codeHash",
    ]) {
      if (!approved[field] || selected[field] !== approved[field]) {
        problems.push(
          `${role} selected ${field} does not match its independent governance pin.`,
        );
      }
    }
    for (const [field, liveField] of [
      ["programId", "programAddress"],
      ["programdataAddress", "programdataAddress"],
      ["programdataSlot", "programdataSlot"],
    ]) {
      if (trimString(live[liveField]) !== trimString(approved[field])) {
        problems.push(
          `${role} fresh ${field} does not match its independent governance pin.`,
        );
      }
    }
    if (
      normalizedLiveHexIdentity(live.programCodeHash) !==
      normalizedLiveHexIdentity(approved.codeHash)
    ) {
      problems.push(
        `${role} fresh code hash does not match its independent governance pin.`,
      );
    }
    if (live.immutable !== true || live.upgradeAuthority !== null) {
      problems.push(`${role} fresh ProgramData is not immutable.`);
    }
  }
  for (const field of ["programAddress", "programdataAddress"]) {
    const values = Object.values(liveRoles)
      .map((live) => trimString(live?.[field]))
      .filter(Boolean);
    if (values.length !== 4 || new Set(values).size !== 4) {
      problems.push(
        `Fresh ${field} evidence must remain distinct across all four Solana program roles.`,
      );
    }
  }
  const ready = problems.length === 0;
  return makeCheck(
    "governance-program-role-pins-fresh",
    ready,
    ready
      ? "Fresh canonical Solana RPC readback matches every independently approved program-role pin."
      : "Fresh Solana program-role evidence is missing, stale, substituted, or not independently approved.",
    {
      preflightReportPath,
      productionMaterialInventoryPath,
      approvalSha256: rolePins?.approvalSha256 ?? null,
      roles: rolePins?.roles ?? null,
      liveRoles,
      problems,
    },
  );
};

export const checkPublicSolanaLaneReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  if (!isRecord(preflightReport)) {
    return makeCheck(
      "public-solana-lane-ready",
      false,
      "No public Solana lane publication evidence is available.",
      { reportPath: preflightReportPath },
    );
  }
  const lane = isRecord(preflightReport.publicSolanaLane)
    ? preflightReport.publicSolanaLane
    : null;
  const laneCheck = readFirstArray(preflightReport, "checks").find(
    (check) => check?.id === "solana-lane-publication",
  );
  const laneCheckEvidence = isRecord(laneCheck?.evidence)
    ? laneCheck.evidence
    : {};
  const laneChain = readConsistentStringAlias(lane, "publicSolanaLane.chain", [
    "chain",
    "solanaNetwork",
    "solana_network",
  ]);
  const laneCounterpartyDomain = readConsistentNumberAlias(
    lane,
    "publicSolanaLane.counterpartyDomain",
    ["counterpartyDomain", "counterparty_domain"],
  );
  const laneProductionReady = readConsistentBooleanAlias(
    lane,
    "publicSolanaLane.productionReady",
    ["productionReady", "production_ready"],
  );
  const laneDisabledReason = readConsistentStringAlias(
    lane,
    "publicSolanaLane.disabledReason",
    ["disabledReason", "disabled_reason"],
  );
  const evidenceChain = readConsistentStringAlias(
    laneCheckEvidence,
    "solana-lane-publication.chain",
    ["chain", "solanaNetwork", "solana_network"],
  );
  const evidenceCounterpartyDomain = readConsistentNumberAlias(
    laneCheckEvidence,
    "solana-lane-publication.counterpartyDomain",
    ["counterpartyDomain", "counterparty_domain"],
  );
  const evidenceProductionReady = readConsistentBooleanAlias(
    laneCheckEvidence,
    "solana-lane-publication.productionReady",
    ["productionReady", "production_ready"],
  );
  const evidenceDisabledReason = readConsistentStringAlias(
    laneCheckEvidence,
    "solana-lane-publication.disabledReason",
    ["disabledReason", "disabled_reason"],
  );
  const aliasProblems = [
    ...laneChain.problems,
    ...laneCounterpartyDomain.problems,
    ...laneProductionReady.problems,
    ...laneDisabledReason.problems,
    ...evidenceChain.problems,
    ...evidenceCounterpartyDomain.problems,
    ...evidenceProductionReady.problems,
    ...evidenceDisabledReason.problems,
  ];
  pushCrossSourceValueProblem({
    problems: aliasProblems,
    leftLabel: "publicSolanaLane.chain",
    leftValue: laneChain.value,
    rightLabel: "solana-lane-publication.chain",
    rightValue: evidenceChain.value,
  });
  pushCrossSourceValueProblem({
    problems: aliasProblems,
    leftLabel: "publicSolanaLane.counterpartyDomain",
    leftValue: laneCounterpartyDomain.value,
    rightLabel: "solana-lane-publication.counterpartyDomain",
    rightValue: evidenceCounterpartyDomain.value,
  });
  pushCrossSourceValueProblem({
    problems: aliasProblems,
    leftLabel: "publicSolanaLane.productionReady",
    leftValue: laneProductionReady.value,
    rightLabel: "solana-lane-publication.productionReady",
    rightValue: evidenceProductionReady.value,
  });
  pushCrossSourceValueProblem({
    problems: aliasProblems,
    leftLabel: "publicSolanaLane.disabledReason",
    leftValue: laneDisabledReason.value,
    rightLabel: "solana-lane-publication.disabledReason",
    rightValue: evidenceDisabledReason.value,
  });
  const chainValue = laneChain.value || evidenceChain.value;
  if (!chainValue) {
    aliasProblems.push("publicSolanaLane.chain must identify Solana testnet.");
  } else {
    for (const [label, value] of [
      ["publicSolanaLane.chain", laneChain.value],
      ["solana-lane-publication.chain", evidenceChain.value],
    ]) {
      if (value && !isExpectedSolanaLaneChain(value)) {
        aliasProblems.push(`${label} must identify the Solana testnet lane.`);
      }
    }
  }
  const domainValue =
    laneCounterpartyDomain.value ?? evidenceCounterpartyDomain.value;
  if (domainValue === null) {
    aliasProblems.push(
      `publicSolanaLane.counterpartyDomain must be Solana domain ${SCCP_SOLANA_DOMAIN}.`,
    );
  } else {
    for (const [label, value] of [
      ["publicSolanaLane.counterpartyDomain", laneCounterpartyDomain.value],
      [
        "solana-lane-publication.counterpartyDomain",
        evidenceCounterpartyDomain.value,
      ],
    ]) {
      if (value !== null && value !== SCCP_SOLANA_DOMAIN) {
        aliasProblems.push(
          `${label} must be Solana domain ${SCCP_SOLANA_DOMAIN}.`,
        );
      }
    }
  }
  const laneBlockersFrom = (...keys) =>
    keys.flatMap((key) =>
      readFirstArray(
        readFirstRecord(lane, key, key.replace(/[A-Z]/gu, "_$&").toLowerCase()),
        "blockers",
        "blockerIds",
        "blocker_ids",
      ),
    );
  const blockerIds = [
    ...readFirstArray(laneCheckEvidence, "blockerIds", "blocker_ids"),
    ...(readFirstArray(laneCheckEvidence, "blockerIds", "blocker_ids").length >
    0
      ? []
      : [
          ...laneBlockersFrom("destinationRollout"),
          ...laneBlockersFrom("productionReadiness"),
          ...laneBlockersFrom("sourceAdapterEngine"),
          ...laneBlockersFrom("routeAllowlist"),
        ]),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const ready =
    lane !== null &&
    aliasProblems.length === 0 &&
    laneProductionReady.value === true &&
    laneCheck?.status === "pass" &&
    blockerIds.length === 0;
  return makeCheck(
    "public-solana-lane-ready",
    ready,
    ready
      ? "Public TAIRA Solana SCCP lane is production-ready."
      : "Public TAIRA Solana SCCP lane is missing or not production-ready.",
    {
      reportPath: preflightReportPath,
      present: lane !== null,
      chain: laneChain.value || evidenceChain.value || null,
      counterpartyDomain:
        laneCounterpartyDomain.value ?? evidenceCounterpartyDomain.value,
      productionReady:
        laneProductionReady.value === true ||
        evidenceProductionReady.value === true,
      disabledReason:
        laneDisabledReason.value || evidenceDisabledReason.value || null,
      laneCheck: laneCheck
        ? {
            status: laneCheck.status ?? null,
            detail: laneCheck.detail ?? null,
          }
        : null,
      aliasProblems,
      blockerIds,
    },
  );
};

const summarizePublicSolanaRoutePublication = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  if (!isRecord(preflightReport)) {
    return {
      ready: false,
      reportPath: preflightReportPath,
      manifestSource: null,
      routeId: null,
      assetKey: null,
      publicationChecks: [],
      blockerIds: ["public-preflight-missing"],
    };
  }
  const checks = readFirstArray(preflightReport, "checks");
  const byId = new Map(checks.map((check) => [check?.id, check]));
  const requiredCheckIds = [
    "public-route-publication",
    "solana-lane-publication",
    "route-manifest-shape",
    "production-ready-flag",
  ];
  const publicationChecks = requiredCheckIds.map((id) => {
    const check = byId.get(id) ?? null;
    return {
      id,
      status: check?.status ?? "missing",
      detail: check?.detail ?? null,
    };
  });
  return {
    ready: publicationChecks.every((check) => check.status === "pass"),
    reportPath: preflightReportPath,
    manifestSource: readFirstString(preflightReport, "manifestSource") || null,
    routeId: readFirstString(preflightReport, "routeId", "route_id") || null,
    assetKey: readFirstString(preflightReport, "assetKey", "asset_key") || null,
    publicationChecks,
    blockerIds: publicationChecks
      .filter((check) => check.status !== "pass")
      .map((check) => check.id),
  };
};

export const checkProductionRequirementsReady = ({
  requirementsReport,
  requirementsPath = null,
} = {}) => {
  if (!isRecord(requirementsReport)) {
    return makeCheck(
      "production-requirements-ready",
      false,
      "No Solana production requirements report is available.",
      { requirementsPath },
    );
  }
  const blockers = readFirstArray(requirementsReport, "blockers");
  const solanaDeployment =
    readFirstRecord(
      requirementsReport,
      "solanaDeployment",
      "solana_deployment",
    ) ?? {};
  const observedPostDeployEvidence =
    readFirstRecord(
      solanaDeployment,
      "observedPostDeployEvidence",
      "observed_post_deploy_evidence",
    ) ??
    readFirstRecord(
      requirementsReport,
      "observedPostDeployEvidence",
      "observed_post_deploy_evidence",
    );
  const ready =
    requirementsReport.readyToBuildIsi === true && blockers.length === 0;
  return makeCheck(
    "production-requirements-ready",
    ready,
    ready
      ? "Production Solana route material is ready to build the TAIRA manifest ISI."
      : "Production Solana route material is incomplete.",
    {
      requirementsPath,
      readyToBuildIsi: requirementsReport.readyToBuildIsi === true,
      readyToSubmitWithCurrentRuntime:
        requirementsReport.readyToSubmitWithCurrentRuntime === true,
      observedPostDeployEvidence: isRecord(observedPostDeployEvidence)
        ? {
            path: observedPostDeployEvidence.path ?? null,
            liveReadbackReady:
              observedPostDeployEvidence.liveReadbackReady === true,
            readyForProductionPostDeploy:
              observedPostDeployEvidence.readyForProductionPostDeploy === true,
            liveReadbackBlockers: readFirstArray(
              observedPostDeployEvidence,
              "liveReadbackBlockers",
              "live_readback_blockers",
            ),
            productionBlockers: readFirstArray(
              observedPostDeployEvidence,
              "productionBlockers",
              "production_blockers",
            ),
            observedSourceBridgeConfigHash:
              observedPostDeployEvidence.observedSourceBridgeConfigHash ??
              observedPostDeployEvidence.observed_source_bridge_config_hash ??
              null,
            observedSourceStateTotalBurned:
              observedPostDeployEvidence.observedSourceStateTotalBurned ??
              observedPostDeployEvidence.observed_source_state_total_burned ??
              null,
            observedSourceStateLastBurnHash:
              observedPostDeployEvidence.observedSourceStateLastBurnHash ??
              observedPostDeployEvidence.observed_source_state_last_burn_hash ??
              null,
          }
        : null,
      blockers,
    },
  );
};

export const checkDestinationProofAdmissionReady = ({
  requirementsReport,
  requirementsPath = null,
} = {}) => {
  const statuses = destinationAdmissionStatuses(requirementsReport);
  if (statuses.length === 0) {
    return makeCheck(
      "destination-proof-admission",
      false,
      "Solana destination proof admission requirements are missing.",
      { requirementsPath },
    );
  }
  const missingOrInvalid = statuses.filter(
    (status) => !statusIsPresent(status),
  );
  return makeCheck(
    "destination-proof-admission",
    missingOrInvalid.length === 0,
    missingOrInvalid.length === 0
      ? "Solana destination proof admission is governed and production-safe."
      : "Solana destination proof admission is not production-safe.",
    {
      requirementsPath,
      missingOrInvalid: missingOrInvalid.map((status) => ({
        key: status.key,
        status: status.status ?? null,
        value: status.value ?? null,
      })),
    },
  );
};

const postDeployEvidenceConsistencySnapshot = (report, reportPath = null) => ({
  path: reportPath
    ? normalizePath(reportPath)
    : readFirstString(report, "path") || null,
  liveReadbackReady: report?.liveReadbackReady === true,
  readyForProductionPostDeploy: report?.readyForProductionPostDeploy === true,
  liveReadbackBlockers: blockerIdSnapshot(
    readFirstArray(report, "liveReadbackBlockers", "live_readback_blockers"),
  ),
  productionBlockers: blockerIdSnapshot(
    readFirstArray(
      report,
      "blockers",
      "productionBlockers",
      "production_blockers",
    ),
  ),
  observedSourceBridgeConfigHash:
    readFirstString(
      report,
      "observedSourceBridgeConfigHash",
      "observed_source_bridge_config_hash",
    ) || null,
  observedSourceStateTotalBurned:
    readFirstString(
      report,
      "observedSourceStateTotalBurned",
      "observed_source_state_total_burned",
    ) ||
    readFirstString(
      readFirstRecord(report, "observedSourceState", "observed_source_state"),
      "totalBurned",
      "total_burned",
    ) ||
    null,
  observedSourceStateLastBurnHash:
    readFirstString(
      report,
      "observedSourceStateLastBurnHash",
      "observed_source_state_last_burn_hash",
    ) ||
    readFirstString(
      readFirstRecord(report, "observedSourceState", "observed_source_state"),
      "lastBurnHash",
      "last_burn_hash",
    ) ||
    null,
});

const proverReadinessEntrySnapshot = (entry) => ({
  direction: readFirstString(entry, "direction"),
  ready: entry?.ready === true,
  moduleHashMatchesManifest: entry?.moduleHashMatchesManifest === true,
  exportsOk: entry?.exportsOk === true,
  reason: readFirstString(entry, "reason", "error") || null,
});

const proverReadinessConsistencySnapshot = (report, reportPath = null) => ({
  path: reportPath
    ? normalizePath(reportPath)
    : readFirstString(report, "path") || null,
  readyForProductionProofs: report?.readyForProductionProofs === true,
  entries: readFirstArray(report, "entries")
    .map((entry) => proverReadinessEntrySnapshot(entry))
    .sort((left, right) => left.direction.localeCompare(right.direction)),
  blockers: blockerIdSnapshot(readFirstArray(report, "blockers")),
});

const productionMaterialInventoryConsistencySnapshot = (
  report,
  reportPath = null,
) => ({
  path: reportPath
    ? normalizePath(reportPath)
    : readFirstString(report, "path") || null,
  ready: report?.ready === true,
  readyMaterial: stableJsonValue(
    stripVolatileReviewFields(
      readFirstRecord(report, "readyMaterial", "ready_material"),
    ),
  ),
  missingProductionArtifactIds: blockerIdSnapshot(
    readFirstArray(
      report,
      "missingProductionArtifactIds",
      "missing_production_artifact_ids",
    ),
  ),
  roots: readFirstArray(report, "roots")
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map(normalizePath)
    .sort(),
  materialRoots: readFirstArray(
    readFirstRecord(report, "materialRoots", "material_roots"),
    "expectedGroups",
    "expected_groups",
  )
    .map((group) => ({
      id: readFirstString(group, "id") || null,
      required: group?.required === true,
      ready: group?.ready === true,
      paths: readFirstArray(group, "paths")
        .map((entry) => ({
          path: readFirstString(entry, "path")
            ? normalizePath(readFirstString(entry, "path"))
            : null,
          exists: entry?.exists === true,
          status: readFirstString(entry, "status") || null,
          skippedReason:
            readFirstString(entry, "skippedReason", "skipped_reason") || null,
        }))
        .sort((left, right) =>
          String(left.path ?? "").localeCompare(String(right.path ?? "")),
        ),
    }))
    .sort((left, right) =>
      String(left.id ?? "").localeCompare(String(right.id ?? "")),
    ),
  blockers: blockerIdSnapshot(readFirstArray(report, "blockers")),
});

export const checkProductionRequirementsArtifactConsistency = ({
  requirementsReport,
  requirementsPath = null,
  postDeployEvidenceReport = null,
  postDeployEvidencePath = null,
  proverReadinessReport = null,
  proverReadinessPath = null,
  productionMaterialInventoryReport = null,
  productionMaterialInventoryPath = null,
} = {}) => {
  if (!isRecord(requirementsReport)) {
    return makeCheck(
      "production-requirements-artifact-consistency",
      false,
      "No Solana production requirements report is available for artifact consistency checks.",
      { requirementsPath },
    );
  }
  const solanaDeployment = readFirstRecord(
    requirementsReport,
    "solanaDeployment",
    "solana_deployment",
  );
  const mismatches = [];
  const compareSnapshotValue = ({
    id,
    field,
    expected,
    observed,
    sourcePath,
    detail,
  }) => {
    const expectedJson = JSON.stringify(stableJsonValue(expected ?? null));
    const observedJson = JSON.stringify(stableJsonValue(observed ?? null));
    if (expectedJson !== observedJson) {
      mismatches.push({
        id,
        field,
        expected: expectedJson,
        observed: observedJson,
        sourcePath,
        detail,
      });
    }
  };
  if (isRecord(postDeployEvidenceReport)) {
    compareSnapshotValue({
      id: "post-deploy-evidence",
      field: "snapshot",
      expected: postDeployEvidenceConsistencySnapshot(
        postDeployEvidenceReport,
        postDeployEvidencePath,
      ),
      observed: postDeployEvidenceConsistencySnapshot(
        readFirstRecord(
          solanaDeployment,
          "observedPostDeployEvidence",
          "observed_post_deploy_evidence",
        ),
      ),
      sourcePath: postDeployEvidencePath,
      detail:
        "Production requirements post-deploy evidence summary does not match the direct post-deploy report.",
    });
  }
  if (isRecord(proverReadinessReport)) {
    compareSnapshotValue({
      id: "prover-readiness",
      field: "snapshot",
      expected: proverReadinessConsistencySnapshot(
        proverReadinessReport,
        proverReadinessPath,
      ),
      observed: proverReadinessConsistencySnapshot(
        readFirstRecord(
          solanaDeployment,
          "observedProverReadiness",
          "observed_prover_readiness",
        ),
      ),
      sourcePath: proverReadinessPath,
      detail:
        "Production requirements prover-readiness summary does not match the direct prover-readiness report.",
    });
  }
  if (isRecord(productionMaterialInventoryReport)) {
    compareSnapshotValue({
      id: "production-material-inventory",
      field: "snapshot",
      expected: productionMaterialInventoryConsistencySnapshot(
        productionMaterialInventoryReport,
        productionMaterialInventoryPath,
      ),
      observed: productionMaterialInventoryConsistencySnapshot(
        readFirstRecord(
          solanaDeployment,
          "observedProductionMaterialInventory",
          "observed_production_material_inventory",
        ),
      ),
      sourcePath: productionMaterialInventoryPath,
      detail:
        "Production requirements material-inventory summary does not match the direct inventory report.",
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "production-requirements-artifact-consistency",
    ok,
    ok
      ? "Solana production requirements summarize the current post-deploy, prover, and inventory artifacts."
      : "Solana production requirements summarize stale post-deploy, prover, or inventory artifacts.",
    {
      requirementsPath,
      comparedArtifacts: {
        postDeployEvidencePath,
        proverReadinessPath,
        productionMaterialInventoryPath,
      },
      mismatches,
    },
  );
};

export const checkDeploymentVideoPresent = ({
  deploymentVideoTranscript,
  deploymentVideoTranscriptPath = null,
  deploymentVideoMp4Path = DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  deploymentVideoVttPath = DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  artifactFacts = {},
} = {}) => {
  if (!isRecord(deploymentVideoTranscript)) {
    return makeCheck(
      "deployment-video-present",
      false,
      "No Solana deployment video transcript is available.",
      { transcriptPath: deploymentVideoTranscriptPath },
    );
  }
  const paths = videoArtifactPaths({
    transcript: deploymentVideoTranscript,
    fallbackMp4Path: deploymentVideoMp4Path,
    fallbackVttPath: deploymentVideoVttPath,
  });
  const schemaOk =
    deploymentVideoTranscript.schema ===
    "iroha-demo-sccp-solana-deployment-video/v1";
  const routeOk =
    readFirstString(deploymentVideoTranscript, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const deployment = readFirstRecord(deploymentVideoTranscript, "deployment");
  const activationPackage = readFirstRecord(deployment, "activationPackage");
  const activationPackageHash = readFirstString(
    activationPackage,
    "activationPackageHash",
    "activation_package_hash",
  );
  const activationSmokeReadiness = readFirstRecord(
    activationPackage,
    "smokeReadiness",
    "smoke_readiness",
  );
  const activationEvidenceOk =
    /^0x[0-9a-f]{64}$/u.test(activationPackageHash) &&
    activationSmokeReadiness?.present === true &&
    typeof activationSmokeReadiness.ready === "boolean" &&
    Array.isArray(activationSmokeReadiness.failedCheckIds) &&
    Array.isArray(activationSmokeReadiness.nextActionIds);
  const mp4Ok = mp4StreamEvidenceReady(artifactFacts, paths.mp4);
  const mediaVerification = readFirstRecord(
    deploymentVideoTranscript,
    "mediaVerification",
    "media_verification",
  );
  const mediaVerificationOk = mediaVerification?.ready === true;
  const subtitleExplanation = deploymentVideoSubtitleExplanation(
    deploymentVideoTranscript,
  );
  const vttFact = artifactFact(artifactFacts, paths.vtt);
  const vttCueTextMatchesTranscript =
    vttFact.vtt?.cueCount === subtitleExplanation.cueCount &&
    vttFact.vtt?.cueTextSha256 === subtitleExplanation.cueTextSha256;
  const mp4Fact = artifactFact(artifactFacts, paths.mp4);
  const embeddedSubtitleMatchesVtt =
    mp4Fact.media?.embeddedSubtitle?.extracted === true &&
    mp4Fact.media.embeddedSubtitle.cueCount === vttFact.vtt?.cueCount &&
    mp4Fact.media.embeddedSubtitle.cueTextSha256 === vttFact.vtt?.cueTextSha256;
  const vttOk =
    vttEvidenceReady(artifactFacts, paths.vtt) && vttCueTextMatchesTranscript;
  const ok =
    schemaOk &&
    routeOk &&
    activationEvidenceOk &&
    mp4Ok &&
    mediaVerificationOk &&
    vttOk &&
    embeddedSubtitleMatchesVtt &&
    subtitleExplanation.ok;
  return makeCheck(
    "deployment-video-present",
    ok,
    ok
      ? "Solana deployment MP4 has video plus embedded explanatory subtitles, and the VTT artifact is present."
      : "Solana deployment MP4 or subtitle artifacts are missing, generic, or do not prove embedded explanatory subtitles.",
    {
      transcriptPath: deploymentVideoTranscriptPath,
      schemaOk,
      routeOk,
      activationPackage: {
        present: isRecord(activationPackage),
        activationPackageHash: activationPackageHash || null,
        smokeReadiness: activationSmokeReadiness ?? null,
        activationEvidenceOk,
      },
      mp4: mp4Fact,
      mediaVerification: mediaVerification ?? null,
      mediaVerificationOk,
      vtt: vttFact,
      vttCueTextMatchesTranscript,
      embeddedSubtitleMatchesVtt,
      subtitleExplanation,
    },
  );
};

const deploymentVideoActivationPackageSnapshot = (
  activationPackage,
  { embedded = false } = {},
) => {
  const artifacts = readFirstRecord(activationPackage, "artifacts");
  const smokeReadiness = embedded
    ? readFirstRecord(activationPackage, "smokeReadiness", "smoke_readiness")
    : readFirstRecord(artifacts, "smokeReadiness", "smoke_readiness");
  return {
    readyForActivationReview:
      activationPackage?.readyForActivationReview === true,
    productionActivationReady:
      activationPackage?.productionActivationReady === true,
    readyToSubmitWithCurrentRuntime:
      activationPackage?.readyToSubmitWithCurrentRuntime === true,
    publicRouteAlreadyPublished:
      activationPackage?.publicRouteAlreadyPublished === true,
    activationPackageHash:
      readFirstString(
        activationPackage,
        "activationPackageHash",
        "activation_package_hash",
      ) || null,
    laneActivationRequestHash: embedded
      ? readFirstString(
          activationPackage,
          "laneActivationRequestHash",
          "lane_activation_request_hash",
        ) || null
      : artifactStableHash(
          artifacts,
          "laneActivationRequest",
          "lane_activation_request",
        ) || null,
    blockerIds: embedded
      ? blockerIdSnapshot(
          readFirstArray(activationPackage, "blockerIds", "blocker_ids"),
        )
      : reportBlockerIds(activationPackage),
    nextActionIds: sortedStringIds(
      readFirstArray(activationPackage, "nextActions", "next_actions").map(
        (action) =>
          typeof action === "string" ? action : readFirstString(action, "id"),
      ),
    ),
    smokeReadiness: embeddedSmokeReadinessSnapshot(smokeReadiness),
  };
};

const sourceMaterialObservedPinsSnapshot = (pins = {}) => ({
  verifierProgramId: readFirstString(pins, "verifierProgramId"),
  verifierCodeHash: readFirstString(pins, "verifierCodeHash"),
  programdataAddress: readFirstString(pins, "programdataAddress"),
  programdataSlot: readFirstStringLike(pins, "programdataSlot"),
  destinationBindingHash: readFirstString(pins, "destinationBindingHash"),
  tokenMintAddress: readFirstString(pins, "tokenMintAddress"),
  bridgeProgramId: readFirstString(pins, "bridgeProgramId"),
  sourceBridgeProgramId: readFirstString(pins, "sourceBridgeProgramId"),
  verifierStateAddress: readFirstString(pins, "verifierStateAddress"),
  sourceStateAddress: readFirstString(pins, "sourceStateAddress"),
  sourceBridgeConfigHash: readFirstString(pins, "sourceBridgeConfigHash"),
  routeCanaryEvidenceHash: readFirstString(pins, "routeCanaryEvidenceHash"),
  routeCanarySignature: readFirstString(pins, "routeCanarySignature"),
  sourceBurnSignature: readFirstString(pins, "sourceBurnSignature"),
  sourceBurnHash: readFirstString(pins, "sourceBurnHash"),
  sourceBurnAmountBaseUnits: readFirstString(pins, "sourceBurnAmountBaseUnits"),
  sourceBurnTairaRecipient: readFirstString(pins, "sourceBurnTairaRecipient"),
  sourceBurnProofRequestReady: pins?.sourceBurnProofRequestReady === true,
  sourceBurnCanonicalTransferReady:
    pins?.sourceBurnCanonicalTransferReady === true,
  sourceBurnMessageId: readFirstString(pins, "sourceBurnMessageId"),
  sourceBurnCommitmentRoot: readFirstString(pins, "sourceBurnCommitmentRoot"),
  sourceBurnPayloadHash: readFirstString(pins, "sourceBurnPayloadHash"),
});

const deploymentVideoSourceMaterialSnapshot = (sourceMaterialHandoff) => ({
  readyForProofMaterialCeremony:
    sourceMaterialHandoff?.readyForProofMaterialCeremony === true,
  productionProofMaterialIncluded:
    sourceMaterialHandoff?.productionProofMaterialIncluded === true,
  observedPins: sourceMaterialObservedPinsSnapshot(
    readFirstRecord(sourceMaterialHandoff, "observedPins", "observed_pins"),
  ),
  blockerIds: reportBlockerIds(sourceMaterialHandoff),
});

const deploymentVideoDeploymentPinSnapshot = (deployment) => {
  const routeCanary = readFirstRecord(
    deployment,
    "routeCanary",
    "route_canary",
  );
  const sourceBurnSubmission = readFirstRecord(
    deployment,
    "sourceBurnSubmission",
    "source_burn_submission",
  );
  return {
    verifierProgramId: readFirstString(deployment, "verifierProgramId"),
    verifierCodeHash: readFirstString(deployment, "verifierCodeHash"),
    programdataAddress: readFirstString(
      deployment,
      "verifierProgramdataAddress",
      "programdataAddress",
    ),
    programdataSlot: readFirstStringLike(
      deployment,
      "verifierProgramdataSlot",
      "programdataSlot",
    ),
    tokenMintAddress: readFirstString(deployment, "tokenMintAddress"),
    bridgeProgramId: readFirstString(deployment, "bridgeProgramId"),
    sourceBridgeProgramId: readFirstString(deployment, "sourceBridgeProgramId"),
    verifierStateAddress: readFirstString(deployment, "verifierStateAddress"),
    sourceStateAddress: readFirstString(deployment, "sourceStateAddress"),
    routeCanaryEvidenceHash: readFirstString(
      routeCanary,
      "canaryEvidenceHash",
      "routeCanaryEvidenceHash",
    ),
    routeCanarySignature: readFirstString(routeCanary, "signature"),
    sourceBurnSignature: readFirstString(sourceBurnSubmission, "signature"),
  };
};

const deploymentVideoHandoffVerificationSnapshot = (report) => ({
  ready: report?.ready === true,
  blockerIds: reportBlockerIds(report),
  statuses: readFirstArray(report, "statuses")
    .map((status) => ({
      id: readFirstString(status, "id"),
      status: readFirstString(status, "status"),
    }))
    .filter((status) => status.id)
    .sort((left, right) => left.id.localeCompare(right.id)),
});

const selectedSourceTokenAddress = (selectedSourceToken) =>
  typeof selectedSourceToken === "string"
    ? selectedSourceToken
    : readFirstString(selectedSourceToken, "address");

const deploymentVideoSourceBurnReadinessSnapshot = (report) => ({
  readyToSubmitBurn: report?.readyToSubmitBurn === true,
  ownerAddress: readFirstString(report, "ownerAddress"),
  selectedSourceToken: selectedSourceTokenAddress(
    readFirstRecord(report, "selectedSourceToken", "selected_source_token") ??
      report?.selectedSourceToken,
  ),
  tokenAccountCount:
    Number(report?.tokenAccountCount) ||
    readFirstArray(report, "tokenAccounts", "token_accounts").length,
  blockerIds: reportBlockerIds(report),
});

const deploymentVideoSourceBurnSubmissionSnapshot = (report) => {
  const sourceProofRequest = readFirstRecord(
    report,
    "sourceProofRequest",
    "source_proof_request",
  );
  const canonical = readFirstRecord(sourceProofRequest, "canonical");
  return {
    submitted: report?.submitted === true,
    signature: readFirstString(report, "signature"),
    sourceTokenAddress: readFirstString(report, "sourceTokenAddress"),
    amountBaseUnits: readFirstString(report, "amountBaseUnits"),
    tairaRecipient: readFirstString(report, "tairaRecipient"),
    nonce: readFirstString(report, "nonce"),
    sourceProofRequestReady: report?.sourceProofRequestReady === true,
    sourceBurnCanonicalTransferReady:
      sourceProofRequest?.canonicalTransferReady === true ||
      report?.sourceBurnCanonicalTransferReady === true,
    sourceBurnMessageId:
      readFirstString(canonical, "messageId", "message_id") ||
      readFirstString(report, "sourceBurnMessageId", "source_burn_message_id"),
    sourceBurnCommitmentRoot:
      readFirstString(canonical, "commitmentRoot", "commitment_root") ||
      readFirstString(
        report,
        "sourceBurnCommitmentRoot",
        "source_burn_commitment_root",
      ),
    sourceBurnPayloadHash:
      readFirstString(canonical, "payloadHash") ||
      readFirstString(
        report,
        "sourceBurnPayloadHash",
        "source_burn_payload_hash",
      ),
  };
};

export const checkDeploymentVideoArtifactConsistency = ({
  deploymentVideoTranscript,
  deploymentVideoTranscriptPath = null,
  activationPackageReport = null,
  activationPackagePath = null,
  sourceMaterialHandoffReport = null,
  sourceMaterialHandoffPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
  sourceBurnReadinessReport = null,
  sourceBurnReadinessPath = null,
  sourceBurnSubmissionReport = null,
  sourceBurnSubmissionPath = null,
} = {}) => {
  if (!isRecord(deploymentVideoTranscript)) {
    return makeCheck(
      "deployment-video-artifact-consistency",
      false,
      "No Solana deployment video transcript is available for artifact consistency checks.",
      { transcriptPath: deploymentVideoTranscriptPath },
    );
  }
  if (!isRecord(activationPackageReport)) {
    return makeCheck(
      "deployment-video-artifact-consistency",
      false,
      "No Solana activation package is available for deployment-video artifact consistency checks.",
      { transcriptPath: deploymentVideoTranscriptPath, activationPackagePath },
    );
  }
  const deployment = readFirstRecord(deploymentVideoTranscript, "deployment");
  const embeddedActivationPackage = readFirstRecord(
    deployment,
    "activationPackage",
    "activation_package",
  );
  const expected = deploymentVideoActivationPackageSnapshot(
    activationPackageReport,
  );
  const observed = deploymentVideoActivationPackageSnapshot(
    embeddedActivationPackage,
    { embedded: true },
  );
  const mismatches = [];
  for (const field of [
    "readyForActivationReview",
    "productionActivationReady",
    "readyToSubmitWithCurrentRuntime",
    "publicRouteAlreadyPublished",
    "activationPackageHash",
    "laneActivationRequestHash",
    "blockerIds",
    "nextActionIds",
    "smokeReadiness",
  ]) {
    const expectedValue = JSON.stringify(stableJsonValue(expected[field]));
    const observedValue = JSON.stringify(stableJsonValue(observed[field]));
    if (expectedValue !== observedValue) {
      mismatches.push({
        id: "activation-package",
        field,
        expected: expectedValue,
        observed: observedValue,
        sourcePath: activationPackagePath,
        detail:
          "Deployment video activation-package snapshot does not match the current activation package.",
      });
    }
  }
  const compareSnapshot = ({ id, field, expected, observed, sourcePath }) => {
    const expectedValue = JSON.stringify(stableJsonValue(expected));
    const observedValue = JSON.stringify(stableJsonValue(observed));
    if (expectedValue !== observedValue) {
      mismatches.push({
        id,
        field,
        expected: expectedValue,
        observed: observedValue,
        sourcePath,
        detail:
          "Deployment video evidence snapshot does not match the current direct artifact.",
      });
    }
  };
  if (isRecord(sourceMaterialHandoffReport)) {
    const expectedPins = sourceMaterialObservedPinsSnapshot(
      readFirstRecord(
        sourceMaterialHandoffReport,
        "observedPins",
        "observed_pins",
      ),
    );
    compareSnapshot({
      id: "deployment-pins",
      field: "pins",
      expected: {
        verifierProgramId: expectedPins.verifierProgramId,
        verifierCodeHash: expectedPins.verifierCodeHash,
        programdataAddress: expectedPins.programdataAddress,
        programdataSlot: expectedPins.programdataSlot,
        tokenMintAddress: expectedPins.tokenMintAddress,
        bridgeProgramId: expectedPins.bridgeProgramId,
        sourceBridgeProgramId: expectedPins.sourceBridgeProgramId,
        verifierStateAddress: expectedPins.verifierStateAddress,
        sourceStateAddress: expectedPins.sourceStateAddress,
        routeCanaryEvidenceHash: expectedPins.routeCanaryEvidenceHash,
        routeCanarySignature: expectedPins.routeCanarySignature,
        sourceBurnSignature: expectedPins.sourceBurnSignature,
      },
      observed: deploymentVideoDeploymentPinSnapshot(deployment),
      sourcePath: sourceMaterialHandoffPath,
    });
    compareSnapshot({
      id: "source-material-handoff",
      field: "snapshot",
      expected: deploymentVideoSourceMaterialSnapshot(
        sourceMaterialHandoffReport,
      ),
      observed: deploymentVideoSourceMaterialSnapshot(
        readFirstRecord(
          deployment,
          "sourceMaterialHandoff",
          "source_material_handoff",
        ),
      ),
      sourcePath: sourceMaterialHandoffPath,
    });
  }
  if (isRecord(handoffVerificationReport)) {
    compareSnapshot({
      id: "source-material-handoff-verification",
      field: "snapshot",
      expected: deploymentVideoHandoffVerificationSnapshot(
        handoffVerificationReport,
      ),
      observed: deploymentVideoHandoffVerificationSnapshot(
        readFirstRecord(
          deployment,
          "sourceMaterialHandoffVerification",
          "source_material_handoff_verification",
        ),
      ),
      sourcePath: handoffVerificationPath,
    });
  }
  if (isRecord(sourceBurnReadinessReport)) {
    compareSnapshot({
      id: "source-burn-readiness",
      field: "snapshot",
      expected: deploymentVideoSourceBurnReadinessSnapshot(
        sourceBurnReadinessReport,
      ),
      observed: deploymentVideoSourceBurnReadinessSnapshot(
        readFirstRecord(
          deployment,
          "sourceBurnReadiness",
          "source_burn_readiness",
        ),
      ),
      sourcePath: sourceBurnReadinessPath,
    });
  }
  if (isRecord(sourceBurnSubmissionReport)) {
    compareSnapshot({
      id: "source-burn-submission",
      field: "snapshot",
      expected: deploymentVideoSourceBurnSubmissionSnapshot(
        sourceBurnSubmissionReport,
      ),
      observed: deploymentVideoSourceBurnSubmissionSnapshot(
        readFirstRecord(
          deployment,
          "sourceBurnSubmission",
          "source_burn_submission",
        ),
      ),
      sourcePath: sourceBurnSubmissionPath,
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "deployment-video-artifact-consistency",
    ok,
    ok
      ? "Solana deployment video references the current activation, source-material, source-burn, and smoke-readiness artifacts."
      : "Solana deployment video references stale activation, source-material, source-burn, or smoke-readiness artifacts.",
    {
      transcriptPath: deploymentVideoTranscriptPath,
      comparedArtifacts: {
        activationPackagePath,
        sourceMaterialHandoffPath,
        handoffVerificationPath,
        sourceBurnReadinessPath,
        sourceBurnSubmissionPath,
      },
      expected,
      observed,
      mismatches,
    },
  );
};

export const checkDeploymentVideoHonestStatus = ({
  deploymentVideoTranscript,
  publicPreflightReady,
  productionRequirementsReady,
  publishReadinessReady,
  liveVideoReady,
} = {}) => {
  if (!isRecord(deploymentVideoTranscript)) {
    return makeCheck(
      "deployment-video-honest-status",
      false,
      "No Solana deployment video transcript is available.",
    );
  }
  const claimsReady = deploymentVideoTranscript.ready === true;
  const completionReady =
    publicPreflightReady &&
    productionRequirementsReady &&
    publishReadinessReady &&
    liveVideoReady;
  const ok = !claimsReady || completionReady;
  return makeCheck(
    "deployment-video-honest-status",
    ok,
    ok
      ? "Solana deployment video status does not claim completed production transfer evidence prematurely."
      : "Solana deployment video claims ready before the production gate is ready.",
    {
      transcriptReady: claimsReady,
      publicPreflightReady,
      productionRequirementsReady,
      publishReadinessReady,
      liveVideoReady,
    },
  );
};

export const checkPublishReadinessReady = ({
  publishReadinessReport,
  publishReadinessPath = null,
} = {}) => {
  if (!isRecord(publishReadinessReport)) {
    return makeCheck(
      "publish-readiness-ready",
      false,
      "No Solana route publish-readiness report is available.",
      { publishReadinessPath },
    );
  }
  const schemaOk =
    publishReadinessReport.schema ===
    "iroha-demo-sccp-solana-route-publish-readiness/v1";
  const routeOk =
    readFirstString(publishReadinessReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyForRuntimeSigner =
    publishReadinessReport.readyForRuntimeSigner === true;
  const readyToSubmitWithCurrentRuntime =
    publishReadinessReport.readyToSubmitWithCurrentRuntime === true;
  const endpointReady =
    readFirstRecord(publishReadinessReport, "publicEndpoint")?.endpointReady ===
    true;
  const mcpTransactionTools = readFirstRecord(
    readFirstRecord(publishReadinessReport, "publicEndpoint"),
    "mcpTransactionTools",
    "mcp_transaction_tools",
  );
  const mcpTransactionToolsReady =
    !mcpTransactionTools || mcpTransactionTools.ready === true;
  const runtimeSigning = readFirstRecord(
    publishReadinessReport,
    "runtimeSigning",
    "runtime_signing",
  );
  const permissionAudit = readFirstRecord(
    runtimeSigning,
    "permissionAudit",
    "permission_audit",
  );
  const authorityReady = runtimeSigning?.authorityReady === true;
  const authorityFormatReady = runtimeSigning?.authorityFormatReady === true;
  const authorityStatus = canonicalTairaRouteAuthorityStatus(
    runtimeSigning?.authority ?? permissionAudit?.authority,
  );
  const authorityPermissionReady =
    !permissionAudit || permissionAudit.ready === true;
  const privateKeyEnvPresent = runtimeSigning?.privateKeyEnvPresent === true;
  const ok =
    schemaOk &&
    routeOk &&
    readyForRuntimeSigner &&
    readyToSubmitWithCurrentRuntime &&
    endpointReady &&
    mcpTransactionToolsReady &&
    authorityReady &&
    authorityFormatReady &&
    authorityStatus.canonical &&
    authorityPermissionReady &&
    privateKeyEnvPresent;
  return makeCheck(
    "publish-readiness-ready",
    ok,
    ok
      ? "Solana route publish-readiness proves current runtime can submit."
      : "Solana route publish-readiness is missing or not submit-ready.",
    {
      publishReadinessPath,
      schemaOk,
      routeOk,
      readyForRuntimeSigner,
      readyToSubmitWithCurrentRuntime,
      endpointReady,
      mcpTransactionToolsReady,
      mcpTransactionTools,
      authorityReady,
      authorityFormatReady,
      canonicalAuthority: authorityStatus,
      authorityPermissionReady,
      permissionAudit,
      privateKeyEnvPresent,
      blockerIds: readFirstArray(publishReadinessReport, "blockers").map(
        (blocker) => readFirstString(blocker, "id"),
      ),
    },
  );
};

export const checkSourceMaterialHandoffVerified = ({
  handoffVerificationReport,
  handoffVerificationPath = null,
} = {}) => {
  if (!isRecord(handoffVerificationReport)) {
    return makeCheck(
      "source-material-handoff-verified",
      false,
      "No Solana source-material handoff verification report is available.",
      { handoffVerificationPath },
    );
  }
  const schemaOk =
    handoffVerificationReport.schema ===
    "iroha-demo-sccp-solana-source-material-handoff-verification/v1";
  const routeOk =
    readFirstString(handoffVerificationReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const blockers = readFirstArray(handoffVerificationReport, "blockers");
  const statuses = readFirstArray(handoffVerificationReport, "statuses");
  const deploymentStatusIds = [
    "handoff-schema",
    "handoff-ready-for-proof-material-ceremony",
    "handoff-not-production-proof-material",
    "verifier-program-account",
    "bridge-program-account",
    "source-bridge-program-account",
    "token-mint-account",
    "verifier-state-account",
    "source-state-account",
    "route-canary-signature-finalized",
  ];
  const sourceBurnStatusIds = new Set(["source-burn-signature-finalized"]);
  const statusMap = new Map(
    statuses.map((status) => [readFirstString(status, "id"), status]),
  );
  const missingDeploymentStatusIds = deploymentStatusIds.filter(
    (id) => !statusMap.has(id),
  );
  const failedDeploymentStatuses = deploymentStatusIds
    .map((id) => statusMap.get(id))
    .filter((status) => status && status.status !== "pass");
  const unexpectedFailedStatuses = statuses.filter((status) => {
    const id = readFirstString(status, "id");
    return (
      status.status !== "pass" &&
      !deploymentStatusIds.includes(id) &&
      !sourceBurnStatusIds.has(id)
    );
  });
  const sourceBurnStatuses = statuses.filter((status) =>
    sourceBurnStatusIds.has(readFirstString(status, "id")),
  );
  const deploymentBlockers = blockers.filter(
    (blocker) =>
      !sourceBurnStatusIds.has(readFirstString(blocker, "id")) &&
      readFirstString(blocker, "id") !== "source-burn-signature" &&
      readFirstString(blocker, "id") !== "source-burn-hash",
  );
  const ready =
    schemaOk &&
    routeOk &&
    missingDeploymentStatusIds.length === 0 &&
    failedDeploymentStatuses.length === 0 &&
    unexpectedFailedStatuses.length === 0 &&
    deploymentBlockers.length === 0;
  return makeCheck(
    "source-material-handoff-verified",
    ready,
    ready
      ? "Solana deployment handoff was verified against live Solana RPC."
      : "Solana deployment handoff verification is missing or failed.",
    {
      handoffVerificationPath,
      schemaOk,
      routeOk,
      ready: handoffVerificationReport.ready === true,
      deploymentReady: ready,
      statusCount: statuses.length,
      missingDeploymentStatusIds,
      failedDeploymentStatuses: failedDeploymentStatuses.map((status) => ({
        id: status.id ?? null,
        status: status.status ?? null,
        detail: status.detail ?? null,
      })),
      unexpectedFailedStatuses: unexpectedFailedStatuses.map((status) => ({
        id: status.id ?? null,
        status: status.status ?? null,
        detail: status.detail ?? null,
      })),
      sourceBurnStatuses: sourceBurnStatuses.map((status) => ({
        id: status.id ?? null,
        status: status.status ?? null,
        detail: status.detail ?? null,
      })),
      deploymentBlockers,
      blockers,
      productionProofMaterialIncluded:
        handoffVerificationReport.productionProofMaterialIncluded === true,
    },
  );
};

const statusById = (statuses, id) =>
  statuses.find((status) => readFirstString(status, "id") === id) ?? null;

export const checkSourceMaterialHandoffArtifactConsistency = ({
  sourceMaterialHandoffReport = null,
  sourceMaterialHandoffPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
} = {}) => {
  if (!isRecord(sourceMaterialHandoffReport)) {
    return makeCheck(
      "source-material-handoff-artifact-consistency",
      false,
      "No Solana source-material handoff is available for verification consistency checks.",
      { sourceMaterialHandoffPath, handoffVerificationPath },
    );
  }
  if (!isRecord(handoffVerificationReport)) {
    return makeCheck(
      "source-material-handoff-artifact-consistency",
      false,
      "No Solana source-material handoff verification report is available for consistency checks.",
      { sourceMaterialHandoffPath, handoffVerificationPath },
    );
  }
  const statuses = readFirstArray(handoffVerificationReport, "statuses");
  const handoffPins = readFirstRecord(
    sourceMaterialHandoffReport,
    "observedPins",
    "observed_pins",
  );
  const verificationPins = readFirstRecord(
    handoffVerificationReport,
    "observedPins",
    "observed_pins",
  );
  const mismatches = [];
  const compare = ({ id, field, expected, observed, detail }) => {
    if (stableJsonString(expected) !== stableJsonString(observed)) {
      mismatches.push({
        id,
        field,
        expected: stableJsonString(expected),
        observed: stableJsonString(observed),
        sourcePath: sourceMaterialHandoffPath,
        detail,
      });
    }
  };
  compare({
    id: "handoff-schema",
    field: "schema",
    expected: sourceMaterialHandoffReport.schema ?? null,
    observed: statusById(statuses, "handoff-schema")?.observed ?? null,
    detail:
      "Source-material handoff verification schema status does not match the direct handoff package.",
  });
  compare({
    id: "handoff-ready-for-proof-material-ceremony",
    field: "observed.missingPins",
    expected: (
      statusById(statuses, "handoff-ready-for-proof-material-ceremony")
        ?.observed?.requiredPins ?? []
    ).filter((pinKey) => {
      const value = handoffPins?.[pinKey];
      return typeof value === "string"
        ? value.trim().length === 0
        : value === undefined || value === null;
    }),
    observed:
      statusById(statuses, "handoff-ready-for-proof-material-ceremony")
        ?.observed?.missingPins ?? null,
    detail:
      "Source-material handoff verification deployment-pin status does not match the direct handoff package.",
  });
  compare({
    id: "handoff-not-production-proof-material",
    field: "productionProofMaterialIncluded",
    expected:
      sourceMaterialHandoffReport.productionProofMaterialIncluded === true,
    observed:
      handoffVerificationReport.productionProofMaterialIncluded === true,
    detail:
      "Source-material handoff verification production-proof flag does not match the direct handoff package.",
  });
  compare({
    id: "observed-pins",
    field: "observedPins",
    expected: handoffPins,
    observed: verificationPins,
    detail:
      "Source-material handoff verification observed pins do not match the direct handoff package.",
  });
  for (const { statusId, pinKey, field = "expected" } of [
    { statusId: "verifier-program-account", pinKey: "verifierProgramId" },
    { statusId: "bridge-program-account", pinKey: "bridgeProgramId" },
    {
      statusId: "source-bridge-program-account",
      pinKey: "sourceBridgeProgramId",
    },
    { statusId: "token-mint-account", pinKey: "tokenMintAddress" },
    { statusId: "verifier-state-account", pinKey: "verifierStateAddress" },
    { statusId: "source-state-account", pinKey: "sourceStateAddress" },
    {
      statusId: "route-canary-signature-finalized",
      pinKey: "routeCanarySignature",
      field: "expected.signature",
    },
    {
      statusId: "source-burn-signature-finalized",
      pinKey: "sourceBurnSignature",
      field: "expected.signature",
    },
  ]) {
    const status = statusById(statuses, statusId);
    const normalizeMissingPin = (value) =>
      typeof value === "string" && value.trim().length === 0
        ? null
        : (value ?? null);
    const expectedValue = normalizeMissingPin(handoffPins?.[pinKey]);
    const observedValue =
      field === "expected.signature"
        ? normalizeMissingPin(status?.expected?.signature)
        : normalizeMissingPin(status?.expected);
    if (
      statusId === "source-state-account" &&
      isRecord(observedValue) &&
      status?.status !== "pass"
    ) {
      continue;
    }
    compare({
      id: statusId,
      field,
      expected: expectedValue,
      observed: observedValue,
      detail:
        "Source-material handoff verification status pin does not match the direct handoff package.",
    });
  }
  const handoffReady =
    sourceMaterialHandoffReport.readyForProofMaterialCeremony === true;
  const handoffBlockerIds = reportBlockerIds(sourceMaterialHandoffReport);
  if (handoffReady && handoffBlockerIds.length > 0) {
    mismatches.push({
      id: "handoff-blockers",
      field: "blockerIds",
      expected: "[]",
      observed: stableJsonString(handoffBlockerIds),
      sourcePath: sourceMaterialHandoffPath,
      detail: "Source-material handoff is ready but still carries blockers.",
    });
  }
  if (!handoffReady && handoffBlockerIds.length === 0) {
    mismatches.push({
      id: "handoff-blockers",
      field: "blockerIds",
      expected: "non-empty",
      observed: "[]",
      sourcePath: sourceMaterialHandoffPath,
      detail:
        "Source-material handoff is not ready but carries no blocker details.",
    });
  }
  const failedStatusIds = sortedStringIds(
    statuses
      .filter((status) => status.status !== "pass")
      .map((status) => readFirstString(status, "id")),
  );
  compare({
    id: "verification-blockers",
    field: "blockerIds",
    expected: failedStatusIds,
    observed: reportBlockerIds(handoffVerificationReport),
    detail:
      "Source-material handoff verification blockers do not match its failed verification statuses.",
  });
  const ok = mismatches.length === 0;
  return makeCheck(
    "source-material-handoff-artifact-consistency",
    ok,
    ok
      ? "Solana source-material handoff verification references the current handoff package."
      : "Solana source-material handoff verification references stale or mismatched handoff pins.",
    {
      sourceMaterialHandoffPath,
      handoffVerificationPath,
      mismatches,
    },
  );
};

export const checkActivationPackageReady = ({
  activationPackageReport,
  activationPackagePath = null,
} = {}) => {
  if (!isRecord(activationPackageReport)) {
    return makeCheck(
      "activation-package-ready",
      false,
      "No Solana TAIRA activation package is available.",
      { activationPackagePath },
    );
  }
  const schemaOk =
    activationPackageReport.schema ===
    "iroha-demo-sccp-solana-activation-package/v1";
  const routeOk =
    readFirstString(activationPackageReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyForActivationReview =
    activationPackageReport.readyForActivationReview === true;
  const productionActivationReady =
    activationPackageReport.productionActivationReady === true;
  const readyToSubmitWithCurrentRuntime =
    activationPackageReport.readyToSubmitWithCurrentRuntime === true;
  const activationArtifacts = readFirstRecord(
    activationPackageReport,
    "artifacts",
  );
  const requiredRouteManager = readFirstRecord(
    activationPackageReport,
    "requiredRouteManager",
    "required_route_manager",
  );
  const authorityStatus = canonicalTairaRouteAuthorityStatus(
    requiredRouteManager?.authority,
  );
  const ok =
    schemaOk &&
    routeOk &&
    readyForActivationReview &&
    productionActivationReady &&
    readyToSubmitWithCurrentRuntime &&
    authorityStatus.canonical;
  return makeCheck(
    "activation-package-ready",
    ok,
    ok
      ? "Solana TAIRA activation package is ready for runtime publication."
      : "Solana TAIRA activation package is missing or not runtime-submit-ready.",
    {
      activationPackagePath,
      schemaOk,
      routeOk,
      readyForActivationReview,
      productionActivationReady,
      readyToSubmitWithCurrentRuntime,
      publicRouteAlreadyPublished:
        activationPackageReport.publicRouteAlreadyPublished === true,
      activationPackageHash:
        activationPackageReport.activationPackageHash ?? null,
      publicSolanaLane:
        activationPackageReport.publicTaira?.publicSolanaLane ?? null,
      smokeReadiness: readFirstRecord(activationArtifacts, "smokeReadiness"),
      requiredRouteManager,
      canonicalAuthority: authorityStatus,
      blockerIds: readFirstArray(activationPackageReport, "blockers").map(
        (blocker) => readFirstString(blocker, "id"),
      ),
    },
  );
};

export const checkLaneActivationProposalReady = ({
  laneActivationProposalReport,
  laneActivationProposalPath = null,
} = {}) => {
  if (!isRecord(laneActivationProposalReport)) {
    return makeCheck(
      "lane-activation-proposal-ready",
      false,
      "No Solana lane activation proposal package is available.",
      { laneActivationProposalPath },
    );
  }
  const schemaOk =
    laneActivationProposalReport.schema ===
    "iroha-demo-sccp-solana-lane-activation-proposal/v1";
  const routeOk =
    readFirstString(laneActivationProposalReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const assetOk =
    readFirstString(laneActivationProposalReport, "assetKey", "asset_key") ===
    SCCP_XOR_ASSET_KEY;
  const proposalHash = readFirstString(
    laneActivationProposalReport,
    "proposalHash",
    "proposal_hash",
    "stableHash",
    "stable_hash",
  );
  const laneActivationRequest = readFirstRecord(
    laneActivationProposalReport,
    "laneActivationRequest",
    "lane_activation_request",
  );
  const proposalDraft = readFirstRecord(
    laneActivationProposalReport,
    "proposalDraft",
    "proposal_draft",
  );
  const reviewBlockers = readFirstArray(
    laneActivationProposalReport,
    "reviewBlockers",
    "review_blockers",
  );
  const blockers = readFirstArray(laneActivationProposalReport, "blockers");
  const ready =
    schemaOk &&
    routeOk &&
    assetOk &&
    laneActivationProposalReport.readyForGovernanceReview === true &&
    /^0x[0-9a-f]{64}$/u.test(proposalHash) &&
    laneActivationRequest?.readyForLaneGovernanceReview === true &&
    /^0x[0-9a-f]{64}$/u.test(
      readFirstString(
        laneActivationRequest,
        "laneActivationRequestHash",
        "lane_activation_request_hash",
      ),
    ) &&
    proposalDraft?.kind === "ActivateSccpLane" &&
    proposalDraft?.routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
    reviewBlockers.length === 0;
  return makeCheck(
    "lane-activation-proposal-ready",
    ready,
    ready
      ? "Solana lane activation proposal is hash-indexed and ready for TAIRA governance review."
      : "Solana lane activation proposal is missing, stale, or not governance-review-ready.",
    {
      laneActivationProposalPath,
      schemaOk,
      routeOk,
      assetOk,
      readyForGovernanceReview:
        laneActivationProposalReport.readyForGovernanceReview === true,
      productionLaneReady:
        laneActivationProposalReport.productionLaneReady === true,
      readyToSubmitWithCurrentRuntime:
        laneActivationProposalReport.readyToSubmitWithCurrentRuntime === true,
      proposalHash: proposalHash || null,
      laneActivationRequest: laneActivationRequest
        ? {
            readyForLaneGovernanceReview:
              laneActivationRequest.readyForLaneGovernanceReview === true,
            publicLaneReady: laneActivationRequest.publicLaneReady === true,
            productionProofMaterialReady:
              laneActivationRequest.productionProofMaterialReady === true,
            productionLaneReady:
              laneActivationRequest.productionLaneReady === true,
            laneActivationRequestHash:
              readFirstString(
                laneActivationRequest,
                "laneActivationRequestHash",
                "lane_activation_request_hash",
              ) || null,
            blockerIds: readFirstArray(
              laneActivationRequest,
              "blockerIds",
              "blocker_ids",
            ),
          }
        : null,
      proposalDraft: proposalDraft
        ? {
            kind: proposalDraft.kind ?? null,
            routeId: proposalDraft.routeId ?? null,
            assetKey: proposalDraft.assetKey ?? null,
            chain: proposalDraft.chain ?? null,
            requiredPolicies: readFirstArray(
              proposalDraft,
              "requiredPolicies",
              "required_policies",
            ),
          }
        : null,
      reviewBlockerIds: reviewBlockers.map((blocker) =>
        readFirstString(blocker, "id"),
      ),
      blockerIds: blockers.map((blocker) => readFirstString(blocker, "id")),
    },
  );
};

const artifactStableHash = (artifacts, ...keys) =>
  readFirstString(
    readFirstRecord(artifacts, ...keys),
    "stableHash",
    "stable_hash",
  );

const sortedStringIds = (values) =>
  [...new Set(values.map((value) => trimString(value)).filter(Boolean))].sort();

const reportBlockerIds = (report) =>
  sortedStringIds(
    readFirstArray(report, "blockers").map((blocker) =>
      typeof blocker === "string" ? blocker : readFirstString(blocker, "id"),
    ),
  );

const reportBlockerIdSnapshot = (report) =>
  sortedStringIds([
    ...readFirstArray(report, "blockers").map((blocker) =>
      typeof blocker === "string" ? blocker : readFirstString(blocker, "id"),
    ),
    ...readFirstArray(report, "blockerIds", "blocker_ids").map((blocker) =>
      typeof blocker === "string" ? blocker : readFirstString(blocker, "id"),
    ),
  ]);

const firstBooleanFlag = (...values) => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return false;
};

const publishReadinessConsistencySnapshot = (report) => {
  const publicEndpoint = readFirstRecord(
    report,
    "publicEndpoint",
    "public_endpoint",
  );
  const mcpTransactionTools = readFirstRecord(
    publicEndpoint,
    "mcpTransactionTools",
    "mcp_transaction_tools",
  );
  const routeManifestIsi = readFirstRecord(
    report,
    "routeManifestIsi",
    "route_manifest_isi",
  );
  const runtimeSigning = readFirstRecord(
    report,
    "runtimeSigning",
    "runtime_signing",
  );
  return {
    readyForRuntimeSigner: report?.readyForRuntimeSigner === true,
    readyToSubmitWithCurrentRuntime:
      report?.readyToSubmitWithCurrentRuntime === true,
    endpointReady: firstBooleanFlag(
      report?.endpointReady,
      publicEndpoint?.endpointReady,
    ),
    mcpTransactionToolsReady: firstBooleanFlag(
      report?.mcpTransactionToolsReady,
      mcpTransactionTools?.ready,
    ),
    publicationMode:
      readFirstString(report, "publicationMode") ||
      readFirstString(mcpTransactionTools, "publicationMode") ||
      null,
    routeManifestIsi: {
      ready: routeManifestIsi?.ready === true,
      manifestSha256:
        readFirstString(
          routeManifestIsi,
          "manifestSha256",
          "manifest_sha256",
        ) || null,
      instructionManifestSha256:
        readFirstString(
          routeManifestIsi,
          "instructionManifestSha256",
          "instruction_manifest_sha256",
        ) || null,
      error: readFirstString(routeManifestIsi, "error") || null,
    },
    runtimeSigning: {
      authority: readFirstString(runtimeSigning, "authority") || null,
      authorityReady: runtimeSigning?.authorityReady === true,
      authorityFormatReady: runtimeSigning?.authorityFormatReady === true,
      requiredPermission:
        readFirstString(
          runtimeSigning,
          "requiredPermission",
          "required_permission",
        ) || null,
      privateKeyEnv:
        readFirstString(runtimeSigning, "privateKeyEnv", "private_key_env") ||
        null,
      privateKeyEnvPresent: runtimeSigning?.privateKeyEnvPresent === true,
      privateKeyStoredInReport:
        runtimeSigning?.privateKeyStoredInReport === true,
    },
    blockerIds: reportBlockerIdSnapshot(report),
  };
};

const stableJsonValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJsonValue(value[key])]),
    );
  }
  return value ?? null;
};

const stableJsonString = (value) => JSON.stringify(stableJsonValue(value));

const stripVolatileReviewFields = (value) => {
  if (Array.isArray(value)) {
    return value.map(stripVolatileReviewFields);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "checkedAt" && key !== "checked_at")
      .map(([key, entry]) => [key, stripVolatileReviewFields(entry)]),
  );
};

const reviewSha256ForJson = (json) =>
  sha256Hex(JSON.stringify(stripVolatileReviewFields(json)));

const blockerIdSnapshot = (values) =>
  sortedStringIds(
    values.map((blocker) =>
      typeof blocker === "string" ? blocker : readFirstString(blocker, "id"),
    ),
  );

const proofMaterialProverModuleSnapshot = (module) => ({
  direction: readFirstString(module, "direction"),
  moduleUrl: readFirstString(module, "moduleUrl", "module_url"),
  sidecarUrl: readFirstString(module, "sidecarUrl", "sidecar_url"),
  expectedModuleHash: readFirstString(
    module,
    "expectedModuleHash",
    "expected_module_hash",
  ),
  actualModuleHash: readFirstString(
    module,
    "actualModuleHash",
    "actual_module_hash",
  ),
  proveExport: readFirstString(module, "proveExport", "prove_export"),
  selfTestExport: readFirstString(module, "selfTestExport", "self_test_export"),
  exportsReady: module?.exportsReady === true,
  selfTestReady: module?.selfTestReady === true,
  sidecarReady: module?.sidecarReady === true,
  moduleHashMatchesManifest: module?.moduleHashMatchesManifest === true,
  productionProofsReady: module?.productionProofsReady === true,
  blockerIds: blockerIdSnapshot(
    readFirstArray(module, "blockerIds", "blocker_ids"),
  ),
});

const proofMaterialRequestSnapshot = (report, { embedded = false } = {}) => {
  const requestMaterial = readFirstRecord(
    report,
    "requiredProofMaterial",
    "required_proof_material",
  );
  const modules = embedded
    ? readFirstArray(report, "browserProverModules", "browser_prover_modules")
    : readFirstArray(
        requestMaterial,
        "browserProverModules",
        "browser_prover_modules",
      );
  return {
    readyForProofMaterialCeremony:
      report?.readyForProofMaterialCeremony === true,
    productionRouteReady: report?.productionRouteReady === true,
    readyToSubmitWithCurrentRuntime:
      report?.readyToSubmitWithCurrentRuntime === true,
    publicRouteAlreadyPublished: report?.publicRouteAlreadyPublished === true,
    productionProofMaterialIncluded:
      report?.productionProofMaterialIncluded === true,
    observedPins: stableJsonValue(
      readFirstRecord(report, "observedPins", "observed_pins"),
    ),
    browserProverModules: modules
      .map((module) => proofMaterialProverModuleSnapshot(module))
      .sort((left, right) => left.direction.localeCompare(right.direction)),
    blockerIds: embedded
      ? blockerIdSnapshot(readFirstArray(report, "blockerIds", "blocker_ids"))
      : reportBlockerIds(report),
  };
};

export const checkLaneActivationProposalArtifactConsistency = ({
  laneActivationProposalReport,
  laneActivationProposalPath = null,
  laneActivationRequestReport = null,
  laneActivationRequestPath = null,
} = {}) => {
  if (!isRecord(laneActivationProposalReport)) {
    return makeCheck(
      "lane-activation-proposal-artifact-consistency",
      false,
      "No Solana lane activation proposal is available for artifact consistency checks.",
      { laneActivationProposalPath },
    );
  }
  if (!isRecord(laneActivationRequestReport)) {
    return makeCheck(
      "lane-activation-proposal-artifact-consistency",
      false,
      "No direct Solana lane activation request is available for proposal consistency checks.",
      { laneActivationProposalPath, laneActivationRequestPath },
    );
  }
  const proposalRequest = readFirstRecord(
    laneActivationProposalReport,
    "laneActivationRequest",
    "lane_activation_request",
  );
  const proposalDraft = readFirstRecord(
    laneActivationProposalReport,
    "proposalDraft",
    "proposal_draft",
  );
  const expectedHash = readFirstString(
    laneActivationRequestReport,
    "laneActivationRequestHash",
    "lane_activation_request_hash",
    "stableHash",
    "stable_hash",
  );
  const mismatches = [];
  const compareValue = ({ id, field, expected, observed, detail }) => {
    if (expected !== observed) {
      mismatches.push({
        id,
        field,
        expected,
        observed,
        sourcePath: laneActivationRequestPath,
        detail,
      });
    }
  };
  compareValue({
    id: "lane-activation-request",
    field: "laneActivationRequestHash",
    expected: expectedHash || null,
    observed:
      readFirstString(
        proposalRequest,
        "laneActivationRequestHash",
        "lane_activation_request_hash",
        "stableHash",
        "stable_hash",
      ) || null,
    detail:
      "Lane activation proposal request hash does not match the direct request package.",
  });
  compareValue({
    id: "proposal-draft",
    field: "laneActivationRequestHash",
    expected: expectedHash || null,
    observed:
      readFirstString(
        proposalDraft,
        "laneActivationRequestHash",
        "lane_activation_request_hash",
      ) || null,
    detail:
      "Lane activation proposal draft hash does not match the direct request package.",
  });
  for (const field of [
    "readyForLaneGovernanceReview",
    "publicLaneReady",
    "productionProofMaterialReady",
    "productionLaneReady",
  ]) {
    compareValue({
      id: "lane-activation-request",
      field,
      expected: laneActivationRequestReport[field] === true,
      observed: proposalRequest?.[field] === true,
      detail:
        "Lane activation proposal request readiness snapshot does not match the direct request package.",
    });
  }
  compareValue({
    id: "lane-activation-request",
    field: "blockerIds",
    expected: JSON.stringify(reportBlockerIds(laneActivationRequestReport)),
    observed: JSON.stringify(
      sortedStringIds(
        readFirstArray(proposalRequest, "blockerIds", "blocker_ids").map(
          (blocker) =>
            typeof blocker === "string"
              ? blocker
              : readFirstString(blocker, "id"),
        ),
      ),
    ),
    detail:
      "Lane activation proposal request blocker snapshot does not match the direct request package.",
  });
  const ok = mismatches.length === 0;
  return makeCheck(
    "lane-activation-proposal-artifact-consistency",
    ok,
    ok
      ? "Solana lane activation proposal references the current lane activation request package."
      : "Solana lane activation proposal references a stale or mismatched lane activation request package.",
    {
      laneActivationProposalPath,
      laneActivationRequestPath,
      proposalHash: laneActivationProposalReport.proposalHash ?? null,
      laneActivationRequestHash: expectedHash || null,
      mismatches,
    },
  );
};

const smokeReadinessInputIds = (record, ...keys) =>
  sortedStringIds(
    readFirstArray(record, ...keys).map((input) =>
      typeof input === "string" ? input : readFirstString(input, "id"),
    ),
  );

const smokeReadinessActionIds = (record) =>
  sortedStringIds([
    ...readFirstArray(record, "nextActionIds", "next_action_ids"),
    ...actionSummaries(readFirstArray(record, "nextActions", "next_actions"))
      .map((action) => action.id)
      .filter(Boolean),
  ]);

const smokeReadinessFailedCheckSummaries = (checks) =>
  failedChecks(checks)
    .map((check) => {
      const evidence = readFirstRecord(check, "evidence");
      return {
        id: check.id ?? null,
        detail: check.detail ?? null,
        configuredSource:
          readFirstString(evidence, "configuredSource", "configured_source") ||
          null,
      };
    })
    .filter((check) => check.id)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

const embeddedSmokeReadinessFailedChecks = (artifact) => {
  const failedChecksRows = readFirstArray(
    artifact,
    "failedChecks",
    "failed_checks",
  );
  if (failedChecksRows.length > 0) {
    return failedChecksRows
      .map((check) => ({
        id: readFirstString(check, "id") || null,
        detail: readFirstString(check, "detail") || null,
        configuredSource:
          readFirstString(check, "configuredSource", "configured_source") ||
          null,
      }))
      .filter((check) => check.id)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }
  return smokeReadinessInputIds(
    artifact,
    "failedCheckIds",
    "failed_check_ids",
  ).map((id) => ({
    id,
    detail: null,
    configuredSource: null,
  }));
};

const directSmokeReadinessSnapshot = (report) => {
  const failedChecksSummary = smokeReadinessFailedCheckSummaries(
    readFirstArray(report, "checks"),
  );
  const failedCheckIds = sortedStringIds(
    failedChecksSummary.map((check) => check.id),
  );
  return {
    ready: report?.ready === true,
    checkedAt: readFirstString(report, "checkedAt", "checked_at") || null,
    failedCheckIds,
    failedChecks: failedChecksSummary,
    blockerIds: smokeReadinessInputIds(report, "blockerIds", "blocker_ids"),
    missingProductionInputIds: smokeReadinessInputIds(
      report,
      "missingProductionInputs",
      "missing_production_inputs",
    ),
    nextActionIds: smokeReadinessActionIds(report),
  };
};

const embeddedSmokeReadinessSnapshot = (artifact) => ({
  ready: artifact?.ready === true,
  checkedAt: readFirstString(artifact, "checkedAt", "checked_at") || null,
  failedCheckIds: smokeReadinessInputIds(
    artifact,
    "failedCheckIds",
    "failed_check_ids",
  ),
  failedChecks: embeddedSmokeReadinessFailedChecks(artifact),
  blockerIds: smokeReadinessInputIds(artifact, "blockerIds", "blocker_ids"),
  missingProductionInputIds: smokeReadinessInputIds(
    artifact,
    "missingProductionInputIds",
    "missing_production_input_ids",
  ),
  nextActionIds: smokeReadinessActionIds(artifact),
});

const compareSmokeReadinessSnapshot = ({
  mismatches,
  artifact,
  report,
  sourcePath,
  detail,
}) => {
  if (!isRecord(artifact) || !isRecord(report)) {
    return;
  }
  const expected = directSmokeReadinessSnapshot(report);
  const observed = embeddedSmokeReadinessSnapshot(artifact);
  // Smoke-readiness reports are regenerated often during finish/refresh flows.
  // Treat checkedAt as volatile and compare only production-relevant fields.
  for (const field of [
    "ready",
    "failedCheckIds",
    "failedChecks",
    "blockerIds",
    "missingProductionInputIds",
    "nextActionIds",
  ]) {
    const expectedValue = JSON.stringify(expected[field] ?? null);
    const observedValue = JSON.stringify(observed[field] ?? null);
    if (expectedValue !== observedValue) {
      mismatches.push({
        id: "smoke-readiness",
        field,
        expected: expectedValue,
        observed: observedValue,
        sourcePath,
        detail,
      });
    }
  }
};

export const checkActivationArtifactConsistency = ({
  activationPackageReport,
  activationPackagePath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  proofMaterialCeremonyPackageReport = null,
  proofMaterialCeremonyPackagePath = null,
  routePublicationRequestReport = null,
  routePublicationRequestPath = null,
  routeManagerAccessReport = null,
  routeManagerAccessPath = null,
  laneActivationProposalReport = null,
  laneActivationProposalPath = null,
  operatorHandoffReport = null,
  operatorHandoffPath = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
} = {}) => {
  if (!isRecord(activationPackageReport)) {
    return makeCheck(
      "activation-artifact-consistency",
      false,
      "No Solana activation package is available for artifact consistency checks.",
      { activationPackagePath },
    );
  }
  const artifacts = readFirstRecord(activationPackageReport, "artifacts");
  const mismatches = [];
  const compare = ({ id, artifactKeys, expected, sourcePath, detail }) => {
    if (!expected) {
      return;
    }
    const observed = artifactStableHash(artifacts, ...artifactKeys);
    if (observed !== expected) {
      mismatches.push({
        id,
        detail,
        expected,
        observed: observed || null,
        sourcePath,
      });
    }
  };
  compare({
    id: "proof-material-bundle",
    artifactKeys: ["proofMaterialBundle", "proof_material_bundle"],
    expected: readFirstString(
      proofMaterialBundleReport,
      "bundleManifestSha256",
      "bundle_manifest_sha256",
    ),
    sourcePath: proofMaterialBundlePath,
    detail:
      "Activation package proof-material bundle hash does not match the direct bundle manifest.",
  });
  compare({
    id: "proof-material-ceremony-package",
    artifactKeys: [
      "proofMaterialCeremonyPackage",
      "proof_material_ceremony_package",
    ],
    expected: readFirstString(
      proofMaterialCeremonyPackageReport,
      "ceremonyPackageHash",
      "ceremony_package_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: proofMaterialCeremonyPackagePath,
    detail:
      "Activation package proof-material ceremony hash does not match the direct ceremony package.",
  });
  compare({
    id: "route-publication-request",
    artifactKeys: ["routePublicationRequest", "route_publication_request"],
    expected: readFirstString(
      routePublicationRequestReport,
      "reviewPackageHash",
      "review_package_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: routePublicationRequestPath,
    detail:
      "Activation package route-publication request hash does not match the direct request package.",
  });
  compare({
    id: "route-manager-access-request",
    artifactKeys: ["routeManagerAccessRequest", "route_manager_access_request"],
    expected: readFirstString(
      routeManagerAccessReport,
      "requestHash",
      "request_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: routeManagerAccessPath,
    detail:
      "Activation package route-manager access request hash does not match the direct access package.",
  });
  compare({
    id: "lane-activation-proposal",
    artifactKeys: ["laneActivationProposal", "lane_activation_proposal"],
    expected: readFirstString(
      laneActivationProposalReport,
      "proposalHash",
      "proposal_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: laneActivationProposalPath,
    detail:
      "Activation package lane activation proposal hash does not match the direct proposal package.",
  });
  const proposalRequest = readFirstRecord(
    laneActivationProposalReport,
    "laneActivationRequest",
    "lane_activation_request",
  );
  compare({
    id: "lane-activation-request",
    artifactKeys: ["laneActivationRequest", "lane_activation_request"],
    expected: readFirstString(
      proposalRequest,
      "laneActivationRequestHash",
      "lane_activation_request_hash",
    ),
    sourcePath: laneActivationProposalPath,
    detail:
      "Activation package lane activation request hash does not match the direct proposal package.",
  });
  compare({
    id: "operator-handoff",
    artifactKeys: ["operatorHandoff", "operator_handoff"],
    expected: readFirstString(
      operatorHandoffReport,
      "handoffHash",
      "handoff_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: operatorHandoffPath,
    detail:
      "Activation package operator handoff hash does not match the direct handoff package.",
  });
  compareSmokeReadinessSnapshot({
    mismatches,
    artifact: readFirstRecord(artifacts, "smokeReadiness", "smoke_readiness"),
    report: smokeReadinessReport,
    sourcePath: smokeReadinessPath,
    detail:
      "Activation package smoke-readiness snapshot does not match the direct smoke-readiness report.",
  });
  const ok = mismatches.length === 0;
  return makeCheck(
    "activation-artifact-consistency",
    ok,
    ok
      ? "Solana activation package references the same proof, lane, publication, handoff, and smoke-readiness artifacts as the direct reports."
      : "Solana activation package references stale or mismatched proof/lane/publication/handoff/smoke artifacts.",
    {
      activationPackagePath,
      activationPackageHash:
        activationPackageReport.activationPackageHash ?? null,
      comparedArtifacts: {
        proofMaterialBundlePath,
        proofMaterialCeremonyPackagePath,
        routePublicationRequestPath,
        routeManagerAccessPath,
        laneActivationProposalPath,
        operatorHandoffPath,
        smokeReadinessPath,
      },
      mismatches,
    },
  );
};

export const checkSourceBurnProofRequestReady = ({
  sourceBurnSubmissionReport,
  sourceBurnSubmissionPath = null,
} = {}) => {
  if (!isRecord(sourceBurnSubmissionReport)) {
    return makeCheck(
      "source-burn-proof-request-ready",
      false,
      "No Solana source-burn submission artifact is available.",
      { sourceBurnSubmissionPath },
    );
  }
  const schemaOk =
    sourceBurnSubmissionReport.schema ===
    "iroha-demo-sccp-solana-source-burn-submission/v1";
  const sourceProofRequest = readFirstRecord(
    sourceBurnSubmissionReport,
    "sourceProofRequest",
    "source_proof_request",
  );
  const canonical = readFirstRecord(sourceProofRequest, "canonical");
  const messageBundle = readFirstRecord(
    canonical,
    "messageBundle",
    "message_bundle",
  );
  const settlement = readFirstRecord(canonical, "settlement");
  const publicInputs = readFirstRecord(
    canonical,
    "publicInputs",
    "public_inputs",
  );
  const blockers = readFirstArray(sourceProofRequest, "blockers");
  const submissionBlockers = readFirstArray(
    sourceBurnSubmissionReport,
    "blockers",
  );
  const blockerIds = Array.from(
    new Set(
      [
        ...(sourceBurnSubmissionReport.submitted === true
          ? []
          : ["source-burn-submission"]),
        ...submissionBlockers.map((blocker) => readFirstString(blocker, "id")),
        ...blockers.map((blocker) => readFirstString(blocker, "id")),
      ].filter(Boolean),
    ),
  );
  const messageId = readFirstString(canonical, "messageId", "message_id");
  const commitmentRoot = readFirstString(
    canonical,
    "commitmentRoot",
    "commitment_root",
  );
  const payloadHash = readFirstString(canonical, "payloadHash", "payload_hash");
  const ready =
    schemaOk &&
    sourceBurnSubmissionReport.submitted === true &&
    sourceBurnSubmissionReport.sourceProofRequestReady === true &&
    sourceProofRequest?.readyForSourceProof === true &&
    sourceProofRequest?.canonicalTransferReady === true &&
    sourceProofRequest?.productionProof === false &&
    sourceProofRequest?.proofPackageIncluded === false &&
    blockers.length === 0 &&
    isHex32(messageId) &&
    isHex32(commitmentRoot) &&
    isHex32(payloadHash) &&
    messageBundle?.finalityProof === null &&
    settlement?.entrypoint === "finalize_inbound" &&
    settlement?.route === SCCP_SOLANA_XOR_ROUTE_ID &&
    settlement?.asset === SCCP_XOR_ASSET_KEY &&
    publicInputs?.routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
    publicInputs?.asset === SCCP_XOR_ASSET_KEY;
  return makeCheck(
    "source-burn-proof-request-ready",
    ready,
    ready
      ? "Solana source burn is bound to a canonical TAIRA finalize_inbound proof request scaffold."
      : "Solana source-burn proof request scaffold is missing or incomplete.",
    {
      sourceBurnSubmissionPath,
      schemaOk,
      submitted: sourceBurnSubmissionReport.submitted === true,
      sourceProofRequestReady:
        sourceBurnSubmissionReport.sourceProofRequestReady === true,
      readyForSourceProof: sourceProofRequest?.readyForSourceProof === true,
      canonicalTransferReady:
        sourceProofRequest?.canonicalTransferReady === true,
      productionProof: sourceProofRequest?.productionProof === true,
      proofPackageIncluded: sourceProofRequest?.proofPackageIncluded === true,
      messageId: messageId || null,
      commitmentRoot: commitmentRoot || null,
      payloadHash: payloadHash || null,
      finalityProofIncluded:
        isRecord(messageBundle) && messageBundle.finalityProof !== null,
      settlement,
      publicInputs,
      blockerIds,
    },
  );
};

export const checkSourceBurnArtifactConsistency = ({
  sourceBurnReadinessReport,
  sourceBurnReadinessPath = null,
  sourceBurnSubmissionReport,
  sourceBurnSubmissionPath = null,
} = {}) => {
  const mismatches = [];
  const compare = ({ id, expected, actual, detail }) => {
    const normalizedExpected = trimString(expected);
    const normalizedActual = trimString(actual);
    if (!normalizedExpected || !normalizedActual) {
      mismatches.push({
        id,
        detail,
        expected: normalizedExpected || null,
        actual: normalizedActual || null,
        reason: !normalizedExpected ? "missing-expected" : "missing-actual",
      });
      return;
    }
    if (normalizedExpected !== normalizedActual) {
      mismatches.push({
        id,
        detail,
        expected: normalizedExpected,
        actual: normalizedActual,
      });
    }
  };
  const compareWhenPresent = ({ id, expected, actual, detail }) => {
    const normalizedExpected = trimString(expected);
    const normalizedActual = trimString(actual);
    if (!normalizedExpected && !normalizedActual) {
      return;
    }
    compare({ id, expected, actual, detail });
  };
  if (!isRecord(sourceBurnReadinessReport)) {
    mismatches.push({
      id: "source-burn-readiness",
      detail: "No Solana source-burn readiness artifact is available.",
      sourcePath: sourceBurnReadinessPath,
    });
  }
  if (!isRecord(sourceBurnSubmissionReport)) {
    mismatches.push({
      id: "source-burn-submission",
      detail: "No Solana source-burn submission artifact is available.",
      sourcePath: sourceBurnSubmissionPath,
    });
  }
  const readinessSchemaOk =
    sourceBurnReadinessReport?.schema ===
    "iroha-demo-sccp-solana-source-burn-readiness/v1";
  const submissionSchemaOk =
    sourceBurnSubmissionReport?.schema ===
    "iroha-demo-sccp-solana-source-burn-submission/v1";
  const readinessReady = sourceBurnReadinessReport?.readyToSubmitBurn === true;
  const submissionReady = sourceBurnSubmissionReport?.submitted === true;
  const readinessBlockers = readFirstArray(
    sourceBurnReadinessReport,
    "blockers",
  );
  const readinessBlockerIds = readinessBlockers
    .map((blocker) => readFirstString(blocker, "id"))
    .filter(Boolean);
  const submissionBlockers = readFirstArray(
    sourceBurnSubmissionReport,
    "blockers",
  );
  const submissionBlockerIds = submissionBlockers
    .map((blocker) => readFirstString(blocker, "id"))
    .filter(Boolean);
  const postBurnConsumedReadinessBlockerIds = new Set(readinessBlockerIds);
  const postBurnConsumedReadiness =
    isRecord(sourceBurnReadinessReport) &&
    !readinessReady &&
    submissionReady &&
    postBurnConsumedReadinessBlockerIds.size === 2 &&
    ["token-mint-supply", "source-token-balance"].every((id) =>
      postBurnConsumedReadinessBlockerIds.has(id),
    );
  const blockedPreBurnReadiness =
    isRecord(sourceBurnReadinessReport) &&
    isRecord(sourceBurnSubmissionReport) &&
    !readinessReady &&
    !submissionReady &&
    readFirstString(sourceBurnSubmissionReport, "reason") ===
      "source-burn-readiness-failed";
  if (isRecord(sourceBurnReadinessReport) && !readinessSchemaOk) {
    mismatches.push({
      id: "readiness-schema",
      detail: "Solana source-burn readiness artifact schema is not canonical.",
      actual: sourceBurnReadinessReport.schema ?? null,
    });
  }
  if (isRecord(sourceBurnSubmissionReport) && !submissionSchemaOk) {
    mismatches.push({
      id: "submission-schema",
      detail: "Solana source-burn submission artifact schema is not canonical.",
      actual: sourceBurnSubmissionReport.schema ?? null,
    });
  }
  if (
    isRecord(sourceBurnReadinessReport) &&
    !readinessReady &&
    !postBurnConsumedReadiness &&
    !blockedPreBurnReadiness
  ) {
    mismatches.push({
      id: "readiness-state",
      detail: "Solana source-burn readiness artifact is not ready.",
      actual: sourceBurnReadinessReport.readyToSubmitBurn === true,
    });
  }
  if (
    isRecord(sourceBurnSubmissionReport) &&
    !submissionReady &&
    !blockedPreBurnReadiness
  ) {
    mismatches.push({
      id: "submission-state",
      detail: "Solana source-burn submission artifact is not submitted.",
      actual: sourceBurnSubmissionReport.submitted === true,
    });
  }

  const selectedSourceToken = readFirstRecord(
    sourceBurnReadinessReport,
    "selectedSourceToken",
    "selected_source_token",
  );
  const readinessDeployment = readFirstRecord(
    sourceBurnReadinessReport,
    "deployment",
  );
  const readinessTokenAccounts = readFirstArray(
    sourceBurnReadinessReport,
    "tokenAccounts",
    "token_accounts",
  );
  const sourceProofRequest = readFirstRecord(
    sourceBurnSubmissionReport,
    "sourceProofRequest",
    "source_proof_request",
  );
  const sourceBurn = readFirstRecord(
    sourceProofRequest,
    "sourceBurn",
    "source_burn",
  );
  const canonical = readFirstRecord(sourceProofRequest, "canonical");
  const transferPayload = readFirstRecord(
    canonical,
    "transferPayload",
    "transfer_payload",
  );
  const publicInputs = readFirstRecord(
    canonical,
    "publicInputs",
    "public_inputs",
  );
  const expectedSourceTokenAddress =
    readFirstString(selectedSourceToken, "address") ||
    (postBurnConsumedReadiness
      ? readFirstString(sourceBurnSubmissionReport, "sourceTokenAddress")
      : "");
  const expectedTairaRecipient =
    readFirstString(sourceBurnReadinessReport, "tairaRecipient") ||
    (postBurnConsumedReadiness
      ? readFirstString(sourceBurnSubmissionReport, "tairaRecipient")
      : "");
  const expectedNonce =
    readFirstString(sourceBurnReadinessReport, "nonce") ||
    (postBurnConsumedReadiness
      ? readFirstString(sourceBurnSubmissionReport, "nonce")
      : "");
  const postBurnConsumedTokenAccount = postBurnConsumedReadiness
    ? readinessTokenAccounts.find(
        (account) =>
          readFirstString(account, "address") ===
          readFirstString(sourceBurnSubmissionReport, "sourceTokenAddress"),
      )
    : null;

  if (blockedPreBurnReadiness) {
    compare({
      id: "owner-address",
      expected: readFirstString(sourceBurnReadinessReport, "ownerAddress"),
      actual: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
      detail:
        "Blocked source-burn submission owner does not match the readiness owner.",
    });
    const selectedTokenAddress = readFirstString(
      selectedSourceToken,
      "address",
    );
    if (
      selectedTokenAddress ||
      readFirstString(sourceBurnSubmissionReport, "sourceTokenAddress")
    ) {
      compare({
        id: "source-token-address",
        expected: selectedTokenAddress,
        actual: readFirstString(
          sourceBurnSubmissionReport,
          "sourceTokenAddress",
        ),
        detail:
          "Blocked source-burn submission token account does not match the readiness-selected token account.",
      });
    }
    compare({
      id: "amount-base-units",
      expected: readFirstString(sourceBurnReadinessReport, "amountBaseUnits"),
      actual: readFirstString(sourceBurnSubmissionReport, "amountBaseUnits"),
      detail:
        "Blocked source-burn submission amount does not match the readiness amount.",
    });
    compareWhenPresent({
      id: "taira-recipient",
      expected: readFirstString(sourceBurnReadinessReport, "tairaRecipient"),
      actual: readFirstString(sourceBurnSubmissionReport, "tairaRecipient"),
      detail:
        "Blocked source-burn submission TAIRA recipient does not match the readiness recipient.",
    });
    compareWhenPresent({
      id: "nonce",
      expected: readFirstString(sourceBurnReadinessReport, "nonce"),
      actual: readFirstString(sourceBurnSubmissionReport, "nonce"),
      detail:
        "Blocked source-burn submission nonce does not match the readiness nonce.",
    });
    compare({
      id: "token-mint",
      expected: readFirstString(readinessDeployment, "tokenMintAddress"),
      actual: readFirstString(sourceBurnSubmissionReport, "tokenMintAddress"),
      detail:
        "Blocked source-burn submission token mint does not match readiness deployment evidence.",
    });
    compare({
      id: "source-bridge",
      expected: readFirstString(readinessDeployment, "sourceBridgeProgramId"),
      actual: readFirstString(
        sourceBurnSubmissionReport,
        "sourceBridgeProgramId",
      ),
      detail:
        "Blocked source-burn submission source bridge does not match readiness deployment evidence.",
    });
    compare({
      id: "source-state",
      expected: readFirstString(readinessDeployment, "sourceStateAddress"),
      actual: readFirstString(sourceBurnSubmissionReport, "sourceStateAddress"),
      detail:
        "Blocked source-burn submission source state does not match readiness deployment evidence.",
    });
    const readinessBlockerSet = new Set(readinessBlockerIds);
    const submissionBlockerSet = new Set(submissionBlockerIds);
    const missingSubmissionBlockerIds = readinessBlockerIds.filter(
      (id) => !submissionBlockerSet.has(id),
    );
    const extraSubmissionBlockerIds = submissionBlockerIds.filter(
      (id) => !readinessBlockerSet.has(id),
    );
    if (
      readinessBlockerIds.length === 0 ||
      missingSubmissionBlockerIds.length > 0 ||
      extraSubmissionBlockerIds.length > 0
    ) {
      mismatches.push({
        id: "blocked-source-burn-blockers",
        detail:
          "Blocked source-burn submission blockers must match the readiness blockers.",
        readinessBlockerIds,
        submissionBlockerIds,
        missingSubmissionBlockerIds,
        extraSubmissionBlockerIds,
      });
    }
    if (sourceBurnSubmissionReport.sourceProofRequestReady === true) {
      mismatches.push({
        id: "blocked-source-proof-ready",
        detail:
          "Blocked source-burn submission must not claim a source-proof request is ready.",
        actual: true,
      });
    }
    if (isRecord(sourceProofRequest)) {
      mismatches.push({
        id: "blocked-source-proof-request",
        detail:
          "Blocked source-burn submission must not carry a source-proof request before a burn is submitted.",
      });
    }
    const ok = mismatches.length === 0;
    return makeCheck(
      "source-burn-artifact-consistency",
      ok,
      ok
        ? "Solana source-burn readiness and blocked submission consistently show that no real burn can be submitted yet."
        : "Solana source-burn readiness and blocked submission artifact disagree.",
      {
        sourceBurnReadinessPath,
        sourceBurnSubmissionPath,
        blockedPreBurnReadiness: true,
        postBurnConsumedReadiness: false,
        blockerIds: readinessBlockerIds,
        comparedFields: {
          ownerAddress: readFirstString(
            sourceBurnSubmissionReport,
            "ownerAddress",
          ),
          sourceTokenAddress: readFirstString(
            sourceBurnSubmissionReport,
            "sourceTokenAddress",
          ),
          amountBaseUnits: readFirstString(
            sourceBurnSubmissionReport,
            "amountBaseUnits",
          ),
          tairaRecipient: readFirstString(
            sourceBurnSubmissionReport,
            "tairaRecipient",
          ),
          nonce: readFirstString(sourceBurnSubmissionReport, "nonce"),
          tokenMintAddress: readFirstString(
            sourceBurnSubmissionReport,
            "tokenMintAddress",
          ),
          sourceBridgeProgramId: readFirstString(
            sourceBurnSubmissionReport,
            "sourceBridgeProgramId",
          ),
          sourceStateAddress: readFirstString(
            sourceBurnSubmissionReport,
            "sourceStateAddress",
          ),
        },
        mismatches,
      },
    );
  }

  if (postBurnConsumedReadiness) {
    if (!postBurnConsumedTokenAccount) {
      mismatches.push({
        id: "post-burn-consumed-token-account",
        detail:
          "Post-burn readiness must still include the submitted token account with zero balance.",
        expected: readFirstString(
          sourceBurnSubmissionReport,
          "sourceTokenAddress",
        ),
        actual: readinessTokenAccounts
          .map((account) => readFirstString(account, "address"))
          .filter(Boolean),
      });
    } else {
      compare({
        id: "post-burn-consumed-token-owner",
        expected: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
        actual: readFirstString(postBurnConsumedTokenAccount, "owner"),
        detail:
          "Post-burn readiness token account owner must match the submitted burn owner.",
      });
      compare({
        id: "post-burn-consumed-token-mint",
        expected: readFirstString(readinessDeployment, "tokenMintAddress"),
        actual: readFirstString(postBurnConsumedTokenAccount, "mint"),
        detail:
          "Post-burn readiness token account mint must match deployment evidence.",
      });
      compare({
        id: "post-burn-consumed-token-amount",
        expected: "0",
        actual: readFirstString(postBurnConsumedTokenAccount, "amount"),
        detail:
          "Post-burn readiness token account must show the submitted source token was consumed.",
      });
    }
  }

  compare({
    id: "owner-address",
    expected: readFirstString(sourceBurnReadinessReport, "ownerAddress"),
    actual: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
    detail: "Source-burn submission owner does not match the readiness owner.",
  });
  compare({
    id: "source-token-address",
    expected: expectedSourceTokenAddress,
    actual: readFirstString(sourceBurnSubmissionReport, "sourceTokenAddress"),
    detail:
      "Source-burn submission token account does not match the readiness-selected token account.",
  });
  compare({
    id: "amount-base-units",
    expected: readFirstString(sourceBurnReadinessReport, "amountBaseUnits"),
    actual: readFirstString(sourceBurnSubmissionReport, "amountBaseUnits"),
    detail:
      "Source-burn submission amount does not match the readiness amount.",
  });
  compare({
    id: "taira-recipient",
    expected: expectedTairaRecipient,
    actual: readFirstString(sourceBurnSubmissionReport, "tairaRecipient"),
    detail:
      "Source-burn submission TAIRA recipient does not match the readiness recipient.",
  });
  compare({
    id: "nonce",
    expected: expectedNonce,
    actual: readFirstString(sourceBurnSubmissionReport, "nonce"),
    detail: "Source-burn submission nonce does not match the readiness nonce.",
  });
  compare({
    id: "source-burn-signature",
    expected: readFirstString(sourceBurnSubmissionReport, "signature"),
    actual: readFirstString(sourceBurn, "signature"),
    detail:
      "Source-proof request signature does not match the submitted Solana burn.",
  });
  compare({
    id: "source-burn-owner",
    expected: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
    actual: readFirstString(sourceBurn, "ownerAddress"),
    detail:
      "Source-proof request owner does not match the submitted Solana burn.",
  });
  compare({
    id: "source-burn-token",
    expected: readFirstString(sourceBurnSubmissionReport, "sourceTokenAddress"),
    actual: readFirstString(sourceBurn, "sourceTokenAddress"),
    detail:
      "Source-proof request token account does not match the submitted Solana burn.",
  });
  compare({
    id: "source-burn-token-mint",
    expected:
      readFirstString(selectedSourceToken, "mint") ||
      readFirstString(readinessDeployment, "tokenMintAddress"),
    actual: readFirstString(sourceBurn, "tokenMintAddress"),
    detail:
      "Source-proof request token mint does not match readiness/deployment evidence.",
  });
  compare({
    id: "source-burn-source-bridge",
    expected: readFirstString(readinessDeployment, "sourceBridgeProgramId"),
    actual: readFirstString(sourceBurn, "sourceBridgeProgramId"),
    detail:
      "Source-proof request source bridge program does not match readiness deployment evidence.",
  });
  compare({
    id: "source-burn-source-state",
    expected: readFirstString(readinessDeployment, "sourceStateAddress"),
    actual: readFirstString(sourceBurn, "sourceStateAddress"),
    detail:
      "Source-proof request source state account does not match readiness deployment evidence.",
  });
  compare({
    id: "source-burn-amount",
    expected: readFirstString(sourceBurnSubmissionReport, "amountBaseUnits"),
    actual: readFirstString(sourceBurn, "amountBaseUnits"),
    detail:
      "Source-proof request amount does not match the submitted Solana burn.",
  });
  compare({
    id: "source-burn-recipient",
    expected: readFirstString(sourceBurnSubmissionReport, "tairaRecipient"),
    actual: readFirstString(sourceBurn, "tairaRecipient"),
    detail:
      "Source-proof request TAIRA recipient does not match the submitted Solana burn.",
  });
  compare({
    id: "source-burn-nonce",
    expected: readFirstString(sourceBurnSubmissionReport, "nonce"),
    actual: readFirstString(sourceBurn, "nonce"),
    detail:
      "Source-proof request nonce does not match the submitted Solana burn.",
  });
  compare({
    id: "canonical-route",
    expected: SCCP_SOLANA_XOR_ROUTE_ID,
    actual: readFirstString(transferPayload, "route_id", "routeId"),
    detail: "Canonical transfer payload route does not match taira_sol_xor.",
  });
  compare({
    id: "canonical-asset",
    expected: SCCP_XOR_ASSET_KEY,
    actual: readFirstString(transferPayload, "asset_id", "assetId"),
    detail: "Canonical transfer payload asset does not match XOR.",
  });
  compare({
    id: "canonical-sender",
    expected: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
    actual: readFirstString(transferPayload, "sender"),
    detail:
      "Canonical transfer sender does not match the submitted Solana burn owner.",
  });
  compare({
    id: "canonical-recipient",
    expected: readFirstString(sourceBurnSubmissionReport, "tairaRecipient"),
    actual: readFirstString(transferPayload, "recipient"),
    detail:
      "Canonical transfer recipient does not match the submitted TAIRA recipient.",
  });
  compare({
    id: "canonical-amount",
    expected: readFirstString(sourceBurnSubmissionReport, "amountBaseUnits"),
    actual: readFirstString(transferPayload, "amount"),
    detail:
      "Canonical transfer amount does not match the submitted Solana burn.",
  });
  compare({
    id: "canonical-nonce",
    expected: readFirstString(sourceBurnSubmissionReport, "nonce"),
    actual: readFirstString(transferPayload, "nonce"),
    detail:
      "Canonical transfer nonce does not match the submitted Solana burn.",
  });
  compare({
    id: "public-input-route",
    expected: SCCP_SOLANA_XOR_ROUTE_ID,
    actual: readFirstString(publicInputs, "routeId", "route_id"),
    detail: "Source-proof public inputs route does not match taira_sol_xor.",
  });
  compare({
    id: "public-input-asset",
    expected: SCCP_XOR_ASSET_KEY,
    actual: readFirstString(publicInputs, "asset"),
    detail: "Source-proof public inputs asset does not match XOR.",
  });
  compare({
    id: "public-input-tx",
    expected: readFirstString(sourceBurnSubmissionReport, "signature"),
    actual: readFirstString(publicInputs, "txId", "tx_id"),
    detail:
      "Source-proof public inputs transaction id does not match the submitted Solana burn.",
  });
  compare({
    id: "public-input-sender",
    expected: readFirstString(sourceBurnSubmissionReport, "ownerAddress"),
    actual: readFirstString(publicInputs, "solanaSender", "solana_sender"),
    detail:
      "Source-proof public inputs sender does not match the submitted Solana burn owner.",
  });
  compare({
    id: "public-input-recipient",
    expected: readFirstString(sourceBurnSubmissionReport, "tairaRecipient"),
    actual: readFirstString(publicInputs, "tairaRecipient", "taira_recipient"),
    detail:
      "Source-proof public inputs recipient does not match the submitted TAIRA recipient.",
  });
  compare({
    id: "public-input-amount",
    expected: readFirstString(sourceBurnSubmissionReport, "amountBaseUnits"),
    actual: readFirstString(
      publicInputs,
      "amountBaseUnits",
      "amount_base_units",
    ),
    detail:
      "Source-proof public inputs amount does not match the submitted Solana burn.",
  });
  compare({
    id: "public-input-message-id",
    expected: readFirstString(canonical, "messageId", "message_id"),
    actual: readFirstString(publicInputs, "messageId", "message_id"),
    detail:
      "Source-proof public inputs message id does not match the canonical message id.",
  });
  compare({
    id: "public-input-commitment-root",
    expected: readFirstString(canonical, "commitmentRoot", "commitment_root"),
    actual: readFirstString(publicInputs, "commitmentRoot", "commitment_root"),
    detail:
      "Source-proof public inputs commitment root does not match the canonical commitment root.",
  });

  const proofBlockers = readFirstArray(sourceProofRequest, "blockers");
  const blockerIds = [
    ...(postBurnConsumedReadiness
      ? []
      : readinessBlockers.map((blocker) => readFirstString(blocker, "id"))),
    ...proofBlockers.map((blocker) => readFirstString(blocker, "id")),
  ].filter(Boolean);
  if (blockerIds.length > 0) {
    mismatches.push({
      id: "source-burn-blockers",
      detail:
        "Source-burn readiness or source-proof request still carries blockers.",
      blockerIds,
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "source-burn-artifact-consistency",
    ok,
    ok
      ? "Solana source-burn readiness, submitted burn, canonical transfer payload, and source-proof public inputs all reference the same transfer."
      : "Solana source-burn readiness, submission, and source-proof scaffold reference different transfer evidence.",
    {
      sourceBurnReadinessPath,
      sourceBurnSubmissionPath,
      postBurnConsumedReadiness,
      comparedFields: {
        ownerAddress: readFirstString(
          sourceBurnSubmissionReport,
          "ownerAddress",
        ),
        sourceTokenAddress: readFirstString(
          sourceBurnSubmissionReport,
          "sourceTokenAddress",
        ),
        amountBaseUnits: readFirstString(
          sourceBurnSubmissionReport,
          "amountBaseUnits",
        ),
        tairaRecipient: readFirstString(
          sourceBurnSubmissionReport,
          "tairaRecipient",
        ),
        nonce: readFirstString(sourceBurnSubmissionReport, "nonce"),
        signature: readFirstString(sourceBurnSubmissionReport, "signature"),
        messageId: readFirstString(canonical, "messageId", "message_id"),
        commitmentRoot: readFirstString(
          canonical,
          "commitmentRoot",
          "commitment_root",
        ),
      },
      mismatches,
    },
  );
};

export const checkProofMaterialBundleReady = ({
  proofMaterialBundleReport,
  proofMaterialBundlePath = null,
} = {}) => {
  if (!isRecord(proofMaterialBundleReport)) {
    return makeCheck(
      "proof-material-bundle-ready",
      false,
      "No Solana proof-material bundle manifest is available.",
      { proofMaterialBundlePath },
    );
  }
  const schemaOk =
    proofMaterialBundleReport.schema ===
    "iroha-demo-sccp-solana-proof-material-bundle/v1";
  const routeOk =
    readFirstString(proofMaterialBundleReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const artifacts = readFirstArray(proofMaterialBundleReport, "artifacts");
  const blockers = readFirstArray(proofMaterialBundleReport, "blockers");
  const requiredArtifactsMissing = artifacts.filter(
    (artifact) =>
      artifact?.required === true && artifact?.status !== "included",
  );
  const ready =
    schemaOk &&
    routeOk &&
    proofMaterialBundleReport.readyForProofMaterialCeremony === true &&
    proofMaterialBundleReport.productionProofMaterialIncluded === false &&
    blockers.length === 0 &&
    requiredArtifactsMissing.length === 0;
  return makeCheck(
    "proof-material-bundle-ready",
    ready,
    ready
      ? "Solana proof-material handoff bundle is hash-indexed and ready for the governed ceremony."
      : "Solana proof-material handoff bundle is missing or incomplete.",
    {
      proofMaterialBundlePath,
      schemaOk,
      routeOk,
      readyForProofMaterialCeremony:
        proofMaterialBundleReport.readyForProofMaterialCeremony === true,
      productionRouteReady:
        proofMaterialBundleReport.productionRouteReady === true,
      productionProofMaterialIncluded:
        proofMaterialBundleReport.productionProofMaterialIncluded === true,
      readyToSubmitWithCurrentRuntime:
        proofMaterialBundleReport.readyToSubmitWithCurrentRuntime === true,
      bundleManifestSha256:
        proofMaterialBundleReport.bundleManifestSha256 ?? null,
      includedArtifactCount:
        proofMaterialBundleReport.includedArtifactCount ?? artifacts.length,
      browserProverModules: readFirstArray(
        readFirstRecord(proofMaterialBundleReport, "proofMaterialRequest"),
        "browserProverModules",
        "browser_prover_modules",
      ),
      requiredArtifactsMissing: requiredArtifactsMissing.map((artifact) => ({
        id: artifact.id ?? null,
        status: artifact.status ?? null,
        error: artifact.error ?? null,
      })),
      blockers,
      upstreamBlockerIds: readFirstArray(
        proofMaterialBundleReport,
        "upstreamBlockerIds",
        "upstream_blocker_ids",
      ),
    },
  );
};

export const checkProofMaterialBundleArtifactConsistency = ({
  proofMaterialBundleReport,
  proofMaterialBundlePath = null,
  proofMaterialRequestReport = null,
  proofMaterialRequestPath = null,
} = {}) => {
  if (!isRecord(proofMaterialBundleReport)) {
    return makeCheck(
      "proof-material-bundle-artifact-consistency",
      false,
      "No Solana proof-material bundle is available for artifact consistency checks.",
      { proofMaterialBundlePath },
    );
  }
  if (!isRecord(proofMaterialRequestReport)) {
    return makeCheck(
      "proof-material-bundle-artifact-consistency",
      false,
      "No direct Solana proof-material request is available for bundle consistency checks.",
      { proofMaterialBundlePath, proofMaterialRequestPath },
    );
  }
  const embeddedRequest = readFirstRecord(
    proofMaterialBundleReport,
    "proofMaterialRequest",
    "proof_material_request",
  );
  const expected = proofMaterialRequestSnapshot(proofMaterialRequestReport);
  const observed = proofMaterialRequestSnapshot(embeddedRequest, {
    embedded: true,
  });
  const mismatches = [];
  for (const field of [
    "readyForProofMaterialCeremony",
    "productionRouteReady",
    "readyToSubmitWithCurrentRuntime",
    "publicRouteAlreadyPublished",
    "productionProofMaterialIncluded",
    "observedPins",
    "browserProverModules",
    "blockerIds",
  ]) {
    const expectedValue = stableJsonString(expected[field]);
    const observedValue = stableJsonString(observed[field]);
    if (expectedValue !== observedValue) {
      mismatches.push({
        id: "proof-material-request",
        field,
        expected: expectedValue,
        observed: observedValue,
        sourcePath: proofMaterialRequestPath,
        detail:
          "Proof-material bundle request snapshot does not match the direct proof-material request package.",
      });
    }
  }
  const upstreamBlockerIds = blockerIdSnapshot(
    readFirstArray(
      proofMaterialBundleReport,
      "upstreamBlockerIds",
      "upstream_blocker_ids",
    ),
  );
  const expectedUpstreamBlockerIds = reportBlockerIds(
    proofMaterialRequestReport,
  );
  if (
    stableJsonString(upstreamBlockerIds) !==
    stableJsonString(expectedUpstreamBlockerIds)
  ) {
    mismatches.push({
      id: "proof-material-bundle",
      field: "upstreamBlockerIds",
      expected: stableJsonString(expectedUpstreamBlockerIds),
      observed: stableJsonString(upstreamBlockerIds),
      sourcePath: proofMaterialRequestPath,
      detail:
        "Proof-material bundle upstream blockers do not match the direct proof-material request package.",
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "proof-material-bundle-artifact-consistency",
    ok,
    ok
      ? "Solana proof-material bundle references the current proof-material request package."
      : "Solana proof-material bundle references a stale or mismatched proof-material request package.",
    {
      proofMaterialBundlePath,
      proofMaterialRequestPath,
      bundleManifestSha256:
        proofMaterialBundleReport.bundleManifestSha256 ?? null,
      mismatches,
    },
  );
};

export const checkProofMaterialCeremonyPackageReady = ({
  proofMaterialCeremonyPackageReport,
  proofMaterialCeremonyPackagePath = null,
} = {}) => {
  if (!isRecord(proofMaterialCeremonyPackageReport)) {
    return makeCheck(
      "proof-material-ceremony-package-ready",
      false,
      "No Solana proof-material ceremony package is available.",
      { proofMaterialCeremonyPackagePath },
    );
  }
  const schemaOk =
    proofMaterialCeremonyPackageReport.schema ===
    "iroha-demo-sccp-solana-proof-material-ceremony-package/v1";
  const routeOk =
    readFirstString(
      proofMaterialCeremonyPackageReport,
      "routeId",
      "route_id",
    ) === SCCP_SOLANA_XOR_ROUTE_ID;
  const ceremonyPackageHash = readFirstString(
    proofMaterialCeremonyPackageReport,
    "ceremonyPackageHash",
    "ceremony_package_hash",
    "stableHash",
    "stable_hash",
  );
  const sourceBurnProofRequest = readFirstRecord(
    proofMaterialCeremonyPackageReport,
    "sourceBurnProofRequest",
    "source_burn_proof_request",
  );
  const reviewBlockers = readFirstArray(
    proofMaterialCeremonyPackageReport,
    "reviewBlockers",
    "review_blockers",
  );
  const blockers = readFirstArray(
    proofMaterialCeremonyPackageReport,
    "blockers",
  );
  const artifacts = readFirstRecord(
    proofMaterialCeremonyPackageReport,
    "artifacts",
  );
  const proofMaterialBundle = readFirstRecord(
    artifacts,
    "proofMaterialBundle",
    "proof_material_bundle",
  );
  const sourceBurnSubmission = readFirstRecord(
    artifacts,
    "sourceBurnSubmission",
    "source_burn_submission",
  );
  const ready =
    schemaOk &&
    routeOk &&
    proofMaterialCeremonyPackageReport.readyForCeremonyReview === true &&
    proofMaterialCeremonyPackageReport.readyForProofMaterialCeremony === true &&
    /^0x[0-9a-f]{64}$/u.test(ceremonyPackageHash) &&
    sourceBurnProofRequest?.readyForSourceProof === true &&
    sourceBurnProofRequest?.canonicalTransferReady === true &&
    sourceBurnProofRequest?.proofPackageIncluded !== true &&
    reviewBlockers.length === 0 &&
    proofMaterialBundle?.ready === true &&
    sourceBurnSubmission?.ready === true;
  return makeCheck(
    "proof-material-ceremony-package-ready",
    ready,
    ready
      ? "Solana proof-material ceremony package is hash-indexed and ready for governed review."
      : "Solana proof-material ceremony package is missing, stale, or not review-ready.",
    {
      proofMaterialCeremonyPackagePath,
      schemaOk,
      routeOk,
      readyForCeremonyReview:
        proofMaterialCeremonyPackageReport.readyForCeremonyReview === true,
      readyForProofMaterialCeremony:
        proofMaterialCeremonyPackageReport.readyForProofMaterialCeremony ===
        true,
      productionRouteReady:
        proofMaterialCeremonyPackageReport.productionRouteReady === true,
      productionProofMaterialIncluded:
        proofMaterialCeremonyPackageReport.productionProofMaterialIncluded ===
        true,
      readyToSubmitWithCurrentRuntime:
        proofMaterialCeremonyPackageReport.readyToSubmitWithCurrentRuntime ===
        true,
      ceremonyPackageHash: ceremonyPackageHash || null,
      sourceBurnProofRequest: sourceBurnProofRequest
        ? {
            readyForSourceProof:
              sourceBurnProofRequest.readyForSourceProof === true,
            canonicalTransferReady:
              sourceBurnProofRequest.canonicalTransferReady === true,
            proofPackageIncluded:
              sourceBurnProofRequest.proofPackageIncluded === true,
            messageId: sourceBurnProofRequest.messageId ?? null,
            commitmentRoot: sourceBurnProofRequest.commitmentRoot ?? null,
            payloadHash: sourceBurnProofRequest.payloadHash ?? null,
          }
        : null,
      proofMaterialBundle: proofMaterialBundle
        ? {
            ready: proofMaterialBundle.ready === true,
            stableHash: proofMaterialBundle.stableHash ?? null,
            blockerIds: readFirstArray(
              proofMaterialBundle,
              "blockerIds",
              "blocker_ids",
            ),
          }
        : null,
      sourceBurnSubmission: sourceBurnSubmission
        ? {
            ready: sourceBurnSubmission.ready === true,
            stableHash: sourceBurnSubmission.stableHash ?? null,
            blockerIds: readFirstArray(
              sourceBurnSubmission,
              "blockerIds",
              "blocker_ids",
            ),
          }
        : null,
      reviewBlockerIds: reviewBlockers.map((blocker) =>
        readFirstString(blocker, "id"),
      ),
      blockerIds: blockers.map((blocker) => readFirstString(blocker, "id")),
    },
  );
};

export const checkProofMaterialCeremonyArtifactConsistency = ({
  proofMaterialCeremonyPackageReport,
  proofMaterialCeremonyPackagePath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  sourceMaterialHandoffReport = null,
  sourceMaterialHandoffPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
  sourceBurnSubmissionReport = null,
  sourceBurnSubmissionPath = null,
} = {}) => {
  if (!isRecord(proofMaterialCeremonyPackageReport)) {
    return makeCheck(
      "proof-material-ceremony-artifact-consistency",
      false,
      "No Solana proof-material ceremony package is available for artifact consistency checks.",
      { proofMaterialCeremonyPackagePath },
    );
  }
  const artifacts = readFirstRecord(
    proofMaterialCeremonyPackageReport,
    "artifacts",
  );
  const sourceBurnProofRequest = readFirstRecord(
    proofMaterialCeremonyPackageReport,
    "sourceBurnProofRequest",
    "source_burn_proof_request",
  );
  const sourceProofRequest = readFirstRecord(
    sourceBurnSubmissionReport,
    "sourceProofRequest",
    "source_proof_request",
  );
  const canonical = readFirstRecord(sourceProofRequest, "canonical");
  const mismatches = [];
  const compareHash = ({ id, artifactKeys, expected, sourcePath, detail }) => {
    if (!expected) {
      return;
    }
    const observed = artifactStableHash(artifacts, ...artifactKeys);
    if (observed !== expected) {
      mismatches.push({
        id,
        detail,
        expected,
        observed: observed || null,
        sourcePath,
      });
    }
  };
  const compareField = ({ id, field, expected, observed, sourcePath }) => {
    if (!expected) {
      return;
    }
    if (observed !== expected) {
      mismatches.push({
        id,
        field,
        expected,
        observed: observed || null,
        sourcePath,
        detail:
          "Ceremony package source-burn proof request does not match the direct source-burn scaffold.",
      });
    }
  };
  const proofMaterialBundleHash = readFirstString(
    proofMaterialBundleReport,
    "bundleManifestSha256",
    "bundle_manifest_sha256",
    "stableHash",
    "stable_hash",
  );
  const sourceMaterialHandoffHash = isRecord(sourceMaterialHandoffReport)
    ? reviewSha256ForJson(sourceMaterialHandoffReport)
    : "";
  const handoffVerificationHash = isRecord(handoffVerificationReport)
    ? reviewSha256ForJson(handoffVerificationReport)
    : "";
  const sourceBurnMessageId = readFirstString(
    canonical,
    "messageId",
    "message_id",
  );
  compareHash({
    id: "source-material-handoff",
    artifactKeys: ["sourceMaterialHandoff", "source_material_handoff"],
    expected: sourceMaterialHandoffHash,
    sourcePath: sourceMaterialHandoffPath,
    detail:
      "Ceremony package source-material handoff hash does not match the direct handoff package.",
  });
  compareHash({
    id: "source-material-handoff-verification",
    artifactKeys: [
      "sourceMaterialHandoffVerification",
      "source_material_handoff_verification",
    ],
    expected: handoffVerificationHash,
    sourcePath: handoffVerificationPath,
    detail:
      "Ceremony package source-material handoff verification hash does not match the direct verification report.",
  });
  compareHash({
    id: "proof-material-bundle",
    artifactKeys: ["proofMaterialBundle", "proof_material_bundle"],
    expected: proofMaterialBundleHash,
    sourcePath: proofMaterialBundlePath,
    detail:
      "Ceremony package proof-material bundle hash does not match the direct bundle manifest.",
  });
  compareHash({
    id: "source-burn-submission",
    artifactKeys: ["sourceBurnSubmission", "source_burn_submission"],
    expected: sourceBurnMessageId,
    sourcePath: sourceBurnSubmissionPath,
    detail:
      "Ceremony package source-burn submission hash does not match the direct source-burn proof scaffold.",
  });
  for (const field of ["messageId", "commitmentRoot", "payloadHash"]) {
    compareField({
      id: "source-burn-proof-request",
      field,
      expected: readFirstString(
        canonical,
        field,
        field.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`),
      ),
      observed: readFirstString(
        sourceBurnProofRequest,
        field,
        field.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`),
      ),
      sourcePath: sourceBurnSubmissionPath,
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "proof-material-ceremony-artifact-consistency",
    ok,
    ok
      ? "Solana proof-material ceremony package references the current source-material handoff, proof bundle, and source-burn scaffold."
      : "Solana proof-material ceremony package references stale source-material handoff, proof bundle, or source-burn scaffold artifacts.",
    {
      proofMaterialCeremonyPackagePath,
      comparedArtifacts: {
        sourceMaterialHandoffPath,
        handoffVerificationPath,
        proofMaterialBundlePath,
        sourceBurnSubmissionPath,
      },
      ceremonyPackageHash:
        readFirstString(
          proofMaterialCeremonyPackageReport,
          "ceremonyPackageHash",
          "ceremony_package_hash",
          "stableHash",
          "stable_hash",
        ) || null,
      sourceMaterialHandoffHash: sourceMaterialHandoffHash || null,
      handoffVerificationHash: handoffVerificationHash || null,
      proofMaterialBundleHash: proofMaterialBundleHash || null,
      sourceBurnMessageId: sourceBurnMessageId || null,
      mismatches,
    },
  );
};

export const checkRoutePublicationRequestReady = ({
  routePublicationRequestReport,
  routePublicationRequestPath = null,
} = {}) => {
  if (!isRecord(routePublicationRequestReport)) {
    return makeCheck(
      "route-publication-request-ready",
      false,
      "No Solana route-publication request report is available.",
      { routePublicationRequestPath },
    );
  }
  const schemaOk =
    routePublicationRequestReport.schema ===
    "iroha-demo-sccp-solana-route-publication-request/v1";
  const routeOk =
    readFirstString(routePublicationRequestReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyForRouteManagerReview =
    routePublicationRequestReport.readyForRouteManagerReview === true;
  const reviewPackageHash = readFirstString(
    routePublicationRequestReport,
    "reviewPackageHash",
    "review_package_hash",
  );
  const manifest = readFirstRecord(routePublicationRequestReport, "manifest");
  const proofMaterialBundle = readFirstRecord(
    routePublicationRequestReport,
    "proofMaterialBundle",
    "proof_material_bundle",
  );
  const manifestReadyForPublication =
    manifest?.present === true &&
    manifest?.routeIdentityReady === true &&
    manifest?.productionReadyForIsi === true &&
    !readFirstString(manifest, "error");
  const ready =
    schemaOk &&
    routeOk &&
    readyForRouteManagerReview &&
    /^0x[0-9a-f]{64}$/u.test(reviewPackageHash) &&
    manifestReadyForPublication &&
    proofMaterialBundle?.readyForProofMaterialCeremony === true;
  return makeCheck(
    "route-publication-request-ready",
    ready,
    ready
      ? "Solana route-publication request is hash-indexed and ready for route-manager review."
      : "Solana route-publication request is missing or not ready for route-manager review.",
    {
      routePublicationRequestPath,
      schemaOk,
      routeOk,
      readyForRouteManagerReview,
      productionRouteReady:
        routePublicationRequestReport.productionRouteReady === true,
      readyToSubmitWithCurrentRuntime:
        routePublicationRequestReport.readyToSubmitWithCurrentRuntime === true,
      reviewPackageHash: reviewPackageHash || null,
      manifest: manifest
        ? {
            present: manifest.present === true,
            routeIdentityReady: manifest.routeIdentityReady === true,
            readyForPublication: manifestReadyForPublication,
            productionReadyForIsi: manifest.productionReadyForIsi === true,
            manifestSha256: manifest.manifestSha256 ?? null,
            error: manifest.error ?? null,
          }
        : null,
      proofMaterialBundle: proofMaterialBundle
        ? {
            readyForProofMaterialCeremony:
              proofMaterialBundle.readyForProofMaterialCeremony === true,
            bundleManifestSha256:
              proofMaterialBundle.bundleManifestSha256 ?? null,
            includedArtifactCount:
              proofMaterialBundle.includedArtifactCount ?? null,
          }
        : null,
      blockerIds: readFirstArray(routePublicationRequestReport, "blockers").map(
        (blocker) => readFirstString(blocker, "id"),
      ),
      upstreamBlockerIds: readFirstArray(
        routePublicationRequestReport,
        "upstreamBlockerIds",
        "upstream_blocker_ids",
      ),
    },
  );
};

export const checkRoutePublicationRequestArtifactConsistency = ({
  routePublicationRequestReport,
  routePublicationRequestPath = null,
  routeManifestReport = null,
  routeManifestPath = null,
  publishReadinessReport = null,
  publishReadinessPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
} = {}) => {
  if (!isRecord(routePublicationRequestReport)) {
    return makeCheck(
      "route-publication-request-artifact-consistency",
      false,
      "No Solana route-publication request is available for artifact consistency checks.",
      { routePublicationRequestPath },
    );
  }
  const manifest = readFirstRecord(routePublicationRequestReport, "manifest");
  const proofMaterialBundle = readFirstRecord(
    routePublicationRequestReport,
    "proofMaterialBundle",
    "proof_material_bundle",
  );
  const publishReadiness = readFirstRecord(
    routePublicationRequestReport,
    "publishReadiness",
    "publish_readiness",
  );
  const routeManifestIsi = readFirstRecord(
    publishReadinessReport,
    "routeManifestIsi",
    "route_manifest_isi",
  );
  const expectedManifestHash =
    (isRecord(routeManifestReport)
      ? sha256Hex(JSON.stringify(routeManifestReport))
      : "") ||
    readFirstString(routeManifestIsi, "manifestSha256", "manifest_sha256") ||
    readFirstString(
      publishReadinessReport,
      "manifestSha256",
      "manifest_sha256",
    );
  const observedManifestHash = readFirstString(
    manifest,
    "manifestSha256",
    "manifest_sha256",
  );
  const expectedProofBundleHash = readFirstString(
    proofMaterialBundleReport,
    "bundleManifestSha256",
    "bundle_manifest_sha256",
    "stableHash",
    "stable_hash",
  );
  const observedProofBundleHash = readFirstString(
    proofMaterialBundle,
    "bundleManifestSha256",
    "bundle_manifest_sha256",
    "stableHash",
    "stable_hash",
  );
  const directPublishReadinessSnapshot = isRecord(publishReadinessReport)
    ? publishReadinessConsistencySnapshot(publishReadinessReport)
    : null;
  const embeddedPublishReadinessSnapshot = isRecord(publishReadiness)
    ? publishReadinessConsistencySnapshot(publishReadiness)
    : null;
  const mismatches = [];
  const compare = ({ id, field, expected, observed, sourcePath, detail }) => {
    if (!expected) {
      return;
    }
    if (observed !== expected) {
      mismatches.push({
        id,
        field,
        expected,
        observed: observed || null,
        sourcePath,
        detail,
      });
    }
  };
  const compareSnapshotValue = ({
    id,
    field,
    expected,
    observed,
    sourcePath,
    detail,
  }) => {
    const expectedJson = JSON.stringify(stableJsonValue(expected ?? null));
    const observedJson = JSON.stringify(stableJsonValue(observed ?? null));
    if (expectedJson !== observedJson) {
      mismatches.push({
        id,
        field,
        expected: expectedJson,
        observed: observedJson,
        sourcePath,
        detail,
      });
    }
  };
  compare({
    id: "route-manifest",
    field: "manifestSha256",
    expected: expectedManifestHash,
    observed: observedManifestHash,
    sourcePath: routeManifestPath || publishReadinessPath,
    detail:
      "Route-publication request manifest hash does not match the current route manifest artifact.",
  });
  compare({
    id: "proof-material-bundle",
    field: "bundleManifestSha256",
    expected: expectedProofBundleHash,
    observed: observedProofBundleHash,
    sourcePath: proofMaterialBundlePath,
    detail:
      "Route-publication request proof-material bundle hash does not match the direct bundle manifest.",
  });
  if (directPublishReadinessSnapshot && !embeddedPublishReadinessSnapshot) {
    mismatches.push({
      id: "publish-readiness",
      field: "snapshot",
      expected: JSON.stringify(stableJsonValue(directPublishReadinessSnapshot)),
      observed: null,
      sourcePath: publishReadinessPath,
      detail:
        "Route-publication request is missing the direct publish-readiness snapshot.",
    });
  } else if (
    directPublishReadinessSnapshot &&
    embeddedPublishReadinessSnapshot
  ) {
    for (const field of [
      "readyForRuntimeSigner",
      "readyToSubmitWithCurrentRuntime",
      "endpointReady",
      "mcpTransactionToolsReady",
      "publicationMode",
      "routeManifestIsi",
      "runtimeSigning",
      "blockerIds",
    ]) {
      compareSnapshotValue({
        id: "publish-readiness",
        field,
        expected: directPublishReadinessSnapshot[field],
        observed: embeddedPublishReadinessSnapshot[field],
        sourcePath: publishReadinessPath,
        detail:
          "Route-publication request publish-readiness snapshot does not match the direct publish-readiness report.",
      });
    }
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "route-publication-request-artifact-consistency",
    ok,
    ok
      ? "Solana route-publication request references the current publish-readiness and proof-bundle artifacts."
      : "Solana route-publication request references stale manifest or proof-bundle artifacts.",
    {
      routePublicationRequestPath,
      comparedArtifacts: {
        routeManifestPath,
        publishReadinessPath,
        proofMaterialBundlePath,
      },
      reviewPackageHash:
        readFirstString(
          routePublicationRequestReport,
          "reviewPackageHash",
          "review_package_hash",
        ) || null,
      manifestSha256: observedManifestHash || null,
      expectedManifestSha256: expectedManifestHash || null,
      proofMaterialBundleHash: observedProofBundleHash || null,
      expectedProofMaterialBundleHash: expectedProofBundleHash || null,
      publishReadinessSnapshot: {
        expected: directPublishReadinessSnapshot,
        observed: embeddedPublishReadinessSnapshot,
      },
      mismatches,
    },
  );
};

const publishReadinessBlockedSnapshot = (report) => {
  const snapshot = publishReadinessConsistencySnapshot(report);
  return {
    endpointReady: snapshot.endpointReady,
    mcpTransactionToolsReady: snapshot.mcpTransactionToolsReady,
    publicationMode: snapshot.publicationMode,
    routeManifestIsi: snapshot.routeManifestIsi,
    runtimeSigning: snapshot.runtimeSigning,
    blockerIds: snapshot.blockerIds,
  };
};

export const checkRoutePublishBlockedArtifactConsistency = ({
  routePublishBlockedReport,
  routePublishBlockedPath = null,
  routeManifestPath = null,
  publishReadinessReport = null,
  publishReadinessPath = null,
  requirementsReport = null,
  requirementsPath = null,
} = {}) => {
  if (!isRecord(routePublishBlockedReport)) {
    return makeCheck(
      "route-publish-blocked-artifact-consistency",
      false,
      "No Solana route publish-blocked report is available for consistency checks.",
      { routePublishBlockedPath },
    );
  }
  const schemaOk =
    routePublishBlockedReport.schema ===
    "iroha-demo-sccp-solana-route-publish-blocked/v1";
  const routeOk =
    readFirstString(routePublishBlockedReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyFalse = routePublishBlockedReport.ready === false;
  const stage = readFirstString(routePublishBlockedReport, "stage");
  const error = readFirstString(routePublishBlockedReport, "error");
  const directSnapshot = isRecord(publishReadinessReport)
    ? publishReadinessBlockedSnapshot(publishReadinessReport)
    : null;
  const observedSnapshot = publishReadinessBlockedSnapshot(
    routePublishBlockedReport,
  );
  const productionRequirements = readFirstRecord(
    routePublishBlockedReport,
    "productionRequirements",
    "production_requirements",
  );
  const mismatches = [];
  const compareSnapshotValue = ({
    id,
    field,
    expected,
    observed,
    sourcePath,
    detail,
  }) => {
    const expectedJson = JSON.stringify(stableJsonValue(expected ?? null));
    const observedJson = JSON.stringify(stableJsonValue(observed ?? null));
    if (expectedJson !== observedJson) {
      mismatches.push({
        id,
        field,
        expected: expectedJson,
        observed: observedJson,
        sourcePath,
        detail,
      });
    }
  };
  const comparePath = ({ id, field, expected, observed, detail }) => {
    if (!expected || !observed) {
      return;
    }
    const normalizedExpected = normalizePath(expected);
    const normalizedObserved = normalizePath(observed);
    if (normalizedExpected !== normalizedObserved) {
      mismatches.push({
        id,
        field,
        expected: normalizedExpected,
        observed: normalizedObserved,
        detail,
      });
    }
  };
  if (!schemaOk) {
    mismatches.push({
      id: "publish-blocked-schema",
      field: "schema",
      expected: "iroha-demo-sccp-solana-route-publish-blocked/v1",
      observed: routePublishBlockedReport.schema ?? null,
      sourcePath: routePublishBlockedPath,
      detail: "Route publish-blocked report schema is not canonical.",
    });
  }
  if (!routeOk) {
    mismatches.push({
      id: "route-id",
      field: "routeId",
      expected: SCCP_SOLANA_XOR_ROUTE_ID,
      observed:
        readFirstString(routePublishBlockedReport, "routeId", "route_id") ||
        null,
      sourcePath: routePublishBlockedPath,
      detail: "Route publish-blocked report route id does not match Solana.",
    });
  }
  if (!readyFalse) {
    mismatches.push({
      id: "blocked-ready-flag",
      field: "ready",
      expected: false,
      observed: routePublishBlockedReport.ready ?? null,
      sourcePath: routePublishBlockedPath,
      detail: "Route publish-blocked report must not claim readiness.",
    });
  }
  if (
    ![
      "route-manifest-isi",
      "publish-readiness",
      "runtime-signing-key",
    ].includes(stage)
  ) {
    mismatches.push({
      id: "blocked-stage",
      field: "stage",
      expected: "route-manifest-isi|publish-readiness|runtime-signing-key",
      observed: stage || null,
      sourcePath: routePublishBlockedPath,
      detail: "Route publish-blocked report uses an unsupported stage.",
    });
  }
  comparePath({
    id: "route-manifest",
    field: "routeManifest",
    expected: routeManifestPath,
    observed: readFirstString(
      routePublishBlockedReport,
      "routeManifest",
      "route_manifest",
    ),
    detail:
      "Route publish-blocked report route manifest path does not match the current manifest path.",
  });
  comparePath({
    id: "publish-readiness",
    field: "routePublishReadinessPath",
    expected: publishReadinessPath,
    observed: readFirstString(
      routePublishBlockedReport,
      "routePublishReadinessPath",
      "route_publish_readiness_path",
    ),
    detail:
      "Route publish-blocked report publish-readiness path does not match the current report path.",
  });
  if (!directSnapshot) {
    mismatches.push({
      id: "publish-readiness",
      field: "snapshot",
      expected: "direct publish-readiness report",
      observed: null,
      sourcePath: publishReadinessPath,
      detail:
        "Route publish-blocked report cannot be verified without direct publish-readiness evidence.",
    });
  } else {
    for (const field of [
      "endpointReady",
      "mcpTransactionToolsReady",
      "publicationMode",
      "routeManifestIsi",
      "runtimeSigning",
      "blockerIds",
    ]) {
      compareSnapshotValue({
        id: "publish-readiness",
        field,
        expected: directSnapshot[field],
        observed: observedSnapshot[field],
        sourcePath: publishReadinessPath,
        detail:
          "Route publish-blocked report publish-readiness snapshot does not match the direct report.",
      });
    }
    if (
      stage === "route-manifest-isi" &&
      directSnapshot.routeManifestIsi.error &&
      error !== directSnapshot.routeManifestIsi.error
    ) {
      mismatches.push({
        id: "blocked-error",
        field: "error",
        expected: directSnapshot.routeManifestIsi.error,
        observed: error || null,
        sourcePath: publishReadinessPath,
        detail:
          "Route publish-blocked ISI error does not match the current route-manifest ISI error.",
      });
    }
    if (
      stage === "publish-readiness" &&
      directSnapshot.blockerIds.some((blockerId) => !error.includes(blockerId))
    ) {
      mismatches.push({
        id: "blocked-error",
        field: "error",
        expected: directSnapshot.blockerIds.join(", "),
        observed: error || null,
        sourcePath: publishReadinessPath,
        detail:
          "Route publish-blocked readiness error does not list the current blockers.",
      });
    }
    if (
      stage === "runtime-signing-key" &&
      directSnapshot.runtimeSigning.privateKeyEnv &&
      !error.includes(directSnapshot.runtimeSigning.privateKeyEnv)
    ) {
      mismatches.push({
        id: "blocked-error",
        field: "error",
        expected: directSnapshot.runtimeSigning.privateKeyEnv,
        observed: error || null,
        sourcePath: publishReadinessPath,
        detail:
          "Route publish-blocked runtime error does not name the current private-key env var.",
      });
    }
  }
  if (isRecord(requirementsReport)) {
    compareSnapshotValue({
      id: "production-requirements",
      field: "blockerIds",
      expected: reportBlockerIdSnapshot(requirementsReport),
      observed: blockerIdSnapshot(
        readFirstArray(productionRequirements, "blockerIds", "blocker_ids"),
      ),
      sourcePath: requirementsPath,
      detail:
        "Route publish-blocked report production-requirement blockers do not match the direct requirements report.",
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "route-publish-blocked-artifact-consistency",
    ok,
    ok
      ? "Solana route publish-blocked report matches the current publish-readiness evidence."
      : "Solana route publish-blocked report is stale or mismatched.",
    {
      routePublishBlockedPath,
      comparedArtifacts: {
        routeManifestPath,
        publishReadinessPath,
        requirementsPath,
      },
      stage: stage || null,
      error: error || null,
      publishReadinessSnapshot: {
        expected: directSnapshot,
        observed: observedSnapshot,
      },
      productionRequirementBlockerIds: readFirstArray(
        productionRequirements,
        "blockerIds",
        "blocker_ids",
      ),
      mismatches,
    },
  );
};

export const checkRouteManagerAccessReady = ({
  routeManagerAccessReport,
  routeManagerAccessPath = null,
} = {}) => {
  if (!isRecord(routeManagerAccessReport)) {
    return makeCheck(
      "route-manager-access-ready",
      false,
      "No Solana route-manager access request report is available.",
      { routeManagerAccessPath },
    );
  }
  const schemaOk =
    routeManagerAccessReport.schema ===
    "iroha-demo-sccp-solana-route-manager-access-request/v1";
  const routeOk =
    readFirstString(routeManagerAccessReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const requestHash = readFirstString(
    routeManagerAccessReport,
    "requestHash",
    "request_hash",
  );
  const readyForOperatorReview =
    routeManagerAccessReport.readyForOperatorReview === true;
  const accessReady = routeManagerAccessReport.accessReady === true;
  const productionRouteReady =
    routeManagerAccessReport.productionRouteReady === true;
  const readyToSubmitWithCurrentRuntime =
    routeManagerAccessReport.readyToSubmitWithCurrentRuntime === true;
  const requiredRouteManager = readFirstRecord(
    routeManagerAccessReport,
    "requiredRouteManager",
    "required_route_manager",
  );
  const runtimeSigning = readFirstRecord(
    routeManagerAccessReport,
    "runtimeSigning",
    "runtime_signing",
  );
  const authorityReady = requiredRouteManager?.authorityReady === true;
  const authorityFormatReady =
    requiredRouteManager?.authorityFormatReady === true;
  const authorityStatus = canonicalTairaRouteAuthorityStatus(
    requiredRouteManager?.authority,
  );
  const hasRequiredPermission =
    requiredRouteManager?.hasRequiredPermission === true;
  const privateKeyEnvPresent = runtimeSigning?.privateKeyEnvPresent === true;
  const privateKeyStoredInReport =
    runtimeSigning?.privateKeyStoredInReport === true;
  const ok =
    schemaOk &&
    routeOk &&
    /^0x[0-9a-f]{64}$/u.test(requestHash) &&
    readyForOperatorReview &&
    accessReady &&
    productionRouteReady &&
    readyToSubmitWithCurrentRuntime &&
    authorityReady &&
    authorityFormatReady &&
    authorityStatus.canonical &&
    hasRequiredPermission &&
    privateKeyEnvPresent &&
    !privateKeyStoredInReport;
  return makeCheck(
    "route-manager-access-ready",
    ok,
    ok
      ? "Solana route-manager access request proves permission and runtime signing readiness."
      : "Solana route-manager access request is missing or not submit-ready.",
    {
      routeManagerAccessPath,
      schemaOk,
      routeOk,
      requestHash: requestHash || null,
      readyForOperatorReview,
      accessReady,
      productionRouteReady,
      readyToSubmitWithCurrentRuntime,
      authorityReady,
      authorityFormatReady,
      canonicalAuthority: authorityStatus,
      hasRequiredPermission,
      requiredRouteManager,
      privateKeyEnvPresent,
      privateKeyStoredInReport,
      blockerIds: readFirstArray(routeManagerAccessReport, "blockers").map(
        (blocker) => readFirstString(blocker, "id"),
      ),
    },
  );
};

export const checkRouteManagerAccessArtifactConsistency = ({
  routeManagerAccessReport,
  routeManagerAccessPath = null,
  routePublicationRequestReport = null,
  routePublicationRequestPath = null,
  publishReadinessReport = null,
  publishReadinessPath = null,
  requirementsReport = null,
  requirementsPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
} = {}) => {
  if (!isRecord(routeManagerAccessReport)) {
    return makeCheck(
      "route-manager-access-artifact-consistency",
      false,
      "No Solana route-manager access request is available for artifact consistency checks.",
      { routeManagerAccessPath },
    );
  }
  const routePublicationRequest = readFirstRecord(
    routeManagerAccessReport,
    "routePublicationRequest",
    "route_publication_request",
  );
  const publishReadiness = readFirstRecord(
    routeManagerAccessReport,
    "publishReadiness",
    "publish_readiness",
  );
  const productionRequirements = readFirstRecord(
    routeManagerAccessReport,
    "productionRequirements",
    "production_requirements",
  );
  const proofMaterialBundle = readFirstRecord(
    routeManagerAccessReport,
    "proofMaterialBundle",
    "proof_material_bundle",
  );
  const requiredRouteManager = readFirstRecord(
    routeManagerAccessReport,
    "requiredRouteManager",
    "required_route_manager",
  );
  const directRuntimeSigning = readFirstRecord(
    publishReadinessReport,
    "runtimeSigning",
    "runtime_signing",
  );
  const directPublicEndpoint = readFirstRecord(
    publishReadinessReport,
    "publicEndpoint",
    "public_endpoint",
  );
  const directMcpTransactionTools = readFirstRecord(
    directPublicEndpoint,
    "mcpTransactionTools",
    "mcp_transaction_tools",
  );
  const directPublishReadinessSnapshot = {
    readyForRuntimeSigner:
      publishReadinessReport?.readyForRuntimeSigner === true,
    readyToSubmitWithCurrentRuntime:
      publishReadinessReport?.readyToSubmitWithCurrentRuntime === true,
    endpointReady:
      publishReadinessReport?.endpointReady === true ||
      directPublicEndpoint?.endpointReady === true,
    mcpTransactionToolsReady:
      publishReadinessReport?.mcpTransactionToolsReady === true ||
      directMcpTransactionTools?.ready === true,
    publicationMode:
      readFirstString(publishReadinessReport, "publicationMode") ||
      readFirstString(directMcpTransactionTools, "publicationMode") ||
      null,
  };
  const embeddedPublishReadinessSnapshot = {
    readyForRuntimeSigner: publishReadiness?.readyForRuntimeSigner === true,
    readyToSubmitWithCurrentRuntime:
      publishReadiness?.readyToSubmitWithCurrentRuntime === true,
    endpointReady: publishReadiness?.endpointReady === true,
    mcpTransactionToolsReady:
      publishReadiness?.mcpTransactionToolsReady === true,
    publicationMode:
      readFirstString(publishReadiness, "publicationMode") || null,
  };
  const mismatches = [];
  const compare = ({ id, field, expected, observed, sourcePath, detail }) => {
    if (!expected) {
      return;
    }
    if (observed !== expected) {
      mismatches.push({
        id,
        field,
        expected,
        observed: observed || null,
        sourcePath,
        detail,
      });
    }
  };
  const compareSnapshotValue = ({
    id,
    field,
    expected,
    observed,
    sourcePath,
    detail,
  }) => {
    const expectedJson = JSON.stringify(expected ?? null);
    const observedJson = JSON.stringify(observed ?? null);
    if (expectedJson !== observedJson) {
      mismatches.push({
        id,
        field,
        expected: expectedJson,
        observed: observedJson,
        sourcePath,
        detail,
      });
    }
  };
  const compareArray = ({
    id,
    field,
    expected,
    observed,
    sourcePath,
    detail,
  }) => {
    if (!Array.isArray(expected)) {
      return;
    }
    const expectedJson = JSON.stringify(sortedStringIds(expected));
    const observedJson = JSON.stringify(sortedStringIds(observed ?? []));
    if (observedJson !== expectedJson) {
      mismatches.push({
        id,
        field,
        expected: expectedJson,
        observed: observedJson,
        sourcePath,
        detail,
      });
    }
  };
  compare({
    id: "route-publication-request",
    field: "reviewPackageHash",
    expected: readFirstString(
      routePublicationRequestReport,
      "reviewPackageHash",
      "review_package_hash",
    ),
    observed: readFirstString(
      routePublicationRequest,
      "reviewPackageHash",
      "review_package_hash",
    ),
    sourcePath: routePublicationRequestPath,
    detail:
      "Route-manager access request route-publication hash does not match the direct publication request.",
  });
  compare({
    id: "proof-material-bundle",
    field: "bundleManifestSha256",
    expected: readFirstString(
      proofMaterialBundleReport,
      "bundleManifestSha256",
      "bundle_manifest_sha256",
      "stableHash",
      "stable_hash",
    ),
    observed: readFirstString(
      proofMaterialBundle,
      "bundleManifestSha256",
      "bundle_manifest_sha256",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: proofMaterialBundlePath,
    detail:
      "Route-manager access request proof-material bundle hash does not match the direct bundle manifest.",
  });
  for (const field of [
    "readyForRuntimeSigner",
    "readyToSubmitWithCurrentRuntime",
    "endpointReady",
    "mcpTransactionToolsReady",
    "publicationMode",
  ]) {
    compareSnapshotValue({
      id: "publish-readiness",
      field,
      expected: directPublishReadinessSnapshot[field],
      observed: embeddedPublishReadinessSnapshot[field],
      sourcePath: publishReadinessPath,
      detail:
        "Route-manager access request publish-readiness snapshot does not match the direct publish-readiness report.",
    });
  }
  compare({
    id: "route-manager-authority",
    field: "authority",
    expected: readFirstString(directRuntimeSigning, "authority"),
    observed: readFirstString(requiredRouteManager, "authority"),
    sourcePath: publishReadinessPath,
    detail:
      "Route-manager access request authority does not match current publish-readiness runtime signing evidence.",
  });
  compareArray({
    id: "publish-readiness",
    field: "blockerIds",
    expected: isRecord(publishReadinessReport)
      ? reportBlockerIds(publishReadinessReport)
      : null,
    observed: readFirstArray(publishReadiness, "blockerIds", "blocker_ids"),
    sourcePath: publishReadinessPath,
    detail:
      "Route-manager access request publish-readiness blockers do not match the direct publish-readiness report.",
  });
  compareArray({
    id: "production-requirements",
    field: "blockerIds",
    expected: isRecord(requirementsReport)
      ? reportBlockerIds(requirementsReport)
      : null,
    observed: readFirstArray(
      productionRequirements,
      "blockerIds",
      "blocker_ids",
    ),
    sourcePath: requirementsPath,
    detail:
      "Route-manager access request production-requirement blockers do not match the direct requirements report.",
  });
  for (const field of [
    "authorityReady",
    "authorityFormatReady",
    "privateKeyEnvPresent",
    "privateKeyStoredInReport",
  ]) {
    compareSnapshotValue({
      id: "runtime-signing",
      field,
      expected: directRuntimeSigning?.[field] === true,
      observed:
        field === "privateKeyEnvPresent" || field === "privateKeyStoredInReport"
          ? routeManagerAccessReport?.runtimeSigning?.[field] === true
          : requiredRouteManager?.[field] === true,
      sourcePath: publishReadinessPath,
      detail:
        "Route-manager access request runtime signing flags do not match the direct publish-readiness report.",
    });
  }
  const ok = mismatches.length === 0;
  return makeCheck(
    "route-manager-access-artifact-consistency",
    ok,
    ok
      ? "Solana route-manager access request references the current publication, proof, runtime, and requirements artifacts."
      : "Solana route-manager access request references stale publication, proof, runtime, or requirements artifacts.",
    {
      routeManagerAccessPath,
      comparedArtifacts: {
        routePublicationRequestPath,
        publishReadinessPath,
        requirementsPath,
        proofMaterialBundlePath,
      },
      requestHash:
        readFirstString(
          routeManagerAccessReport,
          "requestHash",
          "request_hash",
        ) || null,
      routePublicationReviewHash:
        readFirstString(
          routePublicationRequest,
          "reviewPackageHash",
          "review_package_hash",
        ) || null,
      proofMaterialBundleHash:
        readFirstString(
          proofMaterialBundle,
          "bundleManifestSha256",
          "bundle_manifest_sha256",
        ) || null,
      publishReadinessSnapshot: {
        expected: directPublishReadinessSnapshot,
        observed: embeddedPublishReadinessSnapshot,
      },
      mismatches,
    },
  );
};

export const checkOperatorHandoffReady = ({
  operatorHandoffReport,
  operatorHandoffPath = null,
} = {}) => {
  if (!isRecord(operatorHandoffReport)) {
    return makeCheck(
      "operator-handoff-ready",
      false,
      "No consolidated Solana operator handoff report is available.",
      { operatorHandoffPath },
    );
  }
  const schemaOk =
    operatorHandoffReport.schema ===
    "iroha-demo-sccp-solana-operator-handoff/v1";
  const routeOk =
    readFirstString(operatorHandoffReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const handoffHash = readFirstString(
    operatorHandoffReport,
    "handoffHash",
    "handoff_hash",
  );
  const runtimeSigning = readFirstRecord(
    operatorHandoffReport,
    "runtimeSigning",
    "runtime_signing",
  );
  const requiredRouteManager = readFirstRecord(
    operatorHandoffReport,
    "requiredRouteManager",
    "required_route_manager",
  );
  const artifacts = readFirstRecord(operatorHandoffReport, "artifacts") ?? {};
  const proofMaterialBundle = readFirstRecord(
    artifacts,
    "proofMaterialBundle",
    "proof_material_bundle",
  );
  const proofMaterialCeremonyPackage = readFirstRecord(
    artifacts,
    "proofMaterialCeremonyPackage",
    "proof_material_ceremony_package",
  );
  const routePublicationRequest = readFirstRecord(
    artifacts,
    "routePublicationRequest",
    "route_publication_request",
  );
  const routeManagerAccessRequest = readFirstRecord(
    artifacts,
    "routeManagerAccessRequest",
    "route_manager_access_request",
  );
  const laneActivationRequest = readFirstRecord(
    artifacts,
    "laneActivationRequest",
    "lane_activation_request",
  );
  const smokeReadiness = readFirstRecord(
    artifacts,
    "smokeReadiness",
    "smoke_readiness",
  );
  const privateKeyStoredInReport =
    runtimeSigning?.privateKeyStoredInReport === true;
  const authorityStatus = canonicalTairaRouteAuthorityStatus(
    requiredRouteManager?.authority,
  );
  const laneActivationReady =
    laneActivationRequest?.readyForLaneGovernanceReview === true &&
    laneActivationRequest?.publicLaneReady === true &&
    laneActivationRequest?.productionProofMaterialReady === true &&
    laneActivationRequest?.productionLaneReady === true;
  const smokeReadinessReady = smokeReadiness?.ready === true;
  const ready =
    schemaOk &&
    routeOk &&
    /^0x[0-9a-f]{64}$/u.test(handoffHash) &&
    operatorHandoffReport.readyForOperatorReview === true &&
    operatorHandoffReport.productionRouteReady === true &&
    operatorHandoffReport.readyToPublish === true &&
    requiredRouteManager?.authorityReady === true &&
    requiredRouteManager?.authorityFormatReady === true &&
    authorityStatus.canonical &&
    requiredRouteManager?.hasRequiredPermission === true &&
    runtimeSigning?.privateKeyEnvPresent === true &&
    !privateKeyStoredInReport &&
    proofMaterialBundle?.readyForProofMaterialCeremony === true &&
    proofMaterialCeremonyPackage?.readyForCeremonyReview === true &&
    routePublicationRequest?.readyForRouteManagerReview === true &&
    routeManagerAccessRequest?.readyForOperatorReview === true &&
    laneActivationReady &&
    smokeReadinessReady;
  return makeCheck(
    "operator-handoff-ready",
    ready,
    ready
      ? "Solana operator handoff is complete and references publish-ready artifacts."
      : "Solana operator handoff is missing, incomplete, or not publish-ready.",
    {
      operatorHandoffPath,
      schemaOk,
      routeOk,
      handoffHash: handoffHash || null,
      readyForOperatorReview:
        operatorHandoffReport.readyForOperatorReview === true,
      productionRouteReady: operatorHandoffReport.productionRouteReady === true,
      readyToPublish: operatorHandoffReport.readyToPublish === true,
      requiredRouteManager,
      canonicalAuthority: authorityStatus,
      privateKeyEnvPresent: runtimeSigning?.privateKeyEnvPresent === true,
      privateKeyStoredInReport,
      proofMaterialBundleReady:
        proofMaterialBundle?.readyForProofMaterialCeremony === true,
      proofMaterialCeremonyPackageReady:
        proofMaterialCeremonyPackage?.readyForCeremonyReview === true,
      routePublicationRequestReady:
        routePublicationRequest?.readyForRouteManagerReview === true,
      routeManagerAccessRequestReady:
        routeManagerAccessRequest?.readyForOperatorReview === true,
      laneActivationRequestReady:
        laneActivationRequest?.readyForLaneGovernanceReview === true,
      laneActivationProductionReady:
        laneActivationRequest?.productionLaneReady === true,
      smokeReadinessReady,
      smokeReadinessFailedCheckIds: readFirstArray(
        smokeReadiness,
        "failedCheckIds",
        "failed_check_ids",
      ),
      smokeReadinessMissingProductionInputIds: readFirstArray(
        smokeReadiness,
        "missingProductionInputIds",
        "missing_production_input_ids",
      ),
      blockerIds: readFirstArray(operatorHandoffReport, "blockers").map(
        (blocker) => readFirstString(blocker, "id"),
      ),
      nextActions: readFirstArray(
        operatorHandoffReport,
        "nextActions",
        "next_actions",
      ),
    },
  );
};

export const checkOperatorHandoffArtifactConsistency = ({
  operatorHandoffReport,
  operatorHandoffPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  proofMaterialCeremonyPackageReport = null,
  proofMaterialCeremonyPackagePath = null,
  routePublicationRequestReport = null,
  routePublicationRequestPath = null,
  routeManagerAccessReport = null,
  routeManagerAccessPath = null,
  laneActivationProposalReport = null,
  laneActivationProposalPath = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
} = {}) => {
  if (!isRecord(operatorHandoffReport)) {
    return makeCheck(
      "operator-handoff-artifact-consistency",
      false,
      "No Solana operator handoff is available for artifact consistency checks.",
      { operatorHandoffPath },
    );
  }
  const artifacts = readFirstRecord(operatorHandoffReport, "artifacts");
  const mismatches = [];
  const compare = ({ id, artifactKeys, expected, sourcePath, detail }) => {
    if (!expected) {
      return;
    }
    const observed = artifactStableHash(artifacts, ...artifactKeys);
    if (observed !== expected) {
      mismatches.push({
        id,
        detail,
        expected,
        observed: observed || null,
        sourcePath,
      });
    }
  };
  compare({
    id: "proof-material-bundle",
    artifactKeys: ["proofMaterialBundle", "proof_material_bundle"],
    expected: readFirstString(
      proofMaterialBundleReport,
      "bundleManifestSha256",
      "bundle_manifest_sha256",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: proofMaterialBundlePath,
    detail:
      "Operator handoff proof-material bundle hash does not match the direct bundle manifest.",
  });
  compare({
    id: "proof-material-ceremony-package",
    artifactKeys: [
      "proofMaterialCeremonyPackage",
      "proof_material_ceremony_package",
    ],
    expected: readFirstString(
      proofMaterialCeremonyPackageReport,
      "ceremonyPackageHash",
      "ceremony_package_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: proofMaterialCeremonyPackagePath,
    detail:
      "Operator handoff proof-material ceremony hash does not match the direct ceremony package.",
  });
  compare({
    id: "route-publication-request",
    artifactKeys: ["routePublicationRequest", "route_publication_request"],
    expected: readFirstString(
      routePublicationRequestReport,
      "reviewPackageHash",
      "review_package_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: routePublicationRequestPath,
    detail:
      "Operator handoff route-publication request hash does not match the direct publication package.",
  });
  compare({
    id: "route-manager-access-request",
    artifactKeys: ["routeManagerAccessRequest", "route_manager_access_request"],
    expected: readFirstString(
      routeManagerAccessReport,
      "requestHash",
      "request_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: routeManagerAccessPath,
    detail:
      "Operator handoff route-manager access request hash does not match the direct access package.",
  });
  const laneActivationRequest = readFirstRecord(
    laneActivationProposalReport,
    "laneActivationRequest",
    "lane_activation_request",
  );
  compare({
    id: "lane-activation-request",
    artifactKeys: ["laneActivationRequest", "lane_activation_request"],
    expected: readFirstString(
      laneActivationRequest,
      "laneActivationRequestHash",
      "lane_activation_request_hash",
      "stableHash",
      "stable_hash",
    ),
    sourcePath: laneActivationProposalPath,
    detail:
      "Operator handoff lane activation request hash does not match the direct lane proposal package.",
  });
  compareSmokeReadinessSnapshot({
    mismatches,
    artifact: readFirstRecord(artifacts, "smokeReadiness", "smoke_readiness"),
    report: smokeReadinessReport,
    sourcePath: smokeReadinessPath,
    detail:
      "Operator handoff smoke-readiness snapshot does not match the direct smoke-readiness report.",
  });
  const ok = mismatches.length === 0;
  return makeCheck(
    "operator-handoff-artifact-consistency",
    ok,
    ok
      ? "Solana operator handoff references the same proof, publication, access, lane, and smoke artifacts as the direct reports."
      : "Solana operator handoff references stale or mismatched proof/publication/access/lane/smoke artifacts.",
    {
      operatorHandoffPath,
      handoffHash: operatorHandoffReport.handoffHash ?? null,
      comparedArtifacts: {
        proofMaterialBundlePath,
        proofMaterialCeremonyPackagePath,
        routePublicationRequestPath,
        routeManagerAccessPath,
        laneActivationProposalPath,
        smokeReadinessPath,
      },
      mismatches,
    },
  );
};

export const checkSmokeReadinessReady = ({
  smokeReadinessReport,
  smokeReadinessPath = null,
} = {}) => {
  if (!isRecord(smokeReadinessReport)) {
    return makeCheck(
      "smoke-readiness-ready",
      false,
      "No Solana live smoke-readiness report is available.",
      { smokeReadinessPath },
    );
  }
  const schemaOk =
    smokeReadinessReport.schema ===
    "iroha-demo-sccp-solana-live-smoke-readiness/v1";
  const routeOk =
    readFirstString(smokeReadinessReport, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const checks = readFirstArray(smokeReadinessReport, "checks");
  const failed = failedChecks(checks);
  const ready =
    schemaOk &&
    routeOk &&
    smokeReadinessReport.ready === true &&
    failed.length === 0;
  return makeCheck(
    "smoke-readiness-ready",
    ready,
    ready
      ? "Solana live smoke-readiness report proves app runtime prerequisites are ready."
      : "Solana live smoke-readiness report is missing or not ready.",
    {
      smokeReadinessPath,
      schemaOk,
      routeOk,
      ready: smokeReadinessReport.ready === true,
      failedChecks: failed.map((check) => ({
        id: check.id,
        detail: check.detail ?? null,
      })),
      blockerIds: readFirstArray(
        smokeReadinessReport,
        "blockerIds",
        "blocker_ids",
        "blockers",
      )
        .map((blocker) =>
          typeof blocker === "string"
            ? blocker.trim()
            : readFirstString(blocker, "id"),
        )
        .filter(Boolean),
      missingProductionInputs: readFirstArray(
        smokeReadinessReport,
        "missingProductionInputs",
        "missing_production_inputs",
      ),
      nextActions: actionSummaries(
        readFirstArray(smokeReadinessReport, "nextActions"),
      ),
    },
  );
};

const reportCheckById = (report, id) =>
  readFirstArray(report, "checks").find((check) => check?.id === id) ?? null;

const routePreflightBrowserProofModules = (routePreflight) => {
  const evidence = readFirstRecord(
    reportCheckById(routePreflight, "browser-proof-modules"),
    "evidence",
  );
  return evidence
    ? {
        destinationModuleUrl:
          readFirstString(evidence, "destinationModuleUrl") || null,
        destinationModuleHash:
          readFirstString(evidence, "destinationModuleHash") || null,
        sourceModuleUrl: readFirstString(evidence, "sourceModuleUrl") || null,
        sourceModuleHash: readFirstString(evidence, "sourceModuleHash") || null,
      }
    : null;
};

const solanaConsistencyBinding = (record) => {
  const solana = readFirstRecord(record, "solana");
  return solana
    ? {
        network: readFirstString(solana, "network", "solanaNetwork") || null,
        caipChainId:
          readFirstString(solana, "caipChainId", "caip_chain_id") || null,
      }
    : null;
};

const TRANSIENT_ROUTE_PREFLIGHT_FAILURE_IDS = new Set([
  "sccp-capabilities-load",
  "solana-capability-publication",
]);

const stableRoutePreflightFailedChecks = (checks) => {
  const failures = failedChecks(checks)
    .map((check) => ({
      id: check.id ?? null,
      detail: check.detail ?? null,
    }))
    .filter((check) => check.id);
  const stableFailures = failures.filter(
    (check) => !TRANSIENT_ROUTE_PREFLIGHT_FAILURE_IDS.has(check.id),
  );
  return (stableFailures.length > 0 ? stableFailures : failures).sort(
    (left, right) => String(left.id).localeCompare(String(right.id)),
  );
};

const routePreflightConsistencySnapshot = (routePreflight) =>
  isRecord(routePreflight)
    ? {
        checkedAt:
          readFirstString(routePreflight, "checkedAt", "checked_at") || null,
        ready: routePreflight.ready === true,
        routeId: readFirstString(routePreflight, "routeId", "route_id") || null,
        assetKey:
          readFirstString(routePreflight, "assetKey", "asset_key") || null,
        manifestSource:
          readFirstString(
            routePreflight,
            "manifestSource",
            "manifest_source",
          ) || null,
        solana: solanaConsistencyBinding(routePreflight),
        failedChecks: stableRoutePreflightFailedChecks(
          readFirstArray(routePreflight, "checks"),
        ),
        browserProofModules: routePreflightBrowserProofModules(routePreflight),
      }
    : null;

const smokeRoutePreflightConsistencySnapshot = (evidence) =>
  isRecord(evidence)
    ? {
        checkedAt: readFirstString(evidence, "checkedAt", "checked_at") || null,
        ready: evidence.ready === true,
        routeId: readFirstString(evidence, "routeId", "route_id") || null,
        assetKey: readFirstString(evidence, "assetKey", "asset_key") || null,
        manifestSource:
          readFirstString(evidence, "manifestSource", "manifest_source") ||
          null,
        solana: solanaConsistencyBinding(evidence),
        failedChecks: stableRoutePreflightFailedChecks(
          readFirstArray(evidence, "failedChecks", "failed_checks"),
        ),
        browserProofModules:
          readFirstRecord(
            evidence,
            "browserProofModules",
            "browser_proof_modules",
          ) ?? null,
      }
    : null;

const proofBundleProverExpectation = (proofMaterialBundleReport, direction) => {
  const proofMaterialRequest = readFirstRecord(
    proofMaterialBundleReport,
    "proofMaterialRequest",
    "proof_material_request",
  );
  const proverEntry = readFirstArray(
    proofMaterialRequest,
    "browserProverModules",
    "browser_prover_modules",
  ).find((entry) => readFirstString(entry, "direction") === direction);
  if (!proverEntry) {
    return null;
  }
  const sidecarArtifact = readFirstArray(proofMaterialBundleReport, "artifacts")
    .filter((artifact) => isRecord(artifact))
    .find((artifact) => artifact.id === `${direction}-prover-sidecar`);
  return {
    moduleUrl: readFirstString(proverEntry, "moduleUrl", "module_url") || null,
    moduleHash:
      readFirstString(
        proverEntry,
        "actualModuleHash",
        "actual_module_hash",
        "expectedModuleHash",
        "expected_module_hash",
        "moduleHash",
        "module_hash",
      ) || null,
    sidecarUrl:
      readFirstString(proverEntry, "sidecarUrl", "sidecar_url") || null,
    sidecarHash:
      readFirstString(sidecarArtifact, "sha256", "hash", "sidecarHash") ||
      readFirstString(proverEntry, "sidecarHash", "sidecar_hash") ||
      null,
  };
};

const smokeProverObservation = (smokeReadinessReport, checkId) => {
  const evidence = readFirstRecord(
    reportCheckById(smokeReadinessReport, checkId),
    "evidence",
  );
  const inspection = readFirstRecord(evidence, "inspection");
  if (!evidence && !inspection) {
    return null;
  }
  return {
    moduleUrl: readFirstString(evidence, "moduleUrl", "module_url") || null,
    moduleHash:
      readFirstString(inspection, "moduleHash", "module_hash") || null,
    sidecarUrl:
      readFirstString(inspection, "sidecarUrl", "sidecar_url") || null,
    sidecarHash:
      readFirstString(inspection, "sidecarHash", "sidecar_hash") || null,
  };
};

const pushFieldMismatch = ({
  mismatches,
  id,
  field,
  expected,
  observed,
  detail,
}) => {
  if (!expected && !observed) {
    return;
  }
  if (expected !== observed) {
    mismatches.push({
      id,
      field,
      expected: expected ?? null,
      observed: observed ?? null,
      detail,
    });
  }
};

const SMOKE_PREFLIGHT_MAX_STALENESS_MS = 5 * 60 * 1000;

const parseTimestampMs = (value) => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const checkSmokeReadinessArtifactConsistency = ({
  smokeReadinessReport,
  smokeReadinessPath = null,
  preflightReport = null,
  preflightReportPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
} = {}) => {
  if (!isRecord(smokeReadinessReport)) {
    return makeCheck(
      "smoke-readiness-artifact-consistency",
      false,
      "No Solana smoke-readiness report is available for artifact consistency checks.",
      { smokeReadinessPath },
    );
  }
  const smokeClaimsReady = smokeReadinessReport.ready === true;
  const routePreflightEvidence = readFirstRecord(
    reportCheckById(smokeReadinessReport, "route-preflight"),
    "evidence",
  );
  const directPreflightSnapshot =
    routePreflightConsistencySnapshot(preflightReport);
  const smokePreflightSnapshot = smokeRoutePreflightConsistencySnapshot(
    routePreflightEvidence,
  );
  const mismatches = [];
  const missingEvidence = [];
  if (directPreflightSnapshot && smokePreflightSnapshot) {
    const tolerateBlockedPreflightDrift =
      !smokeClaimsReady &&
      directPreflightSnapshot.ready === false &&
      smokePreflightSnapshot.ready === false &&
      [
        ...readFirstArray(smokeReadinessReport, "failedCheckIds"),
        ...readFirstArray(smokeReadinessReport, "blockerIds"),
      ].includes("route-preflight");
    for (const field of [
      "ready",
      "routeId",
      "assetKey",
      "manifestSource",
      "solana",
      "failedChecks",
      "browserProofModules",
    ]) {
      if (field === "failedChecks" && tolerateBlockedPreflightDrift) {
        continue;
      }
      pushFieldMismatch({
        mismatches,
        id: "route-preflight",
        field,
        expected: JSON.stringify(directPreflightSnapshot[field] ?? null),
        observed: JSON.stringify(smokePreflightSnapshot[field] ?? null),
        detail:
          "Smoke-readiness route preflight evidence does not match the direct public preflight report.",
      });
    }
    const directCheckedAt = parseTimestampMs(directPreflightSnapshot.checkedAt);
    const smokeCheckedAt = parseTimestampMs(smokePreflightSnapshot.checkedAt);
    if (directCheckedAt && !smokeCheckedAt) {
      mismatches.push({
        id: "route-preflight",
        field: "checkedAt",
        expected: JSON.stringify(directPreflightSnapshot.checkedAt ?? null),
        observed: null,
        detail:
          "Smoke-readiness route preflight evidence is missing the embedded preflight timestamp.",
      });
    } else if (
      directCheckedAt &&
      smokeCheckedAt &&
      Math.abs(directCheckedAt - smokeCheckedAt) >
        SMOKE_PREFLIGHT_MAX_STALENESS_MS
    ) {
      mismatches.push({
        id: "route-preflight",
        field: "checkedAt",
        expected: JSON.stringify(directPreflightSnapshot.checkedAt ?? null),
        observed: JSON.stringify(smokePreflightSnapshot.checkedAt ?? null),
        detail:
          "Smoke-readiness route preflight evidence is older than the allowed freshness window.",
      });
    }
  } else if (smokeClaimsReady) {
    missingEvidence.push("route-preflight");
  }
  for (const { direction, checkId } of [
    {
      direction: "destination",
      checkId: "destination-prover-module-url",
    },
    { direction: "source", checkId: "source-prover-module-url" },
  ]) {
    const expected = proofBundleProverExpectation(
      proofMaterialBundleReport,
      direction,
    );
    const observed = smokeProverObservation(smokeReadinessReport, checkId);
    if (!expected && !observed) {
      continue;
    }
    if (!expected || !observed) {
      if (smokeClaimsReady) {
        missingEvidence.push(`${direction}-prover`);
      }
      continue;
    }
    for (const field of [
      "moduleUrl",
      "moduleHash",
      "sidecarUrl",
      "sidecarHash",
    ]) {
      if (!smokeClaimsReady && !expected[field]) {
        continue;
      }
      pushFieldMismatch({
        mismatches,
        id: `${direction}-prover`,
        field,
        expected: expected[field],
        observed: observed[field],
        detail:
          "Smoke-readiness prover inspection does not match the direct Solana proof-material bundle.",
      });
    }
  }
  const ok = mismatches.length === 0 && missingEvidence.length === 0;
  return makeCheck(
    "smoke-readiness-artifact-consistency",
    ok,
    ok
      ? "Solana smoke-readiness report matches the current preflight and prover bundle evidence."
      : "Solana smoke-readiness report is stale or missing current preflight/prover evidence.",
    {
      smokeReadinessPath,
      preflightReportPath,
      proofMaterialBundlePath,
      smokeClaimsReady,
      missingEvidence,
      mismatches,
    },
  );
};

const solanaSmokeReadinessNextRequiredAction = (smokeReadinessCheck) => {
  if (smokeReadinessCheck?.status === "pass") {
    return null;
  }
  const missingIds = new Set(
    readFirstArray(
      smokeReadinessCheck?.evidence,
      "missingProductionInputs",
      "missing_production_inputs",
    )
      .map((input) => readFirstString(input, "id"))
      .filter(Boolean),
  );
  const needsWalletConnect = missingIds.has("walletconnect-project-id");
  const needsProductionProverPackages =
    missingIds.has("solana-destination-production-prover-package") ||
    missingIds.has("solana-source-production-prover-package");
  if (needsWalletConnect && needsProductionProverPackages) {
    return "Run Solana smoke-readiness with a WalletConnect project ID and governed Solana production prover packages.";
  }
  if (needsProductionProverPackages) {
    return "Publish governed Solana production prover packages and rerun Solana smoke-readiness.";
  }
  if (needsWalletConnect) {
    return "Run Solana smoke-readiness with a WalletConnect project ID.";
  }
  return "Run Solana smoke-readiness with WalletConnect, live Solana RPC, and browser-safe destination/source prover module URLs.";
};

const commandPath = (file, fallback) => {
  const candidate = typeof file === "string" && file.trim() ? file : fallback;
  if (typeof candidate !== "string" || !candidate.trim()) {
    return "";
  }
  return path.relative(repoRoot, path.resolve(candidate)).replace(/\\/gu, "/");
};

const buildProductionGateActionDetails = ({
  checks,
  activationPackageReport,
  operatorHandoffReport,
  smokeReadinessReport,
  productionGateReportPath = null,
  smokeReadinessPath = null,
  activationPackagePath = null,
  operatorHandoffPath = null,
}) => {
  const actionSources = [
    { report: activationPackageReport, source: "activation-package" },
    { report: operatorHandoffReport, source: "operator-handoff" },
  ];
  const smokeMissingInputIds = readFirstArray(
    smokeReadinessReport,
    "missingProductionInputs",
    "missing_production_inputs",
  )
    .map((input) => readFirstString(input, "id"))
    .filter(Boolean);
  const explicitPublicNodeArtifactDetail = findActionDetail(actionSources, [
    "provide-explicit-taira-public-node-target",
  ]);
  const publishReadinessBlockerIds = readFirstArray(
    checks.find((check) => check.id === "publish-readiness-ready")?.evidence,
    "blockerIds",
    "blocker_ids",
  )
    .map((blocker) =>
      typeof blocker === "string" ? blocker : readFirstString(blocker, "id"),
    )
    .filter(Boolean);
  const needsExplicitPublicNodeRepair = publishReadinessBlockerIds.some((id) =>
    /^taira-(?:explicit-public-node-target|public-node-)/u.test(id),
  );
  return [
    productionGateAction({
      id: "activate-public-solana-lane",
      title: "Activate public Solana SCCP lane",
      detail:
        "Activate the public TAIRA Solana SCCP lane with immutable verifier and trust-anchor evidence.",
      checkIds: [
        "public-preflight-ready",
        "public-solana-lane-ready",
        "public-verifier-programdata-immutable",
        "public-bridge-source-programdata-immutable",
      ],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "activate-public-solana-lane",
      ]),
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
    }),
    productionGateAction({
      id: "refresh-solana-activation-package",
      title: "Refresh Solana activation package",
      detail:
        "Regenerate the Solana activation package after proof-material or lane proposal artifacts change.",
      checkIds: ["activation-artifact-consistency"],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "refresh-lane-activation-request",
        "refresh-operator-handoff",
      ]),
      command: ["npm", "run", "sccp:solana:deploy", "--", "activation-package"],
      requiredInputs: [
        "current-proof-material-ceremony-package",
        "current-lane-activation-proposal",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-lane-activation-proposal",
      title: "Refresh Solana lane activation proposal",
      detail:
        "Regenerate the Solana lane activation proposal after the lane activation request changes.",
      checkIds: ["lane-activation-proposal-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "lane-activation-proposal",
      ],
      requiredInputs: ["current-lane-activation-request"],
    }),
    productionGateAction({
      id: "publish-taira-solana-route-manifest",
      title: "Publish TAIRA Solana route manifest",
      detail:
        "Publish the production-ready public TAIRA taira_sol_xor manifest with a route-manager signer.",
      checkIds: [
        "public-preflight-ready",
        "route-publication-request-ready",
        "publish-readiness-ready",
      ],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "publish-taira-solana-route-manifest",
        "refresh-route-publication-request",
      ]),
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
      requiredInputs: [
        "taira-route-manager-i105-account",
        "CanManageSccpRouteManifests",
        "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
      ],
    }),
    ...(needsExplicitPublicNodeRepair
      ? [
          productionGateAction({
            id: "provide-explicit-taira-public-node-target",
            title: "Provide explicit TAIRA public node",
            detail:
              "Repair and use the exact TAIRA public-node root and matching /v1/mcp endpoint before route publication readiness can pass.",
            checkIds: ["publish-readiness-ready"],
            checks,
            artifactDetail: explicitPublicNodeArtifactDetail,
            command: [
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
            ],
            requiredInputs: [
              "taira-public-node-root-url",
              "taira-public-node-mcp-url",
            ],
          }),
        ]
      : []),
    productionGateAction({
      id: "refresh-solana-route-publication-request",
      title: "Refresh Solana route-publication request",
      detail:
        "Regenerate the Solana route-publication request after manifest, publish-readiness, or proof-bundle artifacts change.",
      checkIds: ["route-publication-request-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "route-publication-request",
        "--authority",
        "<taira-route-manager-account-id>",
      ],
      requiredInputs: [
        "current-solana-route-manifest",
        "current-solana-publish-readiness",
        "current-proof-material-bundle",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-route-publish-blocked",
      title: "Refresh Solana route publish-blocked report",
      detail:
        "Rerun the Solana route publish attempt after publish-readiness or production requirements change.",
      checkIds: ["route-publish-blocked-artifact-consistency"],
      checks,
      command: [
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
      requiredInputs: [
        "current-solana-route-manifest",
        "current-solana-publish-readiness",
        "current-production-requirements",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-production-requirements",
      title: "Refresh Solana production requirements",
      detail:
        "Regenerate Solana production requirements after post-deploy, prover, or inventory artifacts change.",
      checkIds: ["production-requirements-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "production-requirements",
      ],
      requiredInputs: [
        "current-post-deploy-evidence",
        "current-prover-readiness",
        "current-production-material-inventory",
      ],
    }),
    productionGateAction({
      id: "replace-destination-proof-admission",
      title: "Replace destination proof admission",
      detail:
        "Replace fail-closed Solana admission with governed-zk-verifier-v1 proof admission.",
      checkIds: ["destination-proof-admission"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "production-manifest-patch",
        "--confirm-governed-solana-material",
        "true",
        "--apply",
        "true",
      ],
      requiredInputs: ["governed-solana-destination-proof-admission"],
    }),
    productionGateAction({
      id: "publish-governed-solana-proof-material",
      title: "Publish governed Solana proof material",
      detail:
        "Publish governed Solana source proof packages, final TOML evidence, and production-ready browser prover sidecars.",
      checkIds: [
        "production-requirements-ready",
        "destination-proof-admission",
        "proof-material-ceremony-package-ready",
        "proof-material-bundle-ready",
      ],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "complete-governed-proof-material",
        "complete-governed-proof-material-and-production-manifest",
      ]),
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "proof-material-ceremony-package",
      ],
      requiredInputs: [
        "governed-solana-source-proof-material",
        "reviewed-final-solana-offline-toml",
        "production-ready-solana-browser-prover-sidecars",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-proof-material-ceremony-package",
      title: "Refresh Solana proof-material ceremony package",
      detail:
        "Regenerate the Solana proof-material ceremony package after proof bundle or source-burn scaffold artifacts change.",
      checkIds: ["proof-material-ceremony-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "proof-material-ceremony-package",
      ],
      requiredInputs: [
        "current-proof-material-bundle",
        "current-source-burn-proof-scaffold",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-proof-material-bundle",
      title: "Refresh Solana proof-material bundle",
      detail:
        "Regenerate the Solana proof-material bundle after the proof-material request changes.",
      checkIds: ["proof-material-bundle-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "proof-material-bundle",
      ],
      requiredInputs: ["current-proof-material-request"],
    }),
    productionGateAction({
      id: "refresh-solana-source-material-handoff-verification",
      title: "Refresh Solana source-material handoff verification",
      detail:
        "Re-run live Solana source-material handoff verification after the handoff package changes.",
      checkIds: ["source-material-handoff-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "verify-source-material-handoff",
      ],
      requiredInputs: ["current-source-material-handoff"],
    }),
    productionGateAction({
      id: "refresh-solana-source-burn-proof-scaffold",
      title: "Refresh Solana source-burn proof scaffold",
      detail:
        "Re-run source-burn-readiness and source-burn-proof-request after the selected source burn evidence changes.",
      checkIds: ["source-burn-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "source-burn-proof-request",
      ],
      requiredInputs: [
        "current-source-burn-readiness",
        "current-source-burn-submission",
      ],
    }),
    productionGateAction({
      id: "configure-route-manager-runtime",
      title: "Configure route-manager runtime",
      detail:
        "Run publish-readiness with a permitted TAIRA route-manager authority and runtime-only signing key.",
      checkIds: [
        "publish-readiness-ready",
        "route-manager-access-ready",
        "operator-handoff-ready",
      ],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "grant-taira-route-manager-access",
        "set-runtime-route-manager-private-key",
      ]),
      command: [
        "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY=<runtime-only-private-key-hex>",
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "publish-readiness",
        "--authority",
        "<taira-route-manager-account-id>",
      ],
      requiredInputs: [
        "taira-route-manager-i105-account",
        "CanManageSccpRouteManifests",
        "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-route-manager-access-request",
      title: "Refresh Solana route-manager access request",
      detail:
        "Regenerate the Solana route-manager access request after publication, proof, runtime, or requirements artifacts change.",
      checkIds: ["route-manager-access-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "route-manager-access-request",
        "--authority",
        "<taira-route-manager-account-id>",
      ],
      requiredInputs: [
        "current-route-publication-request",
        "current-solana-publish-readiness",
        "current-production-requirements",
        "current-proof-material-bundle",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-operator-handoff",
      title: "Refresh Solana operator handoff",
      detail:
        "Regenerate the Solana operator handoff after proof, publication, access, or lane artifacts change.",
      checkIds: ["operator-handoff-artifact-consistency"],
      checks,
      artifactDetail: findActionDetail(actionSources, [
        "refresh-operator-handoff",
        "refresh-route-publication-request",
        "refresh-route-manager-access-request",
      ]),
      command: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "operator-handoff",
        "--authority",
        "<taira-route-manager-account-id>",
      ],
      requiredInputs: [
        "current-proof-material-ceremony-package",
        "current-route-publication-request",
        "current-route-manager-access-request",
        "current-lane-activation-proposal",
      ],
    }),
    productionGateAction({
      id: "run-solana-smoke-readiness",
      title: "Run Solana smoke-readiness",
      detail: solanaSmokeReadinessNextRequiredAction(
        checks.find((check) => check.id === "smoke-readiness-ready"),
      ),
      checkIds: ["smoke-readiness-ready"],
      checks,
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
      requiredInputs: smokeMissingInputIds,
    }),
    productionGateAction({
      id: "refresh-solana-smoke-readiness",
      title: "Refresh Solana smoke-readiness",
      detail:
        "Regenerate Solana smoke-readiness after public preflight or prover package artifacts change.",
      checkIds: ["smoke-readiness-artifact-consistency"],
      checks,
      command: [
        "npm",
        "run",
        "e2e:sccp:solana-smoke-readiness",
        "--",
        "--allow-incomplete",
        "true",
      ],
      requiredInputs: [
        "current-public-solana-route-preflight",
        "current-solana-prover-modules-and-sidecars",
      ],
    }),
    productionGateAction({
      id: "refresh-solana-deployment-video",
      title: "Refresh Solana deployment video",
      detail:
        "Regenerate the Solana deployment MP4 and subtitles after activation or smoke-readiness artifacts change.",
      checkIds: ["deployment-video-artifact-consistency"],
      checks,
      command: ["npm", "run", "sccp:solana:deploy", "--", "deployment-video"],
      requiredInputs: [
        "current-solana-activation-package",
        "current-solana-smoke-readiness",
      ],
    }),
    productionGateAction({
      id: "record-bidirectional-live-video",
      title: "Record bidirectional live-transfer MP4",
      detail:
        "Record a real bidirectional TAIRA <-> Solana SCCP MP4 after public preflight, proof material, route publication, smoke-readiness, and completed transfer evidence are available.",
      checkIds: ["live-bidirectional-video"],
      checks,
      command: [
        "npm",
        "run",
        "e2e:sccp:solana-video",
        "--",
        "--live-evidence",
        "<completed-solana-bidirectional-live-evidence.json>",
        "--production-gate",
        commandPath(
          productionGateReportPath,
          path.join(DEFAULT_OUTPUT_DIR, REPORT_FILE),
        ),
        "--smoke-readiness",
        commandPath(smokeReadinessPath, DEFAULT_SMOKE_READINESS_PATH),
        "--activation-package",
        commandPath(activationPackagePath, DEFAULT_ACTIVATION_PACKAGE_PATH),
        "--operator-handoff",
        commandPath(operatorHandoffPath, DEFAULT_OPERATOR_HANDOFF_PATH),
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
  ].filter(Boolean);
};

const auditItem = ({
  id,
  requirement,
  checkIds,
  evidence = {},
  blockers = [],
  checks,
}) => {
  const relatedChecks = checkIds.map((checkId) =>
    checks.find((check) => check.id === checkId),
  );
  const missingCheckIds = checkIds.filter(
    (checkId, index) => !relatedChecks[index],
  );
  const failed = relatedChecks.filter((check) => check?.status !== "pass");
  const failedCheckIds = failed.map((check) => check.id);
  const blockerIds = blockers
    .map((blocker) => {
      if (typeof blocker === "string") {
        return blocker;
      }
      if (isRecord(blocker)) {
        return readFirstString(blocker, "id");
      }
      return "";
    })
    .filter(Boolean);
  const proven =
    missingCheckIds.length === 0 &&
    failedCheckIds.length === 0 &&
    blockers.length === 0;
  return {
    id,
    requirement,
    status: proven ? "proven" : "incomplete",
    checkIds,
    missingCheckIds,
    failedCheckIds,
    blockerIds,
    unresolvedIds: [...missingCheckIds, ...failedCheckIds, ...blockerIds],
    evidence,
    blockers,
  };
};

const buildCompletionAudit = ({ checks, deploymentVideoTranscript }) => {
  const deployment = readFirstRecord(deploymentVideoTranscript, "deployment");
  const routePublicationRequestCheck = checks.find(
    (check) => check.id === "route-publication-request-ready",
  );
  const productionRequirementsArtifactConsistencyCheck = checks.find(
    (check) => check.id === "production-requirements-artifact-consistency",
  );
  const routePublicationArtifactConsistencyCheck = checks.find(
    (check) => check.id === "route-publication-request-artifact-consistency",
  );
  const routePublishBlockedArtifactConsistencyCheck = checks.find(
    (check) => check.id === "route-publish-blocked-artifact-consistency",
  );
  const routeManagerAccessArtifactConsistencyCheck = checks.find(
    (check) => check.id === "route-manager-access-artifact-consistency",
  );
  const sourceMaterialHandoffArtifactConsistencyCheck = checks.find(
    (check) => check.id === "source-material-handoff-artifact-consistency",
  );
  const sourceBurnArtifactConsistencyCheck = checks.find(
    (check) => check.id === "source-burn-artifact-consistency",
  );
  const activationPackageCheck = checks.find(
    (check) => check.id === "activation-package-ready",
  );
  const laneActivationProposalCheck = checks.find(
    (check) => check.id === "lane-activation-proposal-ready",
  );
  const laneActivationProposalArtifactConsistencyCheck = checks.find(
    (check) => check.id === "lane-activation-proposal-artifact-consistency",
  );
  const activationArtifactConsistencyCheck = checks.find(
    (check) => check.id === "activation-artifact-consistency",
  );
  const operatorHandoffArtifactConsistencyCheck = checks.find(
    (check) => check.id === "operator-handoff-artifact-consistency",
  );
  const proofMaterialCeremonyArtifactConsistencyCheck = checks.find(
    (check) => check.id === "proof-material-ceremony-artifact-consistency",
  );
  const proofMaterialBundleArtifactConsistencyCheck = checks.find(
    (check) => check.id === "proof-material-bundle-artifact-consistency",
  );
  const smokeReadinessArtifactConsistencyCheck = checks.find(
    (check) => check.id === "smoke-readiness-artifact-consistency",
  );
  const deploymentVideoArtifactConsistencyCheck = checks.find(
    (check) => check.id === "deployment-video-artifact-consistency",
  );
  const deploymentVideoCheck = checks.find(
    (check) => check.id === "deployment-video-present",
  );
  const productionManifestPatch = readFirstRecord(
    deployment,
    "productionManifestPatch",
    "production_manifest_patch",
  );
  const noFakeProofBlockers = [];
  if (
    productionManifestPatch?.productionProofMaterialGenerated === true ||
    productionManifestPatch?.production_proof_material_generated === true
  ) {
    noFakeProofBlockers.push(
      "Production manifest patch claims generated proof material.",
    );
  }
  return [
    ...(routePublicationRequestCheck
      ? [
          auditItem({
            id: "route-manager-publication-handoff",
            requirement:
              "Package the non-secret Solana route publication request for route-manager review.",
            checkIds: [
              "route-publication-request-ready",
              ...(routePublicationArtifactConsistencyCheck
                ? ["route-publication-request-artifact-consistency"]
                : []),
            ],
            evidence: {
              routePublicationRequest:
                routePublicationRequestCheck.evidence ?? {},
              routePublicationArtifactConsistency:
                routePublicationArtifactConsistencyCheck?.evidence ?? null,
            },
            checks,
          }),
        ]
      : []),
    auditItem({
      id: "solana-testnet-deployment",
      requirement:
        "Create and deploy real Solana SCCP testnet programs, mint, state, canary, and source-burn evidence.",
      checkIds: [
        "deployment-video-present",
        "source-material-handoff-verified",
        ...(sourceMaterialHandoffArtifactConsistencyCheck
          ? ["source-material-handoff-artifact-consistency"]
          : []),
        "source-burn-proof-request-ready",
        ...(sourceBurnArtifactConsistencyCheck
          ? ["source-burn-artifact-consistency"]
          : []),
      ],
      evidence: {
        verifierProgramId:
          deployment?.verifierProgramId ?? deployment?.verifier_program_id,
        bridgeProgramId:
          deployment?.bridgeProgramId ?? deployment?.bridge_program_id,
        sourceBridgeProgramId:
          deployment?.sourceBridgeProgramId ??
          deployment?.source_bridge_program_id,
        tokenMintAddress:
          deployment?.tokenMintAddress ?? deployment?.token_mint_address,
        sourceBurnSignature:
          deployment?.sourceBurnSubmission?.signature ??
          deployment?.source_burn_submission?.signature ??
          null,
        sourceBurnProofRequest:
          checks.find((check) => check.id === "source-burn-proof-request-ready")
            ?.evidence ?? null,
        sourceMaterialHandoffArtifactConsistency:
          sourceMaterialHandoffArtifactConsistencyCheck?.evidence ?? null,
        sourceBurnArtifactConsistency:
          sourceBurnArtifactConsistencyCheck?.evidence ?? null,
      },
      checks,
    }),
    auditItem({
      id: "public-taira-route-publication",
      requirement:
        "Publish a production-ready public TAIRA taira_sol_xor route manifest.",
      checkIds: [
        "public-preflight-ready",
        "public-solana-lane-ready",
        "public-verifier-programdata-immutable",
        "public-bridge-source-programdata-immutable",
        ...(laneActivationProposalCheck
          ? ["lane-activation-proposal-ready"]
          : []),
        ...(laneActivationProposalArtifactConsistencyCheck
          ? ["lane-activation-proposal-artifact-consistency"]
          : []),
        ...(activationPackageCheck ? ["activation-package-ready"] : []),
        ...(activationArtifactConsistencyCheck
          ? ["activation-artifact-consistency"]
          : []),
        "publish-readiness-ready",
        ...(productionRequirementsArtifactConsistencyCheck
          ? ["production-requirements-artifact-consistency"]
          : []),
        "route-manager-access-ready",
        "operator-handoff-ready",
        ...(routePublicationArtifactConsistencyCheck
          ? ["route-publication-request-artifact-consistency"]
          : []),
        ...(routePublishBlockedArtifactConsistencyCheck
          ? ["route-publish-blocked-artifact-consistency"]
          : []),
        ...(routeManagerAccessArtifactConsistencyCheck
          ? ["route-manager-access-artifact-consistency"]
          : []),
        ...(operatorHandoffArtifactConsistencyCheck
          ? ["operator-handoff-artifact-consistency"]
          : []),
      ],
      evidence: {
        publicPreflight:
          checks.find((check) => check.id === "public-preflight-ready")
            ?.evidence ?? null,
        publicSolanaLane:
          checks.find((check) => check.id === "public-solana-lane-ready")
            ?.evidence ?? null,
        activationPackage: activationPackageCheck?.evidence ?? null,
        laneActivationProposal: laneActivationProposalCheck?.evidence ?? null,
        laneActivationProposalArtifactConsistency:
          laneActivationProposalArtifactConsistencyCheck?.evidence ?? null,
        activationArtifactConsistency:
          activationArtifactConsistencyCheck?.evidence ?? null,
        publishReadiness:
          checks.find((check) => check.id === "publish-readiness-ready")
            ?.evidence ?? null,
        productionRequirementsArtifactConsistency:
          productionRequirementsArtifactConsistencyCheck?.evidence ?? null,
        routeManagerAccess:
          checks.find((check) => check.id === "route-manager-access-ready")
            ?.evidence ?? null,
        routeManagerAccessArtifactConsistency:
          routeManagerAccessArtifactConsistencyCheck?.evidence ?? null,
        routePublicationArtifactConsistency:
          routePublicationArtifactConsistencyCheck?.evidence ?? null,
        routePublishBlockedArtifactConsistency:
          routePublishBlockedArtifactConsistencyCheck?.evidence ?? null,
        operatorHandoff:
          checks.find((check) => check.id === "operator-handoff-ready")
            ?.evidence ?? null,
        operatorHandoffArtifactConsistency:
          operatorHandoffArtifactConsistencyCheck?.evidence ?? null,
      },
      checks,
    }),
    auditItem({
      id: "governed-proof-material",
      requirement:
        "Use governed Solana source/destination proof material instead of placeholder or envelope-only proof paths.",
      checkIds: [
        "production-requirements-ready",
        ...(productionRequirementsArtifactConsistencyCheck
          ? ["production-requirements-artifact-consistency"]
          : []),
        "destination-proof-admission",
        ...checks
          .filter(
            (check) => check.id === "proof-material-ceremony-package-ready",
          )
          .map((check) => check.id),
        ...(proofMaterialCeremonyArtifactConsistencyCheck
          ? ["proof-material-ceremony-artifact-consistency"]
          : []),
        "proof-material-bundle-ready",
        ...(proofMaterialBundleArtifactConsistencyCheck
          ? ["proof-material-bundle-artifact-consistency"]
          : []),
      ],
      evidence: {
        productionRequirements:
          checks.find((check) => check.id === "production-requirements-ready")
            ?.evidence ?? null,
        productionRequirementsArtifactConsistency:
          productionRequirementsArtifactConsistencyCheck?.evidence ?? null,
        destinationProofAdmission:
          checks.find((check) => check.id === "destination-proof-admission")
            ?.evidence ?? null,
        proofMaterialBundle:
          checks.find((check) => check.id === "proof-material-bundle-ready")
            ?.evidence ?? null,
        proofMaterialBundleArtifactConsistency:
          proofMaterialBundleArtifactConsistencyCheck?.evidence ?? null,
        proofMaterialCeremonyPackage:
          checks.find(
            (check) => check.id === "proof-material-ceremony-package-ready",
          )?.evidence ?? null,
        proofMaterialCeremonyArtifactConsistency:
          proofMaterialCeremonyArtifactConsistencyCheck?.evidence ?? null,
      },
      checks,
    }),
    auditItem({
      id: "wallet-and-prover-smoke-readiness",
      requirement:
        "Configure wallet/prover runtime inputs needed for real bidirectional SCCP smoke.",
      checkIds: [
        "smoke-readiness-ready",
        ...(smokeReadinessArtifactConsistencyCheck
          ? ["smoke-readiness-artifact-consistency"]
          : []),
      ],
      evidence: {
        smokeReadiness:
          checks.find((check) => check.id === "smoke-readiness-ready")
            ?.evidence ?? {},
        smokeReadinessArtifactConsistency:
          smokeReadinessArtifactConsistencyCheck?.evidence ?? null,
      },
      checks,
    }),
    auditItem({
      id: "bidirectional-live-transfer-video",
      requirement:
        "Record a real bidirectional TAIRA <-> Solana SCCP MP4 after public route and proof gates pass.",
      checkIds: ["live-bidirectional-video"],
      evidence:
        checks.find((check) => check.id === "live-bidirectional-video")
          ?.evidence ?? {},
      checks,
    }),
    auditItem({
      id: "deployment-walkthrough-video",
      requirement:
        "Provide an MP4 with subtitles explaining the real Solana deployment steps.",
      checkIds: [
        "deployment-video-present",
        ...(deploymentVideoArtifactConsistencyCheck
          ? ["deployment-video-artifact-consistency"]
          : []),
        "deployment-video-honest-status",
      ],
      evidence:
        checks.find((check) => check.id === "deployment-video-present")
          ?.evidence ?? {},
      checks,
    }),
    auditItem({
      id: "no-fake-completion-claims",
      requirement:
        "Do not leave fake proof material or claim production completion before all live gates pass.",
      checkIds: ["deployment-video-honest-status"],
      evidence: {
        productionManifestPatch,
        deploymentVideoReady: deploymentVideoCheck?.status === "pass",
      },
      blockers: noFakeProofBlockers,
      checks,
    }),
  ];
};

const sanitizeBlockedLiveVideoDiagnostics = (diagnostics) => {
  if (!isRecord(diagnostics)) {
    return null;
  }
  const sanitized = Object.fromEntries(
    Object.entries(diagnostics).filter(([key]) => key !== "productionGate"),
  );
  const booleanArtifactStatusFields = [
    "ready",
    "productionReady",
    "submitReady",
    "readyForLaneGovernanceReview",
    "publicLaneReady",
    "productionProofMaterialReady",
    "productionLaneReady",
  ];
  const summarizeArtifactReady = (artifact) =>
    firstBooleanFlag(
      artifact?.ready,
      artifact?.readyForRouteManagerReview,
      artifact?.readyForOperatorReview,
      artifact?.readyForLaneGovernanceReview,
      artifact?.readyForProofMaterialCeremony,
      artifact?.readyForActivationReview,
      artifact?.readyToBuildIsi,
      artifact?.readyToPublish,
      artifact?.accessReady,
      artifact?.readyToSubmitWithCurrentRuntime,
      artifact?.productionActivationReady,
      artifact?.productionRouteReady,
      artifact?.productionLaneReady,
      artifact?.productionProofMaterialReady,
      artifact?.publicLaneReady,
    );
  const normalizeArtifactSummary = (artifact) => {
    if (!isRecord(artifact)) {
      return artifact;
    }
    const normalized = { ...artifact, ready: summarizeArtifactReady(artifact) };
    for (const field of booleanArtifactStatusFields) {
      normalized[field] = normalized[field] === true;
    }
    return normalized;
  };
  for (const key of [
    "activationPackage",
    "activation_package",
    "operatorHandoff",
    "operator_handoff",
  ]) {
    const diagnostic = readFirstRecord(sanitized, key);
    const artifacts = readFirstRecord(diagnostic, "artifacts");
    if (!isRecord(diagnostic) || !isRecord(artifacts)) {
      continue;
    }
    sanitized[key] = {
      ...diagnostic,
      artifacts: Object.fromEntries(
        Object.entries(artifacts).map(([artifactKey, artifact]) => [
          artifactKey,
          normalizeArtifactSummary(artifact),
        ]),
      ),
    };
  }
  for (const key of ["deploymentVideo", "deployment_video"]) {
    const deploymentVideo = readFirstRecord(sanitized, key);
    const activationSmokeReadiness = readFirstRecord(
      deploymentVideo,
      "activationSmokeReadiness",
      "activation_smoke_readiness",
    );
    if (!isRecord(deploymentVideo) || !isRecord(activationSmokeReadiness)) {
      continue;
    }
    sanitized[key] = {
      ...deploymentVideo,
      activationSmokeReadiness: normalizeArtifactSummary(
        activationSmokeReadiness,
      ),
    };
  }
  return sanitized;
};

const blockedLiveVideoSubtitleEvidence = ({
  blockedLiveVideoTranscript,
  blockedLiveVideoVttPath,
  artifactFacts,
} = {}) => {
  const fact = artifactFact(artifactFacts, blockedLiveVideoVttPath);
  const cueTexts = Array.isArray(fact.vtt?.cueTexts) ? fact.vtt.cueTexts : [];
  const combinedText = cueTexts.join("\n");
  const requiredFragments = [
    "Solana SCCP live video blocked before recording.",
    "This MP4 is a blocked diagnostic only and is not live transfer evidence.",
    "Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.",
  ];
  const missingRequiredFragments = requiredFragments.filter(
    (fragment) =>
      fact.vtt?.firstCue !== fragment &&
      fact.vtt?.lastCue !== fragment &&
      !combinedText.includes(fragment),
  );
  const blockedReason = isRecord(blockedLiveVideoTranscript)
    ? readFirstString(blockedLiveVideoTranscript, "reason")
    : "";
  const reasonTokens = blockedReason
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((token) => token.length >= 8);
  const reasonExplained =
    !blockedReason ||
    reasonTokens.length === 0 ||
    cueTexts.some((cue) =>
      reasonTokens.some((token) => cue.toLowerCase().includes(token)),
    );
  return {
    path: normalizePath(blockedLiveVideoVttPath),
    exists: fact.exists === true,
    size: Number(fact.size) || 0,
    webvtt: fact.vtt?.webvtt === true,
    cueCount: fact.vtt?.cueCount ?? 0,
    cueTextSha256: fact.vtt?.cueTextSha256 ?? null,
    firstCue: fact.vtt?.firstCue ?? null,
    lastCue: fact.vtt?.lastCue ?? null,
    requiredFragments,
    missingRequiredFragments,
    reasonExplained,
    ready:
      fact.exists === true &&
      Number(fact.size) > 0 &&
      fact.vtt?.webvtt === true &&
      Number(fact.vtt?.cueCount ?? 0) >= 10 &&
      missingRequiredFragments.length === 0 &&
      reasonExplained,
  };
};

const blockedLiveVideoDiagnosticMp4Evidence = ({
  blockedLiveVideoTranscript,
  blockedLiveVideoMp4Path,
  artifactFacts,
} = {}) => {
  const fact = artifactFact(artifactFacts, blockedLiveVideoMp4Path);
  const transcriptArtifacts = readFirstArray(
    blockedLiveVideoTranscript,
    "videoArtifacts",
    "video_artifacts",
  );
  const transcriptMp4 =
    transcriptArtifacts.find((artifact) => {
      const mediaType = readFirstString(artifact, "mediaType", "media_type");
      const artifactPath = readFirstString(artifact, "path");
      return (
        mediaType === "video/mp4" ||
        normalizePath(artifactPath) === normalizePath(blockedLiveVideoMp4Path)
      );
    }) ?? null;
  const diagnosticFlagsReady =
    blockedLiveVideoTranscript?.diagnosticVideoOnly === true &&
    blockedLiveVideoTranscript?.notLiveTransferEvidence === true &&
    transcriptMp4?.diagnosticOnly === true &&
    transcriptMp4?.notLiveTransferEvidence === true;
  return {
    path: normalizePath(blockedLiveVideoMp4Path),
    exists: fact.exists === true,
    size: Number(fact.size) || 0,
    media: fact.media ?? null,
    diagnosticFlagsReady,
    ready:
      fact.exists === true &&
      Number(fact.size) > 0 &&
      fact.media?.formatOk === true &&
      fact.media?.hasVideo === true &&
      fact.media?.hasAudio === true &&
      fact.media?.hasEmbeddedSubtitle === true &&
      diagnosticFlagsReady,
  };
};

const liveVideoDiagnosticFlagEvidence = ({
  liveVideoTranscript,
  paths,
} = {}) => {
  const transcriptDiagnosticVideoOnly =
    liveVideoTranscript?.diagnosticVideoOnly === true ||
    liveVideoTranscript?.diagnostic_video_only === true;
  const transcriptNotLiveTransferEvidence =
    liveVideoTranscript?.notLiveTransferEvidence === true ||
    liveVideoTranscript?.not_live_transfer_evidence === true;
  const blockedArtifactPaths = [paths?.mp4, paths?.vtt]
    .filter((file) => typeof file === "string" && file.trim())
    .map((file) => normalizePath(file))
    .filter((file) =>
      [
        "sccp-solana-live-video-blocked.mp4",
        "sccp-solana-live-video-blocked.vtt",
      ].includes(path.basename(file)),
    );
  const diagnosticArtifacts = readFirstArray(
    liveVideoTranscript,
    "videoArtifacts",
    "video_artifacts",
  )
    .map((artifact, index) => {
      if (!isRecord(artifact)) {
        return null;
      }
      const artifactPath = readFirstString(
        artifact,
        "path",
        "file",
        "filePath",
        "file_path",
      );
      const normalizedPath = artifactPath ? normalizePath(artifactPath) : null;
      const blockedDiagnosticPath =
        normalizedPath !== null &&
        [
          "sccp-solana-live-video-blocked.mp4",
          "sccp-solana-live-video-blocked.vtt",
        ].includes(path.basename(normalizedPath));
      const diagnosticOnly =
        artifact.diagnosticOnly === true || artifact.diagnostic_only === true;
      const notLiveTransferEvidence =
        artifact.notLiveTransferEvidence === true ||
        artifact.not_live_transfer_evidence === true;
      if (
        !blockedDiagnosticPath &&
        !diagnosticOnly &&
        !notLiveTransferEvidence
      ) {
        return null;
      }
      return {
        index,
        path: normalizedPath,
        mediaType: readFirstString(artifact, "mediaType", "media_type") || null,
        blockedDiagnosticPath,
        diagnosticOnly,
        notLiveTransferEvidence,
      };
    })
    .filter(Boolean);
  return {
    transcriptDiagnosticVideoOnly,
    transcriptNotLiveTransferEvidence,
    blockedArtifactPaths,
    diagnosticArtifacts,
    ready:
      !transcriptDiagnosticVideoOnly &&
      !transcriptNotLiveTransferEvidence &&
      blockedArtifactPaths.length === 0 &&
      diagnosticArtifacts.length === 0,
  };
};

export const buildSolanaProductionGateSuccessExecutionPolicy = ({
  toriiUrl,
  solanaRpcUrl,
  skipSolanaRpc = false,
  preflightReportOverride = false,
  freshPreflightCompleted = false,
  preflightReport = null,
  publishReadinessReport = null,
} = {}) => {
  const publicEndpoint = readFirstRecord(
    publishReadinessReport,
    "publicEndpoint",
    "public_endpoint",
  );
  const target = readFirstRecord(publicEndpoint, "target");
  const governancePinnedToriiUrl =
    readFirstString(target, "toriiUrl", "torii_url") ||
    readFirstString(publicEndpoint, "toriiUrl", "torii_url");
  const normalizedGovernanceToriiUrl = trimString(
    governancePinnedToriiUrl,
  ).replace(/\/+$/u, "");
  const governancePinReady =
    publicEndpoint?.publicationTargetReady === true &&
    publicEndpoint?.directPublicNodePublicationReady === true &&
    trimString(publicEndpoint?.toriiUrl).replace(/\/+$/u, "") ===
      normalizedGovernanceToriiUrl &&
    readFirstString(target, "targetKind", "target_kind") ===
      "explicit-taira-public-node" &&
    readFirstString(target, "mcpUrl", "mcp_url").replace(/\/+$/u, "") ===
      `${normalizedGovernanceToriiUrl}/v1/mcp` &&
    readFirstString(publicEndpoint, "mcpUrl", "mcp_url").replace(
      /\/+$/u,
      "",
    ) === `${normalizedGovernanceToriiUrl}/v1/mcp` &&
    target?.canonicalPublicNodeRoot === true &&
    target?.canonicalRolloutTargetReady === true &&
    target?.mcpMatchesToriiRoot === true;
  const base = buildSccpSolanaSuccessNetworkPolicy({
    toriiUrl,
    solanaRpcUrl: solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
    skipSolanaRpc,
    preflightReportOverride,
    prerequisiteReportOverrideIds: [],
    injectedReadbackOverride: false,
    requireGovernancePin: true,
    governancePinnedToriiUrl,
    governancePinReady,
  });
  const problems = [...base.problems];
  if (!freshPreflightCompleted) {
    problems.push({
      id: "fresh-public-preflight-completed",
      detail:
        "Production completion requires a newly executed canonical public preflight in this process.",
    });
  }
  const preflightEndpointIdentityReady =
    preflightReport?.manifestSource === "public" &&
    preflightReport?.taira?.toriiUrl === base.toriiUrl &&
    preflightReport?.solana?.rpcUrl === base.solanaRpcUrl;
  if (!preflightEndpointIdentityReady) {
    problems.push({
      id: "fresh-preflight-endpoint-identity",
      detail:
        "The fresh preflight report must bind the exact canonical TAIRA validator and Solana testnet RPC roots used by the production gate.",
    });
  }
  return {
    ...base,
    schema: "iroha-demo-sccp-solana-production-gate-success-policy/v1",
    mode: "canonical-fresh-read-only-v1",
    freshPreflightCompleted,
    preflightEndpointIdentityReady,
    ready: problems.length === 0,
    problems,
  };
};

export const checkLiveBidirectionalVideo = ({
  liveVideoTranscript,
  liveVideoTranscriptPath = null,
  liveVideoMp4Path = DEFAULT_LIVE_VIDEO_MP4_PATH,
  liveVideoVttPath = DEFAULT_LIVE_VIDEO_VTT_PATH,
  blockedLiveVideoTranscript = null,
  blockedLiveVideoTranscriptPath = null,
  blockedLiveVideoMp4Path = DEFAULT_BLOCKED_LIVE_VIDEO_MP4_PATH,
  blockedLiveVideoVttPath = DEFAULT_BLOCKED_LIVE_VIDEO_VTT_PATH,
  artifactFacts = {},
  successExecutionPolicy,
  authoritativeRevalidation,
  activationPackageReport = null,
  operatorHandoffReport = null,
  expectedLiveEvidencePackageHashes = null,
} = {}) => {
  if (!isRecord(liveVideoTranscript)) {
    const blockedDiagnostics = isRecord(blockedLiveVideoTranscript)
      ? readFirstRecord(blockedLiveVideoTranscript, "diagnostics")
      : null;
    const blockedProductionGateSnapshotOmitted = isRecord(
      readFirstRecord(blockedDiagnostics, "productionGate"),
    );
    const blockedSubtitle = blockedLiveVideoSubtitleEvidence({
      blockedLiveVideoTranscript,
      blockedLiveVideoVttPath,
      artifactFacts,
    });
    const blockedDiagnosticMp4 = blockedLiveVideoDiagnosticMp4Evidence({
      blockedLiveVideoTranscript,
      blockedLiveVideoMp4Path,
      artifactFacts,
    });
    return makeCheck(
      "live-bidirectional-video",
      false,
      "No completed Solana bidirectional live-video transcript is available.",
      {
        transcriptPath: liveVideoTranscriptPath,
        blockedTranscriptPath: blockedLiveVideoTranscriptPath,
        blockedTranscript: isRecord(blockedLiveVideoTranscript)
          ? {
              path: blockedLiveVideoTranscriptPath,
              present: true,
              schema:
                readFirstString(blockedLiveVideoTranscript, "schema") || null,
              routeId:
                readFirstString(
                  blockedLiveVideoTranscript,
                  "routeId",
                  "route_id",
                ) || null,
              checkedAt:
                readFirstString(
                  blockedLiveVideoTranscript,
                  "checkedAt",
                  "checked_at",
                ) || null,
              ready: blockedLiveVideoTranscript.ready === true,
              reason:
                readFirstString(blockedLiveVideoTranscript, "reason") || null,
              nextActionIdCount: readFirstArray(
                blockedLiveVideoTranscript,
                "nextActionIds",
                "next_action_ids",
              ).filter((id) => typeof id === "string" && id.trim()).length,
              nextActionDetailCount: readFirstArray(
                blockedLiveVideoTranscript,
                "nextActionDetails",
                "next_action_details",
              ).length,
            }
          : {
              path: blockedLiveVideoTranscriptPath,
              present: false,
            },
        blockedSubtitle,
        blockedDiagnosticMp4,
        blockedReason: isRecord(blockedLiveVideoTranscript)
          ? readFirstString(blockedLiveVideoTranscript, "reason")
          : null,
        blockedPreflightReady: isRecord(blockedLiveVideoTranscript)
          ? blockedLiveVideoTranscript.preflightReady === true
          : null,
        blockedNextActionIds: isRecord(blockedLiveVideoTranscript)
          ? readFirstArray(
              blockedLiveVideoTranscript,
              "nextActionIds",
              "next_action_ids",
            ).filter((id) => typeof id === "string" && id.trim())
          : [],
        blockedNextActionDetails: isRecord(blockedLiveVideoTranscript)
          ? readFirstArray(
              blockedLiveVideoTranscript,
              "nextActionDetails",
              "next_action_details",
            )
              .map((action) =>
                normalizeActionDetail(action, "blocked-live-video"),
              )
              .filter(Boolean)
          : [],
        blockedDiagnostics:
          sanitizeBlockedLiveVideoDiagnostics(blockedDiagnostics),
        blockedProductionGateSnapshotOmitted,
        blockedProductionGateSnapshotOmissionReason:
          blockedProductionGateSnapshotOmitted
            ? "Omitted to avoid recursively embedding stale production-gate evidence in the current production-gate report."
            : null,
        blockedPublicSolanaCapability: isRecord(blockedLiveVideoTranscript)
          ? readFirstRecord(
              blockedLiveVideoTranscript,
              "publicSolanaCapability",
              "public_solana_capability",
            )
          : null,
        blockedPublicSolanaLane: isRecord(blockedLiveVideoTranscript)
          ? readFirstRecord(
              blockedLiveVideoTranscript,
              "publicSolanaLane",
              "public_solana_lane",
            )
          : null,
      },
    );
  }
  const paths = videoArtifactPaths({
    transcript: liveVideoTranscript,
    fallbackMp4Path: liveVideoMp4Path,
    fallbackVttPath: liveVideoVttPath,
  });
  const diagnosticFlags = liveVideoDiagnosticFlagEvidence({
    liveVideoTranscript,
    paths,
  });
  const liveEvidence = readFirstRecord(liveVideoTranscript, "liveEvidence");
  const forward = readFirstRecord(
    liveEvidence,
    "tairaToSolana",
    "taira_to_solana",
  );
  const reverse = readFirstRecord(
    liveEvidence,
    "solanaToTaira",
    "solana_to_taira",
  );
  const schemaOk =
    liveVideoTranscript.schema === "iroha-demo-sccp-solana-live-video/v1";
  const routeOk =
    readFirstString(liveVideoTranscript, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyOk =
    liveVideoTranscript.ready === true &&
    liveVideoTranscript.preflightReady === true;
  const transcriptSuccessPolicy = readFirstRecord(
    liveVideoTranscript,
    "successEvidencePolicy",
    "success_evidence_policy",
  );
  const transcriptPreflightPolicy = readFirstRecord(
    transcriptSuccessPolicy,
    "preflight",
  );
  const transcriptProductionGatePolicy = readFirstRecord(
    transcriptSuccessPolicy,
    "productionGate",
    "production_gate",
  );
  const transcriptProductionGateFailedIds = readFirstArray(
    transcriptProductionGatePolicy,
    "failedCheckIds",
    "failed_check_ids",
  ).filter((id) => typeof id === "string" && id.trim());
  const transcriptProductionGateStateOk =
    transcriptProductionGatePolicy?.ready === true ||
    (transcriptProductionGatePolicy?.ready === false &&
      transcriptProductionGateFailedIds.length === 1 &&
      transcriptProductionGateFailedIds[0] === "live-bidirectional-video");
  const liveActivationPackageHash = readFirstString(
    liveEvidence,
    "activationPackageHash",
    "activation_package_hash",
  );
  const liveOperatorHandoffHash = readFirstString(
    liveEvidence,
    "operatorHandoffHash",
    "operator_handoff_hash",
  );
  const expectedActivationPackageHash = readFirstString(
    expectedLiveEvidencePackageHashes ?? activationPackageReport,
    "activationPackageHash",
    "activation_package_hash",
  );
  const expectedOperatorHandoffHash = readFirstString(
    expectedLiveEvidencePackageHashes ?? operatorHandoffReport,
    "operatorHandoffHash",
    "operator_handoff_hash",
    "handoffHash",
    "handoff_hash",
  );
  const packageHashesOk =
    isHex32(liveActivationPackageHash) &&
    isHex32(liveOperatorHandoffHash) &&
    liveActivationPackageHash === expectedActivationPackageHash &&
    liveOperatorHandoffHash === expectedOperatorHandoffHash &&
    transcriptSuccessPolicy?.activationPackageHash ===
      liveActivationPackageHash &&
    transcriptSuccessPolicy?.operatorHandoffHash === liveOperatorHandoffHash;
  const transcriptSuccessPolicyOk =
    transcriptSuccessPolicy?.schema ===
      "iroha-demo-sccp-solana-live-video-success-policy/v1" &&
    transcriptSuccessPolicy?.mode === "canonical-fresh-read-only-v1" &&
    transcriptSuccessPolicy?.ready === true &&
    transcriptSuccessPolicy?.diagnosticOnly === false &&
    transcriptSuccessPolicy?.readOnly === true &&
    transcriptSuccessPolicy?.freshPreflightCompleted === true &&
    transcriptSuccessPolicy?.freshProductionGateCompleted === true &&
    transcriptSuccessPolicy?.nativeNetworkClientsUsed === true &&
    transcriptSuccessPolicy?.canonicalTairaValidatorRoot === true &&
    transcriptSuccessPolicy?.canonicalSolanaTestnetRpc === true &&
    transcriptSuccessPolicy?.governancePinReady === true &&
    transcriptSuccessPolicy?.preflightReportOverride === false &&
    transcriptSuccessPolicy?.skipSolanaRpc === false &&
    readFirstArray(transcriptSuccessPolicy, "prerequisiteReportOverrideIds")
      .length === 0 &&
    readFirstArray(transcriptSuccessPolicy, "problems").length === 0 &&
    transcriptPreflightPolicy?.freshlyComputed === true &&
    transcriptPreflightPolicy?.suppliedReportUsed === false &&
    transcriptPreflightPolicy?.skipSolanaRpc === false &&
    transcriptPreflightPolicy?.toriiUrl === successExecutionPolicy?.toriiUrl &&
    transcriptPreflightPolicy?.solanaRpcUrl ===
      successExecutionPolicy?.solanaRpcUrl &&
    transcriptProductionGatePolicy?.freshlyComputed === true &&
    transcriptProductionGatePolicy?.suppliedReportUsed === false &&
    transcriptProductionGateStateOk;
  const authoritativeReadback = readFirstRecord(
    liveVideoTranscript,
    "authoritativeReadback",
    "authoritative_readback",
  );
  const transcriptAuthoritativeReadbackOk =
    liveVideoTranscript.authoritativeReadbackVerified === true &&
    authoritativeReadback?.ready === true &&
    authoritativeReadback?.readOnly === true;
  const trustedFreshRevalidationOk =
    authoritativeRevalidation?.ready === true &&
    authoritativeRevalidation?.readOnly === true &&
    authoritativeRevalidation?.nativeNetworkClientsUsed === true &&
    authoritativeRevalidation?.packageHashesReady === true;
  const successExecutionPolicyOk =
    successExecutionPolicy?.ready === true &&
    successExecutionPolicy?.freshPreflightCompleted === true &&
    successExecutionPolicy?.preflightEndpointIdentityReady === true &&
    successExecutionPolicy?.canonicalTairaValidatorRoot === true &&
    successExecutionPolicy?.canonicalSolanaTestnetRpc === true &&
    successExecutionPolicy?.governancePinReady === true &&
    successExecutionPolicy?.preflightReportOverride === false &&
    successExecutionPolicy?.skipSolanaRpc === false;
  const liveEvidenceStatus = liveBidirectionalEvidenceStatus(forward, reverse);
  const evidenceOk = liveEvidenceStatus.ok;
  const mp4Ok = mp4StreamEvidenceReady(artifactFacts, paths.mp4);
  const mediaVerification = readFirstRecord(
    liveVideoTranscript,
    "mediaVerification",
    "media_verification",
  );
  const mediaVerificationOk = mediaVerification?.ready === true;
  const subtitleExplanation = liveVideoSubtitleExplanation(
    liveVideoTranscript,
    liveEvidenceStatus,
  );
  const vttFact = artifactFact(artifactFacts, paths.vtt);
  const vttCueTextMatchesTranscript =
    vttFact.vtt?.cueCount === subtitleExplanation.cueCount &&
    vttFact.vtt?.cueTextSha256 === subtitleExplanation.cueTextSha256;
  const mp4Fact = artifactFact(artifactFacts, paths.mp4);
  const embeddedSubtitleMatchesVtt =
    mp4Fact.media?.embeddedSubtitle?.extracted === true &&
    mp4Fact.media.embeddedSubtitle.cueCount === vttFact.vtt?.cueCount &&
    mp4Fact.media.embeddedSubtitle.cueTextSha256 === vttFact.vtt?.cueTextSha256;
  const vttOk =
    vttEvidenceReady(artifactFacts, paths.vtt) && vttCueTextMatchesTranscript;
  const ok =
    schemaOk &&
    routeOk &&
    readyOk &&
    evidenceOk &&
    mp4Ok &&
    mediaVerificationOk &&
    vttOk &&
    embeddedSubtitleMatchesVtt &&
    subtitleExplanation.ok &&
    diagnosticFlags.ready &&
    packageHashesOk &&
    transcriptSuccessPolicyOk &&
    transcriptAuthoritativeReadbackOk &&
    successExecutionPolicyOk &&
    trustedFreshRevalidationOk;
  return makeCheck(
    "live-bidirectional-video",
    ok,
    ok
      ? "Solana bidirectional SCCP live MP4 has video plus embedded explanatory subtitles, and the VTT artifact is present."
      : "Solana bidirectional SCCP live video evidence is missing, incomplete, generic, or lacks embedded explanatory subtitles.",
    {
      transcriptPath: liveVideoTranscriptPath,
      schemaOk,
      routeOk,
      readyOk,
      evidenceOk,
      liveEvidenceStatus,
      packageHashesOk,
      packageHashes: {
        activationPackageHash: liveActivationPackageHash || null,
        expectedActivationPackageHash: expectedActivationPackageHash || null,
        operatorHandoffHash: liveOperatorHandoffHash || null,
        expectedOperatorHandoffHash: expectedOperatorHandoffHash || null,
      },
      transcriptSuccessPolicy: transcriptSuccessPolicy ?? null,
      transcriptSuccessPolicyOk,
      transcriptAuthoritativeReadbackOk,
      successExecutionPolicy: successExecutionPolicy ?? null,
      successExecutionPolicyOk,
      authoritativeRevalidation: authoritativeRevalidation ?? null,
      trustedFreshRevalidationOk,
      mp4: mp4Fact,
      mediaVerification: mediaVerification ?? null,
      mediaVerificationOk,
      vtt: vttFact,
      vttCueTextMatchesTranscript,
      embeddedSubtitleMatchesVtt,
      subtitleExplanation,
      diagnosticFlags,
    },
  );
};

export const buildSolanaProductionGateReport = ({
  deployDir = null,
  preflightReport = null,
  preflightReportPath = null,
  requirementsReport = null,
  requirementsPath = null,
  postDeployEvidenceReport = null,
  postDeployEvidencePath = null,
  proverReadinessReport = null,
  proverReadinessPath = null,
  productionMaterialInventoryReport = null,
  productionMaterialInventoryPath = null,
  routeManifestReport = null,
  routeManifestPath = null,
  publishReadinessReport = null,
  publishReadinessPath = null,
  routePublishBlockedReport = null,
  routePublishBlockedPath = null,
  routePublicationRequestReport = null,
  routePublicationRequestPath = null,
  routeManagerAccessReport = null,
  routeManagerAccessPath = null,
  operatorHandoffReport = null,
  operatorHandoffPath = null,
  activationPackageReport = null,
  activationPackagePath = null,
  laneActivationRequestReport = null,
  laneActivationRequestPath = null,
  laneActivationProposalReport = null,
  laneActivationProposalPath = null,
  sourceMaterialHandoffReport = null,
  sourceMaterialHandoffPath = null,
  handoffVerificationReport = null,
  handoffVerificationPath = null,
  sourceBurnReadinessReport = null,
  sourceBurnReadinessPath = null,
  sourceBurnSubmissionReport = null,
  sourceBurnSubmissionPath = null,
  proofMaterialRequestReport = null,
  proofMaterialRequestPath = null,
  proofMaterialBundleReport = null,
  proofMaterialBundlePath = null,
  proofMaterialCeremonyPackageReport = null,
  proofMaterialCeremonyPackagePath = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
  deploymentVideoTranscript = null,
  deploymentVideoTranscriptPath = null,
  deploymentVideoMp4Path = DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  deploymentVideoVttPath = DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  liveVideoTranscript = null,
  liveVideoTranscriptPath = null,
  liveVideoMp4Path = DEFAULT_LIVE_VIDEO_MP4_PATH,
  liveVideoVttPath = DEFAULT_LIVE_VIDEO_VTT_PATH,
  blockedLiveVideoTranscript = null,
  blockedLiveVideoTranscriptPath = null,
  blockedLiveVideoMp4Path = DEFAULT_BLOCKED_LIVE_VIDEO_MP4_PATH,
  blockedLiveVideoVttPath = DEFAULT_BLOCKED_LIVE_VIDEO_VTT_PATH,
  artifactFacts = {},
  successExecutionPolicy,
  liveVideoAuthoritativeRevalidation,
  expectedLiveEvidencePackageHashes,
  productionGateReportPath = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const publicPreflight = checkPublicPreflightReady({
    preflightReport,
    preflightReportPath,
  });
  const publicSolanaLane = checkPublicSolanaLaneReady({
    preflightReport,
    preflightReportPath,
  });
  const publicBridgeSourceProgramdata = checkPublicBridgeSourceProgramdataReady(
    {
      preflightReport,
      preflightReportPath,
    },
  );
  const publicVerifierProgramdata = checkPublicVerifierProgramdataReady({
    preflightReport,
    preflightReportPath,
  });
  const governanceProgramRolePinsFresh = isRecord(
    productionMaterialInventoryReport,
  )
    ? checkGovernanceProgramRolePinsFresh({
        preflightReport,
        preflightReportPath,
        productionMaterialInventoryReport,
        productionMaterialInventoryPath,
      })
    : null;
  const publicRoutePublication = summarizePublicSolanaRoutePublication({
    preflightReport,
    preflightReportPath,
  });
  const productionRequirements = checkProductionRequirementsReady({
    requirementsReport,
    requirementsPath,
  });
  const productionRequirementsArtifactConsistency = isRecord(requirementsReport)
    ? checkProductionRequirementsArtifactConsistency({
        requirementsReport,
        requirementsPath,
        postDeployEvidenceReport,
        postDeployEvidencePath,
        proverReadinessReport,
        proverReadinessPath,
        productionMaterialInventoryReport,
        productionMaterialInventoryPath,
      })
    : null;
  const destinationProofAdmission = checkDestinationProofAdmissionReady({
    requirementsReport,
    requirementsPath,
  });
  const publishReadiness = checkPublishReadinessReady({
    publishReadinessReport,
    publishReadinessPath,
  });
  const routePublicationRequest = isRecord(routePublicationRequestReport)
    ? checkRoutePublicationRequestReady({
        routePublicationRequestReport,
        routePublicationRequestPath,
      })
    : null;
  const routePublicationRequestArtifactConsistency = isRecord(
    routePublicationRequestReport,
  )
    ? checkRoutePublicationRequestArtifactConsistency({
        routePublicationRequestReport,
        routePublicationRequestPath,
        routeManifestReport,
        routeManifestPath,
        publishReadinessReport,
        publishReadinessPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
      })
    : null;
  const routePublishBlockedArtifactConsistency = isRecord(
    routePublishBlockedReport,
  )
    ? checkRoutePublishBlockedArtifactConsistency({
        routePublishBlockedReport,
        routePublishBlockedPath,
        routeManifestPath,
        publishReadinessReport,
        publishReadinessPath,
        requirementsReport,
        requirementsPath,
      })
    : null;
  const routeManagerAccess = checkRouteManagerAccessReady({
    routeManagerAccessReport,
    routeManagerAccessPath,
  });
  const routeManagerAccessArtifactConsistency = isRecord(
    routeManagerAccessReport,
  )
    ? checkRouteManagerAccessArtifactConsistency({
        routeManagerAccessReport,
        routeManagerAccessPath,
        routePublicationRequestReport,
        routePublicationRequestPath,
        publishReadinessReport,
        publishReadinessPath,
        requirementsReport,
        requirementsPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
      })
    : null;
  const operatorHandoff = checkOperatorHandoffReady({
    operatorHandoffReport,
    operatorHandoffPath,
  });
  const operatorHandoffArtifactConsistency = isRecord(operatorHandoffReport)
    ? checkOperatorHandoffArtifactConsistency({
        operatorHandoffReport,
        operatorHandoffPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
        proofMaterialCeremonyPackageReport,
        proofMaterialCeremonyPackagePath,
        routePublicationRequestReport,
        routePublicationRequestPath,
        routeManagerAccessReport,
        routeManagerAccessPath,
        laneActivationProposalReport,
        laneActivationProposalPath,
        smokeReadinessReport,
        smokeReadinessPath,
      })
    : null;
  const activationPackage = isRecord(activationPackageReport)
    ? checkActivationPackageReady({
        activationPackageReport,
        activationPackagePath,
      })
    : null;
  const laneActivationProposal = isRecord(laneActivationProposalReport)
    ? checkLaneActivationProposalReady({
        laneActivationProposalReport,
        laneActivationProposalPath,
      })
    : null;
  const laneActivationProposalArtifactConsistency =
    isRecord(laneActivationProposalReport) &&
    isRecord(laneActivationRequestReport)
      ? checkLaneActivationProposalArtifactConsistency({
          laneActivationProposalReport,
          laneActivationProposalPath,
          laneActivationRequestReport,
          laneActivationRequestPath,
        })
      : null;
  const handoffVerification = checkSourceMaterialHandoffVerified({
    handoffVerificationReport,
    handoffVerificationPath,
  });
  const sourceMaterialHandoffArtifactConsistency =
    isRecord(sourceMaterialHandoffReport) && isRecord(handoffVerificationReport)
      ? checkSourceMaterialHandoffArtifactConsistency({
          sourceMaterialHandoffReport,
          sourceMaterialHandoffPath,
          handoffVerificationReport,
          handoffVerificationPath,
        })
      : null;
  const sourceBurnProofRequest = checkSourceBurnProofRequestReady({
    sourceBurnSubmissionReport,
    sourceBurnSubmissionPath,
  });
  const sourceBurnArtifactConsistency =
    isRecord(sourceBurnReadinessReport) && isRecord(sourceBurnSubmissionReport)
      ? checkSourceBurnArtifactConsistency({
          sourceBurnReadinessReport,
          sourceBurnReadinessPath,
          sourceBurnSubmissionReport,
          sourceBurnSubmissionPath,
        })
      : null;
  const proofMaterialBundle = checkProofMaterialBundleReady({
    proofMaterialBundleReport,
    proofMaterialBundlePath,
  });
  const proofMaterialBundleArtifactConsistency =
    isRecord(proofMaterialBundleReport) && isRecord(proofMaterialRequestReport)
      ? checkProofMaterialBundleArtifactConsistency({
          proofMaterialBundleReport,
          proofMaterialBundlePath,
          proofMaterialRequestReport,
          proofMaterialRequestPath,
        })
      : null;
  const proofMaterialCeremonyPackage = isRecord(
    proofMaterialCeremonyPackageReport,
  )
    ? checkProofMaterialCeremonyPackageReady({
        proofMaterialCeremonyPackageReport,
        proofMaterialCeremonyPackagePath,
      })
    : null;
  const proofMaterialCeremonyArtifactConsistency = isRecord(
    proofMaterialCeremonyPackageReport,
  )
    ? checkProofMaterialCeremonyArtifactConsistency({
        proofMaterialCeremonyPackageReport,
        proofMaterialCeremonyPackagePath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
        sourceMaterialHandoffReport,
        sourceMaterialHandoffPath,
        handoffVerificationReport,
        handoffVerificationPath,
        sourceBurnSubmissionReport,
        sourceBurnSubmissionPath,
      })
    : null;
  const activationArtifactConsistency = isRecord(activationPackageReport)
    ? checkActivationArtifactConsistency({
        activationPackageReport,
        activationPackagePath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
        proofMaterialCeremonyPackageReport,
        proofMaterialCeremonyPackagePath,
        routePublicationRequestReport,
        routePublicationRequestPath,
        routeManagerAccessReport,
        routeManagerAccessPath,
        laneActivationProposalReport,
        laneActivationProposalPath,
        operatorHandoffReport,
        operatorHandoffPath,
        smokeReadinessReport,
        smokeReadinessPath,
      })
    : null;
  const smokeReadiness = checkSmokeReadinessReady({
    smokeReadinessReport,
    smokeReadinessPath,
  });
  const smokeReadinessArtifactConsistency = isRecord(smokeReadinessReport)
    ? checkSmokeReadinessArtifactConsistency({
        smokeReadinessReport,
        smokeReadinessPath,
        preflightReport,
        preflightReportPath,
        proofMaterialBundleReport,
        proofMaterialBundlePath,
      })
    : null;
  const deploymentVideo = checkDeploymentVideoPresent({
    deploymentVideoTranscript,
    deploymentVideoTranscriptPath,
    deploymentVideoMp4Path,
    deploymentVideoVttPath,
    artifactFacts,
  });
  const deploymentVideoArtifactConsistency =
    isRecord(deploymentVideoTranscript) && isRecord(activationPackageReport)
      ? checkDeploymentVideoArtifactConsistency({
          deploymentVideoTranscript,
          deploymentVideoTranscriptPath,
          activationPackageReport,
          activationPackagePath,
          sourceMaterialHandoffReport,
          sourceMaterialHandoffPath,
          handoffVerificationReport,
          handoffVerificationPath,
          sourceBurnReadinessReport,
          sourceBurnReadinessPath,
          sourceBurnSubmissionReport,
          sourceBurnSubmissionPath,
        })
      : null;
  const liveVideo = checkLiveBidirectionalVideo({
    liveVideoTranscript,
    liveVideoTranscriptPath,
    liveVideoMp4Path,
    liveVideoVttPath,
    blockedLiveVideoTranscript,
    blockedLiveVideoTranscriptPath,
    blockedLiveVideoMp4Path,
    blockedLiveVideoVttPath,
    artifactFacts,
    successExecutionPolicy,
    authoritativeRevalidation: liveVideoAuthoritativeRevalidation,
    activationPackageReport,
    operatorHandoffReport,
    expectedLiveEvidencePackageHashes,
  });
  const deploymentVideoStatus = checkDeploymentVideoHonestStatus({
    deploymentVideoTranscript,
    publicPreflightReady: publicPreflight.status === "pass",
    productionRequirementsReady: productionRequirements.status === "pass",
    publishReadinessReady: publishReadiness.status === "pass",
    liveVideoReady:
      smokeReadiness.status === "pass" && liveVideo.status === "pass",
  });
  const checks = [
    publicPreflight,
    publicSolanaLane,
    publicVerifierProgramdata,
    publicBridgeSourceProgramdata,
    ...(governanceProgramRolePinsFresh ? [governanceProgramRolePinsFresh] : []),
    productionRequirements,
    ...(productionRequirementsArtifactConsistency
      ? [productionRequirementsArtifactConsistency]
      : []),
    destinationProofAdmission,
    publishReadiness,
    ...(routePublicationRequest ? [routePublicationRequest] : []),
    ...(routePublicationRequestArtifactConsistency
      ? [routePublicationRequestArtifactConsistency]
      : []),
    ...(routePublishBlockedArtifactConsistency
      ? [routePublishBlockedArtifactConsistency]
      : []),
    routeManagerAccess,
    ...(routeManagerAccessArtifactConsistency
      ? [routeManagerAccessArtifactConsistency]
      : []),
    operatorHandoff,
    ...(operatorHandoffArtifactConsistency
      ? [operatorHandoffArtifactConsistency]
      : []),
    ...(activationPackage ? [activationPackage] : []),
    ...(laneActivationProposal ? [laneActivationProposal] : []),
    ...(laneActivationProposalArtifactConsistency
      ? [laneActivationProposalArtifactConsistency]
      : []),
    ...(activationArtifactConsistency ? [activationArtifactConsistency] : []),
    handoffVerification,
    ...(sourceMaterialHandoffArtifactConsistency
      ? [sourceMaterialHandoffArtifactConsistency]
      : []),
    sourceBurnProofRequest,
    ...(sourceBurnArtifactConsistency ? [sourceBurnArtifactConsistency] : []),
    ...(proofMaterialCeremonyPackage ? [proofMaterialCeremonyPackage] : []),
    ...(proofMaterialCeremonyArtifactConsistency
      ? [proofMaterialCeremonyArtifactConsistency]
      : []),
    proofMaterialBundle,
    ...(proofMaterialBundleArtifactConsistency
      ? [proofMaterialBundleArtifactConsistency]
      : []),
    smokeReadiness,
    ...(smokeReadinessArtifactConsistency
      ? [smokeReadinessArtifactConsistency]
      : []),
    deploymentVideo,
    ...(deploymentVideoArtifactConsistency
      ? [deploymentVideoArtifactConsistency]
      : []),
    deploymentVideoStatus,
    liveVideo,
  ];
  const failed = failedChecks(checks);
  const failedCheckIds = failed.map((check) => check.id);
  const blockerIds = Array.from(new Set(failedCheckIds));
  const ready = checks.every((check) => check.status === "pass");
  const completionAudit = buildCompletionAudit({
    checks,
    deploymentVideoTranscript,
  });
  const completionAuditReady = completionAudit.every(
    (item) => item.status === "proven",
  );
  const smokeReadinessAction =
    solanaSmokeReadinessNextRequiredAction(smokeReadiness);
  const nextActionDetails = ready
    ? []
    : buildProductionGateActionDetails({
        checks,
        activationPackageReport,
        operatorHandoffReport,
        smokeReadinessReport,
        productionGateReportPath,
        smokeReadinessPath,
        activationPackagePath,
        operatorHandoffPath,
      });
  const nextActions = nextActionDetails
    .map((action) => action?.id)
    .filter((id) => typeof id === "string" && id.trim().length > 0);
  return {
    schema: "iroha-demo-sccp-solana-production-gate/v1",
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    ready,
    checkedAt,
    checks,
    failedCheckIds,
    blockerIds,
    publicSolanaCapability:
      publicPreflight.evidence?.publicSolanaCapability ?? null,
    publicSolanaLane: publicSolanaLane.evidence ?? null,
    routePublication: publicRoutePublication,
    successExecutionPolicy: successExecutionPolicy ?? null,
    liveVideoAuthoritativeRevalidation:
      liveVideoAuthoritativeRevalidation ?? null,
    completionAuditReady,
    completionAudit,
    artifacts: {
      deployDir,
      preflightReportPath,
      requirementsPath,
      postDeployEvidencePath,
      proverReadinessPath,
      productionMaterialInventoryPath,
      routeManifestPath,
      publishReadinessPath,
      routePublishBlockedPath,
      routePublicationRequestPath,
      routeManagerAccessPath,
      operatorHandoffPath,
      activationPackagePath,
      laneActivationRequestPath,
      laneActivationProposalPath,
      sourceMaterialHandoffPath,
      handoffVerificationPath,
      sourceBurnReadinessPath,
      sourceBurnSubmissionPath,
      proofMaterialRequestPath,
      proofMaterialBundlePath,
      proofMaterialCeremonyPackagePath,
      smokeReadinessPath,
      deploymentVideoTranscriptPath,
      liveVideoTranscriptPath,
      blockedLiveVideoTranscriptPath,
      blockedLiveVideoMp4Path,
      blockedLiveVideoVttPath,
    },
    nextRequiredActions: ready
      ? []
      : [
          "Activate the public TAIRA Solana SCCP lane with immutable verifier and trust-anchor evidence.",
          "Publish a production-ready public TAIRA taira_sol_xor manifest.",
          "Replace fail-closed Solana admission with governed-zk-verifier-v1 proof admission.",
          "Publish governed Solana source proof packages and post-deploy live evidence.",
          "Run publish-readiness with a real route-manager authority and runtime-only signing key.",
          smokeReadinessAction,
          "Record a real bidirectional TAIRA <-> Solana SCCP MP4 after public preflight passes.",
        ].filter(Boolean),
    nextActions,
    nextActionIds: nextActions,
    nextActionDetails,
  };
};

export const parseArgs = (argv) =>
  parseStrictCliArgs(argv, {
    booleanFlags: ["help"],
    optionalBooleanFlags: ["allow-incomplete", "skip-solana-rpc"],
    valueFlags: [
      "torii-url",
      "solana-rpc-url",
      "fetch-timeout-ms",
      "fetch-attempts",
      "preflight-report",
      "requirements",
      "post-deploy-evidence",
      "prover-readiness",
      "production-material-inventory",
      "route-manifest",
      "publish-readiness",
      "route-publish-blocked",
      "route-publication-request",
      "route-manager-access-request",
      "operator-handoff",
      "activation-package",
      "lane-activation-request",
      "lane-activation-proposal",
      "source-material-handoff",
      "handoff-verification",
      "source-burn-readiness",
      "source-burn-submission",
      "proof-material-request",
      "proof-material-bundle",
      "proof-material-ceremony-package",
      "smoke-readiness",
      "deployment-video-transcript",
      "deployment-video-mp4",
      "deployment-video-vtt",
      "live-video-transcript",
      "live-video-mp4",
      "live-video-vtt",
      "blocked-live-video-transcript",
      "blocked-live-video-mp4",
      "blocked-live-video-vtt",
      "deploy-dir",
      "output-dir",
    ],
  });

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-production-gate.mjs [options]

Read-only production completion gate for TAIRA <-> Solana SCCP.

Options:
  --torii-url URL                         TAIRA Torii endpoint; success requires a canonical taira-validator-N HTTPS root (diagnostic default: ${DEFAULT_TAIRA_TORII_URL})
  --solana-rpc-url URL                    Canonical Solana testnet RPC endpoint (default: ${DEFAULT_SOLANA_TESTNET_RPC_URL})
  --fetch-timeout-ms MS                   Per-request fetch timeout for fresh public reads
  --fetch-attempts N                      Per-request retry attempts for fresh public reads
  --preflight-report PATH                 Diagnostic-only public preflight override; can never complete the gate
  --requirements PATH                     Production requirements report
  --post-deploy-evidence PATH             Solana post-deploy live readback evidence
  --prover-readiness PATH                 Solana prover-readiness report
  --production-material-inventory PATH    Solana production material inventory report
  --route-manifest PATH                   Local Solana route manifest artifact
  --publish-readiness PATH                Route publish-readiness report
  --route-publish-blocked PATH            Blocked route publish attempt report
  --route-publication-request PATH        Route-manager publication request handoff report
  --route-manager-access-request PATH     Route-manager access/signing handoff report
  --operator-handoff PATH                 Consolidated Solana operator handoff report
  --activation-package PATH               TAIRA Solana activation package report
  --lane-activation-request PATH          Public Solana lane activation request package
  --lane-activation-proposal PATH         Public Solana lane activation proposal package
  --source-material-handoff PATH          Source-material handoff package
  --handoff-verification PATH             Source-material handoff verification report
  --source-burn-readiness PATH            Source-burn readiness report
  --source-burn-submission PATH           Source-burn submission with canonical source-proof request
  --proof-material-request PATH           Proof-material request package
  --proof-material-bundle PATH            Proof-material bundle manifest
  --proof-material-ceremony-package PATH  Proof-material ceremony package report
  --smoke-readiness PATH                  Solana live smoke-readiness report
  --deployment-video-transcript PATH      Deployment video transcript JSON
  --deployment-video-mp4 PATH             Deployment MP4 path
  --deployment-video-vtt PATH             Deployment subtitle VTT path
  --live-video-transcript PATH            Completed bidirectional live-video transcript JSON
  --live-video-mp4 PATH                   Completed bidirectional live MP4 path
  --live-video-vtt PATH                   Completed bidirectional live subtitle VTT path
  --blocked-live-video-transcript PATH    Blocked live-video transcript JSON for diagnostics
  --blocked-live-video-mp4 PATH           Blocked live-video diagnostic MP4
  --blocked-live-video-vtt PATH           Blocked live-video diagnostic subtitle VTT
  --deploy-dir PATH                       Solana deployment artifact directory (default: output/sccp-solana-deploy; inferred from --output-dir when it contains deployment artifacts)
  --output-dir PATH                       Report directory (default: output/sccp-solana-production-gate)
  --allow-incomplete [true|false]         Write report and exit 0 even when incomplete
  --skip-solana-rpc [true|false]          Diagnostic-only when true; skipped RPC checks can never complete the gate
  --help                                  Show this help
`);
};

const readJsonIfExists = async (file) => {
  if (!file) {
    return null;
  }
  const resolved = normalizePath(file);
  return readStableJsonFileIfExists(resolved, {
    label: "Solana production-gate JSON input",
  });
};

const MAX_SOLANA_EVIDENCE_MP4_BYTES = 2 * 1024 * 1024 * 1024;

const probeMp4Media = (file) =>
  withStableRegularFileDescriptorsSync(
    file,
    ([probeFd, subtitleFd], resolved) => {
      const descriptorPath =
        process.platform === "win32" ? resolved : "/dev/fd/3";
      const childStdio = (fd) =>
        process.platform === "win32"
          ? ["ignore", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe", fd];
      const result = spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=format_name,duration",
          "-show_entries",
          "stream=index,codec_type,codec_name,width,height",
          "-of",
          "json",
          descriptorPath,
        ],
        { encoding: "utf8", stdio: childStdio(probeFd) },
      );
      if (result.error) {
        return {
          probed: false,
          error: result.error.message,
        };
      }
      if (result.status !== 0) {
        return {
          probed: false,
          error: result.stderr || "ffprobe failed",
        };
      }
      try {
        const parsed = JSON.parse(result.stdout || "{}");
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const formatName = String(parsed.format?.format_name ?? "");
        const subtitleExtraction = spawnSync(
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
          { encoding: "utf8", stdio: childStdio(subtitleFd) },
        );
        const embeddedCueTexts =
          subtitleExtraction.status === 0
            ? parseWebVttCueTexts(subtitleExtraction.stdout || "")
            : [];
        return {
          probed: true,
          formatName,
          duration: parsed.format?.duration ?? null,
          formatOk: /(^|,)mov|mp4|m4a|3gp|3g2|mj2(,|$)/u.test(formatName),
          hasVideo: streams.some((stream) => stream.codec_type === "video"),
          hasAudio: streams.some((stream) => stream.codec_type === "audio"),
          hasEmbeddedSubtitle: streams.some(
            (stream) => stream.codec_type === "subtitle",
          ),
          embeddedSubtitle: {
            extracted:
              subtitleExtraction.status === 0 && embeddedCueTexts.length > 0,
            cueCount: embeddedCueTexts.length,
            cueTextSha256:
              embeddedCueTexts.length > 0
                ? cueTextHash(embeddedCueTexts)
                : null,
            firstCue: embeddedCueTexts[0] ?? null,
            lastCue: embeddedCueTexts.at(-1) ?? null,
            error:
              subtitleExtraction.status === 0
                ? null
                : subtitleExtraction.stderr ||
                  "ffmpeg subtitle extraction failed",
          },
          streams: streams.map((stream) => ({
            index: stream.index,
            codecType: stream.codec_type,
            codecName: stream.codec_name,
            width: stream.width ?? null,
            height: stream.height ?? null,
          })),
        };
      } catch (error) {
        return {
          probed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      label: "Solana production-gate MP4 input",
      maxBytes: MAX_SOLANA_EVIDENCE_MP4_BYTES,
      descriptorCount: 2,
    },
  );

export const collectArtifactFacts = async (pathsToCheck) => {
  const facts = {};
  for (const file of pathsToCheck) {
    if (!file) {
      continue;
    }
    const resolved = normalizePath(file);
    try {
      const info = await lstat(resolved);
      const fact = {
        path: resolved,
        exists: info.isFile() && !info.isSymbolicLink(),
        size: info.size,
        symbolicLink: info.isSymbolicLink(),
      };
      if (fact.exists && resolved.endsWith(".mp4")) {
        fact.media = probeMp4Media(resolved);
      }
      if (fact.exists && resolved.endsWith(".vtt")) {
        const text = (
          await readStableRegularFile(resolved, {
            label: "Solana production-gate WebVTT input",
            maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
          })
        ).toString("utf8");
        const cueTexts = parseWebVttCueTexts(text);
        fact.vtt = {
          webvtt: /^WEBVTT(?:\s|$)/u.test(text),
          cueCount: cueTexts.length,
          cueTextSha256: cueTextHash(cueTexts),
          firstCue: cueTexts[0] ?? null,
          lastCue: cueTexts.at(-1) ?? null,
          cueTexts,
        };
      }
      facts[resolved] = {
        ...fact,
      };
    } catch {
      facts[resolved] = {
        path: resolved,
        exists: false,
        size: 0,
      };
    }
  }
  return facts;
};

const collectVideoPaths = ({
  deploymentVideoTranscript,
  deploymentVideoMp4Path,
  deploymentVideoVttPath,
  liveVideoTranscript,
  liveVideoMp4Path,
  liveVideoVttPath,
  blockedLiveVideoMp4Path,
  blockedLiveVideoVttPath,
}) => {
  const deploymentPaths = videoArtifactPaths({
    transcript: deploymentVideoTranscript,
    fallbackMp4Path: deploymentVideoMp4Path,
    fallbackVttPath: deploymentVideoVttPath,
  });
  const livePaths = videoArtifactPaths({
    transcript: liveVideoTranscript,
    fallbackMp4Path: liveVideoMp4Path,
    fallbackVttPath: liveVideoVttPath,
  });
  return [
    deploymentPaths.mp4,
    deploymentPaths.vtt,
    livePaths.mp4,
    livePaths.vtt,
    blockedLiveVideoMp4Path,
    blockedLiveVideoVttPath,
  ];
};

export const runSccpSolanaProductionGate = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const deployDir = resolveDeployArtifactDir({
    deployDir: options.deployDir,
    outputDir: options.outputDir,
  });
  const requirementsPath = deployArtifactPath({
    explicit: options.requirements,
    deployDir,
    defaultPath: DEFAULT_REQUIREMENTS_PATH,
  });
  const postDeployEvidencePath = deployArtifactPath({
    explicit: options.postDeployEvidence,
    deployDir,
    defaultPath: DEFAULT_POST_DEPLOY_EVIDENCE_PATH,
  });
  const proverReadinessPath = deployArtifactPath({
    explicit: options.proverReadiness,
    deployDir,
    defaultPath: DEFAULT_PROVER_READINESS_PATH,
  });
  const productionMaterialInventoryPath = deployArtifactPath({
    explicit: options.productionMaterialInventory,
    deployDir,
    defaultPath: DEFAULT_PRODUCTION_MATERIAL_INVENTORY_PATH,
  });
  const routeManifestPath = deployArtifactPath({
    explicit: options.routeManifest,
    deployDir,
    defaultPath: DEFAULT_ROUTE_MANIFEST_PATH,
  });
  const publishReadinessPath = deployArtifactPath({
    explicit: options.publishReadiness,
    deployDir,
    defaultPath: DEFAULT_PUBLISH_READINESS_PATH,
  });
  const routePublishBlockedPath = deployArtifactPath({
    explicit: options.routePublishBlocked,
    deployDir,
    defaultPath: DEFAULT_ROUTE_PUBLISH_BLOCKED_PATH,
  });
  const routePublicationRequestPath = deployArtifactPath({
    explicit: options.routePublicationRequest,
    deployDir,
    defaultPath: DEFAULT_ROUTE_PUBLICATION_REQUEST_PATH,
  });
  const routeManagerAccessPath = deployArtifactPath({
    explicit: options.routeManagerAccess,
    deployDir,
    defaultPath: DEFAULT_ROUTE_MANAGER_ACCESS_REQUEST_PATH,
  });
  const operatorHandoffPath = deployArtifactPath({
    explicit: options.operatorHandoff,
    deployDir,
    defaultPath: DEFAULT_OPERATOR_HANDOFF_PATH,
  });
  const activationPackagePath = deployArtifactPath({
    explicit: options.activationPackage,
    deployDir,
    defaultPath: DEFAULT_ACTIVATION_PACKAGE_PATH,
  });
  const laneActivationRequestPath = deployArtifactPath({
    explicit: options.laneActivationRequest,
    deployDir,
    defaultPath: DEFAULT_LANE_ACTIVATION_REQUEST_PATH,
  });
  const laneActivationProposalPath = deployArtifactPath({
    explicit: options.laneActivationProposal,
    deployDir,
    defaultPath: DEFAULT_LANE_ACTIVATION_PROPOSAL_PATH,
  });
  const sourceMaterialHandoffPath = deployArtifactPath({
    explicit: options.sourceMaterialHandoff,
    deployDir,
    defaultPath: DEFAULT_SOURCE_MATERIAL_HANDOFF_PATH,
  });
  const handoffVerificationPath = deployArtifactPath({
    explicit: options.handoffVerification,
    deployDir,
    defaultPath: DEFAULT_HANDOFF_VERIFICATION_PATH,
  });
  const sourceBurnReadinessPath = deployArtifactPath({
    explicit: options.sourceBurnReadiness,
    deployDir,
    defaultPath: DEFAULT_SOURCE_BURN_READINESS_PATH,
  });
  const sourceBurnSubmissionPath = deployArtifactPath({
    explicit: options.sourceBurnSubmission,
    deployDir,
    defaultPath: DEFAULT_SOURCE_BURN_SUBMISSION_PATH,
  });
  const proofMaterialRequestPath = deployArtifactPath({
    explicit: options.proofMaterialRequest,
    deployDir,
    defaultPath: DEFAULT_PROOF_MATERIAL_REQUEST_PATH,
  });
  const proofMaterialBundlePath = deployArtifactPath({
    explicit: options.proofMaterialBundle,
    deployDir,
    defaultPath: DEFAULT_PROOF_MATERIAL_BUNDLE_PATH,
  });
  const proofMaterialCeremonyPackagePath = deployArtifactPath({
    explicit: options.proofMaterialCeremonyPackage,
    deployDir,
    defaultPath: DEFAULT_PROOF_MATERIAL_CEREMONY_PACKAGE_PATH,
  });
  const smokeReadinessPath = deployArtifactPath({
    explicit: options.smokeReadiness,
    deployDir,
    defaultPath: DEFAULT_SMOKE_READINESS_PATH,
    subpath: SMOKE_READINESS_SUBPATH,
  });
  const deploymentVideoTranscriptPath = deployArtifactPath({
    explicit: options.deploymentVideoTranscript,
    deployDir,
    defaultPath: DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH,
  });
  const deploymentVideoMp4Path = deployArtifactPath({
    explicit: options.deploymentVideoMp4,
    deployDir,
    defaultPath: DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  });
  const deploymentVideoVttPath = deployArtifactPath({
    explicit: options.deploymentVideoVtt,
    deployDir,
    defaultPath: DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  });
  const liveVideoTranscriptPath = path.resolve(
    options.liveVideoTranscript || DEFAULT_LIVE_VIDEO_TRANSCRIPT_PATH,
  );
  const liveVideoMp4Path = path.resolve(
    options.liveVideoMp4 || DEFAULT_LIVE_VIDEO_MP4_PATH,
  );
  const liveVideoVttPath = path.resolve(
    options.liveVideoVtt || DEFAULT_LIVE_VIDEO_VTT_PATH,
  );
  const blockedLiveVideoTranscriptPath = path.resolve(
    options.blockedLiveVideoTranscript ||
      (deployDir
        ? path.join(
            deployDir,
            "live-video",
            "sccp-solana-live-video-blocked.json",
          )
        : DEFAULT_BLOCKED_LIVE_VIDEO_TRANSCRIPT_PATH),
  );
  const blockedLiveVideoMp4Path = path.resolve(
    options.blockedLiveVideoMp4 ||
      (deployDir
        ? path.join(
            deployDir,
            "live-video",
            "sccp-solana-live-video-blocked.mp4",
          )
        : DEFAULT_BLOCKED_LIVE_VIDEO_MP4_PATH),
  );
  const blockedLiveVideoVttPath = path.resolve(
    options.blockedLiveVideoVtt ||
      (deployDir
        ? path.join(
            deployDir,
            "live-video",
            "sccp-solana-live-video-blocked.vtt",
          )
        : DEFAULT_BLOCKED_LIVE_VIDEO_VTT_PATH),
  );

  const preflightReportOverride = Boolean(options.preflightReport);
  let freshPreflightCompleted = false;
  let preflightReportPath = options.preflightReport
    ? path.resolve(options.preflightReport)
    : null;
  let preflightReport;
  if (preflightReportPath) {
    preflightReport = await readJsonIfExists(preflightReportPath);
  } else {
    const preflight = await runSccpSolanaRoutePreflight({
      toriiUrl: options.toriiUrl,
      solanaRpcUrl: options.solanaRpcUrl,
      outputDir: path.join(outputDir, "preflight"),
      fetchTimeoutMs: options.fetchTimeoutMs,
      fetchAttempts: options.fetchAttempts,
      skipSolanaRpc: options.skipSolanaRpc,
    });
    preflightReport = preflight.report;
    preflightReportPath = preflight.reportPath;
    freshPreflightCompleted = true;
  }

  const requirementsReport = await readJsonIfExists(requirementsPath);
  const postDeployEvidenceReport = await readJsonIfExists(
    postDeployEvidencePath,
  );
  const proverReadinessReport = await readJsonIfExists(proverReadinessPath);
  const productionMaterialInventoryReport = await readJsonIfExists(
    productionMaterialInventoryPath,
  );
  const routeManifestReport = await readJsonIfExists(routeManifestPath);
  const publishReadinessReport = await readJsonIfExists(publishReadinessPath);
  const routePublishBlockedReport = await readJsonIfExists(
    routePublishBlockedPath,
  );
  const routePublicationRequestReport = await readJsonIfExists(
    routePublicationRequestPath,
  );
  const routeManagerAccessReport = await readJsonIfExists(
    routeManagerAccessPath,
  );
  const operatorHandoffReport = await readJsonIfExists(operatorHandoffPath);
  const activationPackageReport = await readJsonIfExists(activationPackagePath);
  const laneActivationRequestReport = await readJsonIfExists(
    laneActivationRequestPath,
  );
  const laneActivationProposalReport = await readJsonIfExists(
    laneActivationProposalPath,
  );
  const sourceMaterialHandoffReport = await readJsonIfExists(
    sourceMaterialHandoffPath,
  );
  const handoffVerificationReport = await readJsonIfExists(
    handoffVerificationPath,
  );
  const sourceBurnReadinessReport = await readJsonIfExists(
    sourceBurnReadinessPath,
  );
  const sourceBurnSubmissionReport = await readJsonIfExists(
    sourceBurnSubmissionPath,
  );
  const proofMaterialRequestReport = await readJsonIfExists(
    proofMaterialRequestPath,
  );
  const proofMaterialBundleReport = await readJsonIfExists(
    proofMaterialBundlePath,
  );
  const proofMaterialCeremonyPackageReport = await readJsonIfExists(
    proofMaterialCeremonyPackagePath,
  );
  const smokeReadinessReport = await readJsonIfExists(smokeReadinessPath);
  const deploymentVideoTranscript = await readJsonIfExists(
    deploymentVideoTranscriptPath,
  );
  const liveVideoTranscript = await readJsonIfExists(liveVideoTranscriptPath);
  const blockedLiveVideoTranscript = await readJsonIfExists(
    blockedLiveVideoTranscriptPath,
  );
  const artifactFacts = await collectArtifactFacts(
    collectVideoPaths({
      deploymentVideoTranscript,
      deploymentVideoMp4Path,
      deploymentVideoVttPath,
      liveVideoTranscript,
      liveVideoMp4Path,
      liveVideoVttPath,
      blockedLiveVideoMp4Path,
      blockedLiveVideoVttPath,
    }),
  );

  const successExecutionPolicy =
    buildSolanaProductionGateSuccessExecutionPolicy({
      toriiUrl: options.toriiUrl,
      solanaRpcUrl: options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
      skipSolanaRpc: options.skipSolanaRpc,
      preflightReportOverride,
      freshPreflightCompleted,
      preflightReport,
      publishReadinessReport,
    });
  let liveVideoAuthoritativeRevalidation = {
    ready: false,
    readOnly: true,
    nativeNetworkClientsUsed: true,
    packageHashesReady: false,
    reason: isRecord(liveVideoTranscript)
      ? "Canonical fresh readback has not passed."
      : "No completed live-video transcript is available.",
  };
  if (
    isRecord(liveVideoTranscript) &&
    successExecutionPolicy.ready === true &&
    preflightReport?.ready === true
  ) {
    try {
      const {
        normalizeSolanaLiveTransferEvidence,
        solanaLiveEvidencePackageHashProblems,
        verifySolanaLiveTransferReadbacks,
      } = await import("./sccp-solana-live-video.mjs");
      const normalizedLiveEvidence = normalizeSolanaLiveTransferEvidence(
        readFirstRecord(liveVideoTranscript, "liveEvidence", "live_evidence"),
        { checkedAt: new Date().toISOString() },
      );
      const packageHashProblems = solanaLiveEvidencePackageHashProblems({
        liveEvidence: normalizedLiveEvidence,
        diagnostics: {
          activationPackage: {
            activationPackageHash: readFirstString(
              activationPackageReport,
              "activationPackageHash",
              "activation_package_hash",
            ),
          },
          operatorHandoff: {
            handoffHash: readFirstString(
              operatorHandoffReport,
              "handoffHash",
              "handoff_hash",
            ),
          },
        },
      });
      if (packageHashProblems.length > 0) {
        throw new Error(
          `Live evidence package hash binding failed: ${packageHashProblems
            .map((problem) => problem.id)
            .join(", ")}.`,
        );
      }
      const readback = await verifySolanaLiveTransferReadbacks({
        liveEvidence: normalizedLiveEvidence,
        preflightReport,
        solanaRpcUrl: successExecutionPolicy.solanaRpcUrl,
        toriiUrl: successExecutionPolicy.toriiUrl,
      });
      liveVideoAuthoritativeRevalidation = {
        ...readback,
        nativeNetworkClientsUsed: true,
        packageHashesReady: true,
        revalidatedAt: new Date().toISOString(),
      };
    } catch (error) {
      liveVideoAuthoritativeRevalidation = {
        ready: false,
        readOnly: true,
        nativeNetworkClientsUsed: true,
        packageHashesReady: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const reportPath = path.join(outputDir, REPORT_FILE);
  const report = buildSolanaProductionGateReport({
    deployDir,
    preflightReport,
    preflightReportPath,
    requirementsReport,
    requirementsPath,
    postDeployEvidenceReport,
    postDeployEvidencePath,
    proverReadinessReport,
    proverReadinessPath,
    productionMaterialInventoryReport,
    productionMaterialInventoryPath,
    routeManifestReport,
    routeManifestPath,
    publishReadinessReport,
    publishReadinessPath,
    routePublishBlockedReport,
    routePublishBlockedPath,
    routePublicationRequestReport,
    routePublicationRequestPath,
    routeManagerAccessReport,
    routeManagerAccessPath,
    operatorHandoffReport,
    operatorHandoffPath,
    activationPackageReport,
    activationPackagePath,
    laneActivationRequestReport,
    laneActivationRequestPath,
    laneActivationProposalReport,
    laneActivationProposalPath,
    sourceMaterialHandoffReport,
    sourceMaterialHandoffPath,
    handoffVerificationReport,
    handoffVerificationPath,
    sourceBurnReadinessReport,
    sourceBurnReadinessPath,
    sourceBurnSubmissionReport,
    sourceBurnSubmissionPath,
    proofMaterialRequestReport,
    proofMaterialRequestPath,
    proofMaterialBundleReport,
    proofMaterialBundlePath,
    proofMaterialCeremonyPackageReport,
    proofMaterialCeremonyPackagePath,
    smokeReadinessReport,
    smokeReadinessPath,
    deploymentVideoTranscript,
    deploymentVideoTranscriptPath,
    deploymentVideoMp4Path,
    deploymentVideoVttPath,
    liveVideoTranscript,
    liveVideoTranscriptPath,
    liveVideoMp4Path,
    liveVideoVttPath,
    blockedLiveVideoTranscript,
    blockedLiveVideoTranscriptPath,
    blockedLiveVideoMp4Path,
    blockedLiveVideoVttPath,
    artifactFacts,
    successExecutionPolicy,
    liveVideoAuthoritativeRevalidation,
    productionGateReportPath: reportPath,
  });
  await writeAtomicJsonFile(reportPath, report);
  return { report, reportPath };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const { report, reportPath } = await runSccpSolanaProductionGate({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    fetchTimeoutMs: args["fetch-timeout-ms"],
    fetchAttempts: args["fetch-attempts"],
    preflightReport: args["preflight-report"],
    requirements: args.requirements,
    postDeployEvidence: args["post-deploy-evidence"],
    proverReadiness: args["prover-readiness"],
    productionMaterialInventory: args["production-material-inventory"],
    routeManifest: args["route-manifest"],
    publishReadiness: args["publish-readiness"],
    routePublishBlocked: args["route-publish-blocked"],
    routePublicationRequest: args["route-publication-request"],
    routeManagerAccess: args["route-manager-access-request"],
    operatorHandoff: args["operator-handoff"],
    activationPackage: args["activation-package"],
    laneActivationRequest: args["lane-activation-request"],
    laneActivationProposal: args["lane-activation-proposal"],
    sourceMaterialHandoff: args["source-material-handoff"],
    handoffVerification: args["handoff-verification"],
    sourceBurnReadiness: args["source-burn-readiness"],
    sourceBurnSubmission: args["source-burn-submission"],
    proofMaterialRequest: args["proof-material-request"],
    proofMaterialBundle: args["proof-material-bundle"],
    proofMaterialCeremonyPackage: args["proof-material-ceremony-package"],
    smokeReadiness: args["smoke-readiness"],
    deploymentVideoTranscript: args["deployment-video-transcript"],
    deploymentVideoMp4: args["deployment-video-mp4"],
    deploymentVideoVtt: args["deployment-video-vtt"],
    liveVideoTranscript: args["live-video-transcript"],
    liveVideoMp4: args["live-video-mp4"],
    liveVideoVtt: args["live-video-vtt"],
    blockedLiveVideoTranscript: args["blocked-live-video-transcript"],
    blockedLiveVideoMp4: args["blocked-live-video-mp4"],
    blockedLiveVideoVtt: args["blocked-live-video-vtt"],
    deployDir: args["deploy-dir"],
    outputDir: args["output-dir"],
    skipSolanaRpc: readBoolArg(args["skip-solana-rpc"]),
  });
  console.log(`Solana SCCP production gate report: ${reportPath}`);
  if (!report.ready) {
    console.error(
      failedChecks(report.checks)
        .map((check) => `- ${check.id}: ${check.detail}`)
        .join("\n"),
    );
    if (!readBoolArg(args["allow-incomplete"])) {
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

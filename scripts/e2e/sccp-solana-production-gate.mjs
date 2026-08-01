#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, fstatSync, readSync } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountAddress } from "@iroha/iroha-js/address";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_SOLANA_TESTNET_RPC_URL,
  DEFAULT_TAIRA_TORII_URL,
  SCCP_SOLANA_EXACT_MATERIAL_SEED,
  SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED,
  SCCP_SOLANA_EXACT_PUBLIC_SIGNAL_SCHEMA_HASH,
  SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED,
  SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN,
  SCCP_SOLANA_DOMAIN,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_XOR_ASSET_KEY,
  SOLANA_SPL_TOKEN_PROGRAM_ID,
  SOLANA_TESTNET_CAIP_CHAIN_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
  TAIRA_CHAIN_ID,
  deriveExactSccpSolanaMaterialConfigHash,
  runSccpSolanaRoutePreflight,
} from "./sccp-solana-route-preflight.mjs";
import {
  SOLANA_SCCP_REGISTRY_PATH,
  canonicalSccpJson,
} from "./sccp-solana-exact-registry.mjs";
import {
  SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV,
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV,
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
} from "./sccp-solana-exact-prover-governance.mjs";
import { runLocalProverSelfTest } from "./sccp-solana-live-smoke-readiness.mjs";
import { buildSolanaGovernanceEvidenceChecks } from "./sccp-solana-governance-evidence.mjs";
import {
  parseSolanaGovernanceCanonicalJsonBytes,
  parseSolanaGovernanceDuplicateFreeJsonText,
} from "./sccp-solana-governance-json.mjs";
import {
  validateSolanaOrderedInitializationEvidence,
  verifySolanaOrderedInitializationTransactions,
} from "./sccp-solana-ordered-initialization.mjs";
import {
  validateSolanaLoaderV3FreshDeployReport,
  verifySolanaLoaderV3FreshDeployReportTransactions,
} from "../solana-loader-v3-fresh-deploy.mjs";
import {
  buildSccpSolanaSuccessNetworkPolicy,
  CANONICAL_SOLANA_TESTNET_RPC_URL,
} from "./sccp-solana-success-evidence-policy.mjs";
import {
  SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS,
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH,
  analyzeSolanaLiveCaptureWitnessFrames,
  decodeSolanaLiveCaptureWitnessQr,
  normalizeSolanaLiveCaptureReviewPolicy,
  normalizeSolanaLiveCaptureWitness,
  verifySolanaLiveCaptureReviewAttestation,
} from "./sccp-solana-live-capture-witness.mjs";
import {
  DEFAULT_SOLANA_TEXT_MAX_BYTES,
  parseStrictCliArgs,
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
const DEFAULT_ORDERED_INITIALIZATION_EVIDENCE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-ordered-initialization-evidence.json",
);
const DEFAULT_FRESH_DEPLOY_REPORT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-fresh-deploy-report.json",
);
const DEFAULT_EXACT_INITIALIZER_INPUT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-exact-initializer-input.json",
);
const DEFAULT_EXACT_INITIALIZER_JOURNAL_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-exact-initialization.journal.jsonl",
);
const DEFAULT_GOVERNED_ROUTE_CANDIDATE_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-governed-route.json",
);
const DEFAULT_NATIVE_TRUST_ANCHOR_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-native-trust-anchor.json",
);
const DEFAULT_PROVER_GOVERNANCE_APPROVAL_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-prover-approval.json",
);
const DEFAULT_CAPTURE_REVIEW_POLICY_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-capture-review-policy.json",
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
  "iroha-demo-sccp-solana-route-preflight/v2";
const SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS = Object.freeze([
  "taira-endpoint",
  "sccp-capabilities-load",
  "sccp-submit-capabilities",
  "sccp-registry-load",
  "solana-lane-publication",
  "solana-route-instance-publication",
  "route-registry-shape",
  "production-ready-flag",
  "solana-testnet-rpc-health",
  "solana-live-exact-programdata-evidence",
  "solana-live-exact-runtime-state",
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

const LOCAL_SOLANA_SCCP_SDK_CAPABILITY_SCHEMA =
  "iroha-demo-sccp-solana-local-sdk-capability/v2";
const RESERVED_RETIRED_SCCP_NETWORK_TAGS = new Set([6, 7, 8, 9]);
const ASSIGNED_FIRST_RELEASE_SCCP_NETWORK_PROFILE_TAGS = Object.freeze({
  "sora-taira": 1,
  "ethereum-mainnet": 2,
  "ethereum-sepolia": 3,
  "bsc-mainnet": 4,
  "bsc-testnet": 5,
  "tron-mainnet": 10,
  "tron-nile": 11,
  "tron-shasta": 12,
});

export const SOLANA_SCCP_REQUIRED_SDK_EXPORTS = Object.freeze({
  SCCP_DOMAIN_SOLANA: { kind: "constant", value: 3 },
  SCCP_CODEC_CANONICAL_TEXT: { kind: "constant", value: 1 },
  SCCP_CODEC_SOLANA_PUBKEY32: { kind: "constant", value: 6 },
  SCCP_NETWORK_PROFILES: { kind: "object" },
  canonicalSccpTransferPayloadBytes: { kind: "function" },
  canonicalSccpPayloadBytes: { kind: "function" },
  sccpMessageId: { kind: "function" },
  sccpPayloadHash: { kind: "function" },
  sccpHubCommitmentFromPayload: { kind: "function" },
  canonicalSccpHubCommitmentBytes: { kind: "function" },
  sccpCommitmentLeafHash: { kind: "function" },
  canonicalSccpMerkleProofBytes: { kind: "function" },
  sccpMerkleRootFromCommitment: { kind: "function" },
  canonicalTairaSccpMessageBundleBytes: { kind: "function" },
  canonicalSccpMessagePublicInputsBytes: { kind: "function" },
});

export const SOLANA_SCCP_RETIRED_SDK_EXPORTS = Object.freeze([
  "SCCP_DOMAIN_SOL",
  "SCCP_CODEC_TEXT_UTF8",
  "SCCP_CODEC_SOLANA_BASE58",
  "SCCP_CODEC_SOLANA_ADDRESS32",
  "canonicalSccpPayloadEnvelopeBytes",
  "sccpTransferMessageId",
  "canonicalSccpMessageProofBundleBytes",
  "canonicalSccpMessageTransparentPublicInputsBytes",
]);

const observedSdkExport = (value, requirement) => {
  if (requirement.kind === "function") return typeof value;
  if (requirement.kind === "object") {
    return isRecord(value)
      ? "object"
      : Array.isArray(value)
        ? "array"
        : typeof value;
  }
  return value;
};

const sdkExportMatches = (value, requirement) => {
  if (requirement.kind === "function") return typeof value === "function";
  if (requirement.kind === "object") return isRecord(value);
  return value === requirement.value;
};

const expectedSdkExport = (requirement) =>
  requirement.kind === "constant"
    ? String(requirement.value)
    : requirement.kind;

const snapshotSccpNetworkProfiles = (profiles) => {
  if (!isRecord(profiles)) return null;
  return Object.fromEntries(
    Object.entries(profiles).map(([key, descriptor]) => [
      key,
      isRecord(descriptor)
        ? {
            profile: descriptor.profile ?? null,
            tag: descriptor.tag ?? null,
            domain: descriptor.domain ?? null,
            sora: descriptor.sora ?? null,
            genesisHash: descriptor.genesisHash ?? null,
          }
        : null,
    ]),
  );
};

const evaluateLocalSolanaSccpSdkCapability = (capability) => {
  const requiredExportNames = Object.keys(SOLANA_SCCP_REQUIRED_SDK_EXPORTS);
  const declaredRequiredExports = readFirstArray(capability, "requiredExports");
  const observedRequiredExports = readFirstRecord(
    capability,
    "observedRequiredExports",
  );
  const observedProtocolScope = readFirstRecord(
    capability,
    "observedProtocolScope",
  );
  const observedDomains = readFirstRecord(observedProtocolScope, "domains");
  const observedCodecs = readFirstRecord(observedProtocolScope, "codecs");
  const observedNetworkProfiles = readFirstRecord(
    observedProtocolScope,
    "networkProfiles",
  );
  const solanaTestnetProfile = readFirstRecord(
    observedNetworkProfiles,
    SOLANA_TESTNET_NETWORK_ID,
  );
  const networkProfileEntries = isRecord(observedNetworkProfiles)
    ? Object.entries(observedNetworkProfiles)
    : [];
  const networkProfileTags = networkProfileEntries.map(([, profile]) =>
    isRecord(profile) ? profile.tag : null,
  );
  const assignedProfilesRetainExactTags = Object.entries(
    ASSIGNED_FIRST_RELEASE_SCCP_NETWORK_PROFILE_TAGS,
  ).every(([profile, tag]) => observedNetworkProfiles?.[profile]?.tag === tag);
  const highestAssignedNetworkTag = Math.max(
    ...Object.values(ASSIGNED_FIRST_RELEASE_SCCP_NETWORK_PROFILE_TAGS),
  );
  const networkProfileTagsSafeAndUnique =
    networkProfileTags.length > 1 &&
    networkProfileTags.every(
      (tag) =>
        Number.isSafeInteger(tag) &&
        tag > 0 &&
        tag <= 0xff &&
        !RESERVED_RETIRED_SCCP_NETWORK_TAGS.has(tag),
    ) &&
    new Set(networkProfileTags).size === networkProfileTags.length &&
    assignedProfilesRetainExactTags &&
    solanaTestnetProfile?.tag > highestAssignedNetworkTag;
  const requiredExportsOk =
    Array.isArray(capability?.requiredExports) &&
    declaredRequiredExports.length === requiredExportNames.length &&
    declaredRequiredExports.every(
      (name, index) => name === requiredExportNames[index],
    ) &&
    isRecord(observedRequiredExports) &&
    Object.keys(observedRequiredExports).length ===
      requiredExportNames.length &&
    requiredExportNames.every((name) => {
      const requirement = SOLANA_SCCP_REQUIRED_SDK_EXPORTS[name];
      return (
        observedRequiredExports[name] ===
        (requirement.kind === "constant" ? requirement.value : requirement.kind)
      );
    });
  const retiredExportsOk =
    Array.isArray(capability?.retiredExports) &&
    capability.retiredExports.length ===
      SOLANA_SCCP_RETIRED_SDK_EXPORTS.length &&
    capability.retiredExports.every(
      (name, index) => name === SOLANA_SCCP_RETIRED_SDK_EXPORTS[index],
    ) &&
    Array.isArray(capability?.retiredExportsPresent) &&
    capability.retiredExportsPresent.length === 0;
  const payloadKinds = readFirstArray(observedProtocolScope, "payloadKinds");
  const protocolScopeOk =
    observedDomains?.solana ===
      SOLANA_SCCP_REQUIRED_SDK_EXPORTS.SCCP_DOMAIN_SOLANA.value &&
    observedCodecs?.canonicalText ===
      SOLANA_SCCP_REQUIRED_SDK_EXPORTS.SCCP_CODEC_CANONICAL_TEXT.value &&
    observedCodecs?.solanaPubkey32 ===
      SOLANA_SCCP_REQUIRED_SDK_EXPORTS.SCCP_CODEC_SOLANA_PUBKEY32.value &&
    payloadKinds.length === 1 &&
    payloadKinds[0] === "transfer" &&
    solanaTestnetProfile?.profile === SOLANA_TESTNET_NETWORK_ID &&
    solanaTestnetProfile?.domain ===
      SOLANA_SCCP_REQUIRED_SDK_EXPORTS.SCCP_DOMAIN_SOLANA.value &&
    solanaTestnetProfile?.sora === false &&
    solanaTestnetProfile?.genesisHash === SOLANA_TESTNET_GENESIS_HASH &&
    networkProfileTagsSafeAndUnique;
  const evidenceReady =
    isRecord(capability) &&
    capability.schema === LOCAL_SOLANA_SCCP_SDK_CAPABILITY_SCHEMA &&
    requiredExportsOk &&
    retiredExportsOk &&
    protocolScopeOk &&
    Array.isArray(capability.missingExports) &&
    capability.missingExports.length === 0 &&
    Array.isArray(capability.mismatchedExports) &&
    capability.mismatchedExports.length === 0 &&
    !capability.loadError;
  return {
    evidenceReady,
    requiredExportsOk,
    retiredExportsOk,
    protocolScopeOk,
    networkProfileTagsSafeAndUnique,
  };
};

export const inspectSolanaSccpSdkModuleCapability = (sdk) => {
  const requiredExports = Object.keys(SOLANA_SCCP_REQUIRED_SDK_EXPORTS);
  const missingExports = [];
  const mismatchedExports = [];
  const observedRequiredExports = {};
  for (const [name, requirement] of Object.entries(
    SOLANA_SCCP_REQUIRED_SDK_EXPORTS,
  )) {
    if (!isRecord(sdk) || !Object.hasOwn(sdk, name)) {
      missingExports.push(name);
      observedRequiredExports[name] = null;
      continue;
    }
    const value = sdk[name];
    observedRequiredExports[name] = observedSdkExport(value, requirement);
    if (!sdkExportMatches(value, requirement)) {
      mismatchedExports.push({
        name,
        expected: expectedSdkExport(requirement),
        observed: String(observedRequiredExports[name]),
      });
    }
  }
  const retiredExportsPresent = isRecord(sdk)
    ? SOLANA_SCCP_RETIRED_SDK_EXPORTS.filter((name) => Object.hasOwn(sdk, name))
    : [];
  const capability = {
    schema: LOCAL_SOLANA_SCCP_SDK_CAPABILITY_SCHEMA,
    ready: false,
    requiredExports,
    observedRequiredExports,
    retiredExports: [...SOLANA_SCCP_RETIRED_SDK_EXPORTS],
    retiredExportsPresent,
    missingExports,
    mismatchedExports,
    loadError: null,
    observedProtocolScope: isRecord(sdk)
      ? {
          domains: {
            sora: sdk.SCCP_DOMAIN_SORA ?? null,
            eth: sdk.SCCP_DOMAIN_ETH ?? null,
            bsc: sdk.SCCP_DOMAIN_BSC ?? null,
            solana: sdk.SCCP_DOMAIN_SOLANA ?? null,
            tron: sdk.SCCP_DOMAIN_TRON ?? null,
          },
          codecs: {
            canonicalText: sdk.SCCP_CODEC_CANONICAL_TEXT ?? null,
            solanaPubkey32: sdk.SCCP_CODEC_SOLANA_PUBKEY32 ?? null,
          },
          payloadKinds: Array.isArray(sdk.SCCP_PAYLOAD_KINDS)
            ? [...sdk.SCCP_PAYLOAD_KINDS]
            : null,
          networkProfiles: snapshotSccpNetworkProfiles(
            sdk.SCCP_NETWORK_PROFILES,
          ),
        }
      : null,
  };
  capability.ready =
    evaluateLocalSolanaSccpSdkCapability(capability).evidenceReady;
  return capability;
};

export const inspectLocalSolanaSccpSdkCapability = async () => {
  try {
    return inspectSolanaSccpSdkModuleCapability(
      await import("@iroha/iroha-js/sccp"),
    );
  } catch (error) {
    return {
      schema: LOCAL_SOLANA_SCCP_SDK_CAPABILITY_SCHEMA,
      ready: false,
      requiredExports: Object.keys(SOLANA_SCCP_REQUIRED_SDK_EXPORTS),
      observedRequiredExports: null,
      retiredExports: [...SOLANA_SCCP_RETIRED_SDK_EXPORTS],
      retiredExportsPresent: null,
      missingExports: Object.keys(SOLANA_SCCP_REQUIRED_SDK_EXPORTS),
      mismatchedExports: [],
      loadError: error instanceof Error ? error.message : String(error),
      observedProtocolScope: null,
    };
  }
};

export const checkLocalSolanaSccpSdkCapability = ({ capability } = {}) => {
  const evidence = evaluateLocalSolanaSccpSdkCapability(capability);
  const ready = capability?.ready === true && evidence.evidenceReady;
  return makeCheck(
    "local-solana-sccp-sdk-support",
    ready,
    ready
      ? "The local Iroha SDK exposes the exact Solana SCCP V1 domain, codec, and canonical binding helpers."
      : "The local Iroha SDK does not expose a deployable Solana SCCP V1 protocol surface.",
    {
      ...(capability ?? {}),
      requiredExportsOk: evidence.requiredExportsOk,
      retiredExportsOk: evidence.retiredExportsOk,
      protocolScopeOk: evidence.protocolScopeOk,
      networkProfileTagsSafeAndUnique: evidence.networkProfileTagsSafeAndUnique,
    },
  );
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
      Array.isArray(media?.streams) &&
      media.streams.some(
        (stream) =>
          stream?.codecType === "video" && stream?.codecName === "h264",
      ) &&
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

export const checkSolanaLiveVideoMediaArtifactPins = ({
  mediaArtifacts,
  mp4Fact,
  vttFact,
  mp4Path,
  vttPath,
} = {}) => {
  const pinMatches = (pin, fact, expectedPath, mediaType) =>
    isRecord(pin) &&
    pin.path === normalizePath(expectedPath) &&
    pin.mediaType === mediaType &&
    Number.isSafeInteger(pin.size) &&
    pin.size === fact?.size &&
    isHex32(pin.sha256) &&
    pin.sha256 === fact?.sha256;
  const mp4Ready = pinMatches(
    mediaArtifacts?.mp4,
    mp4Fact,
    mp4Path,
    "video/mp4",
  );
  const vttReady = pinMatches(
    mediaArtifacts?.vtt,
    vttFact,
    vttPath,
    "text/vtt",
  );
  return makeCheck(
    "live-video-media-artifact-pins",
    mp4Ready && vttReady,
    mp4Ready && vttReady
      ? "Successful live MP4 and VTT bytes exactly match the transcript pins."
      : "Successful live MP4/VTT bytes are missing, swapped, stale, or differ from the transcript pins.",
    { mp4Ready, vttReady, mediaArtifacts: mediaArtifacts ?? null },
  );
};

export const checkSolanaLiveCaptureWitnessArtifactPin = ({
  witness,
  artifact,
  successPolicy,
  externalArtifact = null,
} = {}) => {
  const encoding = isRecord(witness)
    ? Buffer.from(`${canonicalSccpJson(witness)}\n`, "utf8")
    : null;
  const artifactSha256 = readFirstString(artifact, "sha256");
  const artifactSize = Number(artifact?.size);
  const embeddedWitnessBytesMatch =
    encoding !== null &&
    encoding.length === artifactSize &&
    `0x${createHash("sha256").update(encoding).digest("hex")}` ===
      artifactSha256;
  const policyPinMatches =
    successPolicy?.liveCaptureWitnessPinned === true &&
    isHex32(successPolicy?.liveCaptureWitnessSha256) &&
    successPolicy.liveCaptureWitnessSha256 === artifactSha256;
  const externalArtifactMatches =
    externalArtifact?.error === null &&
    externalArtifact?.sha256 === artifactSha256 &&
    externalArtifact?.size === artifactSize &&
    canonicalSccpJson(externalArtifact?.value) === canonicalSccpJson(witness);
  return makeCheck(
    "live-capture-witness-artifact-pin",
    embeddedWitnessBytesMatch && policyPinMatches && externalArtifactMatches,
    embeddedWitnessBytesMatch && policyPinMatches && externalArtifactMatches
      ? "Embedded capture witness exactly matches independently pinned canonical witness bytes."
      : "Embedded capture witness is missing, noncanonical, or differs from the independently pinned witness artifact.",
    {
      embeddedWitnessBytesMatch,
      policyPinMatches,
      externalArtifactMatches,
      artifactSize:
        Number.isSafeInteger(artifactSize) && artifactSize > 0
          ? artifactSize
          : null,
      artifactSha256: safeSha256(artifactSha256),
    },
  );
};

export const checkSolanaLiveCaptureReviewAttestationArtifactPin = ({
  attestation,
  artifact,
  successPolicy,
  externalArtifact = null,
} = {}) => {
  const artifactSha256 = readFirstString(artifact, "sha256");
  const artifactSize = Number(artifact?.size);
  const encoding = isRecord(attestation)
    ? Buffer.from(`${canonicalSccpJson(attestation)}\n`, "utf8")
    : null;
  const embeddedBytesMatch =
    encoding !== null &&
    encoding.length === artifactSize &&
    `0x${createHash("sha256").update(encoding).digest("hex")}` ===
      artifactSha256;
  const policyPinMatches =
    successPolicy?.liveCaptureReviewAttestationPinned === true &&
    isHex32(successPolicy?.liveCaptureReviewAttestationSha256) &&
    successPolicy.liveCaptureReviewAttestationSha256 === artifactSha256;
  const externalArtifactMatches =
    externalArtifact?.error === null &&
    externalArtifact?.sha256 === artifactSha256 &&
    externalArtifact?.size === artifactSize &&
    canonicalSccpJson(externalArtifact?.value) ===
      canonicalSccpJson(attestation);
  return makeCheck(
    "live-capture-review-attestation-artifact-pin",
    embeddedBytesMatch && policyPinMatches && externalArtifactMatches,
    embeddedBytesMatch && policyPinMatches && externalArtifactMatches
      ? "Embedded detached capture-review attestation exactly matches the pinned external artifact."
      : "Detached capture-review attestation is missing, stale, noncanonical, or differs from its external pin.",
    {
      embeddedBytesMatch,
      policyPinMatches,
      externalArtifactMatches,
      artifactSize:
        Number.isSafeInteger(artifactSize) && artifactSize > 0
          ? artifactSize
          : null,
      artifactSha256: safeSha256(artifactSha256),
    },
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

const parseWebVttCues = (webvtt) =>
  String(webvtt ?? "")
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => {
      const lines = block
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return null;
      const [start, end] = lines[timingIndex]
        .split(/\s+-->\s+/u)
        .map((part) => part.trim().split(/\s+/u)[0]);
      const text = lines.slice(timingIndex + 1).join(" ");
      return text ? { start, end, text } : null;
    })
    .filter(Boolean);

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

const canonicalSubtitleCueTimeline = (cues) => {
  if (!Array.isArray(cues)) return null;
  const normalized = cues.map((cue, index) => {
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

const cueTimelineHash = (cues) => {
  const timeline = canonicalSubtitleCueTimeline(cues);
  return timeline ? sha256Hex(canonicalSccpJson(timeline)) : null;
};

const deploymentTranscriptCues = (transcript) =>
  readFirstArray(transcript, "subtitleCues", "subtitle_cues", "captions").map(
    (cue) => ({
      start: readFirstString(cue, "start"),
      end: readFirstString(cue, "end"),
      text: readFirstString(cue, "text", "caption", "body"),
    }),
  );

const deploymentTranscriptCueTexts = (deploymentVideoTranscript) => {
  return deploymentTranscriptCues(deploymentVideoTranscript)
    .map((cue) => cue.text)
    .filter(Boolean);
};

const deploymentVideoSubtitleExplanation = (deploymentVideoTranscript) => {
  const transcriptCues = deploymentTranscriptCues(deploymentVideoTranscript);
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
    cueTimelineSha256: cueTimelineHash(transcriptCues),
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
  const transcriptCues = deploymentTranscriptCues(liveVideoTranscript);
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
  const sourceCapture = readFirstRecord(
    liveVideoTranscript,
    "sourceCapture",
    "source_capture",
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
    ["real-capture-sha256", readFirstString(sourceCapture, "sha256")],
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
    cueTimelineSha256: cueTimelineHash(transcriptCues),
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

const publicReportPathMarker = (value) =>
  value ? "[public-report-supplied]" : null;

const canonicalSolanaPublicKeyOrNull = (value) => {
  if (typeof value !== "string") return null;
  try {
    return new PublicKey(value).toBase58() === value ? value : null;
  } catch {
    return null;
  }
};

const publicHex32OrNull = (value) => (isHex32(value) ? value : null);

const publicPositiveSafeIntegerOrNull = (value) =>
  Number.isSafeInteger(value) && value > 0 ? value : null;

const publicExactRegistrySummary = (summary) => {
  if (!isRecord(summary)) return null;
  const publicKeyRecord = (record, keys) =>
    Object.fromEntries(
      keys.map((key) => [key, canonicalSolanaPublicKeyOrNull(record?.[key])]),
    );
  const hexRecord = (record, keys) =>
    Object.fromEntries(
      keys.map((key) => [key, publicHex32OrNull(record?.[key])]),
    );
  return {
    registrySha256: publicHex32OrNull(summary.registrySha256),
    routeId:
      summary.routeId === SCCP_SOLANA_XOR_ROUTE_ID
        ? SCCP_SOLANA_XOR_ROUTE_ID
        : null,
    assetKey:
      summary.assetKey === SCCP_XOR_ASSET_KEY ? SCCP_XOR_ASSET_KEY : null,
    revision: summary.revision === 1 ? 1 : null,
    activation: summary.activation === "bidirectional" ? "bidirectional" : null,
    currentNativeTrustAnchorHash:
      typeof summary.currentNativeTrustAnchorHash === "string" &&
      /^[0-9A-F]{64}$/u.test(summary.currentNativeTrustAnchorHash)
        ? summary.currentNativeTrustAnchorHash
        : null,
    destinationBindingHash: publicHex32OrNull(summary.destinationBindingHash),
    deploymentConfigHash: publicHex32OrNull(summary.deploymentConfigHash),
    routeConfigurationHash: publicHex32OrNull(summary.routeConfigurationHash),
    sourceEmitterIdentityHash: publicHex32OrNull(
      summary.sourceEmitterIdentityHash,
    ),
    sourceIdentityHash: publicHex32OrNull(summary.sourceIdentityHash),
    verifierKeyHash: publicHex32OrNull(summary.verifierKeyHash),
    nativeVerifierConfigHash: publicHex32OrNull(
      summary.nativeVerifierConfigHash,
    ),
    programs: publicKeyRecord(summary.programs, [
      "destination",
      "source",
      "nativeVerifier",
    ]),
    accounts: publicKeyRecord(summary.accounts, [
      "destinationProgramData",
      "sourceProgramData",
      "nativeVerifierProgramData",
      "destinationState",
      "sourceState",
      "nativeVerifierMaterial",
      "tokenMint",
    ]),
    programDataSlots: Object.fromEntries(
      ["destination", "source", "nativeVerifier"].map((key) => [
        key,
        publicPositiveSafeIntegerOrNull(summary.programDataSlots?.[key]),
      ]),
    ),
    codeHashes: hexRecord(summary.codeHashes, [
      "destination",
      "source",
      "nativeVerifier",
    ]),
    proofPolicy: hexRecord(summary.proofPolicy, [
      "soraFinalityAnchorHash",
      "semanticProfileHash",
      "circuitCommitment",
      "witnessGeneratorCommitment",
      "publicSignalSchemaHash",
    ]),
  };
};

const publicExactRegistryState = (state) =>
  isRecord(state)
    ? {
        routePresent: state.routePresent === true,
        activation:
          state.activation === "bidirectional" ? "bidirectional" : null,
        revision: state.revision === 1 ? 1 : null,
      }
    : null;

const publicProgramdataRoleEvidence = (evidence, role) => {
  if (!isRecord(evidence)) return null;
  return {
    role: evidence.role === role ? role : null,
    programAddress: canonicalSolanaPublicKeyOrNull(evidence.programAddress),
    programdataAddress: canonicalSolanaPublicKeyOrNull(
      evidence.programdataAddress,
    ),
    immutable: evidence.immutable === true,
    upgradeAuthorityCleared: evidence.upgradeAuthority === null,
    sbpfVersion: evidence.sbpfVersion === "V3" ? "V3" : null,
    programdataSlot: positiveIntegerString(evidence.programdataSlot)
      ? evidence.programdataSlot
      : null,
    programCodeHash: publicHex32OrNull(evidence.programCodeHash),
    programdataMetadataHash: publicHex32OrNull(
      evidence.programdataMetadataHash,
    ),
    executableLength:
      Number.isSafeInteger(evidence.executableLength) &&
      evidence.executableLength >= 4
        ? evidence.executableLength
        : null,
    programContextSlot: publicPositiveSafeIntegerOrNull(
      evidence.programContextSlot,
    ),
    programdataContextSlot: publicPositiveSafeIntegerOrNull(
      evidence.programdataContextSlot,
    ),
  };
};

export const checkPublicPreflightReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  if (!isRecord(preflightReport)) {
    return makeCheck(
      "public-preflight-ready",
      false,
      "No public Solana route preflight report is available.",
      { reportPath: publicReportPathMarker(preflightReportPath) },
    );
  }
  const problems = [];
  const routeId = preflightReport.routeId;
  const assetKey = preflightReport.assetKey;
  const routeRevision = preflightReport.routeRevision;
  const manifestSource = preflightReport.manifestSource;
  const taira = isRecord(preflightReport.taira) ? preflightReport.taira : {};
  const solana = isRecord(preflightReport.solana) ? preflightReport.solana : {};
  const summary = isRecord(preflightReport.registrySummary)
    ? preflightReport.registrySummary
    : null;
  for (const retiredField of [
    "route_id",
    "asset_key",
    "manifest_source",
    "publicSolanaCapability",
  ]) {
    if (Object.hasOwn(preflightReport, retiredField)) {
      problems.push(`retired preflight field ${retiredField} is forbidden.`);
    }
  }
  for (const [condition, detail] of [
    [
      preflightReport.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA,
      `schema must be ${SOLANA_ROUTE_PREFLIGHT_SCHEMA}.`,
    ],
    [
      preflightReport.protocolSource === "typed-sccp-registry-v1",
      "protocolSource must be typed-sccp-registry-v1.",
    ],
    [routeId === SCCP_SOLANA_XOR_ROUTE_ID, "routeId is not taira_sol_xor."],
    [assetKey === SCCP_XOR_ASSET_KEY, "assetKey is not xor."],
    [routeRevision === 1, "routeRevision must be 1."],
    [
      manifestSource === "public-registry",
      "manifestSource must be public-registry.",
    ],
    [taira.chainId === TAIRA_CHAIN_ID, "TAIRA chain id is not exact."],
    [
      taira.networkPrefix === TAIRA_NETWORK_PREFIX,
      "TAIRA network prefix is not 369.",
    ],
    [
      taira.registryPath === SOLANA_SCCP_REGISTRY_PATH,
      "TAIRA registry path is not exact.",
    ],
    [
      solana.network === SOLANA_TESTNET_NETWORK_ID,
      "Solana network is not exact testnet.",
    ],
    [
      solana.caipChainId === SOLANA_TESTNET_CAIP_CHAIN_ID,
      "Solana CAIP chain id is not exact.",
    ],
    [
      solana.genesisHash === SOLANA_TESTNET_GENESIS_HASH,
      "Solana genesis hash is not exact.",
    ],
  ]) {
    if (!condition) problems.push(detail);
  }
  if (!summary) {
    problems.push("Typed-registry route summary is missing.");
  } else {
    for (const [condition, detail] of [
      [
        summary.routeId === SCCP_SOLANA_XOR_ROUTE_ID,
        "Registry route id is invalid.",
      ],
      [
        summary.assetKey === SCCP_XOR_ASSET_KEY,
        "Registry asset key is invalid.",
      ],
      [summary.revision === 1, "Registry route revision is invalid."],
      [
        summary.activation === "bidirectional",
        "Registry route is not bidirectional.",
      ],
      [isHex32(summary.registrySha256), "Registry object hash is invalid."],
      [
        isHex32(summary.destinationBindingHash),
        "Destination binding hash is invalid.",
      ],
      [
        isHex32(summary.deploymentConfigHash),
        "Deployment config hash is invalid.",
      ],
      [
        isHex32(summary.routeConfigurationHash),
        "Route configuration hash is invalid.",
      ],
      [
        isHex32(summary.sourceEmitterIdentityHash),
        "Source emitter hash is invalid.",
      ],
      [isHex32(summary.sourceIdentityHash), "Source identity hash is invalid."],
      [isHex32(summary.verifierKeyHash), "Verifier key hash is invalid."],
      [
        isHex32(summary.nativeVerifierConfigHash),
        "Native verifier config hash is invalid.",
      ],
    ]) {
      if (!condition) problems.push(detail);
    }
    const roleAddresses = [
      summary.programs?.destination,
      summary.programs?.source,
      summary.programs?.nativeVerifier,
      summary.accounts?.destinationProgramData,
      summary.accounts?.sourceProgramData,
      summary.accounts?.nativeVerifierProgramData,
      summary.accounts?.destinationState,
      summary.accounts?.sourceState,
      summary.accounts?.nativeVerifierMaterial,
      summary.accounts?.tokenMint,
    ];
    const canonicalAddresses = roleAddresses.every((address) => {
      try {
        return new PublicKey(address).toBase58() === address;
      } catch {
        return false;
      }
    });
    if (
      !canonicalAddresses ||
      new Set(roleAddresses).size !== roleAddresses.length
    ) {
      problems.push(
        "Typed-registry Solana role addresses are missing, invalid, or aliased.",
      );
    }
    for (const slot of [
      summary.programDataSlots?.destination,
      summary.programDataSlots?.source,
      summary.programDataSlots?.nativeVerifier,
    ]) {
      if (!Number.isSafeInteger(slot) || slot <= 0) {
        problems.push(
          "Typed-registry ProgramData slots must be positive safe integers.",
        );
        break;
      }
    }
  }
  const checks = readFirstArray(preflightReport, "checks");
  const checkIds = checks.map((check) => check?.id).filter(Boolean);
  const checkIdSet = new Set(checkIds);
  if (checkIdSet.size !== checkIds.length) {
    problems.push("Public Solana preflight contains duplicate check ids.");
  }
  const missingRequiredCheckIds =
    SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS.filter(
      (checkId) => !checkIdSet.has(checkId),
    );
  if (missingRequiredCheckIds.length > 0) {
    problems.push(
      `public Solana preflight missing required checks: ${missingRequiredCheckIds.join(", ")}.`,
    );
  }
  const failed = failedChecks(checks);
  const reportedFailed = readFirstArray(preflightReport, "failedCheckIds");
  const reportedBlockers = readFirstArray(preflightReport, "blockerIds");
  if (reportedFailed.length !== 0 || reportedBlockers.length !== 0) {
    problems.push(
      "Ready public preflight must report no failed checks or blockers.",
    );
  }
  const ready =
    problems.length === 0 &&
    preflightReport.ready === true &&
    failed.length === 0;
  return makeCheck(
    "public-preflight-ready",
    ready,
    ready
      ? "Public TAIRA Solana route preflight is ready."
      : "Public TAIRA Solana route preflight is not ready.",
    {
      reportPath: publicReportPathMarker(preflightReportPath),
      schema:
        preflightReport.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA
          ? SOLANA_ROUTE_PREFLIGHT_SCHEMA
          : null,
      protocolSource:
        preflightReport.protocolSource === "typed-sccp-registry-v1"
          ? "typed-sccp-registry-v1"
          : null,
      ready: preflightReport.ready === true,
      routeId:
        routeId === SCCP_SOLANA_XOR_ROUTE_ID ? SCCP_SOLANA_XOR_ROUTE_ID : null,
      assetKey: assetKey === SCCP_XOR_ASSET_KEY ? SCCP_XOR_ASSET_KEY : null,
      routeRevision: routeRevision === 1 ? 1 : null,
      manifestSource:
        manifestSource === "public-registry" ? "public-registry" : null,
      solana: {
        network:
          solana.network === SOLANA_TESTNET_NETWORK_ID
            ? SOLANA_TESTNET_NETWORK_ID
            : null,
        caipChainId:
          solana.caipChainId === SOLANA_TESTNET_CAIP_CHAIN_ID
            ? SOLANA_TESTNET_CAIP_CHAIN_ID
            : null,
        genesisHash:
          solana.genesisHash === SOLANA_TESTNET_GENESIS_HASH
            ? SOLANA_TESTNET_GENESIS_HASH
            : null,
      },
      requiredCheckIds: SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS,
      missingRequiredCheckIds,
      problems,
      registrySummary: publicExactRegistrySummary(summary),
      registryState: publicExactRegistryState(preflightReport.registryState),
      failedCheckCount: failed.length,
      failedChecks:
        failed.length > 0
          ? [
              {
                id: "public-route-preflight-failed",
                detail:
                  "Public route preflight contains failed or invalid checks.",
              },
            ]
          : [],
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
  if (evidence.sbpfVersion !== "V3") {
    problems.push(`${expectedRole} executable must be exact SBPF V3.`);
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

/** Validate the exact three-role immutable ProgramData evidence from preflight v2. */
export const checkPublicExactProgramdataReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  const checks = readFirstArray(preflightReport, "checks").filter(
    (check) => check?.id === "solana-live-exact-programdata-evidence",
  );
  const check = checks[0];
  const evidence = isRecord(check?.evidence) ? check.evidence : {};
  const summary = isRecord(preflightReport?.registrySummary)
    ? preflightReport.registrySummary
    : {};
  const roles = [
    [
      "destination",
      summary.programs?.destination,
      summary.accounts?.destinationProgramData,
    ],
    ["source", summary.programs?.source, summary.accounts?.sourceProgramData],
    [
      "nativeVerifier",
      summary.programs?.nativeVerifier,
      summary.accounts?.nativeVerifierProgramData,
    ],
  ];
  const problems = [];
  if (checks.length !== 1 || check?.status !== "pass") {
    problems.push(
      "Exact destination/source/native-verifier ProgramData preflight evidence is missing, ambiguous, or failed.",
    );
  }
  for (const [role, expectedProgram, expectedProgramData] of roles) {
    const live = isRecord(evidence[role]) ? evidence[role] : null;
    problems.push(
      ...immutableProgramdataEvidenceProblems({
        evidence: live,
        expectedRole: role,
        expectedProgramAddress: expectedProgram,
      }),
    );
    if (live && live.programdataAddress !== expectedProgramData) {
      problems.push(
        `${role} ProgramData address differs from typed governance.`,
      );
    }
    if (
      live &&
      live.programdataSlot !== String(summary.programDataSlots?.[role])
    ) {
      problems.push(`${role} ProgramData slot differs from typed governance.`);
    }
    if (live && live.programCodeHash !== summary.codeHashes?.[role]) {
      problems.push(`${role} executable hash differs from typed governance.`);
    }
  }
  const programAddresses = roles.map(([, value]) => value);
  const programDataAddresses = roles.map(([, , value]) => value);
  if (
    new Set(programAddresses).size !== roles.length ||
    new Set(programDataAddresses).size !== roles.length
  ) {
    problems.push("Typed governance aliases role-separated program addresses.");
  }
  const ready = problems.length === 0;
  return makeCheck(
    "public-exact-programdata-immutable",
    ready,
    ready
      ? "Fresh Solana RPC evidence matches all three immutable typed-registry program roles."
      : "Fresh exact Solana ProgramData evidence is missing, mutable, or differs from typed governance.",
    {
      reportPath: publicReportPathMarker(preflightReportPath),
      problems,
      roles: Object.fromEntries(
        ["destination", "source", "nativeVerifier"].map((role) => [
          role,
          publicProgramdataRoleEvidence(evidence[role], role),
        ]),
      ),
    },
  );
};

const productionGatePda = (program, seeds) => {
  const [address, bump] = PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    new PublicKey(program),
  );
  return { address: address.toBase58(), bump };
};

const productionGatePublicKeyBytes = (value) => new PublicKey(value).toBytes();

const productionGateHashBytes = (value) =>
  Uint8Array.from(Buffer.from(trimString(value).replace(/^0x/u, ""), "hex"));

/** Validate the fresh SCCPRT01/SPL/SCCPMAT1 evidence from public preflight. */
export const checkPublicExactRuntimeStateReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  const matchingChecks = readFirstArray(preflightReport, "checks").filter(
    (check) => check?.id === "solana-live-exact-runtime-state",
  );
  const check = matchingChecks[0];
  const evidence = isRecord(check?.evidence) ? check.evidence : {};
  const summary = isRecord(preflightReport?.registrySummary)
    ? preflightReport.registrySummary
    : {};
  const destination = isRecord(evidence.destinationState)
    ? evidence.destinationState
    : {};
  const source = isRecord(evidence.sourceState) ? evidence.sourceState : {};
  const mint = isRecord(evidence.mint) ? evidence.mint : {};
  const material = isRecord(evidence.material) ? evidence.material : {};
  const policy = isRecord(summary.proofPolicy) ? summary.proofPolicy : {};
  const problems = [];
  const expectField = (record, field, expected, label) => {
    if (record?.[field] !== expected) {
      problems.push(`${label} differs from typed governance.`);
    }
  };
  if (matchingChecks.length !== 1 || check?.status !== "pass") {
    problems.push(
      "Exact live route-state/mint/material preflight evidence is missing, ambiguous, or failed.",
    );
  }
  const destinationProgram = summary.programs?.destination;
  const sourceProgram = summary.programs?.source;
  const verifierProgram = summary.programs?.nativeVerifier;
  const destinationState = summary.accounts?.destinationState;
  const sourceState = summary.accounts?.sourceState;
  const mintAddress = summary.accounts?.tokenMint;
  const materialAddress = summary.accounts?.nativeVerifierMaterial;
  for (const [record, label] of [
    [destination, "destination state"],
    [source, "source state"],
    [mint, "mint"],
    [material, "material"],
  ]) {
    if (!Number.isSafeInteger(record.contextSlot) || record.contextSlot <= 0) {
      problems.push(`${label} finalized context slot is missing.`);
    }
  }
  expectField(
    destination,
    "address",
    destinationState,
    "Destination state address",
  );
  expectField(
    destination,
    "owner",
    destinationProgram,
    "Destination state owner",
  );
  expectField(destination, "role", 1, "Destination state role");
  expectField(
    destination,
    "peerProgram",
    sourceProgram,
    "Destination peer program",
  );
  expectField(source, "address", sourceState, "Source state address");
  expectField(source, "owner", sourceProgram, "Source state owner");
  expectField(source, "role", 2, "Source state role");
  expectField(source, "peerProgram", destinationProgram, "Source peer program");
  for (const [record, label] of [
    [destination, "Destination state"],
    [source, "Source state"],
  ]) {
    for (const [field, expected] of [
      ["routeRevision", summary.revision],
      ["mint", mintAddress],
      ["destinationState", destinationState],
      ["verifierProgram", verifierProgram],
      ["material", materialAddress],
      ["destinationBindingHash", summary.destinationBindingHash],
      ["routeConfigurationHash", summary.routeConfigurationHash],
      ["verifierKeyHash", summary.verifierKeyHash],
      ["verifierConfigHash", summary.nativeVerifierConfigHash],
    ]) {
      expectField(record, field, expected, `${label} ${field}`);
    }
  }
  expectField(mint, "address", mintAddress, "SPL mint address");
  expectField(mint, "owner", SOLANA_SPL_TOKEN_PROGRAM_ID, "SPL mint owner");
  expectField(mint, "decimals", 9, "SPL mint decimals");
  expectField(mint, "initialized", true, "SPL mint initialization");
  expectField(mint, "freezeAuthority", null, "SPL mint freeze authority");
  expectField(material, "address", materialAddress, "Material address");
  expectField(material, "owner", verifierProgram, "Material owner");
  expectField(material, "status", "sealed", "Material status");
  expectField(
    material,
    "written",
    SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN,
    "Material VK length",
  );
  for (const [field, expected] of [
    ["routeRevision", summary.revision],
    ["asset", summary.assetKey],
    ["vkKeccak", summary.verifierKeyHash],
    ["configHash", summary.nativeVerifierConfigHash],
    ["bridgeProgram", destinationProgram],
    ["sourceProgram", sourceProgram],
    ["bridgeState", destinationState],
    ["mint", mintAddress],
    ["tokenProgram", SOLANA_SPL_TOKEN_PROGRAM_ID],
    ["destinationBindingHash", summary.destinationBindingHash],
    ["routeConfigurationHash", summary.routeConfigurationHash],
    ["soraFinalityAnchorHash", policy.soraFinalityAnchorHash],
    ["semanticProfileHash", policy.semanticProfileHash],
    ["circuitHash", policy.circuitCommitment],
    ["witnessGeneratorCommitment", policy.witnessGeneratorCommitment],
    ["schemaCommitment", policy.publicSignalSchemaHash],
    ["publicSignalSchemaHash", SCCP_SOLANA_EXACT_PUBLIC_SIGNAL_SCHEMA_HASH],
    ["routeId", summary.routeId],
  ]) {
    expectField(material, field, expected, `Material ${field}`);
  }
  if (
    destination.sourceLaneHash !== source.sourceLaneHash ||
    destination.sourceLaneHash !== material.sourceLaneHash ||
    destination.destinationLaneHash !== source.destinationLaneHash ||
    destination.destinationLaneHash !== material.destinationLaneHash
  ) {
    problems.push("Runtime state and material lane hashes disagree.");
  }
  try {
    const destinationVerify = productionGatePda(destinationProgram, [
      new TextEncoder().encode(SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED),
      productionGatePublicKeyBytes(destinationState),
    ]);
    const sourceVerify = productionGatePda(sourceProgram, [
      new TextEncoder().encode(SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED),
      productionGatePublicKeyBytes(sourceState),
    ]);
    const mintAuthority = productionGatePda(destinationProgram, [
      new TextEncoder().encode(SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED),
      productionGatePublicKeyBytes(destinationState),
    ]);
    const materialPda = productionGatePda(verifierProgram, [
      new TextEncoder().encode(SCCP_SOLANA_EXACT_MATERIAL_SEED),
      productionGateHashBytes(summary.verifierKeyHash),
      productionGateHashBytes(summary.nativeVerifierConfigHash),
    ]);
    for (const [actual, expected, label] of [
      [
        destination.verifyAuthority,
        destinationVerify.address,
        "Destination verify authority",
      ],
      [
        destination.verifyBump,
        destinationVerify.bump,
        "Destination verify bump",
      ],
      [source.verifyAuthority, sourceVerify.address, "Source verify authority"],
      [source.verifyBump, sourceVerify.bump, "Source verify bump"],
      [mint.mintAuthority, mintAuthority.address, "Mint authority"],
      [
        evidence.mintAuthority,
        mintAuthority.address,
        "Evidence mint authority",
      ],
      [destination.mintBump, mintAuthority.bump, "Destination mint bump"],
      [source.mintBump, mintAuthority.bump, "Source mint bump"],
      [material.address, materialPda.address, "Material PDA"],
      [material.bump, materialPda.bump, "Material PDA bump"],
    ]) {
      if (actual !== expected) problems.push(`${label} is invalid.`);
    }
    expectField(
      material,
      "bridgeAuthority",
      destinationVerify.address,
      "Material bridge authority",
    );
    const recomputedConfigHash = deriveExactSccpSolanaMaterialConfigHash({
      verifierProgram,
      material,
    });
    if (
      recomputedConfigHash !== summary.nativeVerifierConfigHash ||
      material.recomputedConfigHash !== recomputedConfigHash
    ) {
      problems.push("Material config hash does not independently rederive.");
    }
  } catch {
    problems.push("Runtime PDA/config evidence is invalid.");
  }
  const ready = problems.length === 0;
  return makeCheck(
    "public-exact-runtime-state",
    ready,
    ready
      ? "Fresh Solana RPC evidence matches the exact route states, SPL mint, and sealed verifier material."
      : "Fresh exact Solana route-state/mint/material evidence is missing or differs from typed governance.",
    {
      reportPath: publicReportPathMarker(preflightReportPath),
      problems,
      runtime: {
        destinationStatePresent: isRecord(evidence.destinationState),
        sourceStatePresent: isRecord(evidence.sourceState),
        mintPresent: isRecord(evidence.mint),
        materialPresent: isRecord(evidence.material),
        mintAuthorityPresent:
          canonicalSolanaPublicKeyOrNull(evidence.mintAuthority) !== null,
      },
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
      { reportPath: publicReportPathMarker(preflightReportPath) },
    );
  }
  if (preflightReport.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA) {
    const summary = isRecord(preflightReport.registrySummary)
      ? preflightReport.registrySummary
      : null;
    const laneChecks = readFirstArray(preflightReport, "checks").filter(
      (check) => check?.id === "solana-lane-publication",
    );
    const productionChecks = readFirstArray(preflightReport, "checks").filter(
      (check) => check?.id === "production-ready-flag",
    );
    const laneEvidence = isRecord(laneChecks[0]?.evidence)
      ? laneChecks[0].evidence
      : {};
    const productionEvidence = isRecord(productionChecks[0]?.evidence)
      ? productionChecks[0].evidence
      : {};
    const problems = [];
    if (laneChecks.length !== 1 || laneChecks[0]?.status !== "pass") {
      problems.push(
        "Exact Solana lane publication check is missing or failed.",
      );
    }
    if (
      productionChecks.length !== 1 ||
      productionChecks[0]?.status !== "pass"
    ) {
      problems.push(
        "Exact Solana production activation check is missing or failed.",
      );
    }
    if (laneEvidence.sourceNetwork !== SOLANA_TESTNET_NETWORK_ID) {
      problems.push("Exact lane source network is not Solana testnet.");
    }
    if (
      typeof laneEvidence.currentNativeTrustAnchorHash !== "string" ||
      !/^[0-9A-F]{64}$/u.test(laneEvidence.currentNativeTrustAnchorHash) ||
      summary?.currentNativeTrustAnchorHash !==
        laneEvidence.currentNativeTrustAnchorHash
    ) {
      problems.push(
        "Exact current Solana trust anchor is missing or inconsistent.",
      );
    }
    if (
      summary?.activation !== "bidirectional" ||
      productionEvidence.activation !== "bidirectional" ||
      productionEvidence.nativeTrustAnchorHash !==
        summary?.currentNativeTrustAnchorHash
    ) {
      problems.push("Exact Solana lane is not consistently bidirectional.");
    }
    const ready = problems.length === 0;
    return makeCheck(
      "public-solana-lane-ready",
      ready,
      ready
        ? "Public typed TAIRA registry exposes a bidirectional Solana lane with a current native trust anchor."
        : "Public typed TAIRA Solana lane evidence is missing or inconsistent.",
      {
        reportPath: publicReportPathMarker(preflightReportPath),
        present: summary !== null,
        chain:
          laneEvidence.sourceNetwork === SOLANA_TESTNET_NETWORK_ID
            ? SOLANA_TESTNET_NETWORK_ID
            : null,
        activation:
          summary?.activation === "bidirectional" ? "bidirectional" : null,
        currentNativeTrustAnchorHash:
          typeof summary?.currentNativeTrustAnchorHash === "string" &&
          /^[0-9A-F]{64}$/u.test(summary.currentNativeTrustAnchorHash)
            ? summary.currentNativeTrustAnchorHash
            : null,
        problems,
        blockerIds: ready ? [] : ["typed-registry-solana-lane"],
      },
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
      reportPath: publicReportPathMarker(preflightReportPath),
      present: lane !== null,
      chain: isExpectedSolanaLaneChain(laneChain.value || evidenceChain.value)
        ? SOLANA_TESTNET_NETWORK_ID
        : null,
      counterpartyDomain:
        (laneCounterpartyDomain.value ?? evidenceCounterpartyDomain.value) ===
        SCCP_SOLANA_DOMAIN
          ? SCCP_SOLANA_DOMAIN
          : null,
      productionReady:
        laneProductionReady.value === true ||
        evidenceProductionReady.value === true,
      disabledReasonPresent: Boolean(
        laneDisabledReason.value || evidenceDisabledReason.value,
      ),
      laneCheck: laneCheck
        ? {
            status: laneCheck.status === "pass" ? "pass" : "fail",
            detail:
              laneCheck.status === "pass"
                ? "Legacy lane check passed."
                : "Legacy or invalid lane check did not pass.",
          }
        : null,
      aliasProblemCount: aliasProblems.length,
      blockerCount: blockerIds.length,
      blockerIds: blockerIds.length > 0 ? ["legacy-solana-lane-blocked"] : [],
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
      reportPath: publicReportPathMarker(preflightReportPath),
      manifestSource: null,
      routeId: null,
      assetKey: null,
      publicationChecks: [],
      blockerIds: ["public-preflight-missing"],
    };
  }
  if (preflightReport.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA) {
    const checks = readFirstArray(preflightReport, "checks");
    const byId = new Map(checks.map((check) => [check?.id, check]));
    const requiredCheckIds = [
      "sccp-registry-load",
      "solana-lane-publication",
      "solana-route-instance-publication",
      "route-registry-shape",
      "production-ready-flag",
    ];
    const publicationChecks = requiredCheckIds.map((id) => {
      const check = byId.get(id) ?? null;
      return {
        id,
        status: check?.status === "pass" ? "pass" : check ? "fail" : "missing",
        detail:
          check?.status === "pass"
            ? "Required public registry publication check passed."
            : "Required public registry publication check is missing or failed.",
      };
    });
    const identityReady =
      preflightReport.protocolSource === "typed-sccp-registry-v1" &&
      preflightReport.manifestSource === "public-registry" &&
      preflightReport.routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
      preflightReport.assetKey === SCCP_XOR_ASSET_KEY &&
      preflightReport.routeRevision === 1;
    return {
      ready:
        identityReady &&
        publicationChecks.every((check) => check.status === "pass"),
      reportPath: publicReportPathMarker(preflightReportPath),
      manifestSource:
        preflightReport.manifestSource === "public-registry"
          ? "public-registry"
          : null,
      routeId:
        preflightReport.routeId === SCCP_SOLANA_XOR_ROUTE_ID
          ? SCCP_SOLANA_XOR_ROUTE_ID
          : null,
      assetKey:
        preflightReport.assetKey === SCCP_XOR_ASSET_KEY
          ? SCCP_XOR_ASSET_KEY
          : null,
      revision: preflightReport.routeRevision === 1 ? 1 : null,
      registrySha256: publicHex32OrNull(
        preflightReport.registrySummary?.registrySha256,
      ),
      publicationChecks,
      blockerIds: [
        ...(identityReady ? [] : ["typed-registry-route-identity"]),
        ...publicationChecks
          .filter((check) => check.status !== "pass")
          .map((check) => check.id),
      ],
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
      status: check?.status === "pass" ? "pass" : check ? "fail" : "missing",
      detail:
        check?.status === "pass"
          ? "Required legacy publication check passed."
          : "Required legacy publication check is missing or failed.",
    };
  });
  return {
    ready: publicationChecks.every((check) => check.status === "pass"),
    reportPath: publicReportPathMarker(preflightReportPath),
    manifestSource: null,
    routeId: null,
    assetKey: null,
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
  const mediaVerificationOk =
    mediaVerification?.ready === true &&
    mediaVerification?.streams?.video?.codec === "h264";
  const subtitleExplanation = deploymentVideoSubtitleExplanation(
    deploymentVideoTranscript,
  );
  const vttFact = artifactFact(artifactFacts, paths.vtt);
  const vttCueTextMatchesTranscript =
    vttFact.vtt?.cueCount === subtitleExplanation.cueCount &&
    vttFact.vtt?.cueTextSha256 === subtitleExplanation.cueTextSha256 &&
    isHex32(vttFact.vtt?.cueTimelineSha256) &&
    vttFact.vtt?.cueTimelineSha256 === subtitleExplanation.cueTimelineSha256;
  const mp4Fact = artifactFact(artifactFacts, paths.mp4);
  const embeddedSubtitleMatchesVtt =
    mp4Fact.media?.embeddedSubtitle?.extracted === true &&
    mp4Fact.media.embeddedSubtitle.cueCount === vttFact.vtt?.cueCount &&
    mp4Fact.media.embeddedSubtitle.cueTextSha256 ===
      vttFact.vtt?.cueTextSha256 &&
    isHex32(mp4Fact.media.embeddedSubtitle.cueTimelineSha256) &&
    mp4Fact.media.embeddedSubtitle.cueTimelineSha256 ===
      vttFact.vtt?.cueTimelineSha256;
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

export const SOLANA_SMOKE_READINESS_REQUIRED_CHECK_IDS = Object.freeze([
  "route-preflight",
  "walletconnect-project-id",
  "destination-prover-module-url",
  "source-prover-module-url",
  "smoke-readiness-runbook-contract",
]);

export const SOLANA_PRODUCTION_GATE_REQUIRED_LIVE_SMOKE_STEPS = Object.freeze([
  "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
  "Connect a Solana testnet wallet through WalletConnect/AppKit.",
  "Run one tiny TAIRA -> Solana transfer and verify the Solana finalize transaction link.",
  "Run one tiny Solana -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
]);

const SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA =
  "iroha-sccp-solana-prover-sidecar-governance-binding/v1";
const SOLANA_PROVER_RUNTIME_REINSPECTION_SCHEMA =
  "iroha-sccp-solana-production-gate-prover-reinspection/v1";
const SOLANA_PROVER_RUNTIME_SPECS = Object.freeze([
  Object.freeze({
    direction: "destination",
    checkId: "destination-prover-module-url",
    proveExport: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
  }),
  Object.freeze({
    direction: "source",
    checkId: "source-prover-module-url",
    proveExport: "proveSolanaSccpSource",
    selfTestExport: "solanaSccpSourceProverSelfTest",
  }),
]);
const SOLANA_SMOKE_READY_EMPTY_ARRAY_KEYS = Object.freeze([
  "failedCheckIds",
  "blockerIds",
  "rootCauseBlockerIds",
  "nextActions",
  "nextActionIds",
  "missingProductionInputs",
  "missingProductionInputIds",
]);
const SOLANA_SMOKE_OPTIONAL_EMPTY_ARRAY_KEYS = Object.freeze([
  "failedChecks",
  "blockers",
  "actions",
  "nextActionDetails",
  "missingInputs",
  "requiredInputs",
]);

const exactArrayEquals = (value, expected) =>
  Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);

const isNonzeroHex32 = (value) => isHex32(value) && !/^0x0{64}$/u.test(value);

const smokeProverGovernanceBinding = (inspection) =>
  readFirstRecord(
    inspection,
    "governanceApprovalBinding",
    "governance_approval_binding",
  );

const smokeCheckById = (report, id) =>
  readFirstArray(report, "checks").find((check) => check?.id === id) ?? null;

const smokeProverModuleUrl = (report, checkId) =>
  readFirstString(
    readFirstRecord(smokeCheckById(report, checkId), "evidence"),
    "moduleUrl",
    "module_url",
  );

/**
 * Reopen the exact package-relative module and sidecar bytes and rerun the
 * governed known-answer probe. This deliberately does not reuse any readiness
 * boolean or digest from the smoke report; that report supplies only the URL
 * whose installed bytes must be independently verified.
 */
export const reinspectSolanaSmokeProverArtifacts = ({
  smokeReadinessReport,
  expectedProverGovernanceApprovalSha256 = null,
  proverGovernanceApprovalValidation = null,
} = {}) => ({
  schema: SOLANA_PROVER_RUNTIME_REINSPECTION_SCHEMA,
  expectedProverGovernanceApprovalSha256:
    trimString(expectedProverGovernanceApprovalSha256) || null,
  directions: Object.fromEntries(
    SOLANA_PROVER_RUNTIME_SPECS.map((spec) => {
      const moduleUrl = smokeProverModuleUrl(
        smokeReadinessReport,
        spec.checkId,
      );
      let inspection = null;
      let error = null;
      try {
        inspection = moduleUrl
          ? runLocalProverSelfTest({
              moduleUrl,
              proveExport: spec.proveExport,
              selfTestExport: spec.selfTestExport,
              expectedApprovalSha256: expectedProverGovernanceApprovalSha256,
              approvalValidation: proverGovernanceApprovalValidation,
            })
          : null;
      } catch (caught) {
        error = "Solana prover artifact reinspection failed.";
      }
      return [
        spec.direction,
        Object.freeze({
          direction: spec.direction,
          checkId: spec.checkId,
          moduleUrl: moduleUrl || null,
          inspection,
          ...(error ? { error: error.slice(0, 512) } : {}),
        }),
      ];
    }),
  ),
});

const smokeProverInspectionProblems = ({ check, direction }) => {
  const problems = [];
  const evidence = readFirstRecord(check, "evidence");
  const inspection = readFirstRecord(evidence, "inspection");
  const proofProbe = readFirstRecord(inspection, "proofProbe", "proof_probe");
  const selfTest = readFirstRecord(inspection, "selfTest", "self_test");
  const governanceBinding = smokeProverGovernanceBinding(inspection);
  const moduleHash = readFirstString(inspection, "moduleHash", "module_hash");
  const sidecarHash = readFirstString(
    inspection,
    "sidecarHash",
    "sidecar_hash",
  );
  const bindingModuleHash = readFirstString(
    governanceBinding,
    "moduleHash",
    "module_hash",
  );
  const approvedModuleHash = readFirstString(
    governanceBinding,
    "approvedModuleHash",
    "approved_module_hash",
  );
  const vectorHash = readFirstString(
    governanceBinding,
    "vectorHash",
    "vector_hash",
  );
  const approvedVectorHash = readFirstString(
    governanceBinding,
    "approvedVectorHash",
    "approved_vector_hash",
  );
  const proofProbeVectorHash = readFirstString(
    proofProbe,
    "vectorHash",
    "vector_hash",
  );
  const proofProbePackageHash = readFirstString(
    proofProbe,
    "packageHash",
    "package_hash",
  );
  const approvalSha256 = readFirstString(
    governanceBinding,
    "approvalSha256",
    "approval_sha256",
  );
  const expectedApprovalSha256 = readFirstString(
    governanceBinding,
    "expectedApprovalSha256",
    "expected_approval_sha256",
  );
  const governancePlanCanonicalSha256 = readFirstString(
    governanceBinding,
    "governancePlanCanonicalSha256",
    "governance_plan_canonical_sha256",
  );
  const orderedInitializationEvidenceSha256 = readFirstString(
    governanceBinding,
    "orderedInitializationEvidenceSha256",
    "ordered_initialization_evidence_sha256",
  );
  const expect = (condition, problem) => {
    if (!condition) problems.push(problem);
  };
  expect(check?.status === "pass", `${direction} prover check did not pass.`);
  expect(Boolean(evidence), `${direction} prover evidence is missing.`);
  expect(
    evidence?.configured === true,
    `${direction} prover module is not marked configured.`,
  );
  expect(
    Boolean(readFirstString(evidence, "moduleUrl", "module_url")),
    `${direction} prover module URL is missing.`,
  );
  expect(Boolean(inspection), `${direction} prover inspection is missing.`);
  for (const [field, value] of [
    ["inspected", inspection?.inspected],
    ["exists", inspection?.exists],
    ["exportsOk", inspection?.exportsOk],
    ["ready", inspection?.ready],
    ["sidecarReady", inspection?.sidecarReady],
  ]) {
    expect(
      value === true,
      `${direction} prover inspection ${field} must be true.`,
    );
  }
  expect(
    Array.isArray(inspection?.sidecarErrors) &&
      inspection.sidecarErrors.length === 0,
    `${direction} prover sidecar errors must be empty.`,
  );
  expect(
    proofProbe?.ready === true && proofProbe?.invoked === true,
    `${direction} prover known-answer export was not invoked successfully.`,
  );
  expect(
    isNonzeroHex32(proofProbePackageHash),
    `${direction} prover known-answer package hash is invalid.`,
  );
  expect(
    selfTest?.ready === true &&
      selfTest?.linked === true &&
      selfTest?.productionProofsReady === true,
    `${direction} prover self-test is not production-ready.`,
  );
  expect(
    isNonzeroHex32(moduleHash),
    `${direction} prover module hash is invalid.`,
  );
  expect(
    isNonzeroHex32(sidecarHash),
    `${direction} prover sidecar hash is invalid.`,
  );
  expect(
    governanceBinding?.schema === SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA &&
      governanceBinding?.ready === true &&
      governanceBinding?.direction === direction,
    `${direction} prover governance binding is missing or invalid.`,
  );
  expect(
    isRecord(governanceBinding) &&
      JSON.stringify(Object.keys(governanceBinding).sort()) ===
        JSON.stringify(
          [
            "schema",
            "ready",
            "direction",
            "approvalId",
            "approvalSha256",
            "expectedApprovalSha256",
            "governancePlanCanonicalSha256",
            "orderedInitializationEvidenceSha256",
            "approvedModuleHash",
            "approvedVectorHash",
            "moduleHash",
            "vectorHash",
            "errors",
          ].sort(),
        ),
    `${direction} prover governance binding fields are not exact.`,
  );
  expect(
    typeof governanceBinding?.approvalId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(governanceBinding.approvalId),
    `${direction} prover governance approval id is invalid.`,
  );
  expect(
    Array.isArray(governanceBinding?.errors) &&
      governanceBinding.errors.length === 0,
    `${direction} prover governance binding errors must be empty.`,
  );
  for (const [field, value] of [
    ["approvalSha256", approvalSha256],
    ["expectedApprovalSha256", expectedApprovalSha256],
    ["governancePlanCanonicalSha256", governancePlanCanonicalSha256],
    [
      "orderedInitializationEvidenceSha256",
      orderedInitializationEvidenceSha256,
    ],
    ["approvedModuleHash", approvedModuleHash],
    ["moduleHash", bindingModuleHash],
    ["approvedVectorHash", approvedVectorHash],
    ["vectorHash", vectorHash],
  ]) {
    expect(
      isNonzeroHex32(value),
      `${direction} prover governance binding ${field} is invalid.`,
    );
  }
  expect(
    approvalSha256 === expectedApprovalSha256,
    `${direction} prover governance approval hashes disagree.`,
  );
  expect(
    moduleHash === bindingModuleHash && moduleHash === approvedModuleHash,
    `${direction} prover module bytes do not match the governed module hash.`,
  );
  expect(
    vectorHash === approvedVectorHash &&
      proofProbeVectorHash === approvedVectorHash,
    `${direction} prover known-answer vector does not match governance.`,
  );
  return {
    problems,
    governanceBinding,
    observation: {
      moduleUrl: readFirstString(evidence, "moduleUrl", "module_url") || null,
      moduleHash: moduleHash || null,
      sidecarUrl:
        readFirstString(inspection, "sidecarUrl", "sidecar_url") || null,
      sidecarHash: sidecarHash || null,
      proofProbeVectorHash: proofProbeVectorHash || null,
      proofProbePackageHash: proofProbePackageHash || null,
      governanceBinding: governanceBinding ?? null,
    },
  };
};

export const checkSmokeReadinessReady = ({
  smokeReadinessReport,
  smokeReadinessPath = null,
  expectedProverGovernanceApprovalSha256 = null,
  proverGovernanceApprovalValidation = null,
  proverRuntimeReinspection = null,
} = {}) => {
  if (!isRecord(smokeReadinessReport)) {
    return makeCheck(
      "smoke-readiness-ready",
      false,
      "No Solana live smoke-readiness report is available.",
      {
        smokeReadinessPath: smokeReadinessPath
          ? "[public-report-supplied]"
          : null,
      },
    );
  }
  const problems = [];
  const expect = (condition, problem) => {
    if (!condition) problems.push(problem);
  };
  const checks = smokeReadinessReport.checks;
  const independentApprovalSha256 = trimString(
    expectedProverGovernanceApprovalSha256,
  );
  expect(
    isNonzeroHex32(independentApprovalSha256),
    `An independent ${SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV} pin is required.`,
  );
  expect(
    isRecord(proverGovernanceApprovalValidation) &&
      proverGovernanceApprovalValidation.ready === true,
    "The canonical exact prover governance approval descriptor is missing or invalid.",
  );
  expect(
    proverGovernanceApprovalValidation?.approvalSha256 ===
      independentApprovalSha256 &&
      proverGovernanceApprovalValidation?.expectedApprovalSha256 ===
        independentApprovalSha256,
    "The loaded exact prover approval bytes do not match the independent approval hash.",
  );
  const checkIds = Array.isArray(checks)
    ? checks.map((check) => (isRecord(check) ? check.id : null))
    : [];
  expect(
    exactArrayEquals(checkIds, SOLANA_SMOKE_READINESS_REQUIRED_CHECK_IDS),
    "Smoke-readiness checks must contain exactly the five canonical unique checks in canonical order.",
  );
  expect(
    Array.isArray(checks) && checks.every((check) => check?.status === "pass"),
    "Every canonical smoke-readiness check must pass.",
  );
  expect(
    smokeReadinessReport.schema ===
      "iroha-demo-sccp-solana-live-smoke-readiness/v1",
    "Smoke-readiness schema is invalid.",
  );
  expect(smokeReadinessReport.ready === true, "Smoke-readiness is not ready.");
  expect(
    smokeReadinessReport.routeId === SCCP_SOLANA_XOR_ROUTE_ID,
    "Smoke-readiness routeId is invalid.",
  );
  expect(
    smokeReadinessReport.assetKey === SCCP_XOR_ASSET_KEY,
    "Smoke-readiness assetKey is invalid.",
  );
  const topSolana = readFirstRecord(smokeReadinessReport, "solana");
  expect(
    topSolana?.network === SOLANA_TESTNET_NETWORK_ID &&
      topSolana?.caipChainId === SOLANA_TESTNET_CAIP_CHAIN_ID &&
      topSolana?.genesisHash === SOLANA_TESTNET_GENESIS_HASH,
    "Smoke-readiness is not exactly bound to the canonical Solana testnet identity.",
  );
  for (const key of SOLANA_SMOKE_READY_EMPTY_ARRAY_KEYS) {
    expect(
      Array.isArray(smokeReadinessReport[key]) &&
        smokeReadinessReport[key].length === 0,
      `Smoke-readiness ${key} must be an explicit empty array.`,
    );
  }
  for (const key of SOLANA_SMOKE_OPTIONAL_EMPTY_ARRAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(smokeReadinessReport, key)) {
      expect(
        Array.isArray(smokeReadinessReport[key]) &&
          smokeReadinessReport[key].length === 0,
        `Smoke-readiness optional ${key} must be empty when present.`,
      );
    }
  }
  const unexpectedReadyStateArrayCount = Object.entries(
    smokeReadinessReport,
  ).filter(
    ([key, value]) =>
      Array.isArray(value) &&
      /(?:fail|block|missing|action)/iu.test(key) &&
      value.length > 0,
  ).length;
  if (unexpectedReadyStateArrayCount > 0) {
    problems.push(
      "Smoke-readiness contains non-empty ready-state failure, blocker, missing-input, or action arrays.",
    );
  }
  expect(
    exactArrayEquals(
      smokeReadinessReport.requiredLiveSmokeSteps,
      SOLANA_PRODUCTION_GATE_REQUIRED_LIVE_SMOKE_STEPS,
    ),
    "Smoke-readiness live-smoke steps are missing, reordered, or changed.",
  );

  const routeCheck = Array.isArray(checks) ? checks[0] : null;
  const routeEvidence = readFirstRecord(routeCheck, "evidence");
  const routeSolana = readFirstRecord(routeEvidence, "solana");
  expect(
    routeCheck?.id === "route-preflight" && routeCheck?.status === "pass",
    "Exact route-preflight check did not pass.",
  );
  expect(
    routeEvidence?.ready === true &&
      routeEvidence?.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA &&
      routeEvidence?.protocolSource === "typed-sccp-registry-v1" &&
      routeEvidence?.manifestSource === "public-registry" &&
      routeEvidence?.routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
      routeEvidence?.assetKey === SCCP_XOR_ASSET_KEY &&
      routeEvidence?.routeRevision === 1,
    "Smoke-readiness route preflight is not the ready exact-v2 typed public-registry route.",
  );
  expect(
    routeSolana?.network === SOLANA_TESTNET_NETWORK_ID &&
      routeSolana?.caipChainId === SOLANA_TESTNET_CAIP_CHAIN_ID &&
      routeSolana?.genesisHash === SOLANA_TESTNET_GENESIS_HASH &&
      routeSolana?.networkReady === true &&
      routeSolana?.caipChainReady === true &&
      routeSolana?.genesisReady === true,
    "Smoke-readiness route preflight Solana identity is invalid.",
  );
  expect(
    Array.isArray(routeEvidence?.failedChecks) &&
      routeEvidence.failedChecks.length === 0,
    "Smoke-readiness route preflight failures must be empty.",
  );

  const walletCheck = Array.isArray(checks) ? checks[1] : null;
  const walletEvidence = readFirstRecord(walletCheck, "evidence");
  expect(
    walletCheck?.id === "walletconnect-project-id" &&
      walletCheck?.status === "pass" &&
      walletEvidence?.configured === true &&
      walletEvidence?.valueStoredInReport === false,
    "WalletConnect readiness evidence is invalid.",
  );
  expect(
    !Object.prototype.hasOwnProperty.call(walletEvidence ?? {}, "value") &&
      !Object.prototype.hasOwnProperty.call(walletEvidence ?? {}, "projectId"),
    "WalletConnect project ID must not be stored in the smoke report.",
  );

  const proverResults = [
    smokeProverInspectionProblems({
      check: Array.isArray(checks) ? checks[2] : null,
      direction: "destination",
    }),
    smokeProverInspectionProblems({
      check: Array.isArray(checks) ? checks[3] : null,
      direction: "source",
    }),
  ];
  problems.push(...proverResults.flatMap((result) => result.problems));
  const [destinationBinding, sourceBinding] = proverResults.map(
    (result) => result.governanceBinding,
  );
  expect(
    destinationBinding?.approvalSha256 === sourceBinding?.approvalSha256 &&
      destinationBinding?.governancePlanCanonicalSha256 ===
        sourceBinding?.governancePlanCanonicalSha256 &&
      destinationBinding?.orderedInitializationEvidenceSha256 ===
        sourceBinding?.orderedInitializationEvidenceSha256,
    "Destination and source prover governance bindings do not share one approval and deployment evidence set.",
  );
  expect(
    destinationBinding?.approvalSha256 === independentApprovalSha256 &&
      destinationBinding?.expectedApprovalSha256 ===
        independentApprovalSha256 &&
      sourceBinding?.approvalSha256 === independentApprovalSha256 &&
      sourceBinding?.expectedApprovalSha256 === independentApprovalSha256,
    "Destination and source prover bindings do not match the independently supplied approval hash.",
  );
  const approvalPins = isRecord(proverGovernanceApprovalValidation?.pins)
    ? proverGovernanceApprovalValidation.pins
    : {};
  for (const [direction, binding] of [
    ["destination", destinationBinding],
    ["source", sourceBinding],
  ]) {
    expect(
      binding?.approvedModuleHash ===
        approvalPins[`${direction}ProverModuleHash`] &&
        binding?.approvedVectorHash ===
          approvalPins[`${direction}ProverKnownAnswerVectorHash`],
      `${direction} prover smoke evidence does not match the canonical approval descriptor pins.`,
    );
    expect(
      binding?.governancePlanCanonicalSha256 ===
        approvalPins.governancePlanCanonicalSha256 &&
        binding?.orderedInitializationEvidenceSha256 ===
          approvalPins.orderedInitializationEvidenceSha256,
      `${direction} prover deployment evidence does not match the canonical approval descriptor pins.`,
    );
  }

  const reinspectionDirections = isRecord(proverRuntimeReinspection?.directions)
    ? proverRuntimeReinspection.directions
    : {};
  expect(
    proverRuntimeReinspection?.schema ===
      SOLANA_PROVER_RUNTIME_REINSPECTION_SCHEMA,
    "Independent prover module/sidecar reinspection is missing or invalid.",
  );
  expect(
    proverRuntimeReinspection?.expectedProverGovernanceApprovalSha256 ===
      independentApprovalSha256,
    "Independent prover reinspection does not use the canonical approval hash.",
  );
  const runtimeResults = SOLANA_PROVER_RUNTIME_SPECS.map((spec) => {
    const runtime = isRecord(reinspectionDirections[spec.direction])
      ? reinspectionDirections[spec.direction]
      : null;
    const runtimeInspection = readFirstRecord(runtime, "inspection");
    const runtimeResult = smokeProverInspectionProblems({
      check: {
        id: spec.checkId,
        status: runtimeInspection?.ready === true ? "pass" : "fail",
        evidence: {
          configured: Boolean(runtime?.moduleUrl),
          moduleUrl: runtime?.moduleUrl ?? null,
          inspection: runtimeInspection,
        },
      },
      direction: spec.direction,
    });
    expect(
      runtime?.direction === spec.direction &&
        runtime?.checkId === spec.checkId,
      `${spec.direction} prover reinspection identity is invalid.`,
    );
    expect(
      runtime?.error === undefined,
      `${spec.direction} prover reinspection failed: ${runtime?.error ?? "missing inspection"}.`,
    );
    problems.push(
      ...runtimeResult.problems.map((problem) => `Independent ${problem}`),
    );
    return runtimeResult;
  });

  for (let index = 0; index < SOLANA_PROVER_RUNTIME_SPECS.length; index += 1) {
    const { direction } = SOLANA_PROVER_RUNTIME_SPECS[index];
    const smokeObservation = proverResults[index].observation;
    const runtimeObservation = runtimeResults[index].observation;
    expect(
      canonicalSccpJson(smokeObservation) ===
        canonicalSccpJson(runtimeObservation),
      `${direction} prover smoke evidence does not match independently reopened module/sidecar bytes and KAT output.`,
    );
    const binding = runtimeResults[index].governanceBinding;
    expect(
      binding?.approvalSha256 === independentApprovalSha256 &&
        binding?.expectedApprovalSha256 === independentApprovalSha256,
      `${direction} independently inspected prover does not match the canonical approval hash.`,
    );
    expect(
      binding?.approvedModuleHash ===
        approvalPins[`${direction}ProverModuleHash`] &&
        binding?.approvedVectorHash ===
          approvalPins[`${direction}ProverKnownAnswerVectorHash`] &&
        binding?.governancePlanCanonicalSha256 ===
          approvalPins.governancePlanCanonicalSha256 &&
        binding?.orderedInitializationEvidenceSha256 ===
          approvalPins.orderedInitializationEvidenceSha256,
      `${direction} independently inspected prover does not match the canonical approval descriptor pins.`,
    );
  }
  const runtimeBindings = runtimeResults.map(
    (result) => result.governanceBinding,
  );
  expect(
    runtimeBindings[0]?.approvalSha256 === runtimeBindings[1]?.approvalSha256 &&
      runtimeBindings[0]?.governancePlanCanonicalSha256 ===
        runtimeBindings[1]?.governancePlanCanonicalSha256 &&
      runtimeBindings[0]?.orderedInitializationEvidenceSha256 ===
        runtimeBindings[1]?.orderedInitializationEvidenceSha256,
    "Independently inspected destination/source provers do not share one approval and deployment evidence set.",
  );

  const runbookCheck = Array.isArray(checks) ? checks[4] : null;
  const runbookEvidence = readFirstRecord(runbookCheck, "evidence");
  expect(
    runbookCheck?.id === "smoke-readiness-runbook-contract" &&
      runbookCheck?.status === "pass" &&
      Array.isArray(runbookEvidence?.problems) &&
      runbookEvidence.problems.length === 0,
    "Smoke-readiness runbook contract is not clean.",
  );

  const ready = problems.length === 0;
  const blockerValues = readFirstArray(smokeReadinessReport, "blockerIds");
  const missingProductionInputValues = readFirstArray(
    smokeReadinessReport,
    "missingProductionInputs",
  );
  const nextActionValues = readFirstArray(smokeReadinessReport, "nextActions");
  return makeCheck(
    "smoke-readiness-ready",
    ready,
    ready
      ? "Solana live smoke-readiness report proves the exact app runtime prerequisites are ready."
      : "Solana live smoke-readiness report is malformed, forged, or not ready.",
    {
      smokeReadinessPath: smokeReadinessPath
        ? "[public-report-supplied]"
        : null,
      schemaOk:
        smokeReadinessReport.schema ===
        "iroha-demo-sccp-solana-live-smoke-readiness/v1",
      routeOk: smokeReadinessReport.routeId === SCCP_SOLANA_XOR_ROUTE_ID,
      ready: smokeReadinessReport.ready === true,
      requiredCheckIds: [...SOLANA_SMOKE_READINESS_REQUIRED_CHECK_IDS],
      observedCheckCount: checkIds.length,
      observedCheckIdsCanonical: exactArrayEquals(
        checkIds,
        SOLANA_SMOKE_READINESS_REQUIRED_CHECK_IDS,
      ),
      blockerCount: blockerValues.length,
      missingProductionInputCount: missingProductionInputValues.length,
      nextActionCount: nextActionValues.length,
      problems,
      expectedProverGovernanceApprovalSha256: isNonzeroHex32(
        independentApprovalSha256,
      )
        ? independentApprovalSha256
        : null,
      ...(ready
        ? {
            observedCheckIds: checkIds,
            blockerIds: [],
            missingProductionInputs: [],
            nextActions: [],
            proverGovernanceApprovalValidation,
            proverRuntimeReinspection,
          }
        : {}),
    },
  );
};

const reportCheckById = (report, id) =>
  readFirstArray(report, "checks").find((check) => check?.id === id) ?? null;

const solanaConsistencyBinding = (record) => {
  const solana = readFirstRecord(record, "solana");
  return solana
    ? {
        network: readFirstString(solana, "network", "solanaNetwork") || null,
        caipChainId:
          readFirstString(solana, "caipChainId", "caip_chain_id") || null,
        genesisHash:
          readFirstString(solana, "genesisHash", "genesis_hash") || null,
      }
    : null;
};

const TRANSIENT_ROUTE_PREFLIGHT_FAILURE_IDS = new Set([
  "sccp-capabilities-load",
  "sccp-registry-load",
  "solana-testnet-rpc-health",
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
        schema: readFirstString(routePreflight, "schema") || null,
        protocolSource:
          readFirstString(
            routePreflight,
            "protocolSource",
            "protocol_source",
          ) || null,
        routeId: readFirstString(routePreflight, "routeId", "route_id") || null,
        assetKey:
          readFirstString(routePreflight, "assetKey", "asset_key") || null,
        manifestSource:
          readFirstString(
            routePreflight,
            "manifestSource",
            "manifest_source",
          ) || null,
        routeRevision:
          routePreflight.routeRevision ?? routePreflight.route_revision ?? null,
        solana: solanaConsistencyBinding(routePreflight),
        failedChecks: stableRoutePreflightFailedChecks(
          readFirstArray(routePreflight, "checks"),
        ),
      }
    : null;

const smokeRoutePreflightConsistencySnapshot = (evidence) =>
  isRecord(evidence)
    ? {
        checkedAt: readFirstString(evidence, "checkedAt", "checked_at") || null,
        ready: evidence.ready === true,
        schema: readFirstString(evidence, "schema") || null,
        protocolSource:
          readFirstString(evidence, "protocolSource", "protocol_source") ||
          null,
        routeId: readFirstString(evidence, "routeId", "route_id") || null,
        assetKey: readFirstString(evidence, "assetKey", "asset_key") || null,
        manifestSource:
          readFirstString(evidence, "manifestSource", "manifest_source") ||
          null,
        routeRevision:
          evidence.routeRevision ?? evidence.route_revision ?? null,
        solana: solanaConsistencyBinding(evidence),
        failedChecks: stableRoutePreflightFailedChecks(
          readFirstArray(evidence, "failedChecks", "failed_checks"),
        ),
      }
    : null;

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
    governanceBinding: smokeProverGovernanceBinding(inspection) ?? null,
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
  governancePlanReport = null,
  governancePlanPath = null,
  orderedInitializationEvidenceReport = null,
  orderedInitializationEvidencePath = null,
  orderedInitializationEvidenceArtifactSha256 = null,
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
      "schema",
      "protocolSource",
      "routeId",
      "assetKey",
      "manifestSource",
      "routeRevision",
      "solana",
      "failedChecks",
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
        detail:
          "Smoke-readiness route preflight evidence is older than the allowed freshness window.",
      });
    }
  } else if (smokeClaimsReady) {
    missingEvidence.push("route-preflight");
  }
  const expectedGovernancePlanSha256 = readFirstString(
    governancePlanReport,
    "plan_sha256",
    "planSha256",
  );
  const governancePlanOrderedInitializationSha256 = readFirstString(
    governancePlanReport,
    "ordered_initialization_evidence_sha256",
    "orderedInitializationEvidenceSha256",
  );
  const expectedOrderedInitializationSha256 = trimString(
    orderedInitializationEvidenceArtifactSha256,
  );
  if (smokeClaimsReady && !isRecord(governancePlanReport)) {
    missingEvidence.push("governance-plan");
  }
  if (smokeClaimsReady && !isRecord(orderedInitializationEvidenceReport)) {
    missingEvidence.push("ordered-initialization-evidence");
  }
  if (smokeClaimsReady && !isNonzeroHex32(expectedGovernancePlanSha256)) {
    missingEvidence.push("governance-plan-sha256");
  }
  if (
    smokeClaimsReady &&
    !isNonzeroHex32(expectedOrderedInitializationSha256)
  ) {
    missingEvidence.push("ordered-initialization-evidence-sha256");
  }
  if (
    expectedOrderedInitializationSha256 &&
    governancePlanOrderedInitializationSha256 !==
      expectedOrderedInitializationSha256
  ) {
    mismatches.push({
      id: "ordered-initialization-evidence",
      field: "governancePlanOrderedInitializationEvidenceSha256",
      detail:
        "The reviewed governance plan does not pin the actual loaded ordered-initialization evidence bytes.",
    });
  }
  for (const { direction, checkId } of [
    {
      direction: "destination",
      checkId: "destination-prover-module-url",
    },
    { direction: "source", checkId: "source-prover-module-url" },
  ]) {
    const observed = smokeProverObservation(smokeReadinessReport, checkId);
    if (!observed) {
      if (smokeClaimsReady) {
        missingEvidence.push(`${direction}-prover`);
      }
      continue;
    }
    const binding = observed.governanceBinding;
    if (!isRecord(binding)) {
      if (smokeClaimsReady) {
        missingEvidence.push(`${direction}-prover-governance-binding`);
      }
      continue;
    }
    pushFieldMismatch({
      mismatches,
      id: `${direction}-prover`,
      field: "governancePlanCanonicalSha256",
      expected: expectedGovernancePlanSha256 || null,
      observed:
        readFirstString(
          binding,
          "governancePlanCanonicalSha256",
          "governance_plan_canonical_sha256",
        ) || null,
      detail:
        "Smoke-readiness prover governance binding does not match the actual reviewed governance plan.",
    });
    pushFieldMismatch({
      mismatches,
      id: `${direction}-prover`,
      field: "orderedInitializationEvidenceSha256",
      expected: expectedOrderedInitializationSha256 || null,
      observed:
        readFirstString(
          binding,
          "orderedInitializationEvidenceSha256",
          "ordered_initialization_evidence_sha256",
        ) || null,
      detail:
        "Smoke-readiness prover governance binding does not match the actual loaded ordered-initialization evidence.",
    });
  }
  const ok = mismatches.length === 0 && missingEvidence.length === 0;
  return makeCheck(
    "smoke-readiness-artifact-consistency",
    ok,
    ok
      ? "Solana smoke-readiness report matches the exact public preflight and governed prover evidence."
      : "Solana smoke-readiness report is stale or missing exact public/governed prover evidence.",
    {
      smokeReadinessPath: smokeReadinessPath
        ? "[public-report-supplied]"
        : null,
      preflightReportPath: preflightReportPath
        ? "[public-report-supplied]"
        : null,
      governancePlanPath: governancePlanPath
        ? "[public-report-supplied]"
        : null,
      orderedInitializationEvidencePath: orderedInitializationEvidencePath
        ? "[public-report-supplied]"
        : null,
      expectedGovernancePlanSha256: isNonzeroHex32(expectedGovernancePlanSha256)
        ? expectedGovernancePlanSha256
        : null,
      expectedOrderedInitializationSha256: isNonzeroHex32(
        expectedOrderedInitializationSha256,
      )
        ? expectedOrderedInitializationSha256
        : null,
      smokeClaimsReady,
      missingEvidence,
      mismatches,
    },
  );
};

const publicReportPath = (file) =>
  typeof file === "string" && file.trim() ? "[public-report-supplied]" : null;

const safeNonnegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

const safeSha256 = (value) => (isHex32(value) ? trimString(value) : null);

const safeArtifactFactSummary = (fact, kind) => {
  const summary = {
    path: publicReportPath(fact?.path),
    exists: fact?.exists === true,
    size: safeNonnegativeInteger(fact?.size),
    sha256: safeSha256(fact?.sha256),
  };
  if (kind === "mp4") {
    const media = isRecord(fact?.media) ? fact.media : null;
    const embeddedSubtitle = isRecord(media?.embeddedSubtitle)
      ? media.embeddedSubtitle
      : null;
    return {
      ...summary,
      media: {
        present: media !== null,
        formatOk: media?.formatOk === true,
        hasVideo: media?.hasVideo === true,
        hasAudio: media?.hasAudio === true,
        hasEmbeddedSubtitle: media?.hasEmbeddedSubtitle === true,
        h264VideoPresent:
          Array.isArray(media?.streams) &&
          media.streams.some(
            (stream) =>
              stream?.codecType === "video" && stream?.codecName === "h264",
          ),
        streamCount: Array.isArray(media?.streams) ? media.streams.length : 0,
        embeddedSubtitle: {
          present: embeddedSubtitle !== null,
          extracted: embeddedSubtitle?.extracted === true,
          cueCount: safeNonnegativeInteger(embeddedSubtitle?.cueCount),
          cueTextSha256: safeSha256(embeddedSubtitle?.cueTextSha256),
          cueTimelineSha256: safeSha256(embeddedSubtitle?.cueTimelineSha256),
        },
      },
    };
  }
  const vtt = isRecord(fact?.vtt) ? fact.vtt : null;
  return {
    ...summary,
    vtt: {
      present: vtt !== null,
      webvtt: vtt?.webvtt === true,
      cueCount: safeNonnegativeInteger(vtt?.cueCount),
      cueTextSha256: safeSha256(vtt?.cueTextSha256),
      cueTimelineSha256: safeSha256(vtt?.cueTimelineSha256),
    },
  };
};

const safeLiveEvidenceStatus = (status) => {
  const fields = isRecord(status?.fields) ? status.fields : {};
  const fieldValidators = {
    forwardMessageId: isLiveHex32,
    forwardTairaSourceTx: isLiveHex32,
    forwardSolanaTxId: isSolanaSignature,
    reverseSolanaSourceTx: isSolanaSignature,
    reverseTairaSettlementTx: isLiveHex32,
  };
  const requiredFieldIds = [
    "forward-message-id",
    "forward-taira-source-tx",
    "forward-solana-tx",
    "reverse-solana-source-tx",
    "reverse-taira-settlement-tx",
    "real-capture-sha256",
  ];
  const requiredFieldIdSet = new Set(requiredFieldIds);
  const safeFieldIds = (values) =>
    Array.isArray(values)
      ? [...new Set(values.filter((value) => requiredFieldIdSet.has(value)))]
      : [];
  const duplicateFieldIdPairs = Array.isArray(status?.duplicateFieldIdPairs)
    ? status.duplicateFieldIdPairs.filter(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          pair.every((id) => requiredFieldIdSet.has(id)),
      )
    : [];
  return {
    ok: status?.ok === true,
    fields: Object.fromEntries(
      Object.entries(fieldValidators).map(([key, validate]) => {
        const value = fields[key];
        return [key, validate(value) ? trimString(value) : null];
      }),
    ),
    requiredFieldIds,
    missingFieldIds: safeFieldIds(status?.missingFieldIds),
    invalidFieldIds: safeFieldIds(status?.invalidFieldIds),
    distinctOk: status?.distinctOk === true,
    duplicateFieldIdPairs,
  };
};

const safePolicySummary = (policy, kind) => {
  const present = isRecord(policy);
  if (kind === "transcript") {
    const preflight = readFirstRecord(policy, "preflight");
    const productionGate = readFirstRecord(
      policy,
      "productionGate",
      "production_gate",
    );
    return {
      present,
      schemaOk:
        policy?.schema ===
        "iroha-demo-sccp-solana-live-video-success-policy/v1",
      modeOk: policy?.mode === "canonical-fresh-read-only-v1",
      ready: policy?.ready === true,
      diagnosticOnlyFalse: policy?.diagnosticOnly === false,
      readOnly: policy?.readOnly === true,
      freshPreflightCompleted: policy?.freshPreflightCompleted === true,
      freshProductionGateCompleted:
        policy?.freshProductionGateCompleted === true,
      nativeNetworkClientsUsed: policy?.nativeNetworkClientsUsed === true,
      canonicalTairaValidatorRoot: policy?.canonicalTairaValidatorRoot === true,
      canonicalSolanaTestnetRpc: policy?.canonicalSolanaTestnetRpc === true,
      governancePinReady: policy?.governancePinReady === true,
      liveCapturePinned: policy?.liveCapturePinned === true,
      liveCaptureWitnessPinned: policy?.liveCaptureWitnessPinned === true,
      liveCaptureWitnessSha256: safeSha256(policy?.liveCaptureWitnessSha256),
      liveCaptureReviewAttestationPinned:
        policy?.liveCaptureReviewAttestationPinned === true,
      liveCaptureReviewAttestationSha256: safeSha256(
        policy?.liveCaptureReviewAttestationSha256,
      ),
      preflightReportOverrideFalse: policy?.preflightReportOverride === false,
      skipSolanaRpcFalse: policy?.skipSolanaRpc === false,
      prerequisiteReportOverrideCount: readFirstArray(
        policy,
        "prerequisiteReportOverrideIds",
      ).length,
      problemCount: readFirstArray(policy, "problems").length,
      preflight: {
        present: isRecord(preflight),
        freshlyComputed: preflight?.freshlyComputed === true,
        suppliedReportUsedFalse: preflight?.suppliedReportUsed === false,
        skipSolanaRpcFalse: preflight?.skipSolanaRpc === false,
      },
      productionGate: {
        present: isRecord(productionGate),
        freshlyComputed: productionGate?.freshlyComputed === true,
        suppliedReportUsedFalse: productionGate?.suppliedReportUsed === false,
        ready: productionGate?.ready === true,
        failedCheckCount: readFirstArray(
          productionGate,
          "failedCheckIds",
          "failed_check_ids",
        ).length,
        preLiveInputSnapshotSha256: safeSha256(
          readFirstString(
            productionGate,
            "preLiveInputSnapshotSha256",
            "pre_live_input_snapshot_sha256",
          ),
        ),
      },
    };
  }
  return {
    present,
    ready: policy?.ready === true,
    freshPreflightCompleted: policy?.freshPreflightCompleted === true,
    preflightEndpointIdentityReady:
      policy?.preflightEndpointIdentityReady === true,
    canonicalTairaValidatorRoot: policy?.canonicalTairaValidatorRoot === true,
    canonicalSolanaTestnetRpc: policy?.canonicalSolanaTestnetRpc === true,
    governancePinReady: policy?.governancePinReady === true,
    preflightReportOverrideFalse: policy?.preflightReportOverride === false,
    skipSolanaRpcFalse: policy?.skipSolanaRpc === false,
    problemCount: readFirstArray(policy, "problems").length,
  };
};

const safeAuthoritativeRevalidationSummary = (revalidation) => ({
  present: isRecord(revalidation),
  ready: revalidation?.ready === true,
  readOnly: revalidation?.readOnly === true,
  nativeNetworkClientsUsed: revalidation?.nativeNetworkClientsUsed === true,
  packageHashesReady: revalidation?.packageHashesReady === true,
});

const safeMediaArtifactsSummary = (mediaArtifacts) => {
  const summarizePin = (pin, mediaType) => ({
    present: isRecord(pin),
    path: publicReportPath(pin?.path),
    mediaType: pin?.mediaType === mediaType ? mediaType : null,
    size: Number.isSafeInteger(pin?.size) && pin.size >= 0 ? pin.size : null,
    sha256: safeSha256(pin?.sha256),
  });
  return {
    present: isRecord(mediaArtifacts),
    mp4: summarizePin(mediaArtifacts?.mp4, "video/mp4"),
    vtt: summarizePin(mediaArtifacts?.vtt, "text/vtt"),
  };
};

const safeMediaVerificationSummary = (mediaVerification) => ({
  present: isRecord(mediaVerification),
  ready: mediaVerification?.ready === true,
  videoCodecH264: mediaVerification?.streams?.video?.codec === "h264",
  verifiedRealCapture:
    mediaVerification?.sourceCapture?.verifiedRealCapture === true,
  semanticWitnessReady:
    mediaVerification?.sourceCapture?.semanticWitnessAnalysis?.ready === true &&
    mediaVerification?.sourceCapture?.semanticWitnessAnalysis
      ?.semanticallyBound === true,
});

const safeSourceCaptureSummary = (sourceCapture) => ({
  present: isRecord(sourceCapture),
  verifiedRealCapture: sourceCapture?.verifiedRealCapture === true,
  mediaType: sourceCapture?.mediaType === "video/mp4" ? "video/mp4" : null,
  size:
    Number.isSafeInteger(sourceCapture?.size) && sourceCapture.size > 0
      ? sourceCapture.size
      : null,
  sha256: safeSha256(sourceCapture?.sha256),
  durationSeconds: Number.isFinite(Number(sourceCapture?.durationSeconds))
    ? Number(sourceCapture.durationSeconds)
    : null,
  sampledFrameCount: safeNonnegativeInteger(sourceCapture?.sampledFrameCount),
  uniqueFrameCount: safeNonnegativeInteger(sourceCapture?.uniqueFrameCount),
  sampledFrameSha256: safeSha256(sourceCapture?.sampledFrameSha256),
  audioSampleCount: safeNonnegativeInteger(sourceCapture?.audioSampleCount),
  audioSampleSha256: safeSha256(sourceCapture?.audioSampleSha256),
  videoEssenceSha256: safeSha256(sourceCapture?.videoEssenceSha256),
  audioEssenceSha256: safeSha256(sourceCapture?.audioEssenceSha256),
  audioMaxVolumeDb: Number.isFinite(Number(sourceCapture?.audioMaxVolumeDb))
    ? Number(sourceCapture.audioMaxVolumeDb)
    : null,
  semanticWitnessReady:
    sourceCapture?.semanticWitnessAnalysis?.ready === true &&
    sourceCapture?.semanticWitnessAnalysis?.semanticallyBound === true,
  semanticEvidenceBindingSha256: safeSha256(
    sourceCapture?.semanticWitnessAnalysis?.evidenceBindingSha256,
  ),
});

const safeLiveCaptureContentSummary = (analysis) => ({
  present: isRecord(analysis),
  ready: analysis?.ready === true,
  verifiedRealCapture: analysis?.verifiedRealCapture === true,
  durationSeconds: Number.isFinite(Number(analysis?.durationSeconds))
    ? Number(analysis.durationSeconds)
    : null,
  width: safeNonnegativeInteger(analysis?.width),
  height: safeNonnegativeInteger(analysis?.height),
  sampledFrameCount: safeNonnegativeInteger(analysis?.sampledFrameCount),
  uniqueFrameCount: safeNonnegativeInteger(analysis?.uniqueFrameCount),
  sampledFrameSha256: safeSha256(analysis?.sampledFrameSha256),
  audioSampleCount: safeNonnegativeInteger(analysis?.audioSampleCount),
  audioSampleSha256: safeSha256(analysis?.audioSampleSha256),
  videoEssenceSha256: safeSha256(analysis?.videoEssenceSha256),
  audioEssenceSha256: safeSha256(analysis?.audioEssenceSha256),
  audioMaxVolumeDb: Number.isFinite(Number(analysis?.audioMaxVolumeDb))
    ? Number(analysis.audioMaxVolumeDb)
    : null,
  streamShape: {
    videoCount: safeNonnegativeInteger(analysis?.streamShape?.videoCount),
    audioCount: safeNonnegativeInteger(analysis?.streamShape?.audioCount),
    subtitleCount: safeNonnegativeInteger(analysis?.streamShape?.subtitleCount),
    expectedSubtitleCount: Number.isSafeInteger(
      analysis?.streamShape?.expectedSubtitleCount,
    )
      ? analysis.streamShape.expectedSubtitleCount
      : null,
    subtitleCodec:
      analysis?.streamShape?.subtitleCodec === "mov_text" ? "mov_text" : null,
    unexpectedCount: safeNonnegativeInteger(
      analysis?.streamShape?.unexpectedCount,
    ),
  },
  streamTimeline: {
    video: {
      ready: analysis?.streamTimeline?.video?.ready === true,
      timeBase: analysis?.streamTimeline?.video?.timeBase ?? null,
      startTime: analysis?.streamTimeline?.video?.startTime ?? null,
      duration: analysis?.streamTimeline?.video?.duration ?? null,
      frameCount: safeNonnegativeInteger(
        analysis?.streamTimeline?.video?.frameCount,
      ),
    },
    audio: {
      ready: analysis?.streamTimeline?.audio?.ready === true,
      timeBase: analysis?.streamTimeline?.audio?.timeBase ?? null,
      startTime: analysis?.streamTimeline?.audio?.startTime ?? null,
      duration: analysis?.streamTimeline?.audio?.duration ?? null,
      frameCount: safeNonnegativeInteger(
        analysis?.streamTimeline?.audio?.frameCount,
      ),
    },
  },
  semanticWitnessReady:
    analysis?.semanticWitnessAnalysis?.ready === true &&
    analysis?.semanticWitnessAnalysis?.semanticallyBound === true,
  semanticEvidenceBindingSha256: safeSha256(
    analysis?.semanticWitnessAnalysis?.evidenceBindingSha256,
  ),
  blockerIds: Array.isArray(analysis?.blockers)
    ? analysis.blockers.filter(
        (id) => typeof id === "string" && /^capture-[a-z-]+$/u.test(id),
      )
    : [],
});

const safeSubtitleExplanation = (subtitleExplanation) => {
  const evidenceMarkerIds = [
    "route-id",
    "forward-message-id",
    "forward-taira-source-tx",
    "forward-solana-tx",
    "reverse-solana-source-tx",
    "reverse-taira-settlement-tx",
  ];
  const evidenceMarkerIdSet = new Set(evidenceMarkerIds);
  const safeMarkerIds = (values) =>
    Array.isArray(values)
      ? [...new Set(values.filter((value) => evidenceMarkerIdSet.has(value)))]
      : [];
  const safeSteps = (values) =>
    Array.isArray(values)
      ? [...new Set(values.filter((value) => [1, 2, 3, 4, 5].includes(value)))]
      : [];
  return {
    ok: subtitleExplanation?.ok === true,
    cueCount: safeNonnegativeInteger(subtitleExplanation?.cueCount),
    numberedStepCount: safeNonnegativeInteger(
      subtitleExplanation?.numberedStepCount,
    ),
    cueTextSha256: safeSha256(subtitleExplanation?.cueTextSha256),
    cueTimelineSha256: safeSha256(subtitleExplanation?.cueTimelineSha256),
    requiredSteps: safeSteps(subtitleExplanation?.requiredSteps),
    missingRequiredSteps: safeSteps(subtitleExplanation?.missingRequiredSteps),
    requiredEvidenceMarkerIds: safeMarkerIds(
      subtitleExplanation?.requiredEvidenceMarkerIds,
    ),
    missingEvidenceMarkerIds: safeMarkerIds(
      subtitleExplanation?.missingEvidenceMarkerIds,
    ),
    missingEvidenceFieldIds: safeMarkerIds(
      subtitleExplanation?.missingEvidenceFieldIds,
    ),
    invalidEvidenceFieldIds: safeMarkerIds(
      subtitleExplanation?.invalidEvidenceFieldIds,
    ),
    duplicateEvidenceFieldIdPairCount: Array.isArray(
      subtitleExplanation?.duplicateEvidenceFieldIdPairs,
    )
      ? subtitleExplanation.duplicateEvidenceFieldIdPairs.length
      : 0,
  };
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
    {
      id: "blocked-before-recording",
      text: "Solana SCCP live video blocked before recording.",
    },
    {
      id: "diagnostic-not-live-evidence",
      text: "This MP4 is a blocked diagnostic only and is not live transfer evidence.",
    },
    {
      id: "rerun-after-prerequisites",
      text: "Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.",
    },
  ];
  const missingRequiredFragmentIds = requiredFragments
    .filter(
      ({ text }) =>
        fact.vtt?.firstCue !== text &&
        fact.vtt?.lastCue !== text &&
        !combinedText.includes(text),
    )
    .map(({ id }) => id);
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
    path: publicReportPath(blockedLiveVideoVttPath),
    exists: fact.exists === true,
    size: safeNonnegativeInteger(fact.size),
    webvtt: fact.vtt?.webvtt === true,
    cueCount: safeNonnegativeInteger(fact.vtt?.cueCount),
    cueTextSha256: safeSha256(fact.vtt?.cueTextSha256),
    requiredFragmentIds: requiredFragments.map(({ id }) => id),
    missingRequiredFragmentIds,
    reasonPresent: Boolean(blockedReason),
    reasonExplained,
    ready:
      fact.exists === true &&
      Number(fact.size) > 0 &&
      fact.vtt?.webvtt === true &&
      Number(fact.vtt?.cueCount ?? 0) >= 10 &&
      missingRequiredFragmentIds.length === 0 &&
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
    path: publicReportPath(blockedLiveVideoMp4Path),
    exists: fact.exists === true,
    size: safeNonnegativeInteger(fact.size),
    media: safeArtifactFactSummary(fact, "mp4").media,
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
    .map((artifact) => {
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
      return { blockedDiagnosticPath, diagnosticOnly, notLiveTransferEvidence };
    })
    .filter(Boolean);
  return {
    transcriptDiagnosticVideoOnly,
    transcriptNotLiveTransferEvidence,
    blockedArtifactPathCount: blockedArtifactPaths.length,
    diagnosticArtifactCount: diagnosticArtifacts.length,
    blockedDiagnosticArtifactCount: diagnosticArtifacts.filter(
      (artifact) => artifact.blockedDiagnosticPath,
    ).length,
    diagnosticOnlyArtifactCount: diagnosticArtifacts.filter(
      (artifact) => artifact.diagnosticOnly,
    ).length,
    notLiveTransferEvidenceArtifactCount: diagnosticArtifacts.filter(
      (artifact) => artifact.notLiveTransferEvidence,
    ).length,
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
  governancePlan = null,
  governanceRegistration = null,
  governanceActivation = null,
  governanceEvidenceReady = false,
} = {}) => {
  const registrationToriiUrl = readFirstString(
    governanceRegistration,
    "torii_url",
  );
  const activationToriiUrl = readFirstString(governanceActivation, "torii_url");
  const governancePinnedToriiUrl = registrationToriiUrl;
  const governancePinReady =
    governanceEvidenceReady === true &&
    isRecord(governancePlan) &&
    registrationToriiUrl.length > 0 &&
    registrationToriiUrl === activationToriiUrl;
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
  if (!governanceEvidenceReady) {
    problems.push({
      id: "governance-evidence",
      detail:
        "Production completion requires a reviewed governance plan, exact byte-pinned registration and activation evidence, and matching public typed-registry readback.",
    });
  }
  if (!freshPreflightCompleted) {
    problems.push({
      id: "fresh-public-preflight-completed",
      detail:
        "Production completion requires a newly executed canonical public preflight in this process.",
    });
  }
  const preflightEndpointIdentityReady =
    preflightReport?.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA &&
    preflightReport?.protocolSource === "typed-sccp-registry-v1" &&
    preflightReport?.manifestSource === "public-registry" &&
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
    governanceEvidenceReady,
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
  preLiveInputSnapshot = null,
  successExecutionPolicy,
  authoritativeRevalidation,
  expectedLiveEvidencePackageHashes = null,
  liveCaptureWitnessArtifact = null,
  liveCaptureReviewAttestationArtifact = null,
  finalCaptureReviewBoundary = null,
  liveCaptureVideoPath = null,
  expectedLiveCaptureVideoSha256 = null,
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
        transcriptPath: publicReportPath(liveVideoTranscriptPath),
        blockedTranscriptPath: publicReportPath(blockedLiveVideoTranscriptPath),
        blockedTranscript: isRecord(blockedLiveVideoTranscript)
          ? {
              path: publicReportPath(blockedLiveVideoTranscriptPath),
              present: true,
              schemaOk:
                readFirstString(blockedLiveVideoTranscript, "schema") ===
                "iroha-demo-sccp-solana-live-video-blocked/v1",
              routeOk:
                readFirstString(
                  blockedLiveVideoTranscript,
                  "routeId",
                  "route_id",
                ) === SCCP_SOLANA_XOR_ROUTE_ID,
              checkedAtValid:
                parseTimestampMs(
                  readFirstString(
                    blockedLiveVideoTranscript,
                    "checkedAt",
                    "checked_at",
                  ),
                ) !== null,
              ready: blockedLiveVideoTranscript.ready === true,
              reasonPresent: Boolean(
                readFirstString(blockedLiveVideoTranscript, "reason"),
              ),
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
              path: publicReportPath(blockedLiveVideoTranscriptPath),
              present: false,
            },
        blockedSubtitle,
        blockedDiagnosticMp4,
        blockedPreflightReady: isRecord(blockedLiveVideoTranscript)
          ? blockedLiveVideoTranscript.preflightReady === true
          : null,
        blockedDiagnosticsPresent: isRecord(blockedDiagnostics),
        blockedProductionGateSnapshotOmitted,
        blockedProductionGateSnapshotOmissionReason:
          blockedProductionGateSnapshotOmitted
            ? "Omitted to avoid recursively embedding stale production-gate evidence in the current production-gate report."
            : null,
        blockedPublicSolanaCapability: isRecord(blockedLiveVideoTranscript)
          ? {
              present: isRecord(
                readFirstRecord(
                  blockedLiveVideoTranscript,
                  "publicSolanaCapability",
                  "public_solana_capability",
                ),
              ),
              ready:
                readFirstRecord(
                  blockedLiveVideoTranscript,
                  "publicSolanaCapability",
                  "public_solana_capability",
                )?.ready === true,
            }
          : null,
        blockedPublicSolanaLane: isRecord(blockedLiveVideoTranscript)
          ? {
              present: isRecord(
                readFirstRecord(
                  blockedLiveVideoTranscript,
                  "publicSolanaLane",
                  "public_solana_lane",
                ),
              ),
              ready:
                readFirstRecord(
                  blockedLiveVideoTranscript,
                  "publicSolanaLane",
                  "public_solana_lane",
                )?.ready === true,
            }
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
  const transcriptPreLiveInputSnapshotSha256 = readFirstString(
    transcriptProductionGatePolicy,
    "preLiveInputSnapshotSha256",
    "pre_live_input_snapshot_sha256",
  );
  const currentPreLiveInputSnapshotSha256 = readFirstString(
    preLiveInputSnapshot,
    "preLiveInputSnapshotSha256",
    "pre_live_input_snapshot_sha256",
  );
  const transcriptPreLiveInputSnapshotOk =
    /^0x[0-9a-f]{64}$/u.test(transcriptPreLiveInputSnapshotSha256) &&
    transcriptPreLiveInputSnapshotSha256 === currentPreLiveInputSnapshotSha256;
  const transcriptProductionGateStateOk =
    transcriptPreLiveInputSnapshotOk &&
    ((transcriptProductionGatePolicy?.ready === true &&
      transcriptProductionGateFailedIds.length === 0) ||
      (transcriptProductionGatePolicy?.ready === false &&
        transcriptProductionGateFailedIds.length === 1 &&
        transcriptProductionGateFailedIds[0] === "live-bidirectional-video"));
  const liveGovernancePlanSha256 = readFirstString(
    liveEvidence,
    "governancePlanSha256",
  );
  const liveGovernanceRegistrationSha256 = readFirstString(
    liveEvidence,
    "governanceRegistrationSha256",
  );
  const liveGovernanceActivationSha256 = readFirstString(
    liveEvidence,
    "governanceActivationSha256",
  );
  const livePublicRegistrySha256 = readFirstString(
    liveEvidence,
    "publicRegistrySha256",
  );
  const expectedGovernancePlanSha256 = readFirstString(
    expectedLiveEvidencePackageHashes,
    "governancePlanSha256",
    "planSha256",
  );
  const expectedGovernanceRegistrationSha256 = readFirstString(
    expectedLiveEvidencePackageHashes,
    "governanceRegistrationSha256",
    "registrationArtifactSha256",
  );
  const expectedGovernanceActivationSha256 = readFirstString(
    expectedLiveEvidencePackageHashes,
    "governanceActivationSha256",
    "activationArtifactSha256",
  );
  const expectedPublicRegistrySha256 = readFirstString(
    expectedLiveEvidencePackageHashes,
    "publicRegistrySha256",
  );
  const packageHashesOk =
    isHex32(liveGovernancePlanSha256) &&
    isHex32(liveGovernanceRegistrationSha256) &&
    isHex32(liveGovernanceActivationSha256) &&
    isHex32(livePublicRegistrySha256) &&
    liveGovernancePlanSha256 === expectedGovernancePlanSha256 &&
    liveGovernanceRegistrationSha256 === expectedGovernanceRegistrationSha256 &&
    liveGovernanceActivationSha256 === expectedGovernanceActivationSha256 &&
    livePublicRegistrySha256 === expectedPublicRegistrySha256 &&
    transcriptSuccessPolicy?.governancePlanSha256 ===
      liveGovernancePlanSha256 &&
    transcriptSuccessPolicy?.governanceRegistrationSha256 ===
      liveGovernanceRegistrationSha256 &&
    transcriptSuccessPolicy?.governanceActivationSha256 ===
      liveGovernanceActivationSha256 &&
    transcriptSuccessPolicy?.publicRegistrySha256 === livePublicRegistrySha256;
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
    transcriptSuccessPolicy?.liveCapturePinned === true &&
    transcriptSuccessPolicy?.liveCaptureWitnessPinned === true &&
    isHex32(transcriptSuccessPolicy?.liveCaptureWitnessSha256) &&
    transcriptSuccessPolicy?.liveCaptureReviewAttestationPinned === true &&
    isHex32(transcriptSuccessPolicy?.liveCaptureReviewAttestationSha256) &&
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
  const sourceCapture = readFirstRecord(
    liveVideoTranscript,
    "sourceCapture",
    "source_capture",
  );
  const mediaSourceCapture = readFirstRecord(
    mediaVerification,
    "sourceCapture",
    "source_capture",
  );
  const sourceCaptureSha256 = readFirstString(sourceCapture, "sha256");
  const sourceCaptureSize = Number(sourceCapture?.size);
  const sourceSemanticWitnessAnalysis = readFirstRecord(
    sourceCapture,
    "semanticWitnessAnalysis",
    "semantic_witness_analysis",
  );
  const sourceSemanticWitnessOk =
    sourceSemanticWitnessAnalysis?.ready === true &&
    sourceSemanticWitnessAnalysis?.semanticallyBound === true &&
    isHex32(sourceSemanticWitnessAnalysis?.evidenceBindingSha256) &&
    readFirstArray(sourceSemanticWitnessAnalysis, "blockers").length === 0 &&
    readFirstArray(sourceSemanticWitnessAnalysis, "markers").length === 4 &&
    readFirstArray(sourceSemanticWitnessAnalysis, "markers").every(
      (marker) =>
        marker?.ready === true &&
        marker?.payloadMatches === true &&
        marker?.frameMatches === true &&
        marker?.dwellShapeMatches === true,
    ) &&
    sourceSemanticWitnessAnalysis?.reviewAuthentication?.ready === true &&
    sourceSemanticWitnessAnalysis?.reviewAuthentication?.authenticated === true;
  const captureSemanticWitnessArtifact = readFirstRecord(
    liveVideoTranscript,
    "captureSemanticWitnessArtifact",
    "capture_semantic_witness_artifact",
  );
  const captureSemanticWitness = readFirstRecord(
    liveVideoTranscript,
    "captureSemanticWitness",
    "capture_semantic_witness",
  );
  const semanticWitnessArtifactPin = checkSolanaLiveCaptureWitnessArtifactPin({
    witness: captureSemanticWitness,
    artifact: captureSemanticWitnessArtifact,
    successPolicy: transcriptSuccessPolicy,
    externalArtifact: liveCaptureWitnessArtifact,
  });
  const semanticWitnessArtifactOk =
    semanticWitnessArtifactPin.status === "pass";
  const captureReviewAttestation = readFirstRecord(
    liveVideoTranscript,
    "captureReviewAttestation",
    "capture_review_attestation",
  );
  const captureReviewAttestationArtifact = readFirstRecord(
    liveVideoTranscript,
    "captureReviewAttestationArtifact",
    "capture_review_attestation_artifact",
  );
  const captureReviewAttestationPin =
    checkSolanaLiveCaptureReviewAttestationArtifactPin({
      attestation: captureReviewAttestation,
      artifact: captureReviewAttestationArtifact,
      successPolicy: transcriptSuccessPolicy,
      externalArtifact: liveCaptureReviewAttestationArtifact,
    });
  const captureReviewAttestationOk =
    captureReviewAttestationPin.status === "pass" &&
    finalCaptureReviewBoundary?.ready === true &&
    finalCaptureReviewBoundary?.authentication?.ready === true &&
    finalCaptureReviewBoundary?.authentication?.authenticated === true;
  const sourceCaptureOk =
    sourceCapture?.verifiedRealCapture === true &&
    sourceCapture?.ready === true &&
    sourceCapture?.mediaType === "video/mp4" &&
    Number.isSafeInteger(sourceCaptureSize) &&
    sourceCaptureSize > 0 &&
    isHex32(sourceCaptureSha256) &&
    isHex32(sourceCapture?.sampledFrameSha256) &&
    isHex32(sourceCapture?.audioSampleSha256) &&
    isHex32(sourceCapture?.videoEssenceSha256) &&
    isHex32(sourceCapture?.audioEssenceSha256) &&
    mediaSourceCapture?.verifiedRealCapture === true &&
    mediaSourceCapture?.ready === true &&
    mediaSourceCapture?.sha256 === sourceCaptureSha256 &&
    Number(mediaSourceCapture?.size) === sourceCaptureSize &&
    mediaSourceCapture?.sampledFrameSha256 ===
      sourceCapture?.sampledFrameSha256 &&
    mediaSourceCapture?.audioSampleSha256 ===
      sourceCapture?.audioSampleSha256 &&
    mediaSourceCapture?.videoEssenceSha256 ===
      sourceCapture?.videoEssenceSha256 &&
    mediaSourceCapture?.audioEssenceSha256 ===
      sourceCapture?.audioEssenceSha256 &&
    sourceSemanticWitnessOk &&
    semanticWitnessArtifactOk &&
    captureReviewAttestationOk &&
    transcriptSuccessPolicy?.liveCapturePinned === true &&
    transcriptSuccessPolicy?.liveCaptureSha256 === sourceCaptureSha256;
  const mediaVerificationOk =
    mediaVerification?.ready === true &&
    mediaVerification?.streams?.video?.codec === "h264" &&
    sourceCaptureOk;
  const subtitleExplanation = liveVideoSubtitleExplanation(
    liveVideoTranscript,
    liveEvidenceStatus,
  );
  const vttFact = artifactFact(artifactFacts, paths.vtt);
  const subtitleSnapshotBindingOk =
    /^0x[0-9a-f]{64}$/u.test(currentPreLiveInputSnapshotSha256) &&
    Array.isArray(vttFact.vtt?.cueTexts) &&
    vttFact.vtt.cueTexts.some((text) =>
      String(text).includes(currentPreLiveInputSnapshotSha256),
    );
  const vttCueTextMatchesTranscript =
    vttFact.vtt?.cueCount === subtitleExplanation.cueCount &&
    vttFact.vtt?.cueTextSha256 === subtitleExplanation.cueTextSha256 &&
    isHex32(vttFact.vtt?.cueTimelineSha256) &&
    vttFact.vtt?.cueTimelineSha256 === subtitleExplanation.cueTimelineSha256;
  const mp4Fact = artifactFact(artifactFacts, paths.mp4);
  const sourceCaptureFact =
    typeof liveCaptureVideoPath === "string" && liveCaptureVideoPath.trim()
      ? artifactFact(artifactFacts, liveCaptureVideoPath)
      : { path: null, exists: false, size: 0 };
  const outputContentAnalysis = mp4Fact.media?.contentAnalysis;
  const actualSourceContentAnalysis = sourceCaptureFact.media?.contentAnalysis;
  const outputSemanticWitnessAnalysis = readFirstRecord(
    outputContentAnalysis,
    "semanticWitnessAnalysis",
    "semantic_witness_analysis",
  );
  const outputSemanticWitnessOk =
    outputSemanticWitnessAnalysis?.ready === true &&
    outputSemanticWitnessAnalysis?.semanticallyBound === true &&
    outputSemanticWitnessAnalysis?.evidenceBindingSha256 ===
      sourceSemanticWitnessAnalysis?.evidenceBindingSha256 &&
    canonicalSccpJson(outputSemanticWitnessAnalysis?.markers ?? []) ===
      canonicalSccpJson(sourceSemanticWitnessAnalysis?.markers ?? []) &&
    outputSemanticWitnessAnalysis?.reviewAuthentication?.ready === true &&
    outputSemanticWitnessAnalysis?.reviewAuthentication?.authenticated ===
      true &&
    outputSemanticWitnessAnalysis?.reviewAuthentication?.signedPayloadSha256 ===
      finalCaptureReviewBoundary?.authentication?.signedPayloadSha256;
  const outputContentAnalysisOk =
    outputContentAnalysis?.ready === true &&
    outputContentAnalysis?.verifiedRealCapture === true &&
    outputSemanticWitnessOk;
  const normalizedExpectedSourceCaptureSha256 = String(
    expectedLiveCaptureVideoSha256 ?? "",
  ).toLowerCase();
  const sourceFinalMediaDisjoint =
    typeof sourceCaptureFact.path === "string" &&
    typeof mp4Fact.path === "string" &&
    normalizePath(sourceCaptureFact.path) !== normalizePath(mp4Fact.path) &&
    !(
      sourceCaptureFact.device === mp4Fact.device &&
      sourceCaptureFact.inode === mp4Fact.inode
    );
  const reopenedSourceCaptureOk =
    sourceCaptureFact.exists === true &&
    Number.isSafeInteger(sourceCaptureFact.size) &&
    sourceCaptureFact.size > 0 &&
    /^0x[0-9a-f]{64}$/u.test(normalizedExpectedSourceCaptureSha256) &&
    sourceCaptureFact.sha256 === normalizedExpectedSourceCaptureSha256 &&
    sourceCaptureFact.sha256 === sourceCaptureSha256 &&
    sourceCaptureFact.size === sourceCaptureSize &&
    actualSourceContentAnalysis?.ready === true &&
    actualSourceContentAnalysis?.verifiedRealCapture === true &&
    actualSourceContentAnalysis?.streamShape?.videoCount === 1 &&
    actualSourceContentAnalysis?.streamShape?.audioCount === 1 &&
    actualSourceContentAnalysis?.streamShape?.subtitleCount === 0 &&
    actualSourceContentAnalysis?.streamShape?.unexpectedCount === 0 &&
    actualSourceContentAnalysis?.sampledFrameSha256 ===
      sourceCapture?.sampledFrameSha256 &&
    actualSourceContentAnalysis?.audioSampleSha256 ===
      sourceCapture?.audioSampleSha256 &&
    actualSourceContentAnalysis?.videoEssenceSha256 ===
      sourceCapture?.videoEssenceSha256 &&
    actualSourceContentAnalysis?.audioEssenceSha256 ===
      sourceCapture?.audioEssenceSha256 &&
    actualSourceContentAnalysis?.semanticWitnessAnalysis?.ready === true &&
    actualSourceContentAnalysis?.semanticWitnessAnalysis?.semanticallyBound ===
      true &&
    actualSourceContentAnalysis?.semanticWitnessAnalysis?.reviewAuthentication
      ?.authenticated === true &&
    sourceFinalMediaDisjoint;
  const fullDecodedEssenceMatches =
    reopenedSourceCaptureOk &&
    outputContentAnalysisOk &&
    isHex32(actualSourceContentAnalysis?.videoEssenceSha256) &&
    isHex32(actualSourceContentAnalysis?.audioEssenceSha256) &&
    actualSourceContentAnalysis.videoEssenceSha256 ===
      outputContentAnalysis.videoEssenceSha256 &&
    actualSourceContentAnalysis.audioEssenceSha256 ===
      outputContentAnalysis.audioEssenceSha256;
  const sourceOutputDurationMatches =
    Number.isFinite(Number(actualSourceContentAnalysis?.durationSeconds)) &&
    Number.isFinite(Number(outputContentAnalysis?.durationSeconds)) &&
    Math.abs(
      Number(actualSourceContentAnalysis.durationSeconds) -
        Number(outputContentAnalysis.durationSeconds),
    ) <= 0.05;
  const sourceOutputShapeMatches =
    actualSourceContentAnalysis?.width === outputContentAnalysis?.width &&
    actualSourceContentAnalysis?.height === outputContentAnalysis?.height &&
    actualSourceContentAnalysis?.streamShape?.videoCount === 1 &&
    actualSourceContentAnalysis?.streamShape?.audioCount === 1 &&
    actualSourceContentAnalysis?.streamShape?.subtitleCount === 0 &&
    actualSourceContentAnalysis?.streamShape?.unexpectedCount === 0 &&
    outputContentAnalysis?.streamShape?.videoCount === 1 &&
    outputContentAnalysis?.streamShape?.audioCount === 1 &&
    outputContentAnalysis?.streamShape?.subtitleCount === 1 &&
    outputContentAnalysis?.streamShape?.subtitleCodec === "mov_text" &&
    outputContentAnalysis?.streamShape?.unexpectedCount === 0;
  const sourceOutputSampleSequenceMatches =
    actualSourceContentAnalysis?.sampledFrameSha256 ===
      outputContentAnalysis?.sampledFrameSha256 &&
    actualSourceContentAnalysis?.audioSampleSha256 ===
      outputContentAnalysis?.audioSampleSha256;
  const sourceOutputTimelineMatches =
    actualSourceContentAnalysis?.streamTimeline?.video?.ready === true &&
    actualSourceContentAnalysis?.streamTimeline?.audio?.ready === true &&
    outputContentAnalysis?.streamTimeline?.video?.ready === true &&
    outputContentAnalysis?.streamTimeline?.audio?.ready === true &&
    canonicalSccpJson(actualSourceContentAnalysis.streamTimeline.video) ===
      canonicalSccpJson(outputContentAnalysis.streamTimeline.video) &&
    canonicalSccpJson(actualSourceContentAnalysis.streamTimeline.audio) ===
      canonicalSccpJson(outputContentAnalysis.streamTimeline.audio);
  const sourceCaptureContentBindingOk =
    reopenedSourceCaptureOk &&
    fullDecodedEssenceMatches &&
    sourceOutputDurationMatches &&
    sourceOutputShapeMatches &&
    sourceOutputSampleSequenceMatches &&
    sourceOutputTimelineMatches &&
    outputContentAnalysisOk &&
    outputContentAnalysis?.sampledFrameSha256 ===
      sourceCapture?.sampledFrameSha256 &&
    outputContentAnalysis?.audioSampleSha256 ===
      sourceCapture?.audioSampleSha256 &&
    outputSemanticWitnessOk;
  const mediaArtifacts = readFirstRecord(liveVideoTranscript, "mediaArtifacts");
  const mediaArtifactPinCheck = checkSolanaLiveVideoMediaArtifactPins({
    mediaArtifacts,
    mp4Fact,
    vttFact,
    mp4Path: paths.mp4,
    vttPath: paths.vtt,
  });
  const mediaArtifactPinsOk = mediaArtifactPinCheck.status === "pass";
  const embeddedSubtitleMatchesVtt =
    mp4Fact.media?.embeddedSubtitle?.extracted === true &&
    mp4Fact.media.embeddedSubtitle.cueCount === vttFact.vtt?.cueCount &&
    mp4Fact.media.embeddedSubtitle.cueTextSha256 ===
      vttFact.vtt?.cueTextSha256 &&
    isHex32(mp4Fact.media.embeddedSubtitle.cueTimelineSha256) &&
    mp4Fact.media.embeddedSubtitle.cueTimelineSha256 ===
      vttFact.vtt?.cueTimelineSha256;
  const vttOk =
    vttEvidenceReady(artifactFacts, paths.vtt) &&
    vttCueTextMatchesTranscript &&
    subtitleSnapshotBindingOk;
  const ok =
    schemaOk &&
    routeOk &&
    readyOk &&
    evidenceOk &&
    mp4Ok &&
    mediaArtifactPinsOk &&
    mediaVerificationOk &&
    outputContentAnalysisOk &&
    sourceCaptureContentBindingOk &&
    captureReviewAttestationOk &&
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
      transcriptPath: publicReportPath(liveVideoTranscriptPath),
      schemaOk,
      routeOk,
      readyOk,
      evidenceOk,
      liveEvidenceStatus: safeLiveEvidenceStatus(liveEvidenceStatus),
      packageHashesOk,
      packageHashes: {
        governancePlanSha256: safeSha256(liveGovernancePlanSha256),
        expectedGovernancePlanSha256: safeSha256(expectedGovernancePlanSha256),
        governanceRegistrationSha256: safeSha256(
          liveGovernanceRegistrationSha256,
        ),
        expectedGovernanceRegistrationSha256: safeSha256(
          expectedGovernanceRegistrationSha256,
        ),
        governanceActivationSha256: safeSha256(liveGovernanceActivationSha256),
        expectedGovernanceActivationSha256: safeSha256(
          expectedGovernanceActivationSha256,
        ),
        publicRegistrySha256: safeSha256(livePublicRegistrySha256),
        expectedPublicRegistrySha256: safeSha256(expectedPublicRegistrySha256),
      },
      transcriptSuccessPolicy: safePolicySummary(
        transcriptSuccessPolicy,
        "transcript",
      ),
      transcriptSuccessPolicyOk,
      transcriptPreLiveInputSnapshotSha256: safeSha256(
        transcriptPreLiveInputSnapshotSha256,
      ),
      currentPreLiveInputSnapshotSha256: safeSha256(
        currentPreLiveInputSnapshotSha256,
      ),
      transcriptPreLiveInputSnapshotOk,
      transcriptAuthoritativeReadbackOk,
      successExecutionPolicy: safePolicySummary(
        successExecutionPolicy,
        "production-gate",
      ),
      successExecutionPolicyOk,
      authoritativeRevalidation: safeAuthoritativeRevalidationSummary(
        authoritativeRevalidation,
      ),
      trustedFreshRevalidationOk,
      mp4: safeArtifactFactSummary(mp4Fact, "mp4"),
      mediaArtifacts: safeMediaArtifactsSummary(mediaArtifacts),
      mediaArtifactPinsOk,
      mediaArtifactPinCheck: {
        status: mediaArtifactPinCheck.status === "pass" ? "pass" : "fail",
        mp4Ready: mediaArtifactPinCheck.evidence?.mp4Ready === true,
        vttReady: mediaArtifactPinCheck.evidence?.vttReady === true,
      },
      mediaVerification: safeMediaVerificationSummary(mediaVerification),
      mediaVerificationOk,
      sourceCapture: safeSourceCaptureSummary(sourceCapture),
      reopenedSourceCapture: safeArtifactFactSummary(sourceCaptureFact, "mp4"),
      sourceCaptureOk,
      reopenedSourceCaptureOk,
      sourceFinalMediaDisjoint,
      actualSourceContentAnalysis: safeLiveCaptureContentSummary(
        actualSourceContentAnalysis,
      ),
      fullDecodedEssenceMatches,
      sourceOutputDurationMatches,
      sourceOutputShapeMatches,
      sourceOutputSampleSequenceMatches,
      sourceOutputTimelineMatches,
      sourceSemanticWitnessOk,
      semanticWitnessArtifactOk,
      semanticWitnessArtifactPin: {
        status: semanticWitnessArtifactPin.status,
        embeddedWitnessBytesMatch:
          semanticWitnessArtifactPin.evidence?.embeddedWitnessBytesMatch ===
          true,
        policyPinMatches:
          semanticWitnessArtifactPin.evidence?.policyPinMatches === true,
        externalArtifactMatches:
          semanticWitnessArtifactPin.evidence?.externalArtifactMatches === true,
      },
      captureReviewAttestationOk,
      captureReviewAttestationPin: {
        status: captureReviewAttestationPin.status,
        embeddedBytesMatch:
          captureReviewAttestationPin.evidence?.embeddedBytesMatch === true,
        policyPinMatches:
          captureReviewAttestationPin.evidence?.policyPinMatches === true,
        externalArtifactMatches:
          captureReviewAttestationPin.evidence?.externalArtifactMatches ===
          true,
      },
      captureReviewAuthentication: {
        ready: finalCaptureReviewBoundary?.ready === true,
        stableArtifactReinspection:
          finalCaptureReviewBoundary?.stableArtifactReinspection === true,
        stableMediaReinspection:
          finalCaptureReviewBoundary?.stableMediaReinspection === true,
        authenticated:
          finalCaptureReviewBoundary?.authentication?.authenticated === true,
        policySha256: safeSha256(
          finalCaptureReviewBoundary?.policyLoad?.artifactSha256,
        ),
        signedPayloadSha256: safeSha256(
          finalCaptureReviewBoundary?.authentication?.signedPayloadSha256,
        ),
        threshold:
          finalCaptureReviewBoundary?.authentication?.threshold ?? null,
        validSignatureCount:
          finalCaptureReviewBoundary?.authentication?.validSignatureCount ?? 0,
        error: finalCaptureReviewBoundary?.error ?? null,
      },
      outputContentAnalysis: safeLiveCaptureContentSummary(
        outputContentAnalysis,
      ),
      outputContentAnalysisOk,
      outputSemanticWitnessOk,
      sourceCaptureContentBindingOk,
      vtt: safeArtifactFactSummary(vttFact, "vtt"),
      subtitleSnapshotBindingOk,
      vttCueTextMatchesTranscript,
      embeddedSubtitleMatchesVtt,
      subtitleExplanation: safeSubtitleExplanation(subtitleExplanation),
      diagnosticFlags,
    },
  );
};

const productionActionPath = (deployDir, defaultPath) => {
  const selected = deployDir
    ? path.join(path.resolve(deployDir), path.basename(defaultPath))
    : defaultPath;
  const relative = path.relative(repoRoot, selected);
  return relative &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
    ? relative
    : selected;
};

const SOLANA_PRODUCTION_ACTION_ORDER = Object.freeze([
  "deploy-fresh-exact-solana-programs",
  "capture-and-pin-solana-ordered-initialization-evidence",
  "provide-reviewed-solana-route-candidate",
  "build-reviewed-solana-governance-plan",
  "submit-solana-route-registration-proposal",
  "enact-and-readback-solana-route-registration",
  "submit-solana-route-activation-proposal",
  "enact-and-readback-solana-route-activation",
  "complete-solana-smoke-readiness",
  "record-solana-live-bidirectional-video",
]);

export const SOLANA_PRODUCTION_NEXT_ACTION_ORDER =
  SOLANA_PRODUCTION_ACTION_ORDER;

/**
 * Build a fail-closed first-release operator DAG. A runnable command appears
 * only on the first missing stage and only when that stage has a real CLI.
 * Parliament enactment intentionally remains commandless because this
 * repository exposes proposal submission, not enactment authority. Fresh
 * Loader-v3 deployment uses the single-process, runtime-only signer ceremony.
 */
export const buildSolanaProductionNextActionDag = ({
  deployDir = null,
  freshDeployReady = false,
  exactInitializationReady = false,
  routeCandidateReady = false,
  governancePlanReady = false,
  registrationProposalReady = false,
  registrationReadbackReady = false,
  activationProposalReady = false,
  activationReadbackReady = false,
  smokeReady = false,
  liveCaptureReady = false,
} = {}) => {
  const selectedDeployDir = deployDir
    ? path.resolve(deployDir)
    : DEFAULT_DEPLOY_DIR;
  const initializerInput = productionActionPath(
    selectedDeployDir,
    DEFAULT_EXACT_INITIALIZER_INPUT_PATH,
  );
  const freshDeployReport = productionActionPath(
    selectedDeployDir,
    DEFAULT_FRESH_DEPLOY_REPORT_PATH,
  );
  const freshDeployContext = productionActionPath(
    selectedDeployDir,
    path.join(DEFAULT_DEPLOY_DIR, "taira-solana-xor-fresh-deploy-context.json"),
  );
  const freshDeployPlan = productionActionPath(
    selectedDeployDir,
    path.join(DEFAULT_DEPLOY_DIR, "taira-solana-xor-fresh-deploy-plan.json"),
  );
  const freshDeployConfirmationTemplate = productionActionPath(
    selectedDeployDir,
    path.join(
      DEFAULT_DEPLOY_DIR,
      "taira-solana-xor-fresh-deploy-confirmation.template.json",
    ),
  );
  const freshDeployConfirmation = productionActionPath(
    selectedDeployDir,
    path.join(
      DEFAULT_DEPLOY_DIR,
      "taira-solana-xor-fresh-deploy-confirmation.json",
    ),
  );
  const freshDeployConfirmationSha256 = productionActionPath(
    selectedDeployDir,
    path.join(
      DEFAULT_DEPLOY_DIR,
      "taira-solana-xor-fresh-deploy-confirmation.sha256",
    ),
  );
  const freshDeployJournal = productionActionPath(
    selectedDeployDir,
    path.join(
      DEFAULT_DEPLOY_DIR,
      "taira-solana-xor-fresh-deploy.journal.jsonl",
    ),
  );
  const initializerJournal = productionActionPath(
    selectedDeployDir,
    DEFAULT_EXACT_INITIALIZER_JOURNAL_PATH,
  );
  const orderedInitialization = productionActionPath(
    selectedDeployDir,
    DEFAULT_ORDERED_INITIALIZATION_EVIDENCE_PATH,
  );
  const routeCandidate = productionActionPath(
    selectedDeployDir,
    DEFAULT_GOVERNED_ROUTE_CANDIDATE_PATH,
  );
  const nativeTrustAnchor = productionActionPath(
    selectedDeployDir,
    DEFAULT_NATIVE_TRUST_ANCHOR_PATH,
  );
  const governancePlan = productionActionPath(
    selectedDeployDir,
    DEFAULT_GOVERNANCE_PLAN_PATH,
  );
  const governanceRegistration = productionActionPath(
    selectedDeployDir,
    DEFAULT_GOVERNANCE_REGISTER_RESULT_PATH,
  );
  const governanceActivation = productionActionPath(
    selectedDeployDir,
    DEFAULT_GOVERNANCE_ACTIVATE_RESULT_PATH,
  );
  const proverGovernanceApproval = productionActionPath(
    selectedDeployDir,
    DEFAULT_PROVER_GOVERNANCE_APPROVAL_PATH,
  );
  const smokeOutputDir = productionActionPath(
    selectedDeployDir,
    path.join(DEFAULT_DEPLOY_DIR, "smoke-readiness"),
  );
  const productionGateSnapshot = productionActionPath(
    path.join(selectedDeployDir, "production-gate"),
    path.join(DEFAULT_DEPLOY_DIR, "production-gate", REPORT_FILE),
  );
  const stages = [
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[0],
      ready: freshDeployReady,
      title: "Deploy three fresh immutable Loader-v3 programs",
      detail:
        "Run the single-process production ceremony: it validates every independent pin, generates all eight signers only in memory, exposes the ephemeral payer for funding and public plan for review, then accepts one separately hash-pinned irreversible confirmation before any mutation.",
      command: [
        "npm",
        "run",
        "sccp:solana:fresh-deploy",
        "--",
        "ceremony",
        "--solana-rpc-url",
        CANONICAL_SOLANA_TESTNET_RPC_URL,
        "--context",
        freshDeployContext,
        "--expected-context-sha256",
        "<reviewed-context-sha256>",
        "--native-verifier-artifact",
        "<reviewed-native-verifier-sbpf-v3.so>",
        "--native-verifier-artifact-sha256",
        "<reviewed-native-verifier-artifact-sha256>",
        "--destination-artifact",
        "<reviewed-destination-sbpf-v3.so>",
        "--destination-artifact-sha256",
        "<reviewed-destination-artifact-sha256>",
        "--source-artifact",
        "<reviewed-source-sbpf-v3.so>",
        "--source-artifact-sha256",
        "<reviewed-source-artifact-sha256>",
        "--native-verifier-sbf-evidence",
        "<reviewed-native-verifier-sbf-evidence.json>",
        "--native-verifier-sbf-evidence-sha256",
        "<reviewed-native-verifier-sbf-evidence-sha256>",
        "--destination-sbf-evidence",
        "<reviewed-destination-sbf-evidence.json>",
        "--destination-sbf-evidence-sha256",
        "<reviewed-destination-sbf-evidence-sha256>",
        "--source-sbf-evidence",
        "<reviewed-source-sbf-evidence.json>",
        "--source-sbf-evidence-sha256",
        "<reviewed-source-sbf-evidence-sha256>",
        "--expected-validator-sha256",
        "<reviewed-validator-binary-sha256>",
        "--plan",
        freshDeployPlan,
        "--confirmation-template",
        freshDeployConfirmationTemplate,
        "--confirmation",
        freshDeployConfirmation,
        "--confirmation-sha256-file",
        freshDeployConfirmationSha256,
        "--journal",
        freshDeployJournal,
        "--report",
        freshDeployReport,
        "--review-timeout-ms",
        "900000",
        "--submit",
        "true",
      ],
      requiredInputs: [
        "reviewed-solana-testnet-context-snapshot",
        "three-reviewed-sbpf-v3-artifacts",
        "three-authenticated-sbf-validation-evidence-files",
        "independent-irrevocable-confirmation-sha256-sidecar",
        "funded-ephemeral-runtime-only-payer",
        "atomic-three-program-set-authority-none",
      ],
      produces: [freshDeployReport],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[1],
      ready: exactInitializationReady,
      title: "Run exact post-immutability initialization",
      detail:
        "Run the exact initializer after the fresh deployment is immutably finalized; it writes the ordered-initialization evidence consumed by governance and this gate.",
      command: [
        "npm",
        "run",
        "sccp:solana:exact-initialize",
        "--",
        "--input",
        initializerInput,
        "--expected-input-sha256",
        "<reviewed-initializer-input-sha256>",
        "--fresh-deploy-report",
        freshDeployReport,
        "--expected-fresh-deploy-report-sha256",
        "<reviewed-fresh-deploy-report-sha256>",
        "--journal",
        initializerJournal,
        "--evidence",
        orderedInitialization,
        "--submit",
        "true",
      ],
      requiredInputs: [
        freshDeployReport,
        "reviewed-exact-initializer-input",
        "SCCP_SOLANA_INITIALIZER_SIGNER",
        "SCCP_SOLANA_INITIALIZER_MINT_SIGNER",
      ],
      produces: [orderedInitialization],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[2],
      ready: routeCandidateReady,
      title: "Provide the reviewed typed route candidate",
      detail:
        "Independently review and byte-pin the exact typed taira_sol_xor revision-1 governed route and native Solana trust anchor; no local manifest may substitute for them.",
      command: [],
      requiredInputs: [
        "independently-reviewed-governed-route",
        "independently-reviewed-native-trust-anchor",
      ],
      produces: [routeCandidate, nativeTrustAnchor],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[3],
      ready: governancePlanReady,
      title: "Build the reviewed two-phase governance plan",
      detail:
        "Compile the byte-pinned typed route, native trust anchor, and ordered initialization evidence into the exact registration/activation plan.",
      command: [
        "npm",
        "run",
        "sccp:solana:governance-plan",
        "--",
        "--route",
        routeCandidate,
        "--expected-route-sha256",
        "<reviewed-route-sha256>",
        "--native-trust-anchor",
        nativeTrustAnchor,
        "--expected-native-trust-anchor-sha256",
        "<reviewed-native-trust-anchor-sha256>",
        "--ordered-initialization-evidence",
        orderedInitialization,
        "--expected-ordered-initialization-evidence-sha256",
        "<reviewed-ordered-initialization-sha256>",
        "--out",
        governancePlan,
      ],
      requiredInputs: [
        routeCandidate,
        nativeTrustAnchor,
        orderedInitialization,
      ],
      produces: [governancePlan],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[4],
      ready: registrationProposalReady,
      title: "Submit the staged registration proposal",
      detail:
        "Submit the registration phase only; the command writes the exact pinned registration result but does not claim Parliament enactment.",
      command: [
        "npm",
        "run",
        "sccp:solana:governance",
        "--",
        "--plan",
        governancePlan,
        "--expected-plan-sha256",
        "<reviewed-governance-plan-sha256>",
        "--ordered-initialization-evidence",
        orderedInitialization,
        "--expected-ordered-initialization-evidence-sha256",
        "<reviewed-ordered-initialization-sha256>",
        "--phase",
        "register",
        "--submit",
        "true",
        "--authority",
        "<canonical-testu-proposer>",
        "--torii-url",
        "<canonical-taira-validator-root>",
        "--solana-rpc-url",
        CANONICAL_SOLANA_TESTNET_RPC_URL,
        "--out",
        governanceRegistration,
      ],
      requiredInputs: [
        governancePlan,
        orderedInitialization,
        "SCCP_TAIRA_GOVERNANCE_PRIVATE_KEY",
        "canonical-testu-proposer",
      ],
      produces: [governanceRegistration],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[5],
      ready: registrationReadbackReady,
      title: "Enact and read back staged registration",
      detail:
        "Have Parliament enact the registration proposal, then require fresh public typed-registry readback of the exact staged route before activation is submitted.",
      command: [],
      requiredInputs: [
        governanceRegistration,
        "parliament-registration-enactment",
        "fresh-public-staged-registry-readback",
      ],
      produces: ["public-typed-registry-staged-route"],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[6],
      ready: activationProposalReady,
      title: "Submit the bidirectional activation proposal",
      detail:
        "After exact staged readback, submit the separate compare-and-swap activation phase and write the activation result consumed by this gate.",
      command: [
        "npm",
        "run",
        "sccp:solana:governance",
        "--",
        "--plan",
        governancePlan,
        "--expected-plan-sha256",
        "<reviewed-governance-plan-sha256>",
        "--ordered-initialization-evidence",
        orderedInitialization,
        "--expected-ordered-initialization-evidence-sha256",
        "<reviewed-ordered-initialization-sha256>",
        "--phase",
        "activate",
        "--submit",
        "true",
        "--authority",
        "<canonical-testu-proposer>",
        "--torii-url",
        "<canonical-taira-validator-root>",
        "--solana-rpc-url",
        CANONICAL_SOLANA_TESTNET_RPC_URL,
        "--out",
        governanceActivation,
      ],
      requiredInputs: [
        governancePlan,
        governanceRegistration,
        orderedInitialization,
        "SCCP_TAIRA_GOVERNANCE_PRIVATE_KEY",
        "fresh-public-staged-registry-readback",
      ],
      produces: [governanceActivation],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[7],
      ready: activationReadbackReady,
      title: "Enact and read back bidirectional activation",
      detail:
        "Have Parliament enact the activation proposal, then rerun the gate for a fresh exact public bidirectional typed-registry readback.",
      command: [],
      requiredInputs: [
        governanceActivation,
        "parliament-activation-enactment",
        "fresh-public-bidirectional-registry-readback",
      ],
      produces: ["public-typed-registry-bidirectional-route"],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[8],
      ready: smokeReady,
      title: "Complete exact Solana smoke readiness",
      detail:
        "Run the public-route and independently approved destination/source prover readiness gate, writing the latest report at the path consumed here.",
      command: [
        "npm",
        "run",
        "e2e:sccp:solana-smoke-readiness",
        "--",
        "--torii-url",
        "<canonical-taira-validator-root>",
        "--solana-rpc-url",
        CANONICAL_SOLANA_TESTNET_RPC_URL,
        "--output-dir",
        smokeOutputDir,
        "--prover-governance-approval",
        proverGovernanceApproval,
        "--prover-governance-approval-sha256",
        "<reviewed-prover-approval-sha256>",
        "--skip-solana-rpc",
        "false",
      ],
      requiredInputs: [
        "VITE_WALLETCONNECT_PROJECT_ID",
        "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL",
        "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
        proverGovernanceApproval,
      ],
      produces: [path.join(smokeOutputDir, "latest.json")],
    },
    {
      id: SOLANA_PRODUCTION_ACTION_ORDER[9],
      ready: liveCaptureReady,
      title: "Record the genuine bidirectional live capture",
      detail:
        "After real transfers and smoke readiness pass, bind the independently hash-pinned changing-frame/non-silent capture and independently reviewed ordered semantic witness into the final H.264/AAC MP4 and exact VTT.",
      command: [
        "npm",
        "run",
        "e2e:sccp:solana-video",
        "--",
        "--torii-url",
        "<canonical-taira-validator-root>",
        "--solana-rpc-url",
        CANONICAL_SOLANA_TESTNET_RPC_URL,
        "--live-evidence",
        "<completed-solana-bidirectional-live-evidence.json>",
        "--production-gate-snapshot",
        productionGateSnapshot,
        "--production-gate-snapshot-sha256",
        "<pre-live-production-gate-sha256>",
        "--live-capture-video",
        "<real-bidirectional-screen-recording.mp4>",
        "--live-capture-video-sha256",
        "<reviewed-live-capture-sha256>",
        "--live-capture-witness",
        "<reviewed-live-capture-witness.json>",
        "--live-capture-witness-sha256",
        "<reviewed-live-capture-witness-sha256>",
        "--live-capture-review-attestation",
        "<reviewed-live-capture-review-attestation.json>",
        "--live-capture-review-attestation-sha256",
        "<reviewed-live-capture-review-attestation-sha256>",
        "--prover-governance-approval-sha256",
        "<reviewed-prover-approval-sha256>",
        "--output-dir",
        path.relative(repoRoot, DEFAULT_LIVE_VIDEO_DIR),
      ],
      requiredInputs: [
        "completed-solana-bidirectional-live-evidence",
        "independently-pinned-real-screen-capture",
        "independently-reviewed-live-capture-witness",
        "detached-threshold-ed25519-capture-review-attestation",
        "approval-pinned-capture-review-policy",
        productionGateSnapshot,
      ],
      produces: [
        path.relative(repoRoot, DEFAULT_LIVE_VIDEO_TRANSCRIPT_PATH),
        path.relative(repoRoot, DEFAULT_LIVE_VIDEO_MP4_PATH),
        path.relative(repoRoot, DEFAULT_LIVE_VIDEO_VTT_PATH),
      ],
    },
  ];

  const actions = [];
  let priorMissingId = null;
  for (const stage of stages) {
    if (stage.ready === true) continue;
    const blockedBy = priorMissingId ? [priorMissingId] : [];
    const command = blockedBy.length === 0 ? stage.command : [];
    actions.push({
      id: stage.id,
      title: stage.title,
      detail: stage.detail,
      blockedBy,
      executable: command.length > 0,
      command,
      requiredInputs: stage.requiredInputs,
      produces: stage.produces,
    });
    priorMissingId = stage.id;
  }
  return actions;
};

const orderedFreshDeployRole = (role) =>
  role === "nativeVerifier" ? "native_verifier" : role;

const freshDeployLifecycleTransactionCount = (normalized) =>
  normalized?.report?.programs?.reduce(
    (count, program) => count + 2 + (program?.buffer?.writes?.length ?? 0),
    1,
  ) ?? 0;

/**
 * Fail-closed production proof that the three governed programs were freshly
 * deployed and made immutable through the exact reviewed lifecycle. The
 * canonical report bytes and their independent pin are necessary but not
 * sufficient: every lifecycle signature must also replay at finalized RPC.
 */
export const checkSolanaFreshDeployEvidence = ({
  normalizedFreshDeployReport = null,
  validationError = null,
  freshDeployReportArtifactSha256 = null,
  expectedFreshDeployReportSha256 = null,
  rpcVerification = null,
  rpcUrl = null,
  skipSolanaRpc = false,
  orderedInitializationEvidenceReport = null,
  governancePlanReport = null,
  preflightReport = null,
} = {}) => {
  const reportSha256 = normalizedFreshDeployReport?.reportSha256 ?? null;
  const expectedSha256 = trimString(
    expectedFreshDeployReportSha256,
  ).toLowerCase();
  const artifactSha256 = trimString(
    freshDeployReportArtifactSha256,
  ).toLowerCase();
  const problems = [];
  const addProblem = (id, detail) => problems.push({ id, detail });
  if (!normalizedFreshDeployReport?.report) {
    addProblem(
      "canonical-report-validation",
      validationError
        ? "The pinned fresh-deploy report failed exact canonical validation."
        : "The pinned fresh-deploy report is missing.",
    );
  }
  if (!isNonzeroHex32(expectedSha256)) {
    addProblem(
      "independent-report-pin",
      "An independent canonical fresh-deploy report SHA-256 pin is required.",
    );
  }
  if (
    !isNonzeroHex32(artifactSha256) ||
    artifactSha256 !== expectedSha256 ||
    reportSha256 !== expectedSha256
  ) {
    addProblem(
      "exact-report-byte-binding",
      "The loaded fresh-deploy report bytes do not match the independent pin and validated report hash.",
    );
  }
  if (skipSolanaRpc === true) {
    addProblem(
      "finalized-rpc-skipped",
      "Fresh-deploy lifecycle signatures require live finalized Solana RPC replay.",
    );
  }
  const expectedTransactionCount = freshDeployLifecycleTransactionCount(
    normalizedFreshDeployReport,
  );
  if (
    rpcUrl !== CANONICAL_SOLANA_TESTNET_RPC_URL ||
    rpcVerification?.ready !== true ||
    rpcVerification?.liveFinalizedRpcReplay !== true ||
    rpcVerification?.reportSha256 !== reportSha256 ||
    !Number.isSafeInteger(rpcVerification?.transactionCount) ||
    rpcVerification.transactionCount !== expectedTransactionCount ||
    !Array.isArray(rpcVerification?.transactions) ||
    rpcVerification.transactions.length !== expectedTransactionCount
  ) {
    addProblem(
      "finalized-transaction-replay",
      "One or more fresh Loader-v3 lifecycle transactions were not replayed exactly from canonical finalized Solana testnet RPC.",
    );
  }
  let normalizedOrdered = null;
  if (isRecord(orderedInitializationEvidenceReport)) {
    try {
      normalizedOrdered = validateSolanaOrderedInitializationEvidence(
        orderedInitializationEvidenceReport,
      );
    } catch {
      addProblem(
        "ordered-initialization-validation",
        "The ordered-initialization evidence cannot bind the fresh deployment report.",
      );
    }
  }
  if (
    normalizedOrdered &&
    normalizedOrdered.freshDeployReportSha256 !== reportSha256
  ) {
    addProblem(
      "ordered-initialization-report-binding",
      "The ordered-initialization evidence pins different fresh-deploy report bytes.",
    );
  }
  if (normalizedOrdered && normalizedFreshDeployReport?.report) {
    for (const program of normalizedFreshDeployReport.report.programs) {
      const finalization =
        normalizedOrdered.programFinalizations[
          orderedFreshDeployRole(program.role)
        ];
      if (
        !finalization ||
        finalization.programAddress !== program.programId ||
        finalization.programdataAddress !== program.programdataAddress ||
        finalization.artifactSha256 !== program.artifactSha256 ||
        finalization.programCodeHash !== program.codeHash ||
        finalization.programdataDeploymentSlot !==
          program.deploy.finalizedSlot ||
        finalization.transactionSignature !==
          normalizedFreshDeployReport.immutableFinalization.signature ||
        finalization.finalizedSlot !==
          normalizedFreshDeployReport.immutableFinalization.finalizedSlot
      ) {
        addProblem(
          `ordered-initialization-${program.role}-binding`,
          `The ordered-initialization evidence does not bind the exact ${program.role} fresh deployment lifecycle.`,
        );
      }
    }
  }
  const governanceFreshDeploySha256 = readFirstString(
    governancePlanReport,
    "fresh_deploy_report_sha256",
    "freshDeployReportSha256",
  );
  if (
    isRecord(governancePlanReport) &&
    governanceFreshDeploySha256 !== reportSha256
  ) {
    addProblem(
      "governance-report-binding",
      "The reviewed governance plan does not pin the actual fresh-deploy report bytes.",
    );
  }
  const registrySummary = readFirstRecord(preflightReport, "registrySummary");
  if (registrySummary && normalizedFreshDeployReport?.report) {
    for (const program of normalizedFreshDeployReport.report.programs) {
      const role = program.role;
      const programdataKey =
        role === "nativeVerifier"
          ? "nativeVerifierProgramData"
          : `${role}ProgramData`;
      if (
        registrySummary.programs?.[role] !== program.programId ||
        registrySummary.accounts?.[programdataKey] !==
          program.programdataAddress ||
        registrySummary.programDataSlots?.[role] !==
          program.deploy.finalizedSlot ||
        registrySummary.codeHashes?.[role] !== program.codeHash
      ) {
        addProblem(
          `typed-registry-${role}-binding`,
          `The public typed registry does not bind the exact ${role} fresh deployment.`,
        );
      }
    }
  }

  const freshDeployReady = problems.length === 0;
  const ok = freshDeployReady;
  return makeCheck(
    "fresh-loader-v3-deployment-evidence",
    ok,
    ok
      ? "The exact pinned three-program Loader-v3 deployment report and every lifecycle transaction match canonical finalized Solana testnet RPC."
      : "Fresh three-program Loader-v3 deployment provenance is missing, divergent, or was not replayed from canonical finalized Solana testnet RPC.",
    {
      reportSha256: isNonzeroHex32(reportSha256) ? reportSha256 : null,
      expectedReportSha256: isNonzeroHex32(expectedSha256)
        ? expectedSha256
        : null,
      artifactSha256: isNonzeroHex32(artifactSha256) ? artifactSha256 : null,
      canonicalReportValidated: Boolean(normalizedFreshDeployReport?.report),
      canonicalRpcUrl: rpcUrl === CANONICAL_SOLANA_TESTNET_RPC_URL,
      liveFinalizedRpcReplay: rpcVerification?.liveFinalizedRpcReplay === true,
      expectedTransactionCount,
      verifiedTransactionCount: Number.isSafeInteger(
        rpcVerification?.transactionCount,
      )
        ? rpcVerification.transactionCount
        : 0,
      orderedInitializationBound:
        normalizedOrdered?.freshDeployReportSha256 === reportSha256,
      governancePlanBound:
        governanceFreshDeploySha256.length > 0 &&
        governanceFreshDeploySha256 === reportSha256,
      typedRegistryCompared: Boolean(registrySummary),
      freshDeployReady,
      skipSolanaRpc: skipSolanaRpc === true,
      problems,
    },
  );
};

export const buildSolanaProductionGateReport = ({
  deployDir = null,
  localSolanaSccpSdkCapability = null,
  normalizedFreshDeployReport = null,
  freshDeployReportValidationError = null,
  freshDeployReportPath = null,
  expectedFreshDeployReportSha256 = null,
  freshDeployRpcVerification = null,
  skipSolanaRpc = false,
  preflightReport = null,
  preflightReportPath = null,
  proverGovernanceApprovalReport = null,
  proverGovernanceApprovalPath = null,
  captureReviewPolicyLoad = null,
  captureReviewPolicyPath = null,
  liveCaptureWitnessArtifact = null,
  liveCaptureWitnessPath = null,
  liveCaptureReviewAttestationArtifact = null,
  liveCaptureReviewAttestationPath = null,
  finalCaptureReviewBoundary = null,
  liveCaptureVideoPath = null,
  expectedLiveCaptureVideoSha256 = null,
  governancePlanReport = null,
  governancePlanPath = null,
  governanceRegistrationReport = null,
  governanceRegistrationPath = null,
  governanceActivationReport = null,
  governanceActivationPath = null,
  orderedInitializationEvidenceReport = null,
  orderedInitializationEvidencePath = null,
  governanceEvidence = null,
  smokeReadinessReport = null,
  smokeReadinessPath = null,
  liveVideoTranscript = null,
  liveVideoTranscriptPath = null,
  liveVideoMp4Path = DEFAULT_LIVE_VIDEO_MP4_PATH,
  liveVideoVttPath = DEFAULT_LIVE_VIDEO_VTT_PATH,
  blockedLiveVideoTranscript = null,
  blockedLiveVideoTranscriptPath = null,
  blockedLiveVideoMp4Path = DEFAULT_BLOCKED_LIVE_VIDEO_MP4_PATH,
  blockedLiveVideoVttPath = DEFAULT_BLOCKED_LIVE_VIDEO_VTT_PATH,
  artifactFacts = {},
  preLiveInputSnapshot = null,
  successExecutionPolicy,
  liveVideoAuthoritativeRevalidation,
  expectedLiveEvidencePackageHashes,
  expectedProverGovernanceApprovalSha256 = null,
  proverGovernanceApprovalValidation = null,
  proverRuntimeReinspection = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const localSolanaSccpSdkSupport = checkLocalSolanaSccpSdkCapability({
    capability: localSolanaSccpSdkCapability,
  });
  const preLiveInputSnapshotCheck =
    checkSolanaProductionGatePreLiveInputSnapshot({
      snapshot: preLiveInputSnapshot,
      expectedPaths: {
        captureReviewPolicy: captureReviewPolicyPath,
        freshDeployReport: freshDeployReportPath,
        proverGovernanceApproval: proverGovernanceApprovalPath,
        governancePlan: governancePlanPath,
        governanceRegistration: governanceRegistrationPath,
        governanceActivation: governanceActivationPath,
        orderedInitializationEvidence: orderedInitializationEvidencePath,
        smokeReadiness: smokeReadinessPath,
      },
    });
  const requiredPreLiveReportsLoaded =
    checkSolanaProductionGateRequiredReportsLoaded({
      reports: {
        captureReviewPolicy: captureReviewPolicyLoad?.policy ?? null,
        freshDeployReport: normalizedFreshDeployReport?.report ?? null,
        proverGovernanceApproval: proverGovernanceApprovalReport,
        governancePlan: governancePlanReport,
        governanceRegistration: governanceRegistrationReport,
        governanceActivation: governanceActivationReport,
        orderedInitializationEvidence: orderedInitializationEvidenceReport,
        smokeReadiness: smokeReadinessReport,
      },
    });
  const freshDeployEvidence = checkSolanaFreshDeployEvidence({
    normalizedFreshDeployReport,
    validationError: freshDeployReportValidationError,
    freshDeployReportArtifactSha256:
      preLiveInputSnapshot?.inputs?.freshDeployReport?.sha256 ?? null,
    expectedFreshDeployReportSha256,
    rpcVerification: freshDeployRpcVerification,
    rpcUrl:
      successExecutionPolicy?.solanaRpcUrl ??
      preflightReport?.solana?.rpcUrl ??
      null,
    skipSolanaRpc,
    orderedInitializationEvidenceReport,
    governancePlanReport,
    preflightReport,
  });
  const captureReviewPolicyTrustAnchor =
    checkSolanaCaptureReviewPolicyTrustAnchor({
      policyLoad: captureReviewPolicyLoad,
      approvalValidation: proverGovernanceApprovalValidation,
    });
  const publicPreflight = checkPublicPreflightReady({
    preflightReport,
    preflightReportPath,
  });
  const publicSolanaLane = checkPublicSolanaLaneReady({
    preflightReport,
    preflightReportPath,
  });
  const publicExactProgramdata = checkPublicExactProgramdataReady({
    preflightReport,
    preflightReportPath,
  });
  const publicExactRuntimeState = checkPublicExactRuntimeStateReady({
    preflightReport,
    preflightReportPath,
  });
  const publicRoutePublication = summarizePublicSolanaRoutePublication({
    preflightReport,
    preflightReportPath,
  });
  const resolvedGovernanceEvidence = governanceEvidence ?? {
    ready: false,
    checks: [
      makeCheck(
        "governance-live-evidence-provided",
        false,
        "Production-gate report assembly requires completed GET-only live governance evidence verification.",
      ),
    ],
  };
  const smokeReadiness = checkSmokeReadinessReady({
    smokeReadinessReport,
    smokeReadinessPath,
    expectedProverGovernanceApprovalSha256,
    proverGovernanceApprovalValidation,
    proverRuntimeReinspection,
  });
  const smokeReadinessArtifactConsistency =
    checkSmokeReadinessArtifactConsistency({
      smokeReadinessReport,
      smokeReadinessPath,
      preflightReport,
      preflightReportPath,
      governancePlanReport,
      governancePlanPath,
      orderedInitializationEvidenceReport,
      orderedInitializationEvidencePath,
      orderedInitializationEvidenceArtifactSha256:
        preLiveInputSnapshot?.inputs?.orderedInitializationEvidence?.sha256 ??
        null,
    });
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
    preLiveInputSnapshot,
    successExecutionPolicy,
    authoritativeRevalidation: liveVideoAuthoritativeRevalidation,
    expectedLiveEvidencePackageHashes: expectedLiveEvidencePackageHashes ?? {
      governancePlanSha256: governancePlanReport?.plan_sha256 ?? null,
      governanceRegistrationSha256:
        preLiveInputSnapshot?.inputs?.governanceRegistration?.sha256 ?? null,
      governanceActivationSha256:
        preLiveInputSnapshot?.inputs?.governanceActivation?.sha256 ?? null,
      publicRegistrySha256:
        preflightReport?.registrySummary?.registrySha256 ?? null,
    },
    liveCaptureWitnessArtifact,
    liveCaptureReviewAttestationArtifact,
    finalCaptureReviewBoundary,
    liveCaptureVideoPath,
    expectedLiveCaptureVideoSha256,
  });
  const checks = [
    localSolanaSccpSdkSupport,
    preLiveInputSnapshotCheck,
    requiredPreLiveReportsLoaded,
    captureReviewPolicyTrustAnchor,
    freshDeployEvidence,
    publicPreflight,
    publicSolanaLane,
    publicExactProgramdata,
    publicExactRuntimeState,
    ...resolvedGovernanceEvidence.checks,
    smokeReadiness,
    smokeReadinessArtifactConsistency,
    liveVideo,
  ];
  const failed = failedChecks(checks);
  const failedCheckIds = failed.map((check) => check.id);
  const blockerIds = Array.from(new Set(failedCheckIds));
  const ready = checks.every((check) => check.status === "pass");
  const completionAudit = checks.map((check) => ({
    id: check.id,
    status: check.status === "pass" ? "proven" : "blocked",
    evidence: check.evidence ?? null,
  }));
  const completionAuditReady = ready;
  let orderedInitializationArtifactReady = false;
  try {
    validateSolanaOrderedInitializationEvidence(
      orderedInitializationEvidenceReport,
    );
    orderedInitializationArtifactReady = true;
  } catch {
    // The action DAG must fail closed when no exact initializer artifact is
    // available. Governance validation may also fail only because its plan is
    // not built yet, so validate the chronology artifact independently here.
  }
  const governanceCheckById = new Map(
    resolvedGovernanceEvidence.checks.map((check) => [check.id, check]),
  );
  const governancePlanReady =
    governanceCheckById.get("governance-plan-reviewed")?.status === "pass";
  const routeCandidateInputsPresent =
    typeof deployDir === "string" &&
    existsSync(
      path.join(
        deployDir,
        path.basename(DEFAULT_GOVERNED_ROUTE_CANDIDATE_PATH),
      ),
    ) &&
    existsSync(
      path.join(deployDir, path.basename(DEFAULT_NATIVE_TRUST_ANCHOR_PATH)),
    );
  const registrationProposalReady =
    governanceCheckById.get("governance-register-evidence")?.status === "pass";
  const activationProposalReady =
    governanceCheckById.get("governance-activate-evidence")?.status === "pass";
  const activationReadbackReady =
    governanceCheckById.get("governance-enactment-readback")?.status === "pass";
  const registrationReadbackReady =
    activationProposalReady ||
    activationReadbackReady ||
    (preflightReport?.registryState?.routePresent === true &&
      ["staged", "bidirectional"].includes(
        preflightReport.registryState.activation,
      ));
  const nextActionDetails = ready
    ? []
    : buildSolanaProductionNextActionDag({
        deployDir,
        freshDeployReady:
          freshDeployEvidence.evidence?.freshDeployReady === true,
        exactInitializationReady: orderedInitializationArtifactReady,
        routeCandidateReady: governancePlanReady || routeCandidateInputsPresent,
        governancePlanReady,
        registrationProposalReady,
        registrationReadbackReady,
        activationProposalReady,
        activationReadbackReady,
        smokeReady: smokeReadiness.status === "pass",
        liveCaptureReady: liveVideo.status === "pass",
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
    publicSolanaCapability: {
      ready: publicPreflight.status === "pass",
      requiredCheckCount: SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS.length,
      missingRequiredCheckCount: Array.isArray(
        publicPreflight.evidence?.missingRequiredCheckIds,
      )
        ? publicPreflight.evidence.missingRequiredCheckIds.length
        : SOLANA_PUBLIC_PREFLIGHT_REQUIRED_CHECK_IDS.length,
    },
    publicSolanaLane: {
      ready: publicSolanaLane.status === "pass",
      present: publicSolanaLane.evidence?.present === true,
      problemCount: Array.isArray(publicSolanaLane.evidence?.problems)
        ? publicSolanaLane.evidence.problems.length
        : 0,
    },
    routePublication: publicRoutePublication,
    governanceEvidence: {
      ready: resolvedGovernanceEvidence.ready,
      planSha256: publicHex32OrNull(governancePlanReport?.plan_sha256),
      registrationArtifactSha256:
        preLiveInputSnapshot?.inputs?.governanceRegistration?.sha256 ?? null,
      activationArtifactSha256:
        preLiveInputSnapshot?.inputs?.governanceActivation?.sha256 ?? null,
      orderedInitializationEvidenceArtifactSha256:
        preLiveInputSnapshot?.inputs?.orderedInitializationEvidence?.sha256 ??
        null,
      publicRegistrySha256: publicHex32OrNull(
        preflightReport?.registrySummary?.registrySha256,
      ),
    },
    freshDeployEvidence: freshDeployEvidence.evidence,
    captureReviewPolicy: {
      ready: captureReviewPolicyTrustAnchor.status === "pass",
      sha256: captureReviewPolicyLoad?.artifactSha256 ?? null,
      threshold: captureReviewPolicyLoad?.normalized?.threshold ?? null,
      reviewerCount:
        captureReviewPolicyLoad?.normalized?.reviewers?.length ?? 0,
    },
    localSolanaSccpSdkCapability: localSolanaSccpSdkCapability ?? null,
    preLiveInputSnapshot,
    preLiveInputSnapshotSha256:
      preLiveInputSnapshot?.preLiveInputSnapshotSha256 ?? null,
    successExecutionPolicy: successExecutionPolicy ?? null,
    liveVideoAuthoritativeRevalidation:
      liveVideoAuthoritativeRevalidation ?? null,
    completionAuditReady,
    completionAudit,
    artifacts: {
      deployDir: deployDir ? "[output-directory]" : null,
      preflightReportPath: publicReportPathMarker(preflightReportPath),
      freshDeployReportPath: publicReportPathMarker(freshDeployReportPath),
      proverGovernanceApprovalPath: publicReportPathMarker(
        proverGovernanceApprovalPath,
      ),
      captureReviewPolicyPath: publicReportPathMarker(captureReviewPolicyPath),
      governancePlanPath: publicReportPathMarker(governancePlanPath),
      governanceRegistrationPath: publicReportPathMarker(
        governanceRegistrationPath,
      ),
      governanceActivationPath: publicReportPathMarker(
        governanceActivationPath,
      ),
      orderedInitializationEvidencePath: publicReportPathMarker(
        orderedInitializationEvidencePath,
      ),
      smokeReadinessPath: publicReportPathMarker(smokeReadinessPath),
      liveVideoTranscriptPath: publicReportPathMarker(liveVideoTranscriptPath),
      liveCaptureWitnessPath: publicReportPathMarker(liveCaptureWitnessPath),
      liveCaptureReviewAttestationPath: publicReportPathMarker(
        liveCaptureReviewAttestationPath,
      ),
      blockedLiveVideoTranscriptPath: publicReportPathMarker(
        blockedLiveVideoTranscriptPath,
      ),
      blockedLiveVideoMp4Path: publicReportPathMarker(blockedLiveVideoMp4Path),
      blockedLiveVideoVttPath: publicReportPathMarker(blockedLiveVideoVttPath),
    },
    nextRequiredActions: ready
      ? []
      : nextActionDetails.map((action) => action.detail),
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
      "fresh-deploy-report",
      "fresh-deploy-report-sha256",
      "governance-plan",
      "governance-plan-sha256",
      "governance-register-result",
      "governance-register-result-sha256",
      "governance-activate-result",
      "governance-activate-result-sha256",
      "ordered-initialization-evidence",
      "ordered-initialization-evidence-sha256",
      "smoke-readiness",
      "prover-governance-approval",
      "prover-governance-approval-sha256",
      "capture-review-policy",
      "capture-review-policy-sha256",
      "expected-pre-live-input-snapshot-sha256",
      "live-video-transcript",
      "live-video-mp4",
      "live-video-vtt",
      "live-capture-video",
      "live-capture-video-sha256",
      "live-capture-witness",
      "live-capture-witness-sha256",
      "live-capture-review-attestation",
      "live-capture-review-attestation-sha256",
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
  --fresh-deploy-report PATH              Canonical completed three-program Loader-v3 deployment report
  --fresh-deploy-report-sha256 HASH       Independent exact fresh-deploy report-byte pin
  --governance-plan PATH                  Independently reviewed exact route governance plan
  --governance-plan-sha256 HASH           Canonical reviewed plan hash
  --governance-register-result PATH       Staged-registration proposal/enactment evidence
  --governance-register-result-sha256 HASH Exact registration-result byte pin
  --governance-activate-result PATH       Bidirectional-activation proposal/enactment evidence
  --governance-activate-result-sha256 HASH Exact activation-result byte pin
  --ordered-initialization-evidence PATH  Finalized program/account transaction chronology
  --ordered-initialization-evidence-sha256 HASH Exact chronology-evidence byte pin
  --smoke-readiness PATH                  Solana live smoke-readiness report
  --prover-governance-approval PATH       Canonical public exact prover approval descriptor
  --prover-governance-approval-sha256 HASH
                                           Independent public hash of the canonical exact prover approval
  --capture-review-policy PATH             Canonical pre-capture Ed25519 reviewer policy
  --capture-review-policy-sha256 HASH      Independent exact-byte policy pin; must match approval v2
  --expected-pre-live-input-snapshot-sha256 HASH
                                           Require the exact prior pre-live input snapshot
  --live-video-transcript PATH            Completed bidirectional live-video transcript JSON
  --live-video-mp4 PATH                   Completed bidirectional live MP4 path
  --live-video-vtt PATH                   Completed bidirectional live subtitle VTT path
  --live-capture-video PATH               Exact independently reviewed raw screen capture
  --live-capture-video-sha256 HASH        Independent exact raw-capture byte pin
  --live-capture-witness PATH             Exact reviewed semantic witness used by the live MP4
  --live-capture-witness-sha256 HASH      Independent exact witness-byte pin
  --live-capture-review-attestation PATH  Detached threshold-Ed25519 review attestation
  --live-capture-review-attestation-sha256 HASH Exact detached-attestation byte pin
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

export const SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_SNAPSHOT_SCHEMA =
  "iroha-demo-sccp-solana-production-gate-pre-live-input-snapshot/v3";

export const SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS = Object.freeze({
  captureReviewPolicy: "captureReviewPolicy",
  freshDeployReport: "freshDeployReport",
  proverGovernanceApproval: "proverGovernanceApproval",
  governancePlan: "governancePlan",
  governanceRegistration: "governanceRegistration",
  governanceActivation: "governanceActivation",
  orderedInitializationEvidence: "orderedInitializationEvidence",
  smokeReadiness: "smokeReadiness",
});

export const SOLANA_PRODUCTION_GATE_REQUIRED_PRE_LIVE_INPUT_IDS = Object.freeze(
  Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS),
);

const canonicalPreLiveInputSnapshotBody = (inputs) => ({
  schema: SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_SNAPSHOT_SCHEMA,
  routeId: SCCP_SOLANA_XOR_ROUTE_ID,
  inputs: Object.fromEntries(
    Object.entries(inputs ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ),
});

const preLiveInputSnapshotSha256 = (body) =>
  `0x${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;

export const buildSolanaProductionGatePreLiveInputSnapshot = (inputs = {}) => {
  const body = canonicalPreLiveInputSnapshotBody(inputs);
  return {
    ...body,
    preLiveInputSnapshotSha256: preLiveInputSnapshotSha256(body),
  };
};

export const validateSolanaProductionGatePreLiveInputSnapshot = (snapshot) => {
  if (
    !isRecord(snapshot) ||
    snapshot.schema !== SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_SNAPSHOT_SCHEMA ||
    snapshot.routeId !== SCCP_SOLANA_XOR_ROUTE_ID ||
    !isRecord(snapshot.inputs)
  ) {
    throw new Error(
      "Solana production-gate pre-live input snapshot is invalid.",
    );
  }
  const expectedIds = Object.keys(
    SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS,
  ).sort();
  const observedIds = Object.keys(snapshot.inputs).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(observedIds)) {
    throw new Error(
      "Solana production-gate pre-live input snapshot has missing or extra inputs.",
    );
  }
  for (const id of expectedIds) {
    const entry = snapshot.inputs[id];
    if (
      !isRecord(entry) ||
      entry.id !== id ||
      typeof entry.path !== "string" ||
      path.resolve(entry.path) !== entry.path ||
      typeof entry.present !== "boolean" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      (entry.present
        ? !/^0x[0-9a-f]{64}$/u.test(entry.sha256) || entry.size <= 0
        : entry.sha256 !== null || entry.size !== 0)
    ) {
      throw new Error(
        `Solana production-gate pre-live input snapshot entry ${id} is invalid.`,
      );
    }
  }
  const { preLiveInputSnapshotSha256: observedSha256, ...body } = snapshot;
  const canonicalBody = canonicalPreLiveInputSnapshotBody(body.inputs);
  if (
    JSON.stringify(body) !== JSON.stringify(canonicalBody) ||
    observedSha256 !== preLiveInputSnapshotSha256(canonicalBody)
  ) {
    throw new Error(
      "Solana production-gate pre-live input snapshot hash is invalid.",
    );
  }
  return snapshot;
};

export const checkSolanaProductionGatePreLiveInputSnapshot = ({
  snapshot,
  expectedPaths = {},
} = {}) => {
  let validationError = null;
  try {
    validateSolanaProductionGatePreLiveInputSnapshot(snapshot);
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error);
  }
  const inputs = validationError === null ? snapshot.inputs : {};
  const missingRequiredInputIds =
    validationError === null
      ? SOLANA_PRODUCTION_GATE_REQUIRED_PRE_LIVE_INPUT_IDS.filter(
          (id) => inputs[id]?.present !== true,
        )
      : [...SOLANA_PRODUCTION_GATE_REQUIRED_PRE_LIVE_INPUT_IDS];
  const pathMismatches =
    validationError === null
      ? Object.keys(SOLANA_PRODUCTION_GATE_PRE_LIVE_INPUT_OPTION_KEYS).flatMap(
          (id) => {
            const expectedPath = expectedPaths[id];
            const observedPath = inputs[id]?.path ?? null;
            if (typeof expectedPath !== "string" || !expectedPath.trim()) {
              return [{ id, expectedPath: null, observedPath }];
            }
            const normalizedExpectedPath = path.resolve(expectedPath);
            return observedPath === normalizedExpectedPath
              ? []
              : [{ id, expectedPath: normalizedExpectedPath, observedPath }];
          },
        )
      : [];
  const ok =
    validationError === null &&
    missingRequiredInputIds.length === 0 &&
    pathMismatches.length === 0;
  return makeCheck(
    "pre-live-input-snapshot-valid",
    ok,
    ok
      ? "The Solana production gate is bound to a complete, canonical snapshot of every success-critical pre-live artifact."
      : "The Solana production gate is missing a valid, path-bound snapshot of one or more success-critical pre-live artifacts.",
    {
      snapshotSha256: snapshot?.preLiveInputSnapshotSha256 ?? null,
      validationError,
      missingRequiredInputIds,
      pathMismatches,
      optionalInputIds: [],
    },
  );
};

export const checkSolanaProductionGateRequiredReportsLoaded = ({
  reports = {},
} = {}) => {
  const requiredReportIds =
    SOLANA_PRODUCTION_GATE_REQUIRED_PRE_LIVE_INPUT_IDS.filter(
      (id) => id !== "deploymentVideoMp4" && id !== "deploymentVideoVtt",
    );
  const missingReportIds = requiredReportIds.filter(
    (id) => !isRecord(reports[id]),
  );
  const ok = missingReportIds.length === 0;
  return makeCheck(
    "pre-live-input-reports-loaded",
    ok,
    ok
      ? "Every success-critical pre-live JSON artifact was loaded as a JSON object."
      : "One or more success-critical pre-live JSON artifacts are missing or are not JSON objects.",
    { requiredReportIds, missingReportIds },
  );
};

const recordPreLiveInput = ({ snapshotInputs, id, file, bytes = null }) => {
  if (!snapshotInputs || !id) return;
  const resolved = path.resolve(file);
  snapshotInputs[id] = {
    id,
    path: resolved,
    present: bytes !== null,
    size: bytes?.length ?? 0,
    sha256: bytes
      ? `0x${createHash("sha256").update(bytes).digest("hex")}`
      : null,
  };
};

const readJsonIfExists = async (
  file,
  expectedSha256 = null,
  { requirePin = false, snapshotInputs = null, snapshotId = null } = {},
) => {
  if (!file) {
    return null;
  }
  const normalizedExpected =
    expectedSha256 === null || expectedSha256 === undefined
      ? null
      : String(expectedSha256).toLowerCase();
  if (normalizedExpected === null && requirePin) {
    throw new Error(
      "Solana production-gate generated handoff is missing its exact SHA-256 pin.",
    );
  }
  if (
    normalizedExpected !== null &&
    !/^0x[0-9a-f]{64}$/u.test(normalizedExpected)
  ) {
    throw new Error(
      "Solana production-gate expected JSON SHA-256 must be a canonical 0x-prefixed hash.",
    );
  }
  const resolved = normalizePath(file);
  let bytes;
  try {
    bytes = await readStableRegularFile(resolved, {
      label: "Solana production-gate JSON input",
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      recordPreLiveInput({
        snapshotInputs,
        id: snapshotId,
        file: resolved,
      });
      if (normalizedExpected !== null) {
        throw new Error(
          `Pinned Solana production-gate JSON input is missing: ${resolved}.`,
        );
      }
      return null;
    }
    throw error;
  }
  const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  recordPreLiveInput({
    snapshotInputs,
    id: snapshotId,
    file: resolved,
    bytes,
  });
  if (normalizedExpected !== null && actual !== normalizedExpected) {
    throw new Error(
      `Pinned Solana production-gate JSON input SHA-256 mismatch: expected ${normalizedExpected}, got ${actual}.`,
    );
  }
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    const parsed = parseSolanaGovernanceDuplicateFreeJsonText(
      text,
      "Solana production-gate JSON input",
    );
    if (!isRecord(parsed)) {
      throw new Error(
        "Solana production-gate JSON input must contain one JSON object.",
      );
    }
    return parsed;
  } catch {
    throw new Error(
      "Pinned Solana production-gate JSON input is invalid or is not a JSON object.",
    );
  }
};

const loadPinnedCaptureReviewPolicy = async ({
  file,
  expectedSha256,
  approvalPinnedSha256,
  snapshotInputs = null,
  snapshotId = null,
}) => {
  const resolved = normalizePath(file);
  let bytes;
  try {
    bytes = await readStableRegularFile(resolved, {
      label: "Canonical Solana live capture review policy",
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    });
  } catch (error) {
    recordPreLiveInput({
      snapshotInputs,
      id: snapshotId,
      file: resolved,
    });
    return {
      policy: null,
      normalized: null,
      artifactSha256: null,
      artifactSize: 0,
      error:
        error?.code === "ENOENT"
          ? "Capture review policy is missing."
          : "Capture review policy could not be loaded from stable regular-file bytes.",
    };
  }
  recordPreLiveInput({
    snapshotInputs,
    id: snapshotId,
    file: resolved,
    bytes,
  });
  const artifactSha256 = `0x${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;
  try {
    const normalizedExpected = String(expectedSha256 ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/u.test(normalizedExpected)) {
      throw new Error(
        "Capture review policy requires an independent exact-byte SHA-256 pin.",
      );
    }
    if (artifactSha256 !== normalizedExpected) {
      throw new Error(
        "Capture review policy bytes do not match the independently supplied SHA-256.",
      );
    }
    const policy = parseSolanaGovernanceCanonicalJsonBytes(
      bytes,
      "Canonical Solana live capture review policy",
    );
    if (!isRecord(policy)) {
      throw new Error("Capture review policy must contain one JSON object.");
    }
    const canonicalBytes = Buffer.from(
      `${canonicalSccpJson(policy)}\n`,
      "utf8",
    );
    if (!canonicalBytes.equals(bytes)) {
      throw new Error(
        "Capture review policy must use exact compact canonical SCCP JSON bytes.",
      );
    }
    const normalized = normalizeSolanaLiveCaptureReviewPolicy(policy, {
      actualPolicySha256: artifactSha256,
      expectedPolicySha256: approvalPinnedSha256,
    });
    return {
      policy,
      normalized,
      artifactSha256,
      artifactSize: bytes.length,
      error: null,
    };
  } catch (error) {
    return {
      policy: null,
      normalized: null,
      artifactSha256,
      artifactSize: bytes.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const checkSolanaCaptureReviewPolicyTrustAnchor = ({
  policyLoad,
  approvalValidation,
} = {}) => {
  const approvedPolicySha256 =
    approvalValidation?.pins?.captureReviewPolicySha256;
  const ok =
    approvalValidation?.ready === true &&
    /^0x[0-9a-f]{64}$/u.test(approvedPolicySha256 ?? "") &&
    policyLoad?.normalized?.policySha256 === approvedPolicySha256 &&
    policyLoad?.artifactSha256 === approvedPolicySha256 &&
    policyLoad?.error === null;
  return makeCheck(
    "capture-review-policy-trust-anchor",
    ok,
    ok
      ? "Exact canonical capture-review policy bytes match the independently pinned prover-approval v2 trust anchor."
      : "Capture-review policy bytes, Ed25519 reviewer threshold, or prover-approval v2 trust anchor are missing or inconsistent.",
    {
      ready: ok,
      approvalReady: approvalValidation?.ready === true,
      policySha256: policyLoad?.artifactSha256 ?? null,
      approvedPolicySha256: approvedPolicySha256 ?? null,
      reviewerCount: policyLoad?.normalized?.reviewers?.length ?? 0,
      threshold: policyLoad?.normalized?.threshold ?? null,
      error: policyLoad?.error ?? null,
    },
  );
};

const reloadPinnedCaptureReviewTrustBoundary = async ({
  snapshot,
  proverGovernanceApprovalPath,
  expectedProverGovernanceApprovalSha256,
  captureReviewPolicyPath,
  expectedCaptureReviewPolicySha256,
}) => {
  const approvalEntry = snapshot?.inputs?.proverGovernanceApproval;
  const policyEntry = snapshot?.inputs?.captureReviewPolicy;
  const approvalBytes = await readStableRegularFile(
    proverGovernanceApprovalPath,
    {
      label: "Fresh final-boundary Solana prover-governance approval",
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    },
  );
  const approvalSha256 = `0x${createHash("sha256")
    .update(approvalBytes)
    .digest("hex")}`;
  if (
    approvalBytes.length !== approvalEntry?.size ||
    approvalSha256 !== approvalEntry?.sha256
  ) {
    throw new Error(
      "Prover-governance approval changed after the pre-live snapshot.",
    );
  }
  const approvalRecord = parseSolanaGovernanceCanonicalJsonBytes(
    approvalBytes,
    "Fresh final-boundary Solana prover-governance approval",
  );
  if (
    !Buffer.from(
      `${canonicalSolanaExactProverApprovalJson(approvalRecord)}\n`,
      "utf8",
    ).equals(approvalBytes)
  ) {
    throw new Error(
      "Fresh final-boundary prover-governance approval is not compact canonical JSON.",
    );
  }
  const approvalValidation = buildExactSolanaProductionProverApprovalValidation(
    {
      approvalRecord,
      approvalPath: proverGovernanceApprovalPath,
      approvalSha256,
      expectedApprovalSha256: expectedProverGovernanceApprovalSha256,
    },
  );
  if (!approvalValidation.ready) {
    throw new Error(
      "Fresh final-boundary prover-governance approval v2 validation failed.",
    );
  }
  const policyLoad = await loadPinnedCaptureReviewPolicy({
    file: captureReviewPolicyPath,
    expectedSha256: expectedCaptureReviewPolicySha256,
    approvalPinnedSha256: approvalValidation.pins.captureReviewPolicySha256,
  });
  if (
    policyLoad.error !== null ||
    policyLoad.artifactSha256 !== policyEntry?.sha256 ||
    policyLoad.artifactSize !== policyEntry?.size
  ) {
    throw new Error(
      policyLoad.error ??
        "Capture-review policy changed after the pre-live snapshot.",
    );
  }
  return { approvalValidation, policyLoad };
};

const loadPinnedPostLiveJsonArtifact = async ({
  file,
  expectedSha256,
  label,
}) => {
  const resolved =
    typeof file === "string" && file.trim() ? path.resolve(file) : null;
  const normalizedExpected = String(expectedSha256 ?? "").toLowerCase();
  if (!resolved || !/^0x[0-9a-f]{64}$/u.test(normalizedExpected)) {
    return {
      path: resolved,
      value: null,
      size: 0,
      sha256: null,
      error: `${label} path and independent SHA-256 are required.`,
    };
  }
  try {
    const bytes = await readStableRegularFile(resolved, {
      label,
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    });
    const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    if (sha256 !== normalizedExpected) {
      throw new Error(`${label} bytes do not match the independent pin.`);
    }
    const value = parseSolanaGovernanceCanonicalJsonBytes(bytes, label);
    if (!isRecord(value)) {
      throw new Error(`${label} must contain one canonical JSON object.`);
    }
    const canonicalBytes = Buffer.from(`${canonicalSccpJson(value)}\n`, "utf8");
    if (!canonicalBytes.equals(bytes)) {
      throw new Error(
        `${label} must use exact compact canonical SCCP JSON plus one LF.`,
      );
    }
    return { path: resolved, value, size: bytes.length, sha256, error: null };
  } catch (error) {
    return {
      path: resolved,
      value: null,
      size: 0,
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const loadPinnedFreshDeployReport = async ({
  file,
  expectedSha256,
  snapshotInputs,
  snapshotId,
  validator = validateSolanaLoaderV3FreshDeployReport,
}) => {
  const resolved = normalizePath(file);
  let bytes;
  try {
    bytes = await readStableRegularFile(resolved, {
      label: "Canonical Solana fresh-deploy report",
      maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    });
  } catch (error) {
    recordPreLiveInput({
      snapshotInputs,
      id: snapshotId,
      file: resolved,
    });
    return {
      normalized: null,
      error:
        error?.code === "ENOENT"
          ? "Fresh deployment report is missing."
          : "Fresh deployment report could not be loaded as stable regular-file bytes.",
    };
  }
  recordPreLiveInput({
    snapshotInputs,
    id: snapshotId,
    file: resolved,
    bytes,
  });
  try {
    return {
      normalized: validator({
        reportBytes: bytes,
        expectedReportSha256: expectedSha256,
      }),
      error: null,
    };
  } catch {
    return {
      normalized: null,
      error:
        "Fresh deployment report failed exact canonical validation or its independent byte pin differs.",
    };
  }
};

const MAX_SOLANA_EVIDENCE_MP4_BYTES = 2 * 1024 * 1024 * 1024;
const SOLANA_MEDIA_PROBE_TIMEOUT_MS = 30_000;
const SOLANA_MEDIA_ESSENCE_TIMEOUT_MS = 5 * 60_000;
const SOLANA_MEDIA_PROBE_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const SOLANA_LIVE_CAPTURE_MIN_DURATION_SECONDS = 40;
const SOLANA_LIVE_CAPTURE_MAX_DURATION_SECONDS = 60 * 60;
const SOLANA_LIVE_CAPTURE_MIN_WIDTH = 640;
const SOLANA_LIVE_CAPTURE_MIN_HEIGHT = 360;
const SOLANA_LIVE_CAPTURE_MIN_SAMPLED_FRAMES = 10;
const SOLANA_LIVE_CAPTURE_MIN_UNIQUE_FRAMES = 4;
const SOLANA_LIVE_CAPTURE_MIN_AUDIO_MAX_VOLUME_DB = -45;

export const assertSolanaProductionGateOutputIsDisjoint = async ({
  outputPath,
  inputPaths,
}) => {
  const resolvedOutput = normalizePath(outputPath);
  const resolvedInputs = [
    ...new Set(
      (Array.isArray(inputPaths) ? inputPaths : [])
        .filter((file) => typeof file === "string" && file.trim())
        .map((file) => normalizePath(file)),
    ),
  ];
  if (resolvedInputs.includes(resolvedOutput)) {
    throw new Error(
      `Solana production-gate output collides with an input artifact path: ${resolvedOutput}`,
    );
  }
  let outputInfo;
  try {
    outputInfo = await lstat(resolvedOutput);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (outputInfo.isSymbolicLink()) {
    throw new Error(
      `Solana production-gate output must not be a symbolic link: ${resolvedOutput}`,
    );
  }
  for (const inputPath of resolvedInputs) {
    let inputInfo;
    try {
      inputInfo = await lstat(inputPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (outputInfo.dev === inputInfo.dev && outputInfo.ino === inputInfo.ino) {
      throw new Error(
        `Solana production-gate output aliases an input artifact inode: ${resolvedOutput} -> ${inputPath}`,
      );
    }
  }
};

const hashStableDescriptor = (fd) => {
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
      throw new Error("Solana production-gate media input ended early.");
    }
    digest.update(chunk.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return {
    size: info.size,
    sha256: `0x${digest.digest("hex")}`,
  };
};

const parseMediaFrameHashes = (output) =>
  String(output ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").at(-1)?.trim().toLowerCase() ?? "")
    .filter((value) => /^[0-9a-f]{32,64}$/u.test(value));

const parseMediaAudioMaxVolumeDb = (output) => {
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

export const buildSolanaLiveCaptureContentAnalysis = ({
  parsed,
  frameHashes,
  audioFrameHashes,
  audioMaxVolumeDb,
  videoEssenceSha256 = null,
  audioEssenceSha256 = null,
  frameError = null,
  audioError = null,
  videoEssenceError = null,
  audioEssenceError = null,
  semanticWitnessAnalysis = null,
  requireSemanticWitness = false,
  expectedSubtitleCount = null,
}) => {
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
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
  const durationSeconds = Number(parsed?.format?.duration);
  const width = Number(video?.width);
  const height = Number(video?.height);
  const normalizedHashes = Array.isArray(frameHashes) ? frameHashes : [];
  const normalizedAudioHashes = Array.isArray(audioFrameHashes)
    ? audioFrameHashes
    : [];
  const uniqueFrameCount = new Set(normalizedHashes).size;
  const blockers = [];
  if (!video) {
    blockers.push("capture-video-stream");
  } else if (video.codec_name !== "h264") {
    blockers.push("capture-video-codec-h264");
  }
  if (videoStreams.length !== 1) {
    blockers.push("capture-video-stream-shape");
  }
  if (
    !video ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < SOLANA_LIVE_CAPTURE_MIN_WIDTH ||
    height < SOLANA_LIVE_CAPTURE_MIN_HEIGHT
  ) {
    blockers.push("capture-video-resolution");
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
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < SOLANA_LIVE_CAPTURE_MIN_DURATION_SECONDS ||
    durationSeconds > SOLANA_LIVE_CAPTURE_MAX_DURATION_SECONDS
  ) {
    blockers.push("capture-duration");
  }
  if (normalizedHashes.length < SOLANA_LIVE_CAPTURE_MIN_SAMPLED_FRAMES) {
    blockers.push("capture-frame-samples");
  }
  if (uniqueFrameCount < SOLANA_LIVE_CAPTURE_MIN_UNIQUE_FRAMES) {
    blockers.push("capture-frame-variation");
  }
  if (normalizedAudioHashes.length === 0) {
    blockers.push("capture-audio-samples");
  }
  if (
    !Number.isFinite(audioMaxVolumeDb) ||
    audioMaxVolumeDb < SOLANA_LIVE_CAPTURE_MIN_AUDIO_MAX_VOLUME_DB
  ) {
    blockers.push("capture-non-silent-audio");
  }
  if (frameError) blockers.push("capture-frame-analysis");
  if (audioError) blockers.push("capture-audio-analysis");
  if (!isHex32(videoEssenceSha256) || videoEssenceError) {
    blockers.push("capture-full-video-essence");
  }
  if (!isHex32(audioEssenceSha256) || audioEssenceError) {
    blockers.push("capture-full-audio-essence");
  }
  if (
    requireSemanticWitness &&
    (semanticWitnessAnalysis?.ready !== true ||
      semanticWitnessAnalysis?.semanticallyBound !== true)
  ) {
    blockers.push("capture-semantic-witness");
  }
  if (
    requireSemanticWitness &&
    (semanticWitnessAnalysis?.reviewAuthentication?.ready !== true ||
      semanticWitnessAnalysis?.reviewAuthentication?.authenticated !== true)
  ) {
    blockers.push("capture-review-authentication");
  }
  return {
    ready: blockers.length === 0,
    verifiedRealCapture: blockers.length === 0,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    sampledFrameCount: normalizedHashes.length,
    uniqueFrameCount,
    sampledFrameSha256:
      normalizedHashes.length > 0
        ? `0x${createHash("sha256")
            .update(normalizedHashes.join("\n"), "utf8")
            .digest("hex")}`
        : null,
    audioSampleCount: normalizedAudioHashes.length,
    audioSampleSha256:
      normalizedAudioHashes.length > 0
        ? `0x${createHash("sha256")
            .update(normalizedAudioHashes.join("\n"), "utf8")
            .digest("hex")}`
        : null,
    videoEssenceSha256: isHex32(videoEssenceSha256) ? videoEssenceSha256 : null,
    audioEssenceSha256: isHex32(audioEssenceSha256) ? audioEssenceSha256 : null,
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
    blockers,
  };
};

const probeMp4Media = (
  file,
  {
    timeoutMs = SOLANA_MEDIA_PROBE_TIMEOUT_MS,
    semanticWitnessContext = null,
  } = {},
) => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > SOLANA_MEDIA_PROBE_TIMEOUT_MS
  ) {
    throw new Error(
      `Solana production-gate media probe timeout must be between 1 and ${SOLANA_MEDIA_PROBE_TIMEOUT_MS} milliseconds.`,
    );
  }
  return withStableRegularFileDescriptorsSync(
    file,
    (
      [
        probeFd,
        subtitleFd,
        hashFd,
        frameFd,
        audioFd,
        videoEssenceFd,
        audioEssenceFd,
        ...semanticFrameFds
      ],
      resolved,
    ) => {
      if (process.platform === "win32") {
        throw new Error(
          `Solana production-gate MP4 semantic verification cannot bind an inherited seekable descriptor on Windows: ${resolved}`,
        );
      }
      const descriptorPath = "/dev/fd/3";
      const childStdio = (fd) => ["ignore", "pipe", "pipe", fd];
      const result = spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-protocol_whitelist",
          "file,pipe",
          "-show_entries",
          "format=format_name,duration",
          "-show_entries",
          "stream=index,codec_type,codec_name,width,height,time_base,start_time,duration,nb_frames,nb_read_frames",
          "-of",
          "json",
          descriptorPath,
        ],
        {
          encoding: "utf8",
          stdio: childStdio(probeFd),
          timeout: timeoutMs,
          maxBuffer: SOLANA_MEDIA_PROBE_MAX_BUFFER_BYTES,
        },
      );
      const artifact = hashStableDescriptor(hashFd);
      if (result.error) {
        return {
          ...artifact,
          media: {
            probed: false,
            error: result.error.message,
          },
        };
      }
      if (result.status !== 0) {
        return {
          ...artifact,
          media: {
            probed: false,
            error: result.stderr || "ffprobe failed",
          },
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
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            descriptorPath,
            "-map",
            "0:s:0",
            "-f",
            "webvtt",
            "pipe:1",
          ],
          {
            encoding: "utf8",
            stdio: childStdio(subtitleFd),
            timeout: timeoutMs,
            maxBuffer: SOLANA_MEDIA_PROBE_MAX_BUFFER_BYTES,
          },
        );
        const embeddedCues =
          subtitleExtraction.status === 0
            ? parseWebVttCues(subtitleExtraction.stdout || "")
            : [];
        const embeddedCueTexts = embeddedCues.map((cue) => cue.text);
        const frameAnalysis = spawnSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            descriptorPath,
            "-an",
            "-vf",
            "fps=1,scale=160:-2",
            "-f",
            "framemd5",
            "pipe:1",
          ],
          {
            encoding: "utf8",
            stdio: childStdio(frameFd),
            timeout: timeoutMs,
            maxBuffer: SOLANA_MEDIA_PROBE_MAX_BUFFER_BYTES,
          },
        );
        const audioAnalysis = spawnSync(
          "ffmpeg",
          [
            "-hide_banner",
            "-nostats",
            "-protocol_whitelist",
            "file,pipe",
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
          {
            encoding: "utf8",
            stdio: childStdio(audioFd),
            timeout: timeoutMs,
            maxBuffer: SOLANA_MEDIA_PROBE_MAX_BUFFER_BYTES,
          },
        );
        const videoEssenceAnalysis = spawnSync(
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
            descriptorPath,
            "-map",
            "0:v:0",
            "-c:v",
            "rawvideo",
            "-fps_mode:v",
            "passthrough",
            "-an",
            "-f",
            "streamhash",
            "-hash",
            "sha256",
            "pipe:1",
          ],
          {
            encoding: "utf8",
            stdio: childStdio(videoEssenceFd),
            timeout: SOLANA_MEDIA_ESSENCE_TIMEOUT_MS,
            maxBuffer: 1024,
          },
        );
        const audioEssenceAnalysis = spawnSync(
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
            descriptorPath,
            "-map",
            "0:a:0",
            "-c:a",
            "pcm_f32le",
            "-vn",
            "-f",
            "streamhash",
            "-hash",
            "sha256",
            "pipe:1",
          ],
          {
            encoding: "utf8",
            stdio: childStdio(audioEssenceFd),
            timeout: SOLANA_MEDIA_ESSENCE_TIMEOUT_MS,
            maxBuffer: 1024,
          },
        );
        let semanticWitnessAnalysis = null;
        if (isRecord(semanticWitnessContext)) {
          try {
            const normalizedWitness = normalizeSolanaLiveCaptureWitness(
              semanticWitnessContext.witness,
              {
                liveEvidence: semanticWitnessContext.liveEvidence,
                preLiveInputSnapshotSha256:
                  semanticWitnessContext.preLiveInputSnapshotSha256,
                expectedCaptureSha256:
                  semanticWitnessContext.expectedCaptureSha256,
                reviewPolicySha256:
                  semanticWitnessContext.reviewPolicy?.policySha256,
                durationSeconds: Number(parsed?.format?.duration),
              },
            );
            const captureReviewAuthentication =
              verifySolanaLiveCaptureReviewAttestation({
                attestation: semanticWitnessContext.reviewAttestation,
                witness: normalizedWitness,
                witnessArtifactSha256:
                  semanticWitnessContext.witnessArtifactSha256,
                reviewPolicy: semanticWitnessContext.reviewPolicy,
              });
            const semanticFrameFd = semanticFrameFds[0];
            const semanticSamples = normalizedWitness.markers.map((marker) => ({
              id: marker.id,
              atMilliseconds: marker.atMilliseconds,
              dwellFrames:
                SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS.map(
                  (offsetMilliseconds) => {
                    if (!Number.isInteger(semanticFrameFd)) {
                      throw new Error(
                        `Stable final-MP4 witness descriptor for ${marker.id} is missing.`,
                      );
                    }
                    const frame = spawnSync(
                      "ffmpeg",
                      [
                        "-v",
                        "error",
                        "-protocol_whitelist",
                        "file,pipe",
                        "-ss",
                        (
                          (marker.atMilliseconds + offsetMilliseconds) /
                          1000
                        ).toFixed(3),
                        "-i",
                        descriptorPath,
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
                        stdio: childStdio(semanticFrameFd),
                        timeout: timeoutMs,
                        maxBuffer:
                          SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH *
                          SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT *
                          2,
                      },
                    );
                    if (frame.status !== 0) {
                      throw new Error(
                        `ffmpeg final-MP4 witness extraction failed for ${marker.id}.`,
                      );
                    }
                    const grayscaleBytes = new Uint8Array(
                      frame.stdout.buffer,
                      frame.stdout.byteOffset,
                      frame.stdout.byteLength,
                    );
                    return {
                      offsetMilliseconds,
                      normalizedFrameSha256: `0x${createHash("sha256")
                        .update(grayscaleBytes)
                        .digest("hex")}`,
                      decodedPayload: decodeSolanaLiveCaptureWitnessQr({
                        grayscaleBytes,
                      }),
                    };
                  },
                ),
            }));
            semanticWitnessAnalysis = analyzeSolanaLiveCaptureWitnessFrames({
              witness: normalizedWitness,
              samples: semanticSamples,
            });
            semanticWitnessAnalysis.reviewAuthentication =
              captureReviewAuthentication;
          } catch (error) {
            semanticWitnessAnalysis = {
              schema: "iroha-demo-sccp-solana-live-capture-witness-analysis/v1",
              ready: false,
              semanticallyBound: false,
              blockers: ["capture-semantic-witness-validation"],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
        const contentAnalysis = buildSolanaLiveCaptureContentAnalysis({
          parsed,
          frameHashes:
            frameAnalysis.status === 0
              ? parseMediaFrameHashes(frameAnalysis.stdout)
              : [],
          audioFrameHashes:
            audioAnalysis.status === 0
              ? parseMediaFrameHashes(audioAnalysis.stdout)
              : [],
          audioMaxVolumeDb:
            audioAnalysis.status === 0
              ? parseMediaAudioMaxVolumeDb(audioAnalysis.stderr)
              : null,
          videoEssenceSha256:
            videoEssenceAnalysis.status === 0
              ? parseDecodedEssenceSha256(videoEssenceAnalysis.stdout, "v")
              : null,
          audioEssenceSha256:
            audioEssenceAnalysis.status === 0
              ? parseDecodedEssenceSha256(audioEssenceAnalysis.stdout, "a")
              : null,
          frameError:
            frameAnalysis.status === 0
              ? null
              : frameAnalysis.error?.message ||
                frameAnalysis.stderr ||
                "ffmpeg frame analysis failed",
          audioError:
            audioAnalysis.status === 0
              ? null
              : audioAnalysis.error?.message ||
                audioAnalysis.stderr ||
                "ffmpeg audio analysis failed",
          videoEssenceError:
            videoEssenceAnalysis.status === 0 &&
            parseDecodedEssenceSha256(videoEssenceAnalysis.stdout, "v")
              ? null
              : videoEssenceAnalysis.error?.message ||
                videoEssenceAnalysis.stderr ||
                "ffmpeg full video essence hashing failed",
          audioEssenceError:
            audioEssenceAnalysis.status === 0 &&
            parseDecodedEssenceSha256(audioEssenceAnalysis.stdout, "a")
              ? null
              : audioEssenceAnalysis.error?.message ||
                audioEssenceAnalysis.stderr ||
                "ffmpeg full audio essence hashing failed",
          semanticWitnessAnalysis,
          requireSemanticWitness: isRecord(semanticWitnessContext),
          expectedSubtitleCount:
            semanticWitnessContext?.expectedSubtitleCount ?? null,
        });
        return {
          ...artifact,
          media: {
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
              cueTimelineSha256:
                embeddedCues.length > 0 ? cueTimelineHash(embeddedCues) : null,
              firstCue: embeddedCueTexts[0] ?? null,
              lastCue: embeddedCueTexts.at(-1) ?? null,
              error:
                subtitleExtraction.status === 0
                  ? null
                  : subtitleExtraction.error?.message ||
                    subtitleExtraction.stderr ||
                    "ffmpeg subtitle extraction failed",
            },
            contentAnalysis,
            streams: streams.map((stream) => ({
              index: stream.index,
              codecType: stream.codec_type,
              codecName: stream.codec_name,
              width: stream.width ?? null,
              height: stream.height ?? null,
            })),
          },
        };
      } catch (error) {
        return {
          ...artifact,
          media: {
            probed: false,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      label: "Solana production-gate MP4 input",
      maxBytes: MAX_SOLANA_EVIDENCE_MP4_BYTES,
      descriptorCount: isRecord(semanticWitnessContext) ? 8 : 7,
    },
  );
};

const recordArtifactPreLiveInput = ({
  snapshotInputs,
  id,
  file,
  size,
  sha256,
}) => {
  if (!snapshotInputs || !id) return;
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    !/^0x[0-9a-f]{64}$/u.test(String(sha256 ?? ""))
  ) {
    throw new Error(
      `Solana production-gate pre-live media input ${id} is empty or has an invalid digest.`,
    );
  }
  snapshotInputs[id] = {
    id,
    path: path.resolve(file),
    present: true,
    size,
    sha256,
  };
};

export const collectArtifactFacts = async (
  pathsToCheck,
  {
    snapshotInputs = null,
    snapshotInputIdsByPath = new Map(),
    semanticWitnessContextsByPath = new Map(),
    mediaProbeTimeoutMs = SOLANA_MEDIA_PROBE_TIMEOUT_MS,
  } = {},
) => {
  const facts = {};
  for (const file of pathsToCheck) {
    if (!file) {
      continue;
    }
    const resolved = normalizePath(file);
    const snapshotId = snapshotInputIdsByPath.get(resolved) ?? null;
    try {
      const info = await lstat(resolved);
      if (!info.isFile() || info.isSymbolicLink()) {
        if (snapshotId) {
          throw new Error(
            `Solana production-gate pre-live media input ${snapshotId} must be a regular non-symlink file.`,
          );
        }
        facts[resolved] = {
          path: resolved,
          exists: false,
          size: info.size,
          symbolicLink: info.isSymbolicLink(),
        };
        continue;
      }
      let fact;
      if (resolved.endsWith(".mp4")) {
        const inspection = probeMp4Media(resolved, {
          timeoutMs: mediaProbeTimeoutMs,
          semanticWitnessContext:
            semanticWitnessContextsByPath.get(resolved) ?? null,
        });
        fact = {
          path: resolved,
          exists: true,
          size: inspection.size,
          sha256: inspection.sha256,
          symbolicLink: false,
          device: info.dev,
          inode: info.ino,
          media: inspection.media,
        };
      } else if (resolved.endsWith(".vtt")) {
        const bytes = await readStableRegularFile(resolved, {
          label: "Solana production-gate WebVTT input",
          maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
        });
        const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
        const text = bytes.toString("utf8");
        const cues = parseWebVttCues(text);
        const cueTexts = cues.map((cue) => cue.text);
        fact = {
          path: resolved,
          exists: true,
          size: bytes.length,
          sha256,
          symbolicLink: false,
          vtt: {
            webvtt: /^WEBVTT(?:\s|$)/u.test(text),
            cueCount: cueTexts.length,
            cueTextSha256: cueTextHash(cueTexts),
            cueTimelineSha256: cueTimelineHash(cues),
            firstCue: cueTexts[0] ?? null,
            lastCue: cueTexts.at(-1) ?? null,
            cueTexts,
          },
        };
      } else {
        fact = {
          path: resolved,
          exists: true,
          size: info.size,
          symbolicLink: false,
        };
      }
      if (snapshotId) {
        recordArtifactPreLiveInput({
          snapshotInputs,
          id: snapshotId,
          file: resolved,
          size: fact.size,
          sha256: fact.sha256,
        });
      }
      facts[resolved] = fact;
    } catch (error) {
      if (snapshotId) {
        if (error?.code !== "ENOENT") throw error;
        recordPreLiveInput({
          snapshotInputs,
          id: snapshotId,
          file: resolved,
        });
      }
      facts[resolved] = {
        path: resolved,
        exists: false,
        size: 0,
      };
    }
  }
  return facts;
};

export const runSccpSolanaProductionGate = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const expectedProverGovernanceApprovalSha256 =
    options.proverGovernanceApprovalSha256 ??
    process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV];
  const deployDir = resolveDeployArtifactDir({
    deployDir: options.deployDir,
    outputDir: options.outputDir,
  });
  const localSolanaSccpSdkCapability =
    await inspectLocalSolanaSccpSdkCapability();
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
  const governancePlanPath = deployArtifactPath({
    explicit: options.governancePlan,
    deployDir,
    defaultPath: DEFAULT_GOVERNANCE_PLAN_PATH,
  });
  const governanceRegistrationPath = deployArtifactPath({
    explicit: options.governanceRegistration,
    deployDir,
    defaultPath: DEFAULT_GOVERNANCE_REGISTER_RESULT_PATH,
  });
  const governanceActivationPath = deployArtifactPath({
    explicit: options.governanceActivation,
    deployDir,
    defaultPath: DEFAULT_GOVERNANCE_ACTIVATE_RESULT_PATH,
  });
  const orderedInitializationEvidencePath = deployArtifactPath({
    explicit: options.orderedInitializationEvidence,
    deployDir,
    defaultPath: DEFAULT_ORDERED_INITIALIZATION_EVIDENCE_PATH,
  });
  const freshDeployReportPath = deployArtifactPath({
    explicit: options.freshDeployReport,
    deployDir,
    defaultPath: DEFAULT_FRESH_DEPLOY_REPORT_PATH,
  });
  const proverGovernanceApprovalPath = deployArtifactPath({
    explicit:
      options.proverGovernanceApproval ||
      process.env[SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV],
    deployDir,
    defaultPath: DEFAULT_PROVER_GOVERNANCE_APPROVAL_PATH,
  });
  const captureReviewPolicyPath = deployArtifactPath({
    explicit: options.captureReviewPolicy,
    deployDir,
    defaultPath: DEFAULT_CAPTURE_REVIEW_POLICY_PATH,
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
  const liveCaptureVideoPath =
    typeof options.liveCaptureVideo === "string" &&
    options.liveCaptureVideo.trim()
      ? path.resolve(options.liveCaptureVideo)
      : null;
  const liveCaptureWitnessPath =
    typeof options.liveCaptureWitness === "string" &&
    options.liveCaptureWitness.trim()
      ? path.resolve(options.liveCaptureWitness)
      : null;
  const liveCaptureReviewAttestationPath =
    typeof options.liveCaptureReviewAttestation === "string" &&
    options.liveCaptureReviewAttestation.trim()
      ? path.resolve(options.liveCaptureReviewAttestation)
      : null;
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

  const preLiveInputSnapshotEntries = {};
  const snapshotJson = (id) => ({
    snapshotInputs: preLiveInputSnapshotEntries,
    snapshotId: id,
  });
  // First-release completion has no local-manifest or route-manager evidence
  // aliases. Public typed-registry readback and the exact Parliament artifacts
  // below are the only route truth consumed by the gate.
  const requirementsReport = null;
  const postDeployEvidenceReport = null;
  const proverReadinessReport = null;
  const productionMaterialInventoryReport = null;
  const routeManifestReport = null;
  const freshDeployLoad = await loadPinnedFreshDeployReport({
    file: freshDeployReportPath,
    expectedSha256: options.freshDeployReportSha256,
    validator:
      options.freshDeployReportValidator ??
      validateSolanaLoaderV3FreshDeployReport,
    ...snapshotJson("freshDeployReport"),
  });
  const normalizedFreshDeployReport = freshDeployLoad.normalized;
  const proverGovernanceApprovalReport = await readJsonIfExists(
    proverGovernanceApprovalPath,
    expectedProverGovernanceApprovalSha256,
    {
      requirePin: expectedProverGovernanceApprovalSha256 !== undefined,
      ...snapshotJson("proverGovernanceApproval"),
    },
  );
  const proverGovernanceApprovalArtifact =
    preLiveInputSnapshotEntries.proverGovernanceApproval ?? null;
  let canonicalProverGovernanceApproval = null;
  if (isRecord(proverGovernanceApprovalReport)) {
    const canonicalBytes = Buffer.from(
      `${canonicalSolanaExactProverApprovalJson(
        proverGovernanceApprovalReport,
      )}\n`,
      "utf8",
    );
    const canonicalSha256 = `0x${createHash("sha256")
      .update(canonicalBytes)
      .digest("hex")}`;
    if (
      canonicalBytes.length === proverGovernanceApprovalArtifact?.size &&
      canonicalSha256 === proverGovernanceApprovalArtifact?.sha256
    ) {
      canonicalProverGovernanceApproval = proverGovernanceApprovalReport;
    }
  }
  const proverGovernanceApprovalValidation =
    buildExactSolanaProductionProverApprovalValidation({
      approvalRecord: canonicalProverGovernanceApproval,
      approvalPath: proverGovernanceApprovalPath,
      approvalSha256: proverGovernanceApprovalArtifact?.sha256 ?? null,
      expectedApprovalSha256: expectedProverGovernanceApprovalSha256 ?? null,
    });
  const captureReviewPolicyLoad = await loadPinnedCaptureReviewPolicy({
    file: captureReviewPolicyPath,
    expectedSha256: options.captureReviewPolicySha256,
    approvalPinnedSha256:
      proverGovernanceApprovalValidation.pins?.captureReviewPolicySha256,
    ...snapshotJson("captureReviewPolicy"),
  });
  const governancePlanReport = await readJsonIfExists(
    governancePlanPath,
    null,
    snapshotJson("governancePlan"),
  );
  const governanceRegistrationReport = await readJsonIfExists(
    governanceRegistrationPath,
    options.governanceRegistrationSha256,
    {
      requirePin: options.governanceRegistrationSha256 !== undefined,
      ...snapshotJson("governanceRegistration"),
    },
  );
  const governanceActivationReport = await readJsonIfExists(
    governanceActivationPath,
    options.governanceActivationSha256,
    {
      requirePin: options.governanceActivationSha256 !== undefined,
      ...snapshotJson("governanceActivation"),
    },
  );
  const orderedInitializationEvidenceReport = await readJsonIfExists(
    orderedInitializationEvidencePath,
    options.orderedInitializationEvidenceSha256,
    {
      requirePin: options.orderedInitializationEvidenceSha256 !== undefined,
      ...snapshotJson("orderedInitializationEvidence"),
    },
  );
  const sourceMaterialHandoffReport = null;
  const handoffVerificationReport = null;
  const sourceBurnReadinessReport = null;
  const sourceBurnSubmissionReport = null;
  const proofMaterialRequestReport = null;
  const proofMaterialBundleReport = null;
  const proofMaterialCeremonyPackageReport = null;
  const smokeReadinessReport = await readJsonIfExists(
    smokeReadinessPath,
    null,
    snapshotJson("smokeReadiness"),
  );
  const proverRuntimeReinspection = reinspectSolanaSmokeProverArtifacts({
    smokeReadinessReport,
    expectedProverGovernanceApprovalSha256,
    proverGovernanceApprovalValidation,
  });
  const deploymentVideoTranscript = null;
  const liveVideoTranscript = await readJsonIfExists(liveVideoTranscriptPath);
  const liveCaptureWitnessArtifact = await loadPinnedPostLiveJsonArtifact({
    file: liveCaptureWitnessPath,
    expectedSha256: options.liveCaptureWitnessSha256,
    label: "Pinned final-boundary Solana live capture witness",
  });
  const liveCaptureReviewAttestationArtifact =
    await loadPinnedPostLiveJsonArtifact({
      file: liveCaptureReviewAttestationPath,
      expectedSha256: options.liveCaptureReviewAttestationSha256,
      label: "Pinned final-boundary Solana capture-review attestation",
    });
  const blockedLiveVideoTranscript = await readJsonIfExists(
    blockedLiveVideoTranscriptPath,
  );
  const livePaths = videoArtifactPaths({
    transcript: liveVideoTranscript,
    fallbackMp4Path: liveVideoMp4Path,
    fallbackVttPath: liveVideoVttPath,
  });
  const liveVideoSourceCapture = readFirstRecord(
    liveVideoTranscript,
    "sourceCapture",
    "source_capture",
  );
  const liveVideoSuccessPolicy = readFirstRecord(
    liveVideoTranscript,
    "successEvidencePolicy",
    "success_evidence_policy",
  );
  const liveVideoProductionGatePolicy = readFirstRecord(
    liveVideoSuccessPolicy,
    "productionGate",
    "production_gate",
  );
  const normalizedExpectedLiveCaptureVideoSha256 = String(
    options.liveCaptureVideoSha256 ?? "",
  ).toLowerCase();
  const liveVideoSemanticWitnessContext = isRecord(liveVideoTranscript)
    ? {
        witness: liveCaptureWitnessArtifact.value,
        witnessArtifactSha256: liveCaptureWitnessArtifact.sha256,
        reviewAttestation: liveCaptureReviewAttestationArtifact.value,
        reviewPolicy: captureReviewPolicyLoad.normalized,
        liveEvidence: readFirstRecord(
          liveVideoTranscript,
          "liveEvidence",
          "live_evidence",
        ),
        preLiveInputSnapshotSha256: readFirstString(
          liveVideoProductionGatePolicy,
          "preLiveInputSnapshotSha256",
          "pre_live_input_snapshot_sha256",
        ),
        expectedCaptureSha256: normalizedExpectedLiveCaptureVideoSha256,
      }
    : null;
  const finalVideoSemanticWitnessContext = isRecord(
    liveVideoSemanticWitnessContext,
  )
    ? { ...liveVideoSemanticWitnessContext, expectedSubtitleCount: 1 }
    : null;
  const rawCaptureSemanticWitnessContext = isRecord(
    liveVideoSemanticWitnessContext,
  )
    ? { ...liveVideoSemanticWitnessContext, expectedSubtitleCount: 0 }
    : null;
  const artifactFacts = await collectArtifactFacts(
    [
      liveCaptureVideoPath,
      livePaths.mp4,
      livePaths.vtt,
      blockedLiveVideoMp4Path,
      blockedLiveVideoVttPath,
    ],
    {
      semanticWitnessContextsByPath: isRecord(liveVideoSemanticWitnessContext)
        ? new Map([
            [normalizePath(livePaths.mp4), finalVideoSemanticWitnessContext],
            ...(liveCaptureVideoPath
              ? [
                  [
                    normalizePath(liveCaptureVideoPath),
                    rawCaptureSemanticWitnessContext,
                  ],
                ]
              : []),
          ])
        : new Map(),
    },
  );
  const preLiveInputSnapshot = buildSolanaProductionGatePreLiveInputSnapshot(
    preLiveInputSnapshotEntries,
  );
  validateSolanaProductionGatePreLiveInputSnapshot(preLiveInputSnapshot);
  if (
    options.expectedPreLiveInputSnapshotSha256 !== undefined &&
    String(options.expectedPreLiveInputSnapshotSha256).toLowerCase() !==
      preLiveInputSnapshot.preLiveInputSnapshotSha256
  ) {
    throw new Error(
      `Solana production-gate pre-live input snapshot changed: expected ${options.expectedPreLiveInputSnapshotSha256}, got ${preLiveInputSnapshot.preLiveInputSnapshotSha256}.`,
    );
  }

  let finalCaptureReviewBoundary = {
    ready: false,
    policyLoad: captureReviewPolicyLoad,
    authentication: null,
    error: "Final capture-review boundary has not been authenticated.",
  };
  try {
    const reopenedSourceCaptureFact = liveCaptureVideoPath
      ? artifactFact(artifactFacts, liveCaptureVideoPath)
      : null;
    if (
      !/^0x[0-9a-f]{64}$/u.test(normalizedExpectedLiveCaptureVideoSha256) ||
      reopenedSourceCaptureFact?.exists !== true ||
      reopenedSourceCaptureFact.sha256 !==
        normalizedExpectedLiveCaptureVideoSha256 ||
      reopenedSourceCaptureFact.sha256 !==
        readFirstString(liveVideoSourceCapture, "sha256")
    ) {
      throw new Error(
        "The final boundary could not reopen the independently pinned source capture bytes.",
      );
    }
    const freshTrust = await reloadPinnedCaptureReviewTrustBoundary({
      snapshot: preLiveInputSnapshot,
      proverGovernanceApprovalPath,
      expectedProverGovernanceApprovalSha256,
      captureReviewPolicyPath,
      expectedCaptureReviewPolicySha256: options.captureReviewPolicySha256,
    });
    const freshWitnessArtifact = await loadPinnedPostLiveJsonArtifact({
      file: liveCaptureWitnessPath,
      expectedSha256: options.liveCaptureWitnessSha256,
      label: "Fresh final-boundary Solana live capture witness",
    });
    const freshAttestationArtifact = await loadPinnedPostLiveJsonArtifact({
      file: liveCaptureReviewAttestationPath,
      expectedSha256: options.liveCaptureReviewAttestationSha256,
      label: "Fresh final-boundary Solana capture-review attestation",
    });
    for (const [label, initial, fresh] of [
      ["capture witness", liveCaptureWitnessArtifact, freshWitnessArtifact],
      [
        "capture-review attestation",
        liveCaptureReviewAttestationArtifact,
        freshAttestationArtifact,
      ],
    ]) {
      if (
        fresh.error !== null ||
        fresh.sha256 !== initial.sha256 ||
        fresh.size !== initial.size ||
        canonicalSccpJson(fresh.value) !== canonicalSccpJson(initial.value)
      ) {
        throw new Error(`The pinned ${label} changed before final readiness.`);
      }
    }
    const normalizedWitness = normalizeSolanaLiveCaptureWitness(
      freshWitnessArtifact.value,
      {
        liveEvidence: liveVideoSemanticWitnessContext?.liveEvidence,
        preLiveInputSnapshotSha256:
          preLiveInputSnapshot.preLiveInputSnapshotSha256,
        expectedCaptureSha256: reopenedSourceCaptureFact.sha256,
        reviewPolicySha256: freshTrust.policyLoad.artifactSha256,
      },
    );
    const authentication = verifySolanaLiveCaptureReviewAttestation({
      attestation: freshAttestationArtifact.value,
      witness: normalizedWitness,
      witnessArtifactSha256: freshWitnessArtifact.sha256,
      reviewPolicy: freshTrust.policyLoad.normalized,
    });
    const freshSemanticContext = {
      witness: freshWitnessArtifact.value,
      witnessArtifactSha256: freshWitnessArtifact.sha256,
      reviewAttestation: freshAttestationArtifact.value,
      reviewPolicy: freshTrust.policyLoad.normalized,
      liveEvidence: liveVideoSemanticWitnessContext?.liveEvidence,
      preLiveInputSnapshotSha256:
        preLiveInputSnapshot.preLiveInputSnapshotSha256,
      expectedCaptureSha256: reopenedSourceCaptureFact.sha256,
    };
    const freshMediaFacts = await collectArtifactFacts(
      [liveCaptureVideoPath, livePaths.mp4],
      {
        semanticWitnessContextsByPath: new Map([
          [
            normalizePath(liveCaptureVideoPath),
            { ...freshSemanticContext, expectedSubtitleCount: 0 },
          ],
          [
            normalizePath(livePaths.mp4),
            { ...freshSemanticContext, expectedSubtitleCount: 1 },
          ],
        ]),
      },
    );
    for (const file of [liveCaptureVideoPath, livePaths.mp4]) {
      const initial = artifactFact(artifactFacts, file);
      const fresh = artifactFact(freshMediaFacts, file);
      const stable =
        initial.exists === true &&
        fresh.exists === true &&
        initial.size === fresh.size &&
        initial.sha256 === fresh.sha256 &&
        initial.device === fresh.device &&
        initial.inode === fresh.inode &&
        canonicalSccpJson(initial.media) === canonicalSccpJson(fresh.media);
      if (!stable) {
        throw new Error(
          "The pinned source capture or final MP4 changed before final readiness.",
        );
      }
      artifactFacts[normalizePath(file)] = fresh;
    }
    finalCaptureReviewBoundary = {
      ready: true,
      policyLoad: freshTrust.policyLoad,
      authentication,
      stableArtifactReinspection: true,
      stableMediaReinspection: true,
      error: null,
    };
  } catch (error) {
    finalCaptureReviewBoundary = {
      ready: false,
      policyLoad: captureReviewPolicyLoad,
      authentication: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let freshDeployRpcVerification = {
    ready: false,
    liveFinalizedRpcReplay: false,
    transactions: [],
    error: "Canonical fresh-deploy report is unavailable.",
  };
  if (normalizedFreshDeployReport) {
    try {
      if (options.skipSolanaRpc === true) {
        throw new Error(
          "Fresh-deploy lifecycle signatures require live finalized Solana RPC verification.",
        );
      }
      const rpcUrl = options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL;
      const connection =
        options.solanaConnection ?? new Connection(rpcUrl, "finalized");
      const verifier =
        options.freshDeployTransactionVerifier ??
        verifySolanaLoaderV3FreshDeployReportTransactions;
      const verification = await verifier(
        connection,
        normalizedFreshDeployReport,
      );
      freshDeployRpcVerification = {
        ...verification,
        liveFinalizedRpcReplay: verification?.ready === true,
      };
    } catch (error) {
      freshDeployRpcVerification = {
        ready: false,
        liveFinalizedRpcReplay: false,
        transactions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let orderedInitializationRpcVerification = {
    ready: false,
    transactions: [],
    error: "Ordered-initialization evidence is unavailable.",
  };
  try {
    if (options.skipSolanaRpc === true) {
      throw new Error(
        "Ordered-initialization signatures require live finalized Solana RPC verification.",
      );
    }
    const normalizedOrderedInitialization =
      validateSolanaOrderedInitializationEvidence(
        orderedInitializationEvidenceReport,
      );
    const timeoutCandidate = Number(options.fetchTimeoutMs);
    orderedInitializationRpcVerification =
      await verifySolanaOrderedInitializationTransactions(
        normalizedOrderedInitialization,
        {
          registrySummary: preflightReport?.registrySummary,
          timeoutMs:
            Number.isSafeInteger(timeoutCandidate) && timeoutCandidate > 0
              ? timeoutCandidate
              : 20_000,
        },
      );
  } catch (error) {
    orderedInitializationRpcVerification = {
      ready: false,
      transactions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const governanceEvidence = await buildSolanaGovernanceEvidenceChecks({
    governancePlan: governancePlanReport,
    expectedPlanSha256: options.governancePlanSha256,
    registrationResult: governanceRegistrationReport,
    registrationArtifactSha256:
      preLiveInputSnapshot.inputs.governanceRegistration?.sha256,
    expectedRegistrationArtifactSha256: options.governanceRegistrationSha256,
    activationResult: governanceActivationReport,
    activationArtifactSha256:
      preLiveInputSnapshot.inputs.governanceActivation?.sha256,
    expectedActivationArtifactSha256: options.governanceActivationSha256,
    orderedInitializationEvidence: orderedInitializationEvidenceReport,
    orderedInitializationArtifactSha256:
      preLiveInputSnapshot.inputs.orderedInitializationEvidence?.sha256,
    expectedOrderedInitializationArtifactSha256:
      options.orderedInitializationEvidenceSha256,
    orderedInitializationRpcVerification,
    preflightReport,
    fetchTimeoutMs:
      Number.isSafeInteger(Number(options.fetchTimeoutMs)) &&
      Number(options.fetchTimeoutMs) > 0
        ? Number(options.fetchTimeoutMs)
        : 20_000,
  });

  const successExecutionPolicy =
    buildSolanaProductionGateSuccessExecutionPolicy({
      toriiUrl: options.toriiUrl,
      solanaRpcUrl: options.solanaRpcUrl || CANONICAL_SOLANA_TESTNET_RPC_URL,
      skipSolanaRpc: options.skipSolanaRpc,
      preflightReportOverride,
      freshPreflightCompleted,
      preflightReport,
      governancePlan: governancePlanReport,
      governanceRegistration: governanceRegistrationReport,
      governanceActivation: governanceActivationReport,
      governanceEvidenceReady: governanceEvidence.ready,
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
          governanceEvidence: {
            planSha256: governancePlanReport?.plan_sha256 ?? null,
            registrationArtifactSha256:
              preLiveInputSnapshot.inputs.governanceRegistration?.sha256 ??
              null,
            activationArtifactSha256:
              preLiveInputSnapshot.inputs.governanceActivation?.sha256 ?? null,
            publicRegistrySha256:
              preflightReport?.registrySummary?.registrySha256 ?? null,
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
  await assertSolanaProductionGateOutputIsDisjoint({
    outputPath: reportPath,
    inputPaths: [
      preflightReportPath,
      freshDeployReportPath,
      liveCaptureWitnessPath,
      liveCaptureReviewAttestationPath,
      liveVideoTranscriptPath,
      blockedLiveVideoTranscriptPath,
      ...Object.values(preLiveInputSnapshot.inputs).map((input) => input.path),
      ...Object.keys(artifactFacts),
    ],
  });
  const report = buildSolanaProductionGateReport({
    deployDir,
    normalizedFreshDeployReport,
    freshDeployReportValidationError: freshDeployLoad.error,
    freshDeployReportPath,
    expectedFreshDeployReportSha256: options.freshDeployReportSha256,
    freshDeployRpcVerification,
    skipSolanaRpc: options.skipSolanaRpc,
    preflightReport,
    preflightReportPath,
    proverGovernanceApprovalReport,
    proverGovernanceApprovalPath,
    captureReviewPolicyLoad,
    captureReviewPolicyPath,
    liveCaptureWitnessArtifact,
    liveCaptureWitnessPath,
    liveCaptureReviewAttestationArtifact,
    liveCaptureReviewAttestationPath,
    finalCaptureReviewBoundary,
    liveCaptureVideoPath,
    expectedLiveCaptureVideoSha256: normalizedExpectedLiveCaptureVideoSha256,
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
    governancePlanReport,
    governancePlanPath,
    governancePlanSha256: options.governancePlanSha256,
    governanceRegistrationReport,
    governanceRegistrationPath,
    governanceRegistrationSha256: options.governanceRegistrationSha256,
    governanceActivationReport,
    governanceActivationPath,
    governanceActivationSha256: options.governanceActivationSha256,
    orderedInitializationEvidenceReport,
    orderedInitializationEvidencePath,
    orderedInitializationEvidenceSha256:
      options.orderedInitializationEvidenceSha256,
    orderedInitializationRpcVerification,
    governanceEvidence,
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
    localSolanaSccpSdkCapability,
    preLiveInputSnapshot,
    successExecutionPolicy,
    liveVideoAuthoritativeRevalidation,
    expectedProverGovernanceApprovalSha256:
      expectedProverGovernanceApprovalSha256,
    proverGovernanceApprovalValidation,
    proverRuntimeReinspection,
  });
  await writeAtomicJsonFile(reportPath, report);
  const reportBytes = await readStableRegularFile(reportPath, {
    label: "Fresh Solana production-gate report",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
  });
  return {
    report,
    reportPath,
    reportArtifactSha256: `0x${createHash("sha256")
      .update(reportBytes)
      .digest("hex")}`,
  };
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
    freshDeployReport: args["fresh-deploy-report"],
    freshDeployReportSha256: args["fresh-deploy-report-sha256"],
    requirements: args.requirements,
    postDeployEvidence: args["post-deploy-evidence"],
    proverReadiness: args["prover-readiness"],
    productionMaterialInventory: args["production-material-inventory"],
    routeManifest: args["route-manifest"],
    governancePlan: args["governance-plan"],
    governancePlanSha256: args["governance-plan-sha256"],
    governanceRegistration: args["governance-register-result"],
    governanceRegistrationSha256: args["governance-register-result-sha256"],
    governanceActivation: args["governance-activate-result"],
    governanceActivationSha256: args["governance-activate-result-sha256"],
    orderedInitializationEvidence: args["ordered-initialization-evidence"],
    orderedInitializationEvidenceSha256:
      args["ordered-initialization-evidence-sha256"],
    sourceMaterialHandoff: args["source-material-handoff"],
    handoffVerification: args["handoff-verification"],
    sourceBurnReadiness: args["source-burn-readiness"],
    sourceBurnSubmission: args["source-burn-submission"],
    proofMaterialRequest: args["proof-material-request"],
    proofMaterialBundle: args["proof-material-bundle"],
    proofMaterialCeremonyPackage: args["proof-material-ceremony-package"],
    smokeReadiness: args["smoke-readiness"],
    proverGovernanceApproval:
      args["prover-governance-approval"] ||
      process.env[SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV],
    proverGovernanceApprovalSha256:
      args["prover-governance-approval-sha256"] ||
      process.env[SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV],
    captureReviewPolicy: args["capture-review-policy"],
    captureReviewPolicySha256: args["capture-review-policy-sha256"],
    deploymentVideoTranscript: args["deployment-video-transcript"],
    deploymentVideoMp4: args["deployment-video-mp4"],
    deploymentVideoVtt: args["deployment-video-vtt"],
    expectedPreLiveInputSnapshotSha256:
      args["expected-pre-live-input-snapshot-sha256"],
    liveVideoTranscript: args["live-video-transcript"],
    liveVideoMp4: args["live-video-mp4"],
    liveVideoVtt: args["live-video-vtt"],
    liveCaptureVideo: args["live-capture-video"],
    liveCaptureVideoSha256: args["live-capture-video-sha256"],
    liveCaptureWitness: args["live-capture-witness"],
    liveCaptureWitnessSha256: args["live-capture-witness-sha256"],
    liveCaptureReviewAttestation: args["live-capture-review-attestation"],
    liveCaptureReviewAttestationSha256:
      args["live-capture-review-attestation-sha256"],
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

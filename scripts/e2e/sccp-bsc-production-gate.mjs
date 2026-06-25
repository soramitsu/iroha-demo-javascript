#!/usr/bin/env node
/* global BigInt, globalThis */
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1 } from "@iroha/iroha-js/sccp";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  DEFAULT_BSC_TAIRA_TORII_URL,
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  parseJsonWithoutDuplicateKeys,
  resolveBscNetworkProfile,
  runBscSccpRoutePreflight,
} from "./sccp-bsc-route-preflight.mjs";
import {
  MAX_SCREENSHOT_ARTIFACT_BYTES,
  MAX_VIDEO_ARTIFACT_BYTES,
  REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
  SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
} from "./sccp-bsc-live-video.mjs";
import {
  BSC_DESTINATION_PROVER_EXPORTS,
  BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS,
  BSC_RUNTIME_BACKEND_EXPORTS,
  BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS,
  BSC_SOURCE_PROVER_EXPORTS,
  BSC_SOURCE_PROVER_SELF_TEST_EXPORTS,
  SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES,
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  SCCP_BSC_BROWSER_MODULE_MIN_BYTES,
  SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  SCCP_BSC_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_PROVER_MODULE_URL_ENV,
  SCCP_BSC_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
  SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
  SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
  readBscProfileEnv,
  runBscSccpLiveSmokeReadiness,
} from "./sccp-bsc-live-smoke-readiness.mjs";
import {
  SCCP_BSC_SANITIZED_STANZA_MAX_BYTES,
  SAFE_ROUTE_STANZA_KEYS,
  assertRuntimeSshCredentialSources,
  parseSccpRouteManifestStanzas,
  runBscSccpPeerConfigAudit,
  runBscSccpRemotePeerConfigAudit,
} from "./sccp-bsc-peer-config-audit.mjs";
import {
  GENERATED_NON_PRODUCTION_DIR_PATTERN,
  SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
  bscProductionRequirementsContractHash,
  runBscSccpProductionMaterialInventory,
} from "./sccp-bsc-production-material-inventory.mjs";
import { bscDestinationBindingKey } from "./sccp-bsc-route-manifest.mjs";
import { normalizeBscRuntimeProverMaterialUrl } from "./sccp-bsc-runtime-prover-config.mjs";
import {
  WALLETCONNECT_PROJECT_ID_ENV,
  normalizeSccpBrowserModuleUrl,
} from "./sccp-live-smoke-readiness.mjs";

const SOURCE_PARITY_REQUIRED_MARKERS_BY_PROFILE = Object.freeze({
  testnet: Object.freeze([
    "BSC_TESTNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
    "BSC_TESTNET_LOCAL_ADMISSION_METADATA",
    "BSC_TESTNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
  ]),
  mainnet: Object.freeze([
    "BSC_MAINNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
    "BSC_MAINNET_LOCAL_ADMISSION_METADATA",
    "BSC_MAINNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
  ]),
});

const sourceParityRequiredMarkersForProfile = (bscProfile) =>
  SOURCE_PARITY_REQUIRED_MARKERS_BY_PROFILE[bscProfile.key] ??
  Object.freeze([]);

const resolveDeclaredBscProfile = (value) => {
  try {
    return resolveBscNetworkProfile(value);
  } catch {
    return null;
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-bsc-production-gate",
);
export const bscSccpProductionGateReportPaths = (bscNetwork = "testnet") => {
  const profile = resolveBscNetworkProfile(bscNetwork);
  return Object.freeze({
    routeReportPath: path.join(
      repoRoot,
      "output/sccp-bsc-preflight",
      profile.key,
      "latest.json",
    ),
    peerAuditReportPath: path.join(
      repoRoot,
      "output/sccp-bsc-peer-config-audit",
      profile.key,
      "latest.json",
    ),
    smokeReadinessReportPath: path.join(
      repoRoot,
      "output/sccp-bsc-smoke-readiness",
      profile.key,
      "latest.json",
    ),
    materialInventoryReportPath: path.join(
      repoRoot,
      "output/sccp-bsc-production-material-inventory",
      profile.key,
      "latest.json",
    ),
    videoTranscriptPath: "",
  });
};
export const DEFAULT_SCCP_BSC_PRODUCTION_GATE_REPORT_PATHS = Object.freeze(
  bscSccpProductionGateReportPaths("testnet"),
);
const bscSccpProductionGateOutputDir = (bscNetwork = "testnet") =>
  path.join(DEFAULT_OUTPUT_DIR, resolveBscNetworkProfile(bscNetwork).key);
const DEFAULT_MAX_REPORT_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_JSON_REPORT_BYTES = 4 * 1024 * 1024;
const MIN_VIDEO_ARTIFACT_BYTES = 64 * 1024;
const MIN_SCREENSHOT_ARTIFACT_BYTES = 512;
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 480;
const MAX_SCREENSHOT_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
const MIN_SCREENSHOT_IMAGE_UNIQUE_BYTES = 8;
const MAX_SCREENSHOT_DOMINANT_PIXEL_BYTE_FRACTION = 0.995;
const MIN_PRODUCTION_PROOF_FILE_BYTES = 64 * 1024;
const MIN_EXPLORER_CONTENT_CHARS = 64;
const MIN_VIDEO_DURATION_MS = 30_000;
const MAX_VIDEO_DURATION_MS = 7_200_000;
const NON_ZERO_SHA256_PATTERN = /^(?!0{64}$)[0-9a-f]{64}$/u;
const NON_ZERO_HEX32_PATTERN = /^0x(?!0{64}$)[0-9a-f]{64}$/u;
const TAIRA_ASSET_DEFINITION_ID_PATTERN =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{16,80}$/u;
const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IHDR_CHUNK_TYPE = "IHDR";
const PNG_IDAT_CHUNK_TYPE = "IDAT";
const PNG_IEND_CHUNK_TYPE = "IEND";
const WEBM_EBML_SIGNATURE = Object.freeze([0x1a, 0x45, 0xdf, 0xa3]);
const WEBM_DOCTYPE_ELEMENT_ID = Object.freeze([0x42, 0x82]);
const WEBM_DOCTYPE_BYTES = Object.freeze([0x77, 0x65, 0x62, 0x6d]);
const WEBM_SEGMENT_ELEMENT_ID = Object.freeze([0x18, 0x53, 0x80, 0x67]);
const WEBM_INFO_ELEMENT_ID = Object.freeze([0x15, 0x49, 0xa9, 0x66]);
const WEBM_TRACKS_ELEMENT_ID = Object.freeze([0x16, 0x54, 0xae, 0x6b]);
const WEBM_CLUSTER_ELEMENT_ID = Object.freeze([0x1f, 0x43, 0xb6, 0x75]);
const WEBM_SIMPLE_BLOCK_ELEMENT_ID = Object.freeze([0xa3]);
const WEBM_BLOCK_GROUP_ELEMENT_ID = Object.freeze([0xa0]);
const WEBM_HEADER_SCAN_BYTES = 4096;
const WEBM_CONTAINER_SCAN_BYTES = 4 * 1024 * 1024;
const MIN_WEBM_FRAME_PAYLOAD_BYTES = 16;
const MIN_WEBM_UNIQUE_BYTES = 32;
const MAX_WEBM_DOMINANT_BYTE_FRACTION = 0.995;
const REVERIFIED_VIDEO_PROOF_FILES = Symbol(
  "sccp-bsc-reverified-video-proof-files",
);
const REVERIFIED_VIDEO_PROOF_OUTPUT_DIR_BINDING = Symbol(
  "sccp-bsc-reverified-video-proof-output-dir-binding",
);
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const SMOKE_FIXTURE_G1 = Object.freeze(["1", "2"]);
const SMOKE_FIXTURE_G2 = Object.freeze([
  "10857046999023057135944570762232829481370756359578518086990519993285655852781",
  "11559732032986387107991004021392285783925812861821192530917403151452391805634",
  "8495653923123431417604973247489272438418190587263600148770280649306958101930",
  "4082367875863433681332203403145435568316851327593401208105741076214120093531",
]);
const SMOKE_FIXTURE_IC = Object.freeze(
  Array.from({ length: 10 }, () => SMOKE_FIXTURE_G1).flat(),
);
const BN254_BASE_FIELD_MODULUS = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583",
);
const BN254_TWIST_B_COEFFICIENT = Object.freeze([
  BigInt(
    "19485874751759354771024239261021720505790618469301721065564631296452457478373",
  ),
  BigInt(
    "266929791119991161246907387137283842545076965332900288569378510910307636690",
  ),
]);
const VERIFIER_VECTOR_ALIASES = Object.freeze([
  Object.freeze(["alpha1", "configuredAlpha1", "vk_alpha_1"]),
  Object.freeze(["beta2", "configuredBeta2", "vk_beta_2"]),
  Object.freeze(["gamma2", "configuredGamma2", "vk_gamma_2"]),
  Object.freeze(["delta2", "configuredDelta2", "vk_delta_2"]),
  Object.freeze(["ic", "configuredIc", "vk_ic", "IC"]),
]);
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES = new Set([
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
]);
const VERIFIER_KEY_HASH_ALIASES = new Set([
  "verifierKeyHash",
  "verifier_key_hash",
  "bridgeVerifierKeyHash",
  "bridge_verifier_key_hash",
  "configuredVerifierKeyHash",
  "configured_verifier_key_hash",
  "vkHash",
  "vk_hash",
]);

const PUBLIC_DEPLOYMENT_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
  "networkIdHex",
  "verifierCodeHash",
  "verifierKeyHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
  "settlementAssetDefinitionId",
]);
const ROLE_SEPARATED_PRODUCTION_HASH_FIELDS = Object.freeze([
  "verifierCodeHash",
  "verifierKeyHash",
  "destinationBindingHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
]);
const BSC_COMPILED_CONTRACT_ARTIFACTS = Object.freeze({
  verifier: "SccpGroth16Bn254MessageVerifier",
  sourceBridge: "SccpBscSourceBridge",
  token: "TairaXOR",
  bridge: "TairaXorBscSccpBridge",
});

const PUBLIC_BSC_PROFILE_FIELDS = Object.freeze([
  "network",
  "chain",
  "chainIdHex",
  "networkIdHex",
  "explorerUrl",
  "explorerHost",
]);

const PUBLIC_ROUTE_IDENTITY_FIELDS = Object.freeze(["routeId", "assetKey"]);

const PUBLIC_ROUTE_IDENTITY_ALIASES = Object.freeze({
  routeId: Object.freeze(["routeId", "route_id"]),
  assetKey: Object.freeze(["assetKey", "asset_key"]),
});

const PUBLIC_CHECK_ID_ALIASES = Object.freeze(["id", "checkId", "check_id"]);

const PUBLIC_BSC_PROFILE_ALIASES = Object.freeze({
  network: Object.freeze(["network", "bscNetwork", "bsc_network"]),
  chain: Object.freeze(["chain", "bscChain", "bsc_chain"]),
  chainIdHex: Object.freeze([
    "chainIdHex",
    "chain_id_hex",
    "bscChainIdHex",
    "bsc_chain_id_hex",
  ]),
  networkIdHex: Object.freeze([
    "networkIdHex",
    "network_id_hex",
    "bscNetworkIdHex",
    "bsc_network_id_hex",
  ]),
  explorerUrl: Object.freeze([
    "explorerUrl",
    "explorer_url",
    "bscExplorerUrl",
    "bsc_explorer_url",
  ]),
  explorerHost: Object.freeze([
    "explorerHost",
    "explorer_host",
    "bscExplorerHost",
    "bsc_explorer_host",
  ]),
});

const PUBLIC_DEPLOYMENT_ALIASES = Object.freeze({
  bridgeAddress: Object.freeze([
    "bridgeAddress",
    "bridge_address",
    "bscBridgeAddress",
    "bsc_bridge_address",
    "evmBridgeAddress",
    "evm_bridge_address",
  ]),
  tokenAddress: Object.freeze([
    "tokenAddress",
    "token_address",
    "bscTokenAddress",
    "bsc_token_address",
    "evmTokenAddress",
    "evm_token_address",
  ]),
  sourceBridgeAddress: Object.freeze([
    "sourceBridgeAddress",
    "source_bridge_address",
    "sccpBscSourceBridgeAddress",
    "sccp_bsc_source_bridge_address",
    "bscSourceBridgeAddress",
    "bsc_source_bridge_address",
    "evmSourceBridgeAddress",
    "evm_source_bridge_address",
    "sccpTronSourceBridgeAddress",
    "sccp_tron_source_bridge_address",
    "tronSourceBridgeAddress",
    "tron_source_bridge_address",
  ]),
  verifierAddress: Object.freeze([
    "verifierAddress",
    "verifier_address",
    "bscVerifierAddress",
    "bsc_verifier_address",
    "destinationVerifierAddress",
    "destination_verifier_address",
    "sccpBscDestinationVerifierAddress",
    "sccp_bsc_destination_verifier_address",
    "evmVerifierAddress",
    "evm_verifier_address",
    "sccpTronDestinationVerifierAddress",
    "sccp_tron_destination_verifier_address",
    "tronVerifierAddress",
    "tron_verifier_address",
  ]),
  networkIdHex: Object.freeze(["networkIdHex", "network_id_hex"]),
  verifierCodeHash: Object.freeze([
    "verifierCodeHash",
    "verifier_code_hash",
    "verifierCodeHashHex",
    "verifier_code_hash_hex",
  ]),
  verifierKeyHash: Object.freeze([
    "verifierKeyHash",
    "verifier_key_hash",
    "verifierKeyHashHex",
    "verifier_key_hash_hex",
  ]),
  proofArtifactHash: Object.freeze([
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
  ]),
  provingKeyHash: Object.freeze(["provingKeyHash", "proving_key_hash"]),
  nativeEvmProverBundleHash: Object.freeze([
    "nativeEvmProverBundleHash",
    "native_evm_prover_bundle_hash",
  ]),
  destinationBindingHash: Object.freeze([
    "destinationBindingHash",
    "destination_binding_hash",
  ]),
  settlementAssetDefinitionId: Object.freeze([
    "settlementAssetDefinitionId",
    "settlement_asset_definition_id",
  ]),
});

const FORBIDDEN_BSC_DEPLOYMENT_ALIASES = Object.freeze({
  sourceBridgeAddress: Object.freeze([
    "sccpTronSourceBridgeAddress",
    "sccp_tron_source_bridge_address",
    "tronSourceBridgeAddress",
    "tron_source_bridge_address",
  ]),
  verifierAddress: Object.freeze([
    "sccpTronDestinationVerifierAddress",
    "sccp_tron_destination_verifier_address",
    "tronVerifierAddress",
    "tron_verifier_address",
  ]),
});
const FORBIDDEN_BSC_SANITIZED_STANZA_ALIASES = Object.freeze(
  new Set(Object.values(FORBIDDEN_BSC_DEPLOYMENT_ALIASES).flat()),
);

const PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS = Object.freeze([
  "sourceBridgeConfigHash",
  "sourceEventTransactionId",
  "sourceEventExplorerUrl",
  "routeCanaryEvidenceHash",
  "routeCanaryTransactionId",
  "routeCanaryExplorerUrl",
  "offlineFullTomlSha256",
]);

const PUBLIC_POST_DEPLOY_EVIDENCE_ALIASES = Object.freeze({
  fullTomlReady: Object.freeze([
    "fullTomlReady",
    "full_toml_ready",
    "postDeployFullTomlReady",
    "post_deploy_full_toml_ready",
  ]),
  sourceBridgeConfigHash: Object.freeze([
    "sourceBridgeConfigHash",
    "source_bridge_config_hash",
    "postDeploySourceBridgeConfigHash",
    "post_deploy_source_bridge_config_hash",
  ]),
  sourceEventTransactionId: Object.freeze([
    "sourceEventTransactionId",
    "source_event_transaction_id",
    "postDeploySourceEventTransactionId",
    "post_deploy_source_event_transaction_id",
  ]),
  sourceEventExplorerUrl: Object.freeze([
    "sourceEventExplorerUrl",
    "source_event_explorer_url",
    "sourceEventTransactionUrl",
    "source_event_transaction_url",
    "postDeploySourceEventExplorerUrl",
    "post_deploy_source_event_explorer_url",
    "postDeploySourceEventTransactionUrl",
    "post_deploy_source_event_transaction_url",
  ]),
  routeCanaryEvidenceHash: Object.freeze([
    "routeCanaryEvidenceHash",
    "route_canary_evidence_hash",
    "postDeployRouteCanaryEvidenceHash",
    "post_deploy_route_canary_evidence_hash",
  ]),
  routeCanaryTransactionId: Object.freeze([
    "routeCanaryTransactionId",
    "route_canary_transaction_id",
    "postDeployRouteCanaryTransactionId",
    "post_deploy_route_canary_transaction_id",
  ]),
  routeCanaryExplorerUrl: Object.freeze([
    "routeCanaryExplorerUrl",
    "route_canary_explorer_url",
    "routeCanaryTransactionUrl",
    "route_canary_transaction_url",
    "postDeployRouteCanaryExplorerUrl",
    "post_deploy_route_canary_explorer_url",
    "postDeployRouteCanaryTransactionUrl",
    "post_deploy_route_canary_transaction_url",
  ]),
  offlineFullTomlSha256: Object.freeze([
    "offlineFullTomlSha256",
    "offline_full_toml_sha256",
    "postDeployOfflineFullTomlSha256",
    "post_deploy_offline_full_toml_sha256",
  ]),
});

const publicAliasFieldSet = (...sources) =>
  new Set(
    sources.flatMap((source) =>
      Array.isArray(source) ? source : Object.values(source).flat(),
    ),
  );

const PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES = publicAliasFieldSet(
  PUBLIC_ROUTE_IDENTITY_FIELDS,
  PUBLIC_ROUTE_IDENTITY_ALIASES,
);
const PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES = publicAliasFieldSet(
  PUBLIC_BSC_PROFILE_FIELDS,
  PUBLIC_BSC_PROFILE_ALIASES,
);
const PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES = publicAliasFieldSet(
  PUBLIC_DEPLOYMENT_FIELDS,
  PUBLIC_DEPLOYMENT_ALIASES,
);
const PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES = publicAliasFieldSet(
  ["fullTomlReady", ...PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS],
  PUBLIC_POST_DEPLOY_EVIDENCE_ALIASES,
);

const REQUIRED_MATERIAL_INVENTORY_CHECK_IDS = Object.freeze([
  "material-scan-complete",
  "scan-root-availability",
  "artifact-secret-and-diagnostic-scan",
  "production-requirements-artifact",
  "deployment-evidence-artifact",
  "production-route-artifact",
  "offline-full-toml-evidence-artifact",
  "production-burn-record-material",
  "production-verifier-material",
  "source-parity-attestation",
  "native-evm-prover-bundle",
  "production-proof-files",
  "destination-browser-prover",
  "source-browser-prover",
  "runtime-prover-config",
  "route-report-binding",
  "material-inventory-runbook-contract",
]);
const REQUIRED_BSC_PRODUCTION_REQUIREMENTS_INPUT_COUNT = 41;

const REQUIRED_MATERIAL_ROUTE_HASH_FIELDS = Object.freeze([
  "verifierCodeHash",
  "verifierKeyHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
]);
const NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS = Object.freeze([
  "verifierKeyHash",
  "verifierKeyArtifactHash",
  "proofArtifactHash",
  "provingKeyHash",
  "groth16ProofSelfTestHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
]);

const PUBLIC_PROOF_LINK_LABELS = Object.freeze({
  tairaSourceTx: "TAIRA source transaction",
  bscFinalizeTx: "BSC finalize transaction",
  bscBurnTx: "BSC burn transaction",
  tairaSettlementTx: "TAIRA settlement transaction",
});

const PUBLIC_PROOF_LINK_SLOTS_BY_LABEL = new Map(
  Object.entries(PUBLIC_PROOF_LINK_LABELS).map(([slot, label]) => [
    label,
    slot,
  ]),
);

const VIDEO_MISSING_EVIDENCE_FIELDS = Object.freeze([
  "transactionSlots",
  "explorerScreenshotSlots",
  "duplicateTransactionSlots",
  "duplicateExplorerScreenshotSlots",
  "invalidExplorerScreenshotSlots",
  "unexpectedExplorerScreenshotKinds",
  "readiness",
  "videoArtifacts",
  "videoTimeline",
]);

const VIDEO_NESTED_PROOF_EVIDENCE_FIELDS = Object.freeze([
  "missingTransactionSlots",
  "missingExplorerScreenshotSlots",
  "duplicateTransactionSlots",
  "duplicateExplorerScreenshotSlots",
  "invalidExplorerScreenshotSlots",
  "unexpectedExplorerScreenshotKinds",
]);

const VIDEO_TRANSCRIPT_FIELDS = Object.freeze(
  new Set([
    "schema",
    "proofFilesReverified",
    "startedAtMs",
    "endedAtMs",
    "durationMs",
    "outputDir",
    "proofComplete",
    "preflightReady",
    "smokeReadinessReady",
    "bsc",
    "readinessBinding",
    "flowOrder",
    "expectedEvidence",
    "transactions",
    "transactionLinks",
    "explorerScreenshots",
    "videoArtifacts",
    "evidence",
    "operatorNotes",
    "missingEvidence",
  ]),
);
const VIDEO_READINESS_BINDING_FIELDS = Object.freeze(
  new Set([
    "checkedAt",
    "routeReady",
    "smokeReadinessReady",
    "checks",
    "route",
    "peerAudit",
  ]),
);
const VIDEO_READINESS_BINDING_ROUTE_FIELDS = Object.freeze(
  new Set([
    "manifestSource",
    "bsc",
    "deployment",
    "postDeployLiveEvidence",
    "nextActions",
    "missingProductionInputs",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
  ]),
);
const VIDEO_READINESS_BINDING_PEER_AUDIT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "peerCount",
    "manifestFingerprint",
    "sanitizedStanzaFilesChecked",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
  ]),
);
const VIDEO_TRANSACTION_FIELDS = Object.freeze(
  new Set(REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS),
);
const VIDEO_TRANSACTION_LINK_FIELDS = Object.freeze(new Set(["label", "href"]));
const VIDEO_EXPLORER_SCREENSHOT_FIELDS = Object.freeze(
  new Set([
    "kind",
    "label",
    "href",
    "finalHref",
    "transactionHash",
    "contentLength",
    "relativePath",
    "sizeBytes",
    "sha256",
    "mediaType",
    "status",
    "fileVerified",
    "fileReverified",
    "fileVerificationError",
    "error",
  ]),
);
const VIDEO_ARTIFACT_FIELDS = Object.freeze(
  new Set([
    "relativePath",
    "sizeBytes",
    "sha256",
    "mediaType",
    "status",
    "fileVerified",
    "fileReverified",
    "fileVerificationError",
    "error",
  ]),
);
const VIDEO_EVIDENCE_FIELDS = Object.freeze(
  new Set([
    "proofComplete",
    ...VIDEO_NESTED_PROOF_EVIDENCE_FIELDS,
    "readinessEvidence",
    "postDeployTransactionEvidence",
    "videoArtifactEvidence",
    "timelineEvidence",
  ]),
);
const VIDEO_READINESS_EVIDENCE_FIELDS = Object.freeze(
  new Set(["ready", "missingReadinessEvidence"]),
);
const VIDEO_POST_DEPLOY_TRANSACTION_EVIDENCE_FIELDS = Object.freeze(
  new Set([
    "ready",
    "reusedPostDeployTransactionSlots",
    "reusedPostDeployTransactions",
  ]),
);
const VIDEO_POST_DEPLOY_REUSED_TRANSACTION_FIELDS = Object.freeze(
  new Set(["slot", "postDeployField"]),
);
const VIDEO_ARTIFACT_EVIDENCE_FIELDS = Object.freeze(
  new Set(["ready", "missingVideoArtifacts", "capturedArtifacts"]),
);
const VIDEO_CAPTURED_ARTIFACT_FIELDS = Object.freeze(
  new Set(["relativePath", "sizeBytes", "sha256", "mediaType"]),
);
const VIDEO_TIMELINE_EVIDENCE_FIELDS = Object.freeze(
  new Set(["ready", "durationMs", "missingVideoTimeline"]),
);

const REQUIRED_SMOKE_READINESS_CHECK_IDS = Object.freeze([
  "route-preflight",
  "peer-config-audit",
  "walletconnect-project-id",
  "runtime-prover-config",
  "destination-prover-module",
  "destination-prover-manifest",
  "source-prover-module",
  "source-prover-manifest",
  "smoke-readiness-runbook-contract",
]);

const REQUIRED_PEER_AUDIT_CHECK_IDS = Object.freeze([
  "peer-config-files",
  "peer-route-count",
  "peer-route-consistency",
  "peer-route-production-readiness",
  "peer-route-burn-record-material",
  "peer-route-hash-role-separation",
  "peer-audit-runbook-contract",
]);

const ROUTE_PREFLIGHT_REPORT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "generatedAt",
    "generatedAtMs",
    "loadError",
    "manifestSource",
    "toriiUrl",
    "endpoint",
    "taira",
    "bsc",
    "deployment",
    "postDeployLiveEvidence",
    "bscContractReadback",
    "checks",
    "errors",
    "warnings",
    "nextActions",
    "missingProductionInputs",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
  ]),
);
const ROUTE_PREFLIGHT_TAIRA_FIELDS = Object.freeze(
  new Set(["chainId", "networkPrefix"]),
);
const ROUTE_PREFLIGHT_ERROR_FIELDS = Object.freeze(
  new Set(["chainMetadata", "capabilities", "manifests", "bscContracts"]),
);
const ROUTE_PREFLIGHT_BSC_READBACK_FIELDS = Object.freeze(
  new Set([
    "endpoint",
    "chainIdHex",
    "codePresent",
    "tokenAddress",
    "bridgeAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "tokenBridgeAddress",
    "tokenBridgeLocked",
    "sourceBridgeOwner",
    "bridgeDestinationBindingHash",
    "bridgeVerifierAddress",
    "bridgeVerifierCodeHash",
    "bridgeVerifierKeyHash",
    "verifierKeyHash",
    "bridgeNetworkId",
    "bridgeSourceDomain",
    "bridgeTargetDomain",
  ]),
);
const ROUTE_PREFLIGHT_BSC_CODE_PRESENT_FIELDS = Object.freeze(
  new Set(["token", "bridge", "sourceBridge", "verifier"]),
);

const SMOKE_READINESS_REPORT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "checkedAt",
    "routeReady",
    "checks",
    "reasons",
    "nextSteps",
    "nextActions",
    "missingProductionInputs",
    "route",
    "peerAudit",
    "provers",
  ]),
);
const PUBLIC_NEXT_ACTION_FIELDS = Object.freeze(
  new Set([
    "id",
    "title",
    "detail",
    "requiredInputs",
    "blockedByChecks",
    "commands",
  ]),
);
const PUBLIC_REQUIRED_INPUT_FIELDS = Object.freeze(
  new Set(["id", "kind", "placeholder", "description", "blockedByActions"]),
);
const SMOKE_READINESS_CHECK_FIELDS = Object.freeze(
  new Set([
    ...PUBLIC_CHECK_ID_ALIASES,
    "label",
    "status",
    "ok",
    "message",
    "detail",
  ]),
);
const SMOKE_READINESS_ROUTE_FIELDS = Object.freeze(
  new Set([
    "endpoint",
    "manifestSource",
    "taira",
    "bsc",
    "deployment",
    "postDeployLiveEvidence",
    "nextActions",
    "missingProductionInputs",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
  ]),
);
const SMOKE_READINESS_TAIRA_FIELDS = Object.freeze(
  new Set(["chainId", "networkPrefix"]),
);
const SMOKE_READINESS_PEER_AUDIT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "generatedAt",
    "generatedAtMs",
    "expectedPeers",
    "peerCount",
    "manifestFingerprint",
    "sanitizedStanzaFilesChecked",
    "checks",
    "peers",
    "nextActions",
    "missingProductionInputs",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
  ]),
);
const PEER_AUDIT_REPORT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "generatedAt",
    "generatedAtMs",
    "loadError",
    "bscNetwork",
    "bsc",
    ...SMOKE_READINESS_PEER_AUDIT_FIELDS,
  ]),
);
const SMOKE_READINESS_PEER_FIELDS = Object.freeze(
  new Set([
    "source",
    "routeCount",
    "rawTomlSha256",
    "sanitizedStanzaSha256",
    "sanitizedStanzaSource",
    "sanitizedStanzaFileChecked",
    "sanitizedStanzaFileVerified",
    "sanitizedStanzaFileVerificationError",
    "sanitizedStanzaFileSha256",
    "manifestFingerprint",
    "productionReady",
    "ready",
    "deployment",
    "postDeployLiveEvidence",
    "hashRoleProblems",
    "burnRecordMaterialProblems",
    "failedChecks",
  ]),
);
const SMOKE_READINESS_PROVERS_FIELDS = Object.freeze(
  new Set(["destination", "source", "runtimeConfig"]),
);
const SMOKE_READINESS_PROVER_FIELDS = Object.freeze(
  new Set(["moduleUrl", "manifestUrl", "manifest"]),
);
const SMOKE_READINESS_PROVER_MANIFEST_FIELDS = Object.freeze(
  new Set([
    "schema",
    "moduleUrl",
    "direction",
    "kind",
    "exports",
    "acceptedExport",
    "acceptedSelfTestExport",
    "tairaChainId",
    "tairaNetworkPrefix",
    "moduleSha256",
    "deployment",
    "postDeployLiveEvidence",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
    ...PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
    ...PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
  ]),
);
const SMOKE_READINESS_RUNTIME_CONFIG_FIELDS = Object.freeze(
  new Set(["required", "configUrl", "configSha256", "manifest"]),
);

const REQUIRED_ROUTE_PREFLIGHT_COMMON_CHECK_IDS = Object.freeze([
  "taira-network",
  "sccp-submit-paths",
  "bsc-route-manifest",
  "bsc-route-manifest-unique",
  "bsc-manifest-secret-scan",
  "bsc-record-aliases",
  "bsc-route-identity",
  "bsc-production-ready",
  "bsc-production-disabled-conflict",
  "bsc-production-placeholder-scan",
  "bsc-domain",
  "bsc-codec",
  "bsc-explorer-binding",
  "bsc-bridge-address",
  "bsc-token-address",
  "bsc-sourceBridge-address",
  "bsc-verifier-address",
  "bsc-contract-addresses-distinct",
  "bsc-verifierCodeHash",
  "bsc-verifierKeyHash",
  "bsc-destinationBindingHash",
  "bsc-destination-binding",
  "bsc-production-verifier-material",
  "bsc-production-prover-material",
  "bsc-native-evm-prover-bundle",
  "bsc-post-deploy-live-evidence",
  "taira-burn-record-material",
  "bsc-rpc-chain-id-readback",
  "bsc-token-code-readback",
  "bsc-bridge-code-readback",
  "bsc-sourceBridge-code-readback",
  "bsc-verifier-code-readback",
  "bsc-token-target-readback",
  "bsc-bridge-target-readback",
  "bsc-sourceBridge-target-readback",
  "bsc-verifier-target-readback",
  "bsc-token-bridge-readback",
  "bsc-token-lock-readback",
  "bsc-source-owner-readback",
  "bsc-bridge-binding-readback",
  "bsc-bridge-verifier-address-readback",
  "bsc-bridge-verifier-code-hash-readback",
  "bsc-bridge-verifier-key-hash-readback",
  "bsc-verifier-key-hash-readback",
  "bsc-bridge-network-readback",
  "bsc-bridge-domain-readback",
  "bsc-contract-readback",
  "bsc-preflight-runbook-contract",
]);

const SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const REDACTED_SECRET_DETAIL = "[redacted secret-like detail]";
const REDACTED_UNSUPPORTED_FIELD = "[redacted unsupported field]";
const MAX_FAILURE_SUMMARY_LENGTH = 280;
const MAX_FAILURE_SUMMARIES = 8;
const DIAGNOSTIC_TEXT_KEYS = new Set([
  "detail",
  "details",
  "disabledReason",
  "disabled_reason",
  "message",
  "messages",
  "note",
  "notes",
  "operatorWarning",
  "operator_warning",
  "warning",
  "warnings",
]);
const DIAGNOSTIC_FLAG_KEYS = new Set([
  "diagnostic",
  "diagnosticVerifier",
  "diagnostic_verifier",
  "diagnosticVerifierMaterial",
  "diagnostic_verifier_material",
]);
const UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN =
  /(?:verifier[_-]?material|verifier[_-]?key[_-]?hash|bridge[_-]?verifier[_-]?key[_-]?hash|configured[_-]?verifier[_-]?key[_-]?hash|prover[_-]?material|proof[_-]?material|groth|alpha1|beta2|gamma2|delta2|vk_|vk[_-]?hash|private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const publicUnsupportedFieldName = (key) =>
  UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN.test(key)
    ? REDACTED_UNSUPPORTED_FIELD
    : key;

const trim = (value) => String(value ?? "").trim();
const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const ownJsonValue = (value, seen = new WeakMap()) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }
    const out = new Array(value.length);
    seen.set(value, out);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      out[index] =
        descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? ownJsonValue(descriptor.value, seen)
          : undefined;
    }
    return out;
  }
  if (!isRecord(value)) {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  const out = Object.create(null);
  seen.set(value, out);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      descriptor.enumerable &&
      Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      out[key] = ownJsonValue(descriptor.value, seen);
    }
  }
  const reverifiedFiles = Object.getOwnPropertyDescriptor(
    value,
    REVERIFIED_VIDEO_PROOF_FILES,
  );
  if (
    reverifiedFiles &&
    Object.prototype.hasOwnProperty.call(reverifiedFiles, "value") &&
    reverifiedFiles.value === true
  ) {
    Object.defineProperty(out, REVERIFIED_VIDEO_PROOF_FILES, {
      value: true,
      enumerable: false,
    });
  }
  const outputDirBinding = Object.getOwnPropertyDescriptor(
    value,
    REVERIFIED_VIDEO_PROOF_OUTPUT_DIR_BINDING,
  );
  if (
    outputDirBinding &&
    Object.prototype.hasOwnProperty.call(outputDirBinding, "value") &&
    isRecord(outputDirBinding.value)
  ) {
    Object.defineProperty(out, REVERIFIED_VIDEO_PROOF_OUTPUT_DIR_BINDING, {
      value: ownJsonValue(outputDirBinding.value, seen),
      enumerable: false,
    });
  }
  return out;
};
const ownJsonRecord = (value) => (isRecord(value) ? ownJsonValue(value) : null);
const readOwnValue = (record, key) => {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
};
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ownArrayIndexedValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => JSON_ARRAY_INDEX_PATTERN.test(key))
    .map((key) => [Number(key), Object.getOwnPropertyDescriptor(value, key)])
    .filter(
      ([index, descriptor]) =>
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < value.length &&
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, "value"),
    )
    .sort(([left], [right]) => left - right)
    .map(([index, descriptor]) => [index, descriptor.value]);
};
const ownArrayValues = (value) =>
  ownArrayIndexedValues(value).map(([, entry]) => entry);
const ownRecordEntries = (record) =>
  isRecord(record)
    ? Object.keys(record).map((key) => [key, readOwnValue(record, key)])
    : [];
const parseBoolean = (value, label = "boolean option") => {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  throw new Error(`${label} must be true or false.`);
};
const readString = (record, key) => {
  const value = readOwnValue(record, key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};
const readSingleStringAlias = (record, label, ...keys) => {
  const present = keys
    .map((key) => ({ key, value: readString(record, key) }))
    .filter(({ value }) => Boolean(value));
  return {
    value: present[0]?.value ?? null,
    problems:
      present.length > 1
        ? [
            `${label} must not use multiple aliases: ${present.map(({ key }) => key).join(", ")}.`,
          ]
        : [],
  };
};
const readBoolean = (record, key) => readOwnValue(record, key) === true;
const readNumber = (record, key) =>
  typeof readOwnValue(record, key) === "number"
    ? readOwnValue(record, key)
    : null;
const readRecord = (record, key) => {
  const value = readOwnValue(record, key);
  return isRecord(value) ? value : null;
};
const readArray = (record, key) => {
  const value = readOwnValue(record, key);
  return Array.isArray(value) ? ownArrayValues(value) : null;
};
const readOwnArrayValues = (record, key) => {
  return readArray(record, key);
};
const presentStringAliases = (record, aliases) =>
  aliases.filter((alias) => Boolean(readString(record, alias)));
const normalizeHex = (value) => trim(value).toLowerCase();
const hasDecodedParentSegment = (value) => {
  let normalized = String(value ?? "").replace(/\\/gu, "/");
  for (let depth = 0; depth < 8; depth += 1) {
    if (/(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
      return true;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/gu, "/");
    } catch (_error) {
      return true;
    }
    if (decoded === normalized) {
      return false;
    }
    normalized = decoded;
  }
  return true;
};
const proofArtifactRelativePathIsSafe = (value, extensionPattern) => {
  const source = trim(value);
  if (!source || source.includes("\0")) {
    return false;
  }
  if (
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    hasDecodedParentSegment(source)
  ) {
    return false;
  }
  const normalized = source.replace(/\\/gu, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return false;
  }
  return extensionPattern.test(normalized);
};

const videoProofOutputDirIsSafe = (value) => {
  const source = trim(value);
  if (!source || source.includes("\0")) {
    return false;
  }
  if (source === "external-proof-output") {
    return true;
  }
  if (
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    hasDecodedParentSegment(source)
  ) {
    return false;
  }
  const normalized = source.replace(/\\/gu, "/");
  const parts = normalized.split("/");
  return (
    normalized.length <= 240 &&
    /^[A-Za-z0-9._/-]+$/u.test(normalized) &&
    parts.length > 1 &&
    parts.every((part) => part && part !== "." && part !== "..")
  );
};

const normalizedProofArtifactRelativePath = (value) =>
  trim(value).replace(/\\/gu, "/");

const bytesStartWith = (bytes, signature) =>
  bytes.length >= signature.length &&
  signature.every((byte, index) => bytes[index] === byte);

const bytesSequenceIndex = (bytes, sequence, searchLimit = bytes.length) => {
  const limit = Math.min(bytes.length, searchLimit);
  if (sequence.length === 0 || limit < sequence.length) {
    return -1;
  }
  for (let index = 0; index <= limit - sequence.length; index += 1) {
    if (sequence.every((byte, offset) => bytes[index + offset] === byte)) {
      return index;
    }
  }
  return -1;
};

const readEbmlVint = (bytes, offset) => {
  const first = bytes[offset];
  if (typeof first !== "number" || first === 0) {
    return null;
  }
  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) {
    return null;
  }
  let value = first & (marker - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
    if (!Number.isSafeInteger(value)) {
      return null;
    }
  }
  return { length, value };
};

const webmElementIndexAfter = (bytes, elementId, start, searchLimit) => {
  const limit = Math.min(bytes.length, searchLimit);
  let offset = Math.max(0, start);
  while (offset < limit) {
    const relativeIndex = bytesSequenceIndex(
      bytes.subarray(offset, limit),
      elementId,
    );
    if (relativeIndex === -1) {
      return -1;
    }
    const index = offset + relativeIndex;
    const size = readEbmlVint(bytes, index + elementId.length);
    if (
      size &&
      index + elementId.length + size.length <= bytes.length &&
      index + elementId.length + size.length <= limit
    ) {
      return index;
    }
    offset = index + 1;
  }
  return -1;
};

const webmElementPayloadSizeAfter = (bytes, elementId, start, searchLimit) => {
  const index = webmElementIndexAfter(bytes, elementId, start, searchLimit);
  if (index === -1) {
    return null;
  }
  const size = readEbmlVint(bytes, index + elementId.length);
  if (!size) {
    return null;
  }
  const payloadStart = index + elementId.length + size.length;
  const payloadEnd = payloadStart + size.value;
  if (
    !Number.isSafeInteger(payloadEnd) ||
    payloadStart > bytes.length ||
    payloadEnd > bytes.length ||
    payloadEnd > searchLimit
  ) {
    return null;
  }
  return size.value;
};

const bytesMatchAt = (bytes, offset, sequence) =>
  offset >= 0 &&
  offset + sequence.length <= bytes.length &&
  sequence.every((byte, index) => bytes[offset + index] === byte);

const PNG_CRC32_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_entry, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  }),
);

const pngCrc32 = (bytes, start, end) => {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = PNG_CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readPngChunkLength = (bytes, offset) => {
  if (offset + 4 > bytes.length) {
    return null;
  }
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
};

const readPngChunkType = (bytes, offset) => {
  if (offset + 8 > bytes.length) {
    return "";
  }
  return String.fromCharCode(
    bytes[offset + 4],
    bytes[offset + 5],
    bytes[offset + 6],
    bytes[offset + 7],
  );
};

const isPngChunkType = (type) => /^[A-Za-z]{4}$/u.test(type);

const PNG_SAMPLES_PER_PIXEL = Object.freeze({
  0: 1,
  2: 3,
  3: 1,
  4: 2,
  6: 4,
});

const PNG_VALID_BIT_DEPTHS = Object.freeze({
  0: new Set([1, 2, 4, 8, 16]),
  2: new Set([8, 16]),
  3: new Set([1, 2, 4, 8]),
  4: new Set([8, 16]),
  6: new Set([8, 16]),
});

const pngExpectedImageBytes = ({ width, height, bitDepth, colorType }) => {
  const samplesPerPixel = PNG_SAMPLES_PER_PIXEL[colorType];
  const validBitDepths = PNG_VALID_BIT_DEPTHS[colorType];
  if (!samplesPerPixel || !validBitDepths?.has(bitDepth)) {
    return null;
  }
  const rowBits = width * samplesPerPixel * bitDepth;
  const rowBytes = Math.ceil(rowBits / 8);
  const expectedBytes = height * (rowBytes + 1);
  if (
    !Number.isSafeInteger(rowBytes) ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > MAX_SCREENSHOT_DECOMPRESSED_BYTES
  ) {
    return null;
  }
  return { rowBytes, expectedBytes };
};

const pngImageByteDiversity = (imageBytes, { height, rowBytes }) => {
  const counts = new Uint32Array(256);
  let total = 0;
  let unique = 0;
  let dominant = 0;
  const stride = rowBytes + 1;
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * stride + 1;
    const rowEnd = rowStart + rowBytes;
    for (let offset = rowStart; offset < rowEnd; offset += 1) {
      const byte = imageBytes[offset];
      counts[byte] += 1;
      total += 1;
      if (counts[byte] === 1) {
        unique += 1;
      }
      if (counts[byte] > dominant) {
        dominant = counts[byte];
      }
    }
  }
  const dominantFraction = total > 0 ? dominant / total : 1;
  return {
    imageUniqueBytes: unique,
    imageDominantByteFraction: dominantFraction,
    imageHasByteDiversity:
      unique >= MIN_SCREENSHOT_IMAGE_UNIQUE_BYTES &&
      dominantFraction <= MAX_SCREENSHOT_DOMINANT_PIXEL_BYTE_FRACTION,
  };
};

const readPngProofArtifactDimensions = (bytes) => {
  if (!bytesStartWith(bytes, PNG_SIGNATURE)) {
    return null;
  }
  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  const idatChunks = [];
  let dimensions = null;
  while (offset + 12 <= bytes.length) {
    const length = readPngChunkLength(bytes, offset);
    const type = readPngChunkType(bytes, offset);
    if (length === null || !isPngChunkType(type)) {
      return null;
    }
    if (chunkIndex === 0 && (type !== PNG_IHDR_CHUNK_TYPE || length !== 13)) {
      return null;
    }
    if (chunkIndex === 0) {
      const dataOffset = offset + 8;
      const width = readPngChunkLength(bytes, offset + 8);
      const height = readPngChunkLength(bytes, offset + 12);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const compressionMethod = bytes[dataOffset + 10];
      const filterMethod = bytes[dataOffset + 11];
      const interlaceMethod = bytes[dataOffset + 12];
      if (!width || !height) {
        return null;
      }
      if (
        compressionMethod !== 0 ||
        filterMethod !== 0 ||
        interlaceMethod !== 0
      ) {
        return null;
      }
      const imageBytes = pngExpectedImageBytes({
        width,
        height,
        bitDepth,
        colorType,
      });
      if (!imageBytes) {
        return null;
      }
      dimensions = {
        width,
        height,
        bitDepth,
        colorType,
        rowBytes: imageBytes.rowBytes,
        expectedBytes: imageBytes.expectedBytes,
      };
    }
    const nextOffset = offset + 8 + length + 4;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) {
      return null;
    }
    const expectedCrc = readPngChunkLength(bytes, offset + 8 + length);
    const actualCrc = pngCrc32(bytes, offset + 4, offset + 8 + length);
    if (expectedCrc === null || expectedCrc !== actualCrc) {
      return null;
    }
    if (type === PNG_IDAT_CHUNK_TYPE) {
      idatChunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    if (type === PNG_IEND_CHUNK_TYPE) {
      if (
        length !== 0 ||
        idatChunks.length === 0 ||
        nextOffset !== bytes.length ||
        !dimensions
      ) {
        return null;
      }
      let imageBytes;
      try {
        imageBytes = inflateSync(Buffer.concat(idatChunks), {
          maxOutputLength: dimensions.expectedBytes + 1,
        });
      } catch (_error) {
        return null;
      }
      if (imageBytes.length !== dimensions.expectedBytes) {
        return null;
      }
      const stride = dimensions.rowBytes + 1;
      for (let row = 0; row < dimensions.height; row += 1) {
        const filterType = imageBytes[row * stride];
        if (filterType > 4) {
          return null;
        }
      }
      return {
        ...dimensions,
        ...pngImageByteDiversity(imageBytes, dimensions),
      };
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return null;
};

const isPngProofArtifact = (bytes) =>
  Boolean(readPngProofArtifactDimensions(bytes));

const pngScreenshotDimensionError = (bytes) => {
  const dimensions = readPngProofArtifactDimensions(bytes);
  if (!dimensions) {
    return "expected image/png media, got unknown";
  }
  if (
    dimensions.width < MIN_SCREENSHOT_WIDTH ||
    dimensions.height < MIN_SCREENSHOT_HEIGHT
  ) {
    return `expected image/png media with at least ${MIN_SCREENSHOT_WIDTH}x${MIN_SCREENSHOT_HEIGHT} pixels, got ${dimensions.width}x${dimensions.height}`;
  }
  if (dimensions.imageHasByteDiversity !== true) {
    return `expected image/png screenshot with non-trivial pixel variation, got ${dimensions.imageUniqueBytes} unique pixel byte values`;
  }
  return "";
};

const hasWebmDocTypeElement = (bytes) => {
  const docTypeOffset = bytesSequenceIndex(
    bytes,
    WEBM_DOCTYPE_ELEMENT_ID,
    WEBM_HEADER_SCAN_BYTES,
  );
  if (docTypeOffset === -1) {
    return false;
  }
  const size = readEbmlVint(
    bytes,
    docTypeOffset + WEBM_DOCTYPE_ELEMENT_ID.length,
  );
  if (!size || size.value !== WEBM_DOCTYPE_BYTES.length) {
    return false;
  }
  return bytesMatchAt(
    bytes,
    docTypeOffset + WEBM_DOCTYPE_ELEMENT_ID.length + size.length,
    WEBM_DOCTYPE_BYTES,
  );
};

const hasWebmMediaStructure = (bytes) => {
  const segmentOffset = webmElementIndexAfter(
    bytes,
    WEBM_SEGMENT_ELEMENT_ID,
    0,
    WEBM_HEADER_SCAN_BYTES,
  );
  if (segmentOffset === -1) {
    return false;
  }
  const scanLimit = Math.min(bytes.length, WEBM_CONTAINER_SCAN_BYTES);
  const infoOffset = webmElementIndexAfter(
    bytes,
    WEBM_INFO_ELEMENT_ID,
    segmentOffset + WEBM_SEGMENT_ELEMENT_ID.length,
    scanLimit,
  );
  if (infoOffset === -1) {
    return false;
  }
  const tracksOffset = webmElementIndexAfter(
    bytes,
    WEBM_TRACKS_ELEMENT_ID,
    infoOffset + WEBM_INFO_ELEMENT_ID.length,
    scanLimit,
  );
  if (tracksOffset === -1) {
    return false;
  }
  const clusterOffset = webmElementIndexAfter(
    bytes,
    WEBM_CLUSTER_ELEMENT_ID,
    tracksOffset + WEBM_TRACKS_ELEMENT_ID.length,
    scanLimit,
  );
  if (clusterOffset === -1) {
    return false;
  }
  const blockStart = clusterOffset + WEBM_CLUSTER_ELEMENT_ID.length;
  const simpleBlockPayloadSize = webmElementPayloadSizeAfter(
    bytes,
    WEBM_SIMPLE_BLOCK_ELEMENT_ID,
    blockStart,
    scanLimit,
  );
  const blockGroupPayloadSize = webmElementPayloadSizeAfter(
    bytes,
    WEBM_BLOCK_GROUP_ELEMENT_ID,
    blockStart,
    scanLimit,
  );
  return (
    (simpleBlockPayloadSize !== null &&
      simpleBlockPayloadSize >= MIN_WEBM_FRAME_PAYLOAD_BYTES) ||
    (blockGroupPayloadSize !== null &&
      blockGroupPayloadSize >= MIN_WEBM_FRAME_PAYLOAD_BYTES)
  );
};

const hasWebmRecordedByteDiversity = (bytes) => {
  const counts = new Uint32Array(256);
  let dominant = 0;
  let unique = 0;
  for (const byte of bytes) {
    counts[byte] += 1;
    if (counts[byte] === 1) {
      unique += 1;
    }
    if (counts[byte] > dominant) {
      dominant = counts[byte];
    }
  }
  return (
    unique >= MIN_WEBM_UNIQUE_BYTES &&
    dominant / bytes.length <= MAX_WEBM_DOMINANT_BYTE_FRACTION
  );
};

const isWebmProofArtifact = (bytes) =>
  bytesStartWith(bytes, WEBM_EBML_SIGNATURE) &&
  hasWebmDocTypeElement(bytes) &&
  hasWebmMediaStructure(bytes) &&
  hasWebmRecordedByteDiversity(bytes);

const detectProofArtifactMediaType = (bytes) => {
  if (!bytes || typeof bytes.length !== "number") {
    return "unknown";
  }
  if (isPngProofArtifact(bytes)) {
    return "image/png";
  }
  if (isWebmProofArtifact(bytes)) {
    return "video/webm";
  }
  return "unknown";
};
const parsePositiveInteger = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Report age limits must be positive safe integers.");
  }
  return parsed;
};
const check = (checks, id, ok, message, detail = "") => {
  const passed = Boolean(ok);
  checks.push({
    id,
    ok: passed,
    message,
    ...(!passed && detail ? { detail } : {}),
  });
};

const presentRouteIdentityAliases = (record, key) =>
  (PUBLIC_ROUTE_IDENTITY_ALIASES[key] ?? [key]).filter((alias) => {
    if (!hasOwn(record, alias)) {
      return false;
    }
    const value = readOwnValue(record, alias);
    if (typeof value === "string") {
      return value.trim() !== "";
    }
    return value !== undefined && value !== null;
  });

const routeIdentityAliasProblems = (record) => {
  if (!isRecord(record)) {
    return [];
  }
  const problems = [];
  for (const key of PUBLIC_ROUTE_IDENTITY_FIELDS) {
    const aliases = presentRouteIdentityAliases(record, key);
    if (aliases.length > 1) {
      problems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
  }
  return problems;
};

const routeIdentityProblemDetails = (record, label) =>
  routeIdentityAliasProblems(record).map((problem) => `${label} ${problem}.`);

const deploymentFieldAliasProblems = (record, fields, label) => {
  if (!isRecord(record)) {
    return [];
  }
  const problems = [];
  const presentAliases = (key) =>
    (PUBLIC_DEPLOYMENT_ALIASES[key] ?? [key]).filter((alias) => {
      if (!hasOwn(record, alias)) {
        return false;
      }
      const value = readOwnValue(record, alias);
      if (typeof value === "string") {
        return value.trim() !== "";
      }
      return value !== undefined && value !== null;
    });
  for (const key of fields) {
    const aliases = presentAliases(key);
    if (aliases.length > 1) {
      problems.push(
        `${label} ${key} uses multiple aliases: ${aliases.join(", ")}.`,
      );
    }
  }
  for (const [key, aliases] of Object.entries(
    FORBIDDEN_BSC_DEPLOYMENT_ALIASES,
  )) {
    if (!fields.includes(key)) {
      continue;
    }
    const present = aliases.filter((alias) =>
      Object.prototype.hasOwnProperty.call(record, alias),
    );
    if (present.length > 0) {
      problems.push(
        `${label} ${key} uses forbidden TRON aliases for BSC evidence: ${present.join(", ")}.`,
      );
    }
  }
  return problems;
};

const publicRouteIdentity = (record) => {
  if (!isRecord(record)) {
    return {
      routeId: null,
      assetKey: null,
    };
  }
  const aliasProblems = routeIdentityAliasProblems(record);
  return {
    routeId: readString(record, "routeId"),
    assetKey: readString(record, "assetKey"),
    ...(aliasProblems.length > 0 ? { aliasProblems } : {}),
  };
};

const publicDeployment = (deployment) => {
  if (!isRecord(deployment)) {
    return null;
  }
  const aliasProblems = [];
  const presentAliases = (key) =>
    (PUBLIC_DEPLOYMENT_ALIASES[key] ?? [key]).filter((alias) => {
      if (!Object.prototype.hasOwnProperty.call(deployment, alias)) {
        return false;
      }
      const value = readOwnValue(deployment, alias);
      if (typeof value === "string") {
        return value.trim() !== "";
      }
      return value !== undefined && value !== null;
    });
  for (const key of PUBLIC_DEPLOYMENT_FIELDS) {
    const aliases = presentAliases(key);
    if (aliases.length > 1) {
      aliasProblems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
  }
  for (const [key, aliases] of Object.entries(
    FORBIDDEN_BSC_DEPLOYMENT_ALIASES,
  )) {
    const present = aliases.filter((alias) =>
      Object.prototype.hasOwnProperty.call(deployment, alias),
    );
    if (present.length > 0) {
      aliasProblems.push(
        `${key} uses forbidden TRON aliases for BSC evidence: ${present.join(", ")}`,
      );
    }
  }
  const readDeploymentString = (key) => {
    for (const alias of PUBLIC_DEPLOYMENT_ALIASES[key] ?? [key]) {
      const value = readString(deployment, alias);
      if (value) {
        return value;
      }
    }
    return null;
  };
  return {
    ...Object.fromEntries(
      PUBLIC_DEPLOYMENT_FIELDS.map((key) => [key, readDeploymentString(key)]),
    ),
    ...(aliasProblems.length > 0 ? { aliasProblems } : {}),
  };
};

const publicPostDeployLiveEvidence = (evidence) => {
  if (!isRecord(evidence)) {
    return null;
  }
  const aliasProblems = [];
  const presentAliases = (key) =>
    (PUBLIC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]).filter((alias) => {
      if (!Object.prototype.hasOwnProperty.call(evidence, alias)) {
        return false;
      }
      const value = readOwnValue(evidence, alias);
      if (typeof value === "string") {
        return value.trim() !== "";
      }
      if (typeof value === "boolean") {
        return true;
      }
      return value !== undefined && value !== null;
    });
  const readEvidenceString = (key) => {
    const aliases = presentAliases(key);
    if (aliases.length > 1) {
      aliasProblems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
    for (const alias of PUBLIC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]) {
      const value = readString(evidence, alias);
      if (value) {
        return value;
      }
    }
    return null;
  };
  const readEvidenceBoolean = (key) => {
    const aliases = presentAliases(key);
    if (aliases.length > 1) {
      aliasProblems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
    return (PUBLIC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]).some(
      (alias) => readOwnValue(evidence, alias) === true,
    );
  };
  return {
    fullTomlReady: readEvidenceBoolean("fullTomlReady"),
    ...Object.fromEntries(
      PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS.map((key) => [
        key,
        readEvidenceString(key),
      ]),
    ),
    ...(aliasProblems.length > 0 ? { aliasProblems } : {}),
  };
};

const presentBscProfileAliases = (bsc, key) =>
  (PUBLIC_BSC_PROFILE_ALIASES[key] ?? [key]).filter((alias) => {
    if (!Object.prototype.hasOwnProperty.call(bsc, alias)) {
      return false;
    }
    const value = readOwnValue(bsc, alias);
    if (typeof value === "string") {
      return value.trim() !== "";
    }
    return value !== undefined && value !== null;
  });

const bscProfileAliasProblems = (bsc) => {
  if (!isRecord(bsc)) {
    return [];
  }
  const problems = [];
  for (const key of PUBLIC_BSC_PROFILE_FIELDS) {
    const aliases = presentBscProfileAliases(bsc, key);
    if (aliases.length > 1) {
      problems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
  }
  return problems;
};

const readBscProfileValue = (bsc, key) => {
  if (!isRecord(bsc)) {
    return null;
  }
  for (const alias of PUBLIC_BSC_PROFILE_ALIASES[key] ?? [key]) {
    const value = readString(bsc, alias);
    if (value) {
      return value;
    }
  }
  return null;
};

const publicBscSummary = (bsc) => {
  if (!isRecord(bsc)) {
    return null;
  }
  const aliasProblems = bscProfileAliasProblems(bsc);
  return {
    network: readBscProfileValue(bsc, "network"),
    chain: readBscProfileValue(bsc, "chain"),
    chainIdHex: readBscProfileValue(bsc, "chainIdHex"),
    networkIdHex: readBscProfileValue(bsc, "networkIdHex"),
    explorerUrl: readBscProfileValue(bsc, "explorerUrl"),
    explorerHost: readBscProfileValue(bsc, "explorerHost"),
    ...(aliasProblems.length > 0 ? { aliasProblems } : {}),
  };
};

const bscProfileBindingProblems = (bsc, label, profile) => {
  if (!isRecord(bsc)) {
    return [`${label} BSC profile binding is missing.`];
  }
  const problems = bscProfileAliasProblems(bsc).map(
    (problem) => `${label} BSC ${problem}.`,
  );
  const checks = [
    ["network", profile.key],
    ["chain", profile.chain],
    ["chainIdHex", profile.chainIdHex],
    ["networkIdHex", profile.networkIdHex],
    ["explorerUrl", profile.explorerUrl],
    ["explorerHost", profile.explorerHost],
  ];
  for (const [key, expected] of checks) {
    const actual = readBscProfileValue(bsc, key);
    if (!actual) {
      problems.push(`${label} BSC ${key} is missing.`);
    } else if (actual.toLowerCase() !== expected.toLowerCase()) {
      problems.push(`${label} BSC ${key} does not match ${profile.label}.`);
    }
  }
  return problems;
};

const bscManifestProfileBindingProblems = (
  manifest,
  label,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  if (!isRecord(manifest)) {
    return [`${label} BSC profile binding is missing.`];
  }
  const problems = bscProfileAliasProblems(manifest).map(
    (problem) => `${label} BSC ${problem}.`,
  );
  for (const [key, expected, description] of [
    ["chainIdHex", profile.chainIdHex, "chain id"],
    ["networkIdHex", profile.networkIdHex, "network id"],
    ["network", profile.key, "network label"],
    ["chain", profile.chain, "chain label"],
  ]) {
    const actual = readBscProfileValue(manifest, key);
    if (!actual || actual.toLowerCase() !== expected.toLowerCase()) {
      problems.push(
        `${label} is not bound to ${profile.label} ${description}.`,
      );
    }
  }
  for (const [key, expected, description] of [
    ["explorerUrl", profile.explorerUrl, "explorer URL"],
    ["explorerHost", profile.explorerHost, "explorer host"],
  ]) {
    const actual = readBscProfileValue(manifest, key);
    if (actual && actual.toLowerCase() !== expected.toLowerCase()) {
      problems.push(`${label} ${description} does not match ${profile.label}.`);
    }
  }
  return problems;
};

const publicCheckSummaries = (checks) =>
  Array.isArray(checks)
    ? checks.filter(isRecord).map((entry) => ({
        id: readString(entry, "id"),
        ok:
          readBoolean(entry, "ok") ||
          trim(readString(entry, "status")) === "pass",
        status:
          trim(readString(entry, "status")) ||
          (readBoolean(entry, "ok") ? "pass" : "fail"),
        message: readString(entry, "message") || readString(entry, "label"),
      }))
    : [];

const publicRoutePreflightRequiredInputSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        kind: safeDiagnosticText(readString(entry, "kind")),
        placeholder: safeDiagnosticText(readString(entry, "placeholder")),
        description: safeDiagnosticText(readString(entry, "description")),
      }))
    : [];

const publicRoutePreflightMissingInputSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        kind: safeDiagnosticText(readString(entry, "kind")),
        placeholder: safeDiagnosticText(readString(entry, "placeholder")),
        description: safeDiagnosticText(readString(entry, "description")),
        blockedByActions: (readArray(entry, "blockedByActions") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeCheckId),
      }))
    : [];

const publicRoutePreflightNextActionSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        title: safeDiagnosticText(readString(entry, "title")),
        detail: safeDiagnosticText(readString(entry, "detail")),
        requiredInputs: publicRoutePreflightRequiredInputSummaries(
          readArray(entry, "requiredInputs"),
        ),
        blockedByChecks: (readArray(entry, "blockedByChecks") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeCheckId),
        commands: (readArray(entry, "commands") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeDiagnosticText)
          .filter(Boolean),
      }))
    : [];

const publicRouteSummary = (routeReport) =>
  isRecord(routeReport)
    ? {
        ready: readBoolean(routeReport, "ready"),
        generatedAt: readString(routeReport, "generatedAt"),
        generatedAtMs: readNumber(routeReport, "generatedAtMs"),
        manifestSource: readString(routeReport, "manifestSource"),
        ...publicRouteIdentity(routeReport),
        bsc: publicBscSummary(readRecord(routeReport, "bsc")),
        deployment: publicDeployment(readRecord(routeReport, "deployment")),
        postDeployLiveEvidence: publicPostDeployLiveEvidence(
          readRecord(routeReport, "postDeployLiveEvidence"),
        ),
        checks: publicCheckSummaries(readArray(routeReport, "checks")),
        nextActions: publicRoutePreflightNextActionSummaries(
          readArray(routeReport, "nextActions"),
        ),
        missingProductionInputs: publicRoutePreflightMissingInputSummaries(
          readArray(routeReport, "missingProductionInputs"),
        ),
      }
    : null;

const publicPeerAuditSummary = (peerAuditReport) =>
  isRecord(peerAuditReport)
    ? {
        ready: readBoolean(peerAuditReport, "ready"),
        generatedAt: readString(peerAuditReport, "generatedAt"),
        generatedAtMs: readNumber(peerAuditReport, "generatedAtMs"),
        ...publicRouteIdentity(peerAuditReport),
        peerCount: readNumber(peerAuditReport, "peerCount"),
        manifestFingerprint: readString(peerAuditReport, "manifestFingerprint"),
        sanitizedStanzaFilesChecked: readBoolean(
          peerAuditReport,
          "sanitizedStanzaFilesChecked",
        ),
        checks: publicCheckSummaries(readArray(peerAuditReport, "checks")),
        nextActions: publicRoutePreflightNextActionSummaries(
          readArray(peerAuditReport, "nextActions"),
        ),
        missingProductionInputs: publicRoutePreflightMissingInputSummaries(
          readArray(peerAuditReport, "missingProductionInputs"),
        ),
        peers: Array.isArray(readArray(peerAuditReport, "peers"))
          ? readArray(peerAuditReport, "peers")
              .filter(isRecord)
              .map((peer) => ({
                routeCount: readNumber(peer, "routeCount"),
                rawTomlSha256: readString(peer, "rawTomlSha256"),
                sanitizedStanzaSha256: readString(
                  peer,
                  "sanitizedStanzaSha256",
                ),
                sanitizedStanzaFileChecked: readBoolean(
                  peer,
                  "sanitizedStanzaFileChecked",
                ),
                sanitizedStanzaFileVerified: readBoolean(
                  peer,
                  "sanitizedStanzaFileVerified",
                ),
                sanitizedStanzaFileSha256: readString(
                  peer,
                  "sanitizedStanzaFileSha256",
                ),
                sanitizedStanzaFileVerificationError: readString(
                  peer,
                  "sanitizedStanzaFileVerificationError",
                ),
                productionReady: readBoolean(peer, "productionReady"),
                ready: readBoolean(peer, "ready"),
                manifestFingerprint: readString(peer, "manifestFingerprint"),
                deployment: publicDeployment(readRecord(peer, "deployment")),
                postDeployLiveEvidence: publicPostDeployLiveEvidence(
                  readRecord(peer, "postDeployLiveEvidence"),
                ),
                hashRoleProblems: Array.isArray(
                  readArray(peer, "hashRoleProblems"),
                )
                  ? readArray(peer, "hashRoleProblems")
                      .map((entry) => trim(entry))
                      .filter(Boolean)
                  : [],
                burnRecordMaterialProblems: Array.isArray(
                  readArray(peer, "burnRecordMaterialProblems"),
                )
                  ? readArray(peer, "burnRecordMaterialProblems")
                      .map((entry) => trim(entry))
                      .filter(Boolean)
                  : [],
                failedChecks: publicCheckSummaries(
                  readArray(peer, "failedChecks"),
                ),
              }))
          : [],
      }
    : null;

const publicPeerAuditRefreshSummary = (peerAuditRefresh) =>
  isRecord(peerAuditRefresh)
    ? {
        mode: readString(peerAuditRefresh, "mode"),
        inputSource: readString(peerAuditRefresh, "inputSource"),
        refreshed: readBoolean(peerAuditRefresh, "refreshed"),
        reportExisted: readBoolean(peerAuditRefresh, "reportExisted"),
        reason: readString(peerAuditRefresh, "reason"),
      }
    : null;

const publicSmokeSummary = (smokeReadinessReport) =>
  isRecord(smokeReadinessReport)
    ? {
        ready: readBoolean(smokeReadinessReport, "ready"),
        routeReady: readBoolean(smokeReadinessReport, "routeReady"),
        route: isRecord(readRecord(smokeReadinessReport, "route"))
          ? {
              manifestSource: readString(
                readRecord(smokeReadinessReport, "route"),
                "manifestSource",
              ),
              ...publicRouteIdentity(readRecord(smokeReadinessReport, "route")),
              bsc: publicBscSummary(
                readRecord(readRecord(smokeReadinessReport, "route"), "bsc"),
              ),
              deployment: publicDeployment(
                readRecord(
                  readRecord(smokeReadinessReport, "route"),
                  "deployment",
                ),
              ),
              postDeployLiveEvidence: publicPostDeployLiveEvidence(
                readRecord(
                  readRecord(smokeReadinessReport, "route"),
                  "postDeployLiveEvidence",
                ),
              ),
              nextActions: publicRoutePreflightNextActionSummaries(
                readArray(
                  readRecord(smokeReadinessReport, "route"),
                  "nextActions",
                ),
              ),
              missingProductionInputs:
                publicRoutePreflightMissingInputSummaries(
                  readArray(
                    readRecord(smokeReadinessReport, "route"),
                    "missingProductionInputs",
                  ),
                ),
            }
          : null,
        peerAudit: publicPeerAuditSummary(
          readRecord(smokeReadinessReport, "peerAudit"),
        ),
        checks: publicCheckSummaries(readArray(smokeReadinessReport, "checks")),
        nextActions: publicMaterialInventoryNextActionSummaries(
          readArray(smokeReadinessReport, "nextActions"),
        ),
        missingProductionInputs: publicMaterialInventoryMissingInputSummaries(
          readArray(smokeReadinessReport, "missingProductionInputs"),
        ),
        provers: isRecord(readRecord(smokeReadinessReport, "provers"))
          ? {
              destination: publicSmokeProverSummary(
                readRecord(
                  readRecord(smokeReadinessReport, "provers"),
                  "destination",
                ),
              ),
              source: publicSmokeProverSummary(
                readRecord(
                  readRecord(smokeReadinessReport, "provers"),
                  "source",
                ),
              ),
              runtimeConfig: publicSmokeRuntimeConfigSummary(
                readRecord(
                  readRecord(smokeReadinessReport, "provers"),
                  "runtimeConfig",
                ),
              ),
            }
          : null,
      }
    : null;

function publicSmokeProverSummary(prover) {
  const manifest = readRecord(prover, "manifest");
  return isRecord(prover)
    ? {
        moduleUrl: readString(prover, "moduleUrl"),
        manifestUrl: readString(prover, "manifestUrl"),
        manifest: isRecord(manifest)
          ? {
              moduleUrl: readString(manifest, "moduleUrl"),
              ...publicRouteIdentity(manifest),
              tairaChainId: readString(manifest, "tairaChainId"),
              tairaNetworkPrefix: readNumber(manifest, "tairaNetworkPrefix"),
              bscNetwork: readBscProfileValue(manifest, "network"),
              bscChain: readBscProfileValue(manifest, "chain"),
              bscChainIdHex: readBscProfileValue(manifest, "chainIdHex"),
              bscNetworkIdHex: readBscProfileValue(manifest, "networkIdHex"),
              moduleSha256: readString(manifest, "moduleSha256"),
              proofArtifactHash: readString(manifest, "proofArtifactHash"),
              provingKeyHash: readString(manifest, "provingKeyHash"),
              nativeEvmProverBundleHash: readString(
                manifest,
                "nativeEvmProverBundleHash",
              ),
              deployment: publicDeployment(readRecord(manifest, "deployment")),
            }
          : null,
      }
    : null;
}

function publicSmokeRuntimeConfigSummary(runtimeConfig) {
  const manifest = readRecord(runtimeConfig, "manifest");
  return isRecord(runtimeConfig)
    ? {
        required: readBoolean(runtimeConfig, "required"),
        configUrl: readString(runtimeConfig, "configUrl"),
        configSha256: readString(runtimeConfig, "configSha256"),
        manifest: isRecord(manifest)
          ? {
              ...publicRouteIdentity(manifest),
              bscNetwork: readBscProfileValue(manifest, "network"),
              bscChain: readBscProfileValue(manifest, "chain"),
              bscChainIdHex: readBscProfileValue(manifest, "chainIdHex"),
              bscNetworkIdHex: readBscProfileValue(manifest, "networkIdHex"),
            }
          : null,
      }
    : null;
}

function publicRuntimeDirectionSummary(section) {
  return isRecord(section)
    ? {
        nativeProverBundleUrl: readString(section, "nativeProverBundleUrl"),
        nativeProverArtifactBaseUrl: readString(
          section,
          "nativeProverArtifactBaseUrl",
        ),
        nativeProverBundleSha256: readString(
          section,
          "nativeProverBundleSha256",
        ),
        nativeEvmProverBundleHash: readString(
          section,
          "nativeEvmProverBundleHash",
        ),
        nativeProverVerifiedSdks: Array.isArray(
          readArray(section, "nativeProverVerifiedSdks"),
        )
          ? readArray(section, "nativeProverVerifiedSdks")
              .map((sdk) => (typeof sdk === "string" ? sdk.trim() : ""))
              .filter(Boolean)
          : [],
        proofArtifactUrl: readString(section, "proofArtifactUrl"),
        proofArtifactSha256: readString(section, "proofArtifactSha256"),
        provingKeyUrl: readString(section, "provingKeyUrl"),
        provingKeySha256: readString(section, "provingKeySha256"),
        verifierKeyUrl: readString(section, "verifierKeyUrl"),
        verifierKeySha256: readString(section, "verifierKeySha256"),
        backendModuleUrl: readString(section, "backendModuleUrl"),
        backendModuleSha256: readString(section, "backendModuleSha256"),
        backendSelfContained: readBoolean(section, "backendSelfContained"),
        backendAcceptedExport: readString(section, "backendAcceptedExport"),
        backendAcceptedSelfTestExport: readString(
          section,
          "backendAcceptedSelfTestExport",
        ),
      }
    : null;
}

function publicRuntimeProverConfigSummary(runtimeProverConfig) {
  const manifest = readRecord(runtimeProverConfig, "manifest");
  return isRecord(runtimeProverConfig)
    ? {
        ok: readBoolean(runtimeProverConfig, "ok"),
        required: readBoolean(runtimeProverConfig, "required"),
        configUrl: readString(runtimeProverConfig, "configUrl"),
        path: readString(runtimeProverConfig, "path"),
        sizeBytes: readNumber(runtimeProverConfig, "sizeBytes"),
        sha256: readString(runtimeProverConfig, "sha256"),
        manifest: isRecord(manifest)
          ? {
              ...publicRouteIdentity(manifest),
              tairaChainId: readString(manifest, "tairaChainId"),
              tairaNetworkPrefix: Number.isSafeInteger(
                readNumber(manifest, "tairaNetworkPrefix"),
              )
                ? readNumber(manifest, "tairaNetworkPrefix")
                : null,
              bscNetwork: readBscProfileValue(manifest, "network"),
              bscChain: readBscProfileValue(manifest, "chain"),
              bscChainIdHex: readBscProfileValue(manifest, "chainIdHex"),
              bscNetworkIdHex: readBscProfileValue(manifest, "networkIdHex"),
              destination: publicRuntimeDirectionSummary(
                readRecord(manifest, "destination"),
              ),
              source: publicRuntimeDirectionSummary(
                readRecord(manifest, "source"),
              ),
            }
          : null,
      }
    : null;
}

const PUBLIC_BROWSER_PROVER_MANIFEST_DEPLOYMENT_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
  "verifierCodeHash",
  "verifierKeyHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
]);

const publicBrowserProverManifestDeployment = (deployment) =>
  isRecord(deployment)
    ? {
        ...Object.fromEntries(
          PUBLIC_BROWSER_PROVER_MANIFEST_DEPLOYMENT_FIELDS.map((key) => [
            key,
            readString(deployment, key),
          ]),
        ),
        ...(() => {
          const aliasProblems = Object.entries(FORBIDDEN_BSC_DEPLOYMENT_ALIASES)
            .filter(([key]) =>
              PUBLIC_BROWSER_PROVER_MANIFEST_DEPLOYMENT_FIELDS.includes(key),
            )
            .flatMap(([key, aliases]) => {
              const present = aliases.filter((alias) =>
                Object.prototype.hasOwnProperty.call(deployment, alias),
              );
              return present.length > 0
                ? [
                    `${key} uses forbidden TRON aliases for BSC evidence: ${present.join(", ")}`,
                  ]
                : [];
            });
          return aliasProblems.length > 0 ? { aliasProblems } : {};
        })(),
      }
    : null;

const publicBrowserProverManifestSummary = (manifest) =>
  isRecord(manifest)
    ? {
        schema: readString(manifest, "schema"),
        moduleUrl: readString(manifest, "moduleUrl"),
        direction: readString(manifest, "direction"),
        ...publicRouteIdentity(manifest),
        tairaChainId: readString(manifest, "tairaChainId"),
        tairaNetworkPrefix: Number.isSafeInteger(
          readNumber(manifest, "tairaNetworkPrefix"),
        )
          ? readNumber(manifest, "tairaNetworkPrefix")
          : null,
        bscNetwork: readBscProfileValue(manifest, "network"),
        bscChain: readBscProfileValue(manifest, "chain"),
        bscChainIdHex: readBscProfileValue(manifest, "chainIdHex"),
        bscNetworkIdHex: readBscProfileValue(manifest, "networkIdHex"),
        moduleSha256: readString(manifest, "moduleSha256"),
        proofArtifactHash: readString(manifest, "proofArtifactHash"),
        provingKeyHash: readString(manifest, "provingKeyHash"),
        nativeEvmProverBundleHash: readString(
          manifest,
          "nativeEvmProverBundleHash",
        ),
        acceptedExport: readString(manifest, "acceptedExport"),
        acceptedSelfTestExport: readString(manifest, "acceptedSelfTestExport"),
        deployment: publicBrowserProverManifestDeployment(
          readRecord(manifest, "deployment"),
        ),
        postDeployLiveEvidence: publicPostDeployLiveEvidence(
          readRecord(manifest, "postDeployLiveEvidence"),
        ),
      }
    : null;

const publicMaterialBrowserModuleSummary = (module) =>
  isRecord(module)
    ? {
        moduleUrl: readString(module, "moduleUrl"),
        path: readString(module, "path"),
        sizeBytes: readNumber(module, "sizeBytes"),
        sha256: readString(module, "sha256"),
      }
    : null;

const publicMaterialBrowserSidecarSummary = (sidecar) =>
  isRecord(sidecar)
    ? {
        path: readString(sidecar, "path"),
        sizeBytes: readNumber(sidecar, "sizeBytes"),
        sha256: readString(sidecar, "sha256"),
        moduleSha256: readString(sidecar, "moduleSha256"),
        manifest: publicBrowserProverManifestSummary(
          readRecord(sidecar, "manifest"),
        ),
      }
    : null;

const publicMaterialBrowserProverSummary = (prover) => {
  if (!isRecord(prover)) {
    return null;
  }
  const detail = safeDiagnosticText(readString(prover, "detail"));
  return {
    ok: readBoolean(prover, "ok"),
    ...(detail ? { detail } : {}),
    module: publicMaterialBrowserModuleSummary(readRecord(prover, "module")),
    sidecar: publicMaterialBrowserSidecarSummary(readRecord(prover, "sidecar")),
  };
};

const publicMaterialFindingSummary = (finding) =>
  isRecord(finding)
    ? {
        severity: readString(finding, "severity"),
        id: readString(finding, "id"),
        code: readString(finding, "code"),
        message: readString(finding, "message"),
      }
    : null;

const publicDeploymentEvidenceReadbackSummary = (evidence) => {
  const readback = readRecord(evidence, "bscContractReadback");
  if (!isRecord(readback)) {
    return null;
  }
  const codePresent = readRecord(readback, "codePresent");
  return {
    chainIdHex: readString(readback, "chainIdHex"),
    codePresent: isRecord(codePresent)
      ? {
          token: readBoolean(codePresent, "token"),
          bridge: readBoolean(codePresent, "bridge"),
          sourceBridge: readBoolean(codePresent, "sourceBridge"),
          verifier: readBoolean(codePresent, "verifier"),
        }
      : null,
    tokenAddress: readString(readback, "tokenAddress"),
    bridgeAddress: readString(readback, "bridgeAddress"),
    sourceBridgeAddress: readString(readback, "sourceBridgeAddress"),
    verifierAddress: readString(readback, "verifierAddress"),
    tokenBridgeAddress: readString(readback, "tokenBridgeAddress"),
    tokenBridgeLocked: readBoolean(readback, "tokenBridgeLocked"),
    sourceBridgeOwner: readString(readback, "sourceBridgeOwner"),
    bridgeDestinationBindingHash: readString(
      readback,
      "bridgeDestinationBindingHash",
    ),
    bridgeVerifierAddress: readString(readback, "bridgeVerifierAddress"),
    bridgeVerifierCodeHash: readString(readback, "bridgeVerifierCodeHash"),
    verifierKeyHash: readString(readback, "verifierKeyHash"),
    bridgeNetworkId: readString(readback, "bridgeNetworkId"),
    bridgeSourceDomain: readNumber(readback, "bridgeSourceDomain"),
    bridgeTargetDomain: readNumber(readback, "bridgeTargetDomain"),
  };
};

const BSC_GROTH16_ATTESTATION_ROLE_KEYS = Object.freeze([
  "semanticSccpCircuit",
  "circuitSecurity",
  "trustedSetup",
  "reproducibleBuild",
]);

const publicSafeTextArray = (entries) =>
  Array.isArray(entries)
    ? entries
        .map((entry) =>
          typeof entry === "string" ? safeDiagnosticText(entry) : null,
        )
        .filter(Boolean)
    : [];

const publicGroth16PackageReferenceSummary = (entry) =>
  isRecord(entry)
    ? {
        path: readString(entry, "path"),
        sha256: readString(entry, "sha256"),
        schema: readString(entry, "schema"),
        draftsAreNotProductionReady: hasOwn(
          entry,
          "draftsAreNotProductionReady",
        )
          ? entry.draftsAreNotProductionReady === true
          : null,
        draftsAreNotSignable: hasOwn(entry, "draftsAreNotSignable")
          ? entry.draftsAreNotSignable === true
          : null,
      }
    : null;

const publicGroth16AttestationRoleReadiness = (roleReadiness) => {
  if (!isRecord(roleReadiness)) {
    return null;
  }
  return Object.fromEntries(
    BSC_GROTH16_ATTESTATION_ROLE_KEYS.filter((key) =>
      hasOwn(roleReadiness, key),
    ).map((key) => [key, readBoolean(roleReadiness, key)]),
  );
};

const publicGroth16AttestationHandoffSummary = (handoff) => {
  if (!isRecord(handoff)) {
    return null;
  }
  const packages = readRecord(handoff, "packages");
  return {
    valid: readBoolean(handoff, "valid"),
    schema: readString(handoff, "schema"),
    routeId: readString(handoff, "routeId"),
    assetKey: readString(handoff, "assetKey"),
    bscNetwork: readString(handoff, "bscNetwork"),
    chain: readString(handoff, "chain"),
    chainIdHex: readString(handoff, "chainIdHex"),
    networkIdHex: readString(handoff, "networkIdHex"),
    circuitProfile: readString(handoff, "circuitProfile"),
    proofBackend: readString(handoff, "proofBackend"),
    verifierKeyHash: readString(handoff, "verifierKeyHash"),
    manifestPath: readString(handoff, "manifestPath"),
    manifestSha256: readString(handoff, "manifestSha256"),
    manifestProductionReady: readBoolean(handoff, "manifestProductionReady"),
    manifestProductionBlockerCount: readNumber(
      handoff,
      "manifestProductionBlockerCount",
    ),
    manifestProductionBlockers: publicSafeTextArray(
      readArray(handoff, "manifestProductionBlockers"),
    ),
    manifestProductionBlockerSummary: safeDiagnosticText(
      readString(handoff, "manifestProductionBlockerSummary"),
    ),
    packages: isRecord(packages)
      ? {
          transcriptTemplates: publicGroth16PackageReferenceSummary(
            readRecord(packages, "transcriptTemplates"),
          ),
          evidenceTemplates: publicGroth16PackageReferenceSummary(
            readRecord(packages, "evidenceTemplates"),
          ),
          attestationRequest: publicGroth16PackageReferenceSummary(
            readRecord(packages, "attestationRequest"),
          ),
        }
      : null,
    attestationRequestPath: readString(handoff, "attestationRequestPath"),
    attestationRequestSha256: readString(handoff, "attestationRequestSha256"),
    handoffComplete: readBoolean(handoff, "handoffComplete"),
    signingReady: readBoolean(handoff, "signingReady"),
    readyToFinalize: readBoolean(handoff, "readyToFinalize"),
    requestValid: readBoolean(handoff, "requestValid"),
    roleReadiness: publicGroth16AttestationRoleReadiness(
      readRecord(handoff, "roleReadiness"),
    ),
    allRolesReady: readBoolean(handoff, "allRolesReady"),
    missingSignedRoles: publicSafeTextArray(
      readArray(handoff, "missingSignedRoles"),
    ),
    handoffBlockers: publicSafeTextArray(readArray(handoff, "handoffBlockers")),
    attestationStatusProblemCount: readNumber(
      handoff,
      "attestationStatusProblemCount",
    ),
    attestationStatusProblemSummary: safeDiagnosticText(
      readString(handoff, "attestationStatusProblemSummary"),
    ),
    readinessProductionReady: readBoolean(handoff, "readinessProductionReady"),
    readinessProductionBlockers: publicSafeTextArray(
      readArray(handoff, "readinessProductionBlockers"),
    ),
    problemCount: readNumber(handoff, "problemCount"),
    nextActions: publicSafeTextArray(readArray(handoff, "nextActions")),
    referencedRequestVerified: readBoolean(
      handoff,
      "referencedRequestVerified",
    ),
    referencedManifestVerified: readBoolean(
      handoff,
      "referencedManifestVerified",
    ),
    publicDeploymentMatches: readBoolean(handoff, "publicDeploymentMatches"),
  };
};

const publicMaterialFileSummary = (entry) =>
  isRecord(entry)
    ? {
        path: readString(entry, "path"),
        kind: readString(entry, "kind"),
        sizeBytes: readNumber(entry, "sizeBytes"),
        sha256: readString(entry, "sha256"),
        ...(isRecord(readRecord(entry, "browserProverSidecar"))
          ? {
              browserProverSidecar: {
                schema: readString(
                  readRecord(entry, "browserProverSidecar"),
                  "schema",
                ),
                modulePath: readString(
                  readRecord(entry, "browserProverSidecar"),
                  "modulePath",
                ),
                moduleSha256: readString(
                  readRecord(entry, "browserProverSidecar"),
                  "moduleSha256",
                ),
                moduleSha256Actual: readString(
                  readRecord(entry, "browserProverSidecar"),
                  "moduleSha256Actual",
                ),
                exports: readArray(
                  readRecord(entry, "browserProverSidecar"),
                  "exports",
                ),
                valid: readBoolean(
                  readRecord(entry, "browserProverSidecar"),
                  "valid",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "contractArtifact"))
          ? {
              contractArtifact: {
                valid: readBoolean(
                  readRecord(entry, "contractArtifact"),
                  "valid",
                ),
                key: readString(readRecord(entry, "contractArtifact"), "key"),
                contractName: readString(
                  readRecord(entry, "contractArtifact"),
                  "contractName",
                ),
                abiEntryCount: readNumber(
                  readRecord(entry, "contractArtifact"),
                  "abiEntryCount",
                ),
                bytecodeKeccak256: readString(
                  readRecord(entry, "contractArtifact"),
                  "bytecodeKeccak256",
                ),
                deployedBytecodeKeccak256: readString(
                  readRecord(entry, "contractArtifact"),
                  "deployedBytecodeKeccak256",
                ),
                bytecodeSha256: readString(
                  readRecord(entry, "contractArtifact"),
                  "bytecodeSha256",
                ),
                deployedBytecodeSha256: readString(
                  readRecord(entry, "contractArtifact"),
                  "deployedBytecodeSha256",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "productionRequirements"))
          ? {
              productionRequirements: {
                valid: readBoolean(
                  readRecord(entry, "productionRequirements"),
                  "valid",
                ),
                schema: readString(
                  readRecord(entry, "productionRequirements"),
                  "schema",
                ),
                routeId: readString(
                  readRecord(entry, "productionRequirements"),
                  "routeId",
                ),
                assetKey: readString(
                  readRecord(entry, "productionRequirements"),
                  "assetKey",
                ),
                bscNetwork: readString(
                  readRecord(entry, "productionRequirements"),
                  "bscNetwork",
                ),
                inputCount: readNumber(
                  readRecord(entry, "productionRequirements"),
                  "inputCount",
                ),
                requiredReportCount: readNumber(
                  readRecord(entry, "productionRequirements"),
                  "requiredReportCount",
                ),
                deniedVerifierKeyHashCount: readNumber(
                  readRecord(entry, "productionRequirements"),
                  "deniedVerifierKeyHashCount",
                ),
                contractHash: readString(
                  readRecord(entry, "productionRequirements"),
                  "contractHash",
                ),
                expectedContractHash: readString(
                  readRecord(entry, "productionRequirements"),
                  "expectedContractHash",
                ),
                contractMatchesExpected: readBoolean(
                  readRecord(entry, "productionRequirements"),
                  "contractMatchesExpected",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "sourceParityAttestation"))
          ? {
              sourceParityAttestation: {
                valid: readBoolean(
                  readRecord(entry, "sourceParityAttestation"),
                  "valid",
                ),
                schema: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "schema",
                ),
                routeId: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "routeId",
                ),
                assetKey: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "assetKey",
                ),
                bscNetwork: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "bscNetwork",
                ),
                chain: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "chain",
                ),
                chainIdHex: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "chainIdHex",
                ),
                networkIdHex: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "networkIdHex",
                ),
                domain: readNumber(
                  readRecord(entry, "sourceParityAttestation"),
                  "domain",
                ),
                proofBackend: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "proofBackend",
                ),
                requiredMarkers: readArray(
                  readRecord(entry, "sourceParityAttestation"),
                  "requiredMarkers",
                ).filter((marker) => typeof marker === "string"),
                sourceTreeHash: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "sourceTreeHash",
                ),
                expectedSourceTreeHash: readString(
                  readRecord(entry, "sourceParityAttestation"),
                  "expectedSourceTreeHash",
                ),
                sourceTreeHashMatches: readBoolean(
                  readRecord(entry, "sourceParityAttestation"),
                  "sourceTreeHashMatches",
                ),
                sdkCount: readNumber(
                  readRecord(entry, "sourceParityAttestation"),
                  "sdkCount",
                ),
                sdks: readRecord(
                  readRecord(entry, "sourceParityAttestation"),
                  "sdks",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "deploymentEvidence"))
          ? {
              deploymentEvidence: {
                schema: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "schema",
                ),
                valid: readBoolean(
                  readRecord(entry, "deploymentEvidence"),
                  "valid",
                ),
                routeId: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "routeId",
                ),
                assetKey: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "assetKey",
                ),
                bscNetwork: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "bscNetwork",
                ),
                chain: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "chain",
                ),
                chainIdHex: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "chainIdHex",
                ),
                networkIdHex: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "networkIdHex",
                ),
                bridgeAddress: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "bridgeAddress",
                ),
                tokenAddress: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "tokenAddress",
                ),
                sourceBridgeAddress: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "sourceBridgeAddress",
                ),
                verifierAddress: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "verifierAddress",
                ),
                verifierCodeHash: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "verifierCodeHash",
                ),
                verifierKeyHash: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "verifierKeyHash",
                ),
                destinationBindingHash: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "destinationBindingHash",
                ),
                destinationBindingKey: readString(
                  readRecord(entry, "deploymentEvidence"),
                  "destinationBindingKey",
                ),
                destinationRolloutVersion: readNumber(
                  readRecord(entry, "deploymentEvidence"),
                  "destinationRolloutVersion",
                ),
                destinationBindingVersion: readNumber(
                  readRecord(entry, "deploymentEvidence"),
                  "destinationBindingVersion",
                ),
                postDeployChecklist: readArray(
                  readRecord(entry, "deploymentEvidence"),
                  "postDeployChecklist",
                ),
                bscContractReadback: publicDeploymentEvidenceReadbackSummary(
                  readRecord(entry, "deploymentEvidence"),
                ),
                productionPlaceholderFree: readBoolean(
                  readRecord(entry, "deploymentEvidence"),
                  "productionPlaceholderFree",
                ),
                publicDeploymentMatches: readBoolean(
                  readRecord(entry, "deploymentEvidence"),
                  "publicDeploymentMatches",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "offlineFullTomlEvidence"))
          ? {
              offlineFullTomlEvidence: {
                valid: readBoolean(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "valid",
                ),
                schema: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "schema",
                ),
                routeId: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "routeId",
                ),
                assetKey: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "assetKey",
                ),
                bscNetwork: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "bscNetwork",
                ),
                chainIdHex: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "chainIdHex",
                ),
                networkIdHex: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "networkIdHex",
                ),
                fullTomlReady: readBoolean(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "fullTomlReady",
                ),
                offlineFullTomlSha256: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "offlineFullTomlSha256",
                ),
                hashInputSha256: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "hashInputSha256",
                ),
                renderedTomlSha256: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "renderedTomlSha256",
                ),
                hashMode: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "hashMode",
                ),
                routeManifestPath: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "routeManifestPath",
                ),
                fullConfigPath: readString(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "fullConfigPath",
                ),
                publicPostDeployMatches: readBoolean(
                  readRecord(entry, "offlineFullTomlEvidence"),
                  "publicPostDeployMatches",
                ),
              },
            }
          : {}),
        ...(isRecord(readRecord(entry, "groth16AttestationHandoff"))
          ? {
              groth16AttestationHandoff: publicGroth16AttestationHandoffSummary(
                readRecord(entry, "groth16AttestationHandoff"),
              ),
            }
          : {}),
        findings: Array.isArray(entry.findings)
          ? entry.findings
              .map(publicMaterialFindingSummary)
              .filter((finding) => finding !== null)
          : [],
      }
    : null;

const publicMaterialFileSummaries = (files) =>
  Array.isArray(files)
    ? files.map(publicMaterialFileSummary).filter((entry) => entry !== null)
    : [];

const publicMaterialInventoryPathSummaries = (paths) =>
  Array.isArray(paths)
    ? paths
        .map((entry) => normalizeMaterialInventoryFileSummaryPath(entry))
        .filter((entry) => entry.normalized)
        .map((entry) => entry.normalized)
    : [];

const publicMaterialInventoryScanRootStatusSummaries = (entries) =>
  Array.isArray(entries)
    ? entries
        .filter(isRecord)
        .map((entry) => {
          const normalizedPath = normalizeMaterialInventoryFileSummaryPath(
            readString(entry, "path"),
          );
          if (!normalizedPath.normalized) {
            return null;
          }
          const kind = readString(entry, "kind");
          const ok = hasOwn(entry, "ok") ? entry.ok === true : null;
          const detail = safeDiagnosticText(readString(entry, "detail"));
          return {
            path: normalizedPath.normalized,
            ok,
            kind,
            ...(detail ? { detail } : {}),
          };
        })
        .filter((entry) => entry !== null)
    : [];

const publicMaterialInventoryRequiredInputSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        kind: safeDiagnosticText(readString(entry, "kind")),
        placeholder: safeDiagnosticText(readString(entry, "placeholder")),
        description: safeDiagnosticText(readString(entry, "description")),
      }))
    : [];

const publicMaterialInventoryMissingInputSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        kind: safeDiagnosticText(readString(entry, "kind")),
        placeholder: safeDiagnosticText(readString(entry, "placeholder")),
        description: safeDiagnosticText(readString(entry, "description")),
        blockedByActions: (readArray(entry, "blockedByActions") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeCheckId),
      }))
    : [];

const publicMaterialInventoryNextActionSummaries = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: safeCheckId(readString(entry, "id")),
        title: safeDiagnosticText(readString(entry, "title")),
        detail: safeDiagnosticText(readString(entry, "detail")),
        requiredInputs: publicMaterialInventoryRequiredInputSummaries(
          readArray(entry, "requiredInputs"),
        ),
        blockedByChecks: (readArray(entry, "blockedByChecks") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeCheckId),
        commands: (readArray(entry, "commands") ?? [])
          .filter((value) => typeof value === "string")
          .map(safeDiagnosticText)
          .filter(Boolean),
      }))
    : [];

const publicMaterialInventorySummary = (materialInventoryReport) =>
  isRecord(materialInventoryReport)
    ? {
        schema: readString(materialInventoryReport, "schema"),
        ready: readBoolean(materialInventoryReport, "ready"),
        ...publicRouteIdentity(materialInventoryReport),
        generatedAt: readString(materialInventoryReport, "generatedAt"),
        scanRoots: publicMaterialInventoryPathSummaries(
          readArray(materialInventoryReport, "scanRoots"),
        ),
        scanRootStatuses: publicMaterialInventoryScanRootStatusSummaries(
          readArray(materialInventoryReport, "scanRootStatuses"),
        ),
        checks: publicCheckSummaries(
          readArray(materialInventoryReport, "checks"),
        ),
        nextActions: publicMaterialInventoryNextActionSummaries(
          readArray(materialInventoryReport, "nextActions"),
        ),
        missingProductionInputs: publicMaterialInventoryMissingInputSummaries(
          readArray(materialInventoryReport, "missingProductionInputs"),
        ),
        route: isRecord(readRecord(materialInventoryReport, "route"))
          ? {
              ready: readBoolean(
                readRecord(materialInventoryReport, "route"),
                "ready",
              ),
              manifestSource: readString(
                readRecord(materialInventoryReport, "route"),
                "manifestSource",
              ),
              bsc: publicBscSummary(
                readRecord(readRecord(materialInventoryReport, "route"), "bsc"),
              ),
              deployment: publicDeployment(
                readRecord(
                  readRecord(materialInventoryReport, "route"),
                  "deployment",
                ),
              ),
              postDeployLiveEvidence: publicPostDeployLiveEvidence(
                readRecord(
                  readRecord(materialInventoryReport, "route"),
                  "postDeployLiveEvidence",
                ),
              ),
            }
          : null,
        counts: isRecord(readRecord(materialInventoryReport, "counts"))
          ? {
              files: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "files",
              ),
              relevantFilesSeen: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "relevantFilesSeen",
              ),
              maxFiles: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "maxFiles",
              ),
              truncated: hasOwn(
                readRecord(materialInventoryReport, "counts"),
                "truncated",
              )
                ? readRecord(materialInventoryReport, "counts").truncated ===
                  true
                : null,
              productionRouteArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionRouteArtifacts",
              ),
              productionVerifierArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionVerifierArtifacts",
              ),
              sourceParityAttestations: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "sourceParityAttestations",
              ),
              productionNativeProverBundles: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionNativeProverBundles",
              ),
              routeBoundGroth16AttestationHandoffs: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "routeBoundGroth16AttestationHandoffs",
              ),
              productionRequirementsArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionRequirementsArtifacts",
              ),
              compiledContractArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "compiledContractArtifacts",
              ),
              productionOfflineFullTomlEvidenceArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionOfflineFullTomlEvidenceArtifacts",
              ),
              productionDeploymentEvidenceArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionDeploymentEvidenceArtifacts",
              ),
              productionTairaBurnRecordContracts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "productionTairaBurnRecordContracts",
              ),
              browserProverSidecars: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "browserProverSidecars",
              ),
              proofArtifacts: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "proofArtifacts",
              ),
              provingKeys: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "provingKeys",
              ),
              proofArtifactCandidates: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "proofArtifactCandidates",
              ),
              provingKeyCandidates: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "provingKeyCandidates",
              ),
              criticalFindings: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "criticalFindings",
              ),
              warningFindings: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "warningFindings",
              ),
              skippedGeneratedDirectories: readNumber(
                readRecord(materialInventoryReport, "counts"),
                "skippedGeneratedDirectories",
              ),
            }
          : null,
        skippedGeneratedDirectories: Array.isArray(
          readArray(materialInventoryReport, "skippedGeneratedDirectories"),
        )
          ? readArray(materialInventoryReport, "skippedGeneratedDirectories")
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean)
          : [],
        files: publicMaterialFileSummaries(
          readArray(materialInventoryReport, "files"),
        ),
        runtimeProverConfig: publicRuntimeProverConfigSummary(
          readRecord(materialInventoryReport, "runtimeProverConfig"),
        ),
        browserProvers: isRecord(
          readRecord(materialInventoryReport, "browserProvers"),
        )
          ? {
              destination: publicMaterialBrowserProverSummary(
                readRecord(
                  readRecord(materialInventoryReport, "browserProvers"),
                  "destination",
                ),
              ),
              source: publicMaterialBrowserProverSummary(
                readRecord(
                  readRecord(materialInventoryReport, "browserProvers"),
                  "source",
                ),
              ),
            }
          : null,
      }
    : null;

const publicVideoMissingEvidenceSummary = (missingEvidence) =>
  isRecord(missingEvidence)
    ? Object.fromEntries(
        VIDEO_MISSING_EVIDENCE_FIELDS.map((field) => [
          field,
          Array.isArray(missingEvidence[field]) ? missingEvidence[field] : [],
        ]),
      )
    : null;

const expectedVideoEvidenceForBscProfile = (bscProfile) =>
  Object.freeze([
    "TAIRA source transaction from the SCCP UI",
    `${bscProfile.label} finalize transaction shown in explorer`,
    "BSC burn transaction shown in explorer",
    "TAIRA settlement transaction shown in explorer",
  ]);

const publicProofFileVerificationError = (entry) => {
  const error = readString(entry, "fileVerificationError");
  if (!error) {
    return "";
  }
  if (/symbolic link/iu.test(error)) {
    return "must not be a symbolic link";
  }
  if (/regular file/iu.test(error)) {
    return "must be a regular file";
  }
  if (/unsafe path/iu.test(error)) {
    return "has unsafe path";
  }
  if (/minimum required|maximum allowed/iu.test(error)) {
    return error;
  }
  if (/declared mediaType is missing/iu.test(error)) {
    return "declared mediaType is missing";
  }
  if (/^expected .+ media, got [a-z0-9/+.-]+$/iu.test(error)) {
    return error;
  }
  if (
    /^expected image\/png media with at least \d+x\d+ pixels, got \d+x\d+$/iu.test(
      error,
    )
  ) {
    return error;
  }
  if (
    /^expected image\/png screenshot with non-trivial pixel variation, got \d+ unique pixel byte values$/iu.test(
      error,
    )
  ) {
    return error;
  }
  return "file verification failed";
};

const publicVideoSummary = (videoTranscript) => {
  if (!isRecord(videoTranscript)) {
    return null;
  }
  const startedAtMs = readNumber(videoTranscript, "startedAtMs");
  const endedAtMs = readNumber(videoTranscript, "endedAtMs");
  const readinessBinding = readRecord(videoTranscript, "readinessBinding");
  const readinessRoute = readRecord(readinessBinding, "route");
  const readinessPeerAudit = readRecord(readinessBinding, "peerAudit");
  const transactions = readRecord(videoTranscript, "transactions");
  const transactionLinks =
    readOwnArrayValues(videoTranscript, "transactionLinks") ?? [];
  const explorerScreenshots =
    readOwnArrayValues(videoTranscript, "explorerScreenshots") ?? [];
  const videoArtifacts =
    readOwnArrayValues(videoTranscript, "videoArtifacts") ?? [];

  return {
    schema: readString(videoTranscript, "schema"),
    proofFilesReverified:
      readBoolean(videoTranscript, "proofFilesReverified") === true,
    startedAtMs,
    endedAtMs,
    durationMs:
      typeof startedAtMs === "number" && typeof endedAtMs === "number"
        ? endedAtMs - startedAtMs
        : null,
    outputDir: readString(videoTranscript, "outputDir"),
    proofComplete: readBoolean(videoTranscript, "proofComplete") === true,
    preflightReady: readBoolean(videoTranscript, "preflightReady") === true,
    smokeReadinessReady:
      readBoolean(videoTranscript, "smokeReadinessReady") === true,
    bsc: publicBscSummary(readRecord(videoTranscript, "bsc")),
    flowOrder: (readOwnArrayValues(videoTranscript, "flowOrder") ?? []).filter(
      (entry) => typeof entry === "string",
    ),
    expectedEvidence: (
      readOwnArrayValues(videoTranscript, "expectedEvidence") ?? []
    ).filter((entry) => typeof entry === "string"),
    readinessBinding: readinessBinding
      ? {
          checkedAt: readString(readinessBinding, "checkedAt"),
          routeReady: readBoolean(readinessBinding, "routeReady") === true,
          smokeReadinessReady:
            readBoolean(readinessBinding, "smokeReadinessReady") === true,
          route: readinessRoute
            ? {
                manifestSource: readString(readinessRoute, "manifestSource"),
                ...publicRouteIdentity(readinessRoute),
                bsc: publicBscSummary(readRecord(readinessRoute, "bsc")),
                deployment: publicDeployment(
                  readRecord(readinessRoute, "deployment"),
                ),
                postDeployLiveEvidence: publicPostDeployLiveEvidence(
                  readRecord(readinessRoute, "postDeployLiveEvidence"),
                ),
              }
            : null,
          peerAudit: readinessPeerAudit
            ? {
                ready: readBoolean(readinessPeerAudit, "ready") === true,
                ...publicRouteIdentity(readinessPeerAudit),
                peerCount: readNumber(readinessPeerAudit, "peerCount"),
                manifestFingerprint: readString(
                  readinessPeerAudit,
                  "manifestFingerprint",
                ),
              }
            : null,
        }
      : null,
    transactions: transactions
      ? Object.fromEntries(
          REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot) => [
            slot,
            readString(transactions, slot),
          ]),
        )
      : {},
    transactionLinks: transactionLinks.filter(isRecord).map((link) => ({
      label: readString(link, "label"),
      href: readString(link, "href"),
    })),
    explorerScreenshots: explorerScreenshots
      .filter(isRecord)
      .map((screenshot) => ({
        kind: readString(screenshot, "kind"),
        href: readString(screenshot, "href"),
        finalHref: readString(screenshot, "finalHref"),
        transactionHash: readString(screenshot, "transactionHash"),
        contentLength: readNumber(screenshot, "contentLength"),
        relativePath: readString(screenshot, "relativePath"),
        sizeBytes: readNumber(screenshot, "sizeBytes"),
        sha256: readString(screenshot, "sha256"),
        mediaType: readString(screenshot, "mediaType"),
        status: readString(screenshot, "status"),
        fileVerified: readBoolean(screenshot, "fileVerified") === true,
        fileReverified: readBoolean(screenshot, "fileReverified") === true,
        fileVerificationError: publicProofFileVerificationError(screenshot),
      })),
    missingEvidence: publicVideoMissingEvidenceSummary(
      readRecord(videoTranscript, "missingEvidence"),
    ),
    videoArtifacts: videoArtifacts.filter(isRecord).map((artifact) => ({
      relativePath: readString(artifact, "relativePath"),
      sizeBytes: readNumber(artifact, "sizeBytes"),
      sha256: readString(artifact, "sha256"),
      mediaType: readString(artifact, "mediaType"),
      status: readString(artifact, "status"),
      fileVerified: readBoolean(artifact, "fileVerified") === true,
      fileReverified: readBoolean(artifact, "fileReverified") === true,
      fileVerificationError: publicProofFileVerificationError(artifact),
    })),
  };
};

const SCCP_BSC_PRODUCTION_GATE_NEXT_ACTIONS = Object.freeze([
  Object.freeze({
    id: "replace-diagnostic-bsc-verifier",
    title: "Replace diagnostic BSC verifier deployment",
    detail:
      "Deploy the BSC verifier, bridge, token, and source bridge from production Groth16 verifier material, then publish a public route report whose verifierKeyHash is not denylisted.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "production-groth16-verifier-key-json",
        kind: "file",
        placeholder: "<production-verifier-key.json>",
        description:
          "BN254 Groth16 verifier key JSON whose hash is not denylisted.",
      }),
      Object.freeze({
        id: "{bscNetwork}-funded-bsc-deployer",
        kind: "operator-environment",
        placeholder: "<{bscNetwork}-deployer-signing-env>",
        description:
          "Funded BSC deployer configured outside the report for the selected network.",
      }),
      Object.freeze({
        id: "{bscNetwork}-bsc-rpc-endpoint",
        kind: "url",
        placeholder: "<{bscNetwork}-bsc-rpc-url>",
        description:
          "Selected BSC RPC endpoint used for deployment and contract readback.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "route-report-diagnostic-verifier-key-hash-scan",
      "peer-audit-diagnostic-verifier-key-hash-scan",
      "smoke-readiness-diagnostic-verifier-key-hash-scan",
      "material-inventory-diagnostic-verifier-key-hash-scan",
      "video-transcript-diagnostic-verifier-key-hash-scan",
      "route-diagnostic-scan",
    ]),
    commands: Object.freeze([
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs deploy --bsc-network {bscNetwork} --verifier <production-verifier-key.json> --broadcast true --confirm-network {confirmNetwork}{mainnetConfirmation}",
      "npm run e2e:sccp:bsc-preflight -- --bsc-network {bscNetwork}",
    ]),
  }),
  Object.freeze({
    id: "publish-production-proof-material",
    title: "Publish production proof material",
    detail:
      "Publish the production route artifact, verifier key, proof artifact, proving key, and native EVM prover bundle with hashes matching the public BSC route report.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "production-route-manifest",
        kind: "file",
        placeholder: "<production-route.manifest.json>",
        description:
          "Production route manifest bound to deployed BSC contracts and TAIRA route evidence.",
      }),
      Object.freeze({
        id: "{bscNetwork}-bsc-deployment-evidence",
        kind: "file",
        placeholder: "<{bscNetwork}-deployment-evidence.json>",
        description:
          "BSC deployment evidence generated from live contract deployment and readback.",
      }),
      Object.freeze({
        id: "taira-burn-record-contract",
        kind: "file",
        placeholder: "<taira-burn-record.contract.json>",
        description:
          "Compiled TAIRA burn-record IVM contract artifact used by the BSC route manifest.",
      }),
      Object.freeze({
        id: "canonical-settlement-asset-definition-id",
        kind: "asset-definition-id",
        placeholder: "<canonical-asset-definition-id>",
        description:
          "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
      }),
      Object.freeze({
        id: "post-deploy-live-evidence",
        kind: "hashes-and-urls",
        placeholder:
          "<source-event/route-canary/full-config hashes and explorer urls>",
        description:
          "Live source-event, route-canary, and merged full-config evidence for the production-ready route manifest.",
      }),
      Object.freeze({
        id: "deployed-taira-base-config",
        kind: "file",
        placeholder: "<deployed-taira-config.toml>",
        description:
          "Deployed TAIRA peer config used to render the merged full route config and generated offline full-TOML evidence.",
      }),
      Object.freeze({
        id: "production-material-scan-path",
        kind: "directory",
        placeholder: "<production-material-scan-path>",
        description:
          "Readable directory containing the production route, verifier, prover, and audit artifacts scanned by the material inventory.",
      }),
      Object.freeze({
        id: "destination-browser-prover-manifest",
        kind: "file",
        placeholder: "<destination-browser-prover-manifest.json>",
        description:
          "Route-bound TAIRA-to-BSC browser prover sidecar manifest with module/content hashes.",
      }),
      Object.freeze({
        id: "source-browser-prover-manifest",
        kind: "file",
        placeholder: "<source-browser-prover-manifest.json>",
        description:
          "Route-bound BSC-to-TAIRA browser source prover sidecar manifest with module/content hashes.",
      }),
      Object.freeze({
        id: "native-prover-artifact-root",
        kind: "directory",
        placeholder: "<native-prover-artifact-root>",
        description:
          "Canonical artifact root containing the production native EVM prover bundle inputs.",
      }),
      Object.freeze({
        id: "burn-record-proof-artifact",
        kind: "file",
        placeholder: "<relative-circuit.r1cs>",
        description:
          "Production burn-record proof artifact referenced relative to the artifact root.",
      }),
      Object.freeze({
        id: "burn-record-proving-key",
        kind: "file",
        placeholder: "<relative-circuit.zkey>",
        description:
          "Production burn-record proving key referenced relative to the artifact root.",
      }),
      Object.freeze({
        id: "production-groth16-verifier-key-json",
        kind: "file",
        placeholder: "<relative-verifier-key.json>",
        description:
          "Production verifier key JSON matching the deployed verifierKeyHash.",
      }),
      Object.freeze({
        id: "groth16-material-manifest",
        kind: "file",
        placeholder: "<relative-groth16-material-manifest.json>",
        description:
          "ProductionReady Groth16 material manifest validated before building the native EVM prover bundle.",
      }),
      Object.freeze({
        id: "groth16-attestation-request",
        kind: "file",
        placeholder: "<attestation-request.json>",
        description:
          "Groth16 attestation request package used to inventory and bind signed role attestations before finalization.",
      }),
      Object.freeze({
        id: "trusted-attestation-signer",
        kind: "public-key-fingerprint",
        placeholder: "<0x...>",
        description:
          "Allowed Ed25519 signer fingerprint for semantic, audit, trusted setup, and reproducible build attestations.",
      }),
      Object.freeze({
        id: "groth16-proof-self-test",
        kind: "file",
        placeholder: "<relative-groth16-proof-self-test.json>",
        description:
          "SnarkJS proof self-test report generated from the productionReady Groth16 material manifest.",
      }),
      Object.freeze({
        id: "snarkjs-binary",
        kind: "executable",
        placeholder: "<snarkjs>",
        description:
          "SnarkJS binary whose sha256 is bound in the reproducible-build transcript and used to verify the embedded proof self-test.",
      }),
      Object.freeze({
        id: "cross-sdk-parity-report",
        kind: "file",
        placeholder: "<relative-cross-sdk-parity.json>",
        description:
          "Cross-SDK production parity report covering JavaScript, Swift, Kotlin, Java Android, and .NET bindings.",
      }),
      Object.freeze({
        id: "native-prover-self-test-report",
        kind: "file",
        placeholder: "<relative-native-self-test.json>",
        description:
          "Native EVM prover self-test report bound to the selected BSC network.",
      }),
      Object.freeze({
        id: "source-parity-attestation",
        kind: "file",
        placeholder: "<source-parity-attestation.json>",
        description:
          "Deterministic source-parity attestation for JavaScript, Swift, Kotlin, Java Android, and .NET BSC local-admission implementations.",
      }),
      Object.freeze({
        id: "javascript-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-js-implementation>",
        description: "JavaScript SDK implementation evidence.",
      }),
      Object.freeze({
        id: "swift-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-swift-implementation>",
        description: "Swift SDK implementation evidence.",
      }),
      Object.freeze({
        id: "kotlin-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-kotlin-implementation>",
        description: "Kotlin SDK implementation evidence.",
      }),
      Object.freeze({
        id: "java-android-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-java-android-implementation>",
        description: "Java Android SDK implementation evidence.",
      }),
      Object.freeze({
        id: "dotnet-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-dotnet-implementation>",
        description: ".NET SDK implementation evidence.",
      }),
      Object.freeze({
        id: "audit-circuit-security",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Circuit security audit evidence.",
      }),
      Object.freeze({
        id: "audit-native-implementation",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Native implementation audit evidence.",
      }),
      Object.freeze({
        id: "audit-reproducible-build",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Reproducible build audit evidence.",
      }),
      Object.freeze({
        id: "audit-no-wasm-no-remote-scan",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description:
          "Audit evidence that production proving uses native code and does not rely on WASM or remote proving.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "material-inventory-scan-root-availability",
      "material-deployment-evidence-artifact",
      "taira-burn-record-production-material",
      "material-groth16-attestation-role-readiness",
      "production-proof-material",
      "production-material-inventory",
    ]),
    commands: Object.freeze([
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs requirements --bsc-network {bscNetwork} --out <production-requirements.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --evidence <{bscNetwork}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --out <production-route.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs source-parity-attestation --bsc-network {bscNetwork} --out <source-parity-attestation.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-inventory --request <attestation-request.json> --scan-dir <native-prover-artifact-root> --trusted-attestation-signer <0x...>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --proof-artifact <relative-circuit.r1cs> --proving-key <relative-circuit.zkey> --verifier-key <relative-verifier-key.json> --groth16-material-manifest <relative-groth16-material-manifest.json> --groth16-proof-self-test <relative-groth16-proof-self-test.json> --snarkjs-bin <snarkjs> --trusted-attestation-signer <0x...> --cross-sdk-parity <relative-cross-sdk-parity.json> --native-prover-self-test <relative-native-self-test.json> --javascript-implementation <relative-js-implementation> --swift-implementation <relative-swift-implementation> --kotlin-implementation <relative-kotlin-implementation> --java-android-implementation <relative-java-android-implementation> --dotnet-implementation <relative-dotnet-implementation> --audit-circuit-security <hex-or-relative-file> --audit-native-implementation <source-parity-attestation.json> --audit-reproducible-build <hex-or-relative-file> --audit-no-wasm-no-remote-scan <hex-or-relative-file> --out <native-evm-prover-bundle.json> --attach-route-manifest-out <production-route.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --evidence <{bscNetwork}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --destination-browser-prover-manifest <destination-browser-prover-manifest.json> --source-browser-prover-manifest <source-browser-prover-manifest.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --live-readback-checked true --out <production-route.pre-offline-evidence.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest <production-route.pre-offline-evidence.manifest.json> --base-config <deployed-taira-config.toml> --out <production-route.full-taira-config.toml> --allow-unready true --write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --evidence <{bscNetwork}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --destination-browser-prover-manifest <destination-browser-prover-manifest.json> --source-browser-prover-manifest <source-browser-prover-manifest.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --full-toml-ready true --offline-full-toml-evidence <offline-full-toml-evidence.json> --production-ready true --live-readback-checked true {routeManifestConfirmation} --out <production-route.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id>",
      "npm run e2e:sccp:bsc-material-inventory -- --bsc-network {bscNetwork}",
    ]),
  }),
  Object.freeze({
    id: "publish-bsc-prover-modules",
    title: "Publish browser BSC prover modules",
    detail:
      "Publish browser-safe destination and source prover modules, sidecar manifests, and runtime prover config bound to the production route and selected BSC network.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "{bscNetwork}-destination-browser-prover-module",
        kind: "url",
        placeholder: "<{bscNetwork}-destination-prover-module-url>",
        description:
          "Destination prover module URL accepted by the runtime prover config.",
      }),
      Object.freeze({
        id: "{bscNetwork}-destination-browser-prover-manifest",
        kind: "url",
        placeholder: "<{bscNetwork}-destination-prover-manifest-url>",
        description:
          "Destination prover sidecar manifest with module hash and deployment binding.",
      }),
      Object.freeze({
        id: "{bscNetwork}-source-browser-prover-module",
        kind: "url",
        placeholder: "<{bscNetwork}-source-prover-module-url>",
        description:
          "Source prover module URL accepted by the runtime prover config.",
      }),
      Object.freeze({
        id: "{bscNetwork}-source-browser-prover-manifest",
        kind: "url",
        placeholder: "<{bscNetwork}-source-prover-manifest-url>",
        description:
          "Source prover sidecar manifest with module hash and deployment binding.",
      }),
      Object.freeze({
        id: "{bscNetwork}-runtime-prover-config",
        kind: "url",
        placeholder: "<{bscNetwork}-runtime-prover-config-url>",
        description:
          "Runtime prover config selecting the route-bound browser prover modules.",
      }),
      Object.freeze({
        id: "walletconnect-project-id",
        kind: "operator-environment",
        placeholder: "<walletconnect-project-id>",
        description:
          "WalletConnect project id configured for BSC wallet approval flows.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "smoke-walletconnect-configured",
      "smoke-runtime-prover-configured",
      "smoke-destination-prover-configured",
      "smoke-source-prover-configured",
      "material-runtime-prover-configured",
      "material-destination-prover-configured",
      "material-source-prover-configured",
    ]),
    commands: Object.freeze([
      "npm run e2e:sccp:bsc-runtime-prover-config -- --bsc-network {bscNetwork}",
      "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network {bscNetwork}",
    ]),
  }),
  Object.freeze({
    id: "publish-offline-full-toml-evidence",
    title: "Publish offline full-TOML evidence",
    detail:
      "Publish the generated offline full-TOML hash through the on-chain production route manifest, then refresh public route, peer, and smoke evidence so all reports bind to the same post-deploy hash.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "production-route-manifest",
        kind: "file",
        placeholder: "<production-route.manifest.json>",
        description:
          "Production route manifest carrying postDeployLiveEvidence.offlineFullTomlSha256.",
      }),
      Object.freeze({
        id: "offline-full-toml-evidence",
        kind: "file",
        placeholder: "<offline-full-toml-evidence.json>",
        description:
          "Generated full TAIRA config evidence emitted by route-config.",
      }),
      Object.freeze({
        id: "{bscNetwork}-bsc-deployment-evidence",
        kind: "file",
        placeholder: "<{bscNetwork}-deployment-evidence.json>",
        description:
          "BSC deployment evidence generated from live contract deployment and readback.",
      }),
      Object.freeze({
        id: "taira-burn-record-contract",
        kind: "file",
        placeholder: "<taira-burn-record.contract.json>",
        description:
          "Compiled TAIRA burn-record IVM contract artifact used by the BSC route manifest.",
      }),
      Object.freeze({
        id: "canonical-settlement-asset-definition-id",
        kind: "asset-definition-id",
        placeholder: "<canonical-asset-definition-id>",
        description:
          "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
      }),
      Object.freeze({
        id: "native-evm-prover-bundle",
        kind: "file",
        placeholder: "<native-evm-prover-bundle.json>",
        description:
          "SDK-validated native EVM prover bundle bound to the production BSC route.",
      }),
      Object.freeze({
        id: "post-deploy-live-evidence",
        kind: "hashes-and-urls",
        placeholder:
          "<source-event/route-canary/full-config hashes and explorer urls>",
        description:
          "Live source-event, route-canary, and merged full-config evidence for the production-ready route manifest.",
      }),
      Object.freeze({
        id: "deployed-taira-base-config",
        kind: "file",
        placeholder: "<deployed-taira-config.toml>",
        description:
          "Deployed TAIRA peer config used to render the merged full route config.",
      }),
      Object.freeze({
        id: "taira-route-publication-channel",
        kind: "operator-environment",
        placeholder: "<taira-route-publication-channel>",
        description:
          "Operator-controlled route-manifest ISI publication path for the full-TOML hash.",
      }),
      Object.freeze({
        id: "peer-config-audit-source",
        kind: "directory-or-remote",
        placeholder: "<peer-config-audit-source>",
        description:
          "Peer configuration source used to verify the published post-deploy evidence.",
      }),
    ]),
    blockedByCheckIds: Object.freeze(["offline-full-toml-publication"]),
    commands: Object.freeze([
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest <production-route.manifest.json> --base-config <deployed-taira-config.toml> --out <production-route.full-taira-config.toml> --write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --evidence <{bscNetwork}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --destination-browser-prover-manifest <destination-browser-prover-manifest.json> --source-browser-prover-manifest <source-browser-prover-manifest.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --full-toml-ready true --offline-full-toml-evidence <offline-full-toml-evidence.json> --production-ready true --live-readback-checked true {routeManifestConfirmation} --out <production-route.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --account <route-manager-account-id>",
      "npm run e2e:sccp:bsc-preflight -- --bsc-network {bscNetwork}",
      "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network {bscNetwork} --dir <peer-config-audit-source>",
    ]),
  }),
  Object.freeze({
    id: "remove-stale-peer-route-overrides",
    title: "Remove stale peer route overrides",
    detail:
      "Remove local BSC SCCP route/prover material from TAIRA peer configs; production route material is published on-chain through UpsertSccpRouteManifest.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "taira-peer-config-targets",
        kind: "operator-environment",
        placeholder: "<taira-peer-config-targets>",
        description:
          "TAIRA peer configuration targets to clean of local BSC route/prover overrides.",
      }),
      Object.freeze({
        id: "peer-config-audit-source",
        kind: "directory-or-remote",
        placeholder: "<peer-config-audit-source>",
        description:
          "Local or remote peer configuration source used by the audit after rollout.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "peer-config-audit-ready",
      "cross-report-binding",
      "smoke-peer-audit-binding",
    ]),
    commands: Object.freeze([
      "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network {bscNetwork} --dir <peer-config-audit-source>",
    ]),
  }),
  Object.freeze({
    id: "refresh-peer-audit-evidence",
    title: "Refresh peer audit evidence",
    detail:
      "Regenerate the peer-config audit from local peer config files or the configured remote TAIRA peer source instead of preserving an existing report.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "peer-config-audit-source",
        kind: "directory-or-remote",
        placeholder: "<peer-config-audit-source>",
        description:
          "Local peer config directory/files or remote peer-audit SSH source used to regenerate sanitized peer evidence.",
      }),
    ]),
    blockedByCheckIds: Object.freeze(["peer-audit-refresh-source"]),
    commands: Object.freeze([
      "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network {bscNetwork} --dir <peer-config-audit-source>",
      "npm run e2e:sccp:bsc-production-gate -- --refresh true --bsc-network {bscNetwork} --peer-audit-dir <peer-config-audit-source>",
    ]),
  }),
  Object.freeze({
    id: "refresh-readiness-evidence",
    title: "Refresh BSC readiness evidence",
    detail:
      "Regenerate fresh route preflight, peer audit, smoke readiness, and production material inventory reports after publishing the production route and prover material.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "reachable-taira-torii",
        kind: "url",
        placeholder: "<taira-torii-url>",
        description:
          "Reachable TAIRA Torii endpoint serving the public BSC SCCP route.",
      }),
      Object.freeze({
        id: "{bscNetwork}-bsc-rpc-endpoint",
        kind: "url",
        placeholder: "<{bscNetwork}-bsc-rpc-url>",
        description:
          "Selected BSC RPC endpoint used for contract readback and smoke readiness.",
      }),
      Object.freeze({
        id: "public-route-report",
        kind: "file",
        placeholder: "<route-preflight-report.json>",
        description:
          "Fresh public route preflight report from TAIRA for the selected BSC network.",
      }),
      Object.freeze({
        id: "{bscNetwork}-public-route-report",
        kind: "file",
        placeholder: "<{bscNetwork}-route-preflight-report.json>",
        description:
          "Profile-specific public route preflight report consumed by BSC smoke readiness.",
      }),
      Object.freeze({
        id: "{bscNetwork}-peer-config-audit-report",
        kind: "file",
        placeholder: "<{bscNetwork}-peer-config-audit-report.json>",
        description:
          "Profile-specific TAIRA peer-config audit report consumed by BSC smoke readiness.",
      }),
      Object.freeze({
        id: "peer-config-audit-source",
        kind: "directory-or-remote",
        placeholder: "<peer-config-audit-source>",
        description: "Peer configuration source used by the readiness audit.",
      }),
      Object.freeze({
        id: "production-material-scan-path",
        kind: "directory",
        placeholder: "<production-material-scan-path>",
        description:
          "Directory containing production route, verifier, prover, and audit artifacts.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "evidence-freshness",
      "route-preflight-ready",
      "smoke-readiness-ready",
      "smoke-readiness-binding",
      "cross-report-binding",
      "production-material-inventory",
    ]),
    commands: Object.freeze([
      "npm run e2e:sccp:bsc-production-gate -- --refresh true --bsc-network {bscNetwork}",
    ]),
  }),
  Object.freeze({
    id: "record-live-video-proof",
    title: "Record live UI proof video",
    detail:
      "Record the SCCP UI flow showing TAIRA-to-BSC transfer, BSC testnet explorer proof, BSC-to-TAIRA return, and final TAIRA settlement, then rerun the gate with proof file reverification.",
    requiredInputs: Object.freeze([
      Object.freeze({
        id: "ready-route-peer-smoke-material-reports",
        kind: "reports",
        placeholder: "<ready-production-gate-prerequisite-reports>",
        description:
          "Ready route preflight, peer audit, smoke readiness, and material inventory reports.",
      }),
      Object.freeze({
        id: "funded-taira-wallet",
        kind: "secure-wallet",
        placeholder: "<funded-taira-wallet>",
        description:
          "Funded TAIRA wallet available through the app secure vault for the live UI flow.",
      }),
      Object.freeze({
        id: "{bscNetwork}-wallet-session",
        kind: "wallet-session",
        placeholder: "<{bscNetwork}-walletconnect-session>",
        description:
          "BSC wallet session for approving finalize and return transactions.",
      }),
      Object.freeze({
        id: "bsc-explorer-screenshots",
        kind: "image-files",
        placeholder: "<bsc-explorer-screenshots>",
        description:
          "Explorer screenshots for the BSC finalize and return transaction hashes.",
      }),
      Object.freeze({
        id: "sccp-ui-proof-video",
        kind: "video-file",
        placeholder: "<sccp-ui-proof-video.webm>",
        description:
          "Recorded SCCP UI video covering TAIRA to BSC and BSC back to TAIRA.",
      }),
    ]),
    blockedByCheckIds: Object.freeze([
      "video-proof-transcript-present",
      "video-readiness-binding",
      "video-artifact-captured",
      "video-proof-files-reverified",
      "video-proof-complete",
    ]),
    commands: Object.freeze([
      "npm run e2e:sccp:bsc-video -- --bsc-network {bscNetwork}",
      "npm run e2e:sccp:bsc-production-gate -- --bsc-network {bscNetwork} --require-reverified-video-proof-files true",
    ]),
  }),
]);

const productionGateReplaceProfilePlaceholders = (value, bscProfile) =>
  typeof value === "string"
    ? value
        .replace(/\{bscNetwork\}/gu, bscProfile.key)
        .replace(
          /\{confirmNetwork\}/gu,
          `${SCCP_BSC_XOR_ROUTE_ID}:${bscProfile.key}`,
        )
        .replace(
          /\{mainnetConfirmation\}/gu,
          bscProfile.key === "mainnet" ? " --confirm-mainnet true" : "",
        )
        .replace(
          /\{routeManifestConfirmation\}/gu,
          bscProfile.key === "mainnet"
            ? `--confirm-mainnet true --confirm-network ${SCCP_BSC_XOR_ROUTE_ID}`
            : `--confirm-testnet ${SCCP_BSC_XOR_ROUTE_ID}`,
        )
    : value;

const productionGateNextActionCommands = (commands, bscProfile) =>
  commands.map((command) =>
    productionGateReplaceProfilePlaceholders(command, bscProfile),
  );

const productionGateNextActionRequiredInputs = (
  inputs,
  bscProfile,
  failedIds,
) =>
  (Array.isArray(inputs) ? inputs : []).flatMap((input) => {
    const requiredWhenCheckIds = Array.isArray(input.requiredWhenCheckIds)
      ? input.requiredWhenCheckIds
      : [];
    if (
      requiredWhenCheckIds.length > 0 &&
      !requiredWhenCheckIds.some((id) => failedIds.has(id))
    ) {
      return [];
    }
    return [
      Object.fromEntries(
        Object.entries(input)
          .filter(([key]) => key !== "requiredWhenCheckIds")
          .map(([key, value]) => [
            key,
            productionGateReplaceProfilePlaceholders(value, bscProfile),
          ]),
      ),
    ];
  });

const productionGateMergeMissingInput = (
  byId,
  input,
  blockedByActions,
  { childActionField = null } = {},
) => {
  if (!input?.id) {
    return;
  }
  const childField =
    typeof childActionField === "string" && childActionField.trim()
      ? childActionField
      : null;
  const actions = (Array.isArray(blockedByActions) ? blockedByActions : [])
    .filter((action) => typeof action === "string")
    .map(safeCheckId)
    .filter(Boolean);
  const existing = byId.get(input.id);
  if (existing) {
    const target = childField ?? "blockedByActions";
    if (!Array.isArray(existing[target])) {
      existing[target] = [];
    }
    for (const action of actions) {
      if (!existing[target].includes(action)) {
        existing[target].push(action);
      }
    }
    return;
  }
  if (childField) {
    return;
  }
  const blockedByActionsValue = childField ? [] : actions;
  byId.set(input.id, {
    ...input,
    blockedByActions: blockedByActionsValue,
    ...(childField && actions.length > 0 ? { [childField]: actions } : {}),
  });
};

const productionGateMissingInputs = (
  nextActions,
  routeReport,
  peerAuditReport,
  materialInventoryReport,
  smokeReadinessReport,
) => {
  const byId = new Map();
  for (const action of nextActions) {
    for (const input of action.requiredInputs ?? []) {
      productionGateMergeMissingInput(byId, input, [action.id]);
    }
  }
  const routeMissingInputs = publicRoutePreflightMissingInputSummaries(
    readArray(routeReport, "missingProductionInputs"),
  );
  for (const input of routeMissingInputs) {
    productionGateMergeMissingInput(byId, input, input.blockedByActions, {
      childActionField: "blockedByRouteActions",
    });
  }
  const peerMissingInputs = publicRoutePreflightMissingInputSummaries(
    readArray(peerAuditReport, "missingProductionInputs"),
  );
  for (const input of peerMissingInputs) {
    productionGateMergeMissingInput(byId, input, input.blockedByActions, {
      childActionField: "blockedByPeerActions",
    });
  }
  const materialMissingInputs = publicMaterialInventoryMissingInputSummaries(
    readArray(materialInventoryReport, "missingProductionInputs"),
  );
  for (const input of materialMissingInputs) {
    productionGateMergeMissingInput(byId, input, input.blockedByActions, {
      childActionField: "blockedByMaterialActions",
    });
  }
  const smokeMissingInputs = publicMaterialInventoryMissingInputSummaries(
    readArray(smokeReadinessReport, "missingProductionInputs"),
  );
  for (const input of smokeMissingInputs) {
    productionGateMergeMissingInput(byId, input, input.blockedByActions, {
      childActionField: "blockedBySmokeActions",
    });
  }
  return [...byId.values()];
};

const productionGateNextActions = (checks, bscProfile) => {
  const failedIds = new Set(
    Array.isArray(checks)
      ? checks
          .filter((entry) => isRecord(entry) && entry.ok !== true)
          .map((entry) => readString(entry, "id"))
          .filter(Boolean)
      : [],
  );
  return SCCP_BSC_PRODUCTION_GATE_NEXT_ACTIONS.map(
    ({ blockedByCheckIds, ...action }) => ({
      ...action,
      commands: productionGateNextActionCommands(action.commands, bscProfile),
      requiredInputs: productionGateNextActionRequiredInputs(
        action.requiredInputs,
        bscProfile,
        failedIds,
      ),
      blockedByChecks: blockedByCheckIds.filter((id) => failedIds.has(id)),
    }),
  ).filter((action) => action.blockedByChecks.length > 0);
};

const secretLikeText = (value) => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    SECRET_VALUE_PATTERN.test(normalized)
  ) {
    return true;
  }
  const words = normalized.toLowerCase().split(" ");
  return (
    BIP39_WORD_COUNTS.has(words.length) &&
    validateMnemonic(words.join(" "), wordlist)
  );
};

const scanSecretLike = (value, seen = new WeakSet()) => {
  if (typeof value === "string") {
    return secretLikeText(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return ownArrayValues(value).some((entry) => scanSecretLike(entry, seen));
  }
  if (!isRecord(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  return ownRecordEntries(value).some(
    ([key, entry]) =>
      SECRET_KEY_PATTERN.test(key) || scanSecretLike(entry, seen),
  );
};

const diagnosticTextValue = (value) => {
  if (typeof value === "string") {
    return /\bdiagnostic\b/iu.test(value);
  }
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) => diagnosticTextValue(entry));
  }
  if (isRecord(value)) {
    return ownRecordEntries(value).some(([, entry]) =>
      diagnosticTextValue(entry),
    );
  }
  return false;
};

const scanDiagnosticMaterial = (value) => {
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) => scanDiagnosticMaterial(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return ownRecordEntries(value).some(([key, entry]) => {
    if (DIAGNOSTIC_FLAG_KEYS.has(key) && entry === true) {
      return true;
    }
    if (DIAGNOSTIC_TEXT_KEYS.has(key) && diagnosticTextValue(entry)) {
      return true;
    }
    return scanDiagnosticMaterial(entry);
  });
};

const pickVerifierField = (record, names) => {
  for (const name of names) {
    if (hasOwn(record, name)) {
      return readOwnValue(record, name);
    }
  }
  return undefined;
};
const flattenOwnArrayValues = (value, output = [], seen = new WeakSet()) => {
  if (!Array.isArray(value)) {
    output.push(value);
    return output;
  }
  if (seen.has(value)) {
    return output;
  }
  seen.add(value);
  try {
    for (const entry of ownArrayValues(value)) {
      flattenOwnArrayValues(entry, output, seen);
    }
  } finally {
    seen.delete(value);
  }
  return output;
};

const normalizeUint256 = (value) => {
  const text = trim(value);
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(text)) {
    throw new Error("not uint256");
  }
  const parsed = BigInt(text);
  if (parsed < 0n || parsed >= 2n ** 256n) {
    throw new Error("out of range");
  }
  return parsed.toString();
};

const normalizeVerifierVector = (record, names, expectedLength) => {
  const value = pickVerifierField(record, names);
  if (!Array.isArray(value)) {
    throw new Error("missing vector");
  }
  const flattened = flattenOwnArrayValues(value).map((entry) =>
    normalizeUint256(entry),
  );
  if (flattened.length !== expectedLength) {
    throw new Error("wrong vector length");
  }
  return flattened;
};

const normalizeBn254FieldElement = (value) => {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BN254_BASE_FIELD_MODULUS) {
    throw new Error("out-of-field coordinate");
  }
  return parsed;
};

const bn254Mod = (value) => {
  const remainder = value % BN254_BASE_FIELD_MODULUS;
  return remainder >= 0n ? remainder : remainder + BN254_BASE_FIELD_MODULUS;
};

const bn254Fp2Add = (left, right) => [
  bn254Mod(left[0] + right[0]),
  bn254Mod(left[1] + right[1]),
];

const bn254Fp2Mul = (left, right) => [
  bn254Mod(left[0] * right[0] - left[1] * right[1]),
  bn254Mod(left[0] * right[1] + left[1] * right[0]),
];

const bn254Fp2Square = (value) => bn254Fp2Mul(value, value);

const bn254Fp2Cube = (value) => bn254Fp2Mul(bn254Fp2Square(value), value);

const sameBn254Fp2 = (left, right) =>
  left[0] === right[0] && left[1] === right[1];

const assertBn254G1Point = (point) => {
  if (point.length !== 2) {
    throw new Error("incomplete G1 point");
  }
  const x = normalizeBn254FieldElement(point[0]);
  const y = normalizeBn254FieldElement(point[1]);
  if (x === 0n && y === 0n) {
    throw new Error("G1 point at infinity");
  }
  if (bn254Mod(y * y) !== bn254Mod(x * x * x + 3n)) {
    throw new Error("off-curve G1 point");
  }
};

const assertBn254G1VectorPairs = (values) => {
  if (values.length % 2 !== 0) {
    throw new Error("incomplete G1 vector");
  }
  for (let offset = 0; offset < values.length; offset += 2) {
    assertBn254G1Point(values.slice(offset, offset + 2));
  }
};

const assertBn254G2Point = (point) => {
  if (point.length !== 4) {
    throw new Error("incomplete G2 point");
  }
  const x = [
    normalizeBn254FieldElement(point[0]),
    normalizeBn254FieldElement(point[1]),
  ];
  const y = [
    normalizeBn254FieldElement(point[2]),
    normalizeBn254FieldElement(point[3]),
  ];
  if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) {
    throw new Error("G2 point at infinity");
  }
  const expected = bn254Fp2Add(bn254Fp2Cube(x), BN254_TWIST_B_COEFFICIENT);
  if (!sameBn254Fp2(bn254Fp2Square(y), expected)) {
    throw new Error("off-twist G2 point");
  }
};

const recordCarriesVerifierMaterial = (record) =>
  VERIFIER_VECTOR_ALIASES.some((aliases) =>
    aliases.some((alias) => hasOwn(record, alias)),
  );

const assertBn254VerifierMaterial = (record) => {
  assertBn254G1Point(
    normalizeVerifierVector(
      record,
      ["alpha1", "configuredAlpha1", "vk_alpha_1"],
      2,
    ),
  );
  assertBn254G1VectorPairs(
    normalizeVerifierVector(record, ["ic", "configuredIc", "vk_ic", "IC"], 20),
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["beta2", "configuredBeta2", "vk_beta_2"],
      4,
    ),
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["gamma2", "configuredGamma2", "vk_gamma_2"],
      4,
    ),
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["delta2", "configuredDelta2", "vk_delta_2"],
      4,
    ),
  );
};

const sameVerifierVector = (actual, expected) =>
  actual.length === expected.length &&
  actual.every((entry, index) => entry === expected[index]);

const isSmokeFixtureGroth16VerifierMaterial = (record) => {
  try {
    return (
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["alpha1", "configuredAlpha1", "vk_alpha_1"],
          2,
        ),
        SMOKE_FIXTURE_G1,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["beta2", "configuredBeta2", "vk_beta_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["gamma2", "configuredGamma2", "vk_gamma_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["delta2", "configuredDelta2", "vk_delta_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["ic", "configuredIc", "vk_ic", "IC"],
          20,
        ),
        SMOKE_FIXTURE_IC,
      )
    );
  } catch (_error) {
    return false;
  }
};

const scanSmokeFixtureVerifierMaterial = (value, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) =>
      scanSmokeFixtureVerifierMaterial(entry, seen),
    );
  }
  return (
    isSmokeFixtureGroth16VerifierMaterial(value) ||
    ownRecordEntries(value).some(([, entry]) =>
      scanSmokeFixtureVerifierMaterial(entry, seen),
    )
  );
};

const scanInvalidBn254VerifierMaterial = (value, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) =>
      scanInvalidBn254VerifierMaterial(entry, seen),
    );
  }
  if (recordCarriesVerifierMaterial(value)) {
    try {
      assertBn254VerifierMaterial(value);
    } catch (_error) {
      return true;
    }
  }
  return ownRecordEntries(value).some(([, entry]) =>
    scanInvalidBn254VerifierMaterial(entry, seen),
  );
};

const scanDiagnosticBscVerifierKeyHash = (value, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) =>
      scanDiagnosticBscVerifierKeyHash(entry, seen),
    );
  }
  for (const [key, entry] of ownRecordEntries(value)) {
    if (
      VERIFIER_KEY_HASH_ALIASES.has(key) &&
      DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(normalizeHex(entry))
    ) {
      return true;
    }
    if (scanDiagnosticBscVerifierKeyHash(entry, seen)) {
      return true;
    }
  }
  return false;
};

const safeDiagnosticText = (value) => {
  const normalized = trim(value).replace(/\s+/gu, " ");
  if (!normalized) {
    return null;
  }
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    secretLikeText(normalized)
  ) {
    return REDACTED_SECRET_DETAIL;
  }
  return normalized.length > MAX_FAILURE_SUMMARY_LENGTH
    ? `${normalized.slice(0, MAX_FAILURE_SUMMARY_LENGTH - 3)}...`
    : normalized;
};

const safeCheckId = (value) => {
  const sanitized = safeDiagnosticText(value);
  if (!sanitized || sanitized === REDACTED_SECRET_DETAIL) {
    return "redacted-check";
  }
  const normalized = sanitized
    .replace(/[^a-z0-9_.:-]+/giu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized ? normalized.slice(0, 96) : "failed-check";
};

const failedCheckStatus = (entry) => {
  if (!isRecord(entry)) {
    return false;
  }
  if (hasOwn(entry, "ok") && entry.ok === false) {
    return true;
  }
  const status = trim(readString(entry, "status")).toLowerCase();
  return ["fail", "failed", "error"].includes(status);
};

const failedCheckDetail = (checks, max = MAX_FAILURE_SUMMARIES) => {
  if (!Array.isArray(checks)) {
    return "";
  }
  const failed = checks.filter(failedCheckStatus);
  if (!failed.length) {
    return "";
  }
  const summaries = failed.slice(0, max).map((entry) => {
    const id = safeCheckId(
      readString(entry, "id") ||
        readString(entry, "check") ||
        readString(entry, "name") ||
        "check",
    );
    const detail =
      safeDiagnosticText(
        readString(entry, "detail") ||
          readString(entry, "details") ||
          readString(entry, "reason") ||
          readString(entry, "message") ||
          readString(entry, "label"),
      ) || "";
    return detail && detail !== id ? `${id}: ${detail}` : id;
  });
  if (failed.length > max) {
    summaries.push(`${failed.length - max} more failed checks`);
  }
  return summaries.join("; ");
};

const reportLoadErrorDetail = (report, label) => {
  const loadError = safeDiagnosticText(readString(report, "loadError"));
  return loadError ? `${label} load error: ${loadError}.` : "";
};

const routeReadinessFailureDetail = ({
  report,
  routeSummary = report,
  label,
  requireManifestSource = true,
  requireRouteReady = false,
  generic = `${label} report is missing, wrong route, or not ready.`,
}) => {
  if (!isRecord(report)) {
    return `${label} report is missing.`;
  }
  const problems = [];
  const loadError = reportLoadErrorDetail(report, label);
  if (loadError) {
    problems.push(loadError);
  }
  const route = isRecord(routeSummary) ? routeSummary : report;
  if (requireManifestSource) {
    const manifestSource = readString(route, "manifestSource");
    if (manifestSource && manifestSource !== "torii") {
      problems.push(`${label} report is local-only (${manifestSource}).`);
    } else if (!manifestSource) {
      problems.push(`${label} public TAIRA manifest source is missing.`);
    }
  }
  const routeId = readString(route, "routeId");
  const assetKey = readString(route, "assetKey");
  problems.push(...routeIdentityProblemDetails(route, label));
  if (routeId && routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(`${label} report is for wrong route (${routeId}).`);
  } else if (!routeId) {
    problems.push(`${label} route id is missing.`);
  }
  if (assetKey && assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(`${label} report is for wrong asset key (${assetKey}).`);
  } else if (!assetKey) {
    problems.push(`${label} asset key is missing.`);
  }
  if (!readBoolean(report, "ready")) {
    problems.push(`${label} report is not ready.`);
  }
  if (requireRouteReady && !readBoolean(report, "routeReady")) {
    problems.push(`${label} routeReady is not true.`);
  }
  const failed = failedCheckDetail(readArray(report, "checks"));
  if (failed) {
    problems.push(`${label} failed checks: ${failed}.`);
  }
  return problems.join(" ") || generic;
};

const peerAuditFailureDetail = (peerAuditReport) => {
  const detail = routeReadinessFailureDetail({
    report: peerAuditReport,
    label: "peer audit",
    requireManifestSource: false,
    generic: "peer audit report is missing, wrong route, or not ready.",
  });
  const problems = detail ? [detail] : [];
  const peerSummaries = readArray(peerAuditReport, "peers");
  if (Array.isArray(peerSummaries)) {
    const peerFailures = peerSummaries
      .filter(isRecord)
      .map((peer, index) => {
        const failed = failedCheckDetail(readArray(peer, "failedChecks"), 4);
        if (readBoolean(peer, "ready") && !failed) {
          return "";
        }
        return failed
          ? `peer ${index}: ${failed}.`
          : `peer ${index}: not ready.`;
      })
      .filter(Boolean);
    problems.push(...peerFailures.slice(0, 8));
    if (peerFailures.length > 8) {
      problems.push(`${peerFailures.length - 8} more peer failures.`);
    }
  }
  return problems.join(" ");
};

const peerEvidenceHashProblems = (peerAuditReport) => {
  const problems = requiredPeerAuditCheckProblems(peerAuditReport);
  const rawPeers = readArray(peerAuditReport, "peers");
  if (!Array.isArray(rawPeers)) {
    problems.push("peer audit report does not include peer summaries.");
    return problems;
  }
  if (rawPeers.length === 0) {
    problems.push("peer audit report does not include peer summaries.");
    return problems;
  }
  rawPeers.forEach((peer, index) => {
    if (!isRecord(peer)) {
      problems.push(`peer audit peer summary ${index} is not an object.`);
    }
  });
  if (
    !Number.isSafeInteger(readNumber(peerAuditReport, "peerCount")) ||
    readNumber(peerAuditReport, "peerCount") <= 0
  ) {
    problems.push("peer audit peerCount is missing or invalid.");
  } else if (readNumber(peerAuditReport, "peerCount") !== rawPeers.length) {
    problems.push("peer audit peerCount does not match peer summaries.");
  }
  if (!readBoolean(peerAuditReport, "sanitizedStanzaFilesChecked")) {
    problems.push("peer audit sanitized stanza files were not checked.");
  }
  const peers = rawPeers.filter(isRecord);
  problems.push(
    ...peers.flatMap((peer, index) => {
      const problems = [];
      if (!readBoolean(peer, "ready")) {
        problems.push(`peer ${index} is not ready.`);
      }
      const routeCount = readNumber(peer, "routeCount");
      if (routeCount !== 0) {
        problems.push(
          `peer ${index} carries ${routeCount ?? "unknown"} stale BSC route stanza(s).`,
        );
      }
      if (
        Array.isArray(readArray(peer, "failedChecks")) &&
        readArray(peer, "failedChecks").length > 0
      ) {
        problems.push(`peer ${index} carries failed peer checks.`);
      }
      const hashRoleProblems = readArray(peer, "hashRoleProblems");
      if (!Array.isArray(hashRoleProblems)) {
        problems.push(`peer ${index} hashRoleProblems summary is missing.`);
      } else if (hashRoleProblems.length > 0) {
        problems.push(
          `peer ${index} carries invalid BSC route hash role separation.`,
        );
      }
      const burnRecordMaterialProblems = readArray(
        peer,
        "burnRecordMaterialProblems",
      );
      if (!Array.isArray(burnRecordMaterialProblems)) {
        problems.push(
          `peer ${index} burnRecordMaterialProblems summary is missing.`,
        );
      } else if (burnRecordMaterialProblems.length > 0) {
        problems.push(
          `peer ${index} carries invalid TAIRA burn-record material.`,
        );
      }
      const rawTomlSha256 = readString(peer, "rawTomlSha256");
      if (!NON_ZERO_HEX32_PATTERN.test(rawTomlSha256)) {
        problems.push(`peer ${index} rawTomlSha256 is missing or invalid.`);
      }
      const sanitizedStanzaSha256 = readString(peer, "sanitizedStanzaSha256");
      if (!NON_ZERO_HEX32_PATTERN.test(sanitizedStanzaSha256)) {
        problems.push(
          `peer ${index} sanitizedStanzaSha256 is missing or invalid.`,
        );
      }
      const sanitizedStanzaFileSha256 = readString(
        peer,
        "sanitizedStanzaFileSha256",
      );
      const sanitizedStanzaFileVerificationError = readString(
        peer,
        "sanitizedStanzaFileVerificationError",
      );
      if (!readBoolean(peer, "sanitizedStanzaFileChecked")) {
        problems.push(`peer ${index} sanitized stanza file was not checked.`);
      } else if (!readBoolean(peer, "sanitizedStanzaFileVerified")) {
        problems.push(
          sanitizedStanzaFileVerificationError
            ? `peer ${index} sanitized stanza file ${sanitizedStanzaFileVerificationError}.`
            : `peer ${index} sanitized stanza file not verified.`,
        );
      } else if (
        sanitizedStanzaFileSha256 &&
        !NON_ZERO_HEX32_PATTERN.test(sanitizedStanzaFileSha256)
      ) {
        problems.push(`peer ${index} sanitized stanza file hash is invalid.`);
      } else if (
        readBoolean(peer, "sanitizedStanzaFileChecked") &&
        !sanitizedStanzaFileSha256
      ) {
        problems.push(
          `peer ${index} sanitized stanza file hash is missing or invalid.`,
        );
      } else if (
        sanitizedStanzaFileSha256 &&
        NON_ZERO_HEX32_PATTERN.test(
          readString(peer, "sanitizedStanzaSha256"),
        ) &&
        sanitizedStanzaFileSha256 !== readString(peer, "sanitizedStanzaSha256")
      ) {
        problems.push(`peer ${index} sanitized stanza file hash mismatched.`);
      }
      return problems;
    }),
  );
  return problems;
};

const smokeReadinessFailureDetail = (smokeReadinessReport) =>
  routeReadinessFailureDetail({
    report: smokeReadinessReport,
    routeSummary: readRecord(smokeReadinessReport, "route"),
    label: "smoke-readiness",
    requireRouteReady: true,
    generic: "smoke-readiness report is missing, wrong route, or not ready.",
  });

const reportCheckPassed = (checks, id) =>
  Array.isArray(checks) &&
  checks.some(
    (entry) =>
      isRecord(entry) &&
      readString(entry, "id") === id &&
      (readBoolean(entry, "ok") ||
        trim(readString(entry, "status")).toLowerCase() === "pass"),
  );

const reportCheckIntegrityProblems = (report, label) => {
  if (!isRecord(report)) {
    return [`${label} report is missing.`];
  }
  const checks = readArray(report, "checks");
  if (!Array.isArray(checks)) {
    return [`${label} report checks are missing or invalid.`];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of checks.entries()) {
    if (!isRecord(entry)) {
      problems.push(`${label} check ${index} is not an object.`);
      continue;
    }
    const id = readString(entry, "id");
    const checkLabel = id || `index ${index}`;
    const idAliases = presentStringAliases(entry, PUBLIC_CHECK_ID_ALIASES);
    if (idAliases.length > 1) {
      problems.push(
        `${label} check ${checkLabel} id uses multiple aliases: ${idAliases.join(", ")}.`,
      );
    }
    if (!id) {
      problems.push(`${label} check ${index} id is missing.`);
    } else if (seen.has(id)) {
      problems.push(`${label} check id ${id} is duplicated.`);
    } else {
      seen.add(id);
    }
    const hasOk = hasOwn(entry, "ok") && typeof entry.ok === "boolean";
    const status = trim(readString(entry, "status")).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `${label} check ${checkLabel} has no machine-readable pass/fail state.`,
      );
    }
    if (
      hasOk &&
      hasStatus &&
      readBoolean(entry, "ok") !== (status === "pass")
    ) {
      problems.push(
        `${label} check ${checkLabel} has contradictory ok/status.`,
      );
    }
  }
  return problems;
};

const requiredRoutePreflightCheckIds = (
  profile = resolveBscNetworkProfile("testnet"),
) => [
  ...REQUIRED_ROUTE_PREFLIGHT_COMMON_CHECK_IDS,
  profile.key === "testnet" ? "bsc-testnet-chain-id" : "bsc-mainnet-chain-id",
  profile.key === "testnet"
    ? "bsc-testnet-network-id"
    : "bsc-mainnet-network-id",
];

const requiredRoutePreflightCheckProblems = (
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  if (!isRecord(routeReport)) {
    return [];
  }
  const problems = [];
  for (const id of requiredRoutePreflightCheckIds(profile)) {
    if (!reportCheckPassed(readArray(routeReport, "checks"), id)) {
      problems.push(`route preflight report is missing passing ${id} check.`);
    }
  }
  return problems;
};

const requiredPeerAuditCheckProblems = (peerAuditReport) => {
  if (!isRecord(peerAuditReport)) {
    return ["peer audit report is missing."];
  }
  const problems = [];
  for (const id of REQUIRED_PEER_AUDIT_CHECK_IDS) {
    if (!reportCheckPassed(readArray(peerAuditReport, "checks"), id)) {
      problems.push(`peer audit report is missing passing ${id} check.`);
    }
  }
  return problems;
};

const peerAuditRefreshProblems = (peerAuditRefresh, peerAuditReport) => {
  if (!isRecord(peerAuditRefresh)) {
    return [];
  }
  if (readString(peerAuditRefresh, "mode") !== "preserved") {
    return [];
  }
  const problems = [
    "production-gate refresh was requested without local or remote peer-audit inputs, so the peer audit report was preserved instead of regenerated.",
  ];
  if (!isRecord(peerAuditReport)) {
    problems.push("no existing peer audit report was available to preserve.");
    return problems;
  }
  const missingRequiredChecks = requiredPeerAuditCheckProblems(peerAuditReport);
  if (missingRequiredChecks.length > 0) {
    problems.push(
      `preserved peer audit report is incomplete: ${missingRequiredChecks.join(" ")}`,
    );
  }
  const failed = failedCheckDetail(readArray(peerAuditReport, "checks"));
  if (failed) {
    problems.push(
      `preserved peer audit report contains failed checks: ${failed}.`,
    );
  }
  return problems;
};

const peerAuditRefreshMessage = (peerAuditRefresh) => {
  if (!isRecord(peerAuditRefresh)) {
    return "Peer audit evidence provenance is accepted for a non-refresh production-gate run.";
  }
  const mode = readString(peerAuditRefresh, "mode");
  if (mode === "regenerated") {
    const inputSource = readString(peerAuditRefresh, "inputSource");
    return inputSource
      ? `Peer audit evidence was regenerated from explicit ${inputSource} production-gate refresh input.`
      : "Peer audit evidence was regenerated from explicit production-gate refresh input.";
  }
  if (mode === "preserved") {
    return "Peer audit evidence preservation during production-gate refresh is audited.";
  }
  return "Peer audit evidence provenance is audited.";
};

const bscBurnRecordProductionMaterialProblems = (
  routeReport,
  materialInventoryReport,
) => {
  const problems = [];
  if (!isRecord(routeReport)) {
    problems.push("route preflight report is missing.");
  } else if (
    !reportCheckPassed(
      readArray(routeReport, "checks"),
      "taira-burn-record-material",
    )
  ) {
    problems.push(
      "route preflight report is missing passing taira-burn-record-material check.",
    );
  }
  if (!isRecord(materialInventoryReport)) {
    problems.push("production material inventory report is missing.");
    return problems;
  }
  if (
    !reportCheckPassed(
      readArray(materialInventoryReport, "checks"),
      "production-burn-record-material",
    )
  ) {
    problems.push(
      "production material inventory is missing passing production-burn-record-material check.",
    );
  }
  const inventoryFiles = readArray(materialInventoryReport, "files") ?? [];
  for (const [index, file] of inventoryFiles.entries()) {
    if (!isRecord(file)) {
      continue;
    }
    const routeFile = readRecord(file, "route");
    const burnRecordProblems = readArray(
      routeFile,
      "burnRecordArtifactProductionProblems",
    );
    if (Array.isArray(burnRecordProblems) && burnRecordProblems.length > 0) {
      problems.push(
        `production material inventory file ${index} carries invalid TAIRA burn-record material.`,
      );
    }
    const findings = readArray(file, "findings");
    if (!Array.isArray(findings)) {
      continue;
    }
    for (const finding of findings) {
      if (
        isRecord(finding) &&
        readString(finding, "id") === "production-ready-placeholder-burn-record"
      ) {
        problems.push(
          `production material inventory file ${index} reports invalid TAIRA burn-record material.`,
        );
      }
    }
  }
  return problems;
};

const requiredSmokeReadinessCheckProblems = (smokeReadinessReport) => {
  if (!isRecord(smokeReadinessReport)) {
    return ["smoke-readiness report is missing."];
  }
  const problems = [];
  for (const id of REQUIRED_SMOKE_READINESS_CHECK_IDS) {
    if (!reportCheckPassed(readArray(smokeReadinessReport, "checks"), id)) {
      problems.push(`smoke-readiness report is missing passing ${id} check.`);
    }
  }
  const failed = failedCheckDetail(readArray(smokeReadinessReport, "checks"));
  if (failed) {
    problems.push(`smoke-readiness report contains failed checks: ${failed}.`);
  }
  return problems;
};

const specificReportCheckProblems = (report, label, checkIds) => {
  if (!isRecord(report)) {
    return [`${label} report is missing.`];
  }
  const checks = readArray(report, "checks");
  const problems = [];
  for (const id of checkIds) {
    if (!reportCheckPassed(checks, id)) {
      problems.push(`${label} report is missing passing ${id} check.`);
    }
  }
  const targetFailed = Array.isArray(checks)
    ? checks.filter(
        (entry) =>
          isRecord(entry) &&
          checkIds.includes(readString(entry, "id")) &&
          failedCheckStatus(entry),
      )
    : [];
  const failed = failedCheckDetail(targetFailed);
  if (failed) {
    problems.push(`${label} failed checks: ${failed}.`);
  }
  return problems;
};

const smokeReadinessSpecificCheckProblems = (smokeReadinessReport, checkIds) =>
  specificReportCheckProblems(
    smokeReadinessReport,
    "smoke-readiness",
    checkIds,
  );

const materialInventorySpecificCheckProblems = (
  materialInventoryReport,
  checkIds,
) =>
  specificReportCheckProblems(
    materialInventoryReport,
    "production material inventory",
    checkIds,
  );

const normalizeBrowserUrlForGate = (value, label, problems) => {
  const url = trim(value);
  if (!url) {
    problems.push(`${label} is missing.`);
    return null;
  }
  try {
    return normalizeSccpBrowserModuleUrl(url, label);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    return null;
  }
};

const browserUrlPathnameForGate = (normalizedUrl) => {
  try {
    return new URL(normalizedUrl).pathname;
  } catch (_error) {
    return normalizedUrl;
  }
};

const browserUrlPathPartsForGate = (normalizedUrl) => {
  try {
    const parsed = new URL(normalizedUrl);
    return {
      scope: `${parsed.origin}${path.posix.dirname(parsed.pathname)}/`,
      leaf: path.posix.basename(parsed.pathname),
    };
  } catch (_error) {
    return {
      scope: `${path.posix.dirname(normalizedUrl)}/`,
      leaf: path.posix.basename(normalizedUrl),
    };
  }
};

const browserManifestUrlMatchesModuleUrl = (manifestUrl, moduleUrl) => {
  if (!manifestUrl || !moduleUrl) {
    return false;
  }
  if (manifestUrl === `${moduleUrl}.manifest.json`) {
    return true;
  }
  const manifest = browserUrlPathPartsForGate(manifestUrl);
  const module = browserUrlPathPartsForGate(moduleUrl);
  const moduleStem = module.leaf.replace(/\.[^./]+$/u, "");
  return (
    manifest.scope === module.scope &&
    [`${module.leaf}.manifest.json`, `${moduleStem}.manifest.json`].includes(
      manifest.leaf,
    )
  );
};

const smokeProverUrlBinding = (prover, label, problems) => {
  const moduleUrlResult = readSingleStringAlias(
    prover,
    `${label} smoke prover moduleUrl`,
    "moduleUrl",
    "url",
  );
  problems.push(...moduleUrlResult.problems);
  const moduleUrl = normalizeBrowserUrlForGate(
    moduleUrlResult.value,
    `${label} smoke prover moduleUrl`,
    problems,
  );
  const manifestUrlResult = readSingleStringAlias(
    prover,
    `${label} smoke prover manifestUrl`,
    "manifestUrl",
    "url",
  );
  problems.push(...manifestUrlResult.problems);
  const manifestUrl = normalizeBrowserUrlForGate(
    manifestUrlResult.value,
    `${label} smoke prover manifestUrl`,
    problems,
  );
  if (moduleUrl && manifestUrl) {
    if (!browserManifestUrlMatchesModuleUrl(manifestUrl, moduleUrl)) {
      problems.push(
        `${label} smoke prover manifestUrl does not match moduleUrl.`,
      );
    }
    if (moduleUrl === manifestUrl) {
      problems.push(
        `${label} smoke prover manifestUrl must not equal moduleUrl.`,
      );
    }
    if (
      /\.(?:cjs|mjs|js|jsx|ts|tsx|wasm)$/iu.test(
        browserUrlPathnameForGate(manifestUrl),
      )
    ) {
      problems.push(
        `${label} smoke prover manifestUrl must point to manifest JSON, not executable prover code.`,
      );
    }
  }
  return { moduleUrl, manifestUrl };
};

const normalizeBrowserUrlForRuntimeCheck = (value) => {
  const url = trim(value);
  if (!url) {
    return null;
  }
  try {
    return normalizeSccpBrowserModuleUrl(url, "smoke prover module URL");
  } catch (_error) {
    return null;
  }
};

const normalizedBrowserUrlIsCheckedInRuntimeModule = (url) =>
  url === SCCP_BSC_RUNTIME_PROVER_MODULE_URL ||
  url?.endsWith("/sccp-bsc/taira-bsc-xor-prover.js") === true ||
  url?.endsWith("./public/sccp-bsc/taira-bsc-xor-prover.js") === true;

const smokeProverUsesCheckedInRuntimeModule = (prover) => {
  if (!isRecord(prover)) {
    return false;
  }
  const manifest = readRecord(prover, "manifest");
  return [readString(prover, "moduleUrl"), readString(manifest, "moduleUrl")]
    .map(normalizeBrowserUrlForRuntimeCheck)
    .some(normalizedBrowserUrlIsCheckedInRuntimeModule);
};

const runtimeConfigCarriesMaterial = (runtimeConfig) =>
  isRecord(runtimeConfig) &&
  (Boolean(readString(runtimeConfig, "configUrl")) ||
    Boolean(readString(runtimeConfig, "configSha256")) ||
    Boolean(readString(runtimeConfig, "path")) ||
    Boolean(readString(runtimeConfig, "sha256")) ||
    Number.isSafeInteger(readNumber(runtimeConfig, "sizeBytes")) ||
    isRecord(readRecord(runtimeConfig, "manifest")));

const inventoryProverUsesCheckedInRuntimeModule = (prover) => {
  if (!isRecord(prover)) {
    return false;
  }
  const module = readRecord(prover, "module");
  const sidecar = readRecord(prover, "sidecar");
  const manifest = readRecord(sidecar, "manifest");
  return [
    readString(prover, "moduleUrl"),
    readString(module, "moduleUrl"),
    readString(module, "path"),
    readString(manifest, "moduleUrl"),
  ]
    .map(normalizeBrowserUrlForRuntimeCheck)
    .some(normalizedBrowserUrlIsCheckedInRuntimeModule);
};

const smokeProverDeploymentProblems = ({
  deployment,
  routeDeployment,
  label,
}) => {
  const normalized = publicDeployment(deployment);
  const route = publicDeployment(routeDeployment);
  if (!normalized) {
    return [`${label} smoke prover manifest deployment summary is missing.`];
  }
  if (!route) {
    return [`${label} route deployment summary is missing.`];
  }
  const problems = [];
  for (const key of [
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "verifierCodeHash",
    "verifierKeyHash",
    "destinationBindingHash",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
  ]) {
    if (!normalized[key]) {
      problems.push(`${label} smoke prover manifest ${key} is missing.`);
    } else if (!route[key]) {
      problems.push(`${label} route deployment ${key} is missing.`);
    } else if (normalizeHex(normalized[key]) !== normalizeHex(route[key])) {
      problems.push(
        `${label} smoke prover manifest ${key} does not match route deployment.`,
      );
    }
  }
  return problems;
};

const smokeProverManifestProblems = ({
  prover,
  label,
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(prover)) {
    return [`${label} smoke prover summary is missing.`];
  }
  const problems = [];
  const { moduleUrl } = smokeProverUrlBinding(prover, label, problems);
  const manifest = readRecord(prover, "manifest");
  if (!manifest) {
    problems.push(`${label} smoke prover manifest is missing.`);
    return problems;
  }

  const manifestModuleUrlResult = readSingleStringAlias(
    manifest,
    `${label} smoke prover manifest moduleUrl`,
    "moduleUrl",
    "module_url",
  );
  problems.push(...manifestModuleUrlResult.problems);
  const manifestModuleUrl = normalizeBrowserUrlForGate(
    manifestModuleUrlResult.value,
    `${label} smoke prover manifest moduleUrl`,
    problems,
  );
  if (moduleUrl && manifestModuleUrl && moduleUrl !== manifestModuleUrl) {
    problems.push(`${label} smoke prover manifest moduleUrl does not match.`);
  }
  if (
    readString(manifest, "schema") !== SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA
  ) {
    problems.push(`${label} smoke prover manifest schema is invalid.`);
  }
  problems.push(
    ...routeIdentityProblemDetails(manifest, `${label} smoke prover manifest`),
  );
  if (
    readString(manifest, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    readString(manifest, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `${label} smoke prover manifest is for the wrong SCCP route.`,
    );
  }
  if (readString(manifest, "tairaChainId") !== BSC_TAIRA_CHAIN_ID) {
    problems.push(
      `${label} smoke prover manifest is not bound to TAIRA chain id.`,
    );
  }
  if (
    String(readNumber(manifest, "tairaNetworkPrefix")) !==
    String(BSC_TAIRA_NETWORK_PREFIX)
  ) {
    problems.push(
      `${label} smoke prover manifest is not bound to TAIRA network prefix.`,
    );
  }
  problems.push(
    ...bscManifestProfileBindingProblems(
      manifest,
      `${label} smoke prover manifest`,
      profile,
    ),
  );
  const expectedExport =
    label === "source" ? "bscSccpSourceProve" : "bscSccpProve";
  const expectedSelfTestExport =
    label === "source"
      ? "bscSccpSourceNativeProverSelfTest"
      : "bscSccpNativeProverSelfTest";
  const exportNames = Array.isArray(readArray(manifest, "exports"))
    ? readArray(manifest, "exports").map((entry) => trim(entry))
    : [];
  if (
    readString(manifest, "acceptedExport") !== expectedExport &&
    !exportNames.includes(expectedExport)
  ) {
    problems.push(
      `${label} smoke prover manifest does not expose ${expectedExport}.`,
    );
  }
  if (
    readString(manifest, "acceptedSelfTestExport") !== expectedSelfTestExport &&
    !exportNames.includes(expectedSelfTestExport)
  ) {
    problems.push(
      `${label} smoke prover manifest does not expose ${expectedSelfTestExport}.`,
    );
  }
  const expectedKind = label === "source" ? "bsc-source" : "bsc-destination";
  const declaredKind = readString(manifest, "kind");
  const declaredDirection = readString(manifest, "direction");
  if (
    (declaredKind && declaredKind !== expectedKind) ||
    (declaredDirection && declaredDirection !== label) ||
    (!declaredKind && !declaredDirection)
  ) {
    problems.push(`${label} smoke prover manifest kind is invalid.`);
  }
  if (!isNonZeroHex32(readString(manifest, "moduleSha256"))) {
    problems.push(
      `${label} smoke prover manifest moduleSha256 is missing or invalid.`,
    );
  }

  const routeDeployment = publicDeployment(
    readRecord(routeReport, "deployment"),
  );
  for (const key of [
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
  ]) {
    const manifestHash = readString(manifest, key);
    const routeHash = routeDeployment?.[key];
    if (!isNonZeroHex32(manifestHash)) {
      problems.push(
        `${label} smoke prover manifest ${key} is missing or invalid.`,
      );
    } else if (!isNonZeroHex32(routeHash)) {
      problems.push(`${label} route deployment ${key} is missing or invalid.`);
    } else if (normalizeHex(manifestHash) !== normalizeHex(routeHash)) {
      problems.push(
        `${label} smoke prover manifest ${key} does not match route deployment.`,
      );
    }
  }
  problems.push(
    ...smokeProverDeploymentProblems({
      deployment: readRecord(manifest, "deployment"),
      routeDeployment: readRecord(routeReport, "deployment"),
      label,
    }),
    ...deploymentBscProfileProblems(
      readRecord(manifest, "deployment"),
      `${label} smoke prover manifest`,
      profile,
    ),
  );
  if (!isRecord(readRecord(manifest, "postDeployLiveEvidence"))) {
    problems.push(`${label} smoke prover manifest live evidence is missing.`);
  } else {
    problems.push(
      ...postDeployEvidenceDiffs(
        readRecord(routeReport, "postDeployLiveEvidence"),
        readRecord(manifest, "postDeployLiveEvidence"),
        `${label} smoke prover manifest`,
        profile,
      ),
    );
  }
  return problems;
};

const smokeRuntimeConfigBindingProblems = (
  runtimeConfig,
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
  runtimeConfigRequired = false,
) => {
  if (!isRecord(runtimeConfig)) {
    return ["smoke-readiness runtime prover config summary is missing."];
  }
  if (
    hasOwn(runtimeConfig, "required") &&
    runtimeConfig.required === false &&
    runtimeConfigRequired !== true
  ) {
    return runtimeConfigCarriesMaterial(runtimeConfig)
      ? [
          "smoke-readiness runtime prover config claims it is not required but carries runtime config material.",
        ]
      : [];
  }
  const problems = [];
  if (
    hasOwn(runtimeConfig, "required") &&
    runtimeConfig.required === false &&
    runtimeConfigRequired === true
  ) {
    problems.push(
      "smoke-readiness runtime prover config claims it is not required while a checked-in runtime prover module is selected.",
    );
  } else if (
    runtimeConfigRequired === true &&
    !readBoolean(runtimeConfig, "required")
  ) {
    problems.push(
      "smoke-readiness runtime prover config is not explicitly marked required while a checked-in runtime prover module is selected.",
    );
  }
  normalizeBrowserUrlForGate(
    readString(runtimeConfig, "configUrl"),
    "smoke-readiness runtime prover config URL",
    problems,
  );
  if (!isNonZeroHex32(readString(runtimeConfig, "configSha256"))) {
    problems.push(
      "smoke-readiness runtime prover config hash is missing or invalid.",
    );
  }
  const manifest = readRecord(runtimeConfig, "manifest");
  if (!manifest) {
    problems.push("smoke-readiness runtime prover config manifest is missing.");
  } else {
    problems.push(
      ...routeIdentityProblemDetails(
        manifest,
        "smoke-readiness runtime prover config",
      ),
    );
    if (
      readString(manifest, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
      readString(manifest, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
    ) {
      problems.push(
        "smoke-readiness runtime prover config is for the wrong SCCP route.",
      );
    }
    problems.push(
      ...unsupportedRuntimeConfigFieldProblems(
        manifest,
        BSC_RUNTIME_CONFIG_KNOWN_FIELDS,
        "smoke-readiness",
      ),
    );
    if (readString(manifest, "tairaChainId") !== BSC_TAIRA_CHAIN_ID) {
      problems.push(
        "smoke-readiness runtime prover config is not bound to TAIRA chain id.",
      );
    }
    if (
      String(readNumber(manifest, "tairaNetworkPrefix")) !==
      String(BSC_TAIRA_NETWORK_PREFIX)
    ) {
      problems.push(
        "smoke-readiness runtime prover config is not bound to TAIRA network prefix.",
      );
    }
    problems.push(
      ...bscManifestProfileBindingProblems(
        manifest,
        "smoke-readiness runtime prover config",
        profile,
      ),
    );
    const routeDeployment = publicDeployment(
      readRecord(routeReport, "deployment"),
    );
    if (!routeDeployment) {
      problems.push(
        "smoke-readiness runtime prover config route deployment summary is missing.",
      );
    } else {
      problems.push(
        ...runtimeProverDirectionProblems({
          section: readRecord(manifest, "destination"),
          routeDeployment,
          label: "destination",
          direction: "destination",
        }),
        ...runtimeProverDirectionProblems({
          section: readRecord(manifest, "source"),
          routeDeployment,
          label: "source",
          direction: "source",
        }),
      );
    }
  }
  return problems;
};

const smokeReadinessBindingProblems = (
  smokeReadinessReport,
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  if (!isRecord(smokeReadinessReport)) {
    return ["smoke-readiness report is missing."];
  }
  const problems = [
    ...smokeReadinessReportShapeProblems(smokeReadinessReport),
    ...requiredSmokeReadinessCheckProblems(smokeReadinessReport),
    ...bscProfileBindingProblems(
      readRecord(readRecord(smokeReadinessReport, "route"), "bsc"),
      "smoke-readiness route",
      profile,
    ),
  ];
  const provers = readRecord(smokeReadinessReport, "provers");
  if (!provers) {
    problems.push("smoke-readiness prover summary is missing.");
  } else {
    const runtimeConfigRequired =
      smokeProverUsesCheckedInRuntimeModule(
        readRecord(provers, "destination"),
      ) || smokeProverUsesCheckedInRuntimeModule(readRecord(provers, "source"));
    problems.push(
      ...smokeProverManifestProblems({
        prover: readRecord(provers, "destination"),
        label: "destination",
        routeReport,
        profile,
      }),
      ...smokeProverManifestProblems({
        prover: readRecord(provers, "source"),
        label: "source",
        routeReport,
        profile,
      }),
      ...smokeRuntimeConfigBindingProblems(
        readRecord(provers, "runtimeConfig"),
        routeReport,
        profile,
        runtimeConfigRequired,
      ),
    );
  }
  return problems;
};

const deploymentDiffs = (left, right, label) => {
  const problems = [];
  const leftDeployment = publicDeployment(left);
  const rightDeployment = publicDeployment(right);
  if (!leftDeployment || !rightDeployment) {
    return [`${label} deployment summary is missing.`];
  }
  for (const problem of [
    ...(Array.isArray(leftDeployment.aliasProblems)
      ? leftDeployment.aliasProblems
      : []),
    ...(Array.isArray(rightDeployment.aliasProblems)
      ? rightDeployment.aliasProblems
      : []),
  ]) {
    problems.push(`${label} ${problem}.`);
  }
  const deploymentFieldMatches = (key) =>
    key === "settlementAssetDefinitionId"
      ? leftDeployment[key] === rightDeployment[key]
      : normalizeHex(leftDeployment[key]) ===
        normalizeHex(rightDeployment[key]);
  for (const key of PUBLIC_DEPLOYMENT_FIELDS) {
    if (!leftDeployment[key] || !rightDeployment[key]) {
      problems.push(`${label} ${key} is missing.`);
    } else if (!deploymentFieldMatches(key)) {
      problems.push(`${label} ${key} does not match.`);
    }
  }
  return problems;
};

const postDeployEvidenceFormatProblems = (
  evidence,
  label,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  const normalized = publicPostDeployLiveEvidence(evidence);
  if (!normalized) {
    return [`${label} post-deploy evidence summary is missing.`];
  }
  const problems = [];
  for (const problem of Array.isArray(normalized.aliasProblems)
    ? normalized.aliasProblems
    : []) {
    problems.push(`${label} ${problem}.`);
  }
  if (normalized.fullTomlReady !== true) {
    problems.push(`${label} fullTomlReady is not true.`);
  }
  for (const key of [
    "sourceBridgeConfigHash",
    "sourceEventTransactionId",
    "routeCanaryEvidenceHash",
    "routeCanaryTransactionId",
    "offlineFullTomlSha256",
  ]) {
    if (!isNonZeroHex32(normalized[key])) {
      problems.push(`${label} ${key} is missing or invalid.`);
    }
  }
  if (
    isNonZeroHex32(normalized.sourceBridgeConfigHash) &&
    isNonZeroHex32(normalized.routeCanaryEvidenceHash) &&
    normalizeHex(normalized.sourceBridgeConfigHash) ===
      normalizeHex(normalized.routeCanaryEvidenceHash)
  ) {
    problems.push(
      `${label} sourceBridgeConfigHash and routeCanaryEvidenceHash must be distinct.`,
    );
  }
  if (
    isNonZeroHex32(normalized.sourceEventTransactionId) &&
    isNonZeroHex32(normalized.routeCanaryTransactionId) &&
    normalizeHex(normalized.sourceEventTransactionId) ===
      normalizeHex(normalized.routeCanaryTransactionId)
  ) {
    problems.push(
      `${label} sourceEventTransactionId and routeCanaryTransactionId must be distinct.`,
    );
  }
  for (const [urlKey, txKey] of [
    ["sourceEventExplorerUrl", "sourceEventTransactionId"],
    ["routeCanaryExplorerUrl", "routeCanaryTransactionId"],
  ]) {
    const expectedHash = normalizeExplorerTransactionHash(normalized[txKey]);
    const urlHash = canonicalExplorerTransactionHash(normalized[urlKey], {
      bscNetwork: profile.key,
    });
    if (!urlHash) {
      problems.push(`${label} ${urlKey} is missing or invalid.`);
    } else if (expectedHash && urlHash !== expectedHash) {
      problems.push(`${label} ${urlKey} does not match ${txKey}.`);
    }
  }
  return problems;
};

const postDeployEvidenceDiffs = (
  left,
  right,
  label,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  const problems = [];
  const leftEvidence = publicPostDeployLiveEvidence(left);
  const rightEvidence = publicPostDeployLiveEvidence(right);
  if (!leftEvidence || !rightEvidence) {
    return [`${label} post-deploy evidence summary is missing.`];
  }
  problems.push(
    ...new Set([
      ...postDeployEvidenceFormatProblems(left, label, profile),
      ...postDeployEvidenceFormatProblems(right, label, profile),
    ]),
  );
  if (
    leftEvidence.fullTomlReady !== true ||
    rightEvidence.fullTomlReady !== true
  ) {
    problems.push(`${label} fullTomlReady is not true.`);
  }
  for (const problem of [
    ...(Array.isArray(leftEvidence.aliasProblems)
      ? leftEvidence.aliasProblems
      : []),
    ...(Array.isArray(rightEvidence.aliasProblems)
      ? rightEvidence.aliasProblems
      : []),
  ]) {
    problems.push(`${label} ${problem}.`);
  }
  for (const key of PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS) {
    if (!leftEvidence[key] || !rightEvidence[key]) {
      problems.push(`${label} ${key} is missing.`);
    } else if (leftEvidence[key] !== rightEvidence[key]) {
      problems.push(`${label} ${key} does not match.`);
    }
  }
  return problems;
};

const checkSummaryDiffs = (leftChecks, rightChecks, label) => {
  const left = publicCheckSummaries(leftChecks);
  const right = publicCheckSummaries(rightChecks);
  const problems = [];
  if (left.length !== right.length) {
    problems.push(`${label} check count differs.`);
  }
  for (const [index, leftCheck] of left.entries()) {
    const rightCheck = right[index];
    if (!rightCheck) {
      continue;
    }
    for (const key of ["id", "ok", "status", "message"]) {
      if (leftCheck[key] !== rightCheck[key]) {
        problems.push(`${label} check ${index} ${key} differs.`);
      }
    }
  }
  return problems;
};

const isNonZeroHex32 = (value) =>
  /^0x[0-9a-f]{64}$/iu.test(trim(value)) && !/^0x0{64}$/iu.test(trim(value));

const BSC_DEPLOYMENT_ADDRESS_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
]);

const normalizeNonZeroEvmAddress = (value) => {
  const normalized = trim(value).toLowerCase();
  return /^0x[0-9a-f]{40}$/u.test(normalized) && !/^0x0{40}$/u.test(normalized)
    ? normalized
    : "";
};

const isCanonicalTairaAssetDefinitionId = (value) =>
  TAIRA_ASSET_DEFINITION_ID_PATTERN.test(trim(value));

const deploymentAddressProblems = (deployment, label) => {
  const normalized = publicDeployment(deployment);
  if (!normalized) {
    return [`${label} deployment summary is missing.`];
  }
  const problems = [];
  const seen = new Map();
  for (const key of BSC_DEPLOYMENT_ADDRESS_FIELDS) {
    const address = normalizeNonZeroEvmAddress(normalized[key]);
    if (!address) {
      problems.push(`${label} deployment ${key} is missing or invalid.`);
      continue;
    }
    const previous = seen.get(address);
    if (previous) {
      problems.push(`${label} deployment ${key} must not equal ${previous}.`);
    } else {
      seen.set(address, key);
    }
  }
  return problems;
};

const deploymentHashProblems = (deployment, label) => {
  const normalized = publicDeployment(deployment);
  if (!normalized) {
    return [`${label} deployment summary is missing.`];
  }
  const problems = [];
  for (const key of ROLE_SEPARATED_PRODUCTION_HASH_FIELDS) {
    if (!isNonZeroHex32(normalized[key])) {
      problems.push(`${label} deployment ${key} is missing or invalid.`);
    }
  }
  problems.push(...roleSeparatedProductionHashProblems(normalized, label));
  return problems;
};

const roleSeparatedProductionHashProblems = (deployment, label) => {
  const normalized = publicDeployment(deployment);
  if (!normalized) {
    return [];
  }
  const problems = [];
  const seen = new Map();
  for (const key of ROLE_SEPARATED_PRODUCTION_HASH_FIELDS) {
    const value = readString(normalized, key);
    if (!isNonZeroHex32(value)) {
      continue;
    }
    const normalizedValue = normalizeHex(value);
    const previous = seen.get(normalizedValue);
    if (previous) {
      problems.push(`${label} ${key} must not equal ${previous}.`);
    } else {
      seen.set(normalizedValue, key);
    }
  }
  return problems;
};

const nativeEvmProverBundleRoleSeparatedHashProblems = (bundle, label) => {
  if (!isRecord(bundle)) {
    return [];
  }
  const problems = [];
  const seen = new Map();
  for (const key of NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS) {
    const value = readString(bundle, key);
    if (!isNonZeroHex32(value)) {
      continue;
    }
    const normalizedValue = normalizeHex(value);
    const previous = seen.get(normalizedValue);
    if (previous) {
      problems.push(`${label} ${key} must not equal ${previous}.`);
    } else {
      seen.set(normalizedValue, key);
    }
  }
  return problems;
};

const proofMaterialProblems = (deployment, label) => {
  const normalized = publicDeployment(deployment);
  if (!normalized) {
    return [`${label} deployment summary is missing.`];
  }
  const problems = [];
  for (const key of [
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
  ]) {
    if (!isNonZeroHex32(normalized[key])) {
      problems.push(`${label} ${key} is missing or invalid.`);
    }
  }
  problems.push(...roleSeparatedProductionHashProblems(normalized, label));
  return problems;
};

const deploymentBscProfileProblems = (
  deployment,
  label,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  const normalized = publicDeployment(deployment);
  if (!normalized) {
    return [`${label} deployment summary is missing.`];
  }
  const problems = [];
  problems.push(...deploymentAddressProblems(deployment, label));
  problems.push(...deploymentHashProblems(deployment, label));
  for (const problem of Array.isArray(normalized.aliasProblems)
    ? normalized.aliasProblems
    : []) {
    problems.push(`${label} ${problem}.`);
  }
  const networkIdHex = normalized.networkIdHex;
  if (!isNonZeroHex32(networkIdHex)) {
    problems.push(`${label} deployment networkIdHex is missing or invalid.`);
    return problems;
  }
  if (normalizeHex(networkIdHex) !== normalizeHex(profile.networkIdHex)) {
    problems.push(
      `${label} deployment networkIdHex does not match ${profile.label}.`,
    );
  }
  if (
    !isCanonicalTairaAssetDefinitionId(normalized.settlementAssetDefinitionId)
  ) {
    problems.push(
      `${label} deployment settlementAssetDefinitionId is missing or invalid.`,
    );
  }
  return problems;
};

const MATERIAL_DEPLOYMENT_EVIDENCE_ADDRESS_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
]);
const MATERIAL_DEPLOYMENT_EVIDENCE_HASH_FIELDS = Object.freeze([
  "networkIdHex",
  "verifierCodeHash",
  "verifierKeyHash",
  "destinationBindingHash",
]);
const MATERIAL_DEPLOYMENT_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-taira-xor-deployment-evidence/v1";
const REQUIRED_BSC_DEPLOYMENT_POST_DEPLOY_CHECKLIST = Object.freeze([
  "TairaXOR.bridge() equals bscBridgeAddress",
  "TairaXOR.bridgeLocked() is true",
  "SccpBscSourceBridge.owner() equals bscBridgeAddress",
  "TairaXorBscSccpBridge.destinationBindingHash() equals destinationRollout.destinationBindingHash",
  "TairaXorBscSccpBridge.verifier() equals bscVerifierAddress",
  "TairaXorBscSccpBridge verifier code/key hashes and domains match destinationRollout",
  "compiledContractCodeHashes match live bscContractReadback.codeHashes",
]);

const materialDeploymentEvidenceExpectedBindingKey = (
  routeDeployment,
  bscProfile,
) => {
  try {
    return bscDestinationBindingKey({
      networkId: bscProfile.networkIdHex,
      verifierAddress: routeDeployment.verifierAddress,
      bridgeAddress: routeDeployment.bridgeAddress,
      verifierCodeHash: routeDeployment.verifierCodeHash,
      verifierKeyHash: routeDeployment.verifierKeyHash,
    });
  } catch (_error) {
    return "";
  }
};

const materialDeploymentEvidenceReadbackProblems = ({
  readback,
  routeDeployment,
  label,
  bscProfile,
}) => {
  if (!isRecord(readback)) {
    return [`${label} bscContractReadback summary is missing.`];
  }
  const problems = [
    ...unsupportedFieldProblems(
      readback,
      MATERIAL_INVENTORY_DEPLOYMENT_READBACK_FIELDS,
      `${label} bscContractReadback`,
    ),
  ];
  const codePresent = readRecord(readback, "codePresent");
  if (!isRecord(codePresent)) {
    problems.push(`${label} bscContractReadback.codePresent is missing.`);
  } else {
    problems.push(
      ...unsupportedFieldProblems(
        codePresent,
        MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS,
        `${label} bscContractReadback.codePresent`,
      ),
    );
    for (const key of MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS) {
      if (readBoolean(codePresent, key) !== true) {
        problems.push(
          `${label} bscContractReadback.codePresent.${key} must be true.`,
        );
      }
    }
  }
  if (readString(readback, "chainIdHex") !== bscProfile.chainIdHex) {
    problems.push(
      `${label} bscContractReadback.chainIdHex must be ${bscProfile.chainIdHex}.`,
    );
  }
  const comparisons = [
    ["tokenAddress", routeDeployment.tokenAddress, "address", "tokenAddress"],
    [
      "bridgeAddress",
      routeDeployment.bridgeAddress,
      "address",
      "bridgeAddress",
    ],
    [
      "sourceBridgeAddress",
      routeDeployment.sourceBridgeAddress,
      "address",
      "sourceBridgeAddress",
    ],
    [
      "verifierAddress",
      routeDeployment.verifierAddress,
      "address",
      "verifierAddress",
    ],
    [
      "tokenBridgeAddress",
      routeDeployment.bridgeAddress,
      "address",
      "tokenBridgeAddress",
    ],
    [
      "sourceBridgeOwner",
      routeDeployment.bridgeAddress,
      "address",
      "sourceBridgeOwner",
    ],
    [
      "bridgeDestinationBindingHash",
      routeDeployment.destinationBindingHash,
      "hash",
      "bridgeDestinationBindingHash",
    ],
    [
      "bridgeVerifierAddress",
      routeDeployment.verifierAddress,
      "address",
      "bridgeVerifierAddress",
    ],
    [
      "bridgeVerifierCodeHash",
      routeDeployment.verifierCodeHash,
      "hash",
      "bridgeVerifierCodeHash",
    ],
    [
      "bridgeVerifierKeyHash",
      routeDeployment.verifierKeyHash,
      "hash",
      "verifier-key readback",
    ],
    [
      "verifierKeyHash",
      routeDeployment.verifierKeyHash,
      "hash",
      "verifierKeyHash",
    ],
    ["bridgeNetworkId", bscProfile.networkIdHex, "hash", "bridgeNetworkId"],
  ];
  for (const [key, expected, type, publicLabel] of comparisons) {
    const actual =
      type === "address"
        ? normalizeNonZeroEvmAddress(readString(readback, key))
        : normalizeHex(readString(readback, key));
    const normalizedExpected =
      type === "address"
        ? normalizeNonZeroEvmAddress(expected)
        : normalizeHex(expected);
    if (
      !actual ||
      !normalizedExpected ||
      (type === "hash" && !isNonZeroHex32(actual)) ||
      actual !== normalizedExpected
    ) {
      problems.push(
        `${label} bscContractReadback.${publicLabel} does not match public route deployment.`,
      );
    }
  }
  if (readBoolean(readback, "tokenBridgeLocked") !== true) {
    problems.push(
      `${label} bscContractReadback.tokenBridgeLocked is not true.`,
    );
  }
  if (readNumber(readback, "bridgeSourceDomain") !== 0) {
    problems.push(`${label} bscContractReadback.bridgeSourceDomain must be 0.`);
  }
  if (readNumber(readback, "bridgeTargetDomain") !== 2) {
    problems.push(`${label} bscContractReadback.bridgeTargetDomain must be 2.`);
  }
  return problems;
};

const materialDeploymentEvidenceChecklistProblems = (evidence, label) => {
  const value = readArray(evidence, "postDeployChecklist");
  if (!Array.isArray(value)) {
    return [`${label} postDeployChecklist is missing or invalid.`];
  }
  const problems = [];
  const required = new Set(REQUIRED_BSC_DEPLOYMENT_POST_DEPLOY_CHECKLIST);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      problems.push(
        `${label} postDeployChecklist must contain only non-empty strings.`,
      );
      continue;
    }
    const normalized = item.trim();
    if (!required.has(normalized)) {
      problems.push(
        `${label} postDeployChecklist contains unsupported item ${normalized}.`,
      );
    } else if (seen.has(normalized)) {
      problems.push(
        `${label} postDeployChecklist contains duplicate item ${normalized}.`,
      );
    }
    seen.add(normalized);
  }
  for (const requiredItem of required) {
    if (!seen.has(requiredItem)) {
      problems.push(
        `${label} postDeployChecklist is missing required item ${requiredItem}.`,
      );
    }
  }
  return problems;
};

const materialDeploymentEvidenceCodeHashMap = (record, label) => {
  const problems = [];
  const hashes = {};
  if (!isRecord(record)) {
    return { problems: [`${label} is missing.`], hashes: null };
  }
  problems.push(
    ...unsupportedFieldProblems(
      record,
      MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS,
      label,
    ),
  );
  for (const key of MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS) {
    const hash = normalizeHex(readString(record, key));
    if (!isNonZeroHex32(hash)) {
      problems.push(`${label}.${key} must be a non-zero hex32 hash.`);
    }
    hashes[key] = hash;
  }
  return { problems, hashes };
};

const materialDeploymentEvidenceSummaryProblems = ({
  evidence,
  routeDeployment,
  index,
  bscProfile,
}) => {
  const label = `production material inventory deployment evidence file ${index}`;
  const problems = [
    ...unsupportedFieldProblems(
      evidence,
      MATERIAL_INVENTORY_DEPLOYMENT_EVIDENCE_FIELDS,
      label,
    ),
    ...routeIdentityProblemDetails(evidence, label),
  ];
  if (readString(evidence, "schema") !== MATERIAL_DEPLOYMENT_EVIDENCE_SCHEMA) {
    problems.push(`${label} schema is invalid.`);
  }
  if (readBoolean(evidence, "valid") !== true) {
    problems.push(`${label} is not valid.`);
  }
  if (readString(evidence, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(`${label} routeId is invalid.`);
  }
  if (readString(evidence, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(`${label} assetKey is invalid.`);
  }
  for (const [key, expected] of [
    ["bscNetwork", bscProfile.key],
    ["chain", bscProfile.chain],
    ["chainIdHex", bscProfile.chainIdHex],
    ["networkIdHex", bscProfile.networkIdHex],
  ]) {
    if (normalizeHex(readString(evidence, key)) !== normalizeHex(expected)) {
      problems.push(`${label} ${key} does not match ${bscProfile.label}.`);
    }
  }
  const seenAddresses = new Map();
  for (const key of MATERIAL_DEPLOYMENT_EVIDENCE_ADDRESS_FIELDS) {
    const actual = normalizeNonZeroEvmAddress(readString(evidence, key));
    const expected = normalizeNonZeroEvmAddress(routeDeployment[key]);
    if (!actual) {
      problems.push(`${label} ${key} is missing or invalid.`);
    } else if (!expected || actual !== expected) {
      problems.push(`${label} ${key} does not match public route deployment.`);
    }
    const previous = seenAddresses.get(actual);
    if (actual && previous) {
      problems.push(`${label} ${key} must not equal ${previous}.`);
    } else if (actual) {
      seenAddresses.set(actual, key);
    }
  }
  for (const key of MATERIAL_DEPLOYMENT_EVIDENCE_HASH_FIELDS) {
    const actual = normalizeHex(readString(evidence, key));
    const expected = normalizeHex(routeDeployment[key]);
    if (!isNonZeroHex32(actual)) {
      problems.push(`${label} ${key} is missing or invalid.`);
    } else if (!isNonZeroHex32(expected) || actual !== expected) {
      problems.push(`${label} ${key} does not match public route deployment.`);
    }
  }
  const expectedDestinationBindingKey =
    materialDeploymentEvidenceExpectedBindingKey(routeDeployment, bscProfile);
  if (!readString(evidence, "destinationBindingKey")) {
    problems.push(`${label} destinationBindingKey is missing.`);
  } else if (
    !expectedDestinationBindingKey ||
    readString(evidence, "destinationBindingKey") !==
      expectedDestinationBindingKey
  ) {
    problems.push(
      `${label} destinationBindingKey does not match public route deployment.`,
    );
  }
  if (readNumber(evidence, "destinationRolloutVersion") !== 1) {
    problems.push(`${label} destinationRolloutVersion must be 1.`);
  }
  if (readNumber(evidence, "destinationBindingVersion") !== 1) {
    problems.push(`${label} destinationBindingVersion must be 1.`);
  }
  if (readBoolean(evidence, "productionPlaceholderFree") !== true) {
    problems.push(`${label} productionPlaceholderFree is not true.`);
  }
  if (readBoolean(evidence, "publicDeploymentMatches") !== true) {
    problems.push(`${label} publicDeploymentMatches is not true.`);
  }
  const compiledCodeHashes = materialDeploymentEvidenceCodeHashMap(
    readRecord(evidence, "compiledContractCodeHashes"),
    `${label} compiledContractCodeHashes`,
  );
  const readbackCodeHashes = materialDeploymentEvidenceCodeHashMap(
    readRecord(readRecord(evidence, "bscContractReadback"), "codeHashes"),
    `${label} bscContractReadback.codeHashes`,
  );
  problems.push(...compiledCodeHashes.problems, ...readbackCodeHashes.problems);
  if (
    readbackCodeHashes.hashes &&
    readbackCodeHashes.hashes.verifier !==
      normalizeHex(routeDeployment.verifierCodeHash)
  ) {
    problems.push(
      `${label} bscContractReadback.codeHashes.verifier does not match public route deployment verifierCodeHash.`,
    );
  }
  if (compiledCodeHashes.hashes && readbackCodeHashes.hashes) {
    for (const key of MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS) {
      if (compiledCodeHashes.hashes[key] !== readbackCodeHashes.hashes[key]) {
        problems.push(
          `${label} compiledContractCodeHashes.${key} does not match bscContractReadback.codeHashes.${key}.`,
        );
      }
    }
  }
  problems.push(
    ...materialDeploymentEvidenceChecklistProblems(evidence, label),
    ...materialDeploymentEvidenceReadbackProblems({
      readback: readRecord(evidence, "bscContractReadback"),
      routeDeployment,
      label,
      bscProfile,
    }),
  );
  return problems;
};

const hasCriticalFindings = (entry) =>
  Array.isArray(entry?.findings) &&
  entry.findings.some(
    (finding) =>
      isRecord(finding) && readString(finding, "severity") === "critical",
  );

const countCriticalFindings = (entries) =>
  entries.reduce(
    (total, entry) =>
      total +
      (Array.isArray(entry?.findings)
        ? entry.findings.filter(
            (finding) =>
              isRecord(finding) &&
              readString(finding, "severity") === "critical",
          ).length
        : 0),
    0,
  );

const countWarningFindings = (entries) =>
  entries.reduce(
    (total, entry) =>
      total +
      (Array.isArray(entry?.findings)
        ? entry.findings.filter(
            (finding) =>
              isRecord(finding) &&
              readString(finding, "severity") === "warning",
          ).length
        : 0),
    0,
  );

const routeHashesMatchDeployment = (route, deployment) => {
  if (!isRecord(route) || !isRecord(deployment)) {
    return false;
  }
  const hashesMatch = REQUIRED_MATERIAL_ROUTE_HASH_FIELDS.every((key) => {
    const actual = readString(route, key);
    const expected = readString(deployment, key);
    return (
      isNonZeroHex32(actual) &&
      isNonZeroHex32(expected) &&
      normalizeHex(actual) === normalizeHex(expected)
    );
  });
  const addressesMatch = MATERIAL_DEPLOYMENT_EVIDENCE_ADDRESS_FIELDS.every(
    (key) => {
      const actual = normalizeNonZeroEvmAddress(readString(route, key));
      const expected = normalizeNonZeroEvmAddress(readString(deployment, key));
      return Boolean(actual) && actual === expected;
    },
  );
  return hashesMatch && addressesMatch;
};

const postDeployEvidenceMatches = (
  left,
  right,
  profile = resolveBscNetworkProfile("testnet"),
) =>
  postDeployEvidenceDiffs(left, right, "post-deploy evidence", profile)
    .length === 0;

const materialInventoryCategoryCountProblems = (counts, key, actual, label) => {
  const reported = readNumber(counts, key);
  if (!Number.isSafeInteger(reported) || reported < 0) {
    return [
      `production material inventory ${label} count is missing or invalid.`,
    ];
  }
  return reported === actual
    ? []
    : [
        `production material inventory ${label} count does not match file summaries.`,
      ];
};

const TAIRA_BURN_RECORD_CONTRACT_SCHEMA =
  "iroha-sccp-taira-xor-burn-record-contract/v1";
const TAIRA_BSC_BURN_RECORD_SOURCE_NAME =
  "contracts/taira/sccp/TairaXorBscSccpBurnRecord.ko";
const TAIRA_BURN_RECORD_PARAM_SIGNATURE =
  "sender:AccountId,settlement_asset:AssetDefinitionId,amount:int,record_instruction:Blob";

const MATERIAL_INVENTORY_FILE_SUMMARY_FIELDS = Object.freeze(
  new Set([
    "path",
    "kind",
    "sizeBytes",
    "sha256",
    "route",
    "verifier",
    "nativeProverBundle",
    "productionRequirements",
    "sourceParityAttestation",
    "groth16AttestationRequestPackage",
    "groth16AttestationHandoff",
    "groth16MaterialManifest",
    "groth16ProofSelfTestReport",
    "contractArtifact",
    "tairaBurnRecordContract",
    "deploymentEvidence",
    "offlineFullTomlEvidence",
    "browserProverSidecar",
    "proofFile",
    "findings",
  ]),
);
const MATERIAL_INVENTORY_BROWSER_PROVER_FILE_FIELDS = Object.freeze(
  new Set([
    "schema",
    "modulePath",
    "moduleSha256",
    "moduleSha256Actual",
    "exports",
    "valid",
  ]),
);
const MATERIAL_INVENTORY_PRODUCTION_REQUIREMENTS_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "inputCount",
    "requiredReportCount",
    "deniedVerifierKeyHashCount",
    "contractHash",
    "expectedContractHash",
    "contractMatchesExpected",
  ]),
);
const MATERIAL_INVENTORY_SOURCE_PARITY_ATTESTATION_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "domain",
    "proofBackend",
    "requiredMarkers",
    "sourceTreeHash",
    "expectedSourceTreeHash",
    "sourceTreeHashMatches",
    "sdkCount",
    "sdks",
  ]),
);
const MATERIAL_INVENTORY_SOURCE_PARITY_SDK_FIELDS = Object.freeze(
  new Set([
    "implementation",
    "implementationHash",
    "expectedImplementationHash",
    "implementationHashMatches",
    "fileCount",
  ]),
);
const MATERIAL_INVENTORY_CONTRACT_ARTIFACT_FIELDS = Object.freeze(
  new Set([
    "valid",
    "key",
    "contractName",
    "abiEntryCount",
    "bytecodeKeccak256",
    "deployedBytecodeKeccak256",
    "bytecodeSha256",
    "deployedBytecodeSha256",
  ]),
);
const MATERIAL_INVENTORY_TAIRA_BURN_RECORD_CONTRACT_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "sourceName",
    "compilerFingerprint",
    "codeHash",
    "abiHash",
    "artifactSha256",
    "artifactSizeBytes",
    "artifactProductionProblemCount",
    "entrypoint",
    "permission",
    "paramSignature",
    "executable",
    "forceZkMode",
    "settlementInstruction",
    "recordInstruction",
    "routeArtifactHashMatches",
  ]),
);
const MATERIAL_INVENTORY_DEPLOYMENT_EVIDENCE_FIELDS = Object.freeze(
  new Set([
    "schema",
    "valid",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "verifierCodeHash",
    "verifierKeyHash",
    "destinationBindingHash",
    "destinationBindingKey",
    "compiledContractCodeHashes",
    "destinationRolloutVersion",
    "destinationBindingVersion",
    "postDeployChecklist",
    "bscContractReadback",
    "productionPlaceholderFree",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_DEPLOYMENT_READBACK_FIELDS = Object.freeze(
  new Set([
    "chainIdHex",
    "codePresent",
    "codeHashes",
    "tokenAddress",
    "bridgeAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "tokenBridgeAddress",
    "tokenBridgeLocked",
    "sourceBridgeOwner",
    "bridgeDestinationBindingHash",
    "bridgeVerifierAddress",
    "bridgeVerifierCodeHash",
    "bridgeVerifierKeyHash",
    "verifierKeyHash",
    "bridgeNetworkId",
    "bridgeSourceDomain",
    "bridgeTargetDomain",
  ]),
);
const MATERIAL_INVENTORY_DEPLOYMENT_CODE_PRESENT_FIELDS = Object.freeze(
  new Set(["token", "bridge", "sourceBridge", "verifier"]),
);
const MATERIAL_INVENTORY_OFFLINE_FULL_TOML_EVIDENCE_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chainIdHex",
    "networkIdHex",
    "fullTomlReady",
    "offlineFullTomlSha256",
    "hashInputSha256",
    "renderedTomlSha256",
    "hashMode",
    "routeManifestPath",
    "fullConfigPath",
    "publicPostDeployMatches",
  ]),
);
const MATERIAL_INVENTORY_ROUTE_FILE_FIELDS = Object.freeze(
  new Set([
    "routeId",
    "assetKey",
    "productionReady",
    "verifierCodeHash",
    "verifierKeyHash",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
    "destinationBindingHash",
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "explorerUrl",
    "explorerHost",
    "explorerBindingMatches",
    "postDeployLiveEvidence",
    "burnRecordArtifactSha256",
    "burnRecordArtifactProductionProblems",
    "disabled",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_VERIFIER_FILE_FIELDS = Object.freeze(
  new Set([
    "verifierKeyHash",
    "network",
    "chainIdHex",
    "networkIdHex",
    "sourceDomain",
    "targetDomain",
    "requiresVerifierBinding",
    "bscNetworkBound",
    "bscRouteDomainBound",
    "fixtureShaped",
    "g1MaterialValid",
    "g1MaterialProblems",
    "g2MaterialValid",
    "g2MaterialProblems",
    "expectedVerifierKeyHash",
    "hashMatchesPublicRoute",
  ]),
);
const MATERIAL_INVENTORY_NATIVE_PROVER_BUNDLE_FIELDS = Object.freeze(
  new Set([
    "valid",
    "bundleId",
    "chain",
    "domain",
    "nativeEvmProverBundleHash",
    "verifierKeyHash",
    "verifierKeyArtifactHash",
    "proofArtifactHash",
    "provingKeyHash",
    "groth16ProofSelfTestHash",
    "destinationBindingHash",
    "proofArtifact",
    "provingKey",
    "verifierKey",
    "nativeSdkArtifacts",
    "auditHashesProduction",
    "auditHashIssueCount",
    "artifactsVerified",
    "verifiedSdks",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_GROTH16_MATERIAL_MANIFEST_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "proofBackend",
    "proofFamily",
    "sourceDomain",
    "targetDomain",
    "circuitProfile",
    "publicInputCount",
    "publicSignalNames",
    "productionReady",
    "productionBlockerCount",
    "productionBlockers",
    "productionBlockerSummary",
    "verifierKeyHash",
    "circuitSourceHash",
    "proofArtifactHash",
    "provingKeyHash",
    "bscVerifierKeyArtifactHash",
    "snarkjsVerificationKeyHash",
    "trustedSetupTranscript",
    "trustedSetupTranscriptHash",
    "reproducibleBuildTranscript",
    "reproducibleBuildTranscriptHash",
    "selfChecks",
    "attestationTrustPolicy",
    "attestations",
    "referencedTranscriptsVerified",
    "referencedAttestationsVerified",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_GROTH16_ATTESTATION_REQUEST_PACKAGE_FIELDS =
  Object.freeze(
    new Set([
      "valid",
      "schema",
      "routeId",
      "assetKey",
      "bscNetwork",
      "chain",
      "chainIdHex",
      "networkIdHex",
      "circuitProfile",
      "publicInputCount",
      "publicSignalNames",
      "verifierKeyHash",
      "circuitSourceHash",
      "proofArtifactHash",
      "provingKeyHash",
      "bscVerifierKeyArtifactHash",
      "snarkjsVerificationKeyHash",
      "trustedSetupTranscriptHash",
      "reproducibleBuildTranscriptHash",
      "manifestPath",
      "manifestSha256",
      "manifestProductionReady",
      "manifestProductionBlockerCount",
      "roles",
      "allRolesReady",
      "referencedManifestVerified",
      "publicDeploymentMatches",
    ]),
  );
const MATERIAL_INVENTORY_GROTH16_ATTESTATION_HANDOFF_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "circuitProfile",
    "proofBackend",
    "verifierKeyHash",
    "manifestPath",
    "manifestSha256",
    "manifestProductionReady",
    "manifestProductionBlockerCount",
    "manifestProductionBlockers",
    "manifestProductionBlockerSummary",
    "packages",
    "attestationRequestPath",
    "attestationRequestSha256",
    "handoffComplete",
    "signingReady",
    "readyToFinalize",
    "requestValid",
    "roleReadiness",
    "allRolesReady",
    "missingSignedRoles",
    "handoffBlockers",
    "attestationStatusProblemCount",
    "attestationStatusProblemSummary",
    "readinessProductionReady",
    "readinessProductionBlockers",
    "problemCount",
    "nextActions",
    "referencedRequestVerified",
    "referencedManifestVerified",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_GROTH16_PROOF_SELF_TEST_REPORT_FIELDS = Object.freeze(
  new Set([
    "valid",
    "schema",
    "routeId",
    "assetKey",
    "bscNetwork",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "circuitProfile",
    "proofBackend",
    "proofFamily",
    "manifestPath",
    "manifestSha256",
    "manifestProductionReady",
    "manifestProductionBlockerCount",
    "manifestProductionBlockers",
    "manifestProductionBlockerSummary",
    "proofArtifactHash",
    "provingKeyHash",
    "bscVerifierKeyArtifactHash",
    "snarkjsVerificationKeyHash",
    "witnessWasmHash",
    "witnessHash",
    "proofHash",
    "publicSignalsHash",
    "publicSignalNames",
    "referencedManifestVerified",
    "publicDeploymentMatches",
  ]),
);
const MATERIAL_INVENTORY_PROOF_FILE_FIELDS = Object.freeze(
  new Set([
    "isProvingKey",
    "isProofArtifact",
    "productionSized",
    "productionMaxSized",
    "maxSizeBytes",
    "productionEntropy",
    "uniqueByteCount",
    "dominantByte",
    "dominantByteCount",
    "dominantByteFraction",
    "repeatedPatternLength",
    "arithmeticSequenceDelta",
    "productionFormat",
    "format",
    "formatVersion",
    "formatSectionCount",
    "formatProblem",
    "expectedHash",
    "hashMatchesPublicRoute",
  ]),
);

const MATERIAL_INVENTORY_REPORT_FIELDS = Object.freeze(
  new Set([
    "schema",
    "ready",
    "generatedAt",
    "loadError",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "scanRoots",
    "scanRootStatuses",
    "checks",
    "reasons",
    "nextActions",
    "missingProductionInputs",
    "route",
    "counts",
    "browserProvers",
    "runtimeProverConfig",
    "skippedGeneratedDirectories",
    "files",
  ]),
);
const MATERIAL_INVENTORY_SCAN_ROOT_STATUS_FIELDS = Object.freeze(
  new Set(["path", "ok", "kind", "detail"]),
);
const MATERIAL_INVENTORY_ROUTE_FIELDS = Object.freeze(
  new Set([
    "ready",
    "manifestSource",
    "bsc",
    "deployment",
    "postDeployLiveEvidence",
  ]),
);
const MATERIAL_INVENTORY_COUNTS_FIELDS = Object.freeze(
  new Set([
    "files",
    "relevantFilesSeen",
    "maxFiles",
    "truncated",
    "skippedGeneratedDirectories",
    "productionRouteArtifacts",
    "productionOfflineFullTomlEvidenceArtifacts",
    "productionDeploymentEvidenceArtifacts",
    "productionTairaBurnRecordContracts",
    "productionVerifierArtifacts",
    "sourceParityAttestations",
    "productionGroth16MaterialManifests",
    "productionGroth16AttestationRequestPackages",
    "readyGroth16AttestationRequestPackages",
    "blockedGroth16AttestationRoles",
    "routeBoundGroth16AttestationHandoffs",
    "productionGroth16ProofSelfTestReports",
    "productionNativeProverBundles",
    "productionRequirementsArtifacts",
    "compiledContractArtifacts",
    "browserProverSidecars",
    "proofArtifacts",
    "provingKeys",
    "proofArtifactCandidates",
    "provingKeyCandidates",
    "criticalFindings",
    "warningFindings",
  ]),
);
const MATERIAL_INVENTORY_BROWSER_PROVERS_FIELDS = Object.freeze(
  new Set(["destination", "source"]),
);
const MATERIAL_INVENTORY_BROWSER_PROVER_FIELDS = Object.freeze(
  new Set(["ok", "detail", "module", "sidecar"]),
);
const MATERIAL_INVENTORY_BROWSER_PROVER_MODULE_FIELDS = Object.freeze(
  new Set(["moduleUrl", "path", "sizeBytes", "sha256", "ok"]),
);
const MATERIAL_INVENTORY_BROWSER_PROVER_SIDECAR_FIELDS = Object.freeze(
  new Set(["path", "sizeBytes", "sha256", "moduleSha256", "manifest", "ok"]),
);
const MATERIAL_INVENTORY_BROWSER_PROVER_MANIFEST_FIELDS = Object.freeze(
  new Set([
    "schema",
    "moduleUrl",
    "direction",
    "tairaChainId",
    "tairaNetworkPrefix",
    "moduleSha256",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
    "acceptedExport",
    "acceptedSelfTestExport",
    "deployment",
    "postDeployLiveEvidence",
    ...PUBLIC_ROUTE_IDENTITY_FIELDS_WITH_ALIASES,
    ...PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
  ]),
);
const MATERIAL_INVENTORY_RUNTIME_PROVER_CONFIG_FIELDS = Object.freeze(
  new Set([
    "ok",
    "required",
    "configUrl",
    "path",
    "sizeBytes",
    "sha256",
    "detail",
    "manifest",
  ]),
);

const unsupportedFieldProblems = (record, knownFields, label) => {
  if (!isRecord(record)) {
    return [];
  }
  return Object.keys(record)
    .filter((key) => !knownFields.has(key))
    .map((key) => {
      const publicKey = publicUnsupportedFieldName(key);
      return `${label} contains unsupported field ${publicKey}.`;
    });
};
const recordArrayShapeProblems = (record, key, label) => {
  const value = readOwnValue(record, key);
  if (!hasOwn(record, key)) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (!isRecord(entry)) {
      problems.push(`${label} ${index} is not an object.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing.`);
    }
  }
  return problems;
};
const validatedRecordArray = (problems, record, key, label) => {
  if (!hasOwn(record, key)) {
    return null;
  }
  problems.push(...recordArrayShapeProblems(record, key, label));
  const value = readArray(record, key);
  return Array.isArray(value) ? value : null;
};
const stringArrayShapeProblems = (record, key, label) => {
  if (!hasOwn(record, key)) {
    return [];
  }
  const value = readOwnValue(record, key);
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (typeof entry !== "string" || !entry.trim()) {
      problems.push(`${label} ${index} is not a non-empty string.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing.`);
    }
  }
  return problems;
};
const publicRequiredInputContractProblems = (input, label) => {
  if (!isRecord(input)) {
    return [];
  }
  const problems = [];
  for (const field of ["id", "kind", "placeholder", "description"]) {
    if (!readString(input, field)) {
      problems.push(`${label} ${field} is missing or not a non-empty string.`);
    }
  }
  problems.push(
    ...stringArrayShapeProblems(
      input,
      "blockedByActions",
      `${label} blockedByActions`,
    ),
  );
  return problems;
};
const publicNextActionContractProblems = (action, label) => {
  if (!isRecord(action)) {
    return [];
  }
  const problems = [];
  for (const field of ["id", "title", "detail"]) {
    if (!readString(action, field)) {
      problems.push(`${label} ${field} is missing or not a non-empty string.`);
    }
  }
  const requiredInputs = readArray(action, "requiredInputs");
  if (!Array.isArray(requiredInputs) || requiredInputs.length === 0) {
    problems.push(`${label} requiredInputs is missing or empty.`);
  }
  const blockedByChecks = readArray(action, "blockedByChecks");
  if (!Array.isArray(blockedByChecks) || blockedByChecks.length === 0) {
    problems.push(`${label} blockedByChecks is missing or empty.`);
  }
  const commands = readArray(action, "commands");
  if (!Array.isArray(commands) || commands.length === 0) {
    problems.push(`${label} commands is missing or empty.`);
  }
  problems.push(
    ...stringArrayShapeProblems(
      action,
      "blockedByChecks",
      `${label} blockedByChecks`,
    ),
    ...stringArrayShapeProblems(action, "commands", `${label} command`),
  );
  return problems;
};

const PRODUCTION_GATE_NATIVE_PROVER_BUNDLE_COMMAND_FLAGS = Object.freeze([
  "--route-manifest",
  "--artifact-root",
  "--proof-artifact",
  "--proving-key",
  "--verifier-key",
  "--groth16-material-manifest",
  "--cross-sdk-parity",
  "--native-prover-self-test",
  "--javascript-implementation",
  "--swift-implementation",
  "--kotlin-implementation",
  "--java-android-implementation",
  "--dotnet-implementation",
  "--audit-circuit-security",
  "--audit-native-implementation",
  "--audit-reproducible-build",
  "--audit-no-wasm-no-remote-scan",
  "--out",
]);

const productionGateActionCommandProblems = (action, label) => {
  const problems = [];
  const actionId = readString(action, "id");
  if (actionId !== "publish-production-proof-material") {
    return problems;
  }
  const commands = readArray(action, "commands");
  const nativeProverCommands = Array.isArray(commands)
    ? commands.filter(
        (command) =>
          typeof command === "string" &&
          /(?:^|\s)native-prover-bundle(?:\s|$)/u.test(command),
      )
    : [];
  if (nativeProverCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one native-prover-bundle command.`,
    );
    return problems;
  }
  const command = nativeProverCommands[0];
  for (const flag of PRODUCTION_GATE_NATIVE_PROVER_BUNDLE_COMMAND_FLAGS) {
    if (!new RegExp(`(?:^|\\s)${flag}(?:\\s|$)`, "u").test(command)) {
      problems.push(`${label} native-prover-bundle command lacks ${flag}.`);
    }
  }
  if (/\{bscNetwork\}/u.test(command)) {
    problems.push(
      `${label} native-prover-bundle command still has an unresolved bscNetwork placeholder.`,
    );
  }
  return problems;
};

const AGGREGATE_MISSING_INPUT_BLOCKER_FIELDS = Object.freeze([
  "blockedByActions",
  "blockedByRouteActions",
  "blockedByPeerActions",
  "blockedByMaterialActions",
  "blockedBySmokeActions",
]);
const AGGREGATE_NEXT_ACTION_FIELDS = Object.freeze(
  new Set([
    "id",
    "title",
    "detail",
    "requiredInputs",
    "blockedByChecks",
    "commands",
  ]),
);
const AGGREGATE_REQUIRED_INPUT_FIELDS = Object.freeze(
  new Set(["id", "kind", "placeholder", "description"]),
);
const AGGREGATE_MISSING_INPUT_FIELDS = Object.freeze(
  new Set([
    "id",
    "kind",
    "placeholder",
    "description",
    ...AGGREGATE_MISSING_INPUT_BLOCKER_FIELDS,
  ]),
);

const aggregateMissingInputContractProblems = (input, label) => {
  if (!isRecord(input)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(input, AGGREGATE_MISSING_INPUT_FIELDS, label),
    ...publicRequiredInputContractProblems(input, label),
  ];
  if (!hasOwn(input, "blockedByActions")) {
    problems.push(`${label} blockedByActions is missing.`);
  }
  for (const field of AGGREGATE_MISSING_INPUT_BLOCKER_FIELDS) {
    problems.push(
      ...stringArrayShapeProblems(input, field, `${label} ${field}`),
    );
  }
  const blockerCount = AGGREGATE_MISSING_INPUT_BLOCKER_FIELDS.reduce(
    (total, field) => {
      const values = readArray(input, field);
      return (
        total +
        (Array.isArray(values)
          ? values.filter((entry) => typeof entry === "string" && entry.trim())
              .length
          : 0)
      );
    },
    0,
  );
  if (blockerCount === 0) {
    problems.push(`${label} has no blocking action references.`);
  }
  return problems;
};

const rememberUniqueId = (seen, id, label, problems) => {
  if (!id) {
    return;
  }
  if (seen.has(id)) {
    problems.push(`${label} id ${id} is duplicated.`);
    return;
  }
  seen.add(id);
};

const childActionRequiredInputIds = (problems, report, key, label) => {
  const actions = validatedRecordArray(problems, report, key, label);
  if (!actions) {
    return null;
  }
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  for (const [index, action] of actions.entries()) {
    if (!isRecord(action)) {
      continue;
    }
    const actionId = readString(action, "id");
    rememberUniqueId(actionIds, actionId, label, problems);
    const requiredInputs = validatedRecordArray(
      problems,
      action,
      "requiredInputs",
      `${label} ${index} required input`,
    );
    const requiredInputIds = new Set();
    if (requiredInputs) {
      for (const input of requiredInputs) {
        if (!isRecord(input)) {
          continue;
        }
        rememberUniqueId(
          requiredInputIds,
          readString(input, "id"),
          `${label} ${index} required input`,
          problems,
        );
      }
    }
    if (actionId) {
      requiredInputIdsByActionId.set(actionId, requiredInputIds);
    }
  }
  return requiredInputIdsByActionId;
};

export const bscSccpProductionGateRunbookProblems = (report) => {
  if (!isRecord(report)) {
    return ["BSC production gate runbook report is not an object."];
  }
  const problems = [];
  const nextActions = validatedRecordArray(
    problems,
    report,
    "nextActions",
    "BSC production gate next action",
  );
  const missingProductionInputs = validatedRecordArray(
    problems,
    report,
    "missingProductionInputs",
    "BSC production gate missing production input",
  );
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  const missingInputIds = new Set();
  const missingInputsById = new Map();
  const childRequiredInputIdsByField = new Map(
    [
      [
        "blockedByRouteActions",
        childActionRequiredInputIds(
          problems,
          report,
          "routeNextActions",
          "BSC production gate route next action",
        ),
      ],
      [
        "blockedByPeerActions",
        childActionRequiredInputIds(
          problems,
          report,
          "peerNextActions",
          "BSC production gate peer next action",
        ),
      ],
      [
        "blockedByMaterialActions",
        childActionRequiredInputIds(
          problems,
          report,
          "materialNextActions",
          "BSC production gate material next action",
        ),
      ],
      [
        "blockedBySmokeActions",
        childActionRequiredInputIds(
          problems,
          report,
          "smokeNextActions",
          "BSC production gate smoke next action",
        ),
      ],
    ].filter((entry) => entry[1]),
  );
  if (nextActions) {
    for (const [index, action] of nextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      const actionId = readString(action, "id");
      rememberUniqueId(
        actionIds,
        actionId,
        "BSC production gate next action",
        problems,
      );
      problems.push(
        ...unsupportedFieldProblems(
          action,
          AGGREGATE_NEXT_ACTION_FIELDS,
          `BSC production gate next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `BSC production gate next action ${index}`,
        ),
        ...productionGateActionCommandProblems(
          action,
          `BSC production gate next action ${index}`,
        ),
      );
      const requiredInputs = validatedRecordArray(
        problems,
        action,
        "requiredInputs",
        `BSC production gate next action ${index} required input`,
      );
      const requiredInputIds = new Set();
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          if (!isRecord(input)) {
            continue;
          }
          problems.push(
            ...unsupportedFieldProblems(
              input,
              AGGREGATE_REQUIRED_INPUT_FIELDS,
              `BSC production gate next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `BSC production gate next action ${index} required input ${inputIndex}`,
            ),
          );
          rememberUniqueId(
            requiredInputIds,
            readString(input, "id"),
            `BSC production gate next action ${index} required input`,
            problems,
          );
        }
      }
      if (actionId) {
        requiredInputIdsByActionId.set(actionId, requiredInputIds);
      }
    }
  }
  if (missingProductionInputs) {
    for (const [index, input] of missingProductionInputs.entries()) {
      if (!isRecord(input)) {
        continue;
      }
      const inputId = readString(input, "id");
      rememberUniqueId(
        missingInputIds,
        inputId,
        "BSC production gate missing production input",
        problems,
      );
      if (inputId && !missingInputsById.has(inputId)) {
        missingInputsById.set(inputId, input);
      }
      problems.push(
        ...aggregateMissingInputContractProblems(
          input,
          `BSC production gate missing production input ${index}`,
        ),
      );
    }
  }
  if (nextActions && missingProductionInputs) {
    for (const [actionId, requiredInputIds] of requiredInputIdsByActionId) {
      for (const inputId of requiredInputIds) {
        const missingInput = missingInputsById.get(inputId);
        if (!missingInput) {
          problems.push(
            `BSC production gate next action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
          );
          continue;
        }
        const topLevelBlockers = readArray(missingInput, "blockedByActions");
        if (
          Array.isArray(topLevelBlockers) &&
          !topLevelBlockers.includes(actionId)
        ) {
          problems.push(
            `BSC production gate missing production input ${inputId} does not reference blocking action ${actionId}.`,
          );
        }
      }
    }
    for (const [inputId, input] of missingInputsById) {
      const blockers = readArray(input, "blockedByActions");
      if (!Array.isArray(blockers)) {
        continue;
      }
      for (const actionId of blockers) {
        if (typeof actionId !== "string" || !actionId.trim()) {
          continue;
        }
        if (!actionIds.has(actionId)) {
          problems.push(
            `BSC production gate missing production input ${inputId} references unknown blocking action ${actionId}.`,
          );
          continue;
        }
        if (!requiredInputIdsByActionId.get(actionId)?.has(inputId)) {
          problems.push(
            `BSC production gate missing production input ${inputId} references blocking action ${actionId}, but that action does not require the input.`,
          );
        }
      }
      for (const [
        childField,
        childRequiredInputIdsByActionId,
      ] of childRequiredInputIdsByField) {
        const childBlockers = readArray(input, childField);
        if (!Array.isArray(childBlockers)) {
          continue;
        }
        for (const actionId of childBlockers) {
          if (typeof actionId !== "string" || !actionId.trim()) {
            continue;
          }
          if (!childRequiredInputIdsByActionId.has(actionId)) {
            problems.push(
              `BSC production gate missing production input ${inputId} references unknown ${childField} action ${actionId}.`,
            );
            continue;
          }
          if (!childRequiredInputIdsByActionId.get(actionId)?.has(inputId)) {
            problems.push(
              `BSC production gate missing production input ${inputId} references ${childField} action ${actionId}, but that action does not require the input.`,
            );
          }
        }
      }
    }
  }
  return problems;
};

const routePreflightReportShapeProblems = (routeReport) => {
  if (!isRecord(routeReport)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      routeReport,
      ROUTE_PREFLIGHT_REPORT_FIELDS,
      "route preflight report",
    ),
  ];
  if (isRecord(readRecord(routeReport, "taira"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(routeReport, "taira"),
        ROUTE_PREFLIGHT_TAIRA_FIELDS,
        "route preflight TAIRA profile",
      ),
    );
  }
  if (isRecord(readRecord(routeReport, "bsc"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(routeReport, "bsc"),
        PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
        "route preflight BSC profile",
      ),
    );
  }
  if (isRecord(readRecord(routeReport, "deployment"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(routeReport, "deployment"),
        PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
        "route preflight deployment",
      ),
    );
  }
  if (isRecord(readRecord(routeReport, "postDeployLiveEvidence"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(routeReport, "postDeployLiveEvidence"),
        PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
        "route preflight postDeployLiveEvidence",
      ),
    );
  }
  const routeChecks = validatedRecordArray(
    problems,
    routeReport,
    "checks",
    "route preflight check",
  );
  if (routeChecks) {
    for (const [index, entry] of routeChecks.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          entry,
          SMOKE_READINESS_CHECK_FIELDS,
          `route preflight check ${index}`,
        ),
      );
    }
  }
  const routeNextActions = validatedRecordArray(
    problems,
    routeReport,
    "nextActions",
    "route preflight next action",
  );
  if (routeNextActions) {
    for (const [index, action] of routeNextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `route preflight next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `route preflight next action ${index}`,
        ),
      );
      const requiredInputs = validatedRecordArray(
        problems,
        action,
        "requiredInputs",
        `route preflight next action ${index} required input`,
      );
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `route preflight next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `route preflight next action ${index} required input ${inputIndex}`,
            ),
          );
        }
      }
    }
  }
  const routeMissingProductionInputs = validatedRecordArray(
    problems,
    routeReport,
    "missingProductionInputs",
    "route preflight missing production input",
  );
  if (routeMissingProductionInputs) {
    for (const [index, input] of routeMissingProductionInputs.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          `route preflight missing production input ${index}`,
        ),
        ...publicRequiredInputContractProblems(
          input,
          `route preflight missing production input ${index}`,
        ),
      );
    }
  }
  if (isRecord(readRecord(routeReport, "errors"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(routeReport, "errors"),
        ROUTE_PREFLIGHT_ERROR_FIELDS,
        "route preflight errors",
      ),
    );
  }
  const readback = readRecord(routeReport, "bscContractReadback");
  if (readback) {
    const deployment = publicDeployment(readRecord(routeReport, "deployment"));
    problems.push(
      ...unsupportedFieldProblems(
        readback,
        ROUTE_PREFLIGHT_BSC_READBACK_FIELDS,
        "route preflight BSC contract readback",
      ),
    );
    if (isRecord(readRecord(readback, "codePresent"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(readback, "codePresent"),
          ROUTE_PREFLIGHT_BSC_CODE_PRESENT_FIELDS,
          "route preflight BSC contract readback codePresent",
        ),
      );
    }
    if (deployment) {
      for (const key of MATERIAL_DEPLOYMENT_EVIDENCE_ADDRESS_FIELDS) {
        const actual = normalizeNonZeroEvmAddress(readString(readback, key));
        const expected = normalizeNonZeroEvmAddress(deployment[key]);
        if (!actual) {
          problems.push(
            `route preflight BSC contract readback ${key} is missing or invalid.`,
          );
        } else if (!expected || actual !== expected) {
          problems.push(
            `route preflight BSC contract readback ${key} does not match route deployment.`,
          );
        }
      }
    }
  }
  return problems;
};

const peerAuditReportShapeProblems = (peerAuditReport) => {
  if (!isRecord(peerAuditReport)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      peerAuditReport,
      PEER_AUDIT_REPORT_FIELDS,
      "peer audit report",
    ),
  ];
  if (isRecord(readRecord(peerAuditReport, "bsc"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(peerAuditReport, "bsc"),
        PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
        "peer audit BSC profile",
      ),
    );
  }
  const peerChecks = validatedRecordArray(
    problems,
    peerAuditReport,
    "checks",
    "peer audit check",
  );
  if (peerChecks) {
    for (const [index, entry] of peerChecks.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          entry,
          SMOKE_READINESS_CHECK_FIELDS,
          `peer audit check ${index}`,
        ),
      );
    }
  }
  const peerNextActions = validatedRecordArray(
    problems,
    peerAuditReport,
    "nextActions",
    "peer audit next action",
  );
  if (peerNextActions) {
    for (const [index, action] of peerNextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `peer audit next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `peer audit next action ${index}`,
        ),
      );
      const requiredInputs = validatedRecordArray(
        problems,
        action,
        "requiredInputs",
        `peer audit next action ${index} required input`,
      );
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `peer audit next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `peer audit next action ${index} required input ${inputIndex}`,
            ),
          );
        }
      }
    }
  }
  const peerMissingProductionInputs = validatedRecordArray(
    problems,
    peerAuditReport,
    "missingProductionInputs",
    "peer audit missing production input",
  );
  if (peerMissingProductionInputs) {
    for (const [index, input] of peerMissingProductionInputs.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          `peer audit missing production input ${index}`,
        ),
        ...publicRequiredInputContractProblems(
          input,
          `peer audit missing production input ${index}`,
        ),
      );
    }
  }
  const peerAuditPeers = validatedRecordArray(
    problems,
    peerAuditReport,
    "peers",
    "peer audit peer",
  );
  if (peerAuditPeers) {
    for (const [index, peer] of peerAuditPeers.entries()) {
      if (!isRecord(peer)) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          peer,
          SMOKE_READINESS_PEER_FIELDS,
          `peer audit peer ${index}`,
        ),
      );
      if (isRecord(readRecord(peer, "deployment"))) {
        problems.push(
          ...unsupportedFieldProblems(
            readRecord(peer, "deployment"),
            PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
            `peer audit peer ${index} deployment`,
          ),
        );
      }
      if (isRecord(readRecord(peer, "postDeployLiveEvidence"))) {
        problems.push(
          ...unsupportedFieldProblems(
            readRecord(peer, "postDeployLiveEvidence"),
            PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
            `peer audit peer ${index} postDeployLiveEvidence`,
          ),
        );
      }
      const failedChecks = validatedRecordArray(
        problems,
        peer,
        "failedChecks",
        `peer audit peer ${index} failed check`,
      );
      if (failedChecks) {
        for (const [checkIndex, entry] of failedChecks.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              entry,
              SMOKE_READINESS_CHECK_FIELDS,
              `peer audit peer ${index} failed check ${checkIndex}`,
            ),
          );
        }
      }
    }
  }
  return problems;
};

const smokeReadinessReportShapeProblems = (smokeReadinessReport) => {
  if (!isRecord(smokeReadinessReport)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      smokeReadinessReport,
      SMOKE_READINESS_REPORT_FIELDS,
      "smoke-readiness report",
    ),
  ];
  const smokeChecks = validatedRecordArray(
    problems,
    smokeReadinessReport,
    "checks",
    "smoke-readiness check",
  );
  if (smokeChecks) {
    for (const [index, entry] of smokeChecks.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          entry,
          SMOKE_READINESS_CHECK_FIELDS,
          `smoke-readiness check ${index}`,
        ),
      );
    }
  }
  const smokeNextActions = validatedRecordArray(
    problems,
    smokeReadinessReport,
    "nextActions",
    "smoke-readiness next action",
  );
  if (smokeNextActions) {
    for (const [index, action] of smokeNextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `smoke-readiness next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `smoke-readiness next action ${index}`,
        ),
      );
      const requiredInputs = validatedRecordArray(
        problems,
        action,
        "requiredInputs",
        `smoke-readiness next action ${index} required input`,
      );
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `smoke-readiness next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `smoke-readiness next action ${index} required input ${inputIndex}`,
            ),
          );
        }
      }
    }
  }
  const smokeMissingProductionInputs = validatedRecordArray(
    problems,
    smokeReadinessReport,
    "missingProductionInputs",
    "smoke-readiness missing production input",
  );
  if (smokeMissingProductionInputs) {
    for (const [index, input] of smokeMissingProductionInputs.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          `smoke-readiness missing production input ${index}`,
        ),
        ...publicRequiredInputContractProblems(
          input,
          `smoke-readiness missing production input ${index}`,
        ),
      );
    }
  }
  const route = readRecord(smokeReadinessReport, "route");
  if (route) {
    problems.push(
      ...unsupportedFieldProblems(
        route,
        SMOKE_READINESS_ROUTE_FIELDS,
        "smoke-readiness route",
      ),
    );
    if (isRecord(readRecord(route, "taira"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "taira"),
          SMOKE_READINESS_TAIRA_FIELDS,
          "smoke-readiness route TAIRA profile",
        ),
      );
    }
    if (isRecord(readRecord(route, "bsc"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "bsc"),
          PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
          "smoke-readiness route BSC profile",
        ),
      );
    }
    if (isRecord(readRecord(route, "deployment"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "deployment"),
          PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
          "smoke-readiness route deployment",
        ),
      );
    }
    if (isRecord(readRecord(route, "postDeployLiveEvidence"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "postDeployLiveEvidence"),
          PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
          "smoke-readiness route postDeployLiveEvidence",
        ),
      );
    }
    const routeNextActions = validatedRecordArray(
      problems,
      route,
      "nextActions",
      "smoke-readiness route next action",
    );
    if (routeNextActions) {
      for (const [index, action] of routeNextActions.entries()) {
        if (!isRecord(action)) {
          continue;
        }
        problems.push(
          ...unsupportedFieldProblems(
            action,
            PUBLIC_NEXT_ACTION_FIELDS,
            `smoke-readiness route next action ${index}`,
          ),
          ...publicNextActionContractProblems(
            action,
            `smoke-readiness route next action ${index}`,
          ),
        );
        const requiredInputs = validatedRecordArray(
          problems,
          action,
          "requiredInputs",
          `smoke-readiness route next action ${index} required input`,
        );
        if (requiredInputs) {
          for (const [inputIndex, input] of requiredInputs.entries()) {
            problems.push(
              ...unsupportedFieldProblems(
                input,
                PUBLIC_REQUIRED_INPUT_FIELDS,
                `smoke-readiness route next action ${index} required input ${inputIndex}`,
              ),
              ...publicRequiredInputContractProblems(
                input,
                `smoke-readiness route next action ${index} required input ${inputIndex}`,
              ),
            );
          }
        }
      }
    }
    const routeMissingProductionInputs = validatedRecordArray(
      problems,
      route,
      "missingProductionInputs",
      "smoke-readiness route missing production input",
    );
    if (routeMissingProductionInputs) {
      for (const [index, input] of routeMissingProductionInputs.entries()) {
        problems.push(
          ...unsupportedFieldProblems(
            input,
            PUBLIC_REQUIRED_INPUT_FIELDS,
            `smoke-readiness route missing production input ${index}`,
          ),
          ...publicRequiredInputContractProblems(
            input,
            `smoke-readiness route missing production input ${index}`,
          ),
        );
      }
    }
  }

  const peerAudit = readRecord(smokeReadinessReport, "peerAudit");
  if (peerAudit) {
    problems.push(
      ...unsupportedFieldProblems(
        peerAudit,
        SMOKE_READINESS_PEER_AUDIT_FIELDS,
        "smoke-readiness peer audit",
      ),
    );
    const peerAuditChecks = validatedRecordArray(
      problems,
      peerAudit,
      "checks",
      "smoke-readiness peer audit check",
    );
    if (peerAuditChecks) {
      for (const [index, entry] of peerAuditChecks.entries()) {
        problems.push(
          ...unsupportedFieldProblems(
            entry,
            SMOKE_READINESS_CHECK_FIELDS,
            `smoke-readiness peer audit check ${index}`,
          ),
        );
      }
    }
    const peerAuditNextActions = validatedRecordArray(
      problems,
      peerAudit,
      "nextActions",
      "smoke-readiness peer audit next action",
    );
    if (peerAuditNextActions) {
      for (const [index, action] of peerAuditNextActions.entries()) {
        if (!isRecord(action)) {
          continue;
        }
        problems.push(
          ...unsupportedFieldProblems(
            action,
            PUBLIC_NEXT_ACTION_FIELDS,
            `smoke-readiness peer audit next action ${index}`,
          ),
          ...publicNextActionContractProblems(
            action,
            `smoke-readiness peer audit next action ${index}`,
          ),
        );
        const requiredInputs = validatedRecordArray(
          problems,
          action,
          "requiredInputs",
          `smoke-readiness peer audit next action ${index} required input`,
        );
        if (requiredInputs) {
          for (const [inputIndex, input] of requiredInputs.entries()) {
            problems.push(
              ...unsupportedFieldProblems(
                input,
                PUBLIC_REQUIRED_INPUT_FIELDS,
                `smoke-readiness peer audit next action ${index} required input ${inputIndex}`,
              ),
              ...publicRequiredInputContractProblems(
                input,
                `smoke-readiness peer audit next action ${index} required input ${inputIndex}`,
              ),
            );
          }
        }
      }
    }
    const peerAuditMissingProductionInputs = validatedRecordArray(
      problems,
      peerAudit,
      "missingProductionInputs",
      "smoke-readiness peer audit missing production input",
    );
    if (peerAuditMissingProductionInputs) {
      for (const [index, input] of peerAuditMissingProductionInputs.entries()) {
        problems.push(
          ...unsupportedFieldProblems(
            input,
            PUBLIC_REQUIRED_INPUT_FIELDS,
            `smoke-readiness peer audit missing production input ${index}`,
          ),
          ...publicRequiredInputContractProblems(
            input,
            `smoke-readiness peer audit missing production input ${index}`,
          ),
        );
      }
    }
    const peerAuditPeers = validatedRecordArray(
      problems,
      peerAudit,
      "peers",
      "smoke-readiness peer audit peer",
    );
    if (peerAuditPeers) {
      for (const [index, peer] of peerAuditPeers.entries()) {
        if (!isRecord(peer)) {
          continue;
        }
        problems.push(
          ...unsupportedFieldProblems(
            peer,
            SMOKE_READINESS_PEER_FIELDS,
            `smoke-readiness peer audit peer ${index}`,
          ),
        );
        if (isRecord(readRecord(peer, "deployment"))) {
          problems.push(
            ...unsupportedFieldProblems(
              readRecord(peer, "deployment"),
              PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
              `smoke-readiness peer audit peer ${index} deployment`,
            ),
          );
        }
        if (isRecord(readRecord(peer, "postDeployLiveEvidence"))) {
          problems.push(
            ...unsupportedFieldProblems(
              readRecord(peer, "postDeployLiveEvidence"),
              PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
              `smoke-readiness peer audit peer ${index} postDeployLiveEvidence`,
            ),
          );
        }
        const failedChecks = validatedRecordArray(
          problems,
          peer,
          "failedChecks",
          `smoke-readiness peer audit peer ${index} failed check`,
        );
        if (failedChecks) {
          for (const [checkIndex, entry] of failedChecks.entries()) {
            problems.push(
              ...unsupportedFieldProblems(
                entry,
                SMOKE_READINESS_CHECK_FIELDS,
                `smoke-readiness peer audit peer ${index} failed check ${checkIndex}`,
              ),
            );
          }
        }
      }
    }
  }

  const provers = readRecord(smokeReadinessReport, "provers");
  if (provers) {
    problems.push(
      ...unsupportedFieldProblems(
        provers,
        SMOKE_READINESS_PROVERS_FIELDS,
        "smoke-readiness provers",
      ),
    );
    for (const direction of ["destination", "source"]) {
      const prover = readRecord(provers, direction);
      if (!prover) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          prover,
          SMOKE_READINESS_PROVER_FIELDS,
          `smoke-readiness ${direction} prover`,
        ),
      );
      const manifest = readRecord(prover, "manifest");
      if (isRecord(manifest)) {
        problems.push(
          ...unsupportedFieldProblems(
            manifest,
            SMOKE_READINESS_PROVER_MANIFEST_FIELDS,
            `smoke-readiness ${direction} prover manifest`,
          ),
        );
        if (isRecord(readRecord(manifest, "deployment"))) {
          problems.push(
            ...unsupportedFieldProblems(
              readRecord(manifest, "deployment"),
              PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
              `smoke-readiness ${direction} prover manifest deployment`,
            ),
          );
        }
        if (isRecord(readRecord(manifest, "postDeployLiveEvidence"))) {
          problems.push(
            ...unsupportedFieldProblems(
              readRecord(manifest, "postDeployLiveEvidence"),
              PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
              `smoke-readiness ${direction} prover manifest postDeployLiveEvidence`,
            ),
          );
        }
      }
    }
    const runtimeConfig = readRecord(provers, "runtimeConfig");
    if (runtimeConfig) {
      problems.push(
        ...unsupportedFieldProblems(
          runtimeConfig,
          SMOKE_READINESS_RUNTIME_CONFIG_FIELDS,
          "smoke-readiness runtime prover config summary",
        ),
      );
    }
  }

  return problems;
};

const videoTranscriptShapeProblems = (videoTranscript) => {
  if (!isRecord(videoTranscript)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      videoTranscript,
      VIDEO_TRANSCRIPT_FIELDS,
      "video proof transcript",
    ),
  ];
  const transcriptBsc = readRecord(videoTranscript, "bsc");
  if (transcriptBsc) {
    problems.push(
      ...unsupportedFieldProblems(
        transcriptBsc,
        PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
        "video proof transcript BSC profile",
      ),
    );
  }
  const binding = readRecord(videoTranscript, "readinessBinding");
  if (binding) {
    problems.push(
      ...unsupportedFieldProblems(
        binding,
        VIDEO_READINESS_BINDING_FIELDS,
        "video readiness binding",
      ),
    );
    const checks = validatedRecordArray(
      problems,
      binding,
      "checks",
      "video readiness binding check",
    );
    if (checks) {
      for (const [index, entry] of checks.entries()) {
        problems.push(
          ...unsupportedFieldProblems(
            entry,
            SMOKE_READINESS_CHECK_FIELDS,
            `video readiness binding check ${index}`,
          ),
        );
      }
    }
    const route = readRecord(binding, "route");
    if (route) {
      problems.push(
        ...unsupportedFieldProblems(
          route,
          VIDEO_READINESS_BINDING_ROUTE_FIELDS,
          "video readiness binding route",
        ),
      );
      const routeBsc = readRecord(route, "bsc");
      if (routeBsc) {
        problems.push(
          ...unsupportedFieldProblems(
            routeBsc,
            PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
            "video readiness binding route BSC profile",
          ),
        );
      }
      const routeDeployment = readRecord(route, "deployment");
      if (routeDeployment) {
        problems.push(
          ...unsupportedFieldProblems(
            routeDeployment,
            PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
            "video readiness binding route deployment",
          ),
        );
      }
      const routePostDeployLiveEvidence = readRecord(
        route,
        "postDeployLiveEvidence",
      );
      if (routePostDeployLiveEvidence) {
        problems.push(
          ...unsupportedFieldProblems(
            routePostDeployLiveEvidence,
            PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
            "video readiness binding route postDeployLiveEvidence",
          ),
        );
      }
    }
    const peerAudit = readRecord(binding, "peerAudit");
    if (peerAudit) {
      problems.push(
        ...unsupportedFieldProblems(
          peerAudit,
          VIDEO_READINESS_BINDING_PEER_AUDIT_FIELDS,
          "video readiness binding peer audit",
        ),
      );
    }
  }
  const transactions = readRecord(videoTranscript, "transactions");
  if (transactions) {
    problems.push(
      ...unsupportedFieldProblems(
        transactions,
        VIDEO_TRANSACTION_FIELDS,
        "video proof transcript transactions",
      ),
    );
  }
  const transactionLinks = validatedRecordArray(
    problems,
    videoTranscript,
    "transactionLinks",
    "video proof transcript transaction link",
  );
  if (transactionLinks) {
    for (const [index, link] of transactionLinks.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          link,
          VIDEO_TRANSACTION_LINK_FIELDS,
          `video proof transcript transaction link ${index}`,
        ),
      );
    }
  }
  const explorerScreenshots = validatedRecordArray(
    problems,
    videoTranscript,
    "explorerScreenshots",
    "video proof transcript explorer screenshot",
  );
  if (explorerScreenshots) {
    for (const [index, screenshot] of explorerScreenshots.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          screenshot,
          VIDEO_EXPLORER_SCREENSHOT_FIELDS,
          `video proof transcript explorer screenshot ${index}`,
        ),
      );
    }
  }
  const videoArtifacts = validatedRecordArray(
    problems,
    videoTranscript,
    "videoArtifacts",
    "video proof transcript video artifact",
  );
  if (videoArtifacts) {
    for (const [index, artifact] of videoArtifacts.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          artifact,
          VIDEO_ARTIFACT_FIELDS,
          `video proof transcript video artifact ${index}`,
        ),
      );
    }
  }
  const evidence = readRecord(videoTranscript, "evidence");
  if (evidence) {
    problems.push(
      ...unsupportedFieldProblems(
        evidence,
        VIDEO_EVIDENCE_FIELDS,
        "video proof transcript evidence",
      ),
    );
    const readinessEvidence = readRecord(evidence, "readinessEvidence");
    if (readinessEvidence) {
      problems.push(
        ...unsupportedFieldProblems(
          readinessEvidence,
          VIDEO_READINESS_EVIDENCE_FIELDS,
          "video proof transcript readiness evidence",
        ),
      );
    }
    const postDeployTransactionEvidence = readRecord(
      evidence,
      "postDeployTransactionEvidence",
    );
    if (postDeployTransactionEvidence) {
      problems.push(
        ...unsupportedFieldProblems(
          postDeployTransactionEvidence,
          VIDEO_POST_DEPLOY_TRANSACTION_EVIDENCE_FIELDS,
          "video proof transcript post-deploy transaction evidence",
        ),
      );
      const reusedPostDeployTransactions = validatedRecordArray(
        problems,
        postDeployTransactionEvidence,
        "reusedPostDeployTransactions",
        "video proof transcript post-deploy reused transaction",
      );
      if (reusedPostDeployTransactions) {
        for (const [index, entry] of reusedPostDeployTransactions.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              entry,
              VIDEO_POST_DEPLOY_REUSED_TRANSACTION_FIELDS,
              `video proof transcript post-deploy reused transaction ${index}`,
            ),
          );
        }
      }
    }
    const videoArtifactEvidence = readRecord(evidence, "videoArtifactEvidence");
    if (videoArtifactEvidence) {
      problems.push(
        ...unsupportedFieldProblems(
          videoArtifactEvidence,
          VIDEO_ARTIFACT_EVIDENCE_FIELDS,
          "video proof transcript video artifact evidence",
        ),
      );
      const capturedArtifacts = validatedRecordArray(
        problems,
        videoArtifactEvidence,
        "capturedArtifacts",
        "video proof transcript captured video artifact",
      );
      if (capturedArtifacts) {
        for (const [index, artifact] of capturedArtifacts.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              artifact,
              VIDEO_CAPTURED_ARTIFACT_FIELDS,
              `video proof transcript captured video artifact ${index}`,
            ),
          );
        }
      }
    }
    const timelineEvidence = readRecord(evidence, "timelineEvidence");
    if (timelineEvidence) {
      problems.push(
        ...unsupportedFieldProblems(
          timelineEvidence,
          VIDEO_TIMELINE_EVIDENCE_FIELDS,
          "video proof transcript timeline evidence",
        ),
      );
    }
  }
  const missingEvidence = readRecord(videoTranscript, "missingEvidence");
  if (missingEvidence) {
    problems.push(
      ...unsupportedFieldProblems(
        missingEvidence,
        new Set(VIDEO_MISSING_EVIDENCE_FIELDS),
        "video proof transcript missingEvidence",
      ),
    );
  }
  return problems;
};

function normalizeMaterialInventoryFileSummaryPath(value) {
  const source = trim(value);
  if (!source) {
    return { normalized: null, problem: "path is missing" };
  }
  if (
    source.includes("\0") ||
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    /[?#]/u.test(source) ||
    source.includes("\\")
  ) {
    return {
      normalized: null,
      problem: "path must be a repo-relative public path",
    };
  }
  let decoded = source;
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return { normalized: null, problem: "path has invalid percent encoding" };
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  if (decoded !== source) {
    return {
      normalized: null,
      problem: "path must not use percent-encoded segments",
    };
  }
  const parts = source.split("/");
  let prefix;
  let rest;
  if (parts[0] === ".") {
    prefix = "./";
    rest = parts.slice(1);
  } else if (parts[0] === ".." && parts[1] === "iroha") {
    prefix = "../iroha/";
    rest = parts.slice(2);
  } else {
    return {
      normalized: null,
      problem: "path must start with ./ or ../iroha/",
    };
  }
  if (
    rest.length === 0 ||
    rest.some((part) => !part || part === "." || part === "..")
  ) {
    return {
      normalized: null,
      problem: "path must not include empty, current, or parent segments",
    };
  }
  return { normalized: `${prefix}${rest.join("/")}`, problem: null };
}

const materialInventorySafeRelativeEvidencePathProblems = (value, label) => {
  const source = trim(value);
  if (!source) {
    return [`${label} path is missing.`];
  }
  if (
    source.includes("\0") ||
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    /[?#]/u.test(source) ||
    source.includes("\\")
  ) {
    return [`${label} path must be a safe relative path.`];
  }
  let decoded = source;
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return [`${label} path has invalid percent encoding.`];
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  if (decoded !== source) {
    return [`${label} path must not use percent-encoded segments.`];
  }
  const parts = source.split("/");
  if (
    parts.length === 0 ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return [
      `${label} path must not include empty, current, or parent segments.`,
    ];
  }
  return [];
};

const materialInventoryOfflineFullTomlPathProblems = (value, label) => {
  const source = trim(value);
  if (!source) {
    return [`${label} is missing.`];
  }
  if (
    source.includes("\0") ||
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    /[?#]/u.test(source) ||
    source.includes("\\")
  ) {
    return [`${label} must be a relative path without parent traversal.`];
  }
  let decoded = source;
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return [`${label} must be a relative path without parent traversal.`];
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  if (decoded !== source) {
    return [`${label} must not use percent-encoded path segments.`];
  }
  const parts = source.split("/");
  if (
    parts.length === 0 ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return [`${label} must be a relative path without parent traversal.`];
  }
  return [];
};

const materialInventorySkippedGeneratedDirectoryProblems = (
  materialInventoryReport,
  counts,
) => {
  const problems = [];
  const reportedSkippedDirectoryCount = readNumber(
    counts,
    "skippedGeneratedDirectories",
  );
  if (
    !Number.isSafeInteger(reportedSkippedDirectoryCount) ||
    reportedSkippedDirectoryCount < 0
  ) {
    problems.push(
      "production material inventory skipped generated directory count is missing or invalid.",
    );
  }
  const skippedDirectories = readArray(
    materialInventoryReport,
    "skippedGeneratedDirectories",
  );
  if (!Array.isArray(skippedDirectories)) {
    problems.push(
      "production material inventory skipped generated directories are missing or invalid.",
    );
    return problems;
  }
  if (
    Number.isSafeInteger(reportedSkippedDirectoryCount) &&
    reportedSkippedDirectoryCount >= 0 &&
    skippedDirectories.length !== reportedSkippedDirectoryCount
  ) {
    problems.push(
      "production material inventory skipped generated directory count does not match skipped generated directory summaries.",
    );
  }
  const seen = new Map();
  skippedDirectories.forEach((entry, index) => {
    const normalizedPath = normalizeMaterialInventoryFileSummaryPath(entry);
    if (!normalizedPath.normalized) {
      problems.push(
        `production material inventory skipped generated directory ${index} ${normalizedPath.problem}.`,
      );
      return;
    }
    if (
      !GENERATED_NON_PRODUCTION_DIR_PATTERN.test(
        path.posix.basename(normalizedPath.normalized),
      )
    ) {
      problems.push(
        `production material inventory skipped generated directory ${index} is not a recognized generated non-production material directory.`,
      );
      return;
    }
    const previous = seen.get(normalizedPath.normalized);
    if (previous !== undefined) {
      problems.push(
        `production material inventory skipped generated directory ${index} duplicates skipped generated directory ${previous}.`,
      );
      return;
    }
    seen.set(normalizedPath.normalized, index);
  });
  return problems;
};

const pathIsCoveredByScanRoot = (normalizedPath, normalizedRoot) =>
  normalizedPath === normalizedRoot ||
  normalizedPath.startsWith(`${normalizedRoot}/`);

const VALID_MATERIAL_INVENTORY_SCAN_ROOT_KINDS = Object.freeze(
  new Set(["directory", "file", "missing", "symlink", "unsupported"]),
);
const AVAILABLE_MATERIAL_INVENTORY_SCAN_ROOT_KINDS = Object.freeze(
  new Set(["directory", "file"]),
);

const materialInventoryScanRootProblems = (
  materialInventoryReport,
  rawFiles,
) => {
  const problems = [];
  const scanRoots = readArray(materialInventoryReport, "scanRoots");
  if (!Array.isArray(scanRoots) || scanRoots.length === 0) {
    problems.push(
      "production material inventory scan roots are missing or invalid.",
    );
    return problems;
  }
  const normalizedRoots = [];
  const seenRoots = new Map();
  scanRoots.forEach((entry, index) => {
    const normalizedPath = normalizeMaterialInventoryFileSummaryPath(entry);
    if (!normalizedPath.normalized) {
      problems.push(
        `production material inventory scan root ${index} ${normalizedPath.problem}.`,
      );
      return;
    }
    if (
      GENERATED_NON_PRODUCTION_DIR_PATTERN.test(
        path.posix.basename(normalizedPath.normalized),
      )
    ) {
      problems.push(
        `production material inventory scan root ${index} must not be a generated non-production material directory.`,
      );
      return;
    }
    const previous = seenRoots.get(normalizedPath.normalized);
    if (previous !== undefined) {
      problems.push(
        `production material inventory scan root ${index} duplicates scan root ${previous}.`,
      );
      return;
    }
    seenRoots.set(normalizedPath.normalized, index);
    normalizedRoots.push({ path: normalizedPath.normalized, index });
  });
  const scanRootStatuses = readArray(
    materialInventoryReport,
    "scanRootStatuses",
  );
  if (!Array.isArray(scanRootStatuses)) {
    problems.push(
      "production material inventory scan root statuses are missing or invalid.",
    );
  } else {
    if (scanRootStatuses.length !== scanRoots.length) {
      problems.push(
        "production material inventory scan root status count does not match scan roots.",
      );
    }
    scanRootStatuses.forEach((entry, index) => {
      if (!isRecord(entry)) {
        problems.push(
          `production material inventory scan root status ${index} is missing or invalid.`,
        );
        return;
      }
      const statusPath = normalizeMaterialInventoryFileSummaryPath(
        readString(entry, "path"),
      );
      if (!statusPath.normalized) {
        problems.push(
          `production material inventory scan root status ${index} ${statusPath.problem}.`,
        );
      } else if (
        normalizedRoots[index] &&
        statusPath.normalized !== normalizedRoots[index].path
      ) {
        problems.push(
          `production material inventory scan root status ${index} path does not match scan root ${index}.`,
        );
      }
      const kind = readString(entry, "kind");
      const ok = hasOwn(entry, "ok") ? entry.ok : undefined;
      if (!VALID_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind)) {
        problems.push(
          `production material inventory scan root status ${index} kind is missing or invalid.`,
        );
      }
      if (typeof ok !== "boolean") {
        problems.push(
          `production material inventory scan root status ${index} ok flag is missing or invalid.`,
        );
      } else if (
        VALID_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind) &&
        ok !== AVAILABLE_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind)
      ) {
        problems.push(
          `production material inventory scan root status ${index} ok flag contradicts kind ${kind}.`,
        );
      }
      if (ok === false) {
        const detail = safeDiagnosticText(readString(entry, "detail"));
        problems.push(
          `production material inventory scan root ${index} is unavailable: ${kind}${detail ? ` (${detail})` : ""}.`,
        );
      }
    });
  }
  if (normalizedRoots.length === 0) {
    return problems;
  }
  rawFiles.filter(isRecord).forEach((entry, index) => {
    const normalizedPath = normalizeMaterialInventoryFileSummaryPath(
      readString(entry, "path"),
    );
    if (!normalizedPath.normalized) {
      return;
    }
    if (
      !normalizedRoots.some((root) =>
        pathIsCoveredByScanRoot(normalizedPath.normalized, root.path),
      )
    ) {
      problems.push(
        `production material inventory file summary ${index} path is not covered by scan roots.`,
      );
    }
  });
  const skippedDirectories = readArray(
    materialInventoryReport,
    "skippedGeneratedDirectories",
  );
  if (Array.isArray(skippedDirectories)) {
    skippedDirectories.forEach((entry, index) => {
      const normalizedPath = normalizeMaterialInventoryFileSummaryPath(entry);
      if (!normalizedPath.normalized) {
        return;
      }
      if (
        !normalizedRoots.some(
          (root) =>
            normalizedPath.normalized !== root.path &&
            pathIsCoveredByScanRoot(normalizedPath.normalized, root.path),
        )
      ) {
        problems.push(
          `production material inventory skipped generated directory ${index} is not under a scan root.`,
        );
      }
    });
  }
  return problems;
};

const materialInventoryScanRootAvailabilityProblems = (
  materialInventoryReport,
) => {
  const problems = [];
  if (!isRecord(materialInventoryReport)) {
    return ["production material inventory report is missing."];
  }
  const scanRoots = readArray(materialInventoryReport, "scanRoots");
  const scanRootStatuses = readArray(
    materialInventoryReport,
    "scanRootStatuses",
  );
  if (!Array.isArray(scanRoots) || scanRoots.length === 0) {
    problems.push(
      "production material inventory scan roots are missing or invalid.",
    );
  }
  if (!Array.isArray(scanRootStatuses)) {
    problems.push(
      "production material inventory scan root statuses are missing or invalid.",
    );
    return problems;
  }
  if (
    Array.isArray(scanRoots) &&
    scanRootStatuses.length !== scanRoots.length
  ) {
    problems.push(
      "production material inventory scan root status count does not match scan roots.",
    );
  }
  scanRootStatuses.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(
        `production material inventory scan root status ${index} is missing or invalid.`,
      );
      return;
    }
    const kind = readString(entry, "kind");
    const ok = hasOwn(entry, "ok") ? entry.ok : undefined;
    const statusPath = normalizeMaterialInventoryFileSummaryPath(
      readString(entry, "path"),
    );
    if (!statusPath.normalized) {
      problems.push(
        `production material inventory scan root status ${index} ${statusPath.problem}.`,
      );
    } else if (Array.isArray(scanRoots) && isRecord(entry)) {
      const rootPath = normalizeMaterialInventoryFileSummaryPath(
        scanRoots[index],
      );
      if (
        rootPath.normalized &&
        statusPath.normalized !== rootPath.normalized
      ) {
        problems.push(
          `production material inventory scan root status ${index} path does not match scan root ${index}.`,
        );
      }
    }
    if (!VALID_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind)) {
      problems.push(
        `production material inventory scan root status ${index} kind is missing or invalid.`,
      );
    }
    if (typeof ok !== "boolean") {
      problems.push(
        `production material inventory scan root status ${index} ok flag is missing or invalid.`,
      );
      return;
    }
    if (
      VALID_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind) &&
      ok !== AVAILABLE_MATERIAL_INVENTORY_SCAN_ROOT_KINDS.has(kind)
    ) {
      problems.push(
        `production material inventory scan root status ${index} ok flag contradicts kind ${kind}.`,
      );
    }
    if (ok === false) {
      const detail = safeDiagnosticText(readString(entry, "detail"));
      problems.push(
        `production material inventory scan root ${index} is unavailable: ${kind}${detail ? ` (${detail})` : ""}.`,
      );
    }
  });
  return problems;
};

const materialInventoryScanCompletenessProblems = (rawFiles, counts) => {
  const problems = [];
  const fileCount = readNumber(counts, "files");
  const relevantFilesSeen = readNumber(counts, "relevantFilesSeen");
  if (!Number.isSafeInteger(relevantFilesSeen) || relevantFilesSeen < 0) {
    problems.push(
      "production material inventory relevant file count is missing or invalid.",
    );
  } else if (
    Number.isSafeInteger(fileCount) &&
    relevantFilesSeen < rawFiles.length
  ) {
    problems.push(
      "production material inventory relevant file count is smaller than file summaries.",
    );
  } else if (Number.isSafeInteger(fileCount) && relevantFilesSeen < fileCount) {
    problems.push(
      "production material inventory relevant file count is smaller than reported file count.",
    );
  }
  const maxFiles = readNumber(counts, "maxFiles");
  if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0) {
    problems.push(
      "production material inventory scan max file limit is missing or invalid.",
    );
  } else if (
    Number.isSafeInteger(relevantFilesSeen) &&
    relevantFilesSeen > maxFiles
  ) {
    problems.push(
      "production material inventory scan max file limit is smaller than relevant file count.",
    );
  }
  if (!hasOwn(counts, "truncated") || typeof counts.truncated !== "boolean") {
    problems.push(
      "production material inventory scan truncation flag is missing or invalid.",
    );
  } else if (counts.truncated !== false) {
    problems.push("production material inventory scan is truncated.");
  }
  for (const [candidateKey, countKey, label] of [
    ["proofArtifactCandidates", "proofArtifacts", "proof artifact"],
    ["provingKeyCandidates", "provingKeys", "proving key"],
  ]) {
    const candidateCount = readNumber(counts, candidateKey);
    const productionCount = readNumber(counts, countKey);
    if (!Number.isSafeInteger(candidateCount) || candidateCount < 0) {
      problems.push(
        `production material inventory ${label} candidate count is missing or invalid.`,
      );
    } else if (
      Number.isSafeInteger(productionCount) &&
      candidateCount < productionCount
    ) {
      problems.push(
        `production material inventory ${label} candidate count is smaller than ${label} count.`,
      );
    }
  }
  return problems;
};

const nativeBundleSummaryHasRequiredSdks = (summary) => {
  if (!Array.isArray(readArray(summary, "verifiedSdks"))) {
    return false;
  }
  const verifiedSdks = readArray(summary, "verifiedSdks")
    .map((sdk) => (typeof sdk === "string" ? sdk.trim() : ""))
    .filter(Boolean);
  if (new Set(verifiedSdks).size !== verifiedSdks.length) {
    return false;
  }
  return SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS.every((sdk) =>
    verifiedSdks.includes(sdk),
  );
};

const materialProofFileSummaryIsProductionBound = (entry, proofFile) => {
  const sizeBytes = readNumber(entry, "sizeBytes");
  return (
    isRecord(proofFile) &&
    readBoolean(proofFile, "productionSized") &&
    readBoolean(proofFile, "productionMaxSized") &&
    readBoolean(proofFile, "productionEntropy") &&
    readBoolean(proofFile, "productionFormat") &&
    Number.isSafeInteger(sizeBytes) &&
    sizeBytes >= MIN_PRODUCTION_PROOF_FILE_BYTES &&
    sizeBytes <= SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES &&
    readNumber(proofFile, "maxSizeBytes") ===
      SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES
  );
};

const materialInventoryFileSummaryProblems = (
  materialInventoryReport,
  routeReport,
  counts,
  bscProfile = resolveBscNetworkProfile("testnet"),
) => {
  const rawFiles = readArray(materialInventoryReport, "files");
  if (!rawFiles) {
    return ["production material inventory file summaries are missing."];
  }
  const problems = [];
  rawFiles.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(
        `production material inventory file summary ${index} is not an object.`,
      );
    }
  });
  const fileCount = readNumber(counts, "files");
  if (!Number.isSafeInteger(fileCount) || fileCount < 0) {
    problems.push(
      "production material inventory file count is missing or invalid.",
    );
  } else if (rawFiles.length < fileCount) {
    problems.push(
      "production material inventory file summaries do not cover the reported file count.",
    );
  } else if (rawFiles.length > fileCount) {
    problems.push(
      "production material inventory file summaries exceed the reported file count.",
    );
  }
  problems.push(
    ...materialInventoryScanRootProblems(materialInventoryReport, rawFiles),
  );
  problems.push(...materialInventoryScanCompletenessProblems(rawFiles, counts));
  const files = rawFiles.filter(isRecord);
  const criticalFindings = countCriticalFindings(files);
  const warningFindings = countWarningFindings(files);
  const reportedCriticalFindings = readNumber(counts, "criticalFindings");
  if (!Number.isSafeInteger(reportedCriticalFindings)) {
    problems.push(
      "production material inventory critical finding count is missing or invalid.",
    );
  } else if (reportedCriticalFindings !== criticalFindings) {
    problems.push(
      "production material inventory critical finding count does not match file summaries.",
    );
  }
  if (criticalFindings > 0) {
    problems.push(
      "production material inventory file summaries contain critical findings.",
    );
  }
  problems.push(
    ...materialInventorySkippedGeneratedDirectoryProblems(
      materialInventoryReport,
      counts,
    ),
  );
  const reportedWarningFindings = readNumber(counts, "warningFindings");
  if (!Number.isSafeInteger(reportedWarningFindings)) {
    problems.push(
      "production material inventory warning finding count is missing or invalid.",
    );
  } else if (reportedWarningFindings !== warningFindings) {
    problems.push(
      "production material inventory warning finding count does not match file summaries.",
    );
  }
  const fileSummaryPaths = new Map();
  for (const [index, entry] of files.entries()) {
    problems.push(
      ...unsupportedFieldProblems(
        entry,
        MATERIAL_INVENTORY_FILE_SUMMARY_FIELDS,
        `production material inventory file summary ${index}`,
      ),
    );
    const filePath = readString(entry, "path");
    const normalizedPath = normalizeMaterialInventoryFileSummaryPath(filePath);
    if (!filePath || !normalizedPath.normalized) {
      problems.push(
        `production material inventory file summary ${index} ${normalizedPath.problem}.`,
      );
      continue;
    }
    const previous = fileSummaryPaths.get(normalizedPath.normalized);
    if (previous !== undefined) {
      problems.push(
        `production material inventory file summary ${index} path duplicates file summary ${previous}.`,
      );
    } else {
      fileSummaryPaths.set(normalizedPath.normalized, index);
    }
  }
  const routeDeployment = publicDeployment(
    readRecord(routeReport, "deployment"),
  );
  if (!routeDeployment) {
    problems.push(
      "production material inventory file summaries cannot bind without route deployment evidence.",
    );
    return problems;
  }
  const routeBurnRecordArtifactHashes = new Set(
    files
      .map((entry) => readRecord(entry, "route"))
      .filter(
        (routeFile) =>
          isRecord(routeFile) &&
          readString(routeFile, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
          readString(routeFile, "assetKey") === SCCP_BSC_XOR_ASSET_KEY,
      )
      .map((routeFile) =>
        normalizeHex(readString(routeFile, "burnRecordArtifactSha256")),
      )
      .filter(isNonZeroHex32),
  );
  for (const [index, entry] of files.entries()) {
    const routeFile = readRecord(entry, "route");
    if (readString(entry, "kind") === "route" && isRecord(routeFile)) {
      const burnRecordProblems = readArray(
        routeFile,
        "burnRecordArtifactProductionProblems",
      );
      problems.push(
        ...unsupportedFieldProblems(
          routeFile,
          MATERIAL_INVENTORY_ROUTE_FILE_FIELDS,
          `production material inventory route file ${index}`,
        ),
        ...routeIdentityProblemDetails(
          routeFile,
          `production material inventory route file ${index}`,
        ),
        ...deploymentFieldAliasProblems(
          routeFile,
          REQUIRED_MATERIAL_ROUTE_HASH_FIELDS,
          `production material inventory route file ${index}`,
        ),
        ...postDeployEvidenceDiffs(
          readRecord(routeReport, "postDeployLiveEvidence"),
          readRecord(routeFile, "postDeployLiveEvidence"),
          `production material inventory route file ${index}`,
          bscProfile,
        ).filter((problem) => /uses multiple aliases/u.test(problem)),
      );
      if (Array.isArray(burnRecordProblems) && burnRecordProblems.length > 0) {
        problems.push(
          `production material inventory route file ${index} carries invalid TAIRA burn-record material.`,
        );
      }
      const burnRecordArtifactSha256 = readString(
        routeFile,
        "burnRecordArtifactSha256",
      );
      if (
        burnRecordArtifactSha256 &&
        !isNonZeroHex32(burnRecordArtifactSha256)
      ) {
        problems.push(
          `production material inventory route file ${index} burnRecordArtifactSha256 is invalid.`,
        );
      }
    }
    const nativeBundle = readRecord(entry, "nativeProverBundle");
    if (
      readString(entry, "kind") === "native-prover-bundle" &&
      isRecord(nativeBundle)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          nativeBundle,
          MATERIAL_INVENTORY_NATIVE_PROVER_BUNDLE_FIELDS,
          `production material inventory native prover bundle file ${index}`,
        ),
        ...deploymentFieldAliasProblems(
          nativeBundle,
          REQUIRED_MATERIAL_ROUTE_HASH_FIELDS.filter(
            (key) => key !== "verifierCodeHash",
          ),
          `production material inventory native prover bundle file ${index}`,
        ),
        ...nativeEvmProverBundleRoleSeparatedHashProblems(
          nativeBundle,
          `production material inventory native prover bundle file ${index}`,
        ),
      );
    }
    const productionRequirements = readRecord(entry, "productionRequirements");
    if (
      readString(entry, "kind") === "production-requirements" &&
      isRecord(productionRequirements)
    ) {
      const declaredProfile = resolveDeclaredBscProfile(
        readString(productionRequirements, "bscNetwork"),
      );
      const expectedContractHash = declaredProfile
        ? bscProductionRequirementsContractHash(declaredProfile.key)
        : null;
      const contractHash = readString(productionRequirements, "contractHash");
      const declaredExpectedContractHash = readString(
        productionRequirements,
        "expectedContractHash",
      );
      problems.push(
        ...unsupportedFieldProblems(
          productionRequirements,
          MATERIAL_INVENTORY_PRODUCTION_REQUIREMENTS_FIELDS,
          `production material inventory production requirements file ${index}`,
        ),
        ...routeIdentityProblemDetails(
          productionRequirements,
          `production material inventory production requirements file ${index}`,
        ),
      );
      if (!declaredProfile) {
        problems.push(
          `production material inventory production requirements file ${index} bscNetwork is invalid.`,
        );
      }
      if (!isNonZeroHex32(contractHash)) {
        problems.push(
          `production material inventory production requirements file ${index} contractHash is missing or invalid.`,
        );
      } else if (
        declaredProfile &&
        normalizeHex(contractHash) !== expectedContractHash
      ) {
        problems.push(
          `production material inventory production requirements file ${index} contractHash does not match the expected BSC ${declaredProfile.key} requirements contract.`,
        );
      }
      if (!isNonZeroHex32(declaredExpectedContractHash)) {
        problems.push(
          `production material inventory production requirements file ${index} expectedContractHash is missing or invalid.`,
        );
      } else if (
        declaredProfile &&
        normalizeHex(declaredExpectedContractHash) !== expectedContractHash
      ) {
        problems.push(
          `production material inventory production requirements file ${index} expectedContractHash does not match the aggregate gate contract.`,
        );
      }
      if (
        readBoolean(productionRequirements, "contractMatchesExpected") !== true
      ) {
        problems.push(
          `production material inventory production requirements file ${index} contractMatchesExpected is not true.`,
        );
      }
      if (
        readNumber(productionRequirements, "inputCount") !==
        REQUIRED_BSC_PRODUCTION_REQUIREMENTS_INPUT_COUNT
      ) {
        problems.push(
          `production material inventory production requirements file ${index} inputCount must be ${REQUIRED_BSC_PRODUCTION_REQUIREMENTS_INPUT_COUNT}.`,
        );
      }
    }
    const sourceParityAttestation = readRecord(
      entry,
      "sourceParityAttestation",
    );
    if (
      readString(entry, "kind") === "source-parity-attestation" &&
      isRecord(sourceParityAttestation)
    ) {
      const declaredProfile = resolveDeclaredBscProfile(
        readString(sourceParityAttestation, "bscNetwork"),
      );
      problems.push(
        ...unsupportedFieldProblems(
          sourceParityAttestation,
          MATERIAL_INVENTORY_SOURCE_PARITY_ATTESTATION_FIELDS,
          `production material inventory source parity attestation file ${index}`,
        ),
        ...routeIdentityProblemDetails(
          sourceParityAttestation,
          `production material inventory source parity attestation file ${index}`,
        ),
      );
      if (!declaredProfile) {
        problems.push(
          `production material inventory source parity attestation file ${index} bscNetwork is invalid.`,
        );
      }
      if (
        declaredProfile &&
        readString(sourceParityAttestation, "chain") !== declaredProfile.chain
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} chain is invalid.`,
        );
      }
      if (
        declaredProfile &&
        readString(sourceParityAttestation, "chainIdHex") !==
          declaredProfile.chainIdHex
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} chainIdHex is invalid.`,
        );
      }
      if (
        declaredProfile &&
        readString(sourceParityAttestation, "networkIdHex") !==
          declaredProfile.networkIdHex
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} networkIdHex is invalid.`,
        );
      }
      if (readNumber(sourceParityAttestation, "domain") !== 2) {
        problems.push(
          `production material inventory source parity attestation file ${index} domain must be BSC.`,
        );
      }
      if (
        readString(sourceParityAttestation, "proofBackend") !==
        "evm-groth16-bn254-v1"
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} proofBackend is invalid.`,
        );
      }
      const requiredMarkers = readArray(
        sourceParityAttestation,
        "requiredMarkers",
      );
      const expectedRequiredMarkers = sourceParityRequiredMarkersForProfile(
        declaredProfile ?? bscProfile,
      );
      const requiredMarkerSet = new Set(
        requiredMarkers.filter((marker) => typeof marker === "string"),
      );
      if (
        requiredMarkers.length !== expectedRequiredMarkers.length ||
        requiredMarkerSet.size !== expectedRequiredMarkers.length
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} requiredMarkers are invalid.`,
        );
      } else {
        for (const marker of expectedRequiredMarkers) {
          if (!requiredMarkerSet.has(marker)) {
            problems.push(
              `production material inventory source parity attestation file ${index} requiredMarkers are missing ${marker}.`,
            );
          }
        }
        for (const marker of requiredMarkerSet) {
          if (!expectedRequiredMarkers.includes(marker)) {
            problems.push(
              `production material inventory source parity attestation file ${index} requiredMarkers contain unknown marker ${marker}.`,
            );
          }
        }
      }
      if (
        !isNonZeroHex32(
          readString(sourceParityAttestation, "sourceTreeHash"),
        ) ||
        !isNonZeroHex32(
          readString(sourceParityAttestation, "expectedSourceTreeHash"),
        ) ||
        normalizeHex(readString(sourceParityAttestation, "sourceTreeHash")) !==
          normalizeHex(
            readString(sourceParityAttestation, "expectedSourceTreeHash"),
          ) ||
        readBoolean(sourceParityAttestation, "sourceTreeHashMatches") !== true
      ) {
        problems.push(
          `production material inventory source parity attestation file ${index} sourceTreeHash is invalid.`,
        );
      }
      const sdks = readRecord(sourceParityAttestation, "sdks");
      if (!isRecord(sdks)) {
        problems.push(
          `production material inventory source parity attestation file ${index} sdks is missing.`,
        );
      } else {
        for (const sdk of Object.keys(
          SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
        )) {
          const sdkSummary = readRecord(sdks, sdk);
          if (!isRecord(sdkSummary)) {
            problems.push(
              `production material inventory source parity attestation file ${index} is missing SDK ${sdk}.`,
            );
            continue;
          }
          problems.push(
            ...unsupportedFieldProblems(
              sdkSummary,
              MATERIAL_INVENTORY_SOURCE_PARITY_SDK_FIELDS,
              `production material inventory source parity attestation file ${index} SDK ${sdk}`,
            ),
          );
          if (
            readString(sdkSummary, "implementation") !==
            SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1[sdk]
          ) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} implementation is invalid.`,
            );
          }
          if (!isNonZeroHex32(readString(sdkSummary, "implementationHash"))) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} implementationHash is missing or invalid.`,
            );
          }
          if (
            !isNonZeroHex32(
              readString(sdkSummary, "expectedImplementationHash"),
            )
          ) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} expectedImplementationHash is missing or invalid.`,
            );
          } else if (
            normalizeHex(readString(sdkSummary, "implementationHash")) !==
            normalizeHex(readString(sdkSummary, "expectedImplementationHash"))
          ) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} implementationHash does not match expectedImplementationHash.`,
            );
          }
          if (readBoolean(sdkSummary, "implementationHashMatches") !== true) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} implementationHashMatches is not true.`,
            );
          }
          if (readNumber(sdkSummary, "fileCount") <= 0) {
            problems.push(
              `production material inventory source parity attestation file ${index} SDK ${sdk} fileCount is missing or invalid.`,
            );
          }
        }
      }
    }
    const groth16MaterialManifest = readRecord(
      entry,
      "groth16MaterialManifest",
    );
    if (
      readString(entry, "kind") !== "groth16-material-manifest" &&
      isRecord(groth16MaterialManifest)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries groth16MaterialManifest for non-manifest kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-material-manifest" &&
      !isRecord(groth16MaterialManifest)
    ) {
      problems.push(
        `production material inventory Groth16 material manifest file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-material-manifest" &&
      isRecord(groth16MaterialManifest)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          groth16MaterialManifest,
          MATERIAL_INVENTORY_GROTH16_MATERIAL_MANIFEST_FIELDS,
          `production material inventory Groth16 material manifest file ${index}`,
        ),
      );
      if (readBoolean(groth16MaterialManifest, "valid") !== true) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} is not valid.`,
        );
      }
      if (
        readString(groth16MaterialManifest, "routeId") !==
          SCCP_BSC_XOR_ROUTE_ID ||
        readString(groth16MaterialManifest, "assetKey") !==
          SCCP_BSC_XOR_ASSET_KEY
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} route identity is invalid.`,
        );
      }
      if (
        readString(groth16MaterialManifest, "bscNetwork") !== bscProfile.key ||
        readString(groth16MaterialManifest, "chain") !== bscProfile.chain ||
        readString(groth16MaterialManifest, "chainIdHex") !==
          bscProfile.chainIdHex ||
        readString(groth16MaterialManifest, "networkIdHex") !==
          bscProfile.networkIdHex
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} BSC profile binding is invalid.`,
        );
      }
      if (
        readBoolean(groth16MaterialManifest, "productionReady") !== true ||
        readNumber(groth16MaterialManifest, "productionBlockerCount") !== 0
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} is not productionReady and blocker-free.`,
        );
      }
      if (
        readOwnValue(groth16MaterialManifest, "productionBlockers") !==
        undefined
      ) {
        const productionBlockers = readArray(
          groth16MaterialManifest,
          "productionBlockers",
        );
        if (!Array.isArray(productionBlockers)) {
          problems.push(
            `production material inventory Groth16 material manifest file ${index} productionBlockers must be an array.`,
          );
        } else {
          if (productionBlockers.some((entry) => typeof entry !== "string")) {
            problems.push(
              `production material inventory Groth16 material manifest file ${index} productionBlockers must contain only strings.`,
            );
          }
          if (
            Number.isSafeInteger(
              readNumber(groth16MaterialManifest, "productionBlockerCount"),
            ) &&
            productionBlockers.length !==
              readNumber(groth16MaterialManifest, "productionBlockerCount")
          ) {
            problems.push(
              `production material inventory Groth16 material manifest file ${index} productionBlockers count does not match productionBlockerCount.`,
            );
          }
        }
      }
      if (
        readOwnValue(groth16MaterialManifest, "productionBlockerSummary") !==
          undefined &&
        typeof readOwnValue(
          groth16MaterialManifest,
          "productionBlockerSummary",
        ) !== "string"
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} productionBlockerSummary must be a string.`,
        );
      }
      if (
        readBoolean(
          groth16MaterialManifest,
          "referencedTranscriptsVerified",
        ) !== true ||
        readBoolean(
          groth16MaterialManifest,
          "referencedAttestationsVerified",
        ) !== true
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} referenced transcripts and attestations are not verified.`,
        );
      }
      for (const [key, expected] of [
        ["verifierKeyHash", routeDeployment.verifierKeyHash],
        ["proofArtifactHash", routeDeployment.proofArtifactHash],
        ["provingKeyHash", routeDeployment.provingKeyHash],
      ]) {
        const actual = readString(groth16MaterialManifest, key);
        if (
          !isNonZeroHex32(actual) ||
          !isNonZeroHex32(expected) ||
          normalizeHex(actual) !== normalizeHex(expected)
        ) {
          problems.push(
            `production material inventory Groth16 material manifest file ${index} ${key} does not match public route.`,
          );
        }
      }
      if (
        readBoolean(groth16MaterialManifest, "publicDeploymentMatches") !== true
      ) {
        problems.push(
          `production material inventory Groth16 material manifest file ${index} publicDeploymentMatches is not true.`,
        );
      }
    }
    const groth16Request = readRecord(
      entry,
      "groth16AttestationRequestPackage",
    );
    if (
      readString(entry, "kind") !== "groth16-attestation-request-package" &&
      isRecord(groth16Request)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries groth16AttestationRequestPackage for non-request kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-attestation-request-package" &&
      !isRecord(groth16Request)
    ) {
      problems.push(
        `production material inventory Groth16 attestation request package file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-attestation-request-package" &&
      isRecord(groth16Request)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          groth16Request,
          MATERIAL_INVENTORY_GROTH16_ATTESTATION_REQUEST_PACKAGE_FIELDS,
          `production material inventory Groth16 attestation request package file ${index}`,
        ),
      );
      problems.push(
        ...materialInventorySafeRelativeEvidencePathProblems(
          readString(groth16Request, "manifestPath"),
          `production material inventory Groth16 attestation request package file ${index} manifestPath`,
        ),
      );
      if (readBoolean(groth16Request, "valid") !== true) {
        problems.push(
          `production material inventory Groth16 attestation request package file ${index} is not valid.`,
        );
      }
      if (
        readBoolean(groth16Request, "allRolesReady") !== true ||
        readBoolean(groth16Request, "referencedManifestVerified") !== true ||
        readBoolean(groth16Request, "manifestProductionReady") !== true ||
        readNumber(groth16Request, "manifestProductionBlockerCount") !== 0
      ) {
        problems.push(
          `production material inventory Groth16 attestation request package file ${index} is not bound to a ready material manifest.`,
        );
      }
      for (const [key, expected] of [
        ["verifierKeyHash", routeDeployment.verifierKeyHash],
        ["proofArtifactHash", routeDeployment.proofArtifactHash],
        ["provingKeyHash", routeDeployment.provingKeyHash],
      ]) {
        const actual = readString(groth16Request, key);
        if (
          !isNonZeroHex32(actual) ||
          !isNonZeroHex32(expected) ||
          normalizeHex(actual) !== normalizeHex(expected)
        ) {
          problems.push(
            `production material inventory Groth16 attestation request package file ${index} ${key} does not match public route.`,
          );
        }
      }
      if (readBoolean(groth16Request, "publicDeploymentMatches") !== true) {
        problems.push(
          `production material inventory Groth16 attestation request package file ${index} publicDeploymentMatches is not true.`,
        );
      }
    }
    const groth16AttestationHandoff = readRecord(
      entry,
      "groth16AttestationHandoff",
    );
    if (
      readString(entry, "kind") !== "groth16-attestation-handoff" &&
      isRecord(groth16AttestationHandoff)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries groth16AttestationHandoff for non-handoff kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-attestation-handoff" &&
      !isRecord(groth16AttestationHandoff)
    ) {
      problems.push(
        `production material inventory Groth16 attestation handoff file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-attestation-handoff" &&
      isRecord(groth16AttestationHandoff)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          groth16AttestationHandoff,
          MATERIAL_INVENTORY_GROTH16_ATTESTATION_HANDOFF_FIELDS,
          `production material inventory Groth16 attestation handoff file ${index}`,
        ),
        ...materialInventorySafeRelativeEvidencePathProblems(
          readString(groth16AttestationHandoff, "manifestPath"),
          `production material inventory Groth16 attestation handoff file ${index} manifestPath`,
        ),
        ...materialInventorySafeRelativeEvidencePathProblems(
          readString(groth16AttestationHandoff, "attestationRequestPath"),
          `production material inventory Groth16 attestation handoff file ${index} attestationRequestPath`,
        ),
      );
      const declaredProfile = resolveDeclaredBscProfile(
        readString(groth16AttestationHandoff, "bscNetwork"),
      );
      if (readBoolean(groth16AttestationHandoff, "valid") !== true) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} is not valid.`,
        );
      }
      if (
        readString(groth16AttestationHandoff, "schema") !==
        "iroha-sccp-bsc-groth16-attestation-handoff/v1"
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} schema is invalid.`,
        );
      }
      if (
        readString(groth16AttestationHandoff, "routeId") !==
          SCCP_BSC_XOR_ROUTE_ID ||
        readString(groth16AttestationHandoff, "assetKey") !==
          SCCP_BSC_XOR_ASSET_KEY
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} route identity is invalid.`,
        );
      }
      if (
        !declaredProfile ||
        readString(groth16AttestationHandoff, "chain") !==
          declaredProfile.chain ||
        readString(groth16AttestationHandoff, "chainIdHex") !==
          declaredProfile.chainIdHex ||
        readString(groth16AttestationHandoff, "networkIdHex") !==
          declaredProfile.networkIdHex ||
        declaredProfile.key !== bscProfile.key
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} BSC profile binding is invalid.`,
        );
      }
      if (
        readString(groth16AttestationHandoff, "circuitProfile") !==
        "sccp-bsc-full-message-v1"
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} circuitProfile is invalid.`,
        );
      }
      if (
        readString(groth16AttestationHandoff, "proofBackend") !==
        "evm-groth16-bn254-v1"
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} proofBackend is invalid.`,
        );
      }
      if (
        !isNonZeroHex32(
          readString(groth16AttestationHandoff, "manifestSha256"),
        ) ||
        !isNonZeroHex32(
          readString(groth16AttestationHandoff, "attestationRequestSha256"),
        )
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} referenced package hashes are missing or invalid.`,
        );
      }
      if (
        !isNonZeroHex32(
          readString(groth16AttestationHandoff, "verifierKeyHash"),
        ) ||
        normalizeHex(
          readString(groth16AttestationHandoff, "verifierKeyHash"),
        ) !== normalizeHex(routeDeployment.verifierKeyHash)
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} verifierKeyHash does not match public route.`,
        );
      }
      if (
        readBoolean(groth16AttestationHandoff, "handoffComplete") !== true ||
        readBoolean(groth16AttestationHandoff, "requestValid") !== true ||
        readBoolean(groth16AttestationHandoff, "referencedRequestVerified") !==
          true ||
        readBoolean(groth16AttestationHandoff, "referencedManifestVerified") !==
          true ||
        readBoolean(groth16AttestationHandoff, "publicDeploymentMatches") !==
          true
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} is not bound to the scanned request, manifest, and public route.`,
        );
      }
      const manifestProductionBlockers = readArray(
        groth16AttestationHandoff,
        "manifestProductionBlockers",
      );
      if (
        readOwnValue(
          groth16AttestationHandoff,
          "manifestProductionBlockers",
        ) !== undefined
      ) {
        if (!Array.isArray(manifestProductionBlockers)) {
          problems.push(
            `production material inventory Groth16 attestation handoff file ${index} manifestProductionBlockers must be an array.`,
          );
        } else {
          if (
            manifestProductionBlockers.some(
              (entry) => typeof entry !== "string",
            )
          ) {
            problems.push(
              `production material inventory Groth16 attestation handoff file ${index} manifestProductionBlockers must contain only strings.`,
            );
          }
          if (
            Number.isSafeInteger(
              readNumber(
                groth16AttestationHandoff,
                "manifestProductionBlockerCount",
              ),
            ) &&
            manifestProductionBlockers.length !==
              readNumber(
                groth16AttestationHandoff,
                "manifestProductionBlockerCount",
              )
          ) {
            problems.push(
              `production material inventory Groth16 attestation handoff file ${index} manifestProductionBlockers count does not match manifestProductionBlockerCount.`,
            );
          }
        }
      }
      for (const [field, label] of [
        ["missingSignedRoles", "missingSignedRoles"],
        ["handoffBlockers", "handoffBlockers"],
        ["readinessProductionBlockers", "readinessProductionBlockers"],
        ["nextActions", "nextActions"],
      ]) {
        const value = readOwnValue(groth16AttestationHandoff, field);
        const entries = readArray(groth16AttestationHandoff, field);
        if (value !== undefined && !Array.isArray(entries)) {
          problems.push(
            `production material inventory Groth16 attestation handoff file ${index} ${label} must be an array.`,
          );
        } else if (
          Array.isArray(entries) &&
          entries.some((entry) => typeof entry !== "string")
        ) {
          problems.push(
            `production material inventory Groth16 attestation handoff file ${index} ${label} must contain only strings.`,
          );
        }
      }
      const missingSignedRoles =
        readArray(groth16AttestationHandoff, "missingSignedRoles") ?? [];
      const handoffBlockers =
        readArray(groth16AttestationHandoff, "handoffBlockers") ?? [];
      const readinessProductionBlockers =
        readArray(groth16AttestationHandoff, "readinessProductionBlockers") ??
        [];
      const nextActions =
        readArray(groth16AttestationHandoff, "nextActions") ?? [];
      const problemCount = readNumber(
        groth16AttestationHandoff,
        "problemCount",
      );
      const attestationStatusProblemCount = readNumber(
        groth16AttestationHandoff,
        "attestationStatusProblemCount",
      );
      if (!Number.isSafeInteger(problemCount) || problemCount < 0) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} problemCount is missing or invalid.`,
        );
      }
      if (
        !Number.isSafeInteger(attestationStatusProblemCount) ||
        attestationStatusProblemCount < 0
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} attestationStatusProblemCount is missing or invalid.`,
        );
      }
      if (
        readBoolean(groth16AttestationHandoff, "signingReady") === true &&
        readBoolean(groth16AttestationHandoff, "allRolesReady") !== true
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} signingReady cannot be true while allRolesReady is false.`,
        );
      }
      if (
        readBoolean(groth16AttestationHandoff, "readyToFinalize") === true &&
        (readBoolean(groth16AttestationHandoff, "signingReady") !== true ||
          readBoolean(groth16AttestationHandoff, "allRolesReady") !== true ||
          missingSignedRoles.length !== 0 ||
          readBoolean(groth16AttestationHandoff, "readinessProductionReady") !==
            true ||
          problemCount !== 0)
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} readyToFinalize is inconsistent with readiness fields.`,
        );
      }
      if (
        problemCount === 0 &&
        (handoffBlockers.length > 0 ||
          readinessProductionBlockers.length > 0 ||
          attestationStatusProblemCount > 0)
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} problemCount is zero while blockers or status problems remain.`,
        );
      }
      if (
        readBoolean(groth16AttestationHandoff, "readyToFinalize") !== true &&
        nextActions.length === 0
      ) {
        problems.push(
          `production material inventory Groth16 attestation handoff file ${index} nextActions must explain an unfinished handoff.`,
        );
      }
    }
    const groth16ProofSelfTestReport = readRecord(
      entry,
      "groth16ProofSelfTestReport",
    );
    if (
      readString(entry, "kind") !== "groth16-proof-self-test-report" &&
      isRecord(groth16ProofSelfTestReport)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries groth16ProofSelfTestReport for non-proof-self-test kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-proof-self-test-report" &&
      !isRecord(groth16ProofSelfTestReport)
    ) {
      problems.push(
        `production material inventory Groth16 proof self-test report file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "groth16-proof-self-test-report" &&
      isRecord(groth16ProofSelfTestReport)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          groth16ProofSelfTestReport,
          MATERIAL_INVENTORY_GROTH16_PROOF_SELF_TEST_REPORT_FIELDS,
          `production material inventory Groth16 proof self-test report file ${index}`,
        ),
      );
      problems.push(
        ...materialInventorySafeRelativeEvidencePathProblems(
          readString(groth16ProofSelfTestReport, "manifestPath"),
          `production material inventory Groth16 proof self-test report file ${index} manifestPath`,
        ),
      );
      if (readBoolean(groth16ProofSelfTestReport, "valid") !== true) {
        problems.push(
          `production material inventory Groth16 proof self-test report file ${index} is not valid.`,
        );
      }
      if (
        readBoolean(
          groth16ProofSelfTestReport,
          "referencedManifestVerified",
        ) !== true ||
        readBoolean(groth16ProofSelfTestReport, "manifestProductionReady") !==
          true ||
        readNumber(
          groth16ProofSelfTestReport,
          "manifestProductionBlockerCount",
        ) !== 0
      ) {
        problems.push(
          `production material inventory Groth16 proof self-test report file ${index} is not bound to a ready material manifest.`,
        );
      }
      if (
        readOwnValue(
          groth16ProofSelfTestReport,
          "manifestProductionBlockers",
        ) !== undefined
      ) {
        const productionBlockers = readArray(
          groth16ProofSelfTestReport,
          "manifestProductionBlockers",
        );
        if (!Array.isArray(productionBlockers)) {
          problems.push(
            `production material inventory Groth16 proof self-test report file ${index} manifestProductionBlockers must be an array.`,
          );
        } else {
          if (productionBlockers.some((entry) => typeof entry !== "string")) {
            problems.push(
              `production material inventory Groth16 proof self-test report file ${index} manifestProductionBlockers must contain only strings.`,
            );
          }
          if (
            Number.isSafeInteger(
              readNumber(
                groth16ProofSelfTestReport,
                "manifestProductionBlockerCount",
              ),
            ) &&
            productionBlockers.length !==
              readNumber(
                groth16ProofSelfTestReport,
                "manifestProductionBlockerCount",
              )
          ) {
            problems.push(
              `production material inventory Groth16 proof self-test report file ${index} manifestProductionBlockers count does not match manifestProductionBlockerCount.`,
            );
          }
        }
      }
      if (
        readOwnValue(
          groth16ProofSelfTestReport,
          "manifestProductionBlockerSummary",
        ) !== undefined &&
        typeof readOwnValue(
          groth16ProofSelfTestReport,
          "manifestProductionBlockerSummary",
        ) !== "string"
      ) {
        problems.push(
          `production material inventory Groth16 proof self-test report file ${index} manifestProductionBlockerSummary must be a string.`,
        );
      }
      for (const [key, expected] of [
        ["proofArtifactHash", routeDeployment.proofArtifactHash],
        ["provingKeyHash", routeDeployment.provingKeyHash],
      ]) {
        const actual = readString(groth16ProofSelfTestReport, key);
        if (
          !isNonZeroHex32(actual) ||
          !isNonZeroHex32(expected) ||
          normalizeHex(actual) !== normalizeHex(expected)
        ) {
          problems.push(
            `production material inventory Groth16 proof self-test report file ${index} ${key} does not match public route.`,
          );
        }
      }
      for (const key of [
        "bscVerifierKeyArtifactHash",
        "snarkjsVerificationKeyHash",
        "witnessWasmHash",
        "witnessHash",
        "proofHash",
        "publicSignalsHash",
      ]) {
        if (!isNonZeroHex32(readString(groth16ProofSelfTestReport, key))) {
          problems.push(
            `production material inventory Groth16 proof self-test report file ${index} ${key} is missing or invalid.`,
          );
        }
      }
      if (
        readBoolean(groth16ProofSelfTestReport, "publicDeploymentMatches") !==
        true
      ) {
        problems.push(
          `production material inventory Groth16 proof self-test report file ${index} publicDeploymentMatches is not true.`,
        );
      }
    }
    const contractArtifact = readRecord(entry, "contractArtifact");
    if (
      readString(entry, "kind") !== "contract-artifact" &&
      isRecord(contractArtifact)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries contractArtifact for non-contract kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "contract-artifact" &&
      !isRecord(contractArtifact)
    ) {
      problems.push(
        `production material inventory compiled contract artifact file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "contract-artifact" &&
      isRecord(contractArtifact)
    ) {
      const key = readString(contractArtifact, "key");
      const expectedContractName = BSC_COMPILED_CONTRACT_ARTIFACTS[key];
      problems.push(
        ...unsupportedFieldProblems(
          contractArtifact,
          MATERIAL_INVENTORY_CONTRACT_ARTIFACT_FIELDS,
          `production material inventory compiled contract artifact file ${index}`,
        ),
      );
      if (readBoolean(contractArtifact, "valid") !== true) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} is not valid.`,
        );
      }
      if (!expectedContractName) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} key is invalid.`,
        );
      } else if (
        readString(contractArtifact, "contractName") !== expectedContractName
      ) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} contractName must be ${expectedContractName}.`,
        );
      }
      if (readNumber(contractArtifact, "abiEntryCount") <= 0) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} abiEntryCount is missing or invalid.`,
        );
      }
      if (!isNonZeroHex32(readString(contractArtifact, "bytecodeKeccak256"))) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} bytecodeKeccak256 is missing or invalid.`,
        );
      }
      if (
        !isNonZeroHex32(
          readString(contractArtifact, "deployedBytecodeKeccak256"),
        )
      ) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} deployedBytecodeKeccak256 is missing or invalid.`,
        );
      }
      if (!isNonZeroHex32(readString(contractArtifact, "bytecodeSha256"))) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} bytecodeSha256 is missing or invalid.`,
        );
      }
      if (
        !isNonZeroHex32(readString(contractArtifact, "deployedBytecodeSha256"))
      ) {
        problems.push(
          `production material inventory compiled contract artifact file ${index} deployedBytecodeSha256 is missing or invalid.`,
        );
      }
    }
    const tairaBurnRecordContract = readRecord(
      entry,
      "tairaBurnRecordContract",
    );
    if (
      readString(entry, "kind") !== "taira-burn-record-contract" &&
      isRecord(tairaBurnRecordContract)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries tairaBurnRecordContract for non-contract kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "taira-burn-record-contract" &&
      !isRecord(tairaBurnRecordContract)
    ) {
      problems.push(
        `production material inventory TAIRA burn-record contract file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "taira-burn-record-contract" &&
      isRecord(tairaBurnRecordContract)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          tairaBurnRecordContract,
          MATERIAL_INVENTORY_TAIRA_BURN_RECORD_CONTRACT_FIELDS,
          `production material inventory TAIRA burn-record contract file ${index}`,
        ),
        ...routeIdentityProblemDetails(
          tairaBurnRecordContract,
          `production material inventory TAIRA burn-record contract file ${index}`,
        ),
      );
      if (readBoolean(tairaBurnRecordContract, "valid") !== true) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} is not valid.`,
        );
      }
      if (
        readString(tairaBurnRecordContract, "schema") !==
        TAIRA_BURN_RECORD_CONTRACT_SCHEMA
      ) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} schema is invalid.`,
        );
      }
      if (
        readString(tairaBurnRecordContract, "sourceName") !==
        TAIRA_BSC_BURN_RECORD_SOURCE_NAME
      ) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} sourceName is invalid.`,
        );
      }
      if (
        !/^kotodama_lang\/[0-9][0-9A-Za-z.+-]*$/u.test(
          readString(tairaBurnRecordContract, "compilerFingerprint") ?? "",
        )
      ) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} compilerFingerprint is invalid.`,
        );
      }
      for (const key of ["codeHash", "abiHash", "artifactSha256"]) {
        if (!isNonZeroHex32(readString(tairaBurnRecordContract, key))) {
          problems.push(
            `production material inventory TAIRA burn-record contract file ${index} ${key} is missing or invalid.`,
          );
        }
      }
      if (readNumber(tairaBurnRecordContract, "artifactSizeBytes") <= 0) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} artifactSizeBytes is missing or invalid.`,
        );
      }
      if (
        readNumber(
          tairaBurnRecordContract,
          "artifactProductionProblemCount",
        ) !== 0
      ) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} artifactProductionProblemCount must be 0.`,
        );
      }
      for (const [key, expected] of [
        ["entrypoint", "burn_and_record"],
        ["permission", "AssetTransferRole"],
        ["paramSignature", TAIRA_BURN_RECORD_PARAM_SIGNATURE],
        ["executable", "IvmProved"],
        ["settlementInstruction", "Burn<Numeric, Asset>"],
        ["recordInstruction", "RecordSccpMessage"],
      ]) {
        if (readString(tairaBurnRecordContract, key) !== expected) {
          problems.push(
            `production material inventory TAIRA burn-record contract file ${index} ${key} is invalid.`,
          );
        }
      }
      if (readBoolean(tairaBurnRecordContract, "forceZkMode") !== true) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} forceZkMode is not true.`,
        );
      }
      const artifactSha256 = normalizeHex(
        readString(tairaBurnRecordContract, "artifactSha256"),
      );
      const actualRouteArtifactHashMatches =
        isNonZeroHex32(artifactSha256) &&
        routeBurnRecordArtifactHashes.has(artifactSha256);
      if (
        readBoolean(tairaBurnRecordContract, "routeArtifactHashMatches") !==
        actualRouteArtifactHashMatches
      ) {
        problems.push(
          `production material inventory TAIRA burn-record contract file ${index} routeArtifactHashMatches does not match scanned route summaries.`,
        );
      }
    }
    const deploymentEvidence = readRecord(entry, "deploymentEvidence");
    if (
      readString(entry, "kind") !== "deployment-evidence" &&
      isRecord(deploymentEvidence)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries deploymentEvidence for non-evidence kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "deployment-evidence" &&
      !isRecord(deploymentEvidence)
    ) {
      problems.push(
        `production material inventory deployment evidence file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "deployment-evidence" &&
      isRecord(deploymentEvidence)
    ) {
      problems.push(
        ...materialDeploymentEvidenceSummaryProblems({
          evidence: deploymentEvidence,
          routeDeployment,
          index,
          bscProfile,
        }),
      );
    }
    const offlineFullTomlEvidence = readRecord(
      entry,
      "offlineFullTomlEvidence",
    );
    if (
      readString(entry, "kind") !== "offline-full-toml-evidence" &&
      isRecord(offlineFullTomlEvidence)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries offlineFullTomlEvidence for non-evidence kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "offline-full-toml-evidence" &&
      !isRecord(offlineFullTomlEvidence)
    ) {
      problems.push(
        `production material inventory offline full-TOML evidence file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "offline-full-toml-evidence" &&
      isRecord(offlineFullTomlEvidence)
    ) {
      const publicOfflineFullTomlSha256 = normalizeHex(
        readString(
          readRecord(routeReport, "postDeployLiveEvidence"),
          "offlineFullTomlSha256",
        ),
      );
      const evidenceOfflineFullTomlSha256 = normalizeHex(
        readString(offlineFullTomlEvidence, "offlineFullTomlSha256"),
      );
      const hashInputSha256 = normalizeHex(
        readString(offlineFullTomlEvidence, "hashInputSha256"),
      );
      problems.push(
        ...unsupportedFieldProblems(
          offlineFullTomlEvidence,
          MATERIAL_INVENTORY_OFFLINE_FULL_TOML_EVIDENCE_FIELDS,
          `production material inventory offline full-TOML evidence file ${index}`,
        ),
        ...routeIdentityProblemDetails(
          offlineFullTomlEvidence,
          `production material inventory offline full-TOML evidence file ${index}`,
        ),
      );
      if (readBoolean(offlineFullTomlEvidence, "valid") !== true) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} is not valid.`,
        );
      }
      if (
        readString(offlineFullTomlEvidence, "schema") !==
        "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1"
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} schema is invalid.`,
        );
      }
      if (
        readString(offlineFullTomlEvidence, "bscNetwork") !== bscProfile.key
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} bscNetwork must be ${bscProfile.key}.`,
        );
      }
      if (
        readString(offlineFullTomlEvidence, "chainIdHex") !==
        bscProfile.chainIdHex
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} chainIdHex must be ${bscProfile.chainIdHex}.`,
        );
      }
      if (
        readString(offlineFullTomlEvidence, "networkIdHex") !==
        bscProfile.networkIdHex
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} networkIdHex must be ${bscProfile.networkIdHex}.`,
        );
      }
      if (readBoolean(offlineFullTomlEvidence, "fullTomlReady") !== true) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} fullTomlReady is not true.`,
        );
      }
      if (
        readString(offlineFullTomlEvidence, "hashMode") !==
        "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256"
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} hashMode is invalid.`,
        );
      }
      for (const field of ["routeManifestPath", "fullConfigPath"]) {
        problems.push(
          ...materialInventoryOfflineFullTomlPathProblems(
            readString(offlineFullTomlEvidence, field),
            `production material inventory offline full-TOML evidence file ${index} ${field}`,
          ),
        );
      }
      if (!isNonZeroHex32(evidenceOfflineFullTomlSha256)) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} offlineFullTomlSha256 is missing or invalid.`,
        );
      }
      if (!isNonZeroHex32(hashInputSha256)) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} hashInputSha256 is missing or invalid.`,
        );
      } else if (
        isNonZeroHex32(evidenceOfflineFullTomlSha256) &&
        hashInputSha256 !== evidenceOfflineFullTomlSha256
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} hashInputSha256 does not match offlineFullTomlSha256.`,
        );
      }
      if (
        !isNonZeroHex32(
          readString(offlineFullTomlEvidence, "renderedTomlSha256"),
        )
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} renderedTomlSha256 is missing or invalid.`,
        );
      }
      if (!isNonZeroHex32(publicOfflineFullTomlSha256)) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} cannot bind because public route offlineFullTomlSha256 is missing or invalid.`,
        );
      } else if (
        isNonZeroHex32(evidenceOfflineFullTomlSha256) &&
        evidenceOfflineFullTomlSha256 !== publicOfflineFullTomlSha256
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} offlineFullTomlSha256 does not match public route post-deploy evidence.`,
        );
      }
      if (
        readBoolean(offlineFullTomlEvidence, "publicPostDeployMatches") !== true
      ) {
        problems.push(
          `production material inventory offline full-TOML evidence file ${index} publicPostDeployMatches is not true.`,
        );
      }
    }
    const browserProverSidecar = readRecord(entry, "browserProverSidecar");
    if (
      readString(entry, "kind") !== "browser-prover-sidecar" &&
      isRecord(browserProverSidecar)
    ) {
      problems.push(
        `production material inventory file summary ${index} carries browserProverSidecar for non-sidecar kind ${readString(entry, "kind")}.`,
      );
    }
    if (
      readString(entry, "kind") === "browser-prover-sidecar" &&
      !isRecord(browserProverSidecar)
    ) {
      problems.push(
        `production material inventory browser prover sidecar file ${index} summary is missing.`,
      );
    }
    if (
      readString(entry, "kind") === "browser-prover-sidecar" &&
      isRecord(browserProverSidecar)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          browserProverSidecar,
          MATERIAL_INVENTORY_BROWSER_PROVER_FILE_FIELDS,
          `production material inventory browser prover sidecar file ${index}`,
        ),
      );
      if (readBoolean(browserProverSidecar, "valid") !== true) {
        problems.push(
          `production material inventory browser prover sidecar file ${index} is not valid.`,
        );
      }
      const declaredModuleSha256 = readString(
        browserProverSidecar,
        "moduleSha256",
      );
      const actualModuleSha256 = readString(
        browserProverSidecar,
        "moduleSha256Actual",
      );
      if (
        !isNonZeroHex32(declaredModuleSha256) ||
        !isNonZeroHex32(actualModuleSha256) ||
        normalizeHex(declaredModuleSha256) !== normalizeHex(actualModuleSha256)
      ) {
        problems.push(
          `production material inventory browser prover sidecar file ${index} moduleSha256 does not match moduleSha256Actual.`,
        );
      }
      if (!Array.isArray(readArray(browserProverSidecar, "exports"))) {
        problems.push(
          `production material inventory browser prover sidecar file ${index} exports are missing.`,
        );
      }
    }
    const verifier = readRecord(entry, "verifier");
    if (readString(entry, "kind") === "verifier" && isRecord(verifier)) {
      problems.push(
        ...unsupportedFieldProblems(
          verifier,
          MATERIAL_INVENTORY_VERIFIER_FILE_FIELDS,
          `production material inventory verifier file ${index}`,
        ),
        ...deploymentFieldAliasProblems(
          verifier,
          ["verifierKeyHash"],
          `production material inventory verifier file ${index}`,
        ),
      );
    }
    const proofFile = readRecord(entry, "proofFile");
    if (
      (readString(entry, "kind") === "proof-artifact" ||
        readString(entry, "kind") === "proving-key") &&
      isRecord(proofFile)
    ) {
      problems.push(
        ...unsupportedFieldProblems(
          proofFile,
          MATERIAL_INVENTORY_PROOF_FILE_FIELDS,
          `production material inventory proof file ${index}`,
        ),
      );
    }
  }

  const routeFiles = files.filter((entry) => {
    const routeFile = readRecord(entry, "route");
    return (
      readString(entry, "kind") === "route" &&
      isRecord(routeFile) &&
      readBoolean(routeFile, "productionReady") &&
      readBoolean(routeFile, "publicDeploymentMatches") &&
      !readBoolean(routeFile, "disabled") &&
      readString(routeFile, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(routeFile, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(routeFile, "explorerUrl") === bscProfile.explorerUrl &&
      readString(routeFile, "explorerHost") === bscProfile.explorerHost &&
      readBoolean(routeFile, "explorerBindingMatches") &&
      !hasCriticalFindings(entry) &&
      routeHashesMatchDeployment(routeFile, routeDeployment) &&
      postDeployEvidenceMatches(
        readRecord(routeReport, "postDeployLiveEvidence"),
        readRecord(routeFile, "postDeployLiveEvidence"),
        bscProfile,
      )
    );
  });
  if (routeFiles.length === 0) {
    problems.push(
      "production material inventory has no clean route file summary bound to the public route deployment hashes and post-deploy live evidence.",
    );
  }

  const productionRequirementsFiles = files.filter((entry) => {
    const productionRequirements = readRecord(entry, "productionRequirements");
    return (
      readString(entry, "kind") === "production-requirements" &&
      isRecord(productionRequirements) &&
      readBoolean(productionRequirements, "valid") &&
      readString(productionRequirements, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(productionRequirements, "assetKey") ===
        SCCP_BSC_XOR_ASSET_KEY &&
      readString(productionRequirements, "bscNetwork") === bscProfile.key &&
      readNumber(productionRequirements, "inputCount") ===
        REQUIRED_BSC_PRODUCTION_REQUIREMENTS_INPUT_COUNT &&
      readNumber(productionRequirements, "requiredReportCount") >= 5 &&
      readNumber(productionRequirements, "deniedVerifierKeyHashCount") >= 1 &&
      normalizeHex(readString(productionRequirements, "contractHash")) ===
        bscProductionRequirementsContractHash(bscProfile.key) &&
      normalizeHex(
        readString(productionRequirements, "expectedContractHash"),
      ) === bscProductionRequirementsContractHash(bscProfile.key) &&
      readBoolean(productionRequirements, "contractMatchesExpected") === true &&
      !hasCriticalFindings(entry)
    );
  });
  if (productionRequirementsFiles.length === 0) {
    problems.push(
      "production material inventory has no clean production requirements artifact.",
    );
  }

  const deploymentEvidenceFiles = files.filter((entry, index) => {
    const deploymentEvidence = readRecord(entry, "deploymentEvidence");
    return (
      readString(entry, "kind") === "deployment-evidence" &&
      isRecord(deploymentEvidence) &&
      !hasCriticalFindings(entry) &&
      materialDeploymentEvidenceSummaryProblems({
        evidence: deploymentEvidence,
        routeDeployment,
        index,
        bscProfile,
      }).length === 0
    );
  });
  if (deploymentEvidenceFiles.length === 0) {
    problems.push(
      "production material inventory has no clean BSC deployment evidence artifact bound to the public route deployment.",
    );
  }

  const offlineFullTomlEvidenceFiles = files.filter((entry) => {
    const offlineFullTomlEvidence = readRecord(
      entry,
      "offlineFullTomlEvidence",
    );
    const publicOfflineFullTomlSha256 = normalizeHex(
      readString(
        readRecord(routeReport, "postDeployLiveEvidence"),
        "offlineFullTomlSha256",
      ),
    );
    const evidenceOfflineFullTomlSha256 = normalizeHex(
      readString(offlineFullTomlEvidence, "offlineFullTomlSha256"),
    );
    return (
      readString(entry, "kind") === "offline-full-toml-evidence" &&
      isRecord(offlineFullTomlEvidence) &&
      readBoolean(offlineFullTomlEvidence, "valid") &&
      readString(offlineFullTomlEvidence, "schema") ===
        "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1" &&
      readString(offlineFullTomlEvidence, "routeId") ===
        SCCP_BSC_XOR_ROUTE_ID &&
      readString(offlineFullTomlEvidence, "assetKey") ===
        SCCP_BSC_XOR_ASSET_KEY &&
      readString(offlineFullTomlEvidence, "bscNetwork") === bscProfile.key &&
      readString(offlineFullTomlEvidence, "chainIdHex") ===
        bscProfile.chainIdHex &&
      readString(offlineFullTomlEvidence, "networkIdHex") ===
        bscProfile.networkIdHex &&
      readBoolean(offlineFullTomlEvidence, "fullTomlReady") &&
      readString(offlineFullTomlEvidence, "hashMode") ===
        "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256" &&
      isNonZeroHex32(evidenceOfflineFullTomlSha256) &&
      isNonZeroHex32(publicOfflineFullTomlSha256) &&
      evidenceOfflineFullTomlSha256 === publicOfflineFullTomlSha256 &&
      normalizeHex(readString(offlineFullTomlEvidence, "hashInputSha256")) ===
        evidenceOfflineFullTomlSha256 &&
      isNonZeroHex32(
        readString(offlineFullTomlEvidence, "renderedTomlSha256"),
      ) &&
      readBoolean(offlineFullTomlEvidence, "publicPostDeployMatches") ===
        true &&
      !hasCriticalFindings(entry)
    );
  });
  if (offlineFullTomlEvidenceFiles.length === 0) {
    problems.push(
      "production material inventory has no clean offline full-TOML evidence file summary bound to the public route post-deploy evidence.",
    );
  }

  const verifierFiles = files.filter((entry) => {
    const verifier = readRecord(entry, "verifier");
    return (
      readString(entry, "kind") === "verifier" &&
      isRecord(verifier) &&
      readBoolean(verifier, "hashMatchesPublicRoute") &&
      readBoolean(verifier, "bscNetworkBound") &&
      readBoolean(verifier, "bscRouteDomainBound") &&
      !readBoolean(verifier, "fixtureShaped") &&
      readBoolean(verifier, "g1MaterialValid") &&
      readBoolean(verifier, "g2MaterialValid") &&
      Array.isArray(readArray(verifier, "g1MaterialProblems")) &&
      readArray(verifier, "g1MaterialProblems").length === 0 &&
      Array.isArray(readArray(verifier, "g2MaterialProblems")) &&
      readArray(verifier, "g2MaterialProblems").length === 0 &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(verifier, "verifierKeyHash")) &&
      isNonZeroHex32(readString(verifier, "expectedVerifierKeyHash")) &&
      normalizeHex(readString(verifier, "expectedVerifierKeyHash")) ===
        normalizeHex(routeDeployment.verifierKeyHash) &&
      normalizeHex(readString(verifier, "verifierKeyHash")) ===
        normalizeHex(routeDeployment.verifierKeyHash)
    );
  });
  if (verifierFiles.length === 0) {
    problems.push(
      "production material inventory has no clean verifier file summary bound to the public route verifierKeyHash.",
    );
  }

  const sourceParityFiles = files.filter((entry) => {
    const sourceParityAttestation = readRecord(
      entry,
      "sourceParityAttestation",
    );
    return (
      readString(entry, "kind") === "source-parity-attestation" &&
      isRecord(sourceParityAttestation) &&
      readBoolean(sourceParityAttestation, "valid") &&
      readString(sourceParityAttestation, "routeId") ===
        SCCP_BSC_XOR_ROUTE_ID &&
      readString(sourceParityAttestation, "assetKey") ===
        SCCP_BSC_XOR_ASSET_KEY &&
      readString(sourceParityAttestation, "bscNetwork") === bscProfile.key &&
      readString(sourceParityAttestation, "chain") === bscProfile.chain &&
      readString(sourceParityAttestation, "chainIdHex") ===
        bscProfile.chainIdHex &&
      readString(sourceParityAttestation, "networkIdHex") ===
        bscProfile.networkIdHex &&
      readNumber(sourceParityAttestation, "domain") === 2 &&
      readString(sourceParityAttestation, "proofBackend") ===
        "evm-groth16-bn254-v1" &&
      readBoolean(sourceParityAttestation, "sourceTreeHashMatches") === true &&
      isNonZeroHex32(readString(sourceParityAttestation, "sourceTreeHash")) &&
      isNonZeroHex32(
        readString(sourceParityAttestation, "expectedSourceTreeHash"),
      ) &&
      readNumber(sourceParityAttestation, "sdkCount") ===
        Object.keys(SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1)
          .length &&
      !hasCriticalFindings(entry)
    );
  });
  if (sourceParityFiles.length === 0) {
    problems.push(
      "production material inventory has no clean source-parity attestation bound to the selected BSC profile and required SDK implementations.",
    );
  }

  const groth16MaterialManifestFiles = files.filter((entry) => {
    const manifest = readRecord(entry, "groth16MaterialManifest");
    return (
      readString(entry, "kind") === "groth16-material-manifest" &&
      isRecord(manifest) &&
      readBoolean(manifest, "valid") &&
      readString(manifest, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(manifest, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(manifest, "bscNetwork") === bscProfile.key &&
      readString(manifest, "chain") === bscProfile.chain &&
      readString(manifest, "chainIdHex") === bscProfile.chainIdHex &&
      readString(manifest, "networkIdHex") === bscProfile.networkIdHex &&
      readBoolean(manifest, "productionReady") === true &&
      readNumber(manifest, "productionBlockerCount") === 0 &&
      readBoolean(manifest, "referencedTranscriptsVerified") === true &&
      readBoolean(manifest, "referencedAttestationsVerified") === true &&
      readBoolean(manifest, "publicDeploymentMatches") === true &&
      !hasCriticalFindings(entry) &&
      ["verifierKeyHash", "proofArtifactHash", "provingKeyHash"].every(
        (key) =>
          isNonZeroHex32(readString(manifest, key)) &&
          normalizeHex(readString(manifest, key)) ===
            normalizeHex(readString(routeDeployment, key)),
      )
    );
  });
  if (groth16MaterialManifestFiles.length === 0) {
    problems.push(
      "production material inventory has no clean Groth16 material manifest bound to the public route deployment.",
    );
  }

  const groth16AttestationRequestFiles = files.filter((entry) => {
    const request = readRecord(entry, "groth16AttestationRequestPackage");
    return (
      readString(entry, "kind") === "groth16-attestation-request-package" &&
      isRecord(request) &&
      readBoolean(request, "valid") &&
      readString(request, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(request, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(request, "bscNetwork") === bscProfile.key &&
      readBoolean(request, "allRolesReady") === true &&
      readBoolean(request, "referencedManifestVerified") === true &&
      readBoolean(request, "manifestProductionReady") === true &&
      readNumber(request, "manifestProductionBlockerCount") === 0 &&
      readBoolean(request, "publicDeploymentMatches") === true &&
      !hasCriticalFindings(entry) &&
      ["verifierKeyHash", "proofArtifactHash", "provingKeyHash"].every(
        (key) =>
          isNonZeroHex32(readString(request, key)) &&
          normalizeHex(readString(request, key)) ===
            normalizeHex(readString(routeDeployment, key)),
      )
    );
  });
  if (groth16AttestationRequestFiles.length === 0) {
    problems.push(
      "production material inventory has no clean Groth16 attestation request package bound to the production material manifest.",
    );
  }

  const groth16AttestationHandoffFiles = files.filter((entry) => {
    const handoff = readRecord(entry, "groth16AttestationHandoff");
    return (
      readString(entry, "kind") === "groth16-attestation-handoff" &&
      isRecord(handoff) &&
      readBoolean(handoff, "valid") &&
      readString(handoff, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(handoff, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(handoff, "bscNetwork") === bscProfile.key &&
      readString(handoff, "chain") === bscProfile.chain &&
      readString(handoff, "chainIdHex") === bscProfile.chainIdHex &&
      readString(handoff, "networkIdHex") === bscProfile.networkIdHex &&
      readString(handoff, "circuitProfile") === "sccp-bsc-full-message-v1" &&
      readString(handoff, "proofBackend") === "evm-groth16-bn254-v1" &&
      readBoolean(handoff, "handoffComplete") === true &&
      readBoolean(handoff, "requestValid") === true &&
      readBoolean(handoff, "referencedRequestVerified") === true &&
      readBoolean(handoff, "referencedManifestVerified") === true &&
      readBoolean(handoff, "publicDeploymentMatches") === true &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(handoff, "attestationRequestSha256")) &&
      isNonZeroHex32(readString(handoff, "manifestSha256")) &&
      isNonZeroHex32(readString(handoff, "verifierKeyHash")) &&
      normalizeHex(readString(handoff, "verifierKeyHash")) ===
        normalizeHex(routeDeployment.verifierKeyHash)
    );
  });
  if (groth16AttestationHandoffFiles.length === 0) {
    problems.push(
      "production material inventory has no clean Groth16 attestation handoff bundle bound to the scanned request and material manifest.",
    );
  }

  const groth16ProofSelfTestReportFiles = files.filter((entry) => {
    const report = readRecord(entry, "groth16ProofSelfTestReport");
    return (
      readString(entry, "kind") === "groth16-proof-self-test-report" &&
      isRecord(report) &&
      readBoolean(report, "valid") &&
      readString(report, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(report, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(report, "bscNetwork") === bscProfile.key &&
      readBoolean(report, "referencedManifestVerified") === true &&
      readBoolean(report, "manifestProductionReady") === true &&
      readNumber(report, "manifestProductionBlockerCount") === 0 &&
      readBoolean(report, "publicDeploymentMatches") === true &&
      !hasCriticalFindings(entry) &&
      ["proofArtifactHash", "provingKeyHash"].every(
        (key) =>
          isNonZeroHex32(readString(report, key)) &&
          normalizeHex(readString(report, key)) ===
            normalizeHex(readString(routeDeployment, key)),
      ) &&
      [
        "bscVerifierKeyArtifactHash",
        "snarkjsVerificationKeyHash",
        "witnessWasmHash",
        "witnessHash",
        "proofHash",
        "publicSignalsHash",
      ].every((key) => isNonZeroHex32(readString(report, key)))
    );
  });
  if (groth16ProofSelfTestReportFiles.length === 0) {
    problems.push(
      "production material inventory has no clean Groth16 proof self-test report bound to the production material manifest and public route proof hashes.",
    );
  }

  const nativeBundleFiles = files.filter((entry) => {
    const nativeBundle = readRecord(entry, "nativeProverBundle");
    return (
      readString(entry, "kind") === "native-prover-bundle" &&
      isRecord(nativeBundle) &&
      readBoolean(nativeBundle, "valid") &&
      readBoolean(nativeBundle, "artifactsVerified") &&
      readBoolean(nativeBundle, "auditHashesProduction") &&
      readNumber(nativeBundle, "auditHashIssueCount") === 0 &&
      readBoolean(nativeBundle, "publicDeploymentMatches") &&
      readString(nativeBundle, "chain") === bscProfile.chain &&
      Number(readNumber(nativeBundle, "domain")) === 2 &&
      nativeBundleSummaryHasRequiredSdks(nativeBundle) &&
      nativeEvmProverBundleRoleSeparatedHashProblems(
        nativeBundle,
        "production material inventory native prover bundle",
      ).length === 0 &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(nativeBundle, "verifierKeyArtifactHash")) &&
      REQUIRED_MATERIAL_ROUTE_HASH_FIELDS.filter(
        (key) => key !== "verifierCodeHash",
      ).every((key) => {
        const actual = readString(nativeBundle, key);
        const expected = readString(routeDeployment, key);
        return (
          isNonZeroHex32(actual) &&
          isNonZeroHex32(expected) &&
          normalizeHex(actual) === normalizeHex(expected)
        );
      })
    );
  });
  if (nativeBundleFiles.length === 0) {
    problems.push(
      "production material inventory has no clean native EVM prover bundle file summary bound to the public route deployment, BSC profile, and required SDK attestations.",
    );
  }

  const proofArtifactFiles = files.filter((entry) => {
    const proofFile = readRecord(entry, "proofFile");
    return (
      readString(entry, "kind") === "proof-artifact" &&
      isRecord(proofFile) &&
      readBoolean(proofFile, "isProofArtifact") &&
      materialProofFileSummaryIsProductionBound(entry, proofFile) &&
      readBoolean(proofFile, "hashMatchesPublicRoute") &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(entry, "sha256")) &&
      isNonZeroHex32(readString(proofFile, "expectedHash")) &&
      normalizeHex(readString(proofFile, "expectedHash")) ===
        normalizeHex(routeDeployment.proofArtifactHash) &&
      normalizeHex(readString(entry, "sha256")) ===
        normalizeHex(routeDeployment.proofArtifactHash)
    );
  });
  if (proofArtifactFiles.length === 0) {
    problems.push(
      "production material inventory has no clean proof artifact file summary bound to the public route proofArtifactHash.",
    );
  }

  const provingKeyFiles = files.filter((entry) => {
    const proofFile = readRecord(entry, "proofFile");
    return (
      readString(entry, "kind") === "proving-key" &&
      isRecord(proofFile) &&
      readBoolean(proofFile, "isProvingKey") &&
      materialProofFileSummaryIsProductionBound(entry, proofFile) &&
      readBoolean(proofFile, "hashMatchesPublicRoute") &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(entry, "sha256")) &&
      isNonZeroHex32(readString(proofFile, "expectedHash")) &&
      normalizeHex(readString(proofFile, "expectedHash")) ===
        normalizeHex(routeDeployment.provingKeyHash) &&
      normalizeHex(readString(entry, "sha256")) ===
        normalizeHex(routeDeployment.provingKeyHash)
    );
  });
  if (provingKeyFiles.length === 0) {
    problems.push(
      "production material inventory has no clean proving key file summary bound to the public route provingKeyHash.",
    );
  }
  const browserProverSidecarFiles = files.filter((entry) => {
    const browserProverSidecar = readRecord(entry, "browserProverSidecar");
    return (
      readString(entry, "kind") === "browser-prover-sidecar" &&
      isRecord(browserProverSidecar) &&
      readBoolean(browserProverSidecar, "valid") &&
      !hasCriticalFindings(entry) &&
      isNonZeroHex32(readString(browserProverSidecar, "moduleSha256")) &&
      isNonZeroHex32(readString(browserProverSidecar, "moduleSha256Actual")) &&
      normalizeHex(readString(browserProverSidecar, "moduleSha256")) ===
        normalizeHex(readString(browserProverSidecar, "moduleSha256Actual"))
    );
  });
  const contractArtifactFiles = files.filter((entry) => {
    const contractArtifact = readRecord(entry, "contractArtifact");
    const key = readString(contractArtifact, "key");
    const expectedContractName = BSC_COMPILED_CONTRACT_ARTIFACTS[key];
    return (
      readString(entry, "kind") === "contract-artifact" &&
      isRecord(contractArtifact) &&
      readBoolean(contractArtifact, "valid") &&
      Boolean(expectedContractName) &&
      readString(contractArtifact, "contractName") === expectedContractName &&
      readNumber(contractArtifact, "abiEntryCount") > 0 &&
      isNonZeroHex32(readString(contractArtifact, "bytecodeKeccak256")) &&
      isNonZeroHex32(
        readString(contractArtifact, "deployedBytecodeKeccak256"),
      ) &&
      isNonZeroHex32(readString(contractArtifact, "bytecodeSha256")) &&
      isNonZeroHex32(readString(contractArtifact, "deployedBytecodeSha256")) &&
      !hasCriticalFindings(entry)
    );
  });
  const tairaBurnRecordContractFiles = files.filter((entry) => {
    const contract = readRecord(entry, "tairaBurnRecordContract");
    const artifactSha256 = normalizeHex(readString(contract, "artifactSha256"));
    return (
      readString(entry, "kind") === "taira-burn-record-contract" &&
      isRecord(contract) &&
      readBoolean(contract, "valid") &&
      readString(contract, "schema") === TAIRA_BURN_RECORD_CONTRACT_SCHEMA &&
      readString(contract, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(contract, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
      readString(contract, "sourceName") ===
        TAIRA_BSC_BURN_RECORD_SOURCE_NAME &&
      isNonZeroHex32(readString(contract, "codeHash")) &&
      isNonZeroHex32(readString(contract, "abiHash")) &&
      isNonZeroHex32(artifactSha256) &&
      readNumber(contract, "artifactSizeBytes") > 0 &&
      readNumber(contract, "artifactProductionProblemCount") === 0 &&
      readString(contract, "entrypoint") === "burn_and_record" &&
      readString(contract, "permission") === "AssetTransferRole" &&
      readString(contract, "paramSignature") ===
        TAIRA_BURN_RECORD_PARAM_SIGNATURE &&
      readString(contract, "executable") === "IvmProved" &&
      readBoolean(contract, "forceZkMode") === true &&
      readString(contract, "settlementInstruction") ===
        "Burn<Numeric, Asset>" &&
      readString(contract, "recordInstruction") === "RecordSccpMessage" &&
      readBoolean(contract, "routeArtifactHashMatches") === true &&
      routeBurnRecordArtifactHashes.has(artifactSha256) &&
      !hasCriticalFindings(entry)
    );
  });
  if (tairaBurnRecordContractFiles.length === 0) {
    problems.push(
      "production material inventory has no clean route-referenced TAIRA burn-record contract file summary.",
    );
  }
  const verifierContractArtifact = contractArtifactFiles.find(
    (entry) =>
      readString(readRecord(entry, "contractArtifact"), "key") === "verifier",
  );
  if (
    verifierContractArtifact &&
    normalizeHex(
      readString(
        readRecord(verifierContractArtifact, "contractArtifact"),
        "deployedBytecodeKeccak256",
      ),
    ) !== normalizeHex(routeDeployment.verifierCodeHash)
  ) {
    problems.push(
      "production material inventory verifier compiled contract runtime bytecode keccak does not match public route verifierCodeHash.",
    );
  }
  const contractArtifactKeys = new Set(
    contractArtifactFiles.map((entry) =>
      readString(readRecord(entry, "contractArtifact"), "key"),
    ),
  );
  const missingContractArtifacts = Object.keys(
    BSC_COMPILED_CONTRACT_ARTIFACTS,
  ).filter((key) => !contractArtifactKeys.has(key));
  if (missingContractArtifacts.length > 0) {
    problems.push(
      `production material inventory is missing clean compiled contract artifacts: ${missingContractArtifacts.join(", ")}.`,
    );
  }
  problems.push(
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionRouteArtifacts",
      routeFiles.length,
      "production-ready route artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionVerifierArtifacts",
      verifierFiles.length,
      "production verifier artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "sourceParityAttestations",
      sourceParityFiles.length,
      "source parity attestation",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionGroth16MaterialManifests",
      groth16MaterialManifestFiles.length,
      "Groth16 material manifest",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionGroth16AttestationRequestPackages",
      groth16AttestationRequestFiles.length,
      "Groth16 attestation request package",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "routeBoundGroth16AttestationHandoffs",
      groth16AttestationHandoffFiles.length,
      "Groth16 attestation handoff",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionGroth16ProofSelfTestReports",
      groth16ProofSelfTestReportFiles.length,
      "Groth16 proof self-test report",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionNativeProverBundles",
      nativeBundleFiles.length,
      "native EVM prover bundle",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionRequirementsArtifacts",
      productionRequirementsFiles.length,
      "production requirements artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "compiledContractArtifacts",
      contractArtifactFiles.length,
      "compiled contract artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionTairaBurnRecordContracts",
      tairaBurnRecordContractFiles.length,
      "TAIRA burn-record contract",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionDeploymentEvidenceArtifacts",
      deploymentEvidenceFiles.length,
      "BSC deployment evidence artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "productionOfflineFullTomlEvidenceArtifacts",
      offlineFullTomlEvidenceFiles.length,
      "offline full-TOML evidence artifact",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "browserProverSidecars",
      browserProverSidecarFiles.length,
      "browser prover sidecar",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "proofArtifacts",
      proofArtifactFiles.length,
      "proof artifact file",
    ),
    ...materialInventoryCategoryCountProblems(
      counts,
      "provingKeys",
      provingKeyFiles.length,
      "proving key file",
    ),
  );

  return problems;
};

const safeBrowserUrlProblems = (value, label) => {
  const url = trim(value);
  if (!url) {
    return [`${label} is missing.`];
  }
  try {
    normalizeSccpBrowserModuleUrl(url, label);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
};

const expectedMaterialInventoryBrowserModulePath = (moduleUrl, label) => {
  let normalized;
  try {
    normalized = normalizeSccpBrowserModuleUrl(moduleUrl, label);
  } catch (error) {
    return {
      normalized: null,
      expectedPath: null,
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (!normalized) {
    return {
      normalized: null,
      expectedPath: null,
      problems: [`${label} is missing.`],
    };
  }
  if (normalized.startsWith("/")) {
    return {
      normalized,
      expectedPath: `./public/${normalized.replace(/^\/+/u, "")}`,
      problems: [],
    };
  }
  if (normalized.startsWith("./")) {
    return {
      normalized,
      expectedPath: normalized,
      problems: [],
    };
  }
  return {
    normalized,
    expectedPath: null,
    problems: [
      `${label} must use a package-relative or public-local module URL for production material inventory.`,
    ],
  };
};

const expectedMaterialInventoryRuntimeConfigPath = (configUrl, label) => {
  let normalized;
  try {
    normalized = normalizeBscRuntimeProverMaterialUrl(configUrl, label);
  } catch (error) {
    return {
      normalized: null,
      expectedPath: null,
      local: false,
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }
  if (!normalized) {
    return {
      normalized: null,
      expectedPath: null,
      local: false,
      problems: [`${label} is missing.`],
    };
  }
  if (normalized.startsWith("/")) {
    return {
      normalized,
      expectedPath: `./public/${normalized.replace(/^\/+/u, "")}`,
      local: true,
      problems: [],
    };
  }
  if (normalized.startsWith("./")) {
    return {
      normalized,
      expectedPath: normalized,
      local: true,
      problems: [],
    };
  }
  return { normalized, expectedPath: null, local: false, problems: [] };
};

const materialInventoryBrowserSidecarPathProblems = (value, label) => {
  const normalizedPath = normalizeMaterialInventoryFileSummaryPath(value);
  if (!normalizedPath.normalized) {
    return [`${label} ${normalizedPath.problem.replace(/^path /u, "")}.`];
  }
  if (!normalizedPath.normalized.startsWith("./")) {
    return [`${label} must be a repo-relative path under this repository.`];
  }
  return [];
};

const expectedBrowserProverExports = (direction) =>
  direction === "source"
    ? BSC_SOURCE_PROVER_EXPORTS
    : BSC_DESTINATION_PROVER_EXPORTS;

const expectedBrowserProverSelfTestExports = (direction) =>
  direction === "source"
    ? BSC_SOURCE_PROVER_SELF_TEST_EXPORTS
    : BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS;

const browserProverManifestDeploymentProblems = ({
  deployment,
  routeDeployment,
  label,
}) => {
  const normalized = publicBrowserProverManifestDeployment(deployment);
  const route = publicDeployment(routeDeployment);
  if (!normalized) {
    return [
      `production material inventory ${label} browser prover manifest deployment summary is missing.`,
    ];
  }
  if (!route) {
    return [`${label} route deployment summary is missing.`];
  }
  const problems = [];
  for (const problem of Array.isArray(normalized.aliasProblems)
    ? normalized.aliasProblems
    : []) {
    problems.push(
      `production material inventory ${label} browser prover manifest deployment ${problem}.`,
    );
  }
  for (const key of PUBLIC_BROWSER_PROVER_MANIFEST_DEPLOYMENT_FIELDS) {
    const actual = normalized[key];
    const expected = route[key];
    if (!actual) {
      problems.push(
        `production material inventory ${label} browser prover manifest deployment ${key} is missing.`,
      );
    } else if (!expected) {
      problems.push(`${label} route deployment ${key} is missing.`);
    } else if (normalizeHex(actual) !== normalizeHex(expected)) {
      problems.push(
        `production material inventory ${label} browser prover manifest deployment ${key} does not match route deployment.`,
      );
    }
  }
  return problems;
};

const browserProverManifestBindingProblems = ({
  manifest,
  label,
  expectedDirection,
  moduleUrl,
  moduleSha256,
  routeReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(manifest)) {
    return [
      `production material inventory ${label} browser prover sidecar manifest summary is missing.`,
    ];
  }
  const problems = [];
  const normalizedModuleUrl = normalizeBrowserUrlForGate(
    moduleUrl,
    `${label} browser prover moduleUrl`,
    problems,
  );
  const manifestModuleUrl = normalizeBrowserUrlForGate(
    readString(manifest, "moduleUrl"),
    `production material inventory ${label} browser prover manifest moduleUrl`,
    problems,
  );
  if (
    normalizedModuleUrl &&
    manifestModuleUrl &&
    normalizedModuleUrl !== manifestModuleUrl
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest moduleUrl does not match moduleUrl.`,
    );
  }
  if (
    readString(manifest, "schema") !== SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest schema is invalid.`,
    );
  }
  if (readString(manifest, "direction") !== expectedDirection) {
    problems.push(
      `production material inventory ${label} browser prover manifest direction is invalid.`,
    );
  }
  const acceptedExport = readString(manifest, "acceptedExport");
  if (
    !expectedBrowserProverExports(expectedDirection).includes(acceptedExport)
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest acceptedExport is invalid.`,
    );
  }
  const acceptedSelfTestExport = readString(manifest, "acceptedSelfTestExport");
  if (
    !expectedBrowserProverSelfTestExports(expectedDirection).includes(
      acceptedSelfTestExport,
    )
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest acceptedSelfTestExport is invalid.`,
    );
  }
  if (
    readString(manifest, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    readString(manifest, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest is for the wrong SCCP route.`,
    );
  }
  problems.push(
    ...routeIdentityProblemDetails(
      manifest,
      `production material inventory ${label} browser prover manifest`,
    ),
  );
  if (readString(manifest, "tairaChainId") !== BSC_TAIRA_CHAIN_ID) {
    problems.push(
      `production material inventory ${label} browser prover manifest is not bound to TAIRA chain id.`,
    );
  }
  if (
    String(readNumber(manifest, "tairaNetworkPrefix")) !==
    String(BSC_TAIRA_NETWORK_PREFIX)
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest is not bound to TAIRA network prefix.`,
    );
  }
  problems.push(
    ...bscManifestProfileBindingProblems(
      manifest,
      `production material inventory ${label} browser prover manifest`,
      bscProfile,
    ),
  );
  const manifestModuleSha256 = readString(manifest, "moduleSha256");
  if (!isNonZeroHex32(manifestModuleSha256)) {
    problems.push(
      `production material inventory ${label} browser prover manifest moduleSha256 is missing or invalid.`,
    );
  } else if (
    isNonZeroHex32(moduleSha256) &&
    normalizeHex(manifestModuleSha256) !== normalizeHex(moduleSha256)
  ) {
    problems.push(
      `production material inventory ${label} browser prover manifest moduleSha256 does not match module sha256.`,
    );
  }
  const routeDeployment = publicDeployment(
    readRecord(routeReport, "deployment"),
  );
  for (const key of [
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
  ]) {
    const manifestHash = readString(manifest, key);
    const routeHash = routeDeployment?.[key];
    if (!isNonZeroHex32(manifestHash)) {
      problems.push(
        `production material inventory ${label} browser prover manifest ${key} is missing or invalid.`,
      );
    } else if (!isNonZeroHex32(routeHash)) {
      problems.push(`${label} route deployment ${key} is missing or invalid.`);
    } else if (normalizeHex(manifestHash) !== normalizeHex(routeHash)) {
      problems.push(
        `production material inventory ${label} browser prover manifest ${key} does not match route deployment.`,
      );
    }
  }
  problems.push(
    ...browserProverManifestDeploymentProblems({
      deployment: readRecord(manifest, "deployment"),
      routeDeployment: readRecord(routeReport, "deployment"),
      label,
    }),
    ...postDeployEvidenceDiffs(
      readRecord(routeReport, "postDeployLiveEvidence"),
      readRecord(manifest, "postDeployLiveEvidence"),
      `production material inventory ${label} browser prover manifest`,
      bscProfile,
    ),
  );
  return problems;
};

const browserProverBindingProblems = (
  prover,
  label,
  { expectedDirection = label, routeReport, bscProfile } = {},
) => {
  if (!isRecord(prover)) {
    return [
      `production material inventory ${label} browser prover is missing.`,
    ];
  }
  const problems = [];
  if (!readBoolean(prover, "ok")) {
    problems.push(
      `production material inventory ${label} browser prover is not ready.`,
    );
  }
  const module = readRecord(prover, "module");
  if (!module) {
    problems.push(
      `production material inventory ${label} browser prover module summary is missing.`,
    );
  } else {
    const modulePathBinding = expectedMaterialInventoryBrowserModulePath(
      readString(module, "moduleUrl"),
      `${label} browser prover moduleUrl`,
    );
    problems.push(
      ...modulePathBinding.problems,
      ...safeBrowserUrlProblems(
        readString(module, "path"),
        `${label} browser prover module path`,
      ),
    );
    if (
      modulePathBinding.expectedPath &&
      readString(module, "path") !== modulePathBinding.expectedPath
    ) {
      problems.push(
        `production material inventory ${label} browser prover module path does not match moduleUrl.`,
      );
    }
    if (
      !Number.isSafeInteger(readNumber(module, "sizeBytes")) ||
      readNumber(module, "sizeBytes") <= 0
    ) {
      problems.push(
        `production material inventory ${label} browser prover module size is missing.`,
      );
    } else if (
      readNumber(module, "sizeBytes") < SCCP_BSC_BROWSER_MODULE_MIN_BYTES
    ) {
      problems.push(
        `production material inventory ${label} browser prover module is smaller than the production browser prover minimum.`,
      );
    } else if (
      readNumber(module, "sizeBytes") > SCCP_BSC_BROWSER_MODULE_MAX_BYTES
    ) {
      problems.push(
        `production material inventory ${label} browser prover module exceeds the production browser prover maximum.`,
      );
    }
    if (!isNonZeroHex32(readString(module, "sha256"))) {
      problems.push(
        `production material inventory ${label} browser prover module sha256 is missing or invalid.`,
      );
    }
    if (!readBoolean(module, "ok")) {
      problems.push(
        `production material inventory ${label} browser prover module summary is not ready.`,
      );
    }
  }

  const sidecar = readRecord(prover, "sidecar");
  if (!sidecar) {
    problems.push(
      `production material inventory ${label} browser prover sidecar summary is missing.`,
    );
  } else {
    problems.push(
      ...materialInventoryBrowserSidecarPathProblems(
        readString(sidecar, "path"),
        `${label} browser prover sidecar path`,
      ),
    );
    const sidecarPath = normalizeMaterialInventoryFileSummaryPath(
      readString(sidecar, "path"),
    );
    const modulePath = normalizeMaterialInventoryFileSummaryPath(
      readString(module, "path"),
    );
    if (sidecarPath.normalized && modulePath.normalized) {
      if (
        !browserManifestUrlMatchesModuleUrl(
          sidecarPath.normalized,
          modulePath.normalized,
        )
      ) {
        problems.push(
          `production material inventory ${label} browser prover sidecar path does not match module path.`,
        );
      }
    }
    if (
      !Number.isSafeInteger(readNumber(sidecar, "sizeBytes")) ||
      readNumber(sidecar, "sizeBytes") <= 0
    ) {
      problems.push(
        `production material inventory ${label} browser prover sidecar size is missing.`,
      );
    } else if (
      readNumber(sidecar, "sizeBytes") > SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES
    ) {
      problems.push(
        `production material inventory ${label} browser prover sidecar exceeds the production manifest maximum.`,
      );
    }
    if (!isNonZeroHex32(readString(sidecar, "sha256"))) {
      problems.push(
        `production material inventory ${label} browser prover sidecar sha256 is missing or invalid.`,
      );
    }
    if (!readBoolean(sidecar, "ok")) {
      problems.push(
        `production material inventory ${label} browser prover sidecar summary is not ready.`,
      );
    }
    const moduleSha256 = readString(module, "sha256");
    const sidecarModuleSha256 = readString(sidecar, "moduleSha256");
    if (!isNonZeroHex32(sidecarModuleSha256)) {
      problems.push(
        `production material inventory ${label} browser prover sidecar moduleSha256 is missing or invalid.`,
      );
    } else if (
      isNonZeroHex32(moduleSha256) &&
      normalizeHex(sidecarModuleSha256) !== normalizeHex(moduleSha256)
    ) {
      problems.push(
        `production material inventory ${label} browser prover sidecar moduleSha256 does not match module sha256.`,
      );
    }
    problems.push(
      ...browserProverManifestBindingProblems({
        manifest: readRecord(sidecar, "manifest"),
        label,
        expectedDirection,
        moduleUrl: readString(module, "moduleUrl"),
        moduleSha256,
        routeReport,
        bscProfile,
      }),
    );
  }
  return problems;
};

const runtimeMaterialUrlProblems = (section, label) => {
  if (!isRecord(section)) {
    return [`${label} runtime prover config section is missing.`];
  }
  return [
    "nativeProverBundleUrl",
    "nativeProverArtifactBaseUrl",
    "proofArtifactUrl",
    "provingKeyUrl",
    "verifierKeyUrl",
    "backendModuleUrl",
  ].flatMap((key) => {
    const value = readString(section, key);
    if (!value) {
      return [`${label} runtime prover config ${key} is missing.`];
    }
    try {
      normalizeBscRuntimeProverMaterialUrl(
        value,
        `${label} runtime prover config ${key}`,
      );
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  });
};

const BSC_RUNTIME_CONFIG_KNOWN_FIELDS = Object.freeze(
  new Set([
    "schema",
    "routeId",
    "assetKey",
    "tairaChainId",
    "tairaNetworkPrefix",
    "bscNetwork",
    "bscChain",
    "bscChainIdHex",
    "bscNetworkIdHex",
    "destination",
    "source",
  ]),
);
const BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS = Object.freeze(
  new Set([
    "nativeProverBundleUrl",
    "nativeProverArtifactBaseUrl",
    "nativeProverBundleSha256",
    "nativeEvmProverBundleHash",
    "nativeProverVerifiedSdks",
    "proofArtifactUrl",
    "proofArtifactSha256",
    "provingKeyUrl",
    "provingKeySha256",
    "verifierKeyUrl",
    "verifierKeySha256",
    "backendModuleUrl",
    "backendModuleSha256",
    "backendSelfContained",
    "backendAcceptedExport",
    "backendAcceptedSelfTestExport",
  ]),
);

const unsupportedRuntimeConfigFieldProblems = (record, knownFields, label) => {
  if (!isRecord(record)) {
    return [];
  }
  return Object.keys(record)
    .filter((key) => !knownFields.has(key))
    .map(
      (key) =>
        `${label} runtime prover config contains unsupported field ${publicUnsupportedFieldName(
          key,
        )}.`,
    );
};

const runtimeProverDirectionProblems = ({
  section,
  routeDeployment,
  label,
  direction = label,
}) => {
  if (!isRecord(section)) {
    return [`${label} runtime prover config section is missing.`];
  }
  const problems = unsupportedRuntimeConfigFieldProblems(
    section,
    BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS,
    label,
  );
  for (const [sectionKey, deploymentKey] of [
    ["nativeEvmProverBundleHash", "nativeEvmProverBundleHash"],
    ["proofArtifactSha256", "proofArtifactHash"],
    ["provingKeySha256", "provingKeyHash"],
    ["verifierKeySha256", "verifierKeyArtifactHash"],
  ]) {
    const sectionHash = readString(section, sectionKey);
    const deploymentHash = readString(routeDeployment, deploymentKey);
    if (!isNonZeroHex32(sectionHash)) {
      problems.push(
        `${label} runtime prover config ${sectionKey} is missing or invalid.`,
      );
    } else if (
      sectionKey !== "verifierKeySha256" &&
      !isNonZeroHex32(deploymentHash)
    ) {
      problems.push(
        `${label} route deployment ${deploymentKey} is missing or invalid.`,
      );
    } else if (
      isNonZeroHex32(deploymentHash) &&
      normalizeHex(sectionHash) !== normalizeHex(deploymentHash)
    ) {
      problems.push(
        `${label} runtime prover config ${sectionKey} does not match route ${deploymentKey}.`,
      );
    }
  }
  for (const key of ["nativeProverBundleSha256", "backendModuleSha256"]) {
    if (!isNonZeroHex32(readString(section, key))) {
      problems.push(
        `${label} runtime prover config ${key} is missing or invalid.`,
      );
    }
  }
  if (!readBoolean(section, "backendSelfContained")) {
    problems.push(
      `${label} runtime prover config backendSelfContained is not true.`,
    );
  }
  const acceptedBackendExports = BSC_RUNTIME_BACKEND_EXPORTS[direction] ?? [];
  const backendAcceptedExport = readString(section, "backendAcceptedExport");
  if (!acceptedBackendExports.includes(backendAcceptedExport)) {
    problems.push(
      `${label} runtime prover config backendAcceptedExport is invalid.`,
    );
  }
  const acceptedBackendSelfTestExports =
    BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS[direction] ?? [];
  const backendAcceptedSelfTestExport = readString(
    section,
    "backendAcceptedSelfTestExport",
  );
  if (!acceptedBackendSelfTestExports.includes(backendAcceptedSelfTestExport)) {
    problems.push(
      `${label} runtime prover config backendAcceptedSelfTestExport is invalid.`,
    );
  }
  if (!Array.isArray(readArray(section, "nativeProverVerifiedSdks"))) {
    problems.push(
      `${label} runtime prover config nativeProverVerifiedSdks is missing.`,
    );
  } else {
    const verifiedSdks = readArray(section, "nativeProverVerifiedSdks")
      .map((sdk) => (typeof sdk === "string" ? sdk.trim() : ""))
      .filter(Boolean);
    const seen = new Set(verifiedSdks);
    if (seen.size !== verifiedSdks.length) {
      problems.push(
        `${label} runtime prover config nativeProverVerifiedSdks contains duplicates.`,
      );
    }
    for (const sdk of verifiedSdks) {
      if (!SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS.includes(sdk)) {
        problems.push(
          `${label} runtime prover config nativeProverVerifiedSdks contains unknown sdk ${sdk}.`,
        );
      }
    }
    for (const sdk of SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS) {
      if (!seen.has(sdk)) {
        problems.push(
          `${label} runtime prover config nativeProverVerifiedSdks is missing ${sdk}.`,
        );
      }
    }
  }
  problems.push(...runtimeMaterialUrlProblems(section, label));
  return problems;
};

const materialInventoryRuntimeConfigShapeProblems = (runtimeProverConfig) => {
  if (!isRecord(runtimeProverConfig)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      runtimeProverConfig,
      MATERIAL_INVENTORY_RUNTIME_PROVER_CONFIG_FIELDS,
      "production material inventory runtime prover config",
    ),
  ];
  const manifest = readRecord(runtimeProverConfig, "manifest");
  if (manifest) {
    problems.push(
      ...unsupportedRuntimeConfigFieldProblems(
        manifest,
        BSC_RUNTIME_CONFIG_KNOWN_FIELDS,
        "production material inventory",
      ),
    );
    for (const direction of ["destination", "source"]) {
      if (isRecord(readRecord(manifest, direction))) {
        problems.push(
          ...unsupportedRuntimeConfigFieldProblems(
            readRecord(manifest, direction),
            BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS,
            `production material inventory ${direction}`,
          ),
        );
      }
    }
  }
  return problems;
};

const materialInventoryBrowserProverShapeProblems = (prover, label) => {
  if (!isRecord(prover)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      prover,
      MATERIAL_INVENTORY_BROWSER_PROVER_FIELDS,
      `production material inventory ${label} browser prover`,
    ),
  ];
  if (isRecord(readRecord(prover, "module"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(prover, "module"),
        MATERIAL_INVENTORY_BROWSER_PROVER_MODULE_FIELDS,
        `production material inventory ${label} browser prover module`,
      ),
    );
  }
  const sidecar = readRecord(prover, "sidecar");
  if (sidecar) {
    problems.push(
      ...unsupportedFieldProblems(
        sidecar,
        MATERIAL_INVENTORY_BROWSER_PROVER_SIDECAR_FIELDS,
        `production material inventory ${label} browser prover sidecar`,
      ),
    );
    const manifest = readRecord(sidecar, "manifest");
    if (manifest) {
      problems.push(
        ...unsupportedFieldProblems(
          manifest,
          MATERIAL_INVENTORY_BROWSER_PROVER_MANIFEST_FIELDS,
          `production material inventory ${label} browser prover manifest`,
        ),
      );
      if (isRecord(readRecord(manifest, "deployment"))) {
        problems.push(
          ...unsupportedFieldProblems(
            readRecord(manifest, "deployment"),
            PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
            `production material inventory ${label} browser prover manifest deployment`,
          ),
        );
      }
      if (isRecord(readRecord(manifest, "postDeployLiveEvidence"))) {
        problems.push(
          ...unsupportedFieldProblems(
            readRecord(manifest, "postDeployLiveEvidence"),
            PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
            `production material inventory ${label} browser prover manifest postDeployLiveEvidence`,
          ),
        );
      }
    }
  }
  return problems;
};

const materialInventoryReportShapeProblems = (materialInventoryReport) => {
  if (!isRecord(materialInventoryReport)) {
    return [];
  }
  const problems = [
    ...unsupportedFieldProblems(
      materialInventoryReport,
      MATERIAL_INVENTORY_REPORT_FIELDS,
      "production material inventory report",
    ),
  ];
  const materialChecks = validatedRecordArray(
    problems,
    materialInventoryReport,
    "checks",
    "production material inventory check",
  );
  if (materialChecks) {
    for (const [index, entry] of materialChecks.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          entry,
          SMOKE_READINESS_CHECK_FIELDS,
          `production material inventory check ${index}`,
        ),
      );
    }
  }
  const materialNextActions = validatedRecordArray(
    problems,
    materialInventoryReport,
    "nextActions",
    "production material inventory next action",
  );
  if (materialNextActions) {
    for (const [index, action] of materialNextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      problems.push(
        ...unsupportedFieldProblems(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `production material inventory next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `production material inventory next action ${index}`,
        ),
      );
      const requiredInputs = validatedRecordArray(
        problems,
        action,
        "requiredInputs",
        `production material inventory next action ${index} required input`,
      );
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          problems.push(
            ...unsupportedFieldProblems(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `production material inventory next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `production material inventory next action ${index} required input ${inputIndex}`,
            ),
          );
        }
      }
    }
  }
  const materialMissingProductionInputs = validatedRecordArray(
    problems,
    materialInventoryReport,
    "missingProductionInputs",
    "production material inventory missing production input",
  );
  if (materialMissingProductionInputs) {
    for (const [index, input] of materialMissingProductionInputs.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          `production material inventory missing production input ${index}`,
        ),
        ...publicRequiredInputContractProblems(
          input,
          `production material inventory missing production input ${index}`,
        ),
      );
    }
  }
  const materialScanRootStatuses = validatedRecordArray(
    problems,
    materialInventoryReport,
    "scanRootStatuses",
    "production material inventory scan root status",
  );
  if (materialScanRootStatuses) {
    for (const [index, entry] of materialScanRootStatuses.entries()) {
      problems.push(
        ...unsupportedFieldProblems(
          entry,
          MATERIAL_INVENTORY_SCAN_ROOT_STATUS_FIELDS,
          `production material inventory scan root status ${index}`,
        ),
      );
    }
  }
  const route = readRecord(materialInventoryReport, "route");
  if (route) {
    problems.push(
      ...unsupportedFieldProblems(
        route,
        MATERIAL_INVENTORY_ROUTE_FIELDS,
        "production material inventory route",
      ),
    );
    if (isRecord(readRecord(route, "bsc"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "bsc"),
          PUBLIC_BSC_PROFILE_FIELDS_WITH_ALIASES,
          "production material inventory route BSC profile",
        ),
      );
    }
    if (isRecord(readRecord(route, "deployment"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "deployment"),
          PUBLIC_DEPLOYMENT_FIELDS_WITH_ALIASES,
          "production material inventory route deployment",
        ),
      );
    }
    if (isRecord(readRecord(route, "postDeployLiveEvidence"))) {
      problems.push(
        ...unsupportedFieldProblems(
          readRecord(route, "postDeployLiveEvidence"),
          PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS_WITH_ALIASES,
          "production material inventory route postDeployLiveEvidence",
        ),
      );
    }
  }
  if (isRecord(readRecord(materialInventoryReport, "counts"))) {
    problems.push(
      ...unsupportedFieldProblems(
        readRecord(materialInventoryReport, "counts"),
        MATERIAL_INVENTORY_COUNTS_FIELDS,
        "production material inventory counts",
      ),
    );
  }
  const browserProvers = readRecord(materialInventoryReport, "browserProvers");
  if (browserProvers) {
    problems.push(
      ...unsupportedFieldProblems(
        browserProvers,
        MATERIAL_INVENTORY_BROWSER_PROVERS_FIELDS,
        "production material inventory browser provers",
      ),
      ...materialInventoryBrowserProverShapeProblems(
        readRecord(browserProvers, "destination"),
        "destination",
      ),
      ...materialInventoryBrowserProverShapeProblems(
        readRecord(browserProvers, "source"),
        "source",
      ),
    );
  }
  problems.push(
    ...materialInventoryRuntimeConfigShapeProblems(
      readRecord(materialInventoryReport, "runtimeProverConfig"),
    ),
  );
  return problems;
};

const materialInventoryValidOfflineFullTomlEvidenceFiles = (
  materialInventoryReport,
  bscProfile,
) => {
  const files = readArray(materialInventoryReport, "files");
  if (!Array.isArray(files)) {
    return [];
  }
  return files
    .map((entry, index) => ({
      entry,
      index,
      evidence: readRecord(entry, "offlineFullTomlEvidence"),
    }))
    .filter(({ entry, evidence }) => {
      const offlineFullTomlSha256 = normalizeHex(
        readString(evidence, "offlineFullTomlSha256"),
      );
      const hashInputSha256 = normalizeHex(
        readString(evidence, "hashInputSha256"),
      );
      const routeManifestPath = readString(evidence, "routeManifestPath");
      const fullConfigPath = readString(evidence, "fullConfigPath");
      return (
        readString(entry, "kind") === "offline-full-toml-evidence" &&
        isRecord(evidence) &&
        readBoolean(evidence, "valid") &&
        readString(evidence, "schema") ===
          "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1" &&
        readString(evidence, "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
        readString(evidence, "assetKey") === SCCP_BSC_XOR_ASSET_KEY &&
        readString(evidence, "bscNetwork") === bscProfile.key &&
        readString(evidence, "chainIdHex") === bscProfile.chainIdHex &&
        readString(evidence, "networkIdHex") === bscProfile.networkIdHex &&
        readBoolean(evidence, "fullTomlReady") &&
        readString(evidence, "hashMode") ===
          "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256" &&
        isNonZeroHex32(offlineFullTomlSha256) &&
        isNonZeroHex32(hashInputSha256) &&
        offlineFullTomlSha256 === hashInputSha256 &&
        isNonZeroHex32(readString(evidence, "renderedTomlSha256")) &&
        !unsafeRelativeEvidencePath(routeManifestPath) &&
        !unsafeRelativeEvidencePath(fullConfigPath) &&
        !hasCriticalFindings(entry)
      );
    });
};

const offlineFullTomlEvidenceHashProblems = ({
  label,
  evidence,
  expectedHash,
}) => {
  const normalizedEvidence = publicPostDeployLiveEvidence(evidence);
  const actualHash = normalizeHex(
    readString(normalizedEvidence, "offlineFullTomlSha256"),
  );
  if (!isNonZeroHex32(actualHash)) {
    return [
      `${label} postDeployLiveEvidence.offlineFullTomlSha256 is missing or invalid; generated evidence hash ${expectedHash} is not published.`,
    ];
  }
  return actualHash === expectedHash
    ? []
    : [
        `${label} postDeployLiveEvidence.offlineFullTomlSha256 ${actualHash} does not match generated evidence hash ${expectedHash}.`,
      ];
};

const offlineFullTomlPublicationProblems = ({
  materialInventoryReport,
  routeReport,
  smokeReadinessReport,
  bscProfile,
}) => {
  const problems = [];
  const evidenceFiles = materialInventoryValidOfflineFullTomlEvidenceFiles(
    materialInventoryReport,
    bscProfile,
  );
  if (evidenceFiles.length === 0) {
    return [
      "production material inventory has no valid generated offline full-TOML evidence artifact to publish.",
    ];
  }
  const evidenceHashes = [
    ...new Set(
      evidenceFiles.map(({ evidence }) =>
        normalizeHex(readString(evidence, "offlineFullTomlSha256")),
      ),
    ),
  ].filter(isNonZeroHex32);
  if (evidenceHashes.length !== 1) {
    return [
      `production material inventory generated offline full-TOML evidence hashes disagree: ${evidenceHashes.join(", ") || "none"}.`,
    ];
  }
  const expectedHash = evidenceHashes[0];
  for (const { evidence, index } of evidenceFiles) {
    if (readBoolean(evidence, "publicPostDeployMatches") !== true) {
      problems.push(
        `production material inventory offline full-TOML evidence file ${index} publicPostDeployMatches is not true for generated hash ${expectedHash}.`,
      );
    }
  }
  problems.push(
    ...offlineFullTomlEvidenceHashProblems({
      label: "public route report",
      evidence: readRecord(routeReport, "postDeployLiveEvidence"),
      expectedHash,
    }),
    ...offlineFullTomlEvidenceHashProblems({
      label: "smoke-readiness route",
      evidence: readRecord(
        readRecord(smokeReadinessReport, "route"),
        "postDeployLiveEvidence",
      ),
      expectedHash,
    }),
  );
  return problems;
};

const materialInventoryBindingProblems = (
  materialInventoryReport,
  routeReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
) => {
  const problems = [];
  if (!isRecord(materialInventoryReport)) {
    return ["production material inventory report is missing."];
  }
  problems.push(
    ...materialInventoryReportShapeProblems(materialInventoryReport),
  );
  if (
    readString(materialInventoryReport, "schema") !==
    "iroha-demo-sccp-bsc-production-material-inventory/v1"
  ) {
    problems.push("production material inventory schema is invalid.");
  }
  if (!readBoolean(materialInventoryReport, "ready")) {
    const failed = failedCheckDetail(
      readArray(materialInventoryReport, "checks"),
    );
    problems.push(
      failed
        ? `production material inventory is not ready: ${failed}.`
        : "production material inventory is not ready.",
    );
  }
  problems.push(
    ...routeIdentityProblemDetails(
      materialInventoryReport,
      "production material inventory",
    ),
  );
  if (
    readString(materialInventoryReport, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    readString(materialInventoryReport, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push("production material inventory is for the wrong SCCP route.");
  }
  const inventoryChecks = Array.isArray(
    readArray(materialInventoryReport, "checks"),
  )
    ? readArray(materialInventoryReport, "checks").filter(isRecord)
    : [];
  for (const id of REQUIRED_MATERIAL_INVENTORY_CHECK_IDS) {
    const entry = inventoryChecks.find(
      (checkEntry) => readString(checkEntry, "id") === id,
    );
    if (!entry || !readBoolean(entry, "ok")) {
      problems.push(
        `production material inventory is missing passing ${id} check.`,
      );
    }
  }
  const inventoryRoute = readRecord(materialInventoryReport, "route");
  if (!inventoryRoute) {
    problems.push("production material inventory route summary is missing.");
  } else {
    if (!readBoolean(inventoryRoute, "ready")) {
      problems.push(
        "production material inventory route summary is not ready.",
      );
    }
    if (readString(inventoryRoute, "manifestSource") !== "torii") {
      problems.push(
        "production material inventory is not bound to public TAIRA route evidence.",
      );
    }
    problems.push(
      ...bscProfileBindingProblems(
        readRecord(inventoryRoute, "bsc"),
        "production material inventory route",
        bscProfile,
      ),
      ...deploymentBscProfileProblems(
        readRecord(inventoryRoute, "deployment"),
        "production material inventory route",
        bscProfile,
      ),
    );
    problems.push(
      ...deploymentDiffs(
        readRecord(routeReport, "deployment"),
        readRecord(inventoryRoute, "deployment"),
        "production material inventory route",
      ),
      ...postDeployEvidenceDiffs(
        readRecord(routeReport, "postDeployLiveEvidence"),
        readRecord(inventoryRoute, "postDeployLiveEvidence"),
        "production material inventory route",
        bscProfile,
      ),
    );
  }
  const counts = readRecord(materialInventoryReport, "counts") ?? {};
  for (const [key, label] of [
    ["productionRouteArtifacts", "production-ready route artifact"],
    ["productionVerifierArtifacts", "production verifier artifact"],
    ["sourceParityAttestations", "source parity attestation"],
    ["productionNativeProverBundles", "native EVM prover bundle"],
    ["productionRequirementsArtifacts", "production requirements artifact"],
    [
      "productionDeploymentEvidenceArtifacts",
      "BSC deployment evidence artifact",
    ],
    ["productionTairaBurnRecordContracts", "TAIRA burn-record contract"],
    ["proofArtifacts", "proof artifact file"],
    ["provingKeys", "proving key file"],
  ]) {
    if (
      !Number.isSafeInteger(readNumber(counts, key)) ||
      readNumber(counts, key) <= 0
    ) {
      problems.push(`production material inventory has no ${label}.`);
    }
  }
  if (
    Number.isSafeInteger(readNumber(counts, "criticalFindings")) &&
    readNumber(counts, "criticalFindings") > 0
  ) {
    problems.push("production material inventory contains critical findings.");
  }
  problems.push(
    ...materialInventoryFileSummaryProblems(
      materialInventoryReport,
      routeReport,
      counts,
      bscProfile,
    ),
  );
  const browserProverSummaries = readRecord(
    materialInventoryReport,
    "browserProvers",
  );
  const destination = readRecord(browserProverSummaries, "destination");
  const source = readRecord(browserProverSummaries, "source");
  problems.push(
    ...browserProverBindingProblems(destination, "destination", {
      expectedDirection: "destination",
      routeReport,
      bscProfile,
    }),
    ...browserProverBindingProblems(source, "source", {
      expectedDirection: "source",
      routeReport,
      bscProfile,
    }),
  );
  const runtimeProverConfig = readRecord(
    materialInventoryReport,
    "runtimeProverConfig",
  );
  const runtimeConfigRequired =
    readBoolean(runtimeProverConfig, "required") ||
    inventoryProverUsesCheckedInRuntimeModule(destination) ||
    inventoryProverUsesCheckedInRuntimeModule(source);
  if (
    !isRecord(runtimeProverConfig) ||
    !readBoolean(runtimeProverConfig, "ok")
  ) {
    problems.push(
      "production material inventory runtime prover config is not ready.",
    );
  } else if (runtimeConfigRequired) {
    if (
      hasOwn(runtimeProverConfig, "required") &&
      runtimeProverConfig.required === false
    ) {
      problems.push(
        "production material inventory runtime prover config claims it is not required while a checked-in runtime prover module is selected.",
      );
    } else if (!readBoolean(runtimeProverConfig, "required")) {
      problems.push(
        "production material inventory runtime prover config is not explicitly marked required while a checked-in runtime prover module is selected.",
      );
    }
    const manifest = readRecord(runtimeProverConfig, "manifest");
    const routeDeployment = publicDeployment(
      readRecord(routeReport, "deployment"),
    );
    if (!manifest) {
      problems.push(
        "production material inventory runtime prover config manifest is missing.",
      );
    } else {
      const files = Array.isArray(readArray(materialInventoryReport, "files"))
        ? readArray(materialInventoryReport, "files").filter(isRecord)
        : [];
      const verifierKeyArtifactHashes = [
        ...new Set(
          files
            .filter((entry) => {
              const nativeBundle = readRecord(entry, "nativeProverBundle");
              return (
                readString(entry, "kind") === "native-prover-bundle" &&
                isRecord(nativeBundle) &&
                readBoolean(nativeBundle, "valid") &&
                readBoolean(nativeBundle, "artifactsVerified") &&
                readBoolean(nativeBundle, "publicDeploymentMatches") &&
                !hasCriticalFindings(entry)
              );
            })
            .map((entry) =>
              normalizeHex(
                readString(
                  readRecord(entry, "nativeProverBundle"),
                  "verifierKeyArtifactHash",
                ),
              ),
            )
            .filter(isNonZeroHex32),
        ),
      ];
      const runtimeRouteDeployment =
        verifierKeyArtifactHashes.length === 1
          ? {
              ...routeDeployment,
              verifierKeyArtifactHash: verifierKeyArtifactHashes[0],
            }
          : routeDeployment;
      if (verifierKeyArtifactHashes.length > 1) {
        problems.push(
          "production material inventory native EVM prover bundles disagree on verifierKeyArtifactHash.",
        );
      }
      problems.push(
        ...routeIdentityProblemDetails(
          manifest,
          "production material inventory runtime prover config",
        ),
      );
      if (
        readString(manifest, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
        readString(manifest, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
      ) {
        problems.push(
          "production material inventory runtime prover config is for the wrong SCCP route.",
        );
      }
      problems.push(
        ...unsupportedRuntimeConfigFieldProblems(
          manifest,
          BSC_RUNTIME_CONFIG_KNOWN_FIELDS,
          "production material inventory",
        ),
      );
      if (readString(manifest, "tairaChainId") !== BSC_TAIRA_CHAIN_ID) {
        problems.push(
          "production material inventory runtime prover config is not bound to TAIRA chain id.",
        );
      }
      if (
        String(readNumber(manifest, "tairaNetworkPrefix")) !==
        String(BSC_TAIRA_NETWORK_PREFIX)
      ) {
        problems.push(
          "production material inventory runtime prover config is not bound to TAIRA network prefix.",
        );
      }
      problems.push(
        ...bscManifestProfileBindingProblems(
          manifest,
          "production material inventory runtime prover config",
          bscProfile,
        ),
      );
      problems.push(
        ...runtimeProverDirectionProblems({
          section: readRecord(manifest, "destination"),
          routeDeployment: runtimeRouteDeployment,
          label: "destination",
          direction: "destination",
        }),
        ...runtimeProverDirectionProblems({
          section: readRecord(manifest, "source"),
          routeDeployment: runtimeRouteDeployment,
          label: "source",
          direction: "source",
        }),
      );
    }
    const configUrl = readString(runtimeProverConfig, "configUrl");
    if (!configUrl) {
      problems.push(
        "production material inventory runtime prover config URL is missing.",
      );
    } else {
      const configPathBinding = expectedMaterialInventoryRuntimeConfigPath(
        configUrl,
        "production material inventory runtime prover config URL",
      );
      problems.push(...configPathBinding.problems);
      const configPath = readString(runtimeProverConfig, "path");
      if (configPathBinding.local) {
        const normalizedPath =
          normalizeMaterialInventoryFileSummaryPath(configPath);
        if (!normalizedPath.normalized) {
          problems.push(
            `production material inventory runtime prover config ${normalizedPath.problem}.`,
          );
        } else if (
          normalizedPath.normalized !== configPathBinding.expectedPath
        ) {
          problems.push(
            "production material inventory runtime prover config path does not match configUrl.",
          );
        }
      } else if (configPath) {
        const normalizedPath =
          normalizeMaterialInventoryFileSummaryPath(configPath);
        if (!normalizedPath.normalized) {
          problems.push(
            `production material inventory runtime prover config ${normalizedPath.problem}.`,
          );
        } else {
          problems.push(
            "production material inventory runtime prover config path must be empty for remote configUrl.",
          );
        }
      }
    }
    if (!isNonZeroHex32(readString(runtimeProverConfig, "sha256"))) {
      problems.push(
        "production material inventory runtime prover config hash is missing.",
      );
    }
    if (
      !Number.isSafeInteger(readNumber(runtimeProverConfig, "sizeBytes")) ||
      readNumber(runtimeProverConfig, "sizeBytes") <= 0
    ) {
      problems.push(
        "production material inventory runtime prover config size is missing.",
      );
    }
  } else if (
    hasOwn(runtimeProverConfig, "required") &&
    runtimeProverConfig.required === false &&
    runtimeConfigCarriesMaterial(runtimeProverConfig)
  ) {
    problems.push(
      "production material inventory runtime prover config claims it is not required but carries runtime config material.",
    );
  }
  return problems;
};

const parseTimestampMs = (value) => {
  if (Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(normalized)) {
    return null;
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const canonical = new Date(parsed).toISOString();
  return normalized === canonical ||
    normalized === canonical.replace(".000Z", "Z")
    ? parsed
    : null;
};

const POINT_TIMESTAMP_KEYS = Object.freeze([
  "checkedAt",
  "generatedAt",
  "generatedAtMs",
  "recordedAt",
  "capturedAt",
]);
const RANGE_TIMESTAMP_KEYS = Object.freeze(["endedAtMs", "startedAtMs"]);
const REPORT_TIMESTAMP_KEYS = Object.freeze([
  ...POINT_TIMESTAMP_KEYS,
  ...RANGE_TIMESTAMP_KEYS,
]);

const presentTimestampFields = (report, keys) =>
  keys
    .filter((key) => Object.prototype.hasOwnProperty.call(report, key))
    .map((key) => ({
      key,
      value: report[key],
      parsed:
        report[key] === null || report[key] === undefined
          ? null
          : parseTimestampMs(report[key]),
    }))
    .filter(({ value }) => value !== null && value !== undefined);

const reportTimestampAliasProblems = (report) => {
  if (!isRecord(report)) {
    return [];
  }
  const pointFields = presentTimestampFields(report, POINT_TIMESTAMP_KEYS);
  if (pointFields.length < 2) {
    return [];
  }
  if (pointFields[0]?.parsed === null) {
    return [];
  }
  const invalid = pointFields.slice(1).filter(({ parsed }) => parsed === null);
  const problems = invalid.map(({ key }) => `${key} is invalid`);
  const parsedPointFields = pointFields.filter(({ parsed }) => parsed !== null);
  const unique = new Set(parsedPointFields.map(({ parsed }) => parsed));
  if (unique.size > 1) {
    problems.push(
      `point timestamp fields disagree: ${parsedPointFields
        .map(({ key }) => key)
        .join(", ")}`,
    );
  }
  return problems;
};

const reportTimestampMs = (report) => {
  if (!isRecord(report)) {
    return null;
  }
  for (const key of REPORT_TIMESTAMP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(report, key)) {
      continue;
    }
    const value = report[key];
    if (value === null || value === undefined) {
      continue;
    }
    const parsed = parseTimestampMs(value);
    if (parsed !== null) {
      return parsed;
    }
    return null;
  }
  return null;
};

const freshnessProblems = (
  reports,
  { nowMs, maxReportAgeMs, futureSkewMs },
) => {
  const problems = [];
  for (const [label, report] of reports) {
    if (!isRecord(report)) {
      problems.push(`${label} report is missing.`);
      continue;
    }
    const timestampAliasProblems = reportTimestampAliasProblems(report);
    if (timestampAliasProblems.length > 0) {
      problems.push(
        `${label} report timestamp fields are inconsistent: ${timestampAliasProblems.join("; ")}.`,
      );
      continue;
    }
    const timestampMs = reportTimestampMs(report);
    if (timestampMs === null) {
      problems.push(`${label} report timestamp is missing or invalid.`);
      continue;
    }
    if (timestampMs > nowMs + futureSkewMs) {
      problems.push(`${label} report is dated in the future.`);
      continue;
    }
    if (nowMs - timestampMs > maxReportAgeMs) {
      problems.push(`${label} report is stale.`);
    }
  }
  return problems;
};

const canonicalExplorerKey = (href, { bscNetwork = "testnet" } = {}) => {
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  let url;
  try {
    url = new URL(href);
  } catch (_error) {
    return "";
  }
  if (url.protocol !== "https:") {
    return "";
  }
  if (url.username || url.password || url.search || url.hash) {
    return "";
  }
  const pathName = url.pathname.replace(/\/+$/u, "");
  const bsc = pathName.match(/^\/tx\/(0x[0-9a-f]{64})$/iu);
  if (url.hostname === bscProfile.explorerHost && bsc) {
    return `${url.hostname}/tx/${bsc[1].toLowerCase()}`;
  }
  const taira = pathName.match(/^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu);
  if (url.hostname === "taira-explorer.sora.org" && taira) {
    return `${url.hostname}/transactions/${taira[1].toLowerCase()}`;
  }
  return "";
};

const canonicalExplorerTransactionHash = (
  href,
  { bscNetwork = "testnet" } = {},
) => {
  const key = canonicalExplorerKey(href, { bscNetwork });
  const bsc = key.match(/\/tx\/0x([0-9a-f]{64})$/iu);
  if (bsc) {
    return bsc[1].toLowerCase();
  }
  const taira = key.match(/\/transactions\/([0-9a-f]{64})$/iu);
  if (taira) {
    return taira[1].toLowerCase();
  }
  return "";
};

const normalizeExplorerTransactionHash = (value) => {
  const normalized = trim(value).replace(/^0x/iu, "").toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : "";
};

const postDeployBscTransactionHashes = (
  evidences,
  { bscNetwork = "testnet" } = {},
) => {
  const hashes = new Map();
  for (const evidence of evidences) {
    const normalizedEvidence = publicPostDeployLiveEvidence(evidence);
    if (!normalizedEvidence) {
      continue;
    }
    for (const [key, label] of [
      ["sourceEventTransactionId", "sourceEventTransactionId"],
      ["routeCanaryTransactionId", "routeCanaryTransactionId"],
    ]) {
      const hash = normalizeExplorerTransactionHash(normalizedEvidence[key]);
      if (hash && !hashes.has(hash)) {
        hashes.set(hash, label);
      }
    }
    for (const [key, label] of [
      ["sourceEventExplorerUrl", "sourceEventExplorerUrl"],
      ["routeCanaryExplorerUrl", "routeCanaryExplorerUrl"],
    ]) {
      const hash = canonicalExplorerTransactionHash(normalizedEvidence[key], {
        bscNetwork,
      });
      if (hash && !hashes.has(hash)) {
        hashes.set(hash, label);
      }
    }
  }
  return hashes;
};

const videoPostDeployTransactionReuseProblems = ({
  videoTranscript,
  routeReport,
  smokeReadinessReport,
  binding,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(videoTranscript)) {
    return [];
  }
  const postDeployHashes = postDeployBscTransactionHashes(
    [
      readRecord(routeReport, "postDeployLiveEvidence"),
      readRecord(
        readRecord(smokeReadinessReport, "route"),
        "postDeployLiveEvidence",
      ),
      readRecord(readRecord(binding, "route"), "postDeployLiveEvidence"),
    ],
    { bscNetwork: bscProfile.key },
  );
  if (postDeployHashes.size === 0) {
    return [];
  }
  const transactions = readRecord(videoTranscript, "transactions") ?? {};
  const problems = [];
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const hash = canonicalExplorerTransactionHash(
      readString(transactions, slot),
      { bscNetwork: bscProfile.key },
    );
    const postDeployLabel = hash ? postDeployHashes.get(hash) : "";
    if (postDeployLabel) {
      problems.push(`${slot} reuses post-deploy ${postDeployLabel}.`);
    }
  }
  return problems;
};

const expectedExplorerHostForSlot = (slot, { bscNetwork = "testnet" } = {}) => {
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  if (slot === "bscFinalizeTx" || slot === "bscBurnTx") {
    return bscProfile.explorerHost;
  }
  if (slot === "tairaSourceTx" || slot === "tairaSettlementTx") {
    return "taira-explorer.sora.org";
  }
  return "";
};

const canonicalExplorerKeyForSlot = (
  slot,
  href,
  { bscNetwork = "testnet" } = {},
) => {
  const key = canonicalExplorerKey(href, { bscNetwork });
  const expectedHost = expectedExplorerHostForSlot(slot, { bscNetwork });
  return key && expectedHost && key.startsWith(`${expectedHost}/`) ? key : "";
};

const videoMissingEvidenceProblems = (missingEvidence) => {
  if (!isRecord(missingEvidence)) {
    return ["video proof transcript missingEvidence is missing."];
  }
  const problems = [];
  for (const field of VIDEO_MISSING_EVIDENCE_FIELDS) {
    const value = readOwnValue(missingEvidence, field);
    if (!Array.isArray(value)) {
      problems.push(
        `video proof transcript missingEvidence.${field} is missing or invalid.`,
      );
      continue;
    }
    if (value.length > 0) {
      problems.push(
        `video proof transcript missingEvidence.${field} is not empty.`,
      );
    }
  }
  return problems;
};

const requireEmptyArrayField = (problems, record, field, label) => {
  const value = readOwnValue(record, field);
  if (!Array.isArray(value)) {
    problems.push(`${label}.${field} is missing or invalid.`);
    return;
  }
  if (value.length > 0) {
    problems.push(`${label}.${field} is not empty.`);
  }
};

const videoNestedEvidenceProblems = (videoTranscript) => {
  const evidence = readRecord(videoTranscript, "evidence");
  if (!isRecord(evidence)) {
    return ["video proof transcript evidence summary is missing."];
  }
  const problems = [];
  if (readBoolean(evidence, "proofComplete") !== true) {
    problems.push("video proof transcript evidence.proofComplete is not true.");
  }
  for (const field of VIDEO_NESTED_PROOF_EVIDENCE_FIELDS) {
    requireEmptyArrayField(
      problems,
      evidence,
      field,
      "video proof transcript evidence",
    );
  }
  const readinessEvidence = readRecord(evidence, "readinessEvidence");
  if (!isRecord(readinessEvidence)) {
    problems.push("video proof transcript readiness evidence is missing.");
  } else {
    if (readBoolean(readinessEvidence, "ready") !== true) {
      problems.push("video proof transcript readiness evidence is not ready.");
    }
    requireEmptyArrayField(
      problems,
      readinessEvidence,
      "missingReadinessEvidence",
      "video proof transcript readiness evidence",
    );
  }
  const postDeployTransactionEvidence = readRecord(
    evidence,
    "postDeployTransactionEvidence",
  );
  if (!isRecord(postDeployTransactionEvidence)) {
    problems.push(
      "video proof transcript post-deploy transaction evidence is missing.",
    );
  } else {
    if (readBoolean(postDeployTransactionEvidence, "ready") !== true) {
      problems.push(
        "video proof transcript post-deploy transaction evidence is not ready.",
      );
    }
    requireEmptyArrayField(
      problems,
      postDeployTransactionEvidence,
      "reusedPostDeployTransactionSlots",
      "video proof transcript post-deploy transaction evidence",
    );
    requireEmptyArrayField(
      problems,
      postDeployTransactionEvidence,
      "reusedPostDeployTransactions",
      "video proof transcript post-deploy transaction evidence",
    );
  }
  const videoArtifactEvidence = readRecord(evidence, "videoArtifactEvidence");
  if (!isRecord(videoArtifactEvidence)) {
    problems.push("video proof transcript video artifact evidence is missing.");
  } else if (readBoolean(videoArtifactEvidence, "ready") !== true) {
    problems.push(
      "video proof transcript video artifact evidence is not ready.",
    );
  } else if (
    !readOwnArrayValues(videoArtifactEvidence, "capturedArtifacts") ||
    readOwnArrayValues(videoArtifactEvidence, "capturedArtifacts").length !== 1
  ) {
    problems.push(
      "video proof transcript video artifact evidence must summarize exactly one recording.",
    );
  } else {
    requireEmptyArrayField(
      problems,
      videoArtifactEvidence,
      "missingVideoArtifacts",
      "video proof transcript video artifact evidence",
    );
    const transcriptArtifacts = readOwnArrayValues(
      videoTranscript,
      "videoArtifacts",
    )
      ? readOwnArrayValues(videoTranscript, "videoArtifacts")
      : [];
    const capturedTranscriptArtifacts = transcriptArtifacts.filter(
      (artifact) =>
        isRecord(artifact) &&
        readString(artifact, "status") === "captured" &&
        readBoolean(artifact, "fileVerified") === true &&
        proofArtifactRelativePathIsSafe(
          readString(artifact, "relativePath"),
          /\.webm$/iu,
        ) &&
        Number.isSafeInteger(readNumber(artifact, "sizeBytes")) &&
        readNumber(artifact, "sizeBytes") >= MIN_VIDEO_ARTIFACT_BYTES &&
        readNumber(artifact, "sizeBytes") <= MAX_VIDEO_ARTIFACT_BYTES &&
        typeof readOwnValue(artifact, "sha256") === "string" &&
        NON_ZERO_SHA256_PATTERN.test(readOwnValue(artifact, "sha256")) &&
        readString(artifact, "mediaType") === "video/webm",
    );
    const summarizedArtifact = readOwnArrayValues(
      videoArtifactEvidence,
      "capturedArtifacts",
    )[0];
    const capturedArtifact = capturedTranscriptArtifacts[0];
    if (
      capturedTranscriptArtifacts.length === 1 &&
      (!isRecord(summarizedArtifact) ||
        readString(summarizedArtifact, "relativePath") !==
          readString(capturedArtifact, "relativePath") ||
        readNumber(summarizedArtifact, "sizeBytes") !==
          readNumber(capturedArtifact, "sizeBytes") ||
        normalizeHex(readString(summarizedArtifact, "sha256")) !==
          normalizeHex(readString(capturedArtifact, "sha256")) ||
        readString(summarizedArtifact, "mediaType") !==
          readString(capturedArtifact, "mediaType"))
    ) {
      problems.push(
        "video proof transcript video artifact evidence does not match the captured recording.",
      );
    }
  }
  const timelineEvidence = readRecord(evidence, "timelineEvidence");
  if (!isRecord(timelineEvidence)) {
    problems.push("video proof transcript timeline evidence is missing.");
  } else {
    if (readBoolean(timelineEvidence, "ready") !== true) {
      problems.push("video proof transcript timeline evidence is not ready.");
    }
    requireEmptyArrayField(
      problems,
      timelineEvidence,
      "missingVideoTimeline",
      "video proof transcript timeline evidence",
    );
    const expectedDurationMs =
      Number.isSafeInteger(readNumber(videoTranscript, "startedAtMs")) &&
      Number.isSafeInteger(readNumber(videoTranscript, "endedAtMs"))
        ? readNumber(videoTranscript, "endedAtMs") -
          readNumber(videoTranscript, "startedAtMs")
        : null;
    if (
      expectedDurationMs !== null &&
      readNumber(timelineEvidence, "durationMs") !== expectedDurationMs
    ) {
      problems.push(
        "video proof transcript timeline duration does not match recording window.",
      );
    }
  }
  return problems;
};

const explorerScreenshotProofPathReuseProblems = (
  capturedScreenshotsBySlot,
) => {
  const problems = [];
  const seenPaths = new Map();
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const screenshot = capturedScreenshotsBySlot.get(slot);
    if (!isRecord(screenshot)) {
      continue;
    }
    const relativePath = normalizedProofArtifactRelativePath(
      readString(screenshot, "relativePath"),
    );
    if (!relativePath) {
      continue;
    }
    const previousSlot = seenPaths.get(relativePath);
    if (previousSlot) {
      problems.push(
        `${slot} explorer screenshot reuses proof file from ${previousSlot}.`,
      );
    } else {
      seenPaths.set(relativePath, slot);
    }
  }
  return problems;
};

const videoProofArtifactReuseProblems = (videoTranscript) => {
  if (!isRecord(videoTranscript)) {
    return [];
  }
  const entries = [];
  const addEntry = (record, label, extensionPattern) => {
    if (!isRecord(record)) {
      return;
    }
    const relativePath = proofArtifactRelativePathIsSafe(
      readString(record, "relativePath"),
      extensionPattern,
    )
      ? normalizedProofArtifactRelativePath(readString(record, "relativePath"))
      : "";
    const sha256 = normalizeHex(readString(record, "sha256"));
    entries.push({
      label,
      relativePath,
      sha256: NON_ZERO_SHA256_PATTERN.test(sha256) ? sha256 : "",
    });
  };
  const videoArtifacts = readOwnArrayValues(videoTranscript, "videoArtifacts")
    ? readOwnArrayValues(videoTranscript, "videoArtifacts")
    : [];
  videoArtifacts.forEach((artifact, index) => {
    addEntry(artifact, `video artifact ${index}`, /\.webm$/iu);
  });
  const screenshots = readOwnArrayValues(videoTranscript, "explorerScreenshots")
    ? readOwnArrayValues(videoTranscript, "explorerScreenshots")
    : [];
  screenshots.forEach((screenshot, index) => {
    addEntry(
      screenshot,
      `${readString(screenshot, "kind") || `screenshot ${index}`} explorer screenshot`,
      /\.png$/iu,
    );
  });
  const problems = [];
  const seenPaths = new Map();
  const seenHashes = new Map();
  for (const entry of entries) {
    if (entry.relativePath) {
      const previous = seenPaths.get(entry.relativePath);
      if (previous) {
        problems.push(
          `${entry.label} reuses proof file path from ${previous}.`,
        );
      } else {
        seenPaths.set(entry.relativePath, entry.label);
      }
    }
    if (entry.sha256) {
      const previous = seenHashes.get(entry.sha256);
      if (previous) {
        problems.push(
          `${entry.label} reuses proof file hash from ${previous}.`,
        );
      } else {
        seenHashes.set(entry.sha256, entry.label);
      }
    }
  }
  return problems;
};

const videoExpectedEvidenceProblems = (videoTranscript, bscProfile) => {
  const expectedEvidence = expectedVideoEvidenceForBscProfile(bscProfile);
  const actualEvidence = readOwnArrayValues(
    videoTranscript,
    "expectedEvidence",
  );
  if (!actualEvidence) {
    return ["video proof transcript expectedEvidence is missing or invalid."];
  }
  const problems = [];
  if (actualEvidence.length !== expectedEvidence.length) {
    problems.push(
      "video proof transcript expectedEvidence must include exactly the required evidence steps.",
    );
  }
  for (
    let index = 0;
    index < Math.max(actualEvidence.length, expectedEvidence.length);
    index += 1
  ) {
    const actual = actualEvidence[index];
    const expected = expectedEvidence[index];
    if (expected === undefined) {
      problems.push(
        `video proof transcript expectedEvidence entry ${index} is unexpected.`,
      );
      continue;
    }
    if (typeof actual !== "string" || !actual) {
      problems.push(
        `video proof transcript expectedEvidence entry ${index} is invalid.`,
      );
      continue;
    }
    if (actual !== expected) {
      problems.push(
        `video proof transcript expectedEvidence entry ${index} does not match ${bscProfile.label}.`,
      );
    }
  }
  return problems;
};

const videoTranscriptProblems = (
  videoTranscript,
  { bscNetwork = "testnet", requireReverifiedProofFiles = false } = {},
) => {
  const problems = [];
  if (!isRecord(videoTranscript)) {
    return ["video proof transcript is missing."];
  }
  problems.push(...videoTranscriptShapeProblems(videoTranscript));
  if (
    readString(videoTranscript, "schema") !==
    "iroha-demo-sccp-bsc-live-video/v1"
  ) {
    problems.push("video proof transcript schema is invalid.");
  }
  if (!videoProofOutputDirIsSafe(readString(videoTranscript, "outputDir"))) {
    problems.push(
      "video proof transcript outputDir is missing or not portable.",
    );
  }
  if (readBoolean(videoTranscript, "proofComplete") !== true) {
    problems.push("video proof transcript is not complete.");
  }
  const operatorNotes = readOwnValue(videoTranscript, "operatorNotes");
  if (typeof operatorNotes !== "string" || !operatorNotes.trim()) {
    problems.push(
      "video proof transcript operatorNotes is missing or invalid.",
    );
  } else if (operatorNotes !== SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES) {
    problems.push(
      "video proof transcript operatorNotes does not match the complete proof note.",
    );
  }
  const startedAtMs = readNumber(videoTranscript, "startedAtMs");
  const endedAtMs = readNumber(videoTranscript, "endedAtMs");
  const durationMsValue = readNumber(videoTranscript, "durationMs");
  if (!Number.isSafeInteger(startedAtMs) || !Number.isSafeInteger(endedAtMs)) {
    problems.push("video proof transcript recording window is missing.");
  } else {
    const durationMs = endedAtMs - startedAtMs;
    if (!Number.isSafeInteger(durationMsValue)) {
      problems.push("video proof transcript durationMs is missing or invalid.");
    } else if (durationMsValue !== durationMs) {
      problems.push(
        "video proof transcript durationMs does not match recording window.",
      );
    }
    if (
      durationMs < MIN_VIDEO_DURATION_MS ||
      durationMs > MAX_VIDEO_DURATION_MS
    ) {
      problems.push(
        "video proof transcript recording duration is outside allowed bounds.",
      );
    }
  }
  if (readBoolean(videoTranscript, "preflightReady") !== true) {
    problems.push(
      "video proof transcript does not include ready preflight evidence.",
    );
  }
  if (readBoolean(videoTranscript, "smokeReadinessReady") !== true) {
    problems.push(
      "video proof transcript does not include ready smoke-readiness evidence.",
    );
  }
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const bscBinding = readRecord(videoTranscript, "bsc");
  if (!bscBinding) {
    problems.push("video proof transcript BSC network binding is missing.");
  } else {
    if (
      readString(bscBinding, "network") !== bscProfile.key ||
      readString(bscBinding, "chain") !== bscProfile.chain ||
      readString(bscBinding, "chainIdHex") !== bscProfile.chainIdHex ||
      readString(bscBinding, "networkIdHex") !== bscProfile.networkIdHex ||
      readString(bscBinding, "explorerUrl") !== bscProfile.explorerUrl ||
      readString(bscBinding, "explorerHost") !== bscProfile.explorerHost
    ) {
      problems.push(
        `video proof transcript BSC network binding does not match ${bscProfile.label}.`,
      );
    }
  }
  problems.push(
    ...videoExpectedEvidenceProblems(videoTranscript, bscProfile),
    ...videoNestedEvidenceProblems(videoTranscript),
    ...videoMissingEvidenceProblems(
      readRecord(videoTranscript, "missingEvidence"),
    ),
    ...videoProofArtifactReuseProblems(videoTranscript),
  );
  const flowOrder = readOwnArrayValues(videoTranscript, "flowOrder")
    ? readOwnArrayValues(videoTranscript, "flowOrder")
    : [];
  if (!readArray(videoTranscript, "flowOrder")) {
    problems.push("video proof transcript flowOrder is missing.");
  } else if (flowOrder.some((entry) => typeof entry !== "string")) {
    problems.push("video proof transcript flowOrder contains invalid entries.");
  }
  if (
    flowOrder.length !== REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.length ||
    flowOrder.some(
      (slot, index) =>
        slot !== REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[index],
    )
  ) {
    problems.push(
      "video proof transcript flowOrder does not match required TAIRA -> BSC -> TAIRA order.",
    );
  }
  const transactions = readRecord(videoTranscript, "transactions") ?? {};
  const canonicalTransactions = new Map();
  const canonicalTransactionHashes = new Map();
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const href = readString(transactions, slot);
    const key = href
      ? canonicalExplorerKeyForSlot(slot, href, { bscNetwork })
      : "";
    if (!key) {
      problems.push(`${slot} explorer transaction URL is missing or invalid.`);
      continue;
    }
    const previous = canonicalTransactions.get(key);
    if (previous) {
      problems.push(`${slot} duplicates ${previous}.`);
    }
    canonicalTransactions.set(key, slot);
    const transactionHash = canonicalExplorerTransactionHash(href, {
      bscNetwork,
    });
    if (transactionHash) {
      const previousHashSlot = canonicalTransactionHashes.get(transactionHash);
      if (previousHashSlot) {
        problems.push(
          `${slot} duplicates ${previousHashSlot} transaction hash.`,
        );
      } else {
        canonicalTransactionHashes.set(transactionHash, slot);
      }
    }
  }
  const transactionLinks = readOwnArrayValues(
    videoTranscript,
    "transactionLinks",
  )
    ? readOwnArrayValues(videoTranscript, "transactionLinks")
    : [];
  if (!readArray(videoTranscript, "transactionLinks")) {
    problems.push("video proof transcript transactionLinks is missing.");
  }
  const transactionLinkRecords = transactionLinks.filter(isRecord);
  if (transactionLinkRecords.length !== transactionLinks.length) {
    problems.push(
      "video proof transcript includes invalid transaction link entries.",
    );
  }
  const transactionLinkSlots = new Set();
  const transactionLinkOrder = [];
  for (const link of transactionLinkRecords) {
    const label = readString(link, "label") ?? "";
    const href = readString(link, "href");
    const slot = PUBLIC_PROOF_LINK_SLOTS_BY_LABEL.get(label);
    if (!slot) {
      problems.push(
        `video proof transcript includes unexpected transaction link label: ${
          label || "unknown"
        }.`,
      );
      continue;
    }
    transactionLinkOrder.push(slot);
    if (transactionLinkSlots.has(slot)) {
      problems.push(`${slot} transaction link is duplicated.`);
    }
    transactionLinkSlots.add(slot);
    const expectedHref = readString(transactions, slot);
    const expectedKey = expectedHref
      ? canonicalExplorerKeyForSlot(slot, expectedHref, { bscNetwork })
      : "";
    const linkKey = href
      ? canonicalExplorerKeyForSlot(slot, href, { bscNetwork })
      : "";
    if (!expectedKey || linkKey !== expectedKey) {
      problems.push(`${slot} transaction link does not match transaction URL.`);
    }
  }
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    if (!transactionLinkSlots.has(slot)) {
      problems.push(`${slot} transaction link is missing.`);
    }
  }
  if (
    transactionLinkOrder.length !==
      REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.length ||
    transactionLinkOrder.some(
      (slot, index) =>
        slot !== REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[index],
    )
  ) {
    problems.push(
      "video proof transcript transactionLinks are not in required TAIRA -> BSC -> TAIRA order.",
    );
  }
  const screenshots = readOwnArrayValues(videoTranscript, "explorerScreenshots")
    ? readOwnArrayValues(videoTranscript, "explorerScreenshots")
    : [];
  if (!readArray(videoTranscript, "explorerScreenshots")) {
    problems.push("video proof transcript explorerScreenshots is missing.");
  }
  const screenshotRecords = screenshots.filter(isRecord);
  if (screenshotRecords.length !== screenshots.length) {
    problems.push(
      "video proof transcript includes invalid screenshot entries.",
    );
  }
  const screenshotRecordsBySlot = new Map(
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot) => [slot, []]),
  );
  const capturedScreenshotsBySlot = new Map();
  const explorerScreenshotOrder = [];
  for (const screenshot of screenshotRecords) {
    const kind = readString(screenshot, "kind") ?? "";
    if (!REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.includes(kind)) {
      problems.push(
        `video proof transcript includes unexpected explorer screenshot kind: ${
          kind || "unknown"
        }.`,
      );
      continue;
    }
    if (readString(screenshot, "label") !== PUBLIC_PROOF_LINK_LABELS[kind]) {
      problems.push(
        `${kind} explorer screenshot label does not match required proof label.`,
      );
    }
    explorerScreenshotOrder.push(kind);
    screenshotRecordsBySlot.get(kind).push(screenshot);
  }
  if (
    explorerScreenshotOrder.length !==
      REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.length ||
    explorerScreenshotOrder.some(
      (slot, index) =>
        slot !== REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[index],
    )
  ) {
    problems.push(
      "video proof transcript explorerScreenshots are not in required TAIRA -> BSC -> TAIRA order.",
    );
  }
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const href = readString(transactions, slot);
    const expectedKey = href
      ? canonicalExplorerKeyForSlot(slot, href, { bscNetwork })
      : "";
    if (!expectedKey) {
      continue;
    }
    const slotScreenshots = screenshotRecordsBySlot.get(slot) ?? [];
    if (slotScreenshots.length > 1) {
      problems.push(`${slot} explorer screenshot is duplicated.`);
    }
    const captured = slotScreenshots.find(
      (screenshot) =>
        readString(screenshot, "status") === "captured" &&
        readBoolean(screenshot, "fileVerified") === true &&
        (!requireReverifiedProofFiles ||
          readBoolean(screenshot, "fileReverified") === true) &&
        proofArtifactRelativePathIsSafe(
          readString(screenshot, "relativePath"),
          /\.png$/iu,
        ) &&
        Number.isSafeInteger(readNumber(screenshot, "sizeBytes")) &&
        readNumber(screenshot, "sizeBytes") >= MIN_SCREENSHOT_ARTIFACT_BYTES &&
        readNumber(screenshot, "sizeBytes") <= MAX_SCREENSHOT_ARTIFACT_BYTES &&
        typeof readOwnValue(screenshot, "sha256") === "string" &&
        NON_ZERO_SHA256_PATTERN.test(readOwnValue(screenshot, "sha256")) &&
        readString(screenshot, "mediaType") === "image/png",
    );
    if (!captured) {
      problems.push(`${slot} explorer screenshot is missing.`);
      continue;
    }
    if (
      canonicalExplorerKeyForSlot(slot, readString(captured, "href"), {
        bscNetwork,
      }) !== expectedKey
    ) {
      problems.push(`${slot} explorer screenshot is missing.`);
      continue;
    }
    if (
      canonicalExplorerKeyForSlot(slot, readString(captured, "finalHref"), {
        bscNetwork,
      }) !== expectedKey
    ) {
      problems.push(
        `${slot} explorer screenshot finalHref does not match transaction URL.`,
      );
    }
    const screenshotTxHash = normalizeExplorerTransactionHash(
      readString(captured, "transactionHash"),
    );
    const expectedTxHash = canonicalExplorerTransactionHash(href, {
      bscNetwork,
    });
    if (!screenshotTxHash) {
      problems.push(
        `${slot} explorer screenshot transactionHash is missing or invalid.`,
      );
    } else if (screenshotTxHash !== expectedTxHash) {
      problems.push(
        `${slot} explorer screenshot transactionHash does not match transaction URL.`,
      );
    }
    if (
      !Number.isSafeInteger(readNumber(captured, "contentLength")) ||
      readNumber(captured, "contentLength") < MIN_EXPLORER_CONTENT_CHARS
    ) {
      problems.push(
        `${slot} explorer screenshot contentLength is missing or too small.`,
      );
    }
    capturedScreenshotsBySlot.set(slot, captured);
  }
  problems.push(
    ...explorerScreenshotProofPathReuseProblems(capturedScreenshotsBySlot),
  );
  return problems;
};

const videoTranscriptPresenceProblems = (videoTranscript) =>
  isRecord(videoTranscript) ? [] : ["video proof transcript is missing."];

const videoArtifactProblems = (
  videoTranscript,
  { requireReverifiedProofFiles = false } = {},
) => {
  if (!isRecord(videoTranscript)) {
    return ["video proof transcript is missing."];
  }
  const artifacts = readOwnArrayValues(videoTranscript, "videoArtifacts")
    ? readOwnArrayValues(videoTranscript, "videoArtifacts")
    : null;
  const problems = [];
  if (!artifacts) {
    problems.push("video proof transcript videoArtifacts is missing.");
  } else {
    if (artifacts.length !== 1) {
      problems.push(
        "video proof transcript must contain exactly one video artifact.",
      );
    }
    artifacts.forEach((artifact, index) => {
      if (!isRecord(artifact)) {
        problems.push(
          `video proof transcript video artifact ${index} is not an object.`,
        );
      }
    });
  }
  const captured = (artifacts ?? []).filter(
    (artifact) =>
      isRecord(artifact) &&
      readString(artifact, "status") === "captured" &&
      readBoolean(artifact, "fileVerified") === true &&
      (!requireReverifiedProofFiles ||
        readBoolean(artifact, "fileReverified") === true) &&
      proofArtifactRelativePathIsSafe(
        readString(artifact, "relativePath"),
        /\.webm$/iu,
      ) &&
      Number.isSafeInteger(readNumber(artifact, "sizeBytes")) &&
      readNumber(artifact, "sizeBytes") >= MIN_VIDEO_ARTIFACT_BYTES &&
      readNumber(artifact, "sizeBytes") <= MAX_VIDEO_ARTIFACT_BYTES &&
      typeof readOwnValue(artifact, "sha256") === "string" &&
      NON_ZERO_SHA256_PATTERN.test(readOwnValue(artifact, "sha256")) &&
      readString(artifact, "mediaType") === "video/webm",
  );
  if (captured.length === 0) {
    problems.push(
      "recorded UI video artifact is missing, unverified, or invalid.",
    );
  } else if (captured.length > 1) {
    problems.push("recorded UI video artifact is duplicated.");
  }
  return problems;
};

const videoProofFilesReverificationProblems = (videoTranscript) => {
  if (!isRecord(videoTranscript)) {
    return ["video proof transcript is missing."];
  }
  const problems = [];
  if (
    !hasOwn(videoTranscript, REVERIFIED_VIDEO_PROOF_FILES) ||
    videoTranscript[REVERIFIED_VIDEO_PROOF_FILES] !== true
  ) {
    problems.push(
      "video proof files were not reverified from the transcript directory in this gate run.",
    );
  }
  if (!readBoolean(videoTranscript, "proofFilesReverified")) {
    problems.push("video proof file reverification did not pass.");
  }
  const outputDirBinding =
    videoTranscript[REVERIFIED_VIDEO_PROOF_OUTPUT_DIR_BINDING];
  if (!isRecord(outputDirBinding) || outputDirBinding.ok !== true) {
    problems.push(
      readString(outputDirBinding, "detail") ||
        "video proof transcript outputDir was not reverified against the transcript directory.",
    );
  }
  return problems;
};

const videoReadinessBindingProblems = ({
  videoTranscript,
  routeReport,
  peerAuditReport,
  smokeReadinessReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(videoTranscript)) {
    return ["video proof transcript is missing."];
  }
  const binding = readRecord(videoTranscript, "readinessBinding");
  if (!isRecord(binding)) {
    return ["video proof transcript readiness binding is missing."];
  }
  const problems = [];
  const bindingRouteReady = readBoolean(binding, "routeReady");
  const bindingSmokeReadinessReady = readBoolean(
    binding,
    "smokeReadinessReady",
  );
  if (!bindingRouteReady) {
    problems.push("video readiness binding routeReady is not true.");
  }
  if (!bindingSmokeReadinessReady) {
    problems.push("video readiness binding smokeReadinessReady is not true.");
  }
  const routeReportReady = readOwnValue(routeReport, "ready");
  if (
    typeof routeReportReady === "boolean" &&
    bindingRouteReady !== routeReportReady
  ) {
    problems.push(
      "video readiness binding routeReady differs from route report.",
    );
  }
  const smokeRouteReady = readOwnValue(smokeReadinessReport, "routeReady");
  if (
    typeof smokeRouteReady === "boolean" &&
    bindingRouteReady !== smokeRouteReady
  ) {
    problems.push(
      "video readiness binding routeReady differs from smoke-readiness report.",
    );
  }
  const smokeReadinessReady = readOwnValue(smokeReadinessReport, "ready");
  if (
    typeof smokeReadinessReady === "boolean" &&
    bindingSmokeReadinessReady !== smokeReadinessReady
  ) {
    problems.push(
      "video readiness binding smokeReadinessReady differs from smoke-readiness report.",
    );
  }
  const bindingChecks = readArray(binding, "checks");
  problems.push(
    ...reportCheckIntegrityProblems(
      { checks: bindingChecks },
      "video readiness binding",
    ),
  );
  if (Array.isArray(bindingChecks)) {
    problems.push(
      ...checkSummaryDiffs(
        readArray(smokeReadinessReport, "checks"),
        bindingChecks,
        "video readiness binding",
      ),
    );
  }
  const bindingCheckedAt = readString(binding, "checkedAt");
  if (!bindingCheckedAt) {
    problems.push("video readiness binding checkedAt is missing.");
  } else {
    const bindingCheckedAtMs = parseTimestampMs(bindingCheckedAt);
    if (bindingCheckedAtMs === null) {
      problems.push("video readiness binding checkedAt is invalid.");
    } else if (
      Number.isSafeInteger(readNumber(videoTranscript, "startedAtMs")) &&
      bindingCheckedAtMs < readNumber(videoTranscript, "startedAtMs")
    ) {
      problems.push(
        "video readiness binding checkedAt is before the recording window.",
      );
    } else if (
      Number.isSafeInteger(readNumber(videoTranscript, "endedAtMs")) &&
      bindingCheckedAtMs > readNumber(videoTranscript, "endedAtMs")
    ) {
      problems.push(
        "video readiness binding checkedAt is after the recording window.",
      );
    }
    if (
      readString(smokeReadinessReport, "checkedAt") &&
      bindingCheckedAt !== readString(smokeReadinessReport, "checkedAt")
    ) {
      problems.push(
        "video readiness binding checkedAt differs from smoke-readiness report.",
      );
    }
  }
  const bindingRoute = readRecord(binding, "route");
  if (!isRecord(bindingRoute)) {
    problems.push("video readiness binding route summary is missing.");
  } else {
    if (readString(bindingRoute, "manifestSource") !== "torii") {
      problems.push("video readiness binding route is not public TAIRA.");
    }
    if (
      readString(bindingRoute, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
      readString(bindingRoute, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
    ) {
      problems.push("video readiness binding route id or asset key differs.");
    }
    problems.push(
      ...routeIdentityProblemDetails(
        bindingRoute,
        "video readiness binding route",
      ),
    );
    problems.push(
      ...bscProfileBindingProblems(
        readRecord(bindingRoute, "bsc"),
        "video readiness binding route",
        bscProfile,
      ),
      ...deploymentBscProfileProblems(
        readRecord(bindingRoute, "deployment"),
        "video readiness binding route",
        bscProfile,
      ),
      ...roleSeparatedProductionHashProblems(
        readRecord(bindingRoute, "deployment"),
        "video readiness binding route",
      ),
    );
    problems.push(
      ...deploymentDiffs(
        readRecord(routeReport, "deployment"),
        readRecord(bindingRoute, "deployment"),
        "video route",
      ),
      ...postDeployEvidenceDiffs(
        readRecord(routeReport, "postDeployLiveEvidence"),
        readRecord(bindingRoute, "postDeployLiveEvidence"),
        "video route",
        bscProfile,
      ),
    );
    problems.push(
      ...deploymentDiffs(
        readRecord(readRecord(smokeReadinessReport, "route"), "deployment"),
        readRecord(bindingRoute, "deployment"),
        "video smoke-readiness route",
      ),
      ...postDeployEvidenceDiffs(
        readRecord(
          readRecord(smokeReadinessReport, "route"),
          "postDeployLiveEvidence",
        ),
        readRecord(bindingRoute, "postDeployLiveEvidence"),
        "video smoke-readiness route",
        bscProfile,
      ),
    );
  }
  const bindingPeerAudit = readRecord(binding, "peerAudit");
  if (!isRecord(bindingPeerAudit)) {
    problems.push("video readiness binding peer audit summary is missing.");
  } else {
    if (!readBoolean(bindingPeerAudit, "ready")) {
      problems.push("video readiness binding peer audit is not ready.");
    }
    if (
      readString(bindingPeerAudit, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
      readString(bindingPeerAudit, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
    ) {
      problems.push("video readiness binding peer audit route differs.");
    }
    problems.push(
      ...routeIdentityProblemDetails(
        bindingPeerAudit,
        "video readiness binding peer audit",
      ),
    );
    const smokePeerAudit = readRecord(smokeReadinessReport, "peerAudit");
    if (!readBoolean(bindingPeerAudit, "sanitizedStanzaFilesChecked")) {
      problems.push(
        "video readiness binding peer audit sanitized stanza files were not checked.",
      );
    }
    if (
      readBoolean(bindingPeerAudit, "sanitizedStanzaFilesChecked") !==
      readBoolean(peerAuditReport, "sanitizedStanzaFilesChecked")
    ) {
      problems.push(
        "video readiness binding peer audit sanitized stanza file status differs.",
      );
    }
    if (
      isRecord(smokePeerAudit) &&
      readBoolean(bindingPeerAudit, "sanitizedStanzaFilesChecked") !==
        readBoolean(smokePeerAudit, "sanitizedStanzaFilesChecked")
    ) {
      problems.push(
        "video readiness binding peer audit sanitized stanza file status differs from smoke-readiness report.",
      );
    }
    if (
      !Number.isSafeInteger(readNumber(bindingPeerAudit, "peerCount")) ||
      readNumber(bindingPeerAudit, "peerCount") <= 0
    ) {
      problems.push("video readiness binding peer audit peerCount is invalid.");
    } else {
      if (
        Number.isSafeInteger(readNumber(peerAuditReport, "peerCount")) &&
        readNumber(bindingPeerAudit, "peerCount") !==
          readNumber(peerAuditReport, "peerCount")
      ) {
        problems.push("video readiness binding peer audit peerCount differs.");
      }
      if (
        Number.isSafeInteger(
          readNumber(
            readRecord(smokeReadinessReport, "peerAudit"),
            "peerCount",
          ),
        ) &&
        readNumber(bindingPeerAudit, "peerCount") !==
          readNumber(readRecord(smokeReadinessReport, "peerAudit"), "peerCount")
      ) {
        problems.push(
          "video readiness binding peer audit peerCount differs from smoke-readiness report.",
        );
      }
    }
    if (!isRecord(smokePeerAudit)) {
      problems.push(
        "video readiness binding smoke-readiness peer audit summary is missing.",
      );
    }
  }
  problems.push(
    ...videoPostDeployTransactionReuseProblems({
      videoTranscript,
      routeReport,
      smokeReadinessReport,
      binding,
      bscProfile,
    }),
  );
  return problems;
};

export const evaluateBscSccpProductionGate = (input = {}) => {
  const routeReport = readOwnValue(input, "routeReport");
  const peerAuditReport = readOwnValue(input, "peerAuditReport");
  const smokeReadinessReport = readOwnValue(input, "smokeReadinessReport");
  const materialInventoryReport = readOwnValue(
    input,
    "materialInventoryReport",
  );
  const videoTranscript = readOwnValue(input, "videoTranscript");
  const peerAuditRefresh = readOwnValue(input, "peerAuditRefresh");
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const checkedAt =
    readOwnValue(input, "checkedAt") ?? new Date().toISOString();
  const maxReportAgeMs =
    readOwnValue(input, "maxReportAgeMs") ?? DEFAULT_MAX_REPORT_AGE_MS;
  const futureSkewMs =
    readOwnValue(input, "futureSkewMs") ?? DEFAULT_FUTURE_SKEW_MS;
  const requireReverifiedVideoProofFiles =
    readOwnValue(input, "requireReverifiedVideoProofFiles") ?? true;
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const checks = [];
  const nowMs = parseTimestampMs(checkedAt) ?? Date.now();
  const routeRecord = ownJsonRecord(routeReport);
  const peerAuditRecord = ownJsonRecord(peerAuditReport);
  const peerAuditRefreshRecord = ownJsonRecord(peerAuditRefresh);
  const smokeReadinessRecord = ownJsonRecord(smokeReadinessReport);
  const smokeRouteRecord = isRecord(smokeReadinessRecord?.route)
    ? smokeReadinessRecord.route
    : null;
  const materialInventoryRecord = ownJsonRecord(materialInventoryReport);
  const videoTranscriptRecord = ownJsonRecord(videoTranscript);
  const productionInputReports = [
    ["route-report", routeRecord],
    ["peer-audit", peerAuditRecord],
    ["smoke-readiness", smokeReadinessRecord],
    ["material-inventory", materialInventoryRecord],
    ["video-transcript", videoTranscriptRecord],
  ];
  const inputReportLoadErrors = [
    ["route preflight", routeRecord],
    ["peer audit", peerAuditRecord],
    ["smoke-readiness", smokeReadinessRecord],
    ["production material inventory", materialInventoryRecord],
    ["video proof", videoTranscriptRecord],
  ]
    .map(([label, report]) => reportLoadErrorDetail(report, label))
    .filter(Boolean);
  check(
    checks,
    "prerequisite-report-load-errors",
    inputReportLoadErrors.length === 0,
    "Prerequisite reports and video proof transcript loaded without errors.",
    inputReportLoadErrors.join(" "),
  );
  for (const [inputId, report] of productionInputReports) {
    const id = `${inputId}-secret-scan`;
    const hasSecretLike = scanSecretLike(report);
    check(
      checks,
      id,
      !hasSecretLike,
      `${id.replace(/-/gu, " ")} does not contain secret-like material.`,
      hasSecretLike ? "secret-like material was detected." : "",
    );
  }
  for (const [inputId, report] of productionInputReports) {
    const id = `${inputId}-smoke-fixture-scan`;
    const hasSmokeFixture = scanSmokeFixtureVerifierMaterial(report);
    check(
      checks,
      id,
      !hasSmokeFixture,
      `${id.replace(/-/gu, " ")} does not contain deterministic smoke-test Groth16 verifier material.`,
      hasSmokeFixture ? "smoke-test verifier material was detected." : "",
    );
  }
  for (const [inputId, report] of productionInputReports) {
    const id = `${inputId}-bn254-verifier-material-scan`;
    const hasInvalidVerifierMaterial = scanInvalidBn254VerifierMaterial(report);
    check(
      checks,
      id,
      !hasInvalidVerifierMaterial,
      `${id.replace(/-/gu, " ")} contains only valid BN254 Groth16 verifier material when verifier points are present.`,
      hasInvalidVerifierMaterial
        ? "invalid BN254 verifier material was detected."
        : "",
    );
  }
  for (const [inputId, report] of productionInputReports) {
    const id = `${inputId}-diagnostic-verifier-key-hash-scan`;
    const hasDiagnosticVerifierKeyHash =
      scanDiagnosticBscVerifierKeyHash(report);
    check(
      checks,
      id,
      !hasDiagnosticVerifierKeyHash,
      `${id.replace(/-/gu, " ")} does not carry known diagnostic BSC verifier key hashes.`,
      hasDiagnosticVerifierKeyHash
        ? "known diagnostic BSC verifier key hash was detected."
        : "",
    );
  }
  const prerequisiteCheckIntegrity = [
    ["route preflight", routeRecord],
    ["peer audit", peerAuditRecord],
    ["smoke-readiness", smokeReadinessRecord],
    ["production material inventory", materialInventoryRecord],
  ].flatMap(([label, report]) => reportCheckIntegrityProblems(report, label));
  check(
    checks,
    "prerequisite-report-check-integrity",
    prerequisiteCheckIntegrity.length === 0,
    "Prerequisite reports have unambiguous, unique check results.",
    prerequisiteCheckIntegrity.join("; "),
  );

  const freshness = freshnessProblems(
    [
      ["route preflight", routeRecord],
      ["peer audit", peerAuditRecord],
      ["smoke-readiness", smokeReadinessRecord],
      ["production material inventory", materialInventoryRecord],
    ],
    { nowMs, maxReportAgeMs, futureSkewMs },
  );
  check(
    checks,
    "evidence-freshness",
    freshness.length === 0,
    "Route, peer, smoke, and material inventory evidence is recent.",
    freshness.join("; "),
  );
  const peerAuditRefreshIssues = peerAuditRefreshProblems(
    peerAuditRefreshRecord,
    peerAuditRecord,
  );
  check(
    checks,
    "peer-audit-refresh-source",
    peerAuditRefreshIssues.length === 0,
    peerAuditRefreshMessage(peerAuditRefreshRecord),
    peerAuditRefreshIssues.join(" "),
  );

  const routePreflightCheckProblems = requiredRoutePreflightCheckProblems(
    routeRecord,
    bscProfile,
  );
  const routePreflightShapeProblems =
    routePreflightReportShapeProblems(routeRecord);
  const routePreflightReady =
    routeRecord?.ready === true &&
    routeRecord?.manifestSource === "torii" &&
    routeRecord?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
    routeRecord?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
    routeIdentityAliasProblems(routeRecord).length === 0 &&
    routePreflightShapeProblems.length === 0 &&
    routePreflightCheckProblems.length === 0;
  check(
    checks,
    "route-preflight-ready",
    routePreflightReady,
    "Public TAIRA/BSC route preflight is production-ready.",
    routePreflightReady
      ? ""
      : [
          routeReadinessFailureDetail({
            report: routeRecord,
            label: "route preflight",
            generic:
              "route report is missing, local-only, wrong route, or not ready.",
          }),
          ...routePreflightShapeProblems,
          ...routePreflightCheckProblems,
        ]
          .filter(Boolean)
          .join(" "),
  );
  check(
    checks,
    "route-diagnostic-scan",
    !scanDiagnosticMaterial(routeRecord),
    "Public route report does not carry diagnostic verifier material.",
    scanDiagnosticMaterial(routeRecord)
      ? "diagnostic verifier material was detected."
      : "",
  );
  const burnRecordMaterialProblems = bscBurnRecordProductionMaterialProblems(
    routeRecord,
    materialInventoryRecord,
  );
  check(
    checks,
    "taira-burn-record-production-material",
    burnRecordMaterialProblems.length === 0,
    "TAIRA burn-record material is production-shaped in public route and inventory evidence.",
    burnRecordMaterialProblems.join("; "),
  );
  const peerAuditShapeProblems = peerAuditReportShapeProblems(peerAuditRecord);
  const peerAuditHashProblems = peerEvidenceHashProblems(peerAuditRecord);
  const peerConfigAuditReady =
    peerAuditRecord?.ready === true &&
    peerAuditRecord?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
    peerAuditRecord?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
    routeIdentityAliasProblems(peerAuditRecord).length === 0 &&
    peerAuditShapeProblems.length === 0 &&
    peerAuditHashProblems.length === 0;
  check(
    checks,
    "peer-config-audit-ready",
    peerConfigAuditReady,
    "TAIRA peer-config audit is production-ready.",
    peerConfigAuditReady
      ? ""
      : [
          peerAuditFailureDetail(peerAuditRecord),
          ...peerAuditShapeProblems,
          ...peerAuditHashProblems,
        ]
          .filter(Boolean)
          .join(" "),
  );
  const smokeReadinessShapeProblems =
    smokeReadinessReportShapeProblems(smokeReadinessRecord);
  const smokeReadinessRequiredCheckProblems =
    requiredSmokeReadinessCheckProblems(smokeReadinessRecord);
  const smokeReadinessReady =
    smokeReadinessRecord?.ready === true &&
    smokeReadinessRecord?.routeReady === true &&
    smokeRouteRecord?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
    smokeRouteRecord?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
    routeIdentityAliasProblems(smokeRouteRecord).length === 0 &&
    smokeReadinessShapeProblems.length === 0 &&
    smokeReadinessRequiredCheckProblems.length === 0;
  check(
    checks,
    "smoke-readiness-ready",
    smokeReadinessReady,
    "BSC live smoke-readiness report is ready.",
    smokeReadinessReady
      ? ""
      : [
          smokeReadinessFailureDetail(smokeReadinessRecord),
          ...smokeReadinessShapeProblems,
          ...smokeReadinessRequiredCheckProblems,
        ]
          .filter(Boolean)
          .join(" "),
  );
  const walletConnectProblems = smokeReadinessSpecificCheckProblems(
    smokeReadinessRecord,
    ["walletconnect-project-id"],
  );
  check(
    checks,
    "smoke-walletconnect-configured",
    walletConnectProblems.length === 0,
    "BSC WalletConnect project id is configured for live signing.",
    walletConnectProblems.join("; "),
  );
  const runtimeProverProblems = smokeReadinessSpecificCheckProblems(
    smokeReadinessRecord,
    ["runtime-prover-config"],
  );
  check(
    checks,
    "smoke-runtime-prover-configured",
    runtimeProverProblems.length === 0,
    "BSC runtime prover config is route-bound when required.",
    runtimeProverProblems.join("; "),
  );
  const destinationProverProblems = smokeReadinessSpecificCheckProblems(
    smokeReadinessRecord,
    ["destination-prover-module", "destination-prover-manifest"],
  );
  check(
    checks,
    "smoke-destination-prover-configured",
    destinationProverProblems.length === 0,
    "TAIRA-to-BSC browser prover module and manifest are configured.",
    destinationProverProblems.join("; "),
  );
  const sourceProverProblems = smokeReadinessSpecificCheckProblems(
    smokeReadinessRecord,
    ["source-prover-module", "source-prover-manifest"],
  );
  check(
    checks,
    "smoke-source-prover-configured",
    sourceProverProblems.length === 0,
    "BSC-to-TAIRA browser source prover module and manifest are configured.",
    sourceProverProblems.join("; "),
  );
  const smokeBindingProblems = smokeReadinessBindingProblems(
    smokeReadinessRecord,
    routeRecord,
    bscProfile,
  );
  check(
    checks,
    "smoke-readiness-binding",
    smokeBindingProblems.length === 0,
    "BSC live smoke-readiness probes and prover manifests are route-bound.",
    smokeBindingProblems.join("; "),
  );

  const proofProblems = [
    ...proofMaterialProblems(routeRecord?.deployment, "route preflight"),
    ...proofMaterialProblems(
      smokeRouteRecord?.deployment,
      "smoke-readiness route",
    ),
  ];
  check(
    checks,
    "production-proof-material",
    proofProblems.length === 0,
    "BSC route evidence carries production proof and proving key hashes.",
    proofProblems.join("; "),
  );

  const scanRootAvailabilityProblems =
    materialInventoryScanRootAvailabilityProblems(materialInventoryRecord);
  check(
    checks,
    "material-inventory-scan-root-availability",
    scanRootAvailabilityProblems.length === 0,
    "BSC production material inventory scan roots are present and readable.",
    scanRootAvailabilityProblems.join("; "),
  );

  const offlineFullTomlPublicationIssues = offlineFullTomlPublicationProblems({
    materialInventoryReport: materialInventoryRecord,
    routeReport: routeRecord,
    smokeReadinessReport: smokeReadinessRecord,
    bscProfile,
  });
  check(
    checks,
    "offline-full-toml-publication",
    offlineFullTomlPublicationIssues.length === 0,
    "Generated BSC full-TOML evidence is published by public route and smoke reports.",
    offlineFullTomlPublicationIssues.join("; "),
  );

  const inventoryProblems = materialInventoryBindingProblems(
    materialInventoryRecord,
    routeRecord,
    bscProfile,
  );
  check(
    checks,
    "production-material-inventory",
    inventoryProblems.length === 0,
    "BSC production material inventory is ready and bound to the route.",
    inventoryProblems.join("; "),
  );
  const materialRuntimeProverProblems = materialInventorySpecificCheckProblems(
    materialInventoryRecord,
    ["runtime-prover-config"],
  );
  check(
    checks,
    "material-runtime-prover-configured",
    materialRuntimeProverProblems.length === 0,
    "BSC material inventory runtime prover config is route-bound when required.",
    materialRuntimeProverProblems.join("; "),
  );
  const materialDeploymentEvidenceProblems =
    materialInventorySpecificCheckProblems(materialInventoryRecord, [
      "deployment-evidence-artifact",
    ]);
  check(
    checks,
    "material-deployment-evidence-artifact",
    materialDeploymentEvidenceProblems.length === 0,
    "BSC material inventory has clean deployment evidence bound to the public route.",
    materialDeploymentEvidenceProblems.join("; "),
  );
  const materialGroth16AttestationRoleProblems =
    materialInventorySpecificCheckProblems(materialInventoryRecord, [
      "groth16-attestation-role-readiness",
    ]);
  check(
    checks,
    "material-groth16-attestation-role-readiness",
    materialGroth16AttestationRoleProblems.length === 0,
    "BSC Groth16 semantic, audit, setup, and reproducible-build roles are ready for signature.",
    materialGroth16AttestationRoleProblems.join("; "),
  );
  const materialDestinationProverProblems =
    materialInventorySpecificCheckProblems(materialInventoryRecord, [
      "destination-browser-prover",
    ]);
  check(
    checks,
    "material-destination-prover-configured",
    materialDestinationProverProblems.length === 0,
    "BSC material inventory has route-bound TAIRA-to-BSC browser prover material.",
    materialDestinationProverProblems.join("; "),
  );
  const materialSourceProverProblems = materialInventorySpecificCheckProblems(
    materialInventoryRecord,
    ["source-browser-prover"],
  );
  check(
    checks,
    "material-source-prover-configured",
    materialSourceProverProblems.length === 0,
    "BSC material inventory has route-bound BSC-to-TAIRA browser source prover material.",
    materialSourceProverProblems.join("; "),
  );

  const bindingProblems = [];
  if (routeRecord?.taira?.chainId !== BSC_TAIRA_CHAIN_ID) {
    bindingProblems.push("route report is not bound to TAIRA chain id.");
  }
  if (routeRecord?.taira?.networkPrefix !== BSC_TAIRA_NETWORK_PREFIX) {
    bindingProblems.push("route report is not bound to TAIRA network prefix.");
  }
  bindingProblems.push(
    ...bscProfileBindingProblems(routeRecord?.bsc, "route report", bscProfile),
    ...deploymentBscProfileProblems(
      routeRecord?.deployment,
      "route report",
      bscProfile,
    ),
    ...bscProfileBindingProblems(
      smokeRouteRecord?.bsc,
      "smoke-readiness route",
      bscProfile,
    ),
    ...deploymentBscProfileProblems(
      smokeRouteRecord?.deployment,
      "smoke-readiness route",
      bscProfile,
    ),
    ...deploymentDiffs(
      routeRecord?.deployment,
      smokeRouteRecord?.deployment,
      "smoke-readiness route",
    ),
    ...postDeployEvidenceDiffs(
      routeRecord?.postDeployLiveEvidence,
      smokeRouteRecord?.postDeployLiveEvidence,
      "smoke-readiness route",
      bscProfile,
    ),
  );
  check(
    checks,
    "cross-report-binding",
    bindingProblems.length === 0,
    "Route and smoke-readiness reports are bound to the same on-chain manifest deployment.",
    bindingProblems.join("; "),
  );

  if (isRecord(smokeReadinessRecord?.peerAudit)) {
    const smokePeerProblems = [];
    const smokePeerAudit = smokeReadinessRecord.peerAudit;
    if (smokePeerAudit.ready !== true) {
      smokePeerProblems.push(
        "smoke-readiness embedded peer audit is not ready.",
      );
    }
    if (
      smokePeerAudit.routeId !== peerAuditRecord?.routeId ||
      smokePeerAudit.assetKey !== peerAuditRecord?.assetKey
    ) {
      smokePeerProblems.push("smoke-readiness peer audit route differs.");
    }
    if (
      !Number.isSafeInteger(smokePeerAudit.peerCount) ||
      smokePeerAudit.peerCount !== peerAuditRecord?.peerCount
    ) {
      smokePeerProblems.push("smoke-readiness peer audit peerCount differs.");
    }
    if (
      readBoolean(smokePeerAudit, "sanitizedStanzaFilesChecked") !==
      readBoolean(peerAuditRecord, "sanitizedStanzaFilesChecked")
    ) {
      smokePeerProblems.push(
        "smoke-readiness peer audit sanitized stanza file status differs.",
      );
    }
    smokePeerProblems.push(
      ...reportCheckIntegrityProblems(
        { checks: smokePeerAudit.checks },
        "smoke-readiness embedded peer audit",
      ),
      ...checkSummaryDiffs(
        peerAuditRecord?.checks,
        smokePeerAudit.checks,
        "smoke-readiness peer audit",
      ),
    );
    const rawSmokePeers = Array.isArray(smokePeerAudit.peers)
      ? smokePeerAudit.peers
      : null;
    const rawPeerAuditPeers = Array.isArray(peerAuditRecord?.peers)
      ? peerAuditRecord.peers
      : null;
    if (!rawSmokePeers) {
      smokePeerProblems.push(
        "smoke-readiness peer audit peer summaries are missing.",
      );
    } else {
      rawSmokePeers.forEach((peer, index) => {
        if (!isRecord(peer)) {
          smokePeerProblems.push(
            `smoke-readiness peer audit peer summary ${index} is not an object.`,
          );
        }
      });
    }
    if (!rawPeerAuditPeers) {
      smokePeerProblems.push(
        "peer audit report does not include peer summaries.",
      );
    } else {
      rawPeerAuditPeers.forEach((peer, index) => {
        if (!isRecord(peer)) {
          smokePeerProblems.push(
            `peer audit peer summary ${index} is not an object.`,
          );
        }
      });
    }
    const smokePeers = rawSmokePeers?.filter(isRecord) ?? [];
    const peerAuditPeers = rawPeerAuditPeers?.filter(isRecord) ?? [];
    if (smokePeers.length !== peerAuditPeers.length) {
      smokePeerProblems.push("smoke-readiness peer audit peer count differs.");
    }
    for (const [index, peer] of peerAuditPeers.entries()) {
      for (const key of [
        "routeCount",
        "ready",
        "productionReady",
        "rawTomlSha256",
        "sanitizedStanzaSha256",
        "sanitizedStanzaSource",
        "sanitizedStanzaFileChecked",
        "sanitizedStanzaFileVerified",
        "sanitizedStanzaFileVerificationError",
        "sanitizedStanzaFileSha256",
      ]) {
        if (peer[key] !== smokePeers[index]?.[key]) {
          smokePeerProblems.push(
            `smoke-readiness peer ${index} ${key} differs.`,
          );
        }
      }
      for (const key of ["hashRoleProblems", "burnRecordMaterialProblems"]) {
        if (
          JSON.stringify(readArray(peer, key) ?? null) !==
          JSON.stringify(readArray(smokePeers[index], key) ?? null)
        ) {
          smokePeerProblems.push(
            `smoke-readiness peer ${index} ${key} differs.`,
          );
        }
      }
      smokePeerProblems.push(
        ...reportCheckIntegrityProblems(
          { checks: peer.failedChecks },
          `peer audit peer ${index} failed checks`,
        ),
        ...reportCheckIntegrityProblems(
          { checks: smokePeers[index]?.failedChecks },
          `smoke-readiness peer ${index} failed checks`,
        ),
        ...checkSummaryDiffs(
          peer.failedChecks,
          smokePeers[index]?.failedChecks,
          `smoke-readiness peer ${index} failed`,
        ),
      );
    }
    check(
      checks,
      "smoke-peer-audit-binding",
      smokePeerProblems.length === 0,
      "Smoke-readiness report embeds the same ready peer audit.",
      smokePeerProblems.join("; "),
    );
  } else {
    check(
      checks,
      "smoke-peer-audit-binding",
      false,
      "Smoke-readiness report embeds the same ready peer audit.",
      "smoke-readiness report does not include a peer audit summary.",
    );
  }

  const videoProblems = videoTranscriptProblems(videoTranscriptRecord, {
    bscNetwork: bscProfile.key,
    requireReverifiedProofFiles: requireReverifiedVideoProofFiles,
  });
  const videoTranscriptPresenceIssues = videoTranscriptPresenceProblems(
    videoTranscriptRecord,
  );
  const videoArtifactIssues = videoArtifactProblems(videoTranscriptRecord, {
    requireReverifiedProofFiles: requireReverifiedVideoProofFiles,
  });
  const videoFileReverificationIssues = requireReverifiedVideoProofFiles
    ? videoProofFilesReverificationProblems(videoTranscriptRecord)
    : [];
  const videoBindingProblems = videoReadinessBindingProblems({
    videoTranscript: videoTranscriptRecord,
    routeReport: routeRecord,
    peerAuditReport: peerAuditRecord,
    smokeReadinessReport: smokeReadinessRecord,
    bscProfile,
  });
  check(
    checks,
    "video-proof-transcript-present",
    videoTranscriptPresenceIssues.length === 0,
    "BSC SCCP live UI video proof transcript is present.",
    videoTranscriptPresenceIssues.join("; "),
  );
  check(
    checks,
    "video-readiness-binding",
    videoBindingProblems.length === 0,
    "BSC SCCP live UI video proof is bound to the same route readiness evidence.",
    videoBindingProblems.join("; "),
  );
  check(
    checks,
    "video-artifact-captured",
    videoArtifactIssues.length === 0,
    "BSC SCCP live UI proof includes a verified recorded video artifact.",
    videoArtifactIssues.join("; "),
  );
  check(
    checks,
    "video-proof-files-reverified",
    videoFileReverificationIssues.length === 0,
    "BSC SCCP live UI proof files were reverified from disk by the production gate.",
    videoFileReverificationIssues.join("; "),
  );
  check(
    checks,
    "video-proof-complete",
    videoProblems.length === 0,
    "BSC SCCP live UI video proof transcript is complete.",
    videoProblems.join("; "),
  );

  const initiallyReady = checks.every((entry) => entry.ok);
  const nextActions = initiallyReady
    ? []
    : productionGateNextActions(checks, bscProfile);
  const missingProductionInputs = productionGateMissingInputs(
    nextActions,
    routeRecord,
    peerAuditRecord,
    materialInventoryRecord,
    smokeReadinessRecord,
  );
  const runbookReport = {
    nextActions,
    missingProductionInputs,
  };
  const routeNextActions = readArray(routeRecord, "nextActions");
  const peerNextActions = readArray(peerAuditRecord, "nextActions");
  const materialNextActions = readArray(materialInventoryRecord, "nextActions");
  const smokeNextActions = readArray(smokeReadinessRecord, "nextActions");
  if (Array.isArray(routeNextActions)) {
    runbookReport.routeNextActions = routeNextActions;
  }
  if (Array.isArray(peerNextActions)) {
    runbookReport.peerNextActions = peerNextActions;
  }
  if (Array.isArray(materialNextActions)) {
    runbookReport.materialNextActions = materialNextActions;
  }
  if (Array.isArray(smokeNextActions)) {
    runbookReport.smokeNextActions = smokeNextActions;
  }
  const runbookProblems = bscSccpProductionGateRunbookProblems(runbookReport);
  check(
    checks,
    "production-gate-runbook-contract",
    runbookProblems.length === 0,
    "BSC production gate exposes a complete operator runbook.",
    runbookProblems.join("; "),
  );
  const ready = checks.every((entry) => entry.ok);
  return {
    ready,
    checkedAt,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    checks,
    reasons: checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.id}: ${entry.detail || entry.message}`),
    nextActions,
    missingProductionInputs,
    route: publicRouteSummary(routeRecord),
    peerAudit: publicPeerAuditSummary(peerAuditRecord),
    peerAuditRefresh: publicPeerAuditRefreshSummary(peerAuditRefreshRecord),
    smokeReadiness: publicSmokeSummary(smokeReadinessRecord),
    materialInventory: publicMaterialInventorySummary(materialInventoryRecord),
    videoProof: publicVideoSummary(videoTranscriptRecord),
  };
};

const BSC_PRODUCTION_GATE_CLI_OPTIONS = new Set([
  "route-report",
  "peer-audit-report",
  "smoke-readiness-report",
  "material-inventory-report",
  "video-transcript",
  "refresh",
  "bsc-network",
  "torii-url",
  "manifest-file",
  "bsc-rpc-url",
  "allow-local-rpc",
  "check-bsc-contracts",
  "peer-audit-dir",
  "peer-audit-file",
  "dir",
  "file",
  "include-peer-backups",
  "expected-peers",
  "peer-audit-ssh-host",
  "peer-audit-ssh-creds-file",
  "peer-audit-ssh-password-file",
  "peer-audit-ssh-command",
  "peer-audit-sshpass-command",
  "peer-audit-ssh-connect-timeout-seconds",
  "peer-audit-remote-dir",
  "peer-audit-remote-peer-count",
  "material-scan-path",
  "artifact-dir",
  "walletconnect-project-id",
  "destination-prover-module-url",
  "destination-prover-manifest-url",
  "source-prover-module-url",
  "source-prover-manifest-url",
  "runtime-prover-config-url",
  "prover-config-url",
  "module-url",
  "check-module-availability",
  "check-prover-manifests",
  "check-runtime-prover-config",
  "destination-sidecar",
  "source-sidecar",
  "manifest",
  "max-age-ms",
  "future-skew-ms",
  "timeout-ms",
  "output-dir",
]);

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!BSC_PRODUCTION_GATE_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported production gate options.`,
      );
    }
    if (args[key] !== undefined) {
      throw new Error(
        `Duplicate option: --${key}. Repeatable options are documented in --help.`,
      );
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const hasHelpFlag = (argv) => argv.includes("--help") || argv.includes("-h");

const assertNoCliAliasConflicts = (args, label, keys) => {
  const present = keys.filter((key) => args[key] !== undefined);
  if (present.length > 1) {
    throw new Error(
      `Conflicting option aliases for ${label}: ${present
        .map((key) => `--${key}`)
        .join(", ")}.`,
    );
  }
};

const assertBscProductionGateCliAliasConflicts = (args) => {
  assertNoCliAliasConflicts(args, "TAIRA peer audit directory", [
    "peer-audit-dir",
    "dir",
  ]);
  assertNoCliAliasConflicts(args, "TAIRA peer audit file list", [
    "peer-audit-file",
    "file",
  ]);
  assertNoCliAliasConflicts(args, "BSC material scan paths", [
    "material-scan-path",
    "artifact-dir",
  ]);
  assertNoCliAliasConflicts(args, "TAIRA-to-BSC prover module URL", [
    "destination-prover-module-url",
    "module-url",
  ]);
  assertNoCliAliasConflicts(args, "BSC runtime prover config URL", [
    "runtime-prover-config-url",
    "prover-config-url",
  ]);
  assertNoCliAliasConflicts(args, "TAIRA-to-BSC prover sidecar", [
    "destination-sidecar",
    "manifest",
  ]);
};

export const resolveBscSccpProductionGateRefreshReports = (input = {}) => {
  const argRefresh = readOwnValue(input, "argRefresh");
  const envRefresh = readOwnValue(input, "envRefresh");
  return argRefresh === undefined
    ? envRefresh !== undefined &&
        parseBoolean(envRefresh, "SCCP_BSC_PRODUCTION_GATE_REFRESH")
    : parseBoolean(argRefresh, "--refresh");
};

const assertNoConflictingProductionGatePeerAuditSources = ({
  useLocalPeerAudit,
  useRemotePeerAudit,
} = {}) => {
  if (useLocalPeerAudit && useRemotePeerAudit) {
    throw new Error(
      "Conflicting BSC production-gate peer audit sources: local peer audit inputs cannot be combined with remote SSH inputs during refresh.",
    );
  }
};

const printUsage = () => {
  console.log(`Usage: node scripts/e2e/sccp-bsc-production-gate.mjs [options]

Aggregate BSC SCCP production gate.

Options:
  --route-report PATH
  --peer-audit-report PATH
  --smoke-readiness-report PATH
  --material-inventory-report PATH
  --video-transcript PATH
  --refresh true|false              Defaults to false; true regenerates prerequisite reports
  --bsc-network testnet|mainnet
  --torii-url URL
  --manifest-file PATH
  --bsc-rpc-url URL
  --allow-local-rpc
  --check-bsc-contracts true|false
  --peer-audit-dir DIR
  --peer-audit-file PATH
  --dir DIR                         Alias for --peer-audit-dir
  --file PATH                       Alias for --peer-audit-file
  --include-peer-backups
  --expected-peers N
  --peer-audit-ssh-host HOST
  --peer-audit-ssh-creds-file PATH
  --peer-audit-ssh-password-file PATH
  --peer-audit-ssh-command COMMAND
  --peer-audit-sshpass-command COMMAND
  --peer-audit-ssh-connect-timeout-seconds N
  --peer-audit-remote-dir PATH
  --peer-audit-remote-peer-count N
  --material-scan-path PATH[,PATH...]
  --artifact-dir DIR                 Alias for --material-scan-path
  --walletconnect-project-id ID
  --destination-prover-module-url URL
  --destination-prover-manifest-url URL
  --source-prover-module-url URL
  --source-prover-manifest-url URL
  --runtime-prover-config-url URL
  --prover-config-url URL            Alias for --runtime-prover-config-url
  --module-url URL                   Alias for --destination-prover-module-url
  --check-module-availability true|false
  --check-prover-manifests true|false
  --check-runtime-prover-config true|false
  --destination-sidecar PATH
  --source-sidecar PATH
  --manifest PATH                    Alias for --destination-sidecar
  --max-age-ms MS
  --future-skew-ms MS
  --timeout-ms MS
  --output-dir DIR
  --help, -h                       Show this help without running checks

Environment:
  VITE_WALLETCONNECT_PROJECT_ID
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_BSC_ROUTE_REPORT
  SCCP_BSC_PEER_AUDIT_REPORT
  SCCP_BSC_SMOKE_READINESS_REPORT
  SCCP_BSC_MATERIAL_INVENTORY_REPORT
  SCCP_BSC_VIDEO_TRANSCRIPT
  SCCP_BSC_PRODUCTION_GATE_REFRESH
  SCCP_BSC_PRODUCTION_GATE_TIMEOUT_MS
  SCCP_TAIRA_TORII_URL
  TAIRA_TORII_URL
  E2E_TORII_URL
  SCCP_BSC_ROUTE_MANIFEST_FILE
  SCCP_ROUTE_MANIFEST_FILE
  SCCP_BSC_RPC_URL
  BSC_RPC_URL
  SCCP_BSC_PEER_AUDIT_EXPECTED_PEERS
  SCCP_BSC_PEER_AUDIT_SSH_HOST
  SCCP_BSC_PEER_AUDIT_SSH_PASSWORD
  SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE
  SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE
  SCCP_BSC_PEER_AUDIT_REMOTE_DIR
  SCCP_BSC_PEER_AUDIT_REMOTE_PEER_COUNT
  SCCP_BSC_PEER_AUDIT_SSH
  SCCP_BSC_PEER_AUDIT_SSHPASS
  SCCP_BSC_PEER_AUDIT_CONNECT_TIMEOUT_SECONDS
  SCCP_BSC_MATERIAL_SCAN_PATHS
  VITE_SCCP_BSC_PROVER_MODULE_URL
  VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_PROVER_CONFIG_URL
  VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL
  VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL
  VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL
  VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL
  SCCP_BSC_PROVER_MANIFEST_PATH
  SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH
  SCCP_BSC_PRODUCTION_GATE_MAX_AGE_MS
  SCCP_BSC_PRODUCTION_GATE_FUTURE_SKEW_MS
  SCCP_BSC_PRODUCTION_GATE_OUTPUT_DIR`);
};

const readJsonReport = async (file, label) => {
  if (!trim(file)) {
    return null;
  }
  try {
    const resolved = path.resolve(file);
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error(`${resolved} must not be a symbolic link`);
    }
    if (!info.isFile()) {
      throw new Error(`${resolved} must be a regular file`);
    }
    if (info.size > MAX_JSON_REPORT_BYTES) {
      throw new Error(
        `${resolved} is ${info.size} bytes; maximum allowed is ${MAX_JSON_REPORT_BYTES} bytes`,
      );
    }
    const report = parseJsonWithoutDuplicateKeys(
      await readFile(resolved, "utf8"),
      `${label} ${resolved}`,
    );
    if (!isRecord(report)) {
      throw new Error(`${resolved} must be a JSON object`);
    }
    return report;
  } catch (error) {
    return {
      ready: false,
      loadError:
        error instanceof Error
          ? `${label}: ${error.message}`
          : `${label}: unable to load report`,
    };
  }
};

const writeJsonReport = async (file, report) => {
  if (!trim(file)) {
    return null;
  }
  const resolved = path.resolve(file);
  return writeJsonReportFile(resolved, report);
};

const selectedReportPath = (explicitPath, defaultPath) =>
  trim(explicitPath) || trim(defaultPath);

const resolveBscSccpProductionGateReportPaths = (
  defaultReportPaths,
  bscProfile,
) => {
  const safeDefaultReportPaths = isRecord(defaultReportPaths)
    ? Object.fromEntries(
        ownRecordEntries(defaultReportPaths).filter(
          ([, value]) => value !== undefined,
        ),
      )
    : {};
  return {
    ...bscSccpProductionGateReportPaths(bscProfile.key),
    ...safeDefaultReportPaths,
  };
};

const defaultRefreshRunners = Object.freeze({
  runRoutePreflight: runBscSccpRoutePreflight,
  runPeerConfigAudit: runBscSccpPeerConfigAudit,
  runRemotePeerConfigAudit: runBscSccpRemotePeerConfigAudit,
  runSmokeReadiness: runBscSccpLiveSmokeReadiness,
  runMaterialInventory: runBscSccpProductionMaterialInventory,
});

export const refreshBscSccpProductionGateReports = async (input = {}) => {
  const routeReportPath = readOwnValue(input, "routeReportPath");
  const peerAuditReportPath = readOwnValue(input, "peerAuditReportPath");
  const smokeReadinessReportPath = readOwnValue(
    input,
    "smokeReadinessReportPath",
  );
  const materialInventoryReportPath = readOwnValue(
    input,
    "materialInventoryReportPath",
  );
  const defaultReportPaths = readOwnValue(input, "defaultReportPaths");
  const refreshRunners = readOwnValue(input, "refreshRunners") ?? {};
  const toriiUrl =
    readOwnValue(input, "toriiUrl") ??
    process.env.SCCP_TAIRA_TORII_URL ??
    process.env.TAIRA_TORII_URL ??
    process.env.E2E_TORII_URL ??
    DEFAULT_BSC_TAIRA_TORII_URL;
  const manifestFile =
    readOwnValue(input, "manifestFile") ??
    process.env.SCCP_BSC_ROUTE_MANIFEST_FILE ??
    process.env.SCCP_ROUTE_MANIFEST_FILE;
  const bscNetwork =
    readOwnValue(input, "bscNetwork") ??
    process.env.SCCP_BSC_NETWORK ??
    process.env.VITE_SCCP_BSC_NETWORK ??
    "testnet";
  const checkBscContracts = readOwnValue(input, "checkBscContracts") ?? true;
  const bscRpcUrl =
    readOwnValue(input, "bscRpcUrl") ??
    process.env.SCCP_BSC_RPC_URL ??
    process.env.BSC_RPC_URL ??
    "";
  const allowLocalRpc = readOwnValue(input, "allowLocalRpc") ?? false;
  const peerAuditDir = readOwnValue(input, "peerAuditDir") ?? "";
  const rawPeerAuditFiles = readOwnValue(input, "peerAuditFiles");
  const peerAuditFiles = Array.isArray(rawPeerAuditFiles)
    ? ownArrayValues(rawPeerAuditFiles)
    : [rawPeerAuditFiles].filter(Boolean);
  const peerAuditIncludeBackups =
    readOwnValue(input, "peerAuditIncludeBackups") ?? false;
  const peerAuditExpectedPeers =
    readOwnValue(input, "peerAuditExpectedPeers") ?? null;
  const peerAuditSshHost =
    readOwnValue(input, "peerAuditSshHost") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSH_HOST;
  const peerAuditSshPassword =
    readOwnValue(input, "peerAuditSshPassword") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD;
  const peerAuditSshPasswordFile =
    readOwnValue(input, "peerAuditSshPasswordFile") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE;
  const peerAuditSshCredsFile =
    readOwnValue(input, "peerAuditSshCredsFile") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE;
  const peerAuditRemoteDir =
    readOwnValue(input, "peerAuditRemoteDir") ??
    process.env.SCCP_BSC_PEER_AUDIT_REMOTE_DIR;
  const peerAuditRemotePeerCount = readOwnValue(
    input,
    "peerAuditRemotePeerCount",
  );
  const peerAuditSshCommand =
    readOwnValue(input, "peerAuditSshCommand") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSH ??
    "ssh";
  const peerAuditSshpassCommand =
    readOwnValue(input, "peerAuditSshpassCommand") ??
    process.env.SCCP_BSC_PEER_AUDIT_SSHPASS ??
    "sshpass";
  const peerAuditConnectTimeoutSeconds = readOwnValue(
    input,
    "peerAuditConnectTimeoutSeconds",
  );
  const materialScanPaths =
    readOwnValue(input, "materialScanPaths") ??
    process.env.SCCP_BSC_MATERIAL_SCAN_PATHS;
  const destinationProverModuleUrl = readOwnValue(
    input,
    "destinationProverModuleUrl",
  );
  const sourceProverModuleUrl = readOwnValue(input, "sourceProverModuleUrl");
  const destinationProverManifestUrl = readOwnValue(
    input,
    "destinationProverManifestUrl",
  );
  const sourceProverManifestUrl = readOwnValue(
    input,
    "sourceProverManifestUrl",
  );
  const runtimeProverConfigUrl = readOwnValue(input, "runtimeProverConfigUrl");
  const destinationSidecarPath =
    readOwnValue(input, "destinationSidecarPath") ??
    process.env.SCCP_BSC_PROVER_MANIFEST_PATH;
  const sourceSidecarPath =
    readOwnValue(input, "sourceSidecarPath") ??
    process.env.SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH;
  const walletConnectProjectId =
    readOwnValue(input, "walletConnectProjectId") ??
    process.env[WALLETCONNECT_PROJECT_ID_ENV];
  const checkModuleAvailability =
    readOwnValue(input, "checkModuleAvailability") ?? true;
  const checkProverManifests =
    readOwnValue(input, "checkProverManifests") ?? true;
  const checkRuntimeProverConfig =
    readOwnValue(input, "checkRuntimeProverConfig") ?? true;
  const fetchImpl = readOwnValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = readOwnValue(input, "timeoutMs") ?? 10_000;
  const checkedAt = readOwnValue(input, "checkedAt");
  const runners = {
    ...defaultRefreshRunners,
    ...Object.fromEntries(
      ownRecordEntries(refreshRunners).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  };
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const resolvedDefaultReportPaths = resolveBscSccpProductionGateReportPaths(
    defaultReportPaths,
    bscProfile,
  );
  const activeDestinationProverModuleUrl =
    trim(destinationProverModuleUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
      SCCP_BSC_PROVER_MODULE_URL_ENV,
    );
  const activeSourceProverModuleUrl =
    trim(sourceProverModuleUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
      SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
    );
  const activeDestinationProverManifestUrl =
    trim(destinationProverManifestUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_PROVER_MANIFEST_URL_ENV,
    );
  const activeSourceProverManifestUrl =
    trim(sourceProverManifestUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
    );
  const activeRuntimeProverConfigUrl =
    trim(runtimeProverConfigUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
      SCCP_BSC_PROVER_CONFIG_URL_ENV,
    );
  const selectedRouteReportPath = selectedReportPath(
    routeReportPath,
    resolvedDefaultReportPaths.routeReportPath,
  );
  const selectedPeerAuditReportPath = selectedReportPath(
    peerAuditReportPath,
    resolvedDefaultReportPaths.peerAuditReportPath,
  );
  const selectedSmokeReadinessReportPath = selectedReportPath(
    smokeReadinessReportPath,
    resolvedDefaultReportPaths.smokeReadinessReportPath,
  );
  const selectedMaterialInventoryReportPath = selectedReportPath(
    materialInventoryReportPath,
    resolvedDefaultReportPaths.materialInventoryReportPath,
  );
  const peerAuditFileList = Array.isArray(peerAuditFiles)
    ? peerAuditFiles
    : [peerAuditFiles].filter(Boolean);
  const useRemotePeerAudit = Boolean(
    trim(peerAuditSshHost) || trim(peerAuditSshCredsFile),
  );
  const useLocalPeerAudit = Boolean(
    trim(peerAuditDir) || peerAuditFileList.some((entry) => trim(entry)),
  );
  assertNoConflictingProductionGatePeerAuditSources({
    useLocalPeerAudit,
    useRemotePeerAudit,
  });
  if (useRemotePeerAudit) {
    assertRuntimeSshCredentialSources({
      sshHost: peerAuditSshHost,
      sshPassword: peerAuditSshPassword,
      sshPasswordFile: peerAuditSshPasswordFile,
      sshCredsFile: peerAuditSshCredsFile,
    });
  }

  const routeReport = await runners.runRoutePreflight({
    toriiUrl,
    manifestFile,
    bscNetwork: bscProfile.key,
    checkBscContracts,
    bscRpcUrl: bscRpcUrl || bscProfile.rpcUrl,
    allowLocalRpc,
    fetchImpl,
    timeoutMs,
  });
  await writeJsonReport(selectedRouteReportPath, routeReport);

  const peerAuditReportDir = selectedPeerAuditReportPath
    ? path.dirname(path.resolve(selectedPeerAuditReportPath))
    : "";
  const sanitizedStanzasDir = peerAuditReportDir
    ? path.join(peerAuditReportDir, "stanzas")
    : null;
  const useCustomPeerAuditRunner = Boolean(
    Object.prototype.hasOwnProperty.call(
      refreshRunners,
      "runPeerConfigAudit",
    ) ||
      Object.prototype.hasOwnProperty.call(
        refreshRunners,
        "runRemotePeerConfigAudit",
      ),
  );
  let peerAuditReport = await readJsonReport(
    selectedPeerAuditReportPath,
    "peer audit report",
  );
  let peerAuditRefresh = {
    mode: "preserved",
    inputSource: "existing-report",
    refreshed: false,
    reportExisted: isRecord(peerAuditReport),
    reason:
      "No local or remote peer-audit inputs were provided; the existing peer audit report was preserved.",
  };
  if (useRemotePeerAudit || useLocalPeerAudit || useCustomPeerAuditRunner) {
    peerAuditReport = useRemotePeerAudit
      ? await runners.runRemotePeerConfigAudit({
          sshHost: peerAuditSshHost,
          sshPassword: peerAuditSshPassword,
          sshPasswordFile: peerAuditSshPasswordFile,
          sshCredsFile: peerAuditSshCredsFile,
          remoteDir: peerAuditRemoteDir,
          remotePeerCount: peerAuditRemotePeerCount,
          expectedPeers: peerAuditExpectedPeers,
          bscNetwork: bscProfile.key,
          sanitizedStanzasDir,
          reportOutputDir: peerAuditReportDir || null,
          sshCommand: peerAuditSshCommand,
          sshpassCommand: peerAuditSshpassCommand,
          connectTimeoutSeconds: peerAuditConnectTimeoutSeconds,
        })
      : await runners.runPeerConfigAudit({
          dir: peerAuditDir,
          files: peerAuditFileList,
          includeBackups: peerAuditIncludeBackups === true,
          expectedPeers: peerAuditExpectedPeers,
          bscNetwork: bscProfile.key,
          sanitizedStanzasDir,
          reportOutputDir: peerAuditReportDir || null,
        });
    peerAuditRefresh = {
      mode: "regenerated",
      inputSource: useRemotePeerAudit
        ? "remote-ssh"
        : useLocalPeerAudit
          ? "local-files"
          : "custom-runner",
      refreshed: true,
      reportExisted: isRecord(peerAuditReport),
      reason:
        "Peer audit report was regenerated during production-gate refresh.",
    };
    await writeJsonReport(selectedPeerAuditReportPath, peerAuditReport);
  }

  const smokeReadinessReport = await runners.runSmokeReadiness({
    toriiUrl,
    manifestFile,
    bscNetwork: bscProfile.key,
    peerAuditReportPath: selectedPeerAuditReportPath,
    walletConnectProjectId,
    destinationProverModuleUrl: activeDestinationProverModuleUrl,
    sourceProverModuleUrl: activeSourceProverModuleUrl,
    destinationProverManifestUrl: activeDestinationProverManifestUrl,
    sourceProverManifestUrl: activeSourceProverManifestUrl,
    runtimeProverConfigUrl: activeRuntimeProverConfigUrl,
    checkBscContracts,
    bscRpcUrl: bscRpcUrl || bscProfile.rpcUrl,
    allowLocalRpc,
    checkModuleAvailability,
    checkProverManifests,
    checkRuntimeProverConfig,
    fetchImpl,
    timeoutMs,
    checkedAt,
  });
  await writeJsonReport(selectedSmokeReadinessReportPath, smokeReadinessReport);

  const materialInventoryReport = await runners.runMaterialInventory({
    scanPaths: materialScanPaths,
    routeReportPath: selectedRouteReportPath,
    bscNetwork: bscProfile.key,
    destinationModuleUrl: activeDestinationProverModuleUrl,
    sourceModuleUrl: activeSourceProverModuleUrl,
    runtimeProverConfigUrl: activeRuntimeProverConfigUrl,
    destinationSidecarPath,
    sourceSidecarPath,
    fetchImpl,
    timeoutMs,
    generatedAt: checkedAt,
  });
  await writeJsonReport(
    selectedMaterialInventoryReportPath,
    materialInventoryReport,
  );

  return {
    routeReport,
    peerAuditReport,
    peerAuditRefresh,
    smokeReadinessReport,
    materialInventoryReport,
    paths: {
      routeReportPath: selectedRouteReportPath,
      peerAuditReportPath: selectedPeerAuditReportPath,
      smokeReadinessReportPath: selectedSmokeReadinessReportPath,
      materialInventoryReportPath: selectedMaterialInventoryReportPath,
    },
  };
};

const isWithinPath = (candidate, base) =>
  candidate === base || candidate.startsWith(`${base}${path.sep}`);

const unsafeRelativeEvidencePath = (value) => {
  const source = trim(value);
  if (!source) {
    return true;
  }
  if (
    source.includes("\0") ||
    path.isAbsolute(source) ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source) ||
    /[?#]/u.test(source) ||
    source.includes("\\")
  ) {
    return true;
  }
  let decoded = source;
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return true;
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  if (decoded !== source) {
    return true;
  }
  const segments = source.split("/");
  return (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  );
};

const candidateBaseDirs = (reportDir) => {
  const dirs = [repoRoot];
  if (trim(reportDir)) {
    dirs.push(path.resolve(reportDir));
  }
  return [...new Set(dirs)];
};

const allowedEvidenceRealDirs = async (reportDir) => {
  if (!trim(reportDir)) {
    return [];
  }
  const resolvedReportDir = path.resolve(reportDir);
  const dirs = [
    resolvedReportDir,
    path.resolve(resolvedReportDir, "..", "stanzas"),
  ];
  const realDirs = [];
  for (const dir of dirs) {
    try {
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        continue;
      }
      realDirs.push(await realpath(dir));
    } catch {
      // Missing optional evidence directories are handled by file readback.
    }
  }
  return [...new Set(realDirs)];
};

const readSafeRelativeEvidenceFile = async (source, reportDir) => {
  if (unsafeRelativeEvidencePath(source)) {
    return { ok: false, error: "has unsafe path" };
  }
  const allowedRealDirs = await allowedEvidenceRealDirs(reportDir);
  let missing = false;
  for (const base of candidateBaseDirs(reportDir)) {
    const resolved = path.resolve(base, source);
    if (!isWithinPath(resolved, base)) {
      continue;
    }
    try {
      const info = await lstat(resolved);
      if (info.isSymbolicLink()) {
        return { ok: false, error: "must not be a symbolic link" };
      }
      if (!info.isFile()) {
        return { ok: false, error: "must be a regular file" };
      }
      if (info.size > SCCP_BSC_SANITIZED_STANZA_MAX_BYTES) {
        return {
          ok: false,
          error: `is ${info.size} bytes; maximum allowed is ${SCCP_BSC_SANITIZED_STANZA_MAX_BYTES} bytes`,
        };
      }
      const [baseRealPath, resolvedRealPath] = await Promise.all([
        realpath(base),
        realpath(resolved),
      ]);
      if (
        !isWithinPath(resolvedRealPath, baseRealPath) ||
        (allowedRealDirs.length > 0 &&
          !allowedRealDirs.some((dir) => isWithinPath(resolvedRealPath, dir)))
      ) {
        return { ok: false, error: "has unsafe path" };
      }
      return { ok: true, bytes: await readFile(resolvedRealPath) };
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        missing = true;
        continue;
      }
      return { ok: false, error: "could not be read" };
    }
  }
  return { ok: false, error: missing ? "is missing" : "has unsafe path" };
};

const sanitizedPeerStanzaContentProblem = (bytes, source) => {
  const text = Buffer.from(bytes).toString("utf8");
  if (secretLikeText(text)) {
    return "contains secret-like material";
  }
  let stanzas;
  try {
    stanzas = parseSccpRouteManifestStanzas(
      text,
      trim(source) || "sanitized peer stanza file",
    );
  } catch {
    return "is malformed SCCP route TOML";
  }
  if (!stanzas.length) {
    return "does not contain SCCP route stanza evidence";
  }
  let hasBscXorRoute = false;
  for (const stanza of stanzas) {
    if (!isRecord(stanza)) {
      continue;
    }
    const forbiddenAliases = Object.keys(stanza).filter((key) =>
      FORBIDDEN_BSC_SANITIZED_STANZA_ALIASES.has(key),
    );
    if (forbiddenAliases.length > 0) {
      return `contains forbidden TRON aliases for BSC evidence: ${forbiddenAliases.join(", ")}`;
    }
    const unsupportedKeys = Object.keys(stanza).filter(
      (key) => !key.startsWith("__") && !SAFE_ROUTE_STANZA_KEYS.has(key),
    );
    if (unsupportedKeys.length > 0) {
      return `contains unsupported sanitized route field ${publicUnsupportedFieldName(unsupportedKeys[0])}`;
    }
    if (
      readString(stanza, "route_id", "routeId") === SCCP_BSC_XOR_ROUTE_ID &&
      readString(stanza, "asset_key", "assetKey") === SCCP_BSC_XOR_ASSET_KEY
    ) {
      hasBscXorRoute = true;
    }
  }
  if (!hasBscXorRoute) {
    return "does not contain taira_bsc_xor/xor route stanza evidence";
  }
  return "";
};

const verifyPeerAuditSanitizedStanzaFiles = async (peerAuditReport, file) => {
  if (!isRecord(peerAuditReport) || !trim(file)) {
    return peerAuditReport;
  }
  const reportDir = path.dirname(path.resolve(file));
  const peers = await Promise.all(
    (Array.isArray(peerAuditReport.peers) ? peerAuditReport.peers : []).map(
      async (peer) => {
        if (!isRecord(peer)) {
          return peer;
        }
        const source =
          readString(peer, "sanitizedStanzaSource") ||
          readString(peer, "sanitizedStanzaPath") ||
          readString(peer, "source");
        const expectedSha256 = normalizeHex(
          readString(peer, "sanitizedStanzaSha256"),
        );
        const base = {
          ...peer,
          sanitizedStanzaFileChecked: true,
        };
        if (!NON_ZERO_HEX32_PATTERN.test(expectedSha256)) {
          return {
            ...base,
            sanitizedStanzaFileVerified: false,
            sanitizedStanzaFileVerificationError: "has invalid expected hash",
          };
        }
        const result = await readSafeRelativeEvidenceFile(source, reportDir);
        if (!result.ok) {
          return {
            ...base,
            sanitizedStanzaFileVerified: false,
            sanitizedStanzaFileVerificationError: result.error,
          };
        }
        const actualSha256 = `0x${createHash("sha256")
          .update(result.bytes)
          .digest("hex")}`;
        const hashMatches = actualSha256 === expectedSha256;
        if (!hashMatches) {
          return {
            ...base,
            sanitizedStanzaFileSha256: actualSha256,
            sanitizedStanzaFileVerified: false,
            sanitizedStanzaFileVerificationError: "hash mismatched",
          };
        }
        const contentProblem = sanitizedPeerStanzaContentProblem(
          result.bytes,
          source,
        );
        return {
          ...base,
          sanitizedStanzaFileSha256: actualSha256,
          sanitizedStanzaFileVerified: !contentProblem,
          ...(contentProblem
            ? { sanitizedStanzaFileVerificationError: contentProblem }
            : {}),
        };
      },
    ),
  );
  const sanitizedStanzaFilesChecked =
    peers.some(isRecord) &&
    peers.every(
      (peer) =>
        !isRecord(peer) || readBoolean(peer, "sanitizedStanzaFileChecked"),
    );
  return {
    ...peerAuditReport,
    sanitizedStanzaFilesChecked,
    peers,
  };
};

const maxProofArtifactBytesForMedia = (mediaType) => {
  if (mediaType === "video/webm") {
    return MAX_VIDEO_ARTIFACT_BYTES;
  }
  if (mediaType === "image/png") {
    return MAX_SCREENSHOT_ARTIFACT_BYTES;
  }
  return Math.max(MAX_VIDEO_ARTIFACT_BYTES, MAX_SCREENSHOT_ARTIFACT_BYTES);
};

const minProofArtifactBytesForMedia = (mediaType) => {
  if (mediaType === "video/webm") {
    return MIN_VIDEO_ARTIFACT_BYTES;
  }
  if (mediaType === "image/png") {
    return MIN_SCREENSHOT_ARTIFACT_BYTES;
  }
  return 1;
};

const proofFileEntryReverified = (entry, extensionPattern, mediaType) =>
  isRecord(entry) &&
  readString(entry, "status") === "captured" &&
  readBoolean(entry, "fileVerified") === true &&
  readBoolean(entry, "fileReverified") === true &&
  proofArtifactRelativePathIsSafe(
    readString(entry, "relativePath"),
    extensionPattern,
  ) &&
  readString(entry, "mediaType") === mediaType &&
  Number.isSafeInteger(readNumber(entry, "sizeBytes")) &&
  readNumber(entry, "sizeBytes") >= minProofArtifactBytesForMedia(mediaType) &&
  readNumber(entry, "sizeBytes") <= maxProofArtifactBytesForMedia(mediaType) &&
  typeof readOwnValue(entry, "sha256") === "string" &&
  NON_ZERO_SHA256_PATTERN.test(readOwnValue(entry, "sha256"));

const proofFileEntriesHaveUniquePublicEvidence = (entries) => {
  const seenPaths = new Set();
  const seenHashes = new Set();
  for (const entry of entries) {
    const relativePath = normalizedProofArtifactRelativePath(
      readString(entry, "relativePath"),
    );
    if (relativePath) {
      if (seenPaths.has(relativePath)) {
        return false;
      }
      seenPaths.add(relativePath);
    }
    const sha256 = readString(entry, "sha256");
    if (sha256) {
      if (seenHashes.has(sha256)) {
        return false;
      }
      seenHashes.add(sha256);
    }
  }
  return true;
};

const videoTranscriptProofFilesReverified = (videoTranscript) => {
  if (!isRecord(videoTranscript)) {
    return false;
  }
  const videoArtifacts =
    readOwnArrayValues(videoTranscript, "videoArtifacts") ?? [];
  const explorerScreenshots =
    readOwnArrayValues(videoTranscript, "explorerScreenshots") ?? [];
  const videoArtifactReverified = videoArtifacts.some((artifact) =>
    proofFileEntryReverified(artifact, /\.webm$/iu, "video/webm"),
  );
  const screenshotFilesReverified =
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.every((slot) =>
      explorerScreenshots.some(
        (screenshot) =>
          isRecord(screenshot) &&
          readString(screenshot, "kind") === slot &&
          proofFileEntryReverified(screenshot, /\.png$/iu, "image/png"),
      ),
    );
  const reverifiedScreenshots = REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map(
    (slot) =>
      explorerScreenshots.find(
        (screenshot) =>
          isRecord(screenshot) &&
          readString(screenshot, "kind") === slot &&
          proofFileEntryReverified(screenshot, /\.png$/iu, "image/png"),
      ),
  ).filter(isRecord);
  return (
    videoArtifactReverified &&
    screenshotFilesReverified &&
    proofFileEntriesHaveUniquePublicEvidence([
      ...videoArtifacts.filter((artifact) =>
        proofFileEntryReverified(artifact, /\.webm$/iu, "video/webm"),
      ),
      ...reverifiedScreenshots,
    ])
  );
};

const verifyProofFileEntries = async (
  entries,
  transcriptDir,
  extensionPattern,
  expectedMediaType,
) =>
  Promise.all(
    (Array.isArray(entries) ? ownArrayValues(entries) : []).map(
      async (entry) => {
        if (!isRecord(entry)) {
          return entry;
        }
        const safeEntry = ownJsonRecord(entry) ?? {};
        const relativePath = readString(entry, "relativePath");
        if (!proofArtifactRelativePathIsSafe(relativePath, extensionPattern)) {
          return {
            ...safeEntry,
            fileVerified: false,
            fileReverified: false,
            fileVerificationError: "has unsafe path",
          };
        }
        try {
          const proofPath = path.resolve(transcriptDir, relativePath);
          const info = await lstat(proofPath);
          if (info.isSymbolicLink()) {
            return {
              ...safeEntry,
              fileVerified: false,
              fileReverified: false,
              fileVerificationError: "must not be a symbolic link",
            };
          }
          if (!info.isFile()) {
            return {
              ...safeEntry,
              fileVerified: false,
              fileReverified: false,
              fileVerificationError: "must be a regular file",
            };
          }
          const maxBytes = maxProofArtifactBytesForMedia(expectedMediaType);
          const minBytes = minProofArtifactBytesForMedia(expectedMediaType);
          if (info.size < minBytes) {
            return {
              ...safeEntry,
              sizeBytes: info.size,
              fileVerified: false,
              fileReverified: false,
              fileVerificationError: `is ${info.size} bytes; minimum required is ${minBytes} bytes`,
            };
          }
          if (info.size > maxBytes) {
            return {
              ...safeEntry,
              sizeBytes: info.size,
              fileVerified: false,
              fileReverified: false,
              fileVerificationError: `is ${info.size} bytes; maximum allowed is ${maxBytes} bytes`,
            };
          }
          const [baseRealPath, proofRealPath] = await Promise.all([
            realpath(transcriptDir),
            realpath(proofPath),
          ]);
          if (!isWithinPath(proofRealPath, baseRealPath)) {
            return {
              ...safeEntry,
              fileVerified: false,
              fileReverified: false,
              fileVerificationError: "has unsafe path",
            };
          }
          const bytes = await readFile(proofRealPath);
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const mediaType = detectProofArtifactMediaType(bytes);
          const screenshotDimensionError =
            expectedMediaType === "image/png" && mediaType === "image/png"
              ? pngScreenshotDimensionError(bytes)
              : "";
          const declaredMediaType = readString(entry, "mediaType");
          const mediaTypeMatches =
            Boolean(declaredMediaType) &&
            (!expectedMediaType || mediaType === expectedMediaType) &&
            declaredMediaType === mediaType &&
            !screenshotDimensionError;
          const fileVerified =
            readString(entry, "status") === "captured" &&
            bytes.length === readNumber(entry, "sizeBytes") &&
            sha256 === readString(entry, "sha256") &&
            mediaTypeMatches;
          const fileVerificationError = !declaredMediaType
            ? "declared mediaType is missing"
            : !mediaTypeMatches
              ? screenshotDimensionError ||
                `expected ${expectedMediaType || "known proof artifact"} media, got ${mediaType}`
              : "size or hash mismatched";
          return {
            ...safeEntry,
            sizeBytes: bytes.length,
            sha256,
            mediaType,
            fileVerified,
            fileReverified: fileVerified,
            ...(fileVerified ? {} : { fileVerificationError }),
          };
        } catch (error) {
          return {
            ...safeEntry,
            fileVerified: false,
            fileReverified: false,
            fileVerificationError:
              error instanceof Error ? error.message : String(error),
          };
        }
      },
    ),
  );

const verifyVideoProofOutputDirBinding = async (
  videoTranscript,
  transcriptDir,
) => {
  const outputDir = readString(videoTranscript, "outputDir");
  if (outputDir === "external-proof-output") {
    return { ok: true, external: true };
  }
  if (!videoProofOutputDirIsSafe(outputDir)) {
    return {
      ok: false,
      detail: "video proof transcript outputDir is missing or not portable.",
    };
  }
  try {
    const declaredDir = path.resolve(repoRoot, outputDir);
    const resolvedTranscriptDir = path.resolve(transcriptDir);
    const [declaredInfo, transcriptInfo] = await Promise.all([
      lstat(declaredDir),
      lstat(resolvedTranscriptDir),
    ]);
    if (declaredInfo.isSymbolicLink() || transcriptInfo.isSymbolicLink()) {
      return {
        ok: false,
        detail:
          "video proof transcript outputDir and transcript directory must not be symbolic links.",
      };
    }
    if (!declaredInfo.isDirectory() || !transcriptInfo.isDirectory()) {
      return {
        ok: false,
        detail:
          "video proof transcript outputDir does not resolve to a proof directory.",
      };
    }
    const [declaredRealDir, transcriptRealDir] = await Promise.all([
      realpath(declaredDir),
      realpath(resolvedTranscriptDir),
    ]);
    if (declaredRealDir !== transcriptRealDir) {
      return {
        ok: false,
        detail:
          "video proof transcript outputDir does not match the transcript directory.",
      };
    }
    return { ok: true, external: false };
  } catch {
    return {
      ok: false,
      detail:
        "video proof transcript outputDir does not resolve to the transcript directory.",
    };
  }
};

const verifyVideoTranscriptProofFiles = async (videoTranscript, file) => {
  if (!isRecord(videoTranscript) || !trim(file)) {
    return videoTranscript;
  }
  const transcriptDir = path.dirname(path.resolve(file));
  const outputDirBinding = await verifyVideoProofOutputDirBinding(
    videoTranscript,
    transcriptDir,
  );
  const safeTranscript = ownJsonRecord(videoTranscript) ?? {};
  const verifiedTranscript = {
    ...safeTranscript,
    videoArtifacts: await verifyProofFileEntries(
      readArray(videoTranscript, "videoArtifacts"),
      transcriptDir,
      /\.webm$/iu,
      "video/webm",
    ),
    explorerScreenshots: await verifyProofFileEntries(
      readArray(videoTranscript, "explorerScreenshots"),
      transcriptDir,
      /\.png$/iu,
      "image/png",
    ),
  };
  verifiedTranscript.proofFilesReverified =
    outputDirBinding.ok === true &&
    videoTranscriptProofFilesReverified(verifiedTranscript);
  Object.defineProperty(verifiedTranscript, REVERIFIED_VIDEO_PROOF_FILES, {
    value: true,
    enumerable: false,
  });
  Object.defineProperty(
    verifiedTranscript,
    REVERIFIED_VIDEO_PROOF_OUTPUT_DIR_BINDING,
    {
      value: outputDirBinding,
      enumerable: false,
    },
  );
  return verifiedTranscript;
};

export const runBscSccpProductionGate = async (input = {}) => {
  const routeReportPath = readOwnValue(input, "routeReportPath");
  const peerAuditReportPath = readOwnValue(input, "peerAuditReportPath");
  const smokeReadinessReportPath = readOwnValue(
    input,
    "smokeReadinessReportPath",
  );
  const materialInventoryReportPath = readOwnValue(
    input,
    "materialInventoryReportPath",
  );
  const videoTranscriptPath = readOwnValue(input, "videoTranscriptPath");
  const defaultReportPaths = readOwnValue(input, "defaultReportPaths");
  const refreshReports = readOwnValue(input, "refreshReports") ?? false;
  const refreshRunners = readOwnValue(input, "refreshRunners");
  const toriiUrl = readOwnValue(input, "toriiUrl");
  const manifestFile = readOwnValue(input, "manifestFile");
  const bscNetwork =
    readOwnValue(input, "bscNetwork") ??
    process.env.SCCP_BSC_NETWORK ??
    process.env.VITE_SCCP_BSC_NETWORK ??
    "testnet";
  const checkBscContracts = readOwnValue(input, "checkBscContracts");
  const bscRpcUrl = readOwnValue(input, "bscRpcUrl");
  const allowLocalRpc = readOwnValue(input, "allowLocalRpc");
  const peerAuditDir = readOwnValue(input, "peerAuditDir");
  const peerAuditFiles = readOwnValue(input, "peerAuditFiles");
  const peerAuditIncludeBackups = readOwnValue(
    input,
    "peerAuditIncludeBackups",
  );
  const peerAuditExpectedPeers = readOwnValue(input, "peerAuditExpectedPeers");
  const peerAuditSshHost = readOwnValue(input, "peerAuditSshHost");
  const peerAuditSshPassword = readOwnValue(input, "peerAuditSshPassword");
  const peerAuditSshPasswordFile = readOwnValue(
    input,
    "peerAuditSshPasswordFile",
  );
  const peerAuditSshCredsFile = readOwnValue(input, "peerAuditSshCredsFile");
  const peerAuditRemoteDir = readOwnValue(input, "peerAuditRemoteDir");
  const peerAuditRemotePeerCount = readOwnValue(
    input,
    "peerAuditRemotePeerCount",
  );
  const peerAuditSshCommand = readOwnValue(input, "peerAuditSshCommand");
  const peerAuditSshpassCommand = readOwnValue(
    input,
    "peerAuditSshpassCommand",
  );
  const peerAuditConnectTimeoutSeconds = readOwnValue(
    input,
    "peerAuditConnectTimeoutSeconds",
  );
  const materialScanPaths = readOwnValue(input, "materialScanPaths");
  const destinationProverModuleUrl = readOwnValue(
    input,
    "destinationProverModuleUrl",
  );
  const sourceProverModuleUrl = readOwnValue(input, "sourceProverModuleUrl");
  const destinationProverManifestUrl = readOwnValue(
    input,
    "destinationProverManifestUrl",
  );
  const sourceProverManifestUrl = readOwnValue(
    input,
    "sourceProverManifestUrl",
  );
  const runtimeProverConfigUrl = readOwnValue(input, "runtimeProverConfigUrl");
  const destinationSidecarPath = readOwnValue(input, "destinationSidecarPath");
  const sourceSidecarPath = readOwnValue(input, "sourceSidecarPath");
  const walletConnectProjectId = readOwnValue(input, "walletConnectProjectId");
  const checkModuleAvailability = readOwnValue(
    input,
    "checkModuleAvailability",
  );
  const checkProverManifests = readOwnValue(input, "checkProverManifests");
  const checkRuntimeProverConfig = readOwnValue(
    input,
    "checkRuntimeProverConfig",
  );
  const fetchImpl = readOwnValue(input, "fetchImpl");
  const timeoutMs = readOwnValue(input, "timeoutMs");
  const checkedAt = readOwnValue(input, "checkedAt");
  const maxReportAgeMs = readOwnValue(input, "maxReportAgeMs");
  const futureSkewMs = readOwnValue(input, "futureSkewMs");
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const resolvedDefaultReportPaths = resolveBscSccpProductionGateReportPaths(
    defaultReportPaths,
    bscProfile,
  );
  let refreshResult = null;
  if (refreshReports) {
    refreshResult = await refreshBscSccpProductionGateReports({
      routeReportPath,
      peerAuditReportPath,
      smokeReadinessReportPath,
      materialInventoryReportPath,
      defaultReportPaths: resolvedDefaultReportPaths,
      refreshRunners,
      toriiUrl,
      manifestFile,
      bscNetwork: bscProfile.key,
      checkBscContracts,
      bscRpcUrl,
      allowLocalRpc,
      peerAuditDir,
      peerAuditFiles,
      peerAuditIncludeBackups,
      peerAuditExpectedPeers,
      peerAuditSshHost,
      peerAuditSshPassword,
      peerAuditSshPasswordFile,
      peerAuditSshCredsFile,
      peerAuditRemoteDir,
      peerAuditRemotePeerCount,
      peerAuditSshCommand,
      peerAuditSshpassCommand,
      peerAuditConnectTimeoutSeconds,
      materialScanPaths,
      destinationProverModuleUrl,
      sourceProverModuleUrl,
      destinationProverManifestUrl,
      sourceProverManifestUrl,
      runtimeProverConfigUrl,
      destinationSidecarPath,
      sourceSidecarPath,
      walletConnectProjectId,
      checkModuleAvailability,
      checkProverManifests,
      checkRuntimeProverConfig,
      fetchImpl,
      timeoutMs,
      checkedAt,
    });
  }

  const selectedRouteReportPath = selectedReportPath(
    routeReportPath,
    resolvedDefaultReportPaths.routeReportPath,
  );
  const selectedPeerAuditReportPath = selectedReportPath(
    peerAuditReportPath,
    resolvedDefaultReportPaths.peerAuditReportPath,
  );
  const selectedSmokeReadinessReportPath = selectedReportPath(
    smokeReadinessReportPath,
    resolvedDefaultReportPaths.smokeReadinessReportPath,
  );
  const selectedMaterialInventoryReportPath = selectedReportPath(
    materialInventoryReportPath,
    resolvedDefaultReportPaths.materialInventoryReportPath,
  );
  const selectedVideoTranscriptPath = selectedReportPath(
    videoTranscriptPath,
    resolvedDefaultReportPaths.videoTranscriptPath,
  );
  return evaluateBscSccpProductionGate({
    routeReport: await readJsonReport(selectedRouteReportPath, "route report"),
    bscNetwork: bscProfile.key,
    peerAuditReport: await verifyPeerAuditSanitizedStanzaFiles(
      await readJsonReport(selectedPeerAuditReportPath, "peer audit report"),
      selectedPeerAuditReportPath,
    ),
    smokeReadinessReport: await readJsonReport(
      selectedSmokeReadinessReportPath,
      "smoke-readiness report",
    ),
    materialInventoryReport: await readJsonReport(
      selectedMaterialInventoryReportPath,
      "production material inventory report",
    ),
    videoTranscript: await verifyVideoTranscriptProofFiles(
      await readJsonReport(selectedVideoTranscriptPath, "video transcript"),
      selectedVideoTranscriptPath,
    ),
    peerAuditRefresh: refreshResult?.peerAuditRefresh,
    checkedAt,
    maxReportAgeMs,
    futureSkewMs,
    requireReverifiedVideoProofFiles: true,
  });
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertBscProductionGateCliAliasConflicts(args);
  const bscNetwork =
    args["bsc-network"] ||
    process.env.SCCP_BSC_NETWORK ||
    process.env.VITE_SCCP_BSC_NETWORK ||
    "testnet";
  const refreshReports = resolveBscSccpProductionGateRefreshReports({
    argRefresh: args.refresh,
    envRefresh: process.env.SCCP_BSC_PRODUCTION_GATE_REFRESH,
  });
  const timeoutMs = parsePositiveInteger(
    args["timeout-ms"] || process.env.SCCP_BSC_PRODUCTION_GATE_TIMEOUT_MS,
    10_000,
  );
  const report = await runBscSccpProductionGate({
    routeReportPath: args["route-report"] || process.env.SCCP_BSC_ROUTE_REPORT,
    peerAuditReportPath:
      args["peer-audit-report"] || process.env.SCCP_BSC_PEER_AUDIT_REPORT,
    smokeReadinessReportPath:
      args["smoke-readiness-report"] ||
      process.env.SCCP_BSC_SMOKE_READINESS_REPORT,
    materialInventoryReportPath:
      args["material-inventory-report"] ||
      process.env.SCCP_BSC_MATERIAL_INVENTORY_REPORT,
    videoTranscriptPath:
      args["video-transcript"] || process.env.SCCP_BSC_VIDEO_TRANSCRIPT,
    refreshReports,
    toriiUrl:
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      process.env.TAIRA_TORII_URL ||
      process.env.E2E_TORII_URL ||
      DEFAULT_BSC_TAIRA_TORII_URL,
    manifestFile:
      args["manifest-file"] ||
      process.env.SCCP_BSC_ROUTE_MANIFEST_FILE ||
      process.env.SCCP_ROUTE_MANIFEST_FILE,
    bscNetwork,
    checkBscContracts:
      args["check-bsc-contracts"] === undefined
        ? true
        : parseBoolean(args["check-bsc-contracts"], "--check-bsc-contracts"),
    bscRpcUrl:
      args["bsc-rpc-url"] ||
      process.env.SCCP_BSC_RPC_URL ||
      process.env.BSC_RPC_URL ||
      "",
    allowLocalRpc: parseBoolean(args["allow-local-rpc"], "--allow-local-rpc"),
    peerAuditDir: args["peer-audit-dir"] || args.dir,
    peerAuditFiles: args["peer-audit-file"] || args.file,
    peerAuditIncludeBackups: parseBoolean(
      args["include-peer-backups"],
      "--include-peer-backups",
    ),
    peerAuditExpectedPeers: parsePositiveInteger(
      args["expected-peers"] || process.env.SCCP_BSC_PEER_AUDIT_EXPECTED_PEERS,
      null,
    ),
    peerAuditSshHost:
      args["peer-audit-ssh-host"] || process.env.SCCP_BSC_PEER_AUDIT_SSH_HOST,
    peerAuditSshPassword: process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD,
    peerAuditSshPasswordFile:
      args["peer-audit-ssh-password-file"] ||
      process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE,
    peerAuditSshCredsFile:
      args["peer-audit-ssh-creds-file"] ||
      process.env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE,
    peerAuditRemoteDir:
      args["peer-audit-remote-dir"] ||
      process.env.SCCP_BSC_PEER_AUDIT_REMOTE_DIR,
    peerAuditRemotePeerCount: parsePositiveInteger(
      args["peer-audit-remote-peer-count"] ||
        process.env.SCCP_BSC_PEER_AUDIT_REMOTE_PEER_COUNT,
      null,
    ),
    peerAuditSshCommand:
      args["peer-audit-ssh-command"] || process.env.SCCP_BSC_PEER_AUDIT_SSH,
    peerAuditSshpassCommand:
      args["peer-audit-sshpass-command"] ||
      process.env.SCCP_BSC_PEER_AUDIT_SSHPASS,
    peerAuditConnectTimeoutSeconds: parsePositiveInteger(
      args["peer-audit-ssh-connect-timeout-seconds"] ||
        process.env.SCCP_BSC_PEER_AUDIT_CONNECT_TIMEOUT_SECONDS,
      null,
    ),
    materialScanPaths:
      args["material-scan-path"] ||
      args["artifact-dir"] ||
      process.env.SCCP_BSC_MATERIAL_SCAN_PATHS,
    destinationProverModuleUrl:
      args["destination-prover-module-url"] || args["module-url"] || undefined,
    sourceProverModuleUrl: args["source-prover-module-url"] || undefined,
    destinationProverManifestUrl:
      args["destination-prover-manifest-url"] || undefined,
    sourceProverManifestUrl: args["source-prover-manifest-url"] || undefined,
    runtimeProverConfigUrl:
      args["runtime-prover-config-url"] ||
      args["prover-config-url"] ||
      undefined,
    destinationSidecarPath:
      args["destination-sidecar"] ||
      args.manifest ||
      process.env.SCCP_BSC_PROVER_MANIFEST_PATH,
    sourceSidecarPath:
      args["source-sidecar"] ||
      process.env.SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH,
    walletConnectProjectId:
      args["walletconnect-project-id"] ||
      process.env[WALLETCONNECT_PROJECT_ID_ENV],
    checkModuleAvailability:
      args["check-module-availability"] === undefined
        ? true
        : parseBoolean(
            args["check-module-availability"],
            "--check-module-availability",
          ),
    checkProverManifests:
      args["check-prover-manifests"] === undefined
        ? true
        : parseBoolean(
            args["check-prover-manifests"],
            "--check-prover-manifests",
          ),
    checkRuntimeProverConfig:
      args["check-runtime-prover-config"] === undefined
        ? true
        : parseBoolean(
            args["check-runtime-prover-config"],
            "--check-runtime-prover-config",
          ),
    timeoutMs,
    maxReportAgeMs: parsePositiveInteger(
      args["max-age-ms"] || process.env.SCCP_BSC_PRODUCTION_GATE_MAX_AGE_MS,
      DEFAULT_MAX_REPORT_AGE_MS,
    ),
    futureSkewMs: parsePositiveInteger(
      args["future-skew-ms"] ||
        process.env.SCCP_BSC_PRODUCTION_GATE_FUTURE_SKEW_MS,
      DEFAULT_FUTURE_SKEW_MS,
    ),
  });
  const outputDir = path.resolve(
    repoRoot,
    trim(
      args["output-dir"] || process.env.SCCP_BSC_PRODUCTION_GATE_OUTPUT_DIR,
    ) || bscSccpProductionGateOutputDir(bscNetwork),
  );
  const reportPath = path.join(outputDir, "latest.json");
  await writeJsonReportFile(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nBSC SCCP production gate report: ${reportPath}`);
  if (!report.ready) {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

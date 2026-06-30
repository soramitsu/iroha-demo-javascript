#!/usr/bin/env node
/* global BigInt, globalThis */
import {
  createHash,
  createPublicKey,
  verify as verifyDetachedSignature,
} from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  bscDestinationBindingHash,
  bscDestinationBindingKey,
} from "./sccp-bsc-route-manifest.mjs";
import {
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
  verifyBscMainnetNativeEvmProverArtifactsFromBundle,
  verifyBscTestnetNativeEvmProverArtifactsFromBundle,
} from "@iroha/iroha-js/sccp";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  bscBurnRecordProductionArtifactProblems,
  canonicalBscNativeEvmProverBundleHash,
  isKnownDiagnosticBscVerifierKeyHash,
  requiredBscRouteCheckIds,
  resolveBscNetworkProfile,
  SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  parseJsonWithoutDuplicateKeys,
} from "./sccp-bsc-route-preflight.mjs";
import {
  SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES,
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  assertBscSccpBrowserProverModuleExports,
  deriveBscRuntimeProverConfigUrl,
  readBscProfileEnv,
  SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
  validateBscSccpBrowserProverManifest,
  validateBscSccpBrowserProverModuleBytes,
} from "./sccp-bsc-live-smoke-readiness.mjs";
import {
  SCCP_BSC_RUNTIME_NATIVE_ARTIFACT_MAX_BYTES,
  SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES,
  validateBscSccpRuntimeProverConfig,
} from "./sccp-bsc-runtime-prover-config.mjs";
import { normalizeSccpBrowserModuleUrl } from "./sccp-live-smoke-readiness.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const irohaRoot = path.resolve(repoRoot, "../iroha");
const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-bsc-production-material-inventory",
);
export const bscSccpProductionMaterialInventoryOutputDir = (
  bscNetwork = "testnet",
) => path.join(DEFAULT_OUTPUT_DIR, resolveBscNetworkProfile(bscNetwork).key);
export const bscSccpProductionMaterialInventoryRouteReportPath = (
  bscNetwork = "testnet",
) =>
  path.join(
    repoRoot,
    "output/sccp-bsc-preflight",
    resolveBscNetworkProfile(bscNetwork).key,
    "latest.json",
  );
const COMMON_BSC_PRODUCTION_MATERIAL_SCAN_PATHS = Object.freeze([
  path.join(irohaRoot, "artifacts/sccp-bsc/contracts"),
  path.join(repoRoot, "public/sccp-bsc"),
]);
const BSC_PRODUCTION_MATERIAL_CURATED_IROHA_SCAN_PATHS = Object.freeze({
  testnet: Object.freeze([
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/bsc-testnet-native-evm-prover-bundle.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/cross-sdk-parity.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/dotnet-implementation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/java-android-implementation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/javascript-implementation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/kotlin-implementation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/swift-implementation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/no-wasm-no-remote-scan.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/native-prover-self-test.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/source-parity-attestation.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/sccp-bsc-full-message-v1.r1cs",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/sccp-bsc-full-message-v1.final.zkey",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/testnet-bsc-groth16-material.manifest.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/native-prover/testnet/testnet-bsc-groth16-proof-self-test.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/taira-bsc-xor-production-requirements.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/taira-bsc-xor-route.full-taira-config.evidence.json",
    ),
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/taira-bsc-xor-route.manifest.json",
    ),
  ]),
  mainnet: Object.freeze([
    path.join(
      irohaRoot,
      "artifacts/sccp-bsc/taira-bsc-mainnet-xor-production-requirements.json",
    ),
  ]),
});
const BSC_PRODUCTION_MATERIAL_NATIVE_OUTPUT_SCAN_PATHS = Object.freeze({
  testnet: Object.freeze([
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-verifier-key.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-material.manifest.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-attestation-request.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-attestation-handoff.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/semantic-sccp-circuit-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/circuit-security-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/trusted-setup-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/reproducible-build-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/trusted-setup-transcript.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/reproducible-build-transcript.with-toolchain-hashes.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-proof-self-test.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/sccp-bsc-full-message-v1.r1cs",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/testnet-full/sccp-bsc-full-message-v1.final.zkey",
    ),
  ]),
  mainnet: Object.freeze([
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-verifier-key.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-material.manifest.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-attestation-request.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-attestation-handoff.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/semantic-sccp-circuit-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/circuit-security-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/trusted-setup-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/reproducible-build-attestation.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/trusted-setup-transcript.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/reproducible-build-transcript.with-toolchain-hashes.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-proof-self-test.json",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/sccp-bsc-full-message-v1.r1cs",
    ),
    path.join(
      irohaRoot,
      "output/sccp-bsc-production/groth16-material/mainnet-full/sccp-bsc-full-message-v1.final.zkey",
    ),
  ]),
});
const BSC_PRODUCTION_MATERIAL_DEPLOY_SCAN_PATHS = Object.freeze({
  testnet: Object.freeze([
    path.join(
      repoRoot,
      "output/sccp-bsc-production/taira-bsc-xor-burn-record.production-ready.contract.json",
    ),
  ]),
  mainnet: Object.freeze([
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.manifest.draft.json",
    ),
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.manifest.production-ready.json",
    ),
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.production-ready.route-only.toml",
    ),
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.production-ready.torii.toml",
    ),
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.full-taira-config.evidence.json",
    ),
    path.join(
      repoRoot,
      "output/sccp-bsc-deploy/taira-bsc-mainnet-xor-deployment.evidence.json",
    ),
  ]),
});
const BSC_ROUTE_MANIFEST_PUBLICATION_SEARCH_DIRS = Object.freeze({
  testnet: Object.freeze([path.join(repoRoot, "output/sccp-bsc-production")]),
  mainnet: Object.freeze([
    path.join(repoRoot, "output/sccp-bsc-deploy"),
    path.join(repoRoot, "output/sccp-bsc-production"),
  ]),
});
const BSC_ROUTE_MANIFEST_PUBLICATION_FILE_PATTERNS = Object.freeze({
  testnet: /^taira-bsc-xor-route(?:\.[^.][\w.-]*)?\.upsert-isi\.json$/u,
  mainnet: /^taira-bsc-mainnet-xor-route(?:\.[^.][\w.-]*)?\.upsert-isi\.json$/u,
});
export const bscSccpProductionMaterialScanPaths = (bscNetwork = "testnet") => {
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  return Object.freeze([
    ...COMMON_BSC_PRODUCTION_MATERIAL_SCAN_PATHS,
    ...BSC_PRODUCTION_MATERIAL_CURATED_IROHA_SCAN_PATHS[bscProfile.key],
    ...BSC_PRODUCTION_MATERIAL_NATIVE_OUTPUT_SCAN_PATHS[bscProfile.key],
    ...BSC_PRODUCTION_MATERIAL_DEPLOY_SCAN_PATHS[bscProfile.key],
  ]);
};
export const DEFAULT_BSC_PRODUCTION_MATERIAL_SCAN_PATHS = Object.freeze([
  ...bscSccpProductionMaterialScanPaths("testnet"),
]);
const DEFAULT_NATIVE_EVM_PROVER_ARTIFACT_ROOTS = Object.freeze([
  path.join(irohaRoot, "artifacts/sccp-bsc/native-prover"),
  path.join(repoRoot, "output/sccp-bsc-production/native-prover"),
  path.join(repoRoot, "public/sccp-bsc/native-prover"),
]);
const INVENTORY_SCHEMA = "iroha-demo-sccp-bsc-production-material-inventory/v1";
const PRODUCTION_REQUIREMENTS_SCHEMA =
  "iroha-sccp-bsc-taira-xor-production-requirements/v1";
const PRODUCTION_REQUIREMENTS_CONTRACT_SCHEMA =
  "iroha-demo-sccp-bsc-production-requirements-contract/v1";
const SOURCE_PARITY_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-native-evm-source-parity-attestation/v1";
const BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA =
  "iroha-sccp-bsc-groth16-material-manifest/v1";
const BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-semantic-circuit-attestation/v1";
const BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-circuit-security-attestation/v1";
const BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-trusted-setup-attestation/v1";
const BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-reproducible-build-attestation/v1";
const BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-signature/v1";
const BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-request-package/v1";
const BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-handoff/v1";
const BSC_GROTH16_PROOF_SELF_TEST_SCHEMA =
  "iroha-sccp-bsc-groth16-proof-self-test/v1";
const BSC_GROTH16_TRUSTED_SETUP_TRANSCRIPT_SCHEMA =
  "iroha-sccp-bsc-trusted-setup-transcript/v1";
const BSC_GROTH16_REPRODUCIBLE_BUILD_TRANSCRIPT_SCHEMA =
  "iroha-sccp-bsc-reproducible-build-transcript/v1";
const BSC_GROTH16_ATTESTATION_SCHEMAS = new Set([
  BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA,
  BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA,
  BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA,
  BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA,
]);
const BSC_GROTH16_TRANSCRIPT_SCHEMAS = new Set([
  BSC_GROTH16_TRUSTED_SETUP_TRANSCRIPT_SCHEMA,
  BSC_GROTH16_REPRODUCIBLE_BUILD_TRANSCRIPT_SCHEMA,
]);
const BSC_DEPLOYMENT_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-taira-xor-deployment-evidence/v1";
const OFFLINE_FULL_TOML_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1";
const TAIRA_BURN_RECORD_CONTRACT_SCHEMA =
  "iroha-sccp-taira-xor-burn-record-contract/v1";
const BSC_ROUTE_MANIFEST_ISI_SCHEMA = "iroha-sccp-route-manifest-isi/v1";
const BSC_DEPLOYMENT_READBACK_FIELDS = Object.freeze(
  new Set([
    "chainIdHex",
    "codePresent",
    "codeHashes",
    "code_hashes",
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
    "bridge_source_domain",
    "bridgeTargetDomain",
    "bridge_target_domain",
  ]),
);
const BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS = Object.freeze(
  new Set(["token", "bridge", "sourceBridge", "verifier"]),
);
const REQUIRED_BSC_DEPLOYMENT_POST_DEPLOY_CHECKLIST = Object.freeze([
  "TairaXOR.bridge() equals bscBridgeAddress",
  "TairaXOR.bridgeLocked() is true",
  "SccpBscSourceBridge.owner() equals bscBridgeAddress",
  "TairaXorBscSccpBridge.destinationBindingHash() equals destinationRollout.destinationBindingHash",
  "TairaXorBscSccpBridge.verifier() equals bscVerifierAddress",
  "TairaXorBscSccpBridge verifier code/key hashes and domains match destinationRollout",
  "compiledContractCodeHashes match live bscContractReadback.codeHashes",
]);
const BSC_DEPLOYMENT_EVIDENCE_TOP_LEVEL_FIELDS = Object.freeze(
  new Set([
    "schema",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "bscNetwork",
    "bsc_network",
    "network",
    "chain",
    "chainIdHex",
    "chain_id_hex",
    "networkIdHex",
    "network_id_hex",
    "bscBridgeAddress",
    "bsc_bridge_address",
    "tairaXorBridgeAddress",
    "taira_xor_bridge_address",
    "bridgeAddress",
    "bridge_address",
    "bscTokenAddress",
    "bsc_token_address",
    "tairaXorTokenAddress",
    "taira_xor_token_address",
    "tokenAddress",
    "token_address",
    "sccpBscSourceBridgeAddress",
    "sccp_bsc_source_bridge_address",
    "bscSourceBridgeAddress",
    "bsc_source_bridge_address",
    "sourceBridgeAddress",
    "source_bridge_address",
    "bscVerifierAddress",
    "bsc_verifier_address",
    "destinationVerifierAddress",
    "destination_verifier_address",
    "verifierAddress",
    "verifier_address",
    "verifierCodeHash",
    "verifier_code_hash",
    "verifierKeyHash",
    "verifier_key_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "destinationBindingKey",
    "destination_binding_key",
    "destinationRollout",
    "destination_rollout",
    "destinationBinding",
    "destination_binding",
    "compiledContractCodeHashes",
    "compiled_contract_code_hashes",
    "bscContractReadback",
    "bsc_contract_readback",
    "postDeployChecklist",
    "post_deploy_checklist",
  ]),
);
const BSC_DEPLOYMENT_ROLLOUT_FIELDS = Object.freeze(
  new Set([
    "version",
    "destinationNetworkId",
    "destination_network_id",
    "sourceDomain",
    "source_domain",
    "targetDomain",
    "target_domain",
    "verifierIdentity",
    "verifier_identity",
    "verifierBackend",
    "verifier_backend",
    "proofFamily",
    "proof_family",
    "verifierCodeHash",
    "verifier_code_hash",
    "verifierKeyHash",
    "verifier_key_hash",
    "destinationBridgeAddress",
    "destination_bridge_address",
    "destinationBindingHash",
    "destination_binding_hash",
    "destinationBindingKey",
    "destination_binding_key",
  ]),
);
const BSC_DEPLOYMENT_BINDING_FIELDS = Object.freeze(
  new Set([
    "version",
    "sourceDomain",
    "source_domain",
    "targetDomain",
    "target_domain",
    "networkIdHex",
    "network_id_hex",
    "key",
    "destinationBindingKey",
    "destination_binding_key",
    "bindingHash",
    "binding_hash",
  ]),
);
const LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA =
  "iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1";
const NATIVE_EVM_PROVER_BUNDLE_SCHEMA =
  "sccp-native-evm-groth16-prover-bundle-v1";
const BSC_EVM_GROTH16_BACKEND = "evm-groth16-bn254-v1";
const BSC_FULL_SCCP_CIRCUIT_PROFILE = "sccp-bsc-full-message-v1";
const PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS = 4096;
const BSC_GROTH16_ALLOWED_R1CS_INFO_SOURCES = new Set([
  "snarkjs-cli",
  "binary-header-fallback",
]);
const BSC_GROTH16_PUBLIC_SIGNAL_NAMES = Object.freeze([
  "message_id",
  "payload_hash",
  "target_domain",
  "commitment_root",
  "finality_height",
  "finality_block_hash",
  "source_domain",
  "statement_hash",
  "destination_binding_hash",
]);
const BSC_GROTH16_REQUIRED_ATTESTATIONS = Object.freeze([
  Object.freeze([
    "semanticSccpCircuit",
    BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA,
    "semantic SCCP circuit",
  ]),
  Object.freeze([
    "circuitSecurity",
    BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA,
    "circuit security",
  ]),
  Object.freeze([
    "trustedSetup",
    BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA,
    "trusted setup",
  ]),
  Object.freeze([
    "reproducibleBuild",
    BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA,
    "reproducible build",
  ]),
]);
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
const SOURCE_PARITY_SDK_FILE_MARKERS_BY_PROFILE = Object.freeze({
  testnet: Object.freeze({
    javascript: Object.freeze({
      "javascript/iroha_js/src/sccp.js": Object.freeze([
        "export function buildBscTestnetSccpLocalAdmissionSubmission",
        "SCCP_LOCAL_ADMISSION_ENVELOPE_ENCODING_V1",
        "SCCP_LOCAL_ADMISSION_SUBMISSION_KIND_V1",
        "SCCP_LOCAL_ADMISSION_ENTRYPOINT_V1",
      ]),
      "javascript/iroha_js/test/sccpBscMainnet.test.js": Object.freeze([
        "buildBscTestnetSccpLocalAdmissionSubmission(input)",
        "new BscTestnetSccp().buildLocalAdmissionSubmission(input)",
        "localAdmission.proofBytes",
      ]),
    }),
    swift: Object.freeze({
      "IrohaSwift/Sources/IrohaSwift/SccpEvmProver.swift": Object.freeze([
        "BscTestnetLocalAdmissionSubmissionInput",
        "buildBscTestnetSccpLocalAdmissionSubmission",
        "public final class BscTestnetSccp",
        "public func buildLocalAdmissionSubmission",
      ]),
      "IrohaSwift/Tests/IrohaSwiftTests/SccpSolanaProverTests.swift":
        Object.freeze([
          "testBscTestnetSccpBuildsLocalAdmissionSubmission",
          "XCTAssertThrowsError",
          "stark-fri-v1",
        ]),
    }),
    kotlin: Object.freeze({
      "kotlin/core-jvm/src/main/java/org/hyperledger/iroha/sdk/sccp/EvmSccpProver.kt":
        Object.freeze([
          "BscTestnetLocalAdmissionSubmissionInput",
          "fun buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ]),
      "kotlin/core-jvm/src/test/kotlin/org/hyperledger/iroha/sdk/sccp/EvmSccpProverTest.kt":
        Object.freeze([
          "bscTestnetFacadeBuildsLocalAdmissionSubmission",
          "assertFailsWith<IllegalArgumentException>",
          "evm-groth16-bn254-v1",
        ]),
    }),
    "java-android": Object.freeze({
      "java/iroha_android/src/main/java/org/hyperledger/iroha/android/sccp/BscTestnetSccpProver.java":
        Object.freeze([
          "LocalAdmissionSubmissionInput",
          "buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ]),
      "java/iroha_android/src/test/java/org/hyperledger/iroha/android/sccp/EvmSccpProverTests.java":
        Object.freeze([
          "bscTestnetFacadeBuildsLocalAdmissionSubmission",
          "catch (final IllegalArgumentException ex)",
          "evm-groth16-bn254-v1",
        ]),
    }),
    dotnet: Object.freeze({
      "csharp/src/Hyperledger.Iroha.Sdk/Sccp/BscTestnetSccp.cs": Object.freeze([
        "BscTestnetLocalAdmissionSubmissionInput",
        "BuildLocalAdmissionSubmission",
        "LocalAdmissionEnvelopeEncoding",
      ]),
      "csharp/tests/Hyperledger.Iroha.Sdk.Tests/SccpBscTestnetTests.cs":
        Object.freeze([
          "LocalAdmissionSubmissionWrapsNativeBscTestnetOutput",
          "Assert.Throws<ArgumentException>",
          "EvmGroth16Bn254ProofBackend",
        ]),
    }),
  }),
  mainnet: Object.freeze({
    javascript: Object.freeze({
      "javascript/iroha_js/src/sccp.js": Object.freeze([
        "export function buildBscMainnetSccpLocalAdmissionSubmission",
        "SCCP_LOCAL_ADMISSION_ENVELOPE_ENCODING_V1",
        "SCCP_LOCAL_ADMISSION_SUBMISSION_KIND_V1",
        "SCCP_LOCAL_ADMISSION_ENTRYPOINT_V1",
      ]),
      "javascript/iroha_js/test/sccpBscMainnet.test.js": Object.freeze([
        "buildBscMainnetSccpLocalAdmissionSubmission(input)",
        "const facadeSubmission = new BscMainnetSccp().buildLocalAdmissionSubmission(",
        "localAdmission.proofBytes",
      ]),
    }),
    swift: Object.freeze({
      "IrohaSwift/Sources/IrohaSwift/SccpEvmProver.swift": Object.freeze([
        "BscMainnetLocalAdmissionSubmissionInput",
        "buildBscMainnetSccpLocalAdmissionSubmission",
        "public final class BscMainnetSccp",
        "public func buildLocalAdmissionSubmission",
      ]),
      "IrohaSwift/Tests/IrohaSwiftTests/SccpSolanaProverTests.swift":
        Object.freeze([
          "testBscMainnetSccpBuildsLocalAdmissionSubmission",
          "XCTAssertThrowsError",
          "stark-fri-v1",
        ]),
    }),
    kotlin: Object.freeze({
      "kotlin/core-jvm/src/main/java/org/hyperledger/iroha/sdk/sccp/EvmSccpProver.kt":
        Object.freeze([
          "BscMainnetLocalAdmissionSubmissionInput",
          "fun buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ]),
      "kotlin/core-jvm/src/test/kotlin/org/hyperledger/iroha/sdk/sccp/EvmSccpProverTest.kt":
        Object.freeze([
          "bscMainnetFacadeBuildsLocalAdmissionSubmission",
          "assertFailsWith<IllegalArgumentException>",
          "evm-groth16-bn254-v1",
        ]),
    }),
    "java-android": Object.freeze({
      "java/iroha_android/src/main/java/org/hyperledger/iroha/android/sccp/BscMainnetSccp.java":
        Object.freeze([
          "LocalAdmissionSubmissionInput",
          "buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ]),
      "java/iroha_android/src/test/java/org/hyperledger/iroha/android/sccp/EvmSccpProverTests.java":
        Object.freeze([
          "bscMainnetFacadeBuildsLocalAdmissionSubmission",
          "catch (final IllegalArgumentException ex)",
          "evm-groth16-bn254-v1",
        ]),
    }),
    dotnet: Object.freeze({
      "csharp/src/Hyperledger.Iroha.Sdk/Sccp/BscMainnetSccp.cs": Object.freeze([
        "BscMainnetLocalAdmissionSubmissionInput",
        "BuildLocalAdmissionSubmission",
        "LocalAdmissionEnvelopeEncoding",
      ]),
      "csharp/tests/Hyperledger.Iroha.Sdk.Tests/SccpBscMainnetTests.cs":
        Object.freeze([
          "LocalAdmissionSubmissionWrapsNativeBscOutput",
          "Assert.Throws<ArgumentException>",
          "EvmGroth16Bn254ProofBackend",
        ]),
    }),
  }),
});
const SCCP_PROOF_FAMILY_STARK_FRI = "stark-fri-v1";
const SCCP_DOMAIN_SORA = 0;
const SCCP_DOMAIN_BSC = 2;
const BSC_COMPILED_CONTRACT_ARTIFACTS = Object.freeze({
  verifier: "SccpGroth16Bn254MessageVerifier",
  sourceBridge: "SccpBscSourceBridge",
  token: "TairaXOR",
  bridge: "TairaXorBscSccpBridge",
});
const BSC_NATIVE_EVM_PROVER_SUPPORT_SCHEMAS = new Set([
  "sccp-bsc-testnet-native-evm-cross-sdk-parity-v1",
  "sccp-bsc-testnet-native-evm-prover-self-test-v1",
  "sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1",
  "sccp-bsc-mainnet-native-evm-prover-self-test-v1",
]);
const BSC_NATIVE_EVM_PROVER_PARITY_SCHEMAS = Object.freeze({
  testnet: Object.freeze({
    production: "sccp-bsc-testnet-native-evm-cross-sdk-parity-v1",
    legacyFixture: "sccp-bsc-testnet-native-evm-cross-sdk-fixture-parity-v1",
  }),
  mainnet: Object.freeze({
    production: "sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1",
    legacyFixture: "sccp-bsc-mainnet-native-evm-cross-sdk-fixture-parity-v1",
  }),
});
const MAX_SCAN_FILES = 2_000;
const TEXT_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const SCCP_BSC_MATERIAL_ROUTE_REPORT_MAX_BYTES = 4 * 1024 * 1024;
export const SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES =
  SCCP_BSC_RUNTIME_NATIVE_ARTIFACT_MAX_BYTES;
const MIN_PRODUCTION_PROOF_FILE_BYTES = 64 * 1024;
export const SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_PRODUCTION_PROOF_FILE_UNIQUE_BYTES = 16;
const MAX_PRODUCTION_PROOF_FILE_REPEATED_PATTERN_BYTES = 64;
const MAX_PRODUCTION_PROOF_FILE_DOMINANT_BYTE_FRACTION = 0.98;
export const SCCP_BSC_NATIVE_PROVER_ARTIFACT_MAX_BYTES =
  SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES;
const NON_ZERO_HEX32 = /^0x(?!0{64}$)[0-9a-f]{64}$/iu;
const TAIRA_ASSET_DEFINITION_ID =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{16,80}$/u;
const DECIMAL_WORD = /^(?:0|[1-9]\d*)$/u;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/iu;
const REPEATED_BYTE_EVM_ADDRESS_PATTERN = /^0x([0-9a-f]{2})\1{19}$/iu;
const ROLE_SEPARATED_PRODUCTION_HASH_FIELDS = Object.freeze([
  "verifierCodeHash",
  "verifierKeyHash",
  "destinationBindingHash",
  "proofArtifactHash",
  "provingKeyHash",
  "groth16ProofSelfTestHash",
  "nativeEvmProverBundleHash",
]);
const NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS = Object.freeze([
  "verifierKeyHash",
  "verifierKeyArtifactHash",
  "destinationBindingHash",
  "proofArtifactHash",
  "provingKeyHash",
  "groth16ProofSelfTestHash",
  "nativeEvmProverBundleHash",
]);
const NATIVE_EVM_PROVER_AUDIT_HASH_FIELDS = Object.freeze([
  "circuit_security_audit",
  "native_implementation_audit",
  "reproducible_build_attestation",
  "cross_sdk_parity",
  "native_prover_self_test",
  "no_wasm_no_remote_scan",
]);
const REQUIRED_PRODUCTION_REQUIREMENT_REPORTS = Object.freeze([
  "route-preflight",
  "peer-config-audit",
  "smoke-readiness",
  "production-material-inventory",
  "live-ui-video-proof",
]);
const REQUIRED_PRODUCTION_REQUIREMENT_STATIC_INPUT_IDS = Object.freeze([
  "production-groth16-verifier-key-json",
  "production-route-manifest",
  "destination-browser-prover-manifest",
  "source-browser-prover-manifest",
  "taira-burn-record-contract",
  "canonical-settlement-asset-definition-id",
  "post-deploy-live-evidence",
  "deployed-taira-base-config",
  "offline-full-toml-evidence",
  "native-prover-snarkjs-verifier",
  "groth16-circom-compiler",
  "native-prover-artifact-root",
  "burn-record-proof-artifact",
  "burn-record-proving-key",
  "groth16-powers-of-tau",
  "groth16-witness-wasm",
  "groth16-material-manifest",
  "candidate-groth16-material-manifest",
  "groth16-attestation-request-package",
  "signed-groth16-role-attestations",
  "groth16-proof-self-test-report",
  "trusted-groth16-attestation-signer",
  "trusted-setup-transcript",
  "reproducible-build-transcript",
  "semantic-sccp-circuit-attestation",
  "trusted-setup-ceremony-attestation",
  "reproducible-groth16-build-attestation",
  "cross-sdk-parity-report",
  "native-prover-self-test-report",
  "source-parity-attestation",
  "javascript-sdk-implementation",
  "swift-sdk-implementation",
  "kotlin-sdk-implementation",
  "java-android-sdk-implementation",
  "dotnet-sdk-implementation",
  "audit-circuit-security",
  "audit-native-implementation",
  "audit-reproducible-build",
  "audit-no-wasm-no-remote-scan",
  "taira-route-manifest-manager",
]);
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const SECRET_FILE_NAME_PATTERN =
  /(?:^|[._-])(?:private|secret|mnemonic|seed|password)(?:[._-]|$)|\.env$/iu;
const PRODUCTION_PLACEHOLDER_PATTERN =
  /(?:change[-_ ]?me|changeme|dummy|example|mock|placeholder|replace[-_ ]?me|sample|stub|test[-_ ]?only|fixture[-_ ]?only|todo|your[-_ ]?[a-z0-9_-]*)/iu;
const DIAGNOSTIC_KEY_PATTERN =
  /(?:diagnostic|change[-_ ]?me|changeme|dummy|mock|placeholder|replace[-_ ]?me|sample|stub|test[-_ ]?only|fixture[-_ ]?only|todo|your[-_ ]?[a-z0-9_-]*)/iu;
const PRODUCTION_PLACEHOLDER_PATH_PATTERN =
  /(?:^|[\\/._-])(?:change[-_ ]?me|changeme|dummy|example|mock|placeholder|replace[-_ ]?me|sample|stub|test[-_ ]?only|todo|your[-_ ]?[a-z0-9_-]*)(?:[\\/._-]|$)/iu;
const PRODUCTION_PLACEHOLDER_STATUS_KEYS = new Set([
  "productionPlaceholderFree",
  "production_placeholder_free",
  "placeholderMaterial",
  "placeholder_material",
  "unresolvedPlaceholders",
  "unresolved_placeholders",
]);
const REPEATED_BYTE_HEX32_PATTERN = /^0x([0-9a-f]{2})\1{31}$/iu;
const ROUTE_FILE_PATTERN = /taira[-_]bsc[-_]xor|sccp[-_]bsc|bsc[-_]sccp/iu;
const RELEVANT_FILE_PATTERN =
  /\.(?:json|toml|js|mjs|wasm|r1cs|zkey|pk|vk|bin|dat)$/iu;
const PROOF_ARTIFACT_FILE_PATTERN = /\.(?:r1cs|bin|dat)$/iu;
const PROVING_KEY_FILE_PATTERN = /\.(?:zkey|pk)$/iu;
const REDACTED_SECRET_LIKE_ARTIFACT_PATH =
  "[redacted secret-like artifact path]";
export const GENERATED_NON_PRODUCTION_DIR_PATTERN =
  /^sccp-bsc-material-inventory-(?:test|off-curve|off-twist|vk-parent)-/iu;
const FORBIDDEN_BSC_ROUTE_DEPLOYMENT_ALIASES = Object.freeze({
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
const BSC_EXPLORER_URL_KEYS = Object.freeze([
  "explorerUrl",
  "explorer_url",
  "bscExplorerUrl",
  "bsc_explorer_url",
]);
const BSC_EXPLORER_HOST_KEYS = Object.freeze([
  "explorerHost",
  "explorer_host",
  "bscExplorerHost",
  "bsc_explorer_host",
]);
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
const VERIFIER_G2_BETA_ALIASES = Object.freeze([
  "beta2",
  "configuredBeta2",
  "vk_beta_2",
]);
const VERIFIER_G2_GAMMA_ALIASES = Object.freeze([
  "gamma2",
  "configuredGamma2",
  "vk_gamma_2",
]);
const VERIFIER_G2_DELTA_ALIASES = Object.freeze([
  "delta2",
  "configuredDelta2",
  "vk_delta_2",
]);
const VERIFIER_G2_MATERIAL_ALIASES = Object.freeze(
  [
    ["beta2", VERIFIER_G2_BETA_ALIASES],
    ["gamma2", VERIFIER_G2_GAMMA_ALIASES],
    ["delta2", VERIFIER_G2_DELTA_ALIASES],
  ].map(([label, aliases]) => Object.freeze({ label, aliases })),
);
const VERIFIER_G1_ALPHA_ALIASES = Object.freeze([
  "alpha1",
  "configuredAlpha1",
  "vk_alpha_1",
]);
const VERIFIER_G1_IC_ALIASES = Object.freeze([
  "ic",
  "IC",
  "configuredIc",
  "vk_ic",
]);

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
const ownValue = (record, key) => {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
};
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9]\d*)$/u;
const ownArrayValues = (value) => {
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
    .map(([, descriptor]) => descriptor.value);
};
const boundedProblemSummary = (values, limit = 6) => {
  const items = [
    ...new Set(values.map((value) => trim(value)).filter(Boolean)),
  ];
  if (items.length === 0) {
    return "";
  }
  const overflow =
    items.length > limit ? `; +${items.length - limit} more` : "";
  return `${items.slice(0, limit).join("; ")}${overflow}`;
};
const ownArrayIndexedValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => JSON_ARRAY_INDEX_PATTERN.test(key))
    .map((key) => [Number(key), Object.getOwnPropertyDescriptor(value, key)])
    .filter(
      ([index]) =>
        Number.isSafeInteger(index) && index >= 0 && index < value.length,
    )
    .sort(([left], [right]) => left - right)
    .map(([index, descriptor]) => [
      index,
      descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
        ? descriptor.value
        : undefined,
    ]);
};
const ownRecordEntries = (record) =>
  isRecord(record)
    ? Object.keys(record).map((key) => [key, ownValue(record, key)])
    : [];
const stableJsonValue = (value) => {
  if (Array.isArray(value)) {
    return ownArrayValues(value).map((entry) => stableJsonValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      ownRecordEntries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
};
const stableJsonString = (value) => JSON.stringify(stableJsonValue(value));
const ownJsonValue = (value, seen = new WeakMap()) => {
  if (value === null) {
    return null;
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return value;
  }
  if (valueType === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (valueType !== "object") {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const length = Number.isSafeInteger(descriptors.length?.value)
      ? descriptors.length.value
      : 0;
    const clone = new Array(length);
    seen.set(value, clone);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        key === "length" ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        !JSON_ARRAY_INDEX_PATTERN.test(key)
      ) {
        continue;
      }
      const index = Number(key);
      if (index >= length) {
        continue;
      }
      clone[index] = ownJsonValue(descriptor.value, seen);
    }
    return clone;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const clone = {};
  seen.set(value, clone);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      continue;
    }
    const child = ownJsonValue(descriptor.value, seen);
    if (child !== undefined) {
      clone[key] = child;
    }
  }
  return clone;
};
const ownJsonRecord = (value) => {
  const normalized = ownJsonValue(value);
  return isRecord(normalized) ? normalized : {};
};
const parseList = (value) =>
  (Array.isArray(value) ? ownArrayValues(value) : [value])
    .flatMap((entry) => trim(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
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
const normalizeHex32 = (value) => {
  const normalized = trim(value).toLowerCase();
  return NON_ZERO_HEX32.test(normalized) ? normalized : null;
};
const normalizeTransactionHash = (value) => {
  const normalized = trim(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalizeHex32(
    normalized.startsWith("0x") ? normalized : `0x${normalized}`,
  );
};
const normalizeCanonicalTairaAssetDefinitionId = (value) => {
  const normalized = trim(value);
  return TAIRA_ASSET_DEFINITION_ID.test(normalized) ? normalized : null;
};
const isSafeEvidenceHttpUrl = (value) => {
  try {
    const parsed = new URL(trim(value));
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.protocol === "https:") {
      return true;
    }
    return (
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
};
const normalizeOptionalPrefixHex32 = (value) => {
  const normalized = trim(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalizeHex32(
    normalized.startsWith("0x") ? normalized : `0x${normalized}`,
  );
};
const normalizeEvmAddress = (value) => {
  const normalized = trim(value).toLowerCase();
  return EVM_ADDRESS.test(normalized) && !/^0x0{40}$/iu.test(normalized)
    ? normalized
    : null;
};
const normalizeBscNetworkLabel = (value) => {
  const normalized = trim(value).toLowerCase().replace(/_/gu, "-");
  if (["testnet", "bsc-testnet", "chapel", "bsc-chapel"].includes(normalized)) {
    return "bsc-testnet";
  }
  if (["mainnet", "bsc-mainnet", "bsc"].includes(normalized)) {
    return "bsc-mainnet";
  }
  return normalized || null;
};
const normalizeBscExplorerBaseUrl = (value) => {
  const raw = trim(value).replace(/\/+$/u, "");
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  ) {
    return null;
  }
  return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}`;
};
const normalizeBscExplorerHost = (value) => {
  const normalized = trim(value).toLowerCase();
  if (!normalized || normalized.includes("://") || /[/?#@]/u.test(normalized)) {
    return null;
  }
  let url;
  try {
    url = new URL(`https://${normalized}`);
  } catch (_error) {
    return null;
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url.host.toLowerCase();
};
const requiredRouteCheckIds = requiredBscRouteCheckIds;
const routeReportHasPassedCheck = (routeReport, id) => {
  const checks = ownValue(routeReport, "checks");
  return (
    Array.isArray(checks) &&
    ownArrayValues(checks).some(
      (entry) =>
        isRecord(entry) &&
        trim(ownValue(entry, "id")) === id &&
        (ownValue(entry, "ok") === true ||
          trim(ownValue(entry, "status")).toLowerCase() === "pass"),
    )
  );
};
const routeReportCheckIntegrityProblems = (routeReport) => {
  const checks = ownValue(routeReport, "checks");
  if (!Array.isArray(checks)) {
    return ["route report checks are missing or invalid."];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of ownArrayIndexedValues(checks)) {
    if (!isRecord(entry)) {
      problems.push(`route report check ${index} is not an object.`);
      continue;
    }
    const id = trim(ownValue(entry, "id"));
    const label = id || `index ${index}`;
    if (!id) {
      problems.push(`route report check ${index} id is missing.`);
    } else if (seen.has(id)) {
      problems.push(`route report check id ${id} is duplicated.`);
    } else {
      seen.add(id);
    }
    const ok = ownValue(entry, "ok");
    const hasOk = typeof ok === "boolean";
    const status = trim(ownValue(entry, "status")).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `route report check ${label} has no machine-readable pass/fail state.`,
      );
    }
    if (hasOk && hasStatus && ok !== (status === "pass")) {
      problems.push(`route report check ${label} has contradictory ok/status.`);
    }
  }
  return problems;
};
const sha256Bytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const publicPath = (filePath) => {
  const resolved = path.resolve(filePath);
  const roots = [
    [repoRoot, "."],
    [irohaRoot, "../iroha"],
  ];
  for (const [root, label] of roots) {
    const relative = path.relative(root, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return `${label}/${relative}`.replace(/\\/gu, "/");
    }
    if (!relative) {
      return label;
    }
  }
  return path.basename(resolved);
};

const reportPathForArtifact = (filePath) =>
  SECRET_FILE_NAME_PATTERN.test(path.basename(filePath))
    ? REDACTED_SECRET_LIKE_ARTIFACT_PATH
    : publicPath(filePath);

const isPathInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
};

const uniqueResolvedPaths = (paths) => {
  const seen = new Set();
  const out = [];
  for (const filePath of paths) {
    const resolved = path.resolve(filePath);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  }
  return out;
};

const check = (checks, id, ok, message, detail = "") => {
  checks.push({
    id,
    ok: Boolean(ok),
    message,
    ...(!ok && detail ? { detail } : {}),
  });
};

const materialInventoryAction = ({
  id,
  title,
  detail,
  requiredInputs = [],
  blockedByCheckIds = [],
  commands = [],
}) =>
  Object.freeze({
    id,
    title,
    detail,
    requiredInputs: Object.freeze(requiredInputs.map(Object.freeze)),
    blockedByCheckIds: Object.freeze(blockedByCheckIds),
    commands: Object.freeze(commands),
  });

const MATERIAL_INVENTORY_NEXT_ACTIONS = Object.freeze([
  materialInventoryAction({
    id: "publish-production-route-artifacts",
    title: "Publish production route artifacts",
    detail:
      "Publish the production-ready route manifest, route-only TOML, TAIRA overlay, and generated offline full-TOML evidence for the selected BSC network.",
    requiredInputs: [
      {
        id: "production-route-manifest",
        kind: "file",
        placeholder: "<production-route.manifest.json>",
        description:
          "Production route manifest bound to deployed BSC contracts, TAIRA burn-record material, and post-deploy evidence.",
      },
      {
        id: "production-route-overlay",
        kind: "file",
        placeholder: "<production-route.production-ready.torii.toml>",
        description:
          "TAIRA route overlay generated from the production route manifest.",
      },
      {
        id: "offline-full-toml-evidence",
        kind: "file",
        placeholder: "<offline-full-toml-evidence.json>",
        description:
          "Generated offline full-TOML evidence whose hash is published by public route and peer evidence.",
      },
      {
        id: "route-manifest-publication-isi",
        kind: "file",
        placeholder: "<route-manifest.upsert-isi.json>",
        description:
          "Applied TAIRA UpsertSccpRouteManifest publication artifact for the selected BSC route.",
      },
      {
        id: "{bscNetwork}-bsc-deployment-evidence",
        kind: "file",
        placeholder: "<{bscNetwork}-deployment-evidence.json>",
        description:
          "Selected-network BSC deployment evidence from production contracts and live readback.",
      },
      {
        id: "taira-burn-record-contract",
        kind: "file",
        placeholder: "<taira-burn-record.contract.json>",
        description:
          "Compiled TAIRA burn-record IVM contract material for the BSC route manifest.",
      },
      {
        id: "canonical-settlement-asset-definition-id",
        kind: "asset-definition-id",
        placeholder: "<canonical-asset-definition-id>",
        description:
          "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
      },
      {
        id: "burn-record-proof-artifact",
        kind: "file",
        placeholder: "<relative-circuit.r1cs>",
        description:
          "Production burn-record proof artifact whose hash is published by the route manifest.",
      },
      {
        id: "burn-record-proving-key",
        kind: "file",
        placeholder: "<relative-circuit.zkey>",
        description:
          "Production burn-record proving key whose hash is published by the route manifest.",
      },
      {
        id: "native-evm-prover-bundle",
        kind: "file",
        placeholder: "<native-evm-prover-bundle.json>",
        description:
          "SDK-validated native EVM prover bundle bound to the selected BSC route.",
      },
      {
        id: "post-deploy-live-evidence",
        kind: "file",
        placeholder: "<post-deploy-live-evidence.json>",
        description:
          "Live source-event, route-canary, and BSC readback evidence for the production route manifest.",
      },
      {
        id: "deployed-taira-base-config",
        kind: "file",
        placeholder: "<deployed-taira-config.toml>",
        description:
          "Current deployed TAIRA base config used to generate the production route overlay.",
      },
    ],
    blockedByCheckIds: [
      "scan-root-availability",
      "deployment-evidence-artifact",
      "production-route-artifact",
      "offline-full-toml-evidence-artifact",
      "route-manifest-publication-evidence",
      "production-burn-record-material",
    ],
    commands: [
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --bsc-network {bscNetwork} --evidence <{bscNetwork}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --full-toml-ready true --offline-full-toml-evidence <offline-full-toml-evidence.json> --production-ready true --live-readback-checked true {routeManifestConfirmationArgs} --out <production-route.manifest.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest <production-route.manifest.json> --base-config <deployed-taira-config.toml> --out <production-route.production-ready.torii.toml> --write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id> --out <route-manifest.upsert-isi.json>",
      "npm run e2e:sccp:bsc-material-inventory -- --bsc-network {bscNetwork}",
    ],
  }),
  materialInventoryAction({
    id: "publish-production-proof-material",
    title: "Publish production proof material",
    detail:
      "Publish route-bound production verifier material, proof artifact, proving key, and SDK-validated native EVM prover bundle.",
    requiredInputs: [
      {
        id: "native-prover-artifact-root",
        kind: "directory",
        placeholder: "<native-prover-artifact-root>",
        description:
          "Canonical artifact root containing native EVM prover inputs and implementation evidence.",
      },
      {
        id: "native-prover-snarkjs-verifier",
        kind: "tool",
        placeholder: "<snarkjs>",
        description:
          "SnarkJS executable used for material verification and the proof self-test.",
      },
      {
        id: "groth16-circom-compiler",
        kind: "tool",
        placeholder: "<circom>",
        description:
          "Circom executable fingerprinted into reproducible-build evidence.",
      },
      {
        id: "production-groth16-verifier-key-json",
        kind: "file",
        placeholder: "<production-verifier-key.json>",
        description:
          "Production BN254 Groth16 verifier key JSON whose hash is not denylisted.",
      },
      {
        id: "burn-record-proof-artifact",
        kind: "file",
        placeholder: "<relative-circuit.r1cs>",
        description:
          "Production burn-record proof artifact referenced by the native prover bundle.",
      },
      {
        id: "burn-record-proving-key",
        kind: "file",
        placeholder: "<relative-circuit.zkey>",
        description:
          "Production burn-record proving key referenced by the native prover bundle.",
      },
      {
        id: "groth16-powers-of-tau",
        kind: "file",
        placeholder: "<powersOfTau28_hez_final_22.ptau>",
        description:
          "Powers-of-Tau transcript used by SnarkJS zkey verification.",
      },
      {
        id: "groth16-witness-wasm",
        kind: "file",
        placeholder: "<production-circuit.wasm>",
        description:
          "Witness WASM bound into the Groth16 material and proof self-test reports.",
      },
      {
        id: "groth16-material-manifest",
        kind: "file",
        placeholder: "<relative-groth16-material-manifest.json>",
        description:
          "ProductionReady Groth16 material manifest generated by groth16-material finalize-attestations and bound to the circuit, proving key, verifier key, signed attestations, and trust policy.",
      },
      {
        id: "candidate-groth16-material-manifest",
        kind: "file",
        placeholder: "<candidate-groth16-material.manifest.json>",
        description:
          "Candidate Groth16 material manifest emitted by materialize before signatures; the attestation request must bind this exact manifest hash.",
      },
      {
        id: "groth16-attestation-request-package",
        kind: "file",
        placeholder: "<attestation-request.json>",
        description:
          "Unsigned Groth16 attestation request package whose role payload hashes must match the signed semantic, security, setup, and reproducible-build attestations.",
      },
      {
        id: "groth16-attestation-handoff-bundle",
        kind: "file",
        placeholder: "<attestation-handoff.json>",
        description:
          "Public handoff bundle tying the material manifest, transcript/review template packages, attestation request package, readiness audit, and signing/finalization commands together.",
      },
      {
        id: "signed-groth16-role-attestations",
        kind: "file-set",
        placeholder:
          "<semantic-sccp-circuit-attestation.json>,<circuit-security-audit.json>,<trusted-setup-ceremony.json>,<reproducible-build-attestation.json>",
        description:
          "Four public Ed25519-signed role attestations produced from the request package.",
      },
      {
        id: "groth16-proof-self-test-report",
        kind: "file",
        placeholder: "<proof-self-test.json>",
        description:
          "Public SnarkJS wtns/prove/verify report generated from the productionReady manifest-bound full-message circuit, proving key, verifier key, and deterministic synthetic SCCP witness.",
      },
      {
        id: "trusted-groth16-attestation-signer",
        kind: "hex-fingerprint",
        placeholder: "<0x...>",
        description:
          "Trusted Ed25519 public-key fingerprint used to verify Groth16 material attestation signatures.",
      },
      {
        id: "native-evm-prover-bundle",
        kind: "file",
        placeholder: "<native-evm-prover-bundle.json>",
        description:
          "SDK-validated native EVM prover bundle with verified implementation and audit hashes.",
      },
      {
        id: "cross-sdk-parity-report",
        kind: "file",
        placeholder: "<relative-cross-sdk-parity.json>",
        description:
          "Cross-SDK production parity report covering JavaScript, Swift, Kotlin, Java Android, and .NET bindings.",
      },
      {
        id: "native-prover-self-test-report",
        kind: "file",
        placeholder: "<relative-native-self-test.json>",
        description:
          "Native EVM prover self-test report bound to the selected BSC network.",
      },
      {
        id: "source-parity-attestation",
        kind: "file",
        placeholder: "<source-parity-attestation.json>",
        description:
          "Deterministic source-parity attestation for JavaScript, Swift, Kotlin, Java Android, and .NET BSC local-admission implementations.",
      },
      {
        id: "trusted-setup-transcript",
        kind: "file",
        placeholder: "<trusted-setup-transcript.json>",
        description:
          "Public trusted-setup transcript bound into the candidate Groth16 material and later signed by the setup attestor.",
      },
      {
        id: "reproducible-build-transcript",
        kind: "file",
        placeholder: "<reproducible-build-transcript.json>",
        description:
          "Public reproducible-build transcript bound into the candidate Groth16 material and later signed by the build attestor.",
      },
      {
        id: "semantic-sccp-circuit-attestation",
        kind: "file",
        placeholder: "<semantic-sccp-circuit-attestation.json>",
        description:
          "Public attestation that the Groth16 circuit enforces the full SCCP message, finality, route, and destination-binding semantics.",
      },
      {
        id: "trusted-setup-ceremony-attestation",
        kind: "file",
        placeholder: "<trusted-setup-ceremony.json>",
        description:
          "Public ceremony evidence binding the ptau, phase2 zkey, circuit hash, contribution transcript, and verifier key hash.",
      },
      {
        id: "reproducible-groth16-build-attestation",
        kind: "file",
        placeholder: "<reproducible-build-attestation.json>",
        description:
          "Independent reproducible build evidence for the circuit source, R1CS, proving key, SnarkJS verification key, and BSC verifier-key JSON.",
      },
      {
        id: "javascript-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-javascript-implementation>",
        description: "JavaScript SDK implementation evidence.",
      },
      {
        id: "swift-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-swift-implementation>",
        description: "Swift SDK implementation evidence.",
      },
      {
        id: "kotlin-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-kotlin-implementation>",
        description: "Kotlin SDK implementation evidence.",
      },
      {
        id: "java-android-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-java-android-implementation>",
        description: "Java Android SDK implementation evidence.",
      },
      {
        id: "dotnet-sdk-implementation",
        kind: "file-or-directory",
        placeholder: "<relative-dotnet-implementation>",
        description: ".NET SDK implementation evidence.",
      },
      {
        id: "audit-circuit-security",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Circuit security audit evidence.",
      },
      {
        id: "audit-native-implementation",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Native implementation audit evidence.",
      },
      {
        id: "audit-reproducible-build",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "Reproducible-build audit evidence.",
      },
      {
        id: "audit-no-wasm-no-remote-scan",
        kind: "hash-or-file",
        placeholder: "<hex-or-relative-file>",
        description: "No-WASM/no-remote-prover scan evidence.",
      },
    ],
    blockedByCheckIds: [
      "production-verifier-material",
      "source-parity-attestation",
      "groth16-material-manifest",
      "groth16-attestation-role-readiness",
      "native-evm-prover-bundle",
      "production-proof-files",
    ],
    commands: [
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs source-parity-attestation --bsc-network {bscNetwork} --out <source-parity-attestation.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material materialize --bsc-network {bscNetwork} --r1cs <production-circuit.r1cs> --zkey <production-proving-key.zkey> --ptau <powersOfTau28_hez_final_22.ptau> --snarkjs-verifier-key <production-verification_key.json> [--circuit-source <production-full-message.circom>] --witness-wasm <production-circuit.wasm> --trusted-setup-transcript <trusted-setup-transcript.json> --reproducible-build-transcript <reproducible-build-transcript.json> --snarkjs-bin <snarkjs> --out-dir <native-prover-artifact-root>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material proof-self-test --manifest <production-ready-groth16-material.manifest.json> --witness-wasm <production-circuit.wasm> --snarkjs-bin <snarkjs> --out <proof-self-test.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-request --manifest <candidate-groth16-material.manifest.json> --semantic-review-evidence <semantic-review-evidence.json> --circuit-security-audit-evidence <circuit-security-audit-evidence.json> --out <attestation-request.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material handoff-bundle --manifest <candidate-groth16-material.manifest.json> --transcript-template-package <transcript-template-package.json> --evidence-template-package <evidence-template-package.json> --request <attestation-request.json> --out <attestation-handoff.json>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-inventory --request <attestation-request.json> --scan-dir <native-prover-artifact-root> --trusted-attestation-signer <0x...>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material finalize-attestations --request <attestation-request.json> --semantic-attestation <semantic-sccp-circuit-attestation.json> --circuit-security-attestation <circuit-security-audit.json> --trusted-setup-attestation <trusted-setup-ceremony.json> --reproducible-build-attestation <reproducible-build-attestation.json> --trusted-attestation-signer <0x...> --out-dir <native-prover-artifact-root>",
      "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --bsc-network {bscNetwork} --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --proof-artifact <relative-circuit.r1cs> --proving-key <relative-circuit.zkey> --verifier-key <production-verifier-key.json> --groth16-material-manifest <relative-groth16-material-manifest.json> --groth16-proof-self-test <relative-groth16-proof-self-test.json> --snarkjs-bin <snarkjs> --trusted-attestation-signer <0x...> --cross-sdk-parity <relative-cross-sdk-parity.json> --native-prover-self-test <relative-native-self-test.json> --javascript-implementation <relative-javascript-implementation> --swift-implementation <relative-swift-implementation> --kotlin-implementation <relative-kotlin-implementation> --java-android-implementation <relative-java-android-implementation> --dotnet-implementation <relative-dotnet-implementation> --audit-circuit-security <hex-or-relative-file> --audit-native-implementation <source-parity-attestation.json> --audit-reproducible-build <hex-or-relative-file> --audit-no-wasm-no-remote-scan <hex-or-relative-file> --out <native-evm-prover-bundle.json>",
      "npm run e2e:sccp:bsc-material-inventory -- --bsc-network {bscNetwork}",
    ],
  }),
  materialInventoryAction({
    id: "publish-browser-prover-modules",
    title: "Publish browser prover modules",
    detail:
      "Publish route-bound TAIRA-to-BSC and BSC-to-TAIRA browser prover modules, production sidecar manifests, and runtime prover config.",
    requiredInputs: [
      {
        id: "{bscNetwork}-destination-browser-prover-module",
        kind: "url",
        placeholder: "<destination-prover-module-url>",
        description:
          "Browser-safe TAIRA-to-BSC prover module URL with production exports.",
      },
      {
        id: "{bscNetwork}-source-browser-prover-module",
        kind: "url",
        placeholder: "<source-prover-module-url>",
        description:
          "Browser-safe BSC-to-TAIRA source prover module URL with production exports.",
      },
      {
        id: "{bscNetwork}-runtime-prover-config",
        kind: "url",
        placeholder: "<runtime-prover-config-url>",
        description:
          "Runtime prover config binding the browser modules to production native prover material.",
      },
    ],
    blockedByCheckIds: [
      "destination-browser-prover",
      "source-browser-prover",
      "runtime-prover-config",
    ],
    commands: [
      "npm run e2e:sccp:bsc-prover-manifest -- --bsc-network {bscNetwork} --route-report <pre-sidecar-route-preflight-report.json> --module-url <destination-prover-module-url> --direction destination --out <destination-browser-prover-manifest.json>",
      "npm run e2e:sccp:bsc-prover-manifest -- --bsc-network {bscNetwork} --route-report <pre-sidecar-route-preflight-report.json> --module-url <source-prover-module-url> --direction source --out <source-browser-prover-manifest.json>",
      "npm run e2e:sccp:bsc-runtime-prover-config -- --bsc-network {bscNetwork}",
      "npm run e2e:sccp:bsc-material-inventory -- --bsc-network {bscNetwork}",
    ],
  }),
  materialInventoryAction({
    id: "refresh-public-route-evidence",
    title: "Refresh public route evidence",
    detail:
      "Refresh the public TAIRA route preflight after production artifacts are published so material inventory can bind to the same deployment and post-deploy hashes.",
    requiredInputs: [
      {
        id: "public-route-report",
        kind: "file",
        placeholder: "<route-preflight-report.json>",
        description:
          "Fresh public route preflight report from TAIRA for the selected BSC network.",
      },
    ],
    blockedByCheckIds: ["route-report-binding"],
    commands: [
      "npm run e2e:sccp:bsc-preflight -- --bsc-network {bscNetwork}",
      "npm run e2e:sccp:bsc-material-inventory -- --bsc-network {bscNetwork}",
    ],
  }),
]);

const replaceBscNetwork = (value, bscProfile) =>
  String(value ?? "")
    .replace(/\{bscNetwork\}/gu, bscProfile.key)
    .replace(
      /\{routeManifestConfirmationArgs\}/gu,
      bscProfile.key === "mainnet"
        ? "--confirm-mainnet true --confirm-network taira_bsc_xor"
        : "--confirm-testnet taira_bsc_xor",
    );

const materialInventoryNextActions = (checks, bscProfile) => {
  const failed = new Set(
    checks.filter((entry) => entry && !entry.ok).map((entry) => entry.id),
  );
  return MATERIAL_INVENTORY_NEXT_ACTIONS.map((action) => {
    const blockedByChecks = action.blockedByCheckIds.filter((id) =>
      failed.has(id),
    );
    if (blockedByChecks.length === 0) {
      return null;
    }
    return {
      id: action.id,
      title: action.title,
      detail: action.detail,
      requiredInputs: action.requiredInputs.map((input) => ({
        ...input,
        id: replaceBscNetwork(input.id, bscProfile),
        placeholder: replaceBscNetwork(input.placeholder, bscProfile),
      })),
      blockedByChecks,
      commands: action.commands.map((command) =>
        replaceBscNetwork(command, bscProfile),
      ),
    };
  }).filter(Boolean);
};

const materialInventoryMissingProductionInputs = (nextActions) => {
  const byId = new Map();
  for (const action of nextActions) {
    for (const input of action.requiredInputs ?? []) {
      const existing = byId.get(input.id);
      if (existing) {
        existing.blockedByActions.push(action.id);
        continue;
      }
      byId.set(input.id, {
        ...input,
        blockedByActions: [action.id],
      });
    }
  }
  return [...byId.values()];
};

const materialInventoryRecordArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = ownArrayIndexedValues(value)
    .filter(([, entry]) => !isRecord(entry))
    .map(([index]) => `${label} ${index} is not an object.`);
  if (required && ownArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};

const materialInventoryStringArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = ownArrayIndexedValues(value)
    .filter(([, entry]) => typeof entry !== "string" || !entry.trim())
    .map(([index]) => `${label} ${index} is not a non-empty string.`);
  if (required && ownArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};

const materialInventoryRequiredInputContractProblems = (
  input,
  label,
  { requireBlockedByActions = false } = {},
) => {
  const problems = [];
  for (const key of ["id", "kind", "placeholder", "description"]) {
    const value = ownValue(input, key);
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${label} ${key} is missing or not a non-empty string.`);
    }
  }
  if (requireBlockedByActions || hasOwn(input, "blockedByActions")) {
    problems.push(
      ...materialInventoryStringArrayProblems(
        ownValue(input, "blockedByActions"),
        `${label} blockedByActions`,
        { required: requireBlockedByActions },
      ),
    );
  }
  return problems;
};

const rememberMaterialInventoryRunbookId = (seen, id, label, problems) => {
  if (!id) {
    return false;
  }
  if (seen.has(id)) {
    problems.push(`${label} id ${id} is duplicated.`);
    return false;
  }
  seen.add(id);
  return true;
};

const NATIVE_PROVER_BUNDLE_COMMAND_FLAGS = Object.freeze([
  "--bsc-network",
  "--route-manifest",
  "--artifact-root",
  "--proof-artifact",
  "--proving-key",
  "--verifier-key",
  "--groth16-material-manifest",
  "--groth16-proof-self-test",
  "--snarkjs-bin",
  "--trusted-attestation-signer",
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

const GROTH16_MATERIALIZE_CANDIDATE_COMMAND_FLAGS = Object.freeze([
  "--bsc-network",
  "--r1cs",
  "--zkey",
  "--ptau",
  "--snarkjs-verifier-key",
  "--witness-wasm",
  "--trusted-setup-transcript",
  "--reproducible-build-transcript",
  "--snarkjs-bin",
  "--out-dir",
]);

const GROTH16_ATTESTATION_REQUEST_COMMAND_FLAGS = Object.freeze([
  "--manifest",
  "--semantic-review-evidence",
  "--circuit-security-audit-evidence",
  "--out",
]);

const GROTH16_PROOF_SELF_TEST_COMMAND_FLAGS = Object.freeze([
  "--manifest",
  "--witness-wasm",
  "--snarkjs-bin",
  "--out",
]);

const GROTH16_ATTESTATION_INVENTORY_COMMAND_FLAGS = Object.freeze([
  "--request",
  "--scan-dir",
  "--trusted-attestation-signer",
]);

const GROTH16_FINALIZE_ATTESTATIONS_COMMAND_FLAGS = Object.freeze([
  "--request",
  "--semantic-attestation",
  "--circuit-security-attestation",
  "--trusted-setup-attestation",
  "--reproducible-build-attestation",
  "--trusted-attestation-signer",
  "--out-dir",
]);

const materialInventoryCommandHasFlag = (command, flag) =>
  new RegExp(`(?:^|\\s)${flag}(?:\\s|$)`, "u").test(command);

const pushMaterialInventoryCommandFlagProblems = (
  problems,
  label,
  commandLabel,
  command,
  flags,
) => {
  for (const flag of flags) {
    if (!materialInventoryCommandHasFlag(command, flag)) {
      problems.push(`${label} ${commandLabel} command lacks ${flag}.`);
    }
  }
};

const materialInventoryActionCommandProblems = (action, label) => {
  const problems = [];
  const actionId =
    typeof ownValue(action, "id") === "string" ? ownValue(action, "id") : "";
  if (actionId !== "publish-production-proof-material") {
    return problems;
  }
  const commands = ownValue(action, "commands");
  const commandList = Array.isArray(commands)
    ? ownArrayValues(commands).filter((command) => typeof command === "string")
    : [];
  const candidateMaterialCommands = commandList.filter((command) =>
    /\bgroth16-material\s+materialize\b/u.test(command),
  );
  const requestCommands = commandList.filter((command) =>
    /\bgroth16-material\s+attestation-request\b/u.test(command),
  );
  const proofSelfTestCommands = commandList.filter((command) =>
    /\bgroth16-material\s+proof-self-test\b/u.test(command),
  );
  const inventoryCommands = commandList.filter((command) =>
    /\bgroth16-material\s+attestation-inventory\b/u.test(command),
  );
  const finalizeCommands = commandList.filter((command) =>
    /\bgroth16-material\s+finalize-attestations\b/u.test(command),
  );
  const nativeProverCommands = commandList.filter((command) =>
    /\bnative-prover-bundle\b/u.test(command),
  );

  if (candidateMaterialCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one unsigned groth16-material materialize command.`,
    );
  } else {
    const command = candidateMaterialCommands[0];
    pushMaterialInventoryCommandFlagProblems(
      problems,
      label,
      "groth16-material materialize",
      command,
      GROTH16_MATERIALIZE_CANDIDATE_COMMAND_FLAGS,
    );
    for (const forbiddenFlag of [
      "--semantic-attestation",
      "--circuit-security-attestation",
      "--trusted-setup-attestation",
      "--reproducible-build-attestation",
      "--trusted-attestation-signer",
    ]) {
      if (materialInventoryCommandHasFlag(command, forbiddenFlag)) {
        problems.push(
          `${label} groth16-material materialize command must not attach signed attestation flag ${forbiddenFlag}.`,
        );
      }
    }
    if (/\{bscNetwork\}/u.test(command)) {
      problems.push(
        `${label} groth16-material materialize command still has an unresolved bscNetwork placeholder.`,
      );
    }
  }

  if (requestCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one groth16-material attestation-request command.`,
    );
  } else {
    const command = requestCommands[0];
    pushMaterialInventoryCommandFlagProblems(
      problems,
      label,
      "groth16-material attestation-request",
      command,
      GROTH16_ATTESTATION_REQUEST_COMMAND_FLAGS,
    );
    if (materialInventoryCommandHasFlag(command, "--toolchain-sha256")) {
      problems.push(
        `${label} groth16-material attestation-request command must not use legacy --toolchain-sha256; use semantic and circuit-security evidence packages.`,
      );
    }
    if (/\{bscNetwork\}/u.test(command)) {
      problems.push(
        `${label} groth16-material attestation-request command still has an unresolved bscNetwork placeholder.`,
      );
    }
  }

  if (proofSelfTestCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one groth16-material proof-self-test command.`,
    );
  } else {
    const command = proofSelfTestCommands[0];
    pushMaterialInventoryCommandFlagProblems(
      problems,
      label,
      "groth16-material proof-self-test",
      command,
      GROTH16_PROOF_SELF_TEST_COMMAND_FLAGS,
    );
    if (/\{bscNetwork\}/u.test(command)) {
      problems.push(
        `${label} groth16-material proof-self-test command still has an unresolved bscNetwork placeholder.`,
      );
    }
  }

  if (inventoryCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one groth16-material attestation-inventory command.`,
    );
  } else {
    const command = inventoryCommands[0];
    pushMaterialInventoryCommandFlagProblems(
      problems,
      label,
      "groth16-material attestation-inventory",
      command,
      GROTH16_ATTESTATION_INVENTORY_COMMAND_FLAGS,
    );
    if (/\{bscNetwork\}/u.test(command)) {
      problems.push(
        `${label} groth16-material attestation-inventory command still has an unresolved bscNetwork placeholder.`,
      );
    }
  }

  if (finalizeCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one groth16-material finalize-attestations command.`,
    );
  } else {
    const command = finalizeCommands[0];
    pushMaterialInventoryCommandFlagProblems(
      problems,
      label,
      "groth16-material finalize-attestations",
      command,
      GROTH16_FINALIZE_ATTESTATIONS_COMMAND_FLAGS,
    );
    if (/\{bscNetwork\}/u.test(command)) {
      problems.push(
        `${label} groth16-material finalize-attestations command still has an unresolved bscNetwork placeholder.`,
      );
    }
  }

  if (nativeProverCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one native-prover-bundle command.`,
    );
    return problems;
  }
  const command = nativeProverCommands[0];
  pushMaterialInventoryCommandFlagProblems(
    problems,
    label,
    "native-prover-bundle",
    command,
    NATIVE_PROVER_BUNDLE_COMMAND_FLAGS,
  );
  if (/\{bscNetwork\}/u.test(command)) {
    problems.push(
      `${label} native-prover-bundle command still has an unresolved bscNetwork placeholder.`,
    );
  }
  return problems;
};

export const bscSccpProductionMaterialInventoryRunbookProblems = (report) => {
  if (!isRecord(report)) {
    return ["production material inventory runbook report is not an object."];
  }
  const problems = [];
  const nextActions = ownValue(report, "nextActions");
  const missingProductionInputs = ownValue(report, "missingProductionInputs");
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  const missingInputIds = new Set();
  const missingInputsById = new Map();
  problems.push(
    ...materialInventoryRecordArrayProblems(
      nextActions,
      "production material inventory next action",
    ),
    ...materialInventoryRecordArrayProblems(
      missingProductionInputs,
      "production material inventory missing production input",
    ),
  );
  if (Array.isArray(nextActions)) {
    for (const [index, action] of ownArrayIndexedValues(nextActions)) {
      const label = `production material inventory next action ${index}`;
      if (!isRecord(action)) {
        continue;
      }
      const actionId =
        typeof ownValue(action, "id") === "string"
          ? ownValue(action, "id").trim()
          : "";
      const uniqueActionId = rememberMaterialInventoryRunbookId(
        actionIds,
        actionId,
        "production material inventory next action",
        problems,
      );
      for (const key of ["id", "title", "detail"]) {
        const value = ownValue(action, key);
        if (typeof value !== "string" || !value.trim()) {
          problems.push(
            `${label} ${key} is missing or not a non-empty string.`,
          );
        }
      }
      const requiredInputs = ownValue(action, "requiredInputs");
      problems.push(
        ...materialInventoryRecordArrayProblems(
          requiredInputs,
          `${label} required input`,
          { required: true },
        ),
        ...materialInventoryStringArrayProblems(
          ownValue(action, "blockedByChecks"),
          `${label} blockedByChecks`,
          { required: true },
        ),
        ...materialInventoryStringArrayProblems(
          ownValue(action, "commands"),
          `${label} commands`,
          { required: true },
        ),
        ...materialInventoryActionCommandProblems(action, label),
      );
      const requiredInputIds = new Set();
      if (Array.isArray(requiredInputs)) {
        for (const [inputIndex, input] of ownArrayIndexedValues(
          requiredInputs,
        )) {
          if (!isRecord(input)) {
            continue;
          }
          problems.push(
            ...materialInventoryRequiredInputContractProblems(
              input,
              `${label} required input ${inputIndex}`,
            ),
          );
          const inputId =
            typeof ownValue(input, "id") === "string"
              ? ownValue(input, "id").trim()
              : "";
          rememberMaterialInventoryRunbookId(
            requiredInputIds,
            inputId,
            `${label} required input`,
            problems,
          );
        }
      }
      if (uniqueActionId) {
        requiredInputIdsByActionId.set(actionId, requiredInputIds);
      }
    }
  }
  if (Array.isArray(missingProductionInputs)) {
    for (const [index, input] of ownArrayIndexedValues(
      missingProductionInputs,
    )) {
      const label = `production material inventory missing production input ${index}`;
      if (!isRecord(input)) {
        continue;
      }
      const inputId =
        typeof ownValue(input, "id") === "string"
          ? ownValue(input, "id").trim()
          : "";
      rememberMaterialInventoryRunbookId(
        missingInputIds,
        inputId,
        "production material inventory missing production input",
        problems,
      );
      if (inputId && !missingInputsById.has(inputId)) {
        missingInputsById.set(inputId, input);
      }
      problems.push(
        ...materialInventoryRequiredInputContractProblems(input, label, {
          requireBlockedByActions: true,
        }),
      );
    }
  }
  if (Array.isArray(nextActions) && Array.isArray(missingProductionInputs)) {
    for (const [actionId, requiredInputIds] of requiredInputIdsByActionId) {
      for (const inputId of requiredInputIds) {
        const missingInput = missingInputsById.get(inputId);
        if (!missingInput) {
          problems.push(
            `production material inventory next action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
          );
          continue;
        }
        const blockers = ownValue(missingInput, "blockedByActions");
        if (
          Array.isArray(blockers) &&
          !ownArrayValues(blockers).includes(actionId)
        ) {
          problems.push(
            `production material inventory missing production input ${inputId} does not reference blocking action ${actionId}.`,
          );
        }
      }
    }
    for (const [inputId, input] of missingInputsById) {
      const blockers = ownValue(input, "blockedByActions");
      if (!Array.isArray(blockers)) {
        continue;
      }
      for (const actionId of ownArrayValues(blockers)) {
        if (typeof actionId !== "string" || !actionId.trim()) {
          continue;
        }
        if (!actionIds.has(actionId)) {
          problems.push(
            `production material inventory missing production input ${inputId} references unknown blocking action ${actionId}.`,
          );
          continue;
        }
        if (!requiredInputIdsByActionId.get(actionId)?.has(inputId)) {
          problems.push(
            `production material inventory missing production input ${inputId} references blocking action ${actionId}, but that action does not require the input.`,
          );
        }
      }
    }
  }
  return problems;
};

const finding = (severity, id, message) => ({ severity, id, message });
const findingDetail = (entry, item) => {
  const message = trim(item?.message);
  const boundedMessage =
    message.length > 360 ? `${message.slice(0, 360)}...` : message;
  return `${entry.path}: ${item.id}${boundedMessage ? `: ${boundedMessage}` : ""}`;
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

const diagnosticLike = (value, seen = new WeakSet()) => {
  if (typeof value === "string") {
    return DIAGNOSTIC_KEY_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return ownArrayValues(value).some((entry) => diagnosticLike(entry, seen));
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
      (DIAGNOSTIC_KEY_PATTERN.test(key) &&
        !(PRODUCTION_PLACEHOLDER_STATUS_KEYS.has(key) && entry === false)) ||
      diagnosticLike(entry),
  );
};

const isOpaqueProductionMaterialString = (value) => {
  const text = trim(value);
  return (
    /^0x[0-9a-f]{40,}$/iu.test(text) ||
    /^sha256:[0-9a-f]{64}$/iu.test(text) ||
    /^https?:\/\//iu.test(text) ||
    (text.length > 128 && /^[a-z0-9+/=]+$/iu.test(text))
  );
};

const productionPlaceholderMaterialReason = (
  value,
  pathName = "artifact",
  seen = new WeakSet(),
) => {
  if (typeof value === "string") {
    return !isOpaqueProductionMaterialString(value) &&
      PRODUCTION_PLACEHOLDER_PATTERN.test(value)
      ? pathName
      : "";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = productionPlaceholderMaterialReason(
        entry,
        `${pathName}[${index}]`,
        seen,
      );
      if (reason) {
        return reason;
      }
    }
    return "";
  }
  if (!isRecord(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  for (const [key, entry] of ownRecordEntries(value)) {
    const childPath = `${pathName}.${key}`;
    if (PRODUCTION_PLACEHOLDER_STATUS_KEYS.has(key) && entry === false) {
      continue;
    }
    if (
      !PRODUCTION_PLACEHOLDER_STATUS_KEYS.has(key) &&
      PRODUCTION_PLACEHOLDER_PATTERN.test(key)
    ) {
      return childPath;
    }
    const reason = productionPlaceholderMaterialReason(entry, childPath, seen);
    if (reason) {
      return reason;
    }
  }
  return "";
};

const repeatedByteHex32 = (value) =>
  typeof value === "string" && REPEATED_BYTE_HEX32_PATTERN.test(value);

const repeatedByteHex32MaterialProblems = (fields, label) =>
  Object.entries(fields)
    .filter(([, value]) => repeatedByteHex32(value))
    .map(
      ([field, value]) =>
        `${label}.${field} looks like placeholder material: repeated-byte hash ${value}.`,
    );
const repeatedByteEvmAddress = (value) =>
  typeof value === "string" && REPEATED_BYTE_EVM_ADDRESS_PATTERN.test(value);
const repeatedByteEvmAddressMaterialProblems = (fields, label) =>
  Object.entries(fields)
    .filter(([, value]) => repeatedByteEvmAddress(value))
    .map(
      ([field, value]) =>
        `${label}.${field} looks like placeholder material: repeated-byte address ${value}.`,
    );

const shouldSkipGeneratedNonProductionDirectory = (directoryPath, scanRoot) => {
  if (
    !GENERATED_NON_PRODUCTION_DIR_PATTERN.test(path.basename(directoryPath))
  ) {
    return false;
  }
  const resolvedDirectory = path.resolve(directoryPath);
  const resolvedRoot = path.resolve(scanRoot);
  return resolvedDirectory !== resolvedRoot;
};

const collectFiles = async (scanPaths, maxFiles = MAX_SCAN_FILES) => {
  const seen = new Set();
  const files = [];
  const skippedGeneratedDirectories = [];
  const scanRootStatuses = [];
  let relevantFilesSeen = 0;
  let truncated = false;
  const inspectScanRoot = async (scanPath) => {
    const resolved = path.resolve(scanPath);
    const pathLabel = publicPath(resolved);
    let info;
    try {
      info = await lstat(resolved);
    } catch (_error) {
      return {
        path: pathLabel,
        ok: false,
        kind: "missing",
        detail: "scan root does not exist or cannot be read",
      };
    }
    if (info.isSymbolicLink()) {
      return {
        path: pathLabel,
        ok: false,
        kind: "symlink",
        detail: "scan root must not be a symbolic link",
      };
    }
    if (info.isDirectory()) {
      return { path: pathLabel, ok: true, kind: "directory" };
    }
    if (info.isFile()) {
      return { path: pathLabel, ok: true, kind: "file" };
    }
    return {
      path: pathLabel,
      ok: false,
      kind: "unsupported",
      detail: "scan root must be a directory or regular file",
    };
  };
  const visit = async (entryPath, scanRoot) => {
    if (truncated) {
      return;
    }
    const resolved = path.resolve(entryPath);
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    let info;
    try {
      info = await lstat(resolved);
    } catch (_error) {
      return;
    }
    if (info.isSymbolicLink()) {
      return;
    }
    if (info.isFile()) {
      relevantFilesSeen += 1;
      if (relevantFilesSeen > maxFiles) {
        truncated = true;
        return;
      }
      files.push(resolved);
      return;
    }
    if (!info.isDirectory()) {
      return;
    }
    if (shouldSkipGeneratedNonProductionDirectory(resolved, scanRoot)) {
      skippedGeneratedDirectories.push(resolved);
      return;
    }
    const entries = await readdir(resolved, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".DS_Store"
      ) {
        continue;
      }
      const child = path.join(resolved, entry.name);
      if (entry.isDirectory()) {
        await visit(child, scanRoot);
      } else if (
        entry.isFile() &&
        (RELEVANT_FILE_PATTERN.test(entry.name) ||
          (ROUTE_FILE_PATTERN.test(entry.name) && !path.extname(entry.name)))
      ) {
        await visit(child, scanRoot);
      }
      if (truncated) {
        return;
      }
    }
  };
  for (const scanPath of scanPaths) {
    const status = await inspectScanRoot(scanPath);
    scanRootStatuses.push(status);
    if (!status.ok) {
      continue;
    }
    await visit(scanPath, scanPath);
    if (truncated) {
      break;
    }
  }
  return {
    files: files.sort((left, right) =>
      publicPath(left).localeCompare(publicPath(right)),
    ),
    maxFiles,
    relevantFilesSeen,
    scanRootStatuses,
    skippedGeneratedDirectories: skippedGeneratedDirectories
      .sort((left, right) => publicPath(left).localeCompare(publicPath(right)))
      .map(publicPath),
    truncated,
  };
};

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(`0x${hash.digest("hex")}`));
  });

const readTextIfSmall = async (filePath, sizeBytes) => {
  if (sizeBytes > TEXT_SCAN_MAX_BYTES) {
    return "";
  }
  try {
    return await readFile(filePath, "utf8");
  } catch (_error) {
    return "";
  }
};

const readJsonIfSmall = async (filePath, text) => {
  if (!/\.json$/iu.test(filePath) || !text.trim()) {
    return { json: null, jsonProblem: "", jsonProblemId: "" };
  }
  try {
    const parsed = parseJsonWithoutDuplicateKeys(text, filePath);
    if (!isRecord(parsed)) {
      return {
        json: null,
        jsonProblem: `${filePath} must be a JSON object.`,
        jsonProblemId: "non-object-json-artifact",
      };
    }
    return {
      json: parsed,
      jsonProblem: "",
      jsonProblemId: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duplicateKey = /duplicate JSON object key/iu.test(message);
    return {
      json: null,
      jsonProblem: message,
      jsonProblemId: duplicateKey
        ? "duplicate-json-object-key"
        : "invalid-json-artifact",
    };
  }
};

const readNestedString = (value, keys, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (isRecord(value)) {
    for (const key of keys) {
      const entry = ownValue(value, key);
      if (typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
    }
    for (const [, child] of ownRecordEntries(value)) {
      const found = readNestedString(child, keys, seen);
      if (found) {
        return found;
      }
    }
  } else {
    for (const child of ownArrayValues(value)) {
      const found = readNestedString(child, keys, seen);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

const collectNestedStringEntries = (
  value,
  keys,
  pathName = "$",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  const entries = [];
  if (isRecord(value)) {
    for (const key of keys) {
      const entry = ownValue(value, key);
      if (typeof entry === "string" && entry.trim()) {
        entries.push({
          path: `${pathName}.${key}`,
          key,
          value: entry.trim(),
        });
      }
    }
    for (const [key, child] of ownRecordEntries(value)) {
      entries.push(
        ...collectNestedStringEntries(child, keys, `${pathName}.${key}`, seen),
      );
    }
  } else {
    for (const [index, child] of ownArrayValues(value).entries()) {
      entries.push(
        ...collectNestedStringEntries(
          child,
          keys,
          `${pathName}[${index}]`,
          seen,
        ),
      );
    }
  }
  return entries;
};

const collectNestedBooleanEntries = (
  value,
  keys,
  pathName = "$",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  const entries = [];
  if (isRecord(value)) {
    for (const key of keys) {
      const entry = ownValue(value, key);
      if (typeof entry === "boolean") {
        entries.push({ path: `${pathName}.${key}`, key, value: entry });
      } else if (typeof entry === "string") {
        const normalized = entry.trim().toLowerCase();
        if (normalized === "true" || normalized === "false") {
          entries.push({
            path: `${pathName}.${key}`,
            key,
            value: normalized === "true",
          });
        }
      }
    }
    for (const [key, child] of ownRecordEntries(value)) {
      entries.push(
        ...collectNestedBooleanEntries(child, keys, `${pathName}.${key}`, seen),
      );
    }
  } else {
    for (const [index, child] of ownArrayValues(value).entries()) {
      entries.push(
        ...collectNestedBooleanEntries(
          child,
          keys,
          `${pathName}[${index}]`,
          seen,
        ),
      );
    }
  }
  return entries;
};

const collectNestedIntegerEntries = (
  value,
  keys,
  pathName = "$",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  const entries = [];
  if (isRecord(value)) {
    for (const key of keys) {
      const entry = ownValue(value, key);
      if (Number.isInteger(entry)) {
        entries.push({ path: `${pathName}.${key}`, key, value: entry });
      } else if (typeof entry === "string") {
        const normalized = entry.trim();
        if (/^\d+$/u.test(normalized)) {
          entries.push({
            path: `${pathName}.${key}`,
            key,
            value: Number(normalized),
          });
        }
      }
    }
    for (const [key, child] of ownRecordEntries(value)) {
      entries.push(
        ...collectNestedIntegerEntries(child, keys, `${pathName}.${key}`, seen),
      );
    }
  } else {
    for (const [index, child] of ownArrayValues(value).entries()) {
      entries.push(
        ...collectNestedIntegerEntries(
          child,
          keys,
          `${pathName}[${index}]`,
          seen,
        ),
      );
    }
  }
  return entries;
};

const readTomlLikeString = (text, keys) => {
  for (const key of keys) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=\\s*"([^"]+)"`,
      "iu",
    );
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
};

const readTomlLikeStringEntries = (text, keys) => {
  const entries = [];
  for (const key of keys) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=\\s*"([^"]+)"`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      entries.push({ path: `toml.${key}`, key, value: match[1].trim() });
    }
  }
  return entries;
};

const readTomlLikeBooleanEntries = (text, keys) => {
  const entries = [];
  for (const key of keys) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=\\s*(true|false)`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      entries.push({
        path: `toml.${key}`,
        key,
        value: match[1].toLowerCase() === "true",
      });
    }
  }
  return entries;
};

const readTomlLikeIntegerEntries = (text, keys) => {
  const entries = [];
  for (const key of keys) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=\\s*(\\d+)`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      entries.push({ path: `toml.${key}`, key, value: Number(match[1]) });
    }
  }
  return entries;
};

const firstConsistentValue = (
  entries,
  label,
  normalizeValue = (value) => value,
) => {
  let selected = null;
  const conflicts = [];
  for (const entry of entries) {
    let normalized;
    try {
      normalized = normalizeValue(entry.value);
    } catch (_error) {
      normalized = null;
    }
    if (normalized === null || normalized === undefined || normalized === "") {
      continue;
    }
    if (!selected) {
      selected = { ...entry, normalized };
      continue;
    }
    if (selected.normalized !== normalized) {
      conflicts.push(
        `${label} aliases disagree: ${selected.path}=${selected.value} but ${entry.path}=${entry.value}`,
      );
    }
  }
  return {
    value: selected?.normalized ?? null,
    conflicts,
  };
};

const entryParentPath = (entry) => {
  const index = entry.path.lastIndexOf(".");
  return index > 0 ? entry.path.slice(0, index) : entry.path;
};

const duplicateAliasProblems = (entries, label) => {
  const groups = new Map();
  for (const entry of entries) {
    const parentPath = entryParentPath(entry);
    const group = groups.get(parentPath) ?? { keys: new Set(), entries: [] };
    group.keys.add(entry.key);
    group.entries.push(entry);
    groups.set(parentPath, group);
  }
  const problems = [];
  for (const [parentPath, group] of groups.entries()) {
    if (group.keys.size <= 1) {
      continue;
    }
    problems.push(
      `${label} must not use multiple aliases in ${parentPath}: ${[
        ...group.keys,
      ].join(", ")}`,
    );
  }
  return problems;
};

const forbiddenBscRouteDeploymentAliasProblems = (
  deployment,
  sourceLabel = "BSC route report deployment",
) => {
  if (!isRecord(deployment)) {
    return [];
  }
  return Object.entries(FORBIDDEN_BSC_ROUTE_DEPLOYMENT_ALIASES).flatMap(
    ([key, aliases]) => {
      const present = aliases.filter((alias) => {
        if (!hasOwn(deployment, alias)) {
          return false;
        }
        const value = ownValue(deployment, alias);
        return typeof value === "string" ? value.trim() !== "" : false;
      });
      return present.length > 0
        ? [
            `${key} must not use TRON aliases on ${sourceLabel}: ${present.join(", ")}`,
          ]
        : [];
    },
  );
};

const forbiddenBscRouteMaterialAliasProblems = ({ json, text }) =>
  Object.entries(FORBIDDEN_BSC_ROUTE_DEPLOYMENT_ALIASES).flatMap(
    ([key, aliases]) => {
      const entries = [
        ...collectNestedStringEntries(json, aliases),
        ...readTomlLikeStringEntries(text, aliases),
      ];
      const present = [...new Set(entries.map((entry) => entry.key))];
      return present.length > 0
        ? [
            `${key} must not use TRON aliases on BSC route artifacts: ${present.join(", ")}`,
          ]
        : [];
    },
  );

const canonicalizeBscOfflineFullConfigTomlForHash = (toml) => {
  const normalized = String(toml ?? "").replace(/\r\n?/gu, "\n");
  const filtered = normalized
    .split("\n")
    .filter(
      (line) => !/^\s*post_deploy_offline_full_toml_sha256\s*=/u.test(line),
    )
    .join("\n");
  return filtered.endsWith("\n") ? filtered : `${filtered}\n`;
};

const offlineFullTomlRelativePathProblems = (pathValue, label) => {
  const value = trim(pathValue);
  if (!value) {
    return [`${label} is required.`];
  }
  if (
    value.includes("\0") ||
    path.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value) ||
    /[?#]/u.test(value) ||
    value.includes("\\")
  ) {
    return [`${label} must be a relative path without parent traversal.`];
  }
  let decoded = value;
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
  if (decoded !== value) {
    return [`${label} must not use percent-encoded path segments.`];
  }
  const segments = value.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return [`${label} must be a relative path without parent traversal.`];
  }
  return [];
};

const safeReferencedEvidencePathCandidates = (evidenceFilePath, reference) => {
  const value = trim(reference);
  if (offlineFullTomlRelativePathProblems(value, "reference").length > 0) {
    return [];
  }
  return [
    path.resolve(repoRoot, value),
    path.resolve(path.dirname(evidenceFilePath), value),
  ].filter(
    (candidate, index, candidates) => candidates.indexOf(candidate) === index,
  );
};

const referencedOfflineFullTomlProblems = async ({
  evidenceFilePath,
  offlineFullTomlEvidence,
}) => {
  if (
    !offlineFullTomlEvidence?.looksLikeOfflineFullTomlEvidence ||
    !offlineFullTomlEvidence.fullConfigPath
  ) {
    return [];
  }
  const candidates = safeReferencedEvidencePathCandidates(
    evidenceFilePath,
    offlineFullTomlEvidence.fullConfigPath,
  );
  let resolvedPath = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      resolvedPath = candidate;
      break;
    }
  }
  if (!resolvedPath) {
    return [];
  }

  const problems = [];
  const info = await lstat(resolvedPath);
  if (info.isSymbolicLink()) {
    return ["referenced fullConfigPath must not be a symbolic link"];
  }
  if (!info.isFile()) {
    return ["referenced fullConfigPath must be a regular file"];
  }
  if (info.size > TEXT_SCAN_MAX_BYTES) {
    problems.push(
      `referenced fullConfigPath is ${info.size} bytes; maximum allowed is ${TEXT_SCAN_MAX_BYTES}`,
    );
  }
  const toml = await readFile(resolvedPath, "utf8");
  if (Buffer.byteLength(toml, "utf8") > TEXT_SCAN_MAX_BYTES) {
    problems.push(
      `referenced fullConfigPath exceeds ${TEXT_SCAN_MAX_BYTES} bytes`,
    );
  }
  const canonicalHash = sha256Bytes(
    Buffer.from(canonicalizeBscOfflineFullConfigTomlForHash(toml), "utf8"),
  );
  if (
    offlineFullTomlEvidence.hashInputSha256 &&
    canonicalHash !== offlineFullTomlEvidence.hashInputSha256
  ) {
    problems.push(
      `referenced fullConfigPath canonical hash ${canonicalHash} does not match hashInputSha256 ${offlineFullTomlEvidence.hashInputSha256}`,
    );
  }
  problems.push(
    ...forbiddenBscRouteMaterialAliasProblems({
      json: null,
      text: toml,
    }).map((problem) =>
      problem.replace("on BSC route artifacts", "in referenced fullConfigPath"),
    ),
  );
  return problems;
};

const roleSeparatedProductionHashProblems = (
  record,
  label,
  fields = ROLE_SEPARATED_PRODUCTION_HASH_FIELDS,
) => {
  if (!isRecord(record)) {
    return [];
  }
  const problems = [];
  const seen = new Map();
  for (const key of fields) {
    const normalized = normalizeHex32(ownValue(record, key));
    if (!normalized) {
      continue;
    }
    const previous = seen.get(normalized);
    if (previous) {
      problems.push(`${label} ${key} must not equal ${previous}`);
    } else {
      seen.set(normalized, key);
    }
  }
  return problems;
};

const strictBase64DecodedBytes = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text || /\s/u.test(text)) {
    throw new Error(`${label} must be strict base64 without whitespace.`);
  }
  const decoded = Buffer.from(text, "base64");
  if (!decoded.length || decoded.toString("base64") !== text) {
    throw new Error(`${label} must be strict base64.`);
  }
  return decoded;
};

const readConsistentMaterialString = ({
  json,
  text,
  keys,
  label,
  normalizeValue = (value) => value.trim(),
  rejectDuplicateAliases = false,
}) => {
  const entries = [
    ...collectNestedStringEntries(json, keys),
    ...readTomlLikeStringEntries(text, keys),
  ];
  const result = firstConsistentValue(entries, label, normalizeValue);
  if (rejectDuplicateAliases) {
    result.conflicts.push(...duplicateAliasProblems(entries, label));
  }
  return result;
};

const readConsistentMaterialBoolean = ({
  json,
  text,
  keys,
  label,
  rejectDuplicateAliases = false,
}) => {
  const entries = [
    ...collectNestedBooleanEntries(json, keys),
    ...readTomlLikeBooleanEntries(text, keys),
  ];
  const result = firstConsistentValue(entries, label, (value) => value);
  if (rejectDuplicateAliases) {
    result.conflicts.push(...duplicateAliasProblems(entries, label));
  }
  return result;
};

const readConsistentMaterialInteger = ({ json, text, keys, label }) =>
  firstConsistentValue(
    [
      ...collectNestedIntegerEntries(json, keys),
      ...readTomlLikeIntegerEntries(text, keys),
    ],
    label,
    (value) => value,
  );

const firstMaterialValue = (record, keys) => {
  if (!isRecord(record)) {
    return undefined;
  }
  for (const key of keys) {
    if (hasOwn(record, key)) {
      return ownValue(record, key);
    }
  }
  return undefined;
};

const isVerifierKeyLikePath = (filePath) =>
  /(?:^|[._-])(?:verifier[._-]?key|verification[._-]?key|vk)(?:[._-]|$)/iu.test(
    path.basename(filePath),
  );

const normalizeVerifierVectorScalar = (value) => {
  if (typeof value === "bigint") {
    return value >= 0n ? value.toString() : null;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (/^[0-9]+$/u.test(normalized)) {
    return normalized.replace(/^0+/u, "") || "0";
  }
  return null;
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

const flattenVerifierVector = (value) => {
  if (Array.isArray(value)) {
    return flattenOwnArrayValues(value).map(normalizeVerifierVectorScalar);
  }
  return [normalizeVerifierVectorScalar(value)];
};

const verifierVectorEquals = (record, keys, expected) => {
  const raw = firstMaterialValue(record, keys);
  if (raw === undefined) {
    return false;
  }
  const values = flattenVerifierVector(raw);
  return (
    values.length === expected.length &&
    values.every((value, index) => value === expected[index])
  );
};

const smokeFixtureGroth16VerifierKey = (json) =>
  isRecord(json) &&
  verifierVectorEquals(
    json,
    ["alpha1", "configuredAlpha1", "vk_alpha_1"],
    SMOKE_FIXTURE_G1,
  ) &&
  verifierVectorEquals(
    json,
    ["beta2", "configuredBeta2", "vk_beta_2"],
    SMOKE_FIXTURE_G2,
  ) &&
  verifierVectorEquals(
    json,
    ["gamma2", "configuredGamma2", "vk_gamma_2"],
    SMOKE_FIXTURE_G2,
  ) &&
  verifierVectorEquals(
    json,
    ["delta2", "configuredDelta2", "vk_delta_2"],
    SMOKE_FIXTURE_G2,
  ) &&
  verifierVectorEquals(
    json,
    ["ic", "IC", "configuredIc", "vk_ic"],
    SMOKE_FIXTURE_IC,
  );

const normalizeBn254VerifierCoordinate = (value, label) => {
  let parsed;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a BN254 field element`);
    }
    parsed = BigInt(value);
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(normalized)) {
      throw new Error(`${label} must be a BN254 field element`);
    }
    parsed = BigInt(normalized);
  } else {
    throw new Error(`${label} must be a BN254 field element`);
  }
  if (parsed < 0n || parsed >= BN254_BASE_FIELD_MODULUS) {
    throw new Error(`${label} must be a BN254 field element`);
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

const normalizeVerifierG1Vector = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of BN254 coordinates`);
  }
  const flattened = flattenOwnArrayValues(value);
  if (flattened.length === 0) {
    throw new Error(`${label} must contain BN254 coordinates`);
  }
  return flattened.map((entry, index) =>
    normalizeBn254VerifierCoordinate(entry, `${label}[${index}]`),
  );
};

const readVerifierG1VectorAliases = (record, keys, label) => {
  const problems = [];
  let selected = null;
  let selectedKey = "";
  let selectedSerialized = "";
  let present = false;
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      continue;
    }
    present = true;
    let vector;
    try {
      vector = normalizeVerifierG1Vector(
        ownValue(record, key),
        `${label}.${key}`,
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const serialized = vector.map((entry) => entry.toString()).join(",");
    if (!selected) {
      selected = vector;
      selectedKey = key;
      selectedSerialized = serialized;
      continue;
    }
    if (selectedSerialized !== serialized) {
      problems.push(`${label} aliases disagree: ${selectedKey} and ${key}.`);
    }
  }
  return { present, vector: selected, problems };
};

const assertBn254G1Point = (point, label) => {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new Error(`${label} must contain two BN254 G1 coordinates`);
  }
  const [x, y] = point;
  if (x === 0n && y === 0n) {
    throw new Error(`${label} must not be the BN254 point at infinity`);
  }
  if (bn254Mod(y * y) !== bn254Mod(x * x * x + 3n)) {
    throw new Error(`${label} must be on the BN254 G1 curve`);
  }
};

const assertBn254G2Point = (point, label) => {
  if (!Array.isArray(point) || point.length !== 4) {
    throw new Error(`${label} must contain four BN254 G2 coordinates`);
  }
  const x = [point[0], point[1]];
  const y = [point[2], point[3]];
  if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) {
    throw new Error(`${label} must not be the BN254 G2 point at infinity`);
  }
  const expected = bn254Fp2Add(bn254Fp2Cube(x), BN254_TWIST_B_COEFFICIENT);
  if (!sameBn254Fp2(bn254Fp2Square(y), expected)) {
    throw new Error(`${label} must be on the BN254 G2 twist curve`);
  }
};

const assertBn254G1VectorPairs = (values, label) => {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length % 2 !== 0
  ) {
    throw new Error(`${label} must contain complete BN254 G1 coordinate pairs`);
  }
  for (let offset = 0; offset < values.length; offset += 2) {
    assertBn254G1Point(
      values.slice(offset, offset + 2),
      `${label}[${offset / 2}]`,
    );
  }
};

const verifierG1MaterialProblems = (json, { requireMaterial = false } = {}) => {
  if (!isRecord(json)) {
    return [];
  }
  const problems = [];
  const alpha = readVerifierG1VectorAliases(
    json,
    VERIFIER_G1_ALPHA_ALIASES,
    "verifier.alpha1",
  );
  const ic = readVerifierG1VectorAliases(
    json,
    VERIFIER_G1_IC_ALIASES,
    "verifier.ic",
  );
  problems.push(...alpha.problems, ...ic.problems);
  if (requireMaterial && !alpha.present) {
    problems.push("verifier.alpha1 material is missing");
  }
  if (requireMaterial && !ic.present) {
    problems.push("verifier.ic material is missing");
  }
  if (alpha.present && alpha.vector) {
    try {
      assertBn254G1Point(alpha.vector, "verifier.alpha1");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (ic.present && ic.vector) {
    try {
      assertBn254G1VectorPairs(ic.vector, "verifier.ic");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems;
};

const verifierG2MaterialProblems = (json, { requireMaterial = false } = {}) => {
  if (!isRecord(json)) {
    return [];
  }
  const problems = [];
  for (const { label, aliases } of VERIFIER_G2_MATERIAL_ALIASES) {
    const result = readVerifierG1VectorAliases(
      json,
      aliases,
      `verifier.${label}`,
    );
    problems.push(...result.problems);
    if (requireMaterial && !result.present) {
      problems.push(`verifier.${label} material is missing`);
      continue;
    }
    if (!result.present) {
      continue;
    }
    if (!result.vector) {
      continue;
    }
    try {
      assertBn254G2Point(result.vector, `verifier.${label}`);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems;
};

const offlineFullTomlEvidenceMetadata = ({ json, bscProfile }) => {
  if (!isRecord(json)) {
    return { looksLikeOfflineFullTomlEvidence: false, problems: [] };
  }
  const schema = trim(ownValue(json, "schema"));
  const looksLikeOfflineFullTomlEvidence =
    schema === OFFLINE_FULL_TOML_EVIDENCE_SCHEMA ||
    (hasOwn(json, "offlineFullTomlSha256") &&
      trim(ownValue(json, "hashMode")).includes("full-config"));
  if (!looksLikeOfflineFullTomlEvidence) {
    return { looksLikeOfflineFullTomlEvidence: false, problems: [] };
  }
  const problems = [];
  if (schema !== OFFLINE_FULL_TOML_EVIDENCE_SCHEMA) {
    problems.push(`schema must be ${OFFLINE_FULL_TOML_EVIDENCE_SCHEMA}.`);
  }
  const allowedKeys = new Set([
    "schema",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "bscNetwork",
    "bsc_network",
    "network",
    "chain",
    "chainIdHex",
    "chain_id_hex",
    "networkIdHex",
    "network_id_hex",
    "fullTomlReady",
    "full_toml_ready",
    "offlineFullTomlSha256",
    "offline_full_toml_sha256",
    "hashMode",
    "hash_mode",
    "hashInputSha256",
    "hash_input_sha256",
    "renderedTomlSha256",
    "rendered_toml_sha256",
    "routeManifestPath",
    "route_manifest_path",
    "fullConfigPath",
    "full_config_path",
    "baseConfigProvided",
    "base_config_provided",
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  ]);
  for (const key of Object.keys(json)) {
    if (!allowedKeys.has(key)) {
      problems.push(
        `offline full TOML evidence contains unsupported field ${key}.`,
      );
    }
  }
  for (const forbiddenKey of [
    "toml",
    "fullToml",
    "full_toml",
    "configToml",
    "config_toml",
    "fullConfig",
    "full_config",
    "fullConfigToml",
    "full_config_toml",
    "baseConfig",
    "base_config",
    "baseConfigToml",
    "base_config_toml",
  ]) {
    if (hasOwn(json, forbiddenKey)) {
      problems.push(
        `offline full TOML evidence must not serialize ${forbiddenKey}.`,
      );
    }
  }
  const generatedEvidencePaths = {};
  for (const [keys, label] of [
    [["routeManifestPath", "route_manifest_path"], "routeManifestPath"],
    [["fullConfigPath", "full_config_path"], "fullConfigPath"],
  ]) {
    const pathValues = keys
      .filter((key) => hasOwn(json, key))
      .map((key) => trim(ownValue(json, key)))
      .filter(Boolean);
    if (pathValues.length === 0) {
      problems.push(`${label} is required.`);
      continue;
    }
    if (new Set(pathValues).size > 1) {
      problems.push(`${label} aliases disagree.`);
      continue;
    }
    const evidencePath = pathValues[0];
    problems.push(...offlineFullTomlRelativePathProblems(evidencePath, label));
    generatedEvidencePaths[label] = evidencePath;
  }
  const routeId = trim(ownValue(json, "routeId") || ownValue(json, "route_id"));
  if (routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(`routeId must be ${SCCP_BSC_XOR_ROUTE_ID}.`);
  }
  const assetKey = trim(
    ownValue(json, "assetKey") || ownValue(json, "asset_key"),
  );
  if (assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(`assetKey must be ${SCCP_BSC_XOR_ASSET_KEY}.`);
  }
  const networkValues = ["bscNetwork", "bsc_network", "network", "chain"]
    .map((key) => trim(ownValue(json, key)))
    .filter(Boolean);
  if (networkValues.length === 0) {
    problems.push("BSC network is required.");
  }
  let bscNetwork = "";
  for (const value of networkValues) {
    try {
      const profile = resolveBscNetworkProfile(value);
      if (!bscNetwork) {
        bscNetwork = profile.key;
      } else if (bscNetwork !== profile.key) {
        problems.push("BSC network aliases disagree.");
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (bscNetwork && bscNetwork !== bscProfile.key) {
    problems.push(`BSC network must be ${bscProfile.key}.`);
  }
  const readOfflineEvidenceStringAlias = (keys, label, normalizeValue) => {
    const entries = keys
      .filter((key) => hasOwn(json, key))
      .map((key) => ({
        path: `offlineFullTomlEvidence.${key}`,
        key,
        value: trim(ownValue(json, key)),
      }))
      .filter((entry) => entry.value);
    const result = firstConsistentValue(entries, label, normalizeValue);
    problems.push(...result.conflicts);
    problems.push(...duplicateAliasProblems(entries, label));
    return result.value ?? "";
  };
  const chainIdHex = readOfflineEvidenceStringAlias(
    ["chainIdHex", "chain_id_hex"],
    "offline full TOML evidence chainIdHex",
    (value) => trim(value).toLowerCase(),
  );
  if (chainIdHex && chainIdHex !== bscProfile.chainIdHex) {
    problems.push(`chainIdHex must be ${bscProfile.chainIdHex}.`);
  }
  const networkIdHex = readOfflineEvidenceStringAlias(
    ["networkIdHex", "network_id_hex"],
    "offline full TOML evidence networkIdHex",
    normalizeHex32,
  );
  if (networkIdHex && networkIdHex !== bscProfile.networkIdHex) {
    problems.push(`networkIdHex must be ${bscProfile.networkIdHex}.`);
  }
  const postDeployEvidence = isRecord(ownValue(json, "postDeployLiveEvidence"))
    ? ownValue(json, "postDeployLiveEvidence")
    : isRecord(ownValue(json, "post_deploy_live_evidence"))
      ? ownValue(json, "post_deploy_live_evidence")
      : {};
  const fullTomlReady =
    ownValue(json, "fullTomlReady") === true ||
    ownValue(json, "full_toml_ready") === true;
  const nestedFullTomlReady =
    ownValue(postDeployEvidence, "fullTomlReady") === true ||
    ownValue(postDeployEvidence, "full_toml_ready") === true;
  if (!fullTomlReady || !nestedFullTomlReady) {
    problems.push(
      "fullTomlReady must be true at top level and in postDeployLiveEvidence.",
    );
  }
  const offlineFullTomlSha256 = normalizeHex32(
    trim(
      ownValue(json, "offlineFullTomlSha256") ||
        ownValue(json, "offline_full_toml_sha256"),
    ),
  );
  const nestedOfflineFullTomlSha256 = normalizeHex32(
    trim(
      ownValue(postDeployEvidence, "offlineFullTomlSha256") ||
        ownValue(postDeployEvidence, "offline_full_toml_sha256"),
    ),
  );
  if (!offlineFullTomlSha256 || !nestedOfflineFullTomlSha256) {
    problems.push("offlineFullTomlSha256 is required.");
  } else if (offlineFullTomlSha256 !== nestedOfflineFullTomlSha256) {
    problems.push("offlineFullTomlSha256 aliases disagree.");
  }
  const hashInputSha256 = normalizeHex32(
    trim(
      ownValue(json, "hashInputSha256") || ownValue(json, "hash_input_sha256"),
    ),
  );
  if (!hashInputSha256) {
    problems.push("hashInputSha256 is required.");
  } else if (
    offlineFullTomlSha256 &&
    hashInputSha256 !== offlineFullTomlSha256
  ) {
    problems.push("hashInputSha256 must match offlineFullTomlSha256.");
  }
  const renderedTomlSha256 = normalizeHex32(
    trim(
      ownValue(json, "renderedTomlSha256") ||
        ownValue(json, "rendered_toml_sha256"),
    ),
  );
  if (!renderedTomlSha256) {
    problems.push("renderedTomlSha256 is required.");
  }
  const hashMode = trim(
    ownValue(json, "hashMode") || ownValue(json, "hash_mode"),
  );
  if (
    hashMode !==
    "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256"
  ) {
    problems.push(
      "hashMode must be sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256.",
    );
  }
  return {
    looksLikeOfflineFullTomlEvidence: true,
    problems,
    valid: problems.length === 0,
    routeId,
    assetKey,
    bscNetwork,
    chainIdHex: chainIdHex || null,
    networkIdHex: networkIdHex || null,
    fullTomlReady,
    offlineFullTomlSha256,
    hashInputSha256,
    renderedTomlSha256,
    hashMode,
    routeManifestPath: generatedEvidencePaths.routeManifestPath || "",
    fullConfigPath: generatedEvidencePaths.fullConfigPath || "",
  };
};

const deploymentEvidenceMetadata = ({
  filePath,
  json,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(json)) {
    return { looksLikeDeploymentEvidence: false };
  }
  const schema = trim(ownValue(json, "schema"));
  const looksLikeDeploymentEvidence =
    schema === BSC_DEPLOYMENT_EVIDENCE_SCHEMA ||
    /(?:^|[-_.])deployment[-_.]evidence\.json$/iu.test(path.basename(filePath));
  if (!looksLikeDeploymentEvidence) {
    return { looksLikeDeploymentEvidence: false };
  }
  const problems = [];
  const stringEntriesFor = (record, keys, pathName) => {
    if (!isRecord(record)) {
      return [];
    }
    return keys.flatMap((key) => {
      const value = ownValue(record, key);
      return typeof value === "string" && value.trim()
        ? [{ path: `${pathName}.${key}`, key, value: value.trim() }]
        : [];
    });
  };
  const readString = ({
    sources,
    label,
    normalizeValue = (value) => value.trim(),
    required = true,
  }) => {
    const entries = sources.flatMap(({ record, keys, pathName }) =>
      stringEntriesFor(record, keys, pathName),
    );
    const result = firstConsistentValue(entries, label, normalizeValue);
    problems.push(...result.conflicts);
    problems.push(...duplicateAliasProblems(entries, label));
    if (required && !result.value) {
      problems.push(
        entries.length ? `${label} is invalid.` : `${label} is required.`,
      );
    }
    return result.value;
  };
  const readRecordAlias = (record, keys, label, pathName) => {
    const entries = keys
      .map((key) => ({ key, value: ownValue(record, key) }))
      .filter((entry) => isRecord(entry.value));
    if (entries.length > 1) {
      problems.push(
        `${label} must not use multiple aliases in ${pathName}: ${entries
          .map((entry) => entry.key)
          .join(", ")}`,
      );
    }
    return entries[0]?.value ?? {};
  };
  const readCodeHashMap = (record, label) => {
    if (!isRecord(record) || Object.keys(record).length === 0) {
      problems.push(`${label} is required.`);
      return null;
    }
    const result = {};
    for (const key of Object.keys(record)) {
      if (!BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS.has(key)) {
        problems.push(`${label} contains unsupported field ${key}.`);
      }
    }
    for (const key of BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS) {
      const normalized = normalizeHex32(ownValue(record, key));
      if (!normalized) {
        problems.push(`${label}.${key} must be a non-zero hex32 hash.`);
      }
      result[key] = normalized;
    }
    return result;
  };
  const readInteger = (record, keys, label, pathName, required = true) => {
    const entries = keys.flatMap((key) => {
      const value = ownValue(record, key);
      if (Number.isInteger(value)) {
        return [{ path: `${pathName}.${key}`, key, value }];
      }
      if (typeof value === "string" && /^\d+$/u.test(value.trim())) {
        return [{ path: `${pathName}.${key}`, key, value: Number(value) }];
      }
      return [];
    });
    const result = firstConsistentValue(entries, label, (value) => value);
    problems.push(...result.conflicts);
    problems.push(...duplicateAliasProblems(entries, label));
    if (required && result.value === null) {
      problems.push(
        entries.length ? `${label} is invalid.` : `${label} is required.`,
      );
    }
    return result.value;
  };
  const readStringArrayAlias = (record, keys, label, pathName) => {
    const entries = keys
      .map((key) => ({ key, value: ownValue(record, key) }))
      .filter((entry) => entry.value !== undefined);
    if (entries.length > 1) {
      problems.push(
        `${label} must not use multiple aliases in ${pathName}: ${entries
          .map((entry) => entry.key)
          .join(", ")}`,
      );
    }
    if (entries.length === 0) {
      problems.push(`${label} is required.`);
      return [];
    }
    const entry = entries[0];
    if (!Array.isArray(entry.value)) {
      problems.push(`${label} must be an array.`);
      return [];
    }
    const values = entry.value.map((value) =>
      typeof value === "string" ? value.trim() : "",
    );
    if (
      values.length !== entry.value.length ||
      values.some((value) => !value)
    ) {
      problems.push(`${label} must contain only non-empty strings.`);
      return values.filter(Boolean);
    }
    return values;
  };
  const requireExactChecklist = (values, label) => {
    const required = new Set(REQUIRED_BSC_DEPLOYMENT_POST_DEPLOY_CHECKLIST);
    const seen = new Set();
    for (const value of values) {
      if (!required.has(value)) {
        problems.push(`${label} contains unsupported item ${value}.`);
      } else if (seen.has(value)) {
        problems.push(`${label} contains duplicate item ${value}.`);
      }
      seen.add(value);
    }
    for (const value of required) {
      if (!seen.has(value)) {
        problems.push(`${label} is missing required item ${value}.`);
      }
    }
  };
  if (schema !== BSC_DEPLOYMENT_EVIDENCE_SCHEMA) {
    problems.push(`schema must be ${BSC_DEPLOYMENT_EVIDENCE_SCHEMA}.`);
  }
  for (const key of Object.keys(json)) {
    if (!BSC_DEPLOYMENT_EVIDENCE_TOP_LEVEL_FIELDS.has(key)) {
      problems.push(`deploymentEvidence contains unsupported field ${key}.`);
    }
  }
  const routeId = readString({
    sources: [
      {
        record: json,
        keys: ["routeId", "route_id"],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence routeId",
  });
  if (routeId && routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(`routeId must be ${SCCP_BSC_XOR_ROUTE_ID}.`);
  }
  const assetKey = readString({
    sources: [
      {
        record: json,
        keys: ["assetKey", "asset_key"],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence assetKey",
  });
  if (assetKey && assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(`assetKey must be ${SCCP_BSC_XOR_ASSET_KEY}.`);
  }
  const bscNetwork = readString({
    sources: [
      {
        record: json,
        keys: ["bscNetwork", "bsc_network", "network"],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence BSC network",
    normalizeValue: (value) => trim(value).toLowerCase().replace(/_/gu, "-"),
  });
  const normalizedBscNetwork = (() => {
    if (!bscNetwork) {
      return null;
    }
    try {
      return resolveBscNetworkProfile(bscNetwork).key;
    } catch (_error) {
      return null;
    }
  })();
  const chain = readString({
    sources: [
      { record: json, keys: ["chain"], pathName: "deploymentEvidence" },
    ],
    label: "deployment evidence chain",
    normalizeValue: (value) => trim(value).toLowerCase(),
  });
  if (normalizedBscNetwork !== bscProfile.key) {
    problems.push(`BSC network must be ${bscProfile.key}.`);
  }
  if (chain !== bscProfile.chain) {
    problems.push(`chain must be ${bscProfile.chain}.`);
  }
  const chainIdHex = readString({
    sources: [
      {
        record: json,
        keys: ["chainIdHex", "chain_id_hex"],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence chainIdHex",
    normalizeValue: (value) => trim(value).toLowerCase(),
  });
  if (chainIdHex !== bscProfile.chainIdHex) {
    problems.push(`chainIdHex must be ${bscProfile.chainIdHex}.`);
  }
  const networkIdHex = readString({
    sources: [
      {
        record: json,
        keys: ["networkIdHex", "network_id_hex"],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence networkIdHex",
    normalizeValue: normalizeHex32,
  });
  if (networkIdHex !== bscProfile.networkIdHex) {
    problems.push(`networkIdHex must be ${bscProfile.networkIdHex}.`);
  }
  const rollout = readRecordAlias(
    json,
    ["destinationRollout", "destination_rollout"],
    "deployment evidence destinationRollout",
    "deploymentEvidence",
  );
  const binding = readRecordAlias(
    json,
    ["destinationBinding", "destination_binding"],
    "deployment evidence destinationBinding",
    "deploymentEvidence",
  );
  const readback = readRecordAlias(
    json,
    ["bscContractReadback", "bsc_contract_readback"],
    "deployment evidence bscContractReadback",
    "deploymentEvidence",
  );
  const compiledContractCodeHashesRecord = readRecordAlias(
    json,
    ["compiledContractCodeHashes", "compiled_contract_code_hashes"],
    "deployment evidence compiledContractCodeHashes",
    "deploymentEvidence",
  );
  if (!isRecord(rollout) || Object.keys(rollout).length === 0) {
    problems.push("destinationRollout is required.");
  }
  if (!isRecord(binding) || Object.keys(binding).length === 0) {
    problems.push("destinationBinding is required.");
  }
  if (!isRecord(readback) || Object.keys(readback).length === 0) {
    problems.push("bscContractReadback is required.");
  }
  for (const [record, fields, label] of [
    [rollout, BSC_DEPLOYMENT_ROLLOUT_FIELDS, "destinationRollout"],
    [binding, BSC_DEPLOYMENT_BINDING_FIELDS, "destinationBinding"],
  ]) {
    if (isRecord(record)) {
      for (const key of Object.keys(record)) {
        if (!fields.has(key)) {
          problems.push(`${label} contains unsupported field ${key}.`);
        }
      }
    }
  }
  const postDeployChecklist = readStringArrayAlias(
    json,
    ["postDeployChecklist", "post_deploy_checklist"],
    "deployment evidence postDeployChecklist",
    "deploymentEvidence",
  );
  requireExactChecklist(
    postDeployChecklist,
    "deployment evidence postDeployChecklist",
  );
  const compiledContractCodeHashes = readCodeHashMap(
    compiledContractCodeHashesRecord,
    "deployment evidence compiledContractCodeHashes",
  );
  const destinationRolloutVersion = readInteger(
    rollout,
    ["version"],
    "deployment evidence destinationRollout.version",
    "deploymentEvidence.destinationRollout",
  );
  const destinationBindingVersion = readInteger(
    binding,
    ["version"],
    "deployment evidence destinationBinding.version",
    "deploymentEvidence.destinationBinding",
  );
  if (destinationRolloutVersion !== 1) {
    problems.push("destinationRollout.version must be 1.");
  }
  if (destinationBindingVersion !== 1) {
    problems.push("destinationBinding.version must be 1.");
  }
  const bridgeAddress = readString({
    sources: [
      {
        record: json,
        keys: [
          "bscBridgeAddress",
          "bsc_bridge_address",
          "tairaXorBridgeAddress",
          "taira_xor_bridge_address",
          "bridgeAddress",
          "bridge_address",
        ],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["destinationBridgeAddress", "destination_bridge_address"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence bridge address",
    normalizeValue: normalizeEvmAddress,
  });
  const tokenAddress = readString({
    sources: [
      {
        record: json,
        keys: [
          "bscTokenAddress",
          "bsc_token_address",
          "tairaXorTokenAddress",
          "taira_xor_token_address",
          "tokenAddress",
          "token_address",
        ],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence token address",
    normalizeValue: normalizeEvmAddress,
  });
  const sourceBridgeAddress = readString({
    sources: [
      {
        record: json,
        keys: [
          "sccpBscSourceBridgeAddress",
          "sccp_bsc_source_bridge_address",
          "bscSourceBridgeAddress",
          "bsc_source_bridge_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ],
        pathName: "deploymentEvidence",
      },
    ],
    label: "deployment evidence source bridge address",
    normalizeValue: normalizeEvmAddress,
  });
  const verifierAddress = readString({
    sources: [
      {
        record: json,
        keys: [
          "bscVerifierAddress",
          "bsc_verifier_address",
          "destinationVerifierAddress",
          "destination_verifier_address",
          "verifierAddress",
          "verifier_address",
        ],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["verifierIdentity", "verifier_identity"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence verifier address",
    normalizeValue: normalizeEvmAddress,
  });
  if (
    [bridgeAddress, tokenAddress, sourceBridgeAddress, verifierAddress].filter(
      Boolean,
    ).length === 4 &&
    new Set([bridgeAddress, tokenAddress, sourceBridgeAddress, verifierAddress])
      .size !== 4
  ) {
    problems.push(
      "token, bridge, source bridge, and verifier addresses must be distinct.",
    );
  }
  const verifierCodeHash = readString({
    sources: [
      {
        record: json,
        keys: ["verifierCodeHash", "verifier_code_hash"],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["verifierCodeHash", "verifier_code_hash"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence verifierCodeHash",
    normalizeValue: normalizeHex32,
  });
  const verifierKeyHash = readString({
    sources: [
      {
        record: json,
        keys: ["verifierKeyHash", "verifier_key_hash"],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["verifierKeyHash", "verifier_key_hash"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence verifierKeyHash",
    normalizeValue: normalizeHex32,
  });
  const destinationBindingHash = readString({
    sources: [
      {
        record: json,
        keys: ["destinationBindingHash", "destination_binding_hash"],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["destinationBindingHash", "destination_binding_hash"],
        pathName: "deploymentEvidence.destinationRollout",
      },
      {
        record: binding,
        keys: ["bindingHash", "binding_hash"],
        pathName: "deploymentEvidence.destinationBinding",
      },
    ],
    label: "deployment evidence destinationBindingHash",
    normalizeValue: normalizeHex32,
  });
  const destinationBindingKey = readString({
    sources: [
      {
        record: json,
        keys: ["destinationBindingKey", "destination_binding_key"],
        pathName: "deploymentEvidence",
      },
      {
        record: rollout,
        keys: ["destinationBindingKey", "destination_binding_key"],
        pathName: "deploymentEvidence.destinationRollout",
      },
      {
        record: binding,
        keys: ["key", "destinationBindingKey", "destination_binding_key"],
        pathName: "deploymentEvidence.destinationBinding",
      },
    ],
    label: "deployment evidence destinationBindingKey",
  });
  const computedBindingHash =
    networkIdHex &&
    verifierAddress &&
    bridgeAddress &&
    verifierCodeHash &&
    verifierKeyHash
      ? bscDestinationBindingHash({
          networkId: networkIdHex,
          verifierAddress,
          bridgeAddress,
          verifierCodeHash,
          verifierKeyHash,
        })
      : null;
  const computedBindingKey =
    networkIdHex &&
    verifierAddress &&
    bridgeAddress &&
    verifierCodeHash &&
    verifierKeyHash
      ? bscDestinationBindingKey({
          networkId: networkIdHex,
          verifierAddress,
          bridgeAddress,
          verifierCodeHash,
          verifierKeyHash,
        })
      : null;
  if (
    computedBindingHash &&
    destinationBindingHash &&
    computedBindingHash !== destinationBindingHash
  ) {
    problems.push("destinationBindingHash does not match computed binding.");
  }
  if (
    computedBindingKey &&
    destinationBindingKey &&
    computedBindingKey !== destinationBindingKey
  ) {
    problems.push("destinationBindingKey does not match computed binding key.");
  }
  const rolloutNetworkId = readString({
    sources: [
      {
        record: rollout,
        keys: ["destinationNetworkId", "destination_network_id"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence destinationNetworkId",
    normalizeValue: normalizeHex32,
  });
  if (rolloutNetworkId !== bscProfile.networkIdHex) {
    problems.push(`destinationNetworkId must be ${bscProfile.networkIdHex}.`);
  }
  const bindingNetworkId = readString({
    sources: [
      {
        record: binding,
        keys: ["networkIdHex", "network_id_hex"],
        pathName: "deploymentEvidence.destinationBinding",
      },
    ],
    label: "deployment evidence destinationBinding.networkIdHex",
    normalizeValue: normalizeHex32,
  });
  if (bindingNetworkId !== bscProfile.networkIdHex) {
    problems.push(
      `destinationBinding.networkIdHex must be ${bscProfile.networkIdHex}.`,
    );
  }
  const rolloutSourceDomain = readInteger(
    rollout,
    ["sourceDomain", "source_domain"],
    "deployment evidence destinationRollout.sourceDomain",
    "deploymentEvidence.destinationRollout",
  );
  const rolloutTargetDomain = readInteger(
    rollout,
    ["targetDomain", "target_domain"],
    "deployment evidence destinationRollout.targetDomain",
    "deploymentEvidence.destinationRollout",
  );
  const bindingSourceDomain = readInteger(
    binding,
    ["sourceDomain", "source_domain"],
    "deployment evidence destinationBinding.sourceDomain",
    "deploymentEvidence.destinationBinding",
  );
  const bindingTargetDomain = readInteger(
    binding,
    ["targetDomain", "target_domain"],
    "deployment evidence destinationBinding.targetDomain",
    "deploymentEvidence.destinationBinding",
  );
  for (const [label, value, expected] of [
    ["destinationRollout.sourceDomain", rolloutSourceDomain, SCCP_DOMAIN_SORA],
    ["destinationRollout.targetDomain", rolloutTargetDomain, SCCP_DOMAIN_BSC],
    ["destinationBinding.sourceDomain", bindingSourceDomain, SCCP_DOMAIN_SORA],
    ["destinationBinding.targetDomain", bindingTargetDomain, SCCP_DOMAIN_BSC],
  ]) {
    if (value !== expected) {
      problems.push(`${label} must be ${expected}.`);
    }
  }
  const verifierBackend = readString({
    sources: [
      {
        record: rollout,
        keys: ["verifierBackend", "verifier_backend"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence verifierBackend",
  });
  if (verifierBackend !== BSC_EVM_GROTH16_BACKEND) {
    problems.push(`verifierBackend must be ${BSC_EVM_GROTH16_BACKEND}.`);
  }
  const proofFamily = readString({
    sources: [
      {
        record: rollout,
        keys: ["proofFamily", "proof_family"],
        pathName: "deploymentEvidence.destinationRollout",
      },
    ],
    label: "deployment evidence proofFamily",
  });
  if (proofFamily !== SCCP_PROOF_FAMILY_STARK_FRI) {
    problems.push(`proofFamily must be ${SCCP_PROOF_FAMILY_STARK_FRI}.`);
  }
  if (verifierKeyHash && isKnownDiagnosticBscVerifierKeyHash(verifierKeyHash)) {
    problems.push(
      "verifierKeyHash is a known diagnostic BSC verifier key hash.",
    );
  }
  problems.push(
    ...roleSeparatedProductionHashProblems(
      {
        verifierCodeHash,
        verifierKeyHash,
        destinationBindingHash,
      },
      "BSC deployment evidence",
      ["verifierCodeHash", "verifierKeyHash", "destinationBindingHash"],
    ),
  );
  let readbackSummary = null;
  if (isRecord(readback) && Object.keys(readback).length > 0) {
    for (const key of Object.keys(readback)) {
      if (!BSC_DEPLOYMENT_READBACK_FIELDS.has(key)) {
        problems.push(`bscContractReadback contains unsupported field ${key}.`);
      }
    }
    const codePresent = ownValue(readback, "codePresent");
    if (!isRecord(codePresent)) {
      problems.push("bscContractReadback.codePresent is required.");
    } else {
      for (const key of Object.keys(codePresent)) {
        if (!BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS.has(key)) {
          problems.push(
            `bscContractReadback.codePresent contains unsupported field ${key}.`,
          );
        }
      }
      for (const key of BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS) {
        if (ownValue(codePresent, key) !== true) {
          problems.push(`bscContractReadback.codePresent.${key} must be true.`);
        }
      }
    }
    const readbackCodeHashesRecord = readRecordAlias(
      readback,
      ["codeHashes", "code_hashes"],
      "deployment evidence bscContractReadback.codeHashes",
      "deploymentEvidence.bscContractReadback",
    );
    const readbackCodeHashes = readCodeHashMap(
      readbackCodeHashesRecord,
      "deployment evidence bscContractReadback.codeHashes",
    );
    if (
      readbackCodeHashes &&
      readbackCodeHashes.verifier !== normalizeHex32(verifierCodeHash)
    ) {
      problems.push(
        "bscContractReadback.codeHashes.verifier must match verifierCodeHash.",
      );
    }
    if (compiledContractCodeHashes && readbackCodeHashes) {
      for (const key of BSC_DEPLOYMENT_READBACK_CODE_PRESENT_FIELDS) {
        if (compiledContractCodeHashes[key] !== readbackCodeHashes[key]) {
          problems.push(
            `compiledContractCodeHashes.${key} must match bscContractReadback.codeHashes.${key}.`,
          );
        }
      }
    }
    const readbackChainId = trim(
      ownValue(readback, "chainIdHex"),
    ).toLowerCase();
    if (readbackChainId !== bscProfile.chainIdHex) {
      problems.push(
        `bscContractReadback.chainIdHex must be ${bscProfile.chainIdHex}.`,
      );
    }
    const readbackValues = {};
    const readbackComparisons = [
      [
        "tokenAddress",
        "bscContractReadback.tokenAddress",
        tokenAddress,
        normalizeEvmAddress,
      ],
      [
        "bridgeAddress",
        "bscContractReadback.bridgeAddress",
        bridgeAddress,
        normalizeEvmAddress,
      ],
      [
        "sourceBridgeAddress",
        "bscContractReadback.sourceBridgeAddress",
        sourceBridgeAddress,
        normalizeEvmAddress,
      ],
      [
        "verifierAddress",
        "bscContractReadback.verifierAddress",
        verifierAddress,
        normalizeEvmAddress,
      ],
      [
        "tokenBridgeAddress",
        "bscContractReadback.tokenBridgeAddress",
        bridgeAddress,
        normalizeEvmAddress,
      ],
      [
        "sourceBridgeOwner",
        "bscContractReadback.sourceBridgeOwner",
        bridgeAddress,
        normalizeEvmAddress,
      ],
      [
        "bridgeDestinationBindingHash",
        "bscContractReadback.bridgeDestinationBindingHash",
        destinationBindingHash,
        normalizeHex32,
      ],
      [
        "bridgeVerifierAddress",
        "bscContractReadback.bridgeVerifierAddress",
        verifierAddress,
        normalizeEvmAddress,
      ],
      [
        "bridgeVerifierCodeHash",
        "bscContractReadback.bridgeVerifierCodeHash",
        verifierCodeHash,
        normalizeHex32,
      ],
      [
        "bridgeVerifierKeyHash",
        "bscContractReadback.bridgeVerifierKeyHash",
        verifierKeyHash,
        normalizeHex32,
      ],
      [
        "verifierKeyHash",
        "bscContractReadback.verifierKeyHash",
        verifierKeyHash,
        normalizeHex32,
      ],
      [
        "bridgeNetworkId",
        "bscContractReadback.bridgeNetworkId",
        bscProfile.networkIdHex,
        normalizeHex32,
      ],
    ];
    for (const [key, label, expected, normalizeValue] of readbackComparisons) {
      const actual = normalizeValue(ownValue(readback, key));
      readbackValues[key] = actual;
      if (!actual || !expected || actual !== expected) {
        problems.push(`${label} must match deployment evidence.`);
      }
    }
    if (ownValue(readback, "tokenBridgeLocked") !== true) {
      problems.push("bscContractReadback.tokenBridgeLocked must be true.");
    }
    const readbackSourceDomain = readInteger(
      readback,
      ["bridgeSourceDomain", "bridge_source_domain"],
      "bscContractReadback.bridgeSourceDomain",
      "deploymentEvidence.bscContractReadback",
    );
    const readbackTargetDomain = readInteger(
      readback,
      ["bridgeTargetDomain", "bridge_target_domain"],
      "bscContractReadback.bridgeTargetDomain",
      "deploymentEvidence.bscContractReadback",
    );
    if (readbackSourceDomain !== SCCP_DOMAIN_SORA) {
      problems.push(
        `bscContractReadback.bridgeSourceDomain must be ${SCCP_DOMAIN_SORA}.`,
      );
    }
    if (readbackTargetDomain !== SCCP_DOMAIN_BSC) {
      problems.push(
        `bscContractReadback.bridgeTargetDomain must be ${SCCP_DOMAIN_BSC}.`,
      );
    }
    readbackSummary = {
      chainIdHex: readbackChainId || null,
      codePresent: isRecord(codePresent)
        ? {
            token: ownValue(codePresent, "token") === true,
            bridge: ownValue(codePresent, "bridge") === true,
            sourceBridge: ownValue(codePresent, "sourceBridge") === true,
            verifier: ownValue(codePresent, "verifier") === true,
          }
        : null,
      codeHashes: readbackCodeHashes,
      tokenAddress: readbackValues.tokenAddress ?? null,
      bridgeAddress: readbackValues.bridgeAddress ?? null,
      sourceBridgeAddress: readbackValues.sourceBridgeAddress ?? null,
      verifierAddress: readbackValues.verifierAddress ?? null,
      tokenBridgeAddress: readbackValues.tokenBridgeAddress ?? null,
      tokenBridgeLocked: ownValue(readback, "tokenBridgeLocked") === true,
      sourceBridgeOwner: readbackValues.sourceBridgeOwner ?? null,
      bridgeDestinationBindingHash:
        readbackValues.bridgeDestinationBindingHash ?? null,
      bridgeVerifierAddress: readbackValues.bridgeVerifierAddress ?? null,
      bridgeVerifierCodeHash: readbackValues.bridgeVerifierCodeHash ?? null,
      bridgeVerifierKeyHash: readbackValues.bridgeVerifierKeyHash ?? null,
      verifierKeyHash: readbackValues.verifierKeyHash ?? null,
      bridgeNetworkId: readbackValues.bridgeNetworkId ?? null,
      bridgeSourceDomain: readbackSourceDomain,
      bridgeTargetDomain: readbackTargetDomain,
    };
  }
  return {
    looksLikeDeploymentEvidence: true,
    schema,
    valid: problems.length === 0,
    problems,
    routeId,
    assetKey,
    bscNetwork: normalizedBscNetwork,
    chain,
    chainIdHex,
    networkIdHex,
    bridgeAddress,
    tokenAddress,
    sourceBridgeAddress,
    verifierAddress,
    verifierCodeHash,
    verifierKeyHash,
    destinationBindingHash,
    destinationBindingKey,
    destinationRolloutVersion,
    destinationBindingVersion,
    compiledContractCodeHashes,
    postDeployChecklist,
    bscContractReadback: readbackSummary,
  };
};

const TAIRA_BSC_BURN_RECORD_SOURCE_NAME =
  "contracts/taira/sccp/TairaXorBscSccpBurnRecord.ko";
const TAIRA_BURN_RECORD_ENTRYPOINT = "burn_and_record";
const TAIRA_BURN_RECORD_PARAM_SIGNATURE =
  "sender:AccountId,settlement_asset:AssetDefinitionId,amount:Amount,record_instruction:bytes";

const tairaBurnRecordContractMetadata = ({ json, text }) => {
  if (trim(ownValue(json, "schema")) !== TAIRA_BURN_RECORD_CONTRACT_SCHEMA) {
    return {
      looksLikeTairaBurnRecordContract: false,
      problems: [],
      artifactProductionProblems: [],
    };
  }
  const problems = [];
  const routeIdResult = readConsistentMaterialString({
    json,
    text,
    keys: ["routeId", "route_id"],
    label: "tairaBurnRecordContract.routeId",
    rejectDuplicateAliases: true,
  });
  const assetKeyResult = readConsistentMaterialString({
    json,
    text,
    keys: ["assetKey", "asset_key"],
    label: "tairaBurnRecordContract.assetKey",
    rejectDuplicateAliases: true,
  });
  const codeHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["codeHash", "code_hash"],
    label: "tairaBurnRecordContract.codeHash",
    normalizeValue: normalizeOptionalPrefixHex32,
    rejectDuplicateAliases: true,
  });
  const abiHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["abiHash", "abi_hash"],
    label: "tairaBurnRecordContract.abiHash",
    normalizeValue: normalizeOptionalPrefixHex32,
    rejectDuplicateAliases: true,
  });
  const artifactB64Result = readConsistentMaterialString({
    json,
    text,
    keys: [
      "artifactB64",
      "artifact_b64",
      "contractArtifactB64",
      "contract_artifact_b64",
    ],
    label: "tairaBurnRecordContract.artifactB64",
    rejectDuplicateAliases: true,
  });
  const artifactSha256Result = readConsistentMaterialString({
    json,
    text,
    keys: ["artifactSha256", "artifact_sha256", "contractArtifactSha256"],
    label: "tairaBurnRecordContract.artifactSha256",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  problems.push(
    ...routeIdResult.conflicts,
    ...assetKeyResult.conflicts,
    ...codeHashResult.conflicts,
    ...abiHashResult.conflicts,
    ...artifactB64Result.conflicts,
    ...artifactSha256Result.conflicts,
  );
  const routeId = routeIdResult.value;
  const assetKey = assetKeyResult.value;
  const codeHash = codeHashResult.value;
  const abiHash = abiHashResult.value;
  const artifactSha256 = artifactSha256Result.value;
  if (routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(
      `TAIRA burn-record contract route_id must be ${SCCP_BSC_XOR_ROUTE_ID}.`,
    );
  }
  if (assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(
      `TAIRA burn-record contract asset_key must be ${SCCP_BSC_XOR_ASSET_KEY}.`,
    );
  }
  const sourceName = trim(
    ownValue(json, "source_name") ?? ownValue(json, "sourceName"),
  );
  if (sourceName !== TAIRA_BSC_BURN_RECORD_SOURCE_NAME) {
    problems.push(
      `TAIRA burn-record contract source_name must be ${TAIRA_BSC_BURN_RECORD_SOURCE_NAME}.`,
    );
  }
  const compilerFingerprint = trim(
    ownValue(json, "compiler_fingerprint") ??
      ownValue(json, "compilerFingerprint"),
  );
  if (!/^kotodama_lang\/[0-9][0-9A-Za-z.+-]*$/u.test(compilerFingerprint)) {
    problems.push(
      "TAIRA burn-record contract compiler_fingerprint must identify a Kotodama compiler version.",
    );
  }
  if (!codeHash) {
    problems.push(
      "TAIRA burn-record contract code_hash is missing or invalid.",
    );
  }
  if (!abiHash) {
    problems.push("TAIRA burn-record contract abi_hash is missing or invalid.");
  }
  let artifactBytes = null;
  const artifactProductionProblems = [];
  if (!artifactB64Result.value) {
    problems.push("TAIRA burn-record contract artifact_b64 is missing.");
  } else {
    try {
      artifactBytes = strictBase64DecodedBytes(
        artifactB64Result.value,
        "tairaBurnRecordContract.artifactB64",
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!artifactSha256) {
    problems.push(
      "TAIRA burn-record contract artifact_sha256 is missing or invalid.",
    );
  } else if (artifactBytes) {
    const actualSha256 = `0x${createHash("sha256")
      .update(artifactBytes)
      .digest("hex")}`;
    if (actualSha256 !== artifactSha256) {
      problems.push(
        "TAIRA burn-record contract artifactSha256 does not match artifactB64.",
      );
    }
  }
  if (artifactBytes) {
    artifactProductionProblems.push(
      ...bscBurnRecordProductionArtifactProblems(
        artifactBytes,
        "tairaBurnRecordContract.artifactB64",
      ),
    );
  }
  const manifest = ownValue(json, "manifest");
  if (!isRecord(manifest)) {
    problems.push("TAIRA burn-record contract manifest must be an object.");
  }
  if (isRecord(manifest) && ownValue(manifest, "features_bitmap") !== 1) {
    problems.push(
      "TAIRA burn-record contract manifest.features_bitmap must carry the IVM ZK feature bit.",
    );
  }
  for (const [label, value, expected] of [
    ["manifest.code_hash", ownValue(manifest, "code_hash"), codeHash],
    ["manifest.abi_hash", ownValue(manifest, "abi_hash"), abiHash],
  ]) {
    const textValue = trim(value).toLowerCase();
    if (expected && textValue && !textValue.includes(expected.slice(2))) {
      problems.push(
        `TAIRA burn-record contract ${label} does not bind ${expected}.`,
      );
    }
  }
  const entrypoints =
    isRecord(manifest) && Array.isArray(ownValue(manifest, "entrypoints"))
      ? ownArrayValues(ownValue(manifest, "entrypoints")).filter(isRecord)
      : [];
  const entrypoint = entrypoints.find(
    (entry) => trim(ownValue(entry, "name")) === TAIRA_BURN_RECORD_ENTRYPOINT,
  );
  if (!entrypoint) {
    problems.push(
      `TAIRA burn-record contract manifest must expose ${TAIRA_BURN_RECORD_ENTRYPOINT}.`,
    );
  }
  const permission = trim(ownValue(entrypoint, "permission"));
  if (entrypoint && permission !== "AssetTransferRole") {
    problems.push(
      "TAIRA burn-record contract burn_and_record permission must be AssetTransferRole.",
    );
  }
  const params =
    entrypoint && Array.isArray(ownValue(entrypoint, "params"))
      ? ownArrayValues(ownValue(entrypoint, "params")).filter(isRecord)
      : [];
  const paramSignature = params
    .map(
      (param) =>
        `${trim(ownValue(param, "name"))}:${trim(
          ownValue(param, "type_name") ?? ownValue(param, "typeName"),
        )}`,
    )
    .join(",");
  if (entrypoint && paramSignature !== TAIRA_BURN_RECORD_PARAM_SIGNATURE) {
    problems.push(
      `TAIRA burn-record contract burn_and_record params must be ${TAIRA_BURN_RECORD_PARAM_SIGNATURE}.`,
    );
  }
  const execution = ownValue(json, "execution");
  if (!isRecord(execution)) {
    problems.push("TAIRA burn-record contract execution must be an object.");
  }
  const executable = trim(ownValue(execution, "executable"));
  const forceZkMode =
    ownValue(execution, "force_zk_mode") === true ||
    ownValue(execution, "forceZkMode") === true;
  const executionEntrypoint = trim(ownValue(execution, "entrypoint"));
  const settlementInstruction = trim(
    ownValue(execution, "settlement_instruction") ??
      ownValue(execution, "settlementInstruction"),
  );
  const recordInstruction = trim(
    ownValue(execution, "record_instruction") ??
      ownValue(execution, "recordInstruction"),
  );
  if (executable !== "IvmProved") {
    problems.push(
      "TAIRA burn-record contract execution.executable must be IvmProved.",
    );
  }
  if (!forceZkMode) {
    problems.push(
      "TAIRA burn-record contract execution.force_zk_mode must be true.",
    );
  }
  if (executionEntrypoint !== TAIRA_BURN_RECORD_ENTRYPOINT) {
    problems.push(
      `TAIRA burn-record contract execution.entrypoint must be ${TAIRA_BURN_RECORD_ENTRYPOINT}.`,
    );
  }
  if (settlementInstruction !== "Burn<Numeric, Asset>") {
    problems.push(
      "TAIRA burn-record contract settlement_instruction must be Burn<Numeric, Asset>.",
    );
  }
  if (recordInstruction !== "RecordSccpMessage") {
    problems.push(
      "TAIRA burn-record contract record_instruction must be RecordSccpMessage.",
    );
  }
  problems.push(
    ...repeatedByteHex32MaterialProblems(
      { codeHash, abiHash, artifactSha256 },
      "TAIRA burn-record contract",
    ),
    ...roleSeparatedProductionHashProblems(
      { codeHash, abiHash, artifactSha256 },
      "TAIRA burn-record contract",
      ["codeHash", "abiHash", "artifactSha256"],
    ),
  );
  return {
    looksLikeTairaBurnRecordContract: true,
    valid: problems.length === 0 && artifactProductionProblems.length === 0,
    schema: TAIRA_BURN_RECORD_CONTRACT_SCHEMA,
    problems,
    artifactProductionProblems,
    routeId,
    assetKey,
    sourceName,
    compilerFingerprint,
    codeHash,
    abiHash,
    artifactSha256,
    artifactSizeBytes: artifactBytes?.length ?? 0,
    entrypoint: entrypoint ? TAIRA_BURN_RECORD_ENTRYPOINT : null,
    permission,
    paramSignature,
    executable,
    forceZkMode,
    settlementInstruction,
    recordInstruction,
  };
};

const routeManifestUpsertIsiMetadata = ({ json, bscProfile }) => {
  if (trim(ownValue(json, "schema")) !== BSC_ROUTE_MANIFEST_ISI_SCHEMA) {
    return {
      looksLikeRouteManifestUpsertIsi: false,
      problems: [],
    };
  }
  const routeKey = ownValue(json, "routeKey") ?? ownValue(json, "route_key");
  const instruction = ownValue(json, "instruction");
  const upsert = ownValue(instruction, "UpsertSccpRouteManifest");
  const manifest = ownValue(upsert, "manifest");
  const routeId = trim(ownValue(json, "routeId") ?? ownValue(json, "route_id"));
  const assetKey = trim(
    ownValue(json, "assetKey") ?? ownValue(json, "asset_key"),
  );
  const routeKeyRouteId = trim(
    ownValue(routeKey, "routeId") ?? ownValue(routeKey, "route_id"),
  );
  const routeKeyAssetKey = trim(
    ownValue(routeKey, "assetKey") ?? ownValue(routeKey, "asset_key"),
  );
  const routeKeyChainIdHex = trim(
    ownValue(routeKey, "chainIdHex") ?? ownValue(routeKey, "chain_id_hex"),
  );
  const routeKeyCounterpartyDomain = Number(
    ownValue(routeKey, "counterpartyDomain") ??
      ownValue(routeKey, "counterparty_domain"),
  );
  const manifestRouteId = trim(
    ownValue(manifest, "route_id") ?? ownValue(manifest, "routeId"),
  );
  const manifestAssetKey = trim(
    ownValue(manifest, "asset_key") ?? ownValue(manifest, "assetKey"),
  );
  const manifestChain = trim(ownValue(manifest, "chain"));
  const manifestLegacyNetwork = trim(
    ownValue(manifest, "tron_network") ??
      ownValue(manifest, "legacyTronNetwork"),
  );
  const manifestChainIdHex = trim(
    ownValue(manifest, "chain_id_hex") ?? ownValue(manifest, "chainIdHex"),
  );
  const manifestNetworkIdHex = normalizeHex32(
    ownValue(manifest, "network_id_hex") ?? ownValue(manifest, "networkIdHex"),
  );
  const manifestCounterpartyDomain = Number(
    ownValue(manifest, "counterparty_domain") ??
      ownValue(manifest, "counterpartyDomain"),
  );
  const productionReady =
    ownValue(json, "productionReady") ?? ownValue(json, "production_ready");
  const manifestProductionReady =
    ownValue(manifest, "production_ready") ??
    ownValue(manifest, "productionReady");
  const manifestSha256 = normalizeHex32(
    ownValue(json, "manifestSha256") ?? ownValue(json, "manifest_sha256"),
  );
  const requiredPermission = trim(
    ownValue(json, "requiredPermission") ??
      ownValue(json, "required_permission"),
  );
  const submission = ownValue(json, "submission");
  let submissionSummary = undefined;
  const problems = [];
  if (!isRecord(routeKey)) {
    problems.push("routeKey must be an object.");
  }
  if (!isRecord(instruction) || !isRecord(upsert) || !isRecord(manifest)) {
    problems.push(
      "instruction.UpsertSccpRouteManifest.manifest must be an object.",
    );
  }
  if (requiredPermission !== "CanManageSccpRouteManifests") {
    problems.push("requiredPermission must be CanManageSccpRouteManifests.");
  }
  if (!manifestSha256) {
    problems.push("manifestSha256 must be a non-zero 32-byte hex value.");
  }
  if (submission !== undefined) {
    if (!isRecord(submission)) {
      problems.push("submission must be an object when present.");
    } else {
      const submitted = ownValue(submission, "submitted");
      const toriiUrl = trim(ownValue(submission, "toriiUrl"));
      const chainId = trim(ownValue(submission, "chainId"));
      const authority = trim(ownValue(submission, "authority"));
      const hash = normalizeTransactionHash(ownValue(submission, "hash"));
      const submittedHash = normalizeTransactionHash(
        ownValue(submission, "submittedHash"),
      );
      const statusKind = trim(
        ownValue(submission, "statusKind") ??
          ownValue(submission, "status_kind"),
      );
      const gasAssetId = normalizeCanonicalTairaAssetDefinitionId(
        ownValue(submission, "gasAssetId") ??
          ownValue(submission, "gas_asset_id"),
      );
      const waitForCommit =
        ownValue(submission, "waitForCommit") ??
        ownValue(submission, "wait_for_commit");
      if (submitted !== true) {
        problems.push("submission.submitted must be true.");
      }
      if (!isSafeEvidenceHttpUrl(toriiUrl)) {
        problems.push(
          "submission.toriiUrl must be HTTPS or loopback HTTP without credentials.",
        );
      }
      if (chainId !== BSC_TAIRA_CHAIN_ID) {
        problems.push(`submission.chainId must be ${BSC_TAIRA_CHAIN_ID}.`);
      }
      if (!authority) {
        problems.push("submission.authority must be non-empty.");
      }
      if (!hash) {
        problems.push("submission.hash must be a non-zero 32-byte hex value.");
      }
      if (!submittedHash) {
        problems.push(
          "submission.submittedHash must be a non-zero 32-byte hex value.",
        );
      }
      if (hash && submittedHash && hash !== submittedHash) {
        problems.push("submission.hash must match submission.submittedHash.");
      }
      if (!statusKind) {
        problems.push("submission.statusKind must be non-empty.");
      }
      if (typeof waitForCommit !== "boolean") {
        problems.push("submission.waitForCommit must be boolean.");
      }
      if (waitForCommit === true && statusKind !== "Applied") {
        problems.push(
          "submission.statusKind must be Applied when waitForCommit is true.",
        );
      }
      if (!gasAssetId) {
        problems.push(
          "submission.gasAssetId must be a canonical Base58 TAIRA asset definition id.",
        );
      }
      submissionSummary = {
        submitted: submitted === true,
        toriiUrl,
        chainId,
        authority,
        hash,
        submittedHash,
        statusKind,
        gasAssetId,
        waitForCommit,
      };
    }
  }
  for (const [label, value] of [
    ["routeId", routeId],
    ["routeKey.routeId", routeKeyRouteId],
    ["manifest.route_id", manifestRouteId],
  ]) {
    if (value !== SCCP_BSC_XOR_ROUTE_ID) {
      problems.push(`${label} must be ${SCCP_BSC_XOR_ROUTE_ID}.`);
    }
  }
  for (const [label, value] of [
    ["assetKey", assetKey],
    ["routeKey.assetKey", routeKeyAssetKey],
    ["manifest.asset_key", manifestAssetKey],
  ]) {
    if (value !== SCCP_BSC_XOR_ASSET_KEY) {
      problems.push(`${label} must be ${SCCP_BSC_XOR_ASSET_KEY}.`);
    }
  }
  if (routeKeyChainIdHex !== bscProfile.chainIdHex) {
    problems.push(`routeKey.chainIdHex must be ${bscProfile.chainIdHex}.`);
  }
  if (routeKeyCounterpartyDomain !== SCCP_DOMAIN_BSC) {
    problems.push(`routeKey.counterpartyDomain must be ${SCCP_DOMAIN_BSC}.`);
  }
  if (manifestChain !== bscProfile.chain) {
    problems.push(`manifest.chain must be ${bscProfile.chain}.`);
  }
  if (manifestLegacyNetwork && manifestLegacyNetwork !== bscProfile.chain) {
    problems.push(`manifest.tron_network must be ${bscProfile.chain}.`);
  }
  if (manifestChainIdHex !== bscProfile.chainIdHex) {
    problems.push(`manifest.chain_id_hex must be ${bscProfile.chainIdHex}.`);
  }
  if (manifestNetworkIdHex !== normalizeHex32(bscProfile.networkIdHex)) {
    problems.push(
      `manifest.network_id_hex must be ${bscProfile.networkIdHex}.`,
    );
  }
  if (manifestCounterpartyDomain !== SCCP_DOMAIN_BSC) {
    problems.push(`manifest.counterparty_domain must be ${SCCP_DOMAIN_BSC}.`);
  }
  if (
    typeof productionReady !== "boolean" ||
    typeof manifestProductionReady !== "boolean" ||
    productionReady !== manifestProductionReady
  ) {
    problems.push(
      "productionReady must be boolean and match manifest.production_ready.",
    );
  }
  return {
    looksLikeRouteManifestUpsertIsi: true,
    valid: problems.length === 0,
    schema: BSC_ROUTE_MANIFEST_ISI_SCHEMA,
    problems,
    routeId,
    assetKey,
    chain: manifestChain,
    chainIdHex: manifestChainIdHex,
    networkIdHex: manifestNetworkIdHex,
    counterpartyDomain: manifestCounterpartyDomain,
    requiredPermission,
    manifestSha256,
    productionReady,
    submission: submissionSummary,
  };
};

const bscRoutePublicationTimestampMs = (filePath) => {
  const match = path.basename(filePath).match(/(\d{8})T(\d{6})Z/u);
  if (!match) {
    return 0;
  }
  const [, datePart, timePart] = match;
  const timestamp = Date.parse(
    `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(
      6,
      8,
    )}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(
      4,
      6,
    )}Z`,
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const positiveSafeInteger = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
};

const bscRoutePublicationBlockHeight = (json) => {
  const submission = ownValue(json, "submission");
  const status = ownValue(submission, "status");
  const transactionStatus = ownValue(status, "status");
  return (
    positiveSafeInteger(ownValue(submission, "blockHeight")) ||
    positiveSafeInteger(ownValue(submission, "block_height")) ||
    positiveSafeInteger(ownValue(transactionStatus, "block_height")) ||
    positiveSafeInteger(
      ownValue(ownValue(transactionStatus, "content"), "block_height"),
    )
  );
};

const inspectBscRoutePublicationCandidate = async (filePath, bscProfile) => {
  let info;
  try {
    info = await lstat(filePath);
  } catch (_error) {
    return null;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    return null;
  }
  if (info.size > SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES) {
    return null;
  }
  let json;
  try {
    json = parseJsonWithoutDuplicateKeys(
      await readFile(filePath, "utf8"),
      publicPath(filePath),
    );
  } catch (_error) {
    return null;
  }
  if (!isRecord(json)) {
    return null;
  }
  const metadata = routeManifestUpsertIsiMetadata({ json, bscProfile });
  if (
    metadata.valid !== true ||
    metadata.productionReady !== true ||
    metadata.submission?.submitted !== true ||
    metadata.submission?.statusKind !== "Applied" ||
    !normalizeTransactionHash(metadata.submission?.submittedHash)
  ) {
    return null;
  }
  return {
    filePath,
    blockHeight: bscRoutePublicationBlockHeight(json),
    timestampMs: bscRoutePublicationTimestampMs(filePath),
    mtimeMs: Number.isFinite(info.mtimeMs) ? info.mtimeMs : 0,
    submittedHash: metadata.submission.submittedHash,
  };
};

export const resolveLatestBscSccpRouteManifestPublicationIsiPath = async (
  input = {},
) => {
  const bscProfile = resolveBscNetworkProfile(
    ownValue(input, "bscNetwork") ?? "testnet",
  );
  const searchDirs = parseList(ownValue(input, "searchDirs"));
  const directories = searchDirs.length
    ? searchDirs
    : BSC_ROUTE_MANIFEST_PUBLICATION_SEARCH_DIRS[bscProfile.key];
  const filePattern =
    BSC_ROUTE_MANIFEST_PUBLICATION_FILE_PATTERNS[bscProfile.key];
  const candidates = [];
  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !filePattern.test(entry.name)) {
        continue;
      }
      const inspected = await inspectBscRoutePublicationCandidate(
        path.join(directory, entry.name),
        bscProfile,
      );
      if (inspected) {
        candidates.push(inspected);
      }
    }
  }
  candidates.sort((left, right) => {
    const timestampDiff = right.timestampMs - left.timestampMs;
    if (timestampDiff !== 0) {
      return timestampDiff;
    }
    const mtimeDiff = right.mtimeMs - left.mtimeMs;
    if (mtimeDiff !== 0) {
      return mtimeDiff;
    }
    const blockDiff = right.blockHeight - left.blockHeight;
    if (blockDiff !== 0) {
      return blockDiff;
    }
    return publicPath(right.filePath).localeCompare(publicPath(left.filePath));
  });
  return candidates[0]?.filePath ?? null;
};

export const bscSccpProductionMaterialScanPathsWithLatestPublication = async (
  input = {},
) => {
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const scanPaths = [...bscSccpProductionMaterialScanPaths(bscNetwork)];
  const latestPublicationPath =
    await resolveLatestBscSccpRouteManifestPublicationIsiPath({
      bscNetwork,
      searchDirs: ownValue(input, "publicationSearchDirs"),
    });
  return Object.freeze(
    latestPublicationPath
      ? uniqueResolvedPaths([...scanPaths, latestPublicationPath])
      : scanPaths,
  );
};

const routeMetadata = ({ filePath, text, json, bscProfile }) => {
  if (
    trim(ownValue(json, "schema")) === PRODUCTION_REQUIREMENTS_SCHEMA ||
    trim(ownValue(json, "schema")) === SOURCE_PARITY_ATTESTATION_SCHEMA ||
    trim(ownValue(json, "schema")) === BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA ||
    trim(ownValue(json, "schema")) === BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA ||
    BSC_GROTH16_ATTESTATION_SCHEMAS.has(trim(ownValue(json, "schema"))) ||
    BSC_GROTH16_TRANSCRIPT_SCHEMAS.has(trim(ownValue(json, "schema"))) ||
    trim(ownValue(json, "schema")) === OFFLINE_FULL_TOML_EVIDENCE_SCHEMA ||
    trim(ownValue(json, "schema")) === BSC_DEPLOYMENT_EVIDENCE_SCHEMA ||
    trim(ownValue(json, "schema")) === TAIRA_BURN_RECORD_CONTRACT_SCHEMA ||
    trim(ownValue(json, "schema")) === BSC_ROUTE_MANIFEST_ISI_SCHEMA
  ) {
    return {
      looksLikeRoute: false,
      problems: [],
    };
  }
  const problems = [];
  const routeIdResult = readConsistentMaterialString({
    json,
    text,
    keys: ["routeId", "route_id"],
    label: "routeId",
  });
  const assetKeyResult = readConsistentMaterialString({
    json,
    text,
    keys: ["assetKey", "asset_key", "assetId", "asset_id"],
    label: "assetKey",
  });
  const productionReadyResult = readConsistentMaterialBoolean({
    json,
    text,
    keys: ["productionReady", "production_ready"],
    label: "productionReady",
  });
  const disabledReason =
    readNestedString(json, ["disabledReason", "disabled_reason"]) ||
    readTomlLikeString(text, ["disabled_reason", "disabledReason"]);
  const verifierKeyHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["verifierKeyHash", "verifier_key_hash"],
    label: "verifierKeyHash",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  const verifierCodeHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["verifierCodeHash", "verifier_code_hash"],
    label: "verifierCodeHash",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  const proofArtifactHashResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "circuitArtifactHash",
      "circuit_artifact_hash",
    ],
    label: "proofArtifactHash",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  const provingKeyHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["provingKeyHash", "proving_key_hash"],
    label: "provingKeyHash",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  const nativeEvmProverBundleHashResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "nativeEvmProverBundleHash",
      "native_evm_prover_bundle_hash",
      "nativeProverBundleHash",
      "native_prover_bundle_hash",
    ],
    label: "nativeEvmProverBundleHash",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  const destinationBindingHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["destinationBindingHash", "destination_binding_hash", "bindingHash"],
    label: "destinationBindingHash",
    normalizeValue: normalizeHex32,
  });
  const settlementAssetDefinitionIdResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "settlementAssetDefinitionId",
      "settlement_asset_definition_id",
      "tairaBurnRecordSettlementAssetDefinitionId",
      "taira_burn_record_settlement_asset_definition_id",
      "tairaXorBurnRecordSettlementAssetDefinitionId",
      "taira_xor_burn_record_settlement_asset_definition_id",
    ],
    label: "settlementAssetDefinitionId",
    rejectDuplicateAliases: true,
  });
  const bridgeAddressResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "bridgeAddress",
      "bridge_address",
      "bscBridgeAddress",
      "bsc_bridge_address",
      "tairaXorBridgeAddress",
      "taira_xor_bridge_address",
      "evmBridgeAddress",
      "evm_bridge_address",
    ],
    label: "bridgeAddress",
    normalizeValue: normalizeEvmAddress,
    rejectDuplicateAliases: true,
  });
  const tokenAddressResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "tokenAddress",
      "token_address",
      "bscTokenAddress",
      "bsc_token_address",
      "tairaXorTokenAddress",
      "taira_xor_token_address",
      "evmTokenAddress",
      "evm_token_address",
    ],
    label: "tokenAddress",
    normalizeValue: normalizeEvmAddress,
    rejectDuplicateAliases: true,
  });
  const sourceBridgeAddressResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "sourceBridgeAddress",
      "source_bridge_address",
      "bscSourceBridgeAddress",
      "bsc_source_bridge_address",
      "sccpBscSourceBridgeAddress",
      "sccp_bsc_source_bridge_address",
      "evmSourceBridgeAddress",
      "evm_source_bridge_address",
    ],
    label: "sourceBridgeAddress",
    normalizeValue: normalizeEvmAddress,
    rejectDuplicateAliases: true,
  });
  const verifierAddressResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "verifierAddress",
      "verifier_address",
      "bscVerifierAddress",
      "bsc_verifier_address",
      "destinationVerifierAddress",
      "destination_verifier_address",
      "evmVerifierAddress",
      "evm_verifier_address",
    ],
    label: "verifierAddress",
    normalizeValue: normalizeEvmAddress,
    rejectDuplicateAliases: true,
  });
  const explorerUrlResult = readConsistentMaterialString({
    json,
    text,
    keys: BSC_EXPLORER_URL_KEYS,
    label: "explorerUrl",
    normalizeValue: normalizeBscExplorerBaseUrl,
    rejectDuplicateAliases: true,
  });
  const explorerHostResult = readConsistentMaterialString({
    json,
    text,
    keys: BSC_EXPLORER_HOST_KEYS,
    label: "explorerHost",
    normalizeValue: normalizeBscExplorerHost,
    rejectDuplicateAliases: true,
  });
  const postDeployFullTomlReadyResult = readConsistentMaterialBoolean({
    json,
    text,
    keys: [
      "fullTomlReady",
      "full_toml_ready",
      "postDeployFullTomlReady",
      "post_deploy_full_toml_ready",
    ],
    label: "postDeployLiveEvidence.fullTomlReady",
    rejectDuplicateAliases: true,
  });
  const postDeployEvidenceResults = [
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "sourceBridgeConfigHash",
        "source_bridge_config_hash",
        "postDeploySourceBridgeConfigHash",
        "post_deploy_source_bridge_config_hash",
      ],
      label: "postDeployLiveEvidence.sourceBridgeConfigHash",
      normalizeValue: normalizeHex32,
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "sourceEventTransactionId",
        "source_event_transaction_id",
        "postDeploySourceEventTransactionId",
        "post_deploy_source_event_transaction_id",
      ],
      label: "postDeployLiveEvidence.sourceEventTransactionId",
      normalizeValue: normalizeHex32,
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "sourceEventExplorerUrl",
        "source_event_explorer_url",
        "sourceEventTransactionUrl",
        "source_event_transaction_url",
        "postDeploySourceEventExplorerUrl",
        "post_deploy_source_event_explorer_url",
        "postDeploySourceEventTransactionUrl",
        "post_deploy_source_event_transaction_url",
      ],
      label: "postDeployLiveEvidence.sourceEventExplorerUrl",
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "routeCanaryEvidenceHash",
        "route_canary_evidence_hash",
        "postDeployRouteCanaryEvidenceHash",
        "post_deploy_route_canary_evidence_hash",
      ],
      label: "postDeployLiveEvidence.routeCanaryEvidenceHash",
      normalizeValue: normalizeHex32,
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "routeCanaryTransactionId",
        "route_canary_transaction_id",
        "postDeployRouteCanaryTransactionId",
        "post_deploy_route_canary_transaction_id",
      ],
      label: "postDeployLiveEvidence.routeCanaryTransactionId",
      normalizeValue: normalizeHex32,
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "routeCanaryExplorerUrl",
        "route_canary_explorer_url",
        "routeCanaryTransactionUrl",
        "route_canary_transaction_url",
        "postDeployRouteCanaryExplorerUrl",
        "post_deploy_route_canary_explorer_url",
        "postDeployRouteCanaryTransactionUrl",
        "post_deploy_route_canary_transaction_url",
      ],
      label: "postDeployLiveEvidence.routeCanaryExplorerUrl",
      rejectDuplicateAliases: true,
    }),
    readConsistentMaterialString({
      json,
      text,
      keys: [
        "offlineFullTomlSha256",
        "offline_full_toml_sha256",
        "postDeployOfflineFullTomlSha256",
        "post_deploy_offline_full_toml_sha256",
      ],
      label: "postDeployLiveEvidence.offlineFullTomlSha256",
      normalizeValue: normalizeHex32,
      rejectDuplicateAliases: true,
    }),
  ];
  const burnRecordArtifactB64Result = readConsistentMaterialString({
    json,
    text,
    keys: [
      "contractArtifactB64",
      "contract_artifact_b64",
      "artifactB64",
      "artifact_b64",
      "tairaBurnRecordContractArtifactB64",
      "taira_burn_record_contract_artifact_b64",
    ],
    label: "tairaXorBurnRecord.contractArtifactB64",
    rejectDuplicateAliases: true,
  });
  const burnRecordArtifactSha256Result = readConsistentMaterialString({
    json,
    text,
    keys: [
      "artifactSha256",
      "artifact_sha256",
      "contractArtifactSha256",
      "contract_artifact_sha256",
      "tairaBurnRecordArtifactSha256",
      "taira_burn_record_artifact_sha256",
    ],
    label: "tairaXorBurnRecord.artifactSha256",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  for (const result of [
    routeIdResult,
    assetKeyResult,
    productionReadyResult,
    verifierKeyHashResult,
    verifierCodeHashResult,
    proofArtifactHashResult,
    provingKeyHashResult,
    nativeEvmProverBundleHashResult,
    destinationBindingHashResult,
    settlementAssetDefinitionIdResult,
    bridgeAddressResult,
    tokenAddressResult,
    sourceBridgeAddressResult,
    verifierAddressResult,
    explorerUrlResult,
    explorerHostResult,
    postDeployFullTomlReadyResult,
    ...postDeployEvidenceResults,
    burnRecordArtifactB64Result,
    burnRecordArtifactSha256Result,
  ]) {
    problems.push(...result.conflicts);
  }
  const routeId = routeIdResult.value;
  const assetKey = assetKeyResult.value;
  const productionReady = productionReadyResult.value;
  const verifierKeyHash = verifierKeyHashResult.value;
  const verifierCodeHash = verifierCodeHashResult.value;
  const proofArtifactHash = proofArtifactHashResult.value;
  const provingKeyHash = provingKeyHashResult.value;
  const nativeEvmProverBundleHash = nativeEvmProverBundleHashResult.value;
  const destinationBindingHash = destinationBindingHashResult.value;
  const settlementAssetDefinitionId = settlementAssetDefinitionIdResult.value;
  const bridgeAddress = bridgeAddressResult.value;
  const tokenAddress = tokenAddressResult.value;
  const sourceBridgeAddress = sourceBridgeAddressResult.value;
  const verifierAddress = verifierAddressResult.value;
  const explorerUrl = explorerUrlResult.value;
  const explorerHost = explorerHostResult.value;
  const postDeployLiveEvidence = {
    fullTomlReady: postDeployFullTomlReadyResult.value === true,
    sourceBridgeConfigHash: postDeployEvidenceResults[0].value,
    sourceEventTransactionId: postDeployEvidenceResults[1].value,
    sourceEventExplorerUrl: postDeployEvidenceResults[2].value,
    routeCanaryEvidenceHash: postDeployEvidenceResults[3].value,
    routeCanaryTransactionId: postDeployEvidenceResults[4].value,
    routeCanaryExplorerUrl: postDeployEvidenceResults[5].value,
    offlineFullTomlSha256: postDeployEvidenceResults[6].value,
  };
  const burnRecordArtifactProductionProblems = [];
  if (productionReady === true) {
    problems.push(
      ...repeatedByteHex32MaterialProblems(
        {
          verifierCodeHash,
          verifierKeyHash,
          proofArtifactHash,
          provingKeyHash,
          nativeEvmProverBundleHash,
          destinationBindingHash,
          "postDeployLiveEvidence.sourceBridgeConfigHash":
            postDeployLiveEvidence.sourceBridgeConfigHash,
          "postDeployLiveEvidence.sourceEventTransactionId":
            postDeployLiveEvidence.sourceEventTransactionId,
          "postDeployLiveEvidence.routeCanaryEvidenceHash":
            postDeployLiveEvidence.routeCanaryEvidenceHash,
          "postDeployLiveEvidence.routeCanaryTransactionId":
            postDeployLiveEvidence.routeCanaryTransactionId,
          "postDeployLiveEvidence.offlineFullTomlSha256":
            postDeployLiveEvidence.offlineFullTomlSha256,
        },
        "BSC route artifact",
      ),
      ...repeatedByteEvmAddressMaterialProblems(
        {
          bridgeAddress,
          tokenAddress,
          sourceBridgeAddress,
          verifierAddress,
        },
        "BSC route artifact",
      ),
    );
    let burnRecordBytes = null;
    if (!burnRecordArtifactB64Result.value) {
      burnRecordArtifactProductionProblems.push(
        "production-ready BSC route artifact requires tairaXorBurnRecord.contractArtifactB64.",
      );
    } else {
      try {
        burnRecordBytes = strictBase64DecodedBytes(
          burnRecordArtifactB64Result.value,
          "tairaXorBurnRecord.contractArtifactB64",
        );
      } catch (error) {
        burnRecordArtifactProductionProblems.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (!burnRecordArtifactSha256Result.value) {
      burnRecordArtifactProductionProblems.push(
        "production-ready BSC route artifact requires tairaXorBurnRecord.artifactSha256.",
      );
    } else if (burnRecordBytes) {
      const actualSha256 = `0x${createHash("sha256")
        .update(burnRecordBytes)
        .digest("hex")}`;
      if (actualSha256 !== burnRecordArtifactSha256Result.value) {
        burnRecordArtifactProductionProblems.push(
          "tairaXorBurnRecord.artifactSha256 does not match tairaXorBurnRecord.contractArtifactB64.",
        );
      }
    }
    if (burnRecordBytes) {
      burnRecordArtifactProductionProblems.push(
        ...bscBurnRecordProductionArtifactProblems(
          burnRecordBytes,
          "tairaXorBurnRecord.contractArtifactB64",
        ),
      );
    }
  }
  problems.push(
    ...roleSeparatedProductionHashProblems(
      {
        verifierCodeHash,
        verifierKeyHash,
        destinationBindingHash,
        proofArtifactHash,
        provingKeyHash,
        nativeEvmProverBundleHash,
      },
      "BSC route artifact",
    ),
  );
  const isRouteConfigFile = /\.(?:json|toml)$/iu.test(filePath);
  const looksLikeRoute =
    (isRouteConfigFile && routeId === SCCP_BSC_XOR_ROUTE_ID) ||
    (isRouteConfigFile && assetKey === SCCP_BSC_XOR_ASSET_KEY) ||
    (isRouteConfigFile && ROUTE_FILE_PATTERN.test(path.basename(filePath))) ||
    (isRouteConfigFile && text.includes(SCCP_BSC_XOR_ROUTE_ID));
  if (looksLikeRoute) {
    problems.push(...forbiddenBscRouteMaterialAliasProblems({ json, text }));
  }
  return {
    looksLikeRoute,
    routeId,
    assetKey,
    productionReady,
    disabledReason,
    verifierKeyHash,
    verifierCodeHash,
    proofArtifactHash,
    provingKeyHash,
    nativeEvmProverBundleHash,
    destinationBindingHash,
    settlementAssetDefinitionId,
    bridgeAddress,
    tokenAddress,
    sourceBridgeAddress,
    verifierAddress,
    explorerUrl,
    explorerHost,
    explorerBindingMatches:
      explorerUrl === bscProfile.explorerUrl &&
      explorerHost === bscProfile.explorerHost,
    postDeployLiveEvidence,
    burnRecordArtifactSha256: burnRecordArtifactSha256Result.value,
    burnRecordArtifactProductionProblems,
    problems,
  };
};

const productionRequirementInputIds = (bscProfile) => [
  "production-groth16-verifier-key-json",
  `${bscProfile.key}-funded-bsc-deployer`,
  `${bscProfile.key}-bsc-rpc-endpoint`,
  `${bscProfile.key}-bsc-deployment-evidence`,
  ...REQUIRED_PRODUCTION_REQUIREMENT_STATIC_INPUT_IDS.filter(
    (id) => id !== "production-groth16-verifier-key-json",
  ),
];

const productionRequirementProfilePaths = (bscProfile) => ({
  deploymentEvidence:
    bscProfile.key === "mainnet"
      ? "artifacts/sccp-bsc/taira-bsc-mainnet-xor-deployment.evidence.json"
      : "artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json",
  routeManifest:
    bscProfile.key === "mainnet"
      ? "artifacts/sccp-bsc/taira-bsc-mainnet-xor-route.manifest.json"
      : "artifacts/sccp-bsc/taira-bsc-xor-route.manifest.json",
  nativeBundle:
    bscProfile.key === "mainnet"
      ? "artifacts/sccp-bsc/bsc-mainnet-native-evm-prover-bundle.json"
      : "artifacts/sccp-bsc/bsc-testnet-native-evm-prover-bundle.json",
  nativeArtifactRoot: "artifacts/sccp-bsc/native-prover",
  sourceParityAttestation:
    bscProfile.key === "mainnet"
      ? "artifacts/sccp-bsc/native-prover/mainnet-source-parity-attestation.json"
      : "artifacts/sccp-bsc/native-prover/source-parity-attestation.json",
  fullConfigEvidence:
    bscProfile.key === "mainnet"
      ? "artifacts/sccp-bsc/taira-bsc-mainnet-xor-route.full-taira-config.evidence.json"
      : "artifacts/sccp-bsc/taira-bsc-xor-route.full-taira-config.evidence.json",
});

const productionRequirementInputContracts = (bscProfile) => {
  const expectedPaths = productionRequirementProfilePaths(bscProfile);
  return new Map([
    [
      "production-groth16-verifier-key-json",
      {
        kind: "file",
        requiredBy: ["deploy", "native-prover-bundle"],
      },
    ],
    [
      `${bscProfile.key}-funded-bsc-deployer`,
      { kind: "operator-environment", requiredBy: ["deploy"] },
    ],
    [
      `${bscProfile.key}-bsc-rpc-endpoint`,
      { kind: "url", requiredBy: ["deploy", "evidence"] },
    ],
    [
      `${bscProfile.key}-bsc-deployment-evidence`,
      {
        kind: "file",
        placeholder: expectedPaths.deploymentEvidence,
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "production-route-manifest",
      {
        kind: "file",
        placeholder: expectedPaths.routeManifest,
        requiredBy: [
          "native-prover-bundle",
          "route-config",
          "publish-route-manifest",
        ],
      },
    ],
    [
      "destination-browser-prover-manifest",
      {
        kind: "file-or-url",
        placeholder: "<destination-browser-prover-manifest.json>",
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "source-browser-prover-manifest",
      {
        kind: "file-or-url",
        placeholder: "<source-browser-prover-manifest.json>",
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "taira-burn-record-contract",
      {
        kind: "file",
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "canonical-settlement-asset-definition-id",
      {
        kind: "asset-definition-id",
        placeholder: "<canonical-asset-definition-id>",
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "post-deploy-live-evidence",
      {
        kind: "hashes-and-urls",
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "deployed-taira-base-config",
      {
        kind: "file",
        placeholder: "<deployed-taira-config.toml>",
        requiredBy: ["route-config"],
      },
    ],
    [
      "offline-full-toml-evidence",
      {
        kind: "file",
        placeholder: expectedPaths.fullConfigEvidence,
        requiredBy: ["route-manifest"],
      },
    ],
    [
      "native-prover-snarkjs-verifier",
      {
        kind: "tool",
        placeholder: "<snarkjs>",
        requiredBy: [
          "groth16-toolchain-fingerprint",
          "groth16-material",
          "groth16-proof-self-test",
          "native-prover-bundle",
        ],
      },
    ],
    [
      "groth16-circom-compiler",
      {
        kind: "tool",
        placeholder: "<circom>",
        requiredBy: ["groth16-toolchain-fingerprint"],
      },
    ],
    [
      "native-prover-artifact-root",
      {
        kind: "directory",
        placeholder: expectedPaths.nativeArtifactRoot,
        requiredBy: ["native-prover-bundle"],
      },
    ],
    [
      "burn-record-proof-artifact",
      { kind: "file", requiredBy: ["native-prover-bundle"] },
    ],
    [
      "burn-record-proving-key",
      { kind: "file", requiredBy: ["native-prover-bundle"] },
    ],
    [
      "groth16-powers-of-tau",
      {
        kind: "file",
        placeholder: "<powersOfTau28_hez_final_22.ptau>",
        requiredBy: ["groth16-material"],
      },
    ],
    [
      "groth16-witness-wasm",
      {
        kind: "file",
        placeholder: "<production-circuit.wasm>",
        requiredBy: ["groth16-material", "groth16-proof-self-test"],
      },
    ],
    [
      "groth16-material-manifest",
      {
        kind: "file",
        placeholder: "<relative-groth16-material-manifest.json>",
        requiredBy: ["native-prover-bundle"],
      },
    ],
    [
      "candidate-groth16-material-manifest",
      {
        kind: "file",
        placeholder: "<candidate-groth16-material.manifest.json>",
        requiredBy: ["groth16-attestation-request"],
      },
    ],
    [
      "groth16-attestation-request-package",
      {
        kind: "file",
        placeholder: "<attestation-request.json>",
        requiredBy: [
          "groth16-sign-attestation",
          "groth16-attestation-status",
          "groth16-finalize-attestations",
        ],
      },
    ],
    [
      "signed-groth16-role-attestations",
      {
        kind: "file-set",
        placeholder:
          "<semantic-sccp-circuit-attestation.json>,<circuit-security-audit.json>,<trusted-setup-ceremony.json>,<reproducible-build-attestation.json>",
        requiredBy: [
          "groth16-attestation-status",
          "groth16-finalize-attestations",
          "native-prover-bundle",
        ],
      },
    ],
    [
      "groth16-proof-self-test-report",
      {
        kind: "file",
        placeholder: "<proof-self-test.json>",
        requiredBy: [
          "groth16-proof-self-test",
          "native-prover-bundle",
          "production-material-preflight",
        ],
      },
    ],
    [
      "trusted-groth16-attestation-signer",
      {
        kind: "hex-fingerprint",
        placeholder: "<0x...>",
        requiredBy: [
          "groth16-attestation-status",
          "groth16-finalize-attestations",
          "native-prover-bundle",
        ],
      },
    ],
    [
      "trusted-setup-transcript",
      {
        kind: "file",
        placeholder: "<trusted-setup-transcript.json>",
        requiredBy: ["groth16-material"],
      },
    ],
    [
      "reproducible-build-transcript",
      {
        kind: "file",
        placeholder: "<reproducible-build-transcript.json>",
        requiredBy: ["groth16-material"],
      },
    ],
    [
      "semantic-sccp-circuit-attestation",
      {
        kind: "file",
        placeholder: "<semantic-sccp-circuit-attestation.json>",
        requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
      },
    ],
    [
      "trusted-setup-ceremony-attestation",
      {
        kind: "file",
        placeholder: "<trusted-setup-ceremony.json>",
        requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
      },
    ],
    [
      "reproducible-groth16-build-attestation",
      {
        kind: "file",
        placeholder: "<reproducible-build-attestation.json>",
        requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
      },
    ],
    [
      "cross-sdk-parity-report",
      { kind: "file", requiredBy: ["native-prover-bundle"] },
    ],
    [
      "native-prover-self-test-report",
      { kind: "file", requiredBy: ["native-prover-bundle"] },
    ],
    [
      "source-parity-attestation",
      {
        kind: "file",
        placeholder: expectedPaths.sourceParityAttestation,
        requiredBy: ["native-prover-bundle"],
      },
    ],
    ...[
      "javascript-sdk-implementation",
      "swift-sdk-implementation",
      "kotlin-sdk-implementation",
      "java-android-sdk-implementation",
      "dotnet-sdk-implementation",
    ].map((id) => [
      id,
      { kind: "file-or-directory", requiredBy: ["native-prover-bundle"] },
    ]),
    ...[
      "audit-circuit-security",
      "audit-native-implementation",
      "audit-reproducible-build",
      "audit-no-wasm-no-remote-scan",
    ].map((id) => [
      id,
      { kind: "hash-or-file", requiredBy: ["native-prover-bundle"] },
    ]),
    [
      "taira-route-manifest-manager",
      {
        kind: "operator-environment",
        placeholder: "<taira-route-manifest-manager-account-and-key-env>",
        requiredBy: ["publish-route-manifest"],
      },
    ],
  ]);
};

const expectedProductionRequirementContractSummary = (bscProfile) => {
  const contracts = productionRequirementInputContracts(bscProfile);
  return {
    schema: PRODUCTION_REQUIREMENTS_CONTRACT_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: bscProfile.key,
    inputs: productionRequirementInputIds(bscProfile).map((id) => ({
      id,
      kind: contracts.get(id)?.kind ?? "",
      requiredBy: [...(contracts.get(id)?.requiredBy ?? [])],
    })),
    requiredReports: [...REQUIRED_PRODUCTION_REQUIREMENT_REPORTS],
    deniedVerifierKeyHashes: [...SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES].map(
      (entry) => trim(entry).toLowerCase(),
    ),
  };
};

export const bscProductionRequirementsContractHash = (bscNetwork = "testnet") =>
  sha256Bytes(
    JSON.stringify(
      expectedProductionRequirementContractSummary(
        resolveBscNetworkProfile(bscNetwork),
      ),
    ),
  );

const actualProductionRequirementContractSummary = ({
  json,
  bsc,
  inputRows,
  requiredReports,
  deniedVerifierKeyHashes,
}) => ({
  schema: PRODUCTION_REQUIREMENTS_CONTRACT_SCHEMA,
  routeId: trim(ownValue(json, "routeId")),
  assetKey: trim(ownValue(json, "assetKey")),
  bscNetwork: isRecord(bsc) ? trim(ownValue(bsc, "network")) : "",
  inputs: inputRows.map((input) => ({
    id: trim(ownValue(input, "id")),
    kind: trim(ownValue(input, "kind")),
    requiredBy: Array.isArray(ownValue(input, "requiredBy"))
      ? ownArrayValues(ownValue(input, "requiredBy")).map((entry) =>
          trim(entry),
        )
      : [],
  })),
  requiredReports: Array.isArray(requiredReports) ? requiredReports : [],
  deniedVerifierKeyHashes: Array.isArray(deniedVerifierKeyHashes)
    ? deniedVerifierKeyHashes
    : [],
});

const arrayOfOwnRecords = (value) =>
  Array.isArray(value) ? ownArrayValues(value).filter(isRecord) : [];
const arrayRecordProblems = (value, label) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return ownArrayIndexedValues(value)
    .filter(([, entry]) => !isRecord(entry))
    .map(([index]) => `${label}[${index}] must be an object.`);
};

const stringSetProblems = ({ values, required, label }) => {
  if (!Array.isArray(values)) {
    return [`${label} is missing or invalid.`];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const normalized = trim(value);
    if (!normalized) {
      problems.push(`${label}[${index}] is missing.`);
      continue;
    }
    if (seen.has(normalized)) {
      problems.push(`${label} contains duplicate ${normalized}.`);
    }
    seen.add(normalized);
  }
  for (const id of required) {
    if (!seen.has(id)) {
      problems.push(`${label} is missing ${id}.`);
    }
  }
  for (const id of seen) {
    if (!required.includes(id)) {
      problems.push(`${label} contains unsupported ${id}.`);
    }
  }
  return problems;
};

const productionRequirementsMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const schema = trim(ownValue(json, "schema"));
  const looksLikeProductionRequirements =
    schema === PRODUCTION_REQUIREMENTS_SCHEMA ||
    /production[-_]requirements/iu.test(path.basename(filePath));
  if (!looksLikeProductionRequirements) {
    return { looksLikeProductionRequirements: false };
  }
  const bsc = ownValue(json, "bsc");
  const attestedBscNetwork = isRecord(bsc)
    ? trim(ownValue(bsc, "network"))
    : "";
  let attestedProfile = null;
  try {
    attestedProfile = attestedBscNetwork
      ? resolveBscNetworkProfile(attestedBscNetwork)
      : null;
  } catch (_error) {
    attestedProfile = null;
  }
  const validationProfile = attestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !attestedProfile || attestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== PRODUCTION_REQUIREMENTS_SCHEMA) {
    problems.push("production requirements schema is invalid.");
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("production requirements routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("production requirements assetKey is invalid.");
  }
  if (!isRecord(bsc)) {
    problems.push("production requirements bsc profile is missing.");
  } else {
    for (const [key, expected] of [
      ["network", validationProfile.key],
      ["chain", validationProfile.chain],
      ["chainIdHex", validationProfile.chainIdHex],
      ["networkIdHex", validationProfile.networkIdHex],
      ["explorerUrl", validationProfile.explorerUrl],
      ["explorerHost", validationProfile.explorerHost],
    ]) {
      if (ownValue(bsc, key) !== expected) {
        problems.push(`production requirements bsc.${key} is invalid.`);
      }
    }
  }

  const commands = ownValue(json, "commands");
  if (!isRecord(commands)) {
    problems.push("production requirements commands are missing.");
  } else {
    const commandChecks = [
      ["requirements", /requirements --bsc-network (testnet|mainnet) --out /u],
      ["deploy", /deploy --bsc-network (testnet|mainnet) /u],
      ["evidence", /evidence --bsc-network (testnet|mainnet) /u],
      ["routeManifest", /route-manifest /u],
      [
        "sourceParityAttestation",
        /source-parity-attestation --bsc-network (testnet|mainnet) --out /u,
      ],
      [
        "groth16ToolchainFingerprint",
        /groth16-material toolchain-fingerprint --transcript /u,
      ],
      [
        "groth16TranscriptTemplate",
        /groth16-material transcript-template --bsc-network (testnet|mainnet) /u,
      ],
      [
        "groth16Material",
        /groth16-material materialize --bsc-network (testnet|mainnet) /u,
      ],
      [
        "groth16AttestationRequest",
        /groth16-material attestation-request --manifest /u,
      ],
      [
        "groth16AttestationHandoff",
        /groth16-material handoff-bundle --manifest /u,
      ],
      ["groth16VerifyHandoff", /groth16-material verify-handoff --handoff /u],
      [
        "groth16EvidenceTemplate",
        /groth16-material evidence-template --manifest /u,
      ],
      [
        "groth16SignAttestation",
        /groth16-material sign-attestation --request /u,
      ],
      [
        "groth16AttestationStatus",
        /groth16-material attestation-status --request /u,
      ],
      [
        "groth16AttestationInventory",
        /groth16-material attestation-inventory --request /u,
      ],
      ["groth16ProofSelfTest", /groth16-material proof-self-test --manifest /u],
      [
        "groth16FinalizeAttestations",
        /groth16-material finalize-attestations --request /u,
      ],
      ["nativeProverBundle", /native-prover-bundle /u],
      ["routeConfig", /route-config --manifest /u],
    ];
    for (const [key, pattern] of commandChecks) {
      const command = trim(ownValue(commands, key));
      if (!pattern.test(command)) {
        problems.push(`production requirements command ${key} is invalid.`);
      }
      if (
        /\{bscNetwork\}|\{confirmNetwork\}|\{mainnetConfirmation\}/u.test(
          command,
        )
      ) {
        problems.push(
          `production requirements command ${key} contains unresolved placeholders.`,
        );
      }
    }
    const deploy = trim(ownValue(commands, "deploy"));
    if (!deploy.includes(`--bsc-network ${validationProfile.key}`)) {
      problems.push(
        "production requirements deploy command uses wrong network.",
      );
    }
    if (
      !deploy.includes(
        `--confirm-network ${SCCP_BSC_XOR_ROUTE_ID}:${validationProfile.key}`,
      )
    ) {
      problems.push(
        "production requirements deploy command uses wrong confirmation network.",
      );
    }
    if (!deploy.includes("--broadcast true")) {
      problems.push(
        "production requirements deploy command is not broadcast-explicit.",
      );
    }
    if (/--confirm-testnet/u.test(deploy)) {
      problems.push(
        "production requirements deploy command uses legacy confirmation.",
      );
    }
    if (
      validationProfile.key === "mainnet" &&
      !deploy.includes("--confirm-mainnet true")
    ) {
      problems.push(
        "production requirements mainnet deploy command lacks confirmation.",
      );
    }
    if (
      validationProfile.key !== "mainnet" &&
      deploy.includes("--confirm-mainnet true")
    ) {
      problems.push(
        "production requirements testnet deploy command carries mainnet confirmation.",
      );
    }
    const routeManifestCommand = trim(ownValue(commands, "routeManifest"));
    const expectedPaths = productionRequirementProfilePaths(validationProfile);
    for (const requiredFlag of [
      "--evidence",
      "--taira-contract",
      "--settlement-asset-definition-id",
      "--proof-artifact-hash",
      "--proving-key-hash",
      "--native-prover-bundle",
      "--source-bridge-config-hash",
      "--source-event-transaction-id",
      "--source-event-explorer-url",
      "--route-canary-evidence-hash",
      "--route-canary-transaction-id",
      "--route-canary-explorer-url",
      "--full-toml-ready",
      "--offline-full-toml-evidence",
      "--production-ready",
      "--live-readback-checked",
      "--out",
    ]) {
      if (!routeManifestCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements routeManifest command lacks ${requiredFlag}.`,
        );
      }
    }
    for (const [label, expected] of [
      ["deployment evidence", `--evidence ${expectedPaths.deploymentEvidence}`],
      [
        "native prover bundle",
        `--native-prover-bundle ${expectedPaths.nativeBundle}`,
      ],
      [
        "offline full-TOML evidence",
        `--offline-full-toml-evidence ${expectedPaths.fullConfigEvidence}`,
      ],
      ["route manifest output", `--out ${expectedPaths.routeManifest}`],
    ]) {
      if (!routeManifestCommand.includes(expected)) {
        problems.push(
          `production requirements routeManifest command uses wrong ${label} path.`,
        );
      }
    }
    if (!routeManifestCommand.includes("--full-toml-ready true")) {
      problems.push(
        "production requirements routeManifest command does not require full TOML readiness.",
      );
    }
    if (routeManifestCommand.includes("--offline-full-toml-sha256")) {
      problems.push(
        "production requirements routeManifest command uses raw offline full TOML hash instead of generated evidence.",
      );
    }
    if (!routeManifestCommand.includes("--production-ready true")) {
      problems.push(
        "production requirements routeManifest command is not production-ready explicit.",
      );
    }
    if (!routeManifestCommand.includes("--live-readback-checked true")) {
      problems.push(
        "production requirements routeManifest command does not require live readback.",
      );
    }
    if (validationProfile.key === "mainnet") {
      if (!routeManifestCommand.includes("--confirm-mainnet true")) {
        problems.push(
          "production requirements mainnet routeManifest command lacks confirmation.",
        );
      }
      if (
        !routeManifestCommand.includes(
          `--confirm-network ${SCCP_BSC_XOR_ROUTE_ID}`,
        )
      ) {
        problems.push(
          "production requirements mainnet routeManifest command uses wrong confirmation network.",
        );
      }
      if (routeManifestCommand.includes("--confirm-testnet")) {
        problems.push(
          "production requirements mainnet routeManifest command carries testnet confirmation.",
        );
      }
    } else {
      if (
        !routeManifestCommand.includes(
          `--confirm-testnet ${SCCP_BSC_XOR_ROUTE_ID}`,
        )
      ) {
        problems.push(
          "production requirements testnet routeManifest command lacks confirmation.",
        );
      }
      if (routeManifestCommand.includes("--confirm-mainnet true")) {
        problems.push(
          "production requirements testnet routeManifest command carries mainnet confirmation.",
        );
      }
    }
    const bundleCommand = trim(ownValue(commands, "nativeProverBundle"));
    const groth16MaterialCommand = trim(ownValue(commands, "groth16Material"));
    const groth16AttestationRequestCommand = trim(
      ownValue(commands, "groth16AttestationRequest"),
    );
    const groth16AttestationInventoryCommand = trim(
      ownValue(commands, "groth16AttestationInventory"),
    );
    const groth16ProofSelfTestCommand = trim(
      ownValue(commands, "groth16ProofSelfTest"),
    );
    const groth16FinalizeCommand = trim(
      ownValue(commands, "groth16FinalizeAttestations"),
    );
    const sourceParityCommand = trim(
      ownValue(commands, "sourceParityAttestation"),
    );
    if (
      !sourceParityCommand.includes(`--bsc-network ${validationProfile.key}`)
    ) {
      problems.push(
        "production requirements sourceParityAttestation command uses wrong network.",
      );
    }
    if (
      !sourceParityCommand.includes(
        `--out ${expectedPaths.sourceParityAttestation}`,
      )
    ) {
      problems.push(
        "production requirements sourceParityAttestation command uses wrong output path.",
      );
    }
    if (
      !groth16MaterialCommand.includes(`--bsc-network ${validationProfile.key}`)
    ) {
      problems.push(
        "production requirements groth16Material command uses wrong network.",
      );
    }
    for (const requiredFlag of [
      "--r1cs",
      "--zkey",
      "--ptau",
      "--snarkjs-verifier-key",
      "--witness-wasm",
      "--trusted-setup-transcript",
      "--reproducible-build-transcript",
      "--snarkjs-bin",
      "--out-dir",
    ]) {
      if (!groth16MaterialCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements groth16Material command lacks ${requiredFlag}.`,
        );
      }
    }
    for (const forbiddenFlag of [
      "--semantic-attestation",
      "--circuit-security-attestation",
      "--trusted-setup-attestation",
      "--reproducible-build-attestation",
      "--trusted-attestation-signer",
    ]) {
      if (groth16MaterialCommand.includes(forbiddenFlag)) {
        problems.push(
          `production requirements groth16Material command must not include ${forbiddenFlag}; signed attestations must be finalized through groth16FinalizeAttestations.`,
        );
      }
    }
    if (
      !groth16MaterialCommand.includes(
        `--out-dir ${expectedPaths.nativeArtifactRoot}/${validationProfile.key}`,
      )
    ) {
      problems.push(
        "production requirements groth16Material command uses wrong output directory.",
      );
    }
    for (const requiredFlag of [
      "--manifest",
      "--semantic-review-evidence",
      "--circuit-security-audit-evidence",
      "--out",
    ]) {
      if (!groth16AttestationRequestCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements groth16AttestationRequest command lacks ${requiredFlag}.`,
        );
      }
    }
    if (groth16AttestationRequestCommand.includes("--toolchain-sha256")) {
      problems.push(
        "production requirements groth16AttestationRequest command uses legacy toolchain hash instead of review evidence packages.",
      );
    }
    for (const requiredFlag of [
      "--request",
      "--scan-dir",
      "--trusted-attestation-signer",
    ]) {
      if (!groth16AttestationInventoryCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements groth16AttestationInventory command lacks ${requiredFlag}.`,
        );
      }
    }
    for (const requiredFlag of [
      "--manifest",
      "--witness-wasm",
      "--snarkjs-bin",
      "--out",
    ]) {
      if (!groth16ProofSelfTestCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements groth16ProofSelfTest command lacks ${requiredFlag}.`,
        );
      }
    }
    if (
      !groth16ProofSelfTestCommand.includes(
        "--manifest <production-ready-groth16-material.manifest.json>",
      )
    ) {
      problems.push(
        "production requirements groth16ProofSelfTest command must use a production-ready Groth16 material manifest.",
      );
    }
    for (const requiredFlag of [
      "--request",
      "--semantic-attestation",
      "--circuit-security-attestation",
      "--trusted-setup-attestation",
      "--reproducible-build-attestation",
      "--trusted-attestation-signer",
      "--out-dir",
    ]) {
      if (!groth16FinalizeCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements groth16FinalizeAttestations command lacks ${requiredFlag}.`,
        );
      }
    }
    if (
      !groth16FinalizeCommand.includes(
        `--out-dir ${expectedPaths.nativeArtifactRoot}/${validationProfile.key}`,
      )
    ) {
      problems.push(
        "production requirements groth16FinalizeAttestations command uses wrong output directory.",
      );
    }
    for (const requiredFlag of [
      "--route-manifest",
      "--artifact-root",
      "--proof-artifact",
      "--proving-key",
      "--verifier-key",
      "--groth16-material-manifest",
      "--groth16-proof-self-test",
      "--snarkjs-bin",
      "--trusted-attestation-signer",
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
      "--attach-route-manifest-out",
    ]) {
      if (!bundleCommand.includes(requiredFlag)) {
        problems.push(
          `production requirements nativeProverBundle command lacks ${requiredFlag}.`,
        );
      }
    }
    if (
      !bundleCommand.includes(
        "--audit-native-implementation source-parity-attestation.json",
      )
    ) {
      problems.push(
        "production requirements nativeProverBundle command does not use source-parity attestation as native implementation audit evidence.",
      );
    }
    for (const [label, expected] of [
      [
        "native prover artifact root",
        `--artifact-root ${expectedPaths.nativeArtifactRoot}`,
      ],
      [
        "route manifest input",
        `--route-manifest ${expectedPaths.routeManifest}`,
      ],
      ["native prover bundle output", `--out ${expectedPaths.nativeBundle}`],
      [
        "attached route manifest output",
        `--attach-route-manifest-out ${expectedPaths.routeManifest}`,
      ],
    ]) {
      if (!bundleCommand.includes(expected)) {
        problems.push(
          `production requirements nativeProverBundle command uses wrong ${label} path.`,
        );
      }
    }
    const routeConfigCommand = trim(ownValue(commands, "routeConfig"));
    if (
      !routeConfigCommand.includes(`--manifest ${expectedPaths.routeManifest}`)
    ) {
      problems.push(
        "production requirements routeConfig command uses wrong route manifest path.",
      );
    }
    if (
      !routeConfigCommand.includes("--base-config <deployed-taira-config.toml>")
    ) {
      problems.push(
        "production requirements routeConfig command lacks deployed TAIRA base config input.",
      );
    }
    if (
      !routeConfigCommand.includes(
        `--write-offline-full-toml-evidence ${expectedPaths.fullConfigEvidence}`,
      )
    ) {
      problems.push(
        "production requirements routeConfig command uses wrong offline full-TOML evidence path.",
      );
    }
  }

  const inputRows = arrayOfOwnRecords(ownValue(json, "inputs"));
  const inputIds = inputRows.map((entry) => trim(ownValue(entry, "id")));
  const inputContracts = productionRequirementInputContracts(validationProfile);
  problems.push(
    ...arrayRecordProblems(
      ownValue(json, "inputs"),
      "production requirements inputs",
    ),
    ...stringSetProblems({
      values: Array.isArray(ownValue(json, "inputs")) ? inputIds : null,
      required: productionRequirementInputIds(validationProfile),
      label: "production requirements inputs",
    }),
  );
  for (const [index, input] of inputRows.entries()) {
    const id = trim(ownValue(input, "id"));
    const expectedContract = inputContracts.get(id);
    for (const key of ["kind", "placeholder", "description"]) {
      if (!trim(ownValue(input, key))) {
        problems.push(
          `production requirements input ${index} ${key} is missing.`,
        );
      }
    }
    if (!expectedContract) {
      continue;
    }
    const kind = trim(ownValue(input, "kind"));
    if (kind !== expectedContract.kind) {
      problems.push(
        `production requirements input ${id} kind must be ${expectedContract.kind}.`,
      );
    }
    if (
      expectedContract.placeholder &&
      trim(ownValue(input, "placeholder")) !== expectedContract.placeholder
    ) {
      problems.push(
        `production requirements input ${id} placeholder must be ${expectedContract.placeholder}.`,
      );
    }
    const requiredBy = Array.isArray(ownValue(input, "requiredBy"))
      ? ownArrayValues(ownValue(input, "requiredBy")).map((entry) =>
          trim(entry),
        )
      : null;
    problems.push(
      ...stringSetProblems({
        values: requiredBy,
        required: expectedContract.requiredBy,
        label: `production requirements input ${id} requiredBy`,
      }),
    );
  }

  const requiredReports = Array.isArray(ownValue(json, "requiredReports"))
    ? ownArrayValues(ownValue(json, "requiredReports")).map((entry) =>
        trim(entry),
      )
    : null;
  problems.push(
    ...stringSetProblems({
      values: requiredReports,
      required: [...REQUIRED_PRODUCTION_REQUIREMENT_REPORTS],
      label: "production requirements requiredReports",
    }),
  );
  const deniedVerifierKeyHashes = Array.isArray(
    ownValue(json, "deniedVerifierKeyHashes"),
  )
    ? ownArrayValues(ownValue(json, "deniedVerifierKeyHashes")).map((entry) =>
        trim(entry).toLowerCase(),
      )
    : null;
  problems.push(
    ...stringSetProblems({
      values: deniedVerifierKeyHashes,
      required: [...SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES],
      label: "production requirements deniedVerifierKeyHashes",
    }),
  );
  const contractHash = sha256Bytes(
    JSON.stringify(
      actualProductionRequirementContractSummary({
        json,
        bsc,
        inputRows,
        requiredReports,
        deniedVerifierKeyHashes,
      }),
    ),
  );
  const expectedContractHash = bscProductionRequirementsContractHash(
    validationProfile.key,
  );
  const contractMatchesExpected = contractHash === expectedContractHash;
  if (!contractMatchesExpected) {
    problems.push(
      "production requirements input/report/denylist contract hash does not match the expected BSC profile contract.",
    );
  }

  return {
    looksLikeProductionRequirements,
    valid: problems.length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: isRecord(bsc) ? ownValue(bsc, "network") : null,
    inputCount: inputRows.length,
    requiredReportCount: Array.isArray(requiredReports)
      ? requiredReports.length
      : 0,
    deniedVerifierKeyHashCount: Array.isArray(deniedVerifierKeyHashes)
      ? deniedVerifierKeyHashes.length
      : 0,
    contractHash,
    expectedContractHash,
    contractMatchesExpected,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    problems,
  };
};

const sourceParityTreeHash = (attestation) =>
  sha256Bytes(
    stableJsonString({
      schema: ownValue(attestation, "schema"),
      routeId: ownValue(attestation, "routeId"),
      assetKey: ownValue(attestation, "assetKey"),
      bscNetwork: ownValue(attestation, "bscNetwork"),
      chain: ownValue(attestation, "chain"),
      chainIdHex: ownValue(attestation, "chainIdHex"),
      networkIdHex: ownValue(attestation, "networkIdHex"),
      domain: ownValue(attestation, "domain"),
      proofBackend: ownValue(attestation, "proofBackend"),
      proofFamily: ownValue(attestation, "proofFamily"),
      requiredMarkers: ownValue(attestation, "requiredMarkers"),
      sdks: ownValue(attestation, "sdks"),
    }),
  );

const sourceParityRequiredMarkersForProfile = (bscProfile) =>
  SOURCE_PARITY_REQUIRED_MARKERS_BY_PROFILE[bscProfile.key] ??
  Object.freeze([]);

const sourceParitySdkFileMarkersForProfile = (bscProfile) =>
  SOURCE_PARITY_SDK_FILE_MARKERS_BY_PROFILE[bscProfile.key] ??
  Object.freeze({});

const sourceParityRequiredMarkerProblems = (requiredMarkers, bscProfile) => {
  const problems = [];
  const expectedMarkers = sourceParityRequiredMarkersForProfile(bscProfile);
  const markerSet = new Set(requiredMarkers);
  if (requiredMarkers.length !== markerSet.size) {
    problems.push(
      "source parity attestation requiredMarkers contain duplicates.",
    );
  }
  for (const marker of expectedMarkers) {
    if (!markerSet.has(marker)) {
      problems.push(
        `source parity attestation requiredMarkers are missing ${marker}.`,
      );
    }
  }
  for (const marker of markerSet) {
    if (!expectedMarkers.includes(marker)) {
      problems.push(
        `source parity attestation requiredMarkers contain unknown marker ${marker}.`,
      );
    }
  }
  return problems;
};

const sourceParitySdkImplementationHash = (sdk, sdkRecord) => {
  if (!isRecord(sdkRecord)) {
    return null;
  }
  const implementation = ownValue(sdkRecord, "implementation");
  const files = Array.isArray(ownValue(sdkRecord, "files"))
    ? ownArrayValues(ownValue(sdkRecord, "files")).filter(isRecord)
    : [];
  return sha256Bytes(
    stableJsonString({
      sdk,
      implementation,
      files: files.map((file) => ({
        path: ownValue(file, "path"),
        sha256: ownValue(file, "sha256"),
        markers: ownValue(file, "markers"),
      })),
    }),
  );
};

const sourceParityAttestationMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const schema = trim(ownValue(json, "schema"));
  const looksLikeSourceParityAttestation =
    schema === SOURCE_PARITY_ATTESTATION_SCHEMA ||
    /source[-_]parity[-_]attestation/iu.test(path.basename(filePath));
  if (!looksLikeSourceParityAttestation) {
    return { looksLikeSourceParityAttestation: false };
  }
  const attestedBscNetwork = trim(ownValue(json, "bscNetwork"));
  let attestedProfile = null;
  try {
    attestedProfile = attestedBscNetwork
      ? resolveBscNetworkProfile(attestedBscNetwork)
      : null;
  } catch (_error) {
    attestedProfile = null;
  }
  const validationProfile = attestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !attestedProfile || attestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== SOURCE_PARITY_ATTESTATION_SCHEMA) {
    problems.push("source parity attestation schema is invalid.");
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("source parity attestation routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("source parity attestation assetKey is invalid.");
  }
  for (const [key, expected] of [
    ["bscNetwork", validationProfile.key],
    ["chain", validationProfile.chain],
    ["chainIdHex", validationProfile.chainIdHex],
    ["networkIdHex", validationProfile.networkIdHex],
  ]) {
    if (ownValue(json, key) !== expected) {
      problems.push(`source parity attestation ${key} is invalid.`);
    }
  }
  if (ownValue(json, "domain") !== 2) {
    problems.push("source parity attestation domain must be BSC.");
  }
  if (ownValue(json, "proofBackend") !== "evm-groth16-bn254-v1") {
    problems.push("source parity attestation proofBackend is invalid.");
  }
  if (ownValue(json, "proofFamily") !== "stark-fri-v1") {
    problems.push("source parity attestation proofFamily is invalid.");
  }
  const requiredMarkers = Array.isArray(ownValue(json, "requiredMarkers"))
    ? ownArrayValues(ownValue(json, "requiredMarkers"))
    : [];
  if (
    requiredMarkers.length === 0 ||
    requiredMarkers.some((marker) => typeof marker !== "string" || !marker)
  ) {
    problems.push(
      "source parity attestation requiredMarkers are missing or invalid.",
    );
  } else {
    problems.push(
      ...sourceParityRequiredMarkerProblems(requiredMarkers, validationProfile),
    );
  }

  const sdks = ownValue(json, "sdks");
  const sdkSummaries = {};
  const requiredSdks = Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  );
  if (!isRecord(sdks)) {
    problems.push("source parity attestation sdks is missing.");
  } else {
    const seenSdks = new Set(ownRecordEntries(sdks).map(([sdk]) => sdk));
    for (const [sdk, expectedImplementation] of requiredSdks) {
      if (!seenSdks.has(sdk)) {
        problems.push(`source parity attestation is missing SDK ${sdk}.`);
        continue;
      }
      const sdkRecord = ownValue(sdks, sdk);
      if (!isRecord(sdkRecord)) {
        problems.push(`source parity attestation SDK ${sdk} is invalid.`);
        continue;
      }
      if (ownValue(sdkRecord, "implementation") !== expectedImplementation) {
        problems.push(
          `source parity attestation SDK ${sdk} implementation is invalid.`,
        );
      }
      const implementationHash = normalizeHex32(
        ownValue(sdkRecord, "implementationHash"),
      );
      const expectedImplementationHash = sourceParitySdkImplementationHash(
        sdk,
        sdkRecord,
      );
      if (!implementationHash) {
        problems.push(
          `source parity attestation SDK ${sdk} implementationHash is missing or invalid.`,
        );
      } else if (implementationHash !== expectedImplementationHash) {
        problems.push(
          `source parity attestation SDK ${sdk} implementationHash does not match attested files.`,
        );
      }
      const files = Array.isArray(ownValue(sdkRecord, "files"))
        ? ownArrayValues(ownValue(sdkRecord, "files")).filter(isRecord)
        : [];
      if (files.length === 0) {
        problems.push(
          `source parity attestation SDK ${sdk} files are missing.`,
        );
      }
      const expectedFiles =
        sourceParitySdkFileMarkersForProfile(validationProfile)[sdk] ?? {};
      const expectedPaths = Object.keys(expectedFiles);
      const seenFilePaths = new Set();
      for (const [index, file] of files.entries()) {
        const filePathValue = trim(ownValue(file, "path"));
        if (!filePathValue) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} path is missing.`,
          );
        } else if (seenFilePaths.has(filePathValue)) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} path duplicates another file.`,
          );
        } else {
          seenFilePaths.add(filePathValue);
        }
        if (filePathValue && !Object.hasOwn(expectedFiles, filePathValue)) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} path is not an expected SDK source path.`,
          );
        }
        if (!normalizeHex32(ownValue(file, "sha256"))) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} sha256 is missing or invalid.`,
          );
        }
        if (
          !Number.isSafeInteger(ownValue(file, "sizeBytes")) ||
          ownValue(file, "sizeBytes") <= 0
        ) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} sizeBytes is missing or invalid.`,
          );
        }
        const markers = Array.isArray(ownValue(file, "markers"))
          ? ownArrayValues(ownValue(file, "markers"))
          : [];
        if (
          markers.length === 0 ||
          markers.some((marker) => typeof marker !== "string" || !marker)
        ) {
          problems.push(
            `source parity attestation SDK ${sdk} file ${index} markers are missing or invalid.`,
          );
        } else if (
          filePathValue &&
          Object.hasOwn(expectedFiles, filePathValue)
        ) {
          const markerSet = new Set(markers);
          if (markerSet.size !== markers.length) {
            problems.push(
              `source parity attestation SDK ${sdk} file ${index} markers contain duplicates.`,
            );
          }
          for (const marker of expectedFiles[filePathValue]) {
            if (!markerSet.has(marker)) {
              problems.push(
                `source parity attestation SDK ${sdk} file ${index} markers are missing ${marker}.`,
              );
            }
          }
        }
      }
      for (const expectedPath of expectedPaths) {
        if (!seenFilePaths.has(expectedPath)) {
          problems.push(
            `source parity attestation SDK ${sdk} is missing expected file ${expectedPath}.`,
          );
        }
      }
      if (files.length !== expectedPaths.length) {
        problems.push(
          `source parity attestation SDK ${sdk} file count does not match expected SDK source surface.`,
        );
      }
      sdkSummaries[sdk] = {
        implementation: trim(ownValue(sdkRecord, "implementation")),
        implementationHash,
        expectedImplementationHash,
        implementationHashMatches:
          Boolean(implementationHash) &&
          implementationHash === expectedImplementationHash,
        fileCount: files.length,
      };
    }
    for (const sdk of seenSdks) {
      if (
        !Object.prototype.hasOwnProperty.call(
          SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
          sdk,
        )
      ) {
        problems.push(`source parity attestation contains unknown SDK ${sdk}.`);
      }
    }
  }

  const sourceTreeHash = normalizeHex32(ownValue(json, "sourceTreeHash"));
  const expectedSourceTreeHash = sourceParityTreeHash(json);
  if (!sourceTreeHash) {
    problems.push(
      "source parity attestation sourceTreeHash is missing or invalid.",
    );
  } else if (sourceTreeHash !== expectedSourceTreeHash) {
    problems.push(
      "source parity attestation sourceTreeHash does not match attested SDK material.",
    );
  }
  return {
    looksLikeSourceParityAttestation,
    valid: problems.length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: ownValue(json, "bscNetwork"),
    chain: ownValue(json, "chain"),
    chainIdHex: ownValue(json, "chainIdHex"),
    networkIdHex: ownValue(json, "networkIdHex"),
    domain: ownValue(json, "domain"),
    proofBackend: ownValue(json, "proofBackend"),
    proofFamily: ownValue(json, "proofFamily"),
    requiredMarkers,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    sourceTreeHash,
    expectedSourceTreeHash,
    sdkCount: Object.keys(sdkSummaries).length,
    sdks: sdkSummaries,
    problems,
  };
};

const groth16MaterialArtifactHash = (artifacts, keys) => {
  if (!isRecord(artifacts)) {
    return null;
  }
  const artifact = keys
    .map((key) => ownValue(artifacts, key))
    .find((value) => isRecord(value));
  if (!isRecord(artifact)) {
    return null;
  }
  return normalizeHex32(
    ownValue(artifact, "sha256") ??
      ownValue(artifact, "hash") ??
      ownValue(artifact, "artifactHash") ??
      ownValue(artifact, "artifact_hash"),
  );
};

const groth16MaterialArtifactReference = (
  artifacts,
  keys,
  label = "Groth16 material manifest artifact path",
) => {
  if (!isRecord(artifacts)) {
    return { path: "", sha256: null, valid: false, pathProblems: [] };
  }
  const artifact = keys
    .map((key) => ownValue(artifacts, key))
    .find((value) => isRecord(value));
  if (!isRecord(artifact)) {
    return { path: "", sha256: null, valid: false, pathProblems: [] };
  }
  const pathName = trim(ownValue(artifact, "path"));
  const sha256 = normalizeHex32(
    ownValue(artifact, "sha256") ??
      ownValue(artifact, "hash") ??
      ownValue(artifact, "artifactHash") ??
      ownValue(artifact, "artifact_hash"),
  );
  const pathProblems = groth16RelativeEvidencePathProblems(pathName, label);
  return {
    path: pathName,
    sha256,
    valid: Boolean(pathName && sha256 && pathProblems.length === 0),
    pathProblems,
  };
};

const groth16MaterialAttestationSignatureSummary = ({
  signature,
  label,
  problems,
}) => {
  if (!isRecord(signature)) {
    problems.push(
      `Groth16 material manifest ${label} attestation signature summary is missing.`,
    );
    return {
      valid: false,
      verified: false,
      algorithm: null,
      signerFingerprint: null,
      signedPayloadSha256: null,
    };
  }
  const verified = ownValue(signature, "verified") === true;
  const algorithm = trim(ownValue(signature, "algorithm"));
  const signerFingerprint = normalizeHex32(
    ownValue(signature, "signerFingerprint") ??
      ownValue(signature, "signer_fingerprint"),
  );
  const signedPayloadSha256 = normalizeHex32(
    ownValue(signature, "signedPayloadSha256") ??
      ownValue(signature, "signed_payload_sha256"),
  );
  if (verified !== true) {
    problems.push(
      `Groth16 material manifest ${label} attestation signature must be verified.`,
    );
  }
  if (algorithm !== "ed25519") {
    problems.push(
      `Groth16 material manifest ${label} attestation signature algorithm must be ed25519.`,
    );
  }
  if (!signerFingerprint || !NON_ZERO_HEX32.test(signerFingerprint)) {
    problems.push(
      `Groth16 material manifest ${label} attestation signature signerFingerprint is missing or invalid.`,
    );
  }
  if (!signedPayloadSha256 || !NON_ZERO_HEX32.test(signedPayloadSha256)) {
    problems.push(
      `Groth16 material manifest ${label} attestation signature signedPayloadSha256 is missing or invalid.`,
    );
  }
  return {
    valid:
      verified === true &&
      algorithm === "ed25519" &&
      Boolean(signerFingerprint) &&
      NON_ZERO_HEX32.test(signerFingerprint) &&
      Boolean(signedPayloadSha256) &&
      NON_ZERO_HEX32.test(signedPayloadSha256),
    verified,
    algorithm,
    signerFingerprint,
    signedPayloadSha256,
  };
};

const groth16MaterialAttestationSummary = (attestations, problems) => {
  const summaries = {};
  if (!isRecord(attestations)) {
    problems.push("Groth16 material manifest attestations are missing.");
    return summaries;
  }
  const verifiedSigners = new Map();
  for (const [
    key,
    expectedSchema,
    label,
  ] of BSC_GROTH16_REQUIRED_ATTESTATIONS) {
    const record = ownValue(attestations, key);
    if (!isRecord(record)) {
      problems.push(
        `Groth16 material manifest ${label} attestation is required.`,
      );
      summaries[key] = { valid: false, schema: null, sha256: null };
      continue;
    }
    const schema = trim(ownValue(record, "schema"));
    const sha256 = normalizeHex32(ownValue(record, "sha256"));
    const pathName = trim(ownValue(record, "path"));
    const readError = trim(ownValue(record, "readError"));
    const signature = groth16MaterialAttestationSignatureSummary({
      signature: ownValue(record, "signature"),
      label,
      problems,
    });
    const valid =
      schema === expectedSchema &&
      Boolean(sha256) &&
      Boolean(pathName) &&
      !readError &&
      signature.valid;
    if (schema !== expectedSchema) {
      problems.push(
        `Groth16 material manifest ${label} attestation schema must be ${expectedSchema}.`,
      );
    }
    if (!pathName) {
      problems.push(
        `Groth16 material manifest ${label} attestation path is missing.`,
      );
    }
    if (!sha256) {
      problems.push(
        `Groth16 material manifest ${label} attestation sha256 is missing or invalid.`,
      );
    }
    if (readError) {
      problems.push(
        `Groth16 material manifest ${label} attestation has readError ${readError}.`,
      );
    }
    if (signature.valid && signature.verified && signature.signerFingerprint) {
      const previous = verifiedSigners.get(signature.signerFingerprint);
      if (previous) {
        problems.push(
          `Groth16 material manifest attestation signers must be role-separated; ${previous} and ${label} attestations reuse signer ${signature.signerFingerprint}.`,
        );
      } else {
        verifiedSigners.set(signature.signerFingerprint, label);
      }
    }
    summaries[key] = {
      valid,
      schema,
      path: pathName || null,
      sha256,
      readError: readError || null,
      signature,
    };
  }
  return summaries;
};

const groth16MaterialTrustPolicySummary = ({ trustPolicy, problems }) => {
  if (!isRecord(trustPolicy)) {
    problems.push(
      "Groth16 material manifest attestationTrustPolicy is missing.",
    );
    return {
      valid: false,
      signatureSchema: null,
      requiredAlgorithm: null,
      trustedSignerFingerprints: [],
    };
  }
  const signatureSchema = trim(
    ownValue(trustPolicy, "signatureSchema") ??
      ownValue(trustPolicy, "signature_schema"),
  );
  const requiredAlgorithm = trim(
    ownValue(trustPolicy, "requiredAlgorithm") ??
      ownValue(trustPolicy, "required_algorithm"),
  );
  const trustedSignerFingerprints = ownArrayValues(
    ownValue(trustPolicy, "trustedSignerFingerprints") ??
      ownValue(trustPolicy, "trusted_signer_fingerprints"),
  ).map((value) => normalizeHex32(value));
  if (signatureSchema !== BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA) {
    problems.push(
      `Groth16 material manifest attestationTrustPolicy signatureSchema must be ${BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA}.`,
    );
  }
  if (requiredAlgorithm !== "ed25519") {
    problems.push(
      "Groth16 material manifest attestationTrustPolicy requiredAlgorithm must be ed25519.",
    );
  }
  if (
    trustedSignerFingerprints.length === 0 ||
    trustedSignerFingerprints.some(
      (value) => !value || !NON_ZERO_HEX32.test(value),
    )
  ) {
    problems.push(
      "Groth16 material manifest attestationTrustPolicy trustedSignerFingerprints must contain non-zero hex fingerprints.",
    );
  }
  return {
    valid:
      signatureSchema === BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA &&
      requiredAlgorithm === "ed25519" &&
      trustedSignerFingerprints.length > 0 &&
      trustedSignerFingerprints.every(
        (value) => value && NON_ZERO_HEX32.test(value),
      ),
    signatureSchema,
    requiredAlgorithm,
    trustedSignerFingerprints,
  };
};

const attestationSignedBody = (record) => {
  if (!isRecord(record)) {
    return record;
  }
  const body = { ...record };
  delete body.signature;
  delete body.signatures;
  return body;
};

const attestationSignaturePayload = (record) =>
  Buffer.from(stableJsonString(attestationSignedBody(record)), "utf8");

const attestationSignatureBytes = (value, label) => {
  const normalized = trim(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (/^0x[0-9a-f]+$/iu.test(normalized)) {
    const hex = normalized.slice(2);
    if (hex.length % 2 !== 0) {
      throw new Error(`${label} hex must have an even number of digits`);
    }
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(normalized, "base64");
};

const publicKeyFingerprint = (publicKeyPem, label) => {
  let publicKey;
  try {
    publicKey = createPublicKey(String(publicKeyPem));
  } catch (error) {
    throw new Error(
      `${label} must be a valid public key: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const der = publicKey.export({ format: "der", type: "spki" });
  return { publicKey, fingerprint: sha256Bytes(der) };
};

const attestationValue = (record, keys) => {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = ownValue(record, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

const attestationStringProblem = (record, keys, expected, label) => {
  const value = attestationValue(record, keys);
  return trim(value) === expected ? "" : `${label} must be ${expected}`;
};

const attestationHexLabelProblem = (record, keys, expected, label) => {
  const value = trim(attestationValue(record, keys)).toLowerCase();
  const expectedValue = trim(expected).toLowerCase();
  return value && value === expectedValue
    ? ""
    : `${label} must be ${expectedValue}`;
};

const attestationIntegerProblem = (record, keys, expected, label) => {
  const value = Number(attestationValue(record, keys));
  return Number.isSafeInteger(value) && value === expected
    ? ""
    : `${label} must be ${expected}`;
};

const attestationIntegerAtLeastProblem = (record, keys, minimum, label) => {
  const value = Number(attestationValue(record, keys));
  return Number.isSafeInteger(value) && value >= minimum
    ? ""
    : `${label} must be at least ${minimum}`;
};

const attestationBooleanProblem = (record, keys, expected, label) =>
  attestationValue(record, keys) === expected
    ? ""
    : `${label} must be ${expected ? "true" : "false"}`;

const attestationZeroProblem = (record, keys, label) => {
  const value = Number(attestationValue(record, keys));
  return Number.isSafeInteger(value) && value === 0 ? "" : `${label} must be 0`;
};

const attestationHashProblem = (record, keys, expected, label) => {
  const hash = normalizeHex32(attestationValue(record, keys));
  if (!hash) {
    return `${label} is missing or invalid`;
  }
  return hash === expected ? "" : `${label} must match ${expected}`;
};

const attestationHashPresentProblem = (record, keys, label) =>
  normalizeHex32(attestationValue(record, keys))
    ? ""
    : `${label} is missing or invalid`;

const groth16ReferencedAttestationBodyProblems = ({
  record,
  expectedSchema,
  label,
  manifest,
  bscProfile,
}) => {
  const problems = [
    attestationStringProblem(
      record,
      "schema",
      expectedSchema,
      `${label} schema`,
    ),
    attestationStringProblem(
      record,
      ["routeId", "route_id"],
      SCCP_BSC_XOR_ROUTE_ID,
      `${label} routeId`,
    ),
    attestationStringProblem(
      record,
      ["assetKey", "asset_key"],
      SCCP_BSC_XOR_ASSET_KEY,
      `${label} assetKey`,
    ),
    attestationStringProblem(
      record,
      ["bscNetwork", "bsc_network", "network"],
      bscProfile.key,
      `${label} bscNetwork`,
    ),
    attestationStringProblem(
      record,
      "chain",
      bscProfile.chain,
      `${label} chain`,
    ),
    attestationStringProblem(
      record,
      ["chainIdHex", "chain_id_hex"],
      bscProfile.chainIdHex,
      `${label} chainIdHex`,
    ),
    attestationHexLabelProblem(
      record,
      ["networkIdHex", "network_id_hex"],
      bscProfile.networkIdHex,
      `${label} networkIdHex`,
    ),
    attestationStringProblem(
      record,
      ["circuitProfile", "circuit_profile"],
      BSC_FULL_SCCP_CIRCUIT_PROFILE,
      `${label} circuitProfile`,
    ),
    attestationIntegerProblem(
      record,
      ["publicInputCount", "public_input_count"],
      9,
      `${label} publicInputCount`,
    ),
    attestationHashProblem(
      record,
      ["verifierKeyHash", "verifier_key_hash"],
      manifest.verifierKeyHash,
      `${label} verifierKeyHash`,
    ),
    attestationHashProblem(
      record,
      ["circuitSourceSha256", "circuit_source_sha256"],
      manifest.circuitSourceHash,
      `${label} circuitSourceSha256`,
    ),
    attestationHashProblem(
      record,
      ["r1csSha256", "r1cs_sha256", "proofArtifactHash", "proof_artifact_hash"],
      manifest.proofArtifactHash,
      `${label} r1csSha256`,
    ),
    attestationHashProblem(
      record,
      [
        "provingKeySha256",
        "proving_key_sha256",
        "provingKeyHash",
        "proving_key_hash",
      ],
      manifest.provingKeyHash,
      `${label} provingKeySha256`,
    ),
    attestationHashProblem(
      record,
      ["snarkjsVerificationKeySha256", "snarkjs_verification_key_sha256"],
      manifest.snarkjsVerificationKeyHash,
      `${label} snarkjsVerificationKeySha256`,
    ),
    attestationHashProblem(
      record,
      ["bscVerifierKeySha256", "bsc_verifier_key_sha256"],
      manifest.bscVerifierKeyArtifactHash,
      `${label} bscVerifierKeySha256`,
    ),
  ];
  const publicSignals = attestationValue(record, [
    "publicSignalNames",
    "public_signal_names",
  ]);
  if (
    !Array.isArray(publicSignals) ||
    JSON.stringify(ownArrayValues(publicSignals)) !==
      JSON.stringify(BSC_GROTH16_PUBLIC_SIGNAL_NAMES)
  ) {
    problems.push(
      `${label} publicSignalNames must match BSC Groth16 public signals`,
    );
  }
  switch (expectedSchema) {
    case BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA:
      problems.push(
        attestationBooleanProblem(
          record,
          ["fullSccpMessageSemantics", "full_sccp_message_semantics"],
          true,
          `${label} fullSccpMessageSemantics`,
        ),
        attestationBooleanProblem(
          record,
          ["sourceFinalitySemantics", "source_finality_semantics"],
          true,
          `${label} sourceFinalitySemantics`,
        ),
        attestationBooleanProblem(
          record,
          ["destinationBindingSemantics", "destination_binding_semantics"],
          true,
          `${label} destinationBindingSemantics`,
        ),
        attestationBooleanProblem(
          record,
          [
            "publicSignalDerivationSemantics",
            "public_signal_derivation_semantics",
          ],
          true,
          `${label} publicSignalDerivationSemantics`,
        ),
        attestationBooleanProblem(
          record,
          ["negativeCaseCoverage", "negative_case_coverage"],
          true,
          `${label} negativeCaseCoverage`,
        ),
      );
      break;
    case BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA:
      problems.push(
        attestationStringProblem(
          record,
          ["auditResult", "audit_result"],
          "pass",
          `${label} auditResult`,
        ),
        attestationBooleanProblem(
          record,
          ["approved", "productionApproved"],
          true,
          `${label} approved`,
        ),
        attestationZeroProblem(
          record,
          ["criticalFindings", "critical_findings"],
          `${label} criticalFindings`,
        ),
        attestationZeroProblem(
          record,
          ["highFindings", "high_findings"],
          `${label} highFindings`,
        ),
        attestationZeroProblem(
          record,
          ["unresolvedFindings", "unresolved_findings"],
          `${label} unresolvedFindings`,
        ),
      );
      break;
    case BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA:
      problems.push(
        attestationStringProblem(
          record,
          ["ceremonyResult", "ceremony_result"],
          "pass",
          `${label} ceremonyResult`,
        ),
        attestationBooleanProblem(
          record,
          ["localSingleContributor", "local_single_contributor"],
          false,
          `${label} localSingleContributor`,
        ),
        attestationIntegerAtLeastProblem(
          record,
          ["minimumContributors", "minimum_contributors"],
          2,
          `${label} minimumContributors`,
        ),
        attestationBooleanProblem(
          record,
          ["toxicWasteDestroyed", "toxic_waste_destroyed"],
          true,
          `${label} toxicWasteDestroyed`,
        ),
        attestationHashProblem(
          record,
          ["contributionTranscriptSha256", "contribution_transcript_sha256"],
          manifest.trustedSetupTranscriptHash,
          `${label} contributionTranscriptSha256`,
        ),
      );
      break;
    case BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA:
      problems.push(
        attestationBooleanProblem(
          record,
          ["reproducible", "reproducibleBuild"],
          true,
          `${label} reproducible`,
        ),
        attestationIntegerAtLeastProblem(
          record,
          ["independentRebuilders", "independent_rebuilders"],
          2,
          `${label} independentRebuilders`,
        ),
        attestationHashProblem(
          record,
          ["buildTranscriptSha256", "build_transcript_sha256"],
          manifest.reproducibleBuildTranscriptHash,
          `${label} buildTranscriptSha256`,
        ),
      );
      break;
    default:
      break;
  }
  return problems.filter(Boolean);
};

const groth16ReferencedAttestationSignatureProblems = ({
  record,
  reference,
  trustPolicy,
  label,
}) => {
  const problems = [];
  const signature = ownValue(record, "signature");
  if (!isRecord(signature)) {
    return {
      problems: [`${label} signature is required`],
      signerFingerprint: null,
      signedPayloadSha256: null,
    };
  }
  if (
    trim(ownValue(signature, "schema")) !==
    BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA
  ) {
    problems.push(
      `${label} signature schema must be ${BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA}`,
    );
  }
  if (trim(ownValue(signature, "algorithm")) !== "ed25519") {
    problems.push(`${label} signature algorithm must be ed25519`);
  }
  const payload = attestationSignaturePayload(record);
  const signedPayloadSha256 = sha256Bytes(payload);
  const declaredPayloadSha256 = normalizeHex32(
    ownValue(signature, "signedPayloadSha256") ??
      ownValue(signature, "signed_payload_sha256"),
  );
  if (!declaredPayloadSha256 || declaredPayloadSha256 !== signedPayloadSha256) {
    problems.push(
      `${label} signature signedPayloadSha256 must match attestation body`,
    );
  }
  if (
    reference.signature?.signedPayloadSha256 &&
    reference.signature.signedPayloadSha256 !== signedPayloadSha256
  ) {
    problems.push(
      `${label} manifest signature summary must match attestation body hash`,
    );
  }
  let publicKey = null;
  let signerFingerprint = null;
  try {
    const result = publicKeyFingerprint(
      ownValue(signature, "publicKeyPem") ??
        ownValue(signature, "public_key_pem"),
      `${label} signature publicKeyPem`,
    );
    publicKey = result.publicKey;
    signerFingerprint = normalizeHex32(
      ownValue(signature, "signerFingerprint") ??
        ownValue(signature, "signer_fingerprint"),
    );
    if (!signerFingerprint || signerFingerprint !== result.fingerprint) {
      problems.push(
        `${label} signature signerFingerprint must match public key`,
      );
    }
    if (
      signerFingerprint &&
      !trustPolicy.trustedSignerFingerprints.includes(signerFingerprint)
    ) {
      problems.push(`${label} signature signerFingerprint is not trusted`);
    }
    if (
      reference.signature?.signerFingerprint &&
      signerFingerprint &&
      reference.signature.signerFingerprint !== signerFingerprint
    ) {
      problems.push(
        `${label} manifest signature summary must match attestation signer`,
      );
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  try {
    const signatureBuffer = attestationSignatureBytes(
      ownValue(signature, "signature") ??
        ownValue(signature, "signatureBase64"),
      `${label} signature`,
    );
    if (
      !publicKey ||
      !verifyDetachedSignature(null, payload, publicKey, signatureBuffer)
    ) {
      problems.push(`${label} detached signature verification failed`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return {
    problems,
    signerFingerprint: problems.length === 0 ? signerFingerprint : null,
    signedPayloadSha256,
  };
};

const groth16AttestationRootCandidates = ({ manifestPath, scanPaths }) =>
  uniqueResolvedPaths([
    path.dirname(manifestPath),
    ...parseList(scanPaths),
    repoRoot,
    irohaRoot,
  ]);

const readGroth16ReferencedAttestation = async ({
  entry,
  reference,
  scanPaths,
  label,
}) => {
  const relativePath = trim(reference.path);
  const pathProblems = groth16RelativeEvidencePathProblems(
    relativePath,
    `${label} path`,
  );
  if (pathProblems.length > 0) {
    throw new Error(pathProblems.join("; "));
  }
  for (const root of groth16AttestationRootCandidates({
    manifestPath: entry._filePath,
    scanPaths,
  })) {
    const candidate = path.resolve(root, relativePath);
    if (!isPathInside(root, candidate) || !existsSync(candidate)) {
      continue;
    }
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      continue;
    }
    if (!info.isFile()) {
      continue;
    }
    if (info.size > SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES) {
      throw new Error(
        `${label} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES}`,
      );
    }
    const [realRoot, realCandidate] = await Promise.all([
      realpath(root),
      realpath(candidate),
    ]);
    if (!isPathInside(realRoot, realCandidate)) {
      continue;
    }
    const bytes = await readFile(realCandidate);
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== reference.sha256) {
      throw new Error(
        `${label} sha256 ${actualSha256} does not match manifest reference ${reference.sha256}`,
      );
    }
    const parsed = parseJsonWithoutDuplicateKeys(
      Buffer.from(bytes).toString("utf8"),
      relativePath,
    );
    if (!isRecord(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed;
  }
  throw new Error(`${label} was not found under scanned roots`);
};

const transcriptArrayOrCountAtLeastProblem = ({
  record,
  arrayKeys,
  countKeys,
  minimum,
  label,
}) => {
  for (const key of arrayKeys) {
    const value = attestationValue(record, key);
    if (Array.isArray(value)) {
      return value.length >= minimum
        ? ""
        : `${label} must record at least ${minimum}`;
    }
  }
  const count = Number(attestationValue(record, countKeys));
  if (Number.isSafeInteger(count)) {
    return count >= minimum ? "" : `${label} must record at least ${minimum}`;
  }
  return `${label} is required`;
};

const transcriptOptionalBooleanProblem = (record, keys, expected, label) => {
  const value = attestationValue(record, keys);
  return value === undefined
    ? ""
    : value === expected
      ? ""
      : `${label} must be ${expected}`;
};

const transcriptOptionalStringProblem = (record, keys, expected, label) => {
  const value = attestationValue(record, keys);
  return value === undefined || trim(value) === expected
    ? ""
    : `${label} must be ${expected}`;
};

const transcriptOptionalIntegerProblem = (record, keys, expected, label) => {
  const value = attestationValue(record, keys);
  if (value === undefined) {
    return "";
  }
  const actual = Number(value);
  return Number.isSafeInteger(actual) && actual === expected
    ? ""
    : `${label} must be ${expected}`;
};

const groth16TrustedSetupTranscriptProblems = (record, label) => {
  const phase1 = isRecord(ownValue(record, "phase1"))
    ? ownValue(record, "phase1")
    : null;
  const snarkjsPowersOfTauVerify = phase1
    ? (ownValue(phase1, "snarkjsPowersOfTauVerify") ??
      ownValue(phase1, "snarkjs_powers_of_tau_verify"))
    : null;
  return [
    attestationStringProblem(
      record,
      "schema",
      BSC_GROTH16_TRUSTED_SETUP_TRANSCRIPT_SCHEMA,
      `${label} schema`,
    ),
    transcriptArrayOrCountAtLeastProblem({
      record,
      arrayKeys: ["contributors", "participants", "contributions"],
      countKeys: [
        "minimumContributors",
        "minimum_contributors",
        "minimumContributorsObserved",
        "minimum_contributors_observed",
      ],
      minimum: 2,
      label: `${label} contributors`,
    }),
    transcriptOptionalBooleanProblem(
      record,
      ["localSingleContributor", "local_single_contributor"],
      false,
      `${label} localSingleContributor`,
    ),
    transcriptOptionalBooleanProblem(
      record,
      ["toxicWasteDestroyed", "toxic_waste_destroyed"],
      true,
      `${label} toxicWasteDestroyed`,
    ),
    transcriptOptionalStringProblem(
      record,
      ["ceremonyResult", "ceremony_result"],
      "pass",
      `${label} ceremonyResult`,
    ),
    ...(isRecord(snarkjsPowersOfTauVerify)
      ? [
          transcriptOptionalBooleanProblem(
            snarkjsPowersOfTauVerify,
            ["completed"],
            true,
            `${label} snarkjsPowersOfTauVerify.completed`,
          ),
        ]
      : []),
  ].filter(Boolean);
};

const groth16ReproducibleBuildTranscriptProblems = (
  record,
  label,
  manifest,
) => {
  const snarkjs = manifest.selfChecks?.snarkjs ?? {};
  return [
    attestationStringProblem(
      record,
      "schema",
      BSC_GROTH16_REPRODUCIBLE_BUILD_TRANSCRIPT_SCHEMA,
      `${label} schema`,
    ),
    transcriptArrayOrCountAtLeastProblem({
      record,
      arrayKeys: [
        "independentRebuilders",
        "independent_rebuilders",
        "rebuilders",
      ],
      countKeys: [
        "independentRebuilderCount",
        "independent_rebuilder_count",
        "independentRebuildersObserved",
        "independent_rebuilders_observed",
      ],
      minimum: 2,
      label: `${label} independentRebuilders`,
    }),
    transcriptOptionalBooleanProblem(
      record,
      [
        "reproducible",
        "reproducibleBuildComplete",
        "reproducible_build_complete",
      ],
      true,
      `${label} reproducible`,
    ),
    transcriptOptionalStringProblem(
      record,
      ["r1csInfoSource", "r1cs_info_source"],
      snarkjs.r1csInfoSource,
      `${label} r1csInfoSource`,
    ),
    transcriptOptionalIntegerProblem(
      record,
      ["r1csPublicInputCount", "r1cs_public_input_count"],
      Number(snarkjs.r1csPublicInputCount),
      `${label} r1csPublicInputCount`,
    ),
    transcriptOptionalIntegerProblem(
      record,
      ["r1csConstraintCount", "r1cs_constraint_count"],
      Number(snarkjs.r1csConstraintCount),
      `${label} r1csConstraintCount`,
    ),
  ].filter(Boolean);
};

const verifyGroth16MaterialReferencedTranscripts = async (entry, scanPaths) => {
  if (
    entry.kind !== "groth16-material-manifest" ||
    entry.groth16MaterialManifest?.valid !== true ||
    entry.groth16MaterialManifest?.productionReady !== true
  ) {
    return entry;
  }
  const manifest = entry.groth16MaterialManifest;
  const problems = [];
  for (const [reference, label, validate] of [
    [
      manifest.trustedSetupTranscript,
      "trusted setup transcript",
      (record, fullLabel) =>
        groth16TrustedSetupTranscriptProblems(record, fullLabel),
    ],
    [
      manifest.reproducibleBuildTranscript,
      "reproducible build transcript",
      (record, fullLabel) =>
        groth16ReproducibleBuildTranscriptProblems(record, fullLabel, manifest),
    ],
  ]) {
    if (!reference?.valid) {
      problems.push(`Groth16 material manifest ${label} reference is required`);
      continue;
    }
    const fullLabel = `Groth16 material manifest ${label}`;
    try {
      const record = await readGroth16ReferencedAttestation({
        entry,
        reference,
        scanPaths,
        label: fullLabel,
      });
      problems.push(...validate(record, fullLabel));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems.length === 0
    ? entry
    : {
        ...entry,
        groth16MaterialManifest: {
          ...entry.groth16MaterialManifest,
          valid: false,
          referencedTranscriptsVerified: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "invalid-groth16-material-manifest",
            `BSC Groth16 material manifest referenced transcripts are invalid: ${[
              ...new Set(
                problems.map((problem) => trim(problem)).filter(Boolean),
              ),
            ].join("; ")}.`,
          ),
        ],
      };
};

const verifyGroth16MaterialReferencedAttestations = async (
  entry,
  scanPaths,
  bscProfile,
) => {
  if (
    entry.kind !== "groth16-material-manifest" ||
    entry.groth16MaterialManifest?.valid !== true ||
    entry.groth16MaterialManifest?.productionReady !== true
  ) {
    return entry;
  }
  const manifest = entry.groth16MaterialManifest;
  const trustPolicy = manifest.attestationTrustPolicy;
  const problems = [];
  const verifiedSigners = new Map();
  for (const [
    key,
    expectedSchema,
    label,
  ] of BSC_GROTH16_REQUIRED_ATTESTATIONS) {
    const reference = manifest.attestations?.[key];
    if (!reference?.valid) {
      continue;
    }
    const fullLabel = `Groth16 material manifest ${label} attestation`;
    try {
      const record = await readGroth16ReferencedAttestation({
        entry,
        reference,
        scanPaths,
        label: fullLabel,
      });
      problems.push(
        ...groth16ReferencedAttestationBodyProblems({
          record,
          expectedSchema,
          label: fullLabel,
          manifest,
          bscProfile,
        }),
      );
      const signatureResult = groth16ReferencedAttestationSignatureProblems({
        record,
        reference,
        trustPolicy,
        label: fullLabel,
      });
      problems.push(...signatureResult.problems);
      if (
        signatureResult.problems.length === 0 &&
        signatureResult.signerFingerprint
      ) {
        const previous = verifiedSigners.get(signatureResult.signerFingerprint);
        if (previous) {
          problems.push(
            `Groth16 material manifest attestation signers must be role-separated; ${previous} and ${fullLabel} reuse signer ${signatureResult.signerFingerprint}`,
          );
        } else {
          verifiedSigners.set(signatureResult.signerFingerprint, fullLabel);
        }
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems.length === 0
    ? entry
    : {
        ...entry,
        groth16MaterialManifest: {
          ...entry.groth16MaterialManifest,
          valid: false,
          referencedAttestationsVerified: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "invalid-groth16-material-manifest",
            `BSC Groth16 material manifest referenced attestations are invalid: ${[
              ...new Set(
                problems.map((problem) => trim(problem)).filter(Boolean),
              ),
            ].join("; ")}.`,
          ),
        ],
      };
};

const groth16MaterialSelfCheckSummary = ({
  selfChecks,
  verifierKeyHash,
  problems,
}) => {
  const root = isRecord(selfChecks) ? selfChecks : null;
  const snarkjs = root
    ? (ownValue(root, "snarkjs") ?? ownValue(root, "snark_js"))
    : null;
  if (!isRecord(snarkjs)) {
    problems.push("Groth16 material manifest selfChecks.snarkjs is missing.");
    return {
      snarkjs: {
        valid: false,
        r1csInfo: false,
        zkeyVerificationKeyExport: false,
        verifierKeyHashMatches: false,
        exportedVerifierKeyHash: null,
      },
    };
  }
  const exportedVerifierKeyHash = normalizeHex32(
    ownValue(snarkjs, "exportedVerifierKeyHash") ??
      ownValue(snarkjs, "exported_verifier_key_hash"),
  );
  const summary = {
    snarkjs: {
      r1csInfo:
        ownValue(snarkjs, "r1csInfo") ??
        ownValue(snarkjs, "r1cs_info") ??
        false,
      r1csPublicInputCount:
        ownValue(snarkjs, "r1csPublicInputCount") ??
        ownValue(snarkjs, "r1cs_public_input_count") ??
        null,
      r1csInfoSource:
        ownValue(snarkjs, "r1csInfoSource") ??
        ownValue(snarkjs, "r1cs_info_source") ??
        null,
      r1csConstraintCount:
        ownValue(snarkjs, "r1csConstraintCount") ??
        ownValue(snarkjs, "r1cs_constraint_count") ??
        null,
      zkeyVerificationKeyExport:
        ownValue(snarkjs, "zkeyVerificationKeyExport") ??
        ownValue(snarkjs, "zkey_verification_key_export") ??
        false,
      verifierKeyHashMatches:
        ownValue(snarkjs, "verifierKeyHashMatches") ??
        ownValue(snarkjs, "verifier_key_hash_matches") ??
        false,
      exportedVerifierKeyHash,
    },
  };
  if (summary.snarkjs.r1csInfo !== true) {
    problems.push(
      "Groth16 material manifest SnarkJS R1CS self-check must pass.",
    );
  }
  if (
    !BSC_GROTH16_ALLOWED_R1CS_INFO_SOURCES.has(summary.snarkjs.r1csInfoSource)
  ) {
    problems.push(
      "Groth16 material manifest SnarkJS R1CS info source must be one of snarkjs-cli, binary-header-fallback.",
    );
  }
  const r1csPublicInputCount = Number(summary.snarkjs.r1csPublicInputCount);
  const r1csConstraintCount = Number(summary.snarkjs.r1csConstraintCount);
  if (
    !Number.isSafeInteger(r1csPublicInputCount) ||
    r1csPublicInputCount !== 9
  ) {
    problems.push(
      "Groth16 material manifest SnarkJS R1CS public input count must be 9.",
    );
  }
  if (
    !Number.isSafeInteger(r1csConstraintCount) ||
    r1csConstraintCount < PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS
  ) {
    problems.push(
      `Groth16 material manifest SnarkJS R1CS constraint count must be at least ${PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS}.`,
    );
  }
  if (summary.snarkjs.zkeyVerificationKeyExport !== true) {
    problems.push(
      "Groth16 material manifest SnarkJS zkey verification-key export must pass.",
    );
  }
  if (summary.snarkjs.verifierKeyHashMatches !== true) {
    problems.push(
      "Groth16 material manifest SnarkJS exported verifier hash must match.",
    );
  }
  if (!exportedVerifierKeyHash) {
    problems.push(
      "Groth16 material manifest SnarkJS exported verifier key hash is missing or invalid.",
    );
  } else if (exportedVerifierKeyHash !== verifierKeyHash) {
    problems.push(
      "Groth16 material manifest SnarkJS exported verifier key hash must match verifierKeyHash.",
    );
  }
  summary.snarkjs.valid =
    summary.snarkjs.r1csInfo === true &&
    BSC_GROTH16_ALLOWED_R1CS_INFO_SOURCES.has(summary.snarkjs.r1csInfoSource) &&
    Number.isSafeInteger(r1csPublicInputCount) &&
    r1csPublicInputCount === 9 &&
    Number.isSafeInteger(r1csConstraintCount) &&
    r1csConstraintCount >= PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS &&
    summary.snarkjs.zkeyVerificationKeyExport === true &&
    summary.snarkjs.verifierKeyHashMatches === true &&
    Boolean(exportedVerifierKeyHash) &&
    exportedVerifierKeyHash === verifierKeyHash;
  const circuitSource = root
    ? (ownValue(root, "circuitSource") ?? ownValue(root, "circuit_source"))
    : null;
  if (!isRecord(circuitSource)) {
    problems.push(
      "Groth16 material manifest circuitSource self-check is missing.",
    );
    summary.circuitSource = {
      valid: false,
      fullMessageCircuit: false,
      signalBindingFixture: null,
      unresolvedPlaceholders: null,
      keccakPublicSignalDerivation: false,
      digestReductionModuloScalarField: false,
      valueBitBooleanConstraints: false,
      publicSignalConstraintCount: null,
      labelBindingCount: null,
    };
  } else {
    const publicSignalConstraintCount = Number(
      ownValue(circuitSource, "publicSignalConstraintCount") ??
        ownValue(circuitSource, "public_signal_constraint_count"),
    );
    const labelBindingCount = Number(
      ownValue(circuitSource, "labelBindingCount") ??
        ownValue(circuitSource, "label_binding_count"),
    );
    summary.circuitSource = {
      fullMessageCircuit:
        ownValue(circuitSource, "fullMessageCircuit") ??
        ownValue(circuitSource, "full_message_circuit") ??
        false,
      signalBindingFixture:
        ownValue(circuitSource, "signalBindingFixture") ??
        ownValue(circuitSource, "signal_binding_fixture") ??
        null,
      unresolvedPlaceholders:
        ownValue(circuitSource, "unresolvedPlaceholders") ??
        ownValue(circuitSource, "unresolved_placeholders") ??
        null,
      keccakPublicSignalDerivation:
        ownValue(circuitSource, "keccakPublicSignalDerivation") ??
        ownValue(circuitSource, "keccak_public_signal_derivation") ??
        false,
      digestReductionModuloScalarField:
        ownValue(circuitSource, "digestReductionModuloScalarField") ??
        ownValue(circuitSource, "digest_reduction_modulo_scalar_field") ??
        false,
      valueBitBooleanConstraints:
        ownValue(circuitSource, "valueBitBooleanConstraints") ??
        ownValue(circuitSource, "value_bit_boolean_constraints") ??
        false,
      publicSignalConstraintCount,
      labelBindingCount,
    };
    if (summary.circuitSource.fullMessageCircuit !== true) {
      problems.push(
        "Groth16 material manifest circuit source must be a full-message circuit.",
      );
    }
    if (summary.circuitSource.signalBindingFixture !== false) {
      problems.push(
        "Groth16 material manifest circuit source must not be signal-binding fixture material.",
      );
    }
    if (summary.circuitSource.unresolvedPlaceholders !== false) {
      problems.push(
        "Groth16 material manifest circuit source must not contain unresolved placeholders.",
      );
    }
    if (summary.circuitSource.keccakPublicSignalDerivation !== true) {
      problems.push(
        "Groth16 material manifest circuit source must derive public signals with Keccak.",
      );
    }
    if (summary.circuitSource.digestReductionModuloScalarField !== true) {
      problems.push(
        "Groth16 material manifest circuit source must reduce digest signals modulo the scalar field.",
      );
    }
    if (summary.circuitSource.valueBitBooleanConstraints !== true) {
      problems.push(
        "Groth16 material manifest circuit source must boolean-constrain value bits.",
      );
    }
    if (
      !Number.isSafeInteger(publicSignalConstraintCount) ||
      publicSignalConstraintCount !== 9
    ) {
      problems.push(
        "Groth16 material manifest circuit source must constrain all 9 public signals.",
      );
    }
    if (!Number.isSafeInteger(labelBindingCount) || labelBindingCount !== 9) {
      problems.push(
        "Groth16 material manifest circuit source must bind all 9 Solidity signal labels.",
      );
    }
    summary.circuitSource.valid =
      summary.circuitSource.fullMessageCircuit === true &&
      summary.circuitSource.signalBindingFixture === false &&
      summary.circuitSource.unresolvedPlaceholders === false &&
      summary.circuitSource.keccakPublicSignalDerivation === true &&
      summary.circuitSource.digestReductionModuloScalarField === true &&
      summary.circuitSource.valueBitBooleanConstraints === true &&
      Number.isSafeInteger(publicSignalConstraintCount) &&
      publicSignalConstraintCount === 9 &&
      Number.isSafeInteger(labelBindingCount) &&
      labelBindingCount === 9;
  }
  return summary;
};

const groth16MaterialManifestMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const schema = trim(ownValue(json, "schema"));
  const looksLikeGroth16MaterialManifest =
    schema === BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA ||
    /groth16[-_]material.*manifest|material.*groth16.*manifest/iu.test(
      path.basename(filePath),
    );
  if (!looksLikeGroth16MaterialManifest) {
    return { looksLikeGroth16MaterialManifest: false, problems: [] };
  }
  const attestedBscNetwork = trim(
    ownValue(json, "bscNetwork") ??
      ownValue(json, "bsc_network") ??
      ownValue(json, "network"),
  );
  let attestedProfile = null;
  try {
    attestedProfile = attestedBscNetwork
      ? resolveBscNetworkProfile(attestedBscNetwork)
      : null;
  } catch (_error) {
    attestedProfile = null;
  }
  const validationProfile = attestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !attestedProfile || attestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA) {
    problems.push(
      `Groth16 material manifest schema must be ${BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA}.`,
    );
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("Groth16 material manifest routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("Groth16 material manifest assetKey is invalid.");
  }
  for (const [key, expected] of [
    ["bscNetwork", validationProfile.key],
    ["chain", validationProfile.chain],
    ["chainIdHex", validationProfile.chainIdHex],
    ["networkIdHex", validationProfile.networkIdHex],
  ]) {
    const value =
      key === "networkIdHex"
        ? normalizeHex32(
            ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
          )
        : trim(ownValue(json, key));
    if (value !== expected) {
      problems.push(`Groth16 material manifest ${key} must be ${expected}.`);
    }
  }
  if (trim(ownValue(json, "proofBackend")) !== BSC_EVM_GROTH16_BACKEND) {
    problems.push(
      `Groth16 material manifest proofBackend must be ${BSC_EVM_GROTH16_BACKEND}.`,
    );
  }
  if (trim(ownValue(json, "proofFamily")) !== SCCP_PROOF_FAMILY_STARK_FRI) {
    problems.push(
      `Groth16 material manifest proofFamily must be ${SCCP_PROOF_FAMILY_STARK_FRI}.`,
    );
  }
  if (ownValue(json, "sourceDomain") !== SCCP_DOMAIN_SORA) {
    problems.push(
      `Groth16 material manifest sourceDomain must be ${SCCP_DOMAIN_SORA}.`,
    );
  }
  if (ownValue(json, "targetDomain") !== SCCP_DOMAIN_BSC) {
    problems.push(
      `Groth16 material manifest targetDomain must be ${SCCP_DOMAIN_BSC}.`,
    );
  }
  if (
    trim(ownValue(json, "circuitProfile")) !== BSC_FULL_SCCP_CIRCUIT_PROFILE
  ) {
    problems.push(
      `Groth16 material manifest circuitProfile must be ${BSC_FULL_SCCP_CIRCUIT_PROFILE}.`,
    );
  }
  if (ownValue(json, "publicInputCount") !== 9) {
    problems.push("Groth16 material manifest publicInputCount must be 9.");
  }
  const publicSignalNames = ownArrayValues(ownValue(json, "publicSignalNames"));
  if (
    publicSignalNames.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length ||
    publicSignalNames.some(
      (value, index) => value !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES[index],
    )
  ) {
    problems.push(
      "Groth16 material manifest publicSignalNames must match BSC Groth16 public signals.",
    );
  }
  if (ownValue(json, "productionReady") !== true) {
    problems.push("Groth16 material manifest productionReady must be true.");
  }
  const productionBlockers = ownValue(json, "productionBlockers");
  const productionBlockerValues = Array.isArray(productionBlockers)
    ? ownArrayValues(productionBlockers).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(productionBlockers)) {
    problems.push(
      "Groth16 material manifest productionBlockers must be an array.",
    );
  } else if (productionBlockerValues.length > 0) {
    const blockerSummary = boundedProblemSummary(productionBlockerValues);
    problems.push(
      `Groth16 material manifest productionBlockers must be empty: ${blockerSummary}.`,
    );
  }
  const verifierKeyHash = normalizeHex32(ownValue(json, "verifierKeyHash"));
  if (!verifierKeyHash) {
    problems.push(
      "Groth16 material manifest verifierKeyHash is missing or invalid.",
    );
  } else if (isKnownDiagnosticBscVerifierKeyHash(verifierKeyHash)) {
    problems.push(
      "Groth16 material manifest verifierKeyHash is a known diagnostic BSC verifier key hash.",
    );
  }
  const selfChecks = groth16MaterialSelfCheckSummary({
    selfChecks: ownValue(json, "selfChecks") ?? ownValue(json, "self_checks"),
    verifierKeyHash,
    problems,
  });
  const artifacts = isRecord(ownValue(json, "artifacts"))
    ? ownValue(json, "artifacts")
    : {};
  const artifactReferences = {
    circuitSource: groth16MaterialArtifactReference(
      artifacts,
      ["circuitSource", "circuit_source"],
      "Groth16 material manifest artifacts.circuitSource.path",
    ),
    r1cs: groth16MaterialArtifactReference(
      artifacts,
      ["r1cs"],
      "Groth16 material manifest artifacts.r1cs.path",
    ),
    provingKey: groth16MaterialArtifactReference(
      artifacts,
      ["provingKey", "proving_key"],
      "Groth16 material manifest artifacts.provingKey.path",
    ),
    bscVerifierKey: groth16MaterialArtifactReference(
      artifacts,
      ["bscVerifierKey", "bsc_verifier_key"],
      "Groth16 material manifest artifacts.bscVerifierKey.path",
    ),
    snarkjsVerificationKey: groth16MaterialArtifactReference(
      artifacts,
      ["snarkjsVerificationKey", "snarkjs_verification_key"],
      "Groth16 material manifest artifacts.snarkjsVerificationKey.path",
    ),
    trustedSetupTranscript: groth16MaterialArtifactReference(
      artifacts,
      ["trustedSetupTranscript", "trusted_setup_transcript"],
      "Groth16 material manifest artifacts.trustedSetupTranscript.path",
    ),
    reproducibleBuildTranscript: groth16MaterialArtifactReference(
      artifacts,
      ["reproducibleBuildTranscript", "reproducible_build_transcript"],
      "Groth16 material manifest artifacts.reproducibleBuildTranscript.path",
    ),
  };
  const proofArtifactHash = artifactReferences.r1cs.sha256;
  const circuitSourceHash = artifactReferences.circuitSource.sha256;
  const provingKeyHash = artifactReferences.provingKey.sha256;
  const bscVerifierKeyArtifactHash = artifactReferences.bscVerifierKey.sha256;
  const snarkjsVerificationKeyHash =
    artifactReferences.snarkjsVerificationKey.sha256;
  const trustedSetupTranscript = artifactReferences.trustedSetupTranscript;
  const reproducibleBuildTranscript =
    artifactReferences.reproducibleBuildTranscript;
  problems.push(
    ...Object.values(artifactReferences).flatMap((reference) =>
      Array.isArray(reference.pathProblems) ? reference.pathProblems : [],
    ),
  );
  for (const [label, value] of [
    ["circuit source", circuitSourceHash],
    ["R1CS", proofArtifactHash],
    ["proving key", provingKeyHash],
    ["BSC verifier key", bscVerifierKeyArtifactHash],
    ["SnarkJS verification key", snarkjsVerificationKeyHash],
    ["trusted setup transcript", trustedSetupTranscript.sha256],
    ["reproducible build transcript", reproducibleBuildTranscript.sha256],
  ]) {
    if (!value) {
      problems.push(
        `Groth16 material manifest ${label} sha256 is missing or invalid.`,
      );
    }
  }
  const trustedSetup = ownValue(json, "trustedSetup");
  if (!isRecord(trustedSetup)) {
    problems.push("Groth16 material manifest trustedSetup is missing.");
  } else {
    if (ownValue(trustedSetup, "localPowersOfTau") !== false) {
      problems.push(
        "Groth16 material manifest trustedSetup.localPowersOfTau must be false.",
      );
    }
    if (ownValue(trustedSetup, "localPhase2Contribution") !== false) {
      problems.push(
        "Groth16 material manifest trustedSetup.localPhase2Contribution must be false.",
      );
    }
  }
  problems.push(
    ...roleSeparatedProductionHashProblems(
      { verifierKeyHash, proofArtifactHash, provingKeyHash },
      "BSC Groth16 material manifest",
      ["verifierKeyHash", "proofArtifactHash", "provingKeyHash"],
    ),
  );
  const attestationTrustPolicy = groth16MaterialTrustPolicySummary({
    trustPolicy:
      ownValue(json, "attestationTrustPolicy") ??
      ownValue(json, "attestation_trust_policy"),
    problems,
  });
  const attestations = groth16MaterialAttestationSummary(
    ownValue(json, "attestations"),
    problems,
  );
  return {
    looksLikeGroth16MaterialManifest,
    valid: problems.length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: attestedProfile?.key ?? attestedBscNetwork,
    chain: ownValue(json, "chain"),
    chainIdHex: ownValue(json, "chainIdHex"),
    networkIdHex:
      normalizeHex32(
        ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
      ) || null,
    proofBackend: ownValue(json, "proofBackend"),
    proofFamily: ownValue(json, "proofFamily"),
    sourceDomain: ownValue(json, "sourceDomain"),
    targetDomain: ownValue(json, "targetDomain"),
    circuitProfile: ownValue(json, "circuitProfile"),
    publicInputCount: ownValue(json, "publicInputCount"),
    publicSignalNames,
    productionReady: ownValue(json, "productionReady") === true,
    productionBlockers: productionBlockerValues,
    productionBlockerSummary: boundedProblemSummary(productionBlockerValues),
    productionBlockerCount: Array.isArray(productionBlockers)
      ? productionBlockerValues.length
      : null,
    verifierKeyHash,
    circuitSourceHash,
    proofArtifactHash,
    provingKeyHash,
    bscVerifierKeyArtifactHash,
    snarkjsVerificationKeyHash,
    trustedSetupTranscript,
    trustedSetupTranscriptHash: trustedSetupTranscript.sha256,
    reproducibleBuildTranscript,
    reproducibleBuildTranscriptHash: reproducibleBuildTranscript.sha256,
    selfChecks,
    attestationTrustPolicy,
    attestations,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    referencedTranscriptsVerified:
      trustedSetupTranscript.valid === true &&
      reproducibleBuildTranscript.valid === true &&
      trustedSetupTranscript.pathProblems.length === 0 &&
      reproducibleBuildTranscript.pathProblems.length === 0
        ? undefined
        : false,
    problems,
  };
};

const groth16AttestationRequestMaterialSummary = (json) => {
  const artifacts = isRecord(ownValue(json, "artifacts"))
    ? ownValue(json, "artifacts")
    : {};
  const artifactReferences = {
    circuitSource: groth16MaterialArtifactReference(
      artifacts,
      ["circuitSource", "circuit_source"],
      "Groth16 attestation request package artifacts.circuitSource.path",
    ),
    r1cs: groth16MaterialArtifactReference(
      artifacts,
      ["r1cs"],
      "Groth16 attestation request package artifacts.r1cs.path",
    ),
    provingKey: groth16MaterialArtifactReference(
      artifacts,
      ["provingKey", "proving_key"],
      "Groth16 attestation request package artifacts.provingKey.path",
    ),
    bscVerifierKey: groth16MaterialArtifactReference(
      artifacts,
      ["bscVerifierKey", "bsc_verifier_key"],
      "Groth16 attestation request package artifacts.bscVerifierKey.path",
    ),
    snarkjsVerificationKey: groth16MaterialArtifactReference(
      artifacts,
      ["snarkjsVerificationKey", "snarkjs_verification_key"],
      "Groth16 attestation request package artifacts.snarkjsVerificationKey.path",
    ),
    trustedSetupTranscript: groth16MaterialArtifactReference(
      artifacts,
      ["trustedSetupTranscript", "trusted_setup_transcript"],
      "Groth16 attestation request package artifacts.trustedSetupTranscript.path",
    ),
    reproducibleBuildTranscript: groth16MaterialArtifactReference(
      artifacts,
      ["reproducibleBuildTranscript", "reproducible_build_transcript"],
      "Groth16 attestation request package artifacts.reproducibleBuildTranscript.path",
    ),
  };
  const reproducibleBuildTranscript =
    artifactReferences.reproducibleBuildTranscript;
  return {
    verifierKeyHash: normalizeHex32(ownValue(json, "verifierKeyHash")),
    circuitSourceHash: artifactReferences.circuitSource.sha256,
    proofArtifactHash: artifactReferences.r1cs.sha256,
    provingKeyHash: artifactReferences.provingKey.sha256,
    bscVerifierKeyArtifactHash: artifactReferences.bscVerifierKey.sha256,
    snarkjsVerificationKeyHash:
      artifactReferences.snarkjsVerificationKey.sha256,
    trustedSetupTranscript: artifactReferences.trustedSetupTranscript,
    trustedSetupTranscriptHash:
      artifactReferences.trustedSetupTranscript.sha256,
    reproducibleBuildTranscript,
    reproducibleBuildTranscriptHash: reproducibleBuildTranscript.sha256,
    artifactPathProblems: Object.values(artifactReferences).flatMap(
      (reference) =>
        Array.isArray(reference.pathProblems) ? reference.pathProblems : [],
    ),
  };
};

const groth16RelativeEvidencePathProblems = (value, label) => {
  const source = trim(value);
  if (!source) {
    return [`${label} must be a safe relative path.`];
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
    return [`${label} must be a safe relative path.`];
  }
  let decoded = source;
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return [`${label} must be a safe relative path.`];
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  if (decoded !== source) {
    return [`${label} must be a safe relative path.`];
  }
  const segments = source.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return [`${label} must be a safe relative path.`];
  }
  return [];
};

const groth16AttestationRequestRoleSummary = ({
  role,
  key,
  expectedSchema,
  label,
  materialSummary,
  bscProfile,
  problems,
}) => {
  if (!isRecord(role)) {
    problems.push(`Groth16 attestation request ${label} role is required.`);
    return {
      valid: false,
      readyForSignature: false,
      signedPayloadSha256: null,
      blockerCount: null,
      blockers: [],
      key,
    };
  }
  const body = ownValue(role, "body");
  if (!isRecord(body)) {
    problems.push(`Groth16 attestation request ${label} body is required.`);
    return {
      valid: false,
      readyForSignature: false,
      signedPayloadSha256: normalizeHex32(
        ownValue(role, "signedPayloadSha256"),
      ),
      blockerCount: null,
      blockers: [],
      key,
    };
  }
  const blockersValue = ownValue(role, "blockers");
  const blockers = ownArrayValues(blockersValue).map((entry) => trim(entry));
  if (!Array.isArray(blockersValue)) {
    problems.push(
      `Groth16 attestation request ${label} blockers must be an array.`,
    );
  }
  if (blockers.some((entry) => !entry)) {
    problems.push(
      `Groth16 attestation request ${label} blockers must be non-empty strings.`,
    );
  }
  const readyForSignature = ownValue(role, "readyForSignature") === true;
  if (readyForSignature && blockers.length > 0) {
    problems.push(
      `Groth16 attestation request ${label} cannot be readyForSignature with blockers.`,
    );
  }
  if (!readyForSignature && blockers.length === 0) {
    problems.push(
      `Groth16 attestation request ${label} must explain why readyForSignature is false.`,
    );
  }
  const signedPayloadSha256 = sha256Bytes(attestationSignaturePayload(body));
  const declaredPayloadSha256 = normalizeHex32(
    ownValue(role, "signedPayloadSha256") ??
      ownValue(role, "signed_payload_sha256"),
  );
  if (!declaredPayloadSha256 || declaredPayloadSha256 !== signedPayloadSha256) {
    problems.push(
      `Groth16 attestation request ${label} signedPayloadSha256 must match role body.`,
    );
  }
  const signatureTemplate = ownValue(role, "signatureTemplate");
  if (!isRecord(signatureTemplate)) {
    problems.push(
      `Groth16 attestation request ${label} signatureTemplate is required.`,
    );
  } else {
    if (
      trim(ownValue(signatureTemplate, "schema")) !==
      BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA
    ) {
      problems.push(
        `Groth16 attestation request ${label} signatureTemplate schema must be ${BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA}.`,
      );
    }
    if (trim(ownValue(signatureTemplate, "algorithm")) !== "ed25519") {
      problems.push(
        `Groth16 attestation request ${label} signatureTemplate algorithm must be ed25519.`,
      );
    }
    const templatePayloadHash = normalizeHex32(
      ownValue(signatureTemplate, "signedPayloadSha256") ??
        ownValue(signatureTemplate, "signed_payload_sha256"),
    );
    if (templatePayloadHash !== signedPayloadSha256) {
      problems.push(
        `Groth16 attestation request ${label} signatureTemplate signedPayloadSha256 must match role body.`,
      );
    }
  }
  problems.push(
    ...groth16ReferencedAttestationBodyProblems({
      record: body,
      expectedSchema,
      label: `Groth16 attestation request ${label}`,
      manifest: materialSummary,
      bscProfile,
    }),
  );
  if (expectedSchema === BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA) {
    const toolchainProblem = attestationHashPresentProblem(
      body,
      ["toolchainSha256", "toolchain_sha256"],
      `Groth16 attestation request ${label} toolchainSha256`,
    );
    if (toolchainProblem) {
      problems.push(toolchainProblem);
    }
    const r1csInfoSource = trim(
      ownValue(body, "r1csInfoSource") ?? ownValue(body, "r1cs_info_source"),
    );
    const r1csPublicInputCount = Number(
      ownValue(body, "r1csPublicInputCount") ??
        ownValue(body, "r1cs_public_input_count"),
    );
    const r1csConstraintCount = Number(
      ownValue(body, "r1csConstraintCount") ??
        ownValue(body, "r1cs_constraint_count"),
    );
    if (!BSC_GROTH16_ALLOWED_R1CS_INFO_SOURCES.has(r1csInfoSource)) {
      problems.push(
        `Groth16 attestation request ${label} r1csInfoSource must be one of snarkjs-cli, binary-header-fallback.`,
      );
    }
    if (
      !Number.isSafeInteger(r1csPublicInputCount) ||
      r1csPublicInputCount !== 9
    ) {
      problems.push(
        `Groth16 attestation request ${label} r1csPublicInputCount must be 9.`,
      );
    }
    if (
      !Number.isSafeInteger(r1csConstraintCount) ||
      r1csConstraintCount < PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS
    ) {
      problems.push(
        `Groth16 attestation request ${label} r1csConstraintCount must be at least ${PRODUCTION_FULL_SCCP_MIN_R1CS_CONSTRAINTS}.`,
      );
    }
    problems.push(
      attestationBooleanProblem(
        body,
        ["zkeyVerificationKeyExport", "zkey_verification_key_export"],
        true,
        `Groth16 attestation request ${label} zkeyVerificationKeyExport`,
      ),
      attestationBooleanProblem(
        body,
        ["verifierKeyHashMatches", "verifier_key_hash_matches"],
        true,
        `Groth16 attestation request ${label} verifierKeyHashMatches`,
      ),
      attestationHashProblem(
        body,
        ["exportedVerifierKeyHash", "exported_verifier_key_hash"],
        materialSummary.verifierKeyHash,
        `Groth16 attestation request ${label} exportedVerifierKeyHash`,
      ),
    );
  }
  return {
    valid: true,
    schema: expectedSchema,
    signerRole: trim(ownValue(role, "signerRole")),
    readyForSignature,
    blockerCount: blockers.length,
    blockers,
    signedPayloadSha256,
    bodySchema: trim(ownValue(body, "schema")),
    key,
  };
};

const groth16AttestationRequestPackageMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const schema = trim(ownValue(json, "schema"));
  const looksLikeGroth16AttestationRequestPackage =
    schema === BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA ||
    /groth16.*attestation.*request|attestation.*request.*groth16/iu.test(
      path.basename(filePath),
    );
  if (!looksLikeGroth16AttestationRequestPackage) {
    return {
      looksLikeGroth16AttestationRequestPackage: false,
      problems: [],
    };
  }
  const requestedBscNetwork = trim(
    ownValue(json, "bscNetwork") ??
      ownValue(json, "bsc_network") ??
      ownValue(json, "network"),
  );
  let requestedProfile = null;
  try {
    requestedProfile = requestedBscNetwork
      ? resolveBscNetworkProfile(requestedBscNetwork)
      : null;
  } catch (_error) {
    requestedProfile = null;
  }
  const validationProfile = requestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !requestedProfile || requestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA) {
    problems.push(
      `Groth16 attestation request package schema must be ${BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA}.`,
    );
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("Groth16 attestation request package routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("Groth16 attestation request package assetKey is invalid.");
  }
  for (const [key, expected] of [
    ["bscNetwork", validationProfile.key],
    ["chain", validationProfile.chain],
    ["chainIdHex", validationProfile.chainIdHex],
    ["networkIdHex", validationProfile.networkIdHex],
  ]) {
    const value =
      key === "networkIdHex"
        ? normalizeHex32(
            ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
          )
        : trim(ownValue(json, key));
    if (value !== expected) {
      problems.push(
        `Groth16 attestation request package ${key} must be ${expected}.`,
      );
    }
  }
  if (
    trim(ownValue(json, "circuitProfile")) !== BSC_FULL_SCCP_CIRCUIT_PROFILE
  ) {
    problems.push(
      `Groth16 attestation request package circuitProfile must be ${BSC_FULL_SCCP_CIRCUIT_PROFILE}.`,
    );
  }
  if (ownValue(json, "publicInputCount") !== 9) {
    problems.push(
      "Groth16 attestation request package publicInputCount must be 9.",
    );
  }
  const publicSignalNames = ownArrayValues(ownValue(json, "publicSignalNames"));
  if (
    publicSignalNames.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length ||
    publicSignalNames.some(
      (value, index) => value !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES[index],
    )
  ) {
    problems.push(
      "Groth16 attestation request package publicSignalNames must match BSC Groth16 public signals.",
    );
  }
  const manifest = isRecord(ownValue(json, "manifest"))
    ? ownValue(json, "manifest")
    : {};
  const manifestPath = trim(ownValue(manifest, "path"));
  problems.push(
    ...groth16RelativeEvidencePathProblems(
      manifestPath,
      "Groth16 attestation request package manifest.path",
    ),
  );
  const manifestSha256 = normalizeHex32(ownValue(manifest, "sha256"));
  if (!manifestSha256) {
    problems.push(
      "Groth16 attestation request package manifest.sha256 is missing or invalid.",
    );
  }
  const productionBlockers = ownValue(manifest, "productionBlockers");
  const productionBlockerCount = Array.isArray(productionBlockers)
    ? ownArrayValues(productionBlockers).length
    : null;
  if (productionBlockers !== undefined && !Array.isArray(productionBlockers)) {
    problems.push(
      "Groth16 attestation request package manifest.productionBlockers must be an array.",
    );
  }
  const materialSummary = groth16AttestationRequestMaterialSummary(json);
  problems.push(...materialSummary.artifactPathProblems);
  for (const [label, value] of [
    ["verifier key", materialSummary.verifierKeyHash],
    ["circuit source", materialSummary.circuitSourceHash],
    ["R1CS", materialSummary.proofArtifactHash],
    ["proving key", materialSummary.provingKeyHash],
    ["BSC verifier key", materialSummary.bscVerifierKeyArtifactHash],
    ["SnarkJS verification key", materialSummary.snarkjsVerificationKeyHash],
    ["trusted setup transcript", materialSummary.trustedSetupTranscriptHash],
    [
      "reproducible build transcript",
      materialSummary.reproducibleBuildTranscriptHash,
    ],
  ]) {
    if (!value) {
      problems.push(
        `Groth16 attestation request package ${label} hash is missing or invalid.`,
      );
    }
  }
  const rolesRoot = isRecord(ownValue(json, "roles"))
    ? ownValue(json, "roles")
    : {};
  if (!isRecord(ownValue(json, "roles"))) {
    problems.push("Groth16 attestation request package roles is required.");
  }
  const roles = {};
  for (const [
    key,
    expectedSchema,
    label,
  ] of BSC_GROTH16_REQUIRED_ATTESTATIONS) {
    roles[key] = groth16AttestationRequestRoleSummary({
      role: ownValue(rolesRoot, key),
      key,
      expectedSchema,
      label,
      materialSummary,
      bscProfile: validationProfile,
      problems,
    });
  }
  const signingInstructions = ownValue(json, "signingInstructions");
  if (!isRecord(signingInstructions)) {
    problems.push(
      "Groth16 attestation request package signingInstructions is required.",
    );
  } else {
    if (
      trim(ownValue(signingInstructions, "signatureSchema")) !==
      BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA
    ) {
      problems.push(
        `Groth16 attestation request package signingInstructions.signatureSchema must be ${BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA}.`,
      );
    }
    if (trim(ownValue(signingInstructions, "algorithm")) !== "ed25519") {
      problems.push(
        "Groth16 attestation request package signingInstructions.algorithm must be ed25519.",
      );
    }
    if (
      ownValue(
        signingInstructions,
        "mustNotSignWhenReadyForSignatureIsFalse",
      ) !== true
    ) {
      problems.push(
        "Groth16 attestation request package signingInstructions.mustNotSignWhenReadyForSignatureIsFalse must be true.",
      );
    }
  }
  const allRolesReady = Object.values(roles).every(
    (role) => role.readyForSignature === true && role.blockerCount === 0,
  );
  return {
    looksLikeGroth16AttestationRequestPackage,
    valid: problems.filter(Boolean).length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: requestedProfile?.key ?? requestedBscNetwork,
    chain: ownValue(json, "chain"),
    chainIdHex: ownValue(json, "chainIdHex"),
    networkIdHex:
      normalizeHex32(
        ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
      ) || null,
    circuitProfile: ownValue(json, "circuitProfile"),
    publicInputCount: ownValue(json, "publicInputCount"),
    publicSignalNames,
    verifierKeyHash: materialSummary.verifierKeyHash,
    circuitSourceHash: materialSummary.circuitSourceHash,
    proofArtifactHash: materialSummary.proofArtifactHash,
    provingKeyHash: materialSummary.provingKeyHash,
    bscVerifierKeyArtifactHash: materialSummary.bscVerifierKeyArtifactHash,
    snarkjsVerificationKeyHash: materialSummary.snarkjsVerificationKeyHash,
    trustedSetupTranscriptHash: materialSummary.trustedSetupTranscriptHash,
    reproducibleBuildTranscriptHash:
      materialSummary.reproducibleBuildTranscriptHash,
    manifestPath,
    manifestSha256,
    manifestProductionReady: ownValue(manifest, "productionReady") === true,
    manifestProductionBlockerCount: productionBlockerCount,
    roles,
    allRolesReady,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    problems: problems.filter(Boolean),
  };
};

const BSC_GROTH16_HANDOFF_PACKAGE_SCHEMAS = Object.freeze({
  transcriptTemplates: "iroha-sccp-bsc-groth16-transcript-template-package/v1",
  evidenceTemplates: "iroha-sccp-bsc-groth16-evidence-template-package/v1",
  attestationRequest: BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA,
});

const groth16AttestationHandoffPackageReference = ({
  packages,
  key,
  expectedSchema,
  label,
  problems,
}) => {
  const record = isRecord(ownValue(packages, key))
    ? ownValue(packages, key)
    : {};
  if (!isRecord(ownValue(packages, key))) {
    problems.push(`Groth16 attestation handoff packages.${key} is required.`);
  }
  const pathName = trim(ownValue(record, "path"));
  problems.push(
    ...groth16RelativeEvidencePathProblems(
      pathName,
      `Groth16 attestation handoff ${label}.path`,
    ),
  );
  const sha256 = normalizeHex32(ownValue(record, "sha256"));
  if (!sha256) {
    problems.push(
      `Groth16 attestation handoff ${label}.sha256 is missing or invalid.`,
    );
  }
  const schema = trim(ownValue(record, "schema"));
  if (schema !== expectedSchema) {
    problems.push(
      `Groth16 attestation handoff ${label}.schema must be ${expectedSchema}.`,
    );
  }
  return {
    path: pathName,
    sha256,
    schema,
    draftsAreNotProductionReady:
      ownValue(record, "draftsAreNotProductionReady") === true,
    draftsAreNotSignable: ownValue(record, "draftsAreNotSignable") === true,
  };
};

const groth16AttestationHandoffMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const schema = trim(ownValue(json, "schema"));
  const looksLikeGroth16AttestationHandoff =
    schema === BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA ||
    /groth16.*attestation.*handoff|attestation.*handoff.*groth16|handoff.*groth16/iu.test(
      path.basename(filePath),
    );
  if (!looksLikeGroth16AttestationHandoff) {
    return { looksLikeGroth16AttestationHandoff: false, problems: [] };
  }
  const requestedBscNetwork = trim(
    ownValue(json, "bscNetwork") ??
      ownValue(json, "bsc_network") ??
      ownValue(json, "network"),
  );
  let requestedProfile = null;
  try {
    requestedProfile = requestedBscNetwork
      ? resolveBscNetworkProfile(requestedBscNetwork)
      : null;
  } catch (_error) {
    requestedProfile = null;
  }
  const validationProfile = requestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !requestedProfile || requestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA) {
    problems.push(
      `Groth16 attestation handoff schema must be ${BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA}.`,
    );
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("Groth16 attestation handoff routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("Groth16 attestation handoff assetKey is invalid.");
  }
  for (const [key, expected] of [
    ["bscNetwork", validationProfile.key],
    ["chain", validationProfile.chain],
    ["chainIdHex", validationProfile.chainIdHex],
    ["networkIdHex", validationProfile.networkIdHex],
  ]) {
    const value =
      key === "networkIdHex"
        ? normalizeHex32(
            ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
          )
        : trim(ownValue(json, key));
    if (value !== expected) {
      problems.push(`Groth16 attestation handoff ${key} must be ${expected}.`);
    }
  }
  if (
    trim(ownValue(json, "circuitProfile")) !== BSC_FULL_SCCP_CIRCUIT_PROFILE
  ) {
    problems.push(
      `Groth16 attestation handoff circuitProfile must be ${BSC_FULL_SCCP_CIRCUIT_PROFILE}.`,
    );
  }
  if (trim(ownValue(json, "proofBackend")) !== BSC_EVM_GROTH16_BACKEND) {
    problems.push(
      `Groth16 attestation handoff proofBackend must be ${BSC_EVM_GROTH16_BACKEND}.`,
    );
  }
  const verifierKeyHash = normalizeHex32(ownValue(json, "verifierKeyHash"));
  if (!verifierKeyHash) {
    problems.push(
      "Groth16 attestation handoff verifierKeyHash is missing or invalid.",
    );
  } else if (isKnownDiagnosticBscVerifierKeyHash(verifierKeyHash)) {
    problems.push(
      "Groth16 attestation handoff verifierKeyHash is a known diagnostic BSC verifier key hash.",
    );
  }

  const manifest = isRecord(ownValue(json, "manifest"))
    ? ownValue(json, "manifest")
    : {};
  if (!isRecord(ownValue(json, "manifest"))) {
    problems.push("Groth16 attestation handoff manifest is required.");
  }
  const manifestPath = trim(ownValue(manifest, "path"));
  problems.push(
    ...groth16RelativeEvidencePathProblems(
      manifestPath,
      "Groth16 attestation handoff manifest.path",
    ),
  );
  const manifestSha256 = normalizeHex32(ownValue(manifest, "sha256"));
  if (!manifestSha256) {
    problems.push(
      "Groth16 attestation handoff manifest.sha256 is missing or invalid.",
    );
  }
  const manifestProductionReady =
    ownValue(manifest, "productionReady") === true;
  if (
    ownValue(manifest, "productionReady") !== true &&
    ownValue(manifest, "productionReady") !== false
  ) {
    problems.push(
      "Groth16 attestation handoff manifest.productionReady must be a boolean.",
    );
  }
  const manifestProductionBlockers = ownValue(manifest, "productionBlockers");
  const productionBlockers = Array.isArray(manifestProductionBlockers)
    ? ownArrayValues(manifestProductionBlockers).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(manifestProductionBlockers)) {
    problems.push(
      "Groth16 attestation handoff manifest.productionBlockers must be an array.",
    );
  }
  if (manifestProductionReady && productionBlockers.length > 0) {
    problems.push(
      "Groth16 attestation handoff manifest cannot be productionReady with productionBlockers.",
    );
  }

  const packages = isRecord(ownValue(json, "packages"))
    ? ownValue(json, "packages")
    : {};
  if (!isRecord(ownValue(json, "packages"))) {
    problems.push("Groth16 attestation handoff packages is required.");
  }
  const packageReferences = Object.fromEntries(
    Object.entries(BSC_GROTH16_HANDOFF_PACKAGE_SCHEMAS).map(
      ([key, expectedSchema]) => [
        key,
        groth16AttestationHandoffPackageReference({
          packages,
          key,
          expectedSchema,
          label: key,
          problems,
        }),
      ],
    ),
  );
  if (
    packageReferences.transcriptTemplates.path &&
    !packageReferences.transcriptTemplates.draftsAreNotProductionReady
  ) {
    problems.push(
      "Groth16 attestation handoff transcriptTemplates must be marked draftsAreNotProductionReady.",
    );
  }
  if (
    packageReferences.evidenceTemplates.path &&
    !packageReferences.evidenceTemplates.draftsAreNotSignable
  ) {
    problems.push(
      "Groth16 attestation handoff evidenceTemplates must be marked draftsAreNotSignable.",
    );
  }

  const readiness = isRecord(ownValue(json, "readiness"))
    ? ownValue(json, "readiness")
    : {};
  if (!isRecord(ownValue(json, "readiness"))) {
    problems.push("Groth16 attestation handoff readiness is required.");
  }
  const handoffComplete = ownValue(readiness, "handoffComplete") === true;
  if (!handoffComplete) {
    problems.push(
      "Groth16 attestation handoff readiness.handoffComplete must be true.",
    );
  }
  const readinessProductionReady =
    ownValue(readiness, "productionReady") === true;
  if (
    ownValue(readiness, "productionReady") !== true &&
    ownValue(readiness, "productionReady") !== false
  ) {
    problems.push(
      "Groth16 attestation handoff readiness.productionReady must be a boolean.",
    );
  }
  if (readinessProductionReady !== manifestProductionReady) {
    problems.push(
      "Groth16 attestation handoff readiness.productionReady must match manifest.productionReady.",
    );
  }
  const signingReady = ownValue(readiness, "signingReady") === true;
  const readyToFinalize = ownValue(readiness, "readyToFinalize") === true;
  const requestValid = ownValue(readiness, "requestValid") === true;
  if (!requestValid) {
    problems.push(
      "Groth16 attestation handoff readiness.requestValid must be true.",
    );
  }
  const readyForSignature = isRecord(
    ownValue(readiness, "requestReadyForSignature"),
  )
    ? ownValue(readiness, "requestReadyForSignature")
    : {};
  if (!isRecord(ownValue(readiness, "requestReadyForSignature"))) {
    problems.push(
      "Groth16 attestation handoff readiness.requestReadyForSignature is required.",
    );
  }
  const roleReadiness = {};
  for (const [key] of BSC_GROTH16_REQUIRED_ATTESTATIONS) {
    if (
      ownValue(readyForSignature, key) !== true &&
      ownValue(readyForSignature, key) !== false
    ) {
      problems.push(
        `Groth16 attestation handoff readiness.requestReadyForSignature.${key} must be a boolean.`,
      );
    }
    roleReadiness[key] = ownValue(readyForSignature, key) === true;
  }
  const allRolesReady = Object.values(roleReadiness).every(Boolean);
  if (signingReady && !allRolesReady) {
    problems.push(
      "Groth16 attestation handoff readiness.signingReady cannot be true while request roles are blocked.",
    );
  }
  const missingSignedRolesValue = ownValue(readiness, "missingSignedRoles");
  const missingSignedRoles = Array.isArray(missingSignedRolesValue)
    ? ownArrayValues(missingSignedRolesValue).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(missingSignedRolesValue)) {
    problems.push(
      "Groth16 attestation handoff readiness.missingSignedRoles must be an array.",
    );
  }
  const allowedRoles = new Set(
    BSC_GROTH16_REQUIRED_ATTESTATIONS.map(([key]) => key),
  );
  for (const role of missingSignedRoles) {
    if (!allowedRoles.has(role)) {
      problems.push(
        `Groth16 attestation handoff readiness.missingSignedRoles contains unknown role ${role}.`,
      );
    }
  }
  const handoffBlockersValue = ownValue(readiness, "handoffBlockers");
  const handoffBlockers = Array.isArray(handoffBlockersValue)
    ? ownArrayValues(handoffBlockersValue).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(handoffBlockersValue)) {
    problems.push(
      "Groth16 attestation handoff readiness.handoffBlockers must be an array.",
    );
  }
  if (handoffComplete && handoffBlockers.length > 0) {
    problems.push(
      `Groth16 attestation handoff readiness.handoffBlockers must be empty when handoffComplete is true: ${boundedProblemSummary(handoffBlockers)}.`,
    );
  }
  const statusProblemsValue = ownValue(readiness, "attestationStatusProblems");
  const attestationStatusProblems = Array.isArray(statusProblemsValue)
    ? ownArrayValues(statusProblemsValue).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(statusProblemsValue)) {
    problems.push(
      "Groth16 attestation handoff readiness.attestationStatusProblems must be an array.",
    );
  }
  const readinessProductionBlockersValue = ownValue(
    readiness,
    "productionBlockers",
  );
  const readinessProductionBlockers = Array.isArray(
    readinessProductionBlockersValue,
  )
    ? ownArrayValues(readinessProductionBlockersValue).map((entry) =>
        trim(entry),
      )
    : [];
  if (!Array.isArray(readinessProductionBlockersValue)) {
    problems.push(
      "Groth16 attestation handoff readiness.productionBlockers must be an array.",
    );
  }
  if (
    JSON.stringify(readinessProductionBlockers) !==
    JSON.stringify(productionBlockers)
  ) {
    problems.push(
      "Groth16 attestation handoff readiness.productionBlockers must match manifest.productionBlockers.",
    );
  }
  if (readinessProductionReady && readinessProductionBlockers.length > 0) {
    problems.push(
      "Groth16 attestation handoff readiness.productionReady cannot be true with productionBlockers.",
    );
  }
  const problemCount = Number(ownValue(readiness, "problemCount"));
  if (!Number.isSafeInteger(problemCount) || problemCount < 0) {
    problems.push(
      "Groth16 attestation handoff readiness.problemCount must be a non-negative integer.",
    );
  }
  if (
    Number.isSafeInteger(problemCount) &&
    problemCount === 0 &&
    (handoffBlockers.length > 0 ||
      attestationStatusProblems.length > 0 ||
      readinessProductionBlockers.length > 0)
  ) {
    problems.push(
      "Groth16 attestation handoff readiness.problemCount cannot be zero while blockers are present.",
    );
  }
  if (
    readyToFinalize &&
    (!signingReady ||
      !allRolesReady ||
      missingSignedRoles.length > 0 ||
      !readinessProductionReady ||
      problemCount !== 0)
  ) {
    problems.push(
      "Groth16 attestation handoff readiness.readyToFinalize requires signingReady, all roles ready, no missing signed roles, productionReady, and problemCount zero.",
    );
  }
  const nextActionsValue = ownValue(readiness, "nextActions");
  const nextActions = Array.isArray(nextActionsValue)
    ? ownArrayValues(nextActionsValue).map((entry) => trim(entry))
    : [];
  if (!Array.isArray(nextActionsValue)) {
    problems.push(
      "Groth16 attestation handoff readiness.nextActions must be an array.",
    );
  }
  if (!readyToFinalize && nextActions.length === 0) {
    problems.push(
      "Groth16 attestation handoff readiness.nextActions must explain remaining work when not readyToFinalize.",
    );
  }

  const commands = isRecord(ownValue(json, "commands"))
    ? ownValue(json, "commands")
    : {};
  if (!isRecord(ownValue(json, "commands"))) {
    problems.push("Groth16 attestation handoff commands are required.");
  }
  for (const [key, pattern] of [
    ["verifyHandoff", /verify-handoff\s+--handoff/u],
    ["attestationStatus", /attestation-status\s+--request/u],
    ["signAttestation", /sign-attestation\s+--request/u],
    ["finalizeAttestations", /finalize-attestations\s+--request/u],
  ]) {
    const command = trim(ownValue(commands, key));
    if (!pattern.test(command)) {
      problems.push(
        `Groth16 attestation handoff commands.${key} must contain the expected ${key} command.`,
      );
    }
  }

  return {
    looksLikeGroth16AttestationHandoff,
    valid: problems.filter(Boolean).length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: requestedProfile?.key ?? requestedBscNetwork,
    chain: ownValue(json, "chain"),
    chainIdHex: ownValue(json, "chainIdHex"),
    networkIdHex:
      normalizeHex32(
        ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
      ) || null,
    circuitProfile: ownValue(json, "circuitProfile"),
    proofBackend: ownValue(json, "proofBackend"),
    verifierKeyHash,
    manifestPath,
    manifestSha256,
    manifestProductionReady,
    manifestProductionBlockerCount: Array.isArray(manifestProductionBlockers)
      ? productionBlockers.length
      : null,
    manifestProductionBlockers: productionBlockers,
    manifestProductionBlockerSummary: boundedProblemSummary(productionBlockers),
    packages: packageReferences,
    attestationRequestPath: packageReferences.attestationRequest.path,
    attestationRequestSha256: packageReferences.attestationRequest.sha256,
    handoffComplete,
    signingReady,
    readyToFinalize,
    requestValid,
    roleReadiness,
    allRolesReady,
    missingSignedRoles,
    handoffBlockers,
    attestationStatusProblemCount: attestationStatusProblems.length,
    attestationStatusProblemSummary: boundedProblemSummary(
      attestationStatusProblems,
    ),
    readinessProductionReady,
    readinessProductionBlockers,
    problemCount: Number.isSafeInteger(problemCount) ? problemCount : null,
    nextActions,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    problems: problems.filter(Boolean),
  };
};

const groth16ProofSelfTestArtifactHash = (artifacts, keys) =>
  groth16MaterialArtifactHash(artifacts, keys);

const groth16ProofSelfTestPublicSignalWords = (value) =>
  ownArrayValues(value).map((entry) => {
    if (typeof entry === "string" || typeof entry === "number") {
      return trim(entry);
    }
    if (isRecord(entry)) {
      return trim(ownValue(entry, "value"));
    }
    return "";
  });

const groth16ProofSelfTestReportMetadata = ({
  json,
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(json)) {
    return { looksLikeGroth16ProofSelfTestReport: false, problems: [] };
  }
  const schema = trim(ownValue(json, "schema"));
  const looksLikeGroth16ProofSelfTestReport =
    schema === BSC_GROTH16_PROOF_SELF_TEST_SCHEMA ||
    /groth16.*proof.*self.*test|proof.*self.*test.*groth16/iu.test(
      path.basename(filePath),
    );
  if (!looksLikeGroth16ProofSelfTestReport) {
    return { looksLikeGroth16ProofSelfTestReport: false, problems: [] };
  }
  const requestedBscNetwork = trim(
    ownValue(json, "bscNetwork") ??
      ownValue(json, "bsc_network") ??
      ownValue(json, "network"),
  );
  let requestedProfile = null;
  try {
    requestedProfile = requestedBscNetwork
      ? resolveBscNetworkProfile(requestedBscNetwork)
      : null;
  } catch (_error) {
    requestedProfile = null;
  }
  const validationProfile = requestedProfile ?? bscProfile;
  const selectedProfileMatch =
    !requestedProfile || requestedProfile.key === bscProfile.key;
  const problems = [];
  if (schema !== BSC_GROTH16_PROOF_SELF_TEST_SCHEMA) {
    problems.push(
      `Groth16 proof self-test report schema must be ${BSC_GROTH16_PROOF_SELF_TEST_SCHEMA}.`,
    );
  }
  if (ownValue(json, "routeId") !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push("Groth16 proof self-test report routeId is invalid.");
  }
  if (ownValue(json, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push("Groth16 proof self-test report assetKey is invalid.");
  }
  for (const [key, expected] of [
    ["bscNetwork", validationProfile.key],
    ["chain", validationProfile.chain],
    ["chainIdHex", validationProfile.chainIdHex],
    ["networkIdHex", validationProfile.networkIdHex],
  ]) {
    const value =
      key === "networkIdHex"
        ? normalizeHex32(
            ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
          )
        : trim(ownValue(json, key));
    if (value !== expected) {
      problems.push(
        `Groth16 proof self-test report ${key} must be ${expected}.`,
      );
    }
  }
  if (
    trim(ownValue(json, "circuitProfile")) !== BSC_FULL_SCCP_CIRCUIT_PROFILE
  ) {
    problems.push(
      `Groth16 proof self-test report circuitProfile must be ${BSC_FULL_SCCP_CIRCUIT_PROFILE}.`,
    );
  }
  if (trim(ownValue(json, "proofBackend")) !== BSC_EVM_GROTH16_BACKEND) {
    problems.push(
      `Groth16 proof self-test report proofBackend must be ${BSC_EVM_GROTH16_BACKEND}.`,
    );
  }
  if (trim(ownValue(json, "proofFamily")) !== SCCP_PROOF_FAMILY_STARK_FRI) {
    problems.push(
      `Groth16 proof self-test report proofFamily must be ${SCCP_PROOF_FAMILY_STARK_FRI}.`,
    );
  }
  const manifest = isRecord(ownValue(json, "manifest"))
    ? ownValue(json, "manifest")
    : {};
  const manifestPath = trim(ownValue(manifest, "path"));
  problems.push(
    ...groth16RelativeEvidencePathProblems(
      manifestPath,
      "Groth16 proof self-test report manifest.path",
    ),
  );
  const manifestSha256 = normalizeHex32(ownValue(manifest, "sha256"));
  if (!manifestSha256) {
    problems.push(
      "Groth16 proof self-test report manifest.sha256 is missing or invalid.",
    );
  }
  if (ownValue(manifest, "productionReady") !== true) {
    problems.push(
      "Groth16 proof self-test report manifest.productionReady must be true.",
    );
  }
  const productionBlockers = ownValue(manifest, "productionBlockers");
  const productionBlockerValues = Array.isArray(productionBlockers)
    ? ownArrayValues(productionBlockers).map((entry) => trim(entry))
    : [];
  const productionBlockerCount = Array.isArray(productionBlockers)
    ? productionBlockerValues.length
    : null;
  if (!Array.isArray(productionBlockers)) {
    problems.push(
      "Groth16 proof self-test report manifest.productionBlockers must be an array.",
    );
  } else if (productionBlockerCount > 0) {
    const blockerSummary = boundedProblemSummary(productionBlockerValues);
    problems.push(
      `Groth16 proof self-test report manifest.productionBlockers must be empty: ${blockerSummary}.`,
    );
  }
  const artifacts = isRecord(ownValue(json, "artifacts"))
    ? ownValue(json, "artifacts")
    : {};
  const proofArtifactHash = groth16ProofSelfTestArtifactHash(artifacts, [
    "r1cs",
  ]);
  const provingKeyHash = groth16ProofSelfTestArtifactHash(artifacts, [
    "provingKey",
    "proving_key",
  ]);
  const bscVerifierKeyArtifactHash = groth16ProofSelfTestArtifactHash(
    artifacts,
    ["bscVerifierKey", "bsc_verifier_key"],
  );
  const snarkjsVerificationKeyHash = groth16ProofSelfTestArtifactHash(
    artifacts,
    ["snarkjsVerificationKey", "snarkjs_verification_key"],
  );
  const witnessWasmHash = groth16ProofSelfTestArtifactHash(artifacts, [
    "witnessWasm",
    "witness_wasm",
  ]);
  for (const [label, value] of [
    ["R1CS", proofArtifactHash],
    ["proving key", provingKeyHash],
    ["BSC verifier key", bscVerifierKeyArtifactHash],
    ["SnarkJS verification key", snarkjsVerificationKeyHash],
    ["witness WASM", witnessWasmHash],
  ]) {
    if (!value) {
      problems.push(
        `Groth16 proof self-test report ${label} sha256 is missing or invalid.`,
      );
    }
  }
  const sample = isRecord(ownValue(json, "sample"))
    ? ownValue(json, "sample")
    : {};
  const publicSignalNames = ownArrayValues(
    ownValue(sample, "publicSignalNames"),
  );
  if (
    publicSignalNames.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length ||
    publicSignalNames.some(
      (value, index) => value !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES[index],
    )
  ) {
    problems.push(
      "Groth16 proof self-test report sample.publicSignalNames must match BSC Groth16 public signals.",
    );
  }
  const samplePublicSignals = groth16ProofSelfTestPublicSignalWords(
    ownValue(sample, "publicSignalWords"),
  );
  const publicSignals = groth16ProofSelfTestPublicSignalWords(
    ownValue(json, "publicSignals"),
  );
  for (const [label, values] of [
    ["sample.publicSignalWords", samplePublicSignals],
    ["publicSignals", publicSignals],
  ]) {
    if (
      values.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length ||
      values.some((value) => !DECIMAL_WORD.test(value))
    ) {
      problems.push(
        `Groth16 proof self-test report ${label} must contain 9 decimal words.`,
      );
    }
  }
  if (
    samplePublicSignals.length === BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length &&
    publicSignals.length === BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length &&
    samplePublicSignals.some((value, index) => value !== publicSignals[index])
  ) {
    problems.push(
      "Groth16 proof self-test report publicSignals must match sample.publicSignalWords.",
    );
  }
  const snarkjs = isRecord(ownValue(json, "snarkjs"))
    ? ownValue(json, "snarkjs")
    : {};
  for (const key of ["wtnsCalculate", "groth16Prove", "groth16Verify"]) {
    if (ownValue(snarkjs, key) !== true) {
      problems.push(
        `Groth16 proof self-test report snarkjs.${key} must be true.`,
      );
    }
  }
  const witnessHash = normalizeHex32(ownValue(json, "witnessHash"));
  const proofHash = normalizeHex32(ownValue(json, "proofHash"));
  const publicSignalsHash = normalizeHex32(ownValue(json, "publicSignalsHash"));
  for (const [label, value] of [
    ["witnessHash", witnessHash],
    ["proofHash", proofHash],
    ["publicSignalsHash", publicSignalsHash],
  ]) {
    if (!value) {
      problems.push(
        `Groth16 proof self-test report ${label} is missing or invalid.`,
      );
    }
  }
  if (!isRecord(ownValue(json, "proof"))) {
    problems.push("Groth16 proof self-test report proof object is required.");
  }
  problems.push(
    ...roleSeparatedProductionHashProblems(
      {
        proofArtifactHash,
        provingKeyHash,
        witnessHash,
        proofHash,
        publicSignalsHash,
      },
      "BSC Groth16 proof self-test report",
      [
        "proofArtifactHash",
        "provingKeyHash",
        "witnessHash",
        "proofHash",
        "publicSignalsHash",
      ],
    ),
  );
  return {
    looksLikeGroth16ProofSelfTestReport,
    valid: problems.filter(Boolean).length === 0,
    schema,
    routeId: ownValue(json, "routeId"),
    assetKey: ownValue(json, "assetKey"),
    bscNetwork: requestedProfile?.key ?? requestedBscNetwork,
    chain: ownValue(json, "chain"),
    chainIdHex: ownValue(json, "chainIdHex"),
    networkIdHex:
      normalizeHex32(
        ownValue(json, "networkIdHex") ?? ownValue(json, "network_id_hex"),
      ) || null,
    circuitProfile: ownValue(json, "circuitProfile"),
    proofBackend: ownValue(json, "proofBackend"),
    proofFamily: ownValue(json, "proofFamily"),
    manifestPath,
    manifestSha256,
    manifestProductionReady: ownValue(manifest, "productionReady") === true,
    manifestProductionBlockerCount: productionBlockerCount,
    manifestProductionBlockers: productionBlockerValues,
    manifestProductionBlockerSummary: boundedProblemSummary(
      productionBlockerValues,
    ),
    proofArtifactHash,
    provingKeyHash,
    bscVerifierKeyArtifactHash,
    snarkjsVerificationKeyHash,
    witnessWasmHash,
    witnessHash,
    proofHash,
    publicSignalsHash,
    publicSignalNames,
    selectedProfileMatch,
    validationProfile: validationProfile.key,
    problems: problems.filter(Boolean),
  };
};

const verifierMetadata = ({
  filePath,
  text,
  json,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (
    isRecord(json) &&
    (trim(ownValue(json, "schema")) === NATIVE_EVM_PROVER_BUNDLE_SCHEMA ||
      trim(ownValue(json, "schema")) === BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA ||
      trim(ownValue(json, "schema")) ===
        BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA ||
      trim(ownValue(json, "schema")) ===
        BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA ||
      trim(ownValue(json, "schema")) === BSC_GROTH16_PROOF_SELF_TEST_SCHEMA ||
      BSC_GROTH16_ATTESTATION_SCHEMAS.has(trim(ownValue(json, "schema"))) ||
      BSC_GROTH16_TRANSCRIPT_SCHEMAS.has(trim(ownValue(json, "schema"))) ||
      BSC_NATIVE_EVM_PROVER_SUPPORT_SCHEMAS.has(trim(ownValue(json, "schema"))))
  ) {
    return { looksLikeVerifier: false };
  }
  const verifierFileByName = isVerifierKeyLikePath(filePath);
  const looksLikeVerifier =
    verifierFileByName ||
    readNestedString(json, ["verifierKeyHash", "verifier_key_hash", "vkHash"]);
  if (!looksLikeVerifier) {
    return { looksLikeVerifier: false };
  }
  const problems = [];
  const verifierKeyHashResult = readConsistentMaterialString({
    json,
    text,
    keys: ["verifierKeyHash", "verifier_key_hash", "vkHash", "hash"],
    label: "verifierKeyHash",
    normalizeValue: normalizeHex32,
  });
  const networkResult = readConsistentMaterialString({
    json,
    text,
    keys: ["network", "bscNetwork", "bsc_network", "chain"],
    label: "network",
    normalizeValue: normalizeBscNetworkLabel,
  });
  const chainIdHexResult = readConsistentMaterialString({
    json,
    text,
    keys: ["chainIdHex", "chain_id_hex", "bscChainIdHex"],
    label: "chainIdHex",
    normalizeValue: (value) => value.trim().toLowerCase(),
  });
  const networkIdHexResult = readConsistentMaterialString({
    json,
    text,
    keys: [
      "networkId",
      "network_id",
      "networkIdHex",
      "network_id_hex",
      "bscNetworkIdHex",
      "bsc_network_id_hex",
    ],
    label: "networkIdHex",
    normalizeValue: normalizeHex32,
  });
  const sourceDomainResult = readConsistentMaterialInteger({
    json,
    text,
    keys: ["sourceDomain", "source_domain"],
    label: "sourceDomain",
  });
  const targetDomainResult = readConsistentMaterialInteger({
    json,
    text,
    keys: ["targetDomain", "target_domain"],
    label: "targetDomain",
  });
  for (const result of [
    verifierKeyHashResult,
    networkResult,
    chainIdHexResult,
    networkIdHexResult,
    sourceDomainResult,
    targetDomainResult,
  ]) {
    problems.push(...result.conflicts);
  }
  const verifierKeyHash = verifierKeyHashResult.value;
  const network = networkResult.value;
  const chainIdHex = chainIdHexResult.value;
  const networkIdHex = networkIdHexResult.value;
  const sourceDomain = sourceDomainResult.value;
  const targetDomain = targetDomainResult.value;
  const bscNetworkBound =
    networkIdHex === bscProfile.networkIdHex ||
    chainIdHex === bscProfile.chainIdHex ||
    trim(network).toLowerCase() === bscProfile.chain;
  const bscRouteDomainBound = sourceDomain === 0 && targetDomain === 2;
  const fixtureShaped = smokeFixtureGroth16VerifierKey(json);
  const g1MaterialProblems = verifierG1MaterialProblems(json, {
    requireMaterial: verifierFileByName,
  });
  const g2MaterialProblems = verifierG2MaterialProblems(json, {
    requireMaterial: verifierFileByName,
  });
  return {
    looksLikeVerifier,
    verifierKeyHash,
    network,
    chainIdHex: chainIdHex || null,
    networkIdHex,
    sourceDomain,
    targetDomain,
    requiresVerifierBinding: verifierFileByName,
    bscNetworkBound,
    bscRouteDomainBound,
    fixtureShaped,
    g1MaterialProblems,
    g2MaterialProblems,
    problems,
  };
};

const nativeProverBundleMetadata = ({
  json,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  if (!isRecord(json)) {
    return {
      metadata: { looksLikeNativeProverBundle: false },
      descriptor: null,
    };
  }
  const schema = trim(ownValue(json, "schema"));
  const bundleId = trim(
    ownValue(json, "bundle_id") ?? ownValue(json, "bundleId"),
  );
  const looksLikeNativeProverBundle =
    schema === NATIVE_EVM_PROVER_BUNDLE_SCHEMA ||
    /native-evm-groth16-prover/iu.test(bundleId);
  if (!looksLikeNativeProverBundle) {
    return {
      metadata: { looksLikeNativeProverBundle: false },
      descriptor: null,
    };
  }
  const rawRoleSeparatedHashProblems = () =>
    roleSeparatedProductionHashProblems(
      {
        verifierKeyHash:
          ownValue(json, "verifierKeyHash") ??
          ownValue(json, "verifier_key_hash"),
        verifierKeyArtifactHash:
          ownValue(json, "verifierKeyArtifactHash") ??
          ownValue(json, "verifier_key_artifact_hash"),
        destinationBindingHash:
          ownValue(json, "destinationBindingHash") ??
          ownValue(json, "destination_binding_hash"),
        proofArtifactHash:
          ownValue(json, "proofArtifactHash") ??
          ownValue(json, "proof_artifact_hash"),
        provingKeyHash:
          ownValue(json, "provingKeyHash") ??
          ownValue(json, "proving_key_hash"),
        groth16ProofSelfTestHash:
          ownValue(json, "groth16ProofSelfTestHash") ??
          ownValue(json, "groth16_proof_self_test_hash"),
        nativeEvmProverBundleHash:
          ownValue(json, "nativeEvmProverBundleHash") ??
          ownValue(json, "native_evm_prover_bundle_hash"),
      },
      "BSC native EVM prover bundle",
      NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS,
    );
  try {
    const validateBundle =
      bscProfile.key === "mainnet"
        ? validateBscMainnetNativeEvmProverBundle
        : validateBscTestnetNativeEvmProverBundle;
    const bundle = validateBundle(json);
    const nativeEvmProverBundleHash =
      canonicalBscNativeEvmProverBundleHash(bundle);
    const auditHashProblems = nativeProverAuditHashShapeProblems(
      bundle.auditHashes,
    );
    const declaresVerifierKeyArtifactHash =
      typeof ownValue(json, "verifierKeyArtifactHash") === "string" ||
      typeof ownValue(json, "verifier_key_artifact_hash") === "string";
    const problems = [...auditHashProblems];
    if (
      hasOwn(json, "crossSdkFixtureParityArtifact") ||
      hasOwn(json, "cross_sdk_fixture_parity_artifact")
    ) {
      problems.push(
        "nativeProverBundle must use crossSdkParityArtifact/cross_sdk_parity_artifact; legacy crossSdkFixtureParityArtifact/cross_sdk_fixture_parity_artifact is not valid for BSC production native EVM prover artifacts",
      );
    }
    const auditHashesInput = isRecord(ownValue(json, "audit_hashes"))
      ? ownValue(json, "audit_hashes")
      : isRecord(ownValue(json, "auditHashes"))
        ? ownValue(json, "auditHashes")
        : null;
    if (
      auditHashesInput &&
      hasOwn(auditHashesInput, "cross_sdk_fixture_parity")
    ) {
      problems.push(
        "auditHashes must use cross_sdk_parity; legacy cross_sdk_fixture_parity is not valid for BSC production native EVM prover artifacts",
      );
    }
    if (!declaresVerifierKeyArtifactHash) {
      problems.push("verifierKeyArtifactHash is missing");
    }
    problems.push(
      ...roleSeparatedProductionHashProblems(
        {
          verifierKeyHash: bundle.verifierKeyHash,
          verifierKeyArtifactHash: bundle.verifierKeyArtifactHash,
          destinationBindingHash: bundle.destinationBindingHash,
          proofArtifactHash: bundle.proofArtifactHash,
          provingKeyHash: bundle.provingKeyHash,
          nativeEvmProverBundleHash,
        },
        "BSC native EVM prover bundle",
        NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS,
      ),
    );
    return {
      metadata: {
        looksLikeNativeProverBundle: true,
        valid: true,
        bundleId: bundle.bundleId,
        chain: bundle.chain,
        domain: bundle.domain,
        nativeEvmProverBundleHash,
        verifierKeyHash: bundle.verifierKeyHash,
        verifierKeyArtifactHash: bundle.verifierKeyArtifactHash,
        proofArtifactHash: bundle.proofArtifactHash,
        provingKeyHash: bundle.provingKeyHash,
        groth16ProofSelfTestHash: bundle.groth16ProofSelfTestHash,
        destinationBindingHash: bundle.destinationBindingHash,
        proofArtifact: bundle.proofArtifact,
        provingKey: bundle.provingKey,
        verifierKey: bundle.verifierKey,
        nativeSdkArtifacts: bundle.nativeSdkArtifacts.length,
        auditHashesProduction: auditHashProblems.length === 0,
        auditHashIssueCount: auditHashProblems.length,
        artifactsVerified: false,
        verifiedSdks: [],
        problems,
      },
      descriptor: bundle,
    };
  } catch (error) {
    const auditHashesInput = isRecord(ownValue(json, "audit_hashes"))
      ? ownValue(json, "audit_hashes")
      : isRecord(ownValue(json, "auditHashes"))
        ? ownValue(json, "auditHashes")
        : null;
    const auditHashProblems = auditHashesInput
      ? nativeProverAuditHashShapeProblems(auditHashesInput)
      : [];
    return {
      metadata: {
        looksLikeNativeProverBundle: true,
        valid: false,
        bundleId: bundleId || null,
        auditHashesProduction: auditHashesInput
          ? auditHashProblems.length === 0
          : null,
        auditHashIssueCount: auditHashProblems.length,
        artifactsVerified: false,
        verifiedSdks: [],
        problems: [
          error instanceof Error ? error.message : String(error),
          ...rawRoleSeparatedHashProblems(),
        ],
      },
      descriptor: null,
    };
  }
};

const classifyProofFile = (filePath, sizeBytes) => {
  const name = path.basename(filePath).toLowerCase();
  const isProvingKey =
    PROVING_KEY_FILE_PATTERN.test(name) || /proving[-_]?key/iu.test(name);
  const isProofArtifact =
    PROOF_ARTIFACT_FILE_PATTERN.test(name) ||
    /(?:proof|circuit)[-_]?(?:artifact|wasm|r1cs)/iu.test(name);
  return {
    isProvingKey,
    isProofArtifact,
    productionSized: sizeBytes >= MIN_PRODUCTION_PROOF_FILE_BYTES,
    productionMaxSized: sizeBytes <= SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
    maxSizeBytes: SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
    productionEntropy: null,
    uniqueByteCount: null,
    dominantByte: null,
    dominantByteCount: null,
    dominantByteFraction: null,
    repeatedPatternLength: null,
    arithmeticSequenceDelta: null,
    productionFormat: null,
    format: null,
    formatVersion: null,
    formatSectionCount: null,
    formatProblem: null,
  };
};

const repeatedPrefixPatternLength = (
  bytes,
  maxPatternLength = MAX_PRODUCTION_PROOF_FILE_REPEATED_PATTERN_BYTES,
) => {
  const maxLength = Math.min(maxPatternLength, Math.floor(bytes.length / 2));
  for (let length = 1; length <= maxLength; length += 1) {
    let repeated = true;
    for (let index = length; index < bytes.length; index += 1) {
      if (bytes[index] !== bytes[index % length]) {
        repeated = false;
        break;
      }
    }
    if (repeated) {
      return length;
    }
  }
  return 0;
};

const constantByteDelta = (bytes) => {
  if (bytes.byteLength < 16) {
    return null;
  }
  const delta = (bytes[1] - bytes[0] + 256) & 0xff;
  for (let index = 2; index < bytes.byteLength; index += 1) {
    if (((bytes[index] - bytes[index - 1] + 256) & 0xff) !== delta) {
      return null;
    }
  }
  return delta;
};

const dominantByteProfile = (bytes) => {
  if (bytes.byteLength === 0) {
    return {
      dominantByte: null,
      dominantByteCount: 0,
      dominantByteFraction: null,
    };
  }
  const counts = new Uint32Array(256);
  let dominantByte = 0;
  let dominantByteCount = 0;
  for (const byte of bytes) {
    counts[byte] += 1;
    if (counts[byte] > dominantByteCount) {
      dominantByte = byte;
      dominantByteCount = counts[byte];
    }
  }
  return {
    dominantByte,
    dominantByteCount,
    dominantByteFraction: dominantByteCount / bytes.byteLength,
  };
};

const nativeProverAuditHashShapeProblems = (auditHashes) => {
  if (!isRecord(auditHashes)) {
    return ["audit hash map is missing"];
  }
  const problems = [];
  for (const key of NATIVE_EVM_PROVER_AUDIT_HASH_FIELDS) {
    const normalized = normalizeHex32(ownValue(auditHashes, key));
    if (!normalized) {
      problems.push(`${key} is missing, malformed, or zero`);
      continue;
    }
    const bytes = Buffer.from(normalized.slice(2), "hex");
    const repeatedPatternLength = repeatedPrefixPatternLength(bytes, 16);
    if (repeatedPatternLength > 0) {
      problems.push(
        `${key} uses a repeated ${repeatedPatternLength}-byte pattern`,
      );
      continue;
    }
    const arithmeticDelta = constantByteDelta(bytes);
    if (arithmeticDelta !== null) {
      problems.push(`${key} uses an arithmetic byte sequence`);
    }
  }
  return problems;
};

const bytePrefixMatches = (bytes, prefix) =>
  prefix.every((byte, index) => bytes[index] === byte);

const u32le = (bytes, offset) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0;

const u64leSafe = (bytes, offset) => {
  const low = u32le(bytes, offset);
  const high = u32le(bytes, offset + 4);
  const value = high * 0x100000000 + low;
  return Number.isSafeInteger(value) ? value : null;
};

const R1CS_REQUIRED_SECTION_IDS = Object.freeze([1, 2, 3]);
const ZKEY_REQUIRED_SECTION_IDS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

const snarkjsBinaryFormatProfile = (
  bytes,
  magic,
  format,
  requiredSectionIds,
) => {
  if (bytes.byteLength < 12) {
    return {
      productionFormat: false,
      format,
      formatVersion: null,
      formatSectionCount: null,
      formatProblem: `${format} header is truncated`,
    };
  }
  if (!bytePrefixMatches(bytes, magic)) {
    return {
      productionFormat: false,
      format,
      formatVersion: null,
      formatSectionCount: null,
      formatProblem: `${format} magic bytes are missing`,
    };
  }
  const formatVersion = u32le(bytes, 4);
  const formatSectionCount = u32le(bytes, 8);
  if (formatVersion < 1 || formatVersion > 2) {
    return {
      productionFormat: false,
      format,
      formatVersion,
      formatSectionCount,
      formatProblem: `${format} header version is invalid`,
    };
  }
  if (formatSectionCount < 1 || formatSectionCount > 128) {
    return {
      productionFormat: false,
      format,
      formatVersion,
      formatSectionCount,
      formatProblem: `${format} section count is invalid`,
    };
  }
  let offset = 12;
  const sectionIds = new Set();
  const sectionIdList = [];
  for (let index = 0; index < formatSectionCount; index += 1) {
    if (offset + 12 > bytes.byteLength) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} section table is truncated`,
      };
    }
    const sectionId = u32le(bytes, offset);
    const sectionSize = u64leSafe(bytes, offset + 4);
    offset += 12;
    if (sectionId === 0) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} section id must be non-zero`,
      };
    }
    if (sectionIds.has(sectionId)) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} section ids must be unique`,
      };
    }
    sectionIds.add(sectionId);
    sectionIdList.push(sectionId);
    if (sectionSize === null || sectionSize <= 0) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} section size is invalid`,
      };
    }
    if (sectionSize > bytes.byteLength - offset) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} section exceeds file size`,
      };
    }
    offset += sectionSize;
  }
  const productionFormat = offset === bytes.byteLength;
  if (productionFormat) {
    const missingSectionIds = requiredSectionIds.filter(
      (sectionId) => !sectionIds.has(sectionId),
    );
    if (missingSectionIds.length > 0) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} missing required section ids: ${missingSectionIds.join(", ")}`,
      };
    }
    const unexpectedSectionIds = [...sectionIds].filter(
      (sectionId) => !requiredSectionIds.includes(sectionId),
    );
    if (unexpectedSectionIds.length > 0) {
      return {
        productionFormat: false,
        format,
        formatVersion,
        formatSectionCount,
        formatProblem: `${format} contains unsupported section ids: ${unexpectedSectionIds.join(", ")}`,
      };
    }
  }
  return {
    productionFormat,
    format,
    formatVersion,
    formatSectionCount,
    formatProblem: productionFormat
      ? null
      : `${format} section table does not consume the full file`,
  };
};

const proofFileFormatProfile = (filePath, bytes, proofFile) => {
  const extension = path.extname(filePath).toLowerCase();
  if (proofFile.isProvingKey) {
    if (extension !== ".zkey") {
      return {
        productionFormat: false,
        format: extension.replace(/^\./u, "") || "unknown",
        formatVersion: null,
        formatSectionCount: null,
        formatProblem: "proving key must be a .zkey artifact",
      };
    }
    return snarkjsBinaryFormatProfile(
      bytes,
      [0x7a, 0x6b, 0x65, 0x79],
      "zkey",
      ZKEY_REQUIRED_SECTION_IDS,
    );
  }
  if (proofFile.isProofArtifact) {
    if (extension === ".r1cs") {
      return snarkjsBinaryFormatProfile(
        bytes,
        [0x72, 0x31, 0x63, 0x73],
        "r1cs",
        R1CS_REQUIRED_SECTION_IDS,
      );
    }
    return {
      productionFormat: false,
      format: extension.replace(/^\./u, "") || "unknown",
      formatVersion: null,
      formatSectionCount: null,
      formatProblem: "proof artifact must be a .r1cs artifact",
    };
  }
  return {
    productionFormat: null,
    format: null,
    formatVersion: null,
    formatSectionCount: null,
    formatProblem: null,
  };
};

const proofFileByteProfile = (filePath, bytes, proofFile) => {
  const uniqueByteCount = new Set(bytes).size;
  const dominantProfile = dominantByteProfile(bytes);
  const repeatedPatternLength = repeatedPrefixPatternLength(bytes);
  const arithmeticSequenceDelta = constantByteDelta(bytes);
  const formatProfile = proofFileFormatProfile(filePath, bytes, proofFile);
  return {
    uniqueByteCount,
    ...dominantProfile,
    repeatedPatternLength,
    arithmeticSequenceDelta,
    ...formatProfile,
    productionEntropy:
      uniqueByteCount >= MIN_PRODUCTION_PROOF_FILE_UNIQUE_BYTES &&
      dominantProfile.dominantByteFraction !== null &&
      dominantProfile.dominantByteFraction <=
        MAX_PRODUCTION_PROOF_FILE_DOMINANT_BYTE_FRACTION &&
      repeatedPatternLength === 0 &&
      arithmeticSequenceDelta === null,
  };
};

const resolveLocalModulePath = (moduleUrl) => {
  const normalized = normalizeSccpBrowserModuleUrl(
    moduleUrl,
    "BSC prover module URL",
  );
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("/")) {
    const allowedRoot = path.join(repoRoot, "public");
    return {
      allowedRoot,
      normalized,
      filePath: path.join(allowedRoot, normalized.replace(/^\/+/u, "")),
      scopeLabel: "public/",
    };
  }
  if (normalized.startsWith("./")) {
    return {
      allowedRoot: repoRoot,
      normalized,
      filePath: path.resolve(repoRoot, normalized),
      scopeLabel: "package root",
    };
  }
  return { normalized, filePath: null };
};

const resolveLocalBrowserUrlPath = (normalized) => {
  if (normalized.startsWith("/")) {
    const allowedRoot = path.join(repoRoot, "public");
    return {
      allowedRoot,
      filePath: path.join(allowedRoot, normalized.replace(/^\/+/u, "")),
      scopeLabel: "public/",
    };
  }
  if (normalized.startsWith("./")) {
    return {
      allowedRoot: repoRoot,
      filePath: path.resolve(repoRoot, normalized),
      scopeLabel: "package root",
    };
  }
  return null;
};

const resolveSafeLocalFilePath = async ({
  filePath,
  allowedRoot,
  label,
  normalized,
  scopeLabel,
  missingMessage,
}) => {
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        missingMessage || `${label} ${normalized} does not exist.`,
      );
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`${label} ${normalized} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} ${normalized} must be a regular file.`);
  }
  const [realRoot, realFile] = await Promise.all([
    realpath(allowedRoot),
    realpath(filePath),
  ]);
  if (!isPathInside(realRoot, realFile)) {
    throw new Error(`${label} ${normalized} resolves outside ${scopeLabel}.`);
  }
  return realFile;
};

const responseContentLength = (response) => {
  const raw = response.headers?.get?.("content-length") ?? "";
  if (!/^\d+$/u.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const readRemoteResponseBytesBounded = async (response, label, maxBytes) => {
  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`content-length ${contentLength} exceeds ${maxBytes}`);
  }

  const body = response.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk =
          value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`${label} response exceeds ${maxBytes} bytes`);
        }
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
  }

  if (typeof response.arrayBuffer === "function") {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} response exceeds ${maxBytes} bytes`);
    }
    return bytes;
  }

  const text = await response.text();
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${label} response exceeds ${maxBytes} bytes`);
  }
  return bytes;
};

const readBrowserUrlBytes = async ({
  url,
  label,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  maxBytes = SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES,
}) => {
  const normalized = normalizeSccpBrowserModuleUrl(url, label);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  const localPath = resolveLocalBrowserUrlPath(normalized);
  if (localPath) {
    const safePath = await resolveSafeLocalFilePath({
      ...localPath,
      label,
      normalized,
    });
    const info = await lstat(safePath);
    if (info.size > maxBytes) {
      throw new Error(`${label} ${normalized} is too large.`);
    }
    const bytes = await readFile(safePath);
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} ${normalized} is too large.`);
    }
    return { normalized, localPath: safePath, bytes };
  }

  if (typeof fetchImpl !== "function") {
    throw new Error(`${label} ${normalized} cannot be fetched.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(normalized, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = await readRemoteResponseBytesBounded(
      response,
      `${label} ${normalized}`,
      maxBytes,
    );
    return { normalized, localPath: null, bytes };
  } catch (error) {
    throw new Error(
      `${label} ${normalized} could not be fetched: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
};

const parseJsonFile = async (
  filePath,
  { maxBytes = SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES, label = "manifest" } = {},
) => {
  const info = await stat(filePath);
  if (info.size > maxBytes) {
    throw new Error(
      `${label} ${publicPath(filePath)} is ${info.size} bytes; maximum allowed is ${maxBytes} bytes`,
    );
  }
  const text = await readFile(filePath, "utf8");
  const payload = parseJsonWithoutDuplicateKeys(
    text,
    `${label} ${publicPath(filePath)}`,
  );
  if (!isRecord(payload)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return payload;
};

const evaluateConfiguredBrowserProver = async ({
  direction,
  moduleUrl,
  sidecarPath,
  routeReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
}) => {
  const label =
    direction === "source"
      ? "BSC -> TAIRA source prover"
      : "TAIRA -> BSC destination prover";
  if (!trim(moduleUrl)) {
    return {
      ok: false,
      detail: `${label} module URL is not configured.`,
      module: null,
      sidecar: null,
    };
  }
  let resolved;
  try {
    resolved = resolveLocalModulePath(moduleUrl);
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      module: null,
      sidecar: null,
    };
  }
  if (!resolved?.filePath) {
    return {
      ok: false,
      detail: `${label} must use a package-relative or public-local module URL for production material inventory.`,
      module: { moduleUrl: resolved?.normalized ?? trim(moduleUrl) },
      sidecar: null,
    };
  }
  let modulePath;
  try {
    modulePath = await resolveSafeLocalFilePath({
      ...resolved,
      label: `${label} module`,
      missingMessage: `${label} module ${resolved.normalized} does not exist.`,
    });
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      module: {
        moduleUrl: resolved.normalized,
        path: publicPath(resolved.filePath),
      },
      sidecar: null,
    };
  }
  const moduleInfo = await stat(modulePath);
  if (moduleInfo.size > SCCP_BSC_BROWSER_MODULE_MAX_BYTES) {
    return {
      ok: false,
      detail: `${label} module is too large for the browser prover limit.`,
      module: {
        moduleUrl: resolved.normalized,
        path: publicPath(modulePath),
        sizeBytes: moduleInfo.size,
      },
      sidecar: null,
    };
  }
  const moduleBytes = await readFile(modulePath);
  const moduleShape = validateBscSccpBrowserProverModuleBytes(
    moduleBytes,
    label,
  );
  const moduleSha256 = sha256Bytes(moduleBytes);
  const module = {
    moduleUrl: resolved.normalized,
    path: publicPath(modulePath),
    sizeBytes: moduleBytes.byteLength,
    sha256: moduleSha256,
    ok: moduleShape.ok,
  };
  if (!moduleShape.ok) {
    return {
      ok: false,
      detail: moduleShape.detail,
      module,
      sidecar: null,
    };
  }

  const resolvedSidecar = path.resolve(
    sidecarPath || `${modulePath}.manifest.json`,
  );
  const sidecarRoot = sidecarPath ? repoRoot : path.dirname(modulePath);
  let safeSidecarPath;
  try {
    safeSidecarPath = await resolveSafeLocalFilePath({
      allowedRoot: sidecarRoot,
      filePath: resolvedSidecar,
      label: `${label} sidecar manifest`,
      missingMessage: `${label} sidecar manifest is missing.`,
      normalized: publicPath(resolvedSidecar),
      scopeLabel: sidecarPath ? "repository root" : "prover module directory",
    });
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      module,
      sidecar: { path: publicPath(resolvedSidecar), ok: false },
    };
  }
  let sidecarManifest;
  try {
    sidecarManifest = await parseJsonFile(safeSidecarPath, {
      label: `${label} sidecar manifest`,
    });
  } catch (error) {
    return {
      ok: false,
      detail: `${label} sidecar manifest could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }.`,
      module,
      sidecar: { path: publicPath(safeSidecarPath), ok: false },
    };
  }
  const sidecarBytes = await readFile(safeSidecarPath);
  const validation = validateBscSccpBrowserProverManifest({
    manifest: sidecarManifest,
    routeReport,
    moduleUrl: resolved.normalized,
    expectedDirection: direction,
    label,
    bscNetwork: bscProfile.key,
  });
  const declaredModuleSha256 = normalizeHex32(
    readNestedString(sidecarManifest, [
      "moduleSha256",
      "module_sha256",
      "sha256",
    ]),
  );
  const hashMatches = declaredModuleSha256 === moduleSha256;
  const sidecar = {
    path: publicPath(safeSidecarPath),
    sizeBytes: sidecarBytes.byteLength,
    sha256: sha256Bytes(sidecarBytes),
    moduleSha256: declaredModuleSha256,
    manifest: validation.manifest,
    ok: validation.ok && hashMatches,
  };
  if (!hashMatches) {
    return {
      ok: false,
      detail: `${label} sidecar moduleSha256 does not match module bytes.`,
      module,
      sidecar,
    };
  }
  if (validation.ok) {
    try {
      assertBscSccpBrowserProverModuleExports(
        moduleBytes,
        [validation.manifest?.acceptedExport].filter(Boolean),
        label,
      );
      assertBscSccpBrowserProverModuleExports(
        moduleBytes,
        [validation.manifest?.acceptedSelfTestExport].filter(Boolean),
        `${label} native self-test`,
      );
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        module: { ...module, ok: false },
        sidecar: { ...sidecar, ok: false },
      };
    }
  }
  return {
    ok: validation.ok,
    detail: validation.ok
      ? `${label} module and sidecar are production-shaped.`
      : validation.detail,
    module,
    sidecar,
  };
};

const publicRuntimeProverConfigManifest = (config) => {
  if (!isRecord(config)) {
    return null;
  }
  const publicDirection = (section) =>
    isRecord(section)
      ? {
          nativeProverBundleUrl: trim(section.nativeProverBundleUrl) || null,
          nativeProverArtifactBaseUrl:
            trim(section.nativeProverArtifactBaseUrl) || null,
          nativeProverBundleSha256:
            normalizeHex32(section.nativeProverBundleSha256) || null,
          nativeEvmProverBundleHash:
            normalizeHex32(section.nativeEvmProverBundleHash) || null,
          nativeProverVerifiedSdks: Array.isArray(
            section.nativeProverVerifiedSdks,
          )
            ? section.nativeProverVerifiedSdks
                .map((sdk) => trim(sdk))
                .filter(Boolean)
            : [],
          proofArtifactUrl: trim(section.proofArtifactUrl) || null,
          proofArtifactSha256:
            normalizeHex32(section.proofArtifactSha256) || null,
          provingKeyUrl: trim(section.provingKeyUrl) || null,
          provingKeySha256: normalizeHex32(section.provingKeySha256) || null,
          verifierKeyUrl: trim(section.verifierKeyUrl) || null,
          verifierKeySha256: normalizeHex32(section.verifierKeySha256) || null,
          backendModuleUrl: trim(section.backendModuleUrl) || null,
          backendModuleSha256:
            normalizeHex32(section.backendModuleSha256) || null,
          backendSelfContained: section.backendSelfContained === true,
          backendAcceptedExport: trim(section.backendAcceptedExport) || null,
          backendAcceptedSelfTestExport:
            trim(section.backendAcceptedSelfTestExport) || null,
        }
      : null;
  return {
    schema: trim(config.schema) || null,
    routeId: trim(config.routeId) || null,
    assetKey: trim(config.assetKey) || null,
    tairaChainId: trim(config.tairaChainId) || null,
    tairaNetworkPrefix:
      Number.isSafeInteger(config.tairaNetworkPrefix) ||
      typeof config.tairaNetworkPrefix === "number"
        ? config.tairaNetworkPrefix
        : null,
    bscNetwork: trim(config.bscNetwork) || null,
    bscChain: trim(config.bscChain) || null,
    bscChainIdHex: trim(config.bscChainIdHex) || null,
    bscNetworkIdHex: trim(config.bscNetworkIdHex) || null,
    destination: publicDirection(config.destination),
    source: publicDirection(config.source),
  };
};

const evaluateConfiguredRuntimeProverConfig = async ({
  runtimeProverConfigUrl,
  destinationModuleUrl,
  sourceModuleUrl,
  routeReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
  fetchImpl,
  timeoutMs,
}) => {
  const explicitConfigUrl = trim(runtimeProverConfigUrl);
  let derivedConfigUrl = null;
  try {
    derivedConfigUrl = deriveBscRuntimeProverConfigUrl(
      destinationModuleUrl,
      sourceModuleUrl,
    );
  } catch (error) {
    if (explicitConfigUrl) {
      derivedConfigUrl = null;
    } else {
      return {
        ok: false,
        required: false,
        configUrl: null,
        detail: error instanceof Error ? error.message : String(error),
        manifest: null,
      };
    }
  }
  const selectedConfigUrl = explicitConfigUrl || derivedConfigUrl;
  const required = Boolean(selectedConfigUrl);
  if (!required) {
    return {
      ok: true,
      required: false,
      configUrl: null,
      detail:
        "No runtime adapter config is required for the configured BSC prover modules.",
      manifest: null,
    };
  }

  try {
    const { normalized, localPath, bytes } = await readBrowserUrlBytes({
      url: selectedConfigUrl,
      label: "BSC runtime prover config",
      fetchImpl,
      timeoutMs,
      maxBytes: SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES,
    });
    let parsed;
    try {
      parsed = parseJsonWithoutDuplicateKeys(
        bytes.toString("utf8"),
        "BSC runtime prover config",
      );
    } catch (error) {
      throw new Error(
        `BSC runtime prover config is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const outputPath =
      localPath || path.join(repoRoot, "public/sccp-bsc/remote-runtime.json");
    const canonical = await validateBscSccpRuntimeProverConfig({
      config: parsed,
      routeReport,
      bscNetwork: bscProfile.key,
      outputPath,
      root: repoRoot,
      fetchImpl,
      timeoutMs,
    });
    return {
      ok: true,
      required: true,
      configUrl: normalized,
      path: localPath ? publicPath(localPath) : null,
      sizeBytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
      detail:
        "BSC runtime prover config and referenced material are production-shaped and route-bound.",
      manifest: publicRuntimeProverConfigManifest(canonical),
    };
  } catch (error) {
    let normalized = selectedConfigUrl;
    try {
      normalized =
        normalizeSccpBrowserModuleUrl(
          selectedConfigUrl,
          "BSC runtime prover config",
        ) || selectedConfigUrl;
    } catch (_normalizeError) {
      normalized = selectedConfigUrl;
    }
    return {
      ok: false,
      required: true,
      configUrl: normalized,
      detail: error instanceof Error ? error.message : String(error),
      manifest: null,
    };
  }
};

const BSC_BROWSER_PROVER_SIDECAR_SCHEMAS = new Set([
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
]);
const BSC_BROWSER_PROVER_EXPORTS = new Set([
  "bscSccpProve",
  "irohaSccpBscProve",
  "evmSccpProve",
  "proveBsc",
  "bscSccpSourceProve",
  "irohaSccpBscSourceProve",
  "proveBscSource",
]);
const BSC_BROWSER_PROVER_SELF_TEST_EXPORTS = new Set([
  "bscSccpNativeProverSelfTest",
  "irohaSccpBscNativeProverSelfTest",
  "evmSccpNativeProverSelfTest",
  "nativeProverSelfTest",
  "bscSccpSourceNativeProverSelfTest",
  "irohaSccpBscSourceNativeProverSelfTest",
  "nativeProverSourceSelfTest",
]);

const compiledContractBytecodeSha256 = (bytecode) =>
  sha256Bytes(Buffer.from(bytecode.slice(2), "hex"));
const compiledContractBytecodeKeccak256 = (bytecode) =>
  `0x${Buffer.from(
    keccak_256(new Uint8Array(Buffer.from(bytecode.slice(2), "hex"))),
  ).toString("hex")}`;

const compiledContractArtifactMetadata = ({ filePath, json }) => {
  const basename = path.basename(filePath, ".json");
  const expectedContractName = ownValue(
    BSC_COMPILED_CONTRACT_ARTIFACTS,
    basename,
  );
  const pathSegments = filePath.split(/[\\/]+/u);
  const generatedCompileOutput = pathSegments.some((segment) =>
    /compiled[-_]contract[-_]artifacts(?:\.json)?$/iu.test(segment),
  );
  const compiledShape =
    isRecord(json) &&
    trim(ownValue(json, "contractName")) === expectedContractName &&
    Array.isArray(ownValue(json, "abi")) &&
    Boolean(trim(ownValue(json, "bytecode"))) &&
    Boolean(trim(ownValue(json, "deployedBytecode")));
  const looksLikeCompiledContract =
    Boolean(expectedContractName) &&
    (pathSegments.includes("contracts") ||
      generatedCompileOutput ||
      compiledShape);
  if (!looksLikeCompiledContract) {
    return {
      looksLikeCompiledContract: false,
      problems: [],
    };
  }
  if (!isRecord(json)) {
    return {
      looksLikeCompiledContract: true,
      key: basename,
      valid: false,
      contractName: null,
      abiEntryCount: 0,
      bytecodeKeccak256: null,
      deployedBytecodeKeccak256: null,
      bytecodeSha256: null,
      deployedBytecodeSha256: null,
      problems: ["compiled contract artifact must be a JSON object"],
    };
  }

  const problems = [];
  const contractName = trim(ownValue(json, "contractName"));
  if (contractName !== expectedContractName) {
    problems.push(
      `compiled contract artifact ${basename} contractName must be ${expectedContractName}`,
    );
  }
  const abi = ownValue(json, "abi");
  if (!Array.isArray(abi) || abi.length === 0) {
    problems.push(`compiled contract artifact ${basename} abi is missing`);
  }
  const bytecode = trim(ownValue(json, "bytecode"));
  const deployedBytecode = trim(ownValue(json, "deployedBytecode"));
  for (const [label, value] of [
    ["bytecode", bytecode],
    ["deployedBytecode", deployedBytecode],
  ]) {
    if (!/^0x(?:[0-9a-f]{2})+$/u.test(value)) {
      problems.push(
        `compiled contract artifact ${basename} ${label} must be non-empty lowercase 0x byte hex`,
      );
    }
  }
  const bytecodeSha256 = normalizeHex32(ownValue(json, "bytecodeSha256"));
  const deployedBytecodeSha256 = normalizeHex32(
    ownValue(json, "deployedBytecodeSha256"),
  );
  const bytecodeKeccak256 = normalizeHex32(ownValue(json, "bytecodeKeccak256"));
  const deployedBytecodeKeccak256 = normalizeHex32(
    ownValue(json, "deployedBytecodeKeccak256"),
  );
  if (!bytecodeKeccak256) {
    problems.push(
      `compiled contract artifact ${basename} bytecodeKeccak256 is missing or invalid`,
    );
  } else if (
    /^0x(?:[0-9a-f]{2})+$/u.test(bytecode) &&
    compiledContractBytecodeKeccak256(bytecode) !== bytecodeKeccak256
  ) {
    problems.push(
      `compiled contract artifact ${basename} bytecodeKeccak256 does not match bytecode`,
    );
  }
  if (!deployedBytecodeKeccak256) {
    problems.push(
      `compiled contract artifact ${basename} deployedBytecodeKeccak256 is missing or invalid`,
    );
  } else if (
    /^0x(?:[0-9a-f]{2})+$/u.test(deployedBytecode) &&
    compiledContractBytecodeKeccak256(deployedBytecode) !==
      deployedBytecodeKeccak256
  ) {
    problems.push(
      `compiled contract artifact ${basename} deployedBytecodeKeccak256 does not match deployedBytecode`,
    );
  }
  if (!bytecodeSha256) {
    problems.push(
      `compiled contract artifact ${basename} bytecodeSha256 is missing or invalid`,
    );
  } else if (
    /^0x(?:[0-9a-f]{2})+$/u.test(bytecode) &&
    compiledContractBytecodeSha256(bytecode) !== bytecodeSha256
  ) {
    problems.push(
      `compiled contract artifact ${basename} bytecodeSha256 does not match bytecode`,
    );
  }
  if (!deployedBytecodeSha256) {
    problems.push(
      `compiled contract artifact ${basename} deployedBytecodeSha256 is missing or invalid`,
    );
  } else if (
    /^0x(?:[0-9a-f]{2})+$/u.test(deployedBytecode) &&
    compiledContractBytecodeSha256(deployedBytecode) !== deployedBytecodeSha256
  ) {
    problems.push(
      `compiled contract artifact ${basename} deployedBytecodeSha256 does not match deployedBytecode`,
    );
  }
  return {
    looksLikeCompiledContract: true,
    key: basename,
    valid: problems.length === 0,
    contractName,
    abiEntryCount: Array.isArray(abi) ? abi.length : 0,
    bytecodeKeccak256,
    deployedBytecodeKeccak256,
    bytecodeSha256,
    deployedBytecodeSha256,
    problems,
  };
};

const readTopLevelStringList = (record, key) => {
  const value = ownValue(record, key);
  if (!Array.isArray(value)) {
    return [];
  }
  return ownArrayValues(value).filter(
    (entry) => typeof entry === "string" && entry,
  );
};
const topLevelStringListProblems = (record, key, label) => {
  const value = ownValue(record, key);
  if (!Array.isArray(value)) {
    return [];
  }
  return ownArrayIndexedValues(value)
    .filter(([, entry]) => typeof entry !== "string" || !entry.trim())
    .map(([index]) => `${label}[${index}] must be a non-empty string`);
};

const browserProverSidecarMetadata = async ({ filePath, json, info }) => {
  const basename = path.basename(filePath);
  const schema = trim(ownValue(json, "schema"));
  const looksLikeBrowserProverSidecar =
    /\.m?js\.manifest\.json$/iu.test(basename) ||
    BSC_BROWSER_PROVER_SIDECAR_SCHEMAS.has(schema);
  if (!looksLikeBrowserProverSidecar) {
    return {
      looksLikeBrowserProverSidecar: false,
      problems: [],
    };
  }
  const problems = [];
  if (!isRecord(json)) {
    problems.push("browser prover sidecar must be a JSON object");
    return {
      looksLikeBrowserProverSidecar: true,
      schema: null,
      modulePath: reportPathForArtifact(
        filePath.replace(/\.manifest\.json$/iu, ""),
      ),
      moduleSha256: null,
      moduleSha256Actual: null,
      exports: [],
      problems,
    };
  }
  if (!BSC_BROWSER_PROVER_SIDECAR_SCHEMAS.has(schema)) {
    problems.push(
      `browser prover sidecar schema must be ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA} or ${LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA}`,
    );
  } else if (schema === LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA) {
    problems.push(
      `browser prover sidecar schema ${LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA} is local-only and must not be used as production prover evidence`,
    );
  }
  const moduleSha256Result = readConsistentMaterialString({
    json,
    text: "",
    keys: ["moduleSha256", "module_sha256", "sha256"],
    label: "browser prover sidecar moduleSha256",
    normalizeValue: normalizeHex32,
    rejectDuplicateAliases: true,
  });
  problems.push(...moduleSha256Result.conflicts);
  const moduleSha256 = moduleSha256Result.value || null;
  if (!moduleSha256) {
    problems.push("browser prover sidecar moduleSha256 is missing or invalid");
  }
  const exportNames = readTopLevelStringList(json, "exports");
  problems.push(
    ...topLevelStringListProblems(
      json,
      "exports",
      "browser prover sidecar exports",
    ),
  );
  if (!exportNames.some((name) => BSC_BROWSER_PROVER_EXPORTS.has(name))) {
    problems.push("browser prover sidecar exports no BSC prover function");
  }
  const proverExportNames = exportNames.filter((name) =>
    BSC_BROWSER_PROVER_EXPORTS.has(name),
  );
  if (
    !exportNames.some((name) => BSC_BROWSER_PROVER_SELF_TEST_EXPORTS.has(name))
  ) {
    problems.push(
      "browser prover sidecar exports no native prover self-test function",
    );
  }
  const selfTestExportNames = exportNames.filter((name) =>
    BSC_BROWSER_PROVER_SELF_TEST_EXPORTS.has(name),
  );
  if (info.size > SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES) {
    problems.push(
      `browser prover sidecar must be no larger than ${SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES} bytes`,
    );
  }
  const modulePath = filePath.replace(/\.manifest\.json$/iu, "");
  let moduleSha256Actual = null;
  try {
    const moduleInfo = await lstat(modulePath);
    if (!moduleInfo.isFile() || moduleInfo.isSymbolicLink()) {
      problems.push(
        "browser prover sidecar adjacent module must be a regular file",
      );
    } else if (moduleInfo.size > SCCP_BSC_BROWSER_MODULE_MAX_BYTES) {
      problems.push(
        `browser prover sidecar adjacent module must be no larger than ${SCCP_BSC_BROWSER_MODULE_MAX_BYTES} bytes`,
      );
    } else {
      const moduleBytes = await readFile(modulePath);
      moduleSha256Actual = sha256Bytes(moduleBytes);
      if (moduleSha256 && moduleSha256 !== moduleSha256Actual) {
        problems.push(
          `browser prover sidecar moduleSha256 ${moduleSha256} does not match adjacent module ${moduleSha256Actual}`,
        );
      }
      const moduleShape = validateBscSccpBrowserProverModuleBytes(
        moduleBytes,
        "BSC browser prover sidecar adjacent module",
      );
      if (!moduleShape.ok) {
        problems.push(moduleShape.detail);
      } else {
        try {
          assertBscSccpBrowserProverModuleExports(
            moduleBytes,
            proverExportNames,
            "BSC browser prover sidecar adjacent module",
          );
          assertBscSccpBrowserProverModuleExports(
            moduleBytes,
            selfTestExportNames,
            "BSC browser prover sidecar adjacent module native self-test",
          );
        } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  } catch (_error) {
    problems.push("browser prover sidecar adjacent module is missing");
  }
  return {
    looksLikeBrowserProverSidecar: true,
    schema,
    modulePath: reportPathForArtifact(modulePath),
    moduleSha256,
    moduleSha256Actual,
    exports: exportNames,
    problems,
  };
};

const scanOneFile = async (
  filePath,
  bscProfile = resolveBscNetworkProfile("testnet"),
) => {
  const info = await lstat(filePath);
  let proofFile = classifyProofFile(filePath, info.size);
  const isProofMaterialFile =
    proofFile.isProofArtifact || proofFile.isProvingKey;
  const oversizedScanFile =
    !isProofMaterialFile && info.size > SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES;
  const oversizedProofMaterial =
    isProofMaterialFile && !proofFile.productionMaxSized;
  const canReadScannedFile = info.isFile() && !oversizedScanFile;
  const text = canReadScannedFile
    ? await readTextIfSmall(filePath, info.size)
    : "";
  const { json, jsonProblem, jsonProblemId } = await readJsonIfSmall(
    filePath,
    text,
  );
  const sha256 =
    canReadScannedFile && !oversizedProofMaterial
      ? await hashFile(filePath)
      : null;
  const findings = [];
  if (!info.isFile()) {
    findings.push(
      finding(
        "critical",
        "non-regular-material-inventory-file",
        "Scanned BSC production material must be a regular file.",
      ),
    );
  }
  if (oversizedScanFile) {
    findings.push(
      finding(
        "critical",
        "oversized-material-inventory-file",
        `Scanned BSC production material files must be no larger than ${SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES} bytes.`,
      ),
    );
  }
  if (jsonProblem) {
    const jsonProblemMessage =
      jsonProblemId === "duplicate-json-object-key"
        ? `Scanned BSC production material JSON is ambiguous: ${jsonProblem}.`
        : jsonProblemId === "non-object-json-artifact"
          ? `Scanned BSC production material JSON has the wrong shape: ${jsonProblem}.`
          : `Scanned BSC production material JSON is malformed: ${jsonProblem}.`;
    findings.push(finding("critical", jsonProblemId, jsonProblemMessage));
  }
  if (SECRET_FILE_NAME_PATTERN.test(path.basename(filePath))) {
    findings.push(
      finding(
        "critical",
        "secret-like-file-name",
        "Secret-like material file names must not be present in production artifacts.",
      ),
    );
  }
  if (text && PRIVATE_KEY_PEM_PATTERN.test(text)) {
    findings.push(
      finding(
        "critical",
        "private-key-pem",
        "Private key PEM material was detected in a scanned artifact.",
      ),
    );
  }
  if (text && scanSecretLike(text)) {
    findings.push(
      finding(
        "critical",
        "secret-like-text",
        "Secret-like text was detected in a scanned artifact.",
      ),
    );
  }
  if (json && scanSecretLike(json)) {
    findings.push(
      finding(
        "critical",
        "secret-like-json",
        "Secret-like JSON keys or values were detected in a scanned artifact.",
      ),
    );
  }

  const browserProverSidecar = await browserProverSidecarMetadata({
    filePath,
    json,
    info,
  });
  if (browserProverSidecar.looksLikeBrowserProverSidecar) {
    for (const problem of browserProverSidecar.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-browser-prover-sidecar",
          `BSC browser prover sidecar is invalid: ${problem}.`,
        ),
      );
    }
  }

  const compiledContractArtifact = compiledContractArtifactMetadata({
    filePath,
    json,
  });
  if (compiledContractArtifact.looksLikeCompiledContract) {
    for (const problem of compiledContractArtifact.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-compiled-contract-artifact",
          `BSC compiled contract artifact is invalid: ${problem}.`,
        ),
      );
    }
  }

  const productionRequirements =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract
      ? { looksLikeProductionRequirements: false, problems: [] }
      : productionRequirementsMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (productionRequirements.looksLikeProductionRequirements) {
    const productionRequirementsSeverity =
      productionRequirements.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const productionRequirementsFindingId =
      productionRequirements.selectedProfileMatch === false
        ? "cross-profile-production-requirements-artifact"
        : "invalid-production-requirements-artifact";
    for (const problem of productionRequirements.problems ?? []) {
      findings.push(
        finding(
          productionRequirementsSeverity,
          productionRequirementsFindingId,
          `BSC production requirements artifact is invalid: ${problem}.`,
        ),
      );
    }
  }

  const sourceParityAttestation =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements
      ? { looksLikeSourceParityAttestation: false, problems: [] }
      : sourceParityAttestationMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (sourceParityAttestation.looksLikeSourceParityAttestation) {
    const sourceParitySeverity =
      sourceParityAttestation.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const sourceParityFindingId =
      sourceParityAttestation.selectedProfileMatch === false
        ? "cross-profile-source-parity-attestation"
        : "invalid-source-parity-attestation";
    for (const problem of sourceParityAttestation.problems ?? []) {
      findings.push(
        finding(
          sourceParitySeverity,
          sourceParityFindingId,
          `BSC source-parity attestation is invalid: ${problem}.`,
        ),
      );
    }
  }

  const groth16AttestationRequestPackage =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation
      ? { looksLikeGroth16AttestationRequestPackage: false, problems: [] }
      : groth16AttestationRequestPackageMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage
  ) {
    const requestSeverity =
      groth16AttestationRequestPackage.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const requestFindingId =
      groth16AttestationRequestPackage.selectedProfileMatch === false
        ? "cross-profile-groth16-attestation-request-package"
        : "invalid-groth16-attestation-request-package";
    for (const problem of groth16AttestationRequestPackage.problems ?? []) {
      findings.push(
        finding(
          requestSeverity,
          requestFindingId,
          `BSC Groth16 attestation request package is invalid: ${problem}.`,
        ),
      );
    }
  }

  const groth16AttestationHandoff =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage
      ? { looksLikeGroth16AttestationHandoff: false, problems: [] }
      : groth16AttestationHandoffMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (groth16AttestationHandoff.looksLikeGroth16AttestationHandoff) {
    const handoffSeverity =
      groth16AttestationHandoff.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const handoffFindingId =
      groth16AttestationHandoff.selectedProfileMatch === false
        ? "cross-profile-groth16-attestation-handoff"
        : "invalid-groth16-attestation-handoff";
    for (const problem of groth16AttestationHandoff.problems ?? []) {
      findings.push(
        finding(
          handoffSeverity,
          handoffFindingId,
          `BSC Groth16 attestation handoff is invalid: ${problem}.`,
        ),
      );
    }
  }

  const groth16MaterialManifest =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff
      ? { looksLikeGroth16MaterialManifest: false, problems: [] }
      : groth16MaterialManifestMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (groth16MaterialManifest.looksLikeGroth16MaterialManifest) {
    const manifestSeverity =
      groth16MaterialManifest.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const manifestFindingId =
      groth16MaterialManifest.selectedProfileMatch === false
        ? "cross-profile-groth16-material-manifest"
        : "invalid-groth16-material-manifest";
    for (const problem of groth16MaterialManifest.problems ?? []) {
      findings.push(
        finding(
          manifestSeverity,
          manifestFindingId,
          `BSC Groth16 material manifest is invalid: ${problem}.`,
        ),
      );
    }
    const materialPlaceholderPath = productionPlaceholderMaterialReason(
      json ?? text,
      "groth16MaterialManifest",
    );
    if (
      PRODUCTION_PLACEHOLDER_PATH_PATTERN.test(filePath) ||
      materialPlaceholderPath
    ) {
      findings.push(
        finding(
          "critical",
          "diagnostic-groth16-material-manifest",
          materialPlaceholderPath
            ? `BSC Groth16 material manifest carries diagnostic or placeholder material at ${materialPlaceholderPath}.`
            : "BSC Groth16 material manifest is marked diagnostic or placeholder.",
        ),
      );
    }
  }

  const groth16ProofSelfTestReport =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest
      ? { looksLikeGroth16ProofSelfTestReport: false, problems: [] }
      : groth16ProofSelfTestReportMetadata({
          json,
          filePath,
          bscProfile,
        });
  if (groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport) {
    const proofSelfTestSeverity =
      groth16ProofSelfTestReport.selectedProfileMatch === false
        ? "warning"
        : "critical";
    const proofSelfTestFindingId =
      groth16ProofSelfTestReport.selectedProfileMatch === false
        ? "cross-profile-groth16-proof-self-test-report"
        : "invalid-groth16-proof-self-test-report";
    for (const problem of groth16ProofSelfTestReport.problems ?? []) {
      findings.push(
        finding(
          proofSelfTestSeverity,
          proofSelfTestFindingId,
          `BSC Groth16 proof self-test report is invalid: ${problem}.`,
        ),
      );
    }
  }

  const offlineFullTomlEvidence =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest ||
    groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport
      ? { looksLikeOfflineFullTomlEvidence: false, problems: [] }
      : offlineFullTomlEvidenceMetadata({ json, bscProfile });
  if (offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence) {
    for (const problem of offlineFullTomlEvidence.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-offline-full-toml-evidence",
          `BSC offline full TOML evidence is invalid: ${problem}.`,
        ),
      );
    }
    for (const problem of await referencedOfflineFullTomlProblems({
      evidenceFilePath: filePath,
      offlineFullTomlEvidence,
    })) {
      findings.push(
        finding(
          "critical",
          "invalid-offline-full-toml-evidence",
          `BSC offline full TOML evidence is invalid: ${problem}.`,
        ),
      );
    }
  }

  const tairaBurnRecordContract =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest ||
    groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport ||
    offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence
      ? {
          looksLikeTairaBurnRecordContract: false,
          problems: [],
          artifactProductionProblems: [],
        }
      : tairaBurnRecordContractMetadata({ json, text });
  if (tairaBurnRecordContract.looksLikeTairaBurnRecordContract) {
    for (const problem of tairaBurnRecordContract.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-taira-burn-record-contract",
          `TAIRA burn-record contract material is invalid: ${problem}`,
        ),
      );
    }
    for (const problem of tairaBurnRecordContract.artifactProductionProblems ??
      []) {
      findings.push(
        finding(
          "critical",
          "invalid-taira-burn-record-contract",
          `TAIRA burn-record contract material is invalid: ${problem}`,
        ),
      );
    }
  }

  const deploymentEvidence =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest ||
    groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport ||
    offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence ||
    tairaBurnRecordContract.looksLikeTairaBurnRecordContract
      ? { looksLikeDeploymentEvidence: false }
      : deploymentEvidenceMetadata({ filePath, json, bscProfile });
  if (deploymentEvidence.looksLikeDeploymentEvidence) {
    for (const problem of deploymentEvidence.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-deployment-evidence",
          `BSC deployment evidence is invalid: ${problem}`,
        ),
      );
    }
    const deploymentPlaceholderMaterialPath =
      productionPlaceholderMaterialReason(json ?? text, "deploymentEvidence");
    if (
      PRODUCTION_PLACEHOLDER_PATH_PATTERN.test(filePath) ||
      deploymentPlaceholderMaterialPath
    ) {
      findings.push(
        finding(
          "critical",
          "diagnostic-deployment-evidence",
          deploymentPlaceholderMaterialPath
            ? `BSC deployment evidence carries diagnostic or placeholder material at ${deploymentPlaceholderMaterialPath}.`
            : "BSC deployment evidence carries diagnostic or placeholder material.",
        ),
      );
    }
  }

  const routeManifestUpsertIsi =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest ||
    groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport ||
    offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence ||
    tairaBurnRecordContract.looksLikeTairaBurnRecordContract ||
    deploymentEvidence.looksLikeDeploymentEvidence
      ? { looksLikeRouteManifestUpsertIsi: false, problems: [] }
      : routeManifestUpsertIsiMetadata({ json, bscProfile });
  if (routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi) {
    for (const problem of routeManifestUpsertIsi.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-route-manifest-isi",
          `BSC route manifest ISI publication artifact is invalid: ${problem}`,
        ),
      );
    }
  }

  const route =
    browserProverSidecar.looksLikeBrowserProverSidecar ||
    compiledContractArtifact.looksLikeCompiledContract ||
    productionRequirements.looksLikeProductionRequirements ||
    sourceParityAttestation.looksLikeSourceParityAttestation ||
    groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage ||
    groth16AttestationHandoff.looksLikeGroth16AttestationHandoff ||
    groth16MaterialManifest.looksLikeGroth16MaterialManifest ||
    groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport ||
    offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence ||
    tairaBurnRecordContract.looksLikeTairaBurnRecordContract ||
    deploymentEvidence.looksLikeDeploymentEvidence ||
    routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi
      ? { looksLikeRoute: false, problems: [] }
      : routeMetadata({ filePath, text, json, bscProfile });
  for (const problem of ownValue(route, "problems") ?? []) {
    findings.push(
      finding(
        "critical",
        "conflicting-route-material",
        `BSC route artifact contains conflicting material: ${problem}.`,
      ),
    );
  }
  if (
    ownValue(route, "looksLikeRoute") &&
    ownValue(route, "productionReady") === true
  ) {
    if (ownValue(route, "disabledReason")) {
      findings.push(
        finding(
          "critical",
          "production-ready-disabled-conflict",
          "A production-ready BSC route artifact also carries a disabled reason.",
        ),
      );
    }
    const routePlaceholderMaterialPath = productionPlaceholderMaterialReason(
      json ?? text,
      "route",
    );
    if (
      PRODUCTION_PLACEHOLDER_PATH_PATTERN.test(filePath) ||
      routePlaceholderMaterialPath
    ) {
      findings.push(
        finding(
          "critical",
          "production-ready-diagnostic-route",
          routePlaceholderMaterialPath
            ? `A production-ready BSC route artifact carries diagnostic or placeholder material at ${routePlaceholderMaterialPath}.`
            : "A production-ready BSC route artifact carries diagnostic or placeholder material.",
        ),
      );
    }
    for (const problem of ownValue(
      route,
      "burnRecordArtifactProductionProblems",
    ) ?? []) {
      findings.push(
        finding(
          "critical",
          "production-ready-placeholder-burn-record",
          `A production-ready BSC route artifact carries invalid TAIRA burn-record material: ${problem}`,
        ),
      );
    }
    if (
      ownValue(route, "verifierKeyHash") &&
      isKnownDiagnosticBscVerifierKeyHash(ownValue(route, "verifierKeyHash"))
    ) {
      findings.push(
        finding(
          "critical",
          "production-ready-known-diagnostic-verifier",
          "A production-ready BSC route artifact uses a known diagnostic verifier key hash.",
        ),
      );
    }
    if (
      !ownValue(route, "verifierCodeHash") ||
      !ownValue(route, "proofArtifactHash") ||
      !ownValue(route, "provingKeyHash") ||
      !ownValue(route, "nativeEvmProverBundleHash") ||
      !ownValue(route, "destinationBindingHash")
    ) {
      findings.push(
        finding(
          "critical",
          "production-ready-missing-proof-hashes",
          "A production-ready BSC route artifact is missing verifierCodeHash, proofArtifactHash, provingKeyHash, nativeEvmProverBundleHash, or destinationBindingHash.",
        ),
      );
    }
    if (
      ownValue(route, "explorerUrl") !== bscProfile.explorerUrl ||
      ownValue(route, "explorerHost") !== bscProfile.explorerHost
    ) {
      findings.push(
        finding(
          "critical",
          "production-ready-wrong-explorer-binding",
          `A production-ready BSC route artifact must carry ${bscProfile.label} explorerUrl=${bscProfile.explorerUrl} and explorerHost=${bscProfile.explorerHost}.`,
        ),
      );
    }
  } else if (
    ownValue(route, "looksLikeRoute") &&
    diagnosticLike(json ?? text)
  ) {
    findings.push(
      finding(
        "warning",
        "diagnostic-route-artifact",
        "A disabled or draft BSC route artifact carries diagnostic material.",
      ),
    );
  }

  const verifierFileByName = isVerifierKeyLikePath(filePath);
  const verifier =
    routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi ||
    (route.looksLikeRoute && !verifierFileByName)
      ? { looksLikeVerifier: false, problems: [] }
      : verifierMetadata({ filePath, text, json, bscProfile });
  if (verifier.looksLikeVerifier) {
    for (const problem of verifier.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "conflicting-verifier-material",
          `BSC verifier artifact contains conflicting material: ${problem}.`,
        ),
      );
    }
    if (verifier.requiresVerifierBinding && !verifier.bscNetworkBound) {
      findings.push(
        finding(
          "critical",
          "wrong-network-verifier-material",
          `BSC verifier material must be explicitly bound to ${bscProfile.label}.`,
        ),
      );
    }
    if (verifier.requiresVerifierBinding && !verifier.bscRouteDomainBound) {
      findings.push(
        finding(
          "critical",
          "wrong-domain-verifier-material",
          "BSC verifier material must be bound to SORA -> BSC domains.",
        ),
      );
    }
    if (diagnosticLike(json ?? text) || /diagnostic/iu.test(filePath)) {
      findings.push(
        finding(
          "critical",
          "diagnostic-verifier-material",
          "BSC verifier material is marked diagnostic or placeholder.",
        ),
      );
    }
    if (verifier.fixtureShaped) {
      findings.push(
        finding(
          "critical",
          "fixture-shaped-verifier-material",
          "BSC verifier material matches the deterministic smoke-test Groth16 fixture key.",
        ),
      );
    }
    for (const problem of verifier.g1MaterialProblems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-bn254-verifier-material",
          `BSC verifier material failed BN254 G1 validation: ${problem}.`,
        ),
      );
    }
    for (const problem of verifier.g2MaterialProblems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-bn254-verifier-material",
          `BSC verifier material failed BN254 G2 validation: ${problem}.`,
        ),
      );
    }
    if (
      verifier.verifierKeyHash &&
      isKnownDiagnosticBscVerifierKeyHash(verifier.verifierKeyHash)
    ) {
      findings.push(
        finding(
          "critical",
          "known-diagnostic-verifier-key-hash",
          "BSC verifier material uses a known diagnostic verifier key hash.",
        ),
      );
    }
  }

  const nativeProverBundleResult =
    routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi
      ? {
          descriptor: null,
          metadata: { looksLikeNativeProverBundle: false, problems: [] },
        }
      : nativeProverBundleMetadata({
          json,
          bscProfile,
        });
  const nativeProverBundle = nativeProverBundleResult.metadata;
  if (nativeProverBundle.looksLikeNativeProverBundle) {
    for (const problem of nativeProverBundle.problems ?? []) {
      findings.push(
        finding(
          "critical",
          "invalid-native-evm-prover-bundle",
          `BSC native EVM prover bundle failed SDK validation: ${problem}.`,
        ),
      );
    }
    const nativeBundlePlaceholderMaterialPath =
      productionPlaceholderMaterialReason(
        json ?? text,
        "nativeEvmProverBundle",
      );
    if (
      PRODUCTION_PLACEHOLDER_PATH_PATTERN.test(filePath) ||
      nativeBundlePlaceholderMaterialPath
    ) {
      findings.push(
        finding(
          "critical",
          "diagnostic-native-evm-prover-bundle",
          nativeBundlePlaceholderMaterialPath
            ? `BSC native EVM prover bundle carries diagnostic or placeholder material at ${nativeBundlePlaceholderMaterialPath}.`
            : "BSC native EVM prover bundle is marked diagnostic or placeholder.",
        ),
      );
    }
    if (nativeProverBundle.auditHashesProduction === false) {
      findings.push(
        finding(
          "critical",
          "placeholder-native-evm-prover-audit-hashes",
          `BSC native EVM prover bundle audit hashes look placeholder-shaped (${nativeProverBundle.auditHashIssueCount} issue(s)).`,
        ),
      );
    }
    if (
      nativeProverBundle.verifierKeyHash &&
      isKnownDiagnosticBscVerifierKeyHash(nativeProverBundle.verifierKeyHash)
    ) {
      findings.push(
        finding(
          "critical",
          "known-diagnostic-native-verifier-key-hash",
          "BSC native EVM prover bundle uses a known diagnostic verifier key hash.",
        ),
      );
    }
  }

  if (isProofMaterialFile && !proofFile.productionSized) {
    findings.push(
      finding(
        "critical",
        "tiny-proof-material-file",
        "Production proof material files must be larger than placeholder fixtures.",
      ),
    );
  }
  if (oversizedProofMaterial) {
    findings.push(
      finding(
        "critical",
        "oversized-proof-material-file",
        `Production proof material files must be no larger than ${SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES} bytes.`,
      ),
    );
  }
  if (isProofMaterialFile && !oversizedProofMaterial) {
    const profile = proofFileByteProfile(
      filePath,
      await readFile(filePath),
      proofFile,
    );
    proofFile = { ...proofFile, ...profile };
    if (!proofFile.productionEntropy) {
      findings.push(
        finding(
          "critical",
          "low-entropy-proof-material-file",
          "Production proof material files must not be all-zero, repeated-byte, dominant-byte-padded, repeated-pattern, arithmetic-sequence, or fixture-shaped material.",
        ),
      );
    }
    if (!proofFile.productionFormat) {
      findings.push(
        finding(
          "critical",
          "invalid-proof-material-format",
          `Production proof material files must be SnarkJS .r1cs/.zkey artifacts: ${proofFile.formatProblem}.`,
        ),
      );
    }
  }
  const isBrowserProverModuleCandidate =
    /\.m?js$/iu.test(filePath) &&
    ROUTE_FILE_PATTERN.test(path.basename(filePath)) &&
    info.size <= SCCP_BSC_BROWSER_MODULE_MAX_BYTES;
  if (isBrowserProverModuleCandidate) {
    const browserModuleLabel = /groth16-backend/iu.test(path.basename(filePath))
      ? "BSC runtime backend module"
      : "BSC prover module";
    const moduleShape = validateBscSccpBrowserProverModuleBytes(
      await readFile(filePath),
      browserModuleLabel,
    );
    if (!moduleShape.ok) {
      findings.push(
        finding(
          "critical",
          "placeholder-browser-prover-module",
          "A BSC browser prover module is placeholder-shaped.",
        ),
      );
    } else {
      const adjacentSidecarPath = `${filePath}.manifest.json`;
      try {
        const sidecarInfo = await lstat(adjacentSidecarPath);
        if (!sidecarInfo.isFile() || sidecarInfo.isSymbolicLink()) {
          findings.push(
            finding(
              "warning",
              "standalone-browser-prover-module",
              "A BSC browser prover module was scanned without a regular adjacent sidecar manifest.",
            ),
          );
        }
      } catch (_error) {
        findings.push(
          finding(
            "warning",
            "standalone-browser-prover-module",
            "A BSC browser prover module was scanned without an adjacent sidecar manifest.",
          ),
        );
      }
    }
  }

  return {
    _filePath: filePath,
    _nativeProverBundleDescriptor: nativeProverBundleResult.descriptor,
    path: reportPathForArtifact(filePath),
    kind: productionRequirements.looksLikeProductionRequirements
      ? "production-requirements"
      : sourceParityAttestation.looksLikeSourceParityAttestation
        ? "source-parity-attestation"
        : groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage
          ? "groth16-attestation-request-package"
          : groth16AttestationHandoff.looksLikeGroth16AttestationHandoff
            ? "groth16-attestation-handoff"
            : groth16MaterialManifest.looksLikeGroth16MaterialManifest
              ? "groth16-material-manifest"
              : groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport
                ? "groth16-proof-self-test-report"
                : offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence
                  ? "offline-full-toml-evidence"
                  : deploymentEvidence.looksLikeDeploymentEvidence
                    ? "deployment-evidence"
                    : routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi
                      ? "route-manifest-isi"
                      : tairaBurnRecordContract.looksLikeTairaBurnRecordContract
                        ? "taira-burn-record-contract"
                        : compiledContractArtifact.looksLikeCompiledContract
                          ? "contract-artifact"
                          : nativeProverBundle.looksLikeNativeProverBundle
                            ? "native-prover-bundle"
                            : browserProverSidecar.looksLikeBrowserProverSidecar
                              ? "browser-prover-sidecar"
                              : verifier.looksLikeVerifier &&
                                  verifier.requiresVerifierBinding
                                ? "verifier"
                                : route.looksLikeRoute
                                  ? "route"
                                  : verifier.looksLikeVerifier
                                    ? "verifier"
                                    : proofFile.isProvingKey
                                      ? "proving-key"
                                      : proofFile.isProofArtifact
                                        ? "proof-artifact"
                                        : /\.m?js$/iu.test(filePath)
                                          ? "browser-module"
                                          : "artifact",
    sizeBytes: info.size,
    sha256,
    productionRequirements:
      productionRequirements.looksLikeProductionRequirements
        ? {
            valid: productionRequirements.valid === true,
            schema: productionRequirements.schema,
            routeId: productionRequirements.routeId,
            assetKey: productionRequirements.assetKey,
            bscNetwork: productionRequirements.bscNetwork,
            inputCount: productionRequirements.inputCount,
            requiredReportCount: productionRequirements.requiredReportCount,
            deniedVerifierKeyHashCount:
              productionRequirements.deniedVerifierKeyHashCount,
            contractHash: productionRequirements.contractHash,
            expectedContractHash: productionRequirements.expectedContractHash,
            contractMatchesExpected:
              productionRequirements.contractMatchesExpected === true,
          }
        : undefined,
    sourceParityAttestation:
      sourceParityAttestation.looksLikeSourceParityAttestation
        ? {
            valid: sourceParityAttestation.valid === true,
            schema: sourceParityAttestation.schema,
            routeId: sourceParityAttestation.routeId,
            assetKey: sourceParityAttestation.assetKey,
            bscNetwork: sourceParityAttestation.bscNetwork,
            chain: sourceParityAttestation.chain,
            chainIdHex: sourceParityAttestation.chainIdHex,
            networkIdHex: sourceParityAttestation.networkIdHex,
            domain: sourceParityAttestation.domain,
            proofBackend: sourceParityAttestation.proofBackend,
            requiredMarkers: sourceParityAttestation.requiredMarkers,
            sourceTreeHash: sourceParityAttestation.sourceTreeHash,
            expectedSourceTreeHash:
              sourceParityAttestation.expectedSourceTreeHash,
            sourceTreeHashMatches:
              sourceParityAttestation.sourceTreeHash &&
              sourceParityAttestation.sourceTreeHash ===
                sourceParityAttestation.expectedSourceTreeHash,
            sdkCount: sourceParityAttestation.sdkCount,
            sdks: sourceParityAttestation.sdks,
          }
        : undefined,
    groth16AttestationRequestPackage:
      groth16AttestationRequestPackage.looksLikeGroth16AttestationRequestPackage
        ? {
            valid: groth16AttestationRequestPackage.valid === true,
            schema: groth16AttestationRequestPackage.schema,
            routeId: groth16AttestationRequestPackage.routeId,
            assetKey: groth16AttestationRequestPackage.assetKey,
            bscNetwork: groth16AttestationRequestPackage.bscNetwork,
            chain: groth16AttestationRequestPackage.chain,
            chainIdHex: groth16AttestationRequestPackage.chainIdHex,
            networkIdHex: groth16AttestationRequestPackage.networkIdHex,
            circuitProfile: groth16AttestationRequestPackage.circuitProfile,
            publicInputCount: groth16AttestationRequestPackage.publicInputCount,
            publicSignalNames:
              groth16AttestationRequestPackage.publicSignalNames,
            verifierKeyHash: groth16AttestationRequestPackage.verifierKeyHash,
            circuitSourceHash:
              groth16AttestationRequestPackage.circuitSourceHash,
            proofArtifactHash:
              groth16AttestationRequestPackage.proofArtifactHash,
            provingKeyHash: groth16AttestationRequestPackage.provingKeyHash,
            bscVerifierKeyArtifactHash:
              groth16AttestationRequestPackage.bscVerifierKeyArtifactHash,
            snarkjsVerificationKeyHash:
              groth16AttestationRequestPackage.snarkjsVerificationKeyHash,
            trustedSetupTranscriptHash:
              groth16AttestationRequestPackage.trustedSetupTranscriptHash,
            reproducibleBuildTranscriptHash:
              groth16AttestationRequestPackage.reproducibleBuildTranscriptHash,
            manifestPath: groth16AttestationRequestPackage.manifestPath,
            manifestSha256: groth16AttestationRequestPackage.manifestSha256,
            manifestProductionReady:
              groth16AttestationRequestPackage.manifestProductionReady === true,
            manifestProductionBlockerCount:
              groth16AttestationRequestPackage.manifestProductionBlockerCount,
            roles: groth16AttestationRequestPackage.roles,
            allRolesReady:
              groth16AttestationRequestPackage.allRolesReady === true,
          }
        : undefined,
    groth16AttestationHandoff:
      groth16AttestationHandoff.looksLikeGroth16AttestationHandoff
        ? {
            valid: groth16AttestationHandoff.valid === true,
            schema: groth16AttestationHandoff.schema,
            routeId: groth16AttestationHandoff.routeId,
            assetKey: groth16AttestationHandoff.assetKey,
            bscNetwork: groth16AttestationHandoff.bscNetwork,
            chain: groth16AttestationHandoff.chain,
            chainIdHex: groth16AttestationHandoff.chainIdHex,
            networkIdHex: groth16AttestationHandoff.networkIdHex,
            circuitProfile: groth16AttestationHandoff.circuitProfile,
            proofBackend: groth16AttestationHandoff.proofBackend,
            verifierKeyHash: groth16AttestationHandoff.verifierKeyHash,
            manifestPath: groth16AttestationHandoff.manifestPath,
            manifestSha256: groth16AttestationHandoff.manifestSha256,
            manifestProductionReady:
              groth16AttestationHandoff.manifestProductionReady === true,
            manifestProductionBlockerCount:
              groth16AttestationHandoff.manifestProductionBlockerCount,
            manifestProductionBlockers:
              groth16AttestationHandoff.manifestProductionBlockers,
            manifestProductionBlockerSummary:
              groth16AttestationHandoff.manifestProductionBlockerSummary,
            packages: groth16AttestationHandoff.packages,
            attestationRequestPath:
              groth16AttestationHandoff.attestationRequestPath,
            attestationRequestSha256:
              groth16AttestationHandoff.attestationRequestSha256,
            handoffComplete: groth16AttestationHandoff.handoffComplete === true,
            signingReady: groth16AttestationHandoff.signingReady === true,
            readyToFinalize: groth16AttestationHandoff.readyToFinalize === true,
            requestValid: groth16AttestationHandoff.requestValid === true,
            roleReadiness: groth16AttestationHandoff.roleReadiness,
            allRolesReady: groth16AttestationHandoff.allRolesReady === true,
            missingSignedRoles: groth16AttestationHandoff.missingSignedRoles,
            handoffBlockers: groth16AttestationHandoff.handoffBlockers,
            attestationStatusProblemCount:
              groth16AttestationHandoff.attestationStatusProblemCount,
            attestationStatusProblemSummary:
              groth16AttestationHandoff.attestationStatusProblemSummary,
            readinessProductionReady:
              groth16AttestationHandoff.readinessProductionReady === true,
            readinessProductionBlockers:
              groth16AttestationHandoff.readinessProductionBlockers,
            problemCount: groth16AttestationHandoff.problemCount,
            nextActions: groth16AttestationHandoff.nextActions,
          }
        : undefined,
    groth16MaterialManifest:
      groth16MaterialManifest.looksLikeGroth16MaterialManifest
        ? {
            valid: groth16MaterialManifest.valid === true,
            schema: groth16MaterialManifest.schema,
            routeId: groth16MaterialManifest.routeId,
            assetKey: groth16MaterialManifest.assetKey,
            bscNetwork: groth16MaterialManifest.bscNetwork,
            chain: groth16MaterialManifest.chain,
            chainIdHex: groth16MaterialManifest.chainIdHex,
            networkIdHex: groth16MaterialManifest.networkIdHex,
            proofBackend: groth16MaterialManifest.proofBackend,
            proofFamily: groth16MaterialManifest.proofFamily,
            sourceDomain: groth16MaterialManifest.sourceDomain,
            targetDomain: groth16MaterialManifest.targetDomain,
            circuitProfile: groth16MaterialManifest.circuitProfile,
            publicInputCount: groth16MaterialManifest.publicInputCount,
            publicSignalNames: groth16MaterialManifest.publicSignalNames,
            productionReady: groth16MaterialManifest.productionReady === true,
            productionBlockerCount:
              groth16MaterialManifest.productionBlockerCount,
            productionBlockers: groth16MaterialManifest.productionBlockers,
            productionBlockerSummary:
              groth16MaterialManifest.productionBlockerSummary,
            verifierKeyHash: groth16MaterialManifest.verifierKeyHash,
            circuitSourceHash: groth16MaterialManifest.circuitSourceHash,
            proofArtifactHash: groth16MaterialManifest.proofArtifactHash,
            provingKeyHash: groth16MaterialManifest.provingKeyHash,
            bscVerifierKeyArtifactHash:
              groth16MaterialManifest.bscVerifierKeyArtifactHash,
            snarkjsVerificationKeyHash:
              groth16MaterialManifest.snarkjsVerificationKeyHash,
            trustedSetupTranscript:
              groth16MaterialManifest.trustedSetupTranscript,
            trustedSetupTranscriptHash:
              groth16MaterialManifest.trustedSetupTranscriptHash,
            reproducibleBuildTranscript:
              groth16MaterialManifest.reproducibleBuildTranscript,
            reproducibleBuildTranscriptHash:
              groth16MaterialManifest.reproducibleBuildTranscriptHash,
            selfChecks: groth16MaterialManifest.selfChecks,
            attestationTrustPolicy:
              groth16MaterialManifest.attestationTrustPolicy,
            attestations: groth16MaterialManifest.attestations,
            referencedTranscriptsVerified:
              groth16MaterialManifest.referencedTranscriptsVerified !== false,
            referencedAttestationsVerified:
              groth16MaterialManifest.referencedAttestationsVerified !== false,
          }
        : undefined,
    groth16ProofSelfTestReport:
      groth16ProofSelfTestReport.looksLikeGroth16ProofSelfTestReport
        ? {
            valid: groth16ProofSelfTestReport.valid === true,
            schema: groth16ProofSelfTestReport.schema,
            routeId: groth16ProofSelfTestReport.routeId,
            assetKey: groth16ProofSelfTestReport.assetKey,
            bscNetwork: groth16ProofSelfTestReport.bscNetwork,
            chain: groth16ProofSelfTestReport.chain,
            chainIdHex: groth16ProofSelfTestReport.chainIdHex,
            networkIdHex: groth16ProofSelfTestReport.networkIdHex,
            circuitProfile: groth16ProofSelfTestReport.circuitProfile,
            proofBackend: groth16ProofSelfTestReport.proofBackend,
            proofFamily: groth16ProofSelfTestReport.proofFamily,
            manifestPath: groth16ProofSelfTestReport.manifestPath,
            manifestSha256: groth16ProofSelfTestReport.manifestSha256,
            manifestProductionReady:
              groth16ProofSelfTestReport.manifestProductionReady === true,
            manifestProductionBlockerCount:
              groth16ProofSelfTestReport.manifestProductionBlockerCount,
            manifestProductionBlockers:
              groth16ProofSelfTestReport.manifestProductionBlockers,
            manifestProductionBlockerSummary:
              groth16ProofSelfTestReport.manifestProductionBlockerSummary,
            proofArtifactHash: groth16ProofSelfTestReport.proofArtifactHash,
            provingKeyHash: groth16ProofSelfTestReport.provingKeyHash,
            bscVerifierKeyArtifactHash:
              groth16ProofSelfTestReport.bscVerifierKeyArtifactHash,
            snarkjsVerificationKeyHash:
              groth16ProofSelfTestReport.snarkjsVerificationKeyHash,
            witnessWasmHash: groth16ProofSelfTestReport.witnessWasmHash,
            witnessHash: groth16ProofSelfTestReport.witnessHash,
            proofHash: groth16ProofSelfTestReport.proofHash,
            publicSignalsHash: groth16ProofSelfTestReport.publicSignalsHash,
            publicSignalNames: groth16ProofSelfTestReport.publicSignalNames,
            referencedManifestVerified:
              groth16ProofSelfTestReport.referencedManifestVerified === true,
            publicDeploymentMatches:
              groth16ProofSelfTestReport.publicDeploymentMatches === true,
          }
        : undefined,
    offlineFullTomlEvidence:
      offlineFullTomlEvidence.looksLikeOfflineFullTomlEvidence
        ? {
            valid: offlineFullTomlEvidence.valid === true,
            schema: OFFLINE_FULL_TOML_EVIDENCE_SCHEMA,
            routeId: offlineFullTomlEvidence.routeId,
            assetKey: offlineFullTomlEvidence.assetKey,
            bscNetwork: offlineFullTomlEvidence.bscNetwork,
            chainIdHex: offlineFullTomlEvidence.chainIdHex,
            networkIdHex: offlineFullTomlEvidence.networkIdHex,
            fullTomlReady: offlineFullTomlEvidence.fullTomlReady === true,
            offlineFullTomlSha256:
              offlineFullTomlEvidence.offlineFullTomlSha256,
            hashInputSha256: offlineFullTomlEvidence.hashInputSha256,
            renderedTomlSha256: offlineFullTomlEvidence.renderedTomlSha256,
            hashMode: offlineFullTomlEvidence.hashMode,
            routeManifestPath: offlineFullTomlEvidence.routeManifestPath,
            fullConfigPath: offlineFullTomlEvidence.fullConfigPath,
          }
        : undefined,
    deploymentEvidence: deploymentEvidence.looksLikeDeploymentEvidence
      ? {
          schema: deploymentEvidence.schema || null,
          valid: deploymentEvidence.valid === true,
          routeId: deploymentEvidence.routeId,
          assetKey: deploymentEvidence.assetKey,
          bscNetwork: deploymentEvidence.bscNetwork,
          chain: deploymentEvidence.chain,
          chainIdHex: deploymentEvidence.chainIdHex,
          networkIdHex: deploymentEvidence.networkIdHex,
          bridgeAddress: deploymentEvidence.bridgeAddress,
          tokenAddress: deploymentEvidence.tokenAddress,
          sourceBridgeAddress: deploymentEvidence.sourceBridgeAddress,
          verifierAddress: deploymentEvidence.verifierAddress,
          verifierCodeHash: deploymentEvidence.verifierCodeHash,
          verifierKeyHash: deploymentEvidence.verifierKeyHash,
          destinationBindingHash: deploymentEvidence.destinationBindingHash,
          destinationBindingKey: deploymentEvidence.destinationBindingKey,
          compiledContractCodeHashes:
            deploymentEvidence.compiledContractCodeHashes,
          destinationRolloutVersion:
            deploymentEvidence.destinationRolloutVersion,
          destinationBindingVersion:
            deploymentEvidence.destinationBindingVersion,
          postDeployChecklist: deploymentEvidence.postDeployChecklist,
          bscContractReadback: deploymentEvidence.bscContractReadback,
          productionPlaceholderFree: !findings.some(
            (entry) => entry.id === "diagnostic-deployment-evidence",
          ),
        }
      : undefined,
    routeManifestUpsertIsi:
      routeManifestUpsertIsi.looksLikeRouteManifestUpsertIsi
        ? {
            valid: routeManifestUpsertIsi.valid === true,
            schema: routeManifestUpsertIsi.schema,
            routeId: routeManifestUpsertIsi.routeId,
            assetKey: routeManifestUpsertIsi.assetKey,
            chain: routeManifestUpsertIsi.chain,
            chainIdHex: routeManifestUpsertIsi.chainIdHex,
            networkIdHex: routeManifestUpsertIsi.networkIdHex,
            counterpartyDomain: routeManifestUpsertIsi.counterpartyDomain,
            requiredPermission: routeManifestUpsertIsi.requiredPermission,
            manifestSha256: routeManifestUpsertIsi.manifestSha256,
            productionReady: routeManifestUpsertIsi.productionReady === true,
            ...(routeManifestUpsertIsi.submission
              ? { submission: routeManifestUpsertIsi.submission }
              : {}),
          }
        : undefined,
    contractArtifact: compiledContractArtifact.looksLikeCompiledContract
      ? {
          valid: compiledContractArtifact.valid === true,
          key: compiledContractArtifact.key,
          contractName: compiledContractArtifact.contractName,
          abiEntryCount: compiledContractArtifact.abiEntryCount,
          bytecodeKeccak256: compiledContractArtifact.bytecodeKeccak256,
          deployedBytecodeKeccak256:
            compiledContractArtifact.deployedBytecodeKeccak256,
          bytecodeSha256: compiledContractArtifact.bytecodeSha256,
          deployedBytecodeSha256:
            compiledContractArtifact.deployedBytecodeSha256,
        }
      : undefined,
    route:
      route.looksLikeRoute &&
      !(verifier.looksLikeVerifier && verifier.requiresVerifierBinding)
        ? {
            routeId: route.routeId,
            assetKey: route.assetKey,
            productionReady: route.productionReady,
            verifierKeyHash: route.verifierKeyHash,
            verifierCodeHash: route.verifierCodeHash,
            proofArtifactHash: route.proofArtifactHash,
            provingKeyHash: route.provingKeyHash,
            nativeEvmProverBundleHash: route.nativeEvmProverBundleHash,
            destinationBindingHash: route.destinationBindingHash,
            settlementAssetDefinitionId: route.settlementAssetDefinitionId,
            bridgeAddress: route.bridgeAddress,
            tokenAddress: route.tokenAddress,
            sourceBridgeAddress: route.sourceBridgeAddress,
            verifierAddress: route.verifierAddress,
            explorerUrl: route.explorerUrl,
            explorerHost: route.explorerHost,
            explorerBindingMatches: route.explorerBindingMatches,
            postDeployLiveEvidence: route.postDeployLiveEvidence,
            burnRecordArtifactSha256: route.burnRecordArtifactSha256,
            burnRecordArtifactProductionProblems:
              route.burnRecordArtifactProductionProblems,
            disabled: Boolean(route.disabledReason),
          }
        : undefined,
    tairaBurnRecordContract:
      tairaBurnRecordContract.looksLikeTairaBurnRecordContract
        ? {
            valid: tairaBurnRecordContract.valid === true,
            schema: tairaBurnRecordContract.schema,
            routeId: tairaBurnRecordContract.routeId,
            assetKey: tairaBurnRecordContract.assetKey,
            sourceName: tairaBurnRecordContract.sourceName,
            compilerFingerprint: tairaBurnRecordContract.compilerFingerprint,
            codeHash: tairaBurnRecordContract.codeHash,
            abiHash: tairaBurnRecordContract.abiHash,
            artifactSha256: tairaBurnRecordContract.artifactSha256,
            artifactSizeBytes: tairaBurnRecordContract.artifactSizeBytes,
            artifactProductionProblemCount:
              tairaBurnRecordContract.artifactProductionProblems?.length ?? 0,
            entrypoint: tairaBurnRecordContract.entrypoint,
            permission: tairaBurnRecordContract.permission,
            paramSignature: tairaBurnRecordContract.paramSignature,
            executable: tairaBurnRecordContract.executable,
            forceZkMode: tairaBurnRecordContract.forceZkMode === true,
            settlementInstruction:
              tairaBurnRecordContract.settlementInstruction,
            recordInstruction: tairaBurnRecordContract.recordInstruction,
          }
        : undefined,
    browserProverSidecar: browserProverSidecar.looksLikeBrowserProverSidecar
      ? {
          schema: browserProverSidecar.schema,
          modulePath: browserProverSidecar.modulePath,
          moduleSha256: browserProverSidecar.moduleSha256,
          moduleSha256Actual: browserProverSidecar.moduleSha256Actual,
          exports: browserProverSidecar.exports,
          manifest: browserProverSidecar.manifest,
          valid: (browserProverSidecar.problems ?? []).length === 0,
        }
      : undefined,
    verifier: verifier.looksLikeVerifier
      ? {
          verifierKeyHash: verifier.verifierKeyHash,
          network: verifier.network,
          chainIdHex: verifier.chainIdHex,
          networkIdHex: verifier.networkIdHex,
          sourceDomain: verifier.sourceDomain,
          targetDomain: verifier.targetDomain,
          requiresVerifierBinding: verifier.requiresVerifierBinding,
          bscNetworkBound: verifier.bscNetworkBound,
          bscRouteDomainBound: verifier.bscRouteDomainBound,
          fixtureShaped: verifier.fixtureShaped,
          g1MaterialValid: (verifier.g1MaterialProblems ?? []).length === 0,
          g1MaterialProblems: verifier.g1MaterialProblems ?? [],
          g2MaterialValid: (verifier.g2MaterialProblems ?? []).length === 0,
          g2MaterialProblems: verifier.g2MaterialProblems ?? [],
        }
      : undefined,
    nativeProverBundle: nativeProverBundle.looksLikeNativeProverBundle
      ? {
          valid: nativeProverBundle.valid === true,
          bundleId: nativeProverBundle.bundleId,
          chain: nativeProverBundle.chain,
          domain: nativeProverBundle.domain,
          nativeEvmProverBundleHash:
            nativeProverBundle.nativeEvmProverBundleHash,
          verifierKeyHash: nativeProverBundle.verifierKeyHash,
          verifierKeyArtifactHash: nativeProverBundle.verifierKeyArtifactHash,
          proofArtifactHash: nativeProverBundle.proofArtifactHash,
          provingKeyHash: nativeProverBundle.provingKeyHash,
          destinationBindingHash: nativeProverBundle.destinationBindingHash,
          proofArtifact: nativeProverBundle.proofArtifact,
          provingKey: nativeProverBundle.provingKey,
          verifierKey: nativeProverBundle.verifierKey,
          nativeSdkArtifacts: nativeProverBundle.nativeSdkArtifacts,
          auditHashesProduction:
            nativeProverBundle.auditHashesProduction === true,
          auditHashIssueCount: nativeProverBundle.auditHashIssueCount ?? 0,
          artifactsVerified: nativeProverBundle.artifactsVerified === true,
          verifiedSdks: nativeProverBundle.verifiedSdks ?? [],
        }
      : undefined,
    proofFile,
    findings,
  };
};

const publicRouteDeployment = (routeReport) => {
  const deployment = ownValue(routeReport, "deployment");
  if (!isRecord(deployment)) {
    return null;
  }
  const out = {};
  for (const key of [
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
  ]) {
    const value = ownValue(deployment, key);
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  for (const key of ["destinationBrowserProver", "sourceBrowserProver"]) {
    const value = ownValue(deployment, key);
    if (isRecord(value)) {
      out[key] = ownJsonRecord(value);
    }
  }
  return Object.keys(out).length ? out : null;
};

const publicPostDeployLiveEvidence = (routeReport) => {
  const evidence = ownValue(routeReport, "postDeployLiveEvidence");
  if (!isRecord(evidence)) {
    return null;
  }
  return {
    fullTomlReady: ownValue(evidence, "fullTomlReady") === true,
    sourceBridgeConfigHash:
      typeof ownValue(evidence, "sourceBridgeConfigHash") === "string"
        ? ownValue(evidence, "sourceBridgeConfigHash")
        : null,
    sourceEventTransactionId:
      typeof ownValue(evidence, "sourceEventTransactionId") === "string"
        ? ownValue(evidence, "sourceEventTransactionId")
        : null,
    sourceEventExplorerUrl:
      typeof ownValue(evidence, "sourceEventExplorerUrl") === "string"
        ? ownValue(evidence, "sourceEventExplorerUrl")
        : null,
    routeCanaryEvidenceHash:
      typeof ownValue(evidence, "routeCanaryEvidenceHash") === "string"
        ? ownValue(evidence, "routeCanaryEvidenceHash")
        : null,
    routeCanaryTransactionId:
      typeof ownValue(evidence, "routeCanaryTransactionId") === "string"
        ? ownValue(evidence, "routeCanaryTransactionId")
        : null,
    routeCanaryExplorerUrl:
      typeof ownValue(evidence, "routeCanaryExplorerUrl") === "string"
        ? ownValue(evidence, "routeCanaryExplorerUrl")
        : null,
    offlineFullTomlSha256:
      typeof ownValue(evidence, "offlineFullTomlSha256") === "string"
        ? ownValue(evidence, "offlineFullTomlSha256")
        : null,
  };
};

const routeArtifactMatchesPublicDeployment = (route, deployment) => {
  if (!isRecord(route) || !isRecord(deployment)) {
    return false;
  }
  return [
    ["bridgeAddress", "bridgeAddress", normalizeEvmAddress],
    ["tokenAddress", "tokenAddress", normalizeEvmAddress],
    ["sourceBridgeAddress", "sourceBridgeAddress", normalizeEvmAddress],
    ["verifierAddress", "verifierAddress", normalizeEvmAddress],
    ["verifierCodeHash", "verifierCodeHash"],
    ["verifierKeyHash", "verifierKeyHash"],
    ["proofArtifactHash", "proofArtifactHash"],
    ["provingKeyHash", "provingKeyHash"],
    ["nativeEvmProverBundleHash", "nativeEvmProverBundleHash"],
    ["destinationBindingHash", "destinationBindingHash"],
  ].every(([routeKey, deploymentKey, normalizeValue = normalizeHex32]) => {
    const actual = normalizeValue(ownValue(route, routeKey));
    const expected = normalizeValue(ownValue(deployment, deploymentKey));
    return Boolean(actual) && actual === expected;
  });
};

const deploymentEvidenceMatchesPublicDeployment = (evidence, deployment) => {
  if (!isRecord(evidence) || !isRecord(deployment)) {
    return false;
  }
  return [
    ["bridgeAddress", "bridgeAddress", normalizeEvmAddress],
    ["tokenAddress", "tokenAddress", normalizeEvmAddress],
    ["sourceBridgeAddress", "sourceBridgeAddress", normalizeEvmAddress],
    ["verifierAddress", "verifierAddress", normalizeEvmAddress],
    ["networkIdHex", "networkIdHex", normalizeHex32],
    ["verifierCodeHash", "verifierCodeHash", normalizeHex32],
    ["verifierKeyHash", "verifierKeyHash", normalizeHex32],
    ["destinationBindingHash", "destinationBindingHash", normalizeHex32],
  ].every(([evidenceKey, deploymentKey, normalizeValue]) => {
    const actual = normalizeValue(ownValue(evidence, evidenceKey));
    const expected = normalizeValue(ownValue(deployment, deploymentKey));
    return Boolean(actual) && actual === expected;
  });
};

const routeArtifactMatchesPublicPostDeploy = (route, routeReport) => {
  const artifactEvidence = ownValue(route, "postDeployLiveEvidence");
  const publicEvidence = publicPostDeployLiveEvidence(routeReport);
  if (!isRecord(artifactEvidence) || !isRecord(publicEvidence)) {
    return false;
  }
  if (
    ownValue(artifactEvidence, "fullTomlReady") !== true ||
    ownValue(publicEvidence, "fullTomlReady") !== true
  ) {
    return false;
  }
  for (const key of [
    "sourceBridgeConfigHash",
    "sourceEventTransactionId",
    "routeCanaryEvidenceHash",
    "routeCanaryTransactionId",
    "offlineFullTomlSha256",
  ]) {
    const actual = normalizeHex32(ownValue(artifactEvidence, key));
    const expected = normalizeHex32(ownValue(publicEvidence, key));
    if (!actual || !expected || actual !== expected) {
      return false;
    }
  }
  for (const key of ["sourceEventExplorerUrl", "routeCanaryExplorerUrl"]) {
    const actual = ownValue(artifactEvidence, key);
    const expected = ownValue(publicEvidence, key);
    if (typeof actual !== "string" || actual !== expected) {
      return false;
    }
  }
  return true;
};

const offlineFullTomlEvidenceMatchesPublicPostDeploy = (
  evidence,
  routeReport,
) => {
  const publicEvidence = publicPostDeployLiveEvidence(routeReport);
  if (!isRecord(evidence) || !isRecord(publicEvidence)) {
    return false;
  }
  const actual = normalizeHex32(ownValue(evidence, "offlineFullTomlSha256"));
  const expected = normalizeHex32(
    ownValue(publicEvidence, "offlineFullTomlSha256"),
  );
  return (
    ownValue(evidence, "valid") === true &&
    ownValue(evidence, "fullTomlReady") === true &&
    ownValue(publicEvidence, "fullTomlReady") === true &&
    Boolean(actual) &&
    actual === expected
  );
};

const isNativeProverSupportVerifierFile = (entry) =>
  ownValue(entry, "kind") === "verifier" &&
  /(?:^|[\\/])native-prover(?:[\\/]|$)/iu.test(
    String(ownValue(entry, "_filePath") ?? ownValue(entry, "path") ?? ""),
  );

const nativeProverBundleMatchesPublicDeployment = (bundle, deployment) => {
  if (
    !isRecord(bundle) ||
    !isRecord(deployment) ||
    ownValue(bundle, "valid") !== true
  ) {
    return false;
  }
  return [
    ["nativeEvmProverBundleHash", "nativeEvmProverBundleHash"],
    ["verifierKeyHash", "verifierKeyHash"],
    ["proofArtifactHash", "proofArtifactHash"],
    ["provingKeyHash", "provingKeyHash"],
    ["destinationBindingHash", "destinationBindingHash"],
  ].every(
    ([bundleKey, deploymentKey]) =>
      normalizeHex32(ownValue(bundle, bundleKey)) &&
      normalizeHex32(ownValue(bundle, bundleKey)) ===
        normalizeHex32(ownValue(deployment, deploymentKey)),
  );
};

const groth16MaterialManifestMatchesPublicDeployment = (
  manifest,
  deployment,
) => {
  if (
    !isRecord(manifest) ||
    !isRecord(deployment) ||
    ownValue(manifest, "valid") !== true
  ) {
    return false;
  }
  return [
    ["verifierKeyHash", "verifierKeyHash"],
    ["proofArtifactHash", "proofArtifactHash"],
    ["provingKeyHash", "provingKeyHash"],
  ].every(
    ([manifestKey, deploymentKey]) =>
      normalizeHex32(ownValue(manifest, manifestKey)) &&
      normalizeHex32(ownValue(manifest, manifestKey)) ===
        normalizeHex32(ownValue(deployment, deploymentKey)),
  );
};

const groth16AttestationRequestMatchesPublicDeployment = (
  request,
  deployment,
) => {
  if (
    !isRecord(request) ||
    !isRecord(deployment) ||
    ownValue(request, "valid") !== true
  ) {
    return false;
  }
  return [
    ["verifierKeyHash", "verifierKeyHash"],
    ["proofArtifactHash", "proofArtifactHash"],
    ["provingKeyHash", "provingKeyHash"],
  ].every(
    ([requestKey, deploymentKey]) =>
      normalizeHex32(ownValue(request, requestKey)) &&
      normalizeHex32(ownValue(request, requestKey)) ===
        normalizeHex32(ownValue(deployment, deploymentKey)),
  );
};

const groth16AttestationHandoffMatchesPublicDeployment = (
  handoff,
  deployment,
) => {
  if (
    !isRecord(handoff) ||
    !isRecord(deployment) ||
    ownValue(handoff, "valid") !== true
  ) {
    return false;
  }
  const handoffVerifierKeyHash = normalizeHex32(
    ownValue(handoff, "verifierKeyHash"),
  );
  return (
    Boolean(handoffVerifierKeyHash) &&
    handoffVerifierKeyHash ===
      normalizeHex32(ownValue(deployment, "verifierKeyHash"))
  );
};

const groth16ProofSelfTestReportMatchesPublicDeployment = (
  report,
  deployment,
) => {
  if (
    !isRecord(report) ||
    !isRecord(deployment) ||
    ownValue(report, "valid") !== true
  ) {
    return false;
  }
  return [
    ["proofArtifactHash", "proofArtifactHash"],
    ["provingKeyHash", "provingKeyHash"],
  ].every(
    ([reportKey, deploymentKey]) =>
      normalizeHex32(ownValue(report, reportKey)) &&
      normalizeHex32(ownValue(report, reportKey)) ===
        normalizeHex32(ownValue(deployment, deploymentKey)),
  );
};

const nativeProverArtifactRootCandidates = ({ bundlePath, scanPaths }) =>
  uniqueResolvedPaths([
    path.dirname(bundlePath),
    path.join(path.dirname(bundlePath), "native-prover"),
    ...DEFAULT_NATIVE_EVM_PROVER_ARTIFACT_ROOTS,
    ...parseList(scanPaths),
  ]);

const readNativeProverBundleArtifact = async ({
  bundlePath,
  artifactPath,
  scanPaths,
}) => {
  const relativePath = trim(artifactPath);
  for (const root of nativeProverArtifactRootCandidates({
    bundlePath,
    scanPaths,
  })) {
    const candidate = path.resolve(root, relativePath);
    if (!isPathInside(root, candidate) || !existsSync(candidate)) {
      continue;
    }
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      continue;
    }
    if (info.isFile()) {
      if (info.size > SCCP_BSC_NATIVE_PROVER_ARTIFACT_MAX_BYTES) {
        throw new Error(
          `artifact ${relativePath} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_NATIVE_PROVER_ARTIFACT_MAX_BYTES} bytes`,
        );
      }
      const [realRoot, realCandidate] = await Promise.all([
        realpath(root),
        realpath(candidate),
      ]);
      if (!isPathInside(realRoot, realCandidate)) {
        continue;
      }
      return await readFile(realCandidate);
    }
  }
  throw new Error(`artifact ${relativePath} was not found under scanned roots`);
};

const nativeProverBundleParityArtifactPath = (descriptor) =>
  trim(
    descriptor?.crossSdkParityArtifact ?? descriptor?.cross_sdk_parity_artifact,
  );

const nativeProverBundleSelfTestArtifactPath = (descriptor) =>
  trim(
    descriptor?.nativeProverSelfTestArtifact ??
      descriptor?.native_prover_self_test_artifact ??
      descriptor?.selfTestArtifact ??
      descriptor?.self_test_artifact,
  );

const readNativeProverBundleJsonArtifact = async ({
  entry,
  scanPaths,
  artifactPath,
  label,
}) => {
  if (!artifactPath) {
    throw new Error(`${label} is missing`);
  }
  const bytes = await readNativeProverBundleArtifact({
    bundlePath: entry._filePath,
    artifactPath,
    scanPaths,
  });
  const parsed = parseJsonWithoutDuplicateKeys(
    Buffer.from(bytes).toString("utf8"),
    artifactPath,
  );
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
};

const verifyNativeProverParityProductionSchema = async ({
  descriptor,
  entry,
  scanPaths,
  bscProfile,
}) => {
  const parsed = await readNativeProverBundleJsonArtifact({
    descriptor,
    entry,
    artifactPath: nativeProverBundleParityArtifactPath(descriptor),
    scanPaths,
    label: "crossSdkParityArtifact",
  });
  const expected =
    BSC_NATIVE_EVM_PROVER_PARITY_SCHEMAS[bscProfile.key]?.production;
  const legacy =
    BSC_NATIVE_EVM_PROVER_PARITY_SCHEMAS[bscProfile.key]?.legacyFixture;
  const schema = trim(ownValue(parsed, "schema"));
  if (schema !== expected) {
    const legacyDetail =
      legacy && schema === legacy
        ? `; legacy fixture schema ${legacy} is not valid for verified production native EVM prover artifacts`
        : "";
    throw new Error(
      `crossSdkParityArtifact schema must be ${expected}${legacyDetail}`,
    );
  }
};

const nativeReportProductionAttestationHash = (report, label) => {
  const hash = normalizeHex32(
    ownValue(report, "productionAttestationHash") ??
      ownValue(report, "production_attestation_hash"),
  );
  if (!hash) {
    throw new Error(
      `${label} production_attestation_hash is missing or invalid`,
    );
  }
  return hash;
};

const nativeReportProductionAttestationHashForManifest = (
  kind,
  manifestSha256,
) => {
  const manifestHash = normalizeHex32(manifestSha256);
  if (!manifestHash) {
    throw new Error("Groth16 material manifest sha256 is missing or invalid");
  }
  const role =
    kind === "cross-sdk-parity"
      ? "cross-sdk-parity"
      : kind === "native-prover-self-test"
        ? "native-prover-self-test"
        : "";
  if (!role) {
    throw new Error(
      "native prover report production attestation kind is invalid",
    );
  }
  return sha256Bytes(
    Buffer.from(
      `iroha-sccp-bsc-native-prover-report-production-attestation/v1:${role}:${manifestHash}`,
      "utf8",
    ),
  );
};

const nativeProverBundleMaterialManifestMatches = (
  bundleEntry,
  manifestEntry,
) =>
  bundleEntry.nativeProverBundle?.verifierKeyHash ===
    manifestEntry.groth16MaterialManifest?.verifierKeyHash &&
  bundleEntry.nativeProverBundle?.proofArtifactHash ===
    manifestEntry.groth16MaterialManifest?.proofArtifactHash &&
  bundleEntry.nativeProverBundle?.provingKeyHash ===
    manifestEntry.groth16MaterialManifest?.provingKeyHash;

const requestPackageMaterialManifestMatches = (requestEntry, manifestEntry) =>
  requestEntry.groth16AttestationRequestPackage?.verifierKeyHash ===
    manifestEntry.groth16MaterialManifest?.verifierKeyHash &&
  requestEntry.groth16AttestationRequestPackage?.proofArtifactHash ===
    manifestEntry.groth16MaterialManifest?.proofArtifactHash &&
  requestEntry.groth16AttestationRequestPackage?.provingKeyHash ===
    manifestEntry.groth16MaterialManifest?.provingKeyHash &&
  requestEntry.groth16AttestationRequestPackage?.circuitSourceHash ===
    manifestEntry.groth16MaterialManifest?.circuitSourceHash &&
  requestEntry.groth16AttestationRequestPackage?.bscVerifierKeyArtifactHash ===
    manifestEntry.groth16MaterialManifest?.bscVerifierKeyArtifactHash &&
  requestEntry.groth16AttestationRequestPackage?.snarkjsVerificationKeyHash ===
    manifestEntry.groth16MaterialManifest?.snarkjsVerificationKeyHash &&
  requestEntry.groth16AttestationRequestPackage?.trustedSetupTranscriptHash ===
    manifestEntry.groth16MaterialManifest?.trustedSetupTranscriptHash &&
  requestEntry.groth16AttestationRequestPackage
    ?.reproducibleBuildTranscriptHash ===
    manifestEntry.groth16MaterialManifest?.reproducibleBuildTranscriptHash;

const verifyGroth16AttestationRequestPackageBinding = (
  entry,
  routeBoundFiles,
) => {
  if (
    entry.kind !== "groth16-attestation-request-package" ||
    entry.groth16AttestationRequestPackage?.valid !== true
  ) {
    return entry;
  }
  const request = entry.groth16AttestationRequestPackage;
  const matchingManifest = routeBoundFiles.find(
    (candidate) =>
      candidate.kind === "groth16-material-manifest" &&
      candidate.sha256 === request.manifestSha256,
  );
  const problems = [];
  if (!matchingManifest?.groth16MaterialManifest) {
    problems.push(
      "referenced Groth16 material manifest sha256 was not found in the scanned inventory",
    );
  } else {
    const manifest = matchingManifest.groth16MaterialManifest;
    if (!requestPackageMaterialManifestMatches(entry, matchingManifest)) {
      problems.push(
        "referenced Groth16 material manifest hashes do not match request package artifacts",
      );
    }
    if (request.manifestProductionReady !== manifest.productionReady) {
      problems.push(
        "request package manifest.productionReady must match referenced manifest",
      );
    }
    if (
      request.manifestProductionBlockerCount !== manifest.productionBlockerCount
    ) {
      problems.push(
        "request package manifest.productionBlockers must match referenced manifest",
      );
    }
  }
  return problems.length === 0
    ? {
        ...entry,
        groth16AttestationRequestPackage: {
          ...entry.groth16AttestationRequestPackage,
          referencedManifestVerified: true,
        },
      }
    : {
        ...entry,
        groth16AttestationRequestPackage: {
          ...entry.groth16AttestationRequestPackage,
          valid: false,
          referencedManifestVerified: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "invalid-groth16-attestation-request-package",
            `BSC Groth16 attestation request package is not bound to scanned material: ${problems.join("; ")}.`,
          ),
        ],
      };
};

const handoffRequestReadinessMatches = (handoff, request) => {
  const handoffReadiness = handoff.roleReadiness ?? {};
  const requestRoles = request.roles ?? {};
  return BSC_GROTH16_REQUIRED_ATTESTATIONS.every(([key]) => {
    const handoffReady = ownValue(handoffReadiness, key) === true;
    const requestReady = requestRoles[key]?.readyForSignature === true;
    return handoffReady === requestReady;
  });
};

const verifyGroth16AttestationHandoffBinding = (entry, routeBoundFiles) => {
  if (
    entry.kind !== "groth16-attestation-handoff" ||
    entry.groth16AttestationHandoff?.valid !== true
  ) {
    return entry;
  }
  const handoff = entry.groth16AttestationHandoff;
  const matchingRequest = routeBoundFiles.find(
    (candidate) =>
      candidate.kind === "groth16-attestation-request-package" &&
      candidate.sha256 === handoff.attestationRequestSha256,
  );
  const matchingManifest = routeBoundFiles.find(
    (candidate) =>
      candidate.kind === "groth16-material-manifest" &&
      candidate.sha256 === handoff.manifestSha256,
  );
  const problems = [];
  if (!matchingRequest?.groth16AttestationRequestPackage) {
    problems.push(
      "referenced Groth16 attestation request package sha256 was not found in the scanned inventory",
    );
  } else {
    const request = matchingRequest.groth16AttestationRequestPackage;
    if (request.valid !== true) {
      problems.push(
        "referenced Groth16 attestation request package is invalid",
      );
    }
    if (
      request.routeId !== handoff.routeId ||
      request.assetKey !== handoff.assetKey
    ) {
      problems.push(
        "referenced Groth16 attestation request package route or asset does not match handoff",
      );
    }
    if (
      request.bscNetwork !== handoff.bscNetwork ||
      request.chain !== handoff.chain ||
      request.chainIdHex !== handoff.chainIdHex ||
      normalizeHex32(request.networkIdHex) !==
        normalizeHex32(handoff.networkIdHex)
    ) {
      problems.push(
        "referenced Groth16 attestation request package network binding does not match handoff",
      );
    }
    if (request.verifierKeyHash !== handoff.verifierKeyHash) {
      problems.push(
        "referenced Groth16 attestation request package verifierKeyHash does not match handoff",
      );
    }
    if (request.manifestSha256 !== handoff.manifestSha256) {
      problems.push(
        "referenced Groth16 attestation request package manifest.sha256 does not match handoff manifest.sha256",
      );
    }
    if (
      request.manifestProductionReady !== handoff.manifestProductionReady ||
      request.manifestProductionBlockerCount !==
        handoff.manifestProductionBlockerCount
    ) {
      problems.push(
        "referenced Groth16 attestation request package manifest readiness does not match handoff",
      );
    }
    if (request.allRolesReady !== handoff.allRolesReady) {
      problems.push(
        "referenced Groth16 attestation request package role readiness does not match handoff",
      );
    }
    if (!handoffRequestReadinessMatches(handoff, request)) {
      problems.push(
        "referenced Groth16 attestation request package per-role readiness does not match handoff",
      );
    }
    if (request.referencedManifestVerified !== true) {
      problems.push(
        "referenced Groth16 attestation request package is not bound to its scanned manifest",
      );
    }
  }
  if (!matchingManifest?.groth16MaterialManifest) {
    problems.push(
      "referenced Groth16 material manifest sha256 was not found in the scanned inventory",
    );
  } else {
    const manifest = matchingManifest.groth16MaterialManifest;
    if (
      manifest.routeId !== handoff.routeId ||
      manifest.assetKey !== handoff.assetKey
    ) {
      problems.push(
        "referenced Groth16 material manifest route or asset does not match handoff",
      );
    }
    if (
      manifest.bscNetwork !== handoff.bscNetwork ||
      manifest.chain !== handoff.chain ||
      manifest.chainIdHex !== handoff.chainIdHex ||
      normalizeHex32(manifest.networkIdHex) !==
        normalizeHex32(handoff.networkIdHex)
    ) {
      problems.push(
        "referenced Groth16 material manifest network binding does not match handoff",
      );
    }
    if (manifest.verifierKeyHash !== handoff.verifierKeyHash) {
      problems.push(
        "referenced Groth16 material manifest verifierKeyHash does not match handoff",
      );
    }
    if (
      manifest.productionReady !== handoff.manifestProductionReady ||
      manifest.productionBlockerCount !== handoff.manifestProductionBlockerCount
    ) {
      problems.push(
        "referenced Groth16 material manifest readiness does not match handoff",
      );
    }
  }
  return problems.length === 0
    ? {
        ...entry,
        groth16AttestationHandoff: {
          ...entry.groth16AttestationHandoff,
          referencedRequestVerified: true,
          referencedManifestVerified: true,
          publicDeploymentMatches:
            entry.groth16AttestationHandoff.publicDeploymentMatches === true &&
            matchingRequest.groth16AttestationRequestPackage
              ?.publicDeploymentMatches === true,
        },
      }
    : {
        ...entry,
        groth16AttestationHandoff: {
          ...entry.groth16AttestationHandoff,
          valid: false,
          referencedRequestVerified: Boolean(
            matchingRequest?.groth16AttestationRequestPackage,
          ),
          referencedManifestVerified: Boolean(
            matchingManifest?.groth16MaterialManifest,
          ),
          publicDeploymentMatches: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "invalid-groth16-attestation-handoff",
            `BSC Groth16 attestation handoff is not bound to scanned request/material packages: ${problems.join("; ")}.`,
          ),
        ],
      };
};

const proofSelfTestReportMaterialManifestMatches = (
  reportEntry,
  manifestEntry,
) =>
  reportEntry.groth16ProofSelfTestReport?.proofArtifactHash ===
    manifestEntry.groth16MaterialManifest?.proofArtifactHash &&
  reportEntry.groth16ProofSelfTestReport?.provingKeyHash ===
    manifestEntry.groth16MaterialManifest?.provingKeyHash &&
  reportEntry.groth16ProofSelfTestReport?.bscVerifierKeyArtifactHash ===
    manifestEntry.groth16MaterialManifest?.bscVerifierKeyArtifactHash &&
  reportEntry.groth16ProofSelfTestReport?.snarkjsVerificationKeyHash ===
    manifestEntry.groth16MaterialManifest?.snarkjsVerificationKeyHash;

const verifyGroth16ProofSelfTestReportBinding = (entry, routeBoundFiles) => {
  if (
    entry.kind !== "groth16-proof-self-test-report" ||
    entry.groth16ProofSelfTestReport?.valid !== true
  ) {
    return entry;
  }
  const report = entry.groth16ProofSelfTestReport;
  const matchingManifest = routeBoundFiles.find(
    (candidate) =>
      candidate.kind === "groth16-material-manifest" &&
      candidate.sha256 === report.manifestSha256,
  );
  const problems = [];
  if (!matchingManifest?.groth16MaterialManifest) {
    problems.push(
      "referenced Groth16 material manifest sha256 was not found in the scanned inventory",
    );
  } else {
    const manifest = matchingManifest.groth16MaterialManifest;
    if (!proofSelfTestReportMaterialManifestMatches(entry, matchingManifest)) {
      problems.push(
        "referenced Groth16 material manifest hashes do not match proof self-test report artifacts",
      );
    }
    if (report.manifestProductionReady !== manifest.productionReady) {
      problems.push(
        "proof self-test report manifest.productionReady must match referenced manifest",
      );
    }
    if (
      report.manifestProductionBlockerCount !== manifest.productionBlockerCount
    ) {
      problems.push(
        "proof self-test report manifest.productionBlockers must match referenced manifest",
      );
    }
    if (
      manifest.valid !== true ||
      manifest.productionReady !== true ||
      manifest.productionBlockerCount !== 0 ||
      matchingManifest.findings.some((item) => item.severity === "critical")
    ) {
      problems.push(
        "referenced Groth16 material manifest must be clean and productionReady",
      );
    }
  }
  return problems.length === 0
    ? {
        ...entry,
        groth16ProofSelfTestReport: {
          ...entry.groth16ProofSelfTestReport,
          referencedManifestVerified: true,
          publicDeploymentMatches:
            entry.groth16ProofSelfTestReport.publicDeploymentMatches === true &&
            matchingManifest.groth16MaterialManifest
              ?.publicDeploymentMatches === true,
        },
      }
    : {
        ...entry,
        groth16ProofSelfTestReport: {
          ...entry.groth16ProofSelfTestReport,
          valid: false,
          referencedManifestVerified: false,
          publicDeploymentMatches: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "invalid-groth16-proof-self-test-report",
            `BSC Groth16 proof self-test report is not bound to scanned production material: ${problems.join("; ")}.`,
          ),
        ],
      };
};

const verifyRouteBoundNativeProverReportAttestationBinding = async (
  entry,
  routeBoundFiles,
  scanPaths,
) => {
  if (
    entry.kind !== "native-prover-bundle" ||
    entry.nativeProverBundle?.valid !== true ||
    entry.nativeProverBundle?.artifactsVerified !== true
  ) {
    return entry;
  }
  const descriptor = entry._nativeProverBundleDescriptor;
  if (!descriptor) {
    return entry;
  }
  const matchingMaterialHashes = new Set(
    routeBoundFiles
      .filter(
        (candidate) =>
          candidate.kind === "groth16-material-manifest" &&
          candidate.groth16MaterialManifest?.valid === true &&
          candidate.groth16MaterialManifest?.productionReady === true &&
          candidate.groth16MaterialManifest?.productionBlockerCount === 0 &&
          candidate.groth16MaterialManifest?.publicDeploymentMatches === true &&
          candidate.findings.every((item) => item.severity !== "critical") &&
          nativeProverBundleMaterialManifestMatches(entry, candidate),
      )
      .map((candidate) => candidate.sha256)
      .filter(Boolean),
  );
  if (matchingMaterialHashes.size === 0) {
    return entry;
  }
  const expectedParityHashes = new Set(
    [...matchingMaterialHashes].map((manifestHash) =>
      nativeReportProductionAttestationHashForManifest(
        "cross-sdk-parity",
        manifestHash,
      ),
    ),
  );
  const expectedSelfTestHashes = new Set(
    [...matchingMaterialHashes].map((manifestHash) =>
      nativeReportProductionAttestationHashForManifest(
        "native-prover-self-test",
        manifestHash,
      ),
    ),
  );
  const problems = [];
  try {
    const parityReport = await readNativeProverBundleJsonArtifact({
      descriptor,
      entry,
      artifactPath: nativeProverBundleParityArtifactPath(descriptor),
      scanPaths,
      label: "crossSdkParityArtifact",
    });
    const parityHash = nativeReportProductionAttestationHash(
      parityReport,
      "crossSdkParityArtifact",
    );
    if (!expectedParityHashes.has(parityHash)) {
      problems.push(
        "crossSdkParityArtifact production_attestation_hash must be role-derived from a signed route-bound Groth16 material manifest sha256",
      );
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  try {
    const selfTestReport = await readNativeProverBundleJsonArtifact({
      descriptor,
      entry,
      artifactPath: nativeProverBundleSelfTestArtifactPath(descriptor),
      scanPaths,
      label: "nativeProverSelfTestArtifact",
    });
    const selfTestHash = nativeReportProductionAttestationHash(
      selfTestReport,
      "nativeProverSelfTestArtifact",
    );
    if (!expectedSelfTestHashes.has(selfTestHash)) {
      problems.push(
        "nativeProverSelfTestArtifact production_attestation_hash must be role-derived from a signed route-bound Groth16 material manifest sha256",
      );
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems.length === 0
    ? entry
    : {
        ...entry,
        nativeProverBundle: {
          ...entry.nativeProverBundle,
          artifactsVerified: false,
        },
        findings: [
          ...entry.findings,
          finding(
            "critical",
            "unverified-native-evm-prover-artifacts",
            `BSC native EVM prover bundle reports are not bound to signed Groth16 material: ${problems.join("; ")}.`,
          ),
        ],
      };
};

const verifyScannedNativeProverBundleArtifacts = async (
  entry,
  scanPaths,
  bscProfile = resolveBscNetworkProfile("testnet"),
) => {
  const descriptor = entry._nativeProverBundleDescriptor;
  if (!descriptor || entry.nativeProverBundle?.valid !== true) {
    return entry;
  }
  const verifiedSdks = [];
  const problems = [];
  const sdkRows = Array.isArray(descriptor.nativeSdkArtifacts)
    ? descriptor.nativeSdkArtifacts
    : [];
  try {
    await verifyNativeProverParityProductionSchema({
      descriptor,
      entry,
      scanPaths,
      bscProfile,
    });
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  for (const artifact of sdkRows) {
    try {
      const verifyBundleArtifacts =
        bscProfile.key === "mainnet"
          ? verifyBscMainnetNativeEvmProverArtifactsFromBundle
          : verifyBscTestnetNativeEvmProverArtifactsFromBundle;
      const result = await verifyBundleArtifacts(
        {
          nativeProverBundle: descriptor,
          sdk: artifact.sdk,
          artifactResolver(pathName) {
            return readNativeProverBundleArtifact({
              bundlePath: entry._filePath,
              artifactPath: pathName,
              scanPaths,
            });
          },
        },
        {
          expectedDestinationBindingHash: descriptor.destinationBindingHash,
        },
      );
      verifiedSdks.push(result.sdk);
    } catch (error) {
      problems.push(
        `${artifact.sdk}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const artifactsVerified =
    sdkRows.length > 0 &&
    problems.length === 0 &&
    verifiedSdks.length === sdkRows.length;
  return {
    ...entry,
    nativeProverBundle: {
      ...entry.nativeProverBundle,
      artifactsVerified,
      verifiedSdks,
    },
    findings: artifactsVerified
      ? entry.findings
      : [
          ...entry.findings,
          finding(
            "critical",
            "unverified-native-evm-prover-artifacts",
            `BSC native EVM prover bundle does not resolve to verified SDK artifact bytes: ${problems.join("; ")}.`,
          ),
        ],
  };
};

const annotatePublicRouteBinding = (entry, deployment, routeReport = null) => {
  const verifierKeyHash = normalizeHex32(deployment?.verifierKeyHash);
  const proofArtifactHash = normalizeHex32(deployment?.proofArtifactHash);
  const provingKeyHash = normalizeHex32(deployment?.provingKeyHash);
  const expectedProofHash = entry.proofFile?.isProvingKey
    ? provingKeyHash
    : entry.proofFile?.isProofArtifact
      ? proofArtifactHash
      : null;
  return {
    ...entry,
    route: entry.route
      ? {
          ...entry.route,
          publicDeploymentMatches: routeArtifactMatchesPublicDeployment(
            entry.route,
            deployment,
          ),
        }
      : undefined,
    verifier: entry.verifier
      ? {
          ...entry.verifier,
          expectedVerifierKeyHash: verifierKeyHash,
          hashMatchesPublicRoute:
            Boolean(verifierKeyHash) &&
            normalizeHex32(entry.verifier.verifierKeyHash) === verifierKeyHash,
        }
      : undefined,
    nativeProverBundle: entry.nativeProverBundle
      ? {
          ...entry.nativeProverBundle,
          publicDeploymentMatches: nativeProverBundleMatchesPublicDeployment(
            entry.nativeProverBundle,
            deployment,
          ),
        }
      : undefined,
    groth16AttestationRequestPackage: entry.groth16AttestationRequestPackage
      ? {
          ...entry.groth16AttestationRequestPackage,
          publicDeploymentMatches:
            groth16AttestationRequestMatchesPublicDeployment(
              entry.groth16AttestationRequestPackage,
              deployment,
            ),
        }
      : undefined,
    groth16AttestationHandoff: entry.groth16AttestationHandoff
      ? {
          ...entry.groth16AttestationHandoff,
          publicDeploymentMatches:
            groth16AttestationHandoffMatchesPublicDeployment(
              entry.groth16AttestationHandoff,
              deployment,
            ),
        }
      : undefined,
    groth16MaterialManifest: entry.groth16MaterialManifest
      ? {
          ...entry.groth16MaterialManifest,
          publicDeploymentMatches:
            groth16MaterialManifestMatchesPublicDeployment(
              entry.groth16MaterialManifest,
              deployment,
            ),
        }
      : undefined,
    groth16ProofSelfTestReport: entry.groth16ProofSelfTestReport
      ? {
          ...entry.groth16ProofSelfTestReport,
          publicDeploymentMatches:
            groth16ProofSelfTestReportMatchesPublicDeployment(
              entry.groth16ProofSelfTestReport,
              deployment,
            ),
        }
      : undefined,
    offlineFullTomlEvidence: entry.offlineFullTomlEvidence
      ? {
          ...entry.offlineFullTomlEvidence,
          publicPostDeployMatches:
            offlineFullTomlEvidenceMatchesPublicPostDeploy(
              entry.offlineFullTomlEvidence,
              routeReport,
            ),
        }
      : undefined,
    deploymentEvidence: entry.deploymentEvidence
      ? {
          ...entry.deploymentEvidence,
          publicDeploymentMatches: deploymentEvidenceMatchesPublicDeployment(
            entry.deploymentEvidence,
            deployment,
          ),
        }
      : undefined,
    proofFile:
      entry.proofFile?.isProofArtifact || entry.proofFile?.isProvingKey
        ? {
            ...entry.proofFile,
            expectedHash: expectedProofHash,
            hashMatchesPublicRoute:
              Boolean(expectedProofHash) && entry.sha256 === expectedProofHash,
          }
        : entry.proofFile,
  };
};

const annotateTairaBurnRecordContractBinding = (entries) => {
  const routeBurnRecordArtifactHashes = new Set(
    entries
      .filter(
        (entry) =>
          entry.route?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
          entry.route?.assetKey === SCCP_BSC_XOR_ASSET_KEY,
      )
      .map((entry) => normalizeHex32(entry.route?.burnRecordArtifactSha256))
      .filter(Boolean),
  );
  return entries.map((entry) =>
    entry.tairaBurnRecordContract
      ? {
          ...entry,
          tairaBurnRecordContract: {
            ...entry.tairaBurnRecordContract,
            routeArtifactHashMatches:
              Boolean(entry.tairaBurnRecordContract.artifactSha256) &&
              routeBurnRecordArtifactHashes.has(
                normalizeHex32(entry.tairaBurnRecordContract.artifactSha256),
              ),
          },
        }
      : entry,
  );
};

const verifyRouteBoundVerifierMaterialBinding = (entry) => {
  if (!entry.verifier) {
    return entry;
  }
  const expectedVerifierKeyHash = normalizeHex32(
    entry.verifier.expectedVerifierKeyHash,
  );
  const verifierKeyHash = normalizeHex32(entry.verifier.verifierKeyHash);
  if (
    !expectedVerifierKeyHash ||
    !verifierKeyHash ||
    entry.verifier.hashMatchesPublicRoute === true
  ) {
    return entry;
  }
  return {
    ...entry,
    findings: [
      ...entry.findings,
      finding(
        "critical",
        "route-verifier-key-hash-mismatch",
        "BSC verifier material verifierKeyHash does not match the public route verifierKeyHash.",
      ),
    ],
  };
};

const readJsonReport = async (filePath, label) => {
  if (!trim(filePath)) {
    return null;
  }
  try {
    const resolved = path.resolve(filePath);
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error(`${resolved} must not be a symbolic link`);
    }
    if (!info.isFile()) {
      throw new Error(`${resolved} must be a regular file`);
    }
    if (info.size > SCCP_BSC_MATERIAL_ROUTE_REPORT_MAX_BYTES) {
      throw new Error(
        `${resolved} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_MATERIAL_ROUTE_REPORT_MAX_BYTES} bytes`,
      );
    }
    const parsed = parseJsonWithoutDuplicateKeys(
      await readFile(resolved, "utf8"),
      `${label} ${resolved}`,
    );
    if (!isRecord(parsed)) {
      throw new Error(`${resolved} must be a JSON object`);
    }
    return parsed;
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

export const evaluateBscSccpProductionMaterialInventory = async (
  input = {},
) => {
  const scanPaths = ownValue(input, "scanPaths");
  const routeReport = ownValue(input, "routeReport") ?? null;
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const destinationModuleUrl = ownValue(input, "destinationModuleUrl");
  const sourceModuleUrl = ownValue(input, "sourceModuleUrl");
  const runtimeProverConfigUrl = ownValue(input, "runtimeProverConfigUrl");
  const destinationSidecarPath =
    ownValue(input, "destinationSidecarPath") ?? "";
  const sourceSidecarPath = ownValue(input, "sourceSidecarPath") ?? "";
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  const generatedAt =
    ownValue(input, "generatedAt") ?? new Date().toISOString();
  const maxFiles = ownValue(input, "maxFiles") ?? MAX_SCAN_FILES;
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const routeReportRecord = isRecord(routeReport)
    ? ownJsonRecord(routeReport)
    : routeReport;
  const routeDeployment = publicRouteDeployment(routeReportRecord);
  const activeDestinationModuleUrl =
    trim(destinationModuleUrl) ||
    trim(ownValue(routeDeployment?.destinationBrowserProver, "moduleUrl")) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
    );
  const activeSourceModuleUrl =
    trim(sourceModuleUrl) ||
    trim(ownValue(routeDeployment?.sourceBrowserProver, "moduleUrl")) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
    );
  const activeRuntimeProverConfigUrl =
    trim(runtimeProverConfigUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
    );
  const explicitScanPaths = parseList(scanPaths);
  const normalizedScanPaths = explicitScanPaths.length
    ? explicitScanPaths
    : bscSccpProductionMaterialScanPaths(bscProfile.key);
  const fileCollection = await collectFiles(normalizedScanPaths, maxFiles);
  const files = fileCollection.files;
  const scannedFiles = [];
  for (const file of files) {
    scannedFiles.push(await scanOneFile(file, bscProfile));
  }
  const nativeArtifactVerifiedFiles = [];
  for (const entry of scannedFiles) {
    nativeArtifactVerifiedFiles.push(
      await verifyScannedNativeProverBundleArtifacts(
        entry,
        normalizedScanPaths,
        bscProfile,
      ),
    );
  }
  const routeProofArtifactHash = normalizeHex32(
    routeDeployment?.proofArtifactHash,
  );
  const routeProvingKeyHash = normalizeHex32(routeDeployment?.provingKeyHash);
  let routeBoundFiles = nativeArtifactVerifiedFiles.map((entry) =>
    annotatePublicRouteBinding(entry, routeDeployment, routeReportRecord),
  );
  routeBoundFiles = annotateTairaBurnRecordContractBinding(routeBoundFiles);
  routeBoundFiles = routeBoundFiles.map((entry) =>
    verifyRouteBoundVerifierMaterialBinding(entry),
  );
  routeBoundFiles = await Promise.all(
    routeBoundFiles.map((entry) =>
      verifyGroth16MaterialReferencedTranscripts(entry, normalizedScanPaths),
    ),
  );
  routeBoundFiles = await Promise.all(
    routeBoundFiles.map((entry) =>
      verifyGroth16MaterialReferencedAttestations(
        entry,
        normalizedScanPaths,
        bscProfile,
      ),
    ),
  );
  routeBoundFiles = routeBoundFiles.map((entry) =>
    verifyGroth16AttestationRequestPackageBinding(entry, routeBoundFiles),
  );
  routeBoundFiles = routeBoundFiles.map((entry) =>
    verifyGroth16AttestationHandoffBinding(entry, routeBoundFiles),
  );
  routeBoundFiles = routeBoundFiles.map((entry) =>
    verifyGroth16ProofSelfTestReportBinding(entry, routeBoundFiles),
  );
  routeBoundFiles = await Promise.all(
    routeBoundFiles.map((entry) =>
      verifyRouteBoundNativeProverReportAttestationBinding(
        entry,
        routeBoundFiles,
        normalizedScanPaths,
      ),
    ),
  );

  const destinationProver = await evaluateConfiguredBrowserProver({
    direction: "destination",
    moduleUrl: activeDestinationModuleUrl,
    sidecarPath: destinationSidecarPath,
    routeReport: routeReportRecord,
    bscProfile,
  });
  const sourceProver = await evaluateConfiguredBrowserProver({
    direction: "source",
    moduleUrl: activeSourceModuleUrl,
    sidecarPath: sourceSidecarPath,
    routeReport: routeReportRecord,
    bscProfile,
  });
  const runtimeProverConfig = await evaluateConfiguredRuntimeProverConfig({
    runtimeProverConfigUrl: activeRuntimeProverConfigUrl,
    destinationModuleUrl: activeDestinationModuleUrl,
    sourceModuleUrl: activeSourceModuleUrl,
    routeReport: routeReportRecord,
    bscProfile,
    fetchImpl,
    timeoutMs,
  });

  const checks = [];
  check(
    checks,
    "material-scan-complete",
    !fileCollection.truncated,
    "BSC production material inventory scanned all matching artifact files.",
    fileCollection.truncated
      ? `scan discovered more than ${fileCollection.maxFiles} matching files; production readiness requires a complete inventory.`
      : "",
  );
  const unavailableScanRoots = fileCollection.scanRootStatuses.filter(
    (entry) => entry.ok !== true,
  );
  check(
    checks,
    "scan-root-availability",
    normalizedScanPaths.length > 0 && unavailableScanRoots.length === 0,
    "BSC production material inventory scan roots are present and readable.",
    normalizedScanPaths.length === 0
      ? "No BSC production material scan roots were configured."
      : unavailableScanRoots
          .map(
            (entry) =>
              `${entry.path}: ${entry.kind}${entry.detail ? ` (${entry.detail})` : ""}`,
          )
          .join("; "),
  );
  const criticalFindings = routeBoundFiles.flatMap((entry) =>
    entry.findings
      .filter((item) => item.severity === "critical")
      .map((item) => findingDetail(entry, item)),
  );
  const warningFindings = routeBoundFiles.flatMap((entry) =>
    entry.findings
      .filter((item) => item.severity === "warning")
      .map((item) => findingDetail(entry, item)),
  );
  check(
    checks,
    "artifact-secret-and-diagnostic-scan",
    criticalFindings.length === 0,
    "Scanned BSC SCCP artifacts do not contain secret, diagnostic, or placeholder production material.",
    criticalFindings.join("; "),
  );

  const productionRequirementsArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "production-requirements" &&
      entry.productionRequirements?.valid === true &&
      entry.productionRequirements?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.productionRequirements?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.productionRequirements?.bscNetwork === bscProfile.key &&
      entry.productionRequirements?.contractHash ===
        bscProductionRequirementsContractHash(bscProfile.key) &&
      entry.productionRequirements?.expectedContractHash ===
        bscProductionRequirementsContractHash(bscProfile.key) &&
      entry.productionRequirements?.contractMatchesExpected === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  check(
    checks,
    "production-requirements-artifact",
    productionRequirementsArtifacts.length > 0,
    "At least one scanned BSC production requirements artifact is route-bound.",
    "No clean BSC production requirements artifact was found.",
  );

  const cleanContractArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "contract-artifact" &&
      entry.contractArtifact?.valid === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const compiledContractKeys = new Set(
    cleanContractArtifacts.map((entry) => entry.contractArtifact?.key),
  );
  const missingCompiledContracts = Object.keys(
    BSC_COMPILED_CONTRACT_ARTIFACTS,
  ).filter((key) => !compiledContractKeys.has(key));
  check(
    checks,
    "compiled-contract-artifacts",
    missingCompiledContracts.length === 0,
    "BSC SCCP deploy contract artifacts are compiled and hash-checked.",
    missingCompiledContracts.length > 0
      ? `Missing clean compiled contract artifacts: ${missingCompiledContracts.join(", ")}.`
      : "",
  );

  const cleanDeploymentEvidenceArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "deployment-evidence" &&
      entry.deploymentEvidence?.valid === true &&
      entry.deploymentEvidence?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.deploymentEvidence?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.deploymentEvidence?.bscNetwork === bscProfile.key &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionDeploymentEvidenceArtifacts =
    cleanDeploymentEvidenceArtifacts.filter(
      (entry) => entry.deploymentEvidence?.publicDeploymentMatches === true,
    );
  check(
    checks,
    "deployment-evidence-artifact",
    productionDeploymentEvidenceArtifacts.length > 0,
    "At least one scanned BSC deployment evidence artifact is clean and route-bound.",
    cleanDeploymentEvidenceArtifacts.length === 0
      ? "No clean BSC deployment evidence artifact was found."
      : "No clean BSC deployment evidence artifact matched the public route deployment.",
  );

  const cleanProductionRouteArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "route" &&
      entry.route?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.route?.productionReady === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionRouteArtifacts = cleanProductionRouteArtifacts.filter(
    (entry) =>
      entry.route?.publicDeploymentMatches === true &&
      routeArtifactMatchesPublicPostDeploy(entry.route, routeReportRecord),
  );
  check(
    checks,
    "production-route-artifact",
    productionRouteArtifacts.length > 0,
    "At least one scanned production-ready BSC route artifact is clean.",
    cleanProductionRouteArtifacts.length === 0
      ? "No clean production-ready BSC route artifact was found."
      : "No clean production-ready BSC route artifact matched the public route deployment hashes and post-deploy live evidence.",
  );
  const cleanRouteManifestPublicationArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "route-manifest-isi" &&
      entry.routeManifestUpsertIsi?.valid === true &&
      entry.routeManifestUpsertIsi?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.routeManifestUpsertIsi?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.routeManifestUpsertIsi?.chain === bscProfile.chain &&
      entry.routeManifestUpsertIsi?.chainIdHex === bscProfile.chainIdHex &&
      entry.routeManifestUpsertIsi?.networkIdHex === bscProfile.networkIdHex &&
      entry.routeManifestUpsertIsi?.productionReady === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const appliedRouteManifestPublicationArtifacts =
    cleanRouteManifestPublicationArtifacts.filter(
      (entry) =>
        entry.routeManifestUpsertIsi?.submission?.submitted === true &&
        entry.routeManifestUpsertIsi?.submission?.statusKind === "Applied" &&
        Boolean(
          normalizeTransactionHash(
            entry.routeManifestUpsertIsi?.submission?.submittedHash,
          ),
        ),
    );
  check(
    checks,
    "route-manifest-publication-evidence",
    appliedRouteManifestPublicationArtifacts.length > 0,
    "At least one applied TAIRA route-manifest publication artifact is clean and route-bound.",
    cleanRouteManifestPublicationArtifacts.length === 0
      ? "No clean route-bound BSC route-manifest publication artifact was found."
      : "No clean route-bound BSC route-manifest publication artifact carried an applied TAIRA submission.",
  );
  const cleanOfflineFullTomlEvidenceArtifacts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "offline-full-toml-evidence" &&
      entry.offlineFullTomlEvidence?.valid === true &&
      entry.offlineFullTomlEvidence?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.offlineFullTomlEvidence?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.offlineFullTomlEvidence?.bscNetwork === bscProfile.key &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionOfflineFullTomlEvidenceArtifacts =
    cleanOfflineFullTomlEvidenceArtifacts.filter(
      (entry) =>
        entry.offlineFullTomlEvidence?.publicPostDeployMatches === true,
    );
  const publicOfflineFullTomlSha256 = normalizeHex32(
    publicPostDeployLiveEvidence(routeReportRecord)?.offlineFullTomlSha256,
  );
  check(
    checks,
    "offline-full-toml-evidence-artifact",
    productionOfflineFullTomlEvidenceArtifacts.length > 0,
    "At least one generated offline full-TOML evidence artifact is route-bound.",
    !publicOfflineFullTomlSha256
      ? "route offlineFullTomlSha256 is missing or invalid."
      : cleanOfflineFullTomlEvidenceArtifacts.length === 0
        ? "No clean offline full-TOML evidence artifact was found."
        : "No clean offline full-TOML evidence artifact matched the public route post-deploy evidence.",
  );
  const burnRecordFindings = routeBoundFiles.flatMap((entry) =>
    entry.findings
      .filter((item) => item.id === "production-ready-placeholder-burn-record")
      .map((item) => `${entry.path}: ${item.message}`),
  );
  const productionBurnRecordArtifacts = productionRouteArtifacts.filter(
    (entry) =>
      (entry.route?.burnRecordArtifactProductionProblems ?? []).length === 0,
  );
  const productionTairaBurnRecordContracts = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "taira-burn-record-contract" &&
      entry.tairaBurnRecordContract?.valid === true &&
      entry.tairaBurnRecordContract?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.tairaBurnRecordContract?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.tairaBurnRecordContract?.routeArtifactHashMatches === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  check(
    checks,
    "production-burn-record-material",
    productionBurnRecordArtifacts.length > 0 ||
      productionTairaBurnRecordContracts.length > 0,
    "At least one route-bound production-ready BSC route artifact or standalone TAIRA burn-record contract carries production-shaped TAIRA burn-record material.",
    burnRecordFindings.length > 0
      ? burnRecordFindings.join("; ")
      : "No route-bound production-ready BSC route artifact or route-referenced standalone TAIRA burn-record contract with valid TAIRA burn-record material was found.",
  );

  const cleanProductionVerifierMaterials = routeBoundFiles.filter(
    (entry) =>
      entry.verifier &&
      !isNativeProverSupportVerifierFile(entry) &&
      normalizeHex32(entry.verifier?.verifierKeyHash) &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionVerifierMaterials = cleanProductionVerifierMaterials.filter(
    (entry) => entry.verifier?.hashMatchesPublicRoute === true,
  );
  const productionVerifierArtifacts = productionVerifierMaterials.filter(
    (entry) => entry.kind === "verifier",
  );
  const routeVerifierKeyHash = normalizeHex32(routeDeployment?.verifierKeyHash);
  check(
    checks,
    "production-verifier-material",
    productionVerifierMaterials.length > 0,
    "At least one scanned BSC verifier artifact is production-shaped.",
    !routeVerifierKeyHash
      ? "route verifierKeyHash is missing or invalid."
      : cleanProductionVerifierMaterials.length === 0
        ? "No clean production verifier material was found."
        : "No clean production verifier material matched the public route verifierKeyHash.",
  );

  const sourceParityAttestations = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "source-parity-attestation" &&
      entry.sourceParityAttestation?.valid === true &&
      entry.sourceParityAttestation?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.sourceParityAttestation?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.sourceParityAttestation?.bscNetwork === bscProfile.key &&
      entry.sourceParityAttestation?.sourceTreeHashMatches === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  check(
    checks,
    "source-parity-attestation",
    sourceParityAttestations.length > 0,
    "At least one BSC native EVM source-parity attestation is route-bound and SDK-complete.",
    "No clean BSC native EVM source-parity attestation was found.",
  );

  const cleanGroth16MaterialManifests = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "groth16-material-manifest" &&
      entry.groth16MaterialManifest?.valid === true &&
      entry.groth16MaterialManifest?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.groth16MaterialManifest?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.groth16MaterialManifest?.bscNetwork === bscProfile.key &&
      entry.groth16MaterialManifest?.productionReady === true &&
      entry.groth16MaterialManifest?.productionBlockerCount === 0 &&
      entry.groth16MaterialManifest?.circuitProfile ===
        BSC_FULL_SCCP_CIRCUIT_PROFILE &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionGroth16MaterialManifests =
    cleanGroth16MaterialManifests.filter(
      (entry) =>
        entry.groth16MaterialManifest?.publicDeploymentMatches === true,
    );
  check(
    checks,
    "groth16-material-manifest",
    productionGroth16MaterialManifests.length > 0,
    `At least one productionReady ${bscProfile.label} Groth16 material manifest is bound to the public route verifier/proof/proving hashes.`,
    cleanGroth16MaterialManifests.length === 0
      ? `No clean productionReady ${bscProfile.label} Groth16 material manifest was found.`
      : "No clean Groth16 material manifest matched the public route verifier/proof/proving hashes.",
  );
  const cleanGroth16AttestationRequestPackages = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "groth16-attestation-request-package" &&
      entry.groth16AttestationRequestPackage?.valid === true &&
      entry.groth16AttestationRequestPackage?.routeId ===
        SCCP_BSC_XOR_ROUTE_ID &&
      entry.groth16AttestationRequestPackage?.assetKey ===
        SCCP_BSC_XOR_ASSET_KEY &&
      entry.groth16AttestationRequestPackage?.bscNetwork === bscProfile.key &&
      entry.groth16AttestationRequestPackage?.allRolesReady === true &&
      entry.groth16AttestationRequestPackage?.referencedManifestVerified ===
        true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionGroth16AttestationRequestPackages =
    cleanGroth16AttestationRequestPackages.filter(
      (entry) =>
        entry.groth16AttestationRequestPackage?.publicDeploymentMatches ===
        true,
    );
  const routeBoundGroth16AttestationRequestPackages = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "groth16-attestation-request-package" &&
      entry.groth16AttestationRequestPackage?.valid === true &&
      entry.groth16AttestationRequestPackage?.routeId ===
        SCCP_BSC_XOR_ROUTE_ID &&
      entry.groth16AttestationRequestPackage?.assetKey ===
        SCCP_BSC_XOR_ASSET_KEY &&
      entry.groth16AttestationRequestPackage?.bscNetwork === bscProfile.key &&
      entry.groth16AttestationRequestPackage?.referencedManifestVerified ===
        true &&
      entry.groth16AttestationRequestPackage?.publicDeploymentMatches === true,
  );
  const readyGroth16AttestationRequestPackages =
    routeBoundGroth16AttestationRequestPackages.filter(
      (entry) => entry.groth16AttestationRequestPackage?.allRolesReady === true,
    );
  const blockedGroth16AttestationRoles =
    routeBoundGroth16AttestationRequestPackages.flatMap((entry) =>
      Object.values(entry.groth16AttestationRequestPackage?.roles ?? {})
        .filter((role) => role?.readyForSignature !== true)
        .map((role) => {
          const blockers = Array.isArray(role?.blockers)
            ? role.blockers.filter(Boolean)
            : [];
          const blockerDetail = blockers.length
            ? blockers.slice(0, 4).join(", ")
            : "not ready";
          const overflow =
            blockers.length > 4 ? `, +${blockers.length - 4} more` : "";
          return `${entry.path}: ${role?.key ?? "unknown"} not ready (${blockerDetail}${overflow})`;
        }),
    );
  check(
    checks,
    "groth16-attestation-role-readiness",
    readyGroth16AttestationRequestPackages.length > 0,
    "Groth16 attestation request roles are all ready for signature.",
    routeBoundGroth16AttestationRequestPackages.length === 0
      ? `No route-bound ${bscProfile.label} Groth16 attestation request package was found.`
      : blockedGroth16AttestationRoles.join("; "),
  );
  check(
    checks,
    "groth16-attestation-request-package",
    productionGroth16AttestationRequestPackages.length > 0,
    `At least one ${bscProfile.label} Groth16 attestation request package is bound to the production material manifest.`,
    cleanGroth16AttestationRequestPackages.length === 0
      ? `No clean ${bscProfile.label} Groth16 attestation request package was found.`
      : "No clean Groth16 attestation request package matched the public route verifier/proof/proving hashes.",
  );

  const cleanGroth16AttestationHandoffs = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "groth16-attestation-handoff" &&
      entry.groth16AttestationHandoff?.valid === true &&
      entry.groth16AttestationHandoff?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.groth16AttestationHandoff?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.groth16AttestationHandoff?.bscNetwork === bscProfile.key &&
      entry.groth16AttestationHandoff?.handoffComplete === true &&
      entry.groth16AttestationHandoff?.requestValid === true &&
      entry.groth16AttestationHandoff?.referencedRequestVerified === true &&
      entry.groth16AttestationHandoff?.referencedManifestVerified === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const routeBoundGroth16AttestationHandoffs =
    cleanGroth16AttestationHandoffs.filter(
      (entry) =>
        entry.groth16AttestationHandoff?.publicDeploymentMatches === true,
    );
  check(
    checks,
    "groth16-attestation-handoff",
    routeBoundGroth16AttestationHandoffs.length > 0,
    `At least one ${bscProfile.label} Groth16 attestation handoff bundle is bound to a scanned request package and material manifest.`,
    cleanGroth16AttestationHandoffs.length === 0
      ? `No clean ${bscProfile.label} Groth16 attestation handoff bundle was found.`
      : "No clean Groth16 attestation handoff bundle matched the public route verifier hash and request package.",
  );

  const cleanGroth16ProofSelfTestReports = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "groth16-proof-self-test-report" &&
      entry.groth16ProofSelfTestReport?.valid === true &&
      entry.groth16ProofSelfTestReport?.routeId === SCCP_BSC_XOR_ROUTE_ID &&
      entry.groth16ProofSelfTestReport?.assetKey === SCCP_BSC_XOR_ASSET_KEY &&
      entry.groth16ProofSelfTestReport?.bscNetwork === bscProfile.key &&
      entry.groth16ProofSelfTestReport?.manifestProductionReady === true &&
      entry.groth16ProofSelfTestReport?.manifestProductionBlockerCount === 0 &&
      entry.groth16ProofSelfTestReport?.referencedManifestVerified === true &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionGroth16ProofSelfTestReports =
    cleanGroth16ProofSelfTestReports.filter(
      (entry) =>
        entry.groth16ProofSelfTestReport?.publicDeploymentMatches === true,
    );
  check(
    checks,
    "groth16-proof-self-test-report",
    productionGroth16ProofSelfTestReports.length > 0,
    `At least one ${bscProfile.label} Groth16 proof self-test report is generated from a productionReady material manifest and bound to the public route proof/proving hashes.`,
    cleanGroth16ProofSelfTestReports.length === 0
      ? `No clean ${bscProfile.label} Groth16 proof self-test report was found.`
      : "No clean Groth16 proof self-test report matched the public route proof/proving hashes.",
  );

  const cleanNativeProverBundles = routeBoundFiles.filter(
    (entry) =>
      entry.kind === "native-prover-bundle" &&
      entry.nativeProverBundle?.valid === true &&
      entry.nativeProverBundle?.artifactsVerified === true &&
      entry.nativeProverBundle?.auditHashesProduction === true &&
      entry.nativeProverBundle?.auditHashIssueCount === 0 &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const productionNativeProverBundles = cleanNativeProverBundles.filter(
    (entry) => entry.nativeProverBundle?.publicDeploymentMatches === true,
  );
  check(
    checks,
    "native-evm-prover-bundle",
    productionNativeProverBundles.length > 0,
    `At least one SDK-validated ${bscProfile.label} native EVM prover bundle and artifact set matches the public route deployment.`,
    cleanNativeProverBundles.length === 0
      ? `No clean SDK-validated ${bscProfile.label} native EVM prover bundle with verified artifact bytes was found.`
      : "No clean native EVM prover bundle with verified artifact bytes matched the public route native descriptor/verifier/proof/proving/destination hashes.",
  );

  const proofArtifactCandidates = routeBoundFiles.filter(
    (entry) =>
      entry.proofFile?.isProofArtifact &&
      entry.proofFile?.productionSized &&
      entry.proofFile?.productionEntropy &&
      entry.proofFile?.productionFormat &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const provingKeyCandidates = routeBoundFiles.filter(
    (entry) =>
      entry.proofFile?.isProvingKey &&
      entry.proofFile?.productionSized &&
      entry.proofFile?.productionEntropy &&
      entry.proofFile?.productionFormat &&
      entry.findings.every((item) => item.severity !== "critical"),
  );
  const proofArtifacts = proofArtifactCandidates.filter(
    (entry) => entry.proofFile?.hashMatchesPublicRoute === true,
  );
  const provingKeys = provingKeyCandidates.filter(
    (entry) => entry.proofFile?.hashMatchesPublicRoute === true,
  );
  const browserProverSidecars = routeBoundFiles.filter(
    (entry) => entry.kind === "browser-prover-sidecar",
  );
  const proofFileProblems = [];
  if (!routeProofArtifactHash) {
    proofFileProblems.push("route proofArtifactHash is missing or invalid");
  } else if (proofArtifacts.length === 0) {
    proofFileProblems.push(
      proofArtifactCandidates.length > 0
        ? "proof artifact file hash does not match route proofArtifactHash"
        : "proof artifact file matching route proofArtifactHash is missing",
    );
  }
  if (!routeProvingKeyHash) {
    proofFileProblems.push("route provingKeyHash is missing or invalid");
  } else if (provingKeys.length === 0) {
    proofFileProblems.push(
      provingKeyCandidates.length > 0
        ? "proving key file hash does not match route provingKeyHash"
        : "proving key file matching route provingKeyHash is missing",
    );
  }
  check(
    checks,
    "production-proof-files",
    proofArtifacts.length > 0 && provingKeys.length > 0,
    "Production circuit/proof artifact files and proving-key files are present.",
    proofFileProblems.join("; "),
  );

  check(
    checks,
    "destination-browser-prover",
    destinationProver.ok,
    "TAIRA -> BSC browser prover module and sidecar are production-shaped.",
    destinationProver.detail,
  );
  check(
    checks,
    "source-browser-prover",
    sourceProver.ok,
    "BSC -> TAIRA browser source prover module and sidecar are production-shaped.",
    sourceProver.detail,
  );
  check(
    checks,
    "runtime-prover-config",
    runtimeProverConfig.ok,
    "BSC runtime prover config is either unnecessary or fully route-bound.",
    runtimeProverConfig.detail,
  );

  const routeProblems = [];
  if (!isRecord(routeReportRecord)) {
    routeProblems.push("route report is missing.");
  } else {
    const taira = ownValue(routeReportRecord, "taira");
    const bsc = ownValue(routeReportRecord, "bsc");
    if (trim(ownValue(routeReportRecord, "loadError"))) {
      routeProblems.push(ownValue(routeReportRecord, "loadError"));
    }
    if (ownValue(routeReportRecord, "ready") !== true) {
      routeProblems.push("route report is not ready.");
    }
    routeProblems.push(...routeReportCheckIntegrityProblems(routeReport));
    for (const id of requiredRouteCheckIds(bscProfile)) {
      if (!routeReportHasPassedCheck(routeReportRecord, id)) {
        routeProblems.push(`route report is missing passing ${id} check.`);
      }
    }
    if (ownValue(routeReportRecord, "manifestSource") !== "torii") {
      routeProblems.push("route report is not sourced from public TAIRA.");
    }
    if (
      ownValue(routeReportRecord, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
      ownValue(routeReportRecord, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
    ) {
      routeProblems.push("route report is not the TAIRA/BSC XOR route.");
    }
    if (
      ownValue(taira, "chainId") !== BSC_TAIRA_CHAIN_ID ||
      ownValue(taira, "networkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
    ) {
      routeProblems.push("route report is not bound to TAIRA.");
    }
    if (ownValue(bsc, "network") !== bscProfile.key) {
      routeProblems.push(
        `route report is not bound to ${bscProfile.label} network.`,
      );
    }
    if (ownValue(bsc, "chain") !== bscProfile.chain) {
      routeProblems.push(
        `route report is not bound to ${bscProfile.label} chain.`,
      );
    }
    if (ownValue(bsc, "chainIdHex") !== bscProfile.chainIdHex) {
      routeProblems.push(
        `route report is not bound to ${bscProfile.label} chain id.`,
      );
    }
    if (ownValue(bsc, "networkIdHex") !== bscProfile.networkIdHex) {
      routeProblems.push(`route report is not bound to ${bscProfile.label}.`);
    }
    if (ownValue(bsc, "explorerUrl") !== bscProfile.explorerUrl) {
      routeProblems.push(
        `route report explorerUrl is not bound to ${bscProfile.label}.`,
      );
    }
    if (ownValue(bsc, "explorerHost") !== bscProfile.explorerHost) {
      routeProblems.push(
        `route report explorerHost is not bound to ${bscProfile.label}.`,
      );
    }
    const deployment = routeDeployment;
    if (!deployment) {
      routeProblems.push("route deployment summary is missing.");
    } else {
      routeProblems.push(
        ...forbiddenBscRouteDeploymentAliasProblems(
          ownValue(routeReportRecord, "deployment"),
        ),
        ...roleSeparatedProductionHashProblems(deployment, "route deployment"),
        ...repeatedByteEvmAddressMaterialProblems(
          {
            bridgeAddress: deployment.bridgeAddress,
            tokenAddress: deployment.tokenAddress,
            sourceBridgeAddress: deployment.sourceBridgeAddress,
            verifierAddress: deployment.verifierAddress,
          },
          "route deployment",
        ),
      );
      for (const key of [
        "bridgeAddress",
        "tokenAddress",
        "sourceBridgeAddress",
        "verifierAddress",
      ]) {
        if (
          typeof deployment[key] !== "string" ||
          !EVM_ADDRESS.test(deployment[key]) ||
          /^0x0{40}$/iu.test(deployment[key])
        ) {
          routeProblems.push(`${key} is missing or invalid.`);
        }
      }
      for (const key of [
        "verifierCodeHash",
        "verifierKeyHash",
        "destinationBindingHash",
        "proofArtifactHash",
        "provingKeyHash",
        "nativeEvmProverBundleHash",
      ]) {
        if (!normalizeHex32(deployment[key])) {
          routeProblems.push(`${key} is missing or invalid.`);
        }
      }
    }
  }
  check(
    checks,
    "route-report-binding",
    routeProblems.length === 0,
    "Inventory is bound to a ready public TAIRA/BSC route report.",
    routeProblems.join("; "),
  );

  const initiallyReady = checks.every((entry) => entry.ok);
  const nextActions = initiallyReady
    ? []
    : materialInventoryNextActions(checks, bscProfile);
  const missingProductionInputs =
    materialInventoryMissingProductionInputs(nextActions);
  const runbookProblems = bscSccpProductionMaterialInventoryRunbookProblems({
    nextActions,
    missingProductionInputs,
  });
  check(
    checks,
    "material-inventory-runbook-contract",
    runbookProblems.length === 0,
    "BSC production material inventory exposes a complete operator runbook.",
    runbookProblems.join("; "),
  );
  const ready = checks.every((entry) => entry.ok);
  return {
    schema: INVENTORY_SCHEMA,
    ready,
    generatedAt,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    scanRoots: normalizedScanPaths.map(publicPath),
    scanRootStatuses: fileCollection.scanRootStatuses,
    checks,
    reasons: checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.id}: ${entry.detail || entry.message}`),
    nextActions,
    missingProductionInputs,
    route: {
      ready: ownValue(routeReportRecord, "ready") === true,
      manifestSource:
        typeof ownValue(routeReportRecord, "manifestSource") === "string"
          ? ownValue(routeReportRecord, "manifestSource")
          : null,
      bsc: isRecord(ownValue(routeReportRecord, "bsc"))
        ? {
            network:
              typeof ownValue(ownValue(routeReportRecord, "bsc"), "network") ===
              "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "network")
                : null,
            chain:
              typeof ownValue(ownValue(routeReportRecord, "bsc"), "chain") ===
              "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "chain")
                : null,
            chainIdHex:
              typeof ownValue(
                ownValue(routeReportRecord, "bsc"),
                "chainIdHex",
              ) === "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "chainIdHex")
                : null,
            networkIdHex:
              typeof ownValue(
                ownValue(routeReportRecord, "bsc"),
                "networkIdHex",
              ) === "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "networkIdHex")
                : null,
            explorerUrl:
              typeof ownValue(
                ownValue(routeReportRecord, "bsc"),
                "explorerUrl",
              ) === "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "explorerUrl")
                : null,
            explorerHost:
              typeof ownValue(
                ownValue(routeReportRecord, "bsc"),
                "explorerHost",
              ) === "string"
                ? ownValue(ownValue(routeReportRecord, "bsc"), "explorerHost")
                : null,
          }
        : null,
      deployment: routeDeployment,
      postDeployLiveEvidence: publicPostDeployLiveEvidence(routeReportRecord),
    },
    counts: {
      files: scannedFiles.length,
      relevantFilesSeen: fileCollection.relevantFilesSeen,
      maxFiles: fileCollection.maxFiles,
      truncated: fileCollection.truncated,
      skippedGeneratedDirectories:
        fileCollection.skippedGeneratedDirectories.length,
      productionRouteArtifacts: productionRouteArtifacts.length,
      routeManifestPublicationArtifacts:
        appliedRouteManifestPublicationArtifacts.length,
      productionOfflineFullTomlEvidenceArtifacts:
        productionOfflineFullTomlEvidenceArtifacts.length,
      productionDeploymentEvidenceArtifacts:
        productionDeploymentEvidenceArtifacts.length,
      productionTairaBurnRecordContracts:
        productionTairaBurnRecordContracts.length,
      productionVerifierArtifacts: productionVerifierArtifacts.length,
      sourceParityAttestations: sourceParityAttestations.length,
      productionGroth16MaterialManifests:
        productionGroth16MaterialManifests.length,
      productionGroth16AttestationRequestPackages:
        productionGroth16AttestationRequestPackages.length,
      readyGroth16AttestationRequestPackages:
        readyGroth16AttestationRequestPackages.length,
      blockedGroth16AttestationRoles: blockedGroth16AttestationRoles.length,
      routeBoundGroth16AttestationHandoffs:
        routeBoundGroth16AttestationHandoffs.length,
      productionGroth16ProofSelfTestReports:
        productionGroth16ProofSelfTestReports.length,
      productionNativeProverBundles: productionNativeProverBundles.length,
      productionRequirementsArtifacts: productionRequirementsArtifacts.length,
      compiledContractArtifacts: cleanContractArtifacts.length,
      browserProverSidecars: browserProverSidecars.length,
      proofArtifacts: proofArtifacts.length,
      provingKeys: provingKeys.length,
      proofArtifactCandidates: proofArtifactCandidates.length,
      provingKeyCandidates: provingKeyCandidates.length,
      criticalFindings: criticalFindings.length,
      warningFindings: warningFindings.length,
    },
    browserProvers: {
      destination: destinationProver,
      source: sourceProver,
    },
    runtimeProverConfig,
    skippedGeneratedDirectories: fileCollection.skippedGeneratedDirectories,
    files: routeBoundFiles.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
      ...(entry.route ? { route: entry.route } : {}),
      ...(entry.verifier ? { verifier: entry.verifier } : {}),
      ...(entry.nativeProverBundle
        ? { nativeProverBundle: entry.nativeProverBundle }
        : {}),
      ...(entry.productionRequirements
        ? { productionRequirements: entry.productionRequirements }
        : {}),
      ...(entry.sourceParityAttestation
        ? { sourceParityAttestation: entry.sourceParityAttestation }
        : {}),
      ...(entry.groth16AttestationRequestPackage
        ? {
            groth16AttestationRequestPackage:
              entry.groth16AttestationRequestPackage,
          }
        : {}),
      ...(entry.groth16AttestationHandoff
        ? { groth16AttestationHandoff: entry.groth16AttestationHandoff }
        : {}),
      ...(entry.groth16MaterialManifest
        ? { groth16MaterialManifest: entry.groth16MaterialManifest }
        : {}),
      ...(entry.groth16ProofSelfTestReport
        ? { groth16ProofSelfTestReport: entry.groth16ProofSelfTestReport }
        : {}),
      ...(entry.offlineFullTomlEvidence
        ? { offlineFullTomlEvidence: entry.offlineFullTomlEvidence }
        : {}),
      ...(entry.deploymentEvidence
        ? { deploymentEvidence: entry.deploymentEvidence }
        : {}),
      ...(entry.routeManifestUpsertIsi
        ? { routeManifestUpsertIsi: entry.routeManifestUpsertIsi }
        : {}),
      ...(entry.contractArtifact
        ? { contractArtifact: entry.contractArtifact }
        : {}),
      ...(entry.tairaBurnRecordContract
        ? { tairaBurnRecordContract: entry.tairaBurnRecordContract }
        : {}),
      ...(entry.browserProverSidecar
        ? { browserProverSidecar: entry.browserProverSidecar }
        : {}),
      ...(entry.proofFile?.isProofArtifact || entry.proofFile?.isProvingKey
        ? { proofFile: entry.proofFile }
        : {}),
      findings: entry.findings,
    })),
  };
};

const BSC_MATERIAL_INVENTORY_CLI_OPTIONS = new Set([
  "scan-path",
  "artifact-dir",
  "route-report",
  "bsc-network",
  "destination-module-url",
  "destination-prover-module-url",
  "source-module-url",
  "source-prover-module-url",
  "runtime-prover-config-url",
  "prover-config-url",
  "module-url",
  "destination-sidecar",
  "source-sidecar",
  "manifest",
  "allow-not-ready",
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
    if (!BSC_MATERIAL_INVENTORY_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported production material inventory options.`,
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

const assertBscMaterialInventoryCliAliasConflicts = (args) => {
  assertNoCliAliasConflicts(args, "BSC material scan paths", [
    "scan-path",
    "artifact-dir",
  ]);
  assertNoCliAliasConflicts(args, "TAIRA-to-BSC prover module URL", [
    "destination-module-url",
    "destination-prover-module-url",
    "module-url",
  ]);
  assertNoCliAliasConflicts(args, "BSC-to-TAIRA source prover module URL", [
    "source-module-url",
    "source-prover-module-url",
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

const printUsage = () => {
  console.log(`Usage: node scripts/e2e/sccp-bsc-production-material-inventory.mjs [options]

Scan BSC SCCP production route, verifier, proof, and browser prover material.

Options:
  --scan-path PATH[,PATH...]        Material scan paths
  --artifact-dir DIR                Alias for --scan-path
  --route-report PATH               Public preflight report
  --bsc-network testnet|mainnet
  --destination-module-url URL
  --destination-prover-module-url URL
                                    Alias for --destination-module-url
  --source-module-url URL
  --source-prover-module-url URL    Alias for --source-module-url
  --runtime-prover-config-url URL
  --prover-config-url URL          Alias for --runtime-prover-config-url
  --module-url URL                 Alias for --destination-module-url
  --destination-sidecar PATH
  --source-sidecar PATH
  --manifest PATH                  Alias for --destination-sidecar
  --allow-not-ready                 Exit 0 for non-ready inventory reports
  --output-dir DIR
  --help, -h                        Show this help without scanning or writing

Environment:
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_BSC_ROUTE_REPORT
  SCCP_BSC_MATERIAL_SCAN_PATHS
  SCCP_BSC_MATERIAL_INVENTORY_OUTPUT_DIR
  SCCP_BSC_PROVER_MANIFEST_PATH
  SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH
  VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL
  VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL`);
};

export const shouldFailBscSccpProductionMaterialInventoryCli = (
  report,
  args = {},
) =>
  !report?.ready && !parseBoolean(args["allow-not-ready"], "--allow-not-ready");

export const runBscSccpProductionMaterialInventory = async (input = {}) => {
  const scanPaths = ownValue(input, "scanPaths");
  const publicationSearchDirs = ownValue(input, "publicationSearchDirs");
  const routeReportPath = ownValue(input, "routeReportPath");
  const bscNetwork =
    ownValue(input, "bscNetwork") ??
    process.env.SCCP_BSC_NETWORK ??
    process.env.VITE_SCCP_BSC_NETWORK ??
    "testnet";
  const destinationModuleUrl = ownValue(input, "destinationModuleUrl");
  const sourceModuleUrl = ownValue(input, "sourceModuleUrl");
  const runtimeProverConfigUrl = ownValue(input, "runtimeProverConfigUrl");
  const destinationSidecarPath = ownValue(input, "destinationSidecarPath");
  const sourceSidecarPath = ownValue(input, "sourceSidecarPath");
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  const generatedAt = ownValue(input, "generatedAt");
  const selectedRouteReportPath =
    trim(routeReportPath) ||
    bscSccpProductionMaterialInventoryRouteReportPath(bscNetwork);
  const explicitScanPaths = parseList(scanPaths);
  const resolvedScanPaths = explicitScanPaths.length
    ? scanPaths
    : await bscSccpProductionMaterialScanPathsWithLatestPublication({
        bscNetwork,
        publicationSearchDirs,
      });
  return evaluateBscSccpProductionMaterialInventory({
    scanPaths: resolvedScanPaths,
    routeReport: await readJsonReport(selectedRouteReportPath, "route report"),
    bscNetwork,
    destinationModuleUrl,
    sourceModuleUrl,
    runtimeProverConfigUrl,
    destinationSidecarPath,
    sourceSidecarPath,
    fetchImpl,
    timeoutMs,
    generatedAt,
  });
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertBscMaterialInventoryCliAliasConflicts(args);
  const bscNetwork =
    args["bsc-network"] ||
    process.env.SCCP_BSC_NETWORK ||
    process.env.VITE_SCCP_BSC_NETWORK ||
    "testnet";
  const allowNotReady = parseBoolean(
    args["allow-not-ready"],
    "--allow-not-ready",
  );
  const report = await runBscSccpProductionMaterialInventory({
    scanPaths:
      args["scan-path"] ||
      args["artifact-dir"] ||
      process.env.SCCP_BSC_MATERIAL_SCAN_PATHS,
    routeReportPath: args["route-report"] || process.env.SCCP_BSC_ROUTE_REPORT,
    bscNetwork,
    destinationModuleUrl:
      args["destination-module-url"] ||
      args["destination-prover-module-url"] ||
      args["module-url"] ||
      undefined,
    sourceModuleUrl:
      args["source-module-url"] ||
      args["source-prover-module-url"] ||
      undefined,
    runtimeProverConfigUrl:
      args["runtime-prover-config-url"] ||
      args["prover-config-url"] ||
      undefined,
    destinationSidecarPath:
      args["destination-sidecar"] ||
      args["manifest"] ||
      process.env.SCCP_BSC_PROVER_MANIFEST_PATH,
    sourceSidecarPath:
      args["source-sidecar"] ||
      process.env.SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH,
  });
  const outputDir = path.resolve(
    repoRoot,
    trim(
      args["output-dir"] || process.env.SCCP_BSC_MATERIAL_INVENTORY_OUTPUT_DIR,
    ) || bscSccpProductionMaterialInventoryOutputDir(bscNetwork),
  );
  const reportPath = path.join(outputDir, "latest.json");
  await writeJsonReportFile(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nBSC SCCP production material inventory: ${reportPath}`);
  if (!report?.ready && !allowNotReady) {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

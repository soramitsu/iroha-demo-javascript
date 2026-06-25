#!/usr/bin/env node
/* global globalThis, BigInt */
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  fetchTairaChainMetadata,
  normalizeToriiEndpoint,
} from "./sccp-route-preflight.mjs";
import {
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hasControlCharacter = (value) => {
  for (const character of String(value ?? "")) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const DEFAULT_BSC_TAIRA_TORII_URL = "https://taira.sora.org";
export const BSC_TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
export const BSC_TAIRA_NETWORK_PREFIX = 369;
export const SCCP_BSC_XOR_ROUTE_ID = "taira_bsc_xor";
export const SCCP_BSC_XOR_ASSET_KEY = "xor";
export const SCCP_BSC_DOMAIN = 2;
export const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
export const BSC_TESTNET_CHAIN_ID_HEX = "0x61";
export const BSC_TESTNET_RPC_URL =
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
export const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
export const BSC_MAINNET_CHAIN_ID_HEX = "0x38";
export const BSC_MAINNET_RPC_URL = "https://bsc-dataseed.bnbchain.org";
export const BSC_NETWORK_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    label: "BSC testnet",
    chain: "bsc-testnet",
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    rpcUrl: BSC_TESTNET_RPC_URL,
    explorerUrl: "https://testnet.bscscan.com",
    explorerHost: "testnet.bscscan.com",
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    label: "BSC mainnet",
    chain: "bsc-mainnet",
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    rpcUrl: BSC_MAINNET_RPC_URL,
    explorerUrl: "https://bscscan.com",
    explorerHost: "bscscan.com",
  }),
});
export const SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES = new Set([
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
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
export const SCCP_BSC_BURN_RECORD_ARTIFACT_MIN_BYTES = 32;
export const SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
export const SCCP_BSC_BURN_RECORD_PRODUCTION_ARTIFACT_MIN_BYTES = 256;
const SCCP_BSC_LOCAL_JSON_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;
const SCCP_BSC_REMOTE_JSON_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;
const SCCP_BSC_REMOTE_ERROR_MAX_BYTES = 4096;
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-bsc-preflight");
export const bscSccpRoutePreflightOutputDir = (bscNetwork = "testnet") =>
  path.join(DEFAULT_OUTPUT_DIR, resolveBscNetworkProfile(bscNetwork).key);
const DEFAULT_TAIRA_TORII_URL = DEFAULT_BSC_TAIRA_TORII_URL;
const TAIRA_CHAIN_ID = BSC_TAIRA_CHAIN_ID;
const TAIRA_NETWORK_PREFIX = BSC_TAIRA_NETWORK_PREFIX;
const SCCP_ROUTE_ID = SCCP_BSC_XOR_ROUTE_ID;
const SCCP_ASSET_KEY = SCCP_BSC_XOR_ASSET_KEY;
const TAIRA_ASSET_DEFINITION_ID_RE =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{16,80}$/u;
const BSC_MANIFEST_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const BSC_MANIFEST_SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const BSC_MANIFEST_SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
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
const NATIVE_EVM_PROVER_BUNDLE_KEYS = Object.freeze([
  "nativeEvmProverBundle",
  "native_evm_prover_bundle",
  "bscNativeEvmProverBundle",
  "bsc_native_evm_prover_bundle",
  "nativeProverBundle",
  "native_prover_bundle",
  "proverBundle",
  "prover_bundle",
]);
const NATIVE_EVM_PROVER_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_KEYS = Object.freeze([
  "verifierKeyArtifactHash",
  "verifier_key_artifact_hash",
]);
const NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS = Object.freeze([
  ["verifierKeyHash", "verifierKeyHash"],
  ["verifierKeyArtifactHash", "verifierKeyArtifactHash"],
  ["proofArtifactHash", "proofArtifactHash"],
  ["provingKeyHash", "provingKeyHash"],
  ["groth16ProofSelfTestHash", "groth16ProofSelfTestHash"],
  ["nativeEvmProverBundleHash", "nativeEvmProverBundleHash"],
  ["destinationBindingHash", "destinationBindingHash"],
]);

const trim = (value) => String(value ?? "").trim();
const bscPreflightRequiredInput = (id, kind, placeholder, description) =>
  Object.freeze({ id, kind, placeholder, description });
const bscPreflightAction = ({
  id,
  title,
  detail,
  requiredInputs,
  blockedByChecks,
  commands,
}) =>
  Object.freeze({
    id,
    title,
    detail,
    requiredInputs: Object.freeze(requiredInputs),
    blockedByChecks: Object.freeze(blockedByChecks),
    commands: Object.freeze(commands),
  });
const bscPreflightBscDeployConfirmationArgs = (profile) =>
  profile.key === "mainnet"
    ? `--confirm-network ${SCCP_BSC_XOR_ROUTE_ID}:${profile.key} --confirm-mainnet true`
    : `--confirm-network ${SCCP_BSC_XOR_ROUTE_ID}:${profile.key}`;
const bscPreflightRouteManifestConfirmationArgs = (profile) =>
  profile.key === "mainnet"
    ? `--confirm-mainnet true --confirm-network ${SCCP_BSC_XOR_ROUTE_ID}`
    : `--confirm-testnet ${SCCP_BSC_XOR_ROUTE_ID}`;
const bscPreflightMissingProductionInputs = (nextActions) => {
  const byId = new Map();
  for (const action of nextActions) {
    for (const input of action.requiredInputs ?? []) {
      const existing = byId.get(input.id);
      if (existing) {
        if (!existing.blockedByActions.includes(action.id)) {
          existing.blockedByActions.push(action.id);
        }
        continue;
      }
      byId.set(input.id, { ...input, blockedByActions: [action.id] });
    }
  }
  return [...byId.values()];
};
const bscPreflightNextActions = (checks, profile) => {
  const failedCheckIds = new Set(
    checks.filter((entry) => !entry.ok).map((entry) => entry.id),
  );
  const failed = (id) => failedCheckIds.has(id);
  const actions = [];
  if (failed("sccp-submit-paths")) {
    actions.push(
      bscPreflightAction({
        id: "roll-out-taira-sccp-submit-paths",
        title: "Roll out TAIRA SCCP submit paths",
        detail:
          "Expose the SCCP proof and bridge-message submission paths on the selected TAIRA endpoint before BSC route readiness can pass.",
        requiredInputs: [
          bscPreflightRequiredInput(
            "reachable-taira-torii",
            "url",
            "<taira-torii-url>",
            "Public TAIRA Torii endpoint that exposes SCCP proof and bridge-message submit paths.",
          ),
          bscPreflightRequiredInput(
            "taira-route-publication-channel",
            "operator-access",
            "<taira-route-publication-channel>",
            "Operator access path used to publish TAIRA SCCP route manifests and submit endpoints.",
          ),
        ],
        blockedByChecks: ["sccp-submit-paths"],
        commands: [
          "curl -fsS <taira-torii-url>/v1/sccp/capabilities",
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  if (
    failed("bsc-route-manifest") ||
    failed("bsc-route-manifest-unique") ||
    failed("bsc-route-manifest-shape") ||
    failed("bsc-destination-browser-prover") ||
    failed("bsc-source-browser-prover")
  ) {
    actions.push(
      bscPreflightAction({
        id: "publish-public-bsc-route-manifest",
        title: "Publish public BSC route manifest",
        detail:
          "Publish exactly one public TAIRA SCCP manifest for taira_bsc_xor/xor on the selected BSC network, then rerun BSC contract readback.",
        requiredInputs: [
          bscPreflightRequiredInput(
            "production-route-manifest",
            "file",
            "<production-route.manifest.json>",
            "Production route manifest bound to deployed BSC contracts, TAIRA burn-record material, and post-deploy evidence.",
          ),
          bscPreflightRequiredInput(
            `${profile.key}-bsc-deployment-evidence`,
            "file",
            `<${profile.key}-deployment-evidence.json>`,
            `${profile.label} deployment evidence from production BSC contracts and live readback.`,
          ),
          bscPreflightRequiredInput(
            "taira-burn-record-contract",
            "file",
            "<taira-burn-record.contract.json>",
            "Compiled TAIRA burn-record IVM contract material for the BSC route manifest.",
          ),
          bscPreflightRequiredInput(
            "canonical-settlement-asset-definition-id",
            "asset-definition-id",
            "<canonical-asset-definition-id>",
            "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proof-artifact",
            "file",
            "<relative-circuit.r1cs>",
            "Production burn-record proof artifact whose hash is published by the route manifest.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proving-key",
            "file",
            "<relative-circuit.zkey>",
            "Production burn-record proving key whose hash is published by the route manifest.",
          ),
          bscPreflightRequiredInput(
            "native-evm-prover-bundle",
            "file",
            "<native-evm-prover-bundle.json>",
            "SDK-validated native EVM prover bundle bound to the selected BSC route.",
          ),
          bscPreflightRequiredInput(
            "destination-browser-prover-manifest",
            "file",
            "<destination-browser-prover-manifest.json>",
            "Route-bound TAIRA-to-BSC browser prover sidecar manifest with module/content hashes.",
          ),
          bscPreflightRequiredInput(
            "source-browser-prover-manifest",
            "file",
            "<source-browser-prover-manifest.json>",
            "Route-bound BSC-to-TAIRA browser source prover sidecar manifest with module/content hashes.",
          ),
          bscPreflightRequiredInput(
            "post-deploy-live-evidence",
            "file",
            "<post-deploy-live-evidence.json>",
            "Live source-event, route-canary, and BSC readback evidence for the production route manifest.",
          ),
          bscPreflightRequiredInput(
            "offline-full-toml-evidence",
            "file",
            "<offline-full-toml-evidence.json>",
            "Generated offline full-TOML evidence whose hash is published by the on-chain route manifest.",
          ),
          bscPreflightRequiredInput(
            "deployed-taira-base-config",
            "file",
            "<deployed-taira-config.toml>",
            "Current deployed TAIRA base config used only to render offline full-TOML evidence.",
          ),
          bscPreflightRequiredInput(
            "taira-route-publication-channel",
            "operator-access",
            "<taira-route-publication-channel>",
            "Operator access path used to publish exactly one selected-network BSC route manifest on TAIRA.",
          ),
        ],
        blockedByChecks: [
          "bsc-route-manifest-shape",
          "bsc-route-manifest",
          "bsc-route-manifest-unique",
          "bsc-destination-browser-prover",
          "bsc-source-browser-prover",
        ].filter((id) => failed(id)),
        commands: [
          `node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --bsc-network ${profile.key} --evidence <${profile.key}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --destination-browser-prover-manifest <destination-browser-prover-manifest.json> --source-browser-prover-manifest <source-browser-prover-manifest.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --full-toml-ready true --offline-full-toml-evidence <offline-full-toml-evidence.json> --production-ready true --live-readback-checked true ${bscPreflightRouteManifestConfirmationArgs(profile)} --out <production-route.manifest.json>`,
          "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id>",
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key} --check-bsc-contracts true`,
        ],
      }),
    );
  }
  if (failed("bsc-production-verifier-material")) {
    actions.push(
      bscPreflightAction({
        id: "replace-diagnostic-bsc-verifier",
        title: "Replace diagnostic BSC verifier deployment",
        detail:
          "Deploy BSC contracts with production verifier material, then publish route evidence whose verifier key hash is not denylisted.",
        requiredInputs: [
          bscPreflightRequiredInput(
            "production-groth16-verifier-key-json",
            "file",
            "<production-verifier-key.json>",
            "Production BN254 Groth16 verifier key JSON whose hash is not denylisted.",
          ),
          bscPreflightRequiredInput(
            `${profile.key}-funded-bsc-deployer`,
            "operator-environment",
            `<${profile.key}-deployer-signing-env>`,
            `Funded ${profile.label} deployer configured outside report files.`,
          ),
          bscPreflightRequiredInput(
            `${profile.key}-bsc-rpc-endpoint`,
            "url",
            `<${profile.key}-bsc-rpc-url>`,
            `${profile.label} RPC endpoint used for deployment and contract readback.`,
          ),
        ],
        blockedByChecks: ["bsc-production-verifier-material"],
        commands: [
          `node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs deploy --bsc-network ${profile.key} --verifier <production-verifier-key.json> --broadcast true ${bscPreflightBscDeployConfirmationArgs(profile)}`,
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key} --check-bsc-contracts true`,
        ],
      }),
    );
  }
  if (
    failed("bsc-production-prover-material") ||
    failed("bsc-native-evm-prover-bundle") ||
    failed("bsc-native-evm-prover-bundle-hash")
  ) {
    actions.push(
      bscPreflightAction({
        id: "publish-production-proof-material",
        title: "Publish production proof material",
        detail:
          "Publish proof artifact, proving key, and SDK-validated native EVM prover bundle hashes in the public BSC route manifest.",
        requiredInputs: [
          bscPreflightRequiredInput(
            "production-route-manifest",
            "file",
            "<production-route.manifest.json>",
            "Production route manifest carrying verifier, proof, proving-key, and native prover bundle hashes.",
          ),
          bscPreflightRequiredInput(
            "native-prover-artifact-root",
            "directory",
            "<native-prover-artifact-root>",
            "Canonical artifact root containing native EVM prover inputs and implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "production-groth16-verifier-key-json",
            "file",
            "<production-verifier-key.json>",
            "Production BN254 Groth16 verifier key JSON whose hash is not denylisted.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proof-artifact",
            "file",
            "<relative-circuit.r1cs>",
            "Production burn-record proof artifact referenced by the native EVM prover bundle.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proving-key",
            "file",
            "<relative-circuit.zkey>",
            "Production burn-record proving key referenced by the native EVM prover bundle.",
          ),
          bscPreflightRequiredInput(
            "native-evm-prover-bundle",
            "file",
            "<native-evm-prover-bundle.json>",
            "SDK-validated native EVM prover bundle bound to the selected BSC route.",
          ),
          bscPreflightRequiredInput(
            "groth16-material-manifest",
            "file",
            "<relative-groth16-material-manifest.json>",
            "ProductionReady Groth16 material manifest validated before building the native EVM prover bundle.",
          ),
          bscPreflightRequiredInput(
            "cross-sdk-parity-report",
            "file",
            "<relative-cross-sdk-parity.json>",
            "Cross-SDK production parity report covering JavaScript, Swift, Kotlin, Java Android, and .NET bindings.",
          ),
          bscPreflightRequiredInput(
            "native-prover-self-test-report",
            "file",
            "<relative-native-self-test.json>",
            "Native EVM prover self-test report bound to the selected BSC network.",
          ),
          bscPreflightRequiredInput(
            "javascript-sdk-implementation",
            "file-or-directory",
            "<relative-javascript-implementation>",
            "JavaScript SDK implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "swift-sdk-implementation",
            "file-or-directory",
            "<relative-swift-implementation>",
            "Swift SDK implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "kotlin-sdk-implementation",
            "file-or-directory",
            "<relative-kotlin-implementation>",
            "Kotlin SDK implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "java-android-sdk-implementation",
            "file-or-directory",
            "<relative-java-android-implementation>",
            "Java Android SDK implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "dotnet-sdk-implementation",
            "file-or-directory",
            "<relative-dotnet-implementation>",
            ".NET SDK implementation evidence.",
          ),
          bscPreflightRequiredInput(
            "audit-circuit-security",
            "hash-or-file",
            "<hex-or-relative-file>",
            "Circuit security audit evidence.",
          ),
          bscPreflightRequiredInput(
            "audit-native-implementation",
            "hash-or-file",
            "<hex-or-relative-file>",
            "Native implementation audit evidence.",
          ),
          bscPreflightRequiredInput(
            "audit-reproducible-build",
            "hash-or-file",
            "<hex-or-relative-file>",
            "Reproducible-build audit evidence.",
          ),
          bscPreflightRequiredInput(
            "audit-no-wasm-no-remote-scan",
            "hash-or-file",
            "<hex-or-relative-file>",
            "No-WASM/no-remote-prover scan evidence.",
          ),
        ],
        blockedByChecks: [
          "bsc-production-prover-material",
          "bsc-native-evm-prover-bundle",
          "bsc-native-evm-prover-bundle-hash",
        ].filter((id) => failed(id)),
        commands: [
          `node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --bsc-network ${profile.key} --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --proof-artifact <relative-circuit.r1cs> --proving-key <relative-circuit.zkey> --verifier-key <production-verifier-key.json> --groth16-material-manifest <relative-groth16-material-manifest.json> --cross-sdk-parity <relative-cross-sdk-parity.json> --native-prover-self-test <relative-native-self-test.json> --javascript-implementation <relative-javascript-implementation> --swift-implementation <relative-swift-implementation> --kotlin-implementation <relative-kotlin-implementation> --java-android-implementation <relative-java-android-implementation> --dotnet-implementation <relative-dotnet-implementation> --audit-circuit-security <hex-or-relative-file> --audit-native-implementation <hex-or-relative-file> --audit-reproducible-build <hex-or-relative-file> --audit-no-wasm-no-remote-scan <hex-or-relative-file> --out <native-evm-prover-bundle.json> --attach-route-manifest-out <production-route.manifest.json>`,
          "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id>",
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  if (failed("bsc-post-deploy-live-evidence")) {
    actions.push(
      bscPreflightAction({
        id: "publish-post-deploy-full-toml-evidence",
        title: "Publish post-deploy full-TOML evidence",
        detail:
          "Attach generated offline full-TOML evidence and live source/canary transaction evidence to the public BSC route manifest.",
        requiredInputs: [
          bscPreflightRequiredInput(
            "offline-full-toml-evidence",
            "file",
            "<offline-full-toml-evidence.json>",
            "Generated offline full-TOML evidence whose hash is published by the on-chain route manifest.",
          ),
          bscPreflightRequiredInput(
            "post-deploy-live-evidence",
            "hashes-and-urls",
            "<source-event/route-canary/full-config hashes and explorer urls>",
            "Live source-event, route-canary, and merged full-config evidence for the production-ready route manifest.",
          ),
        ],
        blockedByChecks: ["bsc-post-deploy-live-evidence"],
        commands: [
          "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest <production-route.manifest.json> --base-config <deployed-taira-config.toml> --out <production-route.full-taira-config.toml> --write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
          "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id>",
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  if (failed("taira-burn-record-material")) {
    actions.push(
      bscPreflightAction({
        id: "publish-taira-burn-record-material",
        title: "Publish TAIRA burn-record material",
        detail:
          "Attach production-shaped TAIRA burn-record IVM contract material and VK reference to the BSC route manifest.",
        requiredInputs: [
          bscPreflightRequiredInput(
            `${profile.key}-bsc-deployment-evidence`,
            "file",
            `<${profile.key}-deployment-evidence.json>`,
            `${profile.label} deployment evidence from production BSC contracts and live readback.`,
          ),
          bscPreflightRequiredInput(
            "taira-burn-record-contract",
            "file",
            "<taira-burn-record.contract.json>",
            "Compiled TAIRA burn-record IVM contract artifact used by the BSC route manifest.",
          ),
          bscPreflightRequiredInput(
            "canonical-settlement-asset-definition-id",
            "asset-definition-id",
            "<canonical-asset-definition-id>",
            "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proof-artifact",
            "file",
            "<relative-circuit.r1cs>",
            "Production burn-record proof artifact whose hash is published by the route manifest.",
          ),
          bscPreflightRequiredInput(
            "burn-record-proving-key",
            "file",
            "<relative-circuit.zkey>",
            "Production burn-record proving key whose hash is published by the route manifest.",
          ),
          bscPreflightRequiredInput(
            "native-evm-prover-bundle",
            "file",
            "<native-evm-prover-bundle.json>",
            "SDK-validated native EVM prover bundle bound to the selected BSC route.",
          ),
          bscPreflightRequiredInput(
            "destination-browser-prover-manifest",
            "file",
            "<destination-browser-prover-manifest.json>",
            "Route-bound TAIRA-to-BSC browser prover sidecar manifest with module/content hashes.",
          ),
          bscPreflightRequiredInput(
            "source-browser-prover-manifest",
            "file",
            "<source-browser-prover-manifest.json>",
            "Route-bound BSC-to-TAIRA browser source prover sidecar manifest with module/content hashes.",
          ),
          bscPreflightRequiredInput(
            "groth16-material-manifest",
            "file",
            "<relative-groth16-material-manifest.json>",
            "ProductionReady Groth16 material manifest validated before building the native EVM prover bundle.",
          ),
          bscPreflightRequiredInput(
            "post-deploy-live-evidence",
            "file",
            "<post-deploy-live-evidence.json>",
            "Live source-event, route-canary, and BSC readback evidence for the production route manifest.",
          ),
          bscPreflightRequiredInput(
            "offline-full-toml-evidence",
            "file",
            "<offline-full-toml-evidence.json>",
            "Generated offline full-TOML evidence whose hash is published by the on-chain route manifest.",
          ),
          bscPreflightRequiredInput(
            "deployed-taira-base-config",
            "file",
            "<deployed-taira-config.toml>",
            "Current deployed TAIRA base config used only to render offline full-TOML evidence.",
          ),
          bscPreflightRequiredInput(
            "taira-route-publication-channel",
            "operator-access",
            "<taira-route-publication-channel>",
            "Operator access path used to publish the corrected BSC route manifest on TAIRA.",
          ),
        ],
        blockedByChecks: ["taira-burn-record-material"],
        commands: [
          `node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --bsc-network ${profile.key} --evidence <${profile.key}-deployment-evidence.json> --taira-contract <taira-burn-record.contract.json> --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...> --native-prover-bundle <native-evm-prover-bundle.json> --destination-browser-prover-manifest <destination-browser-prover-manifest.json> --source-browser-prover-manifest <source-browser-prover-manifest.json> --source-bridge-config-hash <0x...> --source-event-transaction-id <0x...> --source-event-explorer-url <url> --route-canary-evidence-hash <0x...> --route-canary-transaction-id <0x...> --route-canary-explorer-url <url> --full-toml-ready true --offline-full-toml-evidence <offline-full-toml-evidence.json> --production-ready true --live-readback-checked true ${bscPreflightRouteManifestConfirmationArgs(profile)} --out <production-route.manifest.json>`,
          "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs publish-route-manifest --manifest <production-route.manifest.json> --submit true --authority <route-manager-account-id>",
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  return actions;
};
const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ownValue = (record, key) => {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
};
const ownArrayValues = (value) => {
  return ownArrayEntries(value).map(([, entry]) => entry);
};
const ownArrayEntries = (value) => {
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
const ownArrayIndexedEntries = (value) => {
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
const bscPreflightRecordArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = ownArrayIndexedEntries(value)
    .filter(([, entry]) => !isRecord(entry))
    .map(([index]) => `${label} ${index} is not an object.`);
  if (required && ownArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};
const bscPreflightStringArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = ownArrayIndexedEntries(value)
    .filter(([, entry]) => typeof entry !== "string" || !entry.trim())
    .map(([index]) => `${label} ${index} is not a non-empty string.`);
  if (required && ownArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};
const bscPreflightRequiredInputContractProblems = (
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
      ...bscPreflightStringArrayProblems(
        ownValue(input, "blockedByActions"),
        `${label} blockedByActions`,
        { required: requireBlockedByActions },
      ),
    );
  }
  return problems;
};

const rememberBscPreflightRunbookId = (seen, id, label, problems) => {
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

const BSC_PREFLIGHT_NATIVE_PROVER_BUNDLE_COMMAND_FLAGS = Object.freeze([
  "--bsc-network",
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

const bscPreflightActionCommandProblems = (action, label) => {
  const problems = [];
  const actionId =
    typeof ownValue(action, "id") === "string" ? ownValue(action, "id") : "";
  if (actionId !== "publish-production-proof-material") {
    return problems;
  }
  const commands = ownValue(action, "commands");
  const nativeProverCommands = Array.isArray(commands)
    ? ownArrayValues(commands).filter(
        (command) =>
          typeof command === "string" &&
          /\bnative-prover-bundle\b/u.test(command),
      )
    : [];
  if (nativeProverCommands.length !== 1) {
    problems.push(
      `${label} must include exactly one native-prover-bundle command.`,
    );
    return problems;
  }
  const command = nativeProverCommands[0];
  for (const flag of BSC_PREFLIGHT_NATIVE_PROVER_BUNDLE_COMMAND_FLAGS) {
    if (!new RegExp(`(?:^|\\s)${flag}(?:\\s|$)`, "u").test(command)) {
      problems.push(`${label} native-prover-bundle command lacks ${flag}.`);
    }
  }
  return problems;
};

export const bscSccpRoutePreflightRunbookProblems = (report) => {
  if (!isRecord(report)) {
    return ["BSC route preflight runbook report is not an object."];
  }
  const problems = [];
  const nextActions = ownValue(report, "nextActions");
  const missingProductionInputs = ownValue(report, "missingProductionInputs");
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  const missingInputIds = new Set();
  const missingInputsById = new Map();
  problems.push(
    ...bscPreflightRecordArrayProblems(
      nextActions,
      "BSC route preflight next action",
    ),
    ...bscPreflightRecordArrayProblems(
      missingProductionInputs,
      "BSC route preflight missing production input",
    ),
  );
  if (Array.isArray(nextActions)) {
    for (const [index, action] of ownArrayIndexedEntries(nextActions)) {
      const label = `BSC route preflight next action ${index}`;
      if (!isRecord(action)) {
        continue;
      }
      const actionId =
        typeof ownValue(action, "id") === "string"
          ? ownValue(action, "id").trim()
          : "";
      const uniqueActionId = rememberBscPreflightRunbookId(
        actionIds,
        actionId,
        "BSC route preflight next action",
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
        ...bscPreflightRecordArrayProblems(
          requiredInputs,
          `${label} required input`,
          { required: true },
        ),
        ...bscPreflightStringArrayProblems(
          ownValue(action, "blockedByChecks"),
          `${label} blockedByChecks`,
          { required: true },
        ),
        ...bscPreflightStringArrayProblems(
          ownValue(action, "commands"),
          `${label} commands`,
          { required: true },
        ),
        ...bscPreflightActionCommandProblems(action, label),
      );
      const requiredInputIds = new Set();
      if (Array.isArray(requiredInputs)) {
        for (const [inputIndex, input] of ownArrayIndexedEntries(
          requiredInputs,
        )) {
          if (!isRecord(input)) {
            continue;
          }
          problems.push(
            ...bscPreflightRequiredInputContractProblems(
              input,
              `${label} required input ${inputIndex}`,
            ),
          );
          const inputId =
            typeof ownValue(input, "id") === "string"
              ? ownValue(input, "id").trim()
              : "";
          rememberBscPreflightRunbookId(
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
    for (const [index, input] of ownArrayIndexedEntries(
      missingProductionInputs,
    )) {
      const label = `BSC route preflight missing production input ${index}`;
      if (!isRecord(input)) {
        continue;
      }
      const inputId =
        typeof ownValue(input, "id") === "string"
          ? ownValue(input, "id").trim()
          : "";
      rememberBscPreflightRunbookId(
        missingInputIds,
        inputId,
        "BSC route preflight missing production input",
        problems,
      );
      if (inputId && !missingInputsById.has(inputId)) {
        missingInputsById.set(inputId, input);
      }
      problems.push(
        ...bscPreflightRequiredInputContractProblems(input, label, {
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
            `BSC route preflight next action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
          );
          continue;
        }
        const blockers = ownValue(missingInput, "blockedByActions");
        if (
          Array.isArray(blockers) &&
          !ownArrayValues(blockers).includes(actionId)
        ) {
          problems.push(
            `BSC route preflight missing production input ${inputId} does not reference blocking action ${actionId}.`,
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
            `BSC route preflight missing production input ${inputId} references unknown blocking action ${actionId}.`,
          );
          continue;
        }
        if (!requiredInputIdsByActionId.get(actionId)?.has(inputId)) {
          problems.push(
            `BSC route preflight missing production input ${inputId} references blocking action ${actionId}, but that action does not require the input.`,
          );
        }
      }
    }
  }
  return problems;
};
const ownJsonValue = (value, seen = new WeakSet()) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "__non_finite_number__";
  }
  if (typeof value !== "object") {
    return undefined;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const cloned = [];
      for (const key of Object.keys(value)) {
        if (!JSON_ARRAY_INDEX_PATTERN.test(key)) {
          continue;
        }
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= value.length
        ) {
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value")
        ) {
          return undefined;
        }
        const child = ownJsonValue(descriptor.value, seen);
        if (child !== undefined) {
          cloned.push(child);
        }
      }
      return cloned;
    }
    const cloned = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
      ) {
        return undefined;
      }
      const child = ownJsonValue(descriptor.value, seen);
      if (child !== undefined) {
        cloned[key] = child;
      }
    }
    return cloned;
  } finally {
    seen.delete(value);
  }
};
const cloneOwnRecord = (value) => {
  const cloned = ownJsonValue(value);
  return isRecord(cloned) ? cloned : {};
};
const safeJsonInput = (value) => {
  const cloned = ownJsonValue(value);
  return cloned === undefined ? null : cloned;
};

const parseJsonStringToken = (text, start) => {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      return {
        value: JSON.parse(text.slice(start, index + 1)),
        end: index,
      };
    }
    if (char === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
};

const nextNonWhitespaceIndex = (text, start) => {
  let index = start;
  while (index < text.length && /\s/u.test(text[index])) {
    index += 1;
  }
  return index;
};

const duplicateJsonObjectKeyReason = (text, label) => {
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const token = parseJsonStringToken(text, index);
      if (!token) {
        return "";
      }
      const current = stack.at(-1);
      if (
        current?.type === "object" &&
        current.expectingKey === true &&
        text[nextNonWhitespaceIndex(text, token.end + 1)] === ":"
      ) {
        if (current.keys.has(token.value)) {
          return `${label} contains a duplicate JSON object key.`;
        }
        current.keys.add(token.value);
        current.expectingKey = false;
      }
      index = token.end;
      continue;
    }
    if (char === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      continue;
    }
    if (char === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      continue;
    }
    if (char === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") {
        current.expectingKey = true;
      }
    }
  }
  return "";
};

export const parseJsonWithoutDuplicateKeys = (text, label) => {
  const duplicateReason = duplicateJsonObjectKeyReason(text, label);
  if (duplicateReason) {
    throw new Error(duplicateReason);
  }
  return JSON.parse(text);
};

const readLocalJsonEvidenceFile = async (filePath, label) => {
  const resolved = path.resolve(filePath);
  const info = await lstat(resolved);
  if (info.isSymbolicLink()) {
    throw new Error(`${label} ${resolved} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} ${resolved} must be a regular file.`);
  }
  if (info.size > SCCP_BSC_LOCAL_JSON_EVIDENCE_MAX_BYTES) {
    throw new Error(
      `${label} ${resolved} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_LOCAL_JSON_EVIDENCE_MAX_BYTES} bytes.`,
    );
  }
  const parsed = parseJsonWithoutDuplicateKeys(
    await readFile(resolved, "utf8"),
    `${label} ${resolved}`,
  );
  if (!isRecord(parsed)) {
    throw new Error(`${label} ${resolved} must be a JSON object.`);
  }
  return parsed;
};
const readString = (record, key) =>
  typeof ownValue(record, key) === "string" ? ownValue(record, key).trim() : "";
const readNumber = (record, key) => {
  if (!hasOwn(record, key)) {
    return null;
  }
  const value = ownValue(record, key);
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const readRecord = (record, key) =>
  isRecord(ownValue(record, key)) ? ownValue(record, key) : null;
const readFirstString = (record, ...keys) => {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return "";
};
const readConsistentBooleanAlias = (record, label, keys) => {
  const entries = [];
  if (isRecord(record)) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        entries.push({ key, value: ownValue(record, key) });
      }
    }
  }
  let selected = null;
  const problems = [];
  for (const entry of entries) {
    if (typeof entry.value !== "boolean") {
      problems.push(`${label}.${entry.key} must be boolean true or false`);
      continue;
    }
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.value !== entry.value) {
      problems.push(
        `${label} aliases disagree: ${selected.key}=${selected.value} but ${entry.key}=${entry.value}`,
      );
    }
  }
  return {
    value: selected?.value,
    problems,
    present: entries.length > 0,
  };
};
const hasOwnManifestKey = hasOwn;
const hasAnyOwnManifestKey = (record, keys) =>
  keys.some((key) => hasOwnManifestKey(record, key));
export const normalizeBscNetworkKey = (value = "testnet") => {
  const normalized = trim(value).toLowerCase().replace(/_/gu, "-");
  if (
    !normalized ||
    normalized === "testnet" ||
    normalized === "bsc-testnet" ||
    normalized === "chapel" ||
    normalized === "bsc-chapel"
  ) {
    return "testnet";
  }
  if (
    normalized === "mainnet" ||
    normalized === "bsc" ||
    normalized === "bsc-mainnet" ||
    normalized === "bnb-mainnet"
  ) {
    return "mainnet";
  }
  throw new Error("BSC network must be testnet or mainnet.");
};
export const resolveBscNetworkProfile = (value = "testnet") =>
  BSC_NETWORK_PROFILES[normalizeBscNetworkKey(value)];
export const SCCP_BSC_REQUIRED_ROUTE_CHECK_IDS = Object.freeze([
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
  "bsc-testnet-chain-id",
  "bsc-testnet-network-id",
  "bsc-explorer-binding",
  "bsc-bridge-address",
  "bsc-token-address",
  "bsc-sourceBridge-address",
  "bsc-verifier-address",
  "bsc-contract-addresses-distinct",
  "bsc-verifierCodeHash",
  "bsc-verifierKeyHash",
  "bsc-production-verifier-material",
  "bsc-production-prover-material",
  "bsc-native-evm-prover-bundle-hash",
  "bsc-native-evm-prover-bundle",
  "bsc-destination-browser-prover",
  "bsc-source-browser-prover",
  "bsc-destinationBindingHash",
  "bsc-destination-binding",
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
export const requiredBscRouteCheckIds = (bscNetwork = "testnet") => {
  const profile =
    isRecord(bscNetwork) && typeof bscNetwork.key === "string"
      ? bscNetwork
      : resolveBscNetworkProfile(bscNetwork);
  return SCCP_BSC_REQUIRED_ROUTE_CHECK_IDS.map((id) =>
    profile.key === "mainnet"
      ? id
          .replace("bsc-testnet-chain-id", "bsc-mainnet-chain-id")
          .replace("bsc-testnet-network-id", "bsc-mainnet-network-id")
      : id,
  );
};
const defaultBscNetworkProfile = () =>
  resolveBscNetworkProfile(process.env.SCCP_BSC_NETWORK || "testnet");
const readBscNetworkKeyFromManifest = (manifest) => {
  const chain = readFirstString(
    manifest,
    "bscNetwork",
    "bsc_network",
    "chain",
    "network",
  );
  if (chain) {
    try {
      return normalizeBscNetworkKey(chain);
    } catch (_error) {
      return "";
    }
  }
  const chainId = readFirstString(manifest, "chainIdHex", "chain_id_hex")
    .toLowerCase()
    .trim();
  const networkId = readFirstString(manifest, "networkIdHex", "network_id_hex")
    .toLowerCase()
    .trim();
  if (
    chainId === BSC_MAINNET_CHAIN_ID_HEX ||
    networkId === BSC_MAINNET_NETWORK_ID_HEX
  ) {
    return "mainnet";
  }
  if (
    chainId === BSC_TESTNET_CHAIN_ID_HEX ||
    networkId === BSC_TESTNET_NETWORK_ID_HEX
  ) {
    return "testnet";
  }
  return "";
};
const readConsistentEvmAliasString = (label, sources) => {
  let selectedValue = "";
  let selectedKey = "";
  let selectedComparable = "";
  for (const { record, keys } of sources) {
    if (!isRecord(record)) {
      continue;
    }
    for (const key of keys) {
      const value = readString(record, key);
      if (!value) {
        continue;
      }
      const comparable = value.toLowerCase();
      if (!selectedValue) {
        selectedValue = value;
        selectedKey = key;
        selectedComparable = comparable;
        continue;
      }
      if (selectedComparable !== comparable) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${value}.`,
        );
      }
    }
  }
  return selectedValue;
};
const readConsistentAliasString = (
  label,
  sources,
  normalizeValue = (value) => value.trim(),
) => {
  let selectedValue = "";
  let selectedKey = "";
  let selectedComparable = "";
  for (const { record, keys } of sources) {
    if (!isRecord(record)) {
      continue;
    }
    for (const key of keys) {
      const value = readString(record, key);
      if (!value) {
        continue;
      }
      const comparable = normalizeValue(value, label);
      if (!selectedValue) {
        selectedValue = value;
        selectedKey = key;
        selectedComparable = comparable;
        continue;
      }
      if (selectedComparable !== comparable) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${value}.`,
        );
      }
    }
  }
  return selectedComparable;
};
const normalizeBscExplorerBaseUrl = (value, label = "BSC explorerUrl") => {
  const raw = trim(value).replace(/\/+$/u, "");
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  ) {
    throw new Error(
      `${label} must be an HTTPS origin without credentials, path, query, or fragment.`,
    );
  }
  return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}`;
};
const normalizeBscExplorerHost = (value, label = "BSC explorerHost") => {
  const normalized = trim(value).toLowerCase();
  if (!normalized || normalized.includes("://") || /[/?#@]/u.test(normalized)) {
    throw new Error(
      `${label} must be a hostname, not a URL or credentialed value.`,
    );
  }
  let url;
  try {
    url = new URL(`https://${normalized}`);
  } catch (_error) {
    throw new Error(`${label} must be a valid hostname.`);
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be a hostname only.`);
  }
  return url.host.toLowerCase();
};
const assertSingleStringAliasPerSource = (label, sources) => {
  for (const { record, keys, sourceLabel = "manifest object" } of sources) {
    if (!isRecord(record)) {
      continue;
    }
    const presentKeys = keys.filter((key) => readString(record, key));
    if (presentKeys.length > 1) {
      throw new Error(
        `${label} must not use multiple aliases in ${sourceLabel}: ${presentKeys.join(", ")}.`,
      );
    }
  }
};
const readConsistentAliasNumber = (label, sources) => {
  let selectedValue = null;
  let selectedKey = "";
  for (const { record, keys } of sources) {
    if (!isRecord(record)) {
      continue;
    }
    for (const key of keys) {
      if (!hasOwn(record, key)) {
        continue;
      }
      const raw = ownValue(record, key);
      if (raw === undefined || raw === null || raw === "") {
        continue;
      }
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`${label}.${key} must be a finite number.`);
      }
      if (selectedValue === null) {
        selectedValue = value;
        selectedKey = key;
        continue;
      }
      if (selectedValue !== value) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${value}.`,
        );
      }
    }
  }
  return selectedValue;
};
const readConsistentBoolean = (record, keys, label) => {
  if (!isRecord(record)) {
    return false;
  }
  let selected;
  let selectedKey = "";
  for (const key of keys) {
    if (!hasOwnManifestKey(record, key)) {
      continue;
    }
    const value = ownValue(record, key);
    if (typeof value !== "boolean") {
      throw new Error(`${label}.${key} must be boolean.`);
    }
    if (selected === undefined) {
      selected = value;
      selectedKey = key;
      continue;
    }
    if (selected !== value) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selected} but ${key}=${value}.`,
      );
    }
  }
  return selected === true;
};
const readFirstRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = readRecord(record, key);
    if (value) {
      return value;
    }
  }
  return null;
};
const recordAliasConflictReason = (record, label, keys) => {
  if (!isRecord(record)) {
    return "";
  }
  const presentKeys = keys.filter((key) => readRecord(record, key));
  return presentKeys.length > 1
    ? `${label} must not use multiple record aliases: ${presentKeys.join(", ")}`
    : "";
};
const normalizeBrowserModuleUrl = (value, label) => {
  const text = trim(value);
  if (!text) {
    throw new Error(`${label} is missing.`);
  }
  if (hasControlCharacter(text)) {
    throw new Error(`${label} contains control characters.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch (_error) {
      throw new Error(`${label} must be a valid URL.`);
    }
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (
      url.protocol !== "https:" &&
      !(isLoopback && url.protocol === "http:")
    ) {
      throw new Error(`${label} must use HTTPS or loopback HTTP.`);
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error(
        `${label} must not contain credentials, query strings, or fragments.`,
      );
    }
    return url.toString();
  }
  if (
    !(
      text.startsWith("/") ||
      text.startsWith("./") ||
      text.startsWith("../")
    ) ||
    text.includes("?") ||
    text.includes("#") ||
    text.includes("\\")
  ) {
    throw new Error(
      `${label} must be package-relative, root-relative, HTTPS, or loopback HTTP without query strings or fragments.`,
    );
  }
  return text;
};
const readStringListAlias = (record, label, keys) => {
  if (!isRecord(record)) {
    throw new Error(`${label} is missing.`);
  }
  let selected = null;
  let selectedKey = "";
  for (const key of keys) {
    if (!hasOwn(record, key)) continue;
    const value = ownValue(record, key);
    if (!Array.isArray(value)) {
      throw new Error(`${label}.${key} must be an array.`);
    }
    const normalized = ownArrayValues(value).map((entry, index) => {
      const text = trim(entry);
      if (!text) {
        throw new Error(
          `${label}.${key}[${index}] must be a non-empty string.`,
        );
      }
      return text;
    });
    if (selected) {
      throw new Error(
        `${label} must not use multiple export aliases: ${selectedKey}, ${key}.`,
      );
    }
    selected = normalized;
    selectedKey = key;
  }
  if (!selected || selected.length === 0) {
    throw new Error(`${label}.expectedExports is missing or empty.`);
  }
  return selected;
};
const readBrowserProverRef = ({
  manifest,
  label,
  recordKeys,
  expectedRouteHash,
  expectedProofHash,
}) => {
  const presentKeys = recordKeys.filter((key) => readRecord(manifest, key));
  if (presentKeys.length === 0) {
    return { ref: null, problems: [`${label} is missing.`] };
  }
  if (presentKeys.length > 1) {
    return {
      ref: null,
      problems: [
        `${label} must not use multiple record aliases: ${presentKeys.join(", ")}.`,
      ],
    };
  }
  const record = readRecord(manifest, presentKeys[0]);
  const problems = [];
  const readHash = (fieldLabel, keys) => {
    try {
      return readConsistentAliasString(
        `${label}.${fieldLabel}`,
        [{ record, keys }],
        (value, hashLabel) => normalizeNonZeroHex32(value, hashLabel),
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  let moduleUrl = null;
  try {
    moduleUrl = normalizeBrowserModuleUrl(
      readFirstString(
        record,
        "moduleUrl",
        "module_url",
        "browserModuleUrl",
        "browser_module_url",
      ),
      `${label}.moduleUrl`,
    );
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  const moduleSpecifier = readFirstString(
    record,
    "moduleSpecifier",
    "module_specifier",
    "specifier",
  );
  const moduleHash = readHash("moduleHash", [
    "moduleHash",
    "module_hash",
    "moduleSha256",
    "module_sha256",
    "sha256",
  ]);
  const manifestHash = readHash("manifestHash", [
    "manifestHash",
    "manifest_hash",
    "manifestSha256",
    "manifest_sha256",
  ]);
  const boundRouteHash = readHash("boundRouteHash", [
    "boundRouteHash",
    "bound_route_hash",
    "routeHash",
    "route_hash",
    "destinationBindingHash",
    "destination_binding_hash",
  ]);
  const boundProofHash = readHash("boundProofHash", [
    "boundProofHash",
    "bound_proof_hash",
    "proofHash",
    "proof_hash",
    "proofArtifactHash",
    "proof_artifact_hash",
  ]);
  let expectedExports = [];
  try {
    expectedExports = readStringListAlias(record, label, [
      "expectedExports",
      "expected_exports",
      "exports",
      "exportNames",
      "export_names",
    ]);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (
    boundRouteHash &&
    expectedRouteHash &&
    boundRouteHash !== expectedRouteHash
  ) {
    problems.push(
      `${label}.boundRouteHash does not match destinationBindingHash.`,
    );
  }
  if (
    boundProofHash &&
    expectedProofHash &&
    boundProofHash !== expectedProofHash
  ) {
    problems.push(`${label}.boundProofHash does not match proofArtifactHash.`);
  }
  return {
    ref:
      problems.length === 0
        ? {
            moduleUrl,
            moduleSpecifier: moduleSpecifier || null,
            moduleHash,
            manifestHash,
            expectedExports,
            boundRouteHash,
            boundProofHash,
          }
        : null,
    problems,
  };
};
const FORBIDDEN_BSC_CONTRACT_ADDRESS_ALIASES = Object.freeze({
  sourceBridge: Object.freeze([
    "sccpTronSourceBridgeAddress",
    "sccp_tron_source_bridge_address",
    "tronSourceBridgeAddress",
    "tron_source_bridge_address",
  ]),
  verifier: Object.freeze([
    "tronVerifierAddress",
    "tron_verifier_address",
    "sccpTronDestinationVerifierAddress",
    "sccp_tron_destination_verifier_address",
  ]),
});
const collectRecordEntries = (record, keys, pathName) => {
  if (!isRecord(record)) {
    return [];
  }
  return keys
    .map((key) => ({
      key,
      path: `${pathName}.${key}`,
      value: readRecord(record, key),
    }))
    .filter((entry) => entry.value);
};
const toSnake = (value) =>
  value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

const diagnosticTextKeys = [
  "schema",
  "warning",
  "warnings",
  "note",
  "notes",
  "operatorWarning",
  "operator_warning",
  "verifierWarning",
  "verifier_warning",
  "verifierMaterialWarning",
  "verifier_material_warning",
  "diagnosticReason",
  "diagnostic_reason",
];
const diagnosticFlagKeys = [
  "diagnosticVerifier",
  "diagnostic_verifier",
  "diagnosticVerifierMaterial",
  "diagnostic_verifier_material",
  "diagnostic",
];
const productionPlaceholderPattern =
  /(?:change[-_ ]?me|changeme|dummy|example|mock|placeholder|replace[-_ ]?me|sample|stub|test[-_ ]?only|fixture[-_ ]?only|todo|your[-_ ]?[a-z0-9_-]*)/iu;
const REPEATED_BYTE_HEX32_PATTERN = /^0x([0-9a-f]{2})\1{31}$/iu;
const REPEATED_BYTE_EVM_ADDRESS_PATTERN = /^0x([0-9a-f]{2})\1{19}$/iu;
const diagnosticTextValue = (value) => {
  if (typeof value === "string") {
    return /\bdiagnostic\b/iu.test(value);
  }
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) => diagnosticTextValue(entry));
  }
  return false;
};
const diagnosticFlagReason = (record, pathName) => {
  if (!isRecord(record)) {
    return "";
  }
  for (const key of diagnosticFlagKeys) {
    if (hasOwn(record, key) && ownValue(record, key) === true) {
      return `${pathName}.${key}=true`;
    }
  }
  for (const key of diagnosticTextKeys) {
    if (hasOwn(record, key) && diagnosticTextValue(ownValue(record, key))) {
      return `${pathName}.${key} mentions diagnostic verifier material`;
    }
  }
  return "";
};
const productionPlaceholderReason = (
  value,
  pathName = "manifest",
  seen = new WeakSet(),
) => {
  if (typeof value === "string") {
    if (productionPlaceholderPattern.test(value)) {
      return `${pathName} contains placeholder, fixture-only, or test-only material`;
    }
    return "";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = productionPlaceholderReason(
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
  for (const key of Object.keys(value)) {
    const entry = ownValue(value, key);
    const childPath = `${pathName}.${key}`;
    if (productionPlaceholderPattern.test(key)) {
      return `${childPath} is placeholder, fixture-only, or test-only material`;
    }
    const reason = productionPlaceholderReason(entry, childPath, seen);
    if (reason) {
      return reason;
    }
  }
  return "";
};
const pickVerifierField = (record, names) => {
  for (const name of names) {
    const value = ownValue(record, name);
    if (value !== undefined) {
      return value;
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
const normalizeBn254FieldElement = (value, label) => {
  const parsed = BigInt(value);
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
const assertBn254G1Point = (point, label) => {
  if (point.length !== 2) {
    throw new Error(`${label} must contain two BN254 G1 coordinates`);
  }
  const x = normalizeBn254FieldElement(point[0], `${label}.x`);
  const y = normalizeBn254FieldElement(point[1], `${label}.y`);
  if (x === 0n && y === 0n) {
    throw new Error(`${label} must not be the BN254 point at infinity`);
  }
  if (bn254Mod(y * y) !== bn254Mod(x * x * x + 3n)) {
    throw new Error(`${label} must be on the BN254 G1 curve`);
  }
};
const assertBn254G1VectorPairs = (values, label) => {
  if (values.length % 2 !== 0) {
    throw new Error(`${label} must contain complete BN254 G1 coordinate pairs`);
  }
  for (let offset = 0; offset < values.length; offset += 2) {
    assertBn254G1Point(
      values.slice(offset, offset + 2),
      `${label}[${offset / 2}]`,
    );
  }
};
const assertBn254G2Point = (point, label) => {
  if (point.length !== 4) {
    throw new Error(`${label} must contain four BN254 G2 coordinates`);
  }
  const x = [
    normalizeBn254FieldElement(point[0], `${label}.x.c0`),
    normalizeBn254FieldElement(point[1], `${label}.x.c1`),
  ];
  const y = [
    normalizeBn254FieldElement(point[2], `${label}.y.c0`),
    normalizeBn254FieldElement(point[3], `${label}.y.c1`),
  ];
  if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) {
    throw new Error(`${label} must not be the BN254 G2 point at infinity`);
  }
  const expected = bn254Fp2Add(bn254Fp2Cube(x), BN254_TWIST_B_COEFFICIENT);
  if (!sameBn254Fp2(bn254Fp2Square(y), expected)) {
    throw new Error(`${label} must be on the BN254 G2 twist curve`);
  }
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
const smokeFixtureVerifierReason = (records) => {
  for (const { record, pathName } of records) {
    if (isSmokeFixtureGroth16VerifierMaterial(record)) {
      return `${pathName} matches the deterministic smoke-test Groth16 fixture key`;
    }
  }
  return "";
};
const verifierBn254MaterialReason = (records) => {
  for (const { record, pathName } of records) {
    if (!isRecord(record)) {
      continue;
    }
    try {
      assertBn254G1Point(
        normalizeVerifierVector(
          record,
          ["alpha1", "configuredAlpha1", "vk_alpha_1"],
          2,
        ),
        `${pathName}.alpha1`,
      );
      assertBn254G1VectorPairs(
        normalizeVerifierVector(
          record,
          ["ic", "configuredIc", "vk_ic", "IC"],
          20,
        ),
        `${pathName}.ic`,
      );
      assertBn254G2Point(
        normalizeVerifierVector(
          record,
          ["beta2", "configuredBeta2", "vk_beta_2"],
          4,
        ),
        `${pathName}.beta2`,
      );
      assertBn254G2Point(
        normalizeVerifierVector(
          record,
          ["gamma2", "configuredGamma2", "vk_gamma_2"],
          4,
        ),
        `${pathName}.gamma2`,
      );
      assertBn254G2Point(
        normalizeVerifierVector(
          record,
          ["delta2", "configuredDelta2", "vk_delta_2"],
          4,
        ),
        `${pathName}.delta2`,
      );
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return "";
};
export const isKnownDiagnosticBscVerifierKeyHash = (value) => {
  try {
    return SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES.has(
      normalizeHex32(value, "BSC verifier key hash"),
    );
  } catch (_error) {
    return false;
  }
};

const secretLikeTextReason = (value, pathName) => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    BSC_MANIFEST_SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    BSC_MANIFEST_SECRET_VALUE_PATTERN.test(normalized)
  ) {
    return `${pathName} must not contain private key material.`;
  }
  const words = normalized.toLowerCase().split(" ");
  if (
    BIP39_WORD_COUNTS.has(words.length) &&
    validateMnemonic(words.join(" "), wordlist)
  ) {
    return `${pathName} must not contain recovery phrases.`;
  }
  return "";
};

const unsafeBscManifestSecretReason = (
  value,
  pathName = "BSC route manifest",
  seen = new WeakSet(),
) => {
  if (typeof value === "string") {
    return secretLikeTextReason(value, pathName);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = unsafeBscManifestSecretReason(
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
  for (const key of Object.keys(value)) {
    const child = ownValue(value, key);
    if (BSC_MANIFEST_SECRET_KEY_PATTERN.test(key)) {
      return `${pathName}.${key} must not contain private key material.`;
    }
    const reason = unsafeBscManifestSecretReason(
      child,
      `${pathName}.${key}`,
      seen,
    );
    if (reason) {
      return reason;
    }
  }
  return "";
};

const BSC_CONTRACT_SELECTORS = Object.freeze({
  bridge: "0xe78cea92",
  bridgeLocked: "0x91a234e4",
  owner: "0x8da5cb5b",
  destinationBindingHash: "0xf491d991",
  verifier: "0x2b7ac3f3",
  verifierCodeHash: "0xf7178ac6",
  verifierKeyHash: "0x540d1398",
  verifyingKeyHash: "0x69b5d6d1",
  networkId: "0x9025e64c",
  expectedSourceDomain: "0xbbc0a1a4",
  expectedTargetDomain: "0xc73087ee",
});

const BSC_ROUTE_PREFLIGHT_CLI_OPTIONS = new Set([
  "torii-url",
  "manifest-file",
  "bsc-network",
  "check-bsc-contracts",
  "bsc-rpc-url",
  "allow-local-rpc",
  "timeout-ms",
  "output-dir",
]);

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (!BSC_ROUTE_PREFLIGHT_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC route preflight options.`,
      );
    }
    if (args[key] !== undefined) {
      throw new Error(
        `Duplicate option: --${key}. Repeatable options are documented in --help.`,
      );
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const hasHelpFlag = (argv) => argv.includes("--help") || argv.includes("-h");

const printUsage = () => {
  console.log(`Usage: node scripts/e2e/sccp-bsc-route-preflight.mjs [options]

Read-only TAIRA/BSC SCCP route preflight.

Options:
  --torii-url URL              TAIRA Torii endpoint
  --manifest-file PATH         Validate local route manifest JSON
  --bsc-network testnet|mainnet
  --check-bsc-contracts true|false
  --bsc-rpc-url URL
  --allow-local-rpc
  --timeout-ms MS
  --output-dir DIR
  --help, -h                   Show this help without running checks

Environment:
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_TAIRA_TORII_URL
  SCCP_ROUTE_MANIFEST_FILE
  SCCP_BSC_RPC_URL
  BSC_RPC_URL
  SCCP_BSC_PREFLIGHT_OUTPUT_DIR`);
};

const normalizeBaseUrl = (value) => {
  return normalizeToriiEndpoint(value || DEFAULT_TAIRA_TORII_URL);
};

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

export const normalizeBscRpcEndpoint = (
  value = BSC_TESTNET_RPC_URL,
  { allowLocal = false } = {},
) => {
  const endpoint = trim(value) || BSC_TESTNET_RPC_URL;
  let url;
  try {
    url = new URL(endpoint);
  } catch (_error) {
    throw new Error("BSC RPC URL must be a valid URL.");
  }
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    throw new Error("BSC RPC URL must use HTTPS unless localhost is allowed.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "BSC RPC URL must not contain credentials, query strings, or fragments.",
    );
  }
  if (url.protocol === "http:" && !isLocalhost) {
    throw new Error("HTTP BSC RPC URLs are only allowed for localhost.");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString().replace(/\/$/u, "");
};

const redactEndpointForReport = (endpoint) => {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch (_error) {
    return "<invalid>";
  }
};

const responseContentLength = (response) => {
  const raw = response.headers.get?.("content-length") ?? "";
  if (!/^\d+$/u.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const readResponseTextBounded = async (response, label, maxBytes) => {
  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(
      `${label} response is ${contentLength} bytes; maximum allowed is ${maxBytes} bytes.`,
    );
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
          throw new Error(
            `${label} response exceeds ${maxBytes} bytes; refusing to parse remote JSON.`,
          );
        }
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total).toString("utf8");
  }

  if (typeof response.arrayBuffer === "function") {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new Error(
        `${label} response exceeds ${maxBytes} bytes; refusing to parse remote JSON.`,
      );
    }
    return bytes.toString("utf8");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error(
      `${label} response exceeds ${maxBytes} bytes; refusing to parse remote JSON.`,
    );
  }
  return text;
};

const readResponseSnippet = async (response, label) => {
  try {
    return (
      await readResponseTextBounded(
        response,
        label,
        SCCP_BSC_REMOTE_ERROR_MAX_BYTES,
      )
    ).slice(0, 300);
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }
};

const readJsonResponse = async (
  response,
  label,
  maxBytes = SCCP_BSC_REMOTE_JSON_EVIDENCE_MAX_BYTES,
) => {
  const text = await readResponseTextBounded(response, label, maxBytes);
  let payload;
  try {
    payload = parseJsonWithoutDuplicateKeys(text, `${label} response`);
  } catch (error) {
    throw new Error(
      `${label} response must be valid JSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
    );
  }
  if (!isRecord(payload)) {
    throw new Error(`${label} response must be a JSON object.`);
  }
  return payload;
};

const fetchJson = async (fetchImpl, url, label, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await readResponseSnippet(response, label);
      throw new Error(
        `${label} returned HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    return await readJsonResponse(response, label);
  } finally {
    clearTimeout(timeout);
  }
};

let nextJsonRpcId = 1;

const postBscJsonRpc = async (
  fetchImpl,
  endpoint,
  method,
  params,
  label,
  timeoutMs,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const id = nextJsonRpcId;
  nextJsonRpcId += 1;
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await readResponseSnippet(response, label);
      throw new Error(
        `${label} returned HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    const payload = await readJsonResponse(response, label);
    if (isRecord(payload.error)) {
      throw new Error(
        `${label} RPC error: ${trim(payload.error.message) || JSON.stringify(payload.error).slice(0, 300)}`,
      );
    }
    if (typeof payload.result !== "string") {
      throw new Error(`${label} response result must be a string.`);
    }
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
};

const collectManifestRecords = (payload) => {
  const records = [];
  const errors = [];
  const appendArrayRecords = (value, label) => {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array.`);
      return;
    }
    for (const [index, entry] of ownArrayEntries(value)) {
      if (!isRecord(entry)) {
        errors.push(`${label}[${index}] must be an object.`);
        continue;
      }
      records.push(entry);
    }
  };
  if (Array.isArray(payload)) {
    appendArrayRecords(payload, "manifest payload");
    return { records, errors };
  }
  if (!isRecord(payload)) {
    if (payload !== null && payload !== undefined) {
      errors.push("manifest payload must be an object or array.");
    }
    return { records, errors };
  }
  for (const key of [
    "manifests",
    "items",
    "routes",
    "proofManifests",
    "proof_manifests",
  ]) {
    const collection = ownValue(payload, key);
    if (collection === undefined) {
      continue;
    }
    appendArrayRecords(collection, key);
  }
  const directRouteId = readFirstString(
    payload,
    "routeId",
    "route_id",
    "route",
    "id",
  );
  const directAssetKey = readFirstString(
    payload,
    "assetKey",
    "asset_key",
    "assetId",
    "asset_id",
  );
  if (directRouteId || directAssetKey) {
    records.unshift(payload);
  }
  return { records, errors };
};
const manifestRecords = (payload) => collectManifestRecords(payload).records;
const manifestRecordShapeErrors = (payload) =>
  collectManifestRecords(payload).errors;

const normalizeHex32 = (value, label) => {
  const normalized = `0x${trim(value).toLowerCase().replace(/^0x/u, "")}`;
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const normalizeNonZeroHex32 = (value, label) => {
  const normalized = normalizeHex32(value, label);
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const normalizeBscExplorerTxUrl = (
  value,
  label,
  expectedTxHash,
  profile = defaultBscNetworkProfile(),
) => {
  const text = trim(value);
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  let url;
  try {
    url = new URL(text);
  } catch (_error) {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== profile.explorerHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${label} must be an HTTPS ${profile.label} explorer transaction URL without credentials, query strings, or fragments.`,
    );
  }
  const match = url.pathname
    .replace(/\/+$/u, "")
    .match(/^\/tx\/0x([0-9a-f]{64})$/iu);
  if (!match) {
    throw new Error(`${label} must use the /tx/0x<hash> path.`);
  }
  const expected = normalizeNonZeroHex32(
    expectedTxHash,
    `${label} transaction id`,
  );
  const actual = `0x${match[1].toLowerCase()}`;
  if (actual !== expected) {
    throw new Error(`${label} transaction hash must match ${expected}.`);
  }
  return `${profile.explorerUrl}/tx/${expected}`;
};

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

export const canonicalBscNativeEvmProverBundleHash = (normalizedBundle) =>
  sha256Hex(Buffer.from(JSON.stringify(normalizedBundle), "utf8"));

const nativeProverBundleRoleSeparationProblems = (fields, label) => {
  const seen = new Map();
  const problems = [];
  for (const [key, role] of NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS) {
    const value = fields[key];
    if (!value) {
      continue;
    }
    const previous = seen.get(value);
    if (previous) {
      problems.push(`${label}.${role} must be role-separated from ${previous}`);
    } else {
      seen.set(value, role);
    }
  }
  return problems;
};

const strictBase64DecodedBytes = (value, label) => {
  const text = trim(value);
  if (!text || /\s/u.test(text)) {
    throw new Error(`${label} must be strict base64 without whitespace.`);
  }
  const decoded = Buffer.from(text, "base64");
  if (!decoded.length || decoded.toString("base64") !== text) {
    throw new Error(`${label} must be strict base64.`);
  }
  return decoded;
};

const BSC_BURN_RECORD_PLACEHOLDER_TEXT_RE =
  /(?:diagnostic|dummy|fixture|mock|placeholder|stub|test-only)/iu;
const BSC_BURN_RECORD_PRODUCTION_MIN_UNIQUE_BYTES = 16;
const BSC_BURN_RECORD_PRODUCTION_MAX_PATTERN_BYTES = 64;
const BSC_BURN_RECORD_PRODUCTION_MAX_DOMINANT_FRACTION = 0.98;

const repeatedPrefixPatternLength = (
  bytes,
  maxPatternLength = BSC_BURN_RECORD_PRODUCTION_MAX_PATTERN_BYTES,
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
  if (bytes.length < 16) {
    return null;
  }
  const delta = (bytes[1] - bytes[0] + 256) & 0xff;
  for (let index = 2; index < bytes.length; index += 1) {
    if (((bytes[index] - bytes[index - 1] + 256) & 0xff) !== delta) {
      return null;
    }
  }
  return delta;
};

const dominantByteFrequency = (bytes) => {
  const counts = new Uint32Array(256);
  let dominantByte = 0;
  let dominantCount = 0;
  for (const byte of bytes) {
    const count = counts[byte] + 1;
    counts[byte] = count;
    if (count > dominantCount) {
      dominantByte = byte;
      dominantCount = count;
    }
  }
  return { byte: dominantByte, count: dominantCount };
};

export const bscBurnRecordProductionArtifactProblems = (
  bytes,
  label = "TAIRA burn-record artifact",
) => {
  const problems = [];
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    return [`${label} must be bytes.`];
  }
  if (bytes.length < SCCP_BSC_BURN_RECORD_PRODUCTION_ARTIFACT_MIN_BYTES) {
    problems.push(
      `${label} must be at least ${SCCP_BSC_BURN_RECORD_PRODUCTION_ARTIFACT_MIN_BYTES} bytes for production-ready BSC routes.`,
    );
  }
  if (
    BSC_BURN_RECORD_PLACEHOLDER_TEXT_RE.test(
      Buffer.from(bytes).toString("utf8"),
    )
  ) {
    problems.push(
      `${label} looks like placeholder burn-record material: text contains fixture, diagnostic, mock, stub, dummy, or placeholder markers.`,
    );
  }
  const repeatedPatternLength = repeatedPrefixPatternLength(bytes);
  if (repeatedPatternLength > 0) {
    problems.push(
      `${label} looks like placeholder burn-record material: repeated ${repeatedPatternLength}-byte pattern.`,
    );
  }
  const arithmeticDelta = constantByteDelta(bytes);
  if (arithmeticDelta !== null) {
    problems.push(
      `${label} looks like placeholder burn-record material: arithmetic byte sequence with step ${arithmeticDelta}.`,
    );
  }
  const dominant = dominantByteFrequency(bytes);
  if (
    dominant.count / bytes.length >
    BSC_BURN_RECORD_PRODUCTION_MAX_DOMINANT_FRACTION
  ) {
    problems.push(
      `${label} looks like placeholder burn-record material: byte 0x${dominant.byte
        .toString(16)
        .padStart(
          2,
          "0",
        )} dominates ${dominant.count} of ${bytes.length} bytes.`,
    );
  }
  const uniqueBytes = new Set();
  for (const byte of bytes) {
    uniqueBytes.add(byte);
    if (uniqueBytes.size >= BSC_BURN_RECORD_PRODUCTION_MIN_UNIQUE_BYTES) {
      break;
    }
  }
  if (uniqueBytes.size < BSC_BURN_RECORD_PRODUCTION_MIN_UNIQUE_BYTES) {
    problems.push(
      `${label} looks like placeholder burn-record material: only ${uniqueBytes.size} unique byte values across ${bytes.length} bytes.`,
    );
  }
  return problems;
};

export const assertBscBurnRecordProductionArtifact = (
  bytes,
  label = "TAIRA burn-record artifact",
) => {
  const problems = bscBurnRecordProductionArtifactProblems(bytes, label);
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
};

const normalizeBscNetworkIdHex = (
  value,
  label = "BSC networkIdHex",
  profile = defaultBscNetworkProfile(),
) => {
  const normalized = trim(value).toLowerCase();
  if (normalized === profile.chainIdHex) {
    return profile.networkIdHex;
  }
  if (normalized !== profile.networkIdHex) {
    throw new Error(
      `${label} must target ${profile.label} network id ${profile.networkIdHex}.`,
    );
  }
  return normalized;
};

const normalizeEvmAddress = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a 20-byte EVM address.`);
  }
  if (/^0x0{40}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  if (REPEATED_BYTE_EVM_ADDRESS_PATTERN.test(normalized)) {
    throw new Error(`${label} must not be repeated-byte placeholder material.`);
  }
  return normalized;
};

const normalizeHexData = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})*$/u.test(normalized)) {
    throw new Error(`${label} must be hex data.`);
  }
  return normalized;
};

const normalizeRpcQuantity = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(normalized)) {
    throw new Error(`${label} must be an EVM hex quantity.`);
  }
  return normalized;
};

const normalizeAbiWord = (value, label) => {
  const normalized = normalizeHexData(value, label);
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be one ABI word.`);
  }
  return normalized;
};

const readAbiAddress = (value, label) =>
  normalizeEvmAddress(`0x${normalizeAbiWord(value, label).slice(-40)}`, label);

const readAbiBool = (value, label) => {
  const word = normalizeAbiWord(value, label);
  if (/^0x0{63}0$/u.test(word)) {
    return false;
  }
  if (/^0x0{63}1$/u.test(word)) {
    return true;
  }
  throw new Error(`${label} must be an ABI boolean.`);
};

const readAbiBytes32 = (value, label) => normalizeAbiWord(value, label);
const readAbiUint32 = (value, label) => {
  const parsed = BigInt(normalizeAbiWord(value, label));
  if (parsed > 0xffffffffn) {
    throw new Error(`${label} must fit uint32.`);
  }
  return Number(parsed);
};

const readOptionalPositiveSafeInteger = (record, ...keys) => {
  for (const key of keys) {
    if (!isRecord(record) || !hasOwn(record, key)) {
      continue;
    }
    const value = ownValue(record, key);
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${key} must be a positive safe integer.`);
    }
    return parsed;
  }
  return null;
};

const readBscManifestContractAddresses = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  return {
    bridge: readConsistentEvmAliasString("BSC bridge address", [
      {
        record: manifest,
        keys: [
          "bscBridgeAddress",
          "bsc_bridge_address",
          "tairaXorBridgeAddress",
          "taira_xor_bridge_address",
          "bridgeAddress",
          "bridge_address",
        ],
      },
      {
        record: rollout,
        keys: ["destinationBridgeAddress", "destination_bridge_address"],
      },
    ]),
    token: readConsistentEvmAliasString("BSC token address", [
      {
        record: manifest,
        keys: [
          "bscTokenAddress",
          "bsc_token_address",
          "tairaXorTokenAddress",
          "taira_xor_token_address",
          "tokenAddress",
          "token_address",
        ],
      },
    ]),
    sourceBridge: readConsistentEvmAliasString("BSC source bridge address", [
      {
        record: manifest,
        keys: [
          "sccpBscSourceBridgeAddress",
          "sccp_bsc_source_bridge_address",
          "bscSourceBridgeAddress",
          "bsc_source_bridge_address",
          "sccpTronSourceBridgeAddress",
          "sccp_tron_source_bridge_address",
          "tronSourceBridgeAddress",
          "tron_source_bridge_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ],
      },
    ]),
    verifier: readConsistentEvmAliasString("BSC verifier address", [
      {
        record: manifest,
        keys: [
          "sccpBscDestinationVerifierAddress",
          "sccp_bsc_destination_verifier_address",
          "destinationVerifierAddress",
          "destination_verifier_address",
          "verifierAddress",
          "verifier_address",
          "bscVerifierAddress",
          "bsc_verifier_address",
          "evmVerifierAddress",
          "evm_verifier_address",
          "tronVerifierAddress",
          "tron_verifier_address",
          "sccpTronDestinationVerifierAddress",
          "sccp_tron_destination_verifier_address",
        ],
      },
      {
        record: rollout,
        keys: ["verifierIdentity", "verifier_identity"],
      },
    ]),
  };
};

const readBscManifestContractAddressResult = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  const sourcesByAddress = {
    bridge: [
      {
        record: manifest,
        keys: [
          "bscBridgeAddress",
          "bsc_bridge_address",
          "tairaXorBridgeAddress",
          "taira_xor_bridge_address",
          "bridgeAddress",
          "bridge_address",
        ],
        sourceLabel: "route manifest",
      },
      {
        record: rollout,
        keys: ["destinationBridgeAddress", "destination_bridge_address"],
        sourceLabel: "route manifest destinationRollout",
      },
    ],
    token: [
      {
        record: manifest,
        keys: [
          "bscTokenAddress",
          "bsc_token_address",
          "tairaXorTokenAddress",
          "taira_xor_token_address",
          "tokenAddress",
          "token_address",
        ],
        sourceLabel: "route manifest",
      },
    ],
    sourceBridge: [
      {
        record: manifest,
        keys: [
          "sccpBscSourceBridgeAddress",
          "sccp_bsc_source_bridge_address",
          "bscSourceBridgeAddress",
          "bsc_source_bridge_address",
          "sccpTronSourceBridgeAddress",
          "sccp_tron_source_bridge_address",
          "tronSourceBridgeAddress",
          "tron_source_bridge_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ],
        sourceLabel: "route manifest",
      },
    ],
    verifier: [
      {
        record: manifest,
        keys: [
          "sccpBscDestinationVerifierAddress",
          "sccp_bsc_destination_verifier_address",
          "destinationVerifierAddress",
          "destination_verifier_address",
          "verifierAddress",
          "verifier_address",
          "bscVerifierAddress",
          "bsc_verifier_address",
          "evmVerifierAddress",
          "evm_verifier_address",
          "tronVerifierAddress",
          "tron_verifier_address",
          "sccpTronDestinationVerifierAddress",
          "sccp_tron_destination_verifier_address",
        ],
        sourceLabel: "route manifest",
      },
      {
        record: rollout,
        keys: ["verifierIdentity", "verifier_identity"],
        sourceLabel: "route manifest destinationRollout",
      },
    ],
  };
  const addresses = {};
  const errors = {};
  for (const [label, sources] of Object.entries(sourcesByAddress)) {
    const addressLabel = `BSC ${label === "sourceBridge" ? "source bridge" : label} address`;
    let aliasError = "";
    try {
      assertSingleStringAliasPerSource(addressLabel, sources);
    } catch (error) {
      aliasError = error instanceof Error ? error.message : String(error);
    }
    const forbiddenAliases = (
      FORBIDDEN_BSC_CONTRACT_ADDRESS_ALIASES[label] ?? []
    ).flatMap((key) =>
      sources.some(({ record }) => readString(record, key)) ? [key] : [],
    );
    if (forbiddenAliases.length > 0) {
      aliasError = [
        aliasError,
        `${addressLabel} must not use TRON aliases on a BSC route manifest: ${forbiddenAliases.join(", ")}.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
    try {
      addresses[label] = readConsistentEvmAliasString(addressLabel, sources);
      if (aliasError) {
        errors[label] = aliasError;
      }
    } catch (error) {
      addresses[label] = "";
      errors[label] =
        aliasError || (error instanceof Error ? error.message : String(error));
    }
  }
  return { addresses, errors };
};

const normalizeBscManifestContractAddresses = (manifest) =>
  Object.fromEntries(
    Object.entries(readBscManifestContractAddresses(manifest)).map(
      ([label, value]) => [
        label,
        normalizeEvmAddress(value, `${label} address`),
      ],
    ),
  );

const readDestinationRollout = (manifest) =>
  readFirstRecord(manifest, "destinationRollout", "destination_rollout");

const manifestTargetsBsc = (manifest) => {
  const counterpartyDomain =
    readNumber(manifest, "counterpartyDomain") ??
    readNumber(manifest, "counterparty_domain");
  const chain = readString(manifest, "chain").toLowerCase();
  const codec =
    readString(manifest, "counterpartyAccountCodecKey") ||
    readString(manifest, "counterparty_account_codec_key");
  return (
    counterpartyDomain === SCCP_BSC_DOMAIN ||
    chain.includes("bsc") ||
    (codec === "evm_hex" &&
      (readString(manifest, "verifierTarget") ||
        readString(manifest, "verifier_target")) === "EvmContract")
  );
};

const manifestMatchesRoute = (manifest) => {
  const routeId = readFirstString(
    manifest,
    "routeId",
    "route_id",
    "route",
    "id",
  );
  const assetKey = readFirstString(
    manifest,
    "assetKey",
    "asset_key",
    "assetId",
    "asset_id",
  );
  return routeId === SCCP_ROUTE_ID && assetKey === SCCP_ASSET_KEY;
};

const manifestMatchesBscNetworkProfile = (manifest, profile) => {
  const manifestNetwork = readBscNetworkKeyFromManifest(manifest);
  return !manifestNetwork || manifestNetwork === profile.key;
};

const matchingBscRouteManifests = (
  manifestSet,
  profile = defaultBscNetworkProfile(),
) =>
  manifestRecords(manifestSet).filter(
    (manifest) =>
      manifestTargetsBsc(manifest) &&
      manifestMatchesRoute(manifest) &&
      manifestMatchesBscNetworkProfile(manifest, profile),
  );

const pickBscRouteManifest = (
  manifestSet,
  profile = defaultBscNetworkProfile(),
) => matchingBscRouteManifests(manifestSet, profile)[0] ?? null;

const check = (checks, id, ok, message, detail) => {
  checks.push({ id, ok, message, ...(detail ? { detail } : {}) });
};

const validateTairaNetwork = (checks, chainMetadata, errors = {}) => {
  const observedChainId = trim(chainMetadata?.chainId);
  const observedNetworkPrefix = Number(chainMetadata?.networkPrefix);
  const ok =
    observedChainId === TAIRA_CHAIN_ID &&
    observedNetworkPrefix === TAIRA_NETWORK_PREFIX;
  check(
    checks,
    "taira-network",
    ok,
    "Endpoint reports TAIRA chain id and I105 prefix.",
    ok
      ? `${observedChainId} / ${observedNetworkPrefix}`
      : errors.chainMetadata ||
          `Observed ${observedChainId || "<missing>"} / ${
            Number.isFinite(observedNetworkPrefix)
              ? observedNetworkPrefix
              : "<missing>"
          }.`,
  );
};

const validateWarnings = (checks, warnings = []) => {
  for (const warning of warnings) {
    check(
      checks,
      "endpoint-warning",
      true,
      "Endpoint metadata warning.",
      warning,
    );
  }
};

const validateCapabilities = (checks, capabilities) => {
  const proofSubmitPath = readFirstString(
    capabilities,
    "proofSubmitPath",
    "proof_submit_path",
  );
  const messageSubmitPath = readFirstString(
    capabilities,
    "messageSubmitPath",
    "message_submit_path",
  );
  const ok =
    proofSubmitPath === "/v1/bridge/proofs/submit" &&
    messageSubmitPath === "/v1/bridge/messages";
  check(
    checks,
    "sccp-submit-paths",
    ok,
    "TAIRA exposes SCCP proof and bridge-message submit paths.",
    ok
      ? ""
      : `proof=${proofSubmitPath || "<missing>"} message=${messageSubmitPath || "<missing>"}`,
  );
};

const validateBscNativeEvmProverBundle = ({
  checks,
  manifest,
  rollout,
  profile = defaultBscNetworkProfile(),
  verifierKeyHash,
  proofArtifactHash,
  provingKeyHash,
  destinationBindingHash,
  expectedNativeEvmProverBundleHash,
  required = true,
}) => {
  const entries = [
    ...collectRecordEntries(
      manifest,
      NATIVE_EVM_PROVER_BUNDLE_KEYS,
      "manifest",
    ),
    ...collectRecordEntries(
      rollout,
      NATIVE_EVM_PROVER_BUNDLE_KEYS,
      "manifest.destinationRollout",
    ),
  ];
  const reasons = [];
  if (entries.length === 0) {
    if (!required) {
      return null;
    }
    reasons.push("nativeEvmProverBundle is required");
  }
  if (!verifierKeyHash) {
    reasons.push("route verifierKeyHash is required");
  }
  if (!proofArtifactHash) {
    reasons.push("route proofArtifactHash is required");
  }
  if (!provingKeyHash) {
    reasons.push("route provingKeyHash is required");
  }
  if (!destinationBindingHash) {
    reasons.push("route destinationBindingHash is required");
  }

  let selectedJson = "";
  let selectedPath = "";
  let selected = null;
  for (const entry of entries) {
    const verifierKeyArtifactHashAliases =
      NATIVE_EVM_PROVER_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_KEYS.filter((key) =>
        hasOwn(entry.value, key),
      );
    if (verifierKeyArtifactHashAliases.length === 0) {
      reasons.push(`${entry.path}.verifierKeyArtifactHash is required`);
    } else if (verifierKeyArtifactHashAliases.length > 1) {
      reasons.push(
        `${entry.path}.verifierKeyArtifactHash must not use multiple aliases`,
      );
    }
    let normalized;
    try {
      const validateBundle =
        profile.key === "mainnet"
          ? validateBscMainnetNativeEvmProverBundle
          : validateBscTestnetNativeEvmProverBundle;
      normalized = validateBundle(entry.value, {
        expectedDestinationBindingHash: destinationBindingHash || undefined,
      });
    } catch (error) {
      reasons.push(
        `${entry.path} failed BSC SDK validation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (verifierKeyHash && normalized.verifierKeyHash !== verifierKeyHash) {
      reasons.push(`${entry.path}.verifierKeyHash does not match route`);
    }
    if (normalized.verifierKeyArtifactHash === normalized.verifierKeyHash) {
      reasons.push(
        `${entry.path}.verifierKeyArtifactHash must be role-separated from verifierKeyHash`,
      );
    }
    reasons.push(
      ...nativeProverBundleRoleSeparationProblems(
        {
          verifierKeyHash: normalized.verifierKeyHash,
          verifierKeyArtifactHash: normalized.verifierKeyArtifactHash,
          proofArtifactHash: normalized.proofArtifactHash,
          provingKeyHash: normalized.provingKeyHash,
          groth16ProofSelfTestHash: normalized.groth16ProofSelfTestHash,
          destinationBindingHash: normalized.destinationBindingHash,
        },
        entry.path,
      ),
    );
    if (
      proofArtifactHash &&
      normalized.proofArtifactHash !== proofArtifactHash
    ) {
      reasons.push(`${entry.path}.proofArtifactHash does not match route`);
    }
    if (provingKeyHash && normalized.provingKeyHash !== provingKeyHash) {
      reasons.push(`${entry.path}.provingKeyHash does not match route`);
    }
    const normalizedJson = JSON.stringify(normalized);
    if (selected && selectedJson !== normalizedJson) {
      reasons.push(
        `nativeEvmProverBundle aliases disagree: ${selectedPath} does not match ${entry.path}`,
      );
    }
    selected = normalized;
    selectedJson = normalizedJson;
    selectedPath = entry.path;
  }
  if (selected) {
    const selectedHash = canonicalBscNativeEvmProverBundleHash(selected);
    if (
      expectedNativeEvmProverBundleHash &&
      selectedHash !== expectedNativeEvmProverBundleHash
    ) {
      reasons.push("nativeEvmProverBundleHash does not match route");
    }
    for (const [label, value] of [
      ["verifierKeyHash", verifierKeyHash],
      ["verifierKeyArtifactHash", selected.verifierKeyArtifactHash],
      ["proofArtifactHash", proofArtifactHash],
      ["provingKeyHash", provingKeyHash],
      ["groth16ProofSelfTestHash", selected.groth16ProofSelfTestHash],
      ["destinationBindingHash", destinationBindingHash],
    ]) {
      if (value && selectedHash === value) {
        reasons.push(`nativeEvmProverBundleHash must not equal ${label}`);
      }
    }
  }

  check(
    checks,
    "bsc-native-evm-prover-bundle",
    reasons.length === 0,
    "BSC native EVM prover bundle is SDK-valid and bound to the route.",
    reasons.join("; "),
  );
  return selected;
};

const validateBscManifest = (
  checks,
  manifest,
  {
    requireNativeProverBundle = true,
    profile = defaultBscNetworkProfile(),
  } = {},
) => {
  if (!manifest) {
    check(
      checks,
      "bsc-route-manifest",
      false,
      `TAIRA advertises the taira_bsc_xor ${profile.label} manifest.`,
      "No route manifest matched routeId=taira_bsc_xor assetKey=xor.",
    );
    return null;
  }
  check(
    checks,
    "bsc-route-manifest",
    true,
    `TAIRA advertises the taira_bsc_xor ${profile.label} manifest.`,
  );
  const secretReason = unsafeBscManifestSecretReason(manifest);
  check(
    checks,
    "bsc-manifest-secret-scan",
    !secretReason,
    "BSC route manifest does not contain signing secrets.",
    secretReason ? "BSC route manifest contains secret-like material." : "",
  );
  const rollout = readDestinationRollout(manifest);
  const recordAliasReasons = [
    recordAliasConflictReason(manifest, "route manifest destinationRollout", [
      "destinationRollout",
      "destination_rollout",
    ]),
    recordAliasConflictReason(manifest, "route manifest destinationBinding", [
      "destinationBinding",
      "destination_binding",
    ]),
    recordAliasConflictReason(
      manifest,
      "route manifest postDeployLiveEvidence",
      ["postDeployLiveEvidence", "post_deploy_live_evidence"],
    ),
    recordAliasConflictReason(manifest, "route manifest tairaXorBurnRecord", [
      "tairaXorBurnRecord",
      "taira_xor_burn_record",
      "burnRecord",
      "burn_record",
    ]),
    recordAliasConflictReason(manifest, "route manifest verifierMaterial", [
      "verifierMaterial",
      "verifier_material",
      "verifyingKey",
      "verifying_key",
      "verifierKey",
      "verifier_key",
    ]),
    recordAliasConflictReason(
      rollout,
      "route manifest destinationRollout verifierMaterial",
      [
        "verifierMaterial",
        "verifier_material",
        "verifyingKey",
        "verifying_key",
        "verifierKey",
        "verifier_key",
      ],
    ),
  ].filter(Boolean);
  check(
    checks,
    "bsc-record-aliases",
    recordAliasReasons.length === 0,
    "BSC route manifest does not use ambiguous object aliases.",
    recordAliasReasons.join("; "),
  );
  let routeId = "";
  let assetKey = "";
  let routeIdentityError = "";
  try {
    assertSingleStringAliasPerSource("BSC route id", [
      {
        record: manifest,
        keys: ["routeId", "route_id", "route", "id"],
        sourceLabel: "route manifest",
      },
    ]);
    routeId = readConsistentAliasString("BSC route id", [
      { record: manifest, keys: ["routeId", "route_id", "route", "id"] },
    ]);
    assertSingleStringAliasPerSource("BSC asset key", [
      {
        record: manifest,
        keys: ["assetKey", "asset_key", "assetId", "asset_id"],
        sourceLabel: "route manifest",
      },
    ]);
    assetKey = readConsistentAliasString("BSC asset key", [
      {
        record: manifest,
        keys: ["assetKey", "asset_key", "assetId", "asset_id"],
      },
    ]);
  } catch (error) {
    routeIdentityError = error instanceof Error ? error.message : String(error);
  }
  check(
    checks,
    "bsc-route-identity",
    !routeIdentityError &&
      routeId === SCCP_ROUTE_ID &&
      assetKey === SCCP_ASSET_KEY,
    "BSC route manifest uses the taira_bsc_xor XOR route identity.",
    routeIdentityError ||
      `routeId=${routeId || "<missing>"} assetKey=${assetKey || "<missing>"}`,
  );
  const productionReadyResult = readConsistentBooleanAlias(
    manifest,
    "productionReady",
    ["productionReady", "production_ready"],
  );
  const productionReady =
    productionReadyResult.value === true &&
    productionReadyResult.problems.length === 0;
  const disabledReason = readFirstString(
    manifest,
    "disabledReason",
    "disabled_reason",
  );
  check(
    checks,
    "bsc-production-ready",
    productionReady,
    "BSC route is production-ready.",
    productionReady
      ? ""
      : productionReadyResult.problems.length > 0
        ? productionReadyResult.problems.join("; ")
        : productionReadyResult.present && productionReadyResult.value !== false
          ? "productionReady must be boolean true."
          : disabledReason || "productionReady is not true.",
  );
  check(
    checks,
    "bsc-production-disabled-conflict",
    !productionReady || !disabledReason,
    "Production-ready BSC routes do not carry disabled reasons.",
    productionReady && disabledReason ? `disabledReason=${disabledReason}` : "",
  );
  const placeholderReason = productionReady
    ? productionPlaceholderReason(manifest)
    : "";
  check(
    checks,
    "bsc-production-placeholder-scan",
    !placeholderReason,
    "Production-ready BSC route manifest does not carry placeholder, fixture-only, or test-only material.",
    placeholderReason,
  );
  let counterpartyDomain = null;
  let counterpartyDomainError = "";
  try {
    counterpartyDomain = readConsistentAliasNumber("BSC counterpartyDomain", [
      { record: manifest, keys: ["counterpartyDomain", "counterparty_domain"] },
    ]);
  } catch (error) {
    counterpartyDomainError =
      error instanceof Error ? error.message : String(error);
  }
  check(
    checks,
    "bsc-domain",
    !counterpartyDomainError && counterpartyDomain === SCCP_BSC_DOMAIN,
    "BSC route uses SCCP counterparty domain 2.",
    counterpartyDomainError ||
      `counterpartyDomain=${counterpartyDomain ?? "<missing>"}`,
  );
  let codec = "";
  let codecId = null;
  let codecError = "";
  try {
    codec = readConsistentAliasString(
      "BSC counterpartyAccountCodecKey",
      [
        {
          record: manifest,
          keys: [
            "counterpartyAccountCodecKey",
            "counterparty_account_codec_key",
          ],
        },
      ],
      (value) => value.trim().toLowerCase(),
    );
    codecId = readConsistentAliasNumber("BSC counterpartyAccountCodec", [
      {
        record: manifest,
        keys: ["counterpartyAccountCodec", "counterparty_account_codec"],
      },
    ]);
  } catch (error) {
    codecError = error instanceof Error ? error.message : String(error);
  }
  const codecOk =
    !counterpartyDomainError &&
    !codecError &&
    counterpartyDomain === SCCP_BSC_DOMAIN &&
    (!codec || codec === "evm_hex") &&
    (codecId === null || codecId === 2);
  check(
    checks,
    "bsc-codec",
    codecOk,
    "BSC route uses evm_hex account codec.",
    codecError ||
      (!codec && codecId === null
        ? "codec=<missing> codecId=<missing> inferred from BSC counterparty domain"
        : `codec=${codec || "<missing>"} codecId=${codecId ?? "<missing>"}`),
  );
  let networkId = "";
  let networkIdError = "";
  try {
    networkId = readConsistentAliasString(
      "BSC networkIdHex",
      [
        { record: manifest, keys: ["networkIdHex", "network_id_hex"] },
        {
          record: rollout,
          keys: ["destinationNetworkId", "destination_network_id"],
        },
        {
          record: readFirstRecord(
            manifest,
            "destinationBinding",
            "destination_binding",
          ),
          keys: ["networkIdHex", "network_id_hex"],
        },
      ],
      (value, label) => normalizeBscNetworkIdHex(value, label, profile),
    );
  } catch (error) {
    networkIdError = error instanceof Error ? error.message : String(error);
  }
  let chainIdHex = "";
  let chainIdError = "";
  try {
    chainIdHex = readConsistentAliasString(
      "BSC chainIdHex",
      [{ record: manifest, keys: ["chainIdHex", "chain_id_hex"] }],
      (value, label) => {
        const normalized = value.trim().toLowerCase();
        if (!/^0x[0-9a-f]+$/u.test(normalized)) {
          throw new Error(`${label} must be a 0x-prefixed hex string`);
        }
        return normalized;
      },
    );
  } catch (error) {
    chainIdError = error instanceof Error ? error.message : String(error);
  }
  const chainIdOk =
    !chainIdError &&
    (chainIdHex === profile.chainIdHex || (!productionReady && !chainIdHex));
  check(
    checks,
    profile.key === "testnet" ? "bsc-testnet-chain-id" : "bsc-mainnet-chain-id",
    chainIdOk,
    `BSC route declares ${profile.label} chain id ${Number.parseInt(profile.chainIdHex.slice(2), 16)}.`,
    chainIdError ||
      (chainIdOk
        ? chainIdHex || "chainIdHex omitted on disabled legacy route draft"
        : `chainIdHex=${chainIdHex || "<missing>"} expected=${profile.chainIdHex}`),
  );
  let normalizedNetworkId = "";
  try {
    normalizedNetworkId = normalizeBscNetworkIdHex(
      networkId,
      "BSC networkIdHex",
      profile,
    );
  } catch (error) {
    normalizedNetworkId = "";
  }
  check(
    checks,
    profile.key === "testnet"
      ? "bsc-testnet-network-id"
      : "bsc-mainnet-network-id",
    normalizedNetworkId === profile.networkIdHex,
    `BSC route is bound to ${profile.label} network id ${Number.parseInt(profile.chainIdHex.slice(2), 16)}.`,
    networkIdError ||
      `networkId=${networkId || "<missing>"} expected=${profile.networkIdHex}`,
  );
  let explorerUrl = "";
  let explorerHost = "";
  let explorerBindingError = "";
  try {
    explorerUrl = readConsistentAliasString(
      "BSC explorerUrl",
      [{ record: manifest, keys: BSC_EXPLORER_URL_KEYS }],
      normalizeBscExplorerBaseUrl,
    );
    explorerHost = readConsistentAliasString(
      "BSC explorerHost",
      [{ record: manifest, keys: BSC_EXPLORER_HOST_KEYS }],
      normalizeBscExplorerHost,
    );
  } catch (error) {
    explorerBindingError =
      error instanceof Error ? error.message : String(error);
  }
  const explorerBindingOk =
    !explorerBindingError &&
    (explorerUrl === profile.explorerUrl ||
      (!productionReady && !explorerUrl)) &&
    (explorerHost === profile.explorerHost ||
      (!productionReady && !explorerHost));
  check(
    checks,
    "bsc-explorer-binding",
    explorerBindingOk,
    `BSC route manifest binds to ${profile.label} explorer metadata.`,
    explorerBindingError ||
      (explorerBindingOk
        ? `explorerUrl=${explorerUrl || "<omitted>"} explorerHost=${explorerHost || "<omitted>"}`
        : `explorerUrl=${explorerUrl || "<missing>"} expected=${profile.explorerUrl} explorerHost=${explorerHost || "<missing>"} expected=${profile.explorerHost}`),
  );

  const { addresses, errors: addressAliasErrors } =
    readBscManifestContractAddressResult(manifest);
  const normalizedAddressEntries = Object.entries(addresses).flatMap(
    ([label, value]) => {
      try {
        const aliasError = addressAliasErrors[label] || "";
        if (!value && aliasError) {
          throw new Error(aliasError);
        }
        const normalized = normalizeEvmAddress(value, `${label} address`);
        check(
          checks,
          `bsc-${label}-address`,
          !aliasError,
          `${label} contract address is a valid EVM address.`,
          aliasError,
        );
        return [[label, normalized]];
      } catch (error) {
        check(
          checks,
          `bsc-${label}-address`,
          false,
          `${label} contract address is a valid EVM address.`,
          error instanceof Error ? error.message : String(error),
        );
        return [];
      }
    },
  );
  const normalizedAddressMap = Object.fromEntries(normalizedAddressEntries);
  const normalizedAddresses = normalizedAddressEntries.map(
    ([, address]) => address,
  );
  check(
    checks,
    "bsc-contract-addresses-distinct",
    normalizedAddresses.length === 4 && new Set(normalizedAddresses).size === 4,
    "BSC token, bridge, source bridge, and verifier addresses are distinct.",
  );
  const normalizedHashes = {};
  for (const [key, label] of [
    ["verifierCodeHash", "verifier code hash"],
    ["verifierKeyHash", "verifier key hash"],
    ["destinationBindingHash", "destination binding hash"],
  ]) {
    const snakeKey = toSnake(key);
    try {
      const sources =
        key === "destinationBindingHash"
          ? [
              {
                record: manifest,
                keys: [key, snakeKey],
                sourceLabel: "route manifest",
              },
              {
                record: rollout,
                keys: [key, snakeKey],
                sourceLabel: "route manifest destinationRollout",
              },
              {
                record: readFirstRecord(
                  manifest,
                  "destinationBinding",
                  "destination_binding",
                ),
                keys: ["bindingHash", "binding_hash"],
                sourceLabel: "route manifest destinationBinding",
              },
            ]
          : [
              {
                record: manifest,
                keys: [key, snakeKey, `${key}Hex`, `${snakeKey}_hex`],
                sourceLabel: "route manifest",
              },
              {
                record: rollout,
                keys: [key, snakeKey],
                sourceLabel: "route manifest destinationRollout",
              },
            ];
      assertSingleStringAliasPerSource(`BSC ${label}`, sources);
      const value = readConsistentAliasString(
        `BSC ${label}`,
        sources,
        (entry, fieldLabel) => normalizeNonZeroHex32(entry, fieldLabel),
      );
      normalizedHashes[key] = normalizeNonZeroHex32(value, `BSC ${label}`);
      check(checks, `bsc-${key}`, true, `BSC ${label} is present.`);
    } catch (error) {
      check(
        checks,
        `bsc-${key}`,
        false,
        `BSC ${label} is present.`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  for (const [key, label] of [
    ["proofArtifactHash", "proof artifact hash"],
    ["provingKeyHash", "proving key hash"],
  ]) {
    const snakeKey = toSnake(key);
    try {
      const keys =
        key === "proofArtifactHash"
          ? [
              "proofArtifactHash",
              "proof_artifact_hash",
              "proverArtifactHash",
              "prover_artifact_hash",
              "circuitArtifactHash",
              "circuit_artifact_hash",
              "proofArtifactHashHex",
              "proof_artifact_hash_hex",
            ]
          : [key, snakeKey, `${key}Hex`, `${snakeKey}_hex`];
      const sources = [
        { record: manifest, keys, sourceLabel: "route manifest" },
        {
          record: rollout,
          keys,
          sourceLabel: "route manifest destinationRollout",
        },
      ];
      assertSingleStringAliasPerSource(`BSC ${label}`, sources);
      const value = readConsistentAliasString(
        `BSC ${label}`,
        sources,
        (entry, fieldLabel) => normalizeNonZeroHex32(entry, fieldLabel),
      );
      normalizedHashes[key] = value
        ? normalizeNonZeroHex32(value, `BSC ${label}`)
        : null;
    } catch (error) {
      normalizedHashes[key] = null;
      check(
        checks,
        `bsc-${key}`,
        false,
        `BSC ${label} is valid when present.`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  let declaredNativeEvmProverBundleHash = null;
  let declaredNativeEvmProverBundleHashError = "";
  try {
    const nativeEvmProverBundleHashKeys = [
      "nativeEvmProverBundleHash",
      "native_evm_prover_bundle_hash",
      "nativeProverBundleHash",
      "native_prover_bundle_hash",
      "bscNativeEvmProverBundleHash",
      "bsc_native_evm_prover_bundle_hash",
    ];
    const sources = [
      {
        record: manifest,
        keys: nativeEvmProverBundleHashKeys,
        sourceLabel: "route manifest",
      },
      {
        record: rollout,
        keys: nativeEvmProverBundleHashKeys,
        sourceLabel: "route manifest destinationRollout",
      },
    ];
    assertSingleStringAliasPerSource(
      "BSC native EVM prover bundle hash",
      sources,
    );
    const value = readConsistentAliasString(
      "BSC native EVM prover bundle hash",
      sources,
      (entry, fieldLabel) => normalizeNonZeroHex32(entry, fieldLabel),
    );
    declaredNativeEvmProverBundleHash = value
      ? normalizeNonZeroHex32(value, "BSC native EVM prover bundle hash")
      : null;
  } catch (error) {
    declaredNativeEvmProverBundleHashError =
      error instanceof Error ? error.message : String(error);
  }
  if (declaredNativeEvmProverBundleHashError) {
    check(
      checks,
      "bsc-native-evm-prover-bundle-hash",
      false,
      "BSC route declares a valid native EVM prover bundle hash.",
      declaredNativeEvmProverBundleHashError,
    );
  } else if (declaredNativeEvmProverBundleHash) {
    const nativeHashCollisions = [
      ["verifierCodeHash", normalizedHashes.verifierCodeHash],
      ["verifierKeyHash", normalizedHashes.verifierKeyHash],
      ["destinationBindingHash", normalizedHashes.destinationBindingHash],
      ["proofArtifactHash", normalizedHashes.proofArtifactHash],
      ["provingKeyHash", normalizedHashes.provingKeyHash],
    ]
      .filter(([, value]) => Boolean(value))
      .flatMap(([label, value]) =>
        value === declaredNativeEvmProverBundleHash
          ? [`nativeEvmProverBundleHash must not equal ${label}`]
          : [],
      );
    check(
      checks,
      "bsc-native-evm-prover-bundle-hash",
      nativeHashCollisions.length === 0,
      "BSC route declares a role-separated native EVM prover bundle hash.",
      nativeHashCollisions.join("; "),
    );
  } else {
    check(
      checks,
      "bsc-native-evm-prover-bundle-hash",
      false,
      "BSC route declares a valid native EVM prover bundle hash.",
      "nativeEvmProverBundleHash is missing.",
    );
  }
  const destinationBinding = readFirstRecord(
    manifest,
    "destinationBinding",
    "destination_binding",
  );
  let destinationBindingVersion = null;
  let destinationBindingSourceDomain = null;
  let destinationBindingTargetDomain = null;
  let destinationBindingDomainError = "";
  try {
    destinationBindingVersion = readConsistentAliasNumber(
      "BSC destination binding version",
      [
        { record: destinationBinding, keys: ["version"] },
        { record: rollout, keys: ["version"] },
      ],
    );
    destinationBindingSourceDomain = readConsistentAliasNumber(
      "BSC destination binding source domain",
      [
        { record: destinationBinding, keys: ["sourceDomain", "source_domain"] },
        { record: rollout, keys: ["sourceDomain", "source_domain"] },
      ],
    );
    destinationBindingTargetDomain = readConsistentAliasNumber(
      "BSC destination binding target domain",
      [
        { record: destinationBinding, keys: ["targetDomain", "target_domain"] },
        { record: rollout, keys: ["targetDomain", "target_domain"] },
      ],
    );
  } catch (error) {
    destinationBindingDomainError =
      error instanceof Error ? error.message : String(error);
  }
  let destinationBindingHash = "";
  let destinationBindingKey = "";
  let destinationBindingAliasError = "";
  try {
    const destinationBindingHashSources = [
      {
        record: destinationBinding,
        keys: ["bindingHash", "binding_hash"],
        sourceLabel: "route manifest destinationBinding",
      },
      {
        record: rollout,
        keys: ["destinationBindingHash", "destination_binding_hash"],
        sourceLabel: "route manifest destinationRollout",
      },
      {
        record: manifest,
        keys: ["destinationBindingHash", "destination_binding_hash"],
        sourceLabel: "route manifest",
      },
    ];
    assertSingleStringAliasPerSource(
      "BSC destination binding hash",
      destinationBindingHashSources,
    );
    destinationBindingHash = readConsistentAliasString(
      "BSC destination binding hash",
      destinationBindingHashSources,
      (value, label) => normalizeHex32(value, label),
    );
    const destinationBindingKeySources = [
      {
        record: destinationBinding,
        keys: ["key", "bindingKey", "binding_key"],
        sourceLabel: "route manifest destinationBinding",
      },
      {
        record: rollout,
        keys: ["destinationBindingKey", "destination_binding_key"],
        sourceLabel: "route manifest destinationRollout",
      },
      {
        record: manifest,
        keys: ["destinationBindingKey", "destination_binding_key"],
        sourceLabel: "route manifest",
      },
    ];
    assertSingleStringAliasPerSource(
      "BSC destination binding key",
      destinationBindingKeySources,
    );
    destinationBindingKey = readConsistentAliasString(
      "BSC destination binding key",
      destinationBindingKeySources,
      (value) => value,
    );
  } catch (error) {
    destinationBindingAliasError =
      error instanceof Error ? error.message : String(error);
  }
  let normalizedDestinationBindingHash = "";
  try {
    normalizedDestinationBindingHash = normalizeHex32(
      destinationBindingHash,
      "BSC destination binding hash",
    );
  } catch (_error) {
    normalizedDestinationBindingHash = "";
  }
  const expectedDestinationBindingKey =
    normalizedNetworkId &&
    normalizedAddressMap.verifier &&
    normalizedAddressMap.bridge &&
    normalizedHashes.verifierCodeHash &&
    normalizedHashes.verifierKeyHash
      ? `evm:0:${SCCP_BSC_DOMAIN}:${normalizedNetworkId.slice(2)}:${normalizedAddressMap.verifier}:${normalizedAddressMap.bridge}:${normalizedHashes.verifierCodeHash}:${normalizedHashes.verifierKeyHash}`
      : "";
  const destinationBindingOk =
    !destinationBindingDomainError &&
    destinationBindingVersion === 1 &&
    (destinationBindingSourceDomain === null ||
      destinationBindingSourceDomain === 0) &&
    (destinationBindingTargetDomain === null ||
      destinationBindingTargetDomain === SCCP_BSC_DOMAIN) &&
    normalizedDestinationBindingHash &&
    normalizedHashes.destinationBindingHash &&
    normalizedDestinationBindingHash ===
      normalizedHashes.destinationBindingHash &&
    destinationBindingKey &&
    expectedDestinationBindingKey &&
    destinationBindingKey === expectedDestinationBindingKey;
  check(
    checks,
    "bsc-destination-binding",
    Boolean(destinationBindingOk),
    "BSC destination binding matches deployed verifier and bridge material.",
    destinationBindingAliasError ||
      destinationBindingDomainError ||
      (destinationBindingOk
        ? ""
        : `version=${destinationBindingVersion ?? "<missing>"} source=${destinationBindingSourceDomain ?? "<missing>"} target=${destinationBindingTargetDomain ?? "<missing>"}`),
  );
  const postDeployLiveEvidence = readFirstRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  const manifestVerifierMaterial = readFirstRecord(
    manifest,
    "verifierMaterial",
    "verifier_material",
    "verifyingKey",
    "verifying_key",
    "verifierKey",
    "verifier_key",
  );
  const rolloutVerifierMaterial = readFirstRecord(
    rollout,
    "verifierMaterial",
    "verifier_material",
    "verifyingKey",
    "verifying_key",
    "verifierKey",
    "verifier_key",
  );
  const diagnosticVerifierReasons = [
    diagnosticFlagReason(manifest, "manifest"),
    diagnosticFlagReason(rollout, "manifest.destinationRollout"),
    diagnosticFlagReason(
      postDeployLiveEvidence,
      "manifest.postDeployLiveEvidence",
    ),
    smokeFixtureVerifierReason([
      { record: manifest, pathName: "manifest" },
      {
        record: manifestVerifierMaterial,
        pathName: "manifest.verifierMaterial",
      },
      { record: rollout, pathName: "manifest.destinationRollout" },
      {
        record: rolloutVerifierMaterial,
        pathName: "manifest.destinationRollout.verifierMaterial",
      },
    ]),
    verifierBn254MaterialReason([
      {
        record: manifestVerifierMaterial,
        pathName: "manifest.verifierMaterial",
      },
      {
        record: rolloutVerifierMaterial,
        pathName: "manifest.destinationRollout.verifierMaterial",
      },
    ]),
    normalizedHashes.verifierKeyHash &&
    isKnownDiagnosticBscVerifierKeyHash(normalizedHashes.verifierKeyHash)
      ? `verifierKeyHash=${normalizedHashes.verifierKeyHash} is a known diagnostic BSC verifier key hash`
      : "",
  ].filter(Boolean);
  check(
    checks,
    "bsc-production-verifier-material",
    diagnosticVerifierReasons.length === 0,
    "BSC verifier material is production verifier material.",
    diagnosticVerifierReasons.join("; "),
  );
  const proverHashReasons = [];
  if (!normalizedHashes.proofArtifactHash) {
    proverHashReasons.push("proofArtifactHash is required");
  }
  if (!normalizedHashes.provingKeyHash) {
    proverHashReasons.push("provingKeyHash is required");
  }
  const roleSeparatedHashes = [
    ["verifierCodeHash", normalizedHashes.verifierCodeHash],
    ["verifierKeyHash", normalizedHashes.verifierKeyHash],
    ["destinationBindingHash", normalizedHashes.destinationBindingHash],
    ["proofArtifactHash", normalizedHashes.proofArtifactHash],
    ["provingKeyHash", normalizedHashes.provingKeyHash],
  ].filter(([, value]) => Boolean(value));
  const seenHashes = new Map();
  for (const [label, value] of roleSeparatedHashes) {
    if (REPEATED_BYTE_HEX32_PATTERN.test(value)) {
      proverHashReasons.push(
        `${label} looks like placeholder material: repeated-byte hash`,
      );
    }
    const previous = seenHashes.get(value);
    if (previous) {
      proverHashReasons.push(`${label} must not equal ${previous}`);
    } else {
      seenHashes.set(value, label);
    }
  }
  check(
    checks,
    "bsc-production-prover-material",
    proverHashReasons.length === 0,
    "BSC route publishes role-separated production prover artifact hashes.",
    proverHashReasons.length
      ? proverHashReasons.join("; ")
      : `proofArtifactHash=${normalizedHashes.proofArtifactHash} provingKeyHash=${normalizedHashes.provingKeyHash}`,
  );
  const nativeEvmProverBundle = validateBscNativeEvmProverBundle({
    checks,
    manifest,
    rollout,
    profile,
    verifierKeyHash: normalizedHashes.verifierKeyHash,
    proofArtifactHash: normalizedHashes.proofArtifactHash,
    provingKeyHash: normalizedHashes.provingKeyHash,
    destinationBindingHash: normalizedHashes.destinationBindingHash,
    expectedNativeEvmProverBundleHash: declaredNativeEvmProverBundleHash,
    required: requireNativeProverBundle,
  });
  const nativeEvmProverBundleHash = nativeEvmProverBundle
    ? canonicalBscNativeEvmProverBundleHash(nativeEvmProverBundle)
    : declaredNativeEvmProverBundleHash;
  const destinationBrowserProver = readBrowserProverRef({
    manifest,
    label: "destinationBrowserProver",
    recordKeys: ["destinationBrowserProver", "destination_browser_prover"],
    expectedRouteHash: normalizedHashes.destinationBindingHash,
    expectedProofHash: normalizedHashes.proofArtifactHash,
  });
  check(
    checks,
    "bsc-destination-browser-prover",
    destinationBrowserProver.problems.length === 0,
    "BSC route declares a route-bound TAIRA-to-BSC browser prover manifest reference.",
    destinationBrowserProver.problems.join("; "),
  );
  const sourceBrowserProver = readBrowserProverRef({
    manifest,
    label: "sourceBrowserProver",
    recordKeys: ["sourceBrowserProver", "source_browser_prover"],
    expectedRouteHash: normalizedHashes.destinationBindingHash,
    expectedProofHash: normalizedHashes.proofArtifactHash,
  });
  check(
    checks,
    "bsc-source-browser-prover",
    sourceBrowserProver.problems.length === 0,
    "BSC route declares a route-bound BSC-to-TAIRA browser prover manifest reference.",
    sourceBrowserProver.problems.join("; "),
  );
  let postDeployReady = Boolean(postDeployLiveEvidence);
  const postDeployDetails = [];
  if (!postDeployLiveEvidence) {
    postDeployDetails.push("postDeployLiveEvidence is missing");
  } else {
    const normalizedPostDeploy = {};
    let fullTomlReady = false;
    try {
      fullTomlReady = readConsistentBoolean(
        postDeployLiveEvidence,
        ["fullTomlReady", "full_toml_ready"],
        "postDeployLiveEvidence.fullTomlReady",
      );
    } catch (error) {
      postDeployReady = false;
      postDeployDetails.push(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!fullTomlReady) {
      postDeployReady = false;
      postDeployDetails.push("fullTomlReady must be true");
    }
    let offlineFullTomlSha256 = "";
    try {
      offlineFullTomlSha256 = readConsistentAliasString(
        "postDeployLiveEvidence.offlineFullTomlSha256",
        [
          {
            record: postDeployLiveEvidence,
            keys: ["offlineFullTomlSha256", "offline_full_toml_sha256"],
          },
        ],
        (value, label) => normalizeNonZeroHex32(value, label),
      );
    } catch (error) {
      postDeployReady = false;
      postDeployDetails.push(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!offlineFullTomlSha256 && (productionReady || fullTomlReady)) {
      postDeployReady = false;
      postDeployDetails.push("offlineFullTomlSha256 is required");
    } else if (offlineFullTomlSha256) {
      try {
        normalizeNonZeroHex32(
          offlineFullTomlSha256,
          "postDeployLiveEvidence.offlineFullTomlSha256",
        );
      } catch (error) {
        postDeployReady = false;
        postDeployDetails.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    for (const [key, label] of [
      ["sourceBridgeConfigHash", "sourceBridgeConfigHash"],
      ["sourceEventTransactionId", "sourceEventTransactionId"],
      ["routeCanaryEvidenceHash", "routeCanaryEvidenceHash"],
      ["routeCanaryTransactionId", "routeCanaryTransactionId"],
    ]) {
      try {
        normalizedPostDeploy[key] = readConsistentAliasString(
          `postDeployLiveEvidence.${label}`,
          [{ record: postDeployLiveEvidence, keys: [key, toSnake(key)] }],
          (value, fieldLabel) => normalizeNonZeroHex32(value, fieldLabel),
        );
      } catch (error) {
        postDeployReady = false;
        postDeployDetails.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (
      normalizedPostDeploy.sourceBridgeConfigHash &&
      normalizedPostDeploy.routeCanaryEvidenceHash &&
      normalizedPostDeploy.sourceBridgeConfigHash ===
        normalizedPostDeploy.routeCanaryEvidenceHash
    ) {
      postDeployReady = false;
      postDeployDetails.push(
        "sourceBridgeConfigHash and routeCanaryEvidenceHash must be distinct",
      );
    }
    if (
      normalizedPostDeploy.sourceEventTransactionId &&
      normalizedPostDeploy.routeCanaryTransactionId &&
      normalizedPostDeploy.sourceEventTransactionId ===
        normalizedPostDeploy.routeCanaryTransactionId
    ) {
      postDeployReady = false;
      postDeployDetails.push(
        "sourceEventTransactionId and routeCanaryTransactionId must be distinct",
      );
    }
    for (const [urlKey, txKey, label] of [
      [
        "sourceEventExplorerUrl",
        "sourceEventTransactionId",
        "sourceEventExplorerUrl",
      ],
      [
        "routeCanaryExplorerUrl",
        "routeCanaryTransactionId",
        "routeCanaryExplorerUrl",
      ],
    ]) {
      const urlKeys = [
        urlKey,
        toSnake(urlKey),
        urlKey.replace("ExplorerUrl", "TransactionUrl"),
        toSnake(urlKey.replace("ExplorerUrl", "TransactionUrl")),
      ];
      let value = "";
      let valueError = "";
      try {
        value = readConsistentAliasString(
          `postDeployLiveEvidence.${label}`,
          [{ record: postDeployLiveEvidence, keys: urlKeys }],
          (entry, fieldLabel) =>
            normalizeBscExplorerTxUrl(
              entry,
              fieldLabel,
              normalizedPostDeploy[txKey],
              profile,
            ),
        );
      } catch (error) {
        valueError = error instanceof Error ? error.message : String(error);
      }
      if (!value && productionReady) {
        postDeployReady = false;
        postDeployDetails.push(
          valueError || `postDeployLiveEvidence.${label} is required`,
        );
        continue;
      }
      const inferredValue =
        !value &&
        !hasAnyOwnManifestKey(postDeployLiveEvidence, urlKeys) &&
        normalizedPostDeploy[txKey]
          ? `${profile.explorerUrl}/tx/${normalizedPostDeploy[txKey]}`
          : value;
      try {
        normalizeBscExplorerTxUrl(
          inferredValue,
          `postDeployLiveEvidence.${label}`,
          normalizedPostDeploy[txKey],
          profile,
        );
      } catch (error) {
        postDeployReady = false;
        postDeployDetails.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  check(
    checks,
    "bsc-post-deploy-live-evidence",
    postDeployReady,
    "BSC source-event and route-canary live evidence are complete.",
    postDeployDetails.join("; "),
  );
  const burnRecord = readFirstRecord(
    manifest,
    "tairaXorBurnRecord",
    "taira_xor_burn_record",
    "burnRecord",
    "burn_record",
  );
  const settlementAssetDefinitionId = readFirstString(
    burnRecord,
    "settlementAssetDefinitionId",
    "settlement_asset_definition_id",
  );
  const contractArtifactB64 = readFirstString(
    burnRecord,
    "contractArtifactB64",
    "contract_artifact_b64",
    "artifactB64",
    "artifact_b64",
  );
  const artifactSha256 = readFirstString(
    burnRecord,
    "artifactSha256",
    "artifact_sha256",
    "contractArtifactSha256",
    "contract_artifact_sha256",
  );
  const vkRef = readFirstRecord(burnRecord, "vkRef", "vk_ref");
  let burnReady = Boolean(
    settlementAssetDefinitionId &&
      contractArtifactB64 &&
      artifactSha256 &&
      vkRef,
  );
  const burnDetails = [];
  if (!settlementAssetDefinitionId) {
    burnDetails.push("settlementAssetDefinitionId is missing");
  } else if (!TAIRA_ASSET_DEFINITION_ID_RE.test(settlementAssetDefinitionId)) {
    burnReady = false;
    burnDetails.push(
      "settlementAssetDefinitionId must be a canonical Base58 asset definition id",
    );
  }
  if (!contractArtifactB64) {
    burnDetails.push("contractArtifactB64 is missing");
  } else {
    try {
      const decoded = strictBase64DecodedBytes(
        contractArtifactB64,
        "contractArtifactB64",
      );
      if (
        decoded.length < SCCP_BSC_BURN_RECORD_ARTIFACT_MIN_BYTES ||
        decoded.length > SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES
      ) {
        throw new Error(
          `contractArtifactB64 must decode to ${SCCP_BSC_BURN_RECORD_ARTIFACT_MIN_BYTES}-${SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES} bytes`,
        );
      }
      const declaredSha256 = normalizeNonZeroHex32(
        artifactSha256,
        "artifactSha256",
      );
      if (declaredSha256 !== sha256Hex(decoded)) {
        throw new Error("artifactSha256 does not match contractArtifactB64");
      }
      if (productionReady) {
        assertBscBurnRecordProductionArtifact(decoded, "contractArtifactB64");
      }
    } catch (error) {
      burnReady = false;
      burnDetails.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!artifactSha256) {
    burnDetails.push("artifactSha256 is missing");
  }
  if (!vkRef) {
    burnDetails.push("vkRef is missing");
  } else {
    const backend = readFirstString(
      vkRef,
      "backend",
      "proofBackend",
      "proof_backend",
    );
    const name = readFirstString(vkRef, "name", "vkName", "vk_name");
    if (!backend || !name) {
      burnReady = false;
      burnDetails.push("vkRef backend and name are required");
    }
  }
  try {
    readOptionalPositiveSafeInteger(burnRecord, "gasLimit", "gas_limit");
  } catch (error) {
    burnReady = false;
    burnDetails.push(error instanceof Error ? error.message : String(error));
  }
  check(
    checks,
    "taira-burn-record-material",
    burnReady,
    "TAIRA burn-record ZK material is present.",
    burnDetails.join("; "),
  );
  return {
    bridgeAddress: normalizedAddressMap.bridge ?? null,
    tokenAddress: normalizedAddressMap.token ?? null,
    sourceBridgeAddress: normalizedAddressMap.sourceBridge ?? null,
    verifierAddress: normalizedAddressMap.verifier ?? null,
    networkIdHex: normalizedNetworkId || null,
    verifierCodeHash: normalizedHashes.verifierCodeHash ?? null,
    verifierKeyHash: normalizedHashes.verifierKeyHash ?? null,
    proofArtifactHash: normalizedHashes.proofArtifactHash ?? null,
    provingKeyHash: normalizedHashes.provingKeyHash ?? null,
    nativeEvmProverBundleHash,
    destinationBrowserProver: destinationBrowserProver.ref,
    sourceBrowserProver: sourceBrowserProver.ref,
    destinationBindingHash: normalizedHashes.destinationBindingHash ?? null,
    settlementAssetDefinitionId: settlementAssetDefinitionId || null,
  };
};

const fetchBscCodePresence = async ({
  fetchImpl,
  endpoint,
  address,
  label,
  timeoutMs,
}) => {
  const code = normalizeHexData(
    await postBscJsonRpc(
      fetchImpl,
      endpoint,
      "eth_getCode",
      [address, "latest"],
      `${label} eth_getCode`,
      timeoutMs,
    ),
    `${label} runtime bytecode`,
  );
  return code !== "0x";
};

const publicBscPostDeployLiveEvidence = (
  manifest,
  profile = defaultBscNetworkProfile(),
) => {
  const postDeployLiveEvidence = readFirstRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  if (!postDeployLiveEvidence) {
    return null;
  }
  const normalizeHexField = (key, ...aliases) => {
    try {
      return readConsistentAliasString(
        `postDeployLiveEvidence.${key}`,
        [{ record: postDeployLiveEvidence, keys: [key, ...aliases] }],
        (value, label) => normalizeNonZeroHex32(value, label),
      );
    } catch (_error) {
      return null;
    }
  };
  const sourceEventTransactionId = normalizeHexField(
    "sourceEventTransactionId",
    "source_event_transaction_id",
  );
  const routeCanaryTransactionId = normalizeHexField(
    "routeCanaryTransactionId",
    "route_canary_transaction_id",
  );
  const normalizeExplorerUrl = (label, txId, ...keys) => {
    let value = "";
    try {
      value = readConsistentAliasString(
        `postDeployLiveEvidence.${label}`,
        [{ record: postDeployLiveEvidence, keys }],
        (entry, fieldLabel) =>
          normalizeBscExplorerTxUrl(entry, fieldLabel, txId, profile),
      );
    } catch (_error) {
      return null;
    }
    const inferredValue =
      !value && txId && !hasAnyOwnManifestKey(postDeployLiveEvidence, keys)
        ? `${profile.explorerUrl}/tx/${txId}`
        : value;
    try {
      return normalizeBscExplorerTxUrl(
        inferredValue,
        `postDeployLiveEvidence.${label}`,
        txId,
        profile,
      );
    } catch (_error) {
      return null;
    }
  };
  let fullTomlReady = false;
  try {
    fullTomlReady = readConsistentBoolean(
      postDeployLiveEvidence,
      ["fullTomlReady", "full_toml_ready"],
      "postDeployLiveEvidence.fullTomlReady",
    );
  } catch (_error) {
    fullTomlReady = false;
  }
  return {
    fullTomlReady,
    sourceBridgeConfigHash: normalizeHexField(
      "sourceBridgeConfigHash",
      "source_bridge_config_hash",
    ),
    sourceEventTransactionId,
    sourceEventExplorerUrl: normalizeExplorerUrl(
      "sourceEventExplorerUrl",
      sourceEventTransactionId,
      "sourceEventExplorerUrl",
      "source_event_explorer_url",
      "sourceEventTransactionUrl",
      "source_event_transaction_url",
    ),
    routeCanaryEvidenceHash: normalizeHexField(
      "routeCanaryEvidenceHash",
      "route_canary_evidence_hash",
    ),
    routeCanaryTransactionId,
    routeCanaryExplorerUrl: normalizeExplorerUrl(
      "routeCanaryExplorerUrl",
      routeCanaryTransactionId,
      "routeCanaryExplorerUrl",
      "route_canary_explorer_url",
      "routeCanaryTransactionUrl",
      "route_canary_transaction_url",
    ),
    offlineFullTomlSha256: normalizeHexField(
      "offlineFullTomlSha256",
      "offline_full_toml_sha256",
    ),
  };
};

const callBscContractView = async ({
  fetchImpl,
  endpoint,
  address,
  selector,
  label,
  timeoutMs,
}) =>
  postBscJsonRpc(
    fetchImpl,
    endpoint,
    "eth_call",
    [
      {
        to: address,
        data: selector,
      },
      "latest",
    ],
    label,
    timeoutMs,
  );

export const fetchBscContractReadback = async (input = {}) => {
  const manifest = ownValue(input, "manifest");
  const rpcUrl = ownValue(input, "rpcUrl") ?? BSC_TESTNET_RPC_URL;
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  const allowLocalRpc = ownValue(input, "allowLocalRpc") ?? false;
  const endpoint = normalizeBscRpcEndpoint(rpcUrl, {
    allowLocal: allowLocalRpc,
  });
  const addresses = normalizeBscManifestContractAddresses(manifest);
  const [
    chainId,
    tokenCodePresent,
    bridgeCodePresent,
    sourceBridgeCodePresent,
    verifierCodePresent,
    tokenBridge,
    tokenLocked,
    sourceOwner,
    bridgeBinding,
    bridgeVerifier,
    bridgeVerifierCodeHash,
    bridgeVerifierKeyHash,
    verifierKeyHash,
    bridgeNetworkId,
    bridgeSourceDomain,
    bridgeTargetDomain,
  ] = await Promise.all([
    postBscJsonRpc(
      fetchImpl,
      endpoint,
      "eth_chainId",
      [],
      "BSC eth_chainId",
      timeoutMs,
    ),
    fetchBscCodePresence({
      fetchImpl,
      endpoint,
      address: addresses.token,
      label: "TairaXOR",
      timeoutMs,
    }),
    fetchBscCodePresence({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      label: "TairaXorSccpBridge",
      timeoutMs,
    }),
    fetchBscCodePresence({
      fetchImpl,
      endpoint,
      address: addresses.sourceBridge,
      label: "SccpBscSourceBridge",
      timeoutMs,
    }),
    fetchBscCodePresence({
      fetchImpl,
      endpoint,
      address: addresses.verifier,
      label: "BSC verifier",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.token,
      selector: BSC_CONTRACT_SELECTORS.bridge,
      label: "TairaXOR.bridge()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.token,
      selector: BSC_CONTRACT_SELECTORS.bridgeLocked,
      label: "TairaXOR.bridgeLocked()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.sourceBridge,
      selector: BSC_CONTRACT_SELECTORS.owner,
      label: "SccpBscSourceBridge.owner()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.destinationBindingHash,
      label: "TairaXorSccpBridge.destinationBindingHash()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.verifier,
      label: "TairaXorSccpBridge.verifier()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.verifierCodeHash,
      label: "TairaXorSccpBridge.verifierCodeHash()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.verifierKeyHash,
      label: "TairaXorSccpBridge.verifierKeyHash()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.verifier,
      selector: BSC_CONTRACT_SELECTORS.verifyingKeyHash,
      label: "SccpGroth16Bn254MessageVerifier.verifyingKeyHash()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.networkId,
      label: "TairaXorSccpBridge.networkId()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.expectedSourceDomain,
      label: "TairaXorSccpBridge.expectedSourceDomain()",
      timeoutMs,
    }),
    callBscContractView({
      fetchImpl,
      endpoint,
      address: addresses.bridge,
      selector: BSC_CONTRACT_SELECTORS.expectedTargetDomain,
      label: "TairaXorSccpBridge.expectedTargetDomain()",
      timeoutMs,
    }),
  ]);

  return {
    endpoint: redactEndpointForReport(endpoint),
    chainIdHex: normalizeRpcQuantity(chainId, "BSC eth_chainId"),
    codePresent: {
      token: tokenCodePresent,
      bridge: bridgeCodePresent,
      sourceBridge: sourceBridgeCodePresent,
      verifier: verifierCodePresent,
    },
    tokenAddress: addresses.token,
    bridgeAddress: addresses.bridge,
    sourceBridgeAddress: addresses.sourceBridge,
    verifierAddress: addresses.verifier,
    tokenBridgeAddress: readAbiAddress(tokenBridge, "TairaXOR.bridge()"),
    tokenBridgeLocked: readAbiBool(tokenLocked, "TairaXOR.bridgeLocked()"),
    sourceBridgeOwner: readAbiAddress(
      sourceOwner,
      "SccpBscSourceBridge.owner()",
    ),
    bridgeDestinationBindingHash: readAbiBytes32(
      bridgeBinding,
      "TairaXorSccpBridge.destinationBindingHash()",
    ),
    bridgeVerifierAddress: readAbiAddress(
      bridgeVerifier,
      "TairaXorSccpBridge.verifier()",
    ),
    bridgeVerifierCodeHash: readAbiBytes32(
      bridgeVerifierCodeHash,
      "TairaXorSccpBridge.verifierCodeHash()",
    ),
    bridgeVerifierKeyHash: readAbiBytes32(
      bridgeVerifierKeyHash,
      "TairaXorSccpBridge.verifierKeyHash()",
    ),
    verifierKeyHash: readAbiBytes32(
      verifierKeyHash,
      "SccpGroth16Bn254MessageVerifier.verifyingKeyHash()",
    ),
    bridgeNetworkId: readAbiBytes32(
      bridgeNetworkId,
      "TairaXorSccpBridge.networkId()",
    ),
    bridgeSourceDomain: readAbiUint32(
      bridgeSourceDomain,
      "TairaXorSccpBridge.expectedSourceDomain()",
    ),
    bridgeTargetDomain: readAbiUint32(
      bridgeTargetDomain,
      "TairaXorSccpBridge.expectedTargetDomain()",
    ),
  };
};

export const evaluateBscSccpRoutePreflight = (input = {}) => {
  const toriiUrl = ownValue(input, "toriiUrl");
  const chainMetadata = ownValue(input, "chainMetadata");
  const capabilities = ownValue(input, "capabilities");
  const manifestSet = ownValue(input, "manifestSet");
  const bscContractReadback = ownValue(input, "bscContractReadback") ?? null;
  const errors = ownValue(input, "errors") ?? {};
  const warnings = ownValue(input, "warnings") ?? [];
  const bscNetwork =
    ownValue(input, "bscNetwork") ?? process.env.SCCP_BSC_NETWORK ?? "testnet";
  const requireNativeProverBundle =
    ownValue(input, "requireNativeProverBundle") ?? true;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const safeChainMetadata = cloneOwnRecord(chainMetadata);
  const safeCapabilities = cloneOwnRecord(capabilities);
  const safeManifestSet = safeJsonInput(manifestSet);
  const safeBscContractReadback = bscContractReadback
    ? cloneOwnRecord(bscContractReadback)
    : null;
  const safeErrors = cloneOwnRecord(errors);
  const safeWarningsInput = safeJsonInput(warnings);
  const safeWarnings = Array.isArray(safeWarningsInput)
    ? ownArrayValues(safeWarningsInput)
    : [];
  const checks = [];
  validateTairaNetwork(checks, safeChainMetadata, safeErrors);
  validateWarnings(checks, safeWarnings);
  validateCapabilities(checks, safeCapabilities);
  const manifestShapeErrors = manifestRecordShapeErrors(safeManifestSet);
  check(
    checks,
    "bsc-route-manifest-shape",
    manifestShapeErrors.length === 0,
    "TAIRA SCCP manifest payload uses object arrays only.",
    manifestShapeErrors.join("; "),
  );
  const matchingManifests = matchingBscRouteManifests(safeManifestSet, profile);
  check(
    checks,
    "bsc-route-manifest-unique",
    matchingManifests.length === 1,
    `TAIRA advertises exactly one taira_bsc_xor ${profile.label} manifest.`,
    matchingManifests.length === 1
      ? ""
      : `found ${matchingManifests.length} matching route manifests`,
  );
  const manifest = pickBscRouteManifest(safeManifestSet, profile);
  const deployment = validateBscManifest(checks, manifest, {
    requireNativeProverBundle,
    profile,
  });
  const postDeployLiveEvidence = publicBscPostDeployLiveEvidence(
    manifest,
    profile,
  );
  if (safeErrors.bscContracts) {
    check(
      checks,
      "bsc-contract-readback",
      false,
      "BSC contract view readback matches the route manifest.",
      safeErrors.bscContracts,
    );
  } else if (safeBscContractReadback) {
    let readbackOk = true;
    const addReadbackCheck = (id, ok, message, detail) => {
      readbackOk = readbackOk && ok;
      check(checks, id, ok, message, detail);
    };
    addReadbackCheck(
      "bsc-rpc-chain-id-readback",
      safeBscContractReadback.chainIdHex === profile.chainIdHex,
      `BSC RPC endpoint reports ${profile.label} chain id.`,
      `chainId=${safeBscContractReadback.chainIdHex || "<missing>"}`,
    );
    for (const [key, label] of [
      ["token", "TairaXOR"],
      ["bridge", "TairaXorSccpBridge"],
      ["sourceBridge", "SccpBscSourceBridge"],
      ["verifier", "BSC verifier"],
    ]) {
      addReadbackCheck(
        `bsc-${key}-code-readback`,
        safeBscContractReadback.codePresent?.[key] === true,
        `${label} contract bytecode is deployed.`,
      );
    }
    for (const [key, deploymentKey, label] of [
      ["tokenAddress", "tokenAddress", "TairaXOR"],
      ["bridgeAddress", "bridgeAddress", "TairaXorSccpBridge"],
      ["sourceBridgeAddress", "sourceBridgeAddress", "SccpBscSourceBridge"],
      ["verifierAddress", "verifierAddress", "BSC verifier"],
    ]) {
      addReadbackCheck(
        `bsc-${deploymentKey.replace("Address", "")}-target-readback`,
        Boolean(deployment?.[deploymentKey]) &&
          safeBscContractReadback[key] === deployment[deploymentKey],
        `${label} readback target matches the route manifest.`,
        safeBscContractReadback[key] === deployment?.[deploymentKey]
          ? ""
          : `${label} readback target address does not match the manifest ${deploymentKey}.`,
      );
    }
    addReadbackCheck(
      "bsc-token-bridge-readback",
      Boolean(deployment?.bridgeAddress) &&
        safeBscContractReadback.tokenBridgeAddress === deployment.bridgeAddress,
      "TairaXOR.bridge() points at the BSC SCCP bridge.",
      safeBscContractReadback.tokenBridgeAddress === deployment?.bridgeAddress
        ? ""
        : "Token bridge address does not match the manifest bridge address.",
    );
    addReadbackCheck(
      "bsc-token-lock-readback",
      safeBscContractReadback.tokenBridgeLocked === true,
      "TairaXOR.bridgeLocked() is true.",
      safeBscContractReadback.tokenBridgeLocked === true
        ? ""
        : "Token bridge is not locked.",
    );
    addReadbackCheck(
      "bsc-source-owner-readback",
      Boolean(deployment?.bridgeAddress) &&
        safeBscContractReadback.sourceBridgeOwner === deployment.bridgeAddress,
      "SccpBscSourceBridge.owner() is the BSC SCCP bridge.",
      safeBscContractReadback.sourceBridgeOwner === deployment?.bridgeAddress
        ? ""
        : "Source bridge owner does not match the manifest bridge address.",
    );
    addReadbackCheck(
      "bsc-bridge-binding-readback",
      Boolean(deployment?.destinationBindingHash) &&
        safeBscContractReadback.bridgeDestinationBindingHash ===
          deployment.destinationBindingHash,
      "TairaXorSccpBridge.destinationBindingHash() matches rollout evidence.",
      safeBscContractReadback.bridgeDestinationBindingHash ===
        deployment?.destinationBindingHash
        ? ""
        : "Bridge destination binding hash does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-bridge-verifier-address-readback",
      Boolean(deployment?.verifierAddress) &&
        safeBscContractReadback.bridgeVerifierAddress ===
          deployment.verifierAddress,
      "TairaXorSccpBridge.verifier() matches rollout evidence.",
      safeBscContractReadback.bridgeVerifierAddress ===
        deployment?.verifierAddress
        ? ""
        : "Bridge verifier address does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-bridge-verifier-code-hash-readback",
      Boolean(deployment?.verifierCodeHash) &&
        safeBscContractReadback.bridgeVerifierCodeHash ===
          deployment.verifierCodeHash,
      "TairaXorSccpBridge.verifierCodeHash() matches rollout evidence.",
      safeBscContractReadback.bridgeVerifierCodeHash ===
        deployment?.verifierCodeHash
        ? ""
        : "Bridge verifier code hash does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-bridge-verifier-key-hash-readback",
      Boolean(deployment?.verifierKeyHash) &&
        safeBscContractReadback.bridgeVerifierKeyHash ===
          deployment.verifierKeyHash,
      "TairaXorSccpBridge.verifierKeyHash() matches rollout evidence.",
      safeBscContractReadback.bridgeVerifierKeyHash ===
        deployment?.verifierKeyHash
        ? ""
        : "Bridge verifier key hash does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-verifier-key-hash-readback",
      Boolean(deployment?.verifierKeyHash) &&
        safeBscContractReadback.verifierKeyHash === deployment.verifierKeyHash,
      "SccpGroth16Bn254MessageVerifier.verifyingKeyHash() matches rollout evidence.",
      safeBscContractReadback.verifierKeyHash === deployment?.verifierKeyHash
        ? ""
        : "Verifier key hash does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-bridge-network-readback",
      Boolean(deployment?.networkIdHex) &&
        safeBscContractReadback.bridgeNetworkId === deployment.networkIdHex,
      `TairaXorSccpBridge.networkId() reports ${profile.label}.`,
      safeBscContractReadback.bridgeNetworkId === deployment?.networkIdHex
        ? ""
        : "Bridge network id does not match the manifest.",
    );
    addReadbackCheck(
      "bsc-bridge-domain-readback",
      safeBscContractReadback.bridgeSourceDomain === 0 &&
        safeBscContractReadback.bridgeTargetDomain === SCCP_BSC_DOMAIN,
      "TairaXorSccpBridge domains are SORA to BSC.",
      `source=${safeBscContractReadback.bridgeSourceDomain ?? "<missing>"} target=${safeBscContractReadback.bridgeTargetDomain ?? "<missing>"}`,
    );
    check(
      checks,
      "bsc-contract-readback",
      readbackOk,
      "BSC contract view readback matches the route manifest.",
      safeBscContractReadback.endpoint,
    );
  }
  const initiallyReady = checks.every((entry) => entry.ok);
  const nextActions = initiallyReady
    ? []
    : bscPreflightNextActions(checks, profile);
  const missingProductionInputs =
    bscPreflightMissingProductionInputs(nextActions);
  const runbookProblems = bscSccpRoutePreflightRunbookProblems({
    nextActions,
    missingProductionInputs,
  });
  check(
    checks,
    "bsc-preflight-runbook-contract",
    runbookProblems.length === 0,
    "BSC route preflight exposes a complete operator runbook.",
    runbookProblems.join("; "),
  );
  const ready = checks.every((entry) => entry.ok);
  const generatedAtMs = Date.now();
  return {
    ready,
    routeId: SCCP_ROUTE_ID,
    assetKey: SCCP_ASSET_KEY,
    toriiUrl,
    taira: {
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    },
    bsc: {
      network: profile.key,
      chain: profile.chain,
      chainIdHex: profile.chainIdHex,
      networkIdHex: profile.networkIdHex,
      explorerUrl: profile.explorerUrl,
      explorerHost: profile.explorerHost,
    },
    deployment,
    postDeployLiveEvidence,
    bscContractReadback: safeBscContractReadback,
    checks,
    errors: safeErrors,
    warnings: safeWarnings,
    nextActions,
    missingProductionInputs,
    generatedAt: new Date(generatedAtMs).toISOString(),
    generatedAtMs,
  };
};

export const runBscSccpRoutePreflight = async (options = {}) => {
  const toriiUrl = normalizeBaseUrl(options.toriiUrl);
  const bscProfile = resolveBscNetworkProfile(
    options.bscNetwork || process.env.SCCP_BSC_NETWORK || "testnet",
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive integer.");
  }
  const errors = {};
  const warnings = [];
  let chainMetadata = null;
  let capabilities = null;
  let manifestSet = null;
  let bscContractReadback = null;

  try {
    const chain = await fetchTairaChainMetadata({
      endpoint: toriiUrl,
      fetchImpl,
      timeoutMs,
    });
    chainMetadata = chain.metadata;
    warnings.push(...chain.warnings);
  } catch (error) {
    errors.chainMetadata =
      error instanceof Error ? error.message : "Unable to load chain metadata.";
  }

  try {
    capabilities = await fetchJson(
      fetchImpl,
      `${toriiUrl}/v1/sccp/capabilities`,
      "SCCP capabilities",
      timeoutMs,
    );
  } catch (error) {
    errors.capabilities =
      error instanceof Error
        ? error.message
        : "Unable to load SCCP capabilities.";
  }

  if (options.manifestFile) {
    try {
      manifestSet = await readLocalJsonEvidenceFile(
        options.manifestFile,
        "BSC route manifest file",
      );
    } catch (error) {
      errors.manifests =
        error instanceof Error
          ? error.message
          : "Unable to load SCCP route manifest file.";
    }
  } else {
    try {
      manifestSet = await fetchJson(
        fetchImpl,
        `${toriiUrl}/v1/sccp/manifests`,
        "SCCP manifests",
        timeoutMs,
      );
    } catch (error) {
      errors.manifests =
        error instanceof Error
          ? error.message
          : "Unable to load SCCP manifests.";
    }
  }

  if (options.checkBscContracts) {
    const manifest = pickBscRouteManifest(manifestSet, bscProfile);
    if (!manifest) {
      errors.bscContracts =
        "Cannot read BSC contracts before the taira_bsc_xor manifest is available.";
    } else {
      try {
        bscContractReadback = await fetchBscContractReadback({
          manifest,
          rpcUrl: options.bscRpcUrl || bscProfile.rpcUrl,
          fetchImpl,
          timeoutMs,
          allowLocalRpc: options.allowLocalRpc === true,
        });
      } catch (error) {
        errors.bscContracts =
          error instanceof Error
            ? error.message
            : "Unable to read BSC contract views.";
      }
    }
  }

  return {
    ...evaluateBscSccpRoutePreflight({
      toriiUrl,
      chainMetadata,
      capabilities,
      manifestSet,
      bscContractReadback,
      errors,
      warnings,
      bscNetwork: bscProfile.key,
    }),
    manifestSource: options.manifestFile ? "file" : "torii",
  };
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const bscNetwork =
    args["bsc-network"] ||
    process.env.SCCP_BSC_NETWORK ||
    process.env.VITE_SCCP_BSC_NETWORK ||
    "testnet";
  const report = await runBscSccpRoutePreflight({
    toriiUrl:
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      DEFAULT_TAIRA_TORII_URL,
    manifestFile: args["manifest-file"] || process.env.SCCP_ROUTE_MANIFEST_FILE,
    bscNetwork,
    checkBscContracts: parseBoolean(
      args["check-bsc-contracts"],
      "--check-bsc-contracts",
    ),
    bscRpcUrl:
      args["bsc-rpc-url"] ||
      process.env.SCCP_BSC_RPC_URL ||
      process.env.BSC_RPC_URL ||
      undefined,
    allowLocalRpc: parseBoolean(args["allow-local-rpc"], "--allow-local-rpc"),
    timeoutMs: Number(args["timeout-ms"] ?? 10_000),
  });
  const outputDir = path.resolve(
    repoRoot,
    trim(args["output-dir"] || process.env.SCCP_BSC_PREFLIGHT_OUTPUT_DIR) ||
      bscSccpRoutePreflightOutputDir(bscNetwork),
  );
  const reportPath = path.join(outputDir, "latest.json");
  await writeJsonReportFile(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nBSC SCCP preflight report: ${reportPath}`);
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

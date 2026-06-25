#!/usr/bin/env node
/* global BigInt */
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  assertBscBurnRecordProductionArtifact,
  parseJsonWithoutDuplicateKeys,
} from "./sccp-bsc-route-preflight.mjs";

export const SCCP_BSC_ROUTE_MANIFEST_SCHEMA =
  "iroha-sccp-taira-xor-route-manifest-draft/v1";
export const SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1";
export const SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_HASH_MODE =
  "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256";
export const SCCP_BSC_XOR_ROUTE_ID = "taira_bsc_xor";
export const SCCP_BSC_XOR_ASSET_KEY = "xor";
export const SCCP_DOMAIN_SORA = 0;
export const SCCP_DOMAIN_BSC = 2;
export const BSC_TESTNET_CHAIN_ID_HEX = "0x61";
export const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
export const BSC_MAINNET_CHAIN_ID_HEX = "0x38";
export const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
export const BSC_NETWORK_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    label: "BSC testnet",
    chain: "bsc-testnet",
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    explorerUrl: "https://testnet.bscscan.com",
    explorerHost: "testnet.bscscan.com",
    confirmOption: "confirm-testnet",
    routeManifestOut:
      "output/sccp-bsc-route-manifest/taira-bsc-xor-route.manifest.json",
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    label: "BSC mainnet",
    chain: "bsc-mainnet",
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    explorerUrl: "https://bscscan.com",
    explorerHost: "bscscan.com",
    confirmOption: "confirm-mainnet",
    routeManifestOut:
      "output/sccp-bsc-route-manifest/taira-bsc-mainnet-xor-route.manifest.json",
  }),
});
export const BSC_EVM_GROTH16_BACKEND = "evm-groth16-bn254-v1";
export const SCCP_PROOF_FAMILY_STARK_FRI = "stark-fri-v1";
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
export const DEFAULT_BSC_ROUTE_MANIFEST_OUT =
  BSC_NETWORK_PROFILES.testnet.routeManifestOut;
export const DEFAULT_BSC_MAINNET_ROUTE_MANIFEST_OUT =
  BSC_NETWORK_PROFILES.mainnet.routeManifestOut;
export const TAIRA_BURN_RECORD_ARTIFACT_MIN_BYTES = 32;
export const TAIRA_BURN_RECORD_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const ROUTE_MANIFEST_JSON_INPUT_MAX_BYTES = 4 * 1024 * 1024;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const textEncoder = new TextEncoder();
const BASE58_RE =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{16,80}$/u;
const SECRET_KEY_RE =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const SECRET_ASSIGNMENT_RE =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const SECRET_VALUE_RE =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const SECRET_LIKE_MANIFEST_INPUT_ERROR =
  "BSC route manifest input must not contain secret-like material.";
const NATIVE_PROVER_BUNDLE_OPTION_KEYS = Object.freeze([
  "native-prover-bundle",
  "native-evm-prover-bundle",
  "bsc-native-prover-bundle",
  "bsc-native-evm-prover-bundle",
]);
const NATIVE_EVM_PROVER_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_KEYS = Object.freeze([
  "verifierKeyArtifactHash",
  "verifier_key_artifact_hash",
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
const FORBIDDEN_BSC_SOURCE_BRIDGE_ALIASES = Object.freeze([
  "sccpTronSourceBridgeAddress",
  "sccp_tron_source_bridge_address",
  "tronSourceBridgeAddress",
  "tron_source_bridge_address",
]);
const FORBIDDEN_BSC_VERIFIER_ALIASES = Object.freeze([
  "tronVerifierAddress",
  "tron_verifier_address",
  "sccpTronDestinationVerifierAddress",
  "sccp_tron_destination_verifier_address",
]);

const trim = (value) => String(value ?? "").trim();
const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const ownValue = (record, key) => {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")
  ) {
    return undefined;
  }
  return descriptor.value;
};
const ownArrayValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = [];
  for (const key of Object.keys(value)) {
    if (!JSON_ARRAY_INDEX_PATTERN.test(key)) {
      continue;
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= value.length) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      entries.push([index, descriptor.value]);
    }
  }
  entries.sort(([left], [right]) => left - right);
  return entries.map(([, entry]) => entry);
};
const assertDenseDataArray = (value, label) => {
  if (!Array.isArray(value)) {
    return;
  }
  const presentIndexes = new Set();
  for (const key of Object.keys(value)) {
    if (!JSON_ARRAY_INDEX_PATTERN.test(key)) {
      continue;
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= value.length) {
      continue;
    }
    presentIndexes.add(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label}[${index}] must be a data property`);
    }
    assertDenseDataArray(descriptor.value, `${label}[${index}]`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      throw new Error(`${label}[${index}] is missing`);
    }
  }
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
  if (!Array.isArray(value) && !isRecord(value)) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const out = [];
    for (const entry of ownArrayValues(value)) {
      const child = ownJsonValue(entry, seen);
      if (child !== undefined) {
        out.push(child);
      }
    }
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const child = ownJsonValue(ownValue(value, key), seen);
    if (child !== undefined) {
      out[key] = child;
    }
  }
  seen.delete(value);
  return out;
};
const cloneOwnRecord = (value) => {
  const cloned = ownJsonValue(value);
  return isRecord(cloned) ? cloned : {};
};
const normalizeBscNetworkKey = (value = "testnet") => {
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
  throw new Error("bscNetwork must be testnet or mainnet.");
};
const resolveBscNetworkProfile = (value = "testnet") =>
  BSC_NETWORK_PROFILES[normalizeBscNetworkKey(value)];
export const defaultBscRouteManifestOut = (value = "testnet") =>
  resolveBscNetworkProfile(value).routeManifestOut ??
  DEFAULT_BSC_ROUTE_MANIFEST_OUT;
const readString = (record, key) =>
  hasOwn(record, key) && typeof ownValue(record, key) === "string"
    ? ownValue(record, key).trim()
    : "";
const readFirstString = (record, ...keys) => {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return "";
};
const readConsistentString = (label, sources) => {
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
const readSingleRecordAlias = (record, keys, label) => {
  if (!isRecord(record)) {
    return null;
  }
  let selected = null;
  let selectedKey = "";
  const aliases = [];
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      continue;
    }
    const value = ownValue(record, key);
    if (value === undefined || value === null) {
      continue;
    }
    if (!isRecord(value)) {
      throw new Error(`${label} must be an object.`);
    }
    aliases.push(key);
    if (!selected) {
      selected = value;
      selectedKey = key;
    }
  }
  if (aliases.length > 1) {
    throw new Error(
      `${label} must not use multiple aliases: ${aliases.join(", ")}.`,
    );
  }
  return selectedKey ? selected : null;
};
const readConsistentStringValue = (record, keys, label) =>
  readConsistentString(label, [{ record, keys }]);
const requireConsistentStringValue = (record, keys, label) => {
  const value = readConsistentStringValue(record, keys, label);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
};
const readConsistentBooleanValue = (record, keys, label) => {
  if (!isRecord(record)) {
    return undefined;
  }
  let selectedKey = "";
  let selectedValue;
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      continue;
    }
    const value = ownValue(record, key);
    if (typeof value !== "boolean") {
      throw new Error(`${label} must be a boolean.`);
    }
    if (!selectedKey) {
      selectedKey = key;
      selectedValue = value;
      continue;
    }
    if (selectedValue !== value) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${String(
          selectedValue,
        )} but ${key}=${String(value)}.`,
      );
    }
  }
  return selectedValue;
};
const requireConsistentBooleanValue = (record, keys, label) => {
  const value = readConsistentBooleanValue(record, keys, label);
  if (value === undefined) {
    throw new Error(`${label} is required.`);
  }
  return value;
};
const readConsistentIntegerValue = (record, keys, label) => {
  if (!isRecord(record)) {
    throw new Error(`${label} is required.`);
  }
  let selectedKey = "";
  let selectedValue;
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      continue;
    }
    const raw = ownValue(record, key);
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must be an integer.`);
    }
    if (!selectedKey) {
      selectedKey = key;
      selectedValue = value;
      continue;
    }
    if (selectedValue !== value) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${String(
          selectedValue,
        )} but ${key}=${String(value)}.`,
      );
    }
  }
  if (!selectedKey) {
    throw new Error(`${label} is required.`);
  }
  return selectedValue;
};
const BSC_ROUTE_MANIFEST_CLI_OPTIONS = new Set([
  "bsc-network",
  "evidence",
  "deployment-evidence",
  "taira-contract",
  "settlement-asset-definition-id",
  "native-prover-bundle",
  "proof-artifact-hash",
  "proving-key-hash",
  "offline-full-toml-evidence",
  "production-ready",
  "live-readback-checked",
  "confirm-testnet",
  "confirm-mainnet",
  "confirm-network",
  "out",
]);

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!BSC_ROUTE_MANIFEST_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC route manifest options.`,
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

const printUsage = () => {
  console.log(`Usage: node scripts/e2e/sccp-bsc-route-manifest.mjs [options]

Generate a BSC SCCP route manifest draft from deployment evidence.

Options:
  --bsc-network testnet|mainnet
  --evidence PATH
  --deployment-evidence PATH    Alias for --evidence
  --taira-contract PATH
  --settlement-asset-definition-id ID
  --native-prover-bundle PATH
  --proof-artifact-hash 0x...
  --proving-key-hash 0x...
  --offline-full-toml-evidence PATH
  --production-ready true|false
  --live-readback-checked true|false
  --confirm-testnet taira_bsc_xor
  --confirm-mainnet true
  --confirm-network taira_bsc_xor
  --out PATH
  --help, -h                   Show this help without reading or writing

Environment:
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK`);
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

const bytesToHex = (bytes) =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const hexBytes = (value, label, byteLength) => {
  const normalized = trim(value).toLowerCase().replace(/^0x/u, "");
  if (!new RegExp(`^[0-9a-f]{${byteLength * 2}}$`, "u").test(normalized)) {
    throw new Error(`${label} must be ${byteLength} bytes of lowercase hex.`);
  }
  const bytes = Uint8Array.from(
    normalized.match(/.{2}/gu).map((byte) => Number.parseInt(byte, 16)),
  );
  if (bytes.every((byte) => byte === 0)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return bytes;
};
const normalizeHex32 = (value, label) => bytesToHex(hexBytes(value, label, 32));
const OFFLINE_FULL_TOML_EVIDENCE_FORBIDDEN_PAYLOAD_KEYS = new Set([
  "baseConfig",
  "base_config",
  "baseConfigToml",
  "base_config_toml",
  "configToml",
  "config_toml",
  "fullConfig",
  "full_config",
  "fullConfigToml",
  "full_config_toml",
  "fullToml",
  "full_toml",
  "toml",
]);
const assertNoOfflineFullTomlPayload = (
  value,
  pathName = "BSC offline full TOML evidence",
  seen = new WeakSet(),
) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [index, entry] of ownArrayValues(value).entries()) {
      assertNoOfflineFullTomlPayload(entry, `${pathName}[${index}]`, seen);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const key of Object.keys(value)) {
    const childPath = `${pathName}.${key}`;
    if (OFFLINE_FULL_TOML_EVIDENCE_FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new Error(
        `BSC offline full TOML evidence must not embed raw TAIRA config or TOML payload material at ${childPath}.`,
      );
    }
    assertNoOfflineFullTomlPayload(ownValue(value, key), childPath, seen);
  }
};
const offlineFullTomlRelativePathProblems = (value, label) => {
  const source = trim(value);
  if (!source) {
    return [`${label} is required.`];
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
  const segments = source.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return [`${label} must be a relative path without parent traversal.`];
  }
  return [];
};
const canonicalBscNativeEvmProverBundleHash = (bundle) =>
  bytesToHex(
    sha256(
      textEncoder.encode(
        JSON.stringify({
          schema: bundle.schema,
          bundleId: bundle.bundleId,
          domain: bundle.domain,
          chain: bundle.chain,
          proofBackend: bundle.proofBackend,
          proofArtifact: bundle.proofArtifact,
          proofArtifactHash: bundle.proofArtifactHash,
          provingKey: bundle.provingKey,
          provingKeyHash: bundle.provingKeyHash,
          verifierKey: bundle.verifierKey,
          verifierKeyHash: bundle.verifierKeyHash,
          verifierKeyArtifactHash: bundle.verifierKeyArtifactHash,
          destinationBindingHash: bundle.destinationBindingHash,
          noWasm: bundle.noWasm,
          remoteProverRequired: bundle.remoteProverRequired,
          browserImplementation: bundle.browserImplementation,
          nativeSdkArtifacts: bundle.nativeSdkArtifacts,
          crossSdkParityArtifact: bundle.crossSdkParityArtifact,
          nativeProverSelfTestArtifact: bundle.nativeProverSelfTestArtifact,
          auditHashes: bundle.auditHashes,
        }),
      ),
    ),
  );
const isKnownDiagnosticBscVerifierKeyHash = (value) => {
  try {
    return SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES.has(
      normalizeHex32(value, "BSC verifier key hash"),
    );
  } catch (_error) {
    return false;
  }
};
const REPEATED_BYTE_HEX32_PATTERN = /^0x([0-9a-f]{2})\1{31}$/iu;
const REPEATED_BYTE_EVM_ADDRESS_PATTERN = /^0x([0-9a-f]{2})\1{19}$/iu;
const repeatedByteHex32 = (value) =>
  typeof value === "string" && REPEATED_BYTE_HEX32_PATTERN.test(value);
const repeatedByteHashProblems = (fields, label) => {
  const data = ownJsonValue(fields);
  return isRecord(data)
    ? Object.entries(data)
        .filter(([, value]) => repeatedByteHex32(value))
        .map(
          ([field, value]) =>
            `${label}.${field} looks like placeholder material: repeated-byte hash ${value}`,
        )
    : [];
};
const repeatedByteEvmAddress = (value) =>
  typeof value === "string" && REPEATED_BYTE_EVM_ADDRESS_PATTERN.test(value);
const repeatedByteAddressProblems = (fields, label) => {
  const data = ownJsonValue(fields);
  return isRecord(data)
    ? Object.entries(data)
        .filter(([, value]) => repeatedByteEvmAddress(value))
        .map(
          ([field, value]) =>
            `${label}.${field} looks like placeholder material: repeated-byte address ${value}`,
        )
    : [];
};
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
const pickVerifierField = (record, names) => {
  for (const name of names) {
    const value = ownValue(record, name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
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
const normalizeVerifierVector = (record, names, expectedLength) => {
  const value = pickVerifierField(record, names);
  if (!Array.isArray(value)) {
    throw new Error("missing vector");
  }
  assertDenseDataArray(value, names[0]);
  const flatten = (entry) =>
    Array.isArray(entry)
      ? ownArrayValues(entry).flatMap((child) => flatten(child))
      : [entry];
  const flattened = flatten(value).map((entry) => normalizeUint256(entry));
  if (flattened.length !== expectedLength) {
    throw new Error("wrong vector length");
  }
  return flattened;
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
const normalizeEvmAddress = (value, label) =>
  bytesToHex(hexBytes(value, label, 20));
const normalizeEvmAddressOption = (
  options,
  evidence,
  optionKeys,
  evidenceKeys,
  label,
  extraSources = [],
  forbiddenEvidenceKeys = [],
) => {
  const sources = [
    { record: options, keys: optionKeys },
    { record: evidence, keys: evidenceKeys },
    ...extraSources,
  ];
  const forbiddenKeys = forbiddenEvidenceKeys.filter((key) =>
    sources.some(({ record }) => readString(record, key)),
  );
  if (forbiddenKeys.length > 0) {
    throw new Error(
      `${label} must not use TRON aliases on BSC deployment evidence: ${forbiddenKeys.join(", ")}.`,
    );
  }
  const value = readConsistentString(label, sources);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return normalizeEvmAddress(value, label);
};
const normalizeBytes32Option = (
  options,
  evidence,
  rollout,
  optionKeys,
  evidenceKeys,
  label,
) => {
  const value = readConsistentString(label, [
    { record: options, keys: optionKeys },
    { record: evidence, keys: evidenceKeys },
    { record: rollout, keys: evidenceKeys },
  ]);
  if (value) {
    return normalizeHex32(value, label);
  }
  throw new Error(`${label} is required.`);
};
const normalizeOptionalBytes32Option = (
  options,
  evidence,
  rollout,
  optionKeys,
  evidenceKeys,
  label,
) => {
  const value = readConsistentString(label, [
    { record: options, keys: optionKeys },
    { record: evidence, keys: evidenceKeys },
    { record: rollout, keys: evidenceKeys },
  ]);
  if (value) {
    return normalizeHex32(value, label);
  }
  return null;
};
const abiWordBytes32 = (value, label) => hexBytes(value, label, 32);
const abiWordUint = (value) => {
  const out = new Uint8Array(32);
  let current = BigInt(value);
  for (let index = 31; index >= 0; index -= 1) {
    out[index] = Number(current & 0xffn);
    current >>= 8n;
  }
  return out;
};
const abiWordAddress = (address, label) => {
  const bytes = hexBytes(address, label, 20);
  const out = new Uint8Array(32);
  out.set(bytes, 12);
  return out;
};
const concatBytes = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const keccakTextHex = (value) =>
  bytesToHex(keccak_256(textEncoder.encode(value)));

const normalizeBscExplorerTxUrl = (
  value,
  label,
  expectedTxHash,
  profile = resolveBscNetworkProfile("testnet"),
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
  const expected = normalizeHex32(expectedTxHash, `${label} transaction id`);
  const actual = `0x${match[1].toLowerCase()}`;
  if (actual !== expected) {
    throw new Error(`${label} transaction hash must match ${expected}.`);
  }
  return `${profile.explorerUrl}/tx/${expected}`;
};

export const bscDestinationBindingHash = (input = {}) => {
  const networkId = ownValue(input, "networkId") ?? BSC_TESTNET_NETWORK_ID_HEX;
  const verifierAddress = ownValue(input, "verifierAddress");
  const bridgeAddress = ownValue(input, "bridgeAddress");
  const verifierCodeHash = ownValue(input, "verifierCodeHash");
  const verifierKeyHash = ownValue(input, "verifierKeyHash");
  const encoded = concatBytes([
    abiWordBytes32(
      keccakTextHex("iroha:sccp:evm-destination-binding:v1"),
      "destination binding domain separator",
    ),
    abiWordBytes32(
      keccakTextHex(BSC_EVM_GROTH16_BACKEND),
      "verifier backend hash",
    ),
    abiWordBytes32(
      keccakTextHex(SCCP_PROOF_FAMILY_STARK_FRI),
      "proof family hash",
    ),
    abiWordBytes32(networkId, "BSC network id"),
    abiWordUint(SCCP_DOMAIN_SORA),
    abiWordUint(SCCP_DOMAIN_BSC),
    abiWordAddress(verifierAddress, "BSC verifier address"),
    abiWordAddress(bridgeAddress, "BSC bridge address"),
    abiWordBytes32(verifierCodeHash, "BSC verifier code hash"),
    abiWordBytes32(verifierKeyHash, "BSC verifier key hash"),
  ]);
  return bytesToHex(keccak_256(encoded));
};

export const bscDestinationBindingKey = (input = {}) => {
  const networkId = ownValue(input, "networkId") ?? BSC_TESTNET_NETWORK_ID_HEX;
  const verifierAddress = ownValue(input, "verifierAddress");
  const bridgeAddress = ownValue(input, "bridgeAddress");
  const verifierCodeHash = ownValue(input, "verifierCodeHash");
  const verifierKeyHash = ownValue(input, "verifierKeyHash");
  return `evm:${SCCP_DOMAIN_SORA}:${SCCP_DOMAIN_BSC}:${normalizeHex32(
    networkId,
    "BSC network id",
  ).slice(2)}:${normalizeEvmAddress(
    verifierAddress,
    "BSC verifier address",
  )}:${normalizeEvmAddress(bridgeAddress, "BSC bridge address")}:${normalizeHex32(
    verifierCodeHash,
    "BSC verifier code hash",
  )}:${normalizeHex32(verifierKeyHash, "BSC verifier key hash")}`;
};

const normalizeCanonicalAssetDefinitionId = (value, label) => {
  const text = trim(value);
  if (!BASE58_RE.test(text) || text.includes("#")) {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }
  return text;
};
const normalizeRefText = (value, label) => {
  const text = trim(value);
  if (!/^[A-Za-z0-9._:/-]{1,128}$/u.test(text)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return text;
};
const normalizePositiveInteger = (value, label, fallback) => {
  const source =
    value === undefined || value === null || value === "" ? fallback : value;
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};
const requireEvidenceString = (record, keys, label) => {
  const value = readConsistentStringValue(record, keys, label);
  if (!value) {
    throw new Error(`${label} is required in BSC deployment evidence.`);
  }
  return value;
};
const assertEvidenceEquals = (record, keys, expected, label) => {
  const value = requireEvidenceString(record, keys, label);
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}; received ${value}.`);
  }
};
const assertOptionalEvidenceEquals = (record, keys, expected, label) => {
  const value = readConsistentStringValue(record, keys, label);
  if (value && value !== expected) {
    throw new Error(`${label} must be ${expected}; received ${value}.`);
  }
};
const assertBscDeploymentEvidenceIdentity = (
  evidence,
  rollout,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  assertEvidenceEquals(
    evidence,
    ["routeId", "route_id", "route"],
    SCCP_BSC_XOR_ROUTE_ID,
    "routeId",
  );
  assertEvidenceEquals(
    evidence,
    ["assetKey", "asset_key"],
    SCCP_BSC_XOR_ASSET_KEY,
    "assetKey",
  );
  assertOptionalEvidenceEquals(
    evidence,
    ["bscNetwork", "bsc_network"],
    profile.key,
    "bscNetwork",
  );
  assertOptionalEvidenceEquals(evidence, ["chain"], profile.chain, "chain");
  assertOptionalEvidenceEquals(
    evidence,
    ["chainIdHex", "chain_id_hex"],
    profile.chainIdHex,
    "chainIdHex",
  );
  assertOptionalEvidenceEquals(
    evidence,
    ["networkIdHex", "network_id_hex"],
    profile.networkIdHex,
    "networkIdHex",
  );
  assertOptionalEvidenceEquals(
    evidence,
    ["explorerUrl", "explorer_url", "bscExplorerUrl", "bsc_explorer_url"],
    profile.explorerUrl,
    "explorerUrl",
  );
  assertOptionalEvidenceEquals(
    evidence,
    ["explorerHost", "explorer_host", "bscExplorerHost", "bsc_explorer_host"],
    profile.explorerHost,
    "explorerHost",
  );
  assertOptionalEvidenceEquals(
    rollout,
    ["destinationNetworkId", "destination_network_id"],
    profile.networkIdHex,
    "destinationRollout.destinationNetworkId",
  );
};
const normalizeStrictBase64 = (value, label) => {
  const text = trim(value);
  if (!text || /[\s]/u.test(text)) {
    throw new Error(`${label} must be strict base64 without whitespace.`);
  }
  const bytes = Buffer.from(text, "base64");
  if (!bytes.length || bytes.toString("base64") !== text) {
    throw new Error(`${label} must be strict base64.`);
  }
  return { text, bytes };
};
const normalizeBurnRecordContract = (contract, options = {}) => {
  const artifact = normalizeStrictBase64(
    requireConsistentStringValue(
      contract,
      ["contractArtifactB64", "contract_artifact_b64", "artifact_b64"],
      "TAIRA burn-record contract artifact",
    ),
    "TAIRA burn-record contract artifact",
  );
  if (
    artifact.bytes.length < TAIRA_BURN_RECORD_ARTIFACT_MIN_BYTES ||
    artifact.bytes.length > TAIRA_BURN_RECORD_ARTIFACT_MAX_BYTES
  ) {
    throw new Error(
      `TAIRA burn-record artifact must decode to ${TAIRA_BURN_RECORD_ARTIFACT_MIN_BYTES}-${TAIRA_BURN_RECORD_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  if (
    parseBoolean(ownValue(options, "production-ready"), "--production-ready")
  ) {
    assertBscBurnRecordProductionArtifact(
      artifact.bytes,
      "TAIRA burn-record contract artifact",
    );
  }
  const artifactSha256 = bytesToHex(sha256(new Uint8Array(artifact.bytes)));
  const declaredSha256 = normalizeHex32(
    requireConsistentStringValue(
      contract,
      ["artifactSha256", "artifact_sha256"],
      "TAIRA burn-record artifact sha256",
    ),
    "TAIRA burn-record artifact sha256",
  );
  if (declaredSha256 !== artifactSha256) {
    throw new Error(
      "TAIRA burn-record artifact sha256 does not match artifact bytes.",
    );
  }
  const vkRef =
    readSingleRecordAlias(
      contract,
      ["vkRef", "vk_ref"],
      "TAIRA burn-record vkRef",
    ) ?? {};
  const backend = normalizeRefText(
    readConsistentString("--vk-backend", [
      { record: options, keys: ["vk-backend"] },
      { record: vkRef, keys: ["backend"] },
    ]),
    "--vk-backend",
  );
  const name = normalizeRefText(
    readConsistentString("--vk-name", [
      { record: options, keys: ["vk-name"] },
      { record: vkRef, keys: ["name"] },
    ]),
    "--vk-name",
  );
  return {
    contractArtifactB64: artifact.text,
    artifactSha256,
    codeHash: normalizeHex32(
      requireConsistentStringValue(
        contract,
        ["codeHash", "code_hash"],
        "TAIRA burn-record code hash",
      ),
      "TAIRA burn-record code hash",
    ),
    vkRef: { backend, name },
  };
};
const assertNoSecretLike = (
  value,
  pathName = "manifest input",
  seen = new WeakSet(),
) => {
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s+/gu, " ");
    if (
      PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
      SECRET_ASSIGNMENT_RE.test(normalized) ||
      SECRET_VALUE_RE.test(normalized)
    ) {
      throw new Error(SECRET_LIKE_MANIFEST_INPUT_ERROR);
    }
    const words = normalized.toLowerCase().split(" ");
    if (
      BIP39_WORD_COUNTS.has(words.length) &&
      validateMnemonic(words.join(" "), wordlist)
    ) {
      throw new Error(SECRET_LIKE_MANIFEST_INPUT_ERROR);
    }
    return;
  }
  if (!isRecord(value) && !Array.isArray(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const entries = Array.isArray(value)
    ? ownArrayValues(value).map((entry, index) => [String(index), entry])
    : Object.keys(value).map((key) => [key, ownValue(value, key)]);
  for (const [key, child] of entries) {
    if (SECRET_KEY_RE.test(key)) {
      throw new Error(SECRET_LIKE_MANIFEST_INPUT_ERROR);
    }
    assertNoSecretLike(child, `${pathName}.${key}`, seen);
  }
};
const readNativeProverBundleInput = async (options) => {
  const direct = [
    "nativeEvmProverBundle",
    "native_evm_prover_bundle",
    "nativeProverBundle",
    "native_prover_bundle",
  ]
    .map((key) => ownValue(options, key))
    .find((value) => value !== null && value !== undefined);
  if (direct !== null && direct !== undefined) {
    if (!isRecord(direct)) {
      throw new Error("nativeEvmProverBundle option must be an object.");
    }
    return cloneOwnRecord(direct);
  }
  const bundlePath = NATIVE_PROVER_BUNDLE_OPTION_KEYS.map((key) =>
    ownValue(options, key),
  ).find((value) => typeof value === "string" && value.trim());
  if (!bundlePath) {
    return null;
  }
  const resolved = path.resolve(repoRoot, bundlePath);
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error(`${resolved} must not be a symbolic link`);
    }
    if (!info.isFile()) {
      throw new Error(`${resolved} must be a regular file`);
    }
    if (info.size > ROUTE_MANIFEST_JSON_INPUT_MAX_BYTES) {
      throw new Error(
        `${resolved} is ${info.size} bytes; maximum allowed is ${ROUTE_MANIFEST_JSON_INPUT_MAX_BYTES} bytes`,
      );
    }
    const parsed = parseJsonWithoutDuplicateKeys(
      await readFile(resolved, "utf8"),
      `BSC native EVM prover bundle ${resolved}`,
    );
    if (!isRecord(parsed)) {
      throw new Error(`${resolved} must be a JSON object`);
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `BSC native EVM prover bundle could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
const requireNativeProverVerifierKeyArtifactHash = (
  record,
  verifierKeyHash,
  label = "BSC native EVM prover bundle",
) => {
  const presentKeys =
    NATIVE_EVM_PROVER_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_KEYS.filter((key) =>
      hasOwn(record, key),
    ).filter(
      (key) =>
        ownValue(record, key) !== undefined && ownValue(record, key) !== null,
    );
  if (presentKeys.length === 0) {
    throw new Error(
      `${label} verifierKeyArtifactHash is required for production BSC native EVM prover bundles.`,
    );
  }
  if (presentKeys.length > 1) {
    throw new Error(
      `${label} verifierKeyArtifactHash must not use multiple aliases: ${presentKeys.join(", ")}.`,
    );
  }
  const verifierKeyArtifactHash = normalizeHex32(
    readString(record, presentKeys[0]),
    `${label}.${presentKeys[0]}`,
  );
  if (verifierKeyArtifactHash === verifierKeyHash) {
    throw new Error(
      `${label} verifierKeyArtifactHash must be role-separated from verifierKeyHash.`,
    );
  }
  return verifierKeyArtifactHash;
};

const nativeProverBundleRoleSeparationProblems = (bundle, label) => {
  const problems = [];
  const seen = new Map();
  for (const key of NATIVE_EVM_PROVER_ROLE_SEPARATED_HASH_FIELDS) {
    const value = ownValue(bundle, key);
    if (!value) {
      continue;
    }
    const normalized = normalizeHex32(value, `${label}.${key}`);
    const previous = seen.get(normalized);
    if (previous) {
      problems.push(`${label} ${key} must be role-separated from ${previous}.`);
    } else {
      seen.set(normalized, key);
    }
  }
  return problems;
};

const normalizeNativeProverBundleForManifest = async ({
  options,
  profile = resolveBscNetworkProfile("testnet"),
  productionReady,
  verifierKeyHash,
  proofArtifactHash,
  provingKeyHash,
  destinationBindingHash,
}) => {
  const input = await readNativeProverBundleInput(options);
  if (!input) {
    if (productionReady) {
      throw new Error(
        "production-ready BSC manifests require --native-prover-bundle.",
      );
    }
    return null;
  }
  assertNoSecretLike(input, "BSC native EVM prover bundle");
  let normalized;
  const verifierKeyArtifactHash = requireNativeProverVerifierKeyArtifactHash(
    input,
    verifierKeyHash,
  );
  try {
    const validateBundle =
      profile.key === "mainnet"
        ? validateBscMainnetNativeEvmProverBundle
        : validateBscTestnetNativeEvmProverBundle;
    normalized = validateBundle(input, {
      expectedDestinationBindingHash: destinationBindingHash,
    });
  } catch (error) {
    throw new Error(
      `BSC native EVM prover bundle failed SDK validation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  normalized = {
    ...normalized,
    verifierKeyArtifactHash,
  };
  const nativeEvmProverBundleHash =
    canonicalBscNativeEvmProverBundleHash(normalized);
  const roleSeparationProblems = nativeProverBundleRoleSeparationProblems(
    {
      verifierKeyHash: normalized.verifierKeyHash,
      verifierKeyArtifactHash,
      proofArtifactHash: normalized.proofArtifactHash,
      provingKeyHash: normalized.provingKeyHash,
      groth16ProofSelfTestHash: normalized.groth16ProofSelfTestHash,
      nativeEvmProverBundleHash,
      destinationBindingHash: normalized.destinationBindingHash,
    },
    "BSC native EVM prover bundle",
  );
  if (roleSeparationProblems.length > 0) {
    throw new Error(roleSeparationProblems.join("; "));
  }
  if (normalized.verifierKeyHash !== verifierKeyHash) {
    throw new Error(
      "BSC native EVM prover bundle verifierKeyHash must match the route verifierKeyHash.",
    );
  }
  if (normalized.proofArtifactHash !== proofArtifactHash) {
    throw new Error(
      "BSC native EVM prover bundle proofArtifactHash must match the route proofArtifactHash.",
    );
  }
  if (normalized.provingKeyHash !== provingKeyHash) {
    throw new Error(
      "BSC native EVM prover bundle provingKeyHash must match the route provingKeyHash.",
    );
  }
  return {
    bundle: normalized,
    nativeEvmProverBundleHash,
  };
};
const postDeployString = (options, record, optionKey, ...recordKeys) =>
  ownValue(options, optionKey) || readFirstString(record, ...recordKeys);

const assertSinglePostDeployAlias = (
  options,
  record,
  optionKey,
  label,
  recordKeys,
) => {
  if (ownValue(options, optionKey)) {
    return;
  }
  const presentKeys = recordKeys.filter((key) => {
    if (!hasOwn(record, key)) {
      return false;
    }
    const value = ownValue(record, key);
    return (
      (typeof value === "string" && value.trim()) || typeof value === "boolean"
    );
  });
  if (presentKeys.length > 1) {
    throw new Error(
      `${label} must not use multiple aliases in postDeployLiveEvidence: ${presentKeys.join(", ")}.`,
    );
  }
};

const POST_DEPLOY_OPTION_KEYS = [
  "full-toml-ready",
  "source-bridge-config-hash",
  "source-event-transaction-id",
  "source-event-explorer-url",
  "route-canary-evidence-hash",
  "route-canary-transaction-id",
  "route-canary-explorer-url",
  "offline-full-toml-sha256",
  "offline-full-toml-evidence",
];

const readPostDeployRecord = (evidence) =>
  readSingleRecordAlias(
    evidence,
    ["postDeployLiveEvidence", "post_deploy_live_evidence"],
    "postDeployLiveEvidence",
  ) ?? {};

const hasPostDeployEvidence = (evidence, options = {}) => {
  const record = readPostDeployRecord(evidence);
  const data = ownJsonValue(record);
  return (
    (isRecord(data) && Object.keys(data).length > 0) ||
    POST_DEPLOY_OPTION_KEYS.some((key) => ownValue(options, key))
  );
};

const normalizePostDeployEvidence = (
  evidence,
  options = {},
  {
    requireFullTomlReady = true,
    profile = resolveBscNetworkProfile("testnet"),
  } = {},
) => {
  const record = readPostDeployRecord(evidence);
  if (!hasPostDeployEvidence(evidence, options)) {
    throw new Error(
      "postDeployLiveEvidence is required for production readiness.",
    );
  }
  const fullTomlReady = ownValue(options, "full-toml-ready")
    ? parseBoolean(ownValue(options, "full-toml-ready"), "--full-toml-ready")
    : readConsistentBooleanValue(
        record,
        ["fullTomlReady", "full_toml_ready"],
        "postDeployLiveEvidence.fullTomlReady",
      ) === true;
  if (requireFullTomlReady && !fullTomlReady) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }
  assertSinglePostDeployAlias(
    options,
    record,
    "full-toml-ready",
    "postDeployLiveEvidence.fullTomlReady",
    ["fullTomlReady", "full_toml_ready"],
  );
  assertSinglePostDeployAlias(
    options,
    record,
    "offline-full-toml-sha256",
    "postDeployLiveEvidence.offlineFullTomlSha256",
    ["offlineFullTomlSha256", "offline_full_toml_sha256"],
  );
  const offlineFullTomlSha256 = postDeployString(
    options,
    record,
    "offline-full-toml-sha256",
    "offlineFullTomlSha256",
    "offline_full_toml_sha256",
  );
  if (requireFullTomlReady && !offlineFullTomlSha256) {
    throw new Error(
      "postDeployLiveEvidence.offlineFullTomlSha256 is required for production readiness.",
    );
  }
  if (fullTomlReady && !offlineFullTomlSha256) {
    throw new Error(
      "postDeployLiveEvidence.fullTomlReady requires postDeployLiveEvidence.offlineFullTomlSha256.",
    );
  }
  assertSinglePostDeployAlias(
    options,
    record,
    "source-bridge-config-hash",
    "postDeployLiveEvidence.sourceBridgeConfigHash",
    ["sourceBridgeConfigHash", "source_bridge_config_hash"],
  );
  assertSinglePostDeployAlias(
    options,
    record,
    "source-event-transaction-id",
    "postDeployLiveEvidence.sourceEventTransactionId",
    ["sourceEventTransactionId", "source_event_transaction_id"],
  );
  assertSinglePostDeployAlias(
    options,
    record,
    "route-canary-evidence-hash",
    "postDeployLiveEvidence.routeCanaryEvidenceHash",
    ["routeCanaryEvidenceHash", "route_canary_evidence_hash"],
  );
  assertSinglePostDeployAlias(
    options,
    record,
    "route-canary-transaction-id",
    "postDeployLiveEvidence.routeCanaryTransactionId",
    ["routeCanaryTransactionId", "route_canary_transaction_id"],
  );
  const normalized = {
    fullTomlReady,
    sourceBridgeConfigHash: normalizeHex32(
      postDeployString(
        options,
        record,
        "source-bridge-config-hash",
        "sourceBridgeConfigHash",
        "source_bridge_config_hash",
      ),
      "postDeployLiveEvidence.sourceBridgeConfigHash",
    ),
    sourceEventTransactionId: normalizeHex32(
      postDeployString(
        options,
        record,
        "source-event-transaction-id",
        "sourceEventTransactionId",
        "source_event_transaction_id",
      ),
      "postDeployLiveEvidence.sourceEventTransactionId",
    ),
    routeCanaryEvidenceHash: normalizeHex32(
      postDeployString(
        options,
        record,
        "route-canary-evidence-hash",
        "routeCanaryEvidenceHash",
        "route_canary_evidence_hash",
      ),
      "postDeployLiveEvidence.routeCanaryEvidenceHash",
    ),
    routeCanaryTransactionId: normalizeHex32(
      postDeployString(
        options,
        record,
        "route-canary-transaction-id",
        "routeCanaryTransactionId",
        "route_canary_transaction_id",
      ),
      "postDeployLiveEvidence.routeCanaryTransactionId",
    ),
    ...(offlineFullTomlSha256
      ? {
          offlineFullTomlSha256: normalizeHex32(
            offlineFullTomlSha256,
            "postDeployLiveEvidence.offlineFullTomlSha256",
          ),
        }
      : {}),
  };
  assertSinglePostDeployAlias(
    options,
    record,
    "source-event-explorer-url",
    "postDeployLiveEvidence.sourceEventExplorerUrl",
    [
      "sourceEventExplorerUrl",
      "source_event_explorer_url",
      "sourceEventTransactionUrl",
      "source_event_transaction_url",
    ],
  );
  normalized.sourceEventExplorerUrl = normalizeBscExplorerTxUrl(
    postDeployString(
      options,
      record,
      "source-event-explorer-url",
      "sourceEventExplorerUrl",
      "source_event_explorer_url",
      "sourceEventTransactionUrl",
      "source_event_transaction_url",
    ),
    "postDeployLiveEvidence.sourceEventExplorerUrl",
    normalized.sourceEventTransactionId,
    profile,
  );
  assertSinglePostDeployAlias(
    options,
    record,
    "route-canary-explorer-url",
    "postDeployLiveEvidence.routeCanaryExplorerUrl",
    [
      "routeCanaryExplorerUrl",
      "route_canary_explorer_url",
      "routeCanaryTransactionUrl",
      "route_canary_transaction_url",
    ],
  );
  normalized.routeCanaryExplorerUrl = normalizeBscExplorerTxUrl(
    postDeployString(
      options,
      record,
      "route-canary-explorer-url",
      "routeCanaryExplorerUrl",
      "route_canary_explorer_url",
      "routeCanaryTransactionUrl",
      "route_canary_transaction_url",
    ),
    "postDeployLiveEvidence.routeCanaryExplorerUrl",
    normalized.routeCanaryTransactionId,
    profile,
  );
  if (
    normalized.sourceBridgeConfigHash === normalized.routeCanaryEvidenceHash
  ) {
    throw new Error(
      "postDeployLiveEvidence source bridge config hash and route canary evidence hash must be distinct.",
    );
  }
  if (
    normalized.sourceEventTransactionId === normalized.routeCanaryTransactionId
  ) {
    throw new Error(
      "postDeployLiveEvidence source event and route canary transaction ids must be distinct.",
    );
  }
  return normalized;
};

const normalizeOfflineFullTomlEvidence = (record, profile) => {
  if (!isRecord(record)) {
    throw new Error("BSC offline full TOML evidence must be an object.");
  }
  assertNoSecretLike(record, "BSC offline full TOML evidence");
  assertNoOfflineFullTomlPayload(record);
  const schema = requireConsistentStringValue(
    record,
    ["schema"],
    "BSC offline full TOML evidence schema",
  );
  if (schema !== SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_SCHEMA) {
    throw new Error(
      `BSC offline full TOML evidence schema must be ${SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_SCHEMA}.`,
    );
  }
  const routeId = requireConsistentStringValue(
    record,
    ["routeId", "route_id"],
    "BSC offline full TOML evidence routeId",
  );
  if (routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    throw new Error(
      `BSC offline full TOML evidence routeId must be ${SCCP_BSC_XOR_ROUTE_ID}.`,
    );
  }
  const assetKey = requireConsistentStringValue(
    record,
    ["assetKey", "asset_key"],
    "BSC offline full TOML evidence assetKey",
  );
  if (assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    throw new Error(
      `BSC offline full TOML evidence assetKey must be ${SCCP_BSC_XOR_ASSET_KEY}.`,
    );
  }
  const networkValues = ["bscNetwork", "bsc_network", "network", "chain"]
    .map((key) => readString(record, key))
    .filter(Boolean);
  if (networkValues.length === 0) {
    throw new Error("BSC offline full TOML evidence network is required.");
  }
  const evidenceProfile = resolveBscNetworkProfile(networkValues[0]);
  for (const value of networkValues.slice(1)) {
    const aliasProfile = resolveBscNetworkProfile(value);
    if (aliasProfile.key !== evidenceProfile.key) {
      throw new Error(
        "BSC offline full TOML evidence network aliases disagree.",
      );
    }
  }
  if (evidenceProfile.key !== profile.key) {
    throw new Error(
      "BSC offline full TOML evidence network must match deployment evidence network.",
    );
  }
  const postDeployRecord =
    readSingleRecordAlias(
      record,
      ["postDeployLiveEvidence", "post_deploy_live_evidence"],
      "BSC offline full TOML evidence postDeployLiveEvidence",
    ) ?? {};
  const fullTomlReady = readConsistentBooleanValue(
    record,
    ["fullTomlReady", "full_toml_ready"],
    "BSC offline full TOML evidence fullTomlReady",
  );
  const nestedFullTomlReady = readConsistentBooleanValue(
    postDeployRecord,
    ["fullTomlReady", "full_toml_ready"],
    "BSC offline full TOML evidence postDeployLiveEvidence.fullTomlReady",
  );
  if (fullTomlReady !== true || nestedFullTomlReady !== true) {
    throw new Error(
      "BSC offline full TOML evidence fullTomlReady must be true.",
    );
  }
  const offlineFullTomlSha256 = normalizeHex32(
    readConsistentString(
      "BSC offline full TOML evidence offlineFullTomlSha256",
      [
        {
          record,
          keys: ["offlineFullTomlSha256", "offline_full_toml_sha256"],
        },
        {
          record: postDeployRecord,
          keys: ["offlineFullTomlSha256", "offline_full_toml_sha256"],
        },
      ],
    ),
    "BSC offline full TOML evidence offlineFullTomlSha256",
  );
  const hashMode = requireConsistentStringValue(
    record,
    ["hashMode", "hash_mode"],
    "BSC offline full TOML evidence hashMode",
  );
  if (hashMode !== SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_HASH_MODE) {
    throw new Error(
      `BSC offline full TOML evidence hashMode must be ${SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_HASH_MODE}.`,
    );
  }
  const hashInputSha256 = normalizeHex32(
    readConsistentStringValue(
      record,
      ["hashInputSha256", "hash_input_sha256"],
      "BSC offline full TOML evidence hashInputSha256",
    ),
    "BSC offline full TOML evidence hashInputSha256",
  );
  if (hashInputSha256 !== offlineFullTomlSha256) {
    throw new Error(
      "BSC offline full TOML evidence hashInputSha256 must equal offlineFullTomlSha256.",
    );
  }
  normalizeHex32(
    readConsistentStringValue(
      record,
      ["renderedTomlSha256", "rendered_toml_sha256"],
      "BSC offline full TOML evidence renderedTomlSha256",
    ),
    "BSC offline full TOML evidence renderedTomlSha256",
  );
  for (const [keys, label] of [
    [
      ["routeManifestPath", "route_manifest_path"],
      "BSC offline full TOML evidence routeManifestPath",
    ],
    [
      ["fullConfigPath", "full_config_path"],
      "BSC offline full TOML evidence fullConfigPath",
    ],
  ]) {
    const value = requireConsistentStringValue(record, keys, label);
    const pathProblems = offlineFullTomlRelativePathProblems(value, label);
    if (pathProblems.length > 0) {
      throw new Error(pathProblems[0]);
    }
  }
  return {
    fullTomlReady: true,
    offlineFullTomlSha256,
  };
};

const mergeOfflineFullTomlEvidenceOptions = (options, offlineEvidence) => {
  if (!offlineEvidence) {
    return options;
  }
  const merged = cloneOwnRecord(options);
  if (
    ownValue(options, "full-toml-ready") !== undefined &&
    !parseBoolean(ownValue(options, "full-toml-ready"), "--full-toml-ready")
  ) {
    throw new Error(
      "--full-toml-ready disagrees with --offline-full-toml-evidence.",
    );
  }
  merged["full-toml-ready"] = "true";
  if (ownValue(options, "offline-full-toml-sha256")) {
    const suppliedHash = normalizeHex32(
      ownValue(options, "offline-full-toml-sha256"),
      "--offline-full-toml-sha256",
    );
    if (suppliedHash !== offlineEvidence.offlineFullTomlSha256) {
      throw new Error(
        "--offline-full-toml-sha256 disagrees with --offline-full-toml-evidence.",
      );
    }
  }
  merged["offline-full-toml-sha256"] = offlineEvidence.offlineFullTomlSha256;
  return merged;
};
const normalizeBscLiveReadback = ({
  evidence,
  addresses,
  bindingHash,
  verifierCodeHash,
  verifierKeyHash,
  profile = resolveBscNetworkProfile("testnet"),
}) => {
  const record = readSingleRecordAlias(
    evidence,
    [
      "bscContractReadback",
      "bsc_contract_readback",
      "liveReadback",
      "live_readback",
    ],
    "BSC contract readback evidence",
  );
  if (!record) {
    throw new Error(
      "BSC contract readback evidence is required for production readiness.",
    );
  }
  if (
    requireConsistentStringValue(
      record,
      ["chainIdHex", "chain_id_hex"],
      "BSC readback chainIdHex",
    ).toLowerCase() !== profile.chainIdHex
  ) {
    throw new Error(
      `BSC contract readback must report ${profile.label} chain id ${profile.chainIdHex}.`,
    );
  }
  const codePresent =
    readSingleRecordAlias(
      record,
      ["codePresent", "code_present"],
      "BSC readback codePresent",
    ) ?? {};
  for (const key of ["token", "bridge", "sourceBridge", "verifier"]) {
    const snake = key.replace(
      /[A-Z]/gu,
      (letter) => `_${letter.toLowerCase()}`,
    );
    if (
      requireConsistentBooleanValue(
        codePresent,
        [key, snake],
        `BSC readback ${key} bytecode`,
      ) !== true
    ) {
      throw new Error(`BSC contract readback must confirm ${key} bytecode.`);
    }
  }
  if (
    normalizeEvmAddress(
      requireConsistentStringValue(
        record,
        ["tokenBridgeAddress", "token_bridge_address"],
        "BSC readback tokenBridgeAddress",
      ),
      "BSC readback tokenBridgeAddress",
    ) !== addresses.bridge
  ) {
    throw new Error(
      "BSC readback token bridge address does not match the route bridge.",
    );
  }
  if (
    requireConsistentBooleanValue(
      record,
      ["tokenBridgeLocked", "token_bridge_locked"],
      "BSC readback tokenBridgeLocked",
    ) !== true
  ) {
    throw new Error("BSC readback token bridge must be locked.");
  }
  if (
    normalizeEvmAddress(
      requireConsistentStringValue(
        record,
        ["sourceBridgeOwner", "source_bridge_owner"],
        "BSC readback sourceBridgeOwner",
      ),
      "BSC readback sourceBridgeOwner",
    ) !== addresses.bridge
  ) {
    throw new Error(
      "BSC readback source bridge owner does not match the route bridge.",
    );
  }
  if (
    normalizeHex32(
      requireConsistentStringValue(
        record,
        ["bridgeDestinationBindingHash", "bridge_destination_binding_hash"],
        "BSC readback bridgeDestinationBindingHash",
      ),
      "BSC readback bridge destination binding hash",
    ) !== bindingHash
  ) {
    throw new Error(
      "BSC readback bridge destination binding hash does not match computed binding hash.",
    );
  }
  if (
    normalizeEvmAddress(
      requireConsistentStringValue(
        record,
        ["bridgeVerifierAddress", "bridge_verifier_address"],
        "BSC readback bridgeVerifierAddress",
      ),
      "BSC readback bridgeVerifierAddress",
    ) !== addresses.verifier
  ) {
    throw new Error(
      "BSC readback bridge verifier address does not match the verifier.",
    );
  }
  if (
    normalizeHex32(
      requireConsistentStringValue(
        record,
        ["bridgeVerifierCodeHash", "bridge_verifier_code_hash"],
        "BSC readback bridgeVerifierCodeHash",
      ),
      "BSC readback bridgeVerifierCodeHash",
    ) !== verifierCodeHash
  ) {
    throw new Error(
      "BSC readback bridge verifier code hash does not match rollout evidence.",
    );
  }
  if (
    normalizeHex32(
      requireConsistentStringValue(
        record,
        ["bridgeVerifierKeyHash", "bridge_verifier_key_hash"],
        "BSC readback bridgeVerifierKeyHash",
      ),
      "BSC readback bridgeVerifierKeyHash",
    ) !== verifierKeyHash
  ) {
    throw new Error(
      "BSC readback bridge verifier key hash does not match rollout evidence.",
    );
  }
  if (
    normalizeHex32(
      requireConsistentStringValue(
        record,
        ["verifierKeyHash", "verifier_key_hash"],
        "BSC readback verifierKeyHash",
      ),
      "BSC readback verifierKeyHash",
    ) !== verifierKeyHash
  ) {
    throw new Error(
      "BSC readback verifier key hash does not match rollout evidence.",
    );
  }
  if (
    normalizeHex32(
      requireConsistentStringValue(
        record,
        ["bridgeNetworkId", "bridge_network_id"],
        "BSC readback bridgeNetworkId",
      ),
      "BSC readback bridgeNetworkId",
    ) !== profile.networkIdHex
  ) {
    throw new Error(`BSC readback bridge network id must be ${profile.label}.`);
  }
  const sourceDomain = readConsistentIntegerValue(
    record,
    ["bridgeSourceDomain", "bridge_source_domain"],
    "BSC readback bridgeSourceDomain",
  );
  const targetDomain = readConsistentIntegerValue(
    record,
    ["bridgeTargetDomain", "bridge_target_domain"],
    "BSC readback bridgeTargetDomain",
  );
  if (sourceDomain !== SCCP_DOMAIN_SORA || targetDomain !== SCCP_DOMAIN_BSC) {
    throw new Error("BSC readback bridge domains must be SORA to BSC.");
  }
  return true;
};

export const buildBscRouteManifestDraft = async (input = {}) => {
  let options = ownValue(input, "options") ?? {};
  const evidence = ownValue(input, "evidence");
  const tairaContract = ownValue(input, "tairaContract");
  const offlineFullTomlEvidence =
    ownValue(input, "offlineFullTomlEvidence") ?? null;
  const createdAt = ownValue(input, "createdAt") ?? new Date().toISOString();
  options = cloneOwnRecord(options);
  const profile = resolveBscNetworkProfile(
    ownValue(options, "bsc-network") ||
      ownValue(options, "bscNetwork") ||
      ownValue(options, "bsc_network") ||
      process.env.SCCP_BSC_NETWORK ||
      process.env.VITE_SCCP_BSC_NETWORK ||
      "testnet",
  );
  if (!isRecord(evidence)) {
    throw new Error("BSC deployment evidence must be an object.");
  }
  if (!isRecord(tairaContract)) {
    throw new Error("TAIRA burn-record contract must be an object.");
  }
  assertNoSecretLike(evidence, "BSC deployment evidence");
  assertNoSecretLike(tairaContract, "TAIRA burn-record contract");
  const normalizedOfflineFullTomlEvidence = offlineFullTomlEvidence
    ? normalizeOfflineFullTomlEvidence(offlineFullTomlEvidence, profile)
    : null;
  const postDeployOptions = mergeOfflineFullTomlEvidenceOptions(
    options,
    normalizedOfflineFullTomlEvidence,
  );
  const rollout =
    readSingleRecordAlias(
      evidence,
      ["destinationRollout", "destination_rollout"],
      "destinationRollout",
    ) ?? {};
  assertBscDeploymentEvidenceIdentity(evidence, rollout, profile);
  const addresses = {
    bridge: normalizeEvmAddressOption(
      options,
      evidence,
      ["bridge", "bridge-address", "bsc-bridge-address"],
      [
        "bscBridgeAddress",
        "bsc_bridge_address",
        "tairaXorBridgeAddress",
        "taira_xor_bridge_address",
        "bridgeAddress",
        "bridge_address",
        "evmBridgeAddress",
        "evm_bridge_address",
      ],
      "BSC bridge address",
      [
        {
          record: rollout,
          keys: ["destinationBridgeAddress", "destination_bridge_address"],
        },
      ],
    ),
    token: normalizeEvmAddressOption(
      options,
      evidence,
      ["token", "token-address", "bsc-token-address"],
      [
        "bscTokenAddress",
        "bsc_token_address",
        "tairaXorTokenAddress",
        "taira_xor_token_address",
        "tokenAddress",
        "token_address",
        "evmTokenAddress",
        "evm_token_address",
      ],
      "BSC token address",
    ),
    sourceBridge: normalizeEvmAddressOption(
      options,
      evidence,
      ["source-bridge", "source-bridge-address", "bsc-source-bridge-address"],
      [
        "sccpBscSourceBridgeAddress",
        "sccp_bsc_source_bridge_address",
        "bscSourceBridgeAddress",
        "bsc_source_bridge_address",
        "sccpTronSourceBridgeAddress",
        "sccp_tron_source_bridge_address",
        "tronSourceBridgeAddress",
        "tron_source_bridge_address",
        "evmSourceBridgeAddress",
        "evm_source_bridge_address",
        "sourceBridgeAddress",
        "source_bridge_address",
      ],
      "BSC source bridge address",
      [],
      FORBIDDEN_BSC_SOURCE_BRIDGE_ALIASES,
    ),
    verifier: normalizeEvmAddressOption(
      options,
      evidence,
      ["verifier", "verifier-address", "bsc-verifier-address"],
      [
        "bscVerifierAddress",
        "bsc_verifier_address",
        "evmVerifierAddress",
        "evm_verifier_address",
        "destinationVerifierAddress",
        "destination_verifier_address",
        "verifierAddress",
        "verifier_address",
        "tronVerifierAddress",
        "tron_verifier_address",
        "sccpTronDestinationVerifierAddress",
        "sccp_tron_destination_verifier_address",
      ],
      "BSC verifier address",
      [
        {
          record: rollout,
          keys: ["verifierIdentity", "verifier_identity"],
        },
      ],
      FORBIDDEN_BSC_VERIFIER_ALIASES,
    ),
  };
  if (new Set(Object.values(addresses)).size !== 4) {
    throw new Error(
      "BSC token, bridge, source bridge, and verifier addresses must be distinct.",
    );
  }
  const verifierCodeHash = normalizeBytes32Option(
    options,
    evidence,
    rollout,
    ["verifier-code-hash"],
    ["verifierCodeHash", "verifier_code_hash"],
    "BSC verifier code hash",
  );
  const verifierKeyHash = normalizeBytes32Option(
    options,
    evidence,
    rollout,
    ["verifier-key-hash"],
    ["verifierKeyHash", "verifier_key_hash"],
    "BSC verifier key hash",
  );
  const proofArtifactHash = normalizeOptionalBytes32Option(
    options,
    evidence,
    rollout,
    ["proof-artifact-hash", "prover-artifact-hash", "circuit-artifact-hash"],
    [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "circuitArtifactHash",
      "circuit_artifact_hash",
    ],
    "BSC proof artifact hash",
  );
  const provingKeyHash = normalizeOptionalBytes32Option(
    options,
    evidence,
    rollout,
    ["proving-key-hash"],
    ["provingKeyHash", "proving_key_hash"],
    "BSC proving key hash",
  );
  if (Boolean(proofArtifactHash) !== Boolean(provingKeyHash)) {
    throw new Error(
      "BSC proof artifact hash and proving key hash must be supplied together.",
    );
  }
  const evidenceVerifierMaterial = readSingleRecordAlias(
    evidence,
    [
      "verifierMaterial",
      "verifier_material",
      "verifyingKey",
      "verifying_key",
      "verifierKey",
      "verifier_key",
    ],
    "evidence verifier material",
  );
  const rolloutVerifierMaterial = readSingleRecordAlias(
    rollout,
    [
      "verifierMaterial",
      "verifier_material",
      "verifyingKey",
      "verifying_key",
      "verifierKey",
      "verifier_key",
    ],
    "destinationRollout verifier material",
  );
  const diagnosticVerifierReasons = [
    diagnosticFlagReason(evidence, "evidence"),
    diagnosticFlagReason(rollout, "evidence.destinationRollout"),
    smokeFixtureVerifierReason([
      { record: evidence, pathName: "evidence" },
      {
        record: evidenceVerifierMaterial,
        pathName: "evidence.verifierMaterial",
      },
      { record: rollout, pathName: "evidence.destinationRollout" },
      {
        record: rolloutVerifierMaterial,
        pathName: "evidence.destinationRollout.verifierMaterial",
      },
    ]),
    verifierBn254MaterialReason([
      {
        record: evidenceVerifierMaterial,
        pathName: "evidence.verifierMaterial",
      },
      {
        record: rolloutVerifierMaterial,
        pathName: "evidence.destinationRollout.verifierMaterial",
      },
    ]),
    isKnownDiagnosticBscVerifierKeyHash(verifierKeyHash)
      ? `verifierKeyHash=${verifierKeyHash} is a known diagnostic BSC verifier key hash`
      : "",
  ].filter(Boolean);
  const bindingHash = bscDestinationBindingHash({
    networkId: profile.networkIdHex,
    verifierAddress: addresses.verifier,
    bridgeAddress: addresses.bridge,
    verifierCodeHash,
    verifierKeyHash,
  });
  const bindingKey = bscDestinationBindingKey({
    networkId: profile.networkIdHex,
    verifierAddress: addresses.verifier,
    bridgeAddress: addresses.bridge,
    verifierCodeHash,
    verifierKeyHash,
  });
  const expectedBindingHash = readConsistentString(
    "expected destination binding hash",
    [
      {
        record: options,
        keys: ["expected-destination-binding-hash"],
      },
      {
        record: evidence,
        keys: ["destinationBindingHash", "destination_binding_hash"],
      },
      {
        record: rollout,
        keys: ["destinationBindingHash", "destination_binding_hash"],
      },
    ],
  );
  if (
    expectedBindingHash &&
    normalizeHex32(expectedBindingHash, "expected destination binding hash") !==
      bindingHash
  ) {
    throw new Error(
      "Expected destination binding hash does not match computed BSC binding hash.",
    );
  }
  const expectedBindingKey = readConsistentString(
    "expected destination binding key",
    [
      {
        record: options,
        keys: ["expected-destination-binding-key"],
      },
      {
        record: evidence,
        keys: ["destinationBindingKey", "destination_binding_key"],
      },
      {
        record: rollout,
        keys: ["destinationBindingKey", "destination_binding_key"],
      },
    ],
  );
  if (expectedBindingKey && trim(expectedBindingKey) !== bindingKey) {
    throw new Error(
      "Expected destination binding key does not match computed BSC binding key.",
    );
  }
  const burnRecord = normalizeBurnRecordContract(tairaContract, options);
  const settlementAssetDefinitionId = normalizeCanonicalAssetDefinitionId(
    readConsistentString("--settlement-asset-definition-id", [
      {
        record: options,
        keys: ["settlement-asset-definition-id"],
      },
      {
        record: evidence,
        keys: ["settlementAssetDefinitionId", "settlement_asset_definition_id"],
      },
    ]),
    "--settlement-asset-definition-id",
  );
  const gasLimit = normalizePositiveInteger(
    ownValue(options, "gas-limit"),
    "--gas-limit",
    2_000_000,
  );
  const productionReady = parseBoolean(
    ownValue(options, "production-ready"),
    "--production-ready",
  );
  let postDeployLiveEvidence = null;
  if (productionReady) {
    const repeatedAddressProblems = repeatedByteAddressProblems(
      addresses,
      "BSC route manifest",
    );
    if (repeatedAddressProblems.length > 0) {
      throw new Error(
        `production-ready BSC manifests require non-placeholder contract addresses; ${repeatedAddressProblems.join("; ")}.`,
      );
    }
    if (diagnosticVerifierReasons.length > 0) {
      throw new Error(
        `production-ready BSC manifests require production verifier material; diagnostic material found: ${diagnosticVerifierReasons.join("; ")}.`,
      );
    }
    const confirmed =
      profile.key === "testnet"
        ? ownValue(options, "confirm-testnet") === SCCP_BSC_XOR_ROUTE_ID
        : parseBoolean(
            ownValue(options, "confirm-mainnet"),
            "--confirm-mainnet",
          ) && ownValue(options, "confirm-network") === SCCP_BSC_XOR_ROUTE_ID;
    if (!confirmed) {
      throw new Error(
        profile.key === "testnet"
          ? `production-ready BSC testnet manifests require --confirm-testnet ${SCCP_BSC_XOR_ROUTE_ID}.`
          : `production-ready BSC mainnet manifests require --confirm-mainnet true --confirm-network ${SCCP_BSC_XOR_ROUTE_ID}.`,
      );
    }
    if (
      !parseBoolean(
        ownValue(options, "live-readback-checked"),
        "--live-readback-checked",
      )
    ) {
      throw new Error(
        "production-ready BSC manifests require --live-readback-checked true.",
      );
    }
    if (!proofArtifactHash || !provingKeyHash) {
      throw new Error(
        "production-ready BSC manifests require --proof-artifact-hash and --proving-key-hash.",
      );
    }
    if (
      [verifierCodeHash, verifierKeyHash, bindingHash].includes(
        proofArtifactHash,
      ) ||
      [
        verifierCodeHash,
        verifierKeyHash,
        bindingHash,
        proofArtifactHash,
      ].includes(provingKeyHash)
    ) {
      throw new Error(
        "BSC proof artifact hash, proving key hash, verifier hashes, and destination binding hash must be role-separated.",
      );
    }
    normalizeBscLiveReadback({
      evidence,
      addresses,
      bindingHash,
      verifierCodeHash,
      verifierKeyHash,
      profile,
    });
    postDeployLiveEvidence = normalizePostDeployEvidence(
      evidence,
      postDeployOptions,
      {
        profile,
      },
    );
    const repeatedHashProblems = repeatedByteHashProblems(
      {
        verifierCodeHash,
        verifierKeyHash,
        destinationBindingHash: bindingHash,
        proofArtifactHash,
        provingKeyHash,
        sourceBridgeConfigHash: postDeployLiveEvidence?.sourceBridgeConfigHash,
        sourceEventTransactionId:
          postDeployLiveEvidence?.sourceEventTransactionId,
        routeCanaryEvidenceHash:
          postDeployLiveEvidence?.routeCanaryEvidenceHash,
        routeCanaryTransactionId:
          postDeployLiveEvidence?.routeCanaryTransactionId,
        offlineFullTomlSha256: postDeployLiveEvidence?.offlineFullTomlSha256,
      },
      "BSC route manifest",
    );
    if (repeatedHashProblems.length > 0) {
      throw new Error(
        `production-ready BSC manifests require non-placeholder production hashes: ${repeatedHashProblems.join("; ")}.`,
      );
    }
  } else if (hasPostDeployEvidence(evidence, postDeployOptions)) {
    postDeployLiveEvidence = normalizePostDeployEvidence(
      evidence,
      postDeployOptions,
      {
        requireFullTomlReady: false,
        profile,
      },
    );
  }
  const nativeEvmProverMaterial = await normalizeNativeProverBundleForManifest({
    options,
    profile,
    productionReady,
    verifierKeyHash,
    proofArtifactHash,
    provingKeyHash,
    destinationBindingHash: bindingHash,
  });
  const nativeEvmProverBundle = nativeEvmProverMaterial?.bundle ?? null;
  const nativeEvmProverBundleHash =
    nativeEvmProverMaterial?.nativeEvmProverBundleHash ?? null;
  if (
    nativeEvmProverBundleHash &&
    [
      verifierCodeHash,
      verifierKeyHash,
      bindingHash,
      proofArtifactHash,
      provingKeyHash,
    ].includes(nativeEvmProverBundleHash)
  ) {
    throw new Error(
      "BSC native EVM prover bundle hash, proof artifact hash, proving key hash, verifier hashes, and destination binding hash must be role-separated.",
    );
  }
  return {
    schema: SCCP_BSC_ROUTE_MANIFEST_SCHEMA,
    createdAt,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    explorerUrl: profile.explorerUrl,
    explorerHost: profile.explorerHost,
    counterpartyDomain: SCCP_DOMAIN_BSC,
    counterpartyAccountCodecKey: "evm_hex",
    counterpartyAccountCodec: 2,
    verifierTarget: "EvmContract",
    productionReady,
    ...(diagnosticVerifierReasons.length > 0
      ? {
          diagnosticVerifier: true,
          verifierMaterialWarnings: diagnosticVerifierReasons,
        }
      : {}),
    ...(productionReady
      ? { postDeployReadbackChecked: true }
      : {
          disabledReason:
            diagnosticVerifierReasons.length > 0
              ? "BSC verifier material is diagnostic and must be replaced before production readiness."
              : "Route manifest draft is not production-ready until BSC contract readback and live canary evidence are complete.",
        }),
    bscTokenAddress: addresses.token,
    bscBridgeAddress: addresses.bridge,
    sccpBscSourceBridgeAddress: addresses.sourceBridge,
    bscVerifierAddress: addresses.verifier,
    ...(proofArtifactHash ? { proofArtifactHash } : {}),
    ...(provingKeyHash ? { provingKeyHash } : {}),
    ...(nativeEvmProverBundleHash ? { nativeEvmProverBundleHash } : {}),
    ...(nativeEvmProverBundle ? { nativeEvmProverBundle } : {}),
    destinationRollout: {
      version: 1,
      destinationNetworkId: profile.networkIdHex,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      verifierIdentity: addresses.verifier,
      verifierBackend: BSC_EVM_GROTH16_BACKEND,
      proofFamily: SCCP_PROOF_FAMILY_STARK_FRI,
      verifierCodeHash,
      verifierKeyHash,
      ...(proofArtifactHash ? { proofArtifactHash } : {}),
      ...(provingKeyHash ? { provingKeyHash } : {}),
      ...(nativeEvmProverBundleHash ? { nativeEvmProverBundleHash } : {}),
      ...(nativeEvmProverBundle ? { nativeEvmProverBundle } : {}),
      destinationBridgeAddress: addresses.bridge,
      destinationBindingHash: bindingHash,
      destinationBindingKey: bindingKey,
    },
    destinationBinding: {
      version: 1,
      key: bindingKey,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      bindingHash,
      networkIdHex: profile.networkIdHex,
    },
    tairaXorBurnRecord: {
      settlementAssetDefinitionId,
      contractArtifactB64: burnRecord.contractArtifactB64,
      artifactSha256: burnRecord.artifactSha256,
      codeHash: burnRecord.codeHash,
      vkRef: burnRecord.vkRef,
      gasLimit,
    },
    settlement: {
      submitPath: "/v1/bridge/messages",
      mode: "finalize_inbound",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
    },
    ...(postDeployLiveEvidence ? { postDeployLiveEvidence } : {}),
  };
};

const readJson = async (filePath, label) => {
  const resolved = path.resolve(repoRoot, filePath);
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error(`${resolved} must not be a symbolic link`);
    }
    if (!info.isFile()) {
      throw new Error(`${resolved} must be a regular file`);
    }
    if (info.size > ROUTE_MANIFEST_JSON_INPUT_MAX_BYTES) {
      throw new Error(
        `${resolved} is ${info.size} bytes; maximum allowed is ${ROUTE_MANIFEST_JSON_INPUT_MAX_BYTES} bytes`,
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
    throw new Error(
      `${label} could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
const writeJson = async (filePath, value) => {
  const target = path.resolve(repoRoot, filePath);
  return writeJsonReportFile(target, value);
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  assertNoCliAliasConflicts(options, "BSC deployment evidence", [
    "evidence",
    "deployment-evidence",
  ]);
  const evidencePath = options.evidence || options["deployment-evidence"];
  const tairaContractPath = options["taira-contract"];
  if (!evidencePath) {
    throw new Error("--evidence is required.");
  }
  if (!tairaContractPath) {
    throw new Error("--taira-contract is required.");
  }
  const manifest = await buildBscRouteManifestDraft({
    options,
    evidence: await readJson(evidencePath, "BSC deployment evidence"),
    tairaContract: await readJson(
      tairaContractPath,
      "TAIRA burn-record contract",
    ),
    offlineFullTomlEvidence: options["offline-full-toml-evidence"]
      ? await readJson(
          options["offline-full-toml-evidence"],
          "BSC offline full TOML evidence",
        )
      : null,
  });
  const out = await writeJson(
    options.out || defaultBscRouteManifestOut(manifest.bscNetwork),
    manifest,
  );
  const confirmationHint =
    manifest.bscNetwork === "mainnet"
      ? `--confirm-mainnet true --confirm-network ${SCCP_BSC_XOR_ROUTE_ID}`
      : `--confirm-testnet ${SCCP_BSC_XOR_ROUTE_ID}`;
  console.log(
    JSON.stringify(
      {
        wrote: out,
        routeId: manifest.routeId,
        assetKey: manifest.assetKey,
        productionReady: manifest.productionReady,
        bscBridgeAddress: manifest.bscBridgeAddress,
        bscTokenAddress: manifest.bscTokenAddress,
        bscVerifierAddress: manifest.bscVerifierAddress,
        destinationBindingHash:
          manifest.destinationRollout.destinationBindingHash,
        settlementAssetDefinitionId:
          manifest.tairaXorBurnRecord.settlementAssetDefinitionId,
        nextStep: manifest.productionReady
          ? "Publish this manifest only after TAIRA operators activate the governed SCCP route config."
          : `Run BSC contract readback and live canary evidence, then rerun with --production-ready true --live-readback-checked true ${confirmationHint}.`,
      },
      null,
      2,
    ),
  );
};

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

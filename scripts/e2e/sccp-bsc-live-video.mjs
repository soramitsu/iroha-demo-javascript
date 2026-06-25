#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { _electron as electron } from "playwright";
import {
  BSC_NETWORK_PROFILES,
  resolveBscNetworkProfile,
} from "./sccp-bsc-route-preflight.mjs";
import { runBscSccpLiveSmokeReadiness } from "./sccp-bsc-live-smoke-readiness.mjs";
import {
  assertSafeJsonReportOutputDir,
  writeJsonReportFile,
} from "./sccp-bsc-report-output.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mainEntry = path.join(repoRoot, "dist", "main", "index.cjs");
const defaultOutputRoot = path.join(repoRoot, "output/sccp-bsc-live-proof");
const MIN_VIDEO_ARTIFACT_BYTES = 64 * 1024;
const MIN_SCREENSHOT_ARTIFACT_BYTES = 512;
export const MAX_VIDEO_ARTIFACT_BYTES = 512 * 1024 * 1024;
export const MAX_SCREENSHOT_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MIN_EXPLORER_CONTENT_CHARS = 64;
const MIN_VIDEO_DURATION_MS = 30_000;
const MAX_VIDEO_DURATION_MS = 7_200_000;
const ROUTE_ID = "taira_bsc_xor";
const ASSET_KEY = "xor";
const DEFAULT_BSC_NETWORK = "testnet";

const BSC_LIVE_VIDEO_CLI_OPTIONS = new Set([
  "output-dir",
  "duration-ms",
  "bsc-network",
  "skip-preflight",
  "allow-incomplete",
  "torii-url",
  "manifest-file",
  "bsc-rpc-url",
  "allow-local-rpc",
  "check-bsc-contracts",
  "peer-audit-report",
  "walletconnect-project-id",
  "destination-prover-module-url",
  "source-prover-module-url",
  "auto-explorer",
  "no-auto-explorer",
]);

export const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (!BSC_LIVE_VIDEO_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC live-video options.`,
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
  console.log(`Usage: node scripts/e2e/sccp-bsc-live-video.mjs [options]

Record a BSC SCCP UI proof flow in Electron.

Options:
  --output-dir DIR
  --duration-ms MS
  --bsc-network testnet|mainnet
  --skip-preflight            Debug only; requires --allow-incomplete
  --allow-incomplete
  --torii-url URL
  --manifest-file PATH
  --bsc-rpc-url URL
  --allow-local-rpc
  --check-bsc-contracts true|false
  --peer-audit-report PATH
  --walletconnect-project-id ID
  --destination-prover-module-url URL
  --source-prover-module-url URL
  --auto-explorer
  --no-auto-explorer
  --help, -h                   Show this help without launching Electron

Environment:
  SCCP_BSC_VIDEO_OUTPUT_DIR
  SCCP_BSC_VIDEO_DURATION_MS
  SCCP_BSC_VIDEO_SKIP_PREFLIGHT
  SCCP_BSC_VIDEO_AUTO_EXPLORER
  SCCP_BSC_VIDEO_ALLOW_INCOMPLETE
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_TAIRA_TORII_URL
  SCCP_ROUTE_MANIFEST_FILE
  SCCP_BSC_RPC_URL
  BSC_RPC_URL`);
};

export const readDurationMs = (value) => {
  const parsed = Number(String(value ?? "").trim() || "600000");
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_VIDEO_DURATION_MS ||
    parsed > MAX_VIDEO_DURATION_MS
  ) {
    throw new Error("--duration-ms must be between 30000 and 7200000.");
  }
  return parsed;
};

const stamp = () => new Date().toISOString().replace(/[:.]/gu, "-");
const LIVE_VIDEO_RUN_LABEL_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;

const assertSafeLiveVideoRunLabel = (value) => {
  const label = String(value ?? "").trim();
  if (
    !LIVE_VIDEO_RUN_LABEL_PATTERN.test(label) ||
    label === "." ||
    label === ".." ||
    label.includes("/") ||
    label.includes("\\")
  ) {
    throw new Error(`Unsafe SCCP BSC live proof output run label: ${value}`);
  }
  return label;
};

export const prepareSccpBscLiveVideoRunDir = async (
  outputDir,
  { runLabel = stamp() } = {},
) => {
  const outputRoot = path.resolve(
    repoRoot,
    String(outputDir || defaultOutputRoot),
  );
  await mkdir(outputRoot, { recursive: true });
  await assertSafeJsonReportOutputDir(outputRoot);

  const safeRunLabel = assertSafeLiveVideoRunLabel(runLabel);
  const runDir = path.join(outputRoot, safeRunLabel);
  try {
    await mkdir(runDir);
  } catch (error) {
    if (error?.code === "EEXIST") {
      await assertSafeJsonReportOutputDir(runDir);
      throw new Error(
        `SCCP BSC live proof output run directory already exists: ${runDir}`,
      );
    }
    throw error;
  }
  await assertSafeJsonReportOutputDir(runDir);
  return { outputRoot, runDir };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value) => String(value ?? "").trim();
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
const ownArrayEntries = (value) => {
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
    const entry = Object.getOwnPropertyDescriptor(value, key);
    if (entry && Object.prototype.hasOwnProperty.call(entry, "value")) {
      entries.push([index, entry.value]);
    }
  }
  entries.sort(([left], [right]) => left - right);
  return entries;
};
const ownArrayValues = (value) =>
  ownArrayEntries(value).map(([, entry]) => entry);
const ownRecordEntries = (value) =>
  isRecord(value)
    ? Object.keys(value)
        .map((key) => [key, ownValue(value, key)])
        .filter(([, entry]) => entry !== undefined)
    : [];
const arrayRecordShapeProblems = (value, label) => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`${label}:not-array`];
  }
  const problems = [];
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
      problems.push(`${label}[${index}]:not-data-property`);
      continue;
    }
    if (!isRecord(descriptor.value)) {
      problems.push(`${label}[${index}]:not-object`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label}[${index}]:missing`);
    }
  }
  return problems;
};

const SECRET_LOG_ASSIGNMENT_PATTERN =
  /(^|[^A-Za-z0-9_-])((?:"|')?(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)(?:"|')?\s*[:=]\s*)(?!\[redacted)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu;
const SECRET_LOG_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/giu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/giu;
const BIP39_WORD_COUNTS = Object.freeze([24, 21, 18, 15, 12]);
const MAX_LOG_TEXT_CHARS = 2_000;

const redactBip39MnemonicWindows = (text) => {
  const tokens = [...String(text).matchAll(/[a-z]+/giu)].map((match) => ({
    word: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const ranges = [];
  for (let index = 0; index < tokens.length; index += 1) {
    for (const wordCount of BIP39_WORD_COUNTS) {
      const endIndex = index + wordCount;
      if (endIndex > tokens.length) {
        continue;
      }
      const phrase = tokens
        .slice(index, endIndex)
        .map((token) => token.word)
        .join(" ");
      if (validateMnemonic(phrase, wordlist)) {
        ranges.push({
          start: tokens[index].start,
          end: tokens[endIndex - 1].end,
        });
        index = endIndex - 1;
        break;
      }
    }
  }
  if (ranges.length === 0) {
    return text;
  }
  let output = "";
  let cursor = 0;
  for (const range of ranges) {
    output += text.slice(cursor, range.start);
    output += "[redacted recovery phrase]";
    cursor = range.end;
  }
  return output + text.slice(cursor);
};

export const sanitizeSccpBscLiveVideoLogText = (value) => {
  const normalized = String(value ?? "")
    .replace(PRIVATE_KEY_PEM_PATTERN, "[redacted private key]")
    .replace(/\s+/gu, " ")
    .trim();
  const redacted = redactBip39MnemonicWindows(normalized)
    .replace(SECRET_LOG_ASSIGNMENT_PATTERN, "$1$2[redacted]")
    .replace(SECRET_LOG_VALUE_PATTERN, "[redacted token]");
  return redacted.length > MAX_LOG_TEXT_CHARS
    ? `${redacted.slice(0, MAX_LOG_TEXT_CHARS)}...[truncated]`
    : redacted;
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

export const REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS = Object.freeze([
  "tairaSourceTx",
  "bscFinalizeTx",
  "bscBurnTx",
  "tairaSettlementTx",
]);
export const SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES =
  "Review the captured video and screenshots before publishing proof artifacts.";
export const SCCP_BSC_VIDEO_INCOMPLETE_OPERATOR_NOTES =
  "Proof bundle is incomplete; review missingEvidence before publishing.";
export const REQUIRED_SCCP_BSC_VIDEO_SMOKE_READINESS_CHECK_IDS = Object.freeze([
  "route-preflight",
  "peer-config-audit",
  "walletconnect-project-id",
  "runtime-prover-config",
  "destination-prover-module",
  "destination-prover-manifest",
  "source-prover-module",
  "source-prover-manifest",
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
const PUBLIC_DEPLOYMENT_ROLE_SEPARATED_HASH_FIELDS = Object.freeze([
  "verifierCodeHash",
  "verifierKeyHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
]);

const PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS = Object.freeze([
  "sourceBridgeConfigHash",
  "sourceEventTransactionId",
  "sourceEventExplorerUrl",
  "routeCanaryEvidenceHash",
  "routeCanaryTransactionId",
  "routeCanaryExplorerUrl",
  "offlineFullTomlSha256",
]);

const NON_ZERO_SHA256_PATTERN = /^(?!0{64}$)[0-9a-f]{64}$/u;
const NON_ZERO_HEX32_PATTERN = /^0x(?!0{64}$)[0-9a-f]{64}$/u;
const NON_ZERO_EVM_ADDRESS_PATTERN = /^0x(?!0{40}$)[0-9a-f]{40}$/u;
const BASE58_ASSET_DEFINITION_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{16,80}$/u;
const PEER_AUDIT_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 480;
const MAX_SCREENSHOT_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
const MIN_SCREENSHOT_IMAGE_UNIQUE_BYTES = 8;
const MAX_SCREENSHOT_DOMINANT_PIXEL_BYTE_FRACTION = 0.995;
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

const normalizeHexText = (value) => normalizeText(value).toLowerCase();
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES = new Set([
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
]);
const BSC_VERIFIER_KEY_HASH_ALIAS_KEYS = new Set([
  "verifierKeyHash",
  "verifier_key_hash",
  "verifierKeyHashHex",
  "verifier_key_hash_hex",
  "bridgeVerifierKeyHash",
  "bridge_verifier_key_hash",
  "configuredVerifierKeyHash",
  "configured_verifier_key_hash",
  "vkHash",
  "vk_hash",
]);

const carriesKnownDiagnosticBscVerifierKeyHash = (
  value,
  seen = new WeakSet(),
) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return ownArrayValues(value).some((entry) =>
      carriesKnownDiagnosticBscVerifierKeyHash(entry, seen),
    );
  }
  if (!isRecord(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  for (const [key, entry] of ownRecordEntries(value)) {
    if (
      BSC_VERIFIER_KEY_HASH_ALIAS_KEYS.has(key) &&
      typeof entry === "string" &&
      DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(normalizeHexText(entry))
    ) {
      return true;
    }
    if (carriesKnownDiagnosticBscVerifierKeyHash(entry, seen)) {
      return true;
    }
  }
  return false;
};

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
  const raw = normalizeText(value);
  if (!raw || raw.includes("\0")) {
    return false;
  }
  if (
    path.isAbsolute(raw) ||
    path.posix.isAbsolute(raw) ||
    path.win32.isAbsolute(raw) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(raw) ||
    hasDecodedParentSegment(raw)
  ) {
    return false;
  }
  const normalized = raw.replace(/\\/gu, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return false;
  }
  return extensionPattern.test(normalized);
};

const normalizedProofArtifactRelativePath = (value) =>
  normalizeText(value).replace(/\\/gu, "/");

const publicProofOutputDir = (value) => {
  const raw = normalizeText(value);
  if (!raw || raw.includes("\0")) {
    return "";
  }
  const resolved = path.resolve(raw);
  const relativeToRepo = path.relative(repoRoot, resolved).replace(/\\/gu, "/");
  if (
    relativeToRepo &&
    relativeToRepo !== "." &&
    !relativeToRepo.startsWith("../") &&
    relativeToRepo !== ".." &&
    !path.isAbsolute(relativeToRepo) &&
    /^[A-Za-z0-9._/-]{1,240}$/u.test(relativeToRepo) &&
    !hasDecodedParentSegment(relativeToRepo)
  ) {
    return relativeToRepo;
  }
  return "external-proof-output";
};

const PUBLIC_PROOF_FILE_STRING_FIELDS = Object.freeze([
  "kind",
  "label",
  "href",
  "finalHref",
  "transactionHash",
  "relativePath",
  "sha256",
  "mediaType",
  "status",
  "error",
  "fileVerificationError",
]);
const PUBLIC_PROOF_FILE_NUMBER_FIELDS = Object.freeze([
  "contentLength",
  "sizeBytes",
]);
const PUBLIC_PROOF_FILE_BOOLEAN_FIELDS = Object.freeze(["fileVerified"]);

const publicProofFileString = (entry, key, options) => {
  const value = ownValue(entry, key);
  if (typeof value !== "string") {
    return undefined;
  }
  const raw = normalizeText(value);
  if (!raw) {
    return undefined;
  }
  if (key === "href" || key === "finalHref") {
    const canonical = canonicalExplorerTransactionHrefForSlot(
      normalizeText(ownValue(entry, "kind")),
      raw,
      options,
    );
    return canonical || sanitizeSccpBscLiveVideoLogText(raw);
  }
  return sanitizeSccpBscLiveVideoLogText(raw);
};

const publicProofFileEntry = (entry, options = {}) => {
  if (!isRecord(entry)) {
    return null;
  }
  const publicEntry = {};
  for (const key of PUBLIC_PROOF_FILE_STRING_FIELDS) {
    const value = publicProofFileString(entry, key, options);
    if (value !== undefined) {
      publicEntry[key] = value;
    }
  }
  for (const key of PUBLIC_PROOF_FILE_NUMBER_FIELDS) {
    const value = ownValue(entry, key);
    if (Number.isSafeInteger(value)) {
      publicEntry[key] = value;
    }
  }
  for (const key of PUBLIC_PROOF_FILE_BOOLEAN_FIELDS) {
    const value = ownValue(entry, key);
    if (typeof value === "boolean") {
      publicEntry[key] = value;
    }
  }
  return publicEntry;
};

const publicProofFileEntries = (entries, options = {}) =>
  ownArrayValues(entries)
    .map((entry) => publicProofFileEntry(entry, options))
    .filter((entry) => entry !== null);

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

const resolveBscNetworkProfileOrDefault = (value) =>
  resolveBscNetworkProfile(value || DEFAULT_BSC_NETWORK);

const resolveBscProfileFromEvidence = (...values) => {
  for (const value of values.flat()) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) {
      continue;
    }
    for (const profile of Object.values(BSC_NETWORK_PROFILES)) {
      if (
        normalized === profile.key ||
        normalized === profile.chain ||
        normalized === profile.label.toLowerCase() ||
        normalized === profile.chainIdHex ||
        normalized === profile.networkIdHex ||
        normalized === profile.explorerHost
      ) {
        return profile;
      }
    }
    try {
      return resolveBscNetworkProfile(normalized);
    } catch (_error) {
      // Continue checking lower-confidence fields.
    }
  }
  return null;
};

const readBscProfileFromReadiness = (readiness, fallback = "") => {
  const route = ownValue(readiness, "route");
  const routeBsc = ownValue(route, "bsc");
  const routeDeployment = ownValue(route, "deployment");
  return (
    resolveBscProfileFromEvidence(
      fallback,
      readPublicBscProfileString(routeBsc, "network"),
      readPublicBscProfileString(routeBsc, "chain"),
      readPublicBscProfileString(routeBsc, "chainIdHex"),
      readPublicBscProfileString(routeBsc, "networkIdHex"),
      readPublicBscProfileString(routeBsc, "explorerUrl"),
      readPublicBscProfileString(routeBsc, "explorerHost"),
      readPublicAliasString(routeDeployment, "networkIdHex"),
    ) ?? resolveBscNetworkProfileOrDefault(fallback || DEFAULT_BSC_NETWORK)
  );
};

const publicBscRouteBinding = (route) => {
  if (!isRecord(route)) {
    return null;
  }
  const routeBsc = ownValue(route, "bsc");
  const routeDeployment = ownValue(route, "deployment");
  const profile = resolveBscProfileFromEvidence(
    readPublicBscProfileString(routeBsc, "network"),
    readPublicBscProfileString(routeBsc, "chain"),
    readPublicBscProfileString(routeBsc, "chainIdHex"),
    readPublicBscProfileString(routeBsc, "networkIdHex"),
    readPublicBscProfileString(routeBsc, "explorerUrl"),
    readPublicBscProfileString(routeBsc, "explorerHost"),
    readPublicAliasString(routeDeployment, "networkIdHex"),
  );
  if (!profile && !isRecord(routeBsc)) {
    return null;
  }
  return {
    network:
      readPublicBscProfileString(routeBsc, "network") || profile?.key || null,
    chain:
      readPublicBscProfileString(routeBsc, "chain") || profile?.chain || null,
    chainIdHex:
      normalizeHexText(readPublicBscProfileString(routeBsc, "chainIdHex")) ||
      profile?.chainIdHex ||
      null,
    networkIdHex:
      normalizeHexText(readPublicBscProfileString(routeBsc, "networkIdHex")) ||
      normalizeHexText(
        readPublicAliasString(routeDeployment, "networkIdHex"),
      ) ||
      profile?.networkIdHex ||
      null,
    explorerUrl:
      readPublicBscProfileString(routeBsc, "explorerUrl") ||
      profile?.explorerUrl ||
      null,
    explorerHost:
      readPublicBscProfileString(routeBsc, "explorerHost") ||
      profile?.explorerHost ||
      null,
  };
};

const bscExplorerTransactionPattern = (profile) =>
  new RegExp(
    `^https://${profile.explorerHost.replace(
      /\./gu,
      "\\.",
    )}/tx/0x[0-9a-f]{64}$`,
    "u",
  );

const readPublicString = (record, key) => {
  const value = ownValue(record, key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const parseReportTimestampMs = (value) => {
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

const POINT_REPORT_TIMESTAMP_KEYS = Object.freeze([
  "checkedAt",
  "generatedAt",
  "generatedAtMs",
  "recordedAt",
  "capturedAt",
]);

const presentReportTimestampFields = (report) =>
  POINT_REPORT_TIMESTAMP_KEYS.filter((key) => hasOwn(report, key))
    .map((key) => ({
      key,
      value: ownValue(report, key),
      parsed: parseReportTimestampMs(ownValue(report, key)),
    }))
    .filter(({ value }) => value !== null && value !== undefined);

const reportTimestampAliasProblems = (report, label) => {
  if (!isRecord(report)) {
    return [];
  }
  const pointFields = presentReportTimestampFields(report);
  if (pointFields.length < 2 || pointFields[0]?.parsed === null) {
    return [];
  }
  const invalid = pointFields.slice(1).filter(({ parsed }) => parsed === null);
  const problems = invalid.map(({ key }) => `${label}.${key}.invalid`);
  const parsedPointFields = pointFields.filter(({ parsed }) => parsed !== null);
  const uniqueTimestamps = new Set(
    parsedPointFields.map(({ parsed }) => parsed),
  );
  if (uniqueTimestamps.size > 1) {
    problems.push(
      `${label}.pointTimestampFieldsDisagree.${parsedPointFields
        .map(({ key }) => key)
        .join(".")}`,
    );
  }
  return problems;
};

const fieldIsPresent = (record, key) => {
  if (!hasOwn(record, key)) {
    return false;
  }
  const value = ownValue(record, key);
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  return value !== undefined && value !== null;
};
const duplicateAliasProblem = (record, label, ...keys) =>
  keys.filter((key) => fieldIsPresent(record, key)).length > 1
    ? `readinessAlias.${label}`
    : null;
const collectDuplicateAliasProblems = (record, prefix, groups) =>
  groups
    .map(([label, keys]) =>
      duplicateAliasProblem(record, `${prefix}.${label}`, ...keys),
    )
    .filter(Boolean);
const collectForbiddenAliasProblems = (record, prefix, groups) =>
  groups.flatMap(([label, keys]) =>
    keys
      .filter((key) => fieldIsPresent(record, key))
      .map((key) => `readinessAlias.${prefix}.${label}.forbidden.${key}`),
  );

const ROUTE_IDENTITY_ALIAS_GROUPS = Object.freeze([
  ["routeId", ["routeId", "route_id"]],
  ["assetKey", ["assetKey", "asset_key"]],
]);
const BSC_PROFILE_ALIAS_GROUPS = Object.freeze([
  ["network", ["network", "bscNetwork", "bsc_network"]],
  ["chain", ["chain", "bscChain", "bsc_chain"]],
  [
    "chainIdHex",
    ["chainIdHex", "chain_id_hex", "bscChainIdHex", "bsc_chain_id_hex"],
  ],
  [
    "networkIdHex",
    ["networkIdHex", "network_id_hex", "bscNetworkIdHex", "bsc_network_id_hex"],
  ],
  [
    "explorerUrl",
    ["explorerUrl", "explorer_url", "bscExplorerUrl", "bsc_explorer_url"],
  ],
  [
    "explorerHost",
    ["explorerHost", "explorer_host", "bscExplorerHost", "bsc_explorer_host"],
  ],
]);
const DEPLOYMENT_ALIAS_GROUPS = Object.freeze([
  [
    "bridgeAddress",
    [
      "bridgeAddress",
      "bridge_address",
      "bscBridgeAddress",
      "bsc_bridge_address",
      "evmBridgeAddress",
      "evm_bridge_address",
    ],
  ],
  [
    "tokenAddress",
    [
      "tokenAddress",
      "token_address",
      "bscTokenAddress",
      "bsc_token_address",
      "evmTokenAddress",
      "evm_token_address",
    ],
  ],
  [
    "sourceBridgeAddress",
    [
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
    ],
  ],
  [
    "verifierAddress",
    [
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
    ],
  ],
  ["networkIdHex", ["networkIdHex", "network_id_hex"]],
  [
    "verifierCodeHash",
    [
      "verifierCodeHash",
      "verifier_code_hash",
      "verifierCodeHashHex",
      "verifier_code_hash_hex",
    ],
  ],
  [
    "verifierKeyHash",
    [
      "verifierKeyHash",
      "verifier_key_hash",
      "verifierKeyHashHex",
      "verifier_key_hash_hex",
    ],
  ],
  [
    "proofArtifactHash",
    [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "circuitArtifactHash",
      "circuit_artifact_hash",
    ],
  ],
  ["provingKeyHash", ["provingKeyHash", "proving_key_hash"]],
  [
    "nativeEvmProverBundleHash",
    ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
  ],
  [
    "destinationBindingHash",
    ["destinationBindingHash", "destination_binding_hash"],
  ],
  [
    "settlementAssetDefinitionId",
    ["settlementAssetDefinitionId", "settlement_asset_definition_id"],
  ],
]);
const FORBIDDEN_BSC_DEPLOYMENT_ALIAS_GROUPS = Object.freeze([
  [
    "sourceBridgeAddress",
    [
      "sccpTronSourceBridgeAddress",
      "sccp_tron_source_bridge_address",
      "tronSourceBridgeAddress",
      "tron_source_bridge_address",
    ],
  ],
  [
    "verifierAddress",
    [
      "sccpTronDestinationVerifierAddress",
      "sccp_tron_destination_verifier_address",
      "tronVerifierAddress",
      "tron_verifier_address",
    ],
  ],
]);
const POST_DEPLOY_ALIAS_GROUPS = Object.freeze([
  [
    "fullTomlReady",
    [
      "fullTomlReady",
      "full_toml_ready",
      "postDeployFullTomlReady",
      "post_deploy_full_toml_ready",
    ],
  ],
  [
    "sourceBridgeConfigHash",
    [
      "sourceBridgeConfigHash",
      "source_bridge_config_hash",
      "postDeploySourceBridgeConfigHash",
      "post_deploy_source_bridge_config_hash",
    ],
  ],
  [
    "sourceEventTransactionId",
    [
      "sourceEventTransactionId",
      "source_event_transaction_id",
      "postDeploySourceEventTransactionId",
      "post_deploy_source_event_transaction_id",
    ],
  ],
  [
    "sourceEventExplorerUrl",
    [
      "sourceEventExplorerUrl",
      "source_event_explorer_url",
      "sourceEventTransactionUrl",
      "source_event_transaction_url",
      "postDeploySourceEventExplorerUrl",
      "post_deploy_source_event_explorer_url",
      "postDeploySourceEventTransactionUrl",
      "post_deploy_source_event_transaction_url",
    ],
  ],
  [
    "routeCanaryEvidenceHash",
    [
      "routeCanaryEvidenceHash",
      "route_canary_evidence_hash",
      "postDeployRouteCanaryEvidenceHash",
      "post_deploy_route_canary_evidence_hash",
    ],
  ],
  [
    "routeCanaryTransactionId",
    [
      "routeCanaryTransactionId",
      "route_canary_transaction_id",
      "postDeployRouteCanaryTransactionId",
      "post_deploy_route_canary_transaction_id",
    ],
  ],
  [
    "routeCanaryExplorerUrl",
    [
      "routeCanaryExplorerUrl",
      "route_canary_explorer_url",
      "routeCanaryTransactionUrl",
      "route_canary_transaction_url",
      "postDeployRouteCanaryExplorerUrl",
      "post_deploy_route_canary_explorer_url",
      "postDeployRouteCanaryTransactionUrl",
      "post_deploy_route_canary_transaction_url",
    ],
  ],
  [
    "offlineFullTomlSha256",
    [
      "offlineFullTomlSha256",
      "offline_full_toml_sha256",
      "postDeployOfflineFullTomlSha256",
      "post_deploy_offline_full_toml_sha256",
    ],
  ],
]);

const collectSccpBscVideoReadinessAliasProblems = (readiness) => {
  const problems = [];
  const route = ownValue(readiness, "route");
  const routeBsc = ownValue(route, "bsc");
  const routeDeployment = ownValue(route, "deployment");
  const routePostDeploy = ownValue(route, "postDeployLiveEvidence");
  const peerAudit = ownValue(readiness, "peerAudit");
  const checks = ownValue(readiness, "checks");
  problems.push(
    ...collectDuplicateAliasProblems(
      route,
      "route",
      ROUTE_IDENTITY_ALIAS_GROUPS,
    ),
    ...collectDuplicateAliasProblems(
      routeBsc,
      "route.bsc",
      BSC_PROFILE_ALIAS_GROUPS,
    ),
    ...collectDuplicateAliasProblems(
      routeDeployment,
      "route.deployment",
      DEPLOYMENT_ALIAS_GROUPS,
    ),
    ...collectForbiddenAliasProblems(
      routeDeployment,
      "route.deployment",
      FORBIDDEN_BSC_DEPLOYMENT_ALIAS_GROUPS,
    ),
    ...collectDuplicateAliasProblems(
      routePostDeploy,
      "route.postDeployLiveEvidence",
      POST_DEPLOY_ALIAS_GROUPS,
    ),
    ...collectDuplicateAliasProblems(
      peerAudit,
      "peerAudit",
      ROUTE_IDENTITY_ALIAS_GROUPS,
    ),
  );
  if (Array.isArray(checks)) {
    ownArrayValues(checks).forEach((entry, index) => {
      const problem = duplicateAliasProblem(
        entry,
        `checks.${readPublicString(entry, "id") || index}.id`,
        "id",
        "checkId",
        "check_id",
      );
      if (problem) {
        problems.push(problem);
      }
    });
  }
  return problems;
};
const publicCheckSummaries = (checks) =>
  Array.isArray(checks)
    ? ownArrayValues(checks)
        .filter((entry) => isRecord(entry))
        .map((entry) => ({
          id: readPublicString(entry, "id"),
          ok: ownValue(entry, "ok") === true,
          status: readPublicString(entry, "status"),
          message: readPublicString(entry, "message"),
        }))
        .filter((entry) => entry.id)
    : [];
const reportCheckPassed = (checks, id) =>
  Array.isArray(checks) &&
  ownArrayValues(checks).some(
    (entry) =>
      isRecord(entry) &&
      readPublicString(entry, "id") === id &&
      (ownValue(entry, "ok") === true ||
        readPublicString(entry, "status")?.toLowerCase() === "pass"),
  );
const reportCheckIntegrityProblems = (checks, label) => {
  if (!Array.isArray(checks)) {
    return [];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of ownArrayValues(checks).entries()) {
    if (!isRecord(entry)) {
      problems.push(`${label} check ${index} is not an object`);
      continue;
    }
    const id = readPublicString(entry, "id");
    const checkLabel = id || `index ${index}`;
    if (!id) {
      problems.push(`${label} check ${index} id is missing`);
    } else if (seen.has(id)) {
      problems.push(`${label} check id ${id} is duplicated`);
    } else {
      seen.add(id);
    }
    const ok = ownValue(entry, "ok");
    const hasOk = typeof ok === "boolean";
    const status = readPublicString(entry, "status")?.toLowerCase() ?? "";
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `${label} check ${checkLabel} has no machine-readable pass/fail state`,
      );
    }
    if (hasOk && hasStatus && ok !== (status === "pass")) {
      problems.push(`${label} check ${checkLabel} has contradictory ok/status`);
    }
  }
  return problems;
};

const BSC_PROFILE_ALIAS_KEYS = Object.freeze(
  Object.fromEntries(BSC_PROFILE_ALIAS_GROUPS),
);
const DEPLOYMENT_ALIAS_KEYS = Object.freeze(
  Object.fromEntries(DEPLOYMENT_ALIAS_GROUPS),
);
const POST_DEPLOY_ALIAS_KEYS = Object.freeze(
  Object.fromEntries(POST_DEPLOY_ALIAS_GROUPS),
);
const readPublicStringAlias = (record, aliasKeys, key) => {
  for (const alias of aliasKeys[key] ?? [key]) {
    const value = readPublicString(record, alias);
    if (value) {
      return value;
    }
  }
  return null;
};
const readPublicAliasString = (record, key) =>
  readPublicStringAlias(record, DEPLOYMENT_ALIAS_KEYS, key);
const readPublicBscProfileString = (record, key) =>
  readPublicStringAlias(record, BSC_PROFILE_ALIAS_KEYS, key);
const readPublicPostDeployString = (record, key) =>
  readPublicStringAlias(record, POST_DEPLOY_ALIAS_KEYS, key);
const readPublicPostDeployBoolean = (record, key) =>
  (POST_DEPLOY_ALIAS_KEYS[key] ?? [key]).some(
    (alias) => hasOwn(record, alias) && ownValue(record, alias) === true,
  );

const publicDeployment = (deployment) =>
  isRecord(deployment)
    ? Object.fromEntries(
        PUBLIC_DEPLOYMENT_FIELDS.map((key) => [
          key,
          readPublicAliasString(deployment, key),
        ]),
      )
    : null;

const publicDeploymentHashRoleCollisionProblems = (deployment) => {
  const seen = new Map();
  const problems = [];
  for (const key of PUBLIC_DEPLOYMENT_ROLE_SEPARATED_HASH_FIELDS) {
    const value = normalizeHexText(ownValue(deployment, key));
    if (!NON_ZERO_HEX32_PATTERN.test(value)) {
      continue;
    }
    const previous = seen.get(value);
    if (previous) {
      problems.push(`routeDeployment.${key}.roleCollision.${previous}`);
    } else {
      seen.set(value, key);
    }
  }
  return problems;
};

const publicPostDeployLiveEvidence = (evidence) =>
  isRecord(evidence)
    ? {
        fullTomlReady: readPublicPostDeployBoolean(evidence, "fullTomlReady"),
        ...Object.fromEntries(
          PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS.map((key) => [
            key,
            readPublicPostDeployString(evidence, key),
          ]),
        ),
      }
    : null;

const artifactPathInsideRunDir = (artifactPath, runDir) => {
  const resolvedRunDir = path.resolve(runDir);
  const resolvedArtifact = path.resolve(artifactPath);
  const relativePath = path.relative(resolvedRunDir, resolvedArtifact);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return relativePath;
};

const assertNewProofArtifactDestination = async (artifactPath, runDir) => {
  const relativePath = artifactPathInsideRunDir(artifactPath, runDir);
  if (!relativePath) {
    throw new Error(
      "Proof artifact destination is outside the proof output directory.",
    );
  }
  try {
    const info = await lstat(artifactPath);
    if (info.isSymbolicLink()) {
      throw new Error(
        "Proof artifact destination must not be a symbolic link.",
      );
    }
    throw new Error("Proof artifact destination must not already exist.");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
};

const maxProofArtifactBytesForMedia = (expectedMediaType) => {
  if (expectedMediaType === "video/webm") {
    return MAX_VIDEO_ARTIFACT_BYTES;
  }
  if (expectedMediaType === "image/png") {
    return MAX_SCREENSHOT_ARTIFACT_BYTES;
  }
  return Math.max(MAX_VIDEO_ARTIFACT_BYTES, MAX_SCREENSHOT_ARTIFACT_BYTES);
};

const minProofArtifactBytesForMedia = (expectedMediaType) => {
  if (expectedMediaType === "video/webm") {
    return MIN_VIDEO_ARTIFACT_BYTES;
  }
  if (expectedMediaType === "image/png") {
    return MIN_SCREENSHOT_ARTIFACT_BYTES;
  }
  return 1;
};

const collectProofFileEvidence = async (
  artifactPath,
  runDir,
  expectedMediaType = "",
) => {
  const relativePath = artifactPathInsideRunDir(artifactPath, runDir);
  if (!relativePath) {
    return {
      path: artifactPath,
      fileVerified: false,
      error: "Proof artifact path is outside the proof output directory.",
    };
  }
  try {
    const info = await lstat(artifactPath);
    if (info.isSymbolicLink()) {
      return {
        path: artifactPath,
        relativePath,
        fileVerified: false,
        error: "Proof artifact path must not be a symbolic link.",
      };
    }
    if (!info.isFile()) {
      return {
        path: artifactPath,
        relativePath,
        fileVerified: false,
        error: "Proof artifact path must be a regular file.",
      };
    }
    const maxBytes = maxProofArtifactBytesForMedia(expectedMediaType);
    const minBytes = minProofArtifactBytesForMedia(expectedMediaType);
    if (info.size < minBytes) {
      return {
        path: artifactPath,
        relativePath,
        sizeBytes: info.size,
        fileVerified: false,
        error: `Proof artifact file is ${info.size} bytes; minimum required is ${minBytes} bytes.`,
      };
    }
    if (info.size > maxBytes) {
      return {
        path: artifactPath,
        relativePath,
        sizeBytes: info.size,
        fileVerified: false,
        error: `Proof artifact file is ${info.size} bytes; maximum allowed is ${maxBytes} bytes.`,
      };
    }
    const [realRunDir, realArtifactPath] = await Promise.all([
      realpath(runDir),
      realpath(artifactPath),
    ]);
    const realRelativePath = path.relative(realRunDir, realArtifactPath);
    if (
      !realRelativePath ||
      realRelativePath.startsWith("..") ||
      path.isAbsolute(realRelativePath)
    ) {
      return {
        path: artifactPath,
        relativePath,
        fileVerified: false,
        error:
          "Proof artifact path resolves outside the proof output directory.",
      };
    }
    const bytes = await readFile(artifactPath);
    const mediaType = detectProofArtifactMediaType(bytes);
    const screenshotDimensionError =
      expectedMediaType === "image/png" && mediaType === "image/png"
        ? pngScreenshotDimensionError(bytes)
        : "";
    const mediaTypeMatches =
      (!expectedMediaType || mediaType === expectedMediaType) &&
      !screenshotDimensionError;
    return {
      path: artifactPath,
      relativePath,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mediaType,
      fileVerified: mediaTypeMatches,
      ...(mediaTypeMatches
        ? {}
        : {
            fileVerificationError:
              screenshotDimensionError ||
              `expected ${expectedMediaType || "known proof artifact"} media, got ${mediaType}`,
          }),
    };
  } catch (error) {
    return {
      path: artifactPath,
      relativePath,
      fileVerified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const captureUiProofScreenshot = async (
  page,
  screenshotPath,
  runDir,
  label,
) => {
  await assertNewProofArtifactDestination(screenshotPath, runDir);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshotEvidence = await collectProofFileEvidence(
    screenshotPath,
    runDir,
    "image/png",
  );
  if (screenshotEvidence.fileVerified !== true) {
    throw new Error(
      `${label} screenshot proof file was not captured: ${
        screenshotEvidence.fileVerificationError ||
        screenshotEvidence.error ||
        screenshotPath
      }.`,
    );
  }
  return screenshotEvidence;
};

export const collectSccpBscVideoArtifacts = async (video, runDir) => {
  if (!video || typeof video.path !== "function") {
    return [];
  }
  try {
    const videoPath = await video.path();
    const evidence = await collectProofFileEvidence(
      videoPath,
      runDir,
      "video/webm",
    );
    if (evidence.fileVerified !== true) {
      return [
        {
          ...evidence,
          status: "failed",
        },
      ];
    }
    return [
      {
        ...evidence,
        status: "captured",
      },
    ];
  } catch (error) {
    return [
      {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
};

const verifiedProofScreenshotEntries = (explorerScreenshots) =>
  ownArrayValues(explorerScreenshots).filter(
    (screenshot) =>
      isRecord(screenshot) &&
      ownValue(screenshot, "status") === "captured" &&
      ownValue(screenshot, "fileVerified") === true &&
      proofArtifactRelativePathIsSafe(
        ownValue(screenshot, "relativePath"),
        /\.png$/iu,
      ) &&
      Number.isSafeInteger(ownValue(screenshot, "sizeBytes")) &&
      ownValue(screenshot, "sizeBytes") >= MIN_SCREENSHOT_ARTIFACT_BYTES &&
      ownValue(screenshot, "sizeBytes") <= MAX_SCREENSHOT_ARTIFACT_BYTES &&
      typeof ownValue(screenshot, "sha256") === "string" &&
      NON_ZERO_SHA256_PATTERN.test(ownValue(screenshot, "sha256")) &&
      ownValue(screenshot, "mediaType") === "image/png",
  );

const proofArtifactReuseMarkers = (videoArtifacts, explorerScreenshots) => {
  const markers = new Set();
  const screenshotByPath = new Map();
  const screenshotByHash = new Map();
  for (const screenshot of verifiedProofScreenshotEntries(
    explorerScreenshots,
  )) {
    const slot =
      normalizeText(ownValue(screenshot, "kind")) ||
      normalizedProofArtifactRelativePath(ownValue(screenshot, "relativePath"));
    const relativePath = normalizedProofArtifactRelativePath(
      ownValue(screenshot, "relativePath"),
    );
    const sha256 = normalizeText(ownValue(screenshot, "sha256")).toLowerCase();
    if (relativePath) {
      screenshotByPath.set(relativePath, slot);
    }
    if (sha256) {
      screenshotByHash.set(sha256, slot);
    }
  }
  for (const artifact of videoArtifacts) {
    const relativePath = normalizedProofArtifactRelativePath(
      ownValue(artifact, "relativePath"),
    );
    const sha256 = normalizeText(ownValue(artifact, "sha256")).toLowerCase();
    const pathSlot = relativePath ? screenshotByPath.get(relativePath) : "";
    if (pathSlot) {
      markers.add(`reused-proof-artifact-path:${pathSlot}`);
    }
    const hashSlot = sha256 ? screenshotByHash.get(sha256) : "";
    if (hashSlot) {
      markers.add(`reused-proof-artifact-hash:${hashSlot}`);
    }
  }
  return [...markers];
};

export const evaluateSccpBscVideoArtifactEvidence = (
  videoArtifacts = [],
  { explorerScreenshots = [] } = {},
) => {
  const invalidVideoArtifactEntries = arrayRecordShapeProblems(
    videoArtifacts,
    "videoArtifacts",
  );
  const artifacts = ownArrayValues(videoArtifacts);
  const capturedArtifacts = artifacts.filter(
    (artifact) =>
      isRecord(artifact) &&
      ownValue(artifact, "status") === "captured" &&
      ownValue(artifact, "fileVerified") === true &&
      proofArtifactRelativePathIsSafe(
        ownValue(artifact, "relativePath"),
        /\.webm$/iu,
      ) &&
      typeof ownValue(artifact, "sizeBytes") === "number" &&
      Number.isSafeInteger(ownValue(artifact, "sizeBytes")) &&
      ownValue(artifact, "sizeBytes") >= MIN_VIDEO_ARTIFACT_BYTES &&
      ownValue(artifact, "sizeBytes") <= MAX_VIDEO_ARTIFACT_BYTES &&
      typeof ownValue(artifact, "sha256") === "string" &&
      NON_ZERO_SHA256_PATTERN.test(ownValue(artifact, "sha256")) &&
      ownValue(artifact, "mediaType") === "video/webm",
  );
  const missingVideoArtifacts =
    capturedArtifacts.length === 0
      ? ["recording"]
      : capturedArtifacts.length === 1
        ? []
        : ["duplicate-recording"];
  missingVideoArtifacts.push(
    ...invalidVideoArtifactEntries,
    ...proofArtifactReuseMarkers(capturedArtifacts, explorerScreenshots),
  );
  return {
    ready: missingVideoArtifacts.length === 0,
    missingVideoArtifacts,
    capturedArtifacts: capturedArtifacts.map((artifact) => ({
      relativePath: ownValue(artifact, "relativePath"),
      sizeBytes: ownValue(artifact, "sizeBytes"),
      sha256: ownValue(artifact, "sha256"),
      mediaType: ownValue(artifact, "mediaType"),
    })),
  };
};

export const evaluateSccpBscVideoTimelineEvidence = (timeline = {}) => {
  const startedAtMs = ownValue(timeline, "startedAtMs");
  const endedAtMs = ownValue(timeline, "endedAtMs");
  const missingVideoTimeline = [];
  if (!Number.isSafeInteger(startedAtMs)) {
    missingVideoTimeline.push("startedAtMs");
  }
  if (!Number.isSafeInteger(endedAtMs)) {
    missingVideoTimeline.push("endedAtMs");
  }
  const durationMs =
    Number.isSafeInteger(startedAtMs) && Number.isSafeInteger(endedAtMs)
      ? endedAtMs - startedAtMs
      : null;
  if (
    durationMs === null ||
    durationMs < MIN_VIDEO_DURATION_MS ||
    durationMs > MAX_VIDEO_DURATION_MS
  ) {
    missingVideoTimeline.push("durationMs");
  }
  return {
    ready: missingVideoTimeline.length === 0,
    durationMs,
    missingVideoTimeline,
  };
};

export const buildSccpBscVideoReadinessBinding = (readiness) => {
  if (!isRecord(readiness)) {
    return null;
  }
  const route = ownValue(readiness, "route");
  const peerAudit = ownValue(readiness, "peerAudit");
  const routeDeployment = ownValue(route, "deployment");
  const routePostDeploy = ownValue(route, "postDeployLiveEvidence");
  return {
    checkedAt: readPublicString(readiness, "checkedAt"),
    routeReady: ownValue(readiness, "routeReady") === true,
    smokeReadinessReady: ownValue(readiness, "ready") === true,
    checks: publicCheckSummaries(ownValue(readiness, "checks")),
    route: isRecord(route)
      ? {
          manifestSource: readPublicString(route, "manifestSource"),
          routeId: readPublicString(route, "routeId"),
          assetKey: readPublicString(route, "assetKey"),
          bsc: publicBscRouteBinding(route),
          deployment: publicDeployment(routeDeployment),
          postDeployLiveEvidence: publicPostDeployLiveEvidence(routePostDeploy),
        }
      : null,
    peerAudit: isRecord(peerAudit)
      ? {
          ready: ownValue(peerAudit, "ready") === true,
          routeId: readPublicString(peerAudit, "routeId"),
          assetKey: readPublicString(peerAudit, "assetKey"),
          peerCount:
            typeof ownValue(peerAudit, "peerCount") === "number"
              ? ownValue(peerAudit, "peerCount")
              : null,
          manifestFingerprint: readPublicString(
            peerAudit,
            "manifestFingerprint",
          ),
          sanitizedStanzaFilesChecked:
            ownValue(peerAudit, "sanitizedStanzaFilesChecked") === true,
        }
      : null,
  };
};

const uniqueByHref = (links) => {
  const seen = new Set();
  return ownArrayValues(links).filter((link) => {
    const href = normalizeText(ownValue(link, "href"));
    if (!href || seen.has(href)) {
      return false;
    }
    seen.add(href);
    return true;
  });
};

const PUBLIC_PROOF_LINK_LABELS = Object.freeze({
  tairaSourceTx: "TAIRA source transaction",
  bscFinalizeTx: "BSC finalize transaction",
  bscBurnTx: "BSC burn transaction",
  tairaSettlementTx: "TAIRA settlement transaction",
});

const parseExplorerUrl = (href) => {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    return url;
  } catch (_error) {
    return null;
  }
};

const normalizeExplorerTransactionEvidenceKey = (
  href,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const profile = resolveBscNetworkProfileOrDefault(bscNetwork);
  const url = parseExplorerUrl(href);
  if (!url) {
    return normalizeText(href).toLowerCase();
  }
  const pathname = url.pathname.replace(/\/+$/u, "");
  const bscMatch = pathname.match(/^\/tx\/(0x[0-9a-f]{64})$/iu);
  if (url.hostname === profile.explorerHost && bscMatch) {
    return `${url.hostname}/tx/${bscMatch[1].toLowerCase()}`;
  }
  const tairaMatch = pathname.match(
    /^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu,
  );
  if (url.hostname === "taira-explorer.sora.org" && tairaMatch) {
    return `${url.hostname}/transactions/${tairaMatch[1].toLowerCase()}`;
  }
  return `${url.hostname}${pathname}`.toLowerCase();
};

export const extractExplorerTransactionHash = (
  href,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const profile = resolveBscNetworkProfileOrDefault(bscNetwork);
  const url = parseExplorerUrl(href);
  if (!url) {
    return "";
  }
  const pathname = url.pathname.replace(/\/+$/u, "");
  const bscMatch = pathname.match(/^\/tx\/0x([0-9a-f]{64})$/iu);
  if (url.hostname === profile.explorerHost && bscMatch) {
    return bscMatch[1].toLowerCase();
  }
  const tairaMatch = pathname.match(
    /^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu,
  );
  if (url.hostname === "taira-explorer.sora.org" && tairaMatch) {
    return tairaMatch[1].toLowerCase();
  }
  return "";
};

const normalizeExplorerTransactionHash = (value) => {
  const normalized = normalizeText(value).replace(/^0x/iu, "").toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : "";
};

export const evaluateSccpBscVideoPostDeployTransactionEvidence = (
  input = {},
) => {
  const transactions = ownValue(input, "transactions") ?? {};
  const readiness = ownValue(input, "readiness");
  const bscNetwork = ownValue(input, "bscNetwork") ?? DEFAULT_BSC_NETWORK;
  const profile = readBscProfileFromReadiness(readiness, bscNetwork);
  const route = ownValue(readiness, "route");
  const postDeploy = publicPostDeployLiveEvidence(
    ownValue(route, "postDeployLiveEvidence"),
  );
  const postDeployHashes = new Map();
  const addPostDeployHash = (hash, field) => {
    if (hash && !postDeployHashes.has(hash)) {
      postDeployHashes.set(hash, field);
    }
  };
  if (postDeploy) {
    addPostDeployHash(
      normalizeExplorerTransactionHash(
        ownValue(postDeploy, "sourceEventTransactionId"),
      ),
      "sourceEventTransactionId",
    );
    addPostDeployHash(
      normalizeExplorerTransactionHash(
        ownValue(postDeploy, "routeCanaryTransactionId"),
      ),
      "routeCanaryTransactionId",
    );
    addPostDeployHash(
      extractExplorerTransactionHash(
        ownValue(postDeploy, "sourceEventExplorerUrl"),
        {
          bscNetwork: profile.key,
        },
      ),
      "sourceEventExplorerUrl",
    );
    addPostDeployHash(
      extractExplorerTransactionHash(
        ownValue(postDeploy, "routeCanaryExplorerUrl"),
        {
          bscNetwork: profile.key,
        },
      ),
      "routeCanaryExplorerUrl",
    );
  }
  const reusedPostDeployTransactions = [];
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const hash = extractExplorerTransactionHash(ownValue(transactions, slot), {
      bscNetwork: profile.key,
    });
    const postDeployField = hash ? postDeployHashes.get(hash) : "";
    if (postDeployField) {
      reusedPostDeployTransactions.push({ slot, postDeployField });
    }
  }
  return {
    ready: reusedPostDeployTransactions.length === 0,
    reusedPostDeployTransactionSlots: reusedPostDeployTransactions.map(
      (entry) => entry.slot,
    ),
    reusedPostDeployTransactions,
  };
};

const publicPostDeployTransactionBindingProblems = (postDeploy, profile) => {
  const problems = [];
  const sourceEventTransactionId = normalizeExplorerTransactionHash(
    ownValue(postDeploy, "sourceEventTransactionId"),
  );
  const routeCanaryTransactionId = normalizeExplorerTransactionHash(
    ownValue(postDeploy, "routeCanaryTransactionId"),
  );
  const sourceEventExplorerHash = extractExplorerTransactionHash(
    ownValue(postDeploy, "sourceEventExplorerUrl"),
    { bscNetwork: profile.key },
  );
  const routeCanaryExplorerHash = extractExplorerTransactionHash(
    ownValue(postDeploy, "routeCanaryExplorerUrl"),
    { bscNetwork: profile.key },
  );

  if (
    sourceEventTransactionId &&
    sourceEventExplorerHash &&
    sourceEventTransactionId !== sourceEventExplorerHash
  ) {
    problems.push(
      "postDeployLiveEvidence.sourceEventExplorerUrl.transactionIdBinding",
    );
  }
  if (
    routeCanaryTransactionId &&
    routeCanaryExplorerHash &&
    routeCanaryTransactionId !== routeCanaryExplorerHash
  ) {
    problems.push(
      "postDeployLiveEvidence.routeCanaryExplorerUrl.transactionIdBinding",
    );
  }
  if (
    sourceEventTransactionId &&
    routeCanaryTransactionId &&
    sourceEventTransactionId === routeCanaryTransactionId
  ) {
    problems.push(
      "postDeployLiveEvidence.routeCanaryTransactionId.roleCollision.sourceEventTransactionId",
    );
  }
  return problems;
};

const hasVerifiedExplorerScreenshotFile = (screenshot) =>
  ownValue(screenshot, "status") === "captured" &&
  ownValue(screenshot, "fileVerified") === true &&
  proofArtifactRelativePathIsSafe(
    ownValue(screenshot, "relativePath"),
    /\.png$/iu,
  ) &&
  Number.isSafeInteger(ownValue(screenshot, "sizeBytes")) &&
  ownValue(screenshot, "sizeBytes") >= MIN_SCREENSHOT_ARTIFACT_BYTES &&
  ownValue(screenshot, "sizeBytes") <= MAX_SCREENSHOT_ARTIFACT_BYTES &&
  typeof ownValue(screenshot, "sha256") === "string" &&
  NON_ZERO_SHA256_PATTERN.test(ownValue(screenshot, "sha256")) &&
  ownValue(screenshot, "mediaType") === "image/png";

const hasExplorerPageContentEvidence = (screenshot) =>
  Number.isSafeInteger(ownValue(screenshot, "contentLength")) &&
  ownValue(screenshot, "contentLength") >= MIN_EXPLORER_CONTENT_CHARS;

const canonicalExplorerTransactionHrefForSlot = (
  slot,
  href,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const profile = resolveBscNetworkProfileOrDefault(bscNetwork);
  const url = parseExplorerUrl(href);
  if (!url) {
    return "";
  }
  const pathname = url.pathname.replace(/\/+$/u, "");
  const bscMatch = pathname.match(/^\/tx\/0x([0-9a-f]{64})$/iu);
  if (
    (slot === "bscFinalizeTx" || slot === "bscBurnTx") &&
    url.hostname === profile.explorerHost &&
    bscMatch
  ) {
    return `${profile.explorerUrl}/tx/0x${bscMatch[1].toLowerCase()}`;
  }
  const tairaMatch = pathname.match(
    /^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu,
  );
  if (
    (slot === "tairaSourceTx" || slot === "tairaSettlementTx") &&
    url.hostname === "taira-explorer.sora.org" &&
    tairaMatch
  ) {
    return `https://taira-explorer.sora.org/transactions/${tairaMatch[1].toLowerCase()}`;
  }
  return "";
};

export const canonicalizeSccpBscProofLinks = (
  links,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const linksBySlot = Object.create(null);
  for (const link of uniqueByHref(links)) {
    const slot = classifySccpBscProofLink(link, { bscNetwork });
    if (!slot || ownValue(linksBySlot, slot)) {
      continue;
    }
    const href = canonicalExplorerTransactionHrefForSlot(
      slot,
      ownValue(link, "href"),
      {
        bscNetwork,
      },
    );
    if (!href) {
      continue;
    }
    linksBySlot[slot] = {
      label: PUBLIC_PROOF_LINK_LABELS[slot],
      href,
    };
  }
  return REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot) =>
    ownValue(linksBySlot, slot),
  ).filter(Boolean);
};

export const buildSccpBscTransactionLinksArtifact = (links, options) =>
  canonicalizeSccpBscProofLinks(links, options);

const findDuplicateTransactionSlots = (
  transactionBySlot,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const groupsBySlotSet = new Map();
  const pushDuplicateGroups = (slotsByTransaction) => {
    for (const entry of slotsByTransaction.values()) {
      if (entry.slots.length <= 1) {
        continue;
      }
      const slotSetKey = entry.slots.join("\0");
      if (!groupsBySlotSet.has(slotSetKey)) {
        groupsBySlotSet.set(slotSetKey, entry);
      }
    }
  };
  const slotsByExplorerTransaction = new Map();
  const slotsByTransactionHash = new Map();
  for (const slot of REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS) {
    const href = normalizeText(transactionBySlot[slot]);
    if (!href) {
      continue;
    }
    const key = normalizeExplorerTransactionEvidenceKey(href, { bscNetwork });
    const explorerEntry = slotsByExplorerTransaction.get(key) ?? {
      transaction: href,
      slots: [],
    };
    explorerEntry.slots.push(slot);
    slotsByExplorerTransaction.set(key, explorerEntry);

    const transactionHash = extractExplorerTransactionHash(href, {
      bscNetwork,
    });
    if (transactionHash) {
      const hashEntry = slotsByTransactionHash.get(transactionHash) ?? {
        transaction: href,
        slots: [],
      };
      hashEntry.slots.push(slot);
      slotsByTransactionHash.set(transactionHash, hashEntry);
    }
  }
  pushDuplicateGroups(slotsByExplorerTransaction);
  pushDuplicateGroups(slotsByTransactionHash);
  return [...groupsBySlotSet.values()];
};

export const explorerTransactionEvidenceUrlsMatch = (
  expectedHref,
  finalHref,
  options,
) =>
  normalizeExplorerTransactionEvidenceKey(expectedHref, options) ===
  normalizeExplorerTransactionEvidenceKey(finalHref, options);

const readExplorerPageContent = async (page) => {
  const parts = [];
  if (typeof page.title === "function") {
    try {
      parts.push(await page.title());
    } catch (_error) {
      // The body text check below is still sufficient when title read fails.
    }
  }
  if (typeof page.locator === "function") {
    try {
      parts.push(await page.locator("body").innerText({ timeout: 5_000 }));
    } catch (_error) {
      // Fall back to page.evaluate where available.
    }
  }
  if (typeof page.evaluate === "function") {
    try {
      parts.push(
        await page.evaluate(() =>
          typeof document === "undefined"
            ? ""
            : (document.body?.innerText ?? ""),
        ),
      );
    } catch (_error) {
      // Empty text will fail the transaction hash assertion below.
    }
  }
  return parts.map(normalizeText).filter(Boolean).join("\n");
};

export const assertExplorerPageContainsTransactionHash = async (
  page,
  href,
  options,
) => {
  const txHash = extractExplorerTransactionHash(href, options);
  if (!txHash) {
    throw new Error(
      `Explorer transaction hash could not be read from ${href}.`,
    );
  }
  const content = (await readExplorerPageContent(page)).toLowerCase();
  if (!content.includes(txHash) && !content.includes(`0x${txHash}`)) {
    throw new Error(
      `Explorer page content did not include transaction hash ${txHash}.`,
    );
  }
  return { txHash, contentLength: content.length };
};

export const classifySccpBscProofLink = (
  link,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const profile = resolveBscNetworkProfileOrDefault(bscNetwork);
  const label = normalizeText(ownValue(link, "label")).toLowerCase();
  const href = normalizeText(ownValue(link, "href"));
  const url = parseExplorerUrl(href);
  if (!url) {
    return null;
  }
  const pathname = url.pathname.replace(/\/+$/u, "");
  if (
    url.hostname === profile.explorerHost &&
    /^\/tx\/0x[0-9a-f]{64}$/iu.test(pathname)
  ) {
    if (label.includes("finalize")) {
      return "bscFinalizeTx";
    }
    if (label.includes("burn") || label === "bsc transaction") {
      return "bscBurnTx";
    }
    return null;
  }
  if (
    url.hostname === "taira-explorer.sora.org" &&
    /^\/transactions?\/(?:0x)?[0-9a-f]{64}$/iu.test(pathname)
  ) {
    if (label.includes("settlement")) {
      return "tairaSettlementTx";
    }
    if (label.includes("source")) {
      return "tairaSourceTx";
    }
    return null;
  }
  return null;
};

export const inferSccpBscVideoTransactions = (
  links,
  { bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const transactions = {
    tairaSourceTx: "",
    bscFinalizeTx: "",
    bscBurnTx: "",
    tairaSettlementTx: "",
  };
  for (const link of canonicalizeSccpBscProofLinks(links, { bscNetwork })) {
    const slot = classifySccpBscProofLink(link, { bscNetwork });
    if (slot && Object.prototype.hasOwnProperty.call(transactions, slot)) {
      transactions[slot] ||= ownValue(link, "href");
    }
  }
  return transactions;
};

export const evaluateSccpBscVideoProofEvidence = (input = {}) => {
  const transactions = ownValue(input, "transactions") ?? {};
  const explorerScreenshots = ownValue(input, "explorerScreenshots") ?? [];
  const bscNetwork = ownValue(input, "bscNetwork") ?? DEFAULT_BSC_NETWORK;
  const transactionBySlot = Object.fromEntries(
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot) => [
      slot,
      normalizeText(ownValue(transactions, slot)),
    ]),
  );
  const invalidExplorerScreenshotEntries = arrayRecordShapeProblems(
    explorerScreenshots,
    "explorerScreenshots",
  );
  const screenshotRecords = ownArrayValues(explorerScreenshots);
  const capturedScreenshotsBySlot = new Map(
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot) => [slot, []]),
  );
  const validScreenshotProofPathSlots = new Map();
  const validScreenshotProofHashSlots = new Map();
  const duplicateScreenshotProofPathSlots = new Set();
  const duplicateScreenshotProofHashSlots = new Set();
  const invalidExplorerScreenshotSlots = new Set();
  const unexpectedExplorerScreenshotKinds = new Set();
  for (const screenshot of screenshotRecords) {
    if (!isRecord(screenshot)) {
      continue;
    }
    const kind = normalizeText(ownValue(screenshot, "kind"));
    if (!REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.includes(kind)) {
      unexpectedExplorerScreenshotKinds.add(kind || "unknown");
      continue;
    }
    const label = normalizeText(ownValue(screenshot, "label"));
    const expectedHref = transactionBySlot[kind];
    const expectedHash = extractExplorerTransactionHash(expectedHref, {
      bscNetwork,
    });
    const valid =
      label === PUBLIC_PROOF_LINK_LABELS[kind] &&
      expectedHref &&
      expectedHash &&
      hasVerifiedExplorerScreenshotFile(screenshot) &&
      hasExplorerPageContentEvidence(screenshot) &&
      explorerTransactionEvidenceUrlsMatch(
        expectedHref,
        ownValue(screenshot, "href"),
        {
          bscNetwork,
        },
      ) &&
      explorerTransactionEvidenceUrlsMatch(
        expectedHref,
        ownValue(screenshot, "finalHref"),
        {
          bscNetwork,
        },
      ) &&
      normalizeExplorerTransactionHash(
        ownValue(screenshot, "transactionHash"),
      ) === expectedHash;
    if (!valid) {
      invalidExplorerScreenshotSlots.add(kind);
      continue;
    }
    const proofPath = normalizedProofArtifactRelativePath(
      ownValue(screenshot, "relativePath"),
    );
    const previousSlot = validScreenshotProofPathSlots.get(proofPath);
    if (previousSlot && previousSlot !== kind) {
      duplicateScreenshotProofPathSlots.add(previousSlot);
      duplicateScreenshotProofPathSlots.add(kind);
    } else {
      validScreenshotProofPathSlots.set(proofPath, kind);
    }
    const proofHash = normalizeText(
      ownValue(screenshot, "sha256"),
    ).toLowerCase();
    const previousHashSlot = validScreenshotProofHashSlots.get(proofHash);
    if (previousHashSlot && previousHashSlot !== kind) {
      duplicateScreenshotProofHashSlots.add(previousHashSlot);
      duplicateScreenshotProofHashSlots.add(kind);
    } else {
      validScreenshotProofHashSlots.set(proofHash, kind);
    }
    capturedScreenshotsBySlot.get(kind).push(screenshot);
  }
  const missingTransactionSlots =
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.filter(
      (slot) => !transactionBySlot[slot],
    );
  const missingExplorerScreenshotSlots =
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.filter(
      (slot) =>
        transactionBySlot[slot] &&
        (capturedScreenshotsBySlot.get(slot)?.length ?? 0) === 0,
    );
  const duplicateExplorerScreenshotSlots =
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.filter(
      (slot) =>
        (capturedScreenshotsBySlot.get(slot)?.length ?? 0) > 1 ||
        duplicateScreenshotProofPathSlots.has(slot) ||
        duplicateScreenshotProofHashSlots.has(slot),
    );
  const duplicateTransactionSlots = findDuplicateTransactionSlots(
    transactionBySlot,
    { bscNetwork },
  );
  return {
    proofComplete:
      missingTransactionSlots.length === 0 &&
      missingExplorerScreenshotSlots.length === 0 &&
      duplicateTransactionSlots.length === 0 &&
      duplicateExplorerScreenshotSlots.length === 0 &&
      invalidExplorerScreenshotEntries.length === 0 &&
      invalidExplorerScreenshotSlots.size === 0 &&
      unexpectedExplorerScreenshotKinds.size === 0,
    missingTransactionSlots,
    missingExplorerScreenshotSlots,
    duplicateTransactionSlots,
    duplicateExplorerScreenshotSlots,
    invalidExplorerScreenshotSlots: [
      ...invalidExplorerScreenshotEntries,
      ...invalidExplorerScreenshotSlots,
    ],
    unexpectedExplorerScreenshotKinds: [...unexpectedExplorerScreenshotKinds],
  };
};

export const evaluateSccpBscVideoReadinessEvidence = (
  readiness,
  { bscNetwork } = {},
) => {
  const missingReadinessEvidence = [];
  if (!isRecord(readiness)) {
    return {
      ready: false,
      missingReadinessEvidence: ["smokeReadinessReport"],
    };
  }
  const binding = buildSccpBscVideoReadinessBinding(readiness);
  const profile = readBscProfileFromReadiness(readiness, bscNetwork);
  {
    const checks = ownValue(readiness, "checks");
    const route = ownValue(binding, "route");
    const routeBsc = ownValue(route, "bsc");
    const deployment = ownValue(route, "deployment");
    const postDeploy = ownValue(route, "postDeployLiveEvidence");
    const peerAudit = ownValue(binding, "peerAudit");
    missingReadinessEvidence.push(
      ...collectSccpBscVideoReadinessAliasProblems(readiness),
    );
    if (carriesKnownDiagnosticBscVerifierKeyHash(readiness)) {
      missingReadinessEvidence.push("diagnosticVerifierKeyHash");
    }
    missingReadinessEvidence.push(
      ...reportTimestampAliasProblems(
        readiness,
        "smokeReadinessTimestampAlias",
      ),
    );
    if (ownValue(readiness, "routeReady") !== true) {
      missingReadinessEvidence.push("routePreflightReady");
    }
    if (ownValue(readiness, "ready") !== true) {
      missingReadinessEvidence.push("smokeReadinessReady");
    }
    missingReadinessEvidence.push(
      ...reportCheckIntegrityProblems(checks, "smokeReadiness").map(
        (problem) => `smokeReadinessCheckIntegrity.${problem}`,
      ),
    );
    for (const id of REQUIRED_SCCP_BSC_VIDEO_SMOKE_READINESS_CHECK_IDS) {
      if (!reportCheckPassed(checks, id)) {
        missingReadinessEvidence.push(`smokeReadinessCheck.${id}`);
      }
    }
    const checkedAt = ownValue(binding, "checkedAt");
    if (parseReportTimestampMs(checkedAt) === null) {
      missingReadinessEvidence.push("smokeReadinessTimestamp");
    }
    if (
      ownValue(route, "manifestSource") !== "torii" ||
      ownValue(route, "routeId") !== ROUTE_ID ||
      ownValue(route, "assetKey") !== ASSET_KEY
    ) {
      missingReadinessEvidence.push("routeIdentityBinding");
    }
    if (
      route &&
      (ownValue(routeBsc, "network") !== profile.key ||
        ownValue(routeBsc, "chain") !== profile.chain ||
        ownValue(routeBsc, "chainIdHex") !== profile.chainIdHex ||
        ownValue(routeBsc, "networkIdHex") !== profile.networkIdHex)
    ) {
      missingReadinessEvidence.push("routeBscNetworkBinding");
    }
    if (
      route &&
      (ownValue(routeBsc, "explorerUrl") !== profile.explorerUrl ||
        ownValue(routeBsc, "explorerHost") !== profile.explorerHost)
    ) {
      missingReadinessEvidence.push("routeBscExplorerBinding");
    }
    if (!deployment) {
      missingReadinessEvidence.push("routeDeploymentBinding");
    } else {
      for (const key of [
        "bridgeAddress",
        "tokenAddress",
        "sourceBridgeAddress",
        "verifierAddress",
      ]) {
        if (
          !NON_ZERO_EVM_ADDRESS_PATTERN.test(ownValue(deployment, key) ?? "")
        ) {
          missingReadinessEvidence.push(`routeDeployment.${key}`);
        }
      }
      if (
        normalizeHexText(ownValue(deployment, "networkIdHex")) !==
        profile.networkIdHex
      ) {
        missingReadinessEvidence.push("routeDeployment.networkIdHex");
      }
      for (const key of [
        "verifierCodeHash",
        "verifierKeyHash",
        "proofArtifactHash",
        "provingKeyHash",
        "nativeEvmProverBundleHash",
        "destinationBindingHash",
      ]) {
        if (!NON_ZERO_HEX32_PATTERN.test(ownValue(deployment, key) ?? "")) {
          missingReadinessEvidence.push(`routeDeployment.${key}`);
        }
      }
      missingReadinessEvidence.push(
        ...publicDeploymentHashRoleCollisionProblems(deployment),
      );
      if (
        !BASE58_ASSET_DEFINITION_PATTERN.test(
          ownValue(deployment, "settlementAssetDefinitionId") ?? "",
        )
      ) {
        missingReadinessEvidence.push(
          "routeDeployment.settlementAssetDefinitionId",
        );
      }
    }
    if (!postDeploy) {
      missingReadinessEvidence.push("postDeployLiveEvidenceBinding");
    } else {
      if (ownValue(postDeploy, "fullTomlReady") !== true) {
        missingReadinessEvidence.push("postDeployLiveEvidence.fullTomlReady");
      }
      for (const key of [
        "sourceBridgeConfigHash",
        "sourceEventTransactionId",
        "routeCanaryEvidenceHash",
        "routeCanaryTransactionId",
        "offlineFullTomlSha256",
      ]) {
        if (!NON_ZERO_HEX32_PATTERN.test(ownValue(postDeploy, key) ?? "")) {
          missingReadinessEvidence.push(`postDeployLiveEvidence.${key}`);
        }
      }
      for (const key of ["sourceEventExplorerUrl", "routeCanaryExplorerUrl"]) {
        if (
          !bscExplorerTransactionPattern(profile).test(
            normalizeText(ownValue(postDeploy, key)).toLowerCase(),
          )
        ) {
          missingReadinessEvidence.push(`postDeployLiveEvidence.${key}`);
        }
      }
      missingReadinessEvidence.push(
        ...publicPostDeployTransactionBindingProblems(postDeploy, profile),
      );
    }
    if (!ownValue(peerAudit, "manifestFingerprint")) {
      missingReadinessEvidence.push("peerAuditBinding");
    } else {
      if (ownValue(peerAudit, "ready") !== true) {
        missingReadinessEvidence.push("peerAudit.ready");
      }
      if (
        ownValue(peerAudit, "routeId") !== ROUTE_ID ||
        ownValue(peerAudit, "assetKey") !== ASSET_KEY
      ) {
        missingReadinessEvidence.push("peerAudit.route");
      }
      if (
        !Number.isSafeInteger(ownValue(peerAudit, "peerCount")) ||
        ownValue(peerAudit, "peerCount") <= 0
      ) {
        missingReadinessEvidence.push("peerAudit.peerCount");
      }
      if (
        !PEER_AUDIT_FINGERPRINT_PATTERN.test(
          ownValue(peerAudit, "manifestFingerprint"),
        )
      ) {
        missingReadinessEvidence.push("peerAudit.manifestFingerprint");
      }
      if (ownValue(peerAudit, "sanitizedStanzaFilesChecked") !== true) {
        missingReadinessEvidence.push("peerAudit.sanitizedStanzaFilesChecked");
      }
    }
  }
  return {
    ready: missingReadinessEvidence.length === 0,
    missingReadinessEvidence,
  };
};

export const buildSccpBscLiveVideoTranscript = (input = {}) => {
  const runDir = ownValue(input, "runDir");
  const readiness = ownValue(input, "readiness");
  const bscNetwork = ownValue(input, "bscNetwork");
  const startedAtMs = ownValue(input, "startedAtMs");
  const endedAtMs = ownValue(input, "endedAtMs");
  const links = ownValue(input, "links") ?? [];
  const explorerScreenshots = ownValue(input, "explorerScreenshots") ?? [];
  const videoArtifacts = ownValue(input, "videoArtifacts") ?? [];
  const bscProfile = readBscProfileFromReadiness(readiness, bscNetwork);
  const invalidTransactionLinkEntries = arrayRecordShapeProblems(
    links,
    "transactionLinks",
  );
  const publicLinks = canonicalizeSccpBscProofLinks(links, {
    bscNetwork: bscProfile.key,
  });
  const publicExplorerScreenshots = publicProofFileEntries(
    explorerScreenshots,
    {
      bscNetwork: bscProfile.key,
    },
  );
  const publicVideoArtifacts = publicProofFileEntries(videoArtifacts, {
    bscNetwork: bscProfile.key,
  });
  const transactions = inferSccpBscVideoTransactions(publicLinks, {
    bscNetwork: bscProfile.key,
  });
  const evidence = evaluateSccpBscVideoProofEvidence({
    transactions,
    explorerScreenshots,
    bscNetwork: bscProfile.key,
  });
  const readinessBinding = buildSccpBscVideoReadinessBinding(readiness);
  const readinessEvidence = evaluateSccpBscVideoReadinessEvidence(readiness, {
    bscNetwork: bscProfile.key,
  });
  const postDeployTransactionEvidence =
    evaluateSccpBscVideoPostDeployTransactionEvidence({
      transactions,
      readiness,
      bscNetwork: bscProfile.key,
    });
  const videoArtifactEvidence = evaluateSccpBscVideoArtifactEvidence(
    videoArtifacts,
    {
      explorerScreenshots,
    },
  );
  const timelineEvidence = evaluateSccpBscVideoTimelineEvidence({
    startedAtMs,
    endedAtMs,
  });
  const proofComplete =
    evidence.proofComplete &&
    invalidTransactionLinkEntries.length === 0 &&
    readinessEvidence.ready &&
    postDeployTransactionEvidence.ready &&
    videoArtifactEvidence.ready &&
    timelineEvidence.ready;
  return {
    schema: "iroha-demo-sccp-bsc-live-video/v1",
    startedAtMs,
    endedAtMs,
    durationMs: timelineEvidence.durationMs,
    outputDir: publicProofOutputDir(runDir),
    bsc: {
      network: bscProfile.key,
      chain: bscProfile.chain,
      chainIdHex: bscProfile.chainIdHex,
      networkIdHex: bscProfile.networkIdHex,
      explorerUrl: bscProfile.explorerUrl,
      explorerHost: bscProfile.explorerHost,
    },
    preflightReady: ownValue(readiness, "routeReady") ?? null,
    smokeReadinessReady: ownValue(readiness, "ready") ?? null,
    readinessBinding,
    flowOrder: [...REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS],
    expectedEvidence: [
      "TAIRA source transaction from the SCCP UI",
      `${bscProfile.label} finalize transaction shown in explorer`,
      "BSC burn transaction shown in explorer",
      "TAIRA settlement transaction shown in explorer",
    ],
    transactionLinks: publicLinks,
    explorerScreenshots: publicExplorerScreenshots,
    videoArtifacts: publicVideoArtifacts,
    evidence: {
      ...evidence,
      invalidTransactionLinkEntries,
      readinessEvidence,
      postDeployTransactionEvidence,
      videoArtifactEvidence,
      timelineEvidence,
    },
    operatorNotes: proofComplete
      ? SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES
      : SCCP_BSC_VIDEO_INCOMPLETE_OPERATOR_NOTES,
    missingEvidence: {
      transactionSlots: evidence.missingTransactionSlots,
      explorerScreenshotSlots: evidence.missingExplorerScreenshotSlots,
      duplicateTransactionSlots: evidence.duplicateTransactionSlots,
      duplicateExplorerScreenshotSlots:
        evidence.duplicateExplorerScreenshotSlots,
      invalidExplorerScreenshotSlots: evidence.invalidExplorerScreenshotSlots,
      unexpectedExplorerScreenshotKinds:
        evidence.unexpectedExplorerScreenshotKinds,
      invalidTransactionLinks: invalidTransactionLinkEntries,
      readiness: [
        ...readinessEvidence.missingReadinessEvidence,
        ...postDeployTransactionEvidence.reusedPostDeployTransactions.map(
          (entry) =>
            `postDeployTransactionReuse.${entry.slot}.${entry.postDeployField}`,
        ),
      ],
      videoArtifacts: videoArtifactEvidence.missingVideoArtifacts,
      videoTimeline: timelineEvidence.missingVideoTimeline,
    },
    proofComplete,
    transactions,
  };
};

const formatList = (items) =>
  Array.isArray(items) && items.length > 0 ? items.join(", ") : "none";

export const summarizeSccpBscLiveVideoMissingEvidence = (transcript) => {
  const missing = isRecord(transcript)
    ? ownValue(transcript, "missingEvidence")
    : null;
  const missingList = (field) =>
    formatList(ownArrayValues(ownValue(missing, field)));
  const duplicateSlots = ownArrayValues(
    ownValue(missing, "duplicateTransactionSlots"),
  ).map((entry) => {
    const slots = ownArrayValues(ownValue(entry, "slots"));
    return `${slots.length > 0 ? slots.join("+") : "unknown-slots"}:${
      normalizeText(ownValue(entry, "transaction")) || "unknown-transaction"
    }`;
  });
  return [
    `transaction slots: ${missingList("transactionSlots")}`,
    `explorer screenshots: ${missingList("explorerScreenshotSlots")}`,
    `duplicate transactions: ${formatList(duplicateSlots)}`,
    `duplicate explorer screenshots: ${missingList(
      "duplicateExplorerScreenshotSlots",
    )}`,
    `invalid explorer screenshots: ${missingList(
      "invalidExplorerScreenshotSlots",
    )}`,
    `unexpected explorer screenshots: ${missingList(
      "unexpectedExplorerScreenshotKinds",
    )}`,
    `invalid transaction links: ${missingList("invalidTransactionLinks")}`,
    `readiness: ${missingList("readiness")}`,
    `video artifacts: ${missingList("videoArtifacts")}`,
    `video timeline: ${missingList("videoTimeline")}`,
  ].join("; ");
};

export const assertSccpBscLiveVideoTranscriptComplete = (
  transcript,
  { allowIncomplete = false, transcriptPath = "" } = {},
) => {
  if (ownValue(transcript, "proofComplete") === true) {
    return {
      complete: true,
      detail: "SCCP BSC live proof transcript is complete.",
    };
  }
  const detail = summarizeSccpBscLiveVideoMissingEvidence(transcript);
  if (allowIncomplete) {
    return {
      complete: false,
      detail,
    };
  }
  throw new Error(
    `SCCP BSC live proof is incomplete${
      transcriptPath ? `: ${transcriptPath}` : ""
    }. Missing evidence: ${detail}. Use --allow-incomplete only for debugging captures.`,
  );
};

const collectTransactionLinks = async (page) =>
  uniqueByHref(
    await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => ({
          label: anchor.textContent?.trim() ?? "",
          href: anchor.href,
        })),
      )
      .catch(() => []),
  );

export const captureExplorerProofs = async (
  page,
  links,
  runDir,
  { settleMs = 5_000, bscNetwork = DEFAULT_BSC_NETWORK } = {},
) => {
  const screenshots = [];
  const explorerLinks = canonicalizeSccpBscProofLinks(links, { bscNetwork });
  for (const [index, link] of explorerLinks.entries()) {
    const kind = classifySccpBscProofLink(link, { bscNetwork }) ?? "explorerTx";
    const href = ownValue(link, "href");
    const label = ownValue(link, "label");
    const screenshotPath = path.join(
      runDir,
      `explorer-${index + 1}-${kind}.png`,
    );
    try {
      await page.goto(href, { waitUntil: "domcontentloaded" });
      if (settleMs > 0) {
        await wait(settleMs);
      }
      const finalHref = typeof page.url === "function" ? page.url() : href;
      if (
        !explorerTransactionEvidenceUrlsMatch(href, finalHref, {
          bscNetwork,
        })
      ) {
        throw new Error(
          `Explorer navigation ended at ${finalHref}, which does not match ${href}.`,
        );
      }
      const contentEvidence = await assertExplorerPageContainsTransactionHash(
        page,
        href,
        { bscNetwork },
      );
      await assertNewProofArtifactDestination(screenshotPath, runDir);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const screenshotEvidence = await collectProofFileEvidence(
        screenshotPath,
        runDir,
        "image/png",
      );
      if (screenshotEvidence.fileVerified !== true) {
        throw new Error(
          `Explorer screenshot proof file was not captured: ${
            screenshotEvidence.fileVerificationError ||
            screenshotEvidence.error ||
            screenshotPath
          }.`,
        );
      }
      screenshots.push({
        kind,
        label,
        href,
        finalHref,
        transactionHash: contentEvidence.txHash,
        contentLength: contentEvidence.contentLength,
        screenshot: screenshotPath,
        ...screenshotEvidence,
        status: "captured",
      });
    } catch (error) {
      screenshots.push({
        kind,
        label,
        href,
        finalHref: typeof page.url === "function" ? page.url() : undefined,
        screenshot: screenshotPath,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return screenshots;
};

const tryClick = async (page, locator, label) => {
  try {
    await locator.click({ timeout: 10_000 });
    return true;
  } catch (error) {
    console.warn(
      `Unable to click ${label}: ${sanitizeSccpBscLiveVideoLogText(
        error instanceof Error ? error.message : String(error),
      )}`,
    );
    return false;
  }
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertNoCliAliasConflicts(args, "BSC live-video explorer automation", [
    "auto-explorer",
    "no-auto-explorer",
  ]);
  const skipPreflightEnv = parseBoolean(
    process.env.SCCP_BSC_VIDEO_SKIP_PREFLIGHT,
    "SCCP_BSC_VIDEO_SKIP_PREFLIGHT",
  );
  const allowIncompleteEnv = parseBoolean(
    process.env.SCCP_BSC_VIDEO_ALLOW_INCOMPLETE,
    "SCCP_BSC_VIDEO_ALLOW_INCOMPLETE",
  );
  const checkBscContracts =
    args["check-bsc-contracts"] === undefined
      ? true
      : parseBoolean(args["check-bsc-contracts"], "--check-bsc-contracts");
  const allowLocalRpc = parseBoolean(
    args["allow-local-rpc"],
    "--allow-local-rpc",
  );
  const skipPreflight = args["skip-preflight"] === true || skipPreflightEnv;
  const allowIncomplete =
    args["allow-incomplete"] === true || allowIncompleteEnv;
  if (skipPreflight && !allowIncomplete) {
    throw new Error(
      "BSC SCCP live-video --skip-preflight requires --allow-incomplete so debug captures cannot look like production proof runs.",
    );
  }
  const { runDir } = await prepareSccpBscLiveVideoRunDir(
    args["output-dir"] ||
      process.env.SCCP_BSC_VIDEO_OUTPUT_DIR ||
      defaultOutputRoot,
  );
  const durationMs = readDurationMs(
    args["duration-ms"] || process.env.SCCP_BSC_VIDEO_DURATION_MS,
  );
  const autoExplorer =
    args["auto-explorer"] === true ||
    (args["no-auto-explorer"] !== true &&
      String(process.env.SCCP_BSC_VIDEO_AUTO_EXPLORER ?? "1")
        .trim()
        .toLowerCase() !== "0");
  const bscProfile = resolveBscNetworkProfileOrDefault(
    args["bsc-network"] ||
      process.env.SCCP_BSC_NETWORK ||
      process.env.VITE_SCCP_BSC_NETWORK ||
      DEFAULT_BSC_NETWORK,
  );
  const runReadinessPreflight = () =>
    runBscSccpLiveSmokeReadiness({
      toriiUrl:
        args["torii-url"] ||
        process.env.SCCP_TAIRA_TORII_URL ||
        "https://taira.sora.org",
      manifestFile:
        args["manifest-file"] || process.env.SCCP_ROUTE_MANIFEST_FILE || "",
      bscNetwork: bscProfile.key,
      walletConnectProjectId: args["walletconnect-project-id"],
      destinationProverModuleUrl: args["destination-prover-module-url"],
      sourceProverModuleUrl: args["source-prover-module-url"],
      checkBscContracts,
      bscRpcUrl:
        args["bsc-rpc-url"] ||
        process.env.SCCP_BSC_RPC_URL ||
        process.env.BSC_RPC_URL,
      allowLocalRpc,
    });

  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run "npm run build" first.`,
    );
  }

  let readiness = null;
  if (!skipPreflight) {
    readiness = await runReadinessPreflight();
    await writeJsonReportFile(path.join(runDir, "readiness.json"), readiness);
    if (ownValue(readiness, "ready") !== true) {
      throw new Error(
        `BSC SCCP live smoke readiness is not ready. Report written to ${path.join(
          runDir,
          "readiness.json",
        )}`,
      );
    }
  }

  let app;
  let page;
  let pageVideo = null;
  let transcriptInputs = null;
  let recordingStartedAtMs = null;
  const transcriptPath = path.join(runDir, "transcript.json");
  try {
    app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        VITE_SCCP_BSC_NETWORK: bscProfile.key,
      },
      recordVideo: {
        dir: runDir,
        size: { width: 1440, height: 1000 },
      },
    });
    page = await app.firstWindow();
    pageVideo = page.video?.() ?? null;
    page.setDefaultTimeout(45_000);
    page.on("console", (message) =>
      console.log(
        `[wallet:${message.type()}] ${sanitizeSccpBscLiveVideoLogText(
          message.text(),
        )}`,
      ),
    );
    page.on("pageerror", (error) =>
      console.log(
        `[wallet:pageerror] ${sanitizeSccpBscLiveVideoLogText(error.message)}`,
      ),
    );

    await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => {});
    await page.evaluate(() => {
      window.location.hash = "#/sccp";
    });
    await page.getByRole("heading", { name: "SCCP Bridge" }).waitFor();
    await tryClick(
      page,
      page.getByRole("button", {
        name: new RegExp(`\\bBSC\\s+${bscProfile.key}\\b`, "iu"),
      }),
      `${bscProfile.label} route tab`,
    );
    recordingStartedAtMs = Date.now();

    if (!skipPreflight) {
      readiness = await runReadinessPreflight();
      await writeJsonReportFile(
        path.join(runDir, "readiness-recording.json"),
        readiness,
      );
      if (ownValue(readiness, "ready") !== true) {
        throw new Error(
          `BSC SCCP live smoke readiness changed after recording started. Report written to ${path.join(
            runDir,
            "readiness-recording.json",
          )}`,
        );
      }
    }

    const instructions = [
      "Recording started.",
      `Use the app UI to connect the ${bscProfile.label} wallet, run TAIRA -> BSC, open the ${bscProfile.label} explorer proof, then run BSC -> TAIRA and open the final TAIRA proof.`,
      `Recording duration: ${durationMs}ms.`,
      `Output directory: ${runDir}`,
      autoExplorer
        ? "After the recording window, the runner will capture visible SCCP transaction links and open explorer proof pages."
        : "Automatic explorer proof capture is disabled.",
    ];
    console.log(instructions.join("\n"));

    await captureUiProofScreenshot(
      page,
      path.join(runDir, "start.png"),
      runDir,
      "SCCP BSC live start",
    );
    await wait(durationMs);
    await captureUiProofScreenshot(
      page,
      path.join(runDir, "end.png"),
      runDir,
      "SCCP BSC live end",
    );

    const links = buildSccpBscTransactionLinksArtifact(
      await collectTransactionLinks(page),
      { bscNetwork: bscProfile.key },
    );
    await writeJsonReportFile(
      path.join(runDir, "transaction-links.json"),
      links,
    );
    const explorerScreenshots = autoExplorer
      ? await captureExplorerProofs(page, links, runDir, {
          bscNetwork: bscProfile.key,
        })
      : [];
    const endedAtMs = Date.now();
    transcriptInputs = {
      runDir,
      readiness,
      bscNetwork: bscProfile.key,
      startedAtMs: recordingStartedAtMs ?? endedAtMs - durationMs,
      endedAtMs,
      links,
      explorerScreenshots,
    };
  } finally {
    await app?.close().catch(() => {});
    if (transcriptInputs) {
      const videoArtifacts = await collectSccpBscVideoArtifacts(
        pageVideo,
        runDir,
      );
      if (videoArtifacts.length > 0) {
        for (const artifact of videoArtifacts) {
          if (artifact.status === "captured") {
            console.log(`Video artifact: ${artifact.path}`);
          } else {
            console.warn(
              `Video artifact capture failed: ${artifact.error || "unknown error"}`,
            );
          }
        }
      }
      const transcript = buildSccpBscLiveVideoTranscript({
        ...transcriptInputs,
        videoArtifacts,
      });
      await writeJsonReportFile(transcriptPath, transcript);
      const completion = assertSccpBscLiveVideoTranscriptComplete(transcript, {
        allowIncomplete,
        transcriptPath,
      });
      if (!completion.complete) {
        console.warn(
          `SCCP BSC live proof is incomplete; continuing because --allow-incomplete was set. Missing evidence: ${completion.detail}`,
        );
      }
    }
  }
  console.log(`SCCP BSC live proof artifacts: ${runDir}`);
};

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

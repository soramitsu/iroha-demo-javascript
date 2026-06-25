#!/usr/bin/env node
/* global BigInt, globalThis */
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import ts from "typescript";
import {
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
  verifyBscMainnetNativeEvmProverArtifactsFromBundle,
  verifyBscTestnetNativeEvmProverArtifactsFromBundle,
} from "@iroha/iroha-js/sccp";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  DEFAULT_BSC_TAIRA_TORII_URL,
  canonicalBscNativeEvmProverBundleHash,
  requiredBscRouteCheckIds,
  resolveBscNetworkProfile,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  parseJsonWithoutDuplicateKeys,
  runBscSccpRoutePreflight,
} from "./sccp-bsc-route-preflight.mjs";
import {
  BSC_RUNTIME_BACKEND_EXPORTS,
  BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS,
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  assertBscSccpBrowserProverModuleExports,
  validateBscSccpBrowserProverModuleBytes,
} from "./sccp-bsc-live-smoke-readiness.mjs";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";

const repoRoot = resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hasControlCharacter = (value) => {
  for (const character of String(value ?? "")) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
};
const DEFAULT_CONFIG_RELATIVE_OUTPUT_PATH =
  "public/sccp-bsc/taira-bsc-xor-prover.config.json";
const DEFAULT_CONFIG_PUBLIC_URL = "/sccp-bsc/taira-bsc-xor-prover.config.json";

export const SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA =
  "iroha-demo-sccp-bsc-runtime-prover/v1";
export const SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES = 512 * 1024;
const SCCP_BSC_RUNTIME_ROUTE_REPORT_MAX_BYTES = 4 * 1024 * 1024;
export const SCCP_BSC_RUNTIME_NATIVE_ARTIFACT_MAX_BYTES = 512 * 1024 * 1024;
export const SCCP_BSC_RUNTIME_PROOF_FILE_MIN_BYTES = 64 * 1024;
const SCCP_BSC_RUNTIME_PROOF_SHAPE_MIN_BYTES = 4096;
const SCCP_BSC_RUNTIME_PROOF_MIN_UNIQUE_BYTES = 16;
const SCCP_BSC_RUNTIME_PROOF_MAX_REPEATED_PATTERN_BYTES = 64;
export const SCCP_BSC_RUNTIME_BACKEND_MIN_BYTES = 1024;
export const SCCP_BSC_RUNTIME_BACKEND_MAX_BYTES =
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES;
const BSC_RUNTIME_ROUTE_REPORT_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const BSC_RUNTIME_ROUTE_REPORT_SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const BSC_RUNTIME_ROUTE_REPORT_SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const DIAGNOSTIC_TEXT_KEYS = new Set([
  "detail",
  "details",
  "disabledReason",
  "disabled_reason",
  "error",
  "errors",
  "message",
  "messages",
  "note",
  "notes",
  "operatorWarning",
  "operator_warning",
  "verifierMaterialWarning",
  "verifier_material_warning",
  "verifierWarning",
  "verifier_warning",
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
const assertDenseDataArray = (value, label, seen = new WeakSet()) => {
  if (!Array.isArray(value)) {
    return;
  }
  if (seen.has(value)) {
    throw new Error(`${label} must not be cyclic`);
  }
  seen.add(value);
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
      seen.delete(value);
      throw new Error(`${label}[${index}] must be a data property`);
    }
    try {
      assertDenseDataArray(descriptor.value, `${label}[${index}]`, seen);
    } catch (error) {
      seen.delete(value);
      throw error;
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      seen.delete(value);
      throw new Error(`${label}[${index}] is missing`);
    }
  }
  seen.delete(value);
};
const ownRecordEntries = (record) =>
  isRecord(record)
    ? Object.keys(record).map((key) => [key, ownValue(record, key)])
    : [];
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
const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;
const isPathInside = (rootPath, candidatePath) => {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};
const pathHasDecodedTraversal = (value) => {
  let decoded = trim(value);
  for (let depth = 0; depth < 8; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch (_error) {
      return true;
    }
    if (next === decoded) {
      return false;
    }
    decoded = next;
    if (
      decoded
        .replace(/\\/gu, "/")
        .split("/")
        .some((segment) => segment === "..")
    ) {
      return true;
    }
  }
  return true;
};

const bscRuntimeProverConfigOutputPathProblem = (value, label) => {
  const normalized = trim(value);
  if (!normalized) {
    return "";
  }
  if (hasControlCharacter(normalized)) {
    return `${label} must not contain control characters.`;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized)) {
    return `${label} must be a filesystem path, not a URL or URI.`;
  }
  if (/[?#]/u.test(normalized)) {
    return `${label} must not contain query strings or fragments.`;
  }
  if (normalized.includes("\\")) {
    return `${label} must use POSIX separators.`;
  }
  if (/%[0-9a-f]{2}/iu.test(normalized)) {
    return `${label} must not contain percent-encoded path segments.`;
  }
  if (pathHasDecodedTraversal(normalized)) {
    return `${label} must not contain encoded traversal or malformed percent escapes.`;
  }
  const segments = normalized
    .split("/")
    .filter((segment, index) => !(index === 0 && segment === ""));
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return `${label} must not contain empty, current-directory, or parent-directory segments.`;
  }
  return "";
};

export const resolveBscRuntimeProverConfigOutputPath = (
  outputPath,
  { root = repoRoot } = {},
) => {
  const resolvedRoot = path.resolve(root);
  const rawOutputPath = trim(outputPath);
  const outputProblem = bscRuntimeProverConfigOutputPathProblem(
    rawOutputPath,
    "BSC runtime prover config output path",
  );
  if (outputProblem) {
    throw new Error(outputProblem);
  }
  const resolvedOutput = rawOutputPath
    ? path.resolve(resolvedRoot, rawOutputPath)
    : path.join(resolvedRoot, DEFAULT_CONFIG_RELATIVE_OUTPUT_PATH);
  if (!isPathInside(resolvedRoot, resolvedOutput)) {
    throw new Error(
      `BSC runtime prover config output path ${resolvedOutput} must resolve inside package root ${resolvedRoot}.`,
    );
  }
  return resolvedOutput;
};
const normalizeHex32 = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized) || /^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a non-zero 32-byte hex value.`);
  }
  return normalized;
};
const normalizeAddress = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized) || /^0x0{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a non-zero EVM address.`);
  }
  return normalized;
};

const secretLikeTextReason = (value, pathName) => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    BSC_RUNTIME_ROUTE_REPORT_SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    BSC_RUNTIME_ROUTE_REPORT_SECRET_VALUE_PATTERN.test(normalized)
  ) {
    return `${pathName} contains secret-like material`;
  }
  const words = normalized.toLowerCase().split(" ");
  if (
    BIP39_WORD_COUNTS.has(words.length) &&
    validateMnemonic(words.join(" "), wordlist)
  ) {
    return `${pathName} contains secret-like material`;
  }
  return "";
};

const unsafeRouteReportSecretReason = (
  value,
  pathName = "route report",
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
      const reason = unsafeRouteReportSecretReason(
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
  for (const [key, child] of ownRecordEntries(value)) {
    if (BSC_RUNTIME_ROUTE_REPORT_SECRET_KEY_PATTERN.test(key)) {
      return `${pathName} contains secret-like material`;
    }
    const reason = unsafeRouteReportSecretReason(
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

const diagnosticRouteReportReason = (
  value,
  pathName = "route report",
  seen = new WeakSet(),
) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = diagnosticRouteReportReason(
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
  for (const [key, child] of ownRecordEntries(value)) {
    if (DIAGNOSTIC_FLAG_KEYS.has(key) && child === true) {
      return `${pathName}.${key}=true`;
    }
    if (DIAGNOSTIC_TEXT_KEYS.has(key) && diagnosticTextValue(child)) {
      return `${pathName}.${key} mentions diagnostic verifier material`;
    }
    const reason = diagnosticRouteReportReason(
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

const pickVerifierField = (record, names) => {
  for (const name of names) {
    if (hasOwn(record, name)) {
      return ownValue(record, name);
    }
  }
  return undefined;
};

const NATIVE_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_ALIASES = Object.freeze([
  "verifierKeyArtifactHash",
  "verifier_key_artifact_hash",
]);

const requireExplicitNativeBundleVerifierKeyArtifactHash = (
  nativeBundleJson,
  direction,
) => {
  const present = NATIVE_BUNDLE_VERIFIER_KEY_ARTIFACT_HASH_ALIASES.filter(
    (name) => hasOwn(nativeBundleJson, name),
  );
  if (present.length === 0) {
    throw new Error(
      `${direction} native prover bundle verifierKeyArtifactHash is required.`,
    );
  }
  if (present.length > 1) {
    throw new Error(
      `${direction} native prover bundle verifierKeyArtifactHash must not use multiple aliases.`,
    );
  }
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

const normalizeVerifierVector = (record, names, expectedLength) => {
  const value = pickVerifierField(record, names);
  if (!Array.isArray(value)) {
    throw new Error("missing vector");
  }
  assertDenseDataArray(value, names[0]);
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

const invalidBn254VerifierMaterialReason = (value, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of ownArrayValues(value)) {
      const reason = invalidBn254VerifierMaterialReason(entry, seen);
      if (reason) {
        return reason;
      }
    }
    return "";
  }
  if (recordCarriesVerifierMaterial(value)) {
    try {
      assertBn254VerifierMaterial(value);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return `route report carries invalid BN254 verifier material: ${detail}`;
    }
  }
  for (const [, child] of ownRecordEntries(value)) {
    const reason = invalidBn254VerifierMaterialReason(child, seen);
    if (reason) {
      return reason;
    }
  }
  return "";
};

const diagnosticVerifierKeyHashReason = (value, seen = new WeakSet()) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of ownArrayValues(value)) {
      const reason = diagnosticVerifierKeyHashReason(entry, seen);
      if (reason) {
        return reason;
      }
    }
    return "";
  }
  for (const [key, child] of ownRecordEntries(value)) {
    if (
      VERIFIER_KEY_HASH_ALIASES.has(key) &&
      DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(trim(child).toLowerCase())
    ) {
      return "route report carries a known diagnostic BSC verifier key hash";
    }
    const reason = diagnosticVerifierKeyHashReason(child, seen);
    if (reason) {
      return reason;
    }
  }
  return "";
};

const isLoopbackModuleHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeUrlCharacter = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const hasParentDirectorySegment = (value) => {
  let normalized = value.replace(/\\/gu, "/");
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
  // Values that are still changing after several decode passes are
  // intentionally treated as unsafe instead of guessing how many layers an
  // intermediary might decode.
  return true;
};

export const normalizeBscRuntimeProverMaterialUrl = (value, label) => {
  const materialUrl = trim(value);
  if (!materialUrl) {
    throw new Error(`${label} is required.`);
  }
  if (hasUnsafeUrlCharacter(materialUrl)) {
    throw new Error(
      `${label} must not contain whitespace or control characters.`,
    );
  }
  if (/[?#]/u.test(materialUrl)) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (hasParentDirectorySegment(materialUrl)) {
    throw new Error(`${label} must not include parent directory segments.`);
  }
  if (/^(?:\/(?!\/)|\.\/)/u.test(materialUrl)) {
    return materialUrl;
  }
  let parsed;
  try {
    parsed = new URL(materialUrl);
  } catch (_error) {
    throw new Error(
      `${label} must be a public path, package-relative path, HTTPS URL, or loopback HTTP URL.`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (parsed.protocol === "https:") {
    return parsed.toString();
  }
  if (parsed.protocol === "http:" && isLoopbackModuleHost(parsed.hostname)) {
    return parsed.toString();
  }
  throw new Error(
    `${label} must be a public path, package-relative path, HTTPS URL, or loopback HTTP URL.`,
  );
};

const localPathForMaterialUrl = (materialUrl, outputPath, root = repoRoot) => {
  const normalized = normalizeBscRuntimeProverMaterialUrl(
    materialUrl,
    "BSC runtime material URL",
  );
  const resolvedRoot = path.resolve(root);
  if (normalized.startsWith("/")) {
    const allowedRoot = path.join(resolvedRoot, "public");
    return {
      allowedRoot,
      localPath: path.join(allowedRoot, normalized.replace(/^\/+/u, "")),
      scopeLabel: "public/",
    };
  }
  if (normalized.startsWith("./")) {
    const allowedRoot = path.dirname(path.resolve(outputPath));
    return {
      allowedRoot,
      localPath: path.resolve(allowedRoot, normalized),
      scopeLabel: "runtime config directory",
    };
  }
  return null;
};

const resolveSafeLocalMaterialPath = async (target, normalizedUrl, label) => {
  let info;
  try {
    info = await lstat(target.localPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `${label} ${normalizedUrl} does not exist at ${target.localPath}.`,
      );
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`${label} ${normalizedUrl} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} ${normalizedUrl} must be a regular file.`);
  }
  const [allowedRoot, resolvedPath] = await Promise.all([
    realpath(target.allowedRoot),
    realpath(target.localPath),
  ]);
  if (!isPathInside(allowedRoot, resolvedPath)) {
    throw new Error(
      `${label} ${normalizedUrl} resolves outside ${target.scopeLabel}.`,
    );
  }
  return resolvedPath;
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

const readMaterialBytes = async ({
  materialUrl,
  label,
  outputPath,
  root = repoRoot,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  maxBytes = 512 * 1024 * 1024,
  expectedExtension = "",
}) => {
  const normalizedUrl = normalizeBscRuntimeProverMaterialUrl(
    materialUrl,
    label,
  );
  if (
    expectedExtension &&
    extensionFromRuntimeMaterialUrl(normalizedUrl, label) !== expectedExtension
  ) {
    throw new Error(
      `${label} must be loaded from a ${expectedExtension} artifact URL.`,
    );
  }
  const localPath = localPathForMaterialUrl(normalizedUrl, outputPath, root);
  if (localPath) {
    const safePath = await resolveSafeLocalMaterialPath(
      localPath,
      normalizedUrl,
      label,
    );
    const info = await lstat(safePath);
    if (info.size > maxBytes) {
      throw new Error(`${label} ${normalizedUrl} is too large.`);
    }
    const bytes = await readFile(safePath);
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} ${normalizedUrl} is too large.`);
    }
    return { url: normalizedUrl, bytes, sha256: sha256Hex(bytes) };
  }

  if (typeof fetchImpl !== "function") {
    throw new Error(`${label} ${normalizedUrl} cannot be fetched.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(normalizedUrl, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = await readRemoteResponseBytesBounded(
      response,
      `${label} ${normalizedUrl}`,
      maxBytes,
    );
    return { url: normalizedUrl, bytes, sha256: sha256Hex(bytes) };
  } catch (error) {
    throw new Error(
      `${label} ${normalizedUrl} could not be fetched: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
};

const artifactBaseUrlFromBundleUrl = (bundleUrl) => {
  const normalized = normalizeBscRuntimeProverMaterialUrl(
    bundleUrl,
    "native prover bundle URL",
  );
  if (normalized.startsWith("/")) {
    const slashIndex = normalized.lastIndexOf("/");
    return `${normalized.slice(0, slashIndex + 1)}`;
  }
  if (normalized.startsWith("./")) {
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex < 2 ? "./" : `${normalized.slice(0, slashIndex + 1)}`;
  }
  return new URL("./", normalized).toString();
};

const populatedInputAliases = (input, aliases) =>
  aliases.filter(
    (key) =>
      typeof ownValue(input, key) === "string" && ownValue(input, key).trim(),
  );

const optionalDirectionInputValue = (input, direction, canonicalName) => {
  const aliases = {
    nativeProverArtifactBaseUrl: [
      `${direction}NativeProverArtifactBaseUrl`,
      `${direction}NativeProverBaseUrl`,
      `${direction}_native_prover_artifact_base_url`,
      `${direction}_native_prover_base_url`,
      `${direction}-native-prover-artifact-base-url`,
      `${direction}-native-prover-base-url`,
      "nativeProverArtifactBaseUrl",
      "nativeProverBaseUrl",
      "native_prover_artifact_base_url",
      "native_prover_base_url",
      "native-prover-artifact-base-url",
      "native-prover-base-url",
      "artifactBaseUrl",
      "artifact_base_url",
      "artifact-base-url",
    ],
  }[canonicalName];
  const present = populatedInputAliases(input, aliases ?? []);
  if (present.length > 1) {
    throw new Error(
      `${direction}.${canonicalName} must not use multiple aliases: ${present.join(", ")}.`,
    );
  }
  return present.length === 1 ? ownValue(input, present[0]).trim() : "";
};

const normalizeNativeBundleArtifactPath = (value, label) => {
  const artifactPath = trim(value);
  if (!artifactPath) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (
    artifactPath.startsWith("/") ||
    artifactPath.includes("\\") ||
    /[?#]/u.test(artifactPath)
  ) {
    throw new Error(`${label} must be a relative POSIX path.`);
  }
  if (hasUnsafeUrlCharacter(artifactPath)) {
    throw new Error(
      `${label} must not contain whitespace or control characters.`,
    );
  }
  if (hasParentDirectorySegment(artifactPath)) {
    throw new Error(
      `${label} must stay under the native prover artifact base URL.`,
    );
  }
  const segments = artifactPath.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      `${label} must stay under the native prover artifact base URL.`,
    );
  }
  return artifactPath;
};

const joinNativeProverArtifactUrl = (baseUrl, artifactPath, label) => {
  const normalizedBase = normalizeBscRuntimeProverMaterialUrl(baseUrl, label);
  const normalizedPath = normalizeNativeBundleArtifactPath(
    artifactPath,
    `${label} artifact path`,
  );
  if (normalizedBase.startsWith("/")) {
    return `${normalizedBase.replace(/\/?$/u, "/")}${normalizedPath}`;
  }
  if (normalizedBase.startsWith("./")) {
    return `${normalizedBase.replace(/\/?$/u, "/")}${normalizedPath}`;
  }
  return new URL(
    normalizedPath,
    normalizedBase.replace(/\/?$/u, "/"),
  ).toString();
};

const verifyRuntimeNativeBundleArtifacts = async ({
  direction,
  nativeBundle,
  bscProfile = resolveBscNetworkProfile("testnet"),
  nativeProverArtifactBaseUrl,
  proofArtifact,
  provingKey,
  verifierKey,
  outputPath,
  root,
  fetchImpl,
  timeoutMs,
}) => {
  const verifiedSdks = [];
  for (const sdkArtifact of nativeBundle.nativeSdkArtifacts) {
    const verifyBundleArtifacts =
      bscProfile.key === "mainnet"
        ? verifyBscMainnetNativeEvmProverArtifactsFromBundle
        : verifyBscTestnetNativeEvmProverArtifactsFromBundle;
    const result = await verifyBundleArtifacts(
      {
        nativeProverBundle: nativeBundle,
        sdk: sdkArtifact.sdk,
        artifactResolver(pathName, metadata = {}) {
          if (pathName === nativeBundle.proofArtifact) {
            return proofArtifact.bytes;
          }
          if (pathName === nativeBundle.provingKey) {
            return provingKey.bytes;
          }
          if (pathName === nativeBundle.verifierKey) {
            return verifierKey.bytes;
          }
          return readMaterialBytes({
            materialUrl: joinNativeProverArtifactUrl(
              nativeProverArtifactBaseUrl,
              pathName,
              `${direction} ${metadata.label ?? "native prover artifact"}`,
            ),
            label: `${direction} ${metadata.label ?? "native prover artifact"}`,
            outputPath,
            root,
            fetchImpl,
            timeoutMs,
            maxBytes: SCCP_BSC_RUNTIME_NATIVE_ARTIFACT_MAX_BYTES,
          }).then((entry) => entry.bytes);
        },
      },
      {
        expectedDestinationBindingHash: nativeBundle.destinationBindingHash,
      },
    );
    verifiedSdks.push(result.sdk);
  }
  return verifiedSdks;
};

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
    return ["route report checks are missing or invalid"];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of ownArrayIndexedValues(checks)) {
    if (!isRecord(entry)) {
      problems.push(`route report check ${index} is not an object`);
      continue;
    }
    const id = trim(ownValue(entry, "id"));
    const label = id || `index ${index}`;
    if (!id) {
      problems.push(`route report check ${index} id is missing`);
    } else if (seen.has(id)) {
      problems.push(`route report check id ${id} is duplicated`);
    } else {
      seen.add(id);
    }
    const ok = ownValue(entry, "ok");
    const hasOk = typeof ok === "boolean";
    const status = trim(ownValue(entry, "status")).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `route report check ${label} has no machine-readable pass/fail state`,
      );
    }
    if (hasOk && hasStatus && ok !== (status === "pass")) {
      problems.push(`route report check ${label} has contradictory ok/status`);
    }
  }
  return problems;
};

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

const forbiddenBscDeploymentAliasProblems = (deployment) => {
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
            `${key} must not use TRON aliases on BSC route reports: ${present.join(", ")}`,
          ]
        : [];
    },
  );
};

const collectPublicRouteDeployment = (routeReport) => {
  const deployment = ownValue(routeReport, "deployment");
  if (!isRecord(deployment)) {
    return {
      deployment: null,
      problems: ["route report deployment is missing"],
    };
  }
  const problems = forbiddenBscDeploymentAliasProblems(deployment);
  const readField = (key, normalize, label = key) => {
    try {
      return normalize(ownValue(deployment, key), label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(message.trim().replace(/\.+$/u, ""));
      return null;
    }
  };
  const routeDeployment = {
    bridgeAddress: readField("bridgeAddress", normalizeAddress),
    tokenAddress: readField("tokenAddress", normalizeAddress),
    sourceBridgeAddress: readField("sourceBridgeAddress", normalizeAddress),
    verifierAddress: readField("verifierAddress", normalizeAddress),
    verifierCodeHash: readField("verifierCodeHash", normalizeHex32),
    verifierKeyHash: readField("verifierKeyHash", normalizeHex32),
    proofArtifactHash: readField("proofArtifactHash", normalizeHex32),
    provingKeyHash: readField("provingKeyHash", normalizeHex32),
    nativeEvmProverBundleHash: readField(
      "nativeEvmProverBundleHash",
      normalizeHex32,
    ),
    destinationBindingHash: readField("destinationBindingHash", normalizeHex32),
  };
  return {
    deployment: problems.length === 0 ? routeDeployment : null,
    problems,
  };
};

const assertRouteReportReady = (
  routeReport,
  bscProfile = resolveBscNetworkProfile("testnet"),
) => {
  if (!isRecord(routeReport)) {
    throw new Error("route report must be a JSON object.");
  }
  const routeReportRecord = ownJsonRecord(routeReport);
  const problems = [];
  const secretReason = unsafeRouteReportSecretReason(routeReportRecord);
  if (secretReason) {
    problems.push("route report contains secret-like material");
  }
  const diagnosticReason = diagnosticRouteReportReason(routeReportRecord);
  if (diagnosticReason) {
    problems.push(
      `route report still carries diagnostic verifier material: ${diagnosticReason}`,
    );
  }
  const invalidVerifierMaterialReason =
    invalidBn254VerifierMaterialReason(routeReport);
  if (invalidVerifierMaterialReason) {
    problems.push(invalidVerifierMaterialReason);
  }
  const diagnosticVerifierHashReason =
    diagnosticVerifierKeyHashReason(routeReportRecord);
  if (diagnosticVerifierHashReason) {
    problems.push(diagnosticVerifierHashReason);
  }
  if (ownValue(routeReportRecord, "ready") !== true) {
    problems.push("route report is not ready");
  }
  if (ownValue(routeReportRecord, "manifestSource") !== "torii") {
    problems.push("route report is not sourced from public TAIRA");
  }
  if (
    ownValue(routeReportRecord, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    ownValue(routeReportRecord, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push("route report is not the TAIRA/BSC XOR route");
  }
  const taira = ownValue(routeReportRecord, "taira");
  const bsc = ownValue(routeReportRecord, "bsc");
  if (
    ownValue(taira, "chainId") !== BSC_TAIRA_CHAIN_ID ||
    ownValue(taira, "networkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
  ) {
    problems.push("route report is not bound to TAIRA");
  }
  if (ownValue(bsc, "network") !== bscProfile.key) {
    problems.push(`route report is not bound to ${bscProfile.label} network`);
  }
  if (ownValue(bsc, "chain") !== bscProfile.chain) {
    problems.push(`route report is not bound to ${bscProfile.label} chain`);
  }
  if (ownValue(bsc, "chainIdHex") !== bscProfile.chainIdHex) {
    problems.push(`route report is not bound to ${bscProfile.label} chain id`);
  }
  if (ownValue(bsc, "networkIdHex") !== bscProfile.networkIdHex) {
    problems.push(
      `route report is not bound to ${bscProfile.label} network id`,
    );
  }
  problems.push(...routeReportCheckIntegrityProblems(routeReport));
  for (const id of requiredBscRouteCheckIds(bscProfile)) {
    if (!routeReportHasPassedCheck(routeReportRecord, id)) {
      problems.push(`${id} preflight check has not passed`);
    }
  }
  const deploymentResult = collectPublicRouteDeployment(routeReportRecord);
  problems.push(...deploymentResult.problems);
  const deployment = deploymentResult.deployment;
  if (deployment) {
    const addresses = [
      deployment.bridgeAddress,
      deployment.tokenAddress,
      deployment.sourceBridgeAddress,
      deployment.verifierAddress,
    ];
    if (new Set(addresses).size !== addresses.length) {
      problems.push("BSC contract addresses must be distinct");
    }
  }
  if (problems.length) {
    throw new Error(
      `Cannot build BSC runtime prover config: ${problems.join("; ")}.`,
    );
  }
  return deployment;
};

const directionInputValue = (input, direction, canonicalName) => {
  const aliases = {
    nativeProverBundleUrl: [
      `${direction}NativeProverBundleUrl`,
      `${direction}_native_prover_bundle_url`,
      `${direction}-native-prover-bundle-url`,
      "nativeProverBundleUrl",
      "native_prover_bundle_url",
      "native-prover-bundle-url",
    ],
    proofArtifactUrl: [
      `${direction}ProofArtifactUrl`,
      `${direction}_proof_artifact_url`,
      `${direction}-proof-artifact-url`,
      "proofArtifactUrl",
      "proof_artifact_url",
      "proof-artifact-url",
    ],
    provingKeyUrl: [
      `${direction}ProvingKeyUrl`,
      `${direction}_proving_key_url`,
      `${direction}-proving-key-url`,
      "provingKeyUrl",
      "proving_key_url",
      "proving-key-url",
    ],
    verifierKeyUrl: [
      `${direction}VerifierKeyUrl`,
      `${direction}_verifier_key_url`,
      `${direction}-verifier-key-url`,
      "verifierKeyUrl",
      "verifier_key_url",
      "verifier-key-url",
    ],
    backendModuleUrl: [
      `${direction}BackendModuleUrl`,
      `${direction}_backend_module_url`,
      `${direction}-backend-module-url`,
      "backendModuleUrl",
      "backend_module_url",
      "backend-module-url",
    ],
  }[canonicalName];
  const present = populatedInputAliases(input, aliases);
  if (present.length > 1) {
    throw new Error(
      `${direction}.${canonicalName} must not use multiple aliases: ${present.join(", ")}.`,
    );
  }
  if (present.length === 1) {
    return ownValue(input, present[0]).trim();
  }
  throw new Error(`${direction}.${canonicalName} is required.`);
};

const assertExpectedHash = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(`${label} ${actual} does not match expected ${expected}.`);
  }
};

const BSC_RUNTIME_DIRECTION_MATERIAL_HASH_FIELDS = Object.freeze([
  Object.freeze({
    key: "nativeProverBundleSha256",
    label: "native prover bundle sha256",
  }),
  Object.freeze({
    key: "nativeEvmProverBundleHash",
    label: "native EVM prover bundle descriptor hash",
  }),
  Object.freeze({ key: "proofArtifactSha256", label: "proof artifact sha256" }),
  Object.freeze({ key: "provingKeySha256", label: "proving key sha256" }),
  Object.freeze({ key: "verifierKeySha256", label: "verifier key sha256" }),
]);

const assertRuntimeDirectionMaterialRoleSeparation = (row, direction) => {
  if (!isRecord(row)) {
    throw new Error(`${direction} runtime prover config is required.`);
  }
  const seen = new Map();
  for (const { key, label } of BSC_RUNTIME_DIRECTION_MATERIAL_HASH_FIELDS) {
    const hashValue = normalizeHex32(
      ownValue(row, key),
      `${direction} ${label}`,
    );
    const role = `${direction} ${label}`;
    const previous = seen.get(hashValue);
    if (previous) {
      throw new Error(
        `BSC runtime prover material hashes must be role-separated: ${role} matches ${previous}.`,
      );
    }
    seen.set(hashValue, role);
  }
};

export const assertBscSccpRuntimeProverConfigMaterialRoleSeparation = (
  config,
) => {
  if (!isRecord(config)) {
    throw new Error("BSC runtime prover config must be a JSON object.");
  }
  const configRecord = ownJsonRecord(config);
  assertRuntimeDirectionMaterialRoleSeparation(
    ownValue(configRecord, "destination"),
    "destination",
  );
  assertRuntimeDirectionMaterialRoleSeparation(
    ownValue(configRecord, "source"),
    "source",
  );
  return true;
};

const repeatedPrefixPatternLength = (
  bytes,
  maxPatternLength = SCCP_BSC_RUNTIME_PROOF_MAX_REPEATED_PATTERN_BYTES,
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

const dominantByteFrequency = (bytes) => {
  const counts = new Uint32Array(256);
  let byte = 0;
  let count = 0;
  for (const entry of bytes) {
    counts[entry] += 1;
    if (counts[entry] > count) {
      byte = entry;
      count = counts[entry];
    }
  }
  return { byte, count };
};

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

const bytePrefixMatches = (bytes, prefix) =>
  prefix.every((byte, index) => bytes[index] === byte);

const extensionFromRuntimeMaterialUrl = (url, label) => {
  let pathname = "";
  try {
    pathname = new URL(url, "https://sccp.invalid/").pathname;
  } catch (error) {
    throw new Error(
      `${label} URL is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const name = pathname.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
};

const R1CS_REQUIRED_SECTION_IDS = Object.freeze([1, 2, 3]);
const ZKEY_REQUIRED_SECTION_IDS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

const assertSnarkjsBinaryHeader = (
  entry,
  label,
  magic,
  formatLabel,
  requiredSectionIds,
) => {
  const bytes = entry.bytes;
  if (bytes.byteLength < 12) {
    throw new Error(`${label} ${formatLabel} header is truncated.`);
  }
  if (!bytePrefixMatches(bytes, magic)) {
    throw new Error(`${label} must start with ${formatLabel} magic bytes.`);
  }
  const version = u32le(bytes, 4);
  const sectionCount = u32le(bytes, 8);
  if (version < 1 || version > 2) {
    throw new Error(`${label} ${formatLabel} header version is invalid.`);
  }
  if (sectionCount < 1 || sectionCount > 128) {
    throw new Error(`${label} ${formatLabel} section count is invalid.`);
  }
  let offset = 12;
  const sectionIds = new Set();
  const sectionIdList = [];
  for (let index = 0; index < sectionCount; index += 1) {
    if (offset + 12 > bytes.byteLength) {
      throw new Error(`${label} ${formatLabel} section table is truncated.`);
    }
    const sectionId = u32le(bytes, offset);
    const sectionSize = u64leSafe(bytes, offset + 4);
    offset += 12;
    if (sectionId === 0) {
      throw new Error(`${label} ${formatLabel} section id must be non-zero.`);
    }
    if (sectionIds.has(sectionId)) {
      throw new Error(`${label} ${formatLabel} section ids must be unique.`);
    }
    sectionIds.add(sectionId);
    sectionIdList.push(sectionId);
    if (sectionSize === null || sectionSize <= 0) {
      throw new Error(`${label} ${formatLabel} section size is invalid.`);
    }
    if (sectionSize > bytes.byteLength - offset) {
      throw new Error(`${label} ${formatLabel} section exceeds file size.`);
    }
    offset += sectionSize;
  }
  if (offset !== bytes.byteLength) {
    throw new Error(
      `${label} ${formatLabel} section table does not consume the full file.`,
    );
  }
  const missingSectionIds = requiredSectionIds.filter(
    (sectionId) => !sectionIds.has(sectionId),
  );
  if (missingSectionIds.length > 0) {
    throw new Error(
      `${label} ${formatLabel} missing required section ids: ${missingSectionIds.join(", ")}.`,
    );
  }
  const unexpectedSectionIds = [...sectionIds].filter(
    (sectionId) => !requiredSectionIds.includes(sectionId),
  );
  if (unexpectedSectionIds.length > 0) {
    throw new Error(
      `${label} ${formatLabel} contains unsupported section ids: ${unexpectedSectionIds.join(", ")}.`,
    );
  }
  const canonicalOrder = requiredSectionIds.every(
    (sectionId, index) => sectionIdList[index] === sectionId,
  );
  if (sectionIdList.length !== requiredSectionIds.length || !canonicalOrder) {
    throw new Error(
      `${label} ${formatLabel} section ids must be in canonical order: ${requiredSectionIds.join(", ")}.`,
    );
  }
};

const assertRuntimeProofMaterialFormat = (entry, label, kind) => {
  const extension = extensionFromRuntimeMaterialUrl(entry.url, label);
  if (kind === "proof-artifact") {
    if (extension === ".r1cs") {
      assertSnarkjsBinaryHeader(
        entry,
        label,
        [0x72, 0x31, 0x63, 0x73],
        ".r1cs",
        R1CS_REQUIRED_SECTION_IDS,
      );
      return;
    }
    throw new Error(`${label} must be loaded from a .r1cs artifact URL.`);
  }
  if (kind === "proving-key") {
    if (extension === ".zkey") {
      assertSnarkjsBinaryHeader(
        entry,
        label,
        [0x7a, 0x6b, 0x65, 0x79],
        ".zkey",
        ZKEY_REQUIRED_SECTION_IDS,
      );
      return;
    }
    throw new Error(`${label} must be loaded from a .zkey artifact URL.`);
  }
};

const assertRuntimeProofMaterialShape = (entry, label, kind) => {
  const bytes = entry.bytes;
  if (bytes.byteLength < SCCP_BSC_RUNTIME_PROOF_SHAPE_MIN_BYTES) {
    return;
  }
  const repeatedPatternLength = repeatedPrefixPatternLength(bytes);
  if (repeatedPatternLength > 0) {
    throw new Error(
      `${label} looks like placeholder proof material: repeated ${repeatedPatternLength}-byte pattern.`,
    );
  }
  const arithmeticDelta = constantByteDelta(bytes);
  if (arithmeticDelta !== null) {
    throw new Error(
      `${label} looks like placeholder proof material: arithmetic byte sequence with step ${arithmeticDelta}.`,
    );
  }
  const dominant = dominantByteFrequency(bytes);
  if (dominant.count / bytes.byteLength > 0.98) {
    throw new Error(
      `${label} looks like placeholder proof material: byte 0x${dominant.byte
        .toString(16)
        .padStart(
          2,
          "0",
        )} dominates ${dominant.count} of ${bytes.byteLength} bytes.`,
    );
  }
  const uniqueBytes = new Set();
  for (const byte of bytes) {
    uniqueBytes.add(byte);
    if (uniqueBytes.size >= SCCP_BSC_RUNTIME_PROOF_MIN_UNIQUE_BYTES) {
      break;
    }
  }
  if (uniqueBytes.size >= SCCP_BSC_RUNTIME_PROOF_MIN_UNIQUE_BYTES) {
    assertRuntimeProofMaterialFormat(entry, label, kind);
    return;
  }
  throw new Error(
    `${label} looks like placeholder proof material: only ${uniqueBytes.size} unique byte values across ${bytes.byteLength} bytes.`,
  );
};

const assertRuntimeBackendExports = (bytes, direction) => {
  const acceptedExports = BSC_RUNTIME_BACKEND_EXPORTS[direction] ?? [];
  const acceptedSelfTestExports =
    BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS[direction] ?? [];
  const importProblem = selfContainedRuntimeBackendProblem(bytes, direction);
  if (importProblem) {
    throw new Error(importProblem);
  }
  try {
    const proofInspection = assertBscSccpBrowserProverModuleExports(
      bytes,
      acceptedExports,
      `${direction} backend module`,
    );
    const selfTestInspection = assertBscSccpBrowserProverModuleExports(
      bytes,
      acceptedSelfTestExports,
      `${direction} backend module native self-test`,
    );
    return {
      acceptedExport:
        acceptedExports.find((name) =>
          proofInspection.callableExports.includes(name),
        ) ?? null,
      acceptedSelfTestExport:
        acceptedSelfTestExports.find((name) =>
          selfTestInspection.callableExports.includes(name),
        ) ?? null,
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `${direction} backend module must export one of: ${acceptedExports.join(", ")}.`,
    );
  }
};

const selfContainedRuntimeBackendProblem = (bytes, direction) => {
  const label = `${direction} backend module`;
  const text = Buffer.from(bytes ?? []).toString("utf8");
  const sourceFile = ts.createSourceFile(
    `${direction}-bsc-runtime-backend.js`,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    return null;
  }
  let problem = "";
  const visit = (node) => {
    if (problem) {
      return;
    }
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      problem = `${label} must be self-contained and must not import other modules.`;
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      problem = `${label} must be self-contained and must not re-export other modules.`;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      problem = `${label} must be self-contained and must not dynamically import other modules.`;
      return;
    }
    if (
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      problem = `${label} must be self-contained and must not use import metadata.`;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return problem || null;
};

const buildRuntimeDirectionConfig = async ({
  direction,
  input,
  routeDeployment,
  bscProfile = resolveBscNetworkProfile("testnet"),
  outputPath,
  root,
  fetchImpl,
  timeoutMs,
}) => {
  const directionInput = ownJsonRecord(input);
  const nativeProverBundle = await readMaterialBytes({
    materialUrl: directionInputValue(
      directionInput,
      direction,
      "nativeProverBundleUrl",
    ),
    label: `${direction} native prover bundle`,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
    maxBytes: SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES,
    expectedExtension: ".json",
  });
  let nativeBundleJson;
  try {
    nativeBundleJson = parseJsonWithoutDuplicateKeys(
      nativeProverBundle.bytes.toString("utf8"),
      `${direction} native prover bundle`,
    );
  } catch (error) {
    throw new Error(
      `${direction} native prover bundle must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  requireExplicitNativeBundleVerifierKeyArtifactHash(
    nativeBundleJson,
    direction,
  );
  const validateBundle =
    bscProfile.key === "mainnet"
      ? validateBscMainnetNativeEvmProverBundle
      : validateBscTestnetNativeEvmProverBundle;
  const nativeBundle = validateBundle(nativeBundleJson, {
    expectedDestinationBindingHash: routeDeployment.destinationBindingHash,
  });
  const nativeEvmProverBundleHash =
    canonicalBscNativeEvmProverBundleHash(nativeBundle);
  if (nativeBundle.proofArtifactHash !== routeDeployment.proofArtifactHash) {
    throw new Error(
      `${direction} native prover bundle proofArtifactHash does not match public route deployment.`,
    );
  }
  if (nativeBundle.provingKeyHash !== routeDeployment.provingKeyHash) {
    throw new Error(
      `${direction} native prover bundle provingKeyHash does not match public route deployment.`,
    );
  }
  if (nativeBundle.verifierKeyHash !== routeDeployment.verifierKeyHash) {
    throw new Error(
      `${direction} native prover bundle verifierKeyHash does not match public route deployment.`,
    );
  }
  if (nativeBundle.verifierKeyArtifactHash === nativeBundle.verifierKeyHash) {
    throw new Error(
      `${direction} native prover bundle verifierKeyArtifactHash must be role-separated from verifierKeyHash.`,
    );
  }
  if (nativeEvmProverBundleHash !== routeDeployment.nativeEvmProverBundleHash) {
    throw new Error(
      `${direction} native prover bundle descriptor hash does not match public route deployment.`,
    );
  }
  const nativeProverArtifactBaseUrl = normalizeBscRuntimeProverMaterialUrl(
    optionalDirectionInputValue(
      directionInput,
      direction,
      "nativeProverArtifactBaseUrl",
    ) || artifactBaseUrlFromBundleUrl(nativeProverBundle.url),
    `${direction} native prover artifact base URL`,
  );

  const proofArtifact = await readMaterialBytes({
    materialUrl: directionInputValue(
      directionInput,
      direction,
      "proofArtifactUrl",
    ),
    label: `${direction} proof artifact`,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  if (proofArtifact.bytes.byteLength < SCCP_BSC_RUNTIME_PROOF_FILE_MIN_BYTES) {
    throw new Error(`${direction} proof artifact is too small.`);
  }
  assertRuntimeProofMaterialShape(
    proofArtifact,
    `${direction} proof artifact`,
    "proof-artifact",
  );
  assertExpectedHash(
    proofArtifact.sha256,
    nativeBundle.proofArtifactHash,
    `${direction} proof artifact sha256`,
  );

  const provingKey = await readMaterialBytes({
    materialUrl: directionInputValue(
      directionInput,
      direction,
      "provingKeyUrl",
    ),
    label: `${direction} proving key`,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  if (provingKey.bytes.byteLength < SCCP_BSC_RUNTIME_PROOF_FILE_MIN_BYTES) {
    throw new Error(`${direction} proving key is too small.`);
  }
  assertRuntimeProofMaterialShape(
    provingKey,
    `${direction} proving key`,
    "proving-key",
  );
  assertExpectedHash(
    provingKey.sha256,
    nativeBundle.provingKeyHash,
    `${direction} proving key sha256`,
  );

  const verifierKey = await readMaterialBytes({
    materialUrl: directionInputValue(
      directionInput,
      direction,
      "verifierKeyUrl",
    ),
    label: `${direction} verifier key`,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
    maxBytes: SCCP_BSC_RUNTIME_PROVER_CONFIG_MAX_BYTES,
  });
  assertExpectedHash(
    verifierKey.sha256,
    nativeBundle.verifierKeyArtifactHash,
    `${direction} verifier key sha256`,
  );

  const backendModule = await readMaterialBytes({
    materialUrl: directionInputValue(
      directionInput,
      direction,
      "backendModuleUrl",
    ),
    label: `${direction} backend module`,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
    maxBytes: SCCP_BSC_RUNTIME_BACKEND_MAX_BYTES,
  });
  if (backendModule.bytes.byteLength < SCCP_BSC_RUNTIME_BACKEND_MIN_BYTES) {
    throw new Error(`${direction} backend module is too small.`);
  }
  const backendShape = validateBscSccpBrowserProverModuleBytes(
    backendModule.bytes,
    `${direction} backend module`,
  );
  if (!backendShape.ok) {
    throw new Error(backendShape.detail);
  }
  const backendExports = assertRuntimeBackendExports(
    backendModule.bytes,
    direction,
  );
  const nativeProverVerifiedSdks = await verifyRuntimeNativeBundleArtifacts({
    direction,
    nativeBundle,
    nativeProverArtifactBaseUrl,
    proofArtifact,
    provingKey,
    verifierKey,
    bscProfile,
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
  });

  return {
    nativeProverBundleUrl: nativeProverBundle.url,
    nativeProverArtifactBaseUrl,
    nativeProverBundleSha256: nativeProverBundle.sha256,
    nativeEvmProverBundleHash,
    nativeProverVerifiedSdks,
    proofArtifactUrl: proofArtifact.url,
    proofArtifactSha256: proofArtifact.sha256,
    provingKeyUrl: provingKey.url,
    provingKeySha256: provingKey.sha256,
    verifierKeyUrl: verifierKey.url,
    verifierKeySha256: verifierKey.sha256,
    backendModuleUrl: backendModule.url,
    backendModuleSha256: backendModule.sha256,
    backendSelfContained: true,
    backendAcceptedExport: backendExports.acceptedExport,
    backendAcceptedSelfTestExport: backendExports.acceptedSelfTestExport,
  };
};

export const buildBscSccpRuntimeProverConfig = async (input = {}) => {
  const routeReport = ownValue(input, "routeReport");
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const destination = ownValue(input, "destination") ?? {};
  const source = ownValue(input, "source") ?? {};
  const outputPath = ownValue(input, "outputPath");
  const root = ownValue(input, "root") ?? repoRoot;
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const resolvedOutputPath = resolveBscRuntimeProverConfigOutputPath(
    outputPath,
    { root },
  );
  const routeDeployment = assertRouteReportReady(routeReport, bscProfile);
  const destinationConfig = await buildRuntimeDirectionConfig({
    direction: "destination",
    input: destination,
    routeDeployment,
    bscProfile,
    outputPath: resolvedOutputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  const sourceConfig = await buildRuntimeDirectionConfig({
    direction: "source",
    input: source,
    routeDeployment,
    bscProfile,
    outputPath: resolvedOutputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  const config = {
    schema: SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    tairaChainId: BSC_TAIRA_CHAIN_ID,
    tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    bscNetwork: bscProfile.key,
    bscChain: bscProfile.chain,
    bscChainIdHex: bscProfile.chainIdHex,
    bscNetworkIdHex: bscProfile.networkIdHex,
    destination: destinationConfig,
    source: sourceConfig,
  };
  assertBscSccpRuntimeProverConfigMaterialRoleSeparation(config);
  return config;
};

export const validateBscSccpRuntimeProverConfig = async (input = {}) => {
  const config = ownValue(input, "config");
  const routeReport = ownValue(input, "routeReport");
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const outputPath = ownValue(input, "outputPath");
  const root = ownValue(input, "root") ?? repoRoot;
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  if (!isRecord(config)) {
    throw new Error("BSC runtime prover config must be a JSON object.");
  }
  const configRecord = ownJsonRecord(config);
  if (
    ownValue(configRecord, "schema") !== SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA
  ) {
    throw new Error(
      `BSC runtime prover config schema must be ${SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA}.`,
    );
  }
  assertBscSccpRuntimeProverConfigMaterialRoleSeparation(configRecord);
  const rebuilt = await buildBscSccpRuntimeProverConfig({
    routeReport,
    bscNetwork,
    destination: ownValue(configRecord, "destination"),
    source: ownValue(configRecord, "source"),
    outputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  if (JSON.stringify(configRecord) !== JSON.stringify(rebuilt)) {
    throw new Error(
      "BSC runtime prover config is not canonical for the supplied route and artifacts.",
    );
  }
  return rebuilt;
};

export const writeBscSccpRuntimeProverConfig = async (input = {}) => {
  const routeReport = ownValue(input, "routeReport");
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const destination = ownValue(input, "destination");
  const source = ownValue(input, "source");
  const outputPath = ownValue(input, "outputPath");
  const root = ownValue(input, "root") ?? repoRoot;
  const fetchImpl = ownValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = ownValue(input, "timeoutMs") ?? 10_000;
  const resolvedOutputPath = resolveBscRuntimeProverConfigOutputPath(
    outputPath,
    { root },
  );
  const config = await buildBscSccpRuntimeProverConfig({
    routeReport,
    bscNetwork,
    destination,
    source,
    outputPath: resolvedOutputPath,
    root,
    fetchImpl,
    timeoutMs,
  });
  await writeJsonReportFile(resolvedOutputPath, config);
  return {
    config,
    outputPath: resolvedOutputPath,
    publicUrl: DEFAULT_CONFIG_PUBLIC_URL,
  };
};

const BSC_RUNTIME_PROVER_CONFIG_CLI_OPTIONS = new Set([
  "route-report",
  "manifest-file",
  "torii-url",
  "bsc-network",
  "bsc-rpc-url",
  "allow-local-rpc",
  "check-bsc-contracts",
  "destination-native-prover-bundle-url",
  "destination-native-prover-artifact-base-url",
  "destination-native-prover-base-url",
  "destination-proof-artifact-url",
  "destination-proving-key-url",
  "destination-verifier-key-url",
  "destination-backend-module-url",
  "source-native-prover-bundle-url",
  "source-native-prover-artifact-base-url",
  "source-native-prover-base-url",
  "source-proof-artifact-url",
  "source-proving-key-url",
  "source-verifier-key-url",
  "source-backend-module-url",
  "native-prover-bundle-url",
  "native-prover-artifact-base-url",
  "native-prover-base-url",
  "artifact-base-url",
  "proof-artifact-url",
  "proving-key-url",
  "verifier-key-url",
  "backend-module-url",
  "out",
  "timeout-ms",
]);

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!BSC_RUNTIME_PROVER_CONFIG_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC runtime prover config options.`,
      );
    }
    const next = argv[index + 1];
    const value = !next || next.startsWith("--") ? "true" : next;
    if (args[key] === undefined) {
      args[key] = value;
    } else {
      throw new Error(
        `Duplicate option: --${key}. Repeatable options are documented in --help.`,
      );
    }
    if (value === next) {
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

const assertBscRuntimeProverCliAliasConflicts = (args) => {
  assertNoCliAliasConflicts(args, "BSC route evidence source", [
    "route-report",
    "manifest-file",
  ]);
  for (const direction of ["destination", "source"]) {
    assertNoCliAliasConflicts(args, `${direction} native prover bundle URL`, [
      `${direction}-native-prover-bundle-url`,
      "native-prover-bundle-url",
    ]);
    assertNoCliAliasConflicts(
      args,
      `${direction} native prover artifact base URL`,
      [
        `${direction}-native-prover-artifact-base-url`,
        `${direction}-native-prover-base-url`,
        "native-prover-artifact-base-url",
        "native-prover-base-url",
        "artifact-base-url",
      ],
    );
    assertNoCliAliasConflicts(args, `${direction} proof artifact URL`, [
      `${direction}-proof-artifact-url`,
      "proof-artifact-url",
    ]);
    assertNoCliAliasConflicts(args, `${direction} proving key URL`, [
      `${direction}-proving-key-url`,
      "proving-key-url",
    ]);
    assertNoCliAliasConflicts(args, `${direction} verifier key URL`, [
      `${direction}-verifier-key-url`,
      "verifier-key-url",
    ]);
    assertNoCliAliasConflicts(args, `${direction} backend module URL`, [
      `${direction}-backend-module-url`,
      "backend-module-url",
    ]);
  }
};

const printUsage = () => {
  process.stdout.write(
    `Usage: node scripts/e2e/sccp-bsc-runtime-prover-config.mjs [options]

Generate a route-bound runtime prover config for BSC SCCP browser modules.

Options:
  --route-report PATH
  --manifest-file PATH
  --torii-url URL
  --bsc-network testnet|mainnet
  --bsc-rpc-url URL
  --allow-local-rpc
  --check-bsc-contracts true|false
  --destination-native-prover-bundle-url URL
  --destination-native-prover-artifact-base-url URL
  --destination-native-prover-base-url URL
  --destination-proof-artifact-url URL
  --destination-proving-key-url URL
  --destination-verifier-key-url URL
  --destination-backend-module-url URL
  --source-native-prover-bundle-url URL
  --source-native-prover-artifact-base-url URL
  --source-native-prover-base-url URL
  --source-proof-artifact-url URL
  --source-proving-key-url URL
  --source-verifier-key-url URL
  --source-backend-module-url URL
  --native-prover-bundle-url URL
  --native-prover-artifact-base-url URL
  --native-prover-base-url URL
  --artifact-base-url URL
  --proof-artifact-url URL
  --proving-key-url URL
  --verifier-key-url URL
  --backend-module-url URL
  --out PATH
  --timeout-ms MS
  --help, -h

Environment:
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_TAIRA_TORII_URL
  TAIRA_TORII_URL
  E2E_TORII_URL
  SCCP_BSC_ROUTE_MANIFEST_FILE
  SCCP_ROUTE_MANIFEST_FILE
  SCCP_BSC_RPC_URL
  BSC_RPC_URL
`,
  );
};

const readJsonFile = async (filePath, label) => {
  const resolved = path.resolve(repoRoot, trim(filePath));
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error("must not be a symbolic link");
    }
    if (!info.isFile()) {
      throw new Error("must be a regular file");
    }
    if (info.size > SCCP_BSC_RUNTIME_ROUTE_REPORT_MAX_BYTES) {
      throw new Error(
        `is ${info.size} bytes; maximum allowed is ${SCCP_BSC_RUNTIME_ROUTE_REPORT_MAX_BYTES} bytes`,
      );
    }
    const parsed = parseJsonWithoutDuplicateKeys(
      await readFile(resolved, "utf8"),
      `${label} ${resolved}`,
    );
    if (!isRecord(parsed)) {
      throw new Error("must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `${label} ${resolved} could not be read as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const routeReportFromArgs = async (args, timeoutMs, bscProfile) => {
  if (args["route-report"]) {
    return readJsonFile(args["route-report"], "--route-report");
  }
  return runBscSccpRoutePreflight({
    toriiUrl:
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      process.env.TAIRA_TORII_URL ||
      process.env.E2E_TORII_URL ||
      DEFAULT_BSC_TAIRA_TORII_URL,
    manifestFile:
      args["manifest-file"] ||
      process.env.SCCP_BSC_ROUTE_MANIFEST_FILE ||
      process.env.SCCP_ROUTE_MANIFEST_FILE ||
      undefined,
    bscNetwork: bscProfile.key,
    fetchImpl: globalThis.fetch,
    timeoutMs,
    checkBscContracts:
      args["check-bsc-contracts"] === undefined
        ? true
        : parseBoolean(args["check-bsc-contracts"], "--check-bsc-contracts"),
    bscRpcUrl:
      args["bsc-rpc-url"] ||
      process.env.SCCP_BSC_RPC_URL ||
      process.env.BSC_RPC_URL ||
      bscProfile.rpcUrl,
    allowLocalRpc: parseBoolean(args["allow-local-rpc"], "--allow-local-rpc"),
  });
};

const directionArgs = (args, direction) => ({
  nativeProverBundleUrl:
    args[`${direction}-native-prover-bundle-url`] ||
    args["native-prover-bundle-url"],
  nativeProverArtifactBaseUrl:
    args[`${direction}-native-prover-artifact-base-url`] ||
    args[`${direction}-native-prover-base-url`] ||
    args["native-prover-artifact-base-url"] ||
    args["native-prover-base-url"] ||
    args["artifact-base-url"],
  proofArtifactUrl:
    args[`${direction}-proof-artifact-url`] || args["proof-artifact-url"],
  provingKeyUrl:
    args[`${direction}-proving-key-url`] || args["proving-key-url"],
  verifierKeyUrl:
    args[`${direction}-verifier-key-url`] || args["verifier-key-url"],
  backendModuleUrl:
    args[`${direction}-backend-module-url`] || args["backend-module-url"],
});

const cli = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertBscRuntimeProverCliAliasConflicts(args);
  const timeoutMs = Number(args["timeout-ms"] ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  const bscProfile = resolveBscNetworkProfile(
    args["bsc-network"] ||
      process.env.SCCP_BSC_NETWORK ||
      process.env.VITE_SCCP_BSC_NETWORK ||
      "testnet",
  );
  const routeReport = await routeReportFromArgs(args, timeoutMs, bscProfile);
  const result = await writeBscSccpRuntimeProverConfig({
    routeReport,
    bscNetwork: bscProfile.key,
    destination: directionArgs(args, "destination"),
    source: directionArgs(args, "source"),
    outputPath: args.out,
    timeoutMs,
  });
  process.stdout.write(`${JSON.stringify(result.config, null, 2)}\n`);
  process.stdout.write(
    `\nBSC SCCP runtime prover config: ${result.outputPath}\n`,
  );
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  cli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

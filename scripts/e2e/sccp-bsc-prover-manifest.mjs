#!/usr/bin/env node
/* global globalThis, BigInt */
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  DEFAULT_BSC_TAIRA_TORII_URL,
  SCCP_BSC_REQUIRED_ROUTE_CHECK_IDS,
  resolveBscNetworkProfile,
  requiredBscRouteCheckIds,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  parseJsonWithoutDuplicateKeys,
  runBscSccpRoutePreflight,
} from "./sccp-bsc-route-preflight.mjs";
import {
  BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS,
  BSC_SOURCE_PROVER_SELF_TEST_EXPORTS,
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  validateBscSccpBrowserProverModuleBytes,
  validateBscSccpBrowserProverManifest,
} from "./sccp-bsc-live-smoke-readiness.mjs";
import { normalizeSccpBrowserModuleUrl } from "./sccp-live-smoke-readiness.mjs";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";

const repoRoot = resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCCP_BSC_PROVER_ROUTE_REPORT_MAX_BYTES = 4 * 1024 * 1024;

const trimString = (value) => String(value ?? "").trim();
const hasControlCharacter = (value) => {
  for (const character of String(value ?? "")) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
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
const exportNameInputProblems = (values) => {
  if (values === undefined || values === null) {
    return [];
  }
  if (!Array.isArray(values)) {
    return typeof values === "string"
      ? []
      : ["exportNames must be a string or string array."];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, value] of ownArrayIndexedValues(values)) {
    presentIndexes.add(index);
    if (typeof value !== "string") {
      problems.push(`exportNames ${index} must be a string.`);
    }
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`exportNames ${index} is missing.`);
    }
  }
  return problems;
};
const ownRecordEntries = (record) =>
  isRecord(record)
    ? Object.keys(record).map((key) => [key, ownValue(record, key)])
    : [];
const ownJsonValue = (value, active = new WeakSet()) => {
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
  if (active.has(value)) {
    return undefined;
  }
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const length = Number.isSafeInteger(descriptors.length?.value)
      ? descriptors.length.value
      : 0;
    const clone = new Array(length);
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
      clone[index] = ownJsonValue(descriptor.value, active);
    }
    active.delete(value);
    return clone;
  }
  if (!isRecord(value)) {
    active.delete(value);
    return undefined;
  }
  const clone = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      continue;
    }
    const child = ownJsonValue(descriptor.value, active);
    if (child !== undefined) {
      clone[key] = child;
    }
  }
  active.delete(value);
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
  let decoded = trimString(value);
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

const bscProverManifestOutputPathProblem = (value, label) => {
  const normalized = trimString(value);
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
  const segments = normalized.split("/").filter((segment, index) => {
    return !(index === 0 && segment === "");
  });
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return `${label} must not contain empty, current-directory, or parent-directory segments.`;
  }
  return "";
};

export const resolveBscProverManifestOutputPath = (
  outputPath,
  { root = repoRoot, moduleUrl } = {},
) => {
  const resolvedRoot = path.resolve(root);
  const rawOutputPath = trimString(outputPath);
  const outputProblem = bscProverManifestOutputPathProblem(
    rawOutputPath,
    "BSC prover sidecar output path",
  );
  if (outputProblem) {
    throw new Error(outputProblem);
  }
  const resolvedOutput = rawOutputPath
    ? path.resolve(resolvedRoot, rawOutputPath)
    : defaultBscProverManifestOutputPath(moduleUrl, { root: resolvedRoot });
  if (!isPathInside(resolvedRoot, resolvedOutput)) {
    throw new Error(
      `BSC prover sidecar output path ${resolvedOutput} must resolve inside package root ${resolvedRoot}.`,
    );
  }
  return resolvedOutput;
};

const normalizeHex32 = (value) => {
  const normalized = trimString(value).toLowerCase();
  return /^0x[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
};
const normalizeNonZeroHex32 = (value) => {
  const normalized = normalizeHex32(value);
  return normalized && !/^0x0{64}$/u.test(normalized) ? normalized : null;
};

const normalizeEvmAddress = (value) => {
  const normalized = trimString(value).toLowerCase();
  return /^0x[0-9a-f]{40}$/u.test(normalized) ? normalized : null;
};

const isNonZeroEvmAddress = (value) =>
  Boolean(value) && !/^0x0{40}$/u.test(value);
const BSC_PROVER_ROUTE_REPORT_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const BSC_PROVER_ROUTE_REPORT_SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const BSC_PROVER_ROUTE_REPORT_SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
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
  "schema",
  "verifierMaterialWarning",
  "verifier_material_warning",
  "verifierMaterialWarnings",
  "verifier_material_warnings",
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

export const BSC_PROVER_SIDECAR_REQUIRED_ROUTE_CHECK_IDS =
  SCCP_BSC_REQUIRED_ROUTE_CHECK_IDS;
export const requiredBscProverSidecarRouteCheckIds = requiredBscRouteCheckIds;
export const BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS =
  Object.freeze([
    "bsc-production-ready",
    "bsc-destination-browser-prover",
    "bsc-source-browser-prover",
  ]);

const routeReportHasPassedCheck = (routeReport, id) => {
  const checks = ownValue(routeReport, "checks");
  return (
    Array.isArray(checks) &&
    ownArrayValues(checks).some(
      (entry) =>
        isRecord(entry) &&
        trimString(ownValue(entry, "id")) === id &&
        (ownValue(entry, "ok") === true ||
          trimString(ownValue(entry, "status")).toLowerCase() === "pass"),
    )
  );
};

const routeReportFailedCheckIds = (routeReport) => {
  const checks = ownValue(routeReport, "checks");
  if (!Array.isArray(checks)) {
    return [];
  }
  const failed = [];
  for (const entry of ownArrayValues(checks)) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = trimString(ownValue(entry, "id"));
    if (!id) {
      continue;
    }
    const hasOk = typeof ownValue(entry, "ok") === "boolean";
    const status = trimString(ownValue(entry, "status")).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (
      (hasOk && ownValue(entry, "ok") === false) ||
      (hasStatus && status === "fail")
    ) {
      failed.push(id);
    }
  }
  return failed;
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
    const id = trimString(entry.id);
    const label = id || `index ${index}`;
    if (!id) {
      problems.push(`route report check ${index} id is missing`);
    } else if (seen.has(id)) {
      problems.push(`route report check id ${id} is duplicated`);
    } else {
      seen.add(id);
    }
    const hasOk = typeof entry.ok === "boolean";
    const status = trimString(entry.status).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `route report check ${label} has no machine-readable pass/fail state`,
      );
    }
    if (hasOk && hasStatus && entry.ok !== (status === "pass")) {
      problems.push(`route report check ${label} has contradictory ok/status`);
    }
  }
  return problems;
};

const secretLikeTextReason = (value, pathName) => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    BSC_PROVER_ROUTE_REPORT_SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    BSC_PROVER_ROUTE_REPORT_SECRET_VALUE_PATTERN.test(normalized)
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
    if (BSC_PROVER_ROUTE_REPORT_SECRET_KEY_PATTERN.test(key)) {
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
    const value = ownValue(record, name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

const normalizeUint256 = (value) => {
  const text = trimString(value);
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

const recordCarriesVerifierMaterial = (record) =>
  VERIFIER_VECTOR_ALIASES.some((aliases) =>
    aliases.some((alias) => hasOwn(record, alias)),
  );

const assertBn254VerifierMaterial = (record, pathName) => {
  assertBn254G1Point(
    normalizeVerifierVector(
      record,
      ["alpha1", "configuredAlpha1", "vk_alpha_1"],
      2,
    ),
    `${pathName}.alpha1`,
  );
  assertBn254G1VectorPairs(
    normalizeVerifierVector(record, ["ic", "configuredIc", "vk_ic", "IC"], 20),
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

const smokeFixtureRouteReportReason = (
  value,
  pathName = "route report",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = smokeFixtureRouteReportReason(
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
  if (isSmokeFixtureGroth16VerifierMaterial(value)) {
    return `${pathName} matches the deterministic smoke-test Groth16 fixture key`;
  }
  for (const [key, child] of ownRecordEntries(value)) {
    const reason = smokeFixtureRouteReportReason(
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

const invalidBn254VerifierMaterialReason = (
  value,
  pathName = "route report",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = invalidBn254VerifierMaterialReason(
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
  if (recordCarriesVerifierMaterial(value)) {
    try {
      assertBn254VerifierMaterial(value, pathName);
    } catch (error) {
      return `${pathName} has invalid BN254 verifier material: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
  for (const [key, child] of ownRecordEntries(value)) {
    const reason = invalidBn254VerifierMaterialReason(
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

const diagnosticVerifierKeyHashReason = (
  value,
  pathName = "route report",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const [index, entry] of ownArrayValues(value).entries()) {
      const reason = diagnosticVerifierKeyHashReason(
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
  for (const [key, child] of ownRecordEntries(value)) {
    if (
      VERIFIER_KEY_HASH_ALIASES.has(key) &&
      DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(trimString(child).toLowerCase())
    ) {
      return `${pathName} carries a known diagnostic BSC verifier key hash`;
    }
    const reason = diagnosticVerifierKeyHashReason(
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

const normalizeDirection = (value) => {
  const normalized = trimString(value || "destination").toLowerCase();
  if (
    ["destination", "bsc-destination", "taira-to-bsc", "sora-to-bsc"].includes(
      normalized,
    )
  ) {
    return "destination";
  }
  if (["source", "bsc-source", "bsc-to-taira"].includes(normalized)) {
    return "source";
  }
  throw new Error("--direction must be destination or source.");
};

const defaultExportsForDirection = (direction) =>
  direction === "source"
    ? ["bscSccpSourceProve", BSC_SOURCE_PROVER_SELF_TEST_EXPORTS[1]]
    : ["bscSccpProve", BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS[1]];

const BSC_POST_DEPLOY_EVIDENCE_ALIASES = Object.freeze({
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

const normalizeExportNames = (values, direction) => {
  const problems = exportNameInputProblems(values);
  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }
  const providedValues =
    values === undefined || values === null
      ? []
      : Array.isArray(values)
        ? ownArrayValues(values)
        : [values];
  const rawValues = providedValues
    .flatMap((value) => trimString(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return rawValues.length ? rawValues : defaultExportsForDirection(direction);
};

const BSC_ROUTE_DEPLOYMENT_ALIASES = Object.freeze({
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

const publicRouteDeployment = (routeReport) => {
  const deployment = ownValue(routeReport, "deployment");
  if (!isRecord(deployment)) {
    return null;
  }
  const out = {};
  const aliasProblems = [];
  for (const [key, aliases] of Object.entries(
    FORBIDDEN_BSC_ROUTE_DEPLOYMENT_ALIASES,
  )) {
    const present = aliases.filter((alias) => {
      if (!hasOwn(deployment, alias)) {
        return false;
      }
      const value = ownValue(deployment, alias);
      return typeof value === "string" ? value.trim() !== "" : false;
    });
    if (present.length > 0) {
      aliasProblems.push(
        `${key} must not use TRON aliases on BSC route reports: ${present.join(", ")}`,
      );
    }
  }
  for (const [key, aliases] of Object.entries(BSC_ROUTE_DEPLOYMENT_ALIASES)) {
    const present = aliases.filter((alias) => {
      if (!hasOwn(deployment, alias)) {
        return false;
      }
      const value = ownValue(deployment, alias);
      return typeof value === "string" ? value.trim() !== "" : false;
    });
    if (present.length > 1) {
      aliasProblems.push(`${key} uses multiple aliases: ${present.join(", ")}`);
    }
    for (const alias of aliases) {
      if (!hasOwn(deployment, alias)) {
        continue;
      }
      const value = ownValue(deployment, alias);
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
        break;
      }
    }
  }
  if (aliasProblems.length > 0) {
    out.aliasProblems = aliasProblems;
  }
  return out;
};

const publicRoutePostDeployEvidence = (routeReport) => {
  const evidence = ownValue(routeReport, "postDeployLiveEvidence");
  if (!isRecord(evidence)) {
    return null;
  }
  const aliasProblems = [];
  const presentAliases = (key) =>
    (BSC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]).filter((alias) => {
      if (!hasOwn(evidence, alias)) {
        return false;
      }
      const value = ownValue(evidence, alias);
      if (typeof value === "string") {
        return value.trim() !== "";
      }
      if (typeof value === "boolean") {
        return true;
      }
      return value !== undefined && value !== null;
    });
  const recordAliasProblem = (key, aliases) => {
    if (aliases.length > 1) {
      aliasProblems.push(`${key} uses multiple aliases: ${aliases.join(", ")}`);
    }
  };
  const readEvidenceString = (key) => {
    recordAliasProblem(key, presentAliases(key));
    for (const alias of BSC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]) {
      if (!hasOwn(evidence, alias)) {
        continue;
      }
      const value = ownValue(evidence, alias);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };
  const readEvidenceBoolean = (key) => {
    recordAliasProblem(key, presentAliases(key));
    return (BSC_POST_DEPLOY_EVIDENCE_ALIASES[key] ?? [key]).some(
      (alias) => hasOwn(evidence, alias) && ownValue(evidence, alias) === true,
    );
  };
  const out = {
    fullTomlReady: readEvidenceBoolean("fullTomlReady"),
  };
  for (const key of [
    "sourceBridgeConfigHash",
    "sourceEventTransactionId",
    "sourceEventExplorerUrl",
    "routeCanaryEvidenceHash",
    "routeCanaryTransactionId",
    "routeCanaryExplorerUrl",
    "offlineFullTomlSha256",
  ]) {
    const value = readEvidenceString(key);
    if (value) {
      out[key] = value;
    }
  }
  if (aliasProblems.length > 0) {
    out.aliasProblems = aliasProblems;
  }
  return out;
};

export const assertBscRouteReportReadyForProverSidecar = (
  routeReport,
  bscNetwork = "testnet",
) => {
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const problems = [];
  if (!isRecord(routeReport)) {
    throw new Error("BSC route report must be a JSON object.");
  }
  const routeReportRecord = ownJsonRecord(routeReport);
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
  const smokeFixtureReason = smokeFixtureRouteReportReason(routeReportRecord);
  if (smokeFixtureReason) {
    problems.push(
      `route report still carries smoke-test verifier material: ${smokeFixtureReason}`,
    );
  }
  const invalidVerifierReason =
    invalidBn254VerifierMaterialReason(routeReportRecord);
  if (invalidVerifierReason) {
    problems.push(
      `route report carries invalid BN254 verifier material: ${invalidVerifierReason}`,
    );
  }
  const diagnosticVerifierHashReason =
    diagnosticVerifierKeyHashReason(routeReportRecord);
  if (diagnosticVerifierHashReason) {
    problems.push(diagnosticVerifierHashReason);
  }
  const allowedBootstrapFailures = new Set(
    BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS,
  );
  const failedCheckIds = routeReportFailedCheckIds(routeReportRecord);
  const disallowedFailedCheckIds = failedCheckIds.filter(
    (id) => !allowedBootstrapFailures.has(id),
  );
  const ready = ownValue(routeReportRecord, "ready") === true;
  const sidecarBootstrapOnly =
    !ready &&
    failedCheckIds.length > 0 &&
    disallowedFailedCheckIds.length === 0;
  if (!ready) {
    if (failedCheckIds.length === 0) {
      problems.push(
        "route preflight report is not ready and does not identify sidecar-bootstrap checks",
      );
    } else if (disallowedFailedCheckIds.length > 0) {
      problems.push(
        `route preflight report is not ready because non-sidecar checks failed: ${disallowedFailedCheckIds.join(", ")}`,
      );
    }
  }
  if (
    ownValue(routeReportRecord, "manifestSource") === "file" &&
    !sidecarBootstrapOnly
  ) {
    problems.push("public TAIRA route publication is not proven");
  }
  if (
    ownValue(routeReportRecord, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    ownValue(routeReportRecord, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `route report must be ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}`,
    );
  }
  const taira = ownValue(routeReportRecord, "taira");
  const bsc = ownValue(routeReportRecord, "bsc");
  if (
    ownValue(taira, "chainId") !== BSC_TAIRA_CHAIN_ID ||
    ownValue(taira, "networkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
  ) {
    problems.push("route report must be bound to TAIRA testnet prefix 369");
  }
  if (ownValue(bsc, "network") !== bscProfile.key) {
    problems.push(
      `route report must be bound to ${bscProfile.label} network label ${bscProfile.key}`,
    );
  }
  if (ownValue(bsc, "chain") !== bscProfile.chain) {
    problems.push(
      `route report must be bound to ${bscProfile.label} chain ${bscProfile.chain}`,
    );
  }
  if (ownValue(bsc, "chainIdHex") !== bscProfile.chainIdHex) {
    problems.push(
      `route report must be bound to ${bscProfile.label} chain id ${bscProfile.chainIdHex}`,
    );
  }
  if (ownValue(bsc, "networkIdHex") !== bscProfile.networkIdHex) {
    problems.push(
      `route report must be bound to ${bscProfile.label} network id ${Number.parseInt(bscProfile.chainIdHex.slice(2), 16)}`,
    );
  }
  problems.push(...routeReportCheckIntegrityProblems(routeReport));
  for (const id of requiredBscProverSidecarRouteCheckIds(bscProfile)) {
    if (allowedBootstrapFailures.has(id)) {
      continue;
    }
    if (!routeReportHasPassedCheck(routeReportRecord, id)) {
      problems.push(`${id} preflight check has not passed`);
    }
  }

  const deployment = publicRouteDeployment(routeReportRecord);
  const postDeployLiveEvidence =
    publicRoutePostDeployEvidence(routeReportRecord);
  if (!deployment) {
    problems.push("route deployment evidence is missing");
  } else {
    for (const problem of Array.isArray(ownValue(deployment, "aliasProblems"))
      ? ownValue(deployment, "aliasProblems")
      : []) {
      problems.push(`deployment.${problem}`);
    }
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
      if (!ownValue(deployment, key)) {
        problems.push(`${key} is missing`);
      }
    }
    for (const key of [
      "bridgeAddress",
      "tokenAddress",
      "sourceBridgeAddress",
      "verifierAddress",
    ]) {
      const value = ownValue(deployment, key);
      const address = normalizeEvmAddress(value);
      if (value && !address) {
        problems.push(`${key} must be an EVM address`);
      } else if (address && !isNonZeroEvmAddress(address)) {
        problems.push(`${key} must be a non-zero EVM address`);
      }
    }
    const addresses = [
      ownValue(deployment, "bridgeAddress"),
      ownValue(deployment, "tokenAddress"),
      ownValue(deployment, "sourceBridgeAddress"),
      ownValue(deployment, "verifierAddress"),
    ]
      .map(normalizeEvmAddress)
      .filter(Boolean);
    if (new Set(addresses).size !== addresses.length) {
      problems.push(
        "bridgeAddress, tokenAddress, sourceBridgeAddress, and verifierAddress must be distinct",
      );
    }
    if (ownValue(deployment, "networkIdHex") !== bscProfile.networkIdHex) {
      problems.push(
        `deployment networkIdHex must be the ${bscProfile.label} network id`,
      );
    }
    for (const key of [
      "verifierCodeHash",
      "verifierKeyHash",
      "destinationBindingHash",
      "proofArtifactHash",
      "provingKeyHash",
      "nativeEvmProverBundleHash",
    ]) {
      const value = ownValue(deployment, key);
      if (value && !normalizeNonZeroHex32(value)) {
        problems.push(`${key} must be a non-zero 32-byte hex value`);
      }
    }
    const hashRoles = [
      ["verifierCodeHash", ownValue(deployment, "verifierCodeHash")],
      ["verifierKeyHash", ownValue(deployment, "verifierKeyHash")],
      [
        "destinationBindingHash",
        ownValue(deployment, "destinationBindingHash"),
      ],
      ["proofArtifactHash", ownValue(deployment, "proofArtifactHash")],
      ["provingKeyHash", ownValue(deployment, "provingKeyHash")],
      [
        "nativeEvmProverBundleHash",
        ownValue(deployment, "nativeEvmProverBundleHash"),
      ],
    ]
      .map(([key, value]) => [key, normalizeHex32(value)])
      .filter(([, value]) => value);
    const seenHashes = new Map();
    for (const [key, value] of hashRoles) {
      const previous = seenHashes.get(value);
      if (previous) {
        problems.push(`${key} must not equal ${previous}`);
      } else {
        seenHashes.set(value, key);
      }
    }
  }
  if (!postDeployLiveEvidence) {
    problems.push("postDeployLiveEvidence is missing");
  } else {
    for (const problem of Array.isArray(
      ownValue(postDeployLiveEvidence, "aliasProblems"),
    )
      ? ownValue(postDeployLiveEvidence, "aliasProblems")
      : []) {
      problems.push(`postDeployLiveEvidence.${problem}`);
    }
    if (ownValue(postDeployLiveEvidence, "fullTomlReady") !== true) {
      problems.push("postDeployLiveEvidence.fullTomlReady must be true");
    }
    for (const key of [
      "sourceBridgeConfigHash",
      "sourceEventTransactionId",
      "sourceEventExplorerUrl",
      "routeCanaryEvidenceHash",
      "routeCanaryTransactionId",
      "routeCanaryExplorerUrl",
      "offlineFullTomlSha256",
    ]) {
      if (!ownValue(postDeployLiveEvidence, key)) {
        problems.push(`postDeployLiveEvidence.${key} is missing`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Cannot generate BSC prover sidecar from this route report: ${problems.join("; ")}.`,
    );
  }
  return routeReportRecord;
};

export const resolveLocalBscProverModulePath = (moduleUrl, input = {}) => {
  const root = ownValue(input, "root") ?? repoRoot;
  const normalized = normalizeSccpBrowserModuleUrl(
    moduleUrl,
    "BSC prover module URL",
  );
  if (!normalized) {
    throw new Error("BSC prover module URL is required.");
  }
  if (normalized.startsWith("/")) {
    const resolvedRoot = path.resolve(root);
    const allowedRoot = path.join(resolvedRoot, "public");
    return {
      allowedRoot,
      moduleUrl: normalized,
      modulePath: path.join(allowedRoot, normalized.replace(/^\/+/u, "")),
      scopeLabel: "public/",
    };
  }
  if (normalized.startsWith("./")) {
    const allowedRoot = path.resolve(root);
    return {
      allowedRoot,
      moduleUrl: normalized,
      modulePath: path.resolve(allowedRoot, normalized),
      scopeLabel: "package root",
    };
  }
  throw new Error(
    "BSC prover sidecar generation requires a local package-relative module URL so module bytes can be hashed before publishing.",
  );
};

const resolveSafeLocalModulePath = async (resolved) => {
  let info;
  try {
    info = await lstat(resolved.modulePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `BSC prover module ${resolved.moduleUrl} does not exist at ${resolved.modulePath}.`,
      );
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(
      `BSC prover module ${resolved.moduleUrl} must not be a symbolic link.`,
    );
  }
  if (!info.isFile()) {
    throw new Error(
      `BSC prover module ${resolved.moduleUrl} must be a regular file.`,
    );
  }
  const [allowedRoot, resolvedPath] = await Promise.all([
    realpath(resolved.allowedRoot),
    realpath(resolved.modulePath),
  ]);
  if (!isPathInside(allowedRoot, resolvedPath)) {
    throw new Error(
      `BSC prover module ${resolved.moduleUrl} resolves outside ${resolved.scopeLabel}.`,
    );
  }
  return resolvedPath;
};

export const defaultBscProverManifestOutputPath = (moduleUrl, input = {}) => {
  const root = ownValue(input, "root") ?? repoRoot;
  const { modulePath } = resolveLocalBscProverModulePath(moduleUrl, { root });
  return `${modulePath}.manifest.json`;
};

const readLocalModuleBytes = async (
  moduleUrl,
  { root = repoRoot, maxBytes = SCCP_BSC_BROWSER_MODULE_MAX_BYTES } = {},
) => {
  const resolved = resolveLocalBscProverModulePath(moduleUrl, { root });
  const safeModulePath = await resolveSafeLocalModulePath(resolved);
  const info = await lstat(safeModulePath);
  if (info.size > maxBytes) {
    throw new Error(
      `BSC prover module ${resolved.moduleUrl} is ${info.size} bytes; maximum allowed is ${maxBytes} bytes.`,
    );
  }
  const bytes = await readFile(safeModulePath);
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `BSC prover module ${resolved.moduleUrl} is ${bytes.byteLength} bytes; maximum allowed is ${maxBytes} bytes.`,
    );
  }
  return { ...resolved, bytes };
};

export const buildBscSccpBrowserProverManifest = (input = {}) => {
  const routeReport = ownValue(input, "routeReport");
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const moduleUrl = ownValue(input, "moduleUrl");
  const moduleBytes = ownValue(input, "moduleBytes");
  const direction = ownValue(input, "direction") ?? "destination";
  const exportNames = ownValue(input, "exportNames");
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const routeReportRecord = assertBscRouteReportReadyForProverSidecar(
    routeReport,
    bscProfile.key,
  );
  const normalizedDirection = normalizeDirection(direction);
  const normalizedModuleUrl = normalizeSccpBrowserModuleUrl(
    moduleUrl,
    "BSC prover module URL",
  );
  if (!normalizedModuleUrl) {
    throw new Error("BSC prover module URL is required.");
  }
  if (!moduleBytes || Number(moduleBytes.byteLength ?? 0) <= 0) {
    throw new Error("BSC prover module bytes are required.");
  }
  const moduleShape = validateBscSccpBrowserProverModuleBytes(
    moduleBytes,
    "BSC prover module",
  );
  if (!moduleShape.ok) {
    throw new Error(moduleShape.detail);
  }
  const deployment = publicRouteDeployment(routeReportRecord);
  const postDeployLiveEvidence =
    publicRoutePostDeployEvidence(routeReportRecord);
  const manifest = {
    schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
    moduleUrl: normalizedModuleUrl,
    kind: normalizedDirection === "source" ? "bsc-source" : "bsc-destination",
    direction:
      normalizedDirection === "source" ? "bsc-to-taira" : "taira-to-bsc",
    exports: normalizeExportNames(exportNames, normalizedDirection),
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    tairaChainId: BSC_TAIRA_CHAIN_ID,
    tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    bscNetwork: bscProfile.key,
    bscChain: bscProfile.chain,
    bscChainIdHex: bscProfile.chainIdHex,
    bscNetworkIdHex: bscProfile.networkIdHex,
    moduleSha256: sha256Hex(moduleBytes),
    proofArtifactHash: ownValue(deployment, "proofArtifactHash"),
    provingKeyHash: ownValue(deployment, "provingKeyHash"),
    nativeEvmProverBundleHash: ownValue(
      deployment,
      "nativeEvmProverBundleHash",
    ),
    boundRouteHash: ownValue(deployment, "destinationBindingHash"),
    boundProofHash: ownValue(deployment, "proofArtifactHash"),
    deployment: {
      bridgeAddress: ownValue(deployment, "bridgeAddress"),
      tokenAddress: ownValue(deployment, "tokenAddress"),
      sourceBridgeAddress: ownValue(deployment, "sourceBridgeAddress"),
      verifierAddress: ownValue(deployment, "verifierAddress"),
      networkIdHex: ownValue(deployment, "networkIdHex"),
      verifierCodeHash: ownValue(deployment, "verifierCodeHash"),
      verifierKeyHash: ownValue(deployment, "verifierKeyHash"),
      proofArtifactHash: ownValue(deployment, "proofArtifactHash"),
      provingKeyHash: ownValue(deployment, "provingKeyHash"),
      nativeEvmProverBundleHash: ownValue(
        deployment,
        "nativeEvmProverBundleHash",
      ),
      destinationBindingHash: ownValue(deployment, "destinationBindingHash"),
      settlementAssetDefinitionId: ownValue(
        deployment,
        "settlementAssetDefinitionId",
      ),
    },
    postDeployLiveEvidence: {
      fullTomlReady: ownValue(postDeployLiveEvidence, "fullTomlReady"),
      sourceBridgeConfigHash: ownValue(
        postDeployLiveEvidence,
        "sourceBridgeConfigHash",
      ),
      sourceEventTransactionId: ownValue(
        postDeployLiveEvidence,
        "sourceEventTransactionId",
      ),
      sourceEventExplorerUrl: ownValue(
        postDeployLiveEvidence,
        "sourceEventExplorerUrl",
      ),
      routeCanaryEvidenceHash: ownValue(
        postDeployLiveEvidence,
        "routeCanaryEvidenceHash",
      ),
      routeCanaryTransactionId: ownValue(
        postDeployLiveEvidence,
        "routeCanaryTransactionId",
      ),
      routeCanaryExplorerUrl: ownValue(
        postDeployLiveEvidence,
        "routeCanaryExplorerUrl",
      ),
      offlineFullTomlSha256: ownValue(
        postDeployLiveEvidence,
        "offlineFullTomlSha256",
      ),
    },
  };
  const validation = validateBscSccpBrowserProverManifest({
    manifest,
    routeReport: routeReportRecord,
    moduleUrl: normalizedModuleUrl,
    expectedDirection: normalizedDirection,
    label:
      normalizedDirection === "source"
        ? "BSC -> TAIRA source prover"
        : "TAIRA -> BSC prover",
    bscNetwork: bscProfile.key,
  });
  if (!validation.ok) {
    throw new Error(validation.detail);
  }
  return manifest;
};

export const writeBscSccpBrowserProverManifest = async (input = {}) => {
  const routeReport = ownValue(input, "routeReport");
  const bscNetwork = ownValue(input, "bscNetwork") ?? "testnet";
  const moduleUrl = ownValue(input, "moduleUrl");
  const direction = ownValue(input, "direction");
  const exportNames = ownValue(input, "exportNames");
  const outputPath = ownValue(input, "outputPath");
  const root = ownValue(input, "root") ?? repoRoot;
  const maxBytes =
    ownValue(input, "maxBytes") ?? SCCP_BSC_BROWSER_MODULE_MAX_BYTES;
  const { moduleUrl: normalizedModuleUrl, bytes } = await readLocalModuleBytes(
    moduleUrl,
    { root, maxBytes },
  );
  const manifest = buildBscSccpBrowserProverManifest({
    routeReport,
    bscNetwork,
    moduleUrl: normalizedModuleUrl,
    moduleBytes: bytes,
    direction,
    exportNames,
  });
  const outPath = resolveBscProverManifestOutputPath(outputPath, {
    root,
    moduleUrl: normalizedModuleUrl,
  });
  await writeJsonReportFile(outPath, manifest);
  return { manifest, outputPath: outPath };
};

const BSC_PROVER_MANIFEST_CLI_OPTIONS = new Set([
  "route-report",
  "manifest-file",
  "torii-url",
  "bsc-network",
  "bsc-rpc-url",
  "allow-local-rpc",
  "check-bsc-contracts",
  "module-url",
  "direction",
  "export",
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
    if (!BSC_PROVER_MANIFEST_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC prover manifest options.`,
      );
    }
    const next = argv[index + 1];
    const value = !next || next.startsWith("--") ? "true" : next;
    if (key === "export" && args[key] !== undefined) {
      args[key] = Array.isArray(args[key])
        ? [...args[key], value]
        : [args[key], value];
    } else if (args[key] === undefined) {
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

const printUsage = () => {
  process.stdout.write(
    `Usage: node scripts/e2e/sccp-bsc-prover-manifest.mjs [options]

Generate a browser prover sidecar manifest for a BSC SCCP prover module.

Options:
  --route-report PATH
  --manifest-file PATH
  --torii-url URL
  --bsc-network testnet|mainnet
  --bsc-rpc-url URL
  --allow-local-rpc
  --check-bsc-contracts true|false
  --module-url URL
  --direction destination|source
  --export NAME
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
  const resolved = path.resolve(repoRoot, trimString(filePath));
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) {
      throw new Error("must not be a symbolic link");
    }
    if (!info.isFile()) {
      throw new Error("must be a regular file");
    }
    if (info.size > SCCP_BSC_PROVER_ROUTE_REPORT_MAX_BYTES) {
      throw new Error(
        `is ${info.size} bytes; maximum allowed is ${SCCP_BSC_PROVER_ROUTE_REPORT_MAX_BYTES} bytes`,
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

const cli = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertNoCliAliasConflicts(args, "BSC route evidence source", [
    "route-report",
    "manifest-file",
  ]);
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
  const result = await writeBscSccpBrowserProverManifest({
    routeReport,
    bscNetwork: bscProfile.key,
    moduleUrl: args["module-url"],
    direction: args.direction,
    exportNames: args.export,
    outputPath: args.out,
  });
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
  process.stdout.write(
    `\nBSC SCCP browser prover manifest: ${result.outputPath}\n`,
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

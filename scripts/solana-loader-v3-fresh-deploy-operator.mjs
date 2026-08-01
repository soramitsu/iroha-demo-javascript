#!/usr/bin/env node
/* global AggregateError, BigInt */
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, open, rm, statfs } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  SOLANA_FEATURE_PROGRAM_ID,
  SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
  SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA,
  SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS,
  SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
  SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
  SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
  buildSolanaLoaderV3FreshDeployPlan,
  canonicalSolanaLoaderV3FreshDeployPlanBytes,
  canonicalSolanaLoaderV3FreshDeployReportBytes,
  deployFreshImmutableSolanaSccpPrograms,
  validateSolanaLoaderV3FreshDeployReport,
} from "./solana-loader-v3-fresh-deploy.mjs";
import {
  DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
  DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
  SOLANA_SBF_VALIDATOR_TIMEOUT_MS,
  createAuthenticatedSolanaLoaderV3FreshSbfValidationAdapter,
} from "./solana-sbf-validation-evidence.mjs";
import {
  assertSolanaExactOutputDirectoryPin,
  pinSolanaExactOutputDirectory,
} from "./sccp-solana-exact-initialize.mjs";
import {
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK,
  solanaBlake2b256,
  solanaSha256,
} from "./solana-loader-v3-runtime.mjs";

export const SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-context/v1";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_OPERATOR_LEASE_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-operator-lease/v1";
export const DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL =
  "https://api.testnet.solana.com";
export const DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_REVIEW_TIMEOUT_MS =
  15 * 60 * 1000;
export const DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SLOTS = 1_500;

const modulePath = fileURLToPath(import.meta.url);
const HASH32 = /^0x[0-9a-f]{64}$/u;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_JOURNAL_EVENT_BYTES = 64 * 1024;
const MAX_LEASE_BYTES = 16 * 1024;
const MAX_REPORT_BYTES = 64 * 1024 * 1024;
const MIN_REPORT_FREE_SPACE_BYTES = 2n * BigInt(MAX_REPORT_BYTES);
const MIN_CONTEXT_SLOTS = 64;
const MAX_CONTEXT_SLOTS = 10_000;
const MIN_REVIEW_TIMEOUT_MS = 1_000;
const MAX_REVIEW_TIMEOUT_MS = 60 * 60 * 1000;
const SECRET_PATH_PATTERN =
  /(?:^|[/._-])(?:secret|keypair|mnemonic|seed(?:[-_.]?phrase)?|credential|keystore|private[-_.]?key|wallet[-_.]?key)(?:$|[/._-])/iu;

const SNAPSHOT_VALUE_OPTIONS = new Set([
  "solana-rpc-url",
  "valid-for-slots",
  "out",
]);
const CEREMONY_VALUE_OPTIONS = new Set([
  "solana-rpc-url",
  "context",
  "expected-context-sha256",
  "native-verifier-artifact",
  "native-verifier-artifact-sha256",
  "destination-artifact",
  "destination-artifact-sha256",
  "source-artifact",
  "source-artifact-sha256",
  "native-verifier-sbf-evidence",
  "native-verifier-sbf-evidence-sha256",
  "destination-sbf-evidence",
  "destination-sbf-evidence-sha256",
  "source-sbf-evidence",
  "source-sbf-evidence-sha256",
  "validator-bin",
  "expected-validator-sha256",
  "plan",
  "confirmation-template",
  "confirmation",
  "confirmation-sha256-file",
  "journal",
  "report",
  "review-timeout-ms",
  "submit",
]);

const SNAPSHOT_REQUIRED_OPTIONS = Object.freeze([
  "solana-rpc-url",
  "valid-for-slots",
  "out",
]);
const CEREMONY_REQUIRED_OPTIONS = Object.freeze([
  "solana-rpc-url",
  "context",
  "expected-context-sha256",
  "native-verifier-artifact",
  "native-verifier-artifact-sha256",
  "destination-artifact",
  "destination-artifact-sha256",
  "source-artifact",
  "source-artifact-sha256",
  "native-verifier-sbf-evidence",
  "native-verifier-sbf-evidence-sha256",
  "destination-sbf-evidence",
  "destination-sbf-evidence-sha256",
  "source-sbf-evidence",
  "source-sbf-evidence-sha256",
  "expected-validator-sha256",
  "plan",
  "confirmation-template",
  "confirmation",
  "confirmation-sha256-file",
  "journal",
  "report",
  "review-timeout-ms",
  "submit",
]);
const CEREMONY_HASH_OPTIONS = new Set([
  "expected-context-sha256",
  "native-verifier-artifact-sha256",
  "destination-artifact-sha256",
  "source-artifact-sha256",
  "native-verifier-sbf-evidence-sha256",
  "destination-sbf-evidence-sha256",
  "source-sbf-evidence-sha256",
  "expected-validator-sha256",
]);

export const SOLANA_LOADER_V3_FRESH_DEPLOY_OPERATOR_USAGE = `Usage:
  node scripts/solana-loader-v3-fresh-deploy-operator.mjs snapshot-context \\
    --solana-rpc-url ${DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL} \\
    --valid-for-slots ${DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SLOTS} \\
    --out PATH

  node scripts/solana-loader-v3-fresh-deploy-operator.mjs ceremony \\
    --solana-rpc-url ${DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL} \\
    --context PATH --expected-context-sha256 0xHASH \\
    --native-verifier-artifact PATH --native-verifier-artifact-sha256 0xHASH \\
    --destination-artifact PATH --destination-artifact-sha256 0xHASH \\
    --source-artifact PATH --source-artifact-sha256 0xHASH \\
    --native-verifier-sbf-evidence PATH --native-verifier-sbf-evidence-sha256 0xHASH \\
    --destination-sbf-evidence PATH --destination-sbf-evidence-sha256 0xHASH \\
    --source-sbf-evidence PATH --source-sbf-evidence-sha256 0xHASH \\
    --expected-validator-sha256 0xHASH \\
    --plan PATH --confirmation-template PATH --confirmation PATH \\
    --confirmation-sha256-file PATH --journal PATH --report PATH \\
    --review-timeout-ms ${DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_REVIEW_TIMEOUT_MS} \\
    --submit true

The ceremony generates all eight payer/authority/program/buffer signers with
the OS CSPRNG and retains them only in this one process. It writes the public
plan and a non-submitting confirmation template, then waits for an independently
authored canonical confirmation plus a separate exact SHA-256 sidecar. Fund the
printed payer address during that bounded review window. No signer input, signer
path, environment secret, automatic mutation retry, or pre-existing program id
is accepted.
`;

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const exactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key)) ||
    [...expected].some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} must contain only its exact canonical fields.`);
  }
};

const canonicalJsonValue = (value, label = "JSON") => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} contains a non-canonical number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalJsonValue(entry, `${label}[${index}]`),
    );
  }
  if (!isRecord(value)) throw new Error(`${label} contains a non-JSON value.`);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key], `${label}.${key}`)]),
  );
};

export const canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(canonicalJsonValue(value))}\n`, "utf8");

export const canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes = (
  value,
) => canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(value);

const sha256 = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const normalizedHash = (value, label) => {
  if (
    typeof value !== "string" ||
    !HASH32.test(value) ||
    value === `0x${"00".repeat(32)}` ||
    new Set(value.slice(2)).size < 4
  ) {
    throw new Error(
      `${label} must be a non-placeholder lowercase 32-byte hash.`,
    );
  }
  return value;
};

const positiveInteger = (value, label, minimum, maximum) => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(String(value ?? ""))) {
    throw new Error(`${label} must be a canonical decimal integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is outside its bounded range.`);
  }
  return parsed;
};

const normalizeRpcUrl = (value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new Error("Solana RPC URL is invalid.", { cause });
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/"
  ) {
    throw new Error(
      "Solana production RPC must be an origin-only HTTPS URL without credentials, query, or fragment.",
    );
  }
  return parsed.toString().replace(/\/$/u, "");
};

const parseOptions = (argv, allowed, required) => {
  const result = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("--")) {
      throw new Error("Unexpected positional argument.");
    }
    if (token.includes("="))
      throw new Error("Option=value syntax is not accepted.");
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}.`);
    if (seen.has(key)) throw new Error(`Duplicate option: --${key}.`);
    seen.add(key);
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new Error(`--${key} requires an explicit following value.`);
    }
    result[key] = value;
    index += 1;
  }
  for (const key of required) {
    if (!Object.hasOwn(result, key))
      throw new Error(`Missing required --${key}.`);
  }
  return Object.freeze(result);
};

export const parseSolanaLoaderV3FreshDeployOperatorArgs = (argv) => {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return Object.freeze({ command: "help", options: Object.freeze({}) });
  }
  const [command, ...rest] = argv;
  if (command === "snapshot-context") {
    const options = parseOptions(
      rest,
      SNAPSHOT_VALUE_OPTIONS,
      SNAPSHOT_REQUIRED_OPTIONS,
    );
    normalizeRpcUrl(options["solana-rpc-url"]);
    positiveInteger(
      options["valid-for-slots"],
      "Fresh-deploy context slot window",
      MIN_CONTEXT_SLOTS,
      MAX_CONTEXT_SLOTS,
    );
    canonicalPath(options.out, "Fresh-deploy context output");
    return Object.freeze({
      command,
      options,
    });
  }
  if (command === "ceremony") {
    const options = parseOptions(
      rest,
      CEREMONY_VALUE_OPTIONS,
      CEREMONY_REQUIRED_OPTIONS,
    );
    if (options.submit !== "true") {
      throw new Error(
        "The irreversible ceremony requires exact --submit true.",
      );
    }
    normalizeRpcUrl(options["solana-rpc-url"]);
    positiveInteger(
      options["review-timeout-ms"],
      "Fresh-deploy review timeout",
      MIN_REVIEW_TIMEOUT_MS,
      MAX_REVIEW_TIMEOUT_MS,
    );
    for (const [key, value] of Object.entries(options)) {
      if (CEREMONY_HASH_OPTIONS.has(key)) normalizedHash(value, `--${key}`);
      if (
        !CEREMONY_HASH_OPTIONS.has(key) &&
        !["solana-rpc-url", "review-timeout-ms", "submit"].includes(key)
      ) {
        canonicalPath(value, `--${key}`);
      }
    }
    return Object.freeze({ command, options });
  }
  throw new Error("Expected snapshot-context, ceremony, or --help.");
};

const canonicalPath = (value, label) => {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\0") ||
    SECRET_PATH_PATTERN.test(value)
  ) {
    throw new Error(`${label} must be a non-secret public path.`);
  }
  return path.resolve(value);
};

const safeLstat = async (target, { allowMissing = false } = {}) => {
  try {
    return await lstat(target);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw error;
  }
};

const assertOwnedRegular = (stat, label) => {
  const uid = typeof process.geteuid === "function" ? process.geteuid() : null;
  if (
    !stat?.isFile?.() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (uid !== null && stat.uid !== uid) ||
    (stat.mode & 0o022) !== 0
  ) {
    throw new Error(
      `${label} must be an owned, single-link, non-writable-by-others regular file.`,
    );
  }
};

const sameInode = (left, right) =>
  String(left.dev) === String(right.dev) &&
  String(left.ino) === String(right.ino);

const readStableBytes = async (target, label, maxBytes) => {
  const before = await safeLstat(target);
  assertOwnedRegular(before, label);
  if (
    !Number.isSafeInteger(before.size) ||
    before.size <= 0 ||
    before.size > maxBytes
  ) {
    throw new Error(`${label} has an invalid byte length.`);
  }
  const handle = await open(target, fsConstants.O_RDONLY | NO_FOLLOW);
  try {
    const opened = await handle.stat();
    assertOwnedRegular(opened, label);
    if (!sameInode(before, opened))
      throw new Error(`${label} changed while opening.`);
    const bytes = await handle.readFile();
    const after = await safeLstat(target);
    if (
      !sameInode(opened, after) ||
      bytes.length !== opened.size ||
      bytes.length > maxBytes
    ) {
      throw new Error(`${label} changed while reading.`);
    }
    return Object.freeze({
      bytes: Buffer.from(bytes),
      sha256: sha256(bytes),
      dev: String(opened.dev),
      ino: String(opened.ino),
    });
  } finally {
    await handle.close();
  }
};

const strictCanonicalJson = (bytes, label) => {
  let value;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${label} must be strict UTF-8 JSON.`, { cause });
  }
  if (
    !Buffer.from(bytes).equals(
      canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(value),
    )
  ) {
    throw new Error(
      `${label} must be duplicate-free canonical JSON with one trailing newline.`,
    );
  }
  return value;
};

const loadPinnedJson = async (target, expectedSha256, label) => {
  const loaded = await readStableBytes(target, label, MAX_JSON_BYTES);
  if (loaded.sha256 !== normalizedHash(expectedSha256, `${label} SHA-256`)) {
    throw new Error(`${label} bytes differ from the independent SHA-256 pin.`);
  }
  return Object.freeze({
    ...loaded,
    value: strictCanonicalJson(loaded.bytes, label),
  });
};

const loadPinnedBinary = async (target, expectedSha256, label) => {
  const loaded = await readStableBytes(target, label, MAX_ARTIFACT_BYTES);
  if (loaded.sha256 !== normalizedHash(expectedSha256, `${label} SHA-256`)) {
    throw new Error(`${label} bytes differ from the independent SHA-256 pin.`);
  }
  return loaded;
};

const ensureMissingTarget = async (target, label) => {
  if ((await safeLstat(target, { allowMissing: true })) !== null) {
    throw new Error(
      `${label} already exists; overwrite and reuse are forbidden.`,
    );
  }
};

export const assertSolanaLoaderV3FreshDeployOperatorPaths = async ({
  inputs,
  outputs,
} = {}) => {
  if (!Array.isArray(inputs) || !Array.isArray(outputs)) {
    throw new Error(
      "Fresh-deploy path preflight requires input and output arrays.",
    );
  }
  const normalizedInputs = inputs.map(({ path: input, label }) => ({
    path: canonicalPath(input, label),
    label,
  }));
  const normalizedOutputs = outputs.map(({ path: output, label }) => ({
    path: canonicalPath(output, label),
    label,
  }));
  const all = [...normalizedInputs, ...normalizedOutputs];
  if (new Set(all.map(({ path: target }) => target)).size !== all.length) {
    throw new Error(
      "Fresh-deploy input and output paths must be pairwise distinct.",
    );
  }
  for (const { path: target } of all) {
    const pin = await pinSolanaExactOutputDirectory(target);
    await pin.handle.close();
  }
  const inputIdentities = [];
  for (const input of normalizedInputs) {
    const stat = await safeLstat(input.path);
    assertOwnedRegular(stat, input.label);
    const identity = `${stat.dev}:${stat.ino}`;
    if (inputIdentities.some(({ identity: prior }) => prior === identity)) {
      throw new Error("Fresh-deploy inputs must not alias the same inode.");
    }
    inputIdentities.push({ identity, path: input.path });
  }
  for (const output of normalizedOutputs) {
    await ensureMissingTarget(output.path, output.label);
  }
  return Object.freeze({
    inputs: Object.freeze(normalizedInputs),
    outputs: Object.freeze(normalizedOutputs),
  });
};

const exclusiveBytes = async (target, bytes, directoryPin) => {
  await assertSolanaExactOutputDirectoryPin(directoryPin, target);
  await ensureMissingTarget(target, "Fresh-deploy output");
  const handle = await open(
    target,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | NO_FOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) {
      throw new Error("Fresh-deploy output is not a private single-link file.");
    }
  } finally {
    await handle.close();
  }
  await assertSolanaExactOutputDirectoryPin(directoryPin, target);
  await directoryPin.handle.sync();
  const readback = await readStableBytes(
    target,
    "Fresh-deploy output readback",
    bytes.length,
  );
  if (!readback.bytes.equals(bytes)) {
    throw new Error("Fresh-deploy output readback differs from written bytes.");
  }
};

const reserveFreshDeployReport = async ({ stagingPath, directoryPin }) => {
  await assertSolanaExactOutputDirectoryPin(directoryPin, stagingPath);
  await ensureMissingTarget(stagingPath, "Fresh-deploy report staging file");
  const free = await statfs(path.dirname(stagingPath), { bigint: true });
  const availableBytes = free.bavail * BigInt(free.bsize);
  if (availableBytes < MIN_REPORT_FREE_SPACE_BYTES) {
    throw new Error(
      "Fresh-deploy report filesystem lacks the bounded free-space reserve required before mutation.",
    );
  }
  const handle = await open(
    stagingPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | NO_FOLLOW,
    0o600,
  );
  try {
    await handle.sync();
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size !== 0 ||
      (stat.mode & 0o777) !== 0o600
    ) {
      throw new Error(
        "Fresh-deploy report staging reservation is not exact and private.",
      );
    }
    await directoryPin.handle.sync();
    return {
      stagingPath,
      directoryPin,
      handle,
      dev: String(stat.dev),
      ino: String(stat.ino),
      published: false,
      closed: false,
    };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
};

const writeAllAt = async (handle, bytes, startPosition = 0) => {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      startPosition + offset,
    );
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
      throw new Error("Fresh-deploy durable write stopped before completion.");
    }
    offset += bytesWritten;
  }
};

const readExactFromHandle = async (handle, length) => {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await handle.read(
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0) {
      throw new Error(
        "Fresh-deploy report staging readback ended before its exact boundary.",
      );
    }
    offset += bytesRead;
  }
  return bytes;
};

const publishReservedFreshDeployReport = async ({
  reservation,
  reportPath,
  reportBytes,
}) => {
  if (
    !reservation ||
    reservation.published ||
    reservation.closed ||
    !Buffer.isBuffer(reportBytes) ||
    reportBytes.length <= 0 ||
    reportBytes.length > MAX_REPORT_BYTES
  ) {
    throw new Error("Fresh-deploy report publication request is invalid.");
  }
  await assertSolanaExactOutputDirectoryPin(
    reservation.directoryPin,
    reservation.stagingPath,
  );
  const [pathStat, handleStat] = await Promise.all([
    safeLstat(reservation.stagingPath),
    reservation.handle.stat(),
  ]);
  if (
    !sameInode(pathStat, handleStat) ||
    String(handleStat.dev) !== reservation.dev ||
    String(handleStat.ino) !== reservation.ino ||
    handleStat.nlink !== 1
  ) {
    throw new Error(
      "Fresh-deploy report staging identity changed before publication.",
    );
  }
  await reservation.handle.truncate(0);
  await writeAllAt(reservation.handle, reportBytes);
  await reservation.handle.sync();
  const writtenStat = await reservation.handle.stat();
  if (
    writtenStat.size !== reportBytes.length ||
    !(await readExactFromHandle(reservation.handle, reportBytes.length)).equals(
      reportBytes,
    )
  ) {
    throw new Error(
      "Fresh-deploy report staging readback differs from canonical bytes.",
    );
  }
  await ensureMissingTarget(reportPath, "Fresh-deploy final report");
  await link(reservation.stagingPath, reportPath);
  await reservation.directoryPin.handle.sync();
  const [stagingStat, reportStat] = await Promise.all([
    safeLstat(reservation.stagingPath),
    safeLstat(reportPath),
  ]);
  if (
    !sameInode(stagingStat, reportStat) ||
    !sameInode(reportStat, writtenStat) ||
    stagingStat.nlink !== 2 ||
    reportStat.nlink !== 2
  ) {
    throw new Error(
      "Fresh-deploy report no-replace publication did not preserve one exact inode.",
    );
  }
  await rm(reservation.stagingPath);
  await reservation.directoryPin.handle.sync();
  const finalStat = await safeLstat(reportPath);
  if (!sameInode(finalStat, writtenStat) || finalStat.nlink !== 1) {
    throw new Error(
      "Fresh-deploy final report did not settle as one single-link file.",
    );
  }
  reservation.published = true;
  await reservation.handle.close();
  reservation.closed = true;
  const readback = await readStableBytes(
    reportPath,
    "Fresh-deploy final report readback",
    MAX_REPORT_BYTES,
  );
  if (!readback.bytes.equals(reportBytes)) {
    throw new Error(
      "Fresh-deploy final report readback differs from canonical bytes.",
    );
  }
  return readback;
};

const closeFreshDeployReportReservation = async (
  reservation,
  { removeStaging = false } = {},
) => {
  if (!reservation) return;
  if (!reservation.closed) {
    await reservation.handle.close().catch(() => {});
    reservation.closed = true;
  }
  if (removeStaging && !reservation.published) {
    const stat = await safeLstat(reservation.stagingPath, {
      allowMissing: true,
    });
    if (stat) {
      if (
        String(stat.dev) !== reservation.dev ||
        String(stat.ino) !== reservation.ino
      ) {
        throw new Error(
          "Fresh-deploy report staging identity changed; refusing cleanup.",
        );
      }
      await rm(reservation.stagingPath);
      await reservation.directoryPin.handle.sync();
    }
  }
};

const pinsForTargets = async (targets) => {
  const pins = new Map();
  try {
    for (const target of targets) {
      const directory = path.dirname(target);
      if (!pins.has(directory))
        pins.set(directory, await pinSolanaExactOutputDirectory(target));
    }
    return pins;
  } catch (error) {
    await Promise.all(
      [...pins.values()].map((pin) => pin.handle.close().catch(() => {})),
    );
    throw error;
  }
};

const closePins = async (pins) =>
  Promise.all(
    [...pins.values()].map((pin) => pin.handle.close().catch(() => {})),
  );

const pinFor = (pins, target) => pins.get(path.dirname(target));

const contextKeys = new Set([
  "schema",
  "network",
  "genesisHash",
  "rpcUrl",
  "capturedAt",
  "reviewedContext",
]);
const reviewedContextKeys = new Set([
  "network",
  "genesisHash",
  "finalizedSlot",
  "expiresAtFinalizedSlot",
  "solanaCoreVersion",
  "featureSet",
  "sbpfV3EnableFeatureId",
  "sbpfV3EnableFeatureActivationSlot",
  "sbpfV3EnableFeatureAccountDataSha256",
]);

const validateContext = (value, expectedRpcUrl) => {
  exactKeys(value, contextKeys, "Fresh-deploy context snapshot");
  exactKeys(
    value.reviewedContext,
    reviewedContextKeys,
    "Reviewed Solana context",
  );
  const reviewed = value.reviewedContext;
  if (
    value.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SCHEMA ||
    value.network !== SOLANA_TESTNET_NETWORK ||
    value.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
    value.rpcUrl !== expectedRpcUrl ||
    reviewed.network !== SOLANA_TESTNET_NETWORK ||
    reviewed.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
    reviewed.sbpfV3EnableFeatureId !== SOLANA_SBPF_V3_ENABLE_FEATURE_ID
  ) {
    throw new Error(
      "Fresh-deploy context does not bind canonical Solana testnet.",
    );
  }
  if (!Number.isFinite(Date.parse(value.capturedAt))) {
    throw new Error("Fresh-deploy context timestamp is invalid.");
  }
  positiveInteger(
    reviewed.finalizedSlot,
    "Reviewed finalized slot",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  positiveInteger(
    reviewed.expiresAtFinalizedSlot,
    "Reviewed expiry slot",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (reviewed.expiresAtFinalizedSlot <= reviewed.finalizedSlot) {
    throw new Error("Reviewed Solana context is already expired.");
  }
  positiveInteger(
    reviewed.featureSet,
    "Reviewed feature set",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  positiveInteger(
    reviewed.sbpfV3EnableFeatureActivationSlot,
    "Reviewed SBPF V3 activation slot",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  normalizedHash(
    reviewed.sbpfV3EnableFeatureAccountDataSha256,
    "Reviewed SBPF V3 feature account hash",
  );
  if (
    typeof reviewed.solanaCoreVersion !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(
      reviewed.solanaCoreVersion,
    )
  ) {
    throw new Error("Reviewed Solana core version is invalid.");
  }
  return Object.freeze({ ...reviewed });
};

const readLiveContext = async (connection) => {
  const [genesisHash, version, finalizedSlot] = await Promise.all([
    connection.getGenesisHash(),
    connection.getVersion(),
    connection.getSlot("finalized"),
  ]);
  if (genesisHash !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error("RPC is not canonical Solana testnet.");
  }
  if (
    !Number.isSafeInteger(finalizedSlot) ||
    finalizedSlot <= 0 ||
    typeof version?.["solana-core"] !== "string" ||
    !Number.isSafeInteger(version?.["feature-set"])
  ) {
    throw new Error(
      "Solana finalized context or version response is malformed.",
    );
  }
  const feature = await connection.getAccountInfoAndContext(
    new PublicKey(SOLANA_SBPF_V3_ENABLE_FEATURE_ID),
    { commitment: "finalized", minContextSlot: finalizedSlot },
  );
  const account = feature?.value;
  const data = Buffer.from(account?.data ?? []);
  if (
    !Number.isSafeInteger(feature?.context?.slot) ||
    feature.context.slot < finalizedSlot ||
    account?.owner?.toBase58?.() !== SOLANA_FEATURE_PROGRAM_ID ||
    account?.executable !== false ||
    data.length !== 9 ||
    data[0] !== 1
  ) {
    throw new Error(
      "Solana SBPF V3 enable feature account is not exact and active.",
    );
  }
  const activation = data.readBigUInt64LE(1);
  if (activation <= 0n || activation > BigInt(finalizedSlot)) {
    throw new Error("Solana SBPF V3 activation is not finalized.");
  }
  return Object.freeze({
    genesisHash,
    finalizedSlot,
    solanaCoreVersion: version["solana-core"],
    featureSet: version["feature-set"],
    sbpfV3EnableFeatureActivationSlot: Number(activation),
    sbpfV3EnableFeatureAccountDataSha256: solanaSha256(data),
  });
};

export const snapshotSolanaLoaderV3FreshDeployContext = async (
  options,
  {
    connectionFactory = (url) => new Connection(url, "finalized"),
    now = () => new Date(),
  } = {},
) => {
  const rpcUrl = normalizeRpcUrl(options["solana-rpc-url"]);
  const validForSlots = positiveInteger(
    options["valid-for-slots"],
    "Fresh-deploy context slot window",
    MIN_CONTEXT_SLOTS,
    MAX_CONTEXT_SLOTS,
  );
  const out = canonicalPath(options.out, "Fresh-deploy context output");
  await ensureMissingTarget(out, "Fresh-deploy context output");
  const pin = await pinSolanaExactOutputDirectory(out);
  try {
    const live = await readLiveContext(connectionFactory(rpcUrl));
    const expiresAtFinalizedSlot = live.finalizedSlot + validForSlots;
    if (!Number.isSafeInteger(expiresAtFinalizedSlot)) {
      throw new Error(
        "Fresh-deploy context expiry exceeds the safe-integer range.",
      );
    }
    const context = {
      schema: SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SCHEMA,
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      rpcUrl,
      capturedAt: now().toISOString(),
      reviewedContext: {
        network: SOLANA_TESTNET_NETWORK,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        finalizedSlot: live.finalizedSlot,
        expiresAtFinalizedSlot,
        solanaCoreVersion: live.solanaCoreVersion,
        featureSet: live.featureSet,
        sbpfV3EnableFeatureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
        sbpfV3EnableFeatureActivationSlot:
          live.sbpfV3EnableFeatureActivationSlot,
        sbpfV3EnableFeatureAccountDataSha256:
          live.sbpfV3EnableFeatureAccountDataSha256,
      },
    };
    const bytes = canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(context);
    await exclusiveBytes(out, bytes, pin);
    return Object.freeze({ context, path: out, sha256: sha256(bytes) });
  } finally {
    await pin.handle.close();
  }
};

const assertLiveMatchesReviewedContext = async (connection, reviewed) => {
  const live = await readLiveContext(connection);
  if (
    live.solanaCoreVersion !== reviewed.solanaCoreVersion ||
    live.featureSet !== reviewed.featureSet ||
    live.sbpfV3EnableFeatureActivationSlot !==
      reviewed.sbpfV3EnableFeatureActivationSlot ||
    live.sbpfV3EnableFeatureAccountDataSha256 !==
      reviewed.sbpfV3EnableFeatureAccountDataSha256 ||
    live.finalizedSlot < reviewed.finalizedSlot ||
    live.finalizedSlot > reviewed.expiresAtFinalizedSlot
  ) {
    throw new Error(
      "Live Solana context differs from the reviewed bounded snapshot.",
    );
  }
  return live;
};

const acquireLease = async ({ path: target, contextSha256, pin }) => {
  const normalizedContextSha256 = normalizedHash(
    contextSha256,
    "Fresh-deploy lease context SHA-256",
  );
  await assertSolanaExactOutputDirectoryPin(pin, target);
  await ensureMissingTarget(target, "Fresh-deploy ceremony lease");
  const handle = await open(
    target,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | NO_FOLLOW,
    0o600,
  );
  const token = `0x${randomBytes(32).toString("hex")}`;
  const value = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_OPERATOR_LEASE_SCHEMA,
    type: "context-claim",
    pid: process.pid,
    token,
    contextSha256: normalizedContextSha256,
    acquiredAt: new Date().toISOString(),
  };
  const initialBytes =
    canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(value);
  await writeAllAt(handle, initialBytes);
  await handle.sync();
  await pin.handle.sync();
  const stat = await handle.stat();
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    stat.size !== initialBytes.length ||
    (stat.mode & 0o777) !== 0o600
  ) {
    throw new Error("Fresh-deploy ceremony lease is not exact and private.");
  }
  return Object.freeze({
    target,
    handle,
    token,
    dev: String(stat.dev),
    ino: String(stat.ino),
    pin,
    bytes: initialBytes,
  });
};

const bindLeaseToPlan = async (lease, { operationId, planSha256 }) => {
  const normalizedOperationId = normalizedHash(
    operationId,
    "Fresh-deploy lease operation id",
  );
  const normalizedPlanSha256 = normalizedHash(
    planSha256,
    "Fresh-deploy lease plan SHA-256",
  );
  await assertSolanaExactOutputDirectoryPin(lease.pin, lease.target);
  const [byPath, byHandle] = await Promise.all([
    safeLstat(lease.target),
    lease.handle.stat(),
  ]);
  if (
    !sameInode(byPath, byHandle) ||
    String(byHandle.dev) !== lease.dev ||
    String(byHandle.ino) !== lease.ino ||
    byHandle.nlink !== 1 ||
    byHandle.size !== lease.bytes.length ||
    (byHandle.mode & 0o777) !== 0o600
  ) {
    throw new Error("Fresh-deploy lease identity changed before plan binding.");
  }
  const bindingBytes = canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes({
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_OPERATOR_LEASE_SCHEMA,
    type: "plan-bound",
    operationId: normalizedOperationId,
    planSha256: normalizedPlanSha256,
    boundAt: new Date().toISOString(),
  });
  const expectedBytes = Buffer.concat([lease.bytes, bindingBytes]);
  if (expectedBytes.length > MAX_LEASE_BYTES) {
    throw new Error("Fresh-deploy plan-bound lease exceeds its exact limit.");
  }
  await writeAllAt(lease.handle, bindingBytes, lease.bytes.length);
  await lease.handle.sync();
  await assertSolanaExactOutputDirectoryPin(lease.pin, lease.target);
  await lease.pin.handle.sync();
  const settled = await lease.handle.stat();
  if (
    String(settled.dev) !== lease.dev ||
    String(settled.ino) !== lease.ino ||
    settled.nlink !== 1 ||
    settled.size !== expectedBytes.length ||
    !(await readExactFromHandle(lease.handle, expectedBytes.length)).equals(
      expectedBytes,
    )
  ) {
    throw new Error("Fresh-deploy plan binding was not durably retained.");
  }
  return Object.freeze({ ...lease, bytes: expectedBytes });
};

const releaseLease = async (lease) => {
  await assertSolanaExactOutputDirectoryPin(lease.pin, lease.target);
  const [byPath, byHandle] = await Promise.all([
    safeLstat(lease.target),
    lease.handle.stat(),
  ]);
  if (
    !sameInode(byPath, byHandle) ||
    String(byHandle.dev) !== lease.dev ||
    String(byHandle.ino) !== lease.ino
  ) {
    throw new Error("Fresh-deploy lease identity changed; refusing release.");
  }
  await rm(lease.target);
  await lease.pin.handle.sync();
  await lease.handle.close();
};

export const createDurableSolanaLoaderV3FreshDeployJournalAdapter = async ({
  journalPath,
  operationId,
  planSha256,
  directoryPin,
} = {}) => {
  const target = canonicalPath(journalPath, "Fresh-deploy journal");
  const normalizedOperationId = normalizedHash(
    operationId,
    "Fresh-deploy journal operation id",
  );
  const normalizedPlanSha256 = normalizedHash(
    planSha256,
    "Fresh-deploy journal plan SHA-256",
  );
  const journalId = `fresh-${operationId.slice(2, 34)}`;
  let handle = null;
  let identity = null;
  let claimed = false;
  let completed = false;
  let lastSequence = 0;
  let claimedIdentity = null;
  const operationJournal = async (event, eventSha256) => {
    exactKeys(
      event,
      new Set([
        "schema",
        "sequence",
        "type",
        "network",
        "genesisHash",
        "operationId",
        "planSha256",
        "journalId",
        "payerAddress",
        "deploymentAuthorityAddress",
        "programs",
        "details",
      ]),
      "Fresh-deploy public journal event",
    );
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA ||
      event.network !== SOLANA_TESTNET_NETWORK ||
      event.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
      event.operationId !== normalizedOperationId ||
      event.planSha256 !== normalizedPlanSha256 ||
      ![
        "claim",
        "intent",
        "resolution",
        "ambiguous",
        "complete",
        "halt",
      ].includes(event.type) ||
      !isRecord(event.details) ||
      !Array.isArray(event.programs) ||
      event.programs.length !== 3
    ) {
      throw new Error("Fresh-deploy public journal event is malformed.");
    }
    for (const [index, program] of event.programs.entries()) {
      exactKeys(
        program,
        new Set([
          "role",
          "programId",
          "programdataAddress",
          "bufferAddress",
          "artifactSha256",
        ]),
        `Fresh-deploy public journal program ${index}`,
      );
      if (program.role !== SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER[index]) {
        throw new Error(
          "Fresh-deploy public journal program order is invalid.",
        );
      }
      for (const [value, label] of [
        [program.programId, "Program id"],
        [program.programdataAddress, "ProgramData address"],
        [program.bufferAddress, "buffer address"],
      ]) {
        try {
          if (new PublicKey(value).toBase58() !== value) throw new Error(label);
        } catch (cause) {
          throw new Error(`Fresh-deploy public journal ${label} is invalid.`, {
            cause,
          });
        }
      }
      normalizedHash(
        program.artifactSha256,
        `Fresh-deploy public journal ${program.role} artifact SHA-256`,
      );
    }
    for (const [value, label] of [
      [event.payerAddress, "payer"],
      [event.deploymentAuthorityAddress, "deployment authority"],
    ]) {
      try {
        if (new PublicKey(value).toBase58() !== value) throw new Error(label);
      } catch (cause) {
        throw new Error(`Fresh-deploy public journal ${label} is invalid.`, {
          cause,
        });
      }
    }
    if (event.sequence !== lastSequence + 1) {
      throw new Error(
        "Fresh-deploy public journal sequence is not contiguous.",
      );
    }
    const eventBytes = Buffer.from(JSON.stringify(event), "utf8");
    if (
      eventBytes.length === 0 ||
      eventBytes.length > MAX_JOURNAL_EVENT_BYTES ||
      sha256(eventBytes) !== eventSha256
    ) {
      throw new Error("Fresh-deploy public journal event hash is not exact.");
    }
    if (
      /"(?:secret|private.?key|raw.?transaction|signed.?transaction)"/iu.test(
        eventBytes.toString("utf8"),
      )
    ) {
      throw new Error(
        "Fresh-deploy public journal contains a forbidden field.",
      );
    }
    if (event.type === "claim") {
      if (claimed || handle)
        throw new Error("Fresh-deploy journal claim is duplicated.");
      if (event.journalId !== null) {
        throw new Error(
          "Fresh-deploy journal claim must precede journal id assignment.",
        );
      }
      await assertSolanaExactOutputDirectoryPin(directoryPin, target);
      await ensureMissingTarget(target, "Fresh-deploy journal");
      handle = await open(
        target,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_RDWR |
          NO_FOLLOW,
        0o600,
      );
      identity = await handle.stat();
      claimed = true;
      claimedIdentity = canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes({
        payerAddress: event.payerAddress,
        deploymentAuthorityAddress: event.deploymentAuthorityAddress,
        programs: event.programs,
      });
    } else if (!claimed || !handle) {
      throw new Error("Fresh-deploy journal event precedes its durable claim.");
    } else if (
      event.journalId !== journalId ||
      !canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes({
        payerAddress: event.payerAddress,
        deploymentAuthorityAddress: event.deploymentAuthorityAddress,
        programs: event.programs,
      }).equals(claimedIdentity)
    ) {
      throw new Error(
        "Fresh-deploy public journal identity changed after claim.",
      );
    }
    await assertSolanaExactOutputDirectoryPin(directoryPin, target);
    const current = await handle.stat();
    const byPath = await safeLstat(target);
    if (!sameInode(current, identity) || !sameInode(current, byPath)) {
      throw new Error("Fresh-deploy journal identity changed during append.");
    }
    const line = Buffer.concat([eventBytes, Buffer.from("\n")]);
    let offset = 0;
    while (offset < line.length) {
      const { bytesWritten } = await handle.write(
        line,
        offset,
        line.length - offset,
        null,
      );
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
        throw new Error(
          "Fresh-deploy journal append stopped before completion.",
        );
      }
      offset += bytesWritten;
    }
    await handle.sync();
    await assertSolanaExactOutputDirectoryPin(directoryPin, target);
    await directoryPin.handle.sync();
    lastSequence = event.sequence;
    if (event.type === "complete") completed = true;
    return event.type === "claim"
      ? { durable: true, accepted: true, eventSha256, journalId }
      : { durable: true, recorded: true, eventSha256, journalId };
  };
  return Object.freeze({
    operationJournal,
    get claimed() {
      return claimed;
    },
    get completed() {
      return completed;
    },
    get journalId() {
      return journalId;
    },
    close: async () => {
      await handle?.close();
      handle = null;
    },
  });
};

const runtimeSignerSource = (signer, secretView) => ({
  signer,
  secretViews: [secretView],
  runtimeOnly: true,
  generatedAtRuntime: true,
  fileBacked: false,
  entropySource: "os-csprng",
});

const zeroizeSignerViews = (secretViews) => {
  const seen = [];
  for (const value of secretViews) {
    if (!(value instanceof Uint8Array)) continue;
    if (
      seen.some(
        (prior) =>
          prior.buffer === value.buffer &&
          prior.byteOffset === value.byteOffset &&
          prior.byteLength === value.byteLength,
      )
    )
      continue;
    seen.push(value);
    value.fill(0);
  }
  if (seen.some((value) => !value.every((byte) => byte === 0))) {
    throw new Error("Fresh-deploy signer zeroization was incomplete.");
  }
};

const validateConfirmation = (value, template) => {
  const expectedKeys = new Set(Object.keys(template));
  exactKeys(value, expectedKeys, "Fresh-deploy irreversible confirmation");
  exactKeys(
    value.programIds,
    new Set(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER),
    "Confirmed program ids",
  );
  const expected = {
    ...template,
    submit: true,
    acknowledgePermanentProgramIds: true,
    acknowledgeOneWayAuthorityRevocation: true,
  };
  if (
    !canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes(value).equals(
      canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes(expected),
    )
  ) {
    throw new Error(
      "Fresh-deploy confirmation is not the exact irreversible reviewed decision.",
    );
  }
  if (value.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA) {
    throw new Error("Fresh-deploy confirmation schema is unsupported.");
  }
  // The independently pinned file uses sorted canonical JSON. The core also
  // requires the reviewed role order to be preserved in the in-memory object,
  // so reconstruct that exact object only after the canonical bytes agree.
  return Object.freeze(expected);
};

const waitForConfirmation = async ({
  confirmationPath,
  hashPath,
  confirmationDirectoryPin,
  hashDirectoryPin,
  confirmationTemplate,
  reviewedContext,
  connection,
  timeoutMs,
  now,
  sleep,
  aborted,
}) => {
  const deadline = now() + timeoutMs;
  let lastSlotCheck = 0;
  for (;;) {
    if (aborted())
      throw new Error(
        "Fresh-deploy review wait was interrupted before mutation.",
      );
    if (now() > deadline)
      throw new Error("Fresh-deploy independent review window expired.");
    if (now() - lastSlotCheck >= 1_000) {
      const slot = await connection.getSlot("finalized");
      if (
        !Number.isSafeInteger(slot) ||
        slot < reviewedContext.finalizedSlot ||
        slot > reviewedContext.expiresAtFinalizedSlot
      ) {
        throw new Error(
          "Fresh-deploy reviewed Solana slot window expired during confirmation.",
        );
      }
      lastSlotCheck = now();
    }
    const [confirmationStat, hashStat] = await Promise.all([
      safeLstat(confirmationPath, { allowMissing: true }),
      safeLstat(hashPath, { allowMissing: true }),
    ]);
    if (confirmationStat && hashStat) {
      await Promise.all([
        assertSolanaExactOutputDirectoryPin(
          confirmationDirectoryPin,
          confirmationPath,
        ),
        assertSolanaExactOutputDirectoryPin(hashDirectoryPin, hashPath),
      ]);
      break;
    }
    await sleep(250);
  }
  const hashArtifact = await readStableBytes(
    hashPath,
    "Independent confirmation SHA-256 sidecar",
    67,
  );
  const hashText = hashArtifact.bytes.toString("utf8");
  if (!/^0x[0-9a-f]{64}\n$/u.test(hashText)) {
    throw new Error(
      "Independent confirmation SHA-256 sidecar is not one canonical hash line.",
    );
  }
  const expectedSha256 = normalizedHash(
    hashText.trim(),
    "Independent confirmation SHA-256",
  );
  const confirmation = await loadPinnedJson(
    confirmationPath,
    expectedSha256,
    "Irreversible fresh-deploy confirmation",
  );
  await Promise.all([
    assertSolanaExactOutputDirectoryPin(
      confirmationDirectoryPin,
      confirmationPath,
    ),
    assertSolanaExactOutputDirectoryPin(hashDirectoryPin, hashPath),
  ]);
  return Object.freeze({
    value: validateConfirmation(confirmation.value, confirmationTemplate),
    sha256: confirmation.sha256,
  });
};

const artifactOptionNames = Object.freeze({
  nativeVerifier: "native-verifier",
  destination: "destination",
  source: "source",
});

const manualRecoveryError = (
  error,
  journalPath,
  leasePath,
  reportStagingPath,
) => {
  const wrapped = new Error(
    `${error instanceof Error ? error.message : String(error)} Manual recovery is required; inspect ${journalPath}, retained lease ${leasePath}, and retained report staging file ${reportStagingPath}. Automatic retry is forbidden.`,
    { cause: error },
  );
  wrapped.name = "SolanaLoaderV3FreshDeployOperatorRecoveryError";
  return wrapped;
};

export const runSolanaLoaderV3FreshDeployOperator = async (
  options,
  dependencies = {},
) => {
  const connectionFactory =
    dependencies.connectionFactory ??
    ((url) => new Connection(url, "finalized"));
  const keypairFactory =
    dependencies.keypairFactory ?? (() => Keypair.generate());
  const deploy =
    dependencies.deployFreshImmutableSolanaSccpPrograms ??
    deployFreshImmutableSolanaSccpPrograms;
  const buildPlan =
    dependencies.buildSolanaLoaderV3FreshDeployPlan ??
    buildSolanaLoaderV3FreshDeployPlan;
  const canonicalReportBytes =
    dependencies.canonicalSolanaLoaderV3FreshDeployReportBytes ??
    canonicalSolanaLoaderV3FreshDeployReportBytes;
  const validateReport =
    dependencies.validateSolanaLoaderV3FreshDeployReport ??
    validateSolanaLoaderV3FreshDeployReport;
  const validatorFactory =
    dependencies.authenticatedValidatorFactory ??
    createAuthenticatedSolanaLoaderV3FreshSbfValidationAdapter;
  const now = dependencies.now ?? (() => Date.now());
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const notify =
    dependencies.notify ??
    ((value) => process.stdout.write(`${JSON.stringify(value)}\n`));

  if (options.submit !== "true") {
    throw new Error("The irreversible ceremony requires exact --submit true.");
  }
  const rpcUrl = normalizeRpcUrl(options["solana-rpc-url"]);
  const reviewTimeoutMs = positiveInteger(
    options["review-timeout-ms"],
    "Fresh-deploy review timeout",
    MIN_REVIEW_TIMEOUT_MS,
    MAX_REVIEW_TIMEOUT_MS,
  );
  const validatorBin = canonicalPath(
    options["validator-bin"] ?? DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
    "Authenticated SBF validator binary",
  );
  const expectedContextSha256 = normalizedHash(
    options["expected-context-sha256"],
    "Reviewed context SHA-256",
  );
  const expectedValidatorSha256 = normalizedHash(
    options["expected-validator-sha256"],
    "Authenticated SBF validator SHA-256",
  );
  const contextPath = canonicalPath(
    options.context,
    "Reviewed context snapshot",
  );
  const pathsByRole = Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => {
      const option = artifactOptionNames[role];
      return [
        role,
        {
          artifact: canonicalPath(
            options[`${option}-artifact`],
            `${role} artifact`,
          ),
          artifactSha256: normalizedHash(
            options[`${option}-artifact-sha256`],
            `${role} artifact SHA-256`,
          ),
          evidence: canonicalPath(
            options[`${option}-sbf-evidence`],
            `${role} SBF evidence`,
          ),
          evidenceSha256: normalizedHash(
            options[`${option}-sbf-evidence-sha256`],
            `${role} SBF evidence SHA-256`,
          ),
        },
      ];
    }),
  );
  const planPath = canonicalPath(options.plan, "Fresh-deploy plan output");
  const templatePath = canonicalPath(
    options["confirmation-template"],
    "Fresh-deploy confirmation template output",
  );
  const confirmationPath = canonicalPath(
    options.confirmation,
    "Fresh-deploy confirmation input",
  );
  const confirmationHashPath = canonicalPath(
    options["confirmation-sha256-file"],
    "Independent confirmation SHA-256 sidecar",
  );
  const journalPath = canonicalPath(options.journal, "Fresh-deploy journal");
  const reportPath = canonicalPath(
    options.report,
    "Fresh-deploy report output",
  );
  const reportStagingPath = `${reportPath}.staging`;
  const leasePath = `${journalPath}.lock`;

  const inputEntries = [
    { path: contextPath, label: "Reviewed context snapshot" },
    { path: validatorBin, label: "Authenticated SBF validator binary" },
    ...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.flatMap((role) => [
      { path: pathsByRole[role].artifact, label: `${role} artifact` },
      { path: pathsByRole[role].evidence, label: `${role} SBF evidence` },
    ]),
  ];
  const outputEntries = [
    { path: planPath, label: "Fresh-deploy plan output" },
    { path: templatePath, label: "Fresh-deploy confirmation template output" },
    { path: confirmationPath, label: "Fresh-deploy confirmation input" },
    {
      path: confirmationHashPath,
      label: "Independent confirmation SHA-256 sidecar",
    },
    { path: journalPath, label: "Fresh-deploy journal" },
    { path: leasePath, label: "Fresh-deploy ceremony lease" },
    {
      path: reportStagingPath,
      label: "Fresh-deploy report staging reservation",
    },
    { path: reportPath, label: "Fresh-deploy report output" },
  ];
  await assertSolanaLoaderV3FreshDeployOperatorPaths({
    inputs: inputEntries,
    outputs: outputEntries,
  });

  await loadPinnedBinary(
    validatorBin,
    expectedValidatorSha256,
    "Authenticated SBF validator binary",
  );
  const context = await loadPinnedJson(
    contextPath,
    expectedContextSha256,
    "Reviewed context snapshot",
  );
  const reviewedContext = validateContext(context.value, rpcUrl);
  const artifactBytesByRole = {};
  const evidenceBytesByRole = {};
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    artifactBytesByRole[role] = (
      await loadPinnedBinary(
        pathsByRole[role].artifact,
        pathsByRole[role].artifactSha256,
        `${role} SBF artifact`,
      )
    ).bytes;
    evidenceBytesByRole[role] = (
      await loadPinnedBinary(
        pathsByRole[role].evidence,
        pathsByRole[role].evidenceSha256,
        `${role} SBF validation evidence`,
      )
    ).bytes;
  }
  const validateSbfExecutable = validatorFactory({
    artifactBytesByRole,
    pinnedEvidenceBytesByRole: evidenceBytesByRole,
    expectedArtifactSha256ByRole: Object.fromEntries(
      SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
        role,
        pathsByRole[role].artifactSha256,
      ]),
    ),
    expectedEvidenceSha256ByRole: Object.fromEntries(
      SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
        role,
        pathsByRole[role].evidenceSha256,
      ]),
    ),
    expectedValidatorSha256,
    validatorBin,
    validatorRoot:
      dependencies.validatorRoot ?? DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
    validatorSourceRoot:
      dependencies.validatorSourceRoot ?? DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
    validationMode: "production",
    timeoutMs:
      dependencies.validatorTimeoutMs ?? SOLANA_SBF_VALIDATOR_TIMEOUT_MS,
  });
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    await validateSbfExecutable({
      role,
      executableBytes: Buffer.from(artifactBytesByRole[role]),
      sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
      validatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
      validatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
      policy: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY,
      policySha256: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
      artifactSha256: pathsByRole[role].artifactSha256,
      codeHash: solanaBlake2b256(artifactBytesByRole[role]),
      executableLength: artifactBytesByRole[role].length,
      requiredChecks: [
        ...SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS,
      ],
    });
  }
  const connection = connectionFactory(rpcUrl);
  await assertLiveMatchesReviewedContext(connection, reviewedContext);

  const outputTargets = outputEntries.map(({ path: target }) => target);
  const pins = await pinsForTargets(outputTargets);
  const signers = [];
  const signerSecretViews = [];
  let lease = null;
  let journal = null;
  let reportReservation = null;
  let reportPersisted = false;
  let signersZeroized = false;
  let aborted = false;
  let mutationInFlight = false;
  let result = null;
  let pendingError = null;
  const signalHandler = () => {
    aborted = true;
  };
  if (dependencies.installSignalHandlers !== false) {
    process.on("SIGINT", signalHandler);
    process.on("SIGTERM", signalHandler);
  }
  try {
    lease = await acquireLease({
      path: leasePath,
      contextSha256: sha256(context.bytes),
      pin: pinFor(pins, leasePath),
    });
    for (let index = 0; index < 8; index += 1) {
      const signer = keypairFactory();
      const secretView = signer?._keypair?.secretKey;
      if (secretView instanceof Uint8Array) {
        signerSecretViews.push(secretView);
      }
      if (
        signer?.publicKey?.toBase58?.() === undefined ||
        !(secretView instanceof Uint8Array) ||
        secretView.length !== 64
      ) {
        throw new Error(
          "OS-CSPRNG signer factory returned malformed key material.",
        );
      }
      signers.push(signer);
    }
    const addresses = signers.map((signer) => signer.publicKey.toBase58());
    if (new Set(addresses).size !== 8) {
      throw new Error(
        "Fresh-deploy runtime signer identities must all be distinct.",
      );
    }
    const [payer, authority, ...roleSigners] = signers;
    const publicSignerIdsByRole = Object.fromEntries(
      SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role, index) => [
        role,
        {
          programId: roleSigners[index * 2].publicKey.toBase58(),
          bufferAddress: roleSigners[index * 2 + 1].publicKey.toBase58(),
        },
      ]),
    );
    const operationId = dependencies.operationIdFactory
      ? normalizedHash(
          dependencies.operationIdFactory(),
          "Fresh-deploy operation id",
        )
      : `0x${randomBytes(32).toString("hex")}`;
    const built = buildPlan({
      operationId,
      payerAddress: payer.publicKey.toBase58(),
      deploymentAuthorityAddress: authority.publicKey.toBase58(),
      publicSignerIdsByRole,
      artifactBytesByRole,
      sbfValidationEvidenceBytesByRole: evidenceBytesByRole,
      expectedArtifactSha256ByRole: Object.fromEntries(
        SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
          role,
          pathsByRole[role].artifactSha256,
        ]),
      ),
      expectedSbfValidationEvidenceSha256ByRole: Object.fromEntries(
        SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
          role,
          pathsByRole[role].evidenceSha256,
        ]),
      ),
      reviewedContext,
    });
    if (
      !built.planBytes.equals(
        canonicalSolanaLoaderV3FreshDeployPlanBytes(built.plan),
      )
    ) {
      throw new Error("Fresh-deploy plan bytes are not canonical.");
    }
    lease = await bindLeaseToPlan(lease, {
      operationId,
      planSha256: built.planSha256,
    });
    const templateBytes =
      canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes(
        built.confirmationTemplate,
      );
    await exclusiveBytes(planPath, built.planBytes, pinFor(pins, planPath));
    await exclusiveBytes(
      templatePath,
      templateBytes,
      pinFor(pins, templatePath),
    );
    notify({
      status: "awaiting-independent-confirmation",
      network: SOLANA_TESTNET_NETWORK,
      planPath,
      planSha256: built.planSha256,
      confirmationTemplatePath: templatePath,
      confirmationTemplateSha256: sha256(templateBytes),
      confirmationPath,
      confirmationSha256File: confirmationHashPath,
      payerAddress: payer.publicKey.toBase58(),
      expiresAtFinalizedSlot: reviewedContext.expiresAtFinalizedSlot,
      reviewTimeoutMs,
    });
    const reviewedConfirmation = await waitForConfirmation({
      confirmationPath,
      hashPath: confirmationHashPath,
      confirmationDirectoryPin: pinFor(pins, confirmationPath),
      hashDirectoryPin: pinFor(pins, confirmationHashPath),
      confirmationTemplate: built.confirmationTemplate,
      reviewedContext,
      connection,
      timeoutMs: reviewTimeoutMs,
      now,
      sleep,
      aborted: () => aborted,
    });
    if (aborted)
      throw new Error("Fresh-deploy ceremony was interrupted before mutation.");
    await assertLiveMatchesReviewedContext(connection, reviewedContext);
    journal = await createDurableSolanaLoaderV3FreshDeployJournalAdapter({
      journalPath,
      operationId,
      planSha256: built.planSha256,
      directoryPin: pinFor(pins, journalPath),
    });
    const signerMap = new Map([
      ["payer", { signer: payer, secretView: signerSecretViews[0] }],
      [
        "deploymentAuthority",
        { signer: authority, secretView: signerSecretViews[1] },
      ],
      ...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.flatMap((role, index) => [
        [
          `program:${role}`,
          {
            signer: roleSigners[index * 2],
            secretView: signerSecretViews[2 + index * 2],
          },
        ],
        [
          `buffer:${role}`,
          {
            signer: roleSigners[index * 2 + 1],
            secretView: signerSecretViews[3 + index * 2],
          },
        ],
      ]),
    ]);
    const issued = new Set();
    const signerFactory = async ({ role, address }) => {
      if (issued.has(role))
        throw new Error(`Runtime signer ${role} was requested more than once.`);
      const source = signerMap.get(role);
      if (!source || source.signer.publicKey.toBase58() !== address) {
        throw new Error(
          `Runtime signer ${role} does not match the reviewed plan.`,
        );
      }
      issued.add(role);
      return runtimeSignerSource(source.signer, source.secretView);
    };
    if (aborted) {
      throw new Error(
        "Fresh-deploy ceremony was interrupted at the final pre-mutation boundary.",
      );
    }
    reportReservation = await reserveFreshDeployReport({
      stagingPath: reportStagingPath,
      directoryPin: pinFor(pins, reportStagingPath),
    });
    if (aborted) {
      throw new Error(
        "Fresh-deploy ceremony was interrupted before the irreversible core boundary.",
      );
    }
    mutationInFlight = true;
    const report = await deploy({
      connection,
      planBytes: built.planBytes,
      expectedPlanSha256: built.planSha256,
      artifactBytesByRole,
      confirmation: reviewedConfirmation.value,
      signerFactory,
      dependencies: {
        operationJournal: journal.operationJournal,
        validateSbfExecutable,
      },
    });
    mutationInFlight = false;
    if (issued.size !== 8) {
      throw new Error(
        "Fresh-deploy core did not consume exactly eight runtime signer roles.",
      );
    }
    zeroizeSignerViews(signerSecretViews);
    signersZeroized = true;
    const reportBytes = canonicalReportBytes(report);
    validateReport({
      reportBytes,
      expectedReportSha256: sha256(reportBytes),
    });
    await publishReservedFreshDeployReport({
      reservation: reportReservation,
      reportPath,
      reportBytes,
    });
    reportPersisted = true;
    await journal.close();
    await releaseLease(lease);
    lease = null;
    try {
      notify({
        status: "complete",
        reportPath,
        reportSha256: sha256(reportBytes),
        planSha256: built.planSha256,
        journalPath,
        journalId: journal.journalId,
        interruptedAfterMutationStarted: aborted,
      });
    } catch {
      // Completion truth is the fsynced report and journal, not stdout.
    }
    result = Object.freeze({
      report,
      reportPath,
      reportSha256: sha256(reportBytes),
      planPath,
      planSha256: built.planSha256,
      journalPath,
    });
  } catch (error) {
    mutationInFlight = false;
    await journal?.close().catch(() => {});
    if (journal?.claimed || journal?.completed || reportPersisted) {
      await closeFreshDeployReportReservation(reportReservation, {
        removeStaging: false,
      }).catch(() => {});
      await lease?.handle?.close().catch(() => {});
      pendingError = manualRecoveryError(
        error,
        journalPath,
        leasePath,
        reportStagingPath,
      );
    } else {
      try {
        zeroizeSignerViews(signerSecretViews);
        signersZeroized = true;
      } catch (zeroizationError) {
        await lease?.handle?.close().catch(() => {});
        pendingError = new AggregateError(
          [error, zeroizationError],
          "Fresh-deploy failed before mutation and signer zeroization was incomplete; the ceremony lease was retained.",
        );
      }
      if (!pendingError) {
        try {
          await closeFreshDeployReportReservation(reportReservation, {
            removeStaging: true,
          });
        } catch (reservationError) {
          pendingError = new AggregateError(
            [error, reservationError],
            "Fresh-deploy failed before mutation and its report reservation could not be safely removed.",
          );
        }
      }
      if (!pendingError && lease) {
        try {
          await releaseLease(lease);
          lease = null;
        } catch (releaseError) {
          pendingError = new AggregateError(
            [error, releaseError],
            "Fresh-deploy failed before mutation and its ceremony lease could not be safely released.",
          );
        }
      }
      pendingError ??= error;
    }
  } finally {
    if (dependencies.installSignalHandlers !== false) {
      process.removeListener("SIGINT", signalHandler);
      process.removeListener("SIGTERM", signalHandler);
    }
    let zeroizationError = null;
    if (!signersZeroized) {
      try {
        zeroizeSignerViews(signerSecretViews);
        signersZeroized = true;
      } catch (error) {
        zeroizationError = error;
      }
    }
    try {
      await closePins(pins);
    } catch (error) {
      pendingError = pendingError
        ? new AggregateError(
            [pendingError, error],
            "Fresh-deploy failed and output-directory pin cleanup was incomplete.",
          )
        : error;
    }
    if (zeroizationError) {
      const normalizedZeroizationError =
        journal?.claimed || mutationInFlight || reportPersisted
          ? manualRecoveryError(
              zeroizationError,
              journalPath,
              leasePath,
              reportStagingPath,
            )
          : zeroizationError;
      pendingError = pendingError
        ? new AggregateError(
            [pendingError, normalizedZeroizationError],
            "Fresh-deploy failed and signer zeroization was incomplete.",
          )
        : normalizedZeroizationError;
    }
  }
  if (pendingError) throw pendingError;
  return result;
};

export const runSolanaLoaderV3FreshDeployOperatorCli = async (
  argv,
  dependencies = {},
) => {
  const parsed = parseSolanaLoaderV3FreshDeployOperatorArgs(argv);
  if (parsed.command === "help") {
    return Object.freeze({
      help: true,
      usage: SOLANA_LOADER_V3_FRESH_DEPLOY_OPERATOR_USAGE,
    });
  }
  if (parsed.command === "snapshot-context") {
    return snapshotSolanaLoaderV3FreshDeployContext(
      parsed.options,
      dependencies,
    );
  }
  return runSolanaLoaderV3FreshDeployOperator(parsed.options, dependencies);
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === modulePath;
if (isMain) {
  runSolanaLoaderV3FreshDeployOperatorCli(process.argv.slice(2))
    .then((result) => {
      if (result?.help) process.stdout.write(result.usage);
      else if (result?.path && result?.sha256) {
        process.stdout.write(
          `${JSON.stringify({ status: "context-snapshot-complete", path: result.path, sha256: result.sha256 })}\n`,
        );
      }
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}

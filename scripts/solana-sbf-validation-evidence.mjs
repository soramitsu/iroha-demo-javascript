import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS,
  SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA,
  SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE,
  SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
  canonicalSolanaLoaderV3SbfValidationEvidenceBytes,
  solanaBlake2b256,
  solanaSha256,
} from "./solana-loader-v3-runtime.mjs";

export const SOLANA_SBF_VALIDATOR_MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const SOLANA_SBF_VALIDATOR_MAX_HELPER_BYTES = 64 * 1024 * 1024;
export const SOLANA_SBF_VALIDATOR_TIMEOUT_MS = 30_000;
export const SOLANA_SBF_VALIDATOR_AGAVE_CORE_LINE = "4.1.x";
export const SOLANA_SBF_VALIDATOR_RESULT_SCHEMA =
  "iroha-demo-solana-sbf-validator-result/v2";
export const SOLANA_SBF_VALIDATOR_SOURCE_BUNDLE_SCHEMA =
  "iroha-demo-solana-sbf-validator-source-bundle/v1";
export const SOLANA_SBF_VALIDATOR_VALIDATION_SCOPE =
  SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE;
export const SOLANA_SBF_VALIDATOR_SOURCE_FILES = Object.freeze([
  "Cargo.toml",
  "Cargo.lock",
  "build.rs",
  "src/main.rs",
]);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SOLANA_SBF_VALIDATOR_ROOT = path.resolve(
  moduleDir,
  "../native/solana-sbf-validator",
);
export const DEFAULT_SOLANA_SBF_VALIDATOR_BIN = path.resolve(
  DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
  "target/release/iroha-demo-solana-sbf-validator",
);

const SECRET_PATH_PATTERN =
  /(?:^|[\\/._-])(?:secret|keypair|mnemonic|seed(?:[-_.]?phrase)?|credential|keystore|signer|private[-_.]?key|wallet[-_.]?key)(?:$|[\\/._-])/iu;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/u;
const PRODUCTION_TARGET_PATTERN = /^x86_64-unknown-linux-(?:gnu|musl)$/u;
const HELPER_RESULT_KEYS = new Set([
  "schema",
  "valid",
  "validationScope",
  "exactClusterAdmission",
  "validatorId",
  "validatorVersion",
  "solanaSbpf",
  "sbpfVersion",
  "rejectBrokenElfs",
  "requisiteVerifier",
  "helperTargetTriple",
  "jitOutcome",
  "buildProfile",
  "validatorSourceBundleSha256",
  "cargoLockSha256",
  "rustcIdentity",
  "rustcIdentitySha256",
  "resourceLimits",
]);

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (value, keys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  if (
    actual.length !== keys.size ||
    actual.some((key) => !keys.has(key)) ||
    [...keys].some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} must contain only its exact canonical fields.`);
  }
};

const identity = (info) => ({
  dev: String(info.dev),
  ino: String(info.ino),
  mode: String(info.mode),
  size: String(info.size),
  mtimeNs: String(info.mtimeNs),
  ctimeNs: String(info.ctimeNs),
});

const sameIdentity = (left, right) =>
  Object.keys(left).every((key) => left[key] === right[key]);

const inside = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
};

const normalizePublicPath = (value, label) => {
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

const safeLstat = (file, label) => {
  try {
    return lstatSync(file, { bigint: true });
  } catch {
    throw new Error(`${label} is not an accessible regular file.`);
  }
};

const assertRegular = (info, label) => {
  if (info.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (!info.isFile()) throw new Error(`${label} must be a regular file.`);
};

const assertBounded = (info, maxBytes, label) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`${label} byte limit is invalid.`);
  }
  const size = Number(info.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
    throw new Error(`${label} exceeds its approved byte limit.`);
  }
};

const resolveStableRoot = (root, label) => {
  const resolved = normalizePublicPath(root, label);
  const info = safeLstat(resolved, label);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  try {
    return realpathSync(resolved);
  } catch {
    throw new Error(`${label} is not accessible.`);
  }
};

const assertNoSymlinkComponents = (file, canonicalRoot, label) => {
  const relative = path.relative(canonicalRoot, file);
  if (!inside(file, canonicalRoot)) {
    throw new Error(`${label} escapes its approved root.`);
  }
  let cursor = canonicalRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const info = safeLstat(cursor, label);
    if (info.isSymbolicLink()) {
      throw new Error(`${label} must not contain symbolic-link components.`);
    }
  }
};

const withStableBoundedFileSnapshot = (
  file,
  { root, maxBytes, label, requireExecutable = false },
  consume,
) => {
  if (typeof consume !== "function") {
    throw new Error(`${label} snapshot consumer is required.`);
  }
  const resolved = normalizePublicPath(file, label);
  const resolvedRoot = normalizePublicPath(root, `${label} root`);
  const canonicalRoot = resolveStableRoot(root, `${label} root`);
  if (!inside(resolved, resolvedRoot)) {
    throw new Error(`${label} escapes its approved root.`);
  }
  assertNoSymlinkComponents(resolved, resolvedRoot, label);
  const initialInfo = safeLstat(resolved, label);
  assertRegular(initialInfo, label);
  assertBounded(initialInfo, maxBytes, label);
  if (
    requireExecutable &&
    process.platform !== "win32" &&
    (Number(initialInfo.mode) & 0o111) === 0
  ) {
    throw new Error(`${label} is not executable.`);
  }
  let canonicalFile;
  try {
    canonicalFile = realpathSync(resolved);
  } catch {
    throw new Error(`${label} is not accessible.`);
  }
  if (!inside(canonicalFile, canonicalRoot)) {
    throw new Error(`${label} escapes its approved root.`);
  }
  const initial = identity(initialInfo);
  let fd;
  let result;
  let consumerFailure;
  try {
    try {
      fd = openSync(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      throw new Error(`${label} could not be opened without following links.`);
    }
    const beforeInfo = fstatSync(fd, { bigint: true });
    assertRegular(beforeInfo, label);
    assertBounded(beforeInfo, maxBytes, label);
    const before = identity(beforeInfo);
    if (!sameIdentity(initial, before)) {
      throw new Error(`${label} changed before it could be read.`);
    }
    const bytes = readFileSync(fd);
    if (bytes.length !== Number(beforeInfo.size)) {
      throw new Error(`${label} changed while it was being read.`);
    }
    try {
      result = consume(Buffer.from(bytes));
    } catch (error) {
      consumerFailure = error;
    }
    if (!sameIdentity(before, identity(fstatSync(fd, { bigint: true })))) {
      throw new Error(`${label} changed while it was being consumed.`);
    }
    const afterInfo = safeLstat(resolved, label);
    assertRegular(afterInfo, label);
    if (!sameIdentity(before, identity(afterInfo))) {
      throw new Error(`${label} path changed while it was being consumed.`);
    }
    let canonicalAfter;
    try {
      canonicalAfter = realpathSync(resolved);
    } catch {
      throw new Error(`${label} path changed while it was being consumed.`);
    }
    if (
      canonicalAfter !== canonicalFile ||
      !inside(canonicalAfter, canonicalRoot)
    ) {
      throw new Error(`${label} path changed while it was being consumed.`);
    }
    if (consumerFailure) throw consumerFailure;
    return result;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

/** Supplies one immutable, bounded artifact snapshot to a synchronous consumer. */
export const withStableSolanaSbfArtifactSnapshot = (
  file,
  {
    root = process.cwd(),
    maxBytes = SOLANA_SBF_VALIDATOR_MAX_ARTIFACT_BYTES,
  } = {},
  consume,
) => {
  if (maxBytes > SOLANA_SBF_VALIDATOR_MAX_ARTIFACT_BYTES) {
    throw new Error("SBF artifact byte limit is invalid.");
  }
  return withStableBoundedFileSnapshot(
    file,
    { root, maxBytes, label: "SBF artifact" },
    consume,
  );
};

const normalizeExpectedHash = (value, label) => {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new Error(
      `${label} must be an independently supplied lowercase 0x hash.`,
    );
  }
  return value;
};

export const canonicalSolanaSbfValidatorSourceBundle = ({
  sourceRoot = DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
} = {}) => {
  const root = resolveStableRoot(sourceRoot, "SBF validator source root");
  const files = SOLANA_SBF_VALIDATOR_SOURCE_FILES.map((relative) => {
    const file = path.join(root, relative);
    const bytes = withStableBoundedFileSnapshot(
      file,
      {
        root,
        maxBytes: 8 * 1024 * 1024,
        label: "SBF validator source file",
      },
      (snapshot) => snapshot,
    );
    return Object.freeze({
      path: relative,
      size: bytes.length,
      sha256: solanaSha256(bytes),
    });
  });
  const manifest = Object.freeze({
    schema: SOLANA_SBF_VALIDATOR_SOURCE_BUNDLE_SCHEMA,
    files,
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  return Object.freeze({
    manifest,
    manifestBytes,
    sourceBundleSha256: solanaSha256(manifestBytes),
    cargoLockSha256: files.find((entry) => entry.path === "Cargo.lock").sha256,
  });
};

export const assertSolanaSbfValidatorIntegrationPrerequisites = ({
  required = false,
  paths = [],
} = {}) => {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error(
      "SBF validator integration prerequisite paths are required.",
    );
  }
  const available = paths.every((entry) => {
    try {
      const info = lstatSync(normalizePublicPath(entry, "SBF prerequisite"));
      return info.isFile() && !info.isSymbolicLink() && info.size > 0;
    } catch {
      return false;
    }
  });
  if (required && !available) {
    throw new Error(
      "Required production SBF validator integration artifacts are missing.",
    );
  }
  return available;
};

const syncPrivateDirectory = (directory) => {
  if (process.platform === "win32") return;
  let fd;
  try {
    fd = openSync(directory, constants.O_RDONLY);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

/**
 * Executes an authenticated helper snapshot, never the mutable source path.
 * Exported so adversarial process-boundary behavior can be tested directly.
 */
export const executeAuthenticatedSolanaSbfValidatorBinary = ({
  validatorBin,
  validatorRoot = path.dirname(path.resolve(validatorBin ?? ".")),
  expectedValidatorSha256,
  executableBytes,
  timeoutMs = SOLANA_SBF_VALIDATOR_TIMEOUT_MS,
} = {}) => {
  const expectedSha256 = normalizeExpectedHash(
    expectedValidatorSha256,
    "Expected SBF validator helper SHA-256",
  );
  if (
    !(executableBytes instanceof Uint8Array) ||
    executableBytes.length === 0
  ) {
    throw new Error("Exact SBF executable bytes are required.");
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > SOLANA_SBF_VALIDATOR_TIMEOUT_MS
  ) {
    throw new Error("SBF validator timeout is invalid.");
  }
  const helperBytes = withStableBoundedFileSnapshot(
    validatorBin,
    {
      root: validatorRoot,
      maxBytes: SOLANA_SBF_VALIDATOR_MAX_HELPER_BYTES,
      label: "SBF validator helper",
      requireExecutable: true,
    },
    (snapshot) => snapshot,
  );
  const helperSha256 = solanaSha256(helperBytes);
  if (helperSha256 !== expectedSha256) {
    throw new Error(
      "SBF validator helper does not match the independently approved SHA-256.",
    );
  }

  const directory = mkdtempSync(
    path.join(tmpdir(), "iroha-authenticated-sbf-validator-"),
  );
  chmodSync(directory, 0o700);
  const extension = process.platform === "win32" ? ".exe" : "";
  const privateHelper = path.join(directory, `validator${extension}`);
  let fd;
  try {
    fd = openSync(
      privateHelper,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o500,
    );
    writeFileSync(fd, helperBytes);
    fsyncSync(fd);
    fchmodSync(fd, 0o500);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  syncPrivateDirectory(directory);

  try {
    const copiedSha256 = withStableBoundedFileSnapshot(
      privateHelper,
      {
        root: directory,
        maxBytes: SOLANA_SBF_VALIDATOR_MAX_HELPER_BYTES,
        label: "Authenticated SBF validator copy",
        requireExecutable: true,
      },
      (snapshot) => solanaSha256(snapshot),
    );
    if (copiedSha256 !== expectedSha256) {
      throw new Error(
        "Authenticated SBF validator copy changed before execution.",
      );
    }
    const result = spawnSync(privateHelper, [], {
      input: Buffer.from(executableBytes),
      env: Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" }),
      encoding: null,
      maxBuffer: 8 * 1024,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      shell: false,
      windowsHide: true,
    });
    const copiedSha256After = withStableBoundedFileSnapshot(
      privateHelper,
      {
        root: directory,
        maxBytes: SOLANA_SBF_VALIDATOR_MAX_HELPER_BYTES,
        label: "Authenticated SBF validator copy",
        requireExecutable: true,
      },
      (snapshot) => solanaSha256(snapshot),
    );
    if (copiedSha256After !== expectedSha256) {
      throw new Error(
        "Authenticated SBF validator copy changed during execution.",
      );
    }
    if (
      result.error ||
      result.signal !== null ||
      result.status !== 0 ||
      !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) ||
      result.stderr.length !== 0
    ) {
      throw new Error("Pinned local SBF structural validation failed closed.");
    }
    return Object.freeze({
      stdout: Buffer.from(result.stdout),
      helperBinarySha256: helperSha256,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

export const canonicalSolanaSbfValidatorResultBytes = (result) => {
  assertExactKeys(result, HELPER_RESULT_KEYS, "SBF validator result");
  return Buffer.from(
    JSON.stringify({
      schema: result.schema,
      valid: result.valid,
      validationScope: result.validationScope,
      exactClusterAdmission: result.exactClusterAdmission,
      validatorId: result.validatorId,
      validatorVersion: result.validatorVersion,
      solanaSbpf: result.solanaSbpf,
      sbpfVersion: result.sbpfVersion,
      rejectBrokenElfs: result.rejectBrokenElfs,
      requisiteVerifier: result.requisiteVerifier,
      helperTargetTriple: result.helperTargetTriple,
      jitOutcome: result.jitOutcome,
      buildProfile: result.buildProfile,
      validatorSourceBundleSha256: result.validatorSourceBundleSha256,
      cargoLockSha256: result.cargoLockSha256,
      rustcIdentity: result.rustcIdentity,
      rustcIdentitySha256: result.rustcIdentitySha256,
      resourceLimits: result.resourceLimits,
    }),
    "utf8",
  );
};

const parseAndValidateHelperResult = ({
  stdout,
  sourceBundle,
  validationMode,
}) => {
  let result;
  try {
    const text = stdout.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(stdout)) throw new Error("UTF-8");
    result = JSON.parse(text);
  } catch {
    throw new Error("Pinned local SBF validator returned noncanonical output.");
  }
  let canonical;
  try {
    canonical = canonicalSolanaSbfValidatorResultBytes(result);
  } catch {
    throw new Error("Pinned local SBF validator returned noncanonical output.");
  }
  if (!canonical.equals(stdout)) {
    throw new Error("Pinned local SBF validator returned noncanonical output.");
  }
  const rustcIdentityValid =
    typeof result.rustcIdentity === "string" &&
    result.rustcIdentity.length >= 32 &&
    result.rustcIdentity.length <= 2048 &&
    /^[\x20-\x7e]+$/u.test(result.rustcIdentity) &&
    solanaSha256(Buffer.from(result.rustcIdentity, "utf8")) ===
      result.rustcIdentitySha256;
  if (
    result.schema !== SOLANA_SBF_VALIDATOR_RESULT_SCHEMA ||
    result.valid !== true ||
    result.validationScope !== SOLANA_SBF_VALIDATOR_VALIDATION_SCOPE ||
    result.exactClusterAdmission !== false ||
    result.validatorId !== SOLANA_LOADER_V3_SBF_VALIDATOR_ID ||
    result.validatorVersion !== SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION ||
    result.solanaSbpf !== SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION ||
    result.sbpfVersion !== "V0" ||
    result.rejectBrokenElfs !== true ||
    result.requisiteVerifier !== true ||
    typeof result.helperTargetTriple !== "string" ||
    !/^[a-z0-9_][a-z0-9_.-]{2,127}$/u.test(result.helperTargetTriple) ||
    !["compiled", "unsupported-on-this-host"].includes(result.jitOutcome) ||
    !["release", "debug"].includes(result.buildProfile) ||
    result.validatorSourceBundleSha256 !== sourceBundle.sourceBundleSha256 ||
    result.cargoLockSha256 !== sourceBundle.cargoLockSha256 ||
    !HASH_PATTERN.test(result.rustcIdentitySha256 ?? "") ||
    !rustcIdentityValid ||
    !["unix-rlimit-v1", "wrapper-timeout-only"].includes(result.resourceLimits)
  ) {
    throw new Error(
      "Pinned local SBF validator provenance or structural checks are invalid.",
    );
  }
  const productionEligible =
    PRODUCTION_TARGET_PATTERN.test(result.helperTargetTriple) &&
    result.jitOutcome === "compiled" &&
    result.buildProfile === "release" &&
    result.resourceLimits === "unix-rlimit-v1";
  if (validationMode === "production" && !productionEligible) {
    throw new Error(
      "Production SBF evidence requires a release x86_64 Linux helper with compiled JIT and Unix resource limits.",
    );
  }
  if (validationMode !== "production" && validationMode !== "diagnostic") {
    throw new Error("SBF validation mode is invalid.");
  }
  return Object.freeze({ result, productionEligible });
};

export const generateSolanaLoaderV3SbfValidationEvidence = ({
  artifactPath,
  artifactRoot = process.cwd(),
  expectedArtifactSha256,
  expectedValidatorSha256,
  validatorBin = DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
  validatorRoot = DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
  validatorSourceRoot = DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
  validationMode = "production",
  timeoutMs = SOLANA_SBF_VALIDATOR_TIMEOUT_MS,
} = {}) => {
  const expectedArtifactHash = normalizeExpectedHash(
    expectedArtifactSha256,
    "Expected SBF artifact SHA-256",
  );
  const expectedValidatorHash = normalizeExpectedHash(
    expectedValidatorSha256,
    "Expected SBF validator helper SHA-256",
  );
  if (
    validationMode === "production" &&
    path.resolve(validatorBin) !== DEFAULT_SOLANA_SBF_VALIDATOR_BIN
  ) {
    throw new Error("Production SBF validation forbids helper path overrides.");
  }
  const sourceBundle = canonicalSolanaSbfValidatorSourceBundle({
    sourceRoot: validatorSourceRoot,
  });
  return withStableSolanaSbfArtifactSnapshot(
    artifactPath,
    { root: artifactRoot },
    (executableBytes) => {
      const artifactSha256 = solanaSha256(executableBytes);
      if (artifactSha256 !== expectedArtifactHash) {
        throw new Error(
          "SBF artifact does not match the independently reviewed SHA-256.",
        );
      }
      const executed = executeAuthenticatedSolanaSbfValidatorBinary({
        validatorBin,
        validatorRoot,
        expectedValidatorSha256: expectedValidatorHash,
        executableBytes,
        timeoutMs,
      });
      const helper = parseAndValidateHelperResult({
        stdout: executed.stdout,
        sourceBundle,
        validationMode,
      });
      if (solanaSha256(executableBytes) !== artifactSha256) {
        throw new Error("SBF artifact bytes changed during validation.");
      }
      const evidence = Object.freeze({
        schema: SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA,
        valid: true,
        deterministic: true,
        validationScope: SOLANA_SBF_VALIDATOR_VALIDATION_SCOPE,
        exactClusterAdmission: false,
        productionEligible: helper.productionEligible,
        validatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
        validatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
        policySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
        artifactSha256,
        codeHash: solanaBlake2b256(executableBytes),
        executableLength: executableBytes.length,
        helperBinarySha256: executed.helperBinarySha256,
        helperTargetTriple: helper.result.helperTargetTriple,
        jitOutcome: helper.result.jitOutcome,
        buildProfile: helper.result.buildProfile,
        validatorSourceBundleSha256: helper.result.validatorSourceBundleSha256,
        cargoLockSha256: helper.result.cargoLockSha256,
        rustcIdentity: helper.result.rustcIdentity,
        rustcIdentitySha256: helper.result.rustcIdentitySha256,
        resourceLimits: helper.result.resourceLimits,
        checks: Object.freeze([
          ...SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS,
        ]),
      });
      const evidenceBytes =
        canonicalSolanaLoaderV3SbfValidationEvidenceBytes(evidence);
      return Object.freeze({
        evidence,
        evidenceBytes,
        evidenceSha256: solanaSha256(evidenceBytes),
      });
    },
  );
};

const HELP = `Usage:
  node scripts/solana-sbf-validation-evidence.mjs \\
    --artifact PATH --artifact-root DIRECTORY \\
    --expected-artifact-sha256 0xHASH \\
    --expected-validator-sha256 0xHASH

Validates one stable public SBF artifact snapshot with the authenticated default
release x86_64 Linux solana-sbpf 0.21.0 helper. This is local structural
preflight evidence only; exact-cluster rollback simulation remains authoritative.
Canonical evidence JSON is written without a trailing newline.
`;

export const parseSolanaSbfValidationEvidenceArgs = (argv) => {
  const valueOptions = new Set([
    "artifact",
    "artifact-root",
    "expected-artifact-sha256",
    "expected-validator-sha256",
  ]);
  const result = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") {
      if (argv.length !== 1) throw new Error("--help must be used alone.");
      return Object.freeze({ help: true });
    }
    if (typeof token !== "string" || !token.startsWith("--")) {
      throw new Error("Unexpected positional argument.");
    }
    if (token.includes("=")) {
      throw new Error("Option=value syntax is not accepted.");
    }
    const key = token.slice(2);
    if (!valueOptions.has(key)) throw new Error("Unknown option.");
    if (seen.has(key)) throw new Error("Duplicate option.");
    seen.add(key);
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new Error("Option requires an explicit value.");
    }
    result[key] = value;
    index += 1;
  }
  for (const required of [
    "artifact",
    "artifact-root",
    "expected-artifact-sha256",
    "expected-validator-sha256",
  ]) {
    if (!Object.hasOwn(result, required)) {
      throw new Error("Required option is missing.");
    }
  }
  return Object.freeze({
    help: false,
    artifactPath: result.artifact,
    artifactRoot: result["artifact-root"],
    expectedArtifactSha256: result["expected-artifact-sha256"],
    expectedValidatorSha256: result["expected-validator-sha256"],
  });
};

export const runSolanaSbfValidationEvidenceCli = (argv) => {
  const args = parseSolanaSbfValidationEvidenceArgs(argv);
  if (args.help) return Buffer.from(HELP, "utf8");
  return generateSolanaLoaderV3SbfValidationEvidence(args).evidenceBytes;
};

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    const output = runSolanaSbfValidationEvidenceCli(process.argv.slice(2));
    process.stdout.write(output);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Validation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

export const sha256CanonicalEvidenceBytes = (bytes) =>
  `0x${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`;

/* global AggregateError */
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  constants as fsConstants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { blake2b } from "@noble/hashes/blake2b";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");
const SENTINEL_MARKER = ".iroha-signer-free-sbf-build-sentinel";
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const ELF64_E_FLAGS_OFFSET = 48;
const ELF64_E_FLAGS_LENGTH = 4;
const SBPF_V3_E_FLAGS = 3;
const SBF_ARCH = "v3";
const CARGO_BUILD_SBF_VERSION = "4.1.0";
const SBF_PLATFORM_TOOLS_VERSION = "v1.54";
const SBF_RUSTC_VERSION = "1.89.0";
const MAX_TOOL_VERSION_OUTPUT_BYTES = 4096;

export const SOLANA_SBF_BUILD_USAGE = `Usage:
  node scripts/build-sccp-solana-programs.mjs [all|bridge|source|native]

Builds exact signer-free SBPF V3 artifacts. The bridge selection builds both
the destination and source role-gated bridge artifacts.

Options:
  --help, -h  Show this help without starting cargo or writing build outputs
`;

const CHILD_ENV_ALLOWLIST = Object.freeze([
  "CARGO_HOME",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOGNAME",
  "PATH",
  "RUSTUP_HOME",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
  "WINDIR",
]);

export const SOLANA_SBF_PROGRAMS = Object.freeze({
  bridge: Object.freeze({
    id: "bridge",
    manifestPath: "solana/sccp-taira-xor/Cargo.toml",
    lockPath: "solana/sccp-taira-xor/Cargo.lock",
    rustToolchainPath: "solana/sccp-taira-xor/rust-toolchain.toml",
    artifactName: "sccp_taira_xor.so",
    cargoKeypairName: "sccp_taira_xor-keypair.json",
    outputPath: "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
    cargoFeatures: Object.freeze(["destination-program"]),
  }),
  source: Object.freeze({
    id: "source",
    manifestPath: "solana/sccp-taira-xor/Cargo.toml",
    lockPath: "solana/sccp-taira-xor/Cargo.lock",
    rustToolchainPath: "solana/sccp-taira-xor/rust-toolchain.toml",
    artifactName: "sccp_taira_xor.so",
    cargoKeypairName: "sccp_taira_xor-keypair.json",
    outputPath:
      "output/sccp-solana-program-artifacts/source/sccp_taira_xor_source.so",
    cargoFeatures: Object.freeze(["source-program"]),
  }),
  native: Object.freeze({
    id: "native",
    manifestPath: "solana/sccp-native-recursive-verifier/Cargo.toml",
    lockPath: "solana/sccp-native-recursive-verifier/Cargo.lock",
    rustToolchainPath:
      "solana/sccp-native-recursive-verifier/rust-toolchain.toml",
    artifactName: "sccp_native_recursive_verifier.so",
    cargoKeypairName: "sccp_native_recursive_verifier-keypair.json",
    outputPath:
      "output/sccp-solana-program-artifacts/native-verifier/sccp_native_recursive_verifier.so",
    cargoFeatures: Object.freeze([]),
  }),
});

const isMissing = (error) => error?.code === "ENOENT";

const lstatOrNull = async (target) => {
  try {
    return await lstat(target);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
};

const isPathWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const assertNoSymlinkComponents = async (root, target, label) => {
  if (!isPathWithin(root, target)) {
    throw new Error(`${label} escapes the approved root.`);
  }
  const relative = path.relative(root, target);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stats = await lstatOrNull(current);
    if (!stats) break;
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not contain symbolic-link components.`);
    }
  }
};

const requireSafeDirectory = async (directory, allowedRoot, label) => {
  await assertNoSymlinkComponents(allowedRoot, directory, label);
  const existing = await lstatOrNull(directory);
  if (existing?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertNoSymlinkComponents(allowedRoot, directory, label);
  const [realDirectory, realAllowedRoot] = await Promise.all([
    realpath(directory),
    realpath(allowedRoot),
  ]);
  if (!isPathWithin(realAllowedRoot, realDirectory)) {
    throw new Error(`${label} escapes the approved build output root.`);
  }
  return realDirectory;
};

const assertRegularFile = async (target, label) => {
  const stats = await lstatOrNull(target);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `${label} must be a regular file, not a link or special file.`,
    );
  }
  return stats;
};

const assertElf = async (target, label) => {
  const stats = await assertRegularFile(target, label);
  if (stats.size < ELF64_E_FLAGS_OFFSET + ELF64_E_FLAGS_LENGTH) {
    throw new Error(`${label} is too short to be an ELF program artifact.`);
  }
  const handle = await open(target, "r");
  try {
    const header = Buffer.alloc(ELF64_E_FLAGS_OFFSET + ELF64_E_FLAGS_LENGTH);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (
      bytesRead !== header.length ||
      !header.subarray(0, 4).equals(ELF_MAGIC)
    ) {
      throw new Error(`${label} is not an ELF program artifact.`);
    }
    if (header.readUInt32LE(ELF64_E_FLAGS_OFFSET) !== SBPF_V3_E_FLAGS) {
      throw new Error(`${label} must be an exact SBPF V3 ELF artifact.`);
    }
  } finally {
    await handle.close();
  }
};

const sha256File = async (target) => {
  const handle = await open(target, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return `0x${hash.digest("hex")}`;
};

const blake2b256File = async (target) => {
  const bytes = new Uint8Array(await readFile(target));
  return `0x${Buffer.from(blake2b(bytes, { dkLen: 32 })).toString("hex")}`;
};

const assertDistinctBuiltSolanaSbfArtifacts = (results) => {
  if (results.length <= 1) return;
  const artifactSha256Values = results.map(({ sha256 }) => sha256);
  const codeHashValues = results.map(({ codeHash }) => codeHash);
  if (
    new Set(artifactSha256Values).size !== results.length ||
    new Set(codeHashValues).size !== results.length
  ) {
    throw new Error(
      "Built Solana SBF roles must have distinct artifact SHA-256 and executable code hashes.",
    );
  }
};

export const sanitizeSolanaSbfBuildEnvironment = (env = process.env) => {
  const sanitized = Object.create(null);
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (typeof env[key] === "string" && env[key].length > 0) {
      sanitized[key] = env[key];
    }
  }
  sanitized.CARGO_TERM_COLOR = "never";
  sanitized.LANG = "C";
  sanitized.LC_ALL = "C";
  sanitized.SOURCE_DATE_EPOCH = "0";
  sanitized.TZ = "UTC";
  return sanitized;
};

const spawnCargoBuildSbf = ({ cargoBin, args, cwd, env, spawnImpl = spawn }) =>
  new Promise((resolve, reject) => {
    const child = spawnImpl(cargoBin, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`cargo build-sbf terminated by signal ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`cargo build-sbf exited with status ${code}.`));
      } else {
        resolve();
      }
    });
  });

const assertCargoMetadataLocked = ({
  cargoBin,
  cwd,
  env,
  manifestPath,
  spawnImpl = spawn,
}) =>
  new Promise((resolve, reject) => {
    const child = spawnImpl(
      cargoBin,
      [
        "metadata",
        "--format-version",
        "1",
        "--locked",
        "--no-deps",
        "--manifest-path",
        manifestPath,
      ],
      {
        cwd,
        env,
        stdio: "ignore",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(
          new Error(`cargo metadata --locked terminated by signal ${signal}.`),
        );
      } else if (code !== 0) {
        reject(
          new Error(`cargo metadata --locked exited with status ${code}.`),
        );
      } else {
        resolve();
      }
    });
  });

const readCargoBuildSbfVersion = ({ cargoBin, cwd, env, spawnImpl = spawn }) =>
  new Promise((resolve, reject) => {
    const child = spawnImpl(cargoBin, ["build-sbf", "--version"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const collect = (chunks) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_TOOL_VERSION_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        reject(
          new Error("cargo build-sbf version output is unexpectedly large."),
        );
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", collect(stdout));
    child.stderr?.on("data", collect(stderr));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `cargo build-sbf --version terminated by signal ${signal}.`,
          ),
        );
      } else if (code !== 0) {
        reject(
          new Error(`cargo build-sbf --version exited with status ${code}.`),
        );
      } else {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
      }
    });
  });

const assertPinnedCargoBuildSbfVersion = async (options) => {
  const output = await readCargoBuildSbfVersion(options);
  const expected = [
    `cargo-build-sbf ${CARGO_BUILD_SBF_VERSION}`,
    `platform-tools ${SBF_PLATFORM_TOOLS_VERSION}`,
    `rustc ${SBF_RUSTC_VERSION}`,
  ].join("\n");
  if (output !== expected) {
    throw new Error(
      "cargo build-sbf does not match the pinned production build toolchain.",
    );
  }
};

const collectRegularKeypairPaths = async (root) => {
  const matches = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (entry.name.endsWith("-keypair.json")) matches.push(candidate);
        continue;
      }
      if (entry.isDirectory()) {
        await visit(candidate);
      } else if (entry.name.endsWith("-keypair.json")) {
        matches.push(candidate);
      }
    }
  };
  if (await lstatOrNull(root)) await visit(root);
  return matches;
};

const assertSignerSentinelIntact = async (sentinelPath) => {
  const stats = await lstatOrNull(sentinelPath);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      "cargo build-sbf replaced the signer-blocking directory with possible signer material.",
    );
  }
  const entries = await readdir(sentinelPath);
  if (entries.length !== 1 || entries[0] !== SENTINEL_MARKER) {
    throw new Error("cargo build-sbf modified the signer-blocking directory.");
  }
  await assertRegularFile(
    path.join(sentinelPath, SENTINEL_MARKER),
    "Signer-free build sentinel marker",
  );
};

const atomicInstallArtifact = async (source, destination) => {
  const destinationStats = await lstatOrNull(destination);
  if (destinationStats?.isSymbolicLink()) {
    throw new Error("Solana SBF output artifact must not be a symbolic link.");
  }
  if (destinationStats && !destinationStats.isFile()) {
    throw new Error(
      "Solana SBF output artifact must be a regular file when present.",
    );
  }
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    await copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
    const handle = await open(temporary, "r+");
    try {
      await handle.chmod(0o755);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const resolveSolanaSbfArtifactDestination = async ({
  definition,
  outputRoot,
}) => {
  const absoluteOutputRoot = path.resolve(outputRoot);
  const outputRootStats = await lstatOrNull(absoluteOutputRoot);
  if (outputRootStats?.isSymbolicLink()) {
    throw new Error(
      "Solana SBF build output root must not be a symbolic link.",
    );
  }
  await mkdir(absoluteOutputRoot, { recursive: true, mode: 0o700 });
  const realOutputRoot = await realpath(absoluteOutputRoot);
  const requestedDestination = path.resolve(
    realOutputRoot,
    definition.outputPath,
  );
  if (!isPathWithin(realOutputRoot, requestedDestination)) {
    throw new Error(
      "Solana SBF artifact path escapes the approved output root.",
    );
  }
  const destinationDirectory = await requireSafeDirectory(
    path.dirname(requestedDestination),
    realOutputRoot,
    "Solana SBF artifact directory",
  );
  return path.join(destinationDirectory, path.basename(requestedDestination));
};

const prepareArtifactPublication = async ({ source, destination }) => {
  const destinationStats = await lstatOrNull(destination);
  if (destinationStats?.isSymbolicLink()) {
    throw new Error("Solana SBF output artifact must not be a symbolic link.");
  }
  if (destinationStats && !destinationStats.isFile()) {
    throw new Error(
      "Solana SBF output artifact must be a regular file when present.",
    );
  }
  const nonce = `${process.pid}.${randomBytes(8).toString("hex")}`;
  const candidate = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${nonce}.candidate`,
  );
  const backup = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${nonce}.backup`,
  );
  try {
    await copyFile(source, candidate, fsConstants.COPYFILE_EXCL);
    const handle = await open(candidate, "r+");
    try {
      await handle.chmod(0o755);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertElf(candidate, "Staged Solana SBF artifact");
    return {
      backup,
      backupMoved: false,
      candidate,
      destination,
      hadExisting: Boolean(destinationStats),
      installed: false,
    };
  } catch (error) {
    await rm(candidate, { force: true });
    throw error;
  }
};

const rollbackArtifactPublications = async (publications) => {
  const rollbackErrors = [];
  for (const publication of [...publications].reverse()) {
    try {
      if (publication.installed) {
        await rm(publication.destination, { force: true });
        publication.installed = false;
      }
      if (publication.backupMoved) {
        await rename(publication.backup, publication.destination);
        publication.backupMoved = false;
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError(
      rollbackErrors,
      "Failed to restore Solana SBF outputs after publication failure.",
    );
  }
};

const publishStagedSolanaSbfArtifacts = async ({
  stagedResults,
  outputRoot,
}) => {
  const publications = [];
  let committed = false;
  try {
    for (const result of stagedResults) {
      const destination = await resolveSolanaSbfArtifactDestination({
        definition: SOLANA_SBF_PROGRAMS[result.program],
        outputRoot,
      });
      publications.push(
        await prepareArtifactPublication({
          source: result.artifactPath,
          destination,
        }),
      );
    }

    for (const publication of publications) {
      if (publication.hadExisting) {
        await rename(publication.destination, publication.backup);
        publication.backupMoved = true;
      }
      await rename(publication.candidate, publication.destination);
      publication.installed = true;
    }

    const publishedResults = [];
    for (let index = 0; index < publications.length; index += 1) {
      const publication = publications[index];
      const stagedResult = stagedResults[index];
      await assertElf(publication.destination, "Published Solana SBF artifact");
      const [sha256, codeHash] = await Promise.all([
        sha256File(publication.destination),
        blake2b256File(publication.destination),
      ]);
      if (
        sha256 !== stagedResult.sha256 ||
        codeHash !== stagedResult.codeHash
      ) {
        throw new Error(
          "Published Solana SBF artifact differs from its validated staged artifact.",
        );
      }
      publishedResults.push(
        Object.freeze({
          ...stagedResult,
          artifactPath: publication.destination,
        }),
      );
    }

    committed = true;
    return Object.freeze(publishedResults);
  } catch (error) {
    try {
      await rollbackArtifactPublications(publications);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Solana SBF publication failed and its output rollback was incomplete.",
      );
    }
    throw error;
  } finally {
    await Promise.allSettled(
      publications.flatMap((publication) => [
        rm(publication.candidate, { force: true }),
        ...(committed || !publication.backupMoved
          ? [rm(publication.backup, { force: true })]
          : []),
      ]),
    );
  }
};

export const normalizeSolanaSbfBuildSelection = (value = "all") => {
  if (value === "all") return ["bridge", "source", "native"];
  if (value === "bridge") return ["bridge", "source"];
  if (value === "source" || value === "native") return [value];
  throw new Error(
    "Solana SBF build selection must be bridge, source, native, or all.",
  );
};

export const parseSolanaSbfBuildArgs = (argv) => {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    throw new TypeError("Solana SBF build arguments must be strings.");
  }
  if (argv.length === 0) {
    return Object.freeze({ help: false, selection: "all" });
  }
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return Object.freeze({ help: true, selection: null });
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    throw new TypeError("--help and -h must be used alone.");
  }
  if (new Set(argv).size !== argv.length) {
    throw new TypeError("Solana SBF build arguments must not be duplicated.");
  }
  if (argv.length !== 1) {
    throw new TypeError(
      "Solana SBF build accepts at most one program selection.",
    );
  }
  if (argv[0].startsWith("-")) {
    throw new TypeError("Solana SBF build received an unsupported option.");
  }
  normalizeSolanaSbfBuildSelection(argv[0]);
  return Object.freeze({ help: false, selection: argv[0] });
};

export const buildSolanaSbfProgram = async ({
  program,
  repoRoot = defaultRepoRoot,
  outputRoot = repoRoot,
  scratchParent = tmpdir(),
  cargoBin = "cargo",
  env = process.env,
  spawnImpl,
} = {}) => {
  const definition = SOLANA_SBF_PROGRAMS[program];
  if (!definition) {
    throw new Error("Solana SBF program must be bridge, source, or native.");
  }
  const absoluteRepoRoot = await realpath(path.resolve(repoRoot));
  const destination = await resolveSolanaSbfArtifactDestination({
    definition,
    outputRoot,
  });

  const absoluteScratchParent = path.resolve(scratchParent);
  const scratchParentStats = await lstatOrNull(absoluteScratchParent);
  if (
    !scratchParentStats?.isDirectory() ||
    scratchParentStats.isSymbolicLink()
  ) {
    throw new Error(
      "Solana SBF scratch parent must be an existing non-symbolic-link directory.",
    );
  }
  const realScratchParent = await realpath(absoluteScratchParent);
  const scratch = path.join(
    realScratchParent,
    `iroha-sccp-solana-sbf-${program}-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  await mkdir(scratch, { mode: 0o700 });
  const scratchOutput = path.join(scratch, "out");
  await mkdir(scratchOutput, { mode: 0o700 });
  const signerSentinel = path.join(scratchOutput, definition.cargoKeypairName);
  await mkdir(signerSentinel, { mode: 0o700 });
  const marker = path.join(signerSentinel, SENTINEL_MARKER);
  const markerHandle = await open(
    marker,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await markerHandle.writeFile(
      JSON.stringify({ schema: "iroha-signer-free-sbf-build-sentinel/v1" }),
    );
    await markerHandle.sync();
  } finally {
    await markerHandle.close();
  }

  let signerMaterialDetected = false;
  try {
    const manifestPath = path.resolve(
      absoluteRepoRoot,
      definition.manifestPath,
    );
    if (!isPathWithin(absoluteRepoRoot, manifestPath)) {
      throw new Error("Solana SBF manifest path escapes the repository root.");
    }
    await assertRegularFile(manifestPath, "Solana SBF Cargo manifest");
    const lockPath = path.resolve(absoluteRepoRoot, definition.lockPath);
    const rustToolchainPath = path.resolve(
      absoluteRepoRoot,
      definition.rustToolchainPath,
    );
    if (
      !isPathWithin(absoluteRepoRoot, lockPath) ||
      !isPathWithin(absoluteRepoRoot, rustToolchainPath)
    ) {
      throw new Error("Solana SBF build metadata escapes the repository root.");
    }
    await assertRegularFile(lockPath, "Solana SBF Cargo lockfile");
    await assertRegularFile(
      rustToolchainPath,
      "Solana SBF Rust toolchain manifest",
    );
    const [manifestSha256, lockSha256, rustToolchainSha256] = await Promise.all(
      [
        sha256File(manifestPath),
        sha256File(lockPath),
        sha256File(rustToolchainPath),
      ],
    );
    const buildEnv = sanitizeSolanaSbfBuildEnvironment(env);
    const buildCwd = path.dirname(manifestPath);
    await assertCargoMetadataLocked({
      cargoBin,
      cwd: buildCwd,
      env: buildEnv,
      manifestPath,
      spawnImpl,
    });
    await assertPinnedCargoBuildSbfVersion({
      cargoBin,
      cwd: buildCwd,
      env: buildEnv,
      spawnImpl,
    });
    const lockedCargoArgs = ["--locked"];
    if (definition.cargoFeatures.length > 0) {
      lockedCargoArgs.push(
        "--no-default-features",
        "--features",
        definition.cargoFeatures.join(","),
      );
    }
    await spawnCargoBuildSbf({
      cargoBin,
      cwd: buildCwd,
      env: buildEnv,
      spawnImpl,
      args: [
        "build-sbf",
        "--arch",
        SBF_ARCH,
        "--tools-version",
        SBF_PLATFORM_TOOLS_VERSION,
        "--manifest-path",
        manifestPath,
        "--sbf-out-dir",
        scratchOutput,
        "--",
        ...lockedCargoArgs,
      ],
    });

    const [manifestSha256After, lockSha256After, rustToolchainSha256After] =
      await Promise.all([
        sha256File(manifestPath),
        sha256File(lockPath),
        sha256File(rustToolchainPath),
      ]);
    if (
      manifestSha256After !== manifestSha256 ||
      lockSha256After !== lockSha256 ||
      rustToolchainSha256After !== rustToolchainSha256
    ) {
      throw new Error(
        "cargo build-sbf modified locked Solana SBF build metadata.",
      );
    }

    try {
      await assertSignerSentinelIntact(signerSentinel);
    } catch (error) {
      signerMaterialDetected = true;
      throw error;
    }
    const unexpectedKeypairs = (
      await collectRegularKeypairPaths(scratch)
    ).filter((candidate) => candidate !== signerSentinel);
    if (unexpectedKeypairs.length > 0) {
      signerMaterialDetected = true;
      throw new Error("cargo build-sbf emitted unexpected signer material.");
    }

    const scratchArtifact = path.join(scratchOutput, definition.artifactName);
    await assertElf(scratchArtifact, "Compiled Solana SBF artifact");
    await atomicInstallArtifact(scratchArtifact, destination);
    await assertElf(destination, "Installed Solana SBF artifact");
    const [sha256, codeHash] = await Promise.all([
      sha256File(destination),
      blake2b256File(destination),
    ]);
    return Object.freeze({
      program,
      artifactPath: destination,
      sha256,
      codeHash,
      manifestSha256,
      lockSha256,
      rustToolchainSha256,
      cargoBuildSbfVersion: CARGO_BUILD_SBF_VERSION,
      sbfRustcVersion: SBF_RUSTC_VERSION,
      signerMaterialWritten: false,
    });
  } catch (error) {
    const unexpectedKeypairs = await collectRegularKeypairPaths(scratch).catch(
      () => [],
    );
    if (unexpectedKeypairs.length > 0) signerMaterialDetected = true;
    if (signerMaterialDetected) {
      error.message = `${error.message} Scratch output was erased without inspecting signer bytes.`;
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

export const buildSolanaSbfPrograms = async ({
  selection = "all",
  ...options
} = {}) => {
  const programs = normalizeSolanaSbfBuildSelection(selection);
  if (programs.length === 1) {
    return Object.freeze([
      await buildSolanaSbfProgram({ ...options, program: programs[0] }),
    ]);
  }

  const scratchParent = path.resolve(options.scratchParent ?? tmpdir());
  const scratchParentStats = await lstatOrNull(scratchParent);
  if (
    !scratchParentStats?.isDirectory() ||
    scratchParentStats.isSymbolicLink()
  ) {
    throw new Error(
      "Solana SBF scratch parent must be an existing non-symbolic-link directory.",
    );
  }
  const realScratchParent = await realpath(scratchParent);
  const publicationStage = path.join(
    realScratchParent,
    `iroha-sccp-solana-sbf-publication-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  await mkdir(publicationStage, { mode: 0o700 });
  try {
    const stagedResults = [];
    for (const program of programs) {
      stagedResults.push(
        await buildSolanaSbfProgram({
          ...options,
          outputRoot: publicationStage,
          scratchParent: realScratchParent,
          program,
        }),
      );
    }
    assertDistinctBuiltSolanaSbfArtifacts(stagedResults);
    return await publishStagedSolanaSbfArtifacts({
      stagedResults,
      outputRoot: options.outputRoot ?? options.repoRoot ?? defaultRepoRoot,
    });
  } finally {
    await rm(publicationStage, { recursive: true, force: true });
  }
};

const main = async (argv = process.argv.slice(2)) => {
  const args = parseSolanaSbfBuildArgs(argv);
  if (args.help) {
    process.stdout.write(SOLANA_SBF_BUILD_USAGE);
    return;
  }
  const results = await buildSolanaSbfPrograms({
    selection: args.selection,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "iroha-demo-sccp-solana-signer-free-build/v1",
        signerMaterialWritten: false,
        buildProfile: {
          arch: SBF_ARCH,
          cargoBuildSbfVersion: CARGO_BUILD_SBF_VERSION,
          cargoLocked: true,
          platformToolsVersion: SBF_PLATFORM_TOOLS_VERSION,
          rustcVersion: SBF_RUSTC_VERSION,
        },
        artifacts: results.map((result) => ({
          program: result.program,
          path: path.relative(defaultRepoRoot, result.artifactPath),
          sha256: result.sha256,
          codeHash: result.codeHash,
          manifestSha256: result.manifestSha256,
          lockSha256: result.lockSha256,
          rustToolchainSha256: result.rustToolchainSha256,
        })),
      },
      null,
      2,
    )}\n`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

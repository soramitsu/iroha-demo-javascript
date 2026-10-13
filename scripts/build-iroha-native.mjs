#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_RUST_TOOLCHAIN = "1.93.1";
const DEFAULT_MACOSX_DEPLOYMENT_TARGET = "13.0";
const NATIVE_BUILD_CARGO_LOCK_ENV = "IROHA_JS_CARGO_LOCKFILE_PATH";
const NATIVE_BUILD_CARGO_PATH_ENV = "IROHA_JS_CARGO_PATH";
const REQUIRED_BUILD_ENVIRONMENT = Object.freeze({
  CARGO_BUILD_JOBS: "1",
  CARGO_INCREMENTAL: "0",
  CARGO_NET_OFFLINE: "true",
});
// The SDK native build uses the stock pinned toolchain and rejects these outright.
const FORBIDDEN_BUILD_ENVIRONMENT = Object.freeze(["RUSTC_BOOTSTRAP"]);
const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(scriptPath), "..");

const isAtOrBelow = (parent, child) => {
  const childRelative = relative(parent, child);
  return (
    childRelative === "" ||
    (childRelative !== ".." && !childRelative.startsWith(`..${sep}`))
  );
};

const requireCanonicalDirectory = (path, label, { create = false } = {}) => {
  const resolvedPath = resolve(path);
  if (create) mkdirSync(resolvedPath, { mode: 0o700, recursive: true });
  const metadata = lstatSync(resolvedPath);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync.native(resolvedPath) !== resolvedPath
  ) {
    throw new Error(`${label} must be a canonical physical directory.`);
  }
  return resolvedPath;
};

const requireCanonicalFile = (path, label, { executable = false } = {}) => {
  const resolvedPath = resolve(path);
  const metadata = lstatSync(resolvedPath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    realpathSync.native(resolvedPath) !== resolvedPath
  ) {
    throw new Error(`${label} must be a canonical physical file.`);
  }
  if (executable) accessSync(resolvedPath, constants.X_OK);
  return resolvedPath;
};

const readPinnedRustToolchain = (repoRoot) => {
  const source = readFileSync(
    requireCanonicalFile(
      join(repoRoot, "rust-toolchain.toml"),
      "Iroha Rust toolchain file",
    ),
    "utf8",
  );
  const channels = [
    ...source.matchAll(
      /^[ \t]*channel[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*(?:#.*)?$/gmu,
    ),
  ];
  if (channels.length !== 1 || channels[0]?.[1] !== PINNED_RUST_TOOLCHAIN) {
    throw new Error(
      `Iroha native builds require Rust ${PINNED_RUST_TOOLCHAIN}.`,
    );
  }
  return PINNED_RUST_TOOLCHAIN;
};

const resolvePinnedRustExecutable = (
  executable,
  toolchain,
  environment,
  runProcess,
) => {
  const result = runProcess(
    process.platform === "win32" ? "rustup.exe" : "rustup",
    ["which", executable, "--toolchain", toolchain],
    { encoding: "utf8", env: environment },
  );
  if (
    result.error ||
    result.status !== 0 ||
    typeof result.stdout !== "string" ||
    !result.stdout.trim()
  ) {
    throw new Error(
      `Unable to resolve ${executable} from pinned Rust ${toolchain}.`,
    );
  }
  const executablePath = requireCanonicalFile(
    result.stdout.trim(),
    `Pinned Rust ${executable}`,
    { executable: true },
  );
  if (
    basename(executablePath).toLocaleLowerCase("en-US") !==
      executable.toLocaleLowerCase("en-US") &&
    basename(executablePath).toLocaleLowerCase("en-US") !==
      `${executable}.exe`.toLocaleLowerCase("en-US")
  ) {
    throw new Error(`Pinned Rust ${executable} resolved to the wrong program.`);
  }
  return executablePath;
};

const defaultTargetDirectory = (projectRoot, repoRoot) => {
  const lane = createHash("sha256")
    .update(repoRoot, "utf8")
    .digest("hex")
    .slice(0, 24);
  return join(
    dirname(projectRoot),
    ".iroha-js-native-targets",
    `iroha-js-${lane}`,
  );
};

export const resolveIrohaNativeBuildEnvironment = ({
  environment = process.env,
  platform = process.platform,
  projectRoot = defaultProjectRoot,
  runProcess = spawnSync,
  sdkRoot,
} = {}) => {
  if (typeof sdkRoot !== "string" || !sdkRoot) {
    throw new Error("The selected @iroha/iroha-js SDK root is required.");
  }
  const canonicalProjectRoot = requireCanonicalDirectory(
    projectRoot,
    "Wallet project root",
  );
  const canonicalSdkRoot = requireCanonicalDirectory(
    sdkRoot,
    "Selected @iroha/iroha-js SDK root",
  );
  const repoRoot = requireCanonicalDirectory(
    resolve(canonicalSdkRoot, "..", ".."),
    "Iroha repository root",
  );
  if (
    canonicalSdkRoot !== join(repoRoot, "javascript", "iroha_js") ||
    isAtOrBelow(repoRoot, canonicalProjectRoot) ||
    isAtOrBelow(canonicalProjectRoot, repoRoot)
  ) {
    throw new Error(
      "The selected SDK must be the canonical javascript/iroha_js directory in a source tree disjoint from the wallet.",
    );
  }
  const cargoManifest = requireCanonicalFile(
    join(repoRoot, "Cargo.toml"),
    "Iroha Cargo manifest",
  );
  const cargoLock = requireCanonicalFile(
    join(repoRoot, "Cargo.lock"),
    "Iroha Cargo lock",
  );
  const toolchain = readPinnedRustToolchain(repoRoot);
  const cargoPath = resolvePinnedRustExecutable(
    "cargo",
    toolchain,
    environment,
    runProcess,
  );
  const rustcPath = resolvePinnedRustExecutable(
    "rustc",
    toolchain,
    environment,
    runProcess,
  );
  const rustdocPath = resolvePinnedRustExecutable(
    "rustdoc",
    toolchain,
    environment,
    runProcess,
  );
  if (
    dirname(cargoPath) !== dirname(rustcPath) ||
    dirname(cargoPath) !== dirname(rustdocPath)
  ) {
    throw new Error(
      "Pinned Cargo, rustc, and rustdoc must share one toolchain.",
    );
  }
  const configuredTarget = String(environment.CARGO_TARGET_DIR ?? "").trim();
  const cargoTargetDirectory = requireCanonicalDirectory(
    configuredTarget || defaultTargetDirectory(canonicalProjectRoot, repoRoot),
    "Iroha native Cargo target",
    { create: true },
  );
  if (
    isAtOrBelow(repoRoot, cargoTargetDirectory) ||
    isAtOrBelow(cargoTargetDirectory, repoRoot)
  ) {
    throw new Error("Iroha native Cargo target must be disjoint from source.");
  }

  return Object.freeze({
    buildEnvironment: Object.freeze({
      ...Object.fromEntries(
        Object.entries(environment).filter(
          ([key]) => !FORBIDDEN_BUILD_ENVIRONMENT.includes(key),
        ),
      ),
      ...REQUIRED_BUILD_ENVIRONMENT,
      ...(platform === "darwin" &&
      environment.MACOSX_DEPLOYMENT_TARGET === undefined
        ? { MACOSX_DEPLOYMENT_TARGET: DEFAULT_MACOSX_DEPLOYMENT_TARGET }
        : {}),
      CARGO_TARGET_DIR: cargoTargetDirectory,
      [NATIVE_BUILD_CARGO_LOCK_ENV]: cargoLock,
      [NATIVE_BUILD_CARGO_PATH_ENV]: cargoPath,
      RUSTC: rustcPath,
      RUSTDOC: rustdocPath,
    }),
    cargoManifest,
    cargoPath,
    cargoTargetDirectory,
    repoRoot,
    sdkRoot: canonicalSdkRoot,
  });
};

export const buildIrohaNative = ({
  environment = process.env,
  platform = process.platform,
  projectRoot = defaultProjectRoot,
  runProcess = spawnSync,
  sdkRoot,
} = {}) => {
  const build = resolveIrohaNativeBuildEnvironment({
    environment,
    platform,
    projectRoot,
    runProcess,
    sdkRoot,
  });
  const fetchEnvironment = { ...build.buildEnvironment };
  delete fetchEnvironment.CARGO_NET_OFFLINE;
  const fetchResult = runProcess(
    build.cargoPath,
    ["fetch", "--locked", "--manifest-path", build.cargoManifest],
    {
      cwd: build.repoRoot,
      env: fetchEnvironment,
      stdio: "inherit",
    },
  );
  if (fetchResult.error || fetchResult.status !== 0) {
    throw new Error(
      `Failed to fetch the locked Iroha native dependency closure (status ${
        fetchResult.status ?? "unknown"
      }): ${fetchResult.error?.message ?? "Cargo fetch failed"}.`,
    );
  }

  const npmExecPath = environment.npm_execpath;
  const npmCommand = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const npmBuildNativeArgs = npmExecPath
    ? [npmExecPath, "run", "build:native"]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build:native"]
      : ["run", "build:native"];
  const buildResult = runProcess(npmCommand, npmBuildNativeArgs, {
    cwd: build.sdkRoot,
    env: build.buildEnvironment,
    stdio: "inherit",
  });
  if (buildResult.error || buildResult.status !== 0) {
    throw new Error(
      `Failed to build @iroha/iroha-js native bindings (status ${
        buildResult.status ?? "unknown"
      }): ${buildResult.error?.message ?? "native build command failed"}.`,
    );
  }
  return build;
};

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`${name} is required.`);
  }
  return process.argv[index + 1];
};

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  buildIrohaNative({
    projectRoot: defaultProjectRoot,
    sdkRoot: resolve(readOption("--sdk-root")),
  });
}

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const REVIEWED_IROHA_PARENT_COMMIT =
  "03b2bff298cabe1c1355d78379acb4a099e6d627";
export const REVIEWED_IROHA_COMMIT = "1bcb05eb208d8bda1610789d827a7ed97e66e56c";
export const REVIEWED_IROHA_SIGNER_FINGERPRINT =
  "9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB";
export const REVIEWED_IROHA_TREE = "801349ba2350640643179c83821c43d8548ba021";
export const REVIEWED_IROHA_JS_TREE =
  "6ce1556f6b1e1bc62f20dbc63db3e3cca6148bdc";
// Fingerprints the exact wallet-lock installation, including the SDK's nested
// @noble/ciphers 1.x dependency alongside the reviewed SDK package files.
export const REVIEWED_IROHA_JS_PACKAGE_SHA256 =
  "32e6035d81d7e2b8c84d25db32f5d002b1af9664b9358f1b06a971f5c425d2d2";
export const REVIEWED_CARGO_LOCK_SHA256 =
  "28ca3f9224b55d89f6307f487462ec9f7b8027ccb0712323b779a568bc9ebfd1";
export const REVIEWED_NATIVE_SHA256 =
  "3ae0f3fbb54f9144f9d96c92aa8fe0816cc0f6dcc2aa01952eb3ae5fe04c8b36";
export const REVIEWED_NATIVE_MANIFEST_SHA256 =
  "a85f0afd79ae30a72c983272657fb9c1135db36e1a1fbc613b2fdb121dad96d1";
export const SOURCE_MARKER_SCHEMA = "sora.wallet.iroha-js-release-source.v2";

const SDK_RELATIVE_PATH = path.join("javascript", "iroha_js");
const SDK_PACKAGE_NAME = "@iroha/iroha-js";
const LOCKFILE_LOCAL_SOURCE = "../iroha/javascript/iroha_js";
const SOURCE_MARKER = ".cbsi-release-source.json";
export const REVIEWED_CARGO_LOCK_SIZE = 306362;
export const REVIEWED_NATIVE_SIZE = 61962096;
export const REVIEWED_NATIVE_MANIFEST_SIZE = 385;
export const REVIEWED_SIGNING_INDEPENDENT_SHA256 =
  "2ff667709ec8b915c68479707521981b8bc833138e0ba0d6a1dd2ee42726b8f8";
const REVIEWED_IGNORED_FILES = Object.freeze([
  "Cargo.lock",
  "javascript/iroha_js/native/iroha_js_host.checksums.json",
  "javascript/iroha_js/native/iroha_js_host.node",
]);

function fail(message) {
  throw new Error(`Iroha JS release source refused: ${message}`);
}

let canonicalGpgProgram;

function resolveCanonicalGpgProgram() {
  if (canonicalGpgProgram !== undefined) {
    return canonicalGpgProgram;
  }
  const searchPath = process.env.PATH;
  if (typeof searchPath !== "string" || searchPath.length === 0) {
    fail("PATH must identify a canonical GPG executable");
  }
  for (const directory of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, "gpg");
    try {
      const canonical = realpathSync.native(candidate);
      const stat = lstatSync(canonical);
      accessSync(canonical, constants.X_OK);
      if (
        path.isAbsolute(canonical) &&
        path.normalize(canonical) === canonical &&
        stat.isFile() &&
        !stat.isSymbolicLink()
      ) {
        canonicalGpgProgram = canonical;
        return canonicalGpgProgram;
      }
    } catch {
      // Continue until a canonical executable GPG program is found.
    }
  }
  fail("PATH does not contain a canonical absolute regular GPG executable");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) {
    fail(`${command} could not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ""}`.trim();
    fail(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return `${result.stdout ?? ""}`;
}

const gitEnvironment = () => {
  const environment = { ...process.env };
  for (const name of [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CEILING_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CONFIG",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_DIR",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    "GIT_INDEX_FILE",
    "GIT_NAMESPACE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_QUARANTINE_PATH",
    "GIT_REPLACE_REF_BASE",
    "GIT_SHALLOW_FILE",
    "GIT_WORK_TREE",
  ]) {
    delete environment[name];
  }
  for (const name of Object.keys(environment)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/u.test(name)) {
      delete environment[name];
    }
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  };
};

const gitArguments = (root, args) => [
  "-c",
  "core.attributesFile=/dev/null",
  "-c",
  "core.excludesFile=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "advice.detachedHead=false",
  "-c",
  `gpg.program=${resolveCanonicalGpgProgram()}`,
  "-C",
  root,
  ...args,
];

function git(root, ...args) {
  return run("/usr/bin/git", gitArguments(root, args), {
    env: gitEnvironment(),
  });
}

function verifyExpectedCommitSignature(root, commit, label) {
  const args = gitArguments(root, ["verify-commit", "--raw", commit]);
  const result = spawnSync("/usr/bin/git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: gitEnvironment(),
  });
  if (result.error) {
    fail(`git verify-commit could not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${label} must carry a locally verifiable good OpenPGP signature`);
  }
  const status = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const fingerprints = Array.from(
    status.matchAll(/^\[GNUPG:\] VALIDSIG ([0-9A-F]{40})\b/gmu),
    (match) => match[1],
  );
  if (
    fingerprints.length !== 1 ||
    fingerprints[0] !== REVIEWED_IROHA_SIGNER_FINGERPRINT
  ) {
    fail(
      `${label} signature must be from ${REVIEWED_IROHA_SIGNER_FINGERPRINT}`,
    );
  }
}

function assertReviewedCommitChain(root, commit) {
  const headLine = git(root, "rev-list", "--parents", "-n", "1", commit)
    .trim()
    .split(/\s+/u);
  if (
    JSON.stringify(headLine) !==
    JSON.stringify([commit, REVIEWED_IROHA_PARENT_COMMIT])
  ) {
    fail("HEAD must directly descend from the reviewed signed parent");
  }
  verifyExpectedCommitSignature(root, commit, "HEAD");
  verifyExpectedCommitSignature(
    root,
    REVIEWED_IROHA_PARENT_COMMIT,
    "parent commit",
  );
}

function assertPhysicalGitClosure(gitDirectory) {
  const visit = (directory) => {
    let directoryStat;
    try {
      directoryStat = lstatSync(directory);
    } catch (error) {
      fail(`the Git directory cannot be inspected: ${error.message}`);
    }
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      realpathSync.native(directory) !== directory
    ) {
      fail(
        directory === gitDirectory
          ? "the reviewed Iroha repository must use its canonical physical .git directory without shared Git state"
          : "the Git directory must use only canonical physical directories",
      );
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const relative = path.relative(gitDirectory, child);
      const isObjectEntry =
        relative === "objects" || relative.startsWith(`objects${path.sep}`);
      if (entry.name.endsWith(".promisor")) {
        fail("the reviewed Iroha repository must not contain promisor packs");
      }
      let childStat;
      try {
        childStat = lstatSync(child);
      } catch (error) {
        fail(`a Git object-store entry cannot be inspected: ${error.message}`);
      }
      if (childStat.isSymbolicLink()) {
        fail(
          isObjectEntry
            ? "the Git object store must not contain symbolic links"
            : "the Git directory must not contain symbolic links",
        );
      }
      if (childStat.isDirectory()) {
        visit(child);
        continue;
      }
      if (!childStat.isFile() || realpathSync.native(child) !== child) {
        fail(
          isObjectEntry
            ? "the Git object store must contain only canonical regular files"
            : "the Git directory must contain only canonical regular files",
        );
      }
      if (childStat.nlink > 1) {
        fail(
          isObjectEntry
            ? "the reviewed Iroha repository must not use hard-linked Git objects"
            : "the reviewed Iroha repository must not use hard-linked Git metadata",
        );
      }
    }
  };
  visit(gitDirectory);
}

function assertStandaloneSourceClosure(root) {
  if (git(root, "rev-parse", "--abbrev-ref", "HEAD").trim() !== "HEAD") {
    fail("the reviewed Iroha repository must use a detached HEAD");
  }
  if (git(root, "rev-parse", "--is-shallow-repository").trim() !== "false") {
    fail("the reviewed Iroha repository must not be shallow");
  }
  if (git(root, "replace", "-l").trim().length !== 0) {
    fail("the reviewed Iroha repository must not contain replacement refs");
  }
  if (git(root, "submodule", "status", "--recursive").trim().length !== 0) {
    fail("the reviewed Iroha repository must not contain submodules");
  }

  const gitDirectory = git(root, "rev-parse", "--absolute-git-dir").trim();
  const gitCommonDirectory = git(
    root,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ).trim();
  const expectedGitDirectory = path.join(root, ".git");
  let gitDirectoryStat;
  try {
    gitDirectoryStat = lstatSync(expectedGitDirectory);
  } catch (error) {
    fail(`the reviewed Git directory cannot be inspected: ${error.message}`);
  }
  if (
    gitDirectory !== expectedGitDirectory ||
    !gitDirectoryStat.isDirectory() ||
    gitDirectoryStat.isSymbolicLink() ||
    realpathSync.native(expectedGitDirectory) !== expectedGitDirectory ||
    gitCommonDirectory !== expectedGitDirectory
  ) {
    fail(
      "the reviewed Iroha repository must use its canonical physical .git directory without shared Git state",
    );
  }
  if (
    existsSync(path.join(expectedGitDirectory, "objects", "info", "alternates"))
  ) {
    fail("the reviewed Iroha repository must not borrow Git objects");
  }
  const worktreeConfigPath = path.join(expectedGitDirectory, "config.worktree");
  let hasWorktreeConfig = false;
  try {
    lstatSync(worktreeConfigPath);
    hasWorktreeConfig = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      fail(`Git worktree config cannot be inspected: ${error.message}`);
    }
  }
  if (hasWorktreeConfig) {
    fail("the reviewed Iroha repository must not contain config.worktree");
  }
  const localConfigNames = git(
    root,
    "config",
    "--local",
    "--no-includes",
    "--null",
    "--name-only",
    "--list",
  )
    .split("\0")
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  if (localConfigNames.includes("extensions.worktreeconfig")) {
    fail("the reviewed Iroha repository must not use worktree Git config");
  }
  if (
    localConfigNames.some(
      (name) =>
        name === "include.path" ||
        (name.startsWith("includeif.") && name.endsWith(".path")),
    )
  ) {
    fail("the reviewed Iroha repository must not use Git config includes");
  }
  if (
    localConfigNames.some(
      (name) =>
        name === "extensions.partialclone" ||
        /^remote\..+\.promisor$/u.test(name) ||
        /^remote\..+\.partialclonefilter$/u.test(name),
    )
  ) {
    fail("the reviewed Iroha repository must not use partial or promisor Git");
  }
  assertPhysicalGitClosure(expectedGitDirectory);

  if (git(root, "remote").trim().length !== 0) {
    fail("the reviewed Iroha repository must not retain Git remotes");
  }

  const exceptionalIndexEntries = git(root, "ls-files", "-v", "-z")
    .split("\0")
    .filter(Boolean)
    .filter((entry) => !entry.startsWith("H "));
  if (exceptionalIndexEntries.length !== 0) {
    fail("the reviewed Iroha repository must use a complete ordinary index");
  }
}

function requireCanonicalAbsoluteDirectory(rawRoot) {
  if (typeof rawRoot !== "string" || rawRoot.length === 0) {
    fail("IROHA_ROOT is required");
  }
  if (!path.isAbsolute(rawRoot) || rawRoot === path.parse(rawRoot).root) {
    fail("IROHA_ROOT must be an explicit non-root absolute path");
  }
  if (path.normalize(rawRoot) !== rawRoot) {
    fail("IROHA_ROOT must already be normalized");
  }
  let rootStat;
  try {
    rootStat = lstatSync(rawRoot);
  } catch (error) {
    fail(`IROHA_ROOT cannot be inspected: ${error.message}`);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("IROHA_ROOT must be a non-symlink directory");
  }
  const canonical = realpathSync.native(rawRoot);
  if (canonical !== rawRoot) {
    fail("IROHA_ROOT must be a canonical physical path");
  }
  return canonical;
}

const sha256File = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

function assertPhysicalFile(file, label) {
  let fileStat;
  let canonical;
  try {
    fileStat = lstatSync(file);
    canonical = realpathSync.native(file);
  } catch (error) {
    fail(`${label} cannot be inspected: ${error.message}`);
  }
  if (
    !fileStat.isFile() ||
    fileStat.isSymbolicLink() ||
    fileStat.nlink !== 1 ||
    canonical !== file
  ) {
    fail(`${label} must be one canonical physical non-hard-linked file`);
  }
  return fileStat;
}

function assertSealedFile(file, label, expectedSize, expectedSha256) {
  const fileStat = assertPhysicalFile(file, label);
  if (fileStat.size !== expectedSize || sha256File(file) !== expectedSha256) {
    fail(`${label} does not match the reviewed release closure`);
  }
}

function assertReviewedNativeManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`native checksum manifest cannot be parsed: ${error.message}`);
  }
  const expected = {
    entries: {
      "darwin-arm64": {
        sha256: REVIEWED_NATIVE_SHA256,
        cargo_profile: "release",
        source_git_revision: REVIEWED_IROHA_COMMIT,
        source_tree_clean: true,
        mach_o_signing_independent_sha256: REVIEWED_SIGNING_INDEPENDENT_SHA256,
      },
    },
  };
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    fail("native checksum manifest does not bind the reviewed signed source");
  }
}

export function inspectReviewedIrohaRoot(rawRoot) {
  const root = requireCanonicalAbsoluteDirectory(rawRoot);
  const physicalGitDirectory = path.join(root, ".git");
  assertPhysicalGitClosure(physicalGitDirectory);
  const topLevel = git(root, "rev-parse", "--show-toplevel").trim();
  if (realpathSync.native(topLevel) !== root) {
    fail("IROHA_ROOT must name the Git worktree root");
  }

  const commit = git(root, "rev-parse", "--verify", "HEAD^{commit}").trim();
  if (commit !== REVIEWED_IROHA_COMMIT) {
    fail(
      `HEAD must be the reviewed signed commit ${REVIEWED_IROHA_COMMIT}; observed ${commit || "<empty>"}`,
    );
  }
  assertReviewedCommitChain(root, commit);
  assertStandaloneSourceClosure(root);

  const tree = git(root, "rev-parse", "HEAD^{tree}").trim();
  if (tree !== REVIEWED_IROHA_TREE) {
    fail(
      `the Iroha source tree must be ${REVIEWED_IROHA_TREE}; observed ${tree || "<empty>"}`,
    );
  }

  const sdkTree = git(root, "rev-parse", `HEAD:${SDK_RELATIVE_PATH}`).trim();
  if (sdkTree !== REVIEWED_IROHA_JS_TREE) {
    fail(
      `the Iroha JS tree must be ${REVIEWED_IROHA_JS_TREE}; observed ${sdkTree || "<empty>"}`,
    );
  }

  const status = git(
    root,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--ignored=no",
  );
  if (status.length !== 0) {
    fail(
      "the reviewed Iroha worktree must have no tracked or untracked changes",
    );
  }
  const ignored = git(
    root,
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  if (JSON.stringify(ignored) !== JSON.stringify(REVIEWED_IGNORED_FILES)) {
    fail(
      "the reviewed Iroha worktree must contain only sealed Cargo.lock and native package artifacts",
    );
  }

  const cargoLock = path.join(root, "Cargo.lock");
  const sdkRoot = path.join(root, SDK_RELATIVE_PATH);
  const nativeNode = path.join(sdkRoot, "native", "iroha_js_host.node");
  const nativeManifest = path.join(
    sdkRoot,
    "native",
    "iroha_js_host.checksums.json",
  );
  assertSealedFile(
    cargoLock,
    "ignored Cargo.lock",
    REVIEWED_CARGO_LOCK_SIZE,
    REVIEWED_CARGO_LOCK_SHA256,
  );
  assertSealedFile(
    nativeNode,
    "ignored native module",
    REVIEWED_NATIVE_SIZE,
    REVIEWED_NATIVE_SHA256,
  );
  assertSealedFile(
    nativeManifest,
    "ignored native checksum manifest",
    REVIEWED_NATIVE_MANIFEST_SIZE,
    REVIEWED_NATIVE_MANIFEST_SHA256,
  );
  assertReviewedNativeManifest(nativeManifest);

  if (
    !statSync(sdkRoot).isDirectory() ||
    lstatSync(sdkRoot).isSymbolicLink() ||
    realpathSync.native(sdkRoot) !== sdkRoot
  ) {
    fail("the reviewed Iroha JS SDK path must be a physical directory");
  }
  const sdkPackage = JSON.parse(
    readFileSync(path.join(sdkRoot, "package.json"), "utf8"),
  );
  if (sdkPackage.name !== SDK_PACKAGE_NAME || sdkPackage.version !== "0.0.3") {
    fail("the reviewed Iroha JS SDK package identity is unexpected");
  }

  git(root, "fsck", "--full", "--strict", "--no-dangling");
  assertPhysicalGitClosure(physicalGitDirectory);

  return {
    root,
    sdkRoot,
    nativeNode,
    nativeManifest,
    parentCommit: REVIEWED_IROHA_PARENT_COMMIT,
    commit,
    tree,
    sdkTree,
  };
}

function sortedPackageFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const files = [];
  for (const entry of entries) {
    const childRelative = relative
      ? path.join(relative, entry.name)
      : entry.name;
    const child = path.join(root, childRelative);
    if (entry.isSymbolicLink()) {
      fail(`installed SDK contains a symlink: ${childRelative}`);
    }
    if (entry.isDirectory()) {
      if (realpathSync.native(child) !== child) {
        fail(
          `installed SDK contains a noncanonical directory: ${childRelative}`,
        );
      }
      files.push(...sortedPackageFiles(root, childRelative));
      continue;
    }
    if (!entry.isFile()) {
      fail(`installed SDK contains a special file: ${childRelative}`);
    }
    if (childRelative === SOURCE_MARKER) {
      assertPhysicalFile(child, "installed SDK provenance marker");
      continue;
    }
    assertPhysicalFile(child, `installed SDK file ${childRelative}`);
    files.push(childRelative);
  }
  return files;
}

export function fingerprintInstalledPackage(root) {
  if (
    !lstatSync(root).isDirectory() ||
    lstatSync(root).isSymbolicLink() ||
    realpathSync.native(root) !== root
  ) {
    fail("installed Iroha JS SDK must be a physical directory");
  }
  const digest = createHash("sha256");
  digest.update("SORA_WALLET_IROHA_JS_INSTALLED_PACKAGE\0V1\0");
  for (const relative of sortedPackageFiles(root)) {
    const contents = readFileSync(path.join(root, relative));
    digest.update(Buffer.from(relative, "utf8"));
    digest.update("\0");
    digest.update(`${contents.length}`);
    digest.update("\0");
    digest.update(createHash("sha256").update(contents).digest("hex"));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function assertReviewedInstalledPackage(sdkRoot) {
  assertSealedFile(
    path.join(sdkRoot, "native", "iroha_js_host.node"),
    "installed native module",
    REVIEWED_NATIVE_SIZE,
    REVIEWED_NATIVE_SHA256,
  );
  const nativeManifest = path.join(
    sdkRoot,
    "native",
    "iroha_js_host.checksums.json",
  );
  assertSealedFile(
    nativeManifest,
    "installed native checksum manifest",
    REVIEWED_NATIVE_MANIFEST_SIZE,
    REVIEWED_NATIVE_MANIFEST_SHA256,
  );
  assertReviewedNativeManifest(nativeManifest);
  const observed = fingerprintInstalledPackage(sdkRoot);
  if (observed !== REVIEWED_IROHA_JS_PACKAGE_SHA256) {
    fail(
      `installed Iroha JS package digest must be ${REVIEWED_IROHA_JS_PACKAGE_SHA256}; observed ${observed}`,
    );
  }
  return observed;
}

function rewriteReleaseInstallFiles(repoRoot, temporaryRoot, source) {
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const lockfile = JSON.parse(
    readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"),
  );
  const installedLockEntry =
    lockfile.packages?.["node_modules/@iroha/iroha-js"];
  if (
    packageJson.dependencies?.[SDK_PACKAGE_NAME] !==
      `file:${LOCKFILE_LOCAL_SOURCE}` ||
    lockfile.packages?.[""]?.dependencies?.[SDK_PACKAGE_NAME] !==
      `file:${LOCKFILE_LOCAL_SOURCE}` ||
    installedLockEntry?.resolved !== `file:${LOCKFILE_LOCAL_SOURCE}` ||
    installedLockEntry?.version !== "0.0.3" ||
    installedLockEntry?.link !== undefined ||
    JSON.stringify(installedLockEntry?.dependencies) !==
      JSON.stringify({
        "@noble/ciphers": "^1.2.0",
        "@noble/curves": "^1.4.0",
        "@noble/hashes": "^1.5.0",
        "@scure/bip39": "^2.2.0",
        buffer: "^6.0.3",
      })
  ) {
    fail(
      "package.json and package-lock.json do not have the reviewed local SDK shape",
    );
  }

  const selectedRelative = path.relative(temporaryRoot, source.sdkRoot);
  if (selectedRelative.length === 0 || path.isAbsolute(selectedRelative)) {
    fail("could not derive the temporary reviewed SDK path");
  }
  const selectedSpec = `file:${selectedRelative}`;
  packageJson.dependencies[SDK_PACKAGE_NAME] = selectedSpec;
  lockfile.packages[""].dependencies[SDK_PACKAGE_NAME] = selectedSpec;
  lockfile.packages["node_modules/@iroha/iroha-js"].resolved = selectedSpec;

  writeFileSync(
    path.join(temporaryRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    path.join(temporaryRoot, "package-lock.json"),
    `${JSON.stringify(lockfile, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function copyReviewedNativeArtifact(source, installedRoot) {
  const nativeDirectory = path.join(installedRoot, "native");
  mkdirSync(nativeDirectory, { recursive: true });
  const installedManifest = path.join(
    nativeDirectory,
    "iroha_js_host.checksums.json",
  );
  assertSealedFile(
    installedManifest,
    "packed native checksum manifest",
    REVIEWED_NATIVE_MANIFEST_SIZE,
    REVIEWED_NATIVE_MANIFEST_SHA256,
  );
  const installedNode = path.join(nativeDirectory, "iroha_js_host.node");
  copyFileSync(source.nativeNode, installedNode, constants.COPYFILE_EXCL);
  chmodSync(installedNode, 0o500);
  assertSealedFile(
    installedNode,
    "installed native module",
    REVIEWED_NATIVE_SIZE,
    REVIEWED_NATIVE_SHA256,
  );
}

const expectedMarker = (source, installedDigest) => ({
  schema: SOURCE_MARKER_SCHEMA,
  source_parent_commit: source.parentCommit,
  source_commit: source.commit,
  source_signature_fingerprint: REVIEWED_IROHA_SIGNER_FINGERPRINT,
  source_tree: source.tree,
  source_js_tree: source.sdkTree,
  cargo_lock_sha256: REVIEWED_CARGO_LOCK_SHA256,
  cargo_lock_size_bytes: REVIEWED_CARGO_LOCK_SIZE,
  source_native_sha256: REVIEWED_NATIVE_SHA256,
  source_native_size_bytes: REVIEWED_NATIVE_SIZE,
  source_native_manifest_sha256: REVIEWED_NATIVE_MANIFEST_SHA256,
  source_native_manifest_size_bytes: REVIEWED_NATIVE_MANIFEST_SIZE,
  source_native_signing_independent_sha256: REVIEWED_SIGNING_INDEPENDENT_SHA256,
  source_native_build_profile: "release",
  installed_package_sha256: installedDigest,
});

export function verifyInstalledReleaseDependencies(repoRoot, rawRoot) {
  const source = inspectReviewedIrohaRoot(rawRoot);
  const installedRoot = path.join(
    repoRoot,
    "node_modules",
    "@iroha",
    "iroha-js",
  );
  const installedDigest = assertReviewedInstalledPackage(installedRoot);
  const markerPath = path.join(installedRoot, SOURCE_MARKER);
  assertPhysicalFile(markerPath, "installed SDK provenance marker");
  let marker;
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch (error) {
    fail(`installed SDK provenance marker cannot be read: ${error.message}`);
  }
  const reviewedMarker = expectedMarker(source, installedDigest);
  if (JSON.stringify(marker) !== JSON.stringify(reviewedMarker)) {
    fail("installed SDK provenance marker does not match the reviewed source");
  }
  return reviewedMarker;
}

export function installReleaseDependencies(repoRoot, rawRoot) {
  const canonicalRepo = realpathSync.native(repoRoot);
  if (canonicalRepo !== repoRoot || lstatSync(repoRoot).isSymbolicLink()) {
    fail("application repository root must be a canonical physical path");
  }
  const source = inspectReviewedIrohaRoot(rawRoot);
  const parent = path.dirname(repoRoot);
  const temporaryRoot = mkdtempSync(
    path.join(parent, ".sora-wallet-release-install-"),
  );
  const installedRoot = path.join(
    temporaryRoot,
    "node_modules",
    "@iroha",
    "iroha-js",
  );
  const destination = path.join(repoRoot, "node_modules");
  const backup = path.join(
    parent,
    `.sora-wallet-node-modules-backup-${process.pid}`,
  );

  try {
    rewriteReleaseInstallFiles(repoRoot, temporaryRoot, source);
    run(
      "npm",
      ["ci", "--ignore-scripts", "--install-links", "--no-audit", "--no-fund"],
      {
        cwd: temporaryRoot,
        env: {
          ...process.env,
          npm_config_update_notifier: "false",
        },
      },
    );

    copyReviewedNativeArtifact(source, installedRoot);
    const installedDigest = assertReviewedInstalledPackage(installedRoot);
    const finalSource = inspectReviewedIrohaRoot(rawRoot);
    const marker = expectedMarker(finalSource, installedDigest);
    const markerPath = path.join(installedRoot, SOURCE_MARKER);
    let markerExists = false;
    try {
      lstatSync(markerPath);
      markerExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        fail(
          `packed SDK provenance marker cannot be inspected: ${error.message}`,
        );
      }
    }
    if (markerExists) {
      fail("packed SDK must not contain a provenance marker");
    }
    writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, {
      flag: "wx",
      mode: 0o444,
    });
    assertPhysicalFile(markerPath, "installed SDK provenance marker");

    let movedExisting = false;
    try {
      renameSync(destination, backup);
      movedExisting = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      renameSync(path.join(temporaryRoot, "node_modules"), destination);
    } catch (error) {
      if (movedExisting) renameSync(backup, destination);
      throw error;
    }
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
    return marker;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  fingerprintInstalledPackage,
  inspectReviewedIrohaRoot,
  installReleaseDependencies,
  REVIEWED_CARGO_LOCK_SHA256,
  REVIEWED_CARGO_LOCK_SIZE,
  REVIEWED_IROHA_COMMIT,
  REVIEWED_IROHA_JS_PACKAGE_SHA256,
  REVIEWED_IROHA_JS_TREE,
  REVIEWED_IROHA_PARENT_COMMIT,
  REVIEWED_IROHA_SIGNER_FINGERPRINT,
  REVIEWED_IROHA_TREE,
  REVIEWED_NATIVE_MANIFEST_SHA256,
  REVIEWED_NATIVE_MANIFEST_SIZE,
  REVIEWED_NATIVE_SHA256,
  REVIEWED_NATIVE_SIZE,
  REVIEWED_SIGNING_INDEPENDENT_SHA256,
  SOURCE_MARKER_SCHEMA,
  verifyInstalledReleaseDependencies,
} from "./iroha-js-release-source.mjs";

const sourceRoot = process.env.IROHA_ROOT;
assert.ok(sourceRoot, "IROHA_ROOT is required for this release-source test");
const source = inspectReviewedIrohaRoot(sourceRoot);
assert.equal(source.parentCommit, REVIEWED_IROHA_PARENT_COMMIT);
assert.equal(source.commit, REVIEWED_IROHA_COMMIT);
assert.equal(source.tree, REVIEWED_IROHA_TREE);
assert.equal(source.sdkTree, REVIEWED_IROHA_JS_TREE);
assert.throws(
  () => inspectReviewedIrohaRoot("../iroha"),
  /explicit non-root absolute path/,
);

const tempRoot = realpathSync.native(
  mkdtempSync(path.join(tmpdir(), "sora-wallet-iroha-js-release-source-test-")),
);
const sparseClone = path.join(tempRoot, "iroha");
const sourceSymlink = path.join(tempRoot, "iroha-link");
const fakeRepo = path.join(tempRoot, "app");
const installedCopy = path.join(fakeRepo, "node_modules", "@iroha", "iroha-js");

const releaseSourceModuleUrl = new URL(
  "./iroha-js-release-source.mjs",
  import.meta.url,
).href;
const gpgResolverProbeSource = `
import { inspectReviewedIrohaRoot } from ${JSON.stringify(releaseSourceModuleUrl)};
const inspected = inspectReviewedIrohaRoot(${JSON.stringify(sourceRoot)});
process.stdout.write(inspected.commit);
`;
const runGpgResolverProbe = (searchPath) =>
  spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", gpgResolverProbeSource],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: searchPath,
      },
    },
  );

const hostileGitEnvironment = {
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "core.bare",
  GIT_CONFIG_VALUE_0: "true",
  GIT_DIR: path.join(tempRoot, "attacker-git-dir"),
  GIT_OBJECT_DIRECTORY: path.join(tempRoot, "attacker-objects"),
  GIT_WORK_TREE: path.join(tempRoot, "attacker-worktree"),
};
const previousGitEnvironment = new Map();
for (const [name, value] of Object.entries(hostileGitEnvironment)) {
  previousGitEnvironment.set(name, process.env[name]);
  process.env[name] = value;
}
try {
  assert.equal(
    inspectReviewedIrohaRoot(sourceRoot).commit,
    REVIEWED_IROHA_COMMIT,
  );
} finally {
  for (const [name, value] of previousGitEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function git(args) {
  const result = spawnSync("/usr/bin/git", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_NO_LAZY_FETCH: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    },
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return `${result.stdout ?? ""}`;
}

function copyReviewedIgnoredClosure(destination) {
  copyFileSync(
    path.join(sourceRoot, "Cargo.lock"),
    path.join(destination, "Cargo.lock"),
  );
  mkdirSync(path.join(destination, "javascript", "iroha_js", "native"), {
    recursive: true,
  });
  for (const filename of [
    "iroha_js_host.node",
    "iroha_js_host.checksums.json",
  ]) {
    copyFileSync(
      path.join(sourceRoot, "javascript", "iroha_js", "native", filename),
      path.join(destination, "javascript", "iroha_js", "native", filename),
    );
  }
}

function gitObjectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(child);
      } else if (entry.isFile()) {
        files.push(child);
      }
    }
  };
  visit(path.join(root, ".git", "objects"));
  return files;
}

function mutateFirstByte(file, callback) {
  const originalMode = statSync(file).mode & 0o777;
  chmodSync(file, originalMode | 0o200);
  const descriptor = openSync(file, "r+");
  const original = Buffer.alloc(1);
  try {
    assert.equal(readSync(descriptor, original, 0, 1, 0), 1);
    const mutated = Buffer.from([original[0] ^ 0xff]);
    assert.equal(writeSync(descriptor, mutated, 0, 1, 0), 1);
    callback();
  } finally {
    writeSync(descriptor, original, 0, 1, 0);
    closeSync(descriptor);
    chmodSync(file, originalMode);
  }
}

try {
  const emptyExecutablePath = path.join(tempRoot, "empty-executable-path");
  mkdirSync(emptyExecutablePath);
  const missingGpgProbe = runGpgResolverProbe(emptyExecutablePath);
  assert.notEqual(missingGpgProbe.status, 0);
  assert.match(
    `${missingGpgProbe.stdout}\n${missingGpgProbe.stderr}`,
    /PATH does not contain a canonical absolute regular GPG executable/,
  );

  const whichGpg = spawnSync("/usr/bin/which", ["gpg"], {
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(
    whichGpg.status,
    0,
    `could not resolve the test GPG executable: ${whichGpg.stderr}`,
  );
  const canonicalGpg = realpathSync.native(whichGpg.stdout.trim());
  const symlinkedGpgPath = path.join(tempRoot, "symlinked-gpg-path");
  mkdirSync(symlinkedGpgPath);
  symlinkSync(canonicalGpg, path.join(symlinkedGpgPath, "gpg"));
  const symlinkedGpgProbe = runGpgResolverProbe(
    `${symlinkedGpgPath}${path.delimiter}${process.env.PATH}`,
  );
  assert.equal(
    symlinkedGpgProbe.status,
    0,
    `canonical GPG symlink probe failed:\n${symlinkedGpgProbe.stdout}\n${symlinkedGpgProbe.stderr}`,
  );
  assert.equal(symlinkedGpgProbe.stdout, REVIEWED_IROHA_COMMIT);

  symlinkSync(sourceRoot, sourceSymlink, "dir");
  assert.throws(
    () => inspectReviewedIrohaRoot(sourceSymlink),
    /non-symlink directory/,
  );

  git([
    "clone",
    "--quiet",
    "--no-local",
    "--no-checkout",
    sourceRoot,
    sparseClone,
  ]);
  git([
    "-C",
    sparseClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_COMMIT,
  ]);
  git(["-C", sparseClone, "remote", "remove", "origin"]);
  copyReviewedIgnoredClosure(sparseClone);
  assert.equal(
    inspectReviewedIrohaRoot(sparseClone).sdkTree,
    REVIEWED_IROHA_JS_TREE,
  );
  assert.equal(
    git(["-C", sparseClone, "rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    "HEAD",
  );

  git(["-C", sparseClone, "remote", "add", "origin", sourceRoot]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not retain Git remotes/,
  );
  git(["-C", sparseClone, "remote", "remove", "origin"]);

  git([
    "-C",
    sparseClone,
    "checkout",
    "--quiet",
    "-b",
    "release-source-test-attached",
  ]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must use a detached HEAD/,
  );
  git([
    "-C",
    sparseClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_COMMIT,
  ]);
  git(["-C", sparseClone, "branch", "-D", "release-source-test-attached"]);

  const separateGitClone = path.join(tempRoot, "separate-git-worktree");
  const separateGitDirectory = path.join(tempRoot, "separate-git-directory");
  git([
    "clone",
    "--quiet",
    "--no-local",
    "--no-checkout",
    "--separate-git-dir",
    separateGitDirectory,
    sparseClone,
    separateGitClone,
  ]);
  git([
    "-C",
    separateGitClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_COMMIT,
  ]);
  assert.throws(
    () => inspectReviewedIrohaRoot(separateGitClone),
    /canonical physical \.git directory/,
  );
  rmSync(separateGitClone, { recursive: true, force: true });
  rmSync(separateGitDirectory, { recursive: true, force: true });

  const localClone = path.join(tempRoot, "local-hardlink-clone");
  git([
    "clone",
    "--quiet",
    "--local",
    "--no-checkout",
    sparseClone,
    localClone,
  ]);
  git([
    "-C",
    localClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_COMMIT,
  ]);
  const localCloneHasHardlinks = gitObjectFiles(localClone).some(
    (file) => lstatSync(file).nlink > 1,
  );
  if (localCloneHasHardlinks) {
    assert.throws(
      () => inspectReviewedIrohaRoot(localClone),
      /must not use hard-linked Git objects/,
    );
  } else {
    process.stdout.write(
      "ok - local-clone hardlink rejection skipped because this filesystem did not create hard links\n",
    );
  }
  rmSync(localClone, { recursive: true, force: true });

  const hardLinkedGitHead = path.join(tempRoot, "hard-linked-git-HEAD");
  linkSync(path.join(sparseClone, ".git", "HEAD"), hardLinkedGitHead);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use hard-linked Git metadata/,
  );
  rmSync(hardLinkedGitHead);

  const includedGitConfig = path.join(tempRoot, "included-git-config");
  writeFileSync(includedGitConfig, "");
  git(["-C", sparseClone, "config", "include.path", includedGitConfig]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use Git config includes/,
  );
  git(["-C", sparseClone, "config", "--unset", "include.path"]);

  const includeIfKey = `includeIf.gitdir:${sparseClone}/.path`;
  git(["-C", sparseClone, "config", includeIfKey, includedGitConfig]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use Git config includes/,
  );
  git(["-C", sparseClone, "config", "--unset", includeIfKey]);

  git(["-C", sparseClone, "config", "extensions.worktreeConfig", "true"]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use worktree Git config/,
  );
  git(["-C", sparseClone, "config", "--unset", "extensions.worktreeConfig"]);

  const physicalWorktreeConfig = path.join(
    sparseClone,
    ".git",
    "config.worktree",
  );
  writeFileSync(physicalWorktreeConfig, "");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not contain config\.worktree/,
  );
  rmSync(physicalWorktreeConfig);

  git(["-C", sparseClone, "config", "extensions.partialClone", "origin"]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use partial or promisor Git/,
  );
  git(["-C", sparseClone, "config", "--unset", "extensions.partialClone"]);

  git(["-C", sparseClone, "config", "remote.origin.promisor", "true"]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not use partial or promisor Git/,
  );
  git(["-C", sparseClone, "config", "--unset", "remote.origin.promisor"]);

  const promisorMarker = path.join(
    sparseClone,
    ".git",
    "objects",
    "pack",
    "release-source-test.promisor",
  );
  writeFileSync(promisorMarker, "");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not contain promisor packs/,
  );
  rmSync(promisorMarker);

  const externalObjectDirectory = path.join(
    tempRoot,
    "external-object-directory",
  );
  const objectDirectoryLink = path.join(
    sparseClone,
    ".git",
    "objects",
    "release-source-test-link",
  );
  mkdirSync(externalObjectDirectory);
  symlinkSync(externalObjectDirectory, objectDirectoryLink, "dir");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /object store must not contain symbolic links/,
  );
  rmSync(objectDirectoryLink);
  rmSync(externalObjectDirectory, { recursive: true, force: true });

  const objectRoot = path.join(sparseClone, ".git", "objects");
  const relocatedObjectRoot = path.join(
    sparseClone,
    ".git",
    "release-source-test-objects",
  );
  renameSync(objectRoot, relocatedObjectRoot);
  symlinkSync(relocatedObjectRoot, objectRoot, "dir");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /object store must not contain symbolic links/,
  );
  rmSync(objectRoot);
  renameSync(relocatedObjectRoot, objectRoot);

  const alternatesPath = path.join(
    sparseClone,
    ".git",
    "objects",
    "info",
    "alternates",
  );
  writeFileSync(
    alternatesPath,
    `${path.join(sourceRoot, ".git", "objects")}\n`,
  );
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not borrow Git objects/,
  );
  rmSync(alternatesPath);

  git([
    "-C",
    sparseClone,
    "replace",
    REVIEWED_IROHA_COMMIT,
    REVIEWED_IROHA_PARENT_COMMIT,
  ]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must not contain replacement refs/,
  );
  git(["-C", sparseClone, "replace", "-d", REVIEWED_IROHA_COMMIT]);

  git(["-C", sparseClone, "update-index", "--skip-worktree", "README.md"]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must use a complete ordinary index/,
  );
  git(["-C", sparseClone, "update-index", "--no-skip-worktree", "README.md"]);

  git([
    "-C",
    sparseClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_PARENT_COMMIT,
  ]);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /HEAD must be the reviewed signed commit/,
  );
  git([
    "-C",
    sparseClone,
    "checkout",
    "--quiet",
    "--detach",
    REVIEWED_IROHA_COMMIT,
  ]);

  const unexpectedIgnored = path.join(
    sparseClone,
    "target",
    "unreviewed-artifact",
  );
  mkdirSync(path.dirname(unexpectedIgnored), { recursive: true });
  writeFileSync(unexpectedIgnored, "unreviewed\n");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must contain only sealed Cargo\.lock and native package artifacts/,
  );
  rmSync(path.join(sparseClone, "target"), { recursive: true });

  writeFileSync(path.join(sparseClone, "unreviewed.txt"), "unreviewed\n");
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /must have no tracked or untracked changes/,
  );
  rmSync(path.join(sparseClone, "unreviewed.txt"));

  mutateFirstByte(path.join(sparseClone, "Cargo.lock"), () => {
    assert.throws(
      () => inspectReviewedIrohaRoot(sparseClone),
      /Cargo\.lock does not match/,
    );
  });
  const hardLinkedCargoLock = path.join(tempRoot, "hard-linked-Cargo.lock");
  linkSync(path.join(sparseClone, "Cargo.lock"), hardLinkedCargoLock);
  assert.throws(
    () => inspectReviewedIrohaRoot(sparseClone),
    /Cargo\.lock must be one canonical physical non-hard-linked file/,
  );
  rmSync(hardLinkedCargoLock);
  mutateFirstByte(
    path.join(
      sparseClone,
      "javascript",
      "iroha_js",
      "native",
      "iroha_js_host.node",
    ),
    () => {
      assert.throws(
        () => inspectReviewedIrohaRoot(sparseClone),
        /native module does not match/,
      );
    },
  );
  mutateFirstByte(
    path.join(
      sparseClone,
      "javascript",
      "iroha_js",
      "native",
      "iroha_js_host.checksums.json",
    ),
    () => {
      assert.throws(
        () => inspectReviewedIrohaRoot(sparseClone),
        /native checksum manifest does not match/,
      );
    },
  );

  mkdirSync(fakeRepo);
  cpSync(path.resolve("package.json"), path.join(fakeRepo, "package.json"));
  cpSync(
    path.resolve("package-lock.json"),
    path.join(fakeRepo, "package-lock.json"),
  );
  const installed = installReleaseDependencies(fakeRepo, sourceRoot);
  assert.deepEqual(installed, {
    schema: SOURCE_MARKER_SCHEMA,
    source_parent_commit: REVIEWED_IROHA_PARENT_COMMIT,
    source_commit: REVIEWED_IROHA_COMMIT,
    source_signature_fingerprint: REVIEWED_IROHA_SIGNER_FINGERPRINT,
    source_tree: REVIEWED_IROHA_TREE,
    source_js_tree: REVIEWED_IROHA_JS_TREE,
    cargo_lock_sha256: REVIEWED_CARGO_LOCK_SHA256,
    cargo_lock_size_bytes: REVIEWED_CARGO_LOCK_SIZE,
    source_native_sha256: REVIEWED_NATIVE_SHA256,
    source_native_size_bytes: REVIEWED_NATIVE_SIZE,
    source_native_manifest_sha256: REVIEWED_NATIVE_MANIFEST_SHA256,
    source_native_manifest_size_bytes: REVIEWED_NATIVE_MANIFEST_SIZE,
    source_native_signing_independent_sha256:
      REVIEWED_SIGNING_INDEPENDENT_SHA256,
    source_native_build_profile: "release",
    installed_package_sha256: REVIEWED_IROHA_JS_PACKAGE_SHA256,
  });
  assert.equal(
    fingerprintInstalledPackage(installedCopy),
    REVIEWED_IROHA_JS_PACKAGE_SHA256,
  );
  assert.equal(
    verifyInstalledReleaseDependencies(fakeRepo, sourceRoot).source_commit,
    REVIEWED_IROHA_COMMIT,
  );

  const markerPath = path.join(installedCopy, ".cbsi-release-source.json");
  const marker = readFileSync(markerPath, "utf8");
  const hardLinkedMarker = path.join(tempRoot, "hard-linked-source-marker");
  linkSync(markerPath, hardLinkedMarker);
  assert.throws(
    () => verifyInstalledReleaseDependencies(fakeRepo, sourceRoot),
    /provenance marker must be one canonical physical non-hard-linked file/,
  );
  rmSync(hardLinkedMarker);

  const physicalMarker = path.join(tempRoot, "physical-source-marker");
  renameSync(markerPath, physicalMarker);
  symlinkSync(physicalMarker, markerPath);
  assert.throws(
    () => verifyInstalledReleaseDependencies(fakeRepo, sourceRoot),
    /installed SDK contains a symlink: \.cbsi-release-source\.json/,
  );
  rmSync(markerPath);
  renameSync(physicalMarker, markerPath);

  chmodSync(markerPath, 0o600);
  writeFileSync(markerPath, '{"schema":"tampered"}\n');
  assert.throws(
    () => verifyInstalledReleaseDependencies(fakeRepo, sourceRoot),
    /provenance marker does not match/,
  );
  writeFileSync(markerPath, marker);

  const installedIndex = path.join(installedCopy, "dist", "index.js");
  const installedIndexSource = readFileSync(installedIndex);
  writeFileSync(installedIndex, "// tampered\n");
  assert.notEqual(
    fingerprintInstalledPackage(installedCopy),
    REVIEWED_IROHA_JS_PACKAGE_SHA256,
  );
  assert.throws(
    () => verifyInstalledReleaseDependencies(fakeRepo, sourceRoot),
    /installed Iroha JS package digest/,
  );
  writeFileSync(installedIndex, installedIndexSource);

  mutateFirstByte(
    path.join(installedCopy, "native", "iroha_js_host.node"),
    () => {
      assert.throws(
        () => verifyInstalledReleaseDependencies(fakeRepo, sourceRoot),
        /installed native module does not match/,
      );
    },
  );

  process.stdout.write(
    `ok - signed parent ${REVIEWED_IROHA_PARENT_COMMIT}, signed v4 source ${REVIEWED_IROHA_COMMIT}, sealed release native package, installer, and installed provenance fail closed\n`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

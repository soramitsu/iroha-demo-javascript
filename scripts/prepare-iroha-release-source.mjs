#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEWED_IROHA_SIGNER_FINGERPRINT,
  resolveCanonicalGitProgram,
  resolveCanonicalGpgProgram,
} from "./iroha-js-release-source.mjs";

const GPG_PUBLIC_KEY_ENV = "IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64";
const MAX_PUBLIC_KEY_BYTES = 1024 * 1024;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const fail = (message) => {
  throw new Error(`Iroha release signer provisioning refused: ${message}`);
};

export const decodeCanonicalSignerPublicKey = (encoded) => {
  if (
    typeof encoded !== "string" ||
    encoded.length === 0 ||
    encoded.length > Math.ceil(MAX_PUBLIC_KEY_BYTES / 3) * 4 ||
    !CANONICAL_BASE64_PATTERN.test(encoded)
  ) {
    fail(
      `${GPG_PUBLIC_KEY_ENV} must be bounded canonical unwrapped standard base64`,
    );
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_PUBLIC_KEY_BYTES ||
    bytes.toString("base64") !== encoded
  ) {
    fail(
      `${GPG_PUBLIC_KEY_ENV} must be bounded canonical unwrapped standard base64`,
    );
  }
  return bytes;
};

export const primaryPublicKeyFingerprints = (colonListing) => {
  if (typeof colonListing !== "string") {
    fail("GPG public-key inventory is malformed");
  }
  const fingerprints = [];
  let awaitingPrimaryFingerprint = false;
  for (const line of colonListing.split(/\r?\n/u)) {
    const fields = line.split(":");
    if (fields[0] === "pub") {
      awaitingPrimaryFingerprint = true;
    } else if (fields[0] === "sub") {
      awaitingPrimaryFingerprint = false;
    } else if (fields[0] === "fpr" && awaitingPrimaryFingerprint) {
      fingerprints.push(fields[9] ?? "");
      awaitingPrimaryFingerprint = false;
    }
  }
  return fingerprints;
};

export const assertExactReviewedPublicKey = (publicListing, secretListing) => {
  const fingerprints = primaryPublicKeyFingerprints(publicListing);
  if (
    fingerprints.length !== 1 ||
    fingerprints[0] !== REVIEWED_IROHA_SIGNER_FINGERPRINT
  ) {
    fail(
      `the keyring must contain exactly the reviewed public primary key ${REVIEWED_IROHA_SIGNER_FINGERPRINT}`,
    );
  }
  if (
    typeof secretListing !== "string" ||
    secretListing.split(/\r?\n/u).some((line) => /^(?:sec|ssb):/u.test(line))
  ) {
    fail("the release verification keyring must not contain a private key");
  }
};

const requireCanonicalDirectory = (path, label) => {
  const canonical = realpathSync.native(resolve(path));
  const stats = lstatSync(canonical);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail(`${label} must be a canonical physical directory`);
  }
  return canonical;
};

const requireCanonicalFile = (path, label) => {
  const canonical = realpathSync.native(resolve(path));
  const stats = lstatSync(canonical);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail(`${label} must be a canonical physical file`);
  }
  return canonical;
};

const toolEnvironment = (gpgHome) => {
  const environment = {
    ...process.env,
    GNUPGHOME: gpgHome,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  };
  delete environment[GPG_PUBLIC_KEY_ENV];
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
  return environment;
};

const run = (command, args, environment, label) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: environment,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr ?? ""}`.trim();
    fail(
      `${label} failed${detail ? `: ${detail}` : ` (status ${String(result.status)})`}`,
    );
  }
  return `${result.stdout ?? ""}`;
};

const appendGitHubEnvironment = (githubEnvironmentPath, values) => {
  const path = requireCanonicalFile(
    githubEnvironmentPath,
    "GitHub Actions environment file",
  );
  for (const [name, value] of Object.entries(values)) {
    if (/\r|\n/u.test(value)) {
      fail(`${name} cannot be written safely to the GitHub environment`);
    }
  }
  appendFileSync(
    path,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
};

export const prepareIrohaReleaseSource = ({
  encodedPublicKey = process.env[GPG_PUBLIC_KEY_ENV],
  expectedRevision = process.env.IROHA_REF,
  githubEnvironmentPath = process.env.GITHUB_ENV,
  irohaRoot,
  runnerTemporaryRoot = process.env.RUNNER_TEMP,
} = {}) => {
  if (typeof irohaRoot !== "string" || !irohaRoot) {
    fail("--iroha-root is required");
  }
  if (
    typeof expectedRevision !== "string" ||
    !GIT_REVISION_PATTERN.test(expectedRevision)
  ) {
    fail("IROHA_REF must be one exact lowercase 40-character commit SHA");
  }
  if (
    typeof githubEnvironmentPath !== "string" ||
    !githubEnvironmentPath ||
    typeof runnerTemporaryRoot !== "string" ||
    !runnerTemporaryRoot
  ) {
    fail("GITHUB_ENV and RUNNER_TEMP are required GitHub release inputs");
  }

  const sourceRoot = requireCanonicalDirectory(irohaRoot, "Iroha source root");
  const temporaryRoot = requireCanonicalDirectory(
    runnerTemporaryRoot,
    "GitHub runner temporary root",
  );
  const publicKey = decodeCanonicalSignerPublicKey(encodedPublicKey);
  const gpgHome = realpathSync.native(
    mkdtempSync(join(temporaryRoot, "sora-wallet-iroha-release-gnupg-")),
  );
  chmodSync(gpgHome, 0o700);
  const publicKeyPath = join(gpgHome, "reviewed-signer-public-key.gpg");
  writeFileSync(publicKeyPath, publicKey, { flag: "wx", mode: 0o600 });

  const environment = toolEnvironment(gpgHome);
  const gpgProgram = resolveCanonicalGpgProgram();
  try {
    run(
      gpgProgram,
      [
        "--batch",
        "--no-tty",
        "--homedir",
        gpgHome,
        "--import-options",
        "import-clean",
        "--import",
        publicKeyPath,
      ],
      environment,
      "reviewed signer public-key import",
    );
  } finally {
    unlinkSync(publicKeyPath);
  }
  const listingArguments = [
    "--batch",
    "--no-tty",
    "--homedir",
    gpgHome,
    "--with-colons",
    "--fixed-list-mode",
    "--fingerprint",
  ];
  const publicListing = run(
    gpgProgram,
    [...listingArguments, "--list-public-keys"],
    environment,
    "reviewed signer public-key inventory",
  );
  const secretListing = run(
    gpgProgram,
    [...listingArguments, "--list-secret-keys"],
    environment,
    "release signer private-key inventory",
  );
  assertExactReviewedPublicKey(publicListing, secretListing);

  const gitProgram = resolveCanonicalGitProgram();
  const observedRevision = run(
    gitProgram,
    ["-C", sourceRoot, "rev-parse", "HEAD"],
    environment,
    "Iroha source revision inspection",
  ).trim();
  if (observedRevision !== expectedRevision) {
    fail(
      `Iroha source HEAD must be ${expectedRevision}; observed ${observedRevision || "nothing"}`,
    );
  }
  const branch = run(
    gitProgram,
    ["-C", sourceRoot, "rev-parse", "--abbrev-ref", "HEAD"],
    environment,
    "Iroha detached-HEAD inspection",
  ).trim();
  if (branch !== "HEAD") {
    fail("the reviewed Iroha source must already use a detached HEAD");
  }
  const remotes = run(
    gitProgram,
    ["-C", sourceRoot, "remote"],
    environment,
    "Iroha source remote inspection",
  )
    .split(/\r?\n/u)
    .filter(Boolean);
  if (remotes.length > 1 || (remotes.length === 1 && remotes[0] !== "origin")) {
    fail("the release checkout may contain only the expected origin remote");
  }
  if (remotes[0] === "origin") {
    run(
      gitProgram,
      ["-C", sourceRoot, "remote", "remove", "origin"],
      environment,
      "Iroha source remote removal",
    );
  }
  const remainingRemotes = run(
    gitProgram,
    ["-C", sourceRoot, "remote"],
    environment,
    "Iroha sealed-source remote inspection",
  ).trim();
  if (remainingRemotes) {
    fail("the reviewed Iroha source retained a Git remote");
  }

  appendGitHubEnvironment(githubEnvironmentPath, {
    GNUPGHOME: gpgHome,
    IROHA_ROOT: sourceRoot,
  });
  return Object.freeze({
    fingerprint: REVIEWED_IROHA_SIGNER_FINGERPRINT,
    gpgHome,
    sourceRoot,
  });
};

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    fail(`${name} is required`);
  }
  return process.argv[index + 1];
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const prepared = prepareIrohaReleaseSource({
    irohaRoot: readOption("--iroha-root"),
  });
  process.stdout.write(
    `Prepared reviewed Iroha source ${prepared.sourceRoot} with public signer ${prepared.fingerprint}.\n`,
  );
}

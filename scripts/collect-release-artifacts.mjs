#!/usr/bin/env node

import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?$/u;
const RELEASE_ARTIFACT_PATTERN = /\.(?:AppImage|deb|dmg|exe|rpm|zip)$/u;

const requireCanonicalDirectory = (directory, label) => {
  const resolved = resolve(directory);
  const stats = lstatSync(directory);
  if (
    directory !== resolved ||
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    realpathSync.native(directory) !== directory
  ) {
    throw new Error(`${label} must be a canonical physical directory.`);
  }
  return stats;
};

const requireCanonicalOutputPath = (outputDirectory) => {
  const resolved = resolve(outputDirectory);
  if (outputDirectory !== resolved) {
    throw new Error(
      "The release artifact output must be an absolute normalized path.",
    );
  }
  requireCanonicalDirectory(
    dirname(outputDirectory),
    "The release artifact output parent",
  );
};

const artifactNamesFor = (version, platform, arch) => {
  const prefix = `SORA-Wallet-${version}`;
  if (platform === "mac" && (arch === "x64" || arch === "arm64")) {
    return [`${prefix}-mac-${arch}.dmg`, `${prefix}-mac-${arch}.zip`];
  }
  if (platform === "win" && arch === "x64") {
    return [`${prefix}-win-x64.exe`, `${prefix}-win-x64.zip`];
  }
  if (platform === "linux" && arch === "x64") {
    return [
      `${prefix}-linux-x64.AppImage`,
      `${prefix}-linux-x64.deb`,
      `${prefix}-linux-x64.rpm`,
    ];
  }
  throw new Error(
    `Unsupported first-release artifact target ${platform}/${arch ?? "unspecified"}.`,
  );
};

export const expectedReleaseArtifactNames = ({ version, platform, arch }) => {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release version ${version}.`);
  }
  if (platform === "all") {
    return [
      ...artifactNamesFor(version, "mac", "x64"),
      ...artifactNamesFor(version, "mac", "arm64"),
      ...artifactNamesFor(version, "win", "x64"),
      ...artifactNamesFor(version, "linux", "x64"),
    ].toSorted();
  }
  return artifactNamesFor(version, platform, arch).toSorted();
};

export const validateReleaseArtifactInventory = ({
  sourceDirectory,
  version,
  platform,
  arch,
}) => {
  requireCanonicalDirectory(sourceDirectory, "The release artifact source");
  const expected = expectedReleaseArtifactNames({ version, platform, arch });
  const expectedSet = new Set(expected);
  const directoryEntries = readdirSync(sourceDirectory);
  const actual = (
    platform === "all"
      ? directoryEntries
      : directoryEntries.filter((name) => RELEASE_ARTIFACT_PATTERN.test(name))
  ).toSorted();

  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error(
      `Release artifact inventory mismatch: expected ${expected.join(
        ", ",
      )}; found ${actual.join(", ") || "nothing"}.`,
    );
  }

  for (const name of actual) {
    if (!expectedSet.has(name)) {
      throw new Error(`Unexpected release artifact ${name}.`);
    }
    const path = resolve(sourceDirectory, name);
    const stats = lstatSync(path);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.nlink !== 1 ||
      stats.size === 0 ||
      realpathSync.native(path) !== path
    ) {
      throw new Error(
        `Release artifact ${name} must be one non-empty canonical physical file.`,
      );
    }
  }
  return expected;
};

export const collectReleaseArtifacts = ({
  sourceDirectory,
  outputDirectory,
  version,
  platform,
  arch,
}) => {
  requireCanonicalOutputPath(outputDirectory);
  if (sourceDirectory === outputDirectory) {
    throw new Error(
      "The release artifact source and output directories must be distinct.",
    );
  }
  const names = validateReleaseArtifactInventory({
    arch,
    platform,
    sourceDirectory,
    version,
  });
  mkdirSync(outputDirectory, { recursive: false });
  for (const name of names) {
    copyFileSync(
      resolve(sourceDirectory, name),
      resolve(outputDirectory, name),
      constants.COPYFILE_EXCL,
    );
  }
  validateReleaseArtifactInventory({
    arch,
    platform,
    sourceDirectory: outputDirectory,
    version,
  });
  return names;
};

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`${name} is required.`);
  }
  return process.argv[index + 1];
};

const runCli = () => {
  const sourceDirectory = resolve(readOption("--input"));
  const version = readOption("--version");
  const platform = readOption("--platform");
  const arch = platform === "all" ? undefined : readOption("--arch");
  if (process.argv.includes("--validate-only")) {
    const names = validateReleaseArtifactInventory({
      arch,
      platform,
      sourceDirectory,
      version,
    });
    process.stdout.write(`${names.join("\n")}\n`);
    return;
  }
  const outputDirectory = resolve(readOption("--output"));
  const names = collectReleaseArtifacts({
    arch,
    outputDirectory,
    platform,
    sourceDirectory,
    version,
  });
  process.stdout.write(`${names.join("\n")}\n`);
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli();
}

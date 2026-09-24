#!/usr/bin/env node

import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIrohaNative } from "./build-iroha-native.mjs";
import { resolveCompatibleIrohaSdkRoot } from "./iroha-sdk-compat.mjs";
import {
  resolveNativeBuildRequirement,
  resolveNativeProvenanceRequirement,
} from "./postinstallNativeCheck.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const sdkRoot = resolveCompatibleIrohaSdkRoot({ projectRoot });
const source = join(sdkRoot, "native");
const distRoot = join(projectRoot, "dist");
const target = join(projectRoot, "dist", "native");
const retiredNativeTarget = join(projectRoot, "dist", "native-v1");
const nativeProvenanceRequirement = resolveNativeProvenanceRequirement(
  process.env,
);
const inspectNativeBinding = () =>
  resolveNativeBuildRequirement(
    sdkRoot,
    undefined,
    undefined,
    nativeProvenanceRequirement,
  );

const requireCanonicalPhysicalDirectory = (path, label) => {
  const metadata = lstatSync(path);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync.native(path) !== path
  ) {
    throw new Error(`${label} must be a canonical physical directory.`);
  }
};

const requirement = inspectNativeBinding();

if (requirement.shouldBuild) {
  if (nativeProvenanceRequirement !== null) {
    throw new Error(
      `Refusing to rebuild a release native binding from the installed package (${requirement.reason}). Build the reviewed sibling source and stage its verified native pair first.`,
    );
  }
  console.log(
    `Building @iroha/iroha-js native bindings before copy (${requirement.reason})...`,
  );
  buildIrohaNative({ projectRoot, sdkRoot });
  const refreshedRequirement = inspectNativeBinding();
  if (refreshedRequirement.shouldBuild) {
    throw new Error(
      `Failed to build a verified @iroha/iroha-js native binding before copy (${refreshedRequirement.reason}).`,
    );
  }
}

requireCanonicalPhysicalDirectory(source, "@iroha/iroha-js native directory");
requireCanonicalPhysicalDirectory(distRoot, "Wallet build output");
rmSync(retiredNativeTarget, { recursive: true, force: true });
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { mode: 0o700 });
for (const sourcePath of [
  requirement.nativeModulePath,
  requirement.checksumManifestPath,
]) {
  copyFileSync(
    sourcePath,
    join(
      target,
      sourcePath === requirement.nativeModulePath
        ? "iroha_js_host.node"
        : "iroha_js_host.checksums.json",
    ),
    constants.COPYFILE_EXCL,
  );
}
const stagedEntries = readdirSync(target).toSorted();
const expectedEntries = ["iroha_js_host.checksums.json", "iroha_js_host.node"];
if (
  stagedEntries.length !== expectedEntries.length ||
  stagedEntries.some((entry, index) => entry !== expectedEntries[index])
) {
  throw new Error("Staged @iroha/iroha-js native inventory is not exact.");
}
const stagedRequirement = resolveNativeBuildRequirement(
  distRoot,
  undefined,
  undefined,
  nativeProvenanceRequirement,
);
if (stagedRequirement.shouldBuild) {
  throw new Error(
    `Staged @iroha/iroha-js native binding failed verification (${stagedRequirement.reason}).`,
  );
}
console.log(
  `Copied the verified @iroha/iroha-js native pair from ${sdkRoot} to ${target}`,
);

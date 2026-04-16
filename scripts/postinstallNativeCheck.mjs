import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const CHECKSUM_FILENAME = "iroha_js_host.checksums.json";

export const resolveNativeBuildRequirement = (
  irohaPackagePath,
  platformKey = `${process.platform}-${process.arch}`,
) => {
  const nativeModulePath = join(
    irohaPackagePath,
    "native",
    NATIVE_MODULE_FILENAME,
  );
  const checksumManifestPath = join(
    irohaPackagePath,
    "native",
    CHECKSUM_FILENAME,
  );

  if (!existsSync(nativeModulePath)) {
    return {
      shouldBuild: true,
      reason: "missing native binary",
      nativeModulePath,
      checksumManifestPath,
    };
  }

  if (!existsSync(checksumManifestPath)) {
    return {
      shouldBuild: true,
      reason: "missing checksum manifest",
      nativeModulePath,
      checksumManifestPath,
    };
  }

  let checksumManifest;
  try {
    checksumManifest = JSON.parse(readFileSync(checksumManifestPath, "utf8"));
  } catch (error) {
    return {
      shouldBuild: true,
      reason: `unreadable checksum manifest: ${error instanceof Error ? error.message : String(error)}`,
      nativeModulePath,
      checksumManifestPath,
    };
  }

  const checksumEntries = checksumManifest?.entries ?? checksumManifest;
  const expectedSha256 = checksumEntries?.[platformKey]?.sha256;
  if (typeof expectedSha256 !== "string" || !expectedSha256.trim()) {
    return {
      shouldBuild: true,
      reason: `missing checksum entry for ${platformKey}`,
      nativeModulePath,
      checksumManifestPath,
    };
  }

  const actualSha256 = createHash("sha256")
    .update(readFileSync(nativeModulePath))
    .digest("hex");
  if (actualSha256 !== expectedSha256) {
    return {
      shouldBuild: true,
      reason: `checksum mismatch for ${platformKey}`,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
      actualSha256,
    };
  }

  return {
    shouldBuild: false,
    reason: "native binding is current",
    nativeModulePath,
    checksumManifestPath,
    expectedSha256,
    actualSha256,
  };
};

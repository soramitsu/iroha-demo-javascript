import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInstalledReleaseDependencies } from "./iroha-js-release-source.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDir, "..");

const REQUIRED_ROOT_EXPORTS = [
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "buildIvmProvedTransactionPayload",
  "signQuotedIvmProvedTransactionPayload",
  "noritoDecodeInstruction",
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
  "computeValidationFeePolicyProposalFingerprintV1",
  "computeValidationFeePayoutLifecycleProposalFingerprintV1",
];
const REQUIRED_SDK_MODULES = Object.freeze([
  ["@iroha/iroha-js/crypto", "crypto.js", "crypto.d.ts"],
  ["@iroha/iroha-js/address", "address.js", "address.d.ts"],
  [
    "@iroha/iroha-js/connect-browser",
    "connect.browser.js",
    "connect.browser.d.ts",
  ],
  ["@iroha/iroha-js/browser", "browser.js", "browser.d.ts"],
  [
    "@iroha/iroha-js/canonical-request",
    "canonicalRequest.js",
    "canonical-request.d.ts",
  ],
  [
    "@iroha/iroha-js/instruction-builders",
    "instructionBuilders.js",
    "instruction-builders.d.ts",
  ],
  ["@iroha/iroha-js/normalizers", "normalizers.js", "normalizers.d.ts"],
  [
    "@iroha/iroha-js/transaction-codec",
    "transactionCodec.js",
    "transaction-codec.d.ts",
  ],
  ["@iroha/iroha-js", "index.js", "index.d.ts"],
]);

const containsExports = (path, exports) => {
  if (!isCanonicalRegularFile(path)) return false;
  const source = readFileSync(path, "utf8");
  return exports.every(
    (name) =>
      source.includes(`export function ${name}`) ||
      source.includes(`export class ${name}`) ||
      source.includes(`export const ${name}`) ||
      source.includes(`${name},`),
  );
};

const isCanonicalRegularFile = (path) => {
  try {
    const metadata = lstatSync(path);
    return (
      metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      Number.isSafeInteger(metadata.size) &&
      metadata.size > 0 &&
      realpathSync.native(path) === path
    );
  } catch {
    return false;
  }
};

const requireCanonicalPhysicalDirectory = (path, label) => {
  const resolvedPath = resolve(path);
  let metadata;
  try {
    metadata = lstatSync(resolvedPath);
  } catch (error) {
    throw new Error(
      `${label} is unavailable at ${resolvedPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync.native(resolvedPath) !== resolvedPath
  ) {
    throw new Error(`${label} must be a canonical physical directory.`);
  }
  return resolvedPath;
};

export const hasCurrentIrohaSdkApi = (sdkRoot) =>
  containsExports(join(sdkRoot, "dist", "index.js"), REQUIRED_ROOT_EXPORTS) &&
  REQUIRED_SDK_MODULES.every(
    ([, runtimeFilename, declarationFilename]) =>
      isCanonicalRegularFile(join(sdkRoot, "dist", runtimeFilename)) &&
      isCanonicalRegularFile(join(sdkRoot, declarationFilename)),
  );

export const buildIrohaSdkAliases = (sdkRoot) => {
  const dist = resolve(sdkRoot, "dist");
  return REQUIRED_SDK_MODULES.map(([find, runtimeFilename]) => ({
    find,
    replacement: resolve(dist, runtimeFilename),
  }));
};

const activateSdkRoot = (projectRoot, sdkRoot) => {
  const activeRoot = join(
    projectRoot,
    "node_modules",
    ".cache",
    "iroha-sdk-compat",
    "active",
  );
  mkdirSync(dirname(activeRoot), { recursive: true });
  try {
    const activeMetadata = lstatSync(activeRoot);
    if (!activeMetadata.isSymbolicLink()) {
      throw new Error(
        `Refusing to replace non-symlink SDK activation path ${activeRoot}.`,
      );
    }
    rmSync(activeRoot);
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  symlinkSync(
    sdkRoot,
    activeRoot,
    process.platform === "win32" ? "junction" : "dir",
  );
  return sdkRoot;
};

export const resolveCompatibleIrohaSdkRoot = ({
  projectRoot = defaultProjectRoot,
  env = process.env,
  log = console.info,
} = {}) => {
  projectRoot = requireCanonicalPhysicalDirectory(
    projectRoot,
    "Wallet project root",
  );
  const releaseRoot = env.IROHA_ROOT;
  const configuredRoot = String(env.IROHA_JS_SDK_ROOT ?? "").trim();
  if (typeof releaseRoot === "string" && releaseRoot.length > 0) {
    if (configuredRoot) {
      throw new Error(
        "IROHA_JS_SDK_ROOT cannot override the reviewed IROHA_ROOT release source.",
      );
    }
    const marker = verifyInstalledReleaseDependencies(projectRoot, releaseRoot);
    const installedRoot = requireCanonicalPhysicalDirectory(
      resolve(projectRoot, "node_modules", "@iroha", "iroha-js"),
      "Reviewed installed @iroha/iroha-js SDK",
    );
    if (!hasCurrentIrohaSdkApi(installedRoot)) {
      throw new Error(
        `The reviewed installed @iroha/iroha-js API is unavailable at ${installedRoot}.`,
      );
    }
    log(
      `[iroha-sdk] using reviewed installed SDK ${marker.source_commit} at ${installedRoot}`,
    );
    return activateSdkRoot(projectRoot, installedRoot);
  }
  if (configuredRoot && !isAbsolute(configuredRoot)) {
    throw new Error(
      "IROHA_JS_SDK_ROOT must be an explicit absolute path so every build consumer selects the same SDK root.",
    );
  }
  const sdkRoot = requireCanonicalPhysicalDirectory(
    configuredRoot
      ? resolve(configuredRoot)
      : resolve(projectRoot, "../iroha/javascript/iroha_js"),
    "Current @iroha/iroha-js SDK",
  );
  if (!hasCurrentIrohaSdkApi(sdkRoot)) {
    throw new Error(
      `The current linked @iroha/iroha-js API is unavailable at ${sdkRoot}. ` +
        "Build the sibling SDK before running the wallet; pinned or cached historical SDK fallbacks are not permitted.",
    );
  }
  log(`[iroha-sdk] using current linked SDK at ${sdkRoot}`);
  return activateSdkRoot(projectRoot, sdkRoot);
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(resolveCompatibleIrohaSdkRoot());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

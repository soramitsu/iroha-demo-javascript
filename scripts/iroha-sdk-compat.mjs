import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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

const findSdkDistributionMismatch = (source, distribution, relative = "") => {
  let sourceEntries;
  let distributionEntries;
  try {
    const sourceMetadata = lstatSync(source);
    const distributionMetadata = lstatSync(distribution);
    if (
      !sourceMetadata.isDirectory() ||
      sourceMetadata.isSymbolicLink() ||
      !distributionMetadata.isDirectory() ||
      distributionMetadata.isSymbolicLink()
    ) {
      return relative || "src/dist directories";
    }
    sourceEntries = readdirSync(source).sort();
    distributionEntries = readdirSync(distribution).sort();
  } catch {
    return relative || "src/dist directories";
  }
  if (
    sourceEntries.length !== distributionEntries.length ||
    sourceEntries.some((entry, index) => entry !== distributionEntries[index])
  ) {
    return relative || "src/dist file inventory";
  }
  for (const entry of sourceEntries) {
    const childRelative = relative ? `${relative}/${entry}` : entry;
    const sourcePath = join(source, entry);
    const distributionPath = join(distribution, entry);
    try {
      const sourceMetadata = lstatSync(sourcePath);
      const distributionMetadata = lstatSync(distributionPath);
      if (sourceMetadata.isDirectory() && distributionMetadata.isDirectory()) {
        const mismatch = findSdkDistributionMismatch(
          sourcePath,
          distributionPath,
          childRelative,
        );
        if (mismatch) return mismatch;
      } else if (
        !sourceMetadata.isFile() ||
        sourceMetadata.isSymbolicLink() ||
        !distributionMetadata.isFile() ||
        distributionMetadata.isSymbolicLink() ||
        sourceMetadata.size !== distributionMetadata.size ||
        !readFileSync(sourcePath).equals(readFileSync(distributionPath))
      ) {
        return childRelative;
      }
    } catch {
      return childRelative;
    }
  }
  return null;
};

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

/**
 * Developer-local SDK pin: an `IROHA_JS_SDK_ROOT=` line in the git-ignored `.env.local`, so a
 * plain `npm run dev` selects the same SDK as an exported variable would. Never used for
 * reviewed release builds (IROHA_ROOT), and an exported variable always wins.
 */
export const readLocalIrohaSdkRoot = (projectRoot) => {
  let text;
  try {
    text = readFileSync(join(projectRoot, ".env.local"), "utf8");
  } catch {
    return "";
  }
  const line = text
    .split(/\r?\n/u)
    .find((entry) => /^\s*IROHA_JS_SDK_ROOT\s*=/u.test(entry));
  if (!line) return "";
  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(["'])(.*)\1$/u, "$2");
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
  const developmentRoot = configuredRoot || readLocalIrohaSdkRoot(projectRoot);
  if (developmentRoot && !isAbsolute(developmentRoot)) {
    throw new Error(
      "IROHA_JS_SDK_ROOT must be an explicit absolute path so every build consumer selects the same SDK root.",
    );
  }
  const sdkRoot = requireCanonicalPhysicalDirectory(
    developmentRoot
      ? resolve(developmentRoot)
      : resolve(projectRoot, "../iroha/javascript/iroha_js"),
    "Current @iroha/iroha-js SDK",
  );
  if (!hasCurrentIrohaSdkApi(sdkRoot)) {
    throw new Error(
      `The current linked @iroha/iroha-js API is unavailable at ${sdkRoot}. ` +
        "Build the sibling SDK before running the wallet; pinned or cached historical SDK fallbacks are not permitted.",
    );
  }
  const distributionMismatch = findSdkDistributionMismatch(
    join(sdkRoot, "src"),
    join(sdkRoot, "dist"),
  );
  if (distributionMismatch) {
    throw new Error(
      `The current linked @iroha/iroha-js dist at ${sdkRoot} does not match src (${distributionMismatch}). ` +
        "Run npm run build:dist in that SDK checkout before running the wallet.",
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

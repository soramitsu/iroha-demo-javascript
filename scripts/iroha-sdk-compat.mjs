import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDir, "..");

const REQUIRED_ROOT_EXPORTS = [
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "buildIvmProvedTransactionPayload",
  "signQuotedIvmProvedTransactionPayload",
  "noritoDecodeInstruction",
];

const containsExports = (path, exports) => {
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  return exports.every(
    (name) =>
      source.includes(`export function ${name}`) ||
      source.includes(`export class ${name}`) ||
      source.includes(`export const ${name}`) ||
      source.includes(`${name},`),
  );
};

export const hasCurrentIrohaSdkApi = (sdkRoot) =>
  containsExports(join(sdkRoot, "dist", "index.js"), REQUIRED_ROOT_EXPORTS) &&
  existsSync(join(sdkRoot, "index.d.ts"));

export const buildIrohaSdkAliases = (sdkRoot) => {
  const dist = resolve(sdkRoot, "dist");
  return [
    {
      find: "@iroha/iroha-js/crypto",
      replacement: resolve(dist, "crypto.js"),
    },
    {
      find: "@iroha/iroha-js/address",
      replacement: resolve(dist, "address.js"),
    },
    {
      find: "@iroha/iroha-js/connect-browser",
      replacement: resolve(dist, "connect.browser.js"),
    },
    {
      find: "@iroha/iroha-js",
      replacement: resolve(dist, "index.js"),
    },
  ];
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
  rmSync(activeRoot, { recursive: true, force: true });
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
  const configuredRoot = String(env.IROHA_JS_SDK_ROOT ?? "").trim();
  const sdkRoot = configuredRoot
    ? resolve(configuredRoot)
    : resolve(projectRoot, "../iroha/javascript/iroha_js");
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

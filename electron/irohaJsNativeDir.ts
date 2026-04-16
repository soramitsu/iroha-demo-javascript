import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const REQUIRED_NATIVE_EXPORTS = [
  "deriveConfidentialReceiveAddressV2",
  "buildConfidentialTransferProofV2",
  "buildConfidentialUnshieldProofV2",
  "buildConfidentialUnshieldProofV3",
] as const;

const trimString = (value: unknown): string => String(value ?? "").trim();
const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

type NativeModuleLike = Record<string, unknown>;
type FileExists = (path: string) => boolean;
type LoadNativeModule = (
  moduleUrl: string,
  nativeModulePath: string,
) => unknown;

const defaultLoadNativeModule: LoadNativeModule = (
  moduleUrl,
  nativeModulePath,
) => {
  const require = createRequire(moduleUrl);
  return require(nativeModulePath);
};

export const hasRequiredIrohaJsNativeExports = (
  nativeModule: unknown,
): nativeModule is NativeModuleLike => {
  if (typeof nativeModule !== "object" || nativeModule === null) {
    return false;
  }
  const typedNativeModule = nativeModule as NativeModuleLike;
  return REQUIRED_NATIVE_EXPORTS.every(
    (exportName) =>
      hasOwn(typedNativeModule, exportName) &&
      typeof typedNativeModule[exportName] === "function",
  );
};

const resolveNativeCandidates = (moduleUrl: string): string[] => {
  const baseDir = dirname(fileURLToPath(moduleUrl));
  return [
    resolve(
      baseDir,
      "..",
      "..",
      "node_modules",
      "@iroha",
      "iroha-js",
      "native",
    ),
    resolve(
      baseDir,
      "..",
      "..",
      "..",
      "node_modules",
      "@iroha",
      "iroha-js",
      "native",
    ),
    resolve(baseDir, "..", "native"),
  ];
};

const isCompatibleNativeDir = (
  moduleUrl: string,
  nativeDir: string,
  fileExists: FileExists,
  loadNativeModule: LoadNativeModule,
): boolean => {
  const nativeModulePath = join(nativeDir, NATIVE_MODULE_FILENAME);
  if (!fileExists(nativeModulePath)) {
    return false;
  }
  try {
    return hasRequiredIrohaJsNativeExports(
      loadNativeModule(moduleUrl, nativeModulePath),
    );
  } catch {
    return false;
  }
};

export const resolveIrohaJsNativeDir = (
  moduleUrl: string,
  fileExists: FileExists = existsSync,
  loadNativeModule: LoadNativeModule = defaultLoadNativeModule,
): string | null => {
  const candidates = resolveNativeCandidates(moduleUrl);
  let fallback: string | null = null;

  for (const candidate of candidates) {
    const nativeModulePath = join(candidate, NATIVE_MODULE_FILENAME);
    if (!fileExists(nativeModulePath)) {
      continue;
    }
    fallback ??= candidate;
    if (
      isCompatibleNativeDir(moduleUrl, candidate, fileExists, loadNativeModule)
    ) {
      return candidate;
    }
  }

  return fallback;
};

export const configureIrohaJsNativeDir = (
  moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string | null => {
  const existing = trimString(env.IROHA_JS_NATIVE_DIR);
  if (existing) {
    return existing;
  }
  const resolved = resolveIrohaJsNativeDir(moduleUrl, fileExists);
  if (resolved) {
    env.IROHA_JS_NATIVE_DIR = resolved;
  }
  return resolved;
};

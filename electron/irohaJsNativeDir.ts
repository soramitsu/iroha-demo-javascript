import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";

const trimString = (value: unknown): string => String(value ?? "").trim();

export const resolveIrohaJsNativeDir = (
  moduleUrl: string,
  fileExists: (path: string) => boolean = existsSync,
): string | null => {
  const baseDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    resolve(baseDir, "..", "native"),
    resolve(baseDir, "..", "..", "node_modules", "@iroha", "iroha-js", "native"),
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
  ];

  for (const candidate of candidates) {
    if (fileExists(join(candidate, NATIVE_MODULE_FILENAME))) {
      return candidate;
    }
  }

  return null;
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

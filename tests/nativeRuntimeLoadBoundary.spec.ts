import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const PROJECT_ROOT = process.cwd();
const RUNTIME_ROOTS = ["electron", "src"] as const;
const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
]);
const CENTRAL_NATIVE_LOADERS = new Set([
  "electron/irohaJsNativeDir.ts",
  "electron/irohaJsNativeProvenance.ts",
]);
const NATIVE_ADDON_LITERAL_PATTERN =
  /(["'`])(?:[^"'`\r\n]*[\\/]|[A-Za-z0-9_-]+)\.node\1/u;

const NATIVE_LOAD_MARKERS = [
  ["createRequire", /\bcreateRequire\b/u],
  ["process.dlopen", /\bprocess\.dlopen\b/u],
  ["native addon path", NATIVE_ADDON_LITERAL_PATTERN],
  ["Iroha native addon", /\biroha_js_host(?:\.node)?\b/u],
  ["bindings loader", /\bbindings\s*\(/u],
  ["node-gyp-build loader", /\bnode-gyp-build\b/u],
] as const;

const portableRelativePath = (path: string): string =>
  relative(PROJECT_ROOT, path).split(sep).join("/");

const nativeAddonLiteralSource = (path: string, source: string): string => {
  if (extname(path) !== ".vue") return source;
  return Array.from(
    source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu),
    (match) => match[1] ?? "",
  ).join("\n");
};

const runtimeSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent): string[] => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return runtimeSourceFiles(path);
      if (
        !entry.isFile() ||
        !RUNTIME_SOURCE_EXTENSIONS.has(extname(entry.name))
      ) {
        return [];
      }
      return [path];
    },
  );

describe("native runtime load boundary", () => {
  it("centralizes production native-addon loading in the reviewed loader", () => {
    const violations = RUNTIME_ROOTS.flatMap((root) =>
      runtimeSourceFiles(resolve(PROJECT_ROOT, root)),
    )
      .sort()
      .flatMap((path) => {
        const relativePath = portableRelativePath(path);
        if (CENTRAL_NATIVE_LOADERS.has(relativePath)) return [];
        const source = readFileSync(path, "utf8");
        return NATIVE_LOAD_MARKERS.filter(([label, pattern]) =>
          pattern.test(
            label === "native addon path"
              ? nativeAddonLiteralSource(path, source)
              : source,
          ),
        ).map(([label]) => `${relativePath}: ${label}`);
      });

    expect(
      violations,
      "Production runtime code must obtain native bindings through electron/irohaJsNativeDir.ts and its provenance verifier.",
    ).toEqual([]);
  });

  it("does not load an Iroha addon while accountAddress is imported", () => {
    const accountAddress = readFileSync(
      resolve(PROJECT_ROOT, "electron/accountAddress.ts"),
      "utf8",
    );

    expect(accountAddress).not.toMatch(/\bcreateRequire\b/u);
    expect(accountAddress).not.toMatch(/\biroha_js_host(?:\.node)?\b/u);
    expect(accountAddress).not.toMatch(NATIVE_ADDON_LITERAL_PATTERN);
  });

  it("installs the reviewed binding before main and preload runtime work", () => {
    const main = readFileSync(
      resolve(PROJECT_ROOT, "electron/main.ts"),
      "utf8",
    );
    const preload = readFileSync(
      resolve(PROJECT_ROOT, "electron/preload.ts"),
      "utf8",
    );
    const installCall = "\ninstallGlobalIrohaJsNativeBinding(import.meta.url);";

    expect(main.indexOf(installCall)).toBeGreaterThanOrEqual(0);
    expect(main.indexOf(installCall)).toBeLessThan(
      main.indexOf("const vpnRuntime = new VpnRuntime"),
    );
    expect(preload.indexOf(installCall)).toBeGreaterThanOrEqual(0);
    expect(preload.indexOf(installCall)).toBeLessThan(
      preload.indexOf('contextBridge.exposeInMainWorld("iroha", api)'),
    );
  });
});

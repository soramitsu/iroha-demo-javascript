import { existsSync, readFileSync, realpathSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hasCurrentIrohaSdkApi } from "./iroha-sdk-compat.mjs";

export const SELECTED_IROHA_JS_SDK_ROOT_ENV = "IROHA_JS_NODE_SELECTED_SDK_ROOT";

const selectedRootInput = String(
  process.env[SELECTED_IROHA_JS_SDK_ROOT_ENV] ?? "",
).trim();
if (!selectedRootInput) {
  throw new Error(
    `${SELECTED_IROHA_JS_SDK_ROOT_ENV} must name the exact selected @iroha/iroha-js SDK root.`,
  );
}

const selectedRoot = realpathSync(selectedRootInput);
if (!hasCurrentIrohaSdkApi(selectedRoot)) {
  throw new Error(
    "The exact selected @iroha/iroha-js SDK root does not expose the required current API.",
  );
}

const packageJsonPath = path.join(selectedRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageExports = packageJson.exports;
if (
  !packageExports ||
  typeof packageExports !== "object" ||
  Array.isArray(packageExports)
) {
  throw new Error(
    "The exact selected @iroha/iroha-js SDK package export map is unavailable.",
  );
}

const importTarget = (entry) => {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return typeof entry.import === "string"
    ? entry.import
    : typeof entry.default === "string"
      ? entry.default
      : null;
};

const selectedPrefix = `${selectedRoot}${path.sep}`;
const selectedExports = Object.entries(packageExports).map(
  ([subpath, entry]) => {
    const target = importTarget(entry);
    if (!target || !target.startsWith("./")) {
      throw new Error(
        `The exact selected @iroha/iroha-js export ${subpath} has no local import target.`,
      );
    }
    const unresolvedTargetPath = path.resolve(selectedRoot, target);
    if (
      !unresolvedTargetPath.startsWith(selectedPrefix) ||
      !existsSync(unresolvedTargetPath)
    ) {
      throw new Error(
        `The exact selected @iroha/iroha-js export ${subpath} is unavailable.`,
      );
    }
    const targetPath = realpathSync(unresolvedTargetPath);
    if (!targetPath.startsWith(selectedPrefix)) {
      throw new Error(
        `The exact selected @iroha/iroha-js export ${subpath} escapes its selected root.`,
      );
    }
    const specifier =
      subpath === "."
        ? "@iroha/iroha-js"
        : `@iroha/iroha-js/${subpath.slice(2)}`;
    return [specifier, targetPath];
  },
);

if (typeof nodeModule.registerHooks === "function") {
  const exportMap = new Map(selectedExports);
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const selectedPath = exportMap.get(specifier);
      if (!selectedPath) return nextResolve(specifier, context);
      return {
        shortCircuit: true,
        url: pathToFileURL(selectedPath).href,
      };
    },
  });
} else {
  nodeModule.register(new URL("./iroha-sdk-node-loader.mjs", import.meta.url), {
    parentURL: import.meta.url,
    data: { exports: selectedExports },
  });
}

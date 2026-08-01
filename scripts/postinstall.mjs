import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveNativeBuildRequirement,
  resolveNativeProvenanceRequirement,
} from "./postinstallNativeCheck.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(ROOT);
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? "cmd.exe"
    : "npm";
const npmBuildNativeArgs = npmExecPath
  ? [npmExecPath, "run", "build:native"]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run build:native"]
    : ["run", "build:native"];
const irohaPackagePath = join(
  projectRoot,
  "node_modules",
  "@iroha",
  "iroha-js",
);
const nativeProvenanceRequirement = resolveNativeProvenanceRequirement(
  process.env,
);
const inspectNativeBinding = () =>
  resolveNativeBuildRequirement(
    irohaPackagePath,
    undefined,
    undefined,
    nativeProvenanceRequirement,
  );

if (!existsSync(irohaPackagePath)) {
  console.warn(
    "[postinstall] @iroha/iroha-js is not installed yet. Skipping native build check.",
  );
  process.exit(0);
}

const requirement = inspectNativeBinding();

if (!requirement.shouldBuild) {
  process.exit(0);
}

if (nativeProvenanceRequirement !== null) {
  console.error(
    `[postinstall] Refusing to rebuild a release native binding from the installed package (${requirement.reason}). Build the reviewed sibling source and stage its verified native pair first.`,
  );
  process.exit(1);
}

console.log(
  `[postinstall] Building @iroha/iroha-js native bindings (${requirement.reason})...`,
);
const result = spawnSync(npmCommand, npmBuildNativeArgs, {
  cwd: irohaPackagePath,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  if (result.error) {
    console.error(
      `[postinstall] Unable to launch ${npmCommand}: ${result.error.message}`,
    );
  }
  console.error("[postinstall] Failed to build iroha_js_host.");
  process.exit(result.status ?? 1);
}

const refreshedRequirement = inspectNativeBinding();
if (refreshedRequirement.shouldBuild) {
  console.error(
    `[postinstall] Built iroha_js_host failed native verification: ${refreshedRequirement.reason}.`,
  );
  process.exit(1);
}

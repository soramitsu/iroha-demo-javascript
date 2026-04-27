import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveNativeBuildRequirement } from "./postinstallNativeCheck.mjs";

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

if (!existsSync(irohaPackagePath)) {
  console.warn(
    "[postinstall] @iroha/iroha-js is not installed yet. Skipping native build check.",
  );
  process.exit(0);
}

const requirement = resolveNativeBuildRequirement(irohaPackagePath);

if (!requirement.shouldBuild) {
  process.exit(0);
}

console.log(
  `[postinstall] Building @iroha/iroha-js native bindings (${requirement.reason})...`,
);
const result = spawnSync(npmCommand, npmBuildNativeArgs, {
  cwd: irohaPackagePath,
  stdio: "inherit",
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

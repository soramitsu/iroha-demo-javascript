import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveNativeBuildRequirement } from "./postinstallNativeCheck.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(ROOT);
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
const result = spawnSync("npm", ["run", "build:native"], {
  cwd: irohaPackagePath,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("[postinstall] Failed to build iroha_js_host.");
  process.exit(result.status ?? 1);
}

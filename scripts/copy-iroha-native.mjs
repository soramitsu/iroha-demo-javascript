#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNativeBuildRequirement } from "./postinstallNativeCheck.mjs";

const projectRoot = process.cwd();
const sdkEntry = fileURLToPath(import.meta.resolve("@iroha/iroha-js"));
const sdkRoot = dirname(dirname(sdkEntry));
const source = join(sdkRoot, "native");
const target = join(projectRoot, "dist", "native");
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

const requirement = resolveNativeBuildRequirement(sdkRoot);

if (requirement.shouldBuild) {
  console.log(
    `Building @iroha/iroha-js native bindings before copy (${requirement.reason})...`,
  );
  const result = spawnSync(npmCommand, npmBuildNativeArgs, {
    cwd: sdkRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    if (result.error) {
      console.error(
        `Unable to launch ${npmCommand} for @iroha/iroha-js native build: ${result.error.message}`,
      );
    }
    const refreshedRequirement = resolveNativeBuildRequirement(sdkRoot);
    if (refreshedRequirement.shouldBuild) {
      throw new Error(
        `Failed to build @iroha/iroha-js native bindings before copy (status ${result.status ?? "unknown"}).`,
      );
    }
    console.warn(
      `@iroha/iroha-js native build exited with status ${result.status ?? "unknown"}, but the native bundle is current now; continuing with copy.`,
    );
  }
}

if (!existsSync(source)) {
  throw new Error(`@iroha/iroha-js native directory is missing at ${source}`);
}

mkdirSync(dirname(target), { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied @iroha/iroha-js native binding to ${target}`);

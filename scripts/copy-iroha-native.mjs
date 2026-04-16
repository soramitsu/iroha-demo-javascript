#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const sdkEntry = fileURLToPath(import.meta.resolve("@iroha/iroha-js"));
const sdkRoot = dirname(dirname(sdkEntry));
const source = join(sdkRoot, "native");
const target = join(projectRoot, "dist", "native");

if (!existsSync(source)) {
  throw new Error(`@iroha/iroha-js native directory is missing at ${source}`);
}

mkdirSync(dirname(target), { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied @iroha/iroha-js native binding to ${target}`);

#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installReleaseDependencies } from "./iroha-js-release-source.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const marker = installReleaseDependencies(repoRoot, process.env.IROHA_ROOT);
process.stdout.write(
  `Installed reviewed Iroha JS SDK ${marker.source_commit} (${marker.installed_package_sha256}).\n`,
);

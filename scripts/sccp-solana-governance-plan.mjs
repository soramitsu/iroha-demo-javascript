#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseStrictCliArgs,
  readStableRegularFile,
  writeAtomicJsonFile,
} from "./e2e/sccp-solana-report-io.mjs";
import {
  buildSolanaRouteGovernancePlan,
  validateSolanaRouteGovernancePlan,
} from "./e2e/sccp-solana-exact-registry.mjs";
import {
  solanaOrderedProgramArtifactSha256,
  validateSolanaOrderedInitializationEvidence,
} from "./e2e/sccp-solana-ordered-initialization.mjs";
import { parseSolanaGovernanceCanonicalJsonBytes } from "./e2e/sccp-solana-governance-json.mjs";

const HASH32 = /^0x[0-9a-f]{64}$/u;

const usage = `Usage:
  node scripts/sccp-solana-governance-plan.mjs \\
    --route <reviewed-governed-route.json> \\
    --expected-route-sha256 0x... \\
    --native-trust-anchor <reviewed-solana-anchor.json> \\
    --expected-native-trust-anchor-sha256 0x... \\
    --ordered-initialization-evidence <reviewed-ordered-init.json> \\
    --expected-ordered-initialization-evidence-sha256 0x... \\
    --out <reviewed-governance-plan.json>

The output contains two separate actions: staged registration and a
compare-and-swap staged-to-bidirectional activation. Input hashes pin the exact
reviewed file bytes. This command never reads signing credentials.
`;

export const parseSolanaGovernancePlanArgs = (argv) =>
  parseStrictCliArgs(argv, {
    booleanFlags: ["help"],
    valueFlags: [
      "route",
      "expected-route-sha256",
      "native-trust-anchor",
      "expected-native-trust-anchor-sha256",
      "ordered-initialization-evidence",
      "expected-ordered-initialization-evidence-sha256",
      "out",
    ],
  });

const required = (options, key) => {
  const value = String(options[key] ?? "").trim();
  if (!value) throw new TypeError(`--${key} is required.`);
  return value;
};

const expectedHash = (value, label) => {
  const hash = String(value ?? "").trim();
  if (!HASH32.test(hash) || /^0x0{64}$/u.test(hash)) {
    throw new TypeError(`${label} must be a nonzero lowercase SHA-256 hash.`);
  }
  return hash;
};

const sha256 = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const readPinnedJson = async (file, expected, label) => {
  const bytes = await readStableRegularFile(file, { label });
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new TypeError(
      `${label} SHA-256 does not match its independent review pin.`,
    );
  }
  return {
    value: parseSolanaGovernanceCanonicalJsonBytes(bytes, label),
    sha256: actual,
  };
};

const assertDistinctOutput = async (output, inputs) => {
  const resolvedOutput = path.resolve(output);
  const resolvedInputs = inputs.map((input) => path.resolve(input));
  if (resolvedInputs.includes(resolvedOutput)) {
    throw new TypeError("Governance plan output must differ from every input.");
  }
  let outputStat = null;
  try {
    outputStat = await lstat(resolvedOutput);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (outputStat) {
    for (const input of resolvedInputs) {
      const inputStat = await lstat(input);
      if (
        inputStat.dev === outputStat.dev &&
        inputStat.ino === outputStat.ino
      ) {
        throw new TypeError(
          "Governance plan output must not alias an input inode.",
        );
      }
    }
  }
  return resolvedOutput;
};

const assertExactSolanaAnchor = (anchor) => {
  if (
    anchor?.backend?.backend !== "solana_agave_v1" ||
    anchor.backend.protocol !== null ||
    typeof anchor.anchor_hash !== "string" ||
    !/^[0-9A-F]{64}$/u.test(anchor.anchor_hash) ||
    !Number.isSafeInteger(anchor.checkpoint_height) ||
    anchor.checkpoint_height <= 0
  ) {
    throw new TypeError(
      "Native trust anchor must be the exact nonzero solana_agave_v1 anchor.",
    );
  }
};

export async function buildPinnedSolanaGovernancePlan(options) {
  const routePath = required(options, "route");
  const anchorPath = required(options, "native-trust-anchor");
  const orderedInitializationPath = required(
    options,
    "ordered-initialization-evidence",
  );
  const outputPath = await assertDistinctOutput(required(options, "out"), [
    routePath,
    anchorPath,
    orderedInitializationPath,
  ]);
  const routePin = expectedHash(
    required(options, "expected-route-sha256"),
    "--expected-route-sha256",
  );
  const anchorPin = expectedHash(
    required(options, "expected-native-trust-anchor-sha256"),
    "--expected-native-trust-anchor-sha256",
  );
  const orderedInitializationPin = expectedHash(
    required(options, "expected-ordered-initialization-evidence-sha256"),
    "--expected-ordered-initialization-evidence-sha256",
  );
  const [routeArtifact, anchorArtifact, orderedInitializationArtifact] =
    await Promise.all([
      readPinnedJson(routePath, routePin, "Reviewed Solana governed route"),
      readPinnedJson(
        anchorPath,
        anchorPin,
        "Reviewed Solana native trust anchor",
      ),
      readPinnedJson(
        orderedInitializationPath,
        orderedInitializationPin,
        "Reviewed Solana ordered-initialization evidence",
      ),
    ]);
  assertExactSolanaAnchor(anchorArtifact.value);
  const orderedInitialization = validateSolanaOrderedInitializationEvidence(
    orderedInitializationArtifact.value,
  );
  const plan = buildSolanaRouteGovernancePlan({
    route: routeArtifact.value,
    nativeTrustAnchor: anchorArtifact.value,
    orderedInitializationEvidenceSha256: orderedInitializationArtifact.sha256,
    freshDeployReportSha256: orderedInitialization.freshDeployReportSha256,
    programArtifactSha256: solanaOrderedProgramArtifactSha256(
      orderedInitialization,
    ),
  });
  validateSolanaRouteGovernancePlan(plan);
  await writeAtomicJsonFile(outputPath, plan);
  return Object.freeze({
    plan,
    planPath: outputPath,
    planSha256: plan.plan_sha256,
    routeArtifactSha256: routeArtifact.sha256,
    nativeTrustAnchorArtifactSha256: anchorArtifact.sha256,
    orderedInitializationEvidenceArtifactSha256:
      orderedInitializationArtifact.sha256,
    freshDeployReportSha256: orderedInitialization.freshDeployReportSha256,
  });
}

async function main() {
  const options = parseSolanaGovernancePlanArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const result = await buildPinnedSolanaGovernancePlan(options);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

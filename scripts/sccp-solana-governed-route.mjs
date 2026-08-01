#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  SOLANA_SCCP_ASSET_KEY,
  SOLANA_SCCP_REVISION,
  SOLANA_SCCP_ROUTE_ID,
  SOLANA_SCCP_SOURCE_NETWORK,
  SOLANA_SCCP_TARGET_NETWORK,
  summarizeExactSolanaRegistryRoute,
} from "./e2e/sccp-solana-exact-registry.mjs";
import { parseSolanaGovernanceCanonicalJsonBytes } from "./e2e/sccp-solana-governance-json.mjs";
import {
  checkSolanaOrderedInitializationAgainstRegistry,
  validateSolanaOrderedInitializationEvidence,
} from "./e2e/sccp-solana-ordered-initialization.mjs";
import {
  parseStrictCliArgs,
  readStableRegularFile,
  writeAtomicJsonFile,
} from "./e2e/sccp-solana-report-io.mjs";
import {
  assertSolanaExactFreshDeployReportBinding,
  parseSolanaExactCanonicalJsonBytes,
  validateSolanaExactInitializerInput,
} from "./sccp-solana-exact-initialize.mjs";
import { validateSolanaLoaderV3FreshDeployReport } from "./solana-loader-v3-fresh-deploy.mjs";

export const SOLANA_GOVERNED_ROUTE_POLICY_SETTLEMENT_SCHEMA =
  "iroha-sccp-solana-route-policy-settlement/v1";
export const SOLANA_GOVERNED_ROUTE_SETTLEMENT_ASSET_DEFINITION_ID =
  "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
export const SOLANA_GOVERNED_ROUTE_SETTLEMENT_SCALE = 9;
export const SOLANA_GOVERNED_ROUTE_TAIRA_NETWORK_PREFIX = 369;
export const SOLANA_GOVERNED_ROUTE_SORA_OUTBOUND_SEMANTICS =
  "ivm_proved_record_sccp_message_v1";

export const SOLANA_GOVERNED_ROUTE_USAGE = `Usage:
  node scripts/sccp-solana-governed-route.mjs \\
    --initializer-input <reviewed-exact-initializer-input.json> \\
    --expected-initializer-input-sha256 0x... \\
    --fresh-deploy-report <reviewed-fresh-deploy-report.json> \\
    --expected-fresh-deploy-report-sha256 0x... \\
    --ordered-initialization-evidence <reviewed-ordered-init.json> \\
    --expected-ordered-initialization-evidence-sha256 0x... \\
    --taira-policy-settlement <reviewed-taira-policy-settlement.json> \\
    --expected-taira-policy-settlement-sha256 0x... \\
    --out <reviewed-governed-route.json>

Deterministically derives the exact bidirectional taira_sol_xor revision-1
governed route. Solana programs, ProgramData slots, mint, route-state PDAs,
hashes, and source identity come only from the mutually bound deployment and
initialization evidence. This command never reads signing credentials.
`;

const HASH32 = /^0x[0-9a-f]{64}$/u;
const UPPER_HASH32 = /^[0-9A-F]{64}$/u;
const PORTABLE_REFERENCE = /^[a-z0-9](?:[a-z0-9_/:.-]*[a-z0-9])?$/u;
const PORTABLE_REFERENCE_FORBIDDEN = [
  "..",
  "//",
  ":::",
  "/:",
  ":/",
  "/.",
  "./",
  ":.",
  ".:",
];
// Registry normalization correctly requires a trust anchor for bidirectional
// routes. This local-only sentinel lets the route shape pass that invariant;
// it is never emitted and governance-plan binds the independently reviewed
// real anchor before constructing registration or activation actions.
const VALIDATION_ONLY_TRUST_ANCHOR = Object.freeze({
  backend: Object.freeze({ backend: "solana_agave_v1", protocol: null }),
  anchor_hash: "A".repeat(64),
  checkpoint_height: 1,
});

const sha256 = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactRecord = (value, expectedKeys, label) => {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains an unknown or missing field.`);
  }
  return value;
};

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const upperHash32 = (value, label) => {
  if (
    typeof value !== "string" ||
    !UPPER_HASH32.test(value) ||
    /^0{64}$/u.test(value)
  ) {
    throw new TypeError(`${label} must be nonzero uppercase 32-byte hex.`);
  }
  return value;
};

const portableReference = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    value !== value.trim() ||
    !PORTABLE_REFERENCE.test(value) ||
    PORTABLE_REFERENCE_FORBIDDEN.some((part) => value.includes(part))
  ) {
    throw new TypeError(`${label} is not a portable governed reference.`);
  }
  return value;
};

const canonicalTairaCustodyAccount = (value) => {
  const literal = typeof value === "string" ? value : "";
  let canonical;
  try {
    canonical = AccountAddress.fromAccountId(
      literal,
      SOLANA_GOVERNED_ROUTE_TAIRA_NETWORK_PREFIX,
    ).toI105(SOLANA_GOVERNED_ROUTE_TAIRA_NETWORK_PREFIX);
  } catch {
    throw new TypeError(
      "Settlement custody account must be a canonical TAIRA I105 account.",
    );
  }
  if (canonical !== literal || !canonical.startsWith("testu")) {
    throw new TypeError(
      "Settlement custody account must be a canonical TAIRA I105 account.",
    );
  }
  return canonical;
};

/** Validate the only hand-reviewed, TAIRA-local input to route derivation. */
export const validateSolanaGovernedRoutePolicySettlement = (value) => {
  const artifact = exactRecord(
    value,
    ["schema", "settlement", "sora_outbound_execution_policy"],
    "Solana governed-route TAIRA policy/settlement artifact",
  );
  if (
    artifact.schema !== SOLANA_GOVERNED_ROUTE_POLICY_SETTLEMENT_SCHEMA ||
    containsSecretField(artifact)
  ) {
    throw new TypeError(
      "Solana governed-route TAIRA policy/settlement artifact is not exact public revision-1 material.",
    );
  }
  const settlement = exactRecord(
    artifact.settlement,
    ["asset_definition_id", "custody_account_id", "payload_amount_scale"],
    "Solana governed-route settlement",
  );
  if (
    settlement.asset_definition_id !==
      SOLANA_GOVERNED_ROUTE_SETTLEMENT_ASSET_DEFINITION_ID ||
    settlement.payload_amount_scale !== SOLANA_GOVERNED_ROUTE_SETTLEMENT_SCALE
  ) {
    throw new TypeError(
      "Solana governed-route settlement must use the exact canonical XOR asset and nine-decimal scale.",
    );
  }
  const custodyAccountId = canonicalTairaCustodyAccount(
    settlement.custody_account_id,
  );
  const policy = exactRecord(
    artifact.sora_outbound_execution_policy,
    ["version", "semantics", "contract_artifact_sha256", "vk_ref", "gas_limit"],
    "Solana governed-route SORA outbound execution policy",
  );
  if (
    policy.version !== 1 ||
    policy.semantics !== SOLANA_GOVERNED_ROUTE_SORA_OUTBOUND_SEMANTICS ||
    !Number.isSafeInteger(policy.gas_limit) ||
    policy.gas_limit < 1 ||
    policy.gas_limit > 1_000_000_000
  ) {
    throw new TypeError(
      "Solana governed-route SORA outbound execution policy is not exact revision 1 material.",
    );
  }
  const contractArtifactSha256 = upperHash32(
    policy.contract_artifact_sha256,
    "SORA outbound contract artifact SHA-256",
  );
  const vkRef = exactRecord(
    policy.vk_ref,
    ["backend", "name", "version", "commitment"],
    "Solana governed-route SORA outbound VK reference",
  );
  if (
    !Number.isSafeInteger(vkRef.version) ||
    vkRef.version < 1 ||
    vkRef.version > 0xffffffff
  ) {
    throw new TypeError(
      "SORA outbound VK reference version must be a positive u32.",
    );
  }
  portableReference(vkRef.backend, "SORA outbound VK backend");
  portableReference(vkRef.name, "SORA outbound VK name");
  const vkCommitment = upperHash32(
    vkRef.commitment,
    "SORA outbound VK commitment",
  );
  if (vkCommitment === contractArtifactSha256) {
    throw new TypeError(
      "SORA outbound VK commitment must not alias the contract artifact SHA-256.",
    );
  }
  return Object.freeze({
    artifact,
    settlement: Object.freeze({
      asset_definition_id: SOLANA_GOVERNED_ROUTE_SETTLEMENT_ASSET_DEFINITION_ID,
      custody_account_id: custodyAccountId,
      payload_amount_scale: SOLANA_GOVERNED_ROUTE_SETTLEMENT_SCALE,
    }),
    soraOutboundExecutionPolicy: Object.freeze({
      version: 1,
      semantics: SOLANA_GOVERNED_ROUTE_SORA_OUTBOUND_SEMANTICS,
      contract_artifact_sha256: contractArtifactSha256,
      vk_ref: Object.freeze({
        backend: vkRef.backend,
        name: vkRef.name,
        version: vkRef.version,
        commitment: vkCommitment,
      }),
      gas_limit: policy.gas_limit,
    }),
  });
};

const exactLane = () => ({
  source: { network: SOLANA_SCCP_SOURCE_NETWORK, profile: null },
  target: { network: SOLANA_SCCP_TARGET_NETWORK, profile: null },
});

const registryForRoute = (route) => ({
  version: 1,
  lanes: [
    {
      lane_id: structuredClone(route.lane_id),
      native_trust_anchors: [structuredClone(VALIDATION_ONLY_TRUST_ANCHOR)],
      current_native_trust_anchor_hash:
        VALIDATION_ONLY_TRUST_ANCHOR.anchor_hash,
      routes: [structuredClone(route)],
    },
  ],
});

/**
 * Build the route without accepting any Solana identity as a free parameter.
 * `normalizedInitializer` must be the result of the exact initializer validator.
 */
export const buildExactSolanaGovernedRouteCandidate = ({
  normalizedInitializer,
  policySettlement,
}) => {
  if (!isRecord(normalizedInitializer)) {
    throw new TypeError("Validated exact Solana initializer is required.");
  }
  const reviewedPolicy =
    validateSolanaGovernedRoutePolicySettlement(policySettlement);
  const laneId = exactLane();
  const route = {
    lane_id: laneId,
    route_id: SOLANA_SCCP_ROUTE_ID,
    asset_key: SOLANA_SCCP_ASSET_KEY,
    revision: SOLANA_SCCP_REVISION,
    activation: { activation: "bidirectional", direction: null },
    inbound_finality_cutoff: null,
    source_identity: structuredClone(normalizedInitializer.sourceIdentity),
    destination: {
      family: "solana",
      deployment: structuredClone(
        normalizedInitializer.governedDestinationDeployment,
      ),
    },
    sora_outbound_execution_policy: structuredClone(
      reviewedPolicy.soraOutboundExecutionPolicy,
    ),
    settlement: structuredClone(reviewedPolicy.settlement),
  };
  const summary = summarizeExactSolanaRegistryRoute(registryForRoute(route), {
    requireBidirectional: true,
  });
  if (
    summary.routeId !== SOLANA_SCCP_ROUTE_ID ||
    summary.assetKey !== SOLANA_SCCP_ASSET_KEY ||
    summary.revision !== SOLANA_SCCP_REVISION ||
    summary.settlementAssetDefinitionId !==
      SOLANA_GOVERNED_ROUTE_SETTLEMENT_ASSET_DEFINITION_ID ||
    summary.custodyAccountId !== reviewedPolicy.settlement.custody_account_id ||
    summary.payloadAmountScale !== SOLANA_GOVERNED_ROUTE_SETTLEMENT_SCALE
  ) {
    throw new TypeError(
      "Derived Solana governed route differs from the exact revision-1 settlement identity.",
    );
  }
  return Object.freeze({ route: Object.freeze(route), summary });
};

const initializerFinalizationFields = Object.freeze({
  programAddress: "program_address",
  programdataAddress: "programdata_address",
  artifactSha256: "artifact_sha256",
  programCodeHash: "program_code_hash",
  programdataDeploymentSlot: "programdata_deployment_slot",
  transactionSignature: "transaction_signature",
  finalizedSlot: "finalized_slot",
});

/** Recheck every cross-artifact identity before publishing route bytes. */
export const assertSolanaGovernedRouteEvidenceBindings = ({
  normalizedInitializer,
  freshDeployReport,
  normalizedOrderedInitialization,
  routeSummary,
}) => {
  assertSolanaExactFreshDeployReportBinding({
    normalized: normalizedInitializer,
    freshDeployReport,
  });
  if (
    normalizedOrderedInitialization.freshDeployReportSha256 !==
    normalizedInitializer.freshDeployReportSha256
  ) {
    throw new TypeError(
      "Ordered initialization pins a different canonical fresh-deploy report.",
    );
  }
  for (const role of ["destination", "source", "native_verifier"]) {
    const initializer = normalizedInitializer.programFinalizations[role];
    const ordered = normalizedOrderedInitialization.programFinalizations[role];
    for (const [orderedField, initializerField] of Object.entries(
      initializerFinalizationFields,
    )) {
      if (ordered[orderedField] !== initializer[initializerField]) {
        throw new TypeError(
          `${role} ordered finalization ${orderedField} differs from the exact initializer input.`,
        );
      }
    }
  }
  if (
    routeSummary.destinationBindingHash !==
      normalizedInitializer.hashes.destinationBindingHash ||
    routeSummary.routeConfigurationHash !==
      normalizedInitializer.hashes.routeConfigurationHash ||
    routeSummary.sourceEmitterIdentityHash !==
      normalizedInitializer.sourceIdentityHashes.source_emitter_identity_hash ||
    routeSummary.sourceIdentityHash !==
      normalizedInitializer.sourceIdentityHashes.source_identity_hash
  ) {
    throw new TypeError(
      "Derived governed-route hashes differ from the exact initializer derivation.",
    );
  }
  checkSolanaOrderedInitializationAgainstRegistry(
    normalizedOrderedInitialization,
    routeSummary,
  );
  return Object.freeze({
    ready: true,
    freshDeployReportSha256: normalizedInitializer.freshDeployReportSha256,
    maxFinalizationSlot: normalizedOrderedInitialization.maxFinalizationSlot,
    firstInitializationSlot:
      normalizedOrderedInitialization.firstInitializationSlot,
  });
};

export const parseSolanaGovernedRouteArgs = (argv) =>
  parseStrictCliArgs(argv, {
    booleanFlags: ["help"],
    valueFlags: [
      "initializer-input",
      "expected-initializer-input-sha256",
      "fresh-deploy-report",
      "expected-fresh-deploy-report-sha256",
      "ordered-initialization-evidence",
      "expected-ordered-initialization-evidence-sha256",
      "taira-policy-settlement",
      "expected-taira-policy-settlement-sha256",
      "out",
    ],
  });

const required = (options, key) => {
  const value = String(options?.[key] ?? "").trim();
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

const readPinnedBytes = async (file, expected, label) => {
  const bytes = await readStableRegularFile(file, { label });
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new TypeError(
      `${label} SHA-256 does not match its independent review pin.`,
    );
  }
  return Object.freeze({ bytes, sha256: actual });
};

const assertDistinctArtifactPaths = async (output, inputs) => {
  const resolvedOutput = path.resolve(output);
  const resolvedInputs = inputs.map((input) => path.resolve(input));
  const allPaths = [...resolvedInputs, resolvedOutput];
  if (new Set(allPaths).size !== allPaths.length) {
    throw new TypeError(
      "Solana governed-route inputs and output must use distinct paths.",
    );
  }
  const inputStats = await Promise.all(
    resolvedInputs.map((input) => lstat(input)),
  );
  for (let left = 0; left < inputStats.length; left += 1) {
    for (let right = left + 1; right < inputStats.length; right += 1) {
      if (
        inputStats[left].dev === inputStats[right].dev &&
        inputStats[left].ino === inputStats[right].ino
      ) {
        throw new TypeError(
          "Solana governed-route inputs must not alias the same inode.",
        );
      }
    }
  }
  let outputStat = null;
  try {
    outputStat = await lstat(resolvedOutput);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (
    outputStat &&
    inputStats.some(
      (inputStat) =>
        inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino,
    )
  ) {
    throw new TypeError(
      "Solana governed-route output must not alias an input inode.",
    );
  }
  return Object.freeze({ output: resolvedOutput, inputs: resolvedInputs });
};

/** Build a byte-pinned, signer-free exact governed-route artifact. */
export async function buildPinnedSolanaGovernedRoute(options) {
  const initializerPath = required(options, "initializer-input");
  const freshDeployReportPath = required(options, "fresh-deploy-report");
  const orderedInitializationPath = required(
    options,
    "ordered-initialization-evidence",
  );
  const policySettlementPath = required(options, "taira-policy-settlement");
  const paths = await assertDistinctArtifactPaths(required(options, "out"), [
    initializerPath,
    freshDeployReportPath,
    orderedInitializationPath,
    policySettlementPath,
  ]);
  const pins = {
    initializer: expectedHash(
      required(options, "expected-initializer-input-sha256"),
      "--expected-initializer-input-sha256",
    ),
    freshDeployReport: expectedHash(
      required(options, "expected-fresh-deploy-report-sha256"),
      "--expected-fresh-deploy-report-sha256",
    ),
    orderedInitialization: expectedHash(
      required(options, "expected-ordered-initialization-evidence-sha256"),
      "--expected-ordered-initialization-evidence-sha256",
    ),
    policySettlement: expectedHash(
      required(options, "expected-taira-policy-settlement-sha256"),
      "--expected-taira-policy-settlement-sha256",
    ),
  };
  const [
    initializerArtifact,
    freshDeployArtifact,
    orderedArtifact,
    policyArtifact,
  ] = await Promise.all([
    readPinnedBytes(
      paths.inputs[0],
      pins.initializer,
      "Reviewed exact Solana initializer input",
    ),
    readPinnedBytes(
      paths.inputs[1],
      pins.freshDeployReport,
      "Reviewed canonical Solana fresh-deploy report",
    ),
    readPinnedBytes(
      paths.inputs[2],
      pins.orderedInitialization,
      "Reviewed Solana ordered-initialization evidence",
    ),
    readPinnedBytes(
      paths.inputs[3],
      pins.policySettlement,
      "Reviewed TAIRA policy/settlement artifact",
    ),
  ]);
  const initializerValue = parseSolanaExactCanonicalJsonBytes(
    initializerArtifact.bytes,
    "Reviewed exact Solana initializer input",
  ).value;
  const normalizedInitializer =
    validateSolanaExactInitializerInput(initializerValue);
  const freshDeployReport = validateSolanaLoaderV3FreshDeployReport({
    reportBytes: freshDeployArtifact.bytes,
    expectedReportSha256: freshDeployArtifact.sha256,
  });
  const orderedValue = parseSolanaGovernanceCanonicalJsonBytes(
    orderedArtifact.bytes,
    "Reviewed Solana ordered-initialization evidence",
  );
  const normalizedOrderedInitialization =
    validateSolanaOrderedInitializationEvidence(orderedValue);
  const policyValue = parseSolanaGovernanceCanonicalJsonBytes(
    policyArtifact.bytes,
    "Reviewed TAIRA policy/settlement artifact",
  );
  const candidate = buildExactSolanaGovernedRouteCandidate({
    normalizedInitializer,
    policySettlement: policyValue,
  });
  const binding = assertSolanaGovernedRouteEvidenceBindings({
    normalizedInitializer,
    freshDeployReport,
    normalizedOrderedInitialization,
    routeSummary: candidate.summary,
  });
  const routeBytes = Buffer.from(
    `${JSON.stringify(candidate.route, null, 2)}\n`,
    "utf8",
  );
  await writeAtomicJsonFile(paths.output, candidate.route);
  return Object.freeze({
    route: candidate.route,
    routePath: paths.output,
    routeSha256: sha256(routeBytes),
    initializerInputSha256: initializerArtifact.sha256,
    freshDeployReportSha256: freshDeployArtifact.sha256,
    orderedInitializationEvidenceSha256: orderedArtifact.sha256,
    tairaPolicySettlementSha256: policyArtifact.sha256,
    maxProgramFinalizationSlot: binding.maxFinalizationSlot,
    firstInitializationSlot: binding.firstInitializationSlot,
  });
}

async function main() {
  const options = parseSolanaGovernedRouteArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(SOLANA_GOVERNED_ROUTE_USAGE);
    return;
  }
  const result = await buildPinnedSolanaGovernedRoute(options);
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

import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { readStableRegularFile } from "./sccp-solana-report-io.mjs";

export const SOLANA_EXACT_PROVER_APPROVAL_SCHEMA =
  "iroha-sccp-solana-production-prover-approval/v2";
export const SOLANA_EXACT_PROVER_APPROVAL_VALIDATION_SCHEMA =
  "iroha-sccp-solana-production-prover-approval-validation/v1";
export const SOLANA_PROVER_SIDECAR_SCHEMA =
  "iroha-demo-sccp-solana-browser-prover-sidecar/v1";
export const SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA =
  "iroha-sccp-solana-prover-sidecar-governance-binding/v1";
export const SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV =
  "SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256";
export const SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV =
  "SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE";
export const SOLANA_ROUTE_ID = "taira_sol_xor";
export const SOLANA_ASSET_KEY = "xor";
export const SOLANA_NETWORK = "solana-testnet";
export const SOLANA_TESTNET_GENESIS_HASH =
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
export const SOLANA_DESTINATION_PROOF_BACKEND = "solana-groth16-bn254-v1";
export const SOLANA_SOURCE_PROOF_BACKEND = "solana-groth16-bn254-v1";
export const SOLANA_DESTINATION_VERIFIER_PLAN = "SolanaProgramNativeRecursive";
export const SOLANA_VERIFIER_TARGET = "SolanaProgram";

const ROOT_KEYS = Object.freeze([
  "schema",
  "routeId",
  "assetKey",
  "solanaNetwork",
  "solanaGenesisHash",
  "approved",
  "approvalId",
  "pins",
]);

const COMMON_HASH_PIN_KEYS = Object.freeze([
  "captureReviewPolicySha256",
  "governancePlanCanonicalSha256",
  "orderedInitializationEvidenceSha256",
  "destinationProverModuleHash",
  "destinationProverKnownAnswerVectorHash",
  "sourceProverModuleHash",
  "sourceProverKnownAnswerVectorHash",
]);
const PIN_KEYS = COMMON_HASH_PIN_KEYS;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
};

export const canonicalSolanaExactProverApprovalJson = (value) =>
  JSON.stringify(canonicalValue(value));

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect|keypair)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const status = ({ key, value = null, expected, ok, error = null }) => ({
  key,
  status: ok
    ? "present"
    : value === null || value === undefined
      ? "missing"
      : "invalid",
  value,
  expected,
  error,
  blockerId: `solana-exact-prover-approval-${key}`,
});

const normalizedHash = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(value) ||
    /^0x0{64}$/u.test(value)
  ) {
    throw new TypeError(
      `${label} must be a nonzero lowercase 0x-prefixed 32-byte hash.`,
    );
  }
  return value;
};

const recordFieldStatus = (record, expectedKeys, label) => {
  if (!isRecord(record)) {
    return status({
      key: `${label}Fields`,
      value: record ?? null,
      expected: [...expectedKeys],
      ok: false,
      error: `${label} must be an object with exact fields.`,
    });
  }
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  return status({
    key: `${label}Fields`,
    value: { present: true, fieldCount: actual.length, exact: ok },
    expected,
    ok,
    error: ok
      ? null
      : `${label} contains ${unknown.length} unknown and ${missing.length} missing field(s).`,
  });
};

const pushNormalized = ({
  statuses,
  normalized,
  key,
  raw,
  expected,
  normalize,
}) => {
  try {
    const value = normalize(raw);
    normalized[key] = value;
    statuses.push(status({ key: `pins.${key}`, value, expected, ok: true }));
  } catch (error) {
    statuses.push(
      status({
        key: `pins.${key}`,
        value: null,
        expected,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
};

/**
 * Validate the independently hash-pinned approval for exact first-release
 * prover packages. Deployment identities are not duplicated here: the exact
 * governance plan and ordered-initialization hashes bind deployment truth,
 * while each direction-specific known-answer vector hash commits the verifier
 * key, verifier artifact, independent verification receipt, proof material,
 * and package output used by that prover. The descriptor intentionally has no
 * syntax-only material claims: retired program-role or unconsumed material
 * pins fail as unknown input instead of creating a second source of truth.
 */
export const buildExactSolanaProductionProverApprovalValidation = ({
  approvalRecord = null,
  approvalPath = null,
  approvalSha256 = null,
  expectedApprovalSha256 = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const statuses = [];
  const record = isRecord(approvalRecord) ? approvalRecord : null;
  const pins = isRecord(record?.pins) ? record.pins : null;
  statuses.push(
    status({
      key: "descriptor",
      value: record ? { present: true } : null,
      expected: "exact public approval descriptor",
      ok: Boolean(record),
      error: record
        ? null
        : "Solana exact prover approval descriptor is missing.",
    }),
    recordFieldStatus(record, ROOT_KEYS, "approval"),
    recordFieldStatus(pins, PIN_KEYS, "pin"),
  );

  for (const [key, expected] of [
    ["schema", SOLANA_EXACT_PROVER_APPROVAL_SCHEMA],
    ["routeId", SOLANA_ROUTE_ID],
    ["assetKey", SOLANA_ASSET_KEY],
    ["solanaNetwork", SOLANA_NETWORK],
    ["solanaGenesisHash", SOLANA_TESTNET_GENESIS_HASH],
    ["approved", true],
  ]) {
    const value = record?.[key] ?? null;
    statuses.push(
      status({
        key,
        value: value === expected ? value : null,
        expected,
        ok: value === expected,
        error:
          value === expected
            ? null
            : `${key} must equal ${JSON.stringify(expected)}.`,
      }),
    );
  }
  const approvalId = record?.approvalId;
  const approvalIdReady =
    typeof approvalId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(approvalId);
  statuses.push(
    status({
      key: "approvalId",
      value: approvalIdReady ? "[valid-public-identifier]" : null,
      expected: "stable public approval id",
      ok: approvalIdReady,
      error: approvalIdReady
        ? null
        : "approvalId must be a stable 1-128 character public identifier.",
    }),
  );
  const secretsPresent = containsSecretField(record);
  statuses.push(
    status({
      key: "publicOnly",
      value: !secretsPresent,
      expected: true,
      ok: Boolean(record) && !secretsPresent,
      error: secretsPresent
        ? "Solana exact prover approval must not contain secret-bearing fields."
        : null,
    }),
  );

  let observedHash = null;
  let expectedHash = null;
  for (const [key, raw, assign] of [
    ["observedSha256", approvalSha256, (value) => (observedHash = value)],
    [
      "expectedSha256",
      expectedApprovalSha256,
      (value) => (expectedHash = value),
    ],
  ]) {
    try {
      const value = normalizedHash(raw, `Solana exact prover approval ${key}`);
      assign(value);
      statuses.push(
        status({
          key,
          value,
          expected: "independently supplied nonzero SHA-256",
          ok: true,
        }),
      );
    } catch (error) {
      statuses.push(
        status({
          key,
          value: null,
          expected: "independently supplied nonzero SHA-256",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  statuses.push(
    status({
      key: "sha256Binding",
      value: observedHash,
      expected: expectedHash,
      ok: Boolean(
        observedHash && expectedHash && observedHash === expectedHash,
      ),
      error:
        observedHash && expectedHash && observedHash !== expectedHash
          ? "Solana exact prover approval bytes do not match the independent expected SHA-256."
          : null,
    }),
  );

  const normalizedPins = {};
  for (const key of COMMON_HASH_PIN_KEYS) {
    pushNormalized({
      statuses,
      normalized: normalizedPins,
      key,
      raw: pins?.[key],
      expected: "nonzero lowercase 32-byte hash",
      normalize: (value) => normalizedHash(value, `pins.${key}`),
    });
  }
  for (const [key, values, expected] of [
    [
      "pins.distinctProverModules",
      [
        normalizedPins.destinationProverModuleHash,
        normalizedPins.sourceProverModuleHash,
      ].filter(Boolean),
      "distinct destination and source prover module hashes",
    ],
    [
      "pins.distinctKnownAnswerVectors",
      [
        normalizedPins.destinationProverKnownAnswerVectorHash,
        normalizedPins.sourceProverKnownAnswerVectorHash,
      ].filter(Boolean),
      "distinct destination and source known-answer vector hashes",
    ],
  ]) {
    const unique = new Set(values).size === values.length;
    statuses.push(
      status({
        key,
        value: values,
        expected,
        ok: values.length === 2 && unique,
        error: unique
          ? null
          : "Destination and source governed prover packages must remain direction-specific.",
      }),
    );
  }

  const blockers = statuses
    .filter((entry) => entry.status !== "present")
    .map((entry) => ({
      id: entry.blockerId,
      key: entry.key,
      status: entry.status,
      value: entry.value,
      expected: entry.expected,
      error: entry.error,
    }));
  return Object.freeze({
    schema: SOLANA_EXACT_PROVER_APPROVAL_VALIDATION_SCHEMA,
    checkedAt,
    routeId: SOLANA_ROUTE_ID,
    assetKey: SOLANA_ASSET_KEY,
    ready: blockers.length === 0,
    productionReady: blockers.length === 0,
    approvalPath:
      typeof approvalPath === "string" && approvalPath
        ? "[public-path-supplied]"
        : null,
    approvalSha256: observedHash,
    expectedApprovalSha256: expectedHash,
    approvalId: blockers.length === 0 && approvalIdReady ? approvalId : null,
    pins: Object.freeze(normalizedPins),
    statuses: Object.freeze(statuses),
    blockers: Object.freeze(blockers),
    blockerIds: Object.freeze(blockers.map((blocker) => blocker.id)),
    trustPolicy:
      "Exact canonical descriptor bytes must match an independently supplied SHA-256; deployment truth remains exclusively in the semantically validated exact governance plan and ordered-initialization evidence.",
  });
};

export const buildExactSolanaProverSidecarBody = ({
  direction,
  moduleUrl,
  moduleHash,
  proveExport,
  selfTestExport,
  selfTest = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const destination = direction === "destination";
  if (!destination && direction !== "source") {
    throw new Error("Solana prover direction must be destination or source.");
  }
  const proofBackend = destination
    ? SOLANA_DESTINATION_PROOF_BACKEND
    : SOLANA_SOURCE_PROOF_BACKEND;
  const productionProofsReady = selfTest?.ready === true;
  const disabledReason = productionProofsReady
    ? null
    : typeof selfTest?.reason === "string" && selfTest.reason.trim()
      ? selfTest.reason.trim()
      : `Solana ${direction} prover self-test is not production-ready.`;
  const requiredArtifacts = Array.isArray(selfTest?.requiredArtifacts)
    ? selfTest.requiredArtifacts
    : [];
  const missingArtifactIds = Array.isArray(selfTest?.missingArtifactIds)
    ? selfTest.missingArtifactIds
    : [];
  return {
    schema: SOLANA_PROVER_SIDECAR_SCHEMA,
    checkedAt,
    routeId: SOLANA_ROUTE_ID,
    route_id: SOLANA_ROUTE_ID,
    assetKey: SOLANA_ASSET_KEY,
    asset_key: SOLANA_ASSET_KEY,
    network: SOLANA_NETWORK,
    solanaNetwork: SOLANA_NETWORK,
    solana_network: SOLANA_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
    direction,
    sourceDomain: destination ? 0 : 3,
    source_domain: destination ? 0 : 3,
    targetDomain: destination ? 3 : 0,
    target_domain: destination ? 3 : 0,
    moduleUrl,
    module_url: moduleUrl,
    moduleHash,
    module_hash: moduleHash,
    proveExport,
    prove_export: proveExport,
    selfTestExport,
    self_test_export: selfTestExport,
    proofBackend,
    proof_backend: proofBackend,
    requiredProofBackend: proofBackend,
    required_proof_backend: proofBackend,
    ...(destination
      ? {
          destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
          destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
          verifierTarget: SOLANA_VERIFIER_TARGET,
          verifier_target: SOLANA_VERIFIER_TARGET,
        }
      : {}),
    productionProofsReady,
    production_proofs_ready: productionProofsReady,
    selfTest: selfTest ?? null,
    self_test: selfTest ?? null,
    ...(requiredArtifacts.length > 0
      ? { requiredArtifacts, required_artifacts: requiredArtifacts }
      : {}),
    ...(missingArtifactIds.length > 0
      ? { missingArtifactIds, missing_artifact_ids: missingArtifactIds }
      : {}),
    ...(disabledReason
      ? { disabledReason, disabled_reason: disabledReason }
      : {}),
  };
};

const secretLikePath = (file) =>
  /(^|[/\\])[^/\\]*(?:private|secret|seed|mnemonic|keypair|wallet|backup)[^/\\]*$/iu.test(
    file,
  );

const sameFile = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.nlink === right.nlink &&
  left.mtimeMs === right.mtimeMs &&
  left.ctimeMs === right.ctimeMs;

/** Stable, bounded, non-secret public artifact read for active prover paths. */
export const readStablePublicExactSolanaArtifact = async ({
  file,
  label = "Solana exact public artifact",
  maxBytes,
} = {}) => {
  if (typeof file !== "string" || !file.trim() || file.includes("\0")) {
    throw new Error(`${label} path is required.`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`${label} byte bound must be a positive safe integer.`);
  }
  const requested = path.resolve(file);
  if (secretLikePath(requested)) {
    throw new Error(`${label} must use a public non-secret path.`);
  }
  const before = await lstat(requested);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new Error(`${label} must be a single-link non-symlink regular file.`);
  }
  if (before.size <= 0 || before.size > maxBytes) {
    throw new Error(`${label} must contain 1-${maxBytes} bytes.`);
  }
  const canonical = await realpath(requested);
  if (secretLikePath(canonical)) {
    throw new Error(`${label} resolved to a secret-like path.`);
  }
  const bytes = await readStableRegularFile(canonical, { label, maxBytes });
  const after = await lstat(canonical);
  if (!sameFile(before, after) || after.nlink !== 1) {
    throw new Error(`${label} changed while it was being read.`);
  }
  return Object.freeze({
    path: canonical,
    bytes,
    sha256: `0x${createHash("sha256").update(bytes).digest("hex")}`,
  });
};

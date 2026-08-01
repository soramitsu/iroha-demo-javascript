import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_DESTINATION_VERIFIER_PLAN,
  SOLANA_SOURCE_PROOF_BACKEND,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_VERIFIER_TARGET,
  SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA,
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV,
  SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV,
  buildExactSolanaProductionProverApprovalValidation,
  buildExactSolanaProverSidecarBody,
  canonicalSolanaExactProverApprovalJson,
  readStablePublicExactSolanaArtifact,
} from "./e2e/sccp-solana-exact-prover-governance.mjs";
import {
  canonicalSolanaProverKnownAnswerJson,
  invokeSolanaProverKnownAnswer,
  validateSolanaProverKnownAnswerSummary,
  validateSolanaProverKnownAnswerVerificationReceipt,
} from "./sccp-solana-prover-known-answer.mjs";

const SOLANA_ROUTE_ID = "taira_sol_xor";
const SOLANA_ASSET_KEY = "xor";
const SOLANA_NETWORK = "solana-testnet";
export const SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV =
  SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV;
export const SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV =
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV;
const knownAnswerEnvForDirection = (direction) => {
  const prefix = `SCCP_SOLANA_${direction.toUpperCase()}_KNOWN_ANSWER`;
  return {
    vectorFile: `${prefix}_VECTOR_FILE`,
    verifierKeyFile: `${prefix}_VERIFIER_KEY_FILE`,
    verifierArtifactFile: `${prefix}_VERIFIER_ARTIFACT_FILE`,
    verificationReceiptFile: `${prefix}_VERIFICATION_RECEIPT_FILE`,
  };
};
const proofBackendForDirection = (direction) =>
  direction === "destination"
    ? SOLANA_DESTINATION_PROOF_BACKEND
    : SOLANA_SOURCE_PROOF_BACKEND;
const SOLANA_DIRECTION_DOMAINS = {
  destination: {
    sourceDomain: 0,
    targetDomain: 3,
  },
  source: {
    sourceDomain: 3,
    targetDomain: 0,
  },
};

const modules = [
  {
    direction: "destination",
    moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    modulePath: "public/sccp-solana/taira-solana-xor-destination-prover.js",
    sidecarPath:
      "public/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
    proveExport: "proveSolanaSccpDestination",
    selfTestExport: "solanaSccpDestinationProverSelfTest",
  },
  {
    direction: "source",
    moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
    modulePath: "public/sccp-solana/taira-solana-xor-source-prover.js",
    sidecarPath:
      "public/sccp-solana/taira-solana-xor-source-prover.sidecar.json",
    proveExport: "proveSolanaSccpSource",
    selfTestExport: "solanaSccpSourceProverSelfTest",
  },
];

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const trimString = (value) => String(value ?? "").trim();

const readPublicEvidenceBytes = async ({ file, label, errors }) => {
  const configured = trimString(file);
  if (!configured) {
    errors.push(`${label} is not configured.`);
    return null;
  }
  try {
    return (
      await readStablePublicExactSolanaArtifact({
        file: configured,
        label,
        maxBytes: 32 * 1024 * 1024,
      })
    ).bytes;
  } catch (error) {
    errors.push(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

const readCanonicalKnownAnswerVector = async ({ file, errors }) => {
  const bytes = await readPublicEvidenceBytes({
    file,
    label: "Solana known-answer vector file",
    errors,
  });
  if (!bytes) {
    return null;
  }
  let vector;
  try {
    vector = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    errors.push(
      `Solana known-answer vector is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
  let canonicalBytes;
  try {
    canonicalBytes = Buffer.from(
      `${canonicalSolanaProverKnownAnswerJson(vector)}\n`,
      "utf8",
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!bytes.equals(canonicalBytes)) {
    errors.push(
      "Solana known-answer vector file must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
    );
    return null;
  }
  return vector;
};

const readArtifactHash = async ({ file, label, errors }) => {
  const bytes = await readPublicEvidenceBytes({ file, label, errors });
  return bytes ? sha256Hex(bytes) : null;
};

const readVerificationReceiptHash = async ({
  direction,
  file,
  vector,
  errors,
}) => {
  const bytes = await readPublicEvidenceBytes({
    file,
    label: "Solana known-answer independent verification receipt file",
    errors,
  });
  if (!bytes) {
    return null;
  }
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    errors.push(
      `Solana known-answer verification receipt is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
  let canonicalBytes;
  try {
    canonicalBytes = Buffer.from(
      `${canonicalSolanaProverKnownAnswerJson(receipt)}\n`,
      "utf8",
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!bytes.equals(canonicalBytes)) {
    errors.push(
      "Solana known-answer verification receipt must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
    );
    return null;
  }
  errors.push(
    ...validateSolanaProverKnownAnswerVerificationReceipt({
      direction,
      receipt,
      vector,
    }),
  );
  return sha256Hex(bytes);
};

export const loadSolanaProverKnownAnswerMaterial = async ({
  direction,
  env = process.env,
} = {}) => {
  if (direction !== "destination" && direction !== "source") {
    throw new Error("Solana prover direction must be destination or source.");
  }
  const errors = [];
  const directionEnv = knownAnswerEnvForDirection(direction);
  const vector = await readCanonicalKnownAnswerVector({
    file: env[directionEnv.vectorFile],
    errors,
  });
  const verifierKeyHash = await readArtifactHash({
    file: env[directionEnv.verifierKeyFile],
    label: "Solana known-answer verifier key file",
    errors,
  });
  const verifierArtifactHash = await readArtifactHash({
    file: env[directionEnv.verifierArtifactFile],
    label: "Solana known-answer verifier artifact file",
    errors,
  });
  const verificationReceiptHash = await readVerificationReceiptHash({
    direction,
    file: env[directionEnv.verificationReceiptFile],
    vector,
    errors,
  });
  const artifactEvidence = {
    verifierKeyHash,
    verifierArtifactHash,
    verificationReceiptHash,
  };
  const approvalBytes = await readPublicEvidenceBytes({
    file: env[SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV],
    label: "Solana known-answer governance approval file",
    errors,
  });
  let approvalRecord = null;
  if (approvalBytes) {
    try {
      approvalRecord = JSON.parse(approvalBytes.toString("utf8"));
      const canonicalApprovalBytes = Buffer.from(
        `${canonicalSolanaExactProverApprovalJson(approvalRecord)}\n`,
        "utf8",
      );
      if (!approvalBytes.equals(canonicalApprovalBytes)) {
        errors.push(
          "Solana exact prover governance approval must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
        );
        approvalRecord = null;
      }
    } catch (error) {
      errors.push(
        `Solana exact prover governance approval is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const approvalHash = approvalBytes ? sha256Hex(approvalBytes) : null;
  const expectedApprovalHash = trimString(
    env[SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV],
  );
  const approvalValidation = buildExactSolanaProductionProverApprovalValidation(
    {
      approvalRecord,
      approvalSha256: approvalHash,
      expectedApprovalSha256: expectedApprovalHash || null,
    },
  );
  if (approvalValidation.ready !== true) {
    errors.push(
      ...approvalValidation.blockers.map(
        (blocker) =>
          blocker.error ||
          `Solana known-answer governance approval ${blocker.key} is ${blocker.status}.`,
      ),
    );
  }
  const vectorPinKey = `${direction}ProverKnownAnswerVectorHash`;
  const vectorHashPin = approvalValidation.pins?.[vectorPinKey] ?? null;
  return {
    vector,
    governance: {
      approvalHash: approvalValidation.approvalSha256,
      expectedApprovalHash: approvalValidation.expectedApprovalSha256,
      vectorHashPin,
    },
    artifactEvidence,
    approvalValidation,
    errors: [...new Set(errors)],
    configuredEnv: {
      approvalFile: SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV,
      approvalSha256: SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV,
      ...directionEnv,
    },
  };
};

export const bindSolanaProverModuleToApproval = ({
  direction,
  moduleHash,
  knownAnswerMaterial,
} = {}) => {
  if (direction !== "destination" && direction !== "source") {
    throw new Error("Solana prover direction must be destination or source.");
  }
  const pinKey = `${direction}ProverModuleHash`;
  const approvedHash = knownAnswerMaterial?.approvalValidation?.pins?.[pinKey];
  const errors = Array.isArray(knownAnswerMaterial?.errors)
    ? [...knownAnswerMaterial.errors]
    : ["Solana known-answer material errors must be an array."];
  if (typeof approvedHash !== "string" || approvedHash !== moduleHash) {
    errors.push(
      `Solana ${direction} prover module bytes do not match the exact governance approval pin.`,
    );
  }
  return {
    ...knownAnswerMaterial,
    errors: [...new Set(errors)],
    moduleBinding: {
      pinKey,
      moduleHash,
      approvedHash: approvedHash ?? null,
      ready: approvedHash === moduleHash,
    },
  };
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SELF_TEST_ALLOWED_FIELDS = new Set([
  "ready",
  "linked",
  "productionProofsReady",
  "production_proofs_ready",
  "routeId",
  "route_id",
  "assetKey",
  "asset_key",
  "network",
  "solanaNetwork",
  "solana_network",
  "sourceChain",
  "source_chain",
  "genesisHash",
  "genesis_hash",
  "direction",
  "sourceDomain",
  "source_domain",
  "targetDomain",
  "target_domain",
  "proofBackend",
  "proof_backend",
  "requiredProofBackend",
  "required_proof_backend",
  "destinationVerifierPlan",
  "destination_verifier_plan",
  "verifierTarget",
  "verifier_target",
  "missingArtifactIds",
  "missing_artifact_ids",
  "missingMaterialIds",
  "missing_material_ids",
  "requiredArtifacts",
  "required_artifacts",
  "reason",
]);

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect|keypair|token)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const hasOwn = (record, key) =>
  Object.prototype.hasOwnProperty.call(record, key);

const presentAliasValues = (record, keys) =>
  keys
    .filter((key) => hasOwn(record, key))
    .map((key) => ({ key, value: record[key] }));

const expectAliasedValue = ({
  record,
  keys,
  expected,
  label,
  errors,
  required = true,
  requireAll = false,
}) => {
  const values = presentAliasValues(record, keys);
  if (values.length === 0) {
    if (required) {
      errors.push(`${label} is missing.`);
    }
    return;
  }
  if (requireAll && values.length !== keys.length) {
    const missing = keys.filter((key) => !hasOwn(record, key));
    errors.push(`${label} is missing alias(es): ${missing.join(", ")}.`);
  }
  if (values.some(({ value }) => value !== values[0].value)) {
    errors.push(`${label} aliases conflict.`);
  }
  if (values.some(({ value }) => value !== expected)) {
    errors.push(`${label} must be ${JSON.stringify(expected)}.`);
  }
};

const expectEmptyMissingIds = (selfTest, errors) => {
  const keys = [
    "missingArtifactIds",
    "missing_artifact_ids",
    "missingMaterialIds",
    "missing_material_ids",
  ];
  const values = presentAliasValues(selfTest, keys);
  if (values.length === 0) {
    errors.push("missing material ids are missing.");
    return;
  }
  if (
    values.length > 1 &&
    values.some(({ value }) => !isDeepStrictEqual(value, values[0].value))
  ) {
    errors.push("missing material id aliases conflict.");
  }
  if (values.some(({ value }) => !Array.isArray(value) || value.length !== 0)) {
    errors.push("missing material ids must be empty arrays.");
  }
};

const expectRequiredArtifactsConsistency = (selfTest, errors) => {
  const values = presentAliasValues(selfTest, [
    "requiredArtifacts",
    "required_artifacts",
  ]);
  if (
    values.length > 1 &&
    values.some(({ value }) => !isDeepStrictEqual(value, values[0].value))
  ) {
    errors.push("required artifact aliases conflict.");
  }
  for (const { value } of values) {
    if (!Array.isArray(value)) {
      errors.push("required artifacts must be arrays when provided.");
      continue;
    }
    if (
      value.some(
        (artifact) =>
          isRecord(artifact) &&
          artifact.required !== false &&
          artifact.status === "missing",
      )
    ) {
      errors.push(
        "required artifacts marked missing conflict with production readiness.",
      );
    }
  }
};

export const validateSolanaProverSelfTestForSidecar = ({
  direction,
  selfTest,
} = {}) => {
  const errors = [];
  if (!isRecord(selfTest)) {
    return {
      ready: false,
      errors: ["Solana prover self-test result must be an object."],
    };
  }
  const domains = SOLANA_DIRECTION_DOMAINS[direction];
  if (!domains) {
    return {
      ready: false,
      errors: ["Solana prover direction must be destination or source."],
    };
  }
  const proofBackend = proofBackendForDirection(direction);
  const unknownFields = Object.keys(selfTest).filter(
    (key) => !SELF_TEST_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    errors.push(
      `self-test contains unknown field(s): ${unknownFields.join(", ")}.`,
    );
  }
  if (containsSecretField(selfTest)) {
    errors.push("self-test contains secret-bearing fields.");
  }

  if (selfTest.ready !== true) {
    errors.push("ready must be true.");
  }
  if (selfTest.linked !== true) {
    errors.push("linked must be true.");
  }
  expectAliasedValue({
    record: selfTest,
    keys: ["productionProofsReady", "production_proofs_ready"],
    expected: true,
    label: "productionProofsReady",
    errors,
    requireAll: true,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["routeId", "route_id"],
    expected: SOLANA_ROUTE_ID,
    label: "routeId",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["assetKey", "asset_key"],
    expected: SOLANA_ASSET_KEY,
    label: "assetKey",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: [
      "network",
      "solanaNetwork",
      "solana_network",
      "sourceChain",
      "source_chain",
    ],
    expected: SOLANA_NETWORK,
    label: "solanaNetwork",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["genesisHash", "genesis_hash"],
    expected: SOLANA_TESTNET_GENESIS_HASH,
    label: "genesisHash",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["direction"],
    expected: direction,
    label: "direction",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["sourceDomain", "source_domain"],
    expected: domains.sourceDomain,
    label: "sourceDomain",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["targetDomain", "target_domain"],
    expected: domains.targetDomain,
    label: "targetDomain",
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["proofBackend", "proof_backend"],
    expected: proofBackend,
    label: `${direction} proofBackend`,
    errors,
  });
  expectAliasedValue({
    record: selfTest,
    keys: ["requiredProofBackend", "required_proof_backend"],
    expected: proofBackend,
    label: `${direction} requiredProofBackend`,
    errors,
  });
  if (direction === "destination") {
    expectAliasedValue({
      record: selfTest,
      keys: ["destinationVerifierPlan", "destination_verifier_plan"],
      expected: SOLANA_DESTINATION_VERIFIER_PLAN,
      label: "destinationVerifierPlan",
      errors,
    });
    expectAliasedValue({
      record: selfTest,
      keys: ["verifierTarget", "verifier_target"],
      expected: SOLANA_VERIFIER_TARGET,
      label: "verifierTarget",
      errors,
    });
  }
  expectEmptyMissingIds(selfTest, errors);
  expectRequiredArtifactsConsistency(selfTest, errors);

  return {
    ready: errors.length === 0,
    errors,
  };
};

const safeArtifactId = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;

const sanitizedMissingIds = (selfTest) => {
  const source = [
    selfTest?.missingArtifactIds,
    selfTest?.missing_artifact_ids,
    selfTest?.missingMaterialIds,
    selfTest?.missing_material_ids,
  ].find(Array.isArray);
  return source ? source.map(safeArtifactId).filter(Boolean) : [];
};

const sanitizedRequiredArtifacts = (selfTest) => {
  const source = [
    selfTest?.requiredArtifacts,
    selfTest?.required_artifacts,
  ].find(Array.isArray);
  if (!source) return [];
  return source.flatMap((artifact) => {
    if (!isRecord(artifact)) return [];
    const id = safeArtifactId(artifact.id);
    const status = ["blocked", "missing", "present", "ready"].includes(
      artifact.status,
    )
      ? artifact.status
      : null;
    if (!id || !status) return [];
    const upstreamArtifactIds = Array.isArray(artifact.upstreamArtifactIds)
      ? artifact.upstreamArtifactIds.map(safeArtifactId).filter(Boolean)
      : [];
    return [
      {
        id,
        required: artifact.required !== false,
        status,
        ...(upstreamArtifactIds.length > 0 ? { upstreamArtifactIds } : {}),
      },
    ];
  });
};

const canonicalPublicSelfTest = ({ direction, selfTest, ready, reason }) => {
  const domains = SOLANA_DIRECTION_DOMAINS[direction];
  const proofBackend = proofBackendForDirection(direction);
  const missingArtifactIds = sanitizedMissingIds(selfTest);
  const requiredArtifacts = sanitizedRequiredArtifacts(selfTest);
  return {
    ready,
    linked: ready,
    productionProofsReady: ready,
    production_proofs_ready: ready,
    routeId: SOLANA_ROUTE_ID,
    assetKey: SOLANA_ASSET_KEY,
    solanaNetwork: SOLANA_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    direction,
    sourceDomain: domains.sourceDomain,
    targetDomain: domains.targetDomain,
    proofBackend,
    requiredProofBackend: proofBackend,
    ...(direction === "destination"
      ? {
          destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
          verifierTarget: SOLANA_VERIFIER_TARGET,
        }
      : {}),
    missingArtifactIds,
    ...(requiredArtifacts.length > 0 ? { requiredArtifacts } : {}),
    ...(ready ? {} : { reason }),
  };
};

const validateExactGovernanceBinding = ({
  direction,
  moduleHash,
  knownAnswer,
  approvalValidation,
  moduleBinding,
}) => {
  const errors = [];
  const pins = isRecord(approvalValidation?.pins)
    ? approvalValidation.pins
    : {};
  const governance = isRecord(knownAnswer?.governance)
    ? knownAnswer.governance
    : {};
  const pinKey = `${direction}ProverModuleHash`;
  const vectorPinKey = `${direction}ProverKnownAnswerVectorHash`;
  const requiredHashes = {
    approvalSha256: approvalValidation?.approvalSha256,
    expectedApprovalSha256: approvalValidation?.expectedApprovalSha256,
    governancePlanCanonicalSha256: pins.governancePlanCanonicalSha256,
    orderedInitializationEvidenceSha256:
      pins.orderedInitializationEvidenceSha256,
    approvedModuleHash: pins[pinKey],
    approvedVectorHash: pins[vectorPinKey],
  };
  const validHash = (value) =>
    typeof value === "string" &&
    /^0x[0-9a-f]{64}$/u.test(value) &&
    !/^0x0{64}$/u.test(value);
  if (approvalValidation?.ready !== true) {
    errors.push("Exact prover governance approval validation is not ready.");
  }
  for (const [key, value] of Object.entries(requiredHashes)) {
    if (!validHash(value)) {
      errors.push(`Exact prover governance binding ${key} is missing.`);
    }
  }
  if (requiredHashes.approvalSha256 !== requiredHashes.expectedApprovalSha256) {
    errors.push("Exact prover governance approval hash binding disagrees.");
  }
  if (
    governance.approvalHash !== requiredHashes.approvalSha256 ||
    governance.expectedApprovalHash !== requiredHashes.expectedApprovalSha256
  ) {
    errors.push("Known-answer summary is not bound to the exact approval.");
  }
  if (
    governance.vectorHashPin !== requiredHashes.approvedVectorHash ||
    knownAnswer?.vectorHash !== requiredHashes.approvedVectorHash
  ) {
    errors.push("Known-answer summary is not bound to the approved vector.");
  }
  if (
    moduleBinding?.ready !== true ||
    moduleBinding?.pinKey !== pinKey ||
    moduleBinding?.moduleHash !== moduleHash ||
    moduleBinding?.approvedHash !== requiredHashes.approvedModuleHash ||
    moduleHash !== requiredHashes.approvedModuleHash
  ) {
    errors.push("Prover module bytes are not bound to the exact approval.");
  }
  return {
    schema: SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA,
    ready: errors.length === 0,
    direction,
    approvalId: approvalValidation?.approvalId ?? null,
    ...requiredHashes,
    moduleHash,
    vectorHash: knownAnswer?.vectorHash ?? null,
    errors,
  };
};

const failClosedSelfTest = ({
  direction,
  selfTest,
  knownAnswer,
  governanceBinding,
}) => {
  const validation = validateSolanaProverSelfTestForSidecar({
    direction,
    selfTest,
  });
  const probeErrors = validateSolanaProverKnownAnswerSummary({
    direction,
    summary: knownAnswer,
  });
  const errors = [
    ...validation.errors,
    ...probeErrors,
    ...(governanceBinding?.errors ?? ["Exact governance binding is missing."]),
  ];
  return canonicalPublicSelfTest({
    direction,
    selfTest,
    ready: errors.length === 0,
    reason: `Solana ${direction} prover readiness is not production-ready: ${[
      ...new Set(errors),
    ].join(" ")}`,
  });
};

export const buildValidatedSolanaProverSidecarBody = (input = {}) => {
  const knownAnswer = isRecord(input.knownAnswer) ? input.knownAnswer : null;
  const governanceApprovalBinding = validateExactGovernanceBinding({
    direction: input.direction,
    moduleHash: input.moduleHash,
    knownAnswer,
    approvalValidation: input.approvalValidation,
    moduleBinding: input.moduleBinding,
  });
  const body = buildExactSolanaProverSidecarBody({
    ...input,
    selfTest: failClosedSelfTest({
      direction: input.direction,
      selfTest: input.selfTest,
      knownAnswer,
      governanceBinding: governanceApprovalBinding,
    }),
  });
  return {
    ...body,
    knownAnswer,
    governanceApprovalBinding,
  };
};

const readJsonIfExists = async (file) => {
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(await readFile(file, "utf8"));
};

export const runSolanaProverValidation = async ({
  direction,
  modulePath,
  moduleBytes = null,
  proveExport,
  selfTestExport,
  knownAnswerMaterial,
}) => {
  const selectedBytes = Buffer.isBuffer(moduleBytes)
    ? moduleBytes
    : (
        await readStablePublicExactSolanaArtifact({
          file: modulePath,
          label: `Solana ${direction} browser prover module`,
          maxBytes: 16 * 1024 * 1024,
        })
      ).bytes;
  const decoded = selectedBytes.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(selectedBytes)) {
    throw new Error(
      `Solana ${direction} browser prover module must be strict UTF-8.`,
    );
  }
  const imported = await import(
    `data:text/javascript;base64,${selectedBytes.toString("base64")}`
  );
  if (typeof imported[proveExport] !== "function") {
    return {
      exportsOk: false,
      selfTest: {
        ready: false,
        reason: `Solana prover module does not export ${proveExport}.`,
      },
      knownAnswer: await invokeSolanaProverKnownAnswer({
        direction,
        prove: null,
        ...knownAnswerMaterial,
        preflightErrors: knownAnswerMaterial.errors,
      }),
    };
  }
  if (typeof imported[selfTestExport] !== "function") {
    return {
      exportsOk: false,
      selfTest: {
        ready: false,
        reason: `Solana prover module does not export ${selfTestExport}.`,
      },
      knownAnswer: await invokeSolanaProverKnownAnswer({
        direction,
        prove: imported[proveExport],
        ...knownAnswerMaterial,
        preflightErrors: knownAnswerMaterial.errors,
      }),
    };
  }
  const [selfTest, knownAnswer] = await Promise.all([
    imported[selfTestExport](),
    invokeSolanaProverKnownAnswer({
      direction,
      prove: imported[proveExport],
      ...knownAnswerMaterial,
      preflightErrors: knownAnswerMaterial.errors,
    }),
  ]);
  return { exportsOk: true, selfTest, knownAnswer };
};

export const buildSolanaProverSidecarForModule = async ({
  direction,
  modulePath,
  moduleUrl,
  proveExport,
  selfTestExport,
  checkedAt = new Date().toISOString(),
  env = process.env,
} = {}) => {
  const resolvedModulePath = resolve(modulePath);
  const moduleArtifact = await readStablePublicExactSolanaArtifact({
    file: resolvedModulePath,
    label: `Solana ${direction} browser prover module`,
    maxBytes: 16 * 1024 * 1024,
  });
  const moduleHash = moduleArtifact.sha256;
  const knownAnswerMaterial = await loadSolanaProverKnownAnswerMaterial({
    direction,
    env,
  });
  const boundKnownAnswerMaterial = bindSolanaProverModuleToApproval({
    direction,
    moduleHash,
    knownAnswerMaterial,
  });
  const { exportsOk, selfTest, knownAnswer } = await runSolanaProverValidation({
    direction,
    modulePath: resolvedModulePath,
    moduleBytes: moduleArtifact.bytes,
    proveExport,
    selfTestExport,
    knownAnswerMaterial: boundKnownAnswerMaterial,
  });
  return {
    moduleHash,
    exportsOk,
    selfTest,
    knownAnswer,
    approvalValidation: knownAnswerMaterial.approvalValidation,
    moduleBinding: boundKnownAnswerMaterial.moduleBinding,
    sidecar: buildValidatedSolanaProverSidecarBody({
      direction,
      moduleUrl,
      moduleHash,
      proveExport,
      selfTestExport,
      selfTest,
      knownAnswer,
      approvalValidation: knownAnswerMaterial.approvalValidation,
      moduleBinding: boundKnownAnswerMaterial.moduleBinding,
      checkedAt,
    }),
  };
};

const buildOne = async (item) => {
  const modulePath = resolve(item.modulePath);
  const sidecarPath = resolve(item.sidecarPath);
  const validation = await buildSolanaProverSidecarForModule({
    direction: item.direction,
    modulePath,
    moduleUrl: item.moduleUrl,
    proveExport: item.proveExport,
    selfTestExport: item.selfTestExport,
  });
  const {
    moduleHash,
    selfTest,
    knownAnswer,
    approvalValidation,
    moduleBinding,
  } = validation;
  const existing = await readJsonIfExists(sidecarPath);
  const stableCheckedAt =
    typeof existing?.checkedAt === "string" && existing.checkedAt.trim()
      ? existing.checkedAt
      : new Date().toISOString();
  const stableCandidate = buildValidatedSolanaProverSidecarBody({
    direction: item.direction,
    moduleUrl: item.moduleUrl,
    moduleHash,
    proveExport: item.proveExport,
    selfTestExport: item.selfTestExport,
    selfTest,
    knownAnswer,
    approvalValidation,
    moduleBinding,
    checkedAt: stableCheckedAt,
  });
  const stableJson = `${JSON.stringify(stableCandidate, null, 2)}\n`;
  const currentJson = existsSync(sidecarPath)
    ? await readFile(sidecarPath, "utf8")
    : null;
  if (currentJson !== stableJson) {
    const updated = buildValidatedSolanaProverSidecarBody({
      direction: item.direction,
      moduleUrl: item.moduleUrl,
      moduleHash,
      proveExport: item.proveExport,
      selfTestExport: item.selfTestExport,
      selfTest,
      knownAnswer,
      approvalValidation,
      moduleBinding,
      checkedAt: new Date().toISOString(),
    });
    await mkdir(dirname(sidecarPath), { recursive: true });
    await writeFile(sidecarPath, `${JSON.stringify(updated, null, 2)}\n`);
  }
  const finalBytes = await readFile(sidecarPath);
  return {
    direction: item.direction,
    moduleUrl: item.moduleUrl,
    modulePath,
    sidecarPath,
    moduleHash,
    sidecarHash: sha256Hex(finalBytes),
    productionProofsReady: stableCandidate.productionProofsReady === true,
  };
};

const main = async () => {
  const results = [];
  for (const item of modules) {
    results.push(await buildOne(item));
  }
  for (const result of results) {
    console.log(
      `Built ${result.moduleUrl} sidecar (${result.sidecarHash}) -> ${result.sidecarPath}`,
    );
  }
};

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exitCode = 1;
  });
}

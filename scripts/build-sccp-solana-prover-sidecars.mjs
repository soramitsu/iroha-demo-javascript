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
  buildSolanaProductionGovernanceApprovalValidation,
  buildSolanaProverSidecarBody,
} from "./sccp-solana-deploy.mjs";
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
  "SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE";
export const SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV =
  "SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256";
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

const secretLikePath = (file) =>
  /(^|[/\\])[^/\\]*(?:private|secret|seed|mnemonic|keypair|wallet|backup)[^/\\]*$/iu.test(
    file,
  );

const readPublicEvidenceBytes = async ({ file, label, errors }) => {
  const configured = trimString(file);
  if (!configured) {
    errors.push(`${label} is not configured.`);
    return null;
  }
  const resolved = resolve(configured);
  if (secretLikePath(resolved)) {
    errors.push(`${label} must use a public, non-secret-like path.`);
    return null;
  }
  if (!existsSync(resolved)) {
    errors.push(`${label} does not exist.`);
    return null;
  }
  const bytes = await readFile(resolved);
  if (bytes.length === 0) {
    errors.push(`${label} must not be empty.`);
    return null;
  }
  return bytes;
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
    } catch (error) {
      errors.push(
        `Solana known-answer governance approval is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const approvalHash = approvalBytes ? sha256Hex(approvalBytes) : null;
  const expectedApprovalHash = trimString(
    env[SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV],
  );
  const approvalValidation = buildSolanaProductionGovernanceApprovalValidation({
    approvalRecord,
    approvalSha256: approvalHash,
    expectedApprovalSha256: expectedApprovalHash || null,
  });
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

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    required: false,
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

const failClosedSelfTest = ({ direction, selfTest, knownAnswer }) => {
  const validation = validateSolanaProverSelfTestForSidecar({
    direction,
    selfTest,
  });
  const probeErrors = validateSolanaProverKnownAnswerSummary({
    direction,
    summary: knownAnswer,
  });
  if (
    (validation.ready && probeErrors.length === 0) ||
    !isRecord(selfTest) ||
    selfTest.ready !== true
  ) {
    return selfTest;
  }
  return {
    ...selfTest,
    ready: false,
    reason: `Solana ${direction} prover readiness is not production-ready: ${[
      ...validation.errors,
      ...probeErrors,
    ].join(" ")}`,
  };
};

export const buildValidatedSolanaProverSidecarBody = (input = {}) => {
  const knownAnswer = isRecord(input.knownAnswer) ? input.knownAnswer : null;
  const body = buildSolanaProverSidecarBody({
    ...input,
    selfTest: failClosedSelfTest({
      direction: input.direction,
      selfTest: input.selfTest,
      knownAnswer,
    }),
  });
  return {
    ...body,
    knownAnswer,
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
  proveExport,
  selfTestExport,
  knownAnswerMaterial,
}) => {
  const imported = await import(pathToFileURL(modulePath).href);
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
  const moduleHash = sha256Hex(await readFile(resolvedModulePath));
  const knownAnswerMaterial = await loadSolanaProverKnownAnswerMaterial({
    direction,
    env,
  });
  const { exportsOk, selfTest, knownAnswer } = await runSolanaProverValidation({
    direction,
    modulePath: resolvedModulePath,
    proveExport,
    selfTestExport,
    knownAnswerMaterial,
  });
  return {
    moduleHash,
    exportsOk,
    selfTest,
    knownAnswer,
    sidecar: buildValidatedSolanaProverSidecarBody({
      direction,
      moduleUrl,
      moduleHash,
      proveExport,
      selfTestExport,
      selfTest,
      knownAnswer,
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
  const { moduleHash, selfTest, knownAnswer } = validation;
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

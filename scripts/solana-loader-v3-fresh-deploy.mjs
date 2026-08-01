/* global AggregateError, BigInt */
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import bs58 from "bs58";
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SOLANA_BUFFER_METADATA_LENGTH,
  SOLANA_PACKET_DATA_SIZE,
  SOLANA_PROGRAMDATA_METADATA_LENGTH,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK,
  SOLANA_UPGRADEABLE_LOADER_ID,
  buildLoaderV3DeployWithMaxDataLenInstruction,
  buildLoaderV3InitializeBufferInstruction,
  buildLoaderV3InvalidRollbackSentinelInstruction,
  buildLoaderV3WriteInstruction,
  solanaBlake2b256,
  solanaSha256,
} from "./solana-loader-v3-runtime.mjs";

/**
 * Runtime-only fresh deployment transport for the exact three Solana SCCP
 * programs. Filesystem and operator-ceremony concerns remain outside this
 * module; the dedicated production operator keeps payer, authority, Program,
 * and buffer key material inside one independently reviewed runtime session.
 */

export const SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-plan/v1";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-confirmation/v1";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-journal-event/v1";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_REPORT_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-report/v2";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_RESOURCE_PREFLIGHT_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-resource-preflight/v1";
export const SOLANA_LOADER_V3_FRESH_DEPLOY_RECOVERY_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-deploy-recovery/v1";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_EVIDENCE_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-sbf-validation-evidence/v1";
export const SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE = "V3";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID =
  "agave-solana-sbpf-requisite-verifier";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION = "0.21.0";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_SCOPE =
  "local-solana-sbpf-v3-structural-preflight";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY =
  "solana-loader-v3-fresh-sbf-validation-policy/v1:authenticated-release-x86_64-linux-helper+Executable::from_elf(SBPFVersion::V3,reject_broken_elfs=true)+RequisiteVerifier::verify;e_flags=3;enabled_sbpf_versions=V3..=V3;production-fresh-immutable-deploy;exact-cluster-rollback-sentinel-required";
export const SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256 = `0x${createHash(
  "sha256",
)
  .update(SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY, "utf8")
  .digest("hex")}`;
export const SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS =
  Object.freeze([
    "agave-solana-sbpf-executable-from-elf-v3",
    "solana-sbpf-elf-e-flags-v3",
    "solana-sbpf-enabled-versions-v3-only",
    "agave-solana-sbpf-reject-broken-elfs",
    "agave-solana-sbpf-requisite-verifier",
    "authenticated-helper-binary-sha256",
    "canonical-validator-source-bundle",
    "release-x86_64-linux-jit",
  ]);
export const SOLANA_SBPF_V3_ENABLE_FEATURE_ID =
  "5cC3foj77CWun58pC51ebHFUWavHWKarWyR5UUik7dnC";
export const SOLANA_FEATURE_PROGRAM_ID =
  "Feature111111111111111111111111111111111111";

export const SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER = Object.freeze([
  "nativeVerifier",
  "destination",
  "source",
]);
export const SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER = Object.freeze([
  "destination",
  "source",
  "nativeVerifier",
]);

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const PROGRAM_ACCOUNT_LENGTH = 36;
const MAX_PROGRAM_BYTES = 10 * 1024 * 1024 - SOLANA_PROGRAMDATA_METADATA_LENGTH;
const MAX_PUBLIC_JOURNAL_BYTES = 64 * 1024;
const RESOURCE_PREFLIGHT_FEE_MARGIN_BASIS_POINTS = 2_500;
const RESOURCE_PREFLIGHT_MIN_SLOT_SAFETY_MARGIN = 32;

const FRESH_REPORT_TOP_LEVEL_KEYS = new Set([
  "schema",
  "ready",
  "productionReady",
  "mode",
  "network",
  "genesisHash",
  "operationId",
  "planSha256",
  "payerAddress",
  "temporaryDeploymentAuthorityAddress",
  "context",
  "sbpfV3EnableFeature",
  "resourcePreflight",
  "journal",
  "programs",
  "immutableFinalization",
  "policy",
  "runtimeSignerMaterialZeroized",
]);
const FRESH_REPORT_CONTEXT_KEYS = new Set([
  "minFinalizedSlot",
  "expiresAtFinalizedSlot",
  "solanaCoreVersion",
  "featureSet",
]);
const FRESH_REPORT_FEATURE_KEYS = new Set([
  "featureId",
  "owner",
  "active",
  "activationSlot",
  "finalizedReadContextSlot",
  "accountDataLength",
  "accountDataSha256",
]);
const FRESH_REPORT_RESOURCE_PREFLIGHT_KEYS = new Set([
  "schema",
  "passed",
  "startedFinalizedSlot",
  "completedFinalizedSlot",
  "expiresAtFinalizedSlot",
  "remainingFinalizedSlots",
  "minimumSafeRemainingFinalizedSlots",
  "safetyMarginFinalizedSlots",
  "plannedTransactionCount",
  "plannedRequiredSignatureCount",
  "rentLamports",
  "baseFeeLamports",
  "feeMarginBasisPoints",
  "feeBudgetLamports",
  "requiredPayerLamports",
  "payerBalanceLamports",
  "remainingPayerLamports",
  "payerBalanceContextSlot",
  "feeQuoteMinContextSlot",
  "feeQuoteMaxContextSlot",
  "feeCalculation",
  "programs",
  "immutableFinalization",
]);
const FRESH_REPORT_RESOURCE_PROGRAM_KEYS = new Set([
  "role",
  "bufferSpace",
  "bufferRentLamports",
  "programSpace",
  "programRentLamports",
  "programdataSpace",
  "programdataRentLamports",
  "writeTransactionCount",
  "plannedTransactionCount",
  "plannedRequiredSignatureCount",
  "baseFeeLamports",
]);
const FRESH_REPORT_RESOURCE_FINALIZATION_KEYS = new Set([
  "plannedTransactionCount",
  "plannedRequiredSignatureCount",
  "baseFeeLamports",
]);
const FRESH_REPORT_JOURNAL_KEYS = new Set([
  "durable",
  "journalId",
  "claimedBeforeMutation",
  "completedAfterImmutableReadback",
]);
const FRESH_REPORT_PROGRAM_KEYS = new Set([
  "role",
  "programId",
  "programdataAddress",
  "bufferAddress",
  "artifactSha256",
  "executableSha256",
  "codeHash",
  "executableLength",
  "sbfValidation",
  "buffer",
  "deploy",
  "programReadback",
  "mutableProgramdataReadback",
  "immutableProgramReadback",
  "immutableProgramdataReadback",
  "immutableFinalization",
]);
const FRESH_REPORT_SBF_VALIDATION_KEYS = new Set([
  "schema",
  "sbpfVersion",
  "evidenceSha256",
  "helperBinarySha256",
  "validatorSourceBundleSha256",
  "cargoLockSha256",
  "rustcIdentitySha256",
  "checks",
  "productionEligible",
]);
const FRESH_REPORT_BUFFER_KEYS = new Set(["consumed", "initialize", "writes"]);
const FRESH_REPORT_WRITE_KEYS = new Set(["offset", "length", "transaction"]);
const FRESH_REPORT_TRANSACTION_KEYS = new Set([
  "stage",
  "signature",
  "signatures",
  "feeLamports",
  "finalizedSlot",
  "blockhash",
  "lastValidBlockHeight",
  "messageSha256",
  "packetSha256",
  "packetLength",
  "instructions",
]);
const FRESH_REPORT_INSTRUCTION_KEYS = new Set([
  "programId",
  "dataLength",
  "dataSha256",
  "dataHex",
  "metas",
]);
const FRESH_REPORT_META_KEYS = new Set(["pubkey", "isSigner", "isWritable"]);
const FRESH_REPORT_PROGRAM_READBACK_KEYS = new Set([
  "accountLamports",
  "accountDataSha256",
  "accountDataLength",
]);
const FRESH_REPORT_PROGRAMDATA_READBACK_KEYS = new Set([
  "accountLamports",
  "deploymentSlot",
  "authorityAddress",
  "immutable",
  "accountDataLength",
  "accountDataSha256",
  "metadataPaddingSha256",
  "executableLength",
  "executableSha256",
  "codeHash",
  "sbpfVersion",
]);
const FRESH_REPORT_ROLE_FINALIZATION_KEYS = new Set([
  "signature",
  "finalizedSlot",
  "messageSha256",
  "roleOrder",
]);
const FRESH_REPORT_ATOMIC_FINALIZATION_KEYS = new Set([
  ...FRESH_REPORT_TRANSACTION_KEYS,
  "roleOrder",
  "oneAtomicTransaction",
]);
const FRESH_REPORT_POLICY_KEYS = new Set([
  "freshProgramsOnly",
  "exactProgramCount",
  "runtimeOnlyRandomSigners",
  "fileBackedSignersAccepted",
  "automaticMutationRetries",
  "rollbackSentinelBeforeEveryBroadcast",
  "durableIntentBeforeEveryBroadcast",
  "exactFinalizedTransactionReadback",
  "exactArtifactByteReadback",
  "oneWayAuthorityRevocationComplete",
]);

const TOP_LEVEL_KEYS = new Set([
  "schema",
  "operationId",
  "network",
  "genesisHash",
  "payerAddress",
  "deploymentAuthorityAddress",
  "context",
  "policy",
  "programs",
]);
const CONTEXT_KEYS = new Set([
  "minFinalizedSlot",
  "expiresAtFinalizedSlot",
  "solanaCoreVersion",
  "featureSet",
  "sbpfV3EnableFeatureId",
  "sbpfV3EnableFeatureActivationSlot",
  "sbpfV3EnableFeatureAccountDataSha256",
]);
const POLICY_KEYS = new Set([
  "maxPacketBytes",
  "automaticMutationRetries",
  "runtimeOnlySigners",
  "freshProgramsOnly",
  "immutableAfterDeployment",
  "exactProgramCount",
  "finalizationOrder",
]);
const PROGRAM_KEYS = new Set([
  "role",
  "programId",
  "programdataAddress",
  "bufferAddress",
  "artifactSha256",
  "executableSha256",
  "codeHash",
  "executableLength",
  "maxDataLength",
  "sbpfVersion",
  "sbfValidatorId",
  "sbfValidatorVersion",
  "sbfValidationPolicySha256",
  "sbfValidationEvidenceSha256",
]);
const CONFIRMATION_KEYS = new Set([
  "schema",
  "action",
  "submit",
  "irreversible",
  "operationId",
  "planSha256",
  "network",
  "genesisHash",
  "programIds",
  "acknowledgePermanentProgramIds",
  "acknowledgeOneWayAuthorityRevocation",
]);
const CONFIRMATION_PROGRAM_KEYS = new Set(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER);
const FRESH_SBF_EVIDENCE_KEYS = new Set([
  "schema",
  "valid",
  "deterministic",
  "validationScope",
  "exactClusterAdmission",
  "productionEligible",
  "sbpfVersion",
  "validatorId",
  "validatorVersion",
  "policySha256",
  "artifactSha256",
  "codeHash",
  "executableLength",
  "helperBinarySha256",
  "helperTargetTriple",
  "jitOutcome",
  "buildProfile",
  "validatorSourceBundleSha256",
  "cargoLockSha256",
  "rustcIdentity",
  "rustcIdentitySha256",
  "resourceLimits",
  "checks",
]);
const FRESH_PLAN_BUILDER_CONTEXT_KEYS = new Set([
  "network",
  "genesisHash",
  "finalizedSlot",
  "expiresAtFinalizedSlot",
  "solanaCoreVersion",
  "featureSet",
  "sbpfV3EnableFeatureId",
  "sbpfV3EnableFeatureActivationSlot",
  "sbpfV3EnableFeatureAccountDataSha256",
]);
const FRESH_PLAN_BUILDER_PUBLIC_SIGNER_KEYS = new Set([
  "programId",
  "bufferAddress",
]);

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (value, keys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  if (
    actual.some((key) => !keys.has(key)) ||
    [...keys].some((key) => !actual.includes(key))
  ) {
    throw new Error(`${label} must contain only its exact canonical fields.`);
  }
};

const normalizeHash = (value, label) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase 32-byte 0x hash.`);
  }
  return value;
};

const normalizePublicKey = (value, label) => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  let publicKey;
  try {
    publicKey = new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  if (publicKey.toBase58() !== value) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  return value;
};

const positiveSafeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
};

const normalizeLabel = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u.test(value)
  ) {
    throw new Error(`${label} must be a bounded public identifier.`);
  }
  return value;
};

const assertDistinctFreshDeployProgramArtifacts = (programs) => {
  const artifactSha256Values = programs.map(
    ({ artifactSha256 }) => artifactSha256,
  );
  const codeHashValues = programs.map(({ codeHash }) => codeHash);
  if (
    new Set(artifactSha256Values).size !== programs.length ||
    new Set(codeHashValues).size !== programs.length
  ) {
    throw new Error(
      "Fresh deployment requires distinct artifact SHA-256 and executable code hashes for nativeVerifier, destination, and source.",
    );
  }
};

const deriveProgramdataAddress = (programId) =>
  PublicKey.findProgramAddressSync(
    [new PublicKey(programId).toBuffer()],
    LOADER,
  )[0].toBase58();

const assertSbfElf = (input, label) => {
  const bytes = Buffer.from(input ?? []);
  if (bytes.length < 120 || !bytes.subarray(0, 4).equals(ELF_MAGIC)) {
    throw new Error(`${label} must be a non-empty SBF ELF executable.`);
  }
  const programHeaderOffset = Number(bytes.readBigUInt64LE(32));
  const headerSize = bytes.readUInt16LE(52);
  const entrySize = bytes.readUInt16LE(54);
  const entryCount = bytes.readUInt16LE(56);
  if (
    bytes[4] !== 2 ||
    bytes[5] !== 1 ||
    bytes[6] !== 1 ||
    bytes.readUInt16LE(16) !== 3 ||
    bytes.readUInt16LE(18) !== 247 ||
    bytes.readUInt32LE(20) !== 1 ||
    bytes.readUInt32LE(48) !== 3 ||
    !Number.isSafeInteger(programHeaderOffset) ||
    programHeaderOffset < 64 ||
    headerSize !== 64 ||
    entrySize !== 56 ||
    entryCount === 0 ||
    programHeaderOffset + entrySize * entryCount > bytes.length
  ) {
    throw new Error(`${label} has an invalid static SBF ELF header.`);
  }
  if (bytes.length > MAX_PROGRAM_BYTES) {
    throw new Error(`${label} exceeds Loader-v3 account capacity.`);
  }
  return bytes;
};

const assertPlanShape = (plan) => {
  assertExactKeys(plan, TOP_LEVEL_KEYS, "Fresh deployment plan");
  assertExactKeys(plan.context, CONTEXT_KEYS, "Fresh deployment context");
  assertExactKeys(plan.policy, POLICY_KEYS, "Fresh deployment policy");
  if (!Array.isArray(plan.programs) || plan.programs.length !== 3) {
    throw new Error(
      "Fresh deployment plan must contain exactly three programs.",
    );
  }
  for (const [index, program] of plan.programs.entries()) {
    assertExactKeys(program, PROGRAM_KEYS, `Fresh deployment program ${index}`);
  }
};

/** Returns the single accepted byte representation of the public plan. */
export const canonicalSolanaLoaderV3FreshDeployPlanBytes = (plan) => {
  assertPlanShape(plan);
  const ordered = {
    schema: plan.schema,
    operationId: plan.operationId,
    network: plan.network,
    genesisHash: plan.genesisHash,
    payerAddress: plan.payerAddress,
    deploymentAuthorityAddress: plan.deploymentAuthorityAddress,
    context: {
      minFinalizedSlot: plan.context.minFinalizedSlot,
      expiresAtFinalizedSlot: plan.context.expiresAtFinalizedSlot,
      solanaCoreVersion: plan.context.solanaCoreVersion,
      featureSet: plan.context.featureSet,
      sbpfV3EnableFeatureId: plan.context.sbpfV3EnableFeatureId,
      sbpfV3EnableFeatureActivationSlot:
        plan.context.sbpfV3EnableFeatureActivationSlot,
      sbpfV3EnableFeatureAccountDataSha256:
        plan.context.sbpfV3EnableFeatureAccountDataSha256,
    },
    policy: {
      maxPacketBytes: plan.policy.maxPacketBytes,
      automaticMutationRetries: plan.policy.automaticMutationRetries,
      runtimeOnlySigners: plan.policy.runtimeOnlySigners,
      freshProgramsOnly: plan.policy.freshProgramsOnly,
      immutableAfterDeployment: plan.policy.immutableAfterDeployment,
      exactProgramCount: plan.policy.exactProgramCount,
      finalizationOrder: [...plan.policy.finalizationOrder],
    },
    programs: plan.programs.map((program) => ({
      role: program.role,
      programId: program.programId,
      programdataAddress: program.programdataAddress,
      bufferAddress: program.bufferAddress,
      artifactSha256: program.artifactSha256,
      executableSha256: program.executableSha256,
      codeHash: program.codeHash,
      executableLength: program.executableLength,
      maxDataLength: program.maxDataLength,
      sbpfVersion: program.sbpfVersion,
      sbfValidatorId: program.sbfValidatorId,
      sbfValidatorVersion: program.sbfValidatorVersion,
      sbfValidationPolicySha256: program.sbfValidationPolicySha256,
      sbfValidationEvidenceSha256: program.sbfValidationEvidenceSha256,
    })),
  };
  return Buffer.from(JSON.stringify(ordered), "utf8");
};

export const canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes = (
  evidence,
) => {
  assertExactKeys(
    evidence,
    FRESH_SBF_EVIDENCE_KEYS,
    "Fresh deployment SBF evidence",
  );
  if (!Array.isArray(evidence.checks)) {
    throw new Error("Fresh deployment SBF evidence checks must be an array.");
  }
  return Buffer.from(
    JSON.stringify({
      schema: evidence.schema,
      valid: evidence.valid,
      deterministic: evidence.deterministic,
      validationScope: evidence.validationScope,
      exactClusterAdmission: evidence.exactClusterAdmission,
      productionEligible: evidence.productionEligible,
      sbpfVersion: evidence.sbpfVersion,
      validatorId: evidence.validatorId,
      validatorVersion: evidence.validatorVersion,
      policySha256: evidence.policySha256,
      artifactSha256: evidence.artifactSha256,
      codeHash: evidence.codeHash,
      executableLength: evidence.executableLength,
      helperBinarySha256: evidence.helperBinarySha256,
      helperTargetTriple: evidence.helperTargetTriple,
      jitOutcome: evidence.jitOutcome,
      buildProfile: evidence.buildProfile,
      validatorSourceBundleSha256: evidence.validatorSourceBundleSha256,
      cargoLockSha256: evidence.cargoLockSha256,
      rustcIdentity: evidence.rustcIdentity,
      rustcIdentitySha256: evidence.rustcIdentitySha256,
      resourceLimits: evidence.resourceLimits,
      checks: [...evidence.checks],
    }),
    "utf8",
  );
};

const strictJsonFromBytes = (bytes, label) => {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes)),
    );
  } catch {
    throw new Error(`${label} must be strict UTF-8 JSON.`);
  }
};

const canonicalJsonValue = (value, label) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error(`${label} contains a non-canonical JSON number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalJsonValue(entry, `${label}[${index}]`),
    );
  }
  if (!isRecord(value)) {
    throw new Error(`${label} contains a non-JSON value.`);
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key], `${label}.${key}`)]),
  );
};

/** The only accepted byte representation of a completed fresh-deploy report. */
export const canonicalSolanaLoaderV3FreshDeployReportBytes = (report) =>
  Buffer.from(
    JSON.stringify(canonicalJsonValue(report, "Fresh deployment report")),
    "utf8",
  );

const canonicalReportSignature = (value, label) => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a canonical Solana signature.`);
  }
  let decoded;
  try {
    decoded = bs58.decode(value);
  } catch {
    throw new Error(`${label} must be a canonical Solana signature.`);
  }
  if (
    decoded.length !== 64 ||
    decoded.every((byte) => byte === 0) ||
    bs58.encode(decoded) !== value
  ) {
    throw new Error(`${label} must encode 64 nonzero signature bytes.`);
  }
  return value;
};

const nonnegativeSafeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
};

const addSafeIntegers = (values, label) => {
  let total = 0;
  for (const [index, value] of values.entries()) {
    nonnegativeSafeInteger(value, `${label} value ${index}`);
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new Error(`${label} exceeds the safe-integer range.`);
    }
  }
  return total;
};

const feeBudgetWithMargin = (baseFeeLamports) => {
  nonnegativeSafeInteger(baseFeeLamports, "Fresh deployment base fee");
  const wholeBasisPointUnits = Math.floor(baseFeeLamports / 10_000);
  const basisPointRemainder = baseFeeLamports % 10_000;
  const margin = addSafeIntegers(
    [
      wholeBasisPointUnits * RESOURCE_PREFLIGHT_FEE_MARGIN_BASIS_POINTS,
      Math.ceil(
        (basisPointRemainder * RESOURCE_PREFLIGHT_FEE_MARGIN_BASIS_POINTS) /
          10_000,
      ),
    ],
    "Fresh deployment fee margin",
  );
  return addSafeIntegers(
    [baseFeeLamports, margin],
    "Fresh deployment fee budget",
  );
};

const assertReportInstruction = (value, label) => {
  assertExactKeys(value, FRESH_REPORT_INSTRUCTION_KEYS, label);
  normalizePublicKey(value.programId, `${label} program`);
  const dataLength = nonnegativeSafeInteger(
    value.dataLength,
    `${label} data length`,
  );
  normalizeHash(value.dataSha256, `${label} data SHA-256`);
  if (value.dataHex !== null) {
    if (
      typeof value.dataHex !== "string" ||
      !/^0x(?:[0-9a-f]{2})*$/u.test(value.dataHex) ||
      (value.dataHex.length - 2) / 2 !== dataLength ||
      solanaSha256(Buffer.from(value.dataHex.slice(2), "hex")) !==
        value.dataSha256
    ) {
      throw new Error(`${label} inline instruction bytes are not exact.`);
    }
  } else if (dataLength <= 64) {
    throw new Error(`${label} omits bounded inline instruction bytes.`);
  }
  if (!Array.isArray(value.metas)) {
    throw new Error(`${label} account metas must be an array.`);
  }
  for (const [index, meta] of value.metas.entries()) {
    assertExactKeys(meta, FRESH_REPORT_META_KEYS, `${label} meta ${index}`);
    normalizePublicKey(meta.pubkey, `${label} meta ${index} public key`);
    if (
      typeof meta.isSigner !== "boolean" ||
      typeof meta.isWritable !== "boolean"
    ) {
      throw new Error(`${label} meta ${index} flags must be booleans.`);
    }
  }
  return value;
};

const assertReportTransaction = (
  value,
  label,
  expectedStage,
  allowedKeys = FRESH_REPORT_TRANSACTION_KEYS,
) => {
  assertExactKeys(value, allowedKeys, label);
  if (value.stage !== expectedStage) {
    throw new Error(`${label} stage differs from the exact lifecycle action.`);
  }
  const primary = canonicalReportSignature(
    value.signature,
    `${label} signature`,
  );
  if (
    !Array.isArray(value.signatures) ||
    value.signatures.length === 0 ||
    value.signatures[0] !== primary ||
    new Set(value.signatures).size !== value.signatures.length
  ) {
    throw new Error(`${label} signature list is not exact.`);
  }
  value.signatures.forEach((entry, index) =>
    canonicalReportSignature(entry, `${label} signature ${index}`),
  );
  positiveSafeInteger(value.feeLamports, `${label} fee`);
  positiveSafeInteger(value.finalizedSlot, `${label} finalized slot`);
  normalizePublicKey(value.blockhash, `${label} blockhash`);
  positiveSafeInteger(
    value.lastValidBlockHeight,
    `${label} last valid block height`,
  );
  normalizeHash(value.messageSha256, `${label} message SHA-256`);
  normalizeHash(value.packetSha256, `${label} packet SHA-256`);
  const packetLength = positiveSafeInteger(
    value.packetLength,
    `${label} packet length`,
  );
  if (packetLength > SOLANA_PACKET_DATA_SIZE) {
    throw new Error(`${label} exceeds the Solana packet limit.`);
  }
  if (!Array.isArray(value.instructions) || value.instructions.length === 0) {
    throw new Error(`${label} instruction list is empty.`);
  }
  value.instructions.forEach((instruction, index) =>
    assertReportInstruction(instruction, `${label} instruction ${index}`),
  );
  return value;
};

const assertProgramdataReportReadback = ({
  value,
  program,
  immutable,
  authorityAddress,
  deploymentSlot,
  label,
}) => {
  assertExactKeys(value, FRESH_REPORT_PROGRAMDATA_READBACK_KEYS, label);
  positiveSafeInteger(value.accountLamports, `${label} account lamports`);
  if (
    value.deploymentSlot !== deploymentSlot ||
    value.authorityAddress !== (immutable ? null : authorityAddress) ||
    value.immutable !== immutable ||
    value.accountDataLength !==
      SOLANA_PROGRAMDATA_METADATA_LENGTH + program.executableLength ||
    value.executableLength !== program.executableLength ||
    value.executableSha256 !== program.artifactSha256 ||
    value.codeHash !== program.codeHash ||
    value.sbpfVersion !== SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE
  ) {
    throw new Error(`${label} is not the exact Loader-v3 executable state.`);
  }
  normalizeHash(value.accountDataSha256, `${label} account-data SHA-256`);
  normalizeHash(value.metadataPaddingSha256, `${label} padding SHA-256`);
};

const assertFreshReportSbfValidation = (value, program) => {
  assertExactKeys(
    value,
    FRESH_REPORT_SBF_VALIDATION_KEYS,
    `${program.role} SBF validation`,
  );
  for (const [field, expected] of [
    ["schema", SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_EVIDENCE_SCHEMA],
    ["sbpfVersion", SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE],
    ["evidenceSha256", program.sbfValidationEvidenceSha256],
  ]) {
    if (value[field] !== expected) {
      throw new Error(`${program.role} SBF validation ${field} is not exact.`);
    }
  }
  for (const field of [
    "evidenceSha256",
    "helperBinarySha256",
    "validatorSourceBundleSha256",
    "cargoLockSha256",
    "rustcIdentitySha256",
  ]) {
    normalizeHash(value[field], `${program.role} SBF validation ${field}`);
  }
  if (
    value.productionEligible !== true ||
    JSON.stringify(value.checks) !==
      JSON.stringify(SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS)
  ) {
    throw new Error(`${program.role} SBF validation is not production exact.`);
  }
};

const assertRoleFinalization = (value, program, atomicFinalization) => {
  assertExactKeys(
    value,
    FRESH_REPORT_ROLE_FINALIZATION_KEYS,
    `${program.role} immutable finalization`,
  );
  if (
    value.signature !== atomicFinalization.signature ||
    value.finalizedSlot !== atomicFinalization.finalizedSlot ||
    value.messageSha256 !== atomicFinalization.messageSha256 ||
    JSON.stringify(value.roleOrder) !==
      JSON.stringify(SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER)
  ) {
    throw new Error(
      `${program.role} immutable finalization differs from the one atomic transaction.`,
    );
  }
};

const assertAtomicFreshReportFinalization = ({
  value,
  programsByRole,
  authorityAddress,
}) => {
  assertExactKeys(
    value,
    FRESH_REPORT_ATOMIC_FINALIZATION_KEYS,
    "Fresh deployment atomic finalization",
  );
  assertReportTransaction(
    value,
    "Fresh deployment atomic finalization",
    "set-authority-none:destination,source,nativeVerifier",
    FRESH_REPORT_ATOMIC_FINALIZATION_KEYS,
  );
  if (
    value.oneAtomicTransaction !== true ||
    JSON.stringify(value.roleOrder) !==
      JSON.stringify(SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER) ||
    value.instructions.length !== 3
  ) {
    throw new Error(
      "Fresh deployment authority removal is not one exact three-instruction transaction.",
    );
  }
  for (const [
    index,
    role,
  ] of SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.entries()) {
    const instruction = value.instructions[index];
    const program = programsByRole[role];
    if (
      instruction.programId !== SOLANA_UPGRADEABLE_LOADER_ID ||
      instruction.dataLength !== 4 ||
      instruction.dataHex !== "0x04000000" ||
      instruction.metas.length !== 2 ||
      instruction.metas[0].pubkey !== program.programdataAddress ||
      instruction.metas[0].isSigner !== false ||
      instruction.metas[0].isWritable !== true ||
      instruction.metas[1].pubkey !== authorityAddress ||
      instruction.metas[1].isSigner !== true ||
      instruction.metas[1].isWritable !== false
    ) {
      throw new Error(
        `Fresh deployment ${role} SetAuthority(None) instruction is not exact.`,
      );
    }
  }
  return value;
};

const reportCreateAccountLamports = ({
  transaction,
  payerAddress,
  createdAddress,
  expectedSpace,
  label,
}) => {
  if (transaction.instructions.length !== 2) {
    throw new Error(`${label} must contain exactly two instructions.`);
  }
  const instruction = transaction.instructions[0];
  if (
    instruction.programId !== SystemProgram.programId.toBase58() ||
    instruction.dataLength !== 52 ||
    typeof instruction.dataHex !== "string"
  ) {
    throw new Error(`${label} System CreateAccount instruction is not exact.`);
  }
  const data = Buffer.from(instruction.dataHex.slice(2), "hex");
  const lamports = data.readBigUInt64LE(4);
  const expectedMetas = [
    { pubkey: payerAddress, isSigner: true, isWritable: true },
    { pubkey: createdAddress, isSigner: true, isWritable: true },
  ];
  const metasAreExact =
    instruction.metas.length === expectedMetas.length &&
    instruction.metas.every(
      (meta, index) =>
        meta.pubkey === expectedMetas[index].pubkey &&
        meta.isSigner === expectedMetas[index].isSigner &&
        meta.isWritable === expectedMetas[index].isWritable,
    );
  if (
    data.readUInt32LE(0) !== 0 ||
    lamports === 0n ||
    lamports > BigInt(Number.MAX_SAFE_INTEGER) ||
    data.readBigUInt64LE(12) !== BigInt(expectedSpace) ||
    new PublicKey(data.subarray(20, 52)).toBase58() !==
      SOLANA_UPGRADEABLE_LOADER_ID ||
    !metasAreExact
  ) {
    throw new Error(`${label} System CreateAccount resources are not exact.`);
  }
  return Number(lamports);
};

const assertFreshReportResourcePreflight = ({
  value,
  programsByRole,
  atomicFinalization,
  payerAddress,
  minFinalizedSlot,
  expiresAtFinalizedSlot,
  lifecycleTransactions,
}) => {
  assertExactKeys(
    value,
    FRESH_REPORT_RESOURCE_PREFLIGHT_KEYS,
    "Fresh deployment resource preflight",
  );
  if (
    value.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_RESOURCE_PREFLIGHT_SCHEMA ||
    value.passed !== true ||
    value.feeCalculation !== "rpc-getFeeForMessage-finalized-v1" ||
    value.feeMarginBasisPoints !== RESOURCE_PREFLIGHT_FEE_MARGIN_BASIS_POINTS ||
    value.expiresAtFinalizedSlot !== expiresAtFinalizedSlot
  ) {
    throw new Error("Fresh deployment resource preflight policy is not exact.");
  }
  const startedFinalizedSlot = positiveSafeInteger(
    value.startedFinalizedSlot,
    "Resource preflight start slot",
  );
  const completedFinalizedSlot = positiveSafeInteger(
    value.completedFinalizedSlot,
    "Resource preflight completion slot",
  );
  if (
    startedFinalizedSlot < minFinalizedSlot ||
    completedFinalizedSlot < startedFinalizedSlot ||
    completedFinalizedSlot > expiresAtFinalizedSlot ||
    lifecycleTransactions[0]?.finalizedSlot <= completedFinalizedSlot
  ) {
    throw new Error(
      "Fresh deployment resource preflight is not ordered before mutation.",
    );
  }
  const plannedTransactionCount = positiveSafeInteger(
    value.plannedTransactionCount,
    "Resource preflight transaction count",
  );
  const plannedRequiredSignatureCount = positiveSafeInteger(
    value.plannedRequiredSignatureCount,
    "Resource preflight required-signature count",
  );
  const safetyMarginFinalizedSlots = positiveSafeInteger(
    value.safetyMarginFinalizedSlots,
    "Resource preflight slot safety margin",
  );
  const expectedSafetyMargin = Math.max(
    RESOURCE_PREFLIGHT_MIN_SLOT_SAFETY_MARGIN,
    Math.ceil(plannedTransactionCount / 4),
  );
  const expectedMinimumSafeSlots = addSafeIntegers(
    [plannedTransactionCount, expectedSafetyMargin],
    "Resource preflight minimum safe slot window",
  );
  if (
    plannedTransactionCount !== lifecycleTransactions.length ||
    plannedRequiredSignatureCount !==
      addSafeIntegers(
        lifecycleTransactions.map(({ signatures }) => signatures.length),
        "Fresh deployment lifecycle signature count",
      ) ||
    safetyMarginFinalizedSlots !== expectedSafetyMargin ||
    value.minimumSafeRemainingFinalizedSlots !== expectedMinimumSafeSlots ||
    value.remainingFinalizedSlots !==
      expiresAtFinalizedSlot - completedFinalizedSlot ||
    value.remainingFinalizedSlots < expectedMinimumSafeSlots
  ) {
    throw new Error(
      "Fresh deployment resource preflight slot/transaction budget is not exact.",
    );
  }
  if (
    !Array.isArray(value.programs) ||
    value.programs.length !== SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.length ||
    JSON.stringify(value.programs.map(({ role }) => role)) !==
      JSON.stringify(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER)
  ) {
    throw new Error(
      "Fresh deployment resource preflight program order is not exact.",
    );
  }
  const rentParts = [];
  const feeParts = [];
  const actualFeeParts = [];
  let programTransactionCount = 0;
  let programSignatureCount = 0;
  for (const resourceProgram of value.programs) {
    assertExactKeys(
      resourceProgram,
      FRESH_REPORT_RESOURCE_PROGRAM_KEYS,
      `${resourceProgram.role} resource preflight`,
    );
    const program = programsByRole[resourceProgram.role];
    if (!program) {
      throw new Error(
        "Fresh deployment resource preflight has an unknown role.",
      );
    }
    const writeTransactionCount = program.buffer.writes.length;
    const transactions = [
      program.buffer.initialize,
      ...program.buffer.writes.map(({ transaction }) => transaction),
      program.deploy,
    ];
    const expectedTransactionCount = transactions.length;
    const expectedSignatureCount = addSafeIntegers(
      transactions.map(({ signatures }) => signatures.length),
      `${program.role} planned signature count`,
    );
    const bufferCreateLamports = reportCreateAccountLamports({
      transaction: program.buffer.initialize,
      payerAddress,
      createdAddress: program.bufferAddress,
      expectedSpace: SOLANA_BUFFER_METADATA_LENGTH + program.executableLength,
      label: `${program.role} buffer creation`,
    });
    const programCreateLamports = reportCreateAccountLamports({
      transaction: program.deploy,
      payerAddress,
      createdAddress: program.programId,
      expectedSpace: PROGRAM_ACCOUNT_LENGTH,
      label: `${program.role} Program creation`,
    });
    const actualProgramFeeLamports = addSafeIntegers(
      transactions.map(({ feeLamports }) => feeLamports),
      `${program.role} finalized transaction fees`,
    );
    if (
      resourceProgram.bufferSpace !==
        SOLANA_BUFFER_METADATA_LENGTH + program.executableLength ||
      resourceProgram.programSpace !== PROGRAM_ACCOUNT_LENGTH ||
      resourceProgram.programdataSpace !==
        SOLANA_PROGRAMDATA_METADATA_LENGTH + program.executableLength ||
      resourceProgram.writeTransactionCount !== writeTransactionCount ||
      resourceProgram.plannedTransactionCount !== expectedTransactionCount ||
      resourceProgram.plannedRequiredSignatureCount !==
        expectedSignatureCount ||
      resourceProgram.bufferRentLamports !== bufferCreateLamports ||
      resourceProgram.programRentLamports !== programCreateLamports ||
      program.programReadback.accountLamports !== programCreateLamports ||
      program.mutableProgramdataReadback.accountLamports !==
        resourceProgram.programdataRentLamports ||
      program.immutableProgramdataReadback.accountLamports !==
        resourceProgram.programdataRentLamports ||
      actualProgramFeeLamports >
        feeBudgetWithMargin(resourceProgram.baseFeeLamports)
    ) {
      throw new Error(
        `${program.role} resource preflight does not match the exact deployment lifecycle.`,
      );
    }
    for (const [amount, label] of [
      [resourceProgram.bufferRentLamports, "buffer rent"],
      [resourceProgram.programRentLamports, "Program rent"],
      [resourceProgram.programdataRentLamports, "ProgramData rent"],
      [resourceProgram.baseFeeLamports, "base fee"],
    ]) {
      positiveSafeInteger(amount, `${program.role} ${label}`);
    }
    rentParts.push(
      resourceProgram.bufferRentLamports,
      resourceProgram.programRentLamports,
      resourceProgram.programdataRentLamports,
    );
    feeParts.push(resourceProgram.baseFeeLamports);
    actualFeeParts.push(actualProgramFeeLamports);
    programTransactionCount += expectedTransactionCount;
    programSignatureCount += expectedSignatureCount;
  }
  assertExactKeys(
    value.immutableFinalization,
    FRESH_REPORT_RESOURCE_FINALIZATION_KEYS,
    "Immutable finalization resource preflight",
  );
  const finalizationFee = positiveSafeInteger(
    value.immutableFinalization.baseFeeLamports,
    "Immutable finalization base fee",
  );
  if (
    value.immutableFinalization.plannedTransactionCount !== 1 ||
    value.immutableFinalization.plannedRequiredSignatureCount !==
      atomicFinalization.signatures.length ||
    programTransactionCount + 1 !== plannedTransactionCount ||
    programSignatureCount + atomicFinalization.signatures.length !==
      plannedRequiredSignatureCount
  ) {
    throw new Error(
      "Immutable finalization resource preflight counts are not exact.",
    );
  }
  feeParts.push(finalizationFee);
  const actualFinalizationFee = positiveSafeInteger(
    atomicFinalization.feeLamports,
    "Immutable finalization finalized fee",
  );
  if (actualFinalizationFee > feeBudgetWithMargin(finalizationFee)) {
    throw new Error(
      "Immutable finalization finalized fee exceeds its resource budget.",
    );
  }
  actualFeeParts.push(actualFinalizationFee);
  const rentLamports = addSafeIntegers(
    rentParts,
    "Fresh deployment rent obligation",
  );
  const baseFeeLamports = addSafeIntegers(
    feeParts,
    "Fresh deployment base fee",
  );
  const feeBudgetLamports = feeBudgetWithMargin(baseFeeLamports);
  const actualFeeLamports = addSafeIntegers(
    actualFeeParts,
    "Fresh deployment finalized transaction fees",
  );
  const requiredPayerLamports = addSafeIntegers(
    [rentLamports, feeBudgetLamports],
    "Fresh deployment required payer balance",
  );
  const payerBalanceLamports = positiveSafeInteger(
    value.payerBalanceLamports,
    "Resource preflight payer balance",
  );
  for (const [slotValue, label] of [
    [value.payerBalanceContextSlot, "payer-balance context slot"],
    [value.feeQuoteMinContextSlot, "minimum fee-quote context slot"],
    [value.feeQuoteMaxContextSlot, "maximum fee-quote context slot"],
  ]) {
    const slot = positiveSafeInteger(slotValue, label);
    if (slot < startedFinalizedSlot || slot > completedFinalizedSlot) {
      throw new Error(
        `Resource preflight ${label} is outside its live window.`,
      );
    }
  }
  if (
    value.feeQuoteMinContextSlot > value.feeQuoteMaxContextSlot ||
    value.payerBalanceContextSlot !== completedFinalizedSlot ||
    value.payerBalanceContextSlot < value.feeQuoteMaxContextSlot ||
    value.rentLamports !== rentLamports ||
    value.baseFeeLamports !== baseFeeLamports ||
    value.feeBudgetLamports !== feeBudgetLamports ||
    actualFeeLamports > feeBudgetLamports ||
    value.requiredPayerLamports !== requiredPayerLamports ||
    payerBalanceLamports < requiredPayerLamports ||
    value.remainingPayerLamports !==
      payerBalanceLamports - requiredPayerLamports
  ) {
    throw new Error(
      "Fresh deployment resource preflight balance/fee arithmetic is not exact.",
    );
  }
  return value;
};

/**
 * Validates the exact canonical public report emitted by the fresh Loader-v3
 * deployment runtime. The independently supplied byte hash is mandatory; a
 * current immutable account readback alone is deliberately insufficient.
 */
export const validateSolanaLoaderV3FreshDeployReport = ({
  reportBytes,
  expectedReportSha256,
} = {}) => {
  if (!(reportBytes instanceof Uint8Array)) {
    throw new Error("Fresh deployment report must be supplied as exact bytes.");
  }
  const bytes = Buffer.from(reportBytes);
  const reportSha256 = solanaSha256(bytes);
  if (
    reportSha256 !==
    normalizeHash(
      expectedReportSha256,
      "Expected fresh deployment report SHA-256",
    )
  ) {
    throw new Error(
      "Fresh deployment report bytes do not match the independent SHA-256 pin.",
    );
  }
  const report = strictJsonFromBytes(bytes, "Fresh deployment report");
  assertExactKeys(
    report,
    FRESH_REPORT_TOP_LEVEL_KEYS,
    "Fresh deployment report",
  );
  if (!bytes.equals(canonicalSolanaLoaderV3FreshDeployReportBytes(report))) {
    throw new Error("Fresh deployment report is not canonical JSON bytes.");
  }
  if (
    report.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_REPORT_SCHEMA ||
    report.ready !== true ||
    report.productionReady !== true ||
    report.mode !== "fresh-exact-three-program-loader-v3-deployment" ||
    report.network !== SOLANA_TESTNET_NETWORK ||
    report.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
    report.runtimeSignerMaterialZeroized !== true
  ) {
    throw new Error(
      "Fresh deployment report is not a completed production Solana-testnet report.",
    );
  }
  normalizeHash(report.operationId, "Fresh deployment operation id");
  normalizeHash(report.planSha256, "Fresh deployment plan SHA-256");
  const payerAddress = normalizePublicKey(
    report.payerAddress,
    "Fresh deployment payer",
  );
  const authorityAddress = normalizePublicKey(
    report.temporaryDeploymentAuthorityAddress,
    "Fresh deployment temporary authority",
  );
  if (payerAddress === authorityAddress) {
    throw new Error("Fresh deployment payer and authority must be distinct.");
  }
  assertExactKeys(
    report.context,
    FRESH_REPORT_CONTEXT_KEYS,
    "Fresh deployment report context",
  );
  const minFinalizedSlot = positiveSafeInteger(
    report.context.minFinalizedSlot,
    "Fresh deployment minimum finalized slot",
  );
  const expiresAtFinalizedSlot = positiveSafeInteger(
    report.context.expiresAtFinalizedSlot,
    "Fresh deployment expiry finalized slot",
  );
  if (expiresAtFinalizedSlot <= minFinalizedSlot) {
    throw new Error("Fresh deployment report context has expired ordering.");
  }
  normalizeLabel(report.context.solanaCoreVersion, "Solana core version");
  positiveSafeInteger(report.context.featureSet, "Solana feature set");
  assertExactKeys(
    report.sbpfV3EnableFeature,
    FRESH_REPORT_FEATURE_KEYS,
    "Fresh deployment SBPF V3 feature evidence",
  );
  const feature = report.sbpfV3EnableFeature;
  if (
    feature.featureId !== SOLANA_SBPF_V3_ENABLE_FEATURE_ID ||
    feature.owner !== SOLANA_FEATURE_PROGRAM_ID ||
    feature.active !== true ||
    positiveSafeInteger(feature.activationSlot, "SBPF V3 activation slot") >
      minFinalizedSlot ||
    positiveSafeInteger(
      feature.finalizedReadContextSlot,
      "SBPF V3 finalized read slot",
    ) < minFinalizedSlot ||
    feature.accountDataLength !== 9
  ) {
    throw new Error(
      "Fresh deployment SBPF V3 activation evidence is not exact.",
    );
  }
  normalizeHash(feature.accountDataSha256, "SBPF V3 account-data SHA-256");
  assertExactKeys(
    report.journal,
    FRESH_REPORT_JOURNAL_KEYS,
    "Fresh deployment report journal",
  );
  if (
    report.journal.durable !== true ||
    report.journal.claimedBeforeMutation !== true ||
    report.journal.completedAfterImmutableReadback !== true ||
    typeof report.journal.journalId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/u.test(report.journal.journalId)
  ) {
    throw new Error("Fresh deployment public journal evidence is not exact.");
  }
  assertExactKeys(
    report.policy,
    FRESH_REPORT_POLICY_KEYS,
    "Fresh deployment report policy",
  );
  const expectedPolicy = {
    freshProgramsOnly: true,
    exactProgramCount: 3,
    runtimeOnlyRandomSigners: true,
    fileBackedSignersAccepted: false,
    automaticMutationRetries: 0,
    rollbackSentinelBeforeEveryBroadcast: true,
    durableIntentBeforeEveryBroadcast: true,
    exactFinalizedTransactionReadback: true,
    exactArtifactByteReadback: true,
    oneWayAuthorityRevocationComplete: true,
  };
  if (
    Object.entries(expectedPolicy).some(
      ([field, expected]) => report.policy[field] !== expected,
    )
  ) {
    throw new Error("Fresh deployment report policy is not exact.");
  }
  if (
    !Array.isArray(report.programs) ||
    report.programs.length !== 3 ||
    JSON.stringify(report.programs.map(({ role }) => role)) !==
      JSON.stringify(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER)
  ) {
    throw new Error(
      "Fresh deployment report must contain the exact role order.",
    );
  }
  const programsByRole = Object.fromEntries(
    report.programs.map((program) => [program.role, program]),
  );
  const atomicFinalization = assertAtomicFreshReportFinalization({
    value: report.immutableFinalization,
    programsByRole,
    authorityAddress,
  });
  if (
    atomicFinalization.finalizedSlot <= minFinalizedSlot ||
    atomicFinalization.finalizedSlot > expiresAtFinalizedSlot
  ) {
    throw new Error(
      "Fresh deployment finalization is outside reviewed context.",
    );
  }

  const reservedAddresses = new Set([payerAddress, authorityAddress]);
  const artifactHashes = new Set();
  const codeHashes = new Set();
  const lifecycleTransactions = [];
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    const program = programsByRole[role];
    assertExactKeys(
      program,
      FRESH_REPORT_PROGRAM_KEYS,
      `${role} fresh deployment report`,
    );
    const programId = normalizePublicKey(program.programId, `${role} Program`);
    const programdataAddress = normalizePublicKey(
      program.programdataAddress,
      `${role} ProgramData`,
    );
    const bufferAddress = normalizePublicKey(
      program.bufferAddress,
      `${role} buffer`,
    );
    if (deriveProgramdataAddress(programId) !== programdataAddress) {
      throw new Error(`${role} ProgramData is not the Loader-v3 PDA.`);
    }
    for (const address of [programId, programdataAddress, bufferAddress]) {
      if (reservedAddresses.has(address)) {
        throw new Error("Fresh deployment report aliases a runtime identity.");
      }
      reservedAddresses.add(address);
    }
    normalizeHash(program.artifactSha256, `${role} artifact SHA-256`);
    normalizeHash(program.executableSha256, `${role} executable SHA-256`);
    normalizeHash(program.codeHash, `${role} executable code hash`);
    if (
      program.executableSha256 !== program.artifactSha256 ||
      !Number.isSafeInteger(program.executableLength) ||
      program.executableLength < 120 ||
      program.executableLength > MAX_PROGRAM_BYTES
    ) {
      throw new Error(`${role} report does not bind exact executable bytes.`);
    }
    artifactHashes.add(program.artifactSha256);
    codeHashes.add(program.codeHash);
    assertFreshReportSbfValidation(program.sbfValidation, {
      ...program,
      sbfValidationEvidenceSha256: program.sbfValidation.evidenceSha256,
    });
    assertExactKeys(
      program.buffer,
      FRESH_REPORT_BUFFER_KEYS,
      `${role} consumed buffer evidence`,
    );
    if (
      program.buffer.consumed !== true ||
      !Array.isArray(program.buffer.writes)
    ) {
      throw new Error(`${role} Loader-v3 buffer was not consumed exactly.`);
    }
    const initialize = assertReportTransaction(
      program.buffer.initialize,
      `${role} buffer initialization`,
      `create-initialize-buffer:${role}`,
    );
    lifecycleTransactions.push(initialize);
    let nextOffset = 0;
    for (const [index, write] of program.buffer.writes.entries()) {
      assertExactKeys(
        write,
        FRESH_REPORT_WRITE_KEYS,
        `${role} buffer write ${index}`,
      );
      if (
        write.offset !== nextOffset ||
        !Number.isSafeInteger(write.length) ||
        write.length <= 0
      ) {
        throw new Error(
          `${role} buffer writes are not contiguous exact bytes.`,
        );
      }
      const transaction = assertReportTransaction(
        write.transaction,
        `${role} buffer write ${index}`,
        `write-buffer:${role}:${write.offset}`,
      );
      lifecycleTransactions.push(transaction);
      nextOffset += write.length;
    }
    if (nextOffset !== program.executableLength) {
      throw new Error(`${role} buffer writes do not cover the full artifact.`);
    }
    const deploy = assertReportTransaction(
      program.deploy,
      `${role} Loader-v3 deployment`,
      `fresh-deploy:${role}`,
    );
    lifecycleTransactions.push(deploy);
    assertExactKeys(
      program.programReadback,
      FRESH_REPORT_PROGRAM_READBACK_KEYS,
      `${role} mutable Program readback`,
    );
    assertExactKeys(
      program.immutableProgramReadback,
      FRESH_REPORT_PROGRAM_READBACK_KEYS,
      `${role} immutable Program readback`,
    );
    for (const readback of [
      program.programReadback,
      program.immutableProgramReadback,
    ]) {
      positiveSafeInteger(
        readback.accountLamports,
        `${role} Program account lamports`,
      );
      if (readback.accountDataLength !== PROGRAM_ACCOUNT_LENGTH) {
        throw new Error(
          `${role} Program account readback length is not exact.`,
        );
      }
      normalizeHash(readback.accountDataSha256, `${role} Program account hash`);
    }
    if (
      program.programReadback.accountDataSha256 !==
        program.immutableProgramReadback.accountDataSha256 ||
      program.programReadback.accountLamports !==
        program.immutableProgramReadback.accountLamports
    ) {
      throw new Error(`${role} Program account identity changed after deploy.`);
    }
    assertProgramdataReportReadback({
      value: program.mutableProgramdataReadback,
      program,
      immutable: false,
      authorityAddress,
      deploymentSlot: deploy.finalizedSlot,
      label: `${role} mutable ProgramData readback`,
    });
    assertProgramdataReportReadback({
      value: program.immutableProgramdataReadback,
      program,
      immutable: true,
      authorityAddress,
      deploymentSlot: deploy.finalizedSlot,
      label: `${role} immutable ProgramData readback`,
    });
    assertRoleFinalization(
      program.immutableFinalization,
      program,
      atomicFinalization,
    );
  }
  if (artifactHashes.size !== 3 || codeHashes.size !== 3) {
    throw new Error(
      "Fresh deployment report aliases role-separated executable artifacts.",
    );
  }
  lifecycleTransactions.push(atomicFinalization);
  assertFreshReportResourcePreflight({
    value: report.resourcePreflight,
    programsByRole,
    atomicFinalization,
    payerAddress,
    minFinalizedSlot,
    expiresAtFinalizedSlot,
    lifecycleTransactions,
  });
  const signatures = lifecycleTransactions.map(({ signature: value }) => value);
  if (new Set(signatures).size !== signatures.length) {
    throw new Error(
      "Fresh deployment lifecycle reuses a transaction signature.",
    );
  }
  // This runtime waits for each receipt at finalized commitment before building
  // the next transaction. The public report has no transaction-index field, so
  // equal-slot actions are deliberately rejected instead of guessing their
  // intra-block order.
  for (let index = 0; index < lifecycleTransactions.length; index += 1) {
    const current = lifecycleTransactions[index];
    const previous = lifecycleTransactions[index - 1];
    if (
      current.finalizedSlot <= minFinalizedSlot ||
      current.finalizedSlot > expiresAtFinalizedSlot ||
      (previous && current.finalizedSlot <= previous.finalizedSlot)
    ) {
      throw new Error(
        "Fresh deployment lifecycle slots are not strictly ordered and context-bound.",
      );
    }
  }
  return deepFreeze({
    report,
    reportSha256,
    operationId: report.operationId,
    planSha256: report.planSha256,
    programsByRole,
    immutableFinalization: atomicFinalization,
  });
};

const exactInstructionMetas = (instruction, expected, label) => {
  const actual = instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
    pubkey: pubkey.toBase58(),
    isSigner: isSigner === true,
    isWritable: isWritable === true,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} account metas are not exact.`);
  }
};

const assertSystemCreateAccountInstruction = ({
  instruction,
  payerAddress,
  createdAddress,
  space,
  label,
}) => {
  const data = Buffer.from(instruction.data);
  if (
    instruction.programId.toBase58() !== SystemProgram.programId.toBase58() ||
    data.length !== 52 ||
    data.readUInt32LE(0) !== 0 ||
    data.readBigUInt64LE(4) <= 0n ||
    data.readBigUInt64LE(12) !== BigInt(space) ||
    new PublicKey(data.subarray(20, 52)).toBase58() !==
      SOLANA_UPGRADEABLE_LOADER_ID
  ) {
    throw new Error(`${label} System CreateAccount instruction is not exact.`);
  }
  exactInstructionMetas(
    instruction,
    [
      { pubkey: payerAddress, isSigner: true, isWritable: true },
      { pubkey: createdAddress, isSigner: true, isWritable: true },
    ],
    label,
  );
};

const assertLiveFreshTransactionSemantics = ({
  transaction,
  type,
  program,
  report,
  offset = null,
  length = null,
}) => {
  const instructions = transaction.instructions;
  const authority = report.temporaryDeploymentAuthorityAddress;
  if (type === "buffer-initialize") {
    if (instructions.length !== 2) {
      throw new Error(
        `${program.role} buffer creation must have two instructions.`,
      );
    }
    assertSystemCreateAccountInstruction({
      instruction: instructions[0],
      payerAddress: report.payerAddress,
      createdAddress: program.bufferAddress,
      space: SOLANA_BUFFER_METADATA_LENGTH + program.executableLength,
      label: `${program.role} buffer creation`,
    });
    const initialize = instructions[1];
    if (
      initialize.programId.toBase58() !== SOLANA_UPGRADEABLE_LOADER_ID ||
      !Buffer.from(initialize.data).equals(Buffer.from([0, 0, 0, 0]))
    ) {
      throw new Error(
        `${program.role} InitializeBuffer instruction is not exact.`,
      );
    }
    exactInstructionMetas(
      initialize,
      [
        { pubkey: program.bufferAddress, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: false, isWritable: false },
      ],
      `${program.role} InitializeBuffer`,
    );
    return;
  }
  if (type === "buffer-write") {
    if (instructions.length !== 1) {
      throw new Error(
        `${program.role} buffer write must have one instruction.`,
      );
    }
    const write = instructions[0];
    const data = Buffer.from(write.data);
    if (
      write.programId.toBase58() !== SOLANA_UPGRADEABLE_LOADER_ID ||
      data.length !== 16 + length ||
      data.readUInt32LE(0) !== 1 ||
      data.readUInt32LE(4) !== offset ||
      data.readBigUInt64LE(8) !== BigInt(length)
    ) {
      throw new Error(`${program.role} Loader-v3 write bytes are not exact.`);
    }
    exactInstructionMetas(
      write,
      [
        { pubkey: program.bufferAddress, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      `${program.role} Loader-v3 write`,
    );
    return;
  }
  if (type === "deploy") {
    if (instructions.length !== 2) {
      throw new Error(`${program.role} deploy must have two instructions.`);
    }
    assertSystemCreateAccountInstruction({
      instruction: instructions[0],
      payerAddress: report.payerAddress,
      createdAddress: program.programId,
      space: PROGRAM_ACCOUNT_LENGTH,
      label: `${program.role} Program creation`,
    });
    const deploy = instructions[1];
    const data = Buffer.from(deploy.data);
    if (
      deploy.programId.toBase58() !== SOLANA_UPGRADEABLE_LOADER_ID ||
      data.length !== 12 ||
      data.readUInt32LE(0) !== 2 ||
      data.readBigUInt64LE(4) !== BigInt(program.executableLength)
    ) {
      throw new Error(
        `${program.role} Loader-v3 deploy instruction is not exact.`,
      );
    }
    exactInstructionMetas(
      deploy,
      [
        { pubkey: report.payerAddress, isSigner: true, isWritable: true },
        {
          pubkey: program.programdataAddress,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: program.programId, isSigner: true, isWritable: true },
        { pubkey: program.bufferAddress, isSigner: false, isWritable: true },
        {
          pubkey: SYSVAR_RENT_PUBKEY.toBase58(),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SYSVAR_CLOCK_PUBKEY.toBase58(),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SystemProgram.programId.toBase58(),
          isSigner: false,
          isWritable: false,
        },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      `${program.role} Loader-v3 deploy`,
    );
    return;
  }
  if (type === "atomic-finalization") {
    if (instructions.length !== 3) {
      throw new Error("Atomic authority removal must have three instructions.");
    }
    for (const [
      index,
      role,
    ] of SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.entries()) {
      const instruction = instructions[index];
      const target = report.programs.find((entry) => entry.role === role);
      if (
        instruction.programId.toBase58() !== SOLANA_UPGRADEABLE_LOADER_ID ||
        !Buffer.from(instruction.data).equals(Buffer.from([4, 0, 0, 0]))
      ) {
        throw new Error(`${role} live SetAuthority(None) is not exact.`);
      }
      exactInstructionMetas(
        instruction,
        [
          {
            pubkey: target.programdataAddress,
            isSigner: false,
            isWritable: true,
          },
          { pubkey: authority, isSigner: true, isWritable: false },
        ],
        `${role} live SetAuthority(None)`,
      );
    }
    return;
  }
  throw new Error("Fresh deployment transaction role is unsupported.");
};

const freshReportLifecycleTransactions = (normalizedReport) => {
  const entries = [];
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    const program = normalizedReport.programsByRole[role];
    entries.push({
      type: "buffer-initialize",
      program,
      expected: program.buffer.initialize,
    });
    for (const write of program.buffer.writes) {
      entries.push({
        type: "buffer-write",
        program,
        offset: write.offset,
        length: write.length,
        expected: write.transaction,
      });
    }
    entries.push({ type: "deploy", program, expected: program.deploy });
  }
  entries.push({
    type: "atomic-finalization",
    program: null,
    expected: normalizedReport.immutableFinalization,
  });
  return entries;
};

/** Replays every report signature against finalized RPC transaction bytes. */
export const verifySolanaLoaderV3FreshDeployReportTransactions = async (
  connection,
  normalizedReport,
  { getTransaction = null, readAccount = null } = {},
) => {
  if (!connection || !normalizedReport?.report) {
    throw new Error(
      "Fresh deployment report transaction verification requires a connection and validated report.",
    );
  }
  const fetchTransaction =
    getTransaction ??
    ((signature) =>
      connection.getTransaction(signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      }));
  const verified = [];
  for (const entry of freshReportLifecycleTransactions(normalizedReport)) {
    const expected = entry.expected;
    const result = await fetchTransaction(expected.signature);
    const message = result?.transaction?.message;
    if (
      !result ||
      result.slot !== expected.finalizedSlot ||
      result.meta?.err !== null ||
      result.meta?.fee !== expected.feeLamports ||
      JSON.stringify(result.transaction?.signatures) !==
        JSON.stringify(expected.signatures) ||
      !message ||
      typeof message.serialize !== "function" ||
      solanaSha256(Buffer.from(message.serialize())) !== expected.messageSha256
    ) {
      throw new Error(
        `${expected.stage} finalized transaction readback differs from the fresh report.`,
      );
    }
    let transaction;
    try {
      transaction = Transaction.populate(message, expected.signatures);
    } catch {
      throw new Error(`${expected.stage} finalized message cannot be decoded.`);
    }
    const reconstructedInstructions =
      transaction.instructions.map(instructionSummary);
    const messageAccountKeys = Array.isArray(message.accountKeys)
      ? message.accountKeys.map((key) => key.toBase58())
      : [];
    const payerIndex = messageAccountKeys.indexOf(
      normalizedReport.report.payerAddress,
    );
    if (
      verified.length === 0 &&
      (payerIndex < 0 ||
        !Array.isArray(result.meta?.preBalances) ||
        !Number.isSafeInteger(result.meta.preBalances[payerIndex]) ||
        result.meta.preBalances[payerIndex] !==
          normalizedReport.report.resourcePreflight.payerBalanceLamports)
    ) {
      throw new Error(
        "Fresh deployment payer pre-mutation balance differs from its resource preflight.",
      );
    }
    const wireComparable = (instruction) => ({
      programId: instruction.programId,
      dataLength: instruction.dataLength,
      dataSha256: instruction.dataSha256,
      dataHex: instruction.dataHex,
      metaPubkeys: instruction.metas.map(({ pubkey }) => pubkey),
    });
    if (
      transaction.feePayer?.toBase58() !==
        normalizedReport.report.payerAddress ||
      transaction.recentBlockhash !== expected.blockhash ||
      JSON.stringify(reconstructedInstructions.map(wireComparable)) !==
        JSON.stringify(expected.instructions.map(wireComparable))
    ) {
      throw new Error(
        `${expected.stage} finalized instruction bytes differ from the fresh report.`,
      );
    }
    assertLiveFreshTransactionSemantics({
      transaction,
      type: entry.type,
      program: entry.program,
      report: normalizedReport.report,
      offset: entry.offset,
      length: entry.length,
    });
    verified.push({
      stage: expected.stage,
      signature: expected.signature,
      finalizedSlot: expected.finalizedSlot,
      messageSha256: expected.messageSha256,
    });
  }
  const fetchAccount =
    readAccount ??
    ((args) =>
      defaultReadAccount({
        connection,
        address: args.address,
        minContextSlot: args.minContextSlot,
      }));
  const verifiedAccounts = [];
  const finalizationSlot = normalizedReport.immutableFinalization.finalizedSlot;
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    const program = normalizedReport.programsByRole[role];
    const programAccount = normalizeAccount(
      await fetchAccount({
        connection,
        address: program.programId,
        minContextSlot: finalizationSlot,
        label: `${role} live immutable Program`,
        allowMissing: false,
      }),
      program.programId,
      `${role} live immutable Program`,
      finalizationSlot,
      false,
    );
    const programdataAccount = normalizeAccount(
      await fetchAccount({
        connection,
        address: program.programdataAddress,
        minContextSlot: finalizationSlot,
        label: `${role} live immutable ProgramData`,
        allowMissing: false,
      }),
      program.programdataAddress,
      `${role} live immutable ProgramData`,
      finalizationSlot,
      false,
    );
    const expectedProgram = program.immutableProgramReadback;
    const expectedProgramdata = program.immutableProgramdataReadback;
    const programdataBytes = programdataAccount.data;
    if (
      programAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
      !programAccount.executable ||
      programAccount.lamports !== expectedProgram.accountLamports ||
      programAccount.data.length !== expectedProgram.accountDataLength ||
      solanaSha256(programAccount.data) !== expectedProgram.accountDataSha256 ||
      programAccount.data.readUInt32LE(0) !== 2 ||
      new PublicKey(programAccount.data.subarray(4, 36)).toBase58() !==
        program.programdataAddress ||
      programdataAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
      programdataAccount.executable ||
      programdataAccount.lamports !== expectedProgramdata.accountLamports ||
      programdataBytes.length !== expectedProgramdata.accountDataLength ||
      solanaSha256(programdataBytes) !==
        expectedProgramdata.accountDataSha256 ||
      programdataBytes.readUInt32LE(0) !== 3 ||
      programdataBytes.readBigUInt64LE(4) !==
        BigInt(expectedProgramdata.deploymentSlot) ||
      programdataBytes[12] !== 0 ||
      solanaSha256(
        programdataBytes.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH),
      ) !== program.artifactSha256 ||
      solanaBlake2b256(
        programdataBytes.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH),
      ) !== program.codeHash
    ) {
      throw new Error(
        `${role} live immutable Program/ProgramData state differs from the fresh report.`,
      );
    }
    verifiedAccounts.push({
      role,
      programId: program.programId,
      programdataAddress: program.programdataAddress,
      programLamports: programAccount.lamports,
      programdataLamports: programdataAccount.lamports,
      contextSlot: Math.min(
        programAccount.contextSlot,
        programdataAccount.contextSlot,
      ),
    });
  }
  return deepFreeze({
    ready: true,
    reportSha256: normalizedReport.reportSha256,
    transactionCount: verified.length,
    transactions: verified,
    accountCount: verifiedAccounts.length * 2,
    accounts: verifiedAccounts,
  });
};

const assertFreshSbfEvidenceForProgram = ({
  program,
  evidence,
  evidenceBytes = null,
}) => {
  const canonical =
    canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes(evidence);
  if (
    evidenceBytes !== null &&
    (!(evidenceBytes instanceof Uint8Array) ||
      !Buffer.from(evidenceBytes).equals(canonical))
  ) {
    throw new Error(
      `${program.role} structural-validation evidence bytes are not canonical.`,
    );
  }
  const provenanceHashesValid = [
    evidence.helperBinarySha256,
    evidence.validatorSourceBundleSha256,
    evidence.cargoLockSha256,
    evidence.rustcIdentitySha256,
  ].every(
    (value) => typeof value === "string" && /^0x[0-9a-f]{64}$/u.test(value),
  );
  const rustcIdentityValid =
    typeof evidence.rustcIdentity === "string" &&
    evidence.rustcIdentity.length >= 32 &&
    evidence.rustcIdentity.length <= 2048 &&
    /^[\x20-\x7e]+$/u.test(evidence.rustcIdentity) &&
    solanaSha256(Buffer.from(evidence.rustcIdentity, "utf8")) ===
      evidence.rustcIdentitySha256;
  if (
    evidence.schema !== SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_EVIDENCE_SCHEMA ||
    evidence.valid !== true ||
    evidence.deterministic !== true ||
    evidence.validationScope !== SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_SCOPE ||
    evidence.exactClusterAdmission !== false ||
    evidence.productionEligible !== true ||
    evidence.sbpfVersion !== SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE ||
    evidence.validatorId !== SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID ||
    evidence.validatorVersion !==
      SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION ||
    evidence.policySha256 !==
      SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256 ||
    evidence.artifactSha256 !== program.artifactSha256 ||
    evidence.codeHash !== program.codeHash ||
    evidence.executableLength !== program.executableLength ||
    !provenanceHashesValid ||
    !/^x86_64-unknown-linux-(?:gnu|musl)$/u.test(
      evidence.helperTargetTriple ?? "",
    ) ||
    evidence.jitOutcome !== "compiled" ||
    evidence.buildProfile !== "release" ||
    !rustcIdentityValid ||
    evidence.resourceLimits !== "unix-rlimit-v1" ||
    JSON.stringify(evidence.checks) !==
      JSON.stringify(SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS) ||
    solanaSha256(canonical) !== program.sbfValidationEvidenceSha256 ||
    solanaSha256(program.artifact) !== program.artifactSha256 ||
    solanaBlake2b256(program.artifact) !== program.codeHash
  ) {
    throw new Error(
      `${program.role} structural-validation evidence is not the governance-pinned production result.`,
    );
  }
  return { evidence, bytes: canonical };
};

/**
 * Builds the exact public review bytes without creating or persisting signers.
 * All addresses, artifact hashes, evidence hashes, and cluster context must be
 * supplied independently by the caller.
 */
export const buildSolanaLoaderV3FreshDeployPlan = ({
  operationId,
  payerAddress,
  deploymentAuthorityAddress,
  publicSignerIdsByRole,
  artifactBytesByRole,
  sbfValidationEvidenceBytesByRole,
  expectedArtifactSha256ByRole,
  expectedSbfValidationEvidenceSha256ByRole,
  reviewedContext,
} = {}) => {
  for (const [value, label] of [
    [publicSignerIdsByRole, "Fresh deployment public signer ids"],
    [artifactBytesByRole, "Fresh deployment artifact bytes"],
    [sbfValidationEvidenceBytesByRole, "Fresh deployment SBF evidence bytes"],
    [expectedArtifactSha256ByRole, "Reviewed artifact SHA-256 pins"],
    [
      expectedSbfValidationEvidenceSha256ByRole,
      "Reviewed SBF evidence SHA-256 pins",
    ],
  ]) {
    assertExactKeys(value, new Set(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER), label);
  }
  assertExactKeys(
    reviewedContext,
    FRESH_PLAN_BUILDER_CONTEXT_KEYS,
    "Fresh deployment reviewed cluster context",
  );
  const finalizedSlot = positiveSafeInteger(
    reviewedContext.finalizedSlot,
    "Reviewed finalized slot",
  );
  const expiresAtFinalizedSlot = positiveSafeInteger(
    reviewedContext.expiresAtFinalizedSlot,
    "Reviewed expiry finalized slot",
  );
  const activationSlot = positiveSafeInteger(
    reviewedContext.sbpfV3EnableFeatureActivationSlot,
    "Reviewed SBPF V3 feature activation slot",
  );
  if (
    expiresAtFinalizedSlot <= finalizedSlot ||
    activationSlot > finalizedSlot
  ) {
    throw new Error(
      "Fresh deployment reviewed cluster context is stale or not yet active.",
    );
  }
  if (
    reviewedContext.network !== SOLANA_TESTNET_NETWORK ||
    reviewedContext.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
    reviewedContext.sbpfV3EnableFeatureId !== SOLANA_SBPF_V3_ENABLE_FEATURE_ID
  ) {
    throw new Error(
      "Fresh deployment reviewed context must pin canonical Solana testnet and SBPF V3.",
    );
  }
  const programs = SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => {
    const signerIds = publicSignerIdsByRole[role];
    assertExactKeys(
      signerIds,
      FRESH_PLAN_BUILDER_PUBLIC_SIGNER_KEYS,
      `${role} public signer ids`,
    );
    const programId = normalizePublicKey(
      signerIds.programId,
      `${role} Program id`,
    );
    const bufferAddress = normalizePublicKey(
      signerIds.bufferAddress,
      `${role} buffer address`,
    );
    const artifact = assertSbfElf(
      artifactBytesByRole[role],
      `${role} artifact`,
    );
    const artifactSha256 = solanaSha256(artifact);
    const expectedArtifactSha256 = normalizeHash(
      expectedArtifactSha256ByRole[role],
      `${role} reviewed artifact SHA-256`,
    );
    if (artifactSha256 !== expectedArtifactSha256) {
      throw new Error(
        `${role} artifact bytes do not match the independently reviewed SHA-256.`,
      );
    }
    const evidenceBytes = sbfValidationEvidenceBytesByRole[role];
    if (!(evidenceBytes instanceof Uint8Array)) {
      throw new Error(`${role} SBF validation evidence must be exact bytes.`);
    }
    const evidenceSha256 = solanaSha256(evidenceBytes);
    if (
      evidenceSha256 !==
      normalizeHash(
        expectedSbfValidationEvidenceSha256ByRole[role],
        `${role} reviewed SBF evidence SHA-256`,
      )
    ) {
      throw new Error(
        `${role} SBF evidence bytes do not match the independently reviewed SHA-256.`,
      );
    }
    const entry = {
      role,
      programId,
      programdataAddress: deriveProgramdataAddress(programId),
      bufferAddress,
      artifactSha256,
      executableSha256: artifactSha256,
      codeHash: solanaBlake2b256(artifact),
      executableLength: artifact.length,
      maxDataLength: artifact.length,
      sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
      sbfValidatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256:
        SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: evidenceSha256,
    };
    const evidence = strictJsonFromBytes(
      evidenceBytes,
      `${role} SBF validation evidence`,
    );
    assertFreshSbfEvidenceForProgram({
      program: { ...entry, artifact },
      evidence,
      evidenceBytes,
    });
    return entry;
  });
  const plan = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA,
    operationId: normalizeHash(operationId, "Deployment operation id"),
    network: reviewedContext.network,
    genesisHash: reviewedContext.genesisHash,
    payerAddress: normalizePublicKey(payerAddress, "Runtime payer"),
    deploymentAuthorityAddress: normalizePublicKey(
      deploymentAuthorityAddress,
      "Temporary deployment authority",
    ),
    context: {
      minFinalizedSlot: finalizedSlot,
      expiresAtFinalizedSlot,
      solanaCoreVersion: normalizeLabel(
        reviewedContext.solanaCoreVersion,
        "Reviewed Solana core version",
      ),
      featureSet: positiveSafeInteger(
        reviewedContext.featureSet,
        "Reviewed Solana feature set",
      ),
      sbpfV3EnableFeatureId: reviewedContext.sbpfV3EnableFeatureId,
      sbpfV3EnableFeatureActivationSlot: activationSlot,
      sbpfV3EnableFeatureAccountDataSha256: normalizeHash(
        reviewedContext.sbpfV3EnableFeatureAccountDataSha256,
        "Reviewed SBPF V3 feature account-data SHA-256",
      ),
    },
    policy: {
      maxPacketBytes: SOLANA_PACKET_DATA_SIZE,
      automaticMutationRetries: 0,
      runtimeOnlySigners: true,
      freshProgramsOnly: true,
      immutableAfterDeployment: true,
      exactProgramCount: 3,
      finalizationOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
    },
    programs,
  };
  const planBytes = canonicalSolanaLoaderV3FreshDeployPlanBytes(plan);
  const planSha256 = solanaSha256(planBytes);
  validateSolanaLoaderV3FreshDeployPlan({
    planBytes,
    expectedPlanSha256: planSha256,
    artifactBytesByRole,
  });
  const confirmationTemplate = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
    action: "fresh-deploy-exact-immutable-solana-sccp-programs",
    submit: false,
    irreversible: true,
    operationId: plan.operationId,
    planSha256,
    network: plan.network,
    genesisHash: plan.genesisHash,
    programIds: Object.fromEntries(
      programs.map(({ role, programId }) => [role, programId]),
    ),
    acknowledgePermanentProgramIds: false,
    acknowledgeOneWayAuthorityRevocation: false,
  };
  return Object.freeze({
    plan: deepFreeze(plan),
    planBytes,
    planSha256,
    confirmationTemplate: deepFreeze(confirmationTemplate),
  });
};

/**
 * Validates only immutable reviewed inputs. It performs no RPC calls and
 * accepts artifacts by role rather than by path.
 */
export const validateSolanaLoaderV3FreshDeployPlan = ({
  planBytes,
  expectedPlanSha256,
  artifactBytesByRole,
} = {}) => {
  if (!(planBytes instanceof Uint8Array)) {
    throw new Error("Reviewed fresh deployment plan must be exact bytes.");
  }
  const bytes = Buffer.from(planBytes);
  const planSha256 = solanaSha256(bytes);
  if (
    planSha256 !==
    normalizeHash(expectedPlanSha256, "Expected fresh deployment plan SHA-256")
  ) {
    throw new Error(
      "Fresh deployment plan bytes do not match the independently supplied SHA-256.",
    );
  }
  const plan = strictJsonFromBytes(bytes, "Reviewed fresh deployment plan");
  assertPlanShape(plan);
  if (!bytes.equals(canonicalSolanaLoaderV3FreshDeployPlanBytes(plan))) {
    throw new Error("Fresh deployment plan is not canonical JSON.");
  }
  if (plan.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA) {
    throw new Error("Fresh deployment plan schema is unsupported.");
  }
  const operationId = normalizeHash(
    plan.operationId,
    "Deployment operation id",
  );
  if (
    plan.network !== SOLANA_TESTNET_NETWORK ||
    plan.genesisHash !== SOLANA_TESTNET_GENESIS_HASH
  ) {
    throw new Error("Fresh deployment plan must pin canonical Solana testnet.");
  }
  const payerAddress = normalizePublicKey(plan.payerAddress, "Runtime payer");
  const authorityAddress = normalizePublicKey(
    plan.deploymentAuthorityAddress,
    "Temporary deployment authority",
  );
  if (payerAddress === authorityAddress) {
    throw new Error("Runtime payer and temporary authority must be distinct.");
  }
  const minFinalizedSlot = positiveSafeInteger(
    plan.context.minFinalizedSlot,
    "Minimum finalized slot",
  );
  const expiresAtFinalizedSlot = positiveSafeInteger(
    plan.context.expiresAtFinalizedSlot,
    "Expiry finalized slot",
  );
  if (expiresAtFinalizedSlot <= minFinalizedSlot) {
    throw new Error("Fresh deployment expiry must follow its context floor.");
  }
  const solanaCoreVersion = normalizeLabel(
    plan.context.solanaCoreVersion,
    "Solana core version",
  );
  const featureSet = positiveSafeInteger(
    plan.context.featureSet,
    "Solana feature set",
  );
  if (plan.context.sbpfV3EnableFeatureId !== SOLANA_SBPF_V3_ENABLE_FEATURE_ID) {
    throw new Error(
      "Fresh deployment plan must pin the SBPF V3 enable feature.",
    );
  }
  const sbpfV3EnableFeatureActivationSlot = positiveSafeInteger(
    plan.context.sbpfV3EnableFeatureActivationSlot,
    "SBPF V3 enable feature activation slot",
  );
  const sbpfV3EnableFeatureAccountDataSha256 = normalizeHash(
    plan.context.sbpfV3EnableFeatureAccountDataSha256,
    "SBPF V3 enable feature account-data SHA-256",
  );
  if (
    plan.policy.maxPacketBytes !== SOLANA_PACKET_DATA_SIZE ||
    plan.policy.automaticMutationRetries !== 0 ||
    plan.policy.runtimeOnlySigners !== true ||
    plan.policy.freshProgramsOnly !== true ||
    plan.policy.immutableAfterDeployment !== true ||
    plan.policy.exactProgramCount !== 3 ||
    JSON.stringify(plan.policy.finalizationOrder) !==
      JSON.stringify(SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER)
  ) {
    throw new Error(
      "Fresh deployment policy is not the exact immutable policy.",
    );
  }
  if (
    JSON.stringify(plan.programs.map(({ role }) => role)) !==
    JSON.stringify(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER)
  ) {
    throw new Error(
      "Fresh deployment programs are not in canonical role order.",
    );
  }
  if (!isRecord(artifactBytesByRole)) {
    throw new Error(
      "Exact executable bytes must be supplied by canonical role.",
    );
  }
  assertExactKeys(
    artifactBytesByRole,
    new Set(SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER),
    "Executable bytes by role",
  );
  const seenAddresses = new Map();
  const reserve = (address, label) => {
    const previous = seenAddresses.get(address);
    if (previous) {
      throw new Error(
        `${label} aliases ${previous}; every runtime identity must differ.`,
      );
    }
    seenAddresses.set(address, label);
  };
  reserve(payerAddress, "Runtime payer");
  reserve(authorityAddress, "Temporary deployment authority");
  const programs = plan.programs.map((entry) => {
    const role = entry.role;
    const programId = normalizePublicKey(entry.programId, `${role} Program id`);
    const programdataAddress = normalizePublicKey(
      entry.programdataAddress,
      `${role} ProgramData address`,
    );
    const bufferAddress = normalizePublicKey(
      entry.bufferAddress,
      `${role} buffer address`,
    );
    if (deriveProgramdataAddress(programId) !== programdataAddress) {
      throw new Error(
        `${role} ProgramData is not the canonical Loader-v3 PDA.`,
      );
    }
    reserve(programId, `${role} Program`);
    reserve(programdataAddress, `${role} ProgramData`);
    reserve(bufferAddress, `${role} buffer`);
    const artifact = assertSbfElf(
      artifactBytesByRole[role],
      `${role} artifact`,
    );
    const artifactSha256 = solanaSha256(artifact);
    const codeHash = solanaBlake2b256(artifact);
    for (const [value, label] of [
      [entry.artifactSha256, `${role} artifact SHA-256`],
      [entry.executableSha256, `${role} executable SHA-256`],
    ]) {
      if (normalizeHash(value, label) !== artifactSha256) {
        throw new Error(`${label} does not match exact artifact bytes.`);
      }
    }
    if (normalizeHash(entry.codeHash, `${role} code hash`) !== codeHash) {
      throw new Error(`${role} code hash does not match exact artifact bytes.`);
    }
    if (
      positiveSafeInteger(
        entry.executableLength,
        `${role} executable length`,
      ) !== artifact.length ||
      entry.maxDataLength !== artifact.length
    ) {
      throw new Error(
        `${role} deployment must allocate exactly the artifact length.`,
      );
    }
    if (
      entry.sbpfVersion !== SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE ||
      normalizeLabel(entry.sbfValidatorId, `${role} SBF validator id`) !==
        SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID ||
      normalizeLabel(
        entry.sbfValidatorVersion,
        `${role} SBF validator version`,
      ) !== SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION ||
      normalizeHash(
        entry.sbfValidationPolicySha256,
        `${role} SBF validation policy SHA-256`,
      ) !== SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256
    ) {
      throw new Error(
        `${role} does not pin the production structural validator.`,
      );
    }
    normalizeHash(
      entry.sbfValidationEvidenceSha256,
      `${role} SBF validation evidence SHA-256`,
    );
    return Object.freeze({
      role,
      programId,
      programdataAddress,
      bufferAddress,
      artifact,
      artifactSha256,
      codeHash,
      executableLength: artifact.length,
      maxDataLength: artifact.length,
      sbfValidationEvidenceSha256: entry.sbfValidationEvidenceSha256,
    });
  });
  assertDistinctFreshDeployProgramArtifacts(programs);
  return Object.freeze({
    planSha256,
    operationId,
    payerAddress,
    authorityAddress,
    minFinalizedSlot,
    expiresAtFinalizedSlot,
    solanaCoreVersion,
    featureSet,
    sbpfV3EnableFeatureActivationSlot,
    sbpfV3EnableFeatureAccountDataSha256,
    programs: Object.freeze(programs),
  });
};

const assertExactConfirmation = (confirmation, normalized) => {
  assertExactKeys(
    confirmation,
    CONFIRMATION_KEYS,
    "Irreversible fresh deployment confirmation",
  );
  assertExactKeys(
    confirmation.programIds,
    CONFIRMATION_PROGRAM_KEYS,
    "Confirmed permanent program ids",
  );
  const expectedIds = Object.fromEntries(
    normalized.programs.map(({ role, programId }) => [role, programId]),
  );
  if (
    confirmation.schema !== SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA ||
    confirmation.action !==
      "fresh-deploy-exact-immutable-solana-sccp-programs" ||
    confirmation.submit !== true ||
    confirmation.irreversible !== true ||
    confirmation.operationId !== normalized.operationId ||
    confirmation.planSha256 !== normalized.planSha256 ||
    confirmation.network !== SOLANA_TESTNET_NETWORK ||
    confirmation.genesisHash !== SOLANA_TESTNET_GENESIS_HASH ||
    JSON.stringify(confirmation.programIds) !== JSON.stringify(expectedIds) ||
    confirmation.acknowledgePermanentProgramIds !== true ||
    confirmation.acknowledgeOneWayAuthorityRevocation !== true
  ) {
    throw new Error(
      "Exact irreversible fresh three-program deployment confirmation is required.",
    );
  }
};

const u32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value, 0);
  return bytes;
};

/** Loader-v3 SetAuthority with no new authority (permanent immutability). */
export const buildLoaderV3SetAuthorityNoneInstruction = ({
  programdataAddress,
  authorityAddress,
} = {}) =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      {
        pubkey: new PublicKey(programdataAddress),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(authorityAddress),
        isSigner: true,
        isWritable: false,
      },
    ],
    data: u32(4),
  });

const base58Encode = (input) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = Buffer.from(input);
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1;
  const body = digits
    .reverse()
    .map((digit) => alphabet[digit])
    .join("");
  return `${"1".repeat(zeroes)}${zeroes === bytes.length ? "" : body}`;
};

const uniqueSigners = (signers) => {
  const unique = new Map();
  for (const signer of signers) {
    const address = signer?.publicKey?.toBase58?.();
    if (!address) throw new Error("Runtime signer is malformed.");
    if (!unique.has(address)) unique.set(address, signer);
  }
  return [...unique.values()];
};

const normalizeBlockhashContext = (result, minimumSlot, expirySlot) => {
  const contextSlot = result?.context?.slot;
  const value = result?.value;
  if (
    !Number.isSafeInteger(contextSlot) ||
    contextSlot < minimumSlot ||
    contextSlot > expirySlot ||
    typeof value?.blockhash !== "string" ||
    !value.blockhash ||
    !Number.isSafeInteger(value.lastValidBlockHeight) ||
    value.lastValidBlockHeight <= 0
  ) {
    throw new Error("Fresh finalized blockhash context is stale or malformed.");
  }
  return {
    contextSlot,
    blockhash: value.blockhash,
    lastValidBlockHeight: value.lastValidBlockHeight,
  };
};

const buildSignedTransaction = ({
  instructions,
  payerSigner,
  signers,
  blockhash,
}) => {
  const transaction = new Transaction({
    feePayer: payerSigner.publicKey,
    recentBlockhash: blockhash.blockhash,
  });
  transaction.add(...instructions);
  transaction.sign(...uniqueSigners([payerSigner, ...signers]));
  const raw = transaction.serialize({
    requireAllSignatures: true,
    verifySignatures: true,
  });
  if (raw.length > SOLANA_PACKET_DATA_SIZE) {
    throw new Error(
      "Signed transaction exceeds the canonical Solana packet limit.",
    );
  }
  const signatures = transaction.signatures.map(({ signature }) => {
    if (!signature)
      throw new Error("Signed transaction has a missing signature.");
    return base58Encode(signature);
  });
  const messageBytes = Buffer.from(transaction.serializeMessage());
  return {
    transaction,
    raw,
    signatures,
    primarySignature: signatures[0],
    messageSha256: solanaSha256(messageBytes),
    packetSha256: solanaSha256(raw),
    packetLength: raw.length,
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  };
};

const compactU16Length = (value) => {
  nonnegativeSafeInteger(value, "Compact-u16 value");
  let remaining = value;
  let length = 0;
  do {
    length += 1;
    remaining = Math.floor(remaining / 128);
  } while (remaining > 0);
  return length;
};

const buildUnsignedTransactionPlan = ({
  instructions,
  payerAddress,
  blockhash,
}) => {
  const transaction = new Transaction({
    feePayer: new PublicKey(payerAddress),
    recentBlockhash: blockhash,
  });
  transaction.add(...instructions);
  const message = transaction.compileMessage();
  const requiredSignatureCount = positiveSafeInteger(
    message.header.numRequiredSignatures,
    "Planned transaction required-signature count",
  );
  const packetLength = addSafeIntegers(
    [
      compactU16Length(requiredSignatureCount),
      requiredSignatureCount * 64,
      message.serialize().length,
    ],
    "Planned transaction packet length",
  );
  return { message, packetLength, requiredSignatureCount };
};

const planPacketSafeWriteChunks = ({
  program,
  payerAddress,
  authorityAddress,
  blockhash,
}) => {
  const chunks = [];
  let offset = 0;
  while (offset < program.executableLength) {
    const remaining = program.artifact.subarray(offset);
    let low = 1;
    let high = Math.min(remaining.length, SOLANA_PACKET_DATA_SIZE);
    let selected = null;
    while (low <= high) {
      const length = Math.floor((low + high) / 2);
      const instruction = buildLoaderV3WriteInstruction({
        bufferAddress: program.bufferAddress,
        authorityAddress,
        offset,
        bytes: remaining.subarray(0, length),
      });
      const actual = buildUnsignedTransactionPlan({
        instructions: [instruction],
        payerAddress,
        blockhash,
      });
      const sentinel = buildUnsignedTransactionPlan({
        instructions: [
          instruction,
          buildLoaderV3InvalidRollbackSentinelInstruction(),
        ],
        payerAddress,
        blockhash,
      });
      if (
        actual.packetLength <= SOLANA_PACKET_DATA_SIZE &&
        sentinel.packetLength <= SOLANA_PACKET_DATA_SIZE
      ) {
        selected = {
          offset,
          length,
          instruction,
          packetLength: actual.packetLength,
          sentinelPacketLength: sentinel.packetLength,
          requiredSignatureCount: actual.requiredSignatureCount,
        };
        low = length + 1;
      } else {
        high = length - 1;
      }
    }
    if (!selected) {
      throw new Error(
        `${program.role} has no packet-safe non-empty preflight write chunk.`,
      );
    }
    chunks.push(selected);
    offset += selected.length;
  }
  return chunks;
};

const instructionSummary = (instruction) => {
  const data = Buffer.from(instruction.data);
  return {
    programId: instruction.programId.toBase58(),
    dataLength: data.length,
    dataSha256: solanaSha256(data),
    dataHex: data.length <= 64 ? `0x${data.toString("hex")}` : null,
    metas: instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner: isSigner === true,
      isWritable: isWritable === true,
    })),
  };
};

const publicIntent = (built) => ({
  expectedSignature: built.primarySignature,
  expectedSignatures: [...built.signatures],
  blockhash: built.blockhash,
  lastValidBlockHeight: built.lastValidBlockHeight,
  messageSha256: built.messageSha256,
  packetSha256: built.packetSha256,
  packetLength: built.packetLength,
});

const messageBytesFromReadback = (readback) => {
  const message = readback?.transaction?.message;
  if (!message || typeof message.serialize !== "function") {
    throw new Error("Finalized transaction message readback is missing.");
  }
  return Buffer.from(message.serialize());
};

const defaultBroadcastFinalized = async ({
  connection,
  rawTransaction,
  expectedSignature,
  blockhash,
  lastValidBlockHeight,
  sleep,
}) => {
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    maxRetries: 0,
  });
  if (signature !== expectedSignature) {
    throw new Error("RPC signature differs from locally signed transaction.");
  }
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "finalized",
  );
  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  let transactionReadback = null;
  for (let index = 0; index < 8 && !transactionReadback; index += 1) {
    transactionReadback = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!transactionReadback && index < 7) await sleep(250);
  }
  return {
    signature,
    confirmation,
    signatureStatus: statuses?.value?.[0] ?? null,
    transactionReadback,
  };
};

const verifyFinalizedTransaction = ({ built, submitted, stage }) => {
  const status = submitted?.signatureStatus;
  const readback = submitted?.transactionReadback;
  const fetchedSignatures = readback?.transaction?.signatures;
  if (
    submitted?.signature !== built.primarySignature ||
    submitted?.confirmation?.value?.err !== null ||
    !status ||
    status.err !== null ||
    status.confirmationStatus !== "finalized" ||
    !Number.isSafeInteger(status.slot) ||
    status.slot <= 0 ||
    readback?.slot !== status.slot ||
    !isRecord(readback?.meta) ||
    readback.meta.err !== null ||
    !Number.isSafeInteger(readback.meta.fee) ||
    readback.meta.fee <= 0 ||
    !Array.isArray(fetchedSignatures) ||
    JSON.stringify(fetchedSignatures) !== JSON.stringify(built.signatures) ||
    solanaSha256(messageBytesFromReadback(readback)) !== built.messageSha256
  ) {
    throw new Error(
      `${stage} finalized signature/message readback is not exact.`,
    );
  }
  return {
    stage,
    signature: built.primarySignature,
    signatures: [...built.signatures],
    feeLamports: readback.meta.fee,
    finalizedSlot: status.slot,
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    messageSha256: built.messageSha256,
    packetSha256: built.packetSha256,
    packetLength: built.packetLength,
    instructions: built.transaction.instructions.map(instructionSummary),
  };
};

const defaultReadAccount = ({ connection, address, minContextSlot }) =>
  connection.getAccountInfoAndContext(new PublicKey(address), {
    commitment: "finalized",
    minContextSlot,
  });

const normalizeAccount = (
  result,
  address,
  label,
  minContextSlot,
  allowMissing,
) => {
  const contextSlot = result?.context?.slot;
  if (!Number.isSafeInteger(contextSlot) || contextSlot < minContextSlot) {
    throw new Error(`${label} finalized readback is stale or malformed.`);
  }
  if (!result.value) {
    if (allowMissing) return null;
    throw new Error(`${label} is missing from finalized state.`);
  }
  const info = result.value;
  const owner =
    typeof info.owner === "string" ? info.owner : info.owner?.toBase58?.();
  if (
    typeof owner !== "string" ||
    !(info.data instanceof Uint8Array) ||
    !Number.isSafeInteger(info.lamports) ||
    info.lamports < 0
  ) {
    throw new Error(`${label} account readback is malformed.`);
  }
  return {
    address,
    contextSlot,
    owner,
    executable: info.executable === true,
    lamports: info.lamports,
    data: Buffer.from(info.data),
  };
};

const accountFingerprint = (account) =>
  account === null
    ? { exists: false }
    : {
        exists: true,
        owner: account.owner,
        executable: account.executable,
        lamports: account.lamports,
        dataLength: account.data.length,
        dataSha256: solanaSha256(account.data),
      };

const readFingerprintMap = async ({
  connection,
  addresses,
  minContextSlot,
  readAccount,
  expirySlot,
}) => {
  const map = {};
  for (const address of addresses) {
    const raw = await readAccount({
      connection,
      address,
      minContextSlot,
      allowMissing: true,
      label: `Rollback snapshot ${address}`,
    });
    const account = normalizeAccount(
      raw,
      address,
      `Rollback snapshot ${address}`,
      minContextSlot,
      true,
    );
    if (account && account.contextSlot > expirySlot) {
      throw new Error("Rollback snapshot exceeds the reviewed expiry slot.");
    }
    map[address] = accountFingerprint(account);
  }
  return map;
};

const parseBuffer = (account, authorityAddress, artifactLength) => {
  if (
    account.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
    account.executable ||
    account.data.length !== SOLANA_BUFFER_METADATA_LENGTH + artifactLength ||
    account.data.readUInt32LE(0) !== 1 ||
    account.data[4] !== 1 ||
    new PublicKey(account.data.subarray(5, 37)).toBase58() !== authorityAddress
  ) {
    throw new Error("Finalized Loader-v3 buffer state is not exact.");
  }
  return Buffer.from(account.data.subarray(SOLANA_BUFFER_METADATA_LENGTH));
};

const parseProgramAccount = (account, expectedProgramdataAddress) => {
  if (
    account.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
    !account.executable ||
    account.data.length !== PROGRAM_ACCOUNT_LENGTH ||
    account.data.readUInt32LE(0) !== 2 ||
    new PublicKey(account.data.subarray(4, 36)).toBase58() !==
      expectedProgramdataAddress
  ) {
    throw new Error("Finalized Loader-v3 Program account is not exact.");
  }
  return {
    accountLamports: account.lamports,
    accountDataSha256: solanaSha256(account.data),
    accountDataLength: account.data.length,
  };
};

const parseProgramdataAccount = ({
  account,
  artifact,
  authorityAddress,
  immutable,
  deploySlot,
}) => {
  if (
    account.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
    account.executable ||
    account.data.length !==
      SOLANA_PROGRAMDATA_METADATA_LENGTH + artifact.length ||
    account.data.readUInt32LE(0) !== 3
  ) {
    throw new Error("Finalized Loader-v3 ProgramData account is malformed.");
  }
  const slot = account.data.readBigUInt64LE(4);
  if (
    slot !== BigInt(deploySlot) ||
    slot === 0n ||
    slot > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error("ProgramData deployment slot is not exact.");
  }
  if (immutable) {
    if (account.data[12] !== 0) {
      throw new Error("ProgramData authority was not permanently cleared.");
    }
  } else if (
    account.data[12] !== 1 ||
    new PublicKey(account.data.subarray(13, 45)).toBase58() !== authorityAddress
  ) {
    throw new Error("ProgramData temporary deployment authority is not exact.");
  }
  const executable = account.data.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH);
  if (!Buffer.from(executable).equals(artifact)) {
    throw new Error(
      "ProgramData executable bytes differ from the reviewed artifact.",
    );
  }
  return {
    accountLamports: account.lamports,
    deploymentSlot: Number(slot),
    authorityAddress: immutable ? null : authorityAddress,
    immutable,
    accountDataLength: account.data.length,
    accountDataSha256: solanaSha256(account.data),
    metadataPaddingSha256: solanaSha256(account.data.subarray(13, 45)),
    executableLength: artifact.length,
    executableSha256: solanaSha256(executable),
    codeHash: solanaBlake2b256(executable),
    sbpfVersion: "V3",
  };
};

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};

const ensurePublicJournalEvent = (event) => {
  const forbidden =
    /(?:secret|private.?key|raw.?transaction|signed.?transaction)/iu;
  const inspect = (value, path = "event") => {
    if (value instanceof Uint8Array) {
      throw new Error(`Public journal ${path} must not contain binary data.`);
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspect(entry, `${path}[${index}]`));
    } else if (isRecord(value)) {
      for (const [key, entry] of Object.entries(value)) {
        if (forbidden.test(key)) {
          throw new Error(`Public journal ${path} contains a forbidden field.`);
        }
        inspect(entry, `${path}.${key}`);
      }
    }
  };
  inspect(event);
  const encoded = Buffer.from(JSON.stringify(event), "utf8");
  if (!encoded.length || encoded.length > MAX_PUBLIC_JOURNAL_BYTES) {
    throw new Error("Public journal event is empty or unbounded.");
  }
  return { encoded, sha256: solanaSha256(encoded) };
};

const sourceSecretViews = (source, views) => {
  const signer = source?.signer;
  const exposedSecret = signer?.secretKey;
  const candidates = [
    source?.secretKey,
    ...(Array.isArray(source?.secretViews) ? source.secretViews : []),
    exposedSecret,
    signer?._keypair?.secretKey,
  ];
  for (const candidate of candidates) {
    if (candidate instanceof Uint8Array) views.push(candidate);
  }
  return { signer, exposedSecret };
};

const signerFromRuntimeSource = ({ source, role, address, secretViews }) => {
  const { signer, exposedSecret } = sourceSecretViews(source, secretViews);
  if (
    !isRecord(source) ||
    source.runtimeOnly !== true ||
    source.generatedAtRuntime !== true ||
    source.fileBacked !== false ||
    source.entropySource !== "os-csprng" ||
    !(exposedSecret instanceof Uint8Array) ||
    exposedSecret.length !== 64 ||
    signer.publicKey?.toBase58?.() !== address
  ) {
    throw new Error(
      `${role} is not the exact reviewed runtime-only random signer.`,
    );
  }
  return signer;
};

const zeroizeSecretViews = (views) => {
  const errors = [];
  const seen = [];
  for (const view of views) {
    if (!(view instanceof Uint8Array)) continue;
    if (
      seen.some(
        (entry) =>
          entry.buffer === view.buffer &&
          entry.byteOffset === view.byteOffset &&
          entry.byteLength === view.byteLength,
      )
    ) {
      continue;
    }
    seen.push(view);
    try {
      view.fill(0);
      if (!view.every((byte) => byte === 0)) {
        throw new Error("runtime signer retained non-zero bytes");
      }
    } catch {
      errors.push(new Error("A runtime-only signer could not be zeroized."));
    }
  }
  return errors;
};

const validateSbfEvidence = async ({ program, validateSbfExecutable }) => {
  if (typeof validateSbfExecutable !== "function") {
    throw new Error(
      "Production structural-validation evidence callback is required.",
    );
  }
  const evidence = await validateSbfExecutable({
    role: program.role,
    executableBytes: Buffer.from(program.artifact),
    sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
    validatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
    validatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
    policy: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY,
    policySha256: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
    artifactSha256: program.artifactSha256,
    codeHash: program.codeHash,
    executableLength: program.executableLength,
    requiredChecks: [...SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS],
  });
  assertFreshSbfEvidenceForProgram({ program, evidence });
  return {
    schema: evidence.schema,
    sbpfVersion: evidence.sbpfVersion,
    evidenceSha256: program.sbfValidationEvidenceSha256,
    helperBinarySha256: evidence.helperBinarySha256,
    validatorSourceBundleSha256: evidence.validatorSourceBundleSha256,
    cargoLockSha256: evidence.cargoLockSha256,
    rustcIdentitySha256: evidence.rustcIdentitySha256,
    checks: [...evidence.checks],
    productionEligible: true,
  };
};

export class SolanaLoaderV3FreshDeployAmbiguityError extends Error {
  constructor(message, publicRecovery) {
    super(message);
    this.name = "SolanaLoaderV3FreshDeployAmbiguityError";
    this.publicRecovery = deepFreeze(publicRecovery);
  }
}

/**
 * Freshly deploys and permanently freezes the three reviewed programs.
 * Every actual send is attempted once. Any indeterminate send/readback stops
 * the operation and exposes only public recovery coordinates.
 */
export const deployFreshImmutableSolanaSccpPrograms = async ({
  connection,
  planBytes,
  expectedPlanSha256,
  artifactBytesByRole,
  confirmation,
  signerFactory,
  dependencies = {},
} = {}) => {
  if (!connection) throw new Error("A Solana connection is required.");
  const normalized = validateSolanaLoaderV3FreshDeployPlan({
    planBytes,
    expectedPlanSha256,
    artifactBytesByRole,
  });
  assertExactConfirmation(confirmation, normalized);
  if (typeof signerFactory !== "function") {
    throw new Error("Runtime-only signer factory is required.");
  }
  const operationJournal = dependencies.operationJournal;
  if (typeof operationJournal !== "function") {
    throw new Error("Durable public operation journal callback is required.");
  }
  const validateSbfExecutable = dependencies.validateSbfExecutable;
  const getFinalizedSlot =
    dependencies.getFinalizedSlot ?? (() => connection.getSlot("finalized"));
  const getVersion = dependencies.getVersion ?? (() => connection.getVersion());
  const getLatestBlockhashAndContext =
    dependencies.getLatestBlockhashAndContext ??
    (() => connection.getLatestBlockhashAndContext("finalized"));
  const getMinimumBalanceForRentExemption =
    dependencies.getMinimumBalanceForRentExemption ??
    ((length) =>
      connection.getMinimumBalanceForRentExemption(length, "finalized"));
  const getBalance =
    dependencies.getBalance ??
    (({ address, minContextSlot }) =>
      connection.getBalanceAndContext(new PublicKey(address), {
        commitment: "finalized",
        minContextSlot,
      }));
  const getFeeForMessage =
    dependencies.getFeeForMessage ??
    (({ message }) => connection.getFeeForMessage(message, "finalized"));
  const readAccount = dependencies.readAccount ?? defaultReadAccount;
  const simulateRawTransaction =
    dependencies.simulateRawTransaction ??
    (({ rawTransaction, config }) =>
      connection.simulateTransaction(Transaction.from(rawTransaction), config));
  const getSignatureStatus =
    dependencies.getSignatureStatus ??
    (async (signature) => {
      const statuses = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      return statuses?.value?.[0] ?? null;
    });
  const broadcastFinalized =
    dependencies.broadcastFinalized ?? defaultBroadcastFinalized;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));

  let journalId = null;
  let journalSequence = 0;
  let mutationAttempted = false;
  let currentStage = "read-only-preflight";
  let lastIntent = null;
  let lastFinalized = null;
  const secretViews = [];
  const signers = { payer: null, authority: null, programs: {} };
  const roleReports = {};
  let sbpfV3FeatureEvidence = null;
  let resourcePreflightEvidence = null;
  const plannedWriteChunksByRole = {};
  let report = null;
  let failure = null;

  const recoveryEvidence = (status) => ({
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_RECOVERY_SCHEMA,
    status,
    network: SOLANA_TESTNET_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    operationId: normalized.operationId,
    planSha256: normalized.planSha256,
    journalId,
    stage: currentStage,
    lastIntent,
    lastFinalized,
    payerAddress: normalized.payerAddress,
    deploymentAuthorityAddress: normalized.authorityAddress,
    programs: normalized.programs.map(
      ({ role, programId, programdataAddress, bufferAddress }) => ({
        role,
        programId,
        programdataAddress,
        bufferAddress,
      }),
    ),
    recoveryAction:
      "resolve every journaled signature to finalized success, finalized failure, or blockhash expiry before any operator action",
  });

  const appendJournal = async (type, details) => {
    journalSequence += 1;
    const event = {
      schema: SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA,
      sequence: journalSequence,
      type,
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      operationId: normalized.operationId,
      planSha256: normalized.planSha256,
      journalId,
      payerAddress: normalized.payerAddress,
      deploymentAuthorityAddress: normalized.authorityAddress,
      programs: normalized.programs.map(
        ({
          role,
          programId,
          programdataAddress,
          bufferAddress,
          artifactSha256,
        }) => ({
          role,
          programId,
          programdataAddress,
          bufferAddress,
          artifactSha256,
        }),
      ),
      details,
    };
    const { encoded, sha256 } = ensurePublicJournalEvent(event);
    const publicEvent = deepFreeze(JSON.parse(encoded.toString("utf8")));
    const response = await operationJournal(publicEvent, sha256);
    if (type === "claim") {
      if (
        !isRecord(response) ||
        JSON.stringify(Object.keys(response).sort()) !==
          JSON.stringify(
            ["accepted", "durable", "eventSha256", "journalId"].sort(),
          ) ||
        response.durable !== true ||
        response.accepted !== true ||
        response.eventSha256 !== sha256 ||
        typeof response.journalId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/u.test(response.journalId)
      ) {
        throw new Error(
          "Public journal did not durably and exclusively claim the operation.",
        );
      }
      journalId = response.journalId;
    } else if (
      !isRecord(response) ||
      JSON.stringify(Object.keys(response).sort()) !==
        JSON.stringify(
          ["durable", "eventSha256", "journalId", "recorded"].sort(),
        ) ||
      response.durable !== true ||
      response.recorded !== true ||
      response.eventSha256 !== sha256 ||
      response.journalId !== journalId
    ) {
      throw new Error("Public journal did not durably record the event.");
    }
    return { event: publicEvent, eventSha256: sha256 };
  };

  const assertLiveContext = async () => {
    const genesisHash = await connection.getGenesisHash();
    if (genesisHash !== SOLANA_TESTNET_GENESIS_HASH) {
      throw new Error("RPC is not canonical Solana testnet.");
    }
    const version = await getVersion();
    if (
      version?.["solana-core"] !== normalized.solanaCoreVersion ||
      version?.["feature-set"] !== normalized.featureSet
    ) {
      throw new Error(
        "Solana core version or feature set differs from the plan.",
      );
    }
    const slot = await getFinalizedSlot();
    if (
      !Number.isSafeInteger(slot) ||
      slot < normalized.minFinalizedSlot ||
      slot > normalized.expiresAtFinalizedSlot
    ) {
      throw new Error("Finalized context is outside the reviewed slot window.");
    }
    return slot;
  };

  const freshBlockhash = async (minimumSlot) =>
    normalizeBlockhashContext(
      await getLatestBlockhashAndContext(),
      minimumSlot,
      normalized.expiresAtFinalizedSlot,
    );

  const simulateSentinel = async ({
    instructions,
    transactionSigners,
    stage,
    snapshotAddresses,
    preparedBlockhash = null,
  }) => {
    const floor = await assertLiveContext();
    const completeSnapshotAddresses = [
      ...new Set([
        normalized.payerAddress,
        ...snapshotAddresses,
        ...instructions.flatMap((instruction) =>
          instruction.keys
            .filter(({ isWritable }) => isWritable)
            .map(({ pubkey }) => pubkey.toBase58()),
        ),
      ]),
    ];
    const before = await readFingerprintMap({
      connection,
      addresses: completeSnapshotAddresses,
      minContextSlot: floor,
      readAccount,
      expirySlot: normalized.expiresAtFinalizedSlot,
    });
    const blockhash = preparedBlockhash ?? (await freshBlockhash(floor));
    const simulationInstructions = [
      ...instructions,
      buildLoaderV3InvalidRollbackSentinelInstruction(),
    ];
    const built = buildSignedTransaction({
      instructions: simulationInstructions,
      payerSigner: signers.payer,
      signers: transactionSigners,
      blockhash,
    });
    if ((await getSignatureStatus(built.primarySignature)) !== null) {
      throw new Error(
        `${stage} simulation signature already exists in ledger history.`,
      );
    }
    const simulation = await simulateRawTransaction({
      connection,
      rawTransaction: Buffer.from(built.raw),
      config: {
        sigVerify: true,
        replaceRecentBlockhash: false,
        commitment: "finalized",
        minContextSlot: floor,
      },
      stage,
      expectedSignature: built.primarySignature,
      expectedSignatures: [...built.signatures],
      messageSha256: built.messageSha256,
      packetSha256: built.packetSha256,
    });
    const simulationSlot = simulation?.context?.slot;
    const error = simulation?.value?.err;
    const logs = simulation?.value?.logs;
    const sentinelIndex = instructions.length;
    const exactError =
      isRecord(error) &&
      Array.isArray(error.InstructionError) &&
      error.InstructionError.length === 2 &&
      error.InstructionError[0] === sentinelIndex &&
      error.InstructionError[1] === "InvalidInstructionData";
    const loaderInstructionCount = instructions.filter(
      ({ programId }) => programId.toBase58() === SOLANA_UPGRADEABLE_LOADER_ID,
    ).length;
    const loaderSuccessCount = Array.isArray(logs)
      ? logs.filter(
          (entry) =>
            entry === `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
        ).length
      : 0;
    if (
      !Number.isSafeInteger(simulationSlot) ||
      simulationSlot < floor ||
      simulationSlot > normalized.expiresAtFinalizedSlot ||
      !exactError ||
      !Array.isArray(logs) ||
      !logs.every((entry) => typeof entry === "string") ||
      loaderSuccessCount !== loaderInstructionCount ||
      !logs.some(
        (entry) =>
          entry.startsWith(`Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed`) &&
          entry.toLowerCase().includes("invalid instruction data"),
      )
    ) {
      throw new Error(`${stage} rollback-sentinel simulation was not exact.`);
    }
    if ((await getSignatureStatus(built.primarySignature)) !== null) {
      throw new Error(`${stage} simulation signature persisted unexpectedly.`);
    }
    const after = await readFingerprintMap({
      connection,
      addresses: completeSnapshotAddresses,
      minContextSlot: simulationSlot,
      readAccount,
      expirySlot: normalized.expiresAtFinalizedSlot,
    });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(
        `${stage} rollback-sentinel simulation changed account state.`,
      );
    }
    return {
      simulationOnly: true,
      broadcast: false,
      simulationContextSlot: simulationSlot,
      sentinelInstructionIndex: sentinelIndex,
      expectedError: "InvalidInstructionData",
      expectedSignature: built.primarySignature,
      expectedSignatures: [...built.signatures],
      messageSha256: built.messageSha256,
      packetSha256: built.packetSha256,
      packetLength: built.packetLength,
      logSha256: solanaSha256(Buffer.from(logs.join("\n"), "utf8")),
      stateBeforeSha256: solanaSha256(
        Buffer.from(JSON.stringify(before), "utf8"),
      ),
      stateAfterSha256: solanaSha256(
        Buffer.from(JSON.stringify(after), "utf8"),
      ),
    };
  };

  const submitOnce = async ({
    instructions,
    transactionSigners,
    stage,
    snapshotAddresses,
    preparedSimulation = null,
  }) => {
    currentStage = stage;
    const simulation =
      preparedSimulation ??
      (await simulateSentinel({
        instructions,
        transactionSigners,
        stage,
        snapshotAddresses,
      }));
    const floor = await assertLiveContext();
    if ((await getSignatureStatus(simulation.expectedSignature)) !== null) {
      throw new Error(
        `${stage} simulation signature persisted before broadcast.`,
      );
    }
    const blockhash = await freshBlockhash(
      Math.max(floor, simulation.simulationContextSlot),
    );
    const built = buildSignedTransaction({
      instructions,
      payerSigner: signers.payer,
      signers: transactionSigners,
      blockhash,
    });
    lastIntent = {
      stage,
      ...publicIntent(built),
      simulation,
    };
    await appendJournal("intent", lastIntent);
    await assertLiveContext();
    if ((await getSignatureStatus(simulation.expectedSignature)) !== null) {
      throw new Error(
        `${stage} simulation signature persisted at send boundary.`,
      );
    }
    mutationAttempted = true;
    let submitted;
    try {
      submitted = await broadcastFinalized({
        connection,
        rawTransaction: Buffer.from(built.raw),
        expectedSignature: built.primarySignature,
        expectedSignatures: [...built.signatures],
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
        messageSha256: built.messageSha256,
        stage,
        sleep,
      });
    } catch {
      const recovery = recoveryEvidence("broadcast-outcome-ambiguous-no-retry");
      try {
        await appendJournal("ambiguous", recovery);
      } catch {
        // The thrown recovery payload remains sufficient when the journal itself is down.
      }
      throw new SolanaLoaderV3FreshDeployAmbiguityError(
        `${stage} broadcast outcome is ambiguous; automatic retry is forbidden.`,
        recovery,
      );
    }
    let finalized;
    try {
      finalized = verifyFinalizedTransaction({ built, submitted, stage });
      if (
        finalized.finalizedSlot <= floor ||
        finalized.finalizedSlot > normalized.expiresAtFinalizedSlot
      ) {
        throw new Error(
          `${stage} finalized outside the reviewed live slot window.`,
        );
      }
    } catch {
      const recovery = recoveryEvidence(
        "finalized-readback-ambiguous-no-retry",
      );
      try {
        await appendJournal("ambiguous", recovery);
      } catch {
        // Preserve the public in-memory recovery coordinates below.
      }
      throw new SolanaLoaderV3FreshDeployAmbiguityError(
        `${stage} finalized readback is ambiguous; automatic retry is forbidden.`,
        recovery,
      );
    }
    lastFinalized = {
      stage,
      signature: finalized.signature,
      finalizedSlot: finalized.finalizedSlot,
      messageSha256: finalized.messageSha256,
    };
    try {
      await appendJournal("resolution", {
        stage,
        status: "finalized-exact",
        ...publicIntent(built),
        finalizedSlot: finalized.finalizedSlot,
      });
    } catch {
      throw new SolanaLoaderV3FreshDeployAmbiguityError(
        `${stage} finalized but its durable public resolution was not recorded.`,
        recoveryEvidence("finalized-journal-resolution-missing"),
      );
    }
    return finalized;
  };

  const readExact = async (
    address,
    minContextSlot,
    label,
    allowMissing = false,
  ) =>
    normalizeAccount(
      await readAccount({
        connection,
        address,
        minContextSlot,
        label,
        allowMissing,
      }),
      address,
      label,
      minContextSlot,
      allowMissing,
    );

  const readSbpfV3EnableFeature = async (floor) => {
    const account = await readExact(
      SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      floor,
      "SBPF V3 enable feature account",
    );
    if (
      account.owner !== SOLANA_FEATURE_PROGRAM_ID ||
      account.executable ||
      account.data.length !== 9 ||
      account.data[0] !== 1 ||
      solanaSha256(account.data) !==
        normalized.sbpfV3EnableFeatureAccountDataSha256
    ) {
      throw new Error(
        "Finalized SBPF V3 enable feature account is not the exact reviewed active state.",
      );
    }
    const activationSlot = account.data.readBigUInt64LE(1);
    if (
      activationSlot !== BigInt(normalized.sbpfV3EnableFeatureActivationSlot) ||
      activationSlot > BigInt(floor)
    ) {
      throw new Error(
        "SBPF V3 enable feature activation slot is not finalized and plan-bound.",
      );
    }
    return {
      featureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      owner: SOLANA_FEATURE_PROGRAM_ID,
      active: true,
      activationSlot: Number(activationSlot),
      finalizedReadContextSlot: account.contextSlot,
      accountDataLength: account.data.length,
      accountDataSha256: solanaSha256(account.data),
    };
  };

  const assertAllFresh = async (floor) => {
    for (const program of normalized.programs) {
      for (const [address, label] of [
        [program.programId, `${program.role} Program`],
        [program.programdataAddress, `${program.role} ProgramData`],
        [program.bufferAddress, `${program.role} buffer`],
      ]) {
        const account = await readExact(address, floor, label, true);
        if (account !== null) {
          throw new Error(
            `${label} already exists; fresh account ambiguity fails closed.`,
          );
        }
      }
    }
  };

  const runResourcePreflight = async () => {
    const startedFinalizedSlot = await assertLiveContext();
    const preflightBlockhash = await freshBlockhash(startedFinalizedSlot);
    const feeQuoteContextSlots = [];
    const quoteTransaction = async ({
      instructions,
      stage,
      expectedRequiredSignatureCount,
    }) => {
      const planned = buildUnsignedTransactionPlan({
        instructions,
        payerAddress: normalized.payerAddress,
        blockhash: preflightBlockhash.blockhash,
      });
      const sentinel = buildUnsignedTransactionPlan({
        instructions: [
          ...instructions,
          buildLoaderV3InvalidRollbackSentinelInstruction(),
        ],
        payerAddress: normalized.payerAddress,
        blockhash: preflightBlockhash.blockhash,
      });
      if (
        planned.requiredSignatureCount !== expectedRequiredSignatureCount ||
        planned.packetLength > SOLANA_PACKET_DATA_SIZE ||
        sentinel.packetLength > SOLANA_PACKET_DATA_SIZE
      ) {
        throw new Error(
          `${stage} resource preflight transaction shape is not packet-safe and exact.`,
        );
      }
      const quote = await getFeeForMessage({
        connection,
        message: planned.message,
        stage,
        minContextSlot: startedFinalizedSlot,
      });
      const contextSlot = quote?.context?.slot;
      const feeLamports = quote?.value;
      if (
        !Number.isSafeInteger(contextSlot) ||
        contextSlot < startedFinalizedSlot ||
        contextSlot > normalized.expiresAtFinalizedSlot ||
        !Number.isSafeInteger(feeLamports) ||
        feeLamports <= 0
      ) {
        throw new Error(
          `${stage} finalized fee-for-message quote is stale or invalid.`,
        );
      }
      feeQuoteContextSlots.push(contextSlot);
      return {
        feeLamports,
        requiredSignatureCount: planned.requiredSignatureCount,
      };
    };

    const resourcePrograms = [];
    for (const program of normalized.programs) {
      const bufferSpace =
        SOLANA_BUFFER_METADATA_LENGTH + program.executableLength;
      const programSpace = PROGRAM_ACCOUNT_LENGTH;
      const programdataSpace =
        SOLANA_PROGRAMDATA_METADATA_LENGTH + program.executableLength;
      const bufferRentLamports =
        await getMinimumBalanceForRentExemption(bufferSpace);
      const programRentLamports =
        await getMinimumBalanceForRentExemption(programSpace);
      const programdataRentLamports =
        await getMinimumBalanceForRentExemption(programdataSpace);
      for (const [amount, label] of [
        [bufferRentLamports, "buffer"],
        [programRentLamports, "Program"],
        [programdataRentLamports, "ProgramData"],
      ]) {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          throw new Error(`${program.role} ${label} rent result is invalid.`);
        }
      }
      const writeChunks = planPacketSafeWriteChunks({
        program,
        payerAddress: normalized.payerAddress,
        authorityAddress: normalized.authorityAddress,
        blockhash: preflightBlockhash.blockhash,
      });
      plannedWriteChunksByRole[program.role] = writeChunks;
      const fees = [];
      const signatureCounts = [];
      const initialize = await quoteTransaction({
        stage: `create-initialize-buffer:${program.role}`,
        instructions: [
          SystemProgram.createAccount({
            fromPubkey: new PublicKey(normalized.payerAddress),
            newAccountPubkey: new PublicKey(program.bufferAddress),
            lamports: bufferRentLamports,
            space: bufferSpace,
            programId: LOADER,
          }),
          buildLoaderV3InitializeBufferInstruction({
            bufferAddress: program.bufferAddress,
            authorityAddress: normalized.authorityAddress,
          }),
        ],
        expectedRequiredSignatureCount: 2,
      });
      fees.push(initialize.feeLamports);
      signatureCounts.push(initialize.requiredSignatureCount);
      for (const chunk of writeChunks) {
        const write = await quoteTransaction({
          stage: `write-buffer:${program.role}:${chunk.offset}`,
          instructions: [chunk.instruction],
          expectedRequiredSignatureCount: 2,
        });
        fees.push(write.feeLamports);
        signatureCounts.push(write.requiredSignatureCount);
      }
      const deploy = await quoteTransaction({
        stage: `fresh-deploy:${program.role}`,
        instructions: [
          SystemProgram.createAccount({
            fromPubkey: new PublicKey(normalized.payerAddress),
            newAccountPubkey: new PublicKey(program.programId),
            lamports: programRentLamports,
            space: programSpace,
            programId: LOADER,
          }),
          buildLoaderV3DeployWithMaxDataLenInstruction({
            payerAddress: normalized.payerAddress,
            programId: program.programId,
            programdataAddress: program.programdataAddress,
            bufferAddress: program.bufferAddress,
            authorityAddress: normalized.authorityAddress,
            maxDataLength: program.maxDataLength,
          }),
        ],
        expectedRequiredSignatureCount: 3,
      });
      fees.push(deploy.feeLamports);
      signatureCounts.push(deploy.requiredSignatureCount);
      resourcePrograms.push({
        role: program.role,
        bufferSpace,
        bufferRentLamports,
        programSpace,
        programRentLamports,
        programdataSpace,
        programdataRentLamports,
        writeTransactionCount: writeChunks.length,
        plannedTransactionCount: writeChunks.length + 2,
        plannedRequiredSignatureCount: addSafeIntegers(
          signatureCounts,
          `${program.role} resource-preflight signature count`,
        ),
        baseFeeLamports: addSafeIntegers(
          fees,
          `${program.role} resource-preflight fees`,
        ),
      });
    }

    const finalizationInstructions =
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.map((role) => {
        const program = normalized.programs.find(
          (entry) => entry.role === role,
        );
        return buildLoaderV3SetAuthorityNoneInstruction({
          programdataAddress: program.programdataAddress,
          authorityAddress: normalized.authorityAddress,
        });
      });
    const finalizationQuote = await quoteTransaction({
      stage: "set-authority-none:destination,source,nativeVerifier",
      instructions: finalizationInstructions,
      expectedRequiredSignatureCount: 2,
    });
    const completedQuoteFinalizedSlot = await assertLiveContext();
    const balance = await getBalance({
      connection,
      address: normalized.payerAddress,
      minContextSlot: completedQuoteFinalizedSlot,
    });
    const payerBalanceContextSlot = balance?.context?.slot;
    const payerBalanceLamports = balance?.value;
    if (
      !Number.isSafeInteger(payerBalanceContextSlot) ||
      payerBalanceContextSlot < completedQuoteFinalizedSlot ||
      payerBalanceContextSlot < Math.max(...feeQuoteContextSlots) ||
      payerBalanceContextSlot > normalized.expiresAtFinalizedSlot ||
      !Number.isSafeInteger(payerBalanceLamports) ||
      payerBalanceLamports < 0
    ) {
      throw new Error(
        "Fresh deployment finalized payer balance is stale or invalid.",
      );
    }
    const completedFinalizedSlot = payerBalanceContextSlot;
    if (feeQuoteContextSlots.some((slot) => slot > completedFinalizedSlot)) {
      throw new Error(
        "Fresh deployment resource preflight RPC contexts are not finalized and ordered.",
      );
    }
    const plannedTransactionCount = addSafeIntegers(
      [
        ...resourcePrograms.map(({ plannedTransactionCount: value }) => value),
        1,
      ],
      "Fresh deployment planned transaction count",
    );
    const plannedRequiredSignatureCount = addSafeIntegers(
      [
        ...resourcePrograms.map(
          ({ plannedRequiredSignatureCount: value }) => value,
        ),
        finalizationQuote.requiredSignatureCount,
      ],
      "Fresh deployment planned signature count",
    );
    const safetyMarginFinalizedSlots = Math.max(
      RESOURCE_PREFLIGHT_MIN_SLOT_SAFETY_MARGIN,
      Math.ceil(plannedTransactionCount / 4),
    );
    const minimumSafeRemainingFinalizedSlots = addSafeIntegers(
      [plannedTransactionCount, safetyMarginFinalizedSlots],
      "Fresh deployment minimum safe finalized-slot window",
    );
    const remainingFinalizedSlots =
      normalized.expiresAtFinalizedSlot - completedFinalizedSlot;
    if (remainingFinalizedSlots < minimumSafeRemainingFinalizedSlots) {
      throw new Error(
        "Fresh deployment expiry lacks the minimum safe remaining finalized-slot window.",
      );
    }
    const rentLamports = addSafeIntegers(
      resourcePrograms.flatMap((program) => [
        program.bufferRentLamports,
        program.programRentLamports,
        program.programdataRentLamports,
      ]),
      "Fresh deployment rent obligation",
    );
    const baseFeeLamports = addSafeIntegers(
      [
        ...resourcePrograms.map(({ baseFeeLamports: value }) => value),
        finalizationQuote.feeLamports,
      ],
      "Fresh deployment base fees",
    );
    const feeBudgetLamports = feeBudgetWithMargin(baseFeeLamports);
    const requiredPayerLamports = addSafeIntegers(
      [rentLamports, feeBudgetLamports],
      "Fresh deployment required payer balance",
    );
    if (payerBalanceLamports < requiredPayerLamports) {
      throw new Error(
        "Fresh deployment payer balance cannot cover all rent obligations and the conservative signature-fee budget.",
      );
    }
    return deepFreeze({
      schema: SOLANA_LOADER_V3_FRESH_DEPLOY_RESOURCE_PREFLIGHT_SCHEMA,
      passed: true,
      startedFinalizedSlot,
      completedFinalizedSlot,
      expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
      remainingFinalizedSlots,
      minimumSafeRemainingFinalizedSlots,
      safetyMarginFinalizedSlots,
      plannedTransactionCount,
      plannedRequiredSignatureCount,
      rentLamports,
      baseFeeLamports,
      feeMarginBasisPoints: RESOURCE_PREFLIGHT_FEE_MARGIN_BASIS_POINTS,
      feeBudgetLamports,
      requiredPayerLamports,
      payerBalanceLamports,
      remainingPayerLamports: payerBalanceLamports - requiredPayerLamports,
      payerBalanceContextSlot,
      feeQuoteMinContextSlot: Math.min(...feeQuoteContextSlots),
      feeQuoteMaxContextSlot: Math.max(...feeQuoteContextSlots),
      feeCalculation: "rpc-getFeeForMessage-finalized-v1",
      programs: resourcePrograms,
      immutableFinalization: {
        plannedTransactionCount: 1,
        plannedRequiredSignatureCount: finalizationQuote.requiredSignatureCount,
        baseFeeLamports: finalizationQuote.feeLamports,
      },
    });
  };

  const selectWriteChunk = async ({ program, offset }) => {
    const floor = await assertLiveContext();
    const blockhash = await freshBlockhash(floor);
    const planned = plannedWriteChunksByRole[program.role]?.find(
      (entry) => entry.offset === offset,
    );
    if (!planned) {
      throw new Error(
        `${program.role} has no resource-preflight write chunk at offset ${offset}.`,
      );
    }
    const instruction = buildLoaderV3WriteInstruction({
      bufferAddress: program.bufferAddress,
      authorityAddress: normalized.authorityAddress,
      offset,
      bytes: program.artifact.subarray(offset, offset + planned.length),
    });
    const actual = buildSignedTransaction({
      instructions: [instruction],
      payerSigner: signers.payer,
      signers: [signers.authority],
      blockhash,
    });
    const sentinel = buildSignedTransaction({
      instructions: [
        instruction,
        buildLoaderV3InvalidRollbackSentinelInstruction(),
      ],
      payerSigner: signers.payer,
      signers: [signers.authority],
      blockhash,
    });
    if (
      actual.packetLength !== planned.packetLength ||
      sentinel.packetLength !== planned.sentinelPacketLength ||
      actual.packetLength > SOLANA_PACKET_DATA_SIZE ||
      sentinel.packetLength > SOLANA_PACKET_DATA_SIZE
    ) {
      throw new Error(
        `${program.role} signed write shape differs from resource preflight.`,
      );
    }
    return { instruction, length: planned.length, blockhash };
  };

  try {
    const sbfValidation = {};
    for (const program of normalized.programs) {
      sbfValidation[program.role] = await validateSbfEvidence({
        program,
        validateSbfExecutable,
      });
    }
    const initialFloor = await assertLiveContext();
    sbpfV3FeatureEvidence = await readSbpfV3EnableFeature(initialFloor);
    await appendJournal("claim", {
      stage: "durable-claim-before-signers-and-mutation",
      finalizedContextSlot: initialFloor,
      status: "exclusive-public-operation-claim",
      sbpfV3EnableFeature: sbpfV3FeatureEvidence,
    });
    await assertAllFresh(initialFloor);
    currentStage = "resource-preflight-before-runtime-signers";
    resourcePreflightEvidence = await runResourcePreflight();

    const signerFor = async (role, address) =>
      signerFromRuntimeSource({
        source: await signerFactory({
          role,
          address,
          network: SOLANA_TESTNET_NETWORK,
          genesisHash: SOLANA_TESTNET_GENESIS_HASH,
          operationId: normalized.operationId,
          planSha256: normalized.planSha256,
          journalId,
        }),
        role,
        address,
        secretViews,
      });
    signers.payer = await signerFor("payer", normalized.payerAddress);
    signers.authority = await signerFor(
      "deploymentAuthority",
      normalized.authorityAddress,
    );
    for (const program of normalized.programs) {
      signers.programs[program.role] = {
        program: await signerFor(`program:${program.role}`, program.programId),
        buffer: await signerFor(
          `buffer:${program.role}`,
          program.bufferAddress,
        ),
      };
    }
    const recheckFloor = await assertLiveContext();
    await assertAllFresh(recheckFloor);

    for (const program of normalized.programs) {
      const roleSigners = signers.programs[program.role];
      const resourceProgram = resourcePreflightEvidence.programs.find(
        ({ role }) => role === program.role,
      );
      const bufferSpace = resourceProgram.bufferSpace;
      const bufferLamports = resourceProgram.bufferRentLamports;
      const createBuffer = await submitOnce({
        instructions: [
          SystemProgram.createAccount({
            fromPubkey: signers.payer.publicKey,
            newAccountPubkey: roleSigners.buffer.publicKey,
            lamports: bufferLamports,
            space: bufferSpace,
            programId: LOADER,
          }),
          buildLoaderV3InitializeBufferInstruction({
            bufferAddress: program.bufferAddress,
            authorityAddress: normalized.authorityAddress,
          }),
        ],
        transactionSigners: [roleSigners.buffer],
        stage: `create-initialize-buffer:${program.role}`,
        snapshotAddresses: [program.bufferAddress],
      });
      let bufferAccount = await readExact(
        program.bufferAddress,
        createBuffer.finalizedSlot,
        `${program.role} initialized buffer`,
      );
      let populated = parseBuffer(
        bufferAccount,
        normalized.authorityAddress,
        program.executableLength,
      );
      if (!populated.every((byte) => byte === 0)) {
        throw new Error(
          `${program.role} initialized buffer is not zero-filled.`,
        );
      }
      const writes = [];
      let offset = 0;
      while (offset < program.executableLength) {
        const selected = await selectWriteChunk({ program, offset });
        const stage = `write-buffer:${program.role}:${offset}`;
        const simulation = await simulateSentinel({
          instructions: [selected.instruction],
          transactionSigners: [signers.authority],
          stage,
          snapshotAddresses: [program.bufferAddress],
          preparedBlockhash: selected.blockhash,
        });
        const write = await submitOnce({
          instructions: [selected.instruction],
          transactionSigners: [signers.authority],
          stage,
          snapshotAddresses: [program.bufferAddress],
          preparedSimulation: simulation,
        });
        offset += selected.length;
        bufferAccount = await readExact(
          program.bufferAddress,
          write.finalizedSlot,
          `${program.role} populated buffer`,
        );
        populated = parseBuffer(
          bufferAccount,
          normalized.authorityAddress,
          program.executableLength,
        );
        if (
          !populated
            .subarray(0, offset)
            .equals(program.artifact.subarray(0, offset)) ||
          !populated.subarray(offset).every((byte) => byte === 0)
        ) {
          throw new Error(
            `${program.role} buffer write readback is not exact.`,
          );
        }
        writes.push({
          offset: offset - selected.length,
          length: selected.length,
          transaction: write,
        });
      }
      if (
        !populated.equals(program.artifact) ||
        solanaSha256(populated) !== program.artifactSha256 ||
        solanaBlake2b256(populated) !== program.codeHash
      ) {
        throw new Error(`${program.role} final buffer bytes are not exact.`);
      }
      const programLamports = resourceProgram.programRentLamports;
      const deploy = await submitOnce({
        instructions: [
          SystemProgram.createAccount({
            fromPubkey: signers.payer.publicKey,
            newAccountPubkey: roleSigners.program.publicKey,
            lamports: programLamports,
            space: PROGRAM_ACCOUNT_LENGTH,
            programId: LOADER,
          }),
          buildLoaderV3DeployWithMaxDataLenInstruction({
            payerAddress: normalized.payerAddress,
            programId: program.programId,
            programdataAddress: program.programdataAddress,
            bufferAddress: program.bufferAddress,
            authorityAddress: normalized.authorityAddress,
            maxDataLength: program.maxDataLength,
          }),
        ],
        transactionSigners: [roleSigners.program, signers.authority],
        stage: `fresh-deploy:${program.role}`,
        snapshotAddresses: [
          program.programId,
          program.programdataAddress,
          program.bufferAddress,
        ],
      });
      const programAccount = await readExact(
        program.programId,
        deploy.finalizedSlot,
        `${program.role} Program`,
      );
      const programdataAccount = await readExact(
        program.programdataAddress,
        deploy.finalizedSlot,
        `${program.role} ProgramData`,
      );
      const consumedBuffer = await readExact(
        program.bufferAddress,
        deploy.finalizedSlot,
        `${program.role} consumed buffer`,
        true,
      );
      if (consumedBuffer !== null) {
        throw new Error(
          `${program.role} Loader-v3 buffer was not consumed exactly.`,
        );
      }
      if (
        programAccount.lamports !== resourceProgram.programRentLamports ||
        programdataAccount.lamports !== resourceProgram.programdataRentLamports
      ) {
        throw new Error(
          `${program.role} finalized Program rent state differs from resource preflight.`,
        );
      }
      const programReadback = parseProgramAccount(
        programAccount,
        program.programdataAddress,
      );
      const mutableProgramdata = parseProgramdataAccount({
        account: programdataAccount,
        artifact: program.artifact,
        authorityAddress: normalized.authorityAddress,
        immutable: false,
        deploySlot: deploy.finalizedSlot,
      });
      roleReports[program.role] = {
        role: program.role,
        programId: program.programId,
        programdataAddress: program.programdataAddress,
        bufferAddress: program.bufferAddress,
        artifactSha256: program.artifactSha256,
        executableSha256: program.artifactSha256,
        codeHash: program.codeHash,
        executableLength: program.executableLength,
        sbfValidation: sbfValidation[program.role],
        buffer: {
          consumed: true,
          initialize: createBuffer,
          writes,
        },
        deploy,
        programReadback,
        mutableProgramdataReadback: mutableProgramdata,
      };
    }

    const finalizationInstructions =
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.map((role) => {
        const program = normalized.programs.find(
          (entry) => entry.role === role,
        );
        return buildLoaderV3SetAuthorityNoneInstruction({
          programdataAddress: program.programdataAddress,
          authorityAddress: normalized.authorityAddress,
        });
      });
    if (
      finalizationInstructions.length !== 3 ||
      finalizationInstructions.some(
        (instruction) =>
          instruction.programId.toBase58() !== SOLANA_UPGRADEABLE_LOADER_ID,
      )
    ) {
      throw new Error("Immutable finalization instruction set is not exact.");
    }
    const allProgramdataAddresses =
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.map(
        (role) =>
          normalized.programs.find((entry) => entry.role === role)
            .programdataAddress,
      );
    const finalization = await submitOnce({
      instructions: finalizationInstructions,
      transactionSigners: [signers.authority],
      stage: "set-authority-none:destination,source,nativeVerifier",
      snapshotAddresses: allProgramdataAddresses,
    });
    if (
      finalization.instructions.length !== 3 ||
      JSON.stringify(
        finalization.instructions.map(({ metas }) => metas[0]?.pubkey),
      ) !== JSON.stringify(allProgramdataAddresses) ||
      finalization.instructions.some(
        ({ dataHex, metas }) =>
          dataHex !== "0x04000000" ||
          metas.length !== 2 ||
          metas[0].isSigner ||
          !metas[0].isWritable ||
          !metas[1].isSigner ||
          metas[1].isWritable ||
          metas[1].pubkey !== normalized.authorityAddress,
      )
    ) {
      throw new Error(
        "Finalized immutable authority transaction shape is not exact.",
      );
    }

    for (const program of normalized.programs) {
      const programAccount = await readExact(
        program.programId,
        finalization.finalizedSlot,
        `${program.role} immutable Program`,
      );
      const programdataAccount = await readExact(
        program.programdataAddress,
        finalization.finalizedSlot,
        `${program.role} immutable ProgramData`,
      );
      const programReadback = parseProgramAccount(
        programAccount,
        program.programdataAddress,
      );
      const immutableProgramdata = parseProgramdataAccount({
        account: programdataAccount,
        artifact: program.artifact,
        authorityAddress: normalized.authorityAddress,
        immutable: true,
        deploySlot: roleReports[program.role].deploy.finalizedSlot,
      });
      const resourceProgram = resourcePreflightEvidence.programs.find(
        ({ role }) => role === program.role,
      );
      if (
        programAccount.lamports !== resourceProgram.programRentLamports ||
        programdataAccount.lamports !== resourceProgram.programdataRentLamports
      ) {
        throw new Error(
          `${program.role} immutable Program rent state differs from resource preflight.`,
        );
      }
      roleReports[program.role].immutableProgramReadback = programReadback;
      roleReports[program.role].immutableProgramdataReadback =
        immutableProgramdata;
      roleReports[program.role].immutableFinalization = {
        signature: finalization.signature,
        finalizedSlot: finalization.finalizedSlot,
        messageSha256: finalization.messageSha256,
        roleOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
      };
    }

    await appendJournal("complete", {
      stage: "complete",
      status: "three-programs-finalized-immutable-and-read-back",
      signature: finalization.signature,
      finalizedSlot: finalization.finalizedSlot,
      finalizationRoleOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
      immutableAccountDataSha256ByRole: Object.fromEntries(
        normalized.programs.map(({ role }) => [
          role,
          roleReports[role].immutableProgramdataReadback.accountDataSha256,
        ]),
      ),
    });

    report = {
      schema: SOLANA_LOADER_V3_FRESH_DEPLOY_REPORT_SCHEMA,
      ready: true,
      productionReady: true,
      mode: "fresh-exact-three-program-loader-v3-deployment",
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      operationId: normalized.operationId,
      planSha256: normalized.planSha256,
      payerAddress: normalized.payerAddress,
      temporaryDeploymentAuthorityAddress: normalized.authorityAddress,
      context: {
        minFinalizedSlot: normalized.minFinalizedSlot,
        expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
        solanaCoreVersion: normalized.solanaCoreVersion,
        featureSet: normalized.featureSet,
      },
      sbpfV3EnableFeature: sbpfV3FeatureEvidence,
      resourcePreflight: resourcePreflightEvidence,
      journal: {
        durable: true,
        journalId,
        claimedBeforeMutation: true,
        completedAfterImmutableReadback: true,
      },
      programs: SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map(
        (role) => roleReports[role],
      ),
      immutableFinalization: {
        ...finalization,
        roleOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
        oneAtomicTransaction: true,
      },
      policy: {
        freshProgramsOnly: true,
        exactProgramCount: 3,
        runtimeOnlyRandomSigners: true,
        fileBackedSignersAccepted: false,
        automaticMutationRetries: 0,
        rollbackSentinelBeforeEveryBroadcast: true,
        durableIntentBeforeEveryBroadcast: true,
        exactFinalizedTransactionReadback: true,
        exactArtifactByteReadback: true,
        oneWayAuthorityRevocationComplete: true,
      },
      runtimeSignerMaterialZeroized: false,
    };
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    if (
      journalId &&
      !(failure instanceof SolanaLoaderV3FreshDeployAmbiguityError)
    ) {
      try {
        await appendJournal(
          "halt",
          recoveryEvidence("failed-closed-no-automatic-retry"),
        );
      } catch {
        // The primary failure and public recovery coordinates remain intact.
      }
      if (mutationAttempted) {
        failure = new SolanaLoaderV3FreshDeployAmbiguityError(
          `${currentStage} stopped after mutation began; inspect journaled signatures before recovery.`,
          recoveryEvidence("failed-after-mutation-inspection-required"),
        );
      }
    }
  }

  const zeroizationErrors = zeroizeSecretViews(secretViews);
  if (zeroizationErrors.length) {
    failure = failure
      ? new AggregateError(
          [failure, ...zeroizationErrors],
          "Fresh deployment failed and runtime signer zeroization was incomplete.",
        )
      : new AggregateError(
          zeroizationErrors,
          "Fresh deployment completed but runtime signer zeroization was incomplete.",
        );
  }
  if (failure) throw failure;
  report.runtimeSignerMaterialZeroized = true;
  return deepFreeze(report);
};

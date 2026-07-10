/* global AggregateError, BigInt */
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { blake2b } from "@noble/hashes/blake2b";
import {
  Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

/**
 * Runtime-only transport for upgrading one existing Loader-v3 program.
 *
 * This module deliberately has no CLI and performs no file I/O.  In
 * particular, it cannot create a stable Program keypair or deploy a new
 * Program account.  The caller must supply a separately reviewed, short-lived
 * plan and factories for disposable runtime signers.
 */

export const SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-upgrade-plan/v1";
export const SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-upgrade-report/v1";
export const SOLANA_LOADER_V3_RUNTIME_UPGRADE_READINESS_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-upgrade-readiness/v1";
export const SOLANA_LOADER_V3_RUNTIME_UPGRADE_CONFIRMATION_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-upgrade-confirmation/v1";
export const SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-upgrade-journal-event/v1";
export const SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA =
  "iroha-demo-solana-loader-v3-runtime-recovery-report/v1";
export const SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA =
  "iroha-demo-solana-loader-v3-sbf-validation-evidence/v2";
export const SOLANA_LOADER_V3_TARGET_ADMISSION_EVIDENCE_SCHEMA =
  "iroha-demo-solana-loader-v3-target-admission-evidence/v1";
export const SOLANA_TESTNET_GENESIS_HASH =
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
export const SOLANA_TESTNET_NETWORK = "solana-testnet";
export const SOLANA_UPGRADEABLE_LOADER_ID =
  "BPFLoaderUpgradeab1e11111111111111111111111";
export const SOLANA_PACKET_DATA_SIZE = PACKET_DATA_SIZE;
export const SOLANA_PROGRAMDATA_METADATA_LENGTH = 45;
export const SOLANA_BUFFER_METADATA_LENGTH = 37;
export const SOLANA_MAX_ACCOUNT_DATA_LENGTH = 10 * 1024 * 1024;
export const SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES = 10_240;
export const SOLANA_LOADER_V3_SBF_VALIDATOR_ID =
  "agave-solana-sbpf-requisite-verifier";
export const SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION = "0.21.0";
export const SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE =
  "local-solana-sbpf-structural-preflight";
export const SOLANA_LOADER_V3_SBF_VALIDATION_POLICY =
  "solana-loader-v3-sbf-validation-policy/v2:authenticated-release-x86_64-linux-helper+Executable::from_elf(SBPFVersion::V0,reject_broken_elfs=true)+RequisiteVerifier::verify;local-structural-preflight-only;exact-cluster-rollback-sentinel-required";
export const SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256 = `0x${createHash(
  "sha256",
)
  .update(SOLANA_LOADER_V3_SBF_VALIDATION_POLICY, "utf8")
  .digest("hex")}`;
export const SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS = Object.freeze([
  "agave-solana-sbpf-executable-from-elf-v0",
  "agave-solana-sbpf-reject-broken-elfs",
  "agave-solana-sbpf-requisite-verifier",
  "authenticated-helper-binary-sha256",
  "canonical-validator-source-bundle",
  "release-x86_64-linux-jit",
]);

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const TOP_LEVEL_KEYS = new Set([
  "schema",
  "operationId",
  "network",
  "genesisHash",
  "programId",
  "programdataAddress",
  "authorityAddress",
  "payerAddress",
  "spillAddress",
  "context",
  "before",
  "target",
  "extension",
  "policy",
]);
const CONTEXT_KEYS = new Set([
  "minFinalizedSlot",
  "expiresAtFinalizedSlot",
  "solanaCoreVersion",
  "featureSet",
]);
const BEFORE_KEYS = new Set([
  "programdataSlot",
  "programdataDataLength",
  "executableLength",
  "executableSha256",
  "codeHash",
]);
const TARGET_KEYS = new Set([
  "artifactSha256",
  "executableSha256",
  "codeHash",
  "executableLength",
  "sbfValidatorId",
  "sbfValidatorVersion",
  "sbfValidationPolicySha256",
  "sbfValidationEvidenceSha256",
]);
const EXTENSION_KEYS = new Set([
  "additionalBytes",
  "resultProgramdataDataLength",
]);
const POLICY_KEYS = new Set([
  "maxPacketBytes",
  "automaticMutationRetries",
  "allowNewProgramId",
  "runtimeOnlySigners",
]);
const CLAIM_EVENT_KEYS = new Set([
  "schema",
  "type",
  "operationId",
  "planSha256",
  "programId",
  "programdataAddress",
  "authorityAddress",
  "payerAddress",
  "bufferAddress",
  "targetArtifactSha256",
  "targetExecutableLength",
  "stage",
  "status",
  "finalizedContextSlot",
  "authorityLeaseRequired",
  "authorityLeaseScope",
  "bufferPossiblyCreated",
  "bufferConsumed",
  "recoveryAction",
]);
const CONFIRMATION_KEYS = new Set([
  "schema",
  "action",
  "submit",
  "irreversible",
  "operationId",
  "planSha256",
  "programId",
  "targetArtifactSha256",
]);
const SBF_EVIDENCE_KEYS = new Set([
  "schema",
  "valid",
  "deterministic",
  "validationScope",
  "exactClusterAdmission",
  "productionEligible",
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

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (value, keys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be a plain object.`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.has(key));
  const missing = [...keys].filter((key) => !actual.includes(key));
  if (unknown.length || missing.length) {
    throw new Error(`${label} must contain only its exact reviewed fields.`);
  }
};

const assertPlanShape = (plan) => {
  assertExactKeys(plan, TOP_LEVEL_KEYS, "Runtime upgrade plan");
  assertExactKeys(plan.context, CONTEXT_KEYS, "Runtime upgrade plan context");
  assertExactKeys(plan.before, BEFORE_KEYS, "Runtime upgrade before pin");
  assertExactKeys(plan.target, TARGET_KEYS, "Runtime upgrade target pin");
  assertExactKeys(plan.policy, POLICY_KEYS, "Runtime upgrade policy");
  if (plan.extension !== null) {
    assertExactKeys(
      plan.extension,
      EXTENSION_KEYS,
      "Runtime upgrade extension pin",
    );
  }
};

/** Returns the one accepted byte representation for an independently reviewed plan. */
export const canonicalSolanaLoaderV3RuntimeUpgradePlanBytes = (plan) => {
  assertPlanShape(plan);
  const ordered = {
    schema: plan.schema,
    operationId: plan.operationId,
    network: plan.network,
    genesisHash: plan.genesisHash,
    programId: plan.programId,
    programdataAddress: plan.programdataAddress,
    authorityAddress: plan.authorityAddress,
    payerAddress: plan.payerAddress,
    spillAddress: plan.spillAddress,
    context: {
      minFinalizedSlot: plan.context.minFinalizedSlot,
      expiresAtFinalizedSlot: plan.context.expiresAtFinalizedSlot,
      solanaCoreVersion: plan.context.solanaCoreVersion,
      featureSet: plan.context.featureSet,
    },
    before: {
      programdataSlot: plan.before.programdataSlot,
      programdataDataLength: plan.before.programdataDataLength,
      executableLength: plan.before.executableLength,
      executableSha256: plan.before.executableSha256,
      codeHash: plan.before.codeHash,
    },
    target: {
      artifactSha256: plan.target.artifactSha256,
      executableSha256: plan.target.executableSha256,
      codeHash: plan.target.codeHash,
      executableLength: plan.target.executableLength,
      sbfValidatorId: plan.target.sbfValidatorId,
      sbfValidatorVersion: plan.target.sbfValidatorVersion,
      sbfValidationPolicySha256: plan.target.sbfValidationPolicySha256,
      sbfValidationEvidenceSha256: plan.target.sbfValidationEvidenceSha256,
    },
    extension:
      plan.extension === null
        ? null
        : {
            additionalBytes: plan.extension.additionalBytes,
            resultProgramdataDataLength:
              plan.extension.resultProgramdataDataLength,
          },
    policy: {
      maxPacketBytes: plan.policy.maxPacketBytes,
      automaticMutationRetries: plan.policy.automaticMutationRetries,
      allowNewProgramId: plan.policy.allowNewProgramId,
      runtimeOnlySigners: plan.policy.runtimeOnlySigners,
    },
  };
  return Buffer.from(JSON.stringify(ordered), "utf8");
};

const normalizeValidatorLabel = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u.test(value)
  ) {
    throw new Error(`${label} must be a bounded public identifier.`);
  }
  return value;
};

export const canonicalSolanaLoaderV3SbfValidationEvidenceBytes = (evidence) => {
  assertExactKeys(evidence, SBF_EVIDENCE_KEYS, "SBF validation evidence");
  if (!Array.isArray(evidence.checks)) {
    throw new Error("SBF validation evidence checks must be an array.");
  }
  return Buffer.from(
    JSON.stringify({
      schema: evidence.schema,
      valid: evidence.valid,
      deterministic: evidence.deterministic,
      validationScope: evidence.validationScope,
      exactClusterAdmission: evidence.exactClusterAdmission,
      productionEligible: evidence.productionEligible,
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

export const canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes = (
  claimEvent,
) => {
  assertExactKeys(claimEvent, CLAIM_EVENT_KEYS, "Runtime upgrade claim event");
  return Buffer.from(
    JSON.stringify({
      schema: claimEvent.schema,
      type: claimEvent.type,
      operationId: claimEvent.operationId,
      planSha256: claimEvent.planSha256,
      programId: claimEvent.programId,
      programdataAddress: claimEvent.programdataAddress,
      authorityAddress: claimEvent.authorityAddress,
      payerAddress: claimEvent.payerAddress,
      bufferAddress: claimEvent.bufferAddress,
      targetArtifactSha256: claimEvent.targetArtifactSha256,
      targetExecutableLength: claimEvent.targetExecutableLength,
      stage: claimEvent.stage,
      status: claimEvent.status,
      finalizedContextSlot: claimEvent.finalizedContextSlot,
      authorityLeaseRequired: claimEvent.authorityLeaseRequired,
      authorityLeaseScope: claimEvent.authorityLeaseScope,
      bufferPossiblyCreated: claimEvent.bufferPossiblyCreated,
      bufferConsumed: claimEvent.bufferConsumed,
      recoveryAction: claimEvent.recoveryAction,
    }),
    "utf8",
  );
};

const normalizePublicKey = (value, label) => {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  let key;
  try {
    key = new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  if (key.toBase58() !== value) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  return value;
};

/**
 * Returns the one authority-global fencing scope accepted by this transport.
 * Program and operation identities deliberately do not participate: every
 * use of one upgrade authority on canonical testnet must share one fence.
 */
export const solanaLoaderV3AuthorityGlobalLeaseScope = (authorityAddress) =>
  `${SOLANA_TESTNET_NETWORK}:${SOLANA_TESTNET_GENESIS_HASH}:${normalizePublicKey(
    authorityAddress,
    "Upgrade authority lease scope",
  )}`;

const normalizeHash = (value, label) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase 32-byte 0x hash.`);
  }
  return value;
};

const normalizePublicJournalId = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new Error(
      "Durable operation journal id must be a bounded public identifier.",
    );
  }
  return value;
};

const normalizeOpaqueSignerCapability = (value, label) => {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    throw new Error(`${label} must be an opaque capability object.`);
  }
  return value;
};

const positiveSafeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
};

const positiveSlotString = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string.`);
  }
  const slot = BigInt(value);
  if (slot > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must fit a safe Solana slot.`);
  }
  return value;
};

export const solanaSha256 = (bytes) =>
  `0x${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`;

export const solanaBlake2b256 = (bytes) =>
  `0x${Buffer.from(blake2b(Uint8Array.from(bytes), { dkLen: 32 })).toString(
    "hex",
  )}`;

const readU32 = (bytes, offset) => Buffer.from(bytes).readUInt32LE(offset);

const assertElf = (bytes, label) => {
  if (bytes.length < 64 || !bytes.subarray(0, 4).equals(ELF_MAGIC)) {
    throw new Error(`${label} must be a non-empty SBF ELF executable.`);
  }
  const programHeaderOffset = Number(bytes.readBigUInt64LE(32));
  const elfHeaderSize = bytes.readUInt16LE(52);
  const programHeaderEntrySize = bytes.readUInt16LE(54);
  const programHeaderCount = bytes.readUInt16LE(56);
  if (
    bytes[4] !== 2 ||
    bytes[5] !== 1 ||
    bytes[6] !== 1 ||
    bytes.readUInt16LE(16) !== 3 ||
    bytes.readUInt16LE(18) !== 247 ||
    bytes.readUInt32LE(20) !== 1 ||
    !Number.isSafeInteger(programHeaderOffset) ||
    programHeaderOffset < 64 ||
    elfHeaderSize !== 64 ||
    programHeaderEntrySize !== 56 ||
    programHeaderCount === 0 ||
    programHeaderOffset + programHeaderEntrySize * programHeaderCount >
      bytes.length
  ) {
    throw new Error(`${label} has an invalid static SBF ELF header.`);
  }
};

const deriveProgramdataAddress = (programId) =>
  PublicKey.findProgramAddressSync(
    [new PublicKey(programId).toBuffer()],
    LOADER,
  )[0].toBase58();

/** Strictly validates a reviewed plan without consulting RPC state. */
export const validateSolanaLoaderV3RuntimeUpgradePlan = ({
  planBytes,
  expectedPlanSha256,
  targetExecutableBytes,
} = {}) => {
  if (!(planBytes instanceof Uint8Array)) {
    throw new Error(
      "Reviewed runtime upgrade plan must be supplied as exact bytes.",
    );
  }
  const reviewedPlanBytes = Buffer.from(planBytes);
  const normalizedExpectedPlanSha256 = normalizeHash(
    expectedPlanSha256,
    "Expected runtime upgrade plan SHA-256",
  );
  const planSha256 = solanaSha256(reviewedPlanBytes);
  if (planSha256 !== normalizedExpectedPlanSha256) {
    throw new Error(
      "Exact runtime upgrade plan bytes do not match the independently supplied SHA-256.",
    );
  }
  let plan;
  try {
    plan = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(reviewedPlanBytes),
    );
  } catch {
    throw new Error(
      "Reviewed runtime upgrade plan bytes are not strict UTF-8 JSON.",
    );
  }
  assertPlanShape(plan);
  const canonicalPlanBytes =
    canonicalSolanaLoaderV3RuntimeUpgradePlanBytes(plan);
  if (!reviewedPlanBytes.equals(canonicalPlanBytes)) {
    throw new Error(
      "Reviewed runtime upgrade plan bytes are not in the one canonical JSON encoding.",
    );
  }
  if (plan.schema !== SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA) {
    throw new Error("Runtime upgrade plan schema is not supported.");
  }
  normalizeHash(plan.operationId, "Runtime upgrade operation id");
  if (
    plan.network !== SOLANA_TESTNET_NETWORK ||
    plan.genesisHash !== SOLANA_TESTNET_GENESIS_HASH
  ) {
    throw new Error("Runtime upgrade plan must pin canonical Solana testnet.");
  }
  const programId = normalizePublicKey(plan.programId, "Program id");
  const programdataAddress = normalizePublicKey(
    plan.programdataAddress,
    "ProgramData address",
  );
  const authorityAddress = normalizePublicKey(
    plan.authorityAddress,
    "Upgrade authority",
  );
  const payerAddress = normalizePublicKey(plan.payerAddress, "Runtime payer");
  const spillAddress = normalizePublicKey(plan.spillAddress, "Spill account");
  if (programId === programdataAddress) {
    throw new Error("Program and ProgramData addresses must differ.");
  }
  if (
    [authorityAddress, payerAddress].some(
      (address) => address === programId || address === programdataAddress,
    )
  ) {
    throw new Error(
      "Runtime authority and payer must not reuse a stable Program identity.",
    );
  }
  if (deriveProgramdataAddress(programId) !== programdataAddress) {
    throw new Error("ProgramData address is not the canonical Loader-v3 PDA.");
  }
  if (spillAddress !== payerAddress) {
    throw new Error("The reviewed spill account must be the runtime payer.");
  }
  const minFinalizedSlot = positiveSafeInteger(
    plan.context.minFinalizedSlot,
    "Minimum finalized context slot",
  );
  const expiresAtFinalizedSlot = positiveSafeInteger(
    plan.context.expiresAtFinalizedSlot,
    "Expiry finalized context slot",
  );
  if (expiresAtFinalizedSlot <= minFinalizedSlot) {
    throw new Error("Runtime upgrade context expiry must follow its floor.");
  }
  const solanaCoreVersion = normalizeValidatorLabel(
    plan.context.solanaCoreVersion,
    "Solana core version",
  );
  const featureSet = positiveSafeInteger(
    plan.context.featureSet,
    "Solana feature set",
  );
  const beforeSlot = positiveSlotString(
    plan.before.programdataSlot,
    "Before ProgramData slot",
  );
  const beforeDataLength = positiveSafeInteger(
    plan.before.programdataDataLength,
    "Before ProgramData data length",
  );
  const beforeExecutableLength = positiveSafeInteger(
    plan.before.executableLength,
    "Before executable length",
  );
  if (
    beforeDataLength <= SOLANA_PROGRAMDATA_METADATA_LENGTH ||
    beforeDataLength > SOLANA_MAX_ACCOUNT_DATA_LENGTH ||
    beforeExecutableLength !==
      beforeDataLength - SOLANA_PROGRAMDATA_METADATA_LENGTH
  ) {
    throw new Error(
      "Before ProgramData and executable lengths are inconsistent.",
    );
  }
  normalizeHash(plan.before.executableSha256, "Before executable SHA-256");
  normalizeHash(plan.before.codeHash, "Before executable code hash");
  if (!(targetExecutableBytes instanceof Uint8Array)) {
    throw new Error(
      "Target artifact must be supplied as exact executable bytes.",
    );
  }
  const target = Buffer.from(targetExecutableBytes);
  assertElf(target, "Target artifact");
  if (
    target.length >
    SOLANA_MAX_ACCOUNT_DATA_LENGTH - SOLANA_PROGRAMDATA_METADATA_LENGTH
  ) {
    throw new Error("Target artifact exceeds Loader-v3 account capacity.");
  }
  const targetLength = positiveSafeInteger(
    plan.target.executableLength,
    "Target executable length",
  );
  if (targetLength !== target.length) {
    throw new Error(
      "Target executable length does not match exact target bytes.",
    );
  }
  const targetSha256 = solanaSha256(target);
  const targetCodeHash = solanaBlake2b256(target);
  for (const [value, label] of [
    [plan.target.artifactSha256, "Target artifact SHA-256"],
    [plan.target.executableSha256, "Target executable SHA-256"],
  ]) {
    normalizeHash(value, label);
    if (value !== targetSha256) {
      throw new Error(`${label} does not match exact target bytes.`);
    }
  }
  normalizeHash(plan.target.codeHash, "Target executable code hash");
  if (plan.target.codeHash !== targetCodeHash) {
    throw new Error(
      "Target executable code hash does not match exact target bytes.",
    );
  }
  const sbfValidatorId = normalizeValidatorLabel(
    plan.target.sbfValidatorId,
    "SBF validator id",
  );
  const sbfValidatorVersion = normalizeValidatorLabel(
    plan.target.sbfValidatorVersion,
    "SBF validator version",
  );
  const sbfValidationPolicySha256 = normalizeHash(
    plan.target.sbfValidationPolicySha256,
    "SBF validation policy SHA-256",
  );
  const sbfValidationEvidenceSha256 = normalizeHash(
    plan.target.sbfValidationEvidenceSha256,
    "SBF validation evidence SHA-256",
  );
  if (
    sbfValidatorId !== SOLANA_LOADER_V3_SBF_VALIDATOR_ID ||
    sbfValidatorVersion !== SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION ||
    sbfValidationPolicySha256 !== SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256
  ) {
    throw new Error(
      "Runtime upgrade plan must pin the approved production local SBF structural validator and policy.",
    );
  }
  const currentCapacity = beforeExecutableLength;
  if (target.length <= currentCapacity) {
    if (plan.extension !== null) {
      throw new Error(
        "An extension is forbidden when current capacity is sufficient.",
      );
    }
  } else {
    if (plan.extension === null) {
      throw new Error(
        "Insufficient ProgramData capacity requires an exact checked extension plan.",
      );
    }
    const needed = target.length - currentCapacity;
    const accountHeadroom = SOLANA_MAX_ACCOUNT_DATA_LENGTH - beforeDataLength;
    const expectedAdditional =
      accountHeadroom < SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES
        ? accountHeadroom
        : Math.max(needed, SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES);
    const additionalBytes = positiveSafeInteger(
      plan.extension.additionalBytes,
      "Checked extension bytes",
    );
    if (additionalBytes !== expectedAdditional) {
      throw new Error(
        "Checked extension must use the minimum exact sufficient length.",
      );
    }
    const expectedResult = beforeDataLength + additionalBytes;
    if (
      plan.extension.resultProgramdataDataLength !== expectedResult ||
      expectedResult > SOLANA_MAX_ACCOUNT_DATA_LENGTH
    ) {
      throw new Error("Checked extension result length is invalid.");
    }
  }
  if (
    plan.policy.maxPacketBytes !== SOLANA_PACKET_DATA_SIZE ||
    plan.policy.automaticMutationRetries !== 0 ||
    plan.policy.allowNewProgramId !== false ||
    plan.policy.runtimeOnlySigners !== true
  ) {
    throw new Error(
      "Runtime upgrade policy must prohibit new ids and mutation retries.",
    );
  }
  return Object.freeze({
    planSha256,
    operationId: plan.operationId,
    programId,
    programdataAddress,
    authorityAddress,
    payerAddress,
    spillAddress,
    minFinalizedSlot,
    expiresAtFinalizedSlot,
    solanaCoreVersion,
    featureSet,
    beforeSlot,
    beforeDataLength,
    beforeExecutableLength,
    beforeExecutableSha256: plan.before.executableSha256,
    beforeCodeHash: plan.before.codeHash,
    targetLength,
    targetSha256,
    targetCodeHash,
    sbfValidatorId,
    sbfValidatorVersion,
    sbfValidationPolicySha256,
    sbfValidationEvidenceSha256,
    extension:
      plan.extension === null
        ? null
        : Object.freeze({
            additionalBytes: plan.extension.additionalBytes,
            resultProgramdataDataLength:
              plan.extension.resultProgramdataDataLength,
          }),
    target,
  });
};

const u32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value, 0);
  return bytes;
};

const u64 = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value), 0);
  return bytes;
};

export const encodeLoaderV3InitializeBufferData = () => u32(0);

export const encodeLoaderV3WriteData = ({ offset, bytes } = {}) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffff_ffff) {
    throw new Error("Loader-v3 write offset must be a u32.");
  }
  const body = Buffer.from(bytes ?? []);
  if (body.length === 0 || body.length > 0xffff_ffff) {
    throw new Error("Loader-v3 write body must be non-empty and bounded.");
  }
  return Buffer.concat([u32(1), u32(offset), u64(body.length), body]);
};

export const encodeLoaderV3UpgradeData = () => u32(3);
export const encodeLoaderV3CloseData = () => u32(5);

export const encodeLoaderV3DeployWithMaxDataLenData = (maxDataLength) => {
  if (!Number.isSafeInteger(maxDataLength) || maxDataLength <= 0) {
    throw new Error("Loader-v3 maximum program data length is invalid.");
  }
  return Buffer.concat([u32(2), u64(maxDataLength)]);
};

export const encodeLoaderV3ExtendProgramCheckedData = (
  additionalBytes,
  { currentProgramdataDataLength = null } = {},
) => {
  const legalExtendToMaximum =
    Number.isSafeInteger(currentProgramdataDataLength) &&
    currentProgramdataDataLength > 0 &&
    currentProgramdataDataLength < SOLANA_MAX_ACCOUNT_DATA_LENGTH &&
    additionalBytes ===
      SOLANA_MAX_ACCOUNT_DATA_LENGTH - currentProgramdataDataLength &&
    additionalBytes < SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES;
  if (
    !Number.isSafeInteger(additionalBytes) ||
    (additionalBytes < SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES &&
      !legalExtendToMaximum) ||
    additionalBytes > 0xffff_ffff
  ) {
    throw new Error("Checked Loader-v3 extension length is invalid.");
  }
  return Buffer.concat([u32(9), u32(additionalBytes)]);
};

const meta = (pubkey, isSigner, isWritable) => ({
  pubkey: new PublicKey(pubkey),
  isSigner,
  isWritable,
});

export const buildLoaderV3InitializeBufferInstruction = ({
  bufferAddress,
  authorityAddress,
} = {}) =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(bufferAddress, false, true),
      meta(authorityAddress, false, false),
    ],
    data: encodeLoaderV3InitializeBufferData(),
  });

export const buildLoaderV3WriteInstruction = ({
  bufferAddress,
  authorityAddress,
  offset,
  bytes,
} = {}) =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(bufferAddress, false, true),
      meta(authorityAddress, true, false),
    ],
    data: encodeLoaderV3WriteData({ offset, bytes }),
  });

export const buildLoaderV3UpgradeInstruction = ({
  programId,
  programdataAddress,
  bufferAddress,
  spillAddress,
  authorityAddress,
} = {}) => {
  const canonicalProgramdata = deriveProgramdataAddress(programId);
  if (canonicalProgramdata !== new PublicKey(programdataAddress).toBase58()) {
    throw new Error("Upgrade instruction ProgramData is not the program PDA.");
  }
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(programdataAddress, false, true),
      meta(programId, false, true),
      meta(bufferAddress, false, true),
      meta(spillAddress, false, true),
      meta(SYSVAR_RENT_PUBKEY, false, false),
      meta(SYSVAR_CLOCK_PUBKEY, false, false),
      meta(authorityAddress, true, false),
    ],
    data: encodeLoaderV3UpgradeData(),
  });
};

export const buildLoaderV3DeployWithMaxDataLenInstruction = ({
  payerAddress,
  programId,
  programdataAddress,
  bufferAddress,
  authorityAddress,
  maxDataLength,
} = {}) => {
  if (
    deriveProgramdataAddress(programId) !==
    new PublicKey(programdataAddress).toBase58()
  ) {
    throw new Error("Deploy probe ProgramData is not the program PDA.");
  }
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(payerAddress, true, true),
      meta(programdataAddress, false, true),
      meta(programId, false, true),
      meta(bufferAddress, false, true),
      meta(SYSVAR_RENT_PUBKEY, false, false),
      meta(SYSVAR_CLOCK_PUBKEY, false, false),
      meta(SystemProgram.programId, false, false),
      meta(authorityAddress, true, false),
    ],
    data: encodeLoaderV3DeployWithMaxDataLenData(maxDataLength),
  });
};

export const buildLoaderV3InvalidRollbackSentinelInstruction = () =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [],
    data: Buffer.from([0xff, 0xff, 0xff, 0xff]),
  });

export const buildLoaderV3CloseBufferInstruction = ({
  bufferAddress,
  recipientAddress,
  authorityAddress,
} = {}) =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(bufferAddress, false, true),
      meta(recipientAddress, false, true),
      meta(authorityAddress, true, false),
    ],
    data: encodeLoaderV3CloseData(),
  });

export const buildLoaderV3ExtendProgramCheckedInstruction = ({
  programId,
  programdataAddress,
  authorityAddress,
  payerAddress,
  additionalBytes,
  currentProgramdataDataLength,
} = {}) => {
  if (
    deriveProgramdataAddress(programId) !==
    new PublicKey(programdataAddress).toBase58()
  ) {
    throw new Error("Checked extension ProgramData is not the program PDA.");
  }
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      meta(programdataAddress, false, true),
      meta(programId, false, true),
      meta(authorityAddress, true, false),
      meta(SystemProgram.programId, false, false),
      meta(payerAddress, true, true),
    ],
    data: encodeLoaderV3ExtendProgramCheckedData(additionalBytes, {
      currentProgramdataDataLength,
    }),
  });
};

const base58Encode = (input) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = Buffer.from(input);
  if (bytes.length === 0) return "";
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
  const encoded = digits
    .reverse()
    .map((digit) => alphabet[digit])
    .join("");
  return `${"1".repeat(zeroes)}${zeroes === bytes.length ? "" : encoded}`;
};

const uniqueSigners = (signers) => {
  const byAddress = new Map();
  for (const signer of signers) {
    const address = signer?.publicKey?.toBase58?.();
    if (!address) throw new Error("Runtime signer is invalid.");
    if (!byAddress.has(address)) byAddress.set(address, signer);
  }
  return [...byAddress.values()];
};

const buildSignedTransaction = ({
  instructions,
  payerSigner,
  signers,
  latestBlockhash,
}) => {
  if (
    typeof latestBlockhash?.blockhash !== "string" ||
    !latestBlockhash.blockhash ||
    !Number.isSafeInteger(latestBlockhash.lastValidBlockHeight)
  ) {
    throw new Error("A fresh finalized blockhash is required.");
  }
  const transaction = new Transaction({
    feePayer: payerSigner.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  });
  transaction.add(...instructions);
  transaction.sign(...uniqueSigners([payerSigner, ...signers]));
  const raw = transaction.serialize({
    requireAllSignatures: true,
    verifySignatures: true,
  });
  return { transaction, raw };
};

/**
 * Selects the largest write body whose actually signed legacy transaction is
 * no larger than the Solana packet limit.  Serialization failures are treated
 * as over-limit candidates.
 */
export const selectLargestLoaderV3WriteChunk = ({
  remainingBytes,
  offset,
  bufferAddress,
  authorityAddress,
  payerSigner,
  authoritySigner,
  latestBlockhash,
  maxPacketBytes = SOLANA_PACKET_DATA_SIZE,
} = {}) => {
  const remaining = Buffer.from(remainingBytes ?? []);
  if (remaining.length === 0) {
    throw new Error("At least one remaining Loader-v3 byte is required.");
  }
  if (maxPacketBytes !== SOLANA_PACKET_DATA_SIZE) {
    throw new Error("Loader-v3 writes must use the canonical packet limit.");
  }
  let low = 1;
  let high = remaining.length;
  let selected = null;
  while (low <= high) {
    const length = Math.floor((low + high) / 2);
    try {
      const instruction = buildLoaderV3WriteInstruction({
        bufferAddress,
        authorityAddress,
        offset,
        bytes: remaining.subarray(0, length),
      });
      const built = buildSignedTransaction({
        instructions: [instruction],
        payerSigner,
        signers: [authoritySigner],
        latestBlockhash,
      });
      if (built.raw.length <= maxPacketBytes) {
        selected = {
          ...built,
          instruction,
          length,
          packetLength: built.raw.length,
        };
        low = length + 1;
      } else {
        high = length - 1;
      }
    } catch {
      high = length - 1;
    }
  }
  if (!selected) {
    throw new Error("No non-empty Loader-v3 write fits the packet limit.");
  }
  return selected;
};

const instructionSummary = (instruction) => ({
  programId: instruction.programId.toBase58(),
  dataHex: `0x${Buffer.from(instruction.data).toString("hex")}`,
  metas: instruction.keys.map((entry) => ({
    pubkey: entry.pubkey.toBase58(),
    isSigner: entry.isSigner === true,
    isWritable: entry.isWritable === true,
  })),
});

const messageBytesFromReadback = (readback) => {
  const message = readback?.transaction?.message;
  if (message && typeof message.serialize === "function") {
    return Buffer.from(message.serialize());
  }
  throw new Error("Finalized transaction message readback is missing.");
};

const defaultBroadcastFinalized = async ({
  connection,
  rawTransaction,
  expectedPrimarySignature,
  latestBlockhash,
  sleep,
}) => {
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    maxRetries: 0,
  });
  if (signature !== expectedPrimarySignature) {
    throw new Error(
      "RPC signature differs from the locally signed transaction.",
    );
  }
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "finalized",
  );
  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  let transactionReadback = null;
  for (let attempt = 0; attempt < 8 && !transactionReadback; attempt += 1) {
    transactionReadback = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!transactionReadback && attempt < 7) await sleep(250);
  }
  return {
    signature,
    confirmation,
    signatureStatus: statuses?.value?.[0] ?? null,
    transactionReadback,
  };
};

const buildSignedTransactionIntent = ({ built, latestBlockhash, stage }) => {
  if (built.raw.length > SOLANA_PACKET_DATA_SIZE) {
    throw new Error(`${stage} transaction exceeds the Solana packet limit.`);
  }
  const messageBytes = Buffer.from(built.transaction.serializeMessage());
  const expectedSignatures = built.transaction.signatures.map((entry) => {
    if (!entry.signature) {
      throw new Error(`${stage} transaction is not fully signed.`);
    }
    return base58Encode(entry.signature);
  });
  return Object.freeze({
    stage,
    expectedPrimarySignature: expectedSignatures[0],
    expectedSignatures: Object.freeze(expectedSignatures),
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    messageSha256: solanaSha256(messageBytes),
    packetSha256: solanaSha256(built.raw),
    packetLength: built.raw.length,
  });
};

const journalIntentDetails = (intent) => ({
  expectedSignature: intent.expectedPrimarySignature,
  expectedSignatures: [...intent.expectedSignatures],
  blockhash: intent.blockhash,
  lastValidBlockHeight: intent.lastValidBlockHeight,
  messageSha256: intent.messageSha256,
  packetSha256: intent.packetSha256,
  packetLength: intent.packetLength,
});

const publicTransactionErrorEvidence = (error) => {
  let encoded;
  try {
    encoded = JSON.stringify(error);
  } catch {
    throw new Error(
      "Finalized transaction failure is not bounded public JSON evidence.",
    );
  }
  if (
    typeof encoded !== "string" ||
    encoded === "null" ||
    Buffer.byteLength(encoded, "utf8") > 4096
  ) {
    throw new Error(
      "Finalized transaction failure is not bounded public JSON evidence.",
    );
  }
  return Object.freeze({
    transactionError: JSON.parse(encoded),
    transactionErrorSha256: solanaSha256(Buffer.from(encoded, "utf8")),
  });
};

const submitExactTransaction = async ({
  connection,
  built,
  latestBlockhash,
  broadcastFinalized,
  sleep,
  stage,
  preparedIntent = null,
  submittedResult = null,
  allowBroadcast = true,
}) => {
  const intent = buildSignedTransactionIntent({
    built,
    latestBlockhash,
    stage,
  });
  if (
    preparedIntent &&
    JSON.stringify(preparedIntent) !== JSON.stringify(intent)
  ) {
    throw new Error(
      `${stage} prepared transaction intent changed before send.`,
    );
  }
  const messageBytes = Buffer.from(built.transaction.serializeMessage());
  const messageSha256 = intent.messageSha256;
  const expectedSignatures = intent.expectedSignatures;
  const expectedPrimarySignature = intent.expectedPrimarySignature;
  if (!allowBroadcast && !isRecord(submittedResult)) {
    throw new Error(
      `${stage} delayed finalization resolution is missing exact readback evidence.`,
    );
  }
  const submitted = allowBroadcast
    ? await broadcastFinalized({
        connection,
        rawTransaction: built.raw,
        expectedPrimarySignature,
        expectedSignatures,
        latestBlockhash,
        messageBytes,
        messageSha256,
        stage,
        sleep,
      })
    : submittedResult;
  const status = submitted?.signatureStatus;
  const readback = submitted?.transactionReadback;
  const readbackSlot = readback?.slot;
  const fetchedSignatures =
    readback?.transaction?.signatures ?? readback?.signatures;
  if (
    submitted?.signature !== expectedPrimarySignature ||
    submitted?.confirmation?.value?.err !== null ||
    !status ||
    status.err !== null ||
    status.confirmationStatus !== "finalized" ||
    !Number.isSafeInteger(status.slot) ||
    status.slot <= 0 ||
    readbackSlot !== status.slot ||
    !isRecord(readback?.meta) ||
    readback.meta.err !== null ||
    !Array.isArray(fetchedSignatures) ||
    JSON.stringify(fetchedSignatures) !== JSON.stringify(expectedSignatures) ||
    solanaSha256(messageBytesFromReadback(readback)) !== messageSha256
  ) {
    throw new Error(`${stage} finalized transaction readback is not exact.`);
  }
  return {
    stage,
    signature: expectedPrimarySignature,
    signatures: expectedSignatures,
    finalizedSlot: readbackSlot,
    packetLength: built.raw.length,
    packetSha256: intent.packetSha256,
    blockhash: intent.blockhash,
    lastValidBlockHeight: intent.lastValidBlockHeight,
    messageSha256,
    fetchedMessageSha256: messageSha256,
    instructions: built.transaction.instructions.map(instructionSummary),
  };
};

const parseProgram = (bytes) => {
  const data = Buffer.from(bytes);
  if (data.length !== 36 || readU32(data, 0) !== 2) {
    throw new Error("Existing Program account is not Loader-v3 Program state.");
  }
  return { programdataAddress: new PublicKey(data.subarray(4)).toBase58() };
};

const parseProgramdata = (bytes) => {
  const data = Buffer.from(bytes);
  if (
    data.length <= SOLANA_PROGRAMDATA_METADATA_LENGTH ||
    readU32(data, 0) !== 3
  ) {
    throw new Error(
      "Existing ProgramData account is not Loader-v3 ProgramData state.",
    );
  }
  const slot = data.readBigUInt64LE(4);
  if (slot === 0n || slot > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Existing ProgramData slot is invalid.");
  }
  if (data[12] !== 1) {
    throw new Error(
      "Existing ProgramData must have the exact reviewed upgrade authority.",
    );
  }
  const executable = Buffer.from(
    data.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH),
  );
  assertElf(executable, "Existing ProgramData executable");
  return {
    slot: slot.toString(),
    slotNumber: Number(slot),
    authorityAddress: new PublicKey(data.subarray(13, 45)).toBase58(),
    executable,
    dataLength: data.length,
    executableLength: executable.length,
    executableSha256: solanaSha256(executable),
    codeHash: solanaBlake2b256(executable),
  };
};

const parseBuffer = (bytes) => {
  const data = Buffer.from(bytes);
  if (data.length < SOLANA_BUFFER_METADATA_LENGTH || readU32(data, 0) !== 1) {
    throw new Error("Ephemeral buffer is not Loader-v3 Buffer state.");
  }
  if (data[4] !== 1) {
    throw new Error("Ephemeral buffer must retain its runtime authority.");
  }
  return {
    authorityAddress: new PublicKey(data.subarray(5, 37)).toBase58(),
    executable: Buffer.from(data.subarray(SOLANA_BUFFER_METADATA_LENGTH)),
    dataLength: data.length,
  };
};

const defaultReadAccount = async ({ connection, address, minContextSlot }) =>
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
  if (!result?.value) {
    if (allowMissing) return null;
    throw new Error(`${label} is missing from finalized Solana state.`);
  }
  if (
    !Number.isSafeInteger(result?.context?.slot) ||
    result.context.slot < minContextSlot
  ) {
    throw new Error(`${label} readback is older than the required context.`);
  }
  const info = result.value;
  if (!info.owner?.toBase58 || !(info.data instanceof Uint8Array)) {
    throw new Error(`${label} readback is malformed.`);
  }
  return {
    address,
    contextSlot: result.context.slot,
    owner: info.owner.toBase58(),
    executable: info.executable === true,
    lamports: info.lamports,
    data: Buffer.from(info.data),
  };
};

const readExistingProgram = async ({
  connection,
  normalized,
  minContextSlot,
  readAccount,
  expiresAtFinalizedSlot,
}) => {
  const programRaw = await readAccount({
    connection,
    address: normalized.programId,
    minContextSlot,
    label: "Existing Program",
  });
  const programdataRaw = await readAccount({
    connection,
    address: normalized.programdataAddress,
    minContextSlot,
    label: "Existing ProgramData",
  });
  if (programRaw === programdataRaw) {
    throw new Error(
      "Program and ProgramData RPC readbacks must be independent.",
    );
  }
  const program = normalizeAccount(
    programRaw,
    normalized.programId,
    "Existing Program",
    minContextSlot,
    false,
  );
  const programdata = normalizeAccount(
    programdataRaw,
    normalized.programdataAddress,
    "Existing ProgramData",
    minContextSlot,
    false,
  );
  if (
    program.contextSlot > expiresAtFinalizedSlot ||
    programdata.contextSlot > expiresAtFinalizedSlot
  ) {
    throw new Error("Reviewed runtime upgrade context has expired.");
  }
  if (
    program.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
    !program.executable ||
    programdata.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
    programdata.executable
  ) {
    throw new Error(
      "Existing program ownership or executable flags are invalid.",
    );
  }
  const parsedProgram = parseProgram(program.data);
  if (parsedProgram.programdataAddress !== normalized.programdataAddress) {
    throw new Error("Existing Program links a different ProgramData account.");
  }
  const parsedProgramdata = parseProgramdata(programdata.data);
  if (parsedProgramdata.slotNumber > programdata.contextSlot) {
    throw new Error("ProgramData modification slot exceeds its RPC context.");
  }
  if (parsedProgramdata.authorityAddress !== normalized.authorityAddress) {
    throw new Error(
      "Existing ProgramData authority differs from the reviewed plan.",
    );
  }
  return { program, programdata, parsedProgram, parsedProgramdata };
};

const beforeSummary = (readback) => ({
  programId: readback.program.address,
  programOwner: readback.program.owner,
  programExecutable: readback.program.executable,
  programContextSlot: readback.program.contextSlot,
  programdataAddress: readback.programdata.address,
  programdataOwner: readback.programdata.owner,
  programdataExecutable: readback.programdata.executable,
  programdataContextSlot: readback.programdata.contextSlot,
  programdataSlot: readback.parsedProgramdata.slot,
  authorityAddress: readback.parsedProgramdata.authorityAddress,
  programdataDataLength: readback.parsedProgramdata.dataLength,
  executableLength: readback.parsedProgramdata.executableLength,
  executableSha256: readback.parsedProgramdata.executableSha256,
  codeHash: readback.parsedProgramdata.codeHash,
});

const assertReviewedBefore = (normalized, readback) => {
  const actual = readback.parsedProgramdata;
  if (
    actual.slot !== normalized.beforeSlot ||
    actual.dataLength !== normalized.beforeDataLength ||
    actual.executableLength !== normalized.beforeExecutableLength ||
    actual.executableSha256 !== normalized.beforeExecutableSha256 ||
    actual.codeHash !== normalized.beforeCodeHash
  ) {
    throw new Error(
      "Fresh finalized ProgramData does not match every before pin.",
    );
  }
  const target = normalized.target;
  if (
    actual.executable.subarray(0, target.length).equals(target) &&
    actual.executable.subarray(target.length).every((byte) => byte === 0)
  ) {
    throw new Error(
      "Target executable is already installed; same-target upgrades are forbidden.",
    );
  }
};

const runRollbackSentinelAdmission = async ({
  mode,
  connection,
  normalized,
  expectedProgramdataBytes,
  bufferAddress,
  bufferExecutable,
  bufferContextSlot,
  intendedExecutableCapacity,
  authoritySigner,
  payerSigner,
  assertNetwork,
  getLatestBlockhash,
  getMinimumBalanceForRentExemption,
  readAccount,
  simulateRawTransaction,
  getSignatureStatus,
  generateProbeKeypair,
  getClusterVersion,
}) => {
  if (typeof simulateRawTransaction !== "function") {
    throw new Error(
      "Exact-cluster rollback-sentinel simulation dependency is required.",
    );
  }
  if (typeof getSignatureStatus !== "function") {
    throw new Error("Simulation signature-status dependency is required.");
  }
  const probeViews = [];
  let probeSigner = null;
  let outcome = null;
  let failure = null;
  try {
    await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
    await assertPinnedClusterRuntime({
      connection,
      normalized,
      getClusterVersion,
    });
    const latestBlockhash = await getLatestBlockhash();
    const instructions = [];
    let sentinelIndex;
    let probeProgramAddress = null;
    let probeProgramdataAddress = null;
    if (mode === "deploy") {
      const probeSource = await generateProbeKeypair();
      probeProgramAddress = probeSource?.publicKey?.toBase58?.();
      probeSigner = disposableSignerFromSource({
        source: probeSource,
        role: "Rollback-sentinel probe Program signer",
        address: probeProgramAddress,
        secretViews: probeViews,
      });
      if (
        [
          normalized.programId,
          normalized.programdataAddress,
          normalized.authorityAddress,
          normalized.payerAddress,
          bufferAddress,
        ].includes(probeProgramAddress)
      ) {
        throw new Error("Rollback-sentinel probe aliases a governed account.");
      }
      probeProgramdataAddress = deriveProgramdataAddress(probeProgramAddress);
      for (const address of [probeProgramAddress, probeProgramdataAddress]) {
        const absent = await readAccount({
          connection,
          address,
          minContextSlot: bufferContextSlot,
          label: "Rollback-sentinel probe account before simulation",
          allowMissing: true,
        });
        if (!accountInfoAbsentOrClosed(absent)) {
          throw new Error("Rollback-sentinel probe account already exists.");
        }
      }
      const programLamports = await getMinimumBalanceForRentExemption(36);
      if (!Number.isSafeInteger(programLamports) || programLamports <= 0) {
        throw new Error("Rollback-sentinel probe rent requirement is invalid.");
      }
      instructions.push(
        SystemProgram.createAccount({
          fromPubkey: payerSigner.publicKey,
          newAccountPubkey: probeSigner.publicKey,
          lamports: programLamports,
          space: 36,
          programId: LOADER,
        }),
        buildLoaderV3DeployWithMaxDataLenInstruction({
          payerAddress: payerSigner.publicKey,
          programId: probeSigner.publicKey,
          programdataAddress: probeProgramdataAddress,
          bufferAddress,
          authorityAddress: authoritySigner.publicKey,
          maxDataLength: intendedExecutableCapacity,
        }),
        buildLoaderV3InvalidRollbackSentinelInstruction(),
      );
      sentinelIndex = 2;
    } else if (mode === "upgrade") {
      instructions.push(
        buildLoaderV3UpgradeInstruction({
          programId: normalized.programId,
          programdataAddress: normalized.programdataAddress,
          bufferAddress,
          spillAddress: normalized.spillAddress,
          authorityAddress: normalized.authorityAddress,
        }),
        buildLoaderV3InvalidRollbackSentinelInstruction(),
      );
      sentinelIndex = 1;
    } else {
      throw new Error("Rollback-sentinel simulation mode is invalid.");
    }
    const built = buildSignedTransaction({
      instructions,
      payerSigner,
      signers:
        mode === "deploy" ? [authoritySigner, probeSigner] : [authoritySigner],
      latestBlockhash,
    });
    const stage = `${mode}-rollback-sentinel-admission`;
    const intent = buildSignedTransactionIntent({
      built,
      latestBlockhash,
      stage,
    });
    if ((await getSignatureStatus(intent.expectedPrimarySignature)) !== null) {
      throw new Error("Rollback-sentinel simulation signature already exists.");
    }
    const simulationConfig = {
      sigVerify: true,
      replaceRecentBlockhash: false,
      commitment: "finalized",
      minContextSlot: bufferContextSlot,
    };
    const simulation = await simulateRawTransaction({
      connection,
      rawTransaction: Buffer.from(built.raw),
      config: simulationConfig,
      expectedSignature: intent.expectedPrimarySignature,
      expectedSignatures: [...intent.expectedSignatures],
      messageSha256: intent.messageSha256,
      packetSha256: intent.packetSha256,
      stage,
    });
    const simulationSlot = simulation?.context?.slot;
    const error = simulation?.value?.err;
    const logs = simulation?.value?.logs;
    const exactError =
      isRecord(error) &&
      Array.isArray(error.InstructionError) &&
      error.InstructionError.length === 2 &&
      error.InstructionError[0] === sentinelIndex &&
      error.InstructionError[1] === "InvalidInstructionData";
    const successLog = `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`;
    const failureLogPrefix = `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed`;
    if (
      !Number.isSafeInteger(simulationSlot) ||
      simulationSlot < bufferContextSlot ||
      simulationSlot > normalized.expiresAtFinalizedSlot ||
      !exactError ||
      !Array.isArray(logs) ||
      !logs.every((entry) => typeof entry === "string") ||
      !logs.includes(successLog) ||
      !logs.some(
        (entry) =>
          entry.startsWith(failureLogPrefix) &&
          entry.toLowerCase().includes("invalid instruction data"),
      )
    ) {
      throw new Error(
        `${mode} rollback-sentinel simulation did not prove exact cluster SBF admission.`,
      );
    }
    if ((await getSignatureStatus(intent.expectedPrimarySignature)) !== null) {
      throw new Error(
        "Rollback-sentinel simulation signature entered the ledger.",
      );
    }
    if (mode === "deploy") {
      for (const address of [probeProgramAddress, probeProgramdataAddress]) {
        const absent = await readAccount({
          connection,
          address,
          minContextSlot: simulationSlot,
          label: "Rollback-sentinel probe account after simulation",
          allowMissing: true,
        });
        if (!accountInfoAbsentOrClosed(absent)) {
          throw new Error(
            "Rollback-sentinel simulation persisted a probe account.",
          );
        }
      }
    }
    const [bufferAfterRaw, programdataAfterRaw] = await Promise.all([
      readAccount({
        connection,
        address: bufferAddress,
        minContextSlot: simulationSlot,
        label: "Rollback-sentinel buffer after simulation",
      }),
      readAccount({
        connection,
        address: normalized.programdataAddress,
        minContextSlot: simulationSlot,
        label: "Rollback-sentinel ProgramData after simulation",
      }),
    ]);
    const bufferAfter = normalizeAccount(
      bufferAfterRaw,
      bufferAddress,
      "Rollback-sentinel buffer after simulation",
      simulationSlot,
      false,
    );
    const parsedBufferAfter = parseBuffer(bufferAfter.data);
    const programdataAfter = normalizeAccount(
      programdataAfterRaw,
      normalized.programdataAddress,
      "Rollback-sentinel ProgramData after simulation",
      simulationSlot,
      false,
    );
    if (
      bufferAfter.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
      bufferAfter.executable ||
      parsedBufferAfter.authorityAddress !== normalized.authorityAddress ||
      !parsedBufferAfter.executable.equals(bufferExecutable) ||
      !programdataAfter.data.equals(expectedProgramdataBytes)
    ) {
      throw new Error(
        "Rollback-sentinel simulation changed buffer or real ProgramData state.",
      );
    }
    await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
    await assertPinnedClusterRuntime({
      connection,
      normalized,
      getClusterVersion,
    });
    outcome = Object.freeze({
      schema: SOLANA_LOADER_V3_TARGET_ADMISSION_EVIDENCE_SCHEMA,
      mode,
      ready: true,
      simulationOnly: true,
      broadcast: false,
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      solanaCoreVersion: normalized.solanaCoreVersion,
      featureSet: normalized.featureSet,
      programId: normalized.programId,
      programdataAddress: normalized.programdataAddress,
      bufferAddress,
      bufferExecutableSha256: normalized.targetSha256,
      targetArtifactSha256: normalized.targetSha256,
      targetCodeHash: normalized.targetCodeHash,
      targetExecutableLength: normalized.targetLength,
      intendedExecutableCapacity,
      bufferContextSlot,
      simulationContextSlot: simulationSlot,
      sentinelInstructionIndex: sentinelIndex,
      expectedError: "InvalidInstructionData",
      expectedSignature: intent.expectedPrimarySignature,
      expectedSignatures: [...intent.expectedSignatures],
      blockhash: intent.blockhash,
      lastValidBlockHeight: intent.lastValidBlockHeight,
      messageSha256: intent.messageSha256,
      packetSha256: intent.packetSha256,
      packetLength: intent.packetLength,
      logSha256: solanaSha256(Buffer.from(logs.join("\n"), "utf8")),
      probeProgramAddress,
      probeProgramdataAddress,
    });
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  const zeroizationErrors = zeroizeViews(probeViews);
  if (zeroizationErrors.length) {
    failure = failure
      ? new AggregateError(
          [failure, ...zeroizationErrors],
          "Rollback-sentinel admission failed and probe zeroization was incomplete.",
        )
      : new AggregateError(
          zeroizationErrors,
          "Rollback-sentinel probe signer zeroization was incomplete.",
        );
  }
  if (failure) throw failure;
  return outcome;
};

const validateTargetSbfExecutable = async ({
  normalized,
  validateSbfExecutable,
}) => {
  if (typeof validateSbfExecutable !== "function") {
    throw new Error(
      "The approved deterministic local SBF structural validator callback is required.",
    );
  }
  const evidence = await validateSbfExecutable({
    executableBytes: Buffer.from(normalized.target),
    validatorId: normalized.sbfValidatorId,
    validatorVersion: normalized.sbfValidatorVersion,
    policy: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY,
    policySha256: normalized.sbfValidationPolicySha256,
    artifactSha256: normalized.targetSha256,
    codeHash: normalized.targetCodeHash,
    executableLength: normalized.targetLength,
    requiredChecks: [...SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS],
  });
  const evidenceBytes =
    canonicalSolanaLoaderV3SbfValidationEvidenceBytes(evidence);
  const checks = evidence.checks;
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
    evidence.schema !== SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA ||
    evidence.valid !== true ||
    evidence.deterministic !== true ||
    evidence.validationScope !== SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE ||
    evidence.exactClusterAdmission !== false ||
    evidence.productionEligible !== true ||
    evidence.validatorId !== normalized.sbfValidatorId ||
    evidence.validatorVersion !== normalized.sbfValidatorVersion ||
    evidence.policySha256 !== normalized.sbfValidationPolicySha256 ||
    evidence.artifactSha256 !== normalized.targetSha256 ||
    evidence.codeHash !== normalized.targetCodeHash ||
    evidence.executableLength !== normalized.targetLength ||
    !provenanceHashesValid ||
    !/^x86_64-unknown-linux-(?:gnu|musl)$/u.test(
      evidence.helperTargetTriple ?? "",
    ) ||
    evidence.jitOutcome !== "compiled" ||
    evidence.buildProfile !== "release" ||
    !rustcIdentityValid ||
    evidence.resourceLimits !== "unix-rlimit-v1" ||
    JSON.stringify(checks) !==
      JSON.stringify(SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS) ||
    solanaSha256(evidenceBytes) !== normalized.sbfValidationEvidenceSha256
  ) {
    throw new Error(
      "Target executable did not produce the exact governance-pinned production local SBF structural evidence.",
    );
  }
  if (
    solanaSha256(normalized.target) !== normalized.targetSha256 ||
    solanaBlake2b256(normalized.target) !== normalized.targetCodeHash
  ) {
    throw new Error(
      "Target executable bytes changed during local SBF validation.",
    );
  }
  return Object.freeze({
    schema: evidence.schema,
    valid: true,
    deterministic: true,
    validationScope: evidence.validationScope,
    exactClusterAdmission: false,
    exactClusterAdmissionAuthority: "rollback-sentinel-simulation",
    productionEligible: true,
    validatorId: evidence.validatorId,
    validatorVersion: evidence.validatorVersion,
    policySha256: evidence.policySha256,
    evidenceSha256: normalized.sbfValidationEvidenceSha256,
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
    checks: Object.freeze([...checks]),
  });
};

const inspectNormalizedRuntimeUpgrade = async ({
  connection,
  normalized,
  assertNetwork,
  getFinalizedSlot,
  readAccount,
  validateSbfExecutable,
  getClusterVersion,
}) => {
  const sbfValidation = await validateTargetSbfExecutable({
    normalized,
    validateSbfExecutable,
  });
  await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
  const clusterRuntime = await assertPinnedClusterRuntime({
    connection,
    normalized,
    getClusterVersion,
  });
  const floor = await getFinalizedSlot();
  if (!Number.isSafeInteger(floor) || floor < normalized.minFinalizedSlot) {
    throw new Error("Finalized RPC context is older than the reviewed floor.");
  }
  if (floor > normalized.expiresAtFinalizedSlot) {
    throw new Error("Reviewed runtime upgrade context has expired.");
  }
  const before = await readExistingProgram({
    connection,
    normalized,
    minContextSlot: floor,
    readAccount,
    expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
  });
  assertReviewedBefore(normalized, before);
  return { floor, before, sbfValidation, clusterRuntime };
};

const assertExactRuntimeUpgradeConfirmation = ({
  confirmation,
  normalized,
}) => {
  if (!isRecord(confirmation)) {
    throw new Error(
      "An exact explicit submit/irreversible confirmation bound to the reviewed plan is required.",
    );
  }
  assertExactKeys(
    confirmation,
    CONFIRMATION_KEYS,
    "Runtime upgrade confirmation",
  );
  if (
    confirmation.schema !==
      SOLANA_LOADER_V3_RUNTIME_UPGRADE_CONFIRMATION_SCHEMA ||
    confirmation.action !== "upgrade-existing-loader-v3-program" ||
    confirmation.submit !== true ||
    confirmation.irreversible !== true ||
    confirmation.operationId !== normalized.operationId ||
    confirmation.planSha256 !== normalized.planSha256 ||
    confirmation.programId !== normalized.programId ||
    confirmation.targetArtifactSha256 !== normalized.targetSha256
  ) {
    throw new Error(
      "An exact explicit submit/irreversible confirmation bound to the reviewed plan is required.",
    );
  }
};

/**
 * Performs the exact non-mutating network, account, authority, hash, target,
 * and capacity checks used immediately before runtime execution.
 */
export const inspectSolanaLoaderV3RuntimeUpgradeReadiness = async ({
  connection,
  planBytes,
  expectedPlanSha256,
  targetExecutableBytes,
  dependencies = {},
} = {}) => {
  if (!connection) throw new Error("A Solana connection is required.");
  const normalized = validateSolanaLoaderV3RuntimeUpgradePlan({
    planBytes,
    expectedPlanSha256,
    targetExecutableBytes,
  });
  const assertNetwork = dependencies.assertNetwork ?? defaultAssertNetwork;
  const getFinalizedSlot =
    dependencies.getFinalizedSlot ?? (() => connection.getSlot("finalized"));
  const readAccount = dependencies.readAccount ?? defaultReadAccount;
  const getClusterVersion =
    dependencies.getClusterVersion ?? defaultGetClusterVersion;
  const validateSbfExecutable = dependencies.validateSbfExecutable;
  const inspection = await inspectNormalizedRuntimeUpgrade({
    connection,
    normalized,
    assertNetwork,
    getFinalizedSlot,
    readAccount,
    validateSbfExecutable,
    getClusterVersion,
  });
  return {
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_READINESS_SCHEMA,
    checkedAtFinalizedSlot: inspection.floor,
    ready: true,
    mutationPerformed: false,
    signerAcquired: false,
    operationClaimed: false,
    planSha256: normalized.planSha256,
    network: SOLANA_TESTNET_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    clusterRuntime: inspection.clusterRuntime,
    programId: normalized.programId,
    programdataAddress: normalized.programdataAddress,
    authorityAddress: normalized.authorityAddress,
    payerAddress: normalized.payerAddress,
    before: beforeSummary(inspection.before),
    target: {
      executableLength: normalized.targetLength,
      artifactSha256: normalized.targetSha256,
      executableSha256: normalized.targetSha256,
      codeHash: normalized.targetCodeHash,
    },
    sbfValidation: inspection.sbfValidation,
    capacity: {
      beforeExecutableLength: normalized.beforeExecutableLength,
      sufficientWithoutExtension:
        normalized.targetLength <= normalized.beforeExecutableLength,
      checkedExtension: normalized.extension,
    },
    policy: {
      existingProgramOnly: true,
      maxPacketBytes: SOLANA_PACKET_DATA_SIZE,
      automaticMutationRetries: 0,
      runtimeOnlySigners: true,
    },
  };
};

const disposableSignerFromSource = ({ source, role, address, secretViews }) => {
  const secret = source?.secretKey;
  if (!(secret instanceof Uint8Array) || secret.length !== 64) {
    throw new Error(`${role} must expose one disposable 64-byte secret view.`);
  }
  secretViews.push(secret);
  const ownSecret = Object.getOwnPropertyDescriptor(source, "secretKey")?.value;
  if (ownSecret instanceof Uint8Array && ownSecret.length === 64) {
    secretViews.push(ownSecret);
  }
  // web3.js Keypair exposes a defensive copy through `secretKey`; the actual
  // backing array remains an ordinary (not #private) field.  Capture both so
  // the disposable source and the signing view are erased.
  const web3BackingSecret = source?._keypair?.secretKey;
  if (
    web3BackingSecret instanceof Uint8Array &&
    web3BackingSecret.length === 64
  ) {
    secretViews.push(web3BackingSecret);
  }
  if (typeof address !== "string" || !address) {
    throw new Error(`${role} does not expose a public address.`);
  }
  if (source?.publicKey?.toBase58?.() !== address) {
    throw new Error(
      `${role} runtime signer does not match the reviewed address.`,
    );
  }
  return {
    publicKey: new PublicKey(address),
    secretKey: secret,
  };
};

const zeroizeViews = (views) => {
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
        throw new Error("secret view retained non-zero bytes");
      }
    } catch {
      errors.push(
        new Error("A disposable runtime signer could not be zeroized."),
      );
    }
  }
  return errors;
};

const defaultAssertNetwork = async (connection) => {
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error("RPC is not canonical Solana testnet.");
  }
};

const defaultGetClusterVersion = (connection) => connection.getVersion();

const assertPinnedClusterRuntime = async ({
  connection,
  normalized,
  getClusterVersion,
}) => {
  const version = await getClusterVersion(connection);
  if (
    !isRecord(version) ||
    version["solana-core"] !== normalized.solanaCoreVersion ||
    version["feature-set"] !== normalized.featureSet
  ) {
    throw new Error(
      "Solana core version or feature set differs from the reviewed plan.",
    );
  }
  return Object.freeze({
    solanaCoreVersion: version["solana-core"],
    featureSet: version["feature-set"],
  });
};

const accountInfoAbsentOrClosed = (result) => {
  if (!result?.value) return true;
  const info = result.value;
  const data = Buffer.from(info.data ?? []);
  return (
    info.lamports === 0 &&
    (data.length === 0 || (data.length === 4 && readU32(data, 0) === 0))
  );
};

const transactionWithInstructions = ({
  instructions,
  payerSigner,
  signers,
  latestBlockhash,
}) =>
  buildSignedTransaction({
    instructions,
    payerSigner,
    signers,
    latestBlockhash,
  });

/**
 * Upgrades an already-existing Loader-v3 program.  Every mutation is signed
 * from disposable runtime key material, broadcast once, finalized, and
 * checked against the exact fetched transaction.
 */
export const upgradeExistingSolanaLoaderV3ProgramWithRuntime = async ({
  connection,
  planBytes,
  expectedPlanSha256,
  targetExecutableBytes,
  confirmation,
  signerFactory,
  dependencies = {},
} = {}) => {
  if (!connection) throw new Error("A Solana connection is required.");
  const normalized = validateSolanaLoaderV3RuntimeUpgradePlan({
    planBytes,
    expectedPlanSha256,
    targetExecutableBytes,
  });
  assertExactRuntimeUpgradeConfirmation({ confirmation, normalized });
  const assertNetwork = dependencies.assertNetwork ?? defaultAssertNetwork;
  const getFinalizedSlot =
    dependencies.getFinalizedSlot ?? (() => connection.getSlot("finalized"));
  const getLatestBlockhash =
    dependencies.getLatestBlockhash ??
    (() => connection.getLatestBlockhash("finalized"));
  const readAccount = dependencies.readAccount ?? defaultReadAccount;
  const validateSbfExecutable = dependencies.validateSbfExecutable;
  const getClusterVersion =
    dependencies.getClusterVersion ?? defaultGetClusterVersion;
  const getMinimumBalanceForRentExemption =
    dependencies.getMinimumBalanceForRentExemption ??
    ((length) =>
      connection.getMinimumBalanceForRentExemption(length, "finalized"));
  const broadcastFinalized =
    dependencies.broadcastFinalized ?? defaultBroadcastFinalized;
  const resolveAmbiguousTransaction = dependencies.resolveAmbiguousTransaction;
  const simulateRawTransaction = dependencies.simulateRawTransaction;
  const getSignatureStatus =
    dependencies.getSignatureStatus ??
    (async (signature) => {
      const statuses = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      return statuses?.value?.[0] ?? null;
    });
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const generateEphemeralKeypair =
    dependencies.generateEphemeralKeypair ?? (() => Keypair.generate());
  const generateProbeKeypair =
    dependencies.generateProbeKeypair ?? (() => Keypair.generate());
  const operationJournal = dependencies.operationJournal;
  if (typeof operationJournal !== "function") {
    throw new Error(
      "A durable external operation journal callback is required.",
    );
  }

  const secretViews = [];
  let authoritySigner = null;
  let payerSigner = null;
  let bufferSigner = null;
  let bufferPossiblyCreated = false;
  let bufferConsumed = false;
  let journalClaimed = false;
  let journalId = null;
  let authorityLease = null;
  let currentStage = "read-only-preflight";
  let lastFinalizedTransaction = null;
  let ambiguousIntent = null;
  let result = null;
  let failure = null;
  const authorityGlobalLeaseScope = solanaLoaderV3AuthorityGlobalLeaseScope(
    normalized.authorityAddress,
  );

  const appendJournal = async ({ type, details = {} }) => {
    const event = {
      schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
      type,
      operationId: normalized.operationId,
      planSha256: normalized.planSha256,
      programId: normalized.programId,
      programdataAddress: normalized.programdataAddress,
      authorityAddress: normalized.authorityAddress,
      payerAddress: normalized.payerAddress,
      bufferAddress: bufferSigner?.publicKey?.toBase58?.() ?? null,
      targetArtifactSha256: normalized.targetSha256,
      targetExecutableLength: normalized.targetLength,
      ...(type === "claim"
        ? {}
        : {
            authorityLeaseId: authorityLease?.leaseId ?? null,
            authorityLeaseGeneration: authorityLease?.generation ?? null,
            authorityLeaseScope: authorityLease?.scope ?? null,
          }),
      ...details,
    };
    const response = await operationJournal(event);
    if (!isRecord(response) || response.durable !== true) {
      throw new Error(
        "Operation journal did not durably acknowledge an event.",
      );
    }
    if (type === "claim") {
      if (response.claimed !== true || typeof response.journalId !== "string") {
        throw new Error(
          "Runtime upgrade operation is already claimed or journal state is ambiguous.",
        );
      }
      const claimedJournalId = normalizePublicJournalId(response.journalId);
      if (
        response.exclusiveAuthorityLease !== true ||
        response.authorityCustodyScope !== "same-host-exclusive" ||
        response.crossHostAuthorityUseExcluded !== true ||
        typeof response.leaseId !== "string" ||
        response.authorityLeaseScope !== authorityGlobalLeaseScope ||
        response.leaseGeneration !== 1 ||
        response.signerCapability === null ||
        (typeof response.signerCapability !== "object" &&
          typeof response.signerCapability !== "function") ||
        !Number.isSafeInteger(response.leaseExpiresAtFinalizedSlot) ||
        response.leaseExpiresAtFinalizedSlot <= details.finalizedContextSlot ||
        response.leaseExpiresAtFinalizedSlot > normalized.expiresAtFinalizedSlot
      ) {
        throw new Error(
          "Durable journal did not grant the exact bounded authority lease and custody attestation.",
        );
      }
      journalId = claimedJournalId;
      authorityLease = Object.freeze({
        leaseId: normalizePublicJournalId(response.leaseId),
        generation: positiveSafeInteger(
          response.leaseGeneration,
          "Authority lease generation",
        ),
        scope: response.authorityLeaseScope,
        expiresAtFinalizedSlot: response.leaseExpiresAtFinalizedSlot,
        custodyScope: response.authorityCustodyScope,
        crossHostAuthorityUseExcluded: true,
        signerCapability: normalizeOpaqueSignerCapability(
          response.signerCapability,
          "Authority lease signer capability",
        ),
      });
      journalClaimed = true;
    } else if (response.recorded !== true || response.journalId !== journalId) {
      throw new Error("Operation journal stage acknowledgement is not exact.");
    }
    return event;
  };

  const assertLiveContext = async ({ allowPlanExpiry = false } = {}) => {
    await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
    await assertPinnedClusterRuntime({
      connection,
      normalized,
      getClusterVersion,
    });
    const slot = await getFinalizedSlot();
    if (!Number.isSafeInteger(slot) || slot < normalized.minFinalizedSlot) {
      throw new Error(
        "Finalized RPC context is older than the reviewed floor.",
      );
    }
    if (!allowPlanExpiry && slot > normalized.expiresAtFinalizedSlot) {
      throw new Error("Reviewed runtime upgrade context has expired.");
    }
    if (journalClaimed && !authorityLease) {
      throw new Error("Exclusive runtime authority lease is missing.");
    }
    if (journalClaimed && slot > authorityLease.expiresAtFinalizedSlot) {
      throw new Error("Exclusive runtime authority lease has expired.");
    }
    return slot;
  };

  const submit = async ({
    instructions,
    signers,
    stage,
    prebuilt = null,
    consumesBuffer = false,
    preBroadcastGuard = null,
  }) => {
    currentStage = stage;
    await assertLiveContext();
    const latestBlockhash =
      prebuilt?.latestBlockhash ?? (await getLatestBlockhash());
    const built =
      prebuilt?.built ??
      transactionWithInstructions({
        instructions,
        payerSigner,
        signers,
        latestBlockhash,
      });
    const intent = buildSignedTransactionIntent({
      built,
      latestBlockhash,
      stage,
    });
    await appendJournal({
      type: "intent",
      details: {
        stage,
        status: "prepared-before-broadcast",
        ...journalIntentDetails(intent),
        bufferPossiblyCreated,
        bufferConsumed,
      },
    });
    if (preBroadcastGuard !== null) {
      if (typeof preBroadcastGuard !== "function") {
        throw new Error(`${stage} pre-broadcast guard is invalid.`);
      }
      try {
        await preBroadcastGuard();
      } catch (guardError) {
        await appendJournal({
          type: "resolution",
          details: {
            stage,
            status: "aborted-before-broadcast",
            ...journalIntentDetails(intent),
            bufferPossiblyCreated,
            bufferConsumed,
          },
        });
        throw guardError;
      }
    }
    try {
      await assertLiveContext();
    } catch (contextError) {
      await appendJournal({
        type: "resolution",
        details: {
          stage,
          status: "aborted-before-broadcast",
          ...journalIntentDetails(intent),
          bufferPossiblyCreated,
          bufferConsumed,
        },
      });
      throw contextError;
    }
    ambiguousIntent = intent;
    let evidence;
    try {
      evidence = await submitExactTransaction({
        connection,
        built,
        latestBlockhash,
        broadcastFinalized,
        sleep,
        stage,
        preparedIntent: intent,
      });
    } catch (submitError) {
      if (typeof resolveAmbiguousTransaction !== "function") {
        await appendJournal({
          type: "ambiguous",
          details: {
            stage,
            status: "resolution-required",
            ...journalIntentDetails(intent),
            bufferPossiblyCreated,
            bufferConsumed,
            recoveryAction: "resolve-signature-through-finalization-or-expiry",
          },
        });
        throw submitError;
      }
      const resolution = await resolveAmbiguousTransaction({
        connection,
        intent,
        rawTransaction: Buffer.from(built.raw),
        latestBlockhash: { ...latestBlockhash },
      });
      if (!isRecord(resolution)) {
        throw new Error(
          "Ambiguous transaction resolver returned no exact state.",
        );
      }
      if (resolution.status === "finalized") {
        evidence = await submitExactTransaction({
          connection,
          built,
          latestBlockhash,
          broadcastFinalized,
          sleep,
          stage,
          preparedIntent: intent,
          submittedResult: resolution.submittedResult,
          allowBroadcast: false,
        });
        await appendJournal({
          type: "resolution",
          details: {
            stage,
            status: "delayed-finalization-resolved",
            ...journalIntentDetails(intent),
            finalizedSlot: evidence.finalizedSlot,
            bufferPossiblyCreated,
            bufferConsumed,
          },
        });
        ambiguousIntent = null;
      } else if (
        resolution.status === "expired" ||
        resolution.status === "failed"
      ) {
        const definitive =
          resolution.status === "expired"
            ? Number.isSafeInteger(resolution.observedBlockHeight) &&
              resolution.observedBlockHeight > intent.lastValidBlockHeight &&
              resolution.signatureStatus === null
            : resolution.signature === intent.expectedPrimarySignature &&
              resolution.finalized === true &&
              resolution.err !== null &&
              resolution.err !== undefined;
        if (!definitive) {
          throw new Error(
            "Ambiguous transaction resolution is not structurally definitive.",
          );
        }
        const terminalFailureEvidence =
          resolution.status === "expired"
            ? { signatureStatus: null }
            : {
                finalized: true,
                ...publicTransactionErrorEvidence(resolution.err),
              };
        await appendJournal({
          type: "resolution",
          details: {
            stage,
            status: `definitive-${resolution.status}`,
            ...journalIntentDetails(intent),
            observedBlockHeight: resolution.observedBlockHeight ?? null,
            ...terminalFailureEvidence,
            bufferPossiblyCreated,
            bufferConsumed,
          },
        });
        ambiguousIntent = null;
        throw submitError;
      } else {
        await appendJournal({
          type: "ambiguous",
          details: {
            stage,
            status: "resolution-required",
            ...journalIntentDetails(intent),
            bufferPossiblyCreated,
            bufferConsumed,
            recoveryAction: "resolve-signature-through-finalization-or-expiry",
          },
        });
        throw submitError;
      }
    }
    lastFinalizedTransaction = evidence;
    if (consumesBuffer) bufferConsumed = true;
    await appendJournal({
      type: "stage",
      details: {
        stage,
        status: "finalized",
        signature: evidence.signature,
        ...journalIntentDetails(intent),
        finalizedSlot: evidence.finalizedSlot,
        bufferPossiblyCreated,
        bufferConsumed,
      },
    });
    ambiguousIntent = null;
    return evidence;
  };

  const readBuffer = async ({ minContextSlot, allowMissing = false }) => {
    const raw = await readAccount({
      connection,
      address: bufferSigner.publicKey.toBase58(),
      minContextSlot,
      label: "Ephemeral Loader-v3 buffer",
      allowMissing,
    });
    return normalizeAccount(
      raw,
      bufferSigner.publicKey.toBase58(),
      "Ephemeral Loader-v3 buffer",
      minContextSlot,
      allowMissing,
    );
  };

  const cleanupBuffer = async () => {
    if (ambiguousIntent) {
      throw new Error(
        "Ephemeral buffer cleanup is forbidden while a prepared transaction may still finalize.",
      );
    }
    if (!bufferPossiblyCreated || bufferConsumed || !bufferSigner) {
      return { required: false, finalized: true, transaction: null };
    }
    await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
    const floor = await getFinalizedSlot();
    const raw = await readAccount({
      connection,
      address: bufferSigner.publicKey.toBase58(),
      minContextSlot: floor,
      label: "Ephemeral Loader-v3 buffer cleanup",
      allowMissing: true,
    });
    if (!raw?.value || accountInfoAbsentOrClosed(raw)) {
      bufferPossiblyCreated = false;
      if (journalClaimed) {
        currentStage = "cleanup-buffer-not-present";
        await appendJournal({
          type: "stage",
          details: {
            stage: currentStage,
            status: "finalized-no-account",
            signature: null,
            finalizedSlot: floor,
            bufferPossiblyCreated: false,
            bufferConsumed: false,
          },
        });
      }
      return { required: false, finalized: true, transaction: null };
    }
    const account = normalizeAccount(
      raw,
      bufferSigner.publicKey.toBase58(),
      "Ephemeral Loader-v3 buffer cleanup",
      floor,
      false,
    );
    if (account.owner !== SOLANA_UPGRADEABLE_LOADER_ID || account.executable) {
      throw new Error(
        "Ephemeral buffer cleanup readback has an invalid owner or state.",
      );
    }
    const parsed = parseBuffer(account.data);
    if (
      parsed.authorityAddress !== normalized.authorityAddress ||
      parsed.dataLength !==
        SOLANA_BUFFER_METADATA_LENGTH + normalized.targetLength
    ) {
      throw new Error(
        "Ephemeral buffer cleanup authority or exact data length is not the reviewed buffer.",
      );
    }
    const latestBlockhash = await getLatestBlockhash();
    const built = transactionWithInstructions({
      instructions: [
        buildLoaderV3CloseBufferInstruction({
          bufferAddress: bufferSigner.publicKey,
          recipientAddress: normalized.payerAddress,
          authorityAddress: normalized.authorityAddress,
        }),
      ],
      payerSigner,
      signers: [authoritySigner],
      latestBlockhash,
    });
    const cleanupIntent = buildSignedTransactionIntent({
      built,
      latestBlockhash,
      stage: "cleanup-close-buffer",
    });
    await appendJournal({
      type: "intent",
      details: {
        stage: "cleanup-close-buffer",
        status: "prepared-before-broadcast",
        ...journalIntentDetails(cleanupIntent),
        bufferPossiblyCreated,
        bufferConsumed,
      },
    });
    try {
      await assertLiveContext({ allowPlanExpiry: true });
    } catch (contextError) {
      await appendJournal({
        type: "resolution",
        details: {
          stage: "cleanup-close-buffer",
          status: "aborted-before-broadcast",
          ...journalIntentDetails(cleanupIntent),
          bufferPossiblyCreated,
          bufferConsumed,
        },
      });
      throw contextError;
    }
    ambiguousIntent = cleanupIntent;
    let transaction;
    try {
      transaction = await submitExactTransaction({
        connection,
        built,
        latestBlockhash,
        broadcastFinalized,
        sleep,
        stage: "cleanup-close-buffer",
        preparedIntent: cleanupIntent,
      });
    } catch (cleanupSubmitError) {
      ambiguousIntent = cleanupIntent;
      await appendJournal({
        type: "ambiguous",
        details: {
          stage: "cleanup-close-buffer",
          status: "resolution-required",
          ...journalIntentDetails(cleanupIntent),
          bufferPossiblyCreated,
          bufferConsumed,
          recoveryAction: "resolve-signature-through-finalization-or-expiry",
        },
      });
      throw cleanupSubmitError;
    }
    lastFinalizedTransaction = transaction;
    const closed = await readAccount({
      connection,
      address: bufferSigner.publicKey.toBase58(),
      minContextSlot: transaction.finalizedSlot,
      label: "Closed ephemeral Loader-v3 buffer",
      allowMissing: true,
    });
    if (!accountInfoAbsentOrClosed(closed)) {
      throw new Error("Ephemeral Loader-v3 buffer was not closed exactly.");
    }
    bufferPossiblyCreated = false;
    currentStage = "cleanup-close-buffer";
    if (journalClaimed) {
      await appendJournal({
        type: "stage",
        details: {
          stage: currentStage,
          status: "finalized-closed",
          signature: transaction.signature,
          ...journalIntentDetails(cleanupIntent),
          finalizedSlot: transaction.finalizedSlot,
          bufferPossiblyCreated: false,
          bufferConsumed: false,
        },
      });
    }
    ambiguousIntent = null;
    return { required: true, finalized: true, transaction };
  };

  try {
    const inspection = await inspectNormalizedRuntimeUpgrade({
      connection,
      normalized,
      assertNetwork,
      getFinalizedSlot,
      readAccount,
      validateSbfExecutable,
      getClusterVersion,
    });
    const before = inspection.before;

    const bufferSource = await generateEphemeralKeypair();
    const bufferAddress = bufferSource?.publicKey?.toBase58?.();
    bufferSigner = disposableSignerFromSource({
      source: bufferSource,
      role: "Ephemeral buffer signer",
      address: bufferAddress,
      secretViews,
    });
    if (
      !bufferSigner?.publicKey?.toBase58 ||
      bufferSigner.publicKey.toBase58() === normalized.programId ||
      bufferSigner.publicKey.toBase58() === normalized.programdataAddress ||
      bufferSigner.publicKey.toBase58() === normalized.authorityAddress ||
      bufferSigner.publicKey.toBase58() === normalized.payerAddress
    ) {
      throw new Error(
        "Ephemeral buffer keypair is invalid or aliases a stable program identity.",
      );
    }

    const leaseContextSlot = await assertLiveContext();
    currentStage = "durable-operation-claim";
    await appendJournal({
      type: "claim",
      details: {
        stage: currentStage,
        status: "claimed-before-mutation",
        finalizedContextSlot: leaseContextSlot,
        authorityLeaseRequired: true,
        authorityLeaseScope: authorityGlobalLeaseScope,
        bufferPossiblyCreated: false,
        bufferConsumed: false,
        recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
      },
    });

    if (typeof signerFactory !== "function") {
      throw new Error("A runtime-only signer factory is required.");
    }
    const signerLease = Object.freeze({
      journalId,
      leaseId: authorityLease.leaseId,
      leaseGeneration: authorityLease.generation,
      authorityLeaseScope: authorityLease.scope,
      leaseExpiresAtFinalizedSlot: authorityLease.expiresAtFinalizedSlot,
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      authorityAddress: normalized.authorityAddress,
      programId: normalized.programId,
      operationId: normalized.operationId,
      signerCapability: authorityLease.signerCapability,
    });
    authoritySigner = disposableSignerFromSource({
      source: await signerFactory({
        role: "authority",
        address: normalized.authorityAddress,
        authorityLease: signerLease,
      }),
      role: "Upgrade authority signer",
      address: normalized.authorityAddress,
      secretViews,
    });
    if (normalized.payerAddress === normalized.authorityAddress) {
      payerSigner = authoritySigner;
    } else {
      payerSigner = disposableSignerFromSource({
        source: await signerFactory({
          role: "payer",
          address: normalized.payerAddress,
          authorityLease: signerLease,
        }),
        role: "Runtime payer signer",
        address: normalized.payerAddress,
        secretViews,
      });
    }

    const bufferSpace = SOLANA_BUFFER_METADATA_LENGTH + normalized.targetLength;
    const bufferLamports = await getMinimumBalanceForRentExemption(bufferSpace);
    if (!Number.isSafeInteger(bufferLamports) || bufferLamports <= 0) {
      throw new Error("Ephemeral buffer rent requirement is invalid.");
    }
    const createInstruction = SystemProgram.createAccount({
      fromPubkey: payerSigner.publicKey,
      newAccountPubkey: bufferSigner.publicKey,
      lamports: bufferLamports,
      space: bufferSpace,
      programId: LOADER,
    });
    const initializeInstruction = buildLoaderV3InitializeBufferInstruction({
      bufferAddress: bufferSigner.publicKey,
      authorityAddress: normalized.authorityAddress,
    });
    bufferPossiblyCreated = true;
    const initialize = await submit({
      instructions: [createInstruction, initializeInstruction],
      signers: [bufferSigner],
      stage: "create-and-initialize-buffer",
    });
    const initializedAccount = await readBuffer({
      minContextSlot: initialize.finalizedSlot,
    });
    const initialized = parseBuffer(initializedAccount.data);
    if (
      initializedAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
      initializedAccount.executable ||
      initialized.dataLength !== bufferSpace ||
      initialized.authorityAddress !== normalized.authorityAddress ||
      !initialized.executable.every((byte) => byte === 0)
    ) {
      throw new Error(
        "Fresh ephemeral buffer initialization readback is not exact.",
      );
    }

    const writes = [];
    let offset = 0;
    while (offset < normalized.target.length) {
      await assertLiveContext();
      const latestBlockhash = await getLatestBlockhash();
      const selected = selectLargestLoaderV3WriteChunk({
        remainingBytes: normalized.target.subarray(offset),
        offset,
        bufferAddress: bufferSigner.publicKey,
        authorityAddress: normalized.authorityAddress,
        payerSigner,
        authoritySigner,
        latestBlockhash,
      });
      const evidence = await submit({
        stage: `write-buffer-${writes.length}`,
        prebuilt: { built: selected, latestBlockhash },
      });
      writes.push({
        ...evidence,
        offset,
        length: selected.length,
        endOffset: offset + selected.length,
      });
      offset += selected.length;
    }
    const bufferAccount = await readBuffer({
      minContextSlot: writes.at(-1)?.finalizedSlot ?? initialize.finalizedSlot,
    });
    const populatedBuffer = parseBuffer(bufferAccount.data);
    if (
      populatedBuffer.authorityAddress !== normalized.authorityAddress ||
      populatedBuffer.dataLength !== bufferSpace ||
      !populatedBuffer.executable.equals(normalized.target) ||
      solanaSha256(populatedBuffer.executable) !== normalized.targetSha256 ||
      solanaBlake2b256(populatedBuffer.executable) !== normalized.targetCodeHash
    ) {
      throw new Error(
        "Populated ephemeral buffer does not match exact target bytes.",
      );
    }

    currentStage = "pre-extension-deploy-admission";
    const intendedExecutableCapacity =
      (normalized.extension?.resultProgramdataDataLength ??
        normalized.beforeDataLength) - SOLANA_PROGRAMDATA_METADATA_LENGTH;
    const deployAdmission = await runRollbackSentinelAdmission({
      mode: "deploy",
      connection,
      normalized,
      expectedProgramdataBytes: before.programdata.data,
      bufferAddress: bufferSigner.publicKey.toBase58(),
      bufferExecutable: populatedBuffer.executable,
      bufferContextSlot: bufferAccount.contextSlot,
      intendedExecutableCapacity,
      authoritySigner,
      payerSigner,
      assertNetwork,
      getLatestBlockhash,
      getMinimumBalanceForRentExemption,
      readAccount,
      simulateRawTransaction,
      getSignatureStatus,
      generateProbeKeypair,
      getClusterVersion,
    });
    await appendJournal({
      type: "validation",
      details: {
        stage: currentStage,
        status: "rollback-sentinel-admission-passed",
        simulationContextSlot: deployAdmission.simulationContextSlot,
        expectedSignature: deployAdmission.expectedSignature,
        expectedSignatures: [...deployAdmission.expectedSignatures],
        blockhash: deployAdmission.blockhash,
        lastValidBlockHeight: deployAdmission.lastValidBlockHeight,
        messageSha256: deployAdmission.messageSha256,
        packetSha256: deployAdmission.packetSha256,
        packetLength: deployAdmission.packetLength,
        logSha256: deployAdmission.logSha256,
        intendedExecutableCapacity,
        bufferPossiblyCreated,
        bufferConsumed,
      },
    });

    let extension = null;
    let preUpgrade = before;
    if (normalized.extension) {
      const extensionPreflightFloor = await assertLiveContext();
      const beforeExtension = await readExistingProgram({
        connection,
        normalized,
        minContextSlot: extensionPreflightFloor,
        readAccount,
        expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
      });
      assertReviewedBefore(normalized, beforeExtension);
      if (
        !beforeExtension.program.data.equals(before.program.data) ||
        !beforeExtension.programdata.data.equals(before.programdata.data)
      ) {
        throw new Error(
          "Program or ProgramData bytes changed before checked extension.",
        );
      }
      extension = await submit({
        instructions: [
          buildLoaderV3ExtendProgramCheckedInstruction({
            programId: normalized.programId,
            programdataAddress: normalized.programdataAddress,
            authorityAddress: normalized.authorityAddress,
            payerAddress: normalized.payerAddress,
            additionalBytes: normalized.extension.additionalBytes,
            currentProgramdataDataLength: normalized.beforeDataLength,
          }),
        ],
        signers: [authoritySigner],
        stage: "checked-extend-programdata",
        preBroadcastGuard: async () => {
          const guardFloor = await getFinalizedSlot();
          const guarded = await readExistingProgram({
            connection,
            normalized,
            minContextSlot: guardFloor,
            readAccount,
            expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
          });
          assertReviewedBefore(normalized, guarded);
          if (
            !guarded.program.data.equals(before.program.data) ||
            !guarded.programdata.data.equals(before.programdata.data)
          ) {
            throw new Error(
              "Program or ProgramData changed at checked-extension broadcast boundary.",
            );
          }
        },
      });
      preUpgrade = await readExistingProgram({
        connection,
        normalized,
        minContextSlot: extension.finalizedSlot,
        readAccount,
        expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
      });
      const extendedExecutable = preUpgrade.parsedProgramdata.executable;
      const originalExecutable = before.parsedProgramdata.executable;
      if (
        preUpgrade.parsedProgramdata.slotNumber !== extension.finalizedSlot ||
        preUpgrade.parsedProgramdata.slotNumber <=
          before.parsedProgramdata.slotNumber ||
        preUpgrade.parsedProgramdata.dataLength !==
          normalized.extension.resultProgramdataDataLength ||
        !extendedExecutable
          .subarray(0, originalExecutable.length)
          .equals(originalExecutable) ||
        !extendedExecutable
          .subarray(originalExecutable.length)
          .every((byte) => byte === 0)
      ) {
        throw new Error("Checked ProgramData extension readback is not exact.");
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const slot = await assertLiveContext();
        if (slot > extension.finalizedSlot) break;
        if (attempt === 19) {
          throw new Error(
            "A later finalized slot is required after ProgramData extension.",
          );
        }
        await sleep(250);
      }
    }

    const preUpgradeFloor = await assertLiveContext();
    const freshPreUpgrade = await readExistingProgram({
      connection,
      normalized,
      minContextSlot: preUpgradeFloor,
      readAccount,
      expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
    });
    if (
      freshPreUpgrade.parsedProgramdata.slot !==
        preUpgrade.parsedProgramdata.slot ||
      !freshPreUpgrade.parsedProgramdata.executable.equals(
        preUpgrade.parsedProgramdata.executable,
      )
    ) {
      throw new Error(
        "ProgramData changed after buffer preparation; upgrade is stale.",
      );
    }

    const finalBufferAccount = await readBuffer({
      minContextSlot: preUpgradeFloor,
    });
    const finalBuffer = parseBuffer(finalBufferAccount.data);
    if (
      finalBufferAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
      finalBufferAccount.executable ||
      finalBuffer.authorityAddress !== normalized.authorityAddress ||
      finalBuffer.dataLength !== bufferSpace ||
      !finalBuffer.executable.equals(normalized.target) ||
      solanaSha256(finalBuffer.executable) !== normalized.targetSha256 ||
      solanaBlake2b256(finalBuffer.executable) !== normalized.targetCodeHash
    ) {
      throw new Error(
        "Fresh pre-upgrade ephemeral buffer readback is not exact.",
      );
    }

    currentStage = "post-extension-upgrade-admission";
    const upgradeAdmission = await runRollbackSentinelAdmission({
      mode: "upgrade",
      connection,
      normalized,
      expectedProgramdataBytes: freshPreUpgrade.programdata.data,
      bufferAddress: bufferSigner.publicKey.toBase58(),
      bufferExecutable: finalBuffer.executable,
      bufferContextSlot: Math.max(
        finalBufferAccount.contextSlot,
        freshPreUpgrade.programdata.contextSlot,
      ),
      intendedExecutableCapacity,
      authoritySigner,
      payerSigner,
      assertNetwork,
      getLatestBlockhash,
      getMinimumBalanceForRentExemption,
      readAccount,
      simulateRawTransaction,
      getSignatureStatus,
      generateProbeKeypair,
      getClusterVersion,
    });
    await appendJournal({
      type: "validation",
      details: {
        stage: currentStage,
        status: "rollback-sentinel-admission-passed",
        simulationContextSlot: upgradeAdmission.simulationContextSlot,
        expectedSignature: upgradeAdmission.expectedSignature,
        expectedSignatures: [...upgradeAdmission.expectedSignatures],
        blockhash: upgradeAdmission.blockhash,
        lastValidBlockHeight: upgradeAdmission.lastValidBlockHeight,
        messageSha256: upgradeAdmission.messageSha256,
        packetSha256: upgradeAdmission.packetSha256,
        packetLength: upgradeAdmission.packetLength,
        logSha256: upgradeAdmission.logSha256,
        bufferPossiblyCreated,
        bufferConsumed,
      },
    });

    const upgrade = await submit({
      instructions: [
        buildLoaderV3UpgradeInstruction({
          programId: normalized.programId,
          programdataAddress: normalized.programdataAddress,
          bufferAddress: bufferSigner.publicKey,
          spillAddress: normalized.spillAddress,
          authorityAddress: normalized.authorityAddress,
        }),
      ],
      signers: [authoritySigner],
      stage: "upgrade-existing-program",
      consumesBuffer: true,
      preBroadcastGuard: async () => {
        const guardFloor = await getFinalizedSlot();
        const [guardedProgram, guardedBufferAccount] = await Promise.all([
          readExistingProgram({
            connection,
            normalized,
            minContextSlot: guardFloor,
            readAccount,
            expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
          }),
          readBuffer({ minContextSlot: guardFloor }),
        ]);
        const guardedBuffer = parseBuffer(guardedBufferAccount.data);
        if (
          !guardedProgram.program.data.equals(freshPreUpgrade.program.data) ||
          !guardedProgram.programdata.data.equals(
            freshPreUpgrade.programdata.data,
          ) ||
          guardedBufferAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
          guardedBufferAccount.executable ||
          guardedBuffer.authorityAddress !== normalized.authorityAddress ||
          !guardedBuffer.executable.equals(normalized.target)
        ) {
          throw new Error(
            "ProgramData or buffer changed at Upgrade broadcast boundary.",
          );
        }
      },
    });
    const after = await readExistingProgram({
      connection,
      normalized,
      minContextSlot: upgrade.finalizedSlot,
      readAccount,
      expiresAtFinalizedSlot: normalized.expiresAtFinalizedSlot,
    });
    const afterExecutable = after.parsedProgramdata.executable;
    if (
      after.parsedProgramdata.slotNumber !== upgrade.finalizedSlot ||
      after.parsedProgramdata.slotNumber <=
        freshPreUpgrade.parsedProgramdata.slotNumber ||
      after.parsedProgramdata.dataLength !==
        freshPreUpgrade.parsedProgramdata.dataLength ||
      after.parsedProgramdata.authorityAddress !==
        normalized.authorityAddress ||
      !afterExecutable
        .subarray(0, normalized.target.length)
        .equals(normalized.target) ||
      !afterExecutable
        .subarray(normalized.target.length)
        .every((byte) => byte === 0) ||
      solanaSha256(afterExecutable.subarray(0, normalized.target.length)) !==
        normalized.targetSha256 ||
      solanaBlake2b256(
        afterExecutable.subarray(0, normalized.target.length),
      ) !== normalized.targetCodeHash
    ) {
      throw new Error("Finalized ProgramData upgrade readback is not exact.");
    }
    if (
      after.program.address !== before.program.address ||
      after.programdata.address !== before.programdata.address ||
      after.program.owner !== before.program.owner ||
      after.programdata.owner !== before.programdata.owner ||
      after.program.executable !== before.program.executable ||
      after.programdata.executable !== before.programdata.executable
    ) {
      throw new Error(
        "Stable program identities changed during runtime upgrade.",
      );
    }

    currentStage = "complete";
    await appendJournal({
      type: "complete",
      details: {
        stage: currentStage,
        status: "finalized-and-read-back",
        signature: upgrade.signature,
        finalizedSlot: upgrade.finalizedSlot,
        afterProgramdataSlot: after.parsedProgramdata.slot,
        targetExecutableSha256: normalized.targetSha256,
        targetCodeHash: normalized.targetCodeHash,
        bufferPossiblyCreated: false,
        bufferConsumed: true,
      },
    });

    result = {
      schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA,
      operationId: normalized.operationId,
      planSha256: normalized.planSha256,
      ready: true,
      productionReady: false,
      mode: "existing-program-only-runtime-upgrade",
      network: SOLANA_TESTNET_NETWORK,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      clusterRuntime: inspection.clusterRuntime,
      programId: normalized.programId,
      programdataAddress: normalized.programdataAddress,
      authorityAddress: normalized.authorityAddress,
      payerAddress: normalized.payerAddress,
      target: {
        executableLength: normalized.targetLength,
        artifactSha256: normalized.targetSha256,
        executableSha256: normalized.targetSha256,
        codeHash: normalized.targetCodeHash,
      },
      sbfValidation: inspection.sbfValidation,
      rollbackSentinelAdmission: {
        deploy: deployAdmission,
        upgrade: upgradeAdmission,
      },
      journal: {
        durable: true,
        journalId,
        authorityLeaseId: authorityLease.leaseId,
        authorityLeaseGeneration: authorityLease.generation,
        authorityLeaseScope: authorityLease.scope,
        authorityLeaseExpiresAtFinalizedSlot:
          authorityLease.expiresAtFinalizedSlot,
        authorityCustodyScope: authorityLease.custodyScope,
        crossHostAuthorityUseExcluded:
          authorityLease.crossHostAuthorityUseExcluded,
        claimedBeforeMutation: true,
        completedAfterFinalizedReadback: true,
        recoveryBufferAddress: bufferSigner.publicKey.toBase58(),
      },
      before: beforeSummary(before),
      ephemeralBuffer: {
        address: bufferSigner.publicKey.toBase58(),
        dataLength: populatedBuffer.dataLength,
        executableSha256: normalized.targetSha256,
        codeHash: normalized.targetCodeHash,
        initialize,
        writes,
      },
      extension:
        extension === null
          ? null
          : {
              additionalBytes: normalized.extension.additionalBytes,
              resultProgramdataDataLength:
                normalized.extension.resultProgramdataDataLength,
              transaction: extension,
            },
      upgrade,
      after: beforeSummary(after),
      policy: {
        existingProgramOnly: true,
        stableProgramKeypairAccepted: false,
        fileBackedSignersAccepted: false,
        automaticMutationRetries: 0,
        maxPacketBytes: SOLANA_PACKET_DATA_SIZE,
        everyMutationFinalizedAndFetched: true,
        exactZeroPaddingRequired: true,
      },
      cleanup: {
        required: false,
        finalized: true,
        reason: "Loader-v3 Upgrade consumed the ephemeral buffer.",
      },
      secretsZeroized: false,
    };
  } catch (error) {
    const primary = error instanceof Error ? error : new Error(String(error));
    const failures = [primary];
    if (journalClaimed) {
      try {
        await appendJournal({
          type: "failure",
          details: {
            stage: currentStage,
            status: "failed-closed",
            lastFinalizedStage: lastFinalizedTransaction?.stage ?? null,
            lastFinalizedSignature: lastFinalizedTransaction?.signature ?? null,
            lastFinalizedSlot: lastFinalizedTransaction?.finalizedSlot ?? null,
            bufferPossiblyCreated,
            bufferConsumed,
            recoveryAction:
              bufferPossiblyCreated && !bufferConsumed
                ? "close-ephemeral-loader-v3-buffer-if-present"
                : "inspect-finalized-programdata-before-any-retry",
          },
        });
      } catch (journalError) {
        failures.push(
          journalError instanceof Error
            ? journalError
            : new Error(String(journalError)),
        );
      }
    }
    try {
      await cleanupBuffer();
    } catch (cleanupError) {
      failures.push(
        cleanupError instanceof Error
          ? cleanupError
          : new Error(String(cleanupError)),
      );
    }
    failure =
      failures.length === 1
        ? primary
        : new AggregateError(
            failures,
            "Runtime upgrade failed and durable failure handling was incomplete.",
          );
  }

  const zeroizationErrors = zeroizeViews(secretViews);
  if (zeroizationErrors.length) {
    failure = failure
      ? new AggregateError(
          [failure, ...zeroizationErrors],
          "Runtime upgrade failed and signer zeroization was incomplete.",
        )
      : new AggregateError(
          zeroizationErrors,
          "Runtime upgrade completed but signer zeroization was incomplete.",
        );
  }
  if (failure) throw failure;
  result.secretsZeroized = true;
  return result;
};

const validateRecoveryClaimEvent = ({
  claimEventBytes,
  expectedClaimEventSha256,
  planBytes,
  expectedPlanSha256,
  targetExecutableBytes,
}) => {
  const normalized = validateSolanaLoaderV3RuntimeUpgradePlan({
    planBytes,
    expectedPlanSha256,
    targetExecutableBytes,
  });
  if (!(claimEventBytes instanceof Uint8Array)) {
    throw new Error(
      "Journaled recovery claim must be supplied as exact bytes.",
    );
  }
  const exactClaimBytes = Buffer.from(claimEventBytes);
  const claimEventSha256 = solanaSha256(exactClaimBytes);
  if (
    claimEventSha256 !==
    normalizeHash(
      expectedClaimEventSha256,
      "Expected recovery claim event SHA-256",
    )
  ) {
    throw new Error(
      "Journaled recovery claim bytes do not match the independently supplied hash.",
    );
  }
  let claimEvent;
  try {
    claimEvent = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(exactClaimBytes),
    );
  } catch {
    throw new Error(
      "Journaled recovery claim bytes are not strict UTF-8 JSON.",
    );
  }
  const canonicalClaimBytes =
    canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes(claimEvent);
  if (!exactClaimBytes.equals(canonicalClaimBytes)) {
    throw new Error(
      "Journaled recovery claim bytes are not in canonical JSON encoding.",
    );
  }
  if (
    claimEvent.schema !==
      SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA ||
    claimEvent.type !== "claim" ||
    claimEvent.stage !== "durable-operation-claim" ||
    claimEvent.status !== "claimed-before-mutation" ||
    !Number.isSafeInteger(claimEvent.finalizedContextSlot) ||
    claimEvent.finalizedContextSlot <= 0 ||
    claimEvent.finalizedContextSlot < normalized.minFinalizedSlot ||
    claimEvent.finalizedContextSlot > normalized.expiresAtFinalizedSlot ||
    claimEvent.authorityLeaseRequired !== true ||
    claimEvent.authorityLeaseScope !==
      solanaLoaderV3AuthorityGlobalLeaseScope(normalized.authorityAddress) ||
    claimEvent.bufferPossiblyCreated !== false ||
    claimEvent.bufferConsumed !== false ||
    claimEvent.recoveryAction !== "close-ephemeral-loader-v3-buffer-if-present"
  ) {
    throw new Error("Journaled runtime upgrade claim is not a recovery claim.");
  }
  if (
    claimEvent.operationId !== normalized.operationId ||
    claimEvent.planSha256 !== normalized.planSha256 ||
    claimEvent.programId !== normalized.programId ||
    claimEvent.programdataAddress !== normalized.programdataAddress ||
    claimEvent.authorityAddress !== normalized.authorityAddress ||
    claimEvent.payerAddress !== normalized.payerAddress ||
    claimEvent.targetArtifactSha256 !== normalized.targetSha256 ||
    claimEvent.targetExecutableLength !== normalized.targetLength
  ) {
    throw new Error(
      "Journaled recovery claim does not exactly match every canonical plan and target field.",
    );
  }
  const programId = normalizePublicKey(
    claimEvent.programId,
    "Recovery program id",
  );
  const programdataAddress = normalizePublicKey(
    claimEvent.programdataAddress,
    "Recovery ProgramData address",
  );
  const authorityAddress = normalizePublicKey(
    claimEvent.authorityAddress,
    "Recovery authority",
  );
  const payerAddress = normalizePublicKey(
    claimEvent.payerAddress,
    "Recovery payer",
  );
  const bufferAddress = normalizePublicKey(
    claimEvent.bufferAddress,
    "Recovery buffer",
  );
  if (deriveProgramdataAddress(programId) !== programdataAddress) {
    throw new Error("Recovery ProgramData address is not the program PDA.");
  }
  if (
    [programId, programdataAddress, payerAddress, authorityAddress].includes(
      bufferAddress,
    )
  ) {
    throw new Error(
      "Recovery buffer must differ from every stable public account.",
    );
  }
  return {
    ...claimEvent,
    planSha256: normalized.planSha256,
    programId,
    programdataAddress,
    authorityAddress,
    payerAddress,
    bufferAddress,
    claimEventSha256,
    normalized,
  };
};

/**
 * Closes a journaled, authority-owned ephemeral buffer after a crashed or
 * interrupted upgrade.  The durable journal must explicitly authorize the
 * recovery before any signer is acquired or transaction is built.
 */
export const recoverJournaledSolanaLoaderV3BufferWithRuntime = async ({
  connection,
  claimEventBytes,
  expectedClaimEventSha256,
  planBytes,
  expectedPlanSha256,
  targetExecutableBytes,
  signerFactory,
  dependencies = {},
} = {}) => {
  if (!connection) throw new Error("A Solana connection is required.");
  const claim = validateRecoveryClaimEvent({
    claimEventBytes,
    expectedClaimEventSha256,
    planBytes,
    expectedPlanSha256,
    targetExecutableBytes,
  });
  const operationJournal = dependencies.operationJournal;
  if (typeof operationJournal !== "function") {
    throw new Error(
      "A durable external operation journal callback is required.",
    );
  }
  const assertNetwork = dependencies.assertNetwork ?? defaultAssertNetwork;
  const getFinalizedSlot =
    dependencies.getFinalizedSlot ?? (() => connection.getSlot("finalized"));
  const getLatestBlockhash =
    dependencies.getLatestBlockhash ??
    (() => connection.getLatestBlockhash("finalized"));
  const readAccount = dependencies.readAccount ?? defaultReadAccount;
  const getClusterVersion =
    dependencies.getClusterVersion ?? defaultGetClusterVersion;
  const broadcastFinalized =
    dependencies.broadcastFinalized ?? defaultBroadcastFinalized;
  const resolveAmbiguousTransaction = dependencies.resolveAmbiguousTransaction;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const secretViews = [];
  let authoritySigner = null;
  let payerSigner = null;
  let journalId = null;
  let recoveryLease = null;
  let failure = null;
  let result = null;
  const authorityGlobalLeaseScope = solanaLoaderV3AuthorityGlobalLeaseScope(
    claim.authorityAddress,
  );

  const recoveryEvent = (type, details) => ({
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
    type,
    operationId: claim.operationId,
    planSha256: claim.planSha256,
    programId: claim.programId,
    programdataAddress: claim.programdataAddress,
    authorityAddress: claim.authorityAddress,
    payerAddress: claim.payerAddress,
    bufferAddress: claim.bufferAddress,
    targetArtifactSha256: claim.targetArtifactSha256,
    targetExecutableLength: claim.targetExecutableLength,
    claimEventSha256: claim.claimEventSha256,
    ...(type === "recovery-start"
      ? {}
      : {
          authorityLeaseId: recoveryLease?.leaseId ?? null,
          authorityLeaseGeneration: recoveryLease?.generation ?? null,
          authorityLeaseScope: recoveryLease?.scope ?? null,
        }),
    ...details,
  });

  const recordRecovery = async (type, details) => {
    const event = recoveryEvent(type, details);
    const response = await operationJournal(event);
    if (!isRecord(response) || response.durable !== true) {
      throw new Error("Recovery journal did not durably acknowledge an event.");
    }
    if (type === "recovery-start") {
      if (
        response.authorized !== true ||
        typeof response.journalId !== "string" ||
        response.claimEventSha256 !== claim.claimEventSha256 ||
        response.exclusiveAuthorityLease !== true ||
        response.authorityCustodyScope !== "same-host-exclusive" ||
        response.crossHostAuthorityUseExcluded !== true ||
        typeof response.leaseId !== "string" ||
        !Number.isSafeInteger(response.leaseGeneration) ||
        response.leaseGeneration <= 1 ||
        response.authorityLeaseScope !== authorityGlobalLeaseScope ||
        response.signerCapability === null ||
        (typeof response.signerCapability !== "object" &&
          typeof response.signerCapability !== "function")
      ) {
        throw new Error(
          "Durable journal did not authorize orphan-buffer recovery.",
        );
      }
      journalId = normalizePublicJournalId(response.journalId);
      recoveryLease = Object.freeze({
        leaseId: normalizePublicJournalId(response.leaseId),
        generation: positiveSafeInteger(
          response.leaseGeneration,
          "Recovery authority lease generation",
        ),
        scope: response.authorityLeaseScope,
        custodyScope: response.authorityCustodyScope,
        crossHostAuthorityUseExcluded: true,
        signerCapability: normalizeOpaqueSignerCapability(
          response.signerCapability,
          "Recovery authority lease signer capability",
        ),
      });
    } else if (response.recorded !== true || response.journalId !== journalId) {
      throw new Error("Recovery journal stage acknowledgement is not exact.");
    }
    return event;
  };

  try {
    await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
    await assertPinnedClusterRuntime({
      connection,
      normalized: claim.normalized,
      getClusterVersion,
    });
    const floor = await getFinalizedSlot();
    if (!Number.isSafeInteger(floor) || floor <= 0) {
      throw new Error("Recovery finalized context slot is invalid.");
    }
    await recordRecovery("recovery-start", {
      stage: "authorize-orphan-buffer-recovery",
      status: "authorized-before-signer-acquisition",
      finalizedContextSlot: floor,
      authorityLeaseRequired: true,
      authorityLeaseScope: authorityGlobalLeaseScope,
      recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
    });
    const raw = await readAccount({
      connection,
      address: claim.bufferAddress,
      minContextSlot: floor,
      label: "Journaled orphan Loader-v3 buffer",
      allowMissing: true,
    });
    if (!raw?.value || accountInfoAbsentOrClosed(raw)) {
      await recordRecovery("recovery-complete", {
        stage: "orphan-buffer-not-present",
        status: "programdata-inspection-required",
        signature: null,
        finalizedSlot: floor,
        recoveryAction: "inspect-finalized-programdata-before-any-retry",
      });
      result = {
        schema: SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
        operationId: claim.operationId,
        planSha256: claim.planSha256,
        claimEventSha256: claim.claimEventSha256,
        ready: false,
        mode: "journaled-buffer-absent-programdata-inspection-required",
        network: SOLANA_TESTNET_NETWORK,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        programId: claim.programId,
        programdataAddress: claim.programdataAddress,
        bufferAddress: claim.bufferAddress,
        authorityAddress: claim.authorityAddress,
        payerAddress: claim.payerAddress,
        target: {
          executableLength: claim.normalized.targetLength,
          artifactSha256: claim.normalized.targetSha256,
          executableSha256: claim.normalized.targetSha256,
          codeHash: claim.normalized.targetCodeHash,
        },
        journal: {
          durable: true,
          journalId,
          authorityLeaseId: recoveryLease.leaseId,
          authorityLeaseGeneration: recoveryLease.generation,
          authorityLeaseScope: recoveryLease.scope,
          recoveryCompleted: false,
          programdataInspectionRequired: true,
        },
        transaction: null,
        secretsZeroized: true,
      };
    } else {
      const account = normalizeAccount(
        raw,
        claim.bufferAddress,
        "Journaled orphan Loader-v3 buffer",
        floor,
        false,
      );
      if (
        account.owner !== SOLANA_UPGRADEABLE_LOADER_ID ||
        account.executable
      ) {
        throw new Error(
          "Journaled orphan buffer owner or executable flag is invalid.",
        );
      }
      const parsed = parseBuffer(account.data);
      if (
        parsed.authorityAddress !== claim.authorityAddress ||
        parsed.dataLength !==
          SOLANA_BUFFER_METADATA_LENGTH + claim.targetExecutableLength
      ) {
        throw new Error(
          "Journaled orphan buffer authority or exact data length does not match the claim.",
        );
      }
      if (typeof signerFactory !== "function") {
        throw new Error(
          "A runtime-only signer factory is required for recovery.",
        );
      }
      const recoveryAuthorization = Object.freeze({
        journalId,
        claimEventSha256: claim.claimEventSha256,
        leaseId: recoveryLease.leaseId,
        leaseGeneration: recoveryLease.generation,
        authorityLeaseScope: recoveryLease.scope,
        network: SOLANA_TESTNET_NETWORK,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        authorityAddress: claim.authorityAddress,
        programId: claim.programId,
        operationId: claim.operationId,
        signerCapability: recoveryLease.signerCapability,
      });
      authoritySigner = disposableSignerFromSource({
        source: await signerFactory({
          role: "authority",
          address: claim.authorityAddress,
          recoveryAuthorization,
        }),
        role: "Recovery authority signer",
        address: claim.authorityAddress,
        secretViews,
      });
      if (claim.payerAddress === claim.authorityAddress) {
        payerSigner = authoritySigner;
      } else {
        payerSigner = disposableSignerFromSource({
          source: await signerFactory({
            role: "payer",
            address: claim.payerAddress,
            recoveryAuthorization,
          }),
          role: "Recovery payer signer",
          address: claim.payerAddress,
          secretViews,
        });
      }
      await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
      const latestBlockhash = await getLatestBlockhash();
      const built = transactionWithInstructions({
        instructions: [
          buildLoaderV3CloseBufferInstruction({
            bufferAddress: claim.bufferAddress,
            recipientAddress: claim.payerAddress,
            authorityAddress: claim.authorityAddress,
          }),
        ],
        payerSigner,
        signers: [authoritySigner],
        latestBlockhash,
      });
      const recoveryIntent = buildSignedTransactionIntent({
        built,
        latestBlockhash,
        stage: "recover-close-orphan-buffer",
      });
      await recordRecovery("recovery-intent", {
        stage: "recover-close-orphan-buffer",
        status: "prepared-before-broadcast",
        ...journalIntentDetails(recoveryIntent),
      });
      try {
        await assertNetwork(connection, SOLANA_TESTNET_GENESIS_HASH);
        await assertPinnedClusterRuntime({
          connection,
          normalized: claim.normalized,
          getClusterVersion,
        });
        const preBroadcastFloor = await getFinalizedSlot();
        if (
          !Number.isSafeInteger(preBroadcastFloor) ||
          preBroadcastFloor <= 0
        ) {
          throw new Error("Recovery finalized context slot is invalid.");
        }
        const reboundRaw = await readAccount({
          connection,
          address: claim.bufferAddress,
          minContextSlot: preBroadcastFloor,
          label: "Journaled orphan Loader-v3 buffer at broadcast boundary",
          allowMissing: true,
        });
        if (!reboundRaw?.value || accountInfoAbsentOrClosed(reboundRaw)) {
          throw new Error(
            "Journaled orphan buffer disappeared before recovery broadcast; ProgramData inspection is required.",
          );
        }
        const reboundAccount = normalizeAccount(
          reboundRaw,
          claim.bufferAddress,
          "Journaled orphan Loader-v3 buffer at broadcast boundary",
          preBroadcastFloor,
          false,
        );
        const reboundBuffer = parseBuffer(reboundAccount.data);
        if (
          reboundAccount.owner !== account.owner ||
          reboundAccount.executable !== account.executable ||
          reboundAccount.lamports !== account.lamports ||
          !reboundAccount.data.equals(account.data) ||
          reboundBuffer.authorityAddress !== claim.authorityAddress ||
          reboundBuffer.dataLength !==
            SOLANA_BUFFER_METADATA_LENGTH + claim.targetExecutableLength
        ) {
          throw new Error(
            "Journaled orphan buffer changed before recovery broadcast; exact account rebinding failed.",
          );
        }
      } catch (contextError) {
        await recordRecovery("recovery-resolution", {
          stage: "recover-close-orphan-buffer",
          status: "aborted-before-broadcast",
          ...journalIntentDetails(recoveryIntent),
          recoveryAction: "inspect-finalized-programdata-before-any-retry",
        });
        throw contextError;
      }
      let transaction;
      try {
        transaction = await submitExactTransaction({
          connection,
          built,
          latestBlockhash,
          broadcastFinalized,
          sleep,
          stage: "recover-close-orphan-buffer",
          preparedIntent: recoveryIntent,
        });
      } catch (recoverySubmitError) {
        let resolutionFailure = null;
        let resolution = null;
        if (typeof resolveAmbiguousTransaction === "function") {
          try {
            resolution = await resolveAmbiguousTransaction({
              connection,
              intent: recoveryIntent,
              rawTransaction: Buffer.from(built.raw),
              latestBlockhash: { ...latestBlockhash },
            });
          } catch (error) {
            resolutionFailure =
              error instanceof Error ? error : new Error(String(error));
          }
        }
        if (!resolutionFailure && isRecord(resolution)) {
          if (resolution.status === "finalized") {
            try {
              const resolvedTransaction = await submitExactTransaction({
                connection,
                built,
                latestBlockhash,
                broadcastFinalized,
                sleep,
                stage: "recover-close-orphan-buffer",
                preparedIntent: recoveryIntent,
                submittedResult: resolution.submittedResult,
                allowBroadcast: false,
              });
              await recordRecovery("recovery-resolution", {
                stage: "recover-close-orphan-buffer",
                status: "delayed-finalization-resolved",
                ...journalIntentDetails(recoveryIntent),
                finalizedSlot: resolvedTransaction.finalizedSlot,
              });
              transaction = resolvedTransaction;
            } catch (error) {
              resolutionFailure =
                error instanceof Error ? error : new Error(String(error));
            }
          } else if (
            resolution.status === "expired" ||
            resolution.status === "failed"
          ) {
            const definitive =
              resolution.status === "expired"
                ? Number.isSafeInteger(resolution.observedBlockHeight) &&
                  resolution.observedBlockHeight >
                    recoveryIntent.lastValidBlockHeight &&
                  resolution.signatureStatus === null
                : resolution.signature ===
                    recoveryIntent.expectedPrimarySignature &&
                  resolution.finalized === true &&
                  resolution.err !== null &&
                  resolution.err !== undefined;
            if (definitive) {
              const terminalFailureEvidence =
                resolution.status === "expired"
                  ? { signatureStatus: null }
                  : {
                      finalized: true,
                      ...publicTransactionErrorEvidence(resolution.err),
                    };
              await recordRecovery("recovery-resolution", {
                stage: "recover-close-orphan-buffer",
                status: `definitive-${resolution.status}`,
                ...journalIntentDetails(recoveryIntent),
                observedBlockHeight: resolution.observedBlockHeight ?? null,
                ...terminalFailureEvidence,
              });
              throw recoverySubmitError;
            }
            resolutionFailure = new Error(
              "Ambiguous recovery transaction resolution is not structurally definitive.",
            );
          }
        } else if (!resolutionFailure && resolution !== null) {
          resolutionFailure = new Error(
            "Ambiguous recovery transaction resolver returned no exact state.",
          );
        }
        if (!transaction) {
          await recordRecovery("recovery-ambiguous", {
            stage: "recover-close-orphan-buffer",
            status: "resolution-required",
            ...journalIntentDetails(recoveryIntent),
            recoveryAction: "resolve-signature-through-finalization-or-expiry",
          });
          if (resolutionFailure) {
            throw new AggregateError(
              [recoverySubmitError, resolutionFailure],
              "Recovery close may have been accepted and exact resolution failed.",
            );
          }
          throw recoverySubmitError;
        }
      }
      const closed = await readAccount({
        connection,
        address: claim.bufferAddress,
        minContextSlot: transaction.finalizedSlot,
        label: "Recovered Loader-v3 buffer",
        allowMissing: true,
      });
      if (!accountInfoAbsentOrClosed(closed)) {
        throw new Error(
          "Journaled orphan Loader-v3 buffer was not closed exactly.",
        );
      }
      await recordRecovery("recovery-complete", {
        stage: "close-orphan-buffer",
        status: "finalized-closed",
        signature: transaction.signature,
        ...journalIntentDetails(recoveryIntent),
        finalizedSlot: transaction.finalizedSlot,
      });
      result = {
        schema: SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
        operationId: claim.operationId,
        planSha256: claim.planSha256,
        claimEventSha256: claim.claimEventSha256,
        ready: true,
        mode: "journaled-buffer-finalized-close",
        network: SOLANA_TESTNET_NETWORK,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        programId: claim.programId,
        programdataAddress: claim.programdataAddress,
        bufferAddress: claim.bufferAddress,
        authorityAddress: claim.authorityAddress,
        payerAddress: claim.payerAddress,
        target: {
          executableLength: claim.normalized.targetLength,
          artifactSha256: claim.normalized.targetSha256,
          executableSha256: claim.normalized.targetSha256,
          codeHash: claim.normalized.targetCodeHash,
        },
        journal: {
          durable: true,
          journalId,
          authorityLeaseId: recoveryLease.leaseId,
          authorityLeaseGeneration: recoveryLease.generation,
          authorityLeaseScope: recoveryLease.scope,
          recoveryCompleted: true,
        },
        transaction,
        secretsZeroized: false,
      };
    }
  } catch (error) {
    const errors = [error instanceof Error ? error : new Error(String(error))];
    if (journalId) {
      try {
        await recordRecovery("recovery-failure", {
          stage: "recover-orphan-buffer",
          status: "failed-closed",
          signature: null,
          finalizedSlot: null,
          recoveryAction: "manual-journal-and-buffer-inspection-required",
        });
      } catch (journalError) {
        errors.push(
          journalError instanceof Error
            ? journalError
            : new Error(String(journalError)),
        );
      }
    }
    failure =
      errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            "Orphan-buffer recovery failed and its durable journal update was incomplete.",
          );
  }
  const zeroizationErrors = zeroizeViews(secretViews);
  if (zeroizationErrors.length) {
    failure = failure
      ? new AggregateError(
          [failure, ...zeroizationErrors],
          "Orphan-buffer recovery failed and signer zeroization was incomplete.",
        )
      : new AggregateError(
          zeroizationErrors,
          "Orphan-buffer recovery completed but signer zeroization was incomplete.",
        );
  }
  if (failure) throw failure;
  result.secretsZeroized = true;
  return result;
};

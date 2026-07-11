// @vitest-environment node
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA,
  SOLANA_LOADER_V3_TARGET_ADMISSION_EVIDENCE_SCHEMA,
  SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS,
  SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA,
  SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE,
  SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
  SOLANA_PACKET_DATA_SIZE,
  SOLANA_BUFFER_METADATA_LENGTH,
  SOLANA_PROGRAMDATA_METADATA_LENGTH,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_UPGRADEABLE_LOADER_ID,
  canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes,
  canonicalSolanaLoaderV3RuntimeUpgradePlanBytes,
  canonicalSolanaLoaderV3SbfValidationEvidenceBytes,
  solanaBlake2b256,
  solanaLoaderV3AuthorityGlobalLeaseScope,
  solanaSha256,
  buildLoaderV3CloseBufferInstruction,
  buildLoaderV3InitializeBufferInstruction,
  buildLoaderV3UpgradeInstruction,
  buildLoaderV3WriteInstruction,
} from "../scripts/solana-loader-v3-runtime.mjs";
import {
  SOLANA_UPGRADE_AUTHORITY_RUNTIME_SIGNER_ENV,
  SOLANA_UPGRADE_PAYER_RUNTIME_SIGNER_ENV,
  artifactPaths,
  createDurableSolanaUpgradeOperationJournal,
  createDurableSolanaUpgradeRecoveryJournal,
  createDurableSolanaUpgradeRecoveryLock,
  exactSolanaRuntimeRecoveryDiagnosticMatchesJournal,
  exactSolanaRuntimeRecoveryReportMatchesJournal,
  exactSolanaRuntimeUpgradeReportMatchesJournal,
  openDurableSolanaUpgradeAuthorityLeaseForRecovery,
  parseSolanaExistingProgramUpgradeRecoveryJournal,
  readStablePublicSolanaUpgradeArtifact,
  readStableSolanaExistingProgramUpgradeJournal,
  reconcileDeadOwnerTerminalSolanaUpgradeLease,
  recoverExistingProgramUpgradeBuffer,
  resolveSolanaRuntimeUpgradeAmbiguousTransaction,
  solanaExistingProgramUpgradeJournalPaths,
  solanaExistingProgramUpgradeLeaseIdentity,
  simulateSolanaRuntimeUpgradeRawTransaction,
  snapshotCanonicalSolanaRuntimeReport,
  upgradeExistingProgram,
  upgradeExistingProgramReadiness,
} from "../scripts/sccp-solana-deploy.mjs";
import {
  captureAbsentLoaderV3FixtureAncestors,
  pruneCapturedLoaderV3FixtureAncestors,
} from "./helpers/solanaLoaderV3FixtureCleanup.js";

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const cleanupPaths = new Set();
const cleanupAncestorCaptures = new Set();

afterEach(() => {
  for (const target of cleanupPaths) {
    rmSync(target, { recursive: true, force: true });
  }
  cleanupPaths.clear();
  pruneCapturedLoaderV3FixtureAncestors(cleanupAncestorCaptures);
  cleanupAncestorCaptures.clear();
});

const temporaryRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), "sccp-solana-upgrade-"));
  cleanupPaths.add(root);
  return root;
};

const seededKeypair = (seed) =>
  Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => seed));

const labeledKeypair = (label) =>
  Keypair.fromSeed(createHash("sha256").update(label).digest());

const elf = (length, byte) => {
  const bytes = Buffer.alloc(length, byte);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(bytes);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes[6] = 1;
  bytes.writeUInt16LE(3, 16);
  bytes.writeUInt16LE(247, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(5, 68);
  return bytes;
};

const TEST_RUSTC_IDENTITY =
  "rustc 1.89.0 (29483883e 2025-08-04);binary: rustc;commit-hash: 29483883eed69d5fb4db01964cdf2af4d86e9cb2;commit-date: 2025-08-04;host: x86_64-unknown-linux-gnu;release: 1.89.0;LLVM version: 20.1.7";

const fixture = () => {
  const root = temporaryRoot();
  const program = seededKeypair(31).publicKey;
  const programdata = PublicKey.findProgramAddressSync(
    [program.toBuffer()],
    LOADER,
  )[0];
  const authority = labeledKeypair(`authority:${root}`);
  const payer = labeledKeypair(`payer:${root}`);
  const buffer = labeledKeypair(`buffer:${root}`).publicKey;
  const before = elf(512, 0x41);
  const target = elf(256, 0x52);
  const operationId = `0x${createHash("sha256").update(root).digest("hex")}`;
  const sbfValidationEvidence = {
    schema: SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA,
    valid: true,
    deterministic: true,
    validationScope: SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE,
    exactClusterAdmission: false,
    productionEligible: true,
    validatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
    validatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
    policySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
    artifactSha256: solanaSha256(target),
    codeHash: solanaBlake2b256(target),
    executableLength: target.length,
    helperBinarySha256: solanaSha256(Buffer.from("validator", "utf8")),
    helperTargetTriple: "x86_64-unknown-linux-gnu",
    jitOutcome: "compiled",
    buildProfile: "release",
    validatorSourceBundleSha256: solanaSha256(
      Buffer.from("validator-source", "utf8"),
    ),
    cargoLockSha256: solanaSha256(Buffer.from("cargo-lock", "utf8")),
    rustcIdentity: TEST_RUSTC_IDENTITY,
    rustcIdentitySha256: solanaSha256(Buffer.from(TEST_RUSTC_IDENTITY)),
    resourceLimits: "unix-rlimit-v1",
    checks: [...SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS],
  };
  const evidenceBytes = canonicalSolanaLoaderV3SbfValidationEvidenceBytes(
    sbfValidationEvidence,
  );
  const plan = {
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA,
    operationId,
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    programId: program.toBase58(),
    programdataAddress: programdata.toBase58(),
    authorityAddress: authority.publicKey.toBase58(),
    payerAddress: payer.publicKey.toBase58(),
    spillAddress: payer.publicKey.toBase58(),
    context: {
      minFinalizedSlot: 100,
      expiresAtFinalizedSlot: 1000,
      solanaCoreVersion: "4.1.0",
      featureSet: 3345198602,
    },
    before: {
      programdataSlot: "42",
      programdataDataLength: SOLANA_PROGRAMDATA_METADATA_LENGTH + before.length,
      executableLength: before.length,
      executableSha256: solanaSha256(before),
      codeHash: solanaBlake2b256(before),
    },
    target: {
      artifactSha256: solanaSha256(target),
      executableSha256: solanaSha256(target),
      codeHash: solanaBlake2b256(target),
      executableLength: target.length,
      sbfValidatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: solanaSha256(evidenceBytes),
    },
    extension: null,
    policy: {
      maxPacketBytes: SOLANA_PACKET_DATA_SIZE,
      automaticMutationRetries: 0,
      allowNewProgramId: false,
      runtimeOnlySigners: true,
    },
  };
  const planBytes = canonicalSolanaLoaderV3RuntimeUpgradePlanBytes(plan);
  const expectedPlanSha256 = solanaSha256(planBytes);
  const normalized = {
    operationId,
    planSha256: expectedPlanSha256,
    programId: plan.programId,
    programdataAddress: plan.programdataAddress,
    authorityAddress: plan.authorityAddress,
    payerAddress: plan.payerAddress,
    spillAddress: plan.spillAddress,
    targetSha256: plan.target.artifactSha256,
    targetCodeHash: plan.target.codeHash,
    targetLength: plan.target.executableLength,
    minFinalizedSlot: plan.context.minFinalizedSlot,
    expiresAtFinalizedSlot: plan.context.expiresAtFinalizedSlot,
    solanaCoreVersion: plan.context.solanaCoreVersion,
    featureSet: plan.context.featureSet,
    beforeSlot: plan.before.programdataSlot,
    beforeDataLength: plan.before.programdataDataLength,
    beforeExecutableLength: plan.before.executableLength,
    beforeExecutableSha256: plan.before.executableSha256,
    beforeCodeHash: plan.before.codeHash,
    sbfValidatorId: plan.target.sbfValidatorId,
    sbfValidatorVersion: plan.target.sbfValidatorVersion,
    sbfValidationPolicySha256: plan.target.sbfValidationPolicySha256,
    sbfValidationEvidenceSha256: plan.target.sbfValidationEvidenceSha256,
    extension: null,
  };
  const planPath = path.join(root, "upgrade-plan.json");
  const targetPath = path.join(root, "target.so");
  const evidencePath = path.join(root, "sbf-evidence.json");
  writeFileSync(planPath, planBytes);
  writeFileSync(targetPath, target);
  writeFileSync(evidencePath, evidenceBytes);
  const journalPaths = solanaExistingProgramUpgradeJournalPaths(normalized);
  cleanupAncestorCaptures.add(
    captureAbsentLoaderV3FixtureAncestors(journalPaths),
  );
  cleanupPaths.add(journalPaths.operationDirectory);
  cleanupPaths.add(journalPaths.authorityLease);
  return {
    root,
    outputDir: path.join(root, "output"),
    program,
    programdata,
    authority,
    payer,
    buffer,
    target,
    before,
    plan,
    planBytes,
    evidenceBytes,
    sbfValidationEvidence,
    expectedPlanSha256,
    normalized,
    journalPaths,
    inputs: {
      normalized,
      targetProgram: { bytes: target },
      sbfValidationEvidence,
    },
    args: {
      "output-dir": path.join(root, "output"),
      "upgrade-plan": planPath,
      "target-program-so": targetPath,
      "sbf-validation-evidence": evidencePath,
      "expected-upgrade-plan-sha256": expectedPlanSha256,
    },
  };
};

const claimEvent = (source, overrides = {}) => ({
  schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  type: "claim",
  operationId: source.plan.operationId,
  planSha256: source.expectedPlanSha256,
  programId: source.plan.programId,
  programdataAddress: source.plan.programdataAddress,
  authorityAddress: source.plan.authorityAddress,
  payerAddress: source.plan.payerAddress,
  bufferAddress: source.buffer.toBase58(),
  targetArtifactSha256: source.plan.target.artifactSha256,
  targetExecutableLength: source.target.length,
  stage: "durable-operation-claim",
  status: "claimed-before-mutation",
  finalizedContextSlot: 100,
  authorityLeaseRequired: true,
  authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
    source.plan.authorityAddress,
  ),
  bufferPossiblyCreated: false,
  bufferConsumed: false,
  recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
  ...overrides,
});

const claimDigest = (claim) =>
  solanaSha256(canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes(claim));

const eventIdentity = (source, claim, type, generation = 1) => {
  const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
  return {
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
    authorityLeaseId: lease.leaseId,
    authorityLeaseGeneration: generation,
    authorityLeaseScope: lease.authorityLeaseScope,
  };
};

const transactionTuple = (seed) => {
  const payer = seededKeypair(seed);
  const transaction = new Transaction();
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = seededKeypair(seed + 1).publicKey.toBase58();
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: seededKeypair(seed + 2).publicKey,
      lamports: 1,
    }),
  );
  transaction.sign(payer);
  const raw = transaction.serialize();
  const decoded = VersionedTransaction.deserialize(raw);
  const expectedSignatures = decoded.signatures.map((signature) =>
    bs58.encode(signature),
  );
  return {
    raw,
    expectedSignature: expectedSignatures[0],
    expectedPrimarySignature: expectedSignatures[0],
    expectedSignatures,
    blockhash: decoded.message.recentBlockhash,
    lastValidBlockHeight: 500 + seed,
    messageSha256: solanaSha256(decoded.message.serialize()),
    packetSha256: solanaSha256(raw),
    packetLength: raw.length,
  };
};

const journalTuple = (tuple) => ({
  expectedSignature: tuple.expectedSignature,
  expectedSignatures: [...tuple.expectedSignatures],
  blockhash: tuple.blockhash,
  lastValidBlockHeight: tuple.lastValidBlockHeight,
  messageSha256: tuple.messageSha256,
  packetSha256: tuple.packetSha256,
  packetLength: tuple.packetLength,
});

const intentEvent = ({ source, claim, stage, tuple, generation = 1 }) => ({
  ...eventIdentity(source, claim, "intent", generation),
  stage,
  status: "prepared-before-broadcast",
  ...journalTuple(tuple),
  bufferPossiblyCreated: stage !== "create-and-initialize-buffer",
  bufferConsumed: false,
});

const stageEvent = ({ source, claim, stage, tuple, slot, generation = 1 }) => ({
  ...eventIdentity(source, claim, "stage", generation),
  stage,
  status: stage === "cleanup-close-buffer" ? "finalized-closed" : "finalized",
  signature: tuple.expectedSignature,
  ...journalTuple(tuple),
  finalizedSlot: slot,
  bufferPossiblyCreated: ![
    "create-and-initialize-buffer",
    "cleanup-close-buffer",
    "upgrade-existing-program",
  ].includes(stage),
  bufferConsumed: stage === "upgrade-existing-program",
});

const failureEvent = ({
  source,
  claim,
  stage,
  last = null,
  bufferPossiblyCreated = false,
}) => ({
  ...eventIdentity(source, claim, "failure"),
  stage,
  status: "failed-closed",
  lastFinalizedStage: last?.stage ?? null,
  lastFinalizedSignature: last?.signature ?? null,
  lastFinalizedSlot: last?.finalizedSlot ?? null,
  bufferPossiblyCreated,
  bufferConsumed: false,
  recoveryAction: bufferPossiblyCreated
    ? "close-ephemeral-loader-v3-buffer-if-present"
    : "inspect-finalized-programdata-before-any-retry",
});

const validationEvent = ({ source, claim, stage, tuple }) => ({
  ...eventIdentity(source, claim, "validation"),
  stage,
  status: "rollback-sentinel-admission-passed",
  simulationContextSlot: 130,
  expectedSignature: tuple.expectedSignature,
  expectedSignatures: [...tuple.expectedSignatures],
  blockhash: tuple.blockhash,
  lastValidBlockHeight: tuple.lastValidBlockHeight,
  messageSha256: tuple.messageSha256,
  packetSha256: tuple.packetSha256,
  packetLength: tuple.packetLength,
  logSha256: solanaSha256(Buffer.from(stage)),
  ...(stage === "pre-extension-deploy-admission"
    ? {
        intendedExecutableCapacity:
          source.normalized.beforeDataLength -
          SOLANA_PROGRAMDATA_METADATA_LENGTH,
      }
    : {}),
  bufferPossiblyCreated: true,
  bufferConsumed: false,
});

const journalBytes = (...events) =>
  Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

const recoveryStartEvent = ({ claim, claimEventSha256, scope, slot }) => ({
  schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  type: "recovery-start",
  operationId: claim.operationId,
  planSha256: claim.planSha256,
  programId: claim.programId,
  programdataAddress: claim.programdataAddress,
  authorityAddress: claim.authorityAddress,
  payerAddress: claim.payerAddress,
  bufferAddress: claim.bufferAddress,
  targetArtifactSha256: claim.targetArtifactSha256,
  targetExecutableLength: claim.targetExecutableLength,
  claimEventSha256,
  stage: "authorize-orphan-buffer-recovery",
  status: "authorized-before-signer-acquisition",
  finalizedContextSlot: slot,
  authorityLeaseRequired: true,
  authorityLeaseScope: scope,
  recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
});

const completedEvents = (source, claim = claimEvent(source)) => {
  const create = transactionTuple(61);
  const write = transactionTuple(64);
  const deployAdmission = transactionTuple(67);
  const upgradeAdmission = transactionTuple(70);
  const upgrade = transactionTuple(73);
  const createIntent = intentEvent({
    source,
    claim,
    stage: "create-and-initialize-buffer",
    tuple: create,
  });
  const createStage = stageEvent({
    source,
    claim,
    stage: "create-and-initialize-buffer",
    tuple: create,
    slot: 120,
  });
  const writeIntent = intentEvent({
    source,
    claim,
    stage: "write-buffer-0",
    tuple: write,
  });
  const writeStage = stageEvent({
    source,
    claim,
    stage: "write-buffer-0",
    tuple: write,
    slot: 121,
  });
  const upgradeIntent = intentEvent({
    source,
    claim,
    stage: "upgrade-existing-program",
    tuple: upgrade,
  });
  const upgradeStage = stageEvent({
    source,
    claim,
    stage: "upgrade-existing-program",
    tuple: upgrade,
    slot: 140,
  });
  const complete = {
    ...eventIdentity(source, claim, "complete"),
    stage: "complete",
    status: "finalized-and-read-back",
    signature: upgrade.expectedSignature,
    finalizedSlot: 140,
    afterProgramdataSlot: "140",
    targetExecutableSha256: source.plan.target.artifactSha256,
    targetCodeHash: source.plan.target.codeHash,
    bufferPossiblyCreated: false,
    bufferConsumed: true,
  };
  return {
    claim,
    create,
    write,
    deployAdmission,
    upgradeAdmission,
    upgrade,
    events: [
      claim,
      createIntent,
      createStage,
      writeIntent,
      writeStage,
      validationEvent({
        source,
        claim,
        stage: "pre-extension-deploy-admission",
        tuple: deployAdmission,
      }),
      validationEvent({
        source,
        claim,
        stage: "post-extension-upgrade-admission",
        tuple: upgradeAdmission,
      }),
      upgradeIntent,
      upgradeStage,
      complete,
    ],
  };
};

const driveCompletedJournal = async (operationJournal, source) => {
  const sequence = completedEvents(source);
  for (const event of sequence.events) await operationJournal(event);
  return sequence;
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

const transactionReport = ({
  tuple,
  stage,
  finalizedSlot,
  instructions,
  writeRange = null,
}) => ({
  stage,
  signature: tuple.expectedSignature,
  signatures: [...tuple.expectedSignatures],
  finalizedSlot,
  packetLength: tuple.packetLength,
  packetSha256: tuple.packetSha256,
  blockhash: tuple.blockhash,
  lastValidBlockHeight: tuple.lastValidBlockHeight,
  messageSha256: tuple.messageSha256,
  fetchedMessageSha256: tuple.messageSha256,
  instructions: instructions.map(instructionSummary),
  ...(writeRange ?? {}),
});

const admissionReport = ({
  source,
  sequence,
  mode,
  tuple,
  bufferContextSlot,
  simulationContextSlot,
}) => {
  const probe = seededKeypair(mode === "deploy" ? 111 : 112).publicKey;
  const probeProgramdata = PublicKey.findProgramAddressSync(
    [probe.toBuffer()],
    LOADER,
  )[0];
  return {
    schema: SOLANA_LOADER_V3_TARGET_ADMISSION_EVIDENCE_SCHEMA,
    mode,
    ready: true,
    simulationOnly: true,
    broadcast: false,
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    solanaCoreVersion: source.normalized.solanaCoreVersion,
    featureSet: source.normalized.featureSet,
    programId: source.plan.programId,
    programdataAddress: source.plan.programdataAddress,
    bufferAddress: sequence.claim.bufferAddress,
    bufferExecutableSha256: source.plan.target.artifactSha256,
    targetArtifactSha256: source.plan.target.artifactSha256,
    targetCodeHash: source.plan.target.codeHash,
    targetExecutableLength: source.target.length,
    intendedExecutableCapacity: source.before.length,
    bufferContextSlot,
    simulationContextSlot,
    sentinelInstructionIndex: mode === "deploy" ? 2 : 1,
    expectedError: "InvalidInstructionData",
    expectedSignature: tuple.expectedSignature,
    expectedSignatures: [...tuple.expectedSignatures],
    blockhash: tuple.blockhash,
    lastValidBlockHeight: tuple.lastValidBlockHeight,
    messageSha256: tuple.messageSha256,
    packetSha256: tuple.packetSha256,
    packetLength: tuple.packetLength,
    logSha256: solanaSha256(Buffer.from(`${mode}-admission-log`)),
    probeProgramAddress: mode === "deploy" ? probe.toBase58() : null,
    probeProgramdataAddress:
      mode === "deploy" ? probeProgramdata.toBase58() : null,
  };
};

const exactUpgradeReport = (source, sequence) => {
  const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
  const initializeInstructions = [
    SystemProgram.createAccount({
      fromPubkey: source.payer.publicKey,
      newAccountPubkey: new PublicKey(sequence.claim.bufferAddress),
      lamports: 1,
      space: SOLANA_BUFFER_METADATA_LENGTH + source.target.length,
      programId: LOADER,
    }),
    buildLoaderV3InitializeBufferInstruction({
      bufferAddress: sequence.claim.bufferAddress,
      authorityAddress: source.plan.authorityAddress,
    }),
  ];
  const writeInstructions = [
    buildLoaderV3WriteInstruction({
      bufferAddress: sequence.claim.bufferAddress,
      authorityAddress: source.plan.authorityAddress,
      offset: 0,
      bytes: source.target,
    }),
  ];
  const upgradeInstructions = [
    buildLoaderV3UpgradeInstruction({
      programId: source.plan.programId,
      programdataAddress: source.plan.programdataAddress,
      bufferAddress: sequence.claim.bufferAddress,
      spillAddress: source.plan.spillAddress,
      authorityAddress: source.plan.authorityAddress,
    }),
  ];
  const afterExecutable = Buffer.alloc(source.before.length);
  source.target.copy(afterExecutable);
  const sbf = source.sbfValidationEvidence;
  return {
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA,
    operationId: source.plan.operationId,
    planSha256: source.expectedPlanSha256,
    ready: true,
    productionReady: false,
    mode: "existing-program-only-runtime-upgrade",
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    clusterRuntime: {
      solanaCoreVersion: source.normalized.solanaCoreVersion,
      featureSet: source.normalized.featureSet,
    },
    programId: source.plan.programId,
    programdataAddress: source.plan.programdataAddress,
    authorityAddress: source.plan.authorityAddress,
    payerAddress: source.plan.payerAddress,
    target: {
      artifactSha256: source.plan.target.artifactSha256,
      executableSha256: source.plan.target.artifactSha256,
      executableLength: source.target.length,
      codeHash: source.plan.target.codeHash,
    },
    sbfValidation: {
      schema: sbf.schema,
      valid: true,
      deterministic: true,
      validationScope: sbf.validationScope,
      exactClusterAdmission: false,
      exactClusterAdmissionAuthority: "rollback-sentinel-simulation",
      productionEligible: true,
      validatorId: sbf.validatorId,
      validatorVersion: sbf.validatorVersion,
      policySha256: sbf.policySha256,
      evidenceSha256: source.normalized.sbfValidationEvidenceSha256,
      artifactSha256: sbf.artifactSha256,
      codeHash: sbf.codeHash,
      executableLength: sbf.executableLength,
      helperBinarySha256: sbf.helperBinarySha256,
      helperTargetTriple: sbf.helperTargetTriple,
      jitOutcome: sbf.jitOutcome,
      buildProfile: sbf.buildProfile,
      validatorSourceBundleSha256: sbf.validatorSourceBundleSha256,
      cargoLockSha256: sbf.cargoLockSha256,
      rustcIdentity: sbf.rustcIdentity,
      rustcIdentitySha256: sbf.rustcIdentitySha256,
      resourceLimits: sbf.resourceLimits,
      checks: [...sbf.checks],
    },
    rollbackSentinelAdmission: {
      deploy: {
        ...admissionReport({
          source,
          sequence,
          mode: "deploy",
          tuple: sequence.deployAdmission,
          bufferContextSlot: 121,
          simulationContextSlot: 130,
        }),
        logSha256: solanaSha256(Buffer.from("pre-extension-deploy-admission")),
      },
      upgrade: {
        ...admissionReport({
          source,
          sequence,
          mode: "upgrade",
          tuple: sequence.upgradeAdmission,
          bufferContextSlot: 130,
          simulationContextSlot: 130,
        }),
        logSha256: solanaSha256(
          Buffer.from("post-extension-upgrade-admission"),
        ),
      },
    },
    journal: {
      durable: true,
      journalId: lease.journalId,
      authorityLeaseId: lease.leaseId,
      authorityLeaseGeneration: 1,
      authorityLeaseScope: lease.authorityLeaseScope,
      authorityLeaseExpiresAtFinalizedSlot: 1000,
      authorityCustodyScope: "same-host-exclusive",
      crossHostAuthorityUseExcluded: true,
      claimedBeforeMutation: true,
      completedAfterFinalizedReadback: true,
      recoveryBufferAddress: sequence.claim.bufferAddress,
    },
    before: {
      programId: source.plan.programId,
      programOwner: SOLANA_UPGRADEABLE_LOADER_ID,
      programExecutable: true,
      programContextSlot: 100,
      programdataAddress: source.plan.programdataAddress,
      programdataOwner: SOLANA_UPGRADEABLE_LOADER_ID,
      programdataExecutable: false,
      programdataContextSlot: 100,
      programdataSlot: source.plan.before.programdataSlot,
      authorityAddress: source.plan.authorityAddress,
      programdataDataLength: source.plan.before.programdataDataLength,
      executableLength: source.before.length,
      executableSha256: source.plan.before.executableSha256,
      codeHash: source.plan.before.codeHash,
    },
    ephemeralBuffer: {
      address: sequence.claim.bufferAddress,
      dataLength: SOLANA_BUFFER_METADATA_LENGTH + source.target.length,
      executableSha256: source.plan.target.artifactSha256,
      codeHash: source.plan.target.codeHash,
      initialize: transactionReport({
        tuple: sequence.create,
        stage: "create-and-initialize-buffer",
        finalizedSlot: 120,
        instructions: initializeInstructions,
      }),
      writes: [
        transactionReport({
          tuple: sequence.write,
          stage: "write-buffer-0",
          finalizedSlot: 121,
          instructions: writeInstructions,
          writeRange: {
            offset: 0,
            length: source.target.length,
            endOffset: source.target.length,
          },
        }),
      ],
    },
    extension: null,
    upgrade: transactionReport({
      tuple: sequence.upgrade,
      stage: "upgrade-existing-program",
      finalizedSlot: 140,
      instructions: upgradeInstructions,
    }),
    after: {
      programId: source.plan.programId,
      programOwner: SOLANA_UPGRADEABLE_LOADER_ID,
      programExecutable: true,
      programContextSlot: 140,
      programdataAddress: source.plan.programdataAddress,
      programdataOwner: SOLANA_UPGRADEABLE_LOADER_ID,
      programdataExecutable: false,
      programdataContextSlot: 140,
      programdataSlot: "140",
      authorityAddress: source.plan.authorityAddress,
      programdataDataLength: source.plan.before.programdataDataLength,
      executableLength: source.before.length,
      executableSha256: solanaSha256(afterExecutable),
      codeHash: solanaBlake2b256(afterExecutable),
    },
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
    secretsZeroized: true,
  };
};

const exactRecoveryReport = ({
  source,
  claim,
  tuple,
  generation = 2,
  finalizedSlot = 160,
}) => {
  const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
  return {
    schema: SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
    operationId: claim.operationId,
    planSha256: claim.planSha256,
    claimEventSha256: claimDigest(claim),
    ready: true,
    mode: "journaled-buffer-finalized-close",
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    programId: claim.programId,
    programdataAddress: claim.programdataAddress,
    authorityAddress: claim.authorityAddress,
    payerAddress: claim.payerAddress,
    bufferAddress: claim.bufferAddress,
    target: {
      artifactSha256: claim.targetArtifactSha256,
      executableSha256: claim.targetArtifactSha256,
      executableLength: claim.targetExecutableLength,
      codeHash: source.plan.target.codeHash,
    },
    journal: {
      durable: true,
      journalId: lease.journalId,
      authorityLeaseId: lease.leaseId,
      authorityLeaseGeneration: generation,
      authorityLeaseScope: lease.authorityLeaseScope,
      recoveryCompleted: true,
    },
    transaction: transactionReport({
      tuple,
      stage: "recover-close-orphan-buffer",
      finalizedSlot,
      instructions: [
        buildLoaderV3CloseBufferInstruction({
          bufferAddress: claim.bufferAddress,
          recipientAddress: claim.payerAddress,
          authorityAddress: claim.authorityAddress,
        }),
      ],
    }),
    secretsZeroized: true,
  };
};

const recoveryTerminalSummary = ({
  source,
  claim,
  tuple,
  generation = 2,
  finalizedSlot = 160,
}) => {
  const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
  return {
    operationId: claim.operationId,
    planSha256: claim.planSha256,
    claimEventSha256: claimDigest(claim),
    programId: claim.programId,
    programdataAddress: claim.programdataAddress,
    authorityAddress: claim.authorityAddress,
    payerAddress: claim.payerAddress,
    bufferAddress: claim.bufferAddress,
    targetArtifactSha256: claim.targetArtifactSha256,
    targetExecutableLength: claim.targetExecutableLength,
    leaseId: lease.leaseId,
    leaseGeneration: generation,
    authorityLeaseScope: lease.authorityLeaseScope,
    signature: tuple.expectedSignature,
    expectedSignatures: [...tuple.expectedSignatures],
    blockhash: tuple.blockhash,
    lastValidBlockHeight: tuple.lastValidBlockHeight,
    messageSha256: tuple.messageSha256,
    packetSha256: tuple.packetSha256,
    packetLength: tuple.packetLength,
    finalizedSlot,
  };
};

const recoveryDiagnosticReport = ({ source, claim, generation = 2 }) => {
  const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
  return {
    schema: SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
    operationId: claim.operationId,
    planSha256: claim.planSha256,
    claimEventSha256: claimDigest(claim),
    ready: false,
    mode: "journaled-buffer-absent-programdata-inspection-required",
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    programId: claim.programId,
    programdataAddress: claim.programdataAddress,
    bufferAddress: claim.bufferAddress,
    authorityAddress: claim.authorityAddress,
    payerAddress: claim.payerAddress,
    target: {
      executableLength: claim.targetExecutableLength,
      artifactSha256: claim.targetArtifactSha256,
      executableSha256: claim.targetArtifactSha256,
      codeHash: source.plan.target.codeHash,
    },
    journal: {
      durable: true,
      journalId: lease.journalId,
      authorityLeaseId: lease.leaseId,
      authorityLeaseGeneration: generation,
      authorityLeaseScope: lease.authorityLeaseScope,
      recoveryCompleted: false,
      programdataInspectionRequired: true,
    },
    transaction: null,
    secretsZeroized: true,
  };
};

const inputReportForSource = (source) => {
  const evidence = source.sbfValidationEvidence;
  return {
    plan: {
      path: realpathSync(source.args["upgrade-plan"]),
      sizeBytes: source.planBytes.length,
      sha256: source.expectedPlanSha256,
      independentlyExpectedSha256: source.expectedPlanSha256,
    },
    targetProgram: {
      path: realpathSync(source.args["target-program-so"]),
      sizeBytes: source.target.length,
      artifactSha256: source.plan.target.artifactSha256,
    },
    sbfValidationEvidence: {
      path: realpathSync(source.args["sbf-validation-evidence"]),
      sizeBytes: source.evidenceBytes.length,
      sha256: source.plan.target.sbfValidationEvidenceSha256,
      validatorId: evidence.validatorId,
      validatorVersion: evidence.validatorVersion,
      policySha256: evidence.policySha256,
      validationScope: evidence.validationScope,
      exactClusterAdmission: false,
      exactClusterAdmissionAuthority: "rollback-sentinel-simulation",
      helperBinarySha256: evidence.helperBinarySha256,
      helperTargetTriple: evidence.helperTargetTriple,
      jitOutcome: evidence.jitOutcome,
      buildProfile: evidence.buildProfile,
      validatorSourceBundleSha256: evidence.validatorSourceBundleSha256,
      cargoLockSha256: evidence.cargoLockSha256,
      rustcIdentitySha256: evidence.rustcIdentitySha256,
    },
  };
};

const jsonClone = (value) => JSON.parse(JSON.stringify(value));

const valueAtJsonPath = (value, segments) =>
  segments.reduce((current, segment) => current[segment], value);

const collectJsonContainerPaths = (value, current = [], paths = []) => {
  if (value === null || typeof value !== "object") return paths;
  paths.push([...current]);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectJsonContainerPaths(entry, [...current, index], paths),
    );
  } else {
    for (const [key, entry] of Object.entries(value)) {
      collectJsonContainerPaths(entry, [...current, key], paths);
    }
  }
  return paths;
};

const expectExactRecursiveReportSchema = ({ report, matches }) => {
  expect(matches(report)).toBe(true);
  const paths = collectJsonContainerPaths(report);
  for (const containerPath of paths) {
    const container = valueAtJsonPath(report, containerPath);
    if (Array.isArray(container)) {
      if (container.length > 0) {
        const omitted = jsonClone(report);
        valueAtJsonPath(omitted, containerPath).splice(0, 1);
        expect(matches(omitted), `array omission at ${containerPath}`).toBe(
          false,
        );
        const extra = jsonClone(report);
        valueAtJsonPath(extra, containerPath).push(jsonClone(container[0]));
        expect(matches(extra), `array extra at ${containerPath}`).toBe(false);
      }
      continue;
    }
    const keys = Object.keys(container);
    for (const key of keys) {
      const omitted = jsonClone(report);
      delete valueAtJsonPath(omitted, containerPath)[key];
      expect(
        matches(omitted),
        `object omission at ${[...containerPath, key].join(".")}`,
      ).toBe(false);
    }
    const extra = jsonClone(report);
    valueAtJsonPath(extra, containerPath).__unexpectedRuntimeField = true;
    expect(matches(extra), `object extra at ${containerPath}`).toBe(false);
  }
};

const createActualJournal = (source) =>
  createDurableSolanaUpgradeOperationJournal({
    file: source.journalPaths.journal,
    authorityLeaseFile: source.journalPaths.authorityLease,
    exclusiveAuthorityCustodyConfirmed: true,
    reviewedPlan: source.normalized,
  });

const retainLeaseAfterSuccessfulJournalClose = (journal) => ({
  operationJournal: journal.operationJournal,
  authorizeSigner: journal.authorizeSigner,
  assertLeaseHeld: journal.assertLeaseHeld,
  broadcastLeasePolicy: journal.broadcastLeasePolicy,
  get path() {
    return journal.path;
  },
  get completed() {
    return journal.completed;
  },
  get safeAbortTerminal() {
    return journal.safeAbortTerminal;
  },
  get safeAbortSummary() {
    return journal.safeAbortSummary;
  },
  get terminalSummary() {
    return journal.terminalSummary;
  },
  close: () => journal.close({ releaseLease: false }),
});

const makeRecoverablePartial = async (source) => {
  const claim = claimEvent(source);
  const tuple = transactionTuple(81);
  const journal = createActualJournal(source);
  await journal.operationJournal(claim);
  await journal.operationJournal(
    intentEvent({
      source,
      claim,
      stage: "create-and-initialize-buffer",
      tuple,
    }),
  );
  const finalizedCreate = stageEvent({
    source,
    claim,
    stage: "create-and-initialize-buffer",
    tuple,
    slot: 120,
  });
  await journal.operationJournal(finalizedCreate);
  await journal.operationJournal(
    failureEvent({
      source,
      claim,
      stage: "write-buffer-0",
      last: finalizedCreate,
      bufferPossiblyCreated: true,
    }),
  );
  await journal.close({ releaseLease: false });
  const selected = await readStableSolanaExistingProgramUpgradeJournal({
    file: source.journalPaths.journal,
    expectedPlanSha256: source.expectedPlanSha256,
    expectedClaimEventSha256: claimDigest(claim),
    expectedTargetCodeHash: source.plan.target.codeHash,
    extensionRequired: false,
  });
  return { claim, selected };
};

const makeCompletedRecoveryCrash = async (source) => {
  const { claim, selected } = await makeRecoverablePartial(source);
  const recoveryLock = await createDurableSolanaUpgradeRecoveryLock({
    file: source.journalPaths.recoveryLock,
    selectedJournal: selected,
    inputs: source.inputs,
  });
  const authorityLease =
    await openDurableSolanaUpgradeAuthorityLeaseForRecovery({
      file: source.journalPaths.authorityLease,
      selectedJournal: selected,
      inputs: source.inputs,
    });
  await recoveryLock.promote({
    leaseId: authorityLease.record.leaseId,
    leaseGeneration: authorityLease.leaseGeneration,
    authorityLeaseScope: authorityLease.authorityLeaseScope,
  });
  const recoveryJournal = await createDurableSolanaUpgradeRecoveryJournal({
    selectedJournal: authorityLease.selectedJournal,
    authorityLease,
    recoveryLock,
    minimumFinalizedSlot: 100,
  });
  const claimEventSha256 = claimDigest(claim);
  await recoveryJournal.operationJournal({
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
    type: "recovery-start",
    operationId: claim.operationId,
    planSha256: claim.planSha256,
    programId: claim.programId,
    programdataAddress: claim.programdataAddress,
    authorityAddress: claim.authorityAddress,
    payerAddress: claim.payerAddress,
    bufferAddress: claim.bufferAddress,
    targetArtifactSha256: claim.targetArtifactSha256,
    targetExecutableLength: claim.targetExecutableLength,
    claimEventSha256,
    stage: "authorize-orphan-buffer-recovery",
    status: "authorized-before-signer-acquisition",
    finalizedContextSlot: 150,
    authorityLeaseRequired: true,
    authorityLeaseScope: authorityLease.authorityLeaseScope,
    recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
  });
  const tuple = transactionTuple(84);
  const recoveryIdentity = {
    ...eventIdentity(
      source,
      claim,
      "recovery-intent",
      authorityLease.leaseGeneration,
    ),
    claimEventSha256,
  };
  await recoveryJournal.operationJournal({
    ...recoveryIdentity,
    stage: "recover-close-orphan-buffer",
    status: "prepared-before-broadcast",
    ...journalTuple(tuple),
  });
  await recoveryJournal.operationJournal({
    ...recoveryIdentity,
    type: "recovery-complete",
    stage: "close-orphan-buffer",
    status: "finalized-closed",
    signature: tuple.expectedSignature,
    ...journalTuple(tuple),
    finalizedSlot: 160,
  });
  await recoveryJournal.close();
  await authorityLease.close({ releaseLease: false });
  await recoveryLock.close();
  return {
    claim,
    tuple,
    journalSha256BeforeRecovery: selected.sha256,
  };
};

const testCleanupPaths = (root) => ({
  root,
  operationDirectory: path.join(
    root,
    "solana-testnet",
    "genesis",
    "program",
    "operation",
  ),
  authorityLease: path.join(
    root,
    "authority-leases",
    "genesis",
    "authority.lock.json",
  ),
});

const materializeTestCleanupPaths = (paths) => {
  mkdirSync(paths.operationDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(paths.authorityLease), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(paths.authorityLease, "{}\n", { mode: 0o600 });
};

const removeExactTestCleanupArtifacts = (paths) => {
  rmSync(paths.operationDirectory, { recursive: true, force: true });
  rmSync(paths.authorityLease, { force: true });
};

const canonicalTestCleanupContainer = () => realpathSync(temporaryRoot());

describe("Loader-v3 test-only namespace cleanup", () => {
  it("prunes only newly created empty fixture ancestors", () => {
    const container = canonicalTestCleanupContainer();
    const paths = testCleanupPaths(path.join(container, "runtime-upgrades"));
    const capture = captureAbsentLoaderV3FixtureAncestors(paths);
    materializeTestCleanupPaths(paths);
    removeExactTestCleanupArtifacts(paths);

    const result = pruneCapturedLoaderV3FixtureAncestors([capture]);

    expect(result.removed).toContain(paths.root);
    expect(existsSync(paths.root)).toBe(false);
  });

  it("preserves a preexisting ancestor and its sentinel", () => {
    const container = canonicalTestCleanupContainer();
    const paths = testCleanupPaths(path.join(container, "runtime-upgrades"));
    const preexisting = path.join(paths.root, "solana-testnet");
    const sentinel = path.join(preexisting, "preexisting.json");
    mkdirSync(preexisting, { recursive: true, mode: 0o700 });
    writeFileSync(sentinel, "preserve\n", { mode: 0o600 });
    const capture = captureAbsentLoaderV3FixtureAncestors(paths);
    materializeTestCleanupPaths(paths);
    removeExactTestCleanupArtifacts(paths);

    pruneCapturedLoaderV3FixtureAncestors([capture]);

    expect(readFileSync(sentinel, "utf8")).toBe("preserve\n");
    expect(existsSync(path.dirname(paths.operationDirectory))).toBe(false);
  });

  it("preserves a nonempty sibling operation", () => {
    const container = canonicalTestCleanupContainer();
    const paths = testCleanupPaths(path.join(container, "runtime-upgrades"));
    const capture = captureAbsentLoaderV3FixtureAncestors(paths);
    materializeTestCleanupPaths(paths);
    const sibling = path.join(
      path.dirname(paths.operationDirectory),
      "sibling-operation",
    );
    const sentinel = path.join(sibling, "operation.journal.jsonl");
    mkdirSync(sibling, { mode: 0o700 });
    writeFileSync(sentinel, "sibling\n", { mode: 0o600 });
    removeExactTestCleanupArtifacts(paths);

    const result = pruneCapturedLoaderV3FixtureAncestors([capture]);

    expect(result.preserved).toContain(path.dirname(paths.operationDirectory));
    expect(readFileSync(sentinel, "utf8")).toBe("sibling\n");
  });

  it("does not follow a captured ancestor replaced by a symlink", () => {
    const container = canonicalTestCleanupContainer();
    const paths = testCleanupPaths(path.join(container, "runtime-upgrades"));
    const capture = captureAbsentLoaderV3FixtureAncestors(paths);
    const candidate = path.dirname(paths.operationDirectory);
    const external = path.join(container, "external-sentinel");
    const sentinel = path.join(external, "keep.json");
    mkdirSync(external, { mode: 0o700 });
    writeFileSync(sentinel, "outside\n", { mode: 0o600 });
    mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });
    symlinkSync(external, candidate, "dir");

    const result = pruneCapturedLoaderV3FixtureAncestors([capture]);

    expect(result.preserved).toContain(candidate);
    expect(lstatSync(candidate).isSymbolicLink()).toBe(true);
    expect(readFileSync(sentinel, "utf8")).toBe("outside\n");
  });

  it("preserves a captured ancestor whose mode is no longer trusted", () => {
    const container = canonicalTestCleanupContainer();
    const paths = testCleanupPaths(path.join(container, "runtime-upgrades"));
    const capture = captureAbsentLoaderV3FixtureAncestors(paths);
    const candidate = path.dirname(paths.operationDirectory);
    mkdirSync(candidate, { recursive: true, mode: 0o700 });
    chmodSync(candidate, 0o770);

    const result = pruneCapturedLoaderV3FixtureAncestors([capture]);

    expect(result.preserved).toContain(candidate);
    expect(lstatSync(candidate).mode & 0o777).toBe(0o770);
  });
});

describe("existing Loader-v3 CLI durability and fencing", () => {
  it("keeps readiness read-only and validates pinned evidence", async () => {
    const source = fixture();
    const env = new Proxy(
      {},
      { get: () => expect.unreachable("readiness touched signer env") },
    );
    const generateEvidence = vi.fn(() => ({
      evidence: source.sbfValidationEvidence,
      evidenceBytes: source.evidenceBytes,
      evidenceSha256: source.plan.target.sbfValidationEvidenceSha256,
    }));
    const inspectRuntimeUpgrade = vi.fn(async ({ dependencies }) => {
      await dependencies.validateSbfExecutable({
        executableBytes: source.target,
        validatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
        validatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
        policySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
        artifactSha256: source.plan.target.artifactSha256,
        codeHash: source.plan.target.codeHash,
        executableLength: source.target.length,
        requiredChecks: [...SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS],
      });
      return {
        ready: true,
        mutationPerformed: false,
        signerAcquired: false,
        operationClaimed: false,
      };
    });
    const result = await upgradeExistingProgramReadiness(source.args, {
      env,
      inspectRuntimeUpgrade,
      generateSolanaLoaderV3SbfValidationEvidence: generateEvidence,
    });
    expect(result.report).toMatchObject({
      ready: true,
      mutationPerformed: false,
      signerAcquired: false,
      operationClaimed: false,
      signerEnvironmentRead: false,
    });
    expect(
      existsSync(artifactPaths(source.args).existingProgramUpgradeReadiness),
    ).toBe(true);
    expect(existsSync(source.journalPaths.journal)).toBe(false);
  });

  it("rejects tampered and symlinked public inputs before mutation", async () => {
    const source = fixture();
    writeFileSync(
      source.args["upgrade-plan"],
      Buffer.concat([source.planBytes, Buffer.from(" ")]),
    );
    await expect(
      upgradeExistingProgramReadiness(source.args, {
        inspectRuntimeUpgrade: vi.fn(),
      }),
    ).rejects.toThrow(/independently supplied SHA-256/u);
    const target = path.join(source.root, "public-target.so");
    const link = path.join(source.root, "target-link.so");
    writeFileSync(target, source.target);
    symlinkSync(target, link);
    await expect(
      readStablePublicSolanaUpgradeArtifact({
        file: link,
        label: "target",
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/non-symlink/u);
  });

  it("durably promotes generation 1 only after the exact canonical claim", async () => {
    const source = fixture();
    const journal = createActualJournal(source);
    const claim = claimEvent(source);
    const response = await journal.operationJournal(claim);
    const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
    expect(response).toMatchObject({
      durable: true,
      claimed: true,
      leaseGeneration: 1,
      authorityLeaseScope: lease.authorityLeaseScope,
    });
    expect(response.signerCapability).toBeTypeOf("object");
    expect(readFileSync(source.journalPaths.journal)).toEqual(
      journalBytes(claim),
    );
    expect(
      JSON.parse(readFileSync(source.journalPaths.authorityLease, "utf8")),
    ).toMatchObject({
      status: "exclusive-local-custody-claimed-before-mutation",
      leaseGeneration: 1,
      leaseLifetimePolicy: "finalized-slot-bounded",
      leaseExpiresAtFinalizedSlot: 1000,
    });
    await journal.close();
  });

  it("blocks a live authority owner and a live recovery candidate", async () => {
    const source = fixture();
    const claim = claimEvent(source);
    const first = createActualJournal(source);
    await first.operationJournal(claim);
    const duplicate = createActualJournal(source);
    await expect(duplicate.operationJournal(claim)).rejects.toThrow();
    await duplicate.close();
    await first.close();

    rmSync(source.journalPaths.authorityLease, { force: true });
    rmSync(source.journalPaths.operationDirectory, {
      recursive: true,
      force: true,
    });
    const recoverySource = source;
    const { selected: selectedJournal } =
      await makeRecoverablePartial(recoverySource);
    const lock = await createDurableSolanaUpgradeRecoveryLock({
      file: recoverySource.journalPaths.recoveryLock,
      selectedJournal,
      inputs: recoverySource.inputs,
    });
    await expect(
      createDurableSolanaUpgradeRecoveryLock({
        file: recoverySource.journalPaths.recoveryLock,
        selectedJournal,
        inputs: recoverySource.inputs,
      }),
    ).rejects.toThrow(/live owner/u);
    await lock.close({ removeProvisional: true });
  });

  it("reclaims a dead provisional lease across old operation, buffer, and context identities", async () => {
    const source = fixture();
    const oldOperationId = solanaSha256(
      Buffer.from(`old-operation:${source.root}`, "utf8"),
    );
    const oldClaim = claimEvent(source, {
      operationId: oldOperationId,
      bufferAddress: seededKeypair(91).publicKey.toBase58(),
      finalizedContextSlot: 110,
    });
    const oldNormalized = {
      ...source.normalized,
      operationId: oldOperationId,
    };
    const lease = solanaExistingProgramUpgradeLeaseIdentity(oldNormalized);
    const oldPaths = solanaExistingProgramUpgradeJournalPaths(oldNormalized);
    cleanupPaths.add(oldPaths.operationDirectory);
    const provisional = {
      schema: "iroha-demo-solana-loader-v3-runtime-authority-lease/v2",
      status: "provisional-before-durable-claim",
      authorityCustodyScope: "same-host-exclusive",
      crossHostAuthorityUseExcluded: true,
      network: "solana-testnet",
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      journalId: lease.journalId,
      leaseId: lease.leaseId,
      leaseGeneration: 1,
      authorityLeaseScope: lease.authorityLeaseScope,
      leaseNonce: `0x${"11".repeat(32)}`,
      previousLeaseNonceSha256: null,
      claimEventSha256: claimDigest(oldClaim),
      claimFinalizedContextSlot: 110,
      leaseLifetimePolicy: "finalized-slot-bounded",
      leaseExpiresAtFinalizedSlot: 1000,
      operationId: oldClaim.operationId,
      planSha256: oldClaim.planSha256,
      programId: oldClaim.programId,
      programdataAddress: oldClaim.programdataAddress,
      authorityAddress: oldClaim.authorityAddress,
      payerAddress: oldClaim.payerAddress,
      bufferAddress: oldClaim.bufferAddress,
      targetArtifactSha256: oldClaim.targetArtifactSha256,
      targetExecutableLength: oldClaim.targetExecutableLength,
    };
    mkdirSync(path.dirname(source.journalPaths.authorityLease), {
      recursive: true,
      mode: 0o700,
    });
    mkdirSync(path.dirname(oldPaths.journal), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(
      source.journalPaths.authorityLease,
      `${JSON.stringify(provisional)}\n`,
      { mode: 0o600 },
    );
    const oldClaimBytes = journalBytes(oldClaim);
    writeFileSync(
      oldPaths.journal,
      oldClaimBytes.subarray(0, Math.floor(oldClaimBytes.length / 2)),
      { mode: 0o600 },
    );
    const journal = createActualJournal(source);
    const freshClaim = claimEvent(source);
    await expect(journal.operationJournal(freshClaim)).resolves.toMatchObject({
      claimed: true,
      leaseGeneration: 1,
    });
    expect(readFileSync(source.journalPaths.journal)).toEqual(
      journalBytes(freshClaim),
    );
    await journal.close();
  });

  it("rejects noncanonical JSONL, unresolved intents, and terminal retries", () => {
    const source = fixture();
    const claim = claimEvent(source);
    const expected = {
      expectedPlanSha256: source.expectedPlanSha256,
      expectedClaimEventSha256: claimDigest(claim),
      expectedTargetCodeHash: source.plan.target.codeHash,
      extensionRequired: false,
    };
    const tuple = transactionTuple(94);
    const intent = intentEvent({
      source,
      claim,
      stage: "create-and-initialize-buffer",
      tuple,
    });
    expect(() =>
      parseSolanaExistingProgramUpgradeRecoveryJournal({
        bytes: journalBytes(claim, intent),
        ...expected,
      }),
    ).toThrow(/unresolved prepared intent/u);
    const aborted = {
      ...eventIdentity(source, claim, "resolution"),
      stage: intent.stage,
      status: "aborted-before-broadcast",
      ...journalTuple(tuple),
      bufferPossiblyCreated: false,
      bufferConsumed: false,
    };
    expect(() =>
      parseSolanaExistingProgramUpgradeRecoveryJournal({
        bytes: journalBytes(claim, intent, aborted, intent),
        ...expected,
      }),
    ).toThrow(/terminal mutation resolution/u);
    const createStage = stageEvent({
      source,
      claim,
      stage: "create-and-initialize-buffer",
      tuple,
      slot: 120,
    });
    const writeTuple = transactionTuple(97);
    const writeIntent = intentEvent({
      source,
      claim,
      stage: "write-buffer-0",
      tuple: writeTuple,
    });
    const backwardWrite = stageEvent({
      source,
      claim,
      stage: "write-buffer-0",
      tuple: writeTuple,
      slot: 119,
    });
    expect(() =>
      parseSolanaExistingProgramUpgradeRecoveryJournal({
        bytes: journalBytes(
          claim,
          intent,
          createStage,
          writeIntent,
          backwardWrite,
        ),
        ...expected,
      }),
    ).toThrow(/moved backward from the finalized-slot floor/u);
    const failure = failureEvent({
      source,
      claim,
      stage: "create-and-initialize-buffer",
    });
    const failureLine = JSON.stringify(failure).replace(
      '"status":"failed-closed"',
      '"status":"foreign","status":"failed-closed"',
    );
    expect(() =>
      parseSolanaExistingProgramUpgradeRecoveryJournal({
        bytes: Buffer.from(`${JSON.stringify(claim)}\n${failureLine}\n`),
        ...expected,
      }),
    ).toThrow(/non-canonical or duplicate-key/u);
  });

  it("snapshots and freezes an event before asynchronous durable acknowledgement", async () => {
    const source = fixture();
    const journal = createActualJournal(source);
    const claim = claimEvent(source);
    await journal.operationJournal(claim);
    const failure = failureEvent({
      source,
      claim,
      stage: "preflight",
    });
    const pending = journal.operationJournal(failure);
    failure.status = "caller-mutated-after-call";
    await pending;
    expect(readFileSync(source.journalPaths.journal, "utf8")).toContain(
      '"status":"failed-closed"',
    );
    expect(journal.safeAbortTerminal).toBe(true);
    await journal.close({ releaseLease: true });
  });

  it("captures one plain canonical runtime-report snapshot and rejects aliases, accessors, proxies, and array properties", () => {
    const original = { nested: { value: 1 }, values: [1, 2] };
    const snapshot = snapshotCanonicalSolanaRuntimeReport(original);
    original.nested.value = 9;
    original.values.push(3);
    expect(snapshot).toEqual({ nested: { value: 1 }, values: [1, 2] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.values)).toBe(true);

    const accessor = {};
    Object.defineProperty(accessor, "ready", {
      enumerable: true,
      get: () => true,
    });
    expect(() => snapshotCanonicalSolanaRuntimeReport(accessor)).toThrow(
      /shape is not exact/u,
    );
    expect(() =>
      snapshotCanonicalSolanaRuntimeReport(new Proxy({ ready: true }, {})),
    ).toThrow(/plain public JSON/u);
    const arrayWithExtra = [1];
    arrayWithExtra.extra = true;
    expect(() => snapshotCanonicalSolanaRuntimeReport(arrayWithExtra)).toThrow(
      /array shape is not exact/u,
    );
  });

  it("rejects every recursive raw upgrade-report omission or extra and critical value mutations", async () => {
    const source = fixture();
    const journal = createActualJournal(source);
    const sequence = await driveCompletedJournal(
      journal.operationJournal,
      source,
    );
    const report = exactUpgradeReport(source, sequence);
    const matches = (candidate) =>
      exactSolanaRuntimeUpgradeReportMatchesJournal({
        report: candidate,
        inputs: source.inputs,
        journal,
      });
    expectExactRecursiveReportSchema({ report, matches });

    const mutations = [
      ["ready", false],
      ["productionReady", true],
      ["network", "solana-mainnet"],
      ["genesisHash", seededKeypair(121).publicKey.toBase58()],
      ["clusterRuntime", "featureSet", 1],
      ["target", "artifactSha256", solanaSha256(Buffer.from("other"))],
      ["journal", "durable", false],
      ["journal", "authorityLeaseGeneration", 2],
      ["journal", "authorityLeaseExpiresAtFinalizedSlot", 1001],
      ["ephemeralBuffer", "executableSha256", solanaSha256(Buffer.alloc(1))],
      ["after", "authorityAddress", source.plan.payerAddress],
      ["after", "programdataSlot", "141"],
      ["after", "executableSha256", source.plan.target.artifactSha256],
      [
        "rollbackSentinelAdmission",
        "deploy",
        "packetSha256",
        solanaSha256(Buffer.from("admission")),
      ],
      [
        "ephemeralBuffer",
        "initialize",
        "instructions",
        0,
        "metas",
        0,
        "isSigner",
        false,
      ],
      ["upgrade", "instructions", 0, "dataHex", "0x03"],
    ];
    for (const mutation of mutations) {
      const candidate = jsonClone(report);
      const value = mutation.at(-1);
      const targetPath = mutation.slice(0, -2);
      const key = mutation.at(-2);
      valueAtJsonPath(candidate, targetPath)[key] = value;
      expect(matches(candidate), `mutation at ${mutation.slice(0, -1)}`).toBe(
        false,
      );
    }
    await journal.close({ releaseLease: false });
  });

  it("rejects every recursive raw recovery-report omission or extra, contradictory diagnostics, and tuple mutations", () => {
    const source = fixture();
    const claim = claimEvent(source);
    const tuple = transactionTuple(122);
    const report = exactRecoveryReport({ source, claim, tuple });
    const terminalSummary = recoveryTerminalSummary({ source, claim, tuple });
    const matches = (candidate) =>
      exactSolanaRuntimeRecoveryReportMatchesJournal({
        report: candidate,
        inputs: source.inputs,
        journal: { terminalSummary },
      });
    expectExactRecursiveReportSchema({ report, matches });
    for (const [segments, value] of [
      [["network"], "solana-mainnet"],
      [["genesisHash"], seededKeypair(123).publicKey.toBase58()],
      [["journal", "durable"], false],
      [["journal", "authorityLeaseGeneration"], 3],
      [["journal", "recoveryCompleted"], false],
      [["transaction", "packetLength"], report.transaction.packetLength + 1],
      [["transaction", "instructions", 0, "dataHex"], "0x05"],
    ]) {
      const candidate = jsonClone(report);
      valueAtJsonPath(candidate, segments.slice(0, -1))[segments.at(-1)] =
        value;
      expect(matches(candidate), `recovery mutation at ${segments}`).toBe(
        false,
      );
    }

    const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
    const diagnosticSummary = {
      ...recoveryTerminalSummary({ source, claim, tuple }),
      leaseId: lease.leaseId,
      finalizedSlot: 150,
    };
    const diagnostic = recoveryDiagnosticReport({ source, claim });
    expect(
      exactSolanaRuntimeRecoveryDiagnosticMatchesJournal({
        report: diagnostic,
        inputs: source.inputs,
        journal: { diagnosticSummary },
      }),
    ).toBe(true);
    const arbitrary = {
      ...diagnostic,
      mode: "operator-should-trust-this-ready-false-report",
    };
    expect(
      exactSolanaRuntimeRecoveryDiagnosticMatchesJournal({
        report: arbitrary,
        inputs: source.inputs,
        journal: { diagnosticSummary },
      }),
    ).toBe(false);
  });

  it("releases dead-owner ordinary completion and cleanup-safe-abort terminals without a signer", async () => {
    const completedSource = fixture();
    const completed = createActualJournal(completedSource);
    await driveCompletedJournal(completed.operationJournal, completedSource);
    await completed.close({ releaseLease: false });
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: completedSource.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({
      reconciled: true,
      terminalKind: "ordinary-complete",
    });
    expect(existsSync(completedSource.journalPaths.authorityLease)).toBe(false);

    const abortedSource = fixture();
    const aborted = createActualJournal(abortedSource);
    const claim = claimEvent(abortedSource);
    await aborted.operationJournal(claim);
    await aborted.operationJournal(
      failureEvent({ source: abortedSource, claim, stage: "preflight" }),
    );
    await aborted.close({ releaseLease: false });
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: abortedSource.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({ terminalKind: "ordinary-safe-abort" });
    expect(existsSync(abortedSource.journalPaths.authorityLease)).toBe(false);
  });

  it("releases exact dead-owner recovery completion with or without a leftover candidate", async () => {
    const withCandidate = fixture();
    await makeCompletedRecoveryCrash(withCandidate);
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: withCandidate.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({ terminalKind: "recovery-complete" });
    expect(existsSync(withCandidate.journalPaths.authorityLease)).toBe(false);
    expect(existsSync(withCandidate.journalPaths.recoveryLock)).toBe(false);

    const withoutCandidate = fixture();
    await makeCompletedRecoveryCrash(withoutCandidate);
    rmSync(withoutCandidate.journalPaths.recoveryLock);
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: withoutCandidate.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({ terminalKind: "recovery-complete" });
    expect(existsSync(withoutCandidate.journalPaths.authorityLease)).toBe(
      false,
    );
  });

  it("semantically revalidates an exact configured recovery report before dead-owner release", async () => {
    const source = fixture();
    const { claim, tuple, journalSha256BeforeRecovery } =
      await makeCompletedRecoveryCrash(source);
    const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
    const rawRecoveryReport = exactRecoveryReport({ source, claim, tuple });
    expect(
      exactSolanaRuntimeRecoveryReportMatchesJournal({
        report: rawRecoveryReport,
        inputs: source.inputs,
        journal: {
          terminalSummary: recoveryTerminalSummary({ source, claim, tuple }),
        },
      }),
    ).toBe(true);
    const finalJournalLines = readFileSync(source.journalPaths.journal, "utf8")
      .trimEnd()
      .split("\n");
    const recoveryStartIndex = finalJournalLines.findIndex((line) => {
      const event = JSON.parse(line);
      return (
        event.type === "recovery-start" && event.authorityLeaseGeneration === 2
      );
    });
    expect(recoveryStartIndex).toBeGreaterThan(0);
    expect(
      solanaSha256(
        Buffer.from(
          `${finalJournalLines.slice(0, recoveryStartIndex).join("\n")}\n`,
        ),
      ),
    ).toBe(journalSha256BeforeRecovery);
    const configuredPath = artifactPaths(
      source.args,
    ).existingProgramUpgradeBufferRecovery;
    const publicReport = {
      ...rawRecoveryReport,
      operationJournalPath: realpathSync(source.journalPaths.journal),
      journalSha256BeforeRecovery,
      claimEventSha256: claimDigest(claim),
      recoveryLockPath: realpathSync(source.journalPaths.recoveryLock),
      completionReceiptPath: source.journalPaths.completionReceipt,
      inputs: inputReportForSource(source),
    };
    mkdirSync(path.dirname(configuredPath), { recursive: true, mode: 0o700 });
    const configuredBytes = Buffer.from(
      `${JSON.stringify(publicReport, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(configuredPath, configuredBytes);
    const journalPath = realpathSync(source.journalPaths.journal);
    const journalSha256 = solanaSha256(readFileSync(journalPath));
    const receipt = {
      schema: "iroha-demo-solana-loader-v3-runtime-completion-receipt/v1",
      kind: "recovery-complete",
      operationId: claim.operationId,
      planSha256: claim.planSha256,
      programId: claim.programId,
      programdataAddress: claim.programdataAddress,
      authorityAddress: claim.authorityAddress,
      payerAddress: claim.payerAddress,
      bufferAddress: claim.bufferAddress,
      target: {
        artifactSha256: claim.targetArtifactSha256,
        executableLength: claim.targetExecutableLength,
      },
      authorityLease: {
        leaseId: lease.leaseId,
        generation: 2,
        scope: lease.authorityLeaseScope,
      },
      terminal: {
        classification: "finalized-transaction",
        signature: tuple.expectedSignature,
        expectedSignatures: [...tuple.expectedSignatures],
        blockhash: tuple.blockhash,
        lastValidBlockHeight: tuple.lastValidBlockHeight,
        messageSha256: tuple.messageSha256,
        packetSha256: tuple.packetSha256,
        packetLength: tuple.packetLength,
        finalizedSlot: 160,
      },
      journal: { path: journalPath, sha256: journalSha256 },
      configuredReport: {
        path: realpathSync(configuredPath),
        sha256: solanaSha256(configuredBytes),
      },
    };
    writeFileSync(
      source.journalPaths.completionReceipt,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: source.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({
      terminalKind: "recovery-complete",
      receiptSynthesized: false,
    });
    expect(existsSync(source.journalPaths.authorityLease)).toBe(false);
    expect(existsSync(source.journalPaths.recoveryLock)).toBe(false);
  });

  it("durably records a recovery pre-broadcast guard abort and forbids retry", async () => {
    const source = fixture();
    const { claim, selected } = await makeRecoverablePartial(source);
    const recoveryLock = await createDurableSolanaUpgradeRecoveryLock({
      file: source.journalPaths.recoveryLock,
      selectedJournal: selected,
      inputs: source.inputs,
    });
    const authorityLease =
      await openDurableSolanaUpgradeAuthorityLeaseForRecovery({
        file: source.journalPaths.authorityLease,
        selectedJournal: selected,
        inputs: source.inputs,
      });
    await recoveryLock.promote({
      leaseId: authorityLease.record.leaseId,
      leaseGeneration: authorityLease.leaseGeneration,
      authorityLeaseScope: authorityLease.authorityLeaseScope,
    });
    const recoveryJournal = await createDurableSolanaUpgradeRecoveryJournal({
      selectedJournal: authorityLease.selectedJournal,
      authorityLease,
      recoveryLock,
      minimumFinalizedSlot: 100,
    });
    const digest = claimDigest(claim);
    const tuple = transactionTuple(87);
    const recoveryIdentity = {
      ...eventIdentity(
        source,
        claim,
        "recovery-intent",
        authorityLease.leaseGeneration,
      ),
      claimEventSha256: digest,
    };
    try {
      await recoveryJournal.operationJournal({
        schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
        type: "recovery-start",
        operationId: claim.operationId,
        planSha256: claim.planSha256,
        programId: claim.programId,
        programdataAddress: claim.programdataAddress,
        authorityAddress: claim.authorityAddress,
        payerAddress: claim.payerAddress,
        bufferAddress: claim.bufferAddress,
        targetArtifactSha256: claim.targetArtifactSha256,
        targetExecutableLength: claim.targetExecutableLength,
        claimEventSha256: digest,
        stage: "authorize-orphan-buffer-recovery",
        status: "authorized-before-signer-acquisition",
        finalizedContextSlot: 150,
        authorityLeaseRequired: true,
        authorityLeaseScope: authorityLease.authorityLeaseScope,
        recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
      });
      const intent = {
        ...recoveryIdentity,
        stage: "recover-close-orphan-buffer",
        status: "prepared-before-broadcast",
        ...journalTuple(tuple),
      };
      await recoveryJournal.operationJournal(intent);
      await expect(
        recoveryJournal.operationJournal({
          ...recoveryIdentity,
          type: "recovery-complete",
          stage: "close-orphan-buffer",
          status: "finalized-closed",
          signature: tuple.expectedSignature,
          ...journalTuple(tuple),
          finalizedSlot: 149,
        }),
      ).rejects.toThrow(/moved backward from the finalized-slot floor/u);
      await recoveryJournal.operationJournal({
        ...recoveryIdentity,
        type: "recovery-resolution",
        stage: "recover-close-orphan-buffer",
        status: "aborted-before-broadcast",
        ...journalTuple(tuple),
        recoveryAction: "inspect-finalized-programdata-before-any-retry",
      });
      await recoveryJournal.operationJournal({
        ...recoveryIdentity,
        type: "recovery-failure",
        stage: "recover-orphan-buffer",
        status: "failed-closed",
        signature: null,
        finalizedSlot: null,
        recoveryAction: "manual-journal-and-buffer-inspection-required",
      });
      await expect(recoveryJournal.operationJournal(intent)).rejects.toThrow(
        /terminal recovery state/u,
      );
      await expect(
        readStableSolanaExistingProgramUpgradeJournal({
          file: source.journalPaths.journal,
          expectedPlanSha256: source.expectedPlanSha256,
          expectedClaimEventSha256: digest,
          expectedTargetCodeHash: source.plan.target.codeHash,
          extensionRequired: false,
        }),
      ).rejects.toThrow(/requires manual inspection/u);
    } finally {
      await recoveryJournal.close();
      await authorityLease.close({ releaseLease: false });
      await recoveryLock.close();
    }
  });

  it("resumes an exact dead-owner recovery-start-only WAL at a higher generation", async () => {
    const source = fixture();
    const { claim, selected } = await makeRecoverablePartial(source);
    const firstLock = await createDurableSolanaUpgradeRecoveryLock({
      file: source.journalPaths.recoveryLock,
      selectedJournal: selected,
      inputs: source.inputs,
    });
    const generation2 = await openDurableSolanaUpgradeAuthorityLeaseForRecovery(
      {
        file: source.journalPaths.authorityLease,
        selectedJournal: selected,
        inputs: source.inputs,
      },
    );
    await firstLock.promote({
      leaseId: generation2.record.leaseId,
      leaseGeneration: generation2.leaseGeneration,
      authorityLeaseScope: generation2.authorityLeaseScope,
    });
    const firstJournal = await createDurableSolanaUpgradeRecoveryJournal({
      selectedJournal: generation2.selectedJournal,
      authorityLease: generation2,
      recoveryLock: firstLock,
      minimumFinalizedSlot: 100,
    });
    await firstJournal.operationJournal(
      recoveryStartEvent({
        claim,
        claimEventSha256: claimDigest(claim),
        scope: generation2.authorityLeaseScope,
        slot: 150,
      }),
    );
    await firstJournal.close();
    await generation2.close({ releaseLease: false });
    await firstLock.close();

    const selectedAfterStart =
      await readStableSolanaExistingProgramUpgradeJournal({
        file: source.journalPaths.journal,
        expectedPlanSha256: source.expectedPlanSha256,
        expectedClaimEventSha256: claimDigest(claim),
        expectedTargetCodeHash: source.plan.target.codeHash,
        extensionRequired: false,
      });
    expect(selectedAfterStart.recoveryState.recoveryStartOnly).toMatchObject({
      leaseGeneration: 2,
      finalizedContextSlot: 150,
    });
    const resumedLock = await createDurableSolanaUpgradeRecoveryLock({
      file: source.journalPaths.recoveryLock,
      selectedJournal: selectedAfterStart,
      inputs: source.inputs,
    });
    const generation3 = await openDurableSolanaUpgradeAuthorityLeaseForRecovery(
      {
        file: source.journalPaths.authorityLease,
        selectedJournal: selectedAfterStart,
        inputs: source.inputs,
      },
    );
    expect(generation3.leaseGeneration).toBe(3);
    await resumedLock.promote({
      leaseId: generation3.record.leaseId,
      leaseGeneration: generation3.leaseGeneration,
      authorityLeaseScope: generation3.authorityLeaseScope,
    });
    const resumedJournal = await createDurableSolanaUpgradeRecoveryJournal({
      selectedJournal: generation3.selectedJournal,
      authorityLease: generation3,
      recoveryLock: resumedLock,
      minimumFinalizedSlot: 150,
    });
    await expect(
      resumedJournal.operationJournal(
        recoveryStartEvent({
          claim,
          claimEventSha256: claimDigest(claim),
          scope: generation3.authorityLeaseScope,
          slot: 149,
        }),
      ),
    ).rejects.toThrow(/duplicated or invalid|moved backward/u);
    const resumed = await resumedJournal.operationJournal(
      recoveryStartEvent({
        claim,
        claimEventSha256: claimDigest(claim),
        scope: generation3.authorityLeaseScope,
        slot: 151,
      }),
    );
    expect(resumed).toMatchObject({
      authorized: true,
      leaseGeneration: 3,
    });
    await resumedJournal.close();
    await generation3.close({ releaseLease: false });
    await resumedLock.close();
  });

  it("resumes a dead promoted generation-2 candidate as generation 3 before recovery-start", async () => {
    const source = fixture();
    const { selected } = await makeRecoverablePartial(source);
    const staleCandidate = await createDurableSolanaUpgradeRecoveryLock({
      file: source.journalPaths.recoveryLock,
      selectedJournal: selected,
      inputs: source.inputs,
    });
    const generation2 = await openDurableSolanaUpgradeAuthorityLeaseForRecovery(
      {
        file: source.journalPaths.authorityLease,
        selectedJournal: selected,
        inputs: source.inputs,
      },
    );
    await staleCandidate.promote({
      leaseId: generation2.record.leaseId,
      leaseGeneration: generation2.leaseGeneration,
      authorityLeaseScope: generation2.authorityLeaseScope,
    });
    await generation2.close({ releaseLease: false });
    await staleCandidate.close();

    const resumedCandidate = await createDurableSolanaUpgradeRecoveryLock({
      file: source.journalPaths.recoveryLock,
      selectedJournal: selected,
      inputs: source.inputs,
    });
    const generation3 = await openDurableSolanaUpgradeAuthorityLeaseForRecovery(
      {
        file: source.journalPaths.authorityLease,
        selectedJournal: selected,
        inputs: source.inputs,
      },
    );
    expect(generation3.leaseGeneration).toBe(3);
    await expect(
      resumedCandidate.promote({
        leaseId: generation3.record.leaseId,
        leaseGeneration: generation3.leaseGeneration,
        authorityLeaseScope: generation3.authorityLeaseScope,
      }),
    ).resolves.toMatchObject({ authorityLeaseGeneration: 3 });
    await generation3.close({ releaseLease: false });
    await resumedCandidate.close();
  });

  it("rejects group-writable trusted namespace directories", async () => {
    const source = fixture();
    const { selected } = await makeRecoverablePartial(source);
    chmodSync(source.journalPaths.operationDirectory, 0o770);
    try {
      await expect(
        createDurableSolanaUpgradeRecoveryLock({
          file: source.journalPaths.recoveryLock,
          selectedJournal: selected,
          inputs: source.inputs,
        }),
      ).rejects.toThrow(/not private, owner-controlled/u);
    } finally {
      chmodSync(source.journalPaths.operationDirectory, 0o700);
    }
  });

  it("binds signer role, address, and opaque capability before reading env", async () => {
    for (const mode of ["wrong-address", "forged-capability"]) {
      const source = fixture();
      let envReads = 0;
      const env = new Proxy(
        {},
        {
          get() {
            envReads += 1;
            throw new Error("signer env was read");
          },
        },
      );
      const lease = solanaExistingProgramUpgradeLeaseIdentity(
        source.normalized,
      );
      const capability = Object.freeze(Object.create(null));
      const authorizeSigner = vi.fn(async () => {
        throw new Error("opaque capability rejected");
      });
      const journal = {
        path: source.journalPaths.journal,
        completed: false,
        safeAbortTerminal: false,
        operationJournal: vi.fn(),
        authorizeSigner,
        close: vi.fn(async () => {}),
      };
      await expect(
        upgradeExistingProgram(
          {
            ...source.args,
            submit: "true",
            "confirm-upgrade-existing-program": "true",
            "confirm-exclusive-upgrade-authority-custody": "true",
          },
          {
            env,
            createOperationJournal: () => journal,
            executeRuntimeUpgrade: async ({ signerFactory }) =>
              signerFactory({
                role: "authority",
                address:
                  mode === "wrong-address"
                    ? source.plan.payerAddress
                    : source.plan.authorityAddress,
                authorityLease: {
                  journalId: lease.journalId,
                  leaseId: lease.leaseId,
                  leaseGeneration: 1,
                  authorityLeaseScope: lease.authorityLeaseScope,
                  leaseExpiresAtFinalizedSlot: lease.expiresAtFinalizedSlot,
                  network: "solana-testnet",
                  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
                  authorityAddress: source.plan.authorityAddress,
                  programId: source.plan.programId,
                  operationId: source.plan.operationId,
                  signerCapability: capability,
                },
              }),
          },
        ),
      ).rejects.toThrow(
        mode === "wrong-address" ? /role and address/u : /opaque capability/u,
      );
      expect(envReads).toBe(0);
      if (mode === "wrong-address")
        expect(authorizeSigner).not.toHaveBeenCalled();
    }
  });

  it("checks generation-1 expiry immediately before any broadcast", async () => {
    const source = fixture();
    const sendRawTransaction = vi.fn();
    const delegate = vi.fn();
    const assertLeaseHeld = vi.fn(async () => true);
    const connection = {
      getGenesisHash: vi.fn(async () => SOLANA_TESTNET_GENESIS_HASH),
      getSlot: vi.fn(async () => 1001),
      sendRawTransaction,
    };
    const journal = {
      path: source.journalPaths.journal,
      completed: false,
      safeAbortTerminal: false,
      operationJournal: vi.fn(),
      authorizeSigner: vi.fn(),
      assertLeaseHeld,
      broadcastLeasePolicy: {
        kind: "finalized-slot-bounded",
        expiresAtFinalizedSlot: 1000,
      },
      close: vi.fn(async () => {}),
    };
    await expect(
      upgradeExistingProgram(
        {
          ...source.args,
          submit: "true",
          "confirm-upgrade-existing-program": "true",
          "confirm-exclusive-upgrade-authority-custody": "true",
        },
        {
          connection,
          createOperationJournal: () => journal,
          runtimeDependencies: { broadcastFinalized: delegate },
          executeRuntimeUpgrade: async ({ dependencies }) =>
            dependencies.broadcastFinalized({ connection }),
        },
      ),
    ).rejects.toThrow(/expired before fenced broadcast/u);
    expect(assertLeaseHeld).not.toHaveBeenCalled();
    expect(delegate).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("performs identity and finalized-floor prechecks before recovery takeover", async () => {
    const source = fixture();
    const { claim } = await makeRecoverablePartial(source);
    const openAuthorityLease = vi.fn();
    const createRecoveryLock = vi.fn();
    const connection = {
      getGenesisHash: vi.fn(async () => SOLANA_TESTNET_GENESIS_HASH),
      getSlot: vi.fn(async () => 99),
    };
    await expect(
      recoverExistingProgramUpgradeBuffer(
        {
          ...source.args,
          "upgrade-journal": source.journalPaths.journal,
          "expected-upgrade-claim-sha256": claimDigest(claim),
          submit: "true",
          "confirm-recover-upgrade-buffer": "true",
        },
        { connection, openAuthorityLease, createRecoveryLock },
      ),
    ).rejects.toThrow(/below the reviewed claim and plan floor/u);
    expect(createRecoveryLock).not.toHaveBeenCalled();
    expect(openAuthorityLease).not.toHaveBeenCalled();
    expect(
      JSON.parse(readFileSync(source.journalPaths.authorityLease, "utf8")),
    ).toMatchObject({
      leaseGeneration: 1,
    });
  });

  it("matches the exact durable terminal tuple before releasing the lease", async () => {
    const source = fixture();
    await expect(
      upgradeExistingProgram(
        {
          ...source.args,
          submit: "true",
          "confirm-upgrade-existing-program": "true",
          "confirm-exclusive-upgrade-authority-custody": "true",
        },
        {
          executeRuntimeUpgrade: async ({ dependencies }) => {
            const sequence = await driveCompletedJournal(
              dependencies.operationJournal,
              source,
            );
            const report = exactUpgradeReport(source, sequence);
            report.upgrade.packetSha256 = `0x${"ff".repeat(32)}`;
            return report;
          },
        },
      ),
    ).rejects.toThrow(/exact finalized readback evidence/u);
    expect(existsSync(source.journalPaths.authorityLease)).toBe(true);
    await reconcileDeadOwnerTerminalSolanaUpgradeLease({
      file: source.journalPaths.authorityLease,
    });
  });

  it("rejects a legacy partial success report before writing evidence or releasing the lease", async () => {
    const source = fixture();
    const writePublicJson = vi.fn();
    await expect(
      upgradeExistingProgram(
        {
          ...source.args,
          submit: "true",
          "confirm-upgrade-existing-program": "true",
          "confirm-exclusive-upgrade-authority-custody": "true",
        },
        {
          writePublicJson,
          executeRuntimeUpgrade: async ({ dependencies }) => {
            await driveCompletedJournal(dependencies.operationJournal, source);
            return {
              schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA,
              ready: true,
              mode: "existing-program-only-runtime-upgrade",
              operationId: source.plan.operationId,
              planSha256: source.expectedPlanSha256,
              programId: source.plan.programId,
              programdataAddress: source.plan.programdataAddress,
              target: {
                artifactSha256: source.plan.target.artifactSha256,
                executableLength: source.target.length,
              },
              secretsZeroized: true,
            };
          },
        },
      ),
    ).rejects.toThrow(/exact finalized readback evidence/u);
    expect(writePublicJson).not.toHaveBeenCalled();
    expect(existsSync(source.journalPaths.authorityLease)).toBe(true);
    expect(existsSync(artifactPaths(source.args).existingProgramUpgrade)).toBe(
      false,
    );
    await reconcileDeadOwnerTerminalSolanaUpgradeLease({
      file: source.journalPaths.authorityLease,
    });
  });

  it("retains the authority lease when the configured upgrade report is not durable", async () => {
    const source = fixture();
    const writePublicJson = vi.fn(async () => {
      expect(existsSync(source.journalPaths.authorityLease)).toBe(true);
      throw new Error("injected report fsync failure");
    });
    await expect(
      upgradeExistingProgram(
        {
          ...source.args,
          submit: "true",
          "confirm-upgrade-existing-program": "true",
          "confirm-exclusive-upgrade-authority-custody": "true",
        },
        {
          writePublicJson,
          executeRuntimeUpgrade: async ({ dependencies }) => {
            const sequence = await driveCompletedJournal(
              dependencies.operationJournal,
              source,
            );
            return exactUpgradeReport(source, sequence);
          },
        },
      ),
    ).rejects.toThrow(/injected report fsync failure/u);
    expect(writePublicJson).toHaveBeenCalledOnce();
    expect(existsSync(source.journalPaths.authorityLease)).toBe(true);
    expect(existsSync(source.journalPaths.completionReceipt)).toBe(false);
  });

  it("releases the lease for an exact report and leaves the journal durable", async () => {
    const source = fixture();
    const result = await upgradeExistingProgram(
      {
        ...source.args,
        submit: "true",
        "confirm-upgrade-existing-program": "true",
        "confirm-exclusive-upgrade-authority-custody": "true",
      },
      {
        executeRuntimeUpgrade: async ({ dependencies }) => {
          const sequence = await driveCompletedJournal(
            dependencies.operationJournal,
            source,
          );
          return exactUpgradeReport(source, sequence);
        },
      },
    );
    expect(result.report.ready).toBe(true);
    expect(existsSync(source.journalPaths.authorityLease)).toBe(false);
    expect(existsSync(source.journalPaths.journal)).toBe(true);
    expect(existsSync(result.existingProgramUpgradePath)).toBe(true);
    expect(existsSync(result.completionReceiptPath)).toBe(true);
    const receipt = JSON.parse(
      readFileSync(result.completionReceiptPath, "utf8"),
    );
    expect(receipt).toMatchObject({
      kind: "upgrade-complete",
    });
    expect(receipt.configuredReport.path).toBe(
      realpathSync(result.existingProgramUpgradePath),
    );
  });

  it("semantically revalidates a configured report under the dead-owner fence", async () => {
    const runWithRetainedLease = async (source) => {
      const actualJournal = createActualJournal(source);
      return upgradeExistingProgram(
        {
          ...source.args,
          submit: "true",
          "confirm-upgrade-existing-program": "true",
          "confirm-exclusive-upgrade-authority-custody": "true",
        },
        {
          createOperationJournal: () =>
            retainLeaseAfterSuccessfulJournalClose(actualJournal),
          executeRuntimeUpgrade: async ({ dependencies }) => {
            const sequence = await driveCompletedJournal(
              dependencies.operationJournal,
              source,
            );
            return exactUpgradeReport(source, sequence);
          },
        },
      );
    };

    const exactSource = fixture();
    await runWithRetainedLease(exactSource);
    expect(existsSync(exactSource.journalPaths.authorityLease)).toBe(true);
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: exactSource.journalPaths.authorityLease,
      }),
    ).resolves.toMatchObject({
      terminalKind: "ordinary-complete",
      receiptSynthesized: false,
    });
    expect(existsSync(exactSource.journalPaths.authorityLease)).toBe(false);

    const forgedSource = fixture();
    const result = await runWithRetainedLease(forgedSource);
    const configuredReport = JSON.parse(
      readFileSync(result.existingProgramUpgradePath, "utf8"),
    );
    configuredReport.network = "solana-mainnet";
    const forgedBytes = Buffer.from(
      `${JSON.stringify(configuredReport, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(result.existingProgramUpgradePath, forgedBytes);
    const receipt = JSON.parse(
      readFileSync(result.completionReceiptPath, "utf8"),
    );
    receipt.configuredReport.sha256 = solanaSha256(forgedBytes);
    writeFileSync(
      result.completionReceiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: forgedSource.journalPaths.authorityLease,
      }),
    ).rejects.toThrow(/Configured runtime upgrade report/u);
    expect(existsSync(forgedSource.journalPaths.authorityLease)).toBe(true);
  });

  it("does not release a recovery lease after dependent candidate cleanup fails", async () => {
    const source = fixture();
    const { claim, selected } = await makeRecoverablePartial(source);
    const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
    const tuple = transactionTuple(108);
    const order = [];
    const recoveryLock = {
      path: source.journalPaths.recoveryLock,
      promoted: false,
      assertHeld: vi.fn(async () => true),
      promote: vi.fn(async () => {
        recoveryLock.promoted = true;
      }),
      close: vi.fn(async ({ removeCompleted = false } = {}) => {
        order.push("candidate");
        if (removeCompleted)
          throw new Error("injected candidate cleanup failure");
      }),
    };
    const authorityClose = vi.fn(async ({ releaseLease }) => {
      order.push("lease");
      expect(releaseLease).toBe(false);
    });
    const authorityLease = {
      record: { leaseId: lease.leaseId },
      leaseGeneration: 2,
      authorityLeaseScope: lease.authorityLeaseScope,
      selectedJournal: selected,
      assertHeld: vi.fn(async () => true),
      close: authorityClose,
    };
    const terminalSummary = {
      operationId: claim.operationId,
      planSha256: claim.planSha256,
      programId: claim.programId,
      programdataAddress: claim.programdataAddress,
      authorityAddress: claim.authorityAddress,
      payerAddress: claim.payerAddress,
      bufferAddress: claim.bufferAddress,
      targetArtifactSha256: claim.targetArtifactSha256,
      targetExecutableLength: claim.targetExecutableLength,
      claimEventSha256: claimDigest(claim),
      leaseId: lease.leaseId,
      leaseGeneration: 2,
      authorityLeaseScope: lease.authorityLeaseScope,
      signature: tuple.expectedSignature,
      finalizedSlot: 160,
      expectedSignatures: [...tuple.expectedSignatures],
      blockhash: tuple.blockhash,
      lastValidBlockHeight: tuple.lastValidBlockHeight,
      messageSha256: tuple.messageSha256,
      packetSha256: tuple.packetSha256,
      packetLength: tuple.packetLength,
    };
    const recoveryJournal = {
      recoveryCompleted: true,
      terminalSummary,
      operationJournal: vi.fn(),
      authorizeSigner: vi.fn(),
      assertLeaseHeld: vi.fn(async () => true),
      broadcastLeasePolicy: {
        kind: "owner-death-fence-and-capability-bounded",
        expiresAtFinalizedSlot: null,
      },
      close: vi.fn(async () => {
        order.push("journal");
      }),
    };
    await expect(
      recoverExistingProgramUpgradeBuffer(
        {
          ...source.args,
          "upgrade-journal": source.journalPaths.journal,
          "expected-upgrade-claim-sha256": claimDigest(claim),
          submit: "true",
          "confirm-recover-upgrade-buffer": "true",
        },
        {
          connection: {
            getGenesisHash: vi.fn(async () => SOLANA_TESTNET_GENESIS_HASH),
            getSlot: vi.fn(async () => 150),
          },
          createRecoveryLock: vi.fn(async () => recoveryLock),
          openAuthorityLease: vi.fn(async () => authorityLease),
          createRecoveryJournal: vi.fn(async () => recoveryJournal),
          executeRecovery: vi.fn(async () =>
            exactRecoveryReport({ source, claim, tuple }),
          ),
        },
      ),
    ).rejects.toThrow(/injected candidate cleanup failure/u);
    expect(order).toEqual(["journal", "candidate", "lease"]);
    expect(authorityClose).toHaveBeenCalledWith({ releaseLease: false });
    expect(existsSync(source.journalPaths.completionReceipt)).toBe(true);
  });

  it("rejects an arbitrary ready-false recovery diagnostic before report write or lease release", async () => {
    const source = fixture();
    const { claim, selected } = await makeRecoverablePartial(source);
    const lease = solanaExistingProgramUpgradeLeaseIdentity(source.normalized);
    const tuple = transactionTuple(124);
    const authorityClose = vi.fn(async () => {});
    const recoveryLock = {
      path: source.journalPaths.recoveryLock,
      promote: vi.fn(async () => {}),
      assertHeld: vi.fn(async () => true),
      close: vi.fn(async () => {}),
    };
    const authorityLease = {
      record: { leaseId: lease.leaseId },
      leaseGeneration: 2,
      authorityLeaseScope: lease.authorityLeaseScope,
      selectedJournal: selected,
      assertHeld: vi.fn(async () => true),
      close: authorityClose,
    };
    const diagnosticSummary = {
      ...recoveryTerminalSummary({ source, claim, tuple }),
      finalizedSlot: 150,
    };
    const recoveryJournal = {
      recoveryCompleted: false,
      diagnosticSummary,
      terminalSummary: null,
      operationJournal: vi.fn(),
      authorizeSigner: vi.fn(),
      assertLeaseHeld: vi.fn(async () => true),
      broadcastLeasePolicy: {
        kind: "owner-death-fence-and-capability-bounded",
        expiresAtFinalizedSlot: null,
      },
      close: vi.fn(async () => {}),
    };
    const writePublicJson = vi.fn();
    await expect(
      recoverExistingProgramUpgradeBuffer(
        {
          ...source.args,
          "upgrade-journal": source.journalPaths.journal,
          "expected-upgrade-claim-sha256": claimDigest(claim),
          submit: "true",
          "confirm-recover-upgrade-buffer": "true",
        },
        {
          connection: {
            getGenesisHash: vi.fn(async () => SOLANA_TESTNET_GENESIS_HASH),
            getSlot: vi.fn(async () => 150),
          },
          writePublicJson,
          createRecoveryLock: vi.fn(async () => recoveryLock),
          openAuthorityLease: vi.fn(async () => authorityLease),
          createRecoveryJournal: vi.fn(async () => recoveryJournal),
          executeRecovery: vi.fn(async () => ({
            ...recoveryDiagnosticReport({ source, claim }),
            mode: "unrecognized-ready-false-diagnostic",
          })),
        },
      ),
    ).rejects.toThrow(/exact readback evidence/u);
    expect(writePublicJson).not.toHaveBeenCalled();
    expect(authorityClose).toHaveBeenCalledWith({ releaseLease: false });
    expect(existsSync(source.journalPaths.authorityLease)).toBe(true);
  });

  it("deserializes and binds the exact signed packet before read-only resolution", async () => {
    const tuple = transactionTuple(101);
    const connection = {
      getGenesisHash: vi.fn(async () => SOLANA_TESTNET_GENESIS_HASH),
      getSignatureStatuses: vi.fn(async () => ({ value: [null] })),
      getBlockHeight: vi.fn(async () => tuple.lastValidBlockHeight + 1),
      sendRawTransaction: vi.fn(),
    };
    await expect(
      resolveSolanaRuntimeUpgradeAmbiguousTransaction({
        connection,
        intent: {
          expectedPrimarySignature: tuple.expectedPrimarySignature,
          expectedSignatures: tuple.expectedSignatures,
          blockhash: tuple.blockhash,
          lastValidBlockHeight: tuple.lastValidBlockHeight,
          messageSha256: tuple.messageSha256,
          packetSha256: tuple.packetSha256,
          packetLength: tuple.packetLength,
        },
        rawTransaction: tuple.raw,
        latestBlockhash: {
          blockhash: tuple.blockhash,
          lastValidBlockHeight: tuple.lastValidBlockHeight,
        },
      }),
    ).resolves.toEqual({
      status: "expired",
      observedBlockHeight: tuple.lastValidBlockHeight + 1,
      signatureStatus: null,
    });
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
    const callsBefore = connection.getGenesisHash.mock.calls.length;
    await expect(
      resolveSolanaRuntimeUpgradeAmbiguousTransaction({
        connection,
        intent: {
          expectedPrimarySignature: tuple.expectedPrimarySignature,
          expectedSignatures: tuple.expectedSignatures,
          blockhash: tuple.blockhash,
          lastValidBlockHeight: tuple.lastValidBlockHeight,
          messageSha256: tuple.messageSha256,
          packetSha256: solanaSha256(Buffer.from("forged")),
          packetLength: 6,
        },
        rawTransaction: Buffer.from("forged"),
        latestBlockhash: {
          blockhash: tuple.blockhash,
          lastValidBlockHeight: tuple.lastValidBlockHeight,
        },
      }),
    ).rejects.toThrow(/exact signed Solana transaction/u);
    expect(connection.getGenesisHash).toHaveBeenCalledTimes(callsBefore);
  });

  it("simulates only exact signed finalized bytes", async () => {
    const tuple = transactionTuple(104);
    const response = { context: { slot: 120 }, value: { err: null, logs: [] } };
    const simulateTransaction = vi.fn(async () => response);
    await expect(
      simulateSolanaRuntimeUpgradeRawTransaction({
        connection: { simulateTransaction },
        rawTransaction: tuple.raw,
        config: {
          sigVerify: true,
          replaceRecentBlockhash: false,
          commitment: "finalized",
          minContextSlot: 100,
        },
        expectedSignature: tuple.expectedSignature,
        expectedSignatures: tuple.expectedSignatures,
        messageSha256: tuple.messageSha256,
        packetSha256: tuple.packetSha256,
        stage: "upgrade-rollback-sentinel-admission",
      }),
    ).resolves.toBe(response);
    await expect(
      simulateSolanaRuntimeUpgradeRawTransaction({
        connection: { simulateTransaction },
        rawTransaction: tuple.raw,
        config: {
          sigVerify: true,
          replaceRecentBlockhash: true,
          commitment: "finalized",
          minContextSlot: 100,
        },
        expectedSignature: tuple.expectedSignature,
        expectedSignatures: tuple.expectedSignatures,
        messageSha256: tuple.messageSha256,
        packetSha256: tuple.packetSha256,
        stage: "upgrade-rollback-sentinel-admission",
      }),
    ).rejects.toThrow(/no-broadcast contract/u);
  });

  it("requires mutation guards before any plan, journal, or signer access", async () => {
    const journal = vi.fn();
    await expect(
      upgradeExistingProgram(
        { "upgrade-plan": "/does/not/exist" },
        { createOperationJournal: journal },
      ),
    ).rejects.toThrow(/--submit true --confirm-upgrade-existing-program true/u);
    expect(journal).not.toHaveBeenCalled();
    await expect(
      recoverExistingProgramUpgradeBuffer(
        { "upgrade-plan": "/does/not/exist" },
        {
          env: {
            [SOLANA_UPGRADE_AUTHORITY_RUNTIME_SIGNER_ENV]: "unused",
            [SOLANA_UPGRADE_PAYER_RUNTIME_SIGNER_ENV]: "unused",
          },
        },
      ),
    ).rejects.toThrow(/--submit true --confirm-recover-upgrade-buffer true/u);
  });

  it("keeps recovery reports bound to the exact target identity", () => {
    expect(SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA).toMatch(
      /recovery-report/u,
    );
  });
});

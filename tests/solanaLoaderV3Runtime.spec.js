// @vitest-environment node
/* global AggregateError, BigInt */
import { createHash } from "node:crypto";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_BUFFER_METADATA_LENGTH,
  SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_CONFIRMATION_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_READINESS_SCHEMA,
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA,
  SOLANA_MAX_ACCOUNT_DATA_LENGTH,
  SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS,
  SOLANA_LOADER_V3_SBF_VALIDATION_EVIDENCE_SCHEMA,
  SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_SBF_VALIDATION_SCOPE,
  SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
  SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES,
  SOLANA_PACKET_DATA_SIZE,
  SOLANA_PROGRAMDATA_METADATA_LENGTH,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_UPGRADEABLE_LOADER_ID,
  buildLoaderV3CloseBufferInstruction,
  buildLoaderV3DeployWithMaxDataLenInstruction,
  buildLoaderV3ExtendProgramCheckedInstruction,
  buildLoaderV3InitializeBufferInstruction,
  buildLoaderV3UpgradeInstruction,
  buildLoaderV3WriteInstruction,
  canonicalSolanaLoaderV3SbfValidationEvidenceBytes,
  canonicalSolanaLoaderV3RuntimeUpgradePlanBytes,
  canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes,
  encodeLoaderV3CloseData,
  encodeLoaderV3DeployWithMaxDataLenData,
  encodeLoaderV3ExtendProgramCheckedData,
  encodeLoaderV3InitializeBufferData,
  encodeLoaderV3UpgradeData,
  encodeLoaderV3WriteData,
  inspectSolanaLoaderV3RuntimeUpgradeReadiness,
  recoverJournaledSolanaLoaderV3BufferWithRuntime,
  selectLargestLoaderV3WriteChunk,
  solanaLoaderV3AuthorityGlobalLeaseScope,
  solanaBlake2b256,
  solanaSha256,
  upgradeExistingSolanaLoaderV3ProgramWithRuntime,
  validateSolanaLoaderV3RuntimeUpgradePlan,
} from "../scripts/solana-loader-v3-runtime.mjs";

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const hash = (label) => `0x${createHash("sha256").update(label).digest("hex")}`;
const keypair = (seed) =>
  Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => seed));
const elf = (length, byte) => {
  if (length < 120) throw new Error("test SBF ELF must be at least 120 bytes");
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

const clone = (value) => JSON.parse(JSON.stringify(value));
const TEST_RUSTC_IDENTITY =
  "rustc 1.89.0 (29483883e 2025-08-04);binary: rustc;commit-hash: 29483883eed69d5fb4db01964cdf2af4d86e9cb2;commit-date: 2025-08-04;host: x86_64-unknown-linux-gnu;release: 1.89.0;LLVM version: 20.1.7";
const sbfEvidenceFor = (target) => ({
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
  helperBinarySha256: hash("test-release-validator-binary"),
  helperTargetTriple: "x86_64-unknown-linux-gnu",
  jitOutcome: "compiled",
  buildProfile: "release",
  validatorSourceBundleSha256: hash("test-validator-source-bundle"),
  cargoLockSha256: hash("test-validator-cargo-lock"),
  rustcIdentity: TEST_RUSTC_IDENTITY,
  rustcIdentitySha256: solanaSha256(Buffer.from(TEST_RUSTC_IDENTITY, "utf8")),
  resourceLimits: "unix-rlimit-v1",
  checks: [...SOLANA_LOADER_V3_REQUIRED_SBF_VALIDATION_CHECKS],
});
const reviewedPlan = (plan) => {
  const planBytes = canonicalSolanaLoaderV3RuntimeUpgradePlanBytes(plan);
  const expectedPlanSha256 = solanaSha256(planBytes);
  return {
    planBytes,
    expectedPlanSha256,
    confirmation: {
      schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_CONFIRMATION_SCHEMA,
      action: "upgrade-existing-loader-v3-program",
      submit: true,
      irreversible: true,
      operationId: plan.operationId,
      planSha256: expectedPlanSha256,
      programId: plan.programId,
      targetArtifactSha256: plan.target.artifactSha256,
    },
  };
};

let operationIndex = 0;
const fixture = ({ beforeLength = 2048, targetLength = 900 } = {}) => {
  operationIndex += 1;
  const program = keypair(10).publicKey;
  const programdata = PublicKey.findProgramAddressSync(
    [program.toBuffer()],
    LOADER,
  )[0];
  const authority = keypair(11);
  const payer = keypair(12);
  const beforeExecutable = elf(beforeLength, 0x31);
  const target = elf(targetLength, 0x52);
  const sbfEvidence = sbfEvidenceFor(target);
  const beforeDataLength = SOLANA_PROGRAMDATA_METADATA_LENGTH + beforeLength;
  const headroom = SOLANA_MAX_ACCOUNT_DATA_LENGTH - beforeDataLength;
  const additionalBytes =
    headroom < SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES
      ? headroom
      : Math.max(
          targetLength - beforeLength,
          SOLANA_MINIMUM_CHECKED_EXTENSION_BYTES,
        );
  const extension =
    targetLength > beforeLength
      ? {
          additionalBytes,
          resultProgramdataDataLength: beforeDataLength + additionalBytes,
        }
      : null;
  const plan = {
    schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_PLAN_SCHEMA,
    operationId: hash(`operation-${operationIndex}`),
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
      programdataDataLength: beforeDataLength,
      executableLength: beforeLength,
      executableSha256: solanaSha256(beforeExecutable),
      codeHash: solanaBlake2b256(beforeExecutable),
    },
    target: {
      artifactSha256: solanaSha256(target),
      executableSha256: solanaSha256(target),
      codeHash: solanaBlake2b256(target),
      executableLength: target.length,
      sbfValidatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: solanaSha256(
        canonicalSolanaLoaderV3SbfValidationEvidenceBytes(sbfEvidence),
      ),
    },
    extension,
    policy: {
      maxPacketBytes: SOLANA_PACKET_DATA_SIZE,
      automaticMutationRetries: 0,
      allowNewProgramId: false,
      runtimeOnlySigners: true,
    },
  };
  return {
    program,
    programdata,
    authority,
    payer,
    beforeExecutable,
    target,
    sbfEvidence,
    plan,
    ...reviewedPlan(plan),
  };
};

const programData = (programdata) => {
  const bytes = Buffer.alloc(36);
  bytes.writeUInt32LE(2, 0);
  programdata.toBuffer().copy(bytes, 4);
  return bytes;
};

const programdataData = ({ slot, authority, executable }) => {
  const bytes = Buffer.alloc(
    SOLANA_PROGRAMDATA_METADATA_LENGTH + executable.length,
  );
  bytes.writeUInt32LE(3, 0);
  bytes.writeBigUInt64LE(BigInt(slot), 4);
  bytes[12] = 1;
  authority.toBuffer().copy(bytes, 13);
  executable.copy(bytes, SOLANA_PROGRAMDATA_METADATA_LENGTH);
  return bytes;
};

const bufferData = ({ authority, executable }) => {
  const bytes = Buffer.alloc(SOLANA_BUFFER_METADATA_LENGTH + executable.length);
  bytes.writeUInt32LE(1, 0);
  bytes[4] = 1;
  authority.toBuffer().copy(bytes, 5);
  executable.copy(bytes, SOLANA_BUFFER_METADATA_LENGTH);
  return bytes;
};

const metaSummary = (instruction) =>
  instruction.keys.map((entry) => [
    entry.pubkey.toBase58(),
    entry.isSigner,
    entry.isWritable,
  ]);

const mockRuntime = ({
  source,
  corruptPopulatedBuffer = false,
  corruptTransaction = null,
  failStage = null,
  cleanupFails = false,
  concurrentProgramdataMutationDuringWrites = false,
  startSlot = 100,
} = {}) => {
  let slot = startSlot;
  let blockhashIndex = 80;
  const stages = [];
  const journalEvents = [];
  const activity = [];
  const signerCapability = Object.freeze({ token: "initial-capability" });
  const recoverySignerCapability = Object.freeze({
    token: "recovery-capability",
  });
  const bufferSigner = keypair(77);
  const probeSigner = keypair(78);
  const authoritySigner = keypair(11);
  const payerSigner = keypair(12);
  const secretViews = [
    authoritySigner._keypair.secretKey,
    payerSigner._keypair.secretKey,
    bufferSigner._keypair.secretKey,
    probeSigner._keypair.secretKey,
  ];
  const state = {
    buffer: null,
    programdata: programdataData({
      slot: 42,
      authority: source.authority.publicKey,
      executable: source.beforeExecutable,
    }),
  };
  const account = (data, { executable = false, lamports = 1 } = {}) => ({
    context: { slot },
    value: {
      owner: LOADER,
      executable,
      lamports,
      rentEpoch: 0,
      data: Buffer.from(data),
    },
  });
  const readAccount = vi.fn(async ({ address, allowMissing }) => {
    if (address === source.program.toBase58()) {
      return account(programData(source.programdata), { executable: true });
    }
    if (address === source.programdata.toBase58()) {
      return account(state.programdata);
    }
    if (address === bufferSigner.publicKey.toBase58()) {
      if (!state.buffer) {
        return allowMissing ? { context: { slot }, value: null } : null;
      }
      return account(state.buffer);
    }
    if (allowMissing) return { context: { slot }, value: null };
    throw new Error("unexpected mock account");
  });
  const broadcastFinalized = vi.fn(
    async ({
      rawTransaction,
      expectedPrimarySignature,
      expectedSignatures,
      messageBytes,
      stage,
    }) => {
      stages.push(stage);
      activity.push(`broadcast:${stage}`);
      if (stage === failStage) throw new Error(`forced ${stage} failure`);
      const tx = Transaction.from(rawTransaction);
      slot += 2;
      if (stage === "create-and-initialize-buffer") {
        state.buffer = bufferData({
          authority: source.authority.publicKey,
          executable: Buffer.alloc(source.target.length),
        });
      } else if (stage.startsWith("write-buffer-")) {
        const data = tx.instructions[0].data;
        const offset = data.readUInt32LE(4);
        const length = Number(data.readBigUInt64LE(8));
        data
          .subarray(16, 16 + length)
          .copy(state.buffer, SOLANA_BUFFER_METADATA_LENGTH + offset);
        if (concurrentProgramdataMutationDuringWrites) {
          const changed = Buffer.from(
            state.programdata.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH),
          );
          changed[changed.length - 1] ^= 1;
          state.programdata = programdataData({
            slot: 43,
            authority: source.authority.publicKey,
            executable: changed,
          });
        }
      } else if (stage === "checked-extend-programdata") {
        const parsed = state.programdata.subarray(
          SOLANA_PROGRAMDATA_METADATA_LENGTH,
        );
        state.programdata = programdataData({
          slot,
          authority: source.authority.publicKey,
          executable: Buffer.concat([
            parsed,
            Buffer.alloc(source.plan.extension.additionalBytes),
          ]),
        });
      } else if (stage === "upgrade-existing-program") {
        const capacity =
          state.programdata.length - SOLANA_PROGRAMDATA_METADATA_LENGTH;
        state.programdata = programdataData({
          slot,
          authority: source.authority.publicKey,
          executable: Buffer.concat([
            source.target,
            Buffer.alloc(capacity - source.target.length),
          ]),
        });
        state.buffer = null;
      } else if (
        stage === "cleanup-close-buffer" ||
        stage === "recover-close-orphan-buffer"
      ) {
        if (cleanupFails) throw new Error("forced cleanup failure");
        state.buffer = null;
      }
      if (
        corruptPopulatedBuffer &&
        stage.startsWith("write-buffer-") &&
        state.buffer
      ) {
        state.buffer[state.buffer.length - 1] ^= 0xff;
      }
      const corruptThisTransaction =
        corruptTransaction !== null && stage === "create-and-initialize-buffer";
      return {
        signature:
          corruptThisTransaction && corruptTransaction === "signature"
            ? keypair(99).publicKey.toBase58()
            : expectedPrimarySignature,
        confirmation: { value: { err: null } },
        signatureStatus: {
          err: null,
          confirmationStatus: "finalized",
          slot,
        },
        transactionReadback: {
          slot,
          meta: {
            err:
              corruptThisTransaction && corruptTransaction === "meta"
                ? "bad"
                : null,
          },
          // A caller-provided convenience field must never shadow the fetched
          // transaction message below.
          messageBytes,
          transaction: {
            signatures: expectedSignatures,
            message: {
              serialize: () =>
                corruptThisTransaction && corruptTransaction === "message"
                  ? Buffer.concat([messageBytes, Buffer.from([0])])
                  : messageBytes,
            },
          },
        },
      };
    },
  );
  const operationJournal = vi.fn(async (event) => {
    journalEvents.push(structuredClone(event));
    activity.push(`journal:${event.type}:${event.stage}`);
    return event.type === "claim"
      ? {
          durable: true,
          claimed: true,
          journalId: "durable-journal-1",
          exclusiveAuthorityLease: true,
          authorityCustodyScope: "same-host-exclusive",
          crossHostAuthorityUseExcluded: true,
          leaseId: "authority-lease-1",
          leaseGeneration: 1,
          authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
            source.authority.publicKey.toBase58(),
          ),
          leaseExpiresAtFinalizedSlot: 900,
          signerCapability,
        }
      : {
          durable: true,
          recorded: true,
          journalId: "durable-journal-1",
        };
  });
  return {
    state,
    stages,
    journalEvents,
    activity,
    advanceSlot: (amount = 1) => {
      slot += amount;
      return slot;
    },
    bufferSigner,
    probeSigner,
    signerCapability,
    recoverySignerCapability,
    secretViews,
    dependencies: {
      assertNetwork: vi.fn(async () => undefined),
      getClusterVersion: vi.fn(async () => ({
        "solana-core": "4.1.0",
        "feature-set": 3345198602,
      })),
      getFinalizedSlot: vi.fn(async () => slot),
      getLatestBlockhash: vi.fn(async () => {
        blockhashIndex += 1;
        return {
          blockhash: keypair(blockhashIndex % 250).publicKey.toBase58(),
          lastValidBlockHeight: 99999,
        };
      }),
      readAccount,
      validateSbfExecutable: vi.fn(async () => clone(source.sbfEvidence)),
      simulateRawTransaction: vi.fn(async ({ stage }) => ({
        context: { slot },
        value: {
          err: {
            InstructionError: [
              stage === "deploy-rollback-sentinel-admission" ? 2 : 1,
              "InvalidInstructionData",
            ],
          },
          logs: [
            `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
            `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid instruction data`,
          ],
        },
      })),
      getSignatureStatus: vi.fn(async () => null),
      resolveAmbiguousTransaction: vi.fn(async ({ intent }) => ({
        status: "expired",
        observedBlockHeight: intent.lastValidBlockHeight + 1,
        signatureStatus: null,
      })),
      getMinimumBalanceForRentExemption: vi.fn(async () => 123456),
      broadcastFinalized,
      sleep: vi.fn(async () => {
        slot += 1;
      }),
      generateEphemeralKeypair: vi.fn(() => bufferSigner),
      generateProbeKeypair: vi.fn(() => probeSigner),
      operationJournal,
    },
    signerFactory: vi.fn(async ({ role }) =>
      role === "authority" ? authoritySigner : payerSigner,
    ),
  };
};

const recoveryClaim = (source, bufferAddress = keypair(77).publicKey) => ({
  schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  type: "claim",
  operationId: source.plan.operationId,
  planSha256: reviewedPlan(source.plan).expectedPlanSha256,
  programId: source.program.toBase58(),
  programdataAddress: source.programdata.toBase58(),
  authorityAddress: source.authority.publicKey.toBase58(),
  payerAddress: source.payer.publicKey.toBase58(),
  bufferAddress: bufferAddress.toBase58(),
  targetArtifactSha256: solanaSha256(source.target),
  targetExecutableLength: source.target.length,
  stage: "durable-operation-claim",
  status: "claimed-before-mutation",
  finalizedContextSlot: 100,
  authorityLeaseRequired: true,
  authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
    source.authority.publicKey.toBase58(),
  ),
  bufferPossiblyCreated: false,
  bufferConsumed: false,
  recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
});

const enableRecoveryJournal = (runtime, { authorized = true } = {}) => {
  runtime.dependencies.operationJournal.mockImplementation(async (event) => {
    runtime.journalEvents.push(structuredClone(event));
    runtime.activity.push(`journal:${event.type}:${event.stage}`);
    return event.type === "recovery-start"
      ? {
          durable: true,
          authorized,
          journalId: "durable-journal-1",
          claimEventSha256: event.claimEventSha256,
          exclusiveAuthorityLease: true,
          authorityCustodyScope: "same-host-exclusive",
          crossHostAuthorityUseExcluded: true,
          leaseId: "authority-lease-recovery-2",
          leaseGeneration: 2,
          authorityLeaseScope: event.authorityLeaseScope,
          signerCapability: runtime.recoverySignerCapability,
        }
      : {
          durable: true,
          recorded: true,
          journalId: "durable-journal-1",
        };
  });
};

const recoveryInput = (source, claimEvent = recoveryClaim(source)) => {
  const claimEventBytes =
    canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes(claimEvent);
  return {
    claimEventBytes,
    expectedClaimEventSha256: solanaSha256(claimEventBytes),
    planBytes: source.planBytes,
    expectedPlanSha256: source.expectedPlanSha256,
    targetExecutableBytes: source.target,
  };
};

describe("Loader-v3 bincode known-answer encodings", () => {
  it("matches every bounded unit/field encoding used by this transport", () => {
    expect(encodeLoaderV3InitializeBufferData().toString("hex")).toBe(
      "00000000",
    );
    expect(
      encodeLoaderV3WriteData({
        offset: 0x01020304,
        bytes: Buffer.from([0xaa, 0xbb]),
      }).toString("hex"),
    ).toBe("01000000040302010200000000000000aabb");
    expect(encodeLoaderV3UpgradeData().toString("hex")).toBe("03000000");
    expect(encodeLoaderV3DeployWithMaxDataLenData(0x1234).toString("hex")).toBe(
      "020000003412000000000000",
    );
    expect(encodeLoaderV3CloseData().toString("hex")).toBe("05000000");
    expect(encodeLoaderV3ExtendProgramCheckedData(10240).toString("hex")).toBe(
      "0900000000280000",
    );
  });

  it.each([
    [-1, Buffer.from([1])],
    [2 ** 32, Buffer.from([1])],
    [0, Buffer.alloc(0)],
  ])("rejects an invalid Write tuple %#", (offset, bytes) => {
    expect(() => encodeLoaderV3WriteData({ offset, bytes })).toThrow();
  });

  it.each([0, 1, 10239, 2 ** 32])(
    "rejects checked extension length %s",
    (length) => {
      expect(() => encodeLoaderV3ExtendProgramCheckedData(length)).toThrow();
    },
  );
});

describe("canonical Loader-v3 instruction accounts", () => {
  it("pins InitializeBuffer and Write order and privileges", () => {
    const source = fixture();
    const buffer = keypair(20).publicKey;
    const initialize = buildLoaderV3InitializeBufferInstruction({
      bufferAddress: buffer,
      authorityAddress: source.authority.publicKey,
    });
    const write = buildLoaderV3WriteInstruction({
      bufferAddress: buffer,
      authorityAddress: source.authority.publicKey,
      offset: 0,
      bytes: Buffer.from([1]),
    });
    expect(initialize.programId.toBase58()).toBe(SOLANA_UPGRADEABLE_LOADER_ID);
    expect(metaSummary(initialize)).toEqual([
      [buffer.toBase58(), false, true],
      [source.authority.publicKey.toBase58(), false, false],
    ]);
    expect(metaSummary(write)).toEqual([
      [buffer.toBase58(), false, true],
      [source.authority.publicKey.toBase58(), true, false],
    ]);
  });

  it("pins Upgrade exact order and privileges", () => {
    const source = fixture();
    const buffer = keypair(20).publicKey;
    const instruction = buildLoaderV3UpgradeInstruction({
      programId: source.program,
      programdataAddress: source.programdata,
      bufferAddress: buffer,
      spillAddress: source.payer.publicKey,
      authorityAddress: source.authority.publicKey,
    });
    expect(metaSummary(instruction)).toEqual([
      [source.programdata.toBase58(), false, true],
      [source.program.toBase58(), false, true],
      [buffer.toBase58(), false, true],
      [source.payer.publicKey.toBase58(), false, true],
      ["SysvarRent111111111111111111111111111111111", false, false],
      ["SysvarC1ock11111111111111111111111111111111", false, false],
      [source.authority.publicKey.toBase58(), true, false],
    ]);
  });

  it("pins DeployWithMaxDataLen probe ABI and exact account privileges", () => {
    const source = fixture();
    const probe = keypair(62).publicKey;
    const probeProgramdata = PublicKey.findProgramAddressSync(
      [probe.toBuffer()],
      LOADER,
    )[0];
    const buffer = keypair(63).publicKey;
    const instruction = buildLoaderV3DeployWithMaxDataLenInstruction({
      payerAddress: source.payer.publicKey,
      programId: probe,
      programdataAddress: probeProgramdata,
      bufferAddress: buffer,
      authorityAddress: source.authority.publicKey,
      maxDataLength: 4096,
    });
    expect(instruction.data.toString("hex")).toBe("020000000010000000000000");
    expect(metaSummary(instruction)).toEqual([
      [source.payer.publicKey.toBase58(), true, true],
      [probeProgramdata.toBase58(), false, true],
      [probe.toBase58(), false, true],
      [buffer.toBase58(), false, true],
      ["SysvarRent111111111111111111111111111111111", false, false],
      ["SysvarC1ock11111111111111111111111111111111", false, false],
      [SystemProgram.programId.toBase58(), false, false],
      [source.authority.publicKey.toBase58(), true, false],
    ]);
  });

  it("pins Close and authority-checked Extend exact metas", () => {
    const source = fixture({ beforeLength: 256, targetLength: 11000 });
    const buffer = keypair(20).publicKey;
    expect(
      metaSummary(
        buildLoaderV3CloseBufferInstruction({
          bufferAddress: buffer,
          recipientAddress: source.payer.publicKey,
          authorityAddress: source.authority.publicKey,
        }),
      ),
    ).toEqual([
      [buffer.toBase58(), false, true],
      [source.payer.publicKey.toBase58(), false, true],
      [source.authority.publicKey.toBase58(), true, false],
    ]);
    expect(
      metaSummary(
        buildLoaderV3ExtendProgramCheckedInstruction({
          programId: source.program,
          programdataAddress: source.programdata,
          authorityAddress: source.authority.publicKey,
          payerAddress: source.payer.publicKey,
          additionalBytes: source.plan.extension.additionalBytes,
        }),
      ),
    ).toEqual([
      [source.programdata.toBase58(), false, true],
      [source.program.toBase58(), false, true],
      [source.authority.publicKey.toBase58(), true, false],
      [SystemProgram.programId.toBase58(), false, false],
      [source.payer.publicKey.toBase58(), true, true],
    ]);
  });

  it("rejects ProgramData substitution for Upgrade and Extend", () => {
    const source = fixture();
    const wrong = keypair(44).publicKey;
    expect(() =>
      buildLoaderV3UpgradeInstruction({
        programId: source.program,
        programdataAddress: wrong,
        bufferAddress: keypair(20).publicKey,
        spillAddress: source.payer.publicKey,
        authorityAddress: source.authority.publicKey,
      }),
    ).toThrow(/PDA/u);
    expect(() =>
      buildLoaderV3ExtendProgramCheckedInstruction({
        programId: source.program,
        programdataAddress: wrong,
        authorityAddress: source.authority.publicKey,
        payerAddress: source.payer.publicKey,
        additionalBytes: 10240,
      }),
    ).toThrow(/PDA/u);
  });
});

describe("strict independent runtime upgrade plan", () => {
  it("derives one canonical genesis-and-authority lease scope", () => {
    const source = fixture();
    expect(
      solanaLoaderV3AuthorityGlobalLeaseScope(
        source.authority.publicKey.toBase58(),
      ),
    ).toBe(
      `solana-testnet:${SOLANA_TESTNET_GENESIS_HASH}:${source.authority.publicKey.toBase58()}`,
    );
    expect(() =>
      solanaLoaderV3AuthorityGlobalLeaseScope("not-a-public-key"),
    ).toThrow(/canonical Solana public key/u);
  });

  it("accepts exact pins and copies target bytes", () => {
    const source = fixture();
    const validated = validateSolanaLoaderV3RuntimeUpgradePlan({
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
    });
    expect(validated.programId).toBe(source.program.toBase58());
    expect(validated.targetSha256).toBe(source.plan.target.artifactSha256);
    source.target.fill(0);
    expect(validated.target.subarray(0, 4).toString("hex")).toBe("7f454c46");
  });

  it("binds exact canonical plan bytes to an independently supplied hash", () => {
    const source = fixture();
    expect(source.expectedPlanSha256).toBe(solanaSha256(source.planBytes));
    const tampered = Buffer.from(source.planBytes);
    tampered[tampered.length - 2] ^= 1;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        planBytes: tampered,
        expectedPlanSha256: source.expectedPlanSha256,
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/independently supplied SHA-256/u);
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        planBytes: source.planBytes,
        expectedPlanSha256: hash("unrelated approval"),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/independently supplied SHA-256/u);
  });

  it("rejects whitespace, reordered keys, duplicate keys, and noncanonical numbers", () => {
    const source = fixture();
    const candidates = [
      Buffer.from(`${source.planBytes.toString("utf8")}\n`),
      Buffer.from(
        JSON.stringify({ ...source.plan, schema: source.plan.schema }),
      ),
      Buffer.from(
        source.planBytes
          .toString("utf8")
          .replace(
            '"schema":"iroha-demo-solana-loader-v3-runtime-upgrade-plan/v1",',
            '"schema":"iroha-demo-solana-loader-v3-runtime-upgrade-plan/v1","schema":"iroha-demo-solana-loader-v3-runtime-upgrade-plan/v1",',
          ),
      ),
      Buffer.from(
        source.planBytes
          .toString("utf8")
          .replace('"minFinalizedSlot":100', '"minFinalizedSlot":1e2'),
      ),
    ];
    // Explicitly move schema to the end for the reordered-key candidate.
    const reordered = clone(source.plan);
    delete reordered.schema;
    candidates[1] = Buffer.from(
      JSON.stringify({ ...reordered, schema: source.plan.schema }),
    );
    for (const planBytes of candidates) {
      expect(() =>
        validateSolanaLoaderV3RuntimeUpgradePlan({
          planBytes,
          expectedPlanSha256: solanaSha256(planBytes),
          targetExecutableBytes: source.target,
        }),
      ).toThrow(/canonical JSON encoding/u);
    }
  });

  it("requires exact target bytes rather than a path or encoded string", () => {
    const source = fixture();
    for (const targetExecutableBytes of [
      "artifact.so",
      source.target.toString("base64"),
      [...source.target],
    ]) {
      expect(() =>
        validateSolanaLoaderV3RuntimeUpgradePlan({
          ...reviewedPlan(source.plan),
          targetExecutableBytes,
        }),
      ).toThrow(/exact executable bytes/u);
    }
  });

  it.each([
    ["schema", "bad", /schema/u],
    ["network", "mainnet-beta", /testnet/u],
    ["genesisHash", "bad", /testnet/u],
    ["spillAddress", keypair(40).publicKey.toBase58(), /spill/u],
  ])("rejects invalid top-level pin %s", (field, value, pattern) => {
    const source = fixture();
    const plan = clone(source.plan);
    plan[field] = value;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(plan),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(pattern);
  });

  it("rejects unknown stable-program signer/deployment fields", () => {
    const source = fixture();
    for (const field of [
      "programSigner",
      "programKeypairPath",
      "newProgramId",
      "keypairFile",
    ]) {
      const plan = clone(source.plan);
      plan[field] = "forbidden";
      expect(() =>
        validateSolanaLoaderV3RuntimeUpgradePlan({
          ...reviewedPlan(plan),
          targetExecutableBytes: source.target,
        }),
      ).toThrow(/exact reviewed fields/u);
    }
  });

  it("rejects wrong PDA even if it is a valid public key", () => {
    const source = fixture();
    const plan = clone(source.plan);
    plan.programdataAddress = keypair(41).publicKey.toBase58();
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(plan),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/canonical Loader-v3 PDA/u);
  });

  it("rejects reuse of a stable Program identity as runtime signer or payer", () => {
    const source = fixture();
    for (const field of ["authorityAddress", "payerAddress"]) {
      const plan = clone(source.plan);
      plan[field] = source.program.toBase58();
      if (field === "payerAddress") plan.spillAddress = plan[field];
      expect(() =>
        validateSolanaLoaderV3RuntimeUpgradePlan({
          ...reviewedPlan(plan),
          targetExecutableBytes: source.target,
        }),
      ).toThrow(/stable Program identity/u);
    }
  });

  it.each([
    ["artifactSha256", hash("wrong-artifact")],
    ["executableSha256", hash("wrong-executable")],
    ["codeHash", hash("wrong-code")],
    ["executableLength", 1],
  ])("rejects target pin mismatch %s", (field, value) => {
    const source = fixture();
    const plan = clone(source.plan);
    plan.target[field] = value;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(plan),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/target/iu);
  });

  it("rejects non-ELF and oversized target artifacts", () => {
    const source = fixture();
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(source.plan),
        targetExecutableBytes: Buffer.alloc(source.target.length),
      }),
    ).toThrow(/ELF/u);
    const oversized = elf(10 * 1024 * 1024, 1);
    const oversizedSbfEvidence = sbfEvidenceFor(oversized);
    const plan = clone(source.plan);
    plan.target = {
      artifactSha256: solanaSha256(oversized),
      executableSha256: solanaSha256(oversized),
      codeHash: solanaBlake2b256(oversized),
      executableLength: oversized.length,
      sbfValidatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256: SOLANA_LOADER_V3_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: solanaSha256(
        canonicalSolanaLoaderV3SbfValidationEvidenceBytes(oversizedSbfEvidence),
      ),
    };
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(plan),
        targetExecutableBytes: oversized,
      }),
    ).toThrow(/capacity/u);
  });

  it("requires an exact minimal checked extension only when needed", () => {
    const source = fixture({ beforeLength: 256, targetLength: 11000 });
    expect(
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
      }).extension.additionalBytes,
    ).toBe(10744);
    const missing = clone(source.plan);
    missing.extension = null;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(missing),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/requires/u);
    const excessive = clone(source.plan);
    excessive.extension.additionalBytes += 1;
    excessive.extension.resultProgramdataDataLength += 1;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(excessive),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/minimum exact/u);
    const sufficient = fixture();
    const unnecessary = clone(sufficient.plan);
    unnecessary.extension = {
      additionalBytes: 10240,
      resultProgramdataDataLength:
        unnecessary.before.programdataDataLength + 10240,
    };
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(unnecessary),
        targetExecutableBytes: sufficient.target,
      }),
    ).toThrow(/forbidden/u);
  });

  it("supports the legal SIMD-0431 sub-10KiB extend-to-10MiB edge only", () => {
    const beforeLength =
      SOLANA_MAX_ACCOUNT_DATA_LENGTH -
      SOLANA_PROGRAMDATA_METADATA_LENGTH -
      5000;
    const source = fixture({
      beforeLength,
      targetLength: beforeLength + 100,
    });
    const validated = validateSolanaLoaderV3RuntimeUpgradePlan({
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
    });
    expect(validated.extension.additionalBytes).toBe(5000);
    expect(validated.extension.resultProgramdataDataLength).toBe(
      SOLANA_MAX_ACCOUNT_DATA_LENGTH,
    );
    expect(
      encodeLoaderV3ExtendProgramCheckedData(5000, {
        currentProgramdataDataLength: SOLANA_MAX_ACCOUNT_DATA_LENGTH - 5000,
      }).toString("hex"),
    ).toBe("0900000088130000");
    expect(() => encodeLoaderV3ExtendProgramCheckedData(5000)).toThrow();
  });

  it.each([
    ["maxPacketBytes", 1231],
    ["automaticMutationRetries", 1],
    ["allowNewProgramId", true],
    ["runtimeOnlySigners", false],
  ])("rejects relaxed policy %s", (field, value) => {
    const source = fixture();
    const plan = clone(source.plan);
    plan.policy[field] = value;
    expect(() =>
      validateSolanaLoaderV3RuntimeUpgradePlan({
        ...reviewedPlan(plan),
        targetExecutableBytes: source.target,
      }),
    ).toThrow(/policy/u);
  });
});

describe("actual signed packet boundary selection", () => {
  it("chooses the largest body that really serializes at or below 1232", () => {
    const source = fixture();
    const remaining = Buffer.alloc(4000, 9);
    const latestBlockhash = {
      blockhash: keypair(55).publicKey.toBase58(),
      lastValidBlockHeight: 1000,
    };
    const selected = selectLargestLoaderV3WriteChunk({
      remainingBytes: remaining,
      offset: 7,
      bufferAddress: keypair(56).publicKey,
      authorityAddress: source.authority.publicKey,
      payerSigner: source.payer,
      authoritySigner: source.authority,
      latestBlockhash,
    });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.packetLength).toBeLessThanOrEqual(1232);
    expect(selected.raw.length).toBe(selected.packetLength);
    expect(() => {
      const tx = new Transaction({
        feePayer: source.payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
      }).add(
        buildLoaderV3WriteInstruction({
          bufferAddress: keypair(56).publicKey,
          authorityAddress: source.authority.publicKey,
          offset: 7,
          bytes: remaining.subarray(0, selected.length + 1),
        }),
      );
      tx.sign(source.payer, source.authority);
      tx.serialize();
    }).toThrow(/too large/u);
  });

  it("accounts for signer de-duplication without changing the hard limit", () => {
    const source = fixture();
    const same = selectLargestLoaderV3WriteChunk({
      remainingBytes: Buffer.alloc(4000, 1),
      offset: 0,
      bufferAddress: keypair(57).publicKey,
      authorityAddress: source.authority.publicKey,
      payerSigner: source.authority,
      authoritySigner: source.authority,
      latestBlockhash: {
        blockhash: keypair(58).publicKey.toBase58(),
        lastValidBlockHeight: 1000,
      },
    });
    expect(same.packetLength).toBeLessThanOrEqual(SOLANA_PACKET_DATA_SIZE);
    expect(same.length).toBeGreaterThan(900);
  });
});

describe("read-only runtime upgrade inspection", () => {
  it("reuses exact plan/network/account/capacity checks without signers or claims", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const report = await inspectSolanaLoaderV3RuntimeUpgradeReadiness({
      connection: {},
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
      dependencies: runtime.dependencies,
    });
    expect(report.schema).toBe(
      SOLANA_LOADER_V3_RUNTIME_UPGRADE_READINESS_SCHEMA,
    );
    expect(report.ready).toBe(true);
    expect(report.mutationPerformed).toBe(false);
    expect(report.signerAcquired).toBe(false);
    expect(report.operationClaimed).toBe(false);
    expect(report.planSha256).toBe(source.expectedPlanSha256);
    expect(report.before.programdataSlot).toBe("42");
    expect(report.sbfValidation).toMatchObject({
      valid: true,
      deterministic: true,
      validatorId: SOLANA_LOADER_V3_SBF_VALIDATOR_ID,
      evidenceSha256: source.plan.target.sbfValidationEvidenceSha256,
    });
    expect(report.capacity.sufficientWithoutExtension).toBe(true);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("fails closed when approved SBF validation is missing or rejects a magic-bearing fake", async () => {
    const source = fixture();
    const missing = mockRuntime({ source });
    delete missing.dependencies.validateSbfExecutable;
    await expect(
      inspectSolanaLoaderV3RuntimeUpgradeReadiness({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        dependencies: missing.dependencies,
      }),
    ).rejects.toThrow(/approved deterministic local SBF structural validator/u);
    expect(missing.dependencies.readAccount).not.toHaveBeenCalled();

    const rejected = mockRuntime({ source });
    rejected.dependencies.validateSbfExecutable.mockResolvedValueOnce({
      ...clone(source.sbfEvidence),
      valid: false,
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: rejected.signerFactory,
        dependencies: rejected.dependencies,
      }),
    ).rejects.toThrow(
      /governance-pinned production local SBF structural evidence/u,
    );
    expect(rejected.signerFactory).not.toHaveBeenCalled();
    expect(rejected.dependencies.operationJournal).not.toHaveBeenCalled();
    expect(rejected.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it.each([
    ["debug helper", { buildProfile: "debug" }],
    ["non-JIT helper", { jitOutcome: "unsupported-on-this-host" }],
    ["non-Linux helper", { helperTargetTriple: "aarch64-apple-darwin" }],
    ["diagnostic evidence", { productionEligible: false }],
  ])(
    "rejects %s evidence before any signer or journal access",
    async (_label, patch) => {
      const source = fixture();
      source.sbfEvidence = { ...clone(source.sbfEvidence), ...patch };
      source.plan.target.sbfValidationEvidenceSha256 = solanaSha256(
        canonicalSolanaLoaderV3SbfValidationEvidenceBytes(source.sbfEvidence),
      );
      const runtime = mockRuntime({ source });
      runtime.dependencies.validateSbfExecutable.mockResolvedValueOnce(
        clone(source.sbfEvidence),
      );
      await expect(
        inspectSolanaLoaderV3RuntimeUpgradeReadiness({
          connection: {},
          ...reviewedPlan(source.plan),
          targetExecutableBytes: source.target,
          dependencies: runtime.dependencies,
        }),
      ).rejects.toThrow(/production local SBF structural evidence/u);
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
      expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    },
  );

  it("fails read-only on a stale before hash without touching mutation dependencies", async () => {
    const source = fixture();
    source.plan.before.executableSha256 = hash("stale-before");
    const runtime = mockRuntime({ source });
    await expect(
      inspectSolanaLoaderV3RuntimeUpgradeReadiness({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/before pin/u);
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });
});

describe("runtime-only existing-program upgrade orchestration", () => {
  it("requires exact explicit submit/irreversible confirmation bound to plan hash", async () => {
    const source = fixture();
    for (const confirmation of [
      undefined,
      { ...source.confirmation, submit: false },
      { ...source.confirmation, irreversible: false },
      { ...source.confirmation, planSha256: hash("other plan") },
      { ...source.confirmation, programId: keypair(70).publicKey.toBase58() },
    ]) {
      const runtime = mockRuntime({ source });
      await expect(
        upgradeExistingSolanaLoaderV3ProgramWithRuntime({
          connection: {},
          planBytes: source.planBytes,
          expectedPlanSha256: source.expectedPlanSha256,
          confirmation,
          targetExecutableBytes: source.target,
          signerFactory: runtime.signerFactory,
          dependencies: runtime.dependencies,
        }),
      ).rejects.toThrow(/explicit submit\/irreversible confirmation/u);
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
      expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    }
  });

  it("finalizes every exact transaction and proves target bytes plus zero padding", async () => {
    const source = fixture({ beforeLength: 2048, targetLength: 1500 });
    const runtime = mockRuntime({ source });
    const report = await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
      connection: {},
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.schema).toBe(SOLANA_LOADER_V3_RUNTIME_UPGRADE_REPORT_SCHEMA);
    expect(report.ready).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.programId).toBe(source.program.toBase58());
    expect(report.programdataAddress).toBe(source.programdata.toBase58());
    expect(report.planSha256).toBe(source.expectedPlanSha256);
    expect(report.target.artifactSha256).toBe(solanaSha256(source.target));
    expect(report.after.programdataSlot).toBe(
      String(report.upgrade.finalizedSlot),
    );
    expect(report.after.authorityAddress).toBe(
      source.authority.publicKey.toBase58(),
    );
    expect(report.ephemeralBuffer.writes.length).toBeGreaterThan(1);
    expect(
      report.ephemeralBuffer.writes.every(
        (entry) => entry.packetLength <= SOLANA_PACKET_DATA_SIZE,
      ),
    ).toBe(true);
    expect(runtime.stages.at(0)).toBe("create-and-initialize-buffer");
    expect(runtime.stages.at(-1)).toBe("upgrade-existing-program");
    expect(runtime.journalEvents.at(0)).toMatchObject({
      schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
      type: "claim",
      operationId: source.plan.operationId,
      planSha256: source.expectedPlanSha256,
      bufferAddress: runtime.bufferSigner.publicKey.toBase58(),
      status: "claimed-before-mutation",
      recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
    });
    expect(runtime.journalEvents.at(-1)).toMatchObject({
      type: "complete",
      status: "finalized-and-read-back",
    });
    expect(
      runtime.activity.indexOf("journal:claim:durable-operation-claim"),
    ).toBeLessThan(
      runtime.activity.indexOf("broadcast:create-and-initialize-buffer"),
    );
    for (const stage of runtime.stages) {
      expect(runtime.activity.indexOf(`journal:intent:${stage}`)).toBeLessThan(
        runtime.activity.indexOf(`broadcast:${stage}`),
      );
    }
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "intent",
          status: "prepared-before-broadcast",
          blockhash: expect.any(String),
          lastValidBlockHeight: expect.any(Number),
          messageSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
          packetSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
          packetLength: expect.any(Number),
          expectedSignatures: expect.any(Array),
        }),
      ]),
    );
    expect(JSON.stringify(runtime.journalEvents)).not.toMatch(
      /secretKey|privateKey|mnemonic|keypairPath/u,
    );
    expect(report.secretsZeroized).toBe(true);
    expect(
      runtime.secretViews.every((view) => view.every((byte) => byte === 0)),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/secretKey|keypairPath/u);
  });

  it("uses authority-checked extension and waits for a later slot", async () => {
    const source = fixture({ beforeLength: 256, targetLength: 11000 });
    const runtime = mockRuntime({ source });
    const report = await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
      connection: {},
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.extension.additionalBytes).toBe(10744);
    expect(runtime.stages).toContain("checked-extend-programdata");
    expect(report.after.programdataDataLength).toBe(
      source.plan.extension.resultProgramdataDataLength,
    );
    expect(report.upgrade.finalizedSlot).toBeGreaterThan(
      report.extension.transaction.finalizedSlot,
    );
  });

  it("refuses extension after concurrent ProgramData mutation during buffer writes", async () => {
    const source = fixture({ beforeLength: 256, targetLength: 11000 });
    const runtime = mockRuntime({
      source,
      concurrentProgramdataMutationDuringWrites: true,
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/ProgramData state|before pin|simulation changed/u);
    expect(runtime.stages).not.toContain("checked-extend-programdata");
    expect(runtime.stages).toContain("cleanup-close-buffer");
  });

  it("rejects a magic-bearing target when cluster deploy admission fails before extension", async () => {
    const source = fixture({ beforeLength: 256, targetLength: 11000 });
    const runtime = mockRuntime({ source });
    runtime.dependencies.simulateRawTransaction.mockResolvedValueOnce({
      context: { slot: 120 },
      value: {
        err: { InstructionError: [1, "InvalidAccountData"] },
        logs: [
          `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid account data`,
        ],
      },
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/did not prove exact cluster SBF admission/u);
    expect(runtime.stages).not.toContain("checked-extend-programdata");
    expect(runtime.stages).toContain("cleanup-close-buffer");
  });

  it("requires exact-cluster rollback-sentinel simulation before ProgramData mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    delete runtime.dependencies.simulateRawTransaction;
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/rollback-sentinel simulation dependency/u);
    expect(runtime.stages).not.toContain("upgrade-existing-program");
    expect(runtime.stages).toContain("cleanup-close-buffer");
  });

  it("refuses the real Upgrade when the second rollback-sentinel admission fails", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.simulateRawTransaction.mockImplementation(
      async ({ stage }) => {
        const slot = await runtime.dependencies.getFinalizedSlot();
        if (stage === "upgrade-rollback-sentinel-admission") {
          return {
            context: { slot },
            value: {
              err: { InstructionError: [0, "InvalidAccountData"] },
              logs: [
                `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid account data`,
              ],
            },
          };
        }
        return {
          context: { slot },
          value: {
            err: { InstructionError: [2, "InvalidInstructionData"] },
            logs: [
              `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
              `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid instruction data`,
            ],
          },
        };
      },
    );
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/upgrade rollback-sentinel simulation did not prove/u);
    expect(
      runtime.dependencies.simulateRawTransaction.mock.calls.map(
        ([request]) => request.stage,
      ),
    ).toEqual([
      "deploy-rollback-sentinel-admission",
      "upgrade-rollback-sentinel-admission",
    ]);
    expect(runtime.stages).not.toContain("upgrade-existing-program");
    expect(runtime.stages).toContain("cleanup-close-buffer");
  });

  it("detects buffer tampering during the second rollback-sentinel simulation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.simulateRawTransaction.mockImplementation(
      async ({ stage }) => {
        const slot = await runtime.dependencies.getFinalizedSlot();
        if (
          stage === "upgrade-rollback-sentinel-admission" &&
          runtime.state.buffer
        ) {
          runtime.state.buffer[runtime.state.buffer.length - 1] ^= 1;
        }
        return {
          context: { slot },
          value: {
            err: {
              InstructionError: [
                stage === "deploy-rollback-sentinel-admission" ? 2 : 1,
                "InvalidInstructionData",
              ],
            },
            logs: [
              `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
              `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid instruction data`,
            ],
          },
        };
      },
    );
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/simulation changed buffer/u);
    expect(runtime.stages).not.toContain("upgrade-existing-program");
    expect(runtime.stages).toContain("cleanup-close-buffer");
  });

  it("rejects Solana core or feature-set drift before mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.getClusterVersion.mockResolvedValueOnce({
      "solana-core": "4.1.1",
      "feature-set": 3345198603,
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/differs from the reviewed plan/u);
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("rejects wrong RPC network before acquiring any signer", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.assertNetwork.mockRejectedValueOnce(
      new Error("wrong network"),
    );
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/wrong network/u);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("rejects stale reviewed context before mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source, startSlot: 1001 });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/expired/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", /ownership/u],
    ["tag", /ProgramData state/u],
    ["authority", /authority/u],
    ["slot", /before pin/u],
    ["hash", /before pin/u],
  ])("rejects adversarial before readback: %s", async (kind, pattern) => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const original = runtime.dependencies.readAccount;
    runtime.dependencies.readAccount = vi.fn(async (args) => {
      const result = await original(args);
      if (args.address !== source.programdata.toBase58() || !result?.value) {
        return result;
      }
      if (kind === "owner") result.value.owner = SystemProgram.programId;
      if (kind === "tag") result.value.data.writeUInt32LE(2, 0);
      if (kind === "authority")
        keypair(61).publicKey.toBuffer().copy(result.value.data, 13);
      if (kind === "slot") result.value.data.writeBigUInt64LE(43n, 4);
      if (kind === "hash") result.value.data.at(-1);
      if (kind === "hash") result.value.data[result.value.data.length - 1] ^= 1;
      return result;
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(pattern);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("rejects an already-installed target even when capacity padding differs", async () => {
    const source = fixture({ beforeLength: 2048, targetLength: 900 });
    source.beforeExecutable = Buffer.concat([
      source.target,
      Buffer.alloc(2048 - source.target.length),
    ]);
    source.plan.before.executableSha256 = solanaSha256(source.beforeExecutable);
    source.plan.before.codeHash = solanaBlake2b256(source.beforeExecutable);
    const runtime = mockRuntime({ source });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/same-target/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("closes an initialized buffer after populated-buffer hash mismatch", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source, corruptPopulatedBuffer: true });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/buffer/u);
    expect(runtime.stages).toContain("cleanup-close-buffer");
    expect(runtime.state.buffer).toBeNull();
    expect(
      runtime.secretViews
        .slice(0, 3)
        .every((view) => view.every((byte) => byte === 0)),
    ).toBe(true);
  });

  it("refuses to close a substituted same-authority buffer with the wrong exact size", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source, corruptPopulatedBuffer: true });
    const defaultRead = runtime.dependencies.readAccount;
    let substituted = false;
    runtime.dependencies.readAccount = vi.fn(async (args) => {
      if (
        !substituted &&
        args.label === "Ephemeral Loader-v3 buffer cleanup" &&
        runtime.state.buffer
      ) {
        runtime.state.buffer = Buffer.concat([
          runtime.state.buffer,
          Buffer.from([0]),
        ]);
        substituted = true;
      }
      return defaultRead(args);
    });
    let failure;
    try {
      await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      failure.errors.some((error) => /exact data length/u.test(error.message)),
    ).toBe(true);
    expect(runtime.state.buffer).not.toBeNull();
    expect(runtime.stages).not.toContain("cleanup-close-buffer");
  });

  it("preserves the orphan buffer when the authority lease expires during cleanup WAL", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source, corruptPopulatedBuffer: true });
    const defaultJournal =
      runtime.dependencies.operationJournal.getMockImplementation();
    runtime.dependencies.operationJournal.mockImplementation(async (event) => {
      const response = await defaultJournal(event);
      if (event.type === "intent" && event.stage === "cleanup-close-buffer") {
        runtime.advanceSlot(800);
      }
      return response;
    });
    let failure;
    try {
      await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      failure.errors.some((error) =>
        /authority lease has expired/u.test(error.message),
      ),
    ).toBe(true);
    expect(runtime.stages).not.toContain("cleanup-close-buffer");
    expect(runtime.state.buffer).not.toBeNull();
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resolution",
          stage: "cleanup-close-buffer",
          status: "aborted-before-broadcast",
          expectedSignatures: expect.any(Array),
        }),
      ]),
    );
  });

  it("surfaces cleanup failure together with the primary failure", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      corruptPopulatedBuffer: true,
      cleanupFails: true,
    });
    let error;
    try {
      await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toHaveLength(2);
    expect(error.message).toMatch(/failure handling was incomplete/u);
    expect(
      runtime.secretViews
        .slice(0, 3)
        .every((view) => view.every((byte) => byte === 0)),
    ).toBe(true);
  });

  it("journals cleanup intent before broadcast and preserves an ambiguous buffer", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      corruptPopulatedBuffer: true,
      failStage: "cleanup-close-buffer",
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/failure handling was incomplete/u);
    expect(runtime.state.buffer).not.toBeNull();
    expect(
      runtime.activity.indexOf("journal:intent:cleanup-close-buffer"),
    ).toBeLessThan(runtime.activity.indexOf("broadcast:cleanup-close-buffer"));
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "intent",
          stage: "cleanup-close-buffer",
          status: "prepared-before-broadcast",
          expectedSignature: expect.any(String),
          messageSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
          packetSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        }),
        expect.objectContaining({
          type: "ambiguous",
          stage: "cleanup-close-buffer",
          status: "resolution-required",
          recoveryAction: "resolve-signature-through-finalization-or-expiry",
        }),
      ]),
    );
    expect(runtime.journalEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "stage",
          stage: "cleanup-close-buffer",
          status: "finalized-closed",
        }),
      ]),
    );
  });

  it.each(["signature", "message", "meta"])(
    "rejects %s mismatch in fetched finalized transaction",
    async (corruptTransaction) => {
      const source = fixture();
      const runtime = mockRuntime({ source, corruptTransaction });
      await expect(
        upgradeExistingSolanaLoaderV3ProgramWithRuntime({
          connection: {},
          ...reviewedPlan(source.plan),
          targetExecutableBytes: source.target,
          signerFactory: runtime.signerFactory,
          dependencies: runtime.dependencies,
        }),
      ).rejects.toThrow(/transaction readback|signature/u);
      expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(2);
      expect(runtime.stages).toEqual([
        "create-and-initialize-buffer",
        "cleanup-close-buffer",
      ]);
    },
  );

  it("never lets caller messageBytes shadow a mismatched fetched transaction.message", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source, corruptTransaction: "message" });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/transaction readback/u);
    expect(runtime.stages).toEqual([
      "create-and-initialize-buffer",
      "cleanup-close-buffer",
    ]);
  });

  it("does not automatically retry an ambiguous mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      failStage: "create-and-initialize-buffer",
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/forced/u);
    expect(runtime.stages).toEqual(["create-and-initialize-buffer"]);
  });

  it("does not treat an absent buffer as closed while prepared signature is unresolved", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      failStage: "create-and-initialize-buffer",
    });
    delete runtime.dependencies.resolveAmbiguousTransaction;
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/failure handling was incomplete/u);
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ambiguous",
          status: "resolution-required",
        }),
      ]),
    );
    expect(runtime.journalEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "cleanup-buffer-not-present" }),
      ]),
    );
  });

  it("resolves delayed acceptance from WAL signature without rebroadcast", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.broadcastFinalized.mockImplementationOnce(
      async ({ stage }) => {
        runtime.stages.push(stage);
        runtime.state.buffer = bufferData({
          authority: source.authority.publicKey,
          executable: Buffer.alloc(source.target.length),
        });
        runtime.advanceSlot(2);
        throw new Error("RPC disconnected after accepting transaction");
      },
    );
    runtime.dependencies.resolveAmbiguousTransaction.mockImplementationOnce(
      async ({ intent, rawTransaction }) => {
        const slot = await runtime.dependencies.getFinalizedSlot();
        return {
          status: "finalized",
          submittedResult: {
            signature: intent.expectedPrimarySignature,
            confirmation: { value: { err: null } },
            signatureStatus: {
              err: null,
              confirmationStatus: "finalized",
              slot,
            },
            transactionReadback: {
              slot,
              meta: { err: null },
              messageBytes: Transaction.from(rawTransaction).serializeMessage(),
              transaction: {
                signatures: [...intent.expectedSignatures],
                message: {
                  serialize: () =>
                    Transaction.from(rawTransaction).serializeMessage(),
                },
              },
            },
          },
        };
      },
    );
    const report = await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
      connection: {},
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.ready).toBe(true);
    expect(
      runtime.journalEvents.some(
        (event) => event.status === "delayed-finalization-resolved",
      ),
    ).toBe(true);
    expect(
      runtime.stages.filter(
        (stage) => stage === "create-and-initialize-buffer",
      ),
    ).toHaveLength(1);
  });

  it("never rebroadcasts when a normal delayed-finalization resolver omits readback", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      failStage: "create-and-initialize-buffer",
    });
    runtime.dependencies.resolveAmbiguousTransaction.mockResolvedValueOnce({
      status: "finalized",
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/failure handling was incomplete/u);
    expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(1);
    expect(runtime.stages).toEqual(["create-and-initialize-buffer"]);
  });

  it("rechecks the bounded authority lease after WAL persistence and before Upgrade broadcast", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const defaultJournal =
      runtime.dependencies.operationJournal.getMockImplementation();
    runtime.dependencies.operationJournal.mockImplementation(async (event) => {
      const response = await defaultJournal(event);
      if (
        event.type === "intent" &&
        event.stage === "upgrade-existing-program"
      ) {
        runtime.advanceSlot(800);
      }
      return response;
    });
    let failure;
    try {
      await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      failure.errors.every((error) =>
        /authority lease has expired/u.test(error.message),
      ),
    ).toBe(true);
    expect(runtime.stages).not.toContain("upgrade-existing-program");
    expect(runtime.stages).not.toContain("cleanup-close-buffer");
    expect(runtime.state.buffer).not.toBeNull();
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resolution",
          stage: "upgrade-existing-program",
          status: "aborted-before-broadcast",
          expectedSignatures: expect.any(Array),
          blockhash: expect.any(String),
          packetSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        }),
      ]),
    );
  });

  it("requires an atomic one-shot operation claim before first mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.operationJournal.mockResolvedValueOnce({
      durable: true,
      claimed: false,
      journalId: "durable-journal-1",
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/already claimed|ambiguous/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    expect(runtime.secretViews[2].every((byte) => byte === 0)).toBe(true);
  });

  it("fails closed and zeroizes signers when durable claim persistence throws", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.operationJournal.mockRejectedValueOnce(
      new Error("journal storage unavailable"),
    );
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/journal storage unavailable/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    expect(runtime.secretViews[2].every((byte) => byte === 0)).toBe(true);
  });

  it("rejects an unbounded or non-public durable journal identifier", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.operationJournal.mockResolvedValueOnce({
      durable: true,
      claimed: true,
      journalId: "sensitive/id with spaces",
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/bounded public identifier/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("requires bounded authority-global lease and cross-host custody attestation", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.operationJournal.mockResolvedValueOnce({
      durable: true,
      claimed: true,
      journalId: "durable-journal-1",
      exclusiveAuthorityLease: true,
      authorityCustodyScope: "same-host-exclusive",
      crossHostAuthorityUseExcluded: false,
      leaseId: "authority-lease-1",
      leaseExpiresAtFinalizedSlot: 900,
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/authority lease and custody attestation/u);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    expect(runtime.secretViews[2].every((byte) => byte === 0)).toBe(true);
  });

  it.each([
    ["per-operation scope", { authorityLeaseScope: "solana-testnet:forged" }],
    ["non-initial generation", { leaseGeneration: 2 }],
    ["forged capability", { signerCapability: "forged-capability" }],
  ])("rejects %s before signer acquisition", async (_label, override) => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.dependencies.operationJournal.mockResolvedValueOnce({
      durable: true,
      claimed: true,
      journalId: "durable-journal-1",
      exclusiveAuthorityLease: true,
      authorityCustodyScope: "same-host-exclusive",
      crossHostAuthorityUseExcluded: true,
      leaseId: "authority-lease-1",
      leaseGeneration: 1,
      authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
        source.authority.publicKey.toBase58(),
      ),
      leaseExpiresAtFinalizedSlot: 900,
      signerCapability: runtime.signerCapability,
      ...override,
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/authority lease and custody attestation/u);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("passes the exact opaque capability and global fencing tuple to every signer", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const expectedScope = solanaLoaderV3AuthorityGlobalLeaseScope(
      source.authority.publicKey.toBase58(),
    );
    runtime.signerFactory.mockImplementation(
      async ({ role, authorityLease }) => {
        expect(authorityLease).toMatchObject({
          leaseId: "authority-lease-1",
          leaseGeneration: 1,
          authorityLeaseScope: expectedScope,
          leaseExpiresAtFinalizedSlot: 900,
          network: "solana-testnet",
          genesisHash: SOLANA_TESTNET_GENESIS_HASH,
          authorityAddress: source.authority.publicKey.toBase58(),
          programId: source.program.toBase58(),
          operationId: source.plan.operationId,
        });
        expect(authorityLease.signerCapability).toBe(runtime.signerCapability);
        return role === "authority" ? source.authority : source.payer;
      },
    );
    const report = await upgradeExistingSolanaLoaderV3ProgramWithRuntime({
      connection: {},
      ...reviewedPlan(source.plan),
      targetExecutableBytes: source.target,
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.journal).toMatchObject({
      authorityLeaseId: "authority-lease-1",
      authorityLeaseGeneration: 1,
      authorityLeaseScope: expectedScope,
    });
    for (const event of runtime.journalEvents.slice(1)) {
      expect(event).toMatchObject({
        authorityLeaseId: "authority-lease-1",
        authorityLeaseGeneration: 1,
        authorityLeaseScope: expectedScope,
      });
    }
    expect(JSON.stringify(runtime.journalEvents)).not.toContain(
      "initial-capability",
    );
  });

  it("preserves the buffer for recovery when finalized-stage journaling fails", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    let failedStageOnce = false;
    runtime.dependencies.operationJournal.mockImplementation(async (event) => {
      runtime.journalEvents.push(structuredClone(event));
      if (
        event.type === "stage" &&
        event.stage === "create-and-initialize-buffer" &&
        !failedStageOnce
      ) {
        failedStageOnce = true;
        throw new Error("forced finalized-stage journal failure");
      }
      return event.type === "claim"
        ? {
            durable: true,
            claimed: true,
            journalId: "durable-journal-1",
            exclusiveAuthorityLease: true,
            authorityCustodyScope: "same-host-exclusive",
            crossHostAuthorityUseExcluded: true,
            leaseId: "authority-lease-1",
            leaseGeneration: 1,
            authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
              source.authority.publicKey.toBase58(),
            ),
            leaseExpiresAtFinalizedSlot: 900,
            signerCapability: runtime.signerCapability,
          }
        : {
            durable: true,
            recorded: true,
            journalId: "durable-journal-1",
          };
    });
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/failure handling was incomplete/u);
    expect(runtime.stages).toEqual(["create-and-initialize-buffer"]);
    expect(runtime.state.buffer).not.toBeNull();
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "failure", status: "failed-closed" }),
        expect.objectContaining({
          type: "intent",
          stage: "create-and-initialize-buffer",
          status: "prepared-before-broadcast",
        }),
      ]),
    );
    expect(runtime.journalEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "cleanup-close-buffer" }),
      ]),
    );
  });

  it("fails closed when no durable external operation journal exists", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    delete runtime.dependencies.operationJournal;
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/durable external operation journal/u);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });

  it("rejects a runtime signer that differs from the independently pinned address", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.signerFactory.mockImplementationOnce(async () => keypair(90));
    await expect(
      upgradeExistingSolanaLoaderV3ProgramWithRuntime({
        connection: {},
        ...reviewedPlan(source.plan),
        targetExecutableBytes: source.target,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/does not match/u);
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
  });
});

describe("journaled orphan-buffer recovery", () => {
  it("requires durable authorization, closes the exact authority-owned buffer, and zeroizes", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.state.buffer = bufferData({
      authority: source.authority.publicKey,
      executable: Buffer.alloc(source.target.length, 7),
    });
    enableRecoveryJournal(runtime);
    const claimEvent = recoveryClaim(source);
    const report = await recoverJournaledSolanaLoaderV3BufferWithRuntime({
      connection: {},
      ...recoveryInput(source, claimEvent),
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.schema).toBe(SOLANA_LOADER_V3_RUNTIME_RECOVERY_REPORT_SCHEMA);
    expect(report.mode).toBe("journaled-buffer-finalized-close");
    expect(report.planSha256).toBe(source.expectedPlanSha256);
    expect(report).toMatchObject({
      programId: source.program.toBase58(),
      programdataAddress: source.programdata.toBase58(),
      target: {
        executableLength: source.target.length,
        artifactSha256: solanaSha256(source.target),
        executableSha256: solanaSha256(source.target),
        codeHash: solanaBlake2b256(source.target),
      },
    });
    expect(report.bufferAddress).toBe(
      runtime.bufferSigner.publicKey.toBase58(),
    );
    expect(report.secretsZeroized).toBe(true);
    expect(runtime.state.buffer).toBeNull();
    expect(runtime.stages).toEqual(["recover-close-orphan-buffer"]);
    expect(runtime.journalEvents.at(0)).toMatchObject({
      type: "recovery-start",
      status: "authorized-before-signer-acquisition",
    });
    expect(runtime.journalEvents.at(-1)).toMatchObject({
      type: "recovery-complete",
      status: "finalized-closed",
    });
    expect(
      runtime.secretViews
        .slice(0, 2)
        .every((view) => view.every((byte) => byte === 0)),
    ).toBe(true);
    expect(JSON.stringify(runtime.journalEvents)).not.toMatch(
      /secretKey|privateKey|mnemonic|keypairPath/u,
    );
  });

  it("treats an absent buffer as ambiguous until ProgramData is inspected", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    enableRecoveryJournal(runtime);
    const report = await recoverJournaledSolanaLoaderV3BufferWithRuntime({
      connection: {},
      ...recoveryInput(source),
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.ready).toBe(false);
    expect(report.mode).toBe(
      "journaled-buffer-absent-programdata-inspection-required",
    );
    expect(report).toMatchObject({
      programId: source.program.toBase58(),
      programdataAddress: source.programdata.toBase58(),
      target: {
        executableLength: source.target.length,
        artifactSha256: solanaSha256(source.target),
        executableSha256: solanaSha256(source.target),
        codeHash: solanaBlake2b256(source.target),
      },
    });
    expect(report.transaction).toBeNull();
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    expect(runtime.journalEvents.at(-1)).toMatchObject({
      type: "recovery-complete",
      status: "programdata-inspection-required",
      recoveryAction: "inspect-finalized-programdata-before-any-retry",
    });
  });

  it("rejects wrong plan hash and journal denial before signer acquisition", async () => {
    const source = fixture();
    const wrongHashRuntime = mockRuntime({ source });
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source),
        expectedPlanSha256: hash("wrong plan"),
        signerFactory: wrongHashRuntime.signerFactory,
        dependencies: wrongHashRuntime.dependencies,
      }),
    ).rejects.toThrow(/independently supplied SHA-256/u);
    expect(
      wrongHashRuntime.dependencies.operationJournal,
    ).not.toHaveBeenCalled();
    expect(wrongHashRuntime.signerFactory).not.toHaveBeenCalled();

    const deniedRuntime = mockRuntime({ source });
    enableRecoveryJournal(deniedRuntime, { authorized: false });
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source),
        signerFactory: deniedRuntime.signerFactory,
        dependencies: deniedRuntime.dependencies,
      }),
    ).rejects.toThrow(/did not authorize/u);
    expect(deniedRuntime.signerFactory).not.toHaveBeenCalled();
    expect(
      deniedRuntime.dependencies.broadcastFinalized,
    ).not.toHaveBeenCalled();
  });

  it("rejects claim tampering and a foreign buffer authority", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const tampered = recoveryClaim(source);
    tampered.bufferAddress = source.program.toBase58();
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source, tampered),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/differ/u);

    const foreignRuntime = mockRuntime({ source });
    foreignRuntime.state.buffer = bufferData({
      authority: keypair(66).publicKey,
      executable: Buffer.alloc(source.target.length, 7),
    });
    enableRecoveryJournal(foreignRuntime);
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source),
        signerFactory: foreignRuntime.signerFactory,
        dependencies: foreignRuntime.dependencies,
      }),
    ).rejects.toThrow(/authority/u);
    expect(foreignRuntime.signerFactory).not.toHaveBeenCalled();
    expect(
      foreignRuntime.dependencies.broadcastFinalized,
    ).not.toHaveBeenCalled();
  });

  it("rejects coherent plan/claim substitution and stale independent claim digest", async () => {
    const reviewed = fixture();
    const substitutedPlan = fixture({ targetLength: 901 });
    const claimFromReviewedPlan = recoveryClaim(reviewed);
    const runtime = mockRuntime({ source: substitutedPlan });
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(substitutedPlan, claimFromReviewedPlan),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(
      /not a recovery claim|does not exactly match every canonical plan/u,
    );

    const originalInput = recoveryInput(reviewed);
    const changedBufferClaim = recoveryClaim(reviewed, keypair(79).publicKey);
    const changedClaimBytes =
      canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes(changedBufferClaim);
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...originalInput,
        claimEventBytes: changedClaimBytes,
        // Keep the independently reviewed digest for the original buffer.
        expectedClaimEventSha256: originalInput.expectedClaimEventSha256,
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/independently supplied hash/u);
  });

  it("rejects noncanonical claim bytes even under a recomputed digest", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const canonical = recoveryInput(source);
    const claimEventBytes = Buffer.from(
      `${canonical.claimEventBytes.toString("utf8")}\n`,
    );
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...canonical,
        claimEventBytes,
        expectedClaimEventSha256: solanaSha256(claimEventBytes),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/canonical JSON encoding/u);
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
  });

  it("rejects a canonical claim whose finalized context slot is a numeric string", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    const claimEvent = recoveryClaim(source);
    claimEvent.finalizedContextSlot = "100";
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source, claimEvent),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/not a recovery claim/u);
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
  });

  it.each([
    ["non-recovery generation", { leaseGeneration: 1 }],
    ["non-global scope", { authorityLeaseScope: "solana-testnet:forged" }],
    ["forged capability", { signerCapability: "forged-capability" }],
  ])(
    "rejects recovery %s before signer acquisition",
    async (_label, override) => {
      const source = fixture();
      const runtime = mockRuntime({ source });
      runtime.state.buffer = bufferData({
        authority: source.authority.publicKey,
        executable: Buffer.alloc(source.target.length),
      });
      enableRecoveryJournal(runtime);
      const defaultJournal =
        runtime.dependencies.operationJournal.getMockImplementation();
      runtime.dependencies.operationJournal.mockImplementation(
        async (event) => {
          const response = await defaultJournal(event);
          return event.type === "recovery-start"
            ? { ...response, ...override }
            : response;
        },
      );
      await expect(
        recoverJournaledSolanaLoaderV3BufferWithRuntime({
          connection: {},
          ...recoveryInput(source),
          signerFactory: runtime.signerFactory,
          dependencies: runtime.dependencies,
        }),
      ).rejects.toThrow(/did not authorize/u);
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    },
  );

  it("passes the exact recovery capability and next-generation global fence to signers", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.state.buffer = bufferData({
      authority: source.authority.publicKey,
      executable: Buffer.alloc(source.target.length),
    });
    enableRecoveryJournal(runtime);
    const expectedScope = solanaLoaderV3AuthorityGlobalLeaseScope(
      source.authority.publicKey.toBase58(),
    );
    runtime.signerFactory.mockImplementation(
      async ({ role, recoveryAuthorization }) => {
        expect(recoveryAuthorization).toMatchObject({
          journalId: "durable-journal-1",
          leaseId: "authority-lease-recovery-2",
          leaseGeneration: 2,
          authorityLeaseScope: expectedScope,
          network: "solana-testnet",
          genesisHash: SOLANA_TESTNET_GENESIS_HASH,
          authorityAddress: source.authority.publicKey.toBase58(),
          programId: source.program.toBase58(),
          operationId: source.plan.operationId,
        });
        expect(recoveryAuthorization.signerCapability).toBe(
          runtime.recoverySignerCapability,
        );
        return role === "authority" ? source.authority : source.payer;
      },
    );
    const report = await recoverJournaledSolanaLoaderV3BufferWithRuntime({
      connection: {},
      ...recoveryInput(source),
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.journal).toMatchObject({
      authorityLeaseId: "authority-lease-recovery-2",
      authorityLeaseGeneration: 2,
      authorityLeaseScope: expectedScope,
    });
    for (const event of runtime.journalEvents.slice(1)) {
      expect(event).toMatchObject({
        authorityLeaseId: "authority-lease-recovery-2",
        authorityLeaseGeneration: 2,
        authorityLeaseScope: expectedScope,
      });
    }
    expect(JSON.stringify(runtime.journalEvents)).not.toContain(
      "recovery-capability",
    );
  });

  it("refuses recovery-close for a substituted same-authority buffer size", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.state.buffer = bufferData({
      authority: source.authority.publicKey,
      executable: Buffer.alloc(source.target.length + 1),
    });
    enableRecoveryJournal(runtime);
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/exact data length/u);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
    expect(runtime.state.buffer).not.toBeNull();
  });

  it.each([
    ["changes", "changed before recovery broadcast"],
    ["disappears", "disappeared before recovery broadcast"],
  ])(
    "aborts without broadcast when the orphan buffer %s after recovery WAL",
    async (mode, message) => {
      const source = fixture();
      const runtime = mockRuntime({ source });
      runtime.state.buffer = bufferData({
        authority: source.authority.publicKey,
        executable: Buffer.alloc(source.target.length),
      });
      enableRecoveryJournal(runtime);
      const defaultJournal =
        runtime.dependencies.operationJournal.getMockImplementation();
      runtime.dependencies.operationJournal.mockImplementation(
        async (event) => {
          const response = await defaultJournal(event);
          if (event.type === "recovery-intent") {
            if (mode === "changes") {
              runtime.state.buffer[runtime.state.buffer.length - 1] ^= 1;
            } else {
              runtime.state.buffer = null;
            }
          }
          return response;
        },
      );
      await expect(
        recoverJournaledSolanaLoaderV3BufferWithRuntime({
          connection: {},
          ...recoveryInput(source),
          signerFactory: runtime.signerFactory,
          dependencies: runtime.dependencies,
        }),
      ).rejects.toThrow(message);
      expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
      expect(runtime.journalEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "recovery-resolution",
            stage: "recover-close-orphan-buffer",
            status: "aborted-before-broadcast",
            recoveryAction: "inspect-finalized-programdata-before-any-retry",
          }),
        ]),
      );
    },
  );

  it("resolves delayed recovery-close acceptance exactly without rebroadcast", async () => {
    const source = fixture();
    const runtime = mockRuntime({ source });
    runtime.state.buffer = bufferData({
      authority: source.authority.publicKey,
      executable: Buffer.alloc(source.target.length),
    });
    enableRecoveryJournal(runtime);
    runtime.dependencies.broadcastFinalized.mockImplementationOnce(
      async ({ stage }) => {
        runtime.stages.push(stage);
        runtime.state.buffer = null;
        runtime.advanceSlot(2);
        throw new Error("RPC disconnected after accepting recovery close");
      },
    );
    runtime.dependencies.resolveAmbiguousTransaction.mockImplementationOnce(
      async ({ intent, rawTransaction }) => {
        const slot = await runtime.dependencies.getFinalizedSlot();
        const fetched = Transaction.from(rawTransaction);
        return {
          status: "finalized",
          submittedResult: {
            signature: intent.expectedPrimarySignature,
            confirmation: { value: { err: null } },
            signatureStatus: {
              err: null,
              confirmationStatus: "finalized",
              slot,
            },
            transactionReadback: {
              slot,
              meta: { err: null },
              messageBytes: Buffer.from([0]),
              transaction: {
                signatures: [...intent.expectedSignatures],
                message: { serialize: () => fetched.serializeMessage() },
              },
            },
          },
        };
      },
    );
    const report = await recoverJournaledSolanaLoaderV3BufferWithRuntime({
      connection: {},
      ...recoveryInput(source),
      signerFactory: runtime.signerFactory,
      dependencies: runtime.dependencies,
    });
    expect(report.ready).toBe(true);
    expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(1);
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "recovery-resolution",
          status: "delayed-finalization-resolved",
          expectedSignatures: expect.any(Array),
          packetSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        }),
        expect.objectContaining({
          type: "recovery-complete",
          status: "finalized-closed",
          expectedSignatures: expect.any(Array),
        }),
      ]),
    );
  });

  it("never rebroadcasts when delayed recovery evidence is missing", async () => {
    const source = fixture();
    const runtime = mockRuntime({
      source,
      failStage: "recover-close-orphan-buffer",
    });
    runtime.state.buffer = bufferData({
      authority: source.authority.publicKey,
      executable: Buffer.alloc(source.target.length),
    });
    enableRecoveryJournal(runtime);
    runtime.dependencies.resolveAmbiguousTransaction.mockResolvedValueOnce({
      status: "finalized",
    });
    await expect(
      recoverJournaledSolanaLoaderV3BufferWithRuntime({
        connection: {},
        ...recoveryInput(source),
        signerFactory: runtime.signerFactory,
        dependencies: runtime.dependencies,
      }),
    ).rejects.toThrow(/exact resolution failed/u);
    expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(1);
    expect(runtime.state.buffer).not.toBeNull();
    expect(runtime.journalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "recovery-ambiguous",
          status: "resolution-required",
        }),
      ]),
    );
  });
});

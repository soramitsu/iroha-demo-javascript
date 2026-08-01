// @vitest-environment node
/* global BigInt */
import { createHash } from "node:crypto";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_FEATURE_PROGRAM_ID,
  SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
  SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA,
  SOLANA_LOADER_V3_FRESH_DEPLOY_REPORT_SCHEMA,
  SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS,
  SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_EVIDENCE_SCHEMA,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_SCOPE,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
  SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
  SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
  SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER,
  SolanaLoaderV3FreshDeployAmbiguityError,
  buildSolanaLoaderV3FreshDeployPlan,
  canonicalSolanaLoaderV3FreshDeployPlanBytes,
  canonicalSolanaLoaderV3FreshDeployReportBytes,
  canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes,
  deployFreshImmutableSolanaSccpPrograms,
  validateSolanaLoaderV3FreshDeployPlan,
  validateSolanaLoaderV3FreshDeployReport,
  verifySolanaLoaderV3FreshDeployReportTransactions,
} from "../scripts/solana-loader-v3-fresh-deploy.mjs";
import { runSolanaLoaderV3FreshDeployLocalAcceptance } from "../scripts/solana-loader-v3-fresh-deploy-local-acceptance.mjs";
import {
  SOLANA_BUFFER_METADATA_LENGTH,
  SOLANA_PACKET_DATA_SIZE,
  SOLANA_PROGRAMDATA_METADATA_LENGTH,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_UPGRADEABLE_LOADER_ID,
  solanaBlake2b256,
  solanaSha256,
} from "../scripts/solana-loader-v3-runtime.mjs";

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const hash = (label) => `0x${createHash("sha256").update(label).digest("hex")}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
let seedIndex = 1;
const randomTestKeypair = () => {
  seedIndex += 1;
  return Keypair.fromSeed(
    Uint8Array.from(
      { length: 32 },
      (_, index) => (seedIndex * 17 + index) & 0xff,
    ),
  );
};

const sbfElf = (length, byte, version = 3) => {
  const bytes = Buffer.alloc(length, byte);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(bytes);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes[6] = 1;
  bytes.writeUInt16LE(3, 16);
  bytes.writeUInt16LE(247, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt32LE(version, 48);
  bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(5, 68);
  return bytes;
};

const featureData = (activationSlot = 50) => {
  const bytes = Buffer.alloc(9);
  bytes[0] = 1;
  bytes.writeBigUInt64LE(BigInt(activationSlot), 1);
  return bytes;
};

const RUSTC_IDENTITY =
  "rustc 1.89.0 (29483883e 2025-08-04);host:x86_64-unknown-linux-gnu;LLVM:20.1.7";
const evidenceFor = (artifact) => ({
  schema: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_EVIDENCE_SCHEMA,
  valid: true,
  deterministic: true,
  validationScope: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_SCOPE,
  exactClusterAdmission: false,
  productionEligible: true,
  sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
  validatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
  validatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
  policySha256: SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
  artifactSha256: solanaSha256(artifact),
  codeHash: solanaBlake2b256(artifact),
  executableLength: artifact.length,
  helperBinarySha256: hash("v3-helper"),
  helperTargetTriple: "x86_64-unknown-linux-gnu",
  jitOutcome: "compiled",
  buildProfile: "release",
  validatorSourceBundleSha256: hash("v3-validator-source"),
  cargoLockSha256: hash("v3-validator-lock"),
  rustcIdentity: RUSTC_IDENTITY,
  rustcIdentitySha256: solanaSha256(Buffer.from(RUSTC_IDENTITY, "utf8")),
  resourceLimits: "unix-rlimit-v1",
  checks: [...SOLANA_LOADER_V3_FRESH_REQUIRED_SBF_VALIDATION_CHECKS],
});

const runtimeSource = (signer, overrides = {}) => ({
  signer,
  secretViews: [signer._keypair.secretKey],
  runtimeOnly: true,
  generatedAtRuntime: true,
  fileBacked: false,
  entropySource: "os-csprng",
  ...overrides,
});

const reviewed = (plan) => {
  const planBytes = canonicalSolanaLoaderV3FreshDeployPlanBytes(plan);
  return { planBytes, expectedPlanSha256: solanaSha256(planBytes) };
};

const fixture = ({
  elfVersion = 3,
  artifactLengths = {
    nativeVerifier: 360,
    destination: 390,
    source: 420,
  },
} = {}) => {
  const payer = randomTestKeypair();
  const authority = randomTestKeypair();
  const artifacts = {
    nativeVerifier: sbfElf(artifactLengths.nativeVerifier, 0x31, elfVersion),
    destination: sbfElf(artifactLengths.destination, 0x42, elfVersion),
    source: sbfElf(artifactLengths.source, 0x53, elfVersion),
  };
  const signerSources = new Map([
    ["payer", runtimeSource(payer)],
    ["deploymentAuthority", runtimeSource(authority)],
  ]);
  const evidenceByRole = {};
  const programs = SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => {
    const program = randomTestKeypair();
    const buffer = randomTestKeypair();
    const programId = program.publicKey.toBase58();
    const programdataAddress = PublicKey.findProgramAddressSync(
      [program.publicKey.toBuffer()],
      LOADER,
    )[0].toBase58();
    signerSources.set(`program:${role}`, runtimeSource(program));
    signerSources.set(`buffer:${role}`, runtimeSource(buffer));
    const artifact = artifacts[role];
    const evidence = evidenceFor(artifact);
    evidenceByRole[role] = evidence;
    return {
      role,
      programId,
      programdataAddress,
      bufferAddress: buffer.publicKey.toBase58(),
      artifactSha256: solanaSha256(artifact),
      executableSha256: solanaSha256(artifact),
      codeHash: solanaBlake2b256(artifact),
      executableLength: artifact.length,
      maxDataLength: artifact.length,
      sbpfVersion: "V3",
      sbfValidatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256:
        SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: solanaSha256(
        canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes(evidence),
      ),
    };
  });
  const activeFeatureData = featureData();
  const plan = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA,
    operationId: hash(`fresh-operation-${seedIndex}`),
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    payerAddress: payer.publicKey.toBase58(),
    deploymentAuthorityAddress: authority.publicKey.toBase58(),
    context: {
      minFinalizedSlot: 100,
      expiresAtFinalizedSlot: 1000,
      solanaCoreVersion: "4.1.0",
      featureSet: 3345198602,
      sbpfV3EnableFeatureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      sbpfV3EnableFeatureActivationSlot: 50,
      sbpfV3EnableFeatureAccountDataSha256: solanaSha256(activeFeatureData),
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
  const review = reviewed(plan);
  const confirmation = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
    action: "fresh-deploy-exact-immutable-solana-sccp-programs",
    submit: true,
    irreversible: true,
    operationId: plan.operationId,
    planSha256: review.expectedPlanSha256,
    network: "solana-testnet",
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    programIds: Object.fromEntries(
      programs.map(({ role, programId }) => [role, programId]),
    ),
    acknowledgePermanentProgramIds: true,
    acknowledgeOneWayAuthorityRevocation: true,
  };
  return {
    payer,
    authority,
    artifacts,
    signerSources,
    evidenceByRole,
    activeFeatureData,
    plan,
    confirmation,
    ...review,
  };
};

const fixtureWithAliasedArtifacts = (source, roles) => {
  const sharedArtifact = Buffer.from(source.artifacts[roles[0]]);
  const artifacts = { ...source.artifacts };
  const evidenceByRole = { ...source.evidenceByRole };
  const plan = clone(source.plan);
  for (const role of roles) {
    artifacts[role] = Buffer.from(sharedArtifact);
    const evidence = evidenceFor(artifacts[role]);
    evidenceByRole[role] = evidence;
    const entry = plan.programs.find((program) => program.role === role);
    entry.artifactSha256 = solanaSha256(artifacts[role]);
    entry.executableSha256 = entry.artifactSha256;
    entry.codeHash = solanaBlake2b256(artifacts[role]);
    entry.executableLength = artifacts[role].length;
    entry.maxDataLength = artifacts[role].length;
    entry.sbfValidationEvidenceSha256 = solanaSha256(
      canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes(evidence),
    );
  }
  const review = reviewed(plan);
  return {
    ...source,
    artifacts,
    evidenceByRole,
    plan,
    confirmation: {
      ...source.confirmation,
      planSha256: review.expectedPlanSha256,
    },
    ...review,
  };
};

const builderInput = (source) => ({
  operationId: source.plan.operationId,
  payerAddress: source.plan.payerAddress,
  deploymentAuthorityAddress: source.plan.deploymentAuthorityAddress,
  publicSignerIdsByRole: Object.fromEntries(
    source.plan.programs.map(({ role, programId, bufferAddress }) => [
      role,
      { programId, bufferAddress },
    ]),
  ),
  artifactBytesByRole: source.artifacts,
  sbfValidationEvidenceBytesByRole: Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
      role,
      canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes(
        source.evidenceByRole[role],
      ),
    ]),
  ),
  expectedArtifactSha256ByRole: Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
      role,
      solanaSha256(source.artifacts[role]),
    ]),
  ),
  expectedSbfValidationEvidenceSha256ByRole: Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
      role,
      source.plan.programs.find((program) => program.role === role)
        .sbfValidationEvidenceSha256,
    ]),
  ),
  reviewedContext: {
    network: source.plan.network,
    genesisHash: source.plan.genesisHash,
    finalizedSlot: source.plan.context.minFinalizedSlot,
    expiresAtFinalizedSlot: source.plan.context.expiresAtFinalizedSlot,
    solanaCoreVersion: source.plan.context.solanaCoreVersion,
    featureSet: source.plan.context.featureSet,
    sbpfV3EnableFeatureId: source.plan.context.sbpfV3EnableFeatureId,
    sbpfV3EnableFeatureActivationSlot:
      source.plan.context.sbpfV3EnableFeatureActivationSlot,
    sbpfV3EnableFeatureAccountDataSha256:
      source.plan.context.sbpfV3EnableFeatureAccountDataSha256,
  },
});

const account = ({ owner, executable = false, lamports = 1, data }) => ({
  owner,
  executable,
  lamports,
  data: Buffer.from(data),
});

const mockRuntime = (source, options = {}) => {
  let slot = options.startSlot ?? 100;
  let blockhashIndex = 10;
  const accounts = new Map();
  const statuses = new Map();
  const finalizedTransactions = new Map();
  const journalEvents = [];
  const broadcasts = [];
  const signerCalls = [];
  const simulationSignatures = new Set();
  accounts.set(
    source.plan.payerAddress,
    account({
      owner: SystemProgram.programId.toBase58(),
      lamports: 1_000_000_000,
      data: Buffer.alloc(0),
    }),
  );
  const configuredFeatureData =
    options.featureData === undefined
      ? source.activeFeatureData
      : options.featureData;
  if (configuredFeatureData !== null) {
    accounts.set(
      SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      account({
        owner: options.featureOwner ?? SOLANA_FEATURE_PROGRAM_ID,
        data: configuredFeatureData,
      }),
    );
  }

  const readAccount = async ({ address }) => ({
    context: { slot },
    value: accounts.has(address)
      ? {
          owner: new PublicKey(accounts.get(address).owner),
          executable: accounts.get(address).executable,
          lamports: accounts.get(address).lamports,
          data: Buffer.from(accounts.get(address).data),
        }
      : null,
  });

  const applySystemCreate = (instruction) => {
    const data = Buffer.from(instruction.data);
    if (data.readUInt32LE(0) !== 0) throw new Error("unexpected System opcode");
    const address = instruction.keys[1].pubkey.toBase58();
    const lamports = Number(data.readBigUInt64LE(4));
    const space = Number(data.readBigUInt64LE(12));
    const owner = new PublicKey(data.subarray(20, 52)).toBase58();
    const payerAddress = instruction.keys[0].pubkey.toBase58();
    accounts.get(payerAddress).lamports -= lamports;
    accounts.set(
      address,
      account({ owner, lamports, data: Buffer.alloc(space) }),
    );
  };

  const applyLoader = (instruction, stage) => {
    const data = Buffer.from(instruction.data);
    const opcode = data.readUInt32LE(0);
    if (opcode === 0) {
      const address = instruction.keys[0].pubkey.toBase58();
      const authority = instruction.keys[1].pubkey;
      const target = accounts.get(address);
      target.data.writeUInt32LE(1, 0);
      target.data[4] = 1;
      authority.toBuffer().copy(target.data, 5);
      return;
    }
    if (opcode === 1) {
      const address = instruction.keys[0].pubkey.toBase58();
      const offset = data.readUInt32LE(4);
      const length = Number(data.readBigUInt64LE(8));
      data
        .subarray(16, 16 + length)
        .copy(
          accounts.get(address).data,
          SOLANA_BUFFER_METADATA_LENGTH + offset,
        );
      return;
    }
    if (opcode === 2) {
      const programdataAddress = instruction.keys[1].pubkey.toBase58();
      const programId = instruction.keys[2].pubkey.toBase58();
      const bufferAddress = instruction.keys[3].pubkey.toBase58();
      const authority = instruction.keys[7].pubkey;
      const maxDataLength = Number(data.readBigUInt64LE(4));
      const buffer = accounts.get(bufferAddress);
      const artifact = buffer.data.subarray(SOLANA_BUFFER_METADATA_LENGTH);
      const programBytes = Buffer.alloc(36);
      programBytes.writeUInt32LE(2, 0);
      new PublicKey(programdataAddress).toBuffer().copy(programBytes, 4);
      const programAccount = accounts.get(programId);
      programAccount.data = programBytes;
      programAccount.executable = true;
      const programdataBytes = Buffer.alloc(
        SOLANA_PROGRAMDATA_METADATA_LENGTH + maxDataLength,
      );
      programdataBytes.writeUInt32LE(3, 0);
      programdataBytes.writeBigUInt64LE(BigInt(slot), 4);
      programdataBytes[12] = 1;
      authority.toBuffer().copy(programdataBytes, 13);
      artifact.copy(programdataBytes, SOLANA_PROGRAMDATA_METADATA_LENGTH);
      if (
        options.malformedProgramdataRole &&
        stage === `fresh-deploy:${options.malformedProgramdataRole}`
      ) {
        programdataBytes.writeUInt32LE(99, 0);
      }
      accounts.set(
        programdataAddress,
        account({
          owner: SOLANA_UPGRADEABLE_LOADER_ID,
          lamports:
            (SOLANA_PROGRAMDATA_METADATA_LENGTH + maxDataLength) * 10 + 1,
          data: programdataBytes,
        }),
      );
      accounts.delete(bufferAddress);
      return;
    }
    if (opcode === 4) {
      const address = instruction.keys[0].pubkey.toBase58();
      const role = source.plan.programs.find(
        ({ programdataAddress }) => programdataAddress === address,
      )?.role;
      if (options.retainAuthorityRole === role) return;
      if (options.partialFinalization && role === "nativeVerifier") return;
      // Loader-v3 changes the Option tag only; the obsolete public authority
      // bytes may remain at offsets 13..45 and must not be mistaken for Some.
      accounts.get(address).data[12] = 0;
      return;
    }
    throw new Error(`unexpected Loader opcode ${opcode}`);
  };

  const broadcastFinalized = vi.fn(
    async ({
      rawTransaction,
      expectedSignature,
      expectedSignatures,
      stage,
    }) => {
      broadcasts.push({ stage, expectedSignature });
      if (options.throwBroadcastAt === stage) {
        throw new Error("simulated indeterminate RPC send");
      }
      const transaction = Transaction.from(rawTransaction);
      const message = transaction.compileMessage();
      const preBalances = message.accountKeys.map(
        (key) => accounts.get(key.toBase58())?.lamports ?? 0,
      );
      slot += options.broadcastSlotStep ?? 1;
      for (const instruction of transaction.instructions) {
        const programId = instruction.programId.toBase58();
        if (programId === SystemProgram.programId.toBase58()) {
          applySystemCreate(instruction);
        } else if (programId === SOLANA_UPGRADEABLE_LOADER_ID) {
          applyLoader(instruction, stage);
        } else {
          throw new Error(`unexpected program ${programId}`);
        }
      }
      statuses.set(expectedSignature, {
        err: null,
        confirmationStatus: "finalized",
        slot,
      });
      if (options.corruptReadbackMessageAt === stage) {
        message.recentBlockhash = randomTestKeypair().publicKey.toBase58();
      }
      const transactionReadback = {
        slot,
        meta: {
          err: null,
          fee: expectedSignatures.length * 5_000,
          preBalances,
        },
        transaction: { signatures: [...expectedSignatures], message },
      };
      finalizedTransactions.set(expectedSignature, transactionReadback);
      return {
        signature:
          options.signatureDriftAt === stage
            ? randomTestKeypair().publicKey.toBase58()
            : expectedSignature,
        confirmation: { value: { err: null } },
        signatureStatus: statuses.get(expectedSignature),
        transactionReadback,
      };
    },
  );

  const operationJournal = vi.fn(async (event, eventSha256) => {
    journalEvents.push({ event, eventSha256 });
    if (
      options.failJournalType === event.type ||
      options.failJournalStage === event.details?.stage
    ) {
      throw new Error("simulated durable journal outage");
    }
    if (event.type === "claim") {
      return {
        durable: true,
        accepted: true,
        eventSha256,
        journalId: "fresh-journal-1",
      };
    }
    return {
      durable: true,
      recorded: true,
      eventSha256,
      journalId: "fresh-journal-1",
    };
  });

  const signerFactory = vi.fn(async ({ role }) => {
    signerCalls.push(role);
    const sourceForRole = source.signerSources.get(role);
    if (options.badSignerRole === role) {
      return { ...sourceForRole, runtimeOnly: false };
    }
    if (options.wrongSignerRole === role) {
      return runtimeSource(randomTestKeypair());
    }
    return sourceForRole;
  });

  const dependencies = {
    getFinalizedSlot: vi.fn(async () => {
      if (options.throwFinalizedSlot) {
        throw new Error("simulated finalized-slot RPC failure");
      }
      return options.finalizedSlot ?? slot;
    }),
    getVersion: async () => ({
      "solana-core": options.coreVersion ?? "4.1.0",
      "feature-set": options.featureSet ?? 3345198602,
    }),
    getLatestBlockhashAndContext: async () => {
      blockhashIndex += 1;
      return {
        context: { slot },
        value: {
          blockhash: Keypair.fromSeed(
            Uint8Array.from({ length: 32 }, () => blockhashIndex & 0xff),
          ).publicKey.toBase58(),
          lastValidBlockHeight: 10_000 + blockhashIndex,
        },
      };
    },
    getMinimumBalanceForRentExemption: vi.fn(async (length) => {
      if (options.throwRent) {
        throw new Error("simulated rent RPC failure");
      }
      return options.invalidRent ? 0 : length * 10 + 1;
    }),
    getBalance: vi.fn(async () => {
      if (options.throwBalance) {
        throw new Error("simulated balance RPC failure");
      }
      return {
        context: { slot: options.balanceContextSlot ?? slot },
        value:
          options.payerBalanceLamports ??
          accounts.get(source.plan.payerAddress).lamports,
      };
    }),
    getFeeForMessage: vi.fn(async ({ message }) => {
      if (options.throwFeeQuote) {
        throw new Error("simulated fee-for-message RPC failure");
      }
      return {
        context: { slot },
        value: options.invalidFeeQuote
          ? null
          : message.header.numRequiredSignatures * 5_000,
      };
    }),
    readAccount,
    simulateRawTransaction: vi.fn(
      async ({ expectedSignature, stage, rawTransaction }) => {
        if (options.persistSimulationAt === stage) {
          simulationSignatures.add(expectedSignature);
        }
        if (options.mutateSimulationPayerAt === stage) {
          accounts.get(source.plan.payerAddress).lamports -= 1;
        }
        const transaction = Transaction.from(rawTransaction);
        const validInstructions = transaction.instructions.slice(0, -1);
        const validLoaderCount = validInstructions.filter(
          ({ programId }) =>
            programId.toBase58() === SOLANA_UPGRADEABLE_LOADER_ID,
        ).length;
        const successCount =
          options.badSimulationSuccessCountAt === stage
            ? Math.max(0, validLoaderCount - 1)
            : validLoaderCount;
        return {
          context: { slot },
          value: {
            err: {
              InstructionError: [
                validInstructions.length,
                "InvalidInstructionData",
              ],
            },
            logs: [
              ...Array.from(
                { length: successCount },
                () => `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
              ),
              `Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed: invalid instruction data`,
            ],
          },
        };
      },
    ),
    getSignatureStatus: async (signature) =>
      simulationSignatures.has(signature)
        ? { err: null, confirmationStatus: "finalized", slot }
        : (statuses.get(signature) ?? null),
    broadcastFinalized,
    operationJournal,
    validateSbfExecutable: vi.fn(async ({ role }) => {
      const evidence = clone(source.evidenceByRole[role]);
      if (options.tamperEvidenceRole === role) {
        evidence.sbpfVersion = "V2";
      }
      return evidence;
    }),
    sleep: async () => {},
  };
  const connection = {
    getGenesisHash: async () =>
      options.genesisHash ?? SOLANA_TESTNET_GENESIS_HASH,
    sendRawTransaction: vi.fn(async () => {
      throw new Error("direct sendRawTransaction must not be reached in tests");
    }),
  };
  if (options.preexistingAddress) {
    accounts.set(
      options.preexistingAddress,
      account({
        owner: SystemProgram.programId.toBase58(),
        data: Buffer.alloc(0),
      }),
    );
  }
  return {
    accounts,
    broadcasts,
    finalizedTransactions,
    journalEvents,
    signerCalls,
    signerFactory,
    dependencies,
    connection,
  };
};

const execute = (source, runtime) =>
  deployFreshImmutableSolanaSccpPrograms({
    connection: runtime.connection,
    planBytes: source.planBytes,
    expectedPlanSha256: source.expectedPlanSha256,
    artifactBytesByRole: source.artifacts,
    confirmation: source.confirmation,
    signerFactory: runtime.signerFactory,
    dependencies: runtime.dependencies,
  });

describe("fresh Loader-v3 reviewed plan", () => {
  it("deterministically builds public review bytes and a non-submitting irreversible confirmation template", () => {
    const source = fixture();
    const input = builderInput(source);
    const first = buildSolanaLoaderV3FreshDeployPlan(input);
    const second = buildSolanaLoaderV3FreshDeployPlan(input);
    expect(first.planBytes.equals(second.planBytes)).toBe(true);
    expect(first.planSha256).toBe(second.planSha256);
    expect(first.planSha256).toBe(solanaSha256(first.planBytes));
    expect(first.plan.programs).toEqual(source.plan.programs);
    expect(first.confirmationTemplate).toMatchObject({
      irreversible: true,
      submit: false,
      planSha256: first.planSha256,
      acknowledgePermanentProgramIds: false,
      acknowledgeOneWayAuthorityRevocation: false,
    });
    expect(() => {
      first.plan.payerAddress = randomTestKeypair().publicKey.toBase58();
    }).toThrow();
  });

  it("rejects hostile public signer aliasing while building", () => {
    const source = fixture();
    const input = builderInput(source);
    input.publicSignerIdsByRole.destination.bufferAddress =
      input.publicSignerIdsByRole.nativeVerifier.programId;
    expect(() => buildSolanaLoaderV3FreshDeployPlan(input)).toThrow(/aliases/u);
  });

  it("rejects stale or not-yet-active reviewed cluster context while building", () => {
    const source = fixture();
    const expired = builderInput(source);
    expired.reviewedContext.expiresAtFinalizedSlot =
      expired.reviewedContext.finalizedSlot;
    expect(() => buildSolanaLoaderV3FreshDeployPlan(expired)).toThrow(/stale/u);
    const inactive = builderInput(source);
    inactive.reviewedContext.sbpfV3EnableFeatureActivationSlot =
      inactive.reviewedContext.finalizedSlot + 1;
    expect(() => buildSolanaLoaderV3FreshDeployPlan(inactive)).toThrow(
      /not yet active/u,
    );
  });

  it("rejects incorrect independently pinned or noncanonical SBF evidence", () => {
    const source = fixture();
    const wrongHash = builderInput(source);
    wrongHash.expectedSbfValidationEvidenceSha256ByRole.source =
      hash("wrong evidence");
    expect(() => buildSolanaLoaderV3FreshDeployPlan(wrongHash)).toThrow(
      /independently reviewed/u,
    );
    const tampered = builderInput(source);
    const evidence = clone(source.evidenceByRole.destination);
    evidence.productionEligible = false;
    tampered.sbfValidationEvidenceBytesByRole.destination =
      canonicalSolanaLoaderV3FreshSbfValidationEvidenceBytes(evidence);
    tampered.expectedSbfValidationEvidenceSha256ByRole.destination =
      solanaSha256(tampered.sbfValidationEvidenceBytesByRole.destination);
    expect(() => buildSolanaLoaderV3FreshDeployPlan(tampered)).toThrow(
      /governance-pinned production result/u,
    );
  });

  it("accepts only exact canonical V3 artifact, address, and policy pins", () => {
    const source = fixture();
    const normalized = validateSolanaLoaderV3FreshDeployPlan({
      planBytes: source.planBytes,
      expectedPlanSha256: source.expectedPlanSha256,
      artifactBytesByRole: source.artifacts,
    });
    expect(normalized.programs.map(({ role }) => role)).toEqual(
      SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
    );
    expect(
      normalized.programs.map(({ artifact }) => artifact.readUInt32LE(48)),
    ).toEqual([3, 3, 3]);
  });

  it.each([
    ["two roles", ["nativeVerifier", "destination"]],
    ["all roles", [...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER]],
  ])(
    "rejects identical artifacts across %s before signer, journal, or mutation access",
    async (_label, roles) => {
      const source = fixtureWithAliasedArtifacts(fixture(), roles);
      expect(() =>
        buildSolanaLoaderV3FreshDeployPlan(builderInput(source)),
      ).toThrow(/distinct artifact SHA-256 and executable code hashes/u);
      expect(() =>
        validateSolanaLoaderV3FreshDeployPlan({
          planBytes: source.planBytes,
          expectedPlanSha256: source.expectedPlanSha256,
          artifactBytesByRole: source.artifacts,
        }),
      ).toThrow(/distinct artifact SHA-256 and executable code hashes/u);

      const runtime = mockRuntime(source);
      await expect(execute(source, runtime)).rejects.toThrow(
        /distinct artifact SHA-256 and executable code hashes/u,
      );
      expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.broadcasts).toHaveLength(0);
    },
  );

  it("rejects noncanonical JSON and independently mismatched plan hashes", () => {
    const source = fixture();
    const noncanonical = Buffer.concat([source.planBytes, Buffer.from("\n")]);
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        planBytes: noncanonical,
        expectedPlanSha256: solanaSha256(noncanonical),
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/not canonical/u);
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        planBytes: source.planBytes,
        expectedPlanSha256: hash("wrong reviewed hash"),
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/independently supplied/u);
  });

  it("rejects tampered artifacts even when the reviewed plan is unchanged", () => {
    const source = fixture();
    const artifacts = {
      ...source.artifacts,
      source: Buffer.from(source.artifacts.source),
    };
    artifacts.source[200] ^= 1;
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        planBytes: source.planBytes,
        expectedPlanSha256: source.expectedPlanSha256,
        artifactBytesByRole: artifacts,
      }),
    ).toThrow(/does not match exact artifact bytes/u);
  });

  it.each([0, 1, 2])("rejects obsolete SBPF V%s ELF artifacts", (version) => {
    const source = fixture({ elfVersion: version });
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        planBytes: source.planBytes,
        expectedPlanSha256: source.expectedPlanSha256,
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/invalid static SBF ELF header/u);
  });

  it("rejects lower-version plan claims even for exact V3 bytes", () => {
    const source = fixture();
    const plan = clone(source.plan);
    plan.programs[0].sbpfVersion = "V2";
    const review = reviewed(plan);
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        ...review,
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/production structural validator/u);
  });

  it("rejects address aliases, unknown fields, and noncanonical packet policy", () => {
    const source = fixture();
    const aliasPlan = clone(source.plan);
    aliasPlan.programs[1].bufferAddress = aliasPlan.programs[0].programId;
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        ...reviewed(aliasPlan),
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/aliases/u);
    const unknownPlan = clone(source.plan);
    unknownPlan.programs[0].artifactPath = "/tmp/not-allowed.so";
    expect(() =>
      canonicalSolanaLoaderV3FreshDeployPlanBytes(unknownPlan),
    ).toThrow(/exact canonical fields/u);
    const packetPlan = clone(source.plan);
    packetPlan.policy.maxPacketBytes = SOLANA_PACKET_DATA_SIZE + 1;
    expect(() =>
      validateSolanaLoaderV3FreshDeployPlan({
        ...reviewed(packetPlan),
        artifactBytesByRole: source.artifacts,
      }),
    ).toThrow(/exact immutable policy/u);
  });
});

describe("fresh Loader-v3 local acceptance boundary", () => {
  it("cannot target a non-loopback RPC", async () => {
    const source = fixture();
    const connection = { rpcEndpoint: "https://api.testnet.solana.com" };
    await expect(
      runSolanaLoaderV3FreshDeployLocalAcceptance({
        connection,
        artifactBytesByRole: source.artifacts,
      }),
    ).rejects.toThrow(/restricted to a disposable loopback/u);
  });

  it("rejects obsolete artifacts before acquiring local runtime signers", async () => {
    const source = fixture({ elfVersion: 2 });
    const generateKeypair = vi.fn(() => randomTestKeypair());
    await expect(
      runSolanaLoaderV3FreshDeployLocalAcceptance({
        connection: { rpcEndpoint: "http://127.0.0.1:8899" },
        artifactBytesByRole: source.artifacts,
        dependencies: { generateKeypair },
      }),
    ).rejects.toThrow(/not exact SBPF V3/u);
    expect(generateKeypair).not.toHaveBeenCalled();
  });
});

describe("fresh Loader-v3 immutable runtime", () => {
  it("deploys exact bytes, consumes buffers, and freezes all roles in one ordered transaction", async () => {
    const source = fixture();
    const runtime = mockRuntime(source);
    const backingSecrets = [...source.signerSources.values()].map(
      ({ signer }) => signer._keypair.secretKey,
    );
    const report = await execute(source, runtime);
    expect(report.schema).toBe(SOLANA_LOADER_V3_FRESH_DEPLOY_REPORT_SCHEMA);
    expect(report.productionReady).toBe(true);
    expect(report.sbpfV3EnableFeature).toMatchObject({
      featureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      active: true,
      activationSlot: 50,
    });
    expect(report.programs.map(({ role }) => role)).toEqual(
      SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
    );
    expect(report.immutableFinalization.roleOrder).toEqual(
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER,
    );
    expect(report.immutableFinalization.instructions).toHaveLength(3);
    expect(report.resourcePreflight).toMatchObject({
      passed: true,
      feeCalculation: "rpc-getFeeForMessage-finalized-v1",
      feeMarginBasisPoints: 2_500,
      plannedTransactionCount: runtime.broadcasts.length,
    });
    expect(report.resourcePreflight.plannedRequiredSignatureCount).toBe(
      report.programs.reduce(
        (total, program) =>
          total +
          program.buffer.initialize.signatures.length +
          program.buffer.writes.reduce(
            (writeTotal, { transaction }) =>
              writeTotal + transaction.signatures.length,
            0,
          ) +
          program.deploy.signatures.length,
        report.immutableFinalization.signatures.length,
      ),
    );
    expect(
      report.resourcePreflight.payerBalanceLamports,
    ).toBeGreaterThanOrEqual(report.resourcePreflight.requiredPayerLamports);
    expect(
      report.immutableFinalization.instructions.map(
        ({ metas }) => metas[0].pubkey,
      ),
    ).toEqual(
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.map(
        (role) =>
          source.plan.programs.find((program) => program.role === role)
            .programdataAddress,
      ),
    );
    for (const program of report.programs) {
      expect(program.buffer.consumed).toBe(true);
      expect(program.buffer.writes.length).toBeGreaterThan(0);
      expect(
        program.buffer.writes.every(
          ({ transaction }) =>
            transaction.packetLength <= SOLANA_PACKET_DATA_SIZE,
        ),
      ).toBe(true);
      expect(program.immutableProgramdataReadback).toMatchObject({
        immutable: true,
        authorityAddress: null,
        executableSha256: program.artifactSha256,
        sbpfVersion: "V3",
      });
      expect(program.immutableFinalization.signature).toBe(
        report.immutableFinalization.signature,
      );
      expect(program.immutableFinalization.finalizedSlot).toBe(
        report.immutableFinalization.finalizedSlot,
      );
      // SetAuthority(None) leaves the obsolete public authority bytes in this
      // mock, exercising fixed 45-byte metadata offset parsing.
      expect(
        program.immutableProgramdataReadback.metadataPaddingSha256,
      ).not.toBe(solanaSha256(Buffer.alloc(32)));
    }
    expect(
      runtime.journalEvents.filter(({ event }) => event.type === "intent")
        .length,
    ).toBe(runtime.broadcasts.length);
    expect(runtime.broadcasts.length).toBeGreaterThan(7);
    expect(runtime.dependencies.simulateRawTransaction).toHaveBeenCalledTimes(
      runtime.broadcasts.length,
    );
    expect(JSON.stringify(report)).not.toMatch(
      /secret|privateKey|rawTransaction|signedTransaction/iu,
    );
    expect(report.runtimeSignerMaterialZeroized).toBe(true);
    expect(
      backingSecrets.every((bytes) => bytes.every((byte) => byte === 0)),
    ).toBe(true);
  });

  it("validates only hash-pinned canonical reports with fresh ordered deployments and one atomic authority removal", async () => {
    const source = fixture();
    const runtime = mockRuntime(source);
    const report = await execute(source, runtime);
    const bytes = canonicalSolanaLoaderV3FreshDeployReportBytes(report);
    const expectedReportSha256 = solanaSha256(bytes);
    const normalized = validateSolanaLoaderV3FreshDeployReport({
      reportBytes: bytes,
      expectedReportSha256,
    });
    expect(normalized.reportSha256).toBe(expectedReportSha256);
    expect(normalized.programsByRole.destination.programId).toBe(
      source.plan.programs.find(({ role }) => role === "destination").programId,
    );
    expect(normalized.immutableFinalization.oneAtomicTransaction).toBe(true);
    await expect(
      verifySolanaLoaderV3FreshDeployReportTransactions(
        runtime.connection,
        normalized,
        {
          getTransaction: async (signature) =>
            runtime.finalizedTransactions.get(signature) ?? null,
          readAccount: runtime.dependencies.readAccount,
        },
      ),
    ).resolves.toMatchObject({
      ready: true,
      reportSha256: expectedReportSha256,
      transactionCount: runtime.broadcasts.length,
    });
    await expect(
      verifySolanaLoaderV3FreshDeployReportTransactions(
        runtime.connection,
        normalized,
        {
          getTransaction: async (signature) => {
            const actual = runtime.finalizedTransactions.get(signature);
            return actual ? { ...actual, slot: actual.slot + 1 } : null;
          },
          readAccount: runtime.dependencies.readAccount,
        },
      ),
    ).rejects.toThrow(/differs from the fresh report/u);

    const inflatedProgramdataRent = clone(report);
    const inflatedResource = inflatedProgramdataRent.resourcePreflight;
    inflatedResource.programs[0].programdataRentLamports += 1;
    inflatedResource.rentLamports += 1;
    inflatedResource.requiredPayerLamports += 1;
    inflatedResource.remainingPayerLamports -= 1;
    inflatedProgramdataRent.programs[0].mutableProgramdataReadback.accountLamports += 1;
    inflatedProgramdataRent.programs[0].immutableProgramdataReadback.accountLamports += 1;
    const inflatedBytes = canonicalSolanaLoaderV3FreshDeployReportBytes(
      inflatedProgramdataRent,
    );
    const inflatedNormalized = validateSolanaLoaderV3FreshDeployReport({
      reportBytes: inflatedBytes,
      expectedReportSha256: solanaSha256(inflatedBytes),
    });
    await expect(
      verifySolanaLoaderV3FreshDeployReportTransactions(
        runtime.connection,
        inflatedNormalized,
        {
          getTransaction: async (signature) =>
            runtime.finalizedTransactions.get(signature) ?? null,
          readAccount: runtime.dependencies.readAccount,
        },
      ),
    ).rejects.toThrow(/Program\/ProgramData state differs/u);

    const inflatedPayerBalance = clone(report);
    inflatedPayerBalance.resourcePreflight.payerBalanceLamports += 1;
    inflatedPayerBalance.resourcePreflight.remainingPayerLamports += 1;
    const inflatedPayerBytes =
      canonicalSolanaLoaderV3FreshDeployReportBytes(inflatedPayerBalance);
    const inflatedPayerNormalized = validateSolanaLoaderV3FreshDeployReport({
      reportBytes: inflatedPayerBytes,
      expectedReportSha256: solanaSha256(inflatedPayerBytes),
    });
    await expect(
      verifySolanaLoaderV3FreshDeployReportTransactions(
        runtime.connection,
        inflatedPayerNormalized,
        {
          getTransaction: async (signature) =>
            runtime.finalizedTransactions.get(signature) ?? null,
          readAccount: runtime.dependencies.readAccount,
        },
      ),
    ).rejects.toThrow(/payer pre-mutation balance differs/u);

    const forgedFinalizedFee = clone(report);
    forgedFinalizedFee.programs[0].buffer.initialize.feeLamports -= 1;
    const forgedFeeBytes =
      canonicalSolanaLoaderV3FreshDeployReportBytes(forgedFinalizedFee);
    const forgedFeeNormalized = validateSolanaLoaderV3FreshDeployReport({
      reportBytes: forgedFeeBytes,
      expectedReportSha256: solanaSha256(forgedFeeBytes),
    });
    await expect(
      verifySolanaLoaderV3FreshDeployReportTransactions(
        runtime.connection,
        forgedFeeNormalized,
        {
          getTransaction: async (signature) =>
            runtime.finalizedTransactions.get(signature) ?? null,
          readAccount: runtime.dependencies.readAccount,
        },
      ),
    ).rejects.toThrow(/differs from the fresh report/u);

    expect(() =>
      validateSolanaLoaderV3FreshDeployReport({
        reportBytes: bytes,
        expectedReportSha256: hash("wrong-independent-report-pin"),
      }),
    ).toThrow(/independent SHA-256 pin/u);
    expect(() =>
      validateSolanaLoaderV3FreshDeployReport({
        reportBytes: Buffer.concat([bytes, Buffer.from("\n")]),
        expectedReportSha256: solanaSha256(
          Buffer.concat([bytes, Buffer.from("\n")]),
        ),
      }),
    ).toThrow(/canonical JSON bytes/u);

    const adversarialMutations = [
      (candidate) => {
        candidate.programs[0].deploy.finalizedSlot =
          candidate.context.minFinalizedSlot;
        candidate.programs[0].mutableProgramdataReadback.deploymentSlot =
          candidate.context.minFinalizedSlot;
        candidate.programs[0].immutableProgramdataReadback.deploymentSlot =
          candidate.context.minFinalizedSlot;
      },
      (candidate) => {
        candidate.programs[1].artifactSha256 =
          candidate.programs[0].artifactSha256;
        candidate.programs[1].executableSha256 =
          candidate.programs[0].artifactSha256;
        candidate.programs[1].mutableProgramdataReadback.executableSha256 =
          candidate.programs[0].artifactSha256;
        candidate.programs[1].immutableProgramdataReadback.executableSha256 =
          candidate.programs[0].artifactSha256;
      },
      (candidate) => {
        candidate.immutableFinalization.oneAtomicTransaction = false;
      },
      (candidate) => {
        candidate.immutableFinalization.instructions[0].metas[0].pubkey =
          candidate.programs[2].programdataAddress;
      },
      (candidate) => {
        candidate.programs[2].immutableProgramdataReadback.immutable = false;
        candidate.programs[2].immutableProgramdataReadback.authorityAddress =
          candidate.temporaryDeploymentAuthorityAddress;
      },
      (candidate) => {
        candidate.resourcePreflight.plannedTransactionCount += 1;
      },
      (candidate) => {
        candidate.resourcePreflight.programs[0].programdataRentLamports += 1;
      },
      (candidate) => {
        candidate.resourcePreflight.feeBudgetLamports -= 1;
      },
      (candidate) => {
        const resource = candidate.resourcePreflight;
        resource.programs[0].bufferRentLamports -= 1;
        resource.rentLamports -= 1;
        resource.requiredPayerLamports -= 1;
        resource.remainingPayerLamports += 1;
      },
      (candidate) => {
        const resource = candidate.resourcePreflight;
        for (const program of resource.programs) {
          program.baseFeeLamports = 1;
        }
        resource.immutableFinalization.baseFeeLamports = 1;
        resource.baseFeeLamports = 4;
        resource.feeBudgetLamports = 5;
        resource.requiredPayerLamports = resource.rentLamports + 5;
        resource.remainingPayerLamports =
          resource.payerBalanceLamports - resource.requiredPayerLamports;
      },
      (candidate) => {
        candidate.resourcePreflight.payerBalanceContextSlot -= 1;
      },
    ];
    for (const [index, mutate] of adversarialMutations.entries()) {
      const candidate = clone(report);
      mutate(candidate);
      const candidateBytes =
        canonicalSolanaLoaderV3FreshDeployReportBytes(candidate);
      expect(
        () =>
          validateSolanaLoaderV3FreshDeployReport({
            reportBytes: candidateBytes,
            expectedReportSha256: solanaSha256(candidateBytes),
          }),
        `adversarial mutation ${index}`,
      ).toThrow();
    }
  });

  it.each([
    ["missing", null],
    ["inactive", Buffer.alloc(9)],
    ["wrong activation", featureData(51)],
  ])(
    "rejects %s V3 enable-feature evidence before acquiring signers",
    async (_label, badFeatureData) => {
      const source = fixture();
      const runtime = mockRuntime(source, { featureData: badFeatureData });
      await expect(execute(source, runtime)).rejects.toThrow(
        /SBPF V3 enable feature/u,
      );
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.broadcasts).toHaveLength(0);
    },
  );

  it("rejects wrong network runtime and stale slot context before signers", async () => {
    const wrongRuntimeSource = fixture();
    const wrongRuntime = mockRuntime(wrongRuntimeSource, {
      coreVersion: "4.1.1",
    });
    await expect(execute(wrongRuntimeSource, wrongRuntime)).rejects.toThrow(
      /core version or feature set/u,
    );
    expect(wrongRuntime.signerFactory).not.toHaveBeenCalled();
    const wrongGenesisSource = fixture();
    const wrongGenesis = mockRuntime(wrongGenesisSource, {
      genesisHash: randomTestKeypair().publicKey.toBase58(),
    });
    await expect(execute(wrongGenesisSource, wrongGenesis)).rejects.toThrow(
      /canonical Solana testnet/u,
    );
    expect(wrongGenesis.signerFactory).not.toHaveBeenCalled();
    const staleSource = fixture();
    const stale = mockRuntime(staleSource, { finalizedSlot: 1001 });
    await expect(execute(staleSource, stale)).rejects.toThrow(/slot window/u);
    expect(stale.signerFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["payer-balance RPC", { throwBalance: true }, /balance RPC failure/u],
    [
      "stale payer-balance context",
      { balanceContextSlot: 99 },
      /payer balance is stale/u,
    ],
    ["rent RPC", { throwRent: true }, /rent RPC failure/u],
    ["invalid rent", { invalidRent: true }, /rent result is invalid/u],
    ["fee-for-message RPC", { throwFeeQuote: true }, /fee-for-message/u],
    ["invalid fee quote", { invalidFeeQuote: true }, /fee-for-message/u],
    [
      "insufficient payer balance",
      { payerBalanceLamports: 1 },
      /cannot cover all rent obligations/u,
    ],
    [
      "unsafe expiry slot window",
      { startSlot: 970 },
      /minimum safe remaining finalized-slot window/u,
    ],
    [
      "finalized-slot RPC",
      { throwFinalizedSlot: true },
      /finalized-slot RPC failure/u,
    ],
  ])(
    "fails the %s resource preflight before runtime signer acquisition or transaction send",
    async (_label, fault, expectedError) => {
      const source = fixture();
      const runtime = mockRuntime(source, fault);
      await expect(execute(source, runtime)).rejects.toThrow(expectedError);
      expect(runtime.signerFactory).not.toHaveBeenCalled();
      expect(runtime.broadcasts).toHaveLength(0);
      expect(runtime.dependencies.broadcastFinalized).not.toHaveBeenCalled();
      expect(runtime.connection.sendRawTransaction).not.toHaveBeenCalled();
    },
  );

  it("samples the finalized payer balance only after every rent and fee quote", async () => {
    const source = fixture();
    const runtime = mockRuntime(source);
    await execute(source, runtime);
    const balanceOrder =
      runtime.dependencies.getBalance.mock.invocationCallOrder[0];
    const lastRentOrder = Math.max(
      ...runtime.dependencies.getMinimumBalanceForRentExemption.mock
        .invocationCallOrder,
    );
    const lastFeeOrder = Math.max(
      ...runtime.dependencies.getFeeForMessage.mock.invocationCallOrder,
    );
    expect(balanceOrder).toBeGreaterThan(lastRentOrder);
    expect(balanceOrder).toBeGreaterThan(lastFeeOrder);
  });

  it("rejects tampered production evidence before journal, signers, or mutation", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, { tamperEvidenceRole: "destination" });
    await expect(execute(source, runtime)).rejects.toThrow(
      /structural-validation/u,
    );
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it("requires exact irreversible confirmation bound to the reviewed SHA", async () => {
    const source = fixture();
    source.confirmation.planSha256 = hash("not the reviewed plan");
    const runtime = mockRuntime(source);
    await expect(execute(source, runtime)).rejects.toThrow(/irreversible/u);
    expect(runtime.dependencies.operationJournal).not.toHaveBeenCalled();
  });

  it("rejects non-runtime or wrong-address signers and zeroizes exposed material", async () => {
    const source = fixture();
    const payerBacking =
      source.signerSources.get("payer").signer._keypair.secretKey;
    const runtime = mockRuntime(source, { badSignerRole: "payer" });
    await expect(execute(source, runtime)).rejects.toThrow(
      /runtime-only random signer/u,
    );
    expect(payerBacking.every((byte) => byte === 0)).toBe(true);
    expect(runtime.broadcasts).toHaveLength(0);

    const other = fixture();
    const wrong = mockRuntime(other, {
      wrongSignerRole: "program:nativeVerifier",
    });
    await expect(execute(other, wrong)).rejects.toThrow(
      /reviewed runtime-only/u,
    );
    expect(wrong.broadcasts).toHaveLength(0);
  });

  it("records preexisting Program/buffer ambiguity and fails before signers", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      preexistingAddress: source.plan.programs[0].bufferAddress,
    });
    await expect(execute(source, runtime)).rejects.toThrow(/already exists/u);
    expect(runtime.journalEvents[0].event.type).toBe("claim");
    expect(
      runtime.journalEvents.some(({ event }) => event.type === "halt"),
    ).toBe(true);
    expect(runtime.signerFactory).not.toHaveBeenCalled();
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it("does not mutate when the durable intent journal fails", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, { failJournalType: "intent" });
    await expect(execute(source, runtime)).rejects.toThrow(/journal/u);
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it("splits multi-packet artifacts into only packet-safe rollback-tested writes", async () => {
    const source = fixture({
      artifactLengths: {
        nativeVerifier: 1_600,
        destination: 1_800,
        source: 2_100,
      },
    });
    const runtime = mockRuntime(source);
    const report = await execute(source, runtime);
    expect(
      report.programs.every(({ buffer }) => buffer.writes.length > 1),
    ).toBe(true);
    const writeTransactions = report.programs.flatMap(({ buffer }) =>
      buffer.writes.map(({ transaction }) => transaction),
    );
    expect(
      writeTransactions.every(
        ({ packetLength, instructions }) =>
          packetLength <= SOLANA_PACKET_DATA_SIZE &&
          instructions[0].dataHex === null &&
          instructions[0].dataLength > 64,
      ),
    ).toBe(true);
  });

  it("rejects a persisted simulation signature before broadcast", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      persistSimulationAt: "create-initialize-buffer:nativeVerifier",
    });
    await expect(execute(source, runtime)).rejects.toThrow(
      /simulation signature persisted/u,
    );
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it("requires the exact valid Loader success count before the sentinel failure", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      badSimulationSuccessCountAt: "create-initialize-buffer:nativeVerifier",
    });
    await expect(execute(source, runtime)).rejects.toThrow(
      /simulation was not exact/u,
    );
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it("rejects a sentinel simulation that changes the writable payer only", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      mutateSimulationPayerAt: "create-initialize-buffer:nativeVerifier",
    });
    await expect(execute(source, runtime)).rejects.toThrow(
      /simulation changed account state/u,
    );
    expect(runtime.broadcasts).toHaveLength(0);
  });

  it.each(["throw", "signature-drift", "message-drift"])(
    "never retries an ambiguous %s broadcast/readback",
    async (kind) => {
      const source = fixture();
      const stage = "create-initialize-buffer:nativeVerifier";
      const runtime = mockRuntime(source, {
        ...(kind === "throw" ? { throwBroadcastAt: stage } : {}),
        ...(kind === "signature-drift" ? { signatureDriftAt: stage } : {}),
        ...(kind === "message-drift"
          ? { corruptReadbackMessageAt: stage }
          : {}),
      });
      const backingSecrets = [...source.signerSources.values()].map(
        ({ signer }) => signer._keypair.secretKey,
      );
      let error;
      try {
        await execute(source, runtime);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SolanaLoaderV3FreshDeployAmbiguityError);
      expect(error.publicRecovery).toMatchObject({
        stage,
        planSha256: source.expectedPlanSha256,
      });
      expect(runtime.broadcasts).toHaveLength(1);
      expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(1);
      expect(
        backingSecrets.every((bytes) => bytes.every((byte) => byte === 0)),
      ).toBe(true);
      expect(JSON.stringify(error.publicRecovery)).not.toMatch(
        /secret|privateKey|rawTransaction|signedTransaction/iu,
      );
    },
  );

  it("fails closed when a submitted transaction finalizes beyond the reviewed slot window", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      startSlot: 950,
      broadcastSlotStep: 51,
    });
    const error = await execute(source, runtime).catch((value) => value);
    expect(error).toBeInstanceOf(SolanaLoaderV3FreshDeployAmbiguityError);
    expect(error.message).toMatch(/finalized readback is ambiguous/u);
    expect(runtime.broadcasts).toHaveLength(1);
    expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed ProgramData with public recovery coordinates", async () => {
    const source = fixture();
    const runtime = mockRuntime(source, {
      malformedProgramdataRole: "nativeVerifier",
    });
    await expect(execute(source, runtime)).rejects.toBeInstanceOf(
      SolanaLoaderV3FreshDeployAmbiguityError,
    );
    expect(
      runtime.broadcasts.filter(
        ({ stage }) => stage === "fresh-deploy:nativeVerifier",
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["retained source authority", { retainAuthorityRole: "source" }],
    ["partial finalization", { partialFinalization: true }],
  ])(
    "rejects %s after the one atomic finalization readback",
    async (_label, fault) => {
      const source = fixture();
      const runtime = mockRuntime(source, fault);
      await expect(execute(source, runtime)).rejects.toBeInstanceOf(
        SolanaLoaderV3FreshDeployAmbiguityError,
      );
      const finalizations = runtime.broadcasts.filter(({ stage }) =>
        stage.startsWith("set-authority-none:"),
      );
      expect(finalizations).toHaveLength(1);
      expect(runtime.dependencies.broadcastFinalized).toHaveBeenCalledTimes(
        runtime.broadcasts.length,
      );
    },
  );
});

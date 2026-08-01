/* global AggregateError, BigInt */
import bs58 from "bs58";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  SOLANA_FEATURE_PROGRAM_ID,
  SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
  SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
  SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
  SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER,
  buildLoaderV3SetAuthorityNoneInstruction,
} from "./solana-loader-v3-fresh-deploy.mjs";
import {
  SOLANA_BUFFER_METADATA_LENGTH,
  SOLANA_PACKET_DATA_SIZE,
  SOLANA_PROGRAMDATA_METADATA_LENGTH,
  SOLANA_UPGRADEABLE_LOADER_ID,
  buildLoaderV3DeployWithMaxDataLenInstruction,
  buildLoaderV3InitializeBufferInstruction,
  buildLoaderV3InvalidRollbackSentinelInstruction,
  selectLargestLoaderV3WriteChunk,
  solanaBlake2b256,
  solanaSha256,
} from "./solana-loader-v3-runtime.mjs";

/**
 * This entrypoint is intentionally incapable of making a production claim.
 * It accepts only a loopback RPC and exists to exercise Loader-v3's real
 * create/initialize/write/deploy/finalize path on a disposable local Agave
 * validator. It shares instruction builders with the production transport,
 * but never bypasses production network or reviewed-plan validation.
 */

export const SOLANA_LOADER_V3_FRESH_LOCAL_ACCEPTANCE_REPORT_SCHEMA =
  "iroha-demo-solana-loader-v3-fresh-local-acceptance-report/v1";

const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const PROGRAM_ACCOUNT_LENGTH = 36;
const ELF_HEADER_MINIMUM = 120;
const SBPF_E_FLAGS_OFFSET = 48;

const assertLoopbackConnection = (connection) => {
  const endpoint = connection?.rpcEndpoint ?? connection?._rpcEndpoint;
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Local acceptance requires an explicit loopback RPC URL.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)
  ) {
    throw new Error(
      "Local acceptance is restricted to a disposable loopback HTTP Agave RPC.",
    );
  }
  return parsed.toString();
};

const assertArtifacts = (artifactBytesByRole) => {
  if (
    artifactBytesByRole === null ||
    typeof artifactBytesByRole !== "object" ||
    Array.isArray(artifactBytesByRole) ||
    JSON.stringify(Object.keys(artifactBytesByRole).sort()) !==
      JSON.stringify([...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER].sort())
  ) {
    throw new Error(
      "Local acceptance requires the exact three artifacts by role.",
    );
  }
  return Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => {
      const bytes = Buffer.from(artifactBytesByRole[role] ?? []);
      if (
        bytes.length < ELF_HEADER_MINIMUM ||
        !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
        bytes.readUInt32LE(SBPF_E_FLAGS_OFFSET) !== 3
      ) {
        throw new Error(
          `${role} local acceptance artifact is not exact SBPF V3.`,
        );
      }
      return [
        role,
        {
          bytes,
          executableLength: bytes.length,
          executableSha256: solanaSha256(bytes),
          codeHash: solanaBlake2b256(bytes),
          sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
        },
      ];
    }),
  );
};

const zeroize = (keypairs) => {
  for (const keypair of keypairs) {
    const secret = keypair?._keypair?.secretKey;
    if (secret instanceof Uint8Array) secret.fill(0);
  }
  if (
    keypairs.some((keypair) =>
      keypair?._keypair?.secretKey?.some?.((byte) => byte !== 0),
    )
  ) {
    throw new Error("Local acceptance runtime signer zeroization failed.");
  }
};

const accountOrThrow = async (connection, address, label) => {
  const account = await connection.getAccountInfo(address, "finalized");
  if (!account) throw new Error(`${label} finalized account is missing.`);
  return account;
};

const parseProgram = (account, programdataAddress) => {
  if (
    !account.owner.equals(LOADER) ||
    !account.executable ||
    account.data.length !== PROGRAM_ACCOUNT_LENGTH ||
    account.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(account.data.subarray(4, 36)).equals(programdataAddress)
  ) {
    throw new Error("Local acceptance Program account readback is not exact.");
  }
  return {
    owner: account.owner.toBase58(),
    executable: true,
    accountDataLength: account.data.length,
    accountDataSha256: solanaSha256(account.data),
  };
};

const parseProgramdata = ({
  account,
  artifact,
  authority,
  immutable,
  deploySlot,
}) => {
  if (
    !account.owner.equals(LOADER) ||
    account.executable ||
    account.data.length !==
      SOLANA_PROGRAMDATA_METADATA_LENGTH + artifact.bytes.length ||
    account.data.readUInt32LE(0) !== 3 ||
    account.data.readBigUInt64LE(4) !== BigInt(deploySlot)
  ) {
    throw new Error("Local acceptance ProgramData readback is malformed.");
  }
  if (immutable) {
    if (account.data[12] !== 0) {
      throw new Error(
        "Local acceptance ProgramData authority was not cleared.",
      );
    }
  } else if (
    account.data[12] !== 1 ||
    !new PublicKey(account.data.subarray(13, 45)).equals(authority)
  ) {
    throw new Error("Local acceptance temporary authority is not exact.");
  }
  const executable = account.data.subarray(SOLANA_PROGRAMDATA_METADATA_LENGTH);
  if (!executable.equals(artifact.bytes)) {
    throw new Error("Local acceptance ProgramData executable bytes differ.");
  }
  return {
    immutable,
    authorityAddress: immutable ? null : authority.toBase58(),
    deploymentSlot: deploySlot,
    accountDataLength: account.data.length,
    accountDataSha256: solanaSha256(account.data),
    executableLength: executable.length,
    executableSha256: solanaSha256(executable),
    codeHash: solanaBlake2b256(executable),
    sbpfVersion: "V3",
    residualFormerAuthorityBytes: immutable
      ? account.data.subarray(13, 45).equals(authority.toBuffer())
      : null,
  };
};

const deriveProgramdata = (programId) =>
  PublicKey.findProgramAddressSync([programId.toBuffer()], LOADER)[0];

const transactionEvidence = ({
  stage,
  signature,
  slot,
  transaction,
  commitment,
}) => ({
  stage,
  signature,
  ...(commitment === "finalized"
    ? { finalizedSlot: slot }
    : { confirmedSlot: slot }),
  observedCommitment: commitment,
  messageSha256: solanaSha256(transaction.serializeMessage()),
  instructionCount: transaction.instructions.length,
});

const accountFingerprints = async (connection, addresses) => {
  const publicKeys = addresses.map((address) => new PublicKey(address));
  const accounts = await connection.getMultipleAccountsInfo(
    publicKeys,
    "finalized",
  );
  return publicKeys.map((address, index) => {
    const account = accounts[index];
    return account
      ? {
          address: address.toBase58(),
          owner: account.owner.toBase58(),
          executable: account.executable === true,
          lamports: account.lamports,
          dataLength: account.data.length,
          dataSha256: solanaSha256(account.data),
        }
      : { address: address.toBase58(), missing: true };
  });
};

const simulateRollbackSentinel = async ({
  connection,
  payer,
  signers,
  instructions,
  snapshotAddresses,
  stage,
}) => {
  const latestBlockhash = await connection.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [
      ...instructions,
      buildLoaderV3InvalidRollbackSentinelInstruction(),
    ],
  }).compileToLegacyMessage();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, ...signers]);
  const raw = Buffer.from(transaction.serialize());
  if (raw.length > SOLANA_PACKET_DATA_SIZE) {
    throw new Error(`${stage} rollback-sentinel packet exceeds the limit.`);
  }
  const expectedSignature = bs58.encode(transaction.signatures[0]);
  const before = await accountFingerprints(connection, snapshotAddresses);
  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "finalized",
    sigVerify: true,
    replaceRecentBlockhash: false,
    innerInstructions: true,
  });
  const sentinelIndex = instructions.length;
  const error = simulation.value.err;
  const logs = simulation.value.logs;
  const exactError =
    error !== null &&
    typeof error === "object" &&
    Array.isArray(error.InstructionError) &&
    error.InstructionError.length === 2 &&
    error.InstructionError[0] === sentinelIndex &&
    error.InstructionError[1] === "InvalidInstructionData";
  const expectedLoaderSuccesses = instructions.filter((instruction) =>
    instruction.programId.equals(LOADER),
  ).length;
  const loaderSuccesses = Array.isArray(logs)
    ? logs.filter(
        (line) => line === `Program ${SOLANA_UPGRADEABLE_LOADER_ID} success`,
      ).length
    : -1;
  const exactLoaderFailure =
    Array.isArray(logs) &&
    logs.filter(
      (line) =>
        line.startsWith(`Program ${SOLANA_UPGRADEABLE_LOADER_ID} failed`) &&
        line.toLowerCase().includes("invalid instruction data"),
    ).length === 1;
  if (
    !exactError ||
    !Number.isSafeInteger(simulation.context.slot) ||
    loaderSuccesses !== expectedLoaderSuccesses ||
    !exactLoaderFailure
  ) {
    throw new Error(`${stage} rollback-sentinel simulation was not exact.`);
  }
  const status = await connection.getSignatureStatuses([expectedSignature], {
    searchTransactionHistory: true,
  });
  if (status.value[0] !== null) {
    throw new Error(`${stage} simulated signature persisted unexpectedly.`);
  }
  const after = await accountFingerprints(connection, snapshotAddresses);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`${stage} rollback-sentinel simulation changed state.`);
  }
  return {
    stage,
    simulationOnly: true,
    broadcast: false,
    simulationContextSlot: simulation.context.slot,
    sentinelInstructionIndex: sentinelIndex,
    expectedError: "InvalidInstructionData",
    expectedSignature,
    messageSha256: solanaSha256(transaction.message.serialize()),
    packetSha256: solanaSha256(raw),
    packetLength: raw.length,
    loaderSuccessCount: loaderSuccesses,
    stateBeforeSha256: solanaSha256(
      Buffer.from(JSON.stringify(before), "utf8"),
    ),
    stateAfterSha256: solanaSha256(Buffer.from(JSON.stringify(after), "utf8")),
    stateUnchanged: true,
  };
};

const commitmentReached = (actual, required) =>
  actual === "finalized" ||
  (required === "confirmed" && actual === "confirmed");

const submitBuilt = async ({
  connection,
  built,
  latestBlockhash,
  stage,
  commitment = "finalized",
}) => {
  if (!["confirmed", "finalized"].includes(commitment)) {
    throw new Error(`${stage} uses an unsupported acceptance commitment.`);
  }
  if (built.raw.length > SOLANA_PACKET_DATA_SIZE) {
    throw new Error(`${stage} exceeds the Solana packet limit.`);
  }
  const expectedSignature = bs58.encode(built.transaction.signature);
  const signature = await connection.sendRawTransaction(built.raw, {
    skipPreflight: false,
    maxRetries: 0,
  });
  if (signature !== expectedSignature) {
    throw new Error(
      `${stage} RPC signature differs from the locally signed bytes.`,
    );
  }
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err !== null) {
    throw new Error(`${stage} failed during ${commitment} confirmation.`);
  }
  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = statuses.value[0];
  if (
    !status ||
    status.err !== null ||
    !commitmentReached(status.confirmationStatus, commitment) ||
    !Number.isSafeInteger(status.slot)
  ) {
    throw new Error(`${stage} ${commitment} signature status is not exact.`);
  }
  let fetched = null;
  for (let attempt = 0; attempt < 20 && !fetched; attempt += 1) {
    fetched = await connection.getTransaction(signature, {
      commitment,
      maxSupportedTransactionVersion: 0,
    });
    if (!fetched && attempt < 19) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (
    !fetched ||
    fetched.slot !== status.slot ||
    fetched.meta?.err !== null ||
    fetched.transaction.signatures[0] !== expectedSignature ||
    solanaSha256(fetched.transaction.message.serialize()) !==
      solanaSha256(built.transaction.serializeMessage())
  ) {
    throw new Error(
      `${stage} ${commitment} transaction readback is not exact.`,
    );
  }
  return transactionEvidence({
    stage,
    signature,
    slot: status.slot,
    transaction: built.transaction,
    commitment:
      status.confirmationStatus === "finalized" ? "finalized" : commitment,
  });
};

const finalizeWriteTransactions = async ({ connection, writes, stage }) => {
  if (writes.length === 0) {
    throw new Error(`${stage} has no Loader-v3 writes to finalize.`);
  }
  let expectedOffset = 0;
  for (const write of writes) {
    if (
      write.offset !== expectedOffset ||
      !Number.isSafeInteger(write.length) ||
      write.length <= 0
    ) {
      throw new Error(`${stage} write offsets are not exact and contiguous.`);
    }
    expectedOffset += write.length;
  }
  const lastSignature = writes.at(-1).transaction.signature;
  let lastStatus = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const statuses = await connection.getSignatureStatuses([lastSignature], {
      searchTransactionHistory: true,
    });
    lastStatus = statuses.value[0];
    if (lastStatus?.err !== null && lastStatus?.err !== undefined) {
      throw new Error(`${stage} last write failed before finalization.`);
    }
    if (lastStatus?.confirmationStatus === "finalized") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (lastStatus?.confirmationStatus !== "finalized") {
    throw new Error(`${stage} last write did not finalize.`);
  }
  const finalized = [];
  for (let index = 0; index < writes.length; index += 64) {
    const batch = writes.slice(index, index + 64);
    const statuses = await connection.getSignatureStatuses(
      batch.map(({ transaction }) => transaction.signature),
      { searchTransactionHistory: true },
    );
    const transactions = await Promise.all(
      batch.map(({ transaction }) =>
        connection.getTransaction(transaction.signature, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        }),
      ),
    );
    batch.forEach((write, batchIndex) => {
      const status = statuses.value[batchIndex];
      const transaction = transactions[batchIndex];
      const evidence = write.transaction;
      if (
        !status ||
        status.err !== null ||
        status.confirmationStatus !== "finalized" ||
        !Number.isSafeInteger(status.slot) ||
        !transaction ||
        transaction.slot !== status.slot ||
        transaction.meta?.err !== null ||
        transaction.transaction.signatures[0] !== evidence.signature ||
        solanaSha256(transaction.transaction.message.serialize()) !==
          evidence.messageSha256
      ) {
        throw new Error(`${evidence.stage} finalized readback is not exact.`);
      }
      const finalizedEvidence = {
        ...evidence,
        initialConfirmedSlot: evidence.confirmedSlot ?? evidence.finalizedSlot,
        finalizedSlot: status.slot,
        observedCommitment: "finalized",
      };
      delete finalizedEvidence.confirmedSlot;
      finalized.push({ ...write, transaction: finalizedEvidence });
    });
  }
  return finalized;
};

const submitInstructions = async ({
  connection,
  payer,
  signers,
  instructions,
  stage,
}) => {
  const latestBlockhash = await connection.getLatestBlockhash("finalized");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  });
  transaction.add(...instructions);
  transaction.sign(payer, ...signers);
  const raw = transaction.serialize({
    requireAllSignatures: true,
    verifySignatures: true,
  });
  return submitBuilt({
    connection,
    built: { transaction, raw },
    latestBlockhash,
    stage,
  });
};

const readActiveV3Feature = async (connection, finalizedSlot) => {
  const address = new PublicKey(SOLANA_SBPF_V3_ENABLE_FEATURE_ID);
  const account = await accountOrThrow(
    connection,
    address,
    "Local SBPF V3 enable feature",
  );
  if (
    !account.owner.equals(new PublicKey(SOLANA_FEATURE_PROGRAM_ID)) ||
    account.executable ||
    account.data.length !== 9 ||
    account.data[0] !== 1
  ) {
    throw new Error("Local Agave does not expose the active SBPF V3 feature.");
  }
  const activationSlot = account.data.readBigUInt64LE(1);
  if (activationSlot > BigInt(finalizedSlot)) {
    throw new Error("Local SBPF V3 feature activation is not finalized.");
  }
  return {
    featureId: address.toBase58(),
    owner: account.owner.toBase58(),
    active: true,
    activationSlot: Number(activationSlot),
    accountDataSha256: solanaSha256(account.data),
  };
};

/**
 * Runs the real Loader-v3 lifecycle against a disposable loopback validator.
 * The returned report is diagnostic evidence only and always says
 * productionReady:false.
 */
export const runSolanaLoaderV3FreshDeployLocalAcceptance = async ({
  connection,
  artifactBytesByRole,
  airdropLamports = 100 * LAMPORTS_PER_SOL,
  dependencies = {},
} = {}) => {
  const endpoint = assertLoopbackConnection(connection);
  const artifacts = assertArtifacts(artifactBytesByRole);
  if (!Number.isSafeInteger(airdropLamports) || airdropLamports <= 0) {
    throw new Error(
      "Local acceptance airdrop must be a positive safe integer.",
    );
  }
  const generateKeypair =
    dependencies.generateKeypair ?? (() => Keypair.generate());
  const onProgress = dependencies.onProgress ?? (() => {});
  const payer = generateKeypair("payer");
  const authority = generateKeypair("temporaryAuthority");
  const roles = Object.fromEntries(
    SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
      role,
      {
        program: generateKeypair(`program:${role}`),
        buffer: generateKeypair(`buffer:${role}`),
      },
    ]),
  );
  const disposableKeypairs = [
    payer,
    authority,
    ...Object.values(roles).flatMap(({ program, buffer }) => [program, buffer]),
  ];
  let report = null;
  let failure = null;
  try {
    const [genesisHash, version, finalizedSlot] = await Promise.all([
      connection.getGenesisHash(),
      connection.getVersion(),
      connection.getSlot("finalized"),
    ]);
    const v3Feature = await readActiveV3Feature(connection, finalizedSlot);
    const airdrop = await connection.requestAirdrop(
      payer.publicKey,
      airdropLamports,
    );
    const airdropConfirmation = await connection.confirmTransaction(
      airdrop,
      "finalized",
    );
    if (airdropConfirmation.value.err !== null) {
      throw new Error("Local acceptance payer airdrop failed.");
    }
    const reports = {};
    let createInitializeSentinel = null;
    for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
      const artifact = artifacts[role];
      const roleSigners = roles[role];
      const programdataAddress = deriveProgramdata(
        roleSigners.program.publicKey,
      );
      for (const [address, label] of [
        [roleSigners.program.publicKey, `${role} Program`],
        [programdataAddress, `${role} ProgramData`],
        [roleSigners.buffer.publicKey, `${role} buffer`],
      ]) {
        if (await connection.getAccountInfo(address, "finalized")) {
          throw new Error(`Local acceptance ${label} unexpectedly exists.`);
        }
      }
      onProgress({ stage: "buffer", role, status: "starting" });
      const bufferSpace = SOLANA_BUFFER_METADATA_LENGTH + artifact.bytes.length;
      const bufferRent = await connection.getMinimumBalanceForRentExemption(
        bufferSpace,
        "finalized",
      );
      const createInitializeInstructions = [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: roleSigners.buffer.publicKey,
          lamports: bufferRent,
          space: bufferSpace,
          programId: LOADER,
        }),
        buildLoaderV3InitializeBufferInstruction({
          bufferAddress: roleSigners.buffer.publicKey,
          authorityAddress: authority.publicKey,
        }),
      ];
      if (role === SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER[0]) {
        createInitializeSentinel = await simulateRollbackSentinel({
          connection,
          payer,
          signers: [roleSigners.buffer],
          instructions: createInitializeInstructions,
          snapshotAddresses: [
            payer.publicKey,
            roleSigners.buffer.publicKey,
            roleSigners.program.publicKey,
            programdataAddress,
          ],
          stage: `local-create-initialize-buffer:${role}`,
        });
      }
      const initialize = await submitInstructions({
        connection,
        payer,
        signers: [roleSigners.buffer],
        stage: `local-create-initialize-buffer:${role}`,
        instructions: createInitializeInstructions,
      });
      const writes = [];
      let offset = 0;
      while (offset < artifact.bytes.length) {
        const latestBlockhash =
          await connection.getLatestBlockhash("finalized");
        const selected = selectLargestLoaderV3WriteChunk({
          remainingBytes: artifact.bytes.subarray(offset),
          offset,
          bufferAddress: roleSigners.buffer.publicKey,
          authorityAddress: authority.publicKey,
          payerSigner: payer,
          authoritySigner: authority,
          latestBlockhash,
        });
        const write = await submitBuilt({
          connection,
          built: selected,
          latestBlockhash,
          stage: `local-write-buffer:${role}:${offset}`,
          commitment: "confirmed",
        });
        writes.push({ offset, length: selected.length, transaction: write });
        offset += selected.length;
        onProgress({
          stage: "buffer",
          role,
          status: "writing",
          writtenBytes: offset,
          totalBytes: artifact.bytes.length,
        });
      }
      const finalizedWrites = await finalizeWriteTransactions({
        connection,
        writes,
        stage: `local-write-buffer:${role}`,
      });
      const buffer = await accountOrThrow(
        connection,
        roleSigners.buffer.publicKey,
        `${role} populated buffer`,
      );
      if (
        !buffer.owner.equals(LOADER) ||
        buffer.executable ||
        buffer.data.length !== bufferSpace ||
        buffer.data.readUInt32LE(0) !== 1 ||
        buffer.data[4] !== 1 ||
        !new PublicKey(buffer.data.subarray(5, 37)).equals(
          authority.publicKey,
        ) ||
        !buffer.data
          .subarray(SOLANA_BUFFER_METADATA_LENGTH)
          .equals(artifact.bytes)
      ) {
        throw new Error(
          `${role} local populated buffer readback is not exact.`,
        );
      }
      const programRent = await connection.getMinimumBalanceForRentExemption(
        PROGRAM_ACCOUNT_LENGTH,
        "finalized",
      );
      const deploy = await submitInstructions({
        connection,
        payer,
        signers: [roleSigners.program, authority],
        stage: `local-fresh-deploy:${role}`,
        instructions: [
          SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: roleSigners.program.publicKey,
            lamports: programRent,
            space: PROGRAM_ACCOUNT_LENGTH,
            programId: LOADER,
          }),
          buildLoaderV3DeployWithMaxDataLenInstruction({
            payerAddress: payer.publicKey,
            programId: roleSigners.program.publicKey,
            programdataAddress,
            bufferAddress: roleSigners.buffer.publicKey,
            authorityAddress: authority.publicKey,
            maxDataLength: artifact.bytes.length,
          }),
        ],
      });
      if (
        await connection.getAccountInfo(
          roleSigners.buffer.publicKey,
          "finalized",
        )
      ) {
        throw new Error(`${role} local Loader-v3 buffer was not consumed.`);
      }
      const programAccount = await accountOrThrow(
        connection,
        roleSigners.program.publicKey,
        `${role} Program`,
      );
      const programdataAccount = await accountOrThrow(
        connection,
        programdataAddress,
        `${role} ProgramData`,
      );
      reports[role] = {
        role,
        programId: roleSigners.program.publicKey.toBase58(),
        programdataAddress: programdataAddress.toBase58(),
        bufferAddress: roleSigners.buffer.publicKey.toBase58(),
        artifact: {
          executableLength: artifact.executableLength,
          executableSha256: artifact.executableSha256,
          codeHash: artifact.codeHash,
          sbpfVersion: "V3",
        },
        initialize,
        writes: finalizedWrites,
        deploy,
        programReadback: parseProgram(programAccount, programdataAddress),
        mutableProgramdataReadback: parseProgramdata({
          account: programdataAccount,
          artifact,
          authority: authority.publicKey,
          immutable: false,
          deploySlot: deploy.finalizedSlot,
        }),
      };
      onProgress({ stage: "deploy", role, status: "finalized" });
    }
    const finalizationInstructions =
      SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER.map((role) =>
        buildLoaderV3SetAuthorityNoneInstruction({
          programdataAddress: reports[role].programdataAddress,
          authorityAddress: authority.publicKey,
        }),
      );
    const finalizationSentinel = await simulateRollbackSentinel({
      connection,
      payer,
      signers: [authority],
      instructions: finalizationInstructions,
      snapshotAddresses: [
        payer.publicKey,
        ...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.flatMap((role) => [
          reports[role].programId,
          reports[role].programdataAddress,
        ]),
      ],
      stage: "local-set-authority-none:destination,source,nativeVerifier",
    });
    const finalization = await submitInstructions({
      connection,
      payer,
      signers: [authority],
      stage: "local-set-authority-none:destination,source,nativeVerifier",
      instructions: finalizationInstructions,
    });
    for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
      const programdata = await accountOrThrow(
        connection,
        new PublicKey(reports[role].programdataAddress),
        `${role} immutable ProgramData`,
      );
      reports[role].immutableProgramdataReadback = parseProgramdata({
        account: programdata,
        artifact: artifacts[role],
        authority: authority.publicKey,
        immutable: true,
        deploySlot: reports[role].deploy.finalizedSlot,
      });
      reports[role].immutableFinalization = {
        signature: finalization.signature,
        finalizedSlot: finalization.finalizedSlot,
      };
    }
    report = {
      schema: SOLANA_LOADER_V3_FRESH_LOCAL_ACCEPTANCE_REPORT_SCHEMA,
      ready: true,
      localOnly: true,
      productionReady: false,
      productionEvidence: false,
      mode: "disposable-loopback-agave-loader-v3-acceptance",
      endpoint,
      actualLocalIdentity: {
        genesisHash,
        solanaCoreVersion: version["solana-core"],
        featureSet: version["feature-set"],
        initialFinalizedSlot: finalizedSlot,
        sbpfV3EnableFeature: v3Feature,
      },
      payerAddress: payer.publicKey.toBase58(),
      temporaryAuthorityAddress: authority.publicKey.toBase58(),
      airdropSignature: airdrop,
      programs: SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map(
        (role) => reports[role],
      ),
      immutableFinalization: {
        ...finalization,
        roleOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
        oneAtomicTransaction: true,
      },
      rollbackSentinelSimulations: {
        createInitialize: createInitializeSentinel,
        immutableFinalization: finalizationSentinel,
      },
      runtimeSignerMaterialZeroized: false,
    };
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  try {
    zeroize(disposableKeypairs);
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "Local acceptance and zeroization failed.",
        )
      : error;
  }
  if (failure) throw failure;
  report.runtimeSignerMaterialZeroized = true;
  return report;
};

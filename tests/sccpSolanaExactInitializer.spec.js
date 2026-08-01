// @vitest-environment node
/* global BigInt */
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bs58 from "bs58";
import { blake2b } from "@noble/hashes/blake2b";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA,
  SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA,
  acquireSolanaExactInitializerLease,
  assertSolanaExactBootstrapIntentBinding,
  assertSolanaExactCompletedEvidenceBinding,
  assertSolanaExactFinalizedTransactionReadback,
  assertSolanaExactFreshDeployReportBinding,
  assertSolanaExactImmutableProgram,
  buildSolanaExactOrderedEvidence,
  createSolanaExactJsonExclusively,
  deriveSolanaExactInitializerAddresses,
  pinSolanaExactOutputDirectory,
  parseSolanaExactInitializerArgs,
  parseSolanaExactCanonicalJsonBytes,
  releaseSolanaExactInitializerLease,
  resolveSolanaExactObservedPreparedAction,
  runSolanaExactInitializer,
  submitSolanaExactPreparedTransaction,
  validateSolanaExactInitializerInput,
  validateSolanaExactInitializerJournal,
  writeSolanaExactJsonAtomically,
} from "../scripts/sccp-solana-exact-initialize.mjs";
import {
  buildExactSolanaNativeMaterialUploadPlan,
  zeroizeRuntimeSolanaSigner,
} from "../scripts/sccp-solana-deploy.mjs";
import {
  SOLANA_TESTNET_RPC_URL,
  validateSolanaOrderedInitializationEvidence,
  verifySolanaAtomicProgramFinalizationTransaction,
} from "../scripts/e2e/sccp-solana-ordered-initialization.mjs";
import { buildExactSolanaDeploymentFixture } from "./helpers/sccpSolanaExactRegistryFixture.js";

const key = (byte) =>
  Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => byte)).publicKey;
const hash = (byte) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const FRESH_DEPLOY_REPORT_BYTES = Buffer.from("{}", "utf8");
const FRESH_DEPLOY_REPORT_SHA256 = `0x${createHash("sha256")
  .update(FRESH_DEPLOY_REPORT_BYTES)
  .digest("hex")}`;
const transactionSignature = (byte) =>
  bs58.encode(Uint8Array.from({ length: 64 }, () => byte));

const programs = Object.freeze({
  destination: key(0x11).toBase58(),
  source: key(0x12).toBase58(),
  native_verifier: key(0x13).toBase58(),
});

const FINALIZATION_SIGNATURE = transactionSignature(0x35);
const FINALIZATION_SLOT = 22;
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const MINT_ADDRESS = key(0x72).toBase58();
const ROLE_INDEX = Object.freeze({
  destination: 0,
  source: 1,
  native_verifier: 2,
});

const canonicalProgramdata = (programAddress) =>
  PublicKey.findProgramAddressSync(
    [new PublicKey(programAddress).toBuffer()],
    LOADER,
  )[0].toBase58();

const upperPublicKey = (address) =>
  Buffer.from(new PublicKey(address).toBytes()).toString("hex").toUpperCase();

const programExecutable = (role) => {
  const executable = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0]).copy(executable);
  executable.writeUInt32LE(3, 48);
  executable[63] = 0x90 + ROLE_INDEX[role];
  return executable;
};

const programArtifactSha256 = (role) =>
  `0x${createHash("sha256").update(programExecutable(role)).digest("hex")}`;

const programCodeHash = (role) =>
  `0x${Buffer.from(blake2b(programExecutable(role), { dkLen: 32 })).toString(
    "hex",
  )}`;

const programdataDeploymentSlot = (role) => 7 + ROLE_INDEX[role];

const finalization = (role) => ({
  program_address: programs[role],
  programdata_address: canonicalProgramdata(programs[role]),
  artifact_sha256: programArtifactSha256(role),
  program_code_hash: programCodeHash(role),
  programdata_deployment_slot: programdataDeploymentSlot(role),
  transaction_signature: FINALIZATION_SIGNATURE,
  finalized_slot: FINALIZATION_SLOT,
});

const input = () => {
  const programFinalizations = {
    destination: finalization("destination"),
    source: finalization("source"),
    native_verifier: finalization("native_verifier"),
  };
  return {
    schema: SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA,
    solana_rpc_url: SOLANA_TESTNET_RPC_URL,
    fresh_deploy_report_sha256: FRESH_DEPLOY_REPORT_SHA256,
    payer_address: key(0x21).toBase58(),
    mint_address: MINT_ADDRESS,
    program_finalizations: programFinalizations,
    route: {
      destination_program_id: programs.destination,
      source_program_id: programs.source,
      native_verifier_program_id: programs.native_verifier,
      route_revision: 1,
    },
    governed_destination_deployment: buildExactSolanaDeploymentFixture({
      tokenMintAddress: upperPublicKey(MINT_ADDRESS),
      routeProgramId: upperPublicKey(programs.destination),
      routeProgramDataAddress: upperPublicKey(
        programFinalizations.destination.programdata_address,
      ),
      routeProgramDataSlot:
        programFinalizations.destination.programdata_deployment_slot,
      routeProgramCodeHash: programFinalizations.destination.program_code_hash
        .slice(2)
        .toUpperCase(),
      nativeVerifierProgramId: upperPublicKey(programs.native_verifier),
      nativeVerifierProgramDataAddress: upperPublicKey(
        programFinalizations.native_verifier.programdata_address,
      ),
      nativeVerifierProgramDataSlot:
        programFinalizations.native_verifier.programdata_deployment_slot,
      nativeVerifierProgramCodeHash:
        programFinalizations.native_verifier.program_code_hash
          .slice(2)
          .toUpperCase(),
      sourceProgramId: upperPublicKey(programs.source),
      routeRevision: 1,
    }),
  };
};

const freshDeployReportFor = (reviewed) => {
  const roleMap = {
    destination: "destination",
    source: "source",
    native_verifier: "nativeVerifier",
  };
  const programsByRole = Object.fromEntries(
    Object.entries(roleMap).map(([initializerRole, reportRole]) => {
      const record = reviewed.program_finalizations[initializerRole];
      return [
        reportRole,
        {
          programId: record.program_address,
          programdataAddress: record.programdata_address,
          artifactSha256: record.artifact_sha256,
          codeHash: record.program_code_hash,
          deploy: { finalizedSlot: record.programdata_deployment_slot },
          immutableProgramdataReadback: {
            deploymentSlot: record.programdata_deployment_slot,
            immutable: true,
          },
          immutableFinalization: {
            signature: record.transaction_signature,
            finalizedSlot: record.finalized_slot,
          },
        },
      ];
    }),
  );
  const finalization = reviewed.program_finalizations.destination;
  return {
    reportSha256: FRESH_DEPLOY_REPORT_SHA256,
    operationId: hash(0xe1),
    planSha256: hash(0xe2),
    programsByRole,
    immutableFinalization: {
      oneAtomicTransaction: true,
      signature: finalization.transaction_signature,
      finalizedSlot: finalization.finalized_slot,
    },
  };
};

const freshDeployReportValidatorFor = (reviewed) =>
  vi.fn(() => freshDeployReportFor(reviewed));

const atomicFinalizationPins = () =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(programs).map(([role, programAddress]) => [
        role,
        Object.freeze({
          programAddress,
          programdataAddress: canonicalProgramdata(programAddress),
          transactionSignature: FINALIZATION_SIGNATURE,
          finalizedSlot: FINALIZATION_SLOT,
        }),
      ]),
    ),
  );

const FINALIZATION_AUTHORITY = key(0x36).toBase58();
const loaderSetAuthorityNone = (programdataAddress, authority) => ({
  programId: LOADER.toBase58(),
  accounts: [programdataAddress, authority],
  data: bs58.encode(Buffer.from([4, 0, 0, 0])),
});

const atomicFinalizationReadback = (
  pins = atomicFinalizationPins(),
  authority = FINALIZATION_AUTHORITY,
) => {
  const instructions = Object.values(pins).map((entry) =>
    loaderSetAuthorityNone(entry.programdataAddress, authority),
  );
  const accountKeys = [
    ...Object.values(pins).map((entry) => ({
      pubkey: entry.programdataAddress,
      signer: false,
      writable: true,
    })),
    { pubkey: authority, signer: true, writable: false },
    { pubkey: LOADER.toBase58(), signer: false, writable: false },
  ];
  return {
    slot: FINALIZATION_SLOT,
    meta: { err: null, innerInstructions: [] },
    transaction: {
      signatures: [FINALIZATION_SIGNATURE],
      message: { accountKeys, instructions },
    },
  };
};

const reviewedInputAndImmutableAccounts = () => {
  const reviewed = input();
  const accounts = new Map();
  for (const [role, programAddress] of Object.entries(programs)) {
    const program = new PublicKey(programAddress);
    const programdata = new PublicKey(canonicalProgramdata(programAddress));
    const executable = programExecutable(role);
    const programData = Buffer.alloc(36);
    programData.writeUInt32LE(2, 0);
    programdata.toBuffer().copy(programData, 4);
    const programdataData = Buffer.alloc(45 + executable.length);
    programdataData.writeUInt32LE(3, 0);
    programdataData.writeBigUInt64LE(
      BigInt(programdataDeploymentSlot(role)),
      4,
    );
    programdataData[12] = 0;
    executable.copy(programdataData, 45);
    accounts.set(program.toBase58(), {
      owner: LOADER,
      executable: true,
      data: programData,
    });
    accounts.set(programdata.toBase58(), {
      owner: LOADER,
      executable: false,
      data: programdataData,
    });
  }
  const pins = Object.fromEntries(
    Object.entries(reviewed.program_finalizations).map(([role, entry]) => [
      role,
      {
        programAddress: entry.program_address,
        programdataAddress: entry.programdata_address,
        transactionSignature: entry.transaction_signature,
        finalizedSlot: entry.finalized_slot,
      },
    ]),
  );
  return { reviewed, accounts, pins };
};

const reviewedConnection = ({ accounts, pins }) => ({
  getGenesisHash: vi
    .fn()
    .mockResolvedValue("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"),
  getParsedTransaction: vi
    .fn()
    .mockResolvedValue(atomicFinalizationReadback(pins)),
  getAccountInfo: vi.fn(
    async (address) => accounts.get(address.toBase58()) ?? null,
  ),
  getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(1_000_000),
});

describe("production-safe exact Solana initializer", () => {
  it("pre-verifies one exact role-ordered atomic finalization with a shared authority", async () => {
    const pins = atomicFinalizationPins();
    const readback = atomicFinalizationReadback(pins);
    const connection = {
      getParsedTransaction: vi.fn().mockResolvedValue(readback),
    };
    await expect(
      verifySolanaAtomicProgramFinalizationTransaction(connection, pins),
    ).resolves.toEqual({
      ready: true,
      signature: FINALIZATION_SIGNATURE,
      finalizedSlot: FINALIZATION_SLOT,
      authorityAddress: FINALIZATION_AUTHORITY,
      roles: ["destination", "source", "native_verifier"],
      programdataAddresses: {
        destination: pins.destination.programdataAddress,
        source: pins.source.programdataAddress,
        native_verifier: pins.native_verifier.programdataAddress,
      },
    });
    expect(connection.getParsedTransaction).toHaveBeenCalledWith(
      FINALIZATION_SIGNATURE,
      { commitment: "finalized", maxSupportedTransactionVersion: 0 },
    );
  });

  it("rejects separate, extra, reordered, mixed-authority, and identity-confused finalizations", async () => {
    const pins = atomicFinalizationPins();
    const expectRejected = async (mutate, pattern = /Atomic Loader-v3/u) => {
      const readback = atomicFinalizationReadback(pins);
      mutate(readback);
      await expect(
        verifySolanaAtomicProgramFinalizationTransaction(
          { getParsedTransaction: vi.fn().mockResolvedValue(readback) },
          pins,
        ),
      ).rejects.toThrow(pattern);
    };

    await expectRejected((readback) => {
      readback.transaction.message.instructions.splice(1);
    });
    await expectRejected((readback) => {
      readback.transaction.message.instructions.push(
        structuredClone(readback.transaction.message.instructions[2]),
      );
    });
    await expectRejected((readback) => {
      const instructions = readback.transaction.message.instructions;
      [instructions[0], instructions[1]] = [instructions[1], instructions[0]];
    });
    await expectRejected((readback) => {
      const otherAuthority = key(0x37).toBase58();
      readback.transaction.message.accountKeys.push({
        pubkey: otherAuthority,
        signer: true,
        writable: false,
      });
      readback.transaction.message.instructions[1].accounts[1] = otherAuthority;
    }, /shared current authority/u);

    const wrongProgramdata = structuredClone(pins);
    wrongProgramdata.source.programdataAddress = key(0x38).toBase58();
    await expect(
      verifySolanaAtomicProgramFinalizationTransaction(
        {
          getParsedTransaction: vi
            .fn()
            .mockResolvedValue(atomicFinalizationReadback(wrongProgramdata)),
        },
        wrongProgramdata,
      ),
    ).rejects.toThrow(/SetAuthority\(None\)/u);
  });

  it("rejects finalization signature, slot, and parsed-readback drift", async () => {
    const pins = atomicFinalizationPins();
    const mixedSignature = structuredClone(pins);
    mixedSignature.source.transactionSignature = transactionSignature(0x39);
    await expect(
      verifySolanaAtomicProgramFinalizationTransaction(
        { getParsedTransaction: vi.fn() },
        mixedSignature,
      ),
    ).rejects.toThrow(/one atomic transaction signature/u);

    const mixedSlot = structuredClone(pins);
    mixedSlot.native_verifier.finalizedSlot += 1;
    await expect(
      verifySolanaAtomicProgramFinalizationTransaction(
        { getParsedTransaction: vi.fn() },
        mixedSlot,
      ),
    ).rejects.toThrow(/one atomic transaction signature/u);

    for (const mutate of [
      (readback) => {
        readback.slot += 1;
      },
      (readback) => {
        readback.transaction.signatures[0] = transactionSignature(0x3a);
      },
      (readback) => {
        readback.meta.err = { InstructionError: [0, "Custom"] };
      },
    ]) {
      const readback = atomicFinalizationReadback(pins);
      mutate(readback);
      await expect(
        verifySolanaAtomicProgramFinalizationTransaction(
          { getParsedTransaction: vi.fn().mockResolvedValue(readback) },
          pins,
        ),
      ).rejects.toThrow(/claimed successful finalized/u);
    }

    const missingSignerMetadata = atomicFinalizationReadback(pins);
    missingSignerMetadata.transaction.message.accountKeys.find(
      ({ pubkey }) => pubkey === FINALIZATION_AUTHORITY,
    ).signer = null;
    await expect(
      verifySolanaAtomicProgramFinalizationTransaction(
        {
          getParsedTransaction: vi
            .fn()
            .mockResolvedValue(missingSignerMetadata),
        },
        pins,
      ),
    ).rejects.toThrow(/not a transaction signer/u);
  });

  it("rejects a non-exact finalization before signer access, journal creation, or mutation", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-exact-preflight-"),
    );
    try {
      const reviewed = input();
      for (const [role, programAddress] of Object.entries(programs)) {
        reviewed.program_finalizations[role].programdata_address =
          canonicalProgramdata(programAddress);
      }
      const inputBytes = Buffer.from(`${JSON.stringify(reviewed)}\n`, "utf8");
      const inputPath = path.join(directory, "input.json");
      const freshDeployReportPath = path.join(
        directory,
        "fresh-deploy-report.json",
      );
      const journalPath = path.join(directory, "journal.json");
      const evidencePath = path.join(directory, "evidence.json");
      await writeFile(inputPath, inputBytes);
      await writeFile(freshDeployReportPath, FRESH_DEPLOY_REPORT_BYTES);
      const readback = atomicFinalizationReadback(
        Object.fromEntries(
          Object.entries(reviewed.program_finalizations).map(
            ([role, entry]) => [
              role,
              {
                programAddress: entry.program_address,
                programdataAddress: entry.programdata_address,
                transactionSignature: entry.transaction_signature,
                finalizedSlot: entry.finalized_slot,
              },
            ],
          ),
        ),
      );
      readback.transaction.message.instructions.push(
        structuredClone(readback.transaction.message.instructions[2]),
      );
      const runtimeSignerLoader = vi.fn();
      const sendRawTransaction = vi.fn();
      const getAccountInfo = vi.fn();
      await expect(
        runSolanaExactInitializer({
          inputPath,
          expectedInputSha256: `0x${createHash("sha256")
            .update(inputBytes)
            .digest("hex")}`,
          freshDeployReportPath,
          expectedFreshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
          journalPath,
          evidencePath,
          runtimeSignerLoader,
          freshDeployReportValidator: freshDeployReportValidatorFor(reviewed),
          freshDeployTransactionVerifier: vi.fn().mockResolvedValue({
            ready: true,
            reportSha256: FRESH_DEPLOY_REPORT_SHA256,
          }),
          connection: {
            getGenesisHash: vi
              .fn()
              .mockResolvedValue(
                "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
              ),
            getParsedTransaction: vi.fn().mockResolvedValue(readback),
            getAccountInfo,
            sendRawTransaction,
          },
        }),
      ).rejects.toThrow(/exactly three instructions/u);
      expect(runtimeSignerLoader).not.toHaveBeenCalled();
      expect(getAccountInfo).not.toHaveBeenCalled();
      expect(sendRawTransaction).not.toHaveBeenCalled();
      await expect(
        import("node:fs/promises").then(({ access }) => access(journalPath)),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts only exact reviewed input and derives both role-and-mint PDAs", () => {
    const normalized = validateSolanaExactInitializerInput(input());
    const mint = key(0x72);
    const addresses = deriveSolanaExactInitializerAddresses({
      programs: normalized.programs,
      mintAddress: mint.toBase58(),
    });
    const destination = PublicKey.findProgramAddressSync(
      [Buffer.from("sccp-route-state-v1"), Buffer.from([1]), mint.toBuffer()],
      new PublicKey(programs.destination),
    )[0];
    const source = PublicKey.findProgramAddressSync(
      [Buffer.from("sccp-route-state-v1"), Buffer.from([2]), mint.toBuffer()],
      new PublicKey(programs.source),
    )[0];
    expect(addresses).toEqual({
      mintAddress: mint.toBase58(),
      destinationStateAddress: destination.toBase58(),
      sourceStateAddress: source.toBase58(),
    });
    expect(
      assertSolanaExactFreshDeployReportBinding({
        normalized,
        freshDeployReport: freshDeployReportFor(input()),
      }),
    ).toMatchObject({
      ready: true,
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
    });
    const staleDeploy = freshDeployReportFor(input());
    staleDeploy.programsByRole.source.deploy.finalizedSlot -= 1;
    expect(() =>
      assertSolanaExactFreshDeployReportBinding({
        normalized,
        freshDeployReport: staleDeploy,
      }),
    ).toThrow(/differs from the canonical fresh-deploy report/u);

    const hostile = input();
    hostile.route.source_program_id = hostile.route.destination_program_id;
    expect(() => validateSolanaExactInitializerInput(hostile)).toThrow(
      /aliased|differ/u,
    );

    const noncanonicalProgramdata = input();
    noncanonicalProgramdata.program_finalizations.source.programdata_address =
      key(0xd0).toBase58();
    expect(() =>
      validateSolanaExactInitializerInput(noncanonicalProgramdata),
    ).toThrow(/canonical Loader-v3 PDA/u);

    for (const deploymentSlot of [FINALIZATION_SLOT, FINALIZATION_SLOT + 1]) {
      const invalidOrder = input();
      invalidOrder.program_finalizations.destination.programdata_deployment_slot =
        deploymentSlot;
      expect(() => validateSolanaExactInitializerInput(invalidOrder)).toThrow(
        /deployed before atomic authority removal/u,
      );
    }

    const mismatchedGovernedSlot = input();
    mismatchedGovernedSlot.governed_destination_deployment.route_program_data_slot =
      programdataDeploymentSlot("destination") + 1;
    expect(() =>
      validateSolanaExactInitializerInput(mismatchedGovernedSlot),
    ).toThrow(/pinned fresh deployment/u);
  });

  it("emits the atomic-bootstrap PDA lifecycle as valid ordered evidence", () => {
    const normalized = validateSolanaExactInitializerInput(input());
    const addresses = deriveSolanaExactInitializerAddresses({
      programs: normalized.programs,
      mintAddress: key(0x72).toBase58(),
    });
    const record = (byte, slot) => ({
      program_address: programs.native_verifier,
      account_address: key(0x73).toBase58(),
      transaction_signature: transactionSignature(byte),
      finalized_slot: slot,
    });
    const journal = {
      schema: SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA,
      addresses: { ...addresses, materialAddress: key(0x73).toBase58() },
      bootstrap: {
        transaction_signature: transactionSignature(0x70),
        finalized_slot: 30,
      },
      transactions: {
        material_appends: [
          { ...record(0x71, 31), offset: 0 },
          { ...record(0x72, 32), offset: 512 },
          { ...record(0x73, 33), offset: 1024 },
        ],
        material_seal: record(0x74, 34),
        destination_route_initialize: {
          ...record(0x75, 35),
          program_address: programs.destination,
          account_address: addresses.destinationStateAddress,
        },
        source_route_initialize: {
          ...record(0x76, 36),
          program_address: programs.source,
          account_address: addresses.sourceStateAddress,
        },
      },
    };
    const evidence = buildSolanaExactOrderedEvidence({ normalized, journal });
    expect(
      evidence.initialization_transactions.token_mint_create
        .transaction_signature,
    ).toBe(
      evidence.initialization_transactions.native_verifier_material_initialize
        .transaction_signature,
    );
    expect(validateSolanaOrderedInitializationEvidence(evidence)).toMatchObject(
      {
        maxFinalizationSlot: 22,
        firstInitializationSlot: 30,
      },
    );
  });

  it("deep-binds completed evidence to the current normalized input and journal", () => {
    const normalized = validateSolanaExactInitializerInput(input());
    const addresses = deriveSolanaExactInitializerAddresses({
      programs: normalized.programs,
      mintAddress: key(0x72).toBase58(),
    });
    const record = (byte, slot) => ({
      program_address: programs.native_verifier,
      account_address: key(0x73).toBase58(),
      transaction_signature: transactionSignature(byte),
      finalized_slot: slot,
    });
    const journal = {
      addresses: { ...addresses, materialAddress: key(0x73).toBase58() },
      bootstrap: {
        transaction_signature: transactionSignature(0x70),
        finalized_slot: 30,
      },
      transactions: {
        material_appends: [
          { ...record(0x71, 31), offset: 0 },
          { ...record(0x72, 32), offset: 512 },
          { ...record(0x73, 33), offset: 1024 },
        ],
        material_seal: record(0x74, 34),
        destination_route_initialize: {
          ...record(0x75, 35),
          program_address: programs.destination,
          account_address: addresses.destinationStateAddress,
        },
        source_route_initialize: {
          ...record(0x76, 36),
          program_address: programs.source,
          account_address: addresses.sourceStateAddress,
        },
      },
    };
    const evidence = buildSolanaExactOrderedEvidence({ normalized, journal });
    expect(
      assertSolanaExactCompletedEvidenceBinding({
        normalized,
        journal,
        evidence,
      }),
    ).toMatchObject({ firstInitializationSlot: 30 });

    const crossWired = structuredClone(journal);
    crossWired.transactions.source_route_initialize.transaction_signature =
      transactionSignature(0x77);
    expect(() =>
      assertSolanaExactCompletedEvidenceBinding({
        normalized,
        journal: crossWired,
        evidence,
      }),
    ).toThrow(/not exactly bound/u);
  });

  it("requires an explicit byte pin, public journal paths, and submit opt-in", () => {
    expect(() =>
      parseSolanaExactInitializerArgs([
        "--input",
        "input.json",
        "--expected-input-sha256",
        hash(0x81),
        "--fresh-deploy-report",
        "fresh-deploy-report.json",
        "--expected-fresh-deploy-report-sha256",
        FRESH_DEPLOY_REPORT_SHA256,
        "--journal",
        "journal.json",
        "--evidence",
        "evidence.json",
        "--submit",
        "false",
      ]),
    ).toThrow(/--submit true/u);
    expect(
      parseSolanaExactInitializerArgs([
        "--input",
        "input.json",
        "--expected-input-sha256",
        hash(0x81),
        "--fresh-deploy-report",
        "fresh-deploy-report.json",
        "--expected-fresh-deploy-report-sha256",
        FRESH_DEPLOY_REPORT_SHA256,
        "--journal",
        "journal.json",
        "--evidence",
        "evidence.json",
        "--submit",
        "true",
      ]),
    ).toMatchObject({ expectedInputSha256: hash(0x81) });
  });

  it("accepts only canonical duplicate-free fatal UTF-8 JSON bytes", () => {
    expect(
      parseSolanaExactCanonicalJsonBytes(
        Buffer.from('{"schema":"v2","revision":1}\n'),
        "reviewed input",
      ).value,
    ).toEqual({ schema: "v2", revision: 1 });

    for (const bytes of [
      Buffer.from('{"schema":"v1","schema":"v2"}\n'),
      Buffer.from('{ "schema": "v2" }\n'),
      Buffer.from('{"schema":"v2"}'),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
    ]) {
      expect(() =>
        parseSolanaExactCanonicalJsonBytes(bytes, "reviewed input"),
      ).toThrow(/canonical, duplicate-free UTF-8 JSON/u);
    }
  });

  it("rejects duplicate, malformed, and noncanonical signer options", () => {
    const valid = [
      "--input",
      "input.json",
      "--expected-input-sha256",
      hash(0x81),
      "--fresh-deploy-report",
      "fresh-deploy-report.json",
      "--expected-fresh-deploy-report-sha256",
      FRESH_DEPLOY_REPORT_SHA256,
      "--journal",
      "journal.json",
      "--evidence",
      "evidence.json",
      "--submit",
      "true",
    ];
    expect(() =>
      parseSolanaExactInitializerArgs([
        ...valid,
        "--input",
        "other-input.json",
      ]),
    ).toThrow(/may appear only once/u);
    expect(() =>
      parseSolanaExactInitializerArgs([...valid, "--payer-env", "lowercase"]),
    ).toThrow(/environment variable name is invalid/u);
    expect(() =>
      parseSolanaExactInitializerArgs([...valid.slice(0, -1), "--evidence"]),
    ).toThrow(/--name value pairs/u);
  });

  it("durably replaces private JSON without leaving temporary files", async () => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), "sccp-solana-exact-journal-")),
    );
    const target = path.join(directory, "nested", "journal.json");
    try {
      await mkdir(path.dirname(target), { mode: 0o700 });
      await writeSolanaExactJsonAtomically(target, {
        status: "prepared",
        sequence: 1n,
      });
      await writeSolanaExactJsonAtomically(target, {
        status: "finalized",
        sequence: 2n,
      });
      expect(await readFile(target, "utf8")).toBe(
        '{"status":"finalized","sequence":"2"}\n',
      );
      expect((await stat(target)).mode & 0o777).toBe(0o600);
      expect(await readdir(path.dirname(target))).toEqual(["journal.json"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("holds one durable exclusive lease and never overwrites an initial journal", async () => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), "sccp-solana-exact-lease-")),
    );
    const journalPath = path.join(directory, "journal.json");
    const pin = await pinSolanaExactOutputDirectory(journalPath);
    let lease = null;
    try {
      lease = await acquireSolanaExactInitializerLease({
        journalPath,
        inputSha256: hash(0x81),
        directoryPin: pin,
      });
      await expect(
        acquireSolanaExactInitializerLease({
          journalPath,
          inputSha256: hash(0x81),
          directoryPin: pin,
        }),
      ).rejects.toThrow(/already exists|never auto-break/u);

      await createSolanaExactJsonExclusively(
        journalPath,
        { sequence: 1 },
        { directoryPin: pin },
      );
      await expect(
        createSolanaExactJsonExclusively(
          journalPath,
          { sequence: 2 },
          { directoryPin: pin },
        ),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(journalPath, "utf8")).toBe('{"sequence":1}\n');

      await releaseSolanaExactInitializerLease(lease);
      lease = null;
      const replacementLease = await acquireSolanaExactInitializerLease({
        journalPath,
        inputSha256: hash(0x81),
        directoryPin: pin,
      });
      await releaseSolanaExactInitializerLease(replacementLease);
    } finally {
      if (lease)
        await releaseSolanaExactInitializerLease(lease).catch(() => {});
      await pin.handle.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects symlinked, writable, and inode-swapped output directories", async () => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), "sccp-solana-exact-paths-")),
    );
    const realDirectory = path.join(directory, "real");
    const symlinkDirectory = path.join(directory, "link");
    const writableDirectory = path.join(directory, "writable");
    const pinnedDirectory = path.join(directory, "pinned");
    const movedDirectory = path.join(directory, "pinned-moved");
    let pin = null;
    try {
      await mkdir(realDirectory, { mode: 0o700 });
      await symlink(realDirectory, symlinkDirectory, "dir");
      await expect(
        writeSolanaExactJsonAtomically(
          path.join(symlinkDirectory, "journal.json"),
          { status: "hostile" },
        ),
      ).rejects.toThrow(/symlink|real paths/u);

      await mkdir(writableDirectory, { mode: 0o700 });
      await chmod(writableDirectory, 0o770);
      await expect(
        writeSolanaExactJsonAtomically(
          path.join(writableDirectory, "journal.json"),
          { status: "hostile" },
        ),
      ).rejects.toThrow(/writable by another principal|non-group/u);

      await mkdir(pinnedDirectory, { mode: 0o700 });
      const target = path.join(pinnedDirectory, "journal.json");
      pin = await pinSolanaExactOutputDirectory(target);
      await rename(pinnedDirectory, movedDirectory);
      await mkdir(pinnedDirectory, { mode: 0o700 });
      await expect(
        writeSolanaExactJsonAtomically(
          target,
          { status: "hostile" },
          { directoryPin: pin },
        ),
      ).rejects.toThrow(/identity changed/u);
      await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await pin?.handle.close().catch(() => {});
      await chmod(writableDirectory, 0o700).catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("revalidates a complete journal without loading the runtime payer secret", async () => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), "sccp-solana-exact-complete-")),
    );
    try {
      const { reviewed, accounts, pins } = reviewedInputAndImmutableAccounts();
      const normalized = validateSolanaExactInitializerInput(reviewed);
      const inputPath = path.join(directory, "input.json");
      const freshDeployReportPath = path.join(
        directory,
        "fresh-deploy-report.json",
      );
      const journalPath = path.join(directory, "journal.json");
      const evidencePath = path.join(directory, "evidence.json");
      const addresses = deriveSolanaExactInitializerAddresses({
        programs: normalized.programs,
        mintAddress: normalized.mintAddress,
      });
      const materialPlan = buildExactSolanaNativeMaterialUploadPlan({
        authorityAddress: normalized.payerAddress,
        nativeVerifierProgramId: normalized.programs.native_verifier,
        destinationProgramId: normalized.programs.destination,
        sourceProgramId: normalized.programs.source,
        destinationStateAddress: addresses.destinationStateAddress,
        tokenMintAddress: addresses.mintAddress,
        routeRevision: 1,
        verifyingKeyBytes: normalized.verifyingKey,
        ...normalized.hashes,
      });
      const materialAddress = materialPlan.nativeVerifierMaterialAddress;
      const transactionRecordFor = (
        byte,
        slot,
        programAddress = normalized.programs.native_verifier,
        accountAddress = materialAddress,
      ) => ({
        program_address: programAddress,
        account_address: accountAddress,
        transaction_signature: transactionSignature(byte),
        finalized_slot: slot,
      });
      const finalizedPreparedAttempt = (action, record, byte) => ({
        status: "finalized",
        action,
        program_address: record.program_address,
        account_address: record.account_address,
        transaction_signature: record.transaction_signature,
        message_sha256: hash(byte),
        transaction_sha256: hash(byte + 1),
        transaction_base64: null,
        blockhash: key(byte + 2).toBase58(),
        last_valid_block_height: 100,
        finalized_slot: record.finalized_slot,
      });
      const updatedAt = new Date().toISOString();
      const materialAppends = [
        { ...transactionRecordFor(0xa6, 31), offset: 0 },
        { ...transactionRecordFor(0xa7, 32), offset: 512 },
        { ...transactionRecordFor(0xa8, 33), offset: 1024 },
      ];
      const materialSeal = transactionRecordFor(0xa9, 34);
      const destinationInitialize = transactionRecordFor(
        0xaa,
        35,
        normalized.programs.destination,
        addresses.destinationStateAddress,
      );
      const sourceInitialize = transactionRecordFor(
        0xab,
        36,
        normalized.programs.source,
        addresses.sourceStateAddress,
      );
      const journal = {
        schema: SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA,
        input_sha256: "",
        payer_address: normalized.payerAddress,
        addresses: { ...addresses, materialAddress },
        bootstrap: {
          status: "finalized",
          transaction_signature: transactionSignature(0xa2),
          transaction_base64: null,
          transaction_sha256: hash(0xa3),
          message_sha256: hash(0xa4),
          blockhash: key(0xa5).toBase58(),
          last_valid_block_height: 100,
          finalized_slot: 30,
        },
        prepared_actions: Object.fromEntries([
          ...materialAppends.map((record, index) => {
            const action = `material_append_${record.offset}`;
            return [
              action,
              [finalizedPreparedAttempt(action, record, 0xb0 + index * 3)],
            ];
          }),
          [
            "material_seal",
            [finalizedPreparedAttempt("material_seal", materialSeal, 0xb9)],
          ],
          [
            "destination_route_initialize",
            [
              finalizedPreparedAttempt(
                "destination_route_initialize",
                destinationInitialize,
                0xbc,
              ),
            ],
          ],
          [
            "source_route_initialize",
            [
              finalizedPreparedAttempt(
                "source_route_initialize",
                sourceInitialize,
                0xbf,
              ),
            ],
          ],
        ]),
        transactions: {
          material_appends: materialAppends,
          material_seal: materialSeal,
          destination_route_initialize: destinationInitialize,
          source_route_initialize: sourceInitialize,
        },
        status: "complete",
        updated_at: updatedAt,
        evidence_path: evidencePath,
        evidence_sha256: "",
        rpc_verification: {
          ready: true,
          transaction_count: 8,
          checked_at: updatedAt,
        },
      };
      const inputBytes = Buffer.from(`${JSON.stringify(reviewed)}\n`);
      journal.input_sha256 = `0x${createHash("sha256")
        .update(inputBytes)
        .digest("hex")}`;
      const evidence = buildSolanaExactOrderedEvidence({ normalized, journal });
      const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`);
      journal.evidence_sha256 = `0x${createHash("sha256")
        .update(evidenceBytes)
        .digest("hex")}`;
      const mintConfusedJournal = structuredClone(journal);
      mintConfusedJournal.addresses.mintAddress = key(0xd1).toBase58();
      expect(() =>
        validateSolanaExactInitializerJournal({
          value: mintConfusedJournal,
          normalized,
          inputSha256: journal.input_sha256,
        }),
      ).toThrow(/pinned mint/u);
      await writeFile(inputPath, inputBytes, { mode: 0o600 });
      await writeFile(freshDeployReportPath, FRESH_DEPLOY_REPORT_BYTES, {
        mode: 0o600,
      });
      await writeFile(evidencePath, evidenceBytes, { mode: 0o600 });
      await writeFile(journalPath, `${JSON.stringify(journal)}\n`, {
        mode: 0o600,
      });

      const runtimeSignerLoader = vi.fn(() => {
        throw new Error("secret must not load");
      });
      const initializedAccountVerifier = vi.fn().mockResolvedValue(undefined);
      const orderedTransactionVerifier = vi.fn().mockResolvedValue({
        ready: true,
        transactions: Array.from({ length: 8 }, () => ({})),
      });
      await expect(
        runSolanaExactInitializer({
          inputPath,
          expectedInputSha256: journal.input_sha256,
          freshDeployReportPath,
          expectedFreshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
          journalPath,
          evidencePath,
          connection: reviewedConnection({ accounts, pins }),
          runtimeSignerLoader,
          initializedAccountVerifier,
          orderedTransactionVerifier,
          freshDeployReportValidator: freshDeployReportValidatorFor(reviewed),
          freshDeployTransactionVerifier: vi.fn().mockResolvedValue({
            ready: true,
            reportSha256: FRESH_DEPLOY_REPORT_SHA256,
          }),
        }),
      ).resolves.toMatchObject({
        ready: true,
        mintAddress: addresses.mintAddress,
        materialAddress,
      });
      expect(runtimeSignerLoader).not.toHaveBeenCalled();
      expect(initializedAccountVerifier).toHaveBeenCalledTimes(1);
      expect(orderedTransactionVerifier).toHaveBeenCalledTimes(1);
      await expect(readFile(`${journalPath}.lock`)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a malformed private journal before loading the runtime payer", async () => {
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), "sccp-solana-exact-malformed-")),
    );
    try {
      const { reviewed, accounts, pins } = reviewedInputAndImmutableAccounts();
      const inputBytes = Buffer.from(`${JSON.stringify(reviewed)}\n`);
      const inputPath = path.join(directory, "input.json");
      const freshDeployReportPath = path.join(
        directory,
        "fresh-deploy-report.json",
      );
      const journalPath = path.join(directory, "journal.json");
      const evidencePath = path.join(directory, "evidence.json");
      await writeFile(inputPath, inputBytes, { mode: 0o600 });
      await writeFile(freshDeployReportPath, FRESH_DEPLOY_REPORT_BYTES, {
        mode: 0o600,
      });
      await writeFile(
        journalPath,
        `${JSON.stringify({
          schema: SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA,
          status: "created",
        })}\n`,
        { mode: 0o600 },
      );
      const runtimeSignerLoader = vi.fn();
      await expect(
        runSolanaExactInitializer({
          inputPath,
          expectedInputSha256: `0x${createHash("sha256")
            .update(inputBytes)
            .digest("hex")}`,
          freshDeployReportPath,
          expectedFreshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
          journalPath,
          evidencePath,
          connection: reviewedConnection({ accounts, pins }),
          runtimeSignerLoader,
          freshDeployReportValidator: freshDeployReportValidatorFor(reviewed),
          freshDeployTransactionVerifier: vi.fn().mockResolvedValue({
            ready: true,
            reportSha256: FRESH_DEPLOY_REPORT_SHA256,
          }),
        }),
      ).rejects.toThrow(/unknown or missing field|identity differs/u);
      expect(runtimeSignerLoader).not.toHaveBeenCalled();
      await expect(readFile(`${journalPath}.lock`)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts only canonical immutable Loader-v3 owners and exact executable hashes", async () => {
    const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const programAddress = key(0x82);
    const programdataAddress = key(0x83);
    const executable = Buffer.alloc(64);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0]).copy(executable);
    executable.writeUInt32LE(3, 48);
    executable[63] = 0x84;
    const programData = Buffer.alloc(36);
    programData.writeUInt32LE(2, 0);
    programdataAddress.toBuffer().copy(programData, 4);
    const programdataData = Buffer.alloc(45 + executable.length);
    programdataData.writeUInt32LE(3, 0);
    programdataData.writeBigUInt64LE(7n, 4);
    programdataData[12] = 0;
    executable.copy(programdataData, 45);
    const evidence = {
      program_address: programAddress.toBase58(),
      programdata_address: programdataAddress.toBase58(),
      artifact_sha256: `0x${createHash("sha256")
        .update(executable)
        .digest("hex")}`,
      program_code_hash: `0x${Buffer.from(
        blake2b(executable, { dkLen: 32 }),
      ).toString("hex")}`,
      programdata_deployment_slot: 7,
      transaction_signature: FINALIZATION_SIGNATURE,
      finalized_slot: FINALIZATION_SLOT,
    };
    const account = (owner = loader) => ({
      owner,
      executable: true,
      data: programData,
    });
    const programdata = (owner = loader, data = programdataData) => ({
      owner,
      executable: false,
      data,
    });
    const connection = (program, data) => ({
      getAccountInfo: vi
        .fn()
        .mockResolvedValueOnce(program)
        .mockResolvedValueOnce(data),
    });

    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata()),
        evidence,
        "destination",
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(SystemProgram.programId), programdata()),
        evidence,
        "destination",
      ),
    ).rejects.toThrow(/Loader-v3/u);
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata()),
        { ...evidence, artifact_sha256: hash(0x85) },
        "destination",
      ),
    ).rejects.toThrow(/pins differ/u);
    const disabledZeroSentinel = Buffer.from(programdataData);
    disabledZeroSentinel[12] = 1;
    disabledZeroSentinel.fill(0, 13, 45);
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata(loader, disabledZeroSentinel)),
        evidence,
        "destination",
      ),
    ).rejects.toThrow(/immutable/u);

    const dirtyNone = Buffer.from(programdataData);
    dirtyNone[13] = 1;
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata(loader, dirtyNone)),
        evidence,
        "destination",
      ),
    ).resolves.toBeUndefined();

    const wrongDeploymentSlot = Buffer.from(programdataData);
    wrongDeploymentSlot.writeBigUInt64LE(8n, 4);
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata(loader, wrongDeploymentSlot)),
        evidence,
        "destination",
      ),
    ).rejects.toThrow(/pins differ/u);

    const paddedExecutable = Buffer.concat([programdataData, Buffer.from([0])]);
    await expect(
      assertSolanaExactImmutableProgram(
        connection(account(), programdata(loader, paddedExecutable)),
        evidence,
        "destination",
      ),
    ).rejects.toThrow(/pins differ/u);

    const wrongLink = Buffer.from(programData);
    key(0x84).toBuffer().copy(wrongLink, 4);
    await expect(
      assertSolanaExactImmutableProgram(
        connection({ ...account(), data: wrongLink }, programdata()),
        evidence,
        "destination",
      ),
    ).rejects.toThrow(/pins differ/u);
  });

  it("journals each signed message before broadcast and rejects RPC signature drift", async () => {
    const payer = Keypair.generate();
    const recipient = key(0x86);
    const instruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 1,
    });
    const latest = {
      blockhash: key(0x87).toBase58(),
      lastValidBlockHeight: 100,
    };
    const writeFailure = vi.fn().mockRejectedValue(new Error("disk full"));
    const noBroadcast = vi.fn();
    await expect(
      submitSolanaExactPreparedTransaction({
        connection: {
          getLatestBlockhash: vi.fn().mockResolvedValue(latest),
          sendRawTransaction: noBroadcast,
        },
        payerAddress: payer.publicKey,
        acquirePayer: () => payer,
        instructions: [instruction],
        label: "append",
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        journal: { prepared_actions: {} },
        journalPath: "/tmp/never-written.json",
        writeJournal: writeFailure,
      }),
    ).rejects.toThrow(/disk full/u);
    expect(noBroadcast).not.toHaveBeenCalled();

    const writeJournal = vi.fn().mockResolvedValue(undefined);
    const sendRawTransaction = vi
      .fn()
      .mockResolvedValue(transactionSignature(0x88));
    await expect(
      submitSolanaExactPreparedTransaction({
        connection: {
          getLatestBlockhash: vi.fn().mockResolvedValue(latest),
          sendRawTransaction,
        },
        payerAddress: payer.publicKey,
        acquirePayer: () => payer,
        instructions: [instruction],
        label: "append",
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        journal: { prepared_actions: {} },
        journalPath: "/tmp/public-journal.json",
        writeJournal,
      }),
    ).rejects.toThrow(/different transaction signature/u);
    expect(writeJournal.mock.invocationCallOrder[0]).toBeLessThan(
      sendRawTransaction.mock.invocationCallOrder[0],
    );
    zeroizeRuntimeSolanaSigner(payer);
  });

  it("rejects a self-consistent signed wire that is relabeled as a current action or bootstrap", async () => {
    const payer = Keypair.generate();
    const recipient = key(0x91);
    const blockhash = key(0x92).toBase58();
    const intendedInstruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 1,
    });
    const hostileInstruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 2,
    });
    const hostileMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [hostileInstruction],
    }).compileToLegacyMessage();
    const hostileTransaction = new VersionedTransaction(hostileMessage);
    hostileTransaction.sign([payer]);
    const wire = Buffer.from(hostileTransaction.serialize());
    const attempt = {
      status: "prepared",
      action: "material_append_0",
      program_address: SystemProgram.programId.toBase58(),
      account_address: recipient.toBase58(),
      transaction_signature: bs58.encode(hostileTransaction.signatures[0]),
      message_sha256: `0x${createHash("sha256")
        .update(hostileMessage.serialize())
        .digest("hex")}`,
      transaction_sha256: `0x${createHash("sha256")
        .update(wire)
        .digest("hex")}`,
      transaction_base64: wire.toString("base64"),
      blockhash,
      last_valid_block_height: 100,
      finalized_slot: null,
    };
    const getTransaction = vi.fn();
    const sendRawTransaction = vi.fn();
    await expect(
      submitSolanaExactPreparedTransaction({
        connection: { getTransaction, sendRawTransaction },
        payerAddress: payer.publicKey,
        acquirePayer: vi.fn(),
        instructions: [intendedInstruction],
        label: "append",
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        journal: {
          prepared_actions: { material_append_0: [attempt] },
        },
        journalPath: "/tmp/public-journal.json",
        writeJournal: vi.fn(),
      }),
    ).rejects.toThrow(/current exact instruction intent/u);
    expect(getTransaction).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();

    expect(() =>
      assertSolanaExactBootstrapIntentBinding({
        bootstrap: attempt,
        payerAddress: payer.publicKey,
        instructions: [intendedInstruction],
      }),
    ).toThrow(/current exact instruction intent/u);
    zeroizeRuntimeSolanaSigner(payer);
  });

  it("rejects finalized message drift and wipes the actual web3 key backing view", () => {
    const payer = Keypair.generate();
    const blockhash = key(0x89).toBase58();
    const build = (lamports) => {
      const message = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: key(0x8a),
            lamports,
          }),
        ],
      }).compileToLegacyMessage();
      const transaction = new VersionedTransaction(message);
      transaction.sign([payer]);
      return transaction;
    };
    const intended = build(1);
    const hostile = build(2);
    const expectedSignature = bs58.encode(intended.signatures[0]);
    const expectedMessageSha256 = `0x${createHash("sha256")
      .update(intended.message.serialize())
      .digest("hex")}`;
    expect(() =>
      assertSolanaExactFinalizedTransactionReadback({
        readback: {
          slot: 90,
          meta: { err: null },
          transaction: {
            signatures: [expectedSignature],
            message: hostile.message,
          },
        },
        expectedSignature,
        expectedMessageSha256,
        label: "hostile readback",
      }),
    ).toThrow(/locally signed intent/u);

    const backing = payer._keypair.secretKey;
    expect(backing.some((byte) => byte !== 0)).toBe(true);
    zeroizeRuntimeSolanaSigner(payer);
    expect(backing.every((byte) => byte === 0)).toBe(true);
  });

  it("never discovers state without a prepared intent and stops an expired attempt before resigning", async () => {
    const payer = Keypair.generate();
    const recipient = key(0x8b);
    const instruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 1,
    });
    await expect(
      resolveSolanaExactObservedPreparedAction({
        connection: { getTransaction: vi.fn() },
        journal: { prepared_actions: {} },
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        label: "material append at 0",
      }),
    ).rejects.toThrow(/without a journaled locally signed prepared intent/u);

    const journal = { prepared_actions: {} };
    const latest = {
      blockhash: key(0x8c).toBase58(),
      lastValidBlockHeight: 100,
    };
    await expect(
      submitSolanaExactPreparedTransaction({
        connection: {
          getLatestBlockhash: vi.fn().mockResolvedValue(latest),
          sendRawTransaction: vi.fn().mockRejectedValue(new Error("offline")),
        },
        payerAddress: payer.publicKey,
        acquirePayer: () => payer,
        instructions: [instruction],
        label: "append",
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        journal,
        journalPath: "/tmp/public-journal.json",
        writeJournal: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(/offline/u);

    const noResign = vi.fn();
    const noBroadcast = vi.fn();
    await expect(
      submitSolanaExactPreparedTransaction({
        connection: {
          getTransaction: vi.fn().mockResolvedValue(null),
          getSignatureStatuses: vi.fn().mockResolvedValue({ value: [null] }),
          getBlockHeight: vi.fn().mockResolvedValue(101),
          getLatestBlockhash: noResign,
          sendRawTransaction: noBroadcast,
        },
        payerAddress: payer.publicKey,
        acquirePayer: noResign,
        instructions: [instruction],
        label: "append",
        action: "material_append_0",
        programAddress: SystemProgram.programId,
        accountAddress: recipient,
        journal,
        journalPath: "/tmp/public-journal.json",
        writeJournal: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(/expired; review/u);
    expect(noResign).not.toHaveBeenCalled();
    expect(noBroadcast).not.toHaveBeenCalled();
    expect(journal.prepared_actions.material_append_0.at(-1)).toMatchObject({
      status: "expired",
      transaction_base64: null,
    });
    zeroizeRuntimeSolanaSigner(payer);
  });
});

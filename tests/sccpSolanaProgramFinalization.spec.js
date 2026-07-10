// @vitest-environment node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_LOADER_V3_SET_AUTHORITY_NONE_DATA_HEX,
  SOLANA_PROGRAM_FINALIZATION_SCHEMA,
  SOLANA_TESTNET_GENESIS_HASH,
  assertCanonicalSolanaProgramFinalizationTransaction,
  buildSolanaLoaderV3SetAuthorityNoneInstruction,
  buildSolanaProductionRequirementsReportBody,
  buildSolanaProgramFinalizationReadbackValidation,
  buildSolanaProgramFinalizationReportValidation,
  finalizeSolanaProgramsWithRuntime,
  readExistingSolanaProgramFinalizationReportBytes,
} from "../scripts/sccp-solana-deploy.mjs";

const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
const roleSpecs = [
  {
    role: "outerVerifier",
    prefix: "outerVerifier",
    programSeed: 1,
    programdataSeed: 11,
    slot: "420442735",
  },
  {
    role: "destinationBridge",
    prefix: "destinationBridge",
    programSeed: 2,
    programdataSeed: 12,
    slot: "420442737",
  },
  {
    role: "sourceBridge",
    prefix: "sourceBridge",
    programSeed: 3,
    programdataSeed: 13,
    slot: "420442738",
  },
  {
    role: "nativeVerifier",
    prefix: "nativeVerifier",
    programSeed: 4,
    programdataSeed: 14,
    slot: "420442739",
  },
];

const publicKey = (seed) =>
  Keypair.fromSeed(
    Uint8Array.from({ length: 32 }, () => seed),
  ).publicKey.toBase58();
const hash = (label) => `0x${createHash("sha256").update(label).digest("hex")}`;

const authoritySigner = () =>
  Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 99));

const governanceApproval = () => {
  const authority = authoritySigner().publicKey.toBase58();
  const pins = { programFinalizationAuthority: authority };
  for (const spec of roleSpecs) {
    pins[`${spec.prefix}ProgramId`] = publicKey(spec.programSeed);
    pins[`${spec.prefix}ProgramdataAddress`] = publicKey(spec.programdataSeed);
    pins[`${spec.prefix}ProgramdataSlot`] = spec.slot;
    pins[`${spec.prefix}ArtifactSha256`] = hash(`${spec.role}:artifact`);
    pins[`${spec.prefix}CodeHash`] = hash(`${spec.role}:code`);
  }
  return {
    ready: true,
    approvalId: "reviewed-four-program-finalization",
    approvalSha256: hash("approval-bytes"),
    expectedApprovalSha256: hash("approval-bytes"),
    pins,
  };
};

const artifacts = (approval = governanceApproval()) =>
  Object.fromEntries(
    roleSpecs.map((spec) => [
      spec.role,
      approval.pins[`${spec.prefix}ArtifactSha256`],
    ]),
  );

const readbacks = ({
  approval = governanceApproval(),
  immutable = false,
  contextSlot = 110,
} = {}) =>
  Object.fromEntries(
    roleSpecs.map((spec) => {
      const programId = approval.pins[`${spec.prefix}ProgramId`];
      const programdataAddress =
        approval.pins[`${spec.prefix}ProgramdataAddress`];
      return [
        spec.role,
        {
          program: {
            address: programId,
            owner: LOADER_ID,
            executable: true,
            contextSlot,
          },
          parsedProgram: { tag: 2, programdataAddress },
          programdata: {
            address: programdataAddress,
            owner: LOADER_ID,
            executable: false,
            contextSlot,
          },
          parsedProgramdata: {
            tag: 3,
            slot: approval.pins[`${spec.prefix}ProgramdataSlot`],
            executableBlake2b256: approval.pins[`${spec.prefix}CodeHash`],
            executableSha256: hash(`${spec.role}:live-executable`),
            executableLength: 8192,
            executableElf: true,
            immutable,
            upgradeAuthorityOption: immutable ? 0 : 1,
            upgradeAuthorityAddress: immutable
              ? null
              : approval.pins.programFinalizationAuthority,
          },
        },
      ];
    }),
  );

const readyReadbackValidation = () => {
  const approval = governanceApproval();
  return buildSolanaProgramFinalizationReadbackValidation({
    governanceApprovalValidation: approval,
    readbacks: readbacks({ approval }),
    artifactSha256ByRole: artifacts(approval),
    reviewedAuthority: approval.pins.programFinalizationAuthority,
    minContextSlot: 100,
  });
};

const runtimeDependencies = ({
  before,
  after,
  tamperMessage = false,
  genesis = SOLANA_TESTNET_GENESIS_HASH,
} = {}) => ({
  assertRpcIdentity: vi.fn(async () => {
    if (genesis !== SOLANA_TESTNET_GENESIS_HASH) {
      throw new Error("Solana RPC identity mismatch");
    }
    return genesis;
  }),
  getFinalizedSlot: vi.fn(async () => 100),
  readAllProgramReadbacks: vi.fn(async ({ stage }) =>
    stage === "before" ? before : after,
  ),
  getLatestBlockhash: vi.fn(async () => ({
    blockhash: publicKey(31),
    lastValidBlockHeight: 999,
  })),
  broadcastTransaction: vi.fn(
    async ({ transaction, expectedSignature, instructions }) => ({
      signature: expectedSignature,
      confirmation: { value: { err: null } },
      signatureStatus: {
        slot: 150,
        err: null,
        confirmationStatus: "finalized",
      },
      transactionReadback: {
        slot: 150,
        meta: { err: null },
        messageBytes: tamperMessage
          ? Buffer.from("tampered-message")
          : transaction.serializeMessage(),
        transaction: { signatures: [expectedSignature] },
      },
      instructions,
    }),
  ),
});

describe("Solana Loader-v3 finalization ABI", () => {
  it("builds only SetAuthority-to-None with the exact two account metas", () => {
    const instruction = buildSolanaLoaderV3SetAuthorityNoneInstruction({
      programdataAddress: publicKey(11),
      authorityAddress: publicKey(99),
    });
    expect(instruction.programId.toBase58()).toBe(LOADER_ID);
    expect(`0x${Buffer.from(instruction.data).toString("hex")}`).toBe(
      SOLANA_LOADER_V3_SET_AUTHORITY_NONE_DATA_HEX,
    );
    expect(
      instruction.keys.map((meta) => ({
        pubkey: meta.pubkey.toBase58(),
        isSigner: meta.isSigner,
        isWritable: meta.isWritable,
      })),
    ).toEqual([
      { pubkey: publicKey(11), isSigner: false, isWritable: true },
      { pubkey: publicKey(99), isSigner: true, isWritable: false },
    ]);
  });

  it("rejects extra metas, data, wrong loader, and noncanonical role order", () => {
    const validation = readyReadbackValidation();
    const authority = governanceApproval().pins.programFinalizationAuthority;
    const buildTransaction = () => {
      const transaction = new Transaction();
      transaction.feePayer = new PublicKey(authority);
      transaction.recentBlockhash = publicKey(31);
      transaction.add(
        buildSolanaLoaderV3SetAuthorityNoneInstruction({
          programdataAddress:
            validation.roles.outerVerifier.beforeOrAfter.programdataAddress,
          authorityAddress: authority,
        }),
      );
      return transaction;
    };
    expect(
      assertCanonicalSolanaProgramFinalizationTransaction({
        transaction: buildTransaction(),
        mutableRoles: ["outerVerifier"],
        roles: validation.roles,
        authorityAddress: authority,
      }),
    ).toHaveLength(1);

    const mutations = [
      (instruction) => instruction.keys.push(instruction.keys[1]),
      (instruction) => (instruction.data = Buffer.from([4, 0, 0, 0, 0])),
      (instruction) => (instruction.programId = new PublicKey(publicKey(55))),
    ];
    for (const mutate of mutations) {
      const transaction = buildTransaction();
      mutate(transaction.instructions[0]);
      expect(() =>
        assertCanonicalSolanaProgramFinalizationTransaction({
          transaction,
          mutableRoles: ["outerVerifier"],
          roles: validation.roles,
          authorityAddress: authority,
        }),
      ).toThrow(/canonical Loader-v3/u);
    }
    expect(() =>
      assertCanonicalSolanaProgramFinalizationTransaction({
        transaction: buildTransaction(),
        mutableRoles: ["nativeVerifier", "outerVerifier"],
        roles: validation.roles,
        authorityAddress: authority,
      }),
    ).toThrow(/canonical role-order subset/u);
  });
});

describe("Solana program finalization readback pinning", () => {
  it("accepts exact mutable or immutable role records", () => {
    const approval = governanceApproval();
    for (const immutable of [false, true]) {
      const validation = buildSolanaProgramFinalizationReadbackValidation({
        governanceApprovalValidation: approval,
        readbacks: readbacks({ approval, immutable }),
        artifactSha256ByRole: artifacts(approval),
        reviewedAuthority: approval.pins.programFinalizationAuthority,
        minContextSlot: 100,
        requireImmutable: immutable,
      });
      expect(validation.ready).toBe(true);
      expect(validation.blockerIds).toEqual([]);
    }
  });

  it.each([
    [
      "role swap",
      (records) => {
        [
          records.outerVerifier.program.address,
          records.sourceBridge.program.address,
        ] = [
          records.sourceBridge.program.address,
          records.outerVerifier.program.address,
        ];
      },
    ],
    [
      "duplicate program",
      (records) => {
        records.sourceBridge.program.address =
          records.outerVerifier.program.address;
      },
    ],
    [
      "stale slot",
      (records) => {
        records.outerVerifier.parsedProgramdata.slot = "1";
      },
    ],
    [
      "wrong code",
      (records) => {
        records.outerVerifier.parsedProgramdata.executableBlake2b256 =
          hash("wrong");
      },
    ],
    [
      "wrong loader",
      (records) => {
        records.outerVerifier.program.owner = publicKey(70);
      },
    ],
    [
      "mixed authority",
      (records) => {
        records.sourceBridge.parsedProgramdata.upgradeAuthorityAddress =
          publicKey(71);
      },
    ],
    [
      "partial readback",
      (records) => {
        delete records.nativeVerifier;
      },
    ],
    [
      "spliced readback",
      (records) => {
        records.nativeVerifier = records.outerVerifier;
      },
    ],
    [
      "stale context",
      (records) => {
        records.outerVerifier.program.contextSlot = 99;
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const approval = governanceApproval();
    const records = readbacks({ approval });
    mutate(records);
    const validation = buildSolanaProgramFinalizationReadbackValidation({
      governanceApprovalValidation: approval,
      readbacks: records,
      artifactSha256ByRole: artifacts(approval),
      reviewedAuthority: approval.pins.programFinalizationAuthority,
      minContextSlot: 100,
    });
    expect(validation.ready).toBe(false);
    expect(validation.blockerIds.length).toBeGreaterThan(0);
  });

  it("rejects a stale or substituted local artifact", () => {
    const approval = governanceApproval();
    const artifactHashes = artifacts(approval);
    artifactHashes.destinationBridge = hash("substituted-artifact");
    const validation = buildSolanaProgramFinalizationReadbackValidation({
      governanceApprovalValidation: approval,
      readbacks: readbacks({ approval }),
      artifactSha256ByRole: artifactHashes,
      reviewedAuthority: approval.pins.programFinalizationAuthority,
      minContextSlot: 100,
    });
    expect(validation.blockerIds).toContain(
      "program-finalization-destinationBridge-artifact-sha256",
    );
  });
});

describe("Solana program finalization runtime orchestration", () => {
  it("atomically finalizes all mutable roles and zeroizes the signer", async () => {
    const approval = governanceApproval();
    const before = readbacks({ approval, immutable: false, contextSlot: 110 });
    const after = readbacks({ approval, immutable: true, contextSlot: 160 });
    const dependencies = runtimeDependencies({ before, after });
    const signer = authoritySigner();
    const report = await finalizeSolanaProgramsWithRuntime({
      connection: {},
      governanceApprovalValidation: approval,
      artifactSha256ByRole: artifacts(approval),
      reviewedAuthority: approval.pins.programFinalizationAuthority,
      confirmation: true,
      signerFactory: vi.fn(async () => signer),
      dependencies,
      checkedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      schema: SOLANA_PROGRAM_FINALIZATION_SCHEMA,
      ready: true,
      productionReady: true,
      atomic: true,
      mode: "atomic-set-authority-none",
      mutableRoles: roleSpecs.map((spec) => spec.role),
      transaction: {
        submitted: true,
        instructionCount: 4,
        loaderProgramId: LOADER_ID,
        instructionDataHex: SOLANA_LOADER_V3_SET_AUTHORITY_NONE_DATA_HEX,
        finalizedSlot: 150,
      },
    });
    expect(report.transaction.messageSha256).toBe(
      report.transaction.fetchedMessageSha256,
    );
    expect(dependencies.broadcastTransaction).toHaveBeenCalledTimes(1);
    expect(
      dependencies.broadcastTransaction.mock.calls[0][0].transaction
        .instructions,
    ).toHaveLength(4);
    expect(Array.from(signer.secretKey).every((byte) => byte === 0)).toBe(true);
    expect(
      buildSolanaProgramFinalizationReportValidation({
        report,
        governanceApprovalValidation: approval,
      }).ready,
    ).toBe(true);
    const missingFinalization = buildSolanaProductionRequirementsReportBody({
      productionMaterialInventory: { governanceApproval: approval },
    });
    expect(missingFinalization.blockerIds).toContain("program-finalization");
    const completedFinalization = buildSolanaProductionRequirementsReportBody({
      productionMaterialInventory: { governanceApproval: approval },
      programFinalization: report,
    });
    expect(completedFinalization.blockerIds).not.toContain(
      "program-finalization",
    );
  });

  it("is idempotent without loading a signer only when all roles are immutable", async () => {
    const approval = governanceApproval();
    const immutable = readbacks({
      approval,
      immutable: true,
      contextSlot: 160,
    });
    const dependencies = runtimeDependencies({
      before: immutable,
      after: structuredClone(immutable),
    });
    const signerFactory = vi.fn();
    const report = await finalizeSolanaProgramsWithRuntime({
      connection: {},
      governanceApprovalValidation: approval,
      artifactSha256ByRole: artifacts(approval),
      reviewedAuthority: approval.pins.programFinalizationAuthority,
      confirmation: false,
      signerFactory,
      dependencies,
    });
    expect(report.mode).toBe("idempotent-already-finalized");
    expect(report.mutableRoles).toEqual([]);
    expect(report.transaction).toMatchObject({
      submitted: false,
      signature: null,
      instructionCount: 0,
    });
    expect(signerFactory).not.toHaveBeenCalled();
    expect(dependencies.broadcastTransaction).not.toHaveBeenCalled();
  });

  it("fails closed and zeroizes for tampered finalized transaction readback", async () => {
    const approval = governanceApproval();
    const signer = authoritySigner();
    await expect(
      finalizeSolanaProgramsWithRuntime({
        connection: {},
        governanceApprovalValidation: approval,
        artifactSha256ByRole: artifacts(approval),
        reviewedAuthority: approval.pins.programFinalizationAuthority,
        confirmation: true,
        signerFactory: async () => signer,
        dependencies: runtimeDependencies({
          before: readbacks({ approval, immutable: false, contextSlot: 110 }),
          after: readbacks({ approval, immutable: true, contextSlot: 160 }),
          tamperMessage: true,
        }),
      }),
    ).rejects.toThrow(/does not exactly match/u);
    expect(Array.from(signer.secretKey).every((byte) => byte === 0)).toBe(true);
  });

  it("fails closed if any post-readback remains mutable", async () => {
    const approval = governanceApproval();
    const signer = authoritySigner();
    const after = readbacks({ approval, immutable: true, contextSlot: 160 });
    after.sourceBridge.parsedProgramdata = {
      ...readbacks({ approval, immutable: false, contextSlot: 160 })
        .sourceBridge.parsedProgramdata,
    };
    await expect(
      finalizeSolanaProgramsWithRuntime({
        connection: {},
        governanceApprovalValidation: approval,
        artifactSha256ByRole: artifacts(approval),
        reviewedAuthority: approval.pins.programFinalizationAuthority,
        confirmation: true,
        signerFactory: async () => signer,
        dependencies: runtimeDependencies({
          before: readbacks({ approval, immutable: false, contextSlot: 110 }),
          after,
        }),
      }),
    ).rejects.toThrow(/post-readback failed/u);
    expect(Array.from(signer.secretKey).every((byte) => byte === 0)).toBe(true);
  });

  it("rejects missing confirmation and wrong RPC identity before loading signer", async () => {
    const approval = governanceApproval();
    const signerFactory = vi.fn();
    await expect(
      finalizeSolanaProgramsWithRuntime({
        connection: {},
        governanceApprovalValidation: approval,
        artifactSha256ByRole: artifacts(approval),
        reviewedAuthority: approval.pins.programFinalizationAuthority,
        confirmation: false,
        signerFactory,
        dependencies: runtimeDependencies({
          before: readbacks({ approval, immutable: false, contextSlot: 110 }),
          after: readbacks({ approval, immutable: true, contextSlot: 160 }),
        }),
      }),
    ).rejects.toThrow(/before broadcasting/u);
    await expect(
      finalizeSolanaProgramsWithRuntime({
        connection: {},
        governanceApprovalValidation: approval,
        artifactSha256ByRole: artifacts(approval),
        reviewedAuthority: approval.pins.programFinalizationAuthority,
        confirmation: true,
        signerFactory,
        dependencies: runtimeDependencies({
          before: readbacks({ approval }),
          after: readbacks({ approval, immutable: true }),
          genesis: "mainnet-or-substituted-genesis",
        }),
      }),
    ).rejects.toThrow(/identity mismatch/u);
    expect(signerFactory).not.toHaveBeenCalled();
  });

  it("rejects report instruction tampering even if ready flags remain true", async () => {
    const approval = governanceApproval();
    const report = await finalizeSolanaProgramsWithRuntime({
      connection: {},
      governanceApprovalValidation: approval,
      artifactSha256ByRole: artifacts(approval),
      reviewedAuthority: approval.pins.programFinalizationAuthority,
      confirmation: true,
      signerFactory: async () => authoritySigner(),
      dependencies: runtimeDependencies({
        before: readbacks({ approval, immutable: false, contextSlot: 110 }),
        after: readbacks({ approval, immutable: true, contextSlot: 160 }),
      }),
    });
    const tampered = structuredClone(report);
    tampered.transaction.instructions[0].metas.push({
      pubkey: publicKey(80),
      isSigner: false,
      isWritable: false,
    });
    expect(
      buildSolanaProgramFinalizationReportValidation({
        report: tampered,
        governanceApprovalValidation: approval,
      }).ready,
    ).toBe(false);
  });
});

describe("Solana program finalization CLI safety", () => {
  const runCli = (...args) =>
    spawnSync(
      process.execPath,
      ["scripts/sccp-solana-deploy.mjs", "finalize-programs", ...args],
      { cwd: process.cwd(), encoding: "utf8" },
    );

  it("rejects a bare or duplicated irreversible confirmation flag", () => {
    const bare = runCli("--confirm-finalize-programs");
    expect(bare.status).not.toBe(0);
    expect(bare.stderr).toContain("--confirm-finalize-programs true");

    const duplicate = runCli(
      "--confirm-finalize-programs",
      "true",
      "--confirm-finalize-programs",
      "true",
    );
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("may be provided exactly once");
  });

  it.each([
    "--confirm-source-burn",
    "--confirm-route-canary",
    "--submit",
    "--confirm-governed-native-verifier",
  ])("rejects bare mutation option %s", (option) => {
    const result = runCli(option);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `${option} requires an explicit following value`,
    );
  });

  it("rejects duplicate options and misspelled endpoint options", () => {
    const duplicate = runCli(
      "--torii-url",
      "https://taira.sora.org",
      "--torii-url",
      "https://taira-validator-1.sora.org",
    );
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain(
      "--torii-url may be provided exactly once",
    );

    const misspelled = runCli("--tori-url", "https://attacker.invalid");
    expect(misspelled.status).not.toBe(0);
    expect(misspelled.stderr).toContain("Unknown option: --tori-url");
  });

  it("does not echo positional or key=value input that may contain secrets", () => {
    const sentinel = "DO_NOT_ECHO_RUNTIME_SECRET_7f3a";
    for (const result of [runCli(sentinel), runCli(`--unknown=${sentinel}`)]) {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Unexpected positional argument or unsupported option syntax",
      );
      expect(result.stderr).not.toContain(sentinel);
    }
  });

  it("fails the fresh readiness gate before consulting runtime signer material", () => {
    const outputDir = mkdtempSync(
      path.join(tmpdir(), "solana-finalization-readiness-gate-"),
    );
    const sentinel = "DO_NOT_LOAD_FINALIZATION_SIGNER";
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/sccp-solana-deploy.mjs",
          "finalize-programs",
          "--output-dir",
          outputDir,
          "--skip-solana-rpc",
          "true",
          "--confirm-finalize-linked-verifier",
          "true",
          "--confirm-finalize-programs",
          "true",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            SCCP_SOLANA_DEPLOYER_SECRET_KEY: sentinel,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("fresh complete readiness gate");
      expect(result.stderr).not.toContain(sentinel);
      expect(result.stderr).not.toContain("runtime Solana signer");
      const readiness = JSON.parse(
        readFileSync(
          path.join(
            outputDir,
            "taira-solana-xor-program-finalization-readiness.json",
          ),
          "utf8",
        ),
      );
      expect(readiness.ready).toBe(false);
      expect(readiness.blockerIds).toContain(
        "program-finalization-governed-preconfiguration-intent",
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("reads only stable regular prior reports and rejects output symlinks", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "solana-finalization-chain-"));
    try {
      const target = path.join(root, "target.json");
      const report = path.join(root, "report.json");
      writeFileSync(target, '{"ready":true}\n');
      symlinkSync(target, report);
      await expect(
        readExistingSolanaProgramFinalizationReportBytes(report),
      ).rejects.toThrow(/must not be a symbolic link/u);
      rmSync(report);
      writeFileSync(report, '{"ready":true}\n');
      await expect(
        readExistingSolanaProgramFinalizationReportBytes(report),
      ).resolves.toEqual(Buffer.from('{"ready":true}\n'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("orders finish-production finalization before its production gate", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const finish = source.slice(
      source.indexOf("const finishProduction = async"),
      source.indexOf("const refreshEvidence = async"),
    );
    const finalizationIndex = finish.indexOf(
      'record("program-finalization", () => finalizePrograms(args))',
    );
    const requirementsIndex = finish.indexOf('"production-requirements"');
    expect(finalizationIndex).toBeGreaterThan(0);
    expect(requirementsIndex).toBeGreaterThan(finalizationIndex);
  });

  it("recomputes complete readiness before any direct finalization signer can be loaded", () => {
    const source = readFileSync("scripts/sccp-solana-deploy.mjs", "utf8");
    const start = source.indexOf("const finalizePrograms = async");
    const end = source.indexOf(
      "const readSolanaVerifierLinkageLiveReadback = async",
      start,
    );
    const body = source.slice(start, end);
    const readinessIndex = body.indexOf("programFinalizationReadiness({");
    const readinessEnforcementIndex = body.indexOf(
      "fresh complete readiness gate",
    );
    const signerIndex = body.indexOf("signerFactory: () =>");
    const runtimeSignerIndex = body.indexOf("runtimeSolanaSigner({");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(readinessIndex).toBeGreaterThanOrEqual(0);
    expect(readinessEnforcementIndex).toBeGreaterThan(readinessIndex);
    expect(signerIndex).toBeGreaterThan(readinessEnforcementIndex);
    expect(runtimeSignerIndex).toBeGreaterThan(signerIndex);
    expect(body).toContain('strict: "false"');
  });
});

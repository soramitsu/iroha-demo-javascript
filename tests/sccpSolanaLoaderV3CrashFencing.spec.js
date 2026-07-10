// @vitest-environment node
import { createHash } from "node:crypto";
import { constants as fsConstants, existsSync } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, describe, expect, it } from "vitest";
import {
  SOLANA_TESTNET_GENESIS_HASH,
  acquireDurableSolanaUpgradeOwnerFence,
  createDurableSolanaUpgradeOperationJournal,
  createDurableSolanaUpgradeRecoveryJournal,
  createDurableSolanaUpgradeRecoveryLock,
  openDurableSolanaUpgradeAuthorityLeaseForRecovery,
  readStableSolanaExistingProgramUpgradeJournal,
  reclaimStalePreclaimSolanaUpgradeAuthorityLease,
  reconcileDeadOwnerTerminalSolanaUpgradeLease,
  solanaExistingProgramUpgradeJournalPaths,
  solanaExistingProgramUpgradeLeaseIdentity,
} from "../scripts/sccp-solana-deploy.mjs";
import {
  SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes,
  solanaLoaderV3AuthorityGlobalLeaseScope,
} from "../scripts/solana-loader-v3-runtime.mjs";

const sha256 = (value) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;

const deterministicKeypair = (label) =>
  Keypair.fromSeed(createHash("sha256").update(label).digest());

const cleanupTargets = new Set();

const removeFixture = async ({ paths }) => {
  await rm(paths.operationDirectory, { recursive: true, force: true });
  await rm(paths.authorityLease, { force: true });
};

afterEach(async () => {
  const targets = [...cleanupTargets];
  cleanupTargets.clear();
  await Promise.all(targets.map(removeFixture));
});

const fixture = (label) => {
  const programId = deterministicKeypair(
    `${label}:program`,
  ).publicKey.toBase58();
  const programdataAddress = deterministicKeypair(
    `${label}:programdata`,
  ).publicKey.toBase58();
  const authorityAddress = deterministicKeypair(
    `${label}:authority`,
  ).publicKey.toBase58();
  const payerAddress = deterministicKeypair(
    `${label}:payer`,
  ).publicKey.toBase58();
  const normalized = Object.freeze({
    operationId: sha256(`${label}:operation`),
    planSha256: sha256(`${label}:plan`),
    programId,
    programdataAddress,
    authorityAddress,
    payerAddress,
    minFinalizedSlot: 100,
    expiresAtFinalizedSlot: 1_000,
    targetSha256: sha256(`${label}:target`),
    targetLength: 4_096,
    targetCodeHash: sha256(`${label}:code`),
    extension: null,
  });
  const paths = solanaExistingProgramUpgradeJournalPaths(normalized);
  const source = { normalized, paths };
  cleanupTargets.add(source);
  return source;
};

const claimFor = (
  source,
  { bufferLabel = "initial-buffer", finalizedContextSlot = 101 } = {},
) => ({
  schema: SOLANA_LOADER_V3_RUNTIME_UPGRADE_JOURNAL_EVENT_SCHEMA,
  type: "claim",
  operationId: source.normalized.operationId,
  planSha256: source.normalized.planSha256,
  programId: source.normalized.programId,
  programdataAddress: source.normalized.programdataAddress,
  authorityAddress: source.normalized.authorityAddress,
  payerAddress: source.normalized.payerAddress,
  bufferAddress: deterministicKeypair(
    `${source.normalized.operationId}:${bufferLabel}`,
  ).publicKey.toBase58(),
  targetArtifactSha256: source.normalized.targetSha256,
  targetExecutableLength: source.normalized.targetLength,
  stage: "durable-operation-claim",
  status: "claimed-before-mutation",
  finalizedContextSlot,
  authorityLeaseRequired: true,
  authorityLeaseScope: solanaLoaderV3AuthorityGlobalLeaseScope(
    source.normalized.authorityAddress,
  ),
  bufferPossiblyCreated: false,
  bufferConsumed: false,
  recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
});

const claimLine = (claim) => Buffer.from(`${JSON.stringify(claim)}\n`, "utf8");

const claimDigest = (claim) =>
  sha256(canonicalSolanaLoaderV3RuntimeUpgradeClaimEventBytes(claim));

const provisionalLeaseRecord = ({ claim, reviewedLease, nonceLabel }) => ({
  schema: "iroha-demo-solana-loader-v3-runtime-authority-lease/v2",
  status: "provisional-before-durable-claim",
  authorityCustodyScope: "same-host-exclusive",
  crossHostAuthorityUseExcluded: true,
  network: "solana-testnet",
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  journalId: reviewedLease.journalId,
  leaseId: reviewedLease.leaseId,
  leaseGeneration: 1,
  authorityLeaseScope: reviewedLease.authorityLeaseScope,
  leaseNonce: sha256(nonceLabel),
  previousLeaseNonceSha256: null,
  claimEventSha256: claimDigest(claim),
  claimFinalizedContextSlot: claim.finalizedContextSlot,
  leaseLifetimePolicy: "finalized-slot-bounded",
  leaseExpiresAtFinalizedSlot: reviewedLease.expiresAtFinalizedSlot,
  operationId: claim.operationId,
  planSha256: claim.planSha256,
  programId: claim.programId,
  programdataAddress: claim.programdataAddress,
  authorityAddress: claim.authorityAddress,
  payerAddress: claim.payerAddress,
  bufferAddress: claim.bufferAddress,
  targetArtifactSha256: claim.targetArtifactSha256,
  targetExecutableLength: claim.targetExecutableLength,
});

const writeCrashWindow = async ({
  source,
  staleClaim,
  journalBytes,
  leaseBytes = null,
}) => {
  const reviewedLease = solanaExistingProgramUpgradeLeaseIdentity(
    source.normalized,
  );
  const record = provisionalLeaseRecord({
    claim: staleClaim,
    reviewedLease,
    nonceLabel: `${source.normalized.operationId}:lease-nonce`,
  });
  await Promise.all([
    mkdir(path.dirname(source.paths.journal), { recursive: true, mode: 0o700 }),
    mkdir(path.dirname(source.paths.authorityLease), {
      recursive: true,
      mode: 0o700,
    }),
  ]);
  await Promise.all([
    writeFile(source.paths.journal, journalBytes, { mode: 0o600 }),
    writeFile(
      source.paths.authorityLease,
      leaseBytes ?? Buffer.from(`${JSON.stringify(record)}\n`, "utf8"),
      { mode: 0o600 },
    ),
  ]);
  return { record, reviewedLease };
};

const claimDurably = async (source, claim = claimFor(source)) => {
  const journal = createDurableSolanaUpgradeOperationJournal({
    file: source.paths.journal,
    authorityLeaseFile: source.paths.authorityLease,
    exclusiveAuthorityCustodyConfirmed: true,
    reviewedPlan: source.normalized,
  });
  await journal.operationJournal(claim);
  return { journal, claim };
};

const readSelectedJournal = (source, claim) =>
  readStableSolanaExistingProgramUpgradeJournal({
    file: source.paths.journal,
    expectedPlanSha256: source.normalized.planSha256,
    expectedClaimEventSha256: claimDigest(claim),
    expectedTargetCodeHash: source.normalized.targetCodeHash,
    extensionRequired: false,
  });

describe("Solana Loader-v3 owner-death fencing and crash recovery", () => {
  it("holds a real flock until the owner helper exits and rejects a live contender", async () => {
    const source = fixture("flock-live-owner");
    await mkdir(source.paths.operationDirectory, {
      recursive: true,
      mode: 0o700,
    });
    const fencePath = path.join(
      source.paths.operationDirectory,
      "owner-fence.lock.json",
    );
    await writeFile(fencePath, "{}\n", { mode: 0o600 });
    const firstHandle = await open(
      fencePath,
      fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const secondHandle = await open(
      fencePath,
      fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0),
    );
    let firstFence = null;
    let successorFence = null;
    try {
      firstFence = await acquireDurableSolanaUpgradeOwnerFence({
        handle: firstHandle,
      });
      await expect(
        acquireDurableSolanaUpgradeOwnerFence({ handle: secondHandle }),
      ).rejects.toThrow(/still fenced by a live owner/u);

      // Closing the parent's descriptor is insufficient: the isolated owner
      // helper inherited the open file description and remains the fence.
      await firstHandle.close();
      await expect(
        acquireDurableSolanaUpgradeOwnerFence({ handle: secondHandle }),
      ).rejects.toThrow(/still fenced by a live owner/u);

      await firstFence.close();
      firstFence = null;
      successorFence = await acquireDurableSolanaUpgradeOwnerFence({
        handle: secondHandle,
      });
      expect(successorFence.assertAlive()).toBe(true);
    } finally {
      await firstFence?.close().catch(() => {});
      await successorFence?.close().catch(() => {});
      await firstHandle.close().catch(() => {});
      await secondHandle.close().catch(() => {});
    }
  });

  it.each([
    ["empty", (line) => line.subarray(0, 0)],
    ["partial", (line) => line.subarray(0, Math.floor(line.length / 2))],
    ["exact", (line) => line],
  ])(
    "reclaims a stale provisional preclaim with the %s claim-prefix form before a fresh buffer/context",
    async (variant, selectJournalBytes) => {
      const source = fixture(`preclaim-prefix-${variant}`);
      const staleClaim = claimFor(source, {
        bufferLabel: "stale-buffer",
        finalizedContextSlot: 101,
      });
      const freshClaim = claimFor(source, {
        bufferLabel: "fresh-buffer",
        finalizedContextSlot: 109,
      });
      expect(freshClaim.bufferAddress).not.toBe(staleClaim.bufferAddress);
      expect(freshClaim.finalizedContextSlot).toBeGreaterThan(
        staleClaim.finalizedContextSlot,
      );
      const line = claimLine(staleClaim);
      const { reviewedLease } = await writeCrashWindow({
        source,
        staleClaim,
        journalBytes: selectJournalBytes(line),
      });

      await expect(
        reclaimStalePreclaimSolanaUpgradeAuthorityLease({
          file: source.paths.authorityLease,
          journalPath: source.paths.journal,
          event: freshClaim,
          reviewedLease,
        }),
      ).resolves.toBe(true);
      expect(existsSync(source.paths.journal)).toBe(false);
      expect(existsSync(source.paths.authorityLease)).toBe(false);
    },
  );

  it("refuses a foreign preclaim journal prefix without releasing the lease", async () => {
    const source = fixture("preclaim-foreign-prefix");
    const staleClaim = claimFor(source);
    const freshClaim = claimFor(source, {
      bufferLabel: "fresh-buffer",
      finalizedContextSlot: 109,
    });
    const { reviewedLease } = await writeCrashWindow({
      source,
      staleClaim,
      journalBytes: Buffer.from('{"foreign":true}\n', "utf8"),
    });

    await expect(
      reclaimStalePreclaimSolanaUpgradeAuthorityLease({
        file: source.paths.authorityLease,
        journalPath: source.paths.journal,
        event: freshClaim,
        reviewedLease,
      }),
    ).rejects.toThrow(/not an exact claim-record prefix/u);
    expect(existsSync(source.paths.journal)).toBe(true);
    expect(existsSync(source.paths.authorityLease)).toBe(true);
  });

  it("refuses a noncanonical provisional lease without touching its claim prefix", async () => {
    const source = fixture("preclaim-noncanonical-lease");
    const staleClaim = claimFor(source);
    const freshClaim = claimFor(source, {
      bufferLabel: "fresh-buffer",
      finalizedContextSlot: 109,
    });
    const reviewedLease = solanaExistingProgramUpgradeLeaseIdentity(
      source.normalized,
    );
    const record = provisionalLeaseRecord({
      claim: staleClaim,
      reviewedLease,
      nonceLabel: "noncanonical-lease",
    });
    await writeCrashWindow({
      source,
      staleClaim,
      journalBytes: claimLine(staleClaim),
      leaseBytes: Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8"),
    });

    await expect(
      reclaimStalePreclaimSolanaUpgradeAuthorityLease({
        file: source.paths.authorityLease,
        journalPath: source.paths.journal,
        event: freshClaim,
        reviewedLease,
      }),
    ).rejects.toThrow(/not canonical/u);
    expect(await readFile(source.paths.journal)).toEqual(claimLine(staleClaim));
    expect(existsSync(source.paths.authorityLease)).toBe(true);
  });

  it("rejects recovery takeover while the original claim owner is alive", async () => {
    const source = fixture("recovery-live-owner");
    const { journal, claim } = await claimDurably(source);
    let recoveryLock = null;
    try {
      const selectedJournal = await readSelectedJournal(source, claim);
      recoveryLock = await createDurableSolanaUpgradeRecoveryLock({
        file: source.paths.recoveryLock,
        selectedJournal,
        inputs: { normalized: source.normalized },
      });
      await expect(
        openDurableSolanaUpgradeAuthorityLeaseForRecovery({
          file: source.paths.authorityLease,
          selectedJournal,
          inputs: { normalized: source.normalized },
        }),
      ).rejects.toThrow(/still fenced by a live owner/u);
      expect(existsSync(source.paths.authorityLease)).toBe(true);
      expect(existsSync(source.paths.recoveryLock)).toBe(true);
      expect(await journal.assertLeaseHeld()).toBe(true);
    } finally {
      await recoveryLock?.close({ removeProvisional: true }).catch(() => {});
      await journal.close({ releaseLease: false }).catch(() => {});
    }
  });

  it("reclaims stale provisional and promoted-before-start candidates and increments the lease generation", async () => {
    const source = fixture("recovery-stale-candidates");
    const { journal, claim } = await claimDurably(source);
    await journal.close({ releaseLease: false });
    const selectedJournal = await readSelectedJournal(source, claim);
    const inputs = { normalized: source.normalized };

    const abandonedProvisional = await createDurableSolanaUpgradeRecoveryLock({
      file: source.paths.recoveryLock,
      selectedJournal,
      inputs,
    });
    await abandonedProvisional.close();
    expect(existsSync(source.paths.recoveryLock)).toBe(true);

    const firstRecovery = await createDurableSolanaUpgradeRecoveryLock({
      file: source.paths.recoveryLock,
      selectedJournal,
      inputs,
    });
    const generationTwo =
      await openDurableSolanaUpgradeAuthorityLeaseForRecovery({
        file: source.paths.authorityLease,
        selectedJournal,
        inputs,
      });
    expect(generationTwo.leaseGeneration).toBe(2);
    await firstRecovery.promote({
      leaseId: generationTwo.record.leaseId,
      leaseGeneration: generationTwo.leaseGeneration,
      authorityLeaseScope: generationTwo.authorityLeaseScope,
    });
    await firstRecovery.close();
    await generationTwo.close({ releaseLease: false });

    // No recovery-start was appended. The exact promoted candidate may be
    // reclaimed only after both owner fences have exited.
    const secondRecovery = await createDurableSolanaUpgradeRecoveryLock({
      file: source.paths.recoveryLock,
      selectedJournal,
      inputs,
    });
    const generationThree =
      await openDurableSolanaUpgradeAuthorityLeaseForRecovery({
        file: source.paths.authorityLease,
        selectedJournal,
        inputs,
      });
    try {
      expect(generationThree.leaseGeneration).toBe(3);
      expect(generationThree.record.previousLeaseNonceSha256).toMatch(
        /^0x[0-9a-f]{64}$/u,
      );
      await secondRecovery.promote({
        leaseId: generationThree.record.leaseId,
        leaseGeneration: generationThree.leaseGeneration,
        authorityLeaseScope: generationThree.authorityLeaseScope,
      });
      expect(secondRecovery.promoted).toBe(true);
    } finally {
      await secondRecovery.close().catch(() => {});
      await generationThree.close({ releaseLease: false }).catch(() => {});
    }
  });

  it("refuses a corrupt stale recovery candidate before authority takeover", async () => {
    const source = fixture("recovery-corrupt-candidate");
    const { journal, claim } = await claimDurably(source);
    await journal.close({ releaseLease: false });
    const selectedJournal = await readSelectedJournal(source, claim);
    const inputs = { normalized: source.normalized };
    const abandoned = await createDurableSolanaUpgradeRecoveryLock({
      file: source.paths.recoveryLock,
      selectedJournal,
      inputs,
    });
    await abandoned.close();
    const parsed = JSON.parse(
      await readFile(source.paths.recoveryLock, "utf8"),
    );
    await writeFile(
      source.paths.recoveryLock,
      `${JSON.stringify({ ...parsed, candidateNonce: "0x00" })}\n`,
    );

    await expect(
      createDurableSolanaUpgradeRecoveryLock({
        file: source.paths.recoveryLock,
        selectedJournal,
        inputs,
      }),
    ).rejects.toThrow(/not an exact reclaimable pre-start candidate/u);
    expect(existsSync(source.paths.authorityLease)).toBe(true);
    expect(existsSync(source.paths.recoveryLock)).toBe(true);
  });

  it("reconciles an exact dead-owner safe-abort only after the live fence exits", async () => {
    const source = fixture("terminal-release-ordering");
    const { journal, claim } = await claimDurably(source);
    const reviewedLease = solanaExistingProgramUpgradeLeaseIdentity(
      source.normalized,
    );
    const identity = {
      schema: claim.schema,
      operationId: claim.operationId,
      planSha256: claim.planSha256,
      programId: claim.programId,
      programdataAddress: claim.programdataAddress,
      authorityAddress: claim.authorityAddress,
      payerAddress: claim.payerAddress,
      bufferAddress: claim.bufferAddress,
      targetArtifactSha256: claim.targetArtifactSha256,
      targetExecutableLength: claim.targetExecutableLength,
      authorityLeaseId: reviewedLease.leaseId,
      authorityLeaseGeneration: 1,
      authorityLeaseScope: reviewedLease.authorityLeaseScope,
    };
    await journal.operationJournal({
      ...identity,
      type: "failure",
      stage: "pre-mutation-validation",
      status: "failed-closed",
      lastFinalizedStage: null,
      lastFinalizedSignature: null,
      lastFinalizedSlot: null,
      bufferPossiblyCreated: false,
      bufferConsumed: false,
      recoveryAction: "inspect-finalized-programdata-before-any-retry",
    });
    expect(journal.safeAbortTerminal).toBe(true);

    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: source.paths.authorityLease,
      }),
    ).rejects.toThrow(/still fenced by a live owner/u);
    expect(existsSync(source.paths.authorityLease)).toBe(true);
    expect(existsSync(source.paths.journal)).toBe(true);

    await journal.close({ releaseLease: false });
    await expect(
      reconcileDeadOwnerTerminalSolanaUpgradeLease({
        file: source.paths.authorityLease,
      }),
    ).resolves.toMatchObject({
      reconciled: true,
      terminalKind: "ordinary-safe-abort",
      receiptSynthesized: true,
    });
    expect(existsSync(source.paths.authorityLease)).toBe(false);
    expect(existsSync(source.paths.journal)).toBe(true);
  });

  it("releases an exact terminal recovery candidate and lease only after both owners exit", async () => {
    const source = fixture("terminal-recovery-release-ordering");
    const { journal, claim } = await claimDurably(source);
    await journal.close({ releaseLease: false });
    const selectedJournal = await readSelectedJournal(source, claim);
    const inputs = { normalized: source.normalized };
    const recoveryLock = await createDurableSolanaUpgradeRecoveryLock({
      file: source.paths.recoveryLock,
      selectedJournal,
      inputs,
    });
    const authorityLease =
      await openDurableSolanaUpgradeAuthorityLeaseForRecovery({
        file: source.paths.authorityLease,
        selectedJournal,
        inputs,
      });
    await recoveryLock.promote({
      leaseId: authorityLease.record.leaseId,
      leaseGeneration: authorityLease.leaseGeneration,
      authorityLeaseScope: authorityLease.authorityLeaseScope,
    });
    const recoveryJournal = await createDurableSolanaUpgradeRecoveryJournal({
      selectedJournal,
      authorityLease,
      recoveryLock,
      minimumFinalizedSlot: claim.finalizedContextSlot,
    });
    const identity = {
      schema: claim.schema,
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
    };
    const lease = {
      authorityLeaseId: authorityLease.record.leaseId,
      authorityLeaseGeneration: authorityLease.leaseGeneration,
      authorityLeaseScope: authorityLease.authorityLeaseScope,
    };
    const signature = bs58.encode(
      createHash("sha512").update("terminal-recovery-signature").digest(),
    );
    const transaction = {
      expectedSignature: signature,
      expectedSignatures: [signature],
      blockhash: deterministicKeypair(
        "terminal-recovery-blockhash",
      ).publicKey.toBase58(),
      lastValidBlockHeight: 50_000,
      messageSha256: sha256("terminal-recovery-message"),
      packetSha256: sha256("terminal-recovery-packet"),
      packetLength: 512,
    };
    try {
      await recoveryJournal.operationJournal({
        ...identity,
        type: "recovery-start",
        stage: "authorize-orphan-buffer-recovery",
        status: "authorized-before-signer-acquisition",
        finalizedContextSlot: claim.finalizedContextSlot + 1,
        authorityLeaseRequired: true,
        recoveryAction: "close-ephemeral-loader-v3-buffer-if-present",
      });
      await recoveryJournal.operationJournal({
        ...identity,
        ...lease,
        type: "recovery-intent",
        stage: "recover-close-orphan-buffer",
        status: "prepared-before-broadcast",
        ...transaction,
      });
      await recoveryJournal.operationJournal({
        ...identity,
        ...lease,
        type: "recovery-complete",
        stage: "close-orphan-buffer",
        status: "finalized-closed",
        signature,
        ...transaction,
        finalizedSlot: claim.finalizedContextSlot + 2,
      });
      expect(recoveryJournal.recoveryCompleted).toBe(true);
      await recoveryJournal.close();

      await expect(
        reconcileDeadOwnerTerminalSolanaUpgradeLease({
          file: source.paths.authorityLease,
        }),
      ).rejects.toThrow(/still fenced by a live owner/u);
      expect(existsSync(source.paths.authorityLease)).toBe(true);
      expect(existsSync(source.paths.recoveryLock)).toBe(true);

      await recoveryLock.close();
      await authorityLease.close({ releaseLease: false });
      await expect(
        reconcileDeadOwnerTerminalSolanaUpgradeLease({
          file: source.paths.authorityLease,
        }),
      ).resolves.toMatchObject({
        reconciled: true,
        terminalKind: "recovery-complete",
        receiptSynthesized: true,
      });
      expect(existsSync(source.paths.authorityLease)).toBe(false);
      expect(existsSync(source.paths.recoveryLock)).toBe(false);
      expect(existsSync(source.paths.journal)).toBe(true);
    } finally {
      await recoveryJournal.close().catch(() => {});
      await recoveryLock.close().catch(() => {});
      await authorityLease.close({ releaseLease: false }).catch(() => {});
    }
  });
});

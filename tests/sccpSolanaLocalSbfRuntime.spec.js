// @vitest-environment node

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  assertDistinctSolanaLocalSbfRoleArtifacts,
  buildSolanaLocalValidatorPortPlan,
  buildCanonicalLocalDestinationTransfer,
  buildLocalGroth16ProofFixture,
  buildLocalTestVerifyingKey,
  runSolanaLocalSbfRuntime,
  selectSolanaLocalValidatorPortReservation,
  startSolanaLocalValidator,
} from "../scripts/e2e/sccp-solana-local-sbf-runtime.mjs";

const hash = (label) =>
  createHash("sha256").update(Buffer.from(label, "utf8")).digest();

const distinctRoleArtifacts = () => ({
  destination: {
    sha256: "destination-sha256",
    blake2b256: "destination-blake2b256",
  },
  source: {
    sha256: "source-sha256",
    blake2b256: "source-blake2b256",
  },
  nativeVerifier: {
    sha256: "native-sha256",
    blake2b256: "native-blake2b256",
  },
});

let validatorStartCounter = 0;

const validatorStartOptions = () => ({
  ledger: path.join(
    tmpdir(),
    `sccp-solana-validator-start-unit-ledger-${process.pid}-${(validatorStartCounter += 1)}`,
  ),
  destinationProgramId: new PublicKey(hash("destination-program")),
  sourceProgramId: new PublicKey(hash("source-program")),
  nativeVerifierProgramId: new PublicKey(hash("native-program")),
  destinationPath: "/reviewed/destination.so",
  sourcePath: "/reviewed/source.so",
  nativePath: "/reviewed/native.so",
  upgradeAuthorityAddress: new PublicKey(hash("upgrade-authority")).toBase58(),
});

const fakeValidatorChild = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal) => {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    child.signalCode = signal;
    queueMicrotask(() => child.emit("exit", null, signal));
    return true;
  };
  return child;
};

const portReservationSequence = (...bases) => {
  let index = 0;
  return async () => {
    const plan = buildSolanaLocalValidatorPortPlan(
      bases[Math.min(index, bases.length - 1)],
    );
    index += 1;
    return { plan, release: async () => {} };
  };
};

describe("exact Solana local SBF runtime harness", () => {
  it("selects a new reserved range after a port collision", async () => {
    let calls = 0;
    const reservation = await selectSolanaLocalValidatorPortReservation({
      attempts: 3,
      candidateBase: (attempt) => 20_000 + attempt * 200,
      reservePlan: async (plan) => {
        calls += 1;
        if (calls === 1) {
          const collision = new Error("Address already in use");
          collision.code = "EADDRINUSE";
          throw collision;
        }
        return { plan, release: async () => {} };
      },
    });

    expect(calls).toBe(2);
    expect(reservation.plan).toEqual(buildSolanaLocalValidatorPortPlan(20_400));
  });

  it("reports spawn errors with bounded stdout and stderr diagnostics", async () => {
    const child = fakeValidatorChild();
    const spawnError = Object.assign(new Error("spawn validator ENOENT"), {
      code: "ENOENT",
    });

    await expect(
      startSolanaLocalValidator(validatorStartOptions(), {
        spawnImpl: () => {
          queueMicrotask(() => {
            child.stdout.write("validator stdout before spawn failure");
            child.stderr.write("validator stderr before spawn failure");
            child.emit("error", spawnError);
          });
          return child;
        },
        connectionFactory: () => ({
          getVersion: async () => {
            throw new Error("RPC unavailable");
          },
        }),
        reservePortPlan: portReservationSequence(21_000),
        startupTimeoutMs: 1_000,
        pollIntervalMs: 1,
        startupAttempts: 1,
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow(
      /failed to spawn[\s\S]*spawn validator ENOENT[\s\S]*validator stdout before spawn failure[\s\S]*validator stderr before spawn failure/u,
    );
  });

  it("allows a cold validator to become healthy after slow readiness", async () => {
    const child = fakeValidatorChild();
    let healthAttempts = 0;
    const validator = await startSolanaLocalValidator(validatorStartOptions(), {
      spawnImpl: () => child,
      connectionFactory: () => ({
        getVersion: async () => {
          healthAttempts += 1;
          if (healthAttempts < 5) throw new Error("RPC warming up");
          return { "solana-core": "4.1.2" };
        },
      }),
      reservePortPlan: portReservationSequence(22_000),
      startupTimeoutMs: 1_000,
      pollIntervalMs: 1,
      sleepImpl: async () => {},
    });

    expect(healthAttempts).toBe(5);
    expect(validator.endpoint).toBe("http://127.0.0.1:22000");
    expect(validator.startupAttempt).toBe(1);
  });

  it("includes both bounded log streams when RPC health never becomes ready", async () => {
    const child = fakeValidatorChild();
    queueMicrotask(() => {
      child.stdout.write("cold-start stdout tail");
      child.stderr.write("cold-start stderr tail");
    });

    await expect(
      startSolanaLocalValidator(validatorStartOptions(), {
        spawnImpl: () => child,
        connectionFactory: () => ({
          getVersion: async () => {
            throw new Error("RPC still warming up");
          },
        }),
        reservePortPlan: portReservationSequence(22_500),
        startupTimeoutMs: 20,
        pollIntervalMs: 1,
        startupAttempts: 1,
        sleepImpl: (milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds)),
      }),
    ).rejects.toThrow(
      /did not become healthy[\s\S]*stdout\(last 65536 bytes\):\ncold-start stdout tail[\s\S]*stderr\(last 65536 bytes\):\ncold-start stderr tail/u,
    );
  });

  it("retries with a fresh range when Agave reports a bind collision", async () => {
    let spawns = 0;
    const validator = await startSolanaLocalValidator(validatorStartOptions(), {
      spawnImpl: () => {
        spawns += 1;
        const child = fakeValidatorChild();
        if (spawns === 1) {
          queueMicrotask(() => {
            child.stderr.write("Unable to bind: Address already in use");
            child.exitCode = 1;
            child.emit("exit", 1, null);
          });
        }
        return child;
      },
      connectionFactory: (endpoint) => ({
        getVersion: async () => {
          if (endpoint.endsWith(":23000")) {
            throw new Error("RPC unavailable after bind collision");
          }
          return { "solana-core": "4.1.2" };
        },
      }),
      reservePortPlan: portReservationSequence(23_000, 24_000),
      startupTimeoutMs: 1_000,
      pollIntervalMs: 1,
      sleepImpl: async () => {},
    });

    expect(spawns).toBe(2);
    expect(validator.endpoint).toBe("http://127.0.0.1:24000");
    expect(validator.startupAttempt).toBe(2);
  });

  it.each([
    ["destination", "SHA-256", "sha256", /distinct SHA-256 hashes/u],
    ["source", "SHA-256", "sha256", /distinct SHA-256 hashes/u],
    [
      "destination",
      "BLAKE2b-256",
      "blake2b256",
      /distinct BLAKE2b-256 code hashes/u,
    ],
    [
      "source",
      "BLAKE2b-256",
      "blake2b256",
      /distinct BLAKE2b-256 code hashes/u,
    ],
  ])(
    "rejects a native-verifier vs %s-role %s collision",
    (peerRole, _hashName, hashField, expectedError) => {
      const artifacts = distinctRoleArtifacts();
      artifacts.nativeVerifier[hashField] = artifacts[peerRole][hashField];

      expect(() =>
        assertDistinctSolanaLocalSbfRoleArtifacts(artifacts),
      ).toThrow(expectedError);
    },
  );

  it("builds the exact 1216-byte test VK and canonical destination proof body", () => {
    const payer = new PublicKey(hash("payer"));
    const transfer = buildCanonicalLocalDestinationTransfer({
      payerAddress: payer,
    });
    const fixture = buildLocalGroth16ProofFixture({
      payerAddress: payer,
      destinationBindingHash: hash("destination"),
      routeConfigurationHash: hash("route"),
      soraAnchorHash: hash("anchor"),
    });

    expect(buildLocalTestVerifyingKey()).toHaveLength(1_216);
    expect(transfer.payload).toHaveLength(132);
    expect(fixture.publicInputs).toHaveLength(141);
    expect(fixture.proof).toHaveLength(384);
    expect(fixture.body).toHaveLength(691);
    expect(fixture.messageId).toEqual(transfer.messageId);
    expect(fixture.payloadHash).toEqual(transfer.payloadHash);
    expect(fixture.bodySha256).toEqual(
      createHash("sha256").update(fixture.body).digest(),
    );
  });

  const runtimeIt =
    process.env.SCCP_SOLANA_RUN_LOCAL_SBF_RUNTIME === "1" ? it : it.skip;

  runtimeIt(
    "executes distinct immutable destination/source ELFs through both receipts",
    async () => {
      const report = await runSolanaLocalSbfRuntime();
      expect(report.passed).toBe(true);
      expect(report.sbpfVersion).toBe("V3");
      expect(report.artifactHashes.bridgeSha256).not.toBe(
        report.artifactHashes.sourceBridgeSha256,
      );
      expect(report.roleDispatch.destinationRejectsSourceBurn.rejected).toBe(
        true,
      );
      expect(
        report.roleDispatch.sourceRejectsDestinationFinalize.rejected,
      ).toBe(true);
      expect(
        report.material.atomicMintMaterialBootstrap.unitsConsumed,
      ).toBeGreaterThan(0);
      expect(
        Object.values(report.negativeRuntime).every(
          (entry) => entry.rejected === true,
        ),
      ).toBe(true);
      expect(report.immutablePrograms.programdata).toHaveLength(3);
      expect(
        report.immutablePrograms.atomicFinalization.unitsConsumed,
      ).toBeGreaterThan(0);
      for (const programdata of report.immutablePrograms.programdata) {
        expect(programdata).toMatchObject({
          authorityEncoding: "none",
          residualFormerAuthorityBytes: true,
          sbpfVersion: "V3",
          upgradeAuthority: null,
        });
        expect(programdata.executableLength).toBeGreaterThan(4);
        expect(programdata.executableSha256).toMatch(/^0x[0-9a-f]{64}$/u);
        expect(programdata.executableBlake2b256).toMatch(/^0x[0-9a-f]{64}$/u);
      }
      expect(
        report.negativeRuntime.poisonWrongPeerInitialize.statePdaCreated,
      ).toBe(false);
      expect(report.negativeRuntime.wrongProgramdataOwner).toMatchObject({
        mintCreated: false,
        materialCreated: false,
      });
      expect(report.negativeRuntime.wrongSourceBoundConfig).toMatchObject({
        mintCreated: false,
        materialCreated: false,
      });
      expect(report.negativeRuntime.mutatedGroth16Proof).toMatchObject({
        mintSupplyUnchanged: "0",
        tokenBalanceUnchanged: "0",
        receiptCreated: false,
      });
      expect(report.negativeRuntime.destinationMessageReplay).toMatchObject({
        mintSupplyUnchanged: "42",
        tokenBalanceUnchanged: "42",
      });
      expect(report.negativeRuntime.sourceBurnReplay).toMatchObject({
        mintSupplyUnchanged: "25",
        tokenBalanceUnchanged: "25",
      });
      expect(report.destination.computeBudgetUnits).toBe(800_000);
      expect(report.destination.unitsConsumed).toBeGreaterThan(0);
      expect(report.source.unitsConsumed).toBeGreaterThan(0);
      expect(report.destination.mintSupplyAfterFinalize).toBe("42");
      expect(report.source.mintSupplyAfterBurn).toBe("25");
      expect(report.signerPolicy.temporaryLedgerRemoved).toBe(true);
    },
    180_000,
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TronToTairaSourceProofPackageInput } from "@/utils/sccp";
import type { TronSccpProofPackageInput } from "@/utils/sccpProofPackage";

const mocks = vi.hoisted(() => ({
  bindSource: vi.fn(),
  buildProofPackage: vi.fn(),
  generateProofPackage: vi.fn(),
  loadDestinationProver: vi.fn(),
  loadSourceProver: vi.fn(),
}));

vi.mock("@/utils/sccp", () => ({
  bindTronToTairaSourceProofPackage: mocks.bindSource,
}));

vi.mock("@/utils/sccpProofPackage", () => ({
  buildTronSccpProofPackage: mocks.buildProofPackage,
  generateTronSccpProofPackage: mocks.generateProofPackage,
}));

vi.mock("@/utils/sccpProverLink", () => ({
  loadTronSccpProveFn: mocks.loadDestinationProver,
  loadTronSccpSourceProveFn: mocks.loadSourceProver,
}));

type WorkerHarness = {
  post: (data: unknown) => Promise<unknown>;
};

const createWorkerHarness = async (): Promise<WorkerHarness> => {
  vi.resetModules();
  const posted: unknown[] = [];
  const workerScope = {
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    postMessage: vi.fn((message: unknown) => {
      posted.push(message);
    }),
  };
  vi.stubGlobal("self", workerScope);
  await import("@/workers/sccpProver.worker");
  if (typeof workerScope.onmessage !== "function") {
    throw new Error("SCCP prover worker did not register a message handler.");
  }

  return {
    post: async (data: unknown): Promise<unknown> => {
      posted.length = 0;
      workerScope.onmessage?.({ data });
      await vi.waitFor(() => expect(posted).toHaveLength(1));
      return posted[0];
    },
  };
};

const destinationInput = {
  routeId: "taira_tron_xor",
  messageBundle: { commitment: { message_id: "11".repeat(32) } },
  manifest: { route_id: "taira_tron_xor" },
  tronRecipient: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
  amountDecimal: "1",
} as unknown as TronSccpProofPackageInput;

const sourceInput = {
  manifest: {
    route_id: "taira_tron_xor",
    bridge: { tron: { bridge_address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8" } },
  },
  txId: "22".repeat(32),
  events: [{ block_number: 123 }],
  tronSender: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
  tairaRecipient: "testu4gw9wmmr7aek32p2syxs7qkp7x9gksw2hhvlq2kq4e6n4v4",
  amountDecimal: "1",
} as unknown as TronToTairaSourceProofPackageInput;

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("SCCP prover worker", () => {
  beforeEach(() => {
    mocks.bindSource.mockReset();
    mocks.buildProofPackage.mockReset();
    mocks.generateProofPackage.mockReset();
    mocks.loadDestinationProver.mockReset();
    mocks.loadSourceProver.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes supported request kinds and rejects malformed protocol messages", async () => {
    const workerModule = await import("@/workers/sccpProver.worker");

    expect(
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-1",
        kind: "build-tron-proof-package",
        input: destinationInput,
      }),
    ).toMatchObject({ id: "req-1", kind: "build-tron-proof-package" });
    expect(() => workerModule.normalizeSccpProverWorkerRequest(null)).toThrow(
      "SCCP worker request must be an object.",
    );
    expect(() =>
      workerModule.normalizeSccpProverWorkerRequest({
        id: "",
        kind: "build-tron-proof-package",
        input: destinationInput,
      }),
    ).toThrow("SCCP worker request id must be a non-empty string.");
    for (const id of ["req 1", "req\n1", "req/1", "x".repeat(129)]) {
      expect(() =>
        workerModule.normalizeSccpProverWorkerRequest({
          id,
          kind: "build-tron-proof-package",
          input: destinationInput,
        }),
      ).toThrow("SCCP worker request id must use 1-128 safe ASCII characters.");
    }
    expect(() =>
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-1",
        kind: "prove-solana-proof-package",
        input: destinationInput,
      }),
    ).toThrow("Unsupported SCCP worker request: prove-solana-proof-package");
    expect(() =>
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-1",
        kind: "build-tron-proof-package",
        input: "not-an-object",
      }),
    ).toThrow("SCCP worker request input must be an object.");
    expect(() =>
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-1",
        kind: "build-tron-proof-package",
        input: {
          ...destinationInput,
          manifest: {
            privateKeyHex: "00".repeat(32),
          },
        },
      }),
    ).toThrow(/privateKeyHex.*SCCP prover/);
    expect(() =>
      workerModule.assertNoUnsafeSccpWorkerOutputFields({
        messageBundle: {
          finalityProof: {
            signatureSha256: `0x${"11".repeat(32)}`,
            signatures: ["0x01"],
          },
        },
      }),
    ).not.toThrow();
  });

  it("returns a request-bound error response for malformed posted messages", async () => {
    const worker = await createWorkerHarness();

    await expect(worker.post(null)).resolves.toEqual({
      id: "",
      ok: false,
      error: "SCCP worker request must be an object.",
    });
    await expect(
      worker.post({
        id: "req\n2",
        kind: "build-tron-proof-package",
        input: {},
      }),
    ).resolves.toEqual({
      id: "",
      ok: false,
      error: "SCCP worker request id must use 1-128 safe ASCII characters.",
    });
    await expect(
      worker.post({
        id: "req-2",
        kind: "prove-solana-proof-package",
        input: {},
      }),
    ).resolves.toEqual({
      id: "req-2",
      ok: false,
      error: "Unsupported SCCP worker request: prove-solana-proof-package",
    });
  });

  it("rejects secret-like worker inputs before loading provers or building packages", async () => {
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "secret-build",
        kind: "build-tron-proof-package",
        input: {
          ...destinationInput,
          messageBundle: {
            private_key: "00".repeat(32),
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-build",
      ok: false,
      error:
        "SCCP worker request input.messageBundle.private_key must not be sent to the SCCP prover.",
    });
    expect(mocks.buildProofPackage).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "secret-destination",
        kind: "prove-tron-proof-package",
        input: {
          ...destinationInput,
          witness: {
            publicInputs: {
              mnemonic: "test test test test",
            },
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-destination",
      ok: false,
      error:
        "SCCP worker request input.witness.publicInputs.mnemonic must not be sent to the SCCP prover.",
    });
    expect(mocks.loadDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateProofPackage).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "secret-source",
        kind: "prove-tron-source-package",
        input: {
          ...sourceInput,
          finality: {
            witnesses: [{ recoveryPhrase: "test test test test" }],
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-source",
      ok: false,
      error:
        "SCCP worker request input.finality.witnesses[0].recoveryPhrase must not be sent to the SCCP prover.",
    });
    expect(mocks.loadSourceProver).not.toHaveBeenCalled();
    expect(mocks.bindSource).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "secret-value",
        kind: "prove-tron-proof-package",
        input: {
          ...destinationInput,
          witness: {
            publicInputs: {
              note: VALID_MNEMONIC,
            },
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-value",
      ok: false,
      error:
        "SCCP worker request input.witness.publicInputs.note must not contain recovery phrases or private key material before SCCP proof generation.",
    });
    expect(mocks.loadDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateProofPackage).not.toHaveBeenCalled();
  });

  it("rejects signing-helper worker inputs before proof generation", async () => {
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "signed-helper-destination",
        kind: "prove-tron-proof-package",
        input: {
          ...destinationInput,
          messageBundle: {
            signature_b64: "detached-wallet-signature",
          },
        },
      }),
    ).resolves.toEqual({
      id: "signed-helper-destination",
      ok: false,
      error:
        "SCCP worker request input.messageBundle.signature_b64 must not be sent to the SCCP prover; TRON signing must happen through WalletConnect approval.",
    });
    expect(mocks.loadDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateProofPackage).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "signed-helper-source",
        kind: "prove-tron-source-package",
        input: {
          ...sourceInput,
          transaction: {
            signedTransaction: {
              txID: "22".repeat(32),
            },
          },
        },
      }),
    ).resolves.toEqual({
      id: "signed-helper-source",
      ok: false,
      error:
        "SCCP worker request input.transaction.signedTransaction must not be sent to the SCCP prover; TRON signing must happen through WalletConnect approval.",
    });
    expect(mocks.loadSourceProver).not.toHaveBeenCalled();
    expect(mocks.bindSource).not.toHaveBeenCalled();
  });

  it("allows public TRON signature evidence in worker inputs", async () => {
    const proveSource = vi.fn().mockResolvedValue({ proof: true });
    mocks.loadSourceProver.mockResolvedValue(proveSource);
    mocks.bindSource.mockReturnValue({
      messageBundle: { commitment: { message_id: "11".repeat(32) } },
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
      },
    });
    const worker = await createWorkerHarness();
    const sourceWithPublicSignature = {
      ...sourceInput,
      transaction: {
        txID: "22".repeat(32),
        signature: ["aa".repeat(65)],
      },
      finality: {
        witnesses: [
          {
            signature: "bb".repeat(65),
          },
        ],
      },
    };

    await expect(
      worker.post({
        id: "public-signature-source",
        kind: "prove-tron-source-package",
        input: sourceWithPublicSignature,
      }),
    ).resolves.toMatchObject({
      id: "public-signature-source",
      ok: true,
    });
    expect(proveSource).toHaveBeenCalledWith(sourceWithPublicSignature);
    expect(mocks.bindSource).toHaveBeenCalledWith({
      manifest: sourceWithPublicSignature.manifest,
      proofPackage: { proof: true },
      txId: sourceWithPublicSignature.txId,
      events: sourceWithPublicSignature.events,
      tronSender: sourceWithPublicSignature.tronSender,
      tairaRecipient: sourceWithPublicSignature.tairaRecipient,
      amountDecimal: sourceWithPublicSignature.amountDecimal,
    });
  });

  it("rejects secret-like or signing-helper worker outputs before posting success", async () => {
    const worker = await createWorkerHarness();

    mocks.buildProofPackage.mockReturnValue({
      bridgePayload: {
        privateKeyHex: "00".repeat(32),
      },
    });
    await expect(
      worker.post({
        id: "unsafe-build",
        kind: "build-tron-proof-package",
        input: destinationInput,
      }),
    ).resolves.toEqual({
      id: "unsafe-build",
      ok: false,
      error:
        "SCCP worker result.bridgePayload.privateKeyHex must not be returned by the SCCP prover.",
    });
    expect(mocks.buildProofPackage).toHaveBeenCalledWith(destinationInput);

    const prove = vi.fn();
    mocks.loadDestinationProver.mockResolvedValue(prove);
    mocks.generateProofPackage.mockResolvedValue({
      bridgePayload: {
        signature_b64: "wallet-approved-signature-should-not-exist-here",
      },
    });
    await expect(
      worker.post({
        id: "unsafe-destination",
        kind: "prove-tron-proof-package",
        input: destinationInput,
      }),
    ).resolves.toEqual({
      id: "unsafe-destination",
      ok: false,
      error:
        "SCCP worker result.bridgePayload.signature_b64 must not be returned by the SCCP prover; TRON signing must happen through WalletConnect approval.",
    });
    expect(mocks.loadDestinationProver).toHaveBeenCalledTimes(1);
    expect(mocks.generateProofPackage).toHaveBeenCalledWith({
      ...destinationInput,
      prove,
    });

    const proveSource = vi.fn().mockResolvedValue({ proof: true });
    mocks.loadSourceProver.mockResolvedValue(proveSource);
    mocks.bindSource.mockReturnValue({
      messageBundle: {
        note: VALID_MNEMONIC,
      },
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
      },
    });
    await expect(
      worker.post({
        id: "unsafe-source-secret",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "unsafe-source-secret",
      ok: false,
      error:
        "SCCP worker result.messageBundle.note must not contain recovery phrases or private key material after SCCP proof generation.",
    });

    mocks.bindSource.mockReturnValue({
      messageBundle: { commitment: { message_id: "11".repeat(32) } },
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
        signedTransaction: { txID: "22".repeat(32) },
      },
    });
    await expect(
      worker.post({
        id: "unsafe-source-signed",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "unsafe-source-signed",
      ok: false,
      error:
        "SCCP worker result.settlement.signedTransaction must not be returned by the SCCP prover; TRON signing must happen through WalletConnect approval.",
    });
    expect(proveSource).toHaveBeenCalledTimes(2);
    expect(mocks.bindSource).toHaveBeenCalledTimes(2);
  });

  it("builds a destination proof package without loading a prover", async () => {
    const builtPackage = { submissionPayload: { proof: "0x01" } };
    mocks.buildProofPackage.mockReturnValue(builtPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "build-1",
        kind: "build-tron-proof-package",
        input: destinationInput,
      }),
    ).resolves.toEqual({ id: "build-1", ok: true, result: builtPackage });
    expect(mocks.buildProofPackage).toHaveBeenCalledWith(destinationInput);
    expect(mocks.loadDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateProofPackage).not.toHaveBeenCalled();
  });

  it("links the browser prover before generating a destination proof package", async () => {
    const prove = vi.fn();
    const generatedPackage = { submissionPayload: { proof: "0x02" } };
    mocks.loadDestinationProver.mockResolvedValue(prove);
    mocks.generateProofPackage.mockResolvedValue(generatedPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-1",
        kind: "prove-tron-proof-package",
        input: destinationInput,
      }),
    ).resolves.toEqual({
      id: "prove-1",
      ok: true,
      result: generatedPackage,
    });
    expect(mocks.loadDestinationProver).toHaveBeenCalledTimes(1);
    expect(mocks.generateProofPackage).toHaveBeenCalledWith({
      ...destinationInput,
      prove,
    });
  });

  it("fails closed when the TRON source prover is not linked", async () => {
    mocks.loadSourceProver.mockResolvedValue(undefined);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "source-1",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "source-1",
      ok: false,
      error:
        "TRON -> TAIRA SCCP source prover is not linked; provide a browser-safe source proof module before submitting TAIRA settlement.",
    });
    expect(mocks.bindSource).not.toHaveBeenCalled();
  });

  it("does not reuse the destination prover module URL for TRON source proving", async () => {
    vi.stubEnv(
      "VITE_SCCP_TRON_PROVER_MODULE_URL",
      "/src/utils/sccpNileDiagnosticProver.ts",
    );
    vi.stubEnv("VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL", "");
    mocks.loadSourceProver.mockResolvedValue(undefined);
    const worker = await createWorkerHarness();

    await worker.post({
      id: "source-no-fallback",
      kind: "prove-tron-source-package",
      input: sourceInput,
    });

    expect(mocks.loadSourceProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      moduleUrl: "",
    });
  });

  it("rebinds TRON source prover output to the original event and recipient context", async () => {
    const rawProofPackage = { raw: true, txId: "stale" };
    const boundProofPackage = { submissionPayload: { proof: "0x03" } };
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadSourceProver.mockResolvedValue(proveSource);
    mocks.bindSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "source-2",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "source-2",
      ok: true,
      result: boundProofPackage,
    });
    expect(proveSource).toHaveBeenCalledWith(sourceInput);
    expect(mocks.bindSource).toHaveBeenCalledWith({
      manifest: sourceInput.manifest,
      proofPackage: rawProofPackage,
      txId: sourceInput.txId,
      events: sourceInput.events,
      tronSender: sourceInput.tronSender,
      tairaRecipient: sourceInput.tairaRecipient,
      amountDecimal: sourceInput.amountDecimal,
    });
  });

  it("binds TRON source proofs against a snapshot when the prover mutates input", async () => {
    const rawProofPackage = { raw: true, txId: "mutated" };
    const boundProofPackage = { submissionPayload: { proof: "0x04" } };
    let preMutationProverInput: unknown;
    const proveSource = vi.fn().mockImplementation(async (input) => {
      preMutationProverInput = structuredClone(input);
      const mutableInput = input as Record<string, unknown>;
      mutableInput.txId = "ff".repeat(32);
      mutableInput.events = [];
      mutableInput.tairaRecipient = "alice@taira";
      mutableInput.amountDecimal = "999";
      mutableInput.manifest = { route_id: "mutated_route" };
      return rawProofPackage;
    });
    mocks.loadSourceProver.mockResolvedValue(proveSource);
    mocks.bindSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "source-snapshot-1",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "source-snapshot-1",
      ok: true,
      result: boundProofPackage,
    });
    expect(preMutationProverInput).toMatchObject(
      expect.objectContaining({
        txId: sourceInput.txId,
        events: sourceInput.events,
        tairaRecipient: sourceInput.tairaRecipient,
        amountDecimal: sourceInput.amountDecimal,
      }),
    );
    expect(proveSource.mock.calls[0][0]).not.toBe(sourceInput);
    expect(mocks.bindSource).toHaveBeenCalledWith({
      manifest: sourceInput.manifest,
      proofPackage: rawProofPackage,
      txId: sourceInput.txId,
      events: sourceInput.events,
      tronSender: sourceInput.tronSender,
      tairaRecipient: sourceInput.tairaRecipient,
      amountDecimal: sourceInput.amountDecimal,
    });
  });

  it("does not return raw TRON source prover output when binding fails", async () => {
    const rawProofPackage = { raw: true, txId: "stale" };
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadSourceProver.mockResolvedValue(proveSource);
    mocks.bindSource.mockImplementation(() => {
      throw new Error("source event digest mismatch");
    });
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "source-3",
        kind: "prove-tron-source-package",
        input: sourceInput,
      }),
    ).resolves.toEqual({
      id: "source-3",
      ok: false,
      error: "source event digest mismatch",
    });
    expect(mocks.bindSource).toHaveBeenCalled();
  });
});

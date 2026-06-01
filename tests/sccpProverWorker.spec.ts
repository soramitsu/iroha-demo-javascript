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

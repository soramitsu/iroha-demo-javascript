import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BscToTairaSourceProofPackageInput,
  SolanaToTairaSourceProofPackageInput,
  TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import type {
  BscSccpProofPackageInput,
  SolanaSccpProofPackageInput,
  TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";

const mocks = vi.hoisted(() => ({
  bindBscSource: vi.fn(),
  bindSolanaSource: vi.fn(),
  bindSource: vi.fn(),
  buildBscSourceProof: vi.fn(),
  buildBscProofPackage: vi.fn(),
  buildProofPackage: vi.fn(),
  buildSolanaProofPackage: vi.fn(),
  generateBscProofPackage: vi.fn(),
  generateProofPackage: vi.fn(),
  generateSolanaProofPackage: vi.fn(),
  loadBscDestinationProver: vi.fn(),
  loadBscSourceProver: vi.fn(),
  loadDestinationProver: vi.fn(),
  loadSolanaDestinationProver: vi.fn(),
  loadSolanaSourceProver: vi.fn(),
  loadSourceProver: vi.fn(),
  readBscSourceMaterial: vi.fn(),
}));

vi.mock("@/utils/sccp", () => ({
  bindBscToTairaSourceProofPackage: mocks.bindBscSource,
  bindSolanaToTairaSourceProofPackage: mocks.bindSolanaSource,
  bindTronToTairaSourceProofPackage: mocks.bindSource,
  readBscSourceProverMaterialBinding: mocks.readBscSourceMaterial,
}));

vi.mock("@/utils/sccpProofPackage", () => ({
  buildBscSccpProofPackage: mocks.buildBscProofPackage,
  buildSolanaSccpProofPackage: mocks.buildSolanaProofPackage,
  buildTronSccpProofPackage: mocks.buildProofPackage,
  generateBscSccpProofPackage: mocks.generateBscProofPackage,
  generateSolanaSccpProofPackage: mocks.generateSolanaProofPackage,
  generateTronSccpProofPackage: mocks.generateProofPackage,
}));

vi.mock("@/utils/sccpProverLink", () => ({
  loadBscSccpProveFn: mocks.loadBscDestinationProver,
  loadBscSccpSourceProveFn: mocks.loadBscSourceProver,
  loadSolanaSccpProveFn: mocks.loadSolanaDestinationProver,
  loadSolanaSccpSourceProveFn: mocks.loadSolanaSourceProver,
  loadTronSccpProveFn: mocks.loadDestinationProver,
  loadTronSccpSourceProveFn: mocks.loadSourceProver,
}));

vi.mock("@iroha/iroha-js/sccp", () => ({
  buildBscSourceChainProofEnvelope: mocks.buildBscSourceProof,
}));

type WorkerHarness = {
  post: (data: unknown) => Promise<unknown>;
  scope: Record<string, unknown>;
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
    scope: workerScope as Record<string, unknown>,
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

const bscDestinationInput = {
  routeId: "taira_bsc_xor",
  messageBundle: { commitment: { message_id: "11".repeat(32) } },
  manifest: { route_id: "taira_bsc_xor" },
  bscRecipient: "0x1111111111111111111111111111111111111111",
  amountDecimal: "1",
} as unknown as BscSccpProofPackageInput;

const solanaDestinationInput = {
  witness: {
    messageId: `0x${"11".repeat(32)}`,
    payloadHash: `0x${"22".repeat(32)}`,
  },
  publicInputs: {
    messageId: `0x${"11".repeat(32)}`,
    payloadHash: `0x${"22".repeat(32)}`,
    targetDomain: 3,
    commitmentRoot: `0x${"33".repeat(32)}`,
    finalityHeight: "42",
    finalityBlockHash: `0x${"44".repeat(32)}`,
  },
  bundleBytes: `0x${"55".repeat(32)}`,
  proverModuleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
} as unknown as SolanaSccpProofPackageInput;

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

const bscSourceInput = {
  manifest: {
    route_id: "taira_bsc_xor",
    tairaXorBridgeAddress: "0x1111111111111111111111111111111111111111",
    sccpBscSourceBridgeAddress: "0x2222222222222222222222222222222222222222",
  },
  txId: `0x${"33".repeat(32)}`,
  transaction: {
    hash: `0x${"33".repeat(32)}`,
    from: "0x4444444444444444444444444444444444444444",
    to: "0x1111111111111111111111111111111111111111",
    input: "0x1234",
  },
  receipt: {
    transactionHash: `0x${"33".repeat(32)}`,
    transactionIndex: "0x2",
    status: "0x1",
    logs: [],
  },
  block: {
    hash: `0x${"55".repeat(32)}`,
  },
  bscSender: "0x4444444444444444444444444444444444444444",
  tairaRecipient: "testu4gw9wmmr7aek32p2syxs7qkp7x9gksw2hhvlq2kq4e6n4v4",
  amountDecimal: "1",
  amountBaseUnits: "1000000000",
} as unknown as BscToTairaSourceProofPackageInput;

const solanaSourceInput = {
  manifest: {
    route_id: "taira_sol_xor",
    solanaSourceBridgeAddress: "BPFLoaderUpgradeab1e11111111111111111111111",
    solanaSourceStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
  },
  solanaNetwork: "testnet",
  solanaRpcUrl: "https://api.testnet.solana.com",
  sourceBridgeAddress: "BPFLoaderUpgradeab1e11111111111111111111111",
  sourceStateAddress: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
  tokenMintAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  txId: "2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2",
  transaction: {
    slot: 123,
    transaction: { signatures: [] },
    meta: { err: null },
  },
  signatureStatus: {
    slot: 123,
    confirmationStatus: "confirmed",
    err: null,
  },
  finality: {
    slot: 123,
    confirmationStatus: "confirmed",
    err: null,
  },
  solanaSender: "gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5",
  tairaRecipient: "testu4gw9wmmr7aek32p2syxs7qkp7x9gksw2hhvlq2kq4e6n4v4",
  amountDecimal: "1",
  amountBaseUnits: "1000000000",
} as unknown as SolanaToTairaSourceProofPackageInput;

const bscSourceMaterialBinding = {
  proofArtifactHash: `0x${"66".repeat(32)}`,
  provingKeyHash: `0x${"77".repeat(32)}`,
  nativeEvmProverBundleHash: `0x${"88".repeat(32)}`,
};

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const WORKER_SECRET_INPUT_ERROR =
  "SCCP worker request input must not contain secret-like material before SCCP proof generation.";
const WORKER_SIGNING_INPUT_ERROR =
  "SCCP worker request input must not contain signing helper payloads; counterparty signing must happen through wallet approval.";
const WORKER_SECRET_OUTPUT_ERROR =
  "SCCP worker result must not contain secret-like material after SCCP proof generation.";
const WORKER_SIGNING_OUTPUT_ERROR =
  "SCCP worker result must not contain signing helper payloads; counterparty signing must happen through wallet approval.";
const WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR =
  "BSC destination proof requests must not include caller-supplied proof material; proof material must come from the configured BSC prover module.";
const WORKER_BSC_SOURCE_PROOF_MATERIAL_ERROR =
  "BSC source proof requests must not include caller-supplied proof material; proof hashes are derived from the route manifest inside the worker.";
const BSC_BINARY_SOURCE_PROOF_HEX = `0x${"ab".repeat(96)}`;
const BSC_SOURCE_FINALITY_HEIGHT = "1";
const BSC_SOURCE_FINALITY_BLOCK_HASH = `0x${"78".repeat(32)}`;

const bscRawSourceProofPackage = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  txId: bscSourceInput.txId,
  sourceEventDigest: `0x${"99".repeat(32)}`,
  publicInputs: {
    routeId: "taira_bsc_xor",
  },
  messageBundle: {
    commitment_root: `0x${"cc".repeat(32)}`,
    commitment: {
      message_id: `0x${"aa".repeat(32)}`,
      payload_hash: `0x${"bb".repeat(32)}`,
    },
    finality_proof: `0x${"7b".repeat(8)}`,
  },
  ...overrides,
});

const bscPatchedSourceProofPackage = (
  raw: Record<string, unknown>,
): Record<string, unknown> => {
  const messageBundle = raw.messageBundle as Record<string, unknown>;
  return {
    ...raw,
    publicInputs: {
      ...((raw.publicInputs as Record<string, unknown> | undefined) ?? {}),
      finalityHeight: BSC_SOURCE_FINALITY_HEIGHT,
      finalityBlockHash: BSC_SOURCE_FINALITY_BLOCK_HASH,
    },
    messageBundle: {
      ...messageBundle,
      finality_proof: BSC_BINARY_SOURCE_PROOF_HEX,
    },
  };
};

const expectNoWorkerSecretLeak = (
  message: string,
  forbidden: string[],
): void => {
  for (const value of forbidden) {
    expect(message).not.toContain(value);
  }
};

describe("SCCP prover worker", () => {
  beforeEach(() => {
    mocks.bindBscSource.mockReset();
    mocks.bindSolanaSource.mockReset();
    mocks.bindSource.mockReset();
    mocks.buildBscSourceProof.mockReset();
    mocks.buildBscProofPackage.mockReset();
    mocks.buildProofPackage.mockReset();
    mocks.buildSolanaProofPackage.mockReset();
    mocks.generateBscProofPackage.mockReset();
    mocks.generateProofPackage.mockReset();
    mocks.generateSolanaProofPackage.mockReset();
    mocks.loadBscDestinationProver.mockReset();
    mocks.loadBscSourceProver.mockReset();
    mocks.loadDestinationProver.mockReset();
    mocks.loadSolanaDestinationProver.mockReset();
    mocks.loadSolanaSourceProver.mockReset();
    mocks.loadSourceProver.mockReset();
    mocks.readBscSourceMaterial.mockReset();
    mocks.readBscSourceMaterial.mockReturnValue(bscSourceMaterialBinding);
    mocks.buildBscSourceProof.mockReturnValue({
      sourceProofHex: BSC_BINARY_SOURCE_PROOF_HEX,
      sourceProofBytes: new Uint8Array(96),
      sourceEventDigest: `0x${"12".repeat(32)}`,
      observedSourceEventDigest: `0x${"99".repeat(32)}`,
      sourceEventLeafHash: `0x${"34".repeat(32)}`,
      receiptOrMessageRoot: `0x${"56".repeat(32)}`,
      finalityHeight: BSC_SOURCE_FINALITY_HEIGHT,
      finalityBlockHash: BSC_SOURCE_FINALITY_BLOCK_HASH,
      receiptsRoot: `0x${"9a".repeat(32)}`,
      receiptRootIndex: "0",
      syntheticRootMarker: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-bsc-1",
        kind: "build-bsc-proof-package",
        input: bscDestinationInput,
      }),
    ).toMatchObject({ id: "req-bsc-1", kind: "build-bsc-proof-package" });
    expect(
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-bsc-source-1",
        kind: "prove-bsc-source-package",
        input: bscSourceInput,
      }),
    ).toMatchObject({
      id: "req-bsc-source-1",
      kind: "prove-bsc-source-package",
    });
    expect(
      workerModule.normalizeSccpProverWorkerRequest({
        id: "req-solana-1",
        kind: "prove-solana-proof-package",
        input: solanaDestinationInput,
      }),
    ).toMatchObject({
      id: "req-solana-1",
      kind: "prove-solana-proof-package",
    });
    for (const key of [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "provingKeyHash",
      "proving_key_hash",
      "nativeEvmProverBundleHash",
      "native_evm_prover_bundle_hash",
      "nativeProverBundleHash",
      "native_prover_bundle_hash",
    ]) {
      expect(() =>
        workerModule.normalizeSccpProverWorkerRequest({
          id: `req-bsc-source-forged-${key.replace(/_/gu, "-")}`,
          kind: "prove-bsc-source-package",
          input: {
            ...bscSourceInput,
            [key]: `0x${"99".repeat(32)}`,
          },
        }),
      ).toThrow(WORKER_BSC_SOURCE_PROOF_MATERIAL_ERROR);
    }
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
        kind: "prove-aptos-proof-package",
        input: destinationInput,
      }),
    ).toThrow("Unsupported SCCP worker request: prove-aptos-proof-package");
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
    ).toThrow(WORKER_SECRET_INPUT_ERROR);
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

  it("rejects accessor-backed worker request inputs without invoking them", async () => {
    const workerModule = await import("@/workers/sccpProver.worker");
    const accessedFields: string[] = [];
    const input = {
      ...(sourceInput as unknown as Record<string, unknown>),
      manifest: {
        ...((sourceInput as unknown as Record<string, unknown>)
          .manifest as Record<string, unknown>),
      },
    };
    Object.defineProperty(input.manifest, "route_id", {
      enumerable: true,
      get() {
        accessedFields.push("route_id");
        return "taira_tron_xor";
      },
    });

    expect(() =>
      workerModule.normalizeSccpProverWorkerRequest({
        id: "source-accessor-1",
        kind: "prove-tron-source-package",
        input,
      }),
    ).toThrow(/SCCP proof data/u);
    expect(accessedFields).toEqual([]);
  });

  it("rejects accessor-backed worker results without invoking them", async () => {
    const workerModule = await import("@/workers/sccpProver.worker");
    const accessedFields: string[] = [];
    const result = {
      bridgePayload: {
        messageBundle: {
          commitment: { message_id: "11".repeat(32) },
        },
      },
    };
    Object.defineProperty(result.bridgePayload.messageBundle, "debug", {
      enumerable: true,
      get() {
        accessedFields.push("debug");
        return "not JSON";
      },
    });

    expect(() =>
      workerModule.assertNoUnsafeSccpWorkerOutputFields(result),
    ).toThrow(WORKER_SECRET_OUTPUT_ERROR);
    expect(accessedFields).toEqual([]);
  });

  it("rejects worker result array side-channel fields", async () => {
    const workerModule = await import("@/workers/sccpProver.worker");
    const result = {
      bridgePayloads: [
        {
          messageBundle: {
            commitment: { message_id: "11".repeat(32) },
          },
        },
      ],
    };
    (
      result.bridgePayloads as Array<Record<string, unknown>> & {
        privateKeyHex?: string;
      }
    ).privateKeyHex = "11".repeat(32);

    expect(() =>
      workerModule.assertNoUnsafeSccpWorkerOutputFields(result),
    ).toThrow(WORKER_SECRET_OUTPUT_ERROR);
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
        kind: "prove-aptos-proof-package",
        input: {},
      }),
    ).resolves.toEqual({
      id: "req-2",
      ok: false,
      error: "Unsupported SCCP worker request: prove-aptos-proof-package",
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
      error: WORKER_SECRET_INPUT_ERROR,
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
      error: WORKER_SECRET_INPUT_ERROR,
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
      error: WORKER_SECRET_INPUT_ERROR,
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
      error: WORKER_SECRET_INPUT_ERROR,
    });
    expect(mocks.loadDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateProofPackage).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "secret-bsc-destination",
        kind: "prove-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          messageBundle: {
            signedTransaction: "0x1234",
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-bsc-destination",
      ok: false,
      error: WORKER_SIGNING_INPUT_ERROR,
    });
    expect(mocks.loadBscDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateBscProofPackage).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "secret-bsc-source",
        kind: "prove-bsc-source-package",
        input: {
          ...bscSourceInput,
          receipt: {
            logs: [{ privateKey: "00".repeat(32) }],
          },
        },
      }),
    ).resolves.toEqual({
      id: "secret-bsc-source",
      ok: false,
      error: WORKER_SECRET_INPUT_ERROR,
    });
    expect(mocks.loadBscSourceProver).not.toHaveBeenCalled();
    expect(mocks.bindBscSource).not.toHaveBeenCalled();

    for (const value of [
      "messageBundle.private_key",
      "publicInputs.mnemonic",
      "recoveryPhrase",
      "publicInputs.note",
      "receipt.logs",
      "privateKey",
      "abandon abandon",
      "00".repeat(32),
    ]) {
      expectNoWorkerSecretLeak(WORKER_SECRET_INPUT_ERROR, [value]);
    }
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
      error: WORKER_SIGNING_INPUT_ERROR,
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
      error: WORKER_SIGNING_INPUT_ERROR,
    });
    expect(mocks.loadSourceProver).not.toHaveBeenCalled();
    expect(mocks.bindSource).not.toHaveBeenCalled();

    await expect(
      worker.post({
        id: "signed-helper-bsc-source",
        kind: "prove-bsc-source-package",
        input: {
          ...bscSourceInput,
          transaction: {
            signedTransaction: {
              hash: `0x${"33".repeat(32)}`,
            },
          },
        },
      }),
    ).resolves.toEqual({
      id: "signed-helper-bsc-source",
      ok: false,
      error: WORKER_SIGNING_INPUT_ERROR,
    });
    expect(mocks.loadBscSourceProver).not.toHaveBeenCalled();
    expect(mocks.bindBscSource).not.toHaveBeenCalled();
    for (const value of ["signature_b64", "signedTransaction"]) {
      expectNoWorkerSecretLeak(WORKER_SIGNING_INPUT_ERROR, [value]);
    }
  });

  it("rejects caller-supplied BSC source proof material before loading a prover", async () => {
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "forged-bsc-source-material",
        kind: "prove-bsc-source-package",
        input: {
          ...bscSourceInput,
          proving_key_hash: `0x${"99".repeat(32)}`,
        },
      }),
    ).resolves.toEqual({
      id: "forged-bsc-source-material",
      ok: false,
      error: WORKER_BSC_SOURCE_PROOF_MATERIAL_ERROR,
    });
    expect(mocks.loadBscSourceProver).not.toHaveBeenCalled();
    expect(mocks.readBscSourceMaterial).not.toHaveBeenCalled();
    expect(mocks.bindBscSource).not.toHaveBeenCalled();
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
      error: WORKER_SECRET_OUTPUT_ERROR,
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
      error: WORKER_SIGNING_OUTPUT_ERROR,
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
      error: WORKER_SECRET_OUTPUT_ERROR,
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
      error: WORKER_SIGNING_OUTPUT_ERROR,
    });
    expect(proveSource).toHaveBeenCalledTimes(2);
    expect(mocks.bindSource).toHaveBeenCalledTimes(2);
    for (const value of [
      "bridgePayload.privateKeyHex",
      "messageBundle.note",
      "abandon abandon",
      "00".repeat(32),
    ]) {
      expectNoWorkerSecretLeak(WORKER_SECRET_OUTPUT_ERROR, [value]);
    }
    for (const value of ["signature_b64", "signedTransaction"]) {
      expectNoWorkerSecretLeak(WORKER_SIGNING_OUTPUT_ERROR, [value]);
    }
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

  it("builds a BSC destination proof package without loading a prover", async () => {
    const builtPackage = {
      request: { routeId: "taira_bsc_xor" },
      submission: null,
      bridgePayload: null,
      canonicalPayloadHex: null,
    };
    mocks.buildBscProofPackage.mockReturnValue(builtPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "build-bsc-1",
        kind: "build-bsc-proof-package",
        input: bscDestinationInput,
      }),
    ).resolves.toEqual({
      id: "build-bsc-1",
      ok: true,
      result: builtPackage,
    });
    expect(mocks.buildBscProofPackage).toHaveBeenCalledWith(
      bscDestinationInput,
    );
    expect(mocks.loadBscDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateBscProofPackage).not.toHaveBeenCalled();
  });

  it("builds a Solana destination proof package without loading a prover", async () => {
    const builtPackage = {
      request: { routeId: "taira_sol_xor" },
      submission: null,
    };
    mocks.buildSolanaProofPackage.mockReturnValue(builtPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "build-solana-1",
        kind: "build-solana-proof-package",
        input: solanaDestinationInput,
      }),
    ).resolves.toEqual({
      id: "build-solana-1",
      ok: true,
      result: builtPackage,
    });
    expect(mocks.buildSolanaProofPackage).toHaveBeenCalledWith(
      solanaDestinationInput,
    );
    expect(mocks.loadSolanaDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateSolanaProofPackage).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied BSC proof material in build-only worker requests", async () => {
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "build-bsc-proof-bytes",
        kind: "build-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proofBytes: new Uint8Array([1, 2, 3]),
        },
      }),
    ).resolves.toEqual({
      id: "build-bsc-proof-bytes",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    await expect(
      worker.post({
        id: "build-bsc-proof-result",
        kind: "build-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proofResult: { requestHash: `0x${"11".repeat(32)}` },
        },
      }),
    ).resolves.toEqual({
      id: "build-bsc-proof-result",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    await expect(
      worker.post({
        id: "build-bsc-proof-snake-aliases",
        kind: "build-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proof_bytes: "0x010203",
          proof_result: { requestHash: `0x${"22".repeat(32)}` },
        },
      }),
    ).resolves.toEqual({
      id: "build-bsc-proof-snake-aliases",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    expect(mocks.buildBscProofPackage).not.toHaveBeenCalled();
    expect(mocks.loadBscDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateBscProofPackage).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied BSC proof material before loading the destination prover", async () => {
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-bsc-proof-bytes",
        kind: "prove-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proofBytes: new Uint8Array([1, 2, 3]),
        },
      }),
    ).resolves.toEqual({
      id: "prove-bsc-proof-bytes",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    await expect(
      worker.post({
        id: "prove-bsc-proof-result",
        kind: "prove-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proofResult: { requestHash: `0x${"11".repeat(32)}` },
        },
      }),
    ).resolves.toEqual({
      id: "prove-bsc-proof-result",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    await expect(
      worker.post({
        id: "prove-bsc-proof-snake-aliases",
        kind: "prove-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proof_bytes: "0x010203",
          proof_result: { requestHash: `0x${"22".repeat(32)}` },
        },
      }),
    ).resolves.toEqual({
      id: "prove-bsc-proof-snake-aliases",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    expect(mocks.buildBscProofPackage).not.toHaveBeenCalled();
    expect(mocks.loadBscDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateBscProofPackage).not.toHaveBeenCalled();
  });

  it("rejects completed BSC proof packages from the build-only worker path", async () => {
    mocks.buildBscProofPackage.mockReturnValue({
      request: { routeId: "taira_bsc_xor" },
      submission: { proofBytes: "0x010203" },
      bridgePayload: null,
      canonicalPayloadHex: null,
    });
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "build-bsc-complete-output",
        kind: "build-bsc-proof-package",
        input: bscDestinationInput,
      }),
    ).resolves.toEqual({
      id: "build-bsc-complete-output",
      ok: false,
      error: WORKER_BSC_BUILD_PROOF_MATERIAL_ERROR,
    });
    expect(mocks.buildBscProofPackage).toHaveBeenCalledWith(
      bscDestinationInput,
    );
    expect(mocks.loadBscDestinationProver).not.toHaveBeenCalled();
    expect(mocks.generateBscProofPackage).not.toHaveBeenCalled();
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

  it("links the browser BSC prover before generating a destination proof package", async () => {
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
      "/sccp-bsc/taira-bsc-xor-runtime.config.json",
    );
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
      "/sccp-bsc/taira-bsc-xor-prover.js",
    );
    const prove = vi.fn();
    const generatedPackage = { submissionPayload: { proof: "0x12" } };
    mocks.loadBscDestinationProver.mockResolvedValue(prove);
    mocks.generateBscProofPackage.mockResolvedValue(generatedPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-bsc-1",
        kind: "prove-bsc-proof-package",
        input: bscDestinationInput,
      }),
    ).resolves.toEqual({
      id: "prove-bsc-1",
      ok: true,
      result: generatedPackage,
    });
    expect(mocks.loadBscDestinationProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "/sccp-bsc/taira-bsc-xor-prover.js",
    });
    expect(mocks.generateBscProofPackage).toHaveBeenCalledWith({
      ...bscDestinationInput,
      prove,
    });
    expect(worker.scope.IrohaSccpBscProverConfigUrl).toBe(
      "/sccp-bsc/taira-bsc-xor-runtime.config.json",
    );
  });

  it("links the browser Solana prover before generating a destination proof package", async () => {
    vi.stubEnv(
      "VITE_SCCP_SOLANA_PROVER_MODULE_URL",
      "/sccp-solana/env-destination-prover.js",
    );
    const prove = vi.fn();
    const generatedPackage = {
      request: { routeId: "taira_sol_xor" },
      submission: { instructionDataHex: "0x1234" },
    };
    mocks.loadSolanaDestinationProver.mockResolvedValue(prove);
    mocks.generateSolanaProofPackage.mockResolvedValue(generatedPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-solana-1",
        kind: "prove-solana-proof-package",
        input: solanaDestinationInput,
      }),
    ).resolves.toEqual({
      id: "prove-solana-1",
      ok: true,
      result: generatedPackage,
    });
    expect(mocks.loadSolanaDestinationProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
    });
    expect(mocks.generateSolanaProofPackage).toHaveBeenCalledWith({
      ...solanaDestinationInput,
      prove,
    });
  });

  it("fails closed when the Solana destination prover is not linked", async () => {
    mocks.loadSolanaDestinationProver.mockResolvedValue(undefined);
    mocks.generateSolanaProofPackage.mockRejectedValue(
      new Error(
        "Solana SCCP prover is not linked; provide a browser-safe prove function before generating production proofs.",
      ),
    );
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-solana-missing",
        kind: "prove-solana-proof-package",
        input: solanaDestinationInput,
      }),
    ).resolves.toEqual({
      id: "prove-solana-missing",
      ok: false,
      error:
        "Solana SCCP prover is not linked; provide a browser-safe prove function before generating production proofs.",
    });
  });

  it("uses a route-published BSC runtime config ahead of stale env config", async () => {
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
      "/sccp-bsc/stale-env-config.json",
    );
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
      "/sccp-bsc/taira-bsc-xor-prover.js",
    );
    const prove = vi.fn();
    const generatedPackage = { submissionPayload: { proof: "0x12" } };
    mocks.loadBscDestinationProver.mockResolvedValue(prove);
    mocks.generateBscProofPackage.mockResolvedValue(generatedPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "prove-bsc-route-config",
        kind: "prove-bsc-proof-package",
        input: {
          ...bscDestinationInput,
          proverConfigUrl: "/sccp-bsc/route-config.json",
        },
      }),
    ).resolves.toEqual({
      id: "prove-bsc-route-config",
      ok: true,
      result: generatedPackage,
    });
    expect(worker.scope.IrohaSccpBscProverConfigUrl).toBe(
      "/sccp-bsc/route-config.json",
    );
  });

  it("does not reuse TRON prover module URLs for BSC destination proving", async () => {
    vi.stubEnv("VITE_SCCP_TRON_PROVER_MODULE_URL", "/tron-prover.js");
    vi.stubEnv("VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL", "");
    vi.stubEnv("VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL", "");
    mocks.loadBscDestinationProver.mockResolvedValue(undefined);
    mocks.generateBscProofPackage.mockRejectedValue(new Error("missing BSC"));
    const worker = await createWorkerHarness();

    await worker.post({
      id: "bsc-no-fallback",
      kind: "prove-bsc-proof-package",
      input: bscDestinationInput,
    });

    expect(mocks.loadBscDestinationProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "",
    });
    expect(worker.scope.IrohaSccpBscProverConfigUrl).toBeUndefined();
  });

  it("fails closed when the BSC source prover is not linked", async () => {
    mocks.loadBscSourceProver.mockResolvedValue(undefined);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "bsc-source-1",
        kind: "prove-bsc-source-package",
        input: bscSourceInput,
      }),
    ).resolves.toEqual({
      id: "bsc-source-1",
      ok: false,
      error:
        "BSC -> TAIRA SCCP source prover is not linked; provide a browser-safe BSC source proof module before submitting TAIRA settlement.",
    });
    expect(mocks.bindBscSource).not.toHaveBeenCalled();
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

  it("does not reuse the destination prover module URL for BSC source proving", async () => {
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
      "/src/utils/sccpBscDiagnosticProver.ts",
    );
    vi.stubEnv("VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL", "");
    mocks.loadBscSourceProver.mockResolvedValue(undefined);
    const worker = await createWorkerHarness();

    await worker.post({
      id: "bsc-source-no-fallback",
      kind: "prove-bsc-source-package",
      input: bscSourceInput,
    });

    expect(mocks.loadBscSourceProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "",
    });
  });

  it("fails closed when the Solana source prover is not linked", async () => {
    vi.stubEnv(
      "VITE_SCCP_SOLANA_PROVER_MODULE_URL",
      "/sccp-solana/destination-prover.js",
    );
    vi.stubEnv("VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL", "");
    mocks.loadSolanaSourceProver.mockResolvedValue(undefined);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "solana-source-1",
        kind: "prove-solana-source-package",
        input: solanaSourceInput,
      }),
    ).resolves.toEqual({
      id: "solana-source-1",
      ok: false,
      error:
        "Solana -> TAIRA SCCP source prover is not linked; provide a browser-safe Solana source proof module before submitting TAIRA settlement.",
    });
    expect(mocks.loadSolanaSourceProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "",
    });
    expect(mocks.bindSolanaSource).not.toHaveBeenCalled();
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

  it("rebinds BSC source prover output to the original receipt and recipient context", async () => {
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
      "/sccp-bsc/taira-bsc-xor-runtime.config.json",
    );
    vi.stubEnv(
      "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL",
      "/sccp-bsc/taira-bsc-xor-prover.js",
    );
    const rawProofPackage = bscRawSourceProofPackage({ txId: "stale" });
    const boundProofPackage = { submissionPayload: { proof: "0x13" } };
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadBscSourceProver.mockResolvedValue(proveSource);
    mocks.bindBscSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "bsc-source-2",
        kind: "prove-bsc-source-package",
        input: bscSourceInput,
      }),
    ).resolves.toEqual({
      id: "bsc-source-2",
      ok: true,
      result: boundProofPackage,
    });
    expect(mocks.loadBscSourceProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "/sccp-bsc/taira-bsc-xor-prover.js",
    });
    expect(proveSource).toHaveBeenCalledWith({
      ...bscSourceInput,
      receiptRootIndex: "2",
      ...bscSourceMaterialBinding,
    });
    expect(mocks.buildBscSourceProof).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: bscSourceInput.receipt,
        receiptRootIndex: "2",
      }),
    );
    expect(mocks.bindBscSource).toHaveBeenCalledWith({
      manifest: bscSourceInput.manifest,
      ...bscSourceMaterialBinding,
      proofPackage: bscPatchedSourceProofPackage(rawProofPackage),
      txId: bscSourceInput.txId,
      receipt: bscSourceInput.receipt,
      bscSender: bscSourceInput.bscSender,
      tairaRecipient: bscSourceInput.tairaRecipient,
      amountDecimal: bscSourceInput.amountDecimal,
    });
    expect(worker.scope.IrohaSccpBscProverConfigUrl).toBe(
      "/sccp-bsc/taira-bsc-xor-runtime.config.json",
    );
  });

  it("rebinds Solana source prover output to the original burn and recipient context", async () => {
    vi.stubEnv(
      "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL",
      "/sccp-solana/taira-solana-xor-source-prover.js",
    );
    const rawProofPackage = { raw: true, txId: "stale" };
    const boundProofPackage = { submissionPayload: { proof: "0x23" } };
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadSolanaSourceProver.mockResolvedValue(proveSource);
    mocks.bindSolanaSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "solana-source-2",
        kind: "prove-solana-source-package",
        input: solanaSourceInput,
      }),
    ).resolves.toEqual({
      id: "solana-source-2",
      ok: true,
      result: boundProofPackage,
    });
    expect(mocks.loadSolanaSourceProver).toHaveBeenCalledWith({
      globalScope: expect.any(Object),
      importer: expect.any(Function),
      moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
    });
    expect(proveSource).toHaveBeenCalledWith(solanaSourceInput);
    expect(mocks.bindSolanaSource).toHaveBeenCalledWith({
      manifest: solanaSourceInput.manifest,
      proofPackage: rawProofPackage,
      txId: solanaSourceInput.txId,
      solanaSender: solanaSourceInput.solanaSender,
      tairaRecipient: solanaSourceInput.tairaRecipient,
      amountDecimal: solanaSourceInput.amountDecimal,
      amountBaseUnits: solanaSourceInput.amountBaseUnits,
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

  it("binds BSC source proofs against a snapshot when the prover mutates input", async () => {
    const rawProofPackage = bscRawSourceProofPackage({ txId: "mutated" });
    const boundProofPackage = { submissionPayload: { proof: "0x14" } };
    let preMutationProverInput: unknown;
    const proveSource = vi.fn().mockImplementation(async (input) => {
      preMutationProverInput = structuredClone(input);
      const mutableInput = input as Record<string, unknown>;
      mutableInput.txId = `0x${"ff".repeat(32)}`;
      mutableInput.receipt = {};
      mutableInput.bscSender = "0x9999999999999999999999999999999999999999";
      mutableInput.tairaRecipient = "alice@taira";
      mutableInput.amountDecimal = "999";
      mutableInput.manifest = { route_id: "mutated_route" };
      return rawProofPackage;
    });
    mocks.loadBscSourceProver.mockResolvedValue(proveSource);
    mocks.bindBscSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "bsc-source-snapshot-1",
        kind: "prove-bsc-source-package",
        input: bscSourceInput,
      }),
    ).resolves.toEqual({
      id: "bsc-source-snapshot-1",
      ok: true,
      result: boundProofPackage,
    });
    expect(preMutationProverInput).toMatchObject(
      expect.objectContaining({
        txId: bscSourceInput.txId,
        receipt: bscSourceInput.receipt,
        receiptRootIndex: "2",
        ...bscSourceMaterialBinding,
        tairaRecipient: bscSourceInput.tairaRecipient,
        amountDecimal: bscSourceInput.amountDecimal,
      }),
    );
    expect(proveSource.mock.calls[0][0]).not.toBe(bscSourceInput);
    expect(mocks.bindBscSource).toHaveBeenCalledWith({
      manifest: bscSourceInput.manifest,
      ...bscSourceMaterialBinding,
      proofPackage: bscPatchedSourceProofPackage(rawProofPackage),
      txId: bscSourceInput.txId,
      receipt: bscSourceInput.receipt,
      bscSender: bscSourceInput.bscSender,
      tairaRecipient: bscSourceInput.tairaRecipient,
      amountDecimal: bscSourceInput.amountDecimal,
    });
  });

  it("binds Solana source proofs against a snapshot when the prover mutates input", async () => {
    const rawProofPackage = { raw: true, txId: "mutated" };
    const boundProofPackage = { submissionPayload: { proof: "0x24" } };
    let preMutationProverInput: unknown;
    const proveSource = vi.fn().mockImplementation(async (input) => {
      preMutationProverInput = structuredClone(input);
      const mutableInput = input as Record<string, unknown>;
      mutableInput.txId =
        "1111111111111111111111111111111111111111111111111111111111111111";
      mutableInput.transaction = {};
      mutableInput.solanaSender = "So11111111111111111111111111111111111111112";
      mutableInput.tairaRecipient = "alice@taira";
      mutableInput.amountDecimal = "999";
      mutableInput.manifest = { route_id: "mutated_route" };
      return rawProofPackage;
    });
    mocks.loadSolanaSourceProver.mockResolvedValue(proveSource);
    mocks.bindSolanaSource.mockReturnValue(boundProofPackage);
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "solana-source-snapshot-1",
        kind: "prove-solana-source-package",
        input: solanaSourceInput,
      }),
    ).resolves.toEqual({
      id: "solana-source-snapshot-1",
      ok: true,
      result: boundProofPackage,
    });
    expect(preMutationProverInput).toMatchObject(
      expect.objectContaining({
        txId: solanaSourceInput.txId,
        transaction: solanaSourceInput.transaction,
        solanaSender: solanaSourceInput.solanaSender,
        tairaRecipient: solanaSourceInput.tairaRecipient,
        amountDecimal: solanaSourceInput.amountDecimal,
      }),
    );
    expect(proveSource.mock.calls[0][0]).not.toBe(solanaSourceInput);
    expect(mocks.bindSolanaSource).toHaveBeenCalledWith({
      manifest: solanaSourceInput.manifest,
      proofPackage: rawProofPackage,
      txId: solanaSourceInput.txId,
      solanaSender: solanaSourceInput.solanaSender,
      tairaRecipient: solanaSourceInput.tairaRecipient,
      amountDecimal: solanaSourceInput.amountDecimal,
      amountBaseUnits: solanaSourceInput.amountBaseUnits,
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

  it("does not return raw BSC source prover output when binding fails", async () => {
    const rawProofPackage = bscRawSourceProofPackage({ txId: "stale" });
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadBscSourceProver.mockResolvedValue(proveSource);
    mocks.bindBscSource.mockImplementation(() => {
      throw new Error("BSC source event digest mismatch");
    });
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "bsc-source-3",
        kind: "prove-bsc-source-package",
        input: bscSourceInput,
      }),
    ).resolves.toEqual({
      id: "bsc-source-3",
      ok: false,
      error: "BSC source event digest mismatch",
    });
    expect(mocks.bindBscSource).toHaveBeenCalled();
  });

  it("does not return raw Solana source prover output when binding fails", async () => {
    const rawProofPackage = { raw: true, txId: "stale" };
    const proveSource = vi.fn().mockResolvedValue(rawProofPackage);
    mocks.loadSolanaSourceProver.mockResolvedValue(proveSource);
    mocks.bindSolanaSource.mockImplementation(() => {
      throw new Error("Solana source message bundle mismatch");
    });
    const worker = await createWorkerHarness();

    await expect(
      worker.post({
        id: "solana-source-3",
        kind: "prove-solana-source-package",
        input: solanaSourceInput,
      }),
    ).resolves.toEqual({
      id: "solana-source-3",
      ok: false,
      error: "Solana source message bundle mismatch",
    });
    expect(mocks.bindSolanaSource).toHaveBeenCalled();
  });
});

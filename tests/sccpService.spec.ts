import { beforeEach, describe, expect, it } from "vitest";
import {
  broadcastTronTransaction,
  cancelZkIvmProveJob,
  deriveZkIvmPayload,
  getTronAccount,
  getZkIvmProveJob,
  getSccpCapabilities,
  getSccpMessageProofBundle,
  getSccpMessageProofArtifact,
  getSccpMessageProofJob,
  getSccpProofManifests,
  getTronFinalityData,
  getTronSolidBlock,
  getTronTransaction,
  getTronTransactionEvents,
  getTronTransactionReceipt,
  getTronWitnesses,
  listSccpRecentMessages,
  startZkIvmProveJob,
  submitSccpBridgeProof,
  submitZkIvmProvedTransaction,
  submitSccpBridgeMessage,
  triggerTronConstantContract,
  triggerTronSmartContract,
} from "@/services/iroha";

const bridgeCalls: Array<[string, unknown]> = [];

describe("SCCP service wrappers", () => {
  beforeEach(() => {
    bridgeCalls.length = 0;
    window.iroha = {
      getSccpCapabilities: (input: unknown) => {
        bridgeCalls.push(["getSccpCapabilities", input]);
        return Promise.resolve({ localDomain: 0 });
      },
      getSccpProofManifests: (input: unknown) => {
        bridgeCalls.push(["getSccpProofManifests", input]);
        return Promise.resolve({ manifests: [] });
      },
      listSccpRecentMessages: (input: unknown) => {
        bridgeCalls.push(["listSccpRecentMessages", input]);
        return Promise.resolve({ items: [], total: 0 });
      },
      getSccpMessageProofBundle: (input: unknown) => {
        bridgeCalls.push(["getSccpMessageProofBundle", input]);
        return Promise.resolve({ commitment: {} });
      },
      getSccpMessageProofArtifact: (input: unknown) => {
        bridgeCalls.push(["getSccpMessageProofArtifact", input]);
        return Promise.resolve({ bundle: {} });
      },
      getSccpMessageProofJob: (input: unknown) => {
        bridgeCalls.push(["getSccpMessageProofJob", input]);
        return Promise.resolve({ publicInputs: {} });
      },
      submitSccpBridgeProof: (input: unknown) => {
        bridgeCalls.push(["submitSccpBridgeProof", input]);
        return Promise.resolve({ ok: true });
      },
      getTronTransaction: (input: unknown) => {
        bridgeCalls.push(["getTronTransaction", input]);
        return Promise.resolve({ txID: "11" });
      },
      getTronAccount: (input: unknown) => {
        bridgeCalls.push(["getTronAccount", input]);
        return Promise.resolve({ balance: 1000 });
      },
      getTronTransactionReceipt: (input: unknown) => {
        bridgeCalls.push(["getTronTransactionReceipt", input]);
        return Promise.resolve({ id: "11" });
      },
      getTronTransactionEvents: (input: unknown) => {
        bridgeCalls.push(["getTronTransactionEvents", input]);
        return Promise.resolve({ data: [] });
      },
      getTronSolidBlock: (input: unknown) => {
        bridgeCalls.push(["getTronSolidBlock", input]);
        return Promise.resolve({ blockID: "11" });
      },
      getTronWitnesses: (input: unknown) => {
        bridgeCalls.push(["getTronWitnesses", input]);
        return Promise.resolve({ witnesses: [] });
      },
      getTronFinalityData: (input: unknown) => {
        bridgeCalls.push(["getTronFinalityData", input]);
        return Promise.resolve({ solidBlock: {}, witnesses: {} });
      },
      broadcastTronTransaction: (input: unknown) => {
        bridgeCalls.push(["broadcastTronTransaction", input]);
        return Promise.resolve({ result: true });
      },
      submitSccpBridgeMessage: (input: unknown) => {
        bridgeCalls.push(["submitSccpBridgeMessage", input]);
        return Promise.resolve({ ok: true });
      },
      deriveZkIvmPayload: (input: unknown) => {
        bridgeCalls.push(["deriveZkIvmPayload", input]);
        return Promise.resolve({ proved: { overlay: [] } });
      },
      startZkIvmProveJob: (input: unknown) => {
        bridgeCalls.push(["startZkIvmProveJob", input]);
        return Promise.resolve({ job_id: "11".repeat(16) });
      },
      getZkIvmProveJob: (input: unknown) => {
        bridgeCalls.push(["getZkIvmProveJob", input]);
        return Promise.resolve({ status: "done" });
      },
      cancelZkIvmProveJob: (input: unknown) => {
        bridgeCalls.push(["cancelZkIvmProveJob", input]);
        return Promise.resolve({ job_id: "11".repeat(16) });
      },
      submitZkIvmProvedTransaction: (input: unknown) => {
        bridgeCalls.push(["submitZkIvmProvedTransaction", input]);
        return Promise.resolve({ tx_hash_hex: "33".repeat(32) });
      },
      triggerTronSmartContract: (input: unknown) => {
        bridgeCalls.push(["triggerTronSmartContract", input]);
        return Promise.resolve({ transaction: { txID: "22" } });
      },
      triggerTronConstantContract: (input: unknown) => {
        bridgeCalls.push(["triggerTronConstantContract", input]);
        return Promise.resolve({ constant_result: ["0".repeat(64)] });
      },
    } as unknown as typeof window.iroha;
  });

  it("passes SCCP read calls through the preload bridge", async () => {
    await getSccpCapabilities({ toriiUrl: "https://taira.sora.org" });
    await getSccpProofManifests({ toriiUrl: "https://taira.sora.org" });
    await listSccpRecentMessages({
      toriiUrl: "https://taira.sora.org",
      routeId: "taira_tron_xor",
      limit: 8,
    });

    expect(bridgeCalls).toEqual([
      ["getSccpCapabilities", { toriiUrl: "https://taira.sora.org" }],
      ["getSccpProofManifests", { toriiUrl: "https://taira.sora.org" }],
      [
        "listSccpRecentMessages",
        {
          toriiUrl: "https://taira.sora.org",
          routeId: "taira_tron_xor",
          limit: 8,
        },
      ],
    ]);
  });

  it("passes SCCP proof artifact and submission calls through preload", async () => {
    const proofArtifactInput = {
      toriiUrl: "https://taira.sora.org",
      messageId: "0x" + "11".repeat(32),
      networkIdHex: "0x" + "22".repeat(32),
      tronVerifierAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
    };
    const proofBundleInput = {
      toriiUrl: "https://taira.sora.org",
      messageId: "0x" + "11".repeat(32),
    };
    const proofSubmitInput = {
      toriiUrl: "https://taira.sora.org",
      networkIdHex: "0x" + "22".repeat(32),
      tronVerifierAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      accountId: "testu1234567890abcdef",
      messageBundle: { commitment: { message_id: "11".repeat(32) } },
    };
    await getSccpMessageProofBundle(proofBundleInput);
    await getSccpMessageProofArtifact(proofArtifactInput);
    await getSccpMessageProofJob(proofArtifactInput);
    await submitSccpBridgeProof({
      ...proofSubmitInput,
    });

    expect(bridgeCalls).toEqual([
      ["getSccpMessageProofBundle", proofBundleInput],
      ["getSccpMessageProofArtifact", proofArtifactInput],
      ["getSccpMessageProofJob", proofArtifactInput],
      ["submitSccpBridgeProof", proofSubmitInput],
    ]);
  });

  it("passes TRON reads and TAIRA message submissions through preload", async () => {
    await getTronTransaction({ txId: "11".repeat(32) });
    await getTronAccount({ address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8" });
    await getTronTransactionReceipt({ txId: "11".repeat(32) });
    await getTronTransactionEvents({ txId: "11".repeat(32) });
    await getTronSolidBlock({ blockNumber: 123 });
    await getTronWitnesses();
    await getTronFinalityData();
    await broadcastTronTransaction({
      transaction: { txID: "11".repeat(32), signature: ["12".repeat(65)] },
    });
    await submitSccpBridgeMessage({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu1234567890abcdef",
      messageBundle: { commitment: { message_id: "11".repeat(32) } },
      settlement: { finalize_inbound: true },
    });

    expect(bridgeCalls).toEqual([
      ["getTronTransaction", { txId: "11".repeat(32) }],
      ["getTronAccount", { address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8" }],
      ["getTronTransactionReceipt", { txId: "11".repeat(32) }],
      ["getTronTransactionEvents", { txId: "11".repeat(32) }],
      ["getTronSolidBlock", { blockNumber: 123 }],
      ["getTronWitnesses", undefined],
      ["getTronFinalityData", undefined],
      [
        "broadcastTronTransaction",
        {
          transaction: {
            txID: "11".repeat(32),
            signature: ["12".repeat(65)],
          },
        },
      ],
      [
        "submitSccpBridgeMessage",
        {
          toriiUrl: "https://taira.sora.org",
          accountId: "testu1234567890abcdef",
          messageBundle: { commitment: { message_id: "11".repeat(32) } },
          settlement: { finalize_inbound: true },
        },
      ],
    ]);
  });

  it("passes ZK IVM derive/prove helpers through preload", async () => {
    const proveRequest = {
      toriiUrl: "https://taira.sora.org",
      vkRef: { backend: "stark/fri", name: "ivm-exec-v1" },
      authority: "testu1234567890abcdef",
      metadata: { gas_limit: 2000000 },
      bytecode: "AQIDBA==",
      proved: { overlay: [] },
    };

    await deriveZkIvmPayload(proveRequest);
    await startZkIvmProveJob(proveRequest);
    await getZkIvmProveJob({
      toriiUrl: "https://taira.sora.org",
      jobId: "11".repeat(16),
    });
    await cancelZkIvmProveJob({
      toriiUrl: "https://taira.sora.org",
      jobId: "11".repeat(16),
    });

    expect(bridgeCalls).toEqual([
      ["deriveZkIvmPayload", proveRequest],
      ["startZkIvmProveJob", proveRequest],
      [
        "getZkIvmProveJob",
        { toriiUrl: "https://taira.sora.org", jobId: "11".repeat(16) },
      ],
      [
        "cancelZkIvmProveJob",
        { toriiUrl: "https://taira.sora.org", jobId: "11".repeat(16) },
      ],
    ]);
  });

  it("passes ZK IVM proved transaction submissions through preload", async () => {
    const payload = {
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      accountId: "testu1234567890abcdef",
      proved: { bytecode: "TnJ0MA==", overlay: [] },
      attachment: {
        backend: "halo2/ipa",
        proof: { backend: "halo2/ipa", bytes: [1, 2, 3] },
        vk_ref: { backend: "halo2/ipa", name: "ivm-exec-v1" },
      },
      metadata: { gas_limit: 1000 },
    };

    await submitZkIvmProvedTransaction(payload);

    expect(bridgeCalls).toEqual([["submitZkIvmProvedTransaction", payload]]);
  });

  it("passes TRON smart-contract trigger requests through preload", async () => {
    await triggerTronSmartContract({
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "burnToTaira(bytes32,bytes32,bytes,uint256)",
      callData: `0x${"12".repeat(4)}${"34".repeat(64)}`,
      feeLimit: 100_000_000,
    });
    await triggerTronConstantContract({
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "balanceOf(address)",
      parameter: "00".repeat(32),
    });

    expect(bridgeCalls).toEqual([
      [
        "triggerTronSmartContract",
        {
          ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          functionSelector: "burnToTaira(bytes32,bytes32,bytes,uint256)",
          callData: `0x${"12".repeat(4)}${"34".repeat(64)}`,
          feeLimit: 100_000_000,
        },
      ],
      [
        "triggerTronConstantContract",
        {
          ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          functionSelector: "balanceOf(address)",
          parameter: "00".repeat(32),
        },
      ],
    ]);
  });
});

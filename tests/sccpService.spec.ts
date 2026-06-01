import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelZkIvmProveJob,
  deriveZkIvmPayload,
  getZkIvmProveJob,
  getSccpCapabilities,
  getSccpProofManifests,
  getTronTransaction,
  getTronTransactionEvents,
  getTronTransactionReceipt,
  startZkIvmProveJob,
  submitZkIvmProvedTransaction,
  submitSccpBridgeMessage,
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
      getTronTransaction: (input: unknown) => {
        bridgeCalls.push(["getTronTransaction", input]);
        return Promise.resolve({ txID: "11" });
      },
      getTronTransactionReceipt: (input: unknown) => {
        bridgeCalls.push(["getTronTransactionReceipt", input]);
        return Promise.resolve({ id: "11" });
      },
      getTronTransactionEvents: (input: unknown) => {
        bridgeCalls.push(["getTronTransactionEvents", input]);
        return Promise.resolve({ data: [] });
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
    } as unknown as typeof window.iroha;
  });

  it("passes SCCP read calls through the preload bridge", async () => {
    await getSccpCapabilities({ toriiUrl: "https://taira.sora.org" });
    await getSccpProofManifests({ toriiUrl: "https://taira.sora.org" });

    expect(bridgeCalls).toEqual([
      ["getSccpCapabilities", { toriiUrl: "https://taira.sora.org" }],
      ["getSccpProofManifests", { toriiUrl: "https://taira.sora.org" }],
    ]);
  });

  it("passes TRON reads and TAIRA message submissions through preload", async () => {
    await getTronTransaction({ txId: "11".repeat(32) });
    await getTronTransactionReceipt({ txId: "11".repeat(32) });
    await getTronTransactionEvents({ txId: "11".repeat(32) });
    await submitSccpBridgeMessage({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu1234567890abcdef",
      messageBundle: { commitment: { message_id: "11".repeat(32) } },
      settlement: { finalize_inbound: true },
    });

    expect(bridgeCalls).toEqual([
      ["getTronTransaction", { txId: "11".repeat(32) }],
      ["getTronTransactionReceipt", { txId: "11".repeat(32) }],
      ["getTronTransactionEvents", { txId: "11".repeat(32) }],
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
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SccpView from "@/views/SccpView.vue";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_ID, TAIRA_NETWORK_PREFIX } from "@/constants/chains";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const MESSAGE_ID = `0x${"11".repeat(32)}`;
const PAYLOAD_HASH = `0x${"22".repeat(32)}`;
const COMMITMENT_ROOT = `0x${"33".repeat(32)}`;
const FINALITY_BLOCK_HASH = `0x${"44".repeat(32)}`;
const BINDING_HASH = `0x${"55".repeat(32)}`;
const VERIFIER_CODE_HASH = `0x${"66".repeat(32)}`;
const VERIFIER_KEY_HASH = `0x${"77".repeat(32)}`;
const NETWORK_ID = `0x${"88".repeat(32)}`;
const BINDING_KEY = `tron:0:5:${NETWORK_ID.slice(
  2,
)}:${VALID_TRON_ADDRESS}:${VERIFIER_CODE_HASH}:${VERIFIER_KEY_HASH}`;

const getSccpCapabilitiesMock = vi.fn();
const getSccpProofManifestsMock = vi.fn();
const listSccpRecentMessagesMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const getSccpMessageProofJobMock = vi.fn();
const getTronFinalityDataMock = vi.fn();
const getTronTransactionMock = vi.fn();
const getTronTransactionReceiptMock = vi.fn();
const getTronTransactionEventsMock = vi.fn();
const deriveZkIvmPayloadMock = vi.fn();
const startZkIvmProveJobMock = vi.fn();
const getZkIvmProveJobMock = vi.fn();
const submitZkIvmProvedTransactionMock = vi.fn();
const submitSccpBridgeMessageMock = vi.fn();
const triggerTronSmartContractMock = vi.fn();
const broadcastTronTransactionMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getSccpCapabilities: (input: unknown) => getSccpCapabilitiesMock(input),
  getSccpProofManifests: (input: unknown) => getSccpProofManifestsMock(input),
  listSccpRecentMessages: (input: unknown) => listSccpRecentMessagesMock(input),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  getSccpMessageProofJob: (input: unknown) => getSccpMessageProofJobMock(input),
  getTronFinalityData: (input: unknown) => getTronFinalityDataMock(input),
  getTronTransaction: (input: unknown) => getTronTransactionMock(input),
  getTronTransactionReceipt: (input: unknown) =>
    getTronTransactionReceiptMock(input),
  getTronTransactionEvents: (input: unknown) =>
    getTronTransactionEventsMock(input),
  deriveZkIvmPayload: (input: unknown) => deriveZkIvmPayloadMock(input),
  startZkIvmProveJob: (input: unknown) => startZkIvmProveJobMock(input),
  getZkIvmProveJob: (input: unknown) => getZkIvmProveJobMock(input),
  submitZkIvmProvedTransaction: (input: unknown) =>
    submitZkIvmProvedTransactionMock(input),
  submitSccpBridgeMessage: (input: unknown) =>
    submitSccpBridgeMessageMock(input),
  triggerTronSmartContract: (input: unknown) =>
    triggerTronSmartContractMock(input),
  broadcastTronTransaction: (input: unknown) =>
    broadcastTronTransactionMock(input),
}));

const mountView = (connection: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  session.$patch({
    connection: {
      ...connection,
      assetDefinitionId: "xor#universal",
    },
    accounts: [
      {
        displayName: "Alice",
        domain: "default",
        accountId: "testu1234567890abcdef",
        i105AccountId: "testu1234567890abcdef",
        i105DefaultAccountId: "sorau1234567890abcdef",
        publicKeyHex: "12".repeat(32),
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: "testu1234567890abcdef",
  });

  return mount(SccpView, {
    global: {
      plugins: [pinia],
    },
  });
};

const sampleMessageProofJob = (): Record<string, unknown> => ({
  publicInputs: {
    version: 1,
    messageId: MESSAGE_ID,
    payloadHash: PAYLOAD_HASH,
    targetDomain: 5,
    commitmentRoot: COMMITMENT_ROOT,
    finalityHeight: 10,
    finalityBlockHash: FINALITY_BLOCK_HASH,
  },
  destinationBinding: {
    version: 1,
    key: BINDING_KEY,
    bindingHash: BINDING_HASH,
  },
  payloadProjection: {
    kind: "Transfer",
    value: {
      source_domain: 0,
      dest_domain: 5,
      asset_home_domain: 0,
      asset_id: { kind: "TextUtf8", value: "xor" },
      route_id: { kind: "TextUtf8", value: "taira_tron_xor" },
      amount: "100000000000000",
      sender: { kind: "TextUtf8", value: "testu1234567890abcdef" },
      recipient: {
        kind: "TronBase58Check",
        payload: "0x415cbdd86a2fa8dc4bddd8a8f69dba48572eec07fb",
      },
    },
  },
  bundle: {
    version: 1,
    commitmentRoot: COMMITMENT_ROOT,
    commitment: {
      version: 1,
      kind: "Transfer",
      targetDomain: 5,
      messageId: MESSAGE_ID,
      payloadHash: PAYLOAD_HASH,
    },
    merkleProof: { steps: [] },
    payload: {
      kind: "Transfer",
      value: {
        version: 1,
        source_domain: 0,
        dest_domain: 5,
        nonce: "7",
        asset_home_domain: 0,
        asset_id_codec: 1,
        asset_id: "xor",
        amount: "100000000000000",
        sender_codec: 1,
        sender: "testu1234567890abcdef",
        recipient_codec: 5,
        recipient: VALID_TRON_ADDRESS,
        route_id_codec: 1,
        route_id: "taira_tron_xor",
      },
    },
    finalityProof: "0x010203",
  },
});

const storeConnectedTronWallet = () => {
  localStorage.setItem(
    "iroha-demo:sccp:tron-walletconnect",
    JSON.stringify({
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      chainId: "tron:0x2b6653dc",
      namespace: "tron",
      methodVersion: "v1",
      connectedAtMs: Date.now(),
    }),
  );
};

describe("SccpView", () => {
  beforeEach(() => {
    localStorage.clear();
    getSccpCapabilitiesMock.mockReset();
    getSccpProofManifestsMock.mockReset();
    listSccpRecentMessagesMock.mockReset();
    fetchAccountAssetsMock.mockReset();
    getSccpMessageProofJobMock.mockReset();
    getTronFinalityDataMock.mockReset();
    getTronTransactionMock.mockReset();
    getTronTransactionReceiptMock.mockReset();
    getTronTransactionEventsMock.mockReset();
    deriveZkIvmPayloadMock.mockReset();
    startZkIvmProveJobMock.mockReset();
    getZkIvmProveJobMock.mockReset();
    submitZkIvmProvedTransactionMock.mockReset();
    submitSccpBridgeMessageMock.mockReset();
    triggerTronSmartContractMock.mockReset();
    broadcastTronTransactionMock.mockReset();
    getSccpCapabilitiesMock.mockResolvedValue({
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    });
    getSccpProofManifestsMock.mockResolvedValue({
      manifests: [
        {
          counterpartyDomain: 5,
          verifierTarget: "TronContract",
          productionReady: true,
          routeId: "taira_tron_xor",
          assetKey: "xor",
          tronBridgeAddress: VALID_TRON_ADDRESS,
          tronTokenAddress: VALID_TRON_ADDRESS,
          destinationBinding: {
            version: 1,
            key: BINDING_KEY,
            bindingHash: BINDING_HASH,
          },
          destinationRollout: {
            verifierIdentity: VALID_TRON_ADDRESS,
            verifierCodeHash: VERIFIER_CODE_HASH,
            verifierKeyHash: VERIFIER_KEY_HASH,
            destinationNetworkId: NETWORK_ID,
            destinationBindingKey: BINDING_KEY,
            destinationBindingHash: BINDING_HASH,
          },
          tairaXorBurnRecord: {
            settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            contractArtifactB64: "TnJ0MA==",
            vkRef: {
              backend: "halo2/ipa",
              name: "taira-xor-burn-record-v1",
            },
          },
        },
      ],
    });
    listSccpRecentMessagesMock.mockResolvedValue({
      items: [{ message_id: "11".repeat(32), kind: "Transfer" }],
      total: 1,
      raw: {},
    });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "xor#universal",
          quantity: "100",
          asset_definition_id: "xor#universal",
        },
      ],
      total: 1,
    });
    getTronFinalityDataMock.mockResolvedValue({
      solidBlock: { blockID: FINALITY_BLOCK_HASH },
    });
    getTronTransactionMock.mockResolvedValue({ txID: "aa".repeat(32) });
    getTronTransactionReceiptMock.mockResolvedValue({ id: "aa".repeat(32) });
    getTronTransactionEventsMock.mockResolvedValue({ data: [] });
    submitSccpBridgeMessageMock.mockResolvedValue({
      tx_hash_hex: "99".repeat(32),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the Minamoto disabled state without probing SCCP endpoints", async () => {
    const wrapper = mountView({
      toriiUrl: "https://minamoto.sora.org",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 753,
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "SCCP bridging is enabled only on TAIRA testnet.",
    );
    expect(getSccpCapabilitiesMock).not.toHaveBeenCalled();
  });

  it("keeps proof fetch disabled outside TAIRA even with locally stored TRON metadata", async () => {
    storeConnectedTronWallet();
    const wrapper = mountView({
      toriiUrl: "https://minamoto.sora.org",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 753,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    await inputs[2].setValue(MESSAGE_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    expect(fetchButton!.attributes("disabled")).toBeDefined();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(getSccpMessageProofJobMock).not.toHaveBeenCalled();
    expect(getTronTransactionMock).not.toHaveBeenCalled();
  });

  it("loads route and balance data on TAIRA", async () => {
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("TAIRA enabled");
    expect(wrapper.text()).toContain("WalletConnect not configured");
    expect(wrapper.text()).toContain("100");
    expect(getSccpCapabilitiesMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
    });
    expect(listSccpRecentMessagesMock).toHaveBeenCalled();
  });

  it("surfaces balance refresh failures as page status", async () => {
    fetchAccountAssetsMock.mockRejectedValueOnce(new Error("preload missing"));

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("preload missing");
    expect(wrapper.text()).toContain("Not loaded");
  });

  it("fetches TAIRA message proof jobs with TRON proof material before finalizing", async () => {
    storeConnectedTronWallet();
    getSccpMessageProofJobMock.mockResolvedValue(sampleMessageProofJob());
    vi.stubGlobal(
      "Worker",
      vi.fn().mockImplementation(function WorkerMock(this: {
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
        onerror: null;
        terminate: () => void;
        postMessage: (message: { id: string }) => void;
      }) {
        this.onmessage = null;
        this.onerror = null;
        this.terminate = vi.fn();
        this.postMessage = (message: { id: string }) => {
          this.onmessage?.({
            data: {
              id: message.id,
              ok: false,
              error: "TRON SCCP Groth16 prover is not linked",
            },
          });
        };
      }),
    );

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    await inputs[2].setValue(MESSAGE_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(getSccpMessageProofJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://taira.sora.org",
        messageId: MESSAGE_ID,
        networkIdHex: NETWORK_ID,
        verifierCodeHashHex: VERIFIER_CODE_HASH,
        verifierKeyHashHex: VERIFIER_KEY_HASH,
        expectedDestinationBindingHashHex: BINDING_HASH,
        tronVerifierAddress: VALID_TRON_ADDRESS,
      }),
    );
    expect(wrapper.text()).toContain("TRON SCCP Groth16 prover is not linked");
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();
    expect(broadcastTronTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed source ids before fetching proof data", async () => {
    storeConnectedTronWallet();
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    await inputs[2].setValue("not-a-message-id");
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("messageId must be a 32-byte hex value");
    expect(getSccpMessageProofJobMock).not.toHaveBeenCalled();

    const directionTab = wrapper
      .findAll("button")
      .find((button) => button.text().includes("TRON -> TAIRA"));
    expect(directionTab).toBeTruthy();
    await directionTab!.trigger("click");
    await flushPromises();

    const tronInputs = wrapper.findAll("input");
    await tronInputs[0].setValue("0.0001");
    await tronInputs[1].setValue("testu1234567890abcdef");
    await tronInputs[3].setValue("0x1234");
    const tronFetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(tronFetchButton).toBeTruthy();
    await tronFetchButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "txId must be a 32-byte TRON transaction id",
    );
    expect(getTronTransactionMock).not.toHaveBeenCalled();
  });

  it("collects TRON source data before failing closed without a source prover", async () => {
    storeConnectedTronWallet();
    vi.stubGlobal(
      "Worker",
      vi.fn().mockImplementation(function WorkerMock(this: {
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
        onerror: null;
        terminate: () => void;
        postMessage: (message: { id: string; kind: string }) => void;
      }) {
        this.onmessage = null;
        this.onerror = null;
        this.terminate = vi.fn();
        this.postMessage = (message: { id: string; kind: string }) => {
          expect(message.kind).toBe("prove-tron-source-package");
          this.onmessage?.({
            data: {
              id: message.id,
              ok: false,
              error:
                "TRON -> TAIRA SCCP source prover is not linked; provide a browser-safe source proof module before submitting TAIRA settlement.",
            },
          });
        };
      }),
    );

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const directionTab = wrapper
      .findAll("button")
      .find((button) => button.text().includes("TRON -> TAIRA"));
    expect(directionTab).toBeTruthy();
    await directionTab!.trigger("click");
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue("testu1234567890abcdef");
    await inputs[3].setValue("aa".repeat(32));
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(getTronTransactionMock).toHaveBeenCalledWith({
      txId: "aa".repeat(32),
    });
    expect(getTronTransactionReceiptMock).toHaveBeenCalledWith({
      txId: "aa".repeat(32),
    });
    expect(getTronTransactionEventsMock).toHaveBeenCalledWith({
      txId: "aa".repeat(32),
    });
    expect(getTronFinalityDataMock).toHaveBeenCalled();
    expect(wrapper.text()).toContain("source prover is not linked");
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("submits TAIRA settlement after a bound TRON source proof package", async () => {
    storeConnectedTronWallet();
    const messageBundle = {
      commitment: {
        messageId: MESSAGE_ID,
        targetDomain: 0,
      },
    };
    const settlement = {
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
    };
    vi.stubGlobal(
      "Worker",
      vi.fn().mockImplementation(function WorkerMock(this: {
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
        onerror: null;
        terminate: () => void;
        postMessage: (message: { id: string; kind: string }) => void;
      }) {
        this.onmessage = null;
        this.onerror = null;
        this.terminate = vi.fn();
        this.postMessage = (message: { id: string; kind: string }) => {
          expect(message.kind).toBe("prove-tron-source-package");
          this.onmessage?.({
            data: {
              id: message.id,
              ok: true,
              result: {
                messageBundle,
                settlement,
                sourceEventDigest: FINALITY_BLOCK_HASH,
                txId: "aa".repeat(32),
                messageId: MESSAGE_ID,
                amountBaseUnits: "100000000000000",
              },
            },
          });
        };
      }),
    );

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const directionTab = wrapper
      .findAll("button")
      .find((button) => button.text().includes("TRON -> TAIRA"));
    expect(directionTab).toBeTruthy();
    await directionTab!.trigger("click");
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue("testu1234567890abcdef");
    await inputs[3].setValue("aa".repeat(32));
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(submitSccpBridgeMessageMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu1234567890abcdef",
      messageBundle,
      settlement,
    });
    expect(wrapper.text()).toContain("TAIRA settlement submitted");
    expect(wrapper.text()).toContain("TAIRA settlement transaction");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { AccountAddress } from "@iroha/iroha-js";
import SccpView from "@/views/SccpView.vue";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_ID, TAIRA_NETWORK_PREFIX } from "@/constants/chains";
import { TRON_MAINNET_NETWORK_ID_HEX } from "@/utils/sccp";
import {
  canonicalSccpTransferPayloadBytes,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  sccpPayloadHash,
  sccpTransferMessageId,
  tairaXorBurnSourceEventDigest,
  tronSccpDestinationBinding,
} from "@iroha/iroha-js/sccp";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const TAIRA_ACCOUNT_PUBLIC_KEY_HEX = "12".repeat(32);
const TAIRA_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(TAIRA_NETWORK_PREFIX);
const SORA_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(753);
const MESSAGE_ID = `0x${"11".repeat(32)}`;
const PAYLOAD_HASH = `0x${"22".repeat(32)}`;
const COMMITMENT_ROOT = `0x${"33".repeat(32)}`;
const FINALITY_BLOCK_HASH = `0x${"44".repeat(32)}`;
const VERIFIER_CODE_HASH = `0x${"66".repeat(32)}`;
const VERIFIER_KEY_HASH = `0x${"77".repeat(32)}`;
const TRON_TX_ID = "aa".repeat(32);
const BRIDGE_AMOUNT_BASE_UNITS = "100000000000000";
const TRON_TO_TAIRA_NONCE = "9";
const TRON_SOURCE_EVENT_DIGEST = tairaXorBurnSourceEventDigest({
  bridgeAddress: VALID_TRON_ADDRESS,
  burnerAddress: VALID_TRON_ADDRESS,
  tairaRecipient: TAIRA_ACCOUNT_ID,
  amount: BRIDGE_AMOUNT_BASE_UNITS,
  nonce: TRON_TO_TAIRA_NONCE,
});
const NETWORK_ID = TRON_MAINNET_NETWORK_ID_HEX;
const BINDING_KEY = `tron:0:5:${NETWORK_ID.slice(
  2,
)}:${VALID_TRON_ADDRESS}:${VERIFIER_CODE_HASH}:${VERIFIER_KEY_HASH}`;
const BINDING_HASH = tronSccpDestinationBinding({
  version: 1,
  key: BINDING_KEY,
  sourceDomain: 0,
  targetDomain: 5,
  networkId: NETWORK_ID,
  verifierAddress: VALID_TRON_ADDRESS,
  verifierCodeHash: VERIFIER_CODE_HASH,
  verifierKeyHash: VERIFIER_KEY_HASH,
}).bindingHash;

const getSccpCapabilitiesMock = vi.fn();
const getSccpProofManifestsMock = vi.fn();
const listSccpRecentMessagesMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const getSccpMessageProofJobMock = vi.fn();
const getTronAccountMock = vi.fn();
const getTronFinalityDataMock = vi.fn();
const getTronTransactionMock = vi.fn();
const getTronTransactionReceiptMock = vi.fn();
const getTronTransactionEventsMock = vi.fn();
const deriveZkIvmPayloadMock = vi.fn();
const startZkIvmProveJobMock = vi.fn();
const getZkIvmProveJobMock = vi.fn();
const submitZkIvmProvedTransactionMock = vi.fn();
const submitSccpBridgeMessageMock = vi.fn();
const triggerTronConstantContractMock = vi.fn();
const triggerTronSmartContractMock = vi.fn();
const broadcastTronTransactionMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getSccpCapabilities: (input: unknown) => getSccpCapabilitiesMock(input),
  getSccpProofManifests: (input: unknown) => getSccpProofManifestsMock(input),
  listSccpRecentMessages: (input: unknown) => listSccpRecentMessagesMock(input),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  getSccpMessageProofJob: (input: unknown) => getSccpMessageProofJobMock(input),
  getTronAccount: (input: unknown) => getTronAccountMock(input),
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
  triggerTronConstantContract: (input: unknown) =>
    triggerTronConstantContractMock(input),
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
        accountId: TAIRA_ACCOUNT_ID,
        i105AccountId: TAIRA_ACCOUNT_ID,
        i105DefaultAccountId: SORA_ACCOUNT_ID,
        publicKeyHex: TAIRA_ACCOUNT_PUBLIC_KEY_HEX,
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: TAIRA_ACCOUNT_ID,
  });

  return mount(SccpView, {
    global: {
      plugins: [pinia],
    },
  });
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
      sender: { kind: "TextUtf8", value: TAIRA_ACCOUNT_ID },
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
        sender: TAIRA_ACCOUNT_ID,
        recipient_codec: 5,
        recipient: VALID_TRON_ADDRESS,
        route_id_codec: 1,
        route_id: "taira_tron_xor",
      },
    },
    finalityProof: "0x010203",
  },
});

const sampleTronFinalityData = (): Record<string, unknown> => ({
  solidBlock: {
    blockID: FINALITY_BLOCK_HASH,
    block_header: {
      raw_data: {
        number: 12,
      },
    },
  },
  witnesses: {
    witnesses: [{ address: VALID_TRON_ADDRESS }],
  },
});

const sampleTronTransaction = (): Record<string, unknown> => ({
  txID: TRON_TX_ID,
  raw_data_hex: "12",
  signature: ["12".repeat(65)],
});

const sampleTronReceipt = (): Record<string, unknown> => ({
  id: TRON_TX_ID,
  blockNumber: 10,
  receipt: {
    result: "SUCCESS",
  },
});

const sampleTronEvents = (
  mutate?: (events: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const events = {
    data: [
      {
        transaction_id: TRON_TX_ID,
        event_name: "BurnToTaira",
        contract_address: VALID_TRON_ADDRESS,
        result: {
          sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
          burner: VALID_TRON_ADDRESS,
          amount: BRIDGE_AMOUNT_BASE_UNITS,
          tairaRecipient: `0x${Array.from(
            new TextEncoder().encode(TAIRA_ACCOUNT_ID),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("")}`,
        },
      },
    ],
  };
  mutate?.(events);
  return events;
};

const sampleTronToTairaSourceProofPackage = (
  mutate?: (proofPackage: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transferPayload = {
    version: 1,
    source_domain: 5,
    dest_domain: 0,
    nonce: TRON_TO_TAIRA_NONCE,
    asset_home_domain: 0,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: "xor",
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender_codec: SCCP_CODEC_TRON_BASE58CHECK,
    sender: VALID_TRON_ADDRESS,
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient: TAIRA_ACCOUNT_ID,
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: "taira_tron_xor",
  };
  const payloadHash = sccpPayloadHash(
    canonicalSccpTransferPayloadBytes(transferPayload),
  );
  const messageId = sccpTransferMessageId(transferPayload);
  const proofPackage = {
    messageBundle: {
      version: 1,
      commitmentRoot: FINALITY_BLOCK_HASH,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: 0,
        messageId,
        payloadHash,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: transferPayload,
      },
      finalityProof: "0x010203",
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
    },
    sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    txId: TRON_TX_ID,
    messageId,
    amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
  };
  mutate?.(proofPackage);
  return proofPackage;
};

const storeConnectedTronWallet = (
  options: { projectConfigured?: boolean } = {},
) => {
  if (options.projectConfigured !== false) {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-walletconnect-project");
  }
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

const sampleReadyManifestSet = () => ({
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

describe("SccpView", () => {
  beforeEach(() => {
    localStorage.clear();
    getSccpCapabilitiesMock.mockReset();
    getSccpProofManifestsMock.mockReset();
    listSccpRecentMessagesMock.mockReset();
    fetchAccountAssetsMock.mockReset();
    getSccpMessageProofJobMock.mockReset();
    getTronAccountMock.mockReset();
    getTronFinalityDataMock.mockReset();
    getTronTransactionMock.mockReset();
    getTronTransactionReceiptMock.mockReset();
    getTronTransactionEventsMock.mockReset();
    deriveZkIvmPayloadMock.mockReset();
    startZkIvmProveJobMock.mockReset();
    getZkIvmProveJobMock.mockReset();
    submitZkIvmProvedTransactionMock.mockReset();
    submitSccpBridgeMessageMock.mockReset();
    triggerTronConstantContractMock.mockReset();
    triggerTronSmartContractMock.mockReset();
    broadcastTronTransactionMock.mockReset();
    getSccpCapabilitiesMock.mockResolvedValue({
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    });
    getSccpProofManifestsMock.mockResolvedValue(sampleReadyManifestSet());
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
    getTronFinalityDataMock.mockResolvedValue(sampleTronFinalityData());
    getTronAccountMock.mockResolvedValue({ balance: 1234567 });
    triggerTronConstantContractMock.mockResolvedValue({
      result: { result: true },
      constant_result: ["0".repeat(63) + "7"],
    });
    getTronTransactionMock.mockResolvedValue(sampleTronTransaction());
    getTronTransactionReceiptMock.mockResolvedValue(sampleTronReceipt());
    getTronTransactionEventsMock.mockResolvedValue(sampleTronEvents());
    submitSccpBridgeMessageMock.mockResolvedValue({
      tx_hash_hex: "99".repeat(32),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    expect(getTronAccountMock).not.toHaveBeenCalled();
  });

  it("loads connected TRON TRX and TairaXOR balances through preload", async () => {
    storeConnectedTronWallet();

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("1.234567 TRX");
    expect(wrapper.text()).toContain("0.000000000000000007 TairaXOR");
    expect(getTronAccountMock).toHaveBeenCalledWith({
      address: VALID_TRON_ADDRESS,
    });
    expect(triggerTronConstantContractMock).toHaveBeenCalledWith({
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: VALID_TRON_ADDRESS,
      functionSelector: "balanceOf(address)",
      parameter:
        "0000000000000000000000005cbdd86a2fa8dc4bddd8a8f69dba48572eec07fb",
    });
  });

  it("keeps bridge actions disabled when WalletConnect config is missing despite stored metadata", async () => {
    storeConnectedTronWallet({ projectConfigured: false });
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

    const prepareButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Prepare TAIRA -> TRON"));
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(prepareButton).toBeTruthy();
    expect(fetchButton).toBeTruthy();
    expect(prepareButton!.attributes("disabled")).toBeDefined();
    expect(fetchButton!.attributes("disabled")).toBeDefined();

    await prepareButton!.trigger("click");
    await fetchButton!.trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "WalletConnect project ID is missing, so TRON wallet connection is disabled.",
    );
    expect(getSccpMessageProofJobMock).not.toHaveBeenCalled();
    expect(deriveZkIvmPayloadMock).not.toHaveBeenCalled();
    expect(startZkIvmProveJobMock).not.toHaveBeenCalled();
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();
    expect(submitZkIvmProvedTransactionMock).not.toHaveBeenCalled();
  });

  it("reloads SCCP route data when only the Torii URL changes", async () => {
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Route ready");
    getSccpCapabilitiesMock.mockClear();
    getSccpProofManifestsMock.mockClear();
    listSccpRecentMessagesMock.mockClear();
    fetchAccountAssetsMock.mockClear();
    getSccpProofManifestsMock.mockResolvedValueOnce({ manifests: [] });
    fetchAccountAssetsMock.mockResolvedValueOnce({ items: [], total: 0 });

    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://other-taira.sora.org",
      },
    });
    await flushPromises();

    expect(getSccpCapabilitiesMock).toHaveBeenCalledWith({
      toriiUrl: "https://other-taira.sora.org",
    });
    expect(getSccpProofManifestsMock).toHaveBeenCalledWith({
      toriiUrl: "https://other-taira.sora.org",
    });
    expect(listSccpRecentMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://other-taira.sora.org",
      }),
    );
    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://other-taira.sora.org",
      }),
    );
    expect(wrapper.text()).toContain("No TRON SCCP manifest");
    expect(wrapper.text()).toContain("Not loaded");
  });

  it("clears stale route readiness while reloading a changed Torii URL", async () => {
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Route ready");
    const capabilities = deferred<Record<string, unknown>>();
    const manifests = deferred<Record<string, unknown>>();
    const balances = deferred<Record<string, unknown>>();
    getSccpCapabilitiesMock.mockReturnValueOnce(capabilities.promise);
    getSccpProofManifestsMock.mockReturnValueOnce(manifests.promise);
    listSccpRecentMessagesMock.mockResolvedValueOnce({ items: [], total: 0 });
    fetchAccountAssetsMock.mockReturnValueOnce(balances.promise);

    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://slow-taira.sora.org",
      },
    });
    await nextTick();
    await flushPromises();

    expect(wrapper.text()).toContain("Checking route");
    expect(wrapper.text()).not.toContain("Route ready");
    expect(wrapper.text()).toContain("Not loaded");

    capabilities.resolve({
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    });
    manifests.resolve({ manifests: [] });
    balances.resolve({ items: [], total: 0 });
    await flushPromises();
  });

  it("ignores late SCCP responses from a previous Torii URL", async () => {
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Route ready");
    getSccpCapabilitiesMock.mockClear();
    getSccpProofManifestsMock.mockClear();
    listSccpRecentMessagesMock.mockClear();
    fetchAccountAssetsMock.mockClear();

    const slowCapabilities = deferred<Record<string, unknown>>();
    const slowManifests = deferred<Record<string, unknown>>();
    const slowBalances = deferred<Record<string, unknown>>();
    getSccpCapabilitiesMock
      .mockReturnValueOnce(slowCapabilities.promise)
      .mockResolvedValueOnce({
        proofSubmitPath: "/v1/bridge/proofs/submit",
        messageSubmitPath: "/v1/bridge/messages",
      });
    getSccpProofManifestsMock
      .mockReturnValueOnce(slowManifests.promise)
      .mockResolvedValueOnce({ manifests: [] });
    listSccpRecentMessagesMock
      .mockResolvedValueOnce({
        items: [{ message_id: "slow", kind: "Transfer" }],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 });
    fetchAccountAssetsMock
      .mockReturnValueOnce(slowBalances.promise)
      .mockResolvedValueOnce({ items: [], total: 0 });

    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://slow-taira.sora.org",
      },
    });
    await nextTick();

    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://final-taira.sora.org",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("No TRON SCCP manifest");
    expect(wrapper.text()).toContain("Not loaded");

    slowCapabilities.resolve({
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    });
    slowManifests.resolve(sampleReadyManifestSet());
    slowBalances.resolve({
      items: [
        {
          asset_id: "xor#universal",
          quantity: "999",
          asset_definition_id: "xor#universal",
        },
      ],
      total: 1,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("No TRON SCCP manifest");
    expect(wrapper.text()).toContain("Not loaded");
    expect(wrapper.text()).not.toContain("Route ready");
    expect(wrapper.text()).not.toContain("999");
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

  it("times out hanging TRON finalize proof workers before wallet submission", async () => {
    vi.useFakeTimers();
    storeConnectedTronWallet();
    getSccpMessageProofJobMock.mockResolvedValue(sampleMessageProofJob());
    const terminateMock = vi.fn();
    vi.stubGlobal(
      "Worker",
      vi.fn().mockImplementation(function WorkerMock(this: {
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
        onerror: null;
        onmessageerror: null;
        terminate: () => void;
        postMessage: (message: { id: string; kind: string }) => void;
      }) {
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
        this.terminate = terminateMock;
        this.postMessage = (message: { kind: string }) => {
          expect(message.kind).toBe("prove-tron-proof-package");
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
    const clickPromise = fetchButton!.trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120_000);
    await clickPromise;
    await flushPromises();

    expect(wrapper.text()).toContain("SCCP proof worker timed out");
    expect(terminateMock).toHaveBeenCalledOnce();
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
    await tronInputs[1].setValue(TAIRA_ACCOUNT_ID);
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

  it("blocks TRON source proof work until gateway data is event-bound", async () => {
    storeConnectedTronWallet();
    getTronTransactionEventsMock.mockResolvedValueOnce({ data: [] });
    const workerCtor = vi.fn();
    vi.stubGlobal("Worker", workerCtor);

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

    const tronInputs = wrapper.findAll("input");
    await tronInputs[0].setValue("0.0001");
    await tronInputs[1].setValue(TAIRA_ACCOUNT_ID);
    await tronInputs[3].setValue(TRON_TX_ID);
    const tronFetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(tronFetchButton).toBeTruthy();
    await tronFetchButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("at least one event");
    expect(workerCtor).not.toHaveBeenCalled();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
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
    await inputs[1].setValue(TAIRA_ACCOUNT_ID);
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

  it("times out hanging TRON source proof workers before TAIRA settlement", async () => {
    vi.useFakeTimers();
    storeConnectedTronWallet();
    const terminateMock = vi.fn();
    vi.stubGlobal(
      "Worker",
      vi.fn().mockImplementation(function WorkerMock(this: {
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
        onerror: null;
        onmessageerror: null;
        terminate: () => void;
        postMessage: (message: { id: string; kind: string }) => void;
      }) {
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
        this.terminate = terminateMock;
        this.postMessage = (message: { kind: string }) => {
          expect(message.kind).toBe("prove-tron-source-package");
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
    await inputs[1].setValue(TAIRA_ACCOUNT_ID);
    await inputs[3].setValue("aa".repeat(32));
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    const clickPromise = fetchButton!.trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120_000);
    await clickPromise;
    await flushPromises();

    expect(wrapper.text()).toContain("SCCP proof worker timed out");
    expect(terminateMock).toHaveBeenCalledOnce();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("rejects malformed successful source worker responses before settlement", async () => {
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
              ok: true,
              result: "not-a-proof-package",
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
    await inputs[1].setValue(TAIRA_ACCOUNT_ID);
    await inputs[3].setValue(TRON_TX_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("invalid proof package");
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("rebinds source worker packages to the original TRON source event", async () => {
    storeConnectedTronWallet();
    getTronTransactionEventsMock.mockResolvedValue(
      sampleTronEvents((events) => {
        const event = (events.data as Record<string, unknown>[])[0];
        (event.result as Record<string, unknown>).sourceEventDigest =
          `0x${"55".repeat(32)}`;
      }),
    );
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
              result: sampleTronToTairaSourceProofPackage(),
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
    await inputs[1].setValue(TAIRA_ACCOUNT_ID);
    await inputs[3].setValue(TRON_TX_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("source proof package digest");
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("submits TAIRA settlement after a bound TRON source proof package", async () => {
    storeConnectedTronWallet();
    const proofPackage = sampleTronToTairaSourceProofPackage();
    const messageBundle = proofPackage.messageBundle;
    const settlement = proofPackage.settlement;
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
              result: proofPackage,
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
    await inputs[1].setValue(TAIRA_ACCOUNT_ID);
    await inputs[3].setValue("aa".repeat(32));
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(submitSccpBridgeMessageMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: TAIRA_ACCOUNT_ID,
      messageBundle,
      settlement,
    });
    expect(wrapper.text()).toContain("TAIRA settlement submitted");
    expect(wrapper.text()).toContain("TAIRA settlement transaction");
  });
});

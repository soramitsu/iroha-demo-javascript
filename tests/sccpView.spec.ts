import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { AccountAddress } from "@iroha/iroha-js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import SccpView from "@/views/SccpView.vue";
import { useSessionStore } from "@/stores/session";
import {
  TAIRA_CHAIN_ID,
  TAIRA_EXPLORER_URL,
  TAIRA_NETWORK_PREFIX,
} from "@/constants/chains";
import {
  buildSccpMessageBundleSubmitPayload,
  decodeTronBase58CheckAddress,
  tairaXorBurnToTairaCallData,
  TRON_MAINNET_NETWORK_ID_HEX,
  TRON_MAINNET_RPC_URL,
  TRON_MAINNET_TRONSCAN_URL,
} from "@/utils/sccp";
import {
  canonicalSccpPayloadEnvelopeBytes,
  canonicalSccpTransferPayloadBytes,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  sccpPayloadHash,
  sccpTransferMessageId,
  tairaXorBurnSourceEventDigest,
  tairaXorRouteIdHash,
  tairaXorAssetKeyHash,
  tronSccpDestinationBinding,
} from "@iroha/iroha-js/sccp";

const VALID_TRON_ADDRESS = "TGkWdpawVNfeset3P6uTBbLaPY7nZVZvXY";
const TRON_TOKEN_ADDRESS = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const TRON_SOURCE_BRIDGE_ADDRESS = "TEdvoHEatmDKvTh3o9vBRB9Vdtbhn4QFhy";
const TRON_VERIFIER_ADDRESS = "TGCAjMXComunWZEXCT1LPBdcYbDVuyexBv";
const TAIRA_ACCOUNT_PUBLIC_KEY_HEX = "12".repeat(32);
const TAIRA_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(TAIRA_NETWORK_PREFIX);
const SORA_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(753);
const BRIDGE_AMOUNT_BASE_UNITS = "100000000000000";
const TAIRA_TO_TRON_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: 0,
  dest_domain: 5,
  nonce: "7",
  asset_home_domain: 0,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: TAIRA_ACCOUNT_ID,
  recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
  recipient: VALID_TRON_ADDRESS,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: "taira_tron_xor",
};
const MESSAGE_ID = sccpTransferMessageId(TAIRA_TO_TRON_TRANSFER_PAYLOAD);
const PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: TAIRA_TO_TRON_TRANSFER_PAYLOAD,
  }),
);
const COMMITMENT_ROOT = `0x${"33".repeat(32)}`;
const FINALITY_BLOCK_HASH = `0x${"44".repeat(32)}`;
const STATEMENT_HASH = `0x${"55".repeat(32)}`;
const TRON_SOLID_BLOCK_NUMBER = 12;
const VERIFIER_CODE_HASH = `0x${"66".repeat(32)}`;
const VERIFIER_KEY_HASH = `0x${"77".repeat(32)}`;
const TRON_SIGNING_PRIVATE_KEY = new Uint8Array(32).fill(7);
const TRON_TO_TAIRA_NONCE = "9";
const TRON_SOURCE_EVENT_DIGEST = tairaXorBurnSourceEventDigest({
  bridgeAddress: VALID_TRON_ADDRESS,
  burnerAddress: VALID_TRON_ADDRESS,
  tairaRecipient: TAIRA_ACCOUNT_ID,
  amount: BRIDGE_AMOUNT_BASE_UNITS,
  nonce: TRON_TO_TAIRA_NONCE,
});
const TRON_BURN_CALL_DATA = tairaXorBurnToTairaCallData({
  tairaRecipient: TAIRA_ACCOUNT_ID,
  amount: BRIDGE_AMOUNT_BASE_UNITS,
});
const NETWORK_ID = TRON_MAINNET_NETWORK_ID_HEX;
const BINDING_KEY = `tron:0:5:${NETWORK_ID.slice(
  2,
)}:${TRON_VERIFIER_ADDRESS}:${VERIFIER_CODE_HASH}:${VERIFIER_KEY_HASH}`;
const BINDING_HASH = tronSccpDestinationBinding({
  version: 1,
  key: BINDING_KEY,
  sourceDomain: 0,
  targetDomain: 5,
  networkId: NETWORK_ID,
  verifierAddress: TRON_VERIFIER_ADDRESS,
  verifierCodeHash: VERIFIER_CODE_HASH,
  verifierKeyHash: VERIFIER_KEY_HASH,
}).bindingHash;

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const tronBlockIdForHeight = (height: number, suffixByte = "44"): string =>
  `0x${height.toString(16).padStart(16, "0")}${suffixByte.repeat(24)}`;

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(
    hex
      .trim()
      .replace(/^0x/u, "")
      .match(/.{2}/gu)
      ?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const protobufVarint = (value: number | bigint): Uint8Array => {
  let remaining = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining > 0n) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (remaining > 0n);
  return Uint8Array.from(out);
};

const protobufFieldKey = (fieldNumber: number, wireType: number): Uint8Array =>
  protobufVarint((BigInt(fieldNumber) << 3n) | BigInt(wireType));

const protobufBytesField = (
  fieldNumber: number,
  value: Uint8Array,
): Uint8Array =>
  concatBytes(
    protobufFieldKey(fieldNumber, 2),
    protobufVarint(value.length),
    value,
  );

const protobufU64Field = (
  fieldNumber: number,
  value: number | bigint,
): Uint8Array =>
  concatBytes(protobufFieldKey(fieldNumber, 0), protobufVarint(value));

const buildTronTriggerRawDataHex = (input: {
  ownerAddress?: string;
  contractAddress?: string;
  dataHex: string;
}): string => {
  const owner = decodeTronBase58CheckAddress(
    input.ownerAddress ?? VALID_TRON_ADDRESS,
  );
  const contract = decodeTronBase58CheckAddress(
    input.contractAddress ?? VALID_TRON_ADDRESS,
  );
  const trigger = concatBytes(
    protobufBytesField(1, owner),
    protobufBytesField(2, contract),
    protobufBytesField(4, hexToBytes(input.dataHex)),
  );
  const any = concatBytes(
    protobufBytesField(
      1,
      new TextEncoder().encode(
        "type.googleapis.com/protocol.TriggerSmartContract",
      ),
    ),
    protobufBytesField(2, trigger),
  );
  const contractEntry = concatBytes(
    protobufU64Field(1, 31n),
    protobufBytesField(2, any),
  );
  return bytesToHex(
    concatBytes(
      protobufBytesField(1, Uint8Array.from([0x12, 0x34])),
      protobufBytesField(
        4,
        Uint8Array.from({ length: 8 }, () => 0x56),
      ),
      protobufU64Field(8, 123_456_789n),
      protobufBytesField(11, contractEntry),
      protobufU64Field(14, 123_450_000n),
      protobufU64Field(18, 50_000_000n),
    ),
  ).slice(2);
};

const tronTxIdFromRawDataHex = (rawDataHex: string): string =>
  bytesToHex(sha256(hexToBytes(rawDataHex))).slice(2);

const DEFAULT_TRON_RAW_DATA_HEX = buildTronTriggerRawDataHex({
  dataHex: TRON_BURN_CALL_DATA,
});
const TRON_TX_ID = tronTxIdFromRawDataHex(DEFAULT_TRON_RAW_DATA_HEX);

const signTronRawDataHex = (rawDataHex: string): string => {
  const signature = secp256k1.sign(
    sha256(hexToBytes(rawDataHex)),
    TRON_SIGNING_PRIVATE_KEY,
    {
      prehash: false,
      lowS: true,
    },
  );
  const out = new Uint8Array(65);
  out.set(signature.toCompactRawBytes());
  out[64] = signature.recovery;
  return Array.from(out, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const tronAbiAddressWord = (address: string): string =>
  `${"0".repeat(24)}${bytesToHex(decodeTronBase58CheckAddress(address)).slice(
    4,
  )}`;

const TRON_TO_TAIRA_RECIPIENT_HASH = bytesToHex(
  keccak_256(new TextEncoder().encode(TAIRA_ACCOUNT_ID)),
);

const getSccpCapabilitiesMock = vi.fn();
const getSccpProofManifestsMock = vi.fn();
const listSccpRecentMessagesMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const getSccpMessageProofBundleMock = vi.fn();
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
const waitForSccpTransactionCommitMock = vi.fn();
const triggerTronConstantContractMock = vi.fn();
const triggerTronSmartContractMock = vi.fn();
const broadcastTronTransactionMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getSccpCapabilities: (input: unknown) => getSccpCapabilitiesMock(input),
  getSccpProofManifests: (input: unknown) => getSccpProofManifestsMock(input),
  listSccpRecentMessages: (input: unknown) => listSccpRecentMessagesMock(input),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  getSccpMessageProofBundle: (input: unknown) =>
    getSccpMessageProofBundleMock(input),
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
  waitForSccpTransactionCommit: (input: unknown) =>
    waitForSccpTransactionCommitMock(input),
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
  submissionPackage: {
    platformPayload: {
      kind: "tron_contract_call",
      value: {
        statementHash: STATEMENT_HASH,
      },
    },
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
        payload: bytesToHex(decodeTronBase58CheckAddress(VALID_TRON_ADDRESS)),
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
      value: TAIRA_TO_TRON_TRANSFER_PAYLOAD,
    },
    finalityProof: "0x010203",
  },
});

const sampleTronFinalityData = (
  mutate?: (finality: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const finality = {
    solidBlock: {
      blockID: tronBlockIdForHeight(TRON_SOLID_BLOCK_NUMBER),
      block_header: {
        raw_data: {
          number: TRON_SOLID_BLOCK_NUMBER,
        },
      },
    },
    witnesses: {
      witnesses: [{ address: VALID_TRON_ADDRESS }],
    },
  };
  mutate?.(finality);
  return finality;
};

const sampleUnfinalizedTronSourceData = (): Record<string, unknown> =>
  sampleTronFinalityData((finality) => {
    const solidBlock = finality.solidBlock as Record<string, unknown>;
    const blockHeader = solidBlock.block_header as Record<string, unknown>;
    const rawData = blockHeader.raw_data as Record<string, unknown>;
    rawData.number = 1;
    solidBlock.blockID = tronBlockIdForHeight(1);
  });

const sampleTronTransaction = (): Record<string, unknown> => ({
  txID: TRON_TX_ID,
  raw_data_hex: DEFAULT_TRON_RAW_DATA_HEX,
  raw_data: {
    contract: [
      {
        type: "TriggerSmartContract",
        parameter: {
          type_url: "type.googleapis.com/protocol.TriggerSmartContract",
          value: {
            owner_address: bytesToHex(
              decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
            ),
            contract_address: bytesToHex(
              decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
            ),
            data: TRON_BURN_CALL_DATA,
          },
        },
      },
    ],
  },
  signature: [signTronRawDataHex(DEFAULT_TRON_RAW_DATA_HEX)],
});

const sampleUnsignedTronTransaction = (): Record<string, unknown> => {
  const transaction = { ...sampleTronTransaction() };
  delete transaction.signature;
  return transaction;
};

const sampleUnsignedTronTransactionForTrigger = (
  trigger: Record<string, unknown>,
): Record<string, unknown> => {
  const transaction = sampleUnsignedTronTransaction();
  const ownerAddress = String(trigger.ownerAddress ?? "");
  const contractAddress = String(trigger.contractAddress ?? "");
  const callData = String(trigger.callData ?? "")
    .trim()
    .replace(/^0x/iu, "")
    .toLowerCase();
  transaction.raw_data_hex = buildTronTriggerRawDataHex({
    ownerAddress,
    contractAddress,
    dataHex: callData,
  });
  transaction.txID = tronTxIdFromRawDataHex(String(transaction.raw_data_hex));
  const value = (
    (
      (transaction.raw_data as Record<string, unknown>).contract as Array<
        Record<string, unknown>
      >
    )[0].parameter as Record<string, unknown>
  ).value as Record<string, unknown>;
  value.owner_address = bytesToHex(decodeTronBase58CheckAddress(ownerAddress));
  value.contract_address = bytesToHex(
    decodeTronBase58CheckAddress(contractAddress),
  );
  value.data = callData;
  return transaction;
};

const mockSuccessfulTronBroadcast = (): void => {
  broadcastTronTransactionMock.mockImplementation(
    (input: { transaction?: { txID?: unknown; txid?: unknown } }) =>
      Promise.resolve({
        result: true,
        txid: String(input.transaction?.txID ?? input.transaction?.txid ?? ""),
      }),
  );
};

const sampleTronReceipt = (txId = TRON_TX_ID): Record<string, unknown> => ({
  id: txId,
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
        event_name: "TairaXorBurnStarted",
        contract_address: VALID_TRON_ADDRESS,
        result: {
          sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
          burner: VALID_TRON_ADDRESS,
          tairaRecipientHash: TRON_TO_TAIRA_RECIPIENT_HASH,
          amount: BRIDGE_AMOUNT_BASE_UNITS,
          nonce: TRON_TO_TAIRA_NONCE,
          routeIdHash: tairaXorRouteIdHash(),
          assetKeyHash: tairaXorAssetKeyHash(),
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
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: transferPayload,
    }),
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

const sampleTairaToTronProofPackage = (): Record<string, unknown> => {
  const canonicalPayloadHex = bytesToHex(
    canonicalSccpTransferPayloadBytes(TAIRA_TO_TRON_TRANSFER_PAYLOAD),
  );
  return {
    canonicalPayloadHex,
    submission: {
      proofBytes: "0x010203",
      statementHash: `0x${"55".repeat(32)}`,
      canonicalPayloadHex,
      publicInputs: {
        version: 1,
        messageId: MESSAGE_ID,
        payloadHash: PAYLOAD_HASH,
        targetDomain: 5,
        commitmentRoot: COMMITMENT_ROOT,
        finalityHeight: 10,
        finalityBlockHash: FINALITY_BLOCK_HASH,
        destinationBindingHash: BINDING_HASH,
      },
    },
  };
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
      tronTokenAddress: TRON_TOKEN_ADDRESS,
      sccpTronSourceBridgeAddress: TRON_SOURCE_BRIDGE_ADDRESS,
      destinationBinding: {
        version: 1,
        key: BINDING_KEY,
        bindingHash: BINDING_HASH,
      },
      destinationRollout: {
        verifierIdentity: TRON_VERIFIER_ADDRESS,
        verifierCodeHash: VERIFIER_CODE_HASH,
        verifierKeyHash: VERIFIER_KEY_HASH,
        destinationNetworkId: NETWORK_ID,
        destinationBindingKey: BINDING_KEY,
        destinationBindingHash: BINDING_HASH,
      },
      postDeployLiveEvidence: {
        fullTomlReady: true,
        sourceBridgeConfigHash: `0x${"11".repeat(32)}`,
        sourceEventTransactionId: `0x${"22".repeat(32)}`,
        routeCanaryEvidenceHash: `0x${"33".repeat(32)}`,
        routeCanaryTransactionId: `0x${"44".repeat(32)}`,
      },
      tairaXorBurnRecord: {
        settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        contractArtifactB64: "TnJ0MGZpeHR1cmUtYnl0ZWNvZGUtbWF0ZXJpYWwtdjEhIQ==",
        vkRef: {
          backend: "halo2/ipa",
          name: "taira-xor-burn-record-v1",
        },
        gasLimit: 123456,
      },
    },
  ],
});

const mockSuccessfulTairaToTronTargetStack = () => {
  let unsignedTransaction = sampleUnsignedTronTransaction();
  const requestMock = vi
    .fn()
    .mockImplementation(
      async (request: {
        method: string;
        params: { transaction: Record<string, unknown> };
      }) => ({
        ...request.params.transaction,
        signature: [
          signTronRawDataHex(String(request.params.transaction.raw_data_hex)),
        ],
      }),
    );
  vi.doMock("@reown/appkit-universal-connector", () => ({
    UniversalConnector: {
      init: vi.fn().mockResolvedValue({
        disconnect: vi.fn(),
        provider: {
          session: {
            topic: "topic",
            namespaces: {
              tron: {
                accounts: [`tron:0x2b6653dc:${VALID_TRON_ADDRESS}`],
                methods: ["tron_signTransaction"],
              },
            },
            sessionProperties: {
              tron_method_version: "v1",
            },
          },
        },
        request: requestMock,
      }),
    },
  }));
  deriveZkIvmPayloadMock.mockResolvedValue({ proved: { overlay: [] } });
  startZkIvmProveJobMock.mockResolvedValue({
    job_id: "11".repeat(16),
  });
  getZkIvmProveJobMock.mockResolvedValue({
    status: "done",
    proved: { overlay: [] },
    attachment: {
      backend: "halo2/ipa",
      proof: {
        backend: "halo2/ipa",
        bytes: "0x01",
      },
      vk_ref: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
    },
  });
  submitZkIvmProvedTransactionMock.mockResolvedValue({
    tx_hash_hex: "88".repeat(32),
  });
  triggerTronSmartContractMock.mockImplementation((trigger) => {
    unsignedTransaction = sampleUnsignedTronTransactionForTrigger(
      trigger as Record<string, unknown>,
    );
    return Promise.resolve({
      transaction: unsignedTransaction,
    });
  });
  mockSuccessfulTronBroadcast();
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
        expect(message.kind).toBe("prove-tron-proof-package");
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: sampleTairaToTronProofPackage(),
          },
        });
      };
    }),
  );
  return {
    requestMock,
    get unsignedTransaction() {
      return unsignedTransaction;
    },
  };
};

const mockSuccessfulTronToTairaBridgeStack = (
  proofPackage: Record<string, unknown> = sampleTronToTairaSourceProofPackage(),
) => {
  const requestMock = vi
    .fn()
    .mockImplementation(
      async (request: {
        method: string;
        params: { transaction: Record<string, unknown> };
      }) => ({
        ...request.params.transaction,
        signature: [
          signTronRawDataHex(String(request.params.transaction.raw_data_hex)),
        ],
      }),
    );
  vi.doMock("@reown/appkit-universal-connector", () => ({
    UniversalConnector: {
      init: vi.fn().mockResolvedValue({
        disconnect: vi.fn(),
        provider: {
          session: {
            topic: "topic",
            namespaces: {
              tron: {
                accounts: [`tron:0x2b6653dc:${VALID_TRON_ADDRESS}`],
                methods: ["tron_signTransaction"],
              },
            },
            sessionProperties: {
              tron_method_version: "v1",
            },
          },
        },
        request: requestMock,
      }),
    },
  }));
  triggerTronSmartContractMock.mockImplementation((trigger) =>
    Promise.resolve({
      transaction: sampleUnsignedTronTransactionForTrigger(
        trigger as Record<string, unknown>,
      ),
    }),
  );
  mockSuccessfulTronBroadcast();
  const workerCtor = vi.fn().mockImplementation(function WorkerMock(this: {
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
  });
  vi.stubGlobal("Worker", workerCtor);
  return { requestMock, proofPackage, workerCtor };
};

describe("SccpView", () => {
  beforeEach(() => {
    localStorage.clear();
    getSccpCapabilitiesMock.mockReset();
    getSccpProofManifestsMock.mockReset();
    listSccpRecentMessagesMock.mockReset();
    fetchAccountAssetsMock.mockReset();
    getSccpMessageProofBundleMock.mockReset();
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
    waitForSccpTransactionCommitMock.mockReset();
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
    getSccpMessageProofBundleMock.mockResolvedValue(
      sampleMessageProofJob().bundle,
    );
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
    getTronTransactionReceiptMock.mockImplementation(
      (input: { txId?: unknown }) =>
        Promise.resolve(sampleTronReceipt(String(input.txId ?? TRON_TX_ID))),
    );
    getTronTransactionEventsMock.mockResolvedValue(sampleTronEvents());
    submitSccpBridgeMessageMock.mockResolvedValue({
      tx_hash_hex: "99".repeat(32),
    });
    waitForSccpTransactionCommitMock.mockResolvedValue({
      hash_hex: "99".repeat(32),
      status: "Applied",
    });
  });

  afterEach(() => {
    vi.doUnmock("@reown/appkit-universal-connector");
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
      endpoint: TRON_MAINNET_RPC_URL,
      address: VALID_TRON_ADDRESS,
    });
    expect(triggerTronConstantContractMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: TRON_TOKEN_ADDRESS,
      functionSelector: "balanceOf(address)",
      parameter: tronAbiAddressWord(VALID_TRON_ADDRESS),
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

  it("keeps bridge actions disabled when WalletConnect config is invalid", async () => {
    storeConnectedTronWallet();
    vi.stubEnv(
      "VITE_WALLETCONNECT_PROJECT_ID",
      "https://walletconnect.example/project",
    );
    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("WalletConnect misconfigured");

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    await inputs[2].setValue(MESSAGE_ID);

    const prepareButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Prepare TAIRA -> TRON"));
    expect(prepareButton).toBeTruthy();
    expect(prepareButton!.attributes("disabled")).toBeDefined();

    await prepareButton!.trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "WalletConnect project ID is invalid, so TRON wallet connection is disabled.",
    );
    expect(getSccpMessageProofJobMock).not.toHaveBeenCalled();
    expect(deriveZkIvmPayloadMock).not.toHaveBeenCalled();
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();
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

    expect(getSccpMessageProofBundleMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      messageId: MESSAGE_ID,
    });
    expect(getSccpMessageProofJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://taira.sora.org",
        messageId: MESSAGE_ID,
        networkIdHex: NETWORK_ID,
        tronVerifierAddress: TRON_VERIFIER_ADDRESS,
        verifierCodeHashHex: VERIFIER_CODE_HASH,
        verifierKeyHashHex: VERIFIER_KEY_HASH,
        expectedDestinationBindingHashHex: BINDING_HASH,
        proofBytesHex: expect.stringMatching(/^0x[0-9a-f]{768}$/u),
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

  it("does not request TRON wallet approval when the gateway returns a mismatched finalize transaction", async () => {
    storeConnectedTronWallet();
    const { requestMock } = mockSuccessfulTairaToTronTargetStack();
    getSccpMessageProofJobMock.mockResolvedValue(sampleMessageProofJob());
    triggerTronSmartContractMock.mockImplementationOnce((trigger) =>
      Promise.resolve({
        transaction: sampleUnsignedTronTransactionForTrigger({
          ...(trigger as Record<string, unknown>),
          contractAddress: TRON_TOKEN_ADDRESS,
        }),
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
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Unsigned TRON bridge transaction contract does not match the requested bridge contract.",
    );
    expect(requestMock).not.toHaveBeenCalled();
    expect(broadcastTronTransactionMock).not.toHaveBeenCalled();
  });

  it("does not request TRON wallet approval if the route context changes during TAIRA finalization", async () => {
    storeConnectedTronWallet();
    getSccpMessageProofJobMock.mockResolvedValue(sampleMessageProofJob());
    const workerCtor = vi.fn().mockImplementation(function WorkerMock(this: {
      onmessage: ((event: { data: Record<string, unknown> }) => void) | null;
      onerror: null;
      terminate: () => void;
      postMessage: (message: { id: string; kind: string }) => void;
    }) {
      this.onmessage = null;
      this.onerror = null;
      this.terminate = vi.fn();
      this.postMessage = (message: { id: string; kind: string }) => {
        expect(message.kind).toBe("prove-tron-proof-package");
        const session = useSessionStore();
        session.$patch({
          connection: {
            ...session.connection,
            toriiUrl: "https://rotated-taira.sora.org",
          },
        });
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: sampleTairaToTronProofPackage(),
          },
        });
      };
    });
    vi.stubGlobal("Worker", workerCtor);

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

    expect(wrapper.text()).toContain("SCCP bridge context changed");
    expect(workerCtor).toHaveBeenCalledOnce();
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();
    expect(broadcastTronTransactionMock).not.toHaveBeenCalled();
  });

  it("does not submit the TAIRA source transaction if route context changes during ZK proof polling", async () => {
    storeConnectedTronWallet();
    deriveZkIvmPayloadMock.mockResolvedValue({ proved: { overlay: [] } });
    startZkIvmProveJobMock.mockResolvedValue({
      job_id: "11".repeat(16),
    });
    getZkIvmProveJobMock.mockImplementationOnce(() => {
      const session = useSessionStore();
      session.$patch({
        connection: {
          ...session.connection,
          toriiUrl: "https://rotated-taira.sora.org",
        },
      });
      return Promise.resolve({
        status: "done",
        proved: { overlay: [] },
        attachment: {
          backend: "halo2/ipa",
          proof: {
            backend: "halo2/ipa",
            bytes: "0x01",
          },
          vk_ref: {
            backend: "halo2/ipa",
            name: "taira-xor-burn-record-v1",
          },
        },
      });
    });

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(getZkIvmProveJobMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      jobId: "11".repeat(16),
    });
    expect(wrapper.text()).toContain("SCCP bridge context changed");
    expect(submitZkIvmProvedTransactionMock).not.toHaveBeenCalled();
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

  it("does not request TRON wallet approval when the gateway returns a mismatched burn transaction", async () => {
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "tron-mismatched-burn");
    const { requestMock, workerCtor } = mockSuccessfulTronToTairaBridgeStack();
    triggerTronSmartContractMock.mockImplementationOnce((trigger) =>
      Promise.resolve({
        transaction: sampleUnsignedTronTransactionForTrigger({
          ...(trigger as Record<string, unknown>),
          callData: "0xfeedface",
        }),
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
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Unsigned TRON bridge transaction call data does not match the requested bridge action.",
    );
    expect(requestMock).not.toHaveBeenCalled();
    expect(broadcastTronTransactionMock).not.toHaveBeenCalled();
    expect(getTronTransactionMock).not.toHaveBeenCalled();
    expect(workerCtor).not.toHaveBeenCalled();
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
    await inputs[3].setValue(TRON_TX_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(getTronTransactionMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      txId: TRON_TX_ID,
    });
    expect(getTronTransactionReceiptMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      txId: TRON_TX_ID,
    });
    expect(getTronTransactionEventsMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      txId: TRON_TX_ID,
    });
    expect(getTronFinalityDataMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
    });
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
    await inputs[3].setValue(TRON_TX_ID);
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

  it("does not submit TAIRA settlement if the route context changes during TRON source proofing", async () => {
    storeConnectedTronWallet();
    const workerCtor = vi.fn().mockImplementation(function WorkerMock(this: {
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
        const session = useSessionStore();
        session.$patch({
          connection: {
            ...session.connection,
            toriiUrl: "https://rotated-taira.sora.org",
          },
        });
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: sampleTronToTairaSourceProofPackage(),
          },
        });
      };
    });
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

    expect(wrapper.text()).toContain("SCCP bridge context changed");
    expect(workerCtor).toHaveBeenCalledOnce();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("snapshots the route manifest before TRON source data loading", async () => {
    storeConnectedTronWallet();
    const mutableManifestSet = sampleReadyManifestSet();
    getSccpProofManifestsMock.mockResolvedValue(mutableManifestSet);
    getTronTransactionMock.mockImplementationOnce(() => {
      (
        mutableManifestSet.manifests[0] as Record<string, unknown>
      ).tronBridgeAddress = TRON_TOKEN_ADDRESS;
      return Promise.resolve(sampleTronTransaction());
    });
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

    expect(wrapper.text()).toContain("SCCP bridge context changed");
    expect(workerCtor).not.toHaveBeenCalled();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("rebinds source worker packages to the original TRON source event", async () => {
    storeConnectedTronWallet();
    getTronTransactionEventsMock.mockResolvedValue(
      sampleTronEvents((events) => {
        const event = (events.data as Record<string, unknown>[])[0];
        (event.result as Record<string, unknown>).nonce = "10";
        (event.result as Record<string, unknown>).sourceEventDigest =
          tairaXorBurnSourceEventDigest({
            bridgeAddress: VALID_TRON_ADDRESS,
            burnerAddress: VALID_TRON_ADDRESS,
            tairaRecipient: TAIRA_ACCOUNT_ID,
            amount: BRIDGE_AMOUNT_BASE_UNITS,
            nonce: "10",
          });
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
    await inputs[3].setValue(TRON_TX_ID);
    const fetchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Fetch proof job"));
    expect(fetchButton).toBeTruthy();
    await fetchButton!.trigger("click");
    await flushPromises();

    expect(submitSccpBridgeMessageMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: TAIRA_ACCOUNT_ID,
      messageBundle: buildSccpMessageBundleSubmitPayload(
        messageBundle as Record<string, unknown>,
      ),
      settlement,
    });
    expect(waitForSccpTransactionCommitMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      hashHex: "99".repeat(32),
    });
    expect(wrapper.text()).toContain("TAIRA settlement confirmed");
    expect(wrapper.text()).toContain("TAIRA settlement transaction");
    const settlementLink = wrapper
      .findAll("a")
      .find((link) => link.text() === "TAIRA settlement transaction");
    expect(settlementLink?.attributes("href")).toBe(
      `${TAIRA_EXPLORER_URL}/transactions/${"99".repeat(32)}`,
    );
  });

  it("rejects TAIRA settlement responses with an invalid transaction hash", async () => {
    storeConnectedTronWallet();
    submitSccpBridgeMessageMock.mockResolvedValue({
      tx_hash_hex: "not-a-transaction-hash",
    });
    mockSuccessfulTronToTairaBridgeStack();

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

    expect(wrapper.text()).toContain(
      "TAIRA transaction hash must be a 32-byte hex value.",
    );
    expect(waitForSccpTransactionCommitMock).not.toHaveBeenCalled();
    expect(
      wrapper
        .findAll("a")
        .some((link) => link.text() === "TAIRA settlement transaction"),
    ).toBe(false);
  });

  it("continues TRON burn broadcast through automatic TAIRA settlement after finality indexing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(7);
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "tron-auto-settle-project");
    const { requestMock, proofPackage } =
      mockSuccessfulTronToTairaBridgeStack();
    getTronFinalityDataMock
      .mockResolvedValueOnce(sampleTronFinalityData())
      .mockResolvedValueOnce(sampleUnfinalizedTronSourceData())
      .mockResolvedValue(sampleTronFinalityData());

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
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(requestMock).toHaveBeenCalled();
    expect(broadcastTronTransactionMock).toHaveBeenCalled();
    expect(getTronTransactionMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(
      "Waiting for TRON finality and event indexing",
    );
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await submitPromise;
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(getTronTransactionMock).toHaveBeenCalledTimes(2);
    expect(getTronFinalityDataMock).toHaveBeenCalledTimes(3);
    expect(submitSccpBridgeMessageMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: TAIRA_ACCOUNT_ID,
      messageBundle: buildSccpMessageBundleSubmitPayload(
        proofPackage.messageBundle as Record<string, unknown>,
      ),
      settlement: proofPackage.settlement,
    });
    expect(waitForSccpTransactionCommitMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      hashHex: "99".repeat(32),
    });
    expect(wrapper.text()).toContain("TAIRA settlement confirmed");
    expect(wrapper.text()).toContain("TAIRA settlement transaction");
    const settlementLink = wrapper
      .findAll("a")
      .find((link) => link.text() === "TAIRA settlement transaction");
    expect(settlementLink?.attributes("href")).toBe(
      `${TAIRA_EXPLORER_URL}/transactions/${"99".repeat(32)}`,
    );
  });

  it("does not submit TAIRA settlement when automatic TRON source finality times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(7);
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "tron-auto-timeout-project");
    const { requestMock, workerCtor } = mockSuccessfulTronToTairaBridgeStack();
    getTronFinalityDataMock
      .mockResolvedValueOnce(sampleTronFinalityData())
      .mockResolvedValue(sampleUnfinalizedTronSourceData());

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
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(requestMock).toHaveBeenCalled();
    expect(broadcastTronTransactionMock).toHaveBeenCalled();
    for (let attempt = 1; attempt < 40; attempt += 1) {
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
    }
    await submitPromise;
    await flushPromises();

    expect(getTronTransactionMock).toHaveBeenCalledTimes(40);
    expect(wrapper.text()).toContain(
      "Timed out waiting for TRON finality and bridge event indexing.",
    );
    expect(workerCtor).not.toHaveBeenCalled();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("fails automatic TRON settlement immediately on adversarial burn-event bindings", async () => {
    storeConnectedTronWallet();
    vi.stubEnv(
      "VITE_WALLETCONNECT_PROJECT_ID",
      "tron-auto-adversarial-project",
    );
    const { requestMock, workerCtor } = mockSuccessfulTronToTairaBridgeStack();
    getTronTransactionEventsMock.mockResolvedValue(
      sampleTronEvents((events) => {
        const event = (events.data as Record<string, unknown>[])[0];
        (event.result as Record<string, unknown>).amount = "999";
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
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();
    await vi.dynamicImportSettled();
    await submitPromise;
    await flushPromises();

    expect(requestMock).toHaveBeenCalled();
    expect(broadcastTronTransactionMock).toHaveBeenCalled();
    expect(getTronTransactionMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(
      "TRON burn event amount does not match this bridge request.",
    );
    expect(workerCtor).not.toHaveBeenCalled();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("does not retry automatic TRON settlement when the bridge event digest is missing", async () => {
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "tron-auto-missing-digest");
    const { requestMock, workerCtor } = mockSuccessfulTronToTairaBridgeStack();
    getTronTransactionEventsMock.mockResolvedValue(
      sampleTronEvents((events) => {
        const event = (events.data as Record<string, unknown>[])[0];
        delete (event.result as Record<string, unknown>).sourceEventDigest;
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
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();
    await vi.dynamicImportSettled();
    await submitPromise;
    await flushPromises();

    expect(requestMock).toHaveBeenCalled();
    expect(broadcastTronTransactionMock).toHaveBeenCalled();
    expect(getTronTransactionMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(
      "TRON transaction events must include the bridge source event digest.",
    );
    expect(workerCtor).not.toHaveBeenCalled();
    expect(submitSccpBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("polls TAIRA proof job indexing after source submission before TRON finalize", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(7);
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "polling-success-project");
    const { requestMock } = mockSuccessfulTairaToTronTargetStack();
    getSccpMessageProofJobMock
      .mockRejectedValueOnce(new Error("404 message not found"))
      .mockRejectedValueOnce(new Error("message is still indexing"))
      .mockResolvedValue(sampleMessageProofJob());

    const wrapper = mountView({
      toriiUrl: "https://taira.sora.org",
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    });
    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("0.0001");
    await inputs[1].setValue(VALID_TRON_ADDRESS);
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(getSccpMessageProofJobMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Waiting for SCCP proof job indexing");
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    expect(getSccpMessageProofJobMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3_000);
    await submitPromise;
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(getSccpMessageProofJobMock).toHaveBeenCalledTimes(3);
    expect(triggerTronSmartContractMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
    expect(broadcastTronTransactionMock).toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "TRON finalize transaction confirmed",
    );
  });

  it("does not request TRON wallet approval when TAIRA proof job indexing times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(7);
    storeConnectedTronWallet();
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "polling-timeout-project");
    const { requestMock } = mockSuccessfulTairaToTronTargetStack();
    getSccpMessageProofJobMock.mockRejectedValue(
      new Error("404 message not found"),
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
    const submitPromise = wrapper.find("form").trigger("submit");
    await flushPromises();

    for (let attempt = 1; attempt < 10; attempt += 1) {
      await vi.advanceTimersByTimeAsync(3_000);
      await flushPromises();
    }
    await submitPromise;
    await flushPromises();

    expect(getSccpMessageProofJobMock).toHaveBeenCalledTimes(10);
    expect(wrapper.text()).toContain(
      "Timed out waiting for Torii to index the SCCP proof job.",
    );
    expect(triggerTronSmartContractMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
    expect(broadcastTronTransactionMock).not.toHaveBeenCalled();
  });

  it("continues TAIRA source submission through TRON finalize broadcast", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(7);
    storeConnectedTronWallet();
    let unsignedTransaction = sampleUnsignedTronTransaction();
    const requestMock = vi
      .fn()
      .mockImplementation(
        async (request: {
          method: string;
          params: { transaction: Record<string, unknown> };
        }) => ({
          ...request.params.transaction,
          signature: [
            signTronRawDataHex(String(request.params.transaction.raw_data_hex)),
          ],
        }),
      );
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue({
          disconnect: vi.fn(),
          provider: {
            session: {
              topic: "topic",
              namespaces: {
                tron: {
                  accounts: [`tron:0x2b6653dc:${VALID_TRON_ADDRESS}`],
                  methods: ["tron_signTransaction"],
                },
              },
              sessionProperties: {
                tron_method_version: "v1",
              },
            },
          },
          request: requestMock,
        }),
      },
    }));
    deriveZkIvmPayloadMock.mockResolvedValue({ proved: { overlay: [] } });
    startZkIvmProveJobMock.mockResolvedValue({
      job_id: "11".repeat(16),
    });
    getZkIvmProveJobMock.mockResolvedValue({
      status: "done",
      proved: { overlay: [] },
      attachment: {
        backend: "halo2/ipa",
        proof: {
          backend: "halo2/ipa",
          bytes: "0x01",
        },
        vk_ref: {
          backend: "halo2/ipa",
          name: "taira-xor-burn-record-v1",
        },
      },
    });
    submitZkIvmProvedTransactionMock.mockResolvedValue({
      tx_hash_hex: "88".repeat(32),
    });
    getSccpMessageProofJobMock.mockResolvedValue(sampleMessageProofJob());
    triggerTronSmartContractMock.mockImplementation((trigger) => {
      unsignedTransaction = sampleUnsignedTronTransactionForTrigger(
        trigger as Record<string, unknown>,
      );
      return Promise.resolve({
        transaction: unsignedTransaction,
      });
    });
    mockSuccessfulTronBroadcast();
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
          expect(message.kind).toBe("prove-tron-proof-package");
          this.onmessage?.({
            data: {
              id: message.id,
              ok: true,
              result: sampleTairaToTronProofPackage(),
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
    const prepareButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Prepare TAIRA -> TRON"));
    expect(prepareButton).toBeTruthy();
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(submitZkIvmProvedTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://taira.sora.org",
        chainId: TAIRA_CHAIN_ID,
        accountId: TAIRA_ACCOUNT_ID,
      }),
    );
    expect(getSccpMessageProofJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://taira.sora.org",
        messageId: MESSAGE_ID,
        networkIdHex: NETWORK_ID,
        tronVerifierAddress: TRON_VERIFIER_ADDRESS,
        verifierCodeHashHex: VERIFIER_CODE_HASH,
        verifierKeyHashHex: VERIFIER_KEY_HASH,
        expectedDestinationBindingHashHex: BINDING_HASH,
        proofBytesHex: expect.stringMatching(/^0x[0-9a-f]{768}$/u),
      }),
    );
    expect(triggerTronSmartContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: TRON_MAINNET_RPC_URL,
        ownerAddress: VALID_TRON_ADDRESS,
        contractAddress: VALID_TRON_ADDRESS,
        functionSelector: expect.stringContaining("finalizeFromTaira"),
      }),
    );
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "tron_signTransaction",
        params: expect.objectContaining({
          address: VALID_TRON_ADDRESS,
          transaction: unsignedTransaction,
        }),
      }),
      "tron:0x2b6653dc",
    );
    expect(broadcastTronTransactionMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      transaction: {
        ...unsignedTransaction,
        signature: [
          signTronRawDataHex(String(unsignedTransaction.raw_data_hex)),
        ],
      },
    });
    expect(getTronTransactionReceiptMock).toHaveBeenCalledWith({
      endpoint: TRON_MAINNET_RPC_URL,
      txId: String(unsignedTransaction.txID),
    });
    expect(wrapper.text()).toContain(
      "TRON finalize transaction confirmed",
    );
    expect(wrapper.text()).toContain("TAIRA source transaction");
    expect(wrapper.text()).toContain("TRON finalize transaction");
    const sourceLink = wrapper
      .findAll("a")
      .find((link) => link.text() === "TAIRA source transaction");
    const finalizeLink = wrapper
      .findAll("a")
      .find((link) => link.text() === "TRON finalize transaction");
    expect(sourceLink?.attributes("href")).toBe(
      `${TAIRA_EXPLORER_URL}/transactions/${"88".repeat(32)}`,
    );
    expect(finalizeLink?.attributes("href")).toBe(
      `${TRON_MAINNET_TRONSCAN_URL}/#/transaction/${String(
        unsignedTransaction.txID,
      )}`,
    );
  });
});

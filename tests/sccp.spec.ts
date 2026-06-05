import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  bridgeDecimalToBaseUnits,
  bindSignedTronTransactionForBroadcast,
  bindTronBroadcastResult,
  bindTronFinalitySnapshot,
  bindTronSourceDataForProof,
  bindTronToTairaSourceProofPackage,
  bindUnsignedTronSmartContractTransaction,
  buildTairaExplorerTransactionUrl,
  buildSccpMessageBundleSubmitPayload,
  buildTairaXorInboundSettlement,
  buildTairaXorFinalizeProofBinding,
  buildTairaXorFinalizeTriggerRequest,
  buildTairaXorMessageProofJobQueryMaterial,
  buildTairaXorBurnTriggerRequest,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorOutboundPreview,
  buildTairaXorTokenBalanceRequest,
  decodeTronBase58CheckAddress,
  formatBaseUnitAmount,
  formatTronSunBalance,
  isTairaSccpNetwork,
  isLikelyTairaAccount,
  isValidSccpMessageId,
  isValidTronBase58CheckAddress,
  isValidTronTransactionId,
  normalizeBridgeAmount,
  normalizeSccpMessageId,
  normalizeSccpTronNetworkKey,
  normalizeTairaAccountId,
  normalizeTairaTransactionHash,
  normalizeTronTransactionId,
  normalizeTronNetworkIdHex,
  readTronAccountBalanceSun,
  readTronConstantUint256,
  readSccpTairaBurnRecordMaterial,
  readSccpTronBridgeAddress,
  readSccpTronGatewayEndpoint,
  readSccpTronProofMaterial,
  readSccpTronSourceBridgeAddress,
  readSccpTronTokenAddress,
  resolveSccpRouteReadiness,
  tairaXorBurnToTairaAccountCallData,
  tairaXorBurnToTairaCallData,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  SCCP_SORA_DOMAIN,
  SCCP_TRON_DOMAIN,
  SCCP_TRON_NETWORK,
  TRON_MAINNET_CAIP_CHAIN_ID,
  TRON_MAINNET_CHAIN_ID_HEX,
  TRON_MAINNET_NETWORK_ID_HEX,
  TRON_MAINNET_RPC_URL,
  TRON_NILE_CAIP_CHAIN_ID,
  TRON_NILE_CHAIN_ID_HEX,
  TRON_NILE_NETWORK_ID_HEX,
  TRON_NILE_RPC_URL,
  walletConnectSessionFromAddress,
} from "@/utils/sccp";
import {
  canonicalSccpTransferPayloadBytes,
  canonicalSccpPayloadEnvelopeBytes,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1,
  sccpPayloadHash,
  sccpTransferMessageId,
  tairaXorBurnSourceEventDigest,
  tairaXorRouteIdHash,
  tairaXorAssetKeyHash,
  tronSccpDestinationBinding,
} from "@iroha/iroha-js/sccp";
import {
  buildTronSccpProofPackage,
  generateTronSccpProofPackage,
  serializeSccpValue,
} from "@/utils/sccpProofPackage";
import {
  TAIRA_CHAIN_ID,
  TAIRA_EXPLORER_URL,
  TAIRA_NETWORK_PREFIX,
} from "@/constants/chains";

const VALID_TRON_ADDRESS = "TGkWdpawVNfeset3P6uTBbLaPY7nZVZvXY";
const VALID_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const BURN_RECORD_ARTIFACT_B64 =
  "TnJ0MGZpeHR1cmUtYnl0ZWNvZGUtbWF0ZXJpYWwtdjEhIQ==";
const BURN_RECORD_MATERIAL = {
  tairaXorBurnRecord: {
    settlementAssetDefinitionId: VALID_ASSET_DEFINITION_ID,
    contractArtifactB64: BURN_RECORD_ARTIFACT_B64,
    vkRef: {
      backend: "halo2/ipa",
      name: "taira-xor-burn-record-v1",
    },
    gasLimit: 123456,
  },
};
const HEX32_A = `0x${"11".repeat(32)}`;
const HEX32_B = `0x${"22".repeat(32)}`;
const HEX32_C = `0x${"33".repeat(32)}`;
const HEX32_D = `0x${"44".repeat(32)}`;
const HEX32_E = `0x${"55".repeat(32)}`;
const HEX32_F = `0x${"66".repeat(32)}`;
const TRON_SOLID_BLOCK_NUMBER = 12;
const TRON_SOLID_BLOCK_ID = `0x${TRON_SOLID_BLOCK_NUMBER.toString(16).padStart(
  16,
  "0",
)}${"66".repeat(24)}`;
const TRON_TOKEN_ADDRESS = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const TRON_SOURCE_BRIDGE_ADDRESS = "TEdvoHEatmDKvTh3o9vBRB9Vdtbhn4QFhy";
const TRON_VERIFIER_ADDRESS = "TGCAjMXComunWZEXCT1LPBdcYbDVuyexBv";
const SIGNING_TRON_PRIVATE_KEY = new Uint8Array(32).fill(7);
const WRONG_SIGNING_TRON_PRIVATE_KEY = new Uint8Array(32).fill(8);
const SIGNING_TRON_ADDRESS = VALID_TRON_ADDRESS;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(
    hex
      .trim()
      .replace(/^0x/u, "")
      .match(/.{2}/gu)
      ?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );

const tronTxIdFromRawDataHex = (rawDataHex: string): string =>
  bytesToHex(sha256(hexToBytes(rawDataHex))).slice(2);

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
  feeLimit?: number | bigint;
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
      protobufU64Field(18, input.feeLimit ?? 50_000_000n),
    ),
  ).slice(2);
};

const DEFAULT_TRON_RAW_DATA_HEX = buildTronTriggerRawDataHex({
  dataHex: "abcdef",
});
const TRON_TX_ID = tronTxIdFromRawDataHex(DEFAULT_TRON_RAW_DATA_HEX);

const signTronRawDataHex = (
  rawDataHex: string,
  privateKey = SIGNING_TRON_PRIVATE_KEY,
): string => {
  const signature = secp256k1.sign(sha256(hexToBytes(rawDataHex)), privateKey, {
    prehash: false,
    lowS: true,
  });
  const out = new Uint8Array(65);
  out.set(signature.toCompactRawBytes());
  out[64] = signature.recovery;
  return Array.from(out, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const tronAbiAddressWord = (address: string): string =>
  `${"0".repeat(24)}${bytesToHex(decodeTronBase58CheckAddress(address)).slice(
    4,
  )}`;

const abiWord = (value: bigint): Uint8Array => {
  let remaining = value;
  const out = new Uint8Array(32);
  for (let index = out.length - 1; index >= 0; index -= 1) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
};

const BN254_G2_GENERATOR_WORDS = [
  abiWord(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6edn),
  abiWord(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2n),
  abiWord(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daan),
  abiWord(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975bn),
];

const groth16ProofBytes = (): Uint8Array => {
  const out = new Uint8Array(SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1);
  [
    abiWord(1n),
    Uint8Array.from({ length: 32 }, () => 0x11),
    abiWord(0n),
    Uint8Array.from({ length: 32 }, () => 0x33),
    abiWord(1n),
    abiWord(2n),
    ...BN254_G2_GENERATOR_WORDS,
    abiWord(1n),
    abiWord(2n),
  ].forEach((word, index) => out.set(word, index * 32));
  return out;
};

const tairaAccountIdFromByte = (byte: number): string =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from({ length: 32 }, () => byte),
  }).toI105(TAIRA_NETWORK_PREFIX);

const TAIRA_SENDER = tairaAccountIdFromByte(0x12);
const TAIRA_OTHER_ACCOUNT_ID = tairaAccountIdFromByte(0x34);
const MINAMOTO_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(753);
const BRIDGE_AMOUNT_DECIMAL = "0.0001";
const BRIDGE_AMOUNT_BASE_UNITS = "100000000000000";
const TRON_TO_TAIRA_NONCE = "9";
const TRON_TO_TAIRA_RECIPIENT_HASH = bytesToHex(
  keccak_256(new TextEncoder().encode(TAIRA_SENDER)),
);
const TRON_SOURCE_EVENT_DIGEST = tairaXorBurnSourceEventDigest({
  bridgeAddress: VALID_TRON_ADDRESS,
  burnerAddress: VALID_TRON_ADDRESS,
  tairaRecipient: TAIRA_SENDER,
  amount: BRIDGE_AMOUNT_BASE_UNITS,
  nonce: TRON_TO_TAIRA_NONCE,
});
const TRON_BURN_CALL_DATA = tairaXorBurnToTairaCallData({
  tairaRecipient: TAIRA_SENDER,
  amount: BRIDGE_AMOUNT_BASE_UNITS,
});
const DEFAULT_TRON_SOURCE_RAW_DATA_HEX = buildTronTriggerRawDataHex({
  dataHex: TRON_BURN_CALL_DATA,
});
const TRON_SOURCE_TX_ID = tronTxIdFromRawDataHex(
  DEFAULT_TRON_SOURCE_RAW_DATA_HEX,
);
const TRON_DESTINATION_BINDING_KEY = `tron:0:${SCCP_TRON_DOMAIN}:${TRON_MAINNET_NETWORK_ID_HEX.slice(
  2,
)}:${TRON_VERIFIER_ADDRESS}:${HEX32_D}:${HEX32_E}`;
const TRON_DESTINATION_BINDING = tronSccpDestinationBinding({
  version: 1,
  key: TRON_DESTINATION_BINDING_KEY,
  sourceDomain: 0,
  targetDomain: SCCP_TRON_DOMAIN,
  networkId: TRON_MAINNET_NETWORK_ID_HEX,
  verifierAddress: TRON_VERIFIER_ADDRESS,
  verifierCodeHash: HEX32_D,
  verifierKeyHash: HEX32_E,
});
const TRON_NILE_DESTINATION_BINDING_KEY = `tron:0:${SCCP_TRON_DOMAIN}:${TRON_NILE_NETWORK_ID_HEX.slice(
  2,
)}:${TRON_VERIFIER_ADDRESS}:${HEX32_D}:${HEX32_E}`;
const TRON_NILE_DESTINATION_BINDING = tronSccpDestinationBinding({
  version: 1,
  key: TRON_NILE_DESTINATION_BINDING_KEY,
  sourceDomain: 0,
  targetDomain: SCCP_TRON_DOMAIN,
  networkId: TRON_NILE_NETWORK_ID_HEX,
  verifierAddress: TRON_VERIFIER_ADDRESS,
  verifierCodeHash: HEX32_D,
  verifierKeyHash: HEX32_E,
});
const TAIRA_TO_TRON_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: 0,
  dest_domain: SCCP_TRON_DOMAIN,
  nonce: "7",
  asset_home_domain: 0,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: TAIRA_SENDER,
  recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
  recipient: VALID_TRON_ADDRESS,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: "taira_tron_xor",
};
const TAIRA_TO_TRON_MESSAGE_ID = sccpTransferMessageId(
  TAIRA_TO_TRON_TRANSFER_PAYLOAD,
);
const TAIRA_TO_TRON_PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: TAIRA_TO_TRON_TRANSFER_PAYLOAD,
  }),
);
const READY_TRON_MANIFEST = {
  tronNetwork: "mainnet",
  chain: "tron-mainnet",
  tronBridgeAddress: VALID_TRON_ADDRESS,
  tronTokenAddress: TRON_TOKEN_ADDRESS,
  sccpTronSourceBridgeAddress: TRON_SOURCE_BRIDGE_ADDRESS,
  destinationBinding: {
    version: 1,
    key: TRON_DESTINATION_BINDING.key,
    bindingHash: TRON_DESTINATION_BINDING.bindingHash,
  },
  destinationRollout: {
    verifierIdentity: TRON_VERIFIER_ADDRESS,
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    destinationNetworkId: TRON_MAINNET_NETWORK_ID_HEX,
    destinationBindingKey: TRON_DESTINATION_BINDING.key,
    destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HEX32_A,
    sourceEventTransactionId: HEX32_B,
    routeCanaryEvidenceHash: HEX32_C,
    routeCanaryTransactionId: HEX32_F,
  },
  ...BURN_RECORD_MATERIAL,
};
const READY_NILE_TRON_MANIFEST = {
  counterpartyDomain: SCCP_TRON_DOMAIN,
  verifierTarget: "TronContract",
  routeId: "taira_tron_xor",
  assetKey: "xor",
  ...READY_TRON_MANIFEST,
  tronNetwork: "nile",
  chain: "tron-nile",
  productionReady: false,
  disabledReason: "Nile route is in test rollout.",
  destinationBinding: {
    version: 1,
    key: TRON_NILE_DESTINATION_BINDING.key,
    bindingHash: TRON_NILE_DESTINATION_BINDING.bindingHash,
  },
  destinationRollout: {
    ...READY_TRON_MANIFEST.destinationRollout,
    destinationNetworkId: TRON_NILE_NETWORK_ID_HEX,
    destinationBindingKey: TRON_NILE_DESTINATION_BINDING.key,
    destinationBindingHash: TRON_NILE_DESTINATION_BINDING.bindingHash,
  },
  postDeployLiveEvidence: undefined,
};

const sampleTairaToTronJob = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const recipientPayload = bytesToHex(
    decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
  );
  const transferProjection = {
    source_domain: 0,
    dest_domain: SCCP_TRON_DOMAIN,
    asset_home_domain: 0,
    asset_id: { kind: "TextUtf8", value: "xor" },
    route_id: { kind: "TextUtf8", value: "taira_tron_xor" },
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender: { kind: "TextUtf8", value: TAIRA_SENDER },
    recipient: { kind: "TronBase58Check", payload: recipientPayload },
  };
  return {
    publicInputs: {
      version: 1,
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      payloadHash: TAIRA_TO_TRON_PAYLOAD_HASH,
      targetDomain: SCCP_TRON_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
    },
    destinationBinding: {
      version: 1,
      key: TRON_DESTINATION_BINDING.key,
      bindingHash: TRON_DESTINATION_BINDING.bindingHash,
    },
    payloadProjection: {
      kind: "Transfer",
      value: transferProjection,
    },
    submissionPackage: {
      platformPayload: {
        kind: "tron_contract_call",
        value: {
          statementHash: HEX32_E,
        },
      },
    },
    bundle: {
      version: 1,
      commitmentRoot: HEX32_C,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: SCCP_TRON_DOMAIN,
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        payloadHash: TAIRA_TO_TRON_PAYLOAD_HASH,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: TAIRA_TO_TRON_TRANSFER_PAYLOAD,
      },
      finalityProof: "0x010203",
    },
    ...overrides,
  };
};

const sampleTronToTairaProofPackage = (
  mutate?: (packageRecord: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transferPayload = {
    version: 1,
    source_domain: SCCP_TRON_DOMAIN,
    dest_domain: SCCP_SORA_DOMAIN,
    nonce: TRON_TO_TAIRA_NONCE,
    asset_home_domain: SCCP_SORA_DOMAIN,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: "xor",
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender_codec: SCCP_CODEC_TRON_BASE58CHECK,
    sender: VALID_TRON_ADDRESS,
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient: TAIRA_SENDER,
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
  const messageBundle = {
    version: 1,
    commitmentRoot: HEX32_F,
    commitment: {
      version: 1,
      kind: "Transfer",
      targetDomain: SCCP_SORA_DOMAIN,
      messageId,
      payloadHash,
    },
    merkleProof: { steps: [] },
    payload: {
      kind: "Transfer",
      value: transferPayload,
    },
    finalityProof: "0x010203",
  };
  const packageRecord = {
    messageBundle,
    settlement: {
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
    },
    sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    txId: TRON_SOURCE_TX_ID,
    messageId,
    commitmentRoot: HEX32_F,
  };
  mutate?.(packageRecord);
  return packageRecord;
};

const sampleTronTriggerTransaction = (
  mutate?: (transaction: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transaction = {
    txID: TRON_TX_ID,
    raw_data_hex: DEFAULT_TRON_RAW_DATA_HEX,
    raw_data: {
      fee_limit: 150_000_000,
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
              data: "abcdef",
            },
          },
        },
      ],
    },
  };
  mutate?.(transaction);
  return transaction;
};

const sampleSignedTronTriggerTransaction = (
  mutate?: (transaction: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transaction = {
    ...sampleTronTriggerTransaction(),
    signature: [signTronRawDataHex(DEFAULT_TRON_RAW_DATA_HEX)],
  };
  mutate?.(transaction);
  return transaction;
};

const sampleTronFinalityData = (
  mutate?: (finality: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const finality = {
    solidBlock: {
      blockID: TRON_SOLID_BLOCK_ID,
      block_header: {
        raw_data: {
          number: TRON_SOLID_BLOCK_NUMBER,
        },
      },
    },
    witnesses: {
      witnesses: [{ address: VALID_TRON_ADDRESS }],
    },
    collectedAtMs: 1_780_311_473_000,
  };
  mutate?.(finality);
  return finality;
};

const sampleTronSourceData = (
  mutate?: (source: {
    transaction: Record<string, unknown>;
    receipt: Record<string, unknown>;
    events: Record<string, unknown>;
    finality: Record<string, unknown>;
  }) => void,
) => {
  const source = {
    transaction: {
      txID: TRON_SOURCE_TX_ID,
      raw_data_hex: DEFAULT_TRON_SOURCE_RAW_DATA_HEX,
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
      signature: [signTronRawDataHex(DEFAULT_TRON_SOURCE_RAW_DATA_HEX)],
    },
    receipt: {
      id: TRON_SOURCE_TX_ID,
      blockNumber: 10,
      receipt: {
        result: "SUCCESS",
      },
    },
    events: {
      data: [
        {
          transaction_id: TRON_SOURCE_TX_ID,
          event_name: "TairaXorBurnStarted",
          contract_address: VALID_TRON_ADDRESS,
          block_number: 10,
          result: {
            sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
            burner: VALID_TRON_ADDRESS,
            tairaRecipientHash: TRON_TO_TAIRA_RECIPIENT_HASH,
            amount: BRIDGE_AMOUNT_BASE_UNITS,
            nonce: TRON_TO_TAIRA_NONCE,
            routeIdHash: tairaXorRouteIdHash(),
            assetKeyHash: tairaXorAssetKeyHash(),
            tairaRecipient: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)),
          },
        },
      ],
    },
    finality: sampleTronFinalityData(),
  };
  mutate?.(source);
  return source;
};

const sampleBoundTronSourceDataInput = (
  mutate?: Parameters<typeof sampleTronSourceData>[0],
) => ({
  txId: TRON_SOURCE_TX_ID,
  bridgeAddress: VALID_TRON_ADDRESS,
  tronSender: VALID_TRON_ADDRESS,
  tairaRecipient: TAIRA_SENDER,
  amountDecimal: "0.0001",
  ...sampleTronSourceData(mutate),
});

describe("SCCP helpers", () => {
  it("gates the bridge to TAIRA chain id and network prefix", () => {
    expect(
      isTairaSccpNetwork({
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      }),
    ).toBe(true);
    expect(
      isTairaSccpNetwork({
        chainId: "00000000-0000-0000-0000-000000000000",
        networkPrefix: 753,
      }),
    ).toBe(false);
  });

  it("validates canonical TAIRA I105 account ids", () => {
    expect(normalizeTairaAccountId(TAIRA_SENDER)).toBe(TAIRA_SENDER);
    expect(isLikelyTairaAccount(TAIRA_SENDER)).toBe(true);
    expect(isLikelyTairaAccount("testu1234567890abcdef")).toBe(false);
    expect(isLikelyTairaAccount(MINAMOTO_ACCOUNT_ID)).toBe(false);
    expect(() => normalizeTairaAccountId(MINAMOTO_ACCOUNT_ID)).toThrow(
      /canonical TAIRA I105/,
    );
    expect(() => normalizeTairaAccountId(`${TAIRA_SENDER} `)).toThrow(
      /canonical TAIRA I105/,
    );
  });

  it("builds specific TAIRA explorer transaction links from valid hashes only", () => {
    expect(normalizeTairaTransactionHash(` 0X${"AB".repeat(32)} `)).toBe(
      "ab".repeat(32),
    );
    expect(
      buildTairaExplorerTransactionUrl(
        `${TAIRA_EXPLORER_URL}/`,
        `0x${"CD".repeat(32)}`,
      ),
    ).toBe(`${TAIRA_EXPLORER_URL}/transactions/${"cd".repeat(32)}`);
    expect(buildTairaExplorerTransactionUrl(TAIRA_EXPLORER_URL, "1234")).toBe(
      null,
    );
    expect(() => normalizeTairaTransactionHash("1234")).toThrow(/32-byte hex/);
    expect(() =>
      buildTairaExplorerTransactionUrl(" ", "11".repeat(32)),
    ).toThrow(/explorer URL/);
  });

  it("validates TRON Base58Check mainnet addresses", () => {
    expect(isValidTronBase58CheckAddress(VALID_TRON_ADDRESS)).toBe(true);
    expect(decodeTronBase58CheckAddress(VALID_TRON_ADDRESS)[0]).toBe(0x41);
    expect(
      isValidTronBase58CheckAddress("TJRabPrwbZy45sbavfcjinPJC18kjpRTv9"),
    ).toBe(false);
    expect(isValidTronBase58CheckAddress("0x" + "11".repeat(20))).toBe(false);
  });

  it("normalizes positive bridge amounts and rejects invalid values", () => {
    expect(normalizeBridgeAmount(" 0.0001 ")).toBe("0.0001");
    expect(() => normalizeBridgeAmount("0")).toThrow(/greater than zero/);
    expect(() => normalizeBridgeAmount("-1")).toThrow(/positive decimal/);
    expect(() => normalizeBridgeAmount("1.1234567890123456789")).toThrow(
      /positive decimal/,
    );
  });

  it("converts bridge decimals to base units without floating point loss", () => {
    expect(bridgeDecimalToBaseUnits("1")).toBe("1000000000000000000");
    expect(bridgeDecimalToBaseUnits("0.000000000000000001")).toBe("1");
    expect(bridgeDecimalToBaseUnits("123456789.123456789123456789")).toBe(
      "123456789123456789123456789",
    );
    expect(formatBaseUnitAmount("1000000000000000000")).toBe("1");
    expect(formatBaseUnitAmount("100000000000000")).toBe("0.0001");
    expect(formatTronSunBalance("1234567")).toBe("1.234567");
    expect(() => bridgeDecimalToBaseUnits("1.0000000000000000001")).toThrow(
      /positive decimal/,
    );
    expect(() => bridgeDecimalToBaseUnits("1", 37)).toThrow(/unsupported/);
    expect(() => formatBaseUnitAmount("-1")).toThrow(/non-negative integer/);
  });

  it("normalizes SCCP message IDs and TRON transaction IDs before fetches", () => {
    expect(normalizeSccpMessageId(` 0X${"AB".repeat(32)} `)).toBe(
      `0x${"ab".repeat(32)}`,
    );
    expect(isValidSccpMessageId(`0x${"11".repeat(32)}`)).toBe(true);
    expect(normalizeSccpMessageId("11".repeat(32))).toBe(
      `0x${"11".repeat(32)}`,
    );
    expect(isValidSccpMessageId("11".repeat(32))).toBe(true);
    expect(normalizeTronTransactionId(` 0X${"CD".repeat(32)} `)).toBe(
      "cd".repeat(32),
    );
    expect(isValidTronTransactionId("ef".repeat(32))).toBe(true);
    expect(isValidTronTransactionId("0x1234")).toBe(false);
  });

  it("normalizes supported TRON SCCP network ids by profile", () => {
    expect(SCCP_TRON_NETWORK.key).toBe("nile");
    expect(normalizeSccpTronNetworkKey("")).toBe("mainnet");
    expect(normalizeSccpTronNetworkKey(" tron-nile ")).toBe("nile");
    expect(() => normalizeSccpTronNetworkKey("shasta")).toThrow(
      /mainnet or nile/,
    );
    expect(normalizeTronNetworkIdHex(TRON_NILE_CHAIN_ID_HEX)).toBe(
      TRON_NILE_NETWORK_ID_HEX,
    );
    expect(
      normalizeTronNetworkIdHex(` ${TRON_MAINNET_CHAIN_ID_HEX} `, "mainnet"),
    ).toBe(TRON_MAINNET_NETWORK_ID_HEX);
    expect(
      normalizeTronNetworkIdHex(
        ` ${TRON_MAINNET_NETWORK_ID_HEX.toUpperCase()} `,
        "mainnet",
      ),
    ).toBe(TRON_MAINNET_NETWORK_ID_HEX);
    expect(normalizeTronNetworkIdHex(TRON_NILE_CHAIN_ID_HEX, "nile")).toBe(
      TRON_NILE_NETWORK_ID_HEX,
    );
    expect(normalizeTronNetworkIdHex(TRON_NILE_NETWORK_ID_HEX, "nile")).toBe(
      TRON_NILE_NETWORK_ID_HEX,
    );
    expect(() => normalizeTronNetworkIdHex(HEX32_C)).toThrow(/Nile/);
    expect(() =>
      normalizeTronNetworkIdHex(TRON_MAINNET_NETWORK_ID_HEX),
    ).toThrow(/Nile/);
    expect(() =>
      normalizeTronNetworkIdHex(TRON_MAINNET_NETWORK_ID_HEX, "nile"),
    ).toThrow(/Nile/);
  });

  it("resolves TRON gateway endpoints from selected route manifests", () => {
    expect(readSccpTronGatewayEndpoint(READY_TRON_MANIFEST)).toBe(
      TRON_MAINNET_RPC_URL,
    );
    expect(readSccpTronGatewayEndpoint(READY_NILE_TRON_MANIFEST)).toBe(
      TRON_NILE_RPC_URL,
    );
    expect(readSccpTronGatewayEndpoint({ chain: "tron-nile" })).toBe(
      TRON_NILE_RPC_URL,
    );
    expect(readSccpTronGatewayEndpoint(null, "nile")).toBe(TRON_NILE_RPC_URL);
  });

  it("requires a production mainnet or explicit selected-testnet TRON manifest for route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const manifestSet = {
      manifests: [
        {
          counterparty_domain: SCCP_TRON_DOMAIN,
          verifier_target: "TronContract",
          production_ready: true,
          route_id: "taira_tron_xor",
          asset_id: "xor",
          ...READY_TRON_MANIFEST,
        },
      ],
    };

    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet,
        tronNetwork: "mainnet",
      }).ready,
    ).toBe(true);
    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities: {
          submit: {
            proof: "/v1/bridge/proofs/submit",
            message: "/v1/bridge/messages",
          },
        },
        manifestSet: {
          items: manifestSet.manifests,
        },
        tronNetwork: "mainnet",
      }).ready,
    ).toBe(true);
    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities: {
          paths: {
            proofSubmitPath: "/v1/bridge/proofs/submit",
            messageSubmitPath: "/v1/bridge/messages",
          },
        },
        manifestSet: {
          routes: manifestSet.manifests,
        },
        tronNetwork: "mainnet",
      }).ready,
    ).toBe(true);
    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet: {
          proof_manifests: manifestSet.manifests,
        },
        tronNetwork: "mainnet",
      }).ready,
    ).toBe(true);
    const nileDraftReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_NILE_TRON_MANIFEST],
      },
      tronNetwork: "nile",
    });
    expect(nileDraftReadiness.ready).toBe(true);
    const nileDraftAsMainnetReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_NILE_TRON_MANIFEST],
      },
      tronNetwork: "mainnet",
    });
    expect(nileDraftAsMainnetReadiness.ready).toBe(false);
    expect(nileDraftAsMainnetReadiness.reasons.join(" ")).toContain(
      "taira_tron_xor",
    );
    const untaggedNileDraftReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_NILE_TRON_MANIFEST,
            tronNetwork: undefined,
            chain: undefined,
          },
        ],
      },
      tronNetwork: "nile",
    });
    expect(untaggedNileDraftReadiness.ready).toBe(false);
    expect(untaggedNileDraftReadiness.reasons.join(" ")).toMatch(
      /test rollout/,
    );
    const mainnetDraftReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            productionReady: false,
            disabledReason: "mainnet route is still staged.",
            postDeployLiveEvidence: undefined,
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(mainnetDraftReadiness.ready).toBe(false);
    expect(mainnetDraftReadiness.reasons.join(" ")).toMatch(/still staged/);
    const whitespaceCapabilities = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: {
        proofSubmitPath: " ",
        message_submit_path: "\t",
      },
      manifestSet,
    });
    expect(whitespaceCapabilities.ready).toBe(false);
    expect(whitespaceCapabilities.reasons.join(" ")).toMatch(
      /missing SCCP submit endpoints/,
    );
    for (const [unsafeCapabilities, reason] of [
      [
        {
          proofSubmitPath: "https://evil.example/v1/bridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /same-endpoint absolute path/,
      ],
      [
        {
          proofSubmitPath: "/v1/bridge/proofs/submit#debug",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /query strings|fragments/,
      ],
      [
        {
          proofSubmitPath: "/wallet/broadcasttransaction",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /SCCP or bridge endpoint/,
      ],
      [
        {
          proofSubmitPath: "/v1/bridge/proofs%2fsubmit",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /encoded path separators/,
      ],
      [
        {
          proofSubmitPath: "/v1/bridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/proofs/submit",
        },
        /bridge-message submission endpoint/,
      ],
    ] as const) {
      const unsafeReadiness = resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities: unsafeCapabilities,
        manifestSet,
      });
      expect(unsafeReadiness.ready).toBe(false);
      expect(unsafeReadiness.reasons.join(" ")).toMatch(reason);
    }
    const stringProductionReady = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: "false",
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(stringProductionReady.ready).toBe(false);
    expect(stringProductionReady.reasons.join(" ")).toMatch(
      /production-ready flag is invalid/,
    );
    for (const [manifestOverride, reason] of [
      [
        {
          postDeployLiveEvidence: undefined,
        },
        /post-deploy live evidence is missing/,
      ],
      [
        {
          postDeployLiveEvidence: {
            ...READY_TRON_MANIFEST.postDeployLiveEvidence,
            sourceEventTransactionId: undefined,
          },
        },
        /sourceEventTransactionId/,
      ],
      [
        {
          postDeployLiveEvidence: {
            ...READY_TRON_MANIFEST.postDeployLiveEvidence,
            routeCanaryEvidenceHash: `0x${"00".repeat(32)}`,
          },
        },
        /routeCanaryEvidenceHash.*non-zero/,
      ],
    ] as const) {
      const missingLiveEvidence = resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet: {
          manifests: [
            {
              counterpartyDomain: SCCP_TRON_DOMAIN,
              verifierTarget: "TronContract",
              productionReady: true,
              routeId: "taira_tron_xor",
              assetKey: "xor",
              ...READY_TRON_MANIFEST,
              ...manifestOverride,
            },
          ],
        },
        tronNetwork: "mainnet",
      });
      expect(missingLiveEvidence.ready).toBe(false);
      expect(missingLiveEvidence.reasons.join(" ")).toMatch(reason);
    }
    const genericTronManifest = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            ...READY_TRON_MANIFEST,
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(genericTronManifest.ready).toBe(false);
    expect(genericTronManifest.reasons.join(" ")).toContain("taira_tron_xor");
    const missingVerifierMaterial = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            tronBridgeAddress: VALID_TRON_ADDRESS,
            tronTokenAddress: TRON_TOKEN_ADDRESS,
            ...BURN_RECORD_MATERIAL,
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(missingVerifierMaterial.ready).toBe(false);
    expect(missingVerifierMaterial.reasons.join(" ")).toMatch(
      /verifier rollout proof material|destination binding/i,
    );
    const mismatchedBinding = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            destinationBinding: {
              version: 1,
              key: TRON_DESTINATION_BINDING.key,
              bindingHash: HEX32_A,
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(mismatchedBinding.ready).toBe(false);
    expect(mismatchedBinding.reasons.join(" ")).toMatch(/bindingHash/i);
    const wrongBindingDomains = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            destinationBinding: {
              ...READY_TRON_MANIFEST.destinationBinding,
              sourceDomain: SCCP_TRON_DOMAIN,
              targetDomain: SCCP_SORA_DOMAIN,
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(wrongBindingDomains.ready).toBe(false);
    expect(wrongBindingDomains.reasons.join(" ")).toMatch(
      /destination binding source domain is wrong/i,
    );
    const wrongBindingTargetDomain = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            destinationBinding: {
              ...READY_TRON_MANIFEST.destinationBinding,
              sourceDomain: SCCP_SORA_DOMAIN,
              targetDomain: SCCP_SORA_DOMAIN,
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(wrongBindingTargetDomain.ready).toBe(false);
    expect(wrongBindingTargetDomain.reasons.join(" ")).toMatch(
      /destination binding target domain is wrong/i,
    );
    const invalidDeploymentAddresses = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            tronBridgeAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv9",
            tronTokenAddress: "0x" + "11".repeat(20),
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(invalidDeploymentAddresses.ready).toBe(false);
    expect(invalidDeploymentAddresses.reasons.join(" ")).toMatch(
      /bridge deployment address is invalid/i,
    );
    expect(invalidDeploymentAddresses.reasons.join(" ")).toMatch(
      /token deployment address is invalid/i,
    );
    const missingSourceBridgeAddress = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            sccpTronSourceBridgeAddress: "",
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(missingSourceBridgeAddress.ready).toBe(false);
    expect(missingSourceBridgeAddress.reasons.join(" ")).toMatch(
      /source bridge deployment address is missing/i,
    );
    const missingVerifierAddress = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            destinationRollout: {
              ...READY_TRON_MANIFEST.destinationRollout,
              verifierIdentity: "",
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(missingVerifierAddress.ready).toBe(false);
    expect(missingVerifierAddress.reasons.join(" ")).toMatch(
      /verifier deployment address is missing/i,
    );
    const invalidVerifierAddress = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            destinationRollout: {
              ...READY_TRON_MANIFEST.destinationRollout,
              verifierIdentity: "TGCAjMXComunWZEXCT1LPBdcYbDVuyexBz",
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(invalidVerifierAddress.ready).toBe(false);
    expect(invalidVerifierAddress.reasons.join(" ")).toMatch(
      /verifier deployment address is invalid/i,
    );
    const duplicateDeploymentAddresses = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            tronTokenAddress: VALID_TRON_ADDRESS,
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(duplicateDeploymentAddresses.ready).toBe(false);
    expect(duplicateDeploymentAddresses.reasons.join(" ")).toMatch(
      /contract addresses must be distinct/i,
    );
    const invalidBurnRecordGas = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            tairaXorBurnRecord: {
              ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
              gasLimit: -1,
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(invalidBurnRecordGas.ready).toBe(false);
    expect(invalidBurnRecordGas.reasons.join(" ")).toMatch(/burn-record/);
    const aliasBurnRecordAsset = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            tairaXorBurnRecord: {
              ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
              settlementAssetDefinitionId: "xor#universal",
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(aliasBurnRecordAsset.ready).toBe(false);
    expect(aliasBurnRecordAsset.reasons.join(" ")).toMatch(
      /canonical asset definition id/i,
    );
    const malformedBurnRecordArtifact = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "taira_tron_xor",
            assetKey: "xor",
            ...READY_TRON_MANIFEST,
            tairaXorBurnRecord: {
              ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
              contractArtifactB64: "not base64",
            },
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(malformedBurnRecordArtifact.ready).toBe(false);
    expect(malformedBurnRecordArtifact.reasons.join(" ")).toMatch(
      /strict base64/i,
    );
    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: "00000000-0000-0000-0000-000000000000",
          networkPrefix: 753,
        },
        capabilities,
        manifestSet,
      }).ready,
    ).toBe(false);
  });

  it("builds TRON burn trigger requests from route manifest material", () => {
    const request = buildTairaXorBurnTriggerRequest({
      manifest: {
        tronBridgeAddress: VALID_TRON_ADDRESS,
      },
      ownerAddress: VALID_TRON_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: "1.5",
      feeLimit: 150_000_000,
    });

    expect(request).toMatchObject({
      endpoint: TRON_NILE_RPC_URL,
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: VALID_TRON_ADDRESS,
      functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
      feeLimit: 150_000_000,
    });
    expect(request.callData).toBe(
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: TAIRA_SENDER,
        amount: bridgeDecimalToBaseUnits("1.5"),
      }),
    );
    expect(
      buildTairaXorBurnTriggerRequest({
        manifest: READY_NILE_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "1",
      }).endpoint,
    ).toBe(TRON_NILE_RPC_URL);
    expect(() =>
      buildTairaXorBurnTriggerRequest({
        manifest: {},
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "1",
      }),
    ).toThrow(/deployment address/);
    expect(() =>
      buildTairaXorBurnTriggerRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
        },
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: MINAMOTO_ACCOUNT_ID,
        amountDecimal: "1",
      }),
    ).toThrow(/canonical TAIRA I105/);
    expect(() =>
      buildTairaXorBurnTriggerRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
        },
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: `0x${"11".repeat(32)}`,
        amountDecimal: "1",
      }),
    ).toThrow(/canonical TAIRA I105|canonical text/);
    for (const feeLimit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        buildTairaXorBurnTriggerRequest({
          manifest: {
            tronBridgeAddress: VALID_TRON_ADDRESS,
          },
          ownerAddress: VALID_TRON_ADDRESS,
          tairaRecipient: TAIRA_SENDER,
          amountDecimal: "1",
          feeLimit,
        }),
      ).toThrow(/fee limit.*positive safe integer/i);
    }
  });

  it("rejects raw-recipient forms for account-only TRON burn calldata", () => {
    expect(
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: TAIRA_SENDER,
        amount: bridgeDecimalToBaseUnits("0.0001"),
      }),
    ).toBe(
      tairaXorBurnToTairaCallData({
        tairaRecipient: TAIRA_SENDER,
        amount: bridgeDecimalToBaseUnits("0.0001"),
      }),
    );
    expect(() =>
      tairaXorBurnToTairaAccountCallData({
        tairaRecipientBytes: new TextEncoder().encode(TAIRA_SENDER),
        amount: 1,
      } as never),
    ).toThrow(/tairaRecipientBytes is not accepted/);
    expect(() =>
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: new TextEncoder().encode(TAIRA_SENDER) as never,
        amount: 1,
      }),
    ).toThrow(/canonical TAIRA I105 account id string/);
    expect(() =>
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: `0x${"11".repeat(32)}`,
        amount: 1,
      }),
    ).toThrow(/canonical TAIRA I105 account id string/);
    expect(() =>
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: "alice@taira",
        amount: 1,
      }),
    ).toThrow(/canonical TAIRA I105 account id/);
  });

  it("builds TRON token balance requests and parses account/token balances", () => {
    const request = buildTairaXorTokenBalanceRequest({
      manifest: { tronTokenAddress: VALID_TRON_ADDRESS },
      ownerAddress: VALID_TRON_ADDRESS,
    });

    expect(request).toEqual({
      endpoint: TRON_NILE_RPC_URL,
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: VALID_TRON_ADDRESS,
      functionSelector: "balanceOf(address)",
      parameter: tronAbiAddressWord(VALID_TRON_ADDRESS),
    });
    expect(
      buildTairaXorTokenBalanceRequest({
        manifest: READY_NILE_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
      }).endpoint,
    ).toBe(TRON_NILE_RPC_URL);
    expect(readTronAccountBalanceSun({ balance: 1234567 })).toBe("1234567");
    expect(readTronAccountBalanceSun({})).toBe("0");
    expect(
      readTronConstantUint256({
        result: { result: true },
        constant_result: ["0".repeat(63) + "f"],
      }),
    ).toBe("15");

    expect(() =>
      buildTairaXorTokenBalanceRequest({
        manifest: {},
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/token deployment address/);
    expect(() =>
      buildTairaXorTokenBalanceRequest({
        manifest: { tronTokenAddress: VALID_TRON_ADDRESS },
        ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv9",
      }),
    ).toThrow(/checksum|Base58Check/);
    expect(() =>
      readTronConstantUint256({
        result: { result: false, message: "REVERT" },
        constant_result: ["0".repeat(64)],
      }),
    ).toThrow(/REVERT/);
    expect(() =>
      readTronConstantUint256({ constant_result: ["0x1234"] }),
    ).toThrow(/malformed uint256/);
  });

  it("binds WalletConnect-signed TRON transactions before broadcast", () => {
    const mutableSignedTransaction = sampleSignedTronTriggerTransaction();
    const boundSnapshot = bindSignedTronTransactionForBroadcast({
      unsignedTransaction: sampleTronTriggerTransaction(),
      signedTransaction: mutableSignedTransaction,
      ownerAddress: VALID_TRON_ADDRESS,
    });
    (mutableSignedTransaction.signature as string[])[0] = "34".repeat(65);
    (
      (
        (
          (mutableSignedTransaction.raw_data as Record<string, unknown>)
            .contract as Array<Record<string, unknown>>
        )[0].parameter as Record<string, unknown>
      ).value as Record<string, unknown>
    ).data = "feedface";
    expect(boundSnapshot.transaction).toMatchObject({
      signature: [signTronRawDataHex(DEFAULT_TRON_RAW_DATA_HEX)],
      raw_data: {
        contract: [
          {
            parameter: {
              value: {
                data: "abcdef",
              },
            },
          },
        ],
      },
    });

    expect(
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      transaction: {
        txID: TRON_TX_ID,
        signature: [signTronRawDataHex(DEFAULT_TRON_RAW_DATA_HEX)],
      },
    });

    const rawDataHex = buildTronTriggerRawDataHex({
      ownerAddress: SIGNING_TRON_ADDRESS,
      dataHex: "abcdef",
      feeLimit: 50_000_001n,
    });
    const rawDataTxId = tronTxIdFromRawDataHex(rawDataHex);
    expect(
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.txID = rawDataTxId;
          transaction.raw_data_hex = rawDataHex;
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.txID = rawDataTxId;
          transaction.raw_data_hex = rawDataHex;
          transaction.signature = [signTronRawDataHex(rawDataHex)];
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        ownerAddress: SIGNING_TRON_ADDRESS,
      }),
    ).toMatchObject({ txId: rawDataTxId });

    const signingRawDataHex = buildTronTriggerRawDataHex({
      ownerAddress: SIGNING_TRON_ADDRESS,
      dataHex: "abcdef",
      feeLimit: 50_000_002n,
    });
    const signingRawDataTxId = tronTxIdFromRawDataHex(signingRawDataHex);
    const signedByConnectedWallet = bindSignedTronTransactionForBroadcast({
      unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
        transaction.txID = signingRawDataTxId;
        transaction.raw_data_hex = signingRawDataHex;
        (
          (
            (
              (transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>
        ).owner_address = bytesToHex(
          decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
        );
      }),
      signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
        transaction.txID = signingRawDataTxId;
        transaction.raw_data_hex = signingRawDataHex;
        transaction.signature = [signTronRawDataHex(signingRawDataHex)];
        (
          (
            (
              (transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>
        ).owner_address = bytesToHex(
          decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
        );
      }),
      ownerAddress: SIGNING_TRON_ADDRESS,
    });
    expect(signedByConnectedWallet).toMatchObject({
      txId: signingRawDataTxId,
      transaction: {
        signature: [signTronRawDataHex(signingRawDataHex)],
      },
    });

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.txID = signingRawDataTxId;
          transaction.raw_data_hex = signingRawDataHex;
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.txID = signingRawDataTxId;
          transaction.raw_data_hex = signingRawDataHex;
          transaction.signature = [
            signTronRawDataHex(
              signingRawDataHex,
              WRONG_SIGNING_TRON_PRIVATE_KEY,
            ),
          ];
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        ownerAddress: SIGNING_TRON_ADDRESS,
      }),
    ).toThrow(/signature.*connected wallet/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.txID = signingRawDataTxId;
          transaction.raw_data_hex = signingRawDataHex;
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          const nonCanonical = hexToBytes(
            signTronRawDataHex(signingRawDataHex),
          );
          nonCanonical[64] = 31;
          transaction.txID = signingRawDataTxId;
          transaction.raw_data_hex = signingRawDataHex;
          transaction.signature = [bytesToHex(nonCanonical).slice(2)];
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = bytesToHex(
            decodeTronBase58CheckAddress(SIGNING_TRON_ADDRESS),
          );
        }),
        ownerAddress: SIGNING_TRON_ADDRESS,
      }),
    ).toThrow(/canonical recoverable signature/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.signature = ["12".repeat(65)];
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/must not already contain signatures/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.signature = [];
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/must not already contain signatures/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          delete transaction.raw_data_hex;
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Unsigned TRON transaction must include raw_data_hex/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          delete transaction.raw_data_hex;
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Signed TRON transaction must include raw_data_hex/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.txID = "bb".repeat(32);
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/transaction id/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.signature = [];
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/signatures/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = "410000000000000000000000000000000000000000";
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/owner|non-zero/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).data = "feedface";
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/raw data.*unsigned bridge transaction/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: {
          ...sampleSignedTronTriggerTransaction(),
          debug: () => "not JSON",
        },
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/structured-cloneable/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.privateKeyHex = "11".repeat(32);
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Signed TRON transaction\.privateKeyHex.*private key material/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.signature_b64 = "already-signed";
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Signed TRON transaction\.signature_b64.*signing helper/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).note = VALID_MNEMONIC;
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/note.*recovery phrases/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).walletSignature = "11".repeat(65);
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Unsigned TRON transaction.*walletSignature.*signing helper/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdef";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdef";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
          transaction.signature = [signTronRawDataHex("abcdef")];
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).data = "feedface";
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/raw data.*unsigned bridge transaction/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdef";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdee";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/raw data.*unsigned bridge transaction/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdef";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
          delete transaction.raw_data;
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "abcdef";
          transaction.txID = tronTxIdFromRawDataHex("abcdef");
          transaction.signature = [signTronRawDataHex("abcdef")];
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/preserve the unsigned raw transaction data/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "010203";
        }),
        signedTransaction: sampleSignedTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "010203";
        }),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/raw_data_hex.*transaction id/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          delete transaction.raw_data;
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/preserve the unsigned raw transaction data/);

    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction((transaction) => {
          delete transaction.txID;
        }),
        signedTransaction: sampleSignedTronTriggerTransaction(),
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Unsigned TRON transaction tx id/);
  });

  it("binds unsigned TRON gateway transactions to the requested bridge trigger before signing", () => {
    const trigger = {
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: VALID_TRON_ADDRESS,
      functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
      callData: "0xabcdef",
      feeLimit: 100_000_000,
    };
    const mutableUnsignedTransaction = sampleTronTriggerTransaction();
    const boundSnapshot = bindUnsignedTronSmartContractTransaction({
      transaction: mutableUnsignedTransaction,
      trigger,
    });
    (
      (
        (
          (mutableUnsignedTransaction.raw_data as Record<string, unknown>)
            .contract as Array<Record<string, unknown>>
        )[0].parameter as Record<string, unknown>
      ).value as Record<string, unknown>
    ).data = "feedface";
    expect(boundSnapshot).toMatchObject({
      txId: TRON_TX_ID,
      transaction: {
        raw_data: {
          contract: [
            {
              parameter: {
                value: {
                  data: "abcdef",
                },
              },
            },
          ],
        },
      },
    });
    expect(
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          const value = (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          );
          value.owner_address = VALID_TRON_ADDRESS;
          value.contract_address = VALID_TRON_ADDRESS;
        }),
        trigger,
      }).txId,
    ).toBe(TRON_TX_ID);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleSignedTronTriggerTransaction(),
        trigger,
      }),
    ).toThrow(/must not already contain signatures/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          transaction.privateKeyHex = "11".repeat(32);
        }),
        trigger,
      }),
    ).toThrow(/Unsigned TRON transaction\.privateKeyHex.*private key material/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).signature_b64 = "already-signed";
        }),
        trigger,
      }),
    ).toThrow(/Unsigned TRON transaction.*signature_b64.*signing helper/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).owner_address = `41${"22".repeat(20)}`;
        }),
        trigger,
      }),
    ).toThrow(/owner.*connected wallet/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).contract_address = `41${"22".repeat(20)}`;
        }),
        trigger,
      }),
    ).toThrow(/contract.*requested bridge contract/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          (
            (
              (
                (transaction.raw_data as Record<string, unknown>)
                  .contract as Array<Record<string, unknown>>
              )[0].parameter as Record<string, unknown>
            ).value as Record<string, unknown>
          ).data = "feedface";
        }),
        trigger,
      }),
    ).toThrow(/call data.*requested bridge action/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          const contract = (
            (transaction.raw_data as Record<string, unknown>).contract as Array<
              Record<string, unknown>
            >
          )[0];
          const parameter = contract.parameter as Record<string, unknown>;
          delete contract.type;
          delete parameter.type_url;
        }),
        trigger,
      }),
    ).toThrow(/TriggerSmartContract/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          (
            (transaction.raw_data as Record<string, unknown>).contract as Array<
              Record<string, unknown>
            >
          ).push({
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
                data: "abcdef",
              },
            },
          });
        }),
        trigger,
      }),
    ).toThrow(/exactly one smart-contract call/);

    expect(() =>
      bindUnsignedTronSmartContractTransaction({
        transaction: sampleTronTriggerTransaction((transaction) => {
          transaction.raw_data_hex = "010203";
        }),
        trigger,
      }),
    ).toThrow(/raw_data_hex.*transaction id/);
  });

  it("binds accepted TRON broadcast responses before completion", () => {
    expect(
      bindTronBroadcastResult({
        response: {
          result: true,
          txid: TRON_TX_ID,
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      response: {
        result: true,
        txid: TRON_TX_ID,
      },
    });

    expect(() =>
      bindTronBroadcastResult({
        response: {
          result: false,
          code: "SIGERROR",
          message: "bad signature",
          txid: TRON_TX_ID,
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toThrow(/not accepted.*SIGERROR.*bad signature/);

    expect(() =>
      bindTronBroadcastResult({
        response: {
          result: true,
          txid: "bb".repeat(32),
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toThrow(/does not match/);

    expect(() =>
      bindTronBroadcastResult({
        response: {
          result: true,
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toThrow(/missing transaction id/);

    expect(() =>
      bindTronBroadcastResult({
        response: {
          result: "true",
          txid: TRON_TX_ID,
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toThrow(/not accepted/);

    expect(() =>
      bindTronBroadcastResult({
        response: {
          txid: TRON_TX_ID,
        },
        expectedTxId: TRON_TX_ID,
      }),
    ).toThrow(/not accepted/);
  });

  it("binds TRON finality data before source-proof work", () => {
    const mutableFinality = sampleTronFinalityData();
    const boundFinality = bindTronFinalitySnapshot(mutableFinality);
    (mutableFinality.solidBlock as Record<string, unknown>).blockID =
      "aa".repeat(32);
    expect(boundFinality).toMatchObject({
      solidBlockNumber: TRON_SOLID_BLOCK_NUMBER,
      solidBlockHash: TRON_SOLID_BLOCK_ID,
      witnessCount: 1,
    });
    expect(
      (boundFinality.finality.solidBlock as Record<string, unknown>).blockID,
    ).toBe(TRON_SOLID_BLOCK_ID);

    expect(() =>
      bindTronFinalitySnapshot(
        sampleTronFinalityData((finality) => {
          (finality.solidBlock as Record<string, unknown>).blockID =
            "00".repeat(32);
        }),
      ),
    ).toThrow(/block hash/);

    expect(() =>
      bindTronFinalitySnapshot(
        sampleTronFinalityData((finality) => {
          (finality.solidBlock as Record<string, unknown>).blockID =
            `0x${"0d".padStart(16, "0")}${"66".repeat(24)}`;
        }),
      ),
    ).toThrow(/block ID.*solid block number/);

    expect(
      bindTronFinalitySnapshot(
        sampleTronFinalityData((finality) => {
          const solidBlock = finality.solidBlock as Record<string, unknown>;
          delete solidBlock.blockID;
          solidBlock.hash = HEX32_F;
        }),
      ),
    ).toMatchObject({
      solidBlockHash: HEX32_F,
      solidBlockNumber: TRON_SOLID_BLOCK_NUMBER,
    });

    expect(() =>
      bindTronFinalitySnapshot(
        sampleTronFinalityData((finality) => {
          finality.witnesses = { witnesses: [] };
        }),
      ),
    ).toThrow(/active witnesses/);

    expect(() =>
      bindTronFinalitySnapshot({
        ...sampleTronFinalityData(),
        debug: () => "not cloneable",
      }),
    ).toThrow(/structured-cloneable/);
  });

  it("binds coherent TRON source data before TAIRA settlement proof generation", () => {
    const TRON_TX_ID = TRON_SOURCE_TX_ID;
    const source = sampleTronSourceData();

    expect(
      bindTronSourceDataForProof({
        txId: TRON_TX_ID,
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...source,
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
      receiptBlockNumber: 10,
      solidBlockNumber: TRON_SOLID_BLOCK_NUMBER,
      solidBlockHash: TRON_SOLID_BLOCK_ID,
    });

    expect(
      bindTronSourceDataForProof({
        txId: TRON_TX_ID,
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...sampleTronSourceData((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.event_name = "BurnToTaira";
        }),
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    });

    expect(
      bindTronSourceDataForProof({
        txId: TRON_TX_ID,
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...sampleTronSourceData((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          const result = event.result as Record<string, unknown>;
          result.tairaRecipient = String(result.tairaRecipient).replace(
            /^0x/u,
            "",
          );
        }),
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    });

    expect(
      bindTronSourceDataForProof({
        txId: TRON_TX_ID,
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...sampleTronSourceData((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          const result = event.result as Record<string, unknown>;
          result.source_event_digest = String(result.sourceEventDigest).replace(
            /^0x/u,
            "",
          );
        }),
      }),
    ).toMatchObject({
      txId: TRON_TX_ID,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    });

    const sourceRawDataHex = buildTronTriggerRawDataHex({
      dataHex: TRON_BURN_CALL_DATA,
      feeLimit: 50_000_003n,
    });
    const sourceRawDataTxId = tronTxIdFromRawDataHex(sourceRawDataHex);
    expect(
      bindTronSourceDataForProof({
        txId: sourceRawDataTxId,
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...sampleTronSourceData((next) => {
          next.transaction.txID = sourceRawDataTxId;
          next.transaction.raw_data_hex = sourceRawDataHex;
          next.transaction.signature = [signTronRawDataHex(sourceRawDataHex)];
          next.receipt.id = sourceRawDataTxId;
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.transaction_id = sourceRawDataTxId;
        }),
      }),
    ).toMatchObject({
      txId: sourceRawDataTxId,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
    });

    const mutableSource = sampleTronSourceData();
    const boundSource = bindTronSourceDataForProof({
      txId: TRON_TX_ID,
      bridgeAddress: VALID_TRON_ADDRESS,
      tronSender: VALID_TRON_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: "0.0001",
      ...mutableSource,
    });
    (
      (
        (
          (mutableSource.transaction.raw_data as Record<string, unknown>)
            .contract as Array<Record<string, unknown>>
        )[0].parameter as Record<string, unknown>
      ).value as Record<string, unknown>
    ).data = "feedface";
    (mutableSource.events.data as Record<string, unknown>[])[0].event_name =
      "Approval";
    (mutableSource.finality.solidBlock as Record<string, unknown>).blockID =
      "aa".repeat(32);
    expect(
      (
        (
          (
            (boundSource.transaction.raw_data as Record<string, unknown>)
              .contract as Array<Record<string, unknown>>
          )[0].parameter as Record<string, unknown>
        ).value as Record<string, unknown>
      ).data,
    ).toBe(TRON_BURN_CALL_DATA);
    expect(
      (boundSource.events.data as Record<string, unknown>[])[0],
    ).toMatchObject({
      event_name: "TairaXorBurnStarted",
    });
    expect(
      (boundSource.finality.solidBlock as Record<string, unknown>).blockID,
    ).toBe(TRON_SOLID_BLOCK_ID);

    expect(() =>
      bindTronSourceDataForProof({
        txId: TRON_TX_ID,
        ...sampleTronSourceData(),
      } as unknown as Parameters<typeof bindTronSourceDataForProof>[0]),
    ).toThrow(/TRON bridge address is required/);

    expect(() =>
      bindTronSourceDataForProof({
        bridgeAddress: VALID_TRON_ADDRESS,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "0.0001",
        ...sampleTronSourceData(),
      } as unknown as Parameters<typeof bindTronSourceDataForProof>[0]),
    ).toThrow(/txId/);

    expect(() =>
      bindTronSourceDataForProof({
        ...sampleBoundTronSourceDataInput(),
        tronSender: "",
      }),
    ).toThrow(/TRON sender address is required/);

    expect(() =>
      bindTronSourceDataForProof({
        ...sampleBoundTronSourceDataInput(),
        tairaRecipient: "",
      }),
    ).toThrow(/TAIRA recipient account is required/);

    expect(() =>
      bindTronSourceDataForProof({
        ...sampleBoundTronSourceDataInput(),
        amountDecimal: "",
      }),
    ).toThrow(/Bridge amount is required/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          next.events.debug = () => "not cloneable";
        }),
      ),
    ).toThrow(/TRON transaction events.*structured-cloneable/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).burner =
            `0x41${"22".repeat(20)}`;
        }),
      ),
    ).toThrow(/burner.*connected wallet/);

    expect(() =>
      bindTronSourceDataForProof({
        ...sampleBoundTronSourceDataInput(),
        amountDecimal: "0.0002",
      }),
    ).toThrow(/amount.*bridge request/);

    expect(() =>
      bindTronSourceDataForProof({
        ...sampleBoundTronSourceDataInput(),
        tairaRecipient: AccountAddress.fromAccount({
          publicKey: Uint8Array.from({ length: 32 }, () => 0x34),
        }).toI105(TAIRA_NETWORK_PREFIX),
      }),
    ).toThrow(/TAIRA recipient.*bridge request/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).nonce = "10";
        }),
      ),
    ).toThrow(/burn event digest.*event fields/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          delete (event.result as Record<string, unknown>).nonce;
        }),
      ),
    ).toThrow(/burn nonce/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).source_event_digest =
            HEX32_A;
        }),
      ),
    ).toThrow(/source event digest.*conflict/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).routeIdHash = HEX32_A;
        }),
      ),
    ).toThrow(/route hash.*taira_tron_xor/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).assetKeyHash = HEX32_A;
        }),
      ),
    ).toThrow(/asset hash.*xor/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const value = (
            (
              (next.transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>;
          value.owner_address = `41${"22".repeat(20)}`;
        }),
      ),
    ).toThrow(/source transaction owner.*connected wallet/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const value = (
            (
              (next.transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>;
          value.contract_address = `41${"22".repeat(20)}`;
        }),
      ),
    ).toThrow(/source transaction contract.*bridge contract/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const value = (
            (
              (next.transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>;
          value.data = tairaXorBurnToTairaCallData({
            tairaRecipient: TAIRA_SENDER,
            amount: bridgeDecimalToBaseUnits("0.0002"),
          });
        }),
      ),
    ).toThrow(/source transaction call data.*bridge request/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          delete (event.result as Record<string, unknown>).burner;
        }),
      ),
    ).toThrow(/burner address/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          next.receipt.id = "bb".repeat(32);
        }),
      ),
    ).toThrow(/receipt id/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          (next.receipt.receipt as Record<string, unknown>).result = "REVERT";
        }),
      ),
    ).toThrow(/SUCCESS/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          next.events.data = [];
        }),
      ),
    ).toThrow(/at least one event/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).sourceEventDigest =
            undefined;
        }),
      ),
    ).toThrow(/source event digest/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.contract_address = `41${"11".repeat(20)}`;
        }),
      ),
    ).toThrow(/bridge contract/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).burner =
            `0x${"ff".repeat(12)}${bytesToHex(
              decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
            ).slice(4)}`;
        }),
      ),
    ).toThrow(/left-padded TRON address/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          (
            (
              (next.finality.solidBlock as Record<string, unknown>)
                .block_header as Record<string, unknown>
            ).raw_data as Record<string, unknown>
          ).number = 9;
          (next.finality.solidBlock as Record<string, unknown>).blockID =
            `0x${"09".padStart(16, "0")}${"66".repeat(24)}`;
        }),
      ),
    ).toThrow(/not finalized/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.event_name = "Approval";
        }),
      ),
    ).toThrow(/TAIRA XOR burn bridge event/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          delete event.event_name;
        }),
      ),
    ).toThrow(/TAIRA XOR burn bridge event/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.transaction_id = "not-a-tx";
        }),
      ),
    ).toThrow(/TRON event transaction id/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).sourceEventDigest =
            "00".repeat(32);
        }),
      ),
    ).toThrow(/source event digest.*non-zero/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          event.block_number = 11;
        }),
      ),
    ).toThrow(/event block number.*receipt/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          next.transaction.raw_data_hex = "010203";
        }),
      ),
    ).toThrow(/raw_data_hex.*transaction id/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          delete next.transaction.raw_data;
        }),
      ),
    ).toThrow(/decoded raw_data/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          delete next.receipt.blockNumber;
        }),
      ),
    ).toThrow(/receipt block number/);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          next.transaction.signature = [];
        }),
      ),
    ).toThrow(/signatures/);
  });

  it("reads TRON deployment evidence from normalized SCCP manifests", () => {
    const manifest = {
      tron_network: "mainnet",
      chain: "tron-mainnet",
      taira_xor_bridge_address: VALID_TRON_ADDRESS,
      taira_xor_token_address: TRON_TOKEN_ADDRESS,
      sccp_tron_source_bridge_address: TRON_SOURCE_BRIDGE_ADDRESS,
      destinationRollout: {
        verifierIdentity: TRON_VERIFIER_ADDRESS,
        verifierCodeHash: HEX32_A,
        verifierKeyHash: HEX32_B,
        destinationNetworkId: TRON_MAINNET_CHAIN_ID_HEX,
        destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
      },
    };

    expect(readSccpTronBridgeAddress(manifest)).toBe(VALID_TRON_ADDRESS);
    expect(readSccpTronTokenAddress(manifest)).toBe(TRON_TOKEN_ADDRESS);
    expect(readSccpTronSourceBridgeAddress(manifest)).toBe(
      TRON_SOURCE_BRIDGE_ADDRESS,
    );
    expect(readSccpTronProofMaterial(manifest)).toEqual({
      networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
      tronVerifierAddress: TRON_VERIFIER_ADDRESS,
      verifierCodeHashHex: HEX32_A,
      verifierKeyHashHex: HEX32_B,
      expectedDestinationBindingHashHex: TRON_DESTINATION_BINDING.bindingHash,
    });
    expect(
      readSccpTronProofMaterial(
        {
          ...manifest,
          tron_network: "nile",
          chain: "tron-nile",
          destinationRollout: {
            ...manifest.destinationRollout,
            destinationNetworkId: TRON_NILE_CHAIN_ID_HEX,
          },
        },
        "nile",
      ),
    ).toEqual({
      networkIdHex: TRON_NILE_NETWORK_ID_HEX,
      tronVerifierAddress: TRON_VERIFIER_ADDRESS,
      verifierCodeHashHex: HEX32_A,
      verifierKeyHashHex: HEX32_B,
      expectedDestinationBindingHashHex: TRON_DESTINATION_BINDING.bindingHash,
    });
    expect(
      readSccpTronProofMaterial({
        destinationRollout: {
          verifierIdentity: VALID_TRON_ADDRESS,
          verifierCodeHash: HEX32_A,
        },
      }),
    ).toBeNull();
    expect(
      readSccpTronProofMaterial({
        destinationRollout: {
          verifierIdentity: VALID_TRON_ADDRESS,
          verifierCodeHash: HEX32_A,
          verifierKeyHash: HEX32_B,
          destinationNetworkId: HEX32_C,
          destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
        },
      }),
    ).toBeNull();
  });

  it("reads TAIRA burn-record material and builds ZK IVM requests", () => {
    const manifest = {
      tronBridgeAddress: VALID_TRON_ADDRESS,
      ...BURN_RECORD_MATERIAL,
    };

    expect(readSccpTairaBurnRecordMaterial(manifest)).toEqual({
      settlementAssetDefinitionId: VALID_ASSET_DEFINITION_ID,
      contractArtifactB64: BURN_RECORD_ARTIFACT_B64,
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
      gasLimit: 123456,
    });

    const result = buildTairaXorOutboundBurnRecordRequest({
      manifest,
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(result.outbound.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.zkIvmRequest.request).toMatchObject({
      authority: TAIRA_SENDER,
      bytecode: BURN_RECORD_ARTIFACT_B64,
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
    });
    expect(result.zkIvmRequest.request.metadata).toMatchObject({
      gas_limit: 123456,
      contract_entrypoint: "burn_and_record",
      contract_payload: {
        sender: TAIRA_SENDER,
        settlement_asset: VALID_ASSET_DEFINITION_ID,
        amount: "2250000000000000000",
      },
    });
    expect(
      String(
        (
          result.zkIvmRequest.request.metadata.contract_payload as Record<
            string,
            unknown
          >
        ).record_instruction,
      ),
    ).toMatch(/^0x4e525430[0-9a-f]+$/u);
    expect(
      readSccpTairaBurnRecordMaterial({
        tairaXorBurnRecord: {
          ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
          gasLimit: 1.5,
        },
      }),
    ).toBeNull();
    expect(
      readSccpTairaBurnRecordMaterial({
        tairaXorBurnRecord: {
          ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
          settlementAssetDefinitionId: "xor#universal",
        },
      }),
    ).toBeNull();
    expect(
      readSccpTairaBurnRecordMaterial({
        tairaXorBurnRecord: {
          ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
          contractArtifactB64: "TnJ0MA==",
        },
      }),
    ).toBeNull();
    expect(
      readSccpTairaBurnRecordMaterial({
        tairaXorBurnRecord: {
          ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
          contractArtifactB64: "not base64",
        },
      }),
    ).toBeNull();
  });

  it("rejects unsafe or incomplete TAIRA burn-record request material", () => {
    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
        },
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/burn-record ZK contract material/);

    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
          tairaXorBurnRecord: {
            ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
            settlementAssetDefinitionId: "xor#universal",
          },
        },
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/canonical asset definition id/);

    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
          ...BURN_RECORD_MATERIAL,
        },
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
        authority: TAIRA_OTHER_ACCOUNT_ID,
      }),
    ).toThrow(/authority must match/i);
  });

  it("builds TAIRA to TRON canonical outbound previews from SDK bindings", () => {
    const preview = buildTairaXorOutboundPreview({
      manifest: {
        tronBridgeAddress: VALID_TRON_ADDRESS,
      },
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(preview.payload).toMatchObject({
      source_domain: 0,
      dest_domain: SCCP_TRON_DOMAIN,
      asset_id: "xor",
      amount: "2250000000000000000",
      recipient: VALID_TRON_ADDRESS,
      route_id: "taira_tron_xor",
    });
    expect(preview.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.payloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.contractPayloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.canonicalPayloadHex).toMatch(/^0x[0-9a-f]+$/u);
    expect(preview.recordDescriptor).toMatchObject({
      execution_kind: "ivm_proved_record_sccp_message_v1",
      chain_id: TAIRA_CHAIN_ID,
      network_prefix: TAIRA_NETWORK_PREFIX,
      message_id: preview.messageId,
      canonical_payload_hex: preview.canonicalPayloadHex,
      execution_requirements: {
        executable: "IvmProved",
        overlay_instruction: "RecordSccpMessage",
        settlement_instruction: "Burn<Numeric, Asset>",
        settlement_asset_selector: "nexus.fees.fee_asset_id",
        settlement_asset_key: "xor",
        settlement_account_binding:
          "burn.destination.account == payload.sender",
        settlement_amount_binding:
          "sum(whole-unit burns) >= sum(recorded amounts) per sender",
        proof_gate: "sccp_recording_proof_verified",
        normal_transaction_supported: false,
      },
    });
    expect(preview.recordDescriptor.record_instruction).toMatchObject({
      kind: "RecordSccpMessage",
      payload_bytes_hex: preview.canonicalPayloadHex,
    });
    expect(() =>
      buildTairaXorOutboundPreview({
        manifest: {},
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/deployment address/);
    expect(() =>
      buildTairaXorOutboundPreview({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
        },
        tairaSender: MINAMOTO_ACCOUNT_ID,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/canonical TAIRA I105/);
  });

  it("binds TAIRA message proof jobs to TRON finalize proof requests", () => {
    const binding = buildTairaXorFinalizeProofBinding({
      manifest: READY_TRON_MANIFEST,
      job: sampleTairaToTronJob({
        publicInputs: {
          ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
          destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
        },
      }),
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      payloadHash: TAIRA_TO_TRON_PAYLOAD_HASH,
      destinationBinding: {
        bindingHash: TRON_DESTINATION_BINDING.bindingHash,
        verifierAddress: TRON_VERIFIER_ADDRESS,
      },
    });
    expect(binding.witness.publicInputs).toMatchObject({
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      targetDomain: SCCP_TRON_DOMAIN,
    });
    expect(binding.witness.bundleBytes).toBeInstanceOf(Uint8Array);
    expect((binding.witness.bundleBytes as Uint8Array).length).toBeGreaterThan(
      100,
    );
  });

  it("uses TRON platform payload binding when job top-level binding is generic", () => {
    const binding = buildTairaXorFinalizeProofBinding({
      manifest: READY_TRON_MANIFEST,
      job: sampleTairaToTronJob({
        destinationBinding: {
          version: 1,
          key: "sccp:0:5:tron:tron-groth16-bn254-v1:4",
          bindingHash: HEX32_A,
        },
        submissionPackage: {
          platformPayload: {
            kind: "TronContractCall",
            value: {
              destinationBinding: {
                version: 1,
                key: TRON_DESTINATION_BINDING.key,
                bindingHash: TRON_DESTINATION_BINDING.bindingHash,
              },
              statementHash: HEX32_E,
            },
          },
        },
      }),
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding.destinationBinding.bindingHash).toBe(
      TRON_DESTINATION_BINDING.bindingHash,
    );
  });

  it("rejects mismatched top-level job binding when TRON platform payload omits binding", () => {
    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          destinationBinding: {
            version: 1,
            key: "sccp:0:5:tron:tron-groth16-bn254-v1:4",
            bindingHash: HEX32_A,
          },
          submissionPackage: {
            platformPayload: {
              kind: "tron_contract_call",
              value: {
                proofBytes: "0x01",
                publicInputs: {
                  messageId: TAIRA_TO_TRON_MESSAGE_ID,
                },
                statementHash: HEX32_B,
              },
            },
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(
      /destination binding does not match the TRON route manifest/i,
    );
  });

  it("accepts TRON codec recipient payload variants in proof jobs", () => {
    const baseTransfer = (
      sampleTairaToTronJob().payloadProjection as {
        value: Record<string, unknown>;
      }
    ).value;
    const recipientPayload = bytesToHex(
      decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
    );

    for (const payload of [recipientPayload.slice(2), VALID_TRON_ADDRESS]) {
      const binding = buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...baseTransfer,
              recipient: { kind: "TronBase58Check", payload },
            },
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      });

      expect(binding.messageId).toBe(TAIRA_TO_TRON_MESSAGE_ID);
    }
  });

  it("accepts normalized codec payloads in TAIRA message bundles", () => {
    const baseJob = sampleTairaToTronJob();
    const baseBundle = baseJob.bundle as Record<string, unknown>;
    const textHex = (value: string) =>
      bytesToHex(new TextEncoder().encode(value));
    const binding = buildTairaXorFinalizeProofBinding({
      manifest: READY_TRON_MANIFEST,
      job: sampleTairaToTronJob({
        bundle: {
          ...baseBundle,
          payload: {
            kind: "Transfer",
            value: {
              version: 1,
              source_domain: 0,
              dest_domain: SCCP_TRON_DOMAIN,
              nonce: "7",
              asset_home_domain: 0,
              asset_id_codec: SCCP_CODEC_TEXT_UTF8,
              asset_id: textHex("xor"),
              amount: BRIDGE_AMOUNT_BASE_UNITS,
              sender_codec: SCCP_CODEC_TEXT_UTF8,
              sender: textHex(TAIRA_SENDER),
              recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
              recipient: textHex(VALID_TRON_ADDRESS),
              route_id_codec: SCCP_CODEC_TEXT_UTF8,
              route_id: textHex("taira_tron_xor"),
            },
          },
        },
      }),
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding.canonicalPayloadHex).toBe(
      bytesToHex(
        canonicalSccpTransferPayloadBytes(TAIRA_TO_TRON_TRANSFER_PAYLOAD),
      ),
    );
  });

  it("builds TRON query material for TAIRA message proof jobs", () => {
    const bundle = sampleTairaToTronJob().bundle as Record<string, unknown>;
    const material = buildTairaXorMessageProofJobQueryMaterial({
      manifest: READY_TRON_MANIFEST,
      messageBundle: bundle,
      messageId: TAIRA_TO_TRON_MESSAGE_ID,
    });

    expect(material).toMatchObject({
      networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
      tronVerifierAddress: TRON_VERIFIER_ADDRESS,
      verifierCodeHashHex: HEX32_D,
      verifierKeyHashHex: HEX32_E,
      expectedDestinationBindingHashHex: TRON_DESTINATION_BINDING.bindingHash,
    });
    const proofBytes = hexToBytes(material.proofBytesHex);
    expect(proofBytes).toHaveLength(
      SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1,
    );
    expect(bytesToHex(proofBytes.slice(32, 64))).toBe(
      TAIRA_TO_TRON_MESSAGE_ID,
    );
    expect(bytesToHex(proofBytes.slice(64, 96))).toBe(`0x${"00".repeat(32)}`);
    expect(bytesToHex(proofBytes.slice(96, 128))).toBe(HEX32_C);

    expect(() =>
      buildTairaXorMessageProofJobQueryMaterial({
        manifest: READY_TRON_MANIFEST,
        messageBundle: bundle,
        messageId: HEX32_D,
      }),
    ).toThrow(/requested message id/);
  });

  it("rejects stale or adversarial TAIRA message proof jobs", () => {
    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          publicInputs: {
            ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
            messageId: HEX32_D,
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message[_ ]?id/i);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...(
                sampleTairaToTronJob().payloadProjection as {
                  value: Record<string, unknown>;
                }
              ).value,
              amount: "200000000000000",
            },
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/amount/);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...(
                sampleTairaToTronJob().payloadProjection as {
                  value: Record<string, unknown>;
                }
              ).value,
              route_id: { kind: "TextUtf8", value: "evil_route" },
            },
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/route[_ ]id/);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          publicInputs: {
            ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
            destination_binding_hash: HEX32_A,
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding hash.*route manifest/i);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          publicInputs: {
            ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
            messageId: HEX32_A,
          },
          bundle: {
            ...(sampleTairaToTronJob().bundle as Record<string, unknown>),
            commitment: {
              ...((sampleTairaToTronJob().bundle as Record<string, unknown>)
                .commitment as Record<string, unknown>),
              messageId: HEX32_A,
            },
          },
        }),
        messageId: HEX32_A,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message id.*canonical transfer payload/i);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          publicInputs: {
            ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
            payloadHash: HEX32_B,
          },
          bundle: {
            ...(sampleTairaToTronJob().bundle as Record<string, unknown>),
            commitment: {
              ...((sampleTairaToTronJob().bundle as Record<string, unknown>)
                .commitment as Record<string, unknown>),
              payloadHash: HEX32_B,
            },
          },
        }),
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/payload hash.*canonical SCCP payload envelope/i);
  });

  it("builds TRON finalize trigger requests from completed proof packages", () => {
    const transferPayload = {
      version: 1,
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_TRON_DOMAIN,
      nonce: "7",
      asset_home_domain: SCCP_SORA_DOMAIN,
      asset_id_codec: SCCP_CODEC_TEXT_UTF8,
      asset_id: "xor",
      amount: BRIDGE_AMOUNT_BASE_UNITS,
      sender_codec: SCCP_CODEC_TEXT_UTF8,
      sender: TAIRA_SENDER,
      recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
      recipient: VALID_TRON_ADDRESS,
      route_id_codec: SCCP_CODEC_TEXT_UTF8,
      route_id: "taira_tron_xor",
    };
    const canonicalPayloadHex = bytesToHex(
      canonicalSccpTransferPayloadBytes(transferPayload),
    );
    const messageId = sccpTransferMessageId(transferPayload);
    const payloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes({
        kind: "Transfer",
        value: transferPayload,
      }),
    );
    const trigger = buildTairaXorFinalizeTriggerRequest({
      manifest: READY_TRON_MANIFEST,
      ownerAddress: VALID_TRON_ADDRESS,
      tronRecipient: VALID_TRON_ADDRESS,
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId,
      canonicalPayloadHex,
      proofPackage: {
        submission: {
          proofBytes: bytesToHex(groth16ProofBytes()),
          publicInputs: {
            version: 1,
            messageId,
            payloadHash,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_F,
          },
          statementHash: HEX32_E,
        },
      },
    });

    expect(trigger).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId,
      trigger: {
        endpoint: TRON_MAINNET_RPC_URL,
        ownerAddress: VALID_TRON_ADDRESS,
        contractAddress: VALID_TRON_ADDRESS,
        functionSelector: TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
        feeLimit: 250_000_000,
      },
    });
    expect(trigger.trigger.callData).toMatch(/^0x[0-9a-f]+$/u);
    expect(
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_NILE_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash,
              targetDomain: SCCP_TRON_DOMAIN,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }).trigger.endpoint,
    ).toBe(TRON_NILE_RPC_URL);
    expect(
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        feeLimit: 150_000_000,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash,
              targetDomain: SCCP_TRON_DOMAIN,
              destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }).trigger.feeLimit,
    ).toBe(150_000_000);
  });

  it("rejects incomplete TRON finalize proof packages", () => {
    const transferPayload = {
      version: 1,
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_TRON_DOMAIN,
      nonce: "7",
      asset_home_domain: SCCP_SORA_DOMAIN,
      asset_id_codec: SCCP_CODEC_TEXT_UTF8,
      asset_id: "xor",
      amount: BRIDGE_AMOUNT_BASE_UNITS,
      sender_codec: SCCP_CODEC_TEXT_UTF8,
      sender: TAIRA_SENDER,
      recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
      recipient: VALID_TRON_ADDRESS,
      route_id_codec: SCCP_CODEC_TEXT_UTF8,
      route_id: "taira_tron_xor",
    };
    const canonicalPayloadHex = bytesToHex(
      canonicalSccpTransferPayloadBytes(transferPayload),
    );
    const messageId = sccpTransferMessageId(transferPayload);
    const payloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes({
        kind: "Transfer",
        value: transferPayload,
      }),
    );
    for (const feeLimit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        buildTairaXorFinalizeTriggerRequest({
          manifest: READY_TRON_MANIFEST,
          ownerAddress: VALID_TRON_ADDRESS,
          tronRecipient: VALID_TRON_ADDRESS,
          amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
          messageId,
          canonicalPayloadHex,
          feeLimit,
          proofPackage: {
            submission: {
              proofBytes: bytesToHex(groth16ProofBytes()),
              publicInputs: {
                version: 1,
                messageId,
                payloadHash,
                targetDomain: SCCP_TRON_DOMAIN,
                destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
                commitmentRoot: HEX32_C,
                finalityHeight: 10,
                finalityBlockHash: HEX32_F,
              },
              statementHash: HEX32_E,
            },
          },
        }),
      ).toThrow(/fee limit.*positive safe integer/i);
    }

    for (const amountBaseUnits of ["0", "-1", "1.5", " 1 "]) {
      expect(() =>
        buildTairaXorFinalizeTriggerRequest({
          manifest: READY_TRON_MANIFEST,
          ownerAddress: VALID_TRON_ADDRESS,
          tronRecipient: VALID_TRON_ADDRESS,
          amountBaseUnits,
          messageId,
          canonicalPayloadHex,
          proofPackage: {
            submission: {
              proofBytes: bytesToHex(groth16ProofBytes()),
              publicInputs: {
                version: 1,
                messageId,
                payloadHash,
                targetDomain: SCCP_TRON_DOMAIN,
                commitmentRoot: HEX32_C,
                finalityHeight: 10,
                finalityBlockHash: HEX32_F,
              },
              statementHash: HEX32_E,
            },
          },
        }),
      ).toThrow(/positive whole-number base-unit amount/i);
    }

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex: bytesToHex(new Uint8Array([0xde, 0xad])),
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash,
              targetDomain: SCCP_TRON_DOMAIN,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/canonical payload bytes.*bridge request/);

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash: HEX32_B,
              targetDomain: SCCP_TRON_DOMAIN,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/payload(?:Hash| hash).*canonical SCCP payload envelope/i);

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash,
              targetDomain: SCCP_SORA_DOMAIN,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/must target TRON/);

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId,
        canonicalPayloadHex,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId,
              payloadHash,
              targetDomain: SCCP_TRON_DOMAIN,
              destination_binding_hash_hex: HEX32_A,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/destination binding hash.*route manifest/i);

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId: HEX32_A,
        proofPackage: {
          submission: { publicInputs: {}, statementHash: HEX32_E },
        },
      }),
    ).toThrow(/proof bytes/);

    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId: HEX32_A,
        proofPackage: {
          submission: {
            proofBytes: bytesToHex(groth16ProofBytes()),
            publicInputs: {
              version: 1,
              messageId: HEX32_A,
              payloadHash: HEX32_B,
              targetDomain: SCCP_TRON_DOMAIN,
              commitmentRoot: HEX32_C,
              finalityHeight: 10,
              finalityBlockHash: HEX32_F,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/canonical payload/);
  });

  it("binds TRON source proof packages to TAIRA inbound settlement", () => {
    const TRON_TX_ID = TRON_SOURCE_TX_ID;
    const result = bindTronToTairaSourceProofPackage({
      manifest: READY_TRON_MANIFEST,
      proofPackage: sampleTronToTairaProofPackage(),
      txId: TRON_TX_ID,
      events: sampleTronSourceData().events,
      tronSender: VALID_TRON_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(result).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      sourceEventDigest: TRON_SOURCE_EVENT_DIGEST,
      txId: TRON_TX_ID,
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
      },
    });
    expect(result.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.messageBundle).toMatchObject({
      commitment: {
        targetDomain: SCCP_SORA_DOMAIN,
        messageId: result.messageId,
      },
    });
    expect(buildSccpMessageBundleSubmitPayload(result.messageBundle)).toMatchObject({
      commitment_root: expect.stringMatching(/^[0-9a-f]{64}$/u),
      commitment: {
        message_id: result.messageId.replace(/^0x/u, ""),
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      payload: {
        Transfer: {
          asset_id: bytesToHex(new TextEncoder().encode("xor")).slice(2),
          sender: bytesToHex(new TextEncoder().encode(VALID_TRON_ADDRESS)).slice(
            2,
          ),
          recipient: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)).slice(
            2,
          ),
          route_id: bytesToHex(
            new TextEncoder().encode("taira_tron_xor"),
          ).slice(2),
        },
      },
      finality_proof: expect.stringMatching(/^[0-9a-f]+$/u),
    });
  });

  it("uses manifest settlement routing without accepting caller payloads", () => {
    const TRON_TX_ID = TRON_SOURCE_TX_ID;
    expect(
      buildTairaXorInboundSettlement({
        manifest: {
          settlement: {
            contractAlias: "sccp.taira_xor",
            contractAddress: "bridge@sccp",
          },
        },
        gasLimit: 1000,
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
      contract_alias: "sccp.taira_xor",
      gas_limit: 1000,
    });
    expect(
      buildTairaXorInboundSettlement({
        manifest: {
          settlement: {
            contractAddress: "bridge@sccp",
          },
        },
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
      contract_address: "bridge@sccp",
    });

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          delete packageRecord.settlement;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement is missing/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.settlement = null;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement is missing/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.settlement = "finalize_inbound";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement must be an object/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.settlement = {
            route: "taira_tron_xor",
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/entrypoint.*finalize_inbound/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.settlement = {
            entrypoint: "finalize_inbound",
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/route.*taira_tron_xor/);

    expect(
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.settlement = {
            entrypoint: "finalize_inbound",
            route_id: "taira_tron_xor",
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }).settlement,
    ).toMatchObject({
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
    });

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (packageRecord.settlement as Record<string, unknown>).payload = {
            unsafe: true,
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement payload/);
  });

  it("rejects stale or adversarial TRON source proof packages", () => {
    const TRON_TX_ID = TRON_SOURCE_TX_ID;
    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (packageRecord.messageBundle as Record<string, unknown>)
              .commitment as Record<string, unknown>
          ).targetDomain = SCCP_TRON_DOMAIN;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/target TAIRA/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (
              (packageRecord.messageBundle as Record<string, unknown>)
                .payload as Record<string, unknown>
            ).value as Record<string, unknown>
          ).sender = {
            kind: "TronBase58Check",
            payload: `0x41${"11".repeat(20)}`,
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/sender/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (
              (packageRecord.messageBundle as Record<string, unknown>)
                .payload as Record<string, unknown>
            ).value as Record<string, unknown>
          ).route_id = "evil_route";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/route[_ ]id/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (packageRecord.messageBundle as Record<string, unknown>)
              .commitment as Record<string, unknown>
          ).payloadHash = HEX32_A;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/payload hash/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.messageId = HEX32_A;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message[_ ]?id/i);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.txId = "bb".repeat(32);
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/tx[_ ]?id/i);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.sourceEventDigest = HEX32_E;
        }),
        txId: TRON_TX_ID,
        events: sampleTronSourceData().events,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/source event/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage(),
        txId: TRON_TX_ID,
        events: sampleTronSourceData((next) => {
          const event = (next.events.data as Record<string, unknown>[])[0];
          (event.result as Record<string, unknown>).amount = "1";
        }).events,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/amount.*bridge request/);
  });

  it("keeps route readiness false when deployment evidence is missing", () => {
    const result = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: {
        proofSubmitPath: "/v1/bridge/proofs/submit",
        messageSubmitPath: "/v1/bridge/messages",
      },
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "other_route",
          },
        ],
      },
    });

    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toContain("taira_tron_xor");
  });

  it("stores only non-secret WalletConnect session metadata", () => {
    const snapshot = walletConnectSessionFromAddress(
      VALID_TRON_ADDRESS,
      "topic",
    );
    expect(snapshot).toMatchObject({
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_NILE_CAIP_CHAIN_ID,
      namespace: "tron",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/private|seed|mnemonic/iu);
    expect(
      walletConnectSessionFromAddress(
        VALID_TRON_ADDRESS,
        "topic",
        TRON_MAINNET_CAIP_CHAIN_ID,
      ).chainId,
    ).toBe(TRON_MAINNET_CAIP_CHAIN_ID);
  });
});

describe("SCCP proof package helpers", () => {
  it("serializes byte arrays as hex strings", () => {
    expect(serializeSccpValue(Uint8Array.from([0, 15, 255]))).toBe("0x000fff");
  });

  it("builds canonical TRON proof requests before proof bytes are available", () => {
    const result = buildTronSccpProofPackage({
      witness: {
        publicInputs: {
          version: 1,
          messageId: HEX32_A,
          payloadHash: HEX32_B,
          targetDomain: SCCP_TRON_DOMAIN,
          commitmentRoot: HEX32_C,
          finalityHeight: 10,
          finalityBlockHash: HEX32_D,
        },
        bundleBytes: [1, 2, 3],
        sourceProofBytes: [4, 5],
        statementHash: HEX32_E,
        destinationBindingHash: HEX32_A,
      },
    });

    expect(result.submission).toBeNull();
    expect(result.bridgePayload).toBeNull();
    expect(result.request).toMatchObject({
      version: 1,
      targetDomain: SCCP_TRON_DOMAIN,
      bundleBytes: "0x010203",
      sourceProofBytes: "0x0405",
    });
  });

  it("rejects stale TRON proof results before building submission payloads", () => {
    expect(() =>
      buildTronSccpProofPackage({
        witness: {
          publicInputs: {
            version: 1,
            messageId: HEX32_A,
            payloadHash: HEX32_B,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_D,
          },
          bundleBytes: [1, 2, 3],
          sourceProofBytes: [4, 5],
          statementHash: HEX32_E,
          destinationBindingHash: HEX32_A,
        },
        proofResult: {
          requestHash: HEX32_B,
        } as never,
      }),
    ).toThrow(/must match the proof request/);
  });

  it("reports missing browser-safe TRON prover before proof generation", async () => {
    await expect(
      generateTronSccpProofPackage({
        witness: {
          publicInputs: {
            version: 1,
            messageId: HEX32_A,
            payloadHash: HEX32_B,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_D,
          },
          bundleBytes: [1, 2, 3],
          sourceProofBytes: [4, 5],
          statementHash: HEX32_E,
          destinationBindingHash: HEX32_A,
        },
      }),
    ).rejects.toMatchObject({
      code: "ERR_SCCP_TRON_PROVER_UNAVAILABLE",
    });
  });

  it("binds generated proof packages to a pre-prover witness snapshot", async () => {
    const witness = {
      publicInputs: {
        version: 1 as const,
        messageId: HEX32_A,
        payloadHash: HEX32_B,
        targetDomain: SCCP_TRON_DOMAIN,
        commitmentRoot: HEX32_C,
        finalityHeight: 10,
        finalityBlockHash: HEX32_D,
      },
      bundleBytes: [1, 2, 3],
      sourceProofBytes: [4, 5],
      statementHash: HEX32_E,
      sourceDomain: SCCP_SORA_DOMAIN,
      destinationBinding: TRON_DESTINATION_BINDING,
      destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
    };

    const result = await generateTronSccpProofPackage({
      witness,
      prove: (request) => {
        witness.publicInputs.messageId = HEX32_F;
        witness.bundleBytes = [9, 9, 9];
        return {
          proofBytes: groth16ProofBytes(),
          requestHash: request.requestHash,
        };
      },
    });

    expect(witness.publicInputs.messageId).toBe(HEX32_F);
    expect(result.request).toMatchObject({
      publicInputs: {
        messageId: HEX32_A,
        payloadHash: HEX32_B,
      },
      bundleBytes: "0x010203",
      sourceProofBytes: "0x0405",
    });
    expect(result.submission).toMatchObject({
      proofBytes: expect.any(String),
    });
  });
});

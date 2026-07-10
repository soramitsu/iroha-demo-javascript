import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { Cell } from "@ton/core";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";
import {
  bridgeDecimalToBaseUnits,
  bridgeDecimalToTairaBaseUnits,
  bindBscSourceDataForProof,
  bindBscToTairaSourceProofPackage,
  bindFinalizedTairaXorSolanaFinalizeTransaction,
  bindSolanaToTairaSourceProofPackage,
  bindTonToTairaSourceProofPackage,
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
  buildTairaXorBscBurnTransactionRequest,
  buildTairaXorBscFinalizeProofBinding,
  buildTairaXorBscFinalizeTransactionRequest,
  buildTairaXorBscInboundSettlement,
  buildTairaXorBscMessageProofJobQueryMaterial,
  buildTairaXorBscOutboundBurnRecordRequest,
  buildTairaXorBscOutboundPreview,
  buildTairaXorTonFinalizeProofBinding,
  buildTairaXorTonInboundSettlement,
  buildTairaXorTonMessageProofJobQueryMaterial,
  buildTairaXorTonOutboundBurnRecordRequest,
  buildTairaXorTonOutboundPreview,
  buildTairaXorSolanaBurnTransactionRequest,
  buildTairaXorSolanaFinalizeProofBinding,
  buildTairaXorSolanaFinalizeTransactionRequest,
  buildSccpSolanaSettlementProofContextHash,
  buildTairaXorSolanaInboundSettlement,
  buildTairaXorSolanaMessageProofJobQueryMaterial,
  buildTairaXorSolanaOutboundBurnRecordRequest,
  buildTairaXorSolanaOutboundPreview,
  buildSccpTonCompactFinalizeMessageBodyBocFromBytes,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorOutboundPreview,
  buildTairaXorTokenBalanceRequest,
  canonicalEip55EvmAddress,
  classifySccpRouteLoadFailure,
  decodeTronBase58CheckAddress,
  evmFunctionSelector,
  formatBaseUnitAmount,
  formatTronSunBalance,
  isTairaSccpNetwork,
  isLikelyTairaAccount,
  isValidBscAddress,
  isValidBscTransactionHash,
  isValidSccpMessageId,
  isValidSolanaAddress,
  isValidSolanaTransactionSignature,
  isValidTonRawAddress,
  isValidTronBase58CheckAddress,
  isValidTronTransactionId,
  mergeSccpLaneMaterialsIntoManifestSet,
  normalizeBridgeAmount,
  normalizeBscNetworkIdHex,
  normalizeBscRouteEvidenceAddress,
  normalizeBscTransactionHash,
  normalizeEvmAddress,
  normalizeSolanaAddress,
  normalizeSolanaSourceBurnNonce,
  normalizeSolanaTransactionSignature,
  normalizeSccpMessageId,
  normalizeSccpTronNetworkKey,
  normalizeTairaAccountId,
  normalizeTairaTransactionHash,
  normalizeTronTransactionId,
  normalizeTronNetworkIdHex,
  pickBscSccpManifest,
  pickSolanaSccpManifest,
  pickTonSccpManifest,
  pickTronSccpManifest,
  readTronAccountBalanceSun,
  readTronConstantUint256,
  readSccpTairaBurnRecordMaterial,
  readSccpBscBridgeAddress,
  readSccpBscProofMaterial,
  readSccpBscRpcEndpoint,
  readSccpBscRuntimeProverConfigUrl,
  readSccpBscSourceBridgeAddress,
  readSccpBscTokenAddress,
  readSccpBscVerifierAddress,
  readSccpSolanaDestinationProverModuleUrl,
  readSccpSolanaProgramAddress,
  readSccpSolanaProofMaterial,
  readSccpSolanaRpcEndpoint,
  readSccpSolanaSourceBridgeAddress,
  readSccpSolanaDestinationProverModuleHash,
  readSccpSolanaDestinationProverSidecarHash,
  readSccpSolanaSourceProverModuleHash,
  readSccpSolanaSourceProverSidecarHash,
  readSccpSolanaSourceProverModuleUrl,
  readSccpSolanaTokenAddress,
  readSccpSolanaVerifierAddress,
  readSccpSolanaVerifierMintInstructionAccounts,
  readSccpSolanaSourceBurnInstructionAccounts,
  deriveSccpSolanaMessageReceiptAddress,
  deriveSccpSolanaMintAuthorityAddress,
  deriveSccpSolanaSourceBurnReceiptAddress,
  createSolanaSourceBurnNonce,
  readSccpTonBridgeAddress,
  readSccpTonFinalizeMessageValueNano,
  readSccpTonProofMaterial,
  readSccpTonRpcEndpoint,
  readSccpTonSourceProverModuleUrl,
  readSccpTonSourceBridgeAddress,
  readSccpTonTokenAddress,
  readSccpTonVerifierAddress,
  readSccpTonVerifierProtocolVersion,
  readBscSourceProverMaterialBinding,
  readSccpTronBridgeAddress,
  readSccpTronGatewayEndpoint,
  readSccpTronProofMaterial,
  readSccpTronSourceBridgeAddress,
  readSccpTronTokenAddress,
  resolveSccpRouteReadiness,
  chunkSccpTonUploadMessages,
  tairaXorBurnToTairaAccountCallData,
  tairaXorBscBurnToTairaAccountCallData,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  SCCP_BSC_TAIRA_XOR_BURN_STARTED_TOPIC,
  BSC_TESTNET_CHAIN_ID_HEX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TESTNET_NETWORK_ID_HEX,
  BSC_MAINNET_RPC_URL,
  BSC_TESTNET_RPC_URL,
  SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
  SCCP_BSC_DOMAIN,
  SCCP_BSC_NETWORK,
  SCCP_SORA_DOMAIN,
  SCCP_SOLANA_DOMAIN,
  SCCP_SOLANA_NETWORK,
  SCCP_SOLANA_SOURCE_PROOF_BACKEND,
  SCCP_SOLANA_SOURCE_BURN_EVENT_PREFIX,
  SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
  SCCP_SOLANA_SYSTEM_PROGRAM_ID,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
  SCCP_TON_DOMAIN,
  SCCP_TON_COMPACT_FINALIZE_OP,
  SCCP_TON_NETWORK,
  SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2,
  SCCP_TON_VERIFIER_PROTOCOL_CHUNKED_V1,
  SCCP_TON_TESTNET_SOURCE_PROVER_MODULE_URL,
  SCCP_TON_XOR_ROUTE_ID,
  SCCP_TRON_DOMAIN,
  SCCP_TRON_NETWORK,
  tonSccpRouteAllowlistHashFromLaneEvidence,
  TRON_MAINNET_CAIP_CHAIN_ID,
  TRON_MAINNET_CHAIN_ID_HEX,
  TRON_MAINNET_NETWORK_ID_HEX,
  TRON_MAINNET_RPC_URL,
  TRON_NILE_CHAIN_ID_HEX,
  TRON_NILE_NETWORK_ID_HEX,
  TRON_NILE_RPC_URL,
  solanaWalletConnectSessionFromAddress,
  walletConnectSessionFromAddress,
  type SolanaToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import {
  canonicalSccpTransferPayloadBytes,
  canonicalSccpPayloadEnvelopeBytes,
  canonicalSccpMessageProofBundleBytes,
  canonicalSccpMessageTransparentPublicInputsBytes,
  SCCP_CODEC_EVM_HEX,
  SCCP_CODEC_SOLANA_BASE58,
  SCCP_CODEC_TON_RAW,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1,
  SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  buildBscTestnetSccpDestinationProofRequest,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
  tairaXorBscBurnSourceEventDigest,
  tairaXorBurnSourceEventDigest,
  tairaXorRouteIdHash,
  tairaXorAssetKeyHash,
  evmSccpDestinationBinding,
  tronSccpDestinationBinding,
  buildSccpTonChunkedMessageBodyBocsFromBytes,
  buildRecordSccpMessageInstructionBytes,
  sccpDestinationBindingHash,
  sccpSourceAdapterEngineDeploymentHash,
  sccpSourceVerifierMaterialHash,
  SCCP_TON_WALLET_PAYLOAD_SAFE_BYTES_V1,
  tonSccpRouteCanaryEvidenceHash,
  wrapBscTestnetSccpDestinationProofResult,
} from "@iroha/iroha-js/sccp";
import {
  buildBscSccpProofPackage,
  buildTonSccpProofPackage,
  buildTronSccpProofPackage,
  generateBscSccpProofPackage,
  generateTonSccpProofPackage,
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
const BURN_RECORD_ARTIFACT_SHA256 =
  "0x1ad4f776520bfcdd4a4022cdcaaff5e26d2a3172c4fafb01917505e7be325592";
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
const OFFLINE_FULL_TOML_SHA256 = `0x${"99".repeat(32)}`;
const BSC_PROOF_ARTIFACT_HASH = `0x${"77".repeat(32)}`;
const BSC_PROVING_KEY_HASH = `0x${"88".repeat(32)}`;
const BSC_VERIFIER_KEY_ARTIFACT_HASH = `0x${"aa".repeat(32)}`;
const repeatedHex32 = (byteHex: string): string => {
  const byte = byteHex.toLowerCase().padStart(2, "0");
  return `0x${byte.repeat(32)}`;
};
const fixtureHash = (label: string): string =>
  `0x${Array.from(sha256(new TextEncoder().encode(label)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
const BSC_NATIVE_EVM_PROVER_BUNDLE_HASH =
  "0x298e0a30c391f0e2c1dbea1f1ce051011140e52fbe4524a970ff48eca360d2a8";
const TRON_SOLID_BLOCK_NUMBER = 12;
const TRON_SOLID_BLOCK_ID = `0x${TRON_SOLID_BLOCK_NUMBER.toString(16).padStart(
  16,
  "0",
)}${"66".repeat(24)}`;
const TRON_TOKEN_ADDRESS = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
const TRON_SOURCE_BRIDGE_ADDRESS = "TEdvoHEatmDKvTh3o9vBRB9Vdtbhn4QFhy";
const TRON_VERIFIER_ADDRESS = "TGCAjMXComunWZEXCT1LPBdcYbDVuyexBv";
const fixtureBscAddress = (label: string): string =>
  canonicalEip55EvmAddress(
    `0x${Array.from(sha256(new TextEncoder().encode(label)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    )
      .join("")
      .slice(0, 40)}`,
  );
const BSC_BRIDGE_ADDRESS = fixtureBscAddress("renderer sccp bsc bridge");
const BSC_TOKEN_ADDRESS = fixtureBscAddress("renderer sccp bsc token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureBscAddress(
  "renderer sccp bsc source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureBscAddress("renderer sccp bsc verifier");
const BSC_RECIPIENT_ADDRESS = fixtureBscAddress("renderer sccp bsc recipient");
const BSC_BRIDGE_ADDRESS_HEX = normalizeEvmAddress(BSC_BRIDGE_ADDRESS);
const BSC_VERIFIER_ADDRESS_HEX = normalizeEvmAddress(BSC_VERIFIER_ADDRESS);
const BSC_RECIPIENT_ADDRESS_HEX = normalizeEvmAddress(BSC_RECIPIENT_ADDRESS);
const BSC_MIXED_RECIPIENT_ADDRESS_LOWER =
  "0x52908400098527886e0f7030069857d2e4169ee7";
const BSC_MIXED_RECIPIENT_ADDRESS =
  "0x52908400098527886E0F7030069857D2E4169EE7";
const TON_BRIDGE_ADDRESS = `0:${"12".repeat(32)}`;
const TON_TOKEN_ADDRESS = `0:${"13".repeat(32)}`;
const TON_SOURCE_BRIDGE_ADDRESS = `0:${"14".repeat(32)}`;
const TON_VERIFIER_ADDRESS = `0:${"15".repeat(32)}`;
const TON_RECIPIENT_ADDRESS = `0:${"16".repeat(32)}`;
const SOLANA_BRIDGE_PROGRAM_ADDRESS =
  "So11111111111111111111111111111111111111112";
const SOLANA_TOKEN_MINT_ADDRESS = new PublicKey(
  sha256(new TextEncoder().encode("renderer sccp solana destination mint")),
).toBase58();
const SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS = new PublicKey(
  sha256(new TextEncoder().encode("renderer sccp solana source proof mint")),
).toBase58();
const SOLANA_SOURCE_BRIDGE_ADDRESS =
  "BPFLoaderUpgradeab1e11111111111111111111111";
const SOLANA_SOURCE_STATE_ADDRESS =
  "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS";
const SOLANA_VERIFIER_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SOLANA_VERIFIER_STATE_ADDRESS = new PublicKey(
  sha256(new TextEncoder().encode("renderer sccp solana verifier state")),
).toBase58();
const SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS =
  "ComputeBudget111111111111111111111111111111";
const SOLANA_PROGRAMDATA_ADDRESS =
  "cGfHiC6Kgg3FpFZvgwGcswsCRtp4aBP2fzuXRQPizuN";
const SOLANA_RECIPIENT_ADDRESS = "gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5";
const SOLANA_DESTINATION_TOKEN_ADDRESS =
  "BKb6pv4BrkQr4jv2SguPD9UtuKz5kcyzpa4QRvnua1ad";
const SOLANA_SOURCE_TOKEN_ADDRESS = new PublicKey(
  sha256(new TextEncoder().encode("renderer sccp solana source token")),
).toBase58();
const SOLANA_SOURCE_EVENT_SIGNATURE =
  "2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2";
const SOLANA_ROUTE_CANARY_SIGNATURE =
  "3L3RY5sT8K4kyEnqhizwaqxLEbcYvpGrGPNEYRwtbCSUtL6YL86jdrvCbohnP5q8VxQ3qzGmt3W3iQJW97rD7m3";
const BSC_SENDER_ADDRESS = fixtureBscAddress("renderer sccp bsc sender");
const BSC_SENDER_ADDRESS_HEX = normalizeEvmAddress(BSC_SENDER_ADDRESS);
const SIGNING_TRON_PRIVATE_KEY = new Uint8Array(32).fill(7);
const WRONG_SIGNING_TRON_PRIVATE_KEY = new Uint8Array(32).fill(8);
const SIGNING_TRON_ADDRESS = VALID_TRON_ADDRESS;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TRON_TRANSACTION_SECRET_INPUT_ERROR =
  "TRON bridge transaction must not contain secret-like material before broadcast.";
const TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR =
  "TRON bridge transaction must not contain nested signatures or signing helper payloads before broadcast.";

const expectGenericTronTransactionRejection = (
  action: () => unknown,
  expectedMessage: string,
  forbidden: string[],
): void => {
  let caught: unknown = null;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = caught instanceof Error ? caught.message : "";
  expect(message).toBe(expectedMessage);
  for (const value of forbidden) {
    expect(message).not.toContain(value);
  }
};

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

const u32LeBytes = (value: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
};

const u64LeBytes = (value: string): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
};

const borshVec = (value: Uint8Array): Uint8Array =>
  concatBytes(u32LeBytes(value.length), value);

const SOLANA_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const solanaBase58Encode = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  let encoded = "";
  while (value > 0n) {
    encoded = `${SOLANA_BASE58_ALPHABET[Number(value % 58n)]}${encoded}`;
    value /= 58n;
  }
  const firstNonZero = bytes.findIndex((byte) => byte !== 0);
  const leadingZeroes = firstNonZero < 0 ? bytes.length : firstNonZero;
  return `${"1".repeat(leadingZeroes)}${encoded}`;
};

const solanaSubmitEnvelopeHex = (
  args: Uint8Array[],
  entrypoint = "submit_sccp_message_proof",
): string =>
  bytesToHex(
    concatBytes(
      borshVec(new TextEncoder().encode(entrypoint)),
      ...args.map(borshVec),
    ),
  );

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

const abiBytes = (value: Uint8Array): Uint8Array => {
  const paddedLength = Math.ceil(value.length / 32) * 32;
  const padded = new Uint8Array(paddedLength);
  padded.set(value);
  return concatBytes(abiWord(BigInt(value.length)), padded);
};

const BN254_G2_GENERATOR_WORDS = [
  abiWord(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6edn),
  abiWord(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2n),
  abiWord(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daan),
  abiWord(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975bn),
];

const groth16ProofBytes = (
  context: {
    publicInputs?: {
      messageId?: string;
      commitmentRoot?: string;
    };
    sourceDomain?: number | string;
  } = {},
): Uint8Array => {
  const out = new Uint8Array(SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1);
  const messageId = context.publicInputs?.messageId ?? HEX32_A;
  const sourceDomain = BigInt(context.sourceDomain ?? SCCP_SORA_DOMAIN);
  const commitmentRoot = context.publicInputs?.commitmentRoot ?? HEX32_C;
  [
    abiWord(1n),
    hexToBytes(messageId),
    abiWord(sourceDomain),
    hexToBytes(commitmentRoot),
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
const BSC_BRIDGE_AMOUNT_BASE_UNITS = "100000";
const BSC_BRIDGE_AMOUNT_TOKEN_BASE_UNITS = BRIDGE_AMOUNT_BASE_UNITS;
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
const BSC_TO_TAIRA_NONCE = "1";
const BSC_SOURCE_EVENT_TOPIC = bytesToHex(
  keccak_256(new TextEncoder().encode("SccpSourceEvent(bytes32)")),
);
const BSC_SOURCE_EVENT_DIGEST = tairaXorBscBurnSourceEventDigest({
  bridgeAddress: BSC_BRIDGE_ADDRESS_HEX,
  burnerAddress: BSC_SENDER_ADDRESS_HEX,
  tairaRecipient: TAIRA_SENDER,
  amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  nonce: BSC_TO_TAIRA_NONCE,
});
const BSC_BURN_CALL_DATA = tairaXorBscBurnToTairaAccountCallData({
  tairaRecipient: TAIRA_SENDER,
  amount: BSC_BRIDGE_AMOUNT_TOKEN_BASE_UNITS,
});
const BSC_BURN_STARTED_EVENT_DATA = bytesToHex(
  concatBytes(
    abiWord(BigInt(BSC_BRIDGE_AMOUNT_BASE_UNITS)),
    abiWord(BigInt(BSC_TO_TAIRA_NONCE)),
    hexToBytes(tairaXorRouteIdHash()),
    hexToBytes(tairaXorAssetKeyHash()),
    abiWord(5n * 32n),
    abiBytes(new TextEncoder().encode(TAIRA_SENDER)),
  ),
);
const BSC_SOURCE_TX_HASH = HEX32_E;
const BSC_SOURCE_BLOCK_HASH = HEX32_F;
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
const TAIRA_TO_BSC_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: 0,
  dest_domain: SCCP_BSC_DOMAIN,
  nonce: "7",
  asset_home_domain: 0,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: TAIRA_SENDER,
  recipient_codec: SCCP_CODEC_EVM_HEX,
  recipient: BSC_RECIPIENT_ADDRESS,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: "taira_bsc_xor",
};
const TAIRA_TO_BSC_MESSAGE_ID = sccpTransferMessageId(
  TAIRA_TO_BSC_TRANSFER_PAYLOAD,
);
const TAIRA_TO_BSC_PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: TAIRA_TO_BSC_TRANSFER_PAYLOAD,
  }),
);
const TAIRA_TO_TON_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: 0,
  dest_domain: SCCP_TON_DOMAIN,
  nonce: "7",
  asset_home_domain: 0,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: TAIRA_SENDER,
  recipient_codec: SCCP_CODEC_TON_RAW,
  recipient: TON_RECIPIENT_ADDRESS,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: SCCP_TON_XOR_ROUTE_ID,
};
const TAIRA_TO_TON_MESSAGE_ID = sccpTransferMessageId(
  TAIRA_TO_TON_TRANSFER_PAYLOAD,
);
const TAIRA_TO_TON_PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: TAIRA_TO_TON_TRANSFER_PAYLOAD,
  }),
);
const TAIRA_TO_SOLANA_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: 0,
  dest_domain: SCCP_SOLANA_DOMAIN,
  nonce: "7",
  asset_home_domain: 0,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: TAIRA_SENDER,
  recipient_codec: SCCP_CODEC_SOLANA_BASE58,
  recipient: SOLANA_RECIPIENT_ADDRESS,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: SCCP_SOLANA_XOR_ROUTE_ID,
};
const TAIRA_TO_SOLANA_MESSAGE_ID = sccpTransferMessageId(
  TAIRA_TO_SOLANA_TRANSFER_PAYLOAD,
);
const TAIRA_TO_SOLANA_PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: TAIRA_TO_SOLANA_TRANSFER_PAYLOAD,
  }),
);
const SOLANA_TO_TAIRA_TRANSFER_PAYLOAD = {
  version: 1,
  source_domain: SCCP_SOLANA_DOMAIN,
  dest_domain: SCCP_SORA_DOMAIN,
  nonce: "13",
  asset_home_domain: SCCP_SORA_DOMAIN,
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: "xor",
  amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  sender_codec: SCCP_CODEC_SOLANA_BASE58,
  sender: SOLANA_RECIPIENT_ADDRESS,
  recipient_codec: SCCP_CODEC_TEXT_UTF8,
  recipient: TAIRA_SENDER,
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: SCCP_SOLANA_XOR_ROUTE_ID,
};
const SOLANA_TO_TAIRA_MESSAGE_ID = sccpTransferMessageId(
  SOLANA_TO_TAIRA_TRANSFER_PAYLOAD,
);
const SOLANA_TO_TAIRA_PAYLOAD_HASH = sccpPayloadHash(
  canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: SOLANA_TO_TAIRA_TRANSFER_PAYLOAD,
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
    offlineFullTomlSha256: OFFLINE_FULL_TOML_SHA256,
    sourceBridgeConfigHash: HEX32_A,
    sourceEventTransactionId: HEX32_B,
    routeCanaryEvidenceHash: HEX32_C,
    routeCanaryTransactionId: HEX32_F,
  },
  ...BURN_RECORD_MATERIAL,
  tairaXorBurnRecord: {
    ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
    artifactSha256: BURN_RECORD_ARTIFACT_SHA256,
  },
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
const TON_SOURCE_VERIFIER_MATERIAL = {
  sourceDomain: SCCP_TON_DOMAIN,
  targetDomain: SCCP_SORA_DOMAIN,
  sourceChain: "ton",
  sourceTrustAnchorHash: fixtureHash("ton source trust anchor"),
  consensusVerifierHash: fixtureHash("ton consensus verifier"),
  messageInclusionVerifierHash: fixtureHash("ton message inclusion verifier"),
  finalityPolicyHash: fixtureHash("ton finality policy"),
  sourceStateVerifierHash: fixtureHash("ton source state verifier"),
  sourceStateVerifierId:
    "sccp:ton:source-state-verifier:shard-state-light-client-mainnet:v1",
  placeholderMaterial: false,
};
const TON_SOURCE_ADAPTER_ENGINE_DEPLOYMENT = {
  ...TON_SOURCE_VERIFIER_MATERIAL,
  adapterVerifierVkHash: fixtureHash("ton source adapter verifier vk"),
  deploymentReceiptHash: fixtureHash("ton source adapter deployment receipt"),
  tonMasterchainConfigVerifierHash: fixtureHash(
    "ton masterchain config verifier",
  ),
  tonValidatorSetTransitionVerifierHash: fixtureHash(
    "ton validator transition verifier",
  ),
  tonShardAccountsDictionaryVerifierHash: fixtureHash(
    "ton shard accounts dictionary verifier",
  ),
  tonFullLightClientGateHash: fixtureHash("ton full light client gate"),
  adapterProofFamily: "stark-fri-v1",
  adapterCircuitId: "sccp-source-adapter-v1",
};
const READY_TON_MANIFEST = {
  tonNetwork: "testnet",
  chain: "ton-testnet",
  counterpartyDomain: SCCP_TON_DOMAIN,
  counterpartyAccountCodecKey: "ton_raw",
  counterpartyAccountCodec: SCCP_CODEC_TON_RAW,
  verifierTarget: "TonContract",
  routeId: SCCP_TON_XOR_ROUTE_ID,
  assetKey: "xor",
  productionReady: true,
  tonBridgeAddress: TON_BRIDGE_ADDRESS,
  tonTokenAddress: TON_TOKEN_ADDRESS,
  sccpTonSourceBridgeAddress: TON_SOURCE_BRIDGE_ADDRESS,
  tonVerifierAddress: TON_VERIFIER_ADDRESS,
  tonFinalizeMessageValueNano: "100000000",
  tonRpcUrl: SCCP_TON_NETWORK.rpcUrl,
  sourceVerifierMaterial: TON_SOURCE_VERIFIER_MATERIAL,
  sourceAdapterEngineDeployment: TON_SOURCE_ADAPTER_ENGINE_DEPLOYMENT,
  sourceBrowserProver: {
    moduleUrl: "/sccp-ton/source-prover.js",
    moduleHash: fixtureHash("ton source browser prover module"),
    manifestHash: fixtureHash("ton source browser prover manifest"),
    boundRouteHash: HEX32_C,
    boundProofHash: HEX32_D,
    expectedExports: ["proveTonSccpSource"],
  },
  destinationBinding: {
    version: 1,
    key: `ton:0:${SCCP_TON_DOMAIN}:${SCCP_TON_NETWORK.networkIdHex.slice(
      2,
    )}:${TON_VERIFIER_ADDRESS}:${HEX32_D}:${HEX32_E}`,
    bindingHash: HEX32_C,
  },
  destinationRollout: {
    verifierIdentity: TON_VERIFIER_ADDRESS,
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    destinationNetworkId: SCCP_TON_NETWORK.networkIdHex,
    destinationBindingHash: HEX32_C,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    offlineFullTomlSha256: OFFLINE_FULL_TOML_SHA256,
    sourceBridgeConfigHash: HEX32_A,
    sourceEventTransactionId: HEX32_B,
    routeCanaryEvidenceHash: HEX32_C,
    routeCanaryTransactionId: HEX32_F,
  },
  ...BURN_RECORD_MATERIAL,
  tairaXorBurnRecord: {
    ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
    artifactSha256: BURN_RECORD_ARTIFACT_SHA256,
  },
};
const SOLANA_SOURCE_VERIFIER_MATERIAL = {
  sourceDomain: SCCP_SOLANA_DOMAIN,
  targetDomain: SCCP_SORA_DOMAIN,
  sourceChain: "solana-testnet",
  sourceTrustAnchorHash: fixtureHash("solana source trust anchor"),
  consensusVerifierHash: fixtureHash("solana consensus verifier"),
  messageInclusionVerifierHash: fixtureHash(
    "solana message inclusion verifier",
  ),
  finalityPolicyHash: fixtureHash("solana finality policy"),
  sourceStateVerifierHash: fixtureHash("solana source state verifier"),
  placeholderMaterial: false,
};
const SOLANA_SOURCE_ADAPTER_ENGINE_DEPLOYMENT = {
  ...SOLANA_SOURCE_VERIFIER_MATERIAL,
  adapterVerifierVkHash: fixtureHash("solana source adapter verifier vk"),
  deploymentReceiptHash: fixtureHash("solana source adapter receipt"),
  adapterProofFamily: "stark-fri-v1",
  adapterCircuitId: "sccp-source-adapter-v1",
};
const READY_SOLANA_MANIFEST = {
  solanaNetwork: "testnet",
  chain: "solana-testnet",
  networkId: SCCP_SOLANA_NETWORK.networkId,
  counterpartyDomain: SCCP_SOLANA_DOMAIN,
  counterpartyAccountCodecKey: "solana_base58",
  counterpartyAccountCodec: SCCP_CODEC_SOLANA_BASE58,
  verifierTarget: "SolanaProgram",
  routeId: SCCP_SOLANA_XOR_ROUTE_ID,
  assetKey: "xor",
  productionReady: true,
  solanaProgramId: SOLANA_BRIDGE_PROGRAM_ADDRESS,
  solanaTokenMint: SOLANA_TOKEN_MINT_ADDRESS,
  sccpSolanaSourceBridgeAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
  solanaSourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
  solanaVerifierProgramId: SOLANA_VERIFIER_PROGRAM_ADDRESS,
  solanaVerifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
  solanaNativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
  solanaRpcUrl: SCCP_SOLANA_NETWORK.rpcUrl,
  solanaProgramdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
  solanaProgramdataSlot: 123456,
  solanaVerifierMintInstructionAccounts: [
    {
      pubkey: "$payer",
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: SOLANA_VERIFIER_STATE_ADDRESS,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SOLANA_TOKEN_MINT_ADDRESS,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: "$destinationToken",
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: deriveSccpSolanaMintAuthorityAddress({
        verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
        verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      }),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: "$messageReceipt",
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: "$systemProgram",
      isSigner: false,
      isWritable: false,
    },
  ],
  solanaSourceBurnInstructionAccounts: [
    {
      pubkey: "$owner",
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: SOLANA_SOURCE_STATE_ADDRESS,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: "$sourceToken",
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SOLANA_TOKEN_MINT_ADDRESS,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: "$sourceBurnReceipt",
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: "$systemProgram",
      isSigner: false,
      isWritable: false,
    },
  ],
  sourceVerifierMaterial: SOLANA_SOURCE_VERIFIER_MATERIAL,
  sourceAdapterEngineDeployment: SOLANA_SOURCE_ADAPTER_ENGINE_DEPLOYMENT,
  sourceBrowserProver: {
    moduleUrl: "/sccp-solana/source-prover.js",
    moduleHash: fixtureHash("solana source browser prover module"),
    manifestHash: fixtureHash("solana source browser prover manifest"),
    expectedExports: ["proveSolanaSccpSource"],
  },
  destinationBrowserProver: {
    moduleUrl: "/sccp-solana/destination-prover.js",
    moduleHash: fixtureHash("solana destination browser prover module"),
    manifestHash: fixtureHash("solana destination browser prover manifest"),
    expectedExports: ["proveSolanaSccpDestination"],
  },
  destinationBinding: {
    version: 1,
    key: `solana:0:${SCCP_SOLANA_DOMAIN}:${SCCP_SOLANA_NETWORK.networkId}:${SOLANA_VERIFIER_PROGRAM_ADDRESS}:${HEX32_D}:${HEX32_E}`,
    bindingHash: HEX32_C,
  },
  destinationProofAdmission: {
    admissionMode: "governed-zk-verifier-v1",
    proofSystem: "stark-fri-v1",
    entrypoint: "submit_sccp_message_proof",
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    destinationBindingHash: HEX32_C,
    shapeOnly: false,
    acceptsUnverifiedProofs: false,
  },
  destinationRollout: {
    verifierIdentity: SOLANA_VERIFIER_PROGRAM_ADDRESS,
    nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    destinationNetworkId: SCCP_SOLANA_NETWORK.networkId,
    destinationBridgeAddress: SOLANA_BRIDGE_PROGRAM_ADDRESS,
    destinationBindingHash: HEX32_C,
    programdataAddress: SOLANA_PROGRAMDATA_ADDRESS,
    programdataSlot: 123456,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    offlineFullTomlSha256: OFFLINE_FULL_TOML_SHA256,
    sourceBridgeConfigHash: HEX32_A,
    sourceEventTransactionSignature: SOLANA_SOURCE_EVENT_SIGNATURE,
    routeCanaryEvidenceHash: HEX32_C,
    routeCanaryTransactionSignature: SOLANA_ROUTE_CANARY_SIGNATURE,
  },
  ...BURN_RECORD_MATERIAL,
  tairaXorBurnRecord: {
    ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
    artifactSha256: BURN_RECORD_ARTIFACT_SHA256,
  },
};
const BSC_DESTINATION_BINDING_KEY = `evm:0:${SCCP_BSC_DOMAIN}:${BSC_TESTNET_NETWORK_ID_HEX.slice(
  2,
)}:${normalizeEvmAddress(BSC_VERIFIER_ADDRESS)}:${normalizeEvmAddress(BSC_BRIDGE_ADDRESS)}:${HEX32_D}:${HEX32_E}`;
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH = [
  ...SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
][0];
const BSC_DESTINATION_BINDING = evmSccpDestinationBinding({
  version: 1,
  key: BSC_DESTINATION_BINDING_KEY,
  sourceDomain: 0,
  targetDomain: SCCP_BSC_DOMAIN,
  networkId: BSC_TESTNET_NETWORK_ID_HEX,
  verifierAddress: BSC_VERIFIER_ADDRESS_HEX,
  bridgeAddress: BSC_BRIDGE_ADDRESS_HEX,
  verifierCodeHash: HEX32_D,
  verifierKeyHash: HEX32_E,
});
const BSC_MAINNET_DESTINATION_BINDING_KEY = `evm:0:${SCCP_BSC_DOMAIN}:${BSC_MAINNET_NETWORK_ID_HEX.slice(
  2,
)}:${normalizeEvmAddress(BSC_VERIFIER_ADDRESS)}:${normalizeEvmAddress(BSC_BRIDGE_ADDRESS)}:${HEX32_D}:${HEX32_E}`;
const BSC_MAINNET_DESTINATION_BINDING = evmSccpDestinationBinding({
  version: 1,
  key: BSC_MAINNET_DESTINATION_BINDING_KEY,
  sourceDomain: 0,
  targetDomain: SCCP_BSC_DOMAIN,
  networkId: BSC_MAINNET_NETWORK_ID_HEX,
  verifierAddress: BSC_VERIFIER_ADDRESS_HEX,
  bridgeAddress: BSC_BRIDGE_ADDRESS_HEX,
  verifierCodeHash: HEX32_D,
  verifierKeyHash: HEX32_E,
});
const BSC_NATIVE_EVM_PROVER_BUNDLE = {
  schema: SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  bundle_id: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  domain: SCCP_BSC_DOMAIN,
  chain: "bsc-testnet",
  proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  proof_artifact: "artifacts/bsc-testnet/taira-xor/proof-artifact.r1cs",
  proof_artifact_hash: BSC_PROOF_ARTIFACT_HASH,
  proving_key: "artifacts/bsc-testnet/taira-xor/proving-key.zkey",
  proving_key_hash: BSC_PROVING_KEY_HASH,
  verifier_key: "artifacts/bsc-testnet/taira-xor/verifier-key.json",
  verifier_key_hash: HEX32_E,
  verifier_key_artifact_hash: BSC_VERIFIER_KEY_ARTIFACT_HASH,
  destination_binding_hash: BSC_DESTINATION_BINDING.bindingHash,
  no_wasm: true,
  remote_prover_required: false,
  browser_implementation: "pure-typescript",
  cross_sdk_parity_artifact:
    "artifacts/bsc-testnet/taira-xor/cross-sdk-parity.json",
  native_prover_self_test_artifact:
    "artifacts/bsc-testnet/taira-xor/native-prover-self-test.json",
  groth16_proof_self_test_artifact:
    "artifacts/bsc-testnet/taira-xor/groth16-proof-self-test.json",
  groth16_proof_self_test_hash: fixtureHash(
    "renderer bsc groth16 proof self-test",
  ),
  native_sdk_artifacts: Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  ).map(([sdk, implementation], index) => ({
    sdk,
    implementation,
    prover_artifact_hash: BSC_PROOF_ARTIFACT_HASH,
    proving_key_hash: BSC_PROVING_KEY_HASH,
    implementation_artifact: `artifacts/bsc-testnet/taira-xor/${sdk}-implementation.bin`,
    implementation_hash: repeatedHex32((0x81 + index).toString(16)),
  })),
  audit_hashes: {
    circuit_security_audit: fixtureHash("renderer bsc circuit audit"),
    native_implementation_audit: fixtureHash("renderer bsc native audit"),
    reproducible_build_attestation: fixtureHash(
      "renderer bsc reproducible attestation",
    ),
    cross_sdk_parity: fixtureHash("renderer bsc parity"),
    native_prover_self_test: fixtureHash("renderer bsc self-test"),
    no_wasm_no_remote_scan: fixtureHash("renderer bsc no-wasm scan"),
  },
};
const BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE = {
  ...BSC_NATIVE_EVM_PROVER_BUNDLE,
  bundle_id: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  chain: "bsc-mainnet",
  proof_artifact: "artifacts/bsc-mainnet/taira-xor/proof-artifact.r1cs",
  proving_key: "artifacts/bsc-mainnet/taira-xor/proving-key.zkey",
  verifier_key: "artifacts/bsc-mainnet/taira-xor/verifier-key.json",
  destination_binding_hash: BSC_MAINNET_DESTINATION_BINDING.bindingHash,
  cross_sdk_parity_artifact:
    "artifacts/bsc-mainnet/taira-xor/cross-sdk-parity.json",
  native_prover_self_test_artifact:
    "artifacts/bsc-mainnet/taira-xor/native-prover-self-test.json",
  groth16_proof_self_test_artifact:
    "artifacts/bsc-mainnet/taira-xor/groth16-proof-self-test.json",
  native_sdk_artifacts: BSC_NATIVE_EVM_PROVER_BUNDLE.native_sdk_artifacts.map(
    (artifact) => ({
      ...artifact,
      implementation_artifact: String(artifact.implementation_artifact).replace(
        "bsc-testnet",
        "bsc-mainnet",
      ),
    }),
  ),
};
const BSC_SOURCE_VERIFIER_MATERIAL = {
  sourceDomain: SCCP_BSC_DOMAIN,
  sourceChain: "bsc",
  sourceBridgeEmitterAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  sourceBridgeEmitterCodeHash: HEX32_A,
};
const BSC_SOURCE_ADAPTER_ENGINE_DEPLOYMENT = {
  sourceDomain: SCCP_BSC_DOMAIN,
  targetDomain: SCCP_SORA_DOMAIN,
  sourceChain: "bsc",
  sourceBridgeEmitterAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  sourceBridgeEmitterCodeHash: HEX32_A,
  adapterVerifierVkHash: HEX32_B,
  deploymentReceiptHash: HEX32_C,
};
const READY_BSC_MANIFEST = {
  bscNetwork: "testnet",
  chain: "bsc-testnet",
  counterpartyDomain: SCCP_BSC_DOMAIN,
  counterpartyAccountCodecKey: "evm_hex",
  verifierTarget: "EvmContract",
  routeId: "taira_bsc_xor",
  assetKey: "xor",
  productionReady: true,
  bscBridgeAddress: BSC_BRIDGE_ADDRESS,
  bscTokenAddress: BSC_TOKEN_ADDRESS,
  sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  bscVerifierAddress: BSC_VERIFIER_ADDRESS,
  bscRpcUrl: BSC_TESTNET_RPC_URL,
  proofArtifactHash: BSC_PROOF_ARTIFACT_HASH,
  provingKeyHash: BSC_PROVING_KEY_HASH,
  nativeEvmProverBundle: BSC_NATIVE_EVM_PROVER_BUNDLE,
  runtimeProverConfig: {
    configUrl: "/sccp-bsc/taira-bsc-xor-runtime.config.json",
  },
  sourceVerifierMaterial: BSC_SOURCE_VERIFIER_MATERIAL,
  sourceAdapterEngineDeployment: BSC_SOURCE_ADAPTER_ENGINE_DEPLOYMENT,
  destinationBinding: {
    version: 1,
    key: BSC_DESTINATION_BINDING.key,
    bindingHash: BSC_DESTINATION_BINDING.bindingHash,
  },
  destinationRollout: {
    verifierIdentity: BSC_VERIFIER_ADDRESS,
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    proofArtifactHash: BSC_PROOF_ARTIFACT_HASH,
    provingKeyHash: BSC_PROVING_KEY_HASH,
    nativeEvmProverBundle: BSC_NATIVE_EVM_PROVER_BUNDLE,
    destinationNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
    destinationBridgeAddress: BSC_BRIDGE_ADDRESS,
    destinationBindingKey: BSC_DESTINATION_BINDING.key,
    destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    offlineFullTomlSha256: OFFLINE_FULL_TOML_SHA256,
    sourceBridgeConfigHash: HEX32_A,
    sourceEventTransactionId: HEX32_B,
    sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_B}`,
    routeCanaryEvidenceHash: HEX32_C,
    routeCanaryTransactionId: HEX32_F,
    routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_F}`,
  },
  ...BURN_RECORD_MATERIAL,
  tairaXorBurnRecord: {
    ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
    artifactSha256: BURN_RECORD_ARTIFACT_SHA256,
  },
};
const READY_BSC_MAINNET_MANIFEST = {
  ...READY_BSC_MANIFEST,
  bscNetwork: "mainnet",
  chain: "bsc-mainnet",
  bscRpcUrl: BSC_MAINNET_RPC_URL,
  nativeEvmProverBundle: BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE,
  destinationBinding: {
    version: 1,
    key: BSC_MAINNET_DESTINATION_BINDING.key,
    bindingHash: BSC_MAINNET_DESTINATION_BINDING.bindingHash,
  },
  destinationRollout: {
    ...READY_BSC_MANIFEST.destinationRollout,
    nativeEvmProverBundle: BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE,
    destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
    destinationBindingKey: BSC_MAINNET_DESTINATION_BINDING.key,
    destinationBindingHash: BSC_MAINNET_DESTINATION_BINDING.bindingHash,
  },
  postDeployLiveEvidence: {
    ...READY_BSC_MANIFEST.postDeployLiveEvidence,
    sourceEventExplorerUrl: `https://bscscan.com/tx/${HEX32_B}`,
    routeCanaryExplorerUrl: `https://bscscan.com/tx/${HEX32_F}`,
  },
};

const BSC_SOURCE_PROVER_MATERIAL_BINDING =
  readBscSourceProverMaterialBinding(READY_BSC_MANIFEST);

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

const sampleTairaToBscJob = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const transferProjection = {
    source_domain: 0,
    dest_domain: SCCP_BSC_DOMAIN,
    asset_home_domain: 0,
    asset_id: { kind: "TextUtf8", value: "xor" },
    route_id: { kind: "TextUtf8", value: "taira_bsc_xor" },
    amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    sender: { kind: "TextUtf8", value: TAIRA_SENDER },
    recipient: { kind: "EvmHex", value: BSC_RECIPIENT_ADDRESS },
  };
  return {
    publicInputs: {
      version: 1,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
      targetDomain: SCCP_BSC_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
      destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
    },
    destinationBinding: {
      version: 1,
      key: BSC_DESTINATION_BINDING.key,
      bindingHash: BSC_DESTINATION_BINDING.bindingHash,
    },
    payloadProjection: {
      kind: "Transfer",
      value: transferProjection,
    },
    submissionPackage: {
      platformPayload: {
        kind: "evm_groth16_contract_call",
        value: {
          statementHash: HEX32_E,
          destinationBinding: {
            version: 1,
            key: BSC_DESTINATION_BINDING.key,
            bindingHash: BSC_DESTINATION_BINDING.bindingHash,
          },
        },
      },
    },
    bundle: {
      version: 1,
      commitmentRoot: HEX32_C,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: SCCP_BSC_DOMAIN,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: TAIRA_TO_BSC_TRANSFER_PAYLOAD,
      },
      finalityProof: "0x010203",
    },
    ...overrides,
  };
};

const sampleTairaToTonJob = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const account = TON_RECIPIENT_ADDRESS.split(":")[1];
  const transferProjection = {
    source_domain: 0,
    dest_domain: SCCP_TON_DOMAIN,
    asset_home_domain: 0,
    asset_id: { kind: "TextUtf8", value: "xor" },
    route_id: { kind: "TextUtf8", value: SCCP_TON_XOR_ROUTE_ID },
    amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    sender: { kind: "TextUtf8", value: TAIRA_SENDER },
    recipient: {
      kind: "TonRaw",
      value: {
        workchain: 0,
        account,
      },
    },
  };
  return {
    publicInputs: {
      version: 1,
      messageId: TAIRA_TO_TON_MESSAGE_ID,
      payloadHash: TAIRA_TO_TON_PAYLOAD_HASH,
      targetDomain: SCCP_TON_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
      destinationBindingHash: HEX32_C,
    },
    destinationBinding: {
      version: 1,
      key: READY_TON_MANIFEST.destinationBinding.key,
      bindingHash: HEX32_C,
    },
    payloadProjection: {
      kind: "Transfer",
      value: transferProjection,
    },
    submissionPackage: {
      envelopeEncoding: "ton_message_body_boc_v1",
      platformPayload: {
        TonInternalMessage: {
          messageBodyBoc: "b5ee9c72",
          destinationBinding: {
            version: 1,
            key: READY_TON_MANIFEST.destinationBinding.key,
            bindingHash: HEX32_C,
          },
          destinationBindingHash: HEX32_C,
          statementHash: HEX32_E,
        },
      },
      arguments: [
        {
          key: "message_body_boc",
          encoding: "ton_boc",
          bytes: "b5ee9c72",
        },
      ],
      envelopeBytes: "b5ee9c72",
    },
    bundle: {
      version: 1,
      commitmentRoot: HEX32_C,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: SCCP_TON_DOMAIN,
        messageId: TAIRA_TO_TON_MESSAGE_ID,
        payloadHash: TAIRA_TO_TON_PAYLOAD_HASH,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: TAIRA_TO_TON_TRANSFER_PAYLOAD,
      },
      finalityProof: "0x010203",
    },
    ...overrides,
  };
};

const sampleSolanaProofContextHash = (): string =>
  buildSccpSolanaSettlementProofContextHash({
    statementHash: HEX32_E,
    destinationBindingHash: HEX32_C,
    messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
    tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
    destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
    ownerAddress: SOLANA_RECIPIENT_ADDRESS,
    amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
  });

const sampleSolanaSubmitArgs = (
  job: Record<string, unknown>,
  proofContextHash = sampleSolanaProofContextHash(),
): Uint8Array[] => [
  hexToBytes("0x01020304"),
  canonicalSccpMessageTransparentPublicInputsBytes(
    job.publicInputs as Parameters<
      typeof canonicalSccpMessageTransparentPublicInputsBytes
    >[0],
  ),
  canonicalSccpMessageProofBundleBytes(
    job.bundle as Parameters<typeof canonicalSccpMessageProofBundleBytes>[0],
  ),
  hexToBytes(HEX32_E),
  hexToBytes(HEX32_C),
  hexToBytes(proofContextHash),
  u64LeBytes(BSC_BRIDGE_AMOUNT_BASE_UNITS),
];

const sampleSolanaDestinationProofPackage = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const job = sampleTairaToSolanaJob();
  const proofContextHash = sampleSolanaProofContextHash();
  const messageReceiptAddress = deriveSccpSolanaMessageReceiptAddress({
    verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
    verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
    messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
  });
  const envelopeBytes = solanaSubmitEnvelopeHex(
    sampleSolanaSubmitArgs(job, proofContextHash),
  );
  return {
    request: {
      routeId: SCCP_SOLANA_XOR_ROUTE_ID,
      assetKey: "xor",
      direction: "taira-to-solana",
      solanaNetwork: "solana-testnet",
      solanaGenesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
      backend: "solana-program-v1",
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      payloadHash: TAIRA_TO_SOLANA_PAYLOAD_HASH,
      destinationBindingHash: HEX32_C,
      statementHash: HEX32_E,
      proofContextHash,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
      verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      messageReceiptAddress,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    },
    submission: {
      ...(job.submissionPackage as Record<string, unknown>),
      publicInputs: job.publicInputs,
      destinationBindingHash: HEX32_C,
      statementHash: HEX32_E,
      proofContextHash,
      envelopeBytes,
      ...overrides,
    },
  };
};

const sampleTairaToSolanaJob = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const transferProjection = {
    source_domain: 0,
    dest_domain: SCCP_SOLANA_DOMAIN,
    asset_home_domain: 0,
    asset_id: { kind: "TextUtf8", value: "xor" },
    route_id: { kind: "TextUtf8", value: SCCP_SOLANA_XOR_ROUTE_ID },
    amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    sender: { kind: "TextUtf8", value: TAIRA_SENDER },
    recipient: {
      kind: "SolanaBase58",
      value: SOLANA_RECIPIENT_ADDRESS,
    },
  };
  return {
    publicInputs: {
      version: 1,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      payloadHash: TAIRA_TO_SOLANA_PAYLOAD_HASH,
      targetDomain: SCCP_SOLANA_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
      destinationBindingHash: HEX32_C,
    },
    destinationBinding: {
      version: 1,
      key: READY_SOLANA_MANIFEST.destinationBinding.key,
      bindingHash: HEX32_C,
    },
    solanaDestinationWitness: {
      direction: "taira-to-solana",
      solanaNetwork: "solana-testnet",
      solanaGenesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
      proofBackend: "solana-program-v1",
    },
    payloadProjection: {
      kind: "Transfer",
      value: transferProjection,
    },
    submissionPackage: {
      envelopeEncoding: "borsh_instruction_v1",
      submissionKind: "program_instruction",
      verifierEntrypoint: "submit_sccp_message_proof",
      platformPayload: {
        kind: "solana_program_instruction",
        value: {
          proofBytes: "0x01020304",
          publicInputsBytes: "0x0506",
          bundleBytes: "0x0708",
          destinationBinding: {
            version: 1,
            key: READY_SOLANA_MANIFEST.destinationBinding.key,
            bindingHash: HEX32_C,
          },
          destinationBindingHash: HEX32_C,
          statementHash: HEX32_E,
          proofContextHash: HEX32_F,
        },
      },
      arguments: [
        { key: "proof_bytes", encoding: "raw_bytes", bytes: "0x01020304" },
        { key: "public_inputs", encoding: "raw_bytes", bytes: "0x0506" },
        { key: "bundle_bytes", encoding: "raw_bytes", bytes: "0x0708" },
        { key: "statement_hash", encoding: "raw_bytes", bytes: HEX32_E },
        {
          key: "destination_binding_hash",
          encoding: "raw_bytes",
          bytes: HEX32_C,
        },
        { key: "proof_context_hash", encoding: "raw_bytes", bytes: HEX32_F },
      ],
      envelopeBytes: "0x01000000736f6c616e612d73636370",
    },
    bundle: {
      version: 1,
      commitmentRoot: HEX32_C,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: SCCP_SOLANA_DOMAIN,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
        payloadHash: TAIRA_TO_SOLANA_PAYLOAD_HASH,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: TAIRA_TO_SOLANA_TRANSFER_PAYLOAD,
      },
      finalityProof: "0x010203",
    },
    ...overrides,
  };
};

const sampleFinalizedSolanaSourceBurn = () => {
  const amountBaseUnits = BSC_BRIDGE_AMOUNT_BASE_UNITS;
  const nonce = SOLANA_TO_TAIRA_TRANSFER_PAYLOAD.nonce;
  const finalizedSlot = "77";
  const sourceBurnReceiptAddress = deriveSccpSolanaSourceBurnReceiptAddress({
    sourceBridgeProgramAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
    sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
    ownerAddress: SOLANA_RECIPIENT_ADDRESS,
    nonce,
  });
  const recipientBytes = new TextEncoder().encode(TAIRA_SENDER);
  const recipientLength = new Uint8Array(2);
  new DataView(recipientLength.buffer).setUint16(
    0,
    recipientBytes.length,
    true,
  );
  const sourceEventHash = bytesToHex(
    sha256(
      concatBytes(
        new TextEncoder().encode(SCCP_SOLANA_SOURCE_BURN_EVENT_PREFIX),
        new PublicKey(SOLANA_SOURCE_BRIDGE_ADDRESS).toBytes(),
        new PublicKey(SOLANA_SOURCE_STATE_ADDRESS).toBytes(),
        new PublicKey(SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS).toBytes(),
        new PublicKey(SOLANA_RECIPIENT_ADDRESS).toBytes(),
        new PublicKey(SOLANA_SOURCE_TOKEN_ADDRESS).toBytes(),
        recipientLength,
        recipientBytes,
        u64LeBytes(amountBaseUnits),
        u64LeBytes(nonce),
        u64LeBytes(finalizedSlot),
      ),
    ),
  );
  const accountKeys = [
    SOLANA_RECIPIENT_ADDRESS,
    SOLANA_SOURCE_STATE_ADDRESS,
    SOLANA_SOURCE_TOKEN_ADDRESS,
    SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
    sourceBurnReceiptAddress,
    SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
    SCCP_SOLANA_SYSTEM_PROGRAM_ID,
    SOLANA_SOURCE_BRIDGE_ADDRESS,
  ];
  const burnEnvelope = concatBytes(
    borshVec(new TextEncoder().encode("burn_to_taira")),
    borshVec(u64LeBytes(amountBaseUnits)),
    borshVec(recipientBytes),
    borshVec(u64LeBytes(nonce)),
  );
  const burnCpi = concatBytes(Uint8Array.of(8), u64LeBytes(amountBaseUnits));
  const eventBytes = Array.from(hexToBytes(sourceEventHash));
  const transaction = {
    slot: Number(finalizedSlot),
    version: "legacy",
    transaction: {
      signatures: [SOLANA_SOURCE_EVENT_SIGNATURE],
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 3,
        },
        accountKeys,
        recentBlockhash: "11111111111111111111111111111111",
        instructions: [
          {
            programIdIndex: 7,
            accounts: [0, 1, 2, 3, 5, 4, 6],
            data: solanaBase58Encode(burnEnvelope),
          },
        ],
      },
    },
    meta: {
      err: null,
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: 5,
              accounts: [2, 3, 0],
              data: solanaBase58Encode(burnCpi),
            },
            {
              programIdIndex: 6,
              accounts: [0, 4],
              data: "1",
            },
          ],
        },
      ],
      preTokenBalances: [
        {
          accountIndex: 2,
          mint: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
          owner: SOLANA_RECIPIENT_ADDRESS,
          programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
          uiTokenAmount: {
            amount: "200000",
            decimals: 9,
            uiAmount: 0.0002,
            uiAmountString: "0.0002",
          },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 2,
          mint: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
          owner: SOLANA_RECIPIENT_ADDRESS,
          programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
          uiTokenAmount: {
            amount: "100000",
            decimals: 9,
            uiAmount: 0.0001,
            uiAmountString: "0.0001",
          },
        },
      ],
      logMessages: [
        `Program log: burned SCCP Solana XOR for TAIRA settlement: [${eventBytes.join(", ")}]`,
      ],
    },
  };
  const signatureStatus = {
    slot: Number(finalizedSlot),
    confirmations: null,
    err: null,
    confirmationStatus: "finalized",
  };
  return {
    transaction,
    signatureStatus,
    finality: { ...signatureStatus },
    finalizedSlot,
    sourceEventHash,
    sourceBurnReceiptAddress,
  };
};

const sampleFinalizedSolanaDestinationFinalize = () => {
  const request = buildTairaXorSolanaFinalizeTransactionRequest({
    manifest: READY_SOLANA_MANIFEST,
    job: sampleTairaToSolanaJob(),
    proofPackage: sampleSolanaDestinationProofPackage(),
    ownerAddress: SOLANA_RECIPIENT_ADDRESS,
    destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
    tairaSender: TAIRA_SENDER,
    solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
    amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
  });
  const instruction = request.transaction.instructions[0];
  const receiptAddress = instruction.accounts[7].pubkey;
  const mintAuthorityAddress = instruction.accounts[4].pubkey;
  const accountKeys = [
    SOLANA_RECIPIENT_ADDRESS,
    SOLANA_VERIFIER_STATE_ADDRESS,
    SOLANA_TOKEN_MINT_ADDRESS,
    SOLANA_DESTINATION_TOKEN_ADDRESS,
    receiptAddress,
    mintAuthorityAddress,
    SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
    SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
    SCCP_SOLANA_SYSTEM_PROGRAM_ID,
    SOLANA_VERIFIER_PROGRAM_ADDRESS,
  ];
  const preAmount = 900_000n;
  const amount = BigInt(request.amountBaseUnits);
  const finalizedSlot = "88";
  const tokenBalance = (rawAmount: bigint) => ({
    accountIndex: 3,
    mint: SOLANA_TOKEN_MINT_ADDRESS,
    owner: SOLANA_RECIPIENT_ADDRESS,
    programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
    uiTokenAmount: {
      amount: rawAmount.toString(),
      decimals: 9,
      uiAmount: null,
      uiAmountString: rawAmount.toString(),
    },
  });
  const transaction = {
    slot: Number(finalizedSlot),
    version: "legacy",
    transaction: {
      signatures: [SOLANA_ROUTE_CANARY_SIGNATURE],
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 5,
        },
        accountKeys,
        recentBlockhash: SOLANA_SOURCE_STATE_ADDRESS,
        instructions: [
          {
            programIdIndex: 9,
            accounts: [0, 1, 2, 3, 5, 6, 7, 4, 8],
            data: solanaBase58Encode(hexToBytes(instruction.dataHex)),
          },
        ],
      },
    },
    meta: {
      err: null,
      loadedAddresses: { writable: [], readonly: [] },
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: 6,
              accounts: [2, 3, 5],
              data: solanaBase58Encode(
                concatBytes(Uint8Array.of(7), u64LeBytes(amount.toString())),
              ),
              stackHeight: 2,
            },
          ],
        },
      ],
      preTokenBalances: [tokenBalance(preAmount)],
      postTokenBalances: [tokenBalance(preAmount + amount)],
    },
  };
  const signatureStatus = {
    slot: Number(finalizedSlot),
    confirmations: null,
    err: null,
    confirmationStatus: "finalized",
  };
  return {
    request,
    transaction,
    signatureStatus,
    finality: { ...signatureStatus },
    txId: SOLANA_ROUTE_CANARY_SIGNATURE,
    tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
    finalizedSlot,
  };
};

const sampleSolanaToTairaSourceProofPackage = (
  mutate?: (proofPackage: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const sourceBurn = sampleFinalizedSolanaSourceBurn();
  const commitment = {
    version: 1,
    kind: "Transfer" as const,
    targetDomain: SCCP_SORA_DOMAIN,
    messageId: SOLANA_TO_TAIRA_MESSAGE_ID,
    payloadHash: SOLANA_TO_TAIRA_PAYLOAD_HASH,
  };
  const merkleProof = { steps: [] };
  const commitmentRoot = sccpMerkleRootFromCommitment(
    {
      version: commitment.version,
      kind: commitment.kind,
      target_domain: commitment.targetDomain,
      message_id: commitment.messageId,
      payload_hash: commitment.payloadHash,
    },
    merkleProof,
  );
  const proofPackage = {
    version: 1,
    solanaNetwork: SCCP_SOLANA_NETWORK.networkId,
    solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    backend: SCCP_SOLANA_SOURCE_PROOF_BACKEND,
    sourceDomain: SCCP_SOLANA_DOMAIN,
    targetDomain: SCCP_SORA_DOMAIN,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    asset: "xor",
    messageBundle: {
      version: 1,
      commitmentRoot,
      commitment,
      merkleProof,
      payload: {
        kind: "Transfer",
        value: { ...SOLANA_TO_TAIRA_TRANSFER_PAYLOAD },
      },
      finalityProof: "0x010203",
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: SCCP_SOLANA_XOR_ROUTE_ID,
      asset: "xor",
    },
    txId: SOLANA_SOURCE_EVENT_SIGNATURE,
    messageId: SOLANA_TO_TAIRA_MESSAGE_ID,
    commitmentRoot,
    amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    payloadHash: SOLANA_TO_TAIRA_PAYLOAD_HASH,
    sourceBridgeAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
    sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
    tokenMintAddress: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
    sourceTokenAddress: SOLANA_SOURCE_TOKEN_ADDRESS,
    sourceBurnReceiptAddress: sourceBurn.sourceBurnReceiptAddress,
    ownerAddress: SOLANA_RECIPIENT_ADDRESS,
    tairaRecipient: TAIRA_SENDER,
    nonce: SOLANA_TO_TAIRA_TRANSFER_PAYLOAD.nonce,
    sourceEventHash: sourceBurn.sourceEventHash,
    finalizedSlot: sourceBurn.finalizedSlot,
    publicInputs: {
      version: 1,
      solanaNetwork: SCCP_SOLANA_NETWORK.networkId,
      solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      backend: SCCP_SOLANA_SOURCE_PROOF_BACKEND,
      sourceDomain: SCCP_SOLANA_DOMAIN,
      targetDomain: SCCP_SORA_DOMAIN,
      routeId: SCCP_SOLANA_XOR_ROUTE_ID,
      asset: "xor",
      txId: SOLANA_SOURCE_EVENT_SIGNATURE,
      tairaRecipient: TAIRA_SENDER,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: SOLANA_TO_TAIRA_MESSAGE_ID,
      commitmentRoot,
      payloadHash: SOLANA_TO_TAIRA_PAYLOAD_HASH,
      sourceBridgeAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
      sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
      tokenMintAddress: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
      sourceTokenAddress: SOLANA_SOURCE_TOKEN_ADDRESS,
      sourceBurnReceiptAddress: sourceBurn.sourceBurnReceiptAddress,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      nonce: SOLANA_TO_TAIRA_TRANSFER_PAYLOAD.nonce,
      sourceEventHash: sourceBurn.sourceEventHash,
      finalizedSlot: sourceBurn.finalizedSlot,
    },
  };
  mutate?.(proofPackage);
  return proofPackage;
};

const sampleSolanaSourceProofBindInput = (
  proofPackage: Record<string, unknown>,
  manifest: Record<string, unknown> = READY_SOLANA_MANIFEST,
): SolanaToTairaSourceProofPackageInput & { proofPackage: unknown } => {
  const sourceBurn = sampleFinalizedSolanaSourceBurn();
  return {
    manifest: {
      ...manifest,
      solanaTokenMint: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
    },
    proofPackage,
    solanaNetwork: SCCP_SOLANA_NETWORK.key,
    solanaNetworkId: SOLANA_TESTNET_NETWORK_ID,
    solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    sourceProofBackend: SCCP_SOLANA_SOURCE_PROOF_BACKEND,
    sourceBridgeAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
    sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
    tokenMintAddress: SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS,
    txId: SOLANA_SOURCE_EVENT_SIGNATURE,
    transaction: sourceBurn.transaction,
    signatureStatus: sourceBurn.signatureStatus,
    finality: sourceBurn.finality,
    solanaSender: SOLANA_RECIPIENT_ADDRESS,
    tairaRecipient: TAIRA_SENDER,
    amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
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

const sampleBscSourceData = (
  mutate?: (source: {
    transaction: Record<string, unknown>;
    receipt: Record<string, unknown>;
    indexedLogs: Record<string, unknown>[];
    block: Record<string, unknown>;
  }) => void,
) => {
  const erc20BurnLog = {
    address: BSC_TOKEN_ADDRESS,
    topics: [
      bytesToHex(
        keccak_256(
          new TextEncoder().encode("Transfer(address,address,uint256)"),
        ),
      ),
      `0x${"0".repeat(24)}${BSC_SENDER_ADDRESS_HEX.slice(2)}`,
      `0x${"00".repeat(32)}`,
    ],
    data: `0x${BigInt(BSC_BRIDGE_AMOUNT_TOKEN_BASE_UNITS)
      .toString(16)
      .padStart(64, "0")}`,
    transactionHash: BSC_SOURCE_TX_HASH,
    blockNumber: "0x7b",
    blockHash: BSC_SOURCE_BLOCK_HASH,
  };
  const sourceLog = {
    address: BSC_SOURCE_BRIDGE_ADDRESS,
    topics: [BSC_SOURCE_EVENT_TOPIC, BSC_SOURCE_EVENT_DIGEST],
    data: "0x",
    transactionHash: BSC_SOURCE_TX_HASH,
    blockNumber: "0x7b",
    blockHash: BSC_SOURCE_BLOCK_HASH,
  };
  const burnStartedLog = {
    address: BSC_BRIDGE_ADDRESS,
    topics: [
      SCCP_BSC_TAIRA_XOR_BURN_STARTED_TOPIC,
      BSC_SOURCE_EVENT_DIGEST,
      `0x${"0".repeat(24)}${BSC_SENDER_ADDRESS_HEX.slice(2)}`,
      TRON_TO_TAIRA_RECIPIENT_HASH,
    ],
    data: BSC_BURN_STARTED_EVENT_DATA,
    transactionHash: BSC_SOURCE_TX_HASH,
    blockNumber: "0x7b",
    blockHash: BSC_SOURCE_BLOCK_HASH,
  };
  const source = {
    transaction: {
      hash: BSC_SOURCE_TX_HASH,
      from: BSC_SENDER_ADDRESS,
      to: BSC_BRIDGE_ADDRESS,
      input: BSC_BURN_CALL_DATA,
    },
    receipt: {
      transactionHash: BSC_SOURCE_TX_HASH,
      transactionIndex: "0x1",
      status: "0x1",
      from: BSC_SENDER_ADDRESS,
      to: BSC_BRIDGE_ADDRESS,
      blockNumber: "0x7b",
      blockHash: BSC_SOURCE_BLOCK_HASH,
      logs: [
        { ...erc20BurnLog, topics: [...erc20BurnLog.topics] },
        { ...sourceLog, topics: [...sourceLog.topics] },
        { ...burnStartedLog, topics: [...burnStartedLog.topics] },
      ],
    },
    indexedLogs: [{ ...sourceLog, topics: [...sourceLog.topics] }],
    block: {
      hash: BSC_SOURCE_BLOCK_HASH,
      number: "0x7b",
      transactions: [BSC_SOURCE_TX_HASH],
    },
  };
  mutate?.(source);
  return source;
};

const sampleBoundBscSourceDataInput = (
  mutate?: Parameters<typeof sampleBscSourceData>[0],
) => ({
  txId: BSC_SOURCE_TX_HASH,
  bridgeAddress: BSC_BRIDGE_ADDRESS,
  sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  bscSender: BSC_SENDER_ADDRESS,
  tairaRecipient: TAIRA_SENDER,
  amountDecimal: BRIDGE_AMOUNT_DECIMAL,
  ...sampleBscSourceData(mutate),
});

const sampleBscToTairaSourceProofPackage = (
  mutate?: (proofPackage: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transferPayload = {
    version: 1,
    source_domain: SCCP_BSC_DOMAIN,
    dest_domain: SCCP_SORA_DOMAIN,
    nonce: BSC_TO_TAIRA_NONCE,
    asset_home_domain: SCCP_SORA_DOMAIN,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: "xor",
    amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    sender_codec: SCCP_CODEC_EVM_HEX,
    sender: BSC_SENDER_ADDRESS,
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient: TAIRA_SENDER,
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: "taira_bsc_xor",
  };
  const proofPackageTransferPayload = {
    ...transferPayload,
    sender: BSC_SENDER_ADDRESS_HEX,
  };
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: transferPayload,
    }),
  );
  const messageId = sccpTransferMessageId(transferPayload);
  const commitment = {
    version: 1,
    kind: "Transfer" as const,
    targetDomain: SCCP_SORA_DOMAIN,
    messageId,
    payloadHash,
  };
  const merkleProof = { steps: [] };
  const commitmentRoot = sccpMerkleRootFromCommitment(
    {
      version: commitment.version,
      kind: commitment.kind,
      target_domain: commitment.targetDomain,
      message_id: commitment.messageId,
      payload_hash: commitment.payloadHash,
    },
    merkleProof,
  );
  const proofPackage = {
    ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
    messageBundle: {
      version: 1,
      commitmentRoot,
      commitment,
      merkleProof,
      payload: {
        kind: "Transfer",
        value: proofPackageTransferPayload,
      },
      finalityProof: "0x010203",
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: "taira_bsc_xor",
    },
    sourceEventDigest: BSC_SOURCE_EVENT_DIGEST,
    txId: BSC_SOURCE_TX_HASH,
    messageId,
    amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    publicInputs: {
      sourceDomain: SCCP_BSC_DOMAIN,
      targetDomain: SCCP_SORA_DOMAIN,
      messageId,
      payloadHash,
      commitmentRoot,
      txId: BSC_SOURCE_TX_HASH,
      sourceEventDigest: BSC_SOURCE_EVENT_DIGEST,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      sender: BSC_SENDER_ADDRESS_HEX,
      recipient: TAIRA_SENDER,
      routeId: "taira_bsc_xor",
    },
  };
  mutate?.(proofPackage);
  return proofPackage;
};

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

  it("normalizes BSC transaction hashes without accepting message-id shortcuts", () => {
    expect(normalizeBscTransactionHash(` 0X${"AB".repeat(32)} `)).toBe(
      `0x${"ab".repeat(32)}`,
    );
    expect(isValidBscTransactionHash(`0x${"11".repeat(32)}`)).toBe(true);
    expect(isValidBscTransactionHash("11".repeat(32))).toBe(false);
    expect(() => normalizeBscTransactionHash("11".repeat(32))).toThrow(
      /0x-prefixed/,
    );
    expect(() => normalizeBscTransactionHash(`0x${"00".repeat(32)}`)).toThrow(
      /non-zero/,
    );
  });

  it("normalizes supported TRON SCCP network ids by profile", () => {
    expect(SCCP_TRON_NETWORK.key).toBe("mainnet");
    expect(normalizeSccpTronNetworkKey("")).toBe("mainnet");
    expect(normalizeSccpTronNetworkKey(" tron-nile ")).toBe("nile");
    expect(() => normalizeSccpTronNetworkKey("shasta")).toThrow(
      /mainnet or nile/,
    );
    expect(normalizeTronNetworkIdHex(TRON_MAINNET_CHAIN_ID_HEX)).toBe(
      TRON_MAINNET_NETWORK_ID_HEX,
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
    expect(() => normalizeTronNetworkIdHex(HEX32_C)).toThrow(/Mainnet/);
    expect(() => normalizeTronNetworkIdHex(TRON_NILE_NETWORK_ID_HEX)).toThrow(
      /Mainnet/,
    );
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

  it("normalizes BSC testnet route metadata and EVM addresses", () => {
    expect(SCCP_BSC_NETWORK.key).toBe("testnet");
    expect(normalizeBscNetworkIdHex(BSC_TESTNET_CHAIN_ID_HEX)).toBe(
      BSC_TESTNET_NETWORK_ID_HEX,
    );
    expect(
      normalizeBscNetworkIdHex(BSC_TESTNET_NETWORK_ID_HEX.toUpperCase()),
    ).toBe(BSC_TESTNET_NETWORK_ID_HEX);
    expect(() => normalizeBscNetworkIdHex(TRON_MAINNET_CHAIN_ID_HEX)).toThrow(
      /BSC Testnet/,
    );
    expect(normalizeEvmAddress(BSC_BRIDGE_ADDRESS.toUpperCase())).toBe(
      BSC_BRIDGE_ADDRESS_HEX,
    );
    expect(canonicalEip55EvmAddress(BSC_MIXED_RECIPIENT_ADDRESS_LOWER)).toBe(
      BSC_MIXED_RECIPIENT_ADDRESS,
    );
    expect(normalizeEvmAddress(BSC_MIXED_RECIPIENT_ADDRESS)).toBe(
      BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
    );
    expect(isValidBscAddress(BSC_BRIDGE_ADDRESS)).toBe(true);
    expect(
      isValidBscAddress("0x1111111111111111111111111111111111111111"),
    ).toBe(true);
    expect(() =>
      normalizeBscRouteEvidenceAddress(
        "0x1111111111111111111111111111111111111111",
        "BSC bridge address",
      ),
    ).toThrow(/repeated-byte placeholder material/);
    expect(
      isValidBscAddress("0x0000000000000000000000000000000000000000"),
    ).toBe(false);
    expect(readSccpBscBridgeAddress(READY_BSC_MANIFEST)).toBe(
      BSC_BRIDGE_ADDRESS,
    );
    expect(readSccpBscTokenAddress(READY_BSC_MANIFEST)).toBe(BSC_TOKEN_ADDRESS);
    expect(readSccpBscSourceBridgeAddress(READY_BSC_MANIFEST)).toBe(
      BSC_SOURCE_BRIDGE_ADDRESS,
    );
    expect(readSccpBscRuntimeProverConfigUrl(READY_BSC_MANIFEST)).toBe(
      "/sccp-bsc/taira-bsc-xor-runtime.config.json",
    );
    expect(() =>
      readSccpBscSourceBridgeAddress({
        ...READY_BSC_MANIFEST,
        sccpBscSourceBridgeAddress: undefined,
        sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
      }),
    ).toThrow(/must not use TRON aliases.*sccp_tron_source_bridge_address/);
    expect(() =>
      readSccpBscVerifierAddress({
        ...READY_BSC_MANIFEST,
        bscVerifierAddress: undefined,
        tron_verifier_address: BSC_VERIFIER_ADDRESS,
      }),
    ).toThrow(/must not use TRON aliases.*tron_verifier_address/);
    expect(
      readSccpBscSourceBridgeAddress({
        ...READY_BSC_MANIFEST,
        sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS.toUpperCase(),
        source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
      }),
    ).toBe(BSC_SOURCE_BRIDGE_ADDRESS.toUpperCase());
    expect(() =>
      readSccpBscSourceBridgeAddress({
        ...READY_BSC_MANIFEST,
        source_bridge_address: BSC_BRIDGE_ADDRESS,
      }),
    ).toThrow(/source bridge address aliases disagree/);
    expect(() =>
      readSccpBscBridgeAddress({
        ...READY_BSC_MANIFEST,
        bscBridgeAddress: "0x1111111111111111111111111111111111111111",
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          destinationBridgeAddress:
            "0x1111111111111111111111111111111111111111",
        },
      }),
    ).toThrow(/repeated-byte placeholder material/);
    expect(() =>
      readSccpBscVerifierAddress({
        ...READY_BSC_MANIFEST,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          verifierIdentity: BSC_BRIDGE_ADDRESS,
        },
      }),
    ).toThrow(/verifier address aliases disagree/);
    expect(readSccpBscRpcEndpoint(READY_BSC_MANIFEST)).toBe(
      BSC_TESTNET_RPC_URL,
    );
    expect(
      readSccpBscRpcEndpoint({
        ...READY_BSC_MANIFEST,
        bsc_network: "bsc-testnet",
        bsc_rpc_url: BSC_TESTNET_RPC_URL,
      }),
    ).toBe(BSC_TESTNET_RPC_URL);
    expect(() =>
      readSccpBscRpcEndpoint({
        ...READY_BSC_MANIFEST,
        bsc_network: "mainnet",
      }),
    ).toThrow(/BSC network aliases disagree/);
    expect(() =>
      readSccpBscRpcEndpoint({
        ...READY_BSC_MANIFEST,
        bsc_rpc_url: BSC_MAINNET_RPC_URL,
      }),
    ).toThrow(/BSC RPC endpoint aliases disagree/);
    expect(readSccpBscProofMaterial(READY_BSC_MANIFEST)).toMatchObject({
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      verifierAddressHex: BSC_VERIFIER_ADDRESS_HEX,
      bridgeAddressHex: BSC_BRIDGE_ADDRESS_HEX,
      expectedDestinationBindingHashHex: BSC_DESTINATION_BINDING.bindingHash,
    });

    const accessorBackedBscManifest: Record<string, unknown> = {
      ...READY_BSC_MANIFEST,
    };
    const accessorReads: string[] = [];
    Object.defineProperty(accessorBackedBscManifest, "destinationRollout", {
      enumerable: true,
      get() {
        accessorReads.push("destinationRollout");
        return READY_BSC_MANIFEST.destinationRollout;
      },
    });
    expect(() => readSccpBscBridgeAddress(accessorBackedBscManifest)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(() => readSccpBscTokenAddress(accessorBackedBscManifest)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(() =>
      readSccpBscSourceBridgeAddress(accessorBackedBscManifest),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(() => readSccpBscVerifierAddress(accessorBackedBscManifest)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(() => readSccpBscRpcEndpoint(accessorBackedBscManifest)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(() =>
      buildTairaXorBscBurnTransactionRequest({
        manifest: accessorBackedBscManifest,
        ownerAddress: BSC_MIXED_RECIPIENT_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "1",
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(() =>
      readBscSourceProverMaterialBinding(accessorBackedBscManifest),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(readSccpBscProofMaterial(accessorBackedBscManifest)).toBeNull();
    expect(accessorReads).toEqual([]);
  });

  it("requires a production-ready BSC testnet XOR manifest for BSC route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_BSC_MANIFEST, READY_TRON_MANIFEST],
      },
      counterparty: "bsc",
    });
    expect(ready.ready).toBe(true);
    expect(ready.counterparty).toBe("bsc");
    expect(ready.manifest).toStrictEqual(READY_BSC_MANIFEST);
    expect(ready.bscManifest).toStrictEqual(READY_BSC_MANIFEST);

    const mainnetReady = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_BSC_MAINNET_MANIFEST],
      },
      counterparty: "bsc",
      bscNetwork: "mainnet",
    });
    expect(mainnetReady.ready).toBe(true);
    expect(mainnetReady.bscManifest).toStrictEqual(READY_BSC_MAINNET_MANIFEST);

    const missingRoute = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [{ ...READY_BSC_MANIFEST, routeId: "taira_bsc_other" }],
      },
      counterparty: "bsc",
    });
    expect(missingRoute.ready).toBe(false);
    expect(missingRoute.reasons.join(" ")).toContain("taira_bsc_xor");

    const staged = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_BSC_MANIFEST,
            productionReady: false,
            disabledReason: "BSC route is still staged.",
          },
        ],
      },
      counterparty: "bsc",
    });
    expect(staged.ready).toBe(false);
    expect(staged.reasons.join(" ")).toContain("still staged");

    const wrongNetwork = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_BSC_MANIFEST,
            destinationRollout: {
              ...READY_BSC_MANIFEST.destinationRollout,
              destinationNetworkId: TRON_MAINNET_NETWORK_ID_HEX,
            },
          },
        ],
      },
      counterparty: "bsc",
    });
    expect(wrongNetwork.ready).toBe(false);
    expect(wrongNetwork.reasons.join(" ")).toMatch(
      /BSC SCCP verifier rollout proof material is incomplete/,
    );
  });

  it("requires a production-ready TON testnet XOR manifest for TON route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    expect(isValidTonRawAddress(TON_RECIPIENT_ADDRESS)).toBe(true);
    expect(isValidTonRawAddress(`0:${"00".repeat(32)}`)).toBe(false);
    expect(
      pickTonSccpManifest({ manifests: [READY_TON_MANIFEST] }),
    ).toStrictEqual(READY_TON_MANIFEST);
    expect(readSccpTonBridgeAddress(READY_TON_MANIFEST)).toBe(
      TON_BRIDGE_ADDRESS,
    );
    expect(readSccpTonTokenAddress(READY_TON_MANIFEST)).toBe(TON_TOKEN_ADDRESS);
    expect(readSccpTonSourceBridgeAddress(READY_TON_MANIFEST)).toBe(
      TON_SOURCE_BRIDGE_ADDRESS,
    );
    expect(readSccpTonVerifierAddress(READY_TON_MANIFEST)).toBe(
      TON_VERIFIER_ADDRESS,
    );
    expect(readSccpTonFinalizeMessageValueNano(READY_TON_MANIFEST)).toBe(
      "100000000",
    );
    expect(readSccpTonRpcEndpoint(READY_TON_MANIFEST)).toBe(
      SCCP_TON_NETWORK.rpcUrl,
    );
    expect(readSccpTonProofMaterial(READY_TON_MANIFEST)).toMatchObject({
      networkIdHex: SCCP_TON_NETWORK.networkIdHex,
      tonVerifierAddress: TON_VERIFIER_ADDRESS,
      expectedDestinationBindingHashHex: HEX32_C,
    });

    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_TON_MANIFEST, READY_TRON_MANIFEST],
      },
      counterparty: "ton",
    });
    expect(ready.ready).toBe(true);
    expect(ready.counterparty).toBe("ton");
    expect(ready.manifest).toStrictEqual(READY_TON_MANIFEST);
    expect(ready.tonManifest).toStrictEqual(READY_TON_MANIFEST);

    const missingRoute = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [{ ...READY_TON_MANIFEST, routeId: "taira_ton_other" }],
      },
      counterparty: "ton",
    });
    expect(missingRoute.ready).toBe(false);
    expect(missingRoute.reasons.join(" ")).toContain(SCCP_TON_XOR_ROUTE_ID);

    const endpointFailure = classifySccpRouteLoadFailure(
      new Error("Torii responded with HTTP 502 Bad Gateway"),
      {
        toriiUrl: "https://taira.sora.org",
        stage: "manifest",
      },
    );
    expect(endpointFailure.kind).toBe("endpoint_unavailable");
    expect(endpointFailure.status).toBe(502);
    expect(endpointFailure.message).toContain("TAIRA Torii is unavailable");
    expect(endpointFailure.message).toContain("HTTP 502 Bad Gateway");
    const endpointUnavailable = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: null,
      manifestSet: null,
      loadFailure: endpointFailure,
      counterparty: "ton",
    });
    expect(endpointUnavailable.ready).toBe(false);
    expect(endpointUnavailable.status).toBe("unavailable");
    expect(endpointUnavailable.reasons).toEqual([endpointFailure.message]);
    expect(endpointUnavailable.reasons.join(" ")).not.toContain(
      "No TON SCCP manifest",
    );

    const manifestFailure = classifySccpRouteLoadFailure(
      new Error("manifest parser rejected response"),
      {
        toriiUrl: "https://taira.sora.org",
        stage: "manifest",
      },
    );
    expect(manifestFailure.kind).toBe("manifest_unavailable");
    const manifestUnavailable = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: null,
      loadFailure: manifestFailure,
      counterparty: "ton",
    });
    expect(manifestUnavailable.ready).toBe(false);
    expect(manifestUnavailable.reasons).toEqual([manifestFailure.message]);
    expect(manifestUnavailable.reasons.join(" ")).not.toContain(
      "SCCP proof manifests have not been loaded",
    );

    const missingVerifierMaterial = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_TON_MANIFEST,
            destinationRollout: {
              ...READY_TON_MANIFEST.destinationRollout,
              verifierCodeHash: "",
            },
          },
        ],
      },
      counterparty: "ton",
    });
    expect(missingVerifierMaterial.ready).toBe(false);
    expect(missingVerifierMaterial.reasons.join(" ")).toContain(
      "TON SCCP verifier rollout proof material is incomplete",
    );

    const missingSourceProver = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_TON_MANIFEST,
            sourceBrowserProver: undefined,
          },
        ],
      },
      counterparty: "ton",
    });
    expect(missingSourceProver.ready).toBe(false);
    expect(missingSourceProver.reasons.join(" ")).toContain(
      "browser-safe TON source proof module",
    );

    const repeatedSourceMaterial = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_TON_MANIFEST,
            sourceAdapterEngineDeployment: {
              ...READY_TON_MANIFEST.sourceAdapterEngineDeployment,
              tonMasterchainConfigVerifierHash: repeatedHex32("42"),
            },
          },
        ],
      },
      counterparty: "ton",
    });
    expect(repeatedSourceMaterial.ready).toBe(false);
    expect(repeatedSourceMaterial.reasons.join(" ")).toContain(
      "repeated-byte placeholder material",
    );

    const governedTonAuditMaterial = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_TON_MANIFEST,
            sourceAdapterEngineDeployment: {
              ...READY_TON_MANIFEST.sourceAdapterEngineDeployment,
              tonMasterchainConfigVerifierHash: repeatedHex32("26"),
              tonValidatorSetTransitionVerifierHash: repeatedHex32("27"),
              tonShardAccountsDictionaryVerifierHash: repeatedHex32("28"),
            },
          },
        ],
      },
      counterparty: "ton",
    });
    expect(governedTonAuditMaterial.ready).toBe(true);

    const missingFinalizeValue = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_TON_MANIFEST,
            tonFinalizeMessageValueNano: "",
          },
        ],
      },
      counterparty: "ton",
    });
    expect(missingFinalizeValue.ready).toBe(true);
    expect(
      readSccpTonFinalizeMessageValueNano({
        ...READY_TON_MANIFEST,
        tonFinalizeMessageValueNano: "",
      }),
    ).toBe("1000000");
    expect(missingFinalizeValue.reasons.join(" ")).not.toContain(
      "TON finalize message value",
    );
  });

  it("requires a production-ready Solana testnet XOR manifest for Solana route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    expect(isValidSolanaAddress(SOLANA_RECIPIENT_ADDRESS)).toBe(true);
    expect(isValidSolanaAddress("11111111111111111111111111111111")).toBe(
      false,
    );
    expect(
      isValidSolanaTransactionSignature(SOLANA_SOURCE_EVENT_SIGNATURE),
    ).toBe(true);
    expect(normalizeSolanaAddress(SOLANA_BRIDGE_PROGRAM_ADDRESS)).toBe(
      SOLANA_BRIDGE_PROGRAM_ADDRESS,
    );
    expect(
      normalizeSolanaTransactionSignature(SOLANA_SOURCE_EVENT_SIGNATURE),
    ).toBe(SOLANA_SOURCE_EVENT_SIGNATURE);
    expect(
      pickSolanaSccpManifest({ manifests: [READY_SOLANA_MANIFEST] }),
    ).toStrictEqual(READY_SOLANA_MANIFEST);
    expect(readSccpSolanaProgramAddress(READY_SOLANA_MANIFEST)).toBe(
      SOLANA_BRIDGE_PROGRAM_ADDRESS,
    );
    expect(readSccpSolanaTokenAddress(READY_SOLANA_MANIFEST)).toBe(
      SOLANA_TOKEN_MINT_ADDRESS,
    );
    expect(readSccpSolanaSourceBridgeAddress(READY_SOLANA_MANIFEST)).toBe(
      SOLANA_SOURCE_BRIDGE_ADDRESS,
    );
    expect(readSccpSolanaVerifierAddress(READY_SOLANA_MANIFEST)).toBe(
      SOLANA_VERIFIER_PROGRAM_ADDRESS,
    );
    expect(readSccpSolanaRpcEndpoint(READY_SOLANA_MANIFEST)).toBe(
      SCCP_SOLANA_NETWORK.rpcUrl,
    );
    expect(readSccpSolanaSourceProverModuleUrl(READY_SOLANA_MANIFEST)).toBe(
      "/sccp-solana/source-prover.js",
    );
    expect(readSccpSolanaSourceProverModuleHash(READY_SOLANA_MANIFEST)).toBe(
      fixtureHash("solana source browser prover module"),
    );
    expect(readSccpSolanaSourceProverSidecarHash(READY_SOLANA_MANIFEST)).toBe(
      fixtureHash("solana source browser prover manifest"),
    );
    expect(
      readSccpSolanaDestinationProverModuleUrl(READY_SOLANA_MANIFEST),
    ).toBe("/sccp-solana/destination-prover.js");
    expect(
      readSccpSolanaDestinationProverModuleHash(READY_SOLANA_MANIFEST),
    ).toBe(fixtureHash("solana destination browser prover module"));
    expect(
      readSccpSolanaDestinationProverSidecarHash(READY_SOLANA_MANIFEST),
    ).toBe(fixtureHash("solana destination browser prover manifest"));
    expect(readSccpSolanaProofMaterial(READY_SOLANA_MANIFEST)).toMatchObject({
      networkId: SCCP_SOLANA_NETWORK.networkId,
      solanaVerifierAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
      nativeVerifierProgramAddress: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
      expectedDestinationBindingHashHex: HEX32_C,
    });
    expect(
      readSccpSolanaVerifierMintInstructionAccounts(
        READY_SOLANA_MANIFEST,
        SOLANA_RECIPIENT_ADDRESS,
        SOLANA_DESTINATION_TOKEN_ADDRESS,
        TAIRA_TO_SOLANA_MESSAGE_ID,
      ),
    ).toEqual([
      {
        pubkey: SOLANA_RECIPIENT_ADDRESS,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SOLANA_VERIFIER_STATE_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SOLANA_TOKEN_MINT_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SOLANA_DESTINATION_TOKEN_ADDRESS,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: deriveSccpSolanaMintAuthorityAddress({
          verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
          verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
        }),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: deriveSccpSolanaMessageReceiptAddress({
          verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
          verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
          messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
        }),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SCCP_SOLANA_SYSTEM_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ]);

    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [READY_SOLANA_MANIFEST, READY_TRON_MANIFEST],
      },
      counterparty: "solana",
    });
    expect(ready.ready).toBe(true);
    expect(ready.counterparty).toBe("solana");
    expect(ready.manifest).toStrictEqual(READY_SOLANA_MANIFEST);
    expect(ready.solanaManifest).toStrictEqual(READY_SOLANA_MANIFEST);

    const missingRoute = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [{ ...READY_SOLANA_MANIFEST, routeId: "taira_sol_other" }],
      },
      counterparty: "solana",
    });
    expect(missingRoute.ready).toBe(false);
    expect(missingRoute.reasons.join(" ")).toContain(SCCP_SOLANA_XOR_ROUTE_ID);

    const staged = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            productionReady: false,
            disabledReason: "Solana route is still staged.",
          },
        ],
      },
      counterparty: "solana",
    });
    expect(staged.ready).toBe(false);
    expect(staged.reasons.join(" ")).toContain("still staged");

    const incomplete = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            solanaProgramdataSlot: 0,
            sourceBrowserProver: undefined,
          },
        ],
      },
      counterparty: "solana",
    });
    expect(incomplete.ready).toBe(false);
    expect(incomplete.reasons.join(" ")).toContain(
      "browser-safe Solana source proof module",
    );
    expect(incomplete.reasons.join(" ")).toContain(
      "programdata slot must be a positive integer",
    );

    const missingProverHashes = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            sourceBrowserProver: {
              ...READY_SOLANA_MANIFEST.sourceBrowserProver,
              moduleHash: undefined,
            },
            destinationBrowserProver: {
              ...READY_SOLANA_MANIFEST.destinationBrowserProver,
              moduleHash: undefined,
            },
          },
        ],
      },
      counterparty: "solana",
    });
    expect(missingProverHashes.ready).toBe(false);
    expect(missingProverHashes.reasons.join(" ")).toContain(
      "Solana source proof module hash",
    );
    expect(missingProverHashes.reasons.join(" ")).toContain(
      "Solana destination proof module hash",
    );

    const shapeOnlyAdmission = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            destinationProofAdmission: {
              admissionMode: "envelope-recorder-v1",
              proofSystem: "none",
              entrypoint: "submit_sccp_message_proof",
              nativeVerifierProgramId: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
              verifierCodeHash: HEX32_D,
              verifierKeyHash: HEX32_E,
              destinationBindingHash: HEX32_C,
              shapeOnly: true,
              acceptsUnverifiedProofs: true,
            },
          },
        ],
      },
      counterparty: "solana",
    });
    expect(shapeOnlyAdmission.ready).toBe(false);
    expect(shapeOnlyAdmission.reasons.join(" ")).toContain(
      "admission mode must be governed-zk-verifier-v1",
    );
    expect(shapeOnlyAdmission.reasons.join(" ")).toContain(
      "shapeOnly must be false",
    );

    const missingInstructionAccounts = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            solanaVerifierMintInstructionAccounts: undefined,
          },
        ],
      },
      counterparty: "solana",
    });
    expect(missingInstructionAccounts.ready).toBe(false);
    expect(missingInstructionAccounts.reasons.join(" ")).toContain(
      "verifier mint instruction accounts are missing",
    );

    const ambiguousInstructionAccounts = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            solanaVerifierInstructionAccounts: [],
          },
        ],
      },
      counterparty: "solana",
    });
    expect(ambiguousInstructionAccounts.ready).toBe(false);
    expect(ambiguousInstructionAccounts.reasons.join(" ")).toContain(
      "Generic Solana verifier instruction accounts are unsupported",
    );
  });

  it("requires every Solana prover manifest alias to agree without URL/hash splicing", () => {
    const destinationRecord = {
      ...READY_SOLANA_MANIFEST.destinationBrowserProver,
      module_url: READY_SOLANA_MANIFEST.destinationBrowserProver.moduleUrl,
      module_hash: READY_SOLANA_MANIFEST.destinationBrowserProver.moduleHash,
    };
    const sourceRecord = {
      ...READY_SOLANA_MANIFEST.sourceBrowserProver,
      module_url: READY_SOLANA_MANIFEST.sourceBrowserProver.moduleUrl,
      module_hash: READY_SOLANA_MANIFEST.sourceBrowserProver.moduleHash,
    };
    const agreeing = {
      ...READY_SOLANA_MANIFEST,
      destinationBrowserProver: destinationRecord,
      destination_browser_prover: { ...destinationRecord },
      sourceBrowserProver: sourceRecord,
      source_browser_prover: { ...sourceRecord },
    };
    expect(readSccpSolanaDestinationProverModuleUrl(agreeing)).toBe(
      destinationRecord.moduleUrl,
    );
    expect(readSccpSolanaDestinationProverModuleHash(agreeing)).toBe(
      destinationRecord.moduleHash,
    );
    expect(readSccpSolanaSourceProverModuleUrl(agreeing)).toBe(
      sourceRecord.moduleUrl,
    );
    expect(readSccpSolanaSourceProverModuleHash(agreeing)).toBe(
      sourceRecord.moduleHash,
    );

    const conflictingFieldAlias = {
      ...READY_SOLANA_MANIFEST,
      destinationBrowserProver: {
        ...READY_SOLANA_MANIFEST.destinationBrowserProver,
        module_url: "/sccp-solana/substituted-destination-prover.js",
      },
    };
    expect(() =>
      readSccpSolanaDestinationProverModuleUrl(conflictingFieldAlias),
    ).toThrow(/destination proof module URL aliases disagree/u);

    const conflictingRecordAlias = {
      ...READY_SOLANA_MANIFEST,
      source_browser_prover: {
        ...READY_SOLANA_MANIFEST.sourceBrowserProver,
        moduleHash: fixtureHash("substituted source module"),
      },
    };
    expect(() =>
      readSccpSolanaSourceProverModuleHash(conflictingRecordAlias),
    ).toThrow(/source proof module hash aliases disagree/u);

    const spliced = {
      ...READY_SOLANA_MANIFEST,
      destinationBrowserProver: {
        moduleUrl: READY_SOLANA_MANIFEST.destinationBrowserProver.moduleUrl,
      },
      destination_browser_prover: {
        moduleHash: READY_SOLANA_MANIFEST.destinationBrowserProver.moduleHash,
      },
    };
    expect(() => readSccpSolanaDestinationProverModuleUrl(spliced)).toThrow(
      /must be present in every configured prover record alias/u,
    );
    expect(() => readSccpSolanaDestinationProverModuleHash(spliced)).toThrow(
      /must be present in every configured prover record alias/u,
    );
  });

  it("requires the STARK-FRI proof family for Solana source adapter readiness", () => {
    const readinessInput = {
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: {
        proofSubmitPath: "/v1/bridge/proofs/submit",
        messageSubmitPath: "/v1/bridge/messages",
      },
      counterparty: "solana" as const,
    };

    const starkFri = resolveSccpRouteReadiness({
      ...readinessInput,
      manifestSet: { manifests: [READY_SOLANA_MANIFEST] },
    });
    expect(starkFri.ready).toBe(true);

    const groth16 = resolveSccpRouteReadiness({
      ...readinessInput,
      manifestSet: {
        manifests: [
          {
            ...READY_SOLANA_MANIFEST,
            sourceAdapterEngineDeployment: {
              ...READY_SOLANA_MANIFEST.sourceAdapterEngineDeployment,
              adapterProofFamily: "groth16-v1",
            },
          },
        ],
      },
    });
    expect(groth16.ready).toBe(false);
    expect(groth16.reasons).toContain(
      "Solana source adapter deployment must use stark-fri-v1.",
    );
  });

  it("builds and binds TON -> TAIRA source packages with finality proof bytes", async () => {
    const { proveTonSccpSource } = (await import(
      "../src/provers/sccp-ton-source-prover.js"
    )) as {
      proveTonSccpSource: (input: unknown) => Promise<Record<string, unknown>>;
    };

    const proofPackage = await proveTonSccpSource({
      txId: HEX32_A,
      tonSender: TON_RECIPIENT_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: "0.000001",
      transaction: {
        nonce: "1",
      },
    });

    expect(
      String(
        (proofPackage.messageBundle as Record<string, unknown>).finalityProof,
      ),
    ).toMatch(/^0x[0-9a-f]+$/u);

    const bound = bindTonToTairaSourceProofPackage({
      manifest: READY_TON_MANIFEST,
      proofPackage,
      txId: HEX32_A,
      tonSender: TON_RECIPIENT_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: "0.000001",
    });

    expect(bound.amountBaseUnits).toBe("1000");
    expect(bound.txId).toBe(HEX32_A);
    expect(bound.messageBundle.finalityProof).toBe(
      (proofPackage.messageBundle as Record<string, unknown>).finalityProof,
    );
    expect(
      (
        buildSccpMessageBundleSubmitPayload(bound.messageBundle) as Record<
          string,
          unknown
        >
      ).finality_proof,
    ).toBe(
      (proofPackage.messageBundle as Record<string, unknown>).finalityProof,
    );
    expect(bound.settlement).toMatchObject({
      entrypoint: "finalize_inbound",
      route: SCCP_TON_XOR_ROUTE_ID,
    });
  });

  it("uses on-chain SCCP lane material parameters for BSC route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const routeOnlyBscManifest: Record<string, unknown> = {
      ...READY_BSC_MANIFEST,
    };
    delete routeOnlyBscManifest.sourceVerifierMaterial;
    delete routeOnlyBscManifest.sourceAdapterEngineDeployment;
    const parameters = {
      custom: {
        sccp_lane_materials_v1: {
          payload: {
            sccp_source_verifier_materials: [
              {
                ...BSC_SOURCE_VERIFIER_MATERIAL,
                source_bridge_network_id: BSC_TESTNET_NETWORK_ID_HEX,
              },
            ],
            sccp_source_adapter_engine_deployments: [
              {
                ...BSC_SOURCE_ADAPTER_ENGINE_DEPLOYMENT,
                source_bridge_network_id: BSC_TESTNET_NETWORK_ID_HEX,
              },
            ],
          },
        },
      },
    };

    const manifestSet = mergeSccpLaneMaterialsIntoManifestSet(
      { routes: [routeOnlyBscManifest], manifests: [READY_TRON_MANIFEST] },
      parameters,
      "testnet",
    );
    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: manifestSet as Record<string, unknown>,
      counterparty: "bsc",
    });

    expect(routeOnlyBscManifest).not.toHaveProperty("sourceVerifierMaterial");
    expect(ready.ready).toBe(true);
    expect(ready.bscManifest).toMatchObject({
      sourceVerifierMaterial: expect.objectContaining({
        sourceDomain: SCCP_BSC_DOMAIN,
      }),
      sourceAdapterEngineDeployment: expect.objectContaining({
        targetDomain: SCCP_SORA_DOMAIN,
      }),
    });
  });

  it("uses on-chain SCCP lane material parameters for TON route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const routeOnlyTonManifest: Record<string, unknown> = {
      ...READY_TON_MANIFEST,
    };
    delete routeOnlyTonManifest.sourceVerifierMaterial;
    delete routeOnlyTonManifest.sourceAdapterEngineDeployment;
    const tonVerifierMaterialWithoutTarget: Record<string, unknown> = {
      ...TON_SOURCE_VERIFIER_MATERIAL,
      source_bridge_network_id: repeatedHex32("00"),
    };
    delete tonVerifierMaterialWithoutTarget.targetDomain;
    const parameters = {
      custom: {
        sccp_lane_materials_v1: {
          payload: {
            sccp_source_verifier_materials: [tonVerifierMaterialWithoutTarget],
            sccp_source_adapter_engine_deployments: [
              {
                ...TON_SOURCE_ADAPTER_ENGINE_DEPLOYMENT,
                source_bridge_network_id: repeatedHex32("00"),
              },
            ],
          },
        },
      },
    };

    const manifestSet = mergeSccpLaneMaterialsIntoManifestSet(
      { routes: [routeOnlyTonManifest], manifests: [READY_TRON_MANIFEST] },
      parameters,
      "testnet",
      "testnet",
    );
    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: manifestSet as Record<string, unknown>,
      counterparty: "ton",
    });

    expect(routeOnlyTonManifest).not.toHaveProperty("sourceVerifierMaterial");
    expect(ready.ready).toBe(true);
    expect(ready.tonManifest).toMatchObject({
      sourceVerifierMaterial: expect.objectContaining({
        sourceDomain: SCCP_TON_DOMAIN,
      }),
      sourceAdapterEngineDeployment: expect.objectContaining({
        targetDomain: SCCP_SORA_DOMAIN,
      }),
    });
  });

  it("accepts governed TON lane material when the capability flag is stale", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
      counterparties: [
        {
          domain: SCCP_TON_DOMAIN,
          chain: "ton",
          production_ready: false,
          disabled_reason:
            "disabled until real browser-safe TON source/destination prover modules and non-placeholder TON source light-client verifier hashes are published",
        },
      ],
    };
    const destinationBindingHash = sccpDestinationBindingHash(SCCP_TON_DOMAIN);
    const tonSourceVerifierMaterial = {
      sourceDomain: SCCP_TON_DOMAIN,
      sourceChain: "ton",
      sourceTrustAnchorHash:
        "0x42a649de4e2748c764491cc750579052355b2562d8a29b77d54b979dca608067",
      consensusVerifierHash:
        "0xceb01f7fe0ec01de6c18ed06ab7735caeea015d0bf86113d2d7a5dcc5083d722",
      messageInclusionVerifierHash:
        "0xe8b8a6c88f82eb29eecda39930a7f3747761deabb9953c59f324ad51e47feb61",
      finalityPolicyHash:
        "0x92749b6c4bf150e6f6d78def24b42ee02db324209ce01251765e91db35ba96c5",
      sourceStateVerifierId:
        "sccp:ton:source-state-verifier:shard-state-light-client-mainnet:v1",
      sourceStateVerifierHash:
        "0xe0f1f084d4fa8205b17d339bb15d96e7351364b567e98fa03b5e69c52631836b",
      placeholderMaterial: false,
    };
    const tonSourceAdapterEngineDeployment = {
      ...tonSourceVerifierMaterial,
      targetDomain: SCCP_SORA_DOMAIN,
      adapterProofFamily: "stark-fri-v1",
      adapterCircuitId: "sccp-source-adapter-v1",
      adapterVerifierVkHash:
        "0xf03f70e8cb504e69b0611df224c2783d04d8f4ee93beae7a62e1cd0a49703bad",
      deploymentReceiptHash:
        "0x7d7abf181c0882c7c6cf63a7e0e3acb1a6ea47e08cd33355ed10714f07c9de9c",
      tonFullLightClientGateHash:
        "0x2f2a6fec8566b2be382574cfa99f96d0d72620daf0c2832c5bb2ba3f396bf610",
      tonMasterchainConfigVerifierHash: repeatedHex32("26"),
      tonValidatorSetTransitionVerifierHash: repeatedHex32("27"),
      tonShardAccountsDictionaryVerifierHash: repeatedHex32("28"),
    };
    const destinationRollout = {
      domain: SCCP_TON_DOMAIN,
      chain: "ton",
      verifierIdentity: TON_VERIFIER_ADDRESS,
      verifierCodeHash: HEX32_D,
      verifierKeyHash: null,
      destinationBindingHash,
      tonAccountStatus: "active" as const,
      tonAccountStateHash: fixtureHash("ton route account state"),
      tonLastTransactionLt: "80345546000006",
      tonLastTransactionHash: fixtureHash("ton route last tx"),
      tonVerifierCodeBocRootHash: HEX32_D,
    };
    const routeAllowlistHash = tonSccpRouteAllowlistHashFromLaneEvidence({
      sourceVerifierMaterial: tonSourceVerifierMaterial,
      sourceAdapterEngineDeployment: tonSourceAdapterEngineDeployment,
      destinationBindingHash,
    });
    const sourceVerifierMaterialHash = sccpSourceVerifierMaterialHash(
      tonSourceVerifierMaterial,
    );
    const sourceAdapterEngineDeploymentHash =
      sccpSourceAdapterEngineDeploymentHash(tonSourceAdapterEngineDeployment);
    const routeCanaryEvidenceHash = tonSccpRouteCanaryEvidenceHash({
      routeAllowlistHash,
      destinationBindingHash,
      sourceVerifierMaterialHash,
      sourceAdapterEngineDeploymentHash,
      verifierIdentity: destinationRollout.verifierIdentity,
      verifierCodeHash: destinationRollout.verifierCodeHash,
      tonAccountStatus: destinationRollout.tonAccountStatus,
      tonAccountStateHash: destinationRollout.tonAccountStateHash,
      tonLastTransactionLt: destinationRollout.tonLastTransactionLt,
      tonLastTransactionHash: destinationRollout.tonLastTransactionHash,
      tonVerifierCodeBocRootHash: destinationRollout.tonVerifierCodeBocRootHash,
    });
    const routeAllowlist = {
      domain: SCCP_TON_DOMAIN,
      chain: "ton",
      activationPolicy: "GovernanceAllowlist",
      routeAllowlistId: "sccp:ton:route-allowlist:ton-mainnet:v1",
      routeAllowlistHash,
      routeCanaryStatus: "passed",
      routeCanaryEvidenceHash,
      routeCanaryRouteAllowlistHash: routeAllowlistHash,
      routeCanaryDestinationBindingHash: destinationBindingHash,
      tonRouteCanaryAccountStateHash: destinationRollout.tonAccountStateHash,
      tonRouteCanaryLastTransactionLt: destinationRollout.tonLastTransactionLt,
      tonRouteCanaryLastTransactionHash:
        destinationRollout.tonLastTransactionHash,
      routesAllowlisted: true,
      blockers: [],
    };
    const routeOnlyTonManifest: Record<string, unknown> = {
      ...READY_TON_MANIFEST,
      productionReady: false,
      disabledReason:
        "disabled until real browser-safe TON source/destination prover modules and non-placeholder TON source light-client verifier hashes are published",
      destinationBinding: {
        ...READY_TON_MANIFEST.destinationBinding,
        bindingHash: destinationBindingHash,
      },
      destinationRollout: {
        ...READY_TON_MANIFEST.destinationRollout,
        destinationBindingHash,
      },
    };
    delete routeOnlyTonManifest.sourceVerifierMaterial;
    delete routeOnlyTonManifest.sourceAdapterEngineDeployment;
    const parameters = {
      Custom: {
        id: "sccp_lane_materials_v1",
        payload: {
          sccp_source_verifier_materials: [tonSourceVerifierMaterial],
          sccp_source_adapter_engine_deployments: [
            tonSourceAdapterEngineDeployment,
          ],
          sccp_destination_rollouts: [destinationRollout],
          sccp_route_allowlists: [routeAllowlist],
        },
      },
    };

    const manifestSet = mergeSccpLaneMaterialsIntoManifestSet(
      { routes: [routeOnlyTonManifest] },
      parameters,
      "testnet",
      "testnet",
    );
    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: manifestSet as Record<string, unknown>,
      counterparty: "ton",
    });

    expect(ready.reasons).toEqual([]);
    expect(ready.ready).toBe(true);
    expect(ready.tonManifest).toMatchObject({
      routeAllowlist: expect.objectContaining({
        routesAllowlisted: true,
        routeCanaryEvidenceHash,
      }),
      destinationRollout: expect.objectContaining({
        tonAccountStatus: "active",
      }),
    });
  });

  it("fails closed when direct manifest picking receives non-data route lists", () => {
    const accessorSet = {};
    const manifestReads: string[] = [];
    Object.defineProperty(accessorSet, "manifests", {
      enumerable: true,
      get() {
        manifestReads.push("manifests");
        return [READY_BSC_MANIFEST];
      },
    });
    expect(() => pickBscSccpManifest(accessorSet)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(manifestReads).toEqual([]);

    const hiddenSet = {};
    Object.defineProperty(hiddenSet, "manifests", {
      enumerable: false,
      value: [READY_BSC_MANIFEST],
    });
    expect(() => pickBscSccpManifest(hiddenSet)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );

    const symbolSet = {
      [Symbol("manifests")]: [READY_BSC_MANIFEST],
    };
    expect(() => pickBscSccpManifest(symbolSet)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );

    const accessorArray = [READY_TRON_MANIFEST];
    const arrayReads: string[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get() {
        arrayReads.push("0");
        return READY_TRON_MANIFEST;
      },
    });
    expect(() => pickTronSccpManifest(accessorArray, "mainnet")).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
    expect(arrayReads).toEqual([]);

    const sparseSet = { manifests: [] as unknown[] };
    sparseSet.manifests.length = 1;
    expect(() => pickBscSccpManifest(sparseSet)).toThrow(
      /SCCP route manifest must contain only JSON-serializable/,
    );
  });

  it("rejects the deployed stale TAIRA BSC DTO with legacy TRON address aliases", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const postDeployLiveEvidence: Record<string, unknown> = {
      ...READY_BSC_MANIFEST.postDeployLiveEvidence,
    };
    delete postDeployLiveEvidence.sourceEventExplorerUrl;
    delete postDeployLiveEvidence.routeCanaryExplorerUrl;
    const legacyBscManifest = {
      ...READY_BSC_MANIFEST,
      counterpartyAccountCodecKey: undefined,
      sccpBscSourceBridgeAddress: undefined,
      sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
      tron_verifier_address: BSC_VERIFIER_ADDRESS,
      postDeployLiveEvidence,
    };

    const ready = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities,
      manifestSet: {
        manifests: [legacyBscManifest],
      },
      counterparty: "bsc",
    });

    expect(ready.ready).toBe(false);
    expect(ready.counterparty).toBe("bsc");
    expect(ready.bscManifest).toStrictEqual(
      JSON.parse(JSON.stringify(legacyBscManifest)),
    );
    expect(ready.reasons.join(" ")).toMatch(
      /source bridge address must not use TRON aliases.*sccp_tron_source_bridge_address/,
    );
    expect(ready.reasons.join(" ")).toMatch(
      /verifier address must not use TRON aliases.*tron_verifier_address/,
    );
  });

  it("fails closed for adversarial BSC testnet route manifests", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const readinessFor = (manifest: Record<string, unknown>) =>
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet: { manifests: [manifest] },
        counterparty: "bsc",
      });

    const cases: Array<{
      name: string;
      manifest: Record<string, unknown>;
      reason: RegExp;
    }> = [
      {
        name: "non-boolean production-ready flag",
        manifest: { ...READY_BSC_MANIFEST, productionReady: "true" },
        reason: /production-ready flag is invalid/,
      },
      {
        name: "conflicting production-ready aliases",
        manifest: { ...READY_BSC_MANIFEST, production_ready: false },
        reason: /productionReady aliases disagree/,
      },
      {
        name: "conflicting disabled-reason aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          productionReady: false,
          disabledReason: "operator disabled route",
          disabled_reason: "stale route evidence",
        },
        reason: /disabledReason aliases disagree/,
      },
      {
        name: "production-ready route carries disabled reason",
        manifest: {
          ...READY_BSC_MANIFEST,
          disabledReason: "operator disabled route",
        },
        reason: /marked production-ready but also carries a disabled reason/,
      },
      {
        name: "TRON codec key",
        manifest: {
          ...READY_BSC_MANIFEST,
          counterpartyAccountCodecKey: "tron_base58check",
        },
        reason: /evm_hex account codec/,
      },
      {
        name: "conflicting BSC codec key aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          counterparty_account_codec_key: "tron_base58check",
        },
        reason: /counterpartyAccountCodecKey aliases disagree/,
      },
      {
        name: "TRON codec id",
        manifest: {
          ...READY_BSC_MANIFEST,
          counterpartyAccountCodec: SCCP_CODEC_TRON_BASE58CHECK,
        },
        reason: /EVM hex account codec id/,
      },
      {
        name: "conflicting BSC codec id aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          counterpartyAccountCodec: SCCP_CODEC_EVM_HEX,
          counterparty_account_codec: SCCP_CODEC_TRON_BASE58CHECK,
        },
        reason: /counterpartyAccountCodec aliases disagree/,
      },
      {
        name: "diagnostic verifier flag",
        manifest: {
          ...READY_BSC_MANIFEST,
          diagnosticVerifier: true,
        },
        reason: /verifier material is diagnostic/,
      },
      {
        name: "placeholder operator warning",
        manifest: {
          ...READY_BSC_MANIFEST,
          operatorWarning: "placeholder BSC verifier rollout",
        },
        reason: /placeholder, fixture-only, or test-only material/,
      },
      {
        name: "TODO operator handoff",
        manifest: {
          ...READY_BSC_MANIFEST,
          operatorWarning: "TODO replace verifier material before rollout",
        },
        reason: /placeholder, fixture-only, or test-only material/,
      },
      {
        name: "example verifier evidence note",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            operatorNote: "example verifier evidence must not ship",
          },
        },
        reason: /placeholder, fixture-only, or test-only material/,
      },
      {
        name: "nested fixture-only marker",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            fixtureOnlyVerifier: true,
          },
        },
        reason: /fixtureOnlyVerifier/,
      },
      {
        name: "nested replace-me verifier field",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            replaceMeVerifierKeyHash:
              READY_BSC_MANIFEST.destinationRollout.verifierKeyHash,
          },
        },
        reason: /replaceMeVerifierKeyHash/,
      },
      {
        name: "repeated-byte BSC bridge address",
        manifest: {
          ...READY_BSC_MANIFEST,
          bscBridgeAddress: "0x1111111111111111111111111111111111111111",
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            destinationBridgeAddress:
              "0x1111111111111111111111111111111111111111",
          },
        },
        reason: /repeated-byte placeholder material/,
      },
      {
        name: "known diagnostic verifier key hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        },
        reason: /known diagnostic BSC verifier key hash/,
      },
      {
        name: "same-valued BSC network id aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
          network_id_hex: BSC_TESTNET_CHAIN_ID_HEX,
        },
        reason:
          /BSC network id must not use multiple aliases in route manifest/,
      },
      {
        name: "drifting BSC network id rollout alias",
        manifest: {
          ...READY_BSC_MANIFEST,
          networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
          },
        },
        reason: /BSC network id aliases disagree/,
      },
      {
        name: "BSC verifier key hash reuses verifier code hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            verifierKeyHash: HEX32_D,
          },
        },
        reason: /verifierKeyHash must not equal verifierCodeHash/,
      },
      {
        name: "BSC proof artifact hash reuses verifier key hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          proofArtifactHash: HEX32_E,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            proofArtifactHash: HEX32_E,
          },
        },
        reason: /proofArtifactHash must not equal verifierKeyHash/,
      },
      {
        name: "same-valued BSC route verifier code hash aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          verifierCodeHash: HEX32_D,
          verifier_code_hash: HEX32_D,
        },
        reason: /verifier rollout proof material is incomplete/,
      },
      {
        name: "same-valued BSC rollout verifier key hash aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            verifier_key_hash:
              READY_BSC_MANIFEST.destinationRollout.verifierKeyHash,
          },
        },
        reason: /verifier rollout proof material is incomplete/,
      },
      {
        name: "same-valued BSC destination binding hash aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            binding_hash: READY_BSC_MANIFEST.destinationBinding.bindingHash,
          },
        },
        reason: /verifier rollout proof material is incomplete/,
      },
      {
        name: "missing native EVM prover bundle",
        manifest: {
          ...READY_BSC_MANIFEST,
          nativeEvmProverBundle: undefined,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            nativeEvmProverBundle: undefined,
          },
        },
        reason: /native EVM prover bundle is required/,
      },
      {
        name: "foreign native EVM prover bundle chain",
        manifest: {
          ...READY_BSC_MANIFEST,
          nativeEvmProverBundle: {
            ...BSC_NATIVE_EVM_PROVER_BUNDLE,
            chain: "eth",
          },
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            nativeEvmProverBundle: {
              ...BSC_NATIVE_EVM_PROVER_BUNDLE,
              chain: "eth",
            },
          },
        },
        reason: /chain must be bsc-testnet/,
      },
      {
        name: "native EVM prover proof artifact drift",
        manifest: {
          ...READY_BSC_MANIFEST,
          nativeEvmProverBundle: {
            ...BSC_NATIVE_EVM_PROVER_BUNDLE,
            proof_artifact_hash: repeatedHex32("79"),
            native_sdk_artifacts:
              BSC_NATIVE_EVM_PROVER_BUNDLE.native_sdk_artifacts.map(
                (artifact) => ({
                  ...artifact,
                  prover_artifact_hash: repeatedHex32("79"),
                }),
              ),
          },
        },
        reason: /proofArtifactHash does not match/,
      },
      {
        name: "missing BSC route proof artifact hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          proofArtifactHash: undefined,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            proofArtifactHash: undefined,
          },
        },
        reason: /proof artifact hash is required/,
      },
      {
        name: "same-valued BSC route proof artifact hash aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          proof_artifact_hash: READY_BSC_MANIFEST.proofArtifactHash,
        },
        reason:
          /proof artifact hash must not use multiple aliases in route manifest/,
      },
      {
        name: "same-valued BSC rollout proving key hash aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            proving_key_hash:
              READY_BSC_MANIFEST.destinationRollout.provingKeyHash,
          },
        },
        reason:
          /proving key hash must not use multiple aliases in route manifest destinationRollout/,
      },
      {
        name: "conflicting native EVM prover bundle aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            nativeEvmProverBundle: {
              ...BSC_NATIVE_EVM_PROVER_BUNDLE,
              proving_key_hash: repeatedHex32("89"),
              native_sdk_artifacts:
                BSC_NATIVE_EVM_PROVER_BUNDLE.native_sdk_artifacts.map(
                  (artifact) => ({
                    ...artifact,
                    proving_key_hash: repeatedHex32("89"),
                  }),
                ),
            },
          },
        },
        reason: /native EVM prover bundle aliases disagree/,
      },
      {
        name: "duplicate deployment addresses",
        manifest: {
          ...READY_BSC_MANIFEST,
          bscVerifierAddress: BSC_BRIDGE_ADDRESS,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            verifierIdentity: BSC_BRIDGE_ADDRESS,
          },
        },
        reason: /contract addresses must be distinct/,
      },
      {
        name: "drifting source bridge aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          source_bridge_address: BSC_BRIDGE_ADDRESS,
        },
        reason: /source bridge address aliases disagree/,
      },
      {
        name: "drifting token aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          tokenAddress: BSC_BRIDGE_ADDRESS,
        },
        reason: /token address aliases disagree/,
      },
      {
        name: "drifting bridge rollout alias",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            destinationBridgeAddress: BSC_TOKEN_ADDRESS,
          },
        },
        reason: /bridge address aliases disagree/,
      },
      {
        name: "drifting verifier rollout identity",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            verifierIdentity: BSC_BRIDGE_ADDRESS,
          },
        },
        reason: /verifier address aliases disagree/,
      },
      {
        name: "recovery phrase leaked in route metadata",
        manifest: {
          ...READY_BSC_MANIFEST,
          operatorNotes: VALID_MNEMONIC,
        },
        reason: /secret-like material/,
      },
      {
        name: "wrong destination binding version",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            version: 2,
          },
        },
        reason: /destination binding version must be 1/,
      },
      {
        name: "wrong destination binding source domain",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            sourceDomain: SCCP_TRON_DOMAIN,
          },
        },
        reason: /destination binding source domain is wrong/,
      },
      {
        name: "wrong destination binding target domain",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            targetDomain: SCCP_TRON_DOMAIN,
          },
        },
        reason: /destination binding target domain is wrong/,
      },
      {
        name: "forged destination binding hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            bindingHash: HEX32_A,
          },
        },
        reason: /destination binding hash|bindingHash/,
      },
      {
        name: "missing post-deploy live evidence canary",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            routeCanaryTransactionId: "0x" + "00".repeat(32),
          },
        },
        reason: /routeCanaryTransactionId.*non-zero/,
      },
      {
        name: "missing offline full-TOML hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            offlineFullTomlSha256: undefined,
          },
        },
        reason: /offlineFullTomlSha256/,
      },
      {
        name: "conflicting post-deploy evidence record aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          post_deploy_live_evidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            routeCanaryTransactionId: HEX32_B,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_B}`,
          },
        },
        reason: /postDeployLiveEvidence aliases disagree/,
      },
      {
        name: "conflicting full-TOML readiness aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            full_toml_ready: false,
          },
        },
        reason: /fullTomlReady aliases disagree/,
      },
      {
        name: "conflicting source event transaction aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            source_event_transaction_id: HEX32_F,
          },
        },
        reason: /sourceEventTransactionId aliases disagree/,
      },
      {
        name: "reused source and canary evidence hash",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            routeCanaryEvidenceHash: HEX32_A,
          },
        },
        reason:
          /source bridge config hash and route canary evidence hash must be distinct/,
      },
      {
        name: "reused source and canary transaction id",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            routeCanaryTransactionId: HEX32_B,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_B}`,
          },
        },
        reason:
          /source event and route canary transaction ids must be distinct/,
      },
      {
        name: "missing source event explorer URL",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            sourceEventExplorerUrl: "",
          },
        },
        reason: /sourceEventExplorerUrl is required/,
      },
      {
        name: "conflicting source event explorer URL aliases",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            sourceEventTransactionUrl: `https://testnet.bscscan.com/tx/${HEX32_F}`,
          },
        },
        reason: /sourceEventExplorerUrl aliases disagree/,
      },
      {
        name: "mainnet BSC explorer URL",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://bscscan.com/tx/${HEX32_B}`,
          },
        },
        reason: /BSC testnet explorer/,
      },
      {
        name: "explorer URL with query string",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_F}?utm=proof`,
          },
        },
        reason: /query strings/,
      },
      {
        name: "source event explorer hash mismatch",
        manifest: {
          ...READY_BSC_MANIFEST,
          postDeployLiveEvidence: {
            ...READY_BSC_MANIFEST.postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HEX32_F}`,
          },
        },
        reason: /transaction hash must match/,
      },
      {
        name: "missing burn-record artifact sha",
        manifest: {
          ...READY_BSC_MANIFEST,
          tairaXorBurnRecord: {
            ...READY_BSC_MANIFEST.tairaXorBurnRecord,
            artifactSha256: undefined,
          },
        },
        reason: /artifact SHA-256 is missing/,
      },
      {
        name: "malformed burn-record artifact sha",
        manifest: {
          ...READY_BSC_MANIFEST,
          tairaXorBurnRecord: {
            ...READY_BSC_MANIFEST.tairaXorBurnRecord,
            artifactSha256: "0x1234",
          },
        },
        reason: /artifact SHA-256.*32-byte hex/,
      },
      {
        name: "zero burn-record artifact sha",
        manifest: {
          ...READY_BSC_MANIFEST,
          tairaXorBurnRecord: {
            ...READY_BSC_MANIFEST.tairaXorBurnRecord,
            artifactSha256: `0x${"00".repeat(32)}`,
          },
        },
        reason: /artifact SHA-256 must be non-zero/,
      },
      {
        name: "mismatched burn-record artifact sha",
        manifest: {
          ...READY_BSC_MANIFEST,
          tairaXorBurnRecord: {
            ...READY_BSC_MANIFEST.tairaXorBurnRecord,
            artifactSha256: HEX32_A,
          },
        },
        reason: /artifact SHA-256 does not match/,
      },
    ];

    for (const { name, manifest, reason } of cases) {
      const result = readinessFor(manifest);
      expect(result.ready, name).toBe(false);
      expect(result.reasons.join(" "), name).toMatch(reason);
    }

    const accessorManifest = { ...READY_BSC_MANIFEST };
    const accessorReads: string[] = [];
    Object.defineProperty(accessorManifest, "operatorWarning", {
      enumerable: true,
      get() {
        accessorReads.push("operatorWarning");
        return "placeholder diagnostic verifier rollout";
      },
    });
    const accessorTainted = readinessFor(accessorManifest);
    expect(accessorTainted.ready).toBe(false);
    expect(accessorTainted.manifest).toBeNull();
    expect(accessorTainted.bscManifest).toBeNull();
    expect(accessorTainted.reasons).toEqual([
      expect.stringMatching(
        /JSON-serializable enumerable string-keyed data|secret-like material/,
      ),
    ]);
    expect(accessorReads).toEqual([]);

    const accessorArrayManifest = {
      ...READY_BSC_MANIFEST,
      warnings: ["ready"],
    };
    const warningReads: string[] = [];
    Object.defineProperty(accessorArrayManifest.warnings, "0", {
      enumerable: true,
      get() {
        warningReads.push("0");
        return "diagnostic verifier rollout";
      },
    });
    const accessorArrayTainted = readinessFor(accessorArrayManifest);
    expect(accessorArrayTainted.ready).toBe(false);
    expect(accessorArrayTainted.manifest).toBeNull();
    expect(accessorArrayTainted.reasons).toEqual([
      expect.stringMatching(
        /JSON-serializable enumerable string-keyed data|secret-like material/,
      ),
    ]);
    expect(warningReads).toEqual([]);

    const hiddenSecretManifest = { ...READY_BSC_MANIFEST };
    Object.defineProperty(hiddenSecretManifest, "privateKeyHex", {
      enumerable: false,
      value: "00".repeat(32),
    });
    const hiddenSecretTainted = readinessFor(hiddenSecretManifest);
    expect(hiddenSecretTainted.ready).toBe(false);
    expect(hiddenSecretTainted.manifest).toBeNull();
    expect(hiddenSecretTainted.reasons).toEqual([
      expect.stringMatching(
        /JSON-serializable enumerable string-keyed data|secret-like material/,
      ),
    ]);
    expect(JSON.stringify(hiddenSecretTainted)).not.toContain("privateKeyHex");
    expect(JSON.stringify(hiddenSecretTainted)).not.toContain("00000000");

    const symbolSecretManifest = { ...READY_BSC_MANIFEST } as Record<
      PropertyKey,
      unknown
    >;
    symbolSecretManifest[Symbol("privateKeyHex")] = "11".repeat(32);
    const symbolSecretTainted = readinessFor(
      symbolSecretManifest as Record<string, unknown>,
    );
    expect(symbolSecretTainted.ready).toBe(false);
    expect(symbolSecretTainted.manifest).toBeNull();
    expect(symbolSecretTainted.reasons).toEqual([
      expect.stringMatching(
        /JSON-serializable enumerable string-keyed data|secret-like material/,
      ),
    ]);
    expect(JSON.stringify(symbolSecretTainted)).not.toContain("11111111");

    const secretTainted = readinessFor({
      ...READY_BSC_MANIFEST,
      deployment: {
        privateKey: "do-not-serialize",
      },
      operatorNotes: VALID_MNEMONIC,
    });
    expect(secretTainted.ready).toBe(false);
    expect(secretTainted.manifest).toBeNull();
    expect(secretTainted.bscManifest).toBeNull();
    expect(secretTainted.reasons).toEqual([
      "SCCP route manifest contains secret-like material.",
    ]);
    const serializedSecretTainted = JSON.stringify(secretTainted);
    expect(serializedSecretTainted).not.toContain("privateKey");
    expect(serializedSecretTainted).not.toContain("do-not-serialize");
    expect(serializedSecretTainted).not.toContain("operatorNotes");
    expect(serializedSecretTainted).not.toContain("abandon abandon");

    const mainnetShaped = readinessFor({
      ...READY_BSC_MANIFEST,
      chain: "bsc-mainnet",
      bscNetwork: "bsc-mainnet",
      destinationRollout: {
        ...READY_BSC_MANIFEST.destinationRollout,
        destinationNetworkId:
          "0x0000000000000000000000000000000000000000000000000000000000000038",
      },
    });
    expect(mainnetShaped.ready).toBe(false);
    expect(mainnetShaped.manifest).toBeNull();
    expect(mainnetShaped.reasons.join(" ")).toContain("taira_bsc_xor");
  });

  it("derives BSC source prover material only from route-bound native bundles", () => {
    expect(
      readBscSourceProverMaterialBinding(READY_BSC_MANIFEST),
    ).toMatchObject({
      proofArtifactHash: BSC_PROOF_ARTIFACT_HASH,
      provingKeyHash: BSC_PROVING_KEY_HASH,
      nativeEvmProverBundleHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
    });
    expect(BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash).toBe(
      BSC_NATIVE_EVM_PROVER_BUNDLE_HASH,
    );
    const mainnetMaterial = readBscSourceProverMaterialBinding(
      READY_BSC_MAINNET_MANIFEST,
    );
    expect(mainnetMaterial).toMatchObject({
      proofArtifactHash: BSC_PROOF_ARTIFACT_HASH,
      provingKeyHash: BSC_PROVING_KEY_HASH,
      nativeEvmProverBundleHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
    });
    expect(mainnetMaterial.nativeEvmProverBundleHash).not.toBe(
      BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
    );

    expect(
      readSccpBscProofMaterial({
        ...READY_BSC_MANIFEST,
        verifierCodeHash: HEX32_D,
        verifier_code_hash: HEX32_D,
      }),
    ).toBeNull();

    expect(
      readSccpBscProofMaterial({
        ...READY_BSC_MANIFEST,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          verifier_key_hash:
            READY_BSC_MANIFEST.destinationRollout.verifierKeyHash,
        },
      }),
    ).toBeNull();

    expect(
      readSccpBscProofMaterial({
        ...READY_BSC_MANIFEST,
        destinationBinding: {
          ...READY_BSC_MANIFEST.destinationBinding,
          binding_hash: READY_BSC_MANIFEST.destinationBinding.bindingHash,
        },
      }),
    ).toBeNull();

    expect(
      readSccpBscProofMaterial({
        ...READY_BSC_MANIFEST,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          verifierKeyHash: HEX32_D,
        },
      }),
    ).toBeNull();

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        proofArtifactHash: HEX32_E,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          proofArtifactHash: HEX32_E,
        },
      }),
    ).toThrow(/proofArtifactHash must not equal verifierKeyHash/);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        proof_artifact_hash: READY_BSC_MANIFEST.proofArtifactHash,
      }),
    ).toThrow(/proof artifact hash must not use multiple aliases/);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          proving_key_hash:
            READY_BSC_MANIFEST.destinationRollout.provingKeyHash,
        },
      }),
    ).toThrow(/proving key hash must not use multiple aliases/);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MAINNET_MANIFEST,
        nativeEvmProverBundle: BSC_NATIVE_EVM_PROVER_BUNDLE,
      }),
    ).toThrow(/mainnet|bundle|chain|network/u);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        nativeEvmProverBundle: {
          ...BSC_NATIVE_EVM_PROVER_BUNDLE,
          proof_artifact_hash: repeatedHex32("79"),
          native_sdk_artifacts:
            BSC_NATIVE_EVM_PROVER_BUNDLE.native_sdk_artifacts.map(
              (artifact) => ({
                ...artifact,
                prover_artifact_hash: repeatedHex32("79"),
              }),
            ),
        },
      }),
    ).toThrow(/proofArtifactHash does not match/);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        nativeEvmProverBundle: {
          ...BSC_NATIVE_EVM_PROVER_BUNDLE,
          verifier_key_hash: repeatedHex32("7a"),
        },
      }),
    ).toThrow(/verifierKeyHash does not match/);

    expect(() =>
      readBscSourceProverMaterialBinding({
        ...READY_BSC_MANIFEST,
        destinationRollout: {
          ...READY_BSC_MANIFEST.destinationRollout,
          nativeEvmProverBundle: {
            ...BSC_NATIVE_EVM_PROVER_BUNDLE,
            native_prover_self_test_artifact:
              "artifacts/bsc-testnet/taira-xor/native-prover-self-test-v2.json",
          },
        },
      }),
    ).toThrow(/native EVM prover bundle aliases disagree/);
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
          proofSubmitPath: "/v1/bridge/proofs/submit",
          proof_submit_path: "/v1/bridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/messages",
          paths: {
            proof: "/v1/bridge/proofs/submit",
            message_path: "/v1/bridge/messages",
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
    const contradictoryMainnetReadiness = resolveSccpRouteReadiness({
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
            productionReady: true,
            disabledReason: "operator disabled route",
          },
        ],
      },
      tronNetwork: "mainnet",
    });
    expect(contradictoryMainnetReadiness.ready).toBe(false);
    expect(contradictoryMainnetReadiness.reasons.join(" ")).toMatch(
      /marked production-ready but also carries a disabled reason/,
    );
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
    const accessorCapabilities = {
      messageSubmitPath: "/v1/bridge/messages",
    };
    const capabilityReads: string[] = [];
    Object.defineProperty(accessorCapabilities, "proofSubmitPath", {
      enumerable: true,
      get() {
        capabilityReads.push("proofSubmitPath");
        return "/v1/bridge/proofs/submit";
      },
    });
    const accessorCapabilityReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: accessorCapabilities,
      manifestSet,
    });
    expect(accessorCapabilityReadiness.ready).toBe(false);
    expect(accessorCapabilityReadiness.reasons.join(" ")).toMatch(
      /SCCP capabilities must contain only enumerable string-keyed data fields/,
    );
    expect(capabilityReads).toEqual([]);

    const nestedAccessorCapabilities = {
      messageSubmitPath: "/v1/bridge/messages",
      paths: {},
    };
    const nestedCapabilityReads: string[] = [];
    Object.defineProperty(nestedAccessorCapabilities.paths, "proof", {
      enumerable: true,
      get() {
        nestedCapabilityReads.push("proof");
        return "/v1/bridge/proofs/submit";
      },
    });
    const nestedAccessorCapabilityReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: nestedAccessorCapabilities,
      manifestSet,
    });
    expect(nestedAccessorCapabilityReadiness.ready).toBe(false);
    expect(nestedAccessorCapabilityReadiness.reasons.join(" ")).toMatch(
      /SCCP capabilities must contain only enumerable string-keyed data fields/,
    );
    expect(nestedCapabilityReads).toEqual([]);

    const hiddenCapabilityPath = {
      messageSubmitPath: "/v1/bridge/messages",
    };
    Object.defineProperty(hiddenCapabilityPath, "proofSubmitPath", {
      enumerable: false,
      value: "/v1/bridge/proofs/submit",
    });
    const hiddenCapabilityReadiness = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: hiddenCapabilityPath,
      manifestSet,
    });
    expect(hiddenCapabilityReadiness.ready).toBe(false);
    expect(hiddenCapabilityReadiness.reasons.join(" ")).toMatch(
      /SCCP capabilities must contain only enumerable string-keyed data fields/,
    );
    for (const [ambiguousCapabilities, reason] of [
      [
        {
          proofSubmitPath: "/v1/bridge/proofs/submit",
          proof_submit_path: "/v1/sccp/proofs",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /SCCP proof submit path aliases disagree/,
      ],
      [
        {
          proofSubmitPath: "/v1/bridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/messages",
          paths: {
            proof: "/v1/sccp/proofs",
            message: "/v1/bridge/messages",
          },
        },
        /SCCP proof submit path aliases disagree/,
      ],
      [
        {
          proofSubmitPath: "/v1/bridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/messages",
          submit: {
            proof: "/v1/bridge/proofs/submit",
            messageSubmitPath: "/v1/bridge/messages/submit",
          },
        },
        /SCCP bridge-message submit path aliases disagree/,
      ],
    ] as const) {
      const ambiguousReadiness = resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities: ambiguousCapabilities,
        manifestSet,
      });
      expect(ambiguousReadiness.ready).toBe(false);
      expect(ambiguousReadiness.reasons.join(" ")).toMatch(reason);
    }
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
          messageSubmitPath: "/v1/bridge/%252e%252e/messages",
        },
        /path traversal segments/,
      ],
      [
        {
          proofSubmitPath: "/v1/%62ridge/proofs/submit",
          messageSubmitPath: "/v1/bridge/messages",
        },
        /percent-encoded path segments/,
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
            offlineFullTomlSha256: undefined,
          },
        },
        /offlineFullTomlSha256/,
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
      endpoint: TRON_MAINNET_RPC_URL,
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

  it("builds BSC burn transaction requests from route manifest material", () => {
    const request = buildTairaXorBscBurnTransactionRequest({
      manifest: {
        bscBridgeAddress: BSC_BRIDGE_ADDRESS,
      },
      ownerAddress: BSC_SENDER_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: "1.5",
    });

    expect(request).toMatchObject({
      transaction: {
        from: BSC_SENDER_ADDRESS_HEX,
        to: BSC_BRIDGE_ADDRESS_HEX,
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
        value: "0x0",
      },
      amountBaseUnits: bridgeDecimalToTairaBaseUnits("1.5"),
      amountTokenBaseUnits: bridgeDecimalToBaseUnits("1.5"),
    });
    expect(request.transaction.data).toBe(
      tairaXorBscBurnToTairaAccountCallData({
        tairaRecipient: TAIRA_SENDER,
        amount: bridgeDecimalToBaseUnits("1.5"),
      }),
    );
    expect(() =>
      buildTairaXorBscBurnTransactionRequest({
        manifest: {},
        ownerAddress: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "1",
      }),
    ).toThrow(/deployment address/);
    expect(() =>
      buildTairaXorBscBurnTransactionRequest({
        manifest: {
          bscBridgeAddress: BSC_BRIDGE_ADDRESS,
        },
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: "1",
      }),
    ).toThrow(/EVM address|address/i);
    expect(() =>
      buildTairaXorBscBurnTransactionRequest({
        manifest: {
          bscBridgeAddress: BSC_BRIDGE_ADDRESS,
        },
        ownerAddress: BSC_SENDER_ADDRESS,
        tairaRecipient: MINAMOTO_ACCOUNT_ID,
        amountDecimal: "1",
      }),
    ).toThrow(/canonical TAIRA I105/);
  });

  it("derives EVM function selectors for BSC SCCP approval binding", () => {
    const burnSelector = evmFunctionSelector(TAIRA_XOR_BURN_TO_TAIRA_ABI_V1);
    const finalizeSelector = evmFunctionSelector(
      TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
    );

    expect(evmFunctionSelector("balanceOf(address)")).toBe("0x70a08231");
    expect(burnSelector).toMatch(/^0x[0-9a-f]{8}$/u);
    expect(finalizeSelector).toMatch(/^0x[0-9a-f]{8}$/u);
    expect(finalizeSelector).not.toBe(burnSelector);
    expect(BSC_BURN_CALL_DATA.slice(0, 10)).toBe(burnSelector);
    for (const malformed of [
      "",
      "balanceOf( address)",
      "balanceOf",
      "balanceOf(address) extra",
    ]) {
      expect(() => evmFunctionSelector(malformed)).toThrow(/canonical text/);
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
      endpoint: TRON_MAINNET_RPC_URL,
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
    ).toThrow(/Signed TRON transaction.*SCCP proof data/);

    const accessorSignedTransaction = sampleSignedTronTriggerTransaction();
    const accessedSignedTransactionFields: string[] = [];
    Object.defineProperty(accessorSignedTransaction, "debug", {
      enumerable: true,
      get() {
        accessedSignedTransactionFields.push("debug");
        return "not JSON";
      },
    });
    expect(() =>
      bindSignedTronTransactionForBroadcast({
        unsignedTransaction: sampleTronTriggerTransaction(),
        signedTransaction: accessorSignedTransaction,
        ownerAddress: VALID_TRON_ADDRESS,
      }),
    ).toThrow(/Signed TRON transaction.*SCCP proof data/);
    expect(accessedSignedTransactionFields).toEqual([]);

    expectGenericTronTransactionRejection(
      () =>
        bindSignedTronTransactionForBroadcast({
          unsignedTransaction: sampleTronTriggerTransaction(),
          signedTransaction: sampleSignedTronTriggerTransaction(
            (transaction) => {
              transaction.privateKeyHex = "11".repeat(32);
            },
          ),
          ownerAddress: VALID_TRON_ADDRESS,
        }),
      TRON_TRANSACTION_SECRET_INPUT_ERROR,
      ["Signed TRON transaction", "privateKeyHex", "11".repeat(32)],
    );

    expectGenericTronTransactionRejection(
      () =>
        bindSignedTronTransactionForBroadcast({
          unsignedTransaction: sampleTronTriggerTransaction(),
          signedTransaction: sampleSignedTronTriggerTransaction(
            (transaction) => {
              transaction.signature_b64 = "already-signed";
            },
          ),
          ownerAddress: VALID_TRON_ADDRESS,
        }),
      TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR,
      ["Signed TRON transaction", "signature_b64", "already-signed"],
    );

    expectGenericTronTransactionRejection(
      () =>
        bindSignedTronTransactionForBroadcast({
          unsignedTransaction: sampleTronTriggerTransaction(),
          signedTransaction: sampleSignedTronTriggerTransaction(
            (transaction) => {
              (
                (
                  (
                    (transaction.raw_data as Record<string, unknown>)
                      .contract as Array<Record<string, unknown>>
                  )[0].parameter as Record<string, unknown>
                ).value as Record<string, unknown>
              ).note = VALID_MNEMONIC;
            },
          ),
          ownerAddress: VALID_TRON_ADDRESS,
        }),
      TRON_TRANSACTION_SECRET_INPUT_ERROR,
      ["note", "abandon abandon", "raw_data"],
    );

    expectGenericTronTransactionRejection(
      () =>
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
      TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR,
      ["Unsigned TRON transaction", "walletSignature", "11".repeat(65)],
    );

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
              (transaction.raw_data as Record<string, unknown>)
                .contract as Array<Record<string, unknown>>
            )[0].parameter as Record<string, unknown>
          ).value as Record<string, unknown>;
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

    expectGenericTronTransactionRejection(
      () =>
        bindUnsignedTronSmartContractTransaction({
          transaction: sampleTronTriggerTransaction((transaction) => {
            transaction.privateKeyHex = "11".repeat(32);
          }),
          trigger,
        }),
      TRON_TRANSACTION_SECRET_INPUT_ERROR,
      ["Unsigned TRON transaction", "privateKeyHex", "11".repeat(32)],
    );

    expectGenericTronTransactionRejection(
      () =>
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
      TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR,
      ["Unsigned TRON transaction", "signature_b64", "already-signed"],
    );

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
      bindTronFinalitySnapshot(
        sampleTronFinalityData((finality) => {
          const witnesses = finality.witnesses as { witnesses: unknown[] };
          witnesses.witnesses.push("not-a-witness");
        }),
      ),
    ).toThrow(/TRON finality witnesses\[1\] must be an object/);

    expect(() =>
      bindTronFinalitySnapshot({
        ...sampleTronFinalityData(),
        debug: () => "not cloneable",
      }),
    ).toThrow(/TRON finality data.*SCCP proof data/);

    const accessorFinality = sampleTronFinalityData();
    const accessedFinalityFields: string[] = [];
    Object.defineProperty(accessorFinality, "debug", {
      enumerable: true,
      get() {
        accessedFinalityFields.push("debug");
        return "not JSON";
      },
    });
    expect(() => bindTronFinalitySnapshot(accessorFinality)).toThrow(
      /TRON finality data.*SCCP proof data/,
    );
    expect(accessedFinalityFields).toEqual([]);
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
    ).toThrow(/TRON transaction events.*SCCP proof data/);

    const accessedTronEventFields: string[] = [];
    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          Object.defineProperty(next.events, "debug", {
            enumerable: true,
            get() {
              accessedTronEventFields.push("debug");
              return "not JSON";
            },
          });
        }),
      ),
    ).toThrow(/TRON transaction events.*SCCP proof data/);
    expect(accessedTronEventFields).toEqual([]);

    expect(() =>
      bindTronSourceDataForProof(
        sampleBoundTronSourceDataInput((next) => {
          (next.events.data as unknown[]).push("not-an-event");
        }),
      ),
    ).toThrow(/TRON transaction events\.data\[1\] must be an object/);

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
          delete (event.result as Record<string, unknown>).sourceEventDigest;
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

  it("binds coherent BSC source data before TAIRA settlement proof generation", () => {
    const source = sampleBscSourceData();

    expect(
      bindBscSourceDataForProof({
        txId: BSC_SOURCE_TX_HASH,
        bridgeAddress: BSC_BRIDGE_ADDRESS,
        sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        ...source,
      }),
    ).toMatchObject({
      txId: BSC_SOURCE_TX_HASH,
      sourceEventDigest: BSC_SOURCE_EVENT_DIGEST,
      indexedLogs: [
        {
          address: BSC_SOURCE_BRIDGE_ADDRESS,
          transactionHash: BSC_SOURCE_TX_HASH,
        },
      ],
      receiptBlockNumber: "0x7b",
      receiptBlockHash: BSC_SOURCE_BLOCK_HASH,
    });

    const mutableSource = sampleBscSourceData();
    const boundSource = bindBscSourceDataForProof({
      txId: BSC_SOURCE_TX_HASH,
      bridgeAddress: BSC_BRIDGE_ADDRESS,
      sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      bscSender: BSC_SENDER_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      ...mutableSource,
    });
    mutableSource.transaction.input = "0xfeedface";
    (mutableSource.receipt.logs as Record<string, unknown>[])[1].topics = [
      BSC_SOURCE_EVENT_TOPIC,
      HEX32_A,
    ];
    mutableSource.indexedLogs[0].topics = [BSC_SOURCE_EVENT_TOPIC, HEX32_A];
    mutableSource.block.hash = HEX32_A;
    expect(boundSource.transaction?.input).toBe(BSC_BURN_CALL_DATA);
    expect(
      (
        (boundSource.receipt.logs as Record<string, unknown>[])[1]
          .topics as string[]
      )[1],
    ).toBe(BSC_SOURCE_EVENT_DIGEST);
    expect(
      (boundSource.proofReceipt.logs as Record<string, unknown>[]).map(
        (log) => log.address,
      ),
    ).toEqual([BSC_SOURCE_BRIDGE_ADDRESS, BSC_BRIDGE_ADDRESS]);
    expect(boundSource.proofReceipt.receiptRootIndex).toBe("1");
    expect(boundSource.proofReceipt.receipt_root_index).toBe("1");
    expect((boundSource.indexedLogs?.[0].topics as string[])[1]).toBe(
      BSC_SOURCE_EVENT_DIGEST,
    );
    expect(boundSource.block?.hash).toBe(BSC_SOURCE_BLOCK_HASH);

    expect(() =>
      bindBscSourceDataForProof({
        txId: BSC_SOURCE_TX_HASH,
        ...sampleBscSourceData(),
      } as unknown as Parameters<typeof bindBscSourceDataForProof>[0]),
    ).toThrow(/BSC bridge address is required/);

    expect(() =>
      bindBscSourceDataForProof({
        ...sampleBoundBscSourceDataInput(),
        txId: BSC_SOURCE_TX_HASH.slice(2),
      }),
    ).toThrow(/0x-prefixed 32-byte EVM hash/);

    expect(() =>
      bindBscSourceDataForProof({
        ...sampleBoundBscSourceDataInput(),
        txId: `0x${"00".repeat(32)}`,
      }),
    ).toThrow(/txId must be non-zero/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.transaction.hash = BSC_SOURCE_TX_HASH.slice(2);
        }),
      ),
    ).toThrow(/0x-prefixed 32-byte EVM hash/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.transaction.hash = `0x${"00".repeat(32)}`;
        }),
      ),
    ).toThrow(/BSC source transaction hash must be non-zero/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.transaction.transaction_hash = HEX32_A;
        }),
      ),
    ).toThrow(/source transaction hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.transactionHash = BSC_SOURCE_TX_HASH.slice(2);
        }),
      ),
    ).toThrow(/0x-prefixed 32-byte EVM hash/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.transaction_hash = HEX32_A;
        }),
      ),
    ).toThrow(/receipt transaction hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof({
        ...sampleBoundBscSourceDataInput(),
        bscSender: BSC_RECIPIENT_ADDRESS,
      }),
    ).toThrow(/sender.*connected wallet/);

    expect(() =>
      bindBscSourceDataForProof({
        ...sampleBoundBscSourceDataInput(),
        amountDecimal: "0.0002",
      }),
    ).toThrow(/call data.*bridge request/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.transaction.data = "0xfeedface";
        }),
      ),
    ).toThrow(/source transaction input aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.transaction.to = BSC_RECIPIENT_ADDRESS;
        }),
      ),
    ).toThrow(/target.*bridge contract/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.status = "0x0";
        }),
      ),
    ).toThrow(/receipt must report success/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.transactionHash = HEX32_A;
        }),
      ),
    ).toThrow(/receipt hash/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.block_hash = HEX32_A;
        }),
      ),
    ).toThrow(/receipt block hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.receipt.block_number = "0x7c";
        }),
      ),
    ).toThrow(/receipt block number aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].address =
            BSC_RECIPIENT_ADDRESS;
        }),
      ),
    ).toThrow(/source bridge SccpSourceEvent log/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (
            (next.receipt.logs as Record<string, unknown>[])[1]
              .topics as string[]
          )[0] = BSC_SOURCE_EVENT_TOPIC.slice(2);
        }),
      ),
    ).toThrow(/0x-prefixed 32-byte EVM hash/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].transactionHash =
            HEX32_A;
        }),
      ),
    ).toThrow(/log transaction hash.*source transaction/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].transaction_hash =
            HEX32_A;
        }),
      ),
    ).toThrow(/log transaction hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].blockHash =
            HEX32_A;
        }),
      ),
    ).toThrow(/log block hash.*transaction receipt/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].block_hash =
            HEX32_A;
        }),
      ),
    ).toThrow(/log block hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].blockNumber =
            "0x7c";
        }),
      ),
    ).toThrow(/log block number.*transaction receipt/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[])[1].block_number =
            "0x7c";
        }),
      ),
    ).toThrow(/log block number aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[]).push({
            address: BSC_SOURCE_BRIDGE_ADDRESS,
            topics: [BSC_SOURCE_EVENT_TOPIC, BSC_SOURCE_EVENT_DIGEST],
            transactionHash: BSC_SOURCE_TX_HASH,
            blockNumber: "0x7b",
            blockHash: BSC_SOURCE_BLOCK_HASH,
          });
        }),
      ),
    ).toThrow(/exactly one source bridge/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as Record<string, unknown>[]).splice(2, 1);
        }),
      ),
    ).toThrow(/TairaXorBurnStarted log/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          const burnLog = (next.receipt.logs as Record<string, unknown>[])[2];
          (next.receipt.logs as Record<string, unknown>[]).push({
            ...burnLog,
            topics: [...(burnLog.topics as string[])],
          });
        }),
      ),
    ).toThrow(/exactly one TairaXorBurnStarted/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (
            (next.receipt.logs as Record<string, unknown>[])[2]
              .topics as string[]
          )[1] = HEX32_A;
        }),
      ),
    ).toThrow(/burn-start log source event digest/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.receipt.logs as unknown[]).push("not-a-log");
        }),
      ),
    ).toThrow(/BSC transaction receipt log 3 must be an object/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.indexedLogs = [];
        }),
      ),
    ).toThrow(/indexed source bridge logs.*SccpSourceEvent/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (
            next.indexedLogs as Array<Record<string, unknown>> & {
              privateKeyHex?: string;
            }
          ).privateKeyHex = "11".repeat(32);
        }),
      ),
    ).toThrow(/BSC indexed source logs.*SCCP proof data/);

    const accessedBscIndexedLogFields: string[] = [];
    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          Object.defineProperty(next.indexedLogs, "debug", {
            enumerable: true,
            get() {
              accessedBscIndexedLogFields.push("debug");
              return "not JSON";
            },
          });
        }),
      ),
    ).toThrow(/BSC indexed source logs.*SCCP proof data/);
    expect(accessedBscIndexedLogFields).toEqual([]);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.indexedLogs.push({
            address: BSC_SOURCE_BRIDGE_ADDRESS,
            topics: [BSC_SOURCE_EVENT_TOPIC, BSC_SOURCE_EVENT_DIGEST],
            transactionHash: BSC_SOURCE_TX_HASH,
            blockNumber: "0x7b",
            blockHash: BSC_SOURCE_BLOCK_HASH,
          });
        }),
      ),
    ).toThrow(/indexed source bridge logs.*exactly one/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.indexedLogs as unknown[]).push("not-a-log");
        }),
      ),
    ).toThrow(/BSC indexed source logs\[1\] must be an object/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          (next.indexedLogs[0].topics as string[])[1] = HEX32_A;
        }),
      ),
    ).toThrow(/digest.*transaction receipt/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.indexedLogs[0].transactionHash = HEX32_A;
        }),
      ),
    ).toThrow(/log transaction hash.*source transaction/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.indexedLogs[0].transaction_hash = HEX32_A;
        }),
      ),
    ).toThrow(/log transaction hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.hash = HEX32_A;
        }),
      ),
    ).toThrow(/block hash.*receipt/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.block_hash = HEX32_A;
        }),
      ),
    ).toThrow(/source block hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.blockNumber = "0x7c";
        }),
      ),
    ).toThrow(/source block number aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          delete next.block.transactions;
        }),
      ),
    ).toThrow(/transactions array/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.transactions = [HEX32_A];
        }),
      ),
    ).toThrow(/source transaction/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.transactions = [
            { hash: BSC_SOURCE_TX_HASH, transactionHash: HEX32_A },
          ];
        }),
      ),
    ).toThrow(/source block transaction 0 hash aliases disagree/);

    expect(() =>
      bindBscSourceDataForProof(
        sampleBoundBscSourceDataInput((next) => {
          next.block.transactions = [{ hash: BSC_SOURCE_TX_HASH }];
        }),
      ),
    ).not.toThrow();
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
    expect(
      readSccpTairaBurnRecordMaterial({
        tairaXorBurnRecord: {
          ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
          vkRef: {
            ...BURN_RECORD_MATERIAL.tairaXorBurnRecord.vkRef,
            backend: "halo2_ipa",
          },
        },
      })?.vkRef.backend,
    ).toBe("halo2/ipa");

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

  it("builds TAIRA to BSC canonical outbound previews and burn-record requests from SDK bindings", () => {
    const preview = buildTairaXorBscOutboundPreview({
      manifest: READY_BSC_MANIFEST,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS.toUpperCase(),
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(preview.payload).toMatchObject({
      source_domain: 0,
      dest_domain: SCCP_BSC_DOMAIN,
      asset_id: "xor",
      amount: "2250000000",
      recipient: BSC_RECIPIENT_ADDRESS,
      route_id: "taira_bsc_xor",
    });
    expect(preview.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.payloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.contractPayloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.canonicalPayloadHex).toMatch(/^0x[0-9a-f]+$/u);
    expect(preview.recordDescriptor).toMatchObject({
      execution_kind: "ivm_proved_record_sccp_message_v1",
      chain_id: TAIRA_CHAIN_ID,
      network_prefix: TAIRA_NETWORK_PREFIX,
      route_id: "taira_bsc_xor",
      message_id: preview.messageId,
      canonical_payload_hex: preview.canonicalPayloadHex,
    });

    const mixedAddressPreview = buildTairaXorBscOutboundPreview({
      manifest: READY_BSC_MANIFEST,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
      amountDecimal: "2.25",
      nonce: "7",
    });
    expect(mixedAddressPreview.payload).toMatchObject({
      recipient: BSC_MIXED_RECIPIENT_ADDRESS,
    });
    expect(
      normalizeEvmAddress(String(mixedAddressPreview.payload.recipient)),
    ).toBe(BSC_MIXED_RECIPIENT_ADDRESS_LOWER);
    expect(mixedAddressPreview.canonicalPayloadHex).toBe(
      bytesToHex(
        canonicalSccpTransferPayloadBytes({
          ...TAIRA_TO_BSC_TRANSFER_PAYLOAD,
          amount: "2250000000",
          recipient: BSC_MIXED_RECIPIENT_ADDRESS,
        }),
      ),
    );

    const request = buildTairaXorBscOutboundBurnRecordRequest({
      manifest: READY_BSC_MANIFEST,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });
    expect(request.outbound.messageId).toBe(preview.messageId);
    expect(request.zkIvmRequest).toMatchObject({
      route_id: "taira_bsc_xor",
      asset_key: "xor",
      descriptor: {
        route_id: "taira_bsc_xor",
        dest_domain: SCCP_BSC_DOMAIN,
      },
    });
    expect(request.zkIvmRequest.request).toMatchObject({
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
    });
    const legacyBackendRequest = buildTairaXorBscOutboundBurnRecordRequest({
      manifest: {
        ...READY_BSC_MANIFEST,
        tairaXorBurnRecord: {
          ...READY_BSC_MANIFEST.tairaXorBurnRecord,
          vkRef: {
            ...READY_BSC_MANIFEST.tairaXorBurnRecord.vkRef,
            backend: "halo2_ipa",
          },
        },
      },
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });
    expect(legacyBackendRequest.material.vkRef.backend).toBe("halo2/ipa");
    expect(legacyBackendRequest.zkIvmRequest.request).toMatchObject({
      vkRef: {
        backend: "halo2/ipa",
      },
    });
    expect(() =>
      buildTairaXorBscOutboundPreview({
        manifest: {},
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/BSC bridge deployment address/);
    expect(() =>
      buildTairaXorBscOutboundBurnRecordRequest({
        manifest: READY_BSC_MANIFEST,
        tairaSender: TAIRA_SENDER,
        bscRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/EVM address|recipientAddress|BSC/i);
  });

  it("builds TAIRA to TON canonical outbound previews and burn-record requests", () => {
    const preview = buildTairaXorTonOutboundPreview({
      manifest: READY_TON_MANIFEST,
      tairaSender: TAIRA_SENDER,
      tonRecipient: TON_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(preview.payload).toMatchObject({
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_TON_DOMAIN,
      asset_id: "xor",
      amount: "2250000000",
      recipient_codec: SCCP_CODEC_TON_RAW,
      recipient: TON_RECIPIENT_ADDRESS,
      route_id: SCCP_TON_XOR_ROUTE_ID,
    });
    expect(preview.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.payloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.contractPayloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.canonicalPayloadHex).toBe(
      bytesToHex(
        canonicalSccpTransferPayloadBytes({
          version: 1,
          source_domain: SCCP_SORA_DOMAIN,
          dest_domain: SCCP_TON_DOMAIN,
          nonce: "7",
          asset_home_domain: SCCP_SORA_DOMAIN,
          asset_id_codec: SCCP_CODEC_TEXT_UTF8,
          asset_id: "xor",
          amount: "2250000000",
          sender_codec: SCCP_CODEC_TEXT_UTF8,
          sender: TAIRA_SENDER,
          recipient_codec: SCCP_CODEC_TON_RAW,
          recipient: TON_RECIPIENT_ADDRESS,
          route_id_codec: SCCP_CODEC_TEXT_UTF8,
          route_id: SCCP_TON_XOR_ROUTE_ID,
        }),
      ),
    );
    expect(preview.recordDescriptor).toMatchObject({
      execution_kind: "ivm_proved_record_sccp_message_v1",
      chain_id: TAIRA_CHAIN_ID,
      network_prefix: TAIRA_NETWORK_PREFIX,
      route_id: SCCP_TON_XOR_ROUTE_ID,
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_TON_DOMAIN,
      message_id: preview.messageId,
      canonical_payload_hex: preview.canonicalPayloadHex,
      record_instruction: {
        kind: "RecordSccpMessage",
        payload_bytes_hex: preview.canonicalPayloadHex,
      },
      execution_requirements: {
        executable: "IvmProved",
        overlay_instruction: "RecordSccpMessage",
        settlement_instruction: "Burn<Numeric, Asset>",
        settlement_asset_selector: "nexus.fees.fee_asset_id",
        normal_transaction_supported: false,
      },
    });

    const request = buildTairaXorTonOutboundBurnRecordRequest({
      manifest: READY_TON_MANIFEST,
      tairaSender: TAIRA_SENDER,
      tonRecipient: TON_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });
    expect(request.outbound.messageId).toBe(preview.messageId);
    expect(request.zkIvmRequest).toMatchObject({
      route_id: SCCP_TON_XOR_ROUTE_ID,
      asset_key: "xor",
      descriptor: {
        route_id: SCCP_TON_XOR_ROUTE_ID,
        dest_domain: SCCP_TON_DOMAIN,
      },
    });
    expect(request.zkIvmRequest.request).toMatchObject({
      authority: TAIRA_SENDER,
      bytecode: BURN_RECORD_ARTIFACT_B64,
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
      metadata: {
        gas_limit: 123456,
        contract_entrypoint: "burn_and_record",
        contract_payload: {
          sender: TAIRA_SENDER,
          settlement_asset: VALID_ASSET_DEFINITION_ID,
          amount: "2250000000",
        },
      },
    });
    const tonEnvelopePayloadHex = bytesToHex(
      canonicalSccpPayloadEnvelopeBytes({
        kind: "Transfer",
        value: request.outbound.payload,
      }),
    );
    expect(request.outbound.canonicalPayloadHex).not.toBe(
      tonEnvelopePayloadHex,
    );
    expect(
      (
        request.zkIvmRequest.descriptor.record_instruction as Record<
          string,
          unknown
        >
      ).payload_bytes_hex,
    ).toBe(tonEnvelopePayloadHex);
    expect(
      (
        request.zkIvmRequest.request.metadata.contract_payload as Record<
          string,
          unknown
        >
      ).record_instruction,
    ).toBe(
      bytesToHex(
        buildRecordSccpMessageInstructionBytes(
          hexToBytes(tonEnvelopePayloadHex),
        ),
      ),
    );
    expect(
      String(
        (
          request.zkIvmRequest.request.metadata.contract_payload as Record<
            string,
            unknown
          >
        ).record_instruction,
      ),
    ).toMatch(/^0x4e525430[0-9a-f]+$/u);
    expect(() =>
      buildTairaXorTonOutboundPreview({
        manifest: {},
        tairaSender: TAIRA_SENDER,
        tonRecipient: TON_RECIPIENT_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/TON bridge deployment address/);
    expect(() =>
      buildTairaXorTonOutboundBurnRecordRequest({
        manifest: READY_TON_MANIFEST,
        tairaSender: TAIRA_SENDER,
        tonRecipient: `0:${"00".repeat(32)}`,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/TON raw address account hash|TON raw recipient address/);
  });

  it("builds TAIRA to Solana canonical outbound previews and burn-record requests", () => {
    const preview = buildTairaXorSolanaOutboundPreview({
      manifest: READY_SOLANA_MANIFEST,
      tairaSender: TAIRA_SENDER,
      solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(preview.payload).toMatchObject({
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_SOLANA_DOMAIN,
      asset_id: "xor",
      amount: "2250000000",
      recipient_codec: SCCP_CODEC_SOLANA_BASE58,
      recipient: SOLANA_RECIPIENT_ADDRESS,
      route_id: SCCP_SOLANA_XOR_ROUTE_ID,
    });
    const expectedSolanaPayload = {
      ...TAIRA_TO_SOLANA_TRANSFER_PAYLOAD,
      amount: "2250000000",
    };
    expect(preview.messageId).toBe(
      sccpTransferMessageId(expectedSolanaPayload),
    );
    expect(preview.payloadHash).toBe(
      sccpPayloadHash(
        canonicalSccpPayloadEnvelopeBytes({
          kind: "Transfer",
          value: expectedSolanaPayload,
        }),
      ),
    );
    expect(preview.contractPayloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.canonicalPayloadHex).toBe(
      bytesToHex(canonicalSccpTransferPayloadBytes(expectedSolanaPayload)),
    );
    expect(preview.recordDescriptor).toMatchObject({
      kind: "TairaXorSccpRecordDescriptor",
      execution_kind: "ivm_proved_record_sccp_message_v1",
      chain_id: TAIRA_CHAIN_ID,
      network_prefix: TAIRA_NETWORK_PREFIX,
      route_id: SCCP_SOLANA_XOR_ROUTE_ID,
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_SOLANA_DOMAIN,
      message_id: preview.messageId,
      canonical_payload_hex: preview.canonicalPayloadHex,
      record_instruction: {
        kind: "RecordSccpMessage",
        payload_bytes_hex: preview.canonicalPayloadHex,
      },
      execution_requirements: {
        executable: "IvmProved",
        overlay_instruction: "RecordSccpMessage",
        settlement_instruction: "Burn<Numeric, Asset>",
        settlement_asset_selector: "nexus.fees.fee_asset_id",
        normal_transaction_supported: false,
      },
    });

    const request = buildTairaXorSolanaOutboundBurnRecordRequest({
      manifest: READY_SOLANA_MANIFEST,
      tairaSender: TAIRA_SENDER,
      solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });
    expect(request.outbound.messageId).toBe(preview.messageId);
    expect(request.zkIvmRequest).toMatchObject({
      route_id: SCCP_SOLANA_XOR_ROUTE_ID,
      asset_key: "xor",
      descriptor: {
        route_id: SCCP_SOLANA_XOR_ROUTE_ID,
        dest_domain: SCCP_SOLANA_DOMAIN,
      },
      request: {
        authority: TAIRA_SENDER,
        bytecode: BURN_RECORD_ARTIFACT_B64,
        vkRef: {
          backend: "halo2/ipa",
          name: "taira-xor-burn-record-v1",
        },
        metadata: {
          gas_limit: 123456,
          contract_entrypoint: "burn_and_record",
          contract_payload: {
            sender: TAIRA_SENDER,
            settlement_asset: VALID_ASSET_DEFINITION_ID,
            amount: "2250000000",
          },
        },
      },
    });
    const contractPayload = request.zkIvmRequest.request.metadata
      .contract_payload as Record<string, unknown>;
    expect(contractPayload.record_instruction).toMatch(/^0x[0-9a-f]+$/u);
    expect(request.zkIvmRequest.contract.record_instruction_hex).toBe(
      contractPayload.record_instruction,
    );
    expect(() =>
      buildTairaXorSolanaOutboundPreview({
        manifest: {},
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/Solana bridge deployment address/);
    expect(() =>
      buildTairaXorSolanaOutboundBurnRecordRequest({
        manifest: READY_SOLANA_MANIFEST,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/Solana recipient/);
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
    ).toThrow(/destination binding does not match the TRON route manifest/i);
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
    expect(bytesToHex(proofBytes.slice(32, 64))).toBe(TAIRA_TO_TRON_MESSAGE_ID);
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

  it("builds TON query material for TAIRA message proof jobs", () => {
    const bundle = sampleTairaToTonJob().bundle as Record<string, unknown>;
    expect(
      buildTairaXorTonMessageProofJobQueryMaterial({
        manifest: READY_TON_MANIFEST,
        messageBundle: bundle,
        messageId: TAIRA_TO_TON_MESSAGE_ID,
      }),
    ).toStrictEqual({});

    expect(() =>
      buildTairaXorTonMessageProofJobQueryMaterial({
        manifest: READY_TON_MANIFEST,
        messageBundle: bundle,
        messageId: HEX32_D,
      }),
    ).toThrow(/requested message id/);

    expect(
      buildTairaXorTonMessageProofJobQueryMaterial({
        manifest: {
          ...READY_TON_MANIFEST,
          tonFinalizeMessageValueNano: "",
        },
        messageBundle: bundle,
        messageId: TAIRA_TO_TON_MESSAGE_ID,
      }),
    ).toStrictEqual({});
  });

  it("builds Solana query material for TAIRA message proof jobs", () => {
    const bundle = sampleTairaToSolanaJob().bundle as Record<string, unknown>;
    expect(
      buildTairaXorSolanaMessageProofJobQueryMaterial({
        manifest: READY_SOLANA_MANIFEST,
        messageBundle: bundle,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toStrictEqual({});

    expect(() =>
      buildTairaXorSolanaMessageProofJobQueryMaterial({
        manifest: READY_SOLANA_MANIFEST,
        messageBundle: bundle,
        messageId: HEX32_D,
      }),
    ).toThrow(/requested message id/);

    expect(() =>
      buildTairaXorSolanaMessageProofJobQueryMaterial({
        manifest: {
          ...READY_SOLANA_MANIFEST,
          solanaVerifierMintInstructionAccounts: undefined,
        },
        messageBundle: bundle,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/instruction accounts/);

    expect(() =>
      buildTairaXorSolanaMessageProofJobQueryMaterial({
        manifest: {
          ...READY_SOLANA_MANIFEST,
          solanaVerifierInstructionAccounts: [],
        },
        messageBundle: bundle,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/Generic Solana verifier instruction accounts are unsupported/);
  });

  it("reads top-level TON settlement contract aliases from route manifests", () => {
    expect(
      buildTairaXorTonInboundSettlement({
        manifest: {
          ...READY_TON_MANIFEST,
          settlementContractAlias: "taira_ton_xor_burn_record",
        },
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: SCCP_TON_XOR_ROUTE_ID,
      contract_alias: "taira_ton_xor_burn_record::universal",
    });
  });

  it("binds TAIRA message proof jobs to TON internal-message finalize requests", () => {
    const binding = buildTairaXorTonFinalizeProofBinding({
      manifest: READY_TON_MANIFEST,
      job: sampleTairaToTonJob(),
      messageId: TAIRA_TO_TON_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      tonRecipient: TON_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding).toMatchObject({
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_TON_MESSAGE_ID,
      payloadHash: TAIRA_TO_TON_PAYLOAD_HASH,
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
      messageBodyBocHex: "0xb5ee9c72",
      destinationBinding: {
        key: READY_TON_MANIFEST.destinationBinding.key,
        bindingHash: HEX32_C,
      },
    });
    expect(binding.messageBundle.payload).toMatchObject({
      kind: "Transfer",
      value: {
        recipient_codec: SCCP_CODEC_TON_RAW,
        recipient: TON_RECIPIENT_ADDRESS,
      },
    });

    expect(() =>
      buildTairaXorTonFinalizeProofBinding({
        manifest: READY_TON_MANIFEST,
        job: sampleTairaToTonJob({
          submissionPackage: {
            ...(sampleTairaToTonJob().submissionPackage as Record<
              string,
              unknown
            >),
            arguments: [
              {
                key: "message_body_boc",
                encoding: "ton_boc",
                bytes: "b5ee9c73",
              },
            ],
          },
        }),
        messageId: TAIRA_TO_TON_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        tonRecipient: TON_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message_body_boc argument does not match/);
  });

  it("binds TAIRA message proof jobs to Solana verifier transactions", () => {
    const binding = buildTairaXorSolanaFinalizeProofBinding({
      manifest: READY_SOLANA_MANIFEST,
      job: sampleTairaToSolanaJob(),
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(binding).toMatchObject({
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
      proofContext: {
        statementHash: HEX32_E,
        destinationBindingHash: HEX32_C,
      },
      witness: {
        direction: "taira-to-solana",
        solanaNetwork: "solana-testnet",
        proofBackend: "solana-program-v1",
      },
    });
    expect(binding.bundleBytes).toBeInstanceOf(Uint8Array);

    const proofPackage = sampleSolanaDestinationProofPackage();
    const request = buildTairaXorSolanaFinalizeTransactionRequest({
      manifest: READY_SOLANA_MANIFEST,
      job: sampleTairaToSolanaJob(),
      proofPackage,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      tairaSender: TAIRA_SENDER,
      solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
    });

    expect(request).toMatchObject({
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
      proofContextHash: binding.proofContextHash,
      transaction: {
        endpoint: SCCP_SOLANA_NETWORK.rpcUrl,
        feePayer: SOLANA_RECIPIENT_ADDRESS,
        instructions: [
          {
            programId: SOLANA_VERIFIER_PROGRAM_ADDRESS,
            accounts: [
              {
                pubkey: SOLANA_RECIPIENT_ADDRESS,
                isSigner: true,
                isWritable: true,
              },
              {
                pubkey: SOLANA_VERIFIER_STATE_ADDRESS,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SOLANA_TOKEN_MINT_ADDRESS,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SOLANA_DESTINATION_TOKEN_ADDRESS,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: deriveSccpSolanaMintAuthorityAddress({
                  verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
                  verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
                }),
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: deriveSccpSolanaMessageReceiptAddress({
                  verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
                  verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
                  messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
                }),
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SCCP_SOLANA_SYSTEM_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
            ],
            dataHex: (proofPackage.submission as Record<string, unknown>)
              .envelopeBytes,
          },
        ],
      },
    });
    expect(request.canonicalPayloadHex).toBe(
      bytesToHex(
        canonicalSccpTransferPayloadBytes(TAIRA_TO_SOLANA_TRANSFER_PAYLOAD),
      ),
    );

    const missingSubmissionPackage = sampleSolanaDestinationProofPackage();
    missingSubmissionPackage.submission = null;
    expect(() =>
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: READY_SOLANA_MANIFEST,
        job: sampleTairaToSolanaJob(),
        proofPackage: missingSubmissionPackage,
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/browser-generated Solana SCCP proof package submission/u);

    const serverBytesCannotOverrideBrowserProof =
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: READY_SOLANA_MANIFEST,
        job: sampleTairaToSolanaJob({
          submissionPackage: {
            ...(sampleTairaToSolanaJob().submissionPackage as Record<
              string,
              unknown
            >),
            envelopeBytes: "0xdeadbeef",
          },
        }),
        proofPackage: sampleSolanaDestinationProofPackage(),
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      });
    expect(
      serverBytesCannotOverrideBrowserProof.transaction.instructions[0].dataHex,
    ).toBe((proofPackage.submission as Record<string, unknown>).envelopeBytes);

    expect(() =>
      buildTairaXorSolanaFinalizeProofBinding({
        manifest: READY_SOLANA_MANIFEST,
        job: sampleTairaToSolanaJob({
          solanaDestinationWitness: {
            direction: "taira-to-solana",
            solanaNetwork: "solana-mainnet-beta",
            solanaGenesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            proofBackend: "sccp-solana-recursive-mainnet-v1",
          },
        }),
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/governed testnet destination proof profile/u);

    const crossProfilePackage = sampleSolanaDestinationProofPackage();
    crossProfilePackage.request = {
      ...(crossProfilePackage.request as Record<string, unknown>),
      solanaNetwork: "solana-mainnet-beta",
      solanaGenesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      backend: "sccp-solana-recursive-mainnet-v1",
    };
    expect(() =>
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: READY_SOLANA_MANIFEST,
        job: sampleTairaToSolanaJob(),
        proofPackage: crossProfilePackage,
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/proof request network does not match this testnet/u);

    expect(() =>
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: READY_SOLANA_MANIFEST,
        job: sampleTairaToSolanaJob(),
        proofPackage: sampleSolanaDestinationProofPackage({
          envelopeEncoding: "wrong",
        }),
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/borsh_instruction_v1/);

    expect(() =>
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: {
          ...READY_SOLANA_MANIFEST,
          solanaVerifierMintInstructionAccounts: undefined,
        },
        job: sampleTairaToSolanaJob(),
        proofPackage: sampleSolanaDestinationProofPackage(),
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).toThrow(/mint instruction accounts/);
  });

  it("binds a finalized Solana mint to the exact wallet-approved finalize request", () => {
    const fixture = sampleFinalizedSolanaDestinationFinalize();
    expect(bindFinalizedTairaXorSolanaFinalizeTransaction(fixture)).toEqual({
      txId: SOLANA_ROUTE_CANARY_SIGNATURE,
      finalizedSlot: fixture.finalizedSlot,
      feePayer: SOLANA_RECIPIENT_ADDRESS,
      verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
      tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    });
  });

  it("rejects unrelated, stale, or structurally substituted Solana finalize transactions", () => {
    type Fixture = ReturnType<typeof sampleFinalizedSolanaDestinationFinalize>;
    const message = (fixture: Fixture) =>
      fixture.transaction.transaction.message as Record<string, unknown>;
    const outerInstruction = (fixture: Fixture) =>
      (message(fixture).instructions as Array<Record<string, unknown>>)[0];
    const reject = (
      label: string,
      mutate: (fixture: Fixture) => void,
      expected?: RegExp,
    ) => {
      const fixture = sampleFinalizedSolanaDestinationFinalize();
      mutate(fixture);
      const assertion = expect(
        () => bindFinalizedTairaXorSolanaFinalizeTransaction(fixture),
        label,
      );
      expected ? assertion.toThrow(expected) : assertion.toThrow();
    };

    reject(
      "old unrelated signature",
      (fixture) => {
        fixture.transaction.transaction.signatures = [
          SOLANA_SOURCE_EVENT_SIGNATURE,
        ];
      },
      /wallet-approved signature/u,
    );
    reject("confirmed but not finalized status", (fixture) => {
      fixture.signatureStatus.confirmationStatus = "confirmed";
    });
    reject("independent finality slot mismatch", (fixture) => {
      fixture.finality.slot = 89;
    });
    reject("failed transaction status", (fixture) => {
      (fixture.signatureStatus as Record<string, unknown>).err = {
        InstructionError: [0, "Custom"],
      };
    });
    reject("failed transaction metadata", (fixture) => {
      (fixture.transaction.meta as Record<string, unknown>).err = {
        InstructionError: [0, "Custom"],
      };
    });
    reject("versioned transaction", (fixture) => {
      (fixture.transaction as Record<string, unknown>).version = 0;
    });
    reject("loaded address-table account", (fixture) => {
      (
        fixture.transaction.meta.loadedAddresses as Record<string, unknown>
      ).writable = [SOLANA_SOURCE_STATE_ADDRESS];
    });
    reject("message address-table lookup", (fixture) => {
      message(fixture).addressTableLookups = [{}];
    });
    reject("extra static account", (fixture) => {
      (message(fixture).accountKeys as string[]).push(
        SOLANA_BRIDGE_PROGRAM_ADDRESS,
      );
    });
    reject("swapped static account order", (fixture) => {
      const keys = message(fixture).accountKeys as string[];
      [keys[1], keys[2]] = [keys[2], keys[1]];
    });
    reject("wrong fee payer", (fixture) => {
      (message(fixture).accountKeys as string[])[0] =
        SOLANA_BRIDGE_PROGRAM_ADDRESS;
    });
    reject("writable verifier program", (fixture) => {
      const header = message(fixture).header as Record<string, unknown>;
      header.numReadonlyUnsignedAccounts = 4;
    });
    reject("extra outer instruction", (fixture) => {
      (message(fixture).instructions as unknown[]).push({
        ...outerInstruction(fixture),
      });
    });
    reject("wrong verifier program", (fixture) => {
      outerInstruction(fixture).programIdIndex = 8;
    });
    reject("parsed outer instruction", (fixture) => {
      outerInstruction(fixture).parsed = {};
    });
    reject("reordered verifier metas", (fixture) => {
      const accounts = outerInstruction(fixture).accounts as number[];
      [accounts[1], accounts[2]] = [accounts[2], accounts[1]];
    });
    reject("extra verifier meta", (fixture) => {
      (outerInstruction(fixture).accounts as number[]).push(0);
    });
    reject(
      "different finalize instruction bytes",
      (fixture) => {
        const data = hexToBytes(
          fixture.request.transaction.instructions[0].dataHex,
        );
        data[data.length - 1] ^= 1;
        outerInstruction(fixture).data = solanaBase58Encode(data);
      },
      /instruction bytes/u,
    );
    reject("different requested message id", (fixture) => {
      fixture.request.messageId = HEX32_A;
    });
    reject("different requested amount", (fixture) => {
      fixture.request.amountBaseUnits = "1";
    });
    reject("different requested destination token", (fixture) => {
      fixture.request.destinationTokenAddress = SOLANA_SOURCE_STATE_ADDRESS;
    });
  });

  it("rejects wrong or ambiguous Solana destination mint effects", () => {
    type Fixture = ReturnType<typeof sampleFinalizedSolanaDestinationFinalize>;
    const meta = (fixture: Fixture) =>
      fixture.transaction.meta as Record<string, unknown>;
    const tokenCpi = (fixture: Fixture) =>
      (
        (meta(fixture).innerInstructions as Array<Record<string, unknown>>)[0]
          .instructions as Array<Record<string, unknown>>
      )[0];
    const pre = (fixture: Fixture) =>
      (meta(fixture).preTokenBalances as Array<Record<string, unknown>>)[0];
    const post = (fixture: Fixture) =>
      (meta(fixture).postTokenBalances as Array<Record<string, unknown>>)[0];
    const reject = (label: string, mutate: (fixture: Fixture) => void) => {
      const fixture = sampleFinalizedSolanaDestinationFinalize();
      mutate(fixture);
      expect(
        () => bindFinalizedTairaXorSolanaFinalizeTransaction(fixture),
        label,
      ).toThrow();
    };

    reject("missing inner instruction group", (fixture) => {
      meta(fixture).innerInstructions = [];
    });
    reject("extra SPL mint CPI", (fixture) => {
      const group = (
        meta(fixture).innerInstructions as Array<Record<string, unknown>>
      )[0];
      (group.instructions as unknown[]).push({ ...tokenCpi(fixture) });
    });
    reject("wrong SPL program", (fixture) => {
      tokenCpi(fixture).programIdIndex = 7;
    });
    reject("wrong SPL mint account", (fixture) => {
      (tokenCpi(fixture).accounts as number[])[0] = 1;
    });
    reject("wrong SPL destination account", (fixture) => {
      (tokenCpi(fixture).accounts as number[])[1] = 2;
    });
    reject("wrong SPL mint authority", (fixture) => {
      (tokenCpi(fixture).accounts as number[])[2] = 0;
    });
    reject("SPL transfer instead of mintTo", (fixture) => {
      tokenCpi(fixture).data = solanaBase58Encode(
        concatBytes(Uint8Array.of(3), u64LeBytes(BSC_BRIDGE_AMOUNT_BASE_UNITS)),
      );
    });
    reject("wrong SPL mint amount", (fixture) => {
      tokenCpi(fixture).data = solanaBase58Encode(
        concatBytes(Uint8Array.of(7), u64LeBytes("1")),
      );
    });
    reject("wrong pre-balance mint", (fixture) => {
      pre(fixture).mint = SOLANA_SOURCE_PROOF_TOKEN_MINT_ADDRESS;
    });
    reject("wrong post-balance owner", (fixture) => {
      post(fixture).owner = SOLANA_BRIDGE_PROGRAM_ADDRESS;
    });
    reject("wrong post-balance token program", (fixture) => {
      post(fixture).programId = SOLANA_NATIVE_VERIFIER_PROGRAM_ADDRESS;
    });
    reject("wrong token decimals", (fixture) => {
      (post(fixture).uiTokenAmount as Record<string, unknown>).decimals = 8;
    });
    reject("no destination balance delta", (fixture) => {
      (post(fixture).uiTokenAmount as Record<string, unknown>).amount = (
        pre(fixture).uiTokenAmount as Record<string, unknown>
      ).amount;
    });
    reject("wrong destination balance delta", (fixture) => {
      (post(fixture).uiTokenAmount as Record<string, unknown>).amount =
        "900001";
    });
    reject("additional token balance side effect", (fixture) => {
      (meta(fixture).postTokenBalances as unknown[]).push({ ...post(fixture) });
    });
  });

  it("domain-separates Solana settlement context and replay receipt derivation", () => {
    expect(
      deriveSccpSolanaMintAuthorityAddress({
        verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
        verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      }),
    ).toBe("o6rqx2DjTeUE2yLvnyMCVVEhzx7CZJGBXknCj7XwSED");
    const base = {
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      tokenMintAddress: SOLANA_TOKEN_MINT_ADDRESS,
      destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    };
    const contexts = [
      buildSccpSolanaSettlementProofContextHash(base),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        statementHash: HEX32_D,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        destinationBindingHash: HEX32_B,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        messageId: HEX32_A,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        tokenMintAddress: SOLANA_BRIDGE_PROGRAM_ADDRESS,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        destinationTokenAddress: SOLANA_SOURCE_STATE_ADDRESS,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        ownerAddress: SOLANA_BRIDGE_PROGRAM_ADDRESS,
      }),
      buildSccpSolanaSettlementProofContextHash({
        ...base,
        amountBaseUnits: "100001",
      }),
    ];
    expect(contexts[0]).toBe(
      "0x8d4044216f6115eeb0074c07afdb0ef90299b84cba92c9c2ec2b28ef806bbbae",
    );
    expect(new Set(contexts).size).toBe(contexts.length);

    const receipt = deriveSccpSolanaMessageReceiptAddress({
      verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
      verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
      messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
    });
    expect(receipt).toBe("EuhaiaNvYCRcCjLQXSqzESo4U541EKab4PBbqVnk4n1s");
    expect(
      deriveSccpSolanaMessageReceiptAddress({
        verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
        verifierStateAddress: SOLANA_VERIFIER_STATE_ADDRESS,
        messageId: HEX32_A,
      }),
    ).not.toBe(receipt);
    expect(
      deriveSccpSolanaMessageReceiptAddress({
        verifierProgramAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
        verifierStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      }),
    ).not.toBe(receipt);
  });

  it.each([
    [0, { isWritable: false }, /canonical settlement role/u],
    [1, { pubkey: SOLANA_SOURCE_STATE_ADDRESS }, /canonical settlement role/u],
    [
      2,
      { pubkey: SOLANA_BRIDGE_PROGRAM_ADDRESS },
      /canonical settlement role/u,
    ],
    [4, { pubkey: SOLANA_SOURCE_STATE_ADDRESS }, /canonical settlement role/u],
    [
      5,
      { pubkey: SOLANA_BRIDGE_PROGRAM_ADDRESS },
      /canonical settlement role/u,
    ],
    [
      6,
      { pubkey: SOLANA_BRIDGE_PROGRAM_ADDRESS },
      /canonical settlement role/u,
    ],
    [7, { pubkey: SOLANA_SOURCE_STATE_ADDRESS }, /\$messageReceipt/u],
    [8, { pubkey: SOLANA_SOURCE_STATE_ADDRESS }, /\$systemProgram/u],
    [0, { pubkey: "$wallet" }, /\$payer/u],
    [3, { pubkey: "$destination_token" }, /\$destinationToken/u],
    [7, { pubkey: "$message_receipt" }, /\$messageReceipt/u],
    [8, { pubkey: "$system_program" }, /\$systemProgram/u],
  ] as const)(
    "rejects tampered Solana settlement account role %i",
    (index, patch, expectedError) => {
      const accounts =
        READY_SOLANA_MANIFEST.solanaVerifierMintInstructionAccounts.map(
          (account) => ({ ...account }),
        );
      accounts[index] = { ...accounts[index], ...patch };
      expect(() =>
        readSccpSolanaVerifierMintInstructionAccounts(
          {
            ...READY_SOLANA_MANIFEST,
            solanaVerifierMintInstructionAccounts: accounts,
          },
          SOLANA_RECIPIENT_ADDRESS,
          SOLANA_DESTINATION_TOKEN_ADDRESS,
          TAIRA_TO_SOLANA_MESSAGE_ID,
        ),
      ).toThrow(expectedError);
    },
  );

  it.each([
    ["proofContextHash", HEX32_A],
    ["ownerAddress", SOLANA_BRIDGE_PROGRAM_ADDRESS],
    ["tokenMintAddress", SOLANA_BRIDGE_PROGRAM_ADDRESS],
    ["destinationTokenAddress", SOLANA_SOURCE_STATE_ADDRESS],
    ["verifierProgramAddress", SOLANA_BRIDGE_PROGRAM_ADDRESS],
    ["verifierStateAddress", SOLANA_SOURCE_STATE_ADDRESS],
    ["messageReceiptAddress", SOLANA_SOURCE_STATE_ADDRESS],
    ["amountBaseUnits", "100001"],
  ] as const)(
    "rejects browser proof request tampering of %s",
    (field, value) => {
      const proofPackage = sampleSolanaDestinationProofPackage();
      proofPackage.request = {
        ...(proofPackage.request as Record<string, unknown>),
        [field]: value,
      };
      expect(() =>
        buildTairaXorSolanaFinalizeTransactionRequest({
          manifest: READY_SOLANA_MANIFEST,
          job: sampleTairaToSolanaJob(),
          proofPackage,
          ownerAddress: SOLANA_RECIPIENT_ADDRESS,
          destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
          tairaSender: TAIRA_SENDER,
          solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
          amountDecimal: BRIDGE_AMOUNT_DECIMAL,
          messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
        }),
      ).toThrow(/Browser-generated Solana proof request/u);
    },
  );

  it.each([
    [0, new Uint8Array(), /proof bytes/u],
    [1, Uint8Array.of(1), /public inputs/u],
    [2, Uint8Array.of(1), /message proof bundle/u],
    [3, hexToBytes(HEX32_A), /statement hash/u],
    [4, hexToBytes(HEX32_A), /destination binding hash/u],
    [5, hexToBytes(HEX32_A), /proof context hash/u],
    [6, u64LeBytes("100001"), /amount/u],
  ] as const)(
    "rejects tampered Solana instruction argument %i",
    (index, replacement, expectedError) => {
      const job = sampleTairaToSolanaJob();
      const proofPackage = sampleSolanaDestinationProofPackage();
      const args = sampleSolanaSubmitArgs(job);
      args[index] = replacement;
      proofPackage.submission = {
        ...(proofPackage.submission as Record<string, unknown>),
        envelopeBytes: solanaSubmitEnvelopeHex(args),
      };
      expect(() =>
        buildTairaXorSolanaFinalizeTransactionRequest({
          manifest: READY_SOLANA_MANIFEST,
          job,
          proofPackage,
          ownerAddress: SOLANA_RECIPIENT_ADDRESS,
          destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
          tairaSender: TAIRA_SENDER,
          solanaRecipient: SOLANA_RECIPIENT_ADDRESS,
          amountDecimal: BRIDGE_AMOUNT_DECIMAL,
          messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
        }),
      ).toThrow(expectedError);
    },
  );

  it("rejects alternate Solana entrypoints, extra arguments, and recipient substitution", () => {
    const job = sampleTairaToSolanaJob();
    const build = (
      proofPackage: Record<string, unknown>,
      solanaRecipient = SOLANA_RECIPIENT_ADDRESS,
    ) =>
      buildTairaXorSolanaFinalizeTransactionRequest({
        manifest: READY_SOLANA_MANIFEST,
        job,
        proofPackage,
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        destinationTokenAddress: SOLANA_DESTINATION_TOKEN_ADDRESS,
        tairaSender: TAIRA_SENDER,
        solanaRecipient,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        messageId: TAIRA_TO_SOLANA_MESSAGE_ID,
      });
    const alternateEntrypoint = sampleSolanaDestinationProofPackage();
    alternateEntrypoint.submission = {
      ...(alternateEntrypoint.submission as Record<string, unknown>),
      envelopeBytes: solanaSubmitEnvelopeHex(
        sampleSolanaSubmitArgs(job),
        "burn_to_taira",
      ),
    };
    expect(() => build(alternateEntrypoint)).toThrow(/entrypoint/u);

    const extraArgument = sampleSolanaDestinationProofPackage();
    extraArgument.submission = {
      ...(extraArgument.submission as Record<string, unknown>),
      envelopeBytes: solanaSubmitEnvelopeHex([
        ...sampleSolanaSubmitArgs(job),
        Uint8Array.of(0),
      ]),
    };
    expect(() => build(extraArgument)).toThrow(/seven settlement arguments/u);
    expect(() =>
      build(
        sampleSolanaDestinationProofPackage(),
        SOLANA_BRIDGE_PROGRAM_ADDRESS,
      ),
    ).toThrow(/recipient must be the connected wallet/u);
  });

  it("builds Solana burn_to_taira source transactions with manifest-bound state", () => {
    const sourceTokenAddress = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWmV9fWkG8nD9u8";
    const nonce = "13";
    const sourceBurnReceiptAddress = deriveSccpSolanaSourceBurnReceiptAddress({
      sourceBridgeProgramAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
      sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      nonce,
    });
    const request = buildTairaXorSolanaBurnTransactionRequest({
      manifest: READY_SOLANA_MANIFEST,
      ownerAddress: SOLANA_RECIPIENT_ADDRESS,
      sourceTokenAddress,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      nonce,
    });

    expect(request).toMatchObject({
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      tairaRecipient: TAIRA_SENDER,
      nonce,
      transaction: {
        endpoint: SCCP_SOLANA_NETWORK.rpcUrl,
        feePayer: SOLANA_RECIPIENT_ADDRESS,
        instructions: [
          {
            programId: SOLANA_SOURCE_BRIDGE_ADDRESS,
            accounts: [
              {
                pubkey: SOLANA_RECIPIENT_ADDRESS,
                isSigner: true,
                isWritable: true,
              },
              {
                pubkey: SOLANA_SOURCE_STATE_ADDRESS,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: sourceTokenAddress,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SOLANA_TOKEN_MINT_ADDRESS,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: sourceBurnReceiptAddress,
                isSigner: false,
                isWritable: true,
              },
              {
                pubkey: SCCP_SOLANA_SYSTEM_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
            ],
          },
        ],
      },
    });
    expect(request.transaction.instructions[0].dataHex).toMatch(
      /^0x0d0000006275726e5f746f5f7461697261/u,
    );
    expect(request.transaction.instructions[0].dataHex).toMatch(
      /080000000d00000000000000$/u,
    );

    expect(() =>
      buildTairaXorSolanaBurnTransactionRequest({
        manifest: {
          ...READY_SOLANA_MANIFEST,
          solanaSourceStateAddress: "",
        },
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        sourceTokenAddress,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
        nonce,
      }),
    ).toThrow(/source bridge state/u);
  });

  it("derives source burn receipts from the exact on-chain PDA seeds", () => {
    const derive = (nonce: string) =>
      deriveSccpSolanaSourceBurnReceiptAddress({
        sourceBridgeProgramAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
        sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
        ownerAddress: SOLANA_RECIPIENT_ADDRESS,
        nonce,
      });

    // Generated independently with @solana/web3.js findProgramAddressSync
    // from the program seed tuple used by the Rust program.
    expect(derive("13")).toBe("EtNXzReXkCnKVYLm4goWmQbWWPigokCzGPttHHcvjxLv");
    expect(derive("13")).toBe(derive("13"));
    expect(derive("14")).not.toBe(derive("13"));
    expect(
      deriveSccpSolanaSourceBurnReceiptAddress({
        sourceBridgeProgramAddress: SOLANA_SOURCE_BRIDGE_ADDRESS,
        sourceStateAddress: SOLANA_SOURCE_STATE_ADDRESS,
        ownerAddress: SOLANA_VERIFIER_PROGRAM_ADDRESS,
        nonce: "13",
      }),
    ).not.toBe(derive("13"));
  });

  it("accepts only canonical positive u64 Solana source burn nonces", () => {
    for (const valid of ["1", "13", "18446744073709551615"]) {
      expect(normalizeSolanaSourceBurnNonce(valid)).toBe(valid);
    }
    for (const invalid of [
      "",
      "0",
      "00",
      "01",
      "-1",
      "+1",
      "1.0",
      " 1",
      "1 ",
      "18446744073709551616",
      1,
      1n,
      null,
    ]) {
      expect(() => normalizeSolanaSourceBurnNonce(invalid)).toThrow(
        /canonical positive u64 decimal/u,
      );
    }

    const generated = new Set(
      Array.from({ length: 32 }, () => createSolanaSourceBurnNonce()),
    );
    expect(generated.size).toBe(32);
    for (const nonce of generated) {
      expect(normalizeSolanaSourceBurnNonce(nonce)).toBe(nonce);
    }
  });

  it("rejects non-canonical or privilege-escalated Solana source burn account templates", () => {
    const sourceTokenAddress = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWmV9fWkG8nD9u8";
    const canonical = READY_SOLANA_MANIFEST.solanaSourceBurnInstructionAccounts;
    const read = (accounts: Array<Record<string, unknown>>) =>
      readSccpSolanaSourceBurnInstructionAccounts(
        {
          ...READY_SOLANA_MANIFEST,
          solanaSourceBurnInstructionAccounts: accounts,
        },
        SOLANA_RECIPIENT_ADDRESS,
        sourceTokenAddress,
        "13",
      );
    const mutate = (index: number, patch: Record<string, unknown>) =>
      canonical.map((account, accountIndex) =>
        accountIndex === index ? { ...account, ...patch } : { ...account },
      );

    expect(() => read(canonical.slice(0, 6))).toThrow(/seven-account/u);
    expect(() => read(mutate(0, { pubkey: "$payer" }))).toThrow(/\$owner/u);
    expect(() => read(mutate(2, { pubkey: "$destinationToken" }))).toThrow(
      /\$sourceToken/u,
    );
    expect(() =>
      read(mutate(5, { pubkey: SOLANA_SOURCE_STATE_ADDRESS })),
    ).toThrow(/\$sourceBurnReceipt/u);
    expect(() =>
      read(mutate(6, { pubkey: SCCP_SOLANA_SYSTEM_PROGRAM_ID })),
    ).toThrow(/\$systemProgram/u);
    expect(() => read(mutate(0, { isWritable: false }))).toThrow(
      /canonical source burn role/u,
    );
    expect(() => read(mutate(4, { isSigner: true }))).toThrow(
      /canonical source burn role/u,
    );
    expect(() => read(mutate(5, { isWritable: false }))).toThrow(
      /canonical source burn role/u,
    );
    expect(() => read(mutate(6, { isWritable: true }))).toThrow(
      /canonical source burn role/u,
    );
  });

  it("splits oversized TON SCCP finalize payloads into wallet-safe chunk payloads", () => {
    const body = new Uint8Array(188 * 1024);
    body.set([0xb5, 0xee, 0x9c, 0x72]);
    const plan = buildSccpTonChunkedMessageBodyBocsFromBytes({
      messageBodyBocBytes: body,
      messageId: TAIRA_TO_TON_MESSAGE_ID,
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
    });

    expect(plan.protocol).toBe("ton_sccp_chunked_message_body_boc_v1");
    expect(plan.totalBytes).toBe(body.length);
    expect(plan.chunkCount).toBeGreaterThan(1);
    expect(plan.uploadMessages).toHaveLength(plan.chunkCount);
    expect(plan.bodyHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(plan.chunkRoot).toMatch(/^0x[0-9a-f]{64}$/u);
    for (const message of plan.uploadMessages) {
      expect(message.payloadBocHex).toMatch(/^0xb5ee9c72/u);
      expect(message.payloadBocBytes.length).toBeLessThanOrEqual(
        SCCP_TON_WALLET_PAYLOAD_SAFE_BYTES_V1,
      );
    }
    expect(plan.finalizeMessage.payloadBocHex).toMatch(/^0xb5ee9c72/u);
    expect(plan.finalizeMessage.payloadBocBytes.length).toBeLessThanOrEqual(
      SCCP_TON_WALLET_PAYLOAD_SAFE_BYTES_V1,
    );
  });

  it("builds compact TON SCCP finalize payloads for protocol v2", () => {
    const body = new Uint8Array(188 * 1024);
    body.set([0xb5, 0xee, 0x9c, 0x72]);
    const plan = buildSccpTonCompactFinalizeMessageBodyBocFromBytes({
      messageBodyBocBytes: body,
      messageId: TAIRA_TO_TON_MESSAGE_ID,
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
    });

    expect(plan.protocol).toBe("ton_sccp_compact_finalize_boc_v2");
    expect(plan.protocolVersion).toBe(SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2);
    expect(plan.op).toBe(SCCP_TON_COMPACT_FINALIZE_OP);
    expect(plan.totalBytes).toBe(body.length);
    expect(plan.payloadBocBytes.length).toBeLessThan(512);
    expect(plan.payloadBocHex).toMatch(/^0xb5ee9c72/u);
    expect(plan.bodyHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(plan.proofDigest).toMatch(/^0x[0-9a-f]{64}$/u);

    const [cell] = Cell.fromBoc(Buffer.from(plan.payloadBocBytes));
    const slice = cell.beginParse();
    expect(slice.loadUint(32)).toBe(SCCP_TON_COMPACT_FINALIZE_OP);
    expect(slice.loadUintBig(64).toString()).toBe(plan.queryId);
    expect(slice.loadUint(16)).toBe(SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2);
    expect(`0x${slice.loadUintBig(256).toString(16).padStart(64, "0")}`).toBe(
      TAIRA_TO_TON_MESSAGE_ID,
    );
    expect(`0x${slice.loadUintBig(256).toString(16).padStart(64, "0")}`).toBe(
      plan.bodyHash,
    );
    const details = slice.loadRef().beginParse();
    expect(`0x${details.loadUintBig(256).toString(16).padStart(64, "0")}`).toBe(
      HEX32_E,
    );
    expect(`0x${details.loadUintBig(256).toString(16).padStart(64, "0")}`).toBe(
      HEX32_C,
    );
    expect(`0x${details.loadUintBig(256).toString(16).padStart(64, "0")}`).toBe(
      plan.proofDigest,
    );
    expect(details.loadUint(32)).toBe(body.length);
  });

  it("defaults TON verifier protocol to chunked v1 and accepts compact v2", () => {
    expect(readSccpTonVerifierProtocolVersion(READY_TON_MANIFEST)).toBe(
      SCCP_TON_VERIFIER_PROTOCOL_CHUNKED_V1,
    );
    expect(
      readSccpTonVerifierProtocolVersion({
        ...READY_TON_MANIFEST,
        destinationRollout: {
          ...READY_TON_MANIFEST.destinationRollout,
          verifierProtocolVersion: SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2,
        },
      }),
    ).toBe(SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2);
    expect(() =>
      readSccpTonVerifierProtocolVersion({
        ...READY_TON_MANIFEST,
        tonVerifierProtocolVersion: 9,
      }),
    ).toThrow(/protocol version must be 1 or 2/u);
    expect(
      readSccpTonVerifierProtocolVersion({
        ...READY_TON_MANIFEST,
        destinationRollout: {
          ...READY_TON_MANIFEST.destinationRollout,
          verifierCodeHash:
            "0x84ab53f938152334f4b02a6af0a7b6af0d1d8e591f1ce24defe6f955865432bf",
        },
      }),
    ).toBe(SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2);
    expect(
      readSccpTonVerifierProtocolVersion({
        ...READY_TON_MANIFEST,
        destinationRollout: undefined,
        destination_verifier_address:
          "0:259a28e21ab5b549cf253baa0ca3eb683a34674e04f46b32fca5c2bda4c0b58b",
      }),
    ).toBe(SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2);
  });

  it("packs current TON proof chunks into TON-safe wallet approval batches", () => {
    const uploadMessages = Array.from({ length: 8 }, (_, index) => ({
      index,
      payloadSizeBytes: index === 7 ? 17 * 1024 : 25 * 1024,
    }));

    const batches = chunkSccpTonUploadMessages(uploadMessages, 2, 56 * 1024);

    expect(batches).toHaveLength(4);
    expect(batches.map((batch) => batch.map((entry) => entry.index))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("rewrites the deployed TON source prover dev path to the packaged module", () => {
    expect(
      readSccpTonSourceProverModuleUrl({
        ...READY_TON_MANIFEST,
        sourceBrowserProver: {
          moduleUrl: "./src/provers/sccp-ton-source-prover.js",
        },
      }),
    ).toBe(SCCP_TON_TESTNET_SOURCE_PROVER_MODULE_URL);
    expect(readSccpTonSourceProverModuleUrl(READY_TON_MANIFEST)).toBe(
      "/sccp-ton/source-prover.js",
    );
  });

  it("binds TAIRA message proof jobs to BSC finalize proof requests", () => {
    const binding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob(),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS.toUpperCase(),
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding).toMatchObject({
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
      destinationBinding: {
        bindingHash: BSC_DESTINATION_BINDING.bindingHash,
        verifierAddress: BSC_VERIFIER_ADDRESS_HEX,
        bridgeAddress: BSC_BRIDGE_ADDRESS_HEX,
      },
    });
    expect(binding.witness.publicInputs).toMatchObject({
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      targetDomain: SCCP_BSC_DOMAIN,
    });
    expect(binding.witness.proofArtifactHash).toBe(BSC_PROOF_ARTIFACT_HASH);
    expect(binding.witness.provingKeyHash).toBe(BSC_PROVING_KEY_HASH);
    expect(
      (binding.witness as Record<string, unknown>).nativeEvmProverBundleHash,
    ).toBe(BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash);
    expect(binding.witness.bundleBytes).toBeInstanceOf(Uint8Array);
    expect((binding.witness.bundleBytes as Uint8Array).length).toBeGreaterThan(
      100,
    );

    const nodeShapeBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        submissionPackage: undefined,
        submission_package: {
          platform_payload: {
            platform: "EvmGroth16ContractCall",
            payload: {
              statement_hash: HEX32_E,
              destination_binding: {
                version: 1,
                key: BSC_DESTINATION_BINDING.key,
                binding_hash: BSC_DESTINATION_BINDING.bindingHash,
              },
            },
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(nodeShapeBinding.witness.statementHash).toBe(HEX32_E);
    expect(nodeShapeBinding.destinationBinding.bindingHash).toBe(
      BSC_DESTINATION_BINDING.bindingHash,
    );

    const mixedAddressPayload = {
      ...TAIRA_TO_BSC_TRANSFER_PAYLOAD,
      recipient: BSC_MIXED_RECIPIENT_ADDRESS,
    };
    const mixedAddressMessageId = sccpTransferMessageId(mixedAddressPayload);
    const mixedAddressPayloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes({
        kind: "Transfer",
        value: mixedAddressPayload,
      }),
    );
    const baseJob = sampleTairaToBscJob();
    const baseProjection = (
      baseJob.payloadProjection as {
        value: Record<string, unknown>;
      }
    ).value;
    const baseBundle = baseJob.bundle as Record<string, unknown>;
    const baseCommitment = baseBundle.commitment as Record<string, unknown>;
    const rawRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient_codec: SCCP_CODEC_EVM_HEX,
            recipient: BSC_RECIPIENT_ADDRESS.slice(2),
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(rawRecipientBinding.messageId).toBe(TAIRA_TO_BSC_MESSAGE_ID);

    const abiWordRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient_codec: SCCP_CODEC_EVM_HEX,
            recipient: `0x${"0".repeat(24)}${BSC_RECIPIENT_ADDRESS.slice(2)}`,
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(abiWordRecipientBinding.messageId).toBe(TAIRA_TO_BSC_MESSAGE_ID);

    const rawObjectRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient: {
              kind: "EvmHex",
              value: BSC_RECIPIENT_ADDRESS.slice(2),
            },
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(rawObjectRecipientBinding.messageId).toBe(TAIRA_TO_BSC_MESSAGE_ID);

    const abiWordObjectRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient: {
              EvmHex: {
                value: `0x${"0".repeat(24)}${BSC_RECIPIENT_ADDRESS.slice(2)}`,
              },
            },
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(abiWordObjectRecipientBinding.messageId).toBe(
      TAIRA_TO_BSC_MESSAGE_ID,
    );

    const nestedObjectRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient: {
              kind: "EvmHex",
              value: {
                payload: `0x${"0".repeat(24)}${BSC_RECIPIENT_ADDRESS.slice(2)}`,
              },
            },
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(nestedObjectRecipientBinding.messageId).toBe(
      TAIRA_TO_BSC_MESSAGE_ID,
    );

    const bytesObjectRecipientBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient: {
              EvmHex: {
                bytes: BSC_RECIPIENT_ADDRESS,
              },
            },
          },
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(bytesObjectRecipientBinding.messageId).toBe(TAIRA_TO_BSC_MESSAGE_ID);

    const summaryBindingJob = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        destinationBinding: {
          version: 1,
          key: "sccp:0:2:bsc:evm-groth16-bn254-v1:1",
          bindingHash: HEX32_A,
        },
        submissionPackage: {
          platformPayload: {
            kind: "evm_groth16_contract_call",
            value: {
              statementHash: HEX32_E,
            },
          },
        },
        groth16ProofSummary: {
          destination_binding_hash: BSC_DESTINATION_BINDING.bindingHash,
          destination_binding_key: BSC_DESTINATION_BINDING.key,
        },
      }),
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(summaryBindingJob.messageId).toBe(TAIRA_TO_BSC_MESSAGE_ID);

    const mixedAddressBinding = buildTairaXorBscFinalizeProofBinding({
      manifest: READY_BSC_MANIFEST,
      job: sampleTairaToBscJob({
        publicInputs: {
          ...(baseJob.publicInputs as Record<string, unknown>),
          messageId: mixedAddressMessageId,
          payloadHash: mixedAddressPayloadHash,
        },
        payloadProjection: {
          kind: "Transfer",
          value: {
            ...baseProjection,
            recipient: {
              kind: "EvmHex",
              value: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
            },
          },
        },
        bundle: {
          ...baseBundle,
          commitment: {
            ...baseCommitment,
            messageId: mixedAddressMessageId,
            payloadHash: mixedAddressPayloadHash,
          },
          payload: {
            kind: "Transfer",
            value: {
              ...mixedAddressPayload,
              recipient: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
            },
          },
        },
      }),
      messageId: mixedAddressMessageId,
      tairaSender: TAIRA_SENDER,
      bscRecipient: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(mixedAddressBinding.canonicalPayloadHex).toBe(
      bytesToHex(canonicalSccpTransferPayloadBytes(mixedAddressPayload)),
    );
    expect(
      (
        mixedAddressBinding.messageBundle.payload as {
          value: Record<string, unknown>;
        }
      ).value.recipient,
    ).toBe(BSC_MIXED_RECIPIENT_ADDRESS);
  });

  it("builds BSC query material for TAIRA message proof jobs", () => {
    const bundle = sampleTairaToBscJob().bundle as Record<string, unknown>;
    const material = buildTairaXorBscMessageProofJobQueryMaterial({
      manifest: READY_BSC_MANIFEST,
      messageBundle: bundle,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
    });

    expect(material).toMatchObject({
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      verifierAddressHex: BSC_VERIFIER_ADDRESS_HEX,
      bridgeAddressHex: BSC_BRIDGE_ADDRESS_HEX,
      verifierCodeHashHex: HEX32_D,
      verifierKeyHashHex: HEX32_E,
      expectedDestinationBindingHashHex: BSC_DESTINATION_BINDING.bindingHash,
    });
    const proofBytes = hexToBytes(material.proofBytesHex);
    expect(proofBytes).toHaveLength(
      SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1,
    );
    expect(bytesToHex(proofBytes.slice(32, 64))).toBe(TAIRA_TO_BSC_MESSAGE_ID);
    expect(bytesToHex(proofBytes.slice(64, 96))).toBe(`0x${"00".repeat(32)}`);
    expect(bytesToHex(proofBytes.slice(96, 128))).toBe(HEX32_C);

    expect(() =>
      buildTairaXorBscMessageProofJobQueryMaterial({
        manifest: READY_BSC_MANIFEST,
        messageBundle: bundle,
        messageId: HEX32_D,
      }),
    ).toThrow(/requested message id/);
    expect(() =>
      buildTairaXorBscMessageProofJobQueryMaterial({
        manifest: READY_BSC_MANIFEST,
        messageBundle: {
          ...bundle,
          commitment: {
            ...(bundle.commitment as Record<string, unknown>),
            message_id: HEX32_A,
          },
        },
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
      }),
    ).toThrow(/messageId aliases disagree/);
    expect(() =>
      buildTairaXorBscMessageProofJobQueryMaterial({
        manifest: READY_BSC_MANIFEST,
        messageBundle: {
          ...bundle,
          commitment_root: HEX32_A,
        },
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
      }),
    ).toThrow(/commitment root aliases disagree/);
    expect(() =>
      buildTairaXorBscMessageProofJobQueryMaterial({
        manifest: READY_BSC_MANIFEST,
        messageBundle: sampleTairaToTronJob().bundle as Record<string, unknown>,
        messageId: TAIRA_TO_TRON_MESSAGE_ID,
      }),
    ).toThrow(/target BSC/);
  });

  it("rejects stale or adversarial TAIRA to BSC message proof jobs", () => {
    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            bindingKey: "forged-binding-key",
          },
        },
        job: sampleTairaToBscJob(),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding key aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationRollout: {
            ...READY_BSC_MANIFEST.destinationRollout,
            destination_binding_key: "forged-binding-key",
          },
        },
        job: sampleTairaToBscJob(),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding key aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: {
          ...READY_BSC_MANIFEST,
          destinationBinding: {
            ...READY_BSC_MANIFEST.destinationBinding,
            sourceDomain: SCCP_SORA_DOMAIN,
            source_domain: SCCP_TRON_DOMAIN,
          },
        },
        job: sampleTairaToBscJob(),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding source domain aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          publicInputs: {
            ...(sampleTairaToBscJob().publicInputs as Record<string, unknown>),
            targetDomain: SCCP_TRON_DOMAIN,
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/target BSC/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          publicInputs: {
            ...(sampleTairaToBscJob().publicInputs as Record<string, unknown>),
            targetDomain: SCCP_BSC_DOMAIN,
            target_domain: SCCP_TRON_DOMAIN,
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/public inputs targetDomain aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          submissionPackage: {
            platformPayload: {
              kind: "evm_groth16_contract_call",
              value: {
                statementHash: HEX32_E,
                statement_hash: HEX32_A,
                destinationBinding: {
                  version: 1,
                  key: BSC_DESTINATION_BINDING.key,
                  bindingHash: BSC_DESTINATION_BINDING.bindingHash,
                },
              },
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/statement hash aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          publicInputs: {
            ...(sampleTairaToBscJob().publicInputs as Record<string, unknown>),
            message_id: HEX32_A,
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs\.messageId aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          bundle: {
            ...(sampleTairaToBscJob().bundle as Record<string, unknown>),
            commitment: {
              ...((sampleTairaToBscJob().bundle as Record<string, unknown>)
                .commitment as Record<string, unknown>),
              message_id: HEX32_A,
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/bundle\.commitment\.messageId aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          publicInputs: {
            ...(sampleTairaToBscJob().publicInputs as Record<string, unknown>),
            payload_hash: HEX32_A,
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs\.payloadHash aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          bundle: {
            ...(sampleTairaToBscJob().bundle as Record<string, unknown>),
            commitment: {
              ...((sampleTairaToBscJob().bundle as Record<string, unknown>)
                .commitment as Record<string, unknown>),
              payload_hash: HEX32_A,
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/bundle\.commitment\.payloadHash aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          publicInputs: {
            ...(sampleTairaToBscJob().publicInputs as Record<string, unknown>),
            destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            destination_binding_hash: HEX32_A,
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding hash aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          submissionPackage: {
            platformPayload: {
              kind: "evm_groth16_contract_call",
              value: {
                statementHash: HEX32_E,
                destinationBinding: {
                  version: 1,
                  key: BSC_DESTINATION_BINDING.key,
                  bindingHash: BSC_DESTINATION_BINDING.bindingHash,
                  binding_hash: HEX32_A,
                },
              },
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/destination binding hash aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...(
                sampleTairaToBscJob().payloadProjection as {
                  value: Record<string, unknown>;
                }
              ).value,
              recipient: { kind: "EvmHex", value: BSC_BRIDGE_ADDRESS },
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/recipient/);

    expect(() =>
      buildTairaXorBscFinalizeProofBinding({
        manifest: READY_BSC_MANIFEST,
        job: sampleTairaToBscJob({
          bundle: {
            ...(sampleTairaToBscJob().bundle as Record<string, unknown>),
            payload: {
              kind: "Transfer",
              value: {
                ...TAIRA_TO_BSC_TRANSFER_PAYLOAD,
                route_id: "taira_tron_xor",
              },
            },
          },
        }),
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        tairaSender: TAIRA_SENDER,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/Bundle route id|message id.*canonical/i);
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

  it("builds BSC finalize transaction requests from completed proof packages", () => {
    const canonicalPayloadHex = bytesToHex(
      canonicalSccpTransferPayloadBytes(TAIRA_TO_BSC_TRANSFER_PAYLOAD),
    );
    const proofBytes = bytesToHex(groth16ProofBytes());
    const publicInputs = {
      version: 1,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
      targetDomain: SCCP_BSC_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
      destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
    } as const;
    const callDataHex = tairaXorFinalizeFromTairaCallData({
      proofBytes,
      publicInputs,
      statementHash: HEX32_E,
      canonicalPayloadHex,
      amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    });
    const transaction = buildTairaXorBscFinalizeTransactionRequest({
      manifest: READY_BSC_MANIFEST,
      ownerAddress: BSC_RECIPIENT_ADDRESS.toUpperCase(),
      bscRecipient: BSC_RECIPIENT_ADDRESS,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      canonicalPayloadHex,
      proofPackage: {
        canonicalPayloadHex,
        submission: {
          callDataHex,
          canonicalPayloadHex,
          proofBytes,
          publicInputs,
          statementHash: HEX32_E,
        },
      },
    });

    expect(transaction).toEqual({
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      messageId: TAIRA_TO_BSC_MESSAGE_ID,
      transaction: {
        from: BSC_RECIPIENT_ADDRESS_HEX,
        to: BSC_BRIDGE_ADDRESS_HEX,
        data: callDataHex,
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      },
    });

    const genericVerifierCallDataHex = `${evmFunctionSelector(
      "submitSccpMessageProof(bytes,bytes32[6],bytes32)",
    )}${"00".repeat(32)}`;
    expect(
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex: genericVerifierCallDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs,
            statementHash: HEX32_E,
          },
        },
      }).transaction.data,
    ).toBe(callDataHex);

    const accessorBackedManifest: Record<string, unknown> = {
      ...READY_BSC_MANIFEST,
    };
    const manifestReads: string[] = [];
    Object.defineProperty(accessorBackedManifest, "destinationBinding", {
      enumerable: true,
      get() {
        manifestReads.push("destinationBinding");
        return READY_BSC_MANIFEST.destinationBinding;
      },
    });
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: accessorBackedManifest,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs,
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(manifestReads).toEqual([]);

    expect(
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            canonicalPayloadHex,
            proofBytes,
            publicInputs,
            statementHash: HEX32_E,
          },
        },
      }).transaction.data,
    ).toBe(callDataHex);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_TRON_MESSAGE_ID,
              payloadHash: TAIRA_TO_TRON_PAYLOAD_HASH,
              targetDomain: SCCP_TRON_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/target BSC/);
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/EVM address|BSC/i);
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/bridge request message id/);
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/bridge request canonical payload bytes/);
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          submission: {
            callDataHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/proof package is missing canonical payload bytes/);
    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex: bytesToHex(new Uint8Array([0xde, 0xad])),
          submission: {
            callDataHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/canonical payload bytes.*bridge request/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            canonical_payload_hex: bytesToHex(new Uint8Array([0xde, 0xad])),
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/canonical payload bytes aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            call_data_hex: "0xdeadbeef",
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/call data aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex: `${callDataHex.slice(0, 10)}${"00".repeat(64)}`,
            canonicalPayloadHex,
            proofBytes,
            publicInputs,
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/locally generated finalize request/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              target_domain: SCCP_TRON_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/public inputs targetDomain aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              message_id: HEX32_A,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/proofPackage\.publicInputs\.messageId aliases disagree/);

    expect(() =>
      buildTairaXorBscFinalizeTransactionRequest({
        manifest: READY_BSC_MANIFEST,
        ownerAddress: BSC_RECIPIENT_ADDRESS,
        bscRecipient: BSC_RECIPIENT_ADDRESS,
        amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
        messageId: TAIRA_TO_BSC_MESSAGE_ID,
        canonicalPayloadHex,
        proofPackage: {
          canonicalPayloadHex,
          submission: {
            callDataHex,
            canonicalPayloadHex,
            proofBytes,
            publicInputs: {
              messageId: TAIRA_TO_BSC_MESSAGE_ID,
              payloadHash: TAIRA_TO_BSC_PAYLOAD_HASH,
              targetDomain: SCCP_BSC_DOMAIN,
              destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
              destination_binding_hash: HEX32_A,
            },
            statementHash: HEX32_E,
          },
        },
      }),
    ).toThrow(/destination binding hash aliases disagree/);
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
    expect(
      buildSccpMessageBundleSubmitPayload(result.messageBundle),
    ).toMatchObject({
      commitment_root: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      commitment: {
        message_id: result.messageId,
        payload_hash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      },
      payload: {
        Transfer: {
          asset_id: bytesToHex(new TextEncoder().encode("xor")),
          sender: bytesToHex(new TextEncoder().encode(VALID_TRON_ADDRESS)),
          recipient: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)),
          route_id: bytesToHex(new TextEncoder().encode("taira_tron_xor")),
        },
      },
      finality_proof: expect.stringMatching(/^0x[0-9a-f]+$/u),
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
      contract_alias: "sccp.taira_xor::universal",
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

    const manifestSettlementAlias = "sccp.taira_tron_xor";
    const accessorTronManifest = { ...READY_TRON_MANIFEST };
    const tronManifestReads: string[] = [];
    Object.defineProperty(accessorTronManifest, "settlement", {
      enumerable: true,
      get() {
        tronManifestReads.push("settlement");
        return { contractAlias: manifestSettlementAlias };
      },
    });
    expect(() =>
      buildTairaXorInboundSettlement({
        manifest: accessorTronManifest,
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: accessorTronManifest,
        proofPackage: sampleTronToTairaProofPackage(),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(tronManifestReads).toEqual([]);

    expect(
      bindTronToTairaSourceProofPackage({
        manifest: {
          ...READY_TRON_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = `${manifestSettlementAlias}::universal`;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }).settlement,
    ).toMatchObject({
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
      contract_alias: `${manifestSettlementAlias}::universal`,
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

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.route_id = "taira_bsc_xor";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement route aliases disagree/);

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
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = manifestSettlementAlias;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement target must come from the TRON manifest/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: {
          ...READY_TRON_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = "sccp.taira_bsc_xor";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement contract alias must match the TRON manifest/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: {
          ...READY_TRON_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_address = "bridge@sccp";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not override the manifest contract alias/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: {
          ...READY_TRON_MANIFEST,
          settlement: { contractAddress: "bridge@sccp" },
        },
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = manifestSettlementAlias;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not override the manifest contract address/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = manifestSettlementAlias;
          settlement.contract_address = "bridge@sccp";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not declare both contract alias and contract address/);

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

    const accessorProofPackage = sampleTronToTairaProofPackage();
    const proofPackageReads: string[] = [];
    Object.defineProperty(accessorProofPackage, "settlement", {
      enumerable: true,
      get() {
        proofPackageReads.push("settlement");
        return {
          route: "taira_tron_xor",
          entrypoint: "finalize_inbound",
        };
      },
    });
    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: accessorProofPackage,
        txId: TRON_TX_ID,
        events: sampleTronSourceData().events,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/TRON -> TAIRA source proof package.*SCCP proof data/);
    expect(proofPackageReads).toEqual([]);

    const accessorEvents = sampleTronSourceData().events;
    const eventReads: string[] = [];
    Object.defineProperty(accessorEvents, "data", {
      enumerable: true,
      get() {
        eventReads.push("data");
        return [];
      },
    });
    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage(),
        txId: TRON_TX_ID,
        events: accessorEvents,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/TRON source proof package events.*SCCP proof data/);
    expect(eventReads).toEqual([]);
  });

  it("binds Solana source proof packages to TAIRA inbound settlement", () => {
    const bound = bindSolanaToTairaSourceProofPackage(
      sampleSolanaSourceProofBindInput(sampleSolanaToTairaSourceProofPackage()),
    );
    expect(bound).toMatchObject({
      txId: SOLANA_SOURCE_EVENT_SIGNATURE,
      messageId: SOLANA_TO_TAIRA_MESSAGE_ID,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      settlement: {
        entrypoint: "finalize_inbound",
        route: SCCP_SOLANA_XOR_ROUTE_ID,
      },
    });

    const manifestSettlementAlias = "sccp.taira_sol_xor";
    expect(
      buildTairaXorSolanaInboundSettlement({
        manifest: {
          settlement: {
            contractAlias: manifestSettlementAlias,
            contractAddress: "bridge@sccp",
          },
        },
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: SCCP_SOLANA_XOR_ROUTE_ID,
      contract_alias: `${manifestSettlementAlias}::universal`,
    });
    expect(
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            const settlement = packageRecord.settlement as Record<
              string,
              unknown
            >;
            settlement.contract_alias = `${manifestSettlementAlias}::universal`;
          }),
          {
            ...READY_SOLANA_MANIFEST,
            settlement: { contractAlias: manifestSettlementAlias },
          },
        ),
      ).settlement,
    ).toMatchObject({
      contract_alias: `${manifestSettlementAlias}::universal`,
      route: SCCP_SOLANA_XOR_ROUTE_ID,
      entrypoint: "finalize_inbound",
    });
  });

  it("rejects stale or adversarial Solana source proof packages", () => {
    for (const [field, value, expected] of [
      [
        "solanaNetwork",
        "solana-mainnet-beta",
        /network must be solana-testnet/u,
      ],
      [
        "solanaGenesisHash",
        "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        /genesis hash must match Solana testnet/u,
      ],
      [
        "backend",
        "sccp-solana-recursive-mainnet-v1",
        /backend must be sccp-solana-recursive-testnet-v1/u,
      ],
    ] as const) {
      expect(() =>
        bindSolanaToTairaSourceProofPackage(
          sampleSolanaSourceProofBindInput(
            sampleSolanaToTairaSourceProofPackage((packageRecord) => {
              packageRecord[field] = value;
            }),
          ),
        ),
      ).toThrow(expected);
    }
    expect(() =>
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            const settlement = packageRecord.settlement as Record<
              string,
              unknown
            >;
            settlement.route = "taira_tron_xor";
          }),
        ),
      ),
    ).toThrow(/settlement route must be taira_sol_xor/);
    expect(() =>
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            const publicInputs = packageRecord.publicInputs as Record<
              string,
              unknown
            >;
            publicInputs.solanaSender = SOLANA_BRIDGE_PROGRAM_ADDRESS;
          }),
        ),
      ),
    ).toThrow(/publicInputs owner/);
    expect(() =>
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            const bundle = packageRecord.messageBundle as Record<
              string,
              unknown
            >;
            const payload = bundle.payload as Record<string, unknown>;
            const value = payload.value as Record<string, unknown>;
            value.amount = "1";
          }),
        ),
      ),
    ).toThrow(/Bundle amount must match/);
    expect(() =>
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            const bundle = packageRecord.messageBundle as Record<
              string,
              unknown
            >;
            bundle.commitmentRoot = HEX32_A;
          }),
        ),
      ),
    ).toThrow(/commitment_root must match/);
    expect(() =>
      bindSolanaToTairaSourceProofPackage(
        sampleSolanaSourceProofBindInput(
          sampleSolanaToTairaSourceProofPackage((packageRecord) => {
            delete packageRecord.publicInputs;
          }),
        ),
      ),
    ).toThrow(/Solana source proof package publicInputs must be an object/);
  });

  it("requires every Solana source proof identity at top level and in public inputs", () => {
    const wrongAddress = SOLANA_BRIDGE_PROGRAM_ADDRESS;
    const fields: Array<[string, unknown]> = [
      ["version", 2],
      ["solanaNetwork", "solana-mainnet-beta"],
      ["solanaGenesisHash", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      ["backend", "sccp-solana-recursive-mainnet-v1"],
      ["sourceDomain", SCCP_SORA_DOMAIN],
      ["targetDomain", SCCP_SOLANA_DOMAIN],
      ["routeId", "invented_sol_xor"],
      ["asset", "dot"],
      ["txId", SOLANA_ROUTE_CANARY_SIGNATURE],
      ["messageId", HEX32_A],
      ["payloadHash", HEX32_A],
      ["commitmentRoot", HEX32_A],
      ["amountBaseUnits", "1"],
      ["sourceBridgeAddress", wrongAddress],
      ["sourceStateAddress", wrongAddress],
      ["tokenMintAddress", wrongAddress],
      ["sourceTokenAddress", wrongAddress],
      ["sourceBurnReceiptAddress", wrongAddress],
      ["ownerAddress", wrongAddress],
      ["tairaRecipient", TAIRA_OTHER_ACCOUNT_ID],
      ["nonce", "14"],
      ["sourceEventHash", HEX32_A],
      ["finalizedSlot", 78],
    ];
    for (const scope of ["package", "publicInputs"] as const) {
      for (const [field, wrong] of fields) {
        const missing = sampleSolanaToTairaSourceProofPackage((record) => {
          const target =
            scope === "package"
              ? record
              : (record.publicInputs as Record<string, unknown>);
          delete target[field];
        });
        expect(
          () =>
            bindSolanaToTairaSourceProofPackage(
              sampleSolanaSourceProofBindInput(missing),
            ),
          `${scope}.${field} deletion`,
        ).toThrow();

        const tampered = sampleSolanaToTairaSourceProofPackage((record) => {
          const target =
            scope === "package"
              ? record
              : (record.publicInputs as Record<string, unknown>);
          target[field] = wrong;
        });
        expect(
          () =>
            bindSolanaToTairaSourceProofPackage(
              sampleSolanaSourceProofBindInput(tampered),
            ),
          `${scope}.${field} tampering`,
        ).toThrow();
      }
    }
  });

  it("rejects non-canonical finalized Solana source burn transactions", () => {
    const reject = (
      mutate: (
        input: SolanaToTairaSourceProofPackageInput & {
          proofPackage: unknown;
        },
      ) => void,
    ) => {
      const input = sampleSolanaSourceProofBindInput(
        sampleSolanaToTairaSourceProofPackage(),
      );
      mutate(input);
      expect(() => bindSolanaToTairaSourceProofPackage(input)).toThrow();
    };
    const transactionMessage = (
      input: SolanaToTairaSourceProofPackageInput & { proofPackage: unknown },
    ) =>
      (input.transaction.transaction as Record<string, unknown>)
        .message as Record<string, unknown>;
    const sourceInstruction = (
      input: SolanaToTairaSourceProofPackageInput & { proofPackage: unknown },
    ) =>
      (transactionMessage(input).instructions as Record<string, unknown>[])[0];
    const sourceMeta = (
      input: SolanaToTairaSourceProofPackageInput & { proofPackage: unknown },
    ) => input.transaction.meta as Record<string, unknown>;

    reject((input) => {
      input.signatureStatus.confirmationStatus = "confirmed";
    });
    reject((input) => {
      input.finality.slot = 78;
    });
    reject((input) => {
      input.transaction.version = 0;
    });
    reject((input) => {
      (transactionMessage(input).accountKeys as unknown[])[0] = {
        pubkey: SOLANA_RECIPIENT_ADDRESS,
      };
    });
    reject((input) => {
      const keys = transactionMessage(input).accountKeys as string[];
      [keys[1], keys[2]] = [keys[2], keys[1]];
    });
    reject((input) => {
      (sourceInstruction(input).accounts as number[]).pop();
    });
    reject((input) => {
      (sourceInstruction(input).accounts as number[]).push(0);
    });
    reject((input) => {
      sourceInstruction(input).data = solanaBase58Encode(
        concatBytes(
          borshVec(new TextEncoder().encode("burn_to_taira")),
          borshVec(u64LeBytes(BSC_BRIDGE_AMOUNT_BASE_UNITS)),
          borshVec(new TextEncoder().encode(TAIRA_SENDER)),
        ),
      );
    });
    reject((input) => {
      sourceInstruction(input).data = solanaBase58Encode(
        concatBytes(
          borshVec(new TextEncoder().encode("burn_to_taira")),
          borshVec(u64LeBytes(BSC_BRIDGE_AMOUNT_BASE_UNITS)),
          borshVec(new TextEncoder().encode(TAIRA_SENDER)),
          borshVec(u64LeBytes("13")),
          borshVec(Uint8Array.of(1)),
        ),
      );
    });
    reject((input) => {
      sourceInstruction(input).data = solanaBase58Encode(
        concatBytes(
          borshVec(new TextEncoder().encode("burn_to_taira")),
          borshVec(u64LeBytes(BSC_BRIDGE_AMOUNT_BASE_UNITS)),
          borshVec(new TextEncoder().encode(TAIRA_SENDER)),
          borshVec(new TextEncoder().encode("13")),
        ),
      );
    });
    reject((input) => {
      (transactionMessage(input).accountKeys as string[])[4] =
        SOLANA_DESTINATION_TOKEN_ADDRESS;
    });
    reject((input) => {
      const inner = (
        sourceMeta(input).innerInstructions as Array<Record<string, unknown>>
      )[0].instructions as Array<Record<string, unknown>>;
      inner[0].data = solanaBase58Encode(
        concatBytes(Uint8Array.of(8), u64LeBytes("1")),
      );
    });
    reject((input) => {
      const pre = sourceMeta(input).preTokenBalances as Array<
        Record<string, unknown>
      >;
      delete pre[0].owner;
    });
    reject((input) => {
      const post = sourceMeta(input).postTokenBalances as Array<
        Record<string, unknown>
      >;
      post[0].owner = SOLANA_BRIDGE_PROGRAM_ADDRESS;
    });
    reject((input) => {
      const pre = sourceMeta(input).preTokenBalances as Array<
        Record<string, unknown>
      >;
      pre.push({
        ...pre[0],
        mint: SOLANA_BRIDGE_PROGRAM_ADDRESS,
      });
    });
    reject((input) => {
      sourceMeta(input).logMessages = [];
    });
  });

  it("binds BSC source proof packages to canonical receipt log metadata", () => {
    const receipt = sampleBscSourceData().receipt;
    expect(
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toMatchObject({
      txId: BSC_SOURCE_TX_HASH,
      sourceEventDigest: BSC_SOURCE_EVENT_DIGEST,
      amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
    });

    const manifestSettlementAlias = "sccp.taira_bsc_xor";
    expect(
      buildTairaXorBscInboundSettlement({
        manifest: {
          settlement: {
            contractAlias: manifestSettlementAlias,
            contractAddress: "bridge@sccp",
          },
        },
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: "taira_bsc_xor",
      contract_alias: `${manifestSettlementAlias}::universal`,
    });
    const accessorBscManifest = { ...READY_BSC_MANIFEST };
    const bscManifestReads: string[] = [];
    Object.defineProperty(accessorBscManifest, "settlement", {
      enumerable: true,
      get() {
        bscManifestReads.push("settlement");
        return { contractAlias: manifestSettlementAlias };
      },
    });
    expect(() =>
      buildTairaXorBscInboundSettlement({
        manifest: accessorBscManifest,
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: accessorBscManifest,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/SCCP route manifest must contain only JSON-serializable/);
    expect(bscManifestReads).toEqual([]);

    expect(
      bindBscToTairaSourceProofPackage({
        manifest: {
          ...READY_BSC_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = `${manifestSettlementAlias}::universal`;
        }),
        txId: BSC_SOURCE_TX_HASH,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }).settlement,
    ).toMatchObject({
      contract_alias: `${manifestSettlementAlias}::universal`,
      route: "taira_bsc_xor",
      entrypoint: "finalize_inbound",
    });

    const mixedAddressPayload = {
      version: 1,
      source_domain: SCCP_BSC_DOMAIN,
      dest_domain: SCCP_SORA_DOMAIN,
      nonce: BSC_TO_TAIRA_NONCE,
      asset_home_domain: SCCP_SORA_DOMAIN,
      asset_id_codec: SCCP_CODEC_TEXT_UTF8,
      asset_id: "xor",
      amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      sender_codec: SCCP_CODEC_EVM_HEX,
      sender: BSC_MIXED_RECIPIENT_ADDRESS,
      recipient_codec: SCCP_CODEC_TEXT_UTF8,
      recipient: TAIRA_SENDER,
      route_id_codec: SCCP_CODEC_TEXT_UTF8,
      route_id: "taira_bsc_xor",
    };
    const mixedAddressPayloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes({
        kind: "Transfer",
        value: mixedAddressPayload,
      }),
    );
    const mixedAddressMessageId = sccpTransferMessageId(mixedAddressPayload);
    const mixedAddressCommitment = {
      version: 1,
      kind: "Transfer",
      targetDomain: SCCP_SORA_DOMAIN,
      messageId: mixedAddressMessageId,
      payloadHash: mixedAddressPayloadHash,
    } as const;
    const mixedAddressMerkleProof = { steps: [] };
    const mixedAddressCommitmentRoot = sccpMerkleRootFromCommitment(
      {
        version: mixedAddressCommitment.version,
        kind: mixedAddressCommitment.kind,
        target_domain: mixedAddressCommitment.targetDomain,
        message_id: mixedAddressCommitment.messageId,
        payload_hash: mixedAddressCommitment.payloadHash,
      },
      mixedAddressMerkleProof,
    );
    const mixedAddressSourceEventDigest = tairaXorBscBurnSourceEventDigest({
      bridgeAddress: BSC_BRIDGE_ADDRESS_HEX,
      burnerAddress: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
      tairaRecipient: TAIRA_SENDER,
      amount: BSC_BRIDGE_AMOUNT_BASE_UNITS,
      nonce: BSC_TO_TAIRA_NONCE,
    });
    const mixedAddressBound = bindBscToTairaSourceProofPackage({
      manifest: READY_BSC_MANIFEST,
      ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
      proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
        packageRecord.sourceEventDigest = mixedAddressSourceEventDigest;
        packageRecord.messageId = mixedAddressMessageId;
        packageRecord.messageBundle = {
          version: 1,
          commitmentRoot: mixedAddressCommitmentRoot,
          commitment: mixedAddressCommitment,
          merkleProof: mixedAddressMerkleProof,
          payload: {
            kind: "Transfer",
            value: {
              ...mixedAddressPayload,
              sender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
            },
          },
          finalityProof: "0x010203",
        };
        packageRecord.publicInputs = {
          sourceDomain: SCCP_BSC_DOMAIN,
          targetDomain: SCCP_SORA_DOMAIN,
          messageId: mixedAddressMessageId,
          payloadHash: mixedAddressPayloadHash,
          commitmentRoot: mixedAddressCommitmentRoot,
          txId: BSC_SOURCE_TX_HASH,
          sourceEventDigest: mixedAddressSourceEventDigest,
          amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
          sender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
          recipient: TAIRA_SENDER,
          routeId: "taira_bsc_xor",
        };
      }),
      txId: BSC_SOURCE_TX_HASH,
      bscSender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });
    expect(
      (
        mixedAddressBound.messageBundle.payload as {
          value: Record<string, unknown>;
        }
      ).value.sender,
    ).toBe(BSC_MIXED_RECIPIENT_ADDRESS);
    const serializedMixedAddressBundle = buildSccpMessageBundleSubmitPayload(
      mixedAddressBound.messageBundle,
    ) as { payload: { Transfer: { sender: string } } };
    expect(serializedMixedAddressBundle.payload.Transfer.sender).toBe(
      bytesToHex(new TextEncoder().encode(BSC_MIXED_RECIPIENT_ADDRESS)),
    );

    expect(
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.sourceEventDigest = mixedAddressSourceEventDigest;
          packageRecord.messageId = mixedAddressMessageId;
          packageRecord.messageBundle = {
            version: 1,
            commitmentRoot: mixedAddressCommitmentRoot,
            commitment: mixedAddressCommitment,
            merkleProof: mixedAddressMerkleProof,
            payload: {
              kind: "Transfer",
              value: {
                ...mixedAddressPayload,
                sender: {
                  kind: "EvmHex",
                  payload: bytesToHex(
                    new TextEncoder().encode(BSC_MIXED_RECIPIENT_ADDRESS),
                  ),
                  value: BSC_MIXED_RECIPIENT_ADDRESS,
                },
                recipient: {
                  kind: "TextUtf8",
                  payload: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)),
                  value: TAIRA_SENDER,
                },
              },
            },
            finalityProof: "0x010203",
          };
          packageRecord.publicInputs = {
            sourceDomain: SCCP_BSC_DOMAIN,
            targetDomain: SCCP_SORA_DOMAIN,
            messageId: mixedAddressMessageId,
            payloadHash: mixedAddressPayloadHash,
            commitmentRoot: mixedAddressCommitmentRoot,
            txId: BSC_SOURCE_TX_HASH,
            sourceEventDigest: mixedAddressSourceEventDigest,
            amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
            sender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
            recipient: TAIRA_SENDER,
            routeId: "taira_bsc_xor",
          };
        }),
        txId: BSC_SOURCE_TX_HASH,
        bscSender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }).txId,
    ).toBe(BSC_SOURCE_TX_HASH);

    expect(
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.sourceEventDigest = mixedAddressSourceEventDigest;
          packageRecord.messageId = mixedAddressMessageId;
          packageRecord.messageBundle = {
            version: 1,
            commitmentRoot: mixedAddressCommitmentRoot,
            commitment: mixedAddressCommitment,
            merkleProof: mixedAddressMerkleProof,
            payload: {
              kind: "Transfer",
              value: {
                ...mixedAddressPayload,
                asset_id: bytesToHex(new TextEncoder().encode("xor")),
                sender: bytesToHex(
                  new TextEncoder().encode(BSC_MIXED_RECIPIENT_ADDRESS),
                ),
                recipient: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)),
                route_id: bytesToHex(new TextEncoder().encode("taira_bsc_xor")),
              },
            },
            finalityProof: "0x010203",
          };
          packageRecord.publicInputs = {
            sourceDomain: SCCP_BSC_DOMAIN,
            targetDomain: SCCP_SORA_DOMAIN,
            messageId: mixedAddressMessageId,
            payloadHash: mixedAddressPayloadHash,
            commitmentRoot: mixedAddressCommitmentRoot,
            txId: BSC_SOURCE_TX_HASH,
            sourceEventDigest: mixedAddressSourceEventDigest,
            amountBaseUnits: BSC_BRIDGE_AMOUNT_BASE_UNITS,
            sender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
            recipient: TAIRA_SENDER,
            routeId: "taira_bsc_xor",
          };
        }),
        txId: BSC_SOURCE_TX_HASH,
        bscSender: BSC_MIXED_RECIPIENT_ADDRESS_LOWER,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }).txId,
    ).toBe(BSC_SOURCE_TX_HASH);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.proofArtifactHash = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/proofArtifactHash must match the source request/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          delete packageRecord.nativeEvmProverBundleHash;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/nativeEvmProverBundleHash/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.proof_artifact_hash = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/proofArtifactHash aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.proving_key_hash = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/provingKeyHash aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.native_evm_prover_bundle_hash = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/nativeEvmProverBundleHash aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          delete packageRecord.publicInputs;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const publicInputs = packageRecord.publicInputs as Record<
            string,
            unknown
          >;
          packageRecord.public_inputs = {
            ...publicInputs,
            payloadHash: HEX32_A,
          };
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const publicInputs = packageRecord.publicInputs as Record<
            string,
            unknown
          >;
          publicInputs.targetDomain = SCCP_BSC_DOMAIN;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs must bind BSC -> TAIRA/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const publicInputs = packageRecord.publicInputs as Record<
            string,
            unknown
          >;
          publicInputs.txId = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs txId must match the source transaction/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const publicInputs = packageRecord.publicInputs as Record<
            string,
            unknown
          >;
          publicInputs.sender = BSC_BRIDGE_ADDRESS;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/publicInputs sender must match the BSC sender/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.route_id = "taira_tron_xor";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement route aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = "sccp.taira_tron_xor";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement target must come from the BSC manifest/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: {
          ...READY_BSC_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = "sccp.taira_tron_xor";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement contract alias must match the BSC manifest/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: {
          ...READY_BSC_MANIFEST,
          settlement: { contractAlias: manifestSettlementAlias },
        },
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_address = "bridge@sccp";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not override the manifest contract alias/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: {
          ...READY_BSC_MANIFEST,
          settlement: { contractAddress: "bridge@sccp" },
        },
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = manifestSettlementAlias;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not override the manifest contract address/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const settlement = packageRecord.settlement as Record<
            string,
            unknown
          >;
          settlement.contract_alias = manifestSettlementAlias;
          settlement.contract_address = "bridge@sccp";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/must not declare both contract alias and contract address/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.target_domain = SCCP_BSC_DOMAIN;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/commitment\.target_domain aliases disagree|target TAIRA\/SORA/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.commitment_root = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/commitment_root aliases disagree|must not use multiple aliases/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          const merkleProof = {
            steps: [{ sibling_hash: HEX32_A, sibling_is_left: false }],
          };
          bundle.merkle_proof = merkleProof;
          bundle.commitmentRoot = sccpMerkleRootFromCommitment(
            {
              version: Number(commitment.version),
              kind: "Transfer",
              target_domain: Number(commitment.targetDomain),
              message_id: String(commitment.messageId),
              payload_hash: String(commitment.payloadHash),
            },
            merkleProof,
          );
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/messageBundle\.merkle_proof aliases disagree/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.payloadHash = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/payload hash must match the TAIRA XOR BSC payload/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.commitmentRoot = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/commitment(?:R|_r)oot must match the commitment Merkle proof/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkleProof = {
            steps: [{ sibling_hash: HEX32_A, sibling_is_left: false }],
          };
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/commitment(?:R|_r)oot must match the commitment Merkle proof/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.messageId = HEX32_A;
          packageRecord.messageId = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message id must match the TAIRA XOR BSC payload/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const payload = bundle.payload as Record<string, unknown>;
          const transfer = payload.value as Record<string, unknown>;
          transfer.nonce = "2";
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/payload hash must match the TAIRA XOR BSC payload/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH.slice(2),
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/0x-prefixed 32-byte EVM hash/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: `0x${"00".repeat(32)}`,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/txId must be non-zero/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage((packageRecord) => {
          packageRecord.sourceEventDigest = HEX32_A;
        }),
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/source event digest/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        receipt: sampleBscSourceData((source) => {
          const logs = source.receipt.logs as Record<string, unknown>[];
          logs[1].transactionHash = HEX32_A;
        }).receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/log transaction hash.*source transaction/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        receipt: sampleBscSourceData((source) => {
          const logs = source.receipt.logs as Record<string, unknown>[];
          logs[1].blockHash = HEX32_A;
        }).receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/log block hash.*transaction receipt/);

    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        receipt: sampleBscSourceData((source) => {
          source.receipt.block_hash = HEX32_A;
        }).receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/receipt block hash aliases disagree/);

    const accessorProofPackage = sampleBscToTairaSourceProofPackage();
    const proofPackageReads: string[] = [];
    Object.defineProperty(accessorProofPackage, "settlement", {
      enumerable: true,
      get() {
        proofPackageReads.push("settlement");
        return {
          route: "taira_bsc_xor",
          entrypoint: "finalize_inbound",
        };
      },
    });
    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: accessorProofPackage,
        txId: BSC_SOURCE_TX_HASH,
        receipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/BSC -> TAIRA source proof package.*SCCP proof data/);
    expect(proofPackageReads).toEqual([]);

    const accessorReceipt = sampleBscSourceData().receipt;
    const receiptReads: string[] = [];
    Object.defineProperty(accessorReceipt, "blockNumber", {
      enumerable: true,
      get() {
        receiptReads.push("blockNumber");
        return "0x7b";
      },
    });
    expect(() =>
      bindBscToTairaSourceProofPackage({
        manifest: READY_BSC_MANIFEST,
        ...BSC_SOURCE_PROVER_MATERIAL_BINDING,
        proofPackage: sampleBscToTairaSourceProofPackage(),
        txId: BSC_SOURCE_TX_HASH,
        receipt: accessorReceipt,
        bscSender: BSC_SENDER_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/BSC source proof package receipt.*SCCP proof data/);
    expect(receiptReads).toEqual([]);
  });

  it("serializes BSC source message bundles only with strict proof surfaces", () => {
    const serialized = buildSccpMessageBundleSubmitPayload(
      sampleBscToTairaSourceProofPackage().messageBundle as Record<
        string,
        unknown
      >,
    );
    expect(serialized).toMatchObject({
      commitment_root: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      commitment: {
        kind: "Transfer",
        target_domain: SCCP_SORA_DOMAIN,
        message_id: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        payload_hash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      },
      merkle_proof: { steps: [] },
      payload: {
        Transfer: {
          sender_codec: SCCP_CODEC_EVM_HEX,
          sender: bytesToHex(new TextEncoder().encode(BSC_SENDER_ADDRESS_HEX)),
          recipient_codec: SCCP_CODEC_TEXT_UTF8,
          recipient: bytesToHex(new TextEncoder().encode(TAIRA_SENDER)),
          route_id: bytesToHex(new TextEncoder().encode("taira_bsc_xor")),
        },
      },
      finality_proof: "0x010203",
    });

    const accessorBundle = sampleBscToTairaSourceProofPackage()
      .messageBundle as Record<string, unknown>;
    const accessorCommitment = accessorBundle.commitment as Record<
      string,
      unknown
    >;
    const accessedBundleFields: string[] = [];
    Object.defineProperty(accessorCommitment, "debug", {
      enumerable: true,
      get() {
        accessedBundleFields.push("debug");
        return "not JSON";
      },
    });
    expect(() => buildSccpMessageBundleSubmitPayload(accessorBundle)).toThrow(
      /messageBundle.*SCCP proof data/,
    );
    expect(accessedBundleFields).toEqual([]);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkleProof = {
            steps: [{ siblingHash: HEX32_A, siblingIsLeft: "false" }],
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/sibling_is_left must be boolean/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkleProof = {
            steps: [
              { siblingHash: `0x${"00".repeat(32)}`, siblingIsLeft: false },
            ],
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/sibling_hash must be non-zero/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.finalityProof = "0x0000";
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/finality_proof must be non-zero/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.commitmentRoot = `0x${"00".repeat(32)}`;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/commitment_root must be non-zero/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.payloadHash = `0x${"00".repeat(32)}`;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/payload_hash must be non-zero/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.commitment_root = HEX32_A;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/commitment_root aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.message_id = HEX32_A;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/message_id aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.payload_hash = HEX32_A;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/payload_hash aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const commitment = bundle.commitment as Record<string, unknown>;
          commitment.target_domain = SCCP_BSC_DOMAIN;
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/target_domain aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkle_proof = {
            steps: [{ sibling_hash: HEX32_A, sibling_is_left: false }],
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/merkle_proof aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkleProof = {
            steps: [
              {
                siblingHash: HEX32_A,
                sibling_hash: HEX32_B,
                siblingIsLeft: false,
              },
            ],
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/sibling_hash aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.merkleProof = {
            steps: [
              {
                siblingHash: HEX32_A,
                siblingIsLeft: false,
                sibling_is_left: true,
              },
            ],
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/sibling_is_left aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          bundle.finality_proof = "0x040506";
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/finality_proof aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const payload = bundle.payload as Record<string, unknown>;
          const transfer = payload.value as Record<string, unknown>;
          transfer.assetId = "not-xor";
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/payload\.asset_id aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const payload = bundle.payload as Record<string, unknown>;
          const transfer = payload.value as Record<string, unknown>;
          transfer.routeId = "taira_tron_xor";
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/payload\.route_id aliases disagree/);

    expect(() =>
      buildSccpMessageBundleSubmitPayload(
        sampleBscToTairaSourceProofPackage((packageRecord) => {
          const bundle = packageRecord.messageBundle as Record<string, unknown>;
          const payload = bundle.payload as Record<string, unknown>;
          const transfer = payload.value as Record<string, unknown>;
          transfer.sender = {
            value: BSC_SENDER_ADDRESS,
            payload: BSC_BRIDGE_ADDRESS,
          };
        }).messageBundle as Record<string, unknown>,
      ),
    ).toThrow(/payload\.sender aliases disagree/);
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
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
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

    const solanaSnapshot = solanaWalletConnectSessionFromAddress(
      SOLANA_RECIPIENT_ADDRESS,
      "solana-topic",
    );
    expect(solanaSnapshot).toMatchObject({
      topic: "solana-topic",
      address: SOLANA_RECIPIENT_ADDRESS,
      chainId: SCCP_SOLANA_NETWORK.caipChainId,
      namespace: "solana",
      methodVersion: "solana-wallet-standard-v1",
    });
    expect(JSON.stringify(solanaSnapshot)).not.toMatch(
      /private|seed|mnemonic/iu,
    );
  });
});

describe("SCCP proof package helpers", () => {
  const destinationProofBundleFixture = (targetDomain: number) => {
    const transferPayload =
      targetDomain === SCCP_BSC_DOMAIN
        ? TAIRA_TO_BSC_TRANSFER_PAYLOAD
        : targetDomain === SCCP_TON_DOMAIN
          ? {
              version: 1,
              source_domain: SCCP_SORA_DOMAIN,
              dest_domain: SCCP_TON_DOMAIN,
              nonce: "7",
              asset_home_domain: SCCP_SORA_DOMAIN,
              asset_id_codec: SCCP_CODEC_TEXT_UTF8,
              asset_id: "xor",
              amount: "2250000000",
              sender_codec: SCCP_CODEC_TEXT_UTF8,
              sender: TAIRA_SENDER,
              recipient_codec: SCCP_CODEC_TON_RAW,
              recipient: TON_RECIPIENT_ADDRESS,
              route_id_codec: SCCP_CODEC_TEXT_UTF8,
              route_id: SCCP_TON_XOR_ROUTE_ID,
            }
          : TAIRA_TO_TRON_TRANSFER_PAYLOAD;
    const payload = {
      kind: "Transfer" as const,
      value: transferPayload,
    };
    const messageId = sccpTransferMessageId(transferPayload);
    const payloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes(payload),
    );
    const commitment = {
      version: 1 as const,
      kind: "Transfer" as const,
      target_domain: targetDomain,
      message_id: messageId,
      payload_hash: payloadHash,
    };
    const merkleProof = { steps: [] };
    const commitmentRoot = sccpMerkleRootFromCommitment(
      commitment,
      merkleProof,
    );
    const bundleBytes = canonicalSccpMessageProofBundleBytes({
      version: 1,
      commitment_root: commitmentRoot,
      commitment,
      merkle_proof: merkleProof,
      payload,
      finality_proof: "0x",
    });
    return {
      publicInputs: {
        version: 1 as const,
        messageId,
        payloadHash,
        targetDomain,
        commitmentRoot,
        finalityHeight: 10,
        finalityBlockHash: HEX32_D,
      },
      bundleBytes,
      sourceProofBytes: Uint8Array.from([]),
    };
  };

  const tronPackageWitness = () => ({
    ...destinationProofBundleFixture(SCCP_TRON_DOMAIN),
    sourceDomain: SCCP_SORA_DOMAIN,
    statementHash: HEX32_E,
    destinationBinding: TRON_DESTINATION_BINDING,
    destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
  });

  const bscPackageWitness = () => ({
    ...destinationProofBundleFixture(SCCP_BSC_DOMAIN),
    sourceDomain: SCCP_SORA_DOMAIN,
    statementHash: HEX32_E,
    destinationBinding: BSC_DESTINATION_BINDING,
    destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
  });

  const tonPackageWitness = () => ({
    ...destinationProofBundleFixture(SCCP_TON_DOMAIN),
    statementHash: HEX32_E,
    destinationBindingHash: HEX32_C,
    sourceStateVerifierHash: HEX32_A,
    sourceAdapterDeploymentHash: HEX32_B,
    sourceAdapterDeploymentReceiptHash: HEX32_D,
  });

  const wrappedBscProofResult = (
    witness = bscPackageWitness(),
  ): Record<string, unknown> => {
    const request = buildBscTestnetSccpDestinationProofRequest(witness);
    const result = wrapBscTestnetSccpDestinationProofResult(
      groth16ProofBytes(request),
      request,
    );
    return {
      ...result,
      proofBytes: result.proofBytes,
      bundleBytes: result.bundleBytes,
      sourceProofBytes: result.sourceProofBytes,
    };
  };

  it("serializes byte arrays as hex strings", () => {
    expect(serializeSccpValue(Uint8Array.from([0, 15, 255]))).toBe("0x000fff");
  });

  it("rejects accessor-backed serialized proof values without invoking them", () => {
    const accessedFields: string[] = [];
    const value = {
      proof: {
        bytes: Uint8Array.from([1, 2, 3]),
      },
    };
    Object.defineProperty(value.proof, "debug", {
      enumerable: true,
      get() {
        accessedFields.push("debug");
        return "not JSON";
      },
    });

    expect(() => serializeSccpValue(value)).toThrow(
      /SCCP proof package values/,
    );
    expect(accessedFields).toEqual([]);
  });

  it("rejects array side-channel fields during proof value serialization", () => {
    const value = {
      proofs: [Uint8Array.from([1, 2, 3])],
    };
    (
      value.proofs as Array<Uint8Array> & {
        privateKeyHex?: string;
      }
    ).privateKeyHex = "11".repeat(32);

    expect(() => serializeSccpValue(value)).toThrow(
      /SCCP proof package values/,
    );
  });

  it("accepts null-prototype proof records during value serialization", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.proofBytes = Uint8Array.from([1, 2, 3]);

    expect(serializeSccpValue(value)).toEqual({
      proofBytes: "0x010203",
    });
  });

  it("rejects non-plain object instances during proof value serialization", () => {
    expect(() =>
      serializeSccpValue({
        proof: new Map([["bytes", Uint8Array.from([1, 2, 3])]]),
      }),
    ).toThrow(/SCCP proof package values/);
    expect(() =>
      serializeSccpValue({
        generatedAt: new Date(0),
      }),
    ).toThrow(/SCCP proof package values/);
  });

  it("rejects hidden own proof fields during value serialization", () => {
    const value = {
      proofBytes: Uint8Array.from([1, 2, 3]),
    };
    Object.defineProperty(value, "requestHash", {
      enumerable: false,
      value: HEX32_A,
    });

    expect(() => serializeSccpValue(value)).toThrow(
      /SCCP proof package values/,
    );
  });

  it("rejects hidden array and symbol proof fields during value serialization", () => {
    const symbolKey = Symbol("proof");
    const value = {
      proofs: [Uint8Array.from([1, 2, 3])],
    };
    Object.defineProperty(value.proofs, "requestHash", {
      enumerable: false,
      value: HEX32_A,
    });

    expect(() => serializeSccpValue(value)).toThrow(
      /SCCP proof package values/,
    );

    const symbolValue = {
      proofBytes: Uint8Array.from([1, 2, 3]),
    };
    Object.defineProperty(symbolValue, symbolKey, {
      enumerable: false,
      value: HEX32_B,
    });

    expect(() => serializeSccpValue(symbolValue)).toThrow(
      /SCCP proof package values/,
    );
  });

  it("rejects cyclic proof values during value serialization", () => {
    const objectCycle: Record<string, unknown> = {
      proofBytes: Uint8Array.from([1, 2, 3]),
    };
    objectCycle.self = objectCycle;

    expect(() => serializeSccpValue(objectCycle)).toThrow(
      /SCCP proof package values/,
    );

    const arrayCycle: unknown[] = [Uint8Array.from([1, 2, 3])];
    arrayCycle.push(arrayCycle);

    expect(() => serializeSccpValue({ proofs: arrayCycle })).toThrow(
      /SCCP proof package values/,
    );
  });

  it("allows repeated acyclic proof references during value serialization", () => {
    const shared = {
      proofBytes: Uint8Array.from([1, 2, 3]),
    };

    expect(
      serializeSccpValue({
        first: shared,
        second: shared,
      }),
    ).toEqual({
      first: {
        proofBytes: "0x010203",
      },
      second: {
        proofBytes: "0x010203",
      },
    });
  });

  it("rejects non-finite proof numbers during value serialization", () => {
    expect(() =>
      serializeSccpValue({
        finalityHeight: Number.NaN,
      }),
    ).toThrow(/SCCP proof package values/);
    expect(() =>
      serializeSccpValue({
        finalityHeight: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/SCCP proof package values/);
  });

  it("rejects undefined proof values during value serialization", () => {
    expect(() =>
      serializeSccpValue({
        proofBytes: undefined,
      }),
    ).toThrow(/SCCP proof package values/);
  });

  it("builds canonical TRON proof requests before proof bytes are available", () => {
    const witness = tronPackageWitness();
    const result = buildTronSccpProofPackage({
      witness,
    });

    expect(result.submission).toBeNull();
    expect(result.bridgePayload).toBeNull();
    expect(result.request).toMatchObject({
      version: 1,
      targetDomain: SCCP_TRON_DOMAIN,
      bundleBytes: bytesToHex(witness.bundleBytes),
      sourceProofBytes: "0x",
    });
  });

  it("builds canonical BSC proof requests before proof bytes are available", () => {
    const witness = bscPackageWitness();
    const result = buildBscSccpProofPackage({
      witness,
    });

    expect(result.submission).toBeNull();
    expect(result.bridgePayload).toBeNull();
    expect(result.request).toMatchObject({
      version: 1,
      targetDomain: SCCP_BSC_DOMAIN,
      bundleBytes: bytesToHex(witness.bundleBytes),
      sourceProofBytes: "0x",
      destinationBindingHash: BSC_DESTINATION_BINDING.bindingHash,
    });

    const nativeBoundResult = buildBscSccpProofPackage({
      witness: {
        ...witness,
        nativeEvmProverBundleHash:
          BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
      } as never,
    });
    expect(nativeBoundResult.request).toMatchObject({
      nativeEvmProverBundleHash:
        BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
    });
  });

  it("builds canonical TON proof requests before proof bytes are available", () => {
    const witness = tonPackageWitness();
    const result = buildTonSccpProofPackage({
      witness,
    });

    expect(result.submission).toBeNull();
    expect(result.request).toMatchObject({
      version: 1,
      targetDomain: SCCP_TON_DOMAIN,
      bundleBytes: bytesToHex(witness.bundleBytes),
      sourceProofBytes: "0x",
      statementHash: HEX32_E,
      destinationBindingHash: HEX32_C,
      sourceStateVerifierHash: HEX32_A,
    });
  });

  it("rejects non-empty source proof bytes for SORA-origin destination proof requests", () => {
    expect(() =>
      buildTronSccpProofPackage({
        witness: {
          ...tronPackageWitness(),
          sourceProofBytes: Uint8Array.from([4, 5]),
        },
      }),
    ).toThrow(/sourceProofBytes must be empty for SORA source bundle/u);

    expect(() =>
      buildBscSccpProofPackage({
        witness: {
          ...bscPackageWitness(),
          sourceProofBytes: Uint8Array.from([4, 5]),
        },
      }),
    ).toThrow(/sourceProofBytes must be empty for SORA source bundle/u);
  });

  it("rejects accessor-backed TRON proof package inputs without invoking them", () => {
    const witness = tronPackageWitness();
    const accessedFields: string[] = [];
    Object.defineProperty(witness.publicInputs, "messageId", {
      enumerable: true,
      get() {
        accessedFields.push("messageId");
        return HEX32_F;
      },
    });

    expect(() =>
      buildTronSccpProofPackage({
        witness,
      }),
    ).toThrow(/SCCP proof data/u);
    expect(accessedFields).toEqual([]);
  });

  it("rejects accessor-backed BSC proof package inputs before prover execution", async () => {
    const witness = bscPackageWitness();
    const accessedFields: string[] = [];
    let proveCalled = false;
    Object.defineProperty(witness.publicInputs, "payloadHash", {
      enumerable: true,
      get() {
        accessedFields.push("payloadHash");
        return HEX32_F;
      },
    });

    await expect(
      generateBscSccpProofPackage({
        witness,
        prove: (request) => {
          proveCalled = true;
          return {
            proofBytes: groth16ProofBytes(request),
            requestHash: request.requestHash,
          };
        },
      }),
    ).rejects.toThrow(/SCCP proof data/u);
    expect(proveCalled).toBe(false);
    expect(accessedFields).toEqual([]);
  });

  it("rejects unsafe BSC proof package network metadata without coercion", () => {
    const witnessWithAccessorNetwork = bscPackageWitness();
    const accessorNetworkBinding = { ...BSC_DESTINATION_BINDING };
    const accessedFields: string[] = [];
    Object.defineProperty(accessorNetworkBinding, "networkId", {
      enumerable: true,
      get() {
        accessedFields.push("networkId");
        return BSC_TESTNET_NETWORK_ID_HEX;
      },
    });
    witnessWithAccessorNetwork.destinationBinding =
      accessorNetworkBinding as never;

    expect(() =>
      buildBscSccpProofPackage(
        {
          witness: witnessWithAccessorNetwork,
        },
        false,
      ),
    ).toThrow(/SCCP proof package values/u);
    expect(accessedFields).toEqual([]);

    const witnessWithNumericNetwork = bscPackageWitness();
    witnessWithNumericNetwork.destinationBinding = {
      ...BSC_DESTINATION_BINDING,
      networkId: 97,
    } as never;

    expect(() =>
      buildBscSccpProofPackage(
        {
          witness: witnessWithNumericNetwork,
        },
        false,
      ),
    ).toThrow(/network id must be canonical hex/u);
  });

  it("rejects stale TRON proof results before building submission payloads", () => {
    expect(() =>
      buildTronSccpProofPackage({
        witness: tronPackageWitness(),
        proofResult: {
          requestHash: HEX32_B,
        } as never,
      }),
    ).toThrow(/must match the proof request/);
  });

  it("rejects stale BSC proof results before building submission payloads", () => {
    expect(() =>
      buildBscSccpProofPackage({
        witness: bscPackageWitness(),
        proofResult: {
          requestHash: HEX32_B,
        } as never,
      }),
    ).toThrow(/must match the proof request/);
  });

  it("rejects BSC proof results whose destination binding hash drifts after request binding", () => {
    const witness = bscPackageWitness();
    const proofResult = {
      ...wrappedBscProofResult(witness),
      destinationBindingHash: HEX32_F,
    };

    expect(() =>
      buildBscSccpProofPackage({
        witness,
        proofResult: proofResult as never,
      }),
    ).toThrow(/destinationBindingHash/u);
  });

  it("rejects BSC proof results whose proof context drifts after request binding", () => {
    const witness = bscPackageWitness();
    const proofResult = wrappedBscProofResult(witness);
    proofResult.proofContext = {
      ...(proofResult.proofContext as Record<string, unknown>),
      statementHash: HEX32_F,
    };

    expect(() =>
      buildBscSccpProofPackage({
        witness,
        proofResult: proofResult as never,
      }),
    ).toThrow(/proofContext must match statementHash/u);
  });

  it("rejects BSC proof results whose bundle bytes drift while requestHash stays fixed", () => {
    const witness = bscPackageWitness();
    const proofResult = {
      ...wrappedBscProofResult(witness),
      bundleBytes: Uint8Array.from([9, 9, 9]),
    };

    expect(() =>
      buildBscSccpProofPackage({
        witness,
        proofResult: proofResult as never,
      }),
    ).toThrow(/bundleBytes/u);
  });

  it("rejects BSC proof results whose proofBase64 does not match proofBytes", () => {
    const witness = bscPackageWitness();
    const proofResult = {
      ...wrappedBscProofResult(witness),
      proofBase64: "tampered",
    };

    expect(() =>
      buildBscSccpProofPackage({
        witness,
        proofResult: proofResult as never,
      }),
    ).toThrow(/proofBase64 must match proofResult.proofBytes/u);
  });

  it("rejects BSC proof results whose destination binding bridge drifts", () => {
    const witness = bscPackageWitness();
    const proofResult = wrappedBscProofResult(witness);
    proofResult.destinationBinding = {
      ...(proofResult.destinationBinding as Record<string, unknown>),
      bridgeAddress: BSC_RECIPIENT_ADDRESS,
    };

    expect(() =>
      buildBscSccpProofPackage({
        witness,
        proofResult: proofResult as never,
      }),
    ).toThrow(/destinationBinding/u);
  });

  it("reports missing browser-safe TRON prover before proof generation", async () => {
    await expect(
      generateTronSccpProofPackage({
        witness: tronPackageWitness(),
      }),
    ).rejects.toMatchObject({
      code: "ERR_SCCP_TRON_PROVER_UNAVAILABLE",
    });
  });

  it("reports missing browser-safe BSC prover before proof generation", async () => {
    await expect(
      generateBscSccpProofPackage({
        witness: bscPackageWitness(),
      }),
    ).rejects.toMatchObject({
      code: "ERR_SCCP_BSC_PROVER_UNAVAILABLE",
    });
  });

  it("reports missing browser-safe TON prover before proof generation", async () => {
    await expect(
      generateTonSccpProofPackage({
        witness: tonPackageWitness(),
      }),
    ).rejects.toMatchObject({
      code: "ERR_SCCP_TON_PROVER_UNAVAILABLE",
    });
  });

  it("rejects accessor-backed TRON prover results before submission binding", async () => {
    const accessedFields: string[] = [];
    await expect(
      generateTronSccpProofPackage({
        witness: tronPackageWitness(),
        prove: (request) => {
          const result = {
            proofBytes: groth16ProofBytes(request),
          };
          Object.defineProperty(result, "requestHash", {
            enumerable: true,
            get() {
              accessedFields.push("requestHash");
              return request.requestHash;
            },
          });
          return result as never;
        },
      }),
    ).rejects.toThrow(/TRON SCCP proof result.*SCCP proof data/u);
    expect(accessedFields).toEqual([]);
  });

  it("rejects accessor-backed BSC prover results before submission binding", async () => {
    const accessedFields: string[] = [];
    await expect(
      generateBscSccpProofPackage({
        witness: bscPackageWitness(),
        prove: (request) => {
          const result = {
            proofBytes: groth16ProofBytes(request),
          };
          Object.defineProperty(result, "requestHash", {
            enumerable: true,
            get() {
              accessedFields.push("requestHash");
              return request.requestHash;
            },
          });
          return result as never;
        },
      }),
    ).rejects.toThrow(/BSC SCCP proof result.*SCCP proof data/u);
    expect(accessedFields).toEqual([]);
  });

  it("binds generated proof packages to a pre-prover witness snapshot", async () => {
    const witness = tronPackageWitness();
    const originalPublicInputs = { ...witness.publicInputs };
    const originalBundleBytesHex = bytesToHex(witness.bundleBytes);

    const result = await generateTronSccpProofPackage({
      witness,
      prove: (request) => {
        witness.publicInputs.messageId = HEX32_F;
        witness.bundleBytes = Uint8Array.from([9, 9, 9]);
        return {
          proofBytes: groth16ProofBytes(request),
          requestHash: request.requestHash,
        };
      },
    });

    expect(witness.publicInputs.messageId).toBe(HEX32_F);
    expect(result.request).toMatchObject({
      publicInputs: {
        messageId: originalPublicInputs.messageId,
        payloadHash: originalPublicInputs.payloadHash,
      },
      bundleBytes: originalBundleBytesHex,
      sourceProofBytes: "0x",
    });
    expect(result.submission).toMatchObject({
      proofBytes: expect.any(String),
    });
  });

  it("binds generated BSC proof packages to a pre-prover witness snapshot", async () => {
    const canonicalPayloadHex = "0x01020304";
    const witness = {
      ...bscPackageWitness(),
      nativeEvmProverBundleHash:
        BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
    } as ReturnType<typeof bscPackageWitness> & {
      nativeEvmProverBundleHash: string;
    };
    const originalPublicInputs = { ...witness.publicInputs };
    const originalBundleBytesHex = bytesToHex(witness.bundleBytes);
    let proverRequestNativeBundleHash = "";

    const result = await generateBscSccpProofPackage({
      witness,
      canonicalPayloadHex,
      prove: (request) => {
        proverRequestNativeBundleHash = String(
          (request as unknown as Record<string, unknown>)
            .nativeEvmProverBundleHash ?? "",
        );
        witness.publicInputs.messageId = HEX32_F;
        witness.bundleBytes = Uint8Array.from([9, 9, 9]);
        return {
          proofBytes: groth16ProofBytes(request),
          requestHash: request.requestHash,
        };
      },
    });

    expect(witness.publicInputs.messageId).toBe(HEX32_F);
    expect(result.canonicalPayloadHex).toBe(canonicalPayloadHex);
    expect(proverRequestNativeBundleHash).toBe(
      BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
    );
    expect(result.request).toMatchObject({
      publicInputs: {
        messageId: originalPublicInputs.messageId,
        payloadHash: originalPublicInputs.payloadHash,
        targetDomain: SCCP_BSC_DOMAIN,
      },
      bundleBytes: originalBundleBytesHex,
      sourceProofBytes: "0x",
      nativeEvmProverBundleHash:
        BSC_SOURCE_PROVER_MATERIAL_BINDING.nativeEvmProverBundleHash,
    });
    expect(result.submission).toMatchObject({
      proofBytes: expect.any(String),
      callDataHex: expect.stringMatching(/^0x[0-9a-f]+$/u),
    });
  });
});

import { sha256 } from "@noble/hashes/sha256";
import {
  buildTairaXorSccpRecordDescriptor,
  buildTairaXorSccpBurnRecordZkIvmRequest,
  canonicalSccpTransferPayloadBytes,
  canonicalSccpMessageProofBundleBytes,
  sccpPayloadHash,
  sccpTransferMessageId,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1,
  SCCP_TAIRA_XOR_ASSET_KEY_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  tairaXorBurnSourceEventDigest,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  tairaXorTransferPayloadHash,
} from "@iroha/iroha-js/sccp";
import type {
  TairaXorSccpBurnRecordZkIvmRequest,
  TairaXorSccpRecordDescriptor,
  SccpTransferPayload,
  TronSccpDestinationBindingInput,
  TronSccpProofRequestInput,
} from "@iroha/iroha-js/sccp";
import { TAIRA_CHAIN_ID, TAIRA_NETWORK_PREFIX } from "@/constants/chains";

export const TRON_MAINNET_CAIP_CHAIN_ID = "tron:0x2b6653dc";
export const TRON_MAINNET_CHAIN_ID_HEX = "0x2b6653dc";
export const TRON_MAINNET_NETWORK_ID_HEX =
  "0x000000000000000000000000000000000000000000000000000000002b6653dc";
export const TRON_MAINNET_RPC_URL = "https://api.trongrid.io";
export const TRON_MAINNET_TRONSCAN_URL = "https://tronscan.org";
export const WALLETCONNECT_TRON_NAMESPACE = "tron";
export const WALLETCONNECT_TRON_SIGN_METHOD = "tron_signTransaction";
export const WALLETCONNECT_TRON_METHOD_VERSION = "v1";
export const SCCP_TRON_DOMAIN = 5;
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_XOR_ROUTE_ID = SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1;
export const SCCP_XOR_ASSET_KEY = SCCP_TAIRA_XOR_ASSET_KEY_V1;
export const SCCP_TRON_TOKEN_SYMBOL = "TairaXOR";
export const SCCP_XOR_DECIMALS = 18;
export const SCCP_TRON_DEFAULT_FEE_LIMIT = 100_000_000;

export {
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  tairaXorBurnSourceEventDigest,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  tairaXorTransferPayloadHash,
};

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_BASE58_INDEX = new Map(
  Array.from(TRON_BASE58_ALPHABET, (character, index) => [character, index]),
);

export type SccpBridgeDirection = "taira-to-tron" | "tron-to-taira";

export type SccpRouteConfig = {
  id: string;
  assetKey: string;
  label: string;
  localDomain: number;
  tronDomain: number;
  tronChainId: string;
  tronNetworkIdHex: string;
};

export const SCCP_XOR_ROUTE: SccpRouteConfig = {
  id: SCCP_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  label: "XOR / TairaXOR",
  localDomain: SCCP_SORA_DOMAIN,
  tronDomain: SCCP_TRON_DOMAIN,
  tronChainId: TRON_MAINNET_CAIP_CHAIN_ID,
  tronNetworkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
};

export type SccpNetworkSnapshot = {
  chainId?: string | null;
  networkPrefix?: number | string | null;
};

export type SccpRouteReadiness = {
  ready: boolean;
  status: "ready" | "disabled" | "unavailable" | "incomplete";
  reasons: string[];
  tronManifest: Record<string, unknown> | null;
};

export type WalletConnectSessionSnapshot = {
  topic: string | null;
  address: string | null;
  chainId: string;
  namespace: typeof WALLETCONNECT_TRON_NAMESPACE;
  methodVersion: typeof WALLETCONNECT_TRON_METHOD_VERSION;
  connectedAtMs: number;
};

export type TronSmartContractTriggerRequest = {
  ownerAddress: string;
  contractAddress: string;
  functionSelector: string;
  callData: string;
  feeLimit: number;
};

export type TronSccpProofMaterial = {
  networkIdHex: string;
  tronVerifierAddress: string;
  verifierCodeHashHex: string;
  verifierKeyHashHex: string;
  expectedDestinationBindingHashHex: string;
};

export type TairaXorOutboundPreview = {
  payload: Record<string, unknown>;
  canonicalPayloadHex: string;
  recordDescriptor: TairaXorSccpRecordDescriptor;
  messageId: string;
  payloadHash: string;
  contractPayloadHash: string;
  amountBaseUnits: string;
};

export type TairaXorBurnRecordMaterial = {
  settlementAssetDefinitionId: string;
  contractArtifactB64: string;
  vkRef: {
    backend: string;
    name: string;
  };
  gasLimit?: number;
};

export type TairaXorOutboundBurnRecordRequest = {
  outbound: TairaXorOutboundPreview;
  material: TairaXorBurnRecordMaterial;
  zkIvmRequest: TairaXorSccpBurnRecordZkIvmRequest;
};

export type TairaXorFinalizeFromTairaProofBinding = {
  witness: TronSccpProofRequestInput;
  destinationBinding: TronSccpDestinationBindingInput;
  messageBundle: Record<string, unknown>;
  amountBaseUnits: string;
  messageId: string;
  payloadHash: string;
};

export type TairaXorFinalizeTriggerRequest = {
  trigger: TronSmartContractTriggerRequest;
  amountBaseUnits: string;
  messageId: string;
};

export type TronToTairaSourceProofPackageInput = {
  manifest: Record<string, unknown> | null | undefined;
  txId: string;
  transaction: Record<string, unknown>;
  receipt: Record<string, unknown>;
  events: Record<string, unknown>;
  finality: Record<string, unknown>;
  tronSender: string;
  tairaRecipient: string;
  amountDecimal: string;
};

export type TronToTairaSourceProofPackage = {
  messageBundle: Record<string, unknown>;
  settlement: Record<string, unknown>;
  sourceEventDigest: string;
  txId: string;
  messageId: string;
  amountBaseUnits: string;
};

export const isTairaSccpNetwork = (connection: SccpNetworkSnapshot): boolean =>
  String(connection.chainId ?? "").trim() === TAIRA_CHAIN_ID &&
  Number(connection.networkPrefix) === TAIRA_NETWORK_PREFIX;

export const isLikelyTairaAccount = (accountId: string): boolean => {
  const normalized = accountId.trim();
  return normalized.startsWith("testu") && normalized.length >= 16;
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

const doubleSha256 = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes));

const base58Decode = (value: string): Uint8Array | null => {
  let number = 0n;
  for (const character of value) {
    const digit = TRON_BASE58_INDEX.get(character);
    if (digit === undefined) {
      return null;
    }
    number = number * 58n + BigInt(digit);
  }

  let hex = number === 0n ? "" : number.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  const decoded = hex
    ? Uint8Array.from(
        hex.match(/.{1,2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
      )
    : new Uint8Array();
  const leadingZeroes = value.match(/^1*/u)?.[0].length ?? 0;
  if (leadingZeroes === 0) {
    return decoded;
  }
  const output = new Uint8Array(leadingZeroes + decoded.length);
  output.set(decoded, leadingZeroes);
  return output;
};

export const decodeTronBase58CheckAddress = (address: string): Uint8Array => {
  const normalized = address.trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(normalized)) {
    throw new Error("TRON address must be a Base58Check mainnet address.");
  }
  const decoded = base58Decode(normalized);
  if (!decoded || decoded.length !== 25) {
    throw new Error(
      "TRON address must decode to a 25-byte Base58Check payload.",
    );
  }
  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  if (!bytesEqual(checksum, expectedChecksum)) {
    throw new Error("TRON address checksum is invalid.");
  }
  if (payload[0] !== 0x41 || payload.slice(1).every((byte) => byte === 0)) {
    throw new Error("TRON address must be a non-zero mainnet account.");
  }
  return payload;
};

export const isValidTronBase58CheckAddress = (address: string): boolean => {
  try {
    decodeTronBase58CheckAddress(address);
    return true;
  } catch (_error) {
    return false;
  }
};

export const normalizeTronAddress = (address: string): string => {
  const normalized = address.trim();
  decodeTronBase58CheckAddress(normalized);
  return normalized;
};

export const normalizeBridgeAmount = (value: string): string => {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/u.test(normalized)) {
    throw new Error("Amount must be a positive decimal value.");
  }
  if (bridgeDecimalToBaseUnits(normalized) === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  return normalized;
};

export const bridgeDecimalToBaseUnits = (
  value: string,
  decimals = SCCP_XOR_DECIMALS,
): string => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("Decimal precision is unsupported.");
  }
  const normalized = value.trim();
  const amountPattern = new RegExp(
    `^(?:0|[1-9]\\d*)(?:\\.\\d{1,${decimals}})?$`,
    "u",
  );
  if (!amountPattern.test(normalized)) {
    throw new Error("Amount must be a positive decimal value.");
  }
  const [whole, fractional = ""] = normalized.split(".");
  const paddedFractional = fractional.padEnd(decimals, "0");
  const units = `${whole}${paddedFractional}`.replace(/^0+/u, "");
  return units || "0";
};

export const readSccpTronBridgeAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  return (
    readString(manifest, "tairaXorBridgeAddress") ||
    readString(manifest, "taira_xor_bridge_address") ||
    readString(manifest, "tronBridgeAddress") ||
    readString(manifest, "tron_bridge_address") ||
    readString(manifest, "bridgeAddress") ||
    readString(manifest, "bridge_address") ||
    readString(manifest, "bridge_contract_address") ||
    readString(manifest, "bridge_address_base58")
  );
};

export const readSccpTronTokenAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  return (
    readString(manifest, "tairaXorTokenAddress") ||
    readString(manifest, "taira_xor_token_address") ||
    readString(manifest, "tronTokenAddress") ||
    readString(manifest, "tron_token_address") ||
    readString(manifest, "tokenAddress") ||
    readString(manifest, "token_address") ||
    readString(manifest, "token_contract_address") ||
    readString(manifest, "token_address_base58")
  );
};

const readRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null => {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const readDestinationRollout = (
  manifest: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null =>
  manifest
    ? readRecord(manifest, "destinationRollout") ||
      readRecord(manifest, "destination_rollout")
    : null;

export const readSccpTronVerifierAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  const rollout = readDestinationRollout(manifest);
  return (
    readString(manifest, "tronVerifierAddress") ||
    readString(manifest, "tron_verifier_address") ||
    readString(manifest, "sccp_tron_destination_verifier_address") ||
    readString(rollout ?? {}, "verifierIdentity") ||
    readString(rollout ?? {}, "verifier_identity")
  );
};

export const readSccpTronProofMaterial = (
  manifest: Record<string, unknown> | null | undefined,
): TronSccpProofMaterial | null => {
  if (!manifest) {
    return null;
  }
  const rollout = readDestinationRollout(manifest);
  const material = {
    networkIdHex:
      readString(manifest, "networkIdHex") ||
      readString(manifest, "network_id_hex") ||
      readString(rollout ?? {}, "destinationNetworkId") ||
      readString(rollout ?? {}, "destination_network_id"),
    tronVerifierAddress: readSccpTronVerifierAddress(manifest),
    verifierCodeHashHex:
      readString(manifest, "verifierCodeHashHex") ||
      readString(manifest, "verifier_code_hash_hex") ||
      readString(rollout ?? {}, "verifierCodeHash") ||
      readString(rollout ?? {}, "verifier_code_hash"),
    verifierKeyHashHex:
      readString(manifest, "verifierKeyHashHex") ||
      readString(manifest, "verifier_key_hash_hex") ||
      readString(rollout ?? {}, "verifierKeyHash") ||
      readString(rollout ?? {}, "verifier_key_hash"),
    expectedDestinationBindingHashHex:
      readString(manifest, "expectedDestinationBindingHashHex") ||
      readString(manifest, "expected_destination_binding_hash_hex") ||
      readString(rollout ?? {}, "destinationBindingHash") ||
      readString(rollout ?? {}, "destination_binding_hash"),
  };
  return Object.values(material).every((value) => value.trim())
    ? material
    : null;
};

const readFirstString = (
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string => {
  if (!record) {
    return "";
  }
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return "";
};

const readFirstRecord = (
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): Record<string, unknown> | null => {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = readRecord(record, key);
    if (value) {
      return value;
    }
  }
  return null;
};

const readBurnRecordVkRef = (
  manifest: Record<string, unknown>,
  burnRecord: Record<string, unknown> | null,
): TairaXorBurnRecordMaterial["vkRef"] | null => {
  const vkRef =
    readFirstRecord(
      burnRecord,
      "vkRef",
      "vk_ref",
      "verifyingKeyRef",
      "verifying_key_ref",
    ) ??
    readFirstRecord(
      manifest,
      "tairaXorBurnRecordVkRef",
      "taira_xor_burn_record_vk_ref",
      "burnRecordVkRef",
      "burn_record_vk_ref",
    );
  if (!vkRef) {
    return null;
  }
  const backend = readFirstString(
    vkRef,
    "backend",
    "proofBackend",
    "proof_backend",
  );
  const name = readFirstString(vkRef, "name", "vkName", "vk_name");
  return backend && name ? { backend, name } : null;
};

export const readSccpTairaBurnRecordMaterial = (
  manifest: Record<string, unknown> | null | undefined,
): TairaXorBurnRecordMaterial | null => {
  if (!manifest) {
    return null;
  }
  const burnRecord = readFirstRecord(
    manifest,
    "tairaXorBurnRecord",
    "taira_xor_burn_record",
    "burnRecord",
    "burn_record",
    "sourceRecordContract",
    "source_record_contract",
  );
  const settlementAssetDefinitionId =
    readFirstString(
      burnRecord,
      "settlementAssetDefinitionId",
      "settlement_asset_definition_id",
      "settlementAsset",
      "settlement_asset",
    ) ||
    readFirstString(
      manifest,
      "settlementAssetDefinitionId",
      "settlement_asset_definition_id",
      "tairaXorSettlementAssetDefinitionId",
      "taira_xor_settlement_asset_definition_id",
      "tairaXorSettlementAsset",
      "taira_xor_settlement_asset",
    );
  const contractArtifactB64 =
    readFirstString(
      burnRecord,
      "contractArtifactB64",
      "contract_artifact_b64",
      "artifactB64",
      "artifact_b64",
      "bytecode",
    ) ||
    readFirstString(
      manifest,
      "tairaXorBurnRecordContractArtifactB64",
      "taira_xor_burn_record_contract_artifact_b64",
      "burnRecordContractArtifactB64",
      "burn_record_contract_artifact_b64",
    );
  const vkRef = readBurnRecordVkRef(manifest, burnRecord);
  if (!settlementAssetDefinitionId || !contractArtifactB64 || !vkRef) {
    return null;
  }
  const gasLimit =
    readNumber(burnRecord ?? manifest, "gasLimit") ??
    readNumber(burnRecord ?? manifest, "gas_limit") ??
    undefined;
  return {
    settlementAssetDefinitionId,
    contractArtifactB64,
    vkRef,
    gasLimit,
  };
};

export const buildTairaXorBurnTriggerRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  ownerAddress: string;
  tairaRecipient: string;
  amountDecimal: string;
  feeLimit?: number;
}): TronSmartContractTriggerRequest => {
  const ownerAddress = normalizeTronAddress(input.ownerAddress);
  const contractAddress = readSccpTronBridgeAddress(input.manifest);
  if (!contractAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  const amount = bridgeDecimalToBaseUnits(input.amountDecimal);
  if (amount === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  return {
    ownerAddress,
    contractAddress,
    functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
    callData: tairaXorBurnToTairaCallData({
      tairaRecipient: input.tairaRecipient.trim(),
      amount,
    }),
    feeLimit: input.feeLimit ?? SCCP_TRON_DEFAULT_FEE_LIMIT,
  };
};

export const buildTairaXorOutboundPreview = (input: {
  manifest: Record<string, unknown> | null | undefined;
  tairaSender: string;
  tronRecipient: string;
  amountDecimal: string;
  nonce: string | number | bigint;
}): TairaXorOutboundPreview => {
  const recipientAddress = normalizeTronAddress(input.tronRecipient);
  const bridgeAddress = readSccpTronBridgeAddress(input.manifest);
  if (!bridgeAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  const amount = bridgeDecimalToBaseUnits(input.amountDecimal);
  if (amount === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  const recordDescriptor = buildTairaXorSccpRecordDescriptor({
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    tairaSender: input.tairaSender.trim(),
    recipientAddress,
    amount,
    nonce: input.nonce,
  });
  const payload = recordDescriptor.payload as unknown as Record<
    string,
    unknown
  >;
  return {
    payload,
    canonicalPayloadHex: recordDescriptor.canonical_payload_hex,
    recordDescriptor,
    messageId: recordDescriptor.message_id,
    payloadHash: sccpPayloadHash(recordDescriptor.canonicalPayloadBytes),
    contractPayloadHash: tairaXorTransferPayloadHash({
      bridgeAddress,
      recipientAddress,
      amount,
    }),
    amountBaseUnits: amount,
  };
};

export const buildTairaXorOutboundBurnRecordRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  tairaSender: string;
  tronRecipient: string;
  amountDecimal: string;
  nonce: string | number | bigint;
  authority?: string;
}): TairaXorOutboundBurnRecordRequest => {
  const material = readSccpTairaBurnRecordMaterial(input.manifest);
  if (!material) {
    throw new Error("The TAIRA burn-record ZK contract material is missing.");
  }
  const outbound = buildTairaXorOutboundPreview(input);
  const authority = input.authority?.trim() || input.tairaSender.trim();
  const zkIvmRequest = buildTairaXorSccpBurnRecordZkIvmRequest({
    descriptor: outbound.recordDescriptor,
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    sender: input.tairaSender.trim(),
    recipientAddress: normalizeTronAddress(input.tronRecipient),
    amount: outbound.amountBaseUnits,
    nonce: input.nonce,
    settlementAssetDefinitionId: material.settlementAssetDefinitionId,
    authority,
    vkRef: material.vkRef,
    bytecode: material.contractArtifactB64,
    gasLimit: material.gasLimit,
  });
  return {
    outbound,
    material,
    zkIvmRequest,
  };
};

const normalizeHex32 = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const normalizeHexBytes = (
  value: string,
  byteLength: number,
  label: string,
): string => {
  const normalized = value.trim().toLowerCase();
  const hexLength = byteLength * 2;
  if (
    !normalized.startsWith("0x") ||
    normalized.length !== hexLength + 2 ||
    !/^[0-9a-f]+$/u.test(normalized.slice(2))
  ) {
    throw new Error(`${label} must be a ${byteLength}-byte hex value.`);
  }
  return normalized;
};

const normalizeTronTxId = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte TRON transaction id.`);
  }
  return normalized;
};

export const normalizeSccpMessageId = (value: string): string =>
  normalizeHex32(value, "messageId");

export const isValidSccpMessageId = (value: string): boolean => {
  try {
    normalizeSccpMessageId(value);
    return true;
  } catch (_error) {
    return false;
  }
};

export const normalizeTronTransactionId = (value: string): string =>
  normalizeTronTxId(value, "txId");

export const isValidTronTransactionId = (value: string): boolean => {
  try {
    normalizeTronTransactionId(value);
    return true;
  } catch (_error) {
    return false;
  }
};

const bytesToLowerHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${label} must be an object.`);
};

const readRecordVariant = (
  value: unknown,
  label: string,
): { kind: string; value: Record<string, unknown> } => {
  const record = requireRecord(value, label);
  if (typeof record.kind === "string") {
    return {
      kind: record.kind,
      value: requireRecord(record.value, `${label}.value`),
    };
  }
  const entries = Object.entries(record);
  if (entries.length !== 1) {
    throw new Error(`${label} must contain exactly one variant.`);
  }
  const [[kind, body]] = entries;
  return {
    kind,
    value: requireRecord(body, `${label}.${kind}`),
  };
};

const readScalarText = (
  record: Record<string, unknown>,
  key: string,
): string => {
  const value = record[key];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${key} must be a safe non-negative integer.`);
    }
    return String(value);
  }
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${key} must be a non-negative integer.`);
    }
    return value.toString();
  }
  return "";
};

const readCodecText = (value: unknown, label: string): string => {
  const record = requireRecord(value, label);
  const variant =
    typeof record.kind === "string"
      ? { kind: record.kind, value: record.value }
      : (() => {
          const entries = Object.entries(record);
          if (entries.length !== 1) {
            throw new Error(`${label} must contain exactly one codec variant.`);
          }
          const [[kind, body]] = entries;
          return { kind, value: requireRecord(body, `${label}.${kind}`).value };
        })();
  if (variant.kind !== "TextUtf8") {
    throw new Error(`${label} must be a TextUtf8 SCCP codec value.`);
  }
  const text = readScalarText({ value: variant.value }, "value");
  if (!text) {
    throw new Error(`${label} must not be empty.`);
  }
  return text;
};

const readCodecTronPayload = (value: unknown, label: string): string => {
  const record = requireRecord(value, label);
  const variant =
    typeof record.kind === "string"
      ? { kind: record.kind, value: record.payload }
      : (() => {
          const entries = Object.entries(record);
          if (entries.length !== 1) {
            throw new Error(`${label} must contain exactly one codec variant.`);
          }
          const [[kind, body]] = entries;
          return {
            kind,
            value: requireRecord(body, `${label}.${kind}`).payload,
          };
        })();
  if (variant.kind !== "TronBase58Check") {
    throw new Error(`${label} must be a TronBase58Check SCCP codec value.`);
  }
  return normalizeHexBytes(
    readScalarText({ payload: variant.value }, "payload"),
    21,
    label,
  );
};

const readTransferProjection = (
  job: Record<string, unknown>,
): Record<string, unknown> => {
  const projection =
    readRecord(job, "payloadProjection") ??
    readRecord(job, "payload_projection");
  const variant = readRecordVariant(projection, "SCCP payload projection");
  if (variant.kind !== "Transfer") {
    throw new Error("SCCP proof job must carry a Transfer payload.");
  }
  return variant.value;
};

const readBundleTransferPayload = (
  bundle: Record<string, unknown>,
): Record<string, unknown> => {
  const payload = readRecordVariant(
    bundle.payload,
    "SCCP message bundle payload",
  );
  if (payload.kind !== "Transfer") {
    throw new Error("SCCP message bundle must carry a Transfer payload.");
  }
  return payload.value;
};

const compareOptionalScalar = (
  record: Record<string, unknown>,
  key: string,
  expected: string | number,
  label: string,
): void => {
  const value = record[key];
  if (value === undefined || value === null) {
    return;
  }
  const actual = readScalarText(record, key);
  if (actual !== String(expected)) {
    throw new Error(`${label} must match the selected TAIRA/TRON route.`);
  }
};

const compareOptionalText = (
  record: Record<string, unknown>,
  key: string,
  expected: string,
  label: string,
): void => {
  const value = record[key];
  if (value === undefined || value === null) {
    return;
  }
  const actual = readScalarText(record, key);
  if (actual !== expected) {
    throw new Error(`${label} must match the selected TAIRA/TRON route.`);
  }
};

const readDestinationBindingInput = (
  manifest: Record<string, unknown>,
): TronSccpDestinationBindingInput => {
  const proofMaterial = readSccpTronProofMaterial(manifest);
  if (!proofMaterial) {
    throw new Error(
      "The TRON SCCP verifier rollout proof material is incomplete.",
    );
  }
  const manifestBinding =
    readRecord(manifest, "destinationBinding") ??
    readRecord(manifest, "destination_binding");
  const rollout = readDestinationRollout(manifest);
  const key =
    readFirstString(manifestBinding, "key", "bindingKey", "binding_key") ||
    readFirstString(
      rollout,
      "destinationBindingKey",
      "destination_binding_key",
    );
  if (!key) {
    throw new Error("The TRON SCCP destination binding key is missing.");
  }
  const version =
    readNumber(manifestBinding ?? {}, "version") ??
    readNumber(rollout ?? {}, "version") ??
    1;
  if (version !== 1) {
    throw new Error("The TRON SCCP destination binding version must be 1.");
  }
  return {
    version: 1,
    key,
    sourceDomain: SCCP_SORA_DOMAIN,
    targetDomain: SCCP_TRON_DOMAIN,
    networkId: proofMaterial.networkIdHex,
    verifierAddress: proofMaterial.tronVerifierAddress,
    verifierCodeHash: proofMaterial.verifierCodeHashHex,
    verifierKeyHash: proofMaterial.verifierKeyHashHex,
    bindingHash: proofMaterial.expectedDestinationBindingHashHex,
  };
};

export const buildTairaXorFinalizeProofBinding = (input: {
  manifest: Record<string, unknown> | null | undefined;
  job: Record<string, unknown>;
  messageId: string;
  tairaSender: string;
  tronRecipient: string;
  amountDecimal: string;
}): TairaXorFinalizeFromTairaProofBinding => {
  const manifest = requireRecord(input.manifest, "SCCP TRON manifest");
  const job = requireRecord(input.job, "SCCP proof job");
  const expectedMessageId = normalizeHex32(input.messageId, "messageId");
  const amountBaseUnits = bridgeDecimalToBaseUnits(input.amountDecimal);
  const expectedRecipientPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.tronRecipient),
  );
  const destinationBinding = readDestinationBindingInput(manifest);
  const publicInputs = requireRecord(job.publicInputs, "SCCP job publicInputs");
  const publicInputMessageId = normalizeHex32(
    readFirstString(publicInputs, "messageId", "message_id"),
    "publicInputs.messageId",
  );
  if (publicInputMessageId !== expectedMessageId) {
    throw new Error(
      "SCCP proof job message id does not match this bridge request.",
    );
  }
  if (
    Number(publicInputs.targetDomain ?? publicInputs.target_domain) !==
    SCCP_TRON_DOMAIN
  ) {
    throw new Error("SCCP proof job must target TRON.");
  }

  const bundle = requireRecord(job.bundle, "SCCP proof job bundle");
  const commitment = requireRecord(
    bundle.commitment,
    "SCCP message commitment",
  );
  const commitmentMessageId = normalizeHex32(
    readFirstString(commitment, "messageId", "message_id"),
    "bundle.commitment.messageId",
  );
  if (commitmentMessageId !== expectedMessageId) {
    throw new Error("SCCP message bundle does not match this bridge request.");
  }
  const payloadHash = normalizeHex32(
    readFirstString(publicInputs, "payloadHash", "payload_hash"),
    "publicInputs.payloadHash",
  );
  const commitmentPayloadHash = normalizeHex32(
    readFirstString(commitment, "payloadHash", "payload_hash"),
    "bundle.commitment.payloadHash",
  );
  if (payloadHash !== commitmentPayloadHash) {
    throw new Error(
      "SCCP message bundle payload hash does not match public inputs.",
    );
  }

  const transfer = readTransferProjection(job);
  compareOptionalScalar(
    transfer,
    "source_domain",
    SCCP_SORA_DOMAIN,
    "Source domain",
  );
  compareOptionalScalar(
    transfer,
    "dest_domain",
    SCCP_TRON_DOMAIN,
    "Destination domain",
  );
  compareOptionalScalar(
    transfer,
    "asset_home_domain",
    SCCP_SORA_DOMAIN,
    "Asset home domain",
  );
  if (
    readCodecText(transfer.asset_id, "payload.asset_id") !== SCCP_XOR_ASSET_KEY
  ) {
    throw new Error("SCCP proof job asset key must be XOR.");
  }
  if (
    readCodecText(transfer.route_id, "payload.route_id") !== SCCP_XOR_ROUTE_ID
  ) {
    throw new Error("SCCP proof job route id must be taira_tron_xor.");
  }
  if (readScalarText(transfer, "amount") !== amountBaseUnits) {
    throw new Error(
      "SCCP proof job amount does not match this bridge request.",
    );
  }
  if (
    readCodecText(transfer.sender, "payload.sender") !==
    input.tairaSender.trim()
  ) {
    throw new Error(
      "SCCP proof job sender does not match the active TAIRA account.",
    );
  }
  if (
    readCodecTronPayload(transfer.recipient, "payload.recipient") !==
    expectedRecipientPayload
  ) {
    throw new Error(
      "SCCP proof job recipient does not match this bridge request.",
    );
  }

  const bundleTransfer = readBundleTransferPayload(bundle);
  compareOptionalScalar(
    bundleTransfer,
    "source_domain",
    SCCP_SORA_DOMAIN,
    "Bundle source domain",
  );
  compareOptionalScalar(
    bundleTransfer,
    "dest_domain",
    SCCP_TRON_DOMAIN,
    "Bundle destination domain",
  );
  compareOptionalText(
    bundleTransfer,
    "asset_id",
    SCCP_XOR_ASSET_KEY,
    "Bundle asset key",
  );
  compareOptionalText(
    bundleTransfer,
    "route_id",
    SCCP_XOR_ROUTE_ID,
    "Bundle route id",
  );
  compareOptionalText(
    bundleTransfer,
    "amount",
    amountBaseUnits,
    "Bundle amount",
  );
  compareOptionalText(
    bundleTransfer,
    "sender",
    input.tairaSender.trim(),
    "Bundle sender",
  );
  compareOptionalText(
    bundleTransfer,
    "recipient",
    input.tronRecipient.trim(),
    "Bundle recipient",
  );

  const jobDestinationBinding =
    readRecord(job, "destinationBinding") ??
    readRecord(job, "destination_binding");
  const jobBindingHash = readFirstString(
    jobDestinationBinding,
    "bindingHash",
    "binding_hash",
  );
  if (
    jobBindingHash &&
    normalizeHex32(jobBindingHash, "job.destinationBinding.bindingHash") !==
      destinationBinding.bindingHash
  ) {
    throw new Error(
      "SCCP proof job destination binding does not match the TRON route manifest.",
    );
  }

  return {
    witness: {
      publicInputs,
      bundleBytes: canonicalSccpMessageProofBundleBytes(bundle),
      sourceProofBytes: [],
      sourceDomain: SCCP_SORA_DOMAIN,
      destinationBinding,
    },
    destinationBinding,
    messageBundle: bundle,
    amountBaseUnits,
    messageId: expectedMessageId,
    payloadHash,
  };
};

export const buildTairaXorFinalizeTriggerRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofPackage: Record<string, unknown>;
  ownerAddress: string;
  tronRecipient: string;
  amountBaseUnits: string;
  messageId?: string;
  feeLimit?: number;
}): TairaXorFinalizeTriggerRequest => {
  const manifest = requireRecord(input.manifest, "SCCP TRON manifest");
  const contractAddress = readSccpTronBridgeAddress(manifest);
  if (!contractAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  const proofPackage = requireRecord(
    input.proofPackage,
    "TRON SCCP proof package",
  );
  const submission = requireRecord(
    proofPackage.submission,
    "TRON SCCP proof package submission",
  );
  const platformValue =
    readRecord(readRecord(submission, "platformPayload") ?? {}, "value") ??
    readRecord(readRecord(submission, "platform_payload") ?? {}, "value");
  const proofBytes =
    readFirstString(submission, "proofBytes", "proof_bytes") ||
    readFirstString(platformValue, "proofBytes", "proof_bytes");
  if (!proofBytes) {
    throw new Error("TRON SCCP proof package is missing proof bytes.");
  }
  const publicInputs =
    readRecord(submission, "publicInputs") ??
    readRecord(submission, "public_inputs") ??
    readRecord(platformValue ?? {}, "publicInputs") ??
    readRecord(platformValue ?? {}, "public_inputs");
  if (!publicInputs) {
    throw new Error("TRON SCCP proof package is missing public inputs.");
  }
  const messageId = normalizeHex32(
    readFirstString(publicInputs, "messageId", "message_id"),
    "proofPackage.publicInputs.messageId",
  );
  if (
    input.messageId &&
    messageId !== normalizeHex32(input.messageId, "messageId")
  ) {
    throw new Error(
      "TRON SCCP proof package message id does not match this bridge request.",
    );
  }
  const statementHash =
    readFirstString(submission, "statementHash", "statement_hash") ||
    readFirstString(platformValue, "statementHash", "statement_hash");
  if (!statementHash) {
    throw new Error("TRON SCCP proof package is missing the statement hash.");
  }
  const amount = readScalarText({ amount: input.amountBaseUnits }, "amount");
  const callData = tairaXorFinalizeFromTairaCallData({
    proofBytes,
    publicInputs,
    statementHash,
    recipientAddress: normalizeTronAddress(input.tronRecipient),
    amount,
  });
  return {
    trigger: {
      ownerAddress: normalizeTronAddress(input.ownerAddress),
      contractAddress,
      functionSelector: TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
      callData,
      feeLimit: input.feeLimit ?? SCCP_TRON_DEFAULT_FEE_LIMIT,
    },
    amountBaseUnits: amount,
    messageId,
  };
};

const readCodecTextOrDirect = (value: unknown, label: string): string => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return readCodecText(value, label);
  }
  const text = readScalarText({ value }, "value");
  if (!text) {
    throw new Error(`${label} must not be empty.`);
  }
  return text;
};

const readCodecTronPayloadOrDirect = (
  value: unknown,
  label: string,
): string => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return readCodecTronPayload(value, label);
  }
  return bytesToLowerHex(decodeTronBase58CheckAddress(String(value ?? "")));
};

const requireTransferScalar = (
  transfer: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = readScalarText(transfer, key);
  if (!value) {
    throw new Error(`${label} is missing from the SCCP transfer payload.`);
  }
  return value;
};

const requireTransferScalarEquals = (
  transfer: Record<string, unknown>,
  key: string,
  expected: string | number,
  label: string,
): void => {
  if (requireTransferScalar(transfer, key, label) !== String(expected)) {
    throw new Error(`${label} must match the selected TRON/TAIRA route.`);
  }
};

const readBundleCommitment = (
  bundle: Record<string, unknown>,
): Record<string, unknown> =>
  requireRecord(bundle.commitment, "SCCP message bundle commitment");

export const buildTairaXorInboundSettlement = (input: {
  manifest: Record<string, unknown> | null | undefined;
  gasLimit?: number;
}): Record<string, unknown> => {
  const manifest = input.manifest
    ? requireRecord(input.manifest, "SCCP TRON manifest")
    : {};
  const settlement =
    readFirstRecord(manifest, "settlement", "tairaSettlement") ?? {};
  const contractAddress = readFirstString(
    settlement,
    "contractAddress",
    "contract_address",
  );
  const contractAlias = readFirstString(
    settlement,
    "contractAlias",
    "contract_alias",
  );
  return {
    entrypoint: "finalize_inbound",
    route: SCCP_XOR_ROUTE_ID,
    ...(contractAddress ? { contract_address: contractAddress } : {}),
    ...(contractAlias ? { contract_alias: contractAlias } : {}),
    ...(input.gasLimit ? { gas_limit: input.gasLimit } : {}),
  };
};

export const bindTronToTairaSourceProofPackage = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofPackage: unknown;
  txId: string;
  tronSender: string;
  tairaRecipient: string;
  amountDecimal: string;
}): TronToTairaSourceProofPackage => {
  const packageRecord = requireRecord(
    input.proofPackage,
    "TRON -> TAIRA source proof package",
  );
  const messageBundle = requireRecord(
    packageRecord.messageBundle ?? packageRecord.message_bundle,
    "TRON -> TAIRA source proof package messageBundle",
  );
  const settlement = requireRecord(
    packageRecord.settlement ?? buildTairaXorInboundSettlement(input),
    "TRON -> TAIRA source proof package settlement",
  );
  const txId = normalizeTronTxId(input.txId, "txId");
  const packageTxId = readFirstString(
    packageRecord,
    "txId",
    "txID",
    "transactionId",
    "transaction_id",
  );
  if (!packageTxId) {
    throw new Error("TRON -> TAIRA source proof package tx id is missing.");
  }
  if (normalizeTronTxId(packageTxId, "proofPackage.txId") !== txId) {
    throw new Error(
      "TRON -> TAIRA source proof package tx id does not match this bridge request.",
    );
  }
  const commitment = readBundleCommitment(messageBundle);
  const commitmentMessageId = normalizeHex32(
    readFirstString(commitment, "messageId", "message_id"),
    "messageBundle.commitment.messageId",
  );
  const commitmentPayloadHash = normalizeHex32(
    readFirstString(commitment, "payloadHash", "payload_hash"),
    "messageBundle.commitment.payloadHash",
  );
  const commitmentTargetDomain = Number(
    commitment.targetDomain ?? commitment.target_domain,
  );
  if (commitmentTargetDomain !== SCCP_SORA_DOMAIN) {
    throw new Error("TRON -> TAIRA message bundles must target TAIRA/SORA.");
  }
  const transfer = readBundleTransferPayload(messageBundle);
  requireTransferScalarEquals(transfer, "version", 1, "Transfer version");
  requireTransferScalarEquals(
    transfer,
    "source_domain",
    SCCP_TRON_DOMAIN,
    "Transfer source domain",
  );
  requireTransferScalarEquals(
    transfer,
    "dest_domain",
    SCCP_SORA_DOMAIN,
    "Transfer destination domain",
  );
  requireTransferScalarEquals(
    transfer,
    "asset_home_domain",
    SCCP_SORA_DOMAIN,
    "Transfer asset home domain",
  );

  const amountBaseUnits = bridgeDecimalToBaseUnits(input.amountDecimal);
  if (
    requireTransferScalar(transfer, "amount", "Transfer amount") !==
    amountBaseUnits
  ) {
    throw new Error(
      "TRON -> TAIRA source proof amount does not match this bridge request.",
    );
  }
  const senderPayload = readCodecTronPayloadOrDirect(
    transfer.sender,
    "payload.sender",
  );
  const expectedSenderPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.tronSender),
  );
  if (senderPayload !== expectedSenderPayload) {
    throw new Error(
      "TRON -> TAIRA source proof sender does not match the connected wallet.",
    );
  }
  const recipient = readCodecTextOrDirect(
    transfer.recipient,
    "payload.recipient",
  );
  if (recipient !== input.tairaRecipient.trim()) {
    throw new Error(
      "TRON -> TAIRA source proof recipient does not match this bridge request.",
    );
  }
  if (
    readCodecTextOrDirect(transfer.asset_id, "payload.asset_id") !==
    SCCP_XOR_ASSET_KEY
  ) {
    throw new Error("TRON -> TAIRA source proof asset key must be XOR.");
  }
  if (
    readCodecTextOrDirect(transfer.route_id, "payload.route_id") !==
    SCCP_XOR_ROUTE_ID
  ) {
    throw new Error(
      "TRON -> TAIRA source proof route id must be taira_tron_xor.",
    );
  }

  const payloadForHash: SccpTransferPayload = {
    version: 1,
    source_domain: SCCP_TRON_DOMAIN,
    dest_domain: SCCP_SORA_DOMAIN,
    nonce: requireTransferScalar(transfer, "nonce", "Transfer nonce"),
    asset_home_domain: SCCP_SORA_DOMAIN,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: SCCP_XOR_ASSET_KEY,
    amount: amountBaseUnits,
    sender_codec: SCCP_CODEC_TRON_BASE58CHECK,
    sender: normalizeTronAddress(input.tronSender),
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient: input.tairaRecipient.trim(),
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: SCCP_XOR_ROUTE_ID,
  };
  const expectedPayloadHash = sccpPayloadHash(
    canonicalSccpTransferPayloadBytes(payloadForHash),
  );
  if (commitmentPayloadHash !== expectedPayloadHash) {
    throw new Error(
      "TRON -> TAIRA source proof payload hash does not match this bridge request.",
    );
  }
  const expectedMessageId = sccpTransferMessageId(payloadForHash);
  if (commitmentMessageId !== expectedMessageId) {
    throw new Error(
      "TRON -> TAIRA source proof message id does not match this bridge request.",
    );
  }
  const bundleCommitmentRoot = normalizeHex32(
    readFirstString(messageBundle, "commitmentRoot", "commitment_root"),
    "messageBundle.commitmentRoot",
  );
  if (
    packageRecord.messageId !== undefined &&
    normalizeHex32(
      String(packageRecord.messageId),
      "proofPackage.messageId",
    ) !== commitmentMessageId
  ) {
    throw new Error(
      "TRON -> TAIRA source proof package message id does not match the bundle.",
    );
  }
  if (
    packageRecord.commitmentRoot !== undefined &&
    normalizeHex32(
      String(packageRecord.commitmentRoot),
      "proofPackage.commitmentRoot",
    ) !== bundleCommitmentRoot
  ) {
    throw new Error(
      "TRON -> TAIRA source proof package commitment root does not match the bundle.",
    );
  }
  const sourceEventDigest = normalizeHex32(
    readFirstString(packageRecord, "sourceEventDigest", "source_event_digest"),
    "proofPackage.sourceEventDigest",
  );
  if (
    readFirstString(settlement, "entrypoint") &&
    readFirstString(settlement, "entrypoint") !== "finalize_inbound"
  ) {
    throw new Error(
      "TRON -> TAIRA settlement entrypoint must be finalize_inbound.",
    );
  }
  if (
    readFirstString(settlement, "route", "route_id") &&
    readFirstString(settlement, "route", "route_id") !== SCCP_XOR_ROUTE_ID
  ) {
    throw new Error("TRON -> TAIRA settlement route must be taira_tron_xor.");
  }
  if (
    settlement.payload !== undefined ||
    settlement.payload_json !== undefined ||
    settlement.payloadJson !== undefined
  ) {
    throw new Error(
      "TRON -> TAIRA settlement payload must be generated by Torii.",
    );
  }
  canonicalSccpMessageProofBundleBytes(messageBundle);
  return {
    messageBundle,
    settlement: {
      ...buildTairaXorInboundSettlement(input),
      ...settlement,
      entrypoint: "finalize_inbound",
      route: SCCP_XOR_ROUTE_ID,
    },
    sourceEventDigest,
    txId,
    messageId: commitmentMessageId,
    amountBaseUnits,
  };
};

const readString = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === "string" ? record[key].trim() : "";

const readNumber = (
  record: Record<string, unknown>,
  key: string,
): number | null => {
  const value = record[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const listRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];

const manifestTargetsTron = (manifest: Record<string, unknown>): boolean => {
  const counterpartyDomain = readNumber(manifest, "counterpartyDomain");
  const verifierTarget = readString(manifest, "verifierTarget");
  const chain = readString(manifest, "chain").toLowerCase();
  return (
    counterpartyDomain === SCCP_TRON_DOMAIN ||
    verifierTarget === "TronContract" ||
    chain.includes("tron")
  );
};

const manifestMatchesRoute = (manifest: Record<string, unknown>): boolean => {
  const routeId =
    readString(manifest, "routeId") ||
    readString(manifest, "route_id") ||
    readString(manifest, "id");
  const assetKey =
    readString(manifest, "assetKey") || readString(manifest, "asset_key");
  return (
    (!routeId || routeId === SCCP_XOR_ROUTE_ID) &&
    (!assetKey || assetKey === SCCP_XOR_ASSET_KEY)
  );
};

export const pickTronSccpManifest = (
  manifestSet: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null =>
  listRecords(manifestSet?.manifests).find(
    (manifest) =>
      manifestTargetsTron(manifest) && manifestMatchesRoute(manifest),
  ) ?? null;

const hasAnyTronManifest = (
  manifestSet: Record<string, unknown> | null | undefined,
): boolean => listRecords(manifestSet?.manifests).some(manifestTargetsTron);

export const resolveSccpRouteReadiness = (input: {
  connection: SccpNetworkSnapshot;
  capabilities?: Record<string, unknown> | null;
  manifestSet?: Record<string, unknown> | null;
}): SccpRouteReadiness => {
  const reasons: string[] = [];
  if (!isTairaSccpNetwork(input.connection)) {
    reasons.push("Switch to the TAIRA testnet profile.");
  }

  const capabilities = input.capabilities;
  const proofSubmitPath =
    capabilities && typeof capabilities.proofSubmitPath === "string"
      ? capabilities.proofSubmitPath
      : capabilities && typeof capabilities.proof_submit_path === "string"
        ? capabilities.proof_submit_path
        : "";
  const messageSubmitPath =
    capabilities && typeof capabilities.messageSubmitPath === "string"
      ? capabilities.messageSubmitPath
      : capabilities && typeof capabilities.message_submit_path === "string"
        ? capabilities.message_submit_path
        : "";
  if (!capabilities) {
    reasons.push("SCCP capabilities have not been loaded.");
  } else if (!proofSubmitPath || !messageSubmitPath) {
    reasons.push("This Torii endpoint is missing SCCP submit endpoints.");
  }

  const tronManifest = pickTronSccpManifest(input.manifestSet);
  if (!input.manifestSet) {
    reasons.push("SCCP proof manifests have not been loaded.");
  } else if (!tronManifest) {
    reasons.push(
      hasAnyTronManifest(input.manifestSet)
        ? `No ${SCCP_XOR_ROUTE_ID} TRON SCCP manifest is advertised by this endpoint.`
        : "No TRON SCCP manifest is advertised by this endpoint.",
    );
  } else {
    const productionReady =
      tronManifest.productionReady === undefined
        ? Boolean(tronManifest.production_ready)
        : Boolean(tronManifest.productionReady);
    const disabledReason =
      readString(tronManifest, "disabledReason") ||
      readString(tronManifest, "disabled_reason");
    if (!productionReady) {
      reasons.push(
        disabledReason || "The TRON SCCP route is not production-ready.",
      );
    }
    if (!readSccpTronBridgeAddress(tronManifest)) {
      reasons.push("The TRON bridge deployment address is missing.");
    }
    if (!readSccpTronTokenAddress(tronManifest)) {
      reasons.push("The TairaXOR token deployment address is missing.");
    }
    if (
      readDestinationRollout(tronManifest) &&
      !readSccpTronProofMaterial(tronManifest)
    ) {
      reasons.push(
        "The TRON SCCP verifier rollout proof material is incomplete.",
      );
    }
    if (!readSccpTairaBurnRecordMaterial(tronManifest)) {
      reasons.push("The TAIRA burn-record ZK contract material is missing.");
    }
  }

  return {
    ready: reasons.length === 0,
    status:
      reasons.length === 0
        ? "ready"
        : tronManifest && capabilities
          ? "disabled"
          : capabilities || input.manifestSet
            ? "incomplete"
            : "unavailable",
    reasons,
    tronManifest,
  };
};

export const walletConnectSessionFromAddress = (
  address: string,
  topic: string | null = null,
): WalletConnectSessionSnapshot => ({
  topic,
  address: normalizeTronAddress(address),
  chainId: TRON_MAINNET_CAIP_CHAIN_ID,
  namespace: WALLETCONNECT_TRON_NAMESPACE,
  methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
  connectedAtMs: Date.now(),
});

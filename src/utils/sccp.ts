import { sha256 } from "@noble/hashes/sha256";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  buildTairaXorSccpRecordDescriptor,
  buildTairaXorSccpBurnRecordZkIvmRequest,
  canonicalSccpTransferPayloadBytes,
  canonicalSccpMessageProofBundleBytes,
  sccpPayloadHash,
  tronSccpDestinationBinding,
  SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1,
  SCCP_TAIRA_XOR_ASSET_KEY_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  bindTairaXorTronToTairaSourceProofPackage,
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

export type TronConstantContractTriggerRequest = {
  ownerAddress: string;
  contractAddress: string;
  functionSelector: string;
  parameter: string;
};

export type BoundTronSignedTransaction = {
  transaction: Record<string, unknown>;
  txId: string;
};

export type BoundTronBroadcastResult = {
  response: Record<string, unknown>;
  txId: string;
};

export type BoundTronFinalitySnapshot = {
  finality: Record<string, unknown>;
  solidBlockNumber: number;
  solidBlockHash: string;
  witnessCount: number;
  collectedAtMs?: number;
};

export type BoundTronSourceData = {
  txId: string;
  transaction: Record<string, unknown>;
  receipt: Record<string, unknown>;
  events: Record<string, unknown>;
  finality: Record<string, unknown>;
  sourceEventDigest: string;
  receiptBlockNumber: number;
  solidBlockNumber: number;
  solidBlockHash: string;
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
  canonicalPayloadHex: string;
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

export const normalizeTairaAccountId = (accountId: string): string => {
  const normalized = accountId.trim();
  try {
    if (normalized !== accountId) {
      throw new Error("TAIRA account must use canonical text form.");
    }
    const address = AccountAddress.fromAccountId(
      normalized,
      TAIRA_NETWORK_PREFIX,
    );
    const canonical = address.toI105(TAIRA_NETWORK_PREFIX);
    if (canonical !== normalized) {
      throw new Error("TAIRA account must use canonical I105 account form.");
    }
    return normalized;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `TAIRA account must be a canonical TAIRA I105 account id: ${error.message}`
        : "TAIRA account must be a canonical TAIRA I105 account id.",
    );
  }
};

export const isLikelyTairaAccount = (accountId: string): boolean => {
  try {
    normalizeTairaAccountId(accountId);
    return true;
  } catch (_error) {
    return false;
  }
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

export const normalizeTronNetworkIdHex = (networkId: string): string => {
  const normalized = networkId.trim().toLowerCase();
  if (normalized === TRON_MAINNET_CHAIN_ID_HEX) {
    return TRON_MAINNET_NETWORK_ID_HEX;
  }
  if (normalized !== TRON_MAINNET_NETWORK_ID_HEX) {
    throw new Error("TRON SCCP routes must target TRON mainnet.");
  }
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

export const formatBaseUnitAmount = (
  value: string | number | bigint,
  decimals = SCCP_XOR_DECIMALS,
): string => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("Decimal precision is unsupported.");
  }
  const normalized = String(value).trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(normalized)) {
    throw new Error("Base-unit amount must be a non-negative integer.");
  }
  if (decimals === 0) {
    return normalized;
  }
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+/u, "") || "0";
  const fractional = padded.slice(-decimals).replace(/0+$/u, "");
  return fractional ? `${whole}.${fractional}` : whole;
};

export const formatTronSunBalance = (value: string | number | bigint): string =>
  formatBaseUnitAmount(value, 6);

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

const tronAddressAbiParameter = (address: string): string => {
  const payload = decodeTronBase58CheckAddress(address);
  const solidityAddress = Array.from(payload.slice(1), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${"0".repeat(24)}${solidityAddress}`;
};

export const buildTairaXorTokenBalanceRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  ownerAddress: string;
}): TronConstantContractTriggerRequest => {
  const ownerAddress = normalizeTronAddress(input.ownerAddress);
  const tokenAddress = readSccpTronTokenAddress(input.manifest);
  if (!tokenAddress) {
    throw new Error("The TRON token deployment address is missing.");
  }
  return {
    ownerAddress,
    contractAddress: normalizeTronAddress(tokenAddress),
    functionSelector: "balanceOf(address)",
    parameter: tronAddressAbiParameter(ownerAddress),
  };
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

export const readTronAccountBalanceSun = (
  account: Record<string, unknown>,
): string => {
  const balance = account.balance;
  if (
    (typeof balance !== "string" && typeof balance !== "number") ||
    !/^(?:0|[1-9]\d*)$/u.test(String(balance))
  ) {
    return "0";
  }
  return String(balance);
};

export const readTronConstantUint256 = (
  response: Record<string, unknown>,
  label = "TRON constant-contract response",
): string => {
  const result = readRecord(response, "result");
  if (result && result.result !== true) {
    const message = readString(result, "message") || readString(result, "code");
    throw new Error(
      message ? `${label} was rejected: ${message}.` : `${label} was rejected.`,
    );
  }
  const values = response.constant_result;
  if (!Array.isArray(values) || typeof values[0] !== "string") {
    throw new Error(`${label} is missing a uint256 result.`);
  }
  const hex = values[0].trim().toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(hex)) {
    throw new Error(`${label} returned a malformed uint256 result.`);
  }
  return BigInt(`0x${hex}`).toString(10);
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
  const networkId =
    readString(manifest, "networkIdHex") ||
    readString(manifest, "network_id_hex") ||
    readString(rollout ?? {}, "destinationNetworkId") ||
    readString(rollout ?? {}, "destination_network_id");
  const verifierCodeHash =
    readString(manifest, "verifierCodeHashHex") ||
    readString(manifest, "verifier_code_hash_hex") ||
    readString(rollout ?? {}, "verifierCodeHash") ||
    readString(rollout ?? {}, "verifier_code_hash");
  const verifierKeyHash =
    readString(manifest, "verifierKeyHashHex") ||
    readString(manifest, "verifier_key_hash_hex") ||
    readString(rollout ?? {}, "verifierKeyHash") ||
    readString(rollout ?? {}, "verifier_key_hash");
  const destinationBindingHash =
    readString(manifest, "expectedDestinationBindingHashHex") ||
    readString(manifest, "expected_destination_binding_hash_hex") ||
    readString(rollout ?? {}, "destinationBindingHash") ||
    readString(rollout ?? {}, "destination_binding_hash");
  try {
    return {
      networkIdHex: normalizeTronNetworkIdHex(networkId),
      tronVerifierAddress: normalizeTronAddress(
        readSccpTronVerifierAddress(manifest),
      ),
      verifierCodeHashHex: normalizeHex32(
        verifierCodeHash,
        "TRON verifier code hash",
      ),
      verifierKeyHashHex: normalizeHex32(
        verifierKeyHash,
        "TRON verifier key hash",
      ),
      expectedDestinationBindingHashHex: normalizeHex32(
        destinationBindingHash,
        "TRON destination binding hash",
      ),
    };
  } catch (_error) {
    return null;
  }
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
  if (
    gasLimit !== undefined &&
    (!Number.isSafeInteger(gasLimit) || gasLimit <= 0)
  ) {
    return null;
  }
  return {
    settlementAssetDefinitionId,
    contractArtifactB64,
    vkRef,
    gasLimit,
  };
};

const normalizeTronFeeLimit = (
  value: number | undefined,
  label = "TRON fee limit",
): number => {
  if (value === undefined) {
    return SCCP_TRON_DEFAULT_FEE_LIMIT;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
};

export const buildTairaXorBurnTriggerRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  ownerAddress: string;
  tairaRecipient: string;
  amountDecimal: string;
  feeLimit?: number;
}): TronSmartContractTriggerRequest => {
  const ownerAddress = normalizeTronAddress(input.ownerAddress);
  const tairaRecipient = normalizeTairaAccountId(input.tairaRecipient);
  const contractAddress = readSccpTronBridgeAddress(input.manifest);
  if (!contractAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  const normalizedContractAddress = normalizeTronAddress(contractAddress);
  const amount = bridgeDecimalToBaseUnits(input.amountDecimal);
  if (amount === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  return {
    ownerAddress,
    contractAddress: normalizedContractAddress,
    functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
    callData: tairaXorBurnToTairaCallData({
      tairaRecipient,
      amount,
    }),
    feeLimit: normalizeTronFeeLimit(input.feeLimit),
  };
};

export const buildTairaXorOutboundPreview = (input: {
  manifest: Record<string, unknown> | null | undefined;
  tairaSender: string;
  tronRecipient: string;
  amountDecimal: string;
  nonce: string | number | bigint;
}): TairaXorOutboundPreview => {
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const recipientAddress = normalizeTronAddress(input.tronRecipient);
  const bridgeAddress = readSccpTronBridgeAddress(input.manifest);
  if (!bridgeAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  normalizeTronAddress(bridgeAddress);
  const amount = bridgeDecimalToBaseUnits(input.amountDecimal);
  if (amount === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  const recordDescriptor = buildTairaXorSccpRecordDescriptor({
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    tairaSender,
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
      tairaSender,
      recipientAddress,
      amount,
      nonce: input.nonce,
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
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const authority = input.authority
    ? normalizeTairaAccountId(input.authority)
    : tairaSender;
  const zkIvmRequest = buildTairaXorSccpBurnRecordZkIvmRequest({
    descriptor: outbound.recordDescriptor,
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    sender: tairaSender,
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

const normalizeNonZeroHex32Loose = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  if (/^0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return `0x${normalized}`;
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

const normalizeHexData = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    /[^0-9a-f]/u.test(normalized)
  ) {
    throw new Error(`${label} must be hex-encoded bytes.`);
  }
  return `0x${normalized}`;
};

const hexDataToBytes = (value: string, label: string): Uint8Array => {
  const normalized = normalizeHexData(value, label).slice(2);
  return Uint8Array.from(
    normalized.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
};

const normalizeTronTxId = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte TRON transaction id.`);
  }
  return normalized;
};

const normalizeTronAddressPayloadHex = (
  value: string,
  label: string,
): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (!/^41[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a 21-byte TRON mainnet address payload.`);
  }
  if (/^410{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a non-zero TRON address payload.`);
  }
  return `0x${normalized}`;
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

const readTronTransactionIdFromRecord = (
  transaction: Record<string, unknown>,
  label: string,
): string =>
  normalizeTronTxId(
    readFirstString(
      transaction,
      "txID",
      "txid",
      "txId",
      "transactionId",
      "transaction_id",
    ),
    `${label} tx id`,
  );

const readTronReceiptTransactionIdFromRecord = (
  receipt: Record<string, unknown>,
  label: string,
): string =>
  normalizeTronTxId(
    readFirstString(
      receipt,
      "id",
      "txID",
      "txid",
      "txId",
      "transactionId",
      "transaction_id",
      "transaction_id_hex",
    ),
    `${label} tx id`,
  );

const readTronTransactionOwnerPayload = (
  transaction: Record<string, unknown>,
  label: string,
): string => {
  const rawData = requireRecord(transaction.raw_data, `${label}.raw_data`);
  const contracts = rawData.contract;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new Error(`${label} must include at least one raw_data contract.`);
  }
  for (const [index, contract] of contracts.entries()) {
    if (typeof contract !== "object" || contract === null) {
      continue;
    }
    const parameter = readRecord(
      contract as Record<string, unknown>,
      "parameter",
    );
    const value = parameter ? readRecord(parameter, "value") : null;
    const ownerAddress = readFirstString(
      value,
      "owner_address",
      "ownerAddress",
    );
    if (ownerAddress) {
      return normalizeTronAddressPayloadHex(
        ownerAddress,
        `${label}.raw_data.contract[${index}].owner_address`,
      );
    }
  }
  throw new Error(`${label} must include a TRON owner address.`);
};

const normalizeTronRawDataHex = (value: string, label: string): string => {
  try {
    return normalizeHexData(value, label).slice(2);
  } catch (_error) {
    throw new Error(`${label} must be hex-encoded TRON raw transaction data.`);
  }
};

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
};

const stableRawDataJson = (rawData: Record<string, unknown>): string =>
  JSON.stringify(stableJsonValue(rawData));

const requireSignedTronRawDataMatch = (
  unsignedTransaction: Record<string, unknown>,
  signedTransaction: Record<string, unknown>,
): void => {
  const unsignedRawDataHex = readFirstString(
    unsignedTransaction,
    "raw_data_hex",
    "rawDataHex",
  );
  const signedRawDataHex = readFirstString(
    signedTransaction,
    "raw_data_hex",
    "rawDataHex",
  );
  if (unsignedRawDataHex && signedRawDataHex) {
    if (
      normalizeTronRawDataHex(
        unsignedRawDataHex,
        "Unsigned TRON raw data hex",
      ) !==
      normalizeTronRawDataHex(signedRawDataHex, "Signed TRON raw data hex")
    ) {
      throw new Error(
        "Signed TRON transaction raw data does not match the unsigned bridge transaction.",
      );
    }
    return;
  }

  const unsignedRawData = readFirstRecord(
    unsignedTransaction,
    "raw_data",
    "rawData",
  );
  const signedRawData = readFirstRecord(
    signedTransaction,
    "raw_data",
    "rawData",
  );
  if (!unsignedRawData || !signedRawData) {
    throw new Error(
      "Signed TRON transaction must preserve the unsigned raw transaction data.",
    );
  }
  if (stableRawDataJson(unsignedRawData) !== stableRawDataJson(signedRawData)) {
    throw new Error(
      "Signed TRON transaction raw data does not match the unsigned bridge transaction.",
    );
  }
};

const hasValidTronSignatureSet = (
  transaction: Record<string, unknown>,
): boolean => {
  const signatures = transaction.signature;
  return (
    Array.isArray(signatures) &&
    signatures.length > 0 &&
    signatures.every(
      (signature) =>
        typeof signature === "string" &&
        /^[0-9a-f]{130}$/iu.test(signature.trim().replace(/^0x/iu, "")),
    )
  );
};

export const bindSignedTronTransactionForBroadcast = (input: {
  unsignedTransaction: Record<string, unknown>;
  signedTransaction: unknown;
  ownerAddress: string;
}): BoundTronSignedTransaction => {
  const signedTransaction = requireRecord(
    input.signedTransaction,
    "Signed TRON transaction",
  );
  const unsignedTxId = readTronTransactionIdFromRecord(
    input.unsignedTransaction,
    "Unsigned TRON transaction",
  );
  const signedTxId = readTronTransactionIdFromRecord(
    signedTransaction,
    "Signed TRON transaction",
  );
  if (signedTxId !== unsignedTxId) {
    throw new Error(
      "Signed TRON transaction id does not match the unsigned bridge transaction.",
    );
  }
  const expectedOwnerPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.ownerAddress),
  );
  if (
    readTronTransactionOwnerPayload(
      signedTransaction,
      "Signed TRON transaction",
    ) !== expectedOwnerPayload
  ) {
    throw new Error(
      "Signed TRON transaction owner does not match the connected wallet.",
    );
  }
  requireSignedTronRawDataMatch(input.unsignedTransaction, signedTransaction);
  if (!hasValidTronSignatureSet(signedTransaction)) {
    throw new Error("Signed TRON transaction must include wallet signatures.");
  }
  return {
    transaction: signedTransaction,
    txId: signedTxId,
  };
};

export const bindTronBroadcastResult = (input: {
  response: unknown;
  expectedTxId: string;
  label?: string;
}): BoundTronBroadcastResult => {
  const label = input.label ?? "TRON broadcast response";
  const response = requireRecord(input.response, label);
  if (response.result !== true) {
    const code = readFirstString(response, "code", "reject_code", "error");
    const message = readFirstString(
      response,
      "message",
      "errorMessage",
      "error_message",
    );
    const detail = [code, message].filter(Boolean).join(": ");
    throw new Error(
      detail
        ? `TRON broadcast was not accepted: ${detail}.`
        : "TRON broadcast was not accepted.",
    );
  }
  const responseTxId = readFirstString(
    response,
    "txid",
    "txID",
    "txId",
    "transactionId",
    "transaction_id",
  );
  if (!responseTxId) {
    throw new Error("TRON broadcast response is missing transaction id.");
  }
  const expectedTxId = normalizeTronTxId(input.expectedTxId, "expected tx id");
  const txId = normalizeTronTxId(responseTxId, "TRON broadcast tx id");
  if (txId !== expectedTxId) {
    throw new Error(
      "TRON broadcast transaction id does not match the signed transaction.",
    );
  }
  return {
    response,
    txId,
  };
};

const normalizeTronBlockHash = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte TRON block hash.`);
  }
  if (/^0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return `0x${normalized}`;
};

const normalizeSafePositiveInteger = (
  value: unknown,
  label: string,
): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};

const readFirstSafePositiveInteger = (
  records: Array<Record<string, unknown> | null | undefined>,
  label: string,
  ...keys: string[]
): number => {
  for (const record of records) {
    if (!record) {
      continue;
    }
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        return normalizeSafePositiveInteger(value, label);
      }
    }
  }
  throw new Error(`${label} is required.`);
};

const readFirstOptionalSafePositiveInteger = (
  records: Array<Record<string, unknown> | null | undefined>,
  label: string,
  ...keys: string[]
): number | null => {
  for (const record of records) {
    if (!record) {
      continue;
    }
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        return normalizeSafePositiveInteger(value, label);
      }
    }
  }
  return null;
};

const listRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];

const readTronReceiptStatus = (
  receipt: Record<string, unknown>,
): string | null => {
  const receiptDetail = readFirstRecord(receipt, "receipt", "receipt_detail");
  const candidates = [
    readFirstString(receipt, "result", "contractRet", "contract_ret"),
    readFirstString(receiptDetail, "result", "contractRet", "contract_ret"),
  ].filter(Boolean);
  return candidates.length > 0 ? candidates[0].toUpperCase() : null;
};

const readTronFinalityBlock = (
  finality: Record<string, unknown>,
): Record<string, unknown> => {
  const solidBlock = readFirstRecord(
    finality,
    "solidBlock",
    "solid_block",
    "block",
  );
  if (!solidBlock) {
    throw new Error("TRON finality data is missing the solid block.");
  }
  return solidBlock;
};

const readTronFinalityWitnesses = (
  finality: Record<string, unknown>,
): Record<string, unknown>[] => {
  const witnessPayload = finality.witnesses;
  if (Array.isArray(witnessPayload)) {
    return listRecordArray(witnessPayload);
  }
  const witnessRecord =
    typeof witnessPayload === "object" &&
    witnessPayload !== null &&
    !Array.isArray(witnessPayload)
      ? (witnessPayload as Record<string, unknown>)
      : null;
  return listRecordArray(witnessRecord?.witnesses ?? witnessRecord?.items);
};

export const bindTronFinalitySnapshot = (
  finalityInput: unknown,
): BoundTronFinalitySnapshot => {
  const finality = requireRecord(finalityInput, "TRON finality data");
  const solidBlock = readTronFinalityBlock(finality);
  const header = readFirstRecord(solidBlock, "block_header", "blockHeader");
  const rawData = readFirstRecord(header, "raw_data", "rawData");
  const solidBlockNumber = readFirstSafePositiveInteger(
    [rawData, header, solidBlock],
    "TRON solid block number",
    "number",
    "blockNumber",
    "block_number",
  );
  const solidBlockHash = normalizeTronBlockHash(
    readFirstString(
      solidBlock,
      "blockID",
      "blockId",
      "block_id",
      "hash",
      "blockHash",
      "block_hash",
    ),
    "TRON solid block hash",
  );
  const witnessCount = readTronFinalityWitnesses(finality).length;
  if (witnessCount === 0) {
    throw new Error("TRON finality data must include active witnesses.");
  }
  const collectedAtMsValue = finality.collectedAtMs ?? finality.collected_at_ms;
  const collectedAtMs =
    collectedAtMsValue === undefined ||
    collectedAtMsValue === null ||
    collectedAtMsValue === ""
      ? undefined
      : normalizeSafePositiveInteger(
          collectedAtMsValue,
          "TRON finality collection time",
        );
  return Object.freeze({
    finality,
    solidBlockNumber,
    solidBlockHash,
    witnessCount,
    ...(collectedAtMs ? { collectedAtMs } : {}),
  });
};

const readTronEventRecords = (
  events: Record<string, unknown>,
): Record<string, unknown>[] =>
  listRecordArray(events.data).length > 0
    ? listRecordArray(events.data)
    : listRecordArray(events.events).length > 0
      ? listRecordArray(events.events)
      : listRecordArray(events.items);

const normalizeTronAddressToPayloadHex = (
  value: string,
  label: string,
): string =>
  value.trim().startsWith("T")
    ? bytesToLowerHex(decodeTronBase58CheckAddress(value))
    : normalizeTronAddressPayloadHex(value, label);

const normalizeTronEventAddressToPayloadHex = (
  value: string,
  label: string,
): string => {
  const normalized = value.trim().toLowerCase().replace(/^0x/u, "");
  if (value.trim().startsWith("T")) {
    return bytesToLowerHex(decodeTronBase58CheckAddress(value));
  }
  if (/^41[0-9a-f]{40}$/u.test(normalized)) {
    return normalizeTronAddressPayloadHex(normalized, label);
  }
  if (/^[0-9a-f]{40}$/u.test(normalized)) {
    return `0x41${normalized}`;
  }
  if (/^[0-9a-f]{64}$/u.test(normalized)) {
    if (!normalized.startsWith("0".repeat(24))) {
      throw new Error(
        `${label} must be a left-padded TRON address event value.`,
      );
    }
    return `0x41${normalized.slice(24)}`;
  }
  throw new Error(`${label} must be a TRON address event value.`);
};

const normalizeEventUintString = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  const parsed =
    normalized.startsWith("0x") && /^0x[0-9a-f]+$/u.test(normalized)
      ? BigInt(normalized)
      : /^[0-9]+$/u.test(normalized)
        ? BigInt(normalized)
        : null;
  if (parsed === null || parsed < 0n) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed.toString(10);
};

const normalizePositiveBaseUnitString = (
  value: string,
  label: string,
): string => {
  const normalized = value.trim();
  if (normalized !== value || !/^[1-9]\d*$/u.test(normalized)) {
    throw new Error(
      `${label} must be a positive whole-number base-unit amount.`,
    );
  }
  return normalized;
};

const decodeEventBytesText = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("0x")) {
    return trimmed;
  }
  const normalized = trimmed.slice(2).toLowerCase();
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/u.test(normalized)) {
    throw new Error(`${label} must be hex-encoded bytes.`);
  }
  const bytes =
    normalized.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  return new TextDecoder().decode(Uint8Array.from(bytes));
};

const readTronEventContractAddress = (
  event: Record<string, unknown>,
): string => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  return (
    readFirstString(
      event,
      "contract_address",
      "contractAddress",
      "caller_contract_address",
      "callerContractAddress",
    ) ||
    readFirstString(
      result,
      "contract_address",
      "contractAddress",
      "caller_contract_address",
      "callerContractAddress",
    )
  );
};

const readTronEventName = (event: Record<string, unknown>): string => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  return (
    readFirstString(event, "event_name", "eventName", "name") ||
    readFirstString(result, "event_name", "eventName", "name")
  );
};

const isTairaXorBurnToTairaEvent = (event: Record<string, unknown>): boolean =>
  readTronEventName(event)
    .replace(/[^a-z0-9]/giu, "")
    .toLowerCase() === "burntotaira";

const readMatchingTronEventRecords = (
  events: Record<string, unknown>,
  txId: string,
  expectedContractAddress?: string,
): Record<string, unknown>[] => {
  const expectedContractPayload = expectedContractAddress
    ? normalizeTronAddressToPayloadHex(
        expectedContractAddress,
        "TRON bridge event contract address",
      )
    : "";
  let sawSourceContractEvent = false;
  const matchingEvents = readTronEventRecords(events).filter((event) => {
    const eventTxId = readFirstString(
      event,
      "transaction_id",
      "transactionId",
      "transaction_id_hex",
      "txID",
      "txId",
      "txid",
    );
    if (
      !eventTxId ||
      normalizeTronTxId(eventTxId, "TRON event transaction id") !== txId
    ) {
      return false;
    }
    if (expectedContractPayload) {
      const eventContractAddress = readTronEventContractAddress(event);
      if (
        !eventContractAddress ||
        normalizeTronAddressToPayloadHex(
          eventContractAddress,
          "TRON event contract address",
        ) !== expectedContractPayload
      ) {
        return false;
      }
    }
    sawSourceContractEvent = true;
    return isTairaXorBurnToTairaEvent(event);
  });
  if (sawSourceContractEvent && matchingEvents.length === 0) {
    throw new Error(
      "TRON transaction events must include a BurnToTaira bridge event.",
    );
  }
  return matchingEvents;
};

const readTronSourceEventDigest = (event: Record<string, unknown>): string => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  return (
    readFirstString(
      event,
      "sourceEventDigest",
      "source_event_digest",
      "source_event_digest_hex",
      "_sourceEventDigest",
      "_source_event_digest",
      "eventDigest",
      "event_digest",
    ) ||
    readFirstString(
      result,
      "sourceEventDigest",
      "source_event_digest",
      "source_event_digest_hex",
      "_sourceEventDigest",
      "_source_event_digest",
      "eventDigest",
      "event_digest",
      "0",
    )
  );
};

const requireTronSourceEventSender = (
  event: Record<string, unknown>,
  tronSender: string,
): void => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  const burner = readFirstString(
    result,
    "burner",
    "_burner",
    "sender",
    "_sender",
    "from",
    "_from",
    "1",
  );
  if (!burner) {
    throw new Error("TRON burn event is missing the burner address.");
  }
  const expected = bytesToLowerHex(decodeTronBase58CheckAddress(tronSender));
  const actual = normalizeTronEventAddressToPayloadHex(
    burner,
    "TRON burn event burner",
  );
  if (actual !== expected) {
    throw new Error(
      "TRON burn event burner does not match the connected wallet.",
    );
  }
};

const requireTronSourceEventAmount = (
  event: Record<string, unknown>,
  amountDecimal: string,
): void => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  const amount = readFirstString(
    result,
    "amount",
    "_amount",
    "value",
    "_value",
    "3",
  );
  if (!amount) {
    throw new Error("TRON burn event is missing the amount.");
  }
  const expected = bridgeDecimalToBaseUnits(amountDecimal);
  const actual = normalizeEventUintString(amount, "TRON burn event amount");
  if (actual !== expected) {
    throw new Error(
      "TRON burn event amount does not match this bridge request.",
    );
  }
};

const requireTronSourceEventTairaRecipient = (
  event: Record<string, unknown>,
  tairaRecipient: string,
): void => {
  const result = readFirstRecord(event, "result", "args", "returnValues");
  const recipient = readFirstString(
    result,
    "tairaRecipient",
    "taira_recipient",
    "_tairaRecipient",
    "_taira_recipient",
    "recipient",
    "_recipient",
    "7",
  );
  if (!recipient) {
    throw new Error("TRON burn event is missing the TAIRA recipient.");
  }
  const expected = normalizeTairaAccountId(tairaRecipient);
  const actual = decodeEventBytesText(
    recipient,
    "TRON burn event TAIRA recipient",
  );
  if (actual !== expected) {
    throw new Error(
      "TRON burn event TAIRA recipient does not match this bridge request.",
    );
  }
};

const requireTronSourceEventRequestBinding = (
  event: Record<string, unknown>,
  input: {
    tronSender?: string;
    tairaRecipient?: string;
    amountDecimal?: string;
  },
): void => {
  if (input.tronSender) {
    requireTronSourceEventSender(event, input.tronSender);
  }
  if (input.amountDecimal) {
    requireTronSourceEventAmount(event, input.amountDecimal);
  }
  if (input.tairaRecipient) {
    requireTronSourceEventTairaRecipient(event, input.tairaRecipient);
  }
};

const requireTronSourceEventReceiptBlockBinding = (
  event: Record<string, unknown>,
  receiptBlockNumber: number,
): void => {
  const eventBlockNumber = readFirstOptionalSafePositiveInteger(
    [event],
    "TRON burn event block number",
    "blockNumber",
    "block_number",
  );
  if (eventBlockNumber === null) {
    return;
  }
  if (eventBlockNumber !== receiptBlockNumber) {
    throw new Error(
      "TRON burn event block number does not match the transaction receipt.",
    );
  }
};

const readTronSourceEventDigestFromEvents = (
  events: Record<string, unknown>,
  txId: string,
  expectedContractAddress?: string,
): { digest: string; event: Record<string, unknown> } => {
  const matchingEvents = readMatchingTronEventRecords(
    events,
    txId,
    expectedContractAddress,
  );
  if (matchingEvents.length === 0) {
    throw new Error(
      expectedContractAddress
        ? "TRON transaction events must include at least one event from the bridge contract."
        : "TRON transaction events must include at least one event for this transaction.",
    );
  }
  for (const event of matchingEvents) {
    const digest = readTronSourceEventDigest(event);
    if (digest) {
      return {
        digest: normalizeNonZeroHex32Loose(digest, "TRON source event digest"),
        event,
      };
    }
  }
  throw new Error(
    "TRON transaction events must include the bridge source event digest.",
  );
};

export const bindTronSourceDataForProof = (input: {
  txId: string;
  transaction: unknown;
  receipt: unknown;
  events: unknown;
  finality: unknown;
  bridgeAddress?: string;
  tronSender?: string;
  tairaRecipient?: string;
  amountDecimal?: string;
}): BoundTronSourceData => {
  const txId = normalizeTronTxId(input.txId, "txId");
  const transaction = requireRecord(input.transaction, "TRON transaction");
  const transactionTxId = readTronTransactionIdFromRecord(
    transaction,
    "TRON transaction",
  );
  if (transactionTxId !== txId) {
    throw new Error("TRON transaction id does not match this bridge request.");
  }
  if (
    !readFirstString(transaction, "raw_data_hex", "rawDataHex") &&
    !readFirstRecord(transaction, "raw_data", "rawData")
  ) {
    throw new Error("TRON transaction is missing raw transaction data.");
  }
  if (!hasValidTronSignatureSet(transaction)) {
    throw new Error("TRON transaction must include wallet signatures.");
  }

  const receipt = requireRecord(input.receipt, "TRON transaction receipt");
  const receiptTxId = readTronReceiptTransactionIdFromRecord(
    receipt,
    "TRON transaction receipt",
  );
  if (receiptTxId !== txId) {
    throw new Error(
      "TRON transaction receipt id does not match this bridge request.",
    );
  }
  const receiptStatus = readTronReceiptStatus(receipt);
  if (receiptStatus !== "SUCCESS") {
    throw new Error("TRON transaction receipt must report SUCCESS.");
  }
  const receiptBlockNumber = readFirstSafePositiveInteger(
    [receipt],
    "TRON transaction receipt block number",
    "blockNumber",
    "block_number",
  );

  const events = requireRecord(input.events, "TRON transaction events");
  const sourceEvent = readTronSourceEventDigestFromEvents(
    events,
    txId,
    input.bridgeAddress,
  );
  requireTronSourceEventReceiptBlockBinding(
    sourceEvent.event,
    receiptBlockNumber,
  );
  requireTronSourceEventRequestBinding(sourceEvent.event, input);

  const finality = bindTronFinalitySnapshot(input.finality);
  if (finality.solidBlockNumber < receiptBlockNumber) {
    throw new Error(
      "TRON solid block has not finalized the bridge source transaction yet.",
    );
  }

  return Object.freeze({
    txId,
    transaction,
    receipt,
    events,
    finality: finality.finality,
    sourceEventDigest: sourceEvent.digest,
    receiptBlockNumber,
    solidBlockNumber: finality.solidBlockNumber,
    solidBlockHash: finality.solidBlockHash,
  });
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
  const input: TronSccpDestinationBindingInput = {
    version: 1 as const,
    key,
    sourceDomain: SCCP_SORA_DOMAIN,
    targetDomain: SCCP_TRON_DOMAIN,
    networkId: proofMaterial.networkIdHex,
    verifierAddress: proofMaterial.tronVerifierAddress,
    verifierCodeHash: proofMaterial.verifierCodeHashHex,
    verifierKeyHash: proofMaterial.verifierKeyHashHex,
    bindingHash:
      readFirstString(manifestBinding, "bindingHash", "binding_hash") ||
      proofMaterial.expectedDestinationBindingHashHex,
  };
  tronSccpDestinationBinding(input);
  return input;
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
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
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
  if (readCodecText(transfer.sender, "payload.sender") !== tairaSender) {
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
  compareOptionalText(bundleTransfer, "sender", tairaSender, "Bundle sender");
  compareOptionalText(
    bundleTransfer,
    "recipient",
    input.tronRecipient.trim(),
    "Bundle recipient",
  );
  const canonicalPayloadHex = bytesToLowerHex(
    canonicalSccpTransferPayloadBytes(
      bundleTransfer as unknown as SccpTransferPayload,
    ),
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
    canonicalPayloadHex,
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
  canonicalPayloadHex?: string;
  feeLimit?: number;
}): TairaXorFinalizeTriggerRequest => {
  const manifest = requireRecord(input.manifest, "SCCP TRON manifest");
  const contractAddress = readSccpTronBridgeAddress(manifest);
  if (!contractAddress) {
    throw new Error("The TRON bridge deployment address is missing.");
  }
  const normalizedContractAddress = normalizeTronAddress(contractAddress);
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
  if (
    Number(publicInputs.targetDomain ?? publicInputs.target_domain) !==
    SCCP_TRON_DOMAIN
  ) {
    throw new Error("TRON SCCP proof package must target TRON.");
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
  const amount = normalizePositiveBaseUnitString(
    input.amountBaseUnits,
    "TRON finalize amount",
  );
  const packageCanonicalPayloadHex =
    readFirstString(
      proofPackage,
      "canonicalPayloadHex",
      "canonical_payload_hex",
    ) ||
    readFirstString(submission, "canonicalPayloadHex", "canonical_payload_hex");
  const canonicalPayloadHex =
    packageCanonicalPayloadHex || input.canonicalPayloadHex;
  if (!canonicalPayloadHex) {
    throw new Error(
      "TRON SCCP proof package is missing canonical payload bytes.",
    );
  }
  const normalizedCanonicalPayloadHex = normalizeHexData(
    canonicalPayloadHex,
    "TRON SCCP proof package canonical payload bytes",
  );
  if (
    input.canonicalPayloadHex &&
    packageCanonicalPayloadHex &&
    normalizeHexData(
      input.canonicalPayloadHex,
      "bridge request canonical payload bytes",
    ) !== normalizedCanonicalPayloadHex
  ) {
    throw new Error(
      "TRON SCCP proof package canonical payload bytes do not match this bridge request.",
    );
  }
  const publicInputPayloadHash = normalizeHex32(
    readFirstString(publicInputs, "payloadHash", "payload_hash"),
    "proofPackage.publicInputs.payloadHash",
  );
  if (
    publicInputPayloadHash !==
    sccpPayloadHash(
      hexDataToBytes(
        normalizedCanonicalPayloadHex,
        "TRON SCCP proof package canonical payload bytes",
      ),
    )
  ) {
    throw new Error(
      "TRON SCCP proof package payload hash does not match the canonical payload bytes.",
    );
  }
  const callData = tairaXorFinalizeFromTairaCallData({
    proofBytes,
    publicInputs,
    statementHash,
    canonicalPayloadHex: normalizedCanonicalPayloadHex,
    recipientAddress: normalizeTronAddress(input.tronRecipient),
    amount,
  });
  return {
    trigger: {
      ownerAddress: normalizeTronAddress(input.ownerAddress),
      contractAddress: normalizedContractAddress,
      functionSelector: TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
      callData,
      feeLimit: normalizeTronFeeLimit(input.feeLimit),
    },
    amountBaseUnits: amount,
    messageId,
  };
};

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
  if (
    input.gasLimit !== undefined &&
    (!Number.isSafeInteger(input.gasLimit) || input.gasLimit <= 0)
  ) {
    throw new Error(
      "TAIRA settlement gas limit must be a positive safe integer.",
    );
  }
  return {
    entrypoint: "finalize_inbound",
    route: SCCP_XOR_ROUTE_ID,
    ...(contractAddress ? { contract_address: contractAddress } : {}),
    ...(contractAlias ? { contract_alias: contractAlias } : {}),
    ...(input.gasLimit ? { gas_limit: input.gasLimit } : {}),
  };
};

const requireTronToTairaSourceSettlement = (
  proofPackage: Record<string, unknown>,
): Record<string, unknown> => {
  if (
    proofPackage.settlement === undefined ||
    proofPackage.settlement === null
  ) {
    throw new Error(
      "TRON -> TAIRA source proof package settlement is missing.",
    );
  }
  const settlement = requireRecord(
    proofPackage.settlement,
    "TRON -> TAIRA source proof package settlement",
  );
  if (readFirstString(settlement, "entrypoint") !== "finalize_inbound") {
    throw new Error(
      "TRON -> TAIRA settlement entrypoint must be finalize_inbound.",
    );
  }
  if (readFirstString(settlement, "route", "route_id") !== SCCP_XOR_ROUTE_ID) {
    throw new Error("TRON -> TAIRA settlement route must be taira_tron_xor.");
  }
  return settlement;
};

export const bindTronToTairaSourceProofPackage = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofPackage: unknown;
  txId: string;
  events?: Record<string, unknown>;
  tronSender: string;
  tairaRecipient: string;
  amountDecimal: string;
}): TronToTairaSourceProofPackage => {
  const amountBaseUnits = bridgeDecimalToBaseUnits(input.amountDecimal);
  const tairaRecipient = normalizeTairaAccountId(input.tairaRecipient);
  const proofPackage = requireRecord(
    input.proofPackage,
    "TRON -> TAIRA source proof package",
  );
  requireTronToTairaSourceSettlement(proofPackage);
  const bridgeAddress = readSccpTronBridgeAddress(input.manifest);
  const bound = bindTairaXorTronToTairaSourceProofPackage({
    proofPackage,
    settlementDefaults: buildTairaXorInboundSettlement(input),
    txId: input.txId,
    tronSender: input.tronSender,
    tairaRecipient,
    amount: amountBaseUnits,
    ...(bridgeAddress ? { bridgeAddress } : {}),
  });
  if (input.events) {
    const expectedSourceEventDigest = readTronSourceEventDigestFromEvents(
      input.events,
      input.txId,
      bridgeAddress || undefined,
    );
    requireTronSourceEventRequestBinding(expectedSourceEventDigest.event, {
      tronSender: input.tronSender,
      tairaRecipient,
      amountDecimal: input.amountDecimal,
    });
    if (bound.sourceEventDigest !== expectedSourceEventDigest.digest) {
      throw new Error(
        "TRON source proof package digest does not match the bridge source event.",
      );
    }
  }

  return {
    messageBundle: bound.messageBundle as Record<string, unknown>,
    settlement: bound.settlement as Record<string, unknown>,
    sourceEventDigest: bound.sourceEventDigest,
    txId: bound.txId,
    messageId: bound.messageId,
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

const manifestRecords = (manifestSet: unknown): Record<string, unknown>[] => {
  if (Array.isArray(manifestSet)) {
    return listRecords(manifestSet);
  }
  if (
    typeof manifestSet !== "object" ||
    manifestSet === null ||
    Array.isArray(manifestSet)
  ) {
    return [];
  }
  const record = manifestSet as Record<string, unknown>;
  return [
    ...listRecords(record.manifests),
    ...listRecords(record.items),
    ...listRecords(record.routes),
    ...listRecords(record.proofManifests),
    ...listRecords(record.proof_manifests),
  ];
};

const manifestTargetsTron = (manifest: Record<string, unknown>): boolean => {
  const counterpartyDomain =
    readNumber(manifest, "counterpartyDomain") ??
    readNumber(manifest, "counterparty_domain");
  const verifierTarget =
    readString(manifest, "verifierTarget") ||
    readString(manifest, "verifier_target");
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
    readString(manifest, "route") ||
    readString(manifest, "id");
  const assetKey =
    readString(manifest, "assetKey") ||
    readString(manifest, "asset_key") ||
    readString(manifest, "assetId") ||
    readString(manifest, "asset_id");
  return routeId === SCCP_XOR_ROUTE_ID && assetKey === SCCP_XOR_ASSET_KEY;
};

export const pickTronSccpManifest = (
  manifestSet: unknown,
): Record<string, unknown> | null =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsTron(manifest) && manifestMatchesRoute(manifest),
  ) ?? null;

const hasAnyTronManifest = (manifestSet: unknown): boolean =>
  manifestRecords(manifestSet).some(manifestTargetsTron);

const readCapabilityPath = (
  capabilities: Record<string, unknown> | null | undefined,
  pathKind: "proof" | "message",
): string => {
  if (!capabilities) {
    return "";
  }
  if (pathKind === "proof") {
    return (
      readFirstString(
        capabilities,
        "proofSubmitPath",
        "proof_submit_path",
        "proofSubmit",
        "proof_submit",
      ) ||
      readFirstString(
        readFirstRecord(capabilities, "submit", "submissions", "paths"),
        "proof",
        "proofPath",
        "proof_path",
        "proofSubmitPath",
        "proof_submit_path",
      )
    );
  }
  return (
    readFirstString(
      capabilities,
      "messageSubmitPath",
      "message_submit_path",
      "messageSubmit",
      "message_submit",
    ) ||
    readFirstString(
      readFirstRecord(capabilities, "submit", "submissions", "paths"),
      "message",
      "messagePath",
      "message_path",
      "messageSubmitPath",
      "message_submit_path",
    )
  );
};

const readProductionReadyFlag = (
  manifest: Record<string, unknown>,
): { ready: boolean; invalid: boolean } => {
  const hasCamel = Object.prototype.hasOwnProperty.call(
    manifest,
    "productionReady",
  );
  const value = hasCamel ? manifest.productionReady : manifest.production_ready;
  if (value === true) {
    return { ready: true, invalid: false };
  }
  if (value === false || value === undefined || value === null) {
    return { ready: false, invalid: false };
  }
  return { ready: false, invalid: true };
};

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
  const proofSubmitPath = readCapabilityPath(capabilities, "proof");
  const messageSubmitPath = readCapabilityPath(capabilities, "message");
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
    const productionReady = readProductionReadyFlag(tronManifest);
    const disabledReason =
      readString(tronManifest, "disabledReason") ||
      readString(tronManifest, "disabled_reason");
    if (productionReady.invalid) {
      reasons.push("The TRON SCCP route production-ready flag is invalid.");
    } else if (!productionReady.ready) {
      reasons.push(
        disabledReason || "The TRON SCCP route is not production-ready.",
      );
    }
    const bridgeAddress = readSccpTronBridgeAddress(tronManifest);
    if (!bridgeAddress) {
      reasons.push("The TRON bridge deployment address is missing.");
    } else {
      try {
        normalizeTronAddress(bridgeAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The TRON bridge deployment address is invalid: ${error.message}`
            : "The TRON bridge deployment address is invalid.",
        );
      }
    }
    const tokenAddress = readSccpTronTokenAddress(tronManifest);
    if (!tokenAddress) {
      reasons.push("The TairaXOR token deployment address is missing.");
    } else {
      try {
        normalizeTronAddress(tokenAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The TairaXOR token deployment address is invalid: ${error.message}`
            : "The TairaXOR token deployment address is invalid.",
        );
      }
    }
    try {
      readDestinationBindingInput(tronManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The TRON SCCP verifier rollout proof material is incomplete.",
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

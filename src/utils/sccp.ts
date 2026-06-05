import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  buildTairaXorSccpRecordDescriptor,
  buildTairaXorSccpBurnRecordZkIvmRequest,
  canonicalSccpTransferPayloadBytes,
  canonicalSccpPayloadEnvelopeBytes,
  canonicalSccpMessageProofBundleBytes,
  sccpPayloadHash,
  sccpTransferMessageId,
  tronSccpDestinationBinding,
  SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1,
  SCCP_TAIRA_XOR_ASSET_KEY_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  bindTairaXorTronBurnStartedEvent,
  bindTairaXorTronToTairaSourceProofPackage,
  parseTronTriggerSmartContractRawData,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  tairaXorBurnSourceEventDigest,
  tairaXorBurnToTairaAccountCallData,
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
import { isSecretLikeTextValue } from "@/utils/secretLike";

export const TRON_MAINNET_CAIP_CHAIN_ID = "tron:0x2b6653dc";
export const TRON_MAINNET_CHAIN_ID_HEX = "0x2b6653dc";
export const TRON_MAINNET_NETWORK_ID_HEX =
  "0x000000000000000000000000000000000000000000000000000000002b6653dc";
export const TRON_MAINNET_RPC_URL = "https://api.trongrid.io";
export const TRON_MAINNET_TRONSCAN_URL = "https://tronscan.org";
export const TRON_NILE_CAIP_CHAIN_ID = "tron:0xcd8690dc";
export const TRON_NILE_CHAIN_ID_HEX = "0xcd8690dc";
export const TRON_NILE_NETWORK_ID_HEX =
  "0x00000000000000000000000000000000000000000000000000000000cd8690dc";
export const TRON_NILE_RPC_URL = "https://nile.trongrid.io";
export const TRON_NILE_TRONSCAN_URL = "https://nile.tronscan.org";
export const WALLETCONNECT_TRON_NAMESPACE = "tron";
export const WALLETCONNECT_TRON_SIGN_METHOD = "tron_signTransaction";
export const WALLETCONNECT_TRON_METHOD_VERSION = "v1";
export const SCCP_TRON_DOMAIN = 5;
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_XOR_ROUTE_ID = SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1;
export const SCCP_XOR_ASSET_KEY = SCCP_TAIRA_XOR_ASSET_KEY_V1;
export const SCCP_TRON_TOKEN_SYMBOL = "TairaXOR";
export const SCCP_XOR_DECIMALS = 18;
export const SCCP_TRON_DEFAULT_FEE_LIMIT = 250_000_000;

export {
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  tairaXorBurnSourceEventDigest,
  tairaXorBurnToTairaAccountCallData,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  tairaXorTransferPayloadHash,
};

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_BASE58_INDEX = new Map(
  Array.from(TRON_BASE58_ALPHABET, (character, index) => [character, index]),
);
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_ORDER = SECP256K1_ORDER >> 1n;
const SCCP_TRON_TRANSACTION_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const SCCP_TRON_TRANSACTION_SIGNING_HELPER_KEY_PATTERN =
  /^(?:signatures?|privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;

export type SccpBridgeDirection = "taira-to-tron" | "tron-to-taira";

export type SccpTronNetworkKey = "mainnet" | "nile";

export type SccpTronNetworkProfile = {
  key: SccpTronNetworkKey;
  label: string;
  caipChainId: `tron:${string}`;
  chainIdHex: string;
  networkIdHex: string;
  rpcUrl: string;
  tronscanUrl: string;
};

export const SCCP_TRON_NETWORK_PROFILES = {
  mainnet: {
    key: "mainnet",
    label: "TRON Mainnet",
    caipChainId: TRON_MAINNET_CAIP_CHAIN_ID,
    chainIdHex: TRON_MAINNET_CHAIN_ID_HEX,
    networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
    rpcUrl: TRON_MAINNET_RPC_URL,
    tronscanUrl: TRON_MAINNET_TRONSCAN_URL,
  },
  nile: {
    key: "nile",
    label: "TRON Nile Testnet",
    caipChainId: TRON_NILE_CAIP_CHAIN_ID,
    chainIdHex: TRON_NILE_CHAIN_ID_HEX,
    networkIdHex: TRON_NILE_NETWORK_ID_HEX,
    rpcUrl: TRON_NILE_RPC_URL,
    tronscanUrl: TRON_NILE_TRONSCAN_URL,
  },
} satisfies Record<SccpTronNetworkKey, SccpTronNetworkProfile>;

export const normalizeSccpTronNetworkKey = (
  value: unknown,
): SccpTronNetworkKey => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !normalized ||
    normalized === "mainnet" ||
    normalized === "tron-mainnet"
  ) {
    return "mainnet";
  }
  if (normalized === "nile" || normalized === "tron-nile") {
    return "nile";
  }
  throw new Error("SCCP TRON network must be mainnet or nile.");
};

export const resolveSccpTronNetworkProfile = (
  value: unknown,
): SccpTronNetworkProfile =>
  SCCP_TRON_NETWORK_PROFILES[normalizeSccpTronNetworkKey(value)];

export const SCCP_TRON_NETWORK = resolveSccpTronNetworkProfile(
  import.meta.env.VITE_SCCP_TRON_NETWORK || "nile",
);

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
  tronChainId: SCCP_TRON_NETWORK.caipChainId,
  tronNetworkIdHex: SCCP_TRON_NETWORK.networkIdHex,
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
  endpoint?: string;
  ownerAddress: string;
  contractAddress: string;
  functionSelector: string;
  callData: string;
  feeLimit: number;
};

export type TronConstantContractTriggerRequest = {
  endpoint?: string;
  ownerAddress: string;
  contractAddress: string;
  functionSelector: string;
  parameter: string;
};

export type BoundTronSignedTransaction = {
  transaction: Record<string, unknown>;
  txId: string;
};

export type BoundTronUnsignedSmartContractTransaction = {
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

export type TronSccpProofQueryMaterial = TronSccpProofMaterial & {
  proofBytesHex: string;
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

type TairaXorBurnRecordMaterialResult = {
  material: TairaXorBurnRecordMaterial | null;
  reason: string | null;
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

export const normalizeTairaTransactionHash = (hash: unknown): string => {
  const normalized = String(hash ?? "")
    .trim()
    .replace(/^0x/iu, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("TAIRA transaction hash must be a 32-byte hex value.");
  }
  return normalized;
};

export const buildTairaExplorerTransactionUrl = (
  explorerBaseUrl: string,
  hash: unknown,
): string | null => {
  const baseUrl = explorerBaseUrl.trim().replace(/\/+$/u, "");
  if (!baseUrl) {
    throw new Error("TAIRA explorer URL is required.");
  }
  try {
    return `${baseUrl}/transactions/${normalizeTairaTransactionHash(hash)}`;
  } catch (_error) {
    return null;
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

const base58Encode = (bytes: Uint8Array): string => {
  let number = 0n;
  for (const byte of bytes) {
    number = (number << 8n) + BigInt(byte);
  }

  let encoded = "";
  while (number > 0n) {
    const remainder = Number(number % 58n);
    encoded = `${TRON_BASE58_ALPHABET[remainder]}${encoded}`;
    number /= 58n;
  }

  const leadingZeroes = bytes.findIndex((byte) => byte !== 0);
  const prefixLength =
    leadingZeroes === -1 ? bytes.length : Math.max(0, leadingZeroes);
  return `${"1".repeat(prefixLength)}${encoded || ""}`;
};

const encodeTronBase58CheckAddress = (payload: Uint8Array): string => {
  if (
    payload.length !== 21 ||
    payload[0] !== 0x41 ||
    payload.slice(1).every((byte) => byte === 0)
  ) {
    throw new Error("TRON address payload must be a non-zero 21-byte value.");
  }
  const checksum = doubleSha256(payload).slice(0, 4);
  const encoded = new Uint8Array(payload.length + checksum.length);
  encoded.set(payload);
  encoded.set(checksum, payload.length);
  return base58Encode(encoded);
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

export const normalizeTronNetworkIdHex = (
  networkId: string,
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): string => {
  const profile = resolveSccpTronNetworkProfile(tronNetwork);
  const normalized = networkId.trim().toLowerCase();
  if (normalized === profile.chainIdHex) {
    return profile.networkIdHex;
  }
  if (normalized !== profile.networkIdHex) {
    throw new Error(`TRON SCCP routes must target ${profile.label}.`);
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

export const readSccpTronSourceBridgeAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  return (
    readString(manifest, "sccpTronSourceBridgeAddress") ||
    readString(manifest, "sccp_tron_source_bridge_address") ||
    readString(manifest, "tronSourceBridgeAddress") ||
    readString(manifest, "tron_source_bridge_address") ||
    readString(manifest, "sourceBridgeAddress") ||
    readString(manifest, "source_bridge_address") ||
    readString(manifest, "source_bridge_address_base58")
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
    endpoint: readSccpTronGatewayEndpoint(input.manifest),
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
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): TronSccpProofMaterial | null => {
  if (!manifest) {
    return null;
  }
  const selectedNetwork = readManifestTronNetworkKey(manifest) ?? tronNetwork;
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
      networkIdHex: normalizeTronNetworkIdHex(networkId, selectedNetwork),
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

const isCanonicalTairaAssetDefinitionId = (value: string): boolean =>
  /^[1-9A-HJ-NP-Za-km-z]{16,80}$/u.test(value);

const SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES = 32;
const SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

const strictBase64DecodedLength = (value: string): number | null => {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)
  ) {
    return null;
  }
  try {
    const decoded = atob(normalized);
    return decoded.length > 0 && btoa(decoded) === normalized
      ? decoded.length
      : null;
  } catch (_error) {
    return null;
  }
};

const readSccpTairaBurnRecordMaterialResult = (
  manifest: Record<string, unknown> | null | undefined,
): TairaXorBurnRecordMaterialResult => {
  if (!manifest) {
    return {
      material: null,
      reason: "The TAIRA burn-record ZK contract material is missing.",
    };
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
    return {
      material: null,
      reason: "The TAIRA burn-record ZK contract material is missing.",
    };
  }
  if (!isCanonicalTairaAssetDefinitionId(settlementAssetDefinitionId)) {
    return {
      material: null,
      reason:
        "The TAIRA settlement asset must be a canonical asset definition id, not an alias.",
    };
  }
  const contractArtifactBytes = strictBase64DecodedLength(contractArtifactB64);
  if (contractArtifactBytes === null) {
    return {
      material: null,
      reason: "The TAIRA burn-record contract artifact must be strict base64.",
    };
  }
  if (
    contractArtifactBytes < SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES ||
    contractArtifactBytes > SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES
  ) {
    return {
      material: null,
      reason: `The TAIRA burn-record contract artifact must decode to ${SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES}-${SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES} bytes.`,
    };
  }
  const gasLimit =
    readNumber(burnRecord ?? manifest, "gasLimit") ??
    readNumber(burnRecord ?? manifest, "gas_limit") ??
    undefined;
  if (
    gasLimit !== undefined &&
    (!Number.isSafeInteger(gasLimit) || gasLimit <= 0)
  ) {
    return {
      material: null,
      reason: "The TAIRA burn-record gas limit must be positive.",
    };
  }
  return {
    material: {
      settlementAssetDefinitionId,
      contractArtifactB64,
      vkRef,
      gasLimit,
    },
    reason: null,
  };
};

export const readSccpTairaBurnRecordMaterial = (
  manifest: Record<string, unknown> | null | undefined,
): TairaXorBurnRecordMaterial | null =>
  readSccpTairaBurnRecordMaterialResult(manifest).material;

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
    endpoint: readSccpTronGatewayEndpoint(input.manifest),
    ownerAddress,
    contractAddress: normalizedContractAddress,
    functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
    callData: tairaXorBurnToTairaAccountCallData({
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
  const materialResult = readSccpTairaBurnRecordMaterialResult(input.manifest);
  const material = materialResult.material;
  if (!material) {
    throw new Error(
      materialResult.reason ??
        "The TAIRA burn-record ZK contract material is missing.",
    );
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
  const normalized = `0x${value.trim().toLowerCase().replace(/^0x/u, "")}`;
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
  const trimmed = value.trim();
  if (trimmed.startsWith("T")) {
    return bytesToLowerHex(decodeTronBase58CheckAddress(trimmed));
  }
  const normalized = trimmed.toLowerCase().replace(/^0x/u, "");
  if (!/^41[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a 21-byte TRON mainnet address payload.`);
  }
  if (/^410{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a non-zero TRON address payload.`);
  }
  return `0x${normalized}`;
};

export const normalizeSccpMessageId = (value: string): string =>
  normalizeHex32(`0x${value.trim().replace(/^0x/iu, "")}`, "messageId");

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

const bytesToBigInt = (bytes: Uint8Array): bigint =>
  BigInt(bytesToLowerHex(bytes));

const BN254_G1_GENERATOR_WORDS = [
  1n,
  2n,
] as const;
const BN254_G2_GENERATOR_WORDS = [
  10857046999023057135944570762232829481370756359578518086990519993285655852781n,
  11559732032986387107991004021392285783925812861821192530917403151452391805634n,
  8495653923123431417604973247489272438418190587263600148770280649306958101930n,
  4082367875863433681332203403145435568316851327593401208105741076214120093531n,
] as const;

const abiUint256Word = (value: bigint): string => {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error("SCCP ABI word is out of range.");
  }
  return value.toString(16).padStart(64, "0");
};

const abiHex32Word = (value: string, label: string): string =>
  normalizeHex32(value, label).slice(2);

const buildSccpGroth16JobQueryProofBytesHex = (input: {
  messageId: string;
  commitmentRoot: string;
}): string =>
  `0x${[
    abiUint256Word(1n),
    abiHex32Word(input.messageId, "SCCP message id"),
    abiUint256Word(BigInt(SCCP_SORA_DOMAIN)),
    abiHex32Word(input.commitmentRoot, "SCCP commitment root"),
    ...BN254_G1_GENERATOR_WORDS.map(abiUint256Word),
    ...BN254_G2_GENERATOR_WORDS.map(abiUint256Word),
    ...BN254_G1_GENERATOR_WORDS.map(abiUint256Word),
  ].join("")}`;

const recoverTronSignatureOwnerPayload = (
  signatureHex: string,
  rawDataHex: string,
): string => {
  const signature = hexDataToBytes(signatureHex, "Signed TRON signature");
  if (signature.length !== 65) {
    throw new Error("Signed TRON signature must be 65 bytes.");
  }
  const recoveryId = signature[64];
  if (
    !(
      (recoveryId >= 0 && recoveryId <= 3) ||
      (recoveryId >= 27 && recoveryId <= 30)
    )
  ) {
    throw new Error(
      "Signed TRON signature must be a canonical recoverable signature.",
    );
  }
  const r = bytesToBigInt(signature.slice(0, 32));
  const s = bytesToBigInt(signature.slice(32, 64));
  if (r <= 0n || r >= SECP256K1_ORDER || s <= 0n || s > SECP256K1_HALF_ORDER) {
    throw new Error("Signed TRON signature must be canonical.");
  }
  const normalizedRecoveryId = recoveryId >= 27 ? recoveryId - 27 : recoveryId;
  try {
    const rawDataHash = sha256(
      hexDataToBytes(rawDataHex, "Signed TRON raw data hex"),
    );
    const signatureObject = secp256k1.Signature.fromCompact(
      signature.slice(0, 64),
    ).addRecoveryBit(normalizedRecoveryId);
    const publicKey = signatureObject
      .recoverPublicKey(rawDataHash)
      .toRawBytes(false);
    const addressHash = keccak_256(publicKey.slice(1));
    const payload = new Uint8Array(21);
    payload[0] = 0x41;
    payload.set(addressHash.slice(-20), 1);
    return bytesToLowerHex(payload);
  } catch (error) {
    throw new Error(
      `Signed TRON signature could not recover the transaction owner: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

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

type TronSmartContractCall = {
  index: number;
  ownerPayload: string;
  contractPayload: string;
  dataHex: string;
};

type TronSourceBridgeBindingInput = {
  bridgeAddress: string;
  tronSender: string;
  tairaRecipient: string;
  amountDecimal: string;
};

const readRequiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
};

const normalizeTronSourceBridgeBindingInput = (input: {
  bridgeAddress?: unknown;
  tronSender?: unknown;
  tairaRecipient?: unknown;
  amountDecimal?: unknown;
}): TronSourceBridgeBindingInput => ({
  bridgeAddress: normalizeTronAddress(
    readRequiredText(input.bridgeAddress, "TRON bridge address"),
  ),
  tronSender: normalizeTronAddress(
    readRequiredText(input.tronSender, "TRON sender address"),
  ),
  tairaRecipient: normalizeTairaAccountId(
    readRequiredText(input.tairaRecipient, "TAIRA recipient account"),
  ),
  amountDecimal: normalizeBridgeAmount(
    readRequiredText(input.amountDecimal, "Bridge amount"),
  ),
});

const readTronTransactionSmartContractCalls = (
  transaction: Record<string, unknown>,
  label: string,
): TronSmartContractCall[] => {
  const rawData = readFirstRecord(transaction, "raw_data", "rawData");
  if (!rawData) {
    throw new Error(
      `${label} must include decoded raw_data for bridge call binding.`,
    );
  }
  const contracts = rawData.contract;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new Error(`${label} must include at least one raw_data contract.`);
  }
  return contracts.flatMap((contract, index) => {
    if (typeof contract !== "object" || contract === null) {
      return [];
    }
    const contractRecord = contract as Record<string, unknown>;
    const parameter = readRecord(contractRecord, "parameter");
    const value = parameter ? readRecord(parameter, "value") : null;
    if (!value) {
      return [];
    }
    const type = readFirstString(contractRecord, "type", "contractType")
      .replace(/[^a-z0-9]/giu, "")
      .toLowerCase();
    const typeUrl = readFirstString(parameter, "type_url", "typeUrl")
      .replace(/[^a-z0-9]/giu, "")
      .toLowerCase();
    const ownerAddress = readFirstString(
      value,
      "owner_address",
      "ownerAddress",
    );
    const contractAddress = readFirstString(
      value,
      "contract_address",
      "contractAddress",
    );
    const data = readFirstString(value, "data", "call_data", "callData");
    const isTrigger =
      type === "triggersmartcontract" ||
      typeUrl.endsWith("triggersmartcontract");
    if (!isTrigger) {
      if (contractAddress && data) {
        throw new Error(
          `${label}.raw_data.contract[${index}] must be a TriggerSmartContract call.`,
        );
      }
      return [];
    }
    if (!ownerAddress) {
      throw new Error(
        `${label}.raw_data.contract[${index}] is missing owner_address.`,
      );
    }
    if (!contractAddress) {
      throw new Error(
        `${label}.raw_data.contract[${index}] is missing contract_address.`,
      );
    }
    if (!data) {
      throw new Error(
        `${label}.raw_data.contract[${index}] is missing smart-contract call data.`,
      );
    }
    return [
      {
        index,
        ownerPayload: normalizeTronAddressPayloadHex(
          ownerAddress,
          `${label}.raw_data.contract[${index}].owner_address`,
        ),
        contractPayload: normalizeTronAddressPayloadHex(
          contractAddress,
          `${label}.raw_data.contract[${index}].contract_address`,
        ),
        dataHex: normalizeHexData(
          data,
          `${label}.raw_data.contract[${index}].data`,
        ).slice(2),
      },
    ];
  });
};

const requireTronSourceTransactionRequestBinding = (
  transaction: Record<string, unknown>,
  input: TronSourceBridgeBindingInput,
): void => {
  const calls = readTronTransactionSmartContractCalls(
    transaction,
    "TRON source transaction",
  );
  if (calls.length !== 1) {
    throw new Error(
      "TRON source transaction must include exactly one smart-contract call.",
    );
  }
  const [call] = calls;
  const expectedOwnerPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.tronSender),
  );
  if (call.ownerPayload !== expectedOwnerPayload) {
    throw new Error(
      "TRON source transaction owner does not match the connected wallet.",
    );
  }
  const expectedContractPayload = normalizeTronAddressToPayloadHex(
    input.bridgeAddress,
    "TRON bridge contract address",
  );
  if (call.contractPayload !== expectedContractPayload) {
    throw new Error(
      "TRON source transaction contract does not match the bridge contract.",
    );
  }
  const expectedCallData = normalizeHexData(
    tairaXorBurnToTairaAccountCallData({
      tairaRecipient: input.tairaRecipient,
      amount: bridgeDecimalToBaseUnits(input.amountDecimal),
    }),
    "Expected TRON burnToTaira call data",
  ).slice(2);
  if (call.dataHex !== expectedCallData) {
    throw new Error(
      "TRON source transaction call data does not match this bridge request.",
    );
  }
  requireTronRawDataHexSmartContractBinding(
    transaction,
    "TRON source transaction",
    call,
  );
};

const normalizeTronRawDataHex = (value: string, label: string): string => {
  try {
    return normalizeHexData(value, label).slice(2);
  } catch (_error) {
    throw new Error(`${label} must be hex-encoded TRON raw transaction data.`);
  }
};

const readRequiredTronRawDataHex = (
  transaction: Record<string, unknown>,
  label: string,
): string => {
  const rawDataHex = readFirstString(transaction, "raw_data_hex", "rawDataHex");
  if (!rawDataHex) {
    throw new Error(`${label} must include raw_data_hex.`);
  }
  return normalizeTronRawDataHex(rawDataHex, `${label} raw_data_hex`);
};

const requireTronRawDataHexMatchesTransactionId = (
  transaction: Record<string, unknown>,
  label: string,
): void => {
  const txId = readTronTransactionIdFromRecord(transaction, label);
  const normalizedRawDataHex = readRequiredTronRawDataHex(transaction, label);
  const computedTxId = bytesToLowerHex(
    sha256(hexDataToBytes(normalizedRawDataHex, `${label} raw_data_hex`)),
  ).slice(2);
  if (computedTxId !== txId) {
    throw new Error(
      `${label} raw_data_hex does not hash to its transaction id.`,
    );
  }
};

const requireTronRawDataHexSmartContractBinding = (
  transaction: Record<string, unknown>,
  label: string,
  call: TronSmartContractCall,
): void => {
  const rawDataHex = readRequiredTronRawDataHex(transaction, label);
  try {
    parseTronTriggerSmartContractRawData(`0x${rawDataHex}`, {
      expectedOwnerAddress: call.ownerPayload,
      expectedContractAddress: call.contractPayload,
      expectedCallData: `0x${call.dataHex}`,
    });
  } catch (error) {
    throw new Error(
      `${label} raw_data_hex does not match decoded raw_data bridge call: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
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

const snapshotTronTransactionRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const record = requireRecord(value, label);
  try {
    return requireRecord(structuredClone(record), label);
  } catch (_error) {
    throw new Error(`${label} must be structured-cloneable.`);
  }
};

const isBinaryLikeSccpTransactionValue = (value: unknown): boolean =>
  value instanceof ArrayBuffer || ArrayBuffer.isView(value);

const isPlainSccpTransactionRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertNoUnsafeTronTransactionPayloadFields = (
  value: unknown,
  path: string,
  options: { allowTopLevelSignature?: boolean } = {},
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material before TRON broadcast.`,
    );
  }
  if (isBinaryLikeSccpTransactionValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoUnsafeTronTransactionPayloadFields(
        entry,
        `${path}[${index}]`,
        options,
        seen,
      );
    });
    return;
  }
  if (!isPlainSccpTransactionRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SCCP_TRON_TRANSACTION_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not contain private key material before TRON broadcast.`,
      );
    }
    const allowedTopLevelSignature =
      options.allowTopLevelSignature &&
      path === "Signed TRON transaction" &&
      key === "signature";
    if (
      !allowedTopLevelSignature &&
      SCCP_TRON_TRANSACTION_SIGNING_HELPER_KEY_PATTERN.test(key)
    ) {
      throw new Error(
        `${path}.${key} must not include nested signatures or signing helper payloads before TRON broadcast.`,
      );
    }
    assertNoUnsafeTronTransactionPayloadFields(
      child,
      `${path}.${key}`,
      options,
      seen,
    );
  }
};

const requireSignedTronRawDataMatch = (
  unsignedTransaction: Record<string, unknown>,
  signedTransaction: Record<string, unknown>,
): void => {
  const unsignedRawDataHex = readRequiredTronRawDataHex(
    unsignedTransaction,
    "Unsigned TRON transaction",
  );
  const signedRawDataHex = readRequiredTronRawDataHex(
    signedTransaction,
    "Signed TRON transaction",
  );
  if (unsignedRawDataHex !== signedRawDataHex) {
    throw new Error(
      "Signed TRON transaction raw data does not match the unsigned bridge transaction.",
    );
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
    signatures.length === 1 &&
    signatures.every(
      (signature) =>
        typeof signature === "string" &&
        /^[0-9a-f]{130}$/iu.test(signature.trim().replace(/^0x/iu, "")),
    )
  );
};

const requireSignedTronSignatureOwnerMatch = (
  signedTransaction: Record<string, unknown>,
  expectedOwnerPayload: string,
): void => {
  const rawDataHex = readRequiredTronRawDataHex(
    signedTransaction,
    "Signed TRON transaction",
  );
  const signatures = signedTransaction.signature;
  if (!Array.isArray(signatures) || signatures.length !== 1) {
    throw new Error(
      "Signed TRON transaction must include exactly one wallet signature.",
    );
  }
  const signature = signatures[0];
  if (typeof signature !== "string") {
    throw new Error("Signed TRON transaction signature must be hex text.");
  }
  const recoveredOwnerPayload = recoverTronSignatureOwnerPayload(
    signature,
    rawDataHex,
  );
  if (recoveredOwnerPayload !== expectedOwnerPayload) {
    throw new Error(
      "Signed TRON transaction signature does not recover to the connected wallet.",
    );
  }
};

export const bindUnsignedTronSmartContractTransaction = (input: {
  transaction: unknown;
  trigger: TronSmartContractTriggerRequest;
}): BoundTronUnsignedSmartContractTransaction => {
  const transaction = snapshotTronTransactionRecord(
    input.transaction,
    "Unsigned TRON transaction",
  );
  if (Object.prototype.hasOwnProperty.call(transaction, "signature")) {
    throw new Error(
      "Unsigned TRON bridge transaction must not already contain signatures.",
    );
  }
  assertNoUnsafeTronTransactionPayloadFields(
    transaction,
    "Unsigned TRON transaction",
  );
  const txId = readTronTransactionIdFromRecord(
    transaction,
    "Unsigned TRON transaction",
  );
  const calls = readTronTransactionSmartContractCalls(
    transaction,
    "Unsigned TRON transaction",
  );
  if (calls.length !== 1) {
    throw new Error(
      "Unsigned TRON bridge transaction must include exactly one smart-contract call.",
    );
  }
  const [call] = calls;
  const expectedOwnerPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.trigger.ownerAddress),
  );
  if (call.ownerPayload !== expectedOwnerPayload) {
    throw new Error(
      "Unsigned TRON bridge transaction owner does not match the connected wallet.",
    );
  }
  const expectedContractPayload = normalizeTronAddressToPayloadHex(
    input.trigger.contractAddress,
    "TRON bridge contract address",
  );
  if (call.contractPayload !== expectedContractPayload) {
    throw new Error(
      "Unsigned TRON bridge transaction contract does not match the requested bridge contract.",
    );
  }
  const expectedCallData = normalizeHexData(
    input.trigger.callData,
    "Requested TRON smart-contract call data",
  ).slice(2);
  if (call.dataHex !== expectedCallData) {
    throw new Error(
      "Unsigned TRON bridge transaction call data does not match the requested bridge action.",
    );
  }
  requireTronRawDataHexMatchesTransactionId(
    transaction,
    "Unsigned TRON transaction",
  );
  requireTronRawDataHexSmartContractBinding(
    transaction,
    "Unsigned TRON transaction",
    call,
  );
  return Object.freeze({
    transaction,
    txId,
  });
};

export const bindSignedTronTransactionForBroadcast = (input: {
  unsignedTransaction: Record<string, unknown>;
  signedTransaction: unknown;
  ownerAddress: string;
}): BoundTronSignedTransaction => {
  const unsignedTransaction = snapshotTronTransactionRecord(
    input.unsignedTransaction,
    "Unsigned TRON transaction",
  );
  const signedTransaction = snapshotTronTransactionRecord(
    input.signedTransaction,
    "Signed TRON transaction",
  );
  if (Object.prototype.hasOwnProperty.call(unsignedTransaction, "signature")) {
    throw new Error(
      "Unsigned TRON bridge transaction must not already contain signatures.",
    );
  }
  assertNoUnsafeTronTransactionPayloadFields(
    unsignedTransaction,
    "Unsigned TRON transaction",
  );
  assertNoUnsafeTronTransactionPayloadFields(
    signedTransaction,
    "Signed TRON transaction",
    { allowTopLevelSignature: true },
  );
  const unsignedTxId = readTronTransactionIdFromRecord(
    unsignedTransaction,
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
  requireSignedTronRawDataMatch(unsignedTransaction, signedTransaction);
  requireTronRawDataHexMatchesTransactionId(
    unsignedTransaction,
    "Unsigned TRON transaction",
  );
  requireTronRawDataHexMatchesTransactionId(
    signedTransaction,
    "Signed TRON transaction",
  );
  const signedCalls = readTronTransactionSmartContractCalls(
    signedTransaction,
    "Signed TRON transaction",
  );
  if (signedCalls.length !== 1) {
    throw new Error(
      "Signed TRON transaction must include exactly one smart-contract call.",
    );
  }
  requireTronRawDataHexSmartContractBinding(
    signedTransaction,
    "Signed TRON transaction",
    signedCalls[0],
  );
  if (!hasValidTronSignatureSet(signedTransaction)) {
    throw new Error("Signed TRON transaction must include wallet signatures.");
  }
  requireSignedTronSignatureOwnerMatch(signedTransaction, expectedOwnerPayload);
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

const readTronSolidBlockHashCandidate = (
  solidBlock: Record<string, unknown>,
): { key: string; value: string } => {
  for (const key of [
    "blockID",
    "blockId",
    "block_id",
    "hash",
    "blockHash",
    "block_hash",
  ]) {
    const value = readString(solidBlock, key);
    if (value) {
      return { key, value };
    }
  }
  return { key: "", value: "" };
};

const requireTronBlockIdHeightBinding = (
  blockId: string,
  solidBlockNumber: number,
): void => {
  const expectedPrefix = solidBlockNumber.toString(16).padStart(16, "0");
  const actualPrefix = blockId.slice(2, 18);
  if (actualPrefix !== expectedPrefix) {
    throw new Error(
      "TRON solid block ID does not encode the reported solid block number.",
    );
  }
};

export const bindTronFinalitySnapshot = (
  finalityInput: unknown,
): BoundTronFinalitySnapshot => {
  const finality = snapshotTronTransactionRecord(
    finalityInput,
    "TRON finality data",
  );
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
  const blockHashCandidate = readTronSolidBlockHashCandidate(solidBlock);
  const solidBlockHash = normalizeTronBlockHash(
    blockHashCandidate.value,
    "TRON solid block hash",
  );
  if (/^block_?id$/iu.test(blockHashCandidate.key)) {
    requireTronBlockIdHeightBinding(solidBlockHash, solidBlockNumber);
  }
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
  const hasHexPrefix = trimmed.toLowerCase().startsWith("0x");
  const normalized = hasHexPrefix ? trimmed.slice(2).toLowerCase() : trimmed.toLowerCase();
  if (!hasHexPrefix && (normalized.length === 0 || !/^[0-9a-f]+$/u.test(normalized))) {
    return trimmed;
  }
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
  ["burntotaira", "tairaxorburnstarted"].includes(
    readTronEventName(event)
      .replace(/[^a-z0-9]/giu, "")
      .toLowerCase(),
  );

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
      "TRON transaction events must include a TAIRA XOR burn bridge event.",
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

const requireTronSourceEventDigestBinding = (
  event: Record<string, unknown>,
  sourceEventDigest: string,
  input: TronSourceBridgeBindingInput,
): void => {
  bindTairaXorTronBurnStartedEvent({
    event,
    bridgeAddress: input.bridgeAddress,
    tronSender: input.tronSender,
    tairaRecipient: input.tairaRecipient,
    amount: bridgeDecimalToBaseUnits(input.amountDecimal),
    sourceEventDigest,
  });
};

const requireTronSourceEventRequestBinding = (
  event: Record<string, unknown>,
  input: Pick<
    TronSourceBridgeBindingInput,
    "tronSender" | "tairaRecipient" | "amountDecimal"
  >,
): void => {
  requireTronSourceEventSender(event, input.tronSender);
  requireTronSourceEventAmount(event, input.amountDecimal);
  requireTronSourceEventTairaRecipient(event, input.tairaRecipient);
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
  bridgeAddress: string;
  tronSender: string;
  tairaRecipient: string;
  amountDecimal: string;
}): BoundTronSourceData => {
  const txId = normalizeTronTxId(readRequiredText(input.txId, "txId"), "txId");
  const bindingInput = normalizeTronSourceBridgeBindingInput(input);
  const transaction = snapshotTronTransactionRecord(
    input.transaction,
    "TRON transaction",
  );
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

  const receipt = snapshotTronTransactionRecord(
    input.receipt,
    "TRON transaction receipt",
  );
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

  const events = snapshotTronTransactionRecord(
    input.events,
    "TRON transaction events",
  );
  const sourceEvent = readTronSourceEventDigestFromEvents(
    events,
    txId,
    bindingInput.bridgeAddress,
  );
  requireTronSourceEventReceiptBlockBinding(
    sourceEvent.event,
    receiptBlockNumber,
  );
  requireTronSourceEventRequestBinding(sourceEvent.event, bindingInput);
  requireTronSourceEventDigestBinding(
    sourceEvent.event,
    sourceEvent.digest,
    bindingInput,
  );
  requireTronRawDataHexMatchesTransactionId(transaction, "TRON transaction");
  requireTronSourceTransactionRequestBinding(transaction, bindingInput);

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
  const payload = readScalarText({ payload: variant.value }, "payload");
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(payload)) {
    return bytesToLowerHex(decodeTronBase58CheckAddress(payload));
  }
  return normalizeTronAddressPayloadHex(payload, label);
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
  return normalizeBundleTransferPayload(payload.value);
};

const readRequiredTransferScalar = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = readScalarText(record, key);
  if (!value) {
    throw new Error(`${label} is missing from the SCCP transfer payload.`);
  }
  return value;
};

const readTransferCodecId = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): number | null => {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  const codec = Number(readRequiredTransferScalar(record, key, label));
  if (!Number.isSafeInteger(codec) || codec < 0) {
    throw new Error(`${label} codec must be a safe non-negative integer.`);
  }
  return codec;
};

const readTransferTextField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];
  if (value === undefined || value === null) {
    throw new Error(`${label} is missing from the SCCP transfer payload.`);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return readCodecText(value, label);
  }
  const codec = readTransferCodecId(record, `${key}_codec`, label);
  if (codec !== null) {
    if (codec !== SCCP_CODEC_TEXT_UTF8) {
      throw new Error(`${label} must use the TextUtf8 SCCP codec.`);
    }
    return decodeEventBytesText(readRequiredTransferScalar(record, key, label), label);
  }
  return readRequiredTransferScalar(record, key, label);
};

const readTransferTronAddressField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];
  if (value === undefined || value === null) {
    throw new Error(`${label} is missing from the SCCP transfer payload.`);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return encodeTronBase58CheckAddress(
      hexDataToBytes(readCodecTronPayload(value, label), label),
    );
  }
  const codec = readTransferCodecId(record, `${key}_codec`, label);
  if (codec !== null) {
    if (codec !== SCCP_CODEC_TRON_BASE58CHECK) {
      throw new Error(`${label} must use the TronBase58Check SCCP codec.`);
    }
    return normalizeTronAddress(
      decodeEventBytesText(readRequiredTransferScalar(record, key, label), label),
    );
  }
  const address = readRequiredTransferScalar(record, key, label);
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(address)) {
    return normalizeTronAddress(address);
  }
  return encodeTronBase58CheckAddress(
    hexDataToBytes(normalizeTronAddressPayloadHex(address, label), label),
  );
};

const normalizeBundleTransferPayload = (
  transfer: Record<string, unknown>,
): Record<string, unknown> => ({
  version: readRequiredTransferScalar(transfer, "version", "Bundle version"),
  source_domain: readRequiredTransferScalar(
    transfer,
    "source_domain",
    "Bundle source domain",
  ),
  dest_domain: readRequiredTransferScalar(
    transfer,
    "dest_domain",
    "Bundle destination domain",
  ),
  nonce: readRequiredTransferScalar(transfer, "nonce", "Bundle nonce"),
  asset_home_domain: readRequiredTransferScalar(
    transfer,
    "asset_home_domain",
    "Bundle asset home domain",
  ),
  asset_id_codec: SCCP_CODEC_TEXT_UTF8,
  asset_id: readTransferTextField(transfer, "asset_id", "Bundle asset key"),
  amount: readRequiredTransferScalar(transfer, "amount", "Bundle amount"),
  sender_codec: SCCP_CODEC_TEXT_UTF8,
  sender: readTransferTextField(transfer, "sender", "Bundle sender"),
  recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
  recipient: readTransferTronAddressField(
    transfer,
    "recipient",
    "Bundle recipient",
  ),
  route_id_codec: SCCP_CODEC_TEXT_UTF8,
  route_id: readTransferTextField(transfer, "route_id", "Bundle route id"),
});

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

const requireOptionalDestinationBindingHashMatch = (
  record: Record<string, unknown>,
  expectedBindingHash: string,
  label: string,
): void => {
  const actualBindingHash = readFirstString(
    record,
    "destinationBindingHash",
    "destination_binding_hash",
    "destinationBindingHashHex",
    "destination_binding_hash_hex",
  );
  if (!actualBindingHash) {
    return;
  }
  if (
    normalizeHex32(actualBindingHash, `${label} destination binding hash`) !==
    expectedBindingHash
  ) {
    throw new Error(
      `${label} destination binding hash does not match the TRON route manifest.`,
    );
  }
};

const readSccpPlatformPayloadValue = (
  record: Record<string, unknown>,
): Record<string, unknown> | null => {
  const submissionPackage =
    readRecord(record, "submissionPackage") ??
    readRecord(record, "submission_package");
  const platformPayload =
    readRecord(submissionPackage ?? {}, "platformPayload") ??
    readRecord(submissionPackage ?? {}, "platform_payload") ??
    readRecord(record, "platformPayload") ??
    readRecord(record, "platform_payload");
  return (
    readRecord(platformPayload ?? {}, "value") ??
    (platformPayload ? platformPayload : null)
  );
};

const readSccpPlatformDestinationBinding = (
  record: Record<string, unknown>,
): Record<string, unknown> | null => {
  const platformValue = readSccpPlatformPayloadValue(record);
  return (
    readRecord(platformValue ?? {}, "destinationBinding") ??
    readRecord(platformValue ?? {}, "destination_binding")
  );
};

const readDestinationBindingInput = (
  manifest: Record<string, unknown>,
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): TronSccpDestinationBindingInput => {
  const selectedNetwork = readManifestTronNetworkKey(manifest) ?? tronNetwork;
  const proofMaterial = readSccpTronProofMaterial(manifest, selectedNetwork);
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
  const sourceDomain =
    readNumber(manifestBinding ?? {}, "sourceDomain") ??
    readNumber(manifestBinding ?? {}, "source_domain") ??
    readNumber(rollout ?? {}, "sourceDomain") ??
    readNumber(rollout ?? {}, "source_domain");
  const targetDomain =
    readNumber(manifestBinding ?? {}, "targetDomain") ??
    readNumber(manifestBinding ?? {}, "target_domain") ??
    readNumber(rollout ?? {}, "targetDomain") ??
    readNumber(rollout ?? {}, "target_domain");
  if (sourceDomain !== null && sourceDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "The TRON SCCP destination binding source domain is wrong.",
    );
  }
  if (targetDomain !== null && targetDomain !== SCCP_TRON_DOMAIN) {
    throw new Error(
      "The TRON SCCP destination binding target domain is wrong.",
    );
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

export const buildTairaXorMessageProofJobQueryMaterial = (input: {
  manifest: Record<string, unknown> | null | undefined;
  messageBundle: Record<string, unknown> | null | undefined;
  messageId?: string;
  tronNetwork?: unknown;
}): TronSccpProofQueryMaterial => {
  const manifest = requireRecord(input.manifest, "SCCP TRON manifest");
  const bundle = requireRecord(input.messageBundle, "SCCP message bundle");
  const tronNetwork = input.tronNetwork ?? SCCP_TRON_NETWORK.key;
  const proofMaterial = readSccpTronProofMaterial(manifest, tronNetwork);
  if (!proofMaterial) {
    throw new Error(
      "The TRON SCCP verifier rollout proof material is incomplete.",
    );
  }
  readDestinationBindingInput(manifest, tronNetwork);

  const commitment = requireRecord(
    bundle.commitment,
    "SCCP message commitment",
  );
  const messageId = normalizeSccpMessageId(
    readFirstString(commitment, "messageId", "message_id"),
  );
  if (input.messageId) {
    const expectedMessageId = normalizeSccpMessageId(input.messageId);
    if (messageId !== expectedMessageId) {
      throw new Error(
        "SCCP message bundle does not match the requested message id.",
      );
    }
  }
  if (
    Number(commitment.targetDomain ?? commitment.target_domain) !==
    SCCP_TRON_DOMAIN
  ) {
    throw new Error("SCCP message bundle must target TRON.");
  }
  const commitmentRoot = normalizeHex32(
    readFirstString(bundle, "commitmentRoot", "commitment_root"),
    "SCCP commitment root",
  );

  return {
    ...proofMaterial,
    proofBytesHex: buildSccpGroth16JobQueryProofBytesHex({
      messageId,
      commitmentRoot,
    }),
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
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const expectedMessageId = normalizeHex32(input.messageId, "messageId");
  const amountBaseUnits = bridgeDecimalToBaseUnits(input.amountDecimal);
  const expectedRecipientPayload = bytesToLowerHex(
    decodeTronBase58CheckAddress(input.tronRecipient),
  );
  const destinationBinding = readDestinationBindingInput(manifest);
  const publicInputs = requireRecord(job.publicInputs, "SCCP job publicInputs");
  const destinationBindingHash = normalizeHex32(
    destinationBinding.bindingHash ?? "",
    "TRON destination binding hash",
  );
  const platformValue = readSccpPlatformPayloadValue(job);
  const statementHash = normalizeHex32(
    readFirstString(platformValue, "statementHash", "statement_hash"),
    "SCCP proof job statement hash",
  );
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
  requireOptionalDestinationBindingHashMatch(
    publicInputs,
    destinationBindingHash,
    "SCCP proof job public inputs",
  );

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
  if (
    bytesToLowerHex(
      decodeTronBase58CheckAddress(
        readScalarText(bundleTransfer, "recipient"),
      ),
    ) !== expectedRecipientPayload
  ) {
    throw new Error(
      "Bundle recipient must match the selected TAIRA/TRON route.",
    );
  }
  const canonicalPayloadBytes = canonicalSccpTransferPayloadBytes(
    bundleTransfer as unknown as SccpTransferPayload,
  );
  const canonicalPayloadHex = bytesToLowerHex(canonicalPayloadBytes);
  const canonicalPayloadEnvelopeBytes = canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: bundleTransfer,
  });
  if (
    sccpTransferMessageId(bundleTransfer as unknown as SccpTransferPayload) !==
    expectedMessageId
  ) {
    throw new Error(
      "SCCP message id does not match the canonical transfer payload.",
    );
  }
  if (sccpPayloadHash(canonicalPayloadEnvelopeBytes) !== payloadHash) {
    throw new Error(
      "SCCP proof job payload hash does not match the canonical SCCP payload envelope.",
    );
  }

  const platformDestinationBinding = readSccpPlatformDestinationBinding(job);
  const jobDestinationBinding =
    readRecord(job, "destinationBinding") ??
    readRecord(job, "destination_binding");
  const jobBindingHash = readFirstString(
    platformDestinationBinding ?? jobDestinationBinding,
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

  const normalizedBundle = {
    ...bundle,
    payload: {
      kind: "Transfer",
      value: bundleTransfer,
    },
  };

  return {
    witness: {
      publicInputs,
      bundleBytes: canonicalSccpMessageProofBundleBytes(normalizedBundle),
      sourceProofBytes: [],
      sourceDomain: SCCP_SORA_DOMAIN,
      destinationBinding,
      statementHash,
      destinationBindingHash,
    },
    destinationBinding,
    messageBundle: normalizedBundle,
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
  const destinationBinding = readDestinationBindingInput(manifest);
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
  const destinationBindingHash = normalizeHex32(
    destinationBinding.bindingHash ?? "",
    "TRON destination binding hash",
  );
  if (
    Number(publicInputs.targetDomain ?? publicInputs.target_domain) !==
    SCCP_TRON_DOMAIN
  ) {
    throw new Error("TRON SCCP proof package must target TRON.");
  }
  requireOptionalDestinationBindingHashMatch(
    publicInputs,
    destinationBindingHash,
    "TRON SCCP proof package public inputs",
  );
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
      endpoint: readSccpTronGatewayEndpoint(manifest),
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
    ...(contractAlias ? { contract_alias: contractAlias } : {}),
    ...(!contractAlias && contractAddress
      ? { contract_address: contractAddress }
      : {}),
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

const utf8TextEncoder = new TextEncoder();

const readFirstValue = (
  record: Record<string, unknown>,
  ...keys: string[]
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
};

const readRequiredSubmitInteger = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): number => {
  const value = readFirstValue(record, ...keys);
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a safe non-negative integer.`);
  }
  return normalized;
};

const readRequiredSubmitText = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string => {
  for (const key of keys) {
    const text = readScalarText(record, key);
    if (text) {
      return text;
    }
  }
  throw new Error(`${label} is required.`);
};

const readSubmitByteText = (value: unknown, label: string): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return readRequiredText(String(value), label);
  }
  const record = requireRecord(value, label);
  const direct = readScalarText(record, "value") || readScalarText(record, "payload");
  if (direct) {
    return direct;
  }
  const variant = readRecordVariant(record, label);
  return (
    readScalarText(variant.value, "value") ||
    readScalarText(variant.value, "payload") ||
    (() => {
      throw new Error(`${label} is required.`);
    })()
  );
};

const utf8TextToSubmitHex = (value: unknown, label: string): string =>
  bytesToLowerHex(utf8TextEncoder.encode(readSubmitByteText(value, label))).slice(2);

const normalizeSubmitHex32 = (value: string, label: string): string =>
  normalizeHex32(value, label).slice(2);

const normalizeSubmitHexData = (value: string, label: string): string =>
  normalizeHexData(value, label).slice(2);

const serializeSccpMerkleProofForSubmit = (
  value: unknown,
): Record<string, unknown> => {
  const proof = requireRecord(value, "messageBundle.merkle_proof");
  const steps = proof.steps;
  if (!Array.isArray(steps)) {
    throw new Error("messageBundle.merkle_proof.steps must be an array.");
  }
  return {
    steps: steps.map((entry, index) => {
      const step = requireRecord(
        entry,
        `messageBundle.merkle_proof.steps[${index}]`,
      );
      return {
        sibling_hash: normalizeSubmitHex32(
          readFirstString(step, "sibling_hash", "siblingHash"),
          `messageBundle.merkle_proof.steps[${index}].sibling_hash`,
        ),
        sibling_is_left: Boolean(
          readFirstValue(step, "sibling_is_left", "siblingIsLeft"),
        ),
      };
    }),
  };
};

const serializeSccpTransferPayloadForSubmit = (
  value: Record<string, unknown>,
): Record<string, unknown> => ({
  version: readRequiredSubmitInteger(value, ["version"], "payload.version"),
  source_domain: readRequiredSubmitInteger(
    value,
    ["source_domain", "sourceDomain"],
    "payload.source_domain",
  ),
  dest_domain: readRequiredSubmitInteger(
    value,
    ["dest_domain", "destDomain"],
    "payload.dest_domain",
  ),
  nonce: readRequiredSubmitText(value, ["nonce"], "payload.nonce"),
  asset_home_domain: readRequiredSubmitInteger(
    value,
    ["asset_home_domain", "assetHomeDomain"],
    "payload.asset_home_domain",
  ),
  asset_id_codec: readRequiredSubmitInteger(
    value,
    ["asset_id_codec", "assetIdCodec"],
    "payload.asset_id_codec",
  ),
  asset_id: utf8TextToSubmitHex(
    readFirstValue(value, "asset_id", "assetId"),
    "payload.asset_id",
  ),
  amount: readRequiredSubmitText(value, ["amount"], "payload.amount"),
  sender_codec: readRequiredSubmitInteger(
    value,
    ["sender_codec", "senderCodec"],
    "payload.sender_codec",
  ),
  sender: utf8TextToSubmitHex(
    readFirstValue(value, "sender"),
    "payload.sender",
  ),
  recipient_codec: readRequiredSubmitInteger(
    value,
    ["recipient_codec", "recipientCodec"],
    "payload.recipient_codec",
  ),
  recipient: utf8TextToSubmitHex(
    readFirstValue(value, "recipient"),
    "payload.recipient",
  ),
  route_id_codec: readRequiredSubmitInteger(
    value,
    ["route_id_codec", "routeIdCodec"],
    "payload.route_id_codec",
  ),
  route_id: utf8TextToSubmitHex(
    readFirstValue(value, "route_id", "routeId"),
    "payload.route_id",
  ),
});

export const buildSccpMessageBundleSubmitPayload = (
  messageBundle: Record<string, unknown>,
): Record<string, unknown> => {
  const bundle = requireRecord(messageBundle, "messageBundle");
  const commitment = requireRecord(
    readFirstValue(bundle, "commitment"),
    "messageBundle.commitment",
  );
  const payload = readRecordVariant(
    readFirstValue(bundle, "payload"),
    "messageBundle.payload",
  );
  if (payload.kind !== "Transfer") {
    throw new Error("messageBundle.payload must be a Transfer.");
  }
  return {
    version: readRequiredSubmitInteger(bundle, ["version"], "messageBundle.version"),
    commitment_root: normalizeSubmitHex32(
      readFirstString(bundle, "commitment_root", "commitmentRoot"),
      "messageBundle.commitment_root",
    ),
    commitment: {
      version: readRequiredSubmitInteger(
        commitment,
        ["version"],
        "messageBundle.commitment.version",
      ),
      kind: readRequiredSubmitText(
        commitment,
        ["kind"],
        "messageBundle.commitment.kind",
      ),
      target_domain: readRequiredSubmitInteger(
        commitment,
        ["target_domain", "targetDomain"],
        "messageBundle.commitment.target_domain",
      ),
      message_id: normalizeSubmitHex32(
        readFirstString(commitment, "message_id", "messageId"),
        "messageBundle.commitment.message_id",
      ),
      payload_hash: normalizeSubmitHex32(
        readFirstString(commitment, "payload_hash", "payloadHash"),
        "messageBundle.commitment.payload_hash",
      ),
    },
    merkle_proof: serializeSccpMerkleProofForSubmit(
      readFirstValue(bundle, "merkle_proof", "merkleProof"),
    ),
    payload: {
      Transfer: serializeSccpTransferPayloadForSubmit(payload.value),
    },
    finality_proof: normalizeSubmitHexData(
      readFirstString(bundle, "finality_proof", "finalityProof"),
      "messageBundle.finality_proof",
    ),
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

const normalizeManifestTronNetworkKey = (
  value: string,
): SccpTronNetworkKey | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "tron") {
    return "mainnet";
  }
  try {
    return normalizeSccpTronNetworkKey(normalized);
  } catch (_error) {
    return null;
  }
};

const readManifestTronNetworkKey = (
  manifest: Record<string, unknown>,
): SccpTronNetworkKey | null => {
  for (const value of [
    readString(manifest, "tronNetwork"),
    readString(manifest, "tron_network"),
    readString(manifest, "network"),
    readString(manifest, "chain"),
  ]) {
    const key = normalizeManifestTronNetworkKey(value);
    if (key) {
      return key;
    }
  }
  return null;
};

export const readSccpTronGatewayEndpoint = (
  manifest: Record<string, unknown> | null | undefined,
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): string => {
  const declaredNetwork =
    manifest && typeof manifest === "object"
      ? readManifestTronNetworkKey(manifest)
      : null;
  const profile = declaredNetwork
    ? SCCP_TRON_NETWORK_PROFILES[declaredNetwork]
    : resolveSccpTronNetworkProfile(tronNetwork);
  return profile.rpcUrl;
};

const manifestMatchesTronNetworkProfile = (
  manifest: Record<string, unknown>,
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): boolean => {
  const profile = resolveSccpTronNetworkProfile(tronNetwork);
  const declaredNetwork = readManifestTronNetworkKey(manifest);
  if (declaredNetwork) {
    return declaredNetwork === profile.key;
  }
  if (readSccpTronProofMaterial(manifest, profile.key)) {
    return true;
  }
  return profile.key === "mainnet";
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
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): Record<string, unknown> | null =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsTron(manifest) &&
      manifestMatchesRoute(manifest) &&
      manifestMatchesTronNetworkProfile(manifest, tronNetwork),
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

const hasUnsafeSccpCapabilityPathCharacter = (path: string): boolean => {
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (
      code <= 0x20 ||
      code === 0x7f ||
      character === "\\" ||
      character === "?" ||
      character === "#"
    ) {
      return true;
    }
  }
  return false;
};

const normalizeSccpCapabilitySubmitPath = (
  value: string,
  label: string,
  kind: "proof" | "message",
): string => {
  const path = value.trim();
  if (!path) {
    throw new Error(`${label} is missing.`);
  }
  if (hasUnsafeSccpCapabilityPathCharacter(path)) {
    throw new Error(
      `${label} must be a same-endpoint absolute path without whitespace, query strings, fragments, or backslashes.`,
    );
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`${label} must be a same-endpoint absolute path.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(path, "https://taira.sora.org");
  } catch (error) {
    throw new Error(
      `${label} is not a valid endpoint path: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (parsed.origin !== "https://taira.sora.org" || parsed.pathname !== path) {
    throw new Error(`${label} must not escape the active Torii endpoint.`);
  }
  const decodedSegments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch (_error) {
        throw new Error(`${label} contains invalid percent encoding.`);
      }
    });
  if (decodedSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label} must not contain path traversal segments.`);
  }
  if (decodedSegments.some((segment) => /[\\/]/u.test(segment))) {
    throw new Error(`${label} must not contain encoded path separators.`);
  }
  const normalizedPath = decodedSegments.join("/");
  if (!/(?:^|\/)(?:bridge|sccp)(?:\/|$)/u.test(normalizedPath)) {
    throw new Error(`${label} must target an SCCP or bridge endpoint.`);
  }
  if (kind === "proof" && !/(?:^|\/)proofs?(?:\/|$)/u.test(normalizedPath)) {
    throw new Error(`${label} must target a proof submission endpoint.`);
  }
  if (
    kind === "message" &&
    !/(?:^|\/)messages?(?:\/|$)/u.test(normalizedPath)
  ) {
    throw new Error(
      `${label} must target a bridge-message submission endpoint.`,
    );
  }
  return path;
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

const hasPostDeployLiveEvidence = (
  manifest: Record<string, unknown>,
): boolean =>
  Boolean(
    readFirstRecord(
      manifest,
      "postDeployLiveEvidence",
      "post_deploy_live_evidence",
    ),
  );

const validatePostDeployLiveEvidence = (
  manifest: Record<string, unknown>,
): void => {
  const evidence = readFirstRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  if (!evidence) {
    throw new Error("The TRON SCCP post-deploy live evidence is missing.");
  }
  const fullTomlReady =
    evidence.fullTomlReady ?? evidence.full_toml_ready ?? false;
  if (fullTomlReady !== true) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }

  for (const [value, label] of [
    [
      readFirstString(
        evidence,
        "sourceBridgeConfigHash",
        "source_bridge_config_hash",
      ),
      "postDeployLiveEvidence.sourceBridgeConfigHash",
    ],
    [
      readFirstString(
        evidence,
        "sourceEventTransactionId",
        "source_event_transaction_id",
      ),
      "postDeployLiveEvidence.sourceEventTransactionId",
    ],
    [
      readFirstString(
        evidence,
        "routeCanaryEvidenceHash",
        "route_canary_evidence_hash",
      ),
      "postDeployLiveEvidence.routeCanaryEvidenceHash",
    ],
    [
      readFirstString(
        evidence,
        "routeCanaryTransactionId",
        "route_canary_transaction_id",
      ),
      "postDeployLiveEvidence.routeCanaryTransactionId",
    ],
  ] as const) {
    normalizeNonZeroHex32Loose(value, label);
  }

  const offlineFullTomlSha256 = readFirstString(
    evidence,
    "offlineFullTomlSha256",
    "offline_full_toml_sha256",
  );
  if (offlineFullTomlSha256) {
    normalizeNonZeroHex32Loose(
      offlineFullTomlSha256,
      "postDeployLiveEvidence.offlineFullTomlSha256",
    );
  }
};

const manifestAllowsSelectedTestnetRoute = (
  manifest: Record<string, unknown>,
  profile: SccpTronNetworkProfile,
  productionReady: { ready: boolean; invalid: boolean },
): boolean =>
  profile.key !== "mainnet" &&
  !productionReady.ready &&
  !productionReady.invalid &&
  readManifestTronNetworkKey(manifest) === profile.key &&
  Boolean(readSccpTronProofMaterial(manifest, profile.key));

export const resolveSccpRouteReadiness = (input: {
  connection: SccpNetworkSnapshot;
  capabilities?: Record<string, unknown> | null;
  manifestSet?: Record<string, unknown> | null;
  tronNetwork?: unknown;
}): SccpRouteReadiness => {
  const reasons: string[] = [];
  const tronProfile = resolveSccpTronNetworkProfile(
    input.tronNetwork ?? SCCP_TRON_NETWORK.key,
  );
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
  } else {
    for (const [path, label, kind] of [
      [proofSubmitPath, "SCCP proof submit path", "proof"] as const,
      [
        messageSubmitPath,
        "SCCP bridge-message submit path",
        "message",
      ] as const,
    ]) {
      try {
        normalizeSccpCapabilitySubmitPath(path, label, kind);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? error.message
            : "This Torii endpoint exposes unsafe SCCP submit endpoints.",
        );
      }
    }
  }

  const tronManifest = pickTronSccpManifest(input.manifestSet, tronProfile.key);
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
    const allowSelectedTestnetRoute = manifestAllowsSelectedTestnetRoute(
      tronManifest,
      tronProfile,
      productionReady,
    );
    if (productionReady.invalid) {
      reasons.push("The TRON SCCP route production-ready flag is invalid.");
    } else if (!productionReady.ready && !allowSelectedTestnetRoute) {
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
    const sourceBridgeAddress = readSccpTronSourceBridgeAddress(tronManifest);
    if (!sourceBridgeAddress) {
      reasons.push("The TRON source bridge deployment address is missing.");
    } else {
      try {
        normalizeTronAddress(sourceBridgeAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The TRON source bridge deployment address is invalid: ${error.message}`
            : "The TRON source bridge deployment address is invalid.",
        );
      }
    }
    const verifierAddress = readSccpTronVerifierAddress(tronManifest);
    if (!verifierAddress) {
      reasons.push("The TRON verifier deployment address is missing.");
    } else {
      try {
        normalizeTronAddress(verifierAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The TRON verifier deployment address is invalid: ${error.message}`
            : "The TRON verifier deployment address is invalid.",
        );
      }
    }
    try {
      readDestinationBindingInput(tronManifest, tronProfile.key);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The TRON SCCP verifier rollout proof material is incomplete.",
      );
    }
    if (productionReady.ready || hasPostDeployLiveEvidence(tronManifest)) {
      try {
        validatePostDeployLiveEvidence(tronManifest);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? error.message
            : "The TRON SCCP post-deploy live evidence is incomplete.",
        );
      }
    }
    const burnRecordMaterial =
      readSccpTairaBurnRecordMaterialResult(tronManifest);
    if (!burnRecordMaterial.material) {
      reasons.push(
        burnRecordMaterial.reason ??
          "The TAIRA burn-record ZK contract material is missing.",
      );
    }
    const distinctDeploymentAddresses = [
      bridgeAddress,
      tokenAddress,
      sourceBridgeAddress,
      readSccpTronVerifierAddress(tronManifest),
    ]
      .map((address) => {
        try {
          return address ? normalizeTronAddress(address) : "";
        } catch (_error) {
          return "";
        }
      })
      .filter(Boolean);
    if (
      distinctDeploymentAddresses.length === 4 &&
      new Set(distinctDeploymentAddresses).size !== 4
    ) {
      reasons.push("TRON deployment contract addresses must be distinct.");
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
  chainId = SCCP_TRON_NETWORK.caipChainId,
): WalletConnectSessionSnapshot => ({
  topic,
  address: normalizeTronAddress(address),
  chainId,
  namespace: WALLETCONNECT_TRON_NAMESPACE,
  methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
  connectedAtMs: Date.now(),
});

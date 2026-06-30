import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  buildTairaXorBscSccpRecordDescriptor,
  buildTairaXorBscSccpBurnRecordZkIvmRequest,
  buildTairaXorSccpRecordDescriptor,
  buildTairaXorSccpBurnRecordZkIvmRequest,
  canonicalSccpTransferPayloadBytes,
  canonicalSccpPayloadEnvelopeBytes,
  canonicalSccpMessageProofBundleBytes,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
  tronSccpDestinationBinding,
  SCCP_TAIRA_BSC_XOR_ROUTE_ID_V1,
  SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1,
  SCCP_TAIRA_XOR_ASSET_KEY_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  bindTairaXorBscToTairaSourceProofPackage,
  bindTairaXorTronBurnStartedEvent,
  bindTairaXorTronToTairaSourceProofPackage,
  evmSccpDestinationBinding,
  parseTronTriggerSmartContractRawData,
  SCCP_CODEC_EVM_HEX,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  tairaXorBurnSourceEventDigest,
  tairaXorBscBurnSourceEventDigest,
  tairaXorBscBurnToTairaAccountCallData,
  tairaXorBurnToTairaAccountCallData,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1,
  tairaXorTransferPayloadHash,
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import { normalizeSccpPackageOrRemoteModuleUrl } from "@/utils/sccpProverUrl";
import type {
  TairaXorBscSccpBurnRecordZkIvmRequest,
  TairaXorBscSccpRecordDescriptor,
  TairaXorSccpBurnRecordZkIvmRequest,
  TairaXorSccpRecordDescriptor,
  SccpTransferPayload,
  EvmSccpDestinationBindingInput,
  EvmSccpProofRequestInput,
  TronSccpDestinationBindingInput,
  TronSccpProofRequestInput,
} from "@iroha/iroha-js/sccp";
import { TAIRA_CHAIN_ID, TAIRA_NETWORK_PREFIX } from "@/constants/chains";
import { snapshotSccpDataValue } from "@/utils/sccpDataSnapshot";
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
export const SCCP_BSC_DOMAIN = 2;
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_XOR_ROUTE_ID = SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1;
export const SCCP_BSC_XOR_ROUTE_ID = SCCP_TAIRA_BSC_XOR_ROUTE_ID_V1;
export const SCCP_XOR_ASSET_KEY = SCCP_TAIRA_XOR_ASSET_KEY_V1;
export const SCCP_TRON_TOKEN_SYMBOL = "TairaXOR";
export const SCCP_BSC_TOKEN_SYMBOL = "TairaXOR";
export const SCCP_XOR_DECIMALS = 18;
export const SCCP_TAIRA_XOR_DECIMALS = 9;
export const SCCP_EVM_XOR_DECIMALS = 18;
export const SCCP_BSC_TAIRA_TO_TOKEN_SCALE_FACTOR = "1000000000";
export const SCCP_TRON_DEFAULT_FEE_LIMIT = 250_000_000;
export const BSC_TESTNET_CAIP_CHAIN_ID = "eip155:97";
export const BSC_TESTNET_CHAIN_ID_HEX = "0x61";
export const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
export const BSC_TESTNET_RPC_URL = "https://bsc-testnet-rpc.publicnode.com";
export const BSC_TESTNET_EXPLORER_URL = "https://testnet.bscscan.com";
export const BSC_MAINNET_CAIP_CHAIN_ID = "eip155:56";
export const BSC_MAINNET_CHAIN_ID_HEX = "0x38";
export const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
export const BSC_MAINNET_RPC_URL = "https://bsc-dataseed.bnbchain.org";
export const BSC_MAINNET_EXPLORER_URL = "https://bscscan.com";
export const SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES = new Set<string>([
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
]);

export {
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  tairaXorBurnSourceEventDigest,
  tairaXorBscBurnSourceEventDigest,
  tairaXorBscBurnToTairaAccountCallData,
  tairaXorBurnToTairaAccountCallData,
  tairaXorBurnToTairaCallData,
  tairaXorFinalizeFromTairaCallData,
  tairaXorTransferPayloadHash,
};

export const evmFunctionSelector = (signature: string): string => {
  const normalizedSignature = String(signature ?? "").trim();
  if (
    !normalizedSignature ||
    /\s/u.test(normalizedSignature) ||
    !/^[$A-Z_a-z][$\w]*\(.*\)$/u.test(normalizedSignature)
  ) {
    throw new Error("EVM function signature must be canonical text.");
  }
  return `0x${Array.from(
    keccak_256(new TextEncoder().encode(normalizedSignature)).slice(0, 4),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
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
const SCCP_TRON_TRANSACTION_SECRET_INPUT_ERROR =
  "TRON bridge transaction must not contain secret-like material before broadcast.";
const SCCP_TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR =
  "TRON bridge transaction must not contain nested signatures or signing helper payloads before broadcast.";
const SCCP_MANIFEST_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;

export type SccpCounterpartyKey = "tron" | "bsc";

export type SccpBridgeDirection =
  | "taira-to-tron"
  | "tron-to-taira"
  | "taira-to-bsc"
  | "bsc-to-taira";

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

export type SccpBscNetworkKey = "testnet" | "mainnet";

export type SccpBscNetworkProfile = {
  key: SccpBscNetworkKey;
  label: string;
  caipChainId: `eip155:${number}`;
  chainIdHex: `0x${string}`;
  networkIdHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
};

export const SCCP_BSC_NETWORK_PROFILES = {
  testnet: {
    key: "testnet",
    label: "BSC Testnet",
    caipChainId: BSC_TESTNET_CAIP_CHAIN_ID,
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    rpcUrl: BSC_TESTNET_RPC_URL,
    explorerUrl: BSC_TESTNET_EXPLORER_URL,
  },
  mainnet: {
    key: "mainnet",
    label: "BSC Mainnet",
    caipChainId: BSC_MAINNET_CAIP_CHAIN_ID,
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    rpcUrl: BSC_MAINNET_RPC_URL,
    explorerUrl: BSC_MAINNET_EXPLORER_URL,
  },
} satisfies Record<SccpBscNetworkKey, SccpBscNetworkProfile>;

export const normalizeSccpBscNetworkKey = (
  value: unknown,
): SccpBscNetworkKey => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !normalized ||
    normalized === "testnet" ||
    normalized === "bsc-testnet" ||
    normalized === "chapel" ||
    normalized === "bsc-chapel"
  ) {
    return "testnet";
  }
  if (
    normalized === "mainnet" ||
    normalized === "bsc-mainnet" ||
    normalized === "bnb-mainnet" ||
    normalized === "bsc"
  ) {
    return "mainnet";
  }
  throw new Error("SCCP BSC network must be mainnet or testnet.");
};

export const resolveSccpBscNetworkProfile = (
  value: unknown,
): SccpBscNetworkProfile =>
  SCCP_BSC_NETWORK_PROFILES[normalizeSccpBscNetworkKey(value)];

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
  import.meta.env.VITE_SCCP_TRON_NETWORK || "mainnet",
);

export const SCCP_BSC_NETWORK = resolveSccpBscNetworkProfile(
  import.meta.env.VITE_SCCP_BSC_NETWORK || "testnet",
);

export type SccpRouteConfig = {
  id: string;
  assetKey: string;
  label: string;
  localDomain: number;
  counterparty: SccpCounterpartyKey;
  counterpartyDomain: number;
  caipChainId: string;
  networkIdHex: string;
  explorerUrl?: string;
  rpcUrl?: string;
  tokenSymbol: string;
  tronDomain?: number;
  tronChainId?: string;
  tronNetworkIdHex?: string;
};

export const SCCP_XOR_ROUTE: SccpRouteConfig = {
  id: SCCP_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  label: "XOR / TairaXOR",
  localDomain: SCCP_SORA_DOMAIN,
  counterparty: "tron",
  counterpartyDomain: SCCP_TRON_DOMAIN,
  caipChainId: SCCP_TRON_NETWORK.caipChainId,
  networkIdHex: SCCP_TRON_NETWORK.networkIdHex,
  explorerUrl: SCCP_TRON_NETWORK.tronscanUrl,
  rpcUrl: SCCP_TRON_NETWORK.rpcUrl,
  tokenSymbol: SCCP_TRON_TOKEN_SYMBOL,
  tronDomain: SCCP_TRON_DOMAIN,
  tronChainId: SCCP_TRON_NETWORK.caipChainId,
  tronNetworkIdHex: SCCP_TRON_NETWORK.networkIdHex,
};

export const SCCP_BSC_XOR_ROUTE: SccpRouteConfig = {
  id: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  label: "XOR / TairaXOR",
  localDomain: SCCP_SORA_DOMAIN,
  counterparty: "bsc",
  counterpartyDomain: SCCP_BSC_DOMAIN,
  caipChainId: SCCP_BSC_NETWORK.caipChainId,
  networkIdHex: SCCP_BSC_NETWORK.networkIdHex,
  explorerUrl: SCCP_BSC_NETWORK.explorerUrl,
  rpcUrl: SCCP_BSC_NETWORK.rpcUrl,
  tokenSymbol: SCCP_BSC_TOKEN_SYMBOL,
};

export const SCCP_ROUTE_PROFILES = {
  tron: SCCP_XOR_ROUTE,
  bsc: SCCP_BSC_XOR_ROUTE,
} satisfies Record<SccpCounterpartyKey, SccpRouteConfig>;

export const normalizeSccpCounterpartyKey = (
  value: unknown,
): SccpCounterpartyKey => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "tron") {
    return "tron";
  }
  if (
    normalized === "bsc" ||
    normalized === "bsc-testnet" ||
    normalized === "bsc-mainnet" ||
    normalized === "bnb" ||
    normalized === "bnb-testnet" ||
    normalized === "bnb-mainnet" ||
    normalized === "chapel"
  ) {
    return "bsc";
  }
  throw new Error("SCCP counterparty must be TRON or BSC.");
};

export const resolveSccpRouteProfile = (value: unknown): SccpRouteConfig =>
  SCCP_ROUTE_PROFILES[normalizeSccpCounterpartyKey(value)];

export type SccpNetworkSnapshot = {
  chainId?: string | null;
  networkPrefix?: number | string | null;
};

export type SccpRouteReadiness = {
  ready: boolean;
  status: "ready" | "disabled" | "unavailable" | "incomplete";
  reasons: string[];
  counterparty: SccpCounterpartyKey;
  manifest: Record<string, unknown> | null;
  tronManifest: Record<string, unknown> | null;
  bscManifest: Record<string, unknown> | null;
};

export type WalletConnectSessionSnapshot = {
  topic: string | null;
  address: string | null;
  chainId: string;
  namespace: typeof WALLETCONNECT_TRON_NAMESPACE | "eip155";
  methodVersion: typeof WALLETCONNECT_TRON_METHOD_VERSION | "eip155-v1";
  connectedAtMs: number;
};

export type BscSccpProofMaterial = {
  networkIdHex: string;
  verifierAddressHex: string;
  bridgeAddressHex: string;
  verifierCodeHashHex: string;
  verifierKeyHashHex: string;
  expectedDestinationBindingHashHex: string;
};

export type BscSccpProofBinding = {
  witness: EvmSccpProofRequestInput;
  destinationBinding: EvmSccpDestinationBindingInput;
  messageBundle: Record<string, unknown>;
  canonicalPayloadHex: string;
  amountBaseUnits: string;
  messageId: string;
  payloadHash: string;
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

export type BoundBscSourceData = {
  txId: string;
  transaction: Record<string, unknown> | null;
  receipt: Record<string, unknown>;
  proofReceipt: Record<string, unknown>;
  block: Record<string, unknown> | null;
  blockReceipts: Record<string, unknown>[] | null;
  indexedLogs: Record<string, unknown>[] | null;
  sourceEventDigest: string;
  receiptBlockNumber: string;
  receiptBlockHash: string;
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
  recordDescriptor:
    | TairaXorSccpRecordDescriptor
    | TairaXorBscSccpRecordDescriptor;
  messageId: string;
  payloadHash: string;
  contractPayloadHash: string;
  amountBaseUnits: string;
};

export type TairaXorBurnRecordMaterial = {
  settlementAssetDefinitionId: string;
  contractArtifactB64: string;
  artifactSha256?: string;
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
  zkIvmRequest:
    | TairaXorSccpBurnRecordZkIvmRequest
    | TairaXorBscSccpBurnRecordZkIvmRequest;
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

export type TairaXorBscFinalizeFromTairaProofBinding = {
  witness: EvmSccpProofRequestInput;
  destinationBinding: EvmSccpDestinationBindingInput;
  messageBundle: Record<string, unknown>;
  canonicalPayloadHex: string;
  amountBaseUnits: string;
  messageId: string;
  payloadHash: string;
};

export type TairaXorBscFinalizeTransactionRequest = {
  transaction: {
    from: string;
    to: string;
    data: string;
    chainId: SccpBscNetworkProfile["chainIdHex"];
  };
  amountBaseUnits: string;
  messageId: string;
};

export type TairaXorBscBurnTransactionRequest = {
  transaction: {
    from: string;
    to: string;
    data: string;
    chainId: SccpBscNetworkProfile["chainIdHex"];
    value: "0x0";
  };
  amountBaseUnits: string;
  amountTokenBaseUnits: string;
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

export type BscToTairaSourceProofPackageInput = {
  manifest: Record<string, unknown> | null | undefined;
  bscNetwork?: SccpBscNetworkKey;
  proofArtifactHash: string;
  provingKeyHash: string;
  nativeEvmProverBundleHash: string;
  sourceVerifierMaterial?: Record<string, unknown>;
  sourceAdapterEngineDeployment?: Record<string, unknown>;
  bscRpcUrl?: string;
  sourceBridgeAddress?: string;
  sourceBridgeEmitterCodeHash?: string;
  txId: string;
  transaction: Record<string, unknown> | null;
  receipt: Record<string, unknown>;
  blockReceipts?: Record<string, unknown>[];
  block?: Record<string, unknown> | null;
  finalityHeight?: string;
  finality_height?: string;
  finalityBlockHash?: string;
  finality_block_hash?: string;
  bscSender: string;
  tairaRecipient: string;
  amountDecimal: string;
  amountBaseUnits?: string;
};

export type TronToTairaSourceProofPackage = {
  messageBundle: Record<string, unknown>;
  settlement: Record<string, unknown>;
  sourceEventDigest: string;
  txId: string;
  messageId: string;
  amountBaseUnits: string;
};

export type BscToTairaSourceProofPackage = {
  messageBundle: Record<string, unknown>;
  settlement: Record<string, unknown>;
  sourceEventDigest: string;
  txId: string;
  messageId: string;
  amountBaseUnits: string;
  proofArtifactHash: string;
  provingKeyHash: string;
  nativeEvmProverBundleHash: string;
  sourceProofHash?: string;
  sourceAdapterDeploymentHash?: string;
  sourceAdapterDeploymentReceiptHash?: string;
  sourceVerifierEvidenceHash?: string;
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

export const normalizeBscNetworkIdHex = (
  networkId: string,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): string => {
  const profile = resolveSccpBscNetworkProfile(bscNetwork);
  const normalized = networkId.trim().toLowerCase();
  if (normalized === profile.chainIdHex) {
    return profile.networkIdHex;
  }
  if (normalized !== profile.networkIdHex) {
    throw new Error(`BSC SCCP routes must target ${profile.label}.`);
  }
  return normalized;
};

export const normalizeEvmAddress = (address: string): string => {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error("EVM address must be a 20-byte hex address.");
  }
  if (/^0x0{40}$/u.test(normalized)) {
    throw new Error("EVM address must be non-zero.");
  }
  return normalized;
};

const normalizeEvmAddressForLabel = (
  address: string,
  label: string,
): string => {
  try {
    return normalizeEvmAddress(address);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${detail}`);
  }
};

const REPEATED_BYTE_EVM_ADDRESS_PATTERN = /^0x([0-9a-f]{2})\1{19}$/u;

export const normalizeBscRouteEvidenceAddress = (
  address: string,
  label = "BSC route contract address",
): string => {
  const normalized = normalizeEvmAddress(address);
  if (REPEATED_BYTE_EVM_ADDRESS_PATTERN.test(normalized)) {
    throw new Error(`${label} must not be repeated-byte placeholder material.`);
  }
  return normalized;
};

export const canonicalEip55EvmAddress = (address: string): string => {
  const normalized = normalizeEvmAddress(address);
  const lowercasePayload = normalized.slice(2);
  const checksum = keccak_256(new TextEncoder().encode(lowercasePayload));
  let output = "0x";
  for (let index = 0; index < lowercasePayload.length; index += 1) {
    const character = lowercasePayload[index];
    if (/[0-9]/u.test(character)) {
      output += character;
      continue;
    }
    const checksumByte = checksum[Math.floor(index / 2)];
    const checksumNibble =
      index % 2 === 0 ? checksumByte >> 4 : checksumByte & 0x0f;
    output += checksumNibble >= 8 ? character.toUpperCase() : character;
  }
  return output;
};

export const isValidEvmAddress = (address: string): boolean => {
  try {
    normalizeEvmAddress(address);
    return true;
  } catch (_error) {
    return false;
  }
};

export const normalizeBscAddress = normalizeEvmAddress;

export const isValidBscAddress = isValidEvmAddress;

export const normalizeBscTransactionHash = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(
      "BSC transaction hash must be a 0x-prefixed 32-byte hex hash.",
    );
  }
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error("BSC transaction hash must be non-zero.");
  }
  return normalized;
};

export const isValidBscTransactionHash = (value: string): boolean => {
  try {
    normalizeBscTransactionHash(value);
    return true;
  } catch (_error) {
    return false;
  }
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

export const bridgeDecimalToTairaBaseUnits = (value: string): string =>
  bridgeDecimalToBaseUnits(value, SCCP_TAIRA_XOR_DECIMALS);

export const bridgeDecimalToEvmTokenBaseUnits = (value: string): string =>
  bridgeDecimalToBaseUnits(value, SCCP_EVM_XOR_DECIMALS);

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

const cloneSccpRouteManifestForRead = (
  manifest: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null =>
  manifest ? cloneSccpJsonRouteManifest(manifest) : null;

const readSccpBscBridgeAddressFromManifest = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  const rollout = readDestinationRollout(manifest);
  return readConsistentBscRouteAddressAliasString("BSC bridge address", [
    {
      record: manifest,
      keys: [
        "tairaXorBridgeAddress",
        "taira_xor_bridge_address",
        "bscBridgeAddress",
        "bsc_bridge_address",
        "evmBridgeAddress",
        "evm_bridge_address",
        "bridgeAddress",
        "bridge_address",
        "destinationBridgeAddress",
        "destination_bridge_address",
        "bridge_contract_address",
      ],
    },
    {
      record: rollout,
      keys: ["destinationBridgeAddress", "destination_bridge_address"],
    },
  ]);
};

export const readSccpBscBridgeAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscBridgeAddressFromManifest(cloneSccpRouteManifestForRead(manifest));

const readSccpBscTokenAddressFromManifest = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  return readConsistentBscRouteAddressAliasString("BSC token address", [
    {
      record: manifest,
      keys: [
        "tairaXorTokenAddress",
        "taira_xor_token_address",
        "bscTokenAddress",
        "bsc_token_address",
        "evmTokenAddress",
        "evm_token_address",
        "tokenAddress",
        "token_address",
        "token_contract_address",
      ],
    },
  ]);
};

export const readSccpBscTokenAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscTokenAddressFromManifest(cloneSccpRouteManifestForRead(manifest));

const assertNoBscRouteAddressAliases = (
  manifest: Record<string, unknown>,
  label: string,
  aliases: string[],
): void => {
  const presentAliases = aliases.filter((key) => readString(manifest, key));
  if (presentAliases.length > 0) {
    throw new Error(
      `${label} must not use TRON aliases on a BSC route manifest: ${presentAliases.join(", ")}.`,
    );
  }
};

const readSccpBscSourceBridgeAddressFromManifest = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  assertNoBscRouteAddressAliases(manifest, "BSC source bridge address", [
    "sccpTronSourceBridgeAddress",
    "sccp_tron_source_bridge_address",
    "tronSourceBridgeAddress",
    "tron_source_bridge_address",
  ]);
  return readConsistentBscRouteAddressAliasString("BSC source bridge address", [
    {
      record: manifest,
      keys: [
        "sccpBscSourceBridgeAddress",
        "sccp_bsc_source_bridge_address",
        "bscSourceBridgeAddress",
        "bsc_source_bridge_address",
        "evmSourceBridgeAddress",
        "evm_source_bridge_address",
        "sourceBridgeAddress",
        "source_bridge_address",
      ],
    },
  ]);
};

export const readSccpBscSourceBridgeAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscSourceBridgeAddressFromManifest(
    cloneSccpRouteManifestForRead(manifest),
  );

const readSccpBscBrowserProverModuleUrlFromManifest = (
  manifest: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string => {
  const manifestForRead = cloneSccpRouteManifestForRead(manifest);
  if (!manifestForRead) {
    return "";
  }
  const prover = readFirstRecord(manifestForRead, ...keys);
  return readFirstString(prover, "moduleUrl", "module_url", "url", "href");
};

export const readSccpBscDestinationProverModuleUrl = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscBrowserProverModuleUrlFromManifest(
    manifest,
    "destinationBrowserProver",
    "destination_browser_prover",
    "browserDestinationProver",
    "browser_destination_prover",
  );

export const readSccpBscSourceProverModuleUrl = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscBrowserProverModuleUrlFromManifest(
    manifest,
    "sourceBrowserProver",
    "source_browser_prover",
    "browserSourceProver",
    "browser_source_prover",
  );

export const readSccpBscRuntimeProverConfigUrl = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  const manifestForRead = cloneSccpRouteManifestForRead(manifest);
  if (!manifestForRead) {
    return "";
  }
  const config = readFirstRecord(manifestForRead, "runtimeProverConfig");
  return readFirstString(config, "configUrl");
};

const readSccpBscVerifierAddressFromManifest = (
  manifest: Record<string, unknown> | null | undefined,
): string => {
  if (!manifest) {
    return "";
  }
  const rollout = readDestinationRollout(manifest);
  assertNoBscRouteAddressAliases(manifest, "BSC verifier address", [
    "tronVerifierAddress",
    "tron_verifier_address",
    "sccpTronDestinationVerifierAddress",
    "sccp_tron_destination_verifier_address",
  ]);
  return readConsistentBscRouteAddressAliasString("BSC verifier address", [
    {
      record: manifest,
      keys: [
        "sccpBscDestinationVerifierAddress",
        "sccp_bsc_destination_verifier_address",
        "destinationVerifierAddress",
        "destination_verifier_address",
        "verifierAddress",
        "verifier_address",
        "bscVerifierAddress",
        "bsc_verifier_address",
        "evmVerifierAddress",
        "evm_verifier_address",
        "verifierAddressHex",
        "verifier_address_hex",
      ],
    },
    {
      record: rollout,
      keys: ["verifierIdentity", "verifier_identity"],
    },
  ]);
};

export const readSccpBscVerifierAddress = (
  manifest: Record<string, unknown> | null | undefined,
): string =>
  readSccpBscVerifierAddressFromManifest(
    cloneSccpRouteManifestForRead(manifest),
  );

const readSccpBscProofMaterialStrict = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): BscSccpProofMaterial => {
  const manifestForRead = cloneSccpRouteManifestForRead(manifest);
  if (!manifestForRead) {
    throw new Error("The BSC SCCP verifier rollout proof material is missing.");
  }
  const selectedNetwork =
    readManifestBscNetworkKey(manifestForRead) ?? bscNetwork;
  const rollout = readDestinationRollout(manifestForRead);
  const networkId = readConsistentBscNetworkIdAliasString(
    "BSC network id",
    [
      {
        record: manifestForRead,
        sourceLabel: "route manifest",
        keys: ["networkIdHex", "network_id_hex"],
      },
      {
        record: rollout,
        sourceLabel: "route manifest destinationRollout",
        keys: [
          "destinationNetworkId",
          "destination_network_id",
          "networkIdHex",
          "network_id_hex",
        ],
      },
    ],
    selectedNetwork,
  );
  const verifierCodeHash = readConsistentHex32AliasString(
    "BSC verifier code hash",
    [
      {
        record: manifestForRead,
        sourceLabel: "route manifest",
        keys: [
          "verifierCodeHash",
          "verifier_code_hash",
          "verifierCodeHashHex",
          "verifier_code_hash_hex",
        ],
      },
      {
        record: rollout,
        sourceLabel: "route manifest destinationRollout",
        keys: [
          "verifierCodeHash",
          "verifier_code_hash",
          "verifierCodeHashHex",
          "verifier_code_hash_hex",
        ],
      },
    ],
  );
  const verifierKeyHash = readConsistentHex32AliasString(
    "BSC verifier key hash",
    [
      {
        record: manifestForRead,
        sourceLabel: "route manifest",
        keys: [
          "verifierKeyHash",
          "verifier_key_hash",
          "verifierKeyHashHex",
          "verifier_key_hash_hex",
        ],
      },
      {
        record: rollout,
        sourceLabel: "route manifest destinationRollout",
        keys: [
          "verifierKeyHash",
          "verifier_key_hash",
          "verifierKeyHashHex",
          "verifier_key_hash_hex",
        ],
      },
    ],
  );
  const destinationBindingHash = readConsistentHex32AliasString(
    "BSC destination binding hash",
    [
      {
        record: manifestForRead,
        sourceLabel: "route manifest",
        keys: [
          "expectedDestinationBindingHashHex",
          "expected_destination_binding_hash_hex",
          "destinationBindingHash",
          "destination_binding_hash",
        ],
      },
      {
        record: rollout,
        sourceLabel: "route manifest destinationRollout",
        keys: [
          "expectedDestinationBindingHashHex",
          "expected_destination_binding_hash_hex",
          "destinationBindingHash",
          "destination_binding_hash",
        ],
      },
      {
        record: readFirstRecord(
          manifestForRead,
          "destinationBinding",
          "destination_binding",
        ),
        sourceLabel: "route manifest destinationBinding",
        keys: ["bindingHash", "binding_hash"],
      },
    ],
  );
  const material = {
    networkIdHex: normalizeBscNetworkIdHex(networkId, selectedNetwork),
    verifierAddressHex: normalizeEvmAddress(
      readSccpBscVerifierAddressFromManifest(manifestForRead),
    ),
    bridgeAddressHex: normalizeEvmAddress(
      readSccpBscBridgeAddressFromManifest(manifestForRead),
    ),
    verifierCodeHashHex: normalizeHex32(
      verifierCodeHash,
      "BSC verifier code hash",
    ),
    verifierKeyHashHex: normalizeHex32(
      verifierKeyHash,
      "BSC verifier key hash",
    ),
    expectedDestinationBindingHashHex: normalizeHex32(
      destinationBindingHash,
      "BSC destination binding hash",
    ),
  };
  assertBscHashRolesSeparated("BSC verifier rollout proof material", [
    ["verifierCodeHash", material.verifierCodeHashHex],
    ["verifierKeyHash", material.verifierKeyHashHex],
    ["destinationBindingHash", material.expectedDestinationBindingHashHex],
  ]);
  return material;
};

export const readSccpBscProofMaterial = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): BscSccpProofMaterial | null => {
  try {
    return readSccpBscProofMaterialStrict(manifest, bscNetwork);
  } catch (_error) {
    return null;
  }
};

const readSccpBscProofMaterialFailureReason = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): string => {
  try {
    readSccpBscProofMaterialStrict(manifest, bscNetwork);
    return "";
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "The BSC SCCP verifier rollout proof material is incomplete.";
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

const hasOwnKey = (
  record: Record<string, unknown> | null | undefined,
  key: string,
): boolean =>
  Boolean(record && Object.prototype.hasOwnProperty.call(record, key));

const hasAnyOwnKey = (
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean => keys.some((key) => hasOwnKey(record, key));

const readConsistentEvmAliasString = (
  label: string,
  sources: Array<{
    record: Record<string, unknown> | null | undefined;
    keys: string[];
  }>,
): string => {
  let selectedValue = "";
  let selectedKey = "";
  let selectedComparable = "";
  for (const source of sources) {
    if (!source.record) {
      continue;
    }
    const record = source.record;
    for (const key of source.keys) {
      const value = readString(record, key);
      if (!value) {
        continue;
      }
      const comparable = value.toLowerCase();
      if (!selectedValue) {
        selectedValue = value;
        selectedKey = key;
        selectedComparable = comparable;
        continue;
      }
      if (selectedComparable !== comparable) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${value}.`,
        );
      }
    }
  }
  return selectedValue;
};

const readConsistentBscRouteAddressAliasString = (
  label: string,
  sources: Array<{
    record: Record<string, unknown> | null | undefined;
    keys: string[];
  }>,
): string => {
  const selectedValue = readConsistentEvmAliasString(label, sources);
  if (selectedValue) {
    normalizeBscRouteEvidenceAddress(selectedValue, label);
  }
  return selectedValue;
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

const readConsistentHex32AliasString = (
  label: string,
  sources: Array<{
    record: Record<string, unknown> | null | undefined;
    keys: string[];
    sourceLabel?: string;
  }>,
): string => {
  let selected = "";
  let selectedKey = "";
  for (const source of sources) {
    if (!source.record) {
      continue;
    }
    const record = source.record;
    const presentKeys = source.keys.filter((key) =>
      Boolean(readString(record, key)),
    );
    if (presentKeys.length > 1) {
      throw new Error(
        `${label} must not use multiple aliases in ${
          source.sourceLabel ?? "manifest object"
        }: ${presentKeys.join(", ")}.`,
      );
    }
    for (const key of source.keys) {
      const value = readString(record, key);
      if (!value) {
        continue;
      }
      const normalized = normalizeNonZeroHex32Loose(value, label);
      if (!selected) {
        selected = normalized;
        selectedKey = key;
        continue;
      }
      if (selected !== normalized) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selected} but ${key}=${value}.`,
        );
      }
    }
  }
  return selected;
};

const readConsistentBscNetworkIdAliasString = (
  label: string,
  sources: Array<{
    record: Record<string, unknown> | null | undefined;
    keys: string[];
    sourceLabel?: string;
  }>,
  bscNetwork: unknown,
): string => {
  let selected = "";
  let selectedKey = "";
  for (const source of sources) {
    if (!source.record) {
      continue;
    }
    const record = source.record;
    const presentKeys = source.keys.filter((key) =>
      Boolean(readString(record, key)),
    );
    if (presentKeys.length > 1) {
      throw new Error(
        `${label} must not use multiple aliases in ${
          source.sourceLabel ?? "manifest object"
        }: ${presentKeys.join(", ")}.`,
      );
    }
    for (const key of source.keys) {
      const value = readString(record, key);
      if (!value) {
        continue;
      }
      let normalized = "";
      try {
        normalized = normalizeBscNetworkIdHex(value, bscNetwork);
      } catch (error) {
        if (selected) {
          throw new Error(
            `${label} aliases disagree: ${selectedKey}=${selected} but ${key}=${value}.`,
          );
        }
        throw error;
      }
      if (!selected) {
        selected = normalized;
        selectedKey = key;
        continue;
      }
      if (selected !== normalized) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selected} but ${key}=${value}.`,
        );
      }
    }
  }
  return selected;
};

const SCCP_BSC_NATIVE_EVM_PROVER_BUNDLE_KEYS = [
  "nativeEvmProverBundle",
  "native_evm_prover_bundle",
  "bscNativeEvmProverBundle",
  "bsc_native_evm_prover_bundle",
  "nativeProverBundle",
  "native_prover_bundle",
  "proverBundle",
  "prover_bundle",
] as const;

const readBscNativeEvmProverBundleRecords = (
  manifest: Record<string, unknown>,
): Array<{ path: string; value: Record<string, unknown> }> => {
  const rollout = readDestinationRollout(manifest);
  const entries: Array<{ path: string; value: Record<string, unknown> }> = [];
  for (const [record, pathName] of [
    [manifest, "manifest"],
    [rollout, "manifest.destinationRollout"],
  ] as const) {
    if (!record) {
      continue;
    }
    for (const key of SCCP_BSC_NATIVE_EVM_PROVER_BUNDLE_KEYS) {
      const value = readRecord(record, key);
      if (value) {
        entries.push({ path: `${pathName}.${key}`, value });
      }
    }
  }
  return entries;
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
  return backend && name
    ? { backend: normalizeBurnRecordVkBackend(backend), name }
    : null;
};

const normalizeBurnRecordVkBackend = (value: string): string => {
  const normalized = value.trim();
  const compact = normalized.toLowerCase().replace(/[-_\s]+/gu, "");
  if (compact === "halo2ipa") {
    return "halo2/ipa";
  }
  if (compact === "starkfri") {
    return "stark/fri";
  }
  return normalized;
};

const readBurnRecordArtifactSha256 = (
  manifest: Record<string, unknown>,
  burnRecord: Record<string, unknown> | null,
): string =>
  readFirstString(
    burnRecord,
    "artifactSha256",
    "artifact_sha256",
    "contractArtifactSha256",
    "contract_artifact_sha256",
  ) ||
  readFirstString(
    manifest,
    "tairaXorBurnRecordArtifactSha256",
    "taira_xor_burn_record_artifact_sha256",
    "burnRecordArtifactSha256",
    "burn_record_artifact_sha256",
  );

const isCanonicalTairaAssetDefinitionId = (value: string): boolean =>
  /^[1-9A-HJ-NP-Za-km-z]{16,80}$/u.test(value);

const SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES = 32;
const SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

const strictBase64DecodedBytes = (value: string): Uint8Array | null => {
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
    if (decoded.length === 0 || btoa(decoded) !== normalized) {
      return null;
    }
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch (_error) {
    return null;
  }
};

const strictBase64DecodedLength = (value: string): number | null =>
  strictBase64DecodedBytes(value)?.length ?? null;

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
  const artifactSha256 = readBurnRecordArtifactSha256(manifest, burnRecord);
  return {
    material: {
      settlementAssetDefinitionId,
      contractArtifactB64,
      ...(artifactSha256 ? { artifactSha256 } : {}),
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

export const buildTairaXorBscBurnTransactionRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  ownerAddress: string;
  tairaRecipient: string;
  amountDecimal: string;
}): TairaXorBscBurnTransactionRequest => {
  const ownerAddress = normalizeBscAddress(input.ownerAddress);
  const tairaRecipient = normalizeTairaAccountId(input.tairaRecipient);
  const bscProfile = resolveManifestBscNetworkProfile(input.manifest);
  const bridgeAddress = readSccpBscBridgeAddress(input.manifest);
  if (!bridgeAddress) {
    throw new Error("The BSC bridge deployment address is missing.");
  }
  const normalizedBridgeAddress = normalizeBscAddress(bridgeAddress);
  const amountTokenBaseUnits = bridgeDecimalToEvmTokenBaseUnits(
    normalizeBridgeAmount(input.amountDecimal),
  );
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(
    normalizeBridgeAmount(input.amountDecimal),
  );
  return {
    transaction: {
      from: ownerAddress,
      to: normalizedBridgeAddress,
      data: tairaXorBscBurnToTairaAccountCallData({
        tairaRecipient,
        amount: amountTokenBaseUnits,
      }),
      chainId: bscProfile.chainIdHex,
      value: "0x0",
    },
    amountBaseUnits,
    amountTokenBaseUnits,
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

export const buildTairaXorBscOutboundPreview = (input: {
  manifest: Record<string, unknown> | null | undefined;
  tairaSender: string;
  bscRecipient: string;
  amountDecimal: string;
  nonce: string | number | bigint;
}): TairaXorOutboundPreview => {
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const recipientAddress = normalizeBscAddress(input.bscRecipient);
  const bridgeAddress = readSccpBscBridgeAddress(input.manifest);
  if (!bridgeAddress) {
    throw new Error("The BSC bridge deployment address is missing.");
  }
  normalizeBscAddress(bridgeAddress);
  const amount = bridgeDecimalToTairaBaseUnits(input.amountDecimal);
  if (amount === "0") {
    throw new Error("Amount must be greater than zero.");
  }
  const recordDescriptor = buildTairaXorBscSccpRecordDescriptor({
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
  const canonicalPayloadEnvelopeBytes = canonicalSccpPayloadEnvelopeBytes({
    kind: "Transfer",
    value: payload,
  });
  return {
    payload,
    canonicalPayloadHex: recordDescriptor.canonical_payload_hex,
    recordDescriptor,
    messageId: recordDescriptor.message_id,
    payloadHash: sccpPayloadHash(canonicalPayloadEnvelopeBytes),
    contractPayloadHash: sccpPayloadHash(
      recordDescriptor.canonicalPayloadBytes,
    ),
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
    descriptor: outbound.recordDescriptor as TairaXorSccpRecordDescriptor,
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

export const buildTairaXorBscOutboundBurnRecordRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  tairaSender: string;
  bscRecipient: string;
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
  const outbound = buildTairaXorBscOutboundPreview(input);
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const authority = input.authority
    ? normalizeTairaAccountId(input.authority)
    : tairaSender;
  const zkIvmRequest = buildTairaXorBscSccpBurnRecordZkIvmRequest({
    descriptor: outbound.recordDescriptor as TairaXorBscSccpRecordDescriptor,
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    sender: tairaSender,
    recipientAddress: normalizeBscAddress(input.bscRecipient),
    amount: outbound.amountBaseUnits,
    settlementAmount: normalizeBridgeAmount(input.amountDecimal),
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

const bscHashRoleSeparationReasons = (
  roles: Array<[string, string | null | undefined]>,
): string[] => {
  const seen = new Map<string, string>();
  const reasons: string[] = [];
  for (const [label, value] of roles) {
    if (!value) {
      continue;
    }
    let normalized = "";
    try {
      normalized = normalizeHex32(value, `BSC ${label}`);
    } catch (_error) {
      continue;
    }
    const previous = seen.get(normalized);
    if (previous) {
      reasons.push(`${label} must not equal ${previous}`);
    } else {
      seen.set(normalized, label);
    }
  }
  return reasons;
};

const assertBscHashRolesSeparated = (
  label: string,
  roles: Array<[string, string | null | undefined]>,
): void => {
  const reasons = bscHashRoleSeparationReasons(roles);
  if (reasons.length > 0) {
    throw new Error(
      `${label} hashes must be role-separated: ${reasons.join("; ")}.`,
    );
  }
};

const isKnownDiagnosticBscVerifierKeyHash = (value: string): boolean => {
  try {
    return SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES.has(
      normalizeHex32(value, "BSC verifier key hash"),
    );
  } catch (_error) {
    return false;
  }
};

const SCCP_BSC_DIAGNOSTIC_TEXT_KEYS = [
  "schema",
  "warning",
  "warnings",
  "note",
  "notes",
  "operatorWarning",
  "operator_warning",
  "verifierWarning",
  "verifier_warning",
  "verifierMaterialWarning",
  "verifier_material_warning",
  "diagnosticReason",
  "diagnostic_reason",
] as const;

const SCCP_BSC_DIAGNOSTIC_FLAG_KEYS = [
  "diagnosticVerifier",
  "diagnostic_verifier",
  "diagnosticVerifierMaterial",
  "diagnostic_verifier_material",
  "diagnostic",
] as const;

const SCCP_BSC_PRODUCTION_PLACEHOLDER_PATTERN =
  /(?:change[-_ ]?me|changeme|dummy|example|mock|placeholder|replace[-_ ]?me|sample|stub|test[-_ ]?only|fixture[-_ ]?only|todo|your[-_ ]?[a-z0-9_-]*)/iu;

const isCanonicalBscMaterialArrayIndexKey = (
  key: string,
  length: number,
): boolean => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
};

const unsafeBscMaterialShapeReason = (pathName: string): string =>
  `${pathName} must contain only enumerable string-keyed data properties while scanning BSC production material`;

const readBscMaterialDataProperty = (
  record: Record<string, unknown>,
  key: string,
  pathName: string,
):
  | { ok: true; present: boolean; value: unknown }
  | { ok: false; reason: string } => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    return { ok: true, present: false, value: undefined };
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    return { ok: false, reason: unsafeBscMaterialShapeReason(pathName) };
  }
  return { ok: true, present: true, value: descriptor.value };
};

const diagnosticTextReason = (
  value: unknown,
  pathName: string,
  seen = new WeakSet<object>(),
): string => {
  if (typeof value === "string") {
    return /\bdiagnostic\b/iu.test(value)
      ? `${pathName} mentions diagnostic verifier material`
      : "";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        return unsafeBscMaterialShapeReason(pathName);
      }
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") {
        continue;
      }
      if (
        typeof key !== "string" ||
        !isCanonicalBscMaterialArrayIndexKey(key, value.length)
      ) {
        return unsafeBscMaterialShapeReason(pathName);
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return unsafeBscMaterialShapeReason(`${pathName}[${key}]`);
      }
      const reason = diagnosticTextReason(
        descriptor.value,
        `${pathName}[${key}]`,
        seen,
      );
      if (reason) {
        return reason;
      }
    }
  }
  return "";
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bscProductionPlaceholderReason = (
  value: unknown,
  pathName = "manifest",
  seen = new WeakSet<object>(),
): string => {
  if (typeof value === "string") {
    return SCCP_BSC_PRODUCTION_PLACEHOLDER_PATTERN.test(value)
      ? `${pathName} contains placeholder, fixture-only, or test-only material`
      : "";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        return unsafeBscMaterialShapeReason(pathName);
      }
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") {
        continue;
      }
      if (
        typeof key !== "string" ||
        !isCanonicalBscMaterialArrayIndexKey(key, value.length)
      ) {
        return unsafeBscMaterialShapeReason(pathName);
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return unsafeBscMaterialShapeReason(`${pathName}[${key}]`);
      }
      const reason = bscProductionPlaceholderReason(
        descriptor.value,
        `${pathName}[${key}]`,
        seen,
      );
      if (reason) {
        return reason;
      }
    }
    return "";
  }
  if (!isPlainRecord(value)) {
    return "";
  }
  if (seen.has(value)) {
    return "";
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      return unsafeBscMaterialShapeReason(pathName);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      return unsafeBscMaterialShapeReason(`${pathName}.${key}`);
    }
    const childPath = `${pathName}.${key}`;
    if (
      (key === "placeholder_material" || key === "placeholderMaterial") &&
      typeof descriptor.value === "boolean"
    ) {
      continue;
    }
    if (SCCP_BSC_PRODUCTION_PLACEHOLDER_PATTERN.test(key)) {
      return `${childPath} is placeholder, fixture-only, or test-only material`;
    }
    const reason = bscProductionPlaceholderReason(
      descriptor.value,
      childPath,
      seen,
    );
    if (reason) {
      return reason;
    }
  }
  return "";
};

const bscDiagnosticVerifierMaterialReasons = (
  manifest: Record<string, unknown>,
  proofMaterial: BscSccpProofMaterial | null,
): string[] => {
  const records: Array<[Record<string, unknown> | null, string]> = [
    [manifest, "manifest"],
    [readDestinationRollout(manifest), "manifest.destinationRollout"],
    [
      readFirstRecord(
        manifest,
        "postDeployLiveEvidence",
        "post_deploy_live_evidence",
      ),
      "manifest.postDeployLiveEvidence",
    ],
  ];
  const reasons: string[] = [];
  for (const [record, pathName] of records) {
    if (!record) {
      continue;
    }
    for (const key of SCCP_BSC_DIAGNOSTIC_FLAG_KEYS) {
      const value = readBscMaterialDataProperty(
        record,
        key,
        `${pathName}.${key}`,
      );
      if (!value.ok) {
        reasons.push(value.reason);
      } else if (value.present && value.value === true) {
        reasons.push(`${pathName}.${key}=true`);
      }
    }
    for (const key of SCCP_BSC_DIAGNOSTIC_TEXT_KEYS) {
      const value = readBscMaterialDataProperty(
        record,
        key,
        `${pathName}.${key}`,
      );
      if (!value.ok) {
        reasons.push(value.reason);
        continue;
      }
      if (value.present) {
        const reason = diagnosticTextReason(value.value, `${pathName}.${key}`);
        if (reason) {
          reasons.push(reason);
        }
      }
    }
  }
  if (
    proofMaterial &&
    isKnownDiagnosticBscVerifierKeyHash(proofMaterial.verifierKeyHashHex)
  ) {
    reasons.push(
      `verifierKeyHash=${proofMaterial.verifierKeyHashHex} is a known diagnostic BSC verifier key hash`,
    );
  }
  return reasons;
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

const readBscRouteNativeProverHashMaterial = (
  manifest: Record<string, unknown>,
): { proofArtifactHash: string; provingKeyHash: string } => {
  const rollout = readDestinationRollout(manifest);
  const hashes = {
    proofArtifactHash: readConsistentHex32AliasString(
      "BSC proof artifact hash",
      [
        {
          record: manifest,
          sourceLabel: "route manifest",
          keys: [
            "proofArtifactHash",
            "proof_artifact_hash",
            "proverArtifactHash",
            "prover_artifact_hash",
            "circuitArtifactHash",
            "circuit_artifact_hash",
          ],
        },
        {
          record: rollout,
          sourceLabel: "route manifest destinationRollout",
          keys: [
            "proofArtifactHash",
            "proof_artifact_hash",
            "proverArtifactHash",
            "prover_artifact_hash",
            "circuitArtifactHash",
            "circuit_artifact_hash",
          ],
        },
      ],
    ),
    provingKeyHash: readConsistentHex32AliasString("BSC proving key hash", [
      {
        record: manifest,
        sourceLabel: "route manifest",
        keys: ["provingKeyHash", "proving_key_hash"],
      },
      {
        record: rollout,
        sourceLabel: "route manifest destinationRollout",
        keys: ["provingKeyHash", "proving_key_hash"],
      },
    ]),
  };
  assertBscHashRolesSeparated("BSC route native prover material", [
    ["proofArtifactHash", hashes.proofArtifactHash],
    ["provingKeyHash", hashes.provingKeyHash],
  ]);
  return hashes;
};

type BscNativeEvmProverBundleDescriptor =
  | ReturnType<typeof validateBscTestnetNativeEvmProverBundle>
  | ReturnType<typeof validateBscMainnetNativeEvmProverBundle>;

const bscNativeEvmProverBundleValidator = (network: SccpBscNetworkKey) =>
  network === "mainnet"
    ? validateBscMainnetNativeEvmProverBundle
    : validateBscTestnetNativeEvmProverBundle;

const canonicalBscNativeEvmProverBundleHash = (
  bundle: BscNativeEvmProverBundleDescriptor,
): string =>
  bytesToLowerHex(sha256(new TextEncoder().encode(JSON.stringify(bundle))));

export type BscSourceProverMaterialHashBinding = {
  proofArtifactHash: string;
  provingKeyHash: string;
  nativeEvmProverBundleHash: string;
};

export type BscSourceProverMaterialBinding =
  BscSourceProverMaterialHashBinding & {
    sourceVerifierMaterial: Record<string, unknown>;
    sourceAdapterEngineDeployment: Record<string, unknown>;
  };

const cloneBscSourceLaneRecord = (
  value: Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  const cloned = cloneSccpJsonValue(value);
  if (!isPlainRecord(cloned)) {
    throw new Error(`${label} must be a plain JSON object.`);
  }
  return cloned;
};

const readBscSourceAdapterEngineRecord = (
  manifest: Record<string, unknown>,
): Record<string, unknown> | null =>
  readFirstRecord(
    manifest,
    "sourceAdapterEngine",
    "source_adapter_engine",
    "bscSourceAdapterEngine",
    "bsc_source_adapter_engine",
  );

const readBscSourceVerifierMaterialRecord = (
  manifest: Record<string, unknown>,
): Record<string, unknown> | null => {
  const engine = readBscSourceAdapterEngineRecord(manifest);
  return (
    readFirstRecord(
      manifest,
      "sourceVerifierMaterial",
      "source_verifier_material",
      "bscSourceVerifierMaterial",
      "bsc_source_verifier_material",
      "sccpSourceVerifierMaterial",
      "sccp_source_verifier_material",
    ) ??
    readFirstRecord(
      engine,
      "sourceVerifierMaterial",
      "source_verifier_material",
    )
  );
};

const readBscSourceAdapterEngineDeploymentRecord = (
  manifest: Record<string, unknown>,
): Record<string, unknown> | null => {
  const engine = readBscSourceAdapterEngineRecord(manifest);
  const deployment =
    readFirstRecord(
      manifest,
      "sourceAdapterEngineDeployment",
      "source_adapter_engine_deployment",
      "sourceAdapterDeployment",
      "source_adapter_deployment",
      "bscSourceAdapterEngineDeployment",
      "bsc_source_adapter_engine_deployment",
      "bscSourceAdapterDeployment",
      "bsc_source_adapter_deployment",
    ) ??
    readFirstRecord(
      engine,
      "sourceAdapterEngineDeployment",
      "source_adapter_engine_deployment",
      "sourceAdapterDeployment",
      "source_adapter_deployment",
      "deployment",
    );
  if (deployment) {
    return deployment;
  }
  return engine &&
    hasAnyOwnKey(engine, ["deploymentReceiptHash", "deployment_receipt_hash"])
    ? engine
    : null;
};

const requireBscSourceDomain = (
  record: Record<string, unknown>,
  label: string,
): void => {
  const sourceDomain = readConsistentAliasInteger(
    record,
    ["sourceDomain", "source_domain", "domain"],
    `${label}.source_domain`,
  );
  if (sourceDomain !== SCCP_BSC_DOMAIN) {
    throw new Error(`${label}.source_domain must be the BSC domain.`);
  }
};

const requireBscSourceLaneMaterial = (
  manifest: Record<string, unknown>,
): {
  sourceVerifierMaterial: Record<string, unknown>;
  sourceAdapterEngineDeployment: Record<string, unknown>;
} => {
  const materialRecord = readBscSourceVerifierMaterialRecord(manifest);
  if (!materialRecord) {
    throw new Error(
      "The BSC SCCP source verifier material is missing from the route manifest.",
    );
  }
  const deploymentRecord = readBscSourceAdapterEngineDeploymentRecord(manifest);
  if (!deploymentRecord) {
    throw new Error(
      "The BSC SCCP source adapter engine deployment is missing from the route manifest.",
    );
  }

  requireBscSourceDomain(materialRecord, "BSC source verifier material");
  requireBscSourceDomain(deploymentRecord, "BSC source adapter deployment");
  const targetDomain = readConsistentAliasInteger(
    deploymentRecord,
    ["targetDomain", "target_domain"],
    "BSC source adapter deployment.target_domain",
  );
  if (targetDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "BSC source adapter deployment.target_domain must target SORA.",
    );
  }
  const materialChain = readConsistentAliasString(
    materialRecord,
    ["sourceChain", "source_chain", "chain"],
    "BSC source verifier material.source_chain",
  ).toLowerCase();
  const deploymentChain = readConsistentAliasString(
    deploymentRecord,
    ["sourceChain", "source_chain", "chain"],
    "BSC source adapter deployment.source_chain",
  ).toLowerCase();
  if (materialChain !== "bsc" || deploymentChain !== "bsc") {
    throw new Error("BSC source material must declare source_chain=bsc.");
  }
  const manifestSourceBridge = readSccpBscSourceBridgeAddress(manifest);
  const materialSourceBridge = readConsistentBscRouteAddressAliasString(
    "BSC source verifier material source bridge emitter address",
    [
      {
        record: materialRecord,
        keys: [
          "sourceBridgeEmitterAddress",
          "source_bridge_emitter_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ],
      },
    ],
  );
  const deploymentSourceBridge = readConsistentBscRouteAddressAliasString(
    "BSC source adapter deployment source bridge emitter address",
    [
      {
        record: deploymentRecord,
        keys: [
          "sourceBridgeEmitterAddress",
          "source_bridge_emitter_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ],
      },
    ],
  );
  const normalizedManifestSourceBridge = manifestSourceBridge
    ? normalizeEvmAddress(manifestSourceBridge)
    : "";
  if (
    !normalizedManifestSourceBridge ||
    normalizeEvmAddress(materialSourceBridge) !==
      normalizedManifestSourceBridge ||
    normalizeEvmAddress(deploymentSourceBridge) !==
      normalizedManifestSourceBridge
  ) {
    throw new Error(
      "BSC source verifier material must bind the route source bridge address.",
    );
  }
  readConsistentHex32AliasString("BSC source verifier material code hash", [
    {
      record: materialRecord,
      keys: ["sourceBridgeEmitterCodeHash", "source_bridge_emitter_code_hash"],
    },
    {
      record: deploymentRecord,
      keys: ["sourceBridgeEmitterCodeHash", "source_bridge_emitter_code_hash"],
    },
  ]);
  readConsistentHex32AliasString(
    "BSC source adapter deployment verifier VK hash",
    [
      {
        record: deploymentRecord,
        keys: ["adapterVerifierVkHash", "adapter_verifier_vk_hash"],
      },
    ],
  );
  readConsistentHex32AliasString("BSC source adapter deployment receipt hash", [
    {
      record: deploymentRecord,
      keys: [
        "deploymentReceiptHash",
        "deployment_receipt_hash",
        "sourceAdapterDeploymentReceiptHash",
        "source_adapter_deployment_receipt_hash",
      ],
    },
  ]);

  return {
    sourceVerifierMaterial: cloneBscSourceLaneRecord(
      materialRecord,
      "BSC source verifier material",
    ),
    sourceAdapterEngineDeployment: cloneBscSourceLaneRecord(
      deploymentRecord,
      "BSC source adapter deployment",
    ),
  };
};

export const readBscSourceProverMaterialBinding = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): BscSourceProverMaterialBinding => {
  if (!isPlainRecord(manifest)) {
    throw new Error("The BSC SCCP source prover manifest is missing.");
  }
  const manifestForRead = cloneSccpJsonRouteManifest(manifest);
  const selectedNetwork =
    readManifestBscNetworkKey(manifestForRead) ??
    normalizeSccpBscNetworkKey(bscNetwork);
  const profile = resolveSccpBscNetworkProfile(selectedNetwork);
  const routeHashes = readBscRouteNativeProverHashMaterial(manifestForRead);
  const proofMaterial = readSccpBscProofMaterial(manifestForRead, profile.key);
  if (!proofMaterial) {
    throw new Error(
      "The BSC SCCP verifier rollout proof material is incomplete.",
    );
  }
  assertBscHashRolesSeparated("BSC source prover material", [
    ["verifierCodeHash", proofMaterial.verifierCodeHashHex],
    ["verifierKeyHash", proofMaterial.verifierKeyHashHex],
    ["destinationBindingHash", proofMaterial.expectedDestinationBindingHashHex],
    ["proofArtifactHash", routeHashes.proofArtifactHash],
    ["provingKeyHash", routeHashes.provingKeyHash],
  ]);
  const entries = readBscNativeEvmProverBundleRecords(manifestForRead);
  if (entries.length === 0) {
    throw new Error("The BSC native EVM prover bundle is required.");
  }
  const validateBundle = bscNativeEvmProverBundleValidator(profile.key);
  let selectedHash = "";
  let selectedPath = "";
  for (const entry of entries) {
    const normalized = validateBundle(entry.value as never, {
      expectedDestinationBindingHash:
        proofMaterial.expectedDestinationBindingHashHex,
    });
    if (normalized.proofArtifactHash !== routeHashes.proofArtifactHash) {
      throw new Error(
        `${entry.path}.proofArtifactHash does not match the BSC route proofArtifactHash.`,
      );
    }
    if (normalized.provingKeyHash !== routeHashes.provingKeyHash) {
      throw new Error(
        `${entry.path}.provingKeyHash does not match the BSC route provingKeyHash.`,
      );
    }
    if (normalized.verifierKeyHash !== proofMaterial.verifierKeyHashHex) {
      throw new Error(
        `${entry.path}.verifierKeyHash does not match the BSC route verifierKeyHash.`,
      );
    }
    const hash = canonicalBscNativeEvmProverBundleHash(normalized);
    if (selectedHash && selectedHash !== hash) {
      throw new Error(
        `BSC native EVM prover bundle aliases disagree: ${selectedPath} does not match ${entry.path}.`,
      );
    }
    selectedHash = hash;
    selectedPath = entry.path;
  }
  assertBscHashRolesSeparated("BSC source prover material", [
    ["verifierCodeHash", proofMaterial.verifierCodeHashHex],
    ["verifierKeyHash", proofMaterial.verifierKeyHashHex],
    ["destinationBindingHash", proofMaterial.expectedDestinationBindingHashHex],
    ["proofArtifactHash", routeHashes.proofArtifactHash],
    ["provingKeyHash", routeHashes.provingKeyHash],
    ["nativeEvmProverBundleHash", selectedHash],
  ]);
  const sourceLaneMaterial = requireBscSourceLaneMaterial(manifestForRead);

  return {
    proofArtifactHash: routeHashes.proofArtifactHash,
    provingKeyHash: routeHashes.provingKeyHash,
    nativeEvmProverBundleHash: selectedHash,
    ...sourceLaneMaterial,
  };
};

const bscNativeEvmProverBundleReadinessReasons = (
  manifest: Record<string, unknown>,
  proofMaterial: BscSccpProofMaterial | null,
  bscNetwork: SccpBscNetworkKey = SCCP_BSC_NETWORK.key,
): string[] => {
  const reasons: string[] = [];
  const validateBundle = bscNativeEvmProverBundleValidator(bscNetwork);
  const entries = readBscNativeEvmProverBundleRecords(manifest);
  if (entries.length === 0) {
    reasons.push("The BSC native EVM prover bundle is required.");
  }
  if (!proofMaterial) {
    reasons.push(
      "The BSC native EVM prover bundle requires complete verifier rollout proof material.",
    );
  }
  let proofArtifactHash = "";
  let provingKeyHash = "";
  try {
    const routeHashes = readBscRouteNativeProverHashMaterial(manifest);
    proofArtifactHash = routeHashes.proofArtifactHash;
    provingKeyHash = routeHashes.provingKeyHash;
  } catch (error) {
    reasons.push(
      error instanceof Error
        ? error.message
        : "The BSC native EVM prover route hashes are invalid.",
    );
  }
  if (!proofArtifactHash) {
    reasons.push("The BSC proof artifact hash is required.");
  }
  if (!provingKeyHash) {
    reasons.push("The BSC proving key hash is required.");
  }
  if (proofMaterial) {
    const roleReasons = bscHashRoleSeparationReasons([
      ["verifierCodeHash", proofMaterial.verifierCodeHashHex],
      ["verifierKeyHash", proofMaterial.verifierKeyHashHex],
      [
        "destinationBindingHash",
        proofMaterial.expectedDestinationBindingHashHex,
      ],
      ["proofArtifactHash", proofArtifactHash],
      ["provingKeyHash", provingKeyHash],
    ]);
    if (roleReasons.length > 0) {
      reasons.push(
        `BSC route cryptographic material hashes must be role-separated: ${roleReasons.join("; ")}.`,
      );
    }
  }

  let selectedJson = "";
  let selectedPath = "";
  for (const entry of entries) {
    try {
      const normalized = validateBundle(entry.value as never, {
        expectedDestinationBindingHash:
          proofMaterial?.expectedDestinationBindingHashHex,
      });
      if (
        proofMaterial &&
        normalized.verifierKeyHash !== proofMaterial.verifierKeyHashHex
      ) {
        reasons.push(
          `${entry.path}.verifierKeyHash does not match the BSC route verifierKeyHash.`,
        );
      }
      if (
        proofArtifactHash &&
        normalized.proofArtifactHash !== proofArtifactHash
      ) {
        reasons.push(
          `${entry.path}.proofArtifactHash does not match the BSC route proofArtifactHash.`,
        );
      }
      if (provingKeyHash && normalized.provingKeyHash !== provingKeyHash) {
        reasons.push(
          `${entry.path}.provingKeyHash does not match the BSC route provingKeyHash.`,
        );
      }
      const normalizedJson = JSON.stringify(normalized);
      if (selectedJson && selectedJson !== normalizedJson) {
        reasons.push(
          `BSC native EVM prover bundle aliases disagree: ${selectedPath} does not match ${entry.path}.`,
        );
      }
      const nativeBundleHash =
        canonicalBscNativeEvmProverBundleHash(normalized);
      const nativeBundleRoleReasons = bscHashRoleSeparationReasons([
        ["verifierKeyHash", proofMaterial?.verifierKeyHashHex],
        [
          "destinationBindingHash",
          proofMaterial?.expectedDestinationBindingHashHex,
        ],
        ["proofArtifactHash", proofArtifactHash],
        ["provingKeyHash", provingKeyHash],
        ["nativeEvmProverBundleHash", nativeBundleHash],
      ]);
      if (nativeBundleRoleReasons.length > 0) {
        reasons.push(
          `BSC native EVM prover bundle hash must be role-separated: ${nativeBundleRoleReasons.join("; ")}.`,
        );
      }
      selectedJson = normalizedJson;
      selectedPath = entry.path;
    } catch (error) {
      reasons.push(
        `${entry.path} failed BSC native EVM prover bundle validation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return reasons;
};

const normalizeBscExplorerTransactionUrl = (
  value: string,
  label: string,
  expectedTransactionId: string,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): string => {
  const profile = resolveSccpBscNetworkProfile(bscNetwork);
  const text = value.trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch (_error) {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== new URL(profile.explorerUrl).hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    const explorerLabel =
      profile.key === "testnet" ? "BSC testnet" : "BSC mainnet";
    throw new Error(
      `${label} must be an HTTPS ${explorerLabel} explorer transaction URL without credentials, query strings, or fragments.`,
    );
  }
  const match = url.pathname
    .replace(/\/+$/u, "")
    .match(/^\/tx\/0x([0-9a-f]{64})$/iu);
  if (!match) {
    throw new Error(`${label} must use the /tx/0x<hash> path.`);
  }
  const expected = normalizeNonZeroHex32Loose(
    expectedTransactionId,
    `${label} transaction id`,
  );
  const actual = `0x${match[1].toLowerCase()}`;
  if (actual !== expected) {
    throw new Error(`${label} transaction hash must match ${expected}.`);
  }
  return `${profile.explorerUrl}/tx/${expected}`;
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

const BN254_G1_GENERATOR_WORDS = [1n, 2n] as const;
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
  return requireRecord(snapshotSccpDataValue(record, label), label);
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
    throw new Error(SCCP_TRON_TRANSACTION_SECRET_INPUT_ERROR);
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
      throw new Error(SCCP_TRON_TRANSACTION_SECRET_INPUT_ERROR);
    }
    const allowedTopLevelSignature =
      options.allowTopLevelSignature &&
      path === "Signed TRON transaction" &&
      key === "signature";
    if (
      !allowedTopLevelSignature &&
      SCCP_TRON_TRANSACTION_SIGNING_HELPER_KEY_PATTERN.test(key)
    ) {
      throw new Error(SCCP_TRON_TRANSACTION_SIGNING_HELPER_INPUT_ERROR);
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

const requireRecordArray = (
  value: unknown,
  label: string,
): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) =>
    requireRecord(entry, `${label}[${index}]`),
  );
};

const snapshotTronTransactionRecordArray = (
  value: unknown,
  label: string,
): Record<string, unknown>[] =>
  requireRecordArray(snapshotSccpDataValue(value, label), label);

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
  if (witnessPayload === undefined || witnessPayload === null) {
    return [];
  }
  if (Array.isArray(witnessPayload)) {
    return requireRecordArray(witnessPayload, "TRON finality witnesses");
  }
  const witnessRecord =
    typeof witnessPayload === "object" &&
    witnessPayload !== null &&
    !Array.isArray(witnessPayload)
      ? (witnessPayload as Record<string, unknown>)
      : null;
  const nestedWitnesses = witnessRecord?.witnesses ?? witnessRecord?.items;
  return nestedWitnesses === undefined || nestedWitnesses === null
    ? []
    : requireRecordArray(nestedWitnesses, "TRON finality witnesses");
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
): Record<string, unknown>[] => {
  for (const [key, label] of [
    ["data", "TRON transaction events.data"],
    ["events", "TRON transaction events.events"],
    ["items", "TRON transaction events.items"],
  ] as const) {
    const value = events[key];
    if (value === undefined || value === null) {
      continue;
    }
    const records = requireRecordArray(value, label);
    if (records.length > 0) {
      return records;
    }
  }
  return [];
};

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
  const normalized = hasHexPrefix
    ? trimmed.slice(2).toLowerCase()
    : trimmed.toLowerCase();
  if (
    !hasHexPrefix &&
    (normalized.length === 0 || !/^[0-9a-f]+$/u.test(normalized))
  ) {
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

export const SCCP_EVM_SOURCE_EVENT_TOPIC = bytesToLowerHex(
  keccak_256(new TextEncoder().encode("SccpSourceEvent(bytes32)")),
);
export const SCCP_BSC_TAIRA_XOR_BURN_STARTED_TOPIC = bytesToLowerHex(
  keccak_256(
    new TextEncoder().encode(
      "TairaXorBurnStarted(bytes32,address,bytes32,uint256,uint256,bytes32,bytes32,bytes)",
    ),
  ),
);

const normalizeEvmTxHash = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte EVM hash.`);
  }
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const normalizeEvmQuantityText = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an EVM hex quantity.`);
  }
  const normalized = value.trim().toLowerCase();
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(normalized)) {
    throw new Error(`${label} must be an EVM hex quantity.`);
  }
  return normalized;
};

const normalizeEvmReceiptRootIndex = (
  value: unknown,
  label: string,
): string => {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must be a safe non-negative integer.`);
    }
    parsed = BigInt(value);
  } else if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(text)) {
      parsed = BigInt(text);
    } else if (/^(?:0|[1-9][0-9]*)$/u.test(text)) {
      parsed = BigInt(text);
    } else {
      throw new Error(
        `${label} must be an EVM hex quantity or decimal integer.`,
      );
    }
  } else {
    throw new Error(`${label} must be an EVM hex quantity or decimal integer.`);
  }
  if (parsed < 0n || parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} must fit in an unsigned 64-bit integer.`);
  }
  return parsed.toString();
};

const readOptionalEvmReceiptRootIndex = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string | undefined => {
  let selectedValue = "";
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const normalized = normalizeEvmReceiptRootIndex(value, label);
    if (!selectedValue) {
      selectedValue = normalized;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== normalized) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${normalized}.`,
      );
    }
  }
  return selectedValue || undefined;
};

const readEvmTransactionHashFromRecord = (
  record: Record<string, unknown>,
  label: string,
): string =>
  normalizeEvmTxHash(
    readConsistentAliasString(
      record,
      ["hash", "transactionHash", "transaction_hash", "txHash", "tx_hash"],
      `${label} hash`,
      (value) => normalizeEvmTxHash(value, `${label} hash`),
    ),
    `${label} hash`,
  );

const readEvmReceiptTransactionHashFromRecord = (
  record: Record<string, unknown>,
  label: string,
): string =>
  normalizeEvmTxHash(
    readConsistentAliasString(
      record,
      ["transactionHash", "transaction_hash", "hash"],
      `${label} transaction hash`,
      (value) => normalizeEvmTxHash(value, `${label} transaction hash`),
    ),
    `${label} transaction hash`,
  );

const readEvmReceiptStatusOk = (receipt: Record<string, unknown>): boolean => {
  const status = receipt.status;
  if (status === true || status === 1) {
    return true;
  }
  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    return normalized === "0x1" || normalized === "1" || normalized === "true";
  }
  return false;
};

const readEvmLogTopics = (log: Record<string, unknown>): string[] =>
  Array.isArray(log.topics)
    ? log.topics.map((topic, index) =>
        normalizeEvmTxHash(String(topic), `EVM log topic ${index}`),
      )
    : [];

const readEvmBlockTransactionHashes = (
  block: Record<string, unknown>,
  label: string,
): string[] => {
  if (!Array.isArray(block.transactions)) {
    throw new Error(`${label} must include a transactions array.`);
  }
  return block.transactions.map((entry, index) => {
    if (typeof entry === "string") {
      return normalizeEvmTxHash(entry, `${label} transaction ${index}`);
    }
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      return readEvmTransactionHashFromRecord(
        entry as Record<string, unknown>,
        `${label} transaction ${index}`,
      );
    }
    throw new Error(`${label} transaction ${index} must be a hash or object.`);
  });
};

const readBscSourceLogRecords = (
  value: unknown,
  label: string,
): Record<string, unknown>[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`BSC ${label} logs must be an array.`);
  }
  return value.map((entry, index) =>
    requireRecord(entry, `BSC ${label} log ${index}`),
  );
};

const readMatchingBscSourceEventLogs = (
  logs: Record<string, unknown>[],
  label: string,
  input: {
    sourceBridgeAddress: string;
    txId: string;
    receiptBlockHash: string;
    receiptBlockNumber: string;
  },
): Array<{ digest: string; log: Record<string, unknown> }> => {
  const expectedAddress = normalizeBscAddress(input.sourceBridgeAddress);
  const matching = logs.flatMap((log) => {
    const address = readFirstString(log, "address");
    if (!address || normalizeBscAddress(address) !== expectedAddress) {
      return [];
    }
    const topics = readEvmLogTopics(log);
    if (topics[0] !== SCCP_EVM_SOURCE_EVENT_TOPIC) {
      return [];
    }
    const logTransactionHash = normalizeEvmTxHash(
      readConsistentAliasString(
        log,
        ["transactionHash", "transaction_hash"],
        "BSC source bridge log transaction hash",
        (value) =>
          normalizeEvmTxHash(value, "BSC source bridge log transaction hash"),
      ),
      "BSC source bridge log transaction hash",
    );
    if (logTransactionHash !== input.txId) {
      throw new Error(
        "BSC source bridge log transaction hash does not match the source transaction.",
      );
    }
    const logBlockHash = normalizeEvmTxHash(
      readConsistentAliasString(
        log,
        ["blockHash", "block_hash"],
        "BSC source bridge log block hash",
        (value) =>
          normalizeEvmTxHash(value, "BSC source bridge log block hash"),
      ),
      "BSC source bridge log block hash",
    );
    if (logBlockHash !== input.receiptBlockHash) {
      throw new Error(
        "BSC source bridge log block hash does not match the transaction receipt.",
      );
    }
    const logBlockNumber = normalizeEvmQuantityText(
      readConsistentAliasString(
        log,
        ["blockNumber", "block_number"],
        "BSC source bridge log block number",
        (value) =>
          normalizeEvmQuantityText(value, "BSC source bridge log block number"),
      ),
      "BSC source bridge log block number",
    );
    if (logBlockNumber !== input.receiptBlockNumber) {
      throw new Error(
        "BSC source bridge log block number does not match the transaction receipt.",
      );
    }
    if (!topics[1]) {
      throw new Error("BSC source bridge log is missing source event digest.");
    }
    return [
      { digest: normalizeEvmTxHash(topics[1], "BSC source event digest"), log },
    ];
  });
  if (matching.length === 0) {
    throw new Error(
      `BSC ${label} must include a source bridge SccpSourceEvent log.`,
    );
  }
  if (matching.length !== 1) {
    throw new Error(
      `BSC ${label} must contain exactly one source bridge SccpSourceEvent log.`,
    );
  }
  return matching;
};

const readMatchingBscBurnStartedLogs = (
  logs: Record<string, unknown>[],
  label: string,
  input: {
    bridgeAddress: string;
    bscSender: string;
    sourceEventDigest: string;
    txId: string;
    receiptBlockHash: string;
    receiptBlockNumber: string;
  },
): Array<Record<string, unknown>> => {
  const expectedBridgeAddress = normalizeBscAddress(input.bridgeAddress);
  const expectedSender = normalizeBscAddress(input.bscSender);
  const expectedDigest = normalizeEvmTxHash(
    input.sourceEventDigest,
    "BSC source event digest",
  );
  const matching = logs.flatMap((log) => {
    const address = readFirstString(log, "address");
    if (!address || normalizeBscAddress(address) !== expectedBridgeAddress) {
      return [];
    }
    const topics = readEvmLogTopics(log);
    if (topics[0] !== SCCP_BSC_TAIRA_XOR_BURN_STARTED_TOPIC) {
      return [];
    }
    const logTransactionHash = normalizeEvmTxHash(
      readConsistentAliasString(
        log,
        ["transactionHash", "transaction_hash"],
        "BSC burn-start log transaction hash",
        (value) =>
          normalizeEvmTxHash(value, "BSC burn-start log transaction hash"),
      ),
      "BSC burn-start log transaction hash",
    );
    if (logTransactionHash !== input.txId) {
      throw new Error(
        "BSC burn-start log transaction hash does not match the source transaction.",
      );
    }
    const logBlockHash = normalizeEvmTxHash(
      readConsistentAliasString(
        log,
        ["blockHash", "block_hash"],
        "BSC burn-start log block hash",
        (value) => normalizeEvmTxHash(value, "BSC burn-start log block hash"),
      ),
      "BSC burn-start log block hash",
    );
    if (logBlockHash !== input.receiptBlockHash) {
      throw new Error(
        "BSC burn-start log block hash does not match the transaction receipt.",
      );
    }
    const logBlockNumber = normalizeEvmQuantityText(
      readConsistentAliasString(
        log,
        ["blockNumber", "block_number"],
        "BSC burn-start log block number",
        (value) =>
          normalizeEvmQuantityText(value, "BSC burn-start log block number"),
      ),
      "BSC burn-start log block number",
    );
    if (logBlockNumber !== input.receiptBlockNumber) {
      throw new Error(
        "BSC burn-start log block number does not match the transaction receipt.",
      );
    }
    if (topics[1] !== expectedDigest) {
      throw new Error(
        "BSC burn-start log source event digest does not match the source bridge log.",
      );
    }
    if (`0x${topics[2].slice(-40)}` !== expectedSender) {
      throw new Error(
        "BSC burn-start log burner does not match the connected wallet.",
      );
    }
    return [log];
  });
  if (matching.length === 0) {
    throw new Error(`BSC ${label} must include a TairaXorBurnStarted log.`);
  }
  if (matching.length !== 1) {
    throw new Error(
      `BSC ${label} must contain exactly one TairaXorBurnStarted log.`,
    );
  }
  return matching;
};

const readBscSourceEventDigestFromLogs = (
  logs: Record<string, unknown>[],
  label: string,
  input: {
    sourceBridgeAddress: string;
    txId: string;
    receiptBlockHash: string;
    receiptBlockNumber: string;
  },
): string => readMatchingBscSourceEventLogs(logs, label, input)[0].digest;

const buildBscSourceProofReceipt = (
  receipt: Record<string, unknown>,
  input: {
    bridgeAddress: string;
    sourceBridgeAddress: string;
    bscSender: string;
    txId: string;
    receiptBlockHash: string;
    receiptBlockNumber: string;
  },
): Record<string, unknown> => {
  const receiptLogs = readBscSourceLogRecords(
    receipt.logs,
    "transaction receipt",
  );
  const sourceMatch = readMatchingBscSourceEventLogs(
    receiptLogs,
    "transaction receipt",
    input,
  )[0];
  const burnLog = readMatchingBscBurnStartedLogs(
    receiptLogs,
    "transaction receipt",
    {
      ...input,
      sourceEventDigest: sourceMatch.digest,
    },
  )[0];
  const sourceLog = sourceMatch.log;
  const receiptRootIndex = readOptionalEvmReceiptRootIndex(
    receipt,
    [
      "receiptRootIndex",
      "receipt_root_index",
      "transactionIndex",
      "transaction_index",
    ],
    "BSC source transaction receipt root index",
  );
  return {
    ...receipt,
    ...(receiptRootIndex
      ? {
          receiptRootIndex,
          receipt_root_index: receiptRootIndex,
        }
      : {}),
    logs: receiptLogs.filter((log) => log === sourceLog || log === burnLog),
  };
};

const readBscSourceEventDigestFromReceipt = (
  receipt: Record<string, unknown>,
  input: {
    sourceBridgeAddress: string;
    txId: string;
    receiptBlockHash: string;
    receiptBlockNumber: string;
  },
): string =>
  readBscSourceEventDigestFromLogs(
    readBscSourceLogRecords(receipt.logs, "transaction receipt"),
    "transaction receipt",
    input,
  );

export const bindBscSourceDataForProof = (input: {
  txId: string;
  transaction: unknown;
  receipt: unknown;
  indexedLogs?: unknown;
  block?: unknown;
  blockReceipts?: unknown;
  bridgeAddress: string;
  sourceBridgeAddress: string;
  bscSender: string;
  tairaRecipient: string;
  amountDecimal: string;
}): BoundBscSourceData => {
  const txId = normalizeEvmTxHash(readRequiredText(input.txId, "txId"), "txId");
  const bridgeAddress = normalizeBscAddress(
    readRequiredText(input.bridgeAddress, "BSC bridge address"),
  );
  const sourceBridgeAddress = normalizeBscAddress(
    readRequiredText(input.sourceBridgeAddress, "BSC source bridge address"),
  );
  const bscSender = normalizeBscAddress(
    readRequiredText(input.bscSender, "BSC sender address"),
  );
  const tairaRecipient = normalizeTairaAccountId(
    readRequiredText(input.tairaRecipient, "TAIRA recipient account"),
  );
  const amountTokenBaseUnits = bridgeDecimalToEvmTokenBaseUnits(
    normalizeBridgeAmount(
      readRequiredText(input.amountDecimal, "Bridge amount"),
    ),
  );

  const transaction = snapshotTronTransactionRecord(
    input.transaction,
    "BSC source transaction",
  );
  if (
    readEvmTransactionHashFromRecord(transaction, "BSC source transaction") !==
    txId
  ) {
    throw new Error(
      "BSC source transaction hash does not match this bridge request.",
    );
  }
  if (normalizeBscAddress(readFirstString(transaction, "from")) !== bscSender) {
    throw new Error(
      "BSC source transaction sender does not match the connected wallet.",
    );
  }
  if (
    normalizeBscAddress(readFirstString(transaction, "to")) !== bridgeAddress
  ) {
    throw new Error(
      "BSC source transaction target does not match the bridge contract.",
    );
  }
  const transactionInput = readConsistentAliasString(
    transaction,
    ["input", "data"],
    "BSC source transaction input",
    (value) => normalizeHexData(value, "BSC source transaction input"),
  );
  const expectedCallData = normalizeHexData(
    tairaXorBscBurnToTairaAccountCallData({
      tairaRecipient,
      amount: amountTokenBaseUnits,
    }),
    "Expected BSC burnToTaira call data",
  );
  if (
    normalizeHexData(transactionInput, "BSC source transaction input") !==
    expectedCallData
  ) {
    throw new Error(
      "BSC source transaction call data does not match this bridge request.",
    );
  }

  const receipt = snapshotTronTransactionRecord(
    input.receipt,
    "BSC source transaction receipt",
  );
  if (
    readEvmReceiptTransactionHashFromRecord(
      receipt,
      "BSC source transaction receipt",
    ) !== txId
  ) {
    throw new Error(
      "BSC source transaction receipt hash does not match this bridge request.",
    );
  }
  if (!readEvmReceiptStatusOk(receipt)) {
    throw new Error("BSC source transaction receipt must report success.");
  }
  if (normalizeBscAddress(readFirstString(receipt, "from")) !== bscSender) {
    throw new Error(
      "BSC source transaction receipt sender does not match the connected wallet.",
    );
  }
  if (normalizeBscAddress(readFirstString(receipt, "to")) !== bridgeAddress) {
    throw new Error(
      "BSC source transaction receipt target does not match the bridge contract.",
    );
  }
  const receiptBlockNumber = normalizeEvmQuantityText(
    readConsistentAliasString(
      receipt,
      ["blockNumber", "block_number"],
      "BSC source transaction receipt block number",
      (value) =>
        normalizeEvmQuantityText(
          value,
          "BSC source transaction receipt block number",
        ),
    ),
    "BSC source transaction receipt block number",
  );
  const receiptBlockHash = normalizeEvmTxHash(
    readConsistentAliasString(
      receipt,
      ["blockHash", "block_hash"],
      "BSC source transaction receipt block hash",
      (value) =>
        normalizeEvmTxHash(value, "BSC source transaction receipt block hash"),
    ),
    "BSC source transaction receipt block hash",
  );
  const sourceEventDigest = readBscSourceEventDigestFromReceipt(receipt, {
    sourceBridgeAddress,
    txId,
    receiptBlockHash,
    receiptBlockNumber,
  });
  const proofReceipt = buildBscSourceProofReceipt(receipt, {
    bridgeAddress,
    sourceBridgeAddress,
    bscSender,
    txId,
    receiptBlockHash,
    receiptBlockNumber,
  });
  const indexedLogs =
    input.indexedLogs === undefined || input.indexedLogs === null
      ? null
      : snapshotTronTransactionRecordArray(
          input.indexedLogs,
          "BSC indexed source logs",
        );
  if (indexedLogs) {
    const indexedSourceEventDigest = readBscSourceEventDigestFromLogs(
      indexedLogs,
      "indexed source bridge logs",
      {
        sourceBridgeAddress,
        txId,
        receiptBlockHash,
        receiptBlockNumber,
      },
    );
    if (indexedSourceEventDigest !== sourceEventDigest) {
      throw new Error(
        "BSC indexed source bridge log digest does not match the transaction receipt.",
      );
    }
  }
  const block =
    input.block === undefined || input.block === null
      ? null
      : snapshotTronTransactionRecord(input.block, "BSC source block");
  if (block) {
    const blockHash = normalizeEvmTxHash(
      readConsistentAliasString(
        block,
        ["hash", "blockHash", "block_hash"],
        "BSC source block hash",
        (value) => normalizeEvmTxHash(value, "BSC source block hash"),
      ),
      "BSC source block hash",
    );
    if (blockHash !== receiptBlockHash) {
      throw new Error(
        "BSC source block hash does not match the transaction receipt.",
      );
    }
    const blockNumber = normalizeEvmQuantityText(
      readConsistentAliasString(
        block,
        ["number", "blockNumber", "block_number"],
        "BSC source block number",
        (value) => normalizeEvmQuantityText(value, "BSC source block number"),
      ),
      "BSC source block number",
    );
    if (blockNumber !== receiptBlockNumber) {
      throw new Error(
        "BSC source block number does not match the transaction receipt.",
      );
    }
    const blockTransactionHashes = readEvmBlockTransactionHashes(
      block,
      "BSC source block",
    );
    if (!blockTransactionHashes.includes(txId)) {
      throw new Error(
        "BSC source block transactions do not include the source transaction.",
      );
    }
  }
  const blockReceipts =
    input.blockReceipts === undefined || input.blockReceipts === null
      ? null
      : snapshotTronTransactionRecordArray(
          input.blockReceipts,
          "BSC source block receipts",
        );
  if (blockReceipts) {
    if (blockReceipts.length === 0) {
      throw new Error("BSC source block receipts must not be empty.");
    }
    let matchedReceipt = false;
    for (const [index, blockReceipt] of blockReceipts.entries()) {
      const blockReceiptHash = normalizeEvmTxHash(
        readConsistentAliasString(
          blockReceipt,
          ["blockHash", "block_hash"],
          `BSC source block receipts[${index}] block hash`,
          (value) =>
            normalizeEvmTxHash(
              value,
              `BSC source block receipts[${index}] block hash`,
            ),
        ),
        `BSC source block receipts[${index}] block hash`,
      );
      if (blockReceiptHash !== receiptBlockHash) {
        throw new Error(
          "BSC source block receipt block hash does not match the source transaction receipt.",
        );
      }
      const blockReceiptNumber = normalizeEvmQuantityText(
        readConsistentAliasString(
          blockReceipt,
          ["blockNumber", "block_number"],
          `BSC source block receipts[${index}] block number`,
          (value) =>
            normalizeEvmQuantityText(
              value,
              `BSC source block receipts[${index}] block number`,
            ),
        ),
        `BSC source block receipts[${index}] block number`,
      );
      if (blockReceiptNumber !== receiptBlockNumber) {
        throw new Error(
          "BSC source block receipt block number does not match the source transaction receipt.",
        );
      }
      const blockReceiptTxHash = readEvmReceiptTransactionHashFromRecord(
        blockReceipt,
        `BSC source block receipts[${index}]`,
      );
      if (blockReceiptTxHash === txId) {
        matchedReceipt = true;
      }
    }
    if (!matchedReceipt) {
      throw new Error(
        "BSC source block receipts do not include the source transaction receipt.",
      );
    }
  }

  return Object.freeze({
    txId,
    transaction,
    receipt,
    proofReceipt,
    block,
    blockReceipts,
    indexedLogs,
    sourceEventDigest,
    receiptBlockNumber,
    receiptBlockHash,
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
      ? {
          kind: record.kind,
          value: record.value ?? record.payload ?? record.bytes,
          source:
            record.value !== undefined
              ? "value"
              : record.payload !== undefined
                ? "payload"
                : record.bytes !== undefined
                  ? "bytes"
                  : "",
        }
      : (() => {
          const entries = Object.entries(record);
          if (entries.length !== 1) {
            throw new Error(`${label} must contain exactly one codec variant.`);
          }
          const [[kind, body]] = entries;
          const variantBody = requireRecord(body, `${label}.${kind}`);
          return {
            kind,
            value:
              variantBody.value ?? variantBody.payload ?? variantBody.bytes,
            source:
              variantBody.value !== undefined
                ? "value"
                : variantBody.payload !== undefined
                  ? "payload"
                  : variantBody.bytes !== undefined
                    ? "bytes"
                    : "",
          };
        })();
  if (variant.kind !== "TextUtf8") {
    throw new Error(`${label} must be a TextUtf8 SCCP codec value.`);
  }
  const text = readScalarText({ value: variant.value }, "value");
  if (!text) {
    throw new Error(`${label} must not be empty.`);
  }
  if (variant.source === "bytes") {
    return decodeEventBytesText(text, label);
  }
  return text;
};

const readCodecTronPayload = (value: unknown, label: string): string => {
  const record = requireRecord(value, label);
  const variant =
    typeof record.kind === "string"
      ? {
          kind: record.kind,
          value: record.value ?? record.payload ?? record.bytes,
        }
      : (() => {
          const entries = Object.entries(record);
          if (entries.length !== 1) {
            throw new Error(`${label} must contain exactly one codec variant.`);
          }
          const [[kind, body]] = entries;
          const variantBody = requireRecord(body, `${label}.${kind}`);
          return {
            kind,
            value:
              variantBody.value ?? variantBody.payload ?? variantBody.bytes,
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

const readCodecScalarText = (value: unknown, label: string): string => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const direct = readConsistentAliasString(
      record,
      ["value", "payload", "bytes"],
      label,
    );
    if (direct) {
      return direct;
    }
  }
  return readScalarText({ value }, "value");
};

const readCodecEvmAddress = (value: unknown, label: string): string => {
  const record = requireRecord(value, label);
  const variant =
    typeof record.kind === "string"
      ? {
          kind: record.kind,
          value: record.value ?? record.payload ?? record.bytes,
        }
      : (() => {
          const entries = Object.entries(record);
          if (entries.length !== 1) {
            throw new Error(`${label} must contain exactly one codec variant.`);
          }
          const [[kind, body]] = entries;
          const variantBody = requireRecord(body, `${label}.${kind}`);
          return {
            kind,
            value:
              variantBody.value ?? variantBody.payload ?? variantBody.bytes,
          };
        })();
  if (variant.kind !== "EvmHex") {
    throw new Error(`${label} must be an EvmHex SCCP codec value.`);
  }
  const address = readCodecScalarText(variant.value, label);
  if (/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    return normalizeEvmAddressForLabel(address, label);
  }
  try {
    return normalizeEvmAddressPayloadHex(address, label);
  } catch (_error) {
    // Some Torii projections carry EvmHex as UTF-8 bytes during migration.
  }
  return normalizeEvmAddressForLabel(
    decodeEventBytesText(address, label),
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
  targetDomain = SCCP_TRON_DOMAIN,
): Record<string, unknown> => {
  const payload = readRecordVariant(
    bundle.payload,
    "SCCP message bundle payload",
  );
  if (payload.kind !== "Transfer") {
    throw new Error("SCCP message bundle must carry a Transfer payload.");
  }
  return normalizeBundleTransferPayload(payload.value, targetDomain);
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
    return decodeEventBytesText(
      readRequiredTransferScalar(record, key, label),
      label,
    );
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
      decodeEventBytesText(
        readRequiredTransferScalar(record, key, label),
        label,
      ),
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

const normalizeEvmAddressPayloadHex = (
  value: string,
  label: string,
): string => {
  const normalized = normalizeHexData(value, label).slice(2);
  if (/^[0-9a-f]{40}$/u.test(normalized)) {
    return normalizeEvmAddressForLabel(`0x${normalized}`, label);
  }
  if (/^0{24}[0-9a-f]{40}$/u.test(normalized)) {
    return normalizeEvmAddressForLabel(`0x${normalized.slice(24)}`, label);
  }
  throw new Error(`${label} must be a 20-byte EVM address payload.`);
};

const readTransferEvmAddressField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];
  if (value === undefined || value === null) {
    throw new Error(`${label} is missing from the SCCP transfer payload.`);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return readCodecEvmAddress(value, label);
  }
  const codec = readTransferCodecId(record, `${key}_codec`, label);
  if (codec !== null && codec !== SCCP_CODEC_EVM_HEX) {
    throw new Error(`${label} must use the EvmHex SCCP codec.`);
  }
  const address = readRequiredTransferScalar(record, key, label);
  if (/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    return normalizeEvmAddressForLabel(address, label);
  }
  try {
    return normalizeEvmAddressPayloadHex(address, label);
  } catch (_error) {
    // Some Torii projections carry EvmHex as UTF-8 bytes during migration.
  }
  return normalizeEvmAddressForLabel(
    decodeEventBytesText(address, label),
    label,
  );
};

const normalizeBundleTransferPayload = (
  transfer: Record<string, unknown>,
  targetDomain = SCCP_TRON_DOMAIN,
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
  recipient_codec:
    targetDomain === SCCP_BSC_DOMAIN
      ? SCCP_CODEC_EVM_HEX
      : SCCP_CODEC_TRON_BASE58CHECK,
  recipient:
    targetDomain === SCCP_BSC_DOMAIN
      ? canonicalEip55EvmAddress(
          readTransferEvmAddressField(
            transfer,
            "recipient",
            "Bundle recipient",
          ),
        )
      : readTransferTronAddressField(transfer, "recipient", "Bundle recipient"),
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
  const actualBindingHash = readConsistentAliasString(
    record,
    [
      "destinationBindingHash",
      "destination_binding_hash",
      "destinationBindingHashHex",
      "destination_binding_hash_hex",
    ],
    `${label} destination binding hash`,
    (value) => normalizeHex32(value, `${label} destination binding hash`),
  );
  if (!actualBindingHash) {
    return;
  }
  if (
    normalizeHex32(actualBindingHash, `${label} destination binding hash`) !==
    expectedBindingHash
  ) {
    throw new Error(
      `${label} destination binding hash does not match the route manifest.`,
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
    readRecord(platformPayload ?? {}, "payload") ??
    (platformPayload ? platformPayload : null)
  );
};

const readSccpSubmissionPlatformPayloadValue = (
  submission: Record<string, unknown>,
): Record<string, unknown> | null => {
  const platformPayload =
    readRecord(submission, "platformPayload") ??
    readRecord(submission, "platform_payload");
  return (
    readRecord(platformPayload ?? {}, "value") ??
    readRecord(platformPayload ?? {}, "payload")
  );
};

const readSccpPlatformDestinationBinding = (
  record: Record<string, unknown>,
): Record<string, unknown> | null => {
  const proofSummary =
    readRecord(record, "groth16ProofSummary") ??
    readRecord(record, "groth16_proof_summary") ??
    readRecord(record, "proofEnvelopeSummary") ??
    readRecord(record, "proof_envelope_summary");
  const proofSummaryBindingHash = readConsistentAliasString(
    proofSummary ?? {},
    [
      "destinationBindingHash",
      "destination_binding_hash",
      "destinationBindingHashHex",
      "destination_binding_hash_hex",
    ],
    "SCCP proof summary destination binding hash",
    (value) =>
      normalizeHex32(value, "SCCP proof summary destination binding hash"),
  );
  if (proofSummaryBindingHash) {
    const proofSummaryBindingKey = readConsistentAliasString(
      proofSummary ?? {},
      ["destinationBindingKey", "destination_binding_key"],
      "SCCP proof summary destination binding key",
    );
    return {
      ...(proofSummaryBindingKey ? { key: proofSummaryBindingKey } : {}),
      bindingHash: proofSummaryBindingHash,
    };
  }
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

const readBscDestinationBindingInput = (
  manifest: Record<string, unknown>,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): EvmSccpDestinationBindingInput => {
  const selectedNetwork = readManifestBscNetworkKey(manifest) ?? bscNetwork;
  const proofMaterial = readSccpBscProofMaterial(manifest, selectedNetwork);
  if (!proofMaterial) {
    throw new Error(
      "The BSC SCCP verifier rollout proof material is incomplete.",
    );
  }
  const manifestBinding =
    readRecord(manifest, "destinationBinding") ??
    readRecord(manifest, "destination_binding");
  const rollout = readDestinationRollout(manifest);
  const manifestBindingKey = readConsistentAliasString(
    manifestBinding ?? {},
    ["key", "bindingKey", "binding_key"],
    "BSC destination binding key",
  );
  const rolloutBindingKey = readConsistentAliasString(
    rollout ?? {},
    ["destinationBindingKey", "destination_binding_key"],
    "BSC destination binding key",
  );
  if (
    manifestBindingKey &&
    rolloutBindingKey &&
    manifestBindingKey !== rolloutBindingKey
  ) {
    throw new Error(
      "BSC destination binding key aliases disagree between destinationBinding and destinationRollout.",
    );
  }
  const key = manifestBindingKey || rolloutBindingKey;
  if (!key) {
    throw new Error("The BSC SCCP destination binding key is missing.");
  }
  const version =
    readNumber(manifestBinding ?? {}, "version") ??
    readNumber(rollout ?? {}, "version") ??
    1;
  if (version !== 1) {
    throw new Error("The BSC SCCP destination binding version must be 1.");
  }
  const manifestSourceDomain = readConsistentAliasInteger(
    manifestBinding ?? {},
    ["sourceDomain", "source_domain"],
    "BSC destination binding source domain",
  );
  const rolloutSourceDomain = readConsistentAliasInteger(
    rollout ?? {},
    ["sourceDomain", "source_domain"],
    "BSC destination binding source domain",
  );
  if (
    manifestSourceDomain !== null &&
    rolloutSourceDomain !== null &&
    manifestSourceDomain !== rolloutSourceDomain
  ) {
    throw new Error(
      "BSC destination binding source domain aliases disagree between destinationBinding and destinationRollout.",
    );
  }
  const sourceDomain =
    manifestSourceDomain !== null ? manifestSourceDomain : rolloutSourceDomain;
  const manifestTargetDomain = readConsistentAliasInteger(
    manifestBinding ?? {},
    ["targetDomain", "target_domain"],
    "BSC destination binding target domain",
  );
  const rolloutTargetDomain = readConsistentAliasInteger(
    rollout ?? {},
    ["targetDomain", "target_domain"],
    "BSC destination binding target domain",
  );
  if (
    manifestTargetDomain !== null &&
    rolloutTargetDomain !== null &&
    manifestTargetDomain !== rolloutTargetDomain
  ) {
    throw new Error(
      "BSC destination binding target domain aliases disagree between destinationBinding and destinationRollout.",
    );
  }
  const targetDomain =
    manifestTargetDomain !== null ? manifestTargetDomain : rolloutTargetDomain;
  if (sourceDomain !== null && sourceDomain !== SCCP_SORA_DOMAIN) {
    throw new Error("The BSC SCCP destination binding source domain is wrong.");
  }
  if (targetDomain !== null && targetDomain !== SCCP_BSC_DOMAIN) {
    throw new Error("The BSC SCCP destination binding target domain is wrong.");
  }
  const explicitBindingHash = readConsistentAliasString(
    manifestBinding ?? {},
    ["bindingHash", "binding_hash"],
    "BSC destination binding hash",
    (value) => normalizeHex32(value, "BSC destination binding hash"),
  );
  if (
    explicitBindingHash &&
    normalizeHex32(explicitBindingHash, "BSC destination binding hash") !==
      proofMaterial.expectedDestinationBindingHashHex
  ) {
    throw new Error(
      "The BSC SCCP destination binding hash does not match the verifier rollout material.",
    );
  }
  const normalizedExplicitBindingHash = explicitBindingHash
    ? normalizeHex32(explicitBindingHash, "BSC destination binding hash")
    : "";
  const input: EvmSccpDestinationBindingInput = {
    version: 1 as const,
    key,
    sourceDomain: SCCP_SORA_DOMAIN,
    targetDomain: SCCP_BSC_DOMAIN,
    networkId: proofMaterial.networkIdHex,
    verifierAddress: proofMaterial.verifierAddressHex,
    bridgeAddress: proofMaterial.bridgeAddressHex,
    verifierCodeHash: proofMaterial.verifierCodeHashHex,
    verifierKeyHash: proofMaterial.verifierKeyHashHex,
    bindingHash:
      normalizedExplicitBindingHash ||
      proofMaterial.expectedDestinationBindingHashHex,
  };
  evmSccpDestinationBinding(input);
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
    readConsistentAliasString(
      commitment,
      ["messageId", "message_id"],
      "SCCP message commitment messageId",
      normalizeSccpMessageId,
    ),
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
    readConsistentAliasString(
      bundle,
      ["commitmentRoot", "commitment_root"],
      "SCCP commitment root",
      (value) => normalizeHex32(value, "SCCP commitment root"),
    ),
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

export const buildTairaXorBscMessageProofJobQueryMaterial = (input: {
  manifest: Record<string, unknown> | null | undefined;
  messageBundle: Record<string, unknown> | null | undefined;
  messageId?: string;
  bscNetwork?: unknown;
}): BscSccpProofMaterial & { proofBytesHex: string } => {
  const manifest = requireRecord(input.manifest, "SCCP BSC manifest");
  const bundle = requireRecord(input.messageBundle, "SCCP message bundle");
  const bscNetwork = input.bscNetwork ?? SCCP_BSC_NETWORK.key;
  const proofMaterial = readSccpBscProofMaterial(manifest, bscNetwork);
  if (!proofMaterial) {
    throw new Error(
      "The BSC SCCP verifier rollout proof material is incomplete.",
    );
  }
  readBscDestinationBindingInput(manifest, bscNetwork);

  const commitment = requireRecord(
    bundle.commitment,
    "SCCP message commitment",
  );
  const messageId = normalizeSccpMessageId(
    readConsistentAliasString(
      commitment,
      ["messageId", "message_id"],
      "BSC SCCP message commitment messageId",
      normalizeSccpMessageId,
    ),
  );
  if (input.messageId) {
    const expectedMessageId = normalizeSccpMessageId(input.messageId);
    if (messageId !== expectedMessageId) {
      throw new Error(
        "SCCP message bundle does not match the requested message id.",
      );
    }
  }
  const commitmentTargetDomain = readConsistentAliasInteger(
    commitment,
    ["targetDomain", "target_domain"],
    "SCCP message commitment targetDomain",
  );
  if (commitmentTargetDomain !== SCCP_BSC_DOMAIN) {
    throw new Error("SCCP message bundle must target BSC.");
  }
  const commitmentRoot = normalizeHex32(
    readConsistentAliasString(
      bundle,
      ["commitmentRoot", "commitment_root"],
      "BSC SCCP commitment root",
      (value) => normalizeHex32(value, "BSC SCCP commitment root"),
    ),
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
  const publicInputs = requireRecord(
    job.publicInputs ?? job.public_inputs,
    "SCCP job publicInputs",
  );
  const destinationBindingHash = normalizeHex32(
    destinationBinding.bindingHash ?? "",
    "TRON destination binding hash",
  );
  const platformValue = readSccpPlatformPayloadValue(job);
  const statementHash = normalizeHex32(
    readConsistentAliasString(
      platformValue ?? {},
      ["statementHash", "statement_hash"],
      "SCCP proof job statement hash",
      (value) => normalizeHex32(value, "SCCP proof job statement hash"),
    ),
    "SCCP proof job statement hash",
  );
  const publicInputMessageId = normalizeHex32(
    readConsistentAliasString(
      publicInputs,
      ["messageId", "message_id"],
      "publicInputs.messageId",
      (value) => normalizeHex32(value, "publicInputs.messageId"),
    ),
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
    readConsistentAliasString(
      commitment,
      ["messageId", "message_id"],
      "bundle.commitment.messageId",
      (value) => normalizeHex32(value, "bundle.commitment.messageId"),
    ),
    "bundle.commitment.messageId",
  );
  if (commitmentMessageId !== expectedMessageId) {
    throw new Error("SCCP message bundle does not match this bridge request.");
  }
  const payloadHash = normalizeHex32(
    readConsistentAliasString(
      publicInputs,
      ["payloadHash", "payload_hash"],
      "publicInputs.payloadHash",
      (value) => normalizeHex32(value, "publicInputs.payloadHash"),
    ),
    "publicInputs.payloadHash",
  );
  const commitmentPayloadHash = normalizeHex32(
    readConsistentAliasString(
      commitment,
      ["payloadHash", "payload_hash"],
      "bundle.commitment.payloadHash",
      (value) => normalizeHex32(value, "bundle.commitment.payloadHash"),
    ),
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
      decodeTronBase58CheckAddress(readScalarText(bundleTransfer, "recipient")),
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

export const buildTairaXorBscFinalizeProofBinding = (input: {
  manifest: Record<string, unknown> | null | undefined;
  job: Record<string, unknown>;
  messageId: string;
  tairaSender: string;
  bscRecipient: string;
  amountDecimal: string;
}): TairaXorBscFinalizeFromTairaProofBinding => {
  const manifest = requireRecord(input.manifest, "SCCP BSC manifest");
  const job = requireRecord(input.job, "SCCP proof job");
  const tairaSender = normalizeTairaAccountId(input.tairaSender);
  const expectedMessageId = normalizeHex32(input.messageId, "messageId");
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(input.amountDecimal);
  const expectedRecipient = normalizeBscAddress(input.bscRecipient);
  const destinationBinding = readBscDestinationBindingInput(manifest);
  const proverMaterial = readBscSourceProverMaterialBinding(manifest);
  const publicInputs = requireRecord(
    job.publicInputs ?? job.public_inputs,
    "SCCP job publicInputs",
  );
  const destinationBindingHash = normalizeHex32(
    destinationBinding.bindingHash ?? "",
    "BSC destination binding hash",
  );
  const platformValue = readSccpPlatformPayloadValue(job);
  const statementHash = normalizeHex32(
    readConsistentAliasString(
      platformValue ?? {},
      ["statementHash", "statement_hash"],
      "SCCP proof job statement hash",
      (value) => normalizeHex32(value, "SCCP proof job statement hash"),
    ),
    "SCCP proof job statement hash",
  );
  const publicInputMessageId = normalizeHex32(
    readConsistentAliasString(
      publicInputs,
      ["messageId", "message_id"],
      "publicInputs.messageId",
      (value) => normalizeHex32(value, "publicInputs.messageId"),
    ),
    "publicInputs.messageId",
  );
  if (publicInputMessageId !== expectedMessageId) {
    throw new Error(
      "SCCP proof job message id does not match this bridge request.",
    );
  }
  const publicInputTargetDomain = readConsistentAliasInteger(
    publicInputs,
    ["targetDomain", "target_domain"],
    "SCCP proof job public inputs targetDomain",
  );
  if (publicInputTargetDomain !== SCCP_BSC_DOMAIN) {
    throw new Error("SCCP proof job must target BSC.");
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
    readConsistentAliasString(
      commitment,
      ["messageId", "message_id"],
      "bundle.commitment.messageId",
      (value) => normalizeHex32(value, "bundle.commitment.messageId"),
    ),
    "bundle.commitment.messageId",
  );
  if (commitmentMessageId !== expectedMessageId) {
    throw new Error("SCCP message bundle does not match this bridge request.");
  }
  const payloadHash = normalizeHex32(
    readConsistentAliasString(
      publicInputs,
      ["payloadHash", "payload_hash"],
      "publicInputs.payloadHash",
      (value) => normalizeHex32(value, "publicInputs.payloadHash"),
    ),
    "publicInputs.payloadHash",
  );
  const commitmentPayloadHash = normalizeHex32(
    readConsistentAliasString(
      commitment,
      ["payloadHash", "payload_hash"],
      "bundle.commitment.payloadHash",
      (value) => normalizeHex32(value, "bundle.commitment.payloadHash"),
    ),
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
    SCCP_BSC_DOMAIN,
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
    readCodecText(transfer.route_id, "payload.route_id") !==
    SCCP_BSC_XOR_ROUTE_ID
  ) {
    throw new Error("SCCP proof job route id must be taira_bsc_xor.");
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
    readTransferEvmAddressField(transfer, "recipient", "payload.recipient") !==
    expectedRecipient
  ) {
    throw new Error(
      "SCCP proof job recipient does not match this bridge request.",
    );
  }

  const bundleTransfer = readBundleTransferPayload(bundle, SCCP_BSC_DOMAIN);
  compareOptionalScalar(
    bundleTransfer,
    "source_domain",
    SCCP_SORA_DOMAIN,
    "Bundle source domain",
  );
  compareOptionalScalar(
    bundleTransfer,
    "dest_domain",
    SCCP_BSC_DOMAIN,
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
    SCCP_BSC_XOR_ROUTE_ID,
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
    readTransferEvmAddressField(
      bundleTransfer,
      "recipient",
      "Bundle recipient",
    ) !== expectedRecipient
  ) {
    throw new Error(
      "Bundle recipient must match the selected TAIRA/BSC route.",
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
  const jobBindingHash = readConsistentAliasString(
    platformDestinationBinding ?? jobDestinationBinding ?? {},
    ["bindingHash", "binding_hash"],
    "SCCP proof job destination binding hash",
    (value) => normalizeHex32(value, "SCCP proof job destination binding hash"),
  );
  if (
    jobBindingHash &&
    normalizeHex32(jobBindingHash, "job.destinationBinding.bindingHash") !==
      destinationBinding.bindingHash
  ) {
    throw new Error(
      "SCCP proof job destination binding does not match the BSC route manifest.",
    );
  }

  const normalizedBundle = {
    ...bundle,
    payload: {
      kind: "Transfer",
      value: bundleTransfer,
    },
  };
  const witness = {
    publicInputs,
    bundleBytes: canonicalSccpMessageProofBundleBytes(normalizedBundle),
    sourceProofBytes: [],
    sourceDomain: SCCP_SORA_DOMAIN,
    destinationBinding,
    statementHash,
    destinationBindingHash,
    proofArtifactHash: proverMaterial.proofArtifactHash,
    provingKeyHash: proverMaterial.provingKeyHash,
    nativeEvmProverBundleHash: proverMaterial.nativeEvmProverBundleHash,
  } as EvmSccpProofRequestInput & { nativeEvmProverBundleHash: string };

  return {
    witness,
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
  const platformValue = readSccpSubmissionPlatformPayloadValue(submission);
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
    readConsistentAliasString(
      publicInputs,
      ["messageId", "message_id"],
      "proofPackage.publicInputs.messageId",
      (value) => normalizeHex32(value, "proofPackage.publicInputs.messageId"),
    ),
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

export const buildTairaXorBscFinalizeTransactionRequest = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofPackage: Record<string, unknown>;
  ownerAddress: string;
  bscRecipient: string;
  amountBaseUnits: string;
  messageId?: string;
  canonicalPayloadHex?: string;
}): TairaXorBscFinalizeTransactionRequest => {
  const manifest = cloneSccpJsonRouteManifest(
    requireRecord(input.manifest, "SCCP BSC manifest"),
  );
  const bscProfile = resolveManifestBscNetworkProfile(manifest);
  const bridgeAddress = readSccpBscBridgeAddress(manifest);
  if (!bridgeAddress) {
    throw new Error("The BSC bridge deployment address is missing.");
  }
  const normalizedBridgeAddress = normalizeBscAddress(bridgeAddress);
  normalizeBscAddress(input.bscRecipient);
  const destinationBinding = readBscDestinationBindingInput(manifest);
  const proofPackage = requireRecord(
    input.proofPackage,
    "BSC SCCP proof package",
  );
  const submission = requireRecord(
    proofPackage.submission,
    "BSC SCCP proof package submission",
  );
  const platformValue = readSccpSubmissionPlatformPayloadValue(submission);
  const proofBytes =
    readFirstString(submission, "proofBytes", "proof_bytes") ||
    readFirstString(platformValue, "proofBytes", "proof_bytes");
  if (!proofBytes) {
    throw new Error("BSC SCCP proof package is missing proof bytes.");
  }
  const publicInputs =
    readRecord(submission, "publicInputs") ??
    readRecord(submission, "public_inputs") ??
    readRecord(platformValue ?? {}, "publicInputs") ??
    readRecord(platformValue ?? {}, "public_inputs");
  if (!publicInputs) {
    throw new Error("BSC SCCP proof package is missing public inputs.");
  }
  const destinationBindingHash = normalizeHex32(
    destinationBinding.bindingHash ?? "",
    "BSC destination binding hash",
  );
  const publicInputTargetDomain = readConsistentAliasInteger(
    publicInputs,
    ["targetDomain", "target_domain"],
    "BSC SCCP proof package public inputs targetDomain",
  );
  if (publicInputTargetDomain !== SCCP_BSC_DOMAIN) {
    throw new Error("BSC SCCP proof package must target BSC.");
  }
  const expectedMessageId = input.messageId
    ? normalizeHex32(input.messageId, "messageId")
    : "";
  if (!expectedMessageId) {
    throw new Error(
      "BSC finalize requests must include the bridge request message id.",
    );
  }
  if (!input.canonicalPayloadHex) {
    throw new Error(
      "BSC finalize requests must include bridge request canonical payload bytes.",
    );
  }
  requireOptionalDestinationBindingHashMatch(
    publicInputs,
    destinationBindingHash,
    "BSC SCCP proof package public inputs",
  );
  const messageId = normalizeHex32(
    readConsistentAliasString(
      publicInputs,
      ["messageId", "message_id"],
      "proofPackage.publicInputs.messageId",
      (value) => normalizeHex32(value, "proofPackage.publicInputs.messageId"),
    ),
    "proofPackage.publicInputs.messageId",
  );
  if (messageId !== expectedMessageId) {
    throw new Error(
      "BSC SCCP proof package message id does not match this bridge request.",
    );
  }
  const amount = normalizePositiveBaseUnitString(
    input.amountBaseUnits,
    "BSC finalize amount",
  );
  const statementHash =
    readFirstString(submission, "statementHash", "statement_hash") ||
    readFirstString(platformValue, "statementHash", "statement_hash");
  if (!statementHash) {
    throw new Error("BSC SCCP proof package is missing the statement hash.");
  }
  const packageTopCanonicalPayloadHex = readConsistentAliasString(
    proofPackage,
    ["canonicalPayloadHex", "canonical_payload_hex"],
    "BSC SCCP proof package canonical payload bytes",
    (value) =>
      normalizeHexData(value, "BSC SCCP proof package canonical payload bytes"),
  );
  const submissionCanonicalPayloadHex = readConsistentAliasString(
    submission,
    ["canonicalPayloadHex", "canonical_payload_hex"],
    "BSC SCCP proof package submission canonical payload bytes",
    (value) =>
      normalizeHexData(
        value,
        "BSC SCCP proof package submission canonical payload bytes",
      ),
  );
  if (
    packageTopCanonicalPayloadHex &&
    submissionCanonicalPayloadHex &&
    normalizeHexData(
      packageTopCanonicalPayloadHex,
      "BSC SCCP proof package canonical payload bytes",
    ) !==
      normalizeHexData(
        submissionCanonicalPayloadHex,
        "BSC SCCP proof package submission canonical payload bytes",
      )
  ) {
    throw new Error(
      "BSC SCCP proof package canonical payload aliases disagree between package and submission.",
    );
  }
  const packageCanonicalPayloadHex =
    packageTopCanonicalPayloadHex || submissionCanonicalPayloadHex;
  if (!packageCanonicalPayloadHex) {
    throw new Error(
      "BSC SCCP proof package is missing canonical payload bytes.",
    );
  }
  const normalizedCanonicalPayloadHex = normalizeHexData(
    packageCanonicalPayloadHex,
    "BSC SCCP proof package canonical payload bytes",
  );
  if (
    normalizeHexData(
      input.canonicalPayloadHex,
      "bridge request canonical payload bytes",
    ) !== normalizedCanonicalPayloadHex
  ) {
    throw new Error(
      "BSC SCCP proof package canonical payload bytes do not match this bridge request.",
    );
  }
  const packageCallData = readConsistentAliasString(
    submission,
    ["callDataHex", "call_data_hex", "callData", "call_data"],
    "BSC SCCP proof package call data",
    (value) => normalizeHexData(value, "BSC SCCP proof package call data"),
  );
  const callData = tairaXorFinalizeFromTairaCallData({
    proofBytes,
    publicInputs,
    statementHash,
    canonicalPayloadHex: normalizedCanonicalPayloadHex,
    amount,
  });
  if (packageCallData) {
    const normalizedPackageCallData = normalizeHexData(
      packageCallData,
      "BSC SCCP proof package call data",
    );
    const packageCallDataSelector = normalizedPackageCallData.slice(0, 10);
    const finalizeSelector = evmFunctionSelector(
      TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
    );
    const submitProofSelector = evmFunctionSelector(
      SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1,
    );
    if (packageCallDataSelector === finalizeSelector) {
      if (normalizedPackageCallData !== callData) {
        throw new Error(
          "BSC SCCP proof package call data does not match the locally generated finalize request.",
        );
      }
    } else if (packageCallDataSelector !== submitProofSelector) {
      throw new Error(
        "BSC SCCP proof package call data selector is not recognized.",
      );
    }
  }
  return {
    transaction: {
      from: normalizeBscAddress(input.ownerAddress),
      to: normalizedBridgeAddress,
      data: callData,
      chainId: bscProfile.chainIdHex,
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
    ? cloneSccpJsonRouteManifest(
        requireRecord(input.manifest, "SCCP TRON manifest"),
      )
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

export const buildTairaXorBscInboundSettlement = (input: {
  manifest: Record<string, unknown> | null | undefined;
  gasLimit?: number;
}): Record<string, unknown> => {
  const manifest = input.manifest
    ? cloneSccpJsonRouteManifest(
        requireRecord(input.manifest, "SCCP BSC manifest"),
      )
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
    route: SCCP_BSC_XOR_ROUTE_ID,
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
  if (
    readConsistentAliasString(
      settlement,
      ["entrypoint"],
      "TRON -> TAIRA settlement entrypoint",
    ) !== "finalize_inbound"
  ) {
    throw new Error(
      "TRON -> TAIRA settlement entrypoint must be finalize_inbound.",
    );
  }
  if (
    readConsistentAliasString(
      settlement,
      ["route", "route_id"],
      "TRON -> TAIRA settlement route",
    ) !== SCCP_XOR_ROUTE_ID
  ) {
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
  const manifest = input.manifest
    ? cloneSccpJsonRouteManifest(
        requireRecord(input.manifest, "SCCP TRON manifest"),
      )
    : null;
  const proofPackage = requireRecord(
    snapshotSccpDataValue(
      input.proofPackage,
      "TRON -> TAIRA source proof package",
    ),
    "TRON -> TAIRA source proof package",
  );
  const events =
    input.events === undefined || input.events === null
      ? null
      : snapshotTronTransactionRecord(
          input.events,
          "TRON source proof package events",
        );
  const settlement = requireTronToTairaSourceSettlement(proofPackage);
  const settlementDefaults = buildTairaXorInboundSettlement({ manifest });
  requireTronToTairaSettlementTargetBinding(settlement, settlementDefaults);
  const bridgeAddress = readSccpTronBridgeAddress(manifest);
  const bound = bindTairaXorTronToTairaSourceProofPackage({
    proofPackage,
    settlementDefaults,
    txId: input.txId,
    tronSender: input.tronSender,
    tairaRecipient,
    amount: amountBaseUnits,
    ...(bridgeAddress ? { bridgeAddress } : {}),
  });
  if (events) {
    const expectedSourceEventDigest = readTronSourceEventDigestFromEvents(
      events,
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

const requireBscToTairaSourceSettlement = (
  proofPackage: Record<string, unknown>,
): Record<string, unknown> => {
  if (
    proofPackage.settlement === undefined ||
    proofPackage.settlement === null
  ) {
    throw new Error("BSC -> TAIRA source proof package settlement is missing.");
  }
  const settlement = requireRecord(
    proofPackage.settlement,
    "BSC -> TAIRA source proof package settlement",
  );
  if (
    readConsistentAliasString(
      settlement,
      ["entrypoint"],
      "BSC -> TAIRA settlement entrypoint",
    ) !== "finalize_inbound"
  ) {
    throw new Error(
      "BSC -> TAIRA settlement entrypoint must be finalize_inbound.",
    );
  }
  if (
    readConsistentAliasString(
      settlement,
      ["route", "route_id"],
      "BSC -> TAIRA settlement route",
    ) !== SCCP_BSC_XOR_ROUTE_ID
  ) {
    throw new Error("BSC -> TAIRA settlement route must be taira_bsc_xor.");
  }
  return settlement;
};

const readConsistentStringAlias = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string => {
  let selectedValue = "";
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`${label} must be text.`);
    }
    const text = value.trim();
    if (!text) {
      continue;
    }
    if (!selectedValue) {
      selectedValue = text;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== text) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${text}.`,
      );
    }
  }
  return selectedValue;
};

const requireBscToTairaSettlementTargetBinding = (
  settlement: Record<string, unknown>,
  settlementDefaults: Record<string, unknown>,
): void => {
  const expectedAlias = readConsistentStringAlias(
    settlementDefaults,
    ["contract_alias", "contractAlias"],
    "BSC -> TAIRA manifest settlement contract alias",
  );
  const expectedAddress = readConsistentStringAlias(
    settlementDefaults,
    ["contract_address", "contractAddress"],
    "BSC -> TAIRA manifest settlement contract address",
  );
  const packageAlias = readConsistentStringAlias(
    settlement,
    ["contract_alias", "contractAlias"],
    "BSC -> TAIRA source proof package settlement contract alias",
  );
  const packageAddress = readConsistentStringAlias(
    settlement,
    ["contract_address", "contractAddress"],
    "BSC -> TAIRA source proof package settlement contract address",
  );
  if (packageAlias && packageAddress) {
    throw new Error(
      "BSC -> TAIRA source proof package settlement must not declare both contract alias and contract address.",
    );
  }
  if (!expectedAlias && !expectedAddress) {
    if (packageAlias || packageAddress) {
      throw new Error(
        "BSC -> TAIRA source proof package settlement target must come from the BSC manifest.",
      );
    }
    return;
  }
  if (expectedAlias) {
    if (packageAddress) {
      throw new Error(
        "BSC -> TAIRA source proof package settlement must not override the manifest contract alias with a contract address.",
      );
    }
    if (packageAlias && packageAlias !== expectedAlias) {
      throw new Error(
        "BSC -> TAIRA source proof package settlement contract alias must match the BSC manifest.",
      );
    }
    return;
  }
  if (packageAlias) {
    throw new Error(
      "BSC -> TAIRA source proof package settlement must not override the manifest contract address with a contract alias.",
    );
  }
  if (packageAddress && packageAddress !== expectedAddress) {
    throw new Error(
      "BSC -> TAIRA source proof package settlement contract address must match the BSC manifest.",
    );
  }
};

const requireTronToTairaSettlementTargetBinding = (
  settlement: Record<string, unknown>,
  settlementDefaults: Record<string, unknown>,
): void => {
  const expectedAlias = readConsistentStringAlias(
    settlementDefaults,
    ["contract_alias", "contractAlias"],
    "TRON -> TAIRA manifest settlement contract alias",
  );
  const expectedAddress = readConsistentStringAlias(
    settlementDefaults,
    ["contract_address", "contractAddress"],
    "TRON -> TAIRA manifest settlement contract address",
  );
  const packageAlias = readConsistentStringAlias(
    settlement,
    ["contract_alias", "contractAlias"],
    "TRON -> TAIRA source proof package settlement contract alias",
  );
  const packageAddress = readConsistentStringAlias(
    settlement,
    ["contract_address", "contractAddress"],
    "TRON -> TAIRA source proof package settlement contract address",
  );
  if (packageAlias && packageAddress) {
    throw new Error(
      "TRON -> TAIRA source proof package settlement must not declare both contract alias and contract address.",
    );
  }
  if (!expectedAlias && !expectedAddress) {
    if (packageAlias || packageAddress) {
      throw new Error(
        "TRON -> TAIRA source proof package settlement target must come from the TRON manifest.",
      );
    }
    return;
  }
  if (expectedAlias) {
    if (packageAddress) {
      throw new Error(
        "TRON -> TAIRA source proof package settlement must not override the manifest contract alias with a contract address.",
      );
    }
    if (packageAlias && packageAlias !== expectedAlias) {
      throw new Error(
        "TRON -> TAIRA source proof package settlement contract alias must match the TRON manifest.",
      );
    }
    return;
  }
  if (packageAlias) {
    throw new Error(
      "TRON -> TAIRA source proof package settlement must not override the manifest contract address with a contract alias.",
    );
  }
  if (packageAddress && packageAddress !== expectedAddress) {
    throw new Error(
      "TRON -> TAIRA source proof package settlement contract address must match the TRON manifest.",
    );
  }
};

const readConsistentAliasString = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
  normalize: (value: string) => string = (value) => value,
): string => {
  let selectedValue = "";
  let selectedKey = "";
  let selectedComparable = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const text = readScalarText(record, key);
    if (!text) {
      continue;
    }
    const comparable = normalize(text);
    if (!selectedValue) {
      selectedValue = text;
      selectedKey = key;
      selectedComparable = comparable;
      continue;
    }
    if (selectedComparable !== comparable) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${text}.`,
      );
    }
  }
  return selectedValue;
};

const readConsistentAliasInteger = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): number | null => {
  let selectedValue: number | null = null;
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = record[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value.trim())
          : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${label} must be a safe non-negative integer.`);
    }
    if (selectedValue === null) {
      selectedValue = parsed;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== parsed) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${parsed}.`,
      );
    }
  }
  return selectedValue;
};

const readConsistentAliasBoolean = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): boolean | null => {
  let selectedValue: boolean | null = null;
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = record[key];
    if (typeof value !== "boolean") {
      throw new Error(`${label} must be boolean.`);
    }
    if (selectedValue === null) {
      selectedValue = value;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== value) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${value}.`,
      );
    }
  }
  return selectedValue;
};

const readConsistentAliasRecord = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): Record<string, unknown> | null => {
  let selectedValue: Record<string, unknown> | null = null;
  let selectedKey = "";
  let selectedComparable = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = requireRecord(record[key], label);
    const comparable = JSON.stringify(stableJsonValue(value));
    if (!selectedValue) {
      selectedValue = value;
      selectedKey = key;
      selectedComparable = comparable;
      continue;
    }
    if (selectedComparable !== comparable) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey} and ${key} carry different records.`,
      );
    }
  }
  return selectedValue;
};

const requireBscSourceProofMaterialHashBinding = (
  proofPackage: Record<string, unknown>,
  input: BscSourceProverMaterialHashBinding,
): BscSourceProverMaterialHashBinding => {
  const expected = {
    proofArtifactHash: normalizeHex32(
      input.proofArtifactHash,
      "BSC source request proofArtifactHash",
    ),
    provingKeyHash: normalizeHex32(
      input.provingKeyHash,
      "BSC source request provingKeyHash",
    ),
    nativeEvmProverBundleHash: normalizeHex32(
      input.nativeEvmProverBundleHash,
      "BSC source request nativeEvmProverBundleHash",
    ),
  };
  const actual = {
    proofArtifactHash: normalizeHex32(
      readConsistentAliasString(
        proofPackage,
        [
          "proofArtifactHash",
          "proof_artifact_hash",
          "proverArtifactHash",
          "prover_artifact_hash",
        ],
        "BSC source proof package proofArtifactHash",
        (value) =>
          normalizeHex32(value, "BSC source proof package proofArtifactHash"),
      ),
      "BSC source proof package proofArtifactHash",
    ),
    provingKeyHash: normalizeHex32(
      readConsistentAliasString(
        proofPackage,
        ["provingKeyHash", "proving_key_hash"],
        "BSC source proof package provingKeyHash",
        (value) =>
          normalizeHex32(value, "BSC source proof package provingKeyHash"),
      ),
      "BSC source proof package provingKeyHash",
    ),
    nativeEvmProverBundleHash: normalizeHex32(
      readConsistentAliasString(
        proofPackage,
        ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
        "BSC source proof package nativeEvmProverBundleHash",
        (value) =>
          normalizeHex32(
            value,
            "BSC source proof package nativeEvmProverBundleHash",
          ),
      ),
      "BSC source proof package nativeEvmProverBundleHash",
    ),
  };
  if (actual.proofArtifactHash !== expected.proofArtifactHash) {
    throw new Error(
      "BSC source proof package proofArtifactHash must match the source request.",
    );
  }
  if (actual.provingKeyHash !== expected.provingKeyHash) {
    throw new Error(
      "BSC source proof package provingKeyHash must match the source request.",
    );
  }
  if (actual.nativeEvmProverBundleHash !== expected.nativeEvmProverBundleHash) {
    throw new Error(
      "BSC source proof package nativeEvmProverBundleHash must match the source request.",
    );
  }
  return expected;
};

const requireBscSourceMessageBundleMerkleRootBinding = (
  messageBundle: Record<string, unknown>,
  options: { checkRoot?: boolean } = {},
): void => {
  const commitmentRecord = requireRecord(
    readFirstValue(messageBundle, "commitment"),
    "BSC source proof package messageBundle.commitment",
  );
  const merkleProofRecord = requireRecord(
    readConsistentAliasRecord(
      messageBundle,
      ["merkle_proof", "merkleProof"],
      "BSC source proof package messageBundle.merkle_proof",
    ),
    "BSC source proof package messageBundle.merkle_proof",
  );
  const rawSteps = merkleProofRecord.steps;
  if (!Array.isArray(rawSteps)) {
    throw new Error(
      "BSC source proof package messageBundle.merkle_proof.steps must be an array.",
    );
  }
  const merkleProof = {
    steps: rawSteps.map((entry, index) => {
      const step = requireRecord(
        entry,
        `BSC source proof package messageBundle.merkle_proof.steps[${index}]`,
      );
      const siblingIsLeft = readConsistentAliasBoolean(
        step,
        ["sibling_is_left", "siblingIsLeft"],
        `BSC source proof package messageBundle.merkle_proof.steps[${index}].sibling_is_left`,
      );
      if (siblingIsLeft === null) {
        throw new Error(
          `BSC source proof package messageBundle.merkle_proof.steps[${index}].sibling_is_left must be boolean.`,
        );
      }
      return {
        sibling_hash: normalizeNonZeroHex32Loose(
          readConsistentAliasString(
            step,
            ["sibling_hash", "siblingHash"],
            `BSC source proof package messageBundle.merkle_proof.steps[${index}].sibling_hash`,
            (value) =>
              normalizeNonZeroHex32Loose(
                value,
                `BSC source proof package messageBundle.merkle_proof.steps[${index}].sibling_hash`,
              ),
          ),
          `BSC source proof package messageBundle.merkle_proof.steps[${index}].sibling_hash`,
        ),
        sibling_is_left: siblingIsLeft,
      };
    }),
  };
  const commitmentVersion = Number(readFirstValue(commitmentRecord, "version"));
  if (!Number.isSafeInteger(commitmentVersion) || commitmentVersion !== 1) {
    throw new Error(
      "BSC source proof package messageBundle.commitment.version must be 1.",
    );
  }
  const commitmentKind = readFirstString(commitmentRecord, "kind");
  if (commitmentKind !== "Transfer") {
    throw new Error(
      "BSC source proof package messageBundle.commitment.kind must be Transfer.",
    );
  }
  const targetDomain = readConsistentAliasInteger(
    commitmentRecord,
    ["target_domain", "targetDomain"],
    "BSC source proof package messageBundle.commitment.target_domain",
  );
  if (targetDomain === null) {
    throw new Error(
      "BSC source proof package messageBundle.commitment.target_domain must be a safe non-negative integer.",
    );
  }
  if (targetDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "BSC source proof package messageBundle.commitment.target_domain must target SORA.",
    );
  }
  const commitment = {
    version: commitmentVersion,
    kind: "Transfer" as const,
    target_domain: targetDomain,
    message_id: normalizeNonZeroHex32Loose(
      readConsistentAliasString(
        commitmentRecord,
        ["message_id", "messageId"],
        "BSC source proof package messageBundle.commitment.message_id",
        (value) =>
          normalizeNonZeroHex32Loose(
            value,
            "BSC source proof package messageBundle.commitment.message_id",
          ),
      ),
      "BSC source proof package messageBundle.commitment.message_id",
    ),
    payload_hash: normalizeNonZeroHex32Loose(
      readConsistentAliasString(
        commitmentRecord,
        ["payload_hash", "payloadHash"],
        "BSC source proof package messageBundle.commitment.payload_hash",
        (value) =>
          normalizeNonZeroHex32Loose(
            value,
            "BSC source proof package messageBundle.commitment.payload_hash",
          ),
      ),
      "BSC source proof package messageBundle.commitment.payload_hash",
    ),
  };
  const actualRoot = normalizeNonZeroHex32Loose(
    readConsistentAliasString(
      messageBundle,
      ["commitment_root", "commitmentRoot"],
      "BSC source proof package messageBundle.commitment_root",
      (value) =>
        normalizeNonZeroHex32Loose(
          value,
          "BSC source proof package messageBundle.commitment_root",
        ),
    ),
    "BSC source proof package messageBundle.commitment_root",
  );
  if (options.checkRoot === false) {
    return;
  }
  const expectedRoot = normalizeNonZeroHex32Loose(
    sccpMerkleRootFromCommitment(commitment, merkleProof),
    "BSC source proof package messageBundle expected commitment_root",
  );
  if (actualRoot !== expectedRoot) {
    throw new Error(
      "BSC source proof package messageBundle commitment_root must match the commitment Merkle proof.",
    );
  }
};

const requireBscSourceProofPublicInputsBinding = (input: {
  proofPackage: Record<string, unknown>;
  messageBundle: Record<string, unknown>;
  txId: string;
  sourceEventDigest: string;
  bscSender: string;
  tairaRecipient: string;
  amountBaseUnits: string;
}): void => {
  const publicInputs = requireRecord(
    readConsistentAliasRecord(
      input.proofPackage,
      ["publicInputs", "public_inputs"],
      "BSC source proof package publicInputs",
    ),
    "BSC source proof package publicInputs",
  );
  const sourceDomain = readConsistentAliasInteger(
    publicInputs,
    ["sourceDomain", "source_domain"],
    "BSC source proof package publicInputs sourceDomain",
  );
  const targetDomain = readConsistentAliasInteger(
    publicInputs,
    ["targetDomain", "target_domain"],
    "BSC source proof package publicInputs targetDomain",
  );
  if (sourceDomain !== SCCP_BSC_DOMAIN || targetDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "BSC source proof package publicInputs must bind BSC -> TAIRA.",
    );
  }

  const commitment = requireRecord(
    input.messageBundle.commitment,
    "BSC source proof package messageBundle.commitment",
  );
  const expectedMessageId = normalizeHex32(
    readConsistentAliasString(
      commitment,
      ["messageId", "message_id"],
      "BSC source proof package messageBundle commitment messageId",
      (value) =>
        normalizeHex32(
          value,
          "BSC source proof package messageBundle commitment messageId",
        ),
    ),
    "BSC source proof package messageBundle commitment messageId",
  );
  const expectedPayloadHash = normalizeHex32(
    readConsistentAliasString(
      commitment,
      ["payloadHash", "payload_hash"],
      "BSC source proof package messageBundle commitment payloadHash",
      (value) =>
        normalizeHex32(
          value,
          "BSC source proof package messageBundle commitment payloadHash",
        ),
    ),
    "BSC source proof package messageBundle commitment payloadHash",
  );
  const expectedCommitmentRoot = normalizeHex32(
    readConsistentAliasString(
      input.messageBundle,
      ["commitmentRoot", "commitment_root"],
      "BSC source proof package messageBundle commitmentRoot",
      (value) =>
        normalizeHex32(
          value,
          "BSC source proof package messageBundle commitmentRoot",
        ),
    ),
    "BSC source proof package messageBundle commitmentRoot",
  );
  const bindings = [
    {
      actual: normalizeHex32(
        readConsistentAliasString(
          publicInputs,
          ["messageId", "message_id"],
          "BSC source proof package publicInputs messageId",
          (value) =>
            normalizeHex32(
              value,
              "BSC source proof package publicInputs messageId",
            ),
        ),
        "BSC source proof package publicInputs messageId",
      ),
      expected: expectedMessageId,
      message:
        "BSC source proof package publicInputs messageId must match messageBundle commitment.",
    },
    {
      actual: normalizeHex32(
        readConsistentAliasString(
          publicInputs,
          ["payloadHash", "payload_hash"],
          "BSC source proof package publicInputs payloadHash",
          (value) =>
            normalizeHex32(
              value,
              "BSC source proof package publicInputs payloadHash",
            ),
        ),
        "BSC source proof package publicInputs payloadHash",
      ),
      expected: expectedPayloadHash,
      message:
        "BSC source proof package publicInputs payloadHash must match messageBundle commitment.",
    },
    {
      actual: normalizeHex32(
        readConsistentAliasString(
          publicInputs,
          ["commitmentRoot", "commitment_root"],
          "BSC source proof package publicInputs commitmentRoot",
          (value) =>
            normalizeHex32(
              value,
              "BSC source proof package publicInputs commitmentRoot",
            ),
        ),
        "BSC source proof package publicInputs commitmentRoot",
      ),
      expected: expectedCommitmentRoot,
      message:
        "BSC source proof package publicInputs commitmentRoot must match messageBundle.",
    },
    {
      actual: normalizeEvmTxHash(
        readConsistentAliasString(
          publicInputs,
          ["txId", "tx_id", "transactionHash"],
          "BSC source proof package publicInputs txId",
          (value) =>
            normalizeEvmTxHash(
              value,
              "BSC source proof package publicInputs txId",
            ),
        ),
        "BSC source proof package publicInputs txId",
      ),
      expected: normalizeEvmTxHash(input.txId, "BSC source proof txId"),
      message:
        "BSC source proof package publicInputs txId must match the source transaction.",
    },
    {
      actual: normalizeHex32(
        readConsistentAliasString(
          publicInputs,
          ["sourceEventDigest", "source_event_digest"],
          "BSC source proof package publicInputs sourceEventDigest",
          (value) =>
            normalizeHex32(
              value,
              "BSC source proof package publicInputs sourceEventDigest",
            ),
        ),
        "BSC source proof package publicInputs sourceEventDigest",
      ),
      expected: normalizeHex32(
        input.sourceEventDigest,
        "BSC source proof sourceEventDigest",
      ),
      message:
        "BSC source proof package publicInputs sourceEventDigest must match the source event digest.",
    },
  ];
  for (const binding of bindings) {
    if (binding.actual !== binding.expected) {
      throw new Error(binding.message);
    }
  }

  const publicAmount = normalizePositiveBaseUnitString(
    readConsistentAliasString(
      publicInputs,
      ["amountBaseUnits", "amount_base_units", "amount"],
      "BSC source proof package publicInputs amount",
    ),
    "BSC source proof package publicInputs amount",
  );
  if (publicAmount !== input.amountBaseUnits) {
    throw new Error(
      "BSC source proof package publicInputs amount must match the bridge request.",
    );
  }
  const publicSender = normalizeBscAddress(
    readConsistentAliasString(
      publicInputs,
      ["sender", "bscSender", "bsc_sender"],
      "BSC source proof package publicInputs sender",
    ),
  );
  if (publicSender !== normalizeBscAddress(input.bscSender)) {
    throw new Error(
      "BSC source proof package publicInputs sender must match the BSC sender.",
    );
  }
  const publicRecipient = readConsistentAliasString(
    publicInputs,
    ["recipient", "tairaRecipient", "taira_recipient"],
    "BSC source proof package publicInputs recipient",
  );
  if (publicRecipient !== input.tairaRecipient) {
    throw new Error(
      "BSC source proof package publicInputs recipient must match the TAIRA recipient.",
    );
  }
  const publicRoute = readConsistentAliasString(
    publicInputs,
    ["routeId", "route_id", "route"],
    "BSC source proof package publicInputs route",
  );
  if (publicRoute !== SCCP_BSC_XOR_ROUTE_ID) {
    throw new Error(
      "BSC source proof package publicInputs route must be taira_bsc_xor.",
    );
  }
};

export const bindBscToTairaSourceProofPackage = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofArtifactHash: string;
  provingKeyHash: string;
  nativeEvmProverBundleHash: string;
  proofPackage: unknown;
  txId: string;
  receipt?: Record<string, unknown>;
  bscSender: string;
  tairaRecipient: string;
  amountDecimal: string;
}): BscToTairaSourceProofPackage => {
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(input.amountDecimal);
  const tairaRecipient = normalizeTairaAccountId(input.tairaRecipient);
  const txId = normalizeEvmTxHash(readRequiredText(input.txId, "txId"), "txId");
  const bscSender = normalizeBscAddress(input.bscSender);
  const manifest = input.manifest
    ? cloneSccpJsonRouteManifest(
        requireRecord(input.manifest, "SCCP BSC manifest"),
      )
    : null;
  const proofPackage = requireRecord(
    snapshotSccpDataValue(
      input.proofPackage,
      "BSC -> TAIRA source proof package",
    ),
    "BSC -> TAIRA source proof package",
  );
  const receipt =
    input.receipt === undefined || input.receipt === null
      ? null
      : snapshotTronTransactionRecord(
          input.receipt,
          "BSC source proof package receipt",
        );
  const settlement = requireBscToTairaSourceSettlement(proofPackage);
  const settlementDefaults = buildTairaXorBscInboundSettlement({ manifest });
  requireBscToTairaSettlementTargetBinding(settlement, settlementDefaults);
  const materialBinding = requireBscSourceProofMaterialHashBinding(
    proofPackage,
    input,
  );
  const sourceMessageBundle = requireRecord(
    readConsistentAliasRecord(
      proofPackage,
      ["messageBundle", "message_bundle"],
      "BSC source proof package messageBundle",
    ),
    "BSC source proof package messageBundle",
  );
  requireBscSourceMessageBundleMerkleRootBinding(sourceMessageBundle, {
    checkRoot: false,
  });
  const bridgeAddress = readSccpBscBridgeAddress(manifest);
  const normalizedBridgeAddress = bridgeAddress
    ? normalizeBscAddress(bridgeAddress)
    : null;
  const bound = bindTairaXorBscToTairaSourceProofPackage({
    proofPackage,
    settlementDefaults,
    txId,
    bscSender,
    tairaRecipient,
    amount: amountBaseUnits,
    ...(normalizedBridgeAddress
      ? { bridgeAddress: normalizedBridgeAddress }
      : {}),
  });
  requireBscSourceMessageBundleMerkleRootBinding(
    bound.messageBundle as Record<string, unknown>,
  );
  requireBscSourceProofPublicInputsBinding({
    proofPackage,
    messageBundle: bound.messageBundle as Record<string, unknown>,
    sourceEventDigest: bound.sourceEventDigest,
    txId: bound.txId,
    bscSender,
    tairaRecipient,
    amountBaseUnits,
  });
  if (receipt) {
    const sourceBridgeAddress = readSccpBscSourceBridgeAddress(manifest);
    if (!sourceBridgeAddress) {
      throw new Error(
        "BSC source proof package receipt binding requires a source bridge address.",
      );
    }
    const receiptBlockNumber = normalizeEvmQuantityText(
      receipt.blockNumber,
      "BSC source proof package receipt block number",
    );
    const receiptBlockHash = normalizeEvmTxHash(
      readConsistentAliasString(
        receipt,
        ["blockHash", "block_hash"],
        "BSC source proof package receipt block hash",
        (value) =>
          normalizeEvmTxHash(
            value,
            "BSC source proof package receipt block hash",
          ),
      ),
      "BSC source proof package receipt block hash",
    );
    const expectedSourceEventDigest = readBscSourceEventDigestFromReceipt(
      receipt,
      {
        sourceBridgeAddress,
        txId,
        receiptBlockHash,
        receiptBlockNumber,
      },
    );
    if (bound.sourceEventDigest !== expectedSourceEventDigest) {
      throw new Error(
        "BSC source proof package digest does not match the bridge source event.",
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
    proofArtifactHash: materialBinding.proofArtifactHash,
    provingKeyHash: materialBinding.provingKeyHash,
    nativeEvmProverBundleHash: materialBinding.nativeEvmProverBundleHash,
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
  const normalized = readConsistentAliasInteger(record, keys, label);
  if (normalized === null) {
    throw new Error(`${label} must be a safe non-negative integer.`);
  }
  return normalized;
};

const readRequiredSubmitText = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string => {
  const text = readConsistentAliasString(record, keys, label);
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
};

const readSubmitByteText = (value: unknown, label: string): string => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return readRequiredText(String(value), label);
  }
  const record = requireRecord(value, label);
  const direct = readConsistentAliasString(record, ["value", "payload"], label);
  if (direct) {
    return direct;
  }
  const variant = readRecordVariant(record, label);
  const variantText = readConsistentAliasString(
    variant.value,
    ["value", "payload"],
    label,
  );
  if (!variantText) {
    throw new Error(`${label} is required.`);
  }
  return variantText;
};

const readRequiredSubmitByteText = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string => {
  let selectedValue = "";
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const text = readSubmitByteText(record[key], label);
    if (!selectedValue) {
      selectedValue = text;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== text) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${text}.`,
      );
    }
  }
  if (!selectedValue) {
    throw new Error(`${label} is required.`);
  }
  return selectedValue;
};

const utf8TextToSubmitHex = (value: unknown, label: string): string =>
  bytesToLowerHex(utf8TextEncoder.encode(readSubmitByteText(value, label)));

const normalizeSubmitHexData = (value: string, label: string): string =>
  normalizeHexData(value, label);

const normalizeSubmitNonZeroHex32 = (value: string, label: string): string =>
  normalizeNonZeroHex32Loose(value, label);

const normalizeSubmitNonZeroHexData = (
  value: string,
  label: string,
): string => {
  const normalized = normalizeSubmitHexData(value, label);
  const body = normalized.slice(2);
  if (!body || /^0+$/u.test(body)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const readRequiredSubmitBoolean = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): boolean => {
  const value = readConsistentAliasBoolean(record, keys, label);
  if (value === null) {
    throw new Error(`${label} must be boolean.`);
  }
  return value;
};

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
        sibling_hash: normalizeSubmitNonZeroHex32(
          readConsistentAliasString(
            step,
            ["sibling_hash", "siblingHash"],
            `messageBundle.merkle_proof.steps[${index}].sibling_hash`,
            (entryValue) =>
              normalizeNonZeroHex32Loose(
                entryValue,
                `messageBundle.merkle_proof.steps[${index}].sibling_hash`,
              ),
          ),
          `messageBundle.merkle_proof.steps[${index}].sibling_hash`,
        ),
        sibling_is_left: readRequiredSubmitBoolean(
          step,
          ["sibling_is_left", "siblingIsLeft"],
          `messageBundle.merkle_proof.steps[${index}].sibling_is_left`,
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
    readRequiredSubmitByteText(
      value,
      ["asset_id", "assetId"],
      "payload.asset_id",
    ),
    "payload.asset_id",
  ),
  amount: readRequiredSubmitText(value, ["amount"], "payload.amount"),
  sender_codec: readRequiredSubmitInteger(
    value,
    ["sender_codec", "senderCodec"],
    "payload.sender_codec",
  ),
  sender: utf8TextToSubmitHex(
    readRequiredSubmitByteText(value, ["sender"], "payload.sender"),
    "payload.sender",
  ),
  recipient_codec: readRequiredSubmitInteger(
    value,
    ["recipient_codec", "recipientCodec"],
    "payload.recipient_codec",
  ),
  recipient: utf8TextToSubmitHex(
    readRequiredSubmitByteText(value, ["recipient"], "payload.recipient"),
    "payload.recipient",
  ),
  route_id_codec: readRequiredSubmitInteger(
    value,
    ["route_id_codec", "routeIdCodec"],
    "payload.route_id_codec",
  ),
  route_id: utf8TextToSubmitHex(
    readRequiredSubmitByteText(
      value,
      ["route_id", "routeId"],
      "payload.route_id",
    ),
    "payload.route_id",
  ),
});

export const buildSccpMessageBundleSubmitPayload = (
  messageBundle: Record<string, unknown>,
): Record<string, unknown> => {
  const bundle = requireRecord(
    snapshotSccpDataValue(messageBundle, "messageBundle"),
    "messageBundle",
  );
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
    version: readRequiredSubmitInteger(
      bundle,
      ["version"],
      "messageBundle.version",
    ),
    commitment_root: normalizeSubmitNonZeroHex32(
      readConsistentAliasString(
        bundle,
        ["commitment_root", "commitmentRoot"],
        "messageBundle.commitment_root",
        (value) =>
          normalizeNonZeroHex32Loose(value, "messageBundle.commitment_root"),
      ),
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
      message_id: normalizeSubmitNonZeroHex32(
        readConsistentAliasString(
          commitment,
          ["message_id", "messageId"],
          "messageBundle.commitment.message_id",
          (value) =>
            normalizeNonZeroHex32Loose(
              value,
              "messageBundle.commitment.message_id",
            ),
        ),
        "messageBundle.commitment.message_id",
      ),
      payload_hash: normalizeSubmitNonZeroHex32(
        readConsistentAliasString(
          commitment,
          ["payload_hash", "payloadHash"],
          "messageBundle.commitment.payload_hash",
          (value) =>
            normalizeNonZeroHex32Loose(
              value,
              "messageBundle.commitment.payload_hash",
            ),
        ),
        "messageBundle.commitment.payload_hash",
      ),
    },
    merkle_proof: serializeSccpMerkleProofForSubmit(
      readConsistentAliasRecord(
        bundle,
        ["merkle_proof", "merkleProof"],
        "messageBundle.merkle_proof",
      ),
    ),
    payload: {
      Transfer: serializeSccpTransferPayloadForSubmit(payload.value),
    },
    finality_proof: normalizeSubmitNonZeroHexData(
      readConsistentAliasString(
        bundle,
        ["finality_proof", "finalityProof"],
        "messageBundle.finality_proof",
        (value) => normalizeHexData(value, "messageBundle.finality_proof"),
      ),
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

export const SCCP_ROUTE_MANIFEST_JSON_ERROR =
  "SCCP route manifest must contain only JSON-serializable enumerable string-keyed data before bridge actions.";

const isPlainSccpJsonRecord = (value: Record<string, unknown>): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isCanonicalSccpArrayIndexKey = (key: string, length: number): boolean => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
};

const cloneSccpJsonValue = (
  value: unknown,
  visiting = new WeakSet<object>(),
): unknown => {
  if (value === null) {
    return null;
  }
  const valueType = typeof value;
  if (valueType !== "object") {
    if (
      valueType === "string" ||
      valueType === "boolean" ||
      (valueType === "number" && Number.isFinite(value))
    ) {
      return value;
    }
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  const objectValue = value as object;
  if (visiting.has(objectValue)) {
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  visiting.add(objectValue);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    if (Array.isArray(objectValue)) {
      const clone: unknown[] = [];
      for (let index = 0; index < objectValue.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
          throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
        }
      }
      for (const key of Reflect.ownKeys(descriptors)) {
        if (key === "length") {
          continue;
        }
        if (
          typeof key !== "string" ||
          !isCanonicalSccpArrayIndexKey(key, objectValue.length)
        ) {
          throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
        }
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
        }
        clone[Number(key)] = cloneSccpJsonValue(descriptor.value, visiting);
      }
      return clone;
    }
    if (!isPlainSccpJsonRecord(objectValue as Record<string, unknown>)) {
      throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
    }
    const clone: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
      }
      if (descriptor.value !== undefined) {
        clone[key] = cloneSccpJsonValue(descriptor.value, visiting);
      }
    }
    return clone;
  } finally {
    visiting.delete(objectValue);
  }
};

export const cloneSccpJsonRouteManifest = (
  manifest: Record<string, unknown>,
): Record<string, unknown> => {
  const cloned = cloneSccpJsonValue(manifest);
  if (typeof cloned !== "object" || cloned === null || Array.isArray(cloned)) {
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  return cloned as Record<string, unknown>;
};

const cloneSccpJsonManifestSet = (manifestSet: unknown): unknown => {
  const cloned = cloneSccpJsonValue(manifestSet);
  if (
    typeof cloned !== "object" ||
    cloned === null ||
    (!Array.isArray(cloned) &&
      !isPlainSccpJsonRecord(cloned as Record<string, unknown>))
  ) {
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  return cloned;
};

const listRecords = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
      throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
    }
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") {
      continue;
    }
    if (
      typeof key !== "string" ||
      !isCanonicalSccpArrayIndexKey(key, value.length)
    ) {
      throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
    }
    const entry = descriptor.value;
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      records[Number(key)] = entry as Record<string, unknown>;
    }
  }
  return records.filter(Boolean);
};

const readManifestListProperty = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    return [];
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  return listRecords(descriptor.value);
};

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
  if (!isPlainSccpJsonRecord(record)) {
    throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
  }
  const descriptors = Object.getOwnPropertyDescriptors(record);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      typeof key !== "string" ||
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(SCCP_ROUTE_MANIFEST_JSON_ERROR);
    }
  }
  return [
    ...readManifestListProperty(record, "manifests"),
    ...readManifestListProperty(record, "items"),
    ...readManifestListProperty(record, "routes"),
    ...readManifestListProperty(record, "proofManifests"),
    ...readManifestListProperty(record, "proof_manifests"),
  ];
};

const unsafeSccpManifestSecretReason = (
  value: unknown,
  path = "SCCP route manifest",
  seen = new WeakSet<object>(),
): string | null => {
  if (isSecretLikeTextValue(value)) {
    return `${path} must not contain recovery phrases or private key material.`;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        return `${path} must contain only enumerable string-keyed data properties.`;
      }
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") {
        continue;
      }
      if (
        typeof key !== "string" ||
        !isCanonicalBscMaterialArrayIndexKey(key, value.length)
      ) {
        return `${path} must contain only enumerable string-keyed data properties.`;
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return `${path}[${key}] must contain only enumerable string-keyed data properties.`;
      }
      const reason = unsafeSccpManifestSecretReason(
        descriptor.value,
        `${path}[${key}]`,
        seen,
      );
      if (reason) {
        return reason;
      }
    }
    return null;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer
  ) {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      return `${path} must contain only enumerable string-keyed data properties.`;
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      return `${path}.${key} must contain only enumerable string-keyed data properties.`;
    }
    if (SCCP_MANIFEST_SECRET_KEY_PATTERN.test(key)) {
      return `${path}.${key} must not contain private key material.`;
    }
    const reason = unsafeSccpManifestSecretReason(
      descriptor.value,
      `${path}.${key}`,
      seen,
    );
    if (reason) {
      return reason;
    }
  }
  return null;
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

const readConsistentRouteAliasString = (
  manifest: Record<string, unknown>,
  keys: string[],
  label: string,
): string => {
  try {
    return readConsistentAliasString(manifest, keys, label);
  } catch (_error) {
    return "";
  }
};

const readConsistentRouteAliasInteger = (
  manifest: Record<string, unknown>,
  keys: string[],
  label: string,
): number | null => {
  try {
    return readConsistentAliasInteger(manifest, keys, label);
  } catch (_error) {
    return null;
  }
};

const readReadinessAliasString = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
  reasons: string[],
): string => {
  try {
    return readConsistentAliasString(record, keys, label);
  } catch (error) {
    reasons.push(
      error instanceof Error ? error.message : `${label} is invalid.`,
    );
    return "";
  }
};

const readReadinessAliasInteger = (
  record: Record<string, unknown>,
  keys: string[],
  label: string,
  reasons: string[],
): number | null => {
  try {
    return readConsistentAliasInteger(record, keys, label);
  } catch (error) {
    reasons.push(
      error instanceof Error ? error.message : `${label} is invalid.`,
    );
    return null;
  }
};

const manifestTargetsBsc = (manifest: Record<string, unknown>): boolean => {
  const counterpartyDomain = readConsistentRouteAliasInteger(
    manifest,
    ["counterpartyDomain", "counterparty_domain"],
    "counterpartyDomain",
  );
  const verifierTarget = readConsistentRouteAliasString(
    manifest,
    ["verifierTarget", "verifier_target"],
    "verifierTarget",
  );
  const chain = readString(manifest, "chain").toLowerCase();
  const codec = readConsistentRouteAliasString(
    manifest,
    ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
    "counterpartyAccountCodecKey",
  );
  return (
    counterpartyDomain === SCCP_BSC_DOMAIN ||
    chain.includes("bsc") ||
    chain.includes("bnb") ||
    (verifierTarget === "EvmContract" && codec === "evm_hex")
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

const normalizeManifestBscNetworkKey = (
  value: string,
): SccpBscNetworkKey | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "bsc-mainnet" ||
    normalized === "bnb-mainnet" ||
    normalized === "mainnet" ||
    normalized === "bsc"
  ) {
    return "mainnet";
  }
  try {
    return normalizeSccpBscNetworkKey(normalized);
  } catch (_error) {
    return null;
  }
};

const readManifestBscNetworkKey = (
  manifest: Record<string, unknown>,
): SccpBscNetworkKey | null => {
  let selectedKey: SccpBscNetworkKey | null = null;
  let selectedField = "";
  let selectedValue = "";
  for (const field of ["bscNetwork", "bsc_network", "network", "chain"]) {
    if (!Object.prototype.hasOwnProperty.call(manifest, field)) {
      continue;
    }
    const value = readString(manifest, field);
    const key = normalizeManifestBscNetworkKey(value);
    if (!key) {
      continue;
    }
    if (!selectedKey) {
      selectedKey = key;
      selectedField = field;
      selectedValue = value;
      continue;
    }
    if (selectedKey !== key) {
      throw new Error(
        `BSC network aliases disagree: ${selectedField}=${selectedValue} but ${field}=${value}.`,
      );
    }
  }
  return selectedKey;
};

const resolveManifestBscNetworkProfile = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): SccpBscNetworkProfile => {
  const manifestForRead = cloneSccpRouteManifestForRead(manifest);
  const declaredNetwork = manifestForRead
    ? readManifestBscNetworkKey(manifestForRead)
    : null;
  return declaredNetwork
    ? SCCP_BSC_NETWORK_PROFILES[declaredNetwork]
    : resolveSccpBscNetworkProfile(bscNetwork);
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

export const readSccpBscRpcEndpoint = (
  manifest: Record<string, unknown> | null | undefined,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): string => {
  const manifestForRead = cloneSccpRouteManifestForRead(manifest);
  const declaredNetwork = manifestForRead
    ? readManifestBscNetworkKey(manifestForRead)
    : null;
  const profile = declaredNetwork
    ? SCCP_BSC_NETWORK_PROFILES[declaredNetwork]
    : resolveSccpBscNetworkProfile(bscNetwork);
  const configuredRpc = manifestForRead
    ? readConsistentAliasString(
        manifestForRead,
        ["bscRpcUrl", "bsc_rpc_url", "evmRpcUrl", "evm_rpc_url"],
        "BSC RPC endpoint",
      )
    : "";
  return configuredRpc || profile.rpcUrl;
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

const manifestMatchesBscNetworkProfile = (
  manifest: Record<string, unknown>,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): boolean => {
  const profile = resolveSccpBscNetworkProfile(bscNetwork);
  let declaredNetwork: SccpBscNetworkKey | null = null;
  try {
    declaredNetwork = readManifestBscNetworkKey(manifest);
  } catch (_error) {
    return false;
  }
  if (declaredNetwork) {
    return declaredNetwork === profile.key;
  }
  return Boolean(readSccpBscProofMaterial(manifest, profile.key));
};

const manifestMatchesRoute = (
  manifest: Record<string, unknown>,
  route: SccpRouteConfig = SCCP_XOR_ROUTE,
): boolean => {
  const routeId = readConsistentRouteAliasString(
    manifest,
    ["routeId", "route_id", "route", "id"],
    "routeId",
  );
  const assetKey = readConsistentRouteAliasString(
    manifest,
    ["assetKey", "asset_key", "assetId", "asset_id"],
    "assetKey",
  );
  return routeId === route.id && assetKey === route.assetKey;
};

export const pickTronSccpManifest = (
  manifestSet: unknown,
  tronNetwork: unknown = SCCP_TRON_NETWORK.key,
): Record<string, unknown> | null =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsTron(manifest) &&
      manifestMatchesRoute(manifest, SCCP_XOR_ROUTE) &&
      manifestMatchesTronNetworkProfile(manifest, tronNetwork),
  ) ?? null;

const hasAnyTronManifest = (manifestSet: unknown): boolean =>
  manifestRecords(manifestSet).some(manifestTargetsTron);

export const pickBscSccpManifest = (
  manifestSet: unknown,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): Record<string, unknown> | null =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsBsc(manifest) &&
      manifestMatchesRoute(manifest, SCCP_BSC_XOR_ROUTE) &&
      manifestMatchesBscNetworkProfile(manifest, bscNetwork),
  ) ?? null;

const hasAnyBscManifest = (manifestSet: unknown): boolean =>
  manifestRecords(manifestSet).some(manifestTargetsBsc);

const SCCP_LANE_MATERIAL_PARAMETER_KEYS = [
  "sccp_lane_materials_v1",
  "sccpLaneMaterialsV1",
] as const;

const readSccpLaneMaterialPayload = (
  parameters: unknown,
): Record<string, unknown> | null => {
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters)
  ) {
    return null;
  }
  const root = parameters as Record<string, unknown>;
  const custom = readFirstRecord(root, "custom") ?? root;
  const container =
    readFirstRecord(custom, ...SCCP_LANE_MATERIAL_PARAMETER_KEYS) ??
    readFirstRecord(root, ...SCCP_LANE_MATERIAL_PARAMETER_KEYS);
  return readFirstRecord(container, "payload") ?? container;
};

const readSccpLaneMaterialRecords = (
  payload: Record<string, unknown> | null,
  ...keys: string[]
): Record<string, unknown>[] => {
  if (!payload) {
    return [];
  }
  for (const key of keys) {
    const value = payload[key];
    const records = listRecords(value);
    if (records.length > 0) {
      return records;
    }
  }
  return [];
};

const sourceLaneRecordMatchesBscNetwork = (
  record: Record<string, unknown>,
  bscProfile: SccpBscNetworkProfile,
): boolean => {
  const sourceDomain = readConsistentRouteAliasInteger(
    record,
    ["sourceDomain", "source_domain", "domain"],
    "sourceDomain",
  );
  if (sourceDomain !== SCCP_BSC_DOMAIN) {
    return false;
  }
  const sourceChain = readConsistentRouteAliasString(
    record,
    ["sourceChain", "source_chain", "chain"],
    "sourceChain",
  ).toLowerCase();
  const networkId = readConsistentRouteAliasString(
    record,
    [
      "sourceBridgeNetworkId",
      "source_bridge_network_id",
      "networkIdHex",
      "network_id_hex",
    ],
    "sourceBridgeNetworkId",
  ).toLowerCase();
  return (
    sourceChain.includes("bsc") &&
    (!networkId || networkId === bscProfile.networkIdHex.toLowerCase())
  );
};

const sourceAdapterDeploymentMatchesBscNetwork = (
  record: Record<string, unknown>,
  bscProfile: SccpBscNetworkProfile,
): boolean => {
  if (!sourceLaneRecordMatchesBscNetwork(record, bscProfile)) {
    return false;
  }
  const targetDomain = readConsistentRouteAliasInteger(
    record,
    ["targetDomain", "target_domain"],
    "targetDomain",
  );
  return targetDomain === null || targetDomain === SCCP_SORA_DOMAIN;
};

export const mergeSccpLaneMaterialsIntoManifestSet = (
  manifestSet: unknown,
  parameters: unknown,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): unknown => {
  if (!manifestSet || !parameters) {
    return manifestSet;
  }
  const payload = readSccpLaneMaterialPayload(parameters);
  if (!payload) {
    return manifestSet;
  }
  const bscProfile = resolveSccpBscNetworkProfile(bscNetwork);
  const sourceVerifierMaterial = readSccpLaneMaterialRecords(
    payload,
    "sccpSourceVerifierMaterials",
    "sccp_source_verifier_materials",
    "sourceVerifierMaterials",
    "source_verifier_materials",
  ).find((record) => sourceLaneRecordMatchesBscNetwork(record, bscProfile));
  const sourceAdapterEngineDeployment = readSccpLaneMaterialRecords(
    payload,
    "sccpSourceAdapterEngineDeployments",
    "sccp_source_adapter_engine_deployments",
    "sourceAdapterEngineDeployments",
    "source_adapter_engine_deployments",
  ).find((record) =>
    sourceAdapterDeploymentMatchesBscNetwork(record, bscProfile),
  );
  if (!sourceVerifierMaterial && !sourceAdapterEngineDeployment) {
    return manifestSet;
  }
  const cloned = cloneSccpJsonManifestSet(manifestSet);
  for (const manifest of manifestRecords(cloned)) {
    if (
      !manifestTargetsBsc(manifest) ||
      !manifestMatchesRoute(manifest, SCCP_BSC_XOR_ROUTE) ||
      !manifestMatchesBscNetworkProfile(manifest, bscProfile.key)
    ) {
      continue;
    }
    if (sourceVerifierMaterial) {
      manifest.sourceVerifierMaterial = cloneBscSourceLaneRecord(
        sourceVerifierMaterial,
        "BSC source verifier material",
      );
    }
    if (sourceAdapterEngineDeployment) {
      manifest.sourceAdapterEngineDeployment = cloneBscSourceLaneRecord(
        sourceAdapterEngineDeployment,
        "BSC source adapter deployment",
      );
    }
  }
  return cloned;
};

const SCCP_CAPABILITIES_DATA_ERROR =
  "SCCP capabilities must contain only enumerable string-keyed data fields.";

const readCapabilityDataProperty = (
  record: Record<string, unknown>,
  key: string,
  label: string,
):
  | { ok: true; present: boolean; value: unknown }
  | { ok: false; reason: string } => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    return { ok: true, present: false, value: undefined };
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    return {
      ok: false,
      reason: `${label}.${key} ${SCCP_CAPABILITIES_DATA_ERROR}`,
    };
  }
  return { ok: true, present: true, value: descriptor.value };
};

const readCapabilityString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const result = readCapabilityDataProperty(record, key, label);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return typeof result.value === "string" ? result.value.trim() : "";
};

const readCapabilityRecord = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> | null => {
  const result = readCapabilityDataProperty(record, key, label);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  if (result.value === undefined || result.value === null) {
    return null;
  }
  if (
    typeof result.value !== "object" ||
    Array.isArray(result.value) ||
    !isPlainSccpJsonRecord(result.value as Record<string, unknown>)
  ) {
    throw new Error(`${label}.${key} ${SCCP_CAPABILITIES_DATA_ERROR}`);
  }
  return result.value as Record<string, unknown>;
};

const readConsistentCapabilityPath = (
  sources: Array<{
    record: Record<string, unknown> | null;
    label: string;
    keys: string[];
  }>,
  label: string,
): string => {
  let selectedValue = "";
  let selectedKey = "";
  for (const source of sources) {
    if (!source.record) {
      continue;
    }
    for (const key of source.keys) {
      const value = readCapabilityString(source.record, key, source.label);
      if (!value) {
        continue;
      }
      const qualifiedKey = `${source.label}.${key}`;
      if (!selectedValue) {
        selectedValue = value;
        selectedKey = qualifiedKey;
        continue;
      }
      if (selectedValue !== value) {
        throw new Error(
          `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${qualifiedKey}=${value}.`,
        );
      }
    }
  }
  return selectedValue;
};

const readCapabilityPath = (
  capabilities: Record<string, unknown> | null | undefined,
  pathKind: "proof" | "message",
): string => {
  if (!capabilities) {
    return "";
  }
  if (pathKind === "proof") {
    return readConsistentCapabilityPath(
      [
        {
          record: capabilities,
          label: "capabilities",
          keys: [
            "proofSubmitPath",
            "proof_submit_path",
            "proofSubmit",
            "proof_submit",
          ],
        },
        {
          record: readCapabilityRecord(capabilities, "submit", "capabilities"),
          label: "capabilities.submit",
          keys: [
            "proof",
            "proofPath",
            "proof_path",
            "proofSubmitPath",
            "proof_submit_path",
          ],
        },
        {
          record: readCapabilityRecord(
            capabilities,
            "submissions",
            "capabilities",
          ),
          label: "capabilities.submissions",
          keys: [
            "proof",
            "proofPath",
            "proof_path",
            "proofSubmitPath",
            "proof_submit_path",
          ],
        },
        {
          record: readCapabilityRecord(capabilities, "paths", "capabilities"),
          label: "capabilities.paths",
          keys: [
            "proof",
            "proofPath",
            "proof_path",
            "proofSubmitPath",
            "proof_submit_path",
          ],
        },
      ],
      "SCCP proof submit path",
    );
  }
  return readConsistentCapabilityPath(
    [
      {
        record: capabilities,
        label: "capabilities",
        keys: [
          "messageSubmitPath",
          "message_submit_path",
          "messageSubmit",
          "message_submit",
        ],
      },
      {
        record: readCapabilityRecord(capabilities, "submit", "capabilities"),
        label: "capabilities.submit",
        keys: [
          "message",
          "messagePath",
          "message_path",
          "messageSubmitPath",
          "message_submit_path",
        ],
      },
      {
        record: readCapabilityRecord(
          capabilities,
          "submissions",
          "capabilities",
        ),
        label: "capabilities.submissions",
        keys: [
          "message",
          "messagePath",
          "message_path",
          "messageSubmitPath",
          "message_submit_path",
        ],
      },
      {
        record: readCapabilityRecord(capabilities, "paths", "capabilities"),
        label: "capabilities.paths",
        keys: [
          "message",
          "messagePath",
          "message_path",
          "messageSubmitPath",
          "message_submit_path",
        ],
      },
    ],
    "SCCP bridge-message submit path",
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
      let decoded = segment;
      let changed = false;
      for (let depth = 0; depth < 8; depth += 1) {
        let next: string;
        try {
          next = decodeURIComponent(decoded);
        } catch (_error) {
          throw new Error(`${label} contains invalid percent encoding.`);
        }
        if (/[\\/]/u.test(next)) {
          throw new Error(`${label} must not contain encoded path separators.`);
        }
        if (next === "." || next === "..") {
          throw new Error(`${label} must not contain path traversal segments.`);
        }
        if (next === decoded) {
          if (changed) {
            throw new Error(
              `${label} must not contain percent-encoded path segments.`,
            );
          }
          return decoded.toLowerCase();
        }
        changed = true;
        decoded = next;
      }
      throw new Error(`${label} contains over-encoded path segments.`);
    });
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
): { ready: boolean; invalid: boolean; reason?: string } => {
  let selectedValue: boolean | null = null;
  let selectedField = "";
  for (const field of ["productionReady", "production_ready"]) {
    if (!Object.prototype.hasOwnProperty.call(manifest, field)) {
      continue;
    }
    const value = manifest[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== "boolean") {
      return {
        ready: false,
        invalid: true,
        reason:
          "The SCCP route production-ready flag is invalid: value must be boolean.",
      };
    }
    if (selectedValue === null) {
      selectedValue = value;
      selectedField = field;
      continue;
    }
    if (selectedValue !== value) {
      return {
        ready: false,
        invalid: true,
        reason: `The SCCP route production-ready flag is invalid: productionReady aliases disagree: ${selectedField}=${selectedValue} but ${field}=${value}.`,
      };
    }
  }
  if (selectedValue === true) {
    return { ready: true, invalid: false };
  }
  if (selectedValue === false || selectedValue === null) {
    return { ready: false, invalid: false };
  }
  return { ready: false, invalid: true };
};

const hasPostDeployLiveEvidence = (
  manifest: Record<string, unknown>,
): boolean =>
  Boolean(
    readFirstRecord(manifest, "postDeployLiveEvidence") ||
      readFirstRecord(manifest, "post_deploy_live_evidence"),
  );

const readPostDeployLiveEvidenceRecord = (
  manifest: Record<string, unknown>,
): Record<string, unknown> | null => {
  let selectedValue: Record<string, unknown> | null = null;
  let selectedKey = "";
  let selectedComparable = "";
  for (const key of ["postDeployLiveEvidence", "post_deploy_live_evidence"]) {
    if (!Object.prototype.hasOwnProperty.call(manifest, key)) {
      continue;
    }
    const rawValue = manifest[key];
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    const value = requireRecord(rawValue, "postDeployLiveEvidence");
    const comparable = JSON.stringify(stableJsonValue(value));
    if (!selectedValue) {
      selectedValue = value;
      selectedKey = key;
      selectedComparable = comparable;
      continue;
    }
    if (selectedComparable !== comparable) {
      throw new Error(
        `postDeployLiveEvidence aliases disagree: ${selectedKey} and ${key} carry different records.`,
      );
    }
  }
  return selectedValue;
};

const validatePostDeployLiveEvidence = (
  manifest: Record<string, unknown>,
): void => {
  const evidence = readPostDeployLiveEvidenceRecord(manifest);
  if (!evidence) {
    throw new Error("The TRON SCCP post-deploy live evidence is missing.");
  }
  const fullTomlReady = readConsistentAliasBoolean(
    evidence,
    ["fullTomlReady", "full_toml_ready"],
    "postDeployLiveEvidence.fullTomlReady",
  );
  if (fullTomlReady !== true) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }

  for (const [value, label] of [
    [
      readConsistentAliasString(
        evidence,
        ["sourceBridgeConfigHash", "source_bridge_config_hash"],
        "postDeployLiveEvidence.sourceBridgeConfigHash",
        (entry) =>
          normalizeNonZeroHex32Loose(
            entry,
            "postDeployLiveEvidence.sourceBridgeConfigHash",
          ),
      ),
      "postDeployLiveEvidence.sourceBridgeConfigHash",
    ],
    [
      readConsistentAliasString(
        evidence,
        ["sourceEventTransactionId", "source_event_transaction_id"],
        "postDeployLiveEvidence.sourceEventTransactionId",
        (entry) =>
          normalizeNonZeroHex32Loose(
            entry,
            "postDeployLiveEvidence.sourceEventTransactionId",
          ),
      ),
      "postDeployLiveEvidence.sourceEventTransactionId",
    ],
    [
      readConsistentAliasString(
        evidence,
        ["routeCanaryEvidenceHash", "route_canary_evidence_hash"],
        "postDeployLiveEvidence.routeCanaryEvidenceHash",
        (entry) =>
          normalizeNonZeroHex32Loose(
            entry,
            "postDeployLiveEvidence.routeCanaryEvidenceHash",
          ),
      ),
      "postDeployLiveEvidence.routeCanaryEvidenceHash",
    ],
    [
      readConsistentAliasString(
        evidence,
        ["routeCanaryTransactionId", "route_canary_transaction_id"],
        "postDeployLiveEvidence.routeCanaryTransactionId",
        (entry) =>
          normalizeNonZeroHex32Loose(
            entry,
            "postDeployLiveEvidence.routeCanaryTransactionId",
          ),
      ),
      "postDeployLiveEvidence.routeCanaryTransactionId",
    ],
  ] as const) {
    normalizeNonZeroHex32Loose(value, label);
  }

  const offlineFullTomlSha256 = readConsistentAliasString(
    evidence,
    ["offlineFullTomlSha256", "offline_full_toml_sha256"],
    "postDeployLiveEvidence.offlineFullTomlSha256",
    (entry) =>
      normalizeNonZeroHex32Loose(
        entry,
        "postDeployLiveEvidence.offlineFullTomlSha256",
      ),
  );
  if (!offlineFullTomlSha256) {
    throw new Error(
      "postDeployLiveEvidence.fullTomlReady requires postDeployLiveEvidence.offlineFullTomlSha256.",
    );
  }
  normalizeNonZeroHex32Loose(
    offlineFullTomlSha256,
    "postDeployLiveEvidence.offlineFullTomlSha256",
  );
};

const validateBscPostDeployLiveEvidence = (
  manifest: Record<string, unknown>,
  bscNetwork: unknown = SCCP_BSC_NETWORK.key,
): void => {
  const bscProfile = resolveManifestBscNetworkProfile(manifest, bscNetwork);
  validatePostDeployLiveEvidence(manifest);
  const evidence = readPostDeployLiveEvidenceRecord(manifest);
  if (!evidence) {
    throw new Error("The BSC SCCP post-deploy live evidence is missing.");
  }
  const sourceBridgeConfigHash = normalizeNonZeroHex32Loose(
    readConsistentAliasString(
      evidence,
      ["sourceBridgeConfigHash", "source_bridge_config_hash"],
      "postDeployLiveEvidence.sourceBridgeConfigHash",
      (entry) =>
        normalizeNonZeroHex32Loose(
          entry,
          "postDeployLiveEvidence.sourceBridgeConfigHash",
        ),
    ),
    "postDeployLiveEvidence.sourceBridgeConfigHash",
  );
  const routeCanaryEvidenceHash = normalizeNonZeroHex32Loose(
    readConsistentAliasString(
      evidence,
      ["routeCanaryEvidenceHash", "route_canary_evidence_hash"],
      "postDeployLiveEvidence.routeCanaryEvidenceHash",
      (entry) =>
        normalizeNonZeroHex32Loose(
          entry,
          "postDeployLiveEvidence.routeCanaryEvidenceHash",
        ),
    ),
    "postDeployLiveEvidence.routeCanaryEvidenceHash",
  );
  if (sourceBridgeConfigHash === routeCanaryEvidenceHash) {
    throw new Error(
      "postDeployLiveEvidence source bridge config hash and route canary evidence hash must be distinct.",
    );
  }
  const sourceEventTransactionId = normalizeNonZeroHex32Loose(
    readConsistentAliasString(
      evidence,
      ["sourceEventTransactionId", "source_event_transaction_id"],
      "postDeployLiveEvidence.sourceEventTransactionId",
      (entry) =>
        normalizeNonZeroHex32Loose(
          entry,
          "postDeployLiveEvidence.sourceEventTransactionId",
        ),
    ),
    "postDeployLiveEvidence.sourceEventTransactionId",
  );
  const routeCanaryTransactionId = normalizeNonZeroHex32Loose(
    readConsistentAliasString(
      evidence,
      ["routeCanaryTransactionId", "route_canary_transaction_id"],
      "postDeployLiveEvidence.routeCanaryTransactionId",
      (entry) =>
        normalizeNonZeroHex32Loose(
          entry,
          "postDeployLiveEvidence.routeCanaryTransactionId",
        ),
    ),
    "postDeployLiveEvidence.routeCanaryTransactionId",
  );
  if (sourceEventTransactionId === routeCanaryTransactionId) {
    throw new Error(
      "postDeployLiveEvidence source event and route canary transaction ids must be distinct.",
    );
  }
  const sourceEventExplorerUrlKeys = [
    "sourceEventExplorerUrl",
    "source_event_explorer_url",
    "sourceEventTransactionUrl",
    "source_event_transaction_url",
  ];
  const routeCanaryExplorerUrlKeys = [
    "routeCanaryExplorerUrl",
    "route_canary_explorer_url",
    "routeCanaryTransactionUrl",
    "route_canary_transaction_url",
  ];
  const sourceEventExplorerUrl = readConsistentAliasString(
    evidence,
    sourceEventExplorerUrlKeys,
    "postDeployLiveEvidence.sourceEventExplorerUrl",
  );
  const routeCanaryExplorerUrl = readConsistentAliasString(
    evidence,
    routeCanaryExplorerUrlKeys,
    "postDeployLiveEvidence.routeCanaryExplorerUrl",
  );
  normalizeBscExplorerTransactionUrl(
    sourceEventExplorerUrl ||
      (!hasAnyOwnKey(evidence, sourceEventExplorerUrlKeys)
        ? `${bscProfile.explorerUrl}/tx/${sourceEventTransactionId}`
        : ""),
    "postDeployLiveEvidence.sourceEventExplorerUrl",
    sourceEventTransactionId,
    bscProfile.key,
  );
  normalizeBscExplorerTransactionUrl(
    routeCanaryExplorerUrl ||
      (!hasAnyOwnKey(evidence, routeCanaryExplorerUrlKeys)
        ? `${bscProfile.explorerUrl}/tx/${routeCanaryTransactionId}`
        : ""),
    "postDeployLiveEvidence.routeCanaryExplorerUrl",
    routeCanaryTransactionId,
    bscProfile.key,
  );
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
  counterparty?: unknown;
  route?: SccpRouteConfig;
  tronNetwork?: unknown;
  bscNetwork?: unknown;
}): SccpRouteReadiness => {
  const reasons: string[] = [];
  const route =
    input.route ??
    resolveSccpRouteProfile(input.counterparty ?? SCCP_XOR_ROUTE.counterparty);
  const tronProfile = resolveSccpTronNetworkProfile(
    input.tronNetwork ?? SCCP_TRON_NETWORK.key,
  );
  const bscProfile = resolveSccpBscNetworkProfile(
    input.bscNetwork ?? SCCP_BSC_NETWORK.key,
  );
  if (!isTairaSccpNetwork(input.connection)) {
    reasons.push("Switch to the TAIRA testnet profile.");
  }

  const capabilities = input.capabilities;
  let proofSubmitPath = "";
  let messageSubmitPath = "";
  let capabilityPathError = "";
  if (capabilities) {
    try {
      proofSubmitPath = readCapabilityPath(capabilities, "proof");
      messageSubmitPath = readCapabilityPath(capabilities, "message");
    } catch (error) {
      capabilityPathError =
        error instanceof Error
          ? error.message
          : "This Torii endpoint exposes ambiguous SCCP submit endpoints.";
    }
  }
  if (!capabilities) {
    reasons.push("SCCP capabilities have not been loaded.");
  } else if (capabilityPathError) {
    reasons.push(capabilityPathError);
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

  let manifestSetForReadiness: unknown = input.manifestSet;
  let manifestJsonReason = "";
  if (input.manifestSet) {
    try {
      manifestSetForReadiness = cloneSccpJsonManifestSet(input.manifestSet);
    } catch (error) {
      manifestSetForReadiness = null;
      manifestJsonReason =
        error instanceof Error ? error.message : SCCP_ROUTE_MANIFEST_JSON_ERROR;
    }
  }
  const tronManifest =
    route.counterparty === "tron" && !manifestJsonReason
      ? pickTronSccpManifest(manifestSetForReadiness, tronProfile.key)
      : null;
  const bscManifest =
    route.counterparty === "bsc" && !manifestJsonReason
      ? pickBscSccpManifest(manifestSetForReadiness, bscProfile.key)
      : null;
  const manifest = route.counterparty === "bsc" ? bscManifest : tronManifest;
  const manifestSecretReason = manifest
    ? unsafeSccpManifestSecretReason(manifest)
    : null;
  const manifestContainsSecretLikeMaterial = Boolean(manifestSecretReason);
  if (!input.manifestSet) {
    reasons.push("SCCP proof manifests have not been loaded.");
  } else if (manifestJsonReason) {
    reasons.push(manifestJsonReason);
  } else if (route.counterparty === "tron" && !tronManifest) {
    reasons.push(
      hasAnyTronManifest(manifestSetForReadiness)
        ? `No ${SCCP_XOR_ROUTE_ID} TRON SCCP manifest is advertised by this endpoint.`
        : "No TRON SCCP manifest is advertised by this endpoint.",
    );
  } else if (route.counterparty === "bsc" && !bscManifest) {
    reasons.push(
      hasAnyBscManifest(manifestSetForReadiness)
        ? `No ${SCCP_BSC_XOR_ROUTE_ID} BSC testnet SCCP manifest is advertised by this endpoint.`
        : "No BSC SCCP manifest is advertised by this endpoint.",
    );
  } else if (manifestSecretReason) {
    reasons.push("SCCP route manifest contains secret-like material.");
  } else if (tronManifest) {
    const productionReady = readProductionReadyFlag(tronManifest);
    const disabledReason = readReadinessAliasString(
      tronManifest,
      ["disabledReason", "disabled_reason"],
      "disabledReason",
      reasons,
    );
    const allowSelectedTestnetRoute = manifestAllowsSelectedTestnetRoute(
      tronManifest,
      tronProfile,
      productionReady,
    );
    if (productionReady.invalid) {
      reasons.push(
        productionReady.reason ??
          "The TRON SCCP route production-ready flag is invalid.",
      );
    } else if (productionReady.ready && disabledReason) {
      reasons.push(
        "The TRON SCCP route is marked production-ready but also carries a disabled reason.",
      );
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
  } else if (bscManifest) {
    const productionReady = readProductionReadyFlag(bscManifest);
    const disabledReason = readReadinessAliasString(
      bscManifest,
      ["disabledReason", "disabled_reason"],
      "disabledReason",
      reasons,
    );
    if (productionReady.invalid) {
      reasons.push(
        productionReady.reason ??
          "The BSC SCCP route production-ready flag is invalid.",
      );
    } else if (productionReady.ready && disabledReason) {
      reasons.push(
        "The BSC SCCP route is marked production-ready but also carries a disabled reason.",
      );
    } else if (!productionReady.ready) {
      reasons.push(
        disabledReason || "The BSC SCCP route is not production-ready.",
      );
    }
    if (productionReady.ready) {
      const placeholderReason = bscProductionPlaceholderReason(bscManifest);
      if (placeholderReason) {
        reasons.push(
          `The BSC SCCP route manifest contains placeholder, fixture-only, or test-only material: ${placeholderReason}.`,
        );
      }
    }
    const codecKey = readReadinessAliasString(
      bscManifest,
      ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
      "counterpartyAccountCodecKey",
      reasons,
    );
    const codecId = readReadinessAliasInteger(
      bscManifest,
      ["counterpartyAccountCodec", "counterparty_account_codec"],
      "counterpartyAccountCodec",
      reasons,
    );
    if (codecKey && codecKey !== "evm_hex") {
      reasons.push("The BSC route must use the evm_hex account codec.");
    }
    if (codecId !== null && codecId !== SCCP_CODEC_EVM_HEX) {
      reasons.push("The BSC route must use the EVM hex account codec id.");
    }
    let bridgeAddress = "";
    try {
      bridgeAddress = readSccpBscBridgeAddress(bscManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC bridge deployment address aliases are invalid.",
      );
    }
    if (!bridgeAddress) {
      reasons.push("The BSC bridge deployment address is missing.");
    } else {
      try {
        normalizeEvmAddress(bridgeAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The BSC bridge deployment address is invalid: ${error.message}`
            : "The BSC bridge deployment address is invalid.",
        );
      }
    }
    let tokenAddress = "";
    try {
      tokenAddress = readSccpBscTokenAddress(bscManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC TairaXOR token deployment address aliases are invalid.",
      );
    }
    if (!tokenAddress) {
      reasons.push("The BSC TairaXOR token deployment address is missing.");
    } else {
      try {
        normalizeEvmAddress(tokenAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The BSC TairaXOR token deployment address is invalid: ${error.message}`
            : "The BSC TairaXOR token deployment address is invalid.",
        );
      }
    }
    let sourceBridgeAddress = "";
    try {
      sourceBridgeAddress = readSccpBscSourceBridgeAddress(bscManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC source bridge deployment address aliases are invalid.",
      );
    }
    if (!sourceBridgeAddress) {
      reasons.push("The BSC source bridge deployment address is missing.");
    } else {
      try {
        normalizeEvmAddress(sourceBridgeAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The BSC source bridge deployment address is invalid: ${error.message}`
            : "The BSC source bridge deployment address is invalid.",
        );
      }
    }
    let verifierAddress = "";
    try {
      verifierAddress = readSccpBscVerifierAddress(bscManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC verifier deployment address aliases are invalid.",
      );
    }
    if (!verifierAddress) {
      reasons.push("The BSC verifier deployment address is missing.");
    } else {
      try {
        normalizeEvmAddress(verifierAddress);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? `The BSC verifier deployment address is invalid: ${error.message}`
            : "The BSC verifier deployment address is invalid.",
        );
      }
    }
    const bscProofMaterial = readSccpBscProofMaterial(
      bscManifest,
      bscProfile.key,
    );
    if (!bscProofMaterial) {
      reasons.push(
        readSccpBscProofMaterialFailureReason(bscManifest, bscProfile.key),
      );
    }
    const runtimeProverConfigUrl =
      readSccpBscRuntimeProverConfigUrl(bscManifest);
    if (!runtimeProverConfigUrl) {
      reasons.push("The BSC runtime prover config URL is missing.");
    } else {
      try {
        normalizeSccpPackageOrRemoteModuleUrl(
          runtimeProverConfigUrl,
          "BSC runtime prover config URL",
        );
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? error.message
            : "The BSC runtime prover config URL is invalid.",
        );
      }
    }
    try {
      readBscDestinationBindingInput(bscManifest, bscProfile.key);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC SCCP verifier rollout proof material is incomplete.",
      );
    }
    try {
      requireBscSourceLaneMaterial(bscManifest);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : "The BSC SCCP source verifier material is incomplete.",
      );
    }
    const diagnosticVerifierReasons = bscDiagnosticVerifierMaterialReasons(
      bscManifest,
      bscProofMaterial,
    );
    if (diagnosticVerifierReasons.length > 0) {
      reasons.push(
        `The BSC SCCP verifier material is diagnostic and must be replaced before production readiness: ${diagnosticVerifierReasons.join("; ")}.`,
      );
    }
    reasons.push(
      ...bscNativeEvmProverBundleReadinessReasons(
        bscManifest,
        bscProofMaterial,
        bscProfile.key,
      ),
    );
    if (productionReady.ready || hasPostDeployLiveEvidence(bscManifest)) {
      try {
        validateBscPostDeployLiveEvidence(bscManifest, bscProfile.key);
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? error.message.replace(/TRON/gu, "BSC")
            : "The BSC SCCP post-deploy live evidence is incomplete.",
        );
      }
    }
    const burnRecordMaterial =
      readSccpTairaBurnRecordMaterialResult(bscManifest);
    if (!burnRecordMaterial.material) {
      reasons.push(
        burnRecordMaterial.reason ??
          "The TAIRA burn-record ZK contract material is missing.",
      );
    }
    const burnRecord = readFirstRecord(
      bscManifest,
      "tairaXorBurnRecord",
      "taira_xor_burn_record",
      "burnRecord",
      "burn_record",
      "sourceRecordContract",
      "source_record_contract",
    );
    const artifactSha256 = readBurnRecordArtifactSha256(
      bscManifest,
      burnRecord,
    );
    if (!artifactSha256) {
      reasons.push("The BSC TAIRA burn-record artifact SHA-256 is missing.");
    } else {
      try {
        const normalizedArtifactSha256 = normalizeNonZeroHex32Loose(
          artifactSha256,
          "BSC TAIRA burn-record artifact SHA-256",
        );
        const artifactBytes = burnRecordMaterial.material
          ? strictBase64DecodedBytes(
              burnRecordMaterial.material.contractArtifactB64,
            )
          : null;
        if (artifactBytes) {
          const computedArtifactSha256 = bytesToLowerHex(sha256(artifactBytes));
          if (computedArtifactSha256 !== normalizedArtifactSha256) {
            reasons.push(
              "The BSC TAIRA burn-record artifact SHA-256 does not match the contract artifact.",
            );
          }
        } else if (burnRecordMaterial.material) {
          reasons.push(
            "The BSC TAIRA burn-record contract artifact must be strict base64.",
          );
        }
      } catch (error) {
        reasons.push(
          error instanceof Error
            ? error.message
            : "The BSC TAIRA burn-record artifact SHA-256 is invalid.",
        );
      }
    }
    const distinctDeploymentAddresses = [
      bridgeAddress,
      tokenAddress,
      sourceBridgeAddress,
      verifierAddress,
    ]
      .map((address) => {
        try {
          return address ? normalizeEvmAddress(address) : "";
        } catch (_error) {
          return "";
        }
      })
      .filter(Boolean);
    if (
      distinctDeploymentAddresses.length === 4 &&
      new Set(distinctDeploymentAddresses).size !== 4
    ) {
      reasons.push("BSC deployment contract addresses must be distinct.");
    }
  }

  return {
    ready: reasons.length === 0,
    status:
      reasons.length === 0
        ? "ready"
        : manifest && capabilities
          ? "disabled"
          : capabilities || input.manifestSet
            ? "incomplete"
            : "unavailable",
    reasons,
    counterparty: route.counterparty,
    manifest: manifestContainsSecretLikeMaterial ? null : manifest,
    tronManifest: manifestContainsSecretLikeMaterial ? null : tronManifest,
    bscManifest: manifestContainsSecretLikeMaterial ? null : bscManifest,
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

export const bscWalletConnectSessionFromAddress = (
  address: string,
  topic: string | null = null,
  chainId = SCCP_BSC_NETWORK.caipChainId,
): WalletConnectSessionSnapshot => ({
  topic,
  address: normalizeEvmAddress(address),
  chainId,
  namespace: "eip155",
  methodVersion: "eip155-v1",
  connectedAtMs: Date.now(),
});

import { clipboard, contextBridge, ipcRenderer } from "electron";
import { secp256k1 } from "@noble/curves/secp256k1";
import { blake2b } from "@noble/hashes/blake2b";
import { keccak_256 } from "@noble/hashes/sha3";
import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ToriiClient,
  buildPrivateCreateKaigiTransaction,
  buildPrivateEndKaigiTransaction,
  buildPrivateJoinKaigiTransaction,
  buildConfidentialTransferProofV2,
  buildConfidentialUnshieldProofV2,
  buildConfidentialUnshieldProofV3,
  buildPrivateKaigiFeeSpend,
  buildCreateKaigiTransaction,
  buildEndKaigiTransaction,
  buildJoinKaigiTransaction,
  buildShieldTransaction,
  buildUnshieldTransaction,
  buildZkTransferTransaction,
  buildTransaction,
  buildIvmProvedTransaction,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  compileKotodamaProgram,
  submitTransactionEntrypoint,
  hashSignedTransaction,
  extractPipelineStatusKind,
  normalizeAssetHoldingId,
  type KaigiCallView,
  type ToriiBridgeMessageSubmitPayload,
  type ToriiBridgeProofSubmitPayload,
  type ToriiGovernanceDeployContractProposalRequest,
  type ToriiSccpEvmDestinationQueryOptions,
  type ToriiSumeragiStatus,
} from "@iroha/iroha-js";
import {
  bindTairaXorBscToTairaSourceProofPackage,
  buildBscPlaceholderSourceChainProofEnvelope,
  buildBscSourceChainProofEnvelope,
  buildBscMainnetSccpDestinationProofRequest,
  buildBscTestnetSccpDestinationProofRequest,
  parseTronTriggerSmartContractRawData,
  type EvmSccpProofRequestInput,
} from "@iroha/iroha-js/sccp";
import {
  buildKaigiRosterJoinProof,
  generateKeyPair as generateSdkKeyPair,
  normalizeCryptoAlgorithm,
  privateKeyMultihash,
  publicKeyFromPrivate,
  sign,
  supportedCryptoAlgorithms,
} from "@iroha/iroha-js/crypto";
import {
  DEFAULT_SIGNING_ALGORITHM,
  signingAlgorithmLabel,
} from "../src/utils/signingAlgorithms";
import {
  confidentialModeSupportsShield,
  formatOnboardingError,
  isPositiveWholeAmount,
  normalizeAccountAssetListPayload,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  normalizeExplorerAccountQrPayload,
  normalizeGovernanceCitizenCountPayload,
  normalizeGovernanceCouncilCurrentPayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readApiErrorDetail,
  readNexusUnbondingDelayMs,
  stripConfidentialFeeSponsor,
  type ConfidentialAssetPolicyView,
  type ExplorerAccountQrResponse,
  type PublicLaneRewardsResponseView,
  type PublicLaneStakeResponseView,
  type PublicLaneValidatorsResponseView,
} from "./preload-utils";
import {
  extractGovernanceStats,
  extractRuntimeStatsFromStatusSnapshot,
  normalizeExplorerAssetDefinitionEconometricsPayload,
  normalizeExplorerAssetDefinitionSnapshotPayload,
} from "./networkStats";
import {
  areAssetDefinitionIdsEquivalent,
  buildAssetHoldingIdLiteral,
  extractAssetDefinitionId,
  resolveUniqueLiveAssetDefinitionId,
} from "../src/utils/assetId";
import {
  normalizeSoraCloudStatusPayload,
  unavailableSoraCloudStatus,
  type SoraCloudStatusView,
  type SoraCloudStorageClass,
} from "../src/utils/soracloud";
import {
  extractChainMetadataFromPayload,
  normalizeChainMetadata,
  type ChainMetadata,
  type ChainMetadataDraft,
} from "../src/utils/chainMetadata";
import type { NetworkStatsResponse } from "../src/types/iroha";
import {
  readTransactionFee,
  type TransactionFeeLike,
} from "../src/utils/transactionFee";
import { isSecretLikeTextValue } from "../src/utils/secretLike";
import { deriveOnChainShieldedBalance } from "../src/utils/confidential";
import { nodeFetch } from "./nodeFetch";
import {
  readKnownTairaFaucetFundingIssue,
  requestFaucetFundsWithPuzzle,
  type AccountFaucetResponse,
  type FaucetRequestProgress,
} from "./faucetApi";
import { computeFaucetClaimRetryDelayMs } from "./faucetRetry";
import {
  bootstrapPortableConnectPreviewSession,
  resolvePortableConnectLaunchUri,
} from "./connectPreview";
import {
  getSccpNileTestTronSignerStatus,
  signSccpNileTestTronTransaction,
  type SccpNileTestTronSignerStatus,
  type SccpNileTestTronTransactionSignInput,
} from "./tronTestSigner";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
  normalizeCompatAccountIdLiteral,
} from "./accountAddress";
import {
  decryptKaigiPayload,
  decryptKaigiPayloadWithSecret,
  encryptKaigiPayload,
  encryptKaigiPayloadWithSecret,
  generateKaigiX25519KeyPair,
  type KaigiSealedBox,
  type KaigiSecretBox,
  type KaigiX25519KeyPair,
} from "./kaigiCrypto";
import {
  buildWalletConfidentialMetadataV3,
  collectWalletConfidentialLedger,
  CONFIDENTIAL_WALLET_METADATA_SCHEMA,
  createWalletConfidentialNote,
  deriveWalletConfidentialNullifierHex,
  deriveWalletConfidentialOwnerTagHex,
  deriveWalletConfidentialReceiveAddress,
  selectWalletConfidentialNotes,
  selectWalletConfidentialNotesForExactAmount,
  type WalletConfidentialTransactionLike,
  type WalletSpendableConfidentialNote,
} from "./confidentialWallet";
import {
  configureIrohaJsNativeDir,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { buildSoraCloudHfDeployRequest } from "./soraCloudDeployRequest";
import { type ConfidentialReceiveKeyRecord } from "./secureVault";
import {
  CONFIDENTIAL_WALLET_BACKUP_KDF_INFO,
  CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
  type ConfidentialWalletBackupMetadata,
  type ConfidentialWalletBackupMetadataV2,
  type ConfidentialWalletBackupStateBoxV2,
} from "../src/utils/walletBackup";
import { normalizeMnemonicPhrase } from "../src/utils/mnemonic";
import {
  snapshotSccpDataValue,
  snapshotSccpJsonDataValue,
} from "../src/utils/sccpDataSnapshot";

type HexString = string;

configureIrohaJsNativeDir(import.meta.url);

type ToriiConfig = {
  toriiUrl: string;
};

type ChainMetadataResponse = ChainMetadata;
type SigningAlgorithmOption = {
  id: string;
  label: string;
  isDefault: boolean;
};
type RuntimeConfigResponse = {
  walletConnectProjectId: string;
  sccpBscE2eWallet: string;
};
const DEFAULT_SCCP_PROVER_V8_HEAP_MB = 8192;
const MIN_SCCP_PROVER_V8_HEAP_MB = 1024;
const MAX_SCCP_PROVER_V8_HEAP_MB = 32768;

const KNOWN_CHAIN_METADATA_FALLBACKS = [
  {
    toriiUrl: "https://minamoto.sora.org",
    chainId: "00000000-0000-0000-0000-000000000000",
    networkPrefix: 753,
  },
  {
    toriiUrl: "https://taira.sora.org",
    chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
    networkPrefix: 369,
  },
] as const;

const trimString = (value: unknown): string => String(value ?? "").trim();
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRuntimeConfigEnv = (name: string): string =>
  trimString(process.env[name]);

const getRuntimeConfigSnapshot = (): RuntimeConfigResponse => ({
  walletConnectProjectId: readRuntimeConfigEnv(
    "VITE_WALLETCONNECT_PROJECT_ID",
  ),
  sccpBscE2eWallet: readRuntimeConfigEnv("VITE_SCCP_BSC_E2E_WALLET"),
});

const SECRET_LIKE_PAYLOAD_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const SIGNING_HELPER_PAYLOAD_KEY_PATTERN =
  /^(?:privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;

const assertNoSecretLikePayloadFields = (
  value: unknown,
  path: string,
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material before Torii submission.`,
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoSecretLikePayloadFields(entry, `${path}[${index}]`, seen);
    });
    return;
  }
  if (!isPlainRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_LIKE_PAYLOAD_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.${key} must not be submitted to Torii.`);
    }
    if (SIGNING_HELPER_PAYLOAD_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not include detached signature helper payloads inside SCCP material.`,
      );
    }
    assertNoSecretLikePayloadFields(child, `${path}.${key}`, seen);
  }
};

const extractConfidentialFeeMetadata = (
  metadata: Record<string, unknown> | undefined,
  operationLabel: string,
): Record<string, unknown> | undefined => {
  if (!isPlainRecord(metadata)) {
    return undefined;
  }
  const allowedEntries = Object.entries(metadata).filter(([key]) =>
    ["fee_sponsor", "gas_asset_id", "gas_limit"].includes(key),
  );
  if (allowedEntries.length !== Object.keys(metadata).length) {
    throw new Error(
      `${operationLabel} does not allow public metadata or memos.`,
    );
  }
  return Object.fromEntries(allowedEntries);
};
const withConfidentialGasMetadata = (
  _toriiUrl: string,
  assetDefinitionId: string,
  metadata?: Record<string, unknown>,
): Record<string, unknown> => {
  const gasAssetId = trimString(metadata?.gas_asset_id ?? assetDefinitionId);
  if (!gasAssetId) {
    throw new Error(
      "Confidential transaction metadata requires a non-empty gas asset id.",
    );
  }
  return {
    ...(isPlainRecord(metadata) ? metadata : {}),
    gas_asset_id: gasAssetId,
  };
};
const SORA_XOR_GAS_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const DEFAULT_GAS_ASSET_DISABLED_ORIGINS = new Set([
  "https://minamoto.sora.org",
]);
const shouldAttachDefaultGasAssetMetadata = (toriiUrlRaw?: string) => {
  if (!toriiUrlRaw) {
    return true;
  }
  try {
    return !DEFAULT_GAS_ASSET_DISABLED_ORIGINS.has(
      new URL(normalizeBaseUrl(toriiUrlRaw)).origin,
    );
  } catch {
    return true;
  }
};
const withRequiredGasAssetMetadata = (
  metadata: Record<string, unknown> | undefined,
  toriiUrl?: string,
) => {
  const baseMetadata = isPlainRecord(metadata) ? { ...metadata } : {};
  if (!shouldAttachDefaultGasAssetMetadata(toriiUrl)) {
    delete baseMetadata.gas_asset_id;
    return baseMetadata;
  }
  return {
    ...baseMetadata,
    gas_asset_id: SORA_XOR_GAS_ASSET_DEFINITION_ID,
  };
};
const FAUCET_CLAIM_STATUS_TIMEOUT_MS = 240_000;
const FAUCET_CLAIM_STATUS_INTERVAL_MS = 1_000;
const FAUCET_CLAIM_INVISIBLE_RETRY_MS = 20_000;
const FAUCET_FINALITY_STALE_MS = 5 * 60_000;
const FAUCET_CLAIM_MAX_ATTEMPTS = 6;

const isSecureVaultAvailable = async (): Promise<boolean> =>
  Boolean(await ipcRenderer.invoke("vault:isAvailable"));

const assertSecureVaultAvailable = async (operationLabel: string) => {
  if (await isSecureVaultAvailable()) {
    return;
  }
  throw new Error(
    `${operationLabel} requires secure OS-backed key storage on this device.`,
  );
};

const storeAccountSecretInVault = async (input: {
  accountId: string;
  privateKeyHex: string;
  signingAlgorithm?: string;
}): Promise<void> => {
  await ipcRenderer.invoke("vault:storeAccountSecret", input);
};

type AccountSecretMaterial = {
  privateKeyHex: string;
  signingAlgorithm: string;
};

const getAccountSecretMaterialFromVault = async (
  accountId: string,
): Promise<AccountSecretMaterial | null> =>
  (await ipcRenderer.invoke("vault:getAccountSecretMaterial", {
    accountId,
  })) as AccountSecretMaterial | null;

const listAccountSecretFlagsFromVault = async (
  accountIds: string[],
): Promise<Record<string, boolean>> =>
  (await ipcRenderer.invoke("vault:listAccountSecretFlags", {
    accountIds,
  })) as Record<string, boolean>;

const storeConfidentialReceiveKeyInVault = async (
  input: ConfidentialReceiveKeyRecord,
): Promise<ConfidentialReceiveKeyRecord> =>
  (await ipcRenderer.invoke(
    "vault:storeReceiveKey",
    input,
  )) as ConfidentialReceiveKeyRecord;

const listConfidentialReceiveKeysForAccount = async (
  accountId: string,
): Promise<ConfidentialReceiveKeyRecord[]> => {
  const result = (await ipcRenderer.invoke("vault:listReceiveKeysForAccount", {
    accountId,
  })) as unknown;
  return Array.isArray(result)
    ? (result as ConfidentialReceiveKeyRecord[])
    : [];
};

type HealthResponse = Awaited<ReturnType<ToriiClient["getHealth"]>>;
type StatusSnapshot = Awaited<ReturnType<ToriiClient["getStatusSnapshot"]>>;
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  domainId: string;
  metadata?: Record<string, unknown>;
  authorityAccountId: string;
  authorityPrivateKeyHex?: HexString;
  authoritySigningAlgorithm?: string;
};

type TransferAssetInput = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  accountId: string;
  destinationAccountId?: string;
  networkPrefix?: number;
  quantity: string;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
  metadata?: Record<string, unknown>;
  shielded?: boolean;
  unshield?: boolean;
  shieldedRecipient?: {
    receiveKeyId?: string;
    receivePublicKeyBase64Url?: string;
    ownerTagHex?: string;
    diversifierHex?: string;
  };
  shieldedReceiveKeyId?: string;
  shieldedReceivePublicKeyBase64Url?: string;
  shieldedOwnerTagHex?: string;
  shieldedDiversifierHex?: string;
};

type UranaiPrivateTradeProofInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  assetDefinitionId: string;
  collateralIn: string;
  privacyFee?: string;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
  marketId?: string;
  outcomeIndex?: number;
};

type UranaiPrivateTradeProofResponse = {
  schema: "uranai.irohaconnect.private-trade-proof.v1";
  accountId: string;
  assetDefinitionId: string;
  resolvedAssetId: string;
  spendAmount: string;
  inputNullifier: string;
  outputNoteCommitment: string;
  positionCommitment: string;
  proofEnv: string;
  proofEnvEncoding: "base64";
  rootHintHex: string;
  nullifiersHex: string[];
  outputCommitmentsHex: string[];
};

type ResolveAccountAliasInput = {
  toriiUrl: string;
  alias: string;
  networkPrefix?: number;
};

type AccountAliasResolutionResponse = {
  alias: string;
  accountId: string;
  resolved: boolean;
  source?: string;
};

type ExportConfidentialWalletBackupInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  mnemonic: string;
};

type ImportConfidentialWalletBackupInput = {
  toriiUrl: string;
  accountId: string;
  mnemonic: string;
  confidentialWallet: ConfidentialWalletBackupMetadata;
};

type ConfidentialPaymentAddress = {
  schema: "iroha-confidential-payment-address/v3";
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
  shieldedOwnerTagHex: string;
  shieldedDiversifierHex: string;
  recoveryHint: "one-time-receive-key";
};

type ConfidentialAssetBalanceResponse = {
  resolvedAssetId: string;
  quantity: string | null;
  onChainQuantity: string | null;
  spendableQuantity: string;
  exact: boolean;
  scanSource: "global-note-index" | "account-transactions";
  scanStatus: "complete" | "limited" | "incomplete";
  scanWatermarkBlock: number | null;
  recoveredNoteCount: number;
  trackedAssetIds: string[];
};

type ConfidentialWalletBackupStatePayload = {
  receiveKeys: Array<{
    keyId: string;
    ownerTagHex: string;
    diversifierHex: string;
    publicKeyBase64Url: string;
    privateKeyBase64Url: string;
    createdAtMs: number;
  }>;
  shadowTransactions: PendingConfidentialWalletShadowTransaction[];
};

type ExplorerMetricsResponse = Awaited<
  ReturnType<ToriiClient["getExplorerMetrics"]>
>;

type VpnAvailabilityResponse = {
  platformSupported: boolean;
  helperManaged: boolean;
  helperReady: boolean;
  serverReachable: boolean;
  profileAvailable: boolean;
  actionsEnabled: boolean;
  status: "ready" | "unsupported" | "unavailable" | "error";
  message: string;
  helperVersion: string;
  platform: string;
  controllerInstalled: boolean;
  controllerVersion: string | null;
  controllerKind: string | null;
  controllerPath: string | null;
  repairRequired: boolean;
  systemTunnelConfigured: boolean;
  systemTunnelActive: boolean;
  systemTunnelKind: string | null;
  systemTunnelInterface: string | null;
  systemTunnelService: string | null;
};

type VpnProfileResponse = Awaited<ReturnType<ToriiClient["getVpnProfile"]>>;

type VpnStatusResponse = {
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "disconnecting"
    | "reconciling"
    | "remote-delete-pending"
    | "repair-needed"
    | "error";
  sessionId: string | null;
  exitClass: "standard" | "low-latency" | "high-security" | null;
  relayEndpoint: string | null;
  connectedAtMs: number | null;
  expiresAtMs: number | null;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  routePushes: string[];
  excludedRoutes: string[];
  dnsServers: string[];
  tunnelAddresses: string[];
  mtuBytes: number;
  helperStatus: string;
  controllerInstalled: boolean;
  controllerVersion: string | null;
  controllerKind: string | null;
  reconcileState: string | null;
  repairRequired: boolean;
  remoteSessionActive: boolean;
  systemTunnelActive: boolean;
  systemTunnelKind: string | null;
  systemTunnelInterface: string | null;
  systemTunnelService: string | null;
  errorMessage: string | null;
  lastReceipt: VpnReceiptResponse | null;
};

type VpnReceiptResponse = {
  sessionId: string;
  accountId: string;
  exitClass: "standard" | "low-latency" | "high-security";
  relayEndpoint: string;
  meterFamily: string;
  connectedAtMs: number;
  disconnectedAtMs: number;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  status: string;
  receiptSource: "torii" | "local-fallback";
};

type AssetsResponse = Awaited<ReturnType<ToriiClient["listAccountAssets"]>>;

type TransactionsResponse = Awaited<
  ReturnType<ToriiClient["listAccountTransactions"]>
>;

type OfflineAllowanceQuery = {
  controllerId: string;
  limit?: number;
  offset?: number;
  filter?: string | Record<string, unknown>;
  certificateExpiresBeforeMs?: number;
  certificateExpiresAfterMs?: number;
  policyExpiresBeforeMs?: number;
  policyExpiresAfterMs?: number;
  refreshBeforeMs?: number;
  refreshAfterMs?: number;
  verdictIdHex?: string;
  attestationNonceHex?: string;
  requireVerdict?: boolean;
  onlyMissingVerdict?: boolean;
  includeExpired?: boolean;
};

type OfflineAllowanceResponse = {
  items: Array<Record<string, unknown>>;
  total: number;
};

type ToriiClientWithOfflineAllowances = ToriiClient & {
  listOfflineAllowances(
    input: OfflineAllowanceQuery,
  ): Promise<OfflineAllowanceResponse>;
};

type AccountPermissionsResponse = Awaited<
  ReturnType<ToriiClient["listAccountPermissions"]>
>;

type GovernanceProposalResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceProposalTyped"]>
>;

type GovernanceReferendumResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceReferendumTyped"]>
>;

type GovernanceTallyResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceTallyTyped"]>
>;

type GovernanceLocksResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceLocksTyped"]>
>;

type GovernanceUnlockStatsResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceUnlockStatsTyped"]>
>;

type GovernanceCouncilResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceCouncilCurrent"]>
>;

type GovernanceCitizenCountResponse = {
  total: number | null;
  endpointAvailable: boolean;
};

type GovernanceRegistrationPolicyResponse = {
  citizenshipAssetDefinitionId: string | null;
  citizenshipBondAmount: string | null;
  citizenshipAssetDefinitionExists: boolean | null;
  configurationLoaded: boolean;
  configurationError: string | null;
  assetDefinitionError: string | null;
};

type GovernanceCitizenStatusResponse = {
  accountId: string;
  isCitizen: boolean;
  amount: string | null;
  bondedHeight: number | null;
  seatsInEpoch: number | null;
  lastEpochSeen: number | null;
  cooldownUntil: number | null;
  endpointAvailable: boolean;
};

type GovernanceDraftResponse = Awaited<
  ReturnType<ToriiClient["governanceFinalizeReferendumTyped"]>
>;

type AccountOnboardingResponse = {
  account_id: string;
  tx_hash_hex: string;
  status: string;
};

type ConnectPreviewResponse = {
  sidHex: string;
  sidBase64Url: string;
  walletUri: string | null;
  appUri: string | null;
  walletCanonicalUri: string | null;
  appCanonicalUri: string | null;
  launchProtocol: string | null;
  tokenApp: string | null;
  tokenWallet: string | null;
  appPublicKeyHex: string;
  appPrivateKeyHex: string;
};

type NexusStakingPolicyResponse = {
  unbondingDelayMs: number;
};

type KaigiSignalKeyPair = KaigiX25519KeyPair;
type KaigiMeetingPrivacy = "private" | "transparent";
type KaigiPeerIdentityReveal = "Hidden" | "RevealAfterJoin";
type KaigiOfferDescription = {
  type: "offer";
  sdp: string;
};
type KaigiAnswerDescription = {
  type: "answer";
  sdp: string;
};

type KaigiCreateMeetingInput = {
  toriiUrl: string;
  chainId: string;
  hostAccountId: string;
  privateKeyHex?: HexString;
  callId: string;
  title?: string;
  scheduledStartMs: number;
  meetingCode: string;
  inviteSecretBase64Url: string;
  hostDisplayName: string;
  hostParticipantId: string;
  hostKaigiPublicKeyBase64Url: string;
  offerDescription: KaigiOfferDescription;
  privacyMode?: KaigiMeetingPrivacy;
  peerIdentityReveal?: KaigiPeerIdentityReveal;
};

type KaigiJoinMeetingInput = {
  toriiUrl: string;
  chainId: string;
  participantAccountId: string;
  privateKeyHex?: HexString;
  callId: string;
  hostAccountId?: string;
  hostKaigiPublicKeyBase64Url: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
  privacyMode?: KaigiMeetingPrivacy;
  rosterRootHex?: string;
  answerDescription: KaigiAnswerDescription;
};

type KaigiGetMeetingInput = {
  toriiUrl: string;
  callId: string;
  inviteSecretBase64Url: string;
};

type KaigiPollMeetingSignalsInput = {
  toriiUrl: string;
  accountId: string;
  callId: string;
  hostKaigiKeys: KaigiSignalKeyPair;
  afterTimestampMs?: number;
  limit?: number;
  offset?: number;
};

type KaigiEndMeetingInput = {
  toriiUrl: string;
  chainId: string;
  hostAccountId: string;
  privateKeyHex?: HexString;
  callId: string;
  endedAtMs?: number;
};

type KaigiMeetingSignalRecord = {
  entrypointHash: string;
  authority?: string;
  timestampMs?: number;
  callId: string;
  participantAccountId?: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
  createdAtMs: number;
  answerDescription: KaigiAnswerDescription;
};

type KaigiMeetingView = {
  callId: string;
  meetingCode: string;
  title?: string;
  hostAccountId?: string;
  hostDisplayName?: string;
  hostParticipantId?: string;
  hostKaigiPublicKeyBase64Url: string;
  scheduledStartMs: number;
  expiresAtMs: number;
  createdAtMs: number;
  live: boolean;
  ended: boolean;
  endedAtMs?: number;
  privacyMode: KaigiMeetingPrivacy;
  peerIdentityReveal: KaigiPeerIdentityReveal;
  rosterRootHex: string;
  offerDescription: KaigiOfferDescription;
};

type PrivateKaigiConfidentialXorState = {
  assetDefinitionId: string;
  resolvedAssetId: string;
  policyMode: string;
  shieldedBalance: string | null;
  shieldedBalanceExact: boolean;
  transparentBalance: string;
  canSelfShield: boolean;
  message?: string;
};

type PrivateKaigiFeeSchedule = {
  enabled: boolean;
  baseFee: string;
  perByteFee: string;
  perInstructionFee: string;
  perGasUnitFee: string;
};

type PrivateKaigiConfidentialXorContext = {
  state: PrivateKaigiConfidentialXorState;
};

type PrivateKaigiConfidentialXorFeeContext =
  PrivateKaigiConfidentialXorContext & {
    latestRootHex: string;
    verifyingKey: Record<string, unknown>;
    feeSchedule: PrivateKaigiFeeSchedule;
  };

type PrivateKaigiXorShadowState = {
  lastOnChainShieldedBalance: string | null;
  pendingShieldCredit: string;
  privateFeeDebit: string;
};

type PendingConfidentialWalletShadowTransaction = {
  hash: string;
  createdAtMs: number;
  authority: string;
  metadata: Record<string, unknown> | null;
  instructions: Array<Record<string, unknown>>;
};

type PendingConfidentialWalletShadowState = {
  transactions: PendingConfidentialWalletShadowTransaction[];
};

type KaigiCallEvent = {
  kind: "roster_updated" | "ended";
  callId: string;
  endedAtMs?: number;
};

type KaigiWatchCallEventsInput = {
  toriiUrl: string;
  callId: string;
};

type KaigiCallEventCallback = (event: KaigiCallEvent) => void | Promise<void>;

type FaucetStatusCallback = (
  progress: FaucetRequestProgress,
) => void | Promise<void>;

type NexusPublicLaneBaseInput = {
  toriiUrl: string;
  laneId: number;
};

type NexusPublicLaneStakeInput = NexusPublicLaneBaseInput & {
  validator?: string;
};

type NexusPublicLaneRewardsInput = NexusPublicLaneBaseInput & {
  account: string;
  assetId?: string;
  uptoEpoch?: number;
};

type BondPublicLaneStakeInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  amount: string;
  privateKeyHex?: HexString;
};

type RegisterPublicLaneValidatorInput = {
  toriiUrl: string;
  chainId: string;
  laneId: number;
  validatorAccountId: string;
  stakeAccountId?: string;
  peerId: string;
  selfStake: string;
  metadata?: Record<string, unknown>;
  privateKeyHex?: HexString;
};

type SchedulePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  amount: string;
  requestId: string;
  releaseAtMs: number;
  privateKeyHex?: HexString;
};

type FinalizePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  requestId: string;
  privateKeyHex?: HexString;
};

type ClaimPublicLaneRewardsInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  privateKeyHex?: HexString;
};

type AccountPermissionsInput = {
  toriiUrl: string;
  accountId: string;
  limit?: number;
  offset?: number;
};

type VpnAvailabilityInput = {
  toriiUrl: string;
};

type VpnConnectInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix?: number;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
  exitClass: "standard" | "low-latency" | "high-security";
};

type VpnDisconnectInput = {
  toriiUrl: string;
  accountId: string;
  networkPrefix?: number;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
};

type VpnStatusInput = Partial<VpnDisconnectInput>;

type RegisterCitizenInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  amount: string;
  privateKeyHex?: HexString;
};

type GovernanceRegistrationPolicyInput = {
  toriiUrl: string;
};

type GovernanceCitizenStatusInput = {
  toriiUrl: string;
  accountId: string;
};

type GovernanceLookupInput = {
  toriiUrl: string;
  proposalId: string;
};

type GovernanceReferendumLookupInput = {
  toriiUrl: string;
  referendumId: string;
};

type GovernancePlainBallotInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  referendumId: string;
  amount: string;
  durationBlocks: number;
  direction: "Aye" | "Nay" | "Abstain";
  privateKeyHex?: HexString;
};

type GovernanceDeployContractProposalInput = {
  toriiUrl: string;
  contractAddress?: string | null;
  contractAlias?: string | null;
  codeHash: string;
  abiHash: string;
  abiVersion?: string | null;
  mode?: "Plain" | "Zk" | null;
  window?: { lower: number; upper: number } | null;
  limits?: Record<string, unknown> | null;
};

type GovernanceFinalizeInput = {
  toriiUrl: string;
  referendumId: string;
  proposalId: string;
};

type GovernanceEnactInput = {
  toriiUrl: string;
  proposalId: string;
};

type SubscriptionStatusView =
  | "active"
  | "paused"
  | "past_due"
  | "canceled"
  | "suspended";

type SubscriptionPlanListResponseView = {
  items: Array<{
    plan_id: string;
    plan: Record<string, unknown>;
  }>;
  total: number;
};

type SubscriptionListItemView = {
  subscription_id: string;
  subscription: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
};

type SubscriptionListResponseView = {
  items: SubscriptionListItemView[];
  total: number;
};

type TransactionFeeView = TransactionFeeLike | string | number;

type TransactionSubmissionResultView = {
  hash: string;
  fee?: TransactionFeeView | null;
};

type SubscriptionActionResponseView = {
  ok: boolean;
  subscription_id: string;
  tx_hash_hex: string;
  fee?: TransactionFeeView | null;
  billing_trigger_id?: string;
  usage_trigger_id?: string | null;
  first_charge_ms?: number;
};

type SubscriptionListPlansInput = {
  toriiUrl: string;
  provider?: string;
  limit?: number;
  offset?: number;
};

type SubscriptionListInput = {
  toriiUrl: string;
  ownedBy?: string;
  provider?: string;
  status?: SubscriptionStatusView;
  limit?: number;
  offset?: number;
};

type SubscriptionGetInput = {
  toriiUrl: string;
  subscriptionId: string;
};

type SubscriptionCreateInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
  subscriptionId: string;
  planId: string;
  firstChargeMs?: number;
};

type SubscriptionActionInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
  subscriptionId: string;
  chargeAtMs?: number;
  cancelMode?: "immediate" | "period_end";
};

type SoraCloudStatusInput = {
  toriiUrl: string;
  apiToken?: string;
};

type SoraCloudHfDeployInput = SoraCloudStatusInput & {
  accountId: string;
  privateKeyHex?: string;
  repoId: string;
  revision?: string;
  modelName: string;
  serviceName: string;
  apartmentName?: string;
  storageClass: SoraCloudStorageClass;
  leaseTermMs: number;
  leaseAssetDefinitionId: string;
  baseFeeNanos: string;
};

type SoraCloudHfDeployResponseView = {
  ok: boolean;
  action: string;
  service_name: string;
  sequence: number | null;
  current_version?: string | null;
  revision_count?: number | null;
  tx_hash_hex?: string | null;
  fee?: TransactionFeeView | null;
  rollout_handle?: string | null;
  rollout_stage?: string | null;
  rollout_percent?: number | null;
  raw: Record<string, unknown>;
};

type SccpCapabilitiesResponse = Awaited<
  ReturnType<ToriiClient["getSccpCapabilities"]>
>;
type SccpProofManifestSetResponse = Awaited<
  ReturnType<ToriiClient["getSccpProofManifests"]>
>;
type SccpMessageProofBundleResponse = Record<string, unknown>;
type SccpMessageProofArtifactResponse = Awaited<
  ReturnType<ToriiClient["getSccpMessageProofArtifact"]>
>;
type SccpMessageProofJobResponse = Awaited<
  ReturnType<ToriiClient["getSccpMessageProofJob"]>
>;
type SccpRecentMessagesInput = ToriiConfig & {
  routeId?: string;
  limit?: number;
  offset?: number;
};
type SccpRecentMessagesResponse = {
  items: Record<string, unknown>[];
  total: number;
  raw: Record<string, unknown>;
};
type SccpDestinationProofMaterialInput = {
  networkIdHex?: string;
  verifierAddressHex?: string;
  bridgeAddressHex?: string;
  verifierCodeHashHex?: string;
  verifierKeyHashHex?: string;
  expectedDestinationBindingHashHex?: string;
  tronVerifierAddress?: string;
  proofBytesHex?: string;
};
type SccpBscProofGenerateInput = {
  request: unknown;
  proverModuleUrl?: unknown;
  proverConfigUrl?: unknown;
  timeoutMs?: unknown;
};
type SccpBscSourceProofGenerateInput = {
  input: unknown;
  proverModuleUrl?: unknown;
  proverConfigUrl?: unknown;
  timeoutMs?: unknown;
};
type SccpMessageProofBundleInput = ToriiConfig & {
  messageId: string;
};
type SccpMessageProofInput = ToriiConfig &
  SccpDestinationProofMaterialInput & {
    messageId: string;
  };
type SccpBridgeProofSubmitInput = ToriiConfig &
  SccpDestinationProofMaterialInput & {
    accountId: string;
    burnBundle?: Record<string, unknown>;
    messageBundle?: Record<string, unknown>;
    publicKeyHex?: string;
    signatureB64?: string;
    creationTimeMs?: number | string;
  };
type SccpBridgeMessageSubmitInput = ToriiConfig &
  SccpDestinationProofMaterialInput & {
    accountId: string;
    messageBundle: Record<string, unknown>;
    publicKeyHex?: string;
    signatureB64?: string;
    receiptLane?: number | string;
    settlement?: Record<string, unknown>;
    creationTimeMs?: number | string;
  };
type SccpTransactionCommitWaitInput = ToriiConfig & {
  hashHex: string;
};
type SccpTairaInboundSettlementDeployInput = ToriiConfig & {
  accountId: string;
  contractAlias?: string | null;
  compiledCodeB64?: string | null;
  leaseExpiryMs?: number | string | null;
  privateKeyHex?: unknown;
};
type TronGatewayInput = {
  endpoint?: string;
};
type TronTransactionInput = TronGatewayInput & {
  txId: string;
};
type TronAccountInput = TronGatewayInput & {
  address: string;
};
type TronBlockInput = TronGatewayInput & {
  blockNumber?: number | string;
};
type TronBroadcastInput = TronGatewayInput & {
  transaction: Record<string, unknown>;
};
type TronContractParameterInput =
  | {
      parameter: string;
      callData?: never;
    }
  | {
      callData: string;
      parameter?: never;
    }
  | {
      parameter?: undefined;
      callData?: undefined;
    };
type TronTriggerSmartContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
    feeLimit?: number | string;
    callValue?: number | string;
    permissionId?: number | string;
  };
type TronConstantContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
  };
type EvmRpcInput = {
  endpoint?: string;
};
type EvmRpcCallInput = EvmRpcInput & {
  method: string;
  params?: unknown[];
};
type EvmTransactionInput = EvmRpcInput & {
  txHash: string;
};
type EvmAddressInput = EvmRpcInput & {
  address: string;
  blockTag?: string;
};
type EvmCallInput = EvmRpcInput & {
  to: string;
  data: string;
  from?: string;
  value?: string;
  blockTag?: string;
};
type EvmLogsInput = EvmRpcInput & {
  address?: string | string[];
  blockHash?: string;
  fromBlock?: string;
  toBlock?: string;
  topics?: Array<string | string[] | null>;
};
type TronEventsInput = TronGatewayInput & {
  txId: string;
};

type IrohaBridge = {
  getRuntimeConfig(): RuntimeConfigResponse;
  ping(config: ToriiConfig): Promise<HealthResponse>;
  getChainMetadata(config: ToriiConfig): Promise<ChainMetadataResponse>;
  getSigningAlgorithms(config?: ToriiConfig): Promise<SigningAlgorithmOption[]>;
  generateKeyPair(input?: { signingAlgorithm?: string; seedHex?: string }): {
    publicKeyHex: string;
    privateKeyHex: string;
    signingAlgorithm: string;
  };
  generateKaigiSignalKeyPair(): KaigiSignalKeyPair;
  isSecureVaultAvailable(): Promise<boolean>;
  storeAccountSecret(input: {
    accountId: string;
    privateKeyHex: string;
    signingAlgorithm?: string;
  }): Promise<void>;
  listAccountSecretFlags(input: {
    accountIds: string[];
  }): Promise<Record<string, boolean>>;
  copyTextToClipboard(input: { text: string }): Promise<void>;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix?: number;
    signingAlgorithm?: string;
  }): {
    accountId: string;
    i105AccountId: string;
    i105DefaultAccountId: string;
    i105DefaultFullwidthAccountId?: string;
    publicKeyHex: string;
    signingAlgorithm: string;
    accountIdWarning: string;
  };
  derivePublicKey(
    input:
      | string
      | {
          privateKeyHex: string;
          signingAlgorithm?: string;
        },
  ): { publicKeyHex: string; signingAlgorithm: string };
  deriveConfidentialOwnerTag(privateKeyHex: string): { ownerTagHex: string };
  deriveConfidentialReceiveAddress(privateKeyHex: string): {
    ownerTagHex: string;
    diversifierHex: string;
  };
  resolveAccountAlias(
    input: ResolveAccountAliasInput,
  ): Promise<AccountAliasResolutionResponse>;
  createConfidentialPaymentAddress(input: {
    accountId: string;
    privateKeyHex?: string;
  }): Promise<ConfidentialPaymentAddress>;
  exportConfidentialWalletBackup(
    input: ExportConfidentialWalletBackupInput,
  ): Promise<ConfidentialWalletBackupMetadataV2>;
  importConfidentialWalletBackup(
    input: ImportConfidentialWalletBackupInput,
  ): Promise<void>;
  registerAccount(
    input: RegisterAccountInput,
  ): Promise<TransactionSubmissionResultView>;
  transferAsset(
    input: TransferAssetInput,
  ): Promise<TransactionSubmissionResultView>;
  buildUranaiPrivateTradeProof(
    input: UranaiPrivateTradeProofInput,
  ): Promise<UranaiPrivateTradeProofResponse>;
  signIrohaConnectMessage(input: {
    accountId: string;
    signingMessageB64: string;
  }): Promise<{
    publicKeyHex: string;
    signatureB64: string;
    signingAlgorithm: string;
    algorithmCode: number;
    algorithmLabel: string;
  }>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  getConfidentialTransferExecutionContext(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<{
    resolvedAssetId: string;
    effectiveMode: string;
    backend: string;
    circuitId: string;
  }>;
  getConfidentialAssetBalance(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
    force?: boolean;
  }): Promise<ConfidentialAssetBalanceResponse>;
  getConfidentialWalletState(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  getPrivateKaigiConfidentialXorState(input: {
    toriiUrl: string;
    accountId: string;
  }): Promise<PrivateKaigiConfidentialXorState>;
  selfShieldPrivateKaigiXor(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    amount: string;
  }): Promise<TransactionSubmissionResultView>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    assetDefinitionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    privateKeyHex?: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionsResponse>;
  listAccountPermissions(
    input: AccountPermissionsInput,
  ): Promise<AccountPermissionsResponse>;
  registerCitizen(
    input: RegisterCitizenInput,
  ): Promise<TransactionSubmissionResultView>;
  getGovernanceRegistrationPolicy(
    input: GovernanceRegistrationPolicyInput,
  ): Promise<GovernanceRegistrationPolicyResponse>;
  getGovernanceCitizenStatus(
    input: GovernanceCitizenStatusInput,
  ): Promise<GovernanceCitizenStatusResponse>;
  getGovernanceCitizenCount(
    config: ToriiConfig,
  ): Promise<GovernanceCitizenCountResponse>;
  getGovernanceProposal(
    input: GovernanceLookupInput,
  ): Promise<GovernanceProposalResponse>;
  getGovernanceReferendum(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceReferendumResponse>;
  getGovernanceTally(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceTallyResponse>;
  getGovernanceLocks(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceLocksResponse>;
  getGovernanceUnlockStats(
    config: ToriiConfig,
  ): Promise<GovernanceUnlockStatsResponse>;
  getGovernanceCouncilCurrent(
    config: ToriiConfig,
  ): Promise<GovernanceCouncilResponse>;
  proposeGovernanceDeployContract(
    input: GovernanceDeployContractProposalInput,
  ): Promise<GovernanceDraftResponse>;
  submitGovernancePlainBallot(
    input: GovernancePlainBallotInput,
  ): Promise<TransactionSubmissionResultView>;
  finalizeGovernanceReferendum(
    input: GovernanceFinalizeInput,
  ): Promise<GovernanceDraftResponse>;
  enactGovernanceProposal(
    input: GovernanceEnactInput,
  ): Promise<GovernanceDraftResponse>;
  getExplorerMetrics(
    config: ToriiConfig,
  ): Promise<ExplorerMetricsResponse | null>;
  getNetworkStats(input: {
    toriiUrl: string;
    assetDefinitionId?: string;
  }): Promise<NetworkStatsResponse>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
  }): Promise<ExplorerAccountQrResponse>;
  getVpnAvailability(
    input: VpnAvailabilityInput,
  ): Promise<VpnAvailabilityResponse>;
  getVpnProfile(input: VpnAvailabilityInput): Promise<VpnProfileResponse>;
  getVpnStatus(input?: VpnStatusInput): Promise<VpnStatusResponse>;
  connectVpn(input: VpnConnectInput): Promise<VpnStatusResponse>;
  disconnectVpn(input: VpnDisconnectInput): Promise<VpnStatusResponse>;
  repairVpn(input: VpnStatusInput): Promise<VpnStatusResponse>;
  listVpnReceipts(input?: VpnStatusInput): Promise<VpnReceiptResponse[]>;
  listOfflineAllowances(input: {
    toriiUrl: string;
    controllerId: string;
    limit?: number;
    offset?: number;
    filter?: string | Record<string, unknown>;
    certificateExpiresBeforeMs?: number;
    certificateExpiresAfterMs?: number;
    policyExpiresBeforeMs?: number;
    policyExpiresAfterMs?: number;
    refreshBeforeMs?: number;
    refreshAfterMs?: number;
    verdictIdHex?: string;
    attestationNonceHex?: string;
    requireVerdict?: boolean;
    onlyMissingVerdict?: boolean;
    includeExpired?: boolean;
  }): Promise<OfflineAllowanceResponse>;
  onboardAccount(input: {
    toriiUrl: string;
    alias: string;
    accountId: string;
    identity?: Record<string, unknown>;
  }): Promise<AccountOnboardingResponse>;
  requestFaucetFunds(
    input: {
      toriiUrl: string;
      accountId: string;
      networkPrefix?: number;
      requestId?: string;
    },
    onStatus?: FaucetStatusCallback,
  ): Promise<AccountFaucetResponse>;
  cancelFaucetRequest(input: { requestId: string }): Promise<{
    canceled: boolean;
  }>;
  createKaigiMeeting(
    input: KaigiCreateMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  getKaigiCall(input: KaigiGetMeetingInput): Promise<KaigiMeetingView>;
  joinKaigiMeeting(
    input: KaigiJoinMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  watchKaigiCallEvents(
    input: KaigiWatchCallEventsInput,
    onEvent: KaigiCallEventCallback,
  ): Promise<string>;
  stopWatchingKaigiCallEvents(subscriptionId: string): void;
  pollKaigiMeetingSignals(
    input: KaigiPollMeetingSignalsInput,
  ): Promise<KaigiMeetingSignalRecord[]>;
  endKaigiMeeting(
    input: KaigiEndMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  createConnectPreview(input: {
    toriiUrl: string;
    chainId: string;
    node?: string | null;
    launchProtocol?: string | null;
  }): Promise<ConnectPreviewResponse>;
  getSumeragiStatus(config: ToriiConfig): Promise<ToriiSumeragiStatus>;
  getNexusPublicLaneValidators(
    input: NexusPublicLaneBaseInput,
  ): Promise<PublicLaneValidatorsResponseView>;
  getNexusPublicLaneStake(
    input: NexusPublicLaneStakeInput,
  ): Promise<PublicLaneStakeResponseView>;
  getNexusPublicLaneRewards(
    input: NexusPublicLaneRewardsInput,
  ): Promise<PublicLaneRewardsResponseView>;
  getNexusStakingPolicy(
    config: ToriiConfig,
  ): Promise<NexusStakingPolicyResponse>;
  listSubscriptionPlans(
    input: SubscriptionListPlansInput,
  ): Promise<SubscriptionPlanListResponseView>;
  listSubscriptions(
    input: SubscriptionListInput,
  ): Promise<SubscriptionListResponseView>;
  getSubscription(
    input: SubscriptionGetInput,
  ): Promise<SubscriptionListItemView>;
  createSubscription(
    input: SubscriptionCreateInput,
  ): Promise<SubscriptionActionResponseView>;
  pauseSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  resumeSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  cancelSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  keepSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  chargeSubscriptionNow(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  getSoraCloudStatus(input: SoraCloudStatusInput): Promise<SoraCloudStatusView>;
  deploySoraCloudHf(
    input: SoraCloudHfDeployInput,
  ): Promise<SoraCloudHfDeployResponseView>;
  getSoraCloudHfStatus(
    input: SoraCloudStatusInput,
  ): Promise<Record<string, unknown>>;
  getParameters(input: ToriiConfig): Promise<Record<string, unknown>>;
  getSccpCapabilities(input: ToriiConfig): Promise<SccpCapabilitiesResponse>;
  getSccpProofManifests(
    input: ToriiConfig,
  ): Promise<SccpProofManifestSetResponse>;
  listSccpRecentMessages(
    input: SccpRecentMessagesInput,
  ): Promise<SccpRecentMessagesResponse>;
  getSccpMessageProofBundle(
    input: SccpMessageProofBundleInput,
  ): Promise<SccpMessageProofBundleResponse>;
  getSccpMessageProofArtifact(
    input: SccpMessageProofInput,
  ): Promise<SccpMessageProofArtifactResponse>;
  getSccpMessageProofJob(
    input: SccpMessageProofInput,
  ): Promise<SccpMessageProofJobResponse>;
  proveBscSccpProof(
    input: SccpBscProofGenerateInput,
  ): Promise<Record<string, unknown>>;
  proveBscSccpSourceProof(
    input: SccpBscSourceProofGenerateInput,
  ): Promise<Record<string, unknown>>;
  submitSccpBridgeProof(
    input: SccpBridgeProofSubmitInput,
  ): Promise<Record<string, unknown>>;
  submitSccpBridgeMessage(
    input: SccpBridgeMessageSubmitInput,
  ): Promise<Record<string, unknown>>;
  waitForSccpTransactionCommit(
    input: SccpTransactionCommitWaitInput,
  ): Promise<Record<string, unknown>>;
  deploySccpTairaInboundSettlementContract(
    input: SccpTairaInboundSettlementDeployInput,
  ): Promise<Record<string, unknown> | null>;
  deriveZkIvmPayload(
    input: ZkIvmRequestInput,
  ): Promise<Record<string, unknown>>;
  startZkIvmProveJob(
    input: ZkIvmRequestInput,
  ): Promise<Record<string, unknown>>;
  getZkIvmProveJob(input: ZkIvmProveJobInput): Promise<Record<string, unknown>>;
  cancelZkIvmProveJob(
    input: ZkIvmProveJobInput,
  ): Promise<Record<string, unknown>>;
  submitZkIvmProvedTransaction(
    input: ZkIvmProvedTransactionSubmitInput,
  ): Promise<Record<string, unknown>>;
  getTronTransaction(
    input: TronTransactionInput,
  ): Promise<Record<string, unknown>>;
  getTronAccount(input: TronAccountInput): Promise<Record<string, unknown>>;
  getTronTransactionReceipt(
    input: TronTransactionInput,
  ): Promise<Record<string, unknown>>;
  getTronTransactionEvents(
    input: TronEventsInput,
  ): Promise<Record<string, unknown>>;
  getTronSolidBlock(input?: TronBlockInput): Promise<Record<string, unknown>>;
  getTronWitnesses(input?: TronGatewayInput): Promise<Record<string, unknown>>;
  getTronFinalityData(
    input?: TronGatewayInput,
  ): Promise<Record<string, unknown>>;
  getSccpNileTestTronSigner(): Promise<SccpNileTestTronSignerStatus>;
  signSccpNileTestTronTransaction(
    input: SccpNileTestTronTransactionSignInput,
  ): Promise<Record<string, unknown>>;
  broadcastTronTransaction(
    input: TronBroadcastInput,
  ): Promise<Record<string, unknown>>;
  triggerTronSmartContract(
    input: TronTriggerSmartContractInput,
  ): Promise<Record<string, unknown>>;
  triggerTronConstantContract(
    input: TronConstantContractInput,
  ): Promise<Record<string, unknown>>;
  callEvmRpc(input: EvmRpcCallInput): Promise<unknown>;
  getEvmChainId(input?: EvmRpcInput): Promise<string>;
  getEvmBalance(input: EvmAddressInput): Promise<string>;
  getEvmCode(input: EvmAddressInput): Promise<string>;
  callEvmContract(input: EvmCallInput): Promise<string>;
  getEvmTransactionReceipt(
    input: EvmTransactionInput,
  ): Promise<Record<string, unknown> | null>;
  getEvmTransaction(
    input: EvmTransactionInput,
  ): Promise<Record<string, unknown> | null>;
  getEvmBlockByHash(input: {
    endpoint?: string;
    blockHash: string;
    fullTransactions?: boolean;
  }): Promise<Record<string, unknown> | null>;
  getEvmLogs(input: EvmLogsInput): Promise<Record<string, unknown>[]>;
  bondPublicLaneStake(
    input: BondPublicLaneStakeInput,
  ): Promise<TransactionSubmissionResultView>;
  registerPublicLaneValidator(
    input: RegisterPublicLaneValidatorInput,
  ): Promise<TransactionSubmissionResultView>;
  schedulePublicLaneUnbond(
    input: SchedulePublicLaneUnbondInput,
  ): Promise<TransactionSubmissionResultView>;
  finalizePublicLaneUnbond(
    input: FinalizePublicLaneUnbondInput,
  ): Promise<TransactionSubmissionResultView>;
  claimPublicLaneRewards(
    input: ClaimPublicLaneRewardsInput,
  ): Promise<TransactionSubmissionResultView>;
};

class ApiRequestError extends Error {
  status: number;
  statusText: string;
  detail: string;
  label: string;

  constructor(input: {
    label: string;
    status: number;
    statusText: string;
    detail?: string;
  }) {
    const detail = String(input.detail ?? "").trim();
    const statusSummary = formatHttpStatus(input.status, input.statusText);
    const redundantDetail = isRedundantHttpErrorDetail(
      detail,
      input.status,
      input.statusText,
    );
    const unavailableStatus = isToriiUnavailableStatus(input.status);
    super(
      unavailableStatus
        ? redundantDetail
          ? `${input.label} request failed because the Torii endpoint is unavailable (${statusSummary}).`
          : `${input.label} request failed because the Torii endpoint is unavailable (${statusSummary}). Detail: ${detail}`
        : detail
          ? `${input.label} request failed with status ${input.status} (${input.statusText}): ${detail}`
          : `${input.label} request failed with status ${input.status} (${input.statusText})`,
    );
    this.name = "ApiRequestError";
    this.status = input.status;
    this.statusText = input.statusText;
    this.detail = detail;
    this.label = input.label;
  }
}

const createApiRequestError = async (
  response: Pick<Response, "status" | "statusText" | "headers" | "text">,
  label: string,
) =>
  new ApiRequestError({
    label,
    status: response.status,
    statusText: response.statusText,
    detail: await readApiErrorDetail(response),
  });

const isApiRequestError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError;

const TORII_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

const isToriiUnavailableStatus = (status: number) =>
  TORII_UNAVAILABLE_STATUSES.has(status);

const formatHttpStatus = (status: number, statusText?: string) => {
  const trimmedStatusText = String(statusText ?? "").trim();
  return trimmedStatusText ? `${status} ${trimmedStatusText}` : String(status);
};

const normalizeHttpErrorDetail = (value: string) =>
  value.trim().replace(/\.+$/, "").toLowerCase();

const isRedundantHttpErrorDetail = (
  detail: string,
  status: number,
  statusText?: string,
) => {
  const normalizedDetail = normalizeHttpErrorDetail(detail);
  if (!normalizedDetail) {
    return true;
  }
  const normalizedStatusText = normalizeHttpErrorDetail(statusText ?? "");
  return (
    normalizedDetail === normalizedStatusText ||
    normalizedDetail === normalizeHttpErrorDetail(String(status)) ||
    normalizedDetail ===
      normalizeHttpErrorDetail(formatHttpStatus(status, statusText))
  );
};

const clientCache = new Map<string, ToriiClient>();
const nativeClientCache = new Map<string, ToriiClient>();
const kaigiCallWatchers = new Map<string, AbortController>();
const faucetRequestControllers = new Map<string, AbortController>();

const isLoopbackToriiBaseUrl = (baseUrl: string): boolean => {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname
      .trim()
      .toLowerCase()
      .replace(/^\[/u, "")
      .replace(/\]$/u, "")
      .replace(/\.$/u, "");
    return (
      parsed.protocol === "http:" &&
      (hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        /^127(?:\.\d{1,3}){3}$/u.test(hostname))
    );
  } catch {
    return false;
  }
};

const getClient = (toriiUrlRaw: string, nativeBinding?: unknown) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const cache = nativeBinding ? nativeClientCache : clientCache;
  const cached = cache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const clientOptions: Record<string, unknown> = {
    fetchImpl: nodeFetch,
  };
  if (isLoopbackToriiBaseUrl(baseUrl)) {
    clientOptions.allowInsecure = true;
  }
  if (nativeBinding) {
    clientOptions.__nativeBinding = nativeBinding;
  }
  const client = new ToriiClient(baseUrl, clientOptions);
  cache.set(baseUrl, client);
  return client;
};

const createFaucetAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createFaucetAbortError();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

const waitForMs = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(readAbortReason(signal));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let onAbort: (() => void) | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    onAbort = () => {
      cleanup();
      reject(signal ? readAbortReason(signal) : createFaucetAbortError());
    };
    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const CONFIDENTIAL_TRANSFER_ROOT_RETRY_ATTEMPTS = 3;
const CONFIDENTIAL_TRANSFER_ROOT_RETRY_DELAY_MS = 750;
const FAUCET_CLAIM_SUCCESS_STATUSES = new Set(["Applied", "Committed"]);
const FAUCET_CLAIM_FAILURE_STATUSES = new Set(["Rejected", "Expired"]);
const isConfidentialRootHintMismatchError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error ?? "")).includes(
    "tree commitments do not match the supplied root_hint",
  );

const hasPositiveQuantity = (value: unknown): boolean => {
  const normalized = Number(trimString(value));
  return Number.isFinite(normalized) && normalized > 0;
};

const faucetClaimFundedAssetIsVisible = async (
  client: ToriiClient,
  accountId: string,
  assetId: string,
  assetDefinitionId: string,
) => {
  const rawAssetId = trimString(assetId);
  const normalizedAssetId = rawAssetId.toLowerCase();
  const normalizedAssetDefinitionId = extractAssetDefinitionId(
    trimString(assetDefinitionId) || rawAssetId,
  )
    .trim()
    .toLowerCase();
  if (!normalizedAssetId && !normalizedAssetDefinitionId) {
    return false;
  }
  const payload = await client.listAccountAssets(accountId, { limit: 200 });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.some((item) => {
    const record = isPlainRecord(item) ? item : {};
    if (!hasPositiveQuantity(record.quantity)) {
      return false;
    }
    const itemAssetId = trimString(record.asset_id).toLowerCase();
    const itemAssetDefinitionId = extractAssetDefinitionId(
      trimString(record.asset ?? record.asset_definition_id ?? itemAssetId),
    )
      .trim()
      .toLowerCase();
    return Boolean(
      (normalizedAssetId && itemAssetId === normalizedAssetId) ||
        (normalizedAssetDefinitionId &&
          itemAssetDefinitionId === normalizedAssetDefinitionId),
    );
  });
};

const readNumericField = (value: unknown): number | null => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return null;
  }
  return normalized;
};

const formatDurationForError = (durationMs: number) => {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 90) {
    return `${seconds} seconds`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) {
    return `${minutes} minutes`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hours`;
};

const buildFaucetFinalityUnavailableError = (
  context: string,
  status?: number,
  statusText?: string,
  detail?: string,
) => {
  const statusDetail =
    status !== undefined
      ? ` (${status}${statusText ? ` ${statusText}` : ""})`
      : "";
  const responseDetail =
    detail &&
    !(
      status !== undefined &&
      isRedundantHttpErrorDetail(detail, status, statusText)
    )
      ? ` Detail: ${detail.replace(/\.+$/, "")}.`
      : "";
  if (status !== undefined && isToriiUnavailableStatus(status)) {
    return new Error(
      `The active Torii endpoint could not verify faucet finality via ${context} because Torii is unavailable${statusDetail}.${responseDetail} Faucet requests are blocked before submission because the endpoint cannot prove claims will commit; retry after the endpoint recovers.`,
    );
  }
  return new Error(
    `The active Torii endpoint could not verify faucet finality via ${context}${statusDetail}.${responseDetail} Faucet requests are blocked before submission because the endpoint cannot prove claims will commit. This is a TAIRA/Torii health problem, not a wallet problem; retry after the operator restores finality.`,
  );
};

const readFaucetLedgerFinalityState = async (
  baseUrl: string,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  const endpoint = new URL(
    "v1/ledger/headers?limit=1",
    `${normalizeBaseUrl(baseUrl)}/`,
  );
  const response = await nodeFetch(endpoint.toString(), {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });
  throwIfAborted(signal);
  if (!response.ok) {
    if (response.status >= 500) {
      throw buildFaucetFinalityUnavailableError(
        "/v1/ledger/headers",
        response.status,
        response.statusText,
        await readApiErrorDetail(response),
      );
    }
    return null;
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const headers = Array.isArray(payload)
    ? payload
    : isPlainRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];
  const latestHeader = headers.find(isPlainRecord);
  if (!latestHeader) {
    return null;
  }
  const height = readNumericField(latestHeader.height);
  const creationTimeMs = readNumericField(
    latestHeader.creation_time_ms ?? latestHeader.creationTimeMs,
  );
  if (creationTimeMs === null) {
    return null;
  }
  const responseDateMs = Date.parse(trimString(response.headers.get("date")));
  const nowMs = Number.isFinite(responseDateMs) ? responseDateMs : Date.now();
  const ageMs = Math.max(0, nowMs - creationTimeMs);
  return {
    ageMs,
    height,
  };
};

const readLatestLedgerCreationTimeMs = async (
  baseUrl: string,
): Promise<number | null> => {
  const endpoint = new URL(
    "v1/ledger/headers?limit=1",
    `${normalizeBaseUrl(baseUrl)}/`,
  );
  const response = await nodeFetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const headers = Array.isArray(payload)
    ? payload
    : isPlainRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];
  const latestHeader = headers.find(isPlainRecord);
  if (!latestHeader) {
    return null;
  }
  return readNumericField(
    latestHeader.creation_time_ms ?? latestHeader.creationTimeMs,
  );
};

const readFaucetSumeragiState = async (
  baseUrl: string,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  const endpoint = new URL(
    "v1/sumeragi/status",
    `${normalizeBaseUrl(baseUrl)}/`,
  );
  const response = await nodeFetch(endpoint.toString(), {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });
  throwIfAborted(signal);
  if (!response.ok) {
    if (response.status >= 500) {
      throw buildFaucetFinalityUnavailableError(
        "/v1/sumeragi/status",
        response.status,
        response.statusText,
        await readApiErrorDetail(response),
      );
    }
    return null;
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const record = isPlainRecord(payload) ? payload : {};
  const txQueue = isPlainRecord(record.tx_queue) ? record.tx_queue : {};
  const commitQc = isPlainRecord(record.commit_qc) ? record.commit_qc : {};
  const queueDepth = readNumericField(txQueue.depth);
  const queueSaturated = txQueue.saturated === true;
  const committedHeight = readNumericField(commitQc.height);
  const laneHeights = Array.isArray(record.lane_commitments)
    ? record.lane_commitments
        .map((value) =>
          isPlainRecord(value) ? readNumericField(value.block_height) : null,
        )
        .filter((value): value is number => value !== null)
    : [];
  return {
    committedHeight,
    queuedHeight: laneHeights.length ? Math.max(...laneHeights) : null,
    queueDepth,
    queueSaturated,
  };
};

const assertFaucetEndpointFinalizing = async (
  baseUrl: string,
  signal?: AbortSignal,
) => {
  let ledgerState: Awaited<
    ReturnType<typeof readFaucetLedgerFinalityState>
  > | null = null;
  try {
    ledgerState = await readFaucetLedgerFinalityState(baseUrl, signal);
  } catch (error) {
    throw error instanceof Error
      ? error
      : buildFaucetFinalityUnavailableError("/v1/ledger/headers");
  }
  if (!ledgerState) {
    throw buildFaucetFinalityUnavailableError("/v1/ledger/headers");
  }
  if (ledgerState.ageMs <= FAUCET_FINALITY_STALE_MS) {
    return;
  }

  let sumeragiState: Awaited<
    ReturnType<typeof readFaucetSumeragiState>
  > | null = null;
  try {
    sumeragiState = await readFaucetSumeragiState(baseUrl, signal);
  } catch {
    throwIfAborted(signal);
    sumeragiState = null;
  }

  const details = [
    ledgerState.height !== null
      ? `latest committed block ${ledgerState.height}`
      : "latest committed block is stale",
    `last block is ${formatDurationForError(ledgerState.ageMs)} old`,
    sumeragiState?.queueDepth !== null &&
    sumeragiState?.queueDepth !== undefined
      ? `queue depth ${sumeragiState.queueDepth}`
      : "",
    sumeragiState?.queueSaturated ? "queue saturated" : "",
    sumeragiState?.queuedHeight !== null &&
    sumeragiState?.queuedHeight !== undefined
      ? `pending block ${sumeragiState.queuedHeight}`
      : "",
  ].filter(Boolean);
  const fundingIssue = await readKnownTairaFaucetFundingIssue(
    baseUrl,
    nodeFetch,
    signal,
  );
  const fundingDetail = fundingIssue ? ` ${fundingIssue}` : "";

  throw new Error(
    `The active Torii endpoint is not finalizing new blocks right now (${details.join(
      "; ",
    )}). Faucet requests are blocked before submission because claims cannot commit until TAIRA finality resumes. This is a TAIRA/Torii health problem, not a wallet problem.${fundingDetail}`,
  );
};

const waitForFaucetClaimFinality = async (
  client: ToriiClient,
  txHashHex: string,
  accountId: string,
  assetId: string,
  assetDefinitionId: string,
  signal?: AbortSignal,
) => {
  const deadline = Date.now() + FAUCET_CLAIM_STATUS_TIMEOUT_MS;
  const invisibleDeadline = Date.now() + FAUCET_CLAIM_INVISIBLE_RETRY_MS;
  let lastStatusKind: string | null = null;
  let lastError: unknown = null;
  let lastStatusPayload: unknown = null;
  let sawPipelineStatus = false;

  while (Date.now() <= deadline) {
    throwIfAborted(signal);
    try {
      const payload = await client.getTransactionStatus(txHashHex);
      throwIfAborted(signal);
      lastStatusPayload = payload;
      const statusKind = extractPipelineStatusKind(payload);
      lastStatusKind = statusKind;
      lastError = null;
      if (statusKind) {
        sawPipelineStatus = true;
      }
      if (statusKind && FAUCET_CLAIM_SUCCESS_STATUSES.has(statusKind)) {
        return {
          statusKind,
          statusPayload: payload,
          timedOut: false,
          fundedAssetVisible: false,
          pipelineStatusInvisible: false,
        };
      }
      if (statusKind && FAUCET_CLAIM_FAILURE_STATUSES.has(statusKind)) {
        return {
          statusKind,
          statusPayload: payload,
          timedOut: false,
          fundedAssetVisible: false,
          pipelineStatusInvisible: false,
        };
      }
    } catch (error) {
      throwIfAborted(signal);
      lastError = error;
    }

    try {
      throwIfAborted(signal);
      if (
        await faucetClaimFundedAssetIsVisible(
          client,
          accountId,
          assetId,
          assetDefinitionId,
        )
      ) {
        throwIfAborted(signal);
        return {
          statusKind: lastStatusKind,
          statusPayload: lastStatusPayload,
          timedOut: false,
          fundedAssetVisible: true,
          pipelineStatusInvisible: !sawPipelineStatus,
        };
      }
    } catch (error) {
      throwIfAborted(signal);
      lastError = error;
    }

    if (!sawPipelineStatus && Date.now() >= invisibleDeadline) {
      return {
        statusKind: lastStatusKind,
        statusPayload: lastStatusPayload,
        timedOut: true,
        lastError,
        fundedAssetVisible: false,
        pipelineStatusInvisible: true,
      };
    }

    if (Date.now() + FAUCET_CLAIM_STATUS_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(FAUCET_CLAIM_STATUS_INTERVAL_MS, signal);
  }

  return {
    statusKind: lastStatusKind,
    statusPayload: lastStatusPayload,
    timedOut: true,
    lastError,
    fundedAssetVisible: false,
    pipelineStatusInvisible: !sawPipelineStatus,
  };
};

const buildFaucetClaimFinalityError = (
  txHashHex: string,
  statusKind: string | null,
  timedOut: boolean,
  pipelineStatusInvisible: boolean,
  lastError?: unknown,
) => {
  if (statusKind === "Expired") {
    return new Error(
      `Faucet claim ${txHashHex} expired before the network committed it. Please retry once the faucet queue clears.`,
    );
  }
  if (statusKind === "Rejected") {
    return new Error(
      `Faucet claim ${txHashHex} was rejected on-chain before funding the wallet.`,
    );
  }
  if (pipelineStatusInvisible) {
    return new Error(
      `Faucet claim ${txHashHex} was accepted by TAIRA, but it never became visible in pipeline status and the funded asset did not appear in the wallet. The endpoint is likely not finalizing new blocks right now; retry after TAIRA recovers.`,
    );
  }
  if (timedOut) {
    const detail =
      lastError instanceof Error ? trimString(lastError.message) : "";
    return new Error(
      detail
        ? `Faucet claim ${txHashHex} stayed queued and did not finalize within ${Math.trunc(
            FAUCET_CLAIM_STATUS_TIMEOUT_MS / 1000,
          )} seconds. ${detail}`
        : `Faucet claim ${txHashHex} stayed queued and did not finalize within ${Math.trunc(
            FAUCET_CLAIM_STATUS_TIMEOUT_MS / 1000,
          )} seconds.`,
    );
  }
  return new Error(
    `Faucet claim ${txHashHex} did not reach a committed state on the network.`,
  );
};

const readFaucetClaimRetryDelayMs = (
  attempt: number,
  snapshot?: StatusSnapshot | null,
) => {
  const rawSumeragiValue = snapshot?.status?.raw?.["sumeragi"];
  const rawSumeragi = isPlainRecord(rawSumeragiValue) ? rawSumeragiValue : null;
  return computeFaucetClaimRetryDelayMs(attempt, {
    queueSize: snapshot?.status?.queue_size,
    commitTimeMs: snapshot?.status?.commit_time_ms,
    saturated:
      rawSumeragi && typeof rawSumeragi.tx_queue_saturated === "boolean"
        ? rawSumeragi.tx_queue_saturated
        : false,
  });
};

const stripHexPrefix = (hex: string) => hex.trim().replace(/^0x/i, "");

const toHex = (buffer: Buffer) => buffer.toString("hex");

const hexToBuffer = (hex: string, label: string) => {
  const normalized = stripHexPrefix(hex);
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must contain only hexadecimal characters`);
  }
  return Buffer.from(normalized, "hex");
};

const normalizePrivateKeyHex = (privateKeyHex: string) =>
  hexToBuffer(privateKeyHex, "privateKeyHex").toString("hex");

const normalizeBridgeSigningAlgorithm = (value?: unknown): string => {
  const candidate = trimString(value) || DEFAULT_SIGNING_ALGORITHM;
  try {
    return normalizeCryptoAlgorithm(candidate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unsupported signing algorithm "${candidate}": ${detail}`);
  }
};

const toSigningAlgorithmOption = (
  algorithm: string,
): SigningAlgorithmOption => {
  const id = normalizeBridgeSigningAlgorithm(algorithm);
  return {
    id,
    label: signingAlgorithmLabel(id),
    isDefault: id === DEFAULT_SIGNING_ALGORITHM,
  };
};

const dedupeSigningAlgorithms = (algorithms: Iterable<unknown>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const algorithm of algorithms) {
    try {
      const id = normalizeBridgeSigningAlgorithm(algorithm);
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    } catch {
      // Ignore malformed endpoint capability entries and rely on local support.
    }
  }
  return result;
};

const readNodeSigningAlgorithms = (capabilities: unknown): string[] | null => {
  if (!isPlainRecord(capabilities)) {
    return null;
  }
  const crypto = capabilities.crypto;
  if (!isPlainRecord(crypto)) {
    return null;
  }
  const sm = crypto.sm;
  if (!isPlainRecord(sm)) {
    return null;
  }
  const allowedSigning = sm.allowedSigning ?? sm.allowed_signing;
  return Array.isArray(allowedSigning)
    ? dedupeSigningAlgorithms(allowedSigning)
    : null;
};

const resolveSigningAlgorithmOptions = async (
  config?: ToriiConfig,
): Promise<SigningAlgorithmOption[]> => {
  const localAlgorithms = dedupeSigningAlgorithms(supportedCryptoAlgorithms());
  const localSet = new Set(localAlgorithms);
  let selectedAlgorithms = localAlgorithms;
  const toriiUrl = trimString(config?.toriiUrl);
  if (toriiUrl) {
    try {
      const nodeAlgorithms = readNodeSigningAlgorithms(
        await getClient(toriiUrl).getNodeCapabilities(),
      );
      if (nodeAlgorithms) {
        selectedAlgorithms = nodeAlgorithms.filter((algorithm) =>
          localSet.has(algorithm),
        );
      }
    } catch {
      // Endpoint capability discovery is best-effort; local support remains useful offline.
    }
  }
  return selectedAlgorithms.map(toSigningAlgorithmOption);
};

const CONNECT_SIGNING_ALGORITHM_CODES = new Map<string, number>([
  ["ed25519", 0],
  ["secp256k1", 1],
  ["ml-dsa", 4],
]);

const getConnectSigningAlgorithmCode = (algorithm: string): number => {
  const normalized = normalizeBridgeSigningAlgorithm(algorithm);
  const code = CONNECT_SIGNING_ALGORITHM_CODES.get(normalized);
  if (code === undefined) {
    throw new Error(
      `IrohaConnect does not support ${signingAlgorithmLabel(normalized)} signatures yet.`,
    );
  }
  return code;
};

type SigningMaterial = {
  privateKeyHex: string;
  signingAlgorithm: string;
};

const normalizeSigningMaterial = (
  material: SigningMaterial,
): SigningMaterial => ({
  privateKeyHex: normalizePrivateKeyHex(material.privateKeyHex),
  signingAlgorithm: normalizeBridgeSigningAlgorithm(material.signingAlgorithm),
});

const resolveOptionalSigningMaterial = async (input: {
  accountId: string;
  privateKeyHex?: string;
  signingAlgorithm?: string;
}): Promise<SigningMaterial | null> => {
  const inlinePrivateKeyHex = trimString(input.privateKeyHex);
  if (inlinePrivateKeyHex) {
    return normalizeSigningMaterial({
      privateKeyHex: inlinePrivateKeyHex,
      signingAlgorithm: input.signingAlgorithm ?? DEFAULT_SIGNING_ALGORITHM,
    });
  }
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const storedSecret = await getAccountSecretMaterialFromVault(accountId);
  return storedSecret ? normalizeSigningMaterial(storedSecret) : null;
};

const resolveSigningMaterial = async (input: {
  accountId: string;
  privateKeyHex?: string;
  signingAlgorithm?: string;
  operationLabel: string;
}): Promise<SigningMaterial> => {
  const resolved = await resolveOptionalSigningMaterial(input);
  if (resolved) {
    return resolved;
  }
  throw new Error(
    `${input.operationLabel} requires a stored wallet secret. Restore or save this wallet again.`,
  );
};

const resolveOptionalPrivateKeyHex = async (input: {
  accountId: string;
  privateKeyHex?: string;
}): Promise<string | null> => {
  return (
    (
      await resolveOptionalSigningMaterial({
        accountId: input.accountId,
        privateKeyHex: input.privateKeyHex,
      })
    )?.privateKeyHex ?? null
  );
};

const formatExposedPrivateKey = (material: SigningMaterial): string => {
  const normalized = normalizeSigningMaterial(material);
  const encoded = privateKeyMultihash(
    hexToBuffer(normalized.privateKeyHex, "privateKeyHex"),
    {
      algorithm: normalized.signingAlgorithm,
    },
  );
  return encoded.includes(":")
    ? encoded
    : `${normalized.signingAlgorithm}:${encoded}`;
};

const assertEd25519SigningMaterial = (
  material: SigningMaterial,
  operationLabel: string,
) => {
  const normalized = normalizeSigningMaterial(material);
  if (normalized.signingAlgorithm !== DEFAULT_SIGNING_ALGORITHM) {
    throw new Error(
      `${operationLabel} currently requires an Ed25519 wallet because confidential wallet material is Ed25519-only.`,
    );
  }
  return normalized;
};

const resolveConfidentialWalletDecryptionContext = async (input: {
  accountId: string;
  privateKeyHex?: string;
  operationLabel: string;
}) => {
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: input.operationLabel,
    }),
    input.operationLabel,
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  let receiveKeys: ConfidentialReceiveKeyRecord[] = [];
  try {
    receiveKeys = await listConfidentialReceiveKeysForAccount(accountId);
  } catch (_error) {
    receiveKeys = [];
  }
  return {
    accountId,
    privateKeyHex,
    receiveKeys,
  };
};

const createStoredConfidentialReceiveDescriptor = async (input: {
  accountId: string;
  privateKeyHex?: string;
  operationLabel: string;
}) => {
  await assertSecureVaultAvailable(input.operationLabel);
  const { accountId, privateKeyHex } =
    await resolveConfidentialWalletDecryptionContext({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: input.operationLabel,
    });
  const shieldedAddress = deriveWalletConfidentialReceiveAddress({
    privateKeyHex,
  });
  const receiveKeys = generateKaigiX25519KeyPair();
  const keyId = randomBytes(18).toString("base64url");
  const storedKey = await storeConfidentialReceiveKeyInVault({
    keyId,
    accountId,
    ownerTagHex: shieldedAddress.ownerTagHex,
    diversifierHex: shieldedAddress.diversifierHex,
    publicKeyBase64Url: receiveKeys.publicKeyBase64Url,
    privateKeyBase64Url: receiveKeys.privateKeyBase64Url,
    createdAtMs: Date.now(),
  });
  return {
    receiveKeyId: storedKey.keyId,
    receivePublicKeyBase64Url: storedKey.publicKeyBase64Url,
    ownerTagHex: storedKey.ownerTagHex,
    diversifierHex: storedKey.diversifierHex,
  };
};

const normalizeLaneId = (laneId: number) => {
  if (!Number.isInteger(laneId) || laneId < 0) {
    throw new Error("laneId must be a non-negative integer.");
  }
  return laneId;
};

const normalizePositiveEpoch = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
};

const normalizeAmount = (value: string, label: string) => {
  const amount = value.trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`${label} must be a numeric string.`);
  }
  if (/^0+(\.0+)?$/.test(amount)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
};

const normalizeNonEmptyString = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const normalizeIntegerAmount = (value: string, label: string) => {
  const amount = value.trim();
  if (!/^\d+$/.test(amount)) {
    throw new Error(`${label} must be a whole-number string.`);
  }
  if (/^0+$/.test(amount)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
};

const normalizeDurationBlocks = (value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("durationBlocks must be a positive integer.");
  }
  return value;
};

const normalizeBallotDirectionCode = (
  direction: GovernancePlainBallotInput["direction"],
) => {
  switch (direction) {
    case "Aye":
      return 0;
    case "Nay":
      return 1;
    case "Abstain":
      return 2;
    default:
      throw new Error("direction must be one of Aye, Nay, or Abstain.");
  }
};

const normalizeRequestId = (value: string) => {
  const requestId = value.trim();
  if (!requestId) {
    throw new Error("requestId must be a non-empty string.");
  }
  return requestId;
};

const PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID = "xor#universal";
const PRIVATE_KAIGI_ROOT_LOOKBACK = 16;
const PRIVATE_KAIGI_ACCOUNT_TX_PAGE_SIZE = 200;
const CONFIDENTIAL_NOTE_INDEX_PAGE_SIZE = 500;
const CONFIDENTIAL_TX_FINALITY_INTERVAL_MS = 500;
const CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS = 600_000;
const CONFIDENTIAL_TX_SUCCESS_STATUSES = new Set(["Applied", "Committed"]);
const CONFIDENTIAL_TX_FAILURE_STATUSES = new Set(["Rejected", "Expired"]);
const CONFIDENTIAL_UNSHIELD_V2_CIRCUIT_IDS = new Set([
  "halo2/pasta/ipa/anon-unshield-merkle16-poseidon",
  "halo2/pasta/ipa/anon-unshield-merkle16-poseidon-diversified",
]);
const CONFIDENTIAL_UNSHIELD_V3_CIRCUIT_IDS = new Set([
  "halo2/pasta/ipa/anon-unshield-2in-1change-merkle16-poseidon",
  "halo2/pasta/ipa/anon-unshield-2in-1change-merkle16-poseidon-diversified",
]);
const PRIVATE_KAIGI_SHADOW_STORAGE_PREFIX = "iroha-demo:private-kaigi-xor:";
const CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX =
  "iroha-demo:confidential-wallet:";
const PRIVATE_KAIGI_DEFAULT_SELF_SHIELD_AMOUNT = "1";
const PRIVATE_KAIGI_CREATE_GAS = 420;
const PRIVATE_KAIGI_JOIN_ZK_GAS = 1520;
const PRIVATE_KAIGI_END_GAS = 220;
const PRIVATE_KAIGI_PROOF_GAS_PER_BYTE = 5;

type DecimalAmount = {
  mantissa: bigint;
  scale: number;
};

const readCrc16 = (namespace: string, body: string) => {
  let crc = 0xffff;
  const payload = `${namespace}:${body}`;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let shift = 0; shift < 8; shift += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
};

const canonicalHashLiteralFromBuffer = (value: Buffer) => {
  if (value.length !== 32) {
    throw new Error("hash values must be 32 bytes.");
  }
  const normalized = Buffer.from(value);
  normalized[normalized.length - 1] |= 1;
  const body = normalized.toString("hex").toUpperCase();
  const checksum = readCrc16("hash", body)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `hash:${body}#${checksum}`;
};

const canonicalHashLiteralFromHex = (value: string, label: string) =>
  canonicalHashLiteralFromBuffer(hexToBuffer(value, label));

const toPrivateKaigiCallIdDto = (value: string, label: string) => {
  const normalized = normalizeKaigiCallId(value, label);
  const [domainId, ...callNameParts] = normalized.split(":");
  return {
    domain_id: domainId,
    call_name: callNameParts.join(":"),
  };
};

const binaryToBuffer = (
  value: Buffer | ArrayBuffer | ArrayBufferView,
): Buffer => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
};

const NORITO_FRAME_HEADER_LENGTH = 40;
const NRT0_PAYLOAD_LENGTH_OFFSET = 23;
const VERSIONED_TRANSACTION_PAYLOAD_VERSION = 0x01;

type IrohaNativeTransactionCodec = {
  encodeSignedTransactionNorito?: (
    payload: Buffer,
  ) => Buffer | Uint8Array | ArrayBuffer | ArrayBufferView;
  encodeSignedTransactionVersioned?: (
    payload: Buffer,
  ) => Buffer | Uint8Array | ArrayBuffer | ArrayBufferView;
  decodeTransactionReceiptJson?: (
    payload: Buffer,
  ) => string | Buffer | Uint8Array | ArrayBuffer | ArrayBufferView;
};

type IrohaNativeSccpCodec = {
  sccpRebuildMessageBundleSourceProofWithDeployment?: (
    messageBundleJson: string,
    sourceMaterialJson: string,
    sourceDeploymentJson: string,
  ) => string;
};

const nativeCodecBytesToBuffer = (
  value: Buffer | Uint8Array | ArrayBuffer | ArrayBufferView,
  label: string,
): Buffer => {
  try {
    return binaryToBuffer(value);
  } catch (error) {
    throw new Error(
      `${label} returned bytes that could not be normalized: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const isNrt0NoritoFrame = (payload: Buffer): boolean =>
  payload.length >= NORITO_FRAME_HEADER_LENGTH &&
  payload.subarray(0, 4).toString("ascii") === "NRT0";

const unwrapNrt0NoritoFrame = (payload: Buffer): Buffer => {
  if (!isNrt0NoritoFrame(payload)) {
    return payload;
  }
  if (payload[4] !== 0 || payload[5] !== 0) {
    throw new Error("Unsupported NRT0 transaction frame version.");
  }
  const payloadLength = payload.readBigUInt64LE(NRT0_PAYLOAD_LENGTH_OFFSET);
  if (payloadLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("NRT0 transaction frame payload is too large.");
  }
  const payloadStart = payload.length - Number(payloadLength);
  if (payloadStart < NORITO_FRAME_HEADER_LENGTH) {
    throw new Error("Malformed NRT0 transaction frame payload length.");
  }
  return payload.subarray(payloadStart);
};

const encodeSignedTransactionForPipeline = (
  signedTransaction: Buffer,
  options: {
    nativeBinding?: unknown;
    requireNativeEncoding?: boolean;
  } = {},
): Buffer => {
  const rawPayload = unwrapNrt0NoritoFrame(signedTransaction);
  const native = options.nativeBinding as
    | IrohaNativeTransactionCodec
    | undefined;
  const nativeErrors: string[] = [];

  if (typeof native?.encodeSignedTransactionVersioned === "function") {
    try {
      const encoded = nativeCodecBytesToBuffer(
        native.encodeSignedTransactionVersioned(rawPayload),
        "encodeSignedTransactionVersioned",
      );
      if (encoded[0] !== VERSIONED_TRANSACTION_PAYLOAD_VERSION) {
        throw new Error(
          `native versioned payload has unsupported version byte ${String(
            encoded[0],
          )}`,
        );
      }
      return encoded;
    } catch (error) {
      nativeErrors.push(
        `encodeSignedTransactionVersioned: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (typeof native?.encodeSignedTransactionNorito === "function") {
    try {
      const encoded = nativeCodecBytesToBuffer(
        native.encodeSignedTransactionNorito(rawPayload),
        "encodeSignedTransactionNorito",
      );
      return Buffer.concat([
        Buffer.from([VERSIONED_TRANSACTION_PAYLOAD_VERSION]),
        unwrapNrt0NoritoFrame(encoded),
      ]);
    } catch (error) {
      nativeErrors.push(
        `encodeSignedTransactionNorito: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (options.requireNativeEncoding) {
    const detail = nativeErrors.length
      ? ` ${nativeErrors.join("; ")}`
      : " no compatible native encoder is available.";
    throw new Error(
      `ZK IVM proved transaction encoding requires the @iroha/iroha-js native encoder.${detail}`,
    );
  }

  return Buffer.concat([
    Buffer.from([VERSIONED_TRANSACTION_PAYLOAD_VERSION]),
    rawPayload,
  ]);
};

const toJsonByteArray = (
  value: Buffer | ArrayBuffer | ArrayBufferView,
): number[] => {
  return Array.from(binaryToBuffer(value));
};

const parseDecimalAmount = (value: string, label: string): DecimalAmount => {
  const normalized = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw new Error(`${label} must be a non-negative numeric string.`);
  }
  const fractional = match[2] ?? "";
  return {
    mantissa: BigInt(`${match[1]}${fractional}`),
    scale: fractional.length,
  };
};

const trimDecimalAmount = (value: DecimalAmount): DecimalAmount => {
  let { mantissa, scale } = value;
  while (scale > 0 && mantissa % 10n === 0n) {
    mantissa /= 10n;
    scale -= 1;
  }
  return { mantissa, scale };
};

const formatDecimalAmount = (value: DecimalAmount): string => {
  const normalized = trimDecimalAmount(value);
  const negative = normalized.mantissa < 0n;
  const digits = (
    negative ? -normalized.mantissa : normalized.mantissa
  ).toString();
  if (normalized.scale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }
  const padded = digits.padStart(normalized.scale + 1, "0");
  const whole = padded.slice(0, -normalized.scale) || "0";
  const fraction = padded.slice(-normalized.scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};

const alignDecimalAmounts = (left: DecimalAmount, right: DecimalAmount) => {
  if (left.scale === right.scale) {
    return { left, right, scale: left.scale };
  }
  if (left.scale > right.scale) {
    return {
      left,
      right: {
        mantissa: right.mantissa * 10n ** BigInt(left.scale - right.scale),
        scale: left.scale,
      },
      scale: left.scale,
    };
  }
  return {
    left: {
      mantissa: left.mantissa * 10n ** BigInt(right.scale - left.scale),
      scale: right.scale,
    },
    right,
    scale: right.scale,
  };
};

const addDecimalAmounts = (left: DecimalAmount, right: DecimalAmount) => {
  const aligned = alignDecimalAmounts(left, right);
  return trimDecimalAmount({
    mantissa: aligned.left.mantissa + aligned.right.mantissa,
    scale: aligned.scale,
  });
};

const subtractDecimalAmounts = (left: DecimalAmount, right: DecimalAmount) => {
  const aligned = alignDecimalAmounts(left, right);
  return trimDecimalAmount({
    mantissa: aligned.left.mantissa - aligned.right.mantissa,
    scale: aligned.scale,
  });
};

const multiplyDecimalAmountByInteger = (
  value: DecimalAmount,
  multiplier: number,
) =>
  trimDecimalAmount({
    mantissa: value.mantissa * BigInt(multiplier),
    scale: value.scale,
  });

const compareDecimalStrings = (left: string, right: string) => {
  const aligned = alignDecimalAmounts(
    parseDecimalAmount(left, "left"),
    parseDecimalAmount(right, "right"),
  );
  if (aligned.left.mantissa === aligned.right.mantissa) {
    return 0;
  }
  return aligned.left.mantissa > aligned.right.mantissa ? 1 : -1;
};

const minDecimalString = (left: string, right: string) =>
  compareDecimalStrings(left, right) <= 0 ? left : right;

const ceilDecimalToIntegerString = (value: string) => {
  const parsed = parseDecimalAmount(value, "value");
  if (parsed.scale === 0) {
    return parsed.mantissa.toString();
  }
  const divisor = 10n ** BigInt(parsed.scale);
  const whole = parsed.mantissa / divisor;
  const remainder = parsed.mantissa % divisor;
  return (remainder === 0n ? whole : whole + 1n).toString();
};

const parseNonNegativeConfigAmount = (
  value: unknown,
  label: string,
): string => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative number.`);
    }
    return formatDecimalAmount(parseDecimalAmount(String(value), label));
  }
  return formatDecimalAmount(
    parseDecimalAmount(String(value ?? "").trim(), label),
  );
};

const newPrivateKaigiShadowState = (): PrivateKaigiXorShadowState => ({
  lastOnChainShieldedBalance: null,
  pendingShieldCredit: "0",
  privateFeeDebit: "0",
});

const privateKaigiShadowStateCache = new Map<
  string,
  PrivateKaigiXorShadowState
>();
const confidentialWalletShadowStateCache = new Map<
  string,
  PendingConfidentialWalletShadowState
>();

const getPrivateKaigiShadowKey = (input: {
  toriiUrl: string;
  accountId: string;
  assetDefinitionId: string;
}) =>
  [
    PRIVATE_KAIGI_SHADOW_STORAGE_PREFIX,
    normalizeBaseUrl(input.toriiUrl),
    input.accountId.trim().toLowerCase(),
    input.assetDefinitionId.trim().toLowerCase(),
  ].join("");

const readPrivateKaigiShadowState = (
  key: string,
): PrivateKaigiXorShadowState => {
  const cached = privateKaigiShadowStateCache.get(key);
  if (cached) {
    return { ...cached };
  }
  const storage = globalThis.localStorage;
  if (!storage) {
    const empty = newPrivateKaigiShadowState();
    privateKaigiShadowStateCache.set(key, empty);
    return { ...empty };
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      const empty = newPrivateKaigiShadowState();
      privateKaigiShadowStateCache.set(key, empty);
      return { ...empty };
    }
    const parsed = JSON.parse(raw) as Partial<PrivateKaigiXorShadowState>;
    const state: PrivateKaigiXorShadowState = {
      lastOnChainShieldedBalance:
        typeof parsed.lastOnChainShieldedBalance === "string"
          ? parsed.lastOnChainShieldedBalance
          : null,
      pendingShieldCredit:
        typeof parsed.pendingShieldCredit === "string"
          ? parsed.pendingShieldCredit
          : "0",
      privateFeeDebit:
        typeof parsed.privateFeeDebit === "string"
          ? parsed.privateFeeDebit
          : "0",
    };
    privateKaigiShadowStateCache.set(key, state);
    return { ...state };
  } catch {
    const empty = newPrivateKaigiShadowState();
    privateKaigiShadowStateCache.set(key, empty);
    return { ...empty };
  }
};

const writePrivateKaigiShadowState = (
  key: string,
  state: PrivateKaigiXorShadowState,
) => {
  const normalized = {
    lastOnChainShieldedBalance: state.lastOnChainShieldedBalance,
    pendingShieldCredit: formatDecimalAmount(
      parseDecimalAmount(state.pendingShieldCredit, "pendingShieldCredit"),
    ),
    privateFeeDebit: formatDecimalAmount(
      parseDecimalAmount(state.privateFeeDebit, "privateFeeDebit"),
    ),
  } satisfies PrivateKaigiXorShadowState;
  privateKaigiShadowStateCache.set(key, normalized);
  const storage = globalThis.localStorage;
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // Ignore storage write failures and keep the in-memory shadow state.
  }
};

const syncPrivateKaigiShadowState = (
  state: PrivateKaigiXorShadowState,
  onChainShieldedBalance: string,
) => {
  if (state.lastOnChainShieldedBalance) {
    const delta = subtractDecimalAmounts(
      parseDecimalAmount(onChainShieldedBalance, "onChainShieldedBalance"),
      parseDecimalAmount(
        state.lastOnChainShieldedBalance,
        "lastOnChainShieldedBalance",
      ),
    );
    if (delta.mantissa > 0n) {
      const consumed = minDecimalString(
        formatDecimalAmount(delta),
        state.pendingShieldCredit,
      );
      state.pendingShieldCredit = formatDecimalAmount(
        subtractDecimalAmounts(
          parseDecimalAmount(state.pendingShieldCredit, "pendingShieldCredit"),
          parseDecimalAmount(consumed, "consumed"),
        ),
      );
    }
  }
  state.lastOnChainShieldedBalance = formatDecimalAmount(
    parseDecimalAmount(onChainShieldedBalance, "onChainShieldedBalance"),
  );
  return state;
};

const computePrivateKaigiEffectiveShieldedBalance = (input: {
  onChainShieldedBalance: string;
  shadowState: PrivateKaigiXorShadowState;
}) => {
  const balance = addDecimalAmounts(
    parseDecimalAmount(input.onChainShieldedBalance, "onChainShieldedBalance"),
    parseDecimalAmount(
      input.shadowState.pendingShieldCredit,
      "pendingShieldCredit",
    ),
  );
  const effective = subtractDecimalAmounts(
    balance,
    parseDecimalAmount(input.shadowState.privateFeeDebit, "privateFeeDebit"),
  );
  return effective.mantissa > 0n ? formatDecimalAmount(effective) : "0";
};

const appendPrivateKaigiShieldCredit = (input: {
  toriiUrl: string;
  accountId: string;
  amount: string;
  assetDefinitionId?: string;
}) => {
  const key = getPrivateKaigiShadowKey({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId:
      input.assetDefinitionId ?? PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID,
  });
  const state = readPrivateKaigiShadowState(key);
  state.pendingShieldCredit = formatDecimalAmount(
    addDecimalAmounts(
      parseDecimalAmount(state.pendingShieldCredit, "pendingShieldCredit"),
      parseDecimalAmount(input.amount, "amount"),
    ),
  );
  writePrivateKaigiShadowState(key, state);
};

const appendPrivateKaigiFeeDebit = (input: {
  toriiUrl: string;
  accountId: string;
  amount: string;
  assetDefinitionId?: string;
}) => {
  const key = getPrivateKaigiShadowKey({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId:
      input.assetDefinitionId ?? PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID,
  });
  const state = readPrivateKaigiShadowState(key);
  state.privateFeeDebit = formatDecimalAmount(
    addDecimalAmounts(
      parseDecimalAmount(state.privateFeeDebit, "privateFeeDebit"),
      parseDecimalAmount(input.amount, "amount"),
    ),
  );
  writePrivateKaigiShadowState(key, state);
};

const newConfidentialWalletShadowState =
  (): PendingConfidentialWalletShadowState => ({
    transactions: [],
  });

const getConfidentialWalletShadowKey = (input: {
  toriiUrl: string;
  accountId: string;
}) =>
  [
    CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX,
    normalizeBaseUrl(input.toriiUrl),
    input.accountId.trim().toLowerCase(),
  ].join("");

const normalizePendingConfidentialWalletShadowTransaction = (
  value: unknown,
): PendingConfidentialWalletShadowTransaction | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const hash = trimString(
    value.hash ?? value.txHash ?? value.entrypoint_hash,
  ).toLowerCase();
  if (!hash) {
    return null;
  }
  const createdAtMs = Number(
    value.createdAtMs ?? value.created_at_ms ?? Date.now(),
  );
  return {
    hash,
    createdAtMs:
      Number.isFinite(createdAtMs) && createdAtMs >= 0
        ? Math.trunc(createdAtMs)
        : Date.now(),
    authority: trimString(value.authority),
    metadata: isPlainRecord(value.metadata)
      ? { ...(value.metadata as Record<string, unknown>) }
      : null,
    instructions: Array.isArray(value.instructions)
      ? value.instructions.filter(isPlainRecord).map((entry) => ({ ...entry }))
      : [],
  };
};

const readConfidentialWalletShadowState = (
  key: string,
): PendingConfidentialWalletShadowState => {
  const cached = confidentialWalletShadowStateCache.get(key);
  if (cached) {
    return {
      transactions: cached.transactions.map((entry) => ({
        ...entry,
        metadata: entry.metadata ? { ...entry.metadata } : null,
        instructions: entry.instructions.map((instruction) => ({
          ...instruction,
        })),
      })),
    };
  }
  const storage = globalThis.localStorage;
  if (!storage) {
    const empty = newConfidentialWalletShadowState();
    confidentialWalletShadowStateCache.set(key, empty);
    return {
      transactions: [],
    };
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      const empty = newConfidentialWalletShadowState();
      confidentialWalletShadowStateCache.set(key, empty);
      return {
        transactions: [],
      };
    }
    const parsed = JSON.parse(
      raw,
    ) as Partial<PendingConfidentialWalletShadowState>;
    const state: PendingConfidentialWalletShadowState = {
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
            .map(normalizePendingConfidentialWalletShadowTransaction)
            .filter(
              (entry): entry is PendingConfidentialWalletShadowTransaction =>
                Boolean(entry),
            )
        : [],
    };
    confidentialWalletShadowStateCache.set(key, state);
    return {
      transactions: state.transactions.map((entry) => ({
        ...entry,
        metadata: entry.metadata ? { ...entry.metadata } : null,
        instructions: entry.instructions.map((instruction) => ({
          ...instruction,
        })),
      })),
    };
  } catch {
    const empty = newConfidentialWalletShadowState();
    confidentialWalletShadowStateCache.set(key, empty);
    return {
      transactions: [],
    };
  }
};

const writeConfidentialWalletShadowState = (
  key: string,
  state: PendingConfidentialWalletShadowState,
) => {
  const dedupedTransactions = new Map<
    string,
    PendingConfidentialWalletShadowTransaction
  >();
  state.transactions
    .map(normalizePendingConfidentialWalletShadowTransaction)
    .filter((entry): entry is PendingConfidentialWalletShadowTransaction =>
      Boolean(entry),
    )
    .forEach((entry) => {
      dedupedTransactions.set(entry.hash, entry);
    });
  const normalized: PendingConfidentialWalletShadowState = {
    transactions: [...dedupedTransactions.values()]
      .sort((left, right) => left.createdAtMs - right.createdAtMs)
      .slice(-128),
  };
  confidentialWalletShadowStateCache.set(key, normalized);
  const storage = globalThis.localStorage;
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // Ignore storage write failures and keep the in-memory shadow state.
  }
};

const deriveConfidentialWalletBackupKey = (mnemonic: string, salt: Buffer) => {
  const normalizedMnemonic = normalizeMnemonicPhrase(mnemonic);
  if (!normalizedMnemonic) {
    throw new Error("Backup file is missing a valid recovery phrase.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(normalizedMnemonic, "utf8"),
      salt,
      Buffer.from(CONFIDENTIAL_WALLET_BACKUP_KDF_INFO, "utf8"),
      32,
    ),
  );
};

const encryptConfidentialWalletBackupState = (
  state: ConfidentialWalletBackupStatePayload,
  mnemonic: string,
): ConfidentialWalletBackupStateBoxV2 => {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = deriveConfidentialWalletBackupKey(mnemonic, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(state), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    kdf: "HKDF-SHA256",
    cipher: "AES-256-GCM",
    saltBase64Url: salt.toString("base64url"),
    ivBase64Url: iv.toString("base64url"),
    ciphertextBase64Url: ciphertext.toString("base64url"),
    authTagBase64Url: cipher.getAuthTag().toString("base64url"),
  };
};

const parseConfidentialWalletBackupStatePayload = (
  value: unknown,
): ConfidentialWalletBackupStatePayload => {
  if (!isPlainRecord(value)) {
    throw new Error("Confidential wallet backup state is invalid.");
  }
  return {
    receiveKeys: Array.isArray(value.receiveKeys)
      ? value.receiveKeys
          .map((entry) => {
            if (!isPlainRecord(entry)) {
              return null;
            }
            const keyId = trimString(entry.keyId);
            const ownerTagHex = trimString(entry.ownerTagHex).toLowerCase();
            const diversifierHex = trimString(
              entry.diversifierHex,
            ).toLowerCase();
            const publicKeyBase64Url = normalizeBase64UrlString(
              entry.publicKeyBase64Url,
              "confidentialWallet.receiveKeys.publicKeyBase64Url",
            );
            const privateKeyBase64Url = normalizeBase64UrlString(
              entry.privateKeyBase64Url,
              "confidentialWallet.receiveKeys.privateKeyBase64Url",
            );
            const createdAtMs = Number(entry.createdAtMs ?? Date.now());
            if (
              !/^[A-Za-z0-9_-]{8,128}$/.test(keyId) ||
              !/^[0-9a-f]{64}$/.test(ownerTagHex) ||
              !/^[0-9a-f]{64}$/.test(diversifierHex)
            ) {
              return null;
            }
            return {
              keyId,
              ownerTagHex,
              diversifierHex,
              publicKeyBase64Url,
              privateKeyBase64Url,
              createdAtMs:
                Number.isFinite(createdAtMs) && createdAtMs >= 0
                  ? Math.trunc(createdAtMs)
                  : Date.now(),
            };
          })
          .filter(
            (
              entry,
            ): entry is ConfidentialWalletBackupStatePayload["receiveKeys"][number] =>
              Boolean(entry),
          )
      : [],
    shadowTransactions: Array.isArray(value.shadowTransactions)
      ? value.shadowTransactions
          .map(normalizePendingConfidentialWalletShadowTransaction)
          .filter(
            (entry): entry is PendingConfidentialWalletShadowTransaction =>
              Boolean(entry),
          )
      : [],
  };
};

const decryptConfidentialWalletBackupState = (
  stateBox: ConfidentialWalletBackupStateBoxV2,
  mnemonic: string,
): ConfidentialWalletBackupStatePayload => {
  const salt = Buffer.from(
    normalizeBase64UrlString(
      stateBox.saltBase64Url,
      "confidentialWallet.stateBox.saltBase64Url",
    ),
    "base64url",
  );
  const iv = Buffer.from(
    normalizeBase64UrlString(
      stateBox.ivBase64Url,
      "confidentialWallet.stateBox.ivBase64Url",
    ),
    "base64url",
  );
  const ciphertext = Buffer.from(
    normalizeBase64UrlString(
      stateBox.ciphertextBase64Url,
      "confidentialWallet.stateBox.ciphertextBase64Url",
    ),
    "base64url",
  );
  const authTag = Buffer.from(
    normalizeBase64UrlString(
      stateBox.authTagBase64Url,
      "confidentialWallet.stateBox.authTagBase64Url",
    ),
    "base64url",
  );
  const key = deriveConfidentialWalletBackupKey(mnemonic, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error("Confidential wallet backup could not be decrypted.");
  }
  return parseConfidentialWalletBackupStatePayload(parsed);
};

const upsertConfidentialWalletShadowTransaction = (input: {
  toriiUrl: string;
  accountId: string;
  txHash: string;
  authority: string;
  metadata?: Record<string, unknown>;
  instructions?: Array<Record<string, unknown>>;
  createdAtMs?: number;
}) => {
  const key = getConfidentialWalletShadowKey({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
  });
  const state = readConfidentialWalletShadowState(key);
  const hash = trimString(input.txHash).toLowerCase();
  if (!hash) {
    return;
  }
  const nextTransaction: PendingConfidentialWalletShadowTransaction = {
    hash,
    createdAtMs: Math.trunc(input.createdAtMs ?? Date.now()),
    authority: trimString(input.authority),
    metadata: input.metadata ? { ...input.metadata } : null,
    instructions: Array.isArray(input.instructions)
      ? input.instructions
          .filter(isPlainRecord)
          .map((instruction) => ({ ...instruction }))
      : [],
  };
  state.transactions = [
    ...state.transactions.filter((transaction) => transaction.hash !== hash),
    nextTransaction,
  ];
  writeConfidentialWalletShadowState(key, state);
};

const mergeConfidentialWalletShadowTransactions = (input: {
  toriiUrl: string;
  accountId: string;
  transactions: Array<WalletConfidentialTransactionLike | null | undefined>;
  includeUnmatchedShadowTransactions?: boolean;
}): WalletConfidentialTransactionLike[] => {
  const baseTransactions = input.transactions.filter(
    (transaction): transaction is WalletConfidentialTransactionLike =>
      Boolean(transaction),
  );
  if (input.includeUnmatchedShadowTransactions === false) {
    return baseTransactions;
  }
  const key = getConfidentialWalletShadowKey({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
  });
  const shadowState = readConfidentialWalletShadowState(key);
  if (!shadowState.transactions.length) {
    return baseTransactions;
  }
  const shadowByHash = new Map(
    shadowState.transactions.map((transaction) => [
      transaction.hash,
      transaction,
    ]),
  );
  const mergedHashes = new Set<string>();
  const merged = baseTransactions.map((transaction) => {
    const txHash = trimString(transaction.entrypoint_hash).toLowerCase();
    const shadow = shadowByHash.get(txHash);
    if (!shadow || transaction.result_ok === false) {
      return transaction;
    }
    mergedHashes.add(txHash);
    const hasDirectMetadata =
      transaction.metadata !== undefined &&
      transaction.metadata !== null &&
      !(
        isPlainRecord(transaction.metadata) &&
        !Object.keys(transaction.metadata).length
      );
    const hasInstructions =
      Array.isArray(transaction.instructions) &&
      transaction.instructions.length > 0;
    return {
      ...transaction,
      entrypoint_hash: txHash || shadow.hash,
      authority:
        trimString((transaction as { authority?: unknown }).authority) ||
        shadow.authority,
      metadata: hasDirectMetadata ? transaction.metadata : shadow.metadata,
      instructions: hasInstructions
        ? transaction.instructions
        : shadow.instructions,
    };
  });
  for (const shadow of shadowState.transactions) {
    if (mergedHashes.has(shadow.hash)) {
      continue;
    }
    merged.push({
      entrypoint_hash: shadow.hash,
      result_ok: true,
      authority: shadow.authority,
      metadata: shadow.metadata,
      instructions: shadow.instructions,
    });
  }
  return merged;
};

const computePrivateKaigiInstructionGas = (input: {
  action: "create" | "join" | "end";
  proofByteLength: number;
}) => {
  switch (input.action) {
    case "create":
      return PRIVATE_KAIGI_CREATE_GAS;
    case "join":
      return (
        PRIVATE_KAIGI_JOIN_ZK_GAS +
        PRIVATE_KAIGI_PROOF_GAS_PER_BYTE * Math.max(0, input.proofByteLength)
      );
    case "end":
      return PRIVATE_KAIGI_END_GAS;
    default:
      return PRIVATE_KAIGI_END_GAS;
  }
};

const KAIGI_CHAIN_SIGNAL_SCHEMA = "iroha-demo-kaigi-chain-signal/v1";
const KAIGI_CHAIN_ANSWER_SCHEMA = "iroha-demo-kaigi-answer/v1";
const KAIGI_CALL_METADATA_SCHEMA = "iroha-demo-kaigi-call-metadata/v2";
const KAIGI_CALL_OFFER_SCHEMA = "iroha-demo-kaigi-offer/v2";

type KaigiChainAnswerPayload = {
  schema: typeof KAIGI_CHAIN_ANSWER_SCHEMA;
  callId: string;
  kind: "answer";
  participantAccountId?: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
  createdAtMs: number;
  description: {
    type: "answer";
    sdp: string;
  };
};

type KaigiCallOfferPayload = {
  schema: typeof KAIGI_CALL_OFFER_SCHEMA;
  callId: string;
  hostAccountId?: string;
  hostDisplayName: string;
  hostParticipantId: string;
  hostKaigiPublicKeyBase64Url: string;
  createdAtMs: number;
  description: KaigiOfferDescription;
};

type KaigiCallMetadata = {
  schema: typeof KAIGI_CALL_METADATA_SCHEMA;
  meetingCode: string;
  expiresAtMs: number;
  live: boolean;
  privacyMode: KaigiMeetingPrivacy;
  peerIdentityReveal: KaigiPeerIdentityReveal;
  encryptedOffer: KaigiSecretBox;
};

type KaigiChainSignalMetadata = {
  schema: typeof KAIGI_CHAIN_SIGNAL_SCHEMA;
  callId: string;
  signalKind: "answer";
  hostAccountId?: string;
  participantAccountId?: string;
  createdAtMs: number;
  encryptedSignal: KaigiSealedBox;
};

const normalizeReleaseAtMs = (value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("releaseAtMs must be a non-negative integer.");
  }
  return value;
};

const normalizeTimestampMs = (value: number, label: string) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
};

const normalizeKaigiCallId = (value: string, label: string) => {
  const callId = value.trim();
  if (!callId) {
    throw new Error(`${label} is required.`);
  }
  if (!callId.includes(":")) {
    throw new Error(`${label} must be in domain.dataspace:meeting format.`);
  }
  const [domainIdRaw, ...callNameParts] = callId.split(":");
  const domainId = domainIdRaw.trim();
  const callName = callNameParts.join(":").trim();
  if (!domainId || !callName) {
    throw new Error(`${label} must be in domain.dataspace:meeting format.`);
  }
  const qualifiedDomainId = domainId.includes(".")
    ? domainId
    : `${domainId}.universal`;
  return `${qualifiedDomainId}:${callName}`;
};

const normalizeKaigiParticipantId = (value: string) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]+/g, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "participant";
};

const normalizeKaigiAnswerDescription = (value: {
  type?: string;
  sdp?: string;
}) => {
  const type = String(value?.type ?? "").trim();
  const sdp = String(value?.sdp ?? "");
  if (type !== "answer") {
    throw new Error("Kaigi answerDescription.type must be answer.");
  }
  if (!sdp.trim()) {
    throw new Error("Kaigi answerDescription.sdp is required.");
  }
  return {
    type: "answer" as const,
    sdp,
  };
};

const normalizeKaigiOfferDescription = (value: {
  type?: string;
  sdp?: string;
}) => {
  const type = String(value?.type ?? "").trim();
  const sdp = String(value?.sdp ?? "");
  if (type !== "offer") {
    throw new Error("Kaigi offerDescription.type must be offer.");
  }
  if (!sdp.trim()) {
    throw new Error("Kaigi offerDescription.sdp is required.");
  }
  return {
    type: "offer" as const,
    sdp,
  };
};

const normalizeKaigiMeetingPrivacy = (value: unknown): KaigiMeetingPrivacy => {
  const normalized = String(value ?? "private")
    .trim()
    .toLowerCase();
  if (normalized === "transparent") {
    return "transparent";
  }
  return "private";
};

const normalizeKaigiPeerIdentityReveal = (
  value: unknown,
): KaigiPeerIdentityReveal => {
  const normalized = String(value ?? "Hidden")
    .trim()
    .toLowerCase();
  if (
    normalized === "revealafterjoin" ||
    normalized === "reveal_after_join" ||
    normalized === "reveal-after-join"
  ) {
    return "RevealAfterJoin";
  }
  return "Hidden";
};

const normalizeBase64UrlString = (value: unknown, label: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${label} must be base64url.`);
  }
  return normalized;
};

const normalizeBase64String = (value: unknown, label: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new Error(`${label} must be base64.`);
  }
  return normalized;
};

const normalizeKaigiRosterRootHex = (value: unknown, label: string) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^0x/i, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex digest.`);
  }
  return normalized;
};

const normalizeOptionalCompatAccountIdLiteral = (
  value: unknown,
  label: string,
) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return undefined;
  }
  return normalizeCompatAccountIdLiteral(normalized, label);
};

const deriveKaigiRosterJoinSeed = (input: {
  callId: string;
  participantAccountId: string;
  privateKeyHex: string;
}) =>
  createHash("sha256")
    .update("iroha-demo-kaigi-roster-join/v1\0")
    .update(input.callId)
    .update("\0")
    .update(input.participantAccountId)
    .update("\0")
    .update(input.privateKeyHex.trim().toLowerCase())
    .digest();

const deriveKaigiHostActionSeed = (input: {
  callId: string;
  hostAccountId: string;
  privateKeyHex: string;
}) =>
  deriveKaigiRosterJoinSeed({
    callId: input.callId,
    participantAccountId: input.hostAccountId,
    privateKeyHex: input.privateKeyHex,
  });

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch (_error) {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const splitKaigiCallId = (callId: string) => {
  const normalized = normalizeKaigiCallId(callId, "callId");
  const [domainId, ...callNameParts] = normalized.split(":");
  const callName = callNameParts.join(":").trim();
  if (!domainId || !callName) {
    throw new Error("callId must be in domain:meeting format.");
  }
  return {
    domainId,
    callName,
  };
};

const normalizeKaigiMeetingCode = (value: unknown, callId: string): string => {
  const explicit = String(value ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const { callName } = splitKaigiCallId(callId);
  return callName.replace(/^kaigi-/, "") || callName;
};

const normalizeKaigiCallEvent = (value: unknown): KaigiCallEvent | null => {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }
  const kind = String(record.kind ?? "")
    .trim()
    .toLowerCase();
  const callRecord = parseJsonRecord(record.call);
  const callId = normalizeKaigiCallId(
    String(callRecord?.call_id ?? callRecord?.callId ?? ""),
    "kaigi call event.callId",
  );
  if (kind === "ended") {
    return {
      kind: "ended",
      callId,
      endedAtMs: normalizeTimestampMs(
        Number(record.ended_at_ms ?? record.endedAtMs),
        "kaigi call event.endedAtMs",
      ),
    };
  }
  if (kind === "roster_updated") {
    return {
      kind: "roster_updated",
      callId,
    };
  }
  return null;
};

const extractTransactionMetadata = (
  transaction: Record<string, unknown>,
): Record<string, unknown> | null => {
  const directCandidates = [
    transaction.metadata,
    transaction.transaction_metadata,
    transaction.tx_metadata,
  ];
  for (const candidate of directCandidates) {
    const record = parseJsonRecord(candidate);
    if (record) {
      return record;
    }
  }

  const nestedCandidates = [
    parseJsonRecord(transaction.transaction),
    parseJsonRecord(transaction.tx),
    parseJsonRecord(transaction.payload),
    parseJsonRecord(transaction.record),
  ];
  for (const candidate of nestedCandidates) {
    if (!candidate) {
      continue;
    }
    const nestedMetadata = [
      candidate.metadata,
      candidate.transaction_metadata,
      candidate.tx_metadata,
    ];
    for (const nestedCandidate of nestedMetadata) {
      const record = parseJsonRecord(nestedCandidate);
      if (record) {
        return record;
      }
    }
  }

  return null;
};

const parseKaigiChainSignalMetadata = (
  transaction: Record<string, unknown>,
): KaigiChainSignalMetadata | null => {
  const metadata = extractTransactionMetadata(transaction);
  if (!metadata) {
    return null;
  }
  const signalRecord = parseJsonRecord(metadata.kaigi_signal) ?? metadata;
  if (!signalRecord || signalRecord.schema !== KAIGI_CHAIN_SIGNAL_SCHEMA) {
    return null;
  }
  const callId = normalizeKaigiCallId(
    String(signalRecord.callId ?? signalRecord.call_id ?? ""),
    "kaigi signal metadata.callId",
  );
  const signalKind = String(
    signalRecord.signalKind ?? signalRecord.signal_kind ?? "",
  ).trim();
  if (signalKind !== "answer") {
    return null;
  }
  const hostAccountId = normalizeOptionalCompatAccountIdLiteral(
    signalRecord.hostAccountId ?? signalRecord.host_account_id,
    "kaigi signal metadata.hostAccountId",
  );
  const participantAccountId = normalizeOptionalCompatAccountIdLiteral(
    signalRecord.participantAccountId ?? signalRecord.participant_account_id,
    "kaigi signal metadata.participantAccountId",
  );
  const createdAtMs = normalizeTimestampMs(
    Number(signalRecord.createdAtMs ?? signalRecord.created_at_ms),
    "kaigi signal metadata.createdAtMs",
  );
  const encryptedSignal = parseJsonRecord(
    signalRecord.encryptedSignal ?? signalRecord.encrypted_signal,
  );
  if (!encryptedSignal) {
    return null;
  }

  return {
    schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
    callId,
    signalKind: "answer",
    ...(hostAccountId ? { hostAccountId } : {}),
    ...(participantAccountId ? { participantAccountId } : {}),
    createdAtMs,
    encryptedSignal: encryptedSignal as KaigiSealedBox,
  };
};

const parseKaigiChainAnswerPayload = (
  value: unknown,
): KaigiChainAnswerPayload => {
  const record = parseJsonRecord(value);
  if (!record || record.schema !== KAIGI_CHAIN_ANSWER_SCHEMA) {
    throw new Error("Kaigi answer payload schema is invalid.");
  }
  const callId = normalizeKaigiCallId(
    String(record.callId ?? record.call_id ?? ""),
    "kaigi answer payload.callId",
  );
  const participantAccountId = normalizeOptionalCompatAccountIdLiteral(
    record.participantAccountId ?? record.participant_account_id,
    "kaigi answer payload.participantAccountId",
  );
  const participantId = normalizeKaigiParticipantId(
    String(record.participantId ?? record.participant_id ?? ""),
  );
  const participantName = String(
    record.participantName ?? record.participant_name ?? "",
  ).trim();
  if (!participantName) {
    throw new Error("Kaigi answer payload.participantName is required.");
  }
  const createdAtMs = normalizeTimestampMs(
    Number(record.createdAtMs ?? record.created_at_ms),
    "kaigi answer payload.createdAtMs",
  );
  const descriptionRecord = parseJsonRecord(record.description);
  const description = normalizeKaigiAnswerDescription({
    type: String(descriptionRecord?.type ?? ""),
    sdp: String(descriptionRecord?.sdp ?? ""),
  });
  const walletIdentity = String(
    record.walletIdentity ?? record.wallet_identity ?? "",
  ).trim();
  const roomId = String(record.roomId ?? record.room_id ?? "").trim();

  return {
    schema: KAIGI_CHAIN_ANSWER_SCHEMA,
    callId,
    kind: "answer",
    ...(participantAccountId ? { participantAccountId } : {}),
    participantId,
    participantName,
    ...(walletIdentity ? { walletIdentity } : {}),
    ...(roomId ? { roomId } : {}),
    createdAtMs,
    description,
  };
};

const parseKaigiCallMetadata = (
  value: unknown,
  callId: string,
): KaigiCallMetadata => {
  const record = parseJsonRecord(value);
  if (!record || record.schema !== KAIGI_CALL_METADATA_SCHEMA) {
    throw new Error("Kaigi meeting metadata schema is invalid.");
  }
  const encryptedOffer = parseJsonRecord(
    record.encryptedOffer ?? record.encrypted_offer,
  );
  if (!encryptedOffer) {
    throw new Error("Kaigi meeting metadata.encryptedOffer is required.");
  }
  return {
    schema: KAIGI_CALL_METADATA_SCHEMA,
    meetingCode: normalizeKaigiMeetingCode(
      record.meetingCode ?? record.meeting_code,
      callId,
    ),
    expiresAtMs: normalizeTimestampMs(
      Number(record.expiresAtMs ?? record.expires_at_ms),
      "kaigi meeting metadata.expiresAtMs",
    ),
    live: record.live !== false,
    privacyMode: normalizeKaigiMeetingPrivacy(
      record.privacyMode ?? record.privacy_mode,
    ),
    peerIdentityReveal: normalizeKaigiPeerIdentityReveal(
      record.peerIdentityReveal ?? record.peer_identity_reveal,
    ),
    encryptedOffer: encryptedOffer as KaigiSecretBox,
  };
};

const resolveKaigiMeetingView = (
  callPayload: KaigiCallView,
  callId: string,
  inviteSecretBase64Url: string,
): KaigiMeetingView => {
  const callMetadata = parseKaigiCallMetadata(
    parseJsonRecord(callPayload.metadata)?.kaigi_call ??
      parseJsonRecord(callPayload.metadata)?.kaigiCall,
    callId,
  );
  const offerPayload = decryptKaigiPayloadWithSecret<KaigiCallOfferPayload>(
    callMetadata.encryptedOffer,
    inviteSecretBase64Url,
  );
  if (offerPayload.schema !== KAIGI_CALL_OFFER_SCHEMA) {
    throw new Error("Kaigi offer metadata schema is invalid.");
  }
  const scheduledStartValue = callPayload.scheduled_start_ms;
  const createdAtValue = callPayload.created_at_ms;
  const endedAtValue = callPayload.ended_at_ms;
  const statusValue = String(callPayload.status ?? "").toLowerCase();
  const ended =
    Number(endedAtValue) > 0 ||
    statusValue.includes("ended") ||
    statusValue.includes("inactive");

  return {
    callId: normalizeKaigiCallId(callId, "callId"),
    meetingCode:
      callMetadata.meetingCode || normalizeKaigiMeetingCode(null, callId),
    ...(String(callPayload.title ?? "").trim()
      ? { title: String(callPayload.title).trim() }
      : {}),
    ...(offerPayload.hostAccountId
      ? {
          hostAccountId: normalizeCompatAccountIdLiteral(
            offerPayload.hostAccountId,
            "hostAccountId",
          ),
        }
      : {}),
    ...(offerPayload.hostDisplayName
      ? { hostDisplayName: offerPayload.hostDisplayName }
      : {}),
    ...(offerPayload.hostParticipantId
      ? { hostParticipantId: offerPayload.hostParticipantId }
      : {}),
    hostKaigiPublicKeyBase64Url: normalizeBase64UrlString(
      offerPayload.hostKaigiPublicKeyBase64Url,
      "hostKaigiPublicKeyBase64Url",
    ),
    scheduledStartMs:
      Number.isFinite(Number(scheduledStartValue)) &&
      Number(scheduledStartValue) > 0
        ? Number(scheduledStartValue)
        : offerPayload.createdAtMs,
    expiresAtMs: callMetadata.expiresAtMs,
    createdAtMs: normalizeTimestampMs(
      Number(createdAtValue ?? offerPayload.createdAtMs),
      "kaigi record.createdAtMs",
    ),
    live: Boolean(callMetadata.live),
    ended,
    ...(Number.isFinite(Number(endedAtValue)) && Number(endedAtValue) > 0
      ? { endedAtMs: Number(endedAtValue) }
      : {}),
    privacyMode: callMetadata.privacyMode,
    peerIdentityReveal: callMetadata.peerIdentityReveal,
    rosterRootHex: normalizeKaigiRosterRootHex(
      callPayload.roster_root_hex,
      "kaigi call.roster_root_hex",
    ),
    offerDescription: normalizeKaigiOfferDescription(offerPayload.description),
  };
};

const ensureObjectResponse = (
  payload: unknown,
  label: string,
): Record<string, unknown> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} response must be a JSON object.`);
  }
  return payload as Record<string, unknown>;
};

const fetchJson = async (
  endpoint: string,
  label: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const response = await nodeFetch(endpoint, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
      ...(headers ?? {}),
    },
  });
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, label);
};

const NETWORK_STATS_REQUEST_TIMEOUT_MS = 3_500;

const withNetworkStatsTimeout = async <T>(
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} request timed out.`);
      controller.abort(error);
      reject(error);
    }, NETWORK_STATS_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const fetchRuntimeStatusSnapshot = async (
  client: ToriiClient,
  toriiUrlRaw: string,
  signal: AbortSignal,
): Promise<unknown> => {
  try {
    return await fetchJson(
      buildNexusEndpoint(toriiUrlRaw, "/status"),
      "Runtime status telemetry",
      undefined,
      signal,
    );
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return client.getStatusSnapshot({ signal });
  }
};

const postJson = async (
  endpoint: string,
  label: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await nodeFetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, label);
};

const CHAIN_METADATA_PATHS = [
  "/v1/chain/metadata",
  "/chain/metadata",
  "/v1/network/metadata",
  "/network/metadata",
  "/v1/network",
  "/network",
  "/v1/explorer/network",
  "/explorer/network",
  "/v1/explorer/chain",
  "/explorer/chain",
  "/v1/configuration",
  "/configuration",
  "/v1/status",
  "/status",
  "/v1/explorer/accounts?limit=1",
  "/v1/accounts?limit=1",
] as const;

const readChainMetadataHeaders = (
  headers: Pick<Headers, "get">,
): ChainMetadataDraft =>
  extractChainMetadataFromPayload({
    chain_id: headers.get("x-iroha-chain-id"),
    chainId: headers.get("x-iroha-chain-id"),
    network_prefix: headers.get("x-iroha-network-prefix"),
    networkPrefix: headers.get("x-iroha-network-prefix"),
  });

const mergeChainMetadataDraft = (
  current: ChainMetadataDraft,
  next: ChainMetadataDraft,
): ChainMetadataDraft => ({
  chainId: current.chainId || next.chainId,
  networkPrefix:
    current.networkPrefix === undefined
      ? next.networkPrefix
      : current.networkPrefix,
});

const parseJsonIfAvailable = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return null;
  }
  return await response.json();
};

const resolveKnownChainMetadataFallback = (
  toriiUrlRaw: string,
  draft: ChainMetadataDraft,
): ChainMetadataDraft | undefined => {
  const endpointOrigin = new URL(normalizeBaseUrl(toriiUrlRaw)).origin;
  for (const fallback of KNOWN_CHAIN_METADATA_FALLBACKS) {
    const fallbackOrigin = new URL(fallback.toriiUrl).origin;
    if (endpointOrigin === fallbackOrigin) {
      return {
        chainId: fallback.chainId,
        networkPrefix: fallback.networkPrefix,
      };
    }
    if (draft.networkPrefix === fallback.networkPrefix) {
      return {
        chainId: fallback.chainId,
      };
    }
  }
  return undefined;
};

const fetchChainMetadata = async (
  toriiUrlRaw: string,
): Promise<ChainMetadataResponse> => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  let draft: ChainMetadataDraft = {};
  let reachedEndpoint = false;
  let lastError: unknown = null;

  for (const path of CHAIN_METADATA_PATHS) {
    const endpoint = `${baseUrl}${path}`;
    try {
      const response = await nodeFetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      reachedEndpoint = true;
      const headerDraft = readChainMetadataHeaders(response.headers);
      draft = mergeChainMetadataDraft(draft, headerDraft);

      if ([401, 403, 404, 503].includes(response.status)) {
        continue;
      }
      if (!response.ok) {
        throw await createApiRequestError(response, "Chain metadata");
      }

      const payload = await parseJsonIfAvailable(response);
      draft = mergeChainMetadataDraft(
        draft,
        extractChainMetadataFromPayload(payload),
      );
      if (draft.chainId && draft.networkPrefix !== undefined) {
        return normalizeChainMetadata(draft);
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!reachedEndpoint && lastError) {
    throw lastError;
  }

  return normalizeChainMetadata(
    draft,
    resolveKnownChainMetadataFallback(toriiUrlRaw, draft),
  );
};

const normalizeOptionalAccountNetworkPrefix = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0x3fff) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return normalized;
};

const createChainMetadataMismatchError = (input: {
  expectedChainId: string;
  configuredChainId: string;
}) =>
  new Error(
    `Torii endpoint chain id mismatch: endpoint expects "${input.expectedChainId}", but the app is configured for "${input.configuredChainId}". Open Settings and use Check & Save for this endpoint before sending.`,
  );

const assertWriteConnectionMatchesEndpoint = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix?: number;
}) => {
  const configuredChainId = String(input.chainId ?? "").trim();
  if (!configuredChainId) {
    throw new Error("chainId is required.");
  }
  const configuredNetworkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  let metadata: ChainMetadataResponse | null = null;
  const knownMetadata = resolveKnownChainMetadataFallback(input.toriiUrl, {});

  if (knownMetadata?.chainId && knownMetadata.networkPrefix !== undefined) {
    metadata = normalizeChainMetadata(knownMetadata);
  } else {
    try {
      metadata = await fetchChainMetadata(input.toriiUrl);
    } catch {
      metadata = null;
    }
  }

  if (!metadata) {
    return {
      chainId: configuredChainId,
      networkPrefix: configuredNetworkPrefix,
    };
  }

  if (metadata.chainId !== configuredChainId) {
    throw createChainMetadataMismatchError({
      expectedChainId: metadata.chainId,
      configuredChainId,
    });
  }

  if (
    configuredNetworkPrefix !== undefined &&
    metadata.networkPrefix !== configuredNetworkPrefix
  ) {
    throw new Error(
      `Torii endpoint network prefix mismatch: endpoint reports "${metadata.networkPrefix}", but the app is configured for "${configuredNetworkPrefix}". Open Settings and use Check & Save for this endpoint before sending.`,
    );
  }

  return {
    chainId: configuredChainId,
    networkPrefix: configuredNetworkPrefix ?? metadata.networkPrefix,
  };
};

const tryNormalizeCanonicalAccountIdLiteral = (
  value: string,
  label: string,
  networkPrefix?: number,
) => {
  try {
    return normalizeCanonicalAccountIdLiteral(value, label, networkPrefix);
  } catch {
    return "";
  }
};

const normalizeFirstAccountIdCandidate = (
  candidates: string[],
  label: string,
  networkPrefix?: number,
) => {
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const literal = trimString(candidate);
    if (!literal) {
      continue;
    }
    try {
      return normalizeCanonicalAccountIdLiteral(literal, label, networkPrefix);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(`${label} must be a non-empty string.`);
};

const resolveAccountAliasSelector = async (
  input: ResolveAccountAliasInput,
): Promise<AccountAliasResolutionResponse> => {
  const selector = trimString(input.alias);
  if (!selector) {
    throw new Error("alias must be a non-empty string.");
  }
  const networkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  const literalAccountId = tryNormalizeCanonicalAccountIdLiteral(
    selector,
    "accountId",
    networkPrefix,
  );
  if (literalAccountId) {
    return {
      alias: "",
      accountId: literalAccountId,
      resolved: false,
    };
  }

  const client = getClient(input.toriiUrl);
  let aliasResolveError: unknown = null;
  try {
    const resolved = await client.resolveAlias(selector);
    const resolvedAccountId = trimString(resolved?.account_id);
    if (resolvedAccountId) {
      const accountId = normalizeFirstAccountIdCandidate(
        [resolvedAccountId],
        "alias account_id",
        networkPrefix,
      );
      const source = trimString(resolved?.source);
      return {
        alias: trimString(resolved?.alias) || selector,
        accountId,
        resolved: true,
        ...(source ? { source } : {}),
      };
    }
  } catch (error) {
    aliasResolveError = error;
  }

  try {
    const snapshot = await client.getExplorerAccountQr(selector);
    const accountId = normalizeFirstAccountIdCandidate(
      [snapshot.literal, snapshot.canonicalId],
      "explorer account alias",
      networkPrefix ?? snapshot.networkPrefix,
    );
    return {
      alias: selector,
      accountId,
      resolved: true,
      source: "explorer_qr",
    };
  } catch (qrError) {
    if (aliasResolveError) {
      const detail =
        aliasResolveError instanceof Error
          ? trimString(aliasResolveError.message)
          : trimString(aliasResolveError);
      throw new Error(
        detail
          ? `Account alias "${selector}" could not be resolved. ${detail}`
          : `Account alias "${selector}" could not be resolved.`,
      );
    }
    const detail =
      qrError instanceof Error
        ? trimString(qrError.message)
        : trimString(qrError);
    throw new Error(
      detail
        ? `Account alias "${selector}" could not be resolved. ${detail}`
        : `Account alias "${selector}" was not found.`,
    );
  }
};

const fetchKaigiMeetingView = async (
  input: KaigiGetMeetingInput,
): Promise<KaigiMeetingView> => {
  const payload = await getClient(input.toriiUrl).getKaigiCall(
    normalizeKaigiCallId(input.callId, "callId"),
  );
  if (!payload) {
    throw new Error("Kaigi meeting was not found.");
  }
  return resolveKaigiMeetingView(
    payload,
    payload.call_id ?? input.callId,
    normalizeBase64UrlString(
      input.inviteSecretBase64Url,
      "inviteSecretBase64Url",
    ),
  );
};

const resolveKaigiRelayManifest = async (
  client: ToriiClient,
  expiryMs: number,
) => {
  try {
    const summaries = await client.listKaigiRelays();
    const candidates = [...(summaries.items ?? [])]
      .filter((item) =>
        ["healthy", "degraded", ""].includes(String(item.status ?? "").trim()),
      )
      .sort((left, right) => {
        if ((left.status ?? "") !== (right.status ?? "")) {
          if (left.status === "healthy") return -1;
          if (right.status === "healthy") return 1;
        }
        return (
          Number(right.bandwidth_class ?? 0) - Number(left.bandwidth_class ?? 0)
        );
      })
      .slice(0, 2);
    if (candidates.length === 0) {
      return null;
    }
    const details = await Promise.all(
      candidates.map((candidate) => client.getKaigiRelay(candidate.relay_id)),
    );
    const hops = details
      .filter(
        (detail): detail is Exclude<(typeof details)[number], null> =>
          detail !== null,
      )
      .map((detail, index) => ({
        relayId: detail.relay.relay_id,
        hpkePublicKey: detail.hpke_public_key_b64,
        weight: Math.max(1, 2 - index),
      }));
    if (hops.length === 0) {
      return null;
    }
    return {
      expiryMs,
      hops,
    };
  } catch (_error) {
    return null;
  }
};

const buildNexusEndpoint = (
  toriiUrlRaw: string,
  path: string,
  query?: Record<string, string | number | undefined>,
) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const encoded = String(value).trim();
      if (!encoded) continue;
      params.set(key, encoded);
    }
  }
  return `${baseUrl}${path}${params.size ? `?${params.toString()}` : ""}`;
};

const normalizeSubscriptionPlanListPayload = (
  payload: Record<string, unknown>,
): SubscriptionPlanListResponseView => {
  const items = Array.isArray(payload.items)
    ? payload.items.filter(isPlainRecord).map((item) => ({
        plan_id: trimString(item.plan_id ?? item.planId ?? item.id),
        plan: isPlainRecord(item.plan) ? item.plan : {},
      }))
    : [];
  return {
    items: items.filter((item) => item.plan_id),
    total: normalizeTotal(payload.total, items.length),
  };
};

const normalizeSubscriptionListItem = (
  item: Record<string, unknown>,
): SubscriptionListItemView | null => {
  const subscriptionId = trimString(
    item.subscription_id ?? item.subscriptionId ?? item.id,
  );
  const subscription = isPlainRecord(item.subscription)
    ? item.subscription
    : {};
  if (!subscriptionId || Object.keys(subscription).length === 0) {
    return null;
  }
  return {
    subscription_id: subscriptionId,
    subscription,
    invoice: isPlainRecord(item.invoice) ? item.invoice : null,
    plan: isPlainRecord(item.plan) ? item.plan : null,
  };
};

const normalizeSubscriptionListPayload = (
  payload: Record<string, unknown>,
): SubscriptionListResponseView => {
  const items = Array.isArray(payload.items)
    ? payload.items
        .filter(isPlainRecord)
        .map(normalizeSubscriptionListItem)
        .filter((item): item is SubscriptionListItemView => item !== null)
    : [];
  return {
    items,
    total: normalizeTotal(payload.total, items.length),
  };
};

const normalizeSubscriptionGetPayload = (
  payload: Record<string, unknown>,
): SubscriptionListItemView => {
  const item = normalizeSubscriptionListItem(payload);
  if (!item) {
    throw new Error(
      "Subscription response did not include subscription state.",
    );
  }
  return item;
};

const normalizeSubscriptionActionPayload = (
  payload: Record<string, unknown>,
): SubscriptionActionResponseView => ({
  ok: Boolean(payload.ok),
  subscription_id: trimString(
    payload.subscription_id ?? payload.subscriptionId,
  ),
  tx_hash_hex: trimString(payload.tx_hash_hex ?? payload.txHashHex),
  ...(payload.fee !== undefined
    ? { fee: payload.fee as TransactionFeeView }
    : payload.tx_fee !== undefined || payload.txFee !== undefined
      ? { fee: (payload.tx_fee ?? payload.txFee) as TransactionFeeView }
      : payload.transaction_fee !== undefined ||
          payload.transactionFee !== undefined
        ? {
            fee: (payload.transaction_fee ??
              payload.transactionFee) as TransactionFeeView,
          }
        : payload.network_fee !== undefined || payload.networkFee !== undefined
          ? {
              fee: (payload.network_fee ??
                payload.networkFee) as TransactionFeeView,
            }
          : payload.fee_amount !== undefined || payload.feeAmount !== undefined
            ? {
                fee: {
                  amount: (payload.fee_amount ?? payload.feeAmount) as
                    | string
                    | number
                    | null,
                  assetId: trimString(
                    payload.fee_asset_id ??
                      payload.feeAssetId ??
                      payload.gas_asset_id ??
                      payload.gasAssetId ??
                      payload.asset_id ??
                      payload.assetId,
                  ),
                },
              }
            : {}),
  ...(payload.billing_trigger_id !== undefined
    ? { billing_trigger_id: trimString(payload.billing_trigger_id) }
    : {}),
  ...(payload.usage_trigger_id !== undefined
    ? { usage_trigger_id: trimString(payload.usage_trigger_id) || null }
    : {}),
  ...(payload.first_charge_ms !== undefined
    ? { first_charge_ms: Number(payload.first_charge_ms) }
    : {}),
});

const normalizeTotal = (value: unknown, fallback: number): number => {
  const total = Number(value);
  return Number.isFinite(total) && total >= 0 ? Math.trunc(total) : fallback;
};

const normalizeOptionalPositiveInteger = (
  value: unknown,
  label: string,
): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
};

const normalizeSubscriptionPrivateActionBody = async (
  input: SubscriptionActionInput,
  operationLabel: string,
) => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel,
  });
  const body: Record<string, unknown> = {
    authority: accountId,
    private_key: formatExposedPrivateKey(signingMaterial),
  };
  const chargeAtMs = normalizeOptionalPositiveInteger(
    input.chargeAtMs,
    "chargeAtMs",
  );
  if (chargeAtMs !== undefined) {
    body.charge_at_ms = chargeAtMs;
  }
  if (input.cancelMode) {
    body.cancel_mode = input.cancelMode;
  }
  return body;
};

const listSubscriptionPlansFromTorii = async (
  input: SubscriptionListPlansInput,
): Promise<SubscriptionPlanListResponseView> => {
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    "/v1/subscriptions/plans",
    {
      provider: trimString(input.provider) || undefined,
      limit: input.limit,
      offset: input.offset,
    },
  );
  const payload = await fetchJson(endpoint, "Subscription plans");
  return normalizeSubscriptionPlanListPayload(payload);
};

const listSubscriptionsFromTorii = async (
  input: SubscriptionListInput,
): Promise<SubscriptionListResponseView> => {
  const endpoint = buildNexusEndpoint(input.toriiUrl, "/v1/subscriptions", {
    owned_by: trimString(input.ownedBy) || undefined,
    provider: trimString(input.provider) || undefined,
    status: trimString(input.status) || undefined,
    limit: input.limit,
    offset: input.offset,
  });
  const payload = await fetchJson(endpoint, "Subscriptions");
  return normalizeSubscriptionListPayload(payload);
};

const getSubscriptionFromTorii = async (
  input: SubscriptionGetInput,
): Promise<SubscriptionListItemView> => {
  const subscriptionId = trimString(input.subscriptionId);
  if (!subscriptionId) {
    throw new Error("subscriptionId is required.");
  }
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const payload = await fetchJson(endpoint, "Subscription");
  return normalizeSubscriptionGetPayload(payload);
};

const createSubscriptionOnTorii = async (
  input: SubscriptionCreateInput,
): Promise<SubscriptionActionResponseView> => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Create subscription",
  });
  const subscriptionId = trimString(input.subscriptionId);
  const planId = trimString(input.planId);
  if (!subscriptionId) {
    throw new Error("subscriptionId is required.");
  }
  if (!planId) {
    throw new Error("planId is required.");
  }
  const firstChargeMs = normalizeOptionalPositiveInteger(
    input.firstChargeMs,
    "firstChargeMs",
  );
  const body: Record<string, unknown> = {
    authority: accountId,
    private_key: formatExposedPrivateKey(signingMaterial),
    subscription_id: subscriptionId,
    plan_id: planId,
  };
  if (firstChargeMs !== undefined) {
    body.first_charge_ms = firstChargeMs;
  }
  const payload = await postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/subscriptions"),
    "Create subscription",
    body,
  );
  return normalizeSubscriptionActionPayload(payload);
};

const postSubscriptionActionToTorii = async (
  input: SubscriptionActionInput,
  action: "pause" | "resume" | "cancel" | "keep" | "charge-now",
  operationLabel: string,
): Promise<SubscriptionActionResponseView> => {
  const subscriptionId = trimString(input.subscriptionId);
  if (!subscriptionId) {
    throw new Error("subscriptionId is required.");
  }
  const body = await normalizeSubscriptionPrivateActionBody(
    input,
    operationLabel,
  );
  const payload = await postJson(
    buildNexusEndpoint(
      input.toriiUrl,
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`,
    ),
    operationLabel,
    body,
  );
  return normalizeSubscriptionActionPayload(payload);
};

const buildSoraCloudHeaders = (apiToken?: string): Record<string, string> => {
  const token = trimString(apiToken);
  return token ? { "x-api-token": token } : {};
};

const normalizeSoraCloudStorageClass = (
  value: unknown,
): SoraCloudStorageClass => {
  const normalized = trimString(value).toLowerCase();
  if (normalized === "hot" || normalized === "warm" || normalized === "cold") {
    return normalized;
  }
  throw new Error("storageClass must be hot, warm, or cold.");
};

const normalizePositiveU64Number = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};

const normalizePositiveU128String = (value: unknown, label: string): string => {
  const literal = trimString(value);
  if (!/^\d+$/u.test(literal) || BigInt(literal) <= 0n) {
    throw new Error(`${label} must be a positive integer string.`);
  }
  return literal;
};

const normalizeSoraCloudMutationResponse = (
  payload: Record<string, unknown>,
): SoraCloudHfDeployResponseView => ({
  ok: payload.ok === undefined ? true : Boolean(payload.ok),
  action: trimString(payload.action),
  service_name: trimString(payload.service_name ?? payload.serviceName),
  sequence:
    payload.sequence === undefined || payload.sequence === null
      ? null
      : Number(payload.sequence),
  current_version:
    payload.current_version !== undefined
      ? trimString(payload.current_version)
      : payload.currentVersion !== undefined
        ? trimString(payload.currentVersion)
        : null,
  revision_count:
    payload.revision_count !== undefined
      ? Number(payload.revision_count)
      : payload.revisionCount !== undefined
        ? Number(payload.revisionCount)
        : null,
  tx_hash_hex:
    payload.tx_hash_hex !== undefined
      ? trimString(payload.tx_hash_hex)
      : payload.txHashHex !== undefined
        ? trimString(payload.txHashHex)
        : null,
  ...(payload.fee !== undefined
    ? { fee: payload.fee as TransactionFeeView }
    : payload.tx_fee !== undefined || payload.txFee !== undefined
      ? { fee: (payload.tx_fee ?? payload.txFee) as TransactionFeeView }
      : payload.transaction_fee !== undefined ||
          payload.transactionFee !== undefined
        ? {
            fee: (payload.transaction_fee ??
              payload.transactionFee) as TransactionFeeView,
          }
        : payload.network_fee !== undefined || payload.networkFee !== undefined
          ? {
              fee: (payload.network_fee ??
                payload.networkFee) as TransactionFeeView,
            }
          : payload.fee_amount !== undefined || payload.feeAmount !== undefined
            ? {
                fee: {
                  amount: (payload.fee_amount ?? payload.feeAmount) as
                    | string
                    | number
                    | null,
                  assetId: trimString(
                    payload.fee_asset_id ??
                      payload.feeAssetId ??
                      payload.gas_asset_id ??
                      payload.gasAssetId ??
                      payload.asset_id ??
                      payload.assetId,
                  ),
                },
              }
            : {}),
  rollout_handle:
    payload.rollout_handle !== undefined
      ? trimString(payload.rollout_handle)
      : payload.rolloutHandle !== undefined
        ? trimString(payload.rolloutHandle)
        : null,
  rollout_stage:
    payload.rollout_stage !== undefined
      ? trimString(payload.rollout_stage)
      : payload.rolloutStage !== undefined
        ? trimString(payload.rolloutStage)
        : null,
  rollout_percent:
    payload.rollout_percent !== undefined
      ? Number(payload.rollout_percent)
      : payload.rolloutPercent !== undefined
        ? Number(payload.rolloutPercent)
        : null,
  raw: payload,
});

const getSoraCloudStatusFromTorii = async (
  input: SoraCloudStatusInput,
): Promise<SoraCloudStatusView> => {
  try {
    const payload = await fetchJson(
      buildNexusEndpoint(input.toriiUrl, "/v1/soracloud/status"),
      "SoraCloud status",
      buildSoraCloudHeaders(input.apiToken),
    );
    return normalizeSoraCloudStatusPayload(payload);
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      [404, 405, 501].includes(error.status)
    ) {
      return unavailableSoraCloudStatus(
        "This Torii endpoint does not expose the SoraCloud API yet.",
        error.status,
      );
    }
    throw error;
  }
};

const deploySoraCloudHfOnTorii = async (
  input: SoraCloudHfDeployInput,
): Promise<SoraCloudHfDeployResponseView> => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: "Launch SoraCloud instance",
    }),
    "Launch SoraCloud instance",
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  const request = buildSoraCloudHfDeployRequest({
    repoId: trimString(input.repoId),
    revision: trimString(input.revision) || undefined,
    modelName: trimString(input.modelName),
    serviceName: trimString(input.serviceName),
    apartmentName: trimString(input.apartmentName) || undefined,
    storageClass: normalizeSoraCloudStorageClass(input.storageClass),
    leaseTermMs: normalizePositiveU64Number(input.leaseTermMs, "leaseTermMs"),
    leaseAssetDefinitionId: trimString(input.leaseAssetDefinitionId),
    baseFeeNanos: normalizePositiveU128String(
      input.baseFeeNanos,
      "baseFeeNanos",
    ),
    privateKeyHex,
  });
  const payload = await postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/soracloud/hf/deploy"),
    "Launch SoraCloud instance",
    {
      ...request,
      authority: accountId,
    },
    buildSoraCloudHeaders(input.apiToken),
  );
  return normalizeSoraCloudMutationResponse(payload);
};

const getSoraCloudHfStatusFromTorii = async (
  input: SoraCloudStatusInput,
): Promise<Record<string, unknown>> =>
  fetchJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/soracloud/hf/status"),
    "SoraCloud HF status",
    buildSoraCloudHeaders(input.apiToken),
  );

const DEFAULT_TRON_GATEWAY_URL = "https://api.trongrid.io";

const buildSccpDestinationProofOptions = (
  input: SccpDestinationProofMaterialInput,
): ToriiSccpEvmDestinationQueryOptions => {
  const options: ToriiSccpEvmDestinationQueryOptions = {};
  if (trimString(input.networkIdHex)) {
    options.networkIdHex = trimString(input.networkIdHex);
  }
  if (trimString(input.verifierAddressHex)) {
    options.verifierAddressHex = trimString(input.verifierAddressHex);
  }
  if (trimString(input.bridgeAddressHex)) {
    options.bridgeAddressHex = trimString(input.bridgeAddressHex);
  }
  if (trimString(input.verifierCodeHashHex)) {
    options.verifierCodeHashHex = trimString(input.verifierCodeHashHex);
  }
  if (trimString(input.verifierKeyHashHex)) {
    options.verifierKeyHashHex = trimString(input.verifierKeyHashHex);
  }
  if (trimString(input.expectedDestinationBindingHashHex)) {
    options.expectedDestinationBindingHashHex = trimString(
      input.expectedDestinationBindingHashHex,
    );
  }
  if (trimString(input.tronVerifierAddress)) {
    options.tronVerifierAddress = trimString(input.tronVerifierAddress);
  }
  if (trimString(input.proofBytesHex)) {
    options.proofBytesHex = trimString(input.proofBytesHex);
  }
  return options;
};

const normalizeSccpMessageIdPathSegment = (value: string): string => {
  const normalized = trimString(value).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("SCCP message id must be a 32-byte hex string.");
  }
  return normalized;
};

const getSccpMessageProofBundleFromTorii = (
  input: SccpMessageProofBundleInput,
): Promise<SccpMessageProofBundleResponse> =>
  fetchJson(
    buildNexusEndpoint(
      input.toriiUrl,
      `/v1/sccp/proofs/message/${normalizeSccpMessageIdPathSegment(input.messageId)}`,
    ),
    "SCCP message proof bundle",
  );

const SCCP_DISCOVERY_REQUEST_TIMEOUT_MS = 15_000;

const withSccpDiscoveryTimeout = async <T>(
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} request timed out.`);
      controller.abort(error);
      reject(error);
    }, SCCP_DISCOVERY_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const getSccpCapabilitiesFromTorii = (
  input: ToriiConfig,
): Promise<SccpCapabilitiesResponse> =>
  withSccpDiscoveryTimeout("SCCP capabilities", (signal) =>
    getClient(input.toriiUrl).getSccpCapabilities({ signal }),
  );

const getParametersFromTorii = (
  input: ToriiConfig,
): Promise<Record<string, unknown>> =>
  withSccpDiscoveryTimeout("Network parameters", (signal) =>
    fetchJson(
      buildNexusEndpoint(input.toriiUrl, "/v1/parameters"),
      "Network parameters",
      undefined,
      signal,
    ),
  );

const getSccpProofManifestsFromTorii = (
  input: ToriiConfig,
): Promise<SccpProofManifestSetResponse> =>
  withSccpDiscoveryTimeout("SCCP proof manifests", (signal) =>
    getClient(input.toriiUrl).getSccpProofManifests({ signal }),
  );

const listSccpRecentMessagesFromTorii = async (
  input: SccpRecentMessagesInput,
): Promise<SccpRecentMessagesResponse> => {
  const payload = await withSccpDiscoveryTimeout(
    "SCCP recent messages",
    (signal) =>
      fetchJson(
        buildNexusEndpoint(input.toriiUrl, "/v1/sccp/messages/recent", {
          route_id: trimString(input.routeId) || undefined,
          limit: input.limit,
          offset: input.offset,
        }),
        "SCCP recent messages",
        undefined,
        signal,
      ),
  );
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.messages)
      ? payload.messages
      : [];
  const items = rawItems.filter(
    (entry): entry is Record<string, unknown> =>
      isPlainRecord(entry) && !Array.isArray(entry),
  );
  return {
    items,
    total: normalizeTotal(payload.total, items.length),
    raw: payload,
  };
};

const normalizeSccpSubmissionRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const normalized = snapshotSccpDataValue(value, label) as Record<
    string,
    unknown
  >;
  if (!isPlainRecord(normalized)) {
    throw new Error(`${label} must be an object.`);
  }
  assertNoSecretLikePayloadFields(normalized, label);
  return normalized;
};

const normalizeOptionalSccpSubmissionRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  return normalizeSccpSubmissionRecord(value, label);
};

const buildSccpBridgeAuthorityPayload = async (
  input: {
    accountId: string;
    privateKeyHex?: unknown;
    publicKeyHex?: string;
    signatureB64?: string;
  },
  operationLabel: string,
) => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  if (trimString(input.privateKeyHex)) {
    throw new Error(
      "SCCP bridge submissions must use stored wallet secrets or detached signatures; inline private keys are not accepted.",
    );
  }
  const publicKeyHex = trimString(input.publicKeyHex);
  const signatureB64 = trimString(input.signatureB64);
  if (Boolean(publicKeyHex) !== Boolean(signatureB64)) {
    throw new Error(
      "SCCP detached signature submissions require both publicKeyHex and signatureB64.",
    );
  }
  const hasDetachedSignature = Boolean(publicKeyHex && signatureB64);
  return {
    authority: accountId,
    ...(hasDetachedSignature
      ? { publicKeyHex, signatureB64 }
      : {
          privateKey: formatExposedPrivateKey(
            await resolveSigningMaterial({
              accountId,
              operationLabel,
            }),
          ),
        }),
  };
};

const submitSccpBridgeProofToTorii = async (
  input: SccpBridgeProofSubmitInput,
): Promise<Record<string, unknown>> => {
  const burnBundle = normalizeOptionalSccpSubmissionRecord(
    input.burnBundle,
    "SCCP burnBundle",
  );
  const messageBundle = normalizeOptionalSccpSubmissionRecord(
    input.messageBundle,
    "SCCP messageBundle",
  );
  const auth = await buildSccpBridgeAuthorityPayload(
    input,
    "Submit SCCP bridge proof",
  );
  const payload: ToriiBridgeProofSubmitPayload = {
    ...auth,
    ...(burnBundle ? { burnBundle } : {}),
    ...(messageBundle ? { messageBundle } : {}),
    ...buildSccpDestinationProofOptions(input),
    ...(input.creationTimeMs !== undefined
      ? { creationTimeMs: input.creationTimeMs }
      : {}),
  };
  const client = getClient(input.toriiUrl);
  return client.submitBridgeProof(payload);
};

const submitSccpBridgeMessageToTorii = async (
  input: SccpBridgeMessageSubmitInput,
): Promise<Record<string, unknown>> => {
  const messageBundle = normalizeSccpSubmissionRecord(
    input.messageBundle,
    "SCCP messageBundle",
  );
  const settlement = normalizeOptionalSccpSubmissionRecord(
    input.settlement,
    "SCCP settlement",
  );
  const auth = await buildSccpBridgeAuthorityPayload(
    input,
    "Submit SCCP bridge message",
  );
  const payload: ToriiBridgeMessageSubmitPayload = {
    ...auth,
    messageBundle,
    ...buildSccpDestinationProofOptions(input),
    ...(input.receiptLane !== undefined
      ? { receiptLane: input.receiptLane }
      : {}),
    ...(settlement ? { settlement } : {}),
    ...(input.creationTimeMs !== undefined
      ? { creationTimeMs: input.creationTimeMs }
      : {}),
  };
  const client = getClient(input.toriiUrl);
  return client.submitBridgeMessage(payload);
};

const waitForSccpTransactionCommitOnTorii = async (
  input: SccpTransactionCommitWaitInput,
): Promise<Record<string, unknown>> => {
  const fee = await waitForTransactionCommit(input.toriiUrl, input.hashHex);
  return {
    ok: true,
    hash_hex: input.hashHex,
    status: "Applied",
    ...(fee ? { fee } : {}),
  };
};

const SCCP_BSC_NODE_PROVER_TIMEOUT_MS = 20 * 60 * 1000;
const SCCP_BSC_NODE_PROVER_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
const SCCP_BSC_NODE_PROVER_CHILD_SOURCE = String.raw`
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
process.stdin.on("end", async () => {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const nativeFetch = globalThis.fetch?.bind(globalThis);
    if (typeof nativeFetch !== "function") {
      throw new Error("BSC SCCP child prover runtime does not expose fetch.");
    }
    globalThis.fetch = async (resource, init) => {
      const rawUrl =
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : typeof resource?.url === "string"
              ? resource.url
              : "";
      if (/^file:/iu.test(rawUrl)) {
        if (init?.method && String(init.method).toUpperCase() !== "GET") {
          return new Response("file:// prover material only supports GET", { status: 405 });
        }
        const bytes = await readFile(fileURLToPath(rawUrl));
        const contentType = rawUrl.endsWith(".json")
          ? "application/json"
          : rawUrl.endsWith(".js") || rawUrl.endsWith(".mjs")
            ? "text/javascript"
            : "application/octet-stream";
        return new Response(bytes, {
          status: 200,
          headers: { "content-type": contentType },
        });
      }
      return nativeFetch(resource, init);
    };
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("BSC SCCP child prover input must be an object.");
    }
    const direction = input.direction === "source" ? "source" : "destination";
    const request = input.request;
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new Error("BSC SCCP child prover request must be an object.");
    }
    const moduleSpecifier = String(input.moduleSpecifier || "").trim();
    if (!moduleSpecifier) {
      throw new Error("BSC SCCP child prover module specifier is required.");
    }
    const configUrl = String(input.configUrl || "").trim();
    if (configUrl) {
      globalThis.IrohaSccpBscProverConfigUrl = configUrl;
    }
    const importProverModule = async (specifier) => {
      if (/^https?:\/\//iu.test(specifier)) {
        const response = await fetch(specifier, {
          method: "GET",
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("BSC SCCP prover module could not be loaded: HTTP " + response.status);
        }
        const source = await response.text();
        return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
      }
      return import(specifier);
    };
    const moduleExports = await importProverModule(moduleSpecifier);
    const prove =
      direction === "source"
        ? [
            moduleExports.irohaSccpBscSourceProve,
            moduleExports.bscSccpSourceProve,
            moduleExports.proveBscSource,
            moduleExports.proveSource,
            moduleExports.sourceProve,
          ].find((candidate) => typeof candidate === "function")
        : [
            moduleExports.irohaSccpBscProve,
            moduleExports.bscSccpProve,
            moduleExports.evmSccpProve,
            moduleExports.proveBsc,
            moduleExports.prove,
            moduleExports.proveFn,
            moduleExports.default,
          ].find((candidate) => typeof candidate === "function");
    if (typeof prove !== "function") {
      throw new Error("BSC SCCP prover module does not export a " + direction + " prove function.");
    }
    const proofBytesToHex = (value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value instanceof ArrayBuffer) {
        return "0x" + Buffer.from(value).toString("hex");
      }
      if (ArrayBuffer.isView(value)) {
        return "0x" + Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex");
      }
      if (Array.isArray(value)) {
        return "0x" + Buffer.from(value).toString("hex");
      }
      if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length > 0 && keys.every((key) => /^\d+$/u.test(key))) {
          return "0x" + Buffer.from(keys.sort((a, b) => Number(a) - Number(b)).map((key) => value[key])).toString("hex");
        }
      }
      throw new Error("BSC SCCP prover result proofBytes are missing.");
    };
    const resultField = (record, ...names) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        return undefined;
      }
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(record, name)) {
          return record[name];
        }
      }
      return undefined;
    };
    const result = await prove(request);
    if (direction === "source") {
      process.stdout.write(JSON.stringify({ ok: true, result }));
      return;
    }
    const proofBytes = proofBytesToHex(resultField(result, "proofBytes", "proof_bytes"));
    process.stdout.write(JSON.stringify({
      ok: true,
      result: {
        proofBytes,
        requestHash: resultField(result, "requestHash", "request_hash") ?? request.requestHash ?? request.request_hash,
        backend: resultField(result, "backend") ?? request.backend,
      },
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  }
});
`;

const resolveSccpProverHeapMb = (): number => {
  const rawValue =
    process.env["SCCP_BSC_PROVER_V8_HEAP_MB"] ??
    process.env["VITE_SCCP_BSC_PROVER_V8_HEAP_MB"] ??
    String(DEFAULT_SCCP_PROVER_V8_HEAP_MB);
  const normalizedValue = String(rawValue).trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "0" ||
    normalizedValue === "false" ||
    normalizedValue === "off"
  ) {
    return DEFAULT_SCCP_PROVER_V8_HEAP_MB;
  }
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed)
    ? Math.min(
        MAX_SCCP_PROVER_V8_HEAP_MB,
        Math.max(MIN_SCCP_PROVER_V8_HEAP_MB, Math.trunc(parsed)),
      )
    : DEFAULT_SCCP_PROVER_V8_HEAP_MB;
};

const activeSccpBscNetworkKey = (): "mainnet" | "testnet" => {
  const normalized = readRuntimeConfigEnv("VITE_SCCP_BSC_NETWORK")
    .toLowerCase()
    .replace(/_/gu, "-");
  return ["mainnet", "bsc-mainnet", "bnb-mainnet", "bsc"].includes(normalized)
    ? "mainnet"
    : "testnet";
};

const resolveSccpBscRuntimeProverConfigUrl = (input: unknown): string => {
  const explicit = trimString(input);
  if (explicit) {
    return explicit;
  }
  const active = activeSccpBscNetworkKey();
  return (
    readRuntimeConfigEnv(
      active === "mainnet"
        ? "VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL"
        : "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
    ) || readRuntimeConfigEnv("VITE_SCCP_BSC_PROVER_CONFIG_URL")
  );
};

const resolveSccpBscProverModuleSpecifier = (input: unknown): string => {
  const moduleUrl = trimString(input);
  if (!moduleUrl) {
    throw new Error("BSC SCCP prover module URL is required.");
  }
  if (/^https?:\/\//iu.test(moduleUrl) || moduleUrl.startsWith("data:")) {
    return moduleUrl;
  }
  if (moduleUrl.startsWith("file:")) {
    return moduleUrl;
  }
  const relativePath = moduleUrl.replace(/^\/+/u, "");
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    relativePath.split(/[\\/]+/u).includes("..")
  ) {
    throw new Error("BSC SCCP prover module URL must be package-relative.");
  }
  const preloadDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolvePath(process.cwd(), "public", relativePath),
    resolvePath(process.cwd(), "dist/renderer", relativePath),
    resolvePath(preloadDir, "../renderer", relativePath),
  ];
  const modulePath = candidates.find((candidate) => existsSync(candidate));
  if (!modulePath) {
    throw new Error(
      `BSC SCCP prover module was not found under public or renderer assets: ${moduleUrl}`,
    );
  }
  return pathToFileURL(modulePath).href;
};

const normalizeOptionalTimeoutMs = (
  value: unknown,
  fallback: number,
): number => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("BSC SCCP prover timeoutMs must be a positive integer.");
  }
  return Math.min(parsed, SCCP_BSC_NODE_PROVER_TIMEOUT_MS);
};

const collectLimitedChildOutput = (
  chunks: Buffer[],
  chunk: Buffer,
  label: string,
) => {
  const current = chunks.reduce((sum, entry) => sum + entry.byteLength, 0);
  if (current + chunk.byteLength > SCCP_BSC_NODE_PROVER_OUTPUT_MAX_BYTES) {
    throw new Error(`${label} exceeded the maximum output size.`);
  }
  chunks.push(Buffer.from(chunk));
};

const SCCP_BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const SCCP_BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
const SCCP_BSC_NATIVE_EVM_PROVER_BUNDLE_HASH_KEYS = [
  "nativeEvmProverBundleHash",
  "native_evm_prover_bundle_hash",
] as const;

const readSccpOwnField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
};

const readRequiredSccpTextField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): string => {
  const text = trimString(readSccpOwnField(value, keys));
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
};

const readOptionalSccpTextField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined => {
  const text = trimString(readSccpOwnField(value, keys));
  return text || undefined;
};

const readRequiredSccpRecordField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  const selected = readSccpOwnField(value, keys);
  if (!isPlainRecord(selected)) {
    throw new Error(`${label} must be an object.`);
  }
  return selected;
};

const readOptionalSccpRecordField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined => {
  const selected = readSccpOwnField(value, keys);
  return isPlainRecord(selected) ? selected : undefined;
};

const normalizeSccpUnsignedIndex = (value: unknown, label: string): string => {
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
      throw new Error(`${label} must be an unsigned integer.`);
    }
  } else {
    throw new Error(`${label} must be an unsigned integer.`);
  }
  if (parsed < 0n || parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} must fit in an unsigned 64-bit integer.`);
  }
  return parsed.toString();
};

const readOptionalSccpUnsignedIndex = (
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
  label: string,
): string | undefined => {
  if (!record) {
    return undefined;
  }
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
    const normalized = normalizeSccpUnsignedIndex(value, label);
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

const readBscSourceReceiptRootIndex = (
  request: Record<string, unknown>,
  receipt: Record<string, unknown> | undefined,
): string | undefined => {
  const keys = [
    "receiptRootIndex",
    "receipt_root_index",
    "transactionIndex",
    "transaction_index",
  ] as const;
  const topLevel = readOptionalSccpUnsignedIndex(
    request,
    keys,
    "BSC source receipt root index",
  );
  const receiptLevel = readOptionalSccpUnsignedIndex(
    receipt,
    keys,
    "BSC source receipt root index",
  );
  if (topLevel && receiptLevel && topLevel !== receiptLevel) {
    throw new Error(
      "BSC source receipt root index aliases disagree between request and receipt.",
    );
  }
  return topLevel || receiptLevel;
};

const withBscSourceReceiptRootIndex = <T extends Record<string, unknown>>(
  request: T,
): T & { receiptRootIndex?: string } => {
  const receipt = readOptionalSccpRecordField(request, ["receipt"]);
  const receiptRootIndex = readBscSourceReceiptRootIndex(request, receipt);
  return receiptRootIndex
    ? {
        ...request,
        receiptRootIndex,
      }
    : request;
};

const replaceBscSourceMessageBundleFinalityProof = (
  proofPackage: Record<string, unknown>,
  sourceProofHex: string,
): Record<string, unknown> => {
  const messageBundle = readRequiredSccpRecordField(
    proofPackage,
    ["messageBundle", "message_bundle"],
    "BSC SCCP source proof package messageBundle",
  );
  const patchedMessageBundle: Record<string, unknown> = {
    ...messageBundle,
    finality_proof: sourceProofHex,
  };
  if (Object.prototype.hasOwnProperty.call(messageBundle, "finalityProof")) {
    patchedMessageBundle.finalityProof = sourceProofHex;
  }
  const patchedPackage: Record<string, unknown> = {
    ...proofPackage,
    messageBundle: patchedMessageBundle,
  };
  if (Object.prototype.hasOwnProperty.call(proofPackage, "message_bundle")) {
    patchedPackage.message_bundle = patchedMessageBundle;
  }
  return patchedPackage;
};

const withBscSourcePublicInputFinality = (
  proofPackage: Record<string, unknown>,
  sourceProof: { finalityHeight: string; finalityBlockHash: string },
): Record<string, unknown> => {
  const publicInputKey = isPlainRecord(proofPackage.publicInputs)
    ? "publicInputs"
    : isPlainRecord(proofPackage.public_inputs)
      ? "public_inputs"
      : null;
  if (!publicInputKey) {
    return proofPackage;
  }
  return {
    ...proofPackage,
    [publicInputKey]: {
      ...(proofPackage[publicInputKey] as Record<string, unknown>),
      finalityHeight: sourceProof.finalityHeight,
      finalityBlockHash: sourceProof.finalityBlockHash,
    },
  };
};

const readBscSourceLaneMaterialForNativeProof = (
  request: Record<string, unknown>,
): {
  sourceVerifierMaterial: Record<string, unknown>;
  sourceAdapterEngineDeployment: Record<string, unknown>;
} | null => {
  const sourceVerifierMaterial = readOptionalSccpRecordField(request, [
    "sourceVerifierMaterial",
    "source_verifier_material",
    "bscSourceVerifierMaterial",
    "bsc_source_verifier_material",
    "sccpSourceVerifierMaterial",
    "sccp_source_verifier_material",
  ]);
  const sourceAdapterEngineDeployment = readOptionalSccpRecordField(request, [
    "sourceAdapterEngineDeployment",
    "source_adapter_engine_deployment",
    "sourceAdapterDeployment",
    "source_adapter_deployment",
    "bscSourceAdapterEngineDeployment",
    "bsc_source_adapter_engine_deployment",
    "bscSourceAdapterDeployment",
    "bsc_source_adapter_deployment",
  ]);
  if (!sourceVerifierMaterial && !sourceAdapterEngineDeployment) {
    return null;
  }
  if (!sourceVerifierMaterial || !sourceAdapterEngineDeployment) {
    throw new Error(
      "BSC source proof requires both sourceVerifierMaterial and sourceAdapterEngineDeployment.",
    );
  }
  return { sourceVerifierMaterial, sourceAdapterEngineDeployment };
};

const readBscSourceProofNetworkLabel = (
  request: Record<string, unknown>,
): "testnet" | "mainnet" | null => {
  const normalizeNetworkLabel = (
    selected: string | undefined,
  ): "testnet" | "mainnet" | null => {
    if (!selected) return null;
    const normalized = selected.toLowerCase().replace(/_/gu, "-");
    if (
      normalized === "0x61" ||
      normalized === "97" ||
      normalized === "eip155:97" ||
      normalized === SCCP_BSC_TESTNET_NETWORK_ID_HEX
    ) {
      return "testnet";
    }
    if (
      normalized === "0x38" ||
      normalized === "56" ||
      normalized === "eip155:56" ||
      normalized === SCCP_BSC_MAINNET_NETWORK_ID_HEX
    ) {
      return "mainnet";
    }
    if (normalized.includes("testnet") || normalized.includes("chapel")) {
      return "testnet";
    }
    if (normalized.includes("mainnet") || normalized === "bsc") {
      return "mainnet";
    }
    return null;
  };
  const directLabel = normalizeNetworkLabel(
    readOptionalSccpTextField(request, [
      "bscNetwork",
      "bsc_network",
      "evmNetwork",
      "evm_network",
      "network",
      "networkKey",
      "network_key",
      "chainId",
      "chain_id",
      "chainIdHex",
      "chain_id_hex",
      "networkId",
      "network_id",
      "networkIdHex",
      "network_id_hex",
    ]),
  );
  if (directLabel) {
    return directLabel;
  }
  const sourceVerifierMaterial = readOptionalSccpRecordField(request, [
    "sourceVerifierMaterial",
    "source_verifier_material",
    "bscSourceVerifierMaterial",
    "bsc_source_verifier_material",
  ]);
  const sourceAdapterEngineDeployment = readOptionalSccpRecordField(request, [
    "sourceAdapterEngineDeployment",
    "source_adapter_engine_deployment",
    "sourceAdapterDeployment",
    "source_adapter_deployment",
    "bscSourceAdapterEngineDeployment",
    "bsc_source_adapter_engine_deployment",
    "bscSourceAdapterDeployment",
    "bsc_source_adapter_deployment",
  ]);
  for (const material of [
    sourceVerifierMaterial,
    sourceAdapterEngineDeployment,
  ]) {
    if (!material) continue;
    const materialLabel = normalizeNetworkLabel(
      readOptionalSccpTextField(material, [
        "bscNetwork",
        "bsc_network",
        "evmNetwork",
        "evm_network",
        "network",
        "networkKey",
        "network_key",
        "chainId",
        "chain_id",
        "chainIdHex",
        "chain_id_hex",
        "networkId",
        "network_id",
        "networkIdHex",
        "network_id_hex",
      ]),
    );
    if (materialLabel) {
      return materialLabel;
    }
  }
  const active = activeSccpBscNetworkKey();
  if (active) {
    return active;
  }
  return null;
};

const readBscSourceValidatorSigningConfig = (
  request: Record<string, unknown>,
): {
  sourceValidatorPrivateKeys: string;
  sourceValidatorPowers?: string[];
} => {
  const networkLabel = readBscSourceProofNetworkLabel(request);
  const privateKeyEnvNames = [
    ...(networkLabel === "testnet"
      ? ["SCCP_BSC_TESTNET_SOURCE_VALIDATOR_PRIVATE_KEYS"]
      : []),
    ...(networkLabel === "mainnet"
      ? ["SCCP_BSC_MAINNET_SOURCE_VALIDATOR_PRIVATE_KEYS"]
      : []),
    "SCCP_BSC_SOURCE_VALIDATOR_PRIVATE_KEYS",
  ];
  const sourceValidatorPrivateKeys = privateKeyEnvNames
    .map((name) => process.env[name]?.trim())
    .find((value): value is string => Boolean(value));
  if (!sourceValidatorPrivateKeys) {
    throw new Error(
      `Deployment-bound BSC source proof requires runtime validator keys in ${privateKeyEnvNames.join(
        " or ",
      )}.`,
    );
  }
  const powerEnvNames = [
    ...(networkLabel === "testnet"
      ? ["SCCP_BSC_TESTNET_SOURCE_VALIDATOR_POWERS"]
      : []),
    ...(networkLabel === "mainnet"
      ? ["SCCP_BSC_MAINNET_SOURCE_VALIDATOR_POWERS"]
      : []),
    "SCCP_BSC_SOURCE_VALIDATOR_POWERS",
  ];
  const sourceValidatorPowers = powerEnvNames
    .map((name) => process.env[name]?.trim())
    .find((value): value is string => Boolean(value))
    ?.split(/[\s,]+/u)
    .filter(Boolean);
  return {
    sourceValidatorPrivateKeys,
    ...(sourceValidatorPowers && sourceValidatorPowers.length > 0
      ? { sourceValidatorPowers }
      : {}),
  };
};

const replaceBscSourceMessageBundle = (
  proofPackage: Record<string, unknown>,
  messageBundle: Record<string, unknown>,
): Record<string, unknown> => {
  const patchedPackage: Record<string, unknown> = {
    ...proofPackage,
    messageBundle,
  };
  if (Object.prototype.hasOwnProperty.call(proofPackage, "message_bundle")) {
    patchedPackage.message_bundle = messageBundle;
  }
  return patchedPackage;
};

const isByteArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(
    (item) => Number.isInteger(item) && item >= 0 && item <= 255,
  );

const byteArrayToLowerHex = (bytes: readonly number[]): string =>
  `0x${Buffer.from(bytes).toString("hex")}`;

const readNumericByteObject = (
  value: Record<string, unknown>,
): number[] | null => {
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    !keys.every((key) => /^(?:0|[1-9]\d*)$/u.test(key))
  ) {
    return null;
  }
  const indexed = keys
    .map((key) => Number(key))
    .sort((left, right) => left - right);
  if (indexed.some((index, offset) => index !== offset)) {
    return null;
  }
  const bytes = indexed.map((index) => value[String(index)]);
  return isByteArray(bytes) ? bytes : null;
};

const canonicalizeSccpNativeJsonValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value)) {
    return `0x${value.toString("hex")}`;
  }
  if (value instanceof ArrayBuffer) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }
  if (ArrayBuffer.isView(value)) {
    return `0x${Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).toString("hex")}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeSccpNativeJsonValue(item));
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  if (value.type === "Buffer" && isByteArray(value.data)) {
    return byteArrayToLowerHex(value.data);
  }
  const numericBytes = readNumericByteObject(value);
  if (numericBytes) {
    return byteArrayToLowerHex(numericBytes);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      canonicalizeSccpNativeJsonValue(entryValue),
    ]),
  );
};

const canonicalizeSccpNativeJsonRecord = (
  value: Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  const canonical = canonicalizeSccpNativeJsonValue(value);
  if (!isPlainRecord(canonical)) {
    throw new Error(`${label} must be an object.`);
  }
  return canonical;
};

const readSccpNativeField = (
  record: Record<string, unknown>,
  aliases: readonly string[],
  label: string,
): unknown => {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) {
      return record[alias];
    }
  }
  throw new Error(`${label} is required.`);
};

const readSccpNativeRecord = (
  record: Record<string, unknown>,
  aliases: readonly string[],
  label: string,
): Record<string, unknown> => {
  const value = readSccpNativeField(record, aliases, label);
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const readSccpNativePayloadVariant = (
  value: unknown,
): { kind: string; value: Record<string, unknown> } => {
  if (!isPlainRecord(value)) {
    throw new Error("BSC SCCP source proof package payload must be an object.");
  }
  if (isPlainRecord(value.Transfer)) {
    return { kind: "Transfer", value: value.Transfer };
  }
  if (value.kind === "Transfer" && isPlainRecord(value.value)) {
    return { kind: "Transfer", value: value.value };
  }
  throw new Error("BSC SCCP source proof package payload must be a Transfer.");
};

const buildSccpNativeMerkleProofPayload = (
  value: unknown,
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error(
      "BSC SCCP source proof package merkle_proof must be an object.",
    );
  }
  const steps = Array.isArray(value.steps) ? value.steps : [];
  return {
    steps: steps.map((step, index) => {
      if (!isPlainRecord(step)) {
        throw new Error(
          `BSC SCCP source proof package merkle_proof.steps[${index}] must be an object.`,
        );
      }
      return {
        sibling_hash: readSccpNativeField(
          step,
          ["sibling_hash", "siblingHash"],
          `BSC SCCP source proof package merkle_proof.steps[${index}].sibling_hash`,
        ),
        sibling_is_left: readSccpNativeField(
          step,
          ["sibling_is_left", "siblingIsLeft"],
          `BSC SCCP source proof package merkle_proof.steps[${index}].sibling_is_left`,
        ),
      };
    }),
  };
};

const buildSccpNativeTransferPayload = (
  value: Record<string, unknown>,
): Record<string, unknown> => ({
  version: readSccpNativeField(value, ["version"], "payload.version"),
  source_domain: readSccpNativeField(
    value,
    ["source_domain", "sourceDomain"],
    "payload.source_domain",
  ),
  dest_domain: readSccpNativeField(
    value,
    ["dest_domain", "destDomain"],
    "payload.dest_domain",
  ),
  nonce: readSccpNativeField(value, ["nonce"], "payload.nonce"),
  asset_home_domain: readSccpNativeField(
    value,
    ["asset_home_domain", "assetHomeDomain"],
    "payload.asset_home_domain",
  ),
  asset_id_codec: readSccpNativeField(
    value,
    ["asset_id_codec", "assetIdCodec"],
    "payload.asset_id_codec",
  ),
  asset_id: `0x${Buffer.from(
    String(
      readSccpNativeField(
        value,
        ["asset_id", "assetId"],
        "payload.asset_id",
      ),
    ),
    "utf8",
  ).toString("hex")}`,
  amount: readSccpNativeField(value, ["amount"], "payload.amount"),
  sender_codec: readSccpNativeField(
    value,
    ["sender_codec", "senderCodec"],
    "payload.sender_codec",
  ),
  sender: `0x${Buffer.from(
    String(readSccpNativeField(value, ["sender"], "payload.sender")),
    "utf8",
  ).toString("hex")}`,
  recipient_codec: readSccpNativeField(
    value,
    ["recipient_codec", "recipientCodec"],
    "payload.recipient_codec",
  ),
  recipient: `0x${Buffer.from(
    String(readSccpNativeField(value, ["recipient"], "payload.recipient")),
    "utf8",
  ).toString("hex")}`,
  route_id_codec: readSccpNativeField(
    value,
    ["route_id_codec", "routeIdCodec"],
    "payload.route_id_codec",
  ),
  route_id: `0x${Buffer.from(
    String(
      readSccpNativeField(value, ["route_id", "routeId"], "payload.route_id"),
    ),
    "utf8",
  ).toString("hex")}`,
});

const buildSccpNativeMessageBundlePayload = (
  messageBundle: Record<string, unknown>,
): Record<string, unknown> => {
  const canonicalBundle = canonicalizeSccpNativeJsonRecord(
    messageBundle,
    "BSC SCCP source proof package messageBundle",
  );
  const commitment = readSccpNativeRecord(
    canonicalBundle,
    ["commitment"],
    "BSC SCCP source proof package messageBundle.commitment",
  );
  const payload = readSccpNativePayloadVariant(
    readSccpNativeField(
      canonicalBundle,
      ["payload"],
      "BSC SCCP source proof package messageBundle.payload",
    ),
  );
  return {
    version: readSccpNativeField(
      canonicalBundle,
      ["version"],
      "BSC SCCP source proof package messageBundle.version",
    ),
    commitment_root: readSccpNativeField(
      canonicalBundle,
      ["commitment_root", "commitmentRoot"],
      "BSC SCCP source proof package messageBundle.commitment_root",
    ),
    commitment: {
      version: readSccpNativeField(
        commitment,
        ["version"],
        "BSC SCCP source proof package messageBundle.commitment.version",
      ),
      kind: readSccpNativeField(
        commitment,
        ["kind"],
        "BSC SCCP source proof package messageBundle.commitment.kind",
      ),
      target_domain: readSccpNativeField(
        commitment,
        ["target_domain", "targetDomain"],
        "BSC SCCP source proof package messageBundle.commitment.target_domain",
      ),
      message_id: readSccpNativeField(
        commitment,
        ["message_id", "messageId"],
        "BSC SCCP source proof package messageBundle.commitment.message_id",
      ),
      payload_hash: readSccpNativeField(
        commitment,
        ["payload_hash", "payloadHash"],
        "BSC SCCP source proof package messageBundle.commitment.payload_hash",
      ),
    },
    merkle_proof: buildSccpNativeMerkleProofPayload(
      readSccpNativeField(
        canonicalBundle,
        ["merkle_proof", "merkleProof"],
        "BSC SCCP source proof package messageBundle.merkle_proof",
      ),
    ),
    payload: {
      [payload.kind]: buildSccpNativeTransferPayload(payload.value),
    },
    finality_proof: readSccpNativeField(
      canonicalBundle,
      ["finality_proof", "finalityProof"],
      "BSC SCCP source proof package messageBundle.finality_proof",
    ),
  };
};

const rebuildBscSourceMessageBundleWithNativeDeployment = (
  proofPackage: Record<string, unknown>,
  laneMaterial: {
    sourceVerifierMaterial: Record<string, unknown>;
    sourceAdapterEngineDeployment: Record<string, unknown>;
  },
): Record<string, unknown> => {
  const messageBundle = readRequiredSccpRecordField(
    proofPackage,
    ["messageBundle", "message_bundle"],
    "BSC SCCP source proof package messageBundle",
  );
  const nativeBinding = installGlobalIrohaJsNativeBinding(
    import.meta.url,
  ) as IrohaNativeSccpCodec;
  const rebuild =
    nativeBinding.sccpRebuildMessageBundleSourceProofWithDeployment;
  if (typeof rebuild !== "function") {
    throw new Error(
      "Native iroha_js_host binding is missing deployment-bound BSC SCCP source proof support; rebuild @iroha/iroha-js native bindings.",
    );
  }
  const nativeMessageBundle = buildSccpNativeMessageBundlePayload(messageBundle);
  const nativeSourceVerifierMaterial = canonicalizeSccpNativeJsonRecord(
    laneMaterial.sourceVerifierMaterial,
    "BSC SCCP source verifier material",
  );
  const nativeSourceAdapterEngineDeployment = canonicalizeSccpNativeJsonRecord(
    laneMaterial.sourceAdapterEngineDeployment,
    "BSC SCCP source adapter deployment",
  );
  const outputText = rebuild(
    JSON.stringify(nativeMessageBundle),
    JSON.stringify(nativeSourceVerifierMaterial),
    JSON.stringify(nativeSourceAdapterEngineDeployment),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(
      `Native BSC SCCP source proof rebuild returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isPlainRecord(parsed)) {
    throw new Error("Native BSC SCCP source proof rebuild must return an object.");
  }
  const rebuiltMessageBundle = readRequiredSccpRecordField(
    parsed,
    ["messageBundle", "message_bundle"],
    "Native BSC SCCP source proof rebuild messageBundle",
  );
  const sourceProofHash = readOptionalSccpTextField(parsed, [
    "sourceProofHash",
    "source_proof_hash",
  ]);
  const sourceAdapterDeploymentHash = readOptionalSccpTextField(parsed, [
    "sourceAdapterDeploymentHash",
    "source_adapter_deployment_hash",
  ]);
  const sourceAdapterDeploymentReceiptHash = readOptionalSccpTextField(parsed, [
    "sourceAdapterDeploymentReceiptHash",
    "source_adapter_deployment_receipt_hash",
  ]);
  const sourceVerifierEvidenceHash = readOptionalSccpTextField(parsed, [
    "sourceVerifierEvidenceHash",
    "source_verifier_evidence_hash",
  ]);
  return {
    ...replaceBscSourceMessageBundle(proofPackage, rebuiltMessageBundle),
    ...(sourceProofHash ? { sourceProofHash } : {}),
    ...(sourceAdapterDeploymentHash ? { sourceAdapterDeploymentHash } : {}),
    ...(sourceAdapterDeploymentReceiptHash
      ? { sourceAdapterDeploymentReceiptHash }
      : {}),
    ...(sourceVerifierEvidenceHash ? { sourceVerifierEvidenceHash } : {}),
  };
};

const readBscSourceBridgeAddressForSourceProof = (
  request: Record<string, unknown>,
): string => {
  const manifest = readOptionalSccpRecordField(request, ["manifest"]);
  const address =
    readOptionalSccpTextField(request, [
      "sourceBridgeEmitterAddress",
      "source_bridge_emitter_address",
      "sourceBridgeAddress",
      "source_bridge_address",
      "bscSourceBridgeAddress",
      "bsc_source_bridge_address",
    ]) ??
    (manifest
      ? readOptionalSccpTextField(manifest, [
          "sccpBscSourceBridgeAddress",
          "sccp_bsc_source_bridge_address",
          "bscSourceBridgeAddress",
          "bsc_source_bridge_address",
          "evmSourceBridgeAddress",
          "evm_source_bridge_address",
          "sourceBridgeAddress",
          "source_bridge_address",
        ])
      : undefined);
  if (!address) {
    throw new Error(
      "BSC source proof requires the manifest source bridge address.",
    );
  }
  return normalizeEvmAddressHex(address, "BSC source bridge address");
};

const readBscRpcUrlForSourceProof = (
  request: Record<string, unknown>,
): string => {
  const endpoint = readOptionalSccpTextField(request, [
    "bscRpcUrl",
    "bsc_rpc_url",
    "evmRpcUrl",
    "evm_rpc_url",
    "rpcUrl",
    "rpc_url",
  ]);
  if (!endpoint) {
    throw new Error(
      "BSC source proof requires a BSC RPC URL to read source bridge code.",
    );
  }
  return endpoint;
};

const readBscSourceBridgeCodeHashForSourceProof = async (
  request: Record<string, unknown>,
  sourceBridgeAddress: string,
): Promise<string> => {
  const supplied = readOptionalSccpTextField(request, [
    "sourceBridgeEmitterCodeHash",
    "source_bridge_emitter_code_hash",
    "sourceBridgeCodeHash",
    "source_bridge_code_hash",
  ]);
  if (supplied) {
    return normalizeEvmNonZeroHash(supplied, "BSC source bridge code hash");
  }
  const code = await getEvmCodeFromRpc({
    endpoint: readBscRpcUrlForSourceProof(request),
    address: sourceBridgeAddress,
    blockTag: "latest",
  });
  if (code === "0x") {
    throw new Error("BSC source bridge contract code is empty.");
  }
  return `0x${Buffer.from(
    keccak_256(Buffer.from(code.slice(2), "hex")),
  ).toString("hex")}`;
};

const buildBinaryBscSourceProofPackage = async (
  proofPackage: Record<string, unknown>,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const messageBundle = readRequiredSccpRecordField(
    proofPackage,
    ["messageBundle", "message_bundle"],
    "BSC SCCP source proof package messageBundle",
  );
  const commitment = readRequiredSccpRecordField(
    messageBundle,
    ["commitment"],
    "BSC SCCP source proof package commitment",
  );
  const receipt = readOptionalSccpRecordField(request, ["receipt"]);
  const receiptRootIndex = readBscSourceReceiptRootIndex(request, receipt);
  const sourceBridgeEmitterAddress =
    readBscSourceBridgeAddressForSourceProof(request);
  const sourceBridgeEmitterCodeHash =
    await readBscSourceBridgeCodeHashForSourceProof(
      request,
      sourceBridgeEmitterAddress,
    );
  const finalityHeight = readOptionalSccpTextField(request, [
    "finalityHeight",
    "finality_height",
  ]);
  const finalityBlockHash = readOptionalSccpTextField(request, [
    "finalityBlockHash",
    "finality_block_hash",
  ]);
  const laneMaterial = readBscSourceLaneMaterialForNativeProof(request);
  const sourceValidatorSigningConfig = laneMaterial
    ? readBscSourceValidatorSigningConfig(request)
    : null;
  const blockReceipts = readSccpOwnField(request, [
    "blockReceipts",
    "block_receipts",
    "receiptBlockReceipts",
    "receipt_block_receipts",
  ]);
  const sourceProofInput = {
    messageId: readRequiredSccpTextField(
      commitment,
      ["message_id", "messageId"],
      "BSC SCCP source proof package message id",
    ),
    payloadHash: readRequiredSccpTextField(
      commitment,
      ["payload_hash", "payloadHash"],
      "BSC SCCP source proof package payload hash",
    ),
    commitmentRoot: readRequiredSccpTextField(
      messageBundle,
      ["commitment_root", "commitmentRoot"],
      "BSC SCCP source proof package commitment root",
    ),
    sourceEventDigest: readRequiredSccpTextField(
      proofPackage,
      ["sourceEventDigest", "source_event_digest"],
      "BSC SCCP source proof package source event digest",
    ),
    sourceBridgeEmitterAddress,
    sourceBridgeEmitterCodeHash,
    ...(finalityHeight ? { finalityHeight } : {}),
    ...(finalityBlockHash ? { finalityBlockHash } : {}),
    ...(receipt ? { receipt } : {}),
    ...(readOptionalSccpRecordField(request, ["block"])
      ? { block: readOptionalSccpRecordField(request, ["block"]) }
      : {}),
    ...(Array.isArray(blockReceipts) ? { blockReceipts } : {}),
    ...(receiptRootIndex
      ? {
          receiptRootIndex,
        }
      : {}),
    ...(laneMaterial
      ? {
          sourceVerifierMaterial: laneMaterial.sourceVerifierMaterial,
          sourceAdapterEngineDeployment:
            laneMaterial.sourceAdapterEngineDeployment,
        }
      : {}),
    ...(sourceValidatorSigningConfig ?? {}),
  };
  const sourceProof = laneMaterial
    ? buildBscSourceChainProofEnvelope(sourceProofInput)
    : buildBscPlaceholderSourceChainProofEnvelope(sourceProofInput);
  const patchedProofPackage = withBscSourcePublicInputFinality(
    replaceBscSourceMessageBundleFinalityProof(
      proofPackage,
      sourceProof.sourceProofHex,
    ),
    sourceProof,
  );
  return patchedProofPackage;
};

const SCCP_BSC_SOURCE_DOMAIN_ID = 2;
const SCCP_SORA_TARGET_DOMAIN_ID = 0;
const SCCP_TAIRA_BSC_XOR_ROUTE_ID = "taira_bsc_xor";

const bindBscSourceProofResultInNode = async (
  input: SccpBscSourceProofGenerateInput,
  proofPackage: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const request = snapshotSccpDataValue(
    input.input,
    "BSC SCCP source proof request",
  );
  if (!isPlainRecord(request)) {
    throw new Error("BSC SCCP source proof request must be an object.");
  }
  const patchedProofPackage = await buildBinaryBscSourceProofPackage(
    proofPackage,
    request,
  );
  const bridgeAddress = readOptionalSccpTextField(request, [
    "bridgeAddress",
    "bridge_address",
    "bscBridgeAddress",
    "bsc_bridge_address",
    "evmBridgeAddress",
    "evm_bridge_address",
  ]);
  const bindInput = {
    proofPackage: patchedProofPackage,
    txId: readRequiredSccpTextField(
      request,
      [
        "txId",
        "txID",
        "transactionHash",
        "transaction_hash",
        "transactionId",
        "transaction_id",
      ],
      "BSC SCCP source proof request txId",
    ),
    bscSender: readRequiredSccpTextField(
      request,
      ["bscSender", "bsc_sender", "evmSender", "evm_sender", "sender"],
      "BSC SCCP source proof request bscSender",
    ),
    tairaRecipient: readRequiredSccpTextField(
      request,
      [
        "tairaRecipient",
        "taira_recipient",
        "recipient",
        "tairaAccountId",
        "taira_account_id",
      ],
      "BSC SCCP source proof request tairaRecipient",
    ),
    amount: readRequiredSccpTextField(
      request,
      ["amountBaseUnits", "amount_base_units", "amount"],
      "BSC SCCP source proof request amountBaseUnits",
    ),
    ...(bridgeAddress ? { bridgeAddress } : {}),
  };
  const laneMaterial = readBscSourceLaneMaterialForNativeProof(request);
  const proofPackageForBinding = laneMaterial
    ? rebuildBscSourceMessageBundleWithNativeDeployment(
        {
          ...patchedProofPackage,
          messageBundle: bindTairaXorBscToTairaSourceProofPackage(bindInput)
            .messageBundle,
        },
        laneMaterial,
      )
    : patchedProofPackage;
  const bound = bindTairaXorBscToTairaSourceProofPackage({
    ...bindInput,
    proofPackage: proofPackageForBinding,
  });
  const boundMessageBundle = bound.messageBundle as Record<string, unknown>;
  const boundCommitment = readRequiredSccpRecordField(
    boundMessageBundle,
    ["commitment"],
    "BSC SCCP source proof package bound commitment",
  );
  const boundPayloadHash = readRequiredSccpTextField(
    boundCommitment,
    ["payload_hash", "payloadHash"],
    "BSC SCCP source proof package bound payload hash",
  );
  const materialValue = (
    packageKeys: readonly string[],
    requestKeys: readonly string[],
  ): string => {
    return (
      readOptionalSccpTextField(patchedProofPackage, packageKeys) ??
      readOptionalSccpTextField(request, requestKeys) ??
      ""
    );
  };
  return {
    messageBundle: boundMessageBundle,
    settlement: bound.settlement,
    publicInputs: {
      sourceDomain: SCCP_BSC_SOURCE_DOMAIN_ID,
      targetDomain: SCCP_SORA_TARGET_DOMAIN_ID,
      messageId: bound.messageId,
      payloadHash: boundPayloadHash,
      commitmentRoot: bound.commitmentRoot,
      txId: bound.txId,
      sourceEventDigest: bound.sourceEventDigest,
      amountBaseUnits: bound.amount,
      sender: bindInput.bscSender,
      recipient: bindInput.tairaRecipient,
      routeId: SCCP_TAIRA_BSC_XOR_ROUTE_ID,
    },
    sourceEventDigest: bound.sourceEventDigest,
    txId: bound.txId,
    messageId: bound.messageId,
    amountBaseUnits: bound.amount,
    proofArtifactHash: materialValue(
      ["proofArtifactHash", "proof_artifact_hash"],
      ["proofArtifactHash", "proof_artifact_hash"],
    ),
    provingKeyHash: materialValue(
      ["provingKeyHash", "proving_key_hash"],
      ["provingKeyHash", "proving_key_hash"],
    ),
    nativeEvmProverBundleHash: materialValue(
      ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
      ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
    ),
  };
};

const readOptionalSccpHex32 = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): string | undefined => {
  const raw = readSccpOwnField(value, keys);
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw new Error(`${label} must be a canonical 32-byte hex string.`);
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized !== raw.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(normalized) ||
    /^0x0{64}$/u.test(normalized)
  ) {
    throw new Error(`${label} must be a non-zero 32-byte hex string.`);
  }
  return normalized;
};

const bindOptionalBscNativeEvmProverBundleHash = <
  T extends Record<string, unknown>,
>(
  request: T,
  witness: Record<string, unknown>,
): T & { nativeEvmProverBundleHash?: string } => {
  const nativeEvmProverBundleHash = readOptionalSccpHex32(
    witness,
    SCCP_BSC_NATIVE_EVM_PROVER_BUNDLE_HASH_KEYS,
    "BSC SCCP proof witness nativeEvmProverBundleHash",
  );
  return nativeEvmProverBundleHash
    ? { ...request, nativeEvmProverBundleHash }
    : request;
};

const readBscNodeProverNetwork = (
  witness: Record<string, unknown>,
): "mainnet" | "testnet" => {
  const binding = readSccpOwnField(witness, [
    "destinationBinding",
    "destination_binding",
  ]);
  if (!isPlainRecord(binding)) {
    return "testnet";
  }
  const rawNetworkId = readSccpOwnField(binding, [
    "networkId",
    "network_id",
    "networkIdHex",
    "network_id_hex",
  ]);
  if (rawNetworkId === undefined || rawNetworkId === null || rawNetworkId === "") {
    return "testnet";
  }
  if (typeof rawNetworkId !== "string") {
    throw new Error("BSC SCCP destination binding networkId must be hex.");
  }
  const networkId = rawNetworkId.trim().toLowerCase();
  if (networkId === SCCP_BSC_MAINNET_NETWORK_ID_HEX) {
    return "mainnet";
  }
  if (networkId === SCCP_BSC_TESTNET_NETWORK_ID_HEX) {
    return "testnet";
  }
  throw new Error("BSC SCCP destination binding networkId is unsupported.");
};

const buildBscNodeProverRequest = (
  requestOrWitness: Record<string, unknown>,
): Record<string, unknown> => {
  const existingRequestHash = readSccpOwnField(requestOrWitness, [
    "requestHash",
    "request_hash",
  ]);
  if (existingRequestHash !== undefined && existingRequestHash !== null) {
    return bindOptionalBscNativeEvmProverBundleHash(
      requestOrWitness,
      requestOrWitness,
    );
  }
  const network = readBscNodeProverNetwork(requestOrWitness);
  const request =
    network === "mainnet"
      ? buildBscMainnetSccpDestinationProofRequest(
          requestOrWitness as EvmSccpProofRequestInput,
        )
      : buildBscTestnetSccpDestinationProofRequest(
          requestOrWitness as EvmSccpProofRequestInput,
        );
  return bindOptionalBscNativeEvmProverBundleHash(
    request as unknown as Record<string, unknown>,
    requestOrWitness,
  );
};

const bscEvmGroth16EnvelopeHash = (
  requestHash: string,
  proofBytesHex: string,
): string => {
  if (!/^0x[0-9a-fA-F]{64}$/u.test(requestHash)) {
    throw new Error("BSC SCCP proof result requestHash must be 32-byte hex.");
  }
  if (!/^0x[0-9a-fA-F]+$/u.test(proofBytesHex)) {
    throw new Error("BSC SCCP proof result proofBytes must be hex.");
  }
  const prefix = Buffer.from("sccp:evm:groth16-proof-envelope:v1", "utf8");
  const digest = blake2b(
    Buffer.concat([
      prefix,
      Buffer.from(requestHash.slice(2), "hex"),
      Buffer.from(proofBytesHex.slice(2), "hex"),
    ]),
    { dkLen: 32 },
  );
  return `0x${Buffer.from(digest).toString("hex")}`;
};

const proveBscSccpProofInNode = async (
  input: SccpBscProofGenerateInput,
  direction: "destination" | "source" = "destination",
): Promise<Record<string, unknown>> => {
  const requestOrWitness = snapshotSccpDataValue(
    input.request,
    "BSC SCCP proof request",
  );
  if (!isPlainRecord(requestOrWitness)) {
    throw new Error("BSC SCCP proof request must be an object.");
  }
  assertNoSecretLikePayloadFields(requestOrWitness, "BSC SCCP proof request");
  const request =
    direction === "source"
      ? withBscSourceReceiptRootIndex(requestOrWitness)
      : buildBscNodeProverRequest(requestOrWitness);
  const moduleSpecifier = resolveSccpBscProverModuleSpecifier(
    input.proverModuleUrl,
  );
  const configUrl = resolveSccpBscRuntimeProverConfigUrl(input.proverConfigUrl);
  const timeoutMs = normalizeOptionalTimeoutMs(
    input.timeoutMs,
    SCCP_BSC_NODE_PROVER_TIMEOUT_MS,
  );
  const childInput = JSON.stringify({
    direction,
    request,
    moduleSpecifier,
    configUrl,
  });
  const heapMb = resolveSccpProverHeapMb();
  const child = spawn(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, "-e", SCCP_BSC_NODE_PROVER_CHILD_SOURCE],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        SCCP_BSC_PROVER_V8_HEAP_MB: String(heapMb),
        VITE_SCCP_BSC_PROVER_V8_HEAP_MB: String(heapMb),
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputError: Error | null = null;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => {
    try {
      collectLimitedChildOutput(stdout, chunk, "BSC SCCP prover stdout");
    } catch (error) {
      outputError = error instanceof Error ? error : new Error(String(error));
      child.kill("SIGTERM");
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    try {
      collectLimitedChildOutput(stderr, chunk, "BSC SCCP prover stderr");
    } catch (error) {
      outputError = error instanceof Error ? error : new Error(String(error));
      child.kill("SIGTERM");
    }
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    },
  );
  child.stdin.end(childInput);
  const { code, signal } = await exit.finally(() => clearTimeout(timeout));
  if (outputError) {
    throw outputError;
  }
  const output = Buffer.concat(stdout).toString("utf8").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (_error) {
    const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 2000);
    throw new Error(
      `BSC SCCP prover child returned unreadable output.${
        detail ? ` stderr: ${detail}` : ""
      }`,
    );
  }
  if (!isPlainRecord(parsed)) {
    throw new Error("BSC SCCP prover child returned an invalid response.");
  }
  if (parsed.ok !== true) {
    const childError = trimString(parsed.error) || `exit ${code ?? signal}`;
    throw new Error(`BSC SCCP prover child failed: ${childError}`);
  }
  if (code !== 0) {
    throw new Error(`BSC SCCP prover child exited with ${code ?? signal}.`);
  }
  const result = snapshotSccpDataValue(
    parsed.result,
    "BSC SCCP proof result",
  );
  if (!isPlainRecord(result)) {
    throw new Error("BSC SCCP prover child result must be an object.");
  }
  assertNoSecretLikePayloadFields(result, "BSC SCCP proof result");
  if (direction === "source") {
    return result;
  }
  const proofBytesHex = trimString(result.proofBytes ?? result.proof_bytes);
  if (!/^0x[0-9a-fA-F]+$/u.test(proofBytesHex)) {
    throw new Error("BSC SCCP prover child result proofBytes must be hex.");
  }
  const proofBase64 = Buffer.from(proofBytesHex.slice(2), "hex").toString(
    "base64",
  );
  const proofResult: Record<string, unknown> = {
    proofBytes: proofBytesHex,
    proofBase64,
    backend: trimString(result.backend) || request.backend,
    requestHash: trimString(result.requestHash) || trimString(request.requestHash),
    envelopeHash: bscEvmGroth16EnvelopeHash(
      trimString(result.requestHash) || trimString(request.requestHash),
      proofBytesHex,
    ),
    proofArtifactHash: request.proofArtifactHash,
    provingKeyHash: request.provingKeyHash,
    nativeEvmProverBundleHash: request.nativeEvmProverBundleHash,
    destinationBinding: request.destinationBinding,
    destinationBindingHash: request.destinationBindingHash,
    publicInputs: request.publicInputs,
    publicSignalWords: request.publicSignalWords,
    bundleBytes: request.bundleBytes,
    sourceProofBytes: request.sourceProofBytes,
    proofContext: request.proofContext,
    statementHash: request.statementHash,
    sourceDomain: request.sourceDomain,
  };
  for (const [key, value] of Object.entries(proofResult)) {
    if (value === undefined || value === null) {
      delete proofResult[key];
    }
  }
  delete proofResult.envelopeHash;
  delete proofResult.envelope_hash;
  return proofResult;
};

const proveBscSccpSourceProofInNode = async (
  input: SccpBscSourceProofGenerateInput,
): Promise<Record<string, unknown>> => {
  const request = snapshotSccpDataValue(
    input.input,
    "BSC SCCP source proof request",
  );
  if (!isPlainRecord(request)) {
    throw new Error("BSC SCCP source proof request must be an object.");
  }
  const sourceRequest = withBscSourceReceiptRootIndex(request);
  const proofPackage = await proveBscSccpProofInNode(
    {
      request: sourceRequest,
      proverModuleUrl: input.proverModuleUrl,
      proverConfigUrl: input.proverConfigUrl,
      timeoutMs: input.timeoutMs,
    },
    "source",
  );
  return bindBscSourceProofResultInNode(
    { ...input, input: sourceRequest },
    proofPackage,
  );
};

const SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_CONTRACT_ALIAS =
  "taira_xor_inbound_settlement::universal";
const SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_SOURCE_NAME =
  "contracts/taira/sccp/TairaXorSccpInboundSettlement.ko";
const SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_CONTRACT_SOURCE = `
seiyaku TairaXorSccpInboundSettlement {
  kotoage fn finalize_inbound() permission(AssetManager) {
    require(true);
  }
}
`;

const normalizeSccpContractAlias = (
  value: unknown,
  fallback: string,
): string => {
  const alias = trimString(value) || fallback;
  if (!alias.includes("::")) {
    throw new Error(
      "TAIRA SCCP settlement contract alias must be fully qualified.",
    );
  }
  return alias;
};

const normalizeOptionalLeaseExpiryMs = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      "Contract alias leaseExpiryMs must be a non-negative integer.",
    );
  }
  return parsed;
};

const normalizeOptionalCompiledContractCodeB64 = (
  value: unknown,
): Uint8Array | null => {
  const encoded = trimString(value);
  if (!encoded) {
    return null;
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("compiledCodeB64 must be valid base64 contract bytecode.");
  }
  if (decoded.length === 0) {
    throw new Error("compiledCodeB64 must not be empty.");
  }
  return Uint8Array.from(decoded);
};

const deploySccpTairaInboundSettlementContractToTorii = async (
  input: SccpTairaInboundSettlementDeployInput,
): Promise<Record<string, unknown> | null> => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  if (trimString(input.privateKeyHex)) {
    throw new Error(
      "TAIRA SCCP settlement contract deployment must use the stored wallet secret; inline private keys are not accepted.",
    );
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    operationLabel: "Deploy TAIRA SCCP settlement contract",
  });
  const contractAlias = normalizeSccpContractAlias(
    input.contractAlias,
    SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_CONTRACT_ALIAS,
  );
  const externalArtifactBytes = normalizeOptionalCompiledContractCodeB64(
    input.compiledCodeB64,
  );
  let compiledCodeHashHex: string | undefined;
  let compiledAbiHashHex: string | undefined;
  const artifactBytes =
    externalArtifactBytes ??
    (() => {
      const compiled = compileKotodamaProgram(
        SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_CONTRACT_SOURCE,
        {
          sourceName: SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_SOURCE_NAME,
        },
      );
      if (compiled.diagnostics.length > 0) {
        throw new Error(
          compiled.diagnostics
            .map((entry) => `${entry.severity}: ${entry.message}`)
            .join("\n"),
        );
      }
      const entrypoint = compiled.manifest?.entrypoints.find(
        (candidate) => candidate.name === "finalize_inbound",
      );
      const params = entrypoint?.params.map((param) => [
        param.name,
        param.type_name,
      ]);
      if (
        !entrypoint ||
        entrypoint.permission !== "AssetManager" ||
        JSON.stringify(params) !== JSON.stringify([])
      ) {
        throw new Error(
          "Compiled TAIRA SCCP settlement contract ABI is invalid.",
        );
      }
      compiledCodeHashHex = compiled.codeHashHex;
      compiledAbiHashHex = compiled.abiHashHex;
      return Uint8Array.from(compiled.artifactBytes);
    })();
  if (artifactBytes.length === 0) {
    throw new Error("Compiled TAIRA SCCP settlement contract is empty.");
  }
  const baseUrl = normalizeBaseUrl(input.toriiUrl);
  const client = new ToriiClient(baseUrl, {
    fetchImpl: nodeFetch,
    allowInsecure: baseUrl.startsWith("http://"),
  });
  const response = await client.deployContract({
    authority: accountId,
    privateKey: formatExposedPrivateKey(signingMaterial),
    contractAlias,
    codeB64: Buffer.from(artifactBytes).toString("base64"),
    leaseExpiryMs: normalizeOptionalLeaseExpiryMs(input.leaseExpiryMs),
  });
  return {
    ...(response ?? {}),
    contract_alias: response?.contract_alias ?? contractAlias,
    code_hash_hex: response?.code_hash_hex ?? compiledCodeHashHex,
    abi_hash_hex: response?.abi_hash_hex ?? compiledAbiHashHex,
    source_name: SCCP_TAIRA_XOR_INBOUND_SETTLEMENT_SOURCE_NAME,
  };
};

type ZkIvmRequestInput = {
  toriiUrl: string;
  vkRef?: unknown;
  vk_ref?: unknown;
  authority?: unknown;
  metadata?: unknown;
  bytecode?: unknown;
  proved?: unknown;
};

type ZkIvmProveJobInput = {
  toriiUrl: string;
  jobId?: unknown;
  job_id?: unknown;
};
type ZkIvmProvedTransactionSubmitInput = ToriiConfig & {
  chainId: string;
  accountId: string;
  privateKeyHex?: unknown;
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
};

const normalizeZkIvmVkRef = (
  input: unknown,
): { backend: string; name: string } => {
  if (!isPlainRecord(input)) {
    throw new Error("ZK IVM verifying key reference must be an object.");
  }
  const backend = trimString(input.backend);
  const name = trimString(input.name);
  if (!backend || !name) {
    throw new Error(
      "ZK IVM verifying key reference requires backend and name.",
    );
  }
  return { backend, name };
};

const buildZkIvmRequestPayload = (
  input: ZkIvmRequestInput,
): Record<string, unknown> => {
  const metadata =
    input.metadata === undefined
      ? {}
      : isPlainRecord(input.metadata)
        ? input.metadata
        : null;
  if (metadata === null) {
    throw new Error("ZK IVM metadata must be an object when provided.");
  }
  if (input.bytecode === undefined || input.bytecode === null) {
    throw new Error("ZK IVM bytecode is required.");
  }
  if (typeof input.bytecode === "string" && !input.bytecode.trim()) {
    throw new Error("ZK IVM bytecode must not be empty.");
  }
  if (input.proved !== undefined && !isPlainRecord(input.proved)) {
    throw new Error("ZK IVM proved payload must be an object when provided.");
  }
  return {
    vk_ref: normalizeZkIvmVkRef(input.vkRef ?? input.vk_ref),
    authority: normalizeCanonicalAccountIdLiteral(
      trimString(input.authority),
      "authority",
    ),
    metadata,
    bytecode: input.bytecode,
    ...(input.proved !== undefined ? { proved: input.proved } : {}),
  };
};

const normalizeZkIvmJobId = (input: ZkIvmProveJobInput): string => {
  const jobId = trimString(input.jobId ?? input.job_id).toLowerCase();
  if (!/^[0-9a-f]{32}$/u.test(jobId)) {
    throw new Error("ZK IVM prove job id must be a 16-byte hex string.");
  }
  return jobId;
};

const deriveZkIvmPayloadOnTorii = (
  input: ZkIvmRequestInput,
): Promise<Record<string, unknown>> =>
  postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/zk/ivm/derive"),
    "ZK IVM derive",
    buildZkIvmRequestPayload(input),
  );

const startZkIvmProveJobOnTorii = (
  input: ZkIvmRequestInput,
): Promise<Record<string, unknown>> =>
  postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/zk/ivm/prove"),
    "ZK IVM prove",
    buildZkIvmRequestPayload(input),
  );

const getZkIvmProveJobFromTorii = (
  input: ZkIvmProveJobInput,
): Promise<Record<string, unknown>> =>
  fetchJson(
    buildNexusEndpoint(
      input.toriiUrl,
      `/v1/zk/ivm/prove/${normalizeZkIvmJobId(input)}`,
    ),
    "ZK IVM prove job",
  );

const cancelZkIvmProveJobOnTorii = async (
  input: ZkIvmProveJobInput,
): Promise<Record<string, unknown>> => {
  const response = await nodeFetch(
    buildNexusEndpoint(
      input.toriiUrl,
      `/v1/zk/ivm/prove/${normalizeZkIvmJobId(input)}`,
    ),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "ZK IVM prove job cancel");
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, "ZK IVM prove job cancel");
};

const submitZkIvmProvedTransactionToTorii = async (
  input: ZkIvmProvedTransactionSubmitInput,
): Promise<Record<string, unknown>> => {
  const chainId = trimString(input.chainId);
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  if (!isPlainRecord(input.proved)) {
    throw new Error("ZK IVM proved payload must be an object.");
  }
  if (!isPlainRecord(input.attachment)) {
    throw new Error("ZK IVM proof attachment must be an object.");
  }
  if (input.metadata !== undefined && !isPlainRecord(input.metadata)) {
    throw new Error(
      "ZK IVM transaction metadata must be an object when provided.",
    );
  }
  if (trimString(input.privateKeyHex)) {
    throw new Error(
      "ZK IVM proved transaction submissions must use stored wallet secrets; inline private keys are not accepted.",
    );
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    operationLabel: "Submit ZK IVM proved transaction",
  });
  const nativeBinding = installGlobalIrohaJsNativeBinding(import.meta.url);
  const creationTimeMs = input.creationTimeMs ?? Date.now();
  const tx = buildIvmProvedTransaction({
    chainId,
    authority: accountId,
    proved: input.proved,
    attachment: input.attachment,
    metadata: input.metadata,
    creationTimeMs,
    ttlMs: input.ttlMs ?? 10 * 60 * 1000,
    nonce: input.nonce,
    privateKey: hexToBuffer(signingMaterial.privateKeyHex, "privateKeyHex"),
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAndWaitForCommit(
    input.toriiUrl,
    tx.signedTransaction,
    { nativeBinding, requireNativeEncoding: true },
  );
  return transactionSubmissionResult(submission);
};

const parseIpv4Octets = (hostname: string): number[] | null => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) {
    return null;
  }
  const octets = hostname.split(".").map((part) => Number(part));
  return octets.every(
    (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
  )
    ? octets
    : null;
};

const isPrivateOrReservedIpv4Octets = (octets: number[]): boolean => {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateOrReservedIpv4 = (hostname: string): boolean => {
  const octets = parseIpv4Octets(hostname);
  if (!octets) {
    return false;
  }
  return isPrivateOrReservedIpv4Octets(octets);
};

const parseIpv6Hextets = (hostname: string): number[] | null => {
  if (!hostname.includes(":")) {
    return null;
  }
  const parts = hostname.split("::");
  if (parts.length > 2) {
    return null;
  }
  const parseSide = (side: string): number[] =>
    side
      ? side.split(":").map((part) => {
          if (!/^[0-9a-f]{1,4}$/iu.test(part)) {
            return Number.NaN;
          }
          return Number.parseInt(part, 16);
        })
      : [];
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] ?? "");
  if (
    [...left, ...right].some((hextet) => !Number.isInteger(hextet)) ||
    (parts.length === 1 && left.length !== 8) ||
    left.length + right.length > 8
  ) {
    return null;
  }
  const zeroFill =
    parts.length === 2 ? Array(8 - left.length - right.length).fill(0) : [];
  return [...left, ...zeroFill, ...right];
};

const hextetsToIpv4Octets = (high: number, low: number): number[] => [
  (high >> 8) & 0xff,
  high & 0xff,
  (low >> 8) & 0xff,
  low & 0xff,
];

const hasPrivateOrReservedEmbeddedIpv4 = (hextets: number[]): boolean => {
  if (hextets.length !== 8) {
    return false;
  }
  const lastIpv4 = hextetsToIpv4Octets(hextets[6], hextets[7]);
  const leadingCompatibleZeros = hextets
    .slice(0, 6)
    .every((part) => part === 0);
  const leadingMappedZeros =
    hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  const nat64WellKnownPrefix =
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((part) => part === 0);
  if (
    (leadingCompatibleZeros || leadingMappedZeros || nat64WellKnownPrefix) &&
    isPrivateOrReservedIpv4Octets(lastIpv4)
  ) {
    return true;
  }
  if (hextets[0] === 0x2002) {
    return isPrivateOrReservedIpv4Octets(
      hextetsToIpv4Octets(hextets[1], hextets[2]),
    );
  }
  return false;
};

const isPrivateTronGatewayHost = (hostname: string): boolean => {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "local" ||
    normalized === "::1" ||
    normalized === "::"
  ) {
    return true;
  }
  if (isPrivateOrReservedIpv4(normalized)) {
    return true;
  }
  const ipv4Mapped = normalized.match(
    /(?::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/iu,
  );
  if (ipv4Mapped?.[1] && isPrivateOrReservedIpv4(ipv4Mapped[1])) {
    return true;
  }
  if (!normalized.includes(":")) {
    return false;
  }
  const hextets = parseIpv6Hextets(normalized);
  if (!hextets) {
    return true;
  }
  if (
    hasPrivateOrReservedEmbeddedIpv4(hextets) ||
    (hextets[0] === 0x2001 && hextets[1] === 0)
  ) {
    return true;
  }
  const firstHextet = hextets[0];
  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:")
  );
};

const normalizeTronGatewayUrl = (endpoint?: string): string => {
  const normalized = normalizeBaseUrl(
    trimString(endpoint) || DEFAULT_TRON_GATEWAY_URL,
  );
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("TRON gateway endpoint must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("TRON gateway endpoint must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("TRON gateway endpoint must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("TRON gateway endpoint must not include query or hash.");
  }
  if (isPrivateTronGatewayHost(parsed.hostname)) {
    throw new Error("TRON gateway endpoint must not target a local network.");
  }
  return normalized;
};

const normalizeTronTxId = (txId: string): string => {
  const normalized = trimString(txId).replace(/^0x/iu, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("TRON transaction id must be a 32-byte hex string.");
  }
  return normalized;
};

const postTronJson = async (
  input: TronGatewayInput | undefined,
  path: string,
  body: Record<string, unknown>,
  label: string,
): Promise<Record<string, unknown>> =>
  postJson(`${normalizeTronGatewayUrl(input?.endpoint)}${path}`, label, body);

const decodeTronGatewayMessage = (value: unknown): string => {
  const text = trimString(value);
  const hex = text.replace(/^0x/iu, "");
  if (hex && hex.length % 2 === 0 && /^[0-9a-f]+$/iu.test(hex)) {
    try {
      return Buffer.from(hex, "hex").toString("utf8");
    } catch {
      return text;
    }
  }
  return text;
};

const assertTronGatewayAccepted = (
  payload: Record<string, unknown>,
  label: string,
): void => {
  const result = payload.result;
  const rejected =
    result === false ||
    (isPlainRecord(result) && result.result === false) ||
    Boolean(payload.Error);
  if (!rejected) {
    return;
  }
  const detail = [
    isPlainRecord(result) ? result.code : payload.code,
    isPlainRecord(result) ? result.message : payload.message,
    payload.Error,
  ]
    .map(decodeTronGatewayMessage)
    .filter(Boolean)
    .join(": ");
  throw new Error(
    detail
      ? `${label} was rejected by the TRON node: ${detail}`
      : `${label} was rejected by the TRON node.`,
  );
};

const getTronJson = async (
  input: TronGatewayInput | undefined,
  path: string,
  label: string,
): Promise<Record<string, unknown>> =>
  fetchJson(`${normalizeTronGatewayUrl(input?.endpoint)}${path}`, label);

const getTronTransactionFromGateway = (
  input: TronTransactionInput,
): Promise<Record<string, unknown>> =>
  postTronJson(
    input,
    "/wallet/gettransactionbyid",
    { value: normalizeTronTxId(input.txId) },
    "TRON transaction",
  );

const getTronTransactionReceiptFromGateway = (
  input: TronTransactionInput,
): Promise<Record<string, unknown>> =>
  postTronJson(
    input,
    "/wallet/gettransactioninfobyid",
    { value: normalizeTronTxId(input.txId) },
    "TRON transaction receipt",
  );

const getTronTransactionEventsFromGateway = (
  input: TronEventsInput,
): Promise<Record<string, unknown>> =>
  getTronJson(
    input,
    `/v1/transactions/${encodeURIComponent(normalizeTronTxId(input.txId))}/events`,
    "TRON transaction events",
  );

const getTronSolidBlockFromGateway = (
  input?: TronBlockInput,
): Promise<Record<string, unknown>> => {
  if (input?.blockNumber !== undefined && input.blockNumber !== "") {
    const parsed = Number(input.blockNumber);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("TRON block number must be a non-negative safe integer.");
    }
    return postTronJson(
      input,
      "/walletsolidity/getblockbynum",
      { num: parsed },
      "TRON solid block",
    );
  }
  return postTronJson(
    input,
    "/walletsolidity/getnowblock",
    {},
    "TRON solid block",
  );
};

const getTronWitnessesFromGateway = (
  input?: TronGatewayInput,
): Promise<Record<string, unknown>> =>
  postTronJson(input, "/wallet/listwitnesses", {}, "TRON witnesses");

const getTronFinalityDataFromGateway = async (
  input?: TronGatewayInput,
): Promise<Record<string, unknown>> => {
  const [solidBlock, witnesses, nodeInfo] = await Promise.all([
    getTronSolidBlockFromGateway(input),
    getTronWitnessesFromGateway(input),
    getTronJson(input, "/wallet/getnodeinfo", "TRON node info").catch(
      (error) => ({
        unavailable: true,
        message: error instanceof Error ? error.message : String(error),
      }),
    ),
  ]);
  return {
    solidBlock,
    witnesses,
    nodeInfo,
    collectedAtMs: Date.now(),
  };
};

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const decodeTronBase58CheckPayload = (value: string, label: string): Buffer => {
  let decodedValue = 0n;
  for (const char of value) {
    const index = TRON_BASE58_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error(`${label} must be a valid TRON Base58Check address.`);
    }
    decodedValue = decodedValue * 58n + BigInt(index);
  }
  const hexValue =
    decodedValue === 0n
      ? ""
      : decodedValue
          .toString(16)
          .padStart(
            decodedValue.toString(16).length +
              (decodedValue.toString(16).length % 2),
            "0",
          );
  const body = hexValue ? Buffer.from(hexValue, "hex") : Buffer.alloc(0);
  const leadingZeros = value.match(/^1*/u)?.[0].length ?? 0;
  const decoded = Buffer.concat([Buffer.alloc(leadingZeros), body]);
  if (decoded.length !== 25) {
    throw new Error(`${label} must be a valid TRON Base58Check address.`);
  }
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const expected = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);
  if (!checksum.equals(expected)) {
    throw new Error(`${label} has an invalid TRON Base58Check checksum.`);
  }
  if (payload[0] !== 0x41 || payload.subarray(1).every((byte) => byte === 0)) {
    throw new Error(`${label} must be a non-zero TRON mainnet address.`);
  }
  return payload;
};

const normalizeTronGatewayAddress = (value: string, label: string): string => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(normalized)) {
    throw new Error(`${label} must be a TRON Base58Check address.`);
  }
  decodeTronBase58CheckPayload(normalized, label);
  return normalized;
};

const getTronAccountFromGateway = (
  input: TronAccountInput,
): Promise<Record<string, unknown>> =>
  postTronJson(
    input,
    "/wallet/getaccount",
    {
      address: normalizeTronGatewayAddress(
        input.address,
        "TRON account address",
      ),
      visible: true,
    },
    "TRON account",
  );

const normalizeTronFunctionSelector = (value: string): string => {
  const normalized = trimString(value);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*\([^)]*\)$/u.test(normalized)) {
    throw new Error(
      "TRON function selector must be a Solidity function signature.",
    );
  }
  return normalized;
};

const normalizeTronHexParameter = (
  value: string | undefined,
  label: string,
): string => {
  const normalized = trimString(value ?? "").replace(/^0x/iu, "");
  if (!normalized) {
    return "";
  }
  if (!/^[0-9a-fA-F]+$/u.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be canonical hex.`);
  }
  return normalized.toLowerCase();
};

const normalizeTronSafeInteger = (
  value: number | string | undefined,
  label: string,
  fallback: number,
): number => {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return parsed;
};

const normalizeTronContractParameter = (
  input: {
    callData?: string;
    parameter?: string;
  },
  label: string,
): string => {
  const callData = normalizeTronHexParameter(
    input.callData,
    `${label} call data`,
  );
  const parameter = normalizeTronHexParameter(
    input.parameter,
    `${label} parameter`,
  );
  if (callData && parameter) {
    throw new Error(`${label} must provide either callData or parameter.`);
  }
  if (parameter) {
    return parameter;
  }
  if (callData && callData.length < 8) {
    throw new Error(`${label} call data must include a 4-byte selector.`);
  }
  return callData ? callData.slice(8) : "";
};

const TRON_BROADCAST_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const TRON_BROADCAST_SIGNING_HELPER_KEY_PATTERN =
  /^(?:signatures?|privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_ORDER = SECP256K1_ORDER >> 1n;

const assertNoSecretLikeTransactionFields = (
  value: unknown,
  path = "TRON transaction",
  options: { allowTopLevelSignature?: boolean } = {},
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material before TRON gateway submission.`,
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoSecretLikeTransactionFields(
        entry,
        `${path}[${index}]`,
        options,
        seen,
      );
    });
    return;
  }
  if (!isPlainRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (TRON_BROADCAST_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.${key} must not be sent to the TRON gateway.`);
    }
    const allowedTopLevelSignature =
      options.allowTopLevelSignature &&
      path === "TRON broadcast transaction" &&
      key === "signature";
    if (
      !allowedTopLevelSignature &&
      TRON_BROADCAST_SIGNING_HELPER_KEY_PATTERN.test(key)
    ) {
      throw new Error(
        `${path}.${key} must not include nested signatures or signing helper payloads before TRON gateway submission.`,
      );
    }
    assertNoSecretLikeTransactionFields(child, `${path}.${key}`, options, seen);
  }
};

const normalizeTronSignatureHex = (value: unknown, label: string): string => {
  const normalized = trimString(value).replace(/^0x/iu, "").toLowerCase();
  if (!/^[0-9a-f]{130}$/u.test(normalized)) {
    throw new Error(`${label} must be a 65-byte secp256k1 signature.`);
  }
  return normalized;
};

const normalizeTronPayloadHex = (value: unknown, label: string): string => {
  const text = trimString(value);
  if (text.startsWith("T")) {
    return decodeTronBase58CheckPayload(text, label).toString("hex");
  }
  const normalized = text.replace(/^0x/iu, "").toLowerCase();
  if (!/^41[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a TRON mainnet address payload.`);
  }
  if (/^410{40}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const bytesToBigInt = (bytes: Uint8Array): bigint =>
  BigInt(`0x${Buffer.from(bytes).toString("hex")}`);

const recoverTronSignatureOwnerPayload = (
  signatureHex: string,
  rawDataHex: string,
): string => {
  const signature = Buffer.from(signatureHex, "hex");
  const recoveryId = signature[64];
  if (
    !(
      (recoveryId >= 0 && recoveryId <= 3) ||
      (recoveryId >= 27 && recoveryId <= 30)
    )
  ) {
    throw new Error(
      "TRON broadcast signature must be a canonical recoverable signature.",
    );
  }
  const r = bytesToBigInt(signature.subarray(0, 32));
  const s = bytesToBigInt(signature.subarray(32, 64));
  if (r <= 0n || r >= SECP256K1_ORDER || s <= 0n || s > SECP256K1_HALF_ORDER) {
    throw new Error("TRON broadcast signature must be canonical.");
  }
  const normalizedRecoveryId = recoveryId >= 27 ? recoveryId - 27 : recoveryId;
  try {
    const rawDataHash = createHash("sha256")
      .update(Buffer.from(rawDataHex, "hex"))
      .digest();
    const publicKey = secp256k1.Signature.fromCompact(
      Uint8Array.from(signature.subarray(0, 64)),
    )
      .addRecoveryBit(normalizedRecoveryId)
      .recoverPublicKey(Uint8Array.from(rawDataHash))
      .toRawBytes(false);
    const addressHash = keccak_256(publicKey.slice(1));
    return `41${Buffer.from(addressHash.slice(-20)).toString("hex")}`;
  } catch (error) {
    throw new Error(
      `TRON broadcast signature could not recover the transaction owner: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

type TronBroadcastTriggerBinding = {
  ownerPayload: string;
  contractPayload: string;
  dataHex: string;
};

const normalizeTronContractType = (value: unknown): string =>
  trimString(value)
    .replace(/[^a-z0-9]/giu, "")
    .toLowerCase();

const readTronRawDataTriggerBinding = (
  rawData: Record<string, unknown>,
  options: { canonicalizeDecodedFields?: boolean } = {},
): TronBroadcastTriggerBinding => {
  const contracts = rawData.contract;
  if (!Array.isArray(contracts) || contracts.length !== 1) {
    throw new Error(
      "TRON broadcast transaction raw_data must include exactly one contract.",
    );
  }
  const [contract] = contracts;
  if (!isPlainRecord(contract)) {
    throw new Error(
      "TRON broadcast transaction raw_data.contract[0] must be an object.",
    );
  }
  const parameter = contract.parameter;
  if (!isPlainRecord(parameter)) {
    throw new Error(
      "TRON broadcast transaction raw_data.contract[0] must include parameter.",
    );
  }
  const value = parameter.value;
  if (!isPlainRecord(value)) {
    throw new Error(
      "TRON broadcast transaction raw_data.contract[0] must include parameter.value.",
    );
  }
  const type = normalizeTronContractType(
    contract.type ?? contract.contractType,
  );
  const typeUrl = normalizeTronContractType(
    parameter.type_url ?? parameter.typeUrl,
  );
  if (
    type !== "triggersmartcontract" &&
    !typeUrl.endsWith("triggersmartcontract")
  ) {
    throw new Error(
      "TRON broadcast transaction raw_data.contract[0] must be a TriggerSmartContract call.",
    );
  }
  const ownerPayload = normalizeTronPayloadHex(
    value.owner_address ?? value.ownerAddress,
    "TRON broadcast transaction raw_data.contract[0].owner_address",
  );
  const contractPayload = normalizeTronPayloadHex(
    value.contract_address ?? value.contractAddress,
    "TRON broadcast transaction raw_data.contract[0].contract_address",
  );
  const dataHex = normalizeTronHexParameter(
    trimString(value.data ?? value.call_data ?? value.callData),
    "TRON broadcast transaction raw_data.contract[0].data",
  );
  if (!dataHex) {
    throw new Error(
      "TRON broadcast transaction raw_data.contract[0] must include smart-contract call data.",
    );
  }
  if (options.canonicalizeDecodedFields) {
    value.owner_address = ownerPayload;
    value.contract_address = contractPayload;
    value.data = dataHex;
    delete value.ownerAddress;
    delete value.contractAddress;
    delete value.call_data;
    delete value.callData;
  }
  return { ownerPayload, contractPayload, dataHex };
};

const normalizeTronBroadcastTransaction = (
  transaction: unknown,
): Record<string, unknown> => {
  if (!isPlainRecord(transaction)) {
    throw new Error("TRON broadcast transaction must be an object.");
  }
  const normalized = snapshotSccpJsonDataValue(
    transaction,
    "TRON broadcast transaction must contain only enumerable string-keyed data properties with JSON-compatible values.",
  ) as Record<string, unknown>;
  assertNoSecretLikeTransactionFields(
    normalized,
    "TRON broadcast transaction",
    {
      allowTopLevelSignature: true,
    },
  );
  const txId = normalizeTronTxId(
    trimString(normalized.txID ?? normalized.txid),
  );
  const signatures = normalized.signature;
  if (!Array.isArray(signatures) || signatures.length !== 1) {
    throw new Error(
      "TRON broadcast transaction must include exactly one signature.",
    );
  }
  const signature = normalizeTronSignatureHex(signatures[0], "TRON signature");
  normalized.signature = [signature];

  const rawData = normalized.raw_data;
  const rawDataHex = trimString(normalized.raw_data_hex);
  if (!isPlainRecord(rawData)) {
    throw new Error(
      "TRON broadcast transaction must include decoded raw_data.",
    );
  }
  if (!rawDataHex) {
    throw new Error("TRON broadcast transaction must include raw_data_hex.");
  }
  normalized.txID = txId;
  const canonicalRawDataHex = normalizeTronHexParameter(
    rawDataHex,
    "TRON raw_data_hex",
  );
  if (!canonicalRawDataHex) {
    throw new Error("TRON raw_data_hex is required when provided.");
  }
  const expectedTxId = createHash("sha256")
    .update(Buffer.from(canonicalRawDataHex, "hex"))
    .digest("hex");
  if (expectedTxId !== txId) {
    throw new Error("TRON txID must match raw_data_hex.");
  }
  const triggerBinding = readTronRawDataTriggerBinding(rawData, {
    canonicalizeDecodedFields: normalized.visible !== true,
  });
  try {
    parseTronTriggerSmartContractRawData(canonicalRawDataHex, {
      expectedOwnerAddress: triggerBinding.ownerPayload,
      expectedContractAddress: triggerBinding.contractPayload,
      expectedCallData: triggerBinding.dataHex,
    });
  } catch (error) {
    throw new Error(
      `TRON broadcast raw_data_hex does not match decoded TriggerSmartContract: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const recoveredOwnerPayload = recoverTronSignatureOwnerPayload(
    signature,
    canonicalRawDataHex,
  );
  if (recoveredOwnerPayload !== triggerBinding.ownerPayload) {
    throw new Error(
      "TRON broadcast signature does not recover to the transaction owner.",
    );
  }
  normalized.raw_data_hex = canonicalRawDataHex;
  return normalized;
};

const broadcastTronTransactionToGateway = async (
  input: TronBroadcastInput,
): Promise<Record<string, unknown>> => {
  const transaction = normalizeTronBroadcastTransaction(input.transaction);
  const payload = await postTronJson(
    input,
    "/wallet/broadcasttransaction",
    transaction,
    "Broadcast TRON transaction",
  );
  if (payload.result !== true) {
    const code = trimString(payload.code);
    const message = trimString(payload.message);
    const detail = [code, message].filter(Boolean).join(": ");
    throw new Error(
      detail
        ? `Broadcast TRON transaction was rejected by the TRON node: ${detail}`
        : "Broadcast TRON transaction was rejected by the TRON node.",
    );
  }
  return payload;
};

const triggerTronSmartContractFromGateway = (
  input: TronTriggerSmartContractInput,
): Promise<Record<string, unknown>> => {
  const parameter = normalizeTronContractParameter(
    input,
    "TRON smart-contract",
  );
  return postTronJson(
    input,
    "/wallet/triggersmartcontract",
    {
      owner_address: normalizeTronGatewayAddress(
        input.ownerAddress,
        "TRON owner address",
      ),
      contract_address: normalizeTronGatewayAddress(
        input.contractAddress,
        "TRON contract address",
      ),
      function_selector: normalizeTronFunctionSelector(input.functionSelector),
      parameter,
      fee_limit: normalizeTronSafeInteger(
        input.feeLimit,
        "TRON fee limit",
        100_000_000,
      ),
      call_value: normalizeTronSafeInteger(
        input.callValue,
        "TRON call value",
        0,
      ),
      visible: true,
      ...(input.permissionId !== undefined && input.permissionId !== ""
        ? {
            permission_id: normalizeTronSafeInteger(
              input.permissionId,
              "TRON permission id",
              0,
            ),
          }
        : {}),
    },
    "Trigger TRON smart contract",
  ).then((payload) => {
    assertTronGatewayAccepted(payload, "Trigger TRON smart contract");
    return payload;
  });
};

const triggerTronConstantContractFromGateway = (
  input: TronConstantContractInput,
): Promise<Record<string, unknown>> => {
  const parameter = normalizeTronContractParameter(
    input,
    "TRON constant-contract",
  );
  return postTronJson(
    input,
    "/wallet/triggerconstantcontract",
    {
      owner_address: normalizeTronGatewayAddress(
        input.ownerAddress,
        "TRON owner address",
      ),
      contract_address: normalizeTronGatewayAddress(
        input.contractAddress,
        "TRON contract address",
      ),
      function_selector: normalizeTronFunctionSelector(input.functionSelector),
      parameter,
      visible: true,
    },
    "Trigger TRON constant contract",
  ).then((payload) => {
    assertTronGatewayAccepted(payload, "Trigger TRON constant contract");
    return payload;
  });
};

const DEFAULT_BSC_TESTNET_RPC_URL = "https://bsc-testnet-rpc.publicnode.com";

const isLoopbackEvmRpcHost = (hostname: string): boolean => {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const normalizeEvmRpcUrl = (endpoint?: string): string => {
  const normalized = normalizeBaseUrl(
    trimString(endpoint) || DEFAULT_BSC_TESTNET_RPC_URL,
  );
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      "EVM RPC endpoint must be a valid HTTPS or loopback HTTP URL.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("EVM RPC endpoint must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("EVM RPC endpoint must not include query or hash.");
  }
  const loopback = isLoopbackEvmRpcHost(parsed.hostname);
  if (parsed.protocol === "http:" && loopback) {
    return normalized;
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      "EVM RPC endpoint must use HTTPS unless it is loopback HTTP.",
    );
  }
  if (isPrivateTronGatewayHost(parsed.hostname) && !loopback) {
    throw new Error("EVM RPC endpoint must not target a private network.");
  }
  return normalized;
};

const normalizeEvmHash = (value: unknown, label: string): string => {
  const normalized = trimString(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const normalizeEvmNonZeroHash = (value: unknown, label: string): string => {
  const normalized = normalizeEvmHash(value, label);
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const normalizeEvmAddressHex = (value: unknown, label: string): string => {
  const normalized = trimString(value).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error(`${label} must be a 20-byte EVM address.`);
  }
  if (/^0x0{40}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const normalizeEvmDataHex = (value: unknown, label: string): string => {
  const normalized = trimString(value).toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})*$/u.test(normalized)) {
    throw new Error(`${label} must be hex-encoded bytes.`);
  }
  return normalized;
};

const normalizeEvmBlockTag = (
  value: unknown,
  label = "EVM block tag",
): string => {
  const normalized =
    value === undefined ? "latest" : trimString(value).toLowerCase();
  if (/^(?:latest|earliest|pending|safe|finalized)$/u.test(normalized)) {
    return normalized;
  }
  if (/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(normalized)) {
    return normalized;
  }
  throw new Error(`${label} must be a standard EVM block tag or quantity.`);
};

const normalizeEvmQuantity = (value: unknown, label: string): string => {
  const normalized = trimString(value).toLowerCase();
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(normalized)) {
    throw new Error(`${label} must be an EVM hex quantity.`);
  }
  return normalized;
};

const normalizeEvmTopic = (value: unknown, label: string): string => {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }
  return normalizeEvmHash(value, label);
};

const EVM_READ_RPC_METHODS = new Set([
  "eth_chainId",
  "net_version",
  "web3_clientVersion",
  "eth_getBalance",
  "eth_getCode",
  "eth_call",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByHash",
  "eth_getBlockReceipts",
  "eth_getLogs",
]);

const normalizeEvmRpcParamsSnapshot = (
  params: unknown[] | undefined,
): unknown[] => {
  if (params === undefined) {
    return [];
  }
  if (!Array.isArray(params)) {
    throw new Error("EVM RPC params must be an array when provided.");
  }
  return snapshotSccpJsonDataValue(
    params,
    "EVM RPC params must contain only enumerable string-keyed data properties with JSON-compatible values.",
  );
};

const requireExactEvmRpcParams = (
  method: string,
  params: unknown[],
  count: number,
): void => {
  if (params.length !== count) {
    throw new Error(`EVM RPC ${method} requires exactly ${count} params.`);
  }
};

const normalizeEvmRpcCallObject = (value: unknown): Record<string, string> => {
  if (!isPlainRecord(value)) {
    throw new Error("EVM RPC eth_call params[0] must be an object.");
  }
  const allowedKeys = new Set([
    "from",
    "to",
    "gas",
    "gasPrice",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
    "value",
    "data",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`EVM RPC eth_call params[0] unsupported field ${key}.`);
    }
  }
  const call: Record<string, string> = {
    to: normalizeEvmAddressHex(value.to, "EVM RPC eth_call to"),
    data: normalizeEvmDataHex(value.data, "EVM RPC eth_call data"),
  };
  if (value.from !== undefined) {
    call.from = normalizeEvmAddressHex(value.from, "EVM RPC eth_call from");
  }
  for (const key of [
    "gas",
    "gasPrice",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
    "value",
  ] as const) {
    if (value[key] !== undefined) {
      call[key] = normalizeEvmQuantity(value[key], `EVM RPC eth_call ${key}`);
    }
  }
  return call;
};

const normalizeEvmRpcLogAddress = (value: unknown): string | string[] => {
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length > 64) {
      throw new Error(
        "EVM RPC eth_getLogs address arrays must contain 1 to 64 addresses.",
      );
    }
    return value.map((address, index) =>
      normalizeEvmAddressHex(
        address,
        `EVM RPC eth_getLogs address ${index + 1}`,
      ),
    );
  }
  return normalizeEvmAddressHex(value, "EVM RPC eth_getLogs address");
};

const normalizeEvmRpcLogTopics = (
  value: unknown,
): Array<string | string[] | null> => {
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error(
      "EVM RPC eth_getLogs topics must be an array of at most four items.",
    );
  }
  return value.map((topic, index) => {
    if (topic === null) {
      return null;
    }
    if (Array.isArray(topic)) {
      if (topic.length === 0 || topic.length > 64) {
        throw new Error(
          `EVM RPC eth_getLogs topic ${index + 1} arrays must contain 1 to 64 topics.`,
        );
      }
      return topic.map((entry, innerIndex) =>
        normalizeEvmTopic(
          entry,
          `EVM RPC eth_getLogs topic ${index + 1}.${innerIndex + 1}`,
        ),
      );
    }
    return normalizeEvmTopic(topic, `EVM RPC eth_getLogs topic ${index + 1}`);
  });
};

const normalizeEvmRpcLogsFilter = (value: unknown): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error("EVM RPC eth_getLogs params[0] must be a filter object.");
  }
  const allowedKeys = new Set([
    "address",
    "fromBlock",
    "toBlock",
    "blockHash",
    "topics",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`EVM RPC eth_getLogs unsupported filter field ${key}.`);
    }
  }
  if (
    value.blockHash !== undefined &&
    (value.fromBlock !== undefined || value.toBlock !== undefined)
  ) {
    throw new Error(
      "EVM RPC eth_getLogs blockHash must not be combined with fromBlock or toBlock.",
    );
  }
  const filter: Record<string, unknown> = {};
  if (value.address !== undefined) {
    filter.address = normalizeEvmRpcLogAddress(value.address);
  }
  if (value.fromBlock !== undefined) {
    filter.fromBlock = normalizeEvmBlockTag(
      value.fromBlock,
      "EVM RPC eth_getLogs fromBlock",
    );
  }
  if (value.toBlock !== undefined) {
    filter.toBlock = normalizeEvmBlockTag(
      value.toBlock,
      "EVM RPC eth_getLogs toBlock",
    );
  }
  if (value.blockHash !== undefined) {
    filter.blockHash = normalizeEvmNonZeroHash(
      value.blockHash,
      "EVM RPC eth_getLogs blockHash",
    );
  }
  if (value.topics !== undefined) {
    filter.topics = normalizeEvmRpcLogTopics(value.topics);
  }
  return filter;
};

const normalizeEvmRpcParams = (
  method: string,
  params: unknown[] | undefined,
): unknown[] => {
  const cloned = normalizeEvmRpcParamsSnapshot(params);
  switch (method) {
    case "eth_chainId":
    case "net_version":
    case "web3_clientVersion":
      requireExactEvmRpcParams(method, cloned, 0);
      return [];
    case "eth_getBalance":
    case "eth_getCode":
      requireExactEvmRpcParams(method, cloned, 2);
      return [
        normalizeEvmAddressHex(cloned[0], `EVM RPC ${method} address`),
        normalizeEvmBlockTag(cloned[1], `EVM RPC ${method} block tag`),
      ];
    case "eth_call":
      requireExactEvmRpcParams(method, cloned, 2);
      return [
        normalizeEvmRpcCallObject(cloned[0]),
        normalizeEvmBlockTag(cloned[1], "EVM RPC eth_call block tag"),
      ];
    case "eth_getTransactionReceipt":
    case "eth_getTransactionByHash":
      requireExactEvmRpcParams(method, cloned, 1);
      return [normalizeEvmNonZeroHash(cloned[0], `EVM RPC ${method} hash`)];
    case "eth_getBlockByHash":
      requireExactEvmRpcParams(method, cloned, 2);
      if (typeof cloned[1] !== "boolean") {
        throw new Error(
          "EVM RPC eth_getBlockByHash params[1] must be a boolean.",
        );
      }
      return [
        normalizeEvmNonZeroHash(cloned[0], "EVM RPC eth_getBlockByHash hash"),
        cloned[1],
      ];
    case "eth_getBlockReceipts":
      requireExactEvmRpcParams(method, cloned, 1);
      return [
        /^0x[0-9a-f]{64}$/iu.test(String(cloned[0] ?? "").trim())
          ? normalizeEvmNonZeroHash(
              cloned[0],
              "EVM RPC eth_getBlockReceipts block hash",
            )
          : normalizeEvmBlockTag(
              cloned[0],
              "EVM RPC eth_getBlockReceipts block tag",
            ),
      ];
    case "eth_getLogs":
      requireExactEvmRpcParams(method, cloned, 1);
      return [normalizeEvmRpcLogsFilter(cloned[0])];
    default:
      throw new Error("EVM RPC bridge only allows read-only methods.");
  }
};

const callEvmRpcOnGateway = async (
  input: EvmRpcCallInput,
): Promise<unknown> => {
  const method = trimString(input.method);
  if (!/^[a-z][a-z0-9_]{1,64}$/iu.test(method)) {
    throw new Error("EVM RPC method name is invalid.");
  }
  if (!EVM_READ_RPC_METHODS.has(method)) {
    throw new Error("EVM RPC bridge only allows read-only methods.");
  }
  const payload = await postJson(
    normalizeEvmRpcUrl(input.endpoint),
    `EVM RPC ${method}`,
    {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: normalizeEvmRpcParams(method, input.params),
    },
  );
  if (isPlainRecord(payload.error)) {
    const code = trimString(payload.error.code);
    const message = trimString(payload.error.message);
    const detail = [code, message].filter(Boolean).join(": ");
    throw new Error(
      detail
        ? `EVM RPC ${method} failed: ${detail}`
        : `EVM RPC ${method} failed.`,
    );
  }
  return payload.result;
};

const requireEvmRpcStringResult = async (
  input: EvmRpcCallInput,
  label: string,
): Promise<string> => {
  const result = await callEvmRpcOnGateway(input);
  if (typeof result !== "string") {
    throw new Error(`${label} did not return a string result.`);
  }
  return result;
};

const snapshotEvmRpcWrapperInput = <T>(input: T, label: string): T => {
  const normalized = snapshotSccpJsonDataValue(
    input,
    `${label} must contain only enumerable string-keyed data properties with JSON-compatible values.`,
  );
  if (!isPlainRecord(normalized)) {
    throw new Error(`${label} must be an object.`);
  }
  return normalized;
};

const getEvmChainIdFromRpc = (input?: EvmRpcInput): Promise<string> => {
  const normalizedInput =
    input === undefined
      ? undefined
      : snapshotEvmRpcWrapperInput(input, "EVM chain id input");
  return requireEvmRpcStringResult(
    {
      endpoint: normalizedInput?.endpoint,
      method: "eth_chainId",
      params: [],
    },
    "EVM chain id",
  ).then((chainId) => normalizeEvmQuantity(chainId, "EVM chain id"));
};

const getEvmBalanceFromRpc = (input: EvmAddressInput): Promise<string> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(
    input,
    "EVM balance input",
  );
  return requireEvmRpcStringResult(
    {
      endpoint: normalizedInput.endpoint,
      method: "eth_getBalance",
      params: [
        normalizeEvmAddressHex(normalizedInput.address, "EVM balance address"),
        normalizeEvmBlockTag(normalizedInput.blockTag),
      ],
    },
    "EVM balance",
  ).then((balance) => normalizeEvmQuantity(balance, "EVM balance"));
};

const getEvmCodeFromRpc = (input: EvmAddressInput): Promise<string> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(input, "EVM code input");
  return requireEvmRpcStringResult(
    {
      endpoint: normalizedInput.endpoint,
      method: "eth_getCode",
      params: [
        normalizeEvmAddressHex(normalizedInput.address, "EVM code address"),
        normalizeEvmBlockTag(normalizedInput.blockTag),
      ],
    },
    "EVM code",
  ).then((code) => normalizeEvmDataHex(code, "EVM code"));
};

const callEvmContractFromRpc = (input: EvmCallInput): Promise<string> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(input, "EVM call input");
  const call: Record<string, string> = {
    to: normalizeEvmAddressHex(normalizedInput.to, "EVM call target"),
    data: normalizeEvmDataHex(normalizedInput.data, "EVM call data"),
  };
  if (normalizedInput.from !== undefined) {
    call.from = normalizeEvmAddressHex(normalizedInput.from, "EVM call sender");
  }
  if (normalizedInput.value !== undefined) {
    call.value = normalizeEvmQuantity(normalizedInput.value, "EVM call value");
  }
  return requireEvmRpcStringResult(
    {
      endpoint: normalizedInput.endpoint,
      method: "eth_call",
      params: [call, normalizeEvmBlockTag(normalizedInput.blockTag)],
    },
    "EVM contract call",
  ).then((result) => normalizeEvmDataHex(result, "EVM contract call result"));
};

const getEvmTransactionReceiptFromRpc = async (
  input: EvmTransactionInput,
): Promise<Record<string, unknown> | null> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(
    input,
    "EVM transaction receipt input",
  );
  const result = await callEvmRpcOnGateway({
    endpoint: normalizedInput.endpoint,
    method: "eth_getTransactionReceipt",
    params: [
      normalizeEvmNonZeroHash(normalizedInput.txHash, "EVM transaction hash"),
    ],
  });
  if (result === null) {
    return null;
  }
  if (!isPlainRecord(result)) {
    throw new Error("EVM transaction receipt must be an object or null.");
  }
  return result;
};

const getEvmTransactionFromRpc = async (
  input: EvmTransactionInput,
): Promise<Record<string, unknown> | null> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(
    input,
    "EVM transaction input",
  );
  const result = await callEvmRpcOnGateway({
    endpoint: normalizedInput.endpoint,
    method: "eth_getTransactionByHash",
    params: [
      normalizeEvmNonZeroHash(normalizedInput.txHash, "EVM transaction hash"),
    ],
  });
  if (result === null) {
    return null;
  }
  if (!isPlainRecord(result)) {
    throw new Error("EVM transaction must be an object or null.");
  }
  return result;
};

const getEvmBlockByHashFromRpc = async (input: {
  endpoint?: string;
  blockHash: string;
  fullTransactions?: boolean;
}): Promise<Record<string, unknown> | null> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(input, "EVM block input");
  const result = await callEvmRpcOnGateway({
    endpoint: normalizedInput.endpoint,
    method: "eth_getBlockByHash",
    params: [
      normalizeEvmNonZeroHash(normalizedInput.blockHash, "EVM block hash"),
      normalizedInput.fullTransactions === true,
    ],
  });
  if (result === null) {
    return null;
  }
  if (!isPlainRecord(result)) {
    throw new Error("EVM block must be an object or null.");
  }
  return result;
};

const getEvmLogsFromRpc = async (
  input: EvmLogsInput,
): Promise<Record<string, unknown>[]> => {
  const normalizedInput = snapshotEvmRpcWrapperInput(input, "EVM logs input");
  const filter: Record<string, unknown> = {};
  if (
    normalizedInput.blockHash !== undefined &&
    (normalizedInput.fromBlock !== undefined ||
      normalizedInput.toBlock !== undefined)
  ) {
    throw new Error(
      "EVM eth_getLogs blockHash must not be combined with fromBlock or toBlock.",
    );
  }
  if (normalizedInput.address !== undefined) {
    filter.address = normalizeEvmRpcLogAddress(normalizedInput.address);
  }
  if (normalizedInput.blockHash !== undefined) {
    filter.blockHash = normalizeEvmNonZeroHash(
      normalizedInput.blockHash,
      "EVM blockHash",
    );
  }
  if (normalizedInput.fromBlock !== undefined) {
    filter.fromBlock = normalizeEvmBlockTag(
      normalizedInput.fromBlock,
      "EVM fromBlock",
    );
  }
  if (normalizedInput.toBlock !== undefined) {
    filter.toBlock = normalizeEvmBlockTag(
      normalizedInput.toBlock,
      "EVM toBlock",
    );
  }
  if (normalizedInput.topics !== undefined) {
    filter.topics = normalizeEvmRpcLogTopics(normalizedInput.topics);
  }
  const result = await callEvmRpcOnGateway({
    endpoint: normalizedInput.endpoint,
    method: "eth_getLogs",
    params: [filter],
  });
  if (!Array.isArray(result)) {
    throw new Error("EVM logs response must be an array.");
  }
  for (const [index, entry] of result.entries()) {
    if (!isPlainRecord(entry)) {
      throw new Error(
        `EVM logs response entry ${index + 1} must be an object.`,
      );
    }
  }
  return result as Record<string, unknown>[];
};

const fetchExplorerAssetDefinitionSnapshot = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  signal?: AbortSignal,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/snapshot`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition snapshot",
    undefined,
    signal,
  );
  return normalizeExplorerAssetDefinitionSnapshotPayload(payload);
};

const fetchExplorerAssetDefinitionEconometrics = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  signal?: AbortSignal,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/econometrics`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition econometrics",
    undefined,
    signal,
  );
  return normalizeExplorerAssetDefinitionEconometricsPayload(payload);
};

const extractTransactionRecordStatus = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const rawStatus = (payload as Record<string, unknown>).status;
  if (typeof rawStatus === "string") {
    const normalized = rawStatus.trim();
    return normalized || null;
  }
  if (
    rawStatus &&
    typeof rawStatus === "object" &&
    !Array.isArray(rawStatus) &&
    typeof (rawStatus as Record<string, unknown>).kind === "string"
  ) {
    const normalized = String(
      (rawStatus as Record<string, unknown>).kind,
    ).trim();
    return normalized || null;
  }
  return null;
};

const fetchTransactionRecordPayload = async (
  toriiUrl: string,
  hashHex: string,
): Promise<Record<string, unknown> | null> => {
  const endpoint = buildNexusEndpoint(
    toriiUrl,
    `/v1/transactions/${encodeURIComponent(hashHex)}`,
  );
  try {
    return await fetchJson(endpoint, `Transaction ${hashHex}`);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const normalizeRejectionReasonValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = trimString(value);
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }
  if (isPlainRecord(value)) {
    for (const key of [
      "message",
      "detail",
      "details",
      "reason",
      "code",
      "reject_code",
      "rejectCode",
    ]) {
      const normalized = normalizeRejectionReasonValue(value[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
};

const extractTransactionRejectionReason = (payload: unknown): string | null => {
  if (!isPlainRecord(payload)) {
    return null;
  }
  for (const key of [
    "rejection_reason",
    "rejectionReason",
    "reason",
    "reject_code",
    "rejectCode",
  ]) {
    const normalized = normalizeRejectionReasonValue(payload[key]);
    if (normalized) {
      return normalized;
    }
  }
  return (
    extractTransactionRejectionReason(payload.content) ??
    normalizeRejectionReasonValue(payload.status)
  );
};

const fetchExplorerTransactionRejectionReason = async (
  toriiUrl: string,
  hashHex: string,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrl,
    `/v1/explorer/transactions/${encodeURIComponent(hashHex)}`,
  );
  try {
    const payload = await fetchJson(
      endpoint,
      `Explorer transaction ${hashHex}`,
    );
    return extractTransactionRejectionReason(payload);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return null;
    }
    return null;
  }
};

const buildTransactionFinalityFailureError = async (
  toriiUrl: string,
  hashHex: string,
  statusKind: string,
  payload?: unknown,
) => {
  const reason =
    extractTransactionRejectionReason(payload) ??
    (await fetchExplorerTransactionRejectionReason(toriiUrl, hashHex));
  return new Error(
    `Transaction ${hashHex} ${statusKind.toLowerCase()} before it committed.${
      reason ? ` ${reason}` : ""
    }`,
  );
};

const readCommittedTransactionFee = (
  payload: unknown,
): TransactionFeeLike | null => {
  const fee = readTransactionFee(payload);
  if (!fee) {
    return null;
  }
  const amount = trimString(
    fee.amount ?? fee.quantity ?? fee.fee_amount ?? fee.feeAmount,
  );
  return amount ? fee : null;
};

const fetchCommittedTransactionFee = async (
  toriiUrl: string,
  hashHex: string,
  statusPayload: unknown,
  transactionRecordPayload?: unknown,
): Promise<TransactionFeeLike | null> => {
  const statusFee = readCommittedTransactionFee(statusPayload);
  if (statusFee) {
    return statusFee;
  }

  const recordFee = readCommittedTransactionFee(transactionRecordPayload);
  if (recordFee) {
    return recordFee;
  }

  try {
    const record = await fetchTransactionRecordPayload(toriiUrl, hashHex);
    const fee = readCommittedTransactionFee(record);
    if (fee) {
      return fee;
    }
  } catch {
    // Fee enrichment is best-effort; finality already succeeded.
  }

  try {
    const explorerDetail = await fetchExplorerTransactionDetail(
      toriiUrl,
      hashHex,
    );
    return readCommittedTransactionFee(explorerDetail);
  } catch {
    return null;
  }
};

const transactionSubmissionResult = (submission: {
  hash: string;
  fee?: TransactionFeeView | null;
}): TransactionSubmissionResultView => ({
  hash: submission.hash,
  ...(submission.fee ? { fee: submission.fee } : {}),
});

const waitForTransactionCommit = async (toriiUrl: string, hashHex: string) => {
  const client = getClient(toriiUrl);
  const deadline = Date.now() + CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS;
  let lastStatusKind: string | null = null;
  while (Date.now() <= deadline) {
    const payload = await client.getTransactionStatus(hashHex);
    const statusKind = extractPipelineStatusKind(payload);
    lastStatusKind = statusKind;
    if (statusKind && CONFIDENTIAL_TX_SUCCESS_STATUSES.has(statusKind)) {
      let transactionRecordPayload: Record<string, unknown> | null = null;
      if (statusKind === "Applied") {
        transactionRecordPayload = await fetchTransactionRecordPayload(
          toriiUrl,
          hashHex,
        );
        const recordStatus = extractTransactionRecordStatus(
          transactionRecordPayload,
        );
        if (recordStatus) {
          lastStatusKind = recordStatus;
        }
        if (
          recordStatus &&
          CONFIDENTIAL_TX_FAILURE_STATUSES.has(recordStatus)
        ) {
          throw await buildTransactionFinalityFailureError(
            toriiUrl,
            hashHex,
            recordStatus,
            payload,
          );
        }
      }
      return await fetchCommittedTransactionFee(
        toriiUrl,
        hashHex,
        payload,
        transactionRecordPayload,
      );
    }
    if (statusKind && CONFIDENTIAL_TX_FAILURE_STATUSES.has(statusKind)) {
      throw await buildTransactionFinalityFailureError(
        toriiUrl,
        hashHex,
        statusKind,
        payload,
      );
    }
    if (Date.now() + CONFIDENTIAL_TX_FINALITY_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(CONFIDENTIAL_TX_FINALITY_INTERVAL_MS);
  }

  const timeoutSeconds = Math.trunc(CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS / 1000);
  throw new Error(
    lastStatusKind
      ? `Transaction ${hashHex} stayed in ${lastStatusKind} and did not commit within ${timeoutSeconds} seconds.`
      : `Transaction ${hashHex} did not commit within ${timeoutSeconds} seconds.`,
  );
};

const submitSignedTransactionAndWaitForCommit = async (
  toriiUrl: string,
  signedTransaction: Buffer,
  options: { nativeBinding?: unknown; requireNativeEncoding?: boolean } = {},
) => {
  const submission = await submitSignedTransactionAsVersioned(
    toriiUrl,
    signedTransaction,
    options,
  );
  const fee = await waitForTransactionCommit(toriiUrl, submission.hash);
  return {
    ...submission,
    ...(fee ? { fee } : {}),
  };
};

const hashSignedTransactionHex = (signedTransaction: Buffer) => {
  const hash = hashSignedTransaction(signedTransaction, { encoding: "hex" });
  return Buffer.isBuffer(hash) ? hash.toString("hex") : hash;
};

const readPipelineSubmissionRoute = (
  response: Pick<Response, "headers">,
): Record<string, number> | null => {
  const laneRaw = response.headers.get("x-iroha-route-lane-id");
  const dataspaceRaw = response.headers.get("x-iroha-route-dataspace-id");
  const laneId =
    laneRaw !== null && laneRaw.trim() !== "" ? Number(laneRaw) : null;
  const dataspaceId =
    dataspaceRaw !== null && dataspaceRaw.trim() !== ""
      ? Number(dataspaceRaw)
      : null;
  const route: Record<string, number> = {};
  if (Number.isSafeInteger(laneId)) {
    route.lane_id = Number(laneId);
  }
  if (Number.isSafeInteger(dataspaceId)) {
    route.dataspace_id = Number(dataspaceId);
  }
  return Object.keys(route).length ? route : null;
};

const attachPipelineSubmissionRoute = (
  value: unknown,
  route: Record<string, number> | null,
) => {
  if (!route) {
    return value ?? null;
  }
  if (isPlainRecord(value)) {
    return { ...value, route };
  }
  if (value === null || value === undefined) {
    return { route };
  }
  return { value, route };
};

const readPipelineSubmissionResponse = async (
  response: Pick<Response, "headers" | "json" | "arrayBuffer">,
  options: {
    nativeBinding?: unknown;
    route: Record<string, number> | null;
  },
) => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return attachPipelineSubmissionRoute(payload, options.route);
  }
  if (contentType.includes("application/x-norito")) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) {
      return attachPipelineSubmissionRoute(null, options.route);
    }
    const native = options.nativeBinding as
      | IrohaNativeTransactionCodec
      | undefined;
    if (typeof native?.decodeTransactionReceiptJson === "function") {
      try {
        const decoded = native.decodeTransactionReceiptJson(body);
        const decodedText = Buffer.isBuffer(decoded)
          ? decoded.toString("utf8")
          : decoded instanceof ArrayBuffer || ArrayBuffer.isView(decoded)
            ? binaryToBuffer(decoded).toString("utf8")
            : String(decoded);
        return attachPipelineSubmissionRoute(
          JSON.parse(decodedText),
          options.route,
        );
      } catch {
        return attachPipelineSubmissionRoute(null, options.route);
      }
    }
  }
  return attachPipelineSubmissionRoute(null, options.route);
};

const ROUTE_UNAVAILABLE_PATTERN = /\broute_unavailable\b/i;
const AUTHORITATIVE_BINDING_ROUTE_PATTERN =
  /no authoritative peer binding is registered for lane\s+(\d+)\s+dataspace\s+(\d+)/i;
const ROUTE_TARGET_PATTERN = /\blane\s+(\d+)\s*\/\s*dataspace\s+(\d+)\b/i;

const stringifyErrorField = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (isPlainRecord(value) || Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
};

const routeUnavailableErrorText = (error: unknown) => {
  const haystack = [
    error instanceof Error ? error.message : null,
    isPlainRecord(error) ? error.message : null,
    isPlainRecord(error) ? error.code : null,
    isPlainRecord(error) ? error.rejectCode : null,
    isPlainRecord(error) ? error.reject_code : null,
    isPlainRecord(error) ? error.errorMessage : null,
    isPlainRecord(error) ? error.error : null,
    isPlainRecord(error) ? error.detail : null,
    isPlainRecord(error) ? error.bodyText : null,
    isPlainRecord(error) ? error.bodyJson : null,
  ];
  return haystack.map(stringifyErrorField).join("\n");
};

const routeUnavailableTargetMessage = (error: unknown) => {
  const text = routeUnavailableErrorText(error);
  const match =
    AUTHORITATIVE_BINDING_ROUTE_PATTERN.exec(text) ||
    ROUTE_TARGET_PATTERN.exec(text);
  if (!match) {
    return "the requested lane/dataspace";
  }
  return `lane ${match[1]} / dataspace ${match[2]}`;
};

const isRouteUnavailableError = (error: unknown) =>
  ROUTE_UNAVAILABLE_PATTERN.test(routeUnavailableErrorText(error));

const submitSignedTransactionAsVersioned = async (
  toriiUrl: string,
  signedTransaction: Buffer,
  options: { nativeBinding?: unknown; requireNativeEncoding?: boolean } = {},
) => {
  const signedTransactionBuffer = binaryToBuffer(signedTransaction);
  if (options.nativeBinding || options.requireNativeEncoding) {
    const pipelinePayload = encodeSignedTransactionForPipeline(
      signedTransactionBuffer,
      options,
    );
    const response = await nodeFetch(
      buildNexusEndpoint(toriiUrl, "/v1/pipeline/transactions"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-norito",
          Accept: "application/x-norito, application/json",
        },
        body: pipelinePayload as unknown as BodyInit,
      },
    );
    if (!response.ok) {
      throw await createApiRequestError(response, "Transaction submission");
    }
    const route = readPipelineSubmissionRoute(response);
    const submission = await readPipelineSubmissionResponse(response, {
      nativeBinding: options.nativeBinding,
      route,
    });
    return {
      hash: hashSignedTransactionHex(signedTransactionBuffer),
      submission,
    };
  }

  const client = getClient(toriiUrl);
  const submission = await client.submitTransaction(signedTransactionBuffer);
  return {
    hash: hashSignedTransactionHex(signedTransactionBuffer),
    submission,
  };
};

const submitTransactionEntrypointAndWaitForCommit = async (
  toriiUrl: string,
  transactionEntrypoint: Buffer,
  hashHex: string,
) => {
  const client = getClient(toriiUrl);
  const transactionEntrypointBuffer = binaryToBuffer(transactionEntrypoint);
  const submission = await submitTransactionEntrypoint(
    client,
    transactionEntrypointBuffer,
    {
      hashHex,
    },
  );
  const fee = await waitForTransactionCommit(toriiUrl, submission.hash);
  return {
    ...submission,
    ...(fee ? { fee } : {}),
  };
};

const fetchConfidentialAssetPolicy = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
): Promise<ConfidentialAssetPolicyView> => {
  const normalizedAssetDefinitionId =
    extractAssetDefinitionId(assetDefinitionId).trim() ||
    assetDefinitionId.trim();
  if (!normalizedAssetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/confidential/assets/${encodeURIComponent(normalizedAssetDefinitionId)}/transitions`,
  );
  const payload = await fetchJson(endpoint, "Confidential asset policy");
  return normalizeConfidentialAssetPolicyPayload(payload);
};

const fetchAccountAssetsList = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix?: number;
  assetDefinitionId?: string;
  limit?: number;
  offset?: number;
}) => {
  const normalizedBaseUrl = `${normalizeBaseUrl(input.toriiUrl)}/`;
  const normalizedAccountId = encodeURIComponent(
    normalizeCanonicalAccountIdLiteral(
      input.accountId,
      "accountId",
      input.networkPrefix,
    ),
  );
  const endpoint = new URL(
    `v1/accounts/${normalizedAccountId}/assets`,
    normalizedBaseUrl,
  );
  endpoint.searchParams.set("limit", String(input.limit ?? 50));
  const assetDefinitionId = extractAssetDefinitionId(
    input.assetDefinitionId,
  ).trim();
  if (assetDefinitionId) {
    endpoint.searchParams.set("asset", assetDefinitionId);
  }
  if (input.offset !== undefined) {
    endpoint.searchParams.set("offset", String(input.offset));
  }
  const response = await nodeFetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw await createApiRequestError(response, "Account assets");
  }
  const payload = (await response.json()) as unknown;
  return normalizeAccountAssetListPayload(payload);
};

const fetchGovernanceCouncilCurrent = async (
  toriiUrlRaw: string,
): Promise<GovernanceCouncilResponse> => {
  const payload = await fetchJson(
    buildNexusEndpoint(toriiUrlRaw, "/v1/gov/council/current"),
    "Governance council current",
  );
  return normalizeGovernanceCouncilCurrentPayload(payload);
};

const fetchGovernanceCitizenCount = async (
  toriiUrlRaw: string,
): Promise<GovernanceCitizenCountResponse> => {
  try {
    const payload = await fetchJson(
      buildNexusEndpoint(toriiUrlRaw, "/v1/gov/citizens"),
      "Governance citizen count",
    );
    return normalizeGovernanceCitizenCountPayload(payload, true);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return normalizeGovernanceCitizenCountPayload(null, false);
    }
    throw error;
  }
};

const optionalNonNegativeNumber = (value: unknown): number | null => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0
    ? Math.trunc(normalized)
    : null;
};

const normalizeGovernanceCitizenStatusPayload = (
  payload: unknown,
  fallbackAccountId: string,
  endpointAvailable: boolean,
): GovernanceCitizenStatusResponse => {
  const record = isPlainRecord(payload) ? payload : {};
  const amount = trimString(record.amount);
  return {
    accountId:
      trimString(record.account_id ?? record.accountId) || fallbackAccountId,
    isCitizen: Boolean(record.is_citizen ?? record.isCitizen),
    amount: amount || null,
    bondedHeight: optionalNonNegativeNumber(
      record.bonded_height ?? record.bondedHeight,
    ),
    seatsInEpoch: optionalNonNegativeNumber(
      record.seats_in_epoch ?? record.seatsInEpoch,
    ),
    lastEpochSeen: optionalNonNegativeNumber(
      record.last_epoch_seen ?? record.lastEpochSeen,
    ),
    cooldownUntil: optionalNonNegativeNumber(
      record.cooldown_until ?? record.cooldownUntil,
    ),
    endpointAvailable,
  };
};

const fetchGovernanceCitizenStatus = async (
  toriiUrlRaw: string,
  accountId: string,
): Promise<GovernanceCitizenStatusResponse> => {
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    accountId,
    "accountId",
  );
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/gov/citizens/${encodeURIComponent(normalizedAccountId)}`,
  );
  try {
    const payload = await fetchJson(endpoint, "Governance citizenship status");
    return normalizeGovernanceCitizenStatusPayload(
      payload,
      normalizedAccountId,
      true,
    );
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return normalizeGovernanceCitizenStatusPayload(
        null,
        normalizedAccountId,
        false,
      );
    }
    throw error;
  }
};

const confidentialPolicyLookupSupportsLiveAssetFallback = (
  error: unknown,
  requestedAssetDefinitionId: string,
) => {
  const normalizedRequestedAssetDefinitionId = requestedAssetDefinitionId
    .trim()
    .toLowerCase();
  if (!normalizedRequestedAssetDefinitionId) {
    return false;
  }
  return isApiRequestError(error) && error.status === 404;
};

const CONFIDENTIAL_ASSET_DEFINITION_ID_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/;

const resolveLiveConfidentialAssetDefinitionIdForAccount = async (input: {
  toriiUrl: string;
  accountId: string;
  requestedAssetDefinitionId: string;
}) => {
  const assetsResponse = await fetchAccountAssetsList({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    limit: 200,
  });
  const resolvedAssetDefinitionId = resolveUniqueLiveAssetDefinitionId(
    assetsResponse.items,
    input.requestedAssetDefinitionId,
  ).trim();
  if (
    !resolvedAssetDefinitionId ||
    resolvedAssetDefinitionId.toLowerCase() ===
      input.requestedAssetDefinitionId.trim().toLowerCase()
  ) {
    return "";
  }
  return resolvedAssetDefinitionId;
};

const fetchConfidentialAssetPolicyForAccount = async (input: {
  toriiUrl: string;
  accountId: string;
  assetDefinitionId: string;
}) => {
  const requestedAssetDefinitionId =
    extractAssetDefinitionId(input.assetDefinitionId).trim() ||
    trimString(input.assetDefinitionId);
  const canonicalizePolicyResult = async (
    policy: ConfidentialAssetPolicyView,
  ) => {
    const policyAssetDefinitionId =
      extractAssetDefinitionId(trimString(policy.asset_id)).trim() ||
      requestedAssetDefinitionId;
    if (
      CONFIDENTIAL_ASSET_DEFINITION_ID_PATTERN.test(policyAssetDefinitionId)
    ) {
      return {
        policy,
        requestedAssetDefinitionId,
        resolvedAssetDefinitionId: policyAssetDefinitionId,
      };
    }
    const resolvedAssetDefinitionId =
      await resolveLiveConfidentialAssetDefinitionIdForAccount({
        toriiUrl: input.toriiUrl,
        accountId: input.accountId,
        requestedAssetDefinitionId: policyAssetDefinitionId,
      });
    const canonicalAssetDefinitionId =
      resolvedAssetDefinitionId || policyAssetDefinitionId;
    return {
      policy: {
        ...policy,
        asset_id: canonicalAssetDefinitionId,
      },
      requestedAssetDefinitionId,
      resolvedAssetDefinitionId: canonicalAssetDefinitionId,
    };
  };
  try {
    return await canonicalizePolicyResult(
      await fetchConfidentialAssetPolicy(
        input.toriiUrl,
        requestedAssetDefinitionId,
      ),
    );
  } catch (error) {
    if (
      !confidentialPolicyLookupSupportsLiveAssetFallback(
        error,
        requestedAssetDefinitionId,
      )
    ) {
      throw error;
    }
    const resolvedAssetDefinitionId =
      await resolveLiveConfidentialAssetDefinitionIdForAccount({
        toriiUrl: input.toriiUrl,
        accountId: input.accountId,
        requestedAssetDefinitionId,
      });
    if (!resolvedAssetDefinitionId) {
      throw error;
    }
    return await canonicalizePolicyResult(
      await fetchConfidentialAssetPolicy(
        input.toriiUrl,
        resolvedAssetDefinitionId,
      ),
    );
  }
};

const accountTransactionsQuerySupportsCanonicalAuthFallback = (
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("HTTP 404 Not Found") ||
    message.includes("ERR_ACCOUNT_NOT_FOUND")
  );
};

const listAllAccountTransactionsForPrivateKaigi = async (input: {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
}) => {
  const client = getClient(input.toriiUrl);
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const normalizedPrivateKeyHex =
    (await resolveOptionalPrivateKeyHex({
      accountId: normalizedAccountId,
      privateKeyHex: input.privateKeyHex,
    })) ?? "";
  let canonicalAuth = normalizedPrivateKeyHex
    ? {
        accountId: normalizedAccountId,
        privateKey: hexToBuffer(normalizedPrivateKeyHex, "privateKeyHex"),
      }
    : null;
  const items: Array<Record<string, unknown>> = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    let page;
    try {
      page = await client.listAccountTransactions(normalizedAccountId, {
        limit: PRIVATE_KAIGI_ACCOUNT_TX_PAGE_SIZE,
        offset,
        ...(canonicalAuth ? { canonicalAuth } : {}),
      });
    } catch (error) {
      if (
        canonicalAuth &&
        accountTransactionsQuerySupportsCanonicalAuthFallback(error)
      ) {
        canonicalAuth = null;
        continue;
      }
      throw error;
    }
    const pageItems = Array.isArray(page?.items)
      ? (page.items as Array<Record<string, unknown>>)
      : [];
    items.push(...pageItems);
    total = Number(page?.total ?? items.length);
    offset += pageItems.length;
    if (
      pageItems.length === 0 ||
      pageItems.length < PRIVATE_KAIGI_ACCOUNT_TX_PAGE_SIZE
    ) {
      break;
    }
  }

  return items;
};

const listAllAccountTransactions = async (input: {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
}) =>
  listAllAccountTransactionsForPrivateKaigi({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
  });

const fetchAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  label = "Asset definition",
) =>
  fetchJson(
    buildNexusEndpoint(
      toriiUrlRaw,
      `/v1/assets/definitions/${encodeURIComponent(assetDefinitionId.trim())}`,
    ),
    label,
  );

const fetchPrivateKaigiAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) =>
  fetchAssetDefinition(
    toriiUrlRaw,
    assetDefinitionId,
    "Private Kaigi XOR asset definition",
  );

const optionalTrimmedString = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const literal = trimString(value);
  return literal ? literal : null;
};

const errorMessageFromUnknown = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? "");

const readNestedRecord = (
  record: Record<string, unknown>,
  path: string[],
): Record<string, unknown> | null => {
  let cursor: unknown = record;
  for (const key of path) {
    if (!isPlainRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }
  return isPlainRecord(cursor) ? cursor : null;
};

const readFirstConfigString = (
  record: Record<string, unknown> | null,
  keys: string[],
) => {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = optionalTrimmedString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
};

const readGovernanceConfigRecord = (
  configuration: unknown,
): Record<string, unknown> | null => {
  if (!isPlainRecord(configuration)) {
    return null;
  }
  for (const path of [
    ["gov"],
    ["governance"],
    ["actual", "gov"],
    ["actual", "governance"],
    ["parameters", "actual", "gov"],
    ["parameters", "actual", "governance"],
  ]) {
    const record = readNestedRecord(configuration, path);
    if (record) {
      return record;
    }
  }
  return null;
};

const fetchConfigurationSnapshot = async (toriiUrl: string) => {
  const client = getClient(toriiUrl);
  try {
    return await client.getConfiguration();
  } catch (primaryError) {
    try {
      return await fetchJson(
        buildNexusEndpoint(toriiUrl, "/configuration"),
        "Configuration",
      );
    } catch (fallbackError) {
      throw fallbackError || primaryError;
    }
  }
};

const buildDefaultGovernanceRegistrationPolicy = (
  configurationError: string | null,
): GovernanceRegistrationPolicyResponse => ({
  citizenshipAssetDefinitionId: null,
  citizenshipBondAmount: null,
  citizenshipAssetDefinitionExists: null,
  configurationLoaded: false,
  configurationError,
  assetDefinitionError: null,
});

const missingGovernanceCitizenshipAssetMessage = (assetDefinitionId: string) =>
  `Citizenship bonding is blocked because this Torii endpoint is configured to use missing governance citizenship asset definition ${assetDefinitionId}. RegisterCitizen cannot choose another asset from the wallet; ask the endpoint operator to register that asset definition or set GOV_CITIZENSHIP_ASSET_ID to the live XOR asset definition.`;

const GOVERNANCE_CITIZENSHIP_LANE_ID = 1;
const GOVERNANCE_CITIZENSHIP_DATASPACE_ID = 1;
const GOVERNANCE_ROUTE_OPERATOR_HINT =
  "For TAIRA public rollout, run configs/soranexus/taira/check_mcp_rollout.sh --public-root https://taira.sora.org --write-config <runtime-only taira-canary-client.toml> and re-render validator configs from configs/soranexus/taira/validator_roster.example.toml if route_unavailable persists.";

const citizenshipRouteUnavailableMessage = (error: unknown) => {
  const target = routeUnavailableTargetMessage(error);
  return `Citizenship bonding reached Torii, but Torii returned route_unavailable because it has no authoritative peer route for ${target}. This is endpoint lane-routing health, not a wallet or bond-amount problem. Try another healthy Torii endpoint or ask the endpoint operator to restore the authoritative peer binding for ${target}. ${GOVERNANCE_ROUTE_OPERATOR_HINT}`;
};

const readLaneGovernanceRouteNumber = (
  lane: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const raw = lane[key];
    if (typeof raw === "number" && Number.isInteger(raw)) {
      return raw;
    }
    if (typeof raw === "string" && /^\d+$/u.test(raw.trim())) {
      return Number.parseInt(raw.trim(), 10);
    }
  }
  return null;
};

const assertGovernanceCitizenshipRouteReady = async (toriiUrl: string) => {
  let status: unknown;
  try {
    status = await getClient(toriiUrl).getSumeragiStatusTyped();
  } catch {
    return;
  }
  if (!isPlainRecord(status) || !Array.isArray(status.lane_governance)) {
    return;
  }
  const governanceLane = status.lane_governance.find((entry) => {
    if (!isPlainRecord(entry)) {
      return false;
    }
    const laneId = readLaneGovernanceRouteNumber(entry, [
      "lane_id",
      "laneId",
      "lane",
    ]);
    const alias = trimString(entry.alias).toLowerCase();
    return laneId === GOVERNANCE_CITIZENSHIP_LANE_ID || alias === "governance";
  });
  if (!isPlainRecord(governanceLane)) {
    return;
  }
  const validators = Array.isArray(governanceLane.validator_ids)
    ? governanceLane.validator_ids.map(trimString).filter(Boolean)
    : [];
  if (validators.length > 0) {
    return;
  }
  const laneId =
    readLaneGovernanceRouteNumber(governanceLane, [
      "lane_id",
      "laneId",
      "lane",
    ]) ?? GOVERNANCE_CITIZENSHIP_LANE_ID;
  const dataspaceId =
    readLaneGovernanceRouteNumber(governanceLane, [
      "dataspace_id",
      "dataspaceId",
      "dataspace",
    ]) ?? GOVERNANCE_CITIZENSHIP_DATASPACE_ID;
  throw new Error(
    `Citizenship bonding is blocked because this Torii endpoint currently reports no validator ids for lane ${laneId} / dataspace ${dataspaceId}. This endpoint cannot route RegisterCitizen transactions until its governance lane has authoritative peers. ${GOVERNANCE_ROUTE_OPERATOR_HINT}`,
  );
};

const MISSING_ASSET_DEFINITION_PATTERN =
  /Failed to find asset definition:\s*`([^`]+)`/i;

const extractMissingAssetDefinitionFromError = (error: unknown) => {
  const message = errorMessageFromUnknown(error);
  const match = message.match(MISSING_ASSET_DEFINITION_PATTERN);
  return match?.[1]?.trim() || null;
};

const decorateRegisterCitizenError = (error: unknown) => {
  if (isRouteUnavailableError(error)) {
    return new Error(citizenshipRouteUnavailableMessage(error));
  }
  const missingAssetDefinitionId =
    extractMissingAssetDefinitionFromError(error);
  if (!missingAssetDefinitionId) {
    return error;
  }
  const originalMessage = errorMessageFromUnknown(error);
  return new Error(
    `${missingGovernanceCitizenshipAssetMessage(missingAssetDefinitionId)} Original error: ${originalMessage}`,
  );
};

const fetchGovernanceRegistrationPolicy = async (
  toriiUrl: string,
): Promise<GovernanceRegistrationPolicyResponse> => {
  let configuration: unknown;
  try {
    configuration = await fetchConfigurationSnapshot(toriiUrl);
  } catch (error) {
    return buildDefaultGovernanceRegistrationPolicy(
      errorMessageFromUnknown(error) || null,
    );
  }

  const governanceConfig = readGovernanceConfigRecord(configuration);
  const rawCitizenshipAssetDefinitionId = readFirstConfigString(
    governanceConfig,
    [
      "citizenship_asset_id",
      "citizenshipAssetId",
      "citizenship_asset_definition_id",
      "citizenshipAssetDefinitionId",
      "voting_asset_id",
      "votingAssetId",
    ],
  );
  const citizenshipAssetDefinitionId = rawCitizenshipAssetDefinitionId
    ? extractAssetDefinitionId(rawCitizenshipAssetDefinitionId).trim()
    : null;
  const rawBondAmount = readFirstConfigString(governanceConfig, [
    "citizenship_bond_amount",
    "citizenshipBondAmount",
  ]);
  const citizenshipBondAmount =
    rawBondAmount && /^\d+$/.test(rawBondAmount) ? rawBondAmount : null;

  if (!citizenshipAssetDefinitionId) {
    return {
      citizenshipAssetDefinitionId: null,
      citizenshipBondAmount,
      citizenshipAssetDefinitionExists: null,
      configurationLoaded: true,
      configurationError: null,
      assetDefinitionError: null,
    };
  }

  try {
    await fetchAssetDefinition(
      toriiUrl,
      citizenshipAssetDefinitionId,
      "Governance citizenship asset definition",
    );
    return {
      citizenshipAssetDefinitionId,
      citizenshipBondAmount,
      citizenshipAssetDefinitionExists: true,
      configurationLoaded: true,
      configurationError: null,
      assetDefinitionError: null,
    };
  } catch (error) {
    const errorMessage = errorMessageFromUnknown(error) || null;
    return {
      citizenshipAssetDefinitionId,
      citizenshipBondAmount,
      citizenshipAssetDefinitionExists:
        isApiRequestError(error) && error.status === 404 ? false : null,
      configurationLoaded: true,
      configurationError: null,
      assetDefinitionError: errorMessage,
    };
  }
};

const fetchConfidentialAssetRootWindow = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) => {
  const endpoint = buildNexusEndpoint(toriiUrlRaw, "/v1/zk/roots");
  const response = await nodeFetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      asset_id: assetDefinitionId,
      max: PRIVATE_KAIGI_ROOT_LOOKBACK,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail ||
        `Confidential asset root request failed with status ${response.status} (${response.statusText})`,
    );
  }
  const payload = ensureObjectResponse(
    (await response.json()) as unknown,
    "Confidential asset roots",
  );
  const recentRootsHex = Array.isArray(payload.roots)
    ? payload.roots
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter((value) => /^[0-9a-f]{64}$/.test(value))
    : [];
  const latestRootHex = String(
    payload.latest ?? recentRootsHex[recentRootsHex.length - 1] ?? "",
  )
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(latestRootHex)) {
    throw new Error(
      "Confidential asset root response did not include a recent 32-byte root.",
    );
  }
  return {
    latestRootHex,
    recentRootsHex:
      recentRootsHex.length > 0 ? recentRootsHex : [latestRootHex],
  };
};

const fetchPrivateKaigiRoots = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) =>
  (await fetchConfidentialAssetRootWindow(toriiUrlRaw, assetDefinitionId))
    .latestRootHex;

const fetchConfidentialAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) => fetchPrivateKaigiAssetDefinition(toriiUrlRaw, assetDefinitionId);

const fetchConfidentialAssetRoots = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) => fetchPrivateKaigiRoots(toriiUrlRaw, assetDefinitionId);

const fetchExplorerTransactionDetail = async (
  toriiUrlRaw: string,
  hashHex: string,
) =>
  fetchJson(
    buildNexusEndpoint(
      toriiUrlRaw,
      `/v1/explorer/transactions/${encodeURIComponent(hashHex.trim())}`,
    ),
    "Explorer transaction detail",
  );

const hydrateAccountTransactionsWithExplorerDetails = async (input: {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
}) => {
  const transactions = await listAllAccountTransactions(input);
  return await Promise.all(
    transactions.map(async (transaction) => {
      const txHash = trimString(
        (transaction as Record<string, unknown>).entrypoint_hash ??
          (transaction as Record<string, unknown>).hash,
      );
      if (!/^[0-9a-f]{64}$/i.test(txHash)) {
        return transaction;
      }
      try {
        const detail = await fetchExplorerTransactionDetail(
          input.toriiUrl,
          txHash,
        );
        return {
          ...transaction,
          ...detail,
          entrypoint_hash: txHash,
          result_ok:
            typeof (transaction as Record<string, unknown>).result_ok ===
            "boolean"
              ? (transaction as Record<string, unknown>).result_ok
              : !/^rejected$/i.test(trimString(detail.status)),
        };
      } catch {
        return transaction;
      }
    }),
  );
};

const normalizeConfidentialNoteIndexItem = (
  item: unknown,
  noteIndexOrder: number,
): WalletConfidentialTransactionLike | null => {
  if (!isPlainRecord(item)) {
    return null;
  }
  const hash = trimString(item.entrypoint_hash ?? item.transaction_hash);
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return null;
  }
  return {
    entrypoint_hash: hash,
    result_ok: item.result_ok !== false,
    authority: trimString(item.authority),
    block: Number.isFinite(Number(item.block))
      ? Math.trunc(Number(item.block))
      : undefined,
    note_index_order: noteIndexOrder,
    metadata: isPlainRecord(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : {},
    instructions: Array.isArray(item.instructions)
      ? (item.instructions.filter(isPlainRecord) as Array<
          Record<string, unknown>
        >)
      : [],
  };
};

const fetchConfidentialNoteIndexTransactions = async (input: {
  toriiUrl: string;
  assetDefinitionIds: string[];
}): Promise<WalletConfidentialTransactionLike[] | null> => {
  const byHash = new Map<string, WalletConfidentialTransactionLike>();
  let noteIndexOrder = 0;
  for (const assetDefinitionId of input.assetDefinitionIds) {
    let cursor: string | null = "";
    const seenCursors = new Set<string>();
    while (cursor !== null) {
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new Error(
            "Confidential note index returned a repeated cursor.",
          );
        }
        seenCursors.add(cursor);
      }
      const endpoint = buildNexusEndpoint(
        input.toriiUrl,
        "/v1/confidential/notes",
        {
          asset_definition_id: assetDefinitionId,
          limit: CONFIDENTIAL_NOTE_INDEX_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      );
      const response = await nodeFetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.status === 404 || response.status === 405) {
        return null;
      }
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(
          detail ||
            `Confidential note index request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = ensureObjectResponse(
        (await response.json()) as unknown,
        "Confidential note index",
      );
      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        const normalized = normalizeConfidentialNoteIndexItem(
          item,
          noteIndexOrder,
        );
        noteIndexOrder += 1;
        if (!normalized) {
          continue;
        }
        byHash.set(normalized.entrypoint_hash ?? "", normalized);
      }
      const nextCursor = trimString(payload.next_cursor);
      cursor = nextCursor || null;
    }
  }
  return [...byHash.values()];
};

const confidentialNoteIndexIncludesEntrypointHash = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
  hashHex: string;
}) => {
  const normalizedHash = trimString(input.hashHex).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedHash)) {
    throw new Error("Confidential relay wait requires a 32-byte hash.");
  }
  let cursor: string | null = "";
  const seenCursors = new Set<string>();
  while (cursor !== null) {
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error("Confidential note index returned a repeated cursor.");
      }
      seenCursors.add(cursor);
    }
    const endpoint = buildNexusEndpoint(
      input.toriiUrl,
      "/v1/confidential/notes",
      {
        asset_definition_id: input.assetDefinitionId,
        limit: CONFIDENTIAL_NOTE_INDEX_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    );
    const response = await nodeFetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (response.status === 404 || response.status === 405) {
      return false;
    }
    if (!response.ok) {
      const detail = await readApiErrorDetail(response);
      throw new Error(
        detail ||
          `Confidential note index request failed with status ${response.status} (${response.statusText})`,
      );
    }
    const payload = ensureObjectResponse(
      (await response.json()) as unknown,
      "Confidential note index",
    );
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      const normalized = normalizeConfidentialNoteIndexItem(item, 0);
      if (
        normalized &&
        normalized.result_ok !== false &&
        typeof normalized.entrypoint_hash === "string" &&
        normalized.entrypoint_hash.toLowerCase() === normalizedHash
      ) {
        return true;
      }
    }
    const nextCursor = trimString(payload.next_cursor);
    cursor = nextCursor || null;
  }
  return false;
};

const waitForConfidentialRelayCommit = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
  hashHex: string;
}) => {
  const client = getClient(input.toriiUrl);
  const deadline = Date.now() + CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS;
  let lastStatusKind: string | null = null;
  while (Date.now() <= deadline) {
    const payload = await client.getTransactionStatus(input.hashHex);
    const statusKind = extractPipelineStatusKind(payload);
    lastStatusKind = statusKind;
    if (statusKind && CONFIDENTIAL_TX_SUCCESS_STATUSES.has(statusKind)) {
      return;
    }
    if (statusKind && CONFIDENTIAL_TX_FAILURE_STATUSES.has(statusKind)) {
      throw await buildTransactionFinalityFailureError(
        input.toriiUrl,
        input.hashHex,
        statusKind,
        payload,
      );
    }
    if (
      await confidentialNoteIndexIncludesEntrypointHash({
        toriiUrl: input.toriiUrl,
        assetDefinitionId: input.assetDefinitionId,
        hashHex: input.hashHex,
      })
    ) {
      return;
    }
    if (Date.now() + CONFIDENTIAL_TX_FINALITY_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(CONFIDENTIAL_TX_FINALITY_INTERVAL_MS);
  }

  const timeoutSeconds = Math.trunc(CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS / 1000);
  throw new Error(
    lastStatusKind
      ? `Transaction ${input.hashHex} stayed in ${lastStatusKind} and did not commit within ${timeoutSeconds} seconds.`
      : `Transaction ${input.hashHex} did not commit within ${timeoutSeconds} seconds.`,
  );
};

const submitConfidentialRelayTransfer = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
  signedTransaction: Buffer | ArrayBuffer | ArrayBufferView;
}): Promise<{ hash: string; relayAuthority: string; sourceHash: string }> => {
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    "/v1/confidential/relay/submit",
  );
  const response = await nodeFetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signed_tx_hex: binaryToBuffer(input.signedTransaction).toString("hex"),
    }),
  });
  if (!response.ok) {
    const detail = await readApiErrorDetail(response);
    throw new Error(
      detail ||
        `Anonymous shielded relay request failed with status ${response.status} (${response.statusText})`,
    );
  }
  const payload = ensureObjectResponse(
    (await response.json()) as unknown,
    "Anonymous shielded relay",
  );
  const hash = trimString(payload.tx_hash_hex);
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error("Anonymous shielded relay returned an invalid hash.");
  }
  const sourceHash = trimString(payload.source_tx_hash_hex);
  if (sourceHash && !/^[0-9a-f]{64}$/i.test(sourceHash)) {
    throw new Error(
      "Anonymous shielded relay returned an invalid source hash.",
    );
  }
  await waitForConfidentialRelayCommit({
    toriiUrl: input.toriiUrl,
    assetDefinitionId: input.assetDefinitionId,
    hashHex: hash,
  });
  return {
    hash,
    relayAuthority: trimString(payload.relay_authority),
    sourceHash,
  };
};

const readConfidentialPolicyMetadata = (
  assetDefinition: Record<string, unknown>,
  label: string,
) => {
  const metadata = ensureObjectResponse(
    assetDefinition.metadata ?? {},
    `${label} asset definition metadata`,
  );
  const policyRecord =
    metadata["zk.policy"] ??
    ensureObjectResponse(metadata.zk ?? {}, "metadata.zk").policy ??
    null;
  return ensureObjectResponse(policyRecord ?? {}, `${label} asset zk.policy`);
};

const readConfidentialVkRef = (
  policy: Record<string, unknown>,
  key: "vk_transfer" | "vk_unshield" | "vk_shield",
  label: string,
) => {
  const camelKey =
    key === "vk_transfer"
      ? "vkTransfer"
      : key === "vk_unshield"
        ? "vkUnshield"
        : "vkShield";
  const rawVk = String(policy[key] ?? policy[camelKey] ?? "").trim();
  const match = /^([^:]+)::(.+)$/.exec(rawVk);
  if (!match) {
    throw new Error(`${label} asset is missing metadata.zk.policy.${key}.`);
  }
  return {
    backend: match[1],
    name: match[2],
  };
};

const readPrivateKaigiVkTransferRef = (
  assetDefinition: Record<string, unknown>,
) => {
  const policy = readConfidentialPolicyMetadata(
    assetDefinition,
    "Private Kaigi XOR",
  );
  return readConfidentialVkRef(policy, "vk_transfer", "Private Kaigi XOR");
};

const readConfidentialAllowUnshield = (
  assetDefinition: Record<string, unknown>,
) => {
  const policy = readConfidentialPolicyMetadata(
    assetDefinition,
    "Confidential",
  );
  return policy.allow_unshield !== false && policy.allowUnshield !== false;
};

const readConfidentialAllowShield = (
  assetDefinition: Record<string, unknown>,
) => {
  const policy = readConfidentialPolicyMetadata(
    assetDefinition,
    "Confidential",
  );
  return policy.allow_shield !== false && policy.allowShield !== false;
};

const readOptionalConfidentialVkLiteral = (
  assetDefinition: Record<string, unknown>,
  key: "vk_transfer" | "vk_unshield" | "vk_shield",
) => {
  const policy = readConfidentialPolicyMetadata(
    assetDefinition,
    "Confidential",
  );
  const camelKey =
    key === "vk_transfer"
      ? "vkTransfer"
      : key === "vk_unshield"
        ? "vkUnshield"
        : "vkShield";
  const literal = trimString(policy[key] ?? policy[camelKey]);
  return literal || null;
};

const readConfidentialVkUnshieldRef = (
  assetDefinition: Record<string, unknown>,
) =>
  readConfidentialVkRef(
    readConfidentialPolicyMetadata(assetDefinition, "Confidential"),
    "vk_unshield",
    "Confidential",
  );

const readConfidentialVkTransferRef = (
  assetDefinition: Record<string, unknown>,
) =>
  readConfidentialVkRef(
    readConfidentialPolicyMetadata(assetDefinition, "Confidential"),
    "vk_transfer",
    "Confidential",
  );

const mergeConfidentialPolicyWithAssetDefinition = (
  policy: ConfidentialAssetPolicyView,
  assetDefinition: Record<string, unknown>,
): ConfidentialAssetPolicyView => ({
  ...policy,
  allow_shield: readConfidentialAllowShield(assetDefinition),
  allow_unshield: readConfidentialAllowUnshield(assetDefinition),
  vk_transfer:
    readOptionalConfidentialVkLiteral(assetDefinition, "vk_transfer") ??
    policy.vk_transfer,
  vk_unshield:
    readOptionalConfidentialVkLiteral(assetDefinition, "vk_unshield") ??
    policy.vk_unshield,
  vk_shield:
    readOptionalConfidentialVkLiteral(assetDefinition, "vk_shield") ??
    policy.vk_shield,
});

const resolveTrackedConfidentialAssetIds = (input: {
  requestedAssetDefinitionId: string;
  resolvedAssetId: string;
}) => {
  const seen = new Set<string>();
  return [input.requestedAssetDefinitionId, input.resolvedAssetId]
    .map((value) => extractAssetDefinitionId(String(value ?? "")).trim())
    .filter((value) => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

const resolveConfidentialAssetBalance = async (input: {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
}): Promise<ConfidentialAssetBalanceResponse> => {
  const decryptionContext = await resolveConfidentialWalletDecryptionContext({
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Confidential balance lookup",
  });
  const { requestedAssetDefinitionId, resolvedAssetDefinitionId } =
    await fetchConfidentialAssetPolicyForAccount({
      toriiUrl: input.toriiUrl,
      accountId: decryptionContext.accountId,
      assetDefinitionId: input.assetDefinitionId,
    });
  const resolvedAssetId = resolvedAssetDefinitionId;
  const trackedAssetIds = resolveTrackedConfidentialAssetIds({
    requestedAssetDefinitionId,
    resolvedAssetId,
  });
  const noteIndexTransactions = await fetchConfidentialNoteIndexTransactions({
    toriiUrl: input.toriiUrl,
    assetDefinitionIds: trackedAssetIds,
  });
  const committedTransactions =
    noteIndexTransactions ??
    (await hydrateAccountTransactionsWithExplorerDetails({
      toriiUrl: input.toriiUrl,
      accountId: decryptionContext.accountId,
      privateKeyHex: decryptionContext.privateKeyHex,
    }));
  const scanSource =
    noteIndexTransactions === null
      ? "account-transactions"
      : "global-note-index";
  const displayTransactions = mergeConfidentialWalletShadowTransactions({
    toriiUrl: input.toriiUrl,
    accountId: decryptionContext.accountId,
    transactions: committedTransactions as WalletConfidentialTransactionLike[],
  });
  const ledger = collectWalletConfidentialLedger(displayTransactions, {
    privateKeyHex: decryptionContext.privateKeyHex,
    chainId: input.chainId,
    assetDefinitionIds: trackedAssetIds,
    receiveKeys: decryptionContext.receiveKeys,
    markUnrecognizedTransfersInexact: noteIndexTransactions === null,
  });
  const scanWatermarkBlock = displayTransactions.reduce<number | null>(
    (maxBlock, transaction) => {
      const block = Number(transaction.block);
      if (!Number.isFinite(block) || block < 0) {
        return maxBlock;
      }
      const normalizedBlock = Math.trunc(block);
      return maxBlock === null
        ? normalizedBlock
        : Math.max(maxBlock, normalizedBlock);
    },
    null,
  );
  const onChainBalance =
    noteIndexTransactions === null
      ? deriveOnChainShieldedBalance(committedTransactions, {
          assetDefinitionIds: trackedAssetIds,
          accountIds: [
            decryptionContext.accountId,
            normalizeCanonicalAccountIdLiteral(
              decryptionContext.accountId,
              "accountId",
            ),
            normalizeCompatAccountIdLiteral(
              decryptionContext.accountId,
              "accountId",
            ),
          ],
        })
      : (() => {
          const committedLedger = collectWalletConfidentialLedger(
            committedTransactions as WalletConfidentialTransactionLike[],
            {
              privateKeyHex: decryptionContext.privateKeyHex,
              chainId: input.chainId,
              assetDefinitionIds: trackedAssetIds,
              receiveKeys: decryptionContext.receiveKeys,
              markUnrecognizedTransfersInexact: false,
            },
          );
          return {
            quantity: committedLedger.spendableQuantity,
            exact: committedLedger.exact,
          };
        })();
  return {
    resolvedAssetId,
    quantity: ledger.spendableQuantity,
    onChainQuantity: onChainBalance.quantity,
    spendableQuantity: ledger.spendableQuantity,
    exact: ledger.exact,
    scanSource,
    scanStatus: ledger.exact
      ? "complete"
      : noteIndexTransactions === null
        ? "limited"
        : "incomplete",
    scanWatermarkBlock,
    recoveredNoteCount: ledger.notes.length,
    trackedAssetIds,
  };
};

const resolveConfidentialTransferMaterials = async (input: {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
}) => {
  const decryptionContext = await resolveConfidentialWalletDecryptionContext({
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Shielded transfer",
  });
  const client = getClient(input.toriiUrl);
  const balance = await resolveConfidentialAssetBalance({
    ...input,
    accountId: decryptionContext.accountId,
    privateKeyHex: decryptionContext.privateKeyHex,
  });
  const trackedAssetIds = resolveTrackedConfidentialAssetIds({
    requestedAssetDefinitionId: input.assetDefinitionId,
    resolvedAssetId: balance.resolvedAssetId,
  });
  const [noteIndexTransactions, assetDefinition, rootWindow] =
    await Promise.all([
      fetchConfidentialNoteIndexTransactions({
        toriiUrl: input.toriiUrl,
        assetDefinitionIds: trackedAssetIds,
      }),
      fetchConfidentialAssetDefinition(input.toriiUrl, balance.resolvedAssetId),
      fetchConfidentialAssetRootWindow(input.toriiUrl, balance.resolvedAssetId),
    ]);
  if (noteIndexTransactions === null) {
    throw new Error(
      "Confidential note index is unavailable for this asset; recipient shielded transfers require the global note index.",
    );
  }
  const ledger = collectWalletConfidentialLedger(noteIndexTransactions, {
    privateKeyHex: decryptionContext.privateKeyHex,
    chainId: input.chainId,
    assetDefinitionIds: trackedAssetIds,
    receiveKeys: decryptionContext.receiveKeys,
    markUnrecognizedTransfersInexact: false,
  });
  const vkTransferRef = readConfidentialVkTransferRef(assetDefinition);
  const verifyingKey = await client.getVerifyingKeyTyped(
    vkTransferRef.backend,
    vkTransferRef.name,
  );
  return {
    resolvedAssetId: balance.resolvedAssetId,
    trackedAssetIds,
    ledger,
    latestRootHex: rootWindow.latestRootHex,
    recentRootHexes: rootWindow.recentRootsHex,
    verifyingKey: verifyingKey as unknown as Record<string, unknown>,
  };
};

const resolveConfidentialUnshieldMaterials = async (input: {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
}) => {
  const decryptionContext = await resolveConfidentialWalletDecryptionContext({
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Confidential public exit",
  });
  const client = getClient(input.toriiUrl);
  const balance = await resolveConfidentialAssetBalance({
    ...input,
    accountId: decryptionContext.accountId,
    privateKeyHex: decryptionContext.privateKeyHex,
  });
  const trackedAssetIds = resolveTrackedConfidentialAssetIds({
    requestedAssetDefinitionId: input.assetDefinitionId,
    resolvedAssetId: balance.resolvedAssetId,
  });
  const [noteIndexTransactions, assetDefinition, latestRootHex] =
    await Promise.all([
      fetchConfidentialNoteIndexTransactions({
        toriiUrl: input.toriiUrl,
        assetDefinitionIds: trackedAssetIds,
      }),
      fetchConfidentialAssetDefinition(input.toriiUrl, balance.resolvedAssetId),
      fetchConfidentialAssetRoots(input.toriiUrl, balance.resolvedAssetId),
    ]);
  if (noteIndexTransactions === null) {
    throw new Error(
      "Confidential note index is unavailable for this asset; unshielding requires the global note index.",
    );
  }
  if (!readConfidentialAllowUnshield(assetDefinition)) {
    throw new Error("Confidential unshield is not enabled for this asset.");
  }
  const ledger = collectWalletConfidentialLedger(noteIndexTransactions, {
    privateKeyHex: decryptionContext.privateKeyHex,
    chainId: input.chainId,
    assetDefinitionIds: trackedAssetIds,
    receiveKeys: decryptionContext.receiveKeys,
    markUnrecognizedTransfersInexact: false,
  });
  const vkUnshieldRef = readConfidentialVkUnshieldRef(assetDefinition);
  const verifyingKey = await client.getVerifyingKeyTyped(
    vkUnshieldRef.backend,
    vkUnshieldRef.name,
  );
  return {
    resolvedAssetId: balance.resolvedAssetId,
    trackedAssetIds,
    ledger,
    latestRootHex,
    verifyingKey: verifyingKey as unknown as Record<string, unknown>,
  };
};

const readInlineVerifyingKeyRecord = (value: Record<string, unknown>) => {
  const record = isPlainRecord(value.record)
    ? (value.record as Record<string, unknown>)
    : {};
  const inlineKey = isPlainRecord(record.inline_key)
    ? (record.inline_key as Record<string, unknown>)
    : isPlainRecord(value.inline_key)
      ? (value.inline_key as Record<string, unknown>)
      : null;
  if (!inlineKey) {
    throw new Error("Confidential verifying key inline_key is unavailable.");
  }
  return {
    record,
    inlineKey,
  };
};

const normalizeConfidentialCircuitId = (value: unknown): string =>
  trimString(value)
    .toLowerCase()
    .replace(/^halo2\/pasta\/(?!ipa\/)/, "halo2/pasta/ipa/")
    .replace(/^halo2\/pasta\/ipa\/ipa\//, "halo2/pasta/ipa/");

const isConfidentialUnshieldV2CircuitId = (circuitId: string): boolean =>
  CONFIDENTIAL_UNSHIELD_V2_CIRCUIT_IDS.has(circuitId);

const isConfidentialUnshieldV3CircuitId = (circuitId: string): boolean =>
  CONFIDENTIAL_UNSHIELD_V3_CIRCUIT_IDS.has(circuitId);

const readConfidentialVerifyingKeyContext = (
  value: Record<string, unknown>,
) => {
  const { record, inlineKey } = readInlineVerifyingKeyRecord(value);
  const id =
    isPlainRecord(value.id) && !Array.isArray(value.id)
      ? (value.id as Record<string, unknown>)
      : {};
  const backend = trimString(id.backend) || "halo2/ipa";
  const circuitId = normalizeConfidentialCircuitId(
    record.circuit_id ?? record.circuitId,
  );
  return {
    record,
    inlineKey,
    backend,
    circuitId,
    proofVerifyingKey: {
      id: {
        backend,
        name: trimString(id.name),
      },
      record,
      inline_key: inlineKey,
    },
  };
};

const uranaiPrivateTradeProofSchema =
  "uranai.irohaconnect.private-trade-proof.v1" as const;

const privateTradeProofName = (prefix: string, parts: string[]) =>
  `${prefix}-${createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 48)}`;

const buildUranaiPrivateTradeProofEnvelope = async (
  input: UranaiPrivateTradeProofInput,
): Promise<UranaiPrivateTradeProofResponse> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
  });
  const chainId = writeConnection.chainId;
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const collateralIn = trimString(input.collateralIn);
  const privacyFee = trimString(input.privacyFee || "0");
  if (!/^\d+$/.test(collateralIn) || BigInt(collateralIn) <= 0n) {
    throw new Error(
      "Uranai private trade collateral must be a positive whole-number amount.",
    );
  }
  if (!/^\d+$/.test(privacyFee)) {
    throw new Error(
      "Uranai private trade privacy fee must be a whole-number amount.",
    );
  }
  const spendAmount = (BigInt(collateralIn) + BigInt(privacyFee)).toString();
  if (!isPositiveWholeAmount(spendAmount)) {
    throw new Error(
      "Uranai private trade spend amount must be greater than zero.",
    );
  }
  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
      operationLabel: "Uranai private trade proof",
    }),
    "Uranai private trade proof",
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  const privateKey = hexToBuffer(privateKeyHex, "privateKeyHex");
  const materials = await resolveConfidentialUnshieldMaterials({
    toriiUrl: input.toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    assetDefinitionId: input.assetDefinitionId,
  });
  if (BigInt(materials.ledger.spendableQuantity) < BigInt(spendAmount)) {
    throw new Error(
      `Shielded spendable balance is ${materials.ledger.spendableQuantity} in ${materials.resolvedAssetId}, but ${spendAmount} is required.`,
    );
  }

  const verifyingKeyContext = readConfidentialVerifyingKeyContext(
    materials.verifyingKey,
  );
  let proofEnvelope:
    | ReturnType<typeof buildConfidentialUnshieldProofV2>
    | ReturnType<typeof buildConfidentialUnshieldProofV3>;
  let outputCommitments: ReadonlyArray<Buffer> = [];

  if (isConfidentialUnshieldV2CircuitId(verifyingKeyContext.circuitId)) {
    const selection = selectWalletConfidentialNotesForExactAmount(
      materials.ledger.notes,
      spendAmount,
    );
    proofEnvelope = buildConfidentialUnshieldProofV2({
      chainId,
      assetDefinitionId: materials.resolvedAssetId,
      spendKey: privateKey,
      treeCommitments: materials.ledger.treeCommitmentsHex,
      inputs: selection.selected.map((note) => ({
        amount: note.amount,
        rhoHex: note.rho_hex,
        diversifierHex: note.diversifier_hex,
        leafIndex: note.leaf_index,
      })),
      publicAmount: spendAmount,
      rootHintHex: materials.latestRootHex,
      verifyingKey: verifyingKeyContext.proofVerifyingKey,
    });
  } else if (isConfidentialUnshieldV3CircuitId(verifyingKeyContext.circuitId)) {
    const selection = selectWalletConfidentialNotes(
      materials.ledger.notes,
      spendAmount,
    );
    const changeOutputs: Array<{
      note: ReturnType<typeof createWalletConfidentialNote>;
    }> = [];
    if (selection.change !== "0") {
      const changeDescriptor = await createStoredConfidentialReceiveDescriptor({
        accountId,
        privateKeyHex,
        operationLabel: "Uranai private trade proof",
      });
      changeOutputs.push({
        note: createWalletConfidentialNote({
          assetDefinitionId: materials.resolvedAssetId,
          amount: selection.change,
          ownerTagHex: changeDescriptor.ownerTagHex,
          diversifierHex: changeDescriptor.diversifierHex,
        }),
      });
    }
    const unshieldV3Proof = buildConfidentialUnshieldProofV3({
      chainId,
      assetDefinitionId: materials.resolvedAssetId,
      spendKey: privateKey,
      treeCommitments: materials.ledger.treeCommitmentsHex,
      inputs: selection.selected.map((note) => ({
        amount: note.amount,
        rhoHex: note.rho_hex,
        diversifierHex: note.diversifier_hex,
        leafIndex: note.leaf_index,
      })),
      outputs: changeOutputs.map(({ note }) => ({
        amount: note.amount,
        rhoHex: note.rho_hex,
      })),
      publicAmount: spendAmount,
      rootHintHex: materials.latestRootHex,
      verifyingKey: verifyingKeyContext.proofVerifyingKey,
    });
    proofEnvelope = unshieldV3Proof;
    outputCommitments = unshieldV3Proof.outputCommitments;
  } else {
    throw new Error(
      `Unsupported confidential verifier circuit ${verifyingKeyContext.circuitId || "(missing circuit id)"}.`,
    );
  }

  const nullifiersHex = proofEnvelope.nullifiers.map((entry) => toHex(entry));
  const outputCommitmentsHex = outputCommitments.map((entry) => toHex(entry));
  const proofEnv = Buffer.from(proofEnvelope.proof).toString("base64");
  const proofHash = createHash("sha256")
    .update(Buffer.from(proofEnvelope.proof))
    .digest("hex");
  const contextParts = [
    accountId,
    materials.resolvedAssetId,
    spendAmount,
    trimString(input.marketId),
    String(input.outcomeIndex ?? ""),
    materials.latestRootHex,
    proofHash,
  ];

  return {
    schema: uranaiPrivateTradeProofSchema,
    accountId,
    assetDefinitionId: input.assetDefinitionId,
    resolvedAssetId: materials.resolvedAssetId,
    spendAmount,
    inputNullifier: privateTradeProofName("nf", [
      ...contextParts,
      ...nullifiersHex,
    ]),
    outputNoteCommitment: outputCommitmentsHex[0]
      ? privateTradeProofName("note", [outputCommitmentsHex[0]])
      : privateTradeProofName("note", contextParts),
    positionCommitment: privateTradeProofName("pos", contextParts),
    proofEnv,
    proofEnvEncoding: "base64",
    rootHintHex: materials.latestRootHex,
    nullifiersHex,
    outputCommitmentsHex,
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for a future explicit consolidation UI action.
const submitConfidentialSelfConsolidation = async (input: {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
  notes: Array<WalletSpendableConfidentialNote>;
}) => {
  if (input.notes.length !== 2) {
    throw new Error("Confidential consolidation requires exactly two notes.");
  }
  const materials = await resolveConfidentialTransferMaterials({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    assetDefinitionId: input.assetDefinitionId,
  });
  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: "Confidential consolidation",
    }),
    "Confidential consolidation",
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  const privateKey = hexToBuffer(privateKeyHex, "privateKeyHex");
  const receiveDescriptor = await createStoredConfidentialReceiveDescriptor({
    accountId: input.accountId,
    privateKeyHex,
    operationLabel: "Confidential consolidation",
  });
  const totalAmount = input.notes
    .reduce((sum, note) => sum + BigInt(note.amount), 0n)
    .toString();
  const output = {
    note: createWalletConfidentialNote({
      assetDefinitionId: materials.resolvedAssetId,
      amount: totalAmount,
      ownerTagHex: receiveDescriptor.ownerTagHex,
      diversifierHex: receiveDescriptor.diversifierHex,
    }),
    receiveKeyId: receiveDescriptor.receiveKeyId,
    recipientPublicKeyBase64Url: receiveDescriptor.receivePublicKeyBase64Url,
  };
  const verifyingKeyContext = readConfidentialVerifyingKeyContext(
    materials.verifyingKey,
  );
  const proofEnvelope = buildConfidentialTransferProofV2({
    chainId: input.chainId.trim(),
    assetDefinitionId: materials.resolvedAssetId,
    spendKey: privateKey,
    treeCommitments: materials.ledger.treeCommitmentsHex,
    inputs: input.notes.map((note) => ({
      amount: note.amount,
      rhoHex: note.rho_hex,
      diversifierHex: note.diversifier_hex,
      leafIndex: note.leaf_index,
    })),
    outputs: [
      {
        amount: output.note.amount,
        rhoHex: output.note.rho_hex,
        ownerTagHex: output.note.owner_tag_hex,
      },
    ],
    rootHintHex: materials.latestRootHex,
    verifyingKey: verifyingKeyContext.proofVerifyingKey,
  });
  const metadata = buildWalletConfidentialMetadataV3({
    baseMetadata: withRequiredGasAssetMetadata(undefined, input.toriiUrl),
    outputs: [output],
  });
  const tx = buildZkTransferTransaction({
    chainId: input.chainId,
    authority: input.accountId,
    transfer: {
      assetDefinitionId: materials.resolvedAssetId,
      inputs: proofEnvelope.nullifiers,
      outputs: proofEnvelope.outputCommitments,
      proof: {
        backend: verifyingKeyContext.backend,
        proof: Buffer.from(proofEnvelope.proof),
        verifyingKeyRef: verifyingKeyContext.proofVerifyingKey.id,
      },
      rootHint: Buffer.from(materials.latestRootHex, "hex"),
    },
    metadata,
    privateKey,
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitConfidentialRelayTransfer({
    toriiUrl: input.toriiUrl,
    assetDefinitionId: materials.resolvedAssetId,
    signedTransaction: tx.signedTransaction,
  });
  upsertConfidentialWalletShadowTransaction({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    txHash: submission.hash,
    authority: submission.relayAuthority || "confidential-relay",
    metadata,
    instructions: [
      {
        zk: {
          ZkTransfer: {
            asset: materials.resolvedAssetId,
            inputs: proofEnvelope.nullifiers.map((entry) =>
              entry.toString("hex"),
            ),
            outputs: [output.note.commitment_hex],
          },
        },
      },
    ],
    createdAtMs: output.note.created_at_ms,
  });
  const latestRootHex = await fetchConfidentialAssetRoots(
    input.toriiUrl,
    materials.resolvedAssetId,
  );
  return {
    hash: submission.hash,
    output,
    resolvedAssetId: materials.resolvedAssetId,
    latestRootHex,
  };
};

const readPrivateKaigiFeeSchedule = (
  configuration: Record<string, unknown> | null,
) => {
  const nexus =
    configuration &&
    typeof configuration.nexus === "object" &&
    configuration.nexus &&
    !Array.isArray(configuration.nexus)
      ? (configuration.nexus as Record<string, unknown>)
      : {};
  const fees =
    typeof nexus.fees === "object" && nexus.fees && !Array.isArray(nexus.fees)
      ? (nexus.fees as Record<string, unknown>)
      : {};
  const enabled =
    nexus.enabled === undefined || nexus.enabled === null
      ? true
      : Boolean(nexus.enabled);
  return {
    enabled,
    baseFee: parseNonNegativeConfigAmount(
      fees.base_fee ?? fees.baseFee ?? "0",
      "nexus.fees.base_fee",
    ),
    perByteFee: parseNonNegativeConfigAmount(
      fees.per_byte_fee ?? fees.perByteFee ?? "0",
      "nexus.fees.per_byte_fee",
    ),
    perInstructionFee: parseNonNegativeConfigAmount(
      fees.per_instruction_fee ?? fees.perInstructionFee ?? "0",
      "nexus.fees.per_instruction_fee",
    ),
    perGasUnitFee: parseNonNegativeConfigAmount(
      fees.per_gas_unit_fee ?? fees.perGasUnitFee ?? "0",
      "nexus.fees.per_gas_unit_fee",
    ),
  };
};

const computePrivateKaigiFeeAmount = (input: {
  enabled: boolean;
  baseFee: string;
  perByteFee: string;
  perInstructionFee: string;
  perGasUnitFee: string;
  txByteLength: number;
  gasUsed: number;
}) => {
  if (!input.enabled) {
    return "0";
  }
  let fee = parseDecimalAmount(input.baseFee, "baseFee");
  fee = addDecimalAmounts(
    fee,
    multiplyDecimalAmountByInteger(
      parseDecimalAmount(input.perByteFee, "perByteFee"),
      input.txByteLength,
    ),
  );
  fee = addDecimalAmounts(
    fee,
    multiplyDecimalAmountByInteger(
      parseDecimalAmount(input.perInstructionFee, "perInstructionFee"),
      1,
    ),
  );
  fee = addDecimalAmounts(
    fee,
    multiplyDecimalAmountByInteger(
      parseDecimalAmount(input.perGasUnitFee, "perGasUnitFee"),
      input.gasUsed,
    ),
  );
  return formatDecimalAmount(fee);
};

const resolveTransparentXorBalance = (
  items: Array<{ asset_id: string; quantity: string }>,
  trackedAssetIds: string[],
) => {
  const targets = trackedAssetIds.map((value) => value.toLowerCase());
  return (
    items.find((asset) => {
      const assetId = String(asset.asset_id ?? "")
        .trim()
        .toLowerCase();
      return targets.some(
        (target) =>
          assetId === target ||
          assetId.startsWith(`${target}##`) ||
          assetId.includes(target),
      );
    })?.quantity ?? "0"
  );
};

async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    accountId: string;
  },
  options: {
    includeFeeMaterials: true;
  },
): Promise<PrivateKaigiConfidentialXorFeeContext>;
async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    accountId: string;
  },
  options?: {
    includeFeeMaterials?: boolean;
  },
): Promise<PrivateKaigiConfidentialXorContext>;
async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    accountId: string;
  },
  options?: {
    includeFeeMaterials?: boolean;
  },
): Promise<
  PrivateKaigiConfidentialXorContext | PrivateKaigiConfidentialXorFeeContext
> {
  const { policy, requestedAssetDefinitionId, resolvedAssetDefinitionId } =
    await fetchConfidentialAssetPolicyForAccount({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      assetDefinitionId: PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID,
    });
  const policyMode = String(
    policy.effective_mode ?? policy.current_mode ?? "",
  ).trim();
  const resolvedAssetId = resolvedAssetDefinitionId;
  const trackedAssetIds = [requestedAssetDefinitionId, resolvedAssetId].filter(
    (value, index, items) =>
      value && items.findIndex((candidate) => candidate === value) === index,
  );
  const [assetsResponse, transactions] = await Promise.all([
    fetchAccountAssetsList({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      limit: 200,
    }),
    listAllAccountTransactionsForPrivateKaigi({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
    }),
  ]);
  const shieldedBalance = deriveOnChainShieldedBalance(transactions, {
    assetDefinitionIds: trackedAssetIds,
    accountIds: [
      input.accountId,
      normalizeCanonicalAccountIdLiteral(input.accountId, "accountId"),
      normalizeCompatAccountIdLiteral(input.accountId, "accountId"),
    ],
  });
  const shadowKey = getPrivateKaigiShadowKey({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId: resolvedAssetId,
  });
  const shadowState = readPrivateKaigiShadowState(shadowKey);
  let effectiveShieldedBalance: string | null = shieldedBalance.quantity;
  if (shieldedBalance.exact && shieldedBalance.quantity !== null) {
    syncPrivateKaigiShadowState(shadowState, shieldedBalance.quantity);
    writePrivateKaigiShadowState(shadowKey, shadowState);
    effectiveShieldedBalance = computePrivateKaigiEffectiveShieldedBalance({
      onChainShieldedBalance: shieldedBalance.quantity,
      shadowState,
    });
  }
  const state: PrivateKaigiConfidentialXorState = {
    assetDefinitionId: PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID,
    resolvedAssetId,
    policyMode,
    shieldedBalance: effectiveShieldedBalance,
    shieldedBalanceExact: shieldedBalance.exact,
    transparentBalance: resolveTransparentXorBalance(
      assetsResponse.items ?? [],
      trackedAssetIds,
    ),
    canSelfShield:
      confidentialModeSupportsShield(policyMode) &&
      compareDecimalStrings(
        resolveTransparentXorBalance(
          assetsResponse.items ?? [],
          trackedAssetIds,
        ),
        "0",
      ) > 0,
    ...(shieldedBalance.exact
      ? {}
      : {
          message:
            "Shielded XOR balance is unavailable after confidential transfers. This wallet does not scan confidential notes yet.",
        }),
  };

  if (!options?.includeFeeMaterials) {
    return { state };
  }

  const client = getClient(input.toriiUrl);
  const [assetDefinition, latestRootHex, configuration] = await Promise.all([
    fetchPrivateKaigiAssetDefinition(input.toriiUrl, resolvedAssetId),
    fetchPrivateKaigiRoots(input.toriiUrl, resolvedAssetId),
    client.getConfiguration(),
  ]);
  const vkTransferRef = readPrivateKaigiVkTransferRef(assetDefinition);
  const verifyingKey = await client.getVerifyingKeyTyped(
    vkTransferRef.backend,
    vkTransferRef.name,
  );

  const configurationRecord =
    configuration &&
    typeof configuration === "object" &&
    !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>)
      : null;

  return {
    state,
    latestRootHex,
    verifyingKey: verifyingKey as unknown as Record<string, unknown>,
    feeSchedule: readPrivateKaigiFeeSchedule(configurationRecord),
  };
}

const submitInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authorityAccountId: string;
  privateKeyHex?: string;
  signingAlgorithm?: string;
  instruction: Record<string, unknown>;
}) => {
  const chainId = input.chainId.trim();
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  const authority = normalizeCompatAccountIdLiteral(
    input.authorityAccountId,
    "authorityAccountId",
  );
  const signingMaterial = await resolveSigningMaterial({
    accountId: authority,
    privateKeyHex: input.privateKeyHex,
    signingAlgorithm: input.signingAlgorithm,
    operationLabel: "Transaction submission",
  });
  const tx = buildTransaction({
    chainId,
    authority,
    instructions: [input.instruction],
    metadata: withRequiredGasAssetMetadata(undefined, input.toriiUrl),
    privateKey: hexToBuffer(signingMaterial.privateKeyHex, "privateKeyHex"),
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAndWaitForCommit(
    input.toriiUrl,
    tx.signedTransaction,
  );
  return transactionSubmissionResult(submission);
};

const createPrivateKaigiNonce = () => {
  let value = randomBytes(4).readUInt32BE(0);
  if (value === 0) {
    value = 1;
  }
  return value;
};

// Bootstrap with a deterministic zeroed envelope so we can obtain the
// action hash and initial byte size before the real fee spend is derived.
const buildPrivateKaigiBootstrapFeeSpendDto = (input: {
  assetDefinitionId: string;
  anchorRootHex: string;
}) => ({
  asset_definition_id: input.assetDefinitionId,
  anchor_root: canonicalHashLiteralFromHex(
    input.anchorRootHex,
    "privateKaigi.bootstrap.anchorRootHex",
  ),
  nullifiers: [Array.from({ length: 32 }, () => 0)],
  output_commitments: [Array.from({ length: 32 }, () => 0)],
  encrypted_change_payloads: [[0]],
  proof: Buffer.alloc(25).toString("base64"),
});

const buildPrivateKaigiArtifactsDto = (input: {
  commitmentHex: string;
  nullifierHex: string;
  issuedAtMs: number;
  rosterRootHex: string;
  proofBase64: string;
}) => ({
  commitment: {
    commitment: canonicalHashLiteralFromHex(
      input.commitmentHex,
      "privateKaigi.commitment",
    ),
  },
  nullifier: {
    digest: canonicalHashLiteralFromHex(
      input.nullifierHex,
      "privateKaigi.nullifier",
    ),
    issued_at_ms: input.issuedAtMs,
  },
  roster_root: canonicalHashLiteralFromHex(
    input.rosterRootHex,
    "privateKaigi.rosterRoot",
  ),
  proof: normalizeBase64String(input.proofBase64, "privateKaigi.proof"),
});

const buildPrivateKaigiFeeSpendDto = (input: {
  asset_definition_id: string;
  anchor_root: Buffer | ArrayBuffer | ArrayBufferView;
  nullifiers: ReadonlyArray<Buffer | ArrayBuffer | ArrayBufferView>;
  output_commitments: ReadonlyArray<Buffer | ArrayBuffer | ArrayBufferView>;
  encrypted_change_payloads: ReadonlyArray<
    Buffer | ArrayBuffer | ArrayBufferView
  >;
  proof: Buffer | ArrayBuffer | ArrayBufferView;
}) => ({
  asset_definition_id: input.asset_definition_id,
  anchor_root: canonicalHashLiteralFromBuffer(
    binaryToBuffer(input.anchor_root),
  ),
  nullifiers: input.nullifiers.map((entry) => toJsonByteArray(entry)),
  output_commitments: input.output_commitments.map((entry) =>
    toJsonByteArray(entry),
  ),
  encrypted_change_payloads: input.encrypted_change_payloads.map((entry) =>
    toJsonByteArray(entry),
  ),
  proof: binaryToBuffer(input.proof).toString("base64"),
});

const buildFundedPrivateKaigiEntrypoint = async (input: {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  action: "create" | "join" | "end";
  proofByteLength: number;
  buildEntrypoint: (options: {
    feeSpend: Record<string, unknown>;
    creationTimeMs: number;
    nonce: number;
  }) => {
    transactionEntrypoint: Buffer;
    hash: Buffer;
    actionHash: Buffer;
  };
}) => {
  const context = await resolvePrivateKaigiConfidentialXorContext(
    {
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
    },
    { includeFeeMaterials: true },
  );
  if (!confidentialModeSupportsShield(context.state.policyMode)) {
    throw new Error(
      `Private Kaigi requires confidential XOR shielding support, but the effective mode is ${context.state.policyMode}.`,
    );
  }
  if (
    !context.state.shieldedBalanceExact ||
    context.state.shieldedBalance === null
  ) {
    throw new Error(
      context.state.message ||
        "Shielded XOR balance is unavailable for private Kaigi fee payment.",
    );
  }

  const creationTimeMs = Date.now();
  const nonce = createPrivateKaigiNonce();
  const provisional = input.buildEntrypoint({
    feeSpend: buildPrivateKaigiBootstrapFeeSpendDto({
      assetDefinitionId: context.state.resolvedAssetId,
      anchorRootHex: context.latestRootHex,
    }),
    creationTimeMs,
    nonce,
  });
  const gasUsed = computePrivateKaigiInstructionGas({
    action: input.action,
    proofByteLength: input.proofByteLength,
  });

  let feeAmount = "0";
  let finalEntrypoint = provisional;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const verifyingKeyContext = readInlineVerifyingKeyRecord(
      context.verifyingKey,
    );
    const feeSpendVerifyingKey = {
      id: context.verifyingKey.id,
      record: verifyingKeyContext.record,
      inline_key: verifyingKeyContext.inlineKey,
    };
    const envelope = buildPrivateKaigiFeeSpend({
      chainId: input.chainId.trim(),
      assetDefinitionId: context.state.resolvedAssetId,
      actionHash: provisional.actionHash,
      anchorRootHex: context.latestRootHex,
      feeAmount,
      verifyingKey: feeSpendVerifyingKey,
    });
    finalEntrypoint = input.buildEntrypoint({
      feeSpend: buildPrivateKaigiFeeSpendDto(envelope),
      creationTimeMs,
      nonce,
    });
    const nextFeeAmount = computePrivateKaigiFeeAmount({
      ...context.feeSchedule,
      txByteLength: finalEntrypoint.transactionEntrypoint.length,
      gasUsed,
    });
    if (nextFeeAmount === feeAmount) {
      feeAmount = nextFeeAmount;
      break;
    }
    feeAmount = nextFeeAmount;
  }

  if (compareDecimalStrings(context.state.shieldedBalance, feeAmount) < 0) {
    throw new Error(
      `Private Kaigi needs ${feeAmount} shielded XOR in ${context.state.resolvedAssetId}, but only ${context.state.shieldedBalance} is available. Self-shield XOR first.`,
    );
  }

  return {
    transactionEntrypoint: finalEntrypoint.transactionEntrypoint,
    hashHex: Buffer.from(finalEntrypoint.hash).toString("hex"),
    feeAmount,
    resolvedAssetId: context.state.resolvedAssetId,
  };
};

const readShieldedRecipientDescriptor = (
  input: TransferAssetInput,
): {
  ownerTagHex: string;
  diversifierHex: string;
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
} | null => {
  const nestedRecipient = isPlainRecord(input.shieldedRecipient)
    ? input.shieldedRecipient
    : null;
  const receiveKeyId = trimString(
    nestedRecipient?.receiveKeyId ?? input.shieldedReceiveKeyId,
  );
  const receivePublicKeyBase64Url = trimString(
    nestedRecipient?.receivePublicKeyBase64Url ??
      input.shieldedReceivePublicKeyBase64Url,
  );
  const ownerTagHex = trimString(
    nestedRecipient?.ownerTagHex ?? input.shieldedOwnerTagHex,
  ).toLowerCase();
  const diversifierHex = trimString(
    nestedRecipient?.diversifierHex ?? input.shieldedDiversifierHex,
  ).toLowerCase();
  if (
    !receiveKeyId &&
    !receivePublicKeyBase64Url &&
    !ownerTagHex &&
    !diversifierHex
  ) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(ownerTagHex)) {
    throw new Error(
      "Shielded recipient QR is missing a valid owner tag. Ask the recipient to refresh their Receive QR code.",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(diversifierHex)) {
    throw new Error(
      "Shielded recipient QR is missing a valid diversifier. Ask the recipient to refresh their Receive QR code.",
    );
  }
  if (!receiveKeyId || !receivePublicKeyBase64Url) {
    throw new Error(
      "Shielded recipient QR is missing its receive key. Ask the recipient to refresh their Receive QR code.",
    );
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(receiveKeyId)) {
    throw new Error("Shielded recipient receive key id is invalid.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(receivePublicKeyBase64Url)) {
    throw new Error(
      "Shielded recipient QR is missing a valid receive public key.",
    );
  }
  return {
    receiveKeyId,
    receivePublicKeyBase64Url,
    ownerTagHex,
    diversifierHex,
  };
};

const api: IrohaBridge = {
  getRuntimeConfig() {
    return getRuntimeConfigSnapshot();
  },
  async ping(config) {
    const client = getClient(config.toriiUrl);
    return client.getHealth().catch(() => null);
  },
  async getChainMetadata(config) {
    return fetchChainMetadata(config.toriiUrl);
  },
  async getSigningAlgorithms(config) {
    return resolveSigningAlgorithmOptions(config);
  },
  generateKeyPair(input = {}) {
    const signingAlgorithm = normalizeBridgeSigningAlgorithm(
      input.signingAlgorithm,
    );
    const seedHex = trimString(input.seedHex);
    const { publicKey, privateKey } = generateSdkKeyPair({
      algorithm: signingAlgorithm,
      ...(seedHex ? { seed: hexToBuffer(seedHex, "seedHex") } : {}),
    });
    return {
      publicKeyHex: toHex(publicKey),
      privateKeyHex: toHex(privateKey),
      signingAlgorithm,
    };
  },
  generateKaigiSignalKeyPair() {
    return generateKaigiX25519KeyPair();
  },
  async isSecureVaultAvailable() {
    return await isSecureVaultAvailable();
  },
  async storeAccountSecret({ accountId, privateKeyHex, signingAlgorithm }) {
    await storeAccountSecretInVault({
      accountId: normalizeCompatAccountIdLiteral(accountId, "accountId"),
      privateKeyHex,
      signingAlgorithm: normalizeBridgeSigningAlgorithm(signingAlgorithm),
    });
  },
  async listAccountSecretFlags({ accountIds }) {
    return await listAccountSecretFlagsFromVault(
      (Array.isArray(accountIds) ? accountIds : []).map((accountId) =>
        normalizeCompatAccountIdLiteral(accountId, "accountId"),
      ),
    );
  },
  async copyTextToClipboard({ text }) {
    const value = String(text ?? "");
    if (!value) {
      throw new Error("Clipboard text is required.");
    }
    clipboard.writeText(value);
  },
  deriveAccountAddress({
    domain,
    publicKeyHex,
    networkPrefix,
    signingAlgorithm,
  }) {
    return deriveAccountAddressView({
      domain,
      publicKeyHex,
      networkPrefix,
      signingAlgorithm: normalizeBridgeSigningAlgorithm(signingAlgorithm),
    });
  },
  derivePublicKey(input) {
    const privateKeyHex =
      typeof input === "string" ? input : input.privateKeyHex;
    const signingAlgorithm =
      typeof input === "string"
        ? DEFAULT_SIGNING_ALGORITHM
        : normalizeBridgeSigningAlgorithm(input.signingAlgorithm);
    const publicKey = publicKeyFromPrivate(
      hexToBuffer(privateKeyHex, "privateKeyHex"),
      { algorithm: signingAlgorithm },
    );
    return { publicKeyHex: toHex(publicKey), signingAlgorithm };
  },
  deriveConfidentialOwnerTag(privateKeyHex) {
    return {
      ownerTagHex: deriveWalletConfidentialOwnerTagHex({ privateKeyHex }),
    };
  },
  deriveConfidentialReceiveAddress(privateKeyHex) {
    return deriveWalletConfidentialReceiveAddress({ privateKeyHex });
  },
  async resolveAccountAlias(input) {
    return resolveAccountAliasSelector(input);
  },
  async createConfidentialPaymentAddress({ accountId, privateKeyHex }) {
    await assertSecureVaultAvailable("Confidential payment address creation");
    const descriptor = await createStoredConfidentialReceiveDescriptor({
      accountId,
      privateKeyHex,
      operationLabel: "Confidential payment address creation",
    });
    return {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: descriptor.receiveKeyId,
      receivePublicKeyBase64Url: descriptor.receivePublicKeyBase64Url,
      shieldedOwnerTagHex: descriptor.ownerTagHex,
      shieldedDiversifierHex: descriptor.diversifierHex,
      recoveryHint: "one-time-receive-key",
    };
  },
  async exportConfidentialWalletBackup({
    toriiUrl,
    chainId,
    accountId,
    mnemonic,
  }) {
    await assertSecureVaultAvailable("Confidential wallet backup export");
    const normalizedAccountId = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    const normalizedChainId = trimString(chainId);
    if (!normalizedChainId) {
      throw new Error("chainId is required.");
    }
    const receiveKeys =
      await listConfidentialReceiveKeysForAccount(normalizedAccountId);
    const shadowState = readConfidentialWalletShadowState(
      getConfidentialWalletShadowKey({
        toriiUrl,
        accountId: normalizedAccountId,
      }),
    );
    const accountTransactions = await listAllAccountTransactions({
      toriiUrl,
      accountId: normalizedAccountId,
    }).catch(() => [] as Array<Record<string, unknown>>);
    const scanWatermarkBlock = accountTransactions.reduce<number | null>(
      (highest, transaction) => {
        const block = Number(transaction.block);
        if (!Number.isFinite(block) || block < 0) {
          return highest;
        }
        const normalizedBlock = Math.trunc(block);
        return highest === null || normalizedBlock > highest
          ? normalizedBlock
          : highest;
      },
      null,
    );
    return {
      schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
      chainId: normalizedChainId,
      accountId: normalizedAccountId,
      scanWatermarkBlock,
      stateBox: encryptConfidentialWalletBackupState(
        {
          receiveKeys: receiveKeys.map((record) => ({
            keyId: record.keyId,
            ownerTagHex: record.ownerTagHex,
            diversifierHex: record.diversifierHex,
            publicKeyBase64Url: record.publicKeyBase64Url,
            privateKeyBase64Url: record.privateKeyBase64Url,
            createdAtMs: record.createdAtMs,
          })),
          shadowTransactions: shadowState.transactions,
        },
        mnemonic,
      ),
    };
  },
  async importConfidentialWalletBackup({
    toriiUrl,
    accountId,
    mnemonic,
    confidentialWallet,
  }) {
    if (!confidentialWallet) {
      return;
    }
    if (confidentialWallet.schema !== CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2) {
      return;
    }
    await assertSecureVaultAvailable("Confidential wallet backup restore");
    const normalizedAccountId = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    const backupAccountId = normalizeCompatAccountIdLiteral(
      confidentialWallet.accountId,
      "confidentialWallet.accountId",
    );
    if (backupAccountId !== normalizedAccountId) {
      throw new Error(
        "Confidential wallet backup does not match the restored account.",
      );
    }
    const decryptedState = decryptConfidentialWalletBackupState(
      confidentialWallet.stateBox,
      mnemonic,
    );
    for (const receiveKey of decryptedState.receiveKeys) {
      await storeConfidentialReceiveKeyInVault({
        ...receiveKey,
        accountId: normalizedAccountId,
      });
    }
    const shadowKey = getConfidentialWalletShadowKey({
      toriiUrl,
      accountId: normalizedAccountId,
    });
    const existingShadowState = readConfidentialWalletShadowState(shadowKey);
    writeConfidentialWalletShadowState(shadowKey, {
      transactions: [
        ...existingShadowState.transactions,
        ...decryptedState.shadowTransactions,
      ],
    });
  },
  async registerAccount(input) {
    const domainId = input.domainId.trim();
    if (!domainId) {
      throw new Error("domainId is required.");
    }
    const authorityAccountId = normalizeCompatAccountIdLiteral(
      input.authorityAccountId,
      "authorityAccountId",
    );
    const authoritySigningMaterial = await resolveSigningMaterial({
      accountId: authorityAccountId,
      privateKeyHex: input.authorityPrivateKeyHex,
      signingAlgorithm: input.authoritySigningAlgorithm,
      operationLabel: "Create on-chain account",
    });
    const tx = buildRegisterAccountAndTransferTransaction({
      chainId: input.chainId,
      authority: authorityAccountId,
      account: {
        accountId: normalizeCompatAccountIdLiteral(
          input.accountId,
          "accountId",
        ),
        metadata: input.metadata ?? {},
      },
      metadata: withRequiredGasAssetMetadata(undefined, input.toriiUrl),
      privateKey: hexToBuffer(
        authoritySigningMaterial.privateKeyHex,
        "authorityPrivateKeyHex",
      ),
      privateKeyAlgorithm: authoritySigningMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      input.toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  async transferAsset(input) {
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    });
    const chainId = writeConnection.chainId;
    const networkPrefix = writeConnection.networkPrefix;
    const accountId = normalizeCompatAccountIdLiteral(
      input.accountId,
      "accountId",
      networkPrefix,
    );
    const destinationAccountIdLiteral = trimString(input.destinationAccountId);
    const destinationAccountId = destinationAccountIdLiteral
      ? (
          await resolveAccountAliasSelector({
            toriiUrl: input.toriiUrl,
            alias: destinationAccountIdLiteral,
            networkPrefix,
          })
        ).accountId
      : "";
    const signingMaterial = await resolveSigningMaterial({
      accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
      operationLabel: input.unshield
        ? "Confidential public exit"
        : input.shielded
          ? "Shielded transfer"
          : "Transfer",
    });
    const privateKeyHex = signingMaterial.privateKeyHex;

    if (input.unshield) {
      assertEd25519SigningMaterial(signingMaterial, "Confidential public exit");
      await assertSecureVaultAvailable("Confidential public exit");
      if (!destinationAccountId) {
        throw new Error("destinationAccountId is required.");
      }
      const { policy, resolvedAssetDefinitionId } =
        await fetchConfidentialAssetPolicyForAccount({
          toriiUrl: input.toriiUrl,
          accountId,
          assetDefinitionId: input.assetDefinitionId,
        });
      const effectiveMode = policy.effective_mode || policy.current_mode;
      const resolvedAssetId = resolvedAssetDefinitionId;
      const normalizedUnshieldMode = String(effectiveMode ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (
        normalizedUnshieldMode === "transparentonly" ||
        normalizedUnshieldMode === "shieldedonly"
      ) {
        throw new Error(
          `Confidential public exit is unavailable for ${resolvedAssetId}; effective mode is ${effectiveMode}.`,
        );
      }
      const normalizedAmount = String(input.quantity).trim();
      if (!isPositiveWholeAmount(normalizedAmount)) {
        throw new Error(
          "Unshield amount must be a whole number greater than zero (base units).",
        );
      }
      const privateKey = hexToBuffer(privateKeyHex, "privateKeyHex");
      const materials = await resolveConfidentialUnshieldMaterials({
        toriiUrl: input.toriiUrl,
        chainId,
        accountId,
        privateKeyHex,
        assetDefinitionId: resolvedAssetId,
      });
      if (
        BigInt(materials.ledger.spendableQuantity) < BigInt(normalizedAmount)
      ) {
        throw new Error(
          `Shielded spendable balance is ${materials.ledger.spendableQuantity} in ${materials.resolvedAssetId}, but ${normalizedAmount} is required. Create a fresh shielded balance with this wallet first.`,
        );
      }
      let refreshedMaterials = materials;
      let verifyingKeyContext = readConfidentialVerifyingKeyContext(
        refreshedMaterials.verifyingKey,
      );
      while (isConfidentialUnshieldV3CircuitId(verifyingKeyContext.circuitId)) {
        const candidateSelection = selectWalletConfidentialNotes(
          refreshedMaterials.ledger.notes,
          normalizedAmount,
        );
        if (candidateSelection.selected.length <= 2) {
          break;
        }
        const consolidation = await submitConfidentialSelfConsolidation({
          toriiUrl: input.toriiUrl,
          chainId,
          accountId,
          privateKeyHex,
          assetDefinitionId: refreshedMaterials.resolvedAssetId,
          notes: candidateSelection.selected.slice(
            0,
            2,
          ) as WalletSpendableConfidentialNote[],
        });
        const leafIndex = refreshedMaterials.ledger.treeCommitmentsHex.length;
        const nullifierHex = deriveWalletConfidentialNullifierHex({
          privateKeyHex,
          assetDefinitionId: consolidation.output.note.asset_definition_id,
          chainId,
          rhoHex: consolidation.output.note.rho_hex,
        });
        const selectedNullifiers = new Set(
          candidateSelection.selected
            .slice(0, 2)
            .map((note) => note.nullifier_hex),
        );
        refreshedMaterials = {
          ...refreshedMaterials,
          resolvedAssetId: consolidation.resolvedAssetId,
          latestRootHex: consolidation.latestRootHex,
          ledger: {
            ...refreshedMaterials.ledger,
            notes: [
              ...refreshedMaterials.ledger.notes.filter(
                (note) => !selectedNullifiers.has(note.nullifier_hex),
              ),
              {
                ...consolidation.output.note,
                nullifier_hex: nullifierHex,
                source_tx_hash: consolidation.hash,
                leaf_index: leafIndex,
              },
            ],
            treeCommitmentsHex: [
              ...refreshedMaterials.ledger.treeCommitmentsHex,
              consolidation.output.note.commitment_hex,
            ],
          },
        };
        verifyingKeyContext = readConfidentialVerifyingKeyContext(
          refreshedMaterials.verifyingKey,
        );
      }
      let selectedNotes: WalletSpendableConfidentialNote[];
      let changeOutputs: Array<{
        note: ReturnType<typeof createWalletConfidentialNote>;
        receiveKeyId: string;
        recipientPublicKeyBase64Url: string;
      }> = [];
      let proofEnvelope:
        | ReturnType<typeof buildConfidentialUnshieldProofV2>
        | ReturnType<typeof buildConfidentialUnshieldProofV3>;
      if (isConfidentialUnshieldV2CircuitId(verifyingKeyContext.circuitId)) {
        const selection = selectWalletConfidentialNotesForExactAmount(
          refreshedMaterials.ledger.notes,
          normalizedAmount,
        );
        selectedNotes = selection.selected;
        proofEnvelope = buildConfidentialUnshieldProofV2({
          chainId,
          assetDefinitionId: refreshedMaterials.resolvedAssetId,
          spendKey: privateKey,
          treeCommitments: refreshedMaterials.ledger.treeCommitmentsHex,
          inputs: selection.selected.map((note) => ({
            amount: note.amount,
            rhoHex: note.rho_hex,
            diversifierHex: note.diversifier_hex,
            leafIndex: note.leaf_index,
          })),
          publicAmount: normalizedAmount,
          rootHintHex: refreshedMaterials.latestRootHex,
          verifyingKey: verifyingKeyContext.proofVerifyingKey,
        });
      } else if (
        isConfidentialUnshieldV3CircuitId(verifyingKeyContext.circuitId)
      ) {
        const selection = selectWalletConfidentialNotes(
          refreshedMaterials.ledger.notes,
          normalizedAmount,
        );
        if (selection.selected.length > 2) {
          throw new Error(
            "Unable to reduce the shielded spend to a one- or two-note unshield. Try again after consolidation commits.",
          );
        }
        selectedNotes = selection.selected;
        if (selection.change !== "0") {
          const changeDescriptor =
            await createStoredConfidentialReceiveDescriptor({
              accountId,
              privateKeyHex,
              operationLabel: "Confidential public exit",
            });
          changeOutputs = [
            {
              note: createWalletConfidentialNote({
                assetDefinitionId: refreshedMaterials.resolvedAssetId,
                amount: selection.change,
                ownerTagHex: changeDescriptor.ownerTagHex,
                diversifierHex: changeDescriptor.diversifierHex,
              }),
              receiveKeyId: changeDescriptor.receiveKeyId,
              recipientPublicKeyBase64Url:
                changeDescriptor.receivePublicKeyBase64Url,
            },
          ];
        }
        proofEnvelope = buildConfidentialUnshieldProofV3({
          chainId,
          assetDefinitionId: refreshedMaterials.resolvedAssetId,
          spendKey: privateKey,
          treeCommitments: refreshedMaterials.ledger.treeCommitmentsHex,
          inputs: selection.selected.map((note) => ({
            amount: note.amount,
            rhoHex: note.rho_hex,
            diversifierHex: note.diversifier_hex,
            leafIndex: note.leaf_index,
          })),
          outputs: changeOutputs.map(({ note }) => ({
            amount: note.amount,
            rhoHex: note.rho_hex,
          })),
          publicAmount: normalizedAmount,
          rootHintHex: refreshedMaterials.latestRootHex,
          verifyingKey: verifyingKeyContext.proofVerifyingKey,
        });
      } else {
        throw new Error(
          `Unsupported confidential unshield verifier circuit ${verifyingKeyContext.circuitId || "(missing circuit id)"}.`,
        );
      }
      const confidentialExitMetadata = withRequiredGasAssetMetadata(
        extractConfidentialFeeMetadata(
          input.metadata,
          "Confidential public exit",
        ),
        input.toriiUrl,
      );
      const metadata =
        changeOutputs.length > 0
          ? buildWalletConfidentialMetadataV3({
              baseMetadata: confidentialExitMetadata,
              outputs: changeOutputs,
            })
          : confidentialExitMetadata;
      const tx = buildUnshieldTransaction({
        chainId,
        authority: accountId,
        unshield: {
          assetDefinitionId: refreshedMaterials.resolvedAssetId,
          destinationAccountId,
          publicAmount: normalizedAmount,
          inputs: proofEnvelope.nullifiers,
          outputs:
            "outputCommitments" in proofEnvelope
              ? proofEnvelope.outputCommitments
              : [],
          proof: {
            backend: verifyingKeyContext.backend,
            proof: Buffer.from(proofEnvelope.proof),
            verifyingKeyRef: verifyingKeyContext.proofVerifyingKey.id,
          },
          rootHint: Buffer.from(refreshedMaterials.latestRootHex, "hex"),
        },
        metadata,
        privateKey,
        privateKeyAlgorithm: signingMaterial.signingAlgorithm,
      });
      const submission = await submitSignedTransactionAndWaitForCommit(
        input.toriiUrl,
        tx.signedTransaction,
      );
      upsertConfidentialWalletShadowTransaction({
        toriiUrl: input.toriiUrl,
        accountId,
        txHash: submission.hash,
        authority: accountId,
        metadata: isPlainRecord(metadata) ? metadata : {},
        instructions: [
          {
            zk: {
              Unshield: {
                asset: refreshedMaterials.resolvedAssetId,
                to: destinationAccountId,
                public_amount: normalizedAmount,
                inputs: proofEnvelope.nullifiers.map((entry) =>
                  entry.toString("hex"),
                ),
                outputs: changeOutputs.map(({ note }) => note.commitment_hex),
              },
            },
          },
        ],
        createdAtMs: Math.min(
          ...[
            ...selectedNotes.map((note) => note.created_at_ms),
            ...changeOutputs.map(({ note }) => note.created_at_ms),
            Date.now(),
          ],
        ),
      });
      return transactionSubmissionResult(submission);
    }

    if (input.shielded) {
      assertEd25519SigningMaterial(
        signingMaterial,
        destinationAccountId === accountId
          ? "Private balance creation"
          : "Shielded transfer",
      );
      await assertSecureVaultAvailable(
        destinationAccountId === accountId
          ? "Private balance creation"
          : "Shielded transfer",
      );
      const { policy, resolvedAssetDefinitionId } =
        await fetchConfidentialAssetPolicyForAccount({
          toriiUrl: input.toriiUrl,
          accountId,
          assetDefinitionId: input.assetDefinitionId,
        });
      const effectiveMode = policy.effective_mode || policy.current_mode;
      const resolvedAssetId = resolvedAssetDefinitionId;
      if (!confidentialModeSupportsShield(effectiveMode)) {
        throw new Error(
          `Shielded transfer is unavailable for ${resolvedAssetId}; effective mode is ${effectiveMode}.`,
        );
      }
      const normalizedAmount = String(input.quantity).trim();
      if (!isPositiveWholeAmount(normalizedAmount)) {
        throw new Error(
          "Shielded amount must be a whole number greater than zero (base units).",
        );
      }

      const privateKey = hexToBuffer(privateKeyHex, "privateKeyHex");
      const confidentialBaseMetadata = withConfidentialGasMetadata(
        input.toriiUrl,
        resolvedAssetId,
        extractConfidentialFeeMetadata(
          input.metadata,
          destinationAccountId === accountId
            ? "Private balance creation"
            : "Shielded transfer",
        ),
      );
      const confidentialTransactionMetadata = withRequiredGasAssetMetadata(
        confidentialBaseMetadata,
        input.toriiUrl,
      );

      if (destinationAccountId === accountId) {
        const selfReceiveDescriptor =
          await createStoredConfidentialReceiveDescriptor({
            accountId,
            privateKeyHex,
            operationLabel: "Private balance creation",
          });
        const note = createWalletConfidentialNote({
          assetDefinitionId: resolvedAssetId,
          amount: normalizedAmount,
          ownerTagHex: selfReceiveDescriptor.ownerTagHex,
          diversifierHex: selfReceiveDescriptor.diversifierHex,
        });
        const metadata = buildWalletConfidentialMetadataV3({
          baseMetadata: confidentialTransactionMetadata,
          outputs: [
            {
              note,
              receiveKeyId: selfReceiveDescriptor.receiveKeyId,
              recipientPublicKeyBase64Url:
                selfReceiveDescriptor.receivePublicKeyBase64Url,
            },
          ],
        });
        const tx = buildShieldTransaction({
          chainId,
          authority: accountId,
          shield: {
            assetDefinitionId: resolvedAssetId,
            fromAccountId: accountId,
            amount: normalizedAmount,
            noteCommitment: Buffer.from(note.commitment_hex, "hex"),
            encryptedPayload: {
              version: 1,
              ephemeralPublicKey: randomBytes(32),
              nonce: randomBytes(24),
              ciphertext: Buffer.from(
                JSON.stringify({
                  schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
                  commitment_hex: note.commitment_hex,
                }),
                "utf8",
              ),
            },
          },
          metadata,
          privateKey,
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        });
        const submission = await submitSignedTransactionAsVersioned(
          input.toriiUrl,
          tx.signedTransaction,
        );
        const fee = await waitForTransactionCommit(
          input.toriiUrl,
          submission.hash,
        );
        const committedSubmission = {
          ...submission,
          ...(fee ? { fee } : {}),
        };
        upsertConfidentialWalletShadowTransaction({
          toriiUrl: input.toriiUrl,
          accountId,
          txHash: submission.hash,
          authority: accountId,
          metadata,
          instructions: [
            {
              zk: {
                Shield: {
                  asset: resolvedAssetId,
                  from: accountId,
                  amount: normalizedAmount,
                  note_commitment: note.commitment_hex,
                },
              },
            },
          ],
          createdAtMs: note.created_at_ms,
        });
        if (
          resolvedAssetId.trim().toLowerCase() ===
            PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID ||
          extractAssetDefinitionId(input.assetDefinitionId)
            .trim()
            .toLowerCase() === PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID
        ) {
          appendPrivateKaigiShieldCredit({
            toriiUrl: input.toriiUrl,
            accountId,
            amount: normalizedAmount,
            assetDefinitionId: resolvedAssetId,
          });
        }
        return transactionSubmissionResult(committedSubmission);
      }

      let materials = await resolveConfidentialTransferMaterials({
        toriiUrl: input.toriiUrl,
        chainId,
        accountId,
        privateKeyHex,
        assetDefinitionId: resolvedAssetId,
      });
      const recipientDescriptor = readShieldedRecipientDescriptor(input);
      if (!recipientDescriptor) {
        throw new Error(
          "Shielded recipient QR is required for private recipient sends.",
        );
      }
      let orderedOutputs: Array<{
        note: ReturnType<typeof createWalletConfidentialNote>;
        receiveKeyId: string;
        recipientPublicKeyBase64Url: string;
      }> = [];
      let proofEnvelope!: ReturnType<typeof buildConfidentialTransferProofV2>;
      let selectedRootHintHex = materials.latestRootHex;
      let transferVerifyingKeyContext: ReturnType<
        typeof readConfidentialVerifyingKeyContext
      > | null = null;
      for (
        let attempt = 1;
        attempt <= CONFIDENTIAL_TRANSFER_ROOT_RETRY_ATTEMPTS;
        attempt += 1
      ) {
        if (
          BigInt(materials.ledger.spendableQuantity) < BigInt(normalizedAmount)
        ) {
          throw new Error(
            `Shielded spendable balance is ${materials.ledger.spendableQuantity} in ${materials.resolvedAssetId}, but ${normalizedAmount} is required. Create a fresh shielded balance with this wallet first.`,
          );
        }
        const selection = selectWalletConfidentialNotes(
          materials.ledger.notes,
          normalizedAmount,
        );
        const outputs: Array<{
          note: ReturnType<typeof createWalletConfidentialNote>;
          receiveKeyId: string;
          recipientPublicKeyBase64Url: string;
        }> = [
          {
            note: createWalletConfidentialNote({
              assetDefinitionId: materials.resolvedAssetId,
              amount: normalizedAmount,
              ownerTagHex: recipientDescriptor.ownerTagHex,
              diversifierHex: recipientDescriptor.diversifierHex,
            }),
            receiveKeyId: recipientDescriptor.receiveKeyId,
            recipientPublicKeyBase64Url:
              recipientDescriptor.receivePublicKeyBase64Url,
          },
        ];
        if (selection.change !== "0") {
          const changeDescriptor =
            await createStoredConfidentialReceiveDescriptor({
              accountId,
              privateKeyHex,
              operationLabel: "Shielded transfer",
            });
          outputs.push({
            note: createWalletConfidentialNote({
              assetDefinitionId: materials.resolvedAssetId,
              amount: selection.change,
              ownerTagHex: changeDescriptor.ownerTagHex,
              diversifierHex: changeDescriptor.diversifierHex,
            }),
            receiveKeyId: changeDescriptor.receiveKeyId,
            recipientPublicKeyBase64Url:
              changeDescriptor.receivePublicKeyBase64Url,
          });
        }
        orderedOutputs = [...outputs].sort((left, right) =>
          left.note.commitment_hex.localeCompare(right.note.commitment_hex),
        );
        const verifyingKeyContext = readConfidentialVerifyingKeyContext(
          materials.verifyingKey,
        );
        transferVerifyingKeyContext = verifyingKeyContext;
        const proofVerifyingKey = verifyingKeyContext.proofVerifyingKey;
        const candidateRootHintHexes = [
          ...new Set([
            materials.latestRootHex,
            ...[...materials.recentRootHexes].reverse(),
          ]),
        ];
        let rootMismatchError: unknown = null;
        let proofBuilt = false;
        for (const candidateRootHintHex of candidateRootHintHexes) {
          try {
            proofEnvelope = buildConfidentialTransferProofV2({
              chainId,
              assetDefinitionId: materials.resolvedAssetId,
              spendKey: privateKey,
              treeCommitments: materials.ledger.treeCommitmentsHex,
              inputs: selection.selected.map((note) => ({
                amount: note.amount,
                rhoHex: note.rho_hex,
                diversifierHex: note.diversifier_hex,
                leafIndex: note.leaf_index,
              })),
              outputs: orderedOutputs.map(({ note }) => ({
                amount: note.amount,
                rhoHex: note.rho_hex,
                ownerTagHex: note.owner_tag_hex,
              })),
              rootHintHex: candidateRootHintHex,
              verifyingKey: proofVerifyingKey,
            });
            selectedRootHintHex = candidateRootHintHex;
            proofBuilt = true;
            break;
          } catch (error) {
            if (!isConfidentialRootHintMismatchError(error)) {
              throw error;
            }
            rootMismatchError = error;
          }
        }
        if (proofBuilt) {
          break;
        }
        if (
          attempt >= CONFIDENTIAL_TRANSFER_ROOT_RETRY_ATTEMPTS ||
          !isConfidentialRootHintMismatchError(rootMismatchError)
        ) {
          throw rootMismatchError;
        }
        try {
          await waitForMs(CONFIDENTIAL_TRANSFER_ROOT_RETRY_DELAY_MS);
          materials = await resolveConfidentialTransferMaterials({
            toriiUrl: input.toriiUrl,
            chainId,
            accountId,
            privateKeyHex,
            assetDefinitionId: resolvedAssetId,
          });
        } catch (error) {
          if (
            attempt >= CONFIDENTIAL_TRANSFER_ROOT_RETRY_ATTEMPTS ||
            !isConfidentialRootHintMismatchError(error)
          ) {
            throw error;
          }
        }
      }
      if (!transferVerifyingKeyContext) {
        throw new Error("Confidential transfer verifier material is missing.");
      }
      const metadata = buildWalletConfidentialMetadataV3({
        baseMetadata: stripConfidentialFeeSponsor(
          confidentialTransactionMetadata,
        ),
        outputs: orderedOutputs,
      });
      const tx = buildZkTransferTransaction({
        chainId,
        authority: accountId,
        transfer: {
          assetDefinitionId: materials.resolvedAssetId,
          inputs: proofEnvelope.nullifiers,
          outputs: proofEnvelope.outputCommitments,
          proof: {
            backend: transferVerifyingKeyContext.backend,
            proof: Buffer.from(proofEnvelope.proof),
            verifyingKeyRef: transferVerifyingKeyContext.proofVerifyingKey.id,
          },
          rootHint: Buffer.from(selectedRootHintHex, "hex"),
        },
        metadata,
        privateKey,
        privateKeyAlgorithm: signingMaterial.signingAlgorithm,
      });
      const shadowMetadata = metadata;
      const shadowInstructions = [
        {
          zk: {
            ZkTransfer: {
              asset: materials.resolvedAssetId,
              inputs: proofEnvelope.nullifiers.map((entry) =>
                entry.toString("hex"),
              ),
              outputs: orderedOutputs.map(({ note }) => note.commitment_hex),
            },
          },
        },
      ];
      const submission = await submitConfidentialRelayTransfer({
        toriiUrl: input.toriiUrl,
        assetDefinitionId: materials.resolvedAssetId,
        signedTransaction: tx.signedTransaction,
      });
      upsertConfidentialWalletShadowTransaction({
        toriiUrl: input.toriiUrl,
        accountId,
        txHash: submission.hash,
        authority: submission.relayAuthority || "confidential-relay",
        metadata: shadowMetadata,
        instructions: shadowInstructions,
        createdAtMs: Math.min(
          ...orderedOutputs.map(({ note }) => note.created_at_ms),
          Date.now(),
        ),
      });
      if (destinationAccountId && destinationAccountId !== accountId) {
        upsertConfidentialWalletShadowTransaction({
          toriiUrl: input.toriiUrl,
          accountId: destinationAccountId,
          txHash: submission.hash,
          authority: submission.relayAuthority || "confidential-relay",
          metadata: shadowMetadata,
          instructions: shadowInstructions,
          createdAtMs: Math.min(
            ...orderedOutputs.map(({ note }) => note.created_at_ms),
            Date.now(),
          ),
        });
      }
      return transactionSubmissionResult(submission);
    }

    const client = getClient(input.toriiUrl);
    if (!destinationAccountId) {
      throw new Error("destinationAccountId is required.");
    }
    const configuredAssetId = String(input.assetDefinitionId ?? "").trim();
    if (!configuredAssetId) {
      throw new Error("assetDefinitionId is required.");
    }

    const configuredAssetDefinitionId =
      extractAssetDefinitionId(configuredAssetId).trim() || configuredAssetId;
    const buildSourceAssetHoldingId = (assetReference: string) => {
      const sourceAssetHoldingLiteral = buildAssetHoldingIdLiteral({
        assetDefinitionId: assetReference,
        accountId,
      });
      if (!sourceAssetHoldingLiteral) {
        return null;
      }
      try {
        return normalizeAssetHoldingId(
          sourceAssetHoldingLiteral,
          "sourceAssetHoldingId",
        );
      } catch {
        return null;
      }
    };
    const configuredSourceAssetHoldingId =
      buildSourceAssetHoldingId(configuredAssetId);
    const configuredLooksLegacy =
      configuredAssetDefinitionId.includes("#") &&
      !configuredAssetDefinitionId.startsWith("norito:");
    let sourceAssetHoldingId = configuredLooksLegacy
      ? null
      : configuredSourceAssetHoldingId;

    if (!sourceAssetHoldingId) {
      let selectedAssetId = "";
      let available: string[] = [];
      try {
        const assets = await client.listAccountAssets(accountId, {
          limit: 200,
        });
        const items = (Array.isArray(assets?.items) ? assets.items : [])
          .map((asset) => {
            const assetRecord = isPlainRecord(asset) ? asset : {};
            const legacyAssetId = trimString(assetRecord.asset_id);
            const assetDefinitionId = trimString(
              assetRecord.asset ??
                assetRecord.asset_definition_id ??
                assetRecord.assetDefinitionId,
            );
            const assetAccountId = trimString(
              assetRecord.account_id ?? assetRecord.accountId,
            );
            const assetId =
              legacyAssetId ||
              (assetDefinitionId && assetAccountId
                ? buildAssetHoldingIdLiteral({
                    assetDefinitionId,
                    accountId: assetAccountId,
                  })
                : assetDefinitionId);
            const quantity = trimString(assetRecord.quantity);
            return assetId && quantity ? { asset_id: assetId, quantity } : null;
          })
          .filter((asset): asset is { asset_id: string; quantity: string } =>
            Boolean(asset),
          );
        available = items
          .map((asset) => asset.asset_id.trim())
          .filter(Boolean)
          .slice(0, 5);
        const resolvedDefinitionId = resolveUniqueLiveAssetDefinitionId(
          items,
          configuredAssetDefinitionId,
        );
        const hasPositiveQuantity = (asset: { quantity: string }) => {
          const quantity = Number(asset.quantity);
          return Number.isFinite(quantity) && quantity > 0;
        };
        const exactMatch = items.find(
          (asset) => asset.asset_id.trim() === configuredAssetId,
        );
        const resolvedMatch = resolvedDefinitionId
          ? (items.find(
              (asset) =>
                areAssetDefinitionIdsEquivalent(
                  asset.asset_id,
                  resolvedDefinitionId,
                ) && hasPositiveQuantity(asset),
            ) ??
            items.find((asset) =>
              areAssetDefinitionIdsEquivalent(
                asset.asset_id,
                resolvedDefinitionId,
              ),
            ))
          : null;
        const legacyMatch = items.find((asset) =>
          asset.asset_id.startsWith(`${configuredAssetDefinitionId}##`),
        );
        const containsMatches = items.filter((asset) =>
          asset.asset_id
            .toLowerCase()
            .includes(configuredAssetDefinitionId.toLowerCase()),
        );
        const positiveBalanceMatches = items.filter(hasPositiveQuantity);

        selectedAssetId = String(
          exactMatch?.asset_id ??
            resolvedMatch?.asset_id ??
            legacyMatch?.asset_id ??
            (containsMatches.length === 1
              ? containsMatches[0]?.asset_id
              : "") ??
            (positiveBalanceMatches.length === 1
              ? positiveBalanceMatches[0]?.asset_id
              : ""),
        ).trim();
      } catch {
        selectedAssetId = "";
      }

      sourceAssetHoldingId = selectedAssetId
        ? buildSourceAssetHoldingId(selectedAssetId)
        : configuredSourceAssetHoldingId;

      if (!sourceAssetHoldingId) {
        const availableHint = available.length
          ? ` Available asset IDs: ${available.join(", ")}.`
          : "";
        throw new Error(
          `Unable to resolve the source asset from configured value "${configuredAssetId}". Set Asset Definition ID to the canonical asset literal for this account.${availableHint}`,
        );
      }
    }

    const tx = buildTransferAssetTransaction({
      chainId,
      authority: accountId,
      sourceAssetHoldingId,
      quantity: input.quantity,
      destinationAccountId,
      metadata: withRequiredGasAssetMetadata(input.metadata, input.toriiUrl),
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      input.toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  buildUranaiPrivateTradeProof(input) {
    return buildUranaiPrivateTradeProofEnvelope(input);
  },
  async signIrohaConnectMessage({ accountId, signingMessageB64 }) {
    const authority = normalizeCompatAccountIdLiteral(accountId, "accountId");
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      operationLabel: "IrohaConnect signing",
    });
    const normalizedMessage = trimString(signingMessageB64);
    if (!normalizedMessage) {
      throw new Error("IrohaConnect signing message is required.");
    }
    const message = Buffer.from(normalizedMessage, "base64");
    if (message.length === 0) {
      throw new Error("IrohaConnect signing message is empty.");
    }
    const privateKey = hexToBuffer(
      signingMaterial.privateKeyHex,
      "privateKeyHex",
    );
    const algorithmCode = getConnectSigningAlgorithmCode(
      signingMaterial.signingAlgorithm,
    );
    return {
      publicKeyHex: toHex(
        publicKeyFromPrivate(privateKey, {
          algorithm: signingMaterial.signingAlgorithm,
        }),
      ),
      signatureB64: Buffer.from(
        sign(message, privateKey, {
          algorithm: signingMaterial.signingAlgorithm,
        }),
      ).toString("base64"),
      signingAlgorithm: signingMaterial.signingAlgorithm,
      algorithmCode,
      algorithmLabel: signingAlgorithmLabel(signingMaterial.signingAlgorithm),
    };
  },
  async getConfidentialAssetPolicy({ toriiUrl, accountId, assetDefinitionId }) {
    const { policy, resolvedAssetDefinitionId } =
      await fetchConfidentialAssetPolicyForAccount({
        toriiUrl,
        accountId,
        assetDefinitionId,
      });
    try {
      const assetDefinition = await fetchConfidentialAssetDefinition(
        toriiUrl,
        resolvedAssetDefinitionId,
      );
      return mergeConfidentialPolicyWithAssetDefinition(
        policy,
        assetDefinition,
      );
    } catch {
      return policy;
    }
  },
  async getConfidentialTransferExecutionContext({
    toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    const { policy, resolvedAssetDefinitionId } =
      await fetchConfidentialAssetPolicyForAccount({
        toriiUrl,
        accountId,
        assetDefinitionId,
      });
    const materials = await resolveConfidentialTransferMaterials({
      toriiUrl,
      chainId,
      accountId,
      privateKeyHex,
      assetDefinitionId: resolvedAssetDefinitionId,
    });
    const verifyingKeyContext = readConfidentialVerifyingKeyContext(
      materials.verifyingKey,
    );
    return {
      resolvedAssetId: resolvedAssetDefinitionId,
      effectiveMode:
        trimString(policy.effective_mode) || trimString(policy.current_mode),
      backend: verifyingKeyContext.backend,
      circuitId: verifyingKeyContext.circuitId,
    };
  },
  getConfidentialAssetBalance({
    toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  scanConfidentialWallet({
    toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  getConfidentialWalletState({
    toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  async getPrivateKaigiConfidentialXorState({ toriiUrl, accountId }) {
    return (
      await resolvePrivateKaigiConfidentialXorContext({
        toriiUrl,
        accountId,
      })
    ).state;
  },
  async selfShieldPrivateKaigiXor({
    toriiUrl,
    chainId,
    accountId,
    privateKeyHex,
    amount,
  }) {
    const normalizedAmount = ceilDecimalToIntegerString(
      amount || PRIVATE_KAIGI_DEFAULT_SELF_SHIELD_AMOUNT,
    );
    if (compareDecimalStrings(normalizedAmount, "0") <= 0) {
      throw new Error("amount must be greater than zero.");
    }
    return api.transferAsset({
      toriiUrl,
      chainId,
      assetDefinitionId: PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID,
      accountId,
      destinationAccountId: accountId,
      quantity: normalizedAmount,
      privateKeyHex,
      shielded: true,
    });
  },
  fetchAccountAssets({
    toriiUrl,
    accountId,
    networkPrefix,
    assetDefinitionId,
    limit = 50,
    offset,
  }) {
    return fetchAccountAssetsList({
      toriiUrl,
      accountId,
      networkPrefix,
      assetDefinitionId,
      limit,
      offset,
    });
  },
  async fetchAccountTransactions({
    toriiUrl,
    accountId,
    networkPrefix,
    privateKeyHex,
    limit = 20,
    offset,
  }) {
    const client = getClient(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const normalizedPrivateKeyHex =
      (await resolveOptionalPrivateKeyHex({
        accountId: normalizedAccountId,
        privateKeyHex,
      })) ?? "";
    const canonicalAuth = normalizedPrivateKeyHex
      ? {
          accountId: normalizedAccountId,
          privateKey: hexToBuffer(normalizedPrivateKeyHex, "privateKeyHex"),
        }
      : null;
    return client
      .listAccountTransactions(normalizedAccountId, {
        limit,
        offset,
        ...(canonicalAuth ? { canonicalAuth } : {}),
      })
      .catch((error) => {
        if (
          canonicalAuth &&
          accountTransactionsQuerySupportsCanonicalAuthFallback(error)
        ) {
          return client.listAccountTransactions(normalizedAccountId, {
            limit,
            offset,
          });
        }
        throw error;
      });
  },
  listAccountPermissions({ toriiUrl, accountId, limit = 200, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountPermissions(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
  },
  async registerCitizen({
    toriiUrl,
    chainId,
    accountId,
    amount,
    privateKeyHex,
  }) {
    const normalizedAccount = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    const policy = await fetchGovernanceRegistrationPolicy(toriiUrl);
    if (
      policy.citizenshipAssetDefinitionId &&
      policy.citizenshipAssetDefinitionExists === false
    ) {
      throw new Error(
        missingGovernanceCitizenshipAssetMessage(
          policy.citizenshipAssetDefinitionId,
        ),
      );
    }
    await assertGovernanceCitizenshipRouteReady(toriiUrl);
    try {
      return await submitInstructionTransaction({
        toriiUrl,
        chainId,
        authorityAccountId: normalizedAccount,
        privateKeyHex,
        instruction: {
          RegisterCitizen: {
            owner: normalizedAccount,
            amount: normalizeIntegerAmount(amount, "amount"),
          },
        },
      });
    } catch (error) {
      throw decorateRegisterCitizenError(error);
    }
  },
  getGovernanceRegistrationPolicy({ toriiUrl }) {
    return fetchGovernanceRegistrationPolicy(toriiUrl);
  },
  getGovernanceCitizenStatus({ toriiUrl, accountId }) {
    return fetchGovernanceCitizenStatus(toriiUrl, accountId);
  },
  getGovernanceCitizenCount(config) {
    return fetchGovernanceCitizenCount(config.toriiUrl);
  },
  getGovernanceProposal({ toriiUrl, proposalId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceProposalTyped(proposalId);
  },
  getGovernanceReferendum({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceReferendumTyped(referendumId);
  },
  getGovernanceTally({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceTallyTyped(referendumId);
  },
  getGovernanceLocks({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceLocksTyped(referendumId);
  },
  getGovernanceUnlockStats({ toriiUrl }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceUnlockStatsTyped();
  },
  getGovernanceCouncilCurrent(config) {
    return fetchGovernanceCouncilCurrent(config.toriiUrl);
  },
  proposeGovernanceDeployContract({
    toriiUrl,
    contractAddress,
    contractAlias,
    codeHash,
    abiHash,
    abiVersion,
    mode,
    window,
    limits,
  }) {
    const client = getClient(toriiUrl);
    const normalizedContractAddress = contractAddress?.trim() ?? "";
    const normalizedContractAlias = contractAlias?.trim() ?? "";
    if (!normalizedContractAddress && !normalizedContractAlias) {
      throw new Error("contractAddress or contractAlias is required.");
    }
    if (normalizedContractAddress && normalizedContractAlias) {
      throw new Error(
        "Provide either contractAddress or contractAlias, not both.",
      );
    }
    const basePayload = {
      codeHash: codeHash.trim(),
      abiHash: abiHash.trim(),
      abiVersion: abiVersion?.trim() || "1",
    };
    const payload: ToriiGovernanceDeployContractProposalRequest =
      normalizedContractAddress
        ? {
            ...basePayload,
            contractAddress: normalizedContractAddress,
          }
        : {
            ...basePayload,
            contractAlias: normalizedContractAlias,
          };
    if (mode) {
      payload.mode = mode;
    }
    if (window) {
      payload.window = window;
    }
    if (limits !== undefined && limits !== null) {
      payload.limits =
        limits as ToriiGovernanceDeployContractProposalRequest["limits"];
    }
    return client.governanceProposeDeployContract(payload);
  },
  submitGovernancePlainBallot({
    toriiUrl,
    chainId,
    accountId,
    referendumId,
    amount,
    durationBlocks,
    direction,
    privateKeyHex,
  }) {
    const normalizedAccount = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    const normalizedReferendumId = referendumId.trim();
    if (!normalizedReferendumId) {
      throw new Error("referendumId is required.");
    }
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedAccount,
      privateKeyHex,
      instruction: {
        CastPlainBallot: {
          referendum_id: normalizedReferendumId,
          owner: normalizedAccount,
          amount: normalizeIntegerAmount(amount, "amount"),
          duration_blocks: normalizeDurationBlocks(durationBlocks),
          direction: normalizeBallotDirectionCode(direction),
        },
      },
    });
  },
  finalizeGovernanceReferendum({ toriiUrl, referendumId, proposalId }) {
    const client = getClient(toriiUrl);
    return client.governanceFinalizeReferendumTyped({
      referendumId,
      proposalId,
    });
  },
  enactGovernanceProposal({ toriiUrl, proposalId }) {
    const client = getClient(toriiUrl);
    return client.governanceEnactProposalTyped({
      proposalId,
    });
  },
  getExplorerMetrics(config) {
    const client = getClient(config.toriiUrl);
    return client.getExplorerMetrics().catch(() => null);
  },
  async getNetworkStats({ toriiUrl, assetDefinitionId }) {
    const client = getClient(toriiUrl);
    const normalizedAssetDefinitionId =
      extractAssetDefinitionId(assetDefinitionId).trim() ||
      trimString(assetDefinitionId);
    if (!normalizedAssetDefinitionId) {
      throw new Error("assetDefinitionId is required.");
    }

    const warnings: string[] = [];
    const [
      explorerResult,
      statusResult,
      sumeragiResult,
      supplyResult,
      econometricsResult,
    ] = await Promise.allSettled([
      withNetworkStatsTimeout("Explorer metrics", (signal) =>
        client.getExplorerMetrics({ signal }),
      ),
      withNetworkStatsTimeout("Runtime status telemetry", (signal) =>
        fetchRuntimeStatusSnapshot(client, toriiUrl, signal),
      ),
      withNetworkStatsTimeout("Lane governance telemetry", (signal) =>
        client.getSumeragiStatusTyped({ signal }),
      ),
      withNetworkStatsTimeout("XOR supply snapshot", (signal) =>
        fetchExplorerAssetDefinitionSnapshot(
          toriiUrl,
          normalizedAssetDefinitionId,
          signal,
        ),
      ),
      withNetworkStatsTimeout("XOR flow econometrics", (signal) =>
        fetchExplorerAssetDefinitionEconometrics(
          toriiUrl,
          normalizedAssetDefinitionId,
          signal,
        ),
      ),
    ]);

    const explorer =
      explorerResult.status === "fulfilled" ? explorerResult.value : null;
    if (explorerResult.status === "rejected" || explorer === null) {
      warnings.push("Explorer metrics are unavailable.");
    }

    const statusSnapshot =
      statusResult.status === "fulfilled" ? statusResult.value : null;
    if (statusResult.status === "rejected") {
      warnings.push("Runtime status telemetry is unavailable.");
    }

    const sumeragiStatus =
      sumeragiResult.status === "fulfilled" ? sumeragiResult.value : null;
    if (sumeragiResult.status === "rejected") {
      warnings.push("Lane governance telemetry is unavailable.");
    }

    const supply =
      supplyResult.status === "fulfilled" ? supplyResult.value : null;
    if (supplyResult.status === "rejected") {
      warnings.push("XOR supply snapshot is unavailable.");
    }

    const econometrics =
      econometricsResult.status === "fulfilled"
        ? econometricsResult.value
        : null;
    if (econometricsResult.status === "rejected") {
      warnings.push("XOR flow econometrics are unavailable.");
    }

    return {
      collectedAtMs: Date.now(),
      xorAssetDefinitionId: normalizedAssetDefinitionId,
      explorer,
      supply,
      econometrics,
      runtime: extractRuntimeStatsFromStatusSnapshot(
        statusSnapshot,
        explorer,
        sumeragiStatus,
      ),
      governance: extractGovernanceStats(sumeragiStatus),
      warnings,
      partial: warnings.length > 0,
    };
  },
  async getExplorerAccountQr({ toriiUrl, accountId }) {
    const client = getClient(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
    );
    const fetchFallback = async () => {
      const baseUrl = normalizeBaseUrl(toriiUrl);
      const endpoint = `${baseUrl}/v1/explorer/accounts/${encodeURIComponent(normalizedAccountId)}/qr`;
      const response = await nodeFetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          detail ||
            `Explorer QR request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeExplorerAccountQrPayload(payload);
    };

    try {
      return await client.getExplorerAccountQr(normalizedAccountId);
    } catch (error) {
      if (!String(error).includes("Digest method not supported")) {
        throw error;
      }
      return fetchFallback();
    }
  },
  getVpnAvailability(input) {
    return ipcRenderer.invoke("vpn:getAvailability", input);
  },
  getVpnProfile(input) {
    return ipcRenderer.invoke("vpn:getProfile", input);
  },
  async getVpnStatus(input) {
    if (!input?.accountId) {
      return await ipcRenderer.invoke("vpn:getStatus", input);
    }
    const signingMaterial = await resolveOptionalSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
    });
    return await ipcRenderer.invoke("vpn:getStatus", {
      ...input,
      ...(signingMaterial ?? {}),
    });
  },
  async connectVpn(input) {
    const signingMaterial = await resolveSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
      operationLabel: "VPN connect",
    });
    return await ipcRenderer.invoke("vpn:connect", {
      ...input,
      ...signingMaterial,
    });
  },
  async disconnectVpn(input) {
    const signingMaterial = await resolveSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
      operationLabel: "VPN disconnect",
    });
    return await ipcRenderer.invoke("vpn:disconnect", {
      ...input,
      ...signingMaterial,
    });
  },
  async repairVpn(input) {
    if (!input?.accountId) {
      return await ipcRenderer.invoke("vpn:repair", input);
    }
    const signingMaterial = await resolveOptionalSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
    });
    return await ipcRenderer.invoke("vpn:repair", {
      ...input,
      ...(signingMaterial ?? {}),
    });
  },
  async listVpnReceipts(input) {
    if (!input?.accountId) {
      return await ipcRenderer.invoke("vpn:listReceipts", input);
    }
    const signingMaterial = await resolveOptionalSigningMaterial({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      signingAlgorithm: input.signingAlgorithm,
    });
    return await ipcRenderer.invoke("vpn:listReceipts", {
      ...input,
      ...(signingMaterial ?? {}),
    });
  },
  listOfflineAllowances({
    toriiUrl,
    controllerId,
    limit,
    offset,
    filter,
    certificateExpiresBeforeMs,
    certificateExpiresAfterMs,
    policyExpiresBeforeMs,
    policyExpiresAfterMs,
    refreshBeforeMs,
    refreshAfterMs,
    verdictIdHex,
    attestationNonceHex,
    requireVerdict,
    onlyMissingVerdict,
    includeExpired,
  }) {
    const client = getClient(toriiUrl) as ToriiClientWithOfflineAllowances;
    return client.listOfflineAllowances({
      controllerId: normalizeCompatAccountIdLiteral(
        controllerId,
        "controllerId",
      ),
      limit,
      offset,
      filter,
      certificateExpiresBeforeMs,
      certificateExpiresAfterMs,
      policyExpiresBeforeMs,
      policyExpiresAfterMs,
      refreshBeforeMs,
      refreshAfterMs,
      verdictIdHex,
      attestationNonceHex,
      requireVerdict,
      onlyMissingVerdict,
      includeExpired,
    });
  },
  async onboardAccount({ toriiUrl, alias, accountId, identity }) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
    );
    const response = await nodeFetch(`${baseUrl}/v1/accounts/onboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        alias,
        account_id: normalizedAccountId,
        identity: identity ?? undefined,
      }),
    });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      let detail = "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (payload && typeof payload === "object") {
          detail = String(
            payload.detail ?? payload.message ?? payload.error ?? "",
          ).trim();
        }
      } else {
        const text = await response.text().catch(() => "");
        // Filter binary-like responses to avoid leaking unreadable bytes to the UI.
        const hasControlChars = Array.from(text).some((character) => {
          const code = character.charCodeAt(0);
          return (code >= 0 && code <= 8) || (code >= 14 && code <= 31);
        });
        if (!hasControlChars) {
          detail = text.trim();
        }
      }
      throw new Error(
        formatOnboardingError({
          status: response.status,
          statusText: response.statusText,
          detail,
        }),
      );
    }
    return (await response.json()) as AccountOnboardingResponse;
  },
  async requestFaucetFunds(
    { toriiUrl, accountId, networkPrefix, requestId },
    onStatus,
  ) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const client = getClient(baseUrl);
    const normalizedRequestId = trimString(requestId);
    const abortController = normalizedRequestId ? new AbortController() : null;
    if (normalizedRequestId && abortController) {
      faucetRequestControllers
        .get(normalizedRequestId)
        ?.abort(createFaucetAbortError());
      faucetRequestControllers.set(normalizedRequestId, abortController);
    }

    try {
      const signal = abortController?.signal;
      for (
        let attempt = 1;
        attempt <= FAUCET_CLAIM_MAX_ATTEMPTS;
        attempt += 1
      ) {
        throwIfAborted(signal);
        await assertFaucetEndpointFinalizing(baseUrl, signal);
        const result = await requestFaucetFundsWithPuzzle({
          baseUrl,
          accountId: normalizedAccountId,
          networkPrefix,
          fetchImpl: nodeFetch,
          signal,
          onStatus,
        });
        throwIfAborted(signal);
        const txHashHex = trimString(result.tx_hash_hex);
        if (!txHashHex) {
          return result;
        }

        try {
          await onStatus?.({
            phase: "claimAccepted",
            attempt,
            attempts: FAUCET_CLAIM_MAX_ATTEMPTS,
            txHashHex,
          });
        } catch {
          // Renderer-side status hooks must not break the faucet request itself.
        }
        try {
          await onStatus?.({
            phase: "waitingForCommit",
            attempt,
            attempts: FAUCET_CLAIM_MAX_ATTEMPTS,
            txHashHex,
          });
        } catch {
          // Renderer-side status hooks must not break the faucet request itself.
        }

        const {
          statusKind,
          statusPayload,
          timedOut,
          lastError,
          fundedAssetVisible,
          pipelineStatusInvisible,
        } = await waitForFaucetClaimFinality(
          client,
          txHashHex,
          normalizedAccountId,
          trimString(result.asset_id),
          trimString(result.asset_definition_id),
          signal,
        );
        throwIfAborted(signal);
        if (fundedAssetVisible) {
          try {
            await onStatus?.({
              phase: "claimCommitted",
              attempt,
              attempts: FAUCET_CLAIM_MAX_ATTEMPTS,
              txHashHex,
            });
          } catch {
            // Renderer-side status hooks must not break the faucet request itself.
          }
          const fee = await fetchCommittedTransactionFee(
            baseUrl,
            txHashHex,
            statusPayload,
          );
          return {
            ...result,
            status: statusKind || "Funded",
            ...(fee ? { fee } : {}),
          };
        }
        if (statusKind && FAUCET_CLAIM_SUCCESS_STATUSES.has(statusKind)) {
          try {
            await onStatus?.({
              phase: "claimCommitted",
              attempt,
              attempts: FAUCET_CLAIM_MAX_ATTEMPTS,
              txHashHex,
            });
          } catch {
            // Renderer-side status hooks must not break the faucet request itself.
          }
          const fee = await fetchCommittedTransactionFee(
            baseUrl,
            txHashHex,
            statusPayload,
          );
          return {
            ...result,
            status: statusKind,
            ...(fee ? { fee } : {}),
          };
        }
        if (
          (statusKind === "Expired" || pipelineStatusInvisible) &&
          attempt < FAUCET_CLAIM_MAX_ATTEMPTS
        ) {
          if (pipelineStatusInvisible) {
            await assertFaucetEndpointFinalizing(baseUrl, signal);
          }
          throwIfAborted(signal);
          let retryStatusSnapshot: StatusSnapshot | null = null;
          try {
            retryStatusSnapshot = await client.getStatusSnapshot();
            throwIfAborted(signal);
          } catch {
            throwIfAborted(signal);
            retryStatusSnapshot = null;
          }
          const retryDelayMs = readFaucetClaimRetryDelayMs(
            attempt,
            retryStatusSnapshot,
          );
          try {
            await onStatus?.({
              phase: "waitingForClaimRetry",
              attempt: attempt + 1,
              attempts: FAUCET_CLAIM_MAX_ATTEMPTS,
              txHashHex,
            });
          } catch {
            // Renderer-side status hooks must not break the faucet request itself.
          }
          await waitForMs(retryDelayMs, signal);
          continue;
        }
        throw buildFaucetClaimFinalityError(
          txHashHex,
          statusKind,
          timedOut,
          pipelineStatusInvisible,
          lastError,
        );
      }

      throw new Error(
        "The network kept expiring faucet claims before they committed. Please retry once the faucet queue clears.",
      );
    } finally {
      if (
        normalizedRequestId &&
        faucetRequestControllers.get(normalizedRequestId) === abortController
      ) {
        faucetRequestControllers.delete(normalizedRequestId);
      }
    }
  },
  async cancelFaucetRequest({ requestId }) {
    const normalizedRequestId = trimString(requestId);
    if (!normalizedRequestId) {
      return { canceled: false };
    }
    const controller = faucetRequestControllers.get(normalizedRequestId);
    if (!controller) {
      return { canceled: false };
    }
    controller.abort(createFaucetAbortError());
    faucetRequestControllers.delete(normalizedRequestId);
    return { canceled: true };
  },
  async createKaigiMeeting({
    toriiUrl,
    chainId,
    hostAccountId,
    privateKeyHex,
    callId,
    title,
    scheduledStartMs,
    meetingCode,
    inviteSecretBase64Url,
    hostDisplayName,
    hostParticipantId,
    hostKaigiPublicKeyBase64Url,
    offerDescription,
    privacyMode,
    peerIdentityReveal,
  }) {
    const authority = normalizeCompatAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting creation",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const normalizedScheduledStartMs = normalizeTimestampMs(
      scheduledStartMs,
      "scheduledStartMs",
    );
    const createdAtMs = Date.now();
    const expiresAtMs = normalizedScheduledStartMs + 24 * 60 * 60 * 1000;
    const resolvedPrivacyMode = normalizeKaigiMeetingPrivacy(privacyMode);
    const resolvedPeerIdentityReveal =
      normalizeKaigiPeerIdentityReveal(peerIdentityReveal);
    const normalizedHostParticipantId =
      normalizeKaigiParticipantId(hostParticipantId);
    const inviteSecret = normalizeBase64UrlString(
      inviteSecretBase64Url,
      "inviteSecretBase64Url",
    );
    const resolvedRelayManifest = await resolveKaigiRelayManifest(
      getClient(toriiUrl),
      expiresAtMs,
    );
    const encryptedOffer = encryptKaigiPayloadWithSecret(
      {
        schema: KAIGI_CALL_OFFER_SCHEMA,
        callId: normalizedCallId,
        ...(resolvedPrivacyMode === "transparent"
          ? { hostAccountId: authority }
          : {}),
        hostDisplayName: String(hostDisplayName ?? "").trim() || "Host",
        hostParticipantId: normalizedHostParticipantId,
        hostKaigiPublicKeyBase64Url: normalizeBase64UrlString(
          hostKaigiPublicKeyBase64Url,
          "hostKaigiPublicKeyBase64Url",
        ),
        createdAtMs,
        description: normalizeKaigiOfferDescription(offerDescription),
      } satisfies KaigiCallOfferPayload,
      inviteSecret,
    );
    const hostCreateProof =
      resolvedPrivacyMode === "private"
        ? buildKaigiRosterJoinProof({
            seed: deriveKaigiHostActionSeed({
              callId: normalizedCallId,
              hostAccountId: authority,
              privateKeyHex: resolvedPrivateKeyHex,
            }),
          })
        : null;
    const callMetadata = {
      kaigi_call: {
        schema: KAIGI_CALL_METADATA_SCHEMA,
        meetingCode:
          String(meetingCode ?? "").trim() ||
          normalizeKaigiMeetingCode(null, normalizedCallId),
        expiresAtMs,
        live: true,
        privacyMode: resolvedPrivacyMode,
        peerIdentityReveal: resolvedPeerIdentityReveal,
        encryptedOffer,
      } satisfies KaigiCallMetadata,
    };

    if (resolvedPrivacyMode === "private" && hostCreateProof) {
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        toriiUrl,
        chainId,
        accountId: authority,
        action: "create",
        proofByteLength: Buffer.from(hostCreateProof.proofBase64, "base64")
          .length,
        buildEntrypoint: ({ feeSpend, creationTimeMs, nonce }) =>
          buildPrivateCreateKaigiTransaction({
            chainId: chainId.trim(),
            call: {
              id: toPrivateKaigiCallIdDto(normalizedCallId, "callId"),
              title: title?.trim() || null,
              description: null,
              max_participants: null,
              gas_rate_per_minute: 0,
              metadata: callMetadata,
              scheduled_start_ms: normalizedScheduledStartMs,
              privacy_mode: {
                mode: "ZkRosterV1",
                state: null,
              },
              room_policy: {
                policy: "Authenticated",
                state: null,
              },
              relay_manifest: resolvedRelayManifest
                ? {
                    expiry_ms: resolvedRelayManifest.expiryMs,
                    hops: resolvedRelayManifest.hops.map((hop) => ({
                      relay_id: hop.relayId,
                      hpke_public_key: hop.hpkePublicKey,
                      weight: hop.weight,
                    })),
                  }
                : null,
            },
            artifacts: buildPrivateKaigiArtifactsDto({
              commitmentHex: hostCreateProof.commitmentHex,
              nullifierHex: hostCreateProof.nullifierHex,
              issuedAtMs: createdAtMs,
              rosterRootHex: hostCreateProof.rosterRootHex,
              proofBase64: hostCreateProof.proofBase64,
            }),
            feeSpend,
            creationTimeMs,
            nonce,
          }),
      });
      const submission = await submitTransactionEntrypointAndWaitForCommit(
        toriiUrl,
        entrypoint.transactionEntrypoint,
        entrypoint.hashHex,
      );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = buildCreateKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      call: {
        id: normalizedCallId,
        host: authority,
        title: title?.trim() || null,
        scheduledStartMs: normalizedScheduledStartMs,
        privacyMode: "Transparent",
        roomPolicy: "authenticated",
        relayManifest: resolvedRelayManifest,
        metadata: callMetadata,
      },
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  async getKaigiCall({ toriiUrl, callId, inviteSecretBase64Url }) {
    return fetchKaigiMeetingView({
      toriiUrl,
      callId,
      inviteSecretBase64Url,
    });
  },
  async joinKaigiMeeting({
    toriiUrl,
    chainId,
    participantAccountId,
    privateKeyHex,
    callId,
    hostAccountId,
    hostKaigiPublicKeyBase64Url,
    participantId,
    participantName,
    walletIdentity,
    roomId,
    privacyMode,
    rosterRootHex,
    answerDescription,
  }) {
    const authority = normalizeCompatAccountIdLiteral(
      participantAccountId,
      "participantAccountId",
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting join",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const resolvedPrivacyMode = normalizeKaigiMeetingPrivacy(privacyMode);
    const createdAtMs = Date.now();
    const revealWalletIdentity =
      resolvedPrivacyMode === "transparent" ||
      String(walletIdentity ?? "").trim().length > 0;
    const answerPayload: KaigiChainAnswerPayload = {
      schema: KAIGI_CHAIN_ANSWER_SCHEMA,
      callId: normalizedCallId,
      kind: "answer",
      ...(revealWalletIdentity ? { participantAccountId: authority } : {}),
      participantId: normalizeKaigiParticipantId(participantId),
      participantName: String(participantName ?? "").trim() || "Participant",
      ...(String(walletIdentity ?? "").trim()
        ? { walletIdentity: String(walletIdentity).trim() }
        : {}),
      ...(String(roomId ?? "").trim() ? { roomId: String(roomId).trim() } : {}),
      createdAtMs,
      description: normalizeKaigiAnswerDescription(answerDescription),
    };
    const metadata: Record<string, unknown> = {
      kaigi_signal: {
        schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
        callId: answerPayload.callId,
        signalKind: "answer",
        ...(resolvedPrivacyMode === "transparent" && hostAccountId
          ? {
              hostAccountId: normalizeCompatAccountIdLiteral(
                hostAccountId,
                "hostAccountId",
              ),
            }
          : {}),
        ...(revealWalletIdentity ? { participantAccountId: authority } : {}),
        createdAtMs,
        encryptedSignal: encryptKaigiPayload(
          answerPayload,
          hostKaigiPublicKeyBase64Url,
        ),
      } satisfies KaigiChainSignalMetadata,
    };
    if (resolvedPrivacyMode === "private") {
      const joinProof = buildKaigiRosterJoinProof({
        seed: deriveKaigiRosterJoinSeed({
          callId: normalizedCallId,
          participantAccountId: authority,
          privateKeyHex: resolvedPrivateKeyHex,
        }),
        rosterRootHex: normalizeKaigiRosterRootHex(
          rosterRootHex,
          "rosterRootHex",
        ),
      });
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        toriiUrl,
        chainId,
        accountId: authority,
        action: "join",
        proofByteLength: Buffer.from(joinProof.proofBase64, "base64").length,
        buildEntrypoint: ({ feeSpend, creationTimeMs, nonce }) =>
          buildPrivateJoinKaigiTransaction({
            chainId: chainId.trim(),
            callId: normalizedCallId,
            artifacts: buildPrivateKaigiArtifactsDto({
              commitmentHex: joinProof.commitmentHex,
              nullifierHex: joinProof.nullifierHex,
              issuedAtMs: createdAtMs,
              rosterRootHex: joinProof.rosterRootHex,
              proofBase64: joinProof.proofBase64,
            }),
            feeSpend,
            metadata,
            creationTimeMs,
            nonce,
          }),
      });
      const submission = await submitTransactionEntrypointAndWaitForCommit(
        toriiUrl,
        entrypoint.transactionEntrypoint,
        entrypoint.hashHex,
      );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = buildJoinKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      join: {
        callId: answerPayload.callId,
        participant: authority,
      },
      metadata: withRequiredGasAssetMetadata(metadata, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  async watchKaigiCallEvents({ toriiUrl, callId }, onEvent) {
    const client = getClient(toriiUrl);
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const subscriptionId = randomBytes(16).toString("hex");
    const controller = new AbortController();
    kaigiCallWatchers.set(subscriptionId, controller);

    void (async () => {
      try {
        for await (const event of client.streamKaigiCallEvents(
          normalizedCallId,
          {
            signal: controller.signal,
          },
        )) {
          if (controller.signal.aborted) {
            break;
          }
          const normalizedEvent = normalizeKaigiCallEvent(event.data);
          if (!normalizedEvent || normalizedEvent.callId !== normalizedCallId) {
            continue;
          }
          await onEvent(normalizedEvent);
        }
      } catch (_error) {
        // Keep the stream silent so the UI can preserve the manual fallback.
      } finally {
        kaigiCallWatchers.delete(subscriptionId);
      }
    })();

    return subscriptionId;
  },
  stopWatchingKaigiCallEvents(subscriptionId) {
    const key = String(subscriptionId ?? "").trim();
    if (!key) {
      return;
    }
    const watcher = kaigiCallWatchers.get(key);
    if (!watcher) {
      return;
    }
    watcher.abort();
    kaigiCallWatchers.delete(key);
  },
  async pollKaigiMeetingSignals({
    toriiUrl,
    callId,
    hostKaigiKeys,
    afterTimestampMs,
    limit = 50,
    offset,
  }) {
    const client = getClient(toriiUrl);
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const signalsResponse = await client.listKaigiCallSignals(
      normalizedCallId,
      {
        ...(afterTimestampMs === undefined
          ? {}
          : {
              afterTimestampMs: normalizeTimestampMs(
                afterTimestampMs,
                "afterTimestampMs",
              ),
            }),
        limit,
        offset,
      },
    );
    const signals = (signalsResponse.items ?? [])
      .flatMap((item) => {
        try {
          const record =
            item && typeof item === "object" && !Array.isArray(item)
              ? (item as unknown as Record<string, unknown>)
              : null;
          if (!record) {
            return [];
          }
          const chainSignal = parseKaigiChainSignalMetadata({
            metadata: record.metadata,
          });
          if (!chainSignal || chainSignal.callId !== normalizedCallId) {
            return [];
          }
          const decrypted = parseKaigiChainAnswerPayload(
            decryptKaigiPayload(chainSignal.encryptedSignal, hostKaigiKeys),
          );
          const entrypointHash = String(record.entrypoint_hash ?? "").trim();
          if (!entrypointHash) {
            return [];
          }
          const authority = normalizeOptionalCompatAccountIdLiteral(
            record.authority ?? decrypted.participantAccountId,
            "transaction.authority",
          );
          const timestampMs = Number(record.timestamp_ms);
          return [
            {
              entrypointHash,
              ...(authority ? { authority } : {}),
              ...(Number.isFinite(timestampMs) && timestampMs > 0
                ? { timestampMs }
                : {}),
              callId: decrypted.callId,
              ...(decrypted.participantAccountId
                ? { participantAccountId: decrypted.participantAccountId }
                : {}),
              participantId: decrypted.participantId,
              participantName: decrypted.participantName,
              ...(decrypted.walletIdentity
                ? { walletIdentity: decrypted.walletIdentity }
                : {}),
              ...(decrypted.roomId ? { roomId: decrypted.roomId } : {}),
              createdAtMs: decrypted.createdAtMs,
              answerDescription: decrypted.description,
            } satisfies KaigiMeetingSignalRecord,
          ];
        } catch (_error) {
          return [];
        }
      })
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
    return signals;
  },
  async endKaigiMeeting({
    toriiUrl,
    chainId,
    hostAccountId,
    privateKeyHex,
    callId,
    endedAtMs,
  }) {
    const authority = normalizeCompatAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting end",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const resolvedEndedAtMs =
      endedAtMs === undefined
        ? Date.now()
        : normalizeTimestampMs(endedAtMs, "endedAtMs");
    const client = getClient(toriiUrl);
    const callPayload = (await client.getKaigiCall(
      normalizedCallId,
    )) as KaigiCallView;
    const resolvedPrivacyMode = normalizeKaigiMeetingPrivacy(
      callPayload.privacy_mode,
    );
    const hostEndProof =
      resolvedPrivacyMode === "private"
        ? buildKaigiRosterJoinProof({
            seed: deriveKaigiHostActionSeed({
              callId: normalizedCallId,
              hostAccountId: authority,
              privateKeyHex: resolvedPrivateKeyHex,
            }),
            rosterRootHex: normalizeKaigiRosterRootHex(
              callPayload.roster_root_hex,
              "kaigi call.roster_root_hex",
            ),
          })
        : null;

    if (resolvedPrivacyMode === "private" && hostEndProof) {
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        toriiUrl,
        chainId,
        accountId: authority,
        action: "end",
        proofByteLength: Buffer.from(hostEndProof.proofBase64, "base64").length,
        buildEntrypoint: ({ feeSpend, creationTimeMs, nonce }) =>
          buildPrivateEndKaigiTransaction({
            chainId: chainId.trim(),
            callId: normalizedCallId,
            endedAtMs: resolvedEndedAtMs,
            artifacts: buildPrivateKaigiArtifactsDto({
              commitmentHex: hostEndProof.commitmentHex,
              nullifierHex: hostEndProof.nullifierHex,
              issuedAtMs: resolvedEndedAtMs,
              rosterRootHex: hostEndProof.rosterRootHex,
              proofBase64: hostEndProof.proofBase64,
            }),
            feeSpend,
            creationTimeMs,
            nonce,
          }),
      });
      const submission = await submitTransactionEntrypointAndWaitForCommit(
        toriiUrl,
        entrypoint.transactionEntrypoint,
        entrypoint.hashHex,
      );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = buildEndKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      end: {
        callId: normalizedCallId,
        endedAtMs: resolvedEndedAtMs,
      },
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  async createConnectPreview({ toriiUrl, chainId, node, launchProtocol }) {
    const client = getClient(toriiUrl);
    const baseUrl = new URL(normalizeBaseUrl(toriiUrl));
    const nodeHint = node ?? baseUrl.host;
    const { preview, session, tokens } =
      await bootstrapPortableConnectPreviewSession(client, {
        chainId,
        node: nodeHint,
      });
    const normalizedLaunchProtocol = launchProtocol?.trim() || "irohaconnect";
    const walletCanonicalUri = session?.wallet_uri ?? preview.walletUri ?? null;
    const appCanonicalUri = session?.app_uri ?? preview.appUri ?? null;
    return {
      sidHex: toHex(Buffer.from(preview.sidBytes)),
      sidBase64Url: preview.sidBase64Url,
      walletUri: resolvePortableConnectLaunchUri(
        walletCanonicalUri,
        preview.walletUri,
        normalizedLaunchProtocol,
      ),
      appUri: resolvePortableConnectLaunchUri(
        appCanonicalUri,
        preview.appUri,
        normalizedLaunchProtocol,
      ),
      walletCanonicalUri,
      appCanonicalUri,
      launchProtocol: normalizedLaunchProtocol,
      tokenApp: tokens?.app ?? null,
      tokenWallet: tokens?.wallet ?? null,
      appPublicKeyHex: toHex(Buffer.from(preview.appKeyPair.publicKey)),
      appPrivateKeyHex: toHex(Buffer.from(preview.appKeyPair.privateKey)),
    };
  },
  getSumeragiStatus(config) {
    const client = getClient(config.toriiUrl);
    return client.getSumeragiStatusTyped();
  },
  async getNexusPublicLaneValidators({ toriiUrl, laneId }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/validators`,
    );
    const payload = await fetchJson(endpoint, "Public lane validators");
    return normalizePublicLaneValidatorsPayload(payload);
  },
  async getNexusPublicLaneStake({ toriiUrl, laneId, validator }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/stake`,
      {
        validator: validator
          ? normalizeCompatAccountIdLiteral(validator, "validator")
          : undefined,
      },
    );
    const payload = await fetchJson(endpoint, "Public lane stake");
    return normalizePublicLaneStakePayload(payload);
  },
  async getNexusPublicLaneRewards({
    toriiUrl,
    laneId,
    account,
    assetId,
    uptoEpoch,
  }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/rewards/pending`,
      {
        account: normalizeCompatAccountIdLiteral(account, "account"),
        asset_id: assetId,
        upto_epoch:
          uptoEpoch === undefined
            ? undefined
            : normalizePositiveEpoch(uptoEpoch, "uptoEpoch"),
      },
    );
    const payload = await fetchJson(endpoint, "Public lane rewards");
    return normalizePublicLaneRewardsPayload(payload);
  },
  async getNexusStakingPolicy(config) {
    const client = getClient(config.toriiUrl);
    const payload = await client.getConfiguration();
    const configuration = ensureObjectResponse(payload, "Configuration");
    return {
      unbondingDelayMs: readNexusUnbondingDelayMs(configuration),
    };
  },
  listSubscriptionPlans(input) {
    return listSubscriptionPlansFromTorii(input);
  },
  listSubscriptions(input) {
    return listSubscriptionsFromTorii(input);
  },
  getSubscription(input) {
    return getSubscriptionFromTorii(input);
  },
  createSubscription(input) {
    return createSubscriptionOnTorii(input);
  },
  pauseSubscription(input) {
    return postSubscriptionActionToTorii(input, "pause", "Pause subscription");
  },
  resumeSubscription(input) {
    return postSubscriptionActionToTorii(
      input,
      "resume",
      "Resume subscription",
    );
  },
  cancelSubscription(input) {
    return postSubscriptionActionToTorii(
      {
        ...input,
        cancelMode: input.cancelMode ?? "period_end",
      },
      "cancel",
      "Cancel subscription",
    );
  },
  keepSubscription(input) {
    return postSubscriptionActionToTorii(input, "keep", "Keep subscription");
  },
  chargeSubscriptionNow(input) {
    return postSubscriptionActionToTorii(
      input,
      "charge-now",
      "Charge subscription",
    );
  },
  getSoraCloudStatus(input) {
    return getSoraCloudStatusFromTorii(input);
  },
  deploySoraCloudHf(input) {
    return deploySoraCloudHfOnTorii(input);
  },
  getSoraCloudHfStatus(input) {
    return getSoraCloudHfStatusFromTorii(input);
  },
  getParameters({ toriiUrl }) {
    return getParametersFromTorii({ toriiUrl });
  },
  getSccpCapabilities({ toriiUrl }) {
    return getSccpCapabilitiesFromTorii({ toriiUrl });
  },
  getSccpProofManifests({ toriiUrl }) {
    return getSccpProofManifestsFromTorii({ toriiUrl });
  },
  listSccpRecentMessages(input) {
    return listSccpRecentMessagesFromTorii(input);
  },
  getSccpMessageProofBundle(input) {
    return getSccpMessageProofBundleFromTorii(input);
  },
  getSccpMessageProofArtifact(input) {
    const client = getClient(input.toriiUrl);
    return client.getSccpMessageProofArtifact(
      input.messageId,
      buildSccpDestinationProofOptions(input),
    );
  },
  getSccpMessageProofJob(input) {
    const client = getClient(input.toriiUrl);
    return client.getSccpMessageProofJob(
      input.messageId,
      buildSccpDestinationProofOptions(input),
    );
  },
  proveBscSccpProof(input) {
    return proveBscSccpProofInNode(input);
  },
  proveBscSccpSourceProof(input) {
    return proveBscSccpSourceProofInNode(input);
  },
  submitSccpBridgeProof(input) {
    return submitSccpBridgeProofToTorii(input);
  },
  submitSccpBridgeMessage(input) {
    return submitSccpBridgeMessageToTorii(input);
  },
  waitForSccpTransactionCommit(input) {
    return waitForSccpTransactionCommitOnTorii(input);
  },
  deploySccpTairaInboundSettlementContract(input) {
    return deploySccpTairaInboundSettlementContractToTorii(input);
  },
  deriveZkIvmPayload(input) {
    return deriveZkIvmPayloadOnTorii(input);
  },
  startZkIvmProveJob(input) {
    return startZkIvmProveJobOnTorii(input);
  },
  getZkIvmProveJob(input) {
    return getZkIvmProveJobFromTorii(input);
  },
  cancelZkIvmProveJob(input) {
    return cancelZkIvmProveJobOnTorii(input);
  },
  submitZkIvmProvedTransaction(input) {
    return submitZkIvmProvedTransactionToTorii(input);
  },
  getTronTransaction(input) {
    return getTronTransactionFromGateway(input);
  },
  getTronAccount(input) {
    return getTronAccountFromGateway(input);
  },
  getTronTransactionReceipt(input) {
    return getTronTransactionReceiptFromGateway(input);
  },
  getTronTransactionEvents(input) {
    return getTronTransactionEventsFromGateway(input);
  },
  getTronSolidBlock(input) {
    return getTronSolidBlockFromGateway(input);
  },
  getTronWitnesses(input) {
    return getTronWitnessesFromGateway(input);
  },
  getTronFinalityData(input) {
    return getTronFinalityDataFromGateway(input);
  },
  getSccpNileTestTronSigner() {
    return getSccpNileTestTronSignerStatus();
  },
  signSccpNileTestTronTransaction(input) {
    return signSccpNileTestTronTransaction(input);
  },
  broadcastTronTransaction(input) {
    return broadcastTronTransactionToGateway(input);
  },
  triggerTronSmartContract(input) {
    return triggerTronSmartContractFromGateway(input);
  },
  triggerTronConstantContract(input) {
    return triggerTronConstantContractFromGateway(input);
  },
  callEvmRpc(input) {
    return callEvmRpcOnGateway(input);
  },
  getEvmChainId(input) {
    return getEvmChainIdFromRpc(input);
  },
  getEvmBalance(input) {
    return getEvmBalanceFromRpc(input);
  },
  getEvmCode(input) {
    return getEvmCodeFromRpc(input);
  },
  callEvmContract(input) {
    return callEvmContractFromRpc(input);
  },
  getEvmTransactionReceipt(input) {
    return getEvmTransactionReceiptFromRpc(input);
  },
  getEvmTransaction(input) {
    return getEvmTransactionFromRpc(input);
  },
  getEvmBlockByHash(input) {
    return getEvmBlockByHashFromRpc(input);
  },
  getEvmLogs(input) {
    return getEvmLogsFromRpc(input);
  },
  bondPublicLaneStake({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    amount,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        BondPublicLaneStake: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
          amount: normalizeAmount(amount, "amount"),
        },
      },
    });
  },
  registerPublicLaneValidator({
    toriiUrl,
    chainId,
    laneId,
    validatorAccountId,
    stakeAccountId,
    peerId,
    selfStake,
    metadata,
    privateKeyHex,
  }) {
    const normalizedValidator = normalizeCompatAccountIdLiteral(
      validatorAccountId,
      "validatorAccountId",
    );
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId || validatorAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedValidator,
      privateKeyHex,
      instruction: {
        RegisterPublicLaneValidator: {
          lane_id: normalizeLaneId(laneId),
          validator: normalizedValidator,
          stake_account: normalizedStakeAccount,
          peer_id: normalizeNonEmptyString(peerId, "peerId"),
          initial_stake: normalizeAmount(selfStake, "selfStake"),
          metadata: isPlainRecord(metadata) ? metadata : {},
        },
      },
    });
  },
  schedulePublicLaneUnbond({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    amount,
    requestId,
    releaseAtMs,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        SchedulePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
          amount: normalizeAmount(amount, "amount"),
          request_id: normalizeRequestId(requestId),
          release_at_ms: normalizeReleaseAtMs(releaseAtMs),
        },
      },
    });
  },
  finalizePublicLaneUnbond({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    requestId,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        FinalizePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
          request_id: normalizeRequestId(requestId),
        },
      },
    });
  },
  claimPublicLaneRewards({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        ClaimPublicLaneRewards: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
        },
      },
    });
  },
};

contextBridge.exposeInMainWorld("iroha", api);

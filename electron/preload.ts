import { contextBridge, ipcRenderer } from "electron";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "crypto";
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
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  submitTransactionEntrypoint,
  submitSignedTransaction,
  extractPipelineStatusKind,
  normalizeAssetId,
  type KaigiCallView,
  type ToriiSumeragiStatus,
} from "@iroha/iroha-js";
import {
  buildKaigiRosterJoinProof,
  generateKeyPair,
  publicKeyFromPrivate,
} from "@iroha/iroha-js/crypto";
import {
  confidentialModeSupportsShield,
  formatOnboardingError,
  isPositiveWholeAmount,
  normalizeAccountAssetListPayload,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  normalizeExplorerAccountQrPayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readApiErrorDetail,
  readNexusUnbondingDelayMs,
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
  extractAssetDefinitionId,
  resolveUniqueLiveAssetDefinitionId,
} from "../src/utils/assetId";
import type { NetworkStatsResponse } from "../src/types/iroha";
import { deriveOnChainShieldedBalance } from "../src/utils/confidential";
import { nodeFetch } from "./nodeFetch";
import {
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
import { configureIrohaJsNativeDir } from "./irohaJsNativeDir";
import { type ConfidentialReceiveKeyRecord } from "./secureVault";
import {
  CONFIDENTIAL_WALLET_BACKUP_KDF_INFO,
  CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
  type ConfidentialWalletBackupMetadata,
  type ConfidentialWalletBackupMetadataV2,
  type ConfidentialWalletBackupStateBoxV2,
} from "../src/utils/walletBackup";
import { normalizeMnemonicPhrase } from "../src/utils/mnemonic";

type HexString = string;

configureIrohaJsNativeDir(import.meta.url);

type ToriiConfig = {
  toriiUrl: string;
};

const trimString = (value: unknown): string => String(value ?? "").trim();
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const assertNoConfidentialPublicMetadata = (
  metadata: Record<string, unknown> | undefined,
  operationLabel: string,
): undefined => {
  if (!isPlainRecord(metadata)) {
    return undefined;
  }
  if (Object.keys(metadata).length > 0) {
    throw new Error(
      `${operationLabel} does not allow public metadata or memos.`,
    );
  }
  return undefined;
};
const TAIRA_XOR_GAS_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const withRequiredGasAssetMetadata = (
  metadata: Record<string, unknown> | undefined,
) => ({
  ...(isPlainRecord(metadata) ? { ...metadata } : {}),
  gas_asset_id: TAIRA_XOR_GAS_ASSET_DEFINITION_ID,
});
const FAUCET_CLAIM_STATUS_TIMEOUT_MS = 240_000;
const FAUCET_CLAIM_STATUS_INTERVAL_MS = 1_000;
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
}): Promise<void> => {
  await ipcRenderer.invoke("vault:storeAccountSecret", input);
};

const getAccountSecretFromVault = async (
  accountId: string,
): Promise<string | null> =>
  (await ipcRenderer.invoke("vault:getAccountSecret", {
    accountId,
  })) as string | null;

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
};

type TransferAssetInput = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  accountId: string;
  destinationAccountId?: string;
  quantity: string;
  privateKeyHex?: HexString;
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

type OfflineAllowanceResponse = Awaited<
  ReturnType<ToriiClient["listOfflineAllowances"]>
>;

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

type GovernanceCouncilResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceCouncilCurrent"]>
>;

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
  accountId: string;
  privateKeyHex?: HexString;
  exitClass: "standard" | "low-latency" | "high-security";
};

type VpnDisconnectInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: HexString;
};

type VpnStatusInput = Partial<VpnDisconnectInput>;

type RegisterCitizenInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  amount: string;
  privateKeyHex?: HexString;
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

type GovernanceFinalizeInput = {
  toriiUrl: string;
  referendumId: string;
  proposalId: string;
};

type GovernanceEnactInput = {
  toriiUrl: string;
  proposalId: string;
};

type IrohaBridge = {
  ping(config: ToriiConfig): Promise<HealthResponse>;
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string };
  generateKaigiSignalKeyPair(): KaigiSignalKeyPair;
  isSecureVaultAvailable(): Promise<boolean>;
  storeAccountSecret(input: {
    accountId: string;
    privateKeyHex: string;
  }): Promise<void>;
  listAccountSecretFlags(input: {
    accountIds: string[];
  }): Promise<Record<string, boolean>>;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix?: number;
  }): {
    accountId: string;
    i105AccountId: string;
    i105DefaultAccountId: string;
    i105DefaultFullwidthAccountId?: string;
    publicKeyHex: string;
    accountIdWarning: string;
  };
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string };
  deriveConfidentialOwnerTag(privateKeyHex: string): { ownerTagHex: string };
  deriveConfidentialReceiveAddress(privateKeyHex: string): {
    ownerTagHex: string;
    diversifierHex: string;
  };
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
  registerAccount(input: RegisterAccountInput): Promise<{ hash: string }>;
  transferAsset(input: TransferAssetInput): Promise<{ hash: string }>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
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
  }): Promise<{ hash: string }>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionsResponse>;
  listAccountPermissions(
    input: AccountPermissionsInput,
  ): Promise<AccountPermissionsResponse>;
  registerCitizen(input: RegisterCitizenInput): Promise<{ hash: string }>;
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
  getGovernanceCouncilCurrent(
    config: ToriiConfig,
  ): Promise<GovernanceCouncilResponse>;
  submitGovernancePlainBallot(
    input: GovernancePlainBallotInput,
  ): Promise<{ hash: string }>;
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
    },
    onStatus?: FaucetStatusCallback,
  ): Promise<AccountFaucetResponse>;
  createKaigiMeeting(input: KaigiCreateMeetingInput): Promise<{ hash: string }>;
  getKaigiCall(input: KaigiGetMeetingInput): Promise<KaigiMeetingView>;
  joinKaigiMeeting(input: KaigiJoinMeetingInput): Promise<{ hash: string }>;
  watchKaigiCallEvents(
    input: KaigiWatchCallEventsInput,
    onEvent: KaigiCallEventCallback,
  ): Promise<string>;
  stopWatchingKaigiCallEvents(subscriptionId: string): void;
  pollKaigiMeetingSignals(
    input: KaigiPollMeetingSignalsInput,
  ): Promise<KaigiMeetingSignalRecord[]>;
  endKaigiMeeting(input: KaigiEndMeetingInput): Promise<{ hash: string }>;
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
  bondPublicLaneStake(
    input: BondPublicLaneStakeInput,
  ): Promise<{ hash: string }>;
  schedulePublicLaneUnbond(
    input: SchedulePublicLaneUnbondInput,
  ): Promise<{ hash: string }>;
  finalizePublicLaneUnbond(
    input: FinalizePublicLaneUnbondInput,
  ): Promise<{ hash: string }>;
  claimPublicLaneRewards(
    input: ClaimPublicLaneRewardsInput,
  ): Promise<{ hash: string }>;
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
    super(
      detail
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

const clientCache = new Map<string, ToriiClient>();
const kaigiCallWatchers = new Map<string, AbortController>();

const getClient = (toriiUrlRaw: string) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const cached = clientCache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const client = new ToriiClient(baseUrl, {
    fetchImpl: nodeFetch,
  });
  clientCache.set(baseUrl, client);
  return client;
};

const waitForMs = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const CONFIDENTIAL_TRANSFER_ROOT_RETRY_ATTEMPTS = 3;
const CONFIDENTIAL_TRANSFER_ROOT_RETRY_DELAY_MS = 750;
const FAUCET_CLAIM_SUCCESS_STATUSES = new Set(["Applied", "Committed"]);
const FAUCET_CLAIM_FAILURE_STATUSES = new Set(["Rejected", "Expired"]);
const isConfidentialRootHintMismatchError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error ?? "")).includes(
    "tree commitments do not match the supplied root_hint",
  );

const waitForFaucetClaimFinality = async (
  client: ToriiClient,
  txHashHex: string,
) => {
  const deadline = Date.now() + FAUCET_CLAIM_STATUS_TIMEOUT_MS;
  let lastStatusKind: string | null = null;
  let lastError: unknown = null;

  while (Date.now() <= deadline) {
    try {
      const payload = await client.getTransactionStatus(txHashHex);
      const statusKind = extractPipelineStatusKind(payload);
      lastStatusKind = statusKind;
      lastError = null;
      if (statusKind && FAUCET_CLAIM_SUCCESS_STATUSES.has(statusKind)) {
        return {
          statusKind,
          timedOut: false,
        };
      }
      if (statusKind && FAUCET_CLAIM_FAILURE_STATUSES.has(statusKind)) {
        return {
          statusKind,
          timedOut: false,
        };
      }
    } catch (error) {
      lastError = error;
    }

    if (Date.now() + FAUCET_CLAIM_STATUS_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(FAUCET_CLAIM_STATUS_INTERVAL_MS);
  }

  return {
    statusKind: lastStatusKind,
    timedOut: true,
    lastError,
  };
};

const buildFaucetClaimFinalityError = (
  txHashHex: string,
  statusKind: string | null,
  timedOut: boolean,
  lastError?: unknown,
) => {
  if (statusKind === "Expired") {
    return new Error(
      `Faucet claim ${txHashHex} expired before TAIRA committed it. Please retry once the faucet queue clears.`,
    );
  }
  if (statusKind === "Rejected") {
    return new Error(
      `Faucet claim ${txHashHex} was rejected on-chain before funding the wallet.`,
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
    `Faucet claim ${txHashHex} did not reach a committed state on TAIRA.`,
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

const resolveOptionalPrivateKeyHex = async (input: {
  accountId: string;
  privateKeyHex?: string;
}): Promise<string | null> => {
  const inlinePrivateKeyHex = trimString(input.privateKeyHex);
  if (inlinePrivateKeyHex) {
    return normalizePrivateKeyHex(inlinePrivateKeyHex);
  }
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
  );
  const storedSecret = await getAccountSecretFromVault(accountId);
  return storedSecret ? normalizePrivateKeyHex(storedSecret) : null;
};

const resolvePrivateKeyHex = async (input: {
  accountId: string;
  privateKeyHex?: string;
  operationLabel: string;
}): Promise<string> => {
  const resolved = await resolveOptionalPrivateKeyHex(input);
  if (resolved) {
    return resolved;
  }
  throw new Error(
    `${input.operationLabel} requires a stored wallet secret. Restore or save this wallet again.`,
  );
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
  const privateKeyHex = await resolvePrivateKeyHex({
    accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: input.operationLabel,
  });
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
const CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS = 180_000;
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
): Promise<Record<string, unknown>> => {
  const response = await nodeFetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, label);
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

const fetchExplorerAssetDefinitionSnapshot = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/snapshot`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition snapshot",
  );
  return normalizeExplorerAssetDefinitionSnapshotPayload(payload);
};

const fetchExplorerAssetDefinitionEconometrics = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/econometrics`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition econometrics",
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

const fetchTransactionRecordStatus = async (
  toriiUrl: string,
  hashHex: string,
): Promise<string | null> => {
  const endpoint = buildNexusEndpoint(
    toriiUrl,
    `/v1/transactions/${encodeURIComponent(hashHex)}`,
  );
  try {
    const payload = await fetchJson(endpoint, `Transaction ${hashHex}`);
    return extractTransactionRecordStatus(payload);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const waitForTransactionCommit = async (toriiUrl: string, hashHex: string) => {
  const client = getClient(toriiUrl);
  const deadline = Date.now() + CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS;
  let lastStatusKind: string | null = null;
  while (Date.now() <= deadline) {
    const payload = await client.getTransactionStatus(hashHex);
    const statusKind = extractPipelineStatusKind(payload);
    lastStatusKind = statusKind;
    if (statusKind && CONFIDENTIAL_TX_SUCCESS_STATUSES.has(statusKind)) {
      if (statusKind === "Applied") {
        const recordStatus = await fetchTransactionRecordStatus(
          toriiUrl,
          hashHex,
        );
        if (recordStatus) {
          lastStatusKind = recordStatus;
        }
        if (
          recordStatus &&
          CONFIDENTIAL_TX_FAILURE_STATUSES.has(recordStatus)
        ) {
          throw new Error(
            `Transaction ${hashHex} ${recordStatus.toLowerCase()} before it committed.`,
          );
        }
      }
      return;
    }
    if (statusKind && CONFIDENTIAL_TX_FAILURE_STATUSES.has(statusKind)) {
      throw new Error(
        `Transaction ${hashHex} ${statusKind.toLowerCase()} before it committed.`,
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
) => {
  const submission = await submitSignedTransaction(
    getClient(toriiUrl),
    signedTransaction,
  );
  await waitForTransactionCommit(toriiUrl, submission.hash);
  return submission;
};

const submitTransactionEntrypointAndWaitForCommit = async (
  toriiUrl: string,
  transactionEntrypoint: Buffer,
  hashHex: string,
) => {
  const submission = await submitTransactionEntrypoint(
    getClient(toriiUrl),
    transactionEntrypoint,
    {
      hashHex,
    },
  );
  await waitForTransactionCommit(toriiUrl, submission.hash);
  return submission;
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
  limit?: number;
  offset?: number;
}) => {
  const normalizedBaseUrl = `${normalizeBaseUrl(input.toriiUrl)}/`;
  const normalizedAccountId = encodeURIComponent(
    normalizeCanonicalAccountIdLiteral(input.accountId, "accountId"),
  );
  const endpoint = new URL(
    `v1/accounts/${normalizedAccountId}/assets`,
    normalizedBaseUrl,
  );
  endpoint.searchParams.set("limit", String(input.limit ?? 50));
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

const fetchPrivateKaigiAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) =>
  fetchJson(
    buildNexusEndpoint(
      toriiUrlRaw,
      `/v1/assets/definitions/${encodeURIComponent(assetDefinitionId.trim())}`,
    ),
    "Private Kaigi XOR asset definition",
  );

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
      throw new Error(
        `Transaction ${input.hashHex} ${statusKind.toLowerCase()} before it committed.`,
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
  const privateKeyHex = await resolvePrivateKeyHex({
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Confidential consolidation",
  });
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
    baseMetadata: withRequiredGasAssetMetadata(undefined),
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
  const privateKeyHex = await resolvePrivateKeyHex({
    accountId: authority,
    privateKeyHex: input.privateKeyHex,
    operationLabel: "Transaction submission",
  });
  const tx = buildTransaction({
    chainId,
    authority,
    instructions: [input.instruction],
    metadata: withRequiredGasAssetMetadata(undefined),
    privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
  });
  const submission = await submitSignedTransactionAndWaitForCommit(
    input.toriiUrl,
    tx.signedTransaction,
  );
  return { hash: submission.hash };
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
  async ping(config) {
    const client = getClient(config.toriiUrl);
    return client.getHealth().catch(() => null);
  },
  generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPair();
    return {
      publicKeyHex: toHex(publicKey),
      privateKeyHex: toHex(privateKey),
    };
  },
  generateKaigiSignalKeyPair() {
    return generateKaigiX25519KeyPair();
  },
  async isSecureVaultAvailable() {
    return await isSecureVaultAvailable();
  },
  async storeAccountSecret({ accountId, privateKeyHex }) {
    await storeAccountSecretInVault({
      accountId: normalizeCompatAccountIdLiteral(accountId, "accountId"),
      privateKeyHex,
    });
  },
  async listAccountSecretFlags({ accountIds }) {
    return await listAccountSecretFlagsFromVault(
      (Array.isArray(accountIds) ? accountIds : []).map((accountId) =>
        normalizeCompatAccountIdLiteral(accountId, "accountId"),
      ),
    );
  },
  deriveAccountAddress({ domain, publicKeyHex, networkPrefix }) {
    return deriveAccountAddressView({ domain, publicKeyHex, networkPrefix });
  },
  derivePublicKey(privateKeyHex) {
    const publicKey = publicKeyFromPrivate(
      hexToBuffer(privateKeyHex, "privateKeyHex"),
    );
    return { publicKeyHex: toHex(publicKey) };
  },
  deriveConfidentialOwnerTag(privateKeyHex) {
    return {
      ownerTagHex: deriveWalletConfidentialOwnerTagHex({ privateKeyHex }),
    };
  },
  deriveConfidentialReceiveAddress(privateKeyHex) {
    return deriveWalletConfidentialReceiveAddress({ privateKeyHex });
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
    const authorityPrivateKeyHex = await resolvePrivateKeyHex({
      accountId: authorityAccountId,
      privateKeyHex: input.authorityPrivateKeyHex,
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
      metadata: withRequiredGasAssetMetadata(undefined),
      privateKey: hexToBuffer(authorityPrivateKeyHex, "authorityPrivateKeyHex"),
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      input.toriiUrl,
      tx.signedTransaction,
    );
    return { hash: submission.hash };
  },
  async transferAsset(input) {
    const accountId = normalizeCompatAccountIdLiteral(
      input.accountId,
      "accountId",
    );
    const destinationAccountIdLiteral = trimString(input.destinationAccountId);
    const destinationAccountId = destinationAccountIdLiteral
      ? normalizeCompatAccountIdLiteral(
          destinationAccountIdLiteral,
          "destinationAccountId",
        )
      : "";
    const privateKeyHex = await resolvePrivateKeyHex({
      accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: input.unshield
        ? "Confidential public exit"
        : input.shielded
          ? "Shielded transfer"
          : "Transfer",
    });

    if (input.unshield) {
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
        chainId: input.chainId,
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
          chainId: input.chainId,
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
          chainId: input.chainId,
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
          chainId: input.chainId.trim(),
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
          chainId: input.chainId.trim(),
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
      const metadata =
        changeOutputs.length > 0
          ? buildWalletConfidentialMetadataV3({
              baseMetadata: withRequiredGasAssetMetadata(
                assertNoConfidentialPublicMetadata(
                  input.metadata,
                  "Confidential public exit",
                ),
              ),
              outputs: changeOutputs,
            })
          : withRequiredGasAssetMetadata(
              assertNoConfidentialPublicMetadata(
                input.metadata,
                "Confidential public exit",
              ),
            );
      const tx = buildUnshieldTransaction({
        chainId: input.chainId,
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
      return { hash: submission.hash };
    }

    if (input.shielded) {
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
      const confidentialBaseMetadata = assertNoConfidentialPublicMetadata(
        input.metadata,
        destinationAccountId === accountId
          ? "Private balance creation"
          : "Shielded transfer",
      );
      const confidentialTransactionMetadata = withRequiredGasAssetMetadata(
        confidentialBaseMetadata,
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
          chainId: input.chainId,
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
        });
        const submission = await submitSignedTransaction(
          getClient(input.toriiUrl),
          tx.signedTransaction,
        );
        await waitForTransactionCommit(input.toriiUrl, submission.hash);
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
        return { hash: submission.hash };
      }

      let materials = await resolveConfidentialTransferMaterials({
        toriiUrl: input.toriiUrl,
        chainId: input.chainId,
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
        const verifyingKeyContext = readInlineVerifyingKeyRecord(
          materials.verifyingKey,
        );
        const proofVerifyingKey = {
          id: materials.verifyingKey.id,
          record: verifyingKeyContext.record,
          inline_key: verifyingKeyContext.inlineKey,
        };
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
              chainId: input.chainId.trim(),
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
            chainId: input.chainId,
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
      const metadata = buildWalletConfidentialMetadataV3({
        baseMetadata: confidentialTransactionMetadata,
        outputs: orderedOutputs,
      });
      const tx = buildZkTransferTransaction({
        chainId: input.chainId,
        authority: accountId,
        transfer: {
          assetDefinitionId: materials.resolvedAssetId,
          inputs: proofEnvelope.nullifiers,
          outputs: proofEnvelope.outputCommitments,
          proof: {
            backend: String(
              (materials.verifyingKey as { id?: { backend?: string } }).id
                ?.backend ?? "halo2/ipa",
            ),
            proof: Buffer.from(proofEnvelope.proof),
            verifyingKeyRef: (
              materials.verifyingKey as {
                id?: { backend: string; name: string };
              }
            ).id,
          },
          rootHint: Buffer.from(selectedRootHintHex, "hex"),
        },
        metadata,
        privateKey,
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
      return { hash: submission.hash };
    }

    const client = getClient(input.toriiUrl);
    if (!destinationAccountId) {
      throw new Error("destinationAccountId is required.");
    }
    const configuredAssetId = String(input.assetDefinitionId ?? "").trim();
    if (!configuredAssetId) {
      throw new Error("assetDefinitionId is required.");
    }

    let sourceAssetId: string | null = null;
    try {
      sourceAssetId = normalizeAssetId(configuredAssetId, "sourceAssetId");
    } catch {
      sourceAssetId = null;
    }

    if (!sourceAssetId) {
      const assets = await client.listAccountAssets(accountId, {
        limit: 200,
      });
      const items = Array.isArray(assets?.items) ? assets.items : [];
      const exactMatch = items.find(
        (asset) => String(asset.asset_id ?? "").trim() === configuredAssetId,
      );
      const legacyMatch = items.find((asset) =>
        String(asset.asset_id ?? "").startsWith(`${configuredAssetId}##`),
      );
      const containsMatches = items.filter((asset) =>
        String(asset.asset_id ?? "")
          .toLowerCase()
          .includes(configuredAssetId.toLowerCase()),
      );
      const positiveBalanceMatches = items.filter((asset) => {
        const quantity = Number(String(asset.quantity ?? ""));
        return Number.isFinite(quantity) && quantity > 0;
      });

      const selectedAssetId = String(
        exactMatch?.asset_id ??
          legacyMatch?.asset_id ??
          (containsMatches.length === 1 ? containsMatches[0]?.asset_id : "") ??
          (positiveBalanceMatches.length === 1
            ? positiveBalanceMatches[0]?.asset_id
            : ""),
      ).trim();

      if (!selectedAssetId) {
        const available = items
          .map((asset) => String(asset.asset_id ?? "").trim())
          .filter(Boolean)
          .slice(0, 5);
        const availableHint = available.length
          ? ` Available asset IDs: ${available.join(", ")}.`
          : "";
        throw new Error(
          `Unable to resolve the source asset from configured value "${configuredAssetId}". Set Asset Definition ID to the canonical TAIRA asset literal for this account.${availableHint}`,
        );
      }
      sourceAssetId = normalizeAssetId(selectedAssetId, "sourceAssetId");
    }

    const tx = buildTransferAssetTransaction({
      chainId: input.chainId,
      authority: accountId,
      sourceAssetHoldingId: sourceAssetId,
      quantity: input.quantity,
      destinationAccountId,
      metadata: withRequiredGasAssetMetadata(input.metadata),
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      input.toriiUrl,
      tx.signedTransaction,
    );
    return { hash: submission.hash };
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
  fetchAccountAssets({ toriiUrl, accountId, limit = 50, offset }) {
    return fetchAccountAssetsList({
      toriiUrl,
      accountId,
      limit,
      offset,
    });
  },
  async fetchAccountTransactions({
    toriiUrl,
    accountId,
    privateKeyHex,
    limit = 20,
    offset,
  }) {
    const client = getClient(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
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
  registerCitizen({ toriiUrl, chainId, accountId, amount, privateKeyHex }) {
    const normalizedAccount = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    return submitInstructionTransaction({
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
  getGovernanceCouncilCurrent(config) {
    const client = getClient(config.toriiUrl);
    return client.getGovernanceCouncilCurrent();
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
      client.getExplorerMetrics(),
      client.getStatusSnapshot(),
      client.getSumeragiStatusTyped(),
      fetchExplorerAssetDefinitionSnapshot(
        toriiUrl,
        normalizedAssetDefinitionId,
      ),
      fetchExplorerAssetDefinitionEconometrics(
        toriiUrl,
        normalizedAssetDefinitionId,
      ),
    ]);

    const explorer =
      explorerResult.status === "fulfilled" ? explorerResult.value : null;
    if (explorerResult.status === "rejected") {
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
      runtime: extractRuntimeStatsFromStatusSnapshot(statusSnapshot, explorer),
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
    const privateKeyHex = await resolveOptionalPrivateKeyHex({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
    });
    return await ipcRenderer.invoke("vpn:getStatus", {
      ...input,
      ...(privateKeyHex ? { privateKeyHex } : {}),
    });
  },
  async connectVpn(input) {
    const privateKeyHex = await resolvePrivateKeyHex({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: "VPN connect",
    });
    return await ipcRenderer.invoke("vpn:connect", {
      ...input,
      privateKeyHex,
    });
  },
  async disconnectVpn(input) {
    const privateKeyHex = await resolvePrivateKeyHex({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      operationLabel: "VPN disconnect",
    });
    return await ipcRenderer.invoke("vpn:disconnect", {
      ...input,
      privateKeyHex,
    });
  },
  async repairVpn(input) {
    if (!input?.accountId) {
      return await ipcRenderer.invoke("vpn:repair", input);
    }
    const privateKeyHex = await resolveOptionalPrivateKeyHex({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
    });
    return await ipcRenderer.invoke("vpn:repair", {
      ...input,
      ...(privateKeyHex ? { privateKeyHex } : {}),
    });
  },
  async listVpnReceipts(input) {
    if (!input?.accountId) {
      return await ipcRenderer.invoke("vpn:listReceipts", input);
    }
    const privateKeyHex = await resolveOptionalPrivateKeyHex({
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
    });
    return await ipcRenderer.invoke("vpn:listReceipts", {
      ...input,
      ...(privateKeyHex ? { privateKeyHex } : {}),
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
    const client = getClient(toriiUrl);
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
  async requestFaucetFunds({ toriiUrl, accountId, networkPrefix }, onStatus) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const client = getClient(baseUrl);

    for (let attempt = 1; attempt <= FAUCET_CLAIM_MAX_ATTEMPTS; attempt += 1) {
      const result = await requestFaucetFundsWithPuzzle({
        baseUrl,
        accountId: normalizedAccountId,
        networkPrefix,
        fetchImpl: nodeFetch,
        onStatus,
      });
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

      const { statusKind, timedOut, lastError } =
        await waitForFaucetClaimFinality(client, txHashHex);
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
        return {
          ...result,
          status: statusKind,
        };
      }
      if (statusKind === "Expired" && attempt < FAUCET_CLAIM_MAX_ATTEMPTS) {
        let retryStatusSnapshot: StatusSnapshot | null = null;
        try {
          retryStatusSnapshot = await client.getStatusSnapshot();
        } catch {
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
        await waitForMs(retryDelayMs);
        continue;
      }
      throw buildFaucetClaimFinalityError(
        txHashHex,
        statusKind,
        timedOut,
        lastError,
      );
    }

    throw new Error(
      "TAIRA kept expiring faucet claims before they committed. Please retry once the faucet queue clears.",
    );
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
    const resolvedPrivateKeyHex = await resolvePrivateKeyHex({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting creation",
    });
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
      return { hash: submission.hash };
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
      metadata: withRequiredGasAssetMetadata(undefined),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return { hash: submission.hash };
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
    const resolvedPrivateKeyHex = await resolvePrivateKeyHex({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting join",
    });
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
      return { hash: submission.hash };
    }

    const tx = buildJoinKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      join: {
        callId: answerPayload.callId,
        participant: authority,
      },
      metadata: withRequiredGasAssetMetadata(metadata),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return { hash: submission.hash };
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
    const resolvedPrivateKeyHex = await resolvePrivateKeyHex({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting end",
    });
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
      return { hash: submission.hash };
    }

    const tx = buildEndKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      end: {
        callId: normalizedCallId,
        endedAtMs: resolvedEndedAtMs,
      },
      metadata: withRequiredGasAssetMetadata(undefined),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransactionAndWaitForCommit(
      toriiUrl,
      tx.signedTransaction,
    );
    return { hash: submission.hash };
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

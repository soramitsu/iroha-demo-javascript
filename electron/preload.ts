import { clipboard, contextBridge, ipcRenderer } from "electron";
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
  buildCreateKaigiInstruction,
  buildEndKaigiInstruction,
  buildJoinKaigiInstruction,
  buildRegisterAccountInstruction,
  buildShieldInstruction,
  buildTransferAssetInstruction,
  buildUnshieldInstruction,
  buildZkTransferInstruction,
  buildTransactionPayload,
  buildIvmProvedTransactionPayload,
  computeValidationFeePayoutLifecycleProposalFingerprintV1,
  computeValidationFeePolicyProposalFingerprintV1,
  signQuotedIvmProvedTransactionPayload,
  submitTransactionEntrypoint,
  hashSignedTransaction,
  inspectSubscriptionTriggerAction,
  noritoDecodeInstruction,
  normalizeAssetDefinitionId,
  normalizeAssetHoldingId,
  signQuotedTransactionPayload,
  type FeeQuoteResponse,
  type KaigiCallView,
} from "@iroha/iroha-js";
import { buildCanonicalJsonRequest } from "@iroha/iroha-js/canonical-request";
import {
  buildKaigiRosterJoinProof,
  generateKeyPair as generateSdkKeyPair,
  normalizeCryptoAlgorithm,
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
  assertExplorerAccountQrMatchesRequestedAccount,
  normalizeGovernanceCitizenCountPayload,
  normalizeGovernanceCouncilCurrentPayload,
  normalizeGovernanceUnlockStatsPayload,
  normalizeAssetDefinitionConfidentialPolicy,
  normalizeOfflineReadinessPayload,
  parseNexusLifecycleJson,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readApiErrorDetail,
  readNexusUnbondingDelayMs,
  stripConfidentialFeeSponsor,
  type AssetDefinitionConfidentialPolicyView,
  type ConfidentialAssetPolicyView,
  type ExplorerAccountQrResponse,
  type NexusLifecycleView,
  type OfflineReadinessView,
  type PublicLaneRewardsResponseView,
  type PublicLaneStakeResponseView,
  type PublicLaneValidatorsResponseView,
} from "./preload-utils";
import {
  extractGovernanceStats,
  extractRuntimeStatsFromStatusSnapshot,
  normalizeCurrentSumeragiTelemetry,
  normalizeExplorerAssetDefinitionEconometricsPayload,
  normalizeExplorerAssetDefinitionSnapshotPayload,
} from "./networkStats";
import {
  buildAssetHoldingIdLiteral,
  extractAssetDefinitionId,
} from "../src/utils/assetId";
import {
  buildSoraCloudHfStatusQuery,
  missingSoraCloudHfStatus,
  normalizeSoraCloudHfStatusPayload,
  normalizeSoraCloudStatusPayload,
  unavailableSoraCloudStatus,
  type SoraCloudHfStatusView,
  type SoraCloudStatusView,
  type SoraCloudStorageClass,
} from "../src/utils/soracloud";
import { SORACLOUD_SETTLEMENT_CONFIRMATION_CHANNEL } from "./soraCloudSettlementBoundary";
import {
  type ChainMetadata,
  parseFirstReleaseChainMetadataPayload,
} from "../src/utils/chainMetadata";
import type {
  GovernanceCitizenStatusResponse,
  NetworkStatsResponse,
} from "../src/types/iroha";
import {
  assertPlainGovernanceProposalWrite,
  canonicalGovernanceProposalId,
  isAccountInParliamentRoster,
  isReferendumPlainVoteOpen,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalList,
  plainBallotLockCoversReferendum,
  type GovernanceParliamentDecision,
  type GovernanceProposalDetail,
  type GovernanceProposalList,
  type GovernanceWritableProposalKindId,
} from "../src/governance/model";
import {
  readTransactionFee,
  type TransactionFeeLike,
} from "../src/utils/transactionFee";
import {
  waitForFinalizedTransaction,
  type TransactionFinalityProof,
} from "./transactionFinality";
import { deriveOnChainShieldedBalance } from "../src/utils/confidential";
import { nodeFetch } from "./nodeFetch";
import {
  assertEndpointFaucetChallengeAvailable,
  assertEndpointFeatureOperationSupported,
  assertEndpointFeatureSupported,
  assertEndpointWriteAuthorized,
  getTrustedEndpointIdentityScope,
  inspectEndpoint as inspectEndpointIdentity,
} from "./endpointInspector";
import type {
  EndpointFeature,
  EndpointInspection,
  EndpointNetworkContext,
} from "../src/types/endpointInspection";
import {
  buildEndpointDerivedStorageKey,
  type EndpointIdentityScopeInput,
} from "../src/utils/endpointScope";
import {
  readKnownTairaFaucetFundingIssue,
  requestFaucetFundsWithPuzzle,
  type AccountFaucetResponse,
  type FaucetRequestProgress,
} from "./faucetApi";
import {
  assertFaucetCommittedHeightAdvances,
  FaucetCommittedHeightStalledError,
  readSumeragiCommittedHeight,
} from "./faucetFinality";
import {
  IROHA_CONNECT_CONFIRMATION_CHANNEL,
  IrohaConnectBoundary,
  type IrohaConnectProcessedFrame,
  type IrohaConnectWalletContext,
} from "./irohaConnectBoundary";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
  normalizeCompatAccountIdLiteral,
} from "./accountAddress";
import {
  buildCanonicalInstructionFeeQuoteRequest,
  resolveCanonicalInstructionWireInput,
} from "./transactionFeeQuote";
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
import { discoverKaigiRelayManifest } from "./kaigiRelay";
import {
  readPrivateKaigiFeeSchedule,
  readPrivateKaigiTransferVerifyingKey,
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
  type PrivateKaigiFeeSchedule,
  type PrivateKaigiTransferVerifyingKeyContext,
} from "./privateKaigiContract";
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
import { parseConfidentialNoteIndexPage } from "./confidentialNoteIndex";
import { installGlobalIrohaJsNativeBinding } from "./irohaJsNativeDir";
import { type GovernanceValidationFeePolicyView } from "./governanceValidationFee";
import { GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL } from "./governanceValidationFeeFinality";
import {
  GOVERNANCE_PLAIN_REFERENDUM_IPC_CHANNEL,
  assertGovernancePlainReferendumBallotBinding,
  assertGovernancePlainReferendumBallotDraft,
  type LoadedGovernancePlainReferendumContract,
  type GovernancePlainReferendumObservedIdentity,
} from "./governancePlainReferendum";
import {
  assertGovernanceCitizenDraftResponse,
  decodeGovernanceCitizenStatus,
  normalizeGovernanceNetworkPrefix,
  unavailableGovernanceCitizenStatus,
} from "./governanceCitizenStatus";
import {
  parseRetryAfterMs,
  withBoundedHttpGetFetchRetry,
  withBoundedHttpGetRetry,
} from "./httpReadRetry";
import {
  GOVERNANCE_BALLOT_WIRE_IDS,
  assertGovernanceBallotDraftResponse,
  normalizeGovernanceDraftPayloadHex,
  normalizeGovernanceDraftWireId,
} from "./governanceBallotDraft";
import {
  runLocalVpnRepair,
  runVpnConnectAfterProfileCheck,
  runVpnDisconnectWithLocalFallback,
} from "./vpnPreloadGuard";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";
import {
  assertValidationFeePayoutLifecycleDecodedInstruction,
  assertValidationFeePayoutLifecycleDraftResponse,
  assertValidationFeeDraftWindowAgainstCapabilities,
  assertValidationFeePolicyDecodedInstruction,
  assertValidationFeePolicyDraftResponse,
  buildValidationFeePayoutLifecycleDraftRequest,
  buildValidationFeePolicyDraftRequest,
  VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_DECODED_VARIANT,
  VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
  VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT,
  VALIDATION_FEE_POLICY_DRAFT_PATH,
  VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
  type ValidationFeePayoutLifecycleDraftRequest,
  type ValidationFeePolicyDraftRequest,
} from "./governanceValidationFeeDraft";
import {
  governanceCapabilitiesContractFingerprintV1,
  parseGovernanceCapabilitiesV1,
  TAIRA_GOVERNANCE_CHAIN_ID,
  TAIRA_GOVERNANCE_NETWORK_PREFIX,
  type GovernanceCapabilitiesV1,
} from "./governanceCapabilities";
import {
  GOVERNANCE_CAPABILITIES_PATH,
  GOVERNANCE_CITIZEN_DRAFT_PATH,
  VALIDATION_FEE_PROPOSALS_PATH,
  validationFeePlainBallotDraftPath,
  validationFeeProposalPath,
} from "./governanceRoutes";
import {
  buildSoraCloudHfDeployRequest,
  soraCloudXorQuantityFromNanos,
} from "./soraCloudDeployRequest";
import { executeSoraCloudHfDraftToCommit } from "./soraCloudHfFlow";
import {
  buildSoraCloudCommittedLaunchResponse,
  decodeMatchingSoraCloudHfStatus,
  readSoraCloudHfLatestSequence,
  type SoraCloudHfDeployExpectation,
  type SoraCloudHfSettlementReview,
} from "./soraCloudResponses";
import {
  decodeSubscriptionListItemResponse,
  decodeSubscriptionListResponse,
  decodeSubscriptionPlanListResponse,
} from "./subscriptionResponses";
import { executeSubscriptionMutationBoundary } from "./subscriptionMutationBoundary";
import {
  classifySubscriptionStateConfirmation,
  decodeSubscriptionActionMutationDraft,
  decodeSubscriptionCreateMutationDraft,
  subscriptionPlanSnapshotsMatch,
  subscriptionStateSnapshotsMatch,
  type SubscriptionActionDraftName,
  type SubscriptionActionMutationDraft,
  type SubscriptionCancelMode,
  type SubscriptionCreateMutationDraft,
  type SubscriptionStateDraft,
} from "./subscriptionMutationDraft";
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

installGlobalIrohaJsNativeBinding(import.meta.url);

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
};

const trimString = (value: unknown): string => String(value ?? "").trim();
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRuntimeConfigEnv = (name: string): string =>
  trimString(process.env[name]);

const getRuntimeConfigSnapshot = (): RuntimeConfigResponse => ({
  walletConnectProjectId: readRuntimeConfigEnv("VITE_WALLETCONNECT_PROJECT_ID"),
});

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
const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
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
    gas_asset_id: SORA_XOR_ASSET_DEFINITION_ID,
  };
};
const FAUCET_CLAIM_STATUS_TIMEOUT_MS = 240_000;
const FAUCET_FINALITY_STALE_MS = 5 * 60_000;
const FAUCET_FINALITY_PROGRESS_OBSERVATION_MS = 3_000;

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
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
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
  networkPrefix: number;
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
  networkPrefix: number;
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
  networkPrefix: number;
  accountId: string;
  mnemonic: string;
};

type ImportConfidentialWalletBackupInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
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

type AccountOnboardingResponse = {
  account_id: string;
  tx_hash_hex: string;
  status: "FINALIZED";
  finality: TransactionFinalityProof;
};

type NexusStakingPolicyResponse = {
  unbondingDelayMs: number | null;
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
  networkPrefix: number;
  assetDefinitionId: string;
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
  networkPrefix: number;
  assetDefinitionId: string;
  participantAccountId: string;
  privateKeyHex?: HexString;
  callId: string;
  inviteSecretBase64Url: string;
  participantId: string;
  participantName: string;
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
  networkPrefix: number;
  assetDefinitionId: string;
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

type PrivateKaigiConfidentialXorContext = {
  state: PrivateKaigiConfidentialXorState;
};

type PrivateKaigiConfidentialXorFeeContext =
  PrivateKaigiConfidentialXorContext & {
    latestRootHex: string;
    verifyingKey: PrivateKaigiTransferVerifyingKeyContext;
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
  kind: "roster_updated" | "ended" | "stream_closed";
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
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
  amount: string;
  privateKeyHex?: HexString;
};

type RegisterPublicLaneValidatorInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
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
  networkPrefix: number;
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
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
  requestId: string;
  privateKeyHex?: HexString;
};

type ClaimPublicLaneRewardsInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
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
  networkPrefix: number;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
  exitClass: "standard" | "low-latency" | "high-security";
};

type VpnDisconnectInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex?: HexString;
  signingAlgorithm?: string;
};

type VpnStatusInput = Partial<VpnDisconnectInput>;

type GovernanceCitizenStatusInput = {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
};

type GovernanceLookupInput = {
  toriiUrl: string;
  proposalId: string;
};

type GovernanceReferendumLookupInput = {
  toriiUrl: string;
  referendumId: string;
};

type GovernanceProposalListInput = {
  toriiUrl: string;
  status?: string | null;
  kind?: string | null;
  proposer?: string | null;
  limit?: number;
  cursor?: string | null;
};

type GovernanceProposalDetailInput = {
  toriiUrl: string;
  proposalId: string;
  accountId?: string | null;
};

type GovernanceWriteOperation =
  | "register-citizen"
  | "propose"
  | "plain-ballot"
  | "parliament-ballot"
  | "enact";

type GovernancePrepareContext = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
};

type GovernanceProposalPrepareInput = GovernancePrepareContext & {
  kind: GovernanceWritableProposalKindId;
  payload: Record<string, unknown>;
};

type GovernancePlainBallotPrepareInput = GovernancePrepareContext & {
  proposalId: string;
  referendumId: string;
  amount: string;
  durationBlocks: string;
  direction: "Aye" | "Nay" | "Abstain";
};

type GovernanceParliamentBallotPrepareInput = GovernancePrepareContext & {
  proposalId: string;
  body: string;
  decision: GovernanceParliamentDecision;
};

type GovernanceCitizenRegistrationPrepareInput = GovernancePrepareContext & {
  amount: string;
};

type GovernanceEnactPrepareInput = GovernancePrepareContext & {
  proposalId: string;
};

type GovernancePreparedActionView = {
  reviewId: string;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId: string | null;
  referendumId: string | null;
  decodedInstruction: Record<string, unknown>;
  fee: {
    payer: "authority" | "sponsor";
    components: Array<{
      kind: string;
      assetDefinitionId: string;
      maxAmount: string;
    }>;
    nextBlockHeight: string;
  };
  expiresAtMs: number;
};

type GovernanceFinalizedActionView = TransactionSubmissionResultView & {
  operation: GovernanceWriteOperation;
  proposalId: string | null;
  referendumId: string | null;
  status: "finalized";
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
  finality: TransactionFinalityProof;
};

type SubscriptionMutationActionView = "create" | SubscriptionActionDraftName;

type SubscriptionActionResponseView = {
  ok: boolean;
  action: SubscriptionMutationActionView;
  subscription_id: string;
  tx_hash_hex: string;
  finality: TransactionFinalityProof;
  state_status: "confirmed" | "advanced" | "indexing";
  reconciliation_message?: string;
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
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  planId: string;
  firstChargeMs?: number;
};

type SubscriptionActionInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  chargeAtMs?: number;
  cancelMode?: SubscriptionCancelMode;
};

type SubscriptionReconcileInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  action: SubscriptionMutationActionView;
  transactionHash: string;
};

type PendingSubscriptionReconciliation = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  action: SubscriptionMutationActionView;
  transactionHash: string;
  expected: SubscriptionStateDraft;
  plan: Record<string, unknown> | null;
  receipt: SubscriptionActionResponseView;
};

const pendingSubscriptionReconciliations = new Map<
  string,
  PendingSubscriptionReconciliation
>();
const inFlightSubscriptionMutations = new Set<string>();

const subscriptionMutationScopeKey = (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
}) =>
  [
    normalizeBaseUrl(input.toriiUrl),
    input.chainId,
    String(input.networkPrefix),
    input.accountId,
    input.subscriptionId,
  ].join("\u001f");

type SoraCloudStatusInput = {
  toriiUrl: string;
};

type SoraCloudHfStatusInput = SoraCloudStatusInput & {
  repoId: string;
  revision?: string;
  storageClass: SoraCloudStorageClass;
  leaseTermMs: number;
  accountId?: string;
};

type SoraCloudHfDeployInput = SoraCloudStatusInput & {
  chainId: string;
  networkPrefix: number;
  accountId: string;
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

type SoraCloudHfReconcileInput = SoraCloudStatusInput & {
  chainId: string;
  networkPrefix: number;
  accountId: string;
  transactionHash: string;
};

type SoraCloudHfDeployResponseView = {
  ok: true;
  settlement_status: "confirmed" | "indexing";
  finality: TransactionFinalityProof;
  action: string | null;
  service_name: string;
  sequence: number | null;
  current_version?: string | null;
  revision_count?: number | null;
  tx_hash_hex: string;
  storage_base_fee: string;
  actual_storage_charge: string | null;
  max_compute_reservation_fee: string;
  actual_compute_charge: string | null;
  reconciliation_message?: string;
  fee?: TransactionFeeView | null;
  rollout_handle?: string | null;
  rollout_stage?: string | null;
  rollout_percent?: number | null;
  raw: Record<string, unknown> | null;
};

type PendingSoraCloudHfSettlement = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  transactionHash: string;
  statusInput: SoraCloudHfStatusInput;
  expected: SoraCloudHfDeployExpectation;
  settlement: SoraCloudHfSettlementReview;
  minimumSequenceExclusive: number;
  finality: TransactionFinalityProof;
  fee?: TransactionFeeView | null;
};

const pendingSoraCloudHfSettlements = new Map<
  string,
  PendingSoraCloudHfSettlement
>();

const soraCloudSettlementKey = (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  transactionHash: string;
}) =>
  [
    normalizeBaseUrl(input.toriiUrl),
    input.chainId,
    String(input.networkPrefix),
    input.accountId,
    input.transactionHash,
  ].join("\u001f");

const assertNoRendererSoraCloudSecrets = (input: unknown) => {
  const record = input as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(record, "privateKeyHex") ||
    Object.prototype.hasOwnProperty.call(record, "apiToken")
  ) {
    throw new Error(
      "SoraCloud secrets must come from the Electron secure vault.",
    );
  }
};

type IrohaBridge = {
  getRuntimeConfig(): RuntimeConfigResponse;
  ping(config: ToriiConfig): Promise<HealthResponse>;
  getChainMetadata(config: ToriiConfig): Promise<ChainMetadataResponse>;
  inspectEndpoint(config: EndpointNetworkContext): Promise<EndpointInspection>;
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
  deriveConfidentialOwnerTag(input: {
    privateKeyHex: string;
    diversifierHex: string;
  }): { ownerTagHex: string };
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
  setIrohaConnectContext(input: IrohaConnectWalletContext): void;
  resetIrohaConnectBoundary(): void;
  prepareIrohaConnectSession(
    input: Parameters<IrohaConnectBoundary["prepareSession"]>[0],
  ): ReturnType<IrohaConnectBoundary["prepareSession"]>;
  approveIrohaConnectSession(
    input: Parameters<IrohaConnectBoundary["approveSession"]>[0],
  ): ReturnType<IrohaConnectBoundary["approveSession"]>;
  processIrohaConnectFrame(input: {
    sessionToken: string;
    frameBase64: string;
  }): IrohaConnectProcessedFrame;
  approveIrohaConnectRequest(
    input: Parameters<IrohaConnectBoundary["approveRequest"]>[0],
  ): ReturnType<IrohaConnectBoundary["approveRequest"]>;
  rejectIrohaConnectRequest(
    input: Parameters<IrohaConnectBoundary["rejectRequest"]>[0],
  ): ReturnType<IrohaConnectBoundary["rejectRequest"]>;
  closeIrohaConnectSession(input: { sessionToken: string }): void;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  getConfidentialTransferExecutionContext(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
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
    networkPrefix: number;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
    force?: boolean;
  }): Promise<ConfidentialAssetBalanceResponse>;
  getConfidentialWalletState(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  getPrivateKaigiConfidentialXorState(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<PrivateKaigiConfidentialXorState>;
  selfShieldPrivateKaigiXor(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
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
  getGovernanceCapabilities(
    input: ToriiConfig,
  ): Promise<GovernanceCapabilitiesV1>;
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
  listGovernanceProposals(
    input: GovernanceProposalListInput,
  ): Promise<GovernanceProposalList>;
  getGovernanceProposalDetail(
    input: GovernanceProposalDetailInput,
  ): Promise<GovernanceProposalDetail>;
  getGovernanceCurrentValidationFeePolicy(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
  }): Promise<GovernanceValidationFeePolicyView>;
  getGovernancePlainReferendumContract(
    input: GovernancePlainReferendumObservedIdentity,
  ): Promise<LoadedGovernancePlainReferendumContract>;
  prepareGovernanceCitizenRegistration(
    input: GovernanceCitizenRegistrationPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  prepareGovernanceProposal(
    input: GovernanceProposalPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  prepareGovernancePlainBallot(
    input: GovernancePlainBallotPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  prepareGovernanceParliamentBallot(
    input: GovernanceParliamentBallotPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  prepareGovernanceEnact(
    input: GovernanceEnactPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  confirmGovernanceAction(input: {
    reviewId: string;
    accountId: string;
  }): Promise<GovernanceFinalizedActionView>;
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
  disconnectVpn(input?: VpnDisconnectInput): Promise<VpnStatusResponse>;
  repairVpn(): Promise<VpnStatusResponse>;
  listVpnReceipts(input?: VpnStatusInput): Promise<VpnReceiptResponse[]>;
  getOfflineReadiness(input: {
    toriiUrl: string;
    assetDefinitionId: string;
  }): Promise<OfflineReadinessView>;
  onboardAccount(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    alias: string;
    accountId: string;
    identity?: Record<string, unknown>;
  }): Promise<AccountOnboardingResponse>;
  requestFaucetFunds(
    input: {
      toriiUrl: string;
      chainId: string;
      accountId: string;
      networkPrefix: number;
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
  getSumeragiStatus(config: ToriiConfig): Promise<Record<string, unknown>>;
  getNexusLifecycle(config: ToriiConfig): Promise<NexusLifecycleView>;
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
  reconcileSubscriptionMutation(
    input: SubscriptionReconcileInput,
  ): Promise<SubscriptionActionResponseView>;
  getSoraCloudStatus(input: SoraCloudStatusInput): Promise<SoraCloudStatusView>;
  deploySoraCloudHf(
    input: SoraCloudHfDeployInput,
  ): Promise<SoraCloudHfDeployResponseView>;
  reconcileSoraCloudHfLaunch(
    input: SoraCloudHfReconcileInput,
  ): Promise<SoraCloudHfDeployResponseView>;
  getSoraCloudHfStatus(
    input: SoraCloudHfStatusInput,
  ): Promise<SoraCloudHfStatusView>;
  getParameters(input: ToriiConfig): Promise<Record<string, unknown>>;
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
  retryAfterMs: number | null;

  constructor(input: {
    label: string;
    status: number;
    statusText: string;
    detail?: string;
    retryAfterMs?: number | null;
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
    this.retryAfterMs = input.retryAfterMs ?? null;
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
    retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
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
const retryingToriiFetch: typeof fetch = (input, init) =>
  withBoundedHttpGetFetchRetry(nodeFetch, input, init);

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
    fetchImpl: retryingToriiFetch,
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
const isConfidentialRootHintMismatchError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error ?? "")).includes(
    "tree commitments do not match the supplied root_hint",
  );

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
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Faucet ledger finality",
    undefined,
    signal,
  );
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

const readFaucetSumeragiState = async (
  baseUrl: string,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  const endpoint = new URL(
    "v1/sumeragi/status",
    `${normalizeBaseUrl(baseUrl)}/`,
  );
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Faucet Sumeragi finality",
    undefined,
    signal,
  );
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
  const queueDepth = readNumericField(txQueue.depth);
  const queueSaturated = txQueue.saturated === true;
  const committedHeight = readSumeragiCommittedHeight(record);
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

  try {
    await assertFaucetCommittedHeightAdvances({
      initial: {
        ledgerHeight: ledgerState.height,
        sumeragiHeight: sumeragiState?.committedHeight ?? null,
      },
      observationWindowMs: FAUCET_FINALITY_PROGRESS_OBSERVATION_MS,
      wait: waitForMs,
      signal,
      observe: async (observationSignal) => {
        const nextLedgerState = await readFaucetLedgerFinalityState(
          baseUrl,
          observationSignal,
        );
        if (!nextLedgerState) {
          throw buildFaucetFinalityUnavailableError("/v1/ledger/headers");
        }
        let nextSumeragiState: Awaited<
          ReturnType<typeof readFaucetSumeragiState>
        > | null = null;
        try {
          nextSumeragiState = await readFaucetSumeragiState(
            baseUrl,
            observationSignal,
          );
        } catch {
          throwIfAborted(observationSignal);
        }
        ledgerState = nextLedgerState;
        sumeragiState = nextSumeragiState;
        return {
          ledgerHeight: nextLedgerState.height,
          sumeragiHeight: nextSumeragiState?.committedHeight ?? null,
        };
      },
    });
    return;
  } catch (error) {
    if (!(error instanceof FaucetCommittedHeightStalledError)) {
      throw error;
    }
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

const GOVERNANCE_U64_MAX = (1n << 64n) - 1n;
const GOVERNANCE_U128_MAX = (1n << 128n) - 1n;

const normalizeGovernancePositiveInteger = (
  value: string,
  label: string,
  maximum: bigint,
) => {
  const amount = value.trim();
  if (!/^[1-9]\d*$/.test(amount)) {
    throw new Error(
      `${label} must be a canonical positive whole-number string.`,
    );
  }
  if (BigInt(amount) > maximum) {
    throw new Error(`${label} exceeds the supported governance range.`);
  }
  return amount;
};

const normalizeBallotDirectionCode = (direction: "Aye" | "Nay" | "Abstain") => {
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

const PRIVATE_KAIGI_ROOT_LOOKBACK = 16;
const PRIVATE_KAIGI_ACCOUNT_TX_PAGE_SIZE = 200;
const CONFIDENTIAL_NOTE_INDEX_PAGE_SIZE = 500;
const CONFIDENTIAL_TX_FINALITY_INTERVAL_MS = 500;
const CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS = 600_000;
const CONFIDENTIAL_UNSHIELD_V2_CIRCUIT_IDS = new Set([
  "halo2/pasta/ipa/anon-unshield-merkle16-poseidon",
  "halo2/pasta/ipa/anon-unshield-merkle16-poseidon-diversified",
]);
const CONFIDENTIAL_UNSHIELD_V3_CIRCUIT_IDS = new Set([
  "halo2/pasta/ipa/anon-unshield-2in-1change-merkle16-poseidon",
  "halo2/pasta/ipa/anon-unshield-2in-1change-merkle16-poseidon-diversified",
]);
const PRIVATE_KAIGI_SHADOW_STORAGE_NAMESPACE = "iroha-demo:private-kaigi-xor";
const CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX =
  "iroha-demo:confidential-wallet:";
const CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE =
  "iroha-demo:confidential-wallet";
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

type EndpointScopedStorageKeys = {
  current: string | null;
  legacy: string;
};

const quarantineLegacyEndpointDerivedKey = (
  key: string,
  cache: Map<string, unknown>,
) => {
  cache.delete(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Legacy endpoint-derived state is ignored even if storage is unavailable.
  }
};

const getPrivateKaigiShadowKeys = (input: {
  toriiUrl: string;
  accountId: string;
  assetDefinitionId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
}): EndpointScopedStorageKeys => ({
  current: input.endpointScope
    ? buildEndpointDerivedStorageKey(
        PRIVATE_KAIGI_SHADOW_STORAGE_NAMESPACE,
        input.endpointScope,
        [input.accountId, input.assetDefinitionId],
      )
    : null,
  legacy: [
    `${PRIVATE_KAIGI_SHADOW_STORAGE_NAMESPACE}:`,
    normalizeBaseUrl(input.toriiUrl),
    input.accountId.trim().toLowerCase(),
    input.assetDefinitionId.trim().toLowerCase(),
  ].join(""),
});

const readPrivateKaigiShadowState = (
  keys: EndpointScopedStorageKeys,
): PrivateKaigiXorShadowState => {
  quarantineLegacyEndpointDerivedKey(keys.legacy, privateKaigiShadowStateCache);
  if (!keys.current) {
    return newPrivateKaigiShadowState();
  }
  const key = keys.current;
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
  keys: EndpointScopedStorageKeys,
  state: PrivateKaigiXorShadowState,
) => {
  quarantineLegacyEndpointDerivedKey(keys.legacy, privateKaigiShadowStateCache);
  if (!keys.current) {
    return;
  }
  const key = keys.current;
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
  assetDefinitionId: string;
  endpointScope: EndpointIdentityScopeInput;
}) => {
  const keys = getPrivateKaigiShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId: input.assetDefinitionId,
    endpointScope: input.endpointScope,
  });
  const state = readPrivateKaigiShadowState(keys);
  state.pendingShieldCredit = formatDecimalAmount(
    addDecimalAmounts(
      parseDecimalAmount(state.pendingShieldCredit, "pendingShieldCredit"),
      parseDecimalAmount(input.amount, "amount"),
    ),
  );
  writePrivateKaigiShadowState(keys, state);
};

const appendPrivateKaigiFeeDebit = (input: {
  toriiUrl: string;
  accountId: string;
  amount: string;
  assetDefinitionId: string;
  endpointScope: EndpointIdentityScopeInput;
}) => {
  const keys = getPrivateKaigiShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId: input.assetDefinitionId,
    endpointScope: input.endpointScope,
  });
  const state = readPrivateKaigiShadowState(keys);
  state.privateFeeDebit = formatDecimalAmount(
    addDecimalAmounts(
      parseDecimalAmount(state.privateFeeDebit, "privateFeeDebit"),
      parseDecimalAmount(input.amount, "amount"),
    ),
  );
  writePrivateKaigiShadowState(keys, state);
};

const newConfidentialWalletShadowState =
  (): PendingConfidentialWalletShadowState => ({
    transactions: [],
  });

const getConfidentialWalletShadowKeys = (input: {
  toriiUrl: string;
  accountId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
}): EndpointScopedStorageKeys => ({
  current: input.endpointScope
    ? buildEndpointDerivedStorageKey(
        CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE,
        input.endpointScope,
        [input.accountId],
      )
    : null,
  legacy: [
    CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX,
    normalizeBaseUrl(input.toriiUrl),
    input.accountId.trim().toLowerCase(),
  ].join(""),
});

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
  keys: EndpointScopedStorageKeys,
): PendingConfidentialWalletShadowState => {
  quarantineLegacyEndpointDerivedKey(
    keys.legacy,
    confidentialWalletShadowStateCache,
  );
  if (!keys.current) {
    return newConfidentialWalletShadowState();
  }
  const key = keys.current;
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
  keys: EndpointScopedStorageKeys,
  state: PendingConfidentialWalletShadowState,
) => {
  quarantineLegacyEndpointDerivedKey(
    keys.legacy,
    confidentialWalletShadowStateCache,
  );
  if (!keys.current) {
    return;
  }
  const key = keys.current;
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
  endpointScope: EndpointIdentityScopeInput;
  txHash: string;
  authority: string;
  metadata?: Record<string, unknown>;
  instructions?: Array<Record<string, unknown>>;
  createdAtMs?: number;
}) => {
  const keys = getConfidentialWalletShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    endpointScope: input.endpointScope,
  });
  const state = readConfidentialWalletShadowState(keys);
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
  writeConfidentialWalletShadowState(keys, state);
};

const mergeConfidentialWalletShadowTransactions = (input: {
  toriiUrl: string;
  accountId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
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
  const keys = getConfidentialWalletShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    endpointScope: input.endpointScope,
  });
  const shadowState = readConfidentialWalletShadowState(keys);
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
  return requireKaigiCallId(value, label);
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
    throw new Error("callId must be in exact domain.dataspace:meeting format.");
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

const fetchGetResponse = async (
  endpoint: string,
  label: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> =>
  withBoundedHttpGetRetry(
    async () => {
      const response = await nodeFetch(endpoint, {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
          ...(headers ?? {}),
        },
      });
      if (response.status === 429) {
        throw await createApiRequestError(response, label);
      }
      return response;
    },
    { signal },
  );

const fetchJson = async (
  endpoint: string,
  label: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const response = await fetchGetResponse(endpoint, label, headers, signal);
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, label);
};

const fetchNexusLifecycle = async (
  toriiUrl: string,
  signal?: AbortSignal,
): Promise<NexusLifecycleView> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/nexus/lifecycle"),
    "Nexus lifecycle",
    undefined,
    signal,
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Nexus lifecycle");
  }
  return parseNexusLifecycleJson(await response.text());
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

const parseJsonIfAvailable = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return null;
  }
  return await response.json();
};

const fetchChainMetadata = async (
  toriiUrlRaw: string,
): Promise<ChainMetadataResponse> => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const response = await fetchGetResponse(
    `${baseUrl}/v1/chain/metadata`,
    "Chain metadata",
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Chain metadata");
  }
  const payload = await parseJsonIfAvailable(response);
  if (payload === null) {
    throw new Error("Chain metadata did not return JSON.");
  }
  return parseFirstReleaseChainMetadataPayload(payload);
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

const assertWriteConnectionMatchesEndpoint = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  feature?: EndpointFeature;
  operation?: string;
}) => {
  const configuredChainId = String(input.chainId ?? "").trim();
  if (!configuredChainId) {
    throw new Error("chainId is required.");
  }
  const configuredNetworkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (configuredNetworkPrefix === undefined) {
    throw new Error("networkPrefix is required before writing.");
  }
  const inspection = await assertEndpointWriteAuthorized({
    toriiUrl: input.toriiUrl,
    chainId: configuredChainId,
    networkPrefix: configuredNetworkPrefix,
  });
  if (input.feature && input.operation) {
    assertEndpointFeatureOperationSupported(
      inspection,
      input.feature,
      input.operation,
    );
  } else if (input.feature) {
    assertEndpointFeatureSupported(inspection, input.feature);
  } else if (input.operation) {
    throw new Error("Endpoint operation checks require a feature.");
  }
  const endpointScope = getTrustedEndpointIdentityScope(inspection);
  if (!endpointScope) {
    throw new Error(
      "Endpoint identity is not trusted for endpoint-derived storage.",
    );
  }

  return {
    chainId: inspection.expected.chainId,
    networkPrefix: inspection.expected.networkPrefix,
    endpointScope,
  };
};

const assertFaucetChallengeConnectionAvailable = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}) => {
  const configuredChainId = String(input.chainId ?? "").trim();
  if (!configuredChainId) {
    throw new Error("chainId is required.");
  }
  const configuredNetworkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (configuredNetworkPrefix === undefined) {
    throw new Error(
      "networkPrefix is required before requesting faucet funds.",
    );
  }
  const inspection = await assertEndpointFaucetChallengeAvailable({
    toriiUrl: input.toriiUrl,
    chainId: configuredChainId,
    networkPrefix: configuredNetworkPrefix,
  });
  return {
    chainId: inspection.expected.chainId,
    networkPrefix: inspection.expected.networkPrefix,
  };
};

const inspectEndpointDerivedScope = async (
  input: EndpointNetworkContext,
): Promise<EndpointIdentityScopeInput | null> =>
  getTrustedEndpointIdentityScope(
    await inspectEndpointIdentity({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    }),
  );

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
    requireKaigiInviteSecretBase64Url(
      input.inviteSecretBase64Url,
      "inviteSecretBase64Url",
    ),
  );
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

const normalizeFirstReleaseSubscriptionId = (value: unknown): string => {
  const literal = trimString(value);
  const separator = literal.indexOf("$");
  if (
    separator <= 0 ||
    separator !== literal.lastIndexOf("$") ||
    separator === literal.length - 1 ||
    /\s/u.test(literal)
  ) {
    throw new Error("subscriptionId must use the exact name$domain form.");
  }
  return literal;
};

const buildSubscriptionActionDraftBody = (
  input: SubscriptionActionInput,
  action: SubscriptionActionDraftName,
  authority: string,
) => {
  const chargeAtMs = normalizeOptionalPositiveInteger(
    input.chargeAtMs,
    "chargeAtMs",
  );
  const cancelMode = input.cancelMode;
  if (
    cancelMode !== undefined &&
    cancelMode !== "immediate" &&
    cancelMode !== "period_end"
  ) {
    throw new Error("cancelMode must be immediate or period_end.");
  }
  if (action === "cancel") {
    if (!cancelMode) {
      throw new Error("Cancel subscription requires an explicit cancelMode.");
    }
    if (chargeAtMs !== undefined) {
      throw new Error("Cancel subscription does not accept chargeAtMs.");
    }
    return {
      authority,
      cancel_mode: { mode: cancelMode, value: null },
    };
  }
  if (cancelMode !== undefined) {
    throw new Error(`${action} subscription does not accept cancelMode.`);
  }
  if (action === "resume" || action === "charge_now") {
    const body: Record<string, unknown> = { authority };
    if (chargeAtMs !== undefined) {
      body.charge_at_ms = chargeAtMs;
    }
    return body;
  }
  if (chargeAtMs !== undefined) {
    throw new Error(`${action} subscription does not accept chargeAtMs.`);
  }
  return { authority };
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
      count_mode: "exact",
    },
  );
  const payload = await fetchJson(endpoint, "Subscription plans");
  return decodeSubscriptionPlanListResponse(payload);
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
    count_mode: "exact",
  });
  const payload = await fetchJson(endpoint, "Subscriptions");
  return decodeSubscriptionListResponse(payload);
};

const getSubscriptionFromTorii = async (
  input: SubscriptionGetInput,
): Promise<SubscriptionListItemView> => {
  const subscriptionId = normalizeFirstReleaseSubscriptionId(
    input.subscriptionId,
  );
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const payload = await fetchJson(endpoint, "Subscription");
  const item = decodeSubscriptionListItemResponse(payload);
  if (item.subscription_id !== subscriptionId) {
    throw new Error(
      "Subscription response does not match the requested subscription.",
    );
  }
  return item;
};

const SUBSCRIPTION_PLAN_LOOKUP_PAGE_SIZE = 100;
const SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS = 10_000;
const SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS = 500;
const SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS = 30_000;
const POSITIVE_DECIMAL_U64 = /^[1-9][0-9]*$/u;
const MAX_U64 = (1n << 64n) - 1n;

const getSubscriptionIvmMaxCyclesFromTorii = async (
  toriiUrl: string,
): Promise<string> => {
  const preflight = ensureObjectResponse(
    await fetchJson(
      buildNexusEndpoint(toriiUrl, "/v1/pipeline/preflight"),
      "Pipeline preflight",
    ),
    "Pipeline preflight",
  );
  const pipeline = ensureObjectResponse(
    preflight.pipeline,
    "Pipeline preflight pipeline",
  );
  const raw = pipeline.ivm_admission_cycle_limit;
  const literal =
    typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
      ? String(raw)
      : typeof raw === "string" && raw.trim() === raw
        ? raw
        : "";
  if (!POSITIVE_DECIMAL_U64.test(literal) || BigInt(literal) > MAX_U64) {
    throw new Error(
      "Pipeline preflight pipeline.ivm_admission_cycle_limit must be a canonical positive u64 before subscription signing.",
    );
  }
  return literal;
};

const getSubscriptionPlanFromTorii = async (
  toriiUrl: string,
  planId: string,
): Promise<Record<string, unknown>> => {
  let offset = 0;
  while (offset <= SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS) {
    const page = await listSubscriptionPlansFromTorii({
      toriiUrl,
      limit: SUBSCRIPTION_PLAN_LOOKUP_PAGE_SIZE,
      offset,
    });
    const match = page.items.find((item) => item.plan_id === planId);
    if (match) {
      return match.plan;
    }
    if (offset + page.items.length >= page.total) {
      break;
    }
    if (page.items.length === 0) {
      throw new Error(
        "Subscription plan pagination stopped before the selected plan could be verified.",
      );
    }
    offset += page.items.length;
  }
  if (offset > SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS) {
    throw new Error(
      "Subscription plan lookup exceeded the first-release verification bound.",
    );
  }
  throw new Error(
    `Subscription plan ${planId} is not present in the live plan registry.`,
  );
};

const decodeSubscriptionDraftInstruction = (payloadHex: string): unknown =>
  noritoDecodeInstruction(Buffer.from(payloadHex, "hex"));

const inspectSubscriptionDraftTriggerAction = (
  encodedAction: string,
): unknown => inspectSubscriptionTriggerAction(encodedAction);

const confirmSubscriptionResultingState = async (input: {
  toriiUrl: string;
  subscriptionId: string;
  networkPrefix: number;
  expected: SubscriptionStateDraft;
  plan: Record<string, unknown> | null;
}): Promise<{
  stateStatus: "confirmed" | "advanced" | "indexing";
  reconciliationMessage?: string;
}> => {
  const deadline = Date.now() + SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() <= deadline) {
    try {
      const record = await getSubscriptionFromTorii({
        toriiUrl: input.toriiUrl,
        subscriptionId: input.subscriptionId,
      });
      const confirmation = classifySubscriptionStateConfirmation({
        actual: record.subscription,
        expected: input.expected,
        plan: input.plan,
        invoice: record.invoice,
        subscriptionId: input.subscriptionId,
        networkPrefix: input.networkPrefix,
      });
      if (confirmation !== null) {
        return {
          stateStatus: confirmation === "exact" ? "confirmed" : "advanced",
        };
      }
      lastError = new Error(
        "The indexed subscription state is neither the signed draft nor an invoice-proven immediate billing successor.",
      );
    } catch (error) {
      lastError = error;
    }
    if (Date.now() + SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS);
  }
  const detail =
    lastError instanceof Error && lastError.message
      ? ` Last read: ${lastError.message}`
      : "";
  console.warn(
    `The subscription transaction is proven in a finalized block, but its draft state or an invoice-proven immediate successor was not indexed within ${SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS / 1000} seconds.${detail}`,
  );
  return {
    stateStatus: "indexing",
    reconciliationMessage: `The transaction is proven in a finalized block, but authoritative subscription state is still indexing. Do not resubmit; refresh subscriptions to reconcile the finalized transaction.${detail}`,
  };
};

const buildSubscriptionMutationReceipt = (
  draft: SubscriptionCreateMutationDraft | SubscriptionActionMutationDraft,
  submission: {
    hash: string;
    fee?: TransactionFeeView | null;
    finality: TransactionFinalityProof;
  },
  confirmation: {
    stateStatus: "confirmed" | "advanced" | "indexing";
    reconciliationMessage?: string;
  },
): SubscriptionActionResponseView => ({
  ok: true,
  action: draft.action,
  subscription_id: draft.subscription_id,
  tx_hash_hex: submission.hash,
  finality: submission.finality,
  state_status: confirmation.stateStatus,
  ...(confirmation.reconciliationMessage
    ? { reconciliation_message: confirmation.reconciliationMessage }
    : {}),
  ...(submission.fee ? { fee: submission.fee } : {}),
  ...(draft.action === "create"
    ? {
        billing_trigger_id: draft.billing_trigger_id,
        usage_trigger_id: draft.usage_trigger_id,
        first_charge_ms: draft.first_charge_ms,
      }
    : {}),
});

const beginSubscriptionMutation = (scopeKey: string) => {
  if (pendingSubscriptionReconciliations.has(scopeKey)) {
    throw new Error(
      "A finalized subscription transaction for this subscription is still indexing. Reconcile it before submitting another action.",
    );
  }
  if (inFlightSubscriptionMutations.has(scopeKey)) {
    throw new Error(
      "A subscription transaction for this subscription is already in progress.",
    );
  }
  inFlightSubscriptionMutations.add(scopeKey);
};

const rememberSubscriptionReconciliation = (input: {
  scopeKey: string;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  draft: SubscriptionCreateMutationDraft | SubscriptionActionMutationDraft;
  plan: Record<string, unknown> | null;
  receipt: SubscriptionActionResponseView;
}) => {
  if (input.receipt.state_status !== "indexing") {
    pendingSubscriptionReconciliations.delete(input.scopeKey);
    return;
  }
  pendingSubscriptionReconciliations.set(input.scopeKey, {
    toriiUrl: normalizeBaseUrl(input.toriiUrl),
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    accountId: input.accountId,
    subscriptionId: input.draft.subscription_id,
    action: input.draft.action,
    transactionHash: input.receipt.tx_hash_hex,
    expected:
      input.draft.action === "create"
        ? input.draft.resulting_subscription
        : input.draft.details.resulting_subscription,
    plan: input.plan,
    receipt: input.receipt,
  });
};

const normalizeSubscriptionMutationAction = (
  value: unknown,
): SubscriptionMutationActionView => {
  if (
    value === "create" ||
    value === "pause" ||
    value === "resume" ||
    value === "cancel" ||
    value === "keep" ||
    value === "charge_now"
  ) {
    return value;
  }
  throw new Error("Subscription reconciliation action is invalid.");
};

const createSubscriptionOnTorii = async (
  input: SubscriptionCreateInput,
): Promise<SubscriptionActionResponseView> => {
  let mutationScopeKey: string | null = null;
  try {
    return await executeSubscriptionMutationBoundary({
      prepareDraft: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: input.toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          feature: "subscriptionWrites",
          operation: "POST /v1/subscriptions",
        });
        const accountId = normalizeCanonicalAccountIdLiteral(
          input.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const subscriptionId = normalizeFirstReleaseSubscriptionId(
          input.subscriptionId,
        );
        mutationScopeKey = subscriptionMutationScopeKey({
          toriiUrl: input.toriiUrl,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
          accountId,
          subscriptionId,
        });
        beginSubscriptionMutation(mutationScopeKey);
        const planId = normalizeFirstReleaseAssetDefinitionId(input.planId);
        const firstChargeMs = normalizeOptionalPositiveInteger(
          input.firstChargeMs,
          "firstChargeMs",
        );
        const [plan, ivmMaxCycles] = await Promise.all([
          getSubscriptionPlanFromTorii(input.toriiUrl, planId),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        const body: Record<string, unknown> = {
          authority: accountId,
          subscription_id: subscriptionId,
          plan_id: planId,
        };
        if (firstChargeMs !== undefined) {
          body.first_charge_ms = firstChargeMs;
        }
        const requestStartedAtMs = Date.now();
        const payload = await postJson(
          buildNexusEndpoint(input.toriiUrl, "/v1/subscriptions"),
          "Create subscription draft",
          body,
        );
        const responseReceivedAtMs = Date.now();
        const draft = decodeSubscriptionCreateMutationDraft(
          payload,
          {
            authority: accountId,
            subscriptionId,
            planId,
            plan,
            firstChargeMs,
            resolvedChargeWindow:
              firstChargeMs === undefined
                ? {
                    requestStartedAtMs,
                    responseReceivedAtMs,
                    clockSkewMs: SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS,
                  }
                : undefined,
            ivmMaxCycles,
            networkPrefix: writeConnection.networkPrefix,
          },
          decodeSubscriptionDraftInstruction,
          inspectSubscriptionDraftTriggerAction,
        );
        const [freshPlan, freshIvmMaxCycles] = await Promise.all([
          getSubscriptionPlanFromTorii(input.toriiUrl, planId),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        if (
          !subscriptionPlanSnapshotsMatch(
            plan,
            freshPlan,
            writeConnection.networkPrefix,
          )
        ) {
          throw new Error(
            "The live subscription plan changed while its unsigned draft was being reviewed.",
          );
        }
        if (freshIvmMaxCycles !== ivmMaxCycles) {
          throw new Error(
            "The live IVM admission limit changed while the subscription draft was being reviewed.",
          );
        }
        return {
          draft,
          plan: freshPlan,
          accountId,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
        };
      },
      resolveSigningMaterial: ({ accountId }) =>
        resolveSigningMaterial({
          accountId,
          operationLabel: "Create subscription",
        }),
      quoteAndSign: async (prepared, signingMaterial) =>
        quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          authority: prepared.accountId,
          networkPrefix: prepared.networkPrefix,
          instructions: prepared.draft.decoded_instructions,
          metadata: {},
          privateKey: hexToBuffer(
            signingMaterial.privateKeyHex,
            "privateKeyHex",
          ),
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        }),
      submit: (_prepared, tx) =>
        submitSignedTransactionAndWaitForFinalizedBlock(
          input.toriiUrl,
          tx.signedTransaction,
        ),
      confirmResultingState: (prepared) =>
        confirmSubscriptionResultingState({
          toriiUrl: input.toriiUrl,
          subscriptionId: prepared.draft.subscription_id,
          networkPrefix: prepared.networkPrefix,
          expected: prepared.draft.resulting_subscription,
          plan: prepared.plan,
        }),
      buildReceipt: (prepared, submission, confirmation) => {
        const receipt = buildSubscriptionMutationReceipt(
          prepared.draft,
          submission,
          confirmation,
        );
        rememberSubscriptionReconciliation({
          scopeKey: mutationScopeKey!,
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          networkPrefix: prepared.networkPrefix,
          accountId: prepared.accountId,
          draft: prepared.draft,
          plan: prepared.plan,
          receipt,
        });
        return receipt;
      },
    });
  } finally {
    if (mutationScopeKey) {
      inFlightSubscriptionMutations.delete(mutationScopeKey);
    }
  }
};

const postSubscriptionActionToTorii = async (
  input: SubscriptionActionInput,
  routeAction: "pause" | "resume" | "cancel" | "keep" | "charge-now",
  operationLabel: string,
): Promise<SubscriptionActionResponseView> => {
  const draftAction: SubscriptionActionDraftName =
    routeAction === "charge-now" ? "charge_now" : routeAction;
  let mutationScopeKey: string | null = null;
  try {
    return await executeSubscriptionMutationBoundary({
      prepareDraft: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: input.toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          feature: "subscriptionWrites",
          operation: `POST /v1/subscriptions/{subscription_id}/${routeAction}`,
        });
        const accountId = normalizeCanonicalAccountIdLiteral(
          input.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const subscriptionId = normalizeFirstReleaseSubscriptionId(
          input.subscriptionId,
        );
        mutationScopeKey = subscriptionMutationScopeKey({
          toriiUrl: input.toriiUrl,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
          accountId,
          subscriptionId,
        });
        beginSubscriptionMutation(mutationScopeKey);
        const [current, ivmMaxCycles] = await Promise.all([
          getSubscriptionFromTorii({
            toriiUrl: input.toriiUrl,
            subscriptionId,
          }),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        const chargeAtMs = normalizeOptionalPositiveInteger(
          input.chargeAtMs,
          "chargeAtMs",
        );
        const body = buildSubscriptionActionDraftBody(
          input,
          draftAction,
          accountId,
        );
        const requestStartedAtMs = Date.now();
        const payload = await postJson(
          buildNexusEndpoint(
            input.toriiUrl,
            `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/${routeAction}`,
          ),
          `${operationLabel} draft`,
          body,
        );
        const responseReceivedAtMs = Date.now();
        const draft = decodeSubscriptionActionMutationDraft(
          payload,
          {
            authority: accountId,
            subscriptionId,
            action: draftAction,
            currentSubscription: current.subscription,
            currentPlan: current.plan,
            chargeAtMs,
            resolvedChargeWindow:
              chargeAtMs === undefined &&
              (draftAction === "resume" || draftAction === "charge_now")
                ? {
                    requestStartedAtMs,
                    responseReceivedAtMs,
                    clockSkewMs: SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS,
                  }
                : undefined,
            cancelMode: input.cancelMode,
            ivmMaxCycles,
            networkPrefix: writeConnection.networkPrefix,
          },
          decodeSubscriptionDraftInstruction,
          inspectSubscriptionDraftTriggerAction,
        );
        const [freshCurrent, freshIvmMaxCycles] = await Promise.all([
          getSubscriptionFromTorii({
            toriiUrl: input.toriiUrl,
            subscriptionId,
          }),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        if (
          !subscriptionStateSnapshotsMatch(
            current.subscription,
            freshCurrent.subscription,
            writeConnection.networkPrefix,
          )
        ) {
          throw new Error(
            "The live subscription state changed while its unsigned action draft was being reviewed.",
          );
        }
        const planUnchanged =
          current.plan === null || freshCurrent.plan === null
            ? current.plan === freshCurrent.plan
            : subscriptionPlanSnapshotsMatch(
                current.plan,
                freshCurrent.plan,
                writeConnection.networkPrefix,
              );
        if (!planUnchanged) {
          throw new Error(
            "The live subscription plan changed while its unsigned action draft was being reviewed.",
          );
        }
        if (freshIvmMaxCycles !== ivmMaxCycles) {
          throw new Error(
            "The live IVM admission limit changed while the subscription action draft was being reviewed.",
          );
        }
        return {
          draft,
          plan: freshCurrent.plan,
          accountId,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
        };
      },
      resolveSigningMaterial: ({ accountId }) =>
        resolveSigningMaterial({
          accountId,
          operationLabel,
        }),
      quoteAndSign: async (prepared, signingMaterial) =>
        quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          authority: prepared.accountId,
          networkPrefix: prepared.networkPrefix,
          instructions: prepared.draft.decoded_instructions,
          metadata: {},
          privateKey: hexToBuffer(
            signingMaterial.privateKeyHex,
            "privateKeyHex",
          ),
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        }),
      submit: (_prepared, tx) =>
        submitSignedTransactionAndWaitForFinalizedBlock(
          input.toriiUrl,
          tx.signedTransaction,
        ),
      confirmResultingState: (prepared) =>
        confirmSubscriptionResultingState({
          toriiUrl: input.toriiUrl,
          subscriptionId: prepared.draft.subscription_id,
          networkPrefix: prepared.networkPrefix,
          expected: prepared.draft.details.resulting_subscription,
          plan: prepared.plan,
        }),
      buildReceipt: (prepared, submission, confirmation) => {
        const receipt = buildSubscriptionMutationReceipt(
          prepared.draft,
          submission,
          confirmation,
        );
        rememberSubscriptionReconciliation({
          scopeKey: mutationScopeKey!,
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          networkPrefix: prepared.networkPrefix,
          accountId: prepared.accountId,
          draft: prepared.draft,
          plan: prepared.plan,
          receipt,
        });
        return receipt;
      },
    });
  } finally {
    if (mutationScopeKey) {
      inFlightSubscriptionMutations.delete(mutationScopeKey);
    }
  }
};

const reconcileSubscriptionMutationOnTorii = async (
  input: SubscriptionReconcileInput,
): Promise<SubscriptionActionResponseView> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "subscriptionWrites",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const subscriptionId = normalizeFirstReleaseSubscriptionId(
    input.subscriptionId,
  );
  const action = normalizeSubscriptionMutationAction(input.action);
  const transactionHash = trimString(input.transactionHash);
  if (!/^[0-9a-f]{64}$/u.test(transactionHash)) {
    throw new Error(
      "Subscription reconciliation transaction hash must be canonical lowercase 32-byte hex.",
    );
  }
  const scopeKey = subscriptionMutationScopeKey({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    subscriptionId,
  });
  const pending = pendingSubscriptionReconciliations.get(scopeKey);
  if (
    !pending ||
    pending.action !== action ||
    pending.transactionHash !== transactionHash
  ) {
    throw new Error(
      "No pending subscription reconciliation matches this endpoint, wallet, action, subscription, and finalized transaction.",
    );
  }

  const record = await getSubscriptionFromTorii({
    toriiUrl: input.toriiUrl,
    subscriptionId,
  });
  const confirmation = classifySubscriptionStateConfirmation({
    actual: record.subscription,
    expected: pending.expected,
    plan: pending.plan,
    invoice: record.invoice,
    subscriptionId,
    networkPrefix: writeConnection.networkPrefix,
  });
  if (confirmation === null) {
    return {
      ...pending.receipt,
      state_status: "indexing",
      reconciliation_message:
        "The transaction remains proven in a finalized block, but the live subscription projection does not yet match its exact reviewed result or an invoice-proven successor. Do not resubmit; refresh again to reconcile it.",
    };
  }

  const reconciled: SubscriptionActionResponseView = {
    ...pending.receipt,
    state_status: confirmation === "exact" ? "confirmed" : "advanced",
  };
  delete reconciled.reconciliation_message;
  pendingSubscriptionReconciliations.delete(scopeKey);
  return reconciled;
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

const normalizeSoraCloudHfToken = (
  value: unknown,
  label: string,
  maxBytes: number,
): string => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} must not be empty.`);
  }
  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} UTF-8 bytes.`);
  }
  if (/[\p{Cc}\s]/u.test(normalized)) {
    throw new Error(
      `${label} must not contain whitespace or control characters.`,
    );
  }
  return normalized;
};

const normalizeSoraCloudName = (value: unknown, label: string): string => {
  const normalized = trimString(value).normalize("NFC");
  if (!normalized) {
    throw new Error(`${label} must not be empty.`);
  }
  if (/[\s@#$]/u.test(normalized)) {
    throw new Error(
      `${label} contains a character forbidden by the Iroha Name contract.`,
    );
  }
  return normalized;
};

const normalizePositiveU64Number = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};

const fetchSoraCloudHfStatusPayload = (
  input: SoraCloudHfStatusInput,
): Promise<Record<string, unknown>> =>
  fetchJson(
    buildNexusEndpoint(
      input.toriiUrl,
      "/v1/soracloud/hf/status",
      buildSoraCloudHfStatusQuery(input),
    ),
    "SoraCloud HF status",
  );

const fetchOptionalSoraCloudHfStatusPayload = async (
  input: SoraCloudHfStatusInput,
): Promise<Record<string, unknown> | null> => {
  try {
    return await fetchSoraCloudHfStatusPayload(input);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const postCanonicalSoraCloudHfDraft = async (input: {
  toriiUrl: string;
  accountId: string;
  privateKey: Buffer;
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const path = "/v1/soracloud/hf/deploy";
  const request = await buildCanonicalJsonRequest({
    accountId: input.accountId,
    method: "POST",
    path,
    baseUrl: normalizeBaseUrl(input.toriiUrl),
    body: input.body,
    privateKey: input.privateKey,
  });
  const response = await nodeFetch(
    buildNexusEndpoint(input.toriiUrl, path),
    request,
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Launch SoraCloud instance");
  }
  return ensureObjectResponse(
    (await response.json()) as unknown,
    "Launch SoraCloud instance",
  );
};

const getSoraCloudStatusFromTorii = async (
  input: SoraCloudStatusInput,
): Promise<SoraCloudStatusView> => {
  assertNoRendererSoraCloudSecrets(input);
  try {
    const payload = await fetchJson(
      buildNexusEndpoint(input.toriiUrl, "/v1/soracloud/status"),
      "SoraCloud status",
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

const getParametersFromTorii = (input: ToriiConfig) =>
  fetchJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/parameters"),
    "Network parameters",
  );

const getOfflineReadinessFromTorii = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
}): Promise<OfflineReadinessView> => {
  const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
    input.assetDefinitionId,
  );
  const payload = await fetchJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/offline/readiness", {
      asset_definition_id: assetDefinitionId,
    }),
    "Offline readiness",
  );
  return normalizeOfflineReadinessPayload(payload, assetDefinitionId);
};

const deploySoraCloudHfOnTorii = async (
  input: SoraCloudHfDeployInput,
): Promise<SoraCloudHfDeployResponseView> => {
  assertNoRendererSoraCloudSecrets(input);
  const repoId = normalizeSoraCloudHfToken(input.repoId, "repoId", 256);
  const revision = trimString(input.revision)
    ? normalizeSoraCloudHfToken(input.revision, "revision", 160)
    : undefined;
  const resolvedRevision = revision ?? "main";
  const modelName = normalizeSoraCloudHfToken(
    input.modelName,
    "modelName",
    128,
  );
  const serviceName = normalizeSoraCloudName(input.serviceName, "serviceName");
  const apartmentName = trimString(input.apartmentName)
    ? normalizeSoraCloudName(input.apartmentName, "apartmentName")
    : undefined;
  const storageClass = normalizeSoraCloudStorageClass(input.storageClass);
  const leaseTermMs = normalizePositiveU64Number(
    input.leaseTermMs,
    "leaseTermMs",
  );
  const rawLeaseAssetDefinitionId = trimString(input.leaseAssetDefinitionId);
  const leaseAssetDefinitionId = normalizeAssetDefinitionId(
    rawLeaseAssetDefinitionId,
    "leaseAssetDefinitionId",
  );
  const baseFeeNanos = trimString(input.baseFeeNanos);
  const baseFee = soraCloudXorQuantityFromNanos(baseFeeNanos);

  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "soraCloudDeploy",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );

  const statusInput: SoraCloudHfStatusInput = {
    toriiUrl: input.toriiUrl,
    repoId,
    revision: resolvedRevision,
    storageClass,
    leaseTermMs,
    accountId,
  };
  const baselineStatus =
    await fetchOptionalSoraCloudHfStatusPayload(statusInput);
  const minimumSequenceExclusive = baselineStatus
    ? readSoraCloudHfLatestSequence(baselineStatus)
    : 0;

  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId,
      operationLabel: "Launch SoraCloud instance",
    }),
    "Launch SoraCloud instance",
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  const privateKey = hexToBuffer(privateKeyHex, "privateKeyHex");
  const request = buildSoraCloudHfDeployRequest({
    repoId,
    revision,
    modelName,
    serviceName,
    apartmentName,
    storageClass,
    leaseTermMs,
    leaseAssetDefinitionId,
    baseFeeNanos,
    privateKeyHex,
  });
  const expected: SoraCloudHfDeployExpectation = {
    accountId,
    signer: request.provenance.signer,
    joinProvenance: request.provenance,
    generatedServiceProvenance: request.generated_service_provenance,
    ...(request.generated_apartment_provenance
      ? {
          generatedApartmentProvenance: request.generated_apartment_provenance,
        }
      : {}),
    repoId,
    resolvedRevision,
    modelName,
    serviceName,
    apartmentName,
    storageClass,
    leaseTermMs,
    leaseAssetDefinitionId,
    baseFee,
  };

  let reviewedSettlement: SoraCloudHfSettlementReview | null = null;
  const result = await executeSoraCloudHfDraftToCommit({
    expected,
    minimumSequenceExclusive,
    dependencies: {
      fetchDraft: () =>
        postCanonicalSoraCloudHfDraft({
          toriiUrl: input.toriiUrl,
          accountId,
          privateKey,
          body: request,
        }),
      decodeInstruction: (payload) =>
        noritoDecodeInstruction(Buffer.from(payload)),
      authorizeSettlement: async (settlement) => {
        reviewedSettlement = settlement;
        return (
          (await ipcRenderer.invoke(SORACLOUD_SETTLEMENT_CONFIRMATION_CHANNEL, {
            accountId,
            toriiUrl: normalizeBaseUrl(input.toriiUrl),
            repoId,
            resolvedRevision,
            modelName,
            serviceName,
            storageClass,
            leaseTermMs,
            ...settlement,
          })) === true
        );
      },
      commitInstructions: async (instructions) => {
        const tx = await quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId: writeConnection.chainId,
          authority: accountId,
          networkPrefix: writeConnection.networkPrefix,
          instructions,
          metadata: {},
          privateKey,
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        });
        const submission =
          await submitSignedTransactionAndWaitForFinalizedBlock(
            input.toriiUrl,
            tx.signedTransaction,
          );
        return {
          hash: submission.hash,
          finality: submission.finality,
          ...(submission.fee ? { fee: submission.fee } : {}),
        };
      },
      fetchCommittedStatus: () => fetchSoraCloudHfStatusPayload(statusInput),
      wait: (delayMs) => waitForMs(delayMs),
    },
  });
  const pendingKey = soraCloudSettlementKey({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    transactionHash: result.tx_hash_hex,
  });
  if (result.settlement_status === "indexing") {
    if (!reviewedSettlement) {
      throw new Error(
        "SoraCloud finalized transaction is missing its reviewed settlement context.",
      );
    }
    pendingSoraCloudHfSettlements.set(pendingKey, {
      toriiUrl: normalizeBaseUrl(input.toriiUrl),
      chainId: writeConnection.chainId,
      networkPrefix: writeConnection.networkPrefix,
      accountId,
      transactionHash: result.tx_hash_hex,
      statusInput,
      expected,
      settlement: reviewedSettlement,
      minimumSequenceExclusive,
      finality: result.finality,
      ...(result.fee ? { fee: result.fee } : {}),
    });
  } else {
    pendingSoraCloudHfSettlements.delete(pendingKey);
  }
  return result;
};

const reconcileSoraCloudHfLaunchOnTorii = async (
  input: SoraCloudHfReconcileInput,
): Promise<SoraCloudHfDeployResponseView> => {
  assertNoRendererSoraCloudSecrets(input);
  const transactionHash = trimString(input.transactionHash);
  if (!/^[0-9a-f]{64}$/u.test(transactionHash)) {
    throw new Error(
      "SoraCloud reconciliation transaction hash must be canonical lowercase 32-byte hex.",
    );
  }
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "soraCloudDeploy",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const pendingKey = soraCloudSettlementKey({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    transactionHash,
  });
  const pending = pendingSoraCloudHfSettlements.get(pendingKey);
  if (!pending) {
    throw new Error(
      "No pending SoraCloud settlement matches this finalized transaction and wallet context.",
    );
  }
  const status = decodeMatchingSoraCloudHfStatus(
    await fetchSoraCloudHfStatusPayload(pending.statusInput),
    pending.expected,
    pending.settlement,
    pending.minimumSequenceExclusive,
  );
  const reconciled = buildSoraCloudCommittedLaunchResponse({
    status,
    serviceName: pending.expected.serviceName,
    transactionHash: pending.transactionHash,
    finality: pending.finality,
    ...(pending.fee ? { fee: pending.fee } : {}),
  });
  pendingSoraCloudHfSettlements.delete(pendingKey);
  return reconciled;
};

const getSoraCloudHfStatusFromTorii = async (
  input: SoraCloudHfStatusInput,
): Promise<SoraCloudHfStatusView> => {
  assertNoRendererSoraCloudSecrets(input);
  try {
    const payload = await fetchSoraCloudHfStatusPayload(input);
    return normalizeSoraCloudHfStatusPayload(payload);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return missingSoraCloudHfStatus(
        "The requested Hugging Face source or deployment was not found.",
        error.status,
      );
    }
    throw error;
  }
};

type ZkIvmRequestInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  vkRef?: unknown;
  vk_ref?: unknown;
  authority?: unknown;
  metadata?: unknown;
  bytecode?: unknown;
  proved?: unknown;
};

type ZkIvmProveJobInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  jobId?: unknown;
  job_id?: unknown;
};
type ZkIvmProvedTransactionSubmitInput = ToriiConfig & {
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex?: unknown;
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
  gasLimit?: string | number;
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
  networkPrefix: number,
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
      networkPrefix,
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

const deriveZkIvmPayloadOnTorii = async (
  input: ZkIvmRequestInput,
): Promise<Record<string, unknown>> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "zkProofJobs",
  });
  return postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/zk/ivm/derive"),
    "ZK IVM derive",
    buildZkIvmRequestPayload(input, writeConnection.networkPrefix),
  );
};

const startZkIvmProveJobOnTorii = async (
  input: ZkIvmRequestInput,
): Promise<Record<string, unknown>> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "zkProofJobs",
  });
  return postJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/zk/ivm/prove"),
    "ZK IVM prove",
    buildZkIvmRequestPayload(input, writeConnection.networkPrefix),
  );
};

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
  await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "zkProofJobs",
  });
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
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId,
    networkPrefix: input.networkPrefix,
    feature: "zkProofJobs",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
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
  const gasLimit = normalizeIntegerAmount(
    String(
      input.gasLimit ?? input.proved.gas_limit ?? input.proved.gasLimit ?? "",
    ),
    "gasLimit",
  );
  const draft = buildIvmProvedTransactionPayload({
    chainId,
    authority: accountId,
    proved: input.proved,
    attachment: input.attachment,
    feePayment: { payer: "authority", chargeLimits: [], gasLimit },
    metadata: input.metadata,
    creationTimeMs,
    ttlMs: input.ttlMs ?? 10 * 60 * 1000,
    nonce: input.nonce,
  });
  const quote = await getClient(input.toriiUrl).quoteFees(draft, {
    canonicalAuth: {
      accountId,
      privateKey: signingMaterial.privateKeyHex,
    },
  });
  const tx = signQuotedIvmProvedTransactionPayload({
    payload: draft,
    quotedFeePayment: quote.intent,
    privateKey: hexToBuffer(signingMaterial.privateKeyHex, "privateKeyHex"),
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAsVersioned(
    input.toriiUrl,
    tx.signedTransaction,
    { nativeBinding, requireNativeEncoding: true },
  );
  const finalized = await waitForTransactionFinalizedInBlock(
    input.toriiUrl,
    submission.hash,
  );
  return transactionSubmissionResult({
    ...submission,
    ...(finalized.fee ? { fee: finalized.fee } : {}),
    finality: finalized.finality,
  });
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
    `Transaction ${hashHex} ${statusKind.toLowerCase()} before finalized success.${
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
  finality: TransactionFinalityProof;
}): TransactionSubmissionResultView => ({
  hash: submission.hash,
  ...(submission.fee ? { fee: submission.fee } : {}),
  finality: submission.finality,
});

const waitForTransactionFinalizedInBlock = async (
  toriiUrl: string,
  hashHex: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
) => {
  const client = getClient(toriiUrl);
  const signal = options.signal;
  const evidence = await waitForFinalizedTransaction({
    hashHex,
    timeoutMs: options.timeoutMs ?? CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS,
    intervalMs: CONFIDENTIAL_TX_FINALITY_INTERVAL_MS,
    getGlobalStatus: () =>
      client.getTransactionStatus(hashHex, { scope: "global", signal }),
    getExplorerTransaction: () =>
      fetchJson(
        buildNexusEndpoint(
          toriiUrl,
          `/v1/explorer/transactions/${encodeURIComponent(hashHex)}`,
        ),
        `Explorer transaction ${hashHex}`,
        undefined,
        signal,
      ),
    getExplorerBlock: (blockHeight) =>
      fetchJson(
        buildNexusEndpoint(
          toriiUrl,
          `/v1/explorer/blocks/${encodeURIComponent(String(blockHeight))}`,
        ),
        `Explorer block ${blockHeight}`,
        undefined,
        signal,
      ),
    getExplorerMetrics: () =>
      fetchJson(
        buildNexusEndpoint(toriiUrl, "/v1/explorer/metrics"),
        "Explorer finality metrics",
        undefined,
        signal,
      ),
    wait: (delayMs) => waitForMs(delayMs, signal),
    buildTerminalFailure: (statusKind, payload) =>
      buildTransactionFinalityFailureError(
        toriiUrl,
        hashHex,
        statusKind,
        payload,
      ),
  });
  const fee = await fetchCommittedTransactionFee(
    toriiUrl,
    hashHex,
    evidence.statusPayload,
    evidence.transactionPayload,
  );
  return {
    fee,
    finality: evidence.proof,
  };
};

const submitSignedTransactionAndWaitForFinalizedBlock = async (
  toriiUrl: string,
  signedTransaction: Buffer,
  options: { nativeBinding?: unknown; requireNativeEncoding?: boolean } = {},
) => {
  const submission = await submitSignedTransactionAsVersioned(
    toriiUrl,
    signedTransaction,
    options,
  );
  const finalized = await waitForTransactionFinalizedInBlock(
    toriiUrl,
    submission.hash,
  );
  return {
    ...submission,
    ...(finalized.fee ? { fee: finalized.fee } : {}),
    finality: finalized.finality,
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

const submitTransactionEntrypointAndWaitForFinalizedBlock = async (
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
  const finalized = await waitForTransactionFinalizedInBlock(
    toriiUrl,
    submission.hash,
  );
  return {
    ...submission,
    ...(finalized.fee ? { fee: finalized.fee } : {}),
    finality: finalized.finality,
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
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Account assets",
  );
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

const GOVERNANCE_CITIZEN_READ_TIMEOUT_MS = 10_000;

const fetchGovernanceCitizenStatus = async (
  toriiUrlRaw: string,
  accountId: string,
  networkPrefix: number,
): Promise<GovernanceCitizenStatusResponse> => {
  const normalizedNetworkPrefix =
    normalizeGovernanceNetworkPrefix(networkPrefix);
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    accountId,
    "accountId",
    normalizedNetworkPrefix,
  );
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/gov/citizens/${encodeURIComponent(normalizedAccountId)}`,
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error("Governance citizenship status request timed out."),
    );
  }, GOVERNANCE_CITIZEN_READ_TIMEOUT_MS);
  try {
    const payload = await fetchJson(
      endpoint,
      "Governance citizenship status",
      undefined,
      controller.signal,
    );
    return decodeGovernanceCitizenStatus(payload, {
      expectedAccountId: normalizedAccountId,
      networkPrefix: normalizedNetworkPrefix,
    });
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return unavailableGovernanceCitizenStatus({
        expectedAccountId: normalizedAccountId,
        networkPrefix: normalizedNetworkPrefix,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchConfidentialAssetPolicyForAccount = async (input: {
  toriiUrl: string;
  accountId: string;
  assetDefinitionId: string;
}) => {
  const requestedAssetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
    input.assetDefinitionId,
  );
  const policy = await fetchConfidentialAssetPolicy(
    input.toriiUrl,
    requestedAssetDefinitionId,
  );
  const returnedAssetDefinitionId = extractAssetDefinitionId(
    trimString(policy.asset_id),
  ).trim();
  if (returnedAssetDefinitionId !== requestedAssetDefinitionId) {
    throw new Error(
      "Confidential asset policy returned a different asset definition.",
    );
  }
  return {
    policy,
    requestedAssetDefinitionId,
    resolvedAssetDefinitionId: returnedAssetDefinitionId,
  };
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
  const canonicalAuth = normalizedPrivateKeyHex
    ? {
        accountId: normalizedAccountId,
        privateKey: hexToBuffer(normalizedPrivateKeyHex, "privateKeyHex"),
      }
    : null;
  const items: Array<Record<string, unknown>> = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await client.listAccountTransactions(normalizedAccountId, {
      limit: PRIVATE_KAIGI_ACCOUNT_TX_PAGE_SIZE,
      offset,
      ...(canonicalAuth ? { canonicalAuth } : {}),
    });
    if (
      !page ||
      typeof page !== "object" ||
      !Array.isArray(page.items) ||
      page.items.some((item) => !isPlainRecord(item)) ||
      typeof page.total !== "number" ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      page.total < offset + page.items.length
    ) {
      throw new Error(
        "Account transaction response did not match the first-release page contract.",
      );
    }
    const pageItems = page.items as Array<Record<string, unknown>>;
    items.push(...pageItems);
    total = page.total;
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

const fetchConfidentialNoteIndexTransactions = async (input: {
  toriiUrl: string;
  assetDefinitionIds: string[];
}): Promise<WalletConfidentialTransactionLike[]> => {
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
      const response = await fetchGetResponse(
        endpoint,
        "Confidential note index",
      );
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(
          detail ||
            `Confidential note index request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const page = parseConfidentialNoteIndexPage(
        (await response.json()) as unknown,
      );
      for (const item of page.items) {
        const normalized = {
          ...item,
          note_index_order: noteIndexOrder,
        };
        noteIndexOrder += 1;
        byHash.set(normalized.entrypoint_hash ?? "", normalized);
      }
      cursor = page.nextCursor;
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
    const response = await fetchGetResponse(
      endpoint,
      "Confidential note index",
    );
    if (!response.ok) {
      const detail = await readApiErrorDetail(response);
      throw new Error(
        detail ||
          `Confidential note index request failed with status ${response.status} (${response.statusText})`,
      );
    }
    const page = parseConfidentialNoteIndexPage(
      (await response.json()) as unknown,
    );
    for (const normalized of page.items) {
      if (
        normalized.result_ok !== false &&
        typeof normalized.entrypoint_hash === "string" &&
        normalized.entrypoint_hash === normalizedHash
      ) {
        return true;
      }
    }
    cursor = page.nextCursor;
  }
  return false;
};

const waitForConfidentialRelayFinalizedBlock = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
  hashHex: string;
}) => {
  const finalized = await waitForTransactionFinalizedInBlock(
    input.toriiUrl,
    input.hashHex,
  );
  try {
    await confidentialNoteIndexIncludesEntrypointHash({
      toriiUrl: input.toriiUrl,
      assetDefinitionId: input.assetDefinitionId,
      hashHex: input.hashHex,
    });
  } catch {
    // The transaction has final block proof. Confidential note indexing is
    // reconciled independently by the wallet scanner.
  }
  return finalized;
};

const submitConfidentialRelayTransfer = async (input: {
  toriiUrl: string;
  assetDefinitionId: string;
  signedTransaction: Buffer | ArrayBuffer | ArrayBufferView;
}): Promise<{
  hash: string;
  relayAuthority: string;
  sourceHash: string;
  fee?: TransactionFeeView | null;
  finality: TransactionFinalityProof;
}> => {
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
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new Error("Anonymous shielded relay returned an invalid hash.");
  }
  const sourceHash = trimString(payload.source_tx_hash_hex);
  if (sourceHash && !/^[0-9a-f]{64}$/u.test(sourceHash)) {
    throw new Error(
      "Anonymous shielded relay returned an invalid source hash.",
    );
  }
  const finalized = await waitForConfidentialRelayFinalizedBlock({
    toriiUrl: input.toriiUrl,
    assetDefinitionId: input.assetDefinitionId,
    hashHex: hash,
  });
  return {
    hash,
    relayAuthority: trimString(payload.relay_authority),
    sourceHash,
    ...(finalized.fee ? { fee: finalized.fee } : {}),
    finality: finalized.finality,
  };
};

const readAssetDefinitionConfidentialPolicy = (
  assetDefinition: Record<string, unknown>,
  label: string,
): AssetDefinitionConfidentialPolicyView => {
  const policy = normalizeAssetDefinitionConfidentialPolicy(assetDefinition);
  if (!policy) {
    throw new Error(
      `${label} asset is missing the top-level confidential_policy.`,
    );
  }
  return policy;
};

const readConfidentialVkRef = (
  policy: Record<string, unknown>,
  key: "vk_transfer" | "vk_unshield" | "vk_shield",
  label: string,
) => {
  const rawVk = String(policy[key] ?? "").trim();
  const match = /^([^:]+)::(.+)$/.exec(rawVk);
  if (!match) {
    throw new Error(`${label} asset is missing confidential_policy.${key}.`);
  }
  return {
    backend: match[1],
    name: match[2],
  };
};

const readPrivateKaigiVkTransferRef = (
  assetDefinition: Record<string, unknown>,
) => {
  const policy = readAssetDefinitionConfidentialPolicy(
    assetDefinition,
    "Private Kaigi XOR",
  );
  return readConfidentialVkRef(policy, "vk_transfer", "Private Kaigi XOR");
};

const readConfidentialAllowUnshield = (
  assetDefinition: Record<string, unknown>,
) => {
  const policy = readAssetDefinitionConfidentialPolicy(
    assetDefinition,
    "Confidential",
  );
  return policy.allow_unshield ?? confidentialModeSupportsShield(policy.mode);
};

const readConfidentialVkUnshieldRef = (
  assetDefinition: Record<string, unknown>,
) =>
  readConfidentialVkRef(
    readAssetDefinitionConfidentialPolicy(assetDefinition, "Confidential"),
    "vk_unshield",
    "Confidential",
  );

const readConfidentialVkTransferRef = (
  assetDefinition: Record<string, unknown>,
) =>
  readConfidentialVkRef(
    readAssetDefinitionConfidentialPolicy(assetDefinition, "Confidential"),
    "vk_transfer",
    "Confidential",
  );

const mergeConfidentialPolicyWithAssetDefinition = (
  policy: ConfidentialAssetPolicyView,
  assetDefinition: Record<string, unknown>,
): ConfidentialAssetPolicyView => {
  const assetPolicy = readAssetDefinitionConfidentialPolicy(
    assetDefinition,
    "Confidential",
  );
  return {
    ...policy,
    current_mode: assetPolicy.mode,
    effective_mode: assetPolicy.mode,
    allow_shield:
      assetPolicy.allow_shield ??
      confidentialModeSupportsShield(assetPolicy.mode),
    allow_unshield:
      assetPolicy.allow_unshield ??
      confidentialModeSupportsShield(assetPolicy.mode),
    vk_transfer: assetPolicy.vk_transfer ?? policy.vk_transfer,
    vk_unshield: assetPolicy.vk_unshield ?? policy.vk_unshield,
    vk_shield: assetPolicy.vk_shield ?? policy.vk_shield,
    vk_set_hash: assetPolicy.vk_set_hash ?? policy.vk_set_hash,
    poseidon_params_id:
      assetPolicy.poseidon_params_id ?? policy.poseidon_params_id,
    pedersen_params_id:
      assetPolicy.pedersen_params_id ?? policy.pedersen_params_id,
  };
};

const resolveTrackedConfidentialAssetIds = (input: {
  requestedAssetDefinitionId: string;
  resolvedAssetId: string;
}) => {
  const seen = new Set<string>();
  return [input.requestedAssetDefinitionId, input.resolvedAssetId]
    .map((value) => extractAssetDefinitionId(String(value ?? "")).trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const resolveConfidentialAssetBalance = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
}): Promise<ConfidentialAssetBalanceResponse> => {
  const endpointScope =
    input.endpointScope ??
    (await inspectEndpointDerivedScope({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    }));
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
  const committedTransactions = noteIndexTransactions;
  const scanSource = "global-note-index" as const;
  const displayTransactions = mergeConfidentialWalletShadowTransactions({
    toriiUrl: input.toriiUrl,
    accountId: decryptionContext.accountId,
    endpointScope,
    transactions: committedTransactions as WalletConfidentialTransactionLike[],
  });
  const ledger = collectWalletConfidentialLedger(displayTransactions, {
    privateKeyHex: decryptionContext.privateKeyHex,
    chainId: input.chainId,
    assetDefinitionIds: trackedAssetIds,
    receiveKeys: decryptionContext.receiveKeys,
    markUnrecognizedTransfersInexact: false,
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
  const committedLedger = collectWalletConfidentialLedger(
    committedTransactions,
    {
      privateKeyHex: decryptionContext.privateKeyHex,
      chainId: input.chainId,
      assetDefinitionIds: trackedAssetIds,
      receiveKeys: decryptionContext.receiveKeys,
      markUnrecognizedTransfersInexact: false,
    },
  );
  const onChainBalance = {
    quantity: committedLedger.spendableQuantity,
    exact: committedLedger.exact,
  };
  return {
    resolvedAssetId,
    quantity: ledger.spendableQuantity,
    onChainQuantity: onChainBalance.quantity,
    spendableQuantity: ledger.spendableQuantity,
    exact: ledger.exact,
    scanSource,
    scanStatus: ledger.exact ? "complete" : "incomplete",
    scanWatermarkBlock,
    recoveredNoteCount: ledger.notes.length,
    trackedAssetIds,
  };
};

const resolveConfidentialTransferMaterials = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
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
  networkPrefix: number;
  accountId: string;
  privateKeyHex?: string;
  assetDefinitionId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
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

// This legacy internal builder is intentionally not exposed to the renderer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const buildUranaiPrivateTradeProofEnvelope = async (
  input: UranaiPrivateTradeProofInput,
): Promise<UranaiPrivateTradeProofResponse> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "confidentialTransfers",
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
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    privateKeyHex,
    assetDefinitionId: input.assetDefinitionId,
    endpointScope: writeConnection.endpointScope,
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
  networkPrefix: number;
  endpointScope: EndpointIdentityScopeInput;
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
    networkPrefix: input.networkPrefix,
    accountId: input.accountId,
    privateKeyHex: input.privateKeyHex,
    assetDefinitionId: input.assetDefinitionId,
    endpointScope: input.endpointScope,
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
  const tx = await quoteAndSignInstructionTransaction({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    authority: input.accountId,
    instructions: [
      buildZkTransferInstruction({
        assetDefinitionId: materials.resolvedAssetId,
        inputs: proofEnvelope.nullifiers,
        outputs: proofEnvelope.outputCommitments,
        proof: {
          backend: verifyingKeyContext.backend,
          proof: Buffer.from(proofEnvelope.proof),
          verifyingKeyRef: verifyingKeyContext.proofVerifyingKey.id,
        },
        rootHint: Buffer.from(materials.latestRootHex, "hex"),
      }),
    ],
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
    endpointScope: input.endpointScope,
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
    finality: submission.finality,
    output,
    resolvedAssetId: materials.resolvedAssetId,
    latestRootHex,
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

const resolveTransparentAssetBalance = (
  items: Array<{
    asset_id: string;
    asset_definition_id?: string | null;
    quantity: string;
  }>,
  assetDefinitionId: string,
) =>
  items.find((asset) => {
    const returnedDefinitionId =
      trimString(asset.asset_definition_id) ||
      extractAssetDefinitionId(asset.asset_id).trim();
    return returnedDefinitionId === assetDefinitionId;
  })?.quantity ?? "0";

async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
    endpointScope?: EndpointIdentityScopeInput | null;
  },
  options: {
    includeFeeMaterials: true;
  },
): Promise<PrivateKaigiConfidentialXorFeeContext>;
async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
    endpointScope?: EndpointIdentityScopeInput | null;
  },
  options?: {
    includeFeeMaterials?: boolean;
  },
): Promise<PrivateKaigiConfidentialXorContext>;
async function resolvePrivateKaigiConfidentialXorContext(
  input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
    endpointScope?: EndpointIdentityScopeInput | null;
  },
  options?: {
    includeFeeMaterials?: boolean;
  },
): Promise<
  PrivateKaigiConfidentialXorContext | PrivateKaigiConfidentialXorFeeContext
> {
  const endpointScope =
    input.endpointScope ??
    (await inspectEndpointDerivedScope({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    }));
  const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
    input.assetDefinitionId,
  );
  const { policy, requestedAssetDefinitionId, resolvedAssetDefinitionId } =
    await fetchConfidentialAssetPolicyForAccount({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      assetDefinitionId,
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
  const shadowKeys = getPrivateKaigiShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    assetDefinitionId: resolvedAssetId,
    endpointScope,
  });
  const shadowState = readPrivateKaigiShadowState(shadowKeys);
  let effectiveShieldedBalance: string | null = shieldedBalance.quantity;
  if (shieldedBalance.exact && shieldedBalance.quantity !== null) {
    syncPrivateKaigiShadowState(shadowState, shieldedBalance.quantity);
    writePrivateKaigiShadowState(shadowKeys, shadowState);
    effectiveShieldedBalance = computePrivateKaigiEffectiveShieldedBalance({
      onChainShieldedBalance: shieldedBalance.quantity,
      shadowState,
    });
  }
  const state: PrivateKaigiConfidentialXorState = {
    assetDefinitionId,
    resolvedAssetId,
    policyMode,
    shieldedBalance: effectiveShieldedBalance,
    shieldedBalanceExact: shieldedBalance.exact,
    transparentBalance: resolveTransparentAssetBalance(
      assetsResponse.items ?? [],
      resolvedAssetId,
    ),
    canSelfShield:
      confidentialModeSupportsShield(policyMode) &&
      compareDecimalStrings(
        resolveTransparentAssetBalance(
          assetsResponse.items ?? [],
          resolvedAssetId,
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
  const [assetDefinition, latestRootHex, lifecycle, pipelinePreflight] =
    await Promise.all([
      fetchPrivateKaigiAssetDefinition(input.toriiUrl, resolvedAssetId),
      fetchPrivateKaigiRoots(input.toriiUrl, resolvedAssetId),
      fetchNexusLifecycle(input.toriiUrl),
      fetchJson(
        buildNexusEndpoint(input.toriiUrl, "/v1/pipeline/preflight"),
        "Pipeline preflight",
      ),
    ]);
  const feeSchedule = readPrivateKaigiFeeSchedule(lifecycle, pipelinePreflight);
  if (!feeSchedule.enabled) {
    throw new Error(
      "Private Kaigi is unavailable because the live Nexus lifecycle is disabled.",
    );
  }
  if (feeSchedule.feeAssetDefinitionId !== resolvedAssetId) {
    throw new Error(
      `Private Kaigi fee asset ${feeSchedule.feeAssetDefinitionId} does not exactly match the configured confidential asset ${resolvedAssetId}.`,
    );
  }
  const vkTransferRef = readPrivateKaigiVkTransferRef(assetDefinition);
  const verifyingKey = await client.getVerifyingKeyTyped(
    vkTransferRef.backend,
    vkTransferRef.name,
  );

  return {
    state,
    latestRootHex,
    verifyingKey: readPrivateKaigiTransferVerifyingKey(verifyingKey),
    feeSchedule,
  };
}

const quoteAndSignInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authority: string;
  networkPrefix: number;
  instructions: object[];
  privateKey: Buffer;
  privateKeyAlgorithm: string;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
}) => {
  const request = buildCanonicalInstructionFeeQuoteRequest({
    chainId: input.chainId,
    authority: input.authority,
    networkPrefix: input.networkPrefix,
    instructions: input.instructions,
    privateKey: input.privateKey,
    metadata: input.metadata,
    creationTimeMs: input.creationTimeMs,
    ttlMs: input.ttlMs,
    nonce: input.nonce,
  });
  const quote = await getClient(input.toriiUrl).quoteFees(request.payload, {
    canonicalAuth: request.canonicalAuth,
  });
  return signQuotedTransactionPayload({
    payload: request.payload,
    quotedFeePayment: quote.intent,
    privateKey: input.privateKey,
    privateKeyAlgorithm: input.privateKeyAlgorithm,
  });
};

const submitInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authorityAccountId: string;
  networkPrefix: number;
  privateKeyHex?: string;
  signingAlgorithm?: string;
  instruction:
    | Record<string, unknown>
    | ((authority: string) => Record<string, unknown>);
}) => {
  const chainId = input.chainId.trim();
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId,
    networkPrefix: input.networkPrefix,
    feature: "stakingWrites",
  });
  const wireInput = resolveCanonicalInstructionWireInput({
    authorityAccountId: input.authorityAccountId,
    networkPrefix: writeConnection.networkPrefix,
    instruction: input.instruction,
  });
  const signingMaterial = await resolveSigningMaterial({
    accountId: wireInput.authority,
    privateKeyHex: input.privateKeyHex,
    signingAlgorithm: input.signingAlgorithm,
    operationLabel: "Transaction submission",
  });
  const privateKey = hexToBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
  );
  const tx = await quoteAndSignInstructionTransaction({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    authority: wireInput.authority,
    networkPrefix: writeConnection.networkPrefix,
    instructions: [wireInput.instruction],
    metadata: {},
    privateKey,
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
    input.toriiUrl,
    tx.signedTransaction,
  );
  return transactionSubmissionResult(submission);
};

const GOVERNANCE_REVIEW_TTL_MS = 2 * 60 * 1000;
const GOVERNANCE_REVIEW_LIMIT = 24;

type PreparedPlainReferendumBallot = {
  contractFingerprint: string;
  artifactSha256: string;
  referendumId: string;
  amount: string;
  durationBlocks: string;
  direction: "Aye" | "Nay" | "Abstain";
  citizenSnapshot: BondedGovernanceCitizenSnapshot;
};

type BondedGovernanceCitizenSnapshot = Readonly<{
  accountId: string;
  amount: string;
  bondedHeight: string;
}>;

type PreparedGovernanceAction = {
  view: GovernancePreparedActionView;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  signingAlgorithm: string;
  governanceCapabilitiesFingerprint: string;
  plainReferendumBallot: PreparedPlainReferendumBallot | null;
  payload: ReturnType<typeof buildTransactionPayload>;
  quote: FeeQuoteResponse;
};

const preparedGovernanceActions = new Map<string, PreparedGovernanceAction>();

const governanceEndpoint = (toriiUrl: string, path: string) =>
  new URL(
    path.replace(/^\//u, ""),
    `${normalizeBaseUrl(toriiUrl)}/`,
  ).toString();

const governanceRequestJson = async (
  toriiUrl: string,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    allowNotFound?: boolean;
  } = {},
): Promise<Record<string, unknown> | null> => {
  const method = options.method ?? "GET";
  const endpoint = governanceEndpoint(toriiUrl, path);
  const response =
    method === "GET"
      ? await fetchGetResponse(endpoint, `Governance ${path}`)
      : await nodeFetch(endpoint, {
          method,
          headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
  if (options.allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, `Governance ${path}`);
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, `Governance ${path}`);
};

const fetchGovernanceCapabilities = async (
  toriiUrl: string,
): Promise<GovernanceCapabilitiesV1> => {
  const payload = await governanceRequestJson(
    toriiUrl,
    GOVERNANCE_CAPABILITIES_PATH,
  );
  if (!payload) {
    throw new Error("Governance capabilities endpoint returned no contract.");
  }
  return parseGovernanceCapabilitiesV1(payload);
};

const assertGovernanceWriteCapabilities = async (
  context: GovernancePrepareContext,
): Promise<GovernanceCapabilitiesV1> => {
  await assertWriteConnectionMatchesEndpoint({
    toriiUrl: context.toriiUrl,
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
    feature: "governanceWrites",
  });
  const capabilities = await fetchGovernanceCapabilities(context.toriiUrl);
  if (
    context.chainId.trim() !== capabilities.chainId ||
    (context.networkPrefix !== undefined &&
      context.networkPrefix !== capabilities.networkPrefix) ||
    capabilities.chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    capabilities.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX
  ) {
    throw new Error(
      "The active wallet connection does not match the reviewed Taira governance capabilities.",
    );
  }
  return capabilities;
};

const assertCurrentBondedGovernanceCitizen = async (
  context: GovernancePrepareContext,
  capabilities: GovernanceCapabilitiesV1,
  expected?: BondedGovernanceCitizenSnapshot,
): Promise<BondedGovernanceCitizenSnapshot> => {
  const status = await fetchGovernanceCitizenStatus(
    context.toriiUrl,
    context.accountId,
    capabilities.networkPrefix,
  );
  if (status.state !== "citizen") {
    throw new Error(
      "A current bonded Taira citizen is required for this governance action.",
    );
  }
  if (
    status.accountId !== context.accountId ||
    typeof status.amount !== "string" ||
    !/^(?:0|[1-9]\d*)$/u.test(status.amount) ||
    typeof status.bondedHeight !== "string" ||
    !/^[1-9]\d*$/u.test(status.bondedHeight)
  ) {
    throw new Error(
      "The live Taira citizen identity, exact bond, or bonded height is malformed.",
    );
  }
  const snapshot: BondedGovernanceCitizenSnapshot = Object.freeze({
    accountId: status.accountId,
    amount: status.amount,
    bondedHeight: status.bondedHeight,
  });
  if (
    expected &&
    (snapshot.accountId !== expected.accountId ||
      snapshot.amount !== expected.amount ||
      snapshot.bondedHeight !== expected.bondedHeight)
  ) {
    throw new Error(
      "The live citizen account, bond amount, or bonded height changed after the immutable electorate snapshot.",
    );
  }
  return snapshot;
};

const governanceListLimit = (value: number | undefined) => {
  const normalized = value ?? 20;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new Error("Governance proposal limit must be between 1 and 100.");
  }
  return normalized;
};

const fetchGovernanceProposalList = async (
  input: GovernanceProposalListInput,
): Promise<GovernanceProposalList> => {
  const payload = await governanceRequestJson(
    input.toriiUrl,
    VALIDATION_FEE_PROPOSALS_PATH,
    { allowNotFound: true },
  );
  if (!payload) {
    throw new Error(
      "This Torii endpoint does not expose the typed validation-fee proposal catalog. Load a proposal with its exact 32-byte ID instead.",
    );
  }
  const limit = governanceListLimit(input.limit);
  const normalized = normalizeGovernanceProposalList(payload);
  const status = input.status?.trim().toLowerCase();
  const kind = input.kind?.trim().toLowerCase();
  const proposer = input.proposer?.trim();
  return {
    items: normalized.items
      .filter(
        (proposal) =>
          (!status || proposal.status.toLowerCase() === status) &&
          (!kind || proposal.kindType.toLowerCase() === kind) &&
          (!proposer || proposal.proposer === proposer),
      )
      .slice(0, limit),
    nextCursor: null,
  };
};

const fetchGovernanceProposalDetail = async (
  input: GovernanceProposalDetailInput,
): Promise<GovernanceProposalDetail> => {
  const proposalId = canonicalGovernanceProposalId(input.proposalId);
  if (!proposalId) {
    throw new Error("proposalId must be 32-byte hex.");
  }
  const rawId = proposalId.slice(2);
  const typedDetailPath = input.accountId?.trim()
    ? `${validationFeeProposalPath(rawId)}?account_id=${encodeURIComponent(
        normalizeCompatAccountIdLiteral(input.accountId, "accountId"),
      )}`
    : validationFeeProposalPath(rawId);
  const typedDetail = await governanceRequestJson(
    input.toriiUrl,
    typedDetailPath,
    { allowNotFound: true },
  );
  if (!typedDetail) {
    throw new Error(
      `Typed validation-fee proposal ${proposalId} was not found.`,
    );
  }
  return normalizeGovernanceProposalDetail(typedDetail, proposalId);
};

const fetchGovernanceValidationFeePolicy = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}): Promise<GovernanceValidationFeePolicyView> => {
  const endpoint = trimString(input.toriiUrl);
  if (!endpoint) {
    throw new Error(
      "The active Taira endpoint is required for validation fees.",
    );
  }
  const chainId = trimString(input.chainId);
  const networkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (
    chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX
  ) {
    throw new Error(
      "Validation-fee policy reads require the exact Taira governance chain identity.",
    );
  }
  const capabilities = await fetchGovernanceCapabilities(endpoint);
  if (
    capabilities.chainId !== chainId ||
    capabilities.networkPrefix !== networkPrefix
  ) {
    throw new Error(
      "Validation-fee policy proof does not match the active endpoint governance identity.",
    );
  }
  return (await ipcRenderer.invoke(
    GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL,
  )) as GovernanceValidationFeePolicyView;
};

const fetchGovernancePlainReferendumContract = async (
  observedIdentity: GovernancePlainReferendumObservedIdentity,
): Promise<LoadedGovernancePlainReferendumContract> => {
  const loaded = (await ipcRenderer.invoke(
    GOVERNANCE_PLAIN_REFERENDUM_IPC_CHANNEL,
    observedIdentity,
  )) as unknown;
  if (
    !isPlainRecord(loaded) ||
    !isPlainRecord(loaded.contract) ||
    typeof loaded.contractFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/u.test(loaded.contractFingerprint) ||
    typeof loaded.artifactSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(loaded.artifactSha256) ||
    !isPlainRecord(loaded.source) ||
    typeof loaded.source.descriptorUrl !== "string" ||
    typeof loaded.source.artifactUrl !== "string"
  ) {
    throw new Error(
      "The main process returned a malformed PLAIN referendum contract.",
    );
  }
  return loaded as LoadedGovernancePlainReferendumContract;
};

const normalizeGovernanceWireId = normalizeGovernanceDraftWireId;

const governanceInstructionVariant = (
  instruction: Record<string, unknown>,
): { variant: string; payload: Record<string, unknown> } => {
  const entries = Object.entries(instruction);
  if (entries.length !== 1 || !isPlainRecord(entries[0][1])) {
    throw new Error(
      "Governance draft must decode to exactly one typed instruction variant.",
    );
  }
  return {
    variant: entries[0][0],
    payload: entries[0][1] as Record<string, unknown>,
  };
};

const normalizeComparableGovernanceValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }
  if (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every(
      (entry) =>
        Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255,
    )
  ) {
    return `0x${Buffer.from(value as number[]).toString("hex")}`;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    const hash = canonicalGovernanceProposalId(value);
    if (hash) return hash;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeComparableGovernanceValue);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          normalizeComparableGovernanceValue(entry),
        ]),
    );
  }
  return value;
};

const governanceValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeComparableGovernanceValue(left)) ===
  JSON.stringify(normalizeComparableGovernanceValue(right));

const assertGovernanceDecodedVariant = (
  decoded: Record<string, unknown>,
  expectedVariant: string,
  expectedPayload: Record<string, unknown>,
) => {
  const { variant, payload } = governanceInstructionVariant(decoded);
  if (variant !== expectedVariant) {
    throw new Error(
      `Governance draft decoded as ${variant}; expected ${expectedVariant}.`,
    );
  }
  assertGovernanceExactKeys(
    payload,
    Object.keys(expectedPayload),
    `Decoded ${expectedVariant} payload`,
  );
  if (!governanceValuesEqual(payload, expectedPayload)) {
    throw new Error(
      `Decoded ${expectedVariant} payload changed the exact reviewed fields.`,
    );
  }
};

const decodeGovernanceDraftInstruction = (
  draft: Record<string, unknown>,
  expectedVariant: string,
): Record<string, unknown> => {
  const instructions = draft.tx_instructions;
  if (!Array.isArray(instructions) || instructions.length !== 1) {
    throw new Error("Governance draft must contain exactly one instruction.");
  }
  const item = ensureObjectResponse(
    instructions[0],
    "Governance draft instruction",
  );
  assertGovernanceExactKeys(
    item,
    ["payload_hex", "wire_id"],
    "Governance draft instruction",
  );
  const wireId = normalizeGovernanceWireId(item.wire_id);
  const reviewedWireIds: Readonly<Record<string, string>> = {
    RegisterCitizen: "iroha_data_model::isi::governance::RegisterCitizen",
    ProposeValidationFeePolicy: VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
    ProposeValidationFeePayoutLifecycle:
      VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
    CastPlainBallot: GOVERNANCE_BALLOT_WIRE_IDS.CastPlainBallot,
    CastParliamentBallot: GOVERNANCE_BALLOT_WIRE_IDS.CastParliamentBallot,
    EnactReferendum: "iroha_data_model::isi::governance::EnactReferendum",
  };
  const expectedWireId = reviewedWireIds[expectedVariant];
  if (!expectedWireId || wireId !== expectedWireId) {
    throw new Error(
      `Governance draft returned ${wireId}; expected exact wire id ${expectedWireId ?? "unsupported"}.`,
    );
  }
  const payloadHex = normalizeGovernanceDraftPayloadHex(item.payload_hex);
  const decoded = noritoDecodeInstruction(Buffer.from(payloadHex, "hex"));
  if (!isPlainRecord(decoded)) {
    throw new Error(
      "Governance draft instruction did not decode to an object.",
    );
  }
  const variant = governanceInstructionVariant(decoded);
  if (variant.variant !== expectedVariant) {
    throw new Error(
      `Governance payload decoded as ${variant.variant}; expected ${expectedVariant}.`,
    );
  }
  return decoded;
};

const governanceProposalEndpoint = (
  kind: GovernanceProposalPrepareInput["kind"],
) => {
  switch (kind) {
    case "ValidationFeePayoutLifecycle":
      return {
        path: VALIDATION_FEE_POLICY_DRAFT_PATH,
        wireId: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_DECODED_VARIANT,
      };
    case "ValidationFeePolicy":
      return {
        path: VALIDATION_FEE_POLICY_DRAFT_PATH,
        wireId: VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT,
      };
  }
};

const prunePreparedGovernanceActions = () => {
  const now = Date.now();
  for (const [reviewId, prepared] of preparedGovernanceActions) {
    if (prepared.view.expiresAtMs <= now) {
      preparedGovernanceActions.delete(reviewId);
    }
  }
  while (preparedGovernanceActions.size >= GOVERNANCE_REVIEW_LIMIT) {
    const oldest = preparedGovernanceActions.keys().next().value;
    if (typeof oldest !== "string") break;
    preparedGovernanceActions.delete(oldest);
  }
};

const governanceFeeView = (
  quote: FeeQuoteResponse,
): GovernancePreparedActionView["fee"] => ({
  payer: quote.intent.payer,
  components: quote.components.map((component) => ({
    kind: component.kind.kind,
    assetDefinitionId: component.asset_definition_id,
    maxAmount: component.max_amount,
  })),
  nextBlockHeight: String(quote.observation.next_block_height),
});

const prepareGovernanceDecodedAction = async (input: {
  context: GovernancePrepareContext;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId?: string | null;
  referendumId?: string | null;
  plainReferendumBallot?: PreparedPlainReferendumBallot | null;
  draft: Record<string, unknown>;
  expectedVariant: string;
  validate: (decoded: Record<string, unknown>) => void;
}): Promise<GovernancePreparedActionView> => {
  const chainId = normalizeNonEmptyString(input.context.chainId, "chainId");
  const governanceCapabilities = await assertGovernanceWriteCapabilities(
    input.context,
  );
  const governanceCapabilitiesFingerprint =
    governanceCapabilitiesContractFingerprintV1(governanceCapabilities);
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.context.toriiUrl,
    chainId,
    networkPrefix: input.context.networkPrefix,
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.context.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const decoded = decodeGovernanceDraftInstruction(
    input.draft,
    input.expectedVariant,
  );
  input.validate(decoded);
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    operationLabel: input.title,
  });
  const privateKey = hexToBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
  );
  const payload = buildTransactionPayload({
    chainId,
    authority: accountId,
    instructions: [decoded],
    feePayment: { payer: "authority", chargeLimits: [] },
    metadata: {},
  });
  const quote = await getClient(input.context.toriiUrl).quoteFees(payload, {
    canonicalAuth: { accountId, privateKey },
  });
  const reviewId = randomBytes(24).toString("base64url");
  const proposalId =
    canonicalGovernanceProposalId(
      input.proposalId ?? input.draft.proposal_id,
    ) ?? null;
  const expiresAtMs = Date.now() + GOVERNANCE_REVIEW_TTL_MS;
  const view: GovernancePreparedActionView = {
    reviewId,
    operation: input.operation,
    title: input.title,
    proposalId,
    referendumId: input.referendumId?.trim() || null,
    decodedInstruction: decoded,
    fee: governanceFeeView(quote),
    expiresAtMs,
  };
  prunePreparedGovernanceActions();
  preparedGovernanceActions.set(reviewId, {
    view,
    toriiUrl: input.context.toriiUrl,
    chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    signingAlgorithm: signingMaterial.signingAlgorithm,
    governanceCapabilitiesFingerprint,
    plainReferendumBallot: input.plainReferendumBallot ?? null,
    payload,
    quote,
  });
  return view;
};

const assertGovernanceExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
};

const prepareGovernanceCitizenRegistrationAction = async (
  input: GovernanceCitizenRegistrationPrepareInput,
) => {
  const capabilities = await assertGovernanceWriteCapabilities(input);
  const owner = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    capabilities.networkPrefix,
  );
  const amount = normalizeIntegerAmount(input.amount, "amount");
  if (amount !== capabilities.citizenshipBondAmount) {
    throw new Error(
      "The reviewed citizenship bond differs from the endpoint capabilities.",
    );
  }
  const draft = await governanceRequestJson(
    input.toriiUrl,
    GOVERNANCE_CITIZEN_DRAFT_PATH,
    {
      method: "POST",
      body: { version: 1, owner },
    },
  );
  if (!draft) {
    throw new Error("Governance citizenship endpoint returned no draft.");
  }
  assertGovernanceCitizenDraftResponse(draft, { owner, amount });
  return prepareGovernanceDecodedAction({
    context: input,
    operation: "register-citizen",
    title: "Register bonded citizen",
    draft,
    expectedVariant: "RegisterCitizen",
    validate(decoded) {
      assertGovernanceDecodedVariant(decoded, "RegisterCitizen", {
        owner,
        amount,
      });
    },
  });
};

const prepareGovernanceProposalAction = async (
  input: GovernanceProposalPrepareInput,
) => {
  const capabilities = await assertGovernanceWriteCapabilities(input);
  await assertCurrentBondedGovernanceCitizen(input, capabilities);
  if (!isPlainRecord(input.payload)) {
    throw new Error("Governance proposal payload must be an object.");
  }
  const endpoint = governanceProposalEndpoint(input.kind);
  const validationFeeRequest: ValidationFeePolicyDraftRequest | null =
    input.kind === "ValidationFeePolicy"
      ? buildValidationFeePolicyDraftRequest(
          input.payload,
          capabilities.validationFeePlainElectorateRules,
        )
      : null;
  const validationFeePayoutLifecycleRequest: ValidationFeePayoutLifecycleDraftRequest | null =
    input.kind === "ValidationFeePayoutLifecycle"
      ? buildValidationFeePayoutLifecycleDraftRequest(
          input.payload,
          capabilities.validationFeePlainElectorateRules,
        )
      : null;
  if (validationFeeRequest) {
    assertValidationFeeDraftWindowAgainstCapabilities(
      validationFeeRequest.referendum_window,
      capabilities,
    );
  }
  if (validationFeePayoutLifecycleRequest) {
    assertValidationFeeDraftWindowAgainstCapabilities(
      validationFeePayoutLifecycleRequest.referendum_window,
      capabilities,
    );
  }
  if (
    computeValidationFeePolicyProposalFingerprintV1.length !== 3 ||
    computeValidationFeePayoutLifecycleProposalFingerprintV1.length !== 2
  ) {
    throw new Error(
      "The Iroha SDK does not expose the exact rules-bound validation-fee proposal fingerprint API.",
    );
  }
  const expectedValidationFeeProposalId = validationFeeRequest
    ? (
        computeValidationFeePolicyProposalFingerprintV1 as unknown as (
          policy: Record<string, unknown>,
          payoutLifecycleProposalId: string | null,
          plainElectorateRules: Record<string, unknown>,
        ) => string
      )(
        validationFeeRequest.proposal.payload.policy,
        validationFeeRequest.proposal.payload.payout_lifecycle_proposal_id,
        validationFeeRequest.plain_electorate_rules,
      )
    : null;
  const expectedValidationFeePayoutLifecycleProposalId =
    validationFeePayoutLifecycleRequest
      ? (
          computeValidationFeePayoutLifecycleProposalFingerprintV1 as unknown as (
            payoutBinding: Record<string, unknown>,
            plainElectorateRules: Record<string, unknown>,
          ) => string
        )(
          validationFeePayoutLifecycleRequest.proposal.payload.payout_binding,
          validationFeePayoutLifecycleRequest.plain_electorate_rules,
        )
      : null;
  const requestPayload =
    validationFeeRequest ?? validationFeePayoutLifecycleRequest;
  if (!requestPayload) {
    throw new Error(
      "This proposal kind is not advertised by the Taira governance capabilities.",
    );
  }
  const draft = await governanceRequestJson(input.toriiUrl, endpoint.path, {
    method: "POST",
    body: requestPayload,
  });
  if (!draft)
    throw new Error("Governance proposal endpoint returned no draft.");
  if (validationFeeRequest) {
    assertValidationFeePolicyDraftResponse(
      draft,
      validationFeeRequest,
      expectedValidationFeeProposalId as string,
    );
  } else if (validationFeePayoutLifecycleRequest) {
    assertValidationFeePayoutLifecycleDraftResponse(
      draft,
      validationFeePayoutLifecycleRequest,
      expectedValidationFeePayoutLifecycleProposalId as string,
    );
  }
  return prepareGovernanceDecodedAction({
    context: input,
    operation: "propose",
    title: `Propose ${input.kind}`,
    proposalId: trimString(draft.proposal_id),
    draft,
    expectedVariant: endpoint.wireId,
    validate(decoded) {
      if (validationFeeRequest) {
        assertValidationFeePolicyDecodedInstruction(
          decoded,
          validationFeeRequest,
        );
      } else if (validationFeePayoutLifecycleRequest) {
        assertValidationFeePayoutLifecycleDecodedInstruction(
          decoded,
          validationFeePayoutLifecycleRequest,
        );
      }
    },
  });
};

const assertWritableGovernanceProposalKind = (
  proposal: GovernanceProposalDetail,
): void => {
  if (
    proposal.kind.type !== "ValidationFeePayoutLifecycle" &&
    proposal.kind.type !== "ValidationFeePolicy"
  ) {
    throw new Error(
      "This proposal kind is not advertised by the Taira governance capabilities and remains inspect-only.",
    );
  }
};

const prepareGovernancePlainBallotAction = async (
  input: GovernancePlainBallotPrepareInput,
) => {
  const capabilities = await assertGovernanceWriteCapabilities(input);
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    capabilities.networkPrefix,
  );
  const plainReferendum = await fetchGovernancePlainReferendumContract({
    chainId: TAIRA_GOVERNANCE_CHAIN_ID,
    networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
    genesisHash: capabilities.genesisHash,
  });
  const reviewedCitizen = plainReferendum.contract.eligibleCitizens.find(
    (citizen) => citizen.accountId === accountId,
  );
  if (!reviewedCitizen) {
    throw new Error(
      "The active account is outside the immutable eligible-citizen snapshot.",
    );
  }
  const citizenSnapshot: BondedGovernanceCitizenSnapshot = Object.freeze({
    accountId: reviewedCitizen.accountId,
    amount: reviewedCitizen.amount,
    bondedHeight: reviewedCitizen.bondedHeight,
  });
  await assertCurrentBondedGovernanceCitizen(
    {
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      accountId,
      networkPrefix: input.networkPrefix,
    },
    capabilities,
    citizenSnapshot,
  );
  const referendumId = normalizeNonEmptyString(
    input.referendumId,
    "referendumId",
  );
  const durationBlocks = normalizeGovernancePositiveInteger(
    input.durationBlocks,
    "durationBlocks",
    GOVERNANCE_U64_MAX,
  );
  const amount = normalizeGovernancePositiveInteger(
    input.amount,
    "amount",
    GOVERNANCE_U128_MAX,
  );
  if (compareDecimalStrings(amount, capabilities.minBondAmount) < 0) {
    throw new Error(
      "Citizen ballot amount is below the Taira governance minimum bond.",
    );
  }
  if (BigInt(durationBlocks) < BigInt(capabilities.convictionStepBlocks)) {
    throw new Error(
      "Citizen ballot lock duration is below the Taira conviction minimum.",
    );
  }
  const proposalId = canonicalGovernanceProposalId(input.proposalId);
  if (!proposalId) throw new Error("proposalId must be 32-byte hex.");
  const proposal = await fetchGovernanceProposalDetail({
    toriiUrl: input.toriiUrl,
    proposalId,
    accountId,
  });
  if (proposal.kind.type !== "ValidationFeePolicy") {
    throw new Error(
      "The immutable public electorate is only valid for its validation-fee policy proposal.",
    );
  }
  assertPlainGovernanceProposalWrite(proposal);
  if (
    !proposal.referendum ||
    proposal.referendum.id !== referendumId ||
    !isReferendumPlainVoteOpen(proposal)
  ) {
    throw new Error("The reviewed PLAIN referendum is not open.");
  }
  assertGovernancePlainReferendumBallotBinding(plainReferendum, {
    chainId: normalizeNonEmptyString(input.chainId, "chainId"),
    proposalId,
    referendumId,
    accountId,
    hStart: proposal.referendum.hStart,
    hEnd: proposal.referendum.hEnd,
    mode: proposal.referendum.mode,
    amount,
    durationBlocks,
    direction: input.direction,
    hasExistingLock: proposal.locks.some((lock) => lock.owner === accountId),
  });
  if (!plainBallotLockCoversReferendum(proposal, durationBlocks)) {
    throw new Error(
      "Citizen ballot lock duration must cover the referendum end height.",
    );
  }
  const draftRoute = validationFeePlainBallotDraftPath(proposalId.slice(2));
  if (plainReferendum.contract.ballot.draftRoute !== draftRoute) {
    throw new Error(
      "The hash-bound validation-fee ballot route differs from the selected proposal.",
    );
  }
  const body = {
    version: plainReferendum.contract.ballot.requestVersion,
    owner: accountId,
    direction: input.direction.toUpperCase(),
  };
  const draft = await governanceRequestJson(input.toriiUrl, draftRoute, {
    method: "POST",
    body,
  });
  if (!draft) throw new Error("Governance ballot endpoint returned no draft.");
  assertGovernancePlainReferendumBallotDraft(draft, plainReferendum, {
    owner: accountId,
    direction: input.direction,
  });
  return prepareGovernanceDecodedAction({
    context: input,
    operation: "plain-ballot",
    title: "Submit citizen ballot",
    proposalId,
    referendumId,
    plainReferendumBallot: {
      contractFingerprint: plainReferendum.contractFingerprint,
      artifactSha256: plainReferendum.artifactSha256,
      referendumId,
      amount,
      durationBlocks,
      direction: input.direction,
      citizenSnapshot,
    },
    draft,
    expectedVariant: "CastPlainBallot",
    validate(decoded) {
      assertGovernanceDecodedVariant(decoded, "CastPlainBallot", {
        referendum_id: referendumId,
        owner: accountId,
        amount,
        duration_blocks: durationBlocks,
        direction: String(normalizeBallotDirectionCode(input.direction)),
      });
    },
  });
};

const prepareGovernanceParliamentBallotAction = async (
  input: GovernanceParliamentBallotPrepareInput,
) => {
  const capabilities = await assertGovernanceWriteCapabilities(input);
  const accountId = normalizeCompatAccountIdLiteral(
    input.accountId,
    "accountId",
    capabilities.networkPrefix,
  );
  const proposalId = canonicalGovernanceProposalId(input.proposalId);
  if (!proposalId) throw new Error("proposalId must be 32-byte hex.");
  const proposal = await fetchGovernanceProposalDetail({
    toriiUrl: input.toriiUrl,
    proposalId,
    accountId,
  });
  assertWritableGovernanceProposalKind(proposal);
  assertPlainGovernanceProposalWrite(proposal);
  if (proposal.referendum?.status !== "Proposed") {
    throw new Error(
      "Parliament body ballots close when the citizen referendum opens.",
    );
  }
  const bodyName = normalizeNonEmptyString(input.body, "body");
  if (!isAccountInParliamentRoster(proposal, accountId, bodyName)) {
    throw new Error(
      "The active account is not a seated member of this Parliament body.",
    );
  }
  if (
    proposal.parliamentOutcomes.find((outcome) => outcome.body === bodyName)
      ?.currentAccountDecision
  ) {
    throw new Error(
      "The active account already cast its ballot for this Parliament body.",
    );
  }
  const body = {
    authority: accountId,
    chain_id: normalizeNonEmptyString(input.chainId, "chainId"),
    proposal_id: proposalId,
    body: bodyName,
    decision: input.decision,
  };
  const draft = await governanceRequestJson(
    input.toriiUrl,
    "/v1/gov/parliament/ballots",
    { method: "POST", body },
  );
  if (!draft) {
    throw new Error("Parliament ballot endpoint returned no draft.");
  }
  assertGovernanceBallotDraftResponse(draft, "CastParliamentBallot");
  return prepareGovernanceDecodedAction({
    context: input,
    operation: "parliament-ballot",
    title: "Submit Parliament stage ballot",
    proposalId,
    draft,
    expectedVariant: "CastParliamentBallot",
    validate(decoded) {
      assertGovernanceDecodedVariant(decoded, "CastParliamentBallot", {
        proposal_id: proposalId,
        body: bodyName,
        decision: input.decision,
      });
    },
  });
};

const prepareGovernanceEnactAction = async (
  input: GovernanceEnactPrepareInput,
) => {
  await assertGovernanceWriteCapabilities(input);
  throw new Error(
    "Validation-fee finalization and enactment are operator-only typed workflows; the public wallet does not expose a generic enact action.",
  );
};

const confirmPreparedGovernanceAction = async (input: {
  reviewId: string;
  accountId: string;
}): Promise<GovernanceFinalizedActionView> => {
  prunePreparedGovernanceActions();
  const reviewId = normalizeNonEmptyString(input.reviewId, "reviewId");
  const prepared = preparedGovernanceActions.get(reviewId);
  if (!prepared) {
    throw new Error(
      "Governance review expired or is no longer available. Prepare it again.",
    );
  }
  const governanceCapabilities = await assertGovernanceWriteCapabilities({
    toriiUrl: prepared.toriiUrl,
    chainId: prepared.chainId,
    networkPrefix: prepared.networkPrefix,
    accountId: prepared.accountId,
  });
  const governanceCapabilitiesFingerprint =
    governanceCapabilitiesContractFingerprintV1(governanceCapabilities);
  if (
    governanceCapabilitiesFingerprint !==
    prepared.governanceCapabilitiesFingerprint
  ) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error(
      "Governance capabilities changed after review. Prepare the action again.",
    );
  }
  const accountId =
    prepared.view.operation === "plain-ballot"
      ? normalizeCanonicalAccountIdLiteral(
          input.accountId,
          "accountId",
          governanceCapabilities.networkPrefix,
        )
      : normalizeCompatAccountIdLiteral(
          input.accountId,
          "accountId",
          governanceCapabilities.networkPrefix,
        );
  if (accountId !== prepared.accountId) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error("Active account changed after governance review.");
  }
  if (prepared.view.operation === "plain-ballot") {
    try {
      const ballot = prepared.plainReferendumBallot;
      if (!ballot || !prepared.view.proposalId) {
        throw new Error(
          "Governance ballot review is missing its immutable electorate binding.",
        );
      }
      const plainReferendum = await fetchGovernancePlainReferendumContract({
        chainId: TAIRA_GOVERNANCE_CHAIN_ID,
        networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
        genesisHash: governanceCapabilities.genesisHash,
      });
      if (
        plainReferendum.contractFingerprint !== ballot.contractFingerprint ||
        plainReferendum.artifactSha256 !== ballot.artifactSha256
      ) {
        throw new Error(
          "The immutable PLAIN referendum contract changed after review.",
        );
      }
      await assertCurrentBondedGovernanceCitizen(
        {
          toriiUrl: prepared.toriiUrl,
          chainId: prepared.chainId,
          accountId,
          networkPrefix: prepared.networkPrefix,
        },
        governanceCapabilities,
        ballot.citizenSnapshot,
      );
      const proposal = await fetchGovernanceProposalDetail({
        toriiUrl: prepared.toriiUrl,
        proposalId: prepared.view.proposalId,
        accountId,
      });
      if (
        proposal.kind.type !== "ValidationFeePolicy" ||
        !proposal.referendum ||
        proposal.referendum.id !== ballot.referendumId ||
        !isReferendumPlainVoteOpen(proposal)
      ) {
        throw new Error(
          "The reviewed validation-fee PLAIN referendum is no longer open.",
        );
      }
      assertGovernancePlainReferendumBallotBinding(plainReferendum, {
        chainId: prepared.chainId,
        proposalId: prepared.view.proposalId,
        referendumId: ballot.referendumId,
        accountId,
        hStart: proposal.referendum.hStart,
        hEnd: proposal.referendum.hEnd,
        mode: proposal.referendum.mode,
        amount: ballot.amount,
        durationBlocks: ballot.durationBlocks,
        direction: ballot.direction,
        hasExistingLock: proposal.locks.some(
          (lock) => lock.owner === accountId,
        ),
      });
    } catch (error) {
      preparedGovernanceActions.delete(reviewId);
      throw error;
    }
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    operationLabel: prepared.view.title,
  });
  if (signingMaterial.signingAlgorithm !== prepared.signingAlgorithm) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error(
      "Wallet signing algorithm changed after governance review.",
    );
  }
  preparedGovernanceActions.delete(reviewId);
  const signed = signQuotedTransactionPayload({
    payload: prepared.payload,
    quotedFeePayment: prepared.quote.intent,
    privateKey: hexToBuffer(signingMaterial.privateKeyHex, "privateKeyHex"),
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
    prepared.toriiUrl,
    signed.signedTransaction,
  );
  return {
    ...transactionSubmissionResult(submission),
    operation: prepared.view.operation,
    proposalId: prepared.view.proposalId,
    referendumId: prepared.view.referendumId,
    status: "finalized",
  };
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
  chainId: string;
  context: PrivateKaigiConfidentialXorFeeContext;
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
  const context = input.context;
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
    const envelope = buildPrivateKaigiFeeSpend({
      chainId: input.chainId.trim(),
      assetDefinitionId: context.state.resolvedAssetId,
      actionHash: provisional.actionHash,
      anchorRootHex: context.latestRootHex,
      feeAmount,
      verifyingKey: context.verifyingKey.proofVerifyingKey,
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

const assertIrohaConnectWalletContext = async (
  context: IrohaConnectWalletContext,
): Promise<IrohaConnectWalletContext> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: context.toriiUrl,
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
    feature: "irohaConnectSessions",
  });
  return {
    toriiUrl: normalizeBaseUrl(context.toriiUrl),
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId: normalizeCompatAccountIdLiteral(
      context.accountId,
      "accountId",
      writeConnection.networkPrefix,
    ),
  };
};

const signExactIrohaConnectMessage = async (
  context: IrohaConnectWalletContext,
  message: Uint8Array,
) => {
  const verifiedContext = await assertIrohaConnectWalletContext(context);
  if (message.length === 0) {
    throw new Error("IrohaConnect signing message is empty.");
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId: verifiedContext.accountId,
    operationLabel: "IrohaConnect signing",
  });
  const privateKey = hexToBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
  );
  const algorithmCode = getConnectSigningAlgorithmCode(
    signingMaterial.signingAlgorithm,
  );
  if (algorithmCode !== 0) {
    throw new Error(
      "IrohaConnect current v1 wallet signatures require Ed25519.",
    );
  }
  const signature = Buffer.from(
    sign(Buffer.from(message), privateKey, {
      algorithm: signingMaterial.signingAlgorithm,
    }),
  );
  return {
    algorithmCode,
    algorithmLabel: signingAlgorithmLabel(signingMaterial.signingAlgorithm),
    signatureHex: toHex(signature),
    signatureBase64: signature.toString("base64"),
  };
};

const irohaConnectBoundary = new IrohaConnectBoundary({
  assertContext: assertIrohaConnectWalletContext,
  authorize: async (confirmation) =>
    (await ipcRenderer.invoke(
      IROHA_CONNECT_CONFIRMATION_CHANNEL,
      confirmation,
    )) === true,
  sign: signExactIrohaConnectMessage,
});

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
  async inspectEndpoint(config) {
    return inspectEndpointIdentity(config);
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
  deriveConfidentialOwnerTag(input) {
    return {
      ownerTagHex: deriveWalletConfidentialOwnerTagHex(input),
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
    networkPrefix,
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
    const endpointScope = await inspectEndpointDerivedScope({
      toriiUrl,
      chainId: normalizedChainId,
      networkPrefix,
    });
    const receiveKeys =
      await listConfidentialReceiveKeysForAccount(normalizedAccountId);
    const shadowState = readConfidentialWalletShadowState(
      getConfidentialWalletShadowKeys({
        toriiUrl,
        accountId: normalizedAccountId,
        endpointScope,
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
    chainId,
    networkPrefix,
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
    const normalizedChainId = trimString(chainId);
    if (!normalizedChainId) {
      throw new Error("chainId is required.");
    }
    if (confidentialWallet.chainId !== normalizedChainId) {
      throw new Error(
        "Confidential wallet backup does not match the active chain.",
      );
    }
    const endpointScope = await inspectEndpointDerivedScope({
      toriiUrl,
      chainId: normalizedChainId,
      networkPrefix,
    });
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
    const shadowKeys = getConfidentialWalletShadowKeys({
      toriiUrl,
      accountId: normalizedAccountId,
      endpointScope,
    });
    const existingShadowState = readConfidentialWalletShadowState(shadowKeys);
    writeConfidentialWalletShadowState(shadowKeys, {
      transactions: [
        ...existingShadowState.transactions,
        ...decryptedState.shadowTransactions,
      ],
    });
  },
  async registerAccount(input) {
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
      feature: "accountRegistration",
    });
    const domainId = input.domainId.trim();
    if (!domainId) {
      throw new Error("domainId is required.");
    }
    const authorityAccountId = normalizeCompatAccountIdLiteral(
      input.authorityAccountId,
      "authorityAccountId",
      writeConnection.networkPrefix,
    );
    const authoritySigningMaterial = await resolveSigningMaterial({
      accountId: authorityAccountId,
      privateKeyHex: input.authorityPrivateKeyHex,
      signingAlgorithm: input.authoritySigningAlgorithm,
      operationLabel: "Create on-chain account",
    });
    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl: input.toriiUrl,
      chainId: writeConnection.chainId,
      networkPrefix: writeConnection.networkPrefix,
      authority: authorityAccountId,
      instructions: [
        buildRegisterAccountInstruction({
          accountId: normalizeCompatAccountIdLiteral(
            input.accountId,
            "accountId",
            writeConnection.networkPrefix,
          ),
          metadata: input.metadata ?? {},
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, input.toriiUrl),
      privateKey: hexToBuffer(
        authoritySigningMaterial.privateKeyHex,
        "authorityPrivateKeyHex",
      ),
      privateKeyAlgorithm: authoritySigningMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
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
      feature:
        input.shielded || input.unshield
          ? "confidentialTransfers"
          : "assetTransfers",
    });
    const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
      input.assetDefinitionId,
    );
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
          assetDefinitionId,
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
        networkPrefix,
        accountId,
        privateKeyHex,
        assetDefinitionId: resolvedAssetId,
        endpointScope: writeConnection.endpointScope,
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
          networkPrefix,
          endpointScope: writeConnection.endpointScope,
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
      const tx = await quoteAndSignInstructionTransaction({
        toriiUrl: input.toriiUrl,
        chainId,
        networkPrefix,
        authority: accountId,
        instructions: [
          buildUnshieldInstruction({
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
          }),
        ],
        metadata,
        privateKey,
        privateKeyAlgorithm: signingMaterial.signingAlgorithm,
      });
      const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
        input.toriiUrl,
        tx.signedTransaction,
      );
      upsertConfidentialWalletShadowTransaction({
        toriiUrl: input.toriiUrl,
        accountId,
        endpointScope: writeConnection.endpointScope,
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
          assetDefinitionId,
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
        const tx = await quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId,
          networkPrefix,
          authority: accountId,
          instructions: [
            buildShieldInstruction({
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
            }),
          ],
          metadata,
          privateKey,
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        });
        const submission = await submitSignedTransactionAsVersioned(
          input.toriiUrl,
          tx.signedTransaction,
        );
        const finalized = await waitForTransactionFinalizedInBlock(
          input.toriiUrl,
          submission.hash,
        );
        const finalizedSubmission = {
          ...submission,
          ...(finalized.fee ? { fee: finalized.fee } : {}),
          finality: finalized.finality,
        };
        upsertConfidentialWalletShadowTransaction({
          toriiUrl: input.toriiUrl,
          accountId,
          endpointScope: writeConnection.endpointScope,
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
        appendPrivateKaigiShieldCredit({
          toriiUrl: input.toriiUrl,
          accountId,
          amount: normalizedAmount,
          assetDefinitionId: resolvedAssetId,
          endpointScope: writeConnection.endpointScope,
        });
        return transactionSubmissionResult(finalizedSubmission);
      }

      let materials = await resolveConfidentialTransferMaterials({
        toriiUrl: input.toriiUrl,
        chainId,
        networkPrefix,
        accountId,
        privateKeyHex,
        assetDefinitionId: resolvedAssetId,
        endpointScope: writeConnection.endpointScope,
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
            networkPrefix,
            accountId,
            privateKeyHex,
            assetDefinitionId: resolvedAssetId,
            endpointScope: writeConnection.endpointScope,
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
      const tx = await quoteAndSignInstructionTransaction({
        toriiUrl: input.toriiUrl,
        chainId,
        networkPrefix,
        authority: accountId,
        instructions: [
          buildZkTransferInstruction({
            assetDefinitionId: materials.resolvedAssetId,
            inputs: proofEnvelope.nullifiers,
            outputs: proofEnvelope.outputCommitments,
            proof: {
              backend: transferVerifyingKeyContext.backend,
              proof: Buffer.from(proofEnvelope.proof),
              verifyingKeyRef: transferVerifyingKeyContext.proofVerifyingKey.id,
            },
            rootHint: Buffer.from(selectedRootHintHex, "hex"),
          }),
        ],
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
        endpointScope: writeConnection.endpointScope,
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
          endpointScope: writeConnection.endpointScope,
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

    if (!destinationAccountId) {
      throw new Error("destinationAccountId is required.");
    }
    const configuredAssetDefinitionId = assetDefinitionId;
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
    const sourceAssetHoldingId = buildSourceAssetHoldingId(
      configuredAssetDefinitionId,
    );
    if (!sourceAssetHoldingId) {
      throw new Error(
        `Unable to build the source holding for canonical asset definition "${configuredAssetDefinitionId}".`,
      );
    }

    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl: input.toriiUrl,
      chainId,
      networkPrefix,
      authority: accountId,
      instructions: [
        buildTransferAssetInstruction({
          sourceAssetHoldingId,
          quantity: input.quantity,
          destinationAccountId,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(input.metadata, input.toriiUrl),
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      input.toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  setIrohaConnectContext(input) {
    irohaConnectBoundary.setContext(input);
  },
  resetIrohaConnectBoundary() {
    irohaConnectBoundary.reset();
  },
  prepareIrohaConnectSession(input) {
    return irohaConnectBoundary.prepareSession(input);
  },
  approveIrohaConnectSession(input) {
    return irohaConnectBoundary.approveSession(input);
  },
  processIrohaConnectFrame(input) {
    return irohaConnectBoundary.processFrame(input);
  },
  approveIrohaConnectRequest(input) {
    return irohaConnectBoundary.approveRequest(input);
  },
  rejectIrohaConnectRequest(input) {
    return irohaConnectBoundary.rejectRequest(input);
  },
  closeIrohaConnectSession({ sessionToken }) {
    irohaConnectBoundary.closeSession(sessionToken);
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
    networkPrefix,
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
      networkPrefix,
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
    networkPrefix,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  scanConfidentialWallet({
    toriiUrl,
    chainId,
    networkPrefix,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  getConfidentialWalletState({
    toriiUrl,
    chainId,
    networkPrefix,
    accountId,
    privateKeyHex,
    assetDefinitionId,
  }) {
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      privateKeyHex,
      assetDefinitionId,
    });
  },
  async getPrivateKaigiConfidentialXorState({
    toriiUrl,
    chainId,
    networkPrefix,
    accountId,
    assetDefinitionId,
  }) {
    return (
      await resolvePrivateKaigiConfidentialXorContext({
        toriiUrl,
        chainId,
        networkPrefix,
        accountId,
        assetDefinitionId,
      })
    ).state;
  },
  async selfShieldPrivateKaigiXor({
    toriiUrl,
    chainId,
    networkPrefix,
    accountId,
    assetDefinitionId,
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
      networkPrefix,
      assetDefinitionId:
        normalizeFirstReleaseAssetDefinitionId(assetDefinitionId),
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
    return client.listAccountTransactions(normalizedAccountId, {
      limit,
      offset,
      ...(canonicalAuth ? { canonicalAuth } : {}),
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
  getGovernanceCapabilities({ toriiUrl }) {
    return fetchGovernanceCapabilities(toriiUrl);
  },
  getGovernanceCitizenStatus({ toriiUrl, accountId, networkPrefix }) {
    return fetchGovernanceCitizenStatus(toriiUrl, accountId, networkPrefix);
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
    return client.getGovernanceUnlockStats().then((payload) => {
      if (!payload) {
        throw new Error(
          "Governance unlock stats endpoint returned no payload.",
        );
      }
      return normalizeGovernanceUnlockStatsPayload(payload);
    });
  },
  getGovernanceCouncilCurrent(config) {
    return fetchGovernanceCouncilCurrent(config.toriiUrl);
  },
  listGovernanceProposals(input) {
    return fetchGovernanceProposalList(input);
  },
  getGovernanceProposalDetail(input) {
    return fetchGovernanceProposalDetail(input);
  },
  getGovernanceCurrentValidationFeePolicy(input) {
    return fetchGovernanceValidationFeePolicy(input);
  },
  getGovernancePlainReferendumContract(input) {
    return fetchGovernancePlainReferendumContract(input);
  },
  prepareGovernanceCitizenRegistration(input) {
    return prepareGovernanceCitizenRegistrationAction(input);
  },
  prepareGovernanceProposal(input) {
    return prepareGovernanceProposalAction(input);
  },
  prepareGovernancePlainBallot(input) {
    return prepareGovernancePlainBallotAction(input);
  },
  prepareGovernanceParliamentBallot(input) {
    return prepareGovernanceParliamentBallotAction(input);
  },
  prepareGovernanceEnact(input) {
    return prepareGovernanceEnactAction(input);
  },
  confirmGovernanceAction(input) {
    return confirmPreparedGovernanceAction(input);
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
      lifecycleResult,
      supplyResult,
      econometricsResult,
    ] = await Promise.allSettled([
      withNetworkStatsTimeout("Explorer metrics", (signal) =>
        client.getExplorerMetrics({ signal }),
      ),
      withNetworkStatsTimeout("Runtime status telemetry", (signal) =>
        fetchRuntimeStatusSnapshot(client, toriiUrl, signal),
      ),
      withNetworkStatsTimeout(
        "Sumeragi consensus telemetry",
        async (signal) => {
          const payload = await fetchJson(
            buildNexusEndpoint(toriiUrl, "/v1/sumeragi/status"),
            "Sumeragi status",
            undefined,
            signal,
          );
          normalizeCurrentSumeragiTelemetry(payload);
          return payload;
        },
      ),
      withNetworkStatsTimeout("Nexus lifecycle telemetry", (signal) =>
        fetchNexusLifecycle(toriiUrl, signal),
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
      warnings.push("Sumeragi consensus telemetry is unavailable.");
    }

    const nexusLifecycle =
      lifecycleResult.status === "fulfilled" ? lifecycleResult.value : null;
    if (lifecycleResult.status === "rejected") {
      warnings.push("Nexus lifecycle telemetry is unavailable.");
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
      governance: extractGovernanceStats(sumeragiStatus, nexusLifecycle),
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
      const response = await fetchGetResponse(endpoint, "Explorer account QR");
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          detail ||
            `Explorer QR request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return assertExplorerAccountQrMatchesRequestedAccount(
        payload,
        normalizedAccountId,
      );
    };

    try {
      const payload = await client.getExplorerAccountQr(normalizedAccountId);
      return assertExplorerAccountQrMatchesRequestedAccount(
        payload as unknown as Record<string, unknown>,
        normalizedAccountId,
      );
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
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
      feature: "vpnSessions",
    });
    const accountId = normalizeCompatAccountIdLiteral(
      input.accountId,
      "accountId",
      writeConnection.networkPrefix,
    );
    return await runVpnConnectAfterProfileCheck({
      loadProfile: () =>
        ipcRenderer.invoke("vpn:getProfile", {
          toriiUrl: input.toriiUrl,
        }),
      resolveSigningMaterial: () =>
        resolveSigningMaterial({
          accountId,
          privateKeyHex: input.privateKeyHex,
          signingAlgorithm: input.signingAlgorithm,
          operationLabel: "VPN connect",
        }),
      invokeController: (signingMaterial) =>
        ipcRenderer.invoke("vpn:connect", {
          ...input,
          accountId,
          ...signingMaterial,
        }),
    });
  },
  async disconnectVpn(input) {
    if (!input) {
      return await ipcRenderer.invoke("vpn:disconnectLocal");
    }
    return await runVpnDisconnectWithLocalFallback({
      resolveAuthenticatedInput: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: input.toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          feature: "vpnSessions",
        });
        const accountId = normalizeCompatAccountIdLiteral(
          input.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const signingMaterial = await resolveSigningMaterial({
          accountId,
          privateKeyHex: input.privateKeyHex,
          signingAlgorithm: input.signingAlgorithm,
          operationLabel: "VPN disconnect",
        });
        return {
          ...input,
          accountId,
          ...signingMaterial,
        };
      },
      invokeAuthenticatedController: (authenticatedInput) =>
        ipcRenderer.invoke("vpn:disconnect", authenticatedInput),
      invokeLocalController: () => ipcRenderer.invoke("vpn:disconnectLocal"),
    });
  },
  async repairVpn() {
    return await runLocalVpnRepair({
      invokeController: () => ipcRenderer.invoke("vpn:repair"),
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
  getOfflineReadiness(input) {
    return getOfflineReadinessFromTorii(input);
  },
  async onboardAccount({
    toriiUrl,
    chainId,
    networkPrefix,
    alias,
    accountId,
    identity,
  }) {
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "accountOnboarding",
    });
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      writeConnection.networkPrefix,
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
    const payload = ensureObjectResponse(
      (await response.json()) as unknown,
      "Account onboarding",
    );
    const responseAccountId = normalizeCanonicalAccountIdLiteral(
      trimString(payload.account_id),
      "Account onboarding account_id",
      writeConnection.networkPrefix,
    );
    if (responseAccountId !== normalizedAccountId) {
      throw new Error(
        "Account onboarding response does not match the requested account.",
      );
    }
    const txHashHex = trimString(payload.tx_hash_hex);
    if (!/^[0-9a-f]{64}$/u.test(txHashHex)) {
      throw new Error(
        "Account onboarding did not return a canonical transaction hash for finality verification.",
      );
    }
    const finalized = await waitForTransactionFinalizedInBlock(
      baseUrl,
      txHashHex,
    );
    return {
      account_id: responseAccountId,
      tx_hash_hex: txHashHex,
      status: "FINALIZED",
      finality: finalized.finality,
    };
  },
  async requestFaucetFunds(
    { toriiUrl, chainId, accountId, networkPrefix, requestId },
    onStatus,
  ) {
    const faucetConnection = await assertFaucetChallengeConnectionAvailable({
      toriiUrl,
      chainId,
      networkPrefix,
    });
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      faucetConnection.networkPrefix,
    );
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
      throwIfAborted(signal);
      await assertFaucetEndpointFinalizing(baseUrl, signal);
      const result = await requestFaucetFundsWithPuzzle({
        baseUrl,
        accountId: normalizedAccountId,
        chainId: faucetConnection.chainId,
        networkPrefix: faucetConnection.networkPrefix,
        fetchImpl: nodeFetch,
        signal,
        onStatus,
      });
      throwIfAborted(signal);
      const txHashHex = trimString(result.tx_hash_hex);

      try {
        await onStatus?.({
          phase: "waitingForFinality",
          attempt: 1,
          attempts: 1,
          txHashHex,
        });
      } catch {
        // Renderer-side status hooks must not break the faucet request itself.
      }

      const finalized = await waitForTransactionFinalizedInBlock(
        baseUrl,
        txHashHex,
        {
          timeoutMs: FAUCET_CLAIM_STATUS_TIMEOUT_MS,
          signal,
        },
      );
      throwIfAborted(signal);
      try {
        await onStatus?.({
          phase: "claimFinalized",
          attempt: 1,
          attempts: 1,
          txHashHex,
        });
      } catch {
        // Renderer-side status hooks must not break the faucet request itself.
      }
      return {
        ...result,
        status: "FINALIZED",
        finality: finalized.finality,
        ...(finalized.fee ? { fee: finalized.fee } : {}),
      };
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
    networkPrefix,
    assetDefinitionId,
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
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCompatAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
      writeConnection.networkPrefix,
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const normalizedScheduledStartMs = normalizeTimestampMs(
      scheduledStartMs,
      "scheduledStartMs",
    );
    const createdAtMs = Date.now();
    const expiresAtMs = normalizedScheduledStartMs + 24 * 60 * 60 * 1000;
    const resolvedPrivacyMode = normalizeKaigiMeetingPrivacy(privacyMode);
    const privateKaigiAssetDefinitionId =
      resolvedPrivacyMode === "private"
        ? normalizeFirstReleaseAssetDefinitionId(assetDefinitionId)
        : null;
    const resolvedPeerIdentityReveal =
      normalizeKaigiPeerIdentityReveal(peerIdentityReveal);
    const normalizedHostParticipantId =
      normalizeKaigiParticipantId(hostParticipantId);
    const inviteSecret = requireKaigiInviteSecretBase64Url(
      inviteSecretBase64Url,
      "inviteSecretBase64Url",
    );
    const resolvedRelayManifest = await discoverKaigiRelayManifest(
      getClient(toriiUrl),
      expiresAtMs,
    );
    const privateKaigiContext = privateKaigiAssetDefinitionId
      ? await resolvePrivateKaigiConfidentialXorContext(
          {
            toriiUrl,
            chainId,
            networkPrefix: writeConnection.networkPrefix,
            accountId: authority,
            assetDefinitionId: privateKaigiAssetDefinitionId,
            endpointScope: writeConnection.endpointScope,
          },
          { includeFeeMaterials: true },
        )
      : null;
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
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting creation",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
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

    if (
      resolvedPrivacyMode === "private" &&
      hostCreateProof &&
      privateKaigiAssetDefinitionId &&
      privateKaigiContext
    ) {
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        chainId,
        context: privateKaigiContext,
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
              relay_manifest: {
                expiry_ms: resolvedRelayManifest.expiryMs,
                hops: resolvedRelayManifest.hops.map((hop) => ({
                  relay_id: hop.relayId,
                  hpke_public_key: hop.hpkePublicKey,
                  weight: hop.weight,
                })),
              },
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
      const submission =
        await submitTransactionEntrypointAndWaitForFinalizedBlock(
          toriiUrl,
          entrypoint.transactionEntrypoint,
          entrypoint.hashHex,
        );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
        endpointScope: writeConnection.endpointScope,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildCreateKaigiInstruction({
          id: normalizedCallId,
          host: authority,
          title: title?.trim() || null,
          scheduledStartMs: normalizedScheduledStartMs,
          privacyMode: "Transparent",
          roomPolicy: "authenticated",
          relayManifest: resolvedRelayManifest,
          metadata: callMetadata,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
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
    networkPrefix,
    assetDefinitionId,
    participantAccountId,
    privateKeyHex,
    callId,
    inviteSecretBase64Url,
    participantId,
    participantName,
    answerDescription,
  }) {
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCompatAccountIdLiteral(
      participantAccountId,
      "participantAccountId",
      writeConnection.networkPrefix,
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const inviteSecret = requireKaigiInviteSecretBase64Url(
      inviteSecretBase64Url,
      "inviteSecretBase64Url",
    );
    const normalizedParticipantId = normalizeKaigiParticipantId(participantId);
    const normalizedParticipantName = String(participantName ?? "").trim();
    if (!normalizedParticipantName) {
      throw new Error("participantName is required.");
    }
    const normalizedAnswerDescription =
      normalizeKaigiAnswerDescription(answerDescription);
    const liveMeeting = await fetchKaigiMeetingView({
      toriiUrl,
      callId: normalizedCallId,
      inviteSecretBase64Url: inviteSecret,
    });
    if (liveMeeting.callId !== normalizedCallId) {
      throw new Error(
        "The live Kaigi meeting does not match the requested call.",
      );
    }
    if (
      !liveMeeting.live ||
      liveMeeting.ended ||
      liveMeeting.expiresAtMs <= Date.now()
    ) {
      throw new Error("The live Kaigi meeting is no longer joinable.");
    }
    const resolvedPrivacyMode = liveMeeting.privacyMode;
    const revealWalletIdentity =
      resolvedPrivacyMode === "transparent" ||
      liveMeeting.peerIdentityReveal === "RevealAfterJoin";
    const liveHostAccountId = liveMeeting.hostAccountId
      ? normalizeCompatAccountIdLiteral(
          liveMeeting.hostAccountId,
          "liveMeeting.hostAccountId",
          writeConnection.networkPrefix,
        )
      : null;
    if (resolvedPrivacyMode === "transparent" && !liveHostAccountId) {
      throw new Error(
        "The live transparent Kaigi meeting is missing its host account.",
      );
    }
    const privateKaigiAssetDefinitionId =
      resolvedPrivacyMode === "private"
        ? normalizeFirstReleaseAssetDefinitionId(assetDefinitionId)
        : null;
    const privateKaigiContext = privateKaigiAssetDefinitionId
      ? await resolvePrivateKaigiConfidentialXorContext(
          {
            toriiUrl,
            chainId,
            networkPrefix: writeConnection.networkPrefix,
            accountId: authority,
            assetDefinitionId: privateKaigiAssetDefinitionId,
            endpointScope: writeConnection.endpointScope,
          },
          { includeFeeMaterials: true },
        )
      : null;
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting join",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const createdAtMs = Date.now();
    const answerPayload: KaigiChainAnswerPayload = {
      schema: KAIGI_CHAIN_ANSWER_SCHEMA,
      callId: normalizedCallId,
      kind: "answer",
      ...(revealWalletIdentity ? { participantAccountId: authority } : {}),
      participantId: normalizedParticipantId,
      participantName: normalizedParticipantName,
      ...(revealWalletIdentity ? { walletIdentity: authority } : {}),
      roomId: normalizedCallId,
      createdAtMs,
      description: normalizedAnswerDescription,
    };
    const metadata: Record<string, unknown> = {
      kaigi_signal: {
        schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
        callId: answerPayload.callId,
        signalKind: "answer",
        ...(resolvedPrivacyMode === "transparent" && liveHostAccountId
          ? { hostAccountId: liveHostAccountId }
          : {}),
        ...(revealWalletIdentity ? { participantAccountId: authority } : {}),
        createdAtMs,
        encryptedSignal: encryptKaigiPayload(
          answerPayload,
          liveMeeting.hostKaigiPublicKeyBase64Url,
        ),
      } satisfies KaigiChainSignalMetadata,
    };
    if (
      resolvedPrivacyMode === "private" &&
      privateKaigiAssetDefinitionId &&
      privateKaigiContext
    ) {
      const joinProof = buildKaigiRosterJoinProof({
        seed: deriveKaigiRosterJoinSeed({
          callId: normalizedCallId,
          participantAccountId: authority,
          privateKeyHex: resolvedPrivateKeyHex,
        }),
        rosterRootHex: normalizeKaigiRosterRootHex(
          liveMeeting.rosterRootHex,
          "liveMeeting.rosterRootHex",
        ),
      });
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        chainId,
        context: privateKaigiContext,
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
      const submission =
        await submitTransactionEntrypointAndWaitForFinalizedBlock(
          toriiUrl,
          entrypoint.transactionEntrypoint,
          entrypoint.hashHex,
        );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
        endpointScope: writeConnection.endpointScope,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildJoinKaigiInstruction({
          callId: answerPayload.callId,
          participant: authority,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(metadata, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
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
      let terminalEventSeen = false;
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
          terminalEventSeen = normalizedEvent.kind === "ended";
          await onEvent(normalizedEvent);
        }
      } catch (_error) {
        // The renderer receives stream_closed below and can reconnect.
      } finally {
        if (!controller.signal.aborted && !terminalEventSeen) {
          try {
            await onEvent({
              kind: "stream_closed",
              callId: normalizedCallId,
            });
          } catch {
            // Renderer teardown can race with the final stream notification.
          }
        }
        if (kaigiCallWatchers.get(subscriptionId) === controller) {
          kaigiCallWatchers.delete(subscriptionId);
        }
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
    networkPrefix,
    assetDefinitionId,
    hostAccountId,
    privateKeyHex,
    callId,
    endedAtMs,
  }) {
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCompatAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
      writeConnection.networkPrefix,
    );
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
    const privateKaigiAssetDefinitionId =
      resolvedPrivacyMode === "private"
        ? normalizeFirstReleaseAssetDefinitionId(assetDefinitionId)
        : null;
    const privateKaigiContext = privateKaigiAssetDefinitionId
      ? await resolvePrivateKaigiConfidentialXorContext(
          {
            toriiUrl,
            chainId,
            networkPrefix: writeConnection.networkPrefix,
            accountId: authority,
            assetDefinitionId: privateKaigiAssetDefinitionId,
            endpointScope: writeConnection.endpointScope,
          },
          { includeFeeMaterials: true },
        )
      : null;
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      privateKeyHex,
      operationLabel: "Kaigi meeting end",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
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

    if (
      resolvedPrivacyMode === "private" &&
      hostEndProof &&
      privateKaigiAssetDefinitionId &&
      privateKaigiContext
    ) {
      const entrypoint = await buildFundedPrivateKaigiEntrypoint({
        chainId,
        context: privateKaigiContext,
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
      const submission =
        await submitTransactionEntrypointAndWaitForFinalizedBlock(
          toriiUrl,
          entrypoint.transactionEntrypoint,
          entrypoint.hashHex,
        );
      appendPrivateKaigiFeeDebit({
        toriiUrl,
        accountId: authority,
        amount: entrypoint.feeAmount,
        assetDefinitionId: entrypoint.resolvedAssetId,
        endpointScope: writeConnection.endpointScope,
      });
      return transactionSubmissionResult(submission);
    }

    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildEndKaigiInstruction({
          callId: normalizedCallId,
          endedAtMs: resolvedEndedAtMs,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      toriiUrl,
      tx.signedTransaction,
    );
    return transactionSubmissionResult(submission);
  },
  getSumeragiStatus(config) {
    return fetchJson(
      buildNexusEndpoint(config.toriiUrl, "/v1/sumeragi/status"),
      "Sumeragi status",
    );
  },
  async getNexusLifecycle(config) {
    return fetchNexusLifecycle(config.toriiUrl);
  },
  async getNexusPublicLaneValidators({ toriiUrl, laneId }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/validators`,
    );
    const payload = await fetchJson(endpoint, "Public lane validators");
    return normalizePublicLaneValidatorsPayload(payload);
  },
  async getNexusPublicLaneStake({ toriiUrl, laneId, validator }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/stake`,
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
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/rewards/pending`,
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
    try {
      const payload = await client.getConfiguration();
      const configuration = ensureObjectResponse(payload, "Configuration");
      return {
        unbondingDelayMs: readNexusUnbondingDelayMs(configuration),
      };
    } catch {
      return { unbondingDelayMs: null };
    }
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
      input,
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
  reconcileSubscriptionMutation(input) {
    return reconcileSubscriptionMutationOnTorii(input);
  },
  getSoraCloudStatus(input) {
    return getSoraCloudStatusFromTorii(input);
  },
  deploySoraCloudHf(input) {
    return deploySoraCloudHfOnTorii(input);
  },
  reconcileSoraCloudHfLaunch(input) {
    return reconcileSoraCloudHfLaunchOnTorii(input);
  },
  getSoraCloudHfStatus(input) {
    return getSoraCloudHfStatusFromTorii(input);
  },
  getParameters({ toriiUrl }) {
    return getParametersFromTorii({ toriiUrl });
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
  bondPublicLaneStake({
    toriiUrl,
    chainId,
    networkPrefix,
    stakeAccountId,
    validator,
    amount,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        BondPublicLaneStake: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
          amount: normalizeAmount(amount, "amount"),
        },
      },
    });
  },
  registerPublicLaneValidator({
    toriiUrl,
    chainId,
    networkPrefix,
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
      networkPrefix,
    );
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId || validatorAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
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
    networkPrefix,
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
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        SchedulePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
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
    networkPrefix,
    stakeAccountId,
    validator,
    requestId,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        FinalizePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
          request_id: normalizeRequestId(requestId),
        },
      },
    });
  },
  claimPublicLaneRewards({
    toriiUrl,
    chainId,
    networkPrefix,
    stakeAccountId,
    validator,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        ClaimPublicLaneRewards: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCompatAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
        },
      },
    });
  },
};

contextBridge.exposeInMainWorld("iroha", api);

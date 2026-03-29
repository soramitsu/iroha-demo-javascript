import { contextBridge } from "electron";
import { randomBytes } from "crypto";
import {
  ToriiClient,
  buildCreateKaigiTransaction,
  buildEndKaigiTransaction,
  buildJoinKaigiTransaction,
  buildShieldTransaction,
  buildTransaction,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAssetId,
  type KaigiCallView,
  type ToriiSumeragiStatus,
} from "@iroha/iroha-js";
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
import { nodeFetch } from "./nodeFetch";
import {
  requestFaucetFundsWithPuzzle,
  type AccountFaucetResponse,
  type FaucetRequestProgress,
} from "./faucetApi";
import { bootstrapPortableConnectPreviewSession } from "./connectPreview";
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

type HexString = string;

type ToriiConfig = {
  toriiUrl: string;
};

type HealthResponse = Awaited<ReturnType<ToriiClient["getHealth"]>>;
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  domainId: string;
  metadata?: Record<string, unknown>;
  authorityAccountId: string;
  authorityPrivateKeyHex: HexString;
};

type TransferAssetInput = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  accountId: string;
  destinationAccountId: string;
  quantity: string;
  privateKeyHex: HexString;
  metadata?: Record<string, unknown>;
  shielded?: boolean;
};

type ExplorerMetricsResponse = Awaited<
  ReturnType<ToriiClient["getExplorerMetrics"]>
>;

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
  privateKeyHex: HexString;
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
  privateKeyHex: HexString;
  callId: string;
  hostAccountId: string;
  hostKaigiPublicKeyBase64Url: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
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
  privateKeyHex: HexString;
  callId: string;
  endedAtMs?: number;
};

type KaigiMeetingSignalRecord = {
  entrypointHash: string;
  authority: string;
  timestampMs?: number;
  callId: string;
  participantAccountId: string;
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
  offerDescription: KaigiOfferDescription;
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

type KaigiCallEventCallback = (
  event: KaigiCallEvent,
) => void | Promise<void>;

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
  privateKeyHex: HexString;
};

type SchedulePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  amount: string;
  requestId: string;
  releaseAtMs: number;
  privateKeyHex: HexString;
};

type FinalizePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  requestId: string;
  privateKeyHex: HexString;
};

type ClaimPublicLaneRewardsInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  privateKeyHex: HexString;
};

type AccountPermissionsInput = {
  toriiUrl: string;
  accountId: string;
  limit?: number;
  offset?: number;
};

type RegisterCitizenInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  amount: string;
  privateKeyHex: HexString;
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
  privateKeyHex: HexString;
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
  registerAccount(input: RegisterAccountInput): Promise<{ hash: string }>;
  transferAsset(input: TransferAssetInput): Promise<{ hash: string }>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
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
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
  }): Promise<ExplorerAccountQrResponse>;
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
  requestFaucetFunds(input: {
    toriiUrl: string;
    accountId: string;
  }, onStatus?: FaucetStatusCallback): Promise<AccountFaucetResponse>;
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

const KAIGI_CHAIN_SIGNAL_SCHEMA = "iroha-demo-kaigi-chain-signal/v1";
const KAIGI_CHAIN_ANSWER_SCHEMA = "iroha-demo-kaigi-answer/v1";
const KAIGI_CALL_METADATA_SCHEMA = "iroha-demo-kaigi-call-metadata/v2";
const KAIGI_CALL_OFFER_SCHEMA = "iroha-demo-kaigi-offer/v2";

type KaigiChainAnswerPayload = {
  schema: typeof KAIGI_CHAIN_ANSWER_SCHEMA;
  callId: string;
  kind: "answer";
  participantAccountId: string;
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
  hostAccountId: string;
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
  hostAccountId: string;
  participantAccountId: string;
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
    throw new Error(`${label} must be in domain:meeting format.`);
  }
  return callId;
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

const normalizeKaigiAnswerDescription = (
  value: {
    type?: string;
    sdp?: string;
  },
) => {
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

const normalizeKaigiOfferDescription = (
  value: {
    type?: string;
    sdp?: string;
  },
) => {
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

const normalizeKaigiMeetingPrivacy = (
  value: unknown,
): KaigiMeetingPrivacy => {
  const normalized = String(value ?? "private").trim().toLowerCase();
  if (normalized === "transparent") {
    return "transparent";
  }
  return "private";
};

const normalizeKaigiPeerIdentityReveal = (
  value: unknown,
): KaigiPeerIdentityReveal => {
  const normalized = String(value ?? "Hidden").trim().toLowerCase();
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

const parseJsonRecord = (
  value: unknown,
): Record<string, unknown> | null => {
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
  const kind = String(record.kind ?? "").trim().toLowerCase();
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
  const hostAccountId = normalizeCompatAccountIdLiteral(
    String(signalRecord.hostAccountId ?? signalRecord.host_account_id ?? ""),
    "kaigi signal metadata.hostAccountId",
  );
  const participantAccountId = normalizeCompatAccountIdLiteral(
    String(
      signalRecord.participantAccountId ??
        signalRecord.participant_account_id ??
        "",
    ),
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
    hostAccountId,
    participantAccountId,
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
  const participantAccountId = normalizeCompatAccountIdLiteral(
    String(record.participantAccountId ?? record.participant_account_id ?? ""),
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
    participantAccountId,
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
    meetingCode: callMetadata.meetingCode || normalizeKaigiMeetingCode(null, callId),
    ...(String(callPayload.title ?? "").trim()
      ? { title: String(callPayload.title).trim() }
      : {}),
    hostAccountId: offerPayload.hostAccountId,
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
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail ||
        `${label} request failed with status ${response.status} (${response.statusText})`,
    );
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
        return Number(right.bandwidth_class ?? 0) - Number(left.bandwidth_class ?? 0);
      })
      .slice(0, 2);
    if (candidates.length === 0) {
      return null;
    }
    const details = await Promise.all(
      candidates.map((candidate) => client.getKaigiRelay(candidate.relay_id)),
    );
    const hops = details
      .filter((detail): detail is Exclude<(typeof details)[number], null> => detail !== null)
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

const fetchConfidentialAssetPolicy = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
): Promise<ConfidentialAssetPolicyView> => {
  const normalizedAssetDefinitionId = assetDefinitionId.trim();
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

const submitInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authorityAccountId: string;
  privateKeyHex: string;
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
  const tx = buildTransaction({
    chainId,
    authority,
    instructions: [input.instruction],
    privateKey: hexToBuffer(input.privateKeyHex, "privateKeyHex"),
  });
  const submission = await submitSignedTransaction(
    getClient(input.toriiUrl),
    tx.signedTransaction,
    {
      waitForCommit: true,
    },
  );
  return { hash: submission.hash };
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
  deriveAccountAddress({ domain, publicKeyHex, networkPrefix }) {
    return deriveAccountAddressView({ domain, publicKeyHex, networkPrefix });
  },
  derivePublicKey(privateKeyHex) {
    const publicKey = publicKeyFromPrivate(
      hexToBuffer(privateKeyHex, "privateKeyHex"),
    );
    return { publicKeyHex: toHex(publicKey) };
  },
  async registerAccount(input) {
    const client = getClient(input.toriiUrl);
    const domainId = input.domainId.trim();
    if (!domainId) {
      throw new Error("domainId is required.");
    }
    const tx = buildRegisterAccountAndTransferTransaction({
      chainId: input.chainId,
      authority: normalizeCompatAccountIdLiteral(
        input.authorityAccountId,
        "authorityAccountId",
      ),
      account: {
        accountId: normalizeCompatAccountIdLiteral(
          input.accountId,
          "accountId",
        ),
        domainId,
        metadata: input.metadata ?? {},
      },
      privateKey: hexToBuffer(
        input.authorityPrivateKeyHex,
        "authorityPrivateKeyHex",
      ),
    });
    const submission = await submitSignedTransaction(
      client,
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
    );
    return { hash: submission.hash };
  },
  async transferAsset(input) {
    const accountId = normalizeCompatAccountIdLiteral(
      input.accountId,
      "accountId",
    );
    const destinationAccountId = normalizeCompatAccountIdLiteral(
      input.destinationAccountId,
      "destinationAccountId",
    );

    if (input.shielded) {
      const policy = await fetchConfidentialAssetPolicy(
        input.toriiUrl,
        input.assetDefinitionId,
      );
      const effectiveMode = policy.effective_mode || policy.current_mode;
      if (!confidentialModeSupportsShield(effectiveMode)) {
        throw new Error(
          `Shielded transfer is unavailable for ${policy.asset_id}; effective mode is ${effectiveMode}.`,
        );
      }
      if (destinationAccountId !== accountId) {
        throw new Error(
          "Shielding currently supports only your own account. Set destination to the sender account.",
        );
      }
      const normalizedAmount = String(input.quantity).trim();
      if (!isPositiveWholeAmount(normalizedAmount)) {
        throw new Error(
          "Shielded amount must be a whole number greater than zero (base units).",
        );
      }

      const tx = buildShieldTransaction({
        chainId: input.chainId,
        authority: accountId,
        shield: {
          assetDefinitionId: input.assetDefinitionId,
          fromAccountId: accountId,
          amount: normalizedAmount,
          noteCommitment: randomBytes(32),
          encryptedPayload: {
            version: 1,
            ephemeralPublicKey: randomBytes(32),
            nonce: randomBytes(24),
            ciphertext: Buffer.from(
              JSON.stringify({
                accountId,
                amount: normalizedAmount,
                memo: input.metadata ?? null,
                createdAtMs: Date.now(),
              }),
              "utf8",
            ),
          },
        },
        metadata: input.metadata ?? null,
        privateKey: hexToBuffer(input.privateKeyHex, "privateKeyHex"),
      });
      const submission = await submitSignedTransaction(
        getClient(input.toriiUrl),
        tx.signedTransaction,
        {
          waitForCommit: true,
        },
      );
      return { hash: submission.hash };
    }

    const client = getClient(input.toriiUrl);
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
          `Unable to resolve source asset ID from configured value "${configuredAssetId}". Set Asset Definition ID to a canonical encoded asset ID (norito:<hex>) for this account.${availableHint}`,
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
      metadata: input.metadata ?? null,
      privateKey: hexToBuffer(input.privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransaction(
      client,
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
    );
    return { hash: submission.hash };
  },
  getConfidentialAssetPolicy({ toriiUrl, assetDefinitionId }) {
    return fetchConfidentialAssetPolicy(toriiUrl, assetDefinitionId);
  },
  fetchAccountAssets({ toriiUrl, accountId, limit = 50, offset }) {
    const normalizedBaseUrl = `${normalizeBaseUrl(toriiUrl)}/`;
    const normalizedAccountId = encodeURIComponent(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
    );
    const endpoint = new URL(
      `v1/accounts/${normalizedAccountId}/assets`,
      normalizedBaseUrl,
    );
    endpoint.searchParams.set("limit", String(limit));
    if (offset !== undefined) {
      endpoint.searchParams.set("offset", String(offset));
    }
    return nodeFetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(
          detail ||
            `Account assets request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = (await response.json()) as unknown;
      return normalizeAccountAssetListPayload(payload);
    });
  },
  fetchAccountTransactions({ toriiUrl, accountId, limit = 20, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountTransactions(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
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
  async requestFaucetFunds({ toriiUrl, accountId }, onStatus) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    return requestFaucetFundsWithPuzzle({
      baseUrl,
      accountId: normalizedAccountId,
      fetchImpl: nodeFetch,
      onStatus,
    });
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
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const normalizedScheduledStartMs = normalizeTimestampMs(
      scheduledStartMs,
      "scheduledStartMs",
    );
    const createdAtMs = Date.now();
    const expiresAtMs = normalizedScheduledStartMs + 24 * 60 * 60 * 1000;
    const resolvedPrivacyMode = normalizeKaigiMeetingPrivacy(privacyMode);
    const resolvedPeerIdentityReveal = normalizeKaigiPeerIdentityReveal(
      peerIdentityReveal,
    );
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
        hostAccountId: authority,
        hostDisplayName: String(hostDisplayName ?? "").trim() || "Host",
        hostParticipantId: normalizeKaigiParticipantId(hostParticipantId),
        hostKaigiPublicKeyBase64Url: normalizeBase64UrlString(
          hostKaigiPublicKeyBase64Url,
          "hostKaigiPublicKeyBase64Url",
        ),
        createdAtMs,
        description: normalizeKaigiOfferDescription(offerDescription),
      } satisfies KaigiCallOfferPayload,
      inviteSecret,
    );
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
        metadata: {
          kaigi_call: {
            schema: KAIGI_CALL_METADATA_SCHEMA,
            meetingCode: String(meetingCode ?? "").trim() || normalizeKaigiMeetingCode(null, normalizedCallId),
            expiresAtMs,
            live: true,
            privacyMode: resolvedPrivacyMode,
            peerIdentityReveal: resolvedPeerIdentityReveal,
            encryptedOffer,
          } satisfies KaigiCallMetadata,
        },
      },
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransaction(
      getClient(toriiUrl),
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
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
    answerDescription,
  }) {
    const authority = normalizeCompatAccountIdLiteral(
      participantAccountId,
      "participantAccountId",
    );
    const createdAtMs = Date.now();
    const answerPayload: KaigiChainAnswerPayload = {
      schema: KAIGI_CHAIN_ANSWER_SCHEMA,
      callId: normalizeKaigiCallId(callId, "callId"),
      kind: "answer",
      participantAccountId: authority,
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
        hostAccountId: normalizeCompatAccountIdLiteral(
          hostAccountId,
          "hostAccountId",
        ),
        participantAccountId: authority,
        createdAtMs,
        encryptedSignal: encryptKaigiPayload(
          answerPayload,
          hostKaigiPublicKeyBase64Url,
        ),
      } satisfies KaigiChainSignalMetadata,
    };
    const tx = buildJoinKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      join: {
        callId: answerPayload.callId,
        participant: authority,
      },
      metadata,
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransaction(
      getClient(toriiUrl),
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
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
        for await (const event of client.streamKaigiCallEvents(normalizedCallId, {
          signal: controller.signal,
        })) {
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
    const signalsResponse = await client.listKaigiCallSignals(normalizedCallId, {
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
    });
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
            decryptKaigiPayload(
              chainSignal.encryptedSignal,
              hostKaigiKeys,
            ),
          );
          const entrypointHash = String(record.entrypoint_hash ?? "").trim();
          if (!entrypointHash) {
            return [];
          }
          const authority = normalizeCompatAccountIdLiteral(
            String(record.authority ?? decrypted.participantAccountId),
            "transaction.authority",
          );
          const timestampMs = Number(record.timestamp_ms);
          return [
            {
              entrypointHash,
              authority,
              ...(Number.isFinite(timestampMs) && timestampMs > 0
                ? { timestampMs }
                : {}),
              callId: decrypted.callId,
              participantAccountId: decrypted.participantAccountId,
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
    const tx = buildEndKaigiTransaction({
      chainId: chainId.trim(),
      authority,
      end: {
        callId: normalizeKaigiCallId(callId, "callId"),
        endedAtMs:
          endedAtMs === undefined
            ? Date.now()
            : normalizeTimestampMs(endedAtMs, "endedAtMs"),
      },
      privateKey: hexToBuffer(privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransaction(
      getClient(toriiUrl),
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
    );
    return { hash: submission.hash };
  },
  async createConnectPreview({ toriiUrl, chainId, node }) {
    const client = getClient(toriiUrl);
    const baseUrl = new URL(normalizeBaseUrl(toriiUrl));
    const nodeHint = node ?? baseUrl.host;
    const { preview, session, tokens } =
      await bootstrapPortableConnectPreviewSession(client, {
        chainId,
        node: nodeHint,
      });
    return {
      sidHex: toHex(Buffer.from(preview.sidBytes)),
      sidBase64Url: preview.sidBase64Url,
      walletUri: session?.wallet_uri ?? preview.walletUri ?? null,
      appUri: session?.app_uri ?? preview.appUri ?? null,
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

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

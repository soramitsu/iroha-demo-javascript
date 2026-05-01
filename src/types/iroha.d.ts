import type {
  ConfidentialWalletBackupMetadata,
  ConfidentialWalletBackupMetadataV2,
} from "@/utils/walletBackup";

export type ToriiHealth = ({ status: string } & Record<string, unknown>) | null;

export interface ChainMetadataResponse {
  chainId: string;
  networkPrefix: number;
}

export interface AccountAddressView {
  accountId: string;
  i105AccountId: string;
  i105DefaultAccountId: string;
  i105DefaultFullwidthAccountId?: string;
  publicKeyHex: string;
  accountIdWarning: string;
}

export interface AccountAliasResolutionResponse {
  alias: string;
  accountId: string;
  resolved: boolean;
  source?: string;
}

export interface AccountAssetItem {
  asset_id: string;
  quantity: string;
  asset_alias?: string | null;
  asset_name?: string | null;
  asset_definition_id?: string | null;
}

export interface AccountAssetsResponse {
  items: AccountAssetItem[];
  total: number;
}

export interface AccountTransactionsResponse {
  items: Array<AccountTransactionItem>;
  total: number;
}

export interface AccountTransactionItem {
  entrypoint_hash: string;
  result_ok: boolean;
  authority?: string;
  timestamp_ms?: number;
  [key: string]: unknown;
}

export interface AccountPermissionItem {
  name: string;
  payload: Record<string, unknown> | null;
}

export interface AccountPermissionsResponse {
  items: AccountPermissionItem[];
  total: number;
}

export interface OfflineAllowanceItem {
  certificate_id_hex: string;
  controller_id: string;
  controller_display: string;
  asset_id: string;
  registered_at_ms: number;
  expires_at_ms: number;
  policy_expires_at_ms: number;
  refresh_at_ms: number | null;
  verdict_id_hex: string | null;
  attestation_nonce_hex: string | null;
  remaining_amount: string;
  deadline_kind?: string | null;
  deadline_state?: string | null;
  deadline_ms?: number | null;
  deadline_ms_remaining?: number | null;
  record: Record<string, unknown>;
  integrity_metadata: {
    policy: string;
    provisioned?: {
      inspector_public_key: string;
      manifest_schema: string;
      manifest_version: number | null;
      max_manifest_age_ms: number | null;
      manifest_digest_hex: string | null;
    };
  } | null;
}

export interface OfflineAllowanceResponse {
  items: OfflineAllowanceItem[];
  total: number;
}

export interface ExplorerMetricsResponse {
  peers: number;
  domains: number;
  accounts: number;
  assets: number;
  transactionsAccepted: number;
  transactionsRejected: number;
  blockHeight: number;
  blockCreatedAt: string | null;
  finalizedBlockHeight: number;
  averageCommitTimeMs: number | null;
  averageBlockTimeMs: number | null;
}

export interface ExplorerEconometricsTopHolder {
  accountId: string;
  balance: string;
}

export interface ExplorerEconometricsLorenzPoint {
  population: number;
  share: number;
}

export interface ExplorerDistributionSnapshot {
  gini: number;
  hhi: number;
  theil: number;
  entropy: number;
  entropyNormalized: number;
  nakamoto33: number;
  nakamoto51: number;
  nakamoto67: number;
  top1: number;
  top5: number;
  top10: number;
  median: string | null;
  p90: string | null;
  p99: string | null;
  lorenz: ExplorerEconometricsLorenzPoint[];
}

export interface ExplorerAssetDefinitionSnapshotResponse {
  definitionId: string;
  computedAtMs: number;
  holdersTotal: number;
  totalSupply: string;
  topHolders: ExplorerEconometricsTopHolder[];
  distribution: ExplorerDistributionSnapshot;
}

export interface ExplorerEconometricsVelocityWindow {
  key: string;
  startMs: number;
  endMs: number;
  transfers: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  amount: string;
}

export interface ExplorerEconometricsIssuanceWindow {
  key: string;
  startMs: number;
  endMs: number;
  mintCount: number;
  burnCount: number;
  minted: string;
  burned: string;
  net: string;
}

export interface ExplorerEconometricsIssuanceSeriesPoint {
  bucketStartMs: number;
  minted: string;
  burned: string;
  net: string;
}

export interface ExplorerAssetDefinitionEconometricsResponse {
  definitionId: string;
  computedAtMs: number;
  velocityWindows: ExplorerEconometricsVelocityWindow[];
  issuanceWindows: ExplorerEconometricsIssuanceWindow[];
  issuanceSeries: ExplorerEconometricsIssuanceSeriesPoint[];
}

export interface NetworkRuntimeStats {
  queueSize: number | null;
  queueCapacity: number | null;
  commitTimeMs: number | null;
  effectiveBlockTimeMs: number | null;
  txQueueSaturated: boolean | null;
  highestQcHeight: number | null;
  lockedQcHeight: number | null;
  currentBlockHeight: number | null;
  finalizedBlockHeight: number | null;
  finalizationLag: number | null;
}

export interface NetworkGovernanceStats {
  laneCount: number;
  dataspaceCount: number;
  validatorCount: number;
}

export interface NetworkStatsResponse {
  collectedAtMs: number;
  xorAssetDefinitionId: string;
  explorer: ExplorerMetricsResponse | null;
  supply: ExplorerAssetDefinitionSnapshotResponse | null;
  econometrics: ExplorerAssetDefinitionEconometricsResponse | null;
  runtime: NetworkRuntimeStats;
  governance: NetworkGovernanceStats;
  warnings: string[];
  partial: boolean;
}

export interface ExplorerAccountQrResponse {
  canonicalId: string;
  literal: string;
  networkPrefix: number;
  errorCorrection: string;
  modules: number;
  qrVersion: number;
  svg: string;
}

export interface ConfidentialPaymentAddress {
  schema: "iroha-confidential-payment-address/v3";
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
  shieldedOwnerTagHex: string;
  shieldedDiversifierHex: string;
  recoveryHint: "one-time-receive-key";
}

export type VpnExitClass = "standard" | "low-latency" | "high-security";
export type VpnReceiptSource = "torii" | "local-fallback";

export interface VpnAuthContext {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: string;
  networkPrefix?: number;
}

export interface VpnAvailability {
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
}

export interface VpnProfile {
  available: boolean;
  relayEndpoint: string;
  supportedExitClasses: VpnExitClass[];
  defaultExitClass: VpnExitClass;
  leaseSecs: number;
  dnsPushIntervalSecs: number;
  meterFamily: string;
  routePushes: string[];
  excludedRoutes: string[];
  dnsServers: string[];
  tunnelAddresses: string[];
  mtuBytes: number;
  displayBillingLabel: string;
}

export interface VpnReceipt {
  sessionId: string;
  accountId: string;
  exitClass: VpnExitClass;
  relayEndpoint: string;
  meterFamily: string;
  connectedAtMs: number;
  disconnectedAtMs: number;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  status: string;
  receiptSource: VpnReceiptSource;
}

export interface VpnStatus {
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
  exitClass: VpnExitClass | null;
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
  lastReceipt: VpnReceipt | null;
}

export interface AccountOnboardingResponse {
  account_id: string;
  tx_hash_hex: string;
  status: string;
}

export interface AccountFaucetResponse {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: string;
  fee?: TransactionFeeView | string | number | null;
}

export interface TransactionFeeView {
  amount?: string | number | null;
  quantity?: string | number | null;
  assetId?: string | null;
  asset_id?: string | null;
  asset?: string | null;
  feeAssetId?: string | null;
  fee_asset_id?: string | null;
  fee_amount?: string | number | null;
  feeAmount?: string | number | null;
  gas_asset_id?: string | null;
  gasAssetId?: string | null;
  source?: string | null;
  estimated?: boolean | null;
}

export interface TransactionSubmissionResult {
  hash: string;
  fee?: TransactionFeeView | string | number | null;
}

export interface ConfidentialAssetBalanceView {
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
}

export type FaucetRequestPhase =
  | "requestingPuzzle"
  | "waitingForPuzzleRetry"
  | "solvingPuzzle"
  | "submittingClaim"
  | "waitingForClaimRetry"
  | "claimAccepted"
  | "waitingForCommit"
  | "claimCommitted";

export interface FaucetRequestProgress {
  phase: FaucetRequestPhase;
  attempt?: number;
  attempts?: number;
  txHashHex?: string;
}

export interface ConnectPreview {
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
}

export interface UranaiPrivateTradeProof {
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
}

export interface KaigiSignalKeyPair {
  publicKeyBase64Url: string;
  privateKeyBase64Url: string;
}

export type KaigiMeetingPrivacy = "private" | "transparent";
export type KaigiPeerIdentityReveal = "Hidden" | "RevealAfterJoin";

export interface KaigiOfferDescription {
  type: "offer";
  sdp: string;
}

export interface KaigiAnswerDescription {
  type: "answer";
  sdp: string;
}

export interface KaigiMeetingView {
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
}

export interface PrivateKaigiConfidentialXorState {
  assetDefinitionId: string;
  resolvedAssetId: string;
  policyMode: string;
  shieldedBalance: string | null;
  shieldedBalanceExact: boolean;
  transparentBalance: string;
  canSelfShield: boolean;
  message?: string;
}

export interface KaigiMeetingSignalRecord {
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
}

export interface KaigiCallEvent {
  kind: "roster_updated" | "ended";
  callId: string;
  endedAtMs?: number;
}

export interface ConfidentialPolicyTransitionView {
  transition_id: string;
  previous_mode: string;
  new_mode: string;
  effective_height: number;
  conversion_window: number | null;
  window_open_height: number | null;
}

export interface ConfidentialAssetPolicyView {
  asset_id: string;
  block_height: number;
  current_mode: string;
  effective_mode: string;
  allow_shield: boolean | null;
  allow_unshield: boolean | null;
  vk_transfer: string | null;
  vk_unshield: string | null;
  vk_shield: string | null;
  vk_set_hash: string | null;
  poseidon_params_id: number | null;
  pedersen_params_id: number | null;
  pending_transition: ConfidentialPolicyTransitionView | null;
}

export interface NexusLaneGovernanceSnapshot {
  lane_id: number;
  alias: string;
  dataspace_id: number;
  validator_ids: string[];
  [key: string]: unknown;
}

export interface NexusDataspaceCommitmentSnapshot {
  lane_id: number;
  dataspace_id: number;
  [key: string]: unknown;
}

export interface NexusSumeragiStatus {
  lane_governance?: NexusLaneGovernanceSnapshot[];
  dataspace_commitments?: NexusDataspaceCommitmentSnapshot[];
  [key: string]: unknown;
}

export interface NexusStakingPolicy {
  unbondingDelayMs: number;
}

export interface PublicLaneValidatorStatusView {
  type: string;
  activates_at_epoch: number | null;
  reason: string | null;
  releases_at_ms: number | null;
  slash_id: string | null;
}

export interface PublicLaneValidatorRecordView {
  lane_id: number;
  validator: string;
  stake_account: string;
  total_stake: string;
  self_stake: string;
  status: PublicLaneValidatorStatusView;
  activation_epoch: number | null;
  activation_height: number | null;
  last_reward_epoch: number | null;
  metadata: Record<string, unknown>;
}

export interface PublicLaneValidatorsResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneValidatorRecordView[];
}

export interface PublicLaneUnbondingView {
  request_id: string;
  amount: string;
  release_at_ms: number;
}

export interface PublicLaneStakeShareView {
  lane_id: number;
  validator: string;
  staker: string;
  bonded: string;
  metadata: Record<string, unknown>;
  pending_unbonds: PublicLaneUnbondingView[];
}

export interface PublicLaneStakeResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneStakeShareView[];
}

export interface PublicLanePendingRewardView {
  lane_id: number;
  account: string;
  asset: string;
  last_claimed_epoch: number;
  pending_through_epoch: number;
  amount: string;
}

export interface PublicLaneRewardsResponseView {
  lane_id: number;
  total: number;
  items: PublicLanePendingRewardView[];
}

export type SubscriptionStatusView =
  | "active"
  | "paused"
  | "past_due"
  | "canceled"
  | "suspended";

export interface SubscriptionPlanListItemView {
  plan_id: string;
  plan: Record<string, unknown>;
}

export interface SubscriptionPlanListResponseView {
  items: SubscriptionPlanListItemView[];
  total: number;
}

export interface SubscriptionListItemView {
  subscription_id: string;
  subscription: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

export interface SubscriptionListResponseView {
  items: SubscriptionListItemView[];
  total: number;
}

export interface SubscriptionActionResponseView {
  ok: boolean;
  subscription_id: string;
  tx_hash_hex: string;
  fee?: TransactionFeeView | string | number | null;
  billing_trigger_id?: string;
  usage_trigger_id?: string | null;
  first_charge_ms?: number;
}

export type SoraCloudStorageClassView = "hot" | "warm" | "cold";

export interface SoraCloudServiceSummaryView {
  id: string;
  name: string;
  status: "healthy" | "deploying" | "warning" | "paused" | "failed" | "unknown";
  currentVersion: string;
  revisionCount: number;
  configEntryCount: number;
  secretEntryCount: number;
  routeHost: string | null;
  publicUrls: string[];
  rolloutStage: string | null;
  rolloutPercent: number | null;
  leaseStatus: string | null;
  leaseExpiresSequence: number | null;
  remainingRuntimeBalanceNanos: string | null;
  latestSequence: number | null;
  signedBy: string | null;
  raw: Record<string, unknown>;
}

export interface SoraCloudStatusResponseView {
  available: boolean;
  statusCode?: number;
  message?: string;
  schemaVersion: number | null;
  serviceCount: number;
  auditEventCount: number;
  services: SoraCloudServiceSummaryView[];
  recentAuditEvents: Record<string, unknown>[];
  raw: Record<string, unknown> | null;
}

export interface SoraCloudHfDeployResponseView {
  ok: boolean;
  action: string;
  service_name: string;
  sequence: number | null;
  current_version?: string | null;
  revision_count?: number | null;
  tx_hash_hex?: string | null;
  fee?: TransactionFeeView | string | number | null;
  rollout_handle?: string | null;
  rollout_stage?: string | null;
  rollout_percent?: number | null;
  raw: Record<string, unknown>;
}

export type GovernanceBallotDirection = "Aye" | "Nay" | "Abstain";

export interface GovernanceProposalResult {
  found: boolean;
  proposal: Record<string, unknown> | null;
}

export interface GovernanceReferendumResult {
  found: boolean;
  referendum: Record<string, unknown> | null;
}

export interface GovernanceTallyView {
  referendum_id: string;
  approve: number;
  reject: number;
  abstain: number;
}

export interface GovernanceTallyResult {
  found: boolean;
  referendum_id: string;
  tally: GovernanceTallyView | null;
}

export interface GovernanceLockRecord {
  owner: string;
  amount: number;
  expiry_height: number;
  direction: number;
  duration_blocks: number;
}

export interface GovernanceLocksResult {
  found: boolean;
  referendum_id: string;
  locks: Record<string, GovernanceLockRecord>;
}

export interface GovernanceCouncilMember {
  account_id: string;
}

export interface GovernanceCouncilCurrentResponse {
  epoch: number;
  members: GovernanceCouncilMember[];
  alternates: GovernanceCouncilMember[];
  candidate_count: number;
  verified: number;
  derived_by: string;
}

export interface GovernanceDraftInstruction {
  wire_id: string;
  payload_hex?: string | null;
}

export interface GovernanceDraftResponse {
  ok: boolean;
  proposal_id: string | null;
  tx_instructions: GovernanceDraftInstruction[];
  accepted?: boolean;
  reason?: string | null;
}

export interface IrohaBridge {
  ping(config: { toriiUrl: string }): Promise<ToriiHealth>;
  getChainMetadata(config: {
    toriiUrl: string;
  }): Promise<ChainMetadataResponse>;
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
  copyTextToClipboard(input: { text: string }): Promise<void>;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix?: number;
  }): AccountAddressView;
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string };
  deriveConfidentialOwnerTag(privateKeyHex: string): { ownerTagHex: string };
  deriveConfidentialReceiveAddress(privateKeyHex: string): {
    ownerTagHex: string;
    diversifierHex: string;
  };
  resolveAccountAlias(input: {
    toriiUrl: string;
    alias: string;
    networkPrefix?: number;
  }): Promise<AccountAliasResolutionResponse>;
  createConfidentialPaymentAddress(input: {
    accountId: string;
    privateKeyHex?: string;
  }): Promise<ConfidentialPaymentAddress>;
  exportConfidentialWalletBackup(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    mnemonic: string;
  }): Promise<ConfidentialWalletBackupMetadataV2>;
  importConfidentialWalletBackup(input: {
    toriiUrl: string;
    accountId: string;
    mnemonic: string;
    confidentialWallet: ConfidentialWalletBackupMetadata;
  }): Promise<void>;
  registerAccount(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    domainId: string;
    metadata?: Record<string, unknown>;
    authorityAccountId: string;
    authorityPrivateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  transferAsset(input: {
    toriiUrl: string;
    chainId: string;
    assetDefinitionId: string;
    accountId: string;
    destinationAccountId?: string;
    networkPrefix?: number;
    quantity: string;
    privateKeyHex?: string;
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
  }): Promise<TransactionSubmissionResult>;
  buildUranaiPrivateTradeProof(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    assetDefinitionId: string;
    collateralIn: string;
    privacyFee?: string;
    privateKeyHex?: string;
    marketId?: string;
    outcomeIndex?: number;
  }): Promise<UranaiPrivateTradeProof>;
  signIrohaConnectMessage(input: {
    accountId: string;
    signingMessageB64: string;
  }): Promise<{ publicKeyHex: string; signatureB64: string }>;
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
  }): Promise<ConfidentialAssetBalanceView>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
    force?: boolean;
  }): Promise<ConfidentialAssetBalanceView>;
  getConfidentialWalletState(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceView>;
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
  }): Promise<TransactionSubmissionResult>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    limit?: number;
    offset?: number;
  }): Promise<AccountAssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    privateKeyHex?: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountTransactionsResponse>;
  listAccountPermissions(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountPermissionsResponse>;
  registerCitizen(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    amount: string;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  getGovernanceProposal(input: {
    toriiUrl: string;
    proposalId: string;
  }): Promise<GovernanceProposalResult>;
  getGovernanceReferendum(input: {
    toriiUrl: string;
    referendumId: string;
  }): Promise<GovernanceReferendumResult>;
  getGovernanceTally(input: {
    toriiUrl: string;
    referendumId: string;
  }): Promise<GovernanceTallyResult>;
  getGovernanceLocks(input: {
    toriiUrl: string;
    referendumId: string;
  }): Promise<GovernanceLocksResult>;
  getGovernanceCouncilCurrent(input: {
    toriiUrl: string;
  }): Promise<GovernanceCouncilCurrentResponse>;
  submitGovernancePlainBallot(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    referendumId: string;
    amount: string;
    durationBlocks: number;
    direction: GovernanceBallotDirection;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  finalizeGovernanceReferendum(input: {
    toriiUrl: string;
    referendumId: string;
    proposalId: string;
  }): Promise<GovernanceDraftResponse>;
  enactGovernanceProposal(input: {
    toriiUrl: string;
    proposalId: string;
  }): Promise<GovernanceDraftResponse>;
  getExplorerMetrics(config: {
    toriiUrl: string;
  }): Promise<ExplorerMetricsResponse | null>;
  getNetworkStats(input: {
    toriiUrl: string;
    assetDefinitionId?: string;
  }): Promise<NetworkStatsResponse>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
  }): Promise<ExplorerAccountQrResponse>;
  getVpnAvailability(input: { toriiUrl: string }): Promise<VpnAvailability>;
  getVpnProfile(input: { toriiUrl: string }): Promise<VpnProfile | null>;
  getVpnStatus(input?: Partial<VpnAuthContext>): Promise<VpnStatus>;
  connectVpn(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    privateKeyHex?: string;
    exitClass: VpnExitClass;
  }): Promise<VpnStatus>;
  disconnectVpn(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    privateKeyHex?: string;
  }): Promise<VpnStatus>;
  repairVpn(input: Partial<VpnAuthContext>): Promise<VpnStatus>;
  listVpnReceipts(input?: Partial<VpnAuthContext>): Promise<VpnReceipt[]>;
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
    onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
  ): Promise<AccountFaucetResponse>;
  cancelFaucetRequest(input: {
    requestId: string;
  }): Promise<{ canceled: boolean }>;
  createKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    hostAccountId: string;
    privateKeyHex?: string;
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
  }): Promise<TransactionSubmissionResult>;
  getKaigiCall(input: {
    toriiUrl: string;
    callId: string;
    inviteSecretBase64Url: string;
  }): Promise<KaigiMeetingView>;
  joinKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    participantAccountId: string;
    privateKeyHex?: string;
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
  }): Promise<TransactionSubmissionResult>;
  watchKaigiCallEvents(
    input: {
      toriiUrl: string;
      callId: string;
    },
    onEvent: (event: KaigiCallEvent) => void | Promise<void>,
  ): Promise<string>;
  stopWatchingKaigiCallEvents(subscriptionId: string): void;
  pollKaigiMeetingSignals(input: {
    toriiUrl: string;
    accountId: string;
    callId: string;
    hostKaigiKeys: KaigiSignalKeyPair;
    afterTimestampMs?: number;
    limit?: number;
    offset?: number;
  }): Promise<KaigiMeetingSignalRecord[]>;
  endKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    hostAccountId: string;
    privateKeyHex?: string;
    callId: string;
    endedAtMs?: number;
  }): Promise<TransactionSubmissionResult>;
  createConnectPreview(input: {
    toriiUrl: string;
    chainId: string;
    node?: string | null;
    launchProtocol?: string | null;
  }): Promise<ConnectPreview>;
  getSumeragiStatus(config: { toriiUrl: string }): Promise<NexusSumeragiStatus>;
  getNexusPublicLaneValidators(input: {
    toriiUrl: string;
    laneId: number;
  }): Promise<PublicLaneValidatorsResponseView>;
  getNexusPublicLaneStake(input: {
    toriiUrl: string;
    laneId: number;
    validator?: string;
  }): Promise<PublicLaneStakeResponseView>;
  getNexusPublicLaneRewards(input: {
    toriiUrl: string;
    laneId: number;
    account: string;
    assetId?: string;
    uptoEpoch?: number;
  }): Promise<PublicLaneRewardsResponseView>;
  getNexusStakingPolicy(config: {
    toriiUrl: string;
  }): Promise<NexusStakingPolicy>;
  listSubscriptionPlans(input: {
    toriiUrl: string;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<SubscriptionPlanListResponseView>;
  listSubscriptions(input: {
    toriiUrl: string;
    ownedBy?: string;
    provider?: string;
    status?: SubscriptionStatusView;
    limit?: number;
    offset?: number;
  }): Promise<SubscriptionListResponseView>;
  getSubscription(input: {
    toriiUrl: string;
    subscriptionId: string;
  }): Promise<SubscriptionListItemView>;
  createSubscription(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
    planId: string;
    firstChargeMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  pauseSubscription(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
  }): Promise<SubscriptionActionResponseView>;
  resumeSubscription(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
    chargeAtMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  cancelSubscription(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
    cancelMode?: "immediate" | "period_end";
  }): Promise<SubscriptionActionResponseView>;
  keepSubscription(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
  }): Promise<SubscriptionActionResponseView>;
  chargeSubscriptionNow(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    subscriptionId: string;
    chargeAtMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  getSoraCloudStatus(input: {
    toriiUrl: string;
    apiToken?: string;
  }): Promise<SoraCloudStatusResponseView>;
  deploySoraCloudHf(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex?: string;
    repoId: string;
    revision?: string;
    modelName: string;
    serviceName: string;
    apartmentName?: string;
    storageClass: SoraCloudStorageClassView;
    leaseTermMs: number;
    leaseAssetDefinitionId: string;
    baseFeeNanos: string;
    apiToken?: string;
  }): Promise<SoraCloudHfDeployResponseView>;
  getSoraCloudHfStatus(input: {
    toriiUrl: string;
    apiToken?: string;
  }): Promise<Record<string, unknown>>;
  bondPublicLaneStake(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    amount: string;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  schedulePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    amount: string;
    requestId: string;
    releaseAtMs: number;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  finalizePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    requestId: string;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  claimPublicLaneRewards(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
}

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

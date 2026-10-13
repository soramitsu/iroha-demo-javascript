import type {
  ConfidentialWalletBackupMetadata,
  ConfidentialWalletBackupMetadataV2,
} from "@/utils/walletBackup";
import type {
  GovernanceProposalDetail,
  GovernanceProposalList,
  GovernanceWritableProposalKindId,
} from "@/governance/model";
import type {
  EndpointInspection,
  EndpointNetworkContext,
} from "@/types/endpointInspection";
import type { SoraCloudHfStatusView } from "@/utils/soracloud";
import type { ConnectTransactionReview } from "@/types/connectTransactionReview";

export type { ConnectTransactionReview };

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
  signingAlgorithm: string;
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
  scope: string;
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
  memo?: string;
}

export interface AccountPermissionItem {
  name: string;
  payload: Record<string, unknown> | null;
}

export interface AccountPermissionsResponse {
  items: AccountPermissionItem[];
  total: number;
}

export type GovernanceCitizenState = "citizen" | "not-citizen" | "unavailable";

export interface GovernanceCitizenStatusResponse {
  state: GovernanceCitizenState;
  accountId: string;
  amount: string | null;
  bondedHeight: string | null;
  seatsInEpoch: string | null;
  lastEpochSeen: string | null;
  cooldownUntil: string | null;
}

export interface GovernanceCitizenCountResponse {
  total: number | null;
  endpointAvailable: boolean;
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
  laneCount: number | null;
  dataspaceCount: number | null;
  validatorCount: number | null;
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
export type VpnCanonicalReceiptSource = "torii" | "relay" | "wsv";
export type VpnReceiptSource = VpnCanonicalReceiptSource;

export interface VpnConnectionContext {
  toriiUrl: string;
  accountId: string;
  chainId: string;
  networkPrefix: number;
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
  operatorAccountId: string;
  leaseFee: string;
  settlementGraceSecs: number;
  flowLabelBits: 24;
  paddingBudgetMs: number;
  relayIdHex: string;
  relayMldsa65PublicKeyHex: string;
  descriptorCommitHex: string;
  tlsServerName: string;
  relayTlsSpkiSha256Hex: string;
  relayCertificateSha256Hex: string;
  directorySnapshotDigestHex: string;
}

interface VpnReceiptBase {
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
}

export type VpnReceipt = VpnReceiptBase & {
  receiptSource: VpnCanonicalReceiptSource;
  status:
    | "disconnected"
    | "expired"
    | "replaced"
    | "settlement_pending"
    | "settled";
  quoteId: string;
  paymentTxHash: string;
  feeAssetId: string;
  escrowAccountId: string;
  operatorAccountId: string;
  leaseFee: string;
  earnedFee: string;
  refundedFee: string;
  leaseIdHex: string;
  settleLeaseInstruction: {
    wireId: string;
    payloadHex: string;
  } | null;
};

export interface VpnStatus {
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "disconnecting"
    | "reconciling"
    | "remote-expiry-pending"
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
  status: "FINALIZED";
  finality: TransactionFinalityProof;
}

export interface AccountFaucetResponse {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: string;
  finality: TransactionFinalityProof;
}

export interface TransactionFeeQuoteView {
  payer: "authority" | "sponsor";
  components: Array<{
    kind: "nexus" | "pipeline_gas";
    assetDefinitionId: string;
    maxAmount: string;
  }>;
  nextBlockHeight: string;
}

export interface TransactionFinalityProof {
  status: "finalized";
  transactionHash: string;
  blockHeight: number;
  blockHash: string;
  finalizedBlockHeight: number;
}

export interface TransactionSubmissionResult {
  hash: string;
  finality: TransactionFinalityProof;
  feeQuote?: TransactionFeeQuoteView;
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
  | "waitingForFinality"
  | "claimFinalized";

export interface FaucetRequestProgress {
  phase: FaucetRequestPhase;
  attempt?: number;
  attempts?: number;
  txHashHex?: string;
}

export interface IrohaConnectWalletContext {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  /** Endpoint-derived, pinned NetworkId. */
  networkId: string;
  accountId: string;
}

export interface IrohaConnectPermissions {
  methods: string[];
  events: string[];
  resources: string[] | null;
}

export type IrohaConnectProcessedFrame =
  | { kind: "server_event" }
  | { kind: "closed"; reason: string }
  | { kind: "response"; frameBase64: string; error: string }
  | {
      kind: "request";
      requestToken: string;
      requestType: "sign_request_raw" | "sign_request_tx";
      domainTag: string | null;
      byteLength: number;
      payloadPreviewHex: string;
      /** Decoded payload review for `sign_request_tx`; null for raw requests. */
      review: ConnectTransactionReview | null;
    }
  | { kind: "ignored" };

export interface KaigiSignalKeyPair {
  publicKeyBase64Url: string;
  privateKeyBase64Url: string;
}

export type KaigiMeetingPrivacy = "transparent";

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
  hostAccountId: string;
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
  offerDescription: KaigiOfferDescription;
}

export interface KaigiMeetingSignalRecord {
  entrypointHash: string;
  authority: string;
  timestampMs: number;
  callId: string;
  participantAccountId: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
  createdAtMs: number;
  answerDescription: KaigiAnswerDescription;
}

export interface KaigiCallEvent {
  kind: "roster_updated" | "ended" | "stream_closed";
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
  [key: string]: unknown;
}

export interface NexusLifecycleLaneView {
  id: number;
  dataspace_id: string;
  alias: string;
  description: string;
  visibility: string;
  governance: string | null;
  storage: string;
  proof_scheme: string;
  metadata: Record<string, unknown>;
}

export interface NexusLifecycleView {
  version: number;
  nexus_enabled: boolean;
  lane_count: number;
  lanes: NexusLifecycleLaneView[];
}

export interface NexusStakingPolicy {
  unbondingDelayMs: number | null;
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
  peer_id: string;
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

export type SubscriptionMutationActionView =
  | "create"
  | "pause"
  | "resume"
  | "cancel"
  | "keep"
  | "charge_now";

export interface SubscriptionActionResponseView {
  ok: boolean;
  action: SubscriptionMutationActionView;
  subscription_id: string;
  tx_hash_hex: string;
  finality: TransactionFinalityProof;
  state_status: "confirmed" | "advanced" | "indexing";
  reconciliation_message?: string;
  feeQuote?: TransactionFeeQuoteView;
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
  leaseExpiresHeight: number | null;
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

export type SoraCloudHfSharedLeaseStatusResponseView = SoraCloudHfStatusView;

export interface GovernanceUnlockStatsResponse {
  height_current: number;
  expired_locks_now: number;
  referenda_with_expired: number;
  last_sweep_height: number;
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

export interface GovernanceCapabilitiesV1 {
  schema: "iroha.governance.capabilities.v1";
  version: 1;
  networkId: "hash:82531CE8EAE8BFF6BEECA4698BFD13A3BC8BEC5F0EE0D23D428C97FC17AB0F3B#3E94";
  currentHeight: string;
  networkPrefix: 369;
  abiVersion: 1;
  dataModelVersion: 4;
  approvalMode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1";
  privateBallotProtocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1";
  mandatoryPrivateBallots: true;
  proposalBackedReferendumBallotsSupported: false;
  standalonePlainBallotsSupported: true;
  standaloneZkBallotsSupported: true;
  citizenshipAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
  citizenshipBondAmount: "10000";
  citizenshipEscrowAccount: string;
  votingAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
  minBondAmount: "150";
  bondEscrowAccount: string;
  minEnactmentDelay: 600;
  invitationPhaseBlocks: 3600;
  registrationPhaseBlocks: 3600;
  survivorFreezePhaseBlocks: 1000;
  commitmentPhaseBlocks: 3600;
  releaseDelayBlocks: 600;
  openingPhaseBlocks: 600;
  maxBallotRetries: 3;
  maxCorpusEntries: 1000;
  targetBodySizes: {
    rules_committee: 7;
    agenda_council: 9;
    interest_panel: 11;
    review_panel: 13;
    coordination_council: 150;
    mpc_committee: 50;
    fma_committee: 5;
    oversight_committee: 7;
    policy_jury: 25;
    confirmation_jury: 1000;
  };
  supportedProposalKinds: Array<
    | "DEPLOY_CONTRACT"
    | "RUNTIME_UPGRADE"
    | "SCCP_ROUTE_GOVERNANCE"
    | "VALIDATION_FEE_POLICY"
    | "VALIDATION_FEE_PAYOUT_LIFECYCLE"
    | "MUSUBI_REGISTRY_GOVERNANCE"
    | "SORAFS_PROVIDER_GOVERNANCE"
    | "CONTRACT_LIFECYCLE_GOVERNANCE"
    | "CONTRACT_EMERGENCY_HOLD"
    | "GLOBAL_DATA_TRIGGER_PERMISSION_GOVERNANCE"
  >;
  supportedRoutes: Array<
    | "/v1/gov/capabilities"
    | "/v1/gov/citizens/draft"
    | "/v1/gov/parliament/attempts/draft"
    | "/v1/gov/parliament/attempts/{governance_attempt_id}"
    | "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context"
    | "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof"
    | "/v1/gov/parliament/ballots/{ballot_attempt_id}/release-context"
    | "/v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release"
    | "/v1/gov/parliament/transitions/draft"
    | "/v1/gov/ballots/plain"
    | "/v1/gov/ballots/zk-v1"
    | "/v1/gov/ballots/zk-v1/ballot-proof"
    | "/v1/validation-fee/proposals"
    | "/v1/validation-fee/proposals/{proposal_id}"
    | "/v1/validation-fee/proposals/draft"
  >;
}

export interface GovernanceProposalListInput {
  toriiUrl: string;
  limit?: number;
  cursor?: string | null;
}

export interface GovernanceProposalDetailInput {
  toriiUrl: string;
  networkPrefix: number;
  proposalId: string;
}

export type GovernanceWriteOperation = "register-citizen" | "propose";

export interface GovernancePreparedAction {
  reviewId: string;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId: string | null;
  decodedInstruction: Record<string, unknown>;
  fee: TransactionFeeQuoteView;
  expiresAtMs: number;
}

export interface GovernancePrepareContext {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
}

export interface GovernanceProposalPrepareInput
  extends GovernancePrepareContext {
  kind: GovernanceWritableProposalKindId;
  payload: Record<string, unknown>;
}

export interface GovernanceCitizenRegistrationPrepareInput
  extends GovernancePrepareContext {
  amount: string;
}

export interface GovernanceConfirmActionInput {
  reviewId: string;
  accountId: string;
}

export interface GovernanceFinalizedAction extends TransactionSubmissionResult {
  operation: GovernanceWriteOperation;
  proposalId: string | null;
  status: "finalized";
}

export interface GovernanceValidationFeePayoutBindingView {
  contract_address: string;
  code_hash: string;
  entrypoint: "autonomous_validation_fee_tick";
  treasury_account_id: string;
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
  xor_asset_id: string;
  pool_vault_account_id: string;
  batch_ds: "10";
  min_xor_out: "4";
  max_xor_out: "100";
  recipients: Array<{ account_id: string; share: "0.25" }>;
}

export interface GovernanceValidationFeeEffectivePolicyView {
  schema_version: 1;
  network_id: "hash:82531CE8EAE8BFF6BEECA4698BFD13A3BC8BEC5F0EE0D23D428C97FC17AB0F3B#3E94";
  policy_version: string;
  previous_policy_hash: string | null;
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
  ds_scale: 2;
  fee: "0" | "0.1";
  treasury_account_id: string;
  charging_mode:
    | { charging_mode: "DISABLED"; value: null }
    | {
        charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION";
        value: null;
      };
  effective_from_height: string;
  expires_after_height: string | null;
  exemption_classes: [] | ["TREASURY_PAYOUT"];
  treasury_payout_binding: GovernanceValidationFeePayoutBindingView | null;
}

export interface GovernanceValidationFeePolicyView {
  observedHeight: string;
  effective: GovernanceValidationFeeEffectivePolicyView;
  latestEnacted: GovernanceValidationFeeEffectivePolicyView;
  scheduled: [];
  registryHead: {
    policyVersion: string;
    policyHash: string;
  };
  verifiedProof: {
    schema: "cbsi.validation-fee-ledger-projection.v1";
    authorizationModel: "SORA_PARLIAMENT_V1";
    registrySnapshotHash: string;
    finalizedBlockHash: string;
    finalizedContextId: string;
    trustedCheckpointHeight: string;
    trustedCheckpointContextId: string;
  };
}

export interface SigningAlgorithmOption {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface IrohaBridge {
  ping(config: { toriiUrl: string }): Promise<ToriiHealth>;
  getChainMetadata(config: {
    toriiUrl: string;
  }): Promise<ChainMetadataResponse>;
  inspectEndpoint(config: EndpointNetworkContext): Promise<EndpointInspection>;
  confirmEndpointNetworkIdentity(input: {
    toriiUrl: string;
    networkId: string;
  }): Promise<{ confirmed: boolean }>;
  getSigningAlgorithms(config: {
    toriiUrl: string;
  }): Promise<SigningAlgorithmOption[]>;
  generateKeyPair(input: { signingAlgorithm: string; seedHex?: string }): {
    publicKeyHex: string;
    privateKeyHex: string;
    signingAlgorithm: string;
  };
  generateKaigiSignalKeyPair(): KaigiSignalKeyPair;
  isSecureVaultAvailable(): Promise<boolean>;
  storeAccountSecret(input: {
    accountId: string;
    networkPrefix: number;
    privateKeyHex: string;
    signingAlgorithm: string;
  }): Promise<void>;
  listAccountSecretFlags(input: {
    accountIds: string[];
    networkPrefix: number;
  }): Promise<Record<string, boolean>>;
  copyTextToClipboard(input: { text: string }): Promise<void>;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix: number;
    signingAlgorithm: string;
  }): AccountAddressView;
  validateCanonicalAccountId(input: {
    accountId: string;
    networkPrefix?: number;
  }): string;
  derivePublicKey(input: { privateKeyHex: string; signingAlgorithm: string }): {
    publicKeyHex: string;
    signingAlgorithm: string;
  };
  resolveAccountAlias(input: {
    toriiUrl: string;
    alias: string;
    networkPrefix: number;
  }): Promise<AccountAliasResolutionResponse>;
  createConfidentialPaymentAddress(input: {
    accountId: string;
    networkPrefix: number;
  }): Promise<ConfidentialPaymentAddress>;
  exportConfidentialWalletBackup(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    mnemonic: string;
  }): Promise<ConfidentialWalletBackupMetadataV2>;
  importConfidentialWalletBackup(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    mnemonic: string;
    confidentialWallet: ConfidentialWalletBackupMetadata;
  }): Promise<void>;
  registerAccount(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    metadata?: Record<string, unknown>;
    authorityAccountId: string;
  }): Promise<TransactionSubmissionResult>;
  transferAsset(input: {
    toriiUrl: string;
    chainId: string;
    assetDefinitionId: string;
    accountId: string;
    destinationAccountId: string;
    networkPrefix: number;
    quantity: string;
    memo?: string;
  }): Promise<TransactionSubmissionResult>;
  setIrohaConnectContext(input: IrohaConnectWalletContext): void;
  resetIrohaConnectBoundary(): void;
  prepareIrohaConnectSession(input: {
    context: IrohaConnectWalletContext;
    sid: string;
    appPublicKeyHex: string;
    nonceBase64Url: string;
    relayToken: string;
    requestedNetworkId: string;
    permissions: IrohaConnectPermissions | null;
  }): Promise<{ approvalToken: string }>;
  approveIrohaConnectSession(input: {
    approvalToken: string;
  }): Promise<{ sessionToken: string; frameBase64: string }>;
  processIrohaConnectFrame(input: {
    sessionToken: string;
    frameBase64: string;
  }): IrohaConnectProcessedFrame;
  approveIrohaConnectRequest(input: {
    sessionToken: string;
    requestToken: string;
  }): Promise<{ frameBase64: string; signed: boolean }>;
  rejectIrohaConnectRequest(input: {
    sessionToken: string;
    requestToken: string;
  }): { frameBase64: string };
  closeIrohaConnectSession(input: { sessionToken: string }): void;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  getConfidentialAssetBalance(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceView>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceView>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
    assetDefinitionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountAssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
    limit?: number;
    offset?: number;
  }): Promise<AccountTransactionsResponse>;
  listAccountPermissions(input: {
    toriiUrl: string;
    networkPrefix: number;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountPermissionsResponse>;
  getGovernanceCapabilities(input: {
    toriiUrl: string;
  }): Promise<GovernanceCapabilitiesV1>;
  getGovernanceCitizenStatus(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
  }): Promise<GovernanceCitizenStatusResponse>;
  getGovernanceCitizenCount(input: {
    toriiUrl: string;
  }): Promise<GovernanceCitizenCountResponse>;
  getGovernanceUnlockStats(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
  }): Promise<GovernanceUnlockStatsResponse>;
  getGovernanceCouncilCurrent(input: {
    toriiUrl: string;
  }): Promise<GovernanceCouncilCurrentResponse>;
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
  prepareGovernanceCitizenRegistration(
    input: GovernanceCitizenRegistrationPrepareInput,
  ): Promise<GovernancePreparedAction>;
  prepareGovernanceProposal(
    input: GovernanceProposalPrepareInput,
  ): Promise<GovernancePreparedAction>;
  confirmGovernanceAction(
    input: GovernanceConfirmActionInput,
  ): Promise<GovernanceFinalizedAction>;
  getExplorerMetrics(config: {
    toriiUrl: string;
  }): Promise<ExplorerMetricsResponse | null>;
  getNetworkStats(input: {
    toriiUrl: string;
    assetDefinitionId: string;
    networkPrefix: number;
  }): Promise<NetworkStatsResponse>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
  }): Promise<ExplorerAccountQrResponse>;
  getVpnAvailability(input: { toriiUrl: string }): Promise<VpnAvailability>;
  getVpnProfile(input: { toriiUrl: string }): Promise<VpnProfile | null>;
  getVpnStatus(input?: VpnConnectionContext): Promise<VpnStatus>;
  connectVpn(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    networkPrefix: number;
    exitClass: VpnExitClass;
  }): Promise<VpnStatus>;
  disconnectVpn(input?: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    networkPrefix: number;
  }): Promise<VpnStatus>;
  repairVpn(): Promise<VpnStatus>;
  listVpnReceipts(input?: VpnConnectionContext): Promise<VpnReceipt[]>;
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
      requestId: string;
    },
    onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
  ): Promise<AccountFaucetResponse>;
  cancelFaucetRequest(input: {
    requestId: string;
  }): Promise<{ canceled: boolean }>;
  createKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    hostAccountId: string;
    callId: string;
    title?: string;
    scheduledStartMs: number;
    meetingCode: string;
    inviteSecretBase64Url: string;
    hostDisplayName: string;
    hostParticipantId: string;
    hostKaigiPublicKeyBase64Url: string;
    offerDescription: KaigiOfferDescription;
    privacyMode: "transparent";
  }): Promise<TransactionSubmissionResult>;
  getKaigiCall(input: {
    toriiUrl: string;
    networkPrefix: number;
    callId: string;
    inviteSecretBase64Url: string;
  }): Promise<KaigiMeetingView>;
  joinKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    participantAccountId: string;
    callId: string;
    inviteSecretBase64Url: string;
    participantId: string;
    participantName: string;
    answerDescription: KaigiAnswerDescription;
  }): Promise<TransactionSubmissionResult>;
  watchKaigiCallEvents(
    input: {
      toriiUrl: string;
      callId: string;
    },
    onEvent: (event: KaigiCallEvent) => void | Promise<void>,
  ): Promise<string>;
  stopWatchingKaigiCallEvents(input: { subscriptionId: string }): void;
  pollKaigiMeetingSignals(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    callId: string;
    hostKaigiKeys: KaigiSignalKeyPair;
    afterTimestampMs?: number;
    limit?: number;
  }): Promise<KaigiMeetingSignalRecord[]>;
  endKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    hostAccountId: string;
    callId: string;
    endedAtMs?: number;
  }): Promise<TransactionSubmissionResult>;
  getSumeragiStatus(config: { toriiUrl: string }): Promise<NexusSumeragiStatus>;
  getNexusLifecycle(config: { toriiUrl: string }): Promise<NexusLifecycleView>;
  getNexusPublicLaneValidators(input: {
    toriiUrl: string;
    laneId: number;
  }): Promise<PublicLaneValidatorsResponseView>;
  getNexusPublicLaneStake(input: {
    toriiUrl: string;
    networkPrefix: number;
    laneId: number;
    validator?: string;
  }): Promise<PublicLaneStakeResponseView>;
  getNexusPublicLaneRewards(input: {
    toriiUrl: string;
    networkPrefix: number;
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
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
    planId: string;
    firstChargeMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  pauseSubscription(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
  }): Promise<SubscriptionActionResponseView>;
  resumeSubscription(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
    chargeAtMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  cancelSubscription(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
    cancelMode: "immediate" | "period_end";
  }): Promise<SubscriptionActionResponseView>;
  keepSubscription(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
  }): Promise<SubscriptionActionResponseView>;
  chargeSubscriptionNow(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
    chargeAtMs?: number;
  }): Promise<SubscriptionActionResponseView>;
  reconcileSubscriptionMutation(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    subscriptionId: string;
    action: SubscriptionMutationActionView;
    transactionHash: string;
  }): Promise<SubscriptionActionResponseView>;
  getSoraCloudStatus(input: {
    toriiUrl: string;
  }): Promise<SoraCloudStatusResponseView>;
  getSoraCloudHfSharedLeaseStatus(input: {
    toriiUrl: string;
    repoId: string;
    revision: string;
    storageClass: SoraCloudStorageClassView;
    leaseTermMs: number;
    accountId?: string;
  }): Promise<SoraCloudHfSharedLeaseStatusResponseView>;
  getParameters(input: { toriiUrl: string }): Promise<Record<string, unknown>>;
  bondPublicLaneStake(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
    amount: string;
  }): Promise<TransactionSubmissionResult>;
  registerPublicLaneValidator(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    laneId: number;
    validatorAccountId: string;
    stakeAccountId?: string;
    peerId: string;
    selfStake: string;
    metadata?: Record<string, unknown>;
  }): Promise<TransactionSubmissionResult>;
  schedulePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
    amount: string;
    requestId: string;
    releaseAtMs: number;
  }): Promise<TransactionSubmissionResult>;
  finalizePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
    requestId: string;
  }): Promise<TransactionSubmissionResult>;
  claimPublicLaneRewards(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
  }): Promise<TransactionSubmissionResult>;
}

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

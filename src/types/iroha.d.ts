import type {
  ConfidentialWalletBackupMetadata,
  ConfidentialWalletBackupMetadataV2,
} from "@/utils/walletBackup";
import type {
  GovernanceParliamentDecision,
  GovernanceProposalDetail,
  GovernanceProposalList,
  GovernanceWritableProposalKindId,
} from "@/governance/model";
import type {
  EndpointInspection,
  EndpointNetworkContext,
} from "@/types/endpointInspection";

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

export interface OfflineReadinessBlockerView {
  code: string;
  message: string;
}

export interface OfflineReadinessView {
  required_bridge_abi_version: 21;
  cash_handoff_capability: "cash_handoff_v1";
  max_hops: number;
  asset_definition_id: string;
  asset_scale: number | null;
  evaluated_block_height: number;
  evaluated_block_hash: string;
  active_transfer_verifier: Record<string, unknown> | null;
  active_topup_shield_verifier: Record<string, unknown> | null;
  active_unshield_verifier: Record<string, unknown> | null;
  active_recursive_step_eq_verifier: Record<string, unknown> | null;
  active_recursive_step_ep_verifier: Record<string, unknown> | null;
  artifact_set: Record<string, unknown> | null;
  proof_backend_available: boolean;
  recursive_lineage_supported: boolean;
  ready: boolean;
  blockers: OfflineReadinessBlockerView[];
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
export type VpnReceiptSource = "torii" | "local-fallback";

export interface VpnAuthContext {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: string;
  signingAlgorithm?: string;
  chainId?: string;
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
    }
  | { kind: "ignored" };

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
  fee?: TransactionFeeView | string | number | null;
  rollout_handle?: string | null;
  rollout_stage?: string | null;
  rollout_percent?: number | null;
  raw: Record<string, unknown> | null;
}

export interface SccpCodecCapabilityView {
  id: number;
  key: string;
  description: string;
}

export interface SccpCounterpartyCapabilityView {
  domain: number;
  chain: string;
  verifierBackendKey: string;
  messageBackend: string;
  registryBackend: string;
  counterpartyAccountCodec: number;
  counterpartyAccountCodecKey: string;
  destinationRollout: SccpDestinationRolloutView | null;
  productionReady: boolean;
  disabledReason: string | null;
}

export interface SccpCapabilitiesResponse {
  localDomain: number;
  localChain: string;
  proofFamily: string;
  burnBundlePath: string;
  messageBundlePath: string;
  messageProofPath: string;
  messageJobPath: string;
  recentMessagesPath: string;
  proofManifestPath: string;
  burnRegistryBackend: string;
  proofSubmitPath: string | null;
  messageSubmitPath: string | null;
  messagePayloadKinds: readonly string[];
  codecs: readonly SccpCodecCapabilityView[];
  counterparties: readonly SccpCounterpartyCapabilityView[];
}

export interface SccpDestinationBindingView {
  version: number;
  key: string;
  bindingHash: string;
}

export interface SccpDestinationRolloutView {
  version: number;
  verifierPlan: string;
  immutableVerifierReady: boolean;
  anchorsReady: boolean;
  verifierIdentity: string | null;
  verifierCodeHash: string | null;
  verifierKeyHash: string | null;
  destinationNetworkId: string | null;
  destinationBridgeAddress: string | null;
  destinationBindingKey: string | null;
  destinationBindingHash: string | null;
  anchorId: string | null;
  blockers: readonly string[];
}

export interface SccpSubmissionArgumentView {
  key: string;
  description: string;
}

export interface SccpCounterpartySubmissionTemplateView {
  version: number;
  encoding: string;
  submissionKind: string;
  verifierEntrypoint: string;
  requiredArguments: readonly SccpSubmissionArgumentView[];
}

export interface SccpTairaXorBurnRecordMaterialView {
  settlementAssetDefinitionId: string;
  contractArtifactB64: string;
  artifactSha256?: string;
  vkRef: {
    backend: string;
    name: string;
  };
  gasLimit?: number;
}

export interface SccpPostDeployLiveEvidenceView {
  fullTomlReady: boolean;
  sourceBridgeConfigHash: string;
  sourceEventTransactionId: string;
  routeCanaryEvidenceHash: string;
  routeCanaryTransactionId: string;
  offlineFullTomlSha256?: string;
}

export interface SccpProofManifestView {
  version: number;
  routeId?: string;
  assetKey?: string;
  localDomain: number;
  localChain: string;
  counterpartyDomain: number;
  chain: string;
  proofFamily: string;
  securityModel: string;
  anchorGovernance: string;
  destinationBinding: SccpDestinationBindingView;
  verifierBackendKey: string;
  messageBackend: string;
  registryBackend: string;
  counterpartyAccountCodec: number;
  counterpartyAccountCodecKey: string;
  finalityModel: string;
  verifierTarget: string;
  manifestSeed: string;
  requiredPublicInputs: readonly string[];
  messagePayloadKinds: readonly string[];
  destinationRollout: SccpDestinationRolloutView | null;
  productionReady: boolean;
  disabledReason: string | null;
  tronBridgeAddress?: string;
  tairaXorBridgeAddress?: string;
  tairaXorTokenAddress?: string;
  sccpTronSourceBridgeAddress?: string;
  tronSourceBridgeAddress?: string;
  tronVerifierAddress?: string;
  postDeployLiveEvidence?: SccpPostDeployLiveEvidenceView;
  submissionTemplate: SccpCounterpartySubmissionTemplateView;
  tairaXorBurnRecord: SccpTairaXorBurnRecordMaterialView | null;
}

export interface SccpProofManifestSetResponse {
  localDomain: number;
  localChain: string;
  proofFamily: string;
  manifests: readonly SccpProofManifestView[];
  routes?: readonly Record<string, unknown>[];
}

export interface SccpSoraOutboundMaterialResponse {
  version: 1;
  registry_revision: string;
  route_key: {
    lane_id: {
      source: { network: string; profile: null };
      target: { network: string; profile: null };
    };
    route_id: string;
    asset_key: string;
    revision: number;
  };
  route_configuration_hash: string;
  destination_binding_hash: string;
  settlement_asset_definition_id: string;
  policy: {
    version: 1;
    semantics: "ivm_proved_record_sccp_message_v1";
    contract_artifact_sha256: string;
    vk_ref: {
      backend: string;
      name: string;
      version: number;
      commitment: string;
    };
    gas_limit: number;
  };
  contract_artifact_b64: string;
  contract_code_hash: string;
  verifying_key_version: number;
}

export interface SccpRecentMessagesResponse {
  items: Record<string, unknown>[];
  total: number;
  raw: Record<string, unknown>;
}

export interface SccpDestinationProofMaterialInput {
  networkIdHex?: string;
  verifierAddressHex?: string;
  bridgeAddressHex?: string;
  verifierCodeHashHex?: string;
  verifierKeyHashHex?: string;
  expectedDestinationBindingHashHex?: string;
  tronVerifierAddress?: string;
  proofBytesHex?: string;
}

export interface SccpMessageProofInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  messageId: string;
}

export interface SccpMessageProofBundleInput {
  toriiUrl: string;
  messageId: string;
}

export interface SccpBscProofGenerateInput {
  request: Record<string, unknown>;
  proverModuleUrl?: string;
  proverConfigUrl?: string;
  timeoutMs?: number;
}

export interface SccpBscSourceProofGenerateInput {
  input: Record<string, unknown>;
  proverModuleUrl?: string;
  proverConfigUrl?: string;
  timeoutMs?: number;
}

export interface SccpSourceProofDeploymentRebuildInput {
  proofPackage: Record<string, unknown>;
  sourceVerifierMaterial: Record<string, unknown>;
  sourceAdapterEngineDeployment: Record<string, unknown>;
  label?: string;
}

export interface SccpBridgeProofSubmitInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  accountId: string;
  destinationProofB64?: string;
  burnBundle?: Record<string, unknown>;
  messageBundle?: Record<string, unknown>;
  publicKeyHex?: string;
  signatureB64?: string;
  transactionPayloadB64?: string;
  creationTimeMs?: number | string;
}

export interface SccpBridgeMessageSubmitInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  accountId: string;
  nativeProofB64?: string;
  messageBundle?: Record<string, unknown>;
  publicKeyHex?: string;
  signatureB64?: string;
  transactionPayloadB64?: string;
  receiptLane?: number | string;
  settlement?: Record<string, unknown>;
  creationTimeMs?: number | string;
}

export interface SccpRecentMessagesInput {
  toriiUrl: string;
  routeId?: string;
  limit?: number;
  offset?: number;
}

export interface SoraCloudHfStatusResponseView {
  found: boolean;
  statusCode?: number;
  message?: string;
  raw: Record<string, unknown> | null;
}

export interface ZkIvmVerifyingKeyRefInput {
  backend: string;
  name: string;
}

export interface ZkIvmRequestInput {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  vkRef: ZkIvmVerifyingKeyRefInput;
  authority: string;
  metadata?: Record<string, unknown>;
  bytecode: string | number[] | Record<string, unknown>;
  proved?: Record<string, unknown>;
}

export interface ZkIvmProveJobInput {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  jobId: string;
}

export interface ZkIvmProvedTransactionSubmitInput {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex?: never;
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
  gasLimit?: string | number;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
}

export interface TronGatewayInput {
  endpoint?: string;
}

export interface TronTransactionInput extends TronGatewayInput {
  txId: string;
}

export interface TronAccountInput extends TronGatewayInput {
  address: string;
}

export interface TronBlockInput extends TronGatewayInput {
  blockNumber?: number | string;
}

export interface TronEventsInput extends TronGatewayInput {
  txId: string;
}

export interface TronBroadcastInput extends TronGatewayInput {
  transaction: Record<string, unknown>;
}

export interface SccpNileTestTronSignerStatus {
  enabled: boolean;
  network: "nile";
  address: string;
  reason?: string;
}

export interface SccpNileTestTronTransactionSignInput {
  transaction: Record<string, unknown>;
  ownerAddress?: string;
}

export type TronContractParameterInput =
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

export type TronTriggerSmartContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
    feeLimit?: number | string;
    callValue?: number | string;
    permissionId?: number | string;
  };

export type TronConstantContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
  };

export interface EvmRpcInput {
  endpoint?: string;
}

export interface EvmRpcCallInput extends EvmRpcInput {
  method: string;
  params?: unknown[];
}

export interface EvmTransactionInput extends EvmRpcInput {
  txHash: string;
}

export interface EvmAddressInput extends EvmRpcInput {
  address: string;
  blockTag?: string;
}

export interface EvmCallInput extends EvmRpcInput {
  to: string;
  data: string;
  from?: string;
  value?: string;
  blockTag?: string;
}

export interface EvmLogsInput extends EvmRpcInput {
  address?: string | string[];
  blockHash?: string;
  fromBlock?: string;
  toBlock?: string;
  topics?: Array<string | string[] | null>;
}

export interface SolanaRpcInput {
  endpoint?: string;
}

export interface SolanaRpcCallInput extends SolanaRpcInput {
  method: string;
  params?: unknown[];
}

export interface SolanaAddressInput extends SolanaRpcInput {
  address: string;
}

export interface SolanaTokenBalanceInput extends SolanaRpcInput {
  ownerAddress: string;
  mintAddress: string;
}

export interface SolanaAssociatedTokenAccountInput extends SolanaRpcInput {
  payerAddress: string;
  ownerAddress: string;
  mintAddress: string;
}

export interface SolanaTransactionInput extends SolanaRpcInput {
  signature: string;
}

export interface SolanaBroadcastInput extends SolanaRpcInput {
  transactionB64: string;
  expectedUnsignedTransactionB64: string;
}

export interface SolanaInstructionAccountMetaInput {
  pubkey: string;
  isSigner?: boolean;
  signer?: boolean;
  isWritable?: boolean;
  writable?: boolean;
}

export interface SolanaInstructionInput {
  programId: string;
  accounts?: SolanaInstructionAccountMetaInput[];
  dataHex: string;
}

export interface SolanaBuildTransactionInput extends SolanaRpcInput {
  feePayer: string;
  instructions: SolanaInstructionInput[];
  recentBlockhash?: string;
}

export interface SolanaPreparedAssociatedTokenAccount {
  associatedTokenAddress: string;
  exists: boolean;
  createInstruction: SolanaInstructionInput | null;
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
  chainId: string;
  genesisHash: string;
  currentHeight: number;
  networkPrefix: number;
  abiVersion: number;
  dataModelVersion: number;
  approvalMode: "PARLIAMENT_SORTITION_JIT";
  plainVotingEnabled: true;
  autoFinalizePlain: true;
  autoFinalizePlainScope: "GENERIC_NON_VALIDATION_FEE_ONLY";
  validationFeePlainRequiresExplicitFinalization: true;
  validationFeePlainElectorateRules: GovernancePlainElectorateRules;
  citizenshipAssetId: string;
  citizenshipBondAmount: string;
  citizenshipEscrowAccount: string;
  votingAssetId: string;
  minBondAmount: string;
  bondEscrowAccount: string;
  convictionStepBlocks: number;
  maxConviction: number;
  minEnactmentDelay: number;
  windowSpan: number;
  minTurnout: string;
  approvalThresholdNumerator: number;
  approvalThresholdDenominator: number;
  parliamentQuorumBps: number;
  targetBodySizes: Record<string, number>;
  supportedProposalKinds: Array<
    "VALIDATION_FEE_PAYOUT_LIFECYCLE" | "VALIDATION_FEE_POLICY"
  >;
  supportedRoutes: string[];
}

export interface GovernancePlainReferendumCitizen {
  accountId: string;
  amount: "10000";
  bondedHeight: string;
}

export interface GovernancePostParliamentRegistrationGate {
  schema: "taira.governance-post-parliament-registration-gate.v1";
  chainId: string;
  genesisHash: string;
  inputsSha256: string;
  proposalId: string;
  referendumId: string;
  hStart: string;
  hEnd: string;
  mode: "Plain";
  operatorAccountId: string;
  eligibleCitizenRosterSha256: string;
  gateHeight: string;
  gateObservationSequence: string;
  networkCheckpointSha256: string;
  parliamentSnapshotSha256: string;
  approvedBodyProgressSha256: string;
}

export interface GovernancePlainReferendumContract {
  schema: "sora.parliament.plain-referendum.v2";
  chainId: string;
  genesisHash: string;
  inputsSha256: string;
  proposalId: string;
  referendumId: string;
  hStart: string;
  hEnd: string;
  mode: "Plain";
  postParliamentRegistrationGate: GovernancePostParliamentRegistrationGate;
  eligibleCitizenRosterSha256: string;
  eligibleCitizenCount: string;
  eligibleCitizens: GovernancePlainReferendumCitizen[];
  snapshotFinalizedHeight: string;
  snapshotObservationSequence: string;
  networkCheckpointSha256: string;
  eligibleCitizenSnapshotSha256: string;
  plainElectorate: {
    rules: GovernancePlainElectorateRules;
    parliamentApprovalGateHeight: string;
    sealedAtHeight: string;
    rosterRoot: string;
    electorateSealHash: string;
    members: GovernancePlainReferendumCitizen[];
  };
  ballot: {
    draftRoute: string;
    requestVersion: 1;
    amount: "150";
    durationBlocks: "3600";
    directions: ["Aye", "Nay", "Abstain"];
    termsDerivedByCore: true;
    oneEffectiveBallotPerAccount: true;
  };
}

export interface GovernancePlainElectorateRules {
  votingAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
  bondEscrowAccount: string;
  slashReceiverAccount: string;
  ballotAmount: "150";
  ballotDurationBlocks: "3600";
  citizenshipAmount: "10000";
  maxMembers: "256";
  convictionStepBlocks: "100";
  maxConviction: "6";
  minTurnout: "1";
  approvalThresholdNumerator: "1";
  approvalThresholdDenominator: "2";
  eligibilityRule: {
    rule: "proposal_operator_at_or_before_gate_others_after_gate";
    value: null;
  };
}

export interface GovernancePlainReferendumContractResult {
  contract: GovernancePlainReferendumContract;
  contractFingerprint: string;
  artifactSha256: string;
  source: {
    descriptorUrl: string;
    artifactUrl: string;
  };
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

export interface GovernanceProposalListInput {
  toriiUrl: string;
  status?: string | null;
  kind?: string | null;
  proposer?: string | null;
  limit?: number;
  cursor?: string | null;
}

export interface GovernanceProposalDetailInput {
  toriiUrl: string;
  proposalId: string;
  accountId?: string | null;
}

export type GovernanceWriteOperation =
  | "register-citizen"
  | "propose"
  | "plain-ballot"
  | "parliament-ballot"
  | "enact";

export interface GovernanceFeeQuoteView {
  payer: "authority" | "sponsor";
  components: Array<{
    kind: string;
    assetDefinitionId: string;
    maxAmount: string;
  }>;
  nextBlockHeight: string;
}

export interface GovernancePreparedAction {
  reviewId: string;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId: string | null;
  referendumId: string | null;
  decodedInstruction: Record<string, unknown>;
  fee: GovernanceFeeQuoteView;
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

export interface GovernancePlainBallotPrepareInput
  extends GovernancePrepareContext {
  proposalId: string;
  referendumId: string;
  amount: string;
  durationBlocks: string;
  direction: GovernanceBallotDirection;
}

export interface GovernanceParliamentBallotPrepareInput
  extends GovernancePrepareContext {
  proposalId: string;
  body: string;
  decision: GovernanceParliamentDecision;
}

export interface GovernanceCitizenRegistrationPrepareInput
  extends GovernancePrepareContext {
  amount: string;
}

export interface GovernanceEnactPrepareInput extends GovernancePrepareContext {
  proposalId: string;
}

export interface GovernanceConfirmActionInput {
  reviewId: string;
  accountId: string;
}

export interface GovernanceFinalizedAction extends TransactionSubmissionResult {
  operation: GovernanceWriteOperation;
  proposalId: string | null;
  referendumId: string | null;
  status: "finalized";
}

export interface GovernanceValidationFeePolicyView {
  observedHeight: string;
  effective: Record<string, unknown>;
  latestEnacted: Record<string, unknown>;
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

export type GovernanceVotingMode = "Plain" | "Zk";

export interface GovernanceWindowInput {
  lower: number;
  upper: number;
}

export interface GovernanceDeployContractProposalInput {
  toriiUrl: string;
  contractAddress?: string | null;
  contractAlias?: string | null;
  codeHash: string;
  abiHash: string;
  abiVersion?: string | null;
  mode?: GovernanceVotingMode | null;
  window?: GovernanceWindowInput | null;
  limits?: Record<string, unknown> | null;
}

export type GovernanceLifecycleStageId =
  | "submitted"
  | "briefs"
  | "comment"
  | "sortition"
  | "vote"
  | "tally"
  | "challenge"
  | "canary"
  | "enact"
  | "review";

export type GovernanceStageStatus =
  | "complete"
  | "active"
  | "pending"
  | "unavailable"
  | "blocked";

export type GovernanceRole =
  | "none"
  | "citizen"
  | "seated_member"
  | "alternate"
  | "operator";

export type GovernanceActionGateCode =
  | "ready"
  | "busy"
  | "endpoint-unavailable"
  | "wallet-required"
  | "insufficient-bond"
  | "already-citizen"
  | "missing-permission"
  | "missing-referendum"
  | "invalid-proposal"
  | "invalid-amount"
  | "invalid-duration"
  | "missing-backend-capability"
  | "not-seated"
  | "closed-window";

export interface GovernanceActionGate {
  enabled: boolean;
  code: GovernanceActionGateCode;
  reason: string;
}

export interface GovernanceBriefStatus {
  required: boolean;
  submitted: number;
  redTeamRequired: boolean;
  redTeamSubmitted: number;
  endpointAvailable: boolean;
}

export interface GovernanceChallengeStatus {
  open: boolean;
  bondRequired: string | null;
  activeChallenges: number;
  endpointAvailable: boolean;
}

export interface GovernanceRolloutStatus {
  phase: "not-started" | "canary" | "active" | "rolled-back" | "unavailable";
  endpointAvailable: boolean;
  detail?: string | null;
}

export interface GovernanceLifecycleStage {
  id: GovernanceLifecycleStageId;
  labelKey: string;
  status: GovernanceStageStatus;
  detailKey: string;
}

export interface GovernanceLifecycleSnapshot {
  source: "torii" | "client-fallback";
  endpointAvailable: boolean;
  referendumId: string | null;
  proposalId: string | null;
  currentStageId: GovernanceLifecycleStageId;
  role: GovernanceRole;
  stages: GovernanceLifecycleStage[];
  briefStatus: GovernanceBriefStatus;
  challengeStatus: GovernanceChallengeStatus;
  rolloutStatus: GovernanceRolloutStatus;
  futureStagesUnavailable: boolean;
}

export interface SigningAlgorithmOption {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface RuntimeConfigResponse {
  walletConnectProjectId: string;
  sccpBscE2eWallet: string;
  sccpSolanaE2eWallet: string;
  sccpTonE2eWallet: string;
  sccpTonConnectManifestUrl: string;
}

export interface IrohaBridge {
  getRuntimeConfig(): RuntimeConfigResponse;
  ping(config: { toriiUrl: string }): Promise<ToriiHealth>;
  getChainMetadata(config: {
    toriiUrl: string;
  }): Promise<ChainMetadataResponse>;
  inspectEndpoint(config: EndpointNetworkContext): Promise<EndpointInspection>;
  getSigningAlgorithms(config?: {
    toriiUrl: string;
  }): Promise<SigningAlgorithmOption[]>;
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
  }): AccountAddressView;
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
    domainId: string;
    metadata?: Record<string, unknown>;
    authorityAccountId: string;
    authorityPrivateKeyHex?: string;
    authoritySigningAlgorithm?: string;
  }): Promise<TransactionSubmissionResult>;
  transferAsset(input: {
    toriiUrl: string;
    chainId: string;
    assetDefinitionId: string;
    accountId: string;
    destinationAccountId?: string;
    networkPrefix: number;
    quantity: string;
    privateKeyHex?: string;
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
  }): Promise<TransactionSubmissionResult>;
  setIrohaConnectContext(input: IrohaConnectWalletContext): void;
  resetIrohaConnectBoundary(): void;
  prepareIrohaConnectSession(input: {
    context: IrohaConnectWalletContext;
    sid: string;
    appPublicKeyHex: string;
    relayToken: string;
    requestedChainId: string;
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
  }): Promise<ConfidentialAssetBalanceView>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
    force?: boolean;
  }): Promise<ConfidentialAssetBalanceView>;
  getConfidentialWalletState(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    privateKeyHex?: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceView>;
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
  }): Promise<TransactionSubmissionResult>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix?: number;
    assetDefinitionId?: string;
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
  getGovernanceUnlockStats(input: {
    toriiUrl: string;
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
  getGovernancePlainReferendumContract(input: {
    chainId: string;
    networkPrefix: number;
    genesisHash: string;
  }): Promise<GovernancePlainReferendumContractResult>;
  prepareGovernanceCitizenRegistration(
    input: GovernanceCitizenRegistrationPrepareInput,
  ): Promise<GovernancePreparedAction>;
  prepareGovernanceProposal(
    input: GovernanceProposalPrepareInput,
  ): Promise<GovernancePreparedAction>;
  prepareGovernancePlainBallot(
    input: GovernancePlainBallotPrepareInput,
  ): Promise<GovernancePreparedAction>;
  prepareGovernanceParliamentBallot(
    input: GovernanceParliamentBallotPrepareInput,
  ): Promise<GovernancePreparedAction>;
  prepareGovernanceEnact(
    input: GovernanceEnactPrepareInput,
  ): Promise<GovernancePreparedAction>;
  confirmGovernanceAction(
    input: GovernanceConfirmActionInput,
  ): Promise<GovernanceFinalizedAction>;
  getGovernanceLifecycle?(input: {
    toriiUrl: string;
    proposalId?: string | null;
    referendumId?: string | null;
  }): Promise<GovernanceLifecycleSnapshot>;
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
    chainId: string;
    accountId: string;
    networkPrefix: number;
    privateKeyHex?: string;
    exitClass: VpnExitClass;
  }): Promise<VpnStatus>;
  disconnectVpn(input?: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    networkPrefix: number;
    privateKeyHex?: string;
  }): Promise<VpnStatus>;
  repairVpn(): Promise<VpnStatus>;
  listVpnReceipts(input?: Partial<VpnAuthContext>): Promise<VpnReceipt[]>;
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
    onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
  ): Promise<AccountFaucetResponse>;
  cancelFaucetRequest(input: {
    requestId: string;
  }): Promise<{ canceled: boolean }>;
  createKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    assetDefinitionId: string;
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
    networkPrefix: number;
    assetDefinitionId: string;
    participantAccountId: string;
    privateKeyHex?: string;
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
    networkPrefix: number;
    assetDefinitionId: string;
    hostAccountId: string;
    privateKeyHex?: string;
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
  deploySoraCloudHf(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    repoId: string;
    revision?: string;
    modelName: string;
    serviceName: string;
    apartmentName?: string;
    storageClass: SoraCloudStorageClassView;
    leaseTermMs: number;
    leaseAssetDefinitionId: string;
    baseFeeNanos: string;
  }): Promise<SoraCloudHfDeployResponseView>;
  reconcileSoraCloudHfLaunch(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    transactionHash: string;
  }): Promise<SoraCloudHfDeployResponseView>;
  getSoraCloudHfStatus(input: {
    toriiUrl: string;
    repoId: string;
    revision?: string;
    storageClass: SoraCloudStorageClassView;
    leaseTermMs: number;
    accountId?: string;
  }): Promise<SoraCloudHfStatusResponseView>;
  getParameters(input: { toriiUrl: string }): Promise<Record<string, unknown>>;
  getSccpCapabilities(input: {
    toriiUrl: string;
  }): Promise<SccpCapabilitiesResponse>;
  getSccpProofManifests(input: {
    toriiUrl: string;
  }): Promise<SccpProofManifestSetResponse>;
  getSccpSoraOutboundMaterial(input: {
    toriiUrl: string;
    sourceProfile: string;
    routeId: string;
    assetKey: string;
    revision: number;
  }): Promise<SccpSoraOutboundMaterialResponse>;
  listSccpRecentMessages(
    input: SccpRecentMessagesInput,
  ): Promise<SccpRecentMessagesResponse>;
  getSccpMessageProofBundle(
    input: SccpMessageProofBundleInput,
  ): Promise<Record<string, unknown>>;
  getSccpMessageProofArtifact(
    input: SccpMessageProofInput,
  ): Promise<Record<string, unknown>>;
  getSccpMessageProofJob(
    input: SccpMessageProofInput,
  ): Promise<Record<string, unknown>>;
  proveBscSccpProof(
    input: SccpBscProofGenerateInput,
  ): Promise<Record<string, unknown>>;
  proveBscSccpSourceProof(
    input: SccpBscSourceProofGenerateInput,
  ): Promise<Record<string, unknown>>;
  rebuildSccpMessageBundleSourceProofWithDeployment(
    input: SccpSourceProofDeploymentRebuildInput,
  ): Promise<Record<string, unknown>>;
  buildTonSccpMessageBundleSourceProofWithDeployment(
    input: SccpSourceProofDeploymentRebuildInput,
  ): Promise<Record<string, unknown>>;
  submitSccpBridgeProof(
    input: SccpBridgeProofSubmitInput,
  ): Promise<Record<string, unknown>>;
  submitSccpBridgeMessage(
    input: SccpBridgeMessageSubmitInput,
  ): Promise<Record<string, unknown>>;
  waitForSccpTransactionCommit(input: {
    toriiUrl: string;
    hashHex: string;
  }): Promise<Record<string, unknown>>;
  deploySccpTairaInboundSettlementContract(input: {
    toriiUrl: string;
    accountId: string;
    contractAlias?: string | null;
    compiledCodeB64?: string | null;
    leaseExpiryMs?: number | string | null;
  }): Promise<Record<string, unknown> | null>;
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
  callSolanaRpc(input: SolanaRpcCallInput): Promise<unknown>;
  getSolanaBalance(input: SolanaAddressInput): Promise<string>;
  getSolanaTokenBalance(
    input: SolanaTokenBalanceInput,
  ): Promise<Record<string, unknown>>;
  prepareSolanaAssociatedTokenAccount(
    input: SolanaAssociatedTokenAccountInput,
  ): Promise<SolanaPreparedAssociatedTokenAccount>;
  getSolanaSignatureStatus(
    input: SolanaTransactionInput,
  ): Promise<Record<string, unknown> | null>;
  getSolanaTransaction(
    input: SolanaTransactionInput,
  ): Promise<Record<string, unknown> | null>;
  buildSolanaTransaction(input: SolanaBuildTransactionInput): Promise<string>;
  broadcastSolanaTransaction(input: SolanaBroadcastInput): Promise<string>;
  bondPublicLaneStake(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
    amount: string;
    privateKeyHex?: string;
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
    privateKeyHex?: string;
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
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  finalizePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    stakeAccountId: string;
    validator: string;
    requestId: string;
    privateKeyHex?: string;
  }): Promise<TransactionSubmissionResult>;
  claimPublicLaneRewards(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
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

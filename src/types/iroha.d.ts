export type ToriiHealth = ({ status: string } & Record<string, unknown>) | null;

export interface AccountAddressView {
  accountId: string;
  i105AccountId: string;
  i105DefaultAccountId: string;
  i105DefaultFullwidthAccountId?: string;
  publicKeyHex: string;
  accountIdWarning: string;
}

export interface AccountAssetsResponse {
  items: Array<{ asset_id: string; quantity: string }>;
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

export interface ExplorerAccountQrResponse {
  canonicalId: string;
  literal: string;
  networkPrefix: number;
  errorCorrection: string;
  modules: number;
  qrVersion: number;
  svg: string;
}

export type VpnExitClass = "standard" | "low-latency" | "high-security";
export type VpnReceiptSource = "torii" | "local-fallback";

export interface VpnAuthContext {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: string;
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
}

export type FaucetRequestPhase =
  | "requestingPuzzle"
  | "waitingForPuzzleRetry"
  | "solvingPuzzle"
  | "submittingClaim"
  | "claimAccepted";

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
  tokenApp: string | null;
  tokenWallet: string | null;
  appPublicKeyHex: string;
  appPrivateKeyHex: string;
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
  offerDescription: KaigiOfferDescription;
}

export interface KaigiMeetingSignalRecord {
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
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string };
  generateKaigiSignalKeyPair(): KaigiSignalKeyPair;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix?: number;
  }): AccountAddressView;
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string };
  registerAccount(input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    domainId: string;
    metadata?: Record<string, unknown>;
    authorityAccountId: string;
    authorityPrivateKeyHex: string;
  }): Promise<{ hash: string }>;
  transferAsset(input: {
    toriiUrl: string;
    chainId: string;
    assetDefinitionId: string;
    accountId: string;
    destinationAccountId: string;
    quantity: string;
    privateKeyHex: string;
    metadata?: Record<string, unknown>;
    shielded?: boolean;
  }): Promise<{ hash: string }>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountAssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
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
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
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
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
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
    privateKeyHex: string;
    exitClass: VpnExitClass;
  }): Promise<VpnStatus>;
  disconnectVpn(input: {
    toriiUrl: string;
    accountId: string;
    privateKeyHex: string;
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
    },
    onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
  ): Promise<AccountFaucetResponse>;
  createKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    hostAccountId: string;
    privateKeyHex: string;
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
  }): Promise<{ hash: string }>;
  getKaigiCall(input: {
    toriiUrl: string;
    callId: string;
    inviteSecretBase64Url: string;
  }): Promise<KaigiMeetingView>;
  joinKaigiMeeting(input: {
    toriiUrl: string;
    chainId: string;
    participantAccountId: string;
    privateKeyHex: string;
    callId: string;
    hostAccountId: string;
    hostKaigiPublicKeyBase64Url: string;
    participantId: string;
    participantName: string;
    walletIdentity?: string;
    roomId?: string;
    answerDescription: KaigiAnswerDescription;
  }): Promise<{ hash: string }>;
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
    privateKeyHex: string;
    callId: string;
    endedAtMs?: number;
  }): Promise<{ hash: string }>;
  createConnectPreview(input: {
    toriiUrl: string;
    chainId: string;
    node?: string | null;
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
  bondPublicLaneStake(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    amount: string;
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
  schedulePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    amount: string;
    requestId: string;
    releaseAtMs: number;
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
  finalizePublicLaneUnbond(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    requestId: string;
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
  claimPublicLaneRewards(input: {
    toriiUrl: string;
    chainId: string;
    stakeAccountId: string;
    validator: string;
    privateKeyHex: string;
  }): Promise<{ hash: string }>;
}

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

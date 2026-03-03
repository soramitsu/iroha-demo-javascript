export type ToriiHealth = ({ status: string } & Record<string, unknown>) | null;

export interface AccountAddressView {
  accountId: string;
  publicKeyHex: string;
  ih58: string;
  compressed: string;
  compressedWarning: string;
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

export type ToriiAddressFormat = "ih58" | "canonical" | "compressed";

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
  addressFormat: "ih58" | "compressed";
  networkPrefix: number;
  errorCorrection: string;
  modules: number;
  qrVersion: number;
  svg: string;
}

export interface AccountOnboardingResponse {
  account_id: string;
  tx_hash_hex: string;
  status: string;
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

export interface IrohaBridge {
  ping(config: { toriiUrl: string }): Promise<ToriiHealth>;
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string };
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
  }): Promise<{ hash: string }>;
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
  getExplorerMetrics(config: {
    toriiUrl: string;
  }): Promise<ExplorerMetricsResponse | null>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
    addressFormat?: ToriiAddressFormat;
  }): Promise<ExplorerAccountQrResponse>;
  listOfflineAllowances(input: {
    toriiUrl: string;
    controllerId: string;
    addressFormat?: ToriiAddressFormat;
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
  createConnectPreview(input: {
    toriiUrl: string;
    chainId: string;
    node?: string | null;
  }): Promise<ConnectPreview>;
  getSumeragiStatus(config: { toriiUrl: string }): Promise<NexusSumeragiStatus>;
  getNexusPublicLaneValidators(input: {
    toriiUrl: string;
    laneId: number;
    addressFormat?: ToriiAddressFormat;
  }): Promise<PublicLaneValidatorsResponseView>;
  getNexusPublicLaneStake(input: {
    toriiUrl: string;
    laneId: number;
    addressFormat?: ToriiAddressFormat;
    validator?: string;
  }): Promise<PublicLaneStakeResponseView>;
  getNexusPublicLaneRewards(input: {
    toriiUrl: string;
    laneId: number;
    account: string;
    addressFormat?: ToriiAddressFormat;
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

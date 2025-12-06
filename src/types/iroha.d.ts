export type ToriiHealth = Record<string, unknown> | null

export interface AccountAddressView {
  accountId: string
  publicKeyHex: string
  ih58: string
  compressed: string
  compressedWarning: string
}

export interface AccountAssetsResponse {
  items: Array<{ asset_id: string; quantity: string }>
  total: number
  cursor?: string | null
}

export interface AccountTransactionsResponse {
  items: Array<AccountTransactionItem>
  total: number
  cursor?: string | null
}

export interface AccountTransactionItem {
  entrypoint_hash: string
  result_ok: boolean
  authority?: string
  timestamp_ms?: number
  [key: string]: unknown
}

export type ToriiAddressFormat = 'ih58' | 'canonical' | 'compressed'

export interface OfflineAllowanceItem {
  certificate_id_hex: string
  controller_id: string
  controller_display: string
  asset_id: string
  registered_at_ms: number
  expires_at_ms: number
  policy_expires_at_ms: number
  refresh_at_ms: number | null
  verdict_id_hex: string | null
  attestation_nonce_hex: string | null
  remaining_amount: string
  deadline_kind?: string | null
  deadline_state?: string | null
  deadline_ms?: number | null
  deadline_ms_remaining?: number | null
  record: Record<string, unknown>
  integrity_metadata: {
    policy: string
    provisioned?: {
      inspector_public_key: string
      manifest_schema: string
      manifest_version: number | null
      max_manifest_age_ms: number | null
      manifest_digest_hex: string | null
    }
  } | null
}

export interface OfflineAllowanceResponse {
  items: OfflineAllowanceItem[]
  total: number
}

export interface ExplorerMetricsResponse {
  peers: number
  domains: number
  accounts: number
  assets: number
  transactionsAccepted: number
  transactionsRejected: number
  blockHeight: number
  blockCreatedAt: string | null
  finalizedBlockHeight: number
  averageCommitTimeMs: number | null
  averageBlockTimeMs: number | null
}

export interface ExplorerAccountQrResponse {
  canonicalId: string
  literal: string
  addressFormat: 'ih58' | 'compressed'
  networkPrefix: number
  errorCorrection: string
  modules: number
}

export interface AccountOnboardingResponse {
  account_id: string
  tx_hash_hex: string
  status: string
}

export interface ConnectPreview {
  sidHex: string
  sidBase64Url: string
  walletUri: string | null
  appUri: string | null
  tokenApp: string | null
  tokenWallet: string | null
  appPublicKeyHex: string
  appPrivateKeyHex: string
}

export interface IrohaBridge {
  ping(config: { toriiUrl: string }): Promise<ToriiHealth>
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string }
  deriveAccountAddress(input: {
    domain: string
    publicKeyHex: string
    networkPrefix?: number
  }): AccountAddressView
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string }
  registerAccount(input: {
    toriiUrl: string
    chainId: string
    accountId: string
    metadata?: Record<string, unknown>
    authorityAccountId: string
    authorityPrivateKeyHex: string
  }): Promise<{ hash: string }>
  transferAsset(input: {
    toriiUrl: string
    chainId: string
    assetDefinitionId: string
    accountId: string
    destinationAccountId: string
    quantity: string
    privateKeyHex: string
    metadata?: Record<string, unknown>
  }): Promise<{ hash: string }>
  fetchAccountAssets(input: {
    toriiUrl: string
    accountId: string
    limit?: number
    cursor?: string
  }): Promise<AccountAssetsResponse>
  fetchAccountTransactions(input: {
    toriiUrl: string
    accountId: string
    limit?: number
    cursor?: string
  }): Promise<AccountTransactionsResponse>
  getExplorerMetrics(config: { toriiUrl: string }): Promise<ExplorerMetricsResponse | null>
  getExplorerAccountQr(input: {
    toriiUrl: string
    accountId: string
  }): Promise<ExplorerAccountQrResponse>
  listOfflineAllowances(input: {
    toriiUrl: string
    controllerId: string
    addressFormat?: ToriiAddressFormat
    limit?: number
    offset?: number
    filter?: string | Record<string, unknown>
  }): Promise<OfflineAllowanceResponse>
  onboardAccount(input: {
    toriiUrl: string
    alias: string
    accountId: string
    identity?: Record<string, unknown>
  }): Promise<AccountOnboardingResponse>
  createConnectPreview(input: {
    toriiUrl: string
    chainId: string
    node?: string | null
  }): Promise<ConnectPreview>
}

declare global {
  interface Window {
    iroha: IrohaBridge
  }
}

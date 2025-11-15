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
  items: Array<Record<string, unknown>>
  total: number
  cursor?: string | null
}

export interface ExplorerMetricsResponse {
  transactionsAccepted?: number
  transactionsRejected?: number
  pendingBlocks?: number
  latestBlock?: Record<string, unknown>
  [key: string]: unknown
}

export interface ExplorerAccountQrResponse {
  account_id: string
  payload: string
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

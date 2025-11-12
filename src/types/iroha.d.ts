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
}

declare global {
  interface Window {
    iroha: IrohaBridge
  }
}

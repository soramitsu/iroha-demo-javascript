import { contextBridge } from 'electron'
import {
  AccountAddress,
  ToriiClient,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAccountId,
  bootstrapConnectPreviewSession
} from '@iroha/iroha-js'

type HexString = string

type ToriiConfig = {
  toriiUrl: string
}

type RegisterAccountInput = {
  toriiUrl: string
  chainId: string
  accountId: string
  metadata?: Record<string, unknown>
  authorityAccountId: string
  authorityPrivateKeyHex: HexString
}

type TransferAssetInput = {
  toriiUrl: string
  chainId: string
  assetDefinitionId: string
  accountId: string
  destinationAccountId: string
  quantity: string
  privateKeyHex: HexString
  metadata?: Record<string, unknown>
}

type ExplorerMetricsResponse = Awaited<ReturnType<ToriiClient['getExplorerMetrics']>>

type ExplorerAccountQrResponse = Awaited<ReturnType<ToriiClient['getExplorerAccountQr']>>

type AssetsResponse = Awaited<ReturnType<ToriiClient['listAccountAssets']>>

type TransactionsResponse = Awaited<ReturnType<ToriiClient['listAccountTransactions']>>

type OfflineAllowanceResponse = Awaited<ReturnType<ToriiClient['listOfflineAllowances']>>

type AccountOnboardingResponse = {
  account_id: string
  tx_hash_hex: string
  status: string
}

type ConnectPreviewResponse = {
  sidHex: string
  sidBase64Url: string
  walletUri: string | null
  appUri: string | null
  tokenApp: string | null
  tokenWallet: string | null
  appPublicKeyHex: string
  appPrivateKeyHex: string
}

type IrohaBridge = {
  ping(config: ToriiConfig): Promise<unknown | null>
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string }
  deriveAccountAddress(input: {
    domain: string
    publicKeyHex: string
    networkPrefix?: number
  }): {
    accountId: string
    publicKeyHex: string
    ih58: string
    compressed: string
    compressedWarning: string
  }
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string }
  registerAccount(input: RegisterAccountInput): Promise<{ hash: string }>
  transferAsset(input: TransferAssetInput): Promise<{ hash: string }>
  fetchAccountAssets(input: {
    toriiUrl: string
    accountId: string
    limit?: number
    cursor?: string
  }): Promise<AssetsResponse>
  fetchAccountTransactions(input: {
    toriiUrl: string
    accountId: string
    limit?: number
    cursor?: string
  }): Promise<TransactionsResponse>
  getExplorerMetrics(config: ToriiConfig): Promise<ExplorerMetricsResponse | null>
  getExplorerAccountQr(input: {
    toriiUrl: string
    accountId: string
  }): Promise<ExplorerAccountQrResponse>
  listOfflineAllowances(input: {
    toriiUrl: string
    controllerId: string
    addressFormat?: 'ih58' | 'canonical' | 'compressed'
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
  }): Promise<ConnectPreviewResponse>
}

const clientCache = new Map<string, ToriiClient>()

const getClient = (toriiUrlRaw: string) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw)
  const cached = clientCache.get(baseUrl)
  if (cached) {
    return cached
  }
  const client = new ToriiClient(baseUrl, {
    fetchImpl: (input, init) => fetch(input, init)
  })
  clientCache.set(baseUrl, client)
  return client
}

const normalizeBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, '')
  if (!trimmed.startsWith('http')) {
    throw new Error('Torii URL must include http or https scheme')
  }
  return trimmed
}

const stripHexPrefix = (hex: string) => hex.trim().replace(/^0x/i, '')

const toHex = (buffer: Buffer) => buffer.toString('hex')

const hexToBuffer = (hex: string, label: string) => {
  const normalized = stripHexPrefix(hex)
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`)
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must contain only hexadecimal characters`)
  }
  return Buffer.from(normalized, 'hex')
}

const accountSummaryFromPublicKey = (
  domain: string,
  publicKeyHex: string,
  networkPrefix = 42
) => {
  const publicKey = hexToBuffer(publicKeyHex, 'publicKeyHex')
  const address = AccountAddress.fromAccount({ domain, publicKey })
  const canonicalHex = address.canonicalHex().replace(/^0x/i, '').toUpperCase()
  const formats = address.displayFormats(networkPrefix)
  return {
    accountId: `${canonicalHex}@${domain}`,
    publicKeyHex: canonicalHex,
    ih58: formats.ih58,
    compressed: formats.compressed,
    compressedWarning: formats.compressedWarning
  }
}

const api: IrohaBridge = {
  async ping(config) {
    const client = getClient(config.toriiUrl)
    return client.getHealth().catch(() => null)
  },
  generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPair()
    return {
      publicKeyHex: toHex(publicKey),
      privateKeyHex: toHex(privateKey)
    }
  },
  deriveAccountAddress({ domain, publicKeyHex, networkPrefix }) {
    return accountSummaryFromPublicKey(domain, publicKeyHex, networkPrefix)
  },
  derivePublicKey(privateKeyHex) {
    const publicKey = publicKeyFromPrivate(hexToBuffer(privateKeyHex, 'privateKeyHex'))
    return { publicKeyHex: toHex(publicKey) }
  },
  async registerAccount(input) {
    const client = getClient(input.toriiUrl)
    const tx = buildRegisterAccountAndTransferTransaction({
      chainId: input.chainId,
      authority: normalizeAccountId(input.authorityAccountId, 'authorityAccountId'),
      account: {
        accountId: normalizeAccountId(input.accountId, 'accountId'),
        metadata: input.metadata ?? {}
      },
      privateKey: hexToBuffer(input.authorityPrivateKeyHex, 'authorityPrivateKeyHex')
    })
    const submission = await submitSignedTransaction(client, tx.signedTransaction, {
      waitForCommit: true
    })
    return { hash: submission.hash }
  },
  async transferAsset(input) {
    const client = getClient(input.toriiUrl)
    const sourceAssetId = `${input.assetDefinitionId}##${normalizeAccountId(
      input.accountId,
      'accountId'
    )}`
    const tx = buildTransferAssetTransaction({
      chainId: input.chainId,
      authority: normalizeAccountId(input.accountId, 'accountId'),
      sourceAssetId,
      quantity: input.quantity,
      destinationAccountId: normalizeAccountId(
        input.destinationAccountId,
        'destinationAccountId'
      ),
      metadata: input.metadata ?? null,
      privateKey: hexToBuffer(input.privateKeyHex, 'privateKeyHex')
    })
    const submission = await submitSignedTransaction(client, tx.signedTransaction, {
      waitForCommit: true
    })
    return { hash: submission.hash }
  },
  fetchAccountAssets({ toriiUrl, accountId, limit = 50, cursor }) {
    const client = getClient(toriiUrl)
    return client.listAccountAssets(normalizeAccountId(accountId, 'accountId'), {
      limit,
      cursor
    })
  },
  fetchAccountTransactions({ toriiUrl, accountId, limit = 20, cursor }) {
    const client = getClient(toriiUrl)
    return client.listAccountTransactions(normalizeAccountId(accountId, 'accountId'), {
      limit,
      cursor
    })
  },
  getExplorerMetrics(config) {
    const client = getClient(config.toriiUrl)
    return client.getExplorerMetrics().catch(() => null)
  },
  getExplorerAccountQr({ toriiUrl, accountId }) {
    const client = getClient(toriiUrl)
    return client.getExplorerAccountQr(normalizeAccountId(accountId, 'accountId'))
  },
  listOfflineAllowances({ toriiUrl, controllerId, addressFormat = 'ih58', limit, offset, filter }) {
    const client = getClient(toriiUrl)
    return client.listOfflineAllowances({
      controllerId: normalizeAccountId(controllerId, 'controllerId'),
      addressFormat,
      limit,
      offset,
      filter
    })
  },
  async onboardAccount({ toriiUrl, alias, accountId, identity }) {
    const baseUrl = normalizeBaseUrl(toriiUrl)
    const response = await fetch(`${baseUrl}/v1/accounts/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        alias,
        account_id: accountId,
        identity: identity ?? undefined
      })
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        text || `Onboarding failed with status ${response.status} (${response.statusText})`
      )
    }
    return (await response.json()) as AccountOnboardingResponse
  },
  async createConnectPreview({ toriiUrl, chainId, node }) {
    const client = getClient(toriiUrl)
    const baseUrl = new URL(normalizeBaseUrl(toriiUrl))
    const nodeHint = node ?? baseUrl.host
    const { preview, session, tokens } = await bootstrapConnectPreviewSession(client, {
      chainId,
      node: nodeHint
    })
    return {
      sidHex: preview.sidHex,
      sidBase64Url: preview.sidBase64Url,
      walletUri: session?.wallet_uri ?? preview.walletUri ?? null,
      appUri: session?.app_uri ?? preview.appUri ?? null,
      tokenApp: tokens?.app ?? null,
      tokenWallet: tokens?.wallet ?? null,
      appPublicKeyHex: toHex(Buffer.from(preview.appKeyPair.publicKey)),
      appPrivateKeyHex: toHex(Buffer.from(preview.appKeyPair.privateKey))
    }
  }
}

contextBridge.exposeInMainWorld('iroha', api)

declare global {
  interface Window {
    iroha: IrohaBridge
  }
}

import { contextBridge } from 'electron'
import {
  AccountAddress,
  ToriiClient,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAccountId
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

type UaidBindingsResponse = Awaited<ReturnType<ToriiClient['getUaidBindings']>>
type UaidManifestsResponse = Awaited<ReturnType<ToriiClient['getUaidManifests']>>

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
  fetchUaidOverview(input: {
    toriiUrl: string
    uaid: string
  }): Promise<{ bindings: UaidBindingsResponse; manifests: UaidManifestsResponse }>
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
  async fetchUaidOverview({ toriiUrl, uaid }) {
    const client = getClient(toriiUrl)
    const [bindings, manifests] = await Promise.all([
      client.getUaidBindings(uaid),
      client.getUaidManifests(uaid)
    ])
    return { bindings, manifests }
  }
}

contextBridge.exposeInMainWorld('iroha', api)

declare global {
  interface Window {
    iroha: IrohaBridge
  }
}

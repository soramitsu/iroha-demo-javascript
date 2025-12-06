import type {
  AccountAddressView,
  AccountAssetsResponse,
  AccountOnboardingResponse,
  AccountTransactionsResponse,
  OfflineAllowanceResponse,
  ConnectPreview,
  ExplorerAccountQrResponse,
  ExplorerMetricsResponse,
  IrohaBridge,
  ToriiHealth
} from '@/types/iroha'

const bridge = (): IrohaBridge => {
  if (!window.iroha) {
    throw new Error('Iroha bridge is unavailable. Ensure preload script loaded correctly.')
  }
  return window.iroha
}

export const pingTorii = (toriiUrl: string): Promise<ToriiHealth> =>
  bridge().ping({ toriiUrl })

export const generateKeyPair = () => bridge().generateKeyPair()

export const deriveAccountAddress = (params: {
  domain: string
  publicKeyHex: string
  networkPrefix?: number
}): AccountAddressView => bridge().deriveAccountAddress(params)

export const derivePublicKey = (privateKeyHex: string) =>
  bridge().derivePublicKey(privateKeyHex)

export const registerAccount = (input: Parameters<IrohaBridge['registerAccount']>[0]) =>
  bridge().registerAccount(input)

export const transferAsset = (input: Parameters<IrohaBridge['transferAsset']>[0]) =>
  bridge().transferAsset(input)

export const fetchAccountAssets = (input: {
  toriiUrl: string
  accountId: string
  limit?: number
  cursor?: string
}): Promise<AccountAssetsResponse> => bridge().fetchAccountAssets(input)

export const fetchAccountTransactions = (input: {
  toriiUrl: string
  accountId: string
  limit?: number
  cursor?: string
}): Promise<AccountTransactionsResponse> => bridge().fetchAccountTransactions(input)

export const getExplorerMetrics = (toriiUrl: string): Promise<ExplorerMetricsResponse | null> =>
  bridge().getExplorerMetrics({ toriiUrl })

export const getExplorerAccountQr = (input: {
  toriiUrl: string
  accountId: string
}): Promise<ExplorerAccountQrResponse> => bridge().getExplorerAccountQr(input)

export const listOfflineAllowances = (input: {
  toriiUrl: string
  controllerId: string
  addressFormat?: 'ih58' | 'canonical' | 'compressed'
  limit?: number
  offset?: number
  filter?: string | Record<string, unknown>
}): Promise<OfflineAllowanceResponse> => bridge().listOfflineAllowances(input)

export const onboardAccount = (input: {
  toriiUrl: string
  alias: string
  accountId: string
  identity?: Record<string, unknown>
}): Promise<AccountOnboardingResponse> => bridge().onboardAccount(input)

export const createConnectPreview = (input: {
  toriiUrl: string
  chainId: string
  node?: string | null
}): Promise<ConnectPreview> => bridge().createConnectPreview(input)

import { contextBridge } from "electron";
import {
  AccountAddress,
  ToriiClient,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAccountId,
  normalizeAssetId,
  bootstrapConnectPreviewSession,
  type ToriiAddressFormat,
} from "@iroha/iroha-js";
import {
  normalizeBaseUrl,
  normalizeExplorerAccountQrPayload,
  sanitizeFetchInit,
  type ExplorerAccountQrResponse,
} from "./preload-utils";

type HexString = string;

type ToriiConfig = {
  toriiUrl: string;
};

type HealthResponse = Awaited<ReturnType<ToriiClient["getHealth"]>>;
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  metadata?: Record<string, unknown>;
  authorityAccountId: string;
  authorityPrivateKeyHex: HexString;
};

type TransferAssetInput = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  accountId: string;
  destinationAccountId: string;
  quantity: string;
  privateKeyHex: HexString;
  metadata?: Record<string, unknown>;
};

type ExplorerMetricsResponse = Awaited<
  ReturnType<ToriiClient["getExplorerMetrics"]>
>;

type AssetsResponse = Awaited<ReturnType<ToriiClient["listAccountAssets"]>>;

type TransactionsResponse = Awaited<
  ReturnType<ToriiClient["listAccountTransactions"]>
>;

type OfflineAllowanceResponse = Awaited<
  ReturnType<ToriiClient["listOfflineAllowances"]>
>;

type AccountOnboardingResponse = {
  account_id: string;
  tx_hash_hex: string;
  status: string;
};

type ConnectPreviewResponse = {
  sidHex: string;
  sidBase64Url: string;
  walletUri: string | null;
  appUri: string | null;
  tokenApp: string | null;
  tokenWallet: string | null;
  appPublicKeyHex: string;
  appPrivateKeyHex: string;
};

type IrohaBridge = {
  ping(config: ToriiConfig): Promise<HealthResponse>;
  generateKeyPair(): { publicKeyHex: string; privateKeyHex: string };
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix?: number;
  }): {
    accountId: string;
    publicKeyHex: string;
    ih58: string;
    compressed: string;
    compressedWarning: string;
  };
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string };
  registerAccount(input: RegisterAccountInput): Promise<{ hash: string }>;
  transferAsset(input: TransferAssetInput): Promise<{ hash: string }>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionsResponse>;
  getExplorerMetrics(
    config: ToriiConfig,
  ): Promise<ExplorerMetricsResponse | null>;
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
  }): Promise<ConnectPreviewResponse>;
};

const clientCache = new Map<string, ToriiClient>();

const getClient = (toriiUrlRaw: string) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const cached = clientCache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const client = new ToriiClient(baseUrl, {
    fetchImpl: (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => fetch(input, sanitizeFetchInit(init)),
  });
  clientCache.set(baseUrl, client);
  return client;
};

const stripHexPrefix = (hex: string) => hex.trim().replace(/^0x/i, "");

const toHex = (buffer: Buffer) => buffer.toString("hex");

const hexToBuffer = (hex: string, label: string) => {
  const normalized = stripHexPrefix(hex);
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must contain only hexadecimal characters`);
  }
  return Buffer.from(normalized, "hex");
};

const accountSummaryFromPublicKey = (
  domain: string,
  publicKeyHex: string,
  networkPrefix = 42,
) => {
  const publicKey = hexToBuffer(publicKeyHex, "publicKeyHex");
  const rawPublicKeyHex = toHex(publicKey).toUpperCase();
  try {
    const address = AccountAddress.fromAccount({ domain, publicKey });
    const canonicalAddressHex = address
      .canonicalHex()
      .replace(/^0x/i, "")
      .toUpperCase();
    const formats = address.displayFormats(networkPrefix);
    return {
      accountId: `${canonicalAddressHex}@${domain}`,
      publicKeyHex: canonicalAddressHex,
      ih58: formats.ih58,
      compressed: formats.compressed,
      compressedWarning: formats.compressedWarning,
    };
  } catch (error) {
    if (!String(error).includes("Digest method not supported")) {
      throw error;
    }
  }

  return {
    accountId: `ed0120${rawPublicKeyHex}@${domain}`,
    publicKeyHex: `ed0120${rawPublicKeyHex}`,
    ih58: "",
    compressed: "",
    compressedWarning: "Address formatting unavailable in this runtime.",
  };
};

const api: IrohaBridge = {
  async ping(config) {
    const client = getClient(config.toriiUrl);
    return client.getHealth().catch(() => null);
  },
  generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPair();
    return {
      publicKeyHex: toHex(publicKey),
      privateKeyHex: toHex(privateKey),
    };
  },
  deriveAccountAddress({ domain, publicKeyHex, networkPrefix }) {
    return accountSummaryFromPublicKey(domain, publicKeyHex, networkPrefix);
  },
  derivePublicKey(privateKeyHex) {
    const publicKey = publicKeyFromPrivate(
      hexToBuffer(privateKeyHex, "privateKeyHex"),
    );
    return { publicKeyHex: toHex(publicKey) };
  },
  async registerAccount(input) {
    const client = getClient(input.toriiUrl);
    const tx = buildRegisterAccountAndTransferTransaction({
      chainId: input.chainId,
      authority: normalizeAccountId(
        input.authorityAccountId,
        "authorityAccountId",
      ),
      account: {
        accountId: normalizeAccountId(input.accountId, "accountId"),
        metadata: input.metadata ?? {},
      },
      privateKey: hexToBuffer(
        input.authorityPrivateKeyHex,
        "authorityPrivateKeyHex",
      ),
    });
    const submission = await submitSignedTransaction(
      client,
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
    );
    return { hash: submission.hash };
  },
  async transferAsset(input) {
    const client = getClient(input.toriiUrl);
    const sourceAssetId = normalizeAssetId(
      `${input.assetDefinitionId}##${normalizeAccountId(
        input.accountId,
        "accountId",
      )}`,
      "sourceAssetId",
    );
    const tx = buildTransferAssetTransaction({
      chainId: input.chainId,
      authority: normalizeAccountId(input.accountId, "accountId"),
      sourceAssetId,
      quantity: input.quantity,
      destinationAccountId: normalizeAccountId(
        input.destinationAccountId,
        "destinationAccountId",
      ),
      metadata: input.metadata ?? null,
      privateKey: hexToBuffer(input.privateKeyHex, "privateKeyHex"),
    });
    const submission = await submitSignedTransaction(
      client,
      tx.signedTransaction,
      {
        waitForCommit: true,
      },
    );
    return { hash: submission.hash };
  },
  fetchAccountAssets({ toriiUrl, accountId, limit = 50, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountAssets(
      normalizeAccountId(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
  },
  fetchAccountTransactions({ toriiUrl, accountId, limit = 20, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountTransactions(
      normalizeAccountId(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
  },
  getExplorerMetrics(config) {
    const client = getClient(config.toriiUrl);
    return client.getExplorerMetrics().catch(() => null);
  },
  async getExplorerAccountQr({ toriiUrl, accountId, addressFormat }) {
    const client = getClient(toriiUrl);
    const fetchFallback = async () => {
      const baseUrl = normalizeBaseUrl(toriiUrl);
      const params = new URLSearchParams();
      if (addressFormat) {
        params.set("address_format", addressFormat);
      }
      const endpoint = `${baseUrl}/v1/explorer/accounts/${encodeURIComponent(accountId)}/qr${
        params.size ? `?${params.toString()}` : ""
      }`;
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          detail ||
            `Explorer QR request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeExplorerAccountQrPayload(payload);
    };

    try {
      return await client.getExplorerAccountQr(
        normalizeAccountId(accountId, "accountId"),
        {
          addressFormat,
        },
      );
    } catch (error) {
      if (!String(error).includes("Digest method not supported")) {
        throw error;
      }
      return fetchFallback();
    }
  },
  listOfflineAllowances({
    toriiUrl,
    controllerId,
    addressFormat = "ih58",
    limit,
    offset,
    filter,
    certificateExpiresBeforeMs,
    certificateExpiresAfterMs,
    policyExpiresBeforeMs,
    policyExpiresAfterMs,
    refreshBeforeMs,
    refreshAfterMs,
    verdictIdHex,
    attestationNonceHex,
    requireVerdict,
    onlyMissingVerdict,
    includeExpired,
  }) {
    const client = getClient(toriiUrl);
    return client.listOfflineAllowances({
      controllerId: normalizeAccountId(controllerId, "controllerId"),
      addressFormat,
      limit,
      offset,
      filter,
      certificateExpiresBeforeMs,
      certificateExpiresAfterMs,
      policyExpiresBeforeMs,
      policyExpiresAfterMs,
      refreshBeforeMs,
      refreshAfterMs,
      verdictIdHex,
      attestationNonceHex,
      requireVerdict,
      onlyMissingVerdict,
      includeExpired,
    });
  },
  async onboardAccount({ toriiUrl, alias, accountId, identity }) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const response = await fetch(`${baseUrl}/v1/accounts/onboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        alias,
        account_id: accountId,
        identity: identity ?? undefined,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        text ||
          `Onboarding failed with status ${response.status} (${response.statusText})`,
      );
    }
    return (await response.json()) as AccountOnboardingResponse;
  },
  async createConnectPreview({ toriiUrl, chainId, node }) {
    const client = getClient(toriiUrl);
    const baseUrl = new URL(normalizeBaseUrl(toriiUrl));
    const nodeHint = node ?? baseUrl.host;
    const { preview, session, tokens } = await bootstrapConnectPreviewSession(
      client,
      {
        chainId,
        node: nodeHint,
      },
    );
    return {
      sidHex: toHex(Buffer.from(preview.sidBytes)),
      sidBase64Url: preview.sidBase64Url,
      walletUri: session?.wallet_uri ?? preview.walletUri ?? null,
      appUri: session?.app_uri ?? preview.appUri ?? null,
      tokenApp: tokens?.app ?? null,
      tokenWallet: tokens?.wallet ?? null,
      appPublicKeyHex: toHex(Buffer.from(preview.appKeyPair.publicKey)),
      appPrivateKeyHex: toHex(Buffer.from(preview.appKeyPair.privateKey)),
    };
  },
};

contextBridge.exposeInMainWorld("iroha", api);

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

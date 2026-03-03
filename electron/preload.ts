import { contextBridge } from "electron";
import {
  AccountAddress,
  ToriiClient,
  buildTransaction,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAccountId,
  normalizeAssetId,
  bootstrapConnectPreviewSession,
  type ToriiAddressFormat,
  type ToriiSumeragiStatus,
} from "@iroha/iroha-js";
import {
  normalizeBaseUrl,
  normalizeExplorerAccountQrPayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readNexusUnbondingDelayMs,
  sanitizeFetchInit,
  type ExplorerAccountQrResponse,
  type PublicLaneRewardsResponseView,
  type PublicLaneStakeResponseView,
  type PublicLaneValidatorsResponseView,
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

type NexusStakingPolicyResponse = {
  unbondingDelayMs: number;
};

type NexusPublicLaneBaseInput = {
  toriiUrl: string;
  laneId: number;
  addressFormat?: ToriiAddressFormat;
};

type NexusPublicLaneStakeInput = NexusPublicLaneBaseInput & {
  validator?: string;
};

type NexusPublicLaneRewardsInput = NexusPublicLaneBaseInput & {
  account: string;
  assetId?: string;
  uptoEpoch?: number;
};

type BondPublicLaneStakeInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  amount: string;
  privateKeyHex: HexString;
};

type SchedulePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  amount: string;
  requestId: string;
  releaseAtMs: number;
  privateKeyHex: HexString;
};

type FinalizePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  requestId: string;
  privateKeyHex: HexString;
};

type ClaimPublicLaneRewardsInput = {
  toriiUrl: string;
  chainId: string;
  stakeAccountId: string;
  validator: string;
  privateKeyHex: HexString;
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
  getSumeragiStatus(config: ToriiConfig): Promise<ToriiSumeragiStatus>;
  getNexusPublicLaneValidators(
    input: NexusPublicLaneBaseInput,
  ): Promise<PublicLaneValidatorsResponseView>;
  getNexusPublicLaneStake(
    input: NexusPublicLaneStakeInput,
  ): Promise<PublicLaneStakeResponseView>;
  getNexusPublicLaneRewards(
    input: NexusPublicLaneRewardsInput,
  ): Promise<PublicLaneRewardsResponseView>;
  getNexusStakingPolicy(
    config: ToriiConfig,
  ): Promise<NexusStakingPolicyResponse>;
  bondPublicLaneStake(
    input: BondPublicLaneStakeInput,
  ): Promise<{ hash: string }>;
  schedulePublicLaneUnbond(
    input: SchedulePublicLaneUnbondInput,
  ): Promise<{ hash: string }>;
  finalizePublicLaneUnbond(
    input: FinalizePublicLaneUnbondInput,
  ): Promise<{ hash: string }>;
  claimPublicLaneRewards(
    input: ClaimPublicLaneRewardsInput,
  ): Promise<{ hash: string }>;
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

const normalizeLaneId = (laneId: number) => {
  if (!Number.isInteger(laneId) || laneId < 0) {
    throw new Error("laneId must be a non-negative integer.");
  }
  return laneId;
};

const normalizePositiveEpoch = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
};

const normalizeAmount = (value: string, label: string) => {
  const amount = value.trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`${label} must be a numeric string.`);
  }
  if (/^0+(\.0+)?$/.test(amount)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
};

const normalizeRequestId = (value: string) => {
  const requestId = value.trim();
  if (!requestId) {
    throw new Error("requestId must be a non-empty string.");
  }
  return requestId;
};

const normalizeReleaseAtMs = (value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("releaseAtMs must be a non-negative integer.");
  }
  return value;
};

const ensureObjectResponse = (
  payload: unknown,
  label: string,
): Record<string, unknown> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} response must be a JSON object.`);
  }
  return payload as Record<string, unknown>;
};

const fetchJson = async (
  endpoint: string,
  label: string,
): Promise<Record<string, unknown>> => {
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
        `${label} request failed with status ${response.status} (${response.statusText})`,
    );
  }
  const payload = (await response.json()) as unknown;
  return ensureObjectResponse(payload, label);
};

const buildNexusEndpoint = (
  toriiUrlRaw: string,
  path: string,
  query?: Record<string, string | number | undefined>,
) => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const encoded = String(value).trim();
      if (!encoded) continue;
      params.set(key, encoded);
    }
  }
  return `${baseUrl}${path}${params.size ? `?${params.toString()}` : ""}`;
};

const submitInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authorityAccountId: string;
  privateKeyHex: string;
  instruction: Record<string, unknown>;
}) => {
  const chainId = input.chainId.trim();
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  const authority = normalizeAccountId(
    input.authorityAccountId,
    "stakeAccountId",
  );
  const tx = buildTransaction({
    chainId,
    authority,
    instructions: [input.instruction],
    privateKey: hexToBuffer(input.privateKeyHex, "privateKeyHex"),
  });
  const submission = await submitSignedTransaction(
    getClient(input.toriiUrl),
    tx.signedTransaction,
    {
      waitForCommit: true,
    },
  );
  return { hash: submission.hash };
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
      accountId: `0x${canonicalAddressHex}@${domain}`,
      publicKeyHex: rawPublicKeyHex,
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
    publicKeyHex: rawPublicKeyHex,
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
      const contentType = response.headers.get("content-type") ?? "";
      let detail = "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (payload && typeof payload === "object") {
          detail = String(
            payload.detail ?? payload.message ?? payload.error ?? "",
          ).trim();
        }
      } else {
        const text = await response.text().catch(() => "");
        // Filter binary-like responses to avoid leaking unreadable bytes to the UI.
        const hasControlChars = Array.from(text).some((character) => {
          const code = character.charCodeAt(0);
          return (code >= 0 && code <= 8) || (code >= 14 && code <= 31);
        });
        if (!hasControlChars) {
          detail = text.trim();
        }
      }
      throw new Error(
        detail
          ? `Onboarding failed with status ${response.status} (${response.statusText}): ${detail}`
          : `Onboarding failed with status ${response.status} (${response.statusText})`,
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
  getSumeragiStatus(config) {
    const client = getClient(config.toriiUrl);
    return client.getSumeragiStatusTyped();
  },
  async getNexusPublicLaneValidators({ toriiUrl, laneId, addressFormat }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/validators`,
      {
        address_format: addressFormat,
      },
    );
    const payload = await fetchJson(endpoint, "Public lane validators");
    return normalizePublicLaneValidatorsPayload(payload);
  },
  async getNexusPublicLaneStake({
    toriiUrl,
    laneId,
    addressFormat,
    validator,
  }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/stake`,
      {
        address_format: addressFormat,
        validator: validator
          ? normalizeAccountId(validator, "validator")
          : undefined,
      },
    );
    const payload = await fetchJson(endpoint, "Public lane stake");
    return normalizePublicLaneStakePayload(payload);
  },
  async getNexusPublicLaneRewards({
    toriiUrl,
    laneId,
    addressFormat,
    account,
    assetId,
    uptoEpoch,
  }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/rewards/pending`,
      {
        address_format: addressFormat,
        account: normalizeAccountId(account, "account"),
        asset_id: assetId,
        upto_epoch:
          uptoEpoch === undefined
            ? undefined
            : normalizePositiveEpoch(uptoEpoch, "uptoEpoch"),
      },
    );
    const payload = await fetchJson(endpoint, "Public lane rewards");
    return normalizePublicLaneRewardsPayload(payload);
  },
  async getNexusStakingPolicy(config) {
    const client = getClient(config.toriiUrl);
    const payload = await client.getConfiguration();
    const configuration = ensureObjectResponse(payload, "Configuration");
    return {
      unbondingDelayMs: readNexusUnbondingDelayMs(configuration),
    };
  },
  bondPublicLaneStake({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    amount,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeAccountId(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        BondPublicLaneStake: {
          stake_account: normalizedStakeAccount,
          validator: normalizeAccountId(validator, "validator"),
          amount: normalizeAmount(amount, "amount"),
        },
      },
    });
  },
  schedulePublicLaneUnbond({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    amount,
    requestId,
    releaseAtMs,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeAccountId(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        SchedulePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeAccountId(validator, "validator"),
          amount: normalizeAmount(amount, "amount"),
          request_id: normalizeRequestId(requestId),
          release_at_ms: normalizeReleaseAtMs(releaseAtMs),
        },
      },
    });
  },
  finalizePublicLaneUnbond({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    requestId,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeAccountId(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        FinalizePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeAccountId(validator, "validator"),
          request_id: normalizeRequestId(requestId),
        },
      },
    });
  },
  claimPublicLaneRewards({
    toriiUrl,
    chainId,
    stakeAccountId,
    validator,
    privateKeyHex,
  }) {
    const normalizedStakeAccount = normalizeAccountId(
      stakeAccountId,
      "stakeAccountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedStakeAccount,
      privateKeyHex,
      instruction: {
        ClaimPublicLaneRewards: {
          stake_account: normalizedStakeAccount,
          validator: normalizeAccountId(validator, "validator"),
        },
      },
    });
  },
};

contextBridge.exposeInMainWorld("iroha", api);

declare global {
  interface Window {
    iroha: IrohaBridge;
  }
}

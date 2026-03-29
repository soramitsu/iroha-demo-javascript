import { contextBridge, ipcRenderer } from "electron";
import { randomBytes } from "crypto";
import {
  ToriiClient,
  buildShieldTransaction,
  buildTransaction,
  buildRegisterAccountAndTransferTransaction,
  buildTransferAssetTransaction,
  generateKeyPair,
  publicKeyFromPrivate,
  submitSignedTransaction,
  normalizeAssetId,
  type ToriiSumeragiStatus,
} from "@iroha/iroha-js";
import {
  confidentialModeSupportsShield,
  formatOnboardingError,
  isPositiveWholeAmount,
  normalizeAccountAssetListPayload,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  normalizeExplorerAccountQrPayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readApiErrorDetail,
  readNexusUnbondingDelayMs,
  type ConfidentialAssetPolicyView,
  type ExplorerAccountQrResponse,
  type PublicLaneRewardsResponseView,
  type PublicLaneStakeResponseView,
  type PublicLaneValidatorsResponseView,
} from "./preload-utils";
import { nodeFetch } from "./nodeFetch";
import {
  requestFaucetFundsWithPuzzle,
  type AccountFaucetResponse,
  type FaucetRequestProgress,
} from "./faucetApi";
import { bootstrapPortableConnectPreviewSession } from "./connectPreview";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
  normalizeCompatAccountIdLiteral,
} from "./accountAddress";

type HexString = string;

type ToriiConfig = {
  toriiUrl: string;
};

type HealthResponse = Awaited<ReturnType<ToriiClient["getHealth"]>>;
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  domainId: string;
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
  shielded?: boolean;
};

type ExplorerMetricsResponse = Awaited<
  ReturnType<ToriiClient["getExplorerMetrics"]>
>;

type VpnAvailabilityResponse = {
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
};

type VpnProfileResponse = Awaited<ReturnType<ToriiClient["getVpnProfile"]>>;

type VpnStatusResponse = {
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
  exitClass: "standard" | "low-latency" | "high-security" | null;
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
  lastReceipt: VpnReceiptResponse | null;
};

type VpnReceiptResponse = {
  sessionId: string;
  accountId: string;
  exitClass: "standard" | "low-latency" | "high-security";
  relayEndpoint: string;
  meterFamily: string;
  connectedAtMs: number;
  disconnectedAtMs: number;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  status: string;
  receiptSource: "torii" | "local-fallback";
};

type AssetsResponse = Awaited<ReturnType<ToriiClient["listAccountAssets"]>>;

type TransactionsResponse = Awaited<
  ReturnType<ToriiClient["listAccountTransactions"]>
>;

type OfflineAllowanceResponse = Awaited<
  ReturnType<ToriiClient["listOfflineAllowances"]>
>;

type AccountPermissionsResponse = Awaited<
  ReturnType<ToriiClient["listAccountPermissions"]>
>;

type GovernanceProposalResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceProposalTyped"]>
>;

type GovernanceReferendumResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceReferendumTyped"]>
>;

type GovernanceTallyResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceTallyTyped"]>
>;

type GovernanceLocksResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceLocksTyped"]>
>;

type GovernanceCouncilResponse = Awaited<
  ReturnType<ToriiClient["getGovernanceCouncilCurrent"]>
>;

type GovernanceDraftResponse = Awaited<
  ReturnType<ToriiClient["governanceFinalizeReferendumTyped"]>
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

type FaucetStatusCallback = (
  progress: FaucetRequestProgress,
) => void | Promise<void>;

type NexusPublicLaneBaseInput = {
  toriiUrl: string;
  laneId: number;
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

type AccountPermissionsInput = {
  toriiUrl: string;
  accountId: string;
  limit?: number;
  offset?: number;
};

type VpnAvailabilityInput = {
  toriiUrl: string;
};

type VpnConnectInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: HexString;
  exitClass: "standard" | "low-latency" | "high-security";
};

type VpnDisconnectInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: HexString;
};

type VpnStatusInput = Partial<VpnDisconnectInput>;

type RegisterCitizenInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  amount: string;
  privateKeyHex: HexString;
};

type GovernanceLookupInput = {
  toriiUrl: string;
  proposalId: string;
};

type GovernanceReferendumLookupInput = {
  toriiUrl: string;
  referendumId: string;
};

type GovernancePlainBallotInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  referendumId: string;
  amount: string;
  durationBlocks: number;
  direction: "Aye" | "Nay" | "Abstain";
  privateKeyHex: HexString;
};

type GovernanceFinalizeInput = {
  toriiUrl: string;
  referendumId: string;
  proposalId: string;
};

type GovernanceEnactInput = {
  toriiUrl: string;
  proposalId: string;
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
    i105AccountId: string;
    i105DefaultAccountId: string;
    i105DefaultFullwidthAccountId?: string;
    publicKeyHex: string;
    accountIdWarning: string;
  };
  derivePublicKey(privateKeyHex: string): { publicKeyHex: string };
  registerAccount(input: RegisterAccountInput): Promise<{ hash: string }>;
  transferAsset(input: TransferAssetInput): Promise<{ hash: string }>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
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
  listAccountPermissions(
    input: AccountPermissionsInput,
  ): Promise<AccountPermissionsResponse>;
  registerCitizen(input: RegisterCitizenInput): Promise<{ hash: string }>;
  getGovernanceProposal(
    input: GovernanceLookupInput,
  ): Promise<GovernanceProposalResponse>;
  getGovernanceReferendum(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceReferendumResponse>;
  getGovernanceTally(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceTallyResponse>;
  getGovernanceLocks(
    input: GovernanceReferendumLookupInput,
  ): Promise<GovernanceLocksResponse>;
  getGovernanceCouncilCurrent(
    config: ToriiConfig,
  ): Promise<GovernanceCouncilResponse>;
  submitGovernancePlainBallot(
    input: GovernancePlainBallotInput,
  ): Promise<{ hash: string }>;
  finalizeGovernanceReferendum(
    input: GovernanceFinalizeInput,
  ): Promise<GovernanceDraftResponse>;
  enactGovernanceProposal(
    input: GovernanceEnactInput,
  ): Promise<GovernanceDraftResponse>;
  getExplorerMetrics(
    config: ToriiConfig,
  ): Promise<ExplorerMetricsResponse | null>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
  }): Promise<ExplorerAccountQrResponse>;
  getVpnAvailability(
    input: VpnAvailabilityInput,
  ): Promise<VpnAvailabilityResponse>;
  getVpnProfile(input: VpnAvailabilityInput): Promise<VpnProfileResponse>;
  getVpnStatus(input?: VpnStatusInput): Promise<VpnStatusResponse>;
  connectVpn(input: VpnConnectInput): Promise<VpnStatusResponse>;
  disconnectVpn(input: VpnDisconnectInput): Promise<VpnStatusResponse>;
  repairVpn(input: VpnStatusInput): Promise<VpnStatusResponse>;
  listVpnReceipts(input?: VpnStatusInput): Promise<VpnReceiptResponse[]>;
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
    onStatus?: FaucetStatusCallback,
  ): Promise<AccountFaucetResponse>;
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
    fetchImpl: nodeFetch,
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

const normalizeIntegerAmount = (value: string, label: string) => {
  const amount = value.trim();
  if (!/^\d+$/.test(amount)) {
    throw new Error(`${label} must be a whole-number string.`);
  }
  if (/^0+$/.test(amount)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
};

const normalizeDurationBlocks = (value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("durationBlocks must be a positive integer.");
  }
  return value;
};

const normalizeBallotDirectionCode = (
  direction: GovernancePlainBallotInput["direction"],
) => {
  switch (direction) {
    case "Aye":
      return 0;
    case "Nay":
      return 1;
    case "Abstain":
      return 2;
    default:
      throw new Error("direction must be one of Aye, Nay, or Abstain.");
  }
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
  const response = await nodeFetch(endpoint, {
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

const fetchConfidentialAssetPolicy = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
): Promise<ConfidentialAssetPolicyView> => {
  const normalizedAssetDefinitionId = assetDefinitionId.trim();
  if (!normalizedAssetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/confidential/assets/${encodeURIComponent(normalizedAssetDefinitionId)}/transitions`,
  );
  const payload = await fetchJson(endpoint, "Confidential asset policy");
  return normalizeConfidentialAssetPolicyPayload(payload);
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
  const authority = normalizeCompatAccountIdLiteral(
    input.authorityAccountId,
    "authorityAccountId",
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
    return deriveAccountAddressView({ domain, publicKeyHex, networkPrefix });
  },
  derivePublicKey(privateKeyHex) {
    const publicKey = publicKeyFromPrivate(
      hexToBuffer(privateKeyHex, "privateKeyHex"),
    );
    return { publicKeyHex: toHex(publicKey) };
  },
  async registerAccount(input) {
    const client = getClient(input.toriiUrl);
    const domainId = input.domainId.trim();
    if (!domainId) {
      throw new Error("domainId is required.");
    }
    const tx = buildRegisterAccountAndTransferTransaction({
      chainId: input.chainId,
      authority: normalizeCompatAccountIdLiteral(
        input.authorityAccountId,
        "authorityAccountId",
      ),
      account: {
        accountId: normalizeCompatAccountIdLiteral(
          input.accountId,
          "accountId",
        ),
        domainId,
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
    const accountId = normalizeCompatAccountIdLiteral(
      input.accountId,
      "accountId",
    );
    const destinationAccountId = normalizeCompatAccountIdLiteral(
      input.destinationAccountId,
      "destinationAccountId",
    );

    if (input.shielded) {
      const policy = await fetchConfidentialAssetPolicy(
        input.toriiUrl,
        input.assetDefinitionId,
      );
      const effectiveMode = policy.effective_mode || policy.current_mode;
      if (!confidentialModeSupportsShield(effectiveMode)) {
        throw new Error(
          `Shielded transfer is unavailable for ${policy.asset_id}; effective mode is ${effectiveMode}.`,
        );
      }
      if (destinationAccountId !== accountId) {
        throw new Error(
          "Shielding currently supports only your own account. Set destination to the sender account.",
        );
      }
      const normalizedAmount = String(input.quantity).trim();
      if (!isPositiveWholeAmount(normalizedAmount)) {
        throw new Error(
          "Shielded amount must be a whole number greater than zero (base units).",
        );
      }

      const tx = buildShieldTransaction({
        chainId: input.chainId,
        authority: accountId,
        shield: {
          assetDefinitionId: input.assetDefinitionId,
          fromAccountId: accountId,
          amount: normalizedAmount,
          noteCommitment: randomBytes(32),
          encryptedPayload: {
            version: 1,
            ephemeralPublicKey: randomBytes(32),
            nonce: randomBytes(24),
            ciphertext: Buffer.from(
              JSON.stringify({
                accountId,
                amount: normalizedAmount,
                memo: input.metadata ?? null,
                createdAtMs: Date.now(),
              }),
              "utf8",
            ),
          },
        },
        metadata: input.metadata ?? null,
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
    }

    const client = getClient(input.toriiUrl);
    const configuredAssetId = String(input.assetDefinitionId ?? "").trim();
    if (!configuredAssetId) {
      throw new Error("assetDefinitionId is required.");
    }

    let sourceAssetId: string | null = null;
    try {
      sourceAssetId = normalizeAssetId(configuredAssetId, "sourceAssetId");
    } catch {
      sourceAssetId = null;
    }

    if (!sourceAssetId) {
      const assets = await client.listAccountAssets(accountId, {
        limit: 200,
      });
      const items = Array.isArray(assets?.items) ? assets.items : [];
      const exactMatch = items.find(
        (asset) => String(asset.asset_id ?? "").trim() === configuredAssetId,
      );
      const legacyMatch = items.find((asset) =>
        String(asset.asset_id ?? "").startsWith(`${configuredAssetId}##`),
      );
      const containsMatches = items.filter((asset) =>
        String(asset.asset_id ?? "")
          .toLowerCase()
          .includes(configuredAssetId.toLowerCase()),
      );
      const positiveBalanceMatches = items.filter((asset) => {
        const quantity = Number(String(asset.quantity ?? ""));
        return Number.isFinite(quantity) && quantity > 0;
      });

      const selectedAssetId = String(
        exactMatch?.asset_id ??
          legacyMatch?.asset_id ??
          (containsMatches.length === 1 ? containsMatches[0]?.asset_id : "") ??
          (positiveBalanceMatches.length === 1
            ? positiveBalanceMatches[0]?.asset_id
            : ""),
      ).trim();

      if (!selectedAssetId) {
        const available = items
          .map((asset) => String(asset.asset_id ?? "").trim())
          .filter(Boolean)
          .slice(0, 5);
        const availableHint = available.length
          ? ` Available asset IDs: ${available.join(", ")}.`
          : "";
        throw new Error(
          `Unable to resolve source asset ID from configured value "${configuredAssetId}". Set Asset Definition ID to a canonical encoded asset ID (norito:<hex>) for this account.${availableHint}`,
        );
      }
      sourceAssetId = normalizeAssetId(selectedAssetId, "sourceAssetId");
    }

    const tx = buildTransferAssetTransaction({
      chainId: input.chainId,
      authority: accountId,
      sourceAssetHoldingId: sourceAssetId,
      quantity: input.quantity,
      destinationAccountId,
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
  getConfidentialAssetPolicy({ toriiUrl, assetDefinitionId }) {
    return fetchConfidentialAssetPolicy(toriiUrl, assetDefinitionId);
  },
  fetchAccountAssets({ toriiUrl, accountId, limit = 50, offset }) {
    const normalizedBaseUrl = `${normalizeBaseUrl(toriiUrl)}/`;
    const normalizedAccountId = encodeURIComponent(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
    );
    const endpoint = new URL(
      `v1/accounts/${normalizedAccountId}/assets`,
      normalizedBaseUrl,
    );
    endpoint.searchParams.set("limit", String(limit));
    if (offset !== undefined) {
      endpoint.searchParams.set("offset", String(offset));
    }
    return nodeFetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(
          detail ||
            `Account assets request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const payload = (await response.json()) as unknown;
      return normalizeAccountAssetListPayload(payload);
    });
  },
  fetchAccountTransactions({ toriiUrl, accountId, limit = 20, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountTransactions(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
  },
  listAccountPermissions({ toriiUrl, accountId, limit = 200, offset }) {
    const client = getClient(toriiUrl);
    return client.listAccountPermissions(
      normalizeCanonicalAccountIdLiteral(accountId, "accountId"),
      {
        limit,
        offset,
      },
    );
  },
  registerCitizen({ toriiUrl, chainId, accountId, amount, privateKeyHex }) {
    const normalizedAccount = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedAccount,
      privateKeyHex,
      instruction: {
        RegisterCitizen: {
          owner: normalizedAccount,
          amount: normalizeIntegerAmount(amount, "amount"),
        },
      },
    });
  },
  getGovernanceProposal({ toriiUrl, proposalId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceProposalTyped(proposalId);
  },
  getGovernanceReferendum({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceReferendumTyped(referendumId);
  },
  getGovernanceTally({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceTallyTyped(referendumId);
  },
  getGovernanceLocks({ toriiUrl, referendumId }) {
    const client = getClient(toriiUrl);
    return client.getGovernanceLocksTyped(referendumId);
  },
  getGovernanceCouncilCurrent(config) {
    const client = getClient(config.toriiUrl);
    return client.getGovernanceCouncilCurrent();
  },
  submitGovernancePlainBallot({
    toriiUrl,
    chainId,
    accountId,
    referendumId,
    amount,
    durationBlocks,
    direction,
    privateKeyHex,
  }) {
    const normalizedAccount = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    const normalizedReferendumId = referendumId.trim();
    if (!normalizedReferendumId) {
      throw new Error("referendumId is required.");
    }
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      authorityAccountId: normalizedAccount,
      privateKeyHex,
      instruction: {
        CastPlainBallot: {
          referendum_id: normalizedReferendumId,
          owner: normalizedAccount,
          amount: normalizeIntegerAmount(amount, "amount"),
          duration_blocks: normalizeDurationBlocks(durationBlocks),
          direction: normalizeBallotDirectionCode(direction),
        },
      },
    });
  },
  finalizeGovernanceReferendum({ toriiUrl, referendumId, proposalId }) {
    const client = getClient(toriiUrl);
    return client.governanceFinalizeReferendumTyped({
      referendumId,
      proposalId,
    });
  },
  enactGovernanceProposal({ toriiUrl, proposalId }) {
    const client = getClient(toriiUrl);
    return client.governanceEnactProposalTyped({
      proposalId,
    });
  },
  getExplorerMetrics(config) {
    const client = getClient(config.toriiUrl);
    return client.getExplorerMetrics().catch(() => null);
  },
  async getExplorerAccountQr({ toriiUrl, accountId }) {
    const client = getClient(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
    );
    const fetchFallback = async () => {
      const baseUrl = normalizeBaseUrl(toriiUrl);
      const endpoint = `${baseUrl}/v1/explorer/accounts/${encodeURIComponent(normalizedAccountId)}/qr`;
      const response = await nodeFetch(endpoint, {
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
      return await client.getExplorerAccountQr(normalizedAccountId);
    } catch (error) {
      if (!String(error).includes("Digest method not supported")) {
        throw error;
      }
      return fetchFallback();
    }
  },
  getVpnAvailability(input) {
    return ipcRenderer.invoke("vpn:getAvailability", input);
  },
  getVpnProfile(input) {
    return ipcRenderer.invoke("vpn:getProfile", input);
  },
  getVpnStatus(input) {
    return ipcRenderer.invoke("vpn:getStatus", input);
  },
  connectVpn(input) {
    return ipcRenderer.invoke("vpn:connect", input);
  },
  disconnectVpn(input) {
    return ipcRenderer.invoke("vpn:disconnect", input);
  },
  repairVpn(input) {
    return ipcRenderer.invoke("vpn:repair", input);
  },
  listVpnReceipts(input) {
    return ipcRenderer.invoke("vpn:listReceipts", input);
  },
  listOfflineAllowances({
    toriiUrl,
    controllerId,
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
      controllerId: normalizeCompatAccountIdLiteral(
        controllerId,
        "controllerId",
      ),
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
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
    );
    const response = await nodeFetch(`${baseUrl}/v1/accounts/onboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        alias,
        account_id: normalizedAccountId,
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
        formatOnboardingError({
          status: response.status,
          statusText: response.statusText,
          detail,
        }),
      );
    }
    return (await response.json()) as AccountOnboardingResponse;
  },
  async requestFaucetFunds({ toriiUrl, accountId }, onStatus) {
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCompatAccountIdLiteral(
      accountId,
      "accountId",
    );
    return requestFaucetFundsWithPuzzle({
      baseUrl,
      accountId: normalizedAccountId,
      fetchImpl: nodeFetch,
      onStatus,
    });
  },
  async createConnectPreview({ toriiUrl, chainId, node }) {
    const client = getClient(toriiUrl);
    const baseUrl = new URL(normalizeBaseUrl(toriiUrl));
    const nodeHint = node ?? baseUrl.host;
    const { preview, session, tokens } =
      await bootstrapPortableConnectPreviewSession(client, {
        chainId,
        node: nodeHint,
      });
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
  async getNexusPublicLaneValidators({ toriiUrl, laneId }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/validators`,
    );
    const payload = await fetchJson(endpoint, "Public lane validators");
    return normalizePublicLaneValidatorsPayload(payload);
  },
  async getNexusPublicLaneStake({ toriiUrl, laneId, validator }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/stake`,
      {
        validator: validator
          ? normalizeCompatAccountIdLiteral(validator, "validator")
          : undefined,
      },
    );
    const payload = await fetchJson(endpoint, "Public lane stake");
    return normalizePublicLaneStakePayload(payload);
  },
  async getNexusPublicLaneRewards({
    toriiUrl,
    laneId,
    account,
    assetId,
    uptoEpoch,
  }) {
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public_lanes/${normalizeLaneId(laneId)}/rewards/pending`,
      {
        account: normalizeCompatAccountIdLiteral(account, "account"),
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
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
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
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
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
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
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
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
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
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
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
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
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
    const normalizedStakeAccount = normalizeCompatAccountIdLiteral(
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
          validator: normalizeCompatAccountIdLiteral(validator, "validator"),
        },
      },
    });
  },
};

contextBridge.exposeInMainWorld("iroha", api);
